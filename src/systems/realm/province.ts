/**
 * TỈNH — đơn vị hợp thành của lãnh thổ (mục 6).
 *
 * BA TẦNG LÀ LÃNH THỔ > TỈNH > THÀNH TRÌ (Phụ lục A mục 9d). Một tỉnh KHÔNG PHẢI
 * một thành trì: nó không có lưới ô, không có công trình, không có kho, và mọi
 * con số của nó là ƯỚC CHỪNG (Phụ lục A mục 6). Con số chính xác — 1.240 dân, 380
 * giạ lúa — chỉ tồn tại ở tầng dưới, và Phần 13 không được giữ một bản sao.
 *
 * Vì thế `households()` trả về SỐ HỘ SUY TỪ PHÁT TRIỂN chứ không cộng dân từ các
 * thành trì. Hai cách cho hai con số khác nhau, và đó không phải bug: một lãnh
 * chúa thế kỷ 14 biết rõ thành mình và chỉ đoán được cả vùng. Khi nào cần con số
 * cộng thật thì nó đi vào từ ngoài qua `Tribute` của Phần 12 — xem `year.ts`.
 */

import type { Rng } from '@/core/rng';
import { makeId, type ProvinceId, type RealmId } from '@/core/ids';
import { runCheck } from '@/systems/check';
import type { GameState } from '@/state/slices';
import { regionName } from '@/lore/regions';
import {
  banditryBandFor,
  banditryConfig,
  climateOf,
  developmentConfig,
  levyConfig,
  provinceRowOf,
  roadLevelOf,
  terrainOf,
  unrestBandFor,
  unrestConfig,
  type ProvinceRow,
} from './data';
import type { Province } from './types';

export class RealmProvinceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RealmProvinceError';
  }
}

/** Dựng một tỉnh từ hàng data. Vạch xuất phát, chưa có thành trì nào gắn vào. */
export function createProvince(row: ProvinceRow, fiefId = '', holderId = ''): Province {
  return {
    id: makeId('province', row.id.slice('prov_'.length)) as ProvinceId,
    regionId: row.regionId,
    parentRealmId: row.realmId as RealmId,
    fiefId,
    holderId,
    terrain: row.terrain,
    climate: row.climate,
    area: row.area,
    holdingIds: [],
    development: row.development,
    unrest: row.unrest,
    banditry: row.banditry,
    roads: row.roads,
    infrastructure: [...row.infrastructure],
    cultureMix: row.cultureMix.map((entry) => ({ ...entry })),
    raceMix: row.raceMix.map((entry) => ({ ...entry })),
    resources: [...row.resources],
    laws: [],
  };
}

export function provinceFromId(id: string, fiefId = '', holderId = ''): Province {
  const row = provinceRowOf(id);
  if (row === null) throw new RealmProvinceError(`không có tỉnh "${id}" trong data/provinces.json`);
  return createProvince(row, fiefId, holderId);
}

/** Tên tỉnh — LUÔN lấy từ `regions.json`, không bao giờ chép lại (Phụ lục A mục 9a). */
export function provinceName(province: Province): string {
  return regionName(province.regionId);
}

/** Rộng bao nhiêu NGÀY NGỰA — đơn vị của tầng lãnh thổ (Phụ lục A mục 5). */
export function daysRide(province: Province): number {
  const terrain = terrainOf(province.terrain);
  return Math.max(1, Math.round(province.area * (terrain?.daysRidePerArea ?? 1)));
}

/**
 * SỐ HỘ ƯỚC CHỪNG.
 *
 * Trả về một con số ĐÃ LÀM TRÒN, và chỗ gọi phải kèm chữ "ước chừng" khi đưa vào
 * prompt (Phụ lục A mục 6). Đây là con số duy nhất về người mà tầng này được
 * phép nói.
 */
export function households(province: Province): number {
  const config = developmentConfig();
  const rough = province.development * config.householdsPerPoint;
  const step = rough > 5000 ? 500 : rough > 1000 ? 100 : 50;
  return Math.round(rough / step) * step;
}

/** Hệ số sản lượng của tỉnh: địa hình × khí hậu × bất ổn × cướp bóc × đường. */
export function yieldFactor(province: Province): number {
  const terrain = terrainOf(province.terrain);
  const climate = climateOf(province.climate);
  return (
    (terrain?.revenueFactor ?? 1) *
    (climate?.revenueFactor ?? 1) *
    unrestBandFor(province.unrest).revenueFactor *
    banditryBandFor(province.banditry).revenueFactor *
    roadLevelOf(province.roads).tradeFactor
  );
}

/**
 * SỐ QUÂN GỌI ĐƯỢC từ một tỉnh — ƯỚC CHỪNG.
 *
 * Quân THẬT, đếm từng người, vẫn là `garrisonOf` của Phần 12. Con số ở đây chỉ
 * dùng để lập kế hoạch, và UI phải nói rõ điều đó — nếu hai con số được trình bày
 * ngang hàng thì người chơi sẽ tin cái nào lớn hơn.
 */
export function levyEstimate(province: Province, loyalty = 100): number {
  const config = levyConfig();
  const terrain = terrainOf(province.terrain);
  const raw = province.development * config.menPerDevelopmentPoint * (terrain?.levyFactor ?? 1);
  const unrestPenalty = Math.max(0, 1 - province.unrest * config.unrestPenaltyPerPoint);
  const loyaltyFactor = Math.max(config.loyaltyFloor, loyalty / 100);
  return Math.round((raw * unrestPenalty * loyaltyFactor) / 10) * 10;
}

// ---------------------------------------------------------------------------
// Một năm trôi qua
// ---------------------------------------------------------------------------

export interface ProvinceYearInput {
  /** Cộng dồn hệ quả của mọi điều luật đang áp lên tỉnh này. */
  lawUnrest: number;
  lawBanditry: number;
  lawDevelopment: number;
  /** Điều chỉnh bất ổn do thuế suất (mục 8). */
  taxUnrest: number;
  /** Đang có chư hầu nổi loạn ở tỉnh này. */
  rebelling: boolean;
}

export interface ProvinceYearResult {
  province: Province;
  lines: string[];
}

/**
 * MỘT NĂM CỦA MỘT TỈNH: bất ổn trôi, cướp bóc mọc, phát triển bò lên.
 *
 * Ba con số đi theo ba tốc độ rất khác nhau, có chủ ý. Bất ổn lên nhanh xuống
 * nhanh — nó là tâm trạng. Cướp bóc lên chậm xuống chậm — nó là thói quen. Phát
 * triển thì gần như không nhúc nhích, và một tỉnh chỉ giàu lên nếu người cai trị
 * bỏ tiền vào dự án (mục 6) chứ không phải vì thời gian trôi.
 */
export function advanceProvinceYear(province: Province, input: ProvinceYearInput): ProvinceYearResult {
  const unrest = unrestConfig();
  const banditry = banditryConfig();
  const development = developmentConfig();
  const lines: string[] = [];

  const unrestTarget = unrest.settle + input.lawUnrest + input.taxUnrest + (input.rebelling ? 25 : 0);
  const unrestGap = unrestTarget - province.unrest;
  const nextUnrest = clamp(
    province.unrest + Math.sign(unrestGap) * Math.min(Math.abs(unrestGap), unrest.driftPerYear + Math.abs(unrestGap) * 0.35),
    unrest.min,
    unrest.max,
  );

  const band = unrestBandFor(nextUnrest);
  const terrain = terrainOf(province.terrain);
  const banditryTarget = (terrain?.banditryBase ?? banditry.settle) + input.lawBanditry + province.roads * banditry.roadPenaltyPerLevel;
  const banditryDrift = band.banditryPerYear + Math.sign(banditryTarget - province.banditry) * 1.5;
  const nextBanditry = clamp(province.banditry + banditryDrift, banditry.min, banditry.max);

  // Phát triển KHỰNG LẠI khi vùng loạn hoặc đường bị cắt. Đây là chỗ mục 6 nói
  // "phát triển" khác "xây": không ai bỏ vốn vào một tỉnh mà đoàn xe không qua nổi.
  const stalled = nextUnrest > development.unrestStallAbove || nextBanditry > development.banditryStallAbove;
  const nextDevelopment = clamp(
    province.development + (stalled ? 0 : development.growthPerYear) + input.lawDevelopment,
    development.min,
    development.max,
  );

  if (stalled) {
    lines.push(
      `${provinceName(province)}: phát triển đứng lại — ${nextUnrest > development.unrestStallAbove ? 'vùng đang loạn' : 'đường bị cắt'}.`,
    );
  }
  if (band.id === 'khoi-nghia') {
    lines.push(`${provinceName(province)}: đã thành khởi nghĩa, thu được chưa tới một phần tư.`);
  }

  return {
    lines,
    province: { ...province, unrest: nextUnrest, banditry: nextBanditry, development: nextDevelopment },
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value * 10) / 10));
}

// ---------------------------------------------------------------------------
// Dẹp loạn và tuần tra
// ---------------------------------------------------------------------------

export interface SuppressResult {
  province: Province;
  succeeded: boolean;
  /** Chính danh phải trả. Không có cách nào vừa nhanh vừa sạch (mục 8). */
  legitimacyCost: number;
  line: string;
}

/**
 * DẸP LOẠN — hạ bất ổn nhanh, trả bằng chính danh.
 *
 * Kiểm định 3d6 miền `rule.dep-loan`, đúng phân miền cứng của Phần 5 mục 2: đây
 * là năng lực dài hạn, không phải một đòn kiếm.
 */
export function suppress(
  rng: Rng,
  province: Province,
  base: number,
  state: GameState | null = null,
): SuppressResult {
  const config = unrestConfig();
  const run = runCheck(rng, {
    id: 'check.dep-loan',
    system: '3d6',
    domain: config.suppressCheck,
    difficulty: config.suppressDifficulty,
    base,
    tags: ['cai-tri', unrestBandFor(province.unrest).id],
    state,
  });

  const succeeded = run.result.tier === 'success' || run.result.tier === 'critSuccess' || run.result.tier === 'costlySuccess';
  const drop = succeeded ? config.suppressDrop * (run.result.tier === 'critSuccess' ? 1.4 : 1) : config.suppressDrop * 0.3;

  return {
    succeeded,
    legitimacyCost: config.suppressLegitimacyCost * (run.result.tier === 'critFail' ? 2 : 1),
    province: { ...province, unrest: clamp(province.unrest - drop, config.min, config.max) },
    line: succeeded
      ? `${provinceName(province)}: dẹp xong, bất ổn còn ${String(Math.round(province.unrest - drop))}. Người ta nhớ ai đã cho lệnh.`
      : `${provinceName(province)}: dẹp không nổi, và bây giờ thì họ biết ngài đã thử.`,
  };
}

export interface PatrolResult {
  province: Province;
  cost: number;
  line: string;
}

/** TUẦN TRA — hạ cướp bóc, trả bằng tiền chứ không bằng chính danh. */
export function patrol(rng: Rng, province: Province, base: number, state: GameState | null = null): PatrolResult {
  const config = banditryConfig();
  const run = runCheck(rng, {
    id: 'check.tuan-tra',
    system: '3d6',
    domain: config.patrolCheck,
    difficulty: config.patrolDifficulty,
    base,
    tags: ['cai-tri', 'tuan-tra'],
    state,
  });

  const succeeded = run.result.tier !== 'fail' && run.result.tier !== 'critFail';
  const drop = succeeded ? config.patrolDrop : 0;

  return {
    cost: config.patrolCostPerProvince,
    province: { ...province, banditry: clamp(province.banditry - drop, config.min, config.max) },
    line: succeeded
      ? `${provinceName(province)}: đường sạch hơn, cướp bóc còn ${String(Math.round(province.banditry - drop))}.`
      : `${provinceName(province)}: tuần tra đi qua, bọn cướp đi vòng.`,
  };
}

/** Nhãn đọc được của một tỉnh, cho bản đồ vùng và cho khối prompt 6B. */
export function provinceLabel(province: Province): string {
  return `${provinceName(province)} · ${String(daysRide(province))} ngày ngựa · phát triển ${String(Math.round(province.development))} · ${unrestBandFor(province.unrest).name.toLowerCase()}`;
}
