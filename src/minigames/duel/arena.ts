/**
 * LƯỚI, HƯỚNG MẶT, TẦM VỚI (Phần 9 mục 2).
 *
 * Mọi hàm ở đây THUẦN theo nghĩa của Phần 0 mục 7: nhận lưới và toạ độ, trả về
 * giá trị mới. Sinh địa hình là hàm duy nhất cần `Rng`, và nó nhận `Rng` vào
 * chứ không tự mở dòng — cùng một seed và cùng một mẫu đấu trường thì hai lần
 * chạy phải ra đúng một cái sân (R3).
 *
 * TÁM HƯỚNG đánh số theo chiều kim đồng hồ từ hướng bắc. Chênh lệch hướng tính
 * bằng SỐ BẬC 45°, và đó là thứ quyết định đòn vào chính diện, vào sườn hay vào
 * sau lưng — mục 2 nói thẳng "hướng mặt rất quan trọng".
 *
 * KHOẢNG CÁCH DÙNG CHEBYSHEV, không dùng Euclid: một ô chéo cũng là một bước, vì
 * mỗi ô ~1m và một người bước chéo một mét không tốn nhiều hơn bước thẳng một
 * mét. Euclid sẽ làm cây thương dài với tới xa hơn theo đường chéo, và người
 * chơi sẽ học được một mẹo hình học thay vì học cách giành cự ly.
 */

import type { Rng } from '@/core/rng';
import { DuelDataError, terrainOf, type ArenaTemplate, type Terrain } from './data';

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

export interface ArenaState {
  id: string;
  name: string;
  width: number;
  height: number;
  /** Id địa hình từng ô, xếp theo `y * width + x`. */
  cells: string[];
}

export function dirName(dir: Dir8): string {
  return DIR_NAMES[dir] ?? String(dir);
}

export function sameCell(left: Cell, right: Cell): boolean {
  return left.x === right.x && left.y === right.y;
}

/** Khoảng cách Chebyshev — số bước ngắn nhất trên lưới tám hướng. */
export function distance(from: Cell, to: Cell): number {
  return Math.max(Math.abs(from.x - to.x), Math.abs(from.y - to.y));
}

function vectorOf(dir: Dir8): { dx: number; dy: number } {
  const vector = DIR_VECTORS[dir];
  if (vector === undefined) throw new DuelDataError(`hướng không hợp lệ: ${String(dir)}`);
  return vector;
}

/** Hướng gần nhất trong tám hướng, từ ô này nhìn sang ô kia. */
export function directionTo(from: Cell, to: Cell): Dir8 {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 0 && dy === 0) return 0;

  // Góc tính theo trục màn hình rồi quy về bậc 45°. `atan2(dx, -dy)` cho 0 ở
  // hướng bắc và tăng theo chiều kim đồng hồ, đúng thứ tự của `DIR_VECTORS`.
  const angle = Math.atan2(dx, -dy);
  const steps = Math.round((angle / (Math.PI / 4)) + 8) % 8;
  return steps as Dir8;
}

export function turn(dir: Dir8, steps: number): Dir8 {
  return (((dir + steps) % 8) + 8) % 8 as Dir8;
}

/** Chênh lệch hai hướng, tính bằng số bậc 45°, luôn trong 0..4. */
export function dirGap(left: Dir8, right: Dir8): number {
  const raw = Math.abs(left - right) % 8;
  return raw > 4 ? 8 - raw : raw;
}

export type Arc = 'front' | 'flank' | 'back';

/**
 * Đòn từ `attacker` tới `defender` rơi vào cung nào của người phòng thủ.
 *
 * Chính diện là ba hướng quanh mũi mặt (0 và ±1 bậc), sườn là hai bậc kế, sau
 * lưng là đúng hướng ngược lại. Chia như thế thì "vòng ra sau lưng" là một việc
 * phải làm được chứ không phải một việc gần như không bao giờ xảy ra.
 */
export function arcOf(defender: Cell, defenderFacing: Dir8, attacker: Cell): Arc {
  if (sameCell(defender, attacker)) return 'front';
  const incoming = directionTo(defender, attacker);
  const gap = dirGap(defenderFacing, incoming);
  if (gap <= 1) return 'front';
  if (gap <= 3) return 'flank';
  return 'back';
}

// ---------------------------------------------------------------------------
// Lưới
// ---------------------------------------------------------------------------

export function inBounds(arena: ArenaState, cell: Cell): boolean {
  return cell.x >= 0 && cell.y >= 0 && cell.x < arena.width && cell.y < arena.height;
}

export function terrainAt(arena: ArenaState, cell: Cell): Terrain {
  if (!inBounds(arena, cell)) {
    const fallback = terrainOf('bang-phang');
    if (fallback === null) throw new DuelDataError('data/arenas.json thiếu địa hình "bang-phang"');
    return fallback;
  }
  const id = arena.cells[cell.y * arena.width + cell.x] ?? 'bang-phang';
  const row = terrainOf(id);
  if (row === null) throw new DuelDataError(`ô lưới mang địa hình "${id}" không có trong bảng`);
  return row;
}

export function passable(arena: ArenaState, cell: Cell): boolean {
  return inBounds(arena, cell) && terrainAt(arena, cell).passable;
}

/** Bước vào ô này là ra khỏi vòng đấu — một cửa kết thúc của mục 9. */
export function outOfBounds(arena: ArenaState, cell: Cell): boolean {
  return !inBounds(arena, cell) || terrainAt(arena, cell).outOfBounds;
}

/**
 * Đường đòn có bị chắn không.
 *
 * Đi từng bước Chebyshev, bỏ hai đầu. Một cái bàn dài giữa hai người là một cái
 * bàn dài giữa hai người — mục 2 khai `ban-ghe` là địa hình chính vì thế, và
 * nếu đòn vẫn xuyên qua thì cả đại sảnh 7×7 chỉ là một cái sân trống có vẽ hoa.
 */
export function lineBlocked(arena: ArenaState, from: Cell, to: Cell): boolean {
  const steps = distance(from, to);
  if (steps <= 1) return false;
  for (let step = 1; step < steps; step++) {
    const cell = {
      x: from.x + Math.round(((to.x - from.x) * step) / steps),
      y: from.y + Math.round(((to.y - from.y) * step) / steps),
    };
    if (!passable(arena, cell)) return true;
  }
  return false;
}

/**
 * Ô bị vũ khí đe dọa — thứ UI tô màu ở mục 11.
 *
 * Chỉ tính theo TẦM, không tính theo hướng mặt: một người xoay lưng vẫn có thể
 * quay lại kịp trong cùng một hiệp. Hướng mặt quyết định đòn NẶNG BAO NHIÊU
 * (`arcOf`), không quyết định đòn có tới được hay không.
 */
export function threatenedCells(
  arena: ArenaState,
  from: Cell,
  reach: { min: number; max: number },
): Cell[] {
  const cells: Cell[] = [];
  for (let y = 0; y < arena.height; y++) {
    for (let x = 0; x < arena.width; x++) {
      const cell = { x, y };
      const gap = distance(from, cell);
      if (gap < Math.max(1, reach.min) || gap > reach.max) continue;
      if (!passable(arena, cell)) continue;
      if (lineBlocked(arena, from, cell)) continue;
      cells.push(cell);
    }
  }
  return cells;
}

// ---------------------------------------------------------------------------
// Sinh đấu trường
// ---------------------------------------------------------------------------

function pickWeighted(rng: Rng, weights: Readonly<Record<string, number>>): string {
  const entries = Object.entries(weights).filter(([, weight]) => weight > 0);
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  if (entries.length === 0 || total <= 0) return 'bang-phang';

  let cursor = rng.next() * total;
  for (const [id, weight] of entries) {
    cursor -= weight;
    if (cursor < 0) return id;
  }
  return entries[0]?.[0] ?? 'bang-phang';
}

/**
 * Rắc địa hình lên một mẫu đấu trường.
 *
 * Thứ tự rút xúc sắc là hàng-rồi-cột, cố định. Đổi thứ tự ấy là đổi mọi sân đấu
 * của mọi ván chơi đã lưu, mà không có gì trên màn hình nói ra điều đó (R3).
 */
export function generateArena(rng: Rng, template: ArenaTemplate): ArenaState {
  const cells: string[] = [];
  for (let y = 0; y < template.height; y++) {
    for (let x = 0; x < template.width; x++) {
      cells.push(pickWeighted(rng, template.weights));
    }
  }

  const edge = template.edgeTerrain;
  if (edge !== undefined) {
    for (let y = 0; y < template.height; y++) {
      for (let x = 0; x < template.width; x++) {
        if (x !== 0 && y !== 0 && x !== template.width - 1 && y !== template.height - 1) continue;
        cells[y * template.width + x] = edge;
      }
    }
  }
  for (const fixed of template.fixed) {
    cells[fixed.y * template.width + fixed.x] = fixed.terrain;
  }

  const arena: ArenaState = {
    id: template.id,
    name: template.name,
    width: template.width,
    height: template.height,
    cells,
  };

  // Hai chỗ đứng đầu trận phải đi được. Một mẫu đấu trường rắc bàn ghế trúng
  // ngay chỗ hai người bước vào là một trận đấu không bắt đầu được.
  for (const cell of startingPositions(arena)) {
    if (!passable(arena, cell)) arena.cells[cell.y * arena.width + cell.x] = 'bang-phang';
  }
  return arena;
}

/**
 * Hai chỗ đứng mở màn: giữa hai cạnh dài, cách nhau hết chiều dài lưới.
 *
 * Mở màn ở cự ly xa nhất là cố ý — hiệp đầu tiên của một trận đấu thật là hiệp
 * hai người đo nhau, và nếu engine đặt họ sát mặt nhau thì cả mục 2 về tầm với
 * biến mất ngay từ đầu.
 */
export function startingPositions(arena: ArenaState): [Cell, Cell] {
  if (arena.height >= arena.width) {
    const x = Math.floor(arena.width / 2);
    return [
      { x, y: 0 },
      { x, y: arena.height - 1 },
    ];
  }
  const y = Math.floor(arena.height / 2);
  return [
    { x: 0, y },
    { x: arena.width - 1, y },
  ];
}

/**
 * Bước một hành động di chuyển.
 *
 * `forward` đi theo hướng mặt, `strafe` đi ngang sang phải. Ô đích không đi được
 * thì đứng nguyên — engine đọc `blocked` để ghi vào nhật ký hiệp, vì "ngài bước
 * vào một cái bàn" là một dòng người chơi cần thấy chứ không phải một hành động
 * lặng lẽ không xảy ra.
 */
export interface MoveOutcome {
  cell: Cell;
  blocked: boolean;
  /** Đã bước ra khỏi vòng đấu. */
  left: boolean;
  /** Địa hình chậm chân, một hiệp không đủ để qua. */
  slowed: boolean;
}

export function stepFrom(
  arena: ArenaState,
  from: Cell,
  facing: Dir8,
  move: { forward?: number; strafe?: number },
): MoveOutcome {
  const forward = vectorOf(facing);
  const side = vectorOf(turn(facing, 2));
  const steps = Math.max(Math.abs(move.forward ?? 0), Math.abs(move.strafe ?? 0));

  let cell = from;
  for (let step = 0; step < steps; step++) {
    const target = {
      x: cell.x + forward.dx * Math.sign(move.forward ?? 0) + side.dx * Math.sign(move.strafe ?? 0),
      y: cell.y + forward.dy * Math.sign(move.forward ?? 0) + side.dy * Math.sign(move.strafe ?? 0),
    };
    if (!inBounds(arena, target)) return { cell, blocked: true, left: false, slowed: false };
    if (!terrainAt(arena, target).passable) return { cell, blocked: true, left: false, slowed: false };
    if (terrainAt(arena, target).outOfBounds) return { cell: target, blocked: false, left: true, slowed: false };
    // Bùn lầy và nước nông tốn hai điểm; một hiệp chỉ có một điểm, nên bước vào
    // chúng thì đi được một ô rồi dừng lại ở đó.
    if (terrainAt(arena, target).moveCost > 1 && step + 1 < steps) {
      return { cell: target, blocked: false, left: false, slowed: true };
    }
    cell = target;
  }
  return { cell, blocked: false, left: false, slowed: false };
}
