/**
 * THUẾ (mục 8) — và cái nút mà Test A của mục 12.11 vặn hết cỡ.
 *
 * THUẾ LÀ THỨ LÃNH THỔ THU TỪ DÂN (Phụ lục A mục 4, cụm sai số 2). Thành trì thì
 * NỘP NGHĨA VỤ, và con số ấy đi vào từ `Tribute` của Phần 12 — không có hàm nào
 * ở đây "thu thuế của một thành trì", và đó là cố ý.
 *
 * Đơn vị của tầng này là PHẦN TRĂM (Phụ lục A mục 5). Người chơi đặt suất theo
 * từng NHÓM DÂN, và mỗi nhóm phản ứng khác nhau:
 *
 *   nông      đông nhất → ra nhiều tiền nhất VÀ nhiều bất ổn nhất
 *   thương    ít bất ổn, nhưng vượt ngưỡng là họ CHUYỂN ĐI, và tiền đi theo
 *   giáo hội  mỗi điểm trả bằng CHÍNH DANH
 *   quý tộc   bất ổn gần như không nhúc nhích, nhưng CHƯ HẦU GHI SỔ
 *
 * Bốn dòng trên là bốn cách thua khác nhau, và đó là toàn bộ thiết kế của mục
 * này: không có một cái cần gạt "thuế" duy nhất để kéo lên.
 */

import type { Rng } from '@/core/rng';
import type { CheckTier } from '@/core/turn';
import { runCheck } from '@/systems/check';
import type { GameState } from '@/state/slices';
import { taxConfig, taxGroupOf, taxGroups } from './data';
import { households, yieldFactor } from './province';
import type { Province } from './types';

/** Thuế suất mặc định của mọi nhóm — vạch xuất phát của một ván chơi. */
export function defaultRates(): Record<string, number> {
  const rates: Record<string, number> = {};
  for (const group of taxGroups()) rates[group.id] = group.baseRate;
  return rates;
}

/** Đặt suất cho một nhóm, kẹp trong trần sàn của chính nhóm ấy. */
export function setRate(rates: Readonly<Record<string, number>>, groupId: string, rate: number): Record<string, number> {
  const group = taxGroupOf(groupId);
  if (group === null) return { ...rates };
  return { ...rates, [groupId]: Math.max(group.minRate, Math.min(group.maxRate, Math.round(rate))) };
}

/** Đặt mọi nhóm lên kịch trần — đúng thao tác của Test A (mục 12.11). */
export function maxRates(): Record<string, number> {
  const rates: Record<string, number> = {};
  for (const group of taxGroups()) rates[group.id] = group.maxRate;
  return rates;
}

export interface TaxPressure {
  /** Cộng vào bất ổn của MỌI tỉnh. */
  unrest: number;
  /** Cộng vào lòng trung của MỌI chư hầu, mỗi năm. */
  vassalLoyalty: number;
  /** Cộng vào chính danh, mỗi năm. */
  legitimacy: number;
  /** Phần thương nhân bỏ đi — nhân thẳng vào thu. */
  merchantFlight: number;
  /** Dòng giải thích cho UI: vì sao vùng đang giận. */
  lines: string[];
}

/**
 * ÁP LỰC THUẾ: một bảng suất đổi ra bốn hệ quả.
 *
 * Mọi vế đều đo bằng "vượt bao nhiêu điểm so với `baseRate`", không đo bằng suất
 * tuyệt đối. Đó là lý do một lãnh chúa giữ nguyên suất mặc định không bị gì cả,
 * còn người vặn lên kịch trần thì mất lòng trung ĐỀU ĐẶN mỗi năm chứ không phải
 * một lần — và đó chính là cơ chế mà đường cong của Test A đi xuống theo.
 */
export function taxPressure(rates: Readonly<Record<string, number>>): TaxPressure {
  const pressure: TaxPressure = { unrest: 0, vassalLoyalty: 0, legitimacy: 0, merchantFlight: 0, lines: [] };

  for (const group of taxGroups()) {
    const rate = rates[group.id] ?? group.baseRate;
    const over = rate - group.baseRate;
    if (over === 0) continue;

    pressure.unrest += over * group.unrestPerPointOver * group.hatesTax * group.share * 2;
    pressure.vassalLoyalty += over * group.vassalLoyaltyPerPoint;
    pressure.legitimacy += over * group.legitimacyPerPoint;

    if (rate > group.fleeAbove) {
      pressure.merchantFlight += (rate - group.fleeAbove) * group.fleePerPointOver;
    }

    if (over > 0) {
      pressure.lines.push(
        `${group.name}: ${String(rate)}% — cao hơn thường lệ ${String(over)} điểm.`,
      );
    }
  }

  pressure.unrest = Math.round(pressure.unrest * 10) / 10;
  pressure.vassalLoyalty = Math.round(pressure.vassalLoyalty * 10) / 10;
  pressure.legitimacy = Math.round(pressure.legitimacy * 10) / 10;
  return pressure;
}

export interface RevenueResult {
  /** Tổng thu, đã trừ mọi hao hụt. Đơn vị: đồng. */
  amount: number;
  /** Thu lý thuyết nếu thu được hết — chênh lệch là chỗ tiền biến mất. */
  potential: number;
  tier: CheckTier;
  lines: string[];
}

/**
 * THU THUẾ MỘT NĂM.
 *
 * Là một KIỂM ĐỊNH (3d6, miền `rule.thu-thue`), không phải một phép nhân — mục 8
 * xếp cai trị vào năng lực dài hạn, và chênh lệch giữa thu lý thuyết với thu thật
 * chính là chỗ quản gia ăn chặn hoặc dân giấu lúa.
 *
 * KHÔNG nhận `Holding` nào. Vế "thành trì nộp gì lên" nằm ở `Tribute`, và nó được
 * cộng ở `year.ts` chứ không trộn vào đây — hai nguồn tiền, hai động từ, hai chỗ.
 */
export function collectTaxes(
  rng: Rng,
  provinces: readonly Province[],
  rates: Readonly<Record<string, number>>,
  options: { base: number; revenueFactor?: number; state?: GameState | null } = { base: 10 },
): RevenueResult {
  const config = taxConfig();
  const pressure = taxPressure(rates);

  let potential = 0;
  for (const province of provinces) {
    const perProvince =
      province.development * config.revenuePerDevelopment +
      (households(province) / 1000) * config.revenuePerThousandHouseholds;

    // Suất trung bình có trọng số theo phần dân của mỗi nhóm: một nhóm 1% dân
    // vặn lên kịch trần cũng chỉ đổi được 1% thu, đúng như nó phải thế.
    let rateFactor = 0;
    for (const group of config.groups) {
      const rate = rates[group.id] ?? group.baseRate;
      rateFactor += (rate / 100) * group.share * group.yieldPerPoint;
    }

    potential += perProvince * rateFactor * yieldFactor(province);
  }

  potential *= Math.max(0, 1 - pressure.merchantFlight);
  potential *= options.revenueFactor ?? 1;

  const run = runCheck(rng, {
    id: 'check.thu-thue',
    system: '3d6',
    domain: config.collectionCheck,
    difficulty: config.collectionDifficulty,
    base: options.base,
    tags: ['cai-tri', 'thu-thue'],
    state: options.state ?? null,
  });

  const modifier = config.collectionBonusPerTier[run.result.tier] ?? 0;
  const amount = Math.max(0, Math.round(potential * (1 + modifier)));

  const lines = [...pressure.lines];
  if (modifier < 0) lines.push(`Thu không đủ sổ: mất ${String(Math.round(Math.abs(modifier) * 100))} trên trăm.`);
  if (modifier > 0) lines.push(`Thu vượt sổ ${String(Math.round(modifier * 100))} trên trăm.`);
  if (pressure.merchantFlight > 0) {
    lines.push(`Thương nhân bỏ đi: mất thêm ${String(Math.round(pressure.merchantFlight * 100))} trên trăm, không tiếng động nào.`);
  }

  return { amount, potential: Math.round(potential), tier: run.result.tier, lines };
}

/**
 * SỐ ĐIỂM VƯỢT TRUNG BÌNH so với suất thường lệ.
 *
 * Đây là con số mà lòng trung chư hầu đọc (mục 7, "lòng trung giảm vì thuế
 * nặng"). Trung bình theo NHÓM chứ không theo dân số: một chư hầu nhìn bảng thuế
 * của lãnh chúa và thấy BỐN dòng, không thấy một con số bình quân gia quyền — và
 * ông ta giận vì cả bốn dòng, kể cả dòng đánh vào giáo sĩ.
 */
export function averageOverBase(rates: Readonly<Record<string, number>>): number {
  const groups = taxGroups();
  if (groups.length === 0) return 0;
  const total = groups.reduce((sum, group) => sum + ((rates[group.id] ?? group.baseRate) - group.baseRate), 0);
  return Math.round((total / groups.length) * 10) / 10;
}

/** Nhãn suất thuế cho UI và cho khối prompt 6B: "nông 18%, thương 12%". */
export function rateLabel(rates: Readonly<Record<string, number>>): string {
  return taxGroups()
    .map((group) => `${group.name.toLowerCase()} ${String(rates[group.id] ?? group.baseRate)}%`)
    .join(', ');
}
