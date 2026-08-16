/**
 * PANEL NỔI TRÊN BẢN ĐỒ.
 *
 * Bố cục mới cho bản đồ chiếm hết màn hình và treo mọi bảng lên trên nó, thay
 * cho một cột cuộn hẹp cạnh một canvas vuông. Lý do không phải thẩm mỹ: mảnh
 * đất rộng sáu cây số, và mỗi trăm điểm ảnh nhường cho một cái sidebar là một
 * trăm điểm ảnh người chơi không nhìn thấy đất của mình.
 *
 * Panel nào cũng TẮT ĐƯỢC và mặc định tắt hết. Một bản đồ bị bốn cái bảng che
 * kín thì tệ hơn hẳn cái sidebar mà nó vừa thay thế.
 */

import type { ReactNode } from 'react';
import {
  DECLINE_WEEKS,
  GRADE_LABEL,
  GROW_WEEKS,
  NODE_ZONE_DEFS,
  ROAD_SURFACES,
  WALL_MATERIALS,
  adjacencyOf,
  buildingOf,
  cellsToMetres,
  describeNode,
  describeRoad,
  describeWall,
  footprintOf,
  isRenewable,
  nodeCapacity,
  outputFactorOf,
  planRoad,
  planWall,
  regenPerWeek,
  resourceOf,
  roadSurfaceOf,
  wallMaterialOf,
  type AdjacencyEffects,
  type Cell,
  type Holding,
  type ResourceNode,
  type PlacementPreview,
  type Street,
} from '@/systems/holding';
import { GROUP_NAMES, ZONE_COLOURS, ZONE_ICONS } from './holdingArt';
import type { MapSelection } from './HoldingMap';

function n(value: number): string {
  return Math.round(value).toLocaleString('vi-VN');
}

// ---------------------------------------------------------------------------
// Khung chung
// ---------------------------------------------------------------------------

export function Panel({
  title,
  onClose,
  children,
  className = '',
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}): ReactNode {
  return (
    <div
      className={`pointer-events-auto flex max-h-full min-h-0 w-[19rem] flex-col rounded border border-oak-light bg-oak/95 shadow-xl backdrop-blur-sm ${className}`}
    >
      <div className="flex shrink-0 items-center justify-between border-b border-oak-light px-3 py-2">
        <span className="text-[10px] font-semibold tracking-[0.2em] text-brass uppercase">{title}</span>
        <button type="button" onClick={onClose} className="text-vellum/50 hover:text-vellum" aria-label="Đóng">
          ✕
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3 text-xs">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }): ReactNode {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-oak-light/50 py-1 last:border-b-0">
      <span className="text-vellum/70">{label}</span>
      <span className="text-right text-parchment">{value}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tra cứu thứ đang chọn
// ---------------------------------------------------------------------------

export interface InspectorProps {
  holding: Holding;
  streets: readonly Street[];
  selection: MapSelection;
  onClose: () => void;
  onDemolish: (buildingId: string) => void;
  onCancelProject: (projectId: string) => void;
  onRazeWall: (wallId: string) => void;
  onRazeRoad: (roadId: string) => void;
  onRazeStreet: (streetId: string) => void;
}

/**
 * BẤM VÀO MỘT THỨ THÌ ĐỌC ĐƯỢC SỔ CỦA NÓ.
 *
 * Bản cũ không có cửa này: người chơi thấy một ô vuông màu và không có cách nào
 * biết cái xưởng ấy đang ra bao nhiêu gỗ, hay vì sao nó ra ít. Mọi con số ở đây
 * đều là con số CHÍNH XÁC (Phụ lục A mục 6) — lãnh chúa biết rõ thành mình.
 */
export function Inspector(props: InspectorProps): ReactNode {
  const { holding, streets, selection } = props;

  if (selection.kind === 'cong-trinh') return <BuildingCard {...props} />;

  if (selection.kind === 'du-an') {
    const project = holding.projects.find((row) => row.id === selection.id);
    if (project === undefined) return null;
    const definition = buildingOf(project.buildingId);
    return (
      <Panel title="Công trường" onClose={props.onClose}>
        <h4 className="mb-2 text-sm text-brass">{definition?.name ?? project.buildingId}</h4>
        <Row label="Còn lại" value={`${n(project.manWeeksLeft)} công · tối thiểu ${n(project.weeksLeft)} tuần`} />
        <Row label="Tổ thợ" value={`${n(project.crew)} người`} />
        <Row label="Kiến trúc sư" value={project.architectSkill > 0 ? `kỹ năng ${n(project.architectSkill)}` : 'CHƯA CÓ AI'} />
        {Object.keys(project.missing).length > 0 && (
          <p className="mt-2 rounded border border-blood/60 bg-blood/10 p-2 text-blood">
            Thiếu {Object.entries(project.missing).map(([id, amount]) => `${n(amount)} ${resourceOf(id)?.name ?? id}`).join(', ')}
          </p>
        )}
        {project.stalled !== '' && (
          <p className="mt-2 rounded border border-blood/60 bg-blood/10 p-2 text-blood">{project.stalled}</p>
        )}
        <button
          type="button"
          onClick={() => { props.onCancelProject(project.id); }}
          className="mt-3 w-full rounded border border-blood/60 px-2 py-1 text-blood hover:bg-blood/10"
        >
          Dỡ công trường
        </button>
      </Panel>
    );
  }

  if (selection.kind === 'mach') {
    const node = holding.nodes.find((row) => row.id === selection.id);
    if (node === undefined) return null;
    const zone = NODE_ZONE_DEFS[node.zone];
    return (
      <Panel title="Mạch tài nguyên" onClose={props.onClose}>
        <h4 className="mb-2 flex items-center gap-2 text-sm text-brass">
          <span className="h-3 w-3 rounded-sm" style={{ background: ZONE_COLOURS[node.zone] ?? '#888' }} />
          {ZONE_ICONS[node.zone] ?? '●'} {zone?.name ?? node.zone}
        </h4>
        <p className="mb-2 text-vellum/70">{describeNode(node)}</p>
        <Row label="Trữ lượng" value={`${GRADE_LABEL[node.grade] ?? '?'} (bậc ${n(node.grade)})`} />
        <Row label="Còn lại" value={n(node.left)} />
        <Row label="Bán kính" value={`${n(cellsToMetres(node.size))} thước`} />
        <Row label="Chỗ cho xưởng" value={`${n(node.workedBy.length)}/${n(nodeCapacity(node))}`} />
        <NodeRenewalRows node={node} />
        <div className="mt-2 border-t border-oak-light pt-2">
          <p className="mb-1 text-[10px] tracking-widest text-brass uppercase">Sản vật</p>
          {Object.entries(zone?.yields ?? {}).map(([id, share]) => (
            <Row key={id} label={resourceOf(id)?.name ?? id} value={`${n(share * 100)}%`} />
          ))}
        </div>
      </Panel>
    );
  }

  if (selection.kind === 'tuong') {
    const wall = holding.walls.find((row) => row.id === selection.id);
    if (wall === undefined) return null;
    const material = wallMaterialOf(wall.materialId);
    return (
      <Panel title="Tuyến tường" onClose={props.onClose}>
        <h4 className="mb-2 text-sm text-brass">{wall.name}</h4>
        <p className="mb-2 text-vellum/70">{describeWall(wall)}</p>
        <Row label="Vật liệu" value={`${material?.name ?? wall.materialId} cấp ${n(wall.level)}`} />
        <Row label="Chiều dài" value={`${n(cellsToMetres(wall.length))} thước`} />
        <Row label="Khép kín" value={wall.closed ? 'có' : 'KHÔNG — địch đi vòng qua đầu tuyến'} />
        <Row label="Nguyên vẹn" value={`${n(wall.integrity)}%`} />
        <Row label="Lớp" value={wall.layer === 'ngoai' ? 'tường ngoài' : 'tường trong'} />
        {material !== null && <p className="mt-2 text-[11px] text-vellum/60">{material.note}</p>}
        <button
          type="button"
          onClick={() => { props.onRazeWall(wall.id); }}
          className="mt-3 w-full rounded border border-blood/60 px-2 py-1 text-blood hover:bg-blood/10"
        >
          Phá tuyến này
        </button>
      </Panel>
    );
  }

  if (selection.kind === 'duong') {
    const road = holding.roads.find((row) => row.id === selection.id);
    if (road === undefined) return null;
    const surface = roadSurfaceOf(road.surfaceId);
    return (
      <Panel title="Tuyến đường" onClose={props.onClose}>
        <h4 className="mb-2 text-sm text-brass">{road.name}</h4>
        <p className="mb-2 text-vellum/70">{describeRoad(road)}</p>
        <Row label="Mặt đường" value={surface?.name ?? road.surfaceId} />
        <Row label="Bề rộng" value={`${n(road.width)} làn`} />
        <Row label="Chiều dài" value={`${n(cellsToMetres(road.length))} thước`} />
        <Row label="Nguyên vẹn" value={`${n(road.integrity)}%`} />
        {surface !== null && <p className="mt-2 text-[11px] text-vellum/60">{surface.note}</p>}
        <button
          type="button"
          onClick={() => { props.onRazeRoad(road.id); }}
          className="mt-3 w-full rounded border border-blood/60 px-2 py-1 text-blood hover:bg-blood/10"
        >
          Phá tuyến này
        </button>
      </Panel>
    );
  }

  const street = streets.find((row) => row.id === selection.id);
  if (street === undefined) return null;
  return (
    <Panel title="Đường mòn" onClose={props.onClose}>
      <h4 className="mb-2 text-sm text-brass">{street.name}</h4>
      <p className="mb-2 text-[11px] text-vellum/60">
        Đường vốn có — không ai bỏ tiền ra làm nó, và nó không thoát nước. Lát đá lên trên thì
        vạch một tuyến mới bằng công cụ Đường đi.
      </p>
      <Row label="Chiều dài" value={`${n(cellsToMetres(streetLengthOf(street.points)))} thước`} />
      <button
        type="button"
        onClick={() => { props.onRazeStreet(street.id); }}
        className="mt-3 w-full rounded border border-oak-light px-2 py-1 text-vellum/70 hover:border-blood/60 hover:text-blood"
      >
        Cho phá lối này
      </button>
    </Panel>
  );
}

/**
 * HAI LUẬT CẠN, và người chơi phải đọc được mình đang ở luật nào.
 *
 * Với mỏ: nói thẳng là bậc không tụt, cạn là mất. Với rừng: hiện CÁN CÂN — mọc
 * lại bao nhiêu một tuần, và còn bao nhiêu năm nữa tới mốc đổi bậc. Không có
 * con số ấy thì "giữ gìn năm mươi năm" là một luật người chơi không có cách nào
 * biết mình đang tuân theo hay đang phá.
 */
function NodeRenewalRows({ node }: { node: ResourceNode }): ReactNode {
  if (!isRenewable(node)) {
    return (
      <Row label="Kiểu cạn" value="mỏ — bậc cố định, moi hết là mất hẳn" />
    );
  }

  const perWeek = regenPerWeek(node, 'ha');
  const weeks = node.strain;
  const years = Math.abs(weeks) / 52;

  return (
    <>
      <Row label="Mọc lại" value={`${perWeek.toFixed(1)} mỗi tuần (giữa hè)`} />
      {weeks === 0 && <Row label="Cán cân" value="vừa đổi chiều" />}
      {weeks > 0 && (
        <Row
          label="Đang giữ được"
          value={`${years.toFixed(1)} năm — dày lên bậc sau ${((GROW_WEEKS - weeks) / 52).toFixed(1)} năm nữa`}
        />
      )}
      {weeks < 0 && (
        <Row
          label="Đang chặt quá tay"
          value={`${years.toFixed(1)} năm — thưa đi một bậc sau ${((DECLINE_WEEKS + weeks) / 52).toFixed(1)} năm nữa`}
        />
      )}
    </>
  );
}

function streetLengthOf(points: readonly Cell[]): number {
  let total = 0;
  for (let index = 0; index < points.length - 1; index++) {
    const a = points[index];
    const b = points[index + 1];
    if (a === undefined || b === undefined) continue;
    total += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return total;
}

/**
 * SỔ CỦA MỘT CÔNG TRÌNH.
 *
 * Hai vế, và vế thứ hai là vế bản cũ không có: sản lượng THẬT sau khi nhân hệ
 * số chất lượng và hiệu ứng kề nhau, chứ không phải con số trong `buildings.json`.
 * Một xưởng cưa xây hỏng đứng cạnh một xưởng thuộc da ra ít hơn hẳn con số trong
 * bảng, và chỗ để biết điều đó phải là chính cái xưởng ấy.
 */
function BuildingCard(props: InspectorProps): ReactNode {
  const { holding, selection } = props;
  const placed = holding.buildings.find((row) => row.id === selection.id);
  if (placed === undefined) return null;
  const definition = buildingOf(placed.buildingId);
  if (definition === null) return null;

  const adjacency = adjacencyOf(holding);
  const effects = adjacency.byBuilding.get(placed.id);
  const factor = outputFactorOf(placed, effects?.output ?? 0);
  const node = placed.nodeId === '' ? null : holding.nodes.find((row) => row.id === placed.nodeId) ?? null;

  return (
    <Panel title="Công trình" onClose={props.onClose}>
      <h4 className="text-sm text-brass">{placed.customName === '' ? definition.name : placed.customName}</h4>
      <p className="mb-2 text-[10px] text-vellum/60">
        {GROUP_NAMES[definition.group] ?? definition.group} · {n(cellsToMetres(footprintOf(definition)))} thước mỗi cạnh
      </p>

      <Row label="Nguyên vẹn" value={`${n(placed.integrity)}%`} />
      <Row label="Tay nghề" value={`${qualityWord(placed.quality)} (×${placed.quality.toFixed(2)})`} />
      <Row label="Sản lượng thật" value={`×${factor.toFixed(2)}`} />
      <Row label="Duy trì" value={placed.maintained ? 'đã trả tuần rồi' : 'BỎ BÊ — đang xuống cấp'} />
      {node !== null && (
        <Row label="Bám mạch" value={`${NODE_ZONE_DEFS[node.zone]?.name ?? node.zone} (${GRADE_LABEL[node.grade] ?? '?'})`} />
      )}

      {Object.keys(definition.output).length > 0 && (
        <div className="mt-2 border-t border-oak-light pt-2">
          <p className="mb-1 text-[10px] tracking-widest text-brass uppercase">Mỗi tuần ra</p>
          {Object.entries(definition.output).map(([id, amount]) => (
            <Row key={id} label={resourceOf(id)?.name ?? id} value={(amount * factor).toFixed(1)} />
          ))}
        </div>
      )}

      {(definition.jobs > 0 || definition.housing > 0) && (
        <div className="mt-2 border-t border-oak-light pt-2">
          {definition.jobs > 0 && <Row label="Việc làm" value={n(definition.jobs)} />}
          {definition.housing > 0 && <Row label="Chỗ ở" value={n(definition.housing)} />}
        </div>
      )}

      {effects !== undefined && (
        <div className="mt-2 border-t border-oak-light pt-2">
          <p className="mb-1 text-[10px] tracking-widest text-brass uppercase">Hàng xóm ảnh hưởng</p>
          <EffectLines effects={effects} />
        </div>
      )}

      <button
        type="button"
        onClick={() => { props.onDemolish(placed.id); }}
        className="mt-3 w-full rounded border border-blood/60 px-2 py-1 text-blood hover:bg-blood/10"
      >
        Phá dỡ
      </button>
    </Panel>
  );
}

/**
 * Hệ số chất lượng thành một từ.
 *
 * Con số vẫn hiện ngay cạnh — từ ngữ để đọc lướt, con số để so hai công trình.
 * Đây là kết quả kiểm định 3d6 lúc hoàn công (mục 7), và nó theo công trình ấy
 * suốt đời nó.
 */
function qualityWord(quality: number): string {
  if (quality >= 1.15) return 'thợ giỏi';
  if (quality >= 1.02) return 'chắc chắn';
  if (quality >= 0.9) return 'tạm được';
  if (quality >= 0.75) return 'cẩu thả';
  return 'làm hỏng';
}

const EFFECT_NAMES: Readonly<Record<string, string>> = {
  output: 'sản lượng', happiness: 'hạnh phúc', beauty: 'vẻ đẹp', faith: 'ảnh hưởng tôn giáo',
  trade: 'thương mại', upkeep: 'chi phí duy trì', hygiene: 'vệ sinh', siegeWeeks: 'tuần cầm cự',
  wallIntegrity: 'độ bền tường', buildSpeed: 'tốc độ xây',
};

export function effectName(id: string): string {
  return EFFECT_NAMES[id] ?? id;
}

function EffectLines({ effects }: { effects: AdjacencyEffects }): ReactNode {
  const rows = Object.entries(effects).filter(([, value]) => Math.abs(value) > 0.001);
  if (rows.length === 0) return <p className="text-vellum/60">Không có hàng xóm nào ảnh hưởng.</p>;
  return (
    <ul className="flex flex-col gap-0.5">
      {rows.map(([id, value]) => (
        <li key={id} className={value >= 0 ? 'text-parchment' : 'text-blood'}>
          {value >= 0 ? '+' : ''}
          {value.toFixed(2)} <span className="text-vellum/70">{effectName(id)}</span>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Xem trước chỗ đặt
// ---------------------------------------------------------------------------

/**
 * HAI VẾ CỦA MỘT CHỖ ĐẶT.
 *
 * Vế "hàng xóm chịu gì" nằm dưới và không bao giờ được rút gọn thành một con số
 * tổng: xưởng thuộc da không mất gì khi đứng cạnh nhà ở, nhà ở mới là bên chịu,
 * và một con số tổng cộng lại sẽ giấu mất chính điều đó.
 */
export function PreviewCard({
  name,
  preview,
  reason,
}: {
  name: string;
  preview: PlacementPreview | null;
  reason: string;
}): ReactNode {
  if (reason !== '') {
    return (
      <div className="pointer-events-none w-[19rem] rounded border border-blood/60 bg-blood/15 p-2 text-xs text-blood shadow-lg backdrop-blur-sm">
        {reason}
      </div>
    );
  }
  if (preview === null) return null;

  return (
    <div className="pointer-events-none flex w-[19rem] flex-col gap-2 rounded border border-oak-light bg-oak/95 p-2 text-xs shadow-lg backdrop-blur-sm">
      <h4 className="text-xs font-semibold tracking-wide text-brass">{name} — đặt ở đây</h4>

      {preview.gains.length === 0 ? (
        <p className="text-vellum/60">Không có hiệu ứng kề nhau nào ở chỗ này.</p>
      ) : (
        <ul className="flex flex-col gap-0.5">
          {preview.gains.map((line) => (
            <li key={line.ruleId} className={line.value >= 0 ? 'text-parchment' : 'text-blood'}>
              {line.value >= 0 ? '+' : ''}
              {line.mode === 'factor' ? `${n(line.value * 100)}%` : line.value.toFixed(1)}{' '}
              <span className="text-vellum/70">{effectName(line.effect)}</span>
              {line.stacks > 1 && <span className="text-vellum/50"> ×{line.stacks}</span>}
            </li>
          ))}
        </ul>
      )}

      {preview.neighbours.length > 0 && (
        <div className="border-t border-oak-light pt-2">
          <p className="mb-1 text-[10px] tracking-widest text-brass uppercase">Hàng xóm chịu</p>
          <ul className="flex flex-col gap-0.5">
            {preview.neighbours.map((row) => (
              <li key={row.buildingId} className="text-vellum/80">
                {row.name}
                {row.lines
                  .filter((line) => line.value < 0)
                  .map((line) => (
                    <span key={line.ruleId} className="text-blood">
                      {' '}
                      {line.mode === 'factor' ? `${n(line.value * 100)}%` : line.value.toFixed(1)}{' '}
                      {effectName(line.effect)}
                    </span>
                  ))}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bộ lọc lớp tài nguyên
// ---------------------------------------------------------------------------

export function LayerPanel({
  holding,
  showNodes,
  showCoverage,
  zoneFilter,
  onToggleNodes,
  onToggleCoverage,
  onToggleZone,
  onAllZones,
  onNoZones,
  onClose,
}: {
  holding: Holding;
  showNodes: boolean;
  showCoverage: boolean;
  zoneFilter: readonly string[];
  onToggleNodes: (on: boolean) => void;
  onToggleCoverage: (on: boolean) => void;
  onToggleZone: (zone: string) => void;
  onAllZones: () => void;
  onNoZones: () => void;
  onClose: () => void;
}): ReactNode {
  const zones = Object.values(NODE_ZONE_DEFS);
  return (
    <Panel title="Hiển thị tài nguyên" onClose={onClose}>
      <div className="mb-2 grid grid-cols-2 gap-1.5 rounded bg-ink/40 p-2">
        <label className="flex cursor-pointer items-center gap-2 text-[11px] text-vellum/80">
          <input type="checkbox" checked={showNodes} onChange={(event) => { onToggleNodes(event.target.checked); }} />
          Mạch tài nguyên
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-[11px] text-vellum/80">
          <input type="checkbox" checked={showCoverage} onChange={(event) => { onToggleCoverage(event.target.checked); }} />
          Vùng bao phủ
        </label>
      </div>

      <div className="mb-2 flex gap-1.5">
        <button type="button" onClick={onAllZones} className="rounded border border-brass/60 px-2 py-0.5 text-[10px] text-brass">
          Chọn tất cả
        </button>
        <button type="button" onClick={onNoZones} className="rounded border border-oak-light px-2 py-0.5 text-[10px] text-vellum/60">
          Bỏ tất cả
        </button>
      </div>

      {zones.map((zone) => {
        const count = holding.nodes.filter((row) => row.zone === zone.id && row.grade > 0).length;
        const on = zoneFilter.length === 0 || zoneFilter.includes(zone.id);
        return (
          <label
            key={zone.id}
            className="mb-1 flex cursor-pointer items-center gap-2 rounded border border-oak-light bg-ink/25 p-2"
          >
            <input type="checkbox" checked={on} onChange={() => { onToggleZone(zone.id); }} />
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: ZONE_COLOURS[zone.id] ?? '#888' }} />
            <span className="flex-1 text-vellum/80">
              {ZONE_ICONS[zone.id] ?? '●'} {zone.name}
            </span>
            <span className="text-[10px] text-vellum/50">{n(count)} vùng</span>
          </label>
        );
      })}
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Bảng công cụ tường và đường
// ---------------------------------------------------------------------------

export function WallToolPanel({
  holding,
  materialId,
  level,
  maxMaterialId,
  draft,
  onMaterial,
  onLevel,
  onClose,
}: {
  holding: Holding;
  materialId: string;
  level: number;
  /** Vật liệu cao nhất cấp khu định cư này dựng nổi. */
  maxMaterialId: string;
  draft: readonly Cell[];
  onMaterial: (id: string) => void;
  onLevel: (level: number) => void;
  onClose: () => void;
}): ReactNode {
  const allowedUpTo = WALL_MATERIALS.findIndex((row) => row.id === maxMaterialId);
  const material = wallMaterialOf(materialId);
  const plan = draft.length >= 2 ? planWall(draft, materialId, level) : null;

  return (
    <Panel title="Vạch tuyến tường" onClose={onClose}>
      <p className="mb-2 text-[11px] text-vellum/60">
        Bấm từng điểm trên bản đồ. Về gần điểm đầu là tuyến khép kín — và chỉ tuyến khép kín mới
        chắn được cả bốn phía.
      </p>

      <p className="mb-1 text-[10px] tracking-widest text-brass uppercase">Vật liệu</p>
      <div className="mb-2 flex flex-col gap-1">
        {WALL_MATERIALS.map((row, index) => {
          const locked = allowedUpTo >= 0 && index > allowedUpTo;
          return (
            <button
              key={row.id}
              type="button"
              disabled={locked}
              onClick={() => { onMaterial(row.id); }}
              className={`rounded border px-2 py-1 text-left text-[11px] ${
                row.id === materialId ? 'border-brass bg-brass/15 text-brass' : 'border-oak-light text-vellum/80'
              } disabled:opacity-35`}
            >
              {row.name}
              {locked && <span className="text-vellum/50"> — cấp thành chưa dựng nổi</span>}
            </button>
          );
        })}
      </div>

      {material !== null && material.maxLevel > 1 && (
        <div className="mb-2">
          <p className="mb-1 text-[10px] tracking-widest text-brass uppercase">Cấp tường</p>
          <div className="flex gap-1">
            {Array.from({ length: material.maxLevel }, (_, index) => index + 1).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => { onLevel(value); }}
                className={`flex-1 rounded border px-2 py-0.5 text-[11px] ${
                  value === level ? 'border-brass bg-brass/15 text-brass' : 'border-oak-light text-vellum/70'
                }`}
              >
                {value}
              </button>
            ))}
          </div>
        </div>
      )}

      {material !== null && <p className="mb-2 text-[11px] text-vellum/60">{material.note}</p>}

      {plan !== null && (
        <div className="border-t border-oak-light pt-2">
          <p className="mb-1 text-[10px] tracking-widest text-brass uppercase">Tuyến đang vạch</p>
          {!plan.ok ? (
            <p className="text-blood">{plan.reason}</p>
          ) : (
            <>
              <Row label="Chiều dài" value={`${n(plan.metres)} thước`} />
              <Row label="Khép kín" value={plan.closed ? `có · ôm ${plan.enclosedKm2.toFixed(2)} km²` : 'chưa'} />
              <Row label="Thời gian" value={`${n(plan.weeks)} tuần · ${n(plan.manWeeks)} công`} />
              <Row label="Người canh" value={`${n(plan.watchmen)} người mỗi phiên`} />
              <Row label="Độ bền" value={n(plan.integrity)} />
              <CostLines cost={plan.cost} stores={holding.stores} />
            </>
          )}
        </div>
      )}
    </Panel>
  );
}

export function RoadToolPanel({
  holding,
  surfaceId,
  width,
  draft,
  onSurface,
  onWidth,
  onClose,
}: {
  holding: Holding;
  surfaceId: string;
  width: number;
  draft: readonly Cell[];
  onSurface: (id: string) => void;
  onWidth: (width: number) => void;
  onClose: () => void;
}): ReactNode {
  const surface = roadSurfaceOf(surfaceId);
  const plan = draft.length >= 2 ? planRoad(draft, surfaceId, width) : null;

  return (
    <Panel title="Lát quãng phố" onClose={onClose}>
      <p className="mb-2 text-[11px] text-vellum/60">
        Quan lộ và ngõ mòn thì có sẵn và không tốn gì. Lát đá lên chúng là chuyện khác: nó tốn
        tiền, tốn thợ, và nó THOÁT NƯỚC — thứ duy nhất mặt đường làm được về mặt cơ học.
      </p>

      <p className="mb-1 text-[10px] tracking-widest text-brass uppercase">Mặt đường</p>
      <div className="mb-2 flex flex-col gap-1">
        {ROAD_SURFACES.map((row) => (
          <button
            key={row.id}
            type="button"
            onClick={() => { onSurface(row.id); }}
            className={`rounded border px-2 py-1 text-left text-[11px] ${
              row.id === surfaceId ? 'border-brass bg-brass/15 text-brass' : 'border-oak-light text-vellum/80'
            }`}
          >
            {row.name}
          </button>
        ))}
      </div>

      <p className="mb-1 text-[10px] tracking-widest text-brass uppercase">Bề rộng</p>
      <div className="mb-2 flex gap-1">
        {[1, 2, 3].map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => { onWidth(value); }}
            className={`flex-1 rounded border px-2 py-0.5 text-[11px] ${
              value === width ? 'border-brass bg-brass/15 text-brass' : 'border-oak-light text-vellum/70'
            }`}
          >
            {value} làn
          </button>
        ))}
      </div>

      {surface !== null && <p className="mb-2 text-[11px] text-vellum/60">{surface.note}</p>}

      {plan !== null && (
        <div className="border-t border-oak-light pt-2">
          <p className="mb-1 text-[10px] tracking-widest text-brass uppercase">Tuyến đang vạch</p>
          {!plan.ok ? (
            <p className="text-blood">{plan.reason}</p>
          ) : (
            <>
              <Row label="Chiều dài" value={`${n(plan.metres)} thước`} />
              {plan.waterCells > 0 && <Row label="Bắc qua nước" value={`${n(plan.waterCells)} ô — tính gấp bốn`} />}
              <Row label="Thời gian" value={`${n(plan.weeks)} tuần · ${n(plan.manWeeks)} công`} />
              <Row label="Vệ sinh" value={`+${plan.hygiene.toFixed(1)} điểm`} />
              <Row label="Duy trì" value={`${plan.upkeep.toFixed(2)} đồng mỗi tuần`} />
              <CostLines cost={plan.cost} stores={holding.stores} />
            </>
          )}
        </div>
      )}
    </Panel>
  );
}

/** Vật tư cần, đỏ lên chỗ nào kho không đủ. */
function CostLines({
  cost,
  stores,
}: {
  cost: Readonly<Record<string, number>>;
  stores: Readonly<Record<string, number>>;
}): ReactNode {
  const rows = Object.entries(cost).filter(([, amount]) => amount > 0);
  if (rows.length === 0) return null;
  return (
    <div className="mt-1 border-t border-oak-light/50 pt-1">
      <p className="mb-1 text-[10px] tracking-widest text-brass uppercase">Vật tư</p>
      {rows.map(([id, amount]) => {
        const have = stores[id] ?? 0;
        return (
          <div key={id} className="flex justify-between py-0.5">
            <span className="text-vellum/70">{resourceOf(id)?.name ?? id}</span>
            <span className={have + 1e-9 < amount ? 'text-blood' : 'text-parchment'}>
              {n(amount)} / {n(have)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
