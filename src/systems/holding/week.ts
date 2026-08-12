/**
 * MỘT TUẦN CỦA MỘT THÀNH TRÌ — chỗ mọi mảnh của Phần 12 gặp nhau.
 *
 * THỨ TỰ TRONG TUẦN LÀ MỘT HỢP ĐỒNG, không phải một tiện tay:
 *
 *   1. mùa → nhân lực rảnh          (mục 6)
 *   2. phân nhân công cho công trường, phần lấn ruộng ghi lại
 *   3. sản xuất, đã trừ phần lấn    (mục 6)
 *   4. ăn, hỏng kho, trả duy trì    (mục 7)
 *   5. công trường tiến, kiểm định chất lượng khi xong (mục 7)
 *   6. dân số và lòng dân           (mục 8)
 *   7. đào tạo thợ                  (mục 6)
 *   8. chính danh và hận thù nguội đi (mục 2)
 *
 * SẢN XUẤT ĐỨNG TRƯỚC XÂY DỰNG có lý do: nhân công đã phân cho công trường thì
 * không còn ở ngoài ruộng, nên sản lượng tuần này phải biết chuyện đó TRƯỚC. Đảo
 * hai bước lại thì người chơi được ăn cả hai — vừa gặt đủ vừa xây nhanh — và câu
 * "nhân công là ràng buộc thật sự" của mục 6 mất hiệu lực trong im lặng.
 *
 * LÊN CẤP ĐỨNG NGOÀI VÒNG TUẦN, ở `tryUpgrade()`: nó cần ĐỦ BỐN thứ (mục 3), và
 * một trong bốn là GIẤY PHÉP — tức là một quyết định, không phải một hệ quả của
 * thời gian trôi. Tự động lên cấp là bỏ mất điểm chính trị của mục 3d.
 */

import { addDays, seasonOfDate, type GameDate } from '@/core/clock';
import type { Rng } from '@/core/rng';
import type { GameState } from '@/state/slices';
import { adjacencyOf } from './adjacency';
import { advanceProjects, payUpkeep, type BuildWeekResult } from './build';
import {
  buildingOf,
  labourSeasonOf,
  qualityConfig,
  resourceOf,
  tierByRank,
  tierOf,
  unrestFor,
  type SettlementTier,
} from './data';
import { expandGrid, growHinterland } from './grid';
import { garrisonOf } from './garrison';
import { capacityOf, foodEaten, labourOf, produce, type LabourPool, type Production } from './labour';
import { advancePopulation, tickTraining, NO_LORD, type LordContext, type MoraleLine } from './population';
import { driftLegitimacy } from './ownership';
import { siegeReadiness } from './fortify';
import type { Holding, HoldingSummary } from './types';

/** Dòng xúc sắc RIÊNG của thành trì (R3) — cùng lý do với `DUEL_STREAM` của Phần 9. */
export const HOLDING_STREAM = 'holding';

export interface WeekInput {
  date: GameDate;
  turn: number;
  lord?: LordContext;
  /** Nhân công phân cho từng công trường. Thiếu thì `autoAssign` tự chia. */
  assignment?: Record<string, number>;
  /** Tự chia nhân công cho công trường theo thứ tự hàng đợi. */
  autoAssign?: boolean;
  /** Cho phép lấn sang phần nhân lực của mùa vụ. Lấn thì mùa màng kém. */
  allowBorrow?: boolean;
  state?: GameState | null;
  titleId?: string;
}

export interface WeekReport {
  holding: Holding;
  production: Production;
  pool: LabourPool;
  /** Nhân công lấn sang phần của ruộng tuần này. */
  borrowed: number;
  build: BuildWeekResult;
  morale: number;
  moraleLines: MoraleLine[];
  populationDelta: number;
  unrestId: string;
  /** Câu engine muốn nói với AI hoặc với người cân bằng. */
  notes: string[];
}

// ---------------------------------------------------------------------------
// Phân nhân công
// ---------------------------------------------------------------------------

/**
 * Chia nhân công cho công trường theo thứ tự hàng đợi.
 *
 * Công trường ĐẦU HÀNG ĐỢI ĂN TRƯỚC, không chia đều. Chia đều nghe công bằng
 * hơn nhưng cho ra một thành phố có năm công trình dở dang và không cái nào
 * xong; ưu tiên theo thứ tự thì người chơi điều được nhịp phát triển, và thứ tự
 * hàng đợi trở thành một quyết định thật.
 */
export function autoAssign(holding: Holding, pool: LabourPool, allowBorrow: boolean): {
  assignment: Record<string, number>;
  borrowed: number;
} {
  const assignment: Record<string, number> = {};
  let available = Math.max(0, pool.free);
  const borrowable = allowBorrow ? pool.maxBorrow : 0;
  let borrowed = 0;

  for (const project of holding.projects) {
    const building = buildingOf(project.buildingId);
    if (building === null) continue;
    const want = building.minCrew * 1.6;
    let give = Math.min(want, available);
    available -= give;
    if (give < building.minCrew && borrowed < borrowable) {
      const extra = Math.min(building.minCrew - give, borrowable - borrowed);
      give += extra;
      borrowed += extra;
    }
    assignment[project.id] = give;
  }
  return { assignment, borrowed };
}

// ---------------------------------------------------------------------------
// Một tuần
// ---------------------------------------------------------------------------

export function advanceWeek(holding: Holding, rng: Rng, input: WeekInput): WeekReport {
  const notes: string[] = [];
  const season = labourSeasonOf(seasonOfDate(input.date));

  // 1–2. nhân lực và phân công trường
  const pool = labourOf(holding, input.date);
  const auto = input.assignment === undefined || input.autoAssign === true;
  const assigned = auto
    ? autoAssign(holding, pool, input.allowBorrow ?? true)
    : { assignment: input.assignment ?? {}, borrowed: 0 };

  // 3. sản xuất — đã biết phần nhân công bị kéo khỏi ruộng
  const adjacency = adjacencyOf(holding, { besieged: holding.besieged });
  const production = produce(
    holding,
    { borrowed: assigned.borrowed, pool, besieged: holding.besieged },
    adjacency,
  );

  // 4. kho: cộng sản lượng, trừ miệng ăn, hỏng phần thừa kho, trả duy trì
  let working: Holding = { ...holding, stores: { ...holding.stores } };
  const eaten = foodEaten(working);
  working.stores['luong-thuc'] =
    (working.stores['luong-thuc'] ?? 0) + production.food - eaten - production.foodSold;
  for (const [id, amount] of Object.entries(production.resources)) {
    working.stores[id] = (working.stores[id] ?? 0) + amount;
  }

  for (const [id, amount] of Object.entries(working.stores)) {
    if (amount <= 0) {
      working.stores[id] = Math.max(0, amount);
      continue;
    }
    const resource = resourceOf(id);
    if (resource === null || !resource.perishable) continue;
    // Kho có mái thì thóc hỏng chậm hơn hẳn. Đây là chỗ `bld_kho-luong` trả lại
    // vốn, và cũng là chỗ một thành trì không kho không bao giờ tích được gì.
    const capacity = production.storage[id] ?? 0;
    const sheltered = Math.min(amount, capacity);
    const exposed = amount - sheltered;
    const shelterFactor = working.buildings.some((placed) => buildingOf(placed.buildingId)?.storage[id] !== undefined)
      ? 0.4
      : 1;
    working.stores[id] = amount - (sheltered * resource.spoilPerWeek * shelterFactor + exposed * resource.spoilPerWeek * 3);
  }

  const upkeepResult = payUpkeep(working, production.upkeep, season.id === 'dong');
  working = upkeepResult.holding;
  if (upkeepResult.unpaid.length > 0) {
    notes.push(`Không trả nổi chi phí duy trì cho ${String(upkeepResult.unpaid.length)} công trình — chúng đang xuống cấp nhanh.`);
  }
  for (const id of upkeepResult.ruined) {
    notes.push(`${buildingOf(id)?.name ?? id} đã hỏng hẳn và bị dỡ bỏ.`);
  }

  // 5. công trường
  const build = advanceProjects(working, rng, {
    pool,
    assignment: assigned.assignment,
    turn: input.turn,
    state: input.state ?? null,
    besieged: working.besieged,
  });
  working = build.holding;
  for (const done of build.completed) notes.push(done.line);
  for (const gone of build.collapsed) notes.push(gone.line);

  // 6. dân số và lòng dân
  const capacity = capacityOf(production);
  const before = working.population.total;
  const popResult = advancePopulation(working, {
    production,
    capacity,
    foodEaten: eaten,
    lord: input.lord ?? NO_LORD,
  });
  let population = popResult.population;
  if (build.deaths > 0) population = { ...population, total: Math.max(0, population.total - build.deaths) };

  // 7. đào tạo thợ
  population = tickTraining(population, working);

  // 8. chính danh và hận thù
  const ownership = driftLegitimacy(working.ownership, 1);

  working = {
    ...working,
    population,
    ownership,
    hygiene: Math.max(0, Math.min(100, 45 + production.hygiene - (working.plague ? 20 : 0))),
    lastTurn: input.turn,
    weeksLived: working.weeksLived + 1,
  };

  if (capacity.total < working.population.total) {
    notes.push(`Vượt sức chứa — nút thắt là ${bottleneckName(capacity.bottleneck)}.`);
  }
  const unrest = unrestFor(popResult.morale);
  if (unrest.riotChance > 0) {
    notes.push(`Lòng dân ${String(Math.round(popResult.morale))}: ${unrest.name}.`);
  }

  return {
    holding: working,
    production,
    pool,
    borrowed: assigned.borrowed,
    build,
    morale: popResult.morale,
    moraleLines: popResult.lines,
    populationDelta: working.population.total - before,
    unrestId: popResult.unrestId,
    notes,
  };
}

function bottleneckName(id: 'cho-o' | 'luong-thuc' | 'viec-lam'): string {
  if (id === 'cho-o') return 'chỗ ở';
  if (id === 'luong-thuc') return 'lương thực';
  return 'việc làm';
}

// ---------------------------------------------------------------------------
// Lên cấp — ĐỦ BỐN THỨ (mục 3)
// ---------------------------------------------------------------------------

export interface UpgradeCheck {
  ok: boolean;
  /** Bốn cửa của mục 3, từng cửa một, để UI hiện đủ chứ không chỉ hiện nút xám. */
  population: { ok: boolean; need: number; have: number };
  buildings: { ok: boolean; missing: string[] };
  cost: { ok: boolean; missing: Record<string, number> };
  permit: { ok: boolean; illegalAllowed: boolean };
  next: SettlementTier | null;
}

export function canUpgrade(holding: Holding): UpgradeCheck {
  const current = tierOf(holding.tierId);
  const next = current === null ? null : tierByRank(current.rank + 1);
  const empty: UpgradeCheck = {
    ok: false,
    population: { ok: false, need: 0, have: Math.round(holding.population.total) },
    buildings: { ok: false, missing: [] },
    cost: { ok: false, missing: {} },
    permit: { ok: false, illegalAllowed: true },
    next: null,
  };
  if (next?.upgrade === undefined) return empty;

  const rule = next.upgrade;
  const have = holding.population.total;
  const missingBuildings = rule.requiresBuildings.filter(
    (id) => !holding.buildings.some((placed) => placed.buildingId === id),
  );
  const missingCost: Record<string, number> = {};
  for (const [id, amount] of Object.entries(rule.cost)) {
    const short = amount - Math.max(0, holding.stores[id] ?? 0);
    if (short > 0) missingCost[id] = short;
  }
  const hasPermit = !rule.requiresPermit || holding.permits.granted.includes(next.id);

  const population = { ok: have >= rule.populationAtLeast, need: rule.populationAtLeast, have: Math.round(have) };
  const buildings = { ok: missingBuildings.length === 0, missing: missingBuildings };
  const cost = { ok: Object.keys(missingCost).length === 0, missing: missingCost };
  const permit = { ok: hasPermit, illegalAllowed: true };

  return {
    ok: population.ok && buildings.ok && cost.ok && permit.ok,
    population,
    buildings,
    cost,
    permit,
    next,
  };
}

export interface UpgradeResult {
  holding: Holding;
  ok: boolean;
  reason: string;
  /** Có xây lậu không — lãnh chúa có quyền đem quân san bằng (mục 3d). */
  illegal: boolean;
}

/**
 * LÊN CẤP.
 *
 * `allowIllegal` là cửa của mục 3d: người chơi VẪN được phép xây lậu, nhưng phải
 * chấp nhận hệ quả — và hệ quả ấy sống trong `permits.illegalWorks`, nơi Phần 15
 * sẽ đọc để cho lãnh chúa phản ứng thật. Nếu engine chỉ chặn thì cả điểm chính
 * trị đặc trưng nhất của thế kỷ 14 biến mất khỏi trò chơi.
 */
export function upgrade(holding: Holding, rng: Rng, allowIllegal = false): UpgradeResult {
  const check = canUpgrade(holding);
  const next = check.next;
  if (next?.upgrade === undefined) return { holding, ok: false, reason: 'đã ở cấp cao nhất', illegal: false };

  if (!check.population.ok) {
    return {
      holding,
      ok: false,
      illegal: false,
      reason: `cần ${String(check.population.need)} dân, mới có ${String(check.population.have)}`,
    };
  }
  if (!check.buildings.ok) {
    const names = check.buildings.missing.map((id) => buildingOf(id)?.name ?? id).join(', ');
    return { holding, ok: false, reason: `còn thiếu: ${names}`, illegal: false };
  }
  if (!check.cost.ok) {
    const shorts = Object.entries(check.cost.missing)
      .map(([id, amount]) => `${String(Math.ceil(amount))} ${resourceOf(id)?.name ?? id}`)
      .join(', ');
    return { holding, ok: false, reason: `còn thiếu: ${shorts}`, illegal: false };
  }
  const illegal = !check.permit.ok;
  if (illegal && !allowIllegal) {
    return {
      holding,
      ok: false,
      illegal: false,
      reason: `chưa có giấy phép lên ${next.name} — xây lậu được, nhưng lãnh chúa có quyền đem quân san bằng`,
    };
  }

  const current = tierOf(holding.tierId);
  const rank = current?.rank ?? 1;

  const stores = { ...holding.stores };
  for (const [id, amount] of Object.entries(next.upgrade.cost)) {
    stores[id] = Math.max(0, (stores[id] ?? 0) - amount);
  }

  return {
    ok: true,
    reason: '',
    illegal,
    holding: {
      ...holding,
      tierId: next.id,
      gridSize: next.grid,
      // MỞ RỘNG, không reset: công trình cũ giữ nguyên toạ độ và nguyên `occupiedBy`.
      tiles: expandGrid(holding.tiles, holding.gridSize, next.grid, rng),
      hinterland: growHinterland(holding.hinterland, rng, rank, next.rank),
      stores,
      permits: illegal
        ? { ...holding.permits, illegalWorks: [...holding.permits.illegalWorks, next.id] }
        : holding.permits,
    },
  };
}

// ---------------------------------------------------------------------------
// Biến phụ (mục 10)
// ---------------------------------------------------------------------------

/**
 * Bảng tổng kết một thành trì.
 *
 * Đây là thứ UI, AI và bài test cùng đọc, nên nó phải tính đúng MỘT LẦN ở đây.
 * Ba chỗ tự tính lấy là ba chỗ sẽ lệch nhau, và người chơi sẽ thấy bảng "Nếu bị
 * vây" nói mười bốn tuần rồi thành mất ở tuần thứ sáu.
 */
export function summarize(holding: Holding, date: GameDate, titleId = 'thuong-dan'): HoldingSummary {
  const pool = labourOf(holding, date);
  const production = produce(holding, { borrowed: 0, pool, besieged: holding.besieged });
  const capacity = capacityOf(production);
  const readiness = siegeReadiness(holding);
  const garrison = garrisonOf(holding, titleId);
  const unrest = unrestFor(holding.population.morale);

  return {
    id: holding.id,
    name: holding.name,
    tierId: holding.tierId,
    population: Math.round(holding.population.total),
    morale: holding.population.morale,
    foodPerWeek: production.food,
    foodEatenPerWeek: foodEaten(holding),
    capacity: capacity.total,
    housingCapacity: capacity.housing,
    foodCapacity: capacity.food,
    jobCapacity: capacity.jobs,
    workforce: pool.workforce,
    freeLabour: pool.free,
    siegeWeeks: readiness.weeks,
    garrison: garrison.men,
    defence: readiness.defence,
    beauty: production.beauty,
    unrest: unrest.name,
  };
}

/** Ngày trong game trôi đúng một tuần. Dùng lại `addDays` của Phần 0. */
export function nextWeek(date: GameDate): GameDate {
  return addDays(date, 7);
}

/** Cấp kiểm định chất lượng nào đang dùng — để tab Debug in ra. */
export function qualityCheckId(): string {
  return qualityConfig().checkId;
}
