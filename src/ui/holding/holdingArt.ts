/**
 * BỘ VẼ BẢN ĐỒ THÀNH TRÌ — mọi thứ chạm vào `CanvasRenderingContext2D`.
 *
 * Tách khỏi `HoldingMap.tsx` vì hai loại code khác nhau ở đây: một bên là React
 * quản khung nhìn và con trỏ, một bên là hình học thuần không biết gì về state.
 * Trộn chúng lại thì mỗi lần sửa màu một cái mái nhà phải đọc lại cả vòng đời
 * component.
 *
 * ---
 *
 * DA CÔNG TRÌNH SUY TỪ DỮ LIỆU, KHÔNG TỪ MỘT BẢNG TÊN.
 *
 * Bản gốc mà file này tham khảo có một bảng ba mươi sáu dòng, mỗi dòng một cái
 * tên công trình cứng. Nó chạy được vì bên ấy danh sách công trình là một
 * `enum` trong mã nguồn. Ở đây `data/buildings.json` là dữ liệu, người cân bằng
 * thêm một công trình mới bằng cách sửa JSON — và một bảng tên cứng nghĩa là
 * công trình mới ấy hiện lên màu xám mặc định cho tới khi có ai nhớ ra.
 *
 * Nên màu suy từ hai trường ĐÃ CÓ trong data: `material` cho tường (gỗ nâu, đá
 * xám, đất vàng) và `group` cho mái. Một cái lò rèn và một cái xưởng dệt đều là
 * nhà gỗ của nhóm sản xuất nên chúng giống nhau — và chúng GIỐNG NHAU THẬT, cái
 * phân biệt chúng là biểu tượng ở giữa chứ không phải sắc tường.
 */

import {
  GRADE_LABEL,
  NODE_ZONE_DEFS,
  type Building,
  type BuildingGroup,
  type Cell,
  type ResourceNode,
  type StreetKind,
} from '@/systems/holding';

// ---------------------------------------------------------------------------
// Bảng màu
// ---------------------------------------------------------------------------

/** Tường theo VẬT LIỆU. Ba giá trị, đúng bằng ba giá trị `material` có trong data. */
const WALL_BY_MATERIAL: Readonly<Record<string, string>> = {
  go: '#8a7550',
  da: '#8d8781',
  dat: '#94875f',
};

/** Mái theo CÔNG NĂNG. Đây là chỗ tám nhóm của mục 4 hiện ra thành tám sắc. */
const ROOF_BY_GROUP: Readonly<Record<BuildingGroup, string>> = {
  'san-xuat': '#6d5a33',
  'quan-su': '#6a3b38',
  'dan-sinh': '#7a6544',
  'ton-giao': '#5d5470',
  'hanh-chinh': '#3f5670',
  'hoc-van': '#356d62',
  'phong-thu': '#585c63',
  'dac-thu-toc': '#6d4a63',
};

/** Biểu tượng giữa khuôn viên — thứ DUY NHẤT phân biệt hai công trình cùng nhóm. */
const GLYPH_BY_GROUP: Readonly<Record<BuildingGroup, string>> = {
  'san-xuat': '⚒',
  'quan-su': '⚔',
  'dan-sinh': '⌂',
  'ton-giao': '✦',
  'hanh-chinh': '❖',
  'hoc-van': '✎',
  'phong-thu': '△',
  'dac-thu-toc': '✥',
};

export const GROUP_NAMES: Readonly<Record<BuildingGroup, string>> = {
  'san-xuat': 'Sản xuất',
  'quan-su': 'Quân sự',
  'dan-sinh': 'Dân sinh',
  'ton-giao': 'Tôn giáo',
  'hanh-chinh': 'Hành chính',
  'hoc-van': 'Học vấn',
  'phong-thu': 'Phòng thủ',
  'dac-thu-toc': 'Đặc thù tộc',
};

/** Màu vùng tài nguyên. Khoá là `NodeZone`; bảng chú giải dùng chung bảng này. */
export const ZONE_COLOURS: Readonly<Record<string, string>> = {
  'rung-go': '#4a7a3a',
  'via-da': '#8a8a86',
  'mach-sat': '#a06450',
  'bai-ca': '#4a8ea8',
  'ruong-muoi': '#a8a070',
  'dong-co': '#8aa050',
};

/**
 * Biểu tượng vùng tài nguyên.
 *
 * Ở đây chứ không ở `NODE_ZONE_DEFS`: một ký tự để vẽ lên canvas là chuyện của
 * lớp trình bày, và `nodes.ts` không nên biết bản đồ trông thế nào.
 */
export const ZONE_ICONS: Readonly<Record<string, string>> = {
  'rung-go': '🌲',
  'via-da': '⛰',
  'mach-sat': '⚒',
  'bai-ca': '⚓',
  'ruong-muoi': '❈',
  'dong-co': '❋',
};

export interface Skin {
  wall: string;
  roof: string;
  glyph: string;
}

export function skinOf(building: Building): Skin {
  return {
    wall: WALL_BY_MATERIAL[building.material] ?? '#8a8a86',
    roof: ROOF_BY_GROUP[building.group] ?? '#5f5f5c',
    glyph: GLYPH_BY_GROUP[building.group] ?? '✥',
  };
}

// ---------------------------------------------------------------------------
// Khung nhìn
// ---------------------------------------------------------------------------

/**
 * Đổi giữa toạ độ Ô và điểm ảnh.
 *
 * `scale` là số điểm ảnh cho MỘT Ô 5 m. Ở mức thu nhỏ hết cỡ nó xuống dưới 0,1
 * — một cái nhà mười ô rộng đúng một điểm ảnh — nên gần như mọi hàm vẽ dưới đây
 * đều có một cái sàn `Math.max`, và cái sàn ấy là thứ giữ cho bản đồ còn đọc
 * được thay vì tan thành một đám bụi.
 */
export interface View {
  scale: number;
  /** Dịch chuyển, tính bằng điểm ảnh. */
  tx: number;
  ty: number;
  width: number;
  height: number;
}

export function toPx(view: View, x: number, y: number): [number, number] {
  return [x * view.scale + view.tx, y * view.scale + view.ty];
}

export function toCell(view: View, px: number, py: number): Cell {
  return { x: (px - view.tx) / view.scale, y: (py - view.ty) / view.scale };
}

/** Khuôn viên này có lọt vào khung nhìn không — mọi vòng vẽ đều hỏi câu này trước. */
export function inViewport(view: View, x: number, y: number, size: number): boolean {
  const [px, py] = toPx(view, x, y);
  const side = size * view.scale;
  return px + side >= -32 && py + side >= -32 && px <= view.width + 32 && py <= view.height + 32;
}

// ---------------------------------------------------------------------------
// Đường và tuyến
// ---------------------------------------------------------------------------

/** Nét đôi: một nét tối rộng làm bóng đổ, một nét sáng hẹp làm mặt đường. */
export function drawPolyline(
  context: CanvasRenderingContext2D,
  view: View,
  points: readonly Cell[],
  colour: string,
  width: number,
  dash: number[] = [],
): void {
  if (points.length < 2) return;
  context.beginPath();
  for (let index = 0; index < points.length; index++) {
    const point = points[index];
    if (point === undefined) continue;
    const [px, py] = toPx(view, point.x, point.y);
    if (index === 0) context.moveTo(px, py);
    else context.lineTo(px, py);
  }
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.strokeStyle = colour;
  context.lineWidth = width;
  if (dash.length > 0) context.setLineDash(dash);
  context.stroke();
  context.setLineDash([]);
}

const STREET_PAINT: Readonly<Record<StreetKind, { edge: string; face: string; width: number }>> = {
  'quan-lo': { edge: 'rgba(20,17,13,0.34)', face: 'rgba(190,172,136,0.76)', width: 13 },
  ngo: { edge: 'rgba(20,17,13,0.20)', face: 'rgba(152,138,112,0.5)', width: 5 },
  'ngo-noi': { edge: 'rgba(20,17,13,0.14)', face: 'rgba(142,130,106,0.4)', width: 3 },
};

export function drawStreet(
  context: CanvasRenderingContext2D,
  view: View,
  points: readonly Cell[],
  kind: StreetKind,
  highlight = false,
): void {
  const paint = STREET_PAINT[kind];
  drawPolyline(context, view, points, paint.edge, Math.max(1.4, paint.width * view.scale * 1.35));
  drawPolyline(
    context,
    view,
    points,
    highlight ? '#e8d9a8' : paint.face,
    Math.max(0.9, paint.width * view.scale),
  );
}

/** Đường người chơi lát: cùng hình, khác chất — có viền đá và sáng hơn hẳn. */
export function drawPavedRoad(
  context: CanvasRenderingContext2D,
  view: View,
  points: readonly Cell[],
  width: number,
  surfaceId: string,
  done: boolean,
  wear: number,
  highlight = false,
): void {
  const base = 4 + width * 4;
  const face =
    surfaceId === 'duong-lat-da'
      ? `rgba(198,190,172,${String(0.55 + wear * 0.4)})`
      : surfaceId === 'duong-soi'
        ? `rgba(180,166,134,${String(0.5 + wear * 0.4)})`
        : `rgba(158,140,108,${String(0.45 + wear * 0.35)})`;

  drawPolyline(context, view, points, 'rgba(18,15,11,0.42)', Math.max(1.6, base * view.scale * 1.4));
  drawPolyline(
    context,
    view,
    points,
    highlight ? '#f0dfaa' : face,
    Math.max(1, base * view.scale),
    done ? [] : [Math.max(4, 9 * view.scale), Math.max(3, 7 * view.scale)],
  );
}

/**
 * CẦU — bắc ngang dòng, dài theo nhịp thật.
 *
 * Vẽ sau đường và trước tường: một cây cầu nằm dưới mặt đường thì không ai thấy
 * nó, mà nó lại đúng là thứ giải thích vì sao con đường đi được qua chỗ ấy.
 */
export function drawBridge(
  context: CanvasRenderingContext2D,
  view: View,
  at: Cell,
  angle: number,
  span: number,
): void {
  const [px, py] = toPx(view, at.x, at.y);
  const length = Math.max(6, span * view.scale * 1.1);
  const width = Math.max(3, 14 * view.scale);

  context.save();
  context.translate(px, py);
  context.rotate(angle);
  context.fillStyle = 'rgba(140,132,118,0.92)';
  context.fillRect(-length / 2, -width / 2, length, width);
  context.strokeStyle = 'rgba(40,36,30,0.7)';
  context.lineWidth = Math.max(0.6, 1.2 * view.scale);
  context.strokeRect(-length / 2, -width / 2, length, width);
  // Hai lan can — chỗ duy nhất phân biệt một cây cầu với một vệt đá lát.
  context.fillStyle = 'rgba(96,90,80,0.9)';
  context.fillRect(-length / 2, -width / 2, length, Math.max(0.8, width * 0.16));
  context.fillRect(-length / 2, width / 2 - Math.max(0.8, width * 0.16), length, Math.max(0.8, width * 0.16));
  context.restore();
}

/** CỔNG THÀNH — hai trụ và một khoảng trống ở giữa, quay mặt ra ngoài. */
export function drawGate(
  context: CanvasRenderingContext2D,
  view: View,
  at: Cell,
  angle: number,
  main: boolean,
): void {
  const [px, py] = toPx(view, at.x, at.y);
  const size = Math.max(5, (main ? 17 : 13) * view.scale);

  context.save();
  context.translate(px, py);
  context.rotate(angle);
  context.fillStyle = 'rgba(22,20,17,0.78)';
  context.fillRect(-size * 0.75, -size * 0.56, size * 1.5, size * 1.12);
  context.fillStyle = main ? '#d6c9a5' : '#aaa193';
  context.fillRect(-size * 0.68, -size * 0.5, size * 0.42, size);
  context.fillRect(size * 0.26, -size * 0.5, size * 0.42, size);
  context.fillStyle = '#443d33';
  context.fillRect(-size * 0.18, -size * 0.48, size * 0.36, size * 0.96);
  context.restore();
}

// ---------------------------------------------------------------------------
// Công trình
// ---------------------------------------------------------------------------

/**
 * MỘT CÔNG TRÌNH ĐÃ DỰNG XONG.
 *
 * Hình khối chứ không phải ô vuông tô màu, và cái khác nhau không phải trang
 * trí: một cái giếng rộng 40 m và một toà giáo đường rộng 120 m vẽ bằng hai ô
 * vuông cùng cỡ thì bản đồ nói dối về thứ quan trọng nhất của một bản vẽ quy
 * hoạch. Ở đây khuôn viên vẽ ĐÚNG CỠ THẬT, và cái mái nghiêng cho biết đâu là
 * hướng nhìn của toà nhà.
 */
export function drawBuilding(
  context: CanvasRenderingContext2D,
  view: View,
  at: Cell,
  size: number,
  skin: Skin,
  options: { wear?: number; understaffed?: boolean; selected?: boolean } = {},
): void {
  const [px, py] = toPx(view, at.x, at.y);
  const side = Math.max(3, size * view.scale);
  const wear = options.wear ?? 1;

  context.save();

  // Bóng đổ — cái duy nhất tạo cảm giác toà nhà đứng TRÊN đất chứ không nằm
  // trong đất. Lệch xuống đông-nam, cùng hướng cho mọi công trình.
  context.fillStyle = 'rgba(6,8,11,0.4)';
  context.fillRect(px + side * 0.06, py + side * 0.08, side, side);

  // Thân tường, nhạt dần theo độ hư hại: nhìn bản đồ là biết chỗ nào cần sửa,
  // không phải mở bảng ra dò từng dòng.
  context.globalAlpha = 0.45 + 0.55 * wear;
  context.fillStyle = skin.wall;
  context.fillRect(px, py, side, side);

  // Mái — một dải chiếm hai phần năm chiều cao, đủ để mắt bắt được công năng ở
  // mức thu nhỏ mà biểu tượng đã biến mất.
  context.fillStyle = skin.roof;
  context.fillRect(px, py, side, side * 0.42);
  context.globalAlpha = 1;

  context.strokeStyle = 'rgba(18,15,11,0.75)';
  context.lineWidth = Math.max(0.5, side * 0.03);
  context.strokeRect(px, py, side, side);

  // Biểu tượng chỉ vẽ khi còn đọc được. Dưới 14 điểm ảnh nó thành một vết mực.
  if (side >= 14) {
    context.fillStyle = 'rgba(18,15,11,0.82)';
    context.font = `600 ${String(Math.max(8, side * 0.38))}px serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(skin.glyph, px + side / 2, py + side * 0.68);
    context.textAlign = 'left';
    context.textBaseline = 'alphabetic';
  }

  // THIẾU NGƯỜI: gạch chéo. Một công trình không có thợ vẫn đứng đó và vẫn tốn
  // tiền duy trì, nên nó phải khác hẳn về mặt thị giác với một công trình đang chạy.
  if (options.understaffed === true && side >= 8) {
    context.strokeStyle = 'rgba(160,48,48,0.62)';
    context.lineWidth = Math.max(0.8, side * 0.05);
    context.beginPath();
    context.moveTo(px, py);
    context.lineTo(px + side, py + side);
    context.moveTo(px + side, py);
    context.lineTo(px, py + side);
    context.stroke();
  }

  if (options.selected === true) {
    context.strokeStyle = '#e0c88a';
    context.lineWidth = 2;
    context.strokeRect(px - 2.5, py - 2.5, side + 5, side + 5);
  }

  context.restore();
}

/**
 * CÔNG TRƯỜNG — nhìn là biết ngay khác hẳn nhà đã xong.
 *
 * Nền đất bị đào xới, cọc đánh dấu bốn góc, giàn giáo quanh phần đã dựng, vật
 * liệu chất đống. Càng gần xong càng bớt ngổn ngang. Đây là chỗ duy nhất trên
 * bản đồ mà TIẾN ĐỘ đọc được bằng mắt mà không cần con số, và với một hàng đợi
 * xây dựng dài mười công trình thì đó là khác biệt giữa nhìn bản đồ và đọc bảng.
 */
export function drawSite(
  context: CanvasRenderingContext2D,
  view: View,
  at: Cell,
  size: number,
  skin: Skin,
  progress: number,
  selected = false,
): void {
  const [px, py] = toPx(view, at.x, at.y);
  const side = Math.max(3, size * view.scale);
  const done = Math.max(0, Math.min(1, progress));

  context.save();

  // 1. nền đất đào xới — rìa lởm chởm, không phải một ô vuông sạch sẽ
  context.fillStyle = '#5a4a35';
  context.beginPath();
  const segments = 14;
  for (let index = 0; index <= segments; index++) {
    const angle = (index / segments) * Math.PI * 2;
    const wobble = 1 + (Math.sin(angle * 3 + size) + Math.cos(angle * 5)) * 0.035;
    const x = px + side / 2 + Math.cos(angle) * (side / 2 + side * 0.06) * wobble;
    const y = py + side / 2 + Math.sin(angle) * (side / 2 + side * 0.06) * wobble;
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  }
  context.closePath();
  context.fill();

  // 2. phần đã dựng — dâng từ dưới lên theo tiến độ
  if (done > 0.05) {
    const height = side * 0.82 * done;
    context.globalAlpha = 0.55 + done * 0.4;
    context.fillStyle = skin.wall;
    context.fillRect(px + side * 0.09, py + side * 0.9 - height, side * 0.82, height);
    context.globalAlpha = 1;
  }

  // 3. giàn giáo — dày nhất lúc dựng dở, thưa dần khi sắp xong
  const scaffold = Math.max(0, 1 - Math.abs(done - 0.45) * 1.6);
  if (scaffold > 0.05 && side > 12) {
    context.strokeStyle = `rgba(190,166,120,${String(0.35 + scaffold * 0.45)})`;
    context.lineWidth = Math.max(0.5, side * 0.016);
    for (let index = 0; index <= 4; index++) {
      const x = px + side * 0.06 + (side * 0.88 * index) / 4;
      context.beginPath();
      context.moveTo(x, py + side * 0.9);
      context.lineTo(x, py + side * 0.9 - side * 0.75 * Math.max(done, 0.25));
      context.stroke();
    }
    for (let index = 1; index <= 2; index++) {
      const y = py + side * 0.9 - (side * 0.7 * index) / 3;
      context.beginPath();
      context.moveTo(px + side * 0.06, y);
      context.lineTo(px + side * 0.94, y);
      context.stroke();
    }
  }

  // 4. cọc đánh dấu bốn góc — luôn có, kể cả khi mới động thổ
  if (side > 8) {
    context.fillStyle = '#c9b489';
    const stake = Math.max(1, side * 0.035);
    for (const [dx, dy] of [
      [0, 0],
      [side - stake, 0],
      [0, side - stake],
      [side - stake, side - stake],
    ]) {
      context.fillRect(px + (dx ?? 0), py + (dy ?? 0), stake, stake * 2.2);
    }
  }

  // 5. vật liệu chất đống — nhiều lúc đầu, vơi dần về cuối
  if (side > 16) {
    const piles = Math.max(0, Math.ceil(3 * (1 - done)));
    for (let index = 0; index < piles; index++) {
      const x = px + side * (0.12 + index * 0.16);
      const y = py + side * 0.14;
      const radius = Math.max(1.2, side * 0.06);
      context.fillStyle = index % 2 === 0 ? '#7d6a4a' : '#6f6a63';
      context.beginPath();
      context.moveTo(x - radius, y + radius);
      context.lineTo(x, y - radius);
      context.lineTo(x + radius, y + radius);
      context.closePath();
      context.fill();
    }
  }

  // 6. viền nét đứt — phân biệt hẳn với công trình đã xong
  context.strokeStyle = selected ? '#e0c88a' : 'rgba(214,190,130,0.75)';
  context.setLineDash([Math.max(2, side * 0.06), Math.max(2, side * 0.05)]);
  context.lineWidth = Math.max(0.8, side * 0.022);
  context.strokeRect(px, py, side, side);
  context.setLineDash([]);
  context.restore();
}

/** BÓNG ĐẶT — khuôn viên đang theo con trỏ, xanh là được, đỏ là không. */
export function drawGhost(
  context: CanvasRenderingContext2D,
  view: View,
  at: Cell,
  size: number,
  clearance: number,
  ok: boolean,
): void {
  const [px, py] = toPx(view, at.x, at.y);
  const side = Math.max(3, size * view.scale);

  // Khoảng thở vẽ trước và vẽ mờ: nó là lý do phần lớn các chỗ đặt bị từ chối,
  // và người chơi không đoán ra được nếu không thấy nó.
  if (clearance > 0) {
    const pad = clearance * view.scale;
    context.strokeStyle = ok ? 'rgba(176,141,79,0.42)' : 'rgba(160,48,48,0.42)';
    context.setLineDash([4, 4]);
    context.lineWidth = 1;
    context.strokeRect(px - pad, py - pad, side + pad * 2, side + pad * 2);
    context.setLineDash([]);
  }

  context.fillStyle = ok ? 'rgba(120,180,110,0.3)' : 'rgba(180,60,60,0.3)';
  context.fillRect(px, py, side, side);
  context.strokeStyle = ok ? 'rgba(150,215,135,0.95)' : 'rgba(226,110,110,0.95)';
  context.lineWidth = 2;
  context.strokeRect(px, py, side, side);
}

// ---------------------------------------------------------------------------
// Mạch tài nguyên
// ---------------------------------------------------------------------------

/**
 * Vùng tài nguyên — đa giác bám địa mạo, độ đậm theo TRỮ LƯỢNG.
 *
 * Bậc trữ lượng đọc được bằng độ đậm chứ không bằng một con số nổi lên: một
 * mạch sắp cạn nhạt dần trên bản đồ TRƯỚC KHI nó cạn hẳn, nên người chơi có mấy
 * năm để đi tìm mỏ khác thay vì phát hiện ra vào cái tuần xưởng rèn dừng lại.
 */
export function drawNode(
  context: CanvasRenderingContext2D,
  view: View,
  node: ResourceNode,
  options: { selected?: boolean; worked?: boolean; showCoverage?: boolean; showIcon?: boolean } = {},
): void {
  const colour = ZONE_COLOURS[node.zone] ?? '#888';
  const [nx, ny] = toPx(view, node.at.x, node.at.y);

  if (options.showCoverage !== false && node.coverage.length >= 3) {
    context.globalAlpha = node.grade <= 0 ? 0.12 : 0.12 + node.grade * 0.08;
    context.fillStyle = colour;
    context.beginPath();
    for (let index = 0; index < node.coverage.length; index++) {
      const point = node.coverage[index];
      if (point === undefined) continue;
      const [px, py] = toPx(view, point.x, point.y);
      if (index === 0) context.moveTo(px, py);
      else context.lineTo(px, py);
    }
    context.closePath();
    context.fill();
    context.globalAlpha = 1;

    context.strokeStyle = options.selected === true ? '#e0c88a' : options.worked === true ? 'rgba(224,200,138,0.8)' : colour;
    context.lineWidth = options.selected === true ? 2.5 : options.worked === true ? 1.6 : 1;
    if (options.selected !== true) {
      context.setLineDash([Math.max(3, 10 * view.scale), Math.max(2, 7 * view.scale)]);
    }
    context.stroke();
    context.setLineDash([]);
  }

  if (options.showIcon !== false && view.scale > 0.1) {
    const radius = Math.max(6, 10 * view.scale);
    context.globalAlpha = node.grade <= 0 ? 0.4 : 0.9;
    context.fillStyle = 'rgba(8,10,14,0.72)';
    context.beginPath();
    context.arc(nx, ny, radius, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = colour;
    context.font = `${String(Math.max(9, 12 * view.scale))}px serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(ZONE_ICONS[node.zone] ?? '●', nx, ny + 0.5);
    context.textAlign = 'left';
    context.textBaseline = 'alphabetic';
    context.globalAlpha = 1;
  }
}

export function nodeLabel(node: ResourceNode): string {
  const zone = NODE_ZONE_DEFS[node.zone]?.name ?? node.zone;
  return `${zone} (${GRADE_LABEL[node.grade] ?? '?'})`;
}

// ---------------------------------------------------------------------------
// Nhãn và thước
// ---------------------------------------------------------------------------

/** Chữ có viền tối — cách duy nhất để một cái tên đọc được trên cả cỏ lẫn đá. */
export function drawLabel(
  context: CanvasRenderingContext2D,
  text: string,
  px: number,
  py: number,
  size: number,
  colour = '#e8d9a8',
  angle = 0,
): void {
  context.save();
  context.translate(px, py);
  if (angle !== 0) context.rotate(angle);
  context.font = `${String(size)}px sans-serif`;
  context.textAlign = 'center';
  context.lineWidth = 3.5;
  context.strokeStyle = 'rgba(8,10,14,0.9)';
  context.strokeText(text, 0, 0);
  context.fillStyle = colour;
  context.fillText(text, 0, 0);
  context.textAlign = 'left';
  context.restore();
}

/**
 * THƯỚC TỈ LỆ.
 *
 * Cái vạch nhỏ này biến cả bản đồ từ một bức tranh thành một bản vẽ quy hoạch:
 * không có nó thì "cối xay cách sông một quãng" vẫn chỉ là cảm giác, và người
 * chơi không ước lượng nổi còn chen vừa cái gì vào chỗ trống kia.
 */
export function drawScaleBar(context: CanvasRenderingContext2D, view: View): void {
  const targets = [50, 100, 200, 500, 1000, 2000];
  const wanted = view.width * 0.16;
  const metres = targets.find((value) => (value / 5) * view.scale >= wanted) ?? targets[targets.length - 1] ?? 2000;
  const width = (metres / 5) * view.scale;
  const x = 14;
  const y = view.height - 18;

  context.save();
  context.fillStyle = 'rgba(12, 10, 8, 0.62)';
  context.fillRect(x - 6, y - 14, width + 12, 24);
  context.strokeStyle = '#e0d6bd';
  context.lineWidth = 1.5;
  context.beginPath();
  context.moveTo(x, y);
  context.lineTo(x + width, y);
  context.moveTo(x, y - 4);
  context.lineTo(x, y + 4);
  context.moveTo(x + width, y - 4);
  context.lineTo(x + width, y + 4);
  context.stroke();
  context.fillStyle = '#e0d6bd';
  context.font = '10px sans-serif';
  context.fillText(`${String(metres)} thước`, x + 3, y - 4);
  context.restore();
}

/** Ranh giới tầm với — ngoài nó là đất chưa khai phá, tối đi để nói rõ điều ấy. */
export function drawPlanningEdge(context: CanvasRenderingContext2D, view: View, centre: Cell, radius: number): void {
  const [cx, cy] = toPx(view, centre.x, centre.y);
  const r = radius * view.scale;

  context.save();
  context.beginPath();
  context.rect(0, 0, view.width, view.height);
  context.arc(cx, cy, r, 0, Math.PI * 2, true);
  context.fillStyle = 'rgba(6, 8, 12, 0.46)';
  context.fill('evenodd');
  context.restore();

  context.beginPath();
  context.arc(cx, cy, r, 0, Math.PI * 2);
  context.strokeStyle = 'rgba(176, 141, 79, 0.5)';
  context.setLineDash([10, 8]);
  context.lineWidth = 1.4;
  context.stroke();
  context.setLineDash([]);
}
