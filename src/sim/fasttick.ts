/**
 * TICK NHANH — Phần 15 mục 4, chạy MỖI LƯỢT CHƠI.
 *
 * *"Rẻ, deterministic, **KHÔNG gọi LLM**. Chạy trong vài mili giây."* Ba chữ ấy
 * là ràng buộc cứng, không phải mong muốn: bước 8 nằm giữa lúc người chơi bấm
 * gửi và lúc họ đọc được đoạn văn, nên mọi mili giây ở đây là mili giây họ ngồi
 * nhìn con trỏ nhấp nháy.
 *
 * BẢY VIỆC của mục 4, và file này làm sáu:
 *
 *   thời gian trôi, thời tiết                        ✓ ở đây
 *   tiến độ xây dựng, hành quân, vây hãm, đường hầm   ✓ ở đây (qua hành động đã lên kế hoạch)
 *   tiêu thụ lương thực, thương tích, bệnh            → Phần 7 và Phần 12 tự chạy ở bước 2a
 *   lan truyền tin tức                               ✓ ở đây
 *   agent tầng B thực thi hành động đã lên kế hoạch   ✓ ở đây
 *   kiểm tra điều kiện kích hoạt sự kiện              ✓ ở đây
 *   lorebook trigger từ Phần 4                       → `state/turn.ts` đã chạy trước khi lắp prompt
 *
 * Hai việc không ở đây là cố ý và đã có chủ: vòng cơ thể chạy ở bước 2a chứ
 * không phải bước 8, vì người kể chuyện phải đọc được cơn sốt của đêm nay TRƯỚC
 * khi viết cảnh sáng nay (xem `ai/pipeline.ts`). Và lorebook quét trước khi lắp
 * prompt, cùng lý do.
 *
 * MỌI THAY ĐỔI TRẢ VỀ DƯỚI DẠNG `PatchOp` (R2). File này không ghi state, không
 * gọi store, không phát event — người gọi cho lô đi qua MVU rồi mới phát.
 */

import { addDays, type GameDate } from '@/core/clock';
import type { Rng } from '@/core/rng';
import type { PatchOp } from '@/state/mvu-parse';
import type { GameState } from '@/state/slices';
import { gainKnowledgeOp } from '@/lore/knowledge';
import { advanceNews, deliverNews, DEFAULT_NAMES, type NameBook } from './news';
import { pruneEvents, pushFeed, stackCards } from './events';
import { resolveDecision } from './resolve';
import { absoluteMonth, worldStateOf, type WorldSliceState } from './slice';
import { emptyTickReport, type ArrivedNews, type TickReport, type WorldEvent } from './types';

export interface FastTickInput {
  state: GameState;
  /** Dòng xúc sắc `worldtick`. KHÔNG dùng dòng `main` (R3). */
  rng: Rng;
  /** Số phút trong game lượt này tiêu tốn — `RollContext.timeCost` của Phần 5. */
  minutes: number;
  turn: number;
  names?: NameBook;
}

export interface FastTickResult {
  ops: PatchOp[];
  report: TickReport;
  /** Ngày sau khi thời gian trôi. Người gọi không phải tự tính lại. */
  date: GameDate;
  /** Tháng tuyệt đối sau khi trôi — so với `world.lastDeepMonth` để biết có phải chạy tick sâu. */
  month: number;
  /** Số ngày vừa trôi. Tick sâu dùng nó để biết đã bỏ lỡ mấy tháng. */
  days: number;
}

const MINUTES_PER_DAY = 24 * 60;

/**
 * Cộng phút vào lịch.
 *
 * Giữ cả `hour` chứ không làm tròn xuống ngày: hành cảnh ngày/đêm của Phần 14b
 * đọc giờ, và một lượt "đi tuần nửa đêm" mà đồng hồ vẫn chỉ sáu giờ sáng thì
 * chiến trận ban đêm không bao giờ kích hoạt.
 */
export function advanceClock(date: GameDate, minutes: number): { date: GameDate; days: number } {
  const total = date.hour * 60 + Math.max(0, Math.round(minutes));
  const days = Math.floor(total / MINUTES_PER_DAY);
  const hour = Math.floor((total % MINUTES_PER_DAY) / 60);
  const moved = days === 0 ? date : addDays(date, days);
  return { date: { ...moved, hour }, days };
}

/**
 * Chạy một nhịp nhanh.
 *
 * KHÔNG rút xúc sắc khi không có gì xảy ra: `advanceNews` thuần, và vòng hành
 * động đã lên kế hoạch chỉ chạm tới `rng` khi thật sự có hành động tới hạn. Nhờ
 * vậy một trăm lượt nói chuyện trong quán trọ không đẩy dòng `worldtick` đi đâu
 * cả, và một save tua lại vẫn ra đúng thế giới ấy (R3).
 */
export function runFastTick(input: FastTickInput): FastTickResult {
  const world = worldStateOf(input.state);
  const clock = advanceClock(input.state.meta.gameDate, input.minutes);
  const report = emptyTickReport();

  const ops: PatchOp[] = [];
  if (clock.days > 0 || clock.date.hour !== input.state.meta.gameDate.hour) {
    ops.push({
      op: 'set',
      path: 'meta.gameDate',
      from: input.state.meta.gameDate,
      to: clock.date,
      reason: `thời gian trôi ${String(clock.days)} ngày`,
      source: 'json',
    });
  }

  if (world === null) {
    return { ops, report, date: clock.date, month: absoluteMonth(clock.date), days: clock.days };
  }

  const month = absoluteMonth(clock.date);
  const names = input.names ?? DEFAULT_NAMES;
  let next: WorldSliceState = world;

  // --- Lan truyền tin tức --------------------------------------------------
  const moved = advanceNews(next.inFlight, clock.days);
  const arrivals: ArrivedNews[] = [];
  if (moved.arrived.length > 0) {
    const byId = new Map(next.events.map((event) => [event.id, event]));
    for (const item of moved.arrived) {
      const event = byId.get(item.eventId);
      // Biến cố gốc đã bị dọn: tin ấy không còn gì để kể. `pruneEvents` giữ lại
      // mọi biến cố còn tin trỏ tới, nên nhánh này chỉ tới được khi một save cũ
      // được nạp vào bản build mới — bỏ qua im lặng ở đây là đúng, vì kể một tin
      // rỗng còn tệ hơn không kể.
      if (event === undefined) continue;
      arrivals.push(deliverNews(input.rng, { event, item, arrivedAt: clock.date, names }));
    }
  }

  if (arrivals.length > 0) {
    next = { ...next, feed: pushFeed(next.feed, arrivals) };
    report.arrivals.push(...arrivals);
  }
  next = { ...next, inFlight: moved.inFlight };

  // --- Agent tầng B thực thi hành động đã lên kế hoạch ----------------------
  const executed = runPendingActions(input.rng, next, clock.date, month);
  next = executed.world;
  report.lines.push(...executed.lines);
  report.events.push(...executed.events);

  // --- Kiểm tra điều kiện kích hoạt sự kiện --------------------------------
  const pending = next.events.filter((event) => next.cards.includes(event.id) || isFresh(event, month));
  const stack = stackCards(pending);
  if (!sameCards(stack.cards, next.cards)) {
    next = { ...next, cards: stack.cards };
  }

  next = { ...next, lastFastTurn: input.turn };

  ops.push({
    op: 'set',
    path: 'world',
    from: world,
    to: next,
    reason: `tick nhanh lượt ${String(input.turn)}: ${String(arrivals.length)} tin tới, ${String(executed.events.length)} biến cố`,
    source: 'json',
  });

  // TIN SAI VẪN ĐƯỢC GHI VÀO TRI THỨC (mục 6). Không có nhánh nào ở đây kiểm tra
  // lại xem tin ấy có đúng không — người chơi có thể ra quyết định lớn dựa trên
  // một tin sai, và đó là tính năng.
  for (const arrival of arrivals) {
    const op = gainKnowledgeOp(
      input.state,
      { id: `tin.${arrival.eventId}`, source: arrival.source, confidence: arrival.confidence },
      input.turn,
    );
    if (op !== null) ops.push(op);
  }

  return { ops, report, date: clock.date, month, days: clock.days };
}

/** Biến cố còn "nóng": mới trong vòng một tháng thì còn đáng nằm trên chồng thẻ. */
function isFresh(event: WorldEvent, month: number): boolean {
  return absoluteMonth(event.occurredAt) >= month - 1;
}

function sameCards(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

interface ExecutionResult {
  world: WorldSliceState;
  lines: string[];
  events: WorldEvent[];
}

/**
 * Thực thi những hành động đã tới hạn.
 *
 * Tick sâu LÊN KẾ HOẠCH, tick nhanh THỰC THI. Tách hai việc là cách duy nhất để
 * một quyết định tháng này có sức nặng của một tháng: nếu tick sâu vừa quyết vừa
 * làm ngay thì mọi thứ trong thế giới đều xảy ra đúng ngày mồng một, và người
 * chơi sẽ học được rằng chỉ cần đề phòng vào đầu tháng.
 */
function runPendingActions(rng: Rng, world: WorldSliceState, date: GameDate, month: number): ExecutionResult {
  const due = world.agents.filter((agent) =>
    agent.alive && agent.pendingActions.some((action) => action.dueMonth <= month),
  );
  if (due.length === 0) return { world, lines: [], events: [] };

  const lines: string[] = [];
  const events: WorldEvent[] = [];
  const updated = new Map<string, WorldSliceState['agents'][number]>();
  let sequence = 0;

  for (const agent of due) {
    const ripe = agent.pendingActions.filter((action) => action.dueMonth <= month);
    const later = agent.pendingActions.filter((action) => action.dueMonth > month);
    let current = { ...agent, pendingActions: later };

    for (const action of ripe) {
      const outcome = resolveDecision(rng, {
        agent: current,
        decision: {
          npcId: current.npcId,
          actionId: action.actionId,
          targetId: action.targetId,
          magnitude: action.magnitude,
          goalId: action.goalId,
          reasoning: '',
          from: current.tier,
        },
        date,
        month,
        sequence: sequence++,
      });
      current = outcome.agent;
      lines.push(outcome.line);
      if (outcome.event !== null) events.push(outcome.event);
    }

    updated.set(current.npcId, current);
  }

  const agents = world.agents.map((agent) => updated.get(agent.npcId) ?? agent);
  // Biến cố mới vào hàng đợi ngay: tin của chúng lên đường ở tick sâu kế tiếp,
  // và tới lúc ấy chúng phải đã có mặt để `dispatchNews` tra được. Dọn hàng đợi
  // thì GIỮ mọi biến cố còn tin đang trên đường trỏ tới — một tin mất tám tháng
  // để tới nơi mà biến cố gốc đã bị dọn là tám tháng đi công cốc.
  const referenced = new Set(world.inFlight.map((item) => item.eventId));
  const queue = pruneEvents([...world.events, ...events], referenced);
  return { world: { ...world, agents, events: queue }, lines, events };
}
