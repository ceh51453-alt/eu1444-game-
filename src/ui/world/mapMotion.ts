import { coordsOf, findRoute } from '@/sim/map';

export interface WorldPoint {
  /** Kilômét về phía đông tính từ kinh tuyến 12°T. */
  x: number;
  /** Kilômét về phía nam tính từ vĩ tuyến 62°B. */
  y: number;
}

export interface ImagePoint {
  x: number;
  y: number;
}

export interface PlayerJourney {
  points: WorldPoint[];
  routeIds: string[];
  km: number;
  hops: number;
  fallback: boolean;
  durationMs: number;
}

export const MAP_IMAGE_WIDTH = 3840;
export const MAP_IMAGE_HEIGHT = 2715;

/**
 * Bảng này là các mốc hiệu chỉnh đông–tây đo trực tiếp trên ảnh 3840px.
 * Không được lấy khoảng cách nút của chiến đồ để làm mốc: dữ liệu ấy từng
 * cố ý nới Trung Âu cho sơ đồ mạng, khiến Ý, Ba Lan và Hungary trôi hàng
 * trăm pixel về phía đông khi phủ lên bản đồ lịch sử thật.
 */
const X_CALIBRATION: readonly (readonly [worldKm: number, imagePx: number])[] = [
  [0, 330],
  [271, 510],
  [749, 990],
  [1035, 1170],
  [1440, 1425],
  [1570, 1480],
  [1748, 1580],
  [2024, 1760],
  [2248, 1930],
  [2660, 2180],
  [2924, 2350],
  [3539, 2670],
  [4359, 3105],
  [5000, 3470],
] as const;

/** Mốc hiệu chỉnh bắc–nam trên cùng ảnh. */
const Y_CALIBRATION: readonly (readonly [worldKm: number, imagePx: number])[] = [
  [0, 390],
  [300, 545],
  [700, 760],
  [1100, 1060],
  [1330, 1260],
  [1610, 1450],
  [1850, 1640],
  [2230, 1870],
  [2500, 2025],
  [2870, 2185],
  [3200, 2350],
] as const;

function interpolateCalibration(value: number, rows: readonly (readonly [number, number])[]): number {
  const first = rows[0];
  const last = rows[rows.length - 1];
  if (first === undefined || last === undefined) return value;
  if (value <= first[0]) return first[1];
  if (value >= last[0]) return last[1];

  for (let index = 1; index < rows.length; index++) {
    const right = rows[index];
    const left = rows[index - 1];
    if (right === undefined || left === undefined || value > right[0]) continue;
    const span = right[0] - left[0];
    const progress = span <= 0 ? 0 : (value - left[0]) / span;
    return left[1] + (right[1] - left[1]) * progress;
  }
  return last[1];
}

/**
 * Đổi hệ kilômét của mô phỏng sang pixel của ảnh. Hiệu chỉnh dọc nhẹ
 * theo kinh độ bù cho các kinh tuyến hội tụ về phía bắc trên bản đồ gốc.
 */
export function projectWorldToImage(point: WorldPoint): ImagePoint {
  const x = interpolateCalibration(point.x, X_CALIBRATION);
  const north = Math.max(0, Math.min(1, (1700 - point.y) / 1500));
  const westCurve = Math.max(-1, Math.min(1, (1500 - point.x) / 1800));
  const eastCurve = Math.max(0, Math.min(1, (point.x - 2400) / 1800));
  const curve = westCurve * north * 125 - eastCurve * north * 105;
  const y = interpolateCalibration(point.y, Y_CALIBRATION) + curve;
  return {
    x: Math.max(0, Math.min(MAP_IMAGE_WIDTH, x)),
    y: Math.max(0, Math.min(MAP_IMAGE_HEIGHT, y)),
  };
}

/** Nội suy theo ĐỘ DÀI cả tuyến, không chia đều thời gian cho mỗi chặng. */
export function pointAlongPolyline(points: readonly WorldPoint[], progress: number): WorldPoint | null {
  const first = points[0];
  if (first === undefined) return null;
  if (points.length === 1) return first;

  const lengths: number[] = [];
  let total = 0;
  for (let index = 1; index < points.length; index++) {
    const left = points[index - 1];
    const right = points[index];
    if (left === undefined || right === undefined) continue;
    const length = Math.hypot(right.x - left.x, right.y - left.y);
    lengths.push(length);
    total += length;
  }
  if (total <= 0) return points[points.length - 1] ?? first;

  let remaining = Math.max(0, Math.min(1, progress)) * total;
  for (let index = 1; index < points.length; index++) {
    const left = points[index - 1];
    const right = points[index];
    const length = lengths[index - 1] ?? 0;
    if (left === undefined || right === undefined) continue;
    if (remaining > length && index < points.length - 1) {
      remaining -= length;
      continue;
    }
    const local = length <= 0 ? 1 : Math.max(0, Math.min(1, remaining / length));
    return {
      x: left.x + (right.x - left.x) * local,
      y: left.y + (right.y - left.y) * local,
    };
  }
  return points[points.length - 1] ?? first;
}

export function journeyDurationMs(km: number): number {
  return Math.round(Math.max(1200, Math.min(6500, 900 + Math.max(0, km) * 1.25)));
}

/** Dùng chính Dijkstra của mô phỏng; UI không phát minh ra một “đường thẳng” khác. */
export function buildPlayerJourney(fromRegionId: string, toRegionId: string): PlayerJourney | null {
  const from = coordsOf(fromRegionId);
  const to = coordsOf(toRegionId);
  if (from === null || to === null) return null;

  const route = findRoute(fromRegionId, toRegionId);
  const points = route.path
    .map((regionId) => coordsOf(regionId))
    .filter((point): point is WorldPoint => point !== null)
    .filter((point, index, rows) => index === 0 || point.x !== rows[index - 1]?.x || point.y !== rows[index - 1]?.y);

  if (points.length === 0) points.push(from, to);
  if (points[0]?.x !== from.x || points[0]?.y !== from.y) points.unshift(from);
  const last = points[points.length - 1];
  if (last?.x !== to.x || last.y !== to.y) points.push(to);

  return {
    points,
    routeIds: route.path,
    km: route.km,
    hops: route.hops,
    fallback: route.fallback,
    durationMs: journeyDurationMs(route.km),
  };
}

export function worldPointOf(regionId: string): WorldPoint | null {
  return coordsOf(regionId);
}
