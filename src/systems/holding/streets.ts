/**
 * MẠNG ĐƯỜNG TẤT ĐỊNH — hình hài của một nơi được xây dần qua nhiều đời.
 *
 * Một thành trì không phải một bàn cờ. Trước khi có ai xây gì thì đã có một con
 * đường đi ngang qua chỗ ấy, và thành mọc lên VÌ con đường ấy chứ không ngược
 * lại. Cho nên quan lộ ở đây không dừng ở cổng thành: nó vào từ mép lưới bên
 * này, đi xuyên qua thành, rồi tiếp tục ra mép lưới bên kia. Thành trì chỉ là
 * một điểm nằm trên đường.
 *
 * ---
 *
 * BA LỚP, VÀ CHÚNG PHỤ THUỘC VÀO NHỮNG THỨ KHÁC NHAU — đây là chỗ đáng đọc kỹ:
 *
 *  1. **Quan lộ và ngõ vòng cung** suy từ `seed` và BÁN KÍNH QUY HOẠCH, không
 *     từ danh sách công trình. Nghĩa là xây thêm một cái lò rèn KHÔNG làm con
 *     đường cái dịch đi, và lên cấp cũng không. Bản gốc mà file này tham khảo
 *     phải lưu cả mạng đường vào save đúng vì nó trộn công trình vào phép sinh;
 *     tách ra thì cái kho ấy biến mất, và cùng với nó là mọi cách hai nguồn sự
 *     thật nói lệch nhau.
 *  2. **Ngõ nối** từ từng công trình ra trục gần nhất thì CÓ phụ thuộc công
 *     trình, và phải thế: dựng một cái xưởng ở góc tây thì phải có lối đi tới
 *     nó. Ngõ nối đánh id theo id công trình nên vẫn ổn định.
 *  3. **Cổng** không nằm trong file này. Cổng là chỗ một con đường cắt qua một
 *     tuyến tường, và tuyến tường là thứ NGƯỜI CHƠI vạch — xem `gatesOn()`.
 *     Đường có trước, tường có sau, và chỗ chúng gặp nhau là cái cổng. Suy cổng
 *     từ một vòng tròn bán kính chung là cách chắc chắn để cổng nằm ở chỗ không
 *     có tường nào cả.
 *
 * KHÔNG MỘT BYTE NÀO CỦA FILE NÀY ĐI VÀO SAVE. Thứ duy nhất được lưu là danh
 * sách id những tuyến người chơi đã cho phá (`streetsRazed`), và id ổn định
 * được là nhờ mục 1 ở trên.
 */

import { terrainOf } from './data';
import { isWaterTerrain, sampleField, terrainAt, type HoldingField } from './field';
import { CENTER_CELL, GRID_CELLS, cellsToMetres } from './scale';
import { standingWalls, type WallLine } from './walls';
import type { Cell } from './types';

// ---------------------------------------------------------------------------
// Kiểu dữ liệu
// ---------------------------------------------------------------------------

/** Một tuyến đường trên mặt bản đồ. Toạ độ Ô, không làm tròn — đường thì cong. */
export interface Street {
  /** Ổn định theo `seed` và bán kính, hoặc theo id công trình với ngõ nối. */
  id: string;
  name: string;
  kind: StreetKind;
  points: Cell[];
}

/**
 * BA LOẠI, và KHÔNG có "đường lớn".
 *
 * Bản đầu sinh ba tới bốn tuyến xuyên bản đồ: một quan lộ cộng mấy "đường lớn".
 * Nhìn thì thấy ngay là sai — bốn con đường cùng cỡ cắt nhau ở giữa một cái
 * thôn tám chục nóc nhà là hình của một nút giao hiện đại, không phải hình của
 * một nơi mọc lên bên VỆ một con đường. Một thôn có ĐÚNG một con đường đi qua;
 * cái phân nhánh ra bốn phía là việc của ngõ.
 */
export type StreetKind = 'quan-lo' | 'ngo' | 'ngo-noi';

/** Bề rộng danh nghĩa của từng loại, tính bằng Ô — dùng cả khi vẽ lẫn khi đo. */
export const STREET_WIDTH: Readonly<Record<StreetKind, number>> = {
  'quan-lo': 2.4,
  ngo: 0.8,
  'ngo-noi': 0.5,
};

export const STREET_KIND_NAMES: Readonly<Record<StreetKind, string>> = {
  'quan-lo': 'Quan lộ',
  ngo: 'Ngõ',
  'ngo-noi': 'Ngõ nối',
};

/** Chỗ một con đường bắc qua dòng nước. */
export interface Bridge {
  id: string;
  at: Cell;
  /** Góc con đường đi qua, radian. */
  angle: number;
  /** Bề ngang mặt nước tại chỗ bắc, tính bằng ô. */
  span: number;
}

/**
 * CỔNG THÀNH — chỗ một con đường xuyên qua một tuyến tường.
 *
 * Không phải dữ liệu lưu, cũng không phải dữ liệu sinh: là một phép GIAO giữa
 * hai thứ đã có. Phá bức tường đi thì cái cổng biến mất cùng nó, đúng như đời.
 */
export interface Gate {
  id: string;
  at: Cell;
  /** Góc pháp tuyến của tường tại chỗ ấy — hướng ra ngoài. */
  angle: number;
  /** Cổng trên một quan lộ là cổng chính. */
  main: boolean;
  streetId: string;
  wallId: string;
}

export interface StreetNetwork {
  seed: number;
  /** Bán kính quy hoạch lúc sinh, tính bằng ô. */
  radius: number;
  /** Quan lộ chạy hết bản đồ. */
  highways: Street[];
  /** Ngõ vòng cung trong thành. */
  lanes: Street[];
  bridges: Bridge[];
}

// ---------------------------------------------------------------------------
// Nhiễu tất định
// ---------------------------------------------------------------------------

function hash1(n: number, seed: number): number {
  let h = Math.imul(n | 0, 374761393) ^ Math.imul(seed | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Nhiễu một chiều TRƠN VÀ KHÉP VÒNG — dùng làm độ uốn theo góc. */
function loopNoise(t: number, seed: number, periods: number): number {
  const p = t * periods;
  const i = Math.floor(p);
  const f = p - i;
  const smooth = f * f * (3 - 2 * f);
  const a = hash1(((i % periods) + periods) % periods, seed);
  const b = hash1((((i + 1) % periods) + periods) % periods, seed);
  return a + (b - a) * smooth;
}

// ---------------------------------------------------------------------------
// Đất đi được
// ---------------------------------------------------------------------------

/**
 * Nước theo nghĩa của ĐƯỜNG SÁ, rộng hơn `isWaterTerrain`.
 *
 * Suối và đầm không chặn được một bức tường (thợ đóng cọc là qua) nhưng chúng
 * chặn một con đường đi bộ, và một con đường vẽ thẳng qua đầm lầy là thứ người
 * chơi nhìn một cái là biết bản đồ đang nói dối.
 */
function isWet(terrainId: string): boolean {
  return isWaterTerrain(terrainId) || terrainId === 'suoi' || terrainId === 'dam';
}

function walkable(field: HoldingField, x: number, y: number): boolean {
  const id = terrainAt(field, x, y);
  if (isWet(id)) return false;
  return terrainOf(id)?.buildable ?? false;
}

// ---------------------------------------------------------------------------
// Sinh mạng đường
// ---------------------------------------------------------------------------

/** Bao nhiêu hướng được thử khi rải quan lộ quanh thành. */
const SECTORS = 128;

const CACHE = new Map<string, StreetNetwork>();
const CACHE_LIMIT = 12;

/**
 * MẠNG ĐƯỜNG TRỤC của một mảnh đất.
 *
 * `radius` làm tròn về bội số 20 ô trước khi vào khoá cache, và đó không phải
 * một mẹo tiết kiệm: lên cấp nới bán kính thêm vài chục ô, và nếu mỗi ô nới ra
 * lại sinh một mạng đường khác thì "lên cấp" sẽ có nghĩa là "cả thành phố dời
 * chỗ". Bậc thang thô làm con đường đứng yên qua phần lớn các lần lên cấp, và
 * khi nó có đổi thì đổi một lần rõ ràng chứ không trôi từng chút.
 */
export function streetNetwork(field: HoldingField, radiusCells: number): StreetNetwork {
  const radius = Math.max(60, Math.round(radiusCells / 20) * 20);
  const key = `${String(field.seed)}|${String(radius)}`;
  const hit = CACHE.get(key);
  if (hit !== undefined) return hit;

  const seed = field.seed;
  const highways = makeHighways(field, radius, seed);
  const lanes = makeLanes(field, radius, seed);
  const bridges = findBridges(field, [...highways, ...lanes]);

  const network: StreetNetwork = { seed, radius, highways, lanes, bridges };
  CACHE.set(key, network);
  if (CACHE.size > CACHE_LIMIT) {
    const oldest = CACHE.keys().next().value;
    if (oldest !== undefined) CACHE.delete(oldest);
  }
  return network;
}

export function clearStreetCache(): void {
  CACHE.clear();
}

const COMPASS = ['Đông', 'Đông Nam', 'Nam', 'Tây Nam', 'Tây', 'Tây Bắc', 'Bắc', 'Đông Bắc'] as const;

function compassName(angle: number): string {
  const index = Math.round(((angle % (Math.PI * 2)) + Math.PI * 2) / (Math.PI / 4)) % 8;
  return `Đường ${COMPASS[index] ?? 'Đông'}`;
}

/**
 * QUAN LỘ — MỘT tuyến, chạy từ mép lưới bên này qua tâm sang mép lưới bên kia.
 *
 * Một, không phải ba hay bốn. Nhiều tuyến cùng cỡ cắt nhau giữa thành cho ra
 * hình một nút giao chứ không phải hình một nơi mọc lên bên vệ đường, và ở mức
 * nhìn toàn cảnh chúng nuốt mất mọi thứ khác trên bản đồ. Muốn rẽ nhánh thì đã
 * có ngõ, và ngõ thì mảnh hơn hẳn.
 *
 * Chọn hướng bằng cách chấm điểm từng cung: đất bên ngoài đi được thì cộng
 * nhiều, gặp nước thì trừ nặng, cộng thêm một nhúm nhiễu để hai thành trì cùng
 * địa hình vẫn không có con đường giống hệt nhau.
 */
function makeHighways(field: HoldingField, radius: number, seed: number): Street[] {
  let best = -1;
  let bestScore = -Infinity;

  for (let sector = 0; sector < SECTORS; sector += 2) {
    const angle = (sector / SECTORS) * Math.PI * 2;
    // Nếm đất ở ba quãng dọc hướng ấy, không chỉ một điểm: một con đường tốt
    // là con đường đi được suốt chặng, không phải con đường có mét đầu đẹp.
    // Nếm cả HAI CHIỀU, vì tuyến này chạy xuyên qua chứ không dừng ở tâm.
    let score = hash1(sector, seed + 900) * 30;
    for (const reach of [radius * 0.8, radius * 1.3, radius * 1.9]) {
      for (const sign of [1, -1]) {
        const x = CENTER_CELL + Math.cos(angle) * reach * sign;
        const y = CENTER_CELL + Math.sin(angle) * reach * sign;
        score += walkable(field, x, y) ? 40 : -70;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      best = sector;
    }
  }

  if (best < 0) return [];

  const angle = (best / SECTORS) * Math.PI * 2;
  // Hai nhánh ngược chiều nhau, nối lại thành MỘT tuyến liền đi qua tâm. Vẽ hai
  // polyline riêng rồi chồng lên nhau là cách bản cũ tạo ra thứ trông như một
  // con đường cụt nằm đè lên quan lộ.
  const forward = runOut(field, angle, radius, seed + 300);
  const backward = runOut(field, angle + Math.PI, radius, seed + 700);
  return [
    {
      id: 'hw0',
      name: compassName(angle),
      kind: 'quan-lo',
      points: [...backward.slice(1).reverse(), { x: CENTER_CELL, y: CENTER_CELL }, ...forward.slice(1)],
    },
  ];
}

/**
 * Một nhánh chạy từ tâm ra tới mép lưới, uốn theo địa thế.
 *
 * Đường lách chỗ không đi được nhưng KHÔNG lách sông: bước sau sẽ tìm ra chỗ
 * cắt và bắc cầu ở đó. Biển thì dừng hẳn — bờ biển là chỗ đường bộ hết, và cái
 * đi tiếp từ đó là một con tàu.
 */
function runOut(field: HoldingField, heading: number, radius: number, salt: number): Cell[] {
  const points: Cell[] = [{ x: CENTER_CELL, y: CENTER_CELL }];
  let x = CENTER_CELL;
  let y = CENTER_CELL;
  let angle = heading;
  const step = 22;

  for (let index = 0; index < 160; index++) {
    const probeX = x + Math.cos(angle) * step * 1.6;
    const probeY = y + Math.sin(angle) * step * 1.6;
    const ahead = terrainAt(field, probeX, probeY);
    if (ahead === 'bien') break;

    const bend = (loopNoise(index / 44, salt, 9) - 0.5) * 0.24;
    const dodge = !isWet(ahead) && (terrainOf(ahead)?.buildable ?? false) === false ? 0.34 : 0;
    angle += bend * 0.35 + dodge * (hash1(index + salt, field.seed) > 0.5 ? 1 : -1);

    // Giữ hướng chung. Không có hạn này thì nhiễu tích lại và con đường quay
    // ngược về chính chỗ nó vừa đi qua.
    const drift = Math.atan2(Math.sin(angle - heading), Math.cos(angle - heading));
    if (Math.abs(drift) > 0.5) angle = heading + Math.sign(drift) * 0.5;

    x += Math.cos(angle) * step;
    y += Math.sin(angle) * step;
    points.push({ x, y });
    if (x < -20 || y < -20 || x > GRID_CELLS + 20 || y > GRID_CELLS + 20) break;
    // Trong vùng quy hoạch đường đi thẳng hơn; ra ngoài thì tha hồ uốn.
    if (Math.hypot(x - CENTER_CELL, y - CENTER_CELL) < radius * 0.35) angle = heading;
  }
  return points;
}

/**
 * NGÕ VÒNG CUNG — hai cung đứt đoạn cắt ngang các trục.
 *
 * Không khép kín, và cố ý không: một vành đai tròn trịa là dấu hiệu của quy
 * hoạch một lần, còn thành trì thì mọc dần. Hai cung lệch tâm, lệch bán kính,
 * lệch cả góc mở, và chúng cắt các quan lộ ở những chỗ không đối xứng.
 */
function makeLanes(field: HoldingField, radius: number, seed: number): Street[] {
  const lanes: Street[] = [];
  const fractions = [0.44, 0.72];

  for (let index = 0; index < fractions.length; index++) {
    const fraction = fractions[index] ?? 0.5;
    const start = hash1(index * 13 + 1, seed + 61) * Math.PI * 2;
    const sweep = (0.55 + hash1(index * 17 + 3, seed + 83) * 0.85) * Math.PI;
    const points: Cell[] = [];

    for (let step = 0; step <= 22; step++) {
      const angle = start + (sweep * step) / 22;
      const wobble = 0.9 + 0.2 * loopNoise(step / 22, seed + 61 + index, 5);
      const reach = radius * fraction * wobble;
      const x = CENTER_CELL + Math.cos(angle) * reach;
      const y = CENTER_CELL + Math.sin(angle) * reach;
      points.push({ x, y });
    }

    // Cung nào nằm gần trọn dưới nước thì bỏ — thà không có ngõ ở hướng ấy còn
    // hơn có một con ngõ chạy giữa lòng sông.
    const dry = points.filter((point) => walkable(field, point.x, point.y)).length;
    if (dry < points.length * 0.5) continue;

    lanes.push({ id: `ln${String(index)}`, name: `Ngõ vòng ${String(index + 1)}`, kind: 'ngo', points });
  }
  return lanes;
}

/**
 * CẦU — đúng chỗ một con đường cắt qua dòng nước, không phải chỗ nào cho đẹp.
 *
 * Đo bề ngang mặt nước tại chỗ cắt để lấy nhịp cầu: một cái cầu bắc qua con
 * suối và một cái bắc qua khúc sông cái không được vẽ bằng nhau, vì chúng không
 * tốn bằng nhau và không sập giống nhau.
 */
function findBridges(field: HoldingField, streets: readonly Street[]): Bridge[] {
  const bridges: Bridge[] = [];
  const placed: Cell[] = [];

  for (const street of streets) {
    for (let index = 0; index < street.points.length - 1; index++) {
      const a = street.points[index];
      const b = street.points[index + 1];
      if (a === undefined || b === undefined) continue;
      const steps = Math.max(2, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 8));
      let bridged = false;

      for (let t = 0; t < steps && !bridged; t++) {
        const f = t / steps;
        const x = a.x + (b.x - a.x) * f;
        const y = a.y + (b.y - a.y) * f;
        if (sampleField(field.riverF, x, y) < 0.5) continue;
        if (placed.some((point) => Math.hypot(point.x - x, point.y - y) < 70)) {
          bridged = true;
          continue;
        }

        const angle = Math.atan2(b.y - a.y, b.x - a.x);
        let span = 8;
        for (let reach = 4; reach < 140; reach += 4) {
          const near = sampleField(field.riverF, x + Math.cos(angle) * reach, y + Math.sin(angle) * reach);
          const far = sampleField(field.riverF, x - Math.cos(angle) * reach, y - Math.sin(angle) * reach);
          span = reach * 2;
          if (near < 0.35 && far < 0.35) break;
        }

        placed.push({ x, y });
        bridges.push({
          id: `br_${street.id}_${String(index)}`,
          at: { x, y },
          angle,
          span: Math.min(span, 150),
        });
        bridged = true;
      }
    }
  }
  return bridges;
}

// ---------------------------------------------------------------------------
// Ngõ nối — lớp DUY NHẤT phụ thuộc vào công trình
// ---------------------------------------------------------------------------

/** Một khuôn viên cần lối đi. Chỉ cần tâm và một id ổn định. */
export interface StreetStop {
  id: string;
  at: Cell;
}

/** Xa hơn chừng này thì thôi, không kéo một con ngõ xuyên qua cánh đồng. */
const CONNECT_REACH = 420;

/**
 * NGÕ NỐI từ từng công trình ra trục gần nhất.
 *
 * Ngõ bẻ một khúc ở giữa chứ không đi thẳng: một mạng lưới toàn đoạn thẳng nối
 * tâm–tâm trông như sơ đồ mạch điện, còn một khúc quẹo nhỏ lệch theo id công
 * trình thì trông như một cái ngõ.
 */
export function connectorLanes(network: StreetNetwork, stops: readonly StreetStop[]): Street[] {
  const trunk: Cell[] = [];
  for (const street of [...network.highways, ...network.lanes]) trunk.push(...street.points);
  if (trunk.length === 0) return [];

  const lanes: Street[] = [];
  for (const stop of stops) {
    let nearest: Cell = { x: CENTER_CELL, y: CENTER_CELL };
    let bestDistance = Infinity;
    for (const point of trunk) {
      const distance = (point.x - stop.at.x) ** 2 + (point.y - stop.at.y) ** 2;
      if (distance < bestDistance) {
        bestDistance = distance;
        nearest = point;
      }
    }
    if (bestDistance > CONNECT_REACH * CONNECT_REACH) continue;
    if (bestDistance < 36) continue; // đã đứng ngay mặt đường rồi

    const jitter = (hash1(Math.round(stop.at.x + stop.at.y), network.seed + 1700) - 0.5) * 0.35;
    const midX = (stop.at.x + nearest.x) / 2 - (stop.at.y - nearest.y) * jitter;
    const midY = (stop.at.y + nearest.y) / 2 + (stop.at.x - nearest.x) * jitter;

    lanes.push({
      id: `cn_${stop.id}`,
      name: 'Ngõ nối',
      kind: 'ngo-noi',
      points: [{ ...stop.at }, { x: midX, y: midY }, { ...nearest }],
    });
  }
  return lanes;
}

// ---------------------------------------------------------------------------
// Cổng — giao của đường và tường
// ---------------------------------------------------------------------------

/**
 * CỔNG THÀNH là chỗ một con đường xuyên qua một tuyến tường đã dựng xong.
 *
 * Chỉ xét tường ĐÃ DỰNG XONG: một tuyến còn đang xây thì chưa chắn được ai, và
 * vẽ một cái cổng lên nó là hứa một thứ chưa có. Cổng trên quan lộ là cổng
 * chính — chính là cái cổng đoàn quân sẽ gõ vào.
 */
export function gatesOn(streets: readonly Street[], walls: readonly WallLine[]): Gate[] {
  const gates: Gate[] = [];
  const standing = standingWalls(walls);

  for (const wall of standing) {
    for (const street of streets) {
      if (street.kind === 'ngo-noi') continue;
      const crossing = firstCrossing(street.points, wall.points);
      if (crossing === null) continue;
      gates.push({
        id: `gate_${wall.id}_${street.id}`,
        at: crossing.at,
        angle: crossing.angle,
        main: street.kind === 'quan-lo',
        streetId: street.id,
        wallId: wall.id,
      });
    }
  }
  return gates;
}

interface Crossing {
  at: Cell;
  /** Pháp tuyến của tường, hướng ra xa tâm. */
  angle: number;
}

function firstCrossing(street: readonly Cell[], wall: readonly Cell[]): Crossing | null {
  for (let i = 0; i < street.length - 1; i++) {
    const a = street[i];
    const b = street[i + 1];
    if (a === undefined || b === undefined) continue;
    for (let j = 0; j < wall.length - 1; j++) {
      const c = wall[j];
      const d = wall[j + 1];
      if (c === undefined || d === undefined) continue;
      const at = segmentCross(a, b, c, d);
      if (at === null) continue;
      // Pháp tuyến của ĐOẠN TƯỜNG, lật cho hướng ra ngoài. Cái cổng phải quay
      // mặt ra phía đồng, không quay vào trong sân.
      let angle = Math.atan2(d.x - c.x, -(d.y - c.y));
      const outward = Math.atan2(at.y - CENTER_CELL, at.x - CENTER_CELL);
      if (Math.cos(angle - outward) < 0) angle += Math.PI;
      return { at, angle };
    }
  }
  return null;
}

/** Giao của hai đoạn thẳng, hoặc `null` nếu chúng không cắt nhau. */
function segmentCross(a: Cell, b: Cell, c: Cell, d: Cell): Cell | null {
  const rx = b.x - a.x;
  const ry = b.y - a.y;
  const sx = d.x - c.x;
  const sy = d.y - c.y;
  const denominator = rx * sy - ry * sx;
  if (Math.abs(denominator) < 1e-9) return null;
  const t = ((c.x - a.x) * sy - (c.y - a.y) * sx) / denominator;
  const u = ((c.x - a.x) * ry - (c.y - a.y) * rx) / denominator;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { x: a.x + rx * t, y: a.y + ry * t };
}

// ---------------------------------------------------------------------------
// Đo đạc
// ---------------------------------------------------------------------------

/** Chiều dài một tuyến, tính bằng ô. */
export function streetLength(points: readonly Cell[]): number {
  let total = 0;
  for (let index = 0; index < points.length - 1; index++) {
    const a = points[index];
    const b = points[index + 1];
    if (a === undefined || b === undefined) continue;
    total += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return total;
}

/** Khoảng cách từ một điểm tới tuyến gần nhất — dùng khi bấm chọn trên bản đồ. */
export function distanceToStreet(point: Cell, points: readonly Cell[]): number {
  let best = Infinity;
  for (let index = 0; index < points.length - 1; index++) {
    const a = points[index];
    const b = points[index + 1];
    if (a === undefined || b === undefined) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSquared = dx * dx + dy * dy;
    const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared));
    best = Math.min(best, Math.hypot(point.x - (a.x + dx * t), point.y - (a.y + dy * t)));
  }
  return best;
}

/**
 * Một điểm nằm dọc tuyến, cách đầu tuyến `distance` ô, kèm góc đi tới.
 *
 * Dùng để đặt TÊN ĐƯỜNG nằm dọc theo chính con đường thay vì thả một cái nhãn
 * lơ lửng cạnh nó — cách duy nhất để bốn cái tên trên một bản đồ không chồng
 * lên nhau thành một đống chữ.
 */
export function pointAlong(points: readonly Cell[], distance: number): { at: Cell; angle: number } | null {
  let walked = 0;
  for (let index = 0; index < points.length - 1; index++) {
    const a = points[index];
    const b = points[index + 1];
    if (a === undefined || b === undefined) continue;
    const segment = Math.hypot(b.x - a.x, b.y - a.y);
    if (walked + segment >= distance) {
      const f = segment === 0 ? 0 : (distance - walked) / segment;
      return {
        at: { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f },
        angle: Math.atan2(b.y - a.y, b.x - a.x),
      };
    }
    walked += segment;
  }
  return null;
}

/** Câu mô tả một tuyến, cho nhật ký và bảng tra cứu. */
export function describeStreet(street: Street): string {
  const metres = Math.round(cellsToMetres(streetLength(street.points)));
  return `${street.name} — ${STREET_KIND_NAMES[street.kind]}, dài ${String(metres)} thước`;
}
