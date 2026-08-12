/**
 * LƯỚI CO GIÃN (Phần 10 mục 2) — và mọi phép quy đổi MÉT → Ô.
 *
 * Bảng bốn dòng của mục 2 là một CÔNG THỨC, không phải bốn bậc. Ba hàm liên tục
 * dưới đây (`gridSideFor`, `cellMetersFor`, `piecesPerSide`) tái tạo đúng bảng ấy
 * ở cả bốn mốc, và trả lời trơn tru cho mọi con số ở giữa. Hằng số của chúng nằm
 * ở `data/terrain.json → grid`, vì đó đúng là thứ người cân bằng phải sửa.
 *
 * BẤT BIẾN CỨNG: số quân cờ mỗi bên nằm trong 8–30. Số quân trên một đơn vị là
 * HỆ QUẢ của bất biến đó, không phải một đầu vào — mục 2 viết nguyên tắc trước
 * rồi mới in bảng, và khi hai thứ đá nhau ở đầu thang (năm mươi người thì không
 * chia nổi tám đơn vị hai mươi quân) thì nguyên tắc thắng.
 *
 * HỆ QUẢ CỦA MỘT LƯỚI CO GIÃN, và đây là chỗ dễ hỏng nhất của cả mục 2: cỡ ô đổi
 * thì tầm bắn, tốc độ và tầm nhìn ĐỀU phải quy đổi theo mét thật rồi mới chuyển
 * sang ô. Không có hàm nào ở Phần 10 được nhận vào một con số ô khai sẵn —
 * `cellsFor` là cửa duy nhất, và nó cần `cellMeters` của chính trận đang đánh.
 *
 * KHOẢNG CÁCH DÙNG CHEBYSHEV, cùng lý do với `duel/arena.ts`: một ô chéo cũng là
 * một bước. Euclid sẽ làm cung thủ bắn xa hơn theo đường chéo, và người chơi học
 * một mẹo hình học thay vì học cách giành cự ly.
 */

import type { Rng } from '@/core/rng';
import {
  BattleDataError,
  battleTerrainOf,
  gridConfig,
  type BattlefieldTemplate,
  type BattleTerrain,
} from './data';

export type Dir8 = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export const DIR_NAMES: readonly string[] = [
  'bắc',
  'đông bắc',
  'đông',
  'đông nam',
  'nam',
  'tây nam',
  'tây',
  'tây bắc',
];

/** Vector đơn vị của tám hướng. Trục y đi XUỐNG, đúng như lưới vẽ trên màn hình. */
export const DIR_VECTORS: readonly { dx: number; dy: number }[] = [
  { dx: 0, dy: -1 },
  { dx: 1, dy: -1 },
  { dx: 1, dy: 0 },
  { dx: 1, dy: 1 },
  { dx: 0, dy: 1 },
  { dx: -1, dy: 1 },
  { dx: -1, dy: 0 },
  { dx: -1, dy: -1 },
];

export interface Cell {
  x: number;
  y: number;
}

export interface BattleGrid {
  fieldId: string;
  name: string;
  width: number;
  height: number;
  /** Bao nhiêu MÉT một ô. Mọi phép quy đổi đi qua con số này. */
  cellMeters: number;
  /** Id địa hình từng ô, xếp theo `y * width + x`. */
  cells: string[];
}

// ---------------------------------------------------------------------------
// Ba hàm co giãn của mục 2
// ---------------------------------------------------------------------------

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

/** Cạnh lưới từ TỔNG quân số hai bên. 15×15 ở trận nhỏ, 50×50 ở trận vạn người. */
export function gridSideFor(totalTroops: number): number {
  const config = gridConfig();
  const troops = Math.max(1, totalTroops);
  const side = config.sideBase * (troops / config.sideRefTroops) ** config.sideExponent;
  return clampInt(side, config.sideMin, config.sideMax);
}

/**
 * Bao nhiêu mét một ô, suy từ CẠNH LƯỚI chứ không từ quân số.
 *
 * Suy từ cạnh lưới là cố ý: lưới đã kẹp ở 50, nên nếu cỡ ô cũng đọc thẳng quân
 * số thì hai đạo quân mười vạn sẽ đánh nhau trên một chiến trường rộng bằng một
 * tỉnh. Buộc nó bám vào cạnh lưới thì trần của cạnh cũng là trần của chiến trường.
 */
export function cellMetersFor(side: number): number {
  const config = gridConfig();
  const meters = config.cellBaseMeters * (side / config.sideBase) ** config.cellExponent;
  return clampInt(meters, config.cellMinMeters, config.cellMaxMeters);
}

/** Số quân cờ của MỘT bên. Bất biến cứng của mục 2: luôn trong 8–30. */
export function piecesPerSide(sideTroops: number): number {
  const config = gridConfig();
  const troops = Math.max(1, sideTroops);
  const pieces = config.piecesBase * (troops / config.piecesRefTroops) ** config.piecesExponent;
  return clampInt(pieces, config.piecesMin, config.piecesMax);
}

/** Bao nhiêu quân trên một quân cờ. Hệ quả của `piecesPerSide`, không phải đầu vào. */
export function menPerPiece(sideTroops: number): number {
  return Math.max(1, Math.round(Math.max(1, sideTroops) / piecesPerSide(sideTroops)));
}

export interface GridPlan {
  side: number;
  cellMeters: number;
  /** Quân cờ của từng bên, theo thứ tự `[a, b]`. */
  pieces: [number, number];
  menPerPiece: [number, number];
}

/** Cả bàn cờ suy ra từ hai con số quân, một lần, lúc dựng trận. */
export function planGrid(troopsA: number, troopsB: number): GridPlan {
  const side = gridSideFor(troopsA + troopsB);
  return {
    side,
    cellMeters: cellMetersFor(side),
    pieces: [piecesPerSide(troopsA), piecesPerSide(troopsB)],
    menPerPiece: [menPerPiece(troopsA), menPerPiece(troopsB)],
  };
}

// ---------------------------------------------------------------------------
// Quy đổi mét ↔ ô
// ---------------------------------------------------------------------------

/**
 * MÉT → Ô. Cửa DUY NHẤT.
 *
 * `atLeastOne` cho những thứ phải luôn làm được ít nhất một ô — di chuyển chẳng
 * hạn: ở trận vạn người một ô rộng hơn trăm mét, và một khối bộ binh đi sáu mươi
 * mét mỗi vòng sẽ đứng yên vĩnh viễn nếu làm tròn xuống. Tầm bắn thì KHÔNG bật
 * cờ này: một khẩu súng tay tám mươi mét đúng là không với tới ô bên cạnh khi ô
 * ấy rộng một trăm hai mươi mét, và đó là sự thật chứ không phải lỗi làm tròn.
 */
export function cellsFor(meters: number, cellMeters: number, atLeastOne = false): number {
  if (cellMeters <= 0) return 0;
  const raw = Math.round(meters / cellMeters);
  return atLeastOne ? Math.max(1, raw) : Math.max(0, raw);
}

/** Ô → MÉT, cho những dòng chữ người chơi đọc. */
export function metersFor(cells: number, cellMeters: number): number {
  return Math.round(cells * cellMeters);
}

// ---------------------------------------------------------------------------
// Hình học
// ---------------------------------------------------------------------------

export function sameCell(left: Cell, right: Cell): boolean {
  return left.x === right.x && left.y === right.y;
}

export function distance(from: Cell, to: Cell): number {
  return Math.max(Math.abs(from.x - to.x), Math.abs(from.y - to.y));
}

export function dirName(dir: Dir8): string {
  return DIR_NAMES[dir] ?? String(dir);
}

function vectorOf(dir: Dir8): { dx: number; dy: number } {
  const vector = DIR_VECTORS[dir];
  if (vector === undefined) throw new BattleDataError(`hướng không hợp lệ: ${String(dir)}`);
  return vector;
}

export function directionTo(from: Cell, to: Cell): Dir8 {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 0 && dy === 0) return 0;
  const angle = Math.atan2(dx, -dy);
  return (Math.round(angle / (Math.PI / 4) + 8) % 8) as Dir8;
}

export function turnBy(dir: Dir8, steps: number): Dir8 {
  return ((((dir + steps) % 8) + 8) % 8) as Dir8;
}

export function dirGap(left: Dir8, right: Dir8): number {
  const raw = Math.abs(left - right) % 8;
  return raw > 4 ? 8 - raw : raw;
}

export type Arc = 'front' | 'flank' | 'back';

/**
 * Đòn từ `attacker` rơi vào cung nào của `defender`.
 *
 * Ở cấp chiến trận cung này quan trọng hơn hẳn ở đấu tay đôi: mục 8 xếp "bị đánh
 * sườn" và "bị đánh sau lưng" vào hai nguồn giảm sĩ khí RIÊNG, và một khối bộ
 * binh bị đánh sau lưng thì vỡ chứ không phải chịu thêm sát thương.
 */
export function arcOf(defender: Cell, defenderFacing: Dir8, attacker: Cell): Arc {
  if (sameCell(defender, attacker)) return 'front';
  const gap = dirGap(defenderFacing, directionTo(defender, attacker));
  if (gap <= 1) return 'front';
  if (gap <= 3) return 'flank';
  return 'back';
}

export const ARC_LABELS: Readonly<Record<Arc, string>> = {
  front: 'chính diện',
  flank: 'vào sườn',
  back: 'vào sau lưng',
};

// ---------------------------------------------------------------------------
// Đọc lưới
// ---------------------------------------------------------------------------

export function inBounds(grid: BattleGrid, cell: Cell): boolean {
  return cell.x >= 0 && cell.y >= 0 && cell.x < grid.width && cell.y < grid.height;
}

export function terrainAt(grid: BattleGrid, cell: Cell): BattleTerrain {
  const fallback = (): BattleTerrain => {
    const plain = battleTerrainOf('dong-bang');
    if (plain === null) throw new BattleDataError('data/terrain.json thiếu địa hình "dong-bang"');
    return plain;
  };
  if (!inBounds(grid, cell)) return fallback();
  const id = grid.cells[cell.y * grid.width + cell.x];
  if (id === undefined) return fallback();
  const row = battleTerrainOf(id);
  if (row === null) throw new BattleDataError(`ô lưới mang địa hình "${id}" không có trong bảng`);
  return row;
}

export function passable(grid: BattleGrid, cell: Cell): boolean {
  return inBounds(grid, cell) && terrainAt(grid, cell).passable;
}

/** Ô thắt cổ chai: chỉ ngần này đơn vị đánh qua được cùng lúc. 0 = không hạn chế. */
export function frontageAt(grid: BattleGrid, cell: Cell): number {
  return terrainAt(grid, cell).frontage;
}

/**
 * Đường ngắm có bị che không, và che bao nhiêu phần trăm.
 *
 * Trả về TỔNG che khuất trên đường đi chứ không trả về `true/false`: ở cấp chiến
 * trận một dải cây thưa không chặn hẳn tầm nhìn, nó chỉ làm cung thủ bắn tồi đi.
 */
export function concealmentBetween(grid: BattleGrid, from: Cell, to: Cell): number {
  const steps = distance(from, to);
  if (steps <= 1) return 0;
  let total = 0;
  for (let step = 1; step < steps; step++) {
    const cell = {
      x: from.x + Math.round(((to.x - from.x) * step) / steps),
      y: from.y + Math.round(((to.y - from.y) * step) / steps),
    };
    total += terrainAt(grid, cell).concealment;
  }
  return Math.min(100, total);
}

export function elevationAt(grid: BattleGrid, cell: Cell): number {
  return terrainAt(grid, cell).elevation;
}

// ---------------------------------------------------------------------------
// Sinh chiến trường
// ---------------------------------------------------------------------------

function pickWeighted(rng: Rng, weights: Readonly<Record<string, number>>): string {
  const entries = Object.entries(weights).filter(([, weight]) => weight > 0);
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  if (entries.length === 0 || total <= 0) return 'dong-bang';

  let cursor = rng.next() * total;
  for (const [id, weight] of entries) {
    cursor -= weight;
    if (cursor < 0) return id;
  }
  return entries[0]?.[0] ?? 'dong-bang';
}

/**
 * Rắc địa hình lên một mẫu chiến trường, rồi đắp các đặc trưng lên trên.
 *
 * THỨ TỰ RÚT XÚC SẮC LÀ HỢP ĐỒNG: nền trước (hàng rồi cột), rồi tới đặc trưng
 * theo đúng thứ tự khai trong data. Đổi thứ tự ấy là đổi mọi chiến trường của mọi
 * ván đã lưu mà không có gì trên màn hình nói ra (R3).
 */
export function generateField(rng: Rng, template: BattlefieldTemplate, side: number): BattleGrid {
  const cells: string[] = [];
  for (let y = 0; y < side; y++) {
    for (let x = 0; x < side; x++) cells.push(pickWeighted(rng, template.weights));
  }

  const put = (x: number, y: number, terrain: string): void => {
    if (x < 0 || y < 0 || x >= side || y >= side) return;
    cells[y * side + x] = terrain;
  };

  for (const feature of template.features) {
    switch (feature.kind) {
      case 'band': {
        const depth = Math.max(1, Math.round(feature.depth * side));
        for (let step = 0; step < depth; step++) {
          for (let along = 0; along < side; along++) {
            if (feature.edge === 'bac') put(along, step, feature.terrain);
            else if (feature.edge === 'nam') put(along, side - 1 - step, feature.terrain);
            else if (feature.edge === 'tay') put(step, along, feature.terrain);
            else put(side - 1 - step, along, feature.terrain);
          }
        }
        break;
      }
      case 'river': {
        // Sông chảy NGANG, cắt đôi chiến trường giữa hai bên. Chảy dọc thì nó
        // nằm cùng phía với cả hai đạo quân và không thắt cổ chai được gì.
        const row = Math.floor(side / 2);
        for (let x = 0; x < side; x++) put(x, row, feature.terrain);
        const gaps = Math.max(1, feature.crossings);
        for (let index = 0; index < gaps; index++) {
          const at = Math.floor(((index + 1) * side) / (gaps + 1));
          put(at, row, feature.crossingTerrain);
        }
        break;
      }
      case 'patch': {
        const radius = Math.max(1, Math.round(feature.radius * side));
        for (let index = 0; index < feature.count; index++) {
          const cx = rng.int(radius, Math.max(radius, side - 1 - radius));
          const cy = rng.int(radius, Math.max(radius, side - 1 - radius));
          for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
              if (Math.abs(dx) + Math.abs(dy) > radius) continue;
              put(cx + dx, cy + dy, feature.terrain);
            }
          }
        }
        break;
      }
    }
  }

  const grid: BattleGrid = {
    fieldId: template.id,
    name: template.name,
    width: side,
    height: side,
    cellMeters: cellMetersFor(side),
    cells,
  };

  // Hai mép triển khai phải đi được. Một con sông vắt ngang đúng hàng đầu tiên là
  // một trận đánh không bắt đầu được.
  for (const y of [0, side - 1]) {
    for (let x = 0; x < side; x++) {
      if (!passable(grid, { x, y })) grid.cells[y * side + x] = 'dong-bang';
    }
  }
  return grid;
}

/**
 * Bước một đơn vị đi tối đa `budget` ô về phía `target`.
 *
 * Trả về chỗ dừng THẬT: địa hình nặng ăn nhiều điểm hơn (`moveCost`), ô không đi
 * được thì vòng qua một bước, và ô đã có người thì dừng lại cạnh nó — hai đơn vị
 * đứng chồng lên nhau là thứ làm cả bàn cờ mất nghĩa.
 */
export interface StepOutcome {
  cell: Cell;
  /** Đã tiêu bao nhiêu điểm di chuyển. */
  spent: number;
  blocked: boolean;
}

export function stepToward(
  grid: BattleGrid,
  from: Cell,
  target: Cell,
  budget: number,
  occupied: (cell: Cell) => boolean,
): StepOutcome {
  let cell = from;
  let spent = 0;
  let blocked = false;

  for (let guard = 0; guard < 64; guard++) {
    if (spent >= budget || sameCell(cell, target)) break;

    const dir = directionTo(cell, target);
    const candidates: Dir8[] = [dir, turnBy(dir, 1), turnBy(dir, -1), turnBy(dir, 2), turnBy(dir, -2)];
    let moved = false;

    for (const candidate of candidates) {
      const vector = vectorOf(candidate);
      const next = { x: cell.x + vector.dx, y: cell.y + vector.dy };
      if (!passable(grid, next)) continue;
      if (occupied(next) && !sameCell(next, target)) continue;
      if (occupied(next) && sameCell(next, target)) {
        // Tới sát mục tiêu là đủ: đánh nhau ở ô kề, không giẫm lên nhau.
        return { cell, spent, blocked: false };
      }
      const cost = terrainAt(grid, next).moveCost;
      if (spent + cost > budget && spent > 0) return { cell, spent, blocked: false };
      cell = next;
      spent += cost;
      moved = true;
      break;
    }

    if (!moved) {
      blocked = true;
      break;
    }
  }

  return { cell, spent, blocked };
}

/** Chạy THẲNG ra mép gần nhất — đường của đơn vị đã vỡ trận (mục 8). */
export function fleeTarget(grid: BattleGrid, from: Cell, homeEdge: 'bac' | 'nam'): Cell {
  return { x: from.x, y: homeEdge === 'bac' ? 0 : grid.height - 1 };
}
