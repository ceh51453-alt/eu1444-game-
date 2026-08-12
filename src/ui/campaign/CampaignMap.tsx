/**
 * CHIẾN ĐỒ — mặt vẽ trên bản đồ châu Âu 1444 thật.
 *
 * `gx/gy` của mọi nút là tọa độ kilomet dùng chung với mô phỏng thế giới. Mặt
 * vẽ chiếu chúng lên ảnh lịch sử 3840×2715; ba cấp chỉ đổi độ gần và lượng chi
 * tiết, không đổi hệ địa lý. Quyền kiểm soát được thể hiện bằng quân hiệu phủ
 * lên bản đồ thay vì thay đường biên lịch sử của ảnh nền.
 */

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
import {
  ancestorAtLevel,
  campaignNode,
  childrenOfNode,
  conquestOf,
  factionColor,
  isObjective,
  linksOf,
  nodesAtLevel,
  paintOf,
  placementOf,
  terrainRow,
  type CampaignArmy,
  type CampaignLevel,
  type CampaignNode,
  type CampaignSliceState,
} from '@/systems/campaign';
import { MAP_IMAGE_HEIGHT, MAP_IMAGE_WIDTH, projectWorldToImage, worldPointOf } from '@/ui/world/mapMotion';

export interface CampaignMapProps {
  campaign: CampaignSliceState;
  /** Nút đang mở. Rỗng là đang xem cả châu lục ở tầng quốc gia. */
  focusId: string;
  selectedId: string;
  /** Phe của người chơi — dùng để tính tiến độ chinh phục hiện trên quân hiệu. */
  playerFactionId: string;
  /** Ô mà nhân vật người chơi đang đứng, nếu nhìn thấy được ở tầng này. */
  hereNodeId: string;
  onSelect: (nodeId: string) => void;
  onDrill: (nodeId: string) => void;
}

interface Camera {
  zoom: number;
  cx: number;
  cy: number;
}

interface Box {
  minX: number;
  minY: number;
  width: number;
  height: number;
}

interface MapNode {
  node: CampaignNode;
  x: number;
  y: number;
}

interface MapExit {
  from: MapNode;
  toName: string;
  dx: number;
  dy: number;
  kind: string;
}

const MIN_ZOOM = 0.85;
const MAX_ZOOM = 10;
const MAP_SOURCE = 'https://commons.wikimedia.org/wiki/File:Map_Of_Europe_In_1444.jpg';

function mapPoint(node: CampaignNode): { x: number; y: number } {
  // Nút có thật trong regions.json phải bám đúng tọa độ của bản đồ thế giới.
  // gx/gy của chiến đồ đã từng bị nới để sơ đồ tròn không chồng nhãn, nên chỉ
  // dùng độ lệch của chúng cho các vùng/huyện được sinh thêm. Độ lệch phải neo
  // vào vị trí thật của nút cha; nếu dùng gx/gy tuyệt đối, cả cụm sẽ trôi theo
  // tâm của sơ đồ cũ (dễ thấy nhất ở các huyện sinh thêm của Normandy).
  const exact = node.regionId === null ? null : worldPointOf(node.regionId);
  if (exact !== null) return projectWorldToImage(exact);
  const parent = node.parentId === null ? null : campaignNode(node.parentId);
  if (parent === null) return projectWorldToImage({ x: node.gx, y: node.gy });
  const parentExact = parent.regionId === null ? null : worldPointOf(parent.regionId);
  const parentAnchor = parentExact ?? { x: parent.gx, y: parent.gy };
  const offsetScale = node.level === 3 ? 0.62 : 0.85;
  const grandParent = parent.parentId === null ? null : campaignNode(parent.parentId);
  const grandExact = grandParent?.regionId === null || grandParent === null ? null : worldPointOf(grandParent.regionId);
  const grandAnchor = grandParent === null ? null : (grandExact ?? { x: grandParent.gx, y: grandParent.gy });
  const inwardDx = grandAnchor === null ? 0 : grandAnchor.x - parentAnchor.x;
  const inwardDy = grandAnchor === null ? 0 : grandAnchor.y - parentAnchor.y;
  const inwardLength = Math.hypot(inwardDx, inwardDy) || 1;
  const inward = node.level === 3 && !parent.water && !parent.island ? 50 : 0;
  return projectWorldToImage({
    x: parentAnchor.x + (node.gx - parent.gx) * offsetScale + (inwardDx / inwardLength) * inward,
    y: parentAnchor.y + (node.gy - parent.gy) * offsetScale + (inwardDy / inwardLength) * inward,
  });
}

function boundsOf(rows: readonly MapNode[], level: CampaignLevel): Box {
  if (rows.length === 0) return { minX: 0, minY: 0, width: MAP_IMAGE_WIDTH, height: MAP_IMAGE_HEIGHT };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const row of rows) {
    minX = Math.min(minX, row.x);
    minY = Math.min(minY, row.y);
    maxX = Math.max(maxX, row.x);
    maxY = Math.max(maxY, row.y);
  }
  const span = Math.max(maxX - minX, maxY - minY, 1);
  const padding = level === 1 ? Math.max(150, span * 0.08) : level === 2 ? Math.max(130, span * 0.28) : Math.max(105, span * 0.38);
  const left = Math.max(0, minX - padding);
  const top = Math.max(0, minY - padding);
  const right = Math.min(MAP_IMAGE_WIDTH, maxX + padding);
  const bottom = Math.min(MAP_IMAGE_HEIGHT, maxY + padding);
  return { minX: left, minY: top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) };
}

/** Cỡ biểu tượng theo khung vừa vặn, để mọi cấp có quân hiệu cỡ màn hình như nhau. */
function scaleOf(box: Box): number {
  return Math.max(box.width, box.height) / 1000;
}

function clampAxis(value: number, half: number, limit: number): number {
  if (half * 2 >= limit) return limit / 2;
  return Math.max(half, Math.min(limit - half, value));
}

function clampCamera(camera: Camera, box: Box): Camera {
  const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, camera.zoom));
  const halfWidth = box.width / zoom / 2;
  const halfHeight = box.height / zoom / 2;
  return {
    zoom,
    cx: clampAxis(camera.cx, halfWidth, MAP_IMAGE_WIDTH),
    cy: clampAxis(camera.cy, halfHeight, MAP_IMAGE_HEIGHT),
  };
}

function centerOf(box: Box): { x: number; y: number } {
  return { x: box.minX + box.width / 2, y: box.minY + box.height / 2 };
}

function curvePath(a: { x: number; y: number }, b: { x: number; y: number }, key: string, scale: number): string {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy) || 1;
  const sign = [...key].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 2 === 0 ? 1 : -1;
  const bend = Math.min(28 * scale, length * 0.1) * sign;
  const cx = (a.x + b.x) / 2 - (dy / length) * bend;
  const cy = (a.y + b.y) / 2 + (dx / length) * bend;
  return `M ${a.x.toFixed(1)} ${a.y.toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
}

export function CampaignMap({
  campaign,
  focusId,
  selectedId,
  playerFactionId,
  hereNodeId,
  onSelect,
  onDrill,
}: CampaignMapProps): ReactNode {
  const svgRef = useRef<SVGSVGElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ distance: number; mx: number; my: number } | null>(null);
  const dragging = useRef(false);
  const moved = useRef(0);
  const [camera, setCamera] = useState<Camera>({ zoom: 1, cx: 0, cy: 0 });

  const focus = focusId === '' ? null : campaignNode(focusId);
  const level: CampaignLevel = focus === null ? 1 : focus.level === 1 ? 2 : 3;
  const nodes = useMemo(() => (focus === null ? [...nodesAtLevel(1)] : [...childrenOfNode(focus.id)]), [focus]);
  const placed = useMemo<MapNode[]>(() => nodes.map((node) => ({ node, ...mapPoint(node) })), [nodes]);
  const pointById = useMemo(() => new Map(placed.map((row) => [row.node.id, row] as const)), [placed]);
  const box = useMemo(() => boundsOf(placed, level), [placed, level]);
  const baseScale = scaleOf(box);
  const drawScale = baseScale / camera.zoom;
  const visible = useMemo(() => new Set(nodes.map((node) => node.id)), [nodes]);

  useEffect(() => {
    setCamera({ zoom: 1, cx: 0, cy: 0 });
  }, [focusId]);

  const { inner, exits } = useMemo(() => {
    const seen = new Set<string>();
    const innerRows: { a: MapNode; b: MapNode; kind: string }[] = [];
    const exitRows: MapExit[] = [];
    for (const row of placed) {
      for (const link of linksOf(row.node.id)) {
        const otherId = link.a === row.node.id ? link.b : link.a;
        const key = link.a < link.b ? `${link.a}|${link.b}` : `${link.b}|${link.a}`;
        if (visible.has(otherId)) {
          if (seen.has(key)) continue;
          seen.add(key);
          const other = pointById.get(otherId);
          if (other !== undefined) innerRows.push({ a: row, b: other, kind: link.kind });
          continue;
        }
        const otherNode = campaignNode(otherId);
        if (otherNode === null) continue;
        const otherPoint = mapPoint(otherNode);
        const length = Math.hypot(otherPoint.x - row.x, otherPoint.y - row.y) || 1;
        exitRows.push({
          from: row,
          toName: (otherNode.parentId === null ? otherNode : (campaignNode(otherNode.parentId) ?? otherNode)).name,
          dx: (otherPoint.x - row.x) / length,
          dy: (otherPoint.y - row.y) / length,
          kind: link.kind,
        });
      }
    }
    return { inner: innerRows, exits: exitRows };
  }, [placed, pointById, visible]);

  const armies = useMemo(() => {
    const rows: { army: CampaignArmy; x: number; y: number; moving: boolean }[] = [];
    for (const army of campaign.armies) {
      const placement = placementOf(army);
      const from = ancestorAtLevel(placement.fromId, level);
      if (from === null || !visible.has(from.id)) continue;
      const fromPoint = pointById.get(from.id);
      if (fromPoint === undefined) continue;
      const to = placement.toId === '' ? null : ancestorAtLevel(placement.toId, level);
      const toPoint = to === null ? undefined : pointById.get(to.id);
      if (!placement.moving || to === null || to.id === from.id || toPoint === undefined) {
        rows.push({ army, x: fromPoint.x, y: fromPoint.y, moving: placement.moving });
        continue;
      }
      rows.push({
        army,
        x: fromPoint.x + (toPoint.x - fromPoint.x) * placement.t,
        y: fromPoint.y + (toPoint.y - fromPoint.y) * placement.t,
        moving: true,
      });
    }
    return rows;
  }, [campaign.armies, level, pointById, visible]);

  const resolvedCamera = useMemo(() => {
    const center = centerOf(box);
    return clampCamera({ zoom: camera.zoom, cx: camera.cx === 0 && camera.cy === 0 ? center.x : camera.cx, cy: camera.cx === 0 && camera.cy === 0 ? center.y : camera.cy }, box);
  }, [box, camera]);

  const viewBox = useMemo(() => {
    const width = box.width / resolvedCamera.zoom;
    const height = box.height / resolvedCamera.zoom;
    return `${String(resolvedCamera.cx - width / 2)} ${String(resolvedCamera.cy - height / 2)} ${String(width)} ${String(height)}`;
  }, [box, resolvedCamera]);

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

  const zoomAt = useCallback(
    (factor: number, anchor?: { x: number; y: number }): void => {
      setCamera((previous) => {
        const center = centerOf(box);
        const previousResolved = clampCamera({
          zoom: previous.zoom,
          cx: previous.cx === 0 && previous.cy === 0 ? center.x : previous.cx,
          cy: previous.cx === 0 && previous.cy === 0 ? center.y : previous.cy,
        }, box);
        const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, previousResolved.zoom * factor));
        const focusPoint = anchor ?? { x: previousResolved.cx, y: previousResolved.cy };
        const ratio = previousResolved.zoom / zoom;
        return clampCamera({
          zoom,
          cx: focusPoint.x + (previousResolved.cx - focusPoint.x) * ratio,
          cy: focusPoint.y + (previousResolved.cy - focusPoint.y) * ratio,
        }, box);
      });
    },
    [box],
  );

  const panByPixels = useCallback((deltaX: number, deltaY: number): void => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (rect === undefined || rect.width <= 0 || rect.height <= 0) return;
    setCamera((previous) => {
      const center = centerOf(box);
      const current = clampCamera({
        zoom: previous.zoom,
        cx: previous.cx === 0 && previous.cy === 0 ? center.x : previous.cx,
        cy: previous.cx === 0 && previous.cy === 0 ? center.y : previous.cy,
      }, box);
      const unitsPerPixel = Math.max(box.width / current.zoom / rect.width, box.height / current.zoom / rect.height);
      return clampCamera({ ...current, cx: current.cx - deltaX * unitsPerPixel, cy: current.cy - deltaY * unitsPerPixel }, box);
    });
  }, [box]);

  const onPointerDown = (event: ReactPointerEvent<SVGSVGElement>): void => {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    dragging.current = pointers.current.size === 1;
    moved.current = 0;
    if (pointers.current.size === 2) {
      const rows = [...pointers.current.values()];
      const left = rows[0];
      const right = rows[1];
      if (left !== undefined && right !== undefined) {
        pinch.current = {
          distance: Math.max(1, Math.hypot(right.x - left.x, right.y - left.y)),
          mx: (left.x + right.x) / 2,
          my: (left.y + right.y) / 2,
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
      const old = pinch.current;
      if (left === undefined || right === undefined || old === null) return;
      const distance = Math.max(1, Math.hypot(right.x - left.x, right.y - left.y));
      const mx = (left.x + right.x) / 2;
      const my = (left.y + right.y) / 2;
      panByPixels(mx - old.mx, my - old.my);
      zoomAt(distance / old.distance, clientToMap(mx, my) ?? undefined);
      pinch.current = { distance, mx, my };
      return;
    }
    if (!dragging.current) return;
    moved.current += Math.abs(event.clientX - previous.x) + Math.abs(event.clientY - previous.y);
    panByPixels(event.clientX - previous.x, event.clientY - previous.y);
  };

  const releasePointer = (event: ReactPointerEvent<SVGSVGElement>): void => {
    pointers.current.delete(event.pointerId);
    pinch.current = null;
    dragging.current = pointers.current.size === 1;
  };

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#101719]">
      <svg
        ref={svgRef}
        viewBox={viewBox}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={`Chiến đồ — ${focus === null ? 'toàn châu lục' : focus.name}`}
        className="h-full w-full select-none"
        style={{ touchAction: 'none', cursor: dragging.current ? 'grabbing' : 'grab' }}
        onWheel={(event: ReactWheelEvent<SVGSVGElement>) => {
          event.preventDefault();
          zoomAt(Math.exp(-event.deltaY * 0.0015), clientToMap(event.clientX, event.clientY) ?? undefined);
        }}
        onDoubleClick={(event) => zoomAt(1.55, clientToMap(event.clientX, event.clientY) ?? undefined)}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={releasePointer}
        onPointerCancel={releasePointer}
      >
        <defs>
          <radialGradient id="chien-do-vignette" cx="50%" cy="46%" r="72%">
            <stop offset="58%" stopColor="#071014" stopOpacity="0" />
            <stop offset="100%" stopColor="#071014" stopOpacity="0.72" />
          </radialGradient>
          <filter id="chien-do-bong" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy={1.4 * drawScale} stdDeviation={1.8 * drawScale} floodColor="#050706" floodOpacity="0.9" />
          </filter>
        </defs>

        <image href="/assets/maps/europe-1444.jpg" x="0" y="0" width={MAP_IMAGE_WIDTH} height={MAP_IMAGE_HEIGHT} preserveAspectRatio="none" pointerEvents="none" />
        <rect x="0" y="0" width={MAP_IMAGE_WIDTH} height={MAP_IMAGE_HEIGHT} fill="#0b1518" opacity="0.18" pointerEvents="none" />
        <rect x="0" y="0" width={MAP_IMAGE_WIDTH} height={MAP_IMAGE_HEIGHT} fill="url(#chien-do-vignette)" pointerEvents="none" />

        {/* Tuyến hành quân chỉ là lớp mực phủ; bản đồ thật luôn ở dưới. */}
        <g pointerEvents="none" fill="none" strokeLinecap="round">
          {inner.map(({ a, b, kind }) => {
            const key = `${a.node.id}|${b.node.id}`;
            const related = selectedId === a.node.id || selectedId === b.node.id;
            const quiet = selectedId !== '' && !related;
            const opacity = related ? 0.94 : quiet ? 0.1 : level === 1 ? (kind === 'duong-bien' ? 0.38 : 0.2) : 0.48;
            const d = curvePath(a, b, key, drawScale);
            return (
              <g key={key} opacity={opacity}>
                <path d={d} stroke="#11100d" strokeWidth={(kind === 'duong-bo' ? 4.8 : 4) * drawScale} />
                <path
                  d={d}
                  stroke={kind === 'duong-bien' ? '#8bc5da' : kind === 'duong-nui' ? '#e1a96d' : kind === 'duong-song' ? '#78b4d2' : '#f1d59a'}
                  strokeWidth={(related ? 2.2 : 1.45) * drawScale}
                  strokeDasharray={kind === 'duong-bien' ? `${6 * drawScale} ${6 * drawScale}` : kind === 'duong-nui' ? `${2.5 * drawScale} ${3.5 * drawScale}` : undefined}
                />
              </g>
            );
          })}
        </g>

        <g pointerEvents="none">
          {exits.map((exit, index) => {
            const length = 54 * drawScale;
            const x2 = exit.from.x + exit.dx * length;
            const y2 = exit.from.y + exit.dy * length;
            return (
              <g key={`${exit.from.node.id}|${String(index)}`} opacity="0.72">
                <line
                  x1={exit.from.x}
                  y1={exit.from.y}
                  x2={x2}
                  y2={y2}
                  stroke={exit.kind === 'duong-bien' ? '#8bc5da' : '#e8ca8e'}
                  strokeWidth={1.3 * drawScale}
                  strokeDasharray={`${4 * drawScale} ${4 * drawScale}`}
                />
                <text
                  x={x2 + exit.dx * 5 * drawScale}
                  y={y2 + exit.dy * 5 * drawScale}
                  fill="#fff0c9"
                  stroke="#15120e"
                  strokeWidth={3 * drawScale}
                  paintOrder="stroke"
                  fontSize={9.5 * drawScale}
                  textAnchor={exit.dx < -0.3 ? 'end' : exit.dx > 0.3 ? 'start' : 'middle'}
                  dominantBaseline="middle"
                >
                  → {shortMapLabel(exit.toName)}
                </text>
              </g>
            );
          })}
        </g>

        <g filter="url(#chien-do-bong)">
          {placed.map((row) => (
            <NodeMarker
              key={row.node.id}
              node={row.node}
              x={row.x}
              y={row.y}
              campaign={campaign}
              scale={drawScale}
              zoom={camera.zoom}
              selected={row.node.id === selectedId}
              here={row.node.id === hereNodeId}
              playerFactionId={playerFactionId}
              onSelect={() => {
                if (moved.current < 6) onSelect(row.node.id);
              }}
              onDrill={() => onDrill(row.node.id)}
            />
          ))}
        </g>

        <g filter="url(#chien-do-bong)">
          {armies.map(({ army, x, y, moving }) => (
            <ArmyFlag key={army.id} army={army} x={x} y={y} moving={moving} scale={drawScale} />
          ))}
        </g>
      </svg>

      <div className="absolute bottom-3 right-3 flex flex-col gap-1 rounded-md border border-[#d0b071]/45 bg-[#15120e]/90 p-1.5 shadow-xl backdrop-blur-sm">
        <button type="button" onClick={() => zoomAt(1.35)} className="grid h-7 w-7 place-items-center rounded text-base text-[#f3ddb0] hover:bg-[#806231]/45" aria-label="Phóng to chiến đồ">+</button>
        <button type="button" onClick={() => zoomAt(1 / 1.35)} className="grid h-7 w-7 place-items-center rounded text-base text-[#f3ddb0] hover:bg-[#806231]/45" aria-label="Thu nhỏ chiến đồ">−</button>
        <button type="button" onClick={() => setCamera({ zoom: 1, cx: 0, cy: 0 })} className="grid h-7 w-7 place-items-center rounded text-[10px] text-[#f3ddb0] hover:bg-[#806231]/45" aria-label="Đưa chiến đồ về toàn cảnh">◎</button>
      </div>

      <a href={MAP_SOURCE} target="_blank" rel="noreferrer" className="absolute bottom-1 right-12 text-[8px] text-[#e8d6ae]/55 hover:text-[#ffe5ad]">
        Europe 1444 · CC0
      </a>
    </div>
  );
}

interface NodeMarkerProps {
  node: CampaignNode;
  x: number;
  y: number;
  campaign: CampaignSliceState;
  scale: number;
  zoom: number;
  selected: boolean;
  here: boolean;
  playerFactionId: string;
  onSelect: () => void;
  onDrill: () => void;
}

function NodeMarker({ node, x, y, campaign, scale, zoom, selected, here, playerFactionId, onSelect, onDrill }: NodeMarkerProps): ReactNode {
  const paint = paintOf(campaign, node.id);
  const terrain = terrainRow(node.terrain);
  const progress = playerFactionId === '' || node.level === 3 ? null : conquestOf(campaign, node.id, playerFactionId);
  const rawLabel = node.site === 'thanh-tri' || node.site === 'thi-tran' ? node.siteName : node.name;
  const label = shortMapLabel(rawLabel);
  const radius = (node.level === 1 ? 10.5 : node.level === 2 ? 9 : 8) * scale;
  const showDetails = node.level > 1 || node.radius >= 64 || zoom >= 1.2 || selected || here;
  const progressText = progress !== null && progress.total > 0 ? `${String(progress.held)}/${String(progress.total)}` : '';
  const labelX = x + radius + 5 * scale;
  const labelY = y + 3.5 * scale;
  const activate = (): void => {
    if (selected && node.level < 3) onDrill();
    else onSelect();
  };

  return (
    <g className="campaign-map-node">
      <title>{`${rawLabel} · ${terrain.name}${node.water ? '' : ` · ${paint.holderId === '' ? 'vô chủ' : paint.holderId.replace('phe_', '')}`}`}</title>
      <circle
        cx={x}
        cy={y}
        r={30 * scale}
        fill="#000"
        fillOpacity="0.001"
        role="button"
        tabIndex={0}
        aria-label={`${rawLabel} · ${progressText === '' ? terrain.name : `tiến độ ${progressText}`}`}
        style={{ cursor: 'pointer' }}
        onClick={(event) => {
          event.stopPropagation();
          activate();
        }}
        onDoubleClick={(event) => {
          event.stopPropagation();
          if (node.level < 3) onDrill();
        }}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          event.stopPropagation();
          activate();
        }}
      />
      {!node.water && <circle cx={x} cy={y} r={radius * 2.7} fill={paint.fill} opacity={selected ? 0.3 : 0.15} pointerEvents="none" />}

      {selected && <circle cx={x} cy={y} r={radius * 2.15} fill="none" stroke="#ffe3a2" strokeWidth={1.8 * scale} pointerEvents="none" />}
      {here && <circle cx={x} cy={y} r={radius * 2.6} fill="none" stroke="#fff0bd" strokeWidth={1.5 * scale} strokeDasharray={`${3 * scale} ${4 * scale}`} className="map-player-pulse" pointerEvents="none" />}
      {paint.stripe !== '' && !node.water && (
        <circle cx={x} cy={y} r={radius * 1.65} fill="none" stroke={paint.stripe} strokeWidth={2 * scale} strokeDasharray={`${3.5 * scale} ${2.5 * scale}`} pointerEvents="none" />
      )}

      {node.water ? (
        <g pointerEvents="none">
          <circle cx={x} cy={y} r={radius} fill="#173846" fillOpacity="0.92" stroke="#a7d5e2" strokeWidth={1.5 * scale} />
          <path d={`M ${String(x - 5 * scale)} ${String(y)} q ${String(2.5 * scale)} ${String(-2.3 * scale)} ${String(5 * scale)} 0 t ${String(5 * scale)} 0`} fill="none" stroke="#b9e0e8" strokeWidth={1.2 * scale} />
        </g>
      ) : node.level === 1 ? (
        <g pointerEvents="none">
          <path
            d={`M ${String(x)} ${String(y - radius * 1.25)} L ${String(x + radius)} ${String(y - radius * 0.65)} L ${String(x + radius * 0.82)} ${String(y + radius * 0.72)} L ${String(x)} ${String(y + radius * 1.28)} L ${String(x - radius * 0.82)} ${String(y + radius * 0.72)} L ${String(x - radius)} ${String(y - radius * 0.65)} Z`}
            fill={paint.fill}
            stroke={selected ? '#fff0bd' : '#efe1bd'}
            strokeWidth={1.4 * scale}
          />
          <circle cx={x} cy={y} r={2.3 * scale} fill="#17130e" opacity="0.8" />
        </g>
      ) : (
        <g pointerEvents="none">
          <circle cx={x} cy={y} r={radius} fill="#18140f" fillOpacity="0.94" stroke={paint.fill} strokeWidth={2.8 * scale} />
          {node.level === 2 && <circle cx={x} cy={y} r={2.4 * scale} fill="#f3dfb2" />}
        </g>
      )}

      {node.site === 'thanh-tri' && <CastleGlyph x={x} y={y} scale={scale * 0.58} />}
      {node.site === 'thi-tran' && <TownGlyph x={x} y={y} scale={scale * 0.58} />}
      {node.site === 'lang' && <circle cx={x} cy={y} r={2.2 * scale} fill="#eadbb8" stroke="#17130e" strokeWidth={1.2 * scale} pointerEvents="none" />}

      {node.seat && !node.water && (
        <path d={`M ${String(x - 5 * scale)} ${String(y - radius - 4 * scale)} l ${String(2.5 * scale)} ${String(-4 * scale)} l ${String(2.5 * scale)} ${String(4 * scale)} l ${String(2.5 * scale)} ${String(-4 * scale)} l ${String(2.5 * scale)} ${String(4 * scale)} z`} fill="#ffe29b" stroke="#17130e" strokeWidth={0.8 * scale} pointerEvents="none" />
      )}

      {showDetails && progressText !== '' && (
        <g transform={`translate(${String(x)} ${String(y - radius - 8 * scale)})`} pointerEvents="none">
          <rect x={-9.5 * scale} y={-5.5 * scale} width={19 * scale} height={11 * scale} rx={4.5 * scale} fill="#17130e" fillOpacity="0.9" stroke={progress?.fallen ? '#9bc18d' : '#d8b96f'} strokeWidth={0.9 * scale} />
          <text y={2.7 * scale} textAnchor="middle" fontSize={6.7 * scale} fill={progress?.fallen ? '#b8d6a9' : '#f4dfae'} fontFamily="ui-monospace, monospace">{progressText}</text>
        </g>
      )}

      {showDetails && (
        <text
          x={labelX}
          y={labelY}
          textAnchor="start"
          fontSize={(node.level === 1 ? 8.6 : 9.5) * scale}
          fill={node.water ? '#d3edf2' : '#fff3d2'}
          stroke="#17130e"
          strokeWidth={3 * scale}
          paintOrder="stroke"
          fontWeight={node.level === 1 || node.seat ? 700 : 500}
          pointerEvents="none"
        >
          {label}
        </text>
      )}
    </g>
  );
}

function shortMapLabel(label: string): string {
  return label
    .replace(/^(Vương quốc|Công quốc|Cộng hòa|Đại Công quốc|Phiên hầu quốc|Tiểu vương quốc|Hãn quốc|Đại Trướng Hãn Quốc|Nhà nước|Đế quốc|Đế chế|Quốc gia|Liên bang)\s+/u, '')
    .trim();
}

function CastleGlyph({ x, y, scale }: { x: number; y: number; scale: number }): ReactNode {
  const w = 11 * scale;
  const h = 10 * scale;
  return (
    <g transform={`translate(${String(x)} ${String(y - h * 0.15)})`} pointerEvents="none">
      <path
        d={`M ${String(-w)} ${String(h)} L ${String(-w)} ${String(-h * 0.4)} L ${String(-w * 0.62)} ${String(-h * 0.4)} L ${String(-w * 0.62)} ${String(-h)} L ${String(-w * 0.2)} ${String(-h)} L ${String(-w * 0.2)} ${String(-h * 0.4)} L ${String(w * 0.2)} ${String(-h * 0.4)} L ${String(w * 0.2)} ${String(-h)} L ${String(w * 0.62)} ${String(-h)} L ${String(w * 0.62)} ${String(-h * 0.4)} L ${String(w)} ${String(-h * 0.4)} L ${String(w)} ${String(h)} Z`}
        fill="#fff0ca"
        stroke="#17130e"
        strokeWidth={1.5 * scale}
      />
    </g>
  );
}

function TownGlyph({ x, y, scale }: { x: number; y: number; scale: number }): ReactNode {
  const w = 9 * scale;
  const h = 8 * scale;
  return (
    <g transform={`translate(${String(x)} ${String(y - h * 0.15)})`} pointerEvents="none">
      <path d={`M ${String(-w)} ${String(h)} L ${String(-w)} ${String(-h * 0.2)} L 0 ${String(-h * 1.3)} L ${String(w)} ${String(-h * 0.2)} L ${String(w)} ${String(h)} Z`} fill="#e8d5aa" stroke="#17130e" strokeWidth={1.4 * scale} />
    </g>
  );
}

interface ArmyFlagProps {
  army: CampaignArmy;
  x: number;
  y: number;
  moving: boolean;
  scale: number;
}

function ArmyFlag({ army, x, y, moving, scale }: ArmyFlagProps): ReactNode {
  const color = factionColor(army.factionId);
  const size = 10 * scale;
  const besieging = army.stance === 'vay-thanh';
  return (
    <g transform={`translate(${String(x)} ${String(y)})`} pointerEvents="none">
      {besieging && <circle r={size * 2.5} fill="none" stroke="#dd6949" strokeWidth={1.8 * scale} strokeDasharray={`${4 * scale} ${3 * scale}`} className="map-player-pulse" />}
      <line x1="0" y1={size * 0.4} x2="0" y2={-size * 1.9} stroke="#17130e" strokeWidth={2.2 * scale} />
      <path
        d={moving ? `M 0 ${String(-size * 1.9)} L ${String(size * 2)} ${String(-size * 1.3)} L 0 ${String(-size * 0.65)} Z` : `M 0 ${String(-size * 1.9)} L ${String(size * 1.7)} ${String(-size * 1.7)} L ${String(size * 1.7)} ${String(-size * 0.75)} L 0 ${String(-size * 0.55)} Z`}
        fill={color}
        stroke="#fff0ca"
        strokeWidth={1.1 * scale}
      />
      <circle r={size * 0.42} cy={size * 0.4} fill="#17130e" stroke={color} strokeWidth={1.8 * scale} />
      <text x={0} y={size * 2} textAnchor="middle" fontSize={8 * scale} fill="#fff0ca" stroke="#17130e" strokeWidth={2.6 * scale} paintOrder="stroke" fontFamily="ui-monospace, monospace">
        {army.troops > 0 ? `${String(Math.round(army.troops / 100) / 10)}k` : ''}{besieging ? ' vây' : moving ? ' →' : ''}
      </text>
    </g>
  );
}

/** Ô con của một nút có mục tiêu nào chưa hạ — dùng cho bảng bên phải. */
export function remainingLabels(campaign: CampaignSliceState, nodeId: string, factionId: string): string[] {
  return conquestOf(campaign, nodeId, factionId)
    .remaining.map((id) => {
      const node = campaignNode(id);
      if (node === null) return id;
      const parent = node.parentId === null ? null : campaignNode(node.parentId);
      return `${node.siteName === '' ? node.name : node.siteName}${parent === null ? '' : ` · ${parent.name}`}${node.seat ? ' (thủ phủ)' : ''}`;
    })
    .slice(0, 12);
}

/** Số mục tiêu trong một nút — bảng chú giải dùng để khỏi tính lại. */
export function objectiveCount(nodeId: string): number {
  return childrenOfNode(nodeId).filter((node) => isObjective(node)).length;
}
