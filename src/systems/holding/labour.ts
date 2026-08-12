/**
 * NHÂN CÔNG VÀ SẢN LƯỢNG (Phần 12 mục 6).
 *
 * > **NHÂN CÔNG LÀ RÀNG BUỘC THẬT SỰ, KHÔNG PHẢI TIỀN.**
 *
 * Câu ấy chỉ đúng nếu nó ra được thành một con số, và con số ấy nằm ở
 * `labourOf()`: dân vừa phải làm ruộng vừa phải xây, và mùa vụ quyết định phần
 * nào của họ còn rảnh. Bốn hệ quả đi kèm, cả bốn đều có ở đây:
 *
 *  1. **Gieo và gặt hút gần hết nhân lực.** Mùa xuân và mùa thu chỉ còn dư một
 *     phần nhỏ; muốn xây nhanh thì phải LẤN sang phần của ruộng.
 *  2. **Lấn thì mùa màng kém.** `harvestFactor` phạt thẳng vào sản lượng lương
 *     thực. Đây là chỗ "kéo người đi xây thì mùa màng kém" thành hệ quả thật.
 *  3. **Mùa đông không xây được công trình đá.** Vữa không đông. Rảnh người mà
 *     vẫn không xây được là một nghịch lý rất đúng với thế kỷ 14.
 *  4. **Gọi quân làm giảm nhân công.** Người cầm giáo là người không cày.
 *
 * Sản lượng lương thực nằm ở đây chứ không ở một file riêng, vì nó là HỆ QUẢ của
 * việc phân bổ nhân công. Tách ra thì sẽ có hai chỗ cùng nghĩ về một đám người,
 * và chúng sẽ lệch nhau.
 */

import { seasonOfDate, type GameDate } from '@/core/clock';
import { adjacencyOf, type HoldingAdjacency } from './adjacency';
import {
  buildingOf,
  holdingConfig,
  labourConfig,
  labourSeasonOf,
  terrainOf,
  tierOf,
  unrestFor,
  upkeepConfig,
  type LabourSeason,
} from './data';
import type { Holding, PlacedBuilding } from './types';

// ---------------------------------------------------------------------------
// Nhân lực
// ---------------------------------------------------------------------------

export interface LabourPool {
  season: LabourSeason;
  /** Tổng người đủ sức làm việc nặng. */
  workforce: number;
  /** Mùa vụ đòi bấy nhiêu người tuần này. */
  farmNeed: number;
  /** Đang cầm giáo, không cày và không xây. */
  levied: number;
  /** Rảnh thật sự sau khi trừ ruộng và quân dịch. Có thể âm — nghĩa là đang thiếu. */
  free: number;
  /** Trần lấn sang phần của ruộng: lấn hết cũng chỉ tới đây. */
  maxBorrow: number;
  /** Thợ lành nghề đang có. */
  skilled: Record<string, number>;
}

export function labourOf(holding: Holding, date: GameDate): LabourPool {
  const config = labourConfig();
  const season = labourSeasonOf(seasonOfDate(date));

  // Nhân lực đếm theo NHÓM XÃ HỘI, không phải một tỉ lệ phẳng trên tổng dân:
  // giáo sĩ không ra đồng và quý tộc nhỏ không vác đá, và mục 8 nói mỗi nhóm
  // phản ứng khác nhau với cùng một chính sách.
  let workforce = 0;
  for (const group of holding.population.strata) {
    const row = stratumWorkforceShare(group.id);
    workforce += group.people * row;
  }
  if (workforce === 0) workforce = holding.population.total * config.workforceShare;

  const levied = holding.population.levied * config.levyWorkerCost;
  const farmNeed = workforce * season.farmDemand;
  const free = workforce - farmNeed - levied;

  return {
    season,
    workforce,
    farmNeed,
    levied,
    free,
    // Lấn được tối đa một nửa phần của ruộng. Lấn hơn nữa thì không phải "mùa
    // màng kém" mà là "không có mùa màng", và đó là một quyết định khác hẳn —
    // engine không cho người chơi trượt vào nó mà không nhận ra.
    maxBorrow: Math.max(0, farmNeed * 0.5),
    skilled: { ...holding.population.skilled },
  };
}

function stratumWorkforceShare(id: string): number {
  const config = holdingConfig();
  return config.strata.find((row) => row.id === id)?.workforceShare ?? config.strata[0]?.workforceShare ?? 0.4;
}

/**
 * Sản lượng lương thực mất bao nhiêu khi kéo người khỏi ruộng.
 *
 * `borrowed` là số nhân công lấn sang phần của mùa vụ. Trả về hệ số nhân vào
 * sản lượng, không bao giờ xuống dưới `harvestPenaltyFloor` — một mùa gặt bị bỏ
 * bê vẫn còn thóc rơi vãi, và một hệ số 0 sẽ làm cả thành chết đói chỉ vì một
 * tuần quyết định sai.
 */
export function harvestFactor(pool: LabourPool, borrowed: number): number {
  const config = labourConfig();
  if (borrowed <= 0 || pool.workforce <= 0) return 1;
  const loss = (borrowed / pool.workforce) * config.harvestPenaltyPerWorker;
  return Math.max(config.harvestPenaltyFloor, 1 - loss);
}

// ---------------------------------------------------------------------------
// Sản lượng
// ---------------------------------------------------------------------------

/** Sản lượng một công trình đơn lẻ, đã tính chất lượng, hư hỏng và kề nhau. */
export function outputFactorOf(placed: PlacedBuilding, adjacencyOutput: number): number {
  const upkeep = upkeepConfig();
  if (placed.integrity < upkeep.ruinedBelow) return upkeep.outputAtRuined;
  const wear = 1 - (100 - placed.integrity) * upkeep.outputPerIntegrityPoint;
  return Math.max(0, placed.quality * adjacencyOutput * wear);
}

export interface Production {
  /**
   * Lương thực THÔ mỗi tuần, tính bằng giạ — trước khi bán phần dư.
   *
   * Sức chứa dân tính trên con số THÔ này, không tính trên phần còn lại sau khi
   * bán. Nếu tính trên phần còn lại thì bán thóc sẽ làm thành trì "nhỏ đi" trong
   * mắt engine và dân ngừng tới, mà thực tế là ngược lại: chỗ nào bán được thóc
   * là chỗ người ta muốn tới.
   */
  food: number;
  /** Phần thóc dư đã bán ra chợ tuần này. Trừ khỏi kho, KHÔNG trừ khỏi sức chứa. */
  foodSold: number;
  /** Mọi tài nguyên khác mỗi tuần. */
  resources: Record<string, number>;
  /** Chi phí duy trì mỗi tuần, theo tài nguyên. Bỏ bê là công trình hỏng. */
  upkeep: Record<string, number>;
  /** Chỗ ở tối đa. */
  housing: number;
  /** Số việc làm. */
  jobs: number;
  /** Sức chứa kho, theo tài nguyên. Vượt kho thì hàng hỏng nhanh. */
  storage: Record<string, number>;
  beauty: number;
  hygiene: number;
  faith: number;
  justice: number;
  literacy: number;
  /** Hệ số buôn bán — cửa của giao diện `holding ↔ holding` (mục 1). */
  trade: number;
}

function add(into: Record<string, number>, id: string, amount: number): void {
  into[id] = (into[id] ?? 0) + amount;
}

/**
 * Sản lượng RUỘNG NGOÀI TƯỜNG.
 *
 * Nông trại KHÔNG tự sinh ra lương: nó NHÂN sản lượng của ruộng (xem
 * `farmMultiplier` trong `data/buildings.json`). Đây là chỗ tầng thành trì gần
 * với tầng lãnh thổ nhất, nên phải nói rõ ranh giới: ruộng này đi bộ tới được
 * trong một ngày và thuộc về THÀNH TRÌ. Đất của cả một vùng là chuyện của Phần
 * 13, và nó không bao giờ được cộng vào con số này.
 */
const FOOD_PER_HINTERLAND_TILE = 62;

/**
 * Nguyên liệu thô lấy từ chính đất quanh thành: gỗ ở rừng, đá ở vỉa, sắt ở mỏ lộ
 * thiên, muối ở đầm. Ít hơn hẳn một cái mỏ thật, nhưng khác không — và cái khác
 * không ấy là điều kiện cần để một cái thôn dựng nổi căn nhà gỗ đầu tiên. Nếu để
 * bằng không thì Phần 12 có một vòng khoá chết ngay ở tuần thứ nhất: không có gỗ
 * thì không xây được gì, mà mọi thứ sinh ra gỗ đều phải xây mới có.
 */
const RAW_PER_HINTERLAND_TILE = 3;

/** Giá thóc ở chợ làng, tính bằng đồng một giạ. */
const FOOD_PRICE = 0.06;

/** Số tuần lương phải giữ lại trong kho trước khi bán một hạt nào ra chợ. */
const FOOD_RESERVE_WEEKS = 10;

function hinterlandFood(holding: Holding): number {
  let total = 0;
  for (const row of holding.hinterland) {
    const terrain = terrainOf(row.terrain);
    const yieldPerTile = terrain?.yields['luong-thuc'] ?? 0;
    total += yieldPerTile * row.count * FOOD_PER_HINTERLAND_TILE;
  }
  return total;
}

function hinterlandRaw(holding: Holding, into: Record<string, number>): void {
  for (const row of holding.hinterland) {
    const terrain = terrainOf(row.terrain);
    if (terrain === undefined || terrain === null) continue;
    for (const [id, amount] of Object.entries(terrain.yields)) {
      if (id === 'luong-thuc') continue;
      add(into, id, amount * row.count * RAW_PER_HINTERLAND_TILE);
    }
  }
}

export interface ProductionContext {
  /** Nhân công lấn sang phần của ruộng tuần này. */
  borrowed: number;
  pool: LabourPool;
  besieged: boolean;
}

export function produce(holding: Holding, context: ProductionContext, adjacency?: HoldingAdjacency): Production {
  const adj = adjacency ?? adjacencyOf(holding, { besieged: context.besieged });
  const config = holdingConfig();
  const tier = tierOf(holding.tierId);
  const unrest = unrestFor(holding.population.morale);

  const production: Production = {
    food: 0,
    foodSold: 0,
    resources: {},
    upkeep: {},
    // Lều tự dựng và ruộng phần: có sẵn ở mọi khu định cư, không ai quy hoạch.
    housing: tier?.baseHousing ?? 0,
    jobs: tier?.baseJobs ?? 0,
    storage: {},
    beauty: tier?.baseBeauty ?? 0,
    hygiene: 0,
    faith: 0,
    justice: 0,
    literacy: 0,
    trade: 1,
  };

  let farmMultiplier = 1;

  for (const placed of holding.buildings) {
    const building = buildingOf(placed.buildingId);
    if (building === null) continue;
    const effects = adj.byBuilding.get(placed.id);
    const factor = outputFactorOf(placed, effects?.output ?? 1);

    // Chỗ ở và sức chứa kho KHÔNG phụ thuộc lòng dân — một cái nhà vẫn là một
    // cái nhà kể cả khi dân đang giận. Chúng chỉ mất đi khi công trình hỏng.
    const standing = placed.integrity >= upkeepConfig().ruinedBelow ? 1 : 0;
    production.housing += building.housing * standing;
    production.jobs += building.jobs * factor;
    production.beauty += building.beauty * standing;
    production.hygiene += building.hygiene * standing;
    production.faith += building.faith * standing * (effects?.faith ?? 1);
    production.justice += building.justice * standing;
    production.literacy += building.literacy * standing;
    production.trade += building.trade * (effects?.trade ?? 1) - building.trade;

    for (const [id, amount] of Object.entries(building.output)) add(production.resources, id, amount * factor);
    for (const [id, amount] of Object.entries(building.consumes)) add(production.resources, id, -amount * standing);
    for (const [id, amount] of Object.entries(building.storage)) add(production.storage, id, amount * standing);
    for (const [id, amount] of Object.entries(building.upkeep)) {
      add(production.upkeep, id, amount * (effects?.upkeep ?? 1) * standing);
    }
    farmMultiplier += building.farmMultiplier * factor;
  }

  const tension = 1 - holding.population.raceTension * config.raceTension.outputPerPoint;
  const morale = unrest.outputFactor;
  const harvest = harvestFactor(context.pool, context.borrowed);
  const siegeStop = context.besieged ? 0.15 : 1;

  production.food = hinterlandFood(holding) * farmMultiplier * harvest * morale * Math.max(0, tension) * siegeStop;
  for (const id of Object.keys(production.resources)) {
    const value = production.resources[id] ?? 0;
    if (value > 0) production.resources[id] = value * morale * Math.max(0, tension);
  }

  const raw: Record<string, number> = {};
  hinterlandRaw(holding, raw);
  for (const [id, amount] of Object.entries(raw)) {
    add(production.resources, id, amount * morale * siegeStop);
  }

  // BÁN PHẦN DƯ RA CHỢ — nguồn tiền đầu tiên và, ở một cái thôn, nguồn duy nhất.
  // Chỉ bán phần trên mức dự trữ: một lãnh chúa bán sạch kho để lấy tiền xây
  // tường là một lãnh chúa sẽ mất thành ở tuần thứ sáu của cuộc vây đầu tiên,
  // nên engine giữ lại `FOOD_RESERVE_WEEKS` tuần lương trước khi bán hạt nào.
  //
  // Đây KHÔNG phải "thu thuế": thuế là động từ của lãnh thổ và nó thu từ DÂN
  // (Phụ lục A mục 4). Đây là bán thóc dư ở chợ, một động từ của thành trì.
  const eaten = foodEaten(holding);
  const reserve = eaten * FOOD_RESERVE_WEEKS;
  const inStore = Math.max(0, holding.stores['luong-thuc'] ?? 0);
  const surplus = production.food - eaten;
  const sellable = Math.max(0, Math.min(surplus, surplus - Math.max(0, reserve - inStore)));
  if (sellable > 0 && !context.besieged) {
    production.foodSold = sellable;
    add(production.resources, 'tien', sellable * FOOD_PRICE * production.trade);
  }

  production.beauty += adj.beauty;
  production.hygiene += adj.hygiene;

  return production;
}

/** Lương ăn hết mỗi tuần. Cùng đơn vị với `consumption.foodPerManWeek` của Phần 11. */
export function foodEaten(holding: Holding): number {
  return holding.population.total * holdingConfig().foodPerPersonWeek;
}

/**
 * SỨC CHỨA DÂN của thành trì — ba cửa, cửa nào hẹp nhất thì cửa ấy quyết định.
 *
 * Mục 8 khai bốn điều kiện tăng dân: dư lương, an toàn, có việc làm, có nhà ở.
 * "An toàn" là chuyện của lòng dân nên nó đi vào tốc độ, còn ba điều còn lại là
 * TRẦN CỨNG — nhồi thêm người vào một thành không có chỗ ở thì họ không ở lại.
 */
export interface Capacity {
  housing: number;
  food: number;
  jobs: number;
  total: number;
  /** Cửa hẹp nhất, để UI nói thẳng ra người chơi đang vướng cái gì. */
  bottleneck: 'cho-o' | 'luong-thuc' | 'viec-lam';
}

export function capacityOf(production: Production): Capacity {
  const config = holdingConfig();
  const housing = production.housing;
  const food = production.food / Math.max(0.0001, config.foodPerPersonWeek);
  // Việc làm tính theo NGƯỜI LÀM, nên phải quy ngược ra dân số: một thành có 400
  // chỗ làm nuôi được nhiều hơn 400 người, vì trẻ con và người già không đi làm —
  // và vì một phần nhân lực tự tìm được việc mà không cần công trình nào cấp
  // chỗ (`informalJobShare`).
  const needsSlot = Math.max(0.05, labourConfig().workforceShare) * (1 - config.informalJobShare);
  const jobs = production.jobs / Math.max(0.02, needsSlot);

  const total = Math.min(housing, food, jobs);
  const bottleneck = total === housing ? 'cho-o' : total === food ? 'luong-thuc' : 'viec-lam';
  return { housing, food, jobs, total, bottleneck };
}
