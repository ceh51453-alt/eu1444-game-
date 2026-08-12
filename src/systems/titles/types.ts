/**
 * KIỂU CỦA TẦNG THÁI ẤP — Phần 13 mục 5, 7, 9.
 *
 * THÁI ẤP LÀ MỘT TỜ GIẤY CÓ ẤN TRIỆN (Phụ lục A mục 1). Mọi thứ trong file này
 * là nội dung của tờ giấy đó: ai phong, phong bao giờ, nợ những gì, và ai đứng
 * sau trong hàng. Không kiểu nào ở đây cầm một `Holding`, không kiểu nào cầm một
 * lưới ô, và không kiểu nào giữ một con số dân — ba thứ ấy thuộc tầng thành trì.
 *
 * BA ĐỘNG TỪ được phép đi với những kiểu này: **phong, thừa kế, tước đoạt**
 * (Phụ lục A mục 4). "Chiếm" là động từ của thành trì, và đó là lý do
 * `TitlePath` gọi con đường thứ ba là `chiem-doat` chứ không phải `chiem`:
 * đất chiếm bằng quân, danh vị đoạt bằng pháp lý, và hai việc đó khác nhau.
 */

import type { FiefId } from '@/core/ids';

/** BA CON ĐƯỜNG LÊN TƯỚC (mục 5). Chính danh khởi đầu khác hẳn nhau. */
export const TITLE_PATHS = ['duoc-phong', 'thua-ke', 'chiem-doat'] as const;
export type TitlePath = (typeof TITLE_PATHS)[number];

/** Nghĩa vụ ghi trên tờ giấy — vế NGƯỜI GIỮ NỢ LÊN TRÊN của hợp đồng hai chiều. */
export interface FiefObligations {
  /**
   * SỐ NGÀY QUÂN DỊCH MỖI NĂM — chính là con số Phần 11 dùng khi đi vây
   * (mục 12.5). Đặt ra ở đây, tiêu ở đó.
   */
  levyDays: number;
  /** Phần cống nộp mỗi năm, tính bằng đồng. */
  tribute: number;
  /** Số ngày phải hầu triều mỗi năm. Vắng mặt là một mối hận có thật. */
  courtDays: number;
  /** Đã nộp đủ năm nay chưa. */
  paidThisYear: boolean;
  /** Đã hầu triều năm nay chưa. */
  attendedThisYear: boolean;
  /** Nợ mấy năm rồi. Nợ lâu là cớ để lãnh chúa cấp trên ra tay. */
  arrearsYears: number;
  /** Số ngày quân dịch đã bị gọi trong năm nay — vượt hạn là bẻ khế ước. */
  levyDaysCalled: number;
}

/**
 * MỘT TƯỚC ĐANG GIỮ.
 *
 * Người chơi giữ được NHIỀU tước ở NHIỀU thang cùng lúc (mục 3), nên đây là một
 * phần tử trong mảng chứ không phải một ô duy nhất. Xung đột nghĩa vụ giữa hai
 * thang là nguồn kịch tính chính của tầng cao, và nó chỉ tồn tại được nếu hai
 * tước cùng sống trong state.
 *
 * KHÔNG có `provinceIds` ở đây, có chủ ý: tỉnh nào thuộc thái ấp nào là một
 * trường của chính tỉnh (`Province.fiefId`). Giữ ở cả hai chỗ là hai nguồn sự
 * thật, và chúng sẽ lệch nhau ngay lần đầu một tỉnh đổi chủ.
 */
export interface HeldTitle {
  /** Id bậc trong `data/titles.json`. */
  titleId: string;
  /** `fief_*` — TỜ GIẤY. Nhìn id là biết loại (README mục 7.1). */
  fiefId: FiefId;
  /** Tên thái ấp, ví dụ "thái ấp Bá tước Swabia". Khoá sau khi đặt. */
  fiefName: string;
  ladderId: string;
  path: TitlePath;
  /** CHÍNH DANH 0–100 — chỉ số trung tâm của Phần 13 (mục 5). */
  legitimacy: number;
  /** Năm thụ phong. Giữ càng lâu càng ít ai hỏi ngài lấy nó ở đâu. */
  sinceYear: number;
  /** Thề với ai — id NPC hoặc tên. Rỗng nghĩa là giữ thẳng từ vương quyền. */
  liege: string;
  obligations: FiefObligations;
  /** Năm hết nhiệm kỳ. 0 nghĩa là tước thế tập, không hết hạn. */
  termEndsYear: number;
  /** Ai đang đòi cùng tờ giấy này. Rỗng là không ai. */
  rivalClaimant: string;
  /** Giáo hội đã công nhận chưa — vế Giáo hội của mục 5. */
  churchRecognised: boolean;
  note: string;
}

/** Một dòng trong sổ chính danh: vì sao nó lên hoặc xuống. */
export interface LegitimacyEntry {
  year: number;
  fiefId: string;
  delta: number;
  reason: string;
}

/** Một ứng viên trong hàng thừa kế (mục 9). */
export interface Heir {
  /** Khoá người nhà trong `character.family`, hoặc id NPC. */
  id: string;
  name: string;
  relation: string;
  age: number;
  sex: 'nam' | 'nu';
  alive: boolean;
  /** Điểm xếp hàng: cao hơn thì đứng trước. */
  weight: number;
  /** Vì sao đứng ở chỗ này — câu để UI hiện trong cây kế vị. */
  reason: string;
}
