/**
 * BAN LUẬT VÀ BÃI LUẬT (mục 8).
 *
 * Một điều luật có PHẠM VI ÁP DỤNG, không có TỌA ĐỘ (mục 1) — nên `scope` ở đây
 * chỉ có hai giá trị, `realm` và `province`, và không bao giờ có giá trị thứ ba
 * tên là `holding`. "Ban lệnh cấm săn trong lâu đài" là cụm sai số 5 của Phụ lục
 * A mục 4, và cách chắc chắn nhất để nó không xảy ra là không có chỗ nào trong
 * kiểu dữ liệu để viết nó ra.
 *
 * HỆ QUẢ XUỐNG TỚI THÀNH TRÌ đi qua đúng một cửa: `RealmOrder{kind:'dat-luat'}`
 * của Phần 12, và nó chỉ mang HAI CON SỐ (`moraleShift`, `outputShift`) chứ không
 * mang nguyên văn điều luật. Đây là chỗ ranh giới dễ vỡ nhất — để nguyên văn đi
 * xuống là mở đường cho cả bộ luật của Phần 13 sống trong `holdings`.
 */

import type { RealmOrder } from '@/systems/holding/interfaces';
import { lawOf, lawsForRank, type Law, type LawEffects } from './data';
import type { Province } from './types';

export class RealmLawError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RealmLawError';
  }
}

export interface LawVerdict {
  ok: boolean;
  reason: string;
}

/** Ban được điều luật này không, và nếu không thì VÌ SAO. */
export function canIssue(lawId: string, rank: number, treasury: number, active: readonly string[]): LawVerdict {
  const law = lawOf(lawId);
  if (law === null) return { ok: false, reason: `Không có điều luật "${lawId}".` };
  if (active.includes(lawId)) return { ok: false, reason: `${law.name} đang có hiệu lực rồi.` };
  if (rank < law.requiresRank) {
    return { ok: false, reason: `${law.name} đòi bậc ${String(law.requiresRank)} trở lên; ngài đang ở bậc ${String(rank)}.` };
  }
  if (treasury < law.cost) {
    return { ok: false, reason: `${law.name} tốn ${String(law.cost)} đồng; kho còn ${String(Math.round(treasury))}.` };
  }
  return { ok: true, reason: '' };
}

export function lawsAvailable(rank: number, active: readonly string[]): Law[] {
  return lawsForRank(rank).filter((law) => !active.includes(law.id));
}

export interface IssueResult {
  laws: string[];
  cost: number;
  /** Luật một lần (ân xá) KHÔNG vào danh sách đang áp — nó là một sự kiện. */
  oneOff: boolean;
  law: Law;
  line: string;
}

/**
 * Ban một điều luật.
 *
 * Không tung xúc sắc: ban luật là một tuyên bố, không phải một phép kiểm. Việc
 * luật có được TUÂN THEO không mới là chỗ có xác suất, và nó nằm ở lòng trung của
 * chư hầu (mục 7) chứ không nằm ở lúc đóng dấu.
 */
export function issueLaw(active: readonly string[], lawId: string): IssueResult {
  const law = lawOf(lawId);
  if (law === null) throw new RealmLawError(`không có điều luật "${lawId}"`);
  return {
    laws: law.oneOff ? [...active] : [...new Set([...active, lawId])],
    cost: law.cost,
    oneOff: law.oneOff,
    law,
    line: law.oneOff
      ? `${law.name} được thi hành ngay.`
      : `${law.name} có hiệu lực ${law.scope === 'province' ? 'trong tỉnh đã chọn' : 'trong toàn vùng'} kể từ hôm nay.`,
  };
}

export interface OneOffLawResult {
  provinces: Province[];
  legitimacy: number;
  line: string;
}

/** Thi hành hiệu quả tức thời của một luật một lần; luật đó không được lưu vào danh sách đang áp. */
export function applyOneOffLaw(
  provinces: readonly Province[],
  lawId: string,
  provinceId = '',
): OneOffLawResult {
  const law = lawOf(lawId);
  if (law === null || !law.oneOff) throw new RealmLawError(`"${lawId}" không phải luật một lần`);
  const applies = (province: Province): boolean => law.scope === 'realm' || province.id === provinceId;
  return {
    provinces: provinces.map((province) =>
      applies(province)
        ? {
            ...province,
            unrest: Math.max(0, Math.min(100, province.unrest + law.effects.unrest)),
            banditry: Math.max(0, Math.min(100, province.banditry + law.effects.banditry)),
            development: Math.max(0, Math.min(100, province.development + law.effects.development)),
          }
        : province,
    ),
    legitimacy: law.effects.legitimacyPerYear,
    line: `${law.name} đã tác động ngay tới ${law.scope === 'realm' ? 'toàn vùng' : 'tỉnh đã chọn'}.`,
  };
}

export function repealLaw(active: readonly string[], lawId: string): { laws: string[]; line: string } {
  const law = lawOf(lawId);
  return {
    laws: active.filter((id) => id !== lawId),
    line: law === null ? 'Không có điều luật nào như thế.' : `${law.name} bị bãi. Người được lợi vì nó sẽ nhớ.`,
  };
}

/**
 * CỘNG DỒN hệ quả của mọi điều luật đang áp.
 *
 * Cộng thẳng, không nhân, không thứ tự — vì một bộ luật thì không có thứ tự. Nếu
 * hai điều luật kéo ngược nhau thì chúng triệt tiêu nhau, và đó là điều đúng: một
 * lãnh chúa vừa cấm săn vừa cho tự do đi lại thì dân không biết ông ta muốn gì.
 */
export function foldLaws(active: readonly string[]): LawEffects & { upkeep: number; casesPerYear: number; roadsPerYear: number } {
  const total = {
    unrest: 0,
    banditry: 0,
    vassalLoyalty: 0,
    revenueFactor: 0,
    levyDays: 0,
    development: 0,
    legitimacyPerYear: 0,
    upkeep: 0,
    casesPerYear: 0,
    roadsPerYear: 0,
  };

  for (const id of active) {
    const law = lawOf(id);
    if (law === null) continue;
    total.unrest += law.effects.unrest;
    total.banditry += law.effects.banditry;
    total.vassalLoyalty += law.effects.vassalLoyalty;
    total.revenueFactor += law.effects.revenueFactor;
    total.levyDays += law.effects.levyDays;
    total.development += law.effects.development;
    total.legitimacyPerYear += law.effects.legitimacyPerYear;
    total.upkeep += law.upkeepPerYear;
    total.casesPerYear += law.casesPerYearBonus;
    total.roadsPerYear += law.roadsPerYear;
  }

  return total;
}

/** Luật áp lên một tỉnh cụ thể = luật cấp lãnh thổ + luật cấp tỉnh của chính nó. */
export function lawsOn(province: Province, realmLaws: readonly string[]): string[] {
  return [...new Set([...realmLaws, ...province.laws])];
}

/**
 * Một điều luật ĐI XUỐNG một thành trì.
 *
 * Trả về một `RealmOrder` — DỮ LIỆU THUẦN, không phải một `Holding` đã sửa. Chỗ
 * gọi đưa nó cho `applyRealmOrder` của Phần 12, và nhờ vậy không hàm nào ở tầng
 * này từng cầm một `Holding`. Đó là toàn bộ cách hai tầng gặp nhau ở đây.
 */
export function lawOrder(lawId: string): RealmOrder {
  const law = lawOf(lawId);
  if (law === null) throw new RealmLawError(`không có điều luật "${lawId}"`);
  return {
    kind: 'dat-luat',
    law: {
      moraleShift: law.holdingEffect.moraleShift,
      outputShift: law.holdingEffect.outputShift,
      label: law.name,
    },
  };
}

/** Cấp khu định cư thấp nhất bị bắt buộc phải xin giấy phép, theo luật đang áp. */
export function permitRequiredFromTier(active: readonly string[]): number {
  let lowest = 0;
  for (const id of active) {
    const law = lawOf(id);
    if (law === null || law.permitRequiredFromTier === 0) continue;
    lowest = lowest === 0 ? law.permitRequiredFromTier : Math.min(lowest, law.permitRequiredFromTier);
  }
  return lowest;
}

/** Nhãn cho khối prompt 6B: "cấm tư chiến, độc quyền cối xay". */
export function lawLabel(active: readonly string[]): string {
  const names = active.map((id) => lawOf(id)?.name ?? id);
  return names.length === 0 ? 'chưa ban luật nào' : names.join(', ').toLowerCase();
}
