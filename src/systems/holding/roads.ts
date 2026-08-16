/**
 * ĐƯỜNG NGƯỜI CHƠI VẠCH — lát đá lên chỗ bùn lầy.
 *
 * `streets.ts` sinh ra những con đường VỐN CÓ: quan lộ đi ngang qua, mấy con
 * ngõ mòn dần thành hình. Chúng có sẵn, không tốn gì, và cũng không tốt lên
 * được. File này là chuyện khác: lãnh chúa quyết định rải sỏi hay lát đá một
 * tuyến cụ thể, trả tiền cho nó, chờ thợ làm xong, rồi trả tiền duy trì mãi mãi.
 *
 * ---
 *
 * VÌ SAO ĐƯỜNG PHẢI TỐN TIỀN, trong khi bản gốc mà file này tham khảo cho vạch
 * đường miễn phí và tức thì: vì `walls.ts` ngay bên cạnh tính từng ô chiều dài
 * thành từng cân đá và từng tuần công. Một bức tường dài gấp đôi tốn gấp đôi,
 * còn một con đường lát đá dài gấp đôi thì bấm hai lần chuột — hai thứ nằm cạnh
 * nhau trên cùng một bản đồ mà đo bằng hai thứ luật thì cái rẻ hơn sẽ nuốt hết
 * sự chú ý, và nó không đáng được thế.
 *
 * MẶT ĐƯỜNG LÀM ĐƯỢC MỘT VIỆC, và chỉ một: nó THOÁT NƯỚC (`pavingHygiene`).
 * Một con phố đất trong một thành trì bốn nghìn dân là một rãnh bùn trộn phân,
 * và dịch bệnh của Phần 11 mục 3 đọc thẳng vào `hygiene`. Đường không cộng sản
 * lượng, không cộng thương mại, không cộng tốc độ hành quân — ba thứ ấy nghe
 * đều hợp lý và đều là những cánh cửa mà một khi mở ra thì cả bảng cân bằng của
 * Phần 12 phải hiệu chỉnh lại từ đầu.
 */

import { isWaterTerrain, terrainAt, type HoldingField } from './field';
import { CELL_M, GRID_CELLS, cellsToMetres } from './scale';
import type { Cell } from './types';

// ---------------------------------------------------------------------------
// Mặt đường
// ---------------------------------------------------------------------------

export interface RoadSurfaceDef {
  id: string;
  name: string;
  /** Vật tư cho MỖI Ô chiều dài, ở bề rộng 1. */
  perCell: Readonly<Record<string, number>>;
  /** Công lao động cho mỗi ô chiều dài, ở bề rộng 1. */
  manWeeksPerCell: number;
  /** Số ô lát xong mỗi tuần với một tổ thợ chuẩn. */
  cellsPerWeek: number;
  /** Điểm vệ sinh cộng cho mỗi 100 thước mặt đường, ở bề rộng 1. */
  drainage: number;
  /** Tiền duy trì mỗi tuần cho mỗi 100 ô chiều dài. */
  upkeepPerHundred: number;
  /** Vữa và đá cần thời tiết ấm — mùa đông công trường đứng, như tường đá. */
  stoneWork: boolean;
  note: string;
}

/**
 * Ba mặt đường. Không có mặt thứ tư, và đặc biệt không có "đường hoàng gia":
 * bậc trên cùng của một thang ba bậc mà không ai với tới được thì chỉ là một
 * dòng chữ xám trong bảng chọn.
 */
export const ROAD_SURFACES: readonly RoadSurfaceDef[] = [
  {
    id: 'duong-dat',
    name: 'Đường đất nện',
    perCell: { tien: 0.04 },
    manWeeksPerCell: 0.05,
    cellsPerWeek: 300,
    drainage: 0.15,
    upkeepPerHundred: 0.08,
    stoneWork: false,
    note: 'Đầm chặt và vét hai bên rãnh. Đi được vào mùa khô, và chỉ mùa khô.',
  },
  {
    id: 'duong-soi',
    name: 'Đường rải sỏi',
    perCell: { da: 0.22, tien: 0.16 },
    manWeeksPerCell: 0.14,
    cellsPerWeek: 150,
    drainage: 0.55,
    upkeepPerHundred: 0.22,
    stoneWork: false,
    note: 'Lớp sỏi trên nền đá dăm. Xe bò qua được cả sau mưa, và không thành sông vào tháng ba.',
  },
  {
    id: 'duong-lat-da',
    name: 'Đường lát đá',
    perCell: { da: 0.85, tien: 0.6, go: 0.05 },
    manWeeksPerCell: 0.42,
    cellsPerWeek: 58,
    drainage: 1.3,
    upkeepPerHundred: 0.5,
    stoneWork: true,
    note: 'Đá tảng đẽo phẳng, vồng ở giữa cho nước chảy về hai rãnh. Trăm năm sau vẫn còn đó.',
  },
];

export function roadSurfaceOf(id: string): RoadSurfaceDef | null {
  return ROAD_SURFACES.find((row) => row.id === id) ?? null;
}

// ---------------------------------------------------------------------------
// Tuyến đường
// ---------------------------------------------------------------------------

/** Một tuyến đường đã lát hoặc đang lát. Đây là thứ ĐI VÀO SAVE. */
export interface RoadLine {
  id: string;
  /** Tên người chơi đặt. `locked` sau khi đặt, cùng luật với tên tường. */
  name: string;
  surfaceId: string;
  /** 1–3. Rộng gấp đôi thì tốn gấp đôi và thoát nước gấp đôi. */
  width: number;
  points: Cell[];
  /** Chiều dài tính bằng ô, chốt lúc khởi công. */
  length: number;
  /** 0–100. Đường bỏ bê thì lở, và lở tới 0 là về lại đường mòn. */
  integrity: number;
  weeksLeft: number;
  manWeeksLeft: number;
}

export class HoldingRoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HoldingRoadError';
  }
}

/** Dài hơn chừng này thì đó không còn là đường trong thành nữa. */
export const MAX_ROAD_CELLS = 2400;

/** Ngắn hơn chừng này thì chưa thành một tuyến. */
const MIN_ROAD_CELLS = 8;

// ---------------------------------------------------------------------------
// Đo và định giá
// ---------------------------------------------------------------------------

export function roadLength(points: readonly Cell[]): number {
  let total = 0;
  for (let index = 0; index < points.length - 1; index++) {
    const a = points[index];
    const b = points[index + 1];
    if (a === undefined || b === undefined) continue;
    total += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return total;
}

export interface RoadPlan {
  ok: boolean;
  /** Câu tiếng Việt đọc được. Rỗng khi hợp lệ. */
  reason: string;
  length: number;
  metres: number;
  /** Số ô tuyến phải bắc qua mặt nước — chỗ ấy cần một cái cầu, và cầu thì đắt. */
  waterCells: number;
  cost: Record<string, number>;
  manWeeks: number;
  weeks: number;
  /** Điểm vệ sinh tuyến này sẽ cộng khi lát xong. */
  hygiene: number;
  /** Tiền duy trì mỗi tuần. */
  upkeep: number;
}

function refuse(reason: string): RoadPlan {
  return { ok: false, reason, length: 0, metres: 0, waterCells: 0, cost: {}, manWeeks: 0, weeks: 0, hygiene: 0, upkeep: 0 };
}

/**
 * Định giá một tuyến TRƯỚC KHI khởi công.
 *
 * Đoạn qua nước tính gấp bốn: lát đá lên mặt sông không phải là lát đá, đó là
 * bắc cầu, và một cây cầu đá tốn hơn hẳn một quãng phố cùng chiều dài. Nhân số
 * ở đây thay cho cả một hệ thống cầu riêng — thô, nhưng thô đúng hướng, và
 * người chơi vạch một con đường men theo bờ sông thay vì cắt ngang nó là đã
 * hiểu đúng cái mà con số này muốn nói.
 */
export function planRoad(
  points: readonly Cell[],
  surfaceId: string,
  width: number,
  field: HoldingField | null = null,
): RoadPlan {
  const surface = roadSurfaceOf(surfaceId);
  if (surface === null) return refuse(`không có loại mặt đường "${surfaceId}"`);
  if (points.length < 2) return refuse('cần ít nhất hai điểm để vạch một tuyến đường');

  for (const point of points) {
    if (point.x < 0 || point.y < 0 || point.x >= GRID_CELLS || point.y >= GRID_CELLS) {
      return refuse('có điểm nằm ngoài mảnh đất của thành trì');
    }
  }

  const lanes = Math.max(1, Math.min(3, Math.round(width)));
  const length = roadLength(points);
  if (length < MIN_ROAD_CELLS) return refuse('tuyến quá ngắn — chưa đủ một quãng đường');
  if (length > MAX_ROAD_CELLS) {
    return refuse(
      `tuyến dài ${String(Math.round(cellsToMetres(length)))} thước, vượt hạn ${String(Math.round(cellsToMetres(MAX_ROAD_CELLS)))} thước`,
    );
  }

  const waterCells = countWater(points, field);
  const effective = (length + waterCells * 3) * lanes;

  const cost: Record<string, number> = {};
  for (const [id, amount] of Object.entries(surface.perCell)) {
    cost[id] = Math.round(amount * effective * 10) / 10;
  }

  const manWeeks = Math.round(effective * surface.manWeeksPerCell * 10) / 10;
  const weeks = Math.max(1, Math.ceil(effective / surface.cellsPerWeek));

  return {
    ok: true,
    reason: '',
    length: Math.round(length),
    metres: Math.round(cellsToMetres(length)),
    waterCells,
    cost,
    manWeeks,
    weeks,
    hygiene: Math.round(((cellsToMetres(length) / 100) * surface.drainage * lanes) * 10) / 10,
    upkeep: Math.round(((length / 100) * surface.upkeepPerHundred * lanes) * 100) / 100,
  };
}

/** Số ô tuyến chạy trên mặt nước. Lấy mẫu mỗi 4 ô — đủ nhặt một khúc sông. */
function countWater(points: readonly Cell[], field: HoldingField | null): number {
  if (field === null) return 0;
  let wet = 0;
  for (let index = 0; index < points.length - 1; index++) {
    const a = points[index];
    const b = points[index + 1];
    if (a === undefined || b === undefined) continue;
    const segment = Math.hypot(b.x - a.x, b.y - a.y);
    const steps = Math.max(1, Math.ceil(segment / 4));
    for (let step = 0; step < steps; step++) {
      const f = step / steps;
      const id = terrainAt(field, a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f);
      if (isWaterTerrain(id) || id === 'suoi') wet += segment / steps;
    }
  }
  return Math.round(wet);
}

// ---------------------------------------------------------------------------
// Khởi công
// ---------------------------------------------------------------------------

export interface StartRoadOptions {
  points: readonly Cell[];
  surfaceId: string;
  width?: number;
  name?: string;
  field?: HoldingField | null;
  stores: Readonly<Record<string, number>>;
  existing: readonly RoadLine[];
}

export interface RoadBuildResult {
  ok: boolean;
  reason: string;
  line: RoadLine | null;
  /** Vật tư phải trừ khỏi kho. Rỗng khi từ chối. */
  spend: Record<string, number>;
}

function deny(reason: string): RoadBuildResult {
  return { ok: false, reason, line: null, spend: {} };
}

/**
 * Khởi công một tuyến. Trừ vật tư NGAY, cùng đường ống với `startWall`.
 *
 * Trả về tuyến chứ không ghi vào `Holding`: mọi thay đổi state đi qua MVU (R2),
 * và chỗ ghi là màn hình thành trì lúc người chơi bấm "Chốt".
 */
export function startRoad(options: StartRoadOptions): RoadBuildResult {
  const plan = planRoad(options.points, options.surfaceId, options.width ?? 1, options.field ?? null);
  if (!plan.ok) return deny(plan.reason);

  const missing: string[] = [];
  for (const [id, amount] of Object.entries(plan.cost)) {
    if ((options.stores[id] ?? 0) + 1e-9 < amount) missing.push(id);
  }
  if (missing.length > 0) return deny(`thiếu vật tư: ${missing.join(', ')}`);

  const surface = roadSurfaceOf(options.surfaceId);
  if (surface === null) return deny(`không có loại mặt đường "${options.surfaceId}"`);

  const index = options.existing.length + 1;
  const first = options.points[0];
  const trimmed = options.name?.trim() ?? '';

  return {
    ok: true,
    reason: '',
    line: {
      id: `road_${String(index)}-${String(Math.round(first?.x ?? 0))}-${String(Math.round(first?.y ?? 0))}`,
      name: trimmed === '' ? `${surface.name} ${String(index)}` : trimmed,
      surfaceId: options.surfaceId,
      width: Math.max(1, Math.min(3, Math.round(options.width ?? 1))),
      points: options.points.map((point) => ({ x: Math.round(point.x), y: Math.round(point.y) })),
      length: plan.length,
      integrity: 100,
      weeksLeft: plan.weeks,
      manWeeksLeft: plan.manWeeks,
    },
    spend: { ...plan.cost },
  };
}

// ---------------------------------------------------------------------------
// Sổ sách
// ---------------------------------------------------------------------------

/** Tuyến đã lát xong. Tuyến còn dở không thoát nước và không tính duy trì. */
export function pavedRoads(roads: readonly RoadLine[]): RoadLine[] {
  return roads.filter((road) => road.weeksLeft <= 0);
}

/**
 * ĐIỂM VỆ SINH từ mặt đường, cộng thẳng vào `hygiene` của thành trì.
 *
 * CHẶN TRÊN 12 ĐIỂM, và cái chặn ấy quan trọng hơn công thức: không có nó thì
 * lát kín cả sáu cây số vuông là một cách mua đứt hệ dịch bệnh của Phần 11 bằng
 * đá, và mọi quyết định vệ sinh khác trong game mất nghĩa cùng lúc.
 *
 * Đường LỞ thì thoát nước kém đi theo đúng tỉ lệ nó lở: một con phố lát đá vỡ
 * nát đọng nước không khác gì một con đường đất.
 */
export function pavingHygiene(roads: readonly RoadLine[]): number {
  let total = 0;
  for (const road of pavedRoads(roads)) {
    const surface = roadSurfaceOf(road.surfaceId);
    if (surface === null) continue;
    total += (cellsToMetres(road.length) / 100) * surface.drainage * road.width * (road.integrity / 100);
  }
  return Math.min(12, Math.round(total * 10) / 10);
}

/** Tiền duy trì mỗi tuần cho mọi tuyến đã lát xong. */
export function roadUpkeep(roads: readonly RoadLine[]): number {
  let total = 0;
  for (const road of pavedRoads(roads)) {
    const surface = roadSurfaceOf(road.surfaceId);
    if (surface === null) continue;
    total += (road.length / 100) * surface.upkeepPerHundred * road.width;
  }
  return Math.round(total * 100) / 100;
}

/** Tổng chiều dài mặt đường đã lát, tính bằng thước. */
export function pavedMetres(roads: readonly RoadLine[]): number {
  return Math.round(pavedRoads(roads).reduce((sum, road) => sum + cellsToMetres(road.length), 0));
}

/** Diện tích mặt đường đã lát, quy ra m². */
export function pavedAreaM2(roads: readonly RoadLine[]): number {
  return Math.round(
    pavedRoads(roads).reduce((sum, road) => sum + cellsToMetres(road.length) * road.width * CELL_M, 0),
  );
}

export function describeRoad(road: RoadLine): string {
  const surface = roadSurfaceOf(road.surfaceId)?.name ?? road.surfaceId;
  const metres = Math.round(cellsToMetres(road.length));
  const state = road.weeksLeft > 0 ? `đang lát, còn ${String(Math.ceil(road.weeksLeft))} tuần` : `nguyên vẹn ${String(Math.round(road.integrity))}%`;
  return `${road.name} — ${surface} rộng ${String(road.width)}, dài ${String(metres)} thước, ${state}`;
}

/** Bỏ một tuyến khỏi danh sách. Đường phá đi không hoàn lại vật tư. */
export function removeRoad(roads: readonly RoadLine[], roadId: string): RoadLine[] {
  return roads.filter((road) => road.id !== roadId);
}

// ---------------------------------------------------------------------------
// Tuyến tự sinh người chơi cho phá
// ---------------------------------------------------------------------------

/**
 * Người chơi xoá một con ngõ tự sinh.
 *
 * Chỉ lưu ID chứ không lưu cả tuyến — cả mạng đường tự sinh dựng lại được từ
 * `seed` bất cứ lúc nào (xem `streets.ts`), nên thứ duy nhất không suy lại được
 * là ý muốn của người chơi. Một chuỗi id ngắn thay cho vài nghìn toạ độ.
 */
export function razeStreet(razed: readonly string[], streetId: string): string[] {
  if (streetId === '' || razed.includes(streetId)) return [...razed];
  return [...razed, streetId];
}

export function restoreStreets(): string[] {
  return [];
}

export function isRazed(razed: readonly string[], streetId: string): boolean {
  return razed.includes(streetId);
}
