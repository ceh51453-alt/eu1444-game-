/**
 * SLICE `siege` — TIẾNG TÀN BẠO SỐNG THẬT TRONG STATE (Phần 11 mục 7).
 *
 * Mục 7 gọi đây là "HỆ QUẢ QUAN TRỌNG NHẤT" của cả phần, và nó chỉ là hệ quả nếu
 * nó SỐNG LÂU HƠN cuộc vây hãm sinh ra nó. Một con số nằm trong `SiegeState` sẽ
 * biến mất cùng lúc với màn hình đóng lại, và khi ấy câu "mọi thành trì khác nghe
 * tin sẽ không chịu đầu hàng nữa" không có chỗ nào để đúng — R2 nói thẳng: không
 * dữ liệu nào chỉ tồn tại trong văn bản, và cũng không dữ liệu nào chỉ tồn tại
 * trong một minigame đã đóng.
 *
 * QUYỀN GHI LÀ `engine` CHO TẤT CẢ, không có ngoại lệ. Nếu AI ghi được vào
 * `reputation.tanBao` thì nó sẽ tự thưởng cho người chơi một tiếng nhân từ sau
 * một đoạn văn cảm động, và cả cơ chế của mục 7 sụp trong đúng một lượt.
 *
 * `holds` là sổ những thành đã đổi chủ. Phần 15 đọc nó khi tính phản ứng của các
 * thành khác, và Phần 13 đọc nó khi hỏi ai đang giữ cái gì.
 */

import { z } from 'zod';
import type { SliceDefinition } from '@/state/slices';
import type { GameState } from '@/state/slices';

export const siegeRecordSchema = z.object({
  /** `hold_*` — tiền tố bắt buộc của README dự án mục 7.1. */
  holdId: z.string(),
  name: z.string(),
  /** Lượt trong game lúc cuộc vây hãm kết thúc. */
  turn: z.number().int().min(0),
  weeks: z.number().int().min(0),
  ending: z.string(),
  /** Bên thắng: `vay` · `thu` · rỗng khi không phân thắng bại. */
  winner: z.string(),
  sacked: z.boolean(),
  terms: z.array(z.string()),
});

export const siegeSliceSchema = z.object({
  reputation: z.object({
    /** TIẾNG TÀN BẠO. Càng cao thì thành sau càng tử thủ tới cùng. */
    tanBao: z.number().min(0).default(0),
    /** Tiếng nhân từ. Càng cao thì cổng càng dễ mở. */
    nhanTu: z.number().min(0).default(0),
    /** Thái độ Giáo hội. Âm là đang bị lên án. */
    giaoHoi: z.number().default(0),
  }),
  holds: z.array(siegeRecordSchema).default([]),
});

export type SiegeSliceState = z.infer<typeof siegeSliceSchema>;

export const siegeSlice: SliceDefinition = {
  id: 'siege',
  version: 1,
  schema: siegeSliceSchema,
  defaults: () => ({ reputation: { tanBao: 0, nhanTu: 0, giaoHoi: 0 }, holds: [] }),
  permissions: {
    'reputation.*': 'engine',
    'holds.*': 'engine',
  },
};

export function siegeStateOf(state: GameState | null): SiegeSliceState | null {
  if (state === null) return null;
  const parsed = siegeSliceSchema.safeParse(state['siege']);
  return parsed.success ? parsed.data : null;
}

/**
 * Tiếng tàn bạo hiện tại của ván chơi.
 *
 * Đây là cửa Phần 15 gọi khi hỏi "thành này có chịu mở cổng không", và cũng là
 * cửa `createSiege` gọi để nạp con số ấy vào cuộc vây hãm mới — nhờ vậy hệ quả
 * của thành trước đi thẳng vào bàn đàm phán của thành sau.
 */
export function crueltyOf(state: GameState | null): number {
  return siegeStateOf(state)?.reputation.tanBao ?? 0;
}

export function mercyOf(state: GameState | null): number {
  return siegeStateOf(state)?.reputation.nhanTu ?? 0;
}

export function churchOf(state: GameState | null): number {
  return siegeStateOf(state)?.reputation.giaoHoi ?? 0;
}
