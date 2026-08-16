/**
 * HIỆU ỨNG KỀ NHAU (Phần 12 mục 4) — "KỀ NHAU CÓ Ý NGHĨA".
 *
 * Đây là chỗ quy hoạch trở thành một trò chơi thật: cùng một danh sách công
 * trình, xếp khác chỗ thì ra một thành trì khác hẳn. Nếu bỏ mục này thì việc đặt
 * công trình chỉ còn là tìm ô trống, và cả lưới ô của mục 4 thành trang trí.
 *
 * BA QUYẾT ĐỊNH ĐÁNG GIẢI THÍCH:
 *
 *  1. **Có TRẦN cộng dồn (`stacks`).** Cối xay có bốn mặt sông vẫn chỉ là một cối
 *     xay. Không có trần thì lối chơi tối ưu là nhồi cùng một cặp công trình vào
 *     một góc, và bản đồ mất hết chiều rộng.
 *  2. **Chia hai loại phép: `factor` và `flat`.** Sản lượng NHÂN, hạnh phúc CỘNG.
 *     Trộn hai loại lại thì một công trình xấu tính đặt cạnh một công trình sản
 *     lượng cao sẽ phạt gấp bội mà không ai cố ý thiết kế thế.
 *  3. **`explain()` trả về từng dòng có tên luật.** Game này không có reroll, nên
 *     minh bạch là bắt buộc — cùng lý do README mục 8.4 nêu cho registry modifier.
 *     Người chơi phải xem trước được hiệu ứng TRƯỚC KHI đặt (mục 11).
 */

import { adjacencyConfig, adjacencyRules, buildingOf, footprintOf, terrainMatches, type AdjacencyRule, type AdjacencySelector, type Building } from './data';
import { terrainAt } from './field';
import { centreOf, fieldOf, hasWall, WALL_BOUND_CELLS } from './place';
import { distanceToWall, standingWalls } from './walls';
import type { Cell, Holding, PlacedBuilding } from './types';

/**
 * MỘT BẬC `radius` TRONG `data/adjacency.json` BẰNG BAO NHIÊU Ô 5 M.
 *
 * Bảng luật khai `radius` từ 0 tới 4 — con số ấy có từ thời một "ô" là một chỗ
 * đặt công trình. Ở hệ mới một chỗ đặt công trình là khoảng 16 ô cộng khoảng
 * thở, nên một bậc kề nhau ứng với chừng 110 m: đủ gần để ngửi thấy mùi xưởng
 * thuộc da, đủ xa để không phải là cùng một khoảnh đất.
 *
 * Quy đổi ở ĐÂY chứ không sửa 40 dòng data, vì con số trong data là một QUAN HỆ
 * ("cái này kề cái kia") chứ không phải một khoảng cách; sửa nó thành 22 là làm
 * bảng luật phụ thuộc vào tỉ lệ lưới, và lần sau đổi tỉ lệ thì phải sửa lại cả bảng.
 */
export const CELLS_PER_ADJACENCY_STEP = 22;

/** Khoá NHÂN — cộng dồn rồi áp `1 + tổng`. */
const FACTOR_KEYS = new Set(['output', 'faith', 'trade', 'upkeep', 'buildSpeed']);

export interface AdjacencyEffects {
  /** Nhân vào sản lượng và vào `farmMultiplier`. */
  output: number;
  happiness: number;
  beauty: number;
  faith: number;
  trade: number;
  /** Nhân vào chi phí duy trì. Âm là rẻ đi. */
  upkeep: number;
  hygiene: number;
  /** Cộng thẳng vào số tuần cầm cự — Phần 11 đọc lại con số này. */
  siegeWeeks: number;
  wallIntegrity: number;
  buildSpeed: number;
}

export function noEffects(): AdjacencyEffects {
  return {
    output: 1,
    happiness: 0,
    beauty: 0,
    faith: 1,
    trade: 1,
    upkeep: 1,
    hygiene: 0,
    siegeWeeks: 0,
    wallIntegrity: 0,
    buildSpeed: 1,
  };
}

export interface AdjacencyLine {
  ruleId: string;
  /** Câu người chơi đọc: "Cối xay kề nước ×2". */
  label: string;
  effect: string;
  value: number;
  mode: 'factor' | 'flat';
  stacks: number;
}

// ---------------------------------------------------------------------------
// So khớp
// ---------------------------------------------------------------------------

function subjectMatches(selector: AdjacencySelector, building: Building): boolean {
  if (selector.kind === 'building') return selector.ids.includes(building.id);
  if (selector.kind === 'group') return selector.ids.includes(building.group);
  return false;
}

/** Tầm với thật của một luật, tính bằng ô. `radius === 0` là chính khuôn viên. */
function reachOf(building: Building, radius: number): number {
  return footprintOf(building) / 2 + radius * CELLS_PER_ADJACENCY_STEP;
}

/**
 * Đếm số lần một luật bắt được.
 *
 * BA CÁCH ĐẾM KHÁC NHAU, và sự khác nhau ấy có chủ ý:
 *
 *  - **Láng giềng là CÔNG TRÌNH** thì đếm theo THỰC THỂ: một dãy nhà rộng 80 m
 *    đứng cạnh xưởng thuộc da là MỘT dãy nhà bị hôi, không phải mười sáu ô nhà.
 *    Đo từ mép khuôn viên tới mép khuôn viên, nên một công trình to không tự
 *    dưng "kề" được nhiều thứ hơn chỉ vì nó to.
 *  - **Láng giềng là ĐỊA HÌNH** thì đếm theo MẪU trên một vòng quanh khuôn viên.
 *    Một cối xay có cả khúc sông chảy dọc mặt nam ăn nhiều hơn một cối xay chỉ
 *    chạm nước ở một góc — và bây giờ điều đó đo được, vì sông là một dòng có bề
 *    rộng chứ không phải một ô đánh dấu.
 *  - **Láng giềng là TƯỜNG** thì hỏi khoảng cách tới tuyến gần nhất. Bản cũ hỏi
 *    "có đứng ở mép lưới không", mà mép lưới chưa bao giờ là chỗ tường chạy.
 */
function countMatches(holding: Holding, rule: AdjacencyRule, building: Building, at: Cell): number {
  const centre = centreOf(building, at);
  const reach = reachOf(building, rule.radius);

  if (rule.neighbor.kind === 'wall') {
    const walls = standingWalls(holding.walls);
    if (walls.length === 0 || !hasWall(holding)) return 0;
    return distanceToWall(walls, centre.x, centre.y) <= WALL_BOUND_CELLS + footprintOf(building) / 2 ? 1 : 0;
  }

  if (rule.neighbor.kind === 'terrain' || rule.neighbor.kind === 'terrainTag') {
    const field = fieldOf(holding);
    const half = footprintOf(building) / 2;

    // `radius === 0` nghĩa là ĐẤT MÌNH ĐỨNG LÊN, không phải đất quanh mình.
    // "Xây trên đá gốc" và "tháp trên đồi" là hai luật thuộc loại này, và lấy
    // mẫu ở vành ngoài sẽ trả lời sai cho cả hai: một cái tháp đứng trọn trên
    // đỉnh đồi mà bốn phía là đồng bằng sẽ được ghi là không ở trên đồi.
    if (rule.radius === 0) {
      let hits = 0;
      const probes: readonly [number, number][] = [
        [centre.x, centre.y],
        [centre.x - half * 0.5, centre.y - half * 0.5],
        [centre.x + half * 0.5, centre.y - half * 0.5],
        [centre.x - half * 0.5, centre.y + half * 0.5],
        [centre.x + half * 0.5, centre.y + half * 0.5],
      ];
      for (const [px, py] of probes) {
        const id = terrainAt(field, px, py);
        if (rule.neighbor.ids.some((name) => terrainMatches(id, name))) hits++;
      }
      // Quá nửa khuôn viên nằm trên loại đất ấy thì tính là đứng trên nó.
      return hits >= 3 ? 1 : 0;
    }

    const inner = half;
    let count = 0;
    // Lấy mẫu theo vành: 24 tia × 3 vòng là 72 phép, không phụ thuộc vào kích
    // thước công trình hay bán kính luật. Quét cả hộp bao thì một luật bán kính
    // 4 quanh một nhà thờ là hơn hai vạn phép, mỗi tuần, cho mỗi công trình —
    // và bài test nuôi thành của mục 12.11 chạy hàng nghìn tuần.
    const rings = 3;
    for (let ring = 1; ring <= rings; ring++) {
      const distance = inner + ((reach - inner) * ring) / rings;
      for (let index = 0; index < 24; index++) {
        const angle = (index / 24) * Math.PI * 2;
        const id = terrainAt(field, centre.x + Math.cos(angle) * distance, centre.y + Math.sin(angle) * distance);
        if (rule.neighbor.ids.some((name) => terrainMatches(id, name))) count++;
      }
    }
    // Quy về thang cũ: một "ô kề" ứng với chừng một phần tám vành mẫu, nên một
    // mặt sông chạy dọc cả cạnh nam đếm ra khoảng ba, đúng như bản cũ đếm ba ô.
    return Math.round(count / 8);
  }

  const entities = new Set<string>();
  for (const placed of holding.buildings) {
    if (placed.at === at) continue;
    const other = buildingOf(placed.buildingId);
    if (other === null) continue;
    const hit =
      rule.neighbor.kind === 'building'
        ? rule.neighbor.ids.includes(other.id)
        : rule.neighbor.ids.includes(other.group);
    if (!hit) continue;
    const otherCentre = centreOf(other, placed.at);
    const gap = Math.hypot(otherCentre.x - centre.x, otherCentre.y - centre.y) - footprintOf(other) / 2;
    if (gap <= reach) entities.add(placed.id);
  }
  return entities.size;
}

// ---------------------------------------------------------------------------
// Tính
// ---------------------------------------------------------------------------

export interface AdjacencyContext {
  besieged: boolean;
}

/**
 * Hiệu ứng kề nhau của MỘT công trình ở MỘT vị trí.
 *
 * Nhận `buildingId` + `at` chứ không nhận `PlacedBuilding`, để UI hỏi được
 * "nếu tôi đặt ở đây thì sao" trước khi đặt thật (mục 11).
 */
export function adjacencyFor(
  holding: Holding,
  buildingId: string,
  at: Cell,
  context: AdjacencyContext = { besieged: false },
): { effects: AdjacencyEffects; lines: AdjacencyLine[] } {
  const building = buildingOf(buildingId);
  const effects = noEffects();
  const lines: AdjacencyLine[] = [];
  if (building === null) return { effects, lines };

  const config = adjacencyConfig();

  for (const rule of adjacencyRules()) {
    if (!subjectMatches(rule.subject, building)) continue;
    if (rule.when === 'besieged' && !context.besieged) continue;

    const matches = Math.min(rule.stacks, countMatches(holding, rule, building, at));
    if (matches === 0) continue;

    const total = rule.value * matches;
    if (FACTOR_KEYS.has(rule.effect)) {
      effects[rule.effect] += total;
    } else {
      effects[rule.effect] += total;
    }
    lines.push({
      ruleId: rule.id,
      label: rule.note === '' ? rule.id : rule.note,
      effect: rule.effect,
      value: total,
      mode: rule.mode,
      stacks: matches,
    });
  }

  effects.output = Math.min(config.maxTotalOutputFactor, Math.max(config.minTotalOutputFactor, effects.output));
  effects.upkeep = Math.max(0.2, effects.upkeep);
  effects.buildSpeed = Math.max(0.2, effects.buildSpeed);
  effects.faith = Math.max(0, effects.faith);
  effects.trade = Math.max(0, effects.trade);
  return { effects, lines };
}

/** Cộng gộp hiệu ứng của mọi công trình đã dựng — cái UI hiện ở bảng tổng. */
export interface HoldingAdjacency {
  /** Theo id thực thể công trình. */
  byBuilding: Map<string, AdjacencyEffects>;
  /** Cộng dồn phần `flat` toàn thành. */
  happiness: number;
  beauty: number;
  hygiene: number;
  siegeWeeks: number;
  wallIntegrity: number;
}

export function adjacencyOf(holding: Holding, context: AdjacencyContext = { besieged: false }): HoldingAdjacency {
  const byBuilding = new Map<string, AdjacencyEffects>();
  let happiness = 0;
  let beauty = 0;
  let hygiene = 0;
  let siegeWeeks = 0;
  let wallIntegrity = 0;

  for (const placed of holding.buildings) {
    const { effects } = adjacencyFor(holding, placed.buildingId, placed.at, context);
    byBuilding.set(placed.id, effects);
    happiness += effects.happiness;
    beauty += effects.beauty;
    hygiene += effects.hygiene;
    siegeWeeks += effects.siegeWeeks;
    wallIntegrity += effects.wallIntegrity;
  }

  return { byBuilding, happiness, beauty, hygiene, siegeWeeks, wallIntegrity };
}

/**
 * XEM TRƯỚC trước khi đặt (mục 11).
 *
 * Trả về cả hiệu ứng công trình MỚI nhận được, lẫn hiệu ứng nó GÂY RA cho hàng
 * xóm — vế thứ hai mới là vế quan trọng. Xưởng thuộc da không mất gì khi đứng
 * cạnh nhà ở; nhà ở mới là bên chịu, và người chơi phải thấy điều đó trước khi
 * bấm nút chứ không phải ba tuần sau khi dân bắt đầu bỏ đi.
 */
export interface PlacementPreview {
  gains: AdjacencyLine[];
  /** Hàng xóm bị ảnh hưởng: id thực thể → những dòng đổi đi. */
  neighbours: { buildingId: string; name: string; lines: AdjacencyLine[] }[];
  happinessDelta: number;
  outputDelta: number;
}

export function previewPlacement(
  holding: Holding,
  buildingId: string,
  at: Cell,
  context: AdjacencyContext = { besieged: false },
): PlacementPreview {
  const before = adjacencyOf(holding, context);
  const { effects, lines } = adjacencyFor(holding, buildingId, at, context);

  const ghost: PlacedBuilding = {
    id: '__xem-truoc__',
    buildingId,
    at,
    integrity: 100,
    quality: 1,
    decayMultiplier: 1,
    customName: '',
    builtOnTurn: 0,
    maintained: true,
    nodeId: '',
  };

  // Không còn phải vá `tiles` để "đánh dấu ô đã chiếm": láng giềng bây giờ tìm
  // nhau bằng khoảng cách giữa hai khuôn viên, nên thêm bóng ma vào danh sách
  // công trình là đủ để mọi luật nhìn thấy nó.
  const withGhost: Holding = { ...holding, buildings: [...holding.buildings, ghost] };
  const after = adjacencyOf(withGhost, context);

  const neighbours: PlacementPreview['neighbours'] = [];
  for (const placed of holding.buildings) {
    const now = after.byBuilding.get(placed.id);
    const then = before.byBuilding.get(placed.id);
    if (now === undefined || then === undefined) continue;
    if (now.happiness === then.happiness && now.output === then.output && now.hygiene === then.hygiene) continue;
    const { lines: nowLines } = adjacencyFor(withGhost, placed.buildingId, placed.at, context);
    neighbours.push({
      buildingId: placed.buildingId,
      name: buildingOf(placed.buildingId)?.name ?? placed.buildingId,
      lines: nowLines,
    });
  }

  return {
    gains: lines,
    neighbours,
    happinessDelta: after.happiness - before.happiness,
    outputDelta: effects.output - 1,
  };
}
