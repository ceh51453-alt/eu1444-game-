/**
 * Lịch trong game.
 *
 * PHẦN 0 CHỈ KHAI BÁO KIỂU + mốc bắt đầu, đủ để `state/store.ts` biên dịch.
 * Chưa làm: cộng ngày, mùa vụ, ngày lễ nhà thờ, độ dài ngày theo mùa, quy đổi
 * thời gian hành động → ngày. Những thứ đó thuộc các phần sau (thời gian di
 * chuyển ở Phần 13, mùa vụ ở Phần 12, chiến trận ban đêm ở Phần 14b).
 */

/** Một mốc thời gian trong thế giới game. Tất cả đều đánh số từ 1. */
export interface GameDate {
  year: number;
  /** 1–12. */
  month: number;
  /** 1–31. */
  day: number;
  /** 0–23. Giờ trong ngày, dùng cho hành cảnh ngày/đêm. */
  hour: number;
}

/**
 * Mốc mở màn mặc định của chiến dịch: năm ngày sau Trận Varna.
 *
 * KHÔNG phải 1/1/1444, dù tên dự án là "1444". Lorebook của chiến dịch mô tả
 * thế giới ở trạng thái HẬU Varna — Varna đánh ngày 10/11/1444, mà entry chiến
 * trường Varna viết "vừa diễn ra", entry Đế chế Ottoman viết "sau khi đè bẹp
 * liên quân Thập Tự Chinh". Mở màn ở tháng Giêng thì hai entry đó nói về một
 * trận chưa xảy ra, và người chơi đọc được tương lai ngay lượt đầu.
 */
export const DEFAULT_START_DATE: GameDate = {
  year: 1444,
  month: 11,
  day: 15,
  hour: 6,
};

/** Chuỗi hiển thị thô. UI thật sẽ thay bằng định dạng theo ngôn ngữ ở Phần 3. */
export function formatGameDate(date: GameDate): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${pad(date.day)}/${pad(date.month)}/${date.year} ${pad(date.hour)}:00`;
}

/**
 * Số ngày của một tháng, theo lịch Julius — lịch mà châu Âu 1444 đang dùng.
 *
 * Luật nhuận của Julius đơn giản hơn Gregory: cứ bốn năm một lần, không có ngoại
 * lệ thế kỷ. Dùng luật Gregory ở đây là lệch một ngày so với chính niên đại mà
 * lorebook mô tả — nhỏ, nhưng nó sẽ len vào mọi hạn chót và mọi mùa vụ.
 */
export function daysInMonth(year: number, month: number): number {
  const lengths = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month === 2 && year % 4 === 0) return 29;
  return lengths[month - 1] ?? 30;
}

/**
 * Cộng ngày vào một mốc thời gian. Thuần: trả mốc mới, không sửa mốc cũ.
 *
 * PHẦN 0 CỐ Ý ĐỂ TRỐNG chỗ này, và Phần 8 là phần đầu tiên thật sự cần: nghĩa vụ
 * nợ thầy có hạn chót, và một hạn chót đo bằng "số lượt" thì vô nghĩa với người
 * chơi đang đọc một cuốn lịch. Phần 12 (mùa vụ) và Phần 13 (thời gian di chuyển)
 * xây tiếp trên hàm này chứ không dựng hàm riêng.
 */
export function addDays(date: GameDate, days: number): GameDate {
  let { year, month, day } = date;
  let remaining = Math.round(days);

  while (remaining > 0) {
    const length = daysInMonth(year, month);
    if (day + remaining <= length) {
      day += remaining;
      remaining = 0;
      break;
    }
    remaining -= length - day + 1;
    day = 1;
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }

  while (remaining < 0) {
    if (day + remaining >= 1) {
      day += remaining;
      remaining = 0;
      break;
    }
    remaining += day;
    month -= 1;
    if (month < 1) {
      month = 12;
      year -= 1;
    }
    day = daysInMonth(year, month);
  }

  return { ...date, year, month, day };
}

/**
 * Cộng tháng nhưng giữ ngày trong tháng khi có thể. Ngày 31 đi sang tháng Hai
 * được kẹp ở ngày cuối tháng, thay vì tràn sang tháng Ba.
 */
export function addMonths(date: GameDate, months: number): GameDate {
  const whole = Math.round(months);
  const zeroBased = date.year * 12 + (date.month - 1) + whole;
  const year = Math.floor(zeroBased / 12);
  const month = ((zeroBased % 12) + 12) % 12 + 1;
  return { ...date, year, month, day: Math.min(date.day, daysInMonth(year, month)) };
}

/**
 * Mùa của một mốc thời gian.
 *
 * Id trùng với `data/fortifications.json → config.seasons` và
 * `data/resources.json → labour.seasons` có chủ ý: một cuộc vây hãm mùa đông và
 * một công trường mùa đông phải nói về CÙNG một mùa đông. Hai bảng mùa với hai
 * bộ id khác nhau là cách chắc chắn nhất để chúng lệch nhau sau vài phần nữa.
 *
 * Cắt theo THÁNG chứ không theo điểm phân chí: nông dân thế kỷ 14 cũng cắt thế,
 * và mọi thứ đọc hàm này (mùa vụ ở Phần 12, hao mòn vây hãm ở Phần 11) đều tính
 * theo tuần trọn chứ không cần độ chính xác tới ngày.
 */
export type SeasonId = 'xuan' | 'ha' | 'thu' | 'dong';

export function seasonOfDate(date: GameDate): SeasonId {
  const month = date.month;
  if (month >= 3 && month <= 5) return 'xuan';
  if (month >= 6 && month <= 8) return 'ha';
  if (month >= 9 && month <= 11) return 'thu';
  return 'dong';
}

/** Tuần thứ mấy kể từ đầu năm, 0-based. Thành trì đo thời gian bằng TUẦN. */
export function weekOfYear(date: GameDate): number {
  let days = date.day - 1;
  for (let month = 1; month < date.month; month++) days += daysInMonth(date.year, month);
  return Math.floor(days / 7);
}
