/**
 * PHÂN GIẢI QUYẾT ĐỊNH — Phần 15 mục 5, bước B5.
 *
 * *"Engine phân giải mọi quyết định: tung xúc sắc qua Phần 5, tính hệ quả, cập
 * nhật state qua MVU của Phần 2."*
 *
 * Đây là chỗ R1 khép lại ở tầng mô phỏng. Ba tầng agent chỉ sinh ra Ý ĐỊNH —
 * tầng A bằng LLM, tầng B bằng cây quyết định, tầng C không sinh ý định nào. Cả
 * ba đi qua đúng một cửa ở file này, và cửa ấy tung xúc sắc trước khi biết kết
 * quả, đúng như một lượt của người chơi.
 *
 * HỆ 3d6 VÀ MIỀN `admin.*` (Phần 5 mục 2, phân miền cứng): mô phỏng ngầm là
 * NĂNG LỰC DÀI HẠN — quản trị, hậu cần, mưu kế — chứ không phải kỹ năng cá nhân
 * hay đối kháng nhanh. Một cuộc vây hãm mà agent quyết định tiến hành sẽ được
 * mô phỏng thật ở Phần 11 nếu người chơi có mặt; con xúc sắc ở đây chỉ trả lời
 * "ông ta có tổ chức nổi việc ấy không", không trả lời "ai thắng".
 *
 * VÀ MỌI HÀNH ĐỘNG ĐỀU CÓ XÁC SUẤT (R6). Không có nhánh nào ở đây trả về thành
 * công chắc chắn, kể cả `cho-thoi-co` — chờ thời cơ cũng có thể chờ hỏng.
 */

import type { GameDate } from '@/core/clock';
import type { Rng } from '@/core/rng';
import type { CheckResult } from '@/core/turn';
import { runCheck } from '@/systems/check';
import { actionBand, actionOf, magnitudeFactor } from './data';
import { advanceGoal, wake } from './agents';
import type { Decision } from './decide';
import type { Agent, WorldEvent } from './types';

/** Miền của mọi phép kiểm mô phỏng ngầm. Một miền duy nhất là cố ý. */
export const SIM_DOMAIN = 'admin.mo-phong';

export interface ResolveInput {
  agent: Agent;
  decision: Decision;
  date: GameDate;
  month: number;
  /** Số thứ tự trong tháng, để id biến cố không trùng. */
  sequence: number;
}

export interface ResolveOutcome {
  agent: Agent;
  check: CheckResult;
  /** Biến cố sinh ra, hoặc `null` khi việc ấy không ai thấy. */
  event: WorldEvent | null;
  line: string;
  /** Mốc vừa chạm — tháng sau agent được kéo lên tầng cao hơn. */
  milestone: string;
}

/**
 * Năng lực gốc của một agent trong hệ 3d6.
 *
 * Tiếng nói nặng hơn người theo: mô phỏng ngầm đo khả năng TỔ CHỨC một việc, mà
 * một bá tước có ba trăm quân nhưng không ai nghe lời thì không tổ chức nổi gì.
 * Người theo vẫn đếm, chỉ đếm nhẹ hơn.
 */
export function baseFor(agent: Agent): number {
  return Math.round(agent.resources.influence * 0.7 + agent.resources.men * 0.3);
}

const TIER_PROGRESS: Readonly<Record<CheckResult['tier'], number>> = {
  critFail: -0.5,
  fail: 0,
  costlySuccess: 0.6,
  success: 1,
  critSuccess: 1.4,
};

/** Cấp kết quả nào đáng loan ra thành một biến cố. */
function worthTelling(tier: CheckResult['tier'], noisy: boolean): boolean {
  if (tier === 'critFail' || tier === 'critSuccess') return true;
  return noisy && tier !== 'fail';
}

export function resolveDecision(rng: Rng, input: ResolveInput): ResolveOutcome {
  const { agent, decision, date, month } = input;
  const action = actionOf(decision.actionId);

  if (action === null) {
    // `batch.ts` và `decide.ts` đã lọc, nên nhánh này chỉ tới được khi data đổi
    // giữa chừng. Trả về một phép kiểm rỗng thì `CheckResult` mất nghĩa, nên
    // chạy hẳn một phép kiểm "chờ thời cơ" — vẫn đúng R6, và vẫn ghi được log.
    throw new Error(`hành động "${decision.actionId}" không có trong danh mục`);
  }

  const factor = magnitudeFactor(decision.magnitude);
  const cost = Math.round(action.cost * factor);

  // KHÔNG ĐỦ TIỀN THÌ VẪN TUNG, chỉ tung ở bậc khó hơn một nấc về mặt năng lực:
  // lịch sử đầy những người khởi binh mà không đủ tiền trả lính. Chặn cứng ở đây
  // là biến mọi agent thành một kế toán không bao giờ liều.
  const broke = agent.resources.money < cost;

  const run = runCheck(rng, {
    id: `sim.${action.id}`,
    system: '3d6',
    domain: SIM_DOMAIN,
    difficulty: actionBand(action),
    base: baseFor(agent) - (broke ? 12 : 0),
    actor: agent.npcId,
    tags: broke ? ['thieu-tien'] : [],
    state: null,
  });

  const check = run.result;
  const delta = Math.round(action.progress * factor * TIER_PROGRESS[check.tier]);

  // Trả tiền dù thắng hay thua: chi phí là thứ đã bỏ ra TRƯỚC khi biết kết quả,
  // và hoàn lại khi hỏng là xoá luôn rủi ro của mọi quyết định.
  const spent = check.tier === 'costlySuccess' ? Math.round(cost * 1.4) : cost;
  let next: Agent = {
    ...agent,
    resources: { ...agent.resources, money: Math.round(agent.resources.money - spent) },
    lastActedTick: month,
  };

  let milestone = '';
  const lines: string[] = [];

  if (decision.goalId !== '') {
    const progress = advanceGoal(next, decision.goalId, delta, month);
    next = { ...next, goals: progress.goals };
    for (const done of progress.completed) {
      lines.push(`${agent.name || agent.npcId} đạt được điều mình muốn: ${done.kind}.`);
      milestone = milestoneOf(done.kind);
    }
    for (const gone of progress.expired) {
      lines.push(`${agent.name || agent.npcId} bỏ cuộc: ${gone.kind}.`);
    }
  }

  if (milestone !== '') next = wake(next, milestone);

  const event = worthTelling(check.tier, action.noisy)
    ? buildEvent({ agent: next, decision, action: action.id, check, date, sequence: input.sequence, factor })
    : null;

  lines.unshift(
    `${agent.name || agent.npcId}: ${action.name} (${decision.magnitude}) → ${check.tier}${
      decision.reasoning === '' ? '' : ` — ${decision.reasoning}`
    }`,
  );

  return { agent: next, check, event, line: lines.join(' '), milestone };
}

function milestoneOf(goalKind: string): string {
  switch (goalKind) {
    case 'leo-tuoc-vi':
      return 'ke-vi';
    case 'len-hong-y':
      return 'len-hong-y';
    case 'cuoi-mot-nguoi':
      return 'hon-nhan';
    default:
      return '';
  }
}

interface EventInput {
  agent: Agent;
  decision: Decision;
  action: string;
  check: CheckResult;
  date: GameDate;
  sequence: number;
  factor: number;
}

/**
 * Dựng biến cố từ một hành động vừa phân giải.
 *
 * `amount` do ENGINE tính, không do LLM nói: nó là hệ quả của mức độ đã chọn và
 * của cấp kết quả vừa tung. Đây là con số mà tin tức sẽ thổi phồng lên gấp ba
 * trên đường đi (mục 6) — và nó chỉ thổi phồng được nếu có một con số thật để
 * mà thổi.
 */
function buildEvent(input: EventInput): WorldEvent {
  const action = actionOf(input.action);
  const kind = action?.eventKind ?? 'khac';
  const base = action?.importance ?? 1;

  // Việc lớn thì loan xa hơn, việc hỏng thảm cũng thế: một cuộc vây hãm thất bại
  // ê chề là chuyện cả châu lục kể lại, không phải một ghi chú nội bộ.
  const bump = input.check.tier === 'critSuccess' || input.check.tier === 'critFail' ? 1 : 0;
  // TRẦN 5 CHỈ MỞ CHO NHỮNG VIỆC VỐN ĐÃ LỚN. Mức 5 CHẶN MÀN HÌNH (mục 7), nên
  // một đám cưới của một nhà nhỏ mà tung được critSuccess với mức độ "lớn" sẽ
  // cộng dồn tới 5 và ập vào giữa lúc người chơi đang đọc truyện. Chỉ vây hãm,
  // ám sát và phản loạn — những việc khai sẵn mức 4 — mới với tới được mức ấy.
  const ceiling = base >= 4 ? 5 : 4;
  const importance = Math.max(1, Math.min(ceiling, base + bump + (input.factor >= 1.5 ? 1 : 0)));

  return {
    id: `sim_${String(input.date.year)}-${String(input.date.month)}_${input.agent.npcId}_${String(input.sequence)}`,
    kind,
    scope: scopeFor(importance),
    importance,
    requiresDecision: false,
    regionId: input.agent.regionId,
    occurredAt: input.date,
    actorId: input.agent.npcId,
    targetId: input.decision.targetId,
    amount: amountFor(kind, input.factor, input.check),
    text: '',
    headline: '',
    effects: [],
  };
}

function scopeFor(importance: number): WorldEvent['scope'] {
  if (importance >= 5) return 'the-gioi';
  if (importance >= 4) return 'quoc-gia';
  if (importance >= 3) return 'vung';
  if (importance >= 2) return 'thanh-tri';
  return 'ca-nhan';
}

/**
 * Quy mô con người của một biến cố. 0 nghĩa là chuyện này không đếm bằng người.
 *
 * NHIỄU LẤY TỪ CHÍNH CON XÚC SẮC VỪA TUNG, không rút thêm. Không có nó thì mọi
 * cuộc nổi loạn "vừa" trong sáu mươi năm đều có đúng 2.400 người, và người chơi
 * học được rằng con số ấy là một hằng số chứ không phải một tin tức — lúc đó cả
 * cơ chế thổi phồng của mục 6 mất chỗ bám, vì không có gì để mà thổi.
 *
 * Rút thêm một con xúc sắc ở đây cũng được, nhưng nó sẽ đổi số lần rút của dòng
 * `worldtick` theo loại biến cố, và R3 sẽ khó soi hơn mà chẳng đổi lấy gì.
 */
function amountFor(kind: string, factor: number, check: CheckResult): number {
  const spread = check.raw.reduce((sum, die) => sum + die, 0);
  const jitter = 0.75 + ((spread % 11) / 10) * 0.5;
  const scale =
    factor * jitter * (check.tier === 'critSuccess' ? 1.5 : check.tier === 'critFail' ? 1.2 : 1);
  switch (kind) {
    case 'tran-danh':
      return Math.round(600 * scale);
    case 'vay-ham':
      return Math.round(1800 * scale);
    case 'phan-loan':
      return Math.round(2400 * scale);
    case 'dich-benh':
      return Math.round(3000 * scale);
    case 'di-cu':
      return Math.round(1500 * scale);
    default:
      return 0;
  }
}
