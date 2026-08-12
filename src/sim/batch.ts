/**
 * TẦNG A — GỘP NHIỀU AGENT VÀO MỘT REQUEST (Phần 15 mục 5, bước B2).
 *
 * *"Không gọi từng NPC một."* Câu ấy là cả lý do file này tồn tại. Mười hai NPC
 * gọi riêng là mười hai lần trả tiền cho cùng một đoạn mô tả bối cảnh, và mười
 * hai lần chờ mạng trong một lần bấm nút của người chơi.
 *
 * BA HÀNG RÀO GIỮA LLM VÀ STATE, và chúng xếp chồng chứ không thay nhau:
 *
 *  1. **LLM không được trả con số.** `magnitude` chỉ có ba chữ, và
 *     `data.magnitudeFactor` là cửa duy nhất đổi chữ thành số.
 *  2. **Hành động là tập đóng.** Quyết định trỏ ra ngoài danh mục của chính mục
 *     tiêu ấy thì bị vứt, và agent rơi về cây quyết định tầng B của tháng ấy.
 *  3. **Mọi thay đổi vẫn đi qua MVU và Zod** (mục 1). Hai hàng rào trên là để
 *     lỗi lộ ra sớm và lộ ra ở chỗ đọc được, không phải để thay hàng rào thứ ba.
 *
 * VÀ PROMPT KỂ CHO LLM NGHE **CÁI AGENT BIẾT**, không phải sự thật (mục 3). Một
 * bá tước ở biên cương được mô tả bằng đúng những gì đã tới tai ông ta, kể cả
 * những tin đã bị bóp méo trên đường. Đưa state thật vào đây là xoá sạch cơ chế
 * đặc trưng của cả Phần 15 chỉ bằng một dòng tiện tay.
 */

import { z } from 'zod';
import type { ConnCfg, LLMProvider } from '@/ai/provider';
import { goalKindOf, magnitudeWords, newsPrompts } from './data';
import { activeGoal } from './agents';
import type { Decision } from './decide';
import type { Agent } from './types';

export interface BatchContext {
  /** Năm và tháng trong game, để LLM biết mùa và biết đang là thời nào. */
  year: number;
  month: number;
  /** Tình hình chung — bản tóm tắt của `exportForPart15` (Phần 14 mục 6). */
  situation: string;
  /** Biến cố tháng trước, đã rút gọn. Mới nhất đứng đầu. */
  recent: readonly string[];
}

export interface BatchDeps {
  provider: LLMProvider;
  cfg: ConnCfg;
  signal?: AbortSignal;
}

export interface BatchResult {
  decisions: Decision[];
  /** Quyết định bị vứt và vì sao. Tab Debug đọc chỗ này, không nuốt (R4). */
  rejected: string[];
  usage: { in: number; out: number };
  /** Lỗi mạng hoặc lỗi parse. Khác `null` là cả lô rơi xuống tầng B. */
  error: string | null;
}

// ---------------------------------------------------------------------------
// Dựng prompt
// ---------------------------------------------------------------------------

function describeAgent(agent: Agent, month: number): string {
  const goal = activeGoal(agent, month);
  const spec = goal === null ? null : goalKindOf(goal.kind);
  const traits = Object.entries(agent.personality)
    .map(([axis, value]) => `${axis} ${String(value)}`)
    .join(', ');

  const lines = [
    `- npcId: ${agent.npcId}`,
    `  tên: ${agent.name || agent.npcId}`,
    `  tuổi: ${String(agent.age)}`,
    `  đang ở: ${agent.regionId}`,
    `  tính cách: ${traits}`,
    `  nguồn lực: tiền ${String(Math.round(agent.resources.money))}, người theo ${String(agent.resources.men)}/100, tiếng nói ${String(agent.resources.influence)}/100`,
  ];

  if (goal !== null && spec !== null) {
    lines.push(`  đang muốn: ${spec.name}${goal.target === '' ? '' : ` (nhắm vào ${goal.target})`}`);
    lines.push(`  đã đi được: ${String(Math.round(goal.progress))}/100`);
    lines.push(`  chỉ được chọn trong: ${spec.actions.join(', ')}`);
  } else {
    lines.push('  đang muốn: chưa có mục tiêu rõ ràng');
    lines.push('  chỉ được chọn trong: cho-thoi-co');
  }

  // ĐÂY LÀ DÒNG QUAN TRỌNG NHẤT CỦA CẢ PROMPT. Không có nó thì mọi agent đều
  // toàn tri, và mục 3 mất nghĩa.
  lines.push(
    agent.knowledge.length === 0
      ? '  người này chưa nghe được tin gì đáng kể'
      : `  người này TIN RẰNG: ${agent.knowledge.slice(0, 8).join('; ')}`,
  );

  return lines.join('\n');
}

export function buildBatchPrompt(agents: readonly Agent[], context: BatchContext): string {
  const parts = [
    `Tháng ${String(context.month)} năm ${String(context.year)}.`,
    context.situation === '' ? '' : `Tình hình chung: ${context.situation}`,
    context.recent.length === 0 ? '' : `Chuyện mới xảy ra:\n${context.recent.map((line) => `- ${line}`).join('\n')}`,
    '',
    'NHỮNG NGƯỜI CẦN RA QUYẾT ĐỊNH THÁNG NÀY:',
    agents.map((agent) => describeAgent(agent, context.year * 12 + context.month)).join('\n'),
    '',
    `Mỗi người ĐÚNG MỘT quyết định. \`magnitude\` chỉ được là một trong: ${magnitudeWords().join(', ')}.`,
  ];
  return parts.filter((part) => part !== '').join('\n');
}

// ---------------------------------------------------------------------------
// Đọc câu trả lời
// ---------------------------------------------------------------------------

const replySchema = z.array(
  z.object({
    npcId: z.string().min(1),
    decision: z.string().min(1),
    reasoning: z.string().default(''),
    targetId: z.string().default(''),
    magnitude: z.string().default('vua'),
  }),
);

/**
 * Bóc mảng JSON ra khỏi bất cứ thứ gì model bọc quanh nó.
 *
 * Model rẻ hay kèm một câu dẫn hoặc một khối ```json, và từ chối cả lô vì một
 * dấu backtick là trả tiền cho một request rồi vứt đi. Nhưng chỉ bóc, KHÔNG sửa
 * nội dung: một JSON hỏng bên trong vẫn phải hỏng, vì đó là dấu hiệu model đang
 * bịa cấu trúc chứ không phải nó lỡ tay.
 */
export function extractJsonArray(raw: string): string {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(raw);
  const body = fenced?.[1] ?? raw;
  const start = body.indexOf('[');
  const end = body.lastIndexOf(']');
  if (start === -1 || end === -1 || end < start) return body.trim();
  return body.slice(start, end + 1);
}

export interface ParseInput {
  raw: string;
  agents: readonly Agent[];
  month: number;
}

/**
 * Đổi câu trả lời thành `Decision[]`, và VỨT mọi thứ không qua được hai hàng rào.
 *
 * Vứt chứ không sửa: một quyết định "chiếm thành trì bằng cách cưới" mà engine
 * tự nắn thành một hành động hợp lệ là engine tự bịa ý định thay cho LLM, và
 * người đọc nhật ký sẽ thấy một câu chuyện chưa ai kể.
 */
export function parseBatchReply(input: ParseInput): { decisions: Decision[]; rejected: string[] } {
  const rejected: string[] = [];
  const decisions: Decision[] = [];

  let data: unknown;
  try {
    data = JSON.parse(extractJsonArray(input.raw));
  } catch (error) {
    return { decisions, rejected: [`không đọc được JSON: ${String(error)}`] };
  }

  const parsed = replySchema.safeParse(data);
  if (!parsed.success) {
    return { decisions, rejected: [`sai schema: ${parsed.error.issues[0]?.message ?? 'không rõ'}`] };
  }

  const byId = new Map(input.agents.map((agent) => [agent.npcId, agent]));
  const words = new Set(magnitudeWords());
  const seen = new Set<string>();

  for (const row of parsed.data) {
    const agent = byId.get(row.npcId);
    if (agent === undefined) {
      rejected.push(`"${row.npcId}" không nằm trong lô này`);
      continue;
    }
    if (seen.has(row.npcId)) {
      rejected.push(`"${row.npcId}" có hai quyết định — chỉ nhận cái đầu`);
      continue;
    }

    const goal = activeGoal(agent, input.month);
    const allowed = goal === null ? ['cho-thoi-co'] : (goalKindOf(goal.kind)?.actions ?? []);
    if (!allowed.includes(row.decision)) {
      rejected.push(`"${row.npcId}" chọn "${row.decision}" ngoài danh mục cho phép`);
      continue;
    }
    if (!words.has(row.magnitude)) {
      rejected.push(`"${row.npcId}" khai mức độ "${row.magnitude}" không phải ba chữ cho phép`);
      continue;
    }

    seen.add(row.npcId);
    decisions.push({
      npcId: row.npcId,
      actionId: row.decision,
      targetId: row.targetId === '' ? (goal?.target ?? '') : row.targetId,
      magnitude: row.magnitude,
      goalId: goal?.id ?? '',
      reasoning: row.reasoning,
      from: 'A',
    });
  }

  return { decisions, rejected };
}

// ---------------------------------------------------------------------------
// Gọi
// ---------------------------------------------------------------------------

/**
 * MỘT request cho cả lô.
 *
 * Không ném. Mạng hỏng, proxy hết hạn, model trả rác — mọi thứ đều thành `error`
 * và người gọi cho cả lô rơi xuống tầng B. Một thế giới kém bất ngờ hơn vẫn là
 * một thế giới đang chạy; một exception ở bước 8 là mất lượt của người chơi (R4).
 */
export async function askTierA(
  deps: BatchDeps,
  agents: readonly Agent[],
  context: BatchContext,
): Promise<BatchResult> {
  if (agents.length === 0) {
    return { decisions: [], rejected: [], usage: { in: 0, out: 0 }, error: null };
  }

  const prompts = newsPrompts();
  try {
    const response = await deps.provider.stream(
      {
        system: prompts.systemAgents,
        messages: [{ role: 'user', content: buildBatchPrompt(agents, context) }],
        maxTokens: prompts.maxTokensAgents,
        meta: { profile: 'worldtick' },
        ...(deps.signal === undefined ? {} : { signal: deps.signal }),
      },
      deps.cfg,
      () => {},
    );

    const parsed = parseBatchReply({
      raw: response.text,
      agents,
      month: context.year * 12 + context.month,
    });

    return {
      decisions: parsed.decisions,
      rejected: parsed.rejected,
      usage: response.usage ?? { in: 0, out: 0 },
      error: null,
    };
  } catch (error) {
    return {
      decisions: [],
      rejected: [],
      usage: { in: 0, out: 0 },
      error: `gọi mô phỏng ngầm hỏng: ${String(error)}`,
    };
  }
}
