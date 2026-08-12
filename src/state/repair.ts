/**
 * VÒNG SỬA LỖI TẦNG 1 — nhờ AI tự sửa, tối đa 2 lần (Phần 2 mục 6).
 *
 * Request phải NGẮN. KHÔNG kèm lại toàn bộ context: lượt vừa rồi đã trả tiền
 * cho ngữ cảnh đó một lần, gửi lại chỉ để sửa vài dòng biến là tốn tiền vô ích.
 *
 * Chỉ gồm bốn thứ: op nào fail, vì sao fail (nói cụ thể), giá trị THẬT hiện
 * tại của các path liên quan, và trích đoạn schema hợp lệ.
 *
 * Phần narrative của lượt đó GIỮ NGUYÊN — không sinh lại. Đây là điểm mấu chốt:
 * người chơi đã đọc đoạn văn rồi, sửa biến không được làm đổi truyện.
 */

import type { ConnCfg, LLMProvider } from '@/ai/provider';
import { applyPatch, type ApplyResult, type OpFailure, type PatchOp } from './mvu';
import { parseUpdateVariables } from './mvu-parse';
import { permissionFor, readPath, schemaAtPath, slices, type GameState } from './slices';

export const MAX_REPAIR_ATTEMPTS = 2;

/** Cách gọi AI. Tách ra để test không cần proxy thật. */
export type RepairCaller = (prompt: string) => Promise<string>;

export interface RepairAttempt {
  attempt: number;
  prompt: string;
  response: string;
  ops: PatchOp[];
  result: ApplyResult;
}

export interface RepairOutcome {
  /** Đã sửa xong và áp được. */
  repaired: boolean;
  attempts: RepairAttempt[];
  /** Kết quả cuối cùng — dùng cái này để quyết định có mở tầng 2 không. */
  final: ApplyResult;
  /** Lô op cuối cùng đã thử. */
  ops: PatchOp[];
}

function schemaLine(path: string): string {
  const schema = schemaAtPath(slices.rootSchema(), path);
  if (schema === null) return `${path}: KHÔNG có trong schema`;

  const parsed = schema.safeParse(undefined);
  const optional = parsed.success ? ' (có thể bỏ trống)' : '';
  const def = (schema as unknown as { def?: { type?: string } }).def;
  return `${path}: ${def?.type ?? '?'}${optional} · quyền ghi: ${permissionFor(path)}`;
}

/**
 * Dựng lời nhắc sửa lỗi.
 *
 * Cố ý viết bằng tiếng Việt và nói thẳng vào việc — thông báo lỗi mơ hồ thì AI
 * sửa mò, và mỗi lần sửa mò là một lượt gọi nữa.
 */
export function buildRepairPrompt(failures: readonly OpFailure[], state: GameState): string {
  const paths = [...new Set(failures.map((failure) => failure.op.path))];

  const lines: string[] = [
    'Khối cập nhật biến bạn vừa gửi bị engine từ chối. Hãy sửa lại và gửi lại.',
    '',
    'CÁC OP BỊ TỪ CHỐI:',
  ];

  for (const failure of failures) {
    const { op } = failure;
    const call =
      op.op === 'delete'
        ? `_.delete('${op.path}')`
        : `_.${op.op}('${op.path}', ${JSON.stringify(op.from ?? null)}, ${JSON.stringify(op.to ?? null)})`;
    lines.push(`- ${call}`);
    lines.push(`  LỖI (${failure.step}): ${failure.message}`);
  }

  lines.push('', 'GIÁ TRỊ THẬT ĐANG CÓ TRONG STATE:');
  for (const path of paths) {
    const value = readPath(state, path);
    lines.push(`- ${path} = ${value === undefined ? 'chưa có' : JSON.stringify(value)}`);
  }

  lines.push('', 'SCHEMA HỢP LỆ CỦA CÁC PATH TRÊN:');
  for (const path of paths) lines.push(`- ${schemaLine(path)}`);

  lines.push(
    '',
    'QUY TẮC:',
    "- Path thuộc quyền 'engine' thì bạn KHÔNG được ghi. Muốn nó thay đổi, hãy mô tả trong truyện; engine sẽ tự tính.",
    "- Path thuộc quyền 'locked' thì không ai ghi được.",
    '- Mỗi op phải kèm lý do.',
    '- Với _.set, tham số thứ hai phải là giá trị cũ ĐÚNG như trong state ở trên.',
    '',
    'CHỈ trả lại khối <UpdateVariable> đã sửa. KHÔNG viết lại truyện, KHÔNG giải thích thêm.',
  );

  return lines.join('\n');
}

/**
 * Chạy vòng sửa lỗi tầng 1.
 * Trả về ngay khi áp được, hoặc sau `maxAttempts` lần thử.
 */
export async function repairPatch(params: {
  state: GameState;
  failures: readonly OpFailure[];
  ask: RepairCaller;
  maxAttempts?: number;
  transformOps?: (state: GameState, ops: readonly PatchOp[]) => PatchOp[];
}): Promise<RepairOutcome> {
  const maxAttempts = params.maxAttempts ?? MAX_REPAIR_ATTEMPTS;
  const attempts: RepairAttempt[] = [];

  let failures = [...params.failures];
  let lastResult: ApplyResult = {
    applied: false,
    next: null,
    failures,
    changedPaths: [],
  };
  let lastOps: PatchOp[] = failures.map((failure) => failure.op);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const prompt = buildRepairPrompt(failures, params.state);

    let response: string;
    try {
      response = await params.ask(prompt);
    } catch (error) {
      // Gọi AI hỏng là kết quả CUỐI của vòng sửa lỗi — không được nuốt nó rồi
      // trả về lỗi kiểm duyệt cũ, vì người chơi sẽ đi sửa nhầm chỗ.
      const failed: ApplyResult = {
        applied: false,
        next: null,
        failures: failures.map((failure) => ({
          ...failure,
          message: `${failure.message} (lần sửa ${attempt} gọi AI hỏng: ${String(error)})`,
        })),
        changedPaths: [],
      };
      attempts.push({ attempt, prompt, response: '', ops: [], result: failed });
      lastResult = failed;
      break;
    }

    const parsed = parseUpdateVariables(response);
    const ops = params.transformOps?.(params.state, parsed.ops) ?? parsed.ops;
    lastOps = ops;

    if (ops.length === 0) {
      const noOps: ApplyResult = {
        applied: false,
        next: null,
        failures: failures.map((failure) => ({
          ...failure,
          message: `${failure.message} (lần sửa ${attempt}: AI không trả về op nào đọc được)`,
        })),
        changedPaths: [],
      };
      attempts.push({ attempt, prompt, response, ops, result: noOps });
      lastResult = noOps;
      continue;
    }

    const result = applyPatch(params.state, ops, { actor: 'ai' });
    attempts.push({ attempt, prompt, response, ops, result });
    lastResult = result;

    if (result.applied) {
      return { repaired: true, attempts, final: result, ops };
    }
    failures = [...result.failures];
  }

  return { repaired: false, attempts, final: lastResult, ops: lastOps };
}

/**
 * Nối vòng sửa lỗi vào một `LLMProvider` thật của Phần 1.
 *
 * `profile` chỉ để tab Debug ghi đúng nhãn và tính đúng tiền: vòng này thường
 * chạy trên hồ sơ `variables` với một model rẻ hơn hẳn model viết truyện, và
 * cộng tiền của nó vào giá của hồ sơ `main` là báo sai chi phí mỗi lượt.
 */
export function providerCaller(
  provider: LLMProvider,
  cfg: ConnCfg,
  maxTokens = 1024,
  profile: string = 'main',
): RepairCaller {
  return async (prompt: string): Promise<string> => {
    const response = await provider.stream(
      {
        system:
          'Bạn đang sửa một khối cập nhật biến bị từ chối. Chỉ trả lại khối <UpdateVariable>, không viết gì khác.',
        messages: [{ role: 'user', content: prompt }],
        maxTokens,
        meta: { profile },
      },
      cfg,
      () => {},
    );
    return response.text;
  };
}
