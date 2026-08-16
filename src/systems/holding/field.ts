/**
 * ĐỊA HÌNH THÀNH TRÌ — TRƯỜNG LIÊN TỤC, SINH TẤT ĐỊNH.
 *
 * "Địa hình vi mô là hình chiếu của địa hình vĩ mô." Một thành trì nằm trong một
 * nút của `data/world-map.json`, và cái nút ấy đã khai địa hình lớn của nó là
 * đồi, là đầm lầy hay là bờ biển. File này nhận đúng ba dữ kiện — địa hình lớn,
 * có ven biển không, một HẠT GIỐNG — và dựng ra cả một vùng đất 6 km rộng.
 *
 * BỐN LÝ DO NÓ KHÔNG PHẢI LÀ MỘT LƯỚI Ô NỮA:
 *
 *  1. **Không lưu vào save.** Cùng hạt giống thì luôn ra cùng một mảnh đất, nên
 *     giữ lại 1 200² ô trong file save là giữ một thứ tính lại được trong mười
 *     mili giây. Bản cũ lưu `tiles[]`; đó là hàng nghìn con số phải đi qua
 *     schema, qua migration, qua mọi lần ghi đĩa, để nói một điều mà một số
 *     nguyên 32 bit đã nói đủ.
 *  2. **Không có góc vuông.** Mọi thứ ở đây là TRƯỜNG: độ cao, độ ẩm, biển,
 *     sông. Ranh giới giữa rừng và đồng là chỗ hai trường cắt nhau, nên nó lượn.
 *     Bản cũ tung xúc xắc từng ô rồi "smear" cho đỡ lốm đốm — và kết quả vẫn là
 *     một bàn cờ, vì một ô thì hoặc là rừng hoặc không, không có ở giữa.
 *  3. **Sông là một DÒNG.** Nó chảy từ mép lưới về chỗ trũng, uốn khúc, chỗ
 *     thắt chỗ loe. Điều đó làm câu "cối xay kề sông" có nghĩa hình học thật:
 *     có một tuyến chạy qua thành, và đặt cối xay ở đâu dọc tuyến ấy là một
 *     quyết định. Ở bản cũ "sông" là vài ô rải rác, và câu ấy chỉ có nghĩa số học.
 *  4. **Độ cao có thật.** Tường trên đồi khó trèo hơn, tháp trên đồi nhìn xa
 *     hơn — hai câu đã nằm sẵn trong `data/resources.json` mà bản cũ không có
 *     cách nào thực thi, vì không ô nào biết mình cao bao nhiêu.
 *
 * Mã địa hình trả về là ĐÚNG mã trong `data/resources.json → terrain`, nên cả
 * `labour.ts`, `adjacency.ts` và `fortify.ts` đọc được mà không phải đổi từ vựng.
 */

import { CELLS_PER_SAMPLE, CENTER_CELL, FIELD_RES, GRID_CELLS, KEEP_YARD_CELLS, planningRadiusCells } from './scale';

// ---------------------------------------------------------------------------
// Nhiễu tất định
// ---------------------------------------------------------------------------

function hash2(x: number, y: number, seed: number): number {
  let n = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 2246822519);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

/** Quintic smoothstep — đạo hàm liên tục, nên trường không có nếp gấp. */
function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function valueNoise(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = fade(x - x0);
  const fy = fade(y - y0);
  const a = hash2(x0, y0, seed);
  const b = hash2(x0 + 1, y0, seed);
  const c = hash2(x0, y0 + 1, seed);
  const d = hash2(x0 + 1, y0 + 1, seed);
  const top = a + (b - a) * fx;
  const bottom = c + (d - c) * fx;
  return top + (bottom - top) * fy;
}

function fbm(x: number, y: number, seed: number, octaves = 4): number {
  let value = 0;
  let amplitude = 0.5;
  let frequency = 1;
  let norm = 0;
  for (let index = 0; index < octaves; index++) {
    value += amplitude * valueNoise(x * frequency, y * frequency, seed + index * 1013);
    norm += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return value / norm;
}

/**
 * BÓP MÉO MIỀN. Lấy toạ độ đem đi hỏi nhiễu, nhưng hỏi ở một chỗ đã bị chính
 * nhiễu khác đẩy lệch đi. Không có bước này thì mọi đường viền là những vòng
 * tròn méo hiền lành; có nó thì rìa cụm núi lởm chởm và mép rừng có ngón tay
 * thò ra thụt vào, đúng như một rìa thật.
 */
function warp(x: number, y: number, seed: number, amount: number): [number, number] {
  const wx = x + amount * (fbm(x * 0.6 + 11.3, y * 0.6 + 3.1, seed + 7717, 3) - 0.5);
  const wy = y + amount * (fbm(x * 0.6 - 5.7, y * 0.6 + 9.4, seed + 9133, 3) - 0.5);
  return [wx, wy];
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hạt giống suy từ id — một thành trì không có hạt giống vẫn phải ra đúng một mảnh đất. */
export function seedFromId(id: string): number {
  let h = 2166136261;
  for (let index = 0; index < id.length; index++) {
    h ^= id.charCodeAt(index);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// ---------------------------------------------------------------------------
// Tính cách của địa hình lớn
// ---------------------------------------------------------------------------

/**
 * Một dòng trong bảng dưới là câu trả lời cho "đất ở đây trông ra sao".
 *
 * `elevBias` nâng cả nền lên, `relief` kéo giãn chênh lệch cao thấp, `wet` và
 * `forest` đẩy ngưỡng đầm và rừng, `riverChance` là khả năng có một dòng chảy
 * qua, `cliffs` cho phép sinh vách đá lộ thiên, `arable` là phần đất cày được
 * quanh thành.
 */
export interface TerrainProfile {
  elevBias: number;
  relief: number;
  wet: number;
  forest: number;
  riverChance: number;
  cliffs: boolean;
  arable: number;
  /** Địa hình mặc định khi không phép phân loại nào bắt được. */
  fallback: string;
}

/**
 * Từ vựng ở KHOÁ là địa hình VĨ MÔ của `data/world-map.json` (Phần 13 và bản đồ
 * thế giới nói bằng thứ tiếng ấy); từ vựng ở GIÁ TRỊ là địa hình VI MÔ của
 * `data/resources.json` (thành trì nói bằng thứ tiếng này). Chỗ dịch giữa hai
 * tầng nằm đúng ở đây và chỉ ở đây.
 */
export const TERRAIN_PROFILES: Readonly<Record<string, TerrainProfile>> = {
  'dong-bang': { elevBias: 0, relief: 0.8, wet: 0, forest: 0, riverChance: 0.55, cliffs: false, arable: 0.58, fallback: 'dat-tot' },
  doi: { elevBias: 0.1, relief: 1.25, wet: -0.02, forest: 0.04, riverChance: 0.45, cliffs: false, arable: 0.36, fallback: 'dat-can' },
  nui: { elevBias: 0.26, relief: 1.7, wet: -0.05, forest: 0.02, riverChance: 0.35, cliffs: true, arable: 0.15, fallback: 'da-goc' },
  rung: { elevBias: 0.03, relief: 1, wet: 0.08, forest: 0.16, riverChance: 0.5, cliffs: false, arable: 0.3, fallback: 'rung' },
  'dam-lay': { elevBias: -0.12, relief: 0.55, wet: 0.3, forest: 0.03, riverChance: 0.9, cliffs: false, arable: 0.26, fallback: 'dam' },
  song: { elevBias: -0.05, relief: 0.7, wet: 0.14, forest: 0.03, riverChance: 1, cliffs: false, arable: 0.6, fallback: 'dat-tot' },
  'thao-nguyen': { elevBias: 0.02, relief: 0.7, wet: -0.12, forest: -0.06, riverChance: 0.3, cliffs: false, arable: 0.42, fallback: 'dat-can' },
  bien: { elevBias: -0.02, relief: 0.85, wet: 0.1, forest: 0, riverChance: 0.5, cliffs: false, arable: 0.4, fallback: 'dat-can' },
};

function profileOf(dominant: string): TerrainProfile {
  return TERRAIN_PROFILES[dominant] ?? TERRAIN_PROFILES['dong-bang'] ?? {
    elevBias: 0, relief: 0.8, wet: 0, forest: 0, riverChance: 0.55, cliffs: false, arable: 0.58, fallback: 'dat-tot',
  };
}

// ---------------------------------------------------------------------------
// Kiểu dữ liệu
// ---------------------------------------------------------------------------

/** Một điểm trên tim sông, toạ độ Ô. `w` là bề rộng dòng ở khúc ấy, cũng tính bằng ô. */
export interface RiverPoint {
  x: number;
  y: number;
  w: number;
}

/**
 * Thứ tự này là MÃ HOÁ: `kind[i]` giữ chỉ số trong mảng, nên đổi thứ tự là đổi
 * nghĩa của mọi trường đã cache. Thêm địa hình mới thì thêm vào CUỐI.
 */
export const TERRAIN_ORDER: readonly string[] = [
  'dat-tot', 'dat-can', 'song', 'suoi', 'doi', 'da-goc', 'mo-sat', 'rung', 'dam', 'bien',
];

const TERRAIN_INDEX: Readonly<Record<string, number>> = Object.fromEntries(
  TERRAIN_ORDER.map((id, index) => [id, index]),
);

export interface HoldingField {
  seed: number;
  /** Địa hình vĩ mô đã sinh ra mảnh đất này. */
  dominant: string;
  coastal: boolean;
  res: number;
  /** Chỉ số trong `TERRAIN_ORDER`, một byte mỗi mẫu. */
  kind: Uint8Array;
  /** 0–1 sau chuẩn hoá, cao dần vào lõi núi. */
  elev: Float32Array;
  moist: Float32Array;
  /** >0 là trong lòng sông; 1 ở tim dòng, tắt dần ra bờ. */
  riverF: Float32Array;
  /** >0 là ngoài biển. */
  seaF: Float32Array;
  river: RiverPoint[];
}

// ---------------------------------------------------------------------------
// Sinh
// ---------------------------------------------------------------------------

export interface FieldOptions {
  dominant?: string;
  coastal?: boolean;
  seed?: number;
  /**
   * GỢI Ý TỪ LỜI KỂ. Khi văn bản của AI nói thành trì "dựng bên sông" hay "dưới
   * chân núi", bản đồ phải chiều theo — nếu không thì hai nguồn sự thật nói hai
   * chuyện, và người chơi tin cái nào cũng sai. Lời kể THẮNG bảng tính cách:
   * đã nói có sông thì `riverChance` bằng 1, không thương lượng.
   */
  hints?: { river?: boolean; sea?: boolean; mountain?: boolean };
}

const CACHE = new Map<string, HoldingField>();
const CACHE_LIMIT = 16;

export function generateField(holdingId: string, options: FieldOptions = {}): HoldingField {
  const hints = options.hints ?? {};
  const dominant = options.dominant ?? 'dong-bang';
  const coastal = hints.sea === true ? true : (options.coastal ?? dominant === 'bien');
  const seed = (options.seed ?? seedFromId(holdingId)) >>> 0;

  const hintKey = `${hints.river === true ? 'r' : ''}${hints.sea === true ? 's' : ''}${hints.mountain === true ? 'm' : ''}`;
  const key = `${String(seed)}|${dominant}|${coastal ? 1 : 0}|${hintKey}`;
  const hit = CACHE.get(key);
  if (hit !== undefined) return hit;

  const profile = { ...profileOf(dominant) };
  if (hints.river === true) profile.riverChance = 1;
  if (hints.mountain === true) {
    profile.elevBias = Math.max(profile.elevBias, 0.18);
    profile.relief = Math.max(profile.relief, 1.35);
    profile.cliffs = true;
  }

  const field = build(seed, dominant, coastal, profile);
  CACHE.set(key, field);
  if (CACHE.size > CACHE_LIMIT) {
    const oldest = CACHE.keys().next().value;
    if (oldest !== undefined) CACHE.delete(oldest);
  }
  return field;
}

const R = FIELD_RES;

function build(seed: number, dominant: string, coastal: boolean, profile: TerrainProfile): HoldingField {
  const rnd = mulberry32(seed);

  const elev = new Float32Array(R * R);
  const moist = new Float32Array(R * R);
  const seaF = new Float32Array(R * R);
  const riverF = new Float32Array(R * R);
  const kind = new Uint8Array(R * R);

  // --- bờ biển: một nửa mặt phẳng, mép được nhiễu làm cong queo ---
  const coastAngle = rnd() * Math.PI * 2;
  const cdx = Math.cos(coastAngle);
  const cdy = Math.sin(coastAngle);
  const coastOffset = 0.32 + rnd() * 0.14;

  // --- độ cao & độ ẩm ---
  const elevFreq = 2.1 + rnd() * 0.8;
  const moistFreq = 2.6 + rnd() * 1;
  const raw = new Float32Array(R * R);

  for (let j = 0; j < R; j++) {
    for (let i = 0; i < R; i++) {
      const k = j * R + i;
      const u = i / R;
      const v = j / R;

      const [wx, wy] = warp(u * elevFreq, v * elevFreq, seed, 0.55);
      // Nền mềm cộng một chút sống núi: `1 - |2n - 1|` dựng lên những gờ sắc,
      // và chính chúng làm rìa cụm núi có răng cưa thay vì tròn như bát úp.
      const base = fbm(wx, wy, seed + 101, 5);
      const ridge = 1 - Math.abs(2 * fbm(wx * 1.7 + 4.2, wy * 1.7 - 2.6, seed + 233, 4) - 1);
      raw[k] = base * 0.74 + ridge * 0.26;

      const along = (u - 0.5) * cdx + (v - 0.5) * cdy;
      const wiggle = (fbm(u * 3.4 + 17.1, v * 3.4 - 8.3, seed + 401, 4) - 0.5) * 0.22;
      seaF[k] = coastal ? along - (coastOffset + wiggle) : -1;

      const [mx, my] = warp(u * moistFreq + 31.7, v * moistFreq + 12.9, seed + 555, 0.7);
      moist[k] = fbm(mx, my, seed + 677, 4) + profile.wet;
    }
  }

  // Chuẩn hoá độ cao theo phân vị của CHÍNH mảnh đất này trước khi áp tính cách
  // của vùng. Nhờ vậy ngưỡng "đồi" luôn nghĩa như nhau, không phụ thuộc vào việc
  // lần tung này nhiễu rơi vào dải cao hay dải thấp.
  const sample: number[] = [];
  for (let k = 0; k < raw.length; k += 5) sample.push(raw[k] ?? 0);
  sample.sort((a, b) => a - b);
  const lo = sample[Math.floor(sample.length * 0.04)] ?? 0;
  const hi = sample[Math.floor(sample.length * 0.96)] ?? 1;
  const span = Math.max(1e-4, hi - lo);

  for (let k = 0; k < raw.length; k++) {
    const n = Math.max(0, Math.min(1, ((raw[k] ?? 0) - lo) / span));
    let e = 0.5 + (n - 0.5) * profile.relief + profile.elevBias;
    // Thoải dần xuống mép nước — không có bước này thì bờ biển là một bậc thang.
    if (coastal && (seaF[k] ?? -1) > -0.12) e -= ((seaF[k] ?? 0) + 0.12) * 2.4;
    elev[k] = e;
  }

  // --- sông ---
  const river = profile.riverChance > rnd() ? carveRiver(seed, elev, seaF, coastal, rnd) : [];
  if (river.length > 0) stampRiver(riverF, river);

  // --- phân loại ---
  classify(kind, elev, moist, riverF, seaF, seed, coastal, profile);

  const field: HoldingField = { seed, dominant, coastal, res: R, kind, elev, moist, riverF, seaF, river };
  guaranteeStarterResources(field, profile);
  return field;
}

/**
 * PHÂN LOẠI — thứ tự các nhánh dưới đây LÀ luật ưu tiên, và nó có chủ ý.
 *
 * Nước thắng tất cả (không ai cày dưới lòng sông), rồi tới nền thành đã dọn sẵn,
 * rồi tới đá và đồi (địa hình cứng), rồi mới tới đầm và rừng (địa hình mềm), sau
 * cùng là đất. Đảo hai nhánh cuối lên trên thì mọi ngọn đồi có cây sẽ được ghi
 * là rừng, và cả thành trì mất chỗ lấy đá.
 */
function classify(
  kind: Uint8Array,
  elev: Float32Array,
  moist: Float32Array,
  riverF: Float32Array,
  seaF: Float32Array,
  seed: number,
  coastal: boolean,
  profile: TerrainProfile,
): void {
  const yardR = KEEP_YARD_CELLS / GRID_CELLS;
  const arableR = 0.1 + profile.arable * 0.34;

  for (let j = 0; j < R; j++) {
    for (let i = 0; i < R; i++) {
      const k = j * R + i;
      const u = i / R;
      const v = j / R;
      const dx = u - 0.5;
      const dy = v - 0.5;
      const distance = Math.hypot(dx, dy);
      const angle = Math.atan2(dy, dx);
      // Méo bán kính theo góc: rìa vùng ruộng và rìa nền thành lượn sóng chứ
      // không phải hai đường tròn hoàn hảo lồng nhau.
      const lobe = 0.72 + 0.56 * fbm(Math.cos(angle) * 1.6 + 40, Math.sin(angle) * 1.6 + 40, seed + 811, 3);

      const e = elev[k] ?? 0.5;
      const m = moist[k] ?? 0.5;

      let id: string;
      if (coastal && (seaF[k] ?? -1) > 0) id = 'bien';
      else if ((riverF[k] ?? 0) > 0.55) id = 'song';
      else if ((riverF[k] ?? 0) > 0.22) id = 'suoi';
      else if (distance < yardR * lobe) id = 'dat-can';
      else if (profile.cliffs && e > 0.93) id = 'da-goc';
      else if (e > 0.72) {
        // Vỉa sắt nằm TRONG vùng đồi núi, thành từng mạch hẹp — một dải nhiễu
        // tần cao đủ chật để nó là của hiếm, đúng như quặng thật.
        const seam = fbm(u * 11.3 + 71.1, v * 11.3 - 23.7, seed + 1907, 3);
        if (seam > 0.72) id = 'mo-sat';
        else if (seam < 0.3) id = 'da-goc';
        else id = 'doi';
      } else if (profile.wet > 0.12 && m > 0.52 && e < 0.5) id = 'dam';
      else if (m + profile.forest > 0.78 && e < 0.74) id = 'rung';
      else if (distance < arableR * lobe && e < 0.68) id = 'dat-tot';
      else if (e > 0.62 && fbm(u * 8.7 - 15.2, v * 8.7 + 44.9, seed + 2311, 3) > 0.74) id = 'da-goc';
      else if (m > 0.62 && e < 0.6) id = 'dat-tot';
      else id = profile.fallback;

      kind[k] = TERRAIN_INDEX[id] ?? 0;
    }
  }
}

// ---------------------------------------------------------------------------
// Bốn thứ một khu định cư PHẢI với tới được
// ---------------------------------------------------------------------------

/**
 * KHÔNG AI LẬP LÀNG Ở CHỖ KHÔNG CÓ ĐẤT, GỖ, ĐÁ VÀ MỘT ÍT SẮT.
 *
 * Đây là hạn mức mà bản cũ đặt trong `MIN_YIELD_SHARE`, và nó phải sống sót qua
 * cuộc đại tu này vì lý do sinh ra nó không hề đổi: mọi công trình đầu tiên đều
 * cần gỗ, mọi nguồn gỗ đều là công trình phải dựng bằng gỗ, và một thôn sinh ra
 * giữa bảy quả đồi trọc không phải là "khó" — nó BẤT KHẢ. Cối xay và lò rèn, hai
 * công trình bắt buộc để lên Trấn, đều đòi sắt; mà công trình duy nhất sinh sắt
 * là cái mỏ, và mỏ chỉ mở từ Trấn.
 *
 * Cái khác so với bản cũ là chỗ ĐẶT hạn mức: không bóp trọng số cho tới khi may
 * mắn xảy ra, mà DẬP một khoảnh đất vào đúng chỗ còn thiếu, ngay ngoài nền
 * thành, trong tầm với của một cái thôn. Cách này thành thật hơn và tất định —
 * cùng hạt giống vẫn ra cùng mảnh đất, chỉ là mảnh đất ấy chắc chắn sống được.
 */
/**
 * Số mẫu trường tối thiểu trong tầm với của cấp 1, cho từng thứ.
 *
 * Con số không phải là "có một chút cho có". Một khoảnh rừng hai chục thước
 * không nuôi nổi một xưởng cưa — khuôn viên xưởng đã rộng 70 thước, và bộ gieo
 * mạch lấy mẫu mỗi 96 ô nên nó còn chẳng nhìn thấy khoảnh ấy. Hạn mức phải đủ
 * lớn để RA MỘT CÁI MỎ LÀM VIỆC ĐƯỢC, nếu không thì nó chỉ làm bài test xanh
 * mà không mở được vòng khoá nào.
 *
 * `dat-tot` đứng đầu danh sách và những thứ sau không ghi đè lên thứ trước:
 * dập đất cày lên đúng cái khu rừng vừa bảo đảm là quay lại chỗ xuất phát.
 */
const STARTER_TERRAIN: readonly { id: string; minSamples: number }[] = [
  { id: 'dat-tot', minSamples: 80 },
  { id: 'rung', minSamples: 40 },
  { id: 'da-goc', minSamples: 30 },
  { id: 'mo-sat', minSamples: 14 },
];

function guaranteeStarterResources(field: HoldingField, profile: TerrainProfile): void {
  const radius = planningRadiusCells(1) / GRID_CELLS;
  const yard = KEEP_YARD_CELLS / GRID_CELLS;
  const rnd = mulberry32(field.seed ^ 0x5bf03635);
  const protectedCodes = new Set<number>();

  for (const want of STARTER_TERRAIN) {
    const code = TERRAIN_INDEX[want.id] ?? 0;
    let have = 0;
    for (let j = 0; j < R && have < want.minSamples; j++) {
      for (let i = 0; i < R; i++) {
        if (field.kind[j * R + i] !== code) continue;
        if (Math.hypot(i / R - 0.5, j / R - 0.5) > radius) continue;
        have++;
        if (have >= want.minSamples) break;
      }
    }
    // Đã có sẵn thì KHÔNG bảo lưu. Chỗ nào dư dả tự nhiên thì dập một khoảnh
    // rừng lên một góc của nó chẳng mất gì; bảo lưu cả những thứ đang dư là
    // cách chắc chắn để khoá luôn chỗ dập của thứ đang thiếu — trên một mảnh
    // đồng bằng thì đâu cũng là đất tốt, và khu rừng sẽ không có chỗ nào để mọc.
    if (have >= want.minSamples) continue;

    // Đầm lầy nhả ra sắt đầm (xem `data/resources.json`), nên một mảnh đất ướt
    // đã có sẵn nguồn sắt và không cần dập thêm một mạch quặng vào giữa bùn.
    if (want.id === 'mo-sat' && profile.wet > 0.2) continue;

    stampPatch(field, code, radius, yard, rnd, want.minSamples, protectedCodes);
    protectedCodes.add(code);
  }
}

/**
 * Dập một khoảnh địa hình vào chỗ trống gần nền thành nhất. Tất định theo `rnd`.
 *
 * Thử vài chỗ chứ không dập vào chỗ đầu tiên bốc được: khoảnh phải nằm trong
 * tầm với, không đè lên nước, và không đè lên một khoảnh vừa được bảo đảm.
 */
function stampPatch(
  field: HoldingField,
  code: number,
  radius: number,
  yard: number,
  rnd: () => number,
  samples: number,
  protectedCodes: ReadonlySet<number>,
): void {
  // Bán kính khoảnh suy từ số mẫu cần có, cộng một phần đệm cho phần rơi ra
  // ngoài lưới hoặc đè lên nước.
  const patch = Math.sqrt((samples * 1.9) / Math.PI) / R;

  let best: { cx: number; cy: number; free: number } | null = null;
  for (let attempt = 0; attempt < 12; attempt++) {
    const angle = rnd() * Math.PI * 2;
    const distance = yard + patch + (radius - yard - patch) * (0.2 + rnd() * 0.7);
    const cx = 0.5 + Math.cos(angle) * distance;
    const cy = 0.5 + Math.sin(angle) * distance;
    const free = freeShareAt(field, cx, cy, patch, protectedCodes);
    if (best === null || free > best.free) best = { cx, cy, free };
    if (free > 0.85) break;
  }
  if (best === null) return;

  for (let j = 0; j < R; j++) {
    for (let i = 0; i < R; i++) {
      const k = j * R + i;
      // Nước, nền thành và những khoảnh đã bảo đảm không bị ghi đè: một mạch
      // quặng giữa lòng sông chỉ đổi một ván chơi hỏng lấy một ván chơi vô lý.
      if (!writable(field, k, protectedCodes)) continue;
      const du = i / R - best.cx;
      const dv = j / R - best.cy;
      // Mép khoảnh được nhiễu làm nham nhở, nếu không nó là một cái đĩa tròn
      // nằm giữa đồng và nhìn ra ngay là bàn tay của engine.
      const edge = patch * (0.78 + 0.36 * fbm(i * 0.09 + 5.5, j * 0.09 - 2.2, field.seed + 3301, 3));
      if (Math.hypot(du, dv) > edge) continue;
      field.kind[k] = code;
    }
  }
}

function writable(field: HoldingField, index: number, protectedCodes: ReadonlySet<number>): boolean {
  const code = field.kind[index] ?? 0;
  if (protectedCodes.has(code)) return false;
  const id = TERRAIN_ORDER[code];
  return id !== 'song' && id !== 'bien' && id !== 'suoi';
}

/** Phần khoảnh đất ghi đè được, 0–1 — để chọn chỗ dập ít phá nhất. */
function freeShareAt(field: HoldingField, cx: number, cy: number, patch: number, protectedCodes: ReadonlySet<number>): number {
  let total = 0;
  let free = 0;
  const span = Math.ceil(patch * R);
  const ci = Math.round(cx * R);
  const cj = Math.round(cy * R);
  for (let j = cj - span; j <= cj + span; j++) {
    for (let i = ci - span; i <= ci + span; i++) {
      if (i < 0 || j < 0 || i >= R || j >= R) continue;
      if (Math.hypot(i / R - cx, j / R - cy) > patch) continue;
      total++;
      if (writable(field, j * R + i, protectedCodes)) free++;
    }
  }
  return total === 0 ? 0 : free / total;
}

// ---------------------------------------------------------------------------
// Sông
// ---------------------------------------------------------------------------

/**
 * Dòng chảy sinh bằng BƯỚC ĐI CÓ QUÁN TÍNH.
 *
 * Hướng đổi từ từ theo nhiễu tần thấp (khúc cong chỗ nhiều chỗ ít) CỘNG một lực
 * kéo về phía đất thấp, dò bằng cách nếm độ cao hai bên. Nên sông len theo thung
 * lũng thay vì cắt ngang đỉnh núi, và vì góc bẻ mỗi bước bị chặn nên nó không
 * bao giờ gãy thành một góc nhọn.
 */
function carveRiver(
  seed: number,
  elev: Float32Array,
  seaF: Float32Array,
  coastal: boolean,
  rnd: () => number,
): RiverPoint[] {
  const elevAt = (u: number, v: number): number => {
    const i = Math.max(0, Math.min(R - 1, Math.round(u * R)));
    const j = Math.max(0, Math.min(R - 1, Math.round(v * R)));
    return elev[j * R + i] ?? 0.5;
  };
  const inSea = (u: number, v: number): boolean => {
    if (!coastal) return false;
    const i = Math.max(0, Math.min(R - 1, Math.round(u * R)));
    const j = Math.max(0, Math.min(R - 1, Math.round(v * R)));
    return (seaF[j * R + i] ?? -1) > 0.02;
  };

  // Vào lưới từ một cạnh KHÔNG phải mặt biển — vào từ mặt biển thì dòng chết
  // ngay ở bước đầu và cả thành trì mất con sông của nó vì một lần tung xúc xắc.
  let u = 0.5;
  let v = 0;
  let found = false;
  for (let attempt = 0; attempt < 12 && !found; attempt++) {
    const edge = Math.floor(rnd() * 4);
    const t = 0.18 + rnd() * 0.64;
    u = edge === 0 ? t : edge === 1 ? 0.98 : edge === 2 ? t : 0.02;
    v = edge === 0 ? 0.02 : edge === 1 ? t : edge === 2 ? 0.98 : t;
    if (!inSea(u, v)) found = true;
  }
  if (!found) return [];

  let angle = Math.atan2(0.5 - v, 0.5 - u) + (rnd() - 0.5) * 0.7;
  const step = 0.012;
  const baseWidth = 7 + rnd() * 8;
  const out: RiverPoint[] = [];

  for (let index = 0; index < 260; index++) {
    if (index > 4 && (u < -0.05 || u > 1.05 || v < -0.05 || v > 1.05)) break;
    if (index > 6 && inSea(u, v)) {
      out.push({ x: u * GRID_CELLS, y: v * GRID_CELLS, w: baseWidth * 1.35 });
      break;
    }

    const meander = (fbm(index * 0.035, 3.3, seed + 1301, 3) - 0.5) * 1.9;
    const probe = 0.05;
    const left = elevAt(u + Math.cos(angle - 0.7) * probe, v + Math.sin(angle - 0.7) * probe);
    const right = elevAt(u + Math.cos(angle + 0.7) * probe, v + Math.sin(angle + 0.7) * probe);
    const descent = (left - right) * 1.6;

    // Ba mươi bước đầu bị kéo vào trong lưới, sau đó thả cho uốn tự do. Không có
    // lực kéo ấy thì phần lớn dòng liếm qua một góc lưới rồi đi mất, và thành
    // trì ở giữa chẳng bao giờ chạm tới nước.
    let pull = 0;
    if (index < 30) {
      let delta = Math.atan2(0.5 - v, 0.5 - u) - angle;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      pull = delta * (0.24 * (1 - index / 30));
    }
    angle += Math.max(-0.3, Math.min(0.3, meander * 0.16 + descent * 0.5 + pull));

    u += Math.cos(angle) * step;
    v += Math.sin(angle) * step;

    // Bề rộng: hai nhịp nhiễu chồng nhau nên có khúc thắt có khúc loe thành
    // vũng, cộng xu hướng phình dần về hạ lưu.
    const spread = (n: number): number => Math.max(0, Math.min(1, (n - 0.5) * 1.9 + 0.5));
    const fast = spread(fbm(index * 0.16 + 9.1, 1.7, seed + 1601, 2));
    const slow = spread(fbm(index * 0.05 + 2.3, 5.5, seed + 1783, 2));
    const width = baseWidth * (0.4 + 1.2 * fast) * (0.65 + 0.7 * slow) * (0.75 + (index / 260) * 0.7);
    out.push({ x: u * GRID_CELLS, y: v * GRID_CELLS, w: width });
  }

  return out.length > 12 ? out : [];
}

/** In dòng sông vào trường — tắt dần ra hai bờ, nên mép nước mềm và có bãi bồi. */
function stampRiver(riverF: Float32Array, river: readonly RiverPoint[]): void {
  for (let s = 0; s < river.length - 1; s++) {
    const a = river[s];
    const b = river[s + 1];
    if (a === undefined || b === undefined) continue;
    const steps = Math.max(2, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / (CELLS_PER_SAMPLE * 0.6)));
    for (let t = 0; t <= steps; t++) {
      const f = t / steps;
      const cx = a.x + (b.x - a.x) * f;
      const cy = a.y + (b.y - a.y) * f;
      const width = a.w + (b.w - a.w) * f;
      const radius = (width / 2 + CELLS_PER_SAMPLE) / CELLS_PER_SAMPLE;
      const si = cx / CELLS_PER_SAMPLE;
      const sj = cy / CELLS_PER_SAMPLE;
      const i0 = Math.max(0, Math.floor(si - radius));
      const i1 = Math.min(R - 1, Math.ceil(si + radius));
      const j0 = Math.max(0, Math.floor(sj - radius));
      const j1 = Math.min(R - 1, Math.ceil(sj + radius));
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const d = Math.hypot(i - si, j - sj) / radius;
          if (d > 1) continue;
          const value = 1 - d * d;
          const k = j * R + i;
          if (value > (riverF[k] ?? 0)) riverF[k] = value;
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Truy vấn
// ---------------------------------------------------------------------------

function clampIndex(n: number): number {
  return n < 0 ? 0 : n > R - 1 ? R - 1 : n;
}

/** Địa hình tại một Ô. Ngoài lưới là biển — không ai xây ra ngoài mảnh đất của mình. */
export function terrainAt(field: HoldingField, x: number, y: number): string {
  if (x < 0 || y < 0 || x >= GRID_CELLS || y >= GRID_CELLS) return 'bien';
  const i = clampIndex(Math.round(x / CELLS_PER_SAMPLE));
  const j = clampIndex(Math.round(y / CELLS_PER_SAMPLE));
  return TERRAIN_ORDER[field.kind[j * field.res + i] ?? 0] ?? 'dat-can';
}

/** Nội suy song tuyến một trường tại toạ độ ô — dùng khi vẽ, để mép mượt. */
export function sampleField(array: Float32Array, x: number, y: number): number {
  const fx = Math.max(0, Math.min(R - 1.001, x / CELLS_PER_SAMPLE));
  const fy = Math.max(0, Math.min(R - 1.001, y / CELLS_PER_SAMPLE));
  const i = Math.floor(fx);
  const j = Math.floor(fy);
  const tx = fx - i;
  const ty = fy - j;
  const a = array[j * R + i] ?? 0;
  const b = array[j * R + i + 1] ?? 0;
  const c = array[(j + 1) * R + i] ?? 0;
  const d = array[(j + 1) * R + i + 1] ?? 0;
  const top = a + (b - a) * tx;
  const bottom = c + (d - c) * tx;
  return top + (bottom - top) * ty;
}

/** Độ cao 0–1 tại một ô. Tường trên đồi khó trèo hơn, và đây là chỗ lấy con số ấy. */
export function elevationAt(field: HoldingField, x: number, y: number): number {
  return Math.max(0, Math.min(1, sampleField(field.elev, x, y)));
}

/** Mọi loại địa hình nằm dưới một khuôn viên `[x, y, size]`. */
export function terrainsUnder(field: HoldingField, x: number, y: number, size: number): string[] {
  const found = new Set<string>();
  const step = Math.max(1, Math.floor(CELLS_PER_SAMPLE));
  for (let dy = 0; dy < size; dy += step) {
    for (let dx = 0; dx < size; dx += step) found.add(terrainAt(field, x + dx, y + dy));
  }
  // Bốn góc luôn được nếm: một khuôn viên nhỏ hơn bước lấy mẫu mà chỉ nếm góc
  // tây-bắc thì nửa cái nhà nằm dưới sông vẫn qua được kiểm tra.
  found.add(terrainAt(field, x + size - 1, y));
  found.add(terrainAt(field, x, y + size - 1));
  found.add(terrainAt(field, x + size - 1, y + size - 1));
  return [...found];
}

/** Có mặt nước trong `radius` ô quanh một khuôn viên không (bến, cối xay, hào ngập). */
export function waterNearby(field: HoldingField, x: number, y: number, size: number, radius: number): boolean {
  const step = Math.max(1, Math.floor(CELLS_PER_SAMPLE));
  for (let dy = -radius; dy <= size + radius; dy += step) {
    for (let dx = -radius; dx <= size + radius; dx += step) {
      const id = terrainAt(field, x + dx, y + dy);
      if (id === 'song' || id === 'suoi' || id === 'bien') return true;
    }
  }
  return false;
}

export function isWaterTerrain(id: string): boolean {
  return id === 'song' || id === 'bien';
}

/**
 * BẢNG ĐẾM ĐỊA HÌNH trong bán kính quy hoạch, quy về "ô ruộng" của bản cũ.
 *
 * `labour.ts` tính sản lượng ruộng ngoài tường bằng cách nhân `yields` của từng
 * loại đất với số ô của loại đó. Hàm này thay cái bảng `hinterland` từng phải
 * lưu trong save: nó ĐẾM THẬT trên mảnh đất thật, rồi chuẩn hoá về đúng tổng số
 * ô mà cấp ấy vốn có.
 *
 * Chuẩn hoá chứ không trả số thô, vì hai lý do khác nhau và cả hai đều quan
 * trọng: cân bằng sản lượng của cả Phần 12 đã hiệu chỉnh theo `hinterlandPerTier`
 * và không nên trôi đi trong một cuộc đại tu về KHÔNG GIAN; còn THÀNH PHẦN thì
 * bây giờ mới là thật — một thành trì trên đá có ít đất tốt hơn một thành trì
 * giữa đồng, và trước đây điều đó chỉ đúng do may rủi.
 */
export function terrainTally(field: HoldingField, radiusCells: number, totalTiles: number): { terrain: string; count: number }[] {
  const counts = new Map<string, number>();
  let sampled = 0;
  const step = Math.max(1, Math.floor(CELLS_PER_SAMPLE));

  for (let y = CENTER_CELL - radiusCells; y <= CENTER_CELL + radiusCells; y += step) {
    for (let x = CENTER_CELL - radiusCells; x <= CENTER_CELL + radiusCells; x += step) {
      if (Math.hypot(x - CENTER_CELL, y - CENTER_CELL) > radiusCells) continue;
      if (x < 0 || y < 0 || x >= GRID_CELLS || y >= GRID_CELLS) continue;
      const id = terrainAt(field, x, y);
      // Mặt nước không phải ruộng. Nó vẫn đáng giá — xem `nodes.ts` — nhưng
      // không ai gặt lúa trên đó, và cộng nó vào đây là cho không thành trì ven
      // sông một vụ mùa không tồn tại.
      if (id === 'song' || id === 'bien') continue;
      counts.set(id, (counts.get(id) ?? 0) + 1);
      sampled++;
    }
  }

  if (sampled === 0) return [{ terrain: 'dat-can', count: totalTiles }];

  const rows: { terrain: string; count: number }[] = [];
  let assigned = 0;
  for (const [terrain, count] of counts) {
    const tiles = Math.round((count / sampled) * totalTiles);
    if (tiles <= 0) continue;
    rows.push({ terrain, count: tiles });
    assigned += tiles;
  }
  // Phần lẻ do làm tròn đổ vào loại đất nhiều nhất, để tổng luôn khớp.
  const biggest = rows.sort((a, b) => b.count - a.count)[0];
  if (biggest !== undefined && assigned !== totalTiles) biggest.count += totalTiles - assigned;
  return rows.filter((row) => row.count > 0);
}

// ---------------------------------------------------------------------------
// Ảnh nền
// ---------------------------------------------------------------------------

const TERRAIN_RGB: Readonly<Record<string, [number, number, number]>> = {
  'dat-tot': [88, 104, 56],
  'dat-can': [116, 106, 74],
  song: [46, 82, 108],
  suoi: [70, 110, 122],
  doi: [122, 108, 72],
  'da-goc': [110, 108, 104],
  'mo-sat': [126, 88, 74],
  rung: [54, 82, 52],
  dam: [78, 90, 70],
  bien: [38, 62, 92],
};

const RASTER_CACHE = new Map<string, Uint8ClampedArray>();

/**
 * Ảnh RGBA của mảnh đất. Màu KHÔNG phẳng: mỗi loại đất được pha theo độ cao
 * (vào sâu vùng núi thì tối và đậm dần) cộng một lớp lốm đốm tần cao, nên đồng
 * cỏ có chỗ xanh đậm chỗ xanh nhạt như thật, và ranh giới là đường lượn chứ
 * không phải cạnh ô.
 */
export function fieldRasterRGBA(field: HoldingField, size: number): Uint8ClampedArray {
  const key = `${String(field.seed)}|${field.dominant}|${field.coastal ? 1 : 0}|${String(size)}`;
  const hit = RASTER_CACHE.get(key);
  if (hit !== undefined) return hit;

  const data = new Uint8ClampedArray(size * size * 4);
  const cellsPerPx = GRID_CELLS / size;

  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const cx = (i + 0.5) * cellsPerPx;
      const cy = (j + 0.5) * cellsPerPx;
      const id = terrainAt(field, cx, cy);
      const [r, g, b] = TERRAIN_RGB[id] ?? [90, 90, 90];

      const e = sampleField(field.elev, cx, cy);
      let shade: number;
      if (id === 'doi' || id === 'da-goc' || id === 'mo-sat') shade = 1.18 - Math.min(0.5, (e - 0.6) * 1.35);
      else if (id === 'bien') shade = 0.85 + Math.min(0.3, Math.max(0, -sampleField(field.seaF, cx, cy)) * 1.2);
      else if (id === 'song' || id === 'suoi') shade = 0.85 + 0.3 * (1 - Math.min(1, sampleField(field.riverF, cx, cy)));
      else shade = 0.92 + e * 0.22;

      const grain = fbm(i * 0.16, j * 0.16, field.seed + 2801, 3) - 0.5;
      const patch = fbm(i * 0.045, j * 0.045, field.seed + 3301, 3) - 0.5;
      const amplitude = id === 'rung' ? 0.3 : id === 'dat-tot' ? 0.2 : id === 'bien' ? 0.1 : 0.22;
      const mod = shade * (1 + grain * amplitude * 0.55 + patch * amplitude);

      const k = (j * size + i) * 4;
      data[k] = r * mod;
      data[k + 1] = g * mod;
      data[k + 2] = b * mod;
      data[k + 3] = 255;
    }
  }

  RASTER_CACHE.set(key, data);
  if (RASTER_CACHE.size > 6) {
    const oldest = RASTER_CACHE.keys().next().value;
    if (oldest !== undefined) RASTER_CACHE.delete(oldest);
  }
  return data;
}

/** Chỉ dùng trong test. */
export function clearFieldCache(): void {
  CACHE.clear();
  RASTER_CACHE.clear();
}
