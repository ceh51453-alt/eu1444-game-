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
import { planningRadius } from './place';
import { cellsToMetres } from './scale';
import {
  assignLayers,
  describeWall,
  hasWallOfLeast,
  standingWalls,
  wallDensity,
  wallMaterialOf,
  wallPrerequisiteOf,
  wallUpkeep,
  watchmenNeeded,
} from './walls';
import { describeRoad, pavingHygiene, roadSurfaceOf, roadUpkeep } from './roads';
import { tickNodes } from './nodes';
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
  // `produce` chỉ ĐẾM phần moi lên từ từng mạch (`production.drawn`); việc chốt
  // sổ mạch nằm ở mục 4b dưới đây, vì đó mới là chỗ một vùng cạn có thể BIẾN
  // MẤT khỏi danh sách — và một hàm tên là "sản xuất" thì không nên xoá được
  // thực thể khỏi state của người gọi.
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

  // 4b. CHỐT SỔ MẠCH TÀI NGUYÊN — hai luật, tách hẳn nhau.
  //
  // Vùng KHOÁNG SẢN (vỉa đá, mạch sắt, bãi cá, ruộng muối): bậc cố định, trừ
  // dần, moi tới tấn cuối cùng thì vùng BIẾN MẤT khỏi bản đồ.
  // Vùng TÁI SINH (rừng, đồng cỏ): mọc lại theo bậc × mùa, và bậc lên xuống
  // theo cán cân giữ gìn — mười năm chặt quá tay thì thưa một bậc, năm mươi
  // năm giữ gìn thì dày một bậc. Xem `nodes.ts`.
  const nodeTick = tickNodes(working.nodes, production.drawn, season.id);
  if (nodeTick.removed.length > 0) {
    // Một vùng biến mất thì xưởng đứng trên nó mất chỗ bám. Gỡ `nodeId` ngay ở
    // đây: để nó trỏ vào một vùng không còn tồn tại thì bảng sản lượng sẽ đọc
    // ra một mạch `null` mỗi tuần và không ai hiểu vì sao xưởng đứng không.
    const gone = new Set(nodeTick.removed);
    working = {
      ...working,
      nodes: nodeTick.nodes,
      buildings: working.buildings.map((placed) =>
        gone.has(placed.nodeId) ? { ...placed, nodeId: '' } : placed,
      ),
      projects: working.projects.map((project) =>
        gone.has(project.nodeId) ? { ...project, nodeId: '' } : project,
      ),
    };
  } else {
    working = { ...working, nodes: nodeTick.nodes };
  }
  for (const line of nodeTick.notes) notes.push(line);

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

  // 5b. CÔNG TRƯỜNG TƯỜNG THÀNH.
  //
  // Tách khỏi hàng đợi công trình vì tuyến tường không phải một công trình:
  // nó không chiếm khuôn viên, không có kiểm định chất lượng, không xuống cấp
  // theo cùng một bảng. Nhưng nó CHIA CHUNG hai ràng buộc thật của mục 6 —
  // mùa đông vữa không đông, và nhân công là thứ khan chứ không phải tiền.
  // Nhân công CÒN LẠI sau khi công trường công trình đã lấy phần của nó. Cho cả
  // hai cùng đọc `pool.free` là tiêu một người hai lần, và mục 6 nói thẳng nhân
  // công là ràng buộc thật — một ràng buộc tiêu được hai lần thì không phải ràng
  // buộc.
  const wallResult = advanceWalls(working, season.stoneWork, pool.free - build.labourUsed);
  working = wallResult.holding;
  for (const line of wallResult.notes) notes.push(line);

  // Phí duy trì tường: một vòng tường dài là một khoản chi trọn đời, và đó
  // chính là cái giá của việc vạch rộng.
  const wallCost = wallUpkeep(working.walls);
  if (wallCost > 0) {
    const paid = Math.min(wallCost, Math.max(0, working.stores['tien'] ?? 0));
    working = { ...working, stores: { ...working.stores, tien: (working.stores['tien'] ?? 0) - paid } };
    if (paid + 1e-9 < wallCost) {
      working = {
        ...working,
        walls: working.walls.map((wall) =>
          wall.weeksLeft > 0 ? wall : { ...wall, integrity: Math.max(1, wall.integrity - 0.4) },
        ),
      };
      notes.push('Không đủ tiền tu bổ tường — vữa mục dần và mặt tường bắt đầu nứt.');
    }
  }

  // 5c. CÔNG TRƯỜNG ĐƯỜNG SÁ — phần nhân công còn lại sau tường.
  const roadResult = advanceRoads(
    working,
    season.stoneWork,
    pool.free - build.labourUsed - wallResult.labourUsed,
  );
  working = roadResult.holding;
  for (const line of roadResult.notes) notes.push(line);

  // Phí duy trì mặt đường. Bỏ bê thì đá bong, và một quãng phố lở thì thoát
  // nước kém đi đúng bằng phần nó đã lở — xem `pavingHygiene`.
  const roadCost = roadUpkeep(working.roads);
  if (roadCost > 0) {
    const paid = Math.min(roadCost, Math.max(0, working.stores['tien'] ?? 0));
    working = { ...working, stores: { ...working.stores, tien: (working.stores['tien'] ?? 0) - paid } };
    if (paid + 1e-9 < roadCost) {
      working = {
        ...working,
        roads: working.roads.map((road) =>
          road.weeksLeft > 0 ? road : { ...road, integrity: Math.max(1, road.integrity - 0.6) },
        ),
      };
      notes.push('Không đủ tiền tu bổ đường — đá lát bong dần và rãnh thoát bắt đầu tắc.');
    }
  }

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
    // Mặt đường THOÁT NƯỚC, và đó là việc duy nhất nó làm về mặt cơ học — một
    // con phố đất trong một thành trì bốn nghìn dân là một rãnh bùn trộn phân.
    // Chặn trên 12 điểm nằm trong `pavingHygiene`; xem chú thích ở đó.
    hygiene: Math.max(
      0,
      Math.min(100, 45 + production.hygiene + pavingHygiene(working.roads) - (working.plague ? 20 : 0)),
    ),
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
// Công trường tường thành
// ---------------------------------------------------------------------------

/**
 * Một tuần trên các tuyến đang thi công.
 *
 * Nhân công rảnh chia đều cho các tuyến; tuyến nào cũng chỉ nhận tới mức tổ thợ
 * chuẩn của nó. Mùa đông thì công trường ĐÁ đứng im — vữa không đông, và đó là
 * cùng một luật đã áp cho công trình đá trong `data/resources.json`. Hàng rào gỗ
 * vẫn dựng được giữa mùa đông, và cái khác biệt ấy là một quyết định thật của
 * một lãnh chúa đang vội.
 */
function advanceWalls(
  holding: Holding,
  stoneWork: boolean,
  freeLabour: number,
): { holding: Holding; notes: string[]; labourUsed: number } {
  const building = holding.walls.filter((wall) => wall.weeksLeft > 0);
  if (building.length === 0) return { holding, notes: [], labourUsed: 0 };

  const notes: string[] = [];
  const share = Math.max(0, freeLabour) / building.length;
  let labourUsed = 0;

  const walls = holding.walls.map((wall) => {
    if (wall.weeksLeft <= 0) return wall;
    const material = wallMaterialOf(wall.materialId);
    if (material === null) return wall;
    if (material.stoneWork && !stoneWork) return wall;
    if (share <= 0) return wall;

    // Tiến độ tính bằng CÔNG, không bằng tuần trôi qua: một tuyến bỏ hoang không
    // tự xong. Nhưng vẫn có sàn số tuần, vì vữa cần thời gian đông dù có bao
    // nhiêu người đứng nhìn.
    const manWeeksLeft = Math.max(0, wall.manWeeksLeft - share);
    // Tổ thợ chỉ tiêu ĐÚNG phần công còn thiếu. Một tuyến sắp xong không nuốt
    // trọn suất của mình rồi bỏ phí — phần thừa đi tiếp xuống công trường đường.
    labourUsed += wall.manWeeksLeft - manWeeksLeft;
    const weeksLeft = Math.max(0, wall.weeksLeft - 1);
    const done = manWeeksLeft <= 0 && weeksLeft <= 0;
    if (done) notes.push(`${wall.name} dựng xong — ${describeWall({ ...wall, weeksLeft: 0 })}.`);
    return { ...wall, manWeeksLeft, weeksLeft: done ? 0 : Math.max(weeksLeft, manWeeksLeft > 0 ? 1 : 0) };
  });

  return { holding: { ...holding, walls: assignLayers(walls) }, notes, labourUsed };
}

// ---------------------------------------------------------------------------
// Công trường đường sá
// ---------------------------------------------------------------------------

/**
 * Một tuần trên các quãng phố đang lát.
 *
 * Cùng luật với công trường tường, và cố ý cùng: đá lát cần vữa hệt như tường
 * đá cần vữa, nên mùa đông một quãng phố lát đá cũng đứng im. Đường đất và
 * đường sỏi thì không, và đó là lý do chúng tồn tại — lãnh chúa nào cần một lối
 * đi được TRƯỚC MÙA XUÂN thì rải sỏi, rồi mười năm sau lát lại bằng đá.
 *
 * Nhân công vào đây là phần CÒN LẠI sau công trường công trình và công trường
 * tường. Ba cái công trường cùng đọc `pool.free` là tiêu một người ba lần.
 */
function advanceRoads(
  holding: Holding,
  stoneWork: boolean,
  freeLabour: number,
): { holding: Holding; notes: string[] } {
  const paving = holding.roads.filter((road) => road.weeksLeft > 0);
  if (paving.length === 0) return { holding, notes: [] };

  const notes: string[] = [];
  const share = Math.max(0, freeLabour) / paving.length;

  const roads = holding.roads.map((road) => {
    if (road.weeksLeft <= 0) return road;
    const surface = roadSurfaceOf(road.surfaceId);
    if (surface === null) return road;
    if (surface.stoneWork && !stoneWork) return road;
    if (share <= 0) return road;

    const manWeeksLeft = Math.max(0, road.manWeeksLeft - share);
    const weeksLeft = Math.max(0, road.weeksLeft - 1);
    const done = manWeeksLeft <= 0 && weeksLeft <= 0;
    if (done) notes.push(`${road.name} lát xong — ${describeRoad({ ...road, weeksLeft: 0 })}.`);
    return { ...road, manWeeksLeft, weeksLeft: done ? 0 : Math.max(weeksLeft, manWeeksLeft > 0 ? 1 : 0) };
  });

  return { holding: { ...holding, roads }, notes };
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

/**
 * Tiên quyết lên cấp: có cái từng là công trình, giờ là một TUYẾN TƯỜNG.
 *
 * `requiresBuildings` khai `bld_tuong-go` ở cấp Thành và `bld_tuong-da` ở cấp
 * Đại thành; cả hai giờ là vật liệu tường. Phép dịch nằm trong `walls.ts` để cả
 * `canPlace` lẫn chỗ này cùng đọc một bảng.
 */
function holdingHas(holding: Holding, buildingId: string): boolean {
  const material = wallPrerequisiteOf(buildingId);
  if (material !== null) return hasWallOfLeast(holding.walls, material);
  return holding.buildings.some((placed) => placed.buildingId === buildingId);
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
  const missingBuildings = rule.requiresBuildings.filter((id) => !holdingHas(holding, id));
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
export function upgrade(holding: Holding, allowIllegal = false): UpgradeResult {
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
    const names = check.buildings.missing
      .map((id) => {
        const material = wallPrerequisiteOf(id);
        if (material !== null) return `một vòng ${wallMaterialOf(material)?.name ?? material} khép kín`;
        return buildingOf(id)?.name ?? id;
      })
      .join(', ');
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

  const stores = { ...holding.stores };
  for (const [id, amount] of Object.entries(next.upgrade.cost)) {
    stores[id] = Math.max(0, (stores[id] ?? 0) - amount);
  }

  // LÊN CẤP LÀ NỚI TẦM VỚI, KHÔNG PHẢI ĐỔI ĐẤT.
  //
  // Bản cũ phải sinh thêm ô lưới và cấy thêm ruộng ở đây, và cả hai bước ấy đều
  // cần `rng` — nghĩa là lên cấp cùng một thành trì hai lần từ cùng một save cho
  // ra hai mảnh đất khác nhau. Bây giờ đất đã có sẵn từ tuần thứ nhất; lãnh chúa
  // chỉ vừa được phép với tay xa hơn. Không xúc xắc nào phải tung, và không công
  // trình nào có chỗ để rơi mất.
  return {
    ok: true,
    reason: '',
    illegal,
    holding: {
      ...holding,
      tierId: next.id,
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
    planningMetres: Math.round(cellsToMetres(planningRadius(holding))),
    wallMetres: Math.round(cellsToMetres(standingWalls(holding.walls).reduce((sum, wall) => sum + wall.length, 0))),
    // Không có tuyến nào thì mật độ vô nghĩa, và trả 0 sẽ làm UI kêu "thiếu
    // quân canh" ở một thành trì chưa có gì để canh. Trả 1: đủ đúng bằng cái
    // không phải canh.
    wallDensity: watchmenNeeded(holding.walls) === 0 ? 1 : wallDensity(holding.walls, garrison.men),
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
