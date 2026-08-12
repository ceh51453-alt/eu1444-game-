/**
 * TICK SÂU — Phần 15 mục 5, chạy MỖI THÁNG TRONG GAME.
 *
 * TÁM BƯỚC LÀ MỘT HỢP ĐỒNG, không phải một tình cờ:
 *
 *   B1  Engine tổng hợp tình hình: ai đang ở đâu, ai muốn gì, chuyện gì mới xảy ra
 *   B2  GỘP NHIỀU AGENT VÀO MỘT REQUEST cho tầng A. LLM không được trả con số.
 *   B3  Agent tầng B chạy cây quyết định engine
 *   B4  Agent tầng C chạy bảng xác suất
 *   B5  Engine phân giải mọi quyết định: tung xúc sắc qua Phần 5, cập nhật qua MVU
 *   B6  Quốc gia và tôn giáo cập nhật theo Phần 14
 *   B7  Sinh sự kiện và tin tức
 *   B8  Tính lại tầng cho từng agent
 *
 * B8 ĐỨNG CUỐI, và đó là chỗ dễ làm ngược nhất. Tính tầng ở đầu tháng nghe hợp
 * lý hơn — "biết ai quan trọng rồi mới nghĩ hộ họ" — nhưng làm thế thì một NPC
 * vừa lên ngôi ở bước B5 phải chờ tới tận tháng sau mới được đối xử như một
 * người vừa lên ngôi. Tính ở cuối thì tháng sau mở ra với đúng bộ mặt của tháng
 * này, và mốc `wokeBy` sinh ra ở B4/B5 kịp có tác dụng.
 *
 * B6 KHÔNG mô phỏng lại Phần 14. Một năm của châu lục chạy ở `advanceWorldYear`
 * với dòng xúc sắc riêng của nó; tick sâu chỉ GỌI nó đúng một lần mỗi mười hai
 * tháng và nhận kết quả. Chạy lại logic của Phần 14 ở đây là hai nguồn sự thật
 * cho cùng một bàn cờ.
 *
 * VÀ TOÀN BỘ HÀM NÀY CHẠY ĐƯỢC KHI KHÔNG CÓ MẠNG. Tầng A vắng mặt thì mọi agent
 * rơi xuống cây quyết định — mục 5 nói thẳng: game vẫn phải hoạt động bình
 * thường, chỉ là thế giới kém bất ngờ hơn.
 */

import type { GameDate } from '@/core/clock';
import type { Rng } from '@/core/rng';
import type { PatchOp } from '@/state/mvu-parse';
import type { GameState } from '@/state/slices';
import { retier, tierCounts, wake } from './agents';
import { askTierA, type BatchDeps } from './batch';
import { agentSlotsLeft, canCallAgents, canCallText, countMonth, rollMonth, spend, type Pricing } from './cost';
import { costConfig } from './data';
import { advanceTierC, decideTierB, type Decision } from './decide';
import { pruneEvents } from './events';
import { capDrift, enforceInvariants, appendLog, type PowerSnapshot, type TitleHolding } from './invariants';
import { dispatchNews, DEFAULT_NAMES, type NameBook } from './news';
import { resolveDecision } from './resolve';
import { absoluteMonth, worldStateOf, type WorldSliceState } from './slice';
import { applyWrittenText, askEventText, fillFromTemplates, needsLlmText, type TextDeps } from './text';
import { emptyTickReport, type Agent, type TickReport, type WorldEvent } from './types';

export interface DeepTickInput {
  state: GameState;
  /** Dòng xúc sắc `worldtick`. */
  rng: Rng;
  date: GameDate;
  /** Vùng người chơi đang đứng — đích của mọi tin. */
  playerRegionId: string;
  playerPowerId: string;
  /** NPC đang có mặt trong cảnh. Họ luôn liên quan, bất kể ở đâu. */
  spotlight?: readonly string[];
  /**
   * Bảng quốc gia của Phần 14, ĐẦU tháng và CUỐI tháng.
   *
   * Hai bản chứ không một: trần biến động của mục 9 hỏi "tháng này nước ấy đổi
   * bao nhiêu", và câu ấy không trả lời được từ một ảnh chụp. Tháng nào Phần 14
   * không chạy thì truyền cùng một mảng cho cả hai, và trần không kẹp gì cả.
   */
  powers?: { before: readonly PowerSnapshot[]; after: readonly PowerSnapshot[] };
  /** Thế lực đang có chiến tranh thật đã mô phỏng — miễn trần lãnh thổ (mục 9). */
  atWar?: ReadonlySet<string>;
  titles?: readonly TitleHolding[];
  /** Bản tóm tắt của `exportForPart15` (Phần 14 mục 6), đưa thẳng vào prompt. */
  situation?: string;
  names?: NameBook;
  /** Vắng mặt là chạy hoàn toàn bằng engine — đúng nút "tắt LLM" của mục 5. */
  llm?: { agents: BatchDeps; text: TextDeps; pricing: Pricing };
}

export interface DeepTickResult {
  ops: PatchOp[];
  report: TickReport;
  /** Bảng quốc gia sau khi kẹp trần. Người gọi ghi lại vào slice `nations`. */
  powers: PowerSnapshot[];
  /** Số agent theo tầng — tab Debug của mục 11 hiện bảng này. */
  tiers: Record<'A' | 'B' | 'C', number>;
}

export async function runDeepTick(input: DeepTickInput): Promise<DeepTickResult> {
  const before = worldStateOf(input.state);
  const report = emptyTickReport();
  const emptyTiers = { A: 0, B: 0, C: 0 };

  if (before === null) {
    return { ops: [], report, powers: [...(input.powers?.after ?? [])], tiers: emptyTiers };
  }

  const month = absoluteMonth(input.date);
  const names = input.names ?? DEFAULT_NAMES;
  const config = costConfig();
  let world: WorldSliceState = { ...before, budget: rollMonth(before.budget, month) };

  // --- B1: TỔNG HỢP TÌNH HÌNH ----------------------------------------------
  const living = world.agents.filter((agent) => agent.alive);
  const recent = world.events
    .slice(-8)
    .reverse()
    .map((event) => event.headline === '' ? event.kind : event.headline);

  report.lines.push(
    `— Tháng ${String(input.date.month)}/${String(input.date.year)}: ${String(living.length)} người còn sống, ${String(world.inFlight.length)} tin đang trên đường.`,
  );

  // --- B2: TẦNG A, GỘP MỘT REQUEST -----------------------------------------
  const tierA = living.filter((agent) => agent.tier === 'A');
  const decisions = new Map<string, Decision>();

  // VƯỢT TRẦN THÌ RƠI XUỐNG TẦNG B, KHÔNG XẾP HÀNG (mục 5). `slots` là số agent
  // còn được LLM nghĩ hộ tháng này; phần dư đi tiếp xuống B3 như mọi người khác.
  const slots = input.llm === undefined ? 0 : Math.min(agentSlotsLeft(world.budget), config.agentsPerRequest);
  const asked = tierA.slice(0, slots);

  if (input.llm !== undefined && asked.length > 0 && canCallAgents(world.budget)) {
    const answer = await askTierA(input.llm.agents, asked, {
      year: input.date.year,
      month: input.date.month,
      situation: input.situation ?? '',
      recent,
    });

    world = {
      ...world,
      budget: spend(world.budget, { usage: answer.usage, pricing: input.llm.pricing, kind: 'agents' }),
    };
    report.llmCallsUsed += 1;

    for (const decision of answer.decisions) decisions.set(decision.npcId, decision);
    for (const line of answer.rejected) report.lines.push(`  ⟂ tầng A: ${line}`);
    if (answer.error !== null) report.lines.push(`  ⟂ tầng A: ${answer.error} — cả lô rơi xuống tầng B`);
    report.lines.push(
      `  tầng A: ${String(answer.decisions.length)}/${String(asked.length)} quyết định dùng được, đã tiêu ${String(world.budget.requestsUsed)}/${String(world.budget.maxRequestsPerMonth)} request tháng này.`,
    );
  } else if (tierA.length > 0) {
    report.lines.push(
      input.llm === undefined
        ? `  tầng A: LLM tắt, ${String(tierA.length)} người chạy bằng engine.`
        : `  tầng A: hết trần request, ${String(tierA.length)} người rơi xuống cây quyết định.`,
    );
  }

  // --- B3: TẦNG B (và mọi ai tầng A không được LLM nghĩ hộ) -----------------
  for (const agent of living) {
    if (agent.tier === 'C') continue;
    if (decisions.has(agent.npcId)) continue;
    decisions.set(agent.npcId, decideTierB(agent, month));
  }

  // --- B4: TẦNG C ----------------------------------------------------------
  const agents = new Map<string, Agent>(world.agents.map((agent) => [agent.npcId, agent]));
  for (const agent of living) {
    if (agent.tier !== 'C') continue;
    const change = advanceTierC(input.rng, agent, month);
    agents.set(agent.npcId, change.agent);
    if (change.line !== '') report.lines.push(`  ${change.line}`);
  }

  // --- B5: PHÂN GIẢI -------------------------------------------------------
  const fresh: WorldEvent[] = [];
  let sequence = 0;

  for (const decision of decisions.values()) {
    const agent = agents.get(decision.npcId);
    if (agent === undefined || !agent.alive) continue;

    const outcome = resolveDecision(input.rng, {
      agent,
      decision,
      date: input.date,
      month,
      sequence: sequence++,
    });

    let next = outcome.agent;
    // LÊN KẾ HOẠCH CHO THÁNG SAU, không làm ngay lần nữa: một hành động ồn ào
    // (vây hãm, chiêu binh) kéo dài hơn một tháng, và tick nhanh sẽ thực thi
    // phần tiếp theo của nó rải ra trong tháng (mục 4).
    if (decision.actionId !== 'cho-thoi-co' && outcome.check.tier !== 'critFail') {
      next = {
        ...next,
        pendingActions: [
          ...next.pendingActions,
          {
            actionId: decision.actionId,
            targetId: decision.targetId,
            magnitude: decision.magnitude,
            dueMonth: month + 1,
            goalId: decision.goalId,
          },
        ].slice(-4),
      };
    }
    if (outcome.milestone !== '') next = wake(next, outcome.milestone);

    agents.set(decision.npcId, next);
    report.lines.push(`  ${outcome.line}`);
    if (outcome.event !== null) fresh.push(outcome.event);
  }

  world = { ...world, agents: [...agents.values()] };

  // --- B6: QUỐC GIA VÀ TÔN GIÁO -------------------------------------------
  //
  // Tick sâu KHÔNG chạy `advanceWorldYear` — người gọi làm việc ấy đúng một lần
  // mỗi mười hai tháng, vì một năm của châu lục là một năm chứ không phải mười
  // hai lần một phần mười hai. Ở đây chỉ nhận bảng quốc gia vào để kẹp trần và
  // kiểm bất biến, và trả lại bản đã kẹp.
  const drift = capDrift({
    before: input.powers?.before ?? [],
    after: input.powers?.after ?? [],
    atWar: input.atWar ?? new Set<string>(),
    date: input.date,
  });
  for (const line of drift.clamped) report.repairs.push(line);

  // --- B7: SINH SỰ KIỆN VÀ TIN TỨC ----------------------------------------
  let written = fillFromTemplates(input.rng, fresh, names);

  if (input.llm !== undefined && canCallText(world.budget)) {
    const big = needsLlmText(written).slice(0, config.eventsPerTextRequest);
    if (big.length > 0) {
      const text = await askEventText(input.llm.text, big, names);
      world = {
        ...world,
        budget: spend(world.budget, { usage: text.usage, pricing: input.llm.pricing, kind: 'text' }),
      };
      report.llmCallsUsed += 1;
      written = applyWrittenText(written, text.written);
      for (const line of text.rejected) report.lines.push(`  ⟂ viết sự kiện: ${line}`);
      if (text.error !== null) report.lines.push(`  ⟂ viết sự kiện: ${text.error} — dùng bản mẫu`);
    }
  }

  const referenced = new Set(world.inFlight.map((item) => item.eventId));
  world = { ...world, events: pruneEvents([...world.events, ...written], referenced) };
  report.events.push(...written);

  // Tin lên đường. Mỗi biến cố tối đa hai bản, và biến cố quá nhỏ hoặc quá xa
  // thì KHÔNG sinh tin nào — nó vẫn xảy ra, người chơi chỉ không bao giờ biết.
  const dispatched = written.flatMap((event) =>
    dispatchNews(input.rng, {
      event,
      toRegionId: input.playerRegionId,
      now: input.date,
      intel: world.intel,
    }),
  );
  if (dispatched.length > 0) {
    world = { ...world, inFlight: [...world.inFlight, ...dispatched] };
    report.lines.push(`  ${String(dispatched.length)} tin lên đường về phía người chơi.`);
  }

  // AGENT CŨNG NGHE TIN, VÀ NGHE BẢN CỦA RIÊNG HỌ (mục 3). Ở đây rút gọn: agent
  // đứng cùng vùng với biến cố thì biết ngay và biết đúng. Agent ở xa không được
  // cho biết gì cả — đó chính là chỗ sinh ra hiểu lầm mà mục 3 muốn.
  world = { ...world, agents: informNearbyAgents(world.agents, written) };

  // --- B8: TÍNH LẠI TẦNG ---------------------------------------------------
  const retiered = retier({
    agents: world.agents,
    playerRegionId: input.playerRegionId,
    playerPowerId: input.playerPowerId,
    spotlight: input.spotlight ?? [],
  });
  world = { ...world, agents: retiered.agents, lastDeepMonth: month, budget: countMonth(world.budget) };
  for (const move of retiered.moves) report.lines.push(`  [tầng] ${move}`);

  // --- MỤC 9: BẤT BIẾN, TRẦN, NHẬT KÝ -------------------------------------
  const checked = enforceInvariants({
    world,
    powers: drift.powers,
    titles: input.titles ?? [],
    date: input.date,
  });
  world = appendLog(checked.world, report.lines);
  report.repairs.push(...checked.repairs);

  return {
    ops: [
      {
        op: 'set',
        path: 'world',
        from: before,
        to: world,
        reason: `tick sâu tháng ${String(input.date.month)}/${String(input.date.year)}`,
        source: 'json',
      },
    ],
    report,
    powers: checked.powers,
    tiers: tierCounts(world.agents),
  };
}

/**
 * Cho agent ở cùng vùng biết chuyện vừa xảy ra.
 *
 * KHÔNG cho agent ở xa biết gì. Đây là vế thứ hai của mục 3 và là vế dễ bỏ quên:
 * dễ nhất là đẩy mọi biến cố vào tri thức của mọi agent "cho nó thật", và làm
 * thế là mọi bá tước biên cương đều biết chuyện kinh đô trong cùng một đêm.
 */
function informNearbyAgents(agents: readonly Agent[], events: readonly WorldEvent[]): Agent[] {
  if (events.length === 0) return [...agents];
  const byRegion = new Map<string, string[]>();
  for (const event of events) {
    if (event.regionId === '') continue;
    const list = byRegion.get(event.regionId) ?? [];
    list.push(`tin.${event.id}`);
    byRegion.set(event.regionId, list);
  }

  const KNOWLEDGE_LIMIT = 40;
  return agents.map((agent) => {
    const facts = byRegion.get(agent.regionId);
    if (facts === undefined || !agent.alive) return agent;
    const unseen = facts.filter((fact) => !agent.knowledge.includes(fact));
    if (unseen.length === 0) return agent;
    return { ...agent, knowledge: [...unseen, ...agent.knowledge].slice(0, KNOWLEDGE_LIMIT) };
  });
}
