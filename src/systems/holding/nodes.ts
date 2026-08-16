/**
 * ĐIỂM TÀI NGUYÊN — MỎ, RỪNG VÀ BÃI CÁ CÓ CHỖ ĐỨNG THẬT.
 *
 * Bản cũ để "ruộng ngoài tường" là một bảng đếm: `[{terrain:'rung', count:9}]`.
 * Bảng ấy trả lời được "thành trì này có bao nhiêu rừng" nhưng không trả lời
 * được câu quan trọng hơn: **rừng ở ĐÂU.** Mà chừng nào chưa trả lời được câu
 * ấy thì xưởng cưa đặt chỗ nào cũng như nhau, và mục 4 ("kề nhau có ý nghĩa")
 * chỉ đúng với những công trình đứng cạnh nhau, không đúng với đất.
 *
 * Ở đây mỗi mỏ là một VÙNG có biên: một đa giác bám theo địa mạo, cắt ngay khi
 * gặp loại đất không hợp, gặp nước, gặp nền thành hay mép lưới. Bốn hệ quả:
 *
 *  1. **Công trình khai thác phải đứng TRONG vùng.** Xưởng cưa giữa đồng trống
 *     không ra một khúc gỗ nào, và đó là một luật hình học chứ không phải một
 *     con số phạt.
 *  2. **Mỏ có trữ lượng và có ngày cạn.** Bậc 3 tụt xuống bậc 2 rồi bậc 1 rồi
 *     hết. Một thành trì giàu vì sắt sẽ phải đối mặt với ngày cái sắt ấy hết,
 *     và đó là một câu chuyện mà bảng đếm cũ không kể được.
 *  3. **Vùng không chồng nhau.** Hai mỏ cạnh nhau bị cắt theo trung tuyến
 *     (Voronoi có khe), nên không có khoảnh đất nào thuộc về hai chủ.
 *  4. **Bậc càng cao càng nhận được nhiều xưởng.** Một mạch nghèo nuôi nổi một
 *     xưởng; một mạch giàu nuôi ba. Đây là chỗ "mỏ tốt" thành một lợi thế đo
 *     đếm được thay vì một tính từ.
 *
 * Điểm được LƯU VÀO STATE, khác hẳn địa hình. Địa hình tính lại được từ hạt
 * giống; trữ lượng còn lại thì không — nó là lịch sử khai thác của người chơi.
 */

import { GRID_CELLS, KEEP_YARD_CELLS, CENTER_CELL, CELL_M, planningRadiusCells } from './scale';
import { terrainAt, isWaterTerrain, type HoldingField } from './field';

// ---------------------------------------------------------------------------
// Loại vùng
// ---------------------------------------------------------------------------

/**
 * SÁU LOẠI VÙNG. Mỗi loại khai thành phần sản vật cộng lại bằng 1, nên một xưởng
 * đứng trên vùng ấy biết chính xác nó moi lên được những gì theo tỉ lệ nào.
 */
export const NODE_ZONES = ['rung-go', 'via-da', 'mach-sat', 'bai-ca', 'ruong-muoi', 'dong-co'] as const;
export type NodeZone = (typeof NODE_ZONES)[number];

/**
 * HAI LOẠI VÙNG, và chúng chết theo hai cách khác hẳn nhau.
 *
 *  `khoang-san` — thứ nằm sẵn dưới đất từ trước khi có người. Bậc của nó là một
 *    sự thật địa chất: một vỉa quặng giàu không "nghèo dần" đi, nó chỉ HẾT. Đào
 *    xong tấn cuối cùng thì cái mỏ biến mất khỏi bản đồ, không tụt xuống bậc
 *    dưới rồi thoi thóp thêm hai mươi năm.
 *
 *  `tai-sinh` — thứ MỌC LẠI. Bậc của nó là một sự thật SINH HỌC, và nó lên
 *    xuống theo cách lãnh chúa đối xử với nó: chặt ít hơn mức rừng mọc lại thì
 *    rừng dày lên, chặt quá thì thưa dần rồi trọc.
 */
export type NodeRenewal = 'khoang-san' | 'tai-sinh';

export interface NodeZoneDef {
  id: NodeZone;
  name: string;
  /** Sản vật và tỉ lệ, dùng id trong `data/resources.json → resources`. */
  yields: Readonly<Record<string, number>>;
  /** Loại đất vùng này được phép trải lên. */
  terrain: readonly string[];
  /** Vùng nằm trên mặt nước — xưởng đứng ở bờ vẫn tính là chạm tới. */
  water: boolean;
  renewal: NodeRenewal;
}

export const NODE_ZONE_DEFS: Readonly<Record<NodeZone, NodeZoneDef>> = {
  'rung-go': {
    id: 'rung-go', name: 'rừng gỗ',
    yields: { go: 0.72, 'da-thu': 0.28 },
    terrain: ['rung'], water: false,
    renewal: 'tai-sinh',
  },
  'via-da': {
    id: 'via-da', name: 'vỉa đá',
    yields: { da: 0.85, sat: 0.15 },
    terrain: ['da-goc', 'doi'], water: false,
    renewal: 'khoang-san',
  },
  'mach-sat': {
    id: 'mach-sat', name: 'mạch sắt',
    yields: { sat: 0.7, than: 0.3 },
    terrain: ['mo-sat', 'doi', 'da-goc'], water: false,
    renewal: 'khoang-san',
  },
  'bai-ca': {
    id: 'bai-ca', name: 'bãi cá',
    yields: { 'luong-thuc': 1 },
    terrain: ['song', 'suoi', 'bien'], water: true,
    // Bãi cá đi theo luật KHOÁNG SẢN chứ không theo luật rừng, và đó là một
    // quyết định thiết kế chứ không phải một nhầm lẫn sinh học: đánh cạn một
    // bãi cá thì nó mất hẳn, không mọc lại. Nó biến việc vắt kiệt một ngư
    // trường thành một chuyện KHÔNG SỬA ĐƯỢC — và đó đúng là chuyện đã xảy ra
    // với những ngư trường thật.
    renewal: 'khoang-san',
  },
  'ruong-muoi': {
    id: 'ruong-muoi', name: 'ruộng muối',
    // Đầm lầy nhả ra cả muối lẫn SẮT ĐẦM — thứ quặng nghèo mà cả châu Âu thời
    // này vẫn moi lên bằng tay, và là nguồn sắt duy nhất của một khu định cư
    // chưa tới cấp mở mỏ. Xem chú thích `dam` trong `data/resources.json`.
    //
    // Xếp cùng nhóm biển: cái moi lên ở đây là quặng đầm, và quặng thì hết.
    yields: { muoi: 0.68, sat: 0.32 },
    terrain: ['dam', 'bien'], water: false,
    renewal: 'khoang-san',
  },
  'dong-co': {
    id: 'dong-co', name: 'đồng cỏ',
    yields: { len: 0.74, 'luong-thuc': 0.26 },
    terrain: ['dat-can', 'dat-tot'], water: false,
    // Cỏ mọc lại, nên đồng cỏ theo luật rừng: chăn vừa phải thì đồng dày lên,
    // thả quá tay thì trơ đất.
    renewal: 'tai-sinh',
  },
};

export function zoneRenewal(zone: NodeZone): NodeRenewal {
  return NODE_ZONE_DEFS[zone].renewal;
}

export function isRenewable(node: ResourceNode): boolean {
  return zoneRenewal(node.zone) === 'tai-sinh';
}

/** BẬC trữ lượng: 0 cạn · 1 nghèo · 2 khá · 3 giàu. */
export const GRADE_LABEL: Readonly<Record<number, string>> = {
  0: 'cạn kiệt', 1: 'nghèo', 2: 'khá', 3: 'giàu',
};

/** Hệ số sản lượng theo bậc. Bậc 0 thì xưởng đứng không. */
export const GRADE_MULTIPLIER: Readonly<Record<number, number>> = { 0: 0, 1: 0.55, 2: 1, 3: 1.5 };

/** Bán kính mục tiêu của vùng, tính bằng ô. Biên thật vẫn bị địa mạo cắt. */
export const GRADE_RADIUS: Readonly<Record<number, number>> = { 0: 14, 1: 42, 2: 78, 3: 130 };

/** Trữ lượng của RIÊNG một bậc, tính bằng đơn vị sản vật. */
export function gradeReserve(grade: number): number {
  return ({ 0: 0, 1: 5200, 2: 17000, 3: 44000 } as Record<number, number>)[grade] ?? 0;
}

/**
 * TỔNG trữ lượng của một mỏ bậc `grade` — cộng dồn cả những bậc dưới nó.
 *
 * Bản cũ cho mỏ tụt bậc dần: đào hết 44.000 của bậc 3 thì rơi xuống bậc 2 và
 * được nạp lại 17.000, rồi 5.200. Bậc bây giờ CỐ ĐỊNH nên chuỗi ấy không còn,
 * nhưng tổng lượng moi lên được thì phải giữ nguyên — nếu không, mọi cái mỏ
 * trong game đột nhiên cạn sớm hơn một phần ba và cả đường cong kinh tế của
 * Phần 12 lệch đi mà không ai cố ý.
 */
export function mineralReserve(grade: number): number {
  let total = 0;
  for (let tier = 1; tier <= Math.min(3, Math.max(0, Math.round(grade))); tier++) total += gradeReserve(tier);
  return total;
}

// ---------------------------------------------------------------------------
// Tái sinh — chỉ vùng `tai-sinh`
// ---------------------------------------------------------------------------

/**
 * Rừng mọc lại bao nhiêu mỗi tuần, theo BẬC.
 *
 * Hiệu chuẩn theo một cái xưởng cưa: `bld_xuong-moc` rút 9 đơn vị mỗi tuần, mà
 * ở bậc 3 hệ số sản lượng là 1,5 — tức 13,5 đơn vị. Rừng bậc 3 mọc lại 16 một
 * tuần trước khi nhân mùa, và trung bình cả năm là chừng 14. Nghĩa là MỘT xưởng
 * cưa trên một khu rừng giàu thì bền vững, HAI cái thì không. Đó chính là cái
 * quyết định mà cơ chế này sinh ra để bắt người chơi phải cân nhắc.
 */
const REGEN_PER_GRADE: Readonly<Record<number, number>> = { 0: 0, 1: 5, 2: 10, 3: 16 };

/**
 * THỜI TIẾT. Mùa đông cây gần như đứng im, mùa xuân bật lên.
 *
 * Khoá là id mùa của `data/resources.json → labour.seasons`, cùng bộ mà
 * `seasonOfDate` trả về.
 */
export const SEASON_GROWTH: Readonly<Record<string, number>> = {
  xuan: 1.35, ha: 1.15, thu: 0.8, dong: 0.25,
};

/** Lượng hồi phục một tuần của một vùng tái sinh. Vùng khoáng sản luôn là 0. */
export function regenPerWeek(node: ResourceNode, seasonId: string): number {
  if (!isRenewable(node) || node.grade <= 0) return 0;
  const base = REGEN_PER_GRADE[node.grade] ?? 0;
  return base * (SEASON_GROWTH[seasonId] ?? 1);
}

/**
 * BAO LÂU THÌ ĐỔI BẬC — đo bằng tuần liên tục.
 *
 * Không đối xứng, và cố ý: phá thì nhanh, gây lại thì lâu. Mười năm chặt quá
 * tay là đủ để một khu rừng thưa hẳn đi; năm mươi năm giữ gìn mới đủ để nó dày
 * lên một bậc — dài hơn một đời người, nên đó là món quà một lãnh chúa để lại
 * cho cháu mình chứ không phải một khoản đầu tư ông ta kịp thu về.
 */
export const DECLINE_WEEKS = 10 * 52;
export const GROW_WEEKS = 50 * 52;

/** Số xưởng một vùng nuôi nổi cùng lúc — bằng đúng bậc của nó. */
export function nodeCapacity(node: ResourceNode): number {
  return Math.max(0, Math.min(3, node.grade));
}

// ---------------------------------------------------------------------------
// Kiểu dữ liệu
// ---------------------------------------------------------------------------

export interface NodePoint {
  x: number;
  y: number;
}

export interface ResourceNode {
  /** `nd_*` — duy nhất trong một thành trì. */
  id: string;
  zone: NodeZone;
  /** Tâm vùng, toạ độ ô. */
  at: NodePoint;
  /** Bán kính mục tiêu lúc sinh; biên thật nằm ở `coverage`. */
  size: number;
  /**
   * 0–3.
   *
   * Với vùng KHOÁNG SẢN đây là một con số CỐ ĐỊNH suốt đời cái mỏ — nó không
   * bao giờ tụt, mỏ chỉ hết. Với vùng TÁI SINH nó lên xuống theo `strain`.
   */
  grade: number;
  /** Trữ lượng còn lại. Với khoáng sản, hết là vùng biến mất khỏi bản đồ. */
  left: number;
  /**
   * CÁN CÂN GIỮ GÌN, đo bằng TUẦN LIÊN TỤC, chỉ có nghĩa với vùng tái sinh.
   *
   * Dương là số tuần liên tiếp rừng mọc nhanh hơn mức bị chặt; âm là số tuần
   * liên tiếp ngược lại. Đổi dấu là ĐẶT LẠI VỀ 0 — "duy trì được năm mươi năm"
   * nghĩa là năm mươi năm liền, không phải năm mươi năm cộng dồn từ những quãng
   * đứt đoạn. Một mùa chặt quá tay xoá sạch công giữ rừng của mấy chục năm, và
   * đó đúng là cách một khu rừng phản ứng.
   */
  strain: number;
  /** Đa giác biên, toạ độ ô. Ít hơn 3 đỉnh thì lùi về hình tròn bán kính `size`. */
  coverage: NodePoint[];
  /** Id thực thể công trình đang khai thác vùng này. */
  workedBy: string[];
}

// ---------------------------------------------------------------------------
// Vùng cấm
// ---------------------------------------------------------------------------

/** Nền thành đã dọn sẵn — không mỏ nào được mọc vào sân của toà chính. */
export function inKeepYard(x: number, y: number, pad = 0): boolean {
  return Math.hypot(x - CENTER_CELL, y - CENTER_CELL) <= KEEP_YARD_CELLS + pad;
}

function distanceToSegment(x: number, y: number, a: NodePoint, b: NodePoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(x - a.x, y - a.y);
  const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / lengthSquared));
  return Math.hypot(x - (a.x + dx * t), y - (a.y + dy * t));
}

/**
 * Hành lang trống hai bên một tuyến tường.
 *
 * Một bức tường có chân móng, có đường tuần và có bãi trống bên ngoài để không
 * ai nấp được — nên một cái mỏ mọc sát chân tường là chuyện không xảy ra. Quan
 * trọng hơn: khi người chơi vạch một tuyến tường mới cắt qua một mạch cũ, mạch
 * ấy phải LÙI RA, chứ không phải nằm chết dưới nền tường và biến mất khỏi bản đồ.
 */
export const WALL_CLEARANCE_CELLS = 14;

export interface WallLike {
  points: readonly NodePoint[];
  level: number;
}

export function nearWallLine(walls: readonly WallLike[] | undefined, x: number, y: number, pad = 0): boolean {
  for (const wall of walls ?? []) {
    const halfWidth = 1.5 + wall.level * 0.7;
    const clearance = WALL_CLEARANCE_CELLS + halfWidth + pad;
    for (let index = 0; index < wall.points.length - 1; index++) {
      const a = wall.points[index];
      const b = wall.points[index + 1];
      if (a === undefined || b === undefined) continue;
      if (distanceToSegment(x, y, a, b) <= clearance) return true;
    }
  }
  return false;
}

function reserved(walls: readonly WallLike[] | undefined, x: number, y: number, pad = 0): boolean {
  return inKeepYard(x, y, pad) || nearWallLine(walls, x, y, pad);
}

// ---------------------------------------------------------------------------
// Sinh
// ---------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Loại vùng một khoảnh đất có thể sinh ra, và khả năng nó sinh ra thật.
 *
 * Tổng xác suất của một loại đất chính là khả năng khoảnh đất ấy có mỏ; phần
 * còn lại là đất trống. Đồng bằng và đất tốt gần như không có mỏ — đúng như
 * thực tế, và đó cũng là lý do một thành trì trên đồng bằng giàu lương thực
 * nhưng phải MUA sắt.
 */
const ZONE_CHANCE: Readonly<Record<string, readonly { zone: NodeZone; p: number }[]>> = {
  rung: [{ zone: 'rung-go', p: 0.78 }],
  'da-goc': [{ zone: 'via-da', p: 0.7 }, { zone: 'mach-sat', p: 0.12 }],
  'mo-sat': [{ zone: 'mach-sat', p: 0.82 }],
  doi: [{ zone: 'via-da', p: 0.3 }, { zone: 'mach-sat', p: 0.14 }, { zone: 'dong-co', p: 0.18 }],
  dam: [{ zone: 'ruong-muoi', p: 0.62 }],
  'dat-can': [{ zone: 'dong-co', p: 0.34 }],
  'dat-tot': [{ zone: 'dong-co', p: 0.1 }],
};

/** Giàu thì hiếm, nghèo thì đầy — như mọi cái mỏ ngoài đời. */
function rollGrade(r: number): number {
  if (r < 0.14) return 3;
  if (r < 0.14 + 0.31) return 2;
  return 1;
}

function pickZone(rows: readonly { zone: NodeZone; p: number }[], roll: number): NodeZone | null {
  let remaining = roll;
  for (const row of rows) {
    if (remaining < row.p) return row.zone;
    remaining -= row.p;
  }
  return null;
}

/**
 * Biên vùng dựng bằng CÁCH BẮN TIA: 32 tia toả ra từ tâm, mỗi tia đi cho tới khi
 * gặp đất không hợp, gặp nước sai loại, gặp vùng cấm hay mép lưới rồi dừng.
 *
 * Kết quả là một đa giác bám theo địa mạo thay vì một hình tròn dán lên bản đồ —
 * khu rừng có hình của khu rừng, và mép nó dừng đúng ở chỗ cây thưa dần.
 */
export function nodeCoverage(
  field: HoldingField,
  zone: NodeZone,
  x: number,
  y: number,
  radius: number,
  salt: number,
  walls?: readonly WallLike[],
): NodePoint[] {
  const def = NODE_ZONE_DEFS[zone];
  const allowed = new Set(def.terrain);
  const points: NodePoint[] = [];
  const rays = 32;

  for (let index = 0; index < rays; index++) {
    const angle = (index / rays) * Math.PI * 2;
    // Bán kính mục tiêu rung theo góc, nếu không thì mọi vùng đều là đa giác đều
    // 32 cạnh và nhìn ra ngay là hình học chứ không phải địa lý.
    const wobble = 0.82 + 0.18 * Math.sin(index * 2.37 + salt * 0.017) + 0.1 * Math.cos(index * 4.11 + salt * 0.031);
    const target = Math.max(10, radius * wobble);
    const step = Math.max(3, radius / 12);

    let reach = 0;
    for (let distance = step; distance <= target; distance += step) {
      const px = x + Math.cos(angle) * distance;
      const py = y + Math.sin(angle) * distance;
      if (px < 4 || py < 4 || px >= GRID_CELLS - 4 || py >= GRID_CELLS - 4) break;
      if (reserved(walls, px, py, 4)) break;
      const id = terrainAt(field, px, py);
      if (!allowed.has(id)) break;
      reach = distance;
    }
    points.push({ x: Math.round(x + Math.cos(angle) * reach), y: Math.round(y + Math.sin(angle) * reach) });
  }
  return points;
}

function makeNode(id: string, zone: NodeZone, x: number, y: number, grade: number, size: number, coverage: NodePoint[]): ResourceNode {
  return {
    id, zone,
    at: { x: Math.round(x), y: Math.round(y) },
    size, grade,
    // Vùng tái sinh mang trữ lượng của ĐÚNG bậc nó (cái rừng đang đứng đó);
    // vùng khoáng sản mang tổng cộng dồn — xem `mineralReserve`.
    left: NODE_ZONE_DEFS[zone].renewal === 'tai-sinh' ? gradeReserve(grade) : mineralReserve(grade),
    coverage,
    workedBy: [],
    strain: 0,
  };
}

/** Bao nhiêu điểm một thành trì được có. Nhiều hơn là bản đồ thành một tấm thảm mỏ. */
export const NODE_LIMIT = 34;

/**
 * SINH toàn bộ điểm của một thành trì từ mảnh đất của nó. Tất định theo hạt
 * giống — cùng thành trì thì cùng bản đồ mỏ, ván nào cũng vậy.
 */
export function generateNodes(field: HoldingField): ResourceNode[] {
  const rnd = mulberry32(field.seed ^ 0x9e3779b9);
  const out: ResourceNode[] = [];

  // Rải kiểu lưới có nhiễu (jitter grid): phân bố đều khắp mảnh đất mà không
  // xếp thành hàng lối nhìn ra ngay.
  const step = 96;
  const slots = Math.floor(GRID_CELLS / step);

  for (let sy = 0; sy < slots; sy++) {
    for (let sx = 0; sx < slots; sx++) {
      const x = Math.floor((sx + 0.18 + rnd() * 0.64) * step);
      const y = Math.floor((sy + 0.18 + rnd() * 0.64) * step);
      if (inKeepYard(x, y, 12)) continue;

      const id = terrainAt(field, x, y);
      if (isWaterTerrain(id)) continue;

      const rows = ZONE_CHANCE[id];
      if (rows === undefined || rows.length === 0) continue;
      const zone = pickZone(rows, rnd());
      if (zone === null) continue;

      const grade = rollGrade(rnd());
      const size = Math.round((GRADE_RADIUS[grade] ?? 42) * (0.9 + rnd() * 0.2));
      const coverage = nodeCoverage(field, zone, x, y, size, field.seed + sx * 31 + sy * 67);
      // Một vùng bị địa mạo cắt cụt tới mức không còn ruột thì không phải một
      // cái mỏ, nó là một cái chấm. Bỏ đi thay vì để người chơi xây xưởng lên
      // rồi mới phát hiện chẳng có gì để đào.
      if (polygonArea(coverage) < 400) continue;
      out.push(makeNode(`nd_${String(sx)}-${String(sy)}`, zone, x, y, grade, size, coverage));
    }
  }

  // Sông và biển là vùng tài nguyên nằm TRÊN mặt nước; xưởng cá đứng ở bờ, sát
  // biên vùng, nên vùng phải có tâm ở giữa dòng chứ không phải trên cạn.
  for (let index = 30; index < field.river.length - 1; index += 64) {
    const point = field.river[index];
    if (point === undefined) continue;
    if (inKeepYard(point.x, point.y, 8)) continue;
    const grade = rollGrade(rnd());
    const size = GRADE_RADIUS[grade] ?? 42;
    out.push(makeNode(
      `nd_song-${String(index)}`, 'bai-ca', point.x, point.y, grade, size,
      nodeCoverage(field, 'bai-ca', point.x, point.y, size, field.seed + index),
    ));
  }

  if (field.coastal) {
    let placed = 0;
    for (let a = 0; a < 24 && placed < 2; a++) {
      const angle = (a / 24) * Math.PI * 2;
      for (let d = CENTER_CELL * 0.3; d < CENTER_CELL * 0.95; d += 24) {
        const x = CENTER_CELL + Math.cos(angle) * d;
        const y = CENTER_CELL + Math.sin(angle) * d;
        if (x < 0 || y < 0 || x >= GRID_CELLS || y >= GRID_CELLS) break;
        if (terrainAt(field, x, y) !== 'bien') continue;
        const grade = rollGrade(rnd());
        const size = GRADE_RADIUS[grade] ?? 42;
        out.push(makeNode(`nd_bien-${String(a)}`, 'bai-ca', x, y, grade, size, nodeCoverage(field, 'bai-ca', x, y, size, a)));
        placed++;
        break;
      }
    }
  }

  return partitionCoverages(cap(guaranteeStarterNodes(out, field), field.seed));
}

/**
 * BỐN MẠCH MỘT CÁI THÔN PHẢI VỚI TỚI ĐƯỢC.
 *
 * `field.ts` đã bảo đảm có RỪNG, ĐÁ và SẮT trong tầm với của cấp 1. Nhưng địa
 * hình có mà mạch không có thì vẫn khoá chết y hệt: xưởng mộc là công trình duy
 * nhất sinh ra gỗ, và nó phải đứng TRÊN một vùng rừng. Lưới gieo mạch lấy mẫu
 * mỗi 96 ô, nên một khoảnh rừng nhỏ hoàn toàn có thể lọt qua giữa hai mẫu.
 *
 * Nên sau khi gieo, kiểm lại: thiếu loại nào thì cắm một mạch NGHÈO vào đúng
 * khoảnh đất hợp lệ gần thành nhất. Nghèo chứ không giàu — hạn mức này để mở
 * một vòng khoá, không phải để tặng quà.
 */
const STARTER_ZONES: readonly NodeZone[] = ['rung-go', 'via-da', 'mach-sat'];

function guaranteeStarterNodes(nodes: ResourceNode[], field: HoldingField): ResourceNode[] {
  const reach = planningRadiusCells(1);
  const out = [...nodes];

  for (const zone of STARTER_ZONES) {
    const has = out.some(
      (node) => node.zone === zone && node.grade > 0
        && Math.hypot(node.at.x - CENTER_CELL, node.at.y - CENTER_CELL) <= reach + node.size,
    );
    if (has) continue;
    // Sắt cũng ra từ ruộng muối (sắt đầm) — có cái này thì không cần cái kia.
    if (zone === 'mach-sat' && out.some((node) => node.zone === 'ruong-muoi' && node.grade > 0)) continue;

    const spot = scanForTerrain(field, NODE_ZONE_DEFS[zone].terrain, reach, out);
    if (spot === null) continue;
    const size = GRADE_RADIUS[1] ?? 42;
    out.push(makeNode(
      `nd_moi-${zone}`, zone, spot.x, spot.y, 1, size,
      nodeCoverage(field, zone, spot.x, spot.y, size, field.seed),
    ));
  }
  return out;
}

/** Khoảnh đất hợp lệ gần tâm thành nhất — quét vòng tròn loang dần ra. */
function scanForTerrain(
  field: HoldingField,
  allowed: readonly string[],
  reach: number,
  taken: readonly ResourceNode[],
): NodePoint | null {
  const set = new Set(allowed);
  for (let ring = KEEP_YARD_CELLS + 24; ring <= reach; ring += 12) {
    const slots = Math.max(12, Math.round((2 * Math.PI * ring) / 12));
    for (let index = 0; index < slots; index++) {
      const angle = (index / slots) * Math.PI * 2;
      const x = Math.round(CENTER_CELL + Math.cos(angle) * ring);
      const y = Math.round(CENTER_CELL + Math.sin(angle) * ring);
      if (x < 20 || y < 20 || x >= GRID_CELLS - 20 || y >= GRID_CELLS - 20) continue;
      if (!set.has(terrainAt(field, x, y))) continue;
      if (taken.some((node) => Math.hypot(node.at.x - x, node.at.y - y) < 28)) continue;
      return { x, y };
    }
  }
  return null;
}

/** Giữ lại `NODE_LIMIT` điểm, chọn tất định để chúng rải khắp chứ không dồn về phía bắc. */
function cap(nodes: ResourceNode[], seed: number): ResourceNode[] {
  if (nodes.length <= NODE_LIMIT) return nodes;
  const rnd = mulberry32(seed ^ 0x6a09e667);
  const ranked = nodes.map((node) => ({ node, rank: rnd() })).sort((a, b) => a.rank - b.rank);
  const keep = new Set(ranked.slice(0, NODE_LIMIT).map((row) => row.node.id));
  return nodes.filter((node) => keep.has(node.id));
}

// ---------------------------------------------------------------------------
// Cắt vùng chồng nhau
// ---------------------------------------------------------------------------

/** Cắt một đa giác theo nửa mặt phẳng gần `owner` hơn `other` — một bước Voronoi. */
function clipToNearest(polygon: NodePoint[], owner: ResourceNode, other: ResourceNode, gap: number): NodePoint[] {
  if (polygon.length < 3) return polygon;
  const dx = other.at.x - owner.at.x;
  const dy = other.at.y - owner.at.y;
  const distance = Math.hypot(dx, dy);
  if (distance < 0.001) return [];

  const nx = dx / distance;
  const ny = dy / distance;
  const mx = (owner.at.x + other.at.x) / 2;
  const my = (owner.at.y + other.at.y) / 2;
  // Mỗi bên lùi nửa khe khỏi trung tuyến, nên giữa hai vùng còn một dải đất
  // trống hẹp — nhìn ra được là hai vùng khác nhau, không phải một khối liền.
  const limit = -gap / 2;
  const signed = (point: NodePoint): number => (point.x - mx) * nx + (point.y - my) * ny;
  const inside = (point: NodePoint): boolean => signed(point) <= limit + 1e-7;

  const output: NodePoint[] = [];
  for (let index = 0; index < polygon.length; index++) {
    const start = polygon[index];
    const end = polygon[(index + 1) % polygon.length];
    if (start === undefined || end === undefined) continue;
    const startIn = inside(start);
    const endIn = inside(end);
    if (startIn && endIn) {
      output.push(end);
      continue;
    }
    if (startIn === endIn) continue;
    const s0 = signed(start);
    const s1 = signed(end);
    const denominator = s1 - s0;
    const t = Math.abs(denominator) < 1e-9 ? 0 : (limit - s0) / denominator;
    const cut = {
      x: start.x + (end.x - start.x) * Math.max(0, Math.min(1, t)),
      y: start.y + (end.y - start.y) * Math.max(0, Math.min(1, t)),
    };
    if (startIn) output.push(cut);
    else output.push(cut, end);
  }
  return output;
}

/** MUTATE: cắt mọi vùng theo Voronoi có khe, nên không ô đất nào thuộc hai chủ. */
export function partitionCoverages(nodes: ResourceNode[], gap = 8): ResourceNode[] {
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (node === undefined) continue;
    let polygon = [...node.coverage];
    for (let j = 0; j < nodes.length && polygon.length >= 3; j++) {
      if (i === j) continue;
      const other = nodes[j];
      if (other === undefined) continue;
      const distance = Math.hypot(other.at.x - node.at.x, other.at.y - node.at.y);
      if (distance > node.size * 2 + other.size * 2 + gap) continue;
      polygon = clipToNearest(polygon, node, other, gap);
    }
    node.coverage = polygon.length >= 3
      ? polygon.map((point) => ({ x: Math.round(point.x), y: Math.round(point.y) }))
      : [{ ...node.at }, { ...node.at }, { ...node.at }];
  }
  return nodes;
}

// ---------------------------------------------------------------------------
// Truy vấn
// ---------------------------------------------------------------------------

function polygonArea(polygon: readonly NodePoint[]): number {
  if (polygon.length < 3) return 0;
  let twice = 0;
  for (let index = 0; index < polygon.length; index++) {
    const a = polygon[index];
    const b = polygon[(index + 1) % polygon.length];
    if (a === undefined || b === undefined) continue;
    twice += a.x * b.y - b.x * a.y;
  }
  return Math.abs(twice) / 2;
}

/** Diện tích vùng, quy ra km² — con số sổ mỏ hiện ra cho người chơi. */
export function nodeAreaKm2(node: ResourceNode): number {
  const cells = node.coverage.length >= 3 ? polygonArea(node.coverage) : Math.PI * node.size * node.size;
  return (cells * CELL_M * CELL_M) / 1_000_000;
}

export function pointInNode(node: ResourceNode, x: number, y: number): boolean {
  const polygon = node.coverage;
  if (polygon.length < 3) return Math.hypot(node.at.x - x, node.at.y - y) <= node.size;
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

/** Vùng nằm dưới một khuôn viên `[x, y, size]`. */
export function nodesUnder(nodes: readonly ResourceNode[], x: number, y: number, size: number): ResourceNode[] {
  const cx = x + size / 2;
  const cy = y + size / 2;
  const probes: readonly [number, number][] = [
    [cx, cy], [x, y], [x + size, y], [x, y + size], [x + size, y + size],
  ];
  return nodes.filter((node) => {
    if (probes.some(([px, py]) => pointInNode(node, px, py))) return true;
    if (!NODE_ZONE_DEFS[node.zone].water) return false;
    // Bến cá và ruộng muối đứng TRÊN BỜ vẫn tính là chạm vùng nước — không ai
    // dựng nhà giữa dòng, và một luật đòi thế sẽ khoá luôn cả nghề cá.
    return probes.some(([px, py]) => node.coverage.some((point, index) => {
      const next = node.coverage[(index + 1) % node.coverage.length] ?? point;
      return distanceToSegment(px, py, point, next) <= 24;
    }));
  });
}

/** Vùng còn nhận thêm xưởng không. */
export function nodeHasRoom(node: ResourceNode): boolean {
  return node.grade > 0 && node.workedBy.length < nodeCapacity(node);
}

/** Vùng hợp nhất cho một công trình cần một trong các sản vật `wanted`. */
export function bestNodeFor(
  nodes: readonly ResourceNode[],
  wanted: readonly string[],
  x: number,
  y: number,
  size: number,
): ResourceNode | null {
  const under = nodesUnder(nodes, x, y, size).filter(
    (node) => nodeHasRoom(node) && wanted.some((id) => nodeYields(node, id) > 0),
  );
  if (under.length === 0) return null;
  return [...under].sort((a, b) => b.grade - a.grade)[0] ?? null;
}

/** Tỉ lệ một sản vật trong thành phần của vùng. 0 là vùng này không có nó. */
export function nodeYields(node: ResourceNode, resourceId: string): number {
  if (node.zone === resourceId) return 1;
  return NODE_ZONE_DEFS[node.zone].yields[resourceId] ?? 0;
}

/** Phần sản lượng tốt nhất trong nhóm sản vật mà một công trình chấp nhận. */
export function nodeShare(node: ResourceNode | null, wanted: readonly string[]): number {
  if (node === null) return 1;
  return Math.max(0, ...wanted.map((id) => nodeYields(node, id)));
}

/** Hệ số sản lượng của một công trình theo vùng nó đang bám. */
export function nodeMultiplier(node: ResourceNode | null): number {
  if (node === null) return 1;
  return GRADE_MULTIPLIER[node.grade] ?? 0;
}

export function nodeById(nodes: readonly ResourceNode[], id: string): ResourceNode | null {
  if (id === '') return null;
  return nodes.find((node) => node.id === id) ?? null;
}

// ---------------------------------------------------------------------------
// Khai thác
// ---------------------------------------------------------------------------

/**
 * Rút trữ lượng sau một tuần khai thác. Hết trữ lượng của bậc hiện tại thì TỤT
 * MỘT BẬC — giàu thành khá, khá thành nghèo, nghèo thành cạn — và vùng bao phủ
 * CO LẠI theo.
 *
 * Vùng co lại là chỗ đáng nói: một mạch sắp cạn nhìn thấy được trên bản đồ trước
 * khi nó cạn hẳn. Người chơi có mấy năm để tìm mỏ mới, và đó là một cảnh báo có
 * hình chứ không phải một dòng chữ đỏ hiện ra lúc đã muộn.
 *
 * MUTATE `node`.
 */
/** Co giãn biên vùng khi bậc đổi. MUTATE node. */
function resizeToGrade(node: ResourceNode, fromGrade: number): void {
  const oldRadius = GRADE_RADIUS[fromGrade] ?? 1;
  const newRadius = GRADE_RADIUS[node.grade] ?? GRADE_RADIUS[0] ?? 14;
  const ratio = Math.max(0.08, newRadius / oldRadius);
  node.size = Math.max(GRADE_RADIUS[0] ?? 14, Math.round(node.size * ratio));
  node.coverage = node.coverage.map((point) => ({
    x: Math.round(node.at.x + (point.x - node.at.x) * ratio),
    y: Math.round(node.at.y + (point.y - node.at.y) * ratio),
  }));
}

/** Chuyện đã xảy ra với một vùng trong một tuần. */
export interface NodeTick {
  /** Vùng đã cạn hẳn và phải biến mất khỏi bản đồ. */
  exhausted: boolean;
  /** Bậc vừa đổi: `+1` dày lên, `-1` thưa đi, `0` giữ nguyên. */
  gradeShift: number;
  /** Câu tiếng Việt cho nhật ký. Rỗng khi không có gì đáng kể. */
  note: string;
}

const QUIET: NodeTick = { exhausted: false, gradeShift: 0, note: '' };

/**
 * MỘT TUẦN CỦA MỘT VÙNG. MUTATE node.
 *
 * Hai luật hoàn toàn khác nhau, rẽ ngay ở dòng đầu:
 *
 * **KHOÁNG SẢN** — trừ đi phần vừa đào, hết là hết. Không tụt bậc, không thoi
 * thóp: đào lên tấn cuối cùng thì cái mỏ biến mất. Bậc của một vỉa quặng là một
 * sự thật địa chất, không phải một thanh máu.
 *
 * **TÁI SINH** — cộng phần mọc lại (theo bậc × mùa), trừ phần bị chặt, kẹp trần
 * ở trữ lượng của bậc. Rồi so hai con số ấy: tuần nào mọc kịp thì `strain` nhích
 * lên, tuần nào không thì nhích xuống, và ĐỔI DẤU LÀ ĐẶT LẠI VỀ 0. Đủ mười năm
 * liên tục thâm hụt thì thưa đi một bậc; đủ năm mươi năm liên tục thặng dư thì
 * dày lên một bậc.
 */
export function tickNode(node: ResourceNode, drawn: number, seasonId: string): NodeTick {
  if (node.grade <= 0) return { exhausted: true, gradeShift: 0, note: '' };
  const taken = Math.max(0, drawn);

  if (!isRenewable(node)) {
    if (taken <= 0) return QUIET;
    node.left = Math.max(0, node.left - taken);
    if (node.left > 0) return QUIET;
    node.grade = 0;
    return {
      exhausted: true,
      gradeShift: 0,
      note: `${NODE_ZONE_DEFS[node.zone].name} đã moi tới tấn cuối cùng — vùng này hết.`,
    };
  }

  const regen = regenPerWeek(node, seasonId);
  node.left = Math.max(0, Math.min(gradeReserve(node.grade), node.left + regen - taken));

  // Tuần này rừng mọc kịp phần bị chặt hay không. Hoà cũng tính là kịp — giữ
  // đúng mức thay thế là đã đủ bền vững, không cần phải hơn.
  const surplus = regen >= taken;
  if (surplus) node.strain = node.strain < 0 ? 1 : node.strain + 1;
  else node.strain = node.strain > 0 ? -1 : node.strain - 1;

  if (node.strain <= -DECLINE_WEEKS) {
    const from = node.grade;
    node.grade = Math.max(0, node.grade - 1);
    node.strain = 0;
    node.left = Math.min(node.left, gradeReserve(node.grade));
    if (node.grade <= 0) {
      return {
        exhausted: true,
        gradeShift: -1,
        note: `${NODE_ZONE_DEFS[node.zone].name} bị chặt tới trơ đất — không còn gì mọc lại.`,
      };
    }
    resizeToGrade(node, from);
    return {
      exhausted: false,
      gradeShift: -1,
      note: `${NODE_ZONE_DEFS[node.zone].name} thưa đi sau mười năm khai thác quá mức — nay chỉ còn hạng ${GRADE_LABEL[node.grade] ?? '?'}.`,
    };
  }

  if (node.strain >= GROW_WEEKS && node.grade < 3) {
    const from = node.grade;
    node.grade += 1;
    node.strain = 0;
    resizeToGrade(node, from);
    return {
      exhausted: false,
      gradeShift: 1,
      note: `${NODE_ZONE_DEFS[node.zone].name} dày lên sau năm mươi năm giữ gìn — nay đã là hạng ${GRADE_LABEL[node.grade] ?? '?'}.`,
    };
  }

  // Đã kịch trần bậc 3 thì không tích thêm nữa, để `strain` khỏi trôi vô hạn.
  if (node.grade >= 3 && node.strain > GROW_WEEKS) node.strain = GROW_WEEKS;
  return QUIET;
}

/**
 * Một tuần cho CẢ BẢNG mạch, trả về danh sách đã bỏ những vùng cạn.
 *
 * Trả mảng mới thay vì mutate tại chỗ, vì đây là chỗ vùng BIẾN MẤT — và một
 * hàm xoá phần tử khỏi mảng của người gọi là một hàm sẽ làm hỏng một thứ gì đó
 * ở lần sửa thứ ba. `drawn` khoá theo id vùng, đơn vị bằng đơn vị sản vật.
 */
export function tickNodes(
  nodes: readonly ResourceNode[],
  drawn: Readonly<Record<string, number>>,
  seasonId: string,
): { nodes: ResourceNode[]; removed: string[]; notes: string[] } {
  const kept: ResourceNode[] = [];
  const removed: string[] = [];
  const notes: string[] = [];

  for (const row of nodes) {
    const node: ResourceNode = {
      ...row,
      at: { ...row.at },
      coverage: row.coverage.map((point) => ({ ...point })),
      workedBy: [...row.workedBy],
    };
    const result = tickNode(node, drawn[node.id] ?? 0, seasonId);
    if (result.note !== '') notes.push(result.note);
    if (result.exhausted) {
      removed.push(node.id);
      continue;
    }
    kept.push(node);
  }

  return { nodes: kept, removed, notes };
}

/** Gắn hoặc nhả một công trình khỏi vùng. MUTATE danh sách. */
export function bindNode(nodes: ResourceNode[], buildingEntityId: string, nodeId: string): void {
  for (const node of nodes) {
    node.workedBy = node.workedBy.filter((id) => id !== buildingEntityId);
  }
  const node = nodeById(nodes, nodeId);
  if (node !== null && node.workedBy.length < nodeCapacity(node)) node.workedBy.push(buildingEntityId);
}

// ---------------------------------------------------------------------------
// Bảo đảm bảng mỏ có trong state
// ---------------------------------------------------------------------------

/**
 * Sinh lại bảng mỏ nếu chưa có, và VÁ nó nếu đã có.
 *
 * Idempotent, và cố ý: hàm này chạy lúc tạo thành trì, lúc nạp save cũ, lúc
 * người chơi vừa vạch xong một tuyến tường mới. Nó KHÔNG BAO GIỜ khôi phục một
 * mạch mà người chơi đã đào cạn — cái cạn là lịch sử, không phải lỗi.
 */
export function ensureNodes(field: HoldingField, existing: readonly ResourceNode[], walls?: readonly WallLike[]): ResourceNode[] {
  if (existing.length === 0) return relocateAll(generateNodes(field), field, walls);

  const nodes = existing.map((node) => ({ ...node, at: { ...node.at }, coverage: node.coverage.map((p) => ({ ...p })), workedBy: [...node.workedBy] }));
  return relocateAll(nodes, field, walls);
}

/**
 * Đẩy mọi mạch nằm trong vùng cấm ra chỗ hợp lệ gần nhất, rồi vẽ lại biên.
 *
 * Bắt đầu dò TỪ VỊ TRÍ CŨ chứ không phải từ tâm thành: một mạch vừa bị tuyến
 * tường mới cắt qua chỉ nên lùi ra vài chục thước, không nên nhảy sang nửa kia
 * mảnh đất và làm người chơi tưởng mình mất mỏ.
 */
function relocateAll(nodes: ResourceNode[], field: HoldingField, walls?: readonly WallLike[]): ResourceNode[] {
  const settled: ResourceNode[] = [];

  for (const node of nodes) {
    let placed = node;
    if (reserved(walls, node.at.x, node.at.y, 8)) {
      const moved = findFreeSpot(node, field, settled, walls);
      // Không còn chỗ an toàn thì mạch coi như đã cạn: thà mất một cái mỏ còn
      // hơn để hai thực thể đè lên nhau và UI chỉ vào một chỗ không có gì.
      placed = moved ?? { ...node, grade: 0, left: 0 };
    }
    placed.coverage = nodeCoverage(field, placed.zone, placed.at.x, placed.at.y, placed.size, field.seed + settled.length * 97, walls);
    settled.push(placed);
  }

  return partitionCoverages(settled);
}

function findFreeSpot(
  node: ResourceNode,
  field: HoldingField,
  taken: readonly ResourceNode[],
  walls?: readonly WallLike[],
): ResourceNode | null {
  const def = NODE_ZONE_DEFS[node.zone];
  const allowed = new Set(def.terrain);
  let hash = 0;
  for (let index = 0; index < node.id.length; index++) hash = (hash * 31 + node.id.charCodeAt(index)) >>> 0;
  const baseAngle = ((hash % 360) * Math.PI) / 180;

  for (let radius = 24; radius < CENTER_CELL * 0.8; radius += 24) {
    for (let turn = 0; turn < 16; turn++) {
      const angle = baseAngle + (turn / 16) * Math.PI * 2;
      const x = Math.round(node.at.x + Math.cos(angle) * radius);
      const y = Math.round(node.at.y + Math.sin(angle) * radius);
      if (x < 20 || y < 20 || x >= GRID_CELLS - 20 || y >= GRID_CELLS - 20) continue;
      if (reserved(walls, x, y, 8)) continue;
      if (!allowed.has(terrainAt(field, x, y))) continue;
      if (taken.some((other) => Math.hypot(other.at.x - x, other.at.y - y) < 32)) continue;
      return { ...node, at: { x, y } };
    }
  }
  return null;
}

/** Điểm nằm trong bán kính quy hoạch của một cấp — cái người chơi với tới được. */
export function nodesInReach(nodes: readonly ResourceNode[], rank: number): ResourceNode[] {
  const radius = planningRadiusCells(rank);
  return nodes.filter((node) => Math.hypot(node.at.x - CENTER_CELL, node.at.y - CENTER_CELL) <= radius + node.size);
}

/** Một dòng mô tả để UI hiện và để AI đọc. */
export function describeNode(node: ResourceNode): string {
  const def = NODE_ZONE_DEFS[node.zone];
  const state = node.grade <= 0 ? 'đã cạn' : GRADE_LABEL[node.grade] ?? '?';
  const worked = node.workedBy.length > 0 ? `, ${String(node.workedBy.length)} xưởng đang khai thác` : ', chưa ai động tới';
  return `${def.name} (${state}, ${nodeAreaKm2(node).toFixed(2)} km²)${worked}`;
}
