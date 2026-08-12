/**
 * HAI TẦNG RẺ — cây quyết định của tầng B và bảng xác suất của tầng C.
 *
 * Tầng A (LLM) nằm ở `batch.ts`. Tách ra là cố ý: hai tầng ở file này **không
 * bao giờ gọi mạng**, nên chúng chạy được trong bài Monte Carlo, chạy được khi
 * người chơi tắt hẳn LLM (mục 5), và chạy được khi ngân sách tháng đã cạn. Đó
 * cũng chính là lời hứa của mục 5: *"có nút tắt hẳn LLM trong mô phỏng ngầm, chỉ
 * chạy engine — game vẫn phải hoạt động bình thường, chỉ là thế giới kém bất ngờ
 * hơn"*. Nếu tầng B mà cần mạng thì lời hứa ấy không giữ được.
 *
 * TẦNG B TẤT ĐỊNH HOÀN TOÀN: cùng agent, cùng tháng, cùng luật thì ra cùng quyết
 * định, không rút một con xúc sắc nào. Ngẫu nhiên của tầng B nằm ở chỗ khác —
 * ở PHÉP KIỂM khi hành động được phân giải (`resolve.ts`), đúng R6. Trộn ngẫu
 * nhiên vào cả hai chỗ là không ai giải thích được vì sao một chư hầu phản bội.
 *
 * TẦNG C CÓ RÚT XÚC SẮC, vì nó chính là một bảng xác suất. Nhưng nó rút trên
 * dòng `worldtick` riêng, nên số lần rút thay đổi theo số NPC đang sống mà không
 * đẩy lệch một cú tung nào của người chơi (R3).
 */

import type { Rng } from '@/core/rng';
import { actionOf, goalKindOf, tierBFallback, tierBRules, tierCConfig } from './data';
import { activeGoal } from './agents';
import type { Agent, AgentTier } from './types';

export interface Decision {
  npcId: string;
  /** Id trong `data/sim.json → actions.catalogue`. TẬP ĐÓNG. */
  actionId: string;
  targetId: string;
  /** "nho" | "vua" | "lon" — ba chữ, không bao giờ là số (mục 5 B2). */
  magnitude: string;
  goalId: string;
  reasoning: string;
  from: AgentTier;
}

// ---------------------------------------------------------------------------
// Tầng B — cây quyết định
// ---------------------------------------------------------------------------

/** Nguồn lực quy về một con số để so với `minResources` của luật. */
export function resourcePool(agent: Agent): number {
  return agent.resources.money + agent.resources.men * 2 + agent.resources.influence * 1.5;
}

/**
 * Duyệt luật từ trên xuống, luật đầu tiên khớp thì thắng.
 *
 * Thứ tự trong `data/sim.json → tierB.rules` LÀ độ ưu tiên, và đó là chỗ người
 * cân bằng chỉnh hành vi của cả một tầng mà không đụng tới một dòng code nào.
 */
export function decideTierB(agent: Agent, month: number): Decision {
  const goal = activeGoal(agent, month);
  const pool = resourcePool(agent);
  const fallback = tierBFallback();

  if (goal === null) {
    return {
      npcId: agent.npcId,
      actionId: fallback.action,
      targetId: '',
      magnitude: fallback.magnitude,
      goalId: '',
      reasoning: 'chưa có việc gì đáng làm',
      from: 'B',
    };
  }

  for (const rule of tierBRules()) {
    if (rule.goal !== goal.kind) continue;
    if (rule.minResources !== undefined && pool < rule.minResources) continue;
    if (rule.minTrait !== undefined && (agent.personality[rule.minTrait.axis] ?? 50) < rule.minTrait.value) continue;
    if (rule.maxTrait !== undefined && (agent.personality[rule.maxTrait.axis] ?? 50) > rule.maxTrait.value) continue;

    // Luật khớp nhưng hành động không nằm trong danh mục của chính mục tiêu ấy
    // thì bỏ qua: `data.ts` đã kiểm hành động CÓ TỒN TẠI, còn chuyện nó có hợp
    // với mục tiêu này không thì là việc của bảng `goals.kinds[].actions`.
    const allowed = goalKindOf(goal.kind)?.actions ?? [];
    if (!allowed.includes(rule.action)) continue;

    return {
      npcId: agent.npcId,
      actionId: rule.action,
      targetId: goal.target,
      magnitude: rule.magnitude,
      goalId: goal.id,
      reasoning: reasonFor(rule.action, goal.kind),
      from: 'B',
    };
  }

  return {
    npcId: agent.npcId,
    actionId: fallback.action,
    targetId: goal.target,
    magnitude: fallback.magnitude,
    goalId: goal.id,
    reasoning: 'chưa đủ sức, còn chờ',
    from: 'B',
  };
}

/**
 * Một câu giải thích ngắn cho nhật ký.
 *
 * Không phải trang trí: nhật ký mô phỏng (mục 9) phải tua lại được để tìm chỗ
 * hỏng, và một dòng chỉ ghi `am-sat` thì ba tháng sau không ai nói được vì sao.
 */
function reasonFor(actionId: string, goalKind: string): string {
  const action = actionOf(actionId)?.name ?? actionId;
  const goal = goalKindOf(goalKind)?.name ?? goalKind;
  return `${action} — để ${goal}`;
}

// ---------------------------------------------------------------------------
// Tầng C — bảng xác suất
// ---------------------------------------------------------------------------

export interface StatisticalChange {
  agent: Agent;
  /** Mốc vừa chạm, nếu có — tháng sau agent này được kéo lên tầng cao hơn. */
  milestone: string;
  /** Dòng nhật ký, rỗng nghĩa là tháng ấy không có gì xảy ra. */
  line: string;
}

function deathChance(age: number): number {
  for (const row of tierCConfig().monthly.chet) {
    if (age <= row.maxAge) return row.chance;
  }
  return 0.05;
}

/**
 * Một tháng của một NPC tầng C.
 *
 * Rẻ tới mức chạy được cho hàng nghìn người: bốn lần rút xúc sắc, không tra bảng
 * nào ngoài `sim.json`, không đọc state của ai khác. Đó là lý do tầng này tồn
 * tại — mục 2 nói "phần còn lại", và phần còn lại của một châu lục là rất nhiều
 * người.
 *
 * TUỔI CỘNG THEO THÁNG SINH, không cộng mỗi tháng một phần mười hai: một NPC 43,5
 * tuổi là một NPC mà mọi bảng tra tuổi phải làm tròn, và làm tròn ở mười chỗ
 * khác nhau là mười chỗ lệch nhau.
 */
export function advanceTierC(rng: Rng, agent: Agent, month: number): StatisticalChange {
  if (!agent.alive) return { agent, milestone: '', line: '' };

  const config = tierCConfig().monthly;
  let next = agent;
  let milestone = '';
  const lines: string[] = [];

  // Sinh nhật rơi vào tháng suy từ id, nên mỗi người một tháng khác nhau và cả
  // châu lục không cùng già đi trong một tick.
  const birthMonth = (hash(agent.npcId) % 12) + 1;
  if (month % 12 === birthMonth % 12) {
    next = { ...next, age: Math.min(140, next.age + 1) };
  }

  if (rng.next() < deathChance(next.age)) {
    // HUỶ VIỆC ĐANG LÀM NGAY TẠI CHỖ CHẾT, không để `enforceInvariants` dọn hộ.
    // Bất biến "người chết không hành động" của mục 9 là LƯỚI AN TOÀN, không phải
    // chỗ dọn rác thường kỳ: mỗi lần nó phải sửa là một lần engine đã để state
    // trôi vào trạng thái vô lý, và đúng ra phải sửa ở nguồn.
    next = { ...next, alive: false, tier: 'C', pendingActions: [] };
    return {
      agent: next,
      milestone: 'chet',
      line: `${agent.name || agent.npcId} qua đời, thọ ${String(next.age)} tuổi.`,
    };
  }

  const marry = config.cuoi;
  if (next.age >= marry.minAge && next.age <= marry.maxAge && rng.next() < marry.chance) {
    milestone = 'hon-nhan';
    lines.push(`${agent.name || agent.npcId} lấy vợ lấy chồng.`);
    // Của hồi môn là thứ DUY NHẤT tầng C đổi được về nguồn lực, và nó đổi một
    // lần. Cho tầng C sinh tiền đều đặn là mở một cỗ máy in tiền chạy ngầm.
    next = { ...next, resources: { ...next.resources, money: next.resources.money + rng.int(40, 260) } };
  }

  if (rng.next() < config.doiChuc.chance) {
    milestone = milestone === '' ? 'ke-vi' : milestone;
    const gain = rng.int(4, 12);
    next = {
      ...next,
      resources: { ...next.resources, influence: Math.min(100, next.resources.influence + gain) },
    };
    lines.push(`${agent.name || agent.npcId} nhận một chức mới.`);
  }

  if (rng.next() < config.giauLen.chance) {
    next = {
      ...next,
      resources: { ...next.resources, money: Math.round(next.resources.money * config.giauLen.factor) + 10 },
    };
  } else if (rng.next() < config.ngheoDi.chance) {
    next = {
      ...next,
      resources: { ...next.resources, money: Math.round(next.resources.money * config.ngheoDi.factor) },
    };
  }

  if (milestone !== '') next = { ...next, wokeBy: milestone };

  return { agent: next, milestone, line: lines.join(' ') };
}

function hash(text: string): number {
  let value = 0;
  for (let index = 0; index < text.length; index++) {
    value = (Math.imul(value, 31) + text.charCodeAt(index)) | 0;
  }
  return Math.abs(value);
}
