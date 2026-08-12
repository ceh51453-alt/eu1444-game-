import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type WheelEvent as ReactWheelEvent,
} from 'react';
import { regionName } from '@/lore/regions';
import {
  MAP_IMAGE_HEIGHT,
  MAP_IMAGE_WIDTH,
  buildPlayerJourney,
  pointAlongPolyline,
  projectWorldToImage,
  worldPointOf,
  type PlayerJourney,
  type WorldPoint,
} from './mapMotion';

export interface MedievalMapProps {
  hereRegionId: string;
}

interface Camera {
  zoom: number;
  centerX: number;
  centerY: number;
}

interface JourneyState {
  route: PlayerJourney | null;
  moving: boolean;
  progress: number;
}

interface RememberedPlayer {
  regionId: string;
  point: WorldPoint;
}

interface PointerSample {
  x: number;
  y: number;
}

interface PinchSample {
  distance: number;
  middleX: number;
  middleY: number;
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 5;
const DEFAULT_ZOOM = 1.45;
const MAP_SOURCE = 'https://commons.wikimedia.org/wiki/File:Map_Of_Europe_In_1444.jpg';

/**
 * Ghi nhớ giữa hai lần mở tab. Vị trí thật vẫn nằm trong save; biến này
 * chỉ giữ điểm marker đã được người chơi nhìn thấy, để lần mở sau có
 * thể vẽ chuyến đi thay vì “dịch chuyển” tới vùng mới.
 */
let rememberedPlayer: RememberedPlayer | null = null;

function clampCamera(camera: Camera): Camera {
  const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, camera.zoom));
  const halfWidth = MAP_IMAGE_WIDTH / zoom / 2;
  const halfHeight = MAP_IMAGE_HEIGHT / zoom / 2;
  return {
    zoom,
    centerX: Math.max(halfWidth, Math.min(MAP_IMAGE_WIDTH - halfWidth, camera.centerX)),
    centerY: Math.max(halfHeight, Math.min(MAP_IMAGE_HEIGHT - halfHeight, camera.centerY)),
  };
}

function cameraAt(point: WorldPoint | null, zoom = DEFAULT_ZOOM): Camera {
  const image = point === null ? { x: MAP_IMAGE_WIDTH / 2, y: MAP_IMAGE_HEIGHT / 2 } : projectWorldToImage(point);
  return clampCamera({ zoom, centerX: image.x, centerY: image.y });
}

function formatHemisphere(value: number, positive: string, negative: string): string {
  return `${Math.abs(value).toFixed(2)}°${value >= 0 ? positive : negative}`;
}

function geographicalCoordinates(point: WorldPoint): string {
  const latitude = 62 - point.y / 111;
  const longitude = point.x / (111 * Math.cos((50 * Math.PI) / 180)) - 12;
  return `${formatHemisphere(latitude, 'B', 'N')} · ${formatHemisphere(longitude, 'Đ', 'T')}`;
}

function easeInOut(progress: number): number {
  const value = Math.max(0, Math.min(1, progress));
  return value * value * (3 - 2 * value);
}

function useAnimatedPlayer(regionId: string): {
  position: WorldPoint | null;
  journey: JourneyState;
} {
  const target = worldPointOf(regionId);
  const [position, setPosition] = useState<WorldPoint | null>(() => rememberedPlayer?.point ?? target);
  const [journey, setJourney] = useState<JourneyState>({ route: null, moving: false, progress: 1 });

  useEffect(() => {
    const destination = worldPointOf(regionId);
    if (destination === null || regionId === '') {
      setPosition(null);
      setJourney({ route: null, moving: false, progress: 1 });
      return;
    }

    const previous = rememberedPlayer;
    if (previous === null || previous.regionId === regionId) {
      setPosition(destination);
      setJourney({ route: null, moving: false, progress: 1 });
      rememberedPlayer = { regionId, point: destination };
      return;
    }

    const route = buildPlayerJourney(previous.regionId, regionId);
    if (route === null || route.points.length < 2) {
      setPosition(destination);
      setJourney({ route, moving: false, progress: 1 });
      rememberedPlayer = { regionId, point: destination };
      return;
    }

    let animationFrame = 0;
    let startedAt: number | null = null;
    setPosition(previous.point);
    setJourney({ route, moving: true, progress: 0 });

    const step = (now: number): void => {
      startedAt ??= now;
      const rawProgress = Math.max(0, Math.min(1, (now - startedAt) / route.durationMs));
      const nextPoint = pointAlongPolyline(route.points, easeInOut(rawProgress));
      if (nextPoint !== null) setPosition(nextPoint);
      setJourney({ route, moving: rawProgress < 1, progress: rawProgress });

      if (rawProgress < 1) {
        animationFrame = window.requestAnimationFrame(step);
        return;
      }
      setPosition(destination);
      rememberedPlayer = { regionId, point: destination };
    };

    animationFrame = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(animationFrame);
  }, [regionId]);

  return { position, journey };
}

export function MedievalMap({ hereRegionId }: MedievalMapProps): ReactNode {
  const { position, journey } = useAnimatedPlayer(hereRegionId);
  const playerImage = position === null ? null : projectWorldToImage(position);
  const [camera, setCamera] = useState<Camera>(() => cameraAt(position));
  const svgRef = useRef<SVGSVGElement>(null);
  const pointers = useRef(new Map<number, PointerSample>());
  const pinch = useRef<PinchSample | null>(null);
  const dragging = useRef(false);
  const [draggingVisible, setDraggingVisible] = useState(false);

  const viewBox = useMemo(() => {
    const width = MAP_IMAGE_WIDTH / camera.zoom;
    const height = MAP_IMAGE_HEIGHT / camera.zoom;
    return `${String(camera.centerX - width / 2)} ${String(camera.centerY - height / 2)} ${String(width)} ${String(height)}`;
  }, [camera]);

  const routePoints = useMemo(() => {
    const points = journey.route?.points ?? [];
    return points
      .map(projectWorldToImage)
      .map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`)
      .join(' ');
  }, [journey.route]);

  const zoomAt = useCallback((factor: number, anchor?: { x: number; y: number }): void => {
    setCamera((previous) => {
      const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, previous.zoom * factor));
      const focus = anchor ?? { x: previous.centerX, y: previous.centerY };
      const ratio = previous.zoom / zoom;
      return clampCamera({
        zoom,
        centerX: focus.x + (previous.centerX - focus.x) * ratio,
        centerY: focus.y + (previous.centerY - focus.y) * ratio,
      });
    });
  }, []);

  const clientToMap = useCallback((clientX: number, clientY: number): { x: number; y: number } | null => {
    const svg = svgRef.current;
    const matrix = svg?.getScreenCTM();
    if (svg === null || svg === undefined || matrix === null || matrix === undefined) return null;
    const point = svg.createSVGPoint();
    point.x = clientX;
    point.y = clientY;
    const mapped = point.matrixTransform(matrix.inverse());
    return { x: mapped.x, y: mapped.y };
  }, []);

  const panByPixels = useCallback((deltaX: number, deltaY: number): void => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (rect === undefined || rect.width <= 0 || rect.height <= 0) return;
    setCamera((previous) => {
      const unitsPerPixel = Math.max(
        MAP_IMAGE_WIDTH / previous.zoom / rect.width,
        MAP_IMAGE_HEIGHT / previous.zoom / rect.height,
      );
      return clampCamera({
        ...previous,
        centerX: previous.centerX - deltaX * unitsPerPixel,
        centerY: previous.centerY - deltaY * unitsPerPixel,
      });
    });
  }, []);

  const onWheel = (event: ReactWheelEvent<SVGSVGElement>): void => {
    event.preventDefault();
    const anchor = clientToMap(event.clientX, event.clientY) ?? undefined;
    zoomAt(Math.exp(-event.deltaY * 0.0015), anchor);
  };

  const onPointerDown = (event: ReactPointerEvent<SVGSVGElement>): void => {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    dragging.current = pointers.current.size === 1;
    setDraggingVisible(true);

    if (pointers.current.size === 2) {
      const rows = [...pointers.current.values()];
      const left = rows[0];
      const right = rows[1];
      if (left !== undefined && right !== undefined) {
        pinch.current = {
          distance: Math.max(1, Math.hypot(right.x - left.x, right.y - left.y)),
          middleX: (left.x + right.x) / 2,
          middleY: (left.y + right.y) / 2,
        };
      }
      dragging.current = false;
    }
  };

  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>): void => {
    const previous = pointers.current.get(event.pointerId);
    if (previous === undefined) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointers.current.size >= 2) {
      const rows = [...pointers.current.values()];
      const left = rows[0];
      const right = rows[1];
      const oldPinch = pinch.current;
      if (left === undefined || right === undefined || oldPinch === null) return;
      const distance = Math.max(1, Math.hypot(right.x - left.x, right.y - left.y));
      const middleX = (left.x + right.x) / 2;
      const middleY = (left.y + right.y) / 2;
      panByPixels(middleX - oldPinch.middleX, middleY - oldPinch.middleY);
      zoomAt(distance / oldPinch.distance, clientToMap(middleX, middleY) ?? undefined);
      pinch.current = { distance, middleX, middleY };
      return;
    }

    if (dragging.current) panByPixels(event.clientX - previous.x, event.clientY - previous.y);
  };

  const releasePointer = (event: ReactPointerEvent<SVGSVGElement>): void => {
    pointers.current.delete(event.pointerId);
    pinch.current = null;
    dragging.current = pointers.current.size === 1;
    setDraggingVisible(pointers.current.size > 0);
  };

  const centerPlayer = (): void => {
    if (position !== null) setCamera(cameraAt(position, Math.max(DEFAULT_ZOOM, camera.zoom)));
  };

  const showOverview = (): void => {
    setCamera({ zoom: 1, centerX: MAP_IMAGE_WIDTH / 2, centerY: MAP_IMAGE_HEIGHT / 2 });
  };

  const regionLabel = hereRegionId === '' ? 'Chưa rõ vị trí' : regionName(hereRegionId);
  const markerScale = 1 / camera.zoom;
  const movingPercent = Math.round(journey.progress * 100);

  return (
    <section className="relative h-full min-h-[28rem] overflow-hidden bg-[#101311]" aria-label="Bản đồ châu Âu năm 1444">
      <svg
        ref={svgRef}
        viewBox={viewBox}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={`Vị trí người chơi: ${regionLabel}`}
        className={`h-full w-full select-none ${draggingVisible ? 'cursor-grabbing' : 'cursor-grab'}`}
        style={{ touchAction: 'none' }}
        onWheel={onWheel}
        onDoubleClick={(event) => zoomAt(1.65, clientToMap(event.clientX, event.clientY) ?? undefined)}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={releasePointer}
        onPointerCancel={releasePointer}
      >
        <image
          href="/assets/maps/europe-1444.jpg"
          x="0"
          y="0"
          width={MAP_IMAGE_WIDTH}
          height={MAP_IMAGE_HEIGHT}
          preserveAspectRatio="none"
          pointerEvents="none"
        />
        <rect x="0" y="0" width={MAP_IMAGE_WIDTH} height={MAP_IMAGE_HEIGHT} fill="#17130d" opacity="0.08" pointerEvents="none" />

        {routePoints !== '' && journey.moving && (
          <polyline
            points={routePoints}
            fill="none"
            stroke="#f4d58d"
            strokeWidth="3"
            strokeDasharray="8 7"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            opacity="0.9"
            pointerEvents="none"
          />
        )}

        {playerImage !== null && (
          <g transform={`translate(${String(playerImage.x)} ${String(playerImage.y)}) scale(${String(markerScale)})`} pointerEvents="none">
            <circle r="24" fill="#f4d58d" opacity="0.2" className={journey.moving ? 'map-player-pulse' : ''} />
            <circle r="12" fill="#18130d" stroke="#ffe1a0" strokeWidth="3" />
            <path d="M 0 -8 L 7 0 L 0 8 L -7 0 Z" fill="#f3c969" />
            <text
              x="18"
              y="4"
              fill="#fff4d6"
              stroke="#17130d"
              strokeWidth="4"
              paintOrder="stroke"
              fontSize="13"
              fontFamily="ui-serif, Georgia, serif"
            >
              Bạn đang ở đây
            </text>
          </g>
        )}
      </svg>

      <div className="absolute left-3 top-3 flex items-center gap-1 rounded-md border border-[#c6a15b]/50 bg-[#17130d]/90 p-1 shadow-xl backdrop-blur-sm">
        <button
          type="button"
          onClick={() => zoomAt(1.35)}
          className="grid h-8 w-8 place-items-center rounded border border-[#8e7245]/50 text-lg text-[#f5dfb3] hover:bg-[#6f552d]/40"
          aria-label="Phóng to bản đồ"
          title="Phóng to"
        >
          +
        </button>
        <button
          type="button"
          onClick={() => zoomAt(1 / 1.35)}
          className="grid h-8 w-8 place-items-center rounded border border-[#8e7245]/50 text-lg text-[#f5dfb3] hover:bg-[#6f552d]/40"
          aria-label="Thu nhỏ bản đồ"
          title="Thu nhỏ"
        >
          −
        </button>
        <span className="min-w-12 px-1 text-center font-mono text-[11px] text-[#dec79b]">{camera.zoom.toFixed(2)}×</span>
        <button
          type="button"
          onClick={centerPlayer}
          disabled={position === null}
          className="h-8 rounded border border-[#8e7245]/50 px-2 text-[11px] text-[#f5dfb3] hover:bg-[#6f552d]/40 disabled:opacity-40"
        >
          Về người chơi
        </button>
        <button
          type="button"
          onClick={showOverview}
          className="h-8 rounded border border-[#8e7245]/50 px-2 text-[11px] text-[#f5dfb3] hover:bg-[#6f552d]/40"
        >
          Toàn cảnh
        </button>
      </div>

      <div className="pointer-events-none absolute bottom-3 left-3 max-w-[min(28rem,calc(100%-1.5rem))] rounded-md border border-[#c6a15b]/50 bg-[#17130d]/92 px-3 py-2 shadow-xl backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${journey.moving ? 'bg-[#f3c969] map-player-pulse' : 'bg-[#8eb177]'}`} />
          <p className="truncate text-sm text-[#fff0cf]">{regionLabel}</p>
          {journey.moving && <span className="font-mono text-[10px] text-[#f3c969]">đang di chuyển {String(movingPercent)}%</span>}
        </div>
        {position !== null ? (
          <>
            <p className="mt-1 font-mono text-xs text-[#dec79b]">
              X {position.x.toFixed(1)} km · Y {position.y.toFixed(1)} km
            </p>
            <p className="font-mono text-[10px] text-[#bba77f]">{geographicalCoordinates(position)}</p>
          </>
        ) : (
          <p className="mt-1 text-xs text-[#d89a78]">Vùng hiện tại chưa có mốc tọa độ trên bản đồ.</p>
        )}
        {journey.route !== null && journey.moving && (
          <p className="mt-1 text-[10px] text-[#bba77f]">
            Tuyến {String(journey.route.km)} km · {String(journey.route.hops)} chặng
            {journey.route.fallback ? ' · băng đồng' : ''}
          </p>
        )}
      </div>

      <div className="absolute bottom-3 right-3 rounded bg-[#17130d]/80 px-2 py-1 text-[9px] text-[#d3bf98]/70 backdrop-blur-sm">
        Kéo để di chuyển · lăn/chụm để thu phóng ·{' '}
        <a href={MAP_SOURCE} target="_blank" rel="noreferrer" className="underline hover:text-[#ffe1a0]">
          bản đồ Wikimedia · CC0
        </a>
      </div>
    </section>
  );
}
