/**
 * BÀI TEST CỦA PHẦN 12.
 *
 * Bài quan trọng nhất là mục 12.11: **nuôi một Thôn lên Đại thành**, in ra số
 * năm cần, các nút thắt gặp phải, và nhân công thiếu ở khúc nào. Ngưỡng nghiệm
 * thu do chính mục 12.11 đặt ra: **đi hết 5 cấp mà dưới 20 năm trong game là quá
 * nhanh.**
 *
 * Bài thứ hai là mục 13: **KIỂM TRA RANH GIỚI.** Nó không đo cân bằng, nó đo
 * kiến trúc — `holdings` có chạm vào thứ gì ngoài ba giao diện của mục 1 không.
 * Bài này chạy bằng cách đọc chính mã nguồn, vì một ranh giới chỉ được giữ bằng
 * lời hứa thì sẽ vỡ ở phần sau.
 *
 * Sau cuộc đại tu không gian, có thêm một nhóm bài thứ ba, và nó gác một thứ mà
 * hai nhóm trên không gác nổi: **mảnh đất phải TẤT ĐỊNH và phải SỐNG ĐƯỢC.**
 * Cùng hạt giống thì cùng con sông; và trong tầm với của một cái thôn thì luôn
 * phải có đủ đất, gỗ, đá và sắt — nếu không thì ván chơi hỏng trước tuần thứ
 * nhất, và không bài test nào khác phát hiện ra điều đó.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { createRng } from '@/core/rng';
import { DEFAULT_START_DATE, addDays, seasonOfDate, type GameDate } from '@/core/clock';
import { canWrite, slices, type GameState } from '@/state/slices';
import { registerGameSlices } from '@/state/register';
import { createInitialState } from '@/state/store';
import { garrisonMen } from '@/systems/siege/types';
import {
  CENTER_CELL,
  adjacencyFor,
  adjacencyRules,
  allBuildings,
  allTiers,
  assignLayers,
  buildingOf,
  canPlace,
  canUpgrade,
  capacityOf,
  cellsToMetres,
  DECLINE_WEEKS,
  GRADE_RADIUS,
  GROW_WEEKS,
  MAX_WEEKS_PER_TICK,
  NODE_ZONES,
  NODE_ZONE_DEFS,
  allHoldings,
  allResources,
  allTerrain,
  createHolding,
  demolish,
  distanceToStreet,
  gradeReserve,
  mineralReserve,
  regenPerWeek,
  tickNode,
  tickNodes,
  type NodeZone,
  type ResourceNode,
  holdingStreets,
  pavingHygiene,
  planRoad,
  razeStreet,
  roadUpkeep,
  runHoldingTick,
  startRoad,
  entityIdFor,
  fieldOf,
  findSpot,
  footprintOf,
  fortificationFromHolding,
  garrisonOf,
  generateField,
  generateNodes,
  hasRoomFor,
  hinterlandOf,
  holdingConfig,
  labourOf,
  labourSeasonOf,
  layoutHolding,
  nodeCapacity,
  outerWall,
  planWall,
  planningRadius,
  planningRadiusCells,
  produce,
  repairLayout,
  siegeReadiness,
  startProject,
  startWall,
  startingLayout,
  terrainAt,
  tierOf,
  upgrade,
  advanceWeek,
  wallDensity,
  wallUpkeep,
  watchmenNeeded,
  type Building,
  type Cell,
  type RoadLine,
  type Holding,
  type PlacedBuilding,
  type SettlementTier,
  type WallLine,
  type WallPoint,
} from './index';
import { migrateHolding, settleMigratedHolding } from './migrate';
import { holdingSchema } from './slice';

const SOURCE_DIR = join(import.meta.dirname);

// ---------------------------------------------------------------------------
// Dụng cụ chung
// ---------------------------------------------------------------------------

/** Một thành trì trần, không công trình dựng sẵn — nền của phần lớn bài test. */
function bareHolding(slug: string, options: Partial<Parameters<typeof createHolding>[1]> = {}): Holding {
  return createHolding(createRng(slug), {
    slug,
    name: slug,
    path: 'phat-trien',
    turn: 0,
    seat: true,
    ...options,
  });
}

/** Dựng sẵn một công trình đã xong, đúng chỗ hợp lệ gần toà chính nhất. */
function put(holding: Holding, buildingId: string, salt = 3): Holding {
  const at = findSpot(holding, buildingId, salt, { seeding: true });
  if (at === null) return holding;
  const check = canPlace(holding, buildingId, at, { seeding: true });
  const placed: PlacedBuilding = {
    id: entityIdFor(buildingId, at),
    buildingId,
    at,
    integrity: 100,
    quality: 1,
    decayMultiplier: 1,
    customName: '',
    builtOnTurn: 0,
    maintained: true,
    nodeId: check.node?.id ?? '',
  };
  return { ...holding, buildings: [...holding.buildings, placed] };
}

/** Một vòng tường khép kín bán kính `radius` ô quanh toà chính. */
function ring(radius: number, points = 16): WallPoint[] {
  const out: WallPoint[] = [];
  for (let index = 0; index < points; index++) {
    const angle = (index / points) * Math.PI * 2;
    out.push({
      x: Math.round(CENTER_CELL + Math.cos(angle) * radius),
      y: Math.round(CENTER_CELL + Math.sin(angle) * radius),
    });
  }
  const first = out[0];
  if (first !== undefined) out.push({ ...first });
  return out;
}

/** Một vùng trần để thử luật bậc, không cần cả một mảnh đất. */
function node(zone: NodeZone, grade: number): ResourceNode {
  const radius = GRADE_RADIUS[grade] ?? 42;
  return {
    id: `nd_${zone}-${String(grade)}`,
    zone,
    at: { x: CENTER_CELL + 200, y: CENTER_CELL },
    size: radius,
    grade,
    left: NODE_ZONE_DEFS[zone].renewal === 'tai-sinh' ? gradeReserve(grade) : mineralReserve(grade),
    coverage: [
      { x: CENTER_CELL + 200 - radius, y: CENTER_CELL - radius },
      { x: CENTER_CELL + 200 + radius, y: CENTER_CELL - radius },
      { x: CENTER_CELL + 200 + radius, y: CENTER_CELL + radius },
      { x: CENTER_CELL + 200 - radius, y: CENTER_CELL + radius },
    ],
    workedBy: [],
    strain: 0,
  };
}

const mineral = (grade: number): ResourceNode => node('mach-sat', grade);
const forest = (grade: number): ResourceNode => node('rung-go', grade);

/** Một tuyến thẳng dài `cells` ô, chạy ngang qua tâm. Dùng cho test đường sá. */
function line(cells: number): Cell[] {
  return [
    { x: CENTER_CELL - Math.round(cells / 2), y: CENTER_CELL },
    { x: CENTER_CELL + Math.round(cells / 2), y: CENTER_CELL },
  ];
}

/** Một `GameState` đủ dùng, có sẵn danh sách thành trì. */
function stateWith(list: readonly Holding[]): GameState {
  registerGameSlices();
  const state = createInitialState('tick-test');
  const slice = (state as unknown as Record<string, unknown>)['holdings'] as Record<string, unknown>;
  slice['list'] = [...list];
  return state;
}

/** Danh sách thành trì mà một lô op của `runHoldingTick` đề xuất. */
function holdingsAfter(state: GameState, result: ReturnType<typeof runHoldingTick>): Holding[] {
  void state;
  const op = result.ops.find((row) => row.path === 'holdings.list');
  return op === undefined ? [] : ((op as { to: Holding[] }).to);
}

/** Ghi lô op vào state — mô phỏng đúng chỗ `worldtick.ts` cho nó đi qua MVU. */
function applied(state: GameState, result: ReturnType<typeof runHoldingTick>): GameState {
  const rows = holdingsAfter(state, result);
  if (rows.length === 0) return state;
  const next = structuredClone(state);
  const slice = (next as unknown as Record<string, unknown>)['holdings'] as Record<string, unknown>;
  slice['list'] = rows;
  return next;
}

/** Dựng sẵn một tuyến tường ĐÃ XONG — bỏ qua công trường, để test hình học. */
function walled(holding: Holding, materialId: string, radius: number): Holding {
  const points = ring(radius);
  const plan = planWall(points, materialId, 1, fieldOf(holding));
  const line: WallLine = {
    id: `wall_test-${materialId}`,
    name: materialId,
    materialId,
    level: 1,
    points,
    length: plan.length,
    closed: plan.closed,
    integrity: 100,
    weeksLeft: 0,
    manWeeksLeft: 0,
    layer: 'ngoai',
  };
  return { ...holding, walls: assignLayers([...holding.walls, line]) };
}

// ---------------------------------------------------------------------------
// Người chơi giả lập — "một lãnh chúa biết việc"
// ---------------------------------------------------------------------------

/**
 * Chiến lược của người lái: **luôn xây thứ đang chặn mình.**
 *
 * Bài test đo TRẦN của hệ thống, nên người lái phải chơi gần tối ưu. Nếu người
 * lái chơi kém thì con số ra được không nói gì về thiết kế — nó chỉ nói rằng
 * người lái chơi kém. Ngược lại, một người lái gần tối ưu mà vẫn mất hàng chục
 * năm thì đó là một kết luận về hệ thống.
 */
function nextBuildingFor(holding: Holding, tier: SettlementTier): Building | null {
  const built = new Set(holding.buildings.map((row) => row.buildingId));
  const queued = new Set(holding.projects.map((row) => row.buildingId));
  const has = (id: string): boolean => built.has(id) || queued.has(id);

  const pool = labourOf(holding, DEFAULT_START_DATE);
  const production = produce(holding, { borrowed: 0, pool, besieged: false });
  const capacity = capacityOf(production);

  const affordable = (building: Building): boolean =>
    Object.entries(building.cost).every(([id, amount]) => (holding.stores[id] ?? 0) >= amount);

  const buildable = (building: Building): boolean => {
    if (building.minTier > tier.rank) return false;
    if (building.races.length > 0) return false;
    if (has(building.id) && building.group !== 'dan-sinh' && building.group !== 'san-xuat') return false;
    if (!affordable(building)) return false;
    return couldFit(holding, building.id);
  };

  const nextTier = allTiers().find((row) => row.rank === tier.rank + 1);
  const capped = capacity.total <= holding.population.total * 1.04;

  // 1. Điều kiện lên cấp kế tiếp — TRỪ KHI thành trì đang kịch trần sức chứa.
  //
  // Một tòa án dựng xong lúc dân còn cách ngưỡng ba nghìn người là một tòa án
  // đứng không mất mười năm. Khi trần đã chạm thì việc duy nhất đáng làm là nới
  // trần ra; điều kiện lên cấp đợi được, còn dân thì không.
  if (!capped) {
    for (const id of nextTier?.upgrade?.requiresBuildings ?? []) {
      if (has(id)) continue;
      const building = buildingOf(id);
      if (building !== null && buildable(building)) return building;
    }
  }

  // 2. Cửa hẹp nhất của sức chứa dân — và CHỈ cửa ấy.
  const bottleneckOrder: Record<string, string[]> = {
    'cho-o': ['bld_khu-nha-gach', 'bld_day-nha-o', 'bld_nha-go'],
    'luong-thuc': ['bld_nong-trai', 'bld_coi-xay'],
    // Nông trại là chỗ làm việc lớn nhất của một khu định cư trung cổ — phần lớn
    // dân đi cày, không đi làm xưởng.
    'viec-lam': [
      'bld_nong-trai',
      'bld_xuong-lon',
      'bld_xuong-nghe',
      'bld_cho',
      'bld_det',
      'bld_xuong-moc',
      'bld_quan-tro',
    ],
  };
  for (const id of bottleneckOrder[capacity.bottleneck] ?? []) {
    const building = buildingOf(id);
    if (building !== null && buildable(building)) return building;
  }

  // 3. Nguồn vật liệu, khi kho đang cạn thứ mà mọi công trình lớn đều cần.
  //
  // Ngưỡng cao hơn hẳn bản cũ, và đó là hệ quả trực tiếp của tường tính theo độ
  // dài: một vòng tường đá ăn hơn hai nghìn đá, nên "còn bốn trăm đá" không còn
  // là dư dả mà là sắp không xây nổi cái gì.
  const low = (id: string, floor: number): boolean => (holding.stores[id] ?? 0) < floor;
  if (low('da', 1200) || low('sat', 120)) {
    const mine = buildingOf('bld_mo');
    if (mine !== null && buildable(mine)) return mine;
  }
  if (low('go', 700)) {
    const yard = buildingOf('bld_xuong-moc');
    if (yard !== null && buildable(yard)) return yard;
  }
  if (low('tien', 1200)) {
    for (const id of ['bld_cho', 'bld_quan-tro', 'bld_vuon-nho']) {
      const building = buildingOf(id);
      if (building !== null && buildable(building)) return building;
    }
  }

  // 4. Kho lương và giếng: rẻ, và không có chúng thì cấp sau không mở được.
  for (const id of ['bld_gieng', 'bld_kho-luong', 'bld_xuong-nghe']) {
    if (has(id)) continue;
    const building = buildingOf(id);
    if (building !== null && buildable(building)) return building;
  }

  // 5. Đang kịch trần mà bước 1 đã bị bỏ qua: quay lại lo điều kiện lên cấp.
  if (capped) {
    for (const id of nextTier?.upgrade?.requiresBuildings ?? []) {
      if (has(id)) continue;
      const building = buildingOf(id);
      if (building !== null && buildable(building)) return building;
    }
  }
  return null;
}

/**
 * DỌN CHỖ.
 *
 * Một lãnh chúa biết việc không để cả một khu nhà gỗ cấp 1 chiếm mất chỗ của
 * khu nhà gạch: cùng một khoảnh đất, nhà gỗ chứa 30 người còn khu nhà gạch chứa
 * 130. Phá dỡ là nước đi bình thường chứ không phải nước cùng — và người lái
 * phải biết nước ấy, nếu không thì con số bài test đo được là giới hạn của
 * người lái chứ không phải của hệ thống.
 *
 * Sau cuộc đại tu, chỗ khan không còn là "ô đất" mà là ĐẤT TỐT TRONG TẦM VỚI:
 * gần toà chính, gần nước, gần mạch quặng, trong bán kính của cấp hiện tại.
 */
const SPARE_ID = 'bld_nha-go';

function makeRoom(holding: Holding, buildingId: string): Holding {
  const wanted = buildingOf(buildingId);
  if (wanted === null || wanted.id === SPARE_ID) return holding;

  let working = holding;
  for (let attempt = 0; attempt < 8; attempt++) {
    if (hasRoomFor(working, buildingId)) return working;
    const spare = working.buildings.find((placed) => placed.buildingId === SPARE_ID);
    if (spare === undefined) break;
    working = demolish(working, spare.id).holding;
  }
  // Phá xong mà vẫn không đặt được thì đó là phá không công. Trả lại nguyên
  // trạng — một lãnh chúa biết việc đo trước khi cầm búa.
  return hasRoomFor(working, buildingId) ? working : holding;
}

/** Có chỗ, hoặc dọn được chỗ. */
function couldFit(holding: Holding, buildingId: string): boolean {
  if (hasRoomFor(holding, buildingId)) return true;
  if (buildingId === SPARE_ID) return false;
  return holding.buildings.some((placed) => placed.buildingId === SPARE_ID);
}

/**
 * Chọn chỗ: ưu tiên hiệu ứng kề nhau tốt nhất — người lái cũng biết mục 4.
 *
 * Lấy mẫu tám chỗ hợp lệ bằng tám hạt muối khác nhau rồi chấm điểm, thay vì
 * liệt kê mọi chỗ đặt được. Vùng quy hoạch của một Đại thành là hơn hai vạn
 * điểm; liệt kê hết cho mỗi lần đặt là hàng triệu phép kề nhau mà không đổi
 * kết luận nào.
 */
function bestSpot(holding: Holding, buildingId: string): Cell | null {
  let best: { at: Cell; score: number } | null = null;
  for (let sample = 0; sample < 8; sample++) {
    const at = findSpot(holding, buildingId, sample * 37 + 5);
    if (at === null) continue;
    if (best !== null && best.at.x === at.x && best.at.y === at.y) continue;
    const { effects } = adjacencyFor(holding, buildingId, at);
    // Thiên vị XẾP GẦN toà chính. Không có nó thì người lái rải công trình ra
    // tận rìa vùng quy hoạch theo điểm kề nhau, và tới lúc cần một vòng tường
    // thì vòng ấy phải ôm cả một khoảnh đất rỗng — dài gấp đôi, đắt gấp đôi.
    const fromCentre = Math.hypot(at.x - CENTER_CELL, at.y - CENTER_CELL);
    const score = effects.output * 10 + effects.happiness + effects.siegeWeeks * 2 - fromCentre * 0.01;
    if (best === null || score > best.score) best = { at, score };
  }
  return best?.at ?? null;
}

/**
 * VÒNG TƯỜNG ÔM VỪA CÁI ĐANG CÓ.
 *
 * Người lái vạch sát nhất có thể: mọi công trình nằm trong, cộng một quãng thở.
 * Ôm rộng hơn là tự trả thêm tiền, thêm đá và thêm người canh cho một khoảnh
 * đất trống — và cái quyết định ấy chính là thứ bản cũ không có.
 */
function wallRadiusFor(holding: Holding): number {
  let reach = 60;
  for (const placed of holding.buildings) {
    const building = buildingOf(placed.buildingId);
    if (building === null) continue;
    const size = footprintOf(building);
    const distance = Math.hypot(placed.at.x + size / 2 - CENTER_CELL, placed.at.y + size / 2 - CENTER_CELL);
    reach = Math.max(reach, distance + size / 2);
  }
  return Math.min(planningRadius(holding) - 10, Math.round(reach + 18));
}

interface GrowthLog {
  years: number;
  weeks: number;
  milestones: { tierId: string; week: number; population: number }[];
  bottlenecks: Record<string, number>;
  labourShortBySeason: Record<string, number>;
  stalls: Record<string, number>;
  walls: { name: string; week: number; metres: number }[];
  peakPopulation: number;
  final: Holding;
}

function growVillageToMetropolis(maxWeeks: number): GrowthLog {
  const rng = createRng('bai-test-nuoi-thanh');
  let holding = createHolding(rng, {
    slug: 'bach-duong',
    name: 'Bạch Dương',
    path: 'phat-trien',
    turn: 0,
    seat: true,
    population: 60,
    stores: { tien: 60, go: 40, da: 10 },
  });

  let date: GameDate = { ...DEFAULT_START_DATE };
  const milestones: GrowthLog['milestones'] = [];
  const walls: GrowthLog['walls'] = [];
  const bottlenecks: Record<string, number> = {};
  const labourShortBySeason: Record<string, number> = {};
  const stalls: Record<string, number> = {};
  let peakPopulation = 0;
  let week = 0;

  for (; week < maxWeeks; week++) {
    const tier = tierOf(holding.tierId);
    if (tier === null) break;

    // Lãnh chúa cấp trên hợp tác: cấp mọi giấy phép. Bài test này đo TỐC ĐỘ XÂY,
    // không đo chính trị — chính trị là Phần 13.
    holding = {
      ...holding,
      permits: {
        ...holding.permits,
        granted: allTiers().map((row) => row.id),
        grantedWorks: allBuildings().map((row) => row.id),
      },
    };

    // Xếp hàng đợi cho đầy.
    while (holding.projects.length < tier.maxProjects) {
      const building = nextBuildingFor(holding, tier);
      if (building === null) break;
      holding = makeRoom(holding, building.id);
      const at = bestSpot(holding, building.id);
      if (at === null) break;
      const result = startProject(holding, building.id, at, {
        turn: week,
        architectSkill: 60,
        architectId: 'npc_kien-truc-su',
        allowIllegal: true,
      });
      if (!result.ok) break;
      holding = result.holding;
    }

    // TƯỜNG: điều kiện lên cấp 4 và cấp 5, và cũng là khoản chi lớn nhất một
    // lãnh chúa từng phải quyết. Vạch khi kho đã đủ, không sớm hơn.
    const check = canUpgrade(holding);
    const wantsWall = check.buildings.missing.find((id) => WALL_WANTED[id] !== undefined);
    if (wantsWall !== undefined && !holding.walls.some((wall) => wall.materialId === WALL_WANTED[wantsWall])) {
      const materialId = WALL_WANTED[wantsWall] ?? 'rao-go';
      const started = startWall({
        points: ring(wallRadiusFor(holding)),
        materialId,
        stores: holding.stores,
        existing: holding.walls,
        field: fieldOf(holding),
      });
      if (started.ok && started.line !== null) {
        const line = started.line;
        const stores = { ...holding.stores };
        for (const [id, amount] of Object.entries(started.spend)) stores[id] = (stores[id] ?? 0) - amount;
        holding = { ...holding, stores, walls: assignLayers([...holding.walls, line]) };
        walls.push({ name: line.name, week, metres: Math.round(cellsToMetres(line.length)) });
      }
    }

    // LẤN RUỘNG CHỈ VÀO MÙA RẢNH. Kéo người khỏi ruộng giữa vụ gieo hay vụ gặt
    // đổi vài tuần công lấy một mùa đói — mục 6 viết ra hệ số phạt chính là để
    // lựa chọn ấy có hậu quả thật.
    const season = labourSeasonOf(seasonOfDate(date));
    const report = advanceWeek(holding, rng, {
      date,
      turn: week,
      autoAssign: true,
      allowBorrow: season.farmDemand < 0.4,
    });
    holding = report.holding;
    peakPopulation = Math.max(peakPopulation, holding.population.total);

    const capacity = capacityOf(report.production);
    bottlenecks[capacity.bottleneck] = (bottlenecks[capacity.bottleneck] ?? 0) + 1;
    for (const stall of report.build.stalls) {
      const key = stall.reason.split(':')[0] ?? stall.reason;
      stalls[key] = (stalls[key] ?? 0) + 1;
      if (stall.reason.startsWith('thiếu nhân công')) {
        const name = labourSeasonOf(seasonOfDate(date)).name;
        labourShortBySeason[name] = (labourShortBySeason[name] ?? 0) + 1;
      }
    }

    if (canUpgrade(holding).ok) {
      const result = upgrade(holding, true);
      if (result.ok) {
        holding = result.holding;
        milestones.push({
          tierId: holding.tierId,
          week: week + 1,
          population: Math.round(holding.population.total),
        });
        if (tierOf(holding.tierId)?.rank === 5) break;
      }
    }

    date = addDays(date, 7);
  }

  return {
    weeks: week + 1,
    years: (week + 1) / holdingConfig().weeksPerYear,
    milestones,
    bottlenecks,
    labourShortBySeason,
    stalls,
    walls,
    peakPopulation,
    final: holding,
  };
}

/** Tiên quyết lên cấp nào là một tuyến tường, và tuyến ấy làm bằng gì. */
const WALL_WANTED: Readonly<Record<string, string>> = {
  'bld_rao-go': 'rao-go',
  'bld_tuong-go': 'tuong-go',
  'bld_tuong-da': 'tuong-da',
  'bld_tuong-trong': 'tuong-da',
};

// ---------------------------------------------------------------------------

describe('Phần 12 — data', () => {
  it('nạp được cả bốn file và mọi tham chiếu chéo đều có thật', () => {
    expect(allTiers()).toHaveLength(5);
    expect(allBuildings().length).toBeGreaterThan(30);
    expect(adjacencyRules().length).toBeGreaterThan(6);
    // Tám nhóm của mục 5 phải có mặt đủ, nếu không thì một nhánh quy hoạch trống.
    const groups = new Set(allBuildings().map((row) => row.group));
    for (const group of ['san-xuat', 'quan-su', 'dan-sinh', 'ton-giao', 'hanh-chinh', 'hoc-van', 'phong-thu', 'dac-thu-toc']) {
      expect(groups.has(group as Building['group'])).toBe(true);
    }
  });

  it('lên cấp NỚI BÁN KÍNH QUY HOẠCH, không đổi lưới', () => {
    const radii = allTiers().map((tier) => planningRadiusCells(tier.rank));
    for (let index = 1; index < radii.length; index++) {
      expect(radii[index] ?? 0).toBeGreaterThan(radii[index - 1] ?? 0);
    }
    // Một cái Thôn với tay được chừng bảy trăm thước; một Đại thành hơn hai cây số.
    expect(cellsToMetres(radii[0] ?? 0)).toBeLessThan(1000);
    expect(cellsToMetres(radii[4] ?? 0)).toBeGreaterThan(2000);
  });

  it('mỗi cấp trỏ tới một khuôn công sự có thật của Phần 11', () => {
    for (const tier of allTiers()) expect(tier.fortTemplate.startsWith('fort_')).toBe(true);
  });

  it('bốn công trình vành đai cũ đã rời bảng công trình — chúng là vật liệu tường', () => {
    for (const id of ['bld_rao-go', 'bld_tuong-go', 'bld_tuong-da', 'bld_tuong-trong']) {
      expect(buildingOf(id)).toBeNull();
    }
  });

  it('MỌI vùng tài nguyên đều có ít nhất một công trình với tới được', () => {
    // Bài này bắt một lỗi đã có thật: `bai-ca` và `dong-co` sinh ra trên bản
    // đồ, vẽ được, lọc được, mà không công trình nào trong cả game khai thác
    // nổi. Một vùng như thế là đồ trang trí, và không có bài test nào khác
    // phát hiện ra vì mọi thứ vẫn chạy đúng — chỉ là chạy đúng vào hư không.
    const reachable = new Set(allBuildings().flatMap((row) => row.requiresNode));
    for (const zone of NODE_ZONES) {
      const yields = Object.keys(NODE_ZONE_DEFS[zone].yields);
      expect(
        yields.some((id) => reachable.has(id)),
        `vùng "${zone}" nhả ra ${yields.join(', ')} mà không công trình nào khai thác được`,
      ).toBe(true);
    }
  });

  it('không tài nguyên nào bị SINH RA mà không ai dùng, hay bị ĂN mà không ai làm ra', () => {
    // Lỗi đã có thật, bốn cái cùng lúc: `len` không một công trình nào sản
    // xuất trong khi Xưởng dệt ăn 6 cuộn một tuần — nghĩa là xưởng dệt chưa
    // từng chạy nổi một tuần nào. Còn `vai`, `muoi`, `than` thì ngược lại:
    // moi lên rồi nằm kho tới hết ván, không ai mua và không công trình nào
    // tiêu. Cả bốn đều là dây chuyền hở, và cả bốn đều im lặng.
    const buildings = allBuildings();
    const fromLand = new Set(allTerrain().flatMap((row) => Object.keys(row.yields)));

    for (const resource of allResources()) {
      const id = resource.id;
      if (id === 'tien') continue; // tiền tiêu ở mọi chỗ, không cần dây chuyền
      const made = buildings.some((row) => (row.output[id] ?? 0) > 0) || fromLand.has(id);
      const used =
        buildings.some((row) => (row.consumes[id] ?? 0) > 0) ||
        buildings.some((row) => (row.cost[id] ?? 0) > 0);
      expect(made, `"${id}" không nguồn nào sinh ra mà vẫn có công trình đòi nó`).toBe(true);
      expect(used, `"${id}" sinh ra rồi nằm kho tới hết ván — không ai tiêu, không công trình nào xây bằng nó`).toBe(true);
    }
  });

  it('mỗi CẤP đều có đủ thứ để xây, không cấp nào là một khoảng trống', () => {
    // Cấp 1 từng chỉ có ba công trình và cấp 5 có bốn: hai đầu của cả hành
    // trình hai mươi năm đều là chỗ người chơi không có gì để quyết.
    for (const tier of allTiers()) {
      const opened = allBuildings().filter((row) => row.minTier === tier.rank);
      expect(opened.length, `cấp "${tier.id}" chỉ mở ra ${String(opened.length)} công trình`).toBeGreaterThanOrEqual(5);
    }
  });
});

describe('Phần 12 — MẢNH ĐẤT', () => {
  it('cùng hạt giống thì cùng mảnh đất, khác hạt giống thì khác', () => {
    const a = generateField('hold_thu', { dominant: 'doi', seed: 12345 });
    const b = generateField('hold_thu', { dominant: 'doi', seed: 12345 });
    const c = generateField('hold_thu', { dominant: 'doi', seed: 99999 });
    expect(a.kind).toEqual(b.kind);
    expect(a.kind).not.toEqual(c.kind);
  });

  it('mảnh đất KHÔNG nằm trong save — chỉ một hạt giống', () => {
    const holding = bareHolding('khong-luu');
    expect(Number.isInteger(holding.seed)).toBe(true);
    // Không còn `tiles`, không còn `gridSize`, không còn `hinterland`.
    expect('tiles' in holding).toBe(false);
    expect('gridSize' in holding).toBe(false);
    expect('hinterland' in holding).toBe(false);
  });

  it('lời kể nói "bên sông" thì bản đồ BẮT BUỘC có sông', () => {
    // Một mảnh đất sa mạc gần như không bao giờ tự sinh ra sông; gợi ý phải
    // thắng bảng tính cách, nếu không thì lời kể và bản đồ nói hai chuyện.
    const dry = generateField('hold_kho', { dominant: 'thao-nguyen', seed: 4242 });
    const wet = generateField('hold_kho', { dominant: 'thao-nguyen', seed: 4242, hints: { river: true } });
    expect(wet.river.length).toBeGreaterThan(0);
    expect(wet.kind).not.toEqual(dry.kind);
  });

  it('trong tầm với của một cái THÔN luôn có đủ đất, gỗ, đá và sắt', () => {
    // Hạn mức của mục 4 và mục 6: một khu định cư sinh ra giữa bảy quả đồi trọc
    // không phải là "khó", nó BẤT KHẢ — mọi công trình đầu tiên đều cần gỗ, và
    // mọi nguồn gỗ đều là công trình phải dựng bằng gỗ.
    const reach = planningRadiusCells(1);
    for (const dominant of ['dong-bang', 'doi', 'nui', 'rung', 'dam-lay', 'thao-nguyen', 'bien']) {
      for (let seed = 0; seed < 6; seed++) {
        const field = generateField(`hold_${dominant}-${String(seed)}`, { dominant, seed: seed * 7919 + 13 });
        // Quét LƯỚI chứ không quét theo tia: tia thưa dần khi ra xa, và một
        // khoảnh rừng lọt giữa hai tia sẽ báo thiếu ở chỗ thật ra có đủ.
        const found = new Set<string>();
        for (let y = CENTER_CELL - reach; y <= CENTER_CELL + reach; y += 7) {
          for (let x = CENTER_CELL - reach; x <= CENTER_CELL + reach; x += 7) {
            if (Math.hypot(x - CENTER_CELL, y - CENTER_CELL) > reach) continue;
            found.add(terrainAt(field, x, y));
          }
        }
        const where = `${dominant}#${String(seed)}`;
        expect(found.has('rung'), `${where} không có rừng`).toBe(true);
        expect(found.has('da-goc'), `${where} không có đá`).toBe(true);
        expect(found.has('mo-sat') || found.has('dam'), `${where} không có nguồn sắt`).toBe(true);
        expect(found.has('dat-tot') || found.has('dat-can'), `${where} không có đất cày`).toBe(true);
      }
    }
  });

  it('bảng đếm ruộng suy ra từ đất thật, và tổng vẫn đúng thang cũ', () => {
    const holding = bareHolding('dem-ruong');
    const rows = hinterlandOf(holding);
    const total = rows.reduce((sum, row) => sum + row.count, 0);
    expect(rows.length).toBeGreaterThan(1);
    expect(total).toBeGreaterThan(0);
    // Thành phần phản ánh mảnh đất: một thành trì trên núi có ít đất tốt hơn hẳn
    // một thành trì giữa đồng bằng, và trước đây điều đó chỉ đúng do may rủi.
    const plain = hinterlandOf(bareHolding('dong-bang-thu', { dominant: 'dong-bang' }));
    const hill = hinterlandOf(bareHolding('nui-thu', { dominant: 'nui' }));
    const good = (list: typeof rows): number => list.find((row) => row.terrain === 'dat-tot')?.count ?? 0;
    expect(good(plain)).toBeGreaterThan(good(hill));
  });
});

describe('Phần 12 — MẠCH TÀI NGUYÊN', () => {
  it('mạch có biên, có bậc, và có ngày cạn', () => {
    const field = generateField('hold_mo-thu', { dominant: 'doi', seed: 777 });
    const nodes = generateNodes(field);
    expect(nodes.length).toBeGreaterThan(0);
    for (const node of nodes) {
      expect(node.grade).toBeGreaterThanOrEqual(0);
      expect(node.grade).toBeLessThanOrEqual(3);
      expect(node.coverage.length).toBeGreaterThanOrEqual(3);
    }

    const rich = nodes.find((node) => node.grade === 3) ?? nodes[0];
    expect(rich).toBeDefined();
    if (rich === undefined) return;
    expect(rich.left).toBeGreaterThan(0);
  });

  it('MỎ: bậc CỐ ĐỊNH, đào hết là vùng biến mất chứ không tụt bậc', () => {
    const mine = mineral(3);
    expect(mine.left).toBe(mineralReserve(3));

    // Đào gần hết: bậc không nhúc nhích, vùng vẫn còn đó.
    const almost = tickNode(mine, mine.left - 10, 'ha');
    expect(almost.exhausted).toBe(false);
    expect(mine.grade).toBe(3);

    // Tấn cuối cùng: bậc về 0 và vùng phải biến mất.
    const last = tickNode(mine, 10, 'ha');
    expect(last.exhausted).toBe(true);
    expect(mine.grade).toBe(0);
    expect(last.note).toContain('tấn cuối cùng');
  });

  it('MỎ: tổng lượng moi lên được giữ nguyên so với bản tụt bậc dần', () => {
    // Bản cũ tụt 3→2→1 và nạp lại trữ lượng mỗi bậc, nên tổng là tổng ba bậc.
    // Bậc cố định mà chỉ giữ trữ lượng của riêng bậc 3 là ngầm cắt một phần ba
    // sản lượng cả đời cái mỏ, và cả đường cong kinh tế lệch theo.
    expect(mineralReserve(3)).toBe(gradeReserve(1) + gradeReserve(2) + gradeReserve(3));
    expect(mineralReserve(1)).toBe(gradeReserve(1));
  });

  it('RỪNG: mọc kịp mức bị chặt thì không xuống bậc, dù chặt mãi', () => {
    const wood = forest(3);
    const regen = regenPerWeek(wood, 'ha');
    // Chặt đúng bằng mức mọc lại — hoà cũng là bền vững.
    for (let week = 0; week < DECLINE_WEEKS + 60; week++) tickNode(wood, regen, 'ha');
    expect(wood.grade).toBe(3);
    expect(wood.strain).toBeGreaterThan(0);
  });

  it('RỪNG: chặt quá tay MƯỜI NĂM liên tục thì thưa một bậc', () => {
    const wood = forest(3);
    const tooMuch = regenPerWeek(wood, 'xuan') * 3;
    let shift = 0;
    for (let week = 0; week < DECLINE_WEEKS; week++) shift += tickNode(wood, tooMuch, 'ha').gradeShift;
    expect(shift).toBe(-1);
    expect(wood.grade).toBe(2);
    // Bậc tụt thì vùng CO LẠI — nhìn bản đồ là thấy rừng thưa đi.
    expect(wood.size).toBeLessThan(GRADE_RADIUS[3] ?? 130);
  });

  it('RỪNG: giữ gìn NĂM MƯƠI NĂM liên tục thì dày lên một bậc', () => {
    const wood = forest(2);
    let shift = 0;
    for (let week = 0; week < GROW_WEEKS; week++) shift += tickNode(wood, 0, 'ha').gradeShift;
    expect(shift).toBe(1);
    expect(wood.grade).toBe(3);
  });

  it('RỪNG: "duy trì" nghĩa là LIÊN TỤC — đứt một tuần là đếm lại từ đầu', () => {
    const wood = forest(2);
    for (let week = 0; week < GROW_WEEKS - 10; week++) tickNode(wood, 0, 'ha');
    expect(wood.grade).toBe(2);

    // Một tuần chặt quá tay ngay trước vạch đích.
    tickNode(wood, regenPerWeek(wood, 'ha') * 5, 'ha');
    expect(wood.strain).toBe(-1);

    // Mười tuần nữa không đủ nữa: đồng hồ đã về 0.
    for (let week = 0; week < 10; week++) tickNode(wood, 0, 'ha');
    expect(wood.grade).toBe(2);
  });

  it('RỪNG: chặt trụi tới bậc 0 thì vùng cũng biến mất', () => {
    const wood = forest(1);
    const tooMuch = regenPerWeek(wood, 'xuan') * 4;
    let last = tickNode(wood, tooMuch, 'ha');
    for (let week = 1; week < DECLINE_WEEKS; week++) last = tickNode(wood, tooMuch, 'ha');
    expect(last.exhausted).toBe(true);
    expect(wood.grade).toBe(0);
    expect(last.note).toContain('trơ đất');
  });

  it('THỜI TIẾT đổi tốc độ hồi phục — mùa đông cây gần như đứng im', () => {
    const wood = forest(3);
    expect(regenPerWeek(wood, 'dong')).toBeLessThan(regenPerWeek(wood, 'xuan'));
    expect(regenPerWeek(wood, 'dong')).toBeGreaterThan(0);
    // Vùng khoáng sản không hồi phục, mùa nào cũng vậy.
    expect(regenPerWeek(mineral(3), 'xuan')).toBe(0);
  });

  it('`tickNodes` bỏ vùng đã cạn khỏi bảng và nói ra trong nhật ký', () => {
    const mine = mineral(1);
    const wood = forest(2);
    const result = tickNodes([mine, wood], { [mine.id]: mine.left }, 'ha');
    expect(result.removed).toEqual([mine.id]);
    expect(result.nodes.map((row) => row.id)).toEqual([wood.id]);
    expect(result.notes).toHaveLength(1);
    // KHÔNG mutate bảng của người gọi — vùng gốc vẫn nguyên bậc.
    expect(mine.grade).toBe(1);
  });

  it('bậc càng cao càng nuôi nổi nhiều xưởng', () => {
    const field = generateField('hold_suc-chua', { dominant: 'nui', seed: 31337 });
    for (const node of generateNodes(field)) {
      expect(nodeCapacity(node)).toBe(node.grade);
    }
  });

  it('xưởng cưa phải đứng TRONG vùng rừng, không phải giữa đồng', () => {
    const holding = bareHolding('xuong-cua', { dominant: 'rung', tierId: 'tran', population: 900 });
    const good = findSpot(holding, 'bld_xuong-moc', 1, { seeding: true });
    expect(good).not.toBeNull();
    if (good === null) return;
    expect(canPlace(holding, 'bld_xuong-moc', good, { seeding: true }).node).not.toBeNull();

    // Ngay giữa nền thành thì chắc chắn không có rừng — nền thành đã được dọn.
    const yard = { x: CENTER_CELL - 8, y: CENTER_CELL - 8 };
    const denied = canPlace(holding, 'bld_xuong-moc', yard, { seeding: true });
    expect(denied.ok).toBe(false);
    expect(denied.reason).toContain('vùng');
  });
});

describe('Phần 12 — TUYẾN TƯỜNG', () => {
  it('chi phí đi theo ĐỘ DÀI THẬT, và vòng rộng gấp đôi thì đắt gấp đôi', () => {
    const small = planWall(ring(90), 'tuong-da', 1);
    const big = planWall(ring(180), 'tuong-da', 1);
    expect(small.ok && big.ok).toBe(true);
    expect(big.length / small.length).toBeCloseTo(2, 0);
    expect((big.cost['da'] ?? 0) / (small.cost['da'] ?? 1)).toBeCloseTo(2, 0);
    expect(big.watchmen).toBeGreaterThan(small.watchmen * 1.8);
  });

  it('hiệu chuẩn: một vòng điển hình tốn đúng bằng công trình vành đai cũ', () => {
    // Bốn công trình cũ đã qua cả một bài test nuôi thành hai mươi năm; đổi sang
    // tính theo độ dài mà không hiệu chuẩn là ngầm đổi cả đường cong kinh tế.
    const fence = planWall(ring(80), 'rao-go', 1);
    const timber = planWall(ring(120), 'tuong-go', 1);
    const stone = planWall(ring(180), 'tuong-da', 1);
    expect(fence.cost['go'] ?? 0).toBeGreaterThan(100);
    expect(fence.cost['go'] ?? 0).toBeLessThan(180);
    expect(timber.cost['go'] ?? 0).toBeGreaterThan(340);
    expect(timber.cost['go'] ?? 0).toBeLessThan(510);
    expect(stone.cost['da'] ?? 0).toBeGreaterThan(1800);
    expect(stone.cost['da'] ?? 0).toBeLessThan(2700);
  });

  it('tuyến HỞ chắn kém hẳn tuyến khép kín', () => {
    const closed = planWall(ring(120), 'tuong-da', 1);
    const open = planWall(ring(120).slice(0, 6), 'tuong-da', 1);
    expect(closed.closed).toBe(true);
    expect(open.closed).toBe(false);
    expect(open.integrity).toBeLessThan(closed.integrity);
  });

  it('vạch rộng là một khoản chi TRỌN ĐỜI, không chỉ một lần', () => {
    const holding = bareHolding('tuong-dai', { tierId: 'thanh', population: 3000 });
    const tight = walled(holding, 'tuong-da', 100);
    const wide = walled(holding, 'tuong-da', 220);
    expect(wallUpkeep(wide.walls)).toBeGreaterThan(wallUpkeep(tight.walls) * 1.8);
    expect(watchmenNeeded(wide.walls)).toBeGreaterThan(watchmenNeeded(tight.walls) * 1.8);
  });

  it('không đủ vật tư thì không khởi công được', () => {
    const holding = bareHolding('ngheo', { tierId: 'thanh', population: 3000 });
    const result = startWall({
      points: ring(150),
      materialId: 'tuong-da',
      stores: { da: 10 },
      existing: [],
      field: fieldOf(holding),
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('thiếu vật tư');
  });
});

describe('Phần 12 — MẠNG ĐƯỜNG', () => {
  it('cùng hạt giống thì cùng mạng đường, và KHÔNG lệ thuộc danh sách công trình', () => {
    // Đây là cả lý do `streets.ts` không cần một byte nào trong save. Nếu xây
    // thêm một công trình mà quan lộ dịch đi thì mạng đường buộc phải được chụp
    // lại vào save, và cùng với nó là mọi cách hai nguồn sự thật nói lệch nhau.
    const bare = bareHolding('duong-sa', { tierId: 'thi-tran', population: 900 });
    const built = put(put(bare, 'bld_nha-o', 1), 'bld_kho-thoc', 2);

    const before = holdingStreets(bare);
    const after = holdingStreets(built);

    // ĐÚNG MỘT quan lộ, và không có "đường lớn" nào. Nhiều tuyến cùng cỡ cắt
    // nhau giữa thành cho ra hình một nút giao chứ không phải hình một nơi mọc
    // lên bên vệ đường; muốn rẽ nhánh thì đã có ngõ.
    expect(before.network.highways).toHaveLength(1);
    expect(before.streets.every((row) => row.kind !== 'quan-lo' || row.id === 'hw0')).toBe(true);
    expect(after.network.highways.map((row) => row.id)).toEqual(before.network.highways.map((row) => row.id));
    for (let index = 0; index < before.network.highways.length; index++) {
      expect(after.network.highways[index]?.points).toEqual(before.network.highways[index]?.points);
    }
  });

  it('quan lộ CHẠY HẾT bản đồ, không dừng ở thành', () => {
    const holding = bareHolding('quan-lo', { tierId: 'thi-tran', population: 900 });
    const { network } = holdingStreets(holding);
    const main = network.highways[0];
    expect(main).toBeDefined();
    if (main === undefined) return;
    // Hai đầu tuyến phải ở xa tâm hơn hẳn bán kính quy hoạch: một con đường
    // dừng ở cổng thành là một con đường cụt, và thành trì thì nằm TRÊN đường.
    const first = main.points[0];
    const last = main.points[main.points.length - 1];
    const reach = planningRadius(holding);
    expect(Math.hypot((first?.x ?? 0) - CENTER_CELL, (first?.y ?? 0) - CENTER_CELL)).toBeGreaterThan(reach);
    expect(Math.hypot((last?.x ?? 0) - CENTER_CELL, (last?.y ?? 0) - CENTER_CELL)).toBeGreaterThan(reach);
  });

  it('người chơi cho phá một lối thì lối ấy biến mất, và chỉ cần lưu một chuỗi id', () => {
    const holding = bareHolding('pha-loi', { tierId: 'thi-tran', population: 900 });
    const before = holdingStreets(holding);
    const victim = before.streets[0];
    expect(victim).toBeDefined();
    if (victim === undefined) return;

    const razed = { ...holding, streetsRazed: razeStreet(holding.streetsRazed, victim.id) };
    const after = holdingStreets(razed);
    expect(after.streets.some((row) => row.id === victim.id)).toBe(false);
    expect(razed.streetsRazed).toEqual([victim.id]);
  });

  it('CỔNG là chỗ đường cắt tường — chưa có tường thì chưa có cổng nào', () => {
    const holding = bareHolding('cong-thanh', { tierId: 'thanh', population: 3000 });
    expect(holdingStreets(holding).gates).toHaveLength(0);

    const walledUp = walled(holding, 'tuong-da', 160);
    const gates = holdingStreets(walledUp).gates;
    expect(gates.length).toBeGreaterThan(0);
    // Cổng phải nằm TRÊN tuyến tường, không phải lơ lửng ở một bán kính danh nghĩa.
    for (const gate of gates) {
      const wall = walledUp.walls.find((row) => row.id === gate.wallId);
      expect(wall).toBeDefined();
      if (wall === undefined) continue;
      expect(distanceToStreet(gate.at, wall.points)).toBeLessThan(2);
    }
  });
});

describe('Phần 12 — ĐƯỜNG NGƯỜI CHƠI LÁT', () => {
  it('chi phí và thời gian đi theo ĐỘ DÀI THẬT, cùng luật với tường', () => {
    const short = planRoad(line(100), 'duong-lat-da', 1);
    const long = planRoad(line(200), 'duong-lat-da', 1);
    expect(short.ok && long.ok).toBe(true);
    expect((long.cost['da'] ?? 0) / (short.cost['da'] ?? 1)).toBeCloseTo(2, 0);
    expect(long.manWeeks / short.manWeeks).toBeCloseTo(2, 0);
  });

  it('rộng gấp đôi thì tốn gấp đôi và thoát nước gấp đôi', () => {
    const one = planRoad(line(160), 'duong-soi', 1);
    const two = planRoad(line(160), 'duong-soi', 2);
    expect((two.cost['da'] ?? 0) / (one.cost['da'] ?? 1)).toBeCloseTo(2, 1);
    expect(two.hygiene / one.hygiene).toBeCloseTo(2, 1);
  });

  it('VỆ SINH có chặn trên — không lát đá mua đứt được hệ dịch bệnh', () => {
    const paved: RoadLine[] = [];
    for (let index = 0; index < 40; index++) {
      const plan = planRoad(line(1000), 'duong-lat-da', 3);
      expect(plan.ok).toBe(true);
      paved.push({
        id: `road_${String(index)}`, name: `phố ${String(index)}`,
        surfaceId: 'duong-lat-da', width: 3,
        points: line(1000), length: plan.length,
        integrity: 100, weeksLeft: 0, manWeeksLeft: 0,
      });
    }
    expect(pavingHygiene(paved)).toBe(12);
  });

  it('đường ĐANG LÁT chưa thoát nước và chưa tính duy trì', () => {
    const plan = planRoad(line(400), 'duong-lat-da', 2);
    const building: RoadLine = {
      id: 'road_dang-lat', name: 'phố đang lát',
      surfaceId: 'duong-lat-da', width: 2,
      points: line(400), length: plan.length,
      integrity: 100, weeksLeft: 4, manWeeksLeft: 30,
    };
    expect(pavingHygiene([building])).toBe(0);
    expect(roadUpkeep([building])).toBe(0);
    expect(pavingHygiene([{ ...building, weeksLeft: 0 }])).toBeGreaterThan(0);
  });

  it('không đủ vật tư thì không khởi công được', () => {
    const holding = bareHolding('ngheo-duong', { tierId: 'thanh', population: 3000 });
    const result = startRoad({
      points: line(600), surfaceId: 'duong-lat-da',
      stores: { da: 2 }, existing: [], field: fieldOf(holding),
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('thiếu vật tư');
  });
});

describe('Phần 12 — CHỐT SỔ THEO LỊCH', () => {
  it('chưa đủ bảy ngày thì chỉ cộng dồn, không chốt tuần nào', () => {
    const state = stateWith([bareHolding('theo-lich', { tierId: 'thon', population: 80 })]);
    const result = runHoldingTick({
      state, days: 3, date: DEFAULT_START_DATE, rng: createRng('tick'), turn: 1,
    });
    expect(result.weeks).toBe(0);
    expect(holdingsAfter(state, result)[0]?.daysOwed).toBe(3);
    expect(holdingsAfter(state, result)[0]?.weeksLived).toBe(0);
  });

  it('đủ bảy ngày thì chốt một tuần và mang phần dư sang', () => {
    const state = stateWith([bareHolding('theo-lich', { tierId: 'thon', population: 80 })]);
    const result = runHoldingTick({
      state, days: 10, date: addDays(DEFAULT_START_DATE, 10), rng: createRng('tick'), turn: 1,
    });
    expect(result.weeks).toBe(1);
    const after = holdingsAfter(state, result)[0];
    expect(after?.weeksLived).toBe(1);
    expect(after?.daysOwed).toBe(3);
  });

  it('ngày lẻ CỘNG DỒN qua nhiều lượt rồi mới chốt — không rơi mất', () => {
    // Bốn lượt hai ngày là tám ngày, và tám ngày phải ra đúng một tuần. Nếu
    // phần dư bị bỏ ở mỗi lượt thì một ván toàn cảnh ngắn sẽ không bao giờ chốt
    // sổ được lần nào, và thành trì đứng im suốt ván.
    let state = stateWith([bareHolding('gop-ngay', { tierId: 'thon', population: 80 })]);
    let weeks = 0;
    for (let index = 0; index < 4; index++) {
      const result = runHoldingTick({
        state, days: 2, date: addDays(DEFAULT_START_DATE, (index + 1) * 2), rng: createRng('tick'), turn: index + 1,
      });
      weeks += result.weeks;
      state = applied(state, result);
    }
    expect(weeks).toBe(1);
    expect(allHoldings(state)[0]?.daysOwed).toBe(1);
  });

  it('tua rất lâu thì chốt bù có TRẦN, và nói thẳng ra trong nhật ký', () => {
    const state = stateWith([bareHolding('tua-lau', { tierId: 'thon', population: 80 })]);
    const result = runHoldingTick({
      state, days: 7 * (MAX_WEEKS_PER_TICK + 12), date: DEFAULT_START_DATE, rng: createRng('tick'), turn: 1,
    });
    expect(result.weeks).toBe(MAX_WEEKS_PER_TICK);
    expect(result.lines.some((line) => line.includes('không ai chốt sổ'))).toBe(true);
  });

  it('chốt bù đi qua ĐÚNG các mùa, không lặp lại một mùa duy nhất', () => {
    // Chốt bù bốn tháng bằng bốn lần gọi cùng một ngày tháng Chạp là bốn lần
    // mùa đông, và vụ gặt biến mất khỏi lịch sử của thành trì ấy.
    const seen = new Set<string>();
    const start: GameDate = { year: 1444, month: 1, day: 1, hour: 6 };
    for (let week = 1; week <= 40; week++) seen.add(seasonOfDate(addDays(start, week * 7)));
    expect(seen.size).toBeGreaterThan(2);
  });
});

describe('Phần 12 mục 4 — quy hoạch và kề nhau', () => {
  it('bảy luật kề nhau của mục 4 đều có mặt', () => {
    const required = [
      'adj_coi-xay-nuoc',
      'adj_thuoc-da-nha-o',
      'adj_cho-cong',
      'adj_lo-ren-mo',
      'adj_nha-tho-quang-truong',
      'adj_nha-o-tuong',
      'adj_kho-luong-gieng',
    ];
    const ids = new Set(adjacencyRules().map((rule) => rule.id));
    for (const id of required) expect(ids.has(id)).toBe(true);
  });

  it('xưởng thuộc da kề nhà ở phạt hạnh phúc, đặt xa thì không', () => {
    const base = bareHolding('mui-hoi', { tierId: 'tran', population: 900 });
    const houseAt = findSpot(base, 'bld_nha-go', 2, { seeding: true });
    expect(houseAt).not.toBeNull();
    if (houseAt === null) return;
    const withHouse = put(base, 'bld_nha-go', 2);

    const near = adjacencyFor(withHouse, 'bld_thuoc-da', { x: houseAt.x + 12, y: houseAt.y });
    const far = adjacencyFor(withHouse, 'bld_thuoc-da', { x: houseAt.x + 240, y: houseAt.y });
    expect(near.effects.happiness).toBeLessThan(0);
    expect(far.effects.happiness).toBe(0);
  });

  it('KHOẢNG THỞ là thật: hai công trình không đứng chạm nhau', () => {
    const base = bareHolding('khoang-tho', { tierId: 'tran', population: 900 });
    const withHouse = put(base, 'bld_nha-go', 4);
    const placed = withHouse.buildings[0];
    expect(placed).toBeDefined();
    if (placed === undefined) return;
    const size = footprintOf(buildingOf('bld_nha-go') ?? allBuildings()[0]!);
    // Ngay sát mép khuôn viên là quá gần — phải chừa lối đi.
    const touching = canPlace(withHouse, 'bld_nha-go', { x: placed.at.x + size, y: placed.at.y });
    expect(touching.ok).toBe(false);
    expect(touching.reason).toContain('quá sát');
  });

  it('ngoài bán kính quy hoạch là đất chưa khai phá', () => {
    const holding = bareHolding('tam-voi');
    const far = planningRadius(holding) + 40;
    const check = canPlace(holding, 'bld_nha-go', { x: Math.round(CENTER_CELL + far), y: CENTER_CELL });
    expect(check.ok).toBe(false);
    expect(check.reason).toContain('vùng quy hoạch');
  });

  it('tháp và cổng phải bám vào một tuyến tường', () => {
    const bare = bareHolding('thap-khong-tuong', { tierId: 'thanh', population: 3000 });
    const spot = { x: CENTER_CELL + 100, y: CENTER_CELL };
    expect(canPlace(bare, 'bld_thap', spot).ok).toBe(false);
    expect(canPlace(bare, 'bld_thap', spot).reason).toContain('tường');

    const withWall = walled(bare, 'tuong-da', 100);
    const at = findSpot(withWall, 'bld_thap', 1, { seeding: true });
    expect(at).not.toBeNull();
  });

  it('không đặt được công trình lên mặt sông', () => {
    // Một mảnh đất bắt buộc có sông, rồi thử đặt đúng lên tim dòng.
    const holding = bareHolding('ben-song', { hint: { river: true } });
    const field = fieldOf(holding);
    const mid = field.river[Math.floor(field.river.length / 2)];
    expect(mid).toBeDefined();
    if (mid === undefined) return;
    const check = canPlace(holding, 'bld_nha-go', { x: Math.round(mid.x) - 4, y: Math.round(mid.y) - 4 });
    expect(check.ok).toBe(false);
  });
});

describe('Phần 12 — TỰ BỐ TRÍ VÀ SỬA BỐ CỤC', () => {
  it('một thành trì được phong thì đã có sẵn công trình, một thôn tự nuôi thì chưa', () => {
    const granted = createHolding(createRng('duoc-phong'), {
      slug: 'duoc-phong', name: 'Được Phong', path: 'duoc-phong', turn: 0, seat: true,
      tierId: 'tran', population: 900,
    });
    const grown = bareHolding('tu-nuoi');
    expect(granted.buildings.length).toBeGreaterThan(0);
    expect(grown.buildings).toHaveLength(0);
  });

  it('thành ĐÁNH CHIẾM được thì công trình đã hư hại', () => {
    const seized = createHolding(createRng('danh-chiem'), {
      slug: 'danh-chiem', name: 'Đánh Chiếm', path: 'danh-chiem', turn: 0, seat: true,
      tierId: 'tran', population: 900,
    });
    expect(seized.buildings.length).toBeGreaterThan(0);
    expect(seized.buildings.every((placed) => placed.integrity < 100)).toBe(true);
  });

  it('sửa bố cục là IDEMPOTENT — chạy lại không dời gì thêm', () => {
    const holding = createHolding(createRng('sua-bo-cuc'), {
      slug: 'sua-bo-cuc', name: 'Sửa Bố Cục', path: 'xuat-than', turn: 0, seat: true,
      tierId: 'thanh', population: 3000,
    });
    const first = repairLayout(holding);
    const second = repairLayout(holding);
    expect(second.moved).toBe(0);
    expect(second.stranded).toBeLessThanOrEqual(first.stranded);
  });

  it('bố cục dựng sẵn theo cấp cộng dồn từ cấp dưới lên', () => {
    const village = startingLayout('lang').map((row) => row.buildingId);
    const town = startingLayout('thanh').map((row) => row.buildingId);
    for (const id of village) expect(town).toContain(id);
    expect(town.length).toBeGreaterThan(village.length);
  });

  it('không nhét công trình lên chỗ không đặt được', () => {
    const holding = bareHolding('tren-da', { dominant: 'nui', tierId: 'tran', population: 900 });
    layoutHolding(holding, [{ buildingId: 'bld_nha-go', count: 3 }]);
    for (const placed of holding.buildings) {
      expect(canPlace(holding, placed.buildingId, placed.at, { seeding: true, excludeId: placed.id }).ok).toBe(true);
    }
  });
});

describe('Phần 12 mục 12.6 — nối vào Fortification của Phần 11', () => {
  function seededTown(): Holding {
    const base = bareHolding('cua-nui', { tierId: 'thanh', population: 2400 });
    return walled(base, 'tuong-da', 110);
  }

  it('tường đá vạch thật thì Fortification có tường đá thật', () => {
    const fort = fortificationFromHolding(seededTown());
    expect(fort.outerWall.integrity).toBeGreaterThan(300);
    expect(fort.id.startsWith('hold_')).toBe(true);
  });

  it('KHÔNG CÓ TUYẾN NÀO thì chỉ có hàng giậu — thôn vẫn bị vây được', () => {
    const fort = fortificationFromHolding(bareHolding('khong-tuong'));
    expect(fort.outerWall.name).toContain('hàng giậu');
    expect(fort.outerWall.integrity).toBeLessThan(30);
  });

  it('VẠCH RỘNG GẤP ĐÔI LÀM THÀNH TRÌ YẾU ĐI, không mạnh lên', () => {
    // Con số này không tồn tại được ở bản cũ, vì ở đó tường không có chiều dài.
    const base = put(
      { ...bareHolding('rong-hep', { tierId: 'thanh', population: 2400 }), population: { ...bareHolding('rong-hep', { tierId: 'thanh', population: 2400 }).population, morale: 85 } },
      'bld_doanh-trai',
    );
    const tight = walled(base, 'tuong-da', 70);
    const wide = walled(base, 'tuong-da', 140);

    // Cùng một đạo quân đồn trú, vòng rộng gấp đôi thì mật độ trên mặt tường
    // loãng đi một nửa — và đó là toàn bộ cái giá của việc ôm thêm đất.
    const garrison = garrisonOf(tight, 'nam-tuoc').men;
    expect(watchmenNeeded(wide.walls) / watchmenNeeded(tight.walls)).toBeCloseTo(2, 0);
    expect(wallDensity(wide.walls, garrison)).toBeLessThan(wallDensity(tight.walls, garrison) * 0.6);

    // Và bảng "Nếu bị vây" phải NÓI RA điều đó, không chỉ tính thầm.
    const gap = (holding: Holding): boolean =>
      siegeReadiness(holding).weaknesses.some((line) => line.includes('chỗ trống'));
    expect(gap(wide)).toBe(true);
  });

  it('XÂY THÊM MỘT THÁP LÀM CUỘC VÂY HÃM KHÁC ĐI', () => {
    const base = seededTown();
    const before = fortificationFromHolding(base);
    const withTower = put(base, 'bld_thap', 1);
    const after = fortificationFromHolding(withTower);

    expect(before.outerWall.towers).toHaveLength(0);
    expect(after.outerWall.towers).toHaveLength(1);
    // Không chỉ là một dòng trong danh sách: tháp mang quân, nên số người bên
    // thủ cũng khác đi, và Phần 11 tính mật độ phòng thủ trên chính con số ấy.
    expect(garrisonMen(after)).toBeGreaterThan(garrisonMen(before));
    expect(siegeReadiness(withTower).defence).toBeGreaterThan(siegeReadiness(base).defence);
  });

  it('không giếng thì bảng "Nếu bị vây" nói thẳng ra điểm yếu ấy', () => {
    const readiness = siegeReadiness(seededTown());
    expect(readiness.weaknesses.some((line) => line.includes('giếng'))).toBe(true);
    expect(readiness.waterWeeks).toBeLessThan(Number.POSITIVE_INFINITY);
  });

  it('thêm giếng và kho lương thì cầm cự lâu hơn', () => {
    const base = seededTown();
    const stocked: Holding = { ...base, stores: { ...base.stores, 'luong-thuc': 30000 } };
    const withStores = put(put(stocked, 'bld_gieng', 5), 'bld_kho-luong', 9);
    expect(siegeReadiness(withStores).weeks).toBeGreaterThan(siegeReadiness(stocked).weeks);
    expect(fortificationFromHolding(withStores).wells).toBe(1);
  });

  it('công trình nằm NGOÀI tường là một điểm yếu có tên', () => {
    const base = bareHolding('ngoai-tuong', { tierId: 'thanh', population: 2400 });
    // Đặt tay ra tận rìa vùng quy hoạch: một cái nông trại ngoài đồng, đúng chỗ
    // không vòng tường nào ôm nổi.
    const outside: PlacedBuilding = {
      id: 'ngoai@xa',
      buildingId: 'bld_nha-go',
      at: { x: CENTER_CELL + 200, y: CENTER_CELL },
      integrity: 100, quality: 1, decayMultiplier: 1,
      customName: '', builtOnTurn: 0, maintained: true, nodeId: '',
    };
    const spread: Holding = { ...base, buildings: [outside] };
    const tight = walled(spread, 'tuong-da', 90);
    expect(siegeReadiness(tight).weaknesses.some((line) => line.includes('ngoài tường'))).toBe(true);

    // Ôm rộng ra tới nó thì điểm yếu ấy biến mất — người chơi trả tiền để mua
    // đúng cái đó.
    const generous = walled(spread, 'tuong-da', 260);
    expect(siegeReadiness(generous).weaknesses.some((line) => line.includes('ngoài tường'))).toBe(false);
  });
});

describe('Phần 12 mục 12.7 — nối quân đồn trú vào Phần 10', () => {
  it('binh chủng lấy từ data/units.json, không phải một bảng riêng', () => {
    const base = bareHolding('don-tru', { tierId: 'tran', population: 1800 });
    const garrisoned = put(
      { ...base, population: { ...base.population, morale: 80 } },
      'bld_doanh-trai',
    );
    const report = garrisonOf(garrisoned, 'nam-tuoc');
    expect(report.units.length).toBeGreaterThan(0);
    expect(report.units[0]?.typeId).toBe('unit_bo-binh-thue');
    expect(report.men).toBeGreaterThan(0);
  });

  it('tước vị chặn số đơn vị chỉ huy được', () => {
    const base = bareHolding('tuoc-vi', { tierId: 'thanh', population: 6000 });
    let many: Holding = { ...base, population: { ...base.population, morale: 85 } };
    for (const [index, id] of ['bld_doanh-trai', 'bld_truong-ban', 'bld_chuong-ngua'].entries()) {
      many = put(many, id, index * 13 + 2);
    }
    expect(garrisonOf(many, 'thuong-dan').units).toHaveLength(1);
    expect(garrisonOf(many, 'nam-tuoc').units.length).toBeGreaterThan(1);
  });
});

describe('Phần 12 mục 12.2 — slice holdings', () => {
  beforeAll(() => {
    slices.reset();
    registerGameSlices();
  });

  it('đăng ký được và có mặt trong state ban đầu', () => {
    const state = createInitialState('hat-giong');
    expect(state['holdings']).toEqual({ list: [], viewing: '', rumours: [], relations: [], localFame: [] });
  });

  it('hai tòa chính là vi phạm ràng buộc chéo', () => {
    const slice = slices.get('holdings');
    expect(slice).toBeDefined();
    const constraint = slice?.constraints?.find((row) => row.id === 'holdings.mot-toa-chinh');
    expect(constraint).toBeDefined();

    const a = bareHolding('mot');
    const b = bareHolding('hai');
    const state = { ...createInitialState('hat-giong'), holdings: { list: [a, b], viewing: '', rumours: [], relations: [], localFame: [] } };
    expect(constraint?.check(state)).toContain('tòa chính');
  });

  it('AI ghi được tin đồn, KHÔNG ghi được một con số nào', () => {
    expect(canWrite('ai', 'holdings.rumours')).toBe(true);
    expect(canWrite('ai', 'holdings.relations')).toBe(true);
    expect(canWrite('ai', 'holdings.localFame')).toBe(true);

    expect(canWrite('ai', 'holdings.list.0.population.total')).toBe(false);
    expect(canWrite('ai', 'holdings.list.0.stores.luong-thuc')).toBe(false);
    expect(canWrite('ai', 'holdings.list.0.buildings.0.integrity')).toBe(false);
    expect(canWrite('ai', 'holdings.list.0.tierId')).toBe(false);
    expect(canWrite('ai', 'holdings.list.0.nodes.0.left')).toBe(false);
    expect(canWrite('ai', 'holdings.list.0.walls.0.integrity')).toBe(false);
    // Tên là `locked`: kể cả engine cũng không ghi qua MVU được, vì Phụ lục A
    // mục 9a dựa vào chỗ tên không đổi sau khi đã đặt.
    expect(canWrite('engine', 'holdings.list.0.name')).toBe(false);
    // MẢNH ĐẤT cũng `locked`: một thành trì không được thức dậy vào một buổi
    // sáng và thấy con sông của mình đã dời chỗ.
    expect(canWrite('engine', 'holdings.list.0.seed')).toBe(false);
    expect(canWrite('ai', 'holdings.list.0.seed')).toBe(false);
  });

  it('AI bật được GỢI Ý ĐỊA THẾ — cửa duy nhất lời kể chạm tới đất', () => {
    expect(canWrite('ai', 'holdings.list.0.hint.river')).toBe(true);
  });

  it('hai thành trì trùng tên là vi phạm (Phụ lục A mục 9a)', () => {
    const slice = slices.get('holdings');
    const constraint = slice?.constraints?.find((row) => row.id === 'holdings.khong-trung-ten');
    const a = bareHolding('mot', { name: 'Bạch Dương' });
    const b = bareHolding('hai', { name: 'bạch dương', seat: false });
    const state = { ...createInitialState('hat-giong'), holdings: { list: [a, b], viewing: '', rumours: [], relations: [], localFame: [] } };
    expect(constraint?.check(state)).toContain('cùng tên');
  });
});

describe('Phần 12 — NÂNG SAVE CŨ', () => {
  /** Một thành trì đúng hình dạng bản cũ: lưới 12×12, tường là công trình. */
  function legacySave(): Record<string, unknown> {
    const tiles: unknown[] = [];
    for (let y = 0; y < 12; y++) {
      for (let x = 0; x < 12; x++) tiles.push({ x, y, terrain: 'dat-tot', occupiedBy: '' });
    }
    return {
      id: 'hold_aachen',
      name: 'Bạch Dương',
      tierId: 'thanh',
      gridSize: 12,
      tiles,
      hinterland: [{ terrain: 'rung', count: 9 }],
      buildings: [
        { id: 'a@2,2', buildingId: 'bld_nha-go', at: { x: 2, y: 2 }, integrity: 90, quality: 1, decayMultiplier: 1, customName: '', builtOnTurn: 0, maintained: true },
        { id: 'b@5,5', buildingId: 'bld_cho', at: { x: 5, y: 5 }, integrity: 80, quality: 1, decayMultiplier: 1, customName: '', builtOnTurn: 0, maintained: true },
        { id: 'w@-1,-1', buildingId: 'bld_tuong-da', at: { x: -1, y: -1 }, integrity: 70, quality: 1, decayMultiplier: 1, customName: '', builtOnTurn: 0, maintained: true },
      ],
      projects: [],
      population: {
        total: 2400, morale: 55,
        strata: [{ id: 'nong-no', people: 2400, morale: 55 }],
        races: [{ raceId: 'race_frank', people: 2400 }],
        raceTension: 0, levied: 0, levyWeeks: 0, skilled: {}, training: [],
      },
      stores: { 'luong-thuc': 900 },
      ownership: { path: 'xuat-than', legitimacy: 70, rivalClaimant: '', sinceTurn: 0, conqueredHatred: 0 },
      permits: { granted: [], grantedWorks: [], illegalWorks: [], discovered: false },
      obligations: { serviceDaysPerYear: 40, tributePerYear: 0, produceQuotaPerYear: 0, paidThisYear: false, arrearsYears: 0 },
      seat: true, besieged: false, plague: false, hygiene: 50, lastTurn: 0, weeksLived: 0,
    };
  }

  it('save cũ mở được, và KHÔNG ai mất bức tường mình đã trả tiền', () => {
    const raw = migrateHolding(legacySave());
    expect(raw['tiles']).toBeUndefined();
    expect(raw['gridSize']).toBeUndefined();
    expect(raw['hinterland']).toBeUndefined();
    expect(typeof raw['seed']).toBe('number');

    const walls = raw['walls'] as WallLine[];
    expect(walls).toHaveLength(1);
    expect(walls[0]?.materialId).toBe('tuong-da');
    expect(walls[0]?.closed).toBe(true);
    // Độ nguyên vẹn của công trình cũ đi thẳng sang tuyến.
    expect(walls[0]?.integrity).toBe(70);

    // Công trình vành đai KHÔNG còn nằm trong danh sách công trình nữa.
    const buildings = raw['buildings'] as { buildingId: string }[];
    expect(buildings).toHaveLength(2);
    expect(buildings.some((row) => row.buildingId === 'bld_tuong-da')).toBe(false);
  });

  it('địa hình lớn suy từ bản đồ thế giới, không bốc bừa', () => {
    // `hold_aachen` có thật trong `data/world-map.json` và khai địa hình `doi`.
    const raw = migrateHolding(legacySave());
    expect(raw['dominant']).toBe('doi');
    expect((raw['anchor'] as Cell).x).toBeGreaterThan(0);
  });

  it('sau khi dọn, mọi công trình đứng ở chỗ hợp lệ', () => {
    const parsed = holdingSchema.parse(migrateHolding(legacySave())) as unknown as Holding;
    settleMigratedHolding(parsed);
    expect(parsed.buildings.length).toBeGreaterThan(0);
    for (const placed of parsed.buildings) {
      const check = canPlace(parsed, placed.buildingId, placed.at, { seeding: true, excludeId: placed.id });
      expect(check.ok, `${placed.buildingId}: ${check.reason}`).toBe(true);
    }
    // Chạy lại không dời gì thêm — nếu không thì cả thành trì trôi đi trong
    // mười lượt, vì hàm này chạy mỗi lần mở bản đồ.
    expect(repairLayout(parsed).moved).toBe(0);
  });
});

describe('Phần 12 mục 12.11 — NUÔI MỘT THÔN LÊN ĐẠI THÀNH', () => {
  it('mất ít nhất 20 năm trong game, và in ra nút thắt', () => {
    const log = growVillageToMetropolis(52 * 400);

    const lines: string[] = [];
    lines.push('');
    lines.push('╔═ NUÔI THÔN LÊN ĐẠI THÀNH ═══════════════════════════════');
    lines.push(`║ Tổng: ${log.years.toFixed(1)} năm (${String(log.weeks)} tuần)`);
    lines.push(`║ Dân cuối: ${String(Math.round(log.final.population.total))} người · cấp: ${tierOf(log.final.tierId)?.name ?? '?'}`);
    lines.push('║');
    lines.push('║ MỐC TỪNG CẤP');
    let previous = 0;
    for (const milestone of log.milestones) {
      const tier = tierOf(milestone.tierId);
      const years = (milestone.week - previous) / 52;
      lines.push(
        `║   → ${(tier?.name ?? milestone.tierId).padEnd(10)} tuần ${String(milestone.week).padStart(5)} ` +
          `(+${years.toFixed(1)} năm) · ${String(milestone.population)} dân`,
      );
      previous = milestone.week;
    }
    lines.push('║');
    lines.push('║ TUYẾN TƯỜNG ĐÃ VẠCH');
    for (const wall of log.walls) {
      lines.push(`║   ${wall.name.padEnd(18)} tuần ${String(wall.week).padStart(5)} · ${String(wall.metres)} thước`);
    }
    lines.push('║');
    lines.push('║ NÚT THẮT SỨC CHỨA (số tuần)');
    for (const [id, count] of Object.entries(log.bottlenecks).sort((a, b) => b[1] - a[1])) {
      lines.push(`║   ${id.padEnd(12)} ${String(count).padStart(5)} tuần`);
    }
    lines.push('║');
    lines.push('║ THIẾU NHÂN CÔNG THEO MÙA (số tuần công trường đứng)');
    for (const [season, count] of Object.entries(log.labourShortBySeason).sort((a, b) => b[1] - a[1])) {
      lines.push(`║   ${season.padEnd(12)} ${String(count).padStart(5)} tuần`);
    }
    lines.push('║');
    lines.push('║ CÔNG TRƯỜNG ĐỨNG VÌ (số tuần)');
    for (const [reason, count] of Object.entries(log.stalls).sort((a, b) => b[1] - a[1]).slice(0, 8)) {
      lines.push(`║   ${reason.slice(0, 40).padEnd(42)} ${String(count).padStart(5)}`);
    }
    lines.push('╚═════════════════════════════════════════════════════════');
    // eslint-disable-next-line no-console
    console.log(lines.join('\n'));

    // Ngưỡng nghiệm thu của mục 12.11.
    expect(tierOf(log.final.tierId)?.rank).toBe(5);
    expect(log.years).toBeGreaterThanOrEqual(20);
    // Và một ngưỡng mới, do cuộc đại tu sinh ra: lên tới cấp 4 và cấp 5 thì
    // BẮT BUỘC phải có tường thật, vạch bằng tay, trả bằng đá thật.
    expect(log.final.walls.length).toBeGreaterThan(0);
    expect(outerWall(log.final.walls)).not.toBeNull();
  }, 300_000);
});

describe('Phần 12 mục 13 — KIỂM TRA RANH GIỚI', () => {
  const files = readdirSync(SOURCE_DIR).filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'));

  it('không file nào của `holdings` import từ `systems/realm`', () => {
    const offenders: string[] = [];
    for (const name of files) {
      const source = readFileSync(join(SOURCE_DIR, name), 'utf8');
      if (/from\s+'@\/systems\/realm/.test(source)) offenders.push(name);
      if (/state\['realm'\]|\.realm\b/.test(source)) offenders.push(`${name} (đọc slice realm)`);
    }
    expect(offenders).toEqual([]);
  });

  it('không file nào của `holdings` nhắc tới từ vựng của tầng lãnh thổ', () => {
    // Phụ lục A mục 4: mười cụm sai. Ở tầng thành trì thì "thuế suất", "chư hầu",
    // "tỉnh" và "ban luật" đều là dấu hiệu hai tầng đã lẫn.
    //
    // Quét MÃ, không quét chú thích: `types.ts` phải VIẾT RA những cái tên ấy
    // mới cấm được chúng, cùng lý do `core/vocabulary.test.ts` phải miễn trừ
    // chính nó.
    const banned = [/taxRate/, /vassals?\b/, /provinces\b/, /\bissueLaw\b/];
    const offenders: string[] = [];
    for (const name of files) {
      const source = readFileSync(join(SOURCE_DIR, name), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/\/\/.*$/gm, ' ');
      for (const pattern of banned) {
        if (pattern.test(source)) offenders.push(`${name}: ${pattern.source}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('mọi id thành trì mang tiền tố hold_', () => {
    const holding = bareHolding('kiem-tra');
    expect(holding.id.startsWith('hold_')).toBe(true);
    expect(fortificationFromHolding(holding).id.startsWith('hold_')).toBe(true);
  });

  it('dân số của thành trì là con số CHÍNH XÁC, không phải phần trăm', () => {
    const holding = bareHolding('chinh-xac', { population: 1240 });
    expect(holding.population.total).toBe(1240);
    const sum = holding.population.strata.reduce((total, row) => total + row.people, 0);
    expect(sum).toBeCloseTo(1240, 0);
  });
});
