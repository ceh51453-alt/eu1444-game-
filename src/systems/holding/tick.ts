/**
 * THÀNH TRÌ CHẠY THEO LỊCH, KHÔNG CHẠY THEO NÚT BẤM.
 *
 * Bản cũ có hai cái nút — "một tuần" và "một năm" — cùng một nút "chốt kết quả".
 * Ba cái nút ấy dựng lên một đồng hồ thứ hai: lãnh chúa nuôi thành hai mươi năm
 * trong lúc ngoài kia mới là chiều thứ Ba, rồi bấm chốt một phát và cả hai mươi
 * năm rơi vào save cùng lúc. Mọi hạn chót trong game — nợ thầy của Phần 8, hạn
 * quân dịch của Phần 11, mùa vụ của chính Phần 12 — đều đo bằng cái đồng hồ thứ
 * nhất, nên cái thứ hai chỉ có thể làm chúng sai.
 *
 * Ở đây chỉ còn MỘT đồng hồ. Thời gian trôi vì LỜI KỂ làm nó trôi: một cảnh nói
 * chuyện trong sảnh tốn hai giờ, một chuyến đi sứ tốn mười một ngày, và bước 8
 * của vòng lặp lượt (`sim/worldtick.ts`) cộng đúng ngần ấy vào lịch. Thành trì
 * đọc con số ấy và chốt sổ theo.
 *
 * ---
 *
 * NGÀY VÀO, TUẦN RA. Sổ sách của một thành trì tính theo tuần và phải tính theo
 * tuần: khẩu phần, mùa vụ, tổ thợ, phiên gác đều là chuyện của tuần chứ không
 * phải của giờ. Nên ngày cộng dồn vào `daysOwed`, đủ bảy thì một tuần được chốt.
 * Người chơi thấy trên bảng trạng thái còn mấy ngày nữa tới kỳ chốt, và không
 * bao giờ phải bấm gì để nó xảy ra.
 *
 * HAI CÁI CHẶN, và cả hai đều có lý do cụ thể:
 *
 *  - `MAX_WEEKS_PER_TICK` — một lượt tua mười năm không được biến thành năm
 *    trăm vòng `advanceWeek` chạy giữa lúc người chơi đang đợi đọc văn. Phần dư
 *    bị BỎ chứ không nợ tiếp, và nhật ký nói thẳng ra điều đó. Cùng cách xử lý
 *    mà `runWorldTick` đã dùng cho tick sâu, và cùng lý do.
 *  - Thành trì đang bị VÂY vẫn chốt sổ bình thường. Không có ngoại lệ ở đây, vì
 *    `advanceWeek` đã biết `besieged` và đổi hẳn cách tính lòng dân theo nó.
 */

import { addDays, type GameDate } from '@/core/clock';
import type { Rng } from '@/core/rng';
import type { PatchOp } from '@/state/mvu-parse';
import type { GameState } from '@/state/slices';
import { holdingsStateOf } from './slice';
import { NO_LORD, type LordContext } from './population';
import { advanceWeek } from './week';
import type { Holding } from './types';

/** Bao nhiêu tuần được chốt bù trong MỘT lượt. Xem chú thích đầu file. */
export const MAX_WEEKS_PER_TICK = 60;

const DAYS_PER_WEEK = 7;

export interface HoldingTickResult {
  ops: PatchOp[];
  /** Dòng nhật ký cho bảng diễn biến. Đã gắn tên thành trì. */
  lines: string[];
  /** Số tuần thật sự đã chốt, cộng gộp mọi thành trì. */
  weeks: number;
}

export interface HoldingTickInput {
  state: GameState;
  /** Số ngày lịch vừa trôi — `FastTickResult.days` của bước 8. */
  days: number;
  /** Ngày SAU khi đã trôi. */
  date: GameDate;
  rng: Rng;
  turn: number;
  /**
   * Lãnh chúa: tàn bạo, nhân từ, tàn phế.
   *
   * VÀO QUA THAM SỐ, không đọc store bên trong — mục 13 của README khai đây là
   * một trong tám chỗ `holdings` chạm ra ngoài, và nó hợp lệ đúng vì nó là một
   * tham số. Người gọi ở `sim/worldtick.ts` đọc `siege.reputation` rồi bơm vào.
   */
  lord?: LordContext;
}

/**
 * Chốt sổ mọi thành trì cho quãng thời gian vừa trôi.
 *
 * Thuần theo nghĩa của Phần 0 mục 7: nhận state, trả về op. Không ghi store,
 * không phát event — người gọi cho lô đi qua MVU (R2).
 */
export function runHoldingTick(input: HoldingTickInput): HoldingTickResult {
  const slice = holdingsStateOf(input.state);
  if (slice === null || slice.list.length === 0) return { ops: [], lines: [], weeks: 0 };
  if (input.days <= 0) return { ops: [], lines: [], weeks: 0 };

  const lines: string[] = [];
  let weeks = 0;
  let changed = false;

  const list = slice.list.map((holding) => {
    const settled = settle(holding, input, lines);
    if (settled.holding !== holding) changed = true;
    weeks += settled.weeks;
    return settled.holding;
  });

  if (!changed) return { ops: [], lines: [], weeks: 0 };

  return {
    ops: [
      {
        op: 'set',
        path: 'holdings.list',
        from: slice.list,
        to: list,
        reason:
          weeks === 0
            ? `${String(input.days)} ngày trôi qua ở các thành trì`
            : `${String(weeks)} tuần chốt sổ ở các thành trì sau ${String(input.days)} ngày`,
        source: 'json',
      },
    ],
    lines,
    weeks,
  };
}

/** Chốt sổ MỘT thành trì. */
function settle(
  holding: Holding,
  input: HoldingTickInput,
  lines: string[],
): { holding: Holding; weeks: number } {
  const owed = holding.daysOwed + input.days;
  const due = Math.floor(owed / DAYS_PER_WEEK);
  const carried = owed - due * DAYS_PER_WEEK;

  // Chưa đủ một tuần: chỉ ghi lại số ngày đã trôi. Đây là nhánh chạy ở phần lớn
  // các lượt, và nó phải rẻ — một cảnh nói chuyện hai giờ không được kéo theo
  // cả bộ máy mùa vụ.
  if (due <= 0) return { holding: { ...holding, daysOwed: owed }, weeks: 0 };

  const capped = Math.min(due, MAX_WEEKS_PER_TICK);
  // Lùi ngày về đầu quãng chưa chốt rồi bước tới: mỗi tuần phải chốt với ĐÚNG
  // cái mùa của nó. Chốt bù bốn tháng bằng bốn lần gọi cùng một ngày tháng Chạp
  // là bốn lần mùa đông, và vụ gặt biến mất khỏi lịch sử của thành trì ấy.
  let when = addDays(input.date, -(capped * DAYS_PER_WEEK));
  let current = holding;

  for (let index = 0; index < capped; index++) {
    when = addDays(when, DAYS_PER_WEEK);
    const report = advanceWeek(current, input.rng, {
      date: when,
      turn: input.turn,
      lord: input.lord ?? NO_LORD,
      autoAssign: true,
      allowBorrow: true,
      state: input.state,
    });
    current = report.holding;
    for (const note of report.notes) lines.push(`${holding.name}: ${note}`);
  }

  if (due > capped) {
    lines.push(
      `${holding.name}: ${String(due - capped)} tuần trôi qua mà không ai chốt sổ — quá lâu để lần theo từng tuần.`,
    );
  }

  return { holding: { ...current, daysOwed: carried }, weeks: capped };
}

/**
 * Còn mấy ngày nữa tới kỳ chốt sổ tới. Bảng trạng thái đọc con số này.
 *
 * Người chơi phải THẤY được cái nhịp mình đang chờ. Không thấy thì việc "thành
 * trì tự chạy theo lịch" trông y hệt việc "thành trì không chạy".
 */
export function daysToSettlement(holding: Holding): number {
  return Math.max(0, DAYS_PER_WEEK - Math.floor(holding.daysOwed));
}
