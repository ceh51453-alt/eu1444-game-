/**
 * HÌNH NGƯỜI SVG — DỰNG BẰNG CODE, KHÔNG PHẢI ẢNH (Phần 7 mục 4 và 11.2).
 *
 * Hai mươi vùng, mỗi vùng một `<path>` có id TRÙNG id vùng trong
 * `data/body-regions.json`. Ràng buộc cứng từ Phần 0 mục 3: SVG nội tuyến, tô
 * màu qua biến CSS, cấm ảnh bitmap.
 *
 * VÌ SAO ĐƯỜNG CONG CHỨ KHÔNG PHẢI ĐA GIÁC: cơ thể người không có một cạnh
 * thẳng nào. Một hình ghép từ hình thang trông như bộ giáp treo trên giá, và
 * người chơi sẽ đọc nó như một biểu đồ chứ không như thân thể mình — mà mục 2
 * nói thẳng mục đích của cả hệ này là để họ "nhìn vào cơ thể chứ không nhìn vào
 * một con số". Mọi đường viền ở đây là Bézier bậc ba: cơ delta phình, bắp tay
 * thon về khuỷu, bắp chân nở rồi thắt về cổ chân.
 *
 * VÌ SAO DỰNG BẰNG TỌA ĐỘ CHỨ KHÔNG CHÉP MỘT CHUỖI `d` DÀI: mục 11.2 đòi hình
 * "đúng tỷ lệ, khớp với dáng người ở Phần 6". Dáng người ở Phần 6 là `musclePct`
 * và `fatPct` — hai con số thay đổi theo chủng tộc và theo nhân vật. Một chuỗi
 * `d` cố định thì một Ogre và một Kobold có cùng một cái bóng; ở đây vai, thân
 * và tứ chi giãn theo ba hệ số riêng.
 *
 * Tỷ lệ dùng thang BẢY ĐẦU RƯỠI — chuẩn vẽ người trưởng thành. Mốc dọc trong
 * `Y` bám đúng thang đó: cằm ở 1 đầu, ngực 2, rốn 3, đũng 4, gối 5,5, mắt cá
 * 7,2. Đổi một mốc mà không đổi cả bảng là hình sẽ lệch ngay.
 */

import { allRegions, regionsOnView, type BodyRegion } from '@/systems/body';

export const VIEW_WIDTH = 220;
export const VIEW_HEIGHT = 470;

const CX = VIEW_WIDTH / 2;

/**
 * Khung nhìn ÔM SÁT thân người, không phải cả tờ giấy.
 *
 * Hình người cao và hẹp: ở dáng chuẩn nó chỉ rộng 114 trên một hệ tọa độ rộng
 * 220, nên lấy cả tờ giấy làm khung thì một nửa bảng bên là khoảng trống, và
 * cái bóng co lại còn bằng ngón tay. Lề hai bên chừa đủ cho dáng lực lưỡng
 * nhất — một Ogre vai rộng gấp rưỡi vẫn không chạm mép.
 */
export const VIEW_BOX = { x: 30, y: 4, width: 160, height: 448 } as const;

/** Mốc dọc, thang bảy đầu rưỡi với một đầu = 56. */
const Y = {
  crown: 14,
  brow: 52,
  chin: 80,
  neckTop: 76,
  clavicle: 102,
  armpit: 140,
  ribs: 172,
  waist: 226,
  hipTop: 222,
  crotch: 272,
  elbow: 206,
  wrist: 264,
  fingers: 298,
  thighTop: 250,
  knee: 340,
  calf: 386,
  ankle: 424,
  sole: 440,
} as const;

export interface Build {
  /** Tỉ lệ cơ 0–100 (Phần 6 `appearance.musclePct`). */
  musclePct: number;
  /** Tỉ lệ mỡ 0–100 (Phần 6 `appearance.fatPct`). */
  fatPct: number;
}

export const AVERAGE_BUILD: Build = { musclePct: 38, fatPct: 20 };

/**
 * Bề ngang nhân theo dáng người.
 *
 * Cơ và mỡ đều làm người rộng ra, nhưng không rộng như nhau và không rộng ở
 * cùng chỗ: cơ ăn vào vai và tay, mỡ ăn vào bụng và hông. Đó là lý do có ba hệ
 * số chứ không phải một — và là thứ làm một Lùn Núi khác một Cao Tiên khi cùng
 * đứng trên bảng trạng thái.
 */
function widthScale(build: Build, kind: 'vai' | 'than' | 'chi'): number {
  const muscle = (build.musclePct - AVERAGE_BUILD.musclePct) / 100;
  const fat = (build.fatPct - AVERAGE_BUILD.fatPct) / 100;
  switch (kind) {
    case 'vai':
      return 1 + muscle * 0.75 + fat * 0.2;
    case 'than':
      return 1 + muscle * 0.25 + fat * 0.9;
    case 'chi':
      return 1 + muscle * 0.6 + fat * 0.45;
  }
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Giãn một đường theo trục ngang, lấy trục giữa làm gốc.
 *
 * Viết đường ở dáng chuẩn rồi giãn sau, thay vì rắc hệ số vào từng tọa độ: một
 * đường có mười hai điểm neo thì mười hai chỗ nhân là mười hai chỗ gõ nhầm được,
 * và cái nhầm ấy chỉ lộ ra ở một dáng người hiếm gặp.
 */
function scaleX(path: string, factor: number): string {
  if (factor === 1) return path;
  return path.replace(/(-?\d*\.?\d+),(-?\d*\.?\d+)/g, (_all, x: string, y: string) => {
    return `${round(CX + (Number(x) - CX) * factor)},${y}`;
  });
}

/** Lật ngang quanh trục giữa — dùng cho bên đối xứng và cho mặt sau. */
function mirror(path: string): string {
  return path.replace(/(-?\d*\.?\d+),(-?\d*\.?\d+)/g, (_all, x: string, y: string) => {
    return `${round(2 * CX - Number(x))},${y}`;
  });
}

/**
 * Đường viền các vùng ở DÁNG CHUẨN, bên tay/chân dựng ở phía TRÁI màn hình.
 *
 * Trái màn hình = bên PHẢI của nhân vật ở mặt trước, đúng quy ước giải phẫu.
 * Bên còn lại và cả mặt sau đều suy ra bằng `mirror`, nên hai bên không bao giờ
 * lệch nhau một điểm ảnh.
 *
 * THỨ TỰ CHÈN LÀ THỨ TỰ VẼ: cổ trước, rồi thân, rồi chân, rồi tay, đầu sau
 * cùng. Vẽ đầu trước thì cái cổ sẽ trùm lên cằm.
 */
function basePaths(): Record<string, string> {
  const p: Record<string, string> = {};
  const x = (offset: number): number => round(CX + offset);

  // --- Cổ: thang cân dốc ra hai vai --------------------------------------
  p['neck'] = [
    `M${x(-12)},${Y.neckTop}`,
    `C${x(-12)},${Y.neckTop + 10} ${x(-16)},${Y.clavicle - 12} ${x(-30)},${Y.clavicle}`,
    `L${x(30)},${Y.clavicle}`,
    `C${x(16)},${Y.clavicle - 12} ${x(12)},${Y.neckTop + 10} ${x(12)},${Y.neckTop}`,
    'Z',
  ].join(' ');

  // --- Thân: ngực nở, eo thắt, hông nở lại --------------------------------
  // Lồng ngực nở nhất ở nách rồi thu lại về gờ sườn — chính chỗ thu ấy là thứ
  // phân biệt một thân người với một cái thùng.
  const torsoTop = [
    `M${x(-34)},${Y.clavicle}`,
    `C${x(-38)},${Y.clavicle + 18} ${x(-39)},${Y.armpit} ${x(-35)},${Y.ribs}`,
    `L${x(35)},${Y.ribs}`,
    `C${x(39)},${Y.armpit} ${x(38)},${Y.clavicle + 18} ${x(34)},${Y.clavicle}`,
    `C${x(20)},${Y.clavicle - 5} ${x(-20)},${Y.clavicle - 5} ${x(-34)},${Y.clavicle}`,
    'Z',
  ].join(' ');

  const torsoBottom = [
    `M${x(-35)},${Y.ribs}`,
    `C${x(-31)},${Y.ribs + 24} ${x(-28)},${Y.waist - 8} ${x(-29)},${Y.waist}`,
    `L${x(29)},${Y.waist}`,
    `C${x(28)},${Y.waist - 8} ${x(31)},${Y.ribs + 24} ${x(35)},${Y.ribs}`,
    'Z',
  ].join(' ');

  p['chest'] = torsoTop;
  p['abdomen'] = torsoBottom;
  p['upperBack'] = torsoTop;
  p['lowerBack'] = torsoBottom;

  // --- Hông: nở ra rồi khép vào chữ V ở đũng ------------------------------
  p['hips'] = [
    `M${x(-29)},${Y.waist}`,
    `C${x(-36)},${Y.waist + 14} ${x(-35)},${Y.crotch - 18} ${x(-31)},${Y.crotch - 6}`,
    `C${x(-24)},${Y.crotch + 4} ${x(-14)},${Y.crotch + 6} ${x(-7)},${Y.crotch}`,
    `C${x(-3)},${Y.crotch + 6} ${x(3)},${Y.crotch + 6} ${x(7)},${Y.crotch}`,
    `C${x(14)},${Y.crotch + 6} ${x(24)},${Y.crotch + 4} ${x(31)},${Y.crotch - 6}`,
    `C${x(35)},${Y.crotch - 18} ${x(36)},${Y.waist + 14} ${x(29)},${Y.waist}`,
    'Z',
  ].join(' ');

  // --- Chân phải của nhân vật (trái màn hình) -----------------------------
  //
  // Mép TRONG của đùi chụm gần nhau ở đũng rồi mới tách ra về phía gối. Để nó
  // thẳng đứng thì hai chân hở một khe rộng đều tăm tắp suốt chiều dài, và cái
  // khe ấy đọc như một vết cắt chứ không như hai cái chân.
  p['thighR'] = [
    `M${x(-31)},${Y.thighTop - 4}`,
    `C${x(-35)},${Y.thighTop + 34} ${x(-33)},${Y.knee - 30} ${x(-29)},${Y.knee}`,
    `C${x(-24)},${Y.knee + 5} ${x(-15)},${Y.knee + 5} ${x(-11)},${Y.knee}`,
    `C${x(-8)},${Y.knee - 40} ${x(-4)},${Y.crotch + 16} ${x(-3)},${Y.crotch - 2}`,
    `C${x(-10)},${Y.crotch + 4} ${x(-23)},${Y.crotch + 2} ${x(-31)},${Y.thighTop - 4}`,
    'Z',
  ].join(' ');

  // Bắp chân nở ngay dưới gối rồi THẮT hẳn lại ở cổ chân, và bàn chân xòe ra
  // ngoài. Cổ chân là chỗ duy nhất trên cẳng chân hẹp hơn hẳn phần trên; bỏ nó
  // đi thì cả cái chân thành một ống nước.
  p['shinR'] = [
    `M${x(-29)},${Y.knee}`,
    `C${x(-33)},${Y.knee + 26} ${x(-32)},${Y.calf} ${x(-25)},${Y.ankle - 6}`,
    `C${x(-24)},${Y.ankle + 2} ${x(-27)},${Y.ankle + 8} ${x(-34)},${Y.sole - 5}`,
    `C${x(-37)},${Y.sole - 1} ${x(-35)},${Y.sole} ${x(-29)},${Y.sole}`,
    `L${x(-12)},${Y.sole}`,
    `C${x(-10)},${Y.ankle + 4} ${x(-13)},${Y.ankle - 6} ${x(-14)},${Y.calf - 10}`,
    `C${x(-15)},${Y.knee + 26} ${x(-13)},${Y.knee + 8} ${x(-11)},${Y.knee}`,
    `C${x(-15)},${Y.knee + 5} ${x(-24)},${Y.knee + 5} ${x(-29)},${Y.knee}`,
    'Z',
  ].join(' ');

  // --- Tay phải của nhân vật ----------------------------------------------
  // Cơ delta: chỏm tròn úp lên đầu vai, phần đắt giá nhất của cả hình.
  p['shoulderR'] = [
    `M${x(-33)},${Y.clavicle}`,
    `C${x(-46)},${Y.clavicle - 3} ${x(-57)},${Y.clavicle + 8} ${x(-60)},${Y.clavicle + 24}`,
    `C${x(-62)},${Y.armpit - 8} ${x(-61)},${Y.armpit - 2} ${x(-59)},${Y.armpit}`,
    `L${x(-40)},${Y.armpit - 2}`,
    `C${x(-37)},${Y.clavicle + 24} ${x(-35)},${Y.clavicle + 10} ${x(-33)},${Y.clavicle}`,
    'Z',
  ].join(' ');

  p['upperArmR'] = [
    `M${x(-59)},${Y.armpit}`,
    `C${x(-61)},${Y.armpit + 24} ${x(-58)},${Y.elbow - 20} ${x(-55)},${Y.elbow}`,
    `L${x(-41)},${Y.elbow}`,
    `C${x(-40)},${Y.elbow - 22} ${x(-39)},${Y.armpit + 20} ${x(-40)},${Y.armpit - 2}`,
    'Z',
  ].join(' ');

  p['forearmR'] = [
    `M${x(-55)},${Y.elbow}`,
    `C${x(-58)},${Y.elbow + 20} ${x(-55)},${Y.wrist - 20} ${x(-51)},${Y.wrist}`,
    `L${x(-42)},${Y.wrist}`,
    `C${x(-40)},${Y.wrist - 22} ${x(-40)},${Y.elbow + 18} ${x(-41)},${Y.elbow}`,
    'Z',
  ].join(' ');

  p['handR'] = [
    `M${x(-51)},${Y.wrist}`,
    `C${x(-55)},${Y.wrist + 10} ${x(-55)},${Y.fingers - 12} ${x(-51)},${Y.fingers - 4}`,
    `C${x(-49)},${Y.fingers + 2} ${x(-43)},${Y.fingers + 2} ${x(-41)},${Y.fingers - 6}`,
    `C${x(-39)},${Y.fingers - 16} ${x(-40)},${Y.wrist + 8} ${x(-42)},${Y.wrist}`,
    'Z',
  ].join(' ');

  // --- Đầu, vẽ sau cùng để cằm nằm trên cổ --------------------------------
  p['skull'] = [
    `M${x(-21)},${Y.brow}`,
    `C${x(-22)},${Y.crown + 16} ${x(-14)},${Y.crown} ${x(0)},${Y.crown}`,
    `C${x(14)},${Y.crown} ${x(22)},${Y.crown + 16} ${x(21)},${Y.brow}`,
    'Z',
  ].join(' ');

  // Gò má rộng ngang mày rồi thu nhanh về cằm: không thon thì cái đầu đọc ra
  // một viên gạch bo góc, và đó là chỗ mắt người soi kỹ nhất trên cả hình.
  p['face'] = [
    `M${x(-21)},${Y.brow}`,
    `C${x(-21)},${Y.brow + 10} ${x(-19)},${Y.brow + 16} ${x(-13)},${Y.chin - 6}`,
    `C${x(-9)},${Y.chin} ${x(-5)},${Y.chin + 2} ${x(0)},${Y.chin + 2}`,
    `C${x(5)},${Y.chin + 2} ${x(9)},${Y.chin} ${x(13)},${Y.chin - 6}`,
    `C${x(19)},${Y.brow + 16} ${x(21)},${Y.brow + 10} ${x(21)},${Y.brow}`,
    'Z',
  ].join(' ');

  return p;
}

/** Hệ số bề ngang của từng vùng. */
function factorFor(id: string, build: Build): number {
  if (id.startsWith('shoulder')) return widthScale(build, 'vai');
  if (
    id.startsWith('upperArm') ||
    id.startsWith('forearm') ||
    id.startsWith('hand') ||
    id.startsWith('thigh') ||
    id.startsWith('shin')
  ) {
    return widthScale(build, 'chi');
  }
  if (id === 'skull' || id === 'face' || id === 'neck') return 1;
  return widthScale(build, 'than');
}

function buildPaths(build: Build): Record<string, string> {
  const base = basePaths();
  const out: Record<string, string> = {};

  for (const [id, path] of Object.entries(base)) {
    out[id] = scaleX(path, factorFor(id, build));
  }

  // Bên trái của nhân vật: lật y hệt, nên hai bên không thể lệch nhau.
  for (const id of ['shoulderR', 'upperArmR', 'forearmR', 'handR', 'thighR', 'shinR']) {
    const source = out[id];
    if (source === undefined) continue;
    out[`${id.slice(0, -1)}L`] = mirror(source);
  }

  return out;
}

export interface Silhouette {
  viewBox: string;
  /** id vùng → chuỗi `d`, chỉ những vùng hiện ở mặt này, ĐÚNG thứ tự vẽ. */
  front: Record<string, string>;
  back: Record<string, string>;
}

/**
 * Thứ tự vẽ, từ lớp sau ra lớp trước.
 *
 * Tay nằm TRÊN thân vì cơ delta phải úp lên đầu vai; đầu nằm trên cùng vì cằm
 * phải che mép cổ. Vẽ sai thứ tự thì hình vẫn đủ hai mươi vùng mà trông như bị
 * tháo rời ra rồi lắp lại.
 */
const DRAW_ORDER: readonly string[] = [
  'neck',
  'chest',
  'abdomen',
  'upperBack',
  'lowerBack',
  'hips',
  'thighR',
  'thighL',
  'shinR',
  'shinL',
  'shoulderR',
  'shoulderL',
  'upperArmR',
  'upperArmL',
  'forearmR',
  'forearmL',
  'handR',
  'handL',
  'skull',
  'face',
];

function inDrawOrder(paths: Record<string, string>, allowed: ReadonlySet<string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const id of DRAW_ORDER) {
    const path = paths[id];
    if (path === undefined || !allowed.has(id)) continue;
    out[id] = path;
  }
  return out;
}

/**
 * Hình người trước và sau.
 *
 * Mặt sau là ảnh gương của mặt trước: bên phải nhân vật chuyển sang phải màn
 * hình, đúng như khi ta đi vòng ra sau lưng người ấy. Không lật thì người chơi
 * sẽ băng vết thương nhầm tay, và họ sẽ không hiểu vì sao.
 */
export function buildSilhouette(build: Build = AVERAGE_BUILD): Silhouette {
  const paths = buildPaths(build);

  const frontIds = new Set(regionsOnView('truoc').map((region) => region.id));
  const backIds = new Set(regionsOnView('sau').map((region) => region.id));

  const front = inDrawOrder(paths, frontIds);
  const back: Record<string, string> = {};
  for (const [id, path] of Object.entries(inDrawOrder(paths, backIds))) {
    back[id] = mirror(path);
  }

  return {
    viewBox: `${VIEW_BOX.x} ${VIEW_BOX.y} ${VIEW_BOX.width} ${VIEW_BOX.height}`,
    front,
    back,
  };
}

// ---------------------------------------------------------------------------
// Hình học — lớp phủ của mục 4 cần biết vùng nằm ở đâu
// ---------------------------------------------------------------------------

type Point = readonly [number, number];

export function pointsOf(d: string): Point[] {
  const out: Point[] = [];
  const pattern = /(-?\d*\.?\d+),(-?\d*\.?\d+)/g;
  for (let match = pattern.exec(d); match !== null; match = pattern.exec(d)) {
    out.push([Number(match[1]), Number(match[2])]);
  }
  return out;
}

/**
 * Tâm của một vùng — chỗ đặt giọt máu nhỏ giọt.
 *
 * Tính trên CẢ điểm điều khiển Bézier chứ không chỉ điểm neo: với một hình cong
 * thì điểm điều khiển kéo trọng tâm về đúng phía phần phình ra, và giọt máu rơi
 * vào giữa bắp chân thay vì rơi ra mép.
 */
export function centroidOf(d: string): Point {
  const points = pointsOf(d);
  if (points.length === 0) return [CX, VIEW_HEIGHT / 2];
  let x = 0;
  let y = 0;
  for (const point of points) {
    x += point[0];
    y += point[1];
  }
  return [round(x / points.length), round(y / points.length)];
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function bboxOf(d: string): Box {
  const points = pointsOf(d);
  if (points.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  const xs = points.map((point) => point[0]);
  const ys = points.map((point) => point[1]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return { x: minX, y: minY, width: Math.max(...xs) - minX, height: Math.max(...ys) - minY };
}

/**
 * Vùng nào thiếu hình — bài kiểm của mục 11.2 đòi ĐỦ hai mươi path có id.
 *
 * Xuất ra để test gọi được: một vùng mới thêm vào `data/body-regions.json` mà
 * quên vẽ sẽ im lặng biến mất khỏi bản đồ, và người chơi không có cách nào biết
 * mình đang không được cho xem một phần cơ thể của chính mình.
 */
export function missingPaths(build: Build = AVERAGE_BUILD): string[] {
  const { front, back } = buildSilhouette(build);
  return allRegions()
    .filter((region: BodyRegion) => front[region.id] === undefined && back[region.id] === undefined)
    .map((region) => region.id);
}
