/**
 * DỰNG MỘT THÀNH TRÌ MỚI.
 *
 * Bốn con đường của mục 2 gặp nhau ở đây: cùng một hàm, khác nhau ở `path` — và
 * cái khác nhau ấy phải nhìn thấy được ngay từ tuần đầu tiên. Một thành trì
 * đánh chiếm được và một thành trì tự nuôi lên KHÔNG được ra cùng một đối tượng
 * chỉ khác mỗi một chữ trong `ownership.path`; nếu thế thì mục 2 chỉ là trang
 * trí.
 *
 * `makeId` ép tiền tố `hold_` (README mục 7.1) ngay ở đây, nên không có đường
 * nào để một thành trì lọt vào state với id sai loại.
 */

import { makeId, type HoldingId } from '@/core/ids';
import type { Rng } from '@/core/rng';
import { holdingConfig, lowestTier, tierByRank, tierOf } from './data';
import { generateGrid, generateHinterland } from './grid';
import { PATH_PROFILES, ownershipFor } from './ownership';
import { raceTensionOf } from './population';
import type { Holding, Population, RaceCount } from './types';
import type { OwnershipPath } from './types';

export interface CreateHoldingOptions {
  /** Slug không dấu, thành `hold_<slug>`. */
  slug: string;
  /** Tên hiển thị, KHÔNG kèm loại từ — loại từ do `holdingLabel()` ghép vào. */
  name: string;
  path: OwnershipPath;
  turn: number;
  /** Cấp bắt đầu. Bỏ trống là cấp thấp nhất — chỗ một cái thôn khởi đầu. */
  tierId?: string;
  /** Dân số ban đầu. Bỏ trống thì lấy giữa khoảng của cấp. */
  population?: number;
  /** Thành phần chủng tộc. Bỏ trống là một tộc duy nhất. */
  races?: RaceCount[];
  seat?: boolean;
  /** Kho ban đầu. */
  stores?: Record<string, number>;
  serviceDays?: number;
  rivalClaimant?: string;
  /** Ép địa hình vài ô — dùng khi vị trí thật trên bản đồ đã biết. */
  fixedTerrain?: { x: number; y: number; terrain: string }[];
}

export function createHolding(rng: Rng, options: CreateHoldingOptions): Holding {
  const config = holdingConfig();
  const tier = (options.tierId === undefined ? lowestTier() : tierOf(options.tierId)) ?? lowestTier();
  const profile = PATH_PROFILES[options.path];

  const id: HoldingId = makeId('holding', options.slug);
  const total =
    options.population ?? Math.max(1, Math.round((tier.population.min + Math.min(tier.population.max, 120)) / 2));

  const strata = config.strata.map((row) => ({
    id: row.id,
    people: total * row.share,
    morale: profile.morale,
  }));

  const races: RaceCount[] =
    options.races ?? [{ raceId: 'race_frank', people: total }];

  const population: Population = {
    total,
    morale: profile.morale,
    strata,
    races,
    raceTension: 0,
    levied: 0,
    levyWeeks: 0,
    skilled: {},
    training: [],
  };

  const holding: Holding = {
    id,
    name: options.name,
    tierId: tier.id,
    gridSize: tier.grid,
    tiles: generateGrid(rng, {
      size: tier.grid,
      ...(options.fixedTerrain === undefined ? {} : { fixed: options.fixedTerrain }),
    }),
    buildings: [],
    projects: [],
    hinterland: generateHinterland(rng, tier.rank),
    population,
    stores: { ...(options.stores ?? {}) },
    ownership: ownershipFor(options.path, options.turn, options.rivalClaimant ?? ''),
    permits: { granted: [], grantedWorks: [], illegalWorks: [], discovered: false },
    obligations: {
      serviceDaysPerYear: options.serviceDays ?? profile.serviceDays,
      tributePerYear: 0,
      produceQuotaPerYear: 0,
      paidThisYear: false,
      arrearsYears: 0,
    },
    seat: options.seat ?? false,
    besieged: false,
    plague: false,
    hygiene: 50,
    lastTurn: options.turn,
    weeksLived: 0,
  };

  return { ...holding, population: { ...population, raceTension: raceTensionOf(holding) } };
}

/**
 * Cấp thấp nhất mà một dân số cho trước đã vượt ngưỡng.
 *
 * Dùng khi nhận một thành trì có sẵn (đường `xuat-than`, `duoc-phong`,
 * `danh-chiem`): dân số đã có trước, cấp phải suy từ nó chứ không đặt tay —
 * đặt tay là chỗ sinh ra một cái "làng" ba nghìn dân.
 */
export function tierForPopulation(people: number): string {
  for (let rank = 5; rank >= 1; rank--) {
    const tier = tierByRank(rank);
    if (tier !== null && people >= tier.population.min) return tier.id;
  }
  return lowestTier().id;
}
