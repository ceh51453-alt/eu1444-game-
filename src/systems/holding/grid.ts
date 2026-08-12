/**
 * LƯỚI Ô TỰ DO (Phần 12 mục 4).
 *
 * Ba điều làm nên chiều sâu của mục này, và cả ba đều phải đúng trong code chứ
 * không chỉ đúng trong tài liệu:
 *
 *  1. ĐỊA HÌNH SINH TỪ VỊ TRÍ THẬT. Cùng một seed và cùng một chỗ trên bản đồ thì
 *     ra đúng cùng một lưới (R3). Người chơi tải lại save không được thấy con suối
 *     dời chỗ.
 *  2. KỀ NHAU CÓ Ý NGHĨA. Việc đặt ở đâu quan trọng ngang việc đặt cái gì —
 *     `adjacency.ts` tính, còn file này chỉ giữ hình học.
 *  3. LÊN CẤP THÌ LƯỚI **MỞ RỘNG**, KHÔNG RESET. Gốc toạ độ đứng yên ở góc
 *     tây-bắc, nên mọi công trình cũ giữ nguyên `at` — không phải dời, không phải
 *     ánh xạ lại. Đó là lý do gốc nằm ở góc chứ không nằm ở tâm.
 *
 * Mọi hàm ở đây THUẦN (Phần 0 mục 7): nhận vào, trả ra cái mới, không sửa đầu vào.
 */

import type { Rng } from '@/core/rng';
import {
  allTerrain,
  buildingOf,
  hinterlandTilesFor,
  terrainMatches,
  terrainOf,
  tierOf,
  type Building,
} from './data';
import type { Cell, HinterlandTile, Holding, HoldingTile, PlacedBuilding } from './types';

export class HoldingGridError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HoldingGridError';
  }
}

// ---------------------------------------------------------------------------
// Sinh lưới
// ---------------------------------------------------------------------------

function weightedTerrain(rng: Rng): string {
  const rows = allTerrain().filter((row) => row.weight > 0);
  const total = rows.reduce((sum, row) => sum + row.weight, 0);
  let roll = rng.next() * total;
  for (const row of rows) {
    roll -= row.weight;
    if (roll <= 0) return row.id;
  }
  const last = rows.at(-1);
  if (last === undefined) throw new HoldingGridError('không có địa hình nào có trọng số');
  return last.id;
}

/**
 * Địa hình có xu hướng DÍNH CHÙM: một ô rừng thì ô bên cạnh nhiều khả năng cũng
 * là rừng. Sông rải rác từng ô riêng lẻ trông như lỗi hiển thị, và quan trọng
 * hơn, nó phá luôn ý nghĩa của "cối xay kề sông" — nếu nước ở khắp nơi thì đặt
 * đâu cũng như nhau và cả luật thứ nhất của mục 4 thành vô nghĩa.
 */
function smear(tiles: HoldingTile[], size: number, rng: Rng, stickiness: number): void {
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (x === 0 && y === 0) continue;
      if (rng.next() >= stickiness) continue;
      const neighbours: HoldingTile[] = [];
      const left = tiles[y * size + (x - 1)];
      const up = tiles[(y - 1) * size + x];
      if (x > 0 && left !== undefined) neighbours.push(left);
      if (y > 0 && up !== undefined) neighbours.push(up);
      if (neighbours.length === 0) continue;
      const source = rng.pick(neighbours);
      const target = tiles[y * size + x];
      if (target !== undefined) target.terrain = source.terrain;
    }
  }
}

export interface GridSetup {
  size: number;
  /** Ép một số ô thành địa hình cho trước — dùng khi vị trí thật trên bản đồ đã biết. */
  fixed?: { x: number; y: number; terrain: string }[];
  stickiness?: number;
}

export function generateGrid(rng: Rng, setup: GridSetup): HoldingTile[] {
  const { size } = setup;
  if (size < 2) throw new HoldingGridError(`lưới phải ít nhất 2×2, nhận ${String(size)}`);

  const tiles: HoldingTile[] = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      tiles.push({ x, y, terrain: weightedTerrain(rng), occupiedBy: '' });
    }
  }
  smear(tiles, size, rng, setup.stickiness ?? 0.45);

  for (const forced of setup.fixed ?? []) {
    if (terrainOf(forced.terrain) === null) {
      throw new HoldingGridError(`địa hình ép "${forced.terrain}" không có trong data/resources.json`);
    }
    const tile = tiles[forced.y * size + forced.x];
    if (tile !== undefined) tile.terrain = forced.terrain;
  }
  return tiles;
}

/**
 * MỞ RỘNG lưới khi lên cấp (mục 3).
 *
 * Ô cũ giữ nguyên toạ độ VÀ giữ nguyên `occupiedBy`; ô mới sinh ra ở vành ngoài.
 * Không có bước "ánh xạ lại công trình" nào cả, và đó là điểm — bước ấy tồn tại
 * là ở đâu đó sẽ có một công trình rơi mất.
 */
export function expandGrid(tiles: readonly HoldingTile[], from: number, to: number, rng: Rng): HoldingTile[] {
  if (to <= from) throw new HoldingGridError(`lưới mới (${String(to)}) phải lớn hơn lưới cũ (${String(from)})`);
  const byKey = new Map<string, HoldingTile>();
  for (const tile of tiles) byKey.set(`${String(tile.x)},${String(tile.y)}`, tile);

  const next: HoldingTile[] = [];
  for (let y = 0; y < to; y++) {
    for (let x = 0; x < to; x++) {
      const existing = byKey.get(`${String(x)},${String(y)}`);
      if (existing !== undefined) {
        next.push({ ...existing });
        continue;
      }
      next.push({ x, y, terrain: weightedTerrain(rng), occupiedBy: '' });
    }
  }
  smearNewRing(next, to, from, rng);
  return next;
}

/** Chỉ làm mượt phần MỚI — phần cũ đã có công trình đứng trên, đổi là sai. */
function smearNewRing(tiles: HoldingTile[], size: number, oldSize: number, rng: Rng): void {
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (x < oldSize && y < oldSize) continue;
      if (rng.next() >= 0.45) continue;
      const left = x > 0 ? tiles[y * size + (x - 1)] : undefined;
      const up = y > 0 ? tiles[(y - 1) * size + x] : undefined;
      const pool = [left, up].filter((tile): tile is HoldingTile => tile !== undefined);
      if (pool.length === 0) continue;
      const target = tiles[y * size + x];
      if (target !== undefined) target.terrain = rng.pick(pool).terrain;
    }
  }
}

/**
 * BA THỨ MỘT KHU ĐỊNH CƯ PHẢI VỚI TỚI ĐƯỢC: đất trồng, gỗ, đá.
 *
 * **Không ai lập làng ở chỗ không có ba thứ ấy.** Bản đồ châu Âu trông như nó
 * trông chính vì thế: người ta dựng nhà nơi có ruộng cày, có rừng lấy gỗ và có
 * chỗ lấy đá xây móng. Thả trọng số tự do thì thỉnh thoảng sẽ sinh ra một cái
 * thôn giữa bảy ô đồi trọc và một cái đầm — và cái thôn ấy không phải "khó", nó
 * BẤT KHẢ: mọi công trình đầu tiên đều cần gỗ, mọi nguồn gỗ đều là công trình
 * phải xây bằng gỗ, và cả nhánh phát triển khoá chết ở tuần thứ nhất.
 *
 * Một vòng khoá chết do trọng số không phải là một thử thách thiết kế, nó là một
 * ván chơi hỏng — nên hạn mức nằm ở đây chứ không nằm ở lời khuyên cho người chơi.
 */
const MIN_YIELD_SHARE: Readonly<Record<string, number>> = {
  'luong-thuc': 0.5,
  go: 0.15,
  da: 0.1,
  // Sắt cũng là một vòng khoá: cối xay và lò rèn — hai công trình bắt buộc để
  // lên Trấn — đều đòi sắt, mà công trình DUY NHẤT sinh ra sắt là cái mỏ, và mỏ
  // chỉ mở từ Trấn. Một ô sắt đầm lầy là đủ để vòng ấy mở ra.
  sat: 0.06,
};

function providersOf(resourceId: string): string[] {
  return allTerrain()
    .filter((row) => (row.yields[resourceId] ?? 0) > 0 && row.weight > 0)
    .map((row) => row.id);
}

function rollHinterland(rng: Rng, count: number): string[] {
  const rolled: string[] = [];
  for (let index = 0; index < count; index++) rolled.push(weightedTerrain(rng));
  if (count === 0) return rolled;

  // Ô đã bị "giữ" cho một hạn mức thì hạn mức sau không được lấy lại, nếu không
  // thì cái sau cùng luôn thắng và hai cái đầu quay về bằng không.
  const reserved = new Set<number>();

  for (const [resourceId, share] of Object.entries(MIN_YIELD_SHARE)) {
    const providers = providersOf(resourceId);
    if (providers.length === 0) continue;
    const quota = Math.max(1, Math.ceil(count * share));
    let have = rolled.filter((id) => providers.includes(id)).length;

    for (let index = 0; index < rolled.length && have < quota; index++) {
      const current = rolled[index];
      if (current === undefined || reserved.has(index) || providers.includes(current)) continue;
      rolled[index] = rng.pick(providers);
      reserved.add(index);
      have++;
    }
  }
  return rolled;
}

function tally(ids: readonly string[], seed?: readonly HinterlandTile[]): HinterlandTile[] {
  const counts = new Map<string, number>();
  for (const row of seed ?? []) counts.set(row.terrain, row.count);
  for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
  return [...counts.entries()].map(([terrain, count]) => ({ terrain, count }));
}

/** RUỘNG NGOÀI TƯỜNG (mục 6). Vẫn là tầng thành trì: đi bộ tới trong một ngày. */
export function generateHinterland(rng: Rng, rank: number): HinterlandTile[] {
  return tally(rollHinterland(rng, hinterlandTilesFor(rank)));
}

/** Ruộng nới ra khi lên cấp — thêm phần chênh lệch, giữ nguyên phần cũ. */
export function growHinterland(
  current: readonly HinterlandTile[],
  rng: Rng,
  fromRank: number,
  toRank: number,
): HinterlandTile[] {
  const extra = Math.max(0, hinterlandTilesFor(toRank) - hinterlandTilesFor(fromRank));
  return tally(rollHinterland(rng, extra), current);
}

// ---------------------------------------------------------------------------
// Hình học
// ---------------------------------------------------------------------------

/** Mọi ô một công trình chiếm. Công trình vành đai không chiếm ô nào. */
export function cellsOf(building: Building, at: Cell): Cell[] {
  if (building.perimeter) return [];
  const [width, height] = building.size;
  const cells: Cell[] = [];
  for (let dy = 0; dy < height; dy++) {
    for (let dx = 0; dx < width; dx++) cells.push({ x: at.x + dx, y: at.y + dy });
  }
  return cells;
}

/** Ô nằm ở vành ngoài của lưới — chỗ duy nhất đặt được tháp và cổng. */
export function isBorderCell(cell: Cell, size: number): boolean {
  return cell.x === 0 || cell.y === 0 || cell.x === size - 1 || cell.y === size - 1;
}

/** Khoảng cách Chebyshev — ô chéo cũng tính là kề, đúng như mục 4 hình dung. */
export function chebyshev(a: Cell, b: Cell): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

export function tileAt(holding: Holding, cell: Cell): HoldingTile | null {
  if (cell.x < 0 || cell.y < 0 || cell.x >= holding.gridSize || cell.y >= holding.gridSize) return null;
  return holding.tiles[cell.y * holding.gridSize + cell.x] ?? null;
}

export function placedAt(holding: Holding, cell: Cell): PlacedBuilding | null {
  const tile = tileAt(holding, cell);
  if (tile === null || tile.occupiedBy === '') return null;
  return holding.buildings.find((row) => row.id === tile.occupiedBy) ?? null;
}

// ---------------------------------------------------------------------------
// Kiểm tra trước khi đặt
// ---------------------------------------------------------------------------

export interface PlacementCheck {
  ok: boolean;
  /** Câu tiếng Việt đọc được, để UI hiện thẳng lên. Rỗng khi hợp lệ. */
  reason: string;
}

const OK: PlacementCheck = { ok: true, reason: '' };

function no(reason: string): PlacementCheck {
  return { ok: false, reason };
}

/** Thành trì đã có tường chưa — tháp, cổng, hào đều đòi có tường trước. */
export function hasWall(holding: Holding): boolean {
  return holding.buildings.some((placed) => {
    const building = buildingOf(placed.buildingId);
    return building?.fortify?.wallLayer !== undefined;
  });
}

/**
 * Đặt được công trình này ở đây không.
 *
 * Trả về CÂU GIẢI THÍCH chứ không phải boolean trần: người chơi bấm vào một ô và
 * thấy nút xám đi mà không có lý do thì sẽ đi hỏi ngoài game, và cả hệ quy hoạch
 * của mục 4 chỉ đáng chơi khi luật của nó hiện ra được.
 */
export function canPlace(holding: Holding, buildingId: string, at: Cell, playerRaces: readonly string[] = []): PlacementCheck {
  const building = buildingOf(buildingId);
  if (building === null) return no(`không có công trình "${buildingId}"`);

  const tier = tierOf(holding.tierId);
  if (tier === null) return no(`thành trì đang ở cấp lạ: ${holding.tierId}`);
  if (building.minTier > tier.rank) {
    const need = tierOf(holding.tierId);
    return no(`${building.name} chỉ xây được từ cấp ${String(building.minTier)}, ${need?.name ?? '?'} chưa tới`);
  }

  if (building.races.length > 0) {
    const inTown = new Set([...holding.population.races.map((row) => row.raceId), ...playerRaces]);
    if (!building.races.some((raceId) => inTown.has(raceId))) {
      return no(`${building.name} cần thợ của chủng tộc riêng, trong thành không có ai`);
    }
  }

  for (const required of building.requires) {
    if (!holding.buildings.some((row) => row.buildingId === required)) {
      return no(`${building.name} cần có ${buildingOf(required)?.name ?? required} trước`);
    }
  }
  if (building.requiresWall && !hasWall(holding)) {
    return no(`${building.name} phải dựa vào tường, mà thành trì chưa có tường`);
  }

  // Vành đai không đứng ở ô nào, nên mọi kiểm tra ô đều không áp dụng. Nhưng
  // KHÔNG được có hai lớp tường ngoài cùng lúc — lớp mới THAY lớp cũ (mục 3).
  if (building.perimeter) {
    if (holding.projects.some((row) => row.buildingId === buildingId)) {
      return no(`${building.name} đang xây dở rồi`);
    }
    if (building.fortify?.replacesWall !== true && holding.buildings.some((row) => row.buildingId === buildingId)) {
      return no(`${building.name} đã có rồi`);
    }
    return OK;
  }

  const cells = cellsOf(building, at);
  for (const cell of cells) {
    const tile = tileAt(holding, cell);
    if (tile === null) return no(`ô (${String(cell.x)},${String(cell.y)}) nằm ngoài lưới ${String(holding.gridSize)}×${String(holding.gridSize)}`);
    if (tile.occupiedBy !== '') {
      const occupant = holding.buildings.find((row) => row.id === tile.occupiedBy);
      const name = occupant === null || occupant === undefined ? 'công trình khác' : buildingOf(occupant.buildingId)?.name ?? 'công trình khác';
      return no(`ô (${String(cell.x)},${String(cell.y)}) đã có ${name}`);
    }
    const terrain = terrainOf(tile.terrain);
    if (terrain === null) return no(`ô (${String(cell.x)},${String(cell.y)}) có địa hình lạ: ${tile.terrain}`);
    if (!terrain.buildable) return no(`không đặt được gì lên ${terrain.name}`);
    if (building.terrain.forbid.some((name) => terrainMatches(tile.terrain, name))) {
      return no(`${building.name} không đặt được trên ${terrain.name}`);
    }
  }

  if (building.terrain.require.length > 0) {
    const met = cells.some((cell) => {
      const tile = tileAt(holding, cell);
      return tile !== null && building.terrain.require.some((name) => terrainMatches(tile.terrain, name));
    });
    if (!met) {
      const wanted = building.terrain.require.map((name) => terrainOf(name)?.name ?? name).join(' hoặc ');
      return no(`${building.name} phải đặt trên ${wanted}`);
    }
  }

  if (building.border && !cells.some((cell) => isBorderCell(cell, holding.gridSize))) {
    return no(`${building.name} phải đặt sát mép thành`);
  }

  return OK;
}

/** Mọi chỗ đặt được, để UI tô sáng và để bài test tự chọn chỗ. */
export function placementOptions(holding: Holding, buildingId: string, playerRaces: readonly string[] = []): Cell[] {
  const building = buildingOf(buildingId);
  if (building === null) return [];
  if (building.perimeter) return canPlace(holding, buildingId, { x: -1, y: -1 }, playerRaces).ok ? [{ x: -1, y: -1 }] : [];

  const options: Cell[] = [];
  for (let y = 0; y < holding.gridSize; y++) {
    for (let x = 0; x < holding.gridSize; x++) {
      if (canPlace(holding, buildingId, { x, y }, playerRaces).ok) options.push({ x, y });
    }
  }
  return options;
}

// ---------------------------------------------------------------------------
// Đặt và gỡ — hai hàm này là chỗ DUY NHẤT `occupiedBy` đổi giá trị
// ---------------------------------------------------------------------------

export function occupy(tiles: readonly HoldingTile[], size: number, cells: readonly Cell[], id: string): HoldingTile[] {
  const next = tiles.map((tile) => ({ ...tile }));
  for (const cell of cells) {
    const tile = next[cell.y * size + cell.x];
    if (tile === undefined) throw new HoldingGridError(`ô (${String(cell.x)},${String(cell.y)}) ngoài lưới`);
    tile.occupiedBy = id;
  }
  return next;
}

export function release(tiles: readonly HoldingTile[], id: string): HoldingTile[] {
  return tiles.map((tile) => (tile.occupiedBy === id ? { ...tile, occupiedBy: '' } : { ...tile }));
}

/** Số ô còn trống — con số UI hiện và là ràng buộc thật ở cấp 4. */
export function freeCells(holding: Holding): number {
  return holding.tiles.filter((tile) => tile.occupiedBy === '' && (terrainOf(tile.terrain)?.buildable ?? false)).length;
}

/**
 * ĐƯỜNG ĐI TRONG THÀNH VÀ CHỖ THẮT CỔ CHAI (mục 4, câu cuối).
 *
 * Phần 11 mục 6 đánh tổng công theo lớp, và `frontage` của mỗi lớp là số đợt qua
 * được cùng lúc. Một thành xây kín mít thì quân vào được rồi vẫn phải chen qua
 * mấy con hẻm — nên bố cục CHẶT là một lợi thế phòng thủ có thật, và nó phải ra
 * được một con số chứ không chỉ là một câu trong tài liệu.
 *
 * Đo bằng phần ô trống trên tổng ô: càng ít đường trống, chỗ thắt càng hẹp.
 */
export function chokeFactor(holding: Holding): number {
  const buildable = holding.tiles.filter((tile) => terrainOf(tile.terrain)?.buildable ?? false);
  if (buildable.length === 0) return 1;
  const open = buildable.filter((tile) => tile.occupiedBy === '').length / buildable.length;
  // 1.0 khi thành trống trơn, xuống 0.55 khi kín đặc.
  return 0.55 + 0.45 * Math.min(1, open / 0.45);
}
