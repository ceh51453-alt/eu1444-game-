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
import { seedFromId } from './field';
import { layoutHolding, startingLayout } from './layout';
import { ensureNodes } from './nodes';
import { fieldOf } from './place';
import { PATH_PROFILES, ownershipFor } from './ownership';
import { raceTensionOf } from './population';
import type { Cell, Holding, Population, RaceCount, TerrainHint } from './types';
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
  /**
   * Địa hình VĨ MÔ của nút bản đồ thế giới chứa thành trì này — id trong
   * `data/world-map.json` (`dong-bang`, `doi`, `nui`, `rung`, `dam-lay`,
   * `song`, `thao-nguyen`, `bien`). Cả 6 km vuông đất mọc ra từ đây.
   */
  dominant?: string;
  coastal?: boolean;
  /** Toạ độ px của nút trên bản đồ thế giới. */
  anchor?: Cell;
  /** Hạt giống địa hình. Bỏ trống thì suy từ id — cùng id thì cùng mảnh đất. */
  seed?: number;
  /** Gợi ý từ lời kể: "dựng bên sông", "dưới chân núi". */
  hint?: Partial<TerrainHint>;
  /**
   * Dựng sẵn công trình theo cấp.
   *
   * Mặc định BẬT cho ba con đường có sẵn thành trì và TẮT cho `phat-trien` —
   * mục 2 nói người đi đường thứ tư "tìm hoặc mua một thôn nhỏ rồi nuôi lớn",
   * và một cái thôn đã có sẵn chợ thì không còn gì để nuôi.
   */
  prebuild?: boolean;
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
    // Hạt giống suy từ ID chứ không rút từ `rng`, và đó là chủ ý: hai ván chơi
    // khác nhau cùng gặp thành Aachen phải thấy CÙNG một mảnh đất. Địa lý không
    // đổi theo người đi qua nó. Ai muốn một mảnh đất khác thì truyền `seed`.
    seed: options.seed ?? seedFromId(id),
    dominant: options.dominant ?? 'dong-bang',
    coastal: options.coastal ?? options.dominant === 'bien',
    anchor: options.anchor ?? { x: 0, y: 0 },
    hint: {
      river: options.hint?.river ?? false,
      sea: options.hint?.sea ?? false,
      mountain: options.hint?.mountain ?? false,
    },
    buildings: [],
    projects: [],
    nodes: [],
    walls: [],
    roads: [],
    streetsRazed: [],
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
    daysOwed: 0,
  };

  holding.nodes = ensureNodes(fieldOf(holding), [], holding.walls);
  holding.population.raceTension = raceTensionOf(holding);

  // Ba con đường có sẵn thành trì thì thành trì đã đứng đó từ trước; đường thứ
  // tư bắt đầu từ một cái thôn trần. Công trình của thành đánh chiếm được vào
  // với thương tích sẵn — mục 2 nói "công trình hư hại", và một thành chiếm
  // được mà mọi thứ còn nguyên vẹn 100 thì cả câu ấy chỉ là lời kể.
  const prebuild = options.prebuild ?? options.path !== 'phat-trien';
  if (prebuild) {
    const damaged = options.path === 'danh-chiem';
    layoutHolding(
      holding,
      startingLayout(tier.id).map((item) => (damaged ? { ...item, integrity: 55 + rng.next() * 25 } : item)),
      options.turn,
    );
  }

  return holding;
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
