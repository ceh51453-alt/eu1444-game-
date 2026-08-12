/**
 * THANG ĐỘ KHÓ CHUẨN HÓA (Phần 5 mục 8).
 *
 * MỘT thang duy nhất, tự quy đổi sang cả bốn hệ. Luật cứng của mục 8: code chỉ
 * được nhận vào TÊN BẬC, không nhận số thô — nhờ vậy cân bằng lại toàn game chỉ
 * phải sửa đúng một bảng ở file này. Một chỗ nào đó truyền thẳng `-20` vào là
 * con số đó vĩnh viễn nằm ngoài tầm với của người cân bằng.
 *
 * Bốn cột không phải bốn cách viết của cùng một con số:
 *   d100  cộng thẳng vào ngưỡng kỹ năng (tung-dưới, nên số dương là dễ hơn)
 *   dc    ĐỘ KHÓ phải vượt của hệ d20 (số lớn là khó hơn)
 *   d6    cộng vào ngưỡng 3d6 (tung-dưới)
 *   pool  SỐ THÀNH CÔNG CẦN, không phải số viên xúc sắc
 */

import type { DifficultyBand } from '@/core/turn';

/**
 * Sáu bậc, id không dấu để dùng được trong file data và tên biến.
 * Union nằm ở `@/core/turn` cùng chỗ với `CheckResult` — nó là một phần của hợp
 * đồng vòng lặp lượt, còn bảng số dưới đây thì không.
 */
export type { DifficultyBand };

export interface DifficultyRow {
  band: DifficultyBand;
  /** Nhãn tiếng Việt, đi thẳng vào dòng modifier mà người chơi đọc. */
  label: string;
  /** Cộng vào ngưỡng d100. */
  d100: number;
  /** DC của hệ d20. */
  dc: number;
  /** Cộng vào ngưỡng 3d6. */
  d6: number;
  /** Số thành công cần của dice pool. */
  pool: number;
}

export const DIFFICULTY_LADDER: readonly DifficultyRow[] = [
  { band: 'de-dang', label: 'Dễ dàng', d100: 40, dc: 8, d6: 4, pool: 1 },
  { band: 'thuong', label: 'Thường', d100: 0, dc: 12, d6: 0, pool: 2 },
  { band: 'kho', label: 'Khó', d100: -20, dc: 16, d6: -4, pool: 3 },
  { band: 'rat-kho', label: 'Rất khó', d100: -40, dc: 20, d6: -8, pool: 4 },
  { band: 'cuc-kho', label: 'Cực khó', d100: -60, dc: 25, d6: -12, pool: 6 },
  { band: 'gan-bat-kha', label: 'Gần bất khả', d100: -80, dc: 30, d6: -16, pool: 8 },
] as const;

export const DIFFICULTY_BANDS: readonly DifficultyBand[] = DIFFICULTY_LADDER.map((row) => row.band);

export class CheckError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CheckError';
  }
}

/**
 * Tra một bậc. Ném lỗi khi tên bậc lạ, không im lặng lùi về "Thường".
 *
 * Cùng lý do `dice.roll` của Phần 0 ném lỗi thay vì trả 0: một bậc gõ sai mà
 * lặng lẽ hóa thành "Thường" thì cả một hệ thống sẽ dễ hơn thiết kế và không ai
 * phát hiện được cho tới lúc chơi thật. Tên bậc đến từ code, không đến từ AI —
 * nên đây là bug của lập trình viên, phải nổ ngay.
 */
export function difficulty(band: DifficultyBand): DifficultyRow {
  const row = DIFFICULTY_LADDER.find((candidate) => candidate.band === band);
  if (row === undefined) {
    throw new CheckError(`bậc độ khó không có trong thang: "${String(band)}"`);
  }
  return row;
}

/** Nhãn tiếng Việt của một bậc, cho UI và cho dòng modifier. */
export function difficultyLabel(band: DifficultyBand): string {
  return difficulty(band).label;
}
