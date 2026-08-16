/**
 * BẢN ĐỒ THÀNH TRÌ — Phần 12 mục 11, gạch đầu dòng thứ nhất.
 *
 * > "Bản đồ lưới thành trì, kéo thả đặt công trình, **hiện trước hiệu ứng kề nhau**"
 *
 * Vế thứ ba là vế quan trọng nhất và cũng là vế dễ bỏ nhất. Mục 4 nói "KỀ NHAU
 * CÓ Ý NGHĨA", nhưng ý nghĩa ấy chỉ tồn tại nếu người chơi THẤY nó TRƯỚC khi
 * đặt. Đặt xong rồi mới biết xưởng thuộc da làm cả khu nhà bên cạnh bỏ đi thì
 * đó không phải một quyết định quy hoạch, đó là một cái bẫy — và game này không
 * có reroll, nên bẫy là thứ duy nhất không được phép có.
 *
 * ---
 *
 * VÌ SAO KHÔNG CÒN LÀ MỘT LƯỚI Ô NỮA.
 *
 * Bản cũ vẽ 16×16 cái nút vuông tô màu. Nó đọc được, nhưng nó nói dối về ba
 * chuyện, và cả ba đều là chuyện người chơi cần biết để quy hoạch:
 *
 *  - **Kích thước.** Một cái giếng và một toà đại giáo đường cùng chiếm một ô
 *    thì trên bản đồ chúng bằng nhau. Bây giờ cái giếng rộng 40 m và toà giáo
 *    đường rộng 120 m, và nhìn là thấy.
 *  - **Khoảng cách.** "Cối xay kề sông" ở lưới ô là một quan hệ giữa hai ô;
 *    ở đây nó là hai trăm thước có đo được, và người chơi ước lượng được bằng
 *    mắt xem chỗ nào còn chen vừa một cái xưởng.
 *  - **Đất.** Ô "sông" là một hình vuông xanh; dòng sông thật uốn khúc, chỗ
 *    rộng chỗ hẹp, và chạy qua thành trì ở đúng một chỗ — cái chỗ quyết định
 *    nửa số quyết định quy hoạch của cả ván chơi.
 *
 * ---
 *
 * KHUNG NHÌN KÉO VÀ PHÓNG ĐƯỢC, và đó không phải tiện nghi. Mảnh đất rộng sáu
 * cây số; ở mức nhìn toàn cảnh một căn nhà là ba điểm ảnh. Không phóng to được
 * thì cả cái lý do bỏ lưới ô — thấy được KÍCH THƯỚC THẬT — chỉ đúng trên giấy.
 *
 * Canvas chứ không phải SVG hay DOM: nền là một ảnh raster đổ bóng theo độ cao,
 * và hai trăm nghìn điểm ảnh ấy không có cách nào thành hai trăm nghìn thẻ `div`.
 */

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';
import {
  CENTER_CELL,
  GRID_CELLS,
  buildingOf,
  canPlace,
  cellsToMetres,
  clearanceOf,
  distanceToStreet,
  fieldOf,
  fieldRasterRGBA,
  footprintOf,
  holdingStreets,
  pointAlong,
  planningRadius,
  previewPlacement,
  roadSurfaceOf,
  standingWalls,
  streetLength,
  terrainAt,
  wallMaterialOf,
  type Cell,
  type Holding,
  type PlacementPreview,
  type ResourceNode,
  type RoadLine,
  type Street,
  type WallLine,
  type WallPoint,
} from '@/systems/holding';
import {
  drawBridge,
  drawBuilding,
  drawGate,
  drawGhost,
  drawLabel,
  drawNode,
  drawPavedRoad,
  drawPlanningEdge,
  drawPolyline,
  drawScaleBar,
  drawSite,
  drawStreet,
  inViewport,
  skinOf,
  toCell,
  toPx,
  type View,
} from './holdingArt';

/** Cạnh ảnh nền. 256 mẫu trên 6 km là chừng 23 m mỗi điểm — đủ nét ở mọi cấp. */
const RASTER = 256;

/** Chọn một tuyến khi bấm cách nó không quá ngần này ô. */
const PICK_SLOP = 14;

/** Công cụ đang cầm trên tay. Đúng một cái tại một thời điểm. */
export type MapTool = 'xem' | 'dat' | 'tuong' | 'duong';

export interface MapSelection {
  kind: 'cong-trinh' | 'du-an' | 'mach' | 'tuong' | 'duong' | 'tuyen';
  id: string;
}

export interface HoldingMapProps {
  holding: Holding;
  tool: MapTool;
  /** Công trình đang chọn trong bảng chọn. Chỉ có nghĩa khi `tool === 'dat'`. */
  selected: string;
  /** Thứ đang được tra cứu, để tô sáng trên bản đồ. */
  picked: MapSelection | null;
  onPick: (selection: MapSelection | null) => void;
  onPlace: (buildingId: string, at: Cell) => void;
  onWall: (points: WallPoint[]) => void;
  onRoad: (points: Cell[]) => void;
  /**
   * Tuyến đang vạch dở. SỐNG Ở NGOÀI chứ không trong component này, vì bảng
   * công cụ bên trái phải định giá được nó theo từng điểm người chơi bấm —
   * "tuyến này tốn bao nhiêu" là câu hỏi phải trả lời TRƯỚC khi bấm Xong.
   */
  draft: readonly Cell[];
  /**
   * Dạng UPDATER chứ không phải giá trị thẳng, và đó là một lỗi thật chứ không
   * phải sở thích: hai cú bấm nhanh hơn một nhịp render sẽ cùng đọc một `draft`
   * cũ, và cú thứ hai ghi đè cú thứ nhất. Người chơi vạch một tuyến dài bấm rất
   * nhanh, nên "thỉnh thoảng rơi mất một điểm" là hành vi mặc định nếu truyền
   * giá trị.
   */
  onDraft: Dispatch<SetStateAction<Cell[]>>;
  /** Bật tắt lớp mạch tài nguyên. */
  showNodes: boolean;
  showCoverage: boolean;
  /** Vùng nào được hiện — rỗng là hiện hết. */
  zoneFilter: readonly string[];
  /** Xem trước hiệu ứng kề nhau, để màn hình ngoài hiện thành bảng. */
  onPreview: (preview: PlacementPreview | null, reason: string) => void;
}

export function HoldingMap(props: HoldingMapProps): ReactNode {
  const { holding, tool, selected, picked, draft, onPick, onPlace, onWall, onRoad, onDraft, onPreview } = props;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{ x: number; y: number; tx: number; ty: number; moved: boolean } | null>(null);

  const [size, setSize] = useState({ width: 900, height: 600 });
  const [camera, setCamera] = useState({ scale: 0.4, tx: 0, ty: 0 });
  const [hover, setHover] = useState<Cell | null>(null);

  const radius = planningRadius(holding);
  const field = useMemo(() => fieldOf(holding), [holding]);
  const streets = useMemo(() => holdingStreets(holding), [holding]);
  const building = selected === '' ? null : buildingOf(selected);

  const view: View = { ...camera, width: size.width, height: size.height };

  // --- ảnh nền địa thế: dựng một lần cho mỗi mảnh đất rồi phóng to thu nhỏ ---
  const backdrop = useMemo(() => {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = RASTER;
    canvas.height = RASTER;
    const context = canvas.getContext('2d');
    if (context === null) return null;
    const image = context.createImageData(RASTER, RASTER);
    image.data.set(fieldRasterRGBA(field, RASTER));
    context.putImageData(image, 0, 0);
    return canvas;
  }, [field]);

  /** Góc tây-bắc của khuôn viên khi người chơi trỏ vào chỗ họ muốn nó ĐỨNG. */
  const anchorAt = (cell: Cell | null): Cell | null => {
    if (cell === null || building === null) return null;
    const footprint = footprintOf(building);
    return { x: Math.round(cell.x - footprint / 2), y: Math.round(cell.y - footprint / 2) };
  };

  const ghost = anchorAt(hover);
  const check = ghost === null ? null : canPlace(holding, selected, ghost);

  // --- khung nhìn khớp khung chứa, và ôm vừa vùng quy hoạch lúc mở ----------
  useEffect(() => {
    const wrap = wrapRef.current;
    if (wrap === null) return;
    const fit = (): void => {
      const width = wrap.clientWidth;
      const height = wrap.clientHeight;
      if (width === 0 || height === 0) return;
      setSize({ width, height });
      // Ôm vừa vùng quy hoạch cộng một vành đất hoang: người chơi luôn thấy được
      // ranh giới tầm với của mình, và thấy đất bên ngoài nó — thứ sẽ mở ra khi
      // thành lên cấp.
      const span = radius * 2.4;
      const scale = Math.min(width / span, height / span);
      setCamera({ scale, tx: width / 2 - CENTER_CELL * scale, ty: height / 2 - CENTER_CELL * scale });
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(wrap);
    return () => { observer.disconnect(); };
  }, [holding.id, radius]);

  // --- vẽ -------------------------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (canvas === null || context === undefined || context === null) return;

    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = '#0a0806';
    context.fillRect(0, 0, view.width, view.height);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';

    // 1. nền đất
    if (backdrop !== null) {
      const [x0, y0] = toPx(view, 0, 0);
      context.drawImage(backdrop, x0, y0, GRID_CELLS * view.scale, GRID_CELLS * view.scale);
    }

    // 2. mặt nước lấp lánh dọc tim sông — gợi dòng chảy chứ không phải vệt tô
    if (field.river.length >= 2) {
      drawPolyline(context, view, field.river, 'rgba(150, 200, 230, 0.16)', Math.max(1, 3 * view.scale));
    }

    // 3. QUAN LỘ vẽ TRƯỚC lớp tối ngoài quy hoạch: nó chạy hết bản đồ, và một
    //    con đường bị mặt nạ nuốt mất ở ngoài rìa trông như một con đường cụt.
    for (const street of streets.streets) {
      if (street.kind !== 'quan-lo') continue;
      drawStreet(context, view, street.points, street.kind, picked?.kind === 'tuyen' && picked.id === street.id);
    }

    // 4. ngoài vùng quy hoạch = đất chưa khai phá
    drawPlanningEdge(context, view, { x: CENTER_CELL, y: CENTER_CELL }, radius);

    // 5. ngõ trong thành
    for (const street of streets.streets) {
      if (street.kind === 'quan-lo') continue;
      drawStreet(context, view, street.points, street.kind, picked?.kind === 'tuyen' && picked.id === street.id);
    }

    // 6. cầu
    for (const bridge of streets.bridges) {
      if (!inViewport(view, bridge.at.x - bridge.span, bridge.at.y - bridge.span, bridge.span * 2)) continue;
      drawBridge(context, view, bridge.at, bridge.angle, bridge.span);
    }

    // 7. đường người chơi đã lát
    for (const road of holding.roads) {
      drawPavedRoad(
        context, view, road.points, road.width, road.surfaceId,
        road.weeksLeft <= 0, road.integrity / 100,
        picked?.kind === 'duong' && picked.id === road.id,
      );
    }

    // 8. tường thành — mỗi tuyến giữ đúng hình đã vẽ
    for (const wall of holding.walls) {
      drawWall(context, view, wall, picked?.kind === 'tuong' && picked.id === wall.id);
    }

    // 9. cổng — giao của đường và tường, nên vẽ sau cả hai
    for (const gate of streets.gates) {
      drawGate(context, view, gate.at, gate.angle, gate.main);
    }

    // 10. mạch tài nguyên
    if (props.showNodes) {
      for (const node of holding.nodes) {
        if (node.grade <= 0) continue;
        if (props.zoneFilter.length > 0 && !props.zoneFilter.includes(node.zone)) continue;
        if (!inViewport(view, node.at.x - node.size, node.at.y - node.size, node.size * 2)) continue;
        drawNode(context, view, node, {
          selected: picked?.kind === 'mach' && picked.id === node.id,
          worked: node.workedBy.length > 0,
          showCoverage: props.showCoverage,
        });
      }
    }

    // 11. công trường đang xây
    for (const project of holding.projects) {
      const definition = buildingOf(project.buildingId);
      if (definition === null) continue;
      const footprint = footprintOf(definition);
      if (!inViewport(view, project.at.x, project.at.y, footprint)) continue;
      const total = Math.max(1, project.manWeeksLeft + 1);
      drawSite(
        context, view, project.at, footprint, skinOf(definition),
        1 - project.manWeeksLeft / total,
        picked?.kind === 'du-an' && picked.id === project.id,
      );
    }

    // 12. công trình đã xong
    for (const placed of holding.buildings) {
      const definition = buildingOf(placed.buildingId);
      if (definition === null) continue;
      const footprint = footprintOf(definition);
      if (!inViewport(view, placed.at.x, placed.at.y, footprint)) continue;
      drawBuilding(context, view, placed.at, footprint, skinOf(definition), {
        wear: placed.integrity / 100,
        understaffed: !placed.maintained,
        selected: picked?.kind === 'cong-trinh' && picked.id === placed.id,
      });
    }

    // 13. tuyến đang vạch dở, bám theo con trỏ
    if (draft.length > 0 && (tool === 'tuong' || tool === 'duong')) {
      const points = hover === null ? draft : [...draft, hover];
      drawPolyline(
        context, view, points,
        tool === 'tuong' ? '#e0c88a' : '#e7c27e',
        Math.max(1.6, (tool === 'tuong' ? 6 : 5) * view.scale),
        [Math.max(5, 9 * view.scale), Math.max(4, 7 * view.scale)],
      );
      for (const point of draft) {
        const [px, py] = toPx(view, point.x, point.y);
        context.beginPath();
        context.arc(px, py, Math.max(3, 5 * view.scale), 0, Math.PI * 2);
        context.fillStyle = tool === 'tuong' ? '#e0c88a' : '#e7c27e';
        context.fill();
      }
    }

    // 14. bóng đặt
    if (tool === 'dat' && building !== null && ghost !== null) {
      drawGhost(context, view, ghost, footprintOf(building), clearanceOf(building), check?.ok === true);
    }

    // 15. tên đường — đặt DỌC theo chính con đường. Bốn cái nhãn lơ lửng cạnh
    //     bốn con đường là một đống chữ; nằm dọc thì đọc được như một bản đồ thật.
    if (view.scale > 0.09) {
      for (const street of streets.streets) {
        if (street.kind !== 'quan-lo') continue;
        const spot = pointAlong(street.points, streetLength(street.points) * 0.5 + radius * 0.9);
        if (spot === null) continue;
        const [px, py] = toPx(view, spot.at.x, spot.at.y);
        if (px < 0 || py < 0 || px > view.width || py > view.height) continue;
        let angle = spot.angle;
        if (angle > Math.PI / 2 || angle < -Math.PI / 2) angle += Math.PI;
        drawLabel(context, street.name, px, py - Math.max(7, 9 * view.scale), 13, '#e8d9a8', angle);
      }
      for (const road of holding.roads) {
        const spot = pointAlong(road.points, Math.max(10, road.length * 0.45));
        if (spot === null) continue;
        const [px, py] = toPx(view, spot.at.x, spot.at.y);
        if (px < 0 || py < 0 || px > view.width || py > view.height) continue;
        let angle = spot.angle;
        if (angle > Math.PI / 2 || angle < -Math.PI / 2) angle += Math.PI;
        drawLabel(context, road.name, px, py - Math.max(7, 9 * view.scale), 11, 'rgba(232,216,180,0.9)', angle);
      }
    }

    drawScaleBar(context, view);
  }, [
    holding, view.scale, view.tx, view.ty, view.width, view.height, backdrop, field, streets,
    radius, tool, building, ghost, check, hover, draft, picked,
    props.showNodes, props.showCoverage, props.zoneFilter,
  ]);

  // --- tương tác ------------------------------------------------------------

  const cellAt = (clientX: number, clientY: number): Cell | null => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (rect === undefined) return null;
    return toCell(view, clientX - rect.left, clientY - rect.top);
  };

  const pointerDown = (event: React.PointerEvent<HTMLCanvasElement>): void => {
    // Kéo bản đồ được ở MỌI công cụ: vạch một tuyến tường dài hơn khung nhìn là
    // chuyện thường, và bắt người chơi thoát công cụ ra để kéo rồi vào lại là
    // cách chắc chắn để không ai vạch tuyến nào dài quá một màn hình.
    drag.current = { x: event.clientX, y: event.clientY, tx: camera.tx, ty: camera.ty, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const pointerMove = (event: React.PointerEvent<HTMLCanvasElement>): void => {
    const held = drag.current;
    if (held !== null && event.buttons !== 0) {
      const dx = event.clientX - held.x;
      const dy = event.clientY - held.y;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) held.moved = true;
      if (held.moved) {
        setCamera((current) => ({ ...current, tx: held.tx + dx, ty: held.ty + dy }));
        return;
      }
    }

    const cell = cellAt(event.clientX, event.clientY);
    setHover(cell);

    // Xem trước tính ngay lúc RÊ, không đợi bấm — xem chú thích đầu file.
    if (tool !== 'dat' || building === null || cell === null) return;
    const at = anchorAt(cell);
    if (at === null) return;
    const verdict = canPlace(holding, selected, at);
    onPreview(
      verdict.ok ? previewPlacement(holding, selected, at, { besieged: holding.besieged }) : null,
      verdict.ok ? '' : verdict.reason,
    );
  };

  const pointerUp = (event: React.PointerEvent<HTMLCanvasElement>): void => {
    const held = drag.current;
    drag.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Nhả con trỏ có thể ném với id lạ. Đừng để nó chặn thao tác đặt.
    }
    if (held !== null && held.moved) return;

    const cell = cellAt(event.clientX, event.clientY);
    if (cell === null) return;

    if (tool === 'tuong' || tool === 'duong') {
      onDraft((points) => [...points, { x: Math.round(cell.x), y: Math.round(cell.y) }]);
      return;
    }

    if (tool === 'dat' && building !== null) {
      const at = anchorAt(cell);
      if (at === null || !canPlace(holding, selected, at).ok) return;
      onPlace(selected, at);
      return;
    }

    onPick(pickAt(holding, streets.streets, cell));
  };

  const finish = (): void => {
    if (draft.length < 2) return;
    if (tool === 'tuong') onWall([...draft]);
    if (tool === 'duong') onRoad([...draft]);
    onDraft([]);
  };

  const wheel = (event: React.WheelEvent<HTMLCanvasElement>): void => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (rect === undefined) return;
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;
    setCamera((current) => {
      // Phóng quanh CON TRỎ, không quanh tâm màn hình: phóng quanh tâm thì mỗi
      // lần lăn chuột người chơi lại phải kéo bản đồ về chỗ mình đang nhìn.
      const next = Math.max(0.05, Math.min(6, current.scale * (event.deltaY < 0 ? 1.16 : 1 / 1.16)));
      const ratio = next / current.scale;
      return { scale: next, tx: px - (px - current.tx) * ratio, ty: py - (py - current.ty) * ratio };
    });
  };

  const hoverTerrain = hover === null ? '' : terrainAt(field, hover.x, hover.y);

  return (
    <div ref={wrapRef} className="relative min-h-0 min-w-0 flex-1 overflow-hidden bg-ink">
      <canvas
        ref={canvasRef}
        width={size.width}
        height={size.height}
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerUp}
        onPointerLeave={() => {
          drag.current = null;
          setHover(null);
          onPreview(null, '');
        }}
        onWheel={wheel}
        onContextMenu={(event) => { event.preventDefault(); }}
        className={`h-full w-full touch-none ${tool === 'xem' ? 'cursor-grab' : 'cursor-crosshair'}`}
      />

      {/* Đang vạch dở: nút chốt tuyến nổi ngay trên bản đồ, cạnh tay người chơi. */}
      {draft.length > 0 && (tool === 'tuong' || tool === 'duong') && (
        <div className="pointer-events-auto absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded border border-brass/60 bg-oak/95 px-3 py-2 text-xs shadow-lg">
          <span className="text-vellum/80">
            {draft.length} điểm · {Math.round(cellsToMetres(streetLength(draft)))} thước
          </span>
          <button
            type="button"
            onClick={finish}
            disabled={draft.length < 2}
            className="rounded border border-brass px-2 py-0.5 text-brass disabled:opacity-40"
          >
            Xong
          </button>
          <button
            type="button"
            onClick={() => { onDraft((points) => points.slice(0, -1)); }}
            className="rounded border border-oak-light px-2 py-0.5 text-vellum/70"
          >
            Lùi
          </button>
          <button
            type="button"
            onClick={() => { onDraft([]); }}
            className="rounded border border-oak-light px-2 py-0.5 text-vellum/70"
          >
            Xoá
          </button>
        </div>
      )}

      {/* Chỉ báo dưới con trỏ: đất gì, cách tâm bao xa. */}
      {hover !== null && (
        <div className="pointer-events-none absolute bottom-3 right-3 rounded border border-oak-light/60 bg-oak/85 px-2 py-1 text-[10px] text-vellum/70">
          {terrainName(hoverTerrain)} · cách toà chính{' '}
          {Math.round(cellsToMetres(Math.hypot(hover.x - CENTER_CELL, hover.y - CENTER_CELL)))} thước
        </div>
      )}

      <div className="pointer-events-none absolute right-3 top-3 rounded border border-oak-light/60 bg-oak/85 px-2 py-1 text-[10px] text-vellum/60">
        ×{camera.scale.toFixed(2)} · lăn chuột để phóng, kéo để dời
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chọn thứ nằm dưới con trỏ
// ---------------------------------------------------------------------------

/**
 * Thứ tự ưu tiên là thứ tự CHỒNG LỚP, đọc ngược từ trên xuống.
 *
 * Công trình nằm trên cùng nên nó thắng; một cái mạch tài nguyên phủ rộng hàng
 * trăm ô mà thắng công trình đứng trên nó thì không bao giờ bấm được vào cái
 * xưởng cưa nữa.
 */
function pickAt(holding: Holding, streets: readonly Street[], cell: Cell): MapSelection | null {
  for (const placed of holding.buildings) {
    const definition = buildingOf(placed.buildingId);
    if (definition === null) continue;
    const footprint = footprintOf(definition);
    if (cell.x >= placed.at.x && cell.x <= placed.at.x + footprint && cell.y >= placed.at.y && cell.y <= placed.at.y + footprint) {
      return { kind: 'cong-trinh', id: placed.id };
    }
  }

  for (const project of holding.projects) {
    const definition = buildingOf(project.buildingId);
    if (definition === null) continue;
    const footprint = footprintOf(definition);
    if (cell.x >= project.at.x && cell.x <= project.at.x + footprint && cell.y >= project.at.y && cell.y <= project.at.y + footprint) {
      return { kind: 'du-an', id: project.id };
    }
  }

  for (const wall of holding.walls) {
    if (distanceToStreet(cell, wall.points) <= PICK_SLOP) return { kind: 'tuong', id: wall.id };
  }
  for (const road of holding.roads) {
    if (distanceToStreet(cell, road.points) <= PICK_SLOP) return { kind: 'duong', id: road.id };
  }
  for (const street of streets) {
    if (distanceToStreet(cell, street.points) <= PICK_SLOP) return { kind: 'tuyen', id: street.id };
  }

  for (const node of holding.nodes) {
    if (node.grade <= 0) continue;
    if (Math.hypot(node.at.x - cell.x, node.at.y - cell.y) <= node.size) return { kind: 'mach', id: node.id };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Tường
// ---------------------------------------------------------------------------

function drawWall(context: CanvasRenderingContext2D, view: View, wall: WallLine, highlight: boolean): void {
  const material = wallMaterialOf(wall.materialId);
  const done = wall.weeksLeft <= 0;
  // Bề dày nét theo bề dày tường THẬT, có sàn để một hàng rào gỗ vẫn nhìn thấy.
  const thickness = Math.max(1.6, (material?.thickness ?? 1) * view.scale * 1.7);
  const wear = Math.max(0.3, wall.integrity / 100);

  drawPolyline(context, view, wall.points, `rgba(16,14,11,${String(0.55 * wear)})`, thickness * 1.4);
  drawPolyline(
    context,
    view,
    wall.points,
    highlight
      ? '#f0dfaa'
      : done
        ? `rgba(${String(Math.round(212 * wear))}, ${String(Math.round(198 * wear))}, ${String(Math.round(170 * wear))}, 0.94)`
        : 'rgba(176, 141, 79, 0.5)',
    thickness,
    done ? [] : [Math.max(6, 8 * view.scale), Math.max(4, 6 * view.scale)],
  );

  // Tháp canh ở mỗi điểm gãy — dấu hiệu người chơi tự bấm ra chỗ đó.
  if (material !== null && view.scale > 0.07) {
    context.fillStyle = `rgba(178,172,158,${String(wear)})`;
    for (const point of wall.points) {
      const [px, py] = toPx(view, point.x, point.y);
      context.beginPath();
      context.arc(px, py, thickness * 0.72, 0, Math.PI * 2);
      context.fill();
    }
  }
}

// ---------------------------------------------------------------------------
// Tên gọi
// ---------------------------------------------------------------------------

const TERRAIN_NAMES: Readonly<Record<string, string>> = {
  'dat-tot': 'đất tốt', 'dat-can': 'đất cằn', song: 'sông', suoi: 'suối', doi: 'đồi',
  'da-goc': 'đá gốc', 'mo-sat': 'vỉa sắt', rung: 'rừng', dam: 'đầm', bien: 'biển',
};

export function terrainName(id: string): string {
  return TERRAIN_NAMES[id] ?? id;
}

/** Tên đọc được của một thứ đang tra cứu — dùng chung với bảng bên phải. */
export function describeSelection(
  holding: Holding,
  streets: readonly Street[],
  selection: MapSelection,
): { title: string; node: ResourceNode | null; road: RoadLine | null; wall: WallLine | null } {
  if (selection.kind === 'mach') {
    const node = holding.nodes.find((row) => row.id === selection.id) ?? null;
    return { title: node === null ? 'mạch đã cạn' : node.zone, node, road: null, wall: null };
  }
  if (selection.kind === 'duong') {
    const road = holding.roads.find((row) => row.id === selection.id) ?? null;
    return { title: road?.name ?? 'tuyến đã phá', node: null, road, wall: null };
  }
  if (selection.kind === 'tuong') {
    const wall = holding.walls.find((row) => row.id === selection.id) ?? null;
    return { title: wall?.name ?? 'tuyến đã phá', node: null, road: null, wall };
  }
  if (selection.kind === 'tuyen') {
    const street = streets.find((row) => row.id === selection.id);
    return { title: street?.name ?? 'đường mòn', node: null, road: null, wall: null };
  }
  if (selection.kind === 'du-an') {
    const project = holding.projects.find((row) => row.id === selection.id);
    return {
      title: project === undefined ? 'công trường đã dỡ' : `${buildingOf(project.buildingId)?.name ?? project.buildingId} (đang xây)`,
      node: null, road: null, wall: null,
    };
  }
  const placed = holding.buildings.find((row) => row.id === selection.id);
  return {
    title: placed === undefined ? 'công trình đã mất' : placed.customName === '' ? buildingOf(placed.buildingId)?.name ?? placed.buildingId : placed.customName,
    node: null, road: null, wall: null,
  };
}

/** `roadSurfaceOf` và `standingWalls` tái xuất để bảng ngoài dùng chung một nguồn. */
export { roadSurfaceOf, standingWalls };
