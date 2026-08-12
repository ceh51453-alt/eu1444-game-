/**
 * XÂY DỰNG THEO TUẦN (Phần 12 mục 7).
 *
 * Một dự án tiến được bao nhiêu trong một tuần là hàm của bốn thứ, đúng như mục
 * 7 khai: **nhân công, tay nghề kiến trúc sư, mùa, và vật liệu đủ hay không.**
 * Thiếu bất kỳ thứ nào thì công trường ĐỨNG, và `stalled` nói rõ đứng vì cái gì
 * — một công trường im lặng không tiến suốt hai mươi tuần là cách nhanh nhất
 * làm người chơi bỏ cả hệ thống.
 *
 * HAI CHỖ ĐÁNG GIẢI THÍCH:
 *
 * **`minWeeks` không rút ngắn được.** Vữa phải khô, gỗ phải ngâm, móng phải
 * lún. Thêm người vào một công trường đã đủ người thì họ giẫm chân nhau —
 * `maxCrewMultiplier` chặn trên, `overCrewFactor` phạt phần thừa. Không có hai
 * cái đó thì lối chơi tối ưu là dồn cả thành vào một công trình, và cả hệ mùa vụ
 * của mục 6 mất tác dụng.
 *
 * **Kiểm định chất lượng dùng 3d6, không phải d100.** Phần 5 mục 2 phân miền
 * CỨNG: 3d6 là "năng lực dài hạn — quản trị, xây dựng, kinh tế, hậu cần". Dùng
 * d100 ở đây thì một công trình ba năm sẽ có cùng hình dạng xác suất với một cú
 * chém, và người chơi mất khả năng ước lượng — đúng thứ rủi ro mà phân miền sinh
 * ra để tránh.
 */

import type { Rng } from '@/core/rng';
import type { CheckTier } from '@/core/turn';
import { runCheck } from '@/systems/check/run';
import type { DifficultyBand } from '@/systems/check/difficulty';
import type { GameState } from '@/state/slices';
import { adjacencyFor } from './adjacency';
import {
  architectConfig,
  buildingOf,
  labourConfig,
  qualityConfig,
  terrainOf,
  tierOf,
  upkeepConfig,
  type Building,
  type QualityTier,
} from './data';
import { canPlace, cellsOf, occupy, release, tileAt } from './grid';
import type { LabourPool } from './labour';
import type { BuildProject, Cell, Holding, PlacedBuilding } from './types';

export class HoldingBuildError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HoldingBuildError';
  }
}

/** Id thực thể suy từ chỗ đứng — duy nhất vì hai công trình không chung ô. */
export function entityIdFor(buildingId: string, at: Cell, perimeter: boolean): string {
  if (perimeter) return `${buildingId}@vanh-dai`;
  return `${buildingId}@${String(at.x)},${String(at.y)}`;
}

// ---------------------------------------------------------------------------
// Khởi công
// ---------------------------------------------------------------------------

export interface StartOptions {
  turn: number;
  /** Kỹ năng kiến trúc sư 0–100. 0 nghĩa là không có ai. */
  architectSkill?: number;
  architectId?: string;
  playerRaces?: readonly string[];
  /** Cho phép xây lậu — công trình phòng thủ không có giấy phép (mục 3d). */
  allowIllegal?: boolean;
}

export interface StartResult {
  ok: boolean;
  reason: string;
  holding: Holding;
  /** Có ghi vào sổ xây lậu không. Phần 15 đọc sổ ấy để cho lãnh chúa phản ứng. */
  illegal: boolean;
}

/**
 * Công trình này có phải xin phép không.
 *
 * Mục 3d: xây thành lũy mà không được phép là TỘI, và lãnh chúa có quyền đem quân
 * san bằng. Nên cửa xin phép nằm ở nhóm `phong-thu`, không phải ở mọi công trình
 * — không ai xin phép để dựng một cái chuồng gà.
 */
export function needsPermit(building: Building): boolean {
  return building.group === 'phong-thu';
}

export function startProject(holding: Holding, buildingId: string, at: Cell, options: StartOptions): StartResult {
  const building = buildingOf(buildingId);
  if (building === null) {
    return { ok: false, reason: `không có công trình "${buildingId}"`, holding, illegal: false };
  }

  const tier = tierOf(holding.tierId);
  if (tier === null) {
    return { ok: false, reason: `thành trì ở cấp lạ: ${holding.tierId}`, holding, illegal: false };
  }
  if (holding.projects.length >= tier.maxProjects) {
    return {
      ok: false,
      reason: `${tier.name} chỉ trông coi nổi ${String(tier.maxProjects)} công trường cùng lúc`,
      holding,
      illegal: false,
    };
  }

  const placement = canPlace(holding, buildingId, at, options.playerRaces ?? []);
  if (!placement.ok) return { ok: false, reason: placement.reason, holding, illegal: false };

  const architect = architectConfig();
  const cells = cellsOf(building, at);
  const architectSkill = options.architectSkill ?? 0;
  if (building.needsArchitect || cells.length >= architect.requiredFromSize) {
    if (architectSkill <= 0) {
      return {
        ok: false,
        reason: `${building.name} phải có kiến trúc sư trông coi — chưa tìm được ai`,
        holding,
        illegal: false,
      };
    }
  }

  // Giấy phép: CỜ TẠM, Phần 13 hoàn thiện (mục 12.9). Xây lậu VẪN làm được —
  // đó là lựa chọn của người chơi, không phải lỗi của engine.
  let illegal = false;
  if (needsPermit(building) && !holding.permits.grantedWorks.includes(buildingId)) {
    if (options.allowIllegal !== true) {
      return {
        ok: false,
        reason: `${building.name} phải có giấy phép của lãnh chúa cấp trên`,
        holding,
        illegal: false,
      };
    }
    illegal = true;
  }

  const project: BuildProject = {
    id: entityIdFor(buildingId, at, building.perimeter),
    buildingId,
    at: building.perimeter ? { x: -1, y: -1 } : { ...at },
    manWeeksLeft: building.manWeeks,
    weeksLeft: building.minWeeks,
    crew: 0,
    delivered: {},
    missing: { ...building.cost },
    architectSkill,
    architectId: options.architectId ?? '',
    stalled: '',
    startedOnTurn: options.turn,
    qualityTier: '',
  };

  // Ô bị GIỮ CHỖ ngay từ lúc khởi công. Không giữ thì người chơi đặt chồng hai
  // công trường lên nhau và chỉ phát hiện lúc cái thứ hai xong.
  const tiles = building.perimeter ? holding.tiles : occupy(holding.tiles, holding.gridSize, cells, project.id);

  return {
    ok: true,
    reason: '',
    illegal,
    holding: {
      ...holding,
      tiles,
      projects: [...holding.projects, project],
      permits: illegal
        ? { ...holding.permits, illegalWorks: [...holding.permits.illegalWorks, buildingId] }
        : holding.permits,
    },
  };
}

/** Bỏ dở một công trường. Vật liệu đã giao mất một nửa. */
export function cancelProject(holding: Holding, projectId: string): Holding {
  const project = holding.projects.find((row) => row.id === projectId);
  if (project === undefined) return holding;
  const stores = { ...holding.stores };
  for (const [id, amount] of Object.entries(project.delivered)) {
    stores[id] = (stores[id] ?? 0) + amount * 0.5;
  }
  return {
    ...holding,
    stores,
    tiles: release(holding.tiles, projectId),
    projects: holding.projects.filter((row) => row.id !== projectId),
  };
}

// ---------------------------------------------------------------------------
// Một tuần trên công trường
// ---------------------------------------------------------------------------

/** Bậc độ khó của kiểm định chất lượng — công trình càng lớn càng dễ hỏng. */
export function qualityBandFor(building: Building): DifficultyBand {
  const cells = building.size[0] * building.size[1];
  const weight = Math.max(cells, building.manWeeks / 200);
  if (weight <= 1.5) return 'de-dang';
  if (weight <= 4) return 'thuong';
  if (weight <= 8) return 'kho';
  if (weight <= 14) return 'rat-kho';
  return 'cuc-kho';
}

function skilledFactor(building: Building, pool: LabourPool): { factor: number; missing: string } {
  const config = labourConfig();
  const needed = Object.entries(building.skilled);
  if (needed.length === 0) return { factor: 1, missing: '' };

  let worst = 1;
  let missing = '';
  for (const [id, count] of needed) {
    const have = pool.skilled[id] ?? 0;
    const share = count === 0 ? 1 : Math.min(1, have / count);
    if (share < worst) {
      worst = share;
      missing = id;
    }
  }
  if (worst >= 1) return { factor: 1, missing: '' };
  if (worst <= 0) return { factor: config.withoutSkilledFactor, missing };
  return { factor: Math.max(config.partialSkilledFloor, worst), missing };
}

/** Móng trên đầm phải đóng cọc; móng trên đá gốc phải đục. Cả hai đều chậm. */
function terrainBuildFactor(holding: Holding, building: Building, at: Cell): number {
  if (building.perimeter) return 1;
  const cells = cellsOf(building, at);
  let worst = 1;
  for (const cell of cells) {
    const tile = tileAt(holding, cell);
    if (tile === null) continue;
    const factor = terrainOf(tile.terrain)?.buildFactor ?? 1;
    if (factor < worst) worst = factor;
  }
  return worst;
}

export interface WeekOptions {
  pool: LabourPool;
  /** Nhân công phân cho công trường tuần này, theo id dự án. */
  assignment: Record<string, number>;
  turn: number;
  state?: GameState | null;
  besieged?: boolean;
}

export interface CompletedBuilding {
  placed: PlacedBuilding;
  tier: CheckTier;
  quality: QualityTier;
  /** Câu kể cho AI đọc. Engine sinh, AI không sửa (R1). */
  line: string;
}

export interface BuildWeekResult {
  holding: Holding;
  completed: CompletedBuilding[];
  /** Công trình sập trong lúc xây — mục 7, cấp `đại thất bại`. */
  collapsed: { buildingId: string; deaths: number; line: string }[];
  /** Công trường đứng, kèm lý do. Đây là danh sách UI hiện. */
  stalls: { projectId: string; reason: string }[];
  /** Người chết trên công trường tuần này. */
  deaths: number;
  /** Nhân công thật sự đã dùng — bài test của mục 12.11 đọc con số này. */
  labourUsed: number;
}

export function advanceProjects(holding: Holding, rng: Rng, options: WeekOptions): BuildWeekResult {
  const config = labourConfig();
  const quality = qualityConfig();
  const architect = architectConfig();

  let stores = { ...holding.stores };
  let tiles = holding.tiles;
  const buildings = [...holding.buildings];
  const projects: BuildProject[] = [];
  const completed: CompletedBuilding[] = [];
  const collapsed: BuildWeekResult['collapsed'] = [];
  const stalls: BuildWeekResult['stalls'] = [];
  let deaths = 0;
  let labourUsed = 0;

  for (const original of holding.projects) {
    const project = { ...original, delivered: { ...original.delivered }, missing: {}, stalled: '' };
    const building = buildingOf(project.buildingId);
    if (building === null) {
      projects.push(project);
      continue;
    }

    // --- vật liệu: kéo từ kho những gì còn thiếu, kéo được bao nhiêu hay bấy nhiêu
    let materialFactor = 1;
    const missing: Record<string, number> = {};
    for (const [id, need] of Object.entries(building.cost)) {
      const already = project.delivered[id] ?? 0;
      const short = Math.max(0, need - already);
      if (short > 0) {
        const taken = Math.min(short, Math.max(0, stores[id] ?? 0));
        if (taken > 0) {
          stores[id] = (stores[id] ?? 0) - taken;
          project.delivered[id] = already + taken;
        }
      }
      const delivered = project.delivered[id] ?? 0;
      if (delivered + 1e-9 < need) missing[id] = need - delivered;
      const share = need === 0 ? 1 : Math.min(1, delivered / need);
      if (share < materialFactor) materialFactor = share;
    }
    project.missing = missing;

    // --- nhân công
    const wanted = Math.max(0, options.assignment[project.id] ?? 0);
    const cap = building.minCrew * config.maxCrewMultiplier;
    const crew = Math.min(wanted, cap);
    project.crew = crew;

    // --- bốn cửa có thể làm công trường đứng, theo thứ tự dễ hiểu nhất cho người đọc
    if (options.besieged === true) {
      project.stalled = 'đang bị vây, không ai ra công trường';
    } else if (building.material === 'da' && !options.pool.season.stoneWork) {
      project.stalled = 'mùa đông — vữa không đông, chỉ chuẩn bị vật liệu được';
    } else if (crew < building.minCrew) {
      project.stalled = `thiếu nhân công: cần ${String(building.minCrew)}, có ${String(Math.floor(crew))}`;
    } else if (materialFactor <= 0) {
      const first = Object.keys(missing)[0] ?? 'vật liệu';
      project.stalled = `thiếu ${first}`;
    }

    if (project.stalled !== '') {
      stalls.push({ projectId: project.id, reason: project.stalled });
      projects.push(project);
      continue;
    }

    // --- tiến độ = f(nhân công, tay nghề kiến trúc sư, mùa, vật liệu) — mục 7
    const effectiveCrew = crew <= building.minCrew ? crew : building.minCrew + (crew - building.minCrew) * config.overCrewFactor;
    const skill = skilledFactor(building, options.pool);
    const { effects } = adjacencyFor(holding, project.buildingId, project.at, {
      besieged: options.besieged ?? false,
    });
    const architectSpeed = 1 + (project.architectSkill / 10) * architect.speedPerTenSkill;
    const work =
      effectiveCrew *
      options.pool.season.buildFactor *
      terrainBuildFactor(holding, building, project.at) *
      effects.buildSpeed *
      architectSpeed *
      skill.factor *
      materialFactor;

    labourUsed += crew;
    project.manWeeksLeft = Math.max(0, project.manWeeksLeft - work);
    project.weeksLeft = Math.max(0, project.weeksLeft - 1);
    if (skill.factor < 1) {
      project.stalled = `thiếu ${skill.missing} — công trường chỉ chạy được một phần`;
      stalls.push({ projectId: project.id, reason: project.stalled });
    }

    if (project.manWeeksLeft > 0 || project.weeksLeft > 0) {
      projects.push(project);
      continue;
    }

    // --- KIỂM ĐỊNH CHẤT LƯỢNG (mục 7). Tung MỘT LẦN cho mỗi công trình.
    let tier: CheckTier;
    if (project.qualityTier === '') {
      const run = runCheck(rng, {
        id: quality.checkId,
        system: '3d6',
        domain: quality.domain,
        difficulty: qualityBandFor(building),
        base: quality.baseTarget + (project.architectSkill / 10) * architect.qualityPerTenSkill,
        tags: ['xay-dung', building.group, options.pool.season.id],
        state: options.state ?? null,
      });
      tier = run.result.tier;
    } else {
      tier = project.qualityTier as CheckTier;
    }

    const row = quality.tiers[tier];

    // `costlySuccess` là "vượt ngân sách HOẶC CHẬM". Cái chậm phải là những tuần
    // có thật, nên lần đầu chạm đích ta ghi cấp lại rồi cộng thêm tuần đền bù.
    if (row.extraWeeks > 0 && project.qualityTier === '') {
      project.qualityTier = tier;
      project.weeksLeft = Math.round(row.extraWeeks);
      project.stalled = 'vượt ngân sách, phải xin thêm vật liệu và kéo dài';
      for (const [id, need] of Object.entries(building.cost)) {
        const extra = need * row.costOverrun;
        project.delivered[id] = (project.delivered[id] ?? 0) - extra;
      }
      stalls.push({ projectId: project.id, reason: project.stalled });
      projects.push(project);
      continue;
    }

    if (row.collapsed) {
      const dead = Math.round((crew / 10) * row.deathsPerTenCrew);
      deaths += dead;
      for (const [id, amount] of Object.entries(project.delivered)) {
        stores[id] = (stores[id] ?? 0) + amount * (1 - row.materialLoss);
      }
      tiles = release(tiles, project.id);
      collapsed.push({
        buildingId: project.buildingId,
        deaths: dead,
        line: `${building.name} sập trong lúc xây. ${String(dead)} người chết, phần lớn vật liệu mất theo.`,
      });
      continue;
    }

    const placed: PlacedBuilding = {
      id: entityIdFor(project.buildingId, project.at, building.perimeter),
      buildingId: project.buildingId,
      at: { ...project.at },
      integrity: row.integrity,
      quality: row.outputFactor,
      decayMultiplier: row.decayMultiplier,
      customName: '',
      builtOnTurn: options.turn,
      maintained: true,
    };

    // Tường lớp mới THAY lớp cũ (mục 3): không có thành nào có hai tường ngoài.
    let kept = buildings.filter((row2) => row2.id !== placed.id);
    const layer = building.fortify?.wallLayer;
    if (layer !== undefined && building.fortify?.replacesWall === true) {
      kept = kept.filter((row2) => {
        const other = buildingOf(row2.buildingId);
        return other?.fortify?.wallLayer !== layer;
      });
    }
    buildings.length = 0;
    buildings.push(...kept, placed);

    if (!building.perimeter) {
      tiles = occupy(tiles, holding.gridSize, cellsOf(building, project.at), placed.id);
    }

    completed.push({
      placed,
      tier,
      quality: row,
      line: `${building.name} xong — ${row.note}`,
    });
  }

  return {
    holding: { ...holding, stores, tiles, buildings, projects },
    completed,
    collapsed,
    stalls,
    deaths,
    labourUsed,
  };
}

// ---------------------------------------------------------------------------
// Xuống cấp và duy trì (mục 7, câu cuối)
// ---------------------------------------------------------------------------

export interface UpkeepResult {
  holding: Holding;
  /** Không trả nổi chi phí duy trì cho những công trình này. */
  unpaid: string[];
  /** Công trình đã hỏng tới mức sập, đã gỡ khỏi lưới. */
  ruined: string[];
  paid: Record<string, number>;
}

/**
 * Trả chi phí duy trì và tính xuống cấp.
 *
 * "Bỏ bê là hỏng" chỉ có nghĩa khi việc bỏ bê RẺ hơn việc trả — nên chi phí duy
 * trì phải là một khoản đều đặn đủ nặng để người chơi có lúc muốn bỏ, và xuống
 * cấp phải đủ nhanh để lúc ấy họ hối hận.
 */
export function payUpkeep(holding: Holding, upkeepDue: Record<string, number>, winter: boolean): UpkeepResult {
  const config = upkeepConfig();
  const stores = { ...holding.stores };
  const paid: Record<string, number> = {};
  const unpaid: string[] = [];
  const ruined: string[] = [];

  // Trả theo TỪNG tài nguyên: hết tiền nhưng còn than thì lò rèn vẫn có than.
  const shortfall = new Set<string>();
  for (const [id, amount] of Object.entries(upkeepDue)) {
    if (amount <= 0) continue;
    const have = stores[id] ?? 0;
    const taken = Math.min(amount, Math.max(0, have));
    stores[id] = have - taken;
    paid[id] = taken;
    if (taken + 1e-9 < amount) shortfall.add(id);
  }

  let tiles = holding.tiles;
  const buildings: PlacedBuilding[] = [];
  for (const placed of holding.buildings) {
    const building = buildingOf(placed.buildingId);
    if (building === null) {
      buildings.push(placed);
      continue;
    }
    // Bỏ bê là hỏng — nhưng trả đủ thì GIỮ ĐƯỢC. Khoản chi phí duy trì chính là
    // tiền lợp lại mái và trát lại vữa, nên nó phải bù được phần hao mòn tự
    // nhiên chứ không chỉ làm chậm nó lại.
    const owing = Object.keys(building.upkeep).some((id) => shortfall.has(id));
    let change = -config.decayPerWeek * placed.decayMultiplier;
    if (owing) change -= (config.decayUnpaidPerWeek - config.decayPerWeek) * placed.decayMultiplier;
    else change += config.upkeepRecoveryPerWeek;
    if (winter) change -= config.winterExtraDecay;
    if (holding.besieged) change -= config.besiegedExtraDecay;

    const integrity = Math.max(0, Math.min(100, placed.integrity + change));
    if (owing) unpaid.push(placed.buildingId);

    if (integrity < config.collapseBelow) {
      ruined.push(placed.buildingId);
      tiles = release(tiles, placed.id);
      continue;
    }
    buildings.push({ ...placed, integrity, maintained: !owing });
  }

  return { holding: { ...holding, stores, tiles, buildings }, unpaid, ruined, paid };
}

/**
 * PHÁ DỠ một công trình đã dựng.
 *
 * "phá dỡ" nằm trong bộ động từ độc quyền của THÀNH TRÌ (Phụ lục A mục 4), và
 * nó phải có thật vì ô đất là tài nguyên khan nhất của Phần 12: tới cấp 4 thì
 * một lưới 12×12 lát đầy nhà gỗ cấp 1 là một thành trì không bao giờ lớn thêm
 * được nữa. Không có cửa phá dỡ thì một quyết định quy hoạch tồi ở năm thứ năm
 * khoá chết ván chơi ở năm thứ sáu mươi, và người chơi không có cách nào biết
 * điều đó lúc họ đặt viên gạch đầu tiên.
 *
 * Thu hồi được một phần vật liệu — đá cũ xây lại được, gỗ mục thì không.
 */
export function demolish(
  holding: Holding,
  entityId: string,
  refund = 0.3,
): { holding: Holding; recovered: Record<string, number>; name: string } {
  const placed = holding.buildings.find((row) => row.id === entityId);
  if (placed === undefined) return { holding, recovered: {}, name: '' };
  const building = buildingOf(placed.buildingId);

  const stores = { ...holding.stores };
  const recovered: Record<string, number> = {};
  for (const [id, amount] of Object.entries(building?.cost ?? {})) {
    // Vật liệu đã hỏng theo công trình: một cái nhà mục 40/100 thì gỡ ra cũng
    // chỉ còn ngần ấy gỗ dùng lại được.
    const got = amount * refund * (placed.integrity / 100);
    if (got <= 0) continue;
    stores[id] = (stores[id] ?? 0) + got;
    recovered[id] = got;
  }

  return {
    recovered,
    name: building?.name ?? placed.buildingId,
    holding: {
      ...holding,
      stores,
      tiles: release(holding.tiles, entityId),
      buildings: holding.buildings.filter((row) => row.id !== entityId),
    },
  };
}

/** Sửa chữa: đổ nhân công và vật liệu vào để kéo `integrity` lên. */
export function repair(holding: Holding, buildingEntityId: string, workers: number): { holding: Holding; repaired: number } {
  const config = upkeepConfig();
  const placed = holding.buildings.find((row) => row.id === buildingEntityId);
  if (placed === undefined || placed.integrity >= 100) return { holding, repaired: 0 };

  const building = buildingOf(placed.buildingId);
  const material = building?.material === 'da' ? 'da' : 'go';
  const wanted = Math.min(100 - placed.integrity, workers * config.repairPerWeekPerWorker);
  const affordable = Math.max(0, holding.stores[material] ?? 0) / Math.max(0.0001, config.repairMaterialPerPoint);
  const repaired = Math.min(wanted, affordable);
  if (repaired <= 0) return { holding, repaired: 0 };

  return {
    repaired,
    holding: {
      ...holding,
      stores: { ...holding.stores, [material]: (holding.stores[material] ?? 0) - repaired * config.repairMaterialPerPoint },
      buildings: holding.buildings.map((row) =>
        row.id === buildingEntityId ? { ...row, integrity: Math.min(100, row.integrity + repaired) } : row,
      ),
    },
  };
}
