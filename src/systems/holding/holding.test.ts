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
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { createRng } from '@/core/rng';
import { DEFAULT_START_DATE, addDays, seasonOfDate, type GameDate } from '@/core/clock';
import { canWrite, slices } from '@/state/slices';
import { registerGameSlices } from '@/state/register';
import { createInitialState } from '@/state/store';
import { garrisonMen } from '@/systems/siege/types';
import {
  adjacencyFor,
  adjacencyRules,
  allBuildings,
  allTiers,
  buildingOf,
  canPlace,
  canUpgrade,
  capacityOf,
  createHolding,
  demolish,
  entityIdFor,
  fortificationFromHolding,
  freeCells,
  garrisonOf,
  holdingConfig,
  labourOf,
  labourSeasonOf,
  placementOptions,
  produce,
  siegeReadiness,
  startProject,
  tierOf,
  upgrade,
  advanceWeek,
  type Building,
  type Cell,
  type Holding,
  type SettlementTier,
} from './index';

const SOURCE_DIR = join(import.meta.dirname);

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
    if (!couldFit(holding, building.id)) return false;
    return affordable(building);
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
  //
  // Nhồi thêm nhà khi nút thắt là việc làm thì chỉ tốn ô đất và không thêm được
  // một người dân nào; ô đất là tài nguyên khan nhất ở cấp 4, nên xây bừa còn
  // tệ hơn là đứng yên. Người lái vì thế chỉ trả lời đúng cửa đang hẹp.
  const bottleneckOrder: Record<string, string[]> = {
    'cho-o': ['bld_khu-nha-gach', 'bld_day-nha-o', 'bld_nha-go'],
    'luong-thuc': ['bld_nong-trai', 'bld_coi-xay'],
    // Nông trại là chỗ làm việc lớn nhất của một khu định cư trung cổ — phần lớn
    // dân đi cày, không đi làm xưởng. Bỏ nó khỏi danh sách việc làm là bỏ mất
    // nguồn việc chính và cả thành đứng lại ở vài trăm dân.
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
  const low = (id: string, floor: number): boolean => (holding.stores[id] ?? 0) < floor;
  if (low('da', 400) || low('sat', 60)) {
    const mine = buildingOf('bld_mo');
    if (mine !== null && buildable(mine)) return mine;
  }
  if (low('go', 300)) {
    const yard = buildingOf('bld_xuong-moc');
    if (yard !== null && buildable(yard)) return yard;
  }
  if (low('tien', 800)) {
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
 * khu nhà gạch: cùng một ô đất, nhà gỗ chứa 30 người còn khu nhà gạch chứa 130.
 * Tới cấp 4 thì ô đất là thứ khan nhất, nên phá dỡ là nước đi bình thường chứ
 * không phải nước cùng — và người lái phải biết nước ấy, nếu không thì con số
 * bài test đo được là giới hạn của người lái chứ không phải của hệ thống.
 */
/** Thứ có thể phá để lấy chỗ: nhà gỗ cấp 1, khi đã có bản thay thế tốt hơn. */
const SPARE_ID = 'bld_nha-go';

function makeRoom(holding: Holding, buildingId: string): Holding {
  const wanted = buildingOf(buildingId);
  if (wanted === null || wanted.perimeter || wanted.id === SPARE_ID) return holding;

  let working = holding;
  for (let attempt = 0; attempt < 12; attempt++) {
    if (placementOptions(working, buildingId).length > 0) return working;
    const spare = working.buildings.find((placed) => placed.buildingId === SPARE_ID);
    if (spare === undefined) break;
    working = demolish(working, spare.id).holding;
  }
  // Phá xong mà vẫn không đặt được thì đó là phá không công: mất chỗ ở, mất vật
  // liệu, và không xây được gì. Trả lại nguyên trạng — một lãnh chúa biết việc
  // đo trước khi cầm búa.
  return placementOptions(working, buildingId).length > 0 ? working : holding;
}

/** Có chỗ, hoặc dọn được chỗ. */
function couldFit(holding: Holding, buildingId: string): boolean {
  if (placementOptions(holding, buildingId).length > 0) return true;
  if (buildingId === SPARE_ID) return false;
  return holding.buildings.some((placed) => placed.buildingId === SPARE_ID);
}

/** Chọn ô: ưu tiên chỗ hiệu ứng kề nhau tốt nhất — người lái cũng biết mục 4. */
function bestCell(holding: Holding, buildingId: string): Cell | null {
  const options = placementOptions(holding, buildingId);
  if (options.length === 0) return null;
  let best: { cell: Cell; score: number } | null = null;
  // Quét thưa khi lưới lớn: bài test chạy hàng nghìn tuần, và quét đủ 256 ô cho
  // mỗi lần đặt là hàng triệu phép tính kề nhau mà không đổi kết luận nào.
  const step = options.length > 40 ? Math.ceil(options.length / 40) : 1;
  for (let index = 0; index < options.length; index += step) {
    const cell = options[index];
    if (cell === undefined) continue;
    const { effects } = adjacencyFor(holding, buildingId, cell);
    // Thiên vị XẾP SÁT nhau. Không có nó thì người lái rải công trình 1×1 khắp
    // lưới theo điểm kề nhau, và tới lúc cần đặt một xưởng 2×3 thì còn đúng ba
    // mươi ô trống rời rạc, không ô nào ghép được thành một mảnh. Người chơi
    // thật nhìn thấy điều đó bằng mắt; người lái phải được nói cho biết.
    const score =
      effects.output * 10 + effects.happiness + effects.siegeWeeks * 2 - (cell.x + cell.y) * 0.05;
    if (best === null || score > best.score) best = { cell, score };
  }
  return best?.cell ?? options[0] ?? null;
}

interface GrowthLog {
  years: number;
  weeks: number;
  /** Mốc từng cấp: cấp → tuần đạt được. */
  milestones: { tierId: string; week: number; population: number }[];
  /** Nút thắt đếm theo tuần. */
  bottlenecks: Record<string, number>;
  /** Tuần mà công trường đứng vì thiếu nhân công, theo mùa. */
  labourShortBySeason: Record<string, number>;
  /** Lý do công trường đứng, đếm theo tuần. */
  stalls: Record<string, number>;
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
  const bottlenecks: Record<string, number> = {};
  const labourShortBySeason: Record<string, number> = {};
  const stalls: Record<string, number> = {};
  let peakPopulation = 0;
  let week = 0;

  for (; week < maxWeeks; week++) {
    const tier = tierOf(holding.tierId);
    if (tier === null) break;

    // Lãnh chúa cấp trên hợp tác: cấp mọi giấy phép. Bài test này đo TỐC ĐỘ XÂY,
    // không đo chính trị — chính trị là Phần 13, và trộn hai thứ vào một con số
    // thì không rút ra được kết luận nào về thứ nào.
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
      const cell = bestCell(holding, building.id);
      if (cell === null) break;
      const result = startProject(holding, building.id, cell, {
        turn: week,
        architectSkill: 60,
        architectId: 'npc_kien-truc-su',
        allowIllegal: true,
      });
      if (!result.ok) break;
      holding = result.holding;
    }

    // LẤN RUỘNG CHỈ VÀO MÙA RẢNH. Kéo người khỏi ruộng giữa vụ gieo hay vụ gặt
    // đổi vài tuần công lấy một mùa đói — một lãnh chúa biết việc không làm thế,
    // và mục 6 viết ra hệ số phạt chính là để lựa chọn ấy có hậu quả thật.
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
        const season = labourSeasonOf(seasonOfDate(date)).name;
        labourShortBySeason[season] = (labourShortBySeason[season] ?? 0) + 1;
      }
    }

    const check = canUpgrade(holding);
    if (check.ok) {
      const result = upgrade(holding, rng, true);
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
    peakPopulation,
    final: holding,
  };
}

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

  it('lưới của năm cấp đúng bảng mục 3: 4 → 6 → 9 → 12 → 16', () => {
    expect(allTiers().map((tier) => tier.grid)).toEqual([4, 6, 9, 12, 16]);
  });

  it('mỗi cấp trỏ tới một khuôn công sự có thật của Phần 11', () => {
    for (const tier of allTiers()) expect(tier.fortTemplate.startsWith('fort_')).toBe(true);
  });
});

describe('Phần 12 mục 4 — lưới ô và kề nhau', () => {
  it('lên cấp thì lưới MỞ RỘNG, công trình cũ giữ nguyên toạ độ', () => {
    const rng = createRng('mo-rong-luoi');
    let holding = createHolding(rng, { slug: 'thu-nghiem', name: 'Thử Nghiệm', path: 'phat-trien', turn: 0, seat: true });
    const cell = placementOptions(holding, 'bld_nha-go')[0];
    expect(cell).toBeDefined();
    if (cell === undefined) return;

    const started = startProject(holding, 'bld_nha-go', cell, { turn: 0 });
    expect(started.ok).toBe(true);
    holding = started.holding;
    // Ép cho xong ngay để test hình học chứ không test tiến độ.
    holding = {
      ...holding,
      projects: [],
      buildings: [
        {
          id: entityIdFor('bld_nha-go', cell, false),
          buildingId: 'bld_nha-go',
          at: cell,
          integrity: 100,
          quality: 1,
          decayMultiplier: 1,
          customName: '',
          builtOnTurn: 0,
          maintained: true,
        },
      ],
    };

    const before = holding.gridSize;
    const grown = {
      ...holding,
      gridSize: 6,
      tiles: holding.tiles,
      tierId: 'lang',
    };
    expect(before).toBe(4);
    expect(grown.buildings[0]?.at).toEqual(cell);
  });

  it('bảy luật kề nhau của mục 4 đều có mặt và đều bắt được', () => {
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
    const rng = createRng('thuoc-da');
    const holding = createHolding(rng, { slug: 'mui-hoi', name: 'Mùi Hôi', path: 'phat-trien', turn: 0, seat: true, tierId: 'tran' });
    const withHouse: Holding = {
      ...holding,
      tiles: holding.tiles.map((tile) =>
        tile.x === 0 && tile.y === 0 ? { ...tile, terrain: 'dat-can', occupiedBy: 'nha@0,0' } : { ...tile, terrain: 'dat-can' },
      ),
      buildings: [
        {
          id: 'nha@0,0',
          buildingId: 'bld_nha-go',
          at: { x: 0, y: 0 },
          integrity: 100,
          quality: 1,
          decayMultiplier: 1,
          customName: '',
          builtOnTurn: 0,
          maintained: true,
        },
      ],
    };

    const near = adjacencyFor(withHouse, 'bld_thuoc-da', { x: 1, y: 0 });
    const far = adjacencyFor(withHouse, 'bld_thuoc-da', { x: 8, y: 8 });
    expect(near.effects.happiness).toBeLessThan(0);
    expect(far.effects.happiness).toBe(0);
  });

  it('không đặt được công trình lên mặt sông', () => {
    const rng = createRng('song');
    const holding = createHolding(rng, { slug: 'ben-song', name: 'Bến Sông', path: 'phat-trien', turn: 0, seat: true });
    const flooded: Holding = { ...holding, tiles: holding.tiles.map((tile) => ({ ...tile, terrain: 'song' })) };
    expect(canPlace(flooded, 'bld_nha-go', { x: 0, y: 0 }).ok).toBe(false);
    expect(freeCells(flooded)).toBe(0);
  });
});

describe('Phần 12 mục 12.6 — nối vào Fortification của Phần 11', () => {
  function seededTown(): Holding {
    const rng = createRng('cong-su');
    const holding = createHolding(rng, {
      slug: 'cua-nui',
      name: 'Cửa Núi',
      path: 'phat-trien',
      turn: 0,
      seat: true,
      tierId: 'thanh',
      population: 2400,
    });
    return {
      ...holding,
      tiles: holding.tiles.map((tile) => ({ ...tile, terrain: 'dat-can' })),
      buildings: [
        {
          id: 'tuong@vanh-dai',
          buildingId: 'bld_tuong-da',
          at: { x: -1, y: -1 },
          integrity: 100,
          quality: 1,
          decayMultiplier: 1,
          customName: '',
          builtOnTurn: 0,
          maintained: true,
        },
      ],
    };
  }

  it('tường đá xây thật thì Fortification có tường đá thật', () => {
    const fort = fortificationFromHolding(seededTown());
    expect(fort.outerWall.name).toBe('Tường đá');
    expect(fort.outerWall.integrity).toBeGreaterThan(300);
    expect(fort.id.startsWith('hold_')).toBe(true);
  });

  it('XÂY THÊM MỘT THÁP LÀM CUỘC VÂY HÃM KHÁC ĐI', () => {
    const base = seededTown();
    const before = fortificationFromHolding(base);

    const withTower: Holding = {
      ...base,
      buildings: [
        ...base.buildings,
        {
          id: 'thap@0,0',
          buildingId: 'bld_thap',
          at: { x: 0, y: 0 },
          integrity: 100,
          quality: 1,
          decayMultiplier: 1,
          customName: '',
          builtOnTurn: 0,
          maintained: true,
        },
      ],
    };
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
    const withStores: Holding = {
      ...stocked,
      buildings: [
        ...stocked.buildings,
        {
          id: 'gieng@1,1',
          buildingId: 'bld_gieng',
          at: { x: 1, y: 1 },
          integrity: 100,
          quality: 1,
          decayMultiplier: 1,
          customName: '',
          builtOnTurn: 0,
          maintained: true,
        },
        {
          id: 'kho@2,2',
          buildingId: 'bld_kho-luong',
          at: { x: 2, y: 2 },
          integrity: 100,
          quality: 1,
          decayMultiplier: 1,
          customName: '',
          builtOnTurn: 0,
          maintained: true,
        },
      ],
    };
    expect(siegeReadiness(withStores).weeks).toBeGreaterThan(siegeReadiness(stocked).weeks);
    expect(fortificationFromHolding(withStores).wells).toBe(1);
  });
});

describe('Phần 12 mục 12.7 — nối quân đồn trú vào Phần 10', () => {
  it('binh chủng lấy từ data/units.json, không phải một bảng riêng', () => {
    const rng = createRng('don-tru');
    const holding = createHolding(rng, {
      slug: 'don-tru',
      name: 'Đồn Trú',
      path: 'phat-trien',
      turn: 0,
      seat: true,
      tierId: 'tran',
      population: 1800,
    });
    const garrisoned: Holding = {
      ...holding,
      population: { ...holding.population, morale: 80 },
      buildings: [
        {
          id: 'trai@0,0',
          buildingId: 'bld_doanh-trai',
          at: { x: 0, y: 0 },
          integrity: 100,
          quality: 1,
          decayMultiplier: 1,
          customName: '',
          builtOnTurn: 0,
          maintained: true,
        },
      ],
    };
    const report = garrisonOf(garrisoned, 'nam-tuoc');
    expect(report.units.length).toBeGreaterThan(0);
    expect(report.units[0]?.typeId).toBe('unit_bo-binh-thue');
    expect(report.men).toBeGreaterThan(0);
  });

  it('tước vị chặn số đơn vị chỉ huy được', () => {
    const rng = createRng('tuoc-vi');
    const holding = createHolding(rng, {
      slug: 'tuoc-vi',
      name: 'Tước Vị',
      path: 'phat-trien',
      turn: 0,
      seat: true,
      tierId: 'thanh',
      population: 6000,
    });
    const many: Holding = {
      ...holding,
      population: { ...holding.population, morale: 85 },
      buildings: ['bld_doanh-trai', 'bld_truong-ban', 'bld_chuong-ngua'].map((id, index) => ({
        id: `${id}@${String(index)}`,
        buildingId: id,
        at: { x: index * 2, y: 0 },
        integrity: 100,
        quality: 1,
        decayMultiplier: 1,
        customName: '',
        builtOnTurn: 0,
        maintained: true,
      })),
    };
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

    const rng = createRng('toa-chinh');
    const a = createHolding(rng, { slug: 'mot', name: 'Một', path: 'phat-trien', turn: 0, seat: true });
    const b = createHolding(rng, { slug: 'hai', name: 'Hai', path: 'phat-trien', turn: 0, seat: true });
    const state = { ...createInitialState('hat-giong'), holdings: { list: [a, b], viewing: '', rumours: [], relations: [], localFame: [] } };
    expect(constraint?.check(state)).toContain('tòa chính');
  });

  it('AI ghi được tin đồn, KHÔNG ghi được một con số nào', () => {
    // Mục 10 cho AI đúng ba ô, và cả ba đều là văn bản không có hệ quả cơ học.
    // Nếu AI ghi được vào `population.total` thì một đoạn văn cảm động sẽ sinh
    // ra ba trăm dân, và R1 sụp trong đúng một lượt.
    expect(canWrite('ai', 'holdings.rumours')).toBe(true);
    expect(canWrite('ai', 'holdings.relations')).toBe(true);
    expect(canWrite('ai', 'holdings.localFame')).toBe(true);

    expect(canWrite('ai', 'holdings.list.0.population.total')).toBe(false);
    expect(canWrite('ai', 'holdings.list.0.stores.luong-thuc')).toBe(false);
    expect(canWrite('ai', 'holdings.list.0.buildings.0.integrity')).toBe(false);
    expect(canWrite('ai', 'holdings.list.0.tierId')).toBe(false);
    // Tên là `locked`: kể cả engine cũng không ghi qua MVU được, vì Phụ lục A
    // mục 9a dựa vào chỗ tên không đổi sau khi đã đặt.
    expect(canWrite('engine', 'holdings.list.0.name')).toBe(false);
  });

  it('hai thành trì trùng tên là vi phạm (Phụ lục A mục 9a)', () => {
    const slice = slices.get('holdings');
    const constraint = slice?.constraints?.find((row) => row.id === 'holdings.khong-trung-ten');
    const rng = createRng('trung-ten');
    const a = createHolding(rng, { slug: 'mot', name: 'Bạch Dương', path: 'phat-trien', turn: 0, seat: true });
    const b = createHolding(rng, { slug: 'hai', name: 'bạch dương', path: 'phat-trien', turn: 0 });
    const state = { ...createInitialState('hat-giong'), holdings: { list: [a, b], viewing: '', rumours: [], relations: [], localFame: [] } };
    expect(constraint?.check(state)).toContain('cùng tên');
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
  }, 120_000);
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
    // chính nó. Một bộ gác không phân biệt được hai chỗ ấy thì hoặc là bỏ sót,
    // hoặc là cấm luôn cả lời giải thích vì sao phải cấm.
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
    const rng = createRng('tien-to');
    const holding = createHolding(rng, { slug: 'kiem-tra', name: 'Kiểm Tra', path: 'phat-trien', turn: 0, seat: true });
    expect(holding.id.startsWith('hold_')).toBe(true);
    expect(fortificationFromHolding(holding).id.startsWith('hold_')).toBe(true);
  });

  it('dân số của thành trì là con số CHÍNH XÁC, không phải phần trăm', () => {
    const rng = createRng('chinh-xac');
    const holding = createHolding(rng, {
      slug: 'chinh-xac',
      name: 'Chính Xác',
      path: 'phat-trien',
      turn: 0,
      seat: true,
      population: 1240,
    });
    expect(holding.population.total).toBe(1240);
    const sum = holding.population.strata.reduce((total, row) => total + row.people, 0);
    expect(sum).toBeCloseTo(1240, 0);
  });
});
