/**
 * CẤP QUỐC GIA — địa vị pháp lý của cả chính thể, không phải tước cá nhân.
 *
 * Một Công tước có thể cai trị một liên bang, một Giáo hoàng không phải Quốc
 * vương dù Giáo quốc có sức nặng tương đương vương quốc. Vì vậy cấp và thể chế
 * là hai trục riêng, rồi mới ghép thành cách xưng hô và quyền thực tế.
 */

import {
  countryRankOf,
  countryRanks,
  governmentFormOf,
  powerRowOf,
  type CountryRank,
  type GovernmentForm,
} from './data';
import type { PowerState, RelationRow } from './types';

export interface CountryStyle {
  rank: CountryRank;
  form: GovernmentForm;
  rulerTitle: string;
  address: string;
  label: string;
  basis: string;
}

export interface CountryRankSupport {
  value: number;
  lines: { label: string; value: number; required: number; met: boolean }[];
}

export interface CountryElevationContext {
  year: number;
  rulerTitleRank: number;
  /** Số quốc gia khác đã công nhận công khai. Thiếu vẫn có thể tự xưng, nhưng bị tranh chấp. */
  recognitions: number;
}

export interface CountryElevationVerdict {
  ok: boolean;
  disputed: boolean;
  target: CountryRank | null;
  reasons: string[];
  requiredRecognitions: number;
}

function fallbackRank(): CountryRank {
  return countryRanks()[0]!;
}

export function countryRankOfPower(power: PowerState): CountryRank {
  const stored = countryRankOf(power.countryRankId);
  if (stored !== null) return stored;
  const seeded = powerRowOf(power.id);
  return countryRankOf(seeded?.countryRankId ?? '') ?? fallbackRank();
}

export function governmentFormOfPower(power: PowerState): GovernmentForm {
  const stored = governmentFormOf(power.governmentFormId);
  if (stored !== null) return stored;
  const seeded = powerRowOf(power.id);
  return governmentFormOf(seeded?.governmentFormId ?? '') ?? {
    id: 'khong-ro',
    name: 'Thể chế chưa rõ',
    rulerTitle: '',
    address: '',
    note: 'Chưa đủ tin tức để xác định thể chế.',
  };
}

export function countryStyleOf(power: PowerState): CountryStyle {
  const rank = countryRankOfPower(power);
  const form = governmentFormOfPower(power);
  const rulerTitle = form.rulerTitle || rank.rulerTitle;
  const address = form.address || rank.address;
  return {
    rank,
    form,
    rulerTitle,
    address,
    label: form.id === 'quan-chu' ? rank.name : `${form.name} · tương đương ${rank.name.toLowerCase()}`,
    basis: powerRowOf(power.id)?.rankBasis ?? '',
  };
}

/** Đế hiệu quá lớn so với đất, uy tín và nội trị chỉ còn là một yêu sách trên giấy. */
export function countryRankSupportOf(power: PowerState): CountryRankSupport {
  const rank = countryRankOfPower(power);
  const lines = [
    { label: 'Lãnh thổ', value: power.land, required: rank.minLand, met: power.land >= rank.minLand },
    { label: 'Uy tín', value: power.prestige, required: rank.minPrestige, met: power.prestige >= rank.minPrestige },
    { label: 'Ổn định', value: power.stability, required: rank.minStability, met: power.stability >= rank.minStability },
    { label: 'Gắn kết', value: power.cohesion, required: rank.minCohesion, met: power.cohesion >= rank.minCohesion },
  ];
  const shares = lines.map((line) => line.required <= 0 ? 1 : Math.min(1, line.value / line.required));
  const raw = (shares.reduce((sum, value) => sum + value, 0) / shares.length) * 100 - (power.rankDisputed ? 18 : 0);
  return { value: Math.max(0, Math.min(100, Math.round(raw))), lines };
}

export function countryRankEffectiveEffects(power: PowerState): {
  diplomaticWeight: number;
  militaryCommandBonus: number;
  taxFactor: number;
  administrationFactor: number;
  tradeFactor: number;
  tradeCapacityBonus: number;
  factionPressure: number;
  treatyCapacity: number;
  vassalCapacity: number;
} {
  const rank = countryRankOfPower(power);
  const support = countryRankSupportOf(power).value / 100;
  return {
    diplomaticWeight: rank.diplomaticWeight * support,
    militaryCommandBonus: rank.militaryCommandBonus * support,
    // Bộ máy vẫn phải trả đủ ngay cả khi đế hiệu suy yếu; chỉ quyền lợi bị hụt.
    taxFactor: 1 + (rank.taxFactor - 1) * support,
    administrationFactor: rank.administrationFactor,
    tradeFactor: 1 + (rank.tradeFactor - 1) * support,
    tradeCapacityBonus: rank.tradeCapacityBonus * support,
    factionPressure: rank.factionPressure,
    treatyCapacity: rank.treatyCapacity,
    vassalCapacity: rank.vassalCapacity,
  };
}

export function nextCountryRankOf(power: PowerState): CountryRank | null {
  const current = countryRankOfPower(power);
  return countryRanks().find((rank) => rank.rank === current.rank + 1) ?? null;
}

export function countryElevationVerdict(
  power: PowerState,
  targetId: string,
  context: CountryElevationContext,
): CountryElevationVerdict {
  const current = countryRankOfPower(power);
  const target = countryRankOf(targetId);
  if (target === null) return { ok: false, disputed: false, target: null, reasons: ['Cấp quốc gia không tồn tại.'], requiredRecognitions: 0 };
  const reasons: string[] = [];
  if (target.rank !== current.rank + 1) reasons.push(`Chỉ có thể nâng từng cấp sau ${current.name}.`);
  if (power.land < target.minLand) reasons.push(`Cần ít nhất ${String(target.minLand)} đất; hiện có ${String(power.land)}.`);
  if (power.prestige < target.minPrestige) reasons.push(`Uy tín phải đạt ${String(target.minPrestige)} trước lễ tuyên xưng.`);
  if (power.stability < target.minStability) reasons.push(`Ổn định phải đạt ${String(target.minStability)}.`);
  if (power.cohesion < target.minCohesion) reasons.push(`Gắn kết phải đạt ${String(target.minCohesion)}.`);
  if (power.treasury < target.elevationTreasury) reasons.push(`Ngân khố cần ${String(target.elevationTreasury)}.`);
  if (context.rulerTitleRank < target.minRulerTitleRank) {
    reasons.push(`Người trị vì cần tước cá nhân bậc ${String(target.minRulerTitleRank)} trở lên.`);
  }
  const requiredRecognitions = Math.max(1, target.rank - 2);
  return {
    ok: reasons.length === 0,
    disputed: context.recognitions < requiredRecognitions,
    target,
    reasons,
    requiredRecognitions,
  };
}

export function elevateCountry(
  power: PowerState,
  targetId: string,
  context: CountryElevationContext,
): { power: PowerState; line: string; disputed: boolean } {
  const verdict = countryElevationVerdict(power, targetId, context);
  if (!verdict.ok || verdict.target === null) {
    throw new Error(verdict.reasons.join(' '));
  }
  const target = verdict.target;
  return {
    power: {
      ...power,
      countryRankId: target.id,
      rankSinceYear: context.year,
      rankDisputed: verdict.disputed,
      treasury: power.treasury - target.elevationTreasury,
      prestige: Math.max(0, power.prestige - target.elevationPrestige),
      stability: Math.max(0, power.stability - (verdict.disputed ? 8 : 3)),
    },
    line: verdict.disputed
      ? `Tự xưng ${target.name}; chỉ ${String(context.recognitions)}/${String(verdict.requiredRecognitions)} nước công nhận, địa vị bị tranh chấp.`
      : `Được công nhận là ${target.name} sau lễ tuyên xưng.`,
    disputed: verdict.disputed,
  };
}

export function activeTreatyCount(rows: readonly RelationRow[], powerId: string): number {
  return rows
    .filter((row) => row.a === powerId || row.b === powerId)
    .reduce((sum, row) => sum + row.treaties.length, 0);
}

export function canAddTreaty(power: PowerState, rows: readonly RelationRow[]): { ok: boolean; reason: string } {
  const count = activeTreatyCount(rows, power.id);
  const capacity = countryRankEffectiveEffects(power).treatyCapacity;
  return count < capacity
    ? { ok: true, reason: `Đang dùng ${String(count)}/${String(capacity)} cam kết ngoại giao.` }
    : { ok: false, reason: `${countryRankOfPower(power).name} đã dùng hết ${String(capacity)} cam kết ngoại giao.` };
}
