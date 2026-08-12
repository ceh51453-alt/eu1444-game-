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

import { adjacencyConfig, adjacencyRules, buildingOf, terrainMatches, type AdjacencyRule, type AdjacencySelector, type Building } from './data';
import { cellsOf, chebyshev, hasWall, isBorderCell, tileAt } from './grid';
import type { Cell, Holding, PlacedBuilding } from './types';

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

/**
 * Ô mà chủ thể "đứng trên".
 *
 * Công trình VÀNH ĐAI không chiếm ô nào, nhưng nó vẫn có mặt ở một chỗ vật lý:
 * cả vòng mép thành. Nếu trả về mảng rỗng thì mọi luật có chủ thể là tường hay
 * hào sẽ im lặng không chạy — và luật "hào kề nước thì ngập được" là một trong
 * bảy luật của mục 4, không được phép biến mất.
 */
function subjectCells(holding: Holding, building: Building, at: Cell): Cell[] {
  if (!building.perimeter) return cellsOf(building, at);
  const ring: Cell[] = [];
  const size = holding.gridSize;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (isBorderCell({ x, y }, size)) ring.push({ x, y });
    }
  }
  return ring;
}

/**
 * Ô trong tầm `radius` của chủ thể. `radius === 0` là chính ô mình đứng.
 *
 * Quét theo HỘP BAO của chủ thể, không quét cả lưới. Cách quét cả lưới đọc dễ
 * hơn nhưng nó là O(cạnh²) cho mỗi luật của mỗi công trình của mỗi tuần, và ở
 * một đại thành 16×16 với trăm công trình thì một lượt mô phỏng biến thành hàng
 * trăm nghìn phép so sánh — bài test nuôi thành của mục 12.11 phải chạy hàng
 * chục nghìn tuần, nên chỗ này là chỗ duy nhất trong Phần 12 mà tốc độ đáng để
 * đánh đổi lấy vài dòng số học.
 */
function neighbourCells(holding: Holding, own: readonly Cell[], radius: number): Cell[] {
  if (radius === 0) return [...own];
  if (own.length === 0) return [];

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  const ownKeys = new Set<string>();
  for (const cell of own) {
    ownKeys.add(`${String(cell.x)},${String(cell.y)}`);
    if (cell.x < minX) minX = cell.x;
    if (cell.y < minY) minY = cell.y;
    if (cell.x > maxX) maxX = cell.x;
    if (cell.y > maxY) maxY = cell.y;
  }

  const size = holding.gridSize;
  const fromX = Math.max(0, minX - radius);
  const toX = Math.min(size - 1, maxX + radius);
  const fromY = Math.max(0, minY - radius);
  const toY = Math.min(size - 1, maxY + radius);

  const cells: Cell[] = [];
  for (let y = fromY; y <= toY; y++) {
    for (let x = fromX; x <= toX; x++) {
      if (ownKeys.has(`${String(x)},${String(y)}`)) continue;
      if (!own.some((cell) => chebyshev(cell, { x, y }) <= radius)) continue;
      cells.push({ x, y });
    }
  }
  return cells;
}

/**
 * Đếm số lần một luật bắt được.
 *
 * Công trình láng giềng đếm theo THỰC THỂ chứ không theo ô: một dãy nhà 2×2 nằm
 * cạnh xưởng thuộc da là MỘT dãy nhà bị hôi, không phải bốn.
 */
function countMatches(holding: Holding, rule: AdjacencyRule, own: readonly Cell[]): number {
  if (rule.neighbor.kind === 'wall') {
    if (!hasWall(holding)) return 0;
    return own.some((cell) => isBorderCell(cell, holding.gridSize)) ? 1 : 0;
  }

  const cells = neighbourCells(holding, own, rule.radius);

  if (rule.neighbor.kind === 'terrain' || rule.neighbor.kind === 'terrainTag') {
    let count = 0;
    for (const cell of cells) {
      const tile = tileAt(holding, cell);
      if (tile === null) continue;
      if (rule.neighbor.ids.some((name) => terrainMatches(tile.terrain, name))) count++;
    }
    return count;
  }

  const entities = new Set<string>();
  for (const cell of cells) {
    const tile = tileAt(holding, cell);
    if (tile === null || tile.occupiedBy === '') continue;
    const placed = holding.buildings.find((row) => row.id === tile.occupiedBy);
    if (placed === undefined) continue;
    const building = buildingOf(placed.buildingId);
    if (building === null) continue;
    const hit =
      rule.neighbor.kind === 'building'
        ? rule.neighbor.ids.includes(building.id)
        : rule.neighbor.ids.includes(building.group);
    if (hit) entities.add(placed.id);
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

  const own = subjectCells(holding, building, at);
  const config = adjacencyConfig();

  for (const rule of adjacencyRules()) {
    if (!subjectMatches(rule.subject, building)) continue;
    if (rule.when === 'besieged' && !context.besieged) continue;

    const matches = Math.min(rule.stacks, countMatches(holding, rule, own));
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

  const building = buildingOf(buildingId);
  const ghostId = '__xem-truoc__';
  const ghost: PlacedBuilding = {
    id: ghostId,
    buildingId,
    at,
    integrity: 100,
    quality: 1,
    decayMultiplier: 1,
    customName: '',
    builtOnTurn: 0,
    maintained: true,
  };

  const cells = building === null ? [] : cellsOf(building, at);
  const tiles = holding.tiles.map((tile) =>
    cells.some((cell) => cell.x === tile.x && cell.y === tile.y) ? { ...tile, occupiedBy: ghostId } : tile,
  );
  const withGhost: Holding = { ...holding, tiles, buildings: [...holding.buildings, ghost] };
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
