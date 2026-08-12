/**
 * HAI NGUỒN MODIFIER GIẢ (Phần 5 mục 7 — "giai đoạn này chỉ dựng registry + 2
 * nguồn giả để test").
 *
 * Chúng tồn tại để chứng minh ba thứ mà một registry rỗng không chứng minh được:
 *   · một nguồn lọc theo miền thật sự chỉ chạy ở miền của nó
 *   · một nguồn biết tự quy đổi sang hệ đang chạy (d100 cộng ngưỡng, d20 đội
 *     DC, pool bớt viên) — đây là khuôn mà thương tích, thời tiết, sĩ khí ở các
 *     phần sau phải theo
 *   · nhãn tiếng Việt đi thẳng ra `CheckResult.modifiers` và ra tới UI
 *
 * Chúng đọc `tags` chứ không đọc state, vì state thật của mệt mỏi và thời tiết
 * chưa tồn tại. Phần 7 (thương tích), Phần 8 (kỹ năng) và Phần 16 (trang bị)
 * đăng ký nguồn THẬT và hai nguồn này biến mất.
 */

import type { CheckSystem } from '@/core/turn';
import { modifierSources, registerModifierSource, type Modifier, type ModifierKind, type ModifierSource } from './registry';

/**
 * BẢNG QUY ĐỔI DUY NHẤT giữa các hệ.
 *
 * `value` khai theo thang d100 và DƯƠNG LÀ DỄ HƠN. Mọi nguồn — thương tích
 * (P7), kỹ năng (P8), đặc tính chủng tộc (P6), trang bị (P16), thời tiết, sĩ
 * khí — phải đi qua đúng hàm này. Nếu mỗi nguồn tự chọn con số riêng cho từng
 * hệ thì "mệt" ở đấu tay đôi sẽ nặng khác "mệt" ở kiếm thuật, mà không ai cố ý
 * thiết kế như thế.
 *
 * Độ lớn được giữ ĐỐI XỨNG giữa thưởng và phạt: một hiệu ứng ±15 phải đổi ra
 * cùng một con số ở cả hai chiều, nếu không thì cùng một đặc tính sẽ mạnh yếu
 * khác nhau tùy hoàn cảnh nó bật lên.
 */
export function scaleToSystem(system: CheckSystem, value: number): { value: number; kind: ModifierKind } {
  const sign = value < 0 ? -1 : 1;
  const size = Math.abs(value);
  switch (system) {
    case 'd100':
      return { value, kind: 'flat' };
    case '3d6':
      // Thang 3d6 hẹp hơn d100 khoảng năm lần.
      return { value: sign * Math.max(1, Math.round(size / 5)), kind: 'flat' };
    case 'd20':
      // d20 đụng vào ĐỘ KHÓ chứ không bớt của người tung — cùng hiệu ứng, đúng
      // đơn vị. Nên dấu bị đảo: dễ hơn nghĩa là DC thấp xuống.
      return { value: -sign * Math.max(1, Math.round(size / 5)), kind: 'dc' };
    case 'pool':
      return { value: sign * Math.max(1, Math.round(size / 10)), kind: 'pool' };
  }
}

/**
 * Quy một mức PHẠT sang đúng đơn vị của hệ đang chạy.
 * `penalty` dương = phạt nặng, tức là `-penalty` trên thang chung ở trên.
 */
export function penaltyFor(system: CheckSystem, label: string, penalty: number, source: string): Modifier {
  return { label, source, ...scaleToSystem(system, -penalty) };
}

/** Quy một mức THƯỞNG sang đúng đơn vị của hệ đang chạy. `bonus` dương = dễ hơn. */
export function bonusFor(system: CheckSystem, label: string, bonus: number, source: string): Modifier {
  return { label, source, ...scaleToSystem(system, bonus) };
}

/** Mệt mỏi — chỉ áp cho kỹ năng cá nhân và chiến đấu. */
export const fatigueSource: ModifierSource = {
  id: 'demo.moi-met',
  domains: ['skill.*', 'combat.*'],
  compute(ctx) {
    if (!ctx.tags.includes('moi-met')) return null;
    return [penaltyFor(ctx.system, 'Mệt rã người', 10, 'demo.moi-met')];
  },
};

/** Thời tiết — áp cho MỌI miền, kể cả quản trị (mưa dầm thì việc gì cũng chậm). */
export const weatherSource: ModifierSource = {
  id: 'demo.thoi-tiet',
  domains: ['*'],
  compute(ctx) {
    if (ctx.tags.includes('mua-lon')) {
      return [penaltyFor(ctx.system, 'Mưa lớn', 15, 'demo.thoi-tiet')];
    }
    if (ctx.tags.includes('ban-dem')) {
      return [penaltyFor(ctx.system, 'Trời tối', 20, 'demo.thoi-tiet')];
    }
    return null;
  },
};

/**
 * Đăng ký một lần lúc khởi động. Gọi lại lần nữa không nổ — `main.tsx` gọi lúc
 * boot, còn test gọi sau mỗi lần dọn registry.
 */
export function registerCheckSources(): void {
  const already = new Set(modifierSources().map((source) => source.id));
  for (const source of [fatigueSource, weatherSource]) {
    if (already.has(source.id)) continue;
    registerModifierSource(source);
  }
}
