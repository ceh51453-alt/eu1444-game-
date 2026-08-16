/**
 * BƯỚC 8 CỦA VÒNG LẶP LƯỢT — cửa duy nhất mà phần còn lại của game gọi vào.
 *
 * Phần 0 mục 6 đặt "mô phỏng ngầm" ở bước 8 và để trống suốt mười bốn phần. File
 * này lấp chỗ ấy, và nó chỉ làm đúng một việc: **quyết định nhịp nào phải chạy**.
 *
 *   MỖI LƯỢT       tick nhanh — rẻ, tất định, không gọi mạng
 *   MỖI THÁNG      tick sâu — nơi duy nhất được gọi LLM
 *   MỖI 12 THÁNG   một năm của châu lục (Phần 14), do người gọi tự chạy
 *
 * NGƯỜI CHƠI TUA NHIỀU THÁNG TRONG MỘT LƯỢT thì tick sâu chạy BÙ, từng tháng
 * một, tối đa `MAX_CATCH_UP` tháng. Bỏ qua phần bù là một lượt nghỉ đông sáu
 * tháng làm cả châu lục đứng im; chạy bù không giới hạn là một lượt duy nhất treo
 * trình duyệt vì ai đó gõ "ngủ mười năm".
 *
 * HÀM NÀY KHÔNG GHI STATE. Nó trả về `PatchOp[]` và người gọi cho lô đi qua MVU
 * (R2) — kể cả khi lô ấy do chính engine sinh ra.
 */

import type { GameDate } from '@/core/clock';
import type { RngHub } from '@/core/rng';
import { RNG_STREAMS } from '@/core/rng';
import { applyPatch } from '@/state/mvu';
import type { PatchOp } from '@/state/mvu-parse';
import type { GameState } from '@/state/slices';
import { runDeepTick, type DeepTickInput } from './deeptick';
import { emitArrivals, emitSimEvents } from './events';
import { runFastTick, type FastTickInput } from './fasttick';
import { ensureAgentsOp } from './seed';
import { worldStateOf } from './slice';
import { emptyTickReport, type TickReport } from './types';
import { runEconomyTick } from '@/systems/economy/tick';
import { runMilitaryMonthTick } from '@/systems/military/tick';
import { runCampaignTick } from '@/systems/campaign/tick';
import { runHoldingTick } from '@/systems/holding';
import { crueltyOf, mercyOf } from '@/systems/siege';

/** Dòng xúc sắc riêng của mô phỏng ngầm (Phần 0 mục 5, R3). */
export const WORLDTICK_STREAM = RNG_STREAMS.worldtick;

/**
 * Trần số tháng chạy bù trong một lượt.
 *
 * Mười hai là một năm: đủ để một lượt "qua đông ở đây" hay "chờ mùa gặt" chạy
 * trọn vẹn, và đủ ngắn để không ai chờ. Tua lâu hơn thế thì nút "chạy thử 12
 * tháng" ở tab Debug là chỗ đúng, vì ở đó người chơi biết mình đang chờ.
 */
export const MAX_CATCH_UP = 12;

export interface WorldTickInput extends Omit<FastTickInput, 'rng'> {
  hub: RngHub;
  /** Mọi thứ tick sâu cần mà tick nhanh không cần. */
  deep: Omit<DeepTickInput, 'state' | 'rng' | 'date'>;
}

export interface WorldTickResult {
  /** State sau khi cả hai nhịp đã áp qua MVU. `null` là lô bị từ chối (R4). */
  next: GameState | null;
  report: TickReport;
  /** Op bị MVU từ chối. Đây là bug của engine, phải nổi lên chứ không được nuốt. */
  failures: string[];
  date: GameDate;
  /** Số tick sâu đã chạy trong lượt này. */
  deepTicks: number;
  llmCallsUsed: number;
}

/**
 * Chạy trọn bước 8.
 *
 * `async` vì tick sâu có thể gọi mạng. Người gọi ở `state/turn.ts` đã `await`
 * cả lượt rồi, nên chỗ này không thêm một lần chờ nào mà người chơi cảm nhận
 * được — trừ đúng tháng có tick sâu, và đó là lúc duy nhất đáng chờ.
 */
export async function runWorldTick(input: WorldTickInput): Promise<WorldTickResult> {
  const rng = input.hub.stream(WORLDTICK_STREAM);
  const failures: string[] = [];
  const report = emptyTickReport();
  let state = input.state;

  // --- Vạch xuất phát ------------------------------------------------------
  //
  // Một ván mới có slice `world` rỗng, và một thế giới không có ai trong đó thì
  // mô phỏng ngầm chạy đúng nhưng không sinh ra gì cả — hỏng theo kiểu im lặng
  // nhất có thể. Gieo ở đây, không ở `newGame`: người chơi nạp một save cũ từ
  // bản build trước Phần 15 cũng phải có người để mà mô phỏng.
  const seeding = ensureAgentsOp(state);
  if (seeding !== null) {
    state = commit(state, [seeding], failures) ?? state;
    report.lines.push(`[gieo] ${seeding.reason}`);
  }

  // --- Tick nhanh ----------------------------------------------------------
  const fast = runFastTick({ ...input, state, rng });
  state = commit(state, fast.ops, failures) ?? state;
  merge(report, fast.report);

  // --- Chiến đồ ------------------------------------------------------------
  //
  // Đứng ở nhịp NHANH, ngay sau khi lịch đã trôi: quân phải nhích được trong
  // chính cái lượt mà người chơi vừa tiêu vài giờ, chứ không đợi đầu tháng.
  // Đây cũng là chỗ duy nhất trong cả turn loop mà một đạo quân đổi vị trí —
  // không cửa nào khác dời quân được, kể cả một câu văn của người kể chuyện.
  const campaign = runCampaignTick(state, fast.days, fast.date);
  state = commit(state, campaign.ops, failures) ?? state;
  report.lines.push(...campaign.lines);

  // --- Thành trì -----------------------------------------------------------
  //
  // Cũng đứng ở nhịp NHANH, ngay sau chiến đồ: ngày trôi bao nhiêu thì thành
  // trì chốt sổ bấy nhiêu, và không có cái nút nào cho người chơi bấm để nó
  // xảy ra. Trước đây màn hình thành trì tự chạy tuần rồi "chốt kết quả" một
  // lô — hai đồng hồ chạy lệch nhau, và cái đồng hồ ở đây mới là cái thật.
  //
  // Lòng dân đọc tiếng tăm tàn bạo/nhân từ của Phần 11. Đọc Ở ĐÂY rồi bơm vào
  // qua tham số, không để `holdings` tự với sang slice `siege` — mục 13 của
  // README thành trì khai chỗ này là một tham số, và nó phải đúng là thế.
  const holdings = runHoldingTick({
    state,
    days: fast.days,
    date: fast.date,
    rng,
    turn: input.turn,
    lord: { cruelty: crueltyOf(state), mercy: mercyOf(state), maimed: false },
  });
  state = commit(state, holdings.ops, failures) ?? state;
  report.lines.push(...holdings.lines);

  // --- Tick sâu, chạy bù từng tháng ---------------------------------------
  let deepTicks = 0;
  const world = worldStateOf(state);
  let cursor = world === null ? fast.month : world.lastDeepMonth;

  while (cursor < fast.month && deepTicks < MAX_CATCH_UP) {
    cursor += 1;
    const date = dateOfMonth(cursor, fast.date);
    const military = runMilitaryMonthTick(state, date);
    state = commit(state, military.ops, failures) ?? state;
    report.lines.push(...military.lines);
    const economy = runEconomyTick(state, rng, date);
    state = commit(state, economy.ops, failures) ?? state;
    report.lines.push(...economy.lines);
    const deep = await runDeepTick({ ...input.deep, state, rng, date });
    state = commit(state, deep.ops, failures) ?? state;
    merge(report, deep.report);
    deepTicks += 1;
  }

  if (cursor < fast.month) {
    // Bỏ qua phần dư chứ không chạy tiếp: người chơi tua mười năm trong một lượt
    // thì mười năm ấy vẫn trôi trên lịch, chỉ là thế giới không mô phỏng chi
    // tiết từng tháng. Nói thẳng ra trong nhật ký thay vì im lặng.
    report.lines.push(
      `[bù] còn ${String(fast.month - cursor)} tháng chưa mô phỏng chi tiết — vượt trần ${String(MAX_CATCH_UP)} tháng một lượt.`,
    );
    // `from` bắt buộc: compare-and-swap ở bước B4 của MVU từ chối mọi op không
    // nói ra giá trị cũ, kể cả op do chính engine dựng (Phần 2 mục 4.3).
    const current = worldStateOf(state);
    if (current !== null) {
      const patch: PatchOp[] = [
        {
          op: 'set',
          path: 'world.lastDeepMonth',
          from: current.lastDeepMonth,
          to: fast.month,
          reason: 'bỏ qua phần tháng vượt trần chạy bù',
          source: 'json',
        },
      ];
      state = commit(state, patch, failures) ?? state;
    }
  }

  // Phát event SAU KHI state đã chốt: handler của eventbus không được ghi state,
  // nên phát trước là để chúng nhìn thấy một thế giới chưa tồn tại.
  emitSimEvents(report.events);
  emitArrivals(report.arrivals);

  return {
    next: state === input.state ? null : state,
    report,
    failures,
    date: fast.date,
    deepTicks,
    llmCallsUsed: report.llmCallsUsed,
  };
}

function commit(state: GameState, ops: readonly PatchOp[], failures: string[]): GameState | null {
  if (ops.length === 0) return state;
  const applied = applyPatch(state, ops, { actor: 'engine' });
  for (const failure of applied.failures) {
    failures.push(`${failure.op.path} — ${failure.step}: ${failure.message}`);
  }
  return applied.applied ? applied.next : null;
}

function merge(into: TickReport, from: TickReport): void {
  into.lines.push(...from.lines);
  into.events.push(...from.events);
  into.arrivals.push(...from.arrivals);
  into.repairs.push(...from.repairs);
  into.llmCallsUsed += from.llmCallsUsed;
}

/**
 * Ngày mồng một của một tháng tuyệt đối.
 *
 * Tick sâu chạy bù phải nhận đúng NGÀY của tháng nó đang mô phỏng, không phải
 * ngày hôm nay: một biến cố tháng Ba mà ghi ngày tháng Chín thì mọi tin sinh ra
 * từ nó sẽ tới nơi trước lúc nó xảy ra, và bất biến của mục 9 nổ ngay tháng sau.
 */
function dateOfMonth(month: number, sample: GameDate): GameDate {
  const year = Math.floor((month - 1) / 12);
  const inYear = month - year * 12;
  return { year, month: inYear, day: 1, hour: sample.hour };
}
