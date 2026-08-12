/**
 * CHÍNH DANH — chỉ số trung tâm của Phần 13 (mục 5).
 *
 * > "Chính danh (legitimacy 0–100) là chỉ số trung tâm của Phần 13, ảnh hưởng
 * > gần như mọi kiểm định cai trị."
 *
 * Câu ấy chỉ đúng nếu chính danh đi qua REGISTRY MODIFIER của Phần 5 mục 7 chứ
 * không được cộng tay ở từng chỗ gọi. README mục 8.4 xếp đây là chỗ dễ hỏng thứ
 * tư của cả dự án, và lý do rất cụ thể: một người chơi chiếm ngôi rồi hỏng liên
 * tục mọi phép kiểm mà KHÔNG THẤY DÒNG NÀO nói vì sao thì họ chỉ có thể kết luận
 * là game ăn gian — và game này không có reroll.
 *
 * Nên toàn bộ ảnh hưởng của chính danh nằm trong ĐÚNG MỘT nguồn đăng ký ở dưới,
 * khai miền `rule.*`, và nó sinh ra một dòng tiếng Việt đọc được.
 *
 * QUY ĐỔI đi qua `scaleToSystem` của Phần 5, không tự chọn con số riêng cho từng
 * hệ: kiểm định cai trị chạy 3d6, nhưng một ngày nào đó một phép kiểm cai trị
 * chạy d100 (thuyết phục một chư hầu) thì "chính danh 30" phải nặng đúng bằng
 * nhau ở cả hai chỗ.
 */

import type { ModifierSource } from '@/systems/check/registry';
import { modifierSources, registerModifierSource } from '@/systems/check/registry';
import { bonusFor } from '@/systems/check/sources';
import { legitimacyConfig } from './data';
import { primaryTitleOf } from './slice';
import type { HeldTitle, LegitimacyEntry, TitlePath } from './types';
import { registerTitleInfluenceSource } from './influence';

export const LEGITIMACY_SOURCE = 'titles.chinh-danh';

/** Chính danh khởi đầu của một con đường lên tước (mục 5). */
export function startingLegitimacy(path: TitlePath): number {
  const config = legitimacyConfig();
  return clampLegitimacy(config.startByPath[path] ?? config.settle);
}

export function clampLegitimacy(value: number): number {
  const config = legitimacyConfig();
  return Math.max(config.min, Math.min(config.max, Math.round(value)));
}

/**
 * Sổ chính danh: cộng một khoản và ghi LÝ DO.
 *
 * Lý do không phải trang trí. Mục 5 nói một kẻ chiếm đoạt "phải bỏ nhiều năm gây
 * dựng lại", và người chơi chỉ tin điều đó nếu họ đọc được từng dòng mình đã gây
 * dựng bằng cách nào.
 */
export function adjustLegitimacy(
  title: HeldTitle,
  delta: number,
  reason: string,
  year: number,
): { title: HeldTitle; entry: LegitimacyEntry } {
  const next = clampLegitimacy(title.legitimacy + delta);
  return {
    title: { ...title, legitimacy: next },
    entry: { year, fiefId: title.fiefId, delta: next - title.legitimacy, reason },
  };
}

/**
 * TRÔI VỀ `settle` MỖI NĂM.
 *
 * Đây là vế "phải bỏ nhiều năm gây dựng lại" của mục 5, và cũng là vế ngược lại:
 * một tước được phong đàng hoàng cũng mài mòn dần nếu chủ nhân không làm gì cả.
 * Thời gian một mình không đưa ai lên 100, và cũng không dìm ai xuống 0.
 */
export function driftLegitimacy(title: HeldTitle, years = 1): HeldTitle {
  const config = legitimacyConfig();
  const gap = config.settle - title.legitimacy;
  if (gap === 0) return title;
  const step = Math.sign(gap) * Math.min(Math.abs(gap), config.driftPerYear * years);
  return { ...title, legitimacy: clampLegitimacy(title.legitimacy + step) };
}

/** Bao nhiêu năm nữa thì một kẻ chiếm đoạt đứng ngang một người được phong. */
export function yearsToRebuild(title: HeldTitle): number {
  const config = legitimacyConfig();
  if (title.legitimacy >= config.settle) return 0;
  return Math.ceil((config.settle - title.legitimacy) / Math.max(0.1, config.driftPerYear));
}

/** Nhãn tiếng Việt của một mức chính danh — cho UI và cho khối prompt 6B. */
export function legitimacyLabel(value: number): string {
  if (value >= 85) return 'không ai dám hỏi';
  if (value >= 70) return 'vững';
  if (value >= 55) return 'được công nhận';
  if (value >= 40) return 'có người xì xào';
  if (value >= 25) return 'lung lay';
  return 'bị coi là kẻ tiếm quyền';
}

// ---------------------------------------------------------------------------
// Nguồn modifier — cửa DUY NHẤT chính danh ảnh hưởng vào phép kiểm
// ---------------------------------------------------------------------------

export const legitimacySource: ModifierSource = {
  id: LEGITIMACY_SOURCE,
  // `rule.*` — mọi kiểm định cai trị của mục 8, và KHÔNG áp vào đánh nhau hay kỹ
  // năng cá nhân: một bá tước tiếm quyền vẫn cầm kiếm giỏi y như cũ.
  domains: ['rule.*'],
  compute(ctx) {
    // Tước ĐANG DÙNG để cai trị là bậc cao nhất đang giữ. Người chơi giữ nhiều
    // tước ở nhiều thang (mục 3), nhưng một phép kiểm cai trị chỉ đứng trên một
    // tờ giấy — và đó là tờ cao nhất.
    const title = primaryTitleOf(ctx.state);
    if (title === null) return null;
    const config = legitimacyConfig();
    const offset = title.legitimacy - config.neutral;
    if (Math.round(offset) === 0) return null;
    const value = (offset / 10) * config.perTenPoints;
    return [
      bonusFor(
        ctx.system,
        `Chính danh ${String(Math.round(title.legitimacy))} — ${legitimacyLabel(title.legitimacy)}`,
        value,
        LEGITIMACY_SOURCE,
      ),
    ];
  },
};

/** Đăng ký một lần lúc khởi động. Gọi lại lần nữa không nổ. */
export function registerTitleSources(): void {
  if (!modifierSources().some((source) => source.id === LEGITIMACY_SOURCE)) {
    registerModifierSource(legitimacySource);
  }
  registerTitleInfluenceSource();
}
