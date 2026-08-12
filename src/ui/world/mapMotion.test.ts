import { describe, expect, it } from 'vitest';
import {
  MAP_IMAGE_HEIGHT,
  MAP_IMAGE_WIDTH,
  buildPlayerJourney,
  journeyDurationMs,
  pointAlongPolyline,
  projectWorldToImage,
} from './mapMotion';

describe('chuyển động trên bản đồ', () => {
  it('nội suy theo khoảng cách thay vì nhảy đều qua từng chặng', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 110, y: 0 },
    ];
    expect(pointAlongPolyline(points, 0)).toEqual(points[0]);
    expect(pointAlongPolyline(points, 0.5)).toEqual({ x: 55, y: 0 });
    expect(pointAlongPolyline(points, 1)).toEqual(points[2]);
  });

  it('giữ thời lượng trong giới hạn nhưng chuyến xa vẫn lâu hơn', () => {
    expect(journeyDurationMs(0)).toBe(1200);
    expect(journeyDurationMs(500)).toBeGreaterThan(journeyDurationMs(10));
    expect(journeyDurationMs(100_000)).toBe(6500);
  });

  it('dùng tuyến thật của engine và giữ đúng hai đầu', () => {
    const journey = buildPlayerJourney('realm_france', 'hold_constantinople');
    expect(journey).not.toBeNull();
    expect(journey?.km).toBeGreaterThan(0);
    expect(journey?.points.length).toBeGreaterThan(1);
    expect(journey?.routeIds[0]).toBe('realm_france');
    expect(journey?.routeIds.at(-1)).toBe('hold_constantinople');
  });

  it('không chiếu marker ra ngoài khung ảnh', () => {
    for (const point of [
      { x: -50_000, y: -50_000 },
      { x: 0, y: 0 },
      { x: 50_000, y: 50_000 },
    ]) {
      const image = projectWorldToImage(point);
      expect(image.x).toBeGreaterThanOrEqual(0);
      expect(image.x).toBeLessThanOrEqual(MAP_IMAGE_WIDTH);
      expect(image.y).toBeGreaterThanOrEqual(0);
      expect(image.y).toBeLessThanOrEqual(MAP_IMAGE_HEIGHT);
    }
  });

  it('neo Trung Âu và Ý theo ảnh lịch sử thay vì sơ đồ mạng đã nới', () => {
    expect(projectWorldToImage({ x: 1440, y: 1687 }).x).toBeCloseTo(1425, 0); // Thụy Sĩ
    expect(projectWorldToImage({ x: 1748, y: 1843 }).x).toBeCloseTo(1580, 0); // Venice
    expect(projectWorldToImage({ x: 2248, y: 1610 }).x).toBeCloseTo(1930, 0); // Ba Lan/Hungary
    expect(projectWorldToImage({ x: 3539, y: 694 }).x).toBeCloseTo(2670, 0); // Muscovy
  });
});
