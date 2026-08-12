/**
 * BA ĐỘ PHÂN GIẢI NPC — Phần 15 mục 2 và 3.
 *
 * MỌI NPC ĐỀU **CÓ** MỤC TIÊU lưu trong state. Cái khác nhau giữa ba tầng không
 * phải "ai có mục tiêu" mà là "ai được suy nghĩ bằng gì":
 *
 *   A — LLM      tối đa 8–12 người, được nghĩ thật, ra quyết định bất ngờ
 *   B — LUẬT     vài chục tới vài trăm, cây quyết định tất định, rẻ và hợp lý
 *   C — THỐNG KÊ phần còn lại, chỉ già đi / cưới / chết / đổi chức / giàu nghèo
 *
 * TẦNG TÍNH LẠI MỖI THÁNG, và **người chơi không bao giờ thấy sự chuyển tầng
 * này**. Đó là ràng buộc thiết kế chứ không phải một chi tiết kỹ thuật: nếu một
 * NPC đổi hẳn cách cư xử đúng lúc người chơi cưỡi ngựa tới gần, thì thế giới lộ
 * ra là một sân khấu chỉ dựng khi có khán giả.
 *
 * Cách giữ lời hứa ấy ở đây: tầng KHÔNG đổi mục tiêu, không đổi tính cách, không
 * đổi nguồn lực. Nó chỉ đổi cái đầu nào tính ra hành động tháng này. Một bá tước
 * đang gom quân để chiếm một toà thành thì vẫn gom quân ấy dù đang ở tầng nào —
 * chỉ khác là ở tầng A ông ta có thể nghĩ ra một cách gom quân mà không ai lường
 * trước, còn ở tầng C thì ông ta gom đều đều theo bảng.
 *
 * VÀ MỖI AGENT CÓ TRI THỨC RIÊNG (mục 3). `knowledge` của agent KHÁC
 * `knowledge.known` của người chơi và khác state thật. Đây là nguồn sinh ra sai
 * lầm, hiểu lầm, và kịch tính — mọi hàm ở file này đọc `agent.knowledge`, không
 * hàm nào đọc thẳng sự thật để "cho agent biết".
 */

import type { Rng } from '@/core/rng';
import { crowKm } from './map';
import { goalKindOf, goalKinds, personalityAxes, tierConfig } from './data';
import type { Agent, AgentGoal, AgentTier } from './types';

// ---------------------------------------------------------------------------
// Sinh agent
// ---------------------------------------------------------------------------

export interface AgentSeed {
  npcId: string;
  name: string;
  regionId: string;
  powerId: string;
  age: number;
  /** Sức nặng của nhân vật này trong thế giới, 0–100. Quyết định nguồn lực. */
  weight: number;
  /** Mục tiêu ép sẵn. Bỏ trống thì bốc theo tính cách. */
  goalKinds?: readonly string[];
  goalTarget?: string;
}

/**
 * Dựng một agent từ hạt giống.
 *
 * Tính cách bốc trước, mục tiêu bốc sau và BỐC THEO TÍNH CÁCH: một người hung
 * hãn nhắm tới một toà thành, một người mộ đạo nhắm tới mũ hồng y. Bốc độc lập
 * thì sáu chục năm sau châu Âu sẽ đầy những ông trùm nhà thờ hiếu chiến và những
 * lãnh chúa chỉ muốn đi hành hương, và không ai chỉ ra được chỗ sai.
 */
export function createAgent(rng: Rng, seed: AgentSeed): Agent {
  const personality: Record<string, number> = {};
  for (const axis of personalityAxes()) personality[axis] = rng.int(10, 90);

  const kinds = seed.goalKinds ?? [pickGoalKind(rng, personality)];
  const goals: AgentGoal[] = kinds.map((kind, index) => {
    const spec = goalKindOf(kind);
    return {
      id: `goal_${seed.npcId}_${String(index)}`,
      kind,
      target: seed.goalTarget ?? '',
      priority: Math.max(0, Math.min(100, (spec?.priorityBase ?? 50) + rng.int(-12, 12))),
      progress: 0,
    };
  });

  return {
    npcId: seed.npcId,
    name: seed.name,
    // Ai cũng bắt đầu ở tầng C. Tầng thật tính ở `retier` ngay tick sâu đầu tiên,
    // và để `createAgent` tự quyết là hai chỗ cùng quyết một việc.
    tier: 'C',
    regionId: seed.regionId,
    powerId: seed.powerId,
    age: seed.age,
    alive: true,
    goals,
    personality,
    resources: {
      money: Math.round(seed.weight * 6 + rng.int(0, 120)),
      men: Math.max(0, Math.min(100, Math.round(seed.weight * 0.8 + rng.int(-10, 10)))),
      influence: Math.max(0, Math.min(100, Math.round(seed.weight * 0.9 + rng.int(-15, 15)))),
    },
    relationships: [],
    knowledge: [],
    pendingActions: [],
    lastActedTick: 0,
    wokeBy: '',
  };
}

function pickGoalKind(rng: Rng, personality: Record<string, number>): string {
  const kinds = goalKinds();
  const weights = kinds.map((kind) => {
    switch (kind.id) {
      case 'chiem-thanh-tri':
        return 20 + (personality['hung-hang'] ?? 50) * 0.6;
      case 'tra-thu':
        return 10 + (personality['hung-hang'] ?? 50) * 0.4;
      case 'leo-tuoc-vi':
        return 25 + (100 - (personality['trung-thanh'] ?? 50)) * 0.4;
      case 'tich-tien':
        return 15 + (personality['tham-lam'] ?? 50) * 0.7;
      case 'len-hong-y':
        return 5 + (personality['mo-dao'] ?? 50) * 0.8;
      case 'che-giau-bi-mat':
        return 12 + (personality['than-trong'] ?? 50) * 0.4;
      case 'bao-ve-con-cai':
        return 22;
      case 'cuoi-mot-nguoi':
        return 20;
      default:
        return 12;
    }
  });

  const total = weights.reduce((sum, value) => sum + value, 0);
  let ticket = rng.next() * total;
  for (let index = 0; index < kinds.length; index++) {
    ticket -= weights[index] ?? 0;
    if (ticket <= 0) return kinds[index]?.id ?? 'tich-tien';
  }
  return kinds[kinds.length - 1]?.id ?? 'tich-tien';
}

// ---------------------------------------------------------------------------
// Tính lại tầng (mục 2)
// ---------------------------------------------------------------------------

export interface RetierInput {
  agents: readonly Agent[];
  /** Vùng người chơi đang đứng. Rỗng thì mọi agent đều xa như nhau. */
  playerRegionId: string;
  /** Thế lực người chơi thuộc về — người cùng phe luôn liên quan hơn. */
  playerPowerId: string;
  /** NPC đang có mặt trong cảnh, hoặc vừa được nhắc tới. */
  spotlight: readonly string[];
}

export interface TierScore {
  npcId: string;
  score: number;
  tier: AgentTier;
  reason: string;
}

/**
 * Điểm liên quan của một agent với người chơi, 0–100.
 *
 * Bốn thành phần, trọng số ở `data/sim.json → tiers.weights`:
 *
 *   khoảng cách   ở gần thì liên quan, và "gần" đo bằng km thật trên bản đồ
 *   liên quan     cùng phe, đang trong cảnh, hoặc mục tiêu trỏ vào người chơi
 *   quyền lực     một hoàng đế ở xa vẫn đáng nghĩ hơn một hiệp sĩ ở gần
 *   mốc           vừa chạm một mốc trong `wakeMilestones` thì "thức dậy"
 */
export function relevanceOf(agent: Agent, input: RetierInput): TierScore {
  const config = tierConfig();
  const weights = config.weights;
  const total = weights.khoangCach + weights.lienQuan + weights.quyenLuc + weights.mocQuanTrong;

  const km =
    input.playerRegionId === '' || agent.regionId === ''
      ? config.farKm
      : crowKm(agent.regionId, input.playerRegionId);
  const distanceScore =
    !Number.isFinite(km) || km >= config.farKm
      ? 0
      : km <= config.nearKm
        ? 1
        : 1 - (km - config.nearKm) / (config.farKm - config.nearKm);

  let relevance = 0;
  const reasons: string[] = [];
  if (input.spotlight.includes(agent.npcId)) {
    relevance += 0.7;
    reasons.push('đang trong cảnh');
  }
  if (agent.powerId !== '' && agent.powerId === input.playerPowerId) {
    relevance += 0.2;
    reasons.push('cùng phe');
  }
  if (agent.goals.some((goal) => goal.target !== '' && goal.target === input.playerPowerId)) {
    relevance += 0.3;
    reasons.push('mục tiêu trỏ vào người chơi');
  }
  relevance = Math.min(1, relevance);

  const power = Math.min(1, (agent.resources.influence + agent.resources.men) / 200);
  const milestone = agent.wokeBy === '' ? 0 : 1;
  if (milestone === 1) reasons.push(`vừa chạm mốc "${agent.wokeBy}"`);

  const score =
    ((distanceScore * weights.khoangCach +
      relevance * weights.lienQuan +
      power * weights.quyenLuc +
      milestone * weights.mocQuanTrong) /
      total) *
    100;

  if (distanceScore > 0.6) reasons.unshift('ở gần');

  return {
    npcId: agent.npcId,
    score: Math.round(score),
    tier: score >= config.promoteAbove ? 'A' : score >= config.demoteBelow ? 'B' : 'C',
    reason: reasons.length === 0 ? 'ở xa và không dính gì tới người chơi' : reasons.join(', '),
  };
}

export interface RetierResult {
  agents: Agent[];
  scores: TierScore[];
  /** Ai vừa đổi tầng — CHỈ cho tab Debug. Không bao giờ hiện cho người chơi. */
  moves: string[];
}

/**
 * Xếp lại cả ba tầng.
 *
 * TRẦN CỦA TẦNG A LÀ TRẦN CỨNG: điểm cao tới đâu cũng chỉ 8–12 người được LLM
 * nghĩ hộ, vì mỗi người trong số đó là một phần của một request có trả tiền. Ai
 * vượt trần rơi xuống tầng B — không phải bị bỏ mặc, mà chạy bằng cây quyết
 * định. Người chơi không phân biệt được, và đó là toàn bộ ý đồ.
 */
export function retier(input: RetierInput): RetierResult {
  const config = tierConfig();
  const scores = input.agents
    .filter((agent) => agent.alive)
    .map((agent) => relevanceOf(agent, input))
    .sort((left, right) => right.score - left.score);

  const assigned = new Map<string, AgentTier>();
  let inA = 0;
  let inB = 0;
  for (const score of scores) {
    let tier = score.tier;
    if (tier === 'A' && inA >= config.maxA) tier = 'B';
    if (tier === 'B' && inB >= config.maxB) tier = 'C';
    if (tier === 'A') inA++;
    else if (tier === 'B') inB++;
    assigned.set(score.npcId, tier);
  }

  const moves: string[] = [];
  const agents = input.agents.map((agent) => {
    if (!agent.alive) return agent.tier === 'C' ? agent : { ...agent, tier: 'C' as AgentTier };
    const tier = assigned.get(agent.npcId) ?? 'C';
    if (tier === agent.tier) return agent.wokeBy === '' ? agent : { ...agent, wokeBy: '' };
    moves.push(`${agent.name || agent.npcId}: ${agent.tier} → ${tier}`);
    // `wokeBy` cháy một lần rồi tắt: một mốc kéo agent lên ĐÚNG một tháng, và
    // sau đó nó phải tự giữ chỗ bằng điểm liên quan như mọi người khác.
    return { ...agent, tier, wokeBy: '' };
  });

  return { agents, scores, moves };
}

/** Đánh dấu một agent vừa chạm mốc — tháng sau nó được kéo lên (mục 2). */
export function wake(agent: Agent, milestone: string): Agent {
  if (!tierConfig().wakeMilestones.includes(milestone)) return agent;
  return { ...agent, wokeBy: milestone };
}

// ---------------------------------------------------------------------------
// Mục tiêu
// ---------------------------------------------------------------------------

/** Mục tiêu đang theo đuổi: ưu tiên cao nhất, chưa xong, chưa quá hạn. */
export function activeGoal(agent: Agent, month: number): AgentGoal | null {
  const live = agent.goals.filter(
    (goal) => goal.progress < 100 && (goal.deadline === undefined || goal.deadline >= month),
  );
  if (live.length === 0) return null;
  return live.reduce((best, goal) => (goal.priority > best.priority ? goal : best));
}

export interface GoalProgress {
  goals: AgentGoal[];
  /** Mục tiêu vừa đạt — chúng sinh ra biến cố, nên người gọi cần biết. */
  completed: AgentGoal[];
  /** Mục tiêu vừa hết hạn. Agent bỏ cuộc và đi tìm việc khác. */
  expired: AgentGoal[];
}

/**
 * Nhích một mục tiêu, và dọn những mục tiêu đã xong hoặc đã hết hạn.
 *
 * `horizonMonths` không phải trang trí: không có nó thì một bá tước sẽ đuổi theo
 * một ngôi vị suốt sáu chục năm và không bao giờ làm gì khác, và mô phỏng dài
 * hạn sẽ đóng băng thành một bức ảnh chụp những kẻ chờ mãi.
 */
export function advanceGoal(agent: Agent, goalId: string, delta: number, month: number): GoalProgress {
  const completed: AgentGoal[] = [];
  const expired: AgentGoal[] = [];

  const goals = agent.goals
    .map((goal) => {
      if (goal.id !== goalId) return goal;
      const progress = Math.max(0, Math.min(100, goal.progress + delta));
      const next = { ...goal, progress };
      // Hạn chót đặt lần đầu tiên agent thật sự bắt tay vào việc, không phải lúc
      // mục tiêu sinh ra: một mối thù nằm im hai chục năm rồi mới bùng lên vẫn
      // là một mối thù, và bắt đầu đếm ngược từ lúc nó sinh ra là giết nó sớm.
      if (next.deadline === undefined) {
        const horizon = goalKindOf(goal.kind)?.horizonMonths ?? 60;
        next.deadline = month + horizon;
      }
      return next;
    })
    .filter((goal) => {
      if (goal.progress >= 100) {
        completed.push(goal);
        return false;
      }
      if (goal.deadline !== undefined && goal.deadline < month) {
        expired.push(goal);
        return false;
      }
      return true;
    });

  return { goals, completed, expired };
}

// ---------------------------------------------------------------------------
// Tri thức riêng của agent (mục 3)
// ---------------------------------------------------------------------------

/** Trần tri thức một agent nhớ. Ai cũng quên, kể cả một hồng y. */
const KNOWLEDGE_LIMIT = 40;

/**
 * Cho một agent BIẾT một chuyện.
 *
 * Không kiểm tra chuyện ấy có thật không, và đó là điểm của cả cơ chế: agent
 * hành động theo cái nó tưởng là đúng. Người gọi (`deeptick.ts`) chỉ đưa vào đây
 * những gì tin tức đã mang tới chỗ agent ấy đứng — kể cả tin đã bị bóp méo.
 */
export function learn(agent: Agent, fact: string): Agent {
  if (fact === '' || agent.knowledge.includes(fact)) return agent;
  const knowledge = [fact, ...agent.knowledge].slice(0, KNOWLEDGE_LIMIT);
  return { ...agent, knowledge };
}

/** Agent này có biết chuyện ấy không — cây quyết định và prompt tầng A đều hỏi. */
export function knows(agent: Agent, fact: string): boolean {
  return agent.knowledge.includes(fact);
}

/** Số agent theo từng tầng. Tab Debug của mục 11 hiện bảng này. */
export function tierCounts(agents: readonly Agent[]): Record<AgentTier, number> {
  const counts: Record<AgentTier, number> = { A: 0, B: 0, C: 0 };
  for (const agent of agents) {
    if (!agent.alive) continue;
    counts[agent.tier]++;
  }
  return counts;
}
