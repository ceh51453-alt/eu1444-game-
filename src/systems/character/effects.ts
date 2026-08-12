/**
 * KHUÔN HIỆU ỨNG DÙNG CHUNG cho đặc tính chủng tộc, tôn giáo, văn hóa và trang bị.
 *
 * Bốn nguồn đó khai cùng một hình dạng vì chúng làm cùng một việc: cộng một
 * khoản đọc được vào một miền kiểm định, có điều kiện hoàn cảnh. Nếu mỗi cái
 * một hình dạng thì sẽ có bốn vòng lặp gần giống nhau ở bốn chỗ, và bốn chỗ đó
 * sẽ lệch nhau — thường là ở chuyện quy đổi sang hệ 3d6, vì đó là chỗ dễ quên.
 *
 * `value` LUÔN theo thang d100 và DƯƠNG LÀ DỄ HƠN. Quy đổi sang ba hệ còn lại
 * là việc của `scaleToSystem` ở Phần 5, không phải việc của người viết data.
 *
 * File này CỐ Ý không import gì từ `systems/check`: nó là mô tả dữ liệu thuần,
 * còn chỗ biến hiệu ứng thành dòng modifier nằm ở `modifiers.ts`.
 */

import { z } from 'zod';

export const effectSchema = z.object({
  /** Mẫu miền, hỗ trợ `*` và `skill.*` như registry của Phần 5. */
  domains: z.array(z.string()).min(1),
  value: z.number(),
  kind: z.enum(['flat', 'dieShift']).default('flat'),
  /** Chỉ áp khi hoàn cảnh có ÍT NHẤT một nhãn này. Rỗng là luôn áp. */
  whenAnyTag: z.array(z.string()).default([]),
  /** Không áp nếu hoàn cảnh có bất kỳ nhãn nào ở đây. */
  unlessAnyTag: z.array(z.string()).default([]),
});

export type Effect = z.infer<typeof effectSchema>;

/** Hoàn cảnh có kích hoạt hiệu ứng này không — đọc `tags` của Phần 5. */
export function effectApplies(effect: Effect, tags: readonly string[]): boolean {
  if (effect.unlessAnyTag.some((tag) => tags.includes(tag))) return false;
  if (effect.whenAnyTag.length === 0) return true;
  return effect.whenAnyTag.some((tag) => tags.includes(tag));
}

/**
 * Một nguồn có thể mạnh yếu theo một con số 0–100: mức sùng đạo với tôn giáo,
 * mức hòa nhập với văn hóa, chất lượng chế tác với trang bị.
 *
 * Nhân CẢ hiệu ứng tốt lẫn hiệu ứng xấu, có chủ ý: một người sùng đạo vừa được
 * nhiều hơn từ đức tin vừa bị trói nhiều hơn bởi điều cấm của nó. Nếu chỉ nhân
 * vế tốt thì sùng đạo tối đa luôn là lựa chọn đúng, và cả một trục nhập vai
 * biến thành một ô phải kéo hết cỡ.
 *
 * Làm tròn về 0 thì bỏ hẳn dòng đó — một dòng `+0` trong bảng điều chỉnh chỉ
 * làm người đọc mất thời gian.
 */
export function scaleIntensity(value: number, intensity: number): number {
  const scaled = Math.round((value * Math.max(0, Math.min(100, intensity))) / 100);
  return scaled;
}
