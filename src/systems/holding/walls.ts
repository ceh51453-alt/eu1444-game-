/**
 * TƯỜNG THÀNH VẠCH TAY.
 *
 * Bản cũ coi tường là một "công trình vành đai": bấm xây `bld_tuong-da`, tường
 * hiện ra quanh mép lưới, hết. Cách ấy có hai chỗ sai, và cả hai đều lớn.
 *
 * **Sai thứ nhất: người chơi không quyết định gì.** Tường chạy ở đâu là câu hỏi
 * trung tâm của việc dựng một thành trì thời trung cổ. Ôm rộng thì bảo vệ được
 * cả khu chợ ngoại thành nhưng dài gấp đôi, tốn gấp đôi, và cần gấp đôi người
 * đứng canh. Ôm hẹp thì rẻ và dày quân nhưng bỏ nửa thành ra ngoài cho quân
 * địch đốt. Đó là một đánh đổi thật, và bản cũ xoá sạch nó bằng một nút bấm.
 *
 * **Sai thứ hai: tường không có ĐỘ DÀI.** Không có độ dài thì không có chi phí
 * theo độ dài, không có phí duy trì theo độ dài, và quan trọng nhất là không có
 * MẬT ĐỘ PHÒNG THỦ — số người trên mỗi trăm thước tường. Mà mật độ mới là con số
 * quyết định một cuộc vây hãm: hai trăm lính giữ ba trăm thước tường là một pháo
 * đài, giữ hai nghìn thước là một cái rây.
 *
 * Nên ở đây tường là DỮ LIỆU RIÊNG trong state, không dính gì tới cấp khu định
 * cư: một chuỗi điểm người chơi tự bấm, có vật liệu, có cấp, có độ nguyên vẹn
 * riêng. Một thành trì có bao nhiêu tuyến cũng được — luỹ ngoài, thành trong,
 * một đoạn chắn ngang hẻm núi. Xây rồi là nó nằm đó cho tới khi bị phá, kể cả
 * khi thành lên cấp.
 */

import { CELL_M, GRID_CELLS, cellsToMetres } from './scale';
import { terrainAt, isWaterTerrain, elevationAt, type HoldingField } from './field';

// ---------------------------------------------------------------------------
// Vật liệu
// ---------------------------------------------------------------------------

/**
 * HIỆU CHUẨN: một vòng tường "điển hình" phải tốn ĐÚNG BẰNG công trình vành đai
 * mà nó thay thế.
 *
 * Bốn công trình cũ (`bld_rao-go`, `bld_tuong-go`, `bld_tuong-da`,
 * `bld_tuong-trong`) đã được cân bằng qua cả một bài test nuôi thành hai mươi
 * năm. Đổi tường sang tính theo độ dài mà không hiệu chuẩn lại là ngầm đổi luôn
 * cả đường cong kinh tế của Phần 12, và sẽ không ai biết con số nào đã trôi.
 *
 * Nên bảng dưới đây neo vào vòng tường mà một thành trì ở cấp ấy thật sự vạch:
 *
 * ```
 * rao-go     bán kính  80 ô → chu vi  503 ô ≈ 2,5 km   ≈ bld_rao-go
 * tuong-go   bán kính 120 ô → chu vi  754 ô ≈ 3,8 km   ≈ bld_tuong-go
 * tuong-da   bán kính 180 ô → chu vi 1131 ô ≈ 5,7 km   ≈ bld_tuong-da
 * ```
 *
 * Vạch rộng hơn thì tốn hơn, và ĐÓ MỚI LÀ ĐIỂM: bản cũ không cho người chơi
 * đánh đổi ấy, còn ở đây ôm thêm khu chợ ngoại thành là một quyết định có giá.
 */
export interface WallMaterialDef {
  id: string;
  name: string;
  /** Vật tư cho MỖI Ô chiều dài, ở cấp 1. */
  perCell: Readonly<Record<string, number>>;
  /** Công lao động cho mỗi ô chiều dài, ở cấp 1. */
  manWeeksPerCell: number;
  /**
   * Độ bền nền của một tuyến KHÉP KÍN ở cấp 1 — con số đi thẳng vào
   * `WallLayer.integrity` của Phần 11.
   *
   * KHÔNG nhân với chiều dài, và đó là chủ ý: một bức tường dài không dày hơn
   * một bức tường ngắn, nó chỉ có nhiều chỗ để bị chọc thủng hơn. Cái giá của
   * chiều dài nằm ở `manWeeks`, ở `upkeep` và ở mật độ quân — ba chỗ ấy đã đủ.
   */
  integrity: number;
  height: number;
  thickness: number;
  /** Số ô dựng xong mỗi tuần với một tổ thợ chuẩn, ở cấp 1. */
  cellsPerWeek: number;
  maxLevel: number;
  /** Vữa cần thời tiết ấm — mùa đông công trường đá đứng im (mục 6). */
  stoneWork: boolean;
  note: string;
}

export const WALL_MATERIALS: readonly WallMaterialDef[] = [
  {
    id: 'rao-go', name: 'Hàng rào gỗ',
    perCell: { go: 0.28, tien: 0.13 },
    manWeeksPerCell: 0.3,
    integrity: 45, height: 2.5, thickness: 0.4,
    cellsPerWeek: 126, maxLevel: 1, stoneWork: false,
    note: 'Hàng cọc vót nhọn và một cái hào cạn. Dựng trong một mùa, cháy trong một đêm.',
  },
  {
    id: 'tuong-go', name: 'Tường gỗ và đất',
    perCell: { go: 0.56, da: 0.13, tien: 0.38 },
    manWeeksPerCell: 0.82,
    integrity: 130, height: 5, thickness: 1.6,
    cellsPerWeek: 47, maxLevel: 2, stoneWork: false,
    note: 'Hai hàng ván nhồi đất giữa. Chịu được lửa và chịu được một cú húc, không chịu được máy bắn đá.',
  },
  {
    id: 'tuong-da', name: 'Tường đá',
    perCell: { da: 1.95, go: 0.36, tien: 1.42, sat: 0.11 },
    manWeeksPerCell: 2.3,
    integrity: 320, height: 9, thickness: 3.2,
    cellsPerWeek: 19, maxLevel: 4, stoneWork: true,
    note: 'Đá xếp có vữa. Bức tường tiêu chuẩn của một thành trì thật, và là một tuyên bố chính trị.',
  },
  {
    id: 'tuong-da-khoi', name: 'Tường đá khối',
    perCell: { da: 3.5, go: 0.5, tien: 2.6, sat: 0.3 },
    manWeeksPerCell: 3.4,
    integrity: 520, height: 12, thickness: 4.5,
    cellsPerWeek: 12, maxLevel: 5, stoneWork: true,
    note: 'Đá tảng đẽo vuông, mạch khít không lách nổi lưỡi dao. Công thành phải mất nhiều tháng.',
  },
];

const MATERIAL_BY_ID: ReadonlyMap<string, WallMaterialDef> = new Map(
  WALL_MATERIALS.map((material) => [material.id, material]),
);

export function wallMaterialOf(id: string): WallMaterialDef | null {
  return MATERIAL_BY_ID.get(id) ?? null;
}

/** Thứ bậc vật liệu: tường đá khối thoả mọi yêu cầu mà tường đá thoả. */
const MATERIAL_RANK: Readonly<Record<string, number>> = {
  'rao-go': 1, 'tuong-go': 2, 'tuong-da': 3, 'tuong-da-khoi': 4,
};

/**
 * BỐN CÔNG TRÌNH VÀNH ĐAI CỦA BẢN CŨ GIỜ LÀ VẬT LIỆU TƯỜNG.
 *
 * Chúng vẫn còn tên trong hai chỗ của data: `requires` của vài công trình
 * (`bld_thap-chinh` đòi có tường đá trước) và `requiresBuildings` của bảng lên
 * cấp. Cả hai chỗ ấy muốn nói cùng một điều — "phải có một bức tường đàng hoàng
 * trước đã" — và điều ấy không hề đổi; chỉ có cách diễn đạt là của thời chưa có
 * tuyến tường.
 *
 * Dịch ở đây thay vì sửa hai bảng data, để nếu mai này có thêm một công trình
 * đòi tường thì nó vẫn khai bằng thứ tiếng mà cả hai bảng đang nói.
 */
const WALL_PREREQUISITES: Readonly<Record<string, string>> = {
  'bld_rao-go': 'rao-go',
  'bld_tuong-go': 'tuong-go',
  'bld_tuong-da': 'tuong-da',
  'bld_tuong-trong': 'tuong-da',
};

/** Id công trình vành đai cũ → vật liệu tường tương ứng. `null` là không phải. */
export function wallPrerequisiteOf(buildingId: string): string | null {
  return WALL_PREREQUISITES[buildingId] ?? null;
}

/**
 * Thành trì đã có một vòng tường đủ tốt chưa.
 *
 * Đòi KHÉP KÍN là đúng tinh thần của yêu cầu gốc: một đoạn tường đá dài hai trăm
 * thước chắn mặt bắc không phải là "thành trì này đã có tường đá".
 */
export function hasWallOfLeast(walls: readonly WallLine[], materialId: string): boolean {
  const wanted = MATERIAL_RANK[materialId] ?? 0;
  return standingWalls(walls).some((wall) => wall.closed && (MATERIAL_RANK[wall.materialId] ?? 0) >= wanted);
}

// ---------------------------------------------------------------------------
// Kiểu dữ liệu
// ---------------------------------------------------------------------------

export interface WallPoint {
  x: number;
  y: number;
}

export type WallLayer = 'ngoai' | 'trong';

export interface WallLine {
  /** `wall_*` — duy nhất trong một thành trì. */
  id: string;
  /** Tên người chơi đặt, hoặc tên vật liệu nếu bỏ trống. `locked` sau khi đặt. */
  name: string;
  materialId: string;
  level: number;
  points: WallPoint[];
  /** Chiều dài tuyến, tính bằng ô. Cache lại vì mọi phép đều cần nó. */
  length: number;
  /** Điểm cuối chạm điểm đầu — tuyến khép kín thì mới chắn được cả bốn phía. */
  closed: boolean;
  /** 0–100. Bị công phá và bị bỏ bê đều làm nó tụt. */
  integrity: number;
  /** Đang thi công thì còn mấy tuần. 0 là xong. */
  weeksLeft: number;
  /** Tổng công còn phải bỏ ra. */
  manWeeksLeft: number;
  /** Lớp trong hệ vây hãm. Suy ra tự động từ hình học, xem `assignLayers`. */
  layer: WallLayer;
}

export class HoldingWallError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HoldingWallError';
  }
}

// ---------------------------------------------------------------------------
// Hình học
// ---------------------------------------------------------------------------

function segmentLength(a: WallPoint, b: WallPoint): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function wallLength(points: readonly WallPoint[]): number {
  let total = 0;
  for (let index = 0; index < points.length - 1; index++) {
    const a = points[index];
    const b = points[index + 1];
    if (a === undefined || b === undefined) continue;
    total += segmentLength(a, b);
  }
  return total;
}

/** Khép kín khi có ít nhất 4 điểm và điểm cuối về gần điểm đầu. */
export function isClosed(points: readonly WallPoint[]): boolean {
  const first = points[0];
  const last = points[points.length - 1];
  if (first === undefined || last === undefined) return false;
  return points.length >= 4 && segmentLength(first, last) < 24;
}

/** Diện tích tuyến ôm được, tính bằng ô². Tuyến hở trả 0. */
export function enclosedArea(points: readonly WallPoint[]): number {
  if (!isClosed(points)) return 0;
  let twice = 0;
  for (let index = 0; index < points.length; index++) {
    const a = points[index];
    const b = points[(index + 1) % points.length];
    if (a === undefined || b === undefined) continue;
    twice += a.x * b.y - b.x * a.y;
  }
  return Math.abs(twice) / 2;
}

/** Một điểm có nằm trong tuyến khép kín không — dùng để xếp lớp trong/ngoài. */
export function insideWall(wall: WallLine, x: number, y: number): boolean {
  if (!wall.closed) return false;
  const polygon = wall.points;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    if (a === undefined || b === undefined) continue;
    const crossed = (a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y || 1) + a.x;
    if (crossed) inside = !inside;
  }
  return inside;
}

/** Khoảng cách từ một ô tới tuyến gần nhất, tính bằng ô. Không có tường thì vô cực. */
export function distanceToWall(walls: readonly WallLine[], x: number, y: number): number {
  let best = Number.POSITIVE_INFINITY;
  for (const wall of walls) {
    for (let index = 0; index < wall.points.length - 1; index++) {
      const a = wall.points[index];
      const b = wall.points[index + 1];
      if (a === undefined || b === undefined) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const lengthSquared = dx * dx + dy * dy;
      const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / lengthSquared));
      const distance = Math.hypot(x - (a.x + dx * t), y - (a.y + dy * t));
      if (distance < best) best = distance;
    }
  }
  return best;
}

/**
 * XẾP LỚP TỰ ĐỘNG. Tuyến khép kín ôm diện tích lớn nhất là tường NGOÀI; mọi
 * tuyến khép kín nằm gọn bên trong nó là tường TRONG.
 *
 * Suy ra từ hình học thay vì bắt người chơi khai, vì hình học đã nói rồi: một
 * vòng tường nằm bên trong một vòng tường khác LÀ tường nội, và hỏi lại người
 * chơi chỉ mở đường cho hai câu trả lời mâu thuẫn nhau. MUTATE danh sách.
 */
export function assignLayers(walls: WallLine[]): WallLine[] {
  const closed = walls.filter((wall) => wall.closed);
  if (closed.length === 0) {
    for (const wall of walls) wall.layer = 'ngoai';
    return walls;
  }
  const outer = [...closed].sort((a, b) => enclosedArea(b.points) - enclosedArea(a.points))[0];
  if (outer === undefined) return walls;

  for (const wall of walls) {
    if (wall.id === outer.id) {
      wall.layer = 'ngoai';
      continue;
    }
    const centre = wallCentre(wall);
    wall.layer = wall.closed && insideWall(outer, centre.x, centre.y) ? 'trong' : 'ngoai';
  }
  return walls;
}

function wallCentre(wall: WallLine): WallPoint {
  let x = 0;
  let y = 0;
  for (const point of wall.points) {
    x += point.x;
    y += point.y;
  }
  const count = Math.max(1, wall.points.length);
  return { x: x / count, y: y / count };
}

// ---------------------------------------------------------------------------
// Tính trước khi khởi công
// ---------------------------------------------------------------------------

export interface WallPlan {
  ok: boolean;
  /** Câu tiếng Việt đọc được. Rỗng khi hợp lệ. */
  reason: string;
  /** Chiều dài tuyến, tính bằng ô. */
  length: number;
  metres: number;
  /** Số ô tuyến phải bắc qua mặt nước — móng phải đóng cọc, đắt gấp bội. */
  waterCells: number;
  /** Số ô tuyến chạy trên đất cao. Tường trên đồi khó trèo hơn. */
  highCells: number;
  closed: boolean;
  /** Diện tích ôm được, quy ra km². Tuyến hở là 0. */
  enclosedKm2: number;
  cost: Record<string, number>;
  manWeeks: number;
  /** Số tuần tối thiểu — thêm người không rút ngắn được quá mức này. */
  weeks: number;
  /** Độ bền đưa sang Phần 11 khi tuyến còn nguyên vẹn. */
  integrity: number;
  /**
   * Số người cần đứng canh cho kín một lượt gác, tính theo chiều dài.
   *
   * Đây là con số bản cũ không có, và là con số làm cả cơ chế này có sức nặng:
   * vạch một vòng tường rộng gấp đôi nghĩa là cần gấp đôi người, mãi mãi.
   */
  watchmen: number;
}

/**
 * Một người canh giữ được chừng này thước tường trong một lượt gác.
 *
 * Hai mươi thước là khoảng cách một người còn nhìn thấy và gọi được người bên
 * cạnh trong đêm. Đặt chặt hơn thì mọi thành trì đều bị báo thiếu quân và con
 * số mất hết ý nghĩa phân biệt; đặt thưa hơn thì một vòng tường mười cây số coi
 * như canh được bằng hai trăm người, và cả đánh đổi "ôm rộng hay ôm hẹp" biến mất.
 */
const METRES_PER_WATCHMAN = 20;

function fail(reason: string): WallPlan {
  return {
    ok: false, reason, length: 0, metres: 0, waterCells: 0, highCells: 0,
    closed: false, enclosedKm2: 0, cost: {}, manWeeks: 0, weeks: 0, integrity: 0, watchmen: 0,
  };
}

/** Đếm số ô tuyến đi ngang mặt nước và số ô chạy trên đất cao. */
function surveyRoute(points: readonly WallPoint[], field: HoldingField | null): { water: number; high: number } {
  if (field === null) return { water: 0, high: 0 };
  let water = 0;
  let high = 0;
  for (let index = 0; index < points.length - 1; index++) {
    const a = points[index];
    const b = points[index + 1];
    if (a === undefined || b === undefined) continue;
    const steps = Math.max(1, Math.ceil(segmentLength(a, b) / 6));
    for (let step = 0; step <= steps; step++) {
      const f = step / steps;
      const x = a.x + (b.x - a.x) * f;
      const y = a.y + (b.y - a.y) * f;
      if (isWaterTerrain(terrainAt(field, x, y))) water += 6;
      else if (elevationAt(field, x, y) > 0.7) high += 6;
    }
  }
  return { water, high };
}

/** Chiều dài tối đa một tuyến, tính bằng ô. 2 400 ô = 12 km — quá đủ cho một thành trì. */
export const MAX_WALL_CELLS = 2400;

/**
 * TÍNH một tuyến trước khi khởi công: dài bao nhiêu, tốn gì, mất mấy tuần, được
 * bao nhiêu độ bền, và cần bao nhiêu người canh.
 *
 * UI gọi hàm này mỗi lần người chơi bấm thêm một điểm, nên con số hiện trên màn
 * hình luôn đúng bằng con số sẽ bị trừ thật. Game này không có reroll (mục 4 của
 * `HoldingGrid`), nên một cái bẫy chi phí là thứ duy nhất không được phép có.
 */
export function planWall(
  points: readonly WallPoint[],
  materialId: string,
  level: number,
  field: HoldingField | null = null,
): WallPlan {
  const material = wallMaterialOf(materialId);
  if (material === null) return fail(`không có loại tường "${materialId}"`);
  if (points.length < 2) return fail('cần ít nhất hai điểm để vạch một tuyến tường');

  for (const point of points) {
    if (point.x < 0 || point.y < 0 || point.x >= GRID_CELLS || point.y >= GRID_CELLS) {
      return fail('có điểm nằm ngoài mảnh đất của thành trì');
    }
  }

  const cappedLevel = Math.max(1, Math.min(material.maxLevel, Math.round(level)));
  const length = wallLength(points);
  if (length < 12) return fail('tuyến quá ngắn — chưa đủ một đoạn tường');
  if (length > MAX_WALL_CELLS) {
    return fail(`tuyến dài ${String(Math.round(cellsToMetres(length)))} thước, vượt hạn ${String(Math.round(cellsToMetres(MAX_WALL_CELLS)))} thước`);
  }

  const closed = isClosed(points);
  const { water, high } = surveyRoute(points, field);
  // Đá bắc qua nước phải đóng cọc móng: đoạn ấy tính thành 2,5 lần chiều dài.
  const effective = length + water * 1.5;

  const cost: Record<string, number> = {};
  for (const [id, amount] of Object.entries(material.perCell)) {
    cost[id] = Math.round(amount * effective * cappedLevel);
  }

  const manWeeks = Math.round(effective * material.manWeeksPerCell * cappedLevel);
  const weeks = Math.max(2, Math.ceil((effective / material.cellsPerWeek) * (1 + (cappedLevel - 1) * 0.4)));

  // Tuyến HỞ chỉ chắn được một hướng. Quân địch đi vòng qua đầu tuyến mất thêm
  // một ngày hành quân, không mất một cuộc công thành — nên nó đáng giá hơn số
  // không, và đáng giá kém hẳn một vòng khép kín.
  const closedFactor = closed ? 1 : 0.45;
  // Tường trên đất cao khó trèo hơn: thang phải dài hơn, tháp công thành phải
  // đẩy lên dốc. Đây là chỗ độ cao của `field.ts` biến thành một con số thật.
  const highFactor = length <= 0 ? 1 : 1 + Math.min(0.25, (high / length) * 0.3);
  const integrity = Math.round(material.integrity * cappedLevel * closedFactor * highFactor);

  return {
    ok: true, reason: '',
    length: Math.round(length),
    metres: Math.round(cellsToMetres(length)),
    waterCells: water,
    highCells: high,
    closed,
    enclosedKm2: (enclosedArea(points) * CELL_M * CELL_M) / 1_000_000,
    cost, manWeeks, weeks, integrity,
    watchmen: Math.max(4, Math.ceil(cellsToMetres(length) / METRES_PER_WATCHMAN)),
  };
}

// ---------------------------------------------------------------------------
// Dựng, nâng cấp, phá
// ---------------------------------------------------------------------------

export interface WallBuildResult {
  ok: boolean;
  reason: string;
  /** Tuyến mới, đang thi công. `null` khi không dựng được. */
  line: WallLine | null;
  /** Vật tư phải trừ khỏi kho. */
  spend: Record<string, number>;
}

function refuse(reason: string): WallBuildResult {
  return { ok: false, reason, line: null, spend: {} };
}

function affordable(stores: Readonly<Record<string, number>>, cost: Readonly<Record<string, number>>): string[] {
  const missing: string[] = [];
  for (const [id, amount] of Object.entries(cost)) {
    if ((stores[id] ?? 0) < amount) missing.push(id);
  }
  return missing;
}

export interface StartWallOptions {
  points: readonly WallPoint[];
  materialId: string;
  level?: number;
  name?: string;
  field?: HoldingField | null;
  stores: Readonly<Record<string, number>>;
  existing: readonly WallLine[];
}

/**
 * KHỞI CÔNG một tuyến. Trả về tuyến đang thi công và số vật tư phải trừ; việc
 * ghi vào state là của `week.ts`, để hàm này thuần và test được một mình.
 */
export function startWall(options: StartWallOptions): WallBuildResult {
  const plan = planWall(options.points, options.materialId, options.level ?? 1, options.field ?? null);
  if (!plan.ok) return refuse(plan.reason);

  const missing = affordable(options.stores, plan.cost);
  if (missing.length > 0) return refuse(`thiếu vật tư: ${missing.join(', ')}`);

  const material = wallMaterialOf(options.materialId);
  if (material === null) return refuse(`không có loại tường "${options.materialId}"`);

  const index = options.existing.length + 1;
  const line: WallLine = {
    id: `wall_${String(index)}-${String(Math.round(options.points[0]?.x ?? 0))}-${String(Math.round(options.points[0]?.y ?? 0))}`,
    name: options.name?.trim() === undefined || options.name.trim() === '' ? `${material.name} ${String(index)}` : options.name.trim(),
    materialId: options.materialId,
    level: Math.max(1, Math.min(material.maxLevel, Math.round(options.level ?? 1))),
    points: options.points.map((point) => ({ x: Math.round(point.x), y: Math.round(point.y) })),
    length: plan.length,
    closed: plan.closed,
    integrity: 100,
    weeksLeft: plan.weeks,
    manWeeksLeft: plan.manWeeks,
    layer: 'ngoai',
  };

  return { ok: true, reason: '', line, spend: { ...plan.cost } };
}

/**
 * NÂNG CẤP một tuyến sẵn có — chỉ trả phần CHÊNH vật liệu, không xây lại từ đầu.
 *
 * Đây là điều bản cũ không làm được và là lý do bức tường cũ hay "biến mất": khi
 * tường là một công trình bám theo bán kính quy hoạch, lên cấp khu định cư là
 * bán kính đổi, và cả vòng tường vừa xây phải vẽ lại. Ở đây tuyến là dữ liệu
 * riêng, nên nâng cấp chỉ là dày thêm chính bức tường ấy.
 */
export function upgradeWall(
  wall: WallLine,
  stores: Readonly<Record<string, number>>,
  field: HoldingField | null = null,
): WallBuildResult {
  const material = wallMaterialOf(wall.materialId);
  if (material === null) return refuse(`không có loại tường "${wall.materialId}"`);
  if (wall.weeksLeft > 0) return refuse(`${wall.name} đang thi công`);
  if (wall.level >= material.maxLevel) return refuse(`${material.name} không nâng quá cấp ${String(material.maxLevel)} được`);

  const now = planWall(wall.points, wall.materialId, wall.level, field);
  const next = planWall(wall.points, wall.materialId, wall.level + 1, field);
  if (!next.ok) return refuse(next.reason);

  const delta: Record<string, number> = {};
  for (const id of Object.keys(next.cost)) {
    delta[id] = Math.max(0, (next.cost[id] ?? 0) - (now.cost[id] ?? 0));
  }
  const missing = affordable(stores, delta);
  if (missing.length > 0) return refuse(`thiếu vật tư: ${missing.join(', ')}`);

  return {
    ok: true, reason: '',
    line: {
      ...wall,
      level: wall.level + 1,
      weeksLeft: Math.max(2, next.weeks - now.weeks),
      manWeeksLeft: Math.max(1, next.manWeeks - now.manWeeks),
    },
    spend: delta,
  };
}

/** Phá bỏ một tuyến — thu hồi 30 phần trăm đá và gỗ. Tiền công thì mất. */
export function demolishWall(wall: WallLine, field: HoldingField | null = null): Record<string, number> {
  const plan = planWall(wall.points, wall.materialId, wall.level, field);
  const back: Record<string, number> = {};
  for (const [id, amount] of Object.entries(plan.cost)) {
    if (id === 'tien') continue;
    back[id] = Math.round(amount * 0.3);
  }
  return back;
}

// ---------------------------------------------------------------------------
// Biến phụ
// ---------------------------------------------------------------------------

/** Tuyến đã dựng xong — chưa xong thì chưa chắn được gì. */
export function standingWalls(walls: readonly WallLine[]): WallLine[] {
  return walls.filter((wall) => wall.weeksLeft <= 0);
}

/** Tuyến ngoài cùng, cái Phần 11 đánh trước. */
export function outerWall(walls: readonly WallLine[]): WallLine | null {
  const done = standingWalls(walls).filter((wall) => wall.layer === 'ngoai');
  return [...done].sort((a, b) => enclosedArea(b.points) - enclosedArea(a.points))[0] ?? null;
}

export function innerWall(walls: readonly WallLine[]): WallLine | null {
  const done = standingWalls(walls).filter((wall) => wall.layer === 'trong');
  return [...done].sort((a, b) => enclosedArea(b.points) - enclosedArea(a.points))[0] ?? null;
}

/** Độ bền của một tuyến, đã trừ hư hại. */
export function wallIntegrity(wall: WallLine, field: HoldingField | null = null): number {
  const plan = planWall(wall.points, wall.materialId, wall.level, field);
  return Math.max(1, Math.round(plan.integrity * (wall.integrity / 100)));
}

/**
 * Phí duy trì mỗi tuần, tính bằng đồng. Tường dài là gánh nặng thật.
 *
 * Hiệu chuẩn theo `bld_tuong-da` cũ: 6,5 đồng mỗi tuần cho một vòng 1 131 ô
 * (5 655 thước), tức 0,0012 mỗi thước.
 */
export function wallUpkeep(walls: readonly WallLine[]): number {
  let total = 0;
  for (const wall of standingWalls(walls)) {
    total += cellsToMetres(wall.length) * 0.0012 * wall.level;
  }
  return total;
}

/** Tổng số người cần để canh kín mọi tuyến đã dựng. */
export function watchmenNeeded(walls: readonly WallLine[]): number {
  let total = 0;
  for (const wall of standingWalls(walls)) {
    total += Math.max(4, Math.ceil(cellsToMetres(wall.length) / METRES_PER_WATCHMAN));
  }
  return total;
}

/**
 * MẬT ĐỘ PHÒNG THỦ: số quân đang có trên mỗi người cần có.
 *
 * 1 là vừa đủ kín một lượt gác, dưới 1 là có chỗ trống trên mặt tường. Phần 11
 * đọc con số này, và nó là lý do vạch một vòng tường quá rộng có thể LÀM YẾU
 * một thành trì chứ không phải làm mạnh — điều mà bản cũ, nơi tường không có
 * chiều dài, không có cách nào diễn đạt.
 */
export function wallDensity(walls: readonly WallLine[], garrison: number): number {
  const needed = watchmenNeeded(walls);
  if (needed <= 0) return 1;
  return garrison / needed;
}

/** Một dòng mô tả cho UI và cho AI. */
export function describeWall(wall: WallLine): string {
  const material = wallMaterialOf(wall.materialId);
  const state = wall.weeksLeft > 0
    ? `đang thi công, còn ${String(wall.weeksLeft)} tuần`
    : `nguyên vẹn ${String(Math.round(wall.integrity))} phần trăm`;
  const shape = wall.closed ? 'khép kín' : 'một tuyến hở';
  return `${wall.name} — ${material?.name ?? wall.materialId} cấp ${String(wall.level)}, ${shape}, dài ${String(Math.round(cellsToMetres(wall.length)))} thước (${state})`;
}
