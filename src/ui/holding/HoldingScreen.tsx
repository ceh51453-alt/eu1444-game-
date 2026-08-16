/**
 * MÀN HÌNH THÀNH TRÌ — Phần 12 mục 11.
 *
 * Sáu thứ mục 11 đòi, và cả sáu đều có mặt:
 *   1. bản đồ mảnh đất, đặt công trình, hiện trước hiệu ứng kề nhau → `HoldingMap`
 *   2. bảng tài nguyên và nhân công, dự báo theo mùa                → `ResourcePanel`
 *   3. hàng đợi xây dựng với tiến độ từng tuần                      → `BuildQueue`
 *   4. bảng dân cư theo nhóm và theo chủng tộc                      → `PopulationPanel`
 *   5. bảng "Nếu bị vây", nối sang Phần 11                          → `SiegePanel`
 *   6. nút chuyển nhanh giữa các thành trì, đánh dấu tòa chính      → thanh trên cùng
 *
 * ---
 *
 * KHÔNG CÒN NÚT "CHỐT KẾT QUẢ", VÀ KHÔNG CÒN NÚT CHẠY TUẦN.
 *
 * Bản cũ giữ mọi thay đổi trong state cục bộ rồi đẩy cả lô qua MVU khi người
 * chơi bấm "Chốt", và có hai cái nút "một tuần" / "một năm" để tua thời gian.
 * Ba cái nút ấy dựng lên một đồng hồ thứ hai: lãnh chúa nuôi thành hai mươi năm
 * trong khi ngoài kia mới là chiều thứ Ba. Mọi hạn chót trong game — nợ thầy
 * của Phần 8, hạn quân dịch của Phần 11, mùa vụ của chính Phần 12 — đều đo bằng
 * cái đồng hồ thứ nhất, nên cái thứ hai chỉ có thể làm chúng sai.
 *
 * Bây giờ THỜI GIAN TRÔI VÌ LỜI KỂ LÀM NÓ TRÔI. Bước 8 của vòng lặp lượt cộng
 * ngày vào lịch và `runHoldingTick` chốt sổ theo (`systems/holding/tick.ts`).
 * Màn hình này không tua được thời gian nữa; nó chỉ còn hai việc: CHO THẤY
 * thành trì đang ở đâu, và NHẬN LỆNH của lãnh chúa.
 *
 * Và vì không còn lô nào để chốt, mỗi lệnh đi thẳng qua MVU ngay lúc bấm. Đó
 * cũng là cách sửa một lỗi cũ: `undo` một cái ở bản trước để lại nửa năm xây
 * dựng lơ lửng trong state cục bộ mà store chưa từng thấy.
 */

import { useMemo, useState, type ReactNode } from 'react';
import { formatGameDate } from '@/core/clock';
import { applyPatch } from '@/state/mvu';
import type { PatchOp } from '@/state/mvu-parse';
import type { GameState } from '@/state/slices';
import { useGameStore } from '@/state/store';
import {
  allBuildings,
  assignLayers,
  buildingOf,
  cancelProject,
  canUpgrade,
  cellsToMetres,
  daysToSettlement,
  demolish,
  describeRoad,
  describeWall,
  fieldOf,
  holdingStreets,
  labourOf,
  pavedMetres,
  planningRadius,
  produce,
  razeStreet,
  removeRoad,
  resourceOf,
  standingWalls,
  startProject,
  startRoad,
  startWall,
  tierOf,
  upgrade,
  type Cell,
  type Holding,
  type PlacementPreview,
  type WallPoint,
} from '@/systems/holding';
import { ensureLogisticsNetwork, militaryResourcesOf, militaryStateOf } from '@/systems/military';
import { HoldingMap, type MapSelection, type MapTool } from './HoldingMap';
import { BuildQueue, PopulationPanel, ResourcePanel, SiegePanel } from './HoldingPanels';
import {
  Inspector,
  LayerPanel,
  Panel,
  PreviewCard,
  RoadToolPanel,
  WallToolPanel,
} from './HoldingOverlays';
import { GROUP_NAMES } from './holdingArt';

export interface HoldingScreenProps {
  /** Thành trì lúc mở màn hình. Dùng để GIEO khi store chưa có cái nào. */
  holdings: readonly Holding[];
  onClose: () => void;
}

/** Cấp khu định cư nào dựng nổi loại tường nào — cùng bảng của `settlement-tiers.json`. */
const WALL_BY_TIER: Readonly<Record<number, string>> = {
  1: 'rao-go', 2: 'rao-go', 3: 'tuong-go', 4: 'tuong-da', 5: 'tuong-da-khoi',
};

type SidePanel = 'kho' | 'dan' | 'xay' | 'vay' | 'lop' | null;

export function HoldingScreen({ holdings: seed, onClose }: HoldingScreenProps): ReactNode {
  // ĐỌC THẲNG TỪ STORE, không giữ bản sao cục bộ. Bước 8 chốt sổ thành trì mỗi
  // khi lịch trôi, và một bản sao cục bộ sẽ đứng im trong lúc thành trì thật đi
  // tiếp — hai nguồn sự thật, đúng thứ cuộc đại tu này bỏ đi.
  //
  // Bấu vào MẢNG THÔ chứ không gọi `allHoldings()`: hàm ấy chạy `safeParse` của
  // zod và dựng một mảng mới mỗi lần gọi, nên làm selector thì nó không bao giờ
  // bằng chính nó ở lần render trước và React quay vòng cho tới khi tràn ngăn
  // xếp. Mảng thô do immer giữ nguyên tham chiếu tới khi có ai thật sự ghi vào.
  const live = useGameStore(
    (state) => (state as unknown as { holdings?: { list?: Holding[] } }).holdings?.list,
  );
  const date = useGameStore((state) => state.meta.gameDate);
  const list = live !== undefined && live.length > 0 ? live : seed;

  const [viewing, setViewing] = useState(seed.find((row) => row.seat)?.id ?? seed[0]?.id ?? '');
  const [tool, setTool] = useState<MapTool>('xem');
  const [selected, setSelected] = useState('');
  const [picked, setPicked] = useState<MapSelection | null>(null);
  const [side, setSide] = useState<SidePanel>(null);
  const [log, setLog] = useState<string[]>([]);
  const [preview, setPreview] = useState<{ preview: PlacementPreview | null; reason: string }>({ preview: null, reason: '' });

  /** Tuyến đang vạch dở. Ở đây để bảng công cụ định giá được nó theo từng điểm. */
  const [draft, setDraft] = useState<Cell[]>([]);
  const [wallMaterial, setWallMaterial] = useState('');
  const [wallLevel, setWallLevel] = useState(1);
  const [roadSurface, setRoadSurface] = useState('duong-soi');
  const [roadWidth, setRoadWidth] = useState(1);

  const [showNodes, setShowNodes] = useState(true);
  const [showCoverage, setShowCoverage] = useState(true);
  const [zoneFilter, setZoneFilter] = useState<string[]>([]);

  const holding = list.find((row) => row.id === viewing) ?? list[0] ?? null;
  const tier = holding === null ? null : tierOf(holding.tierId);

  const streets = useMemo(() => (holding === null ? null : holdingStreets(holding)), [holding]);
  const { pool, production } = useMemo(() => {
    if (holding === null) return { pool: null, production: null };
    const labour = labourOf(holding, date);
    return { pool: labour, production: produce(holding, { borrowed: 0, pool: labour, besieged: holding.besieged }) };
  }, [holding, date]);

  if (holding === null || tier === null || pool === null || production === null || streets === null) return null;

  const note = (line: string): void => { setLog((rows) => [line, ...rows].slice(0, 60)); };

  /** Đổi công cụ thì bỏ tuyến đang vạch dở — nó không có nghĩa với công cụ mới. */
  const pickTool = (next: MapTool): void => {
    setTool(next);
    setDraft([]);
    setPreview({ preview: null, reason: '' });
  };

  /**
   * GHI MỘT THAY ĐỔI, NGAY.
   *
   * `skipPermissions` vì đây là engine ghi kết quả của chính mình, không phải AI
   * đề xuất: ghi cả mảng `list` sẽ chạm vào `name` và `id`, và chúng là `locked`.
   */
  const commit = (next: Holding, reason: string): void => {
    const snapshot = useGameStore.getState().snapshot();
    const rows = list.map((row) => (row.id === next.id ? next : row));
    const ops: PatchOp[] = [
      { op: 'set', path: 'holdings.list', to: rows, reason, source: 'json' },
      { op: 'set', path: 'holdings.viewing', to: next.id, reason: 'Phần 12: thành trì đang mở', source: 'json' },
    ];

    // Doanh trại và kho mới đổi ngay năng lực tuyển quân và hậu cần. Tính lại ở
    // đây chứ không đợi lượt sau: người chơi vừa xây xong cái kho thì bảng hậu
    // cần phải biết, không thì hai màn hình nói hai chuyện.
    const military = militaryStateOf(snapshot);
    if (military !== null) {
      const slice = (snapshot['holdings'] ?? {}) as Record<string, unknown>;
      const proposed = { ...snapshot, holdings: { ...slice, list: rows, viewing: next.id } } as GameState;
      ops.push({
        op: 'set',
        path: 'military',
        to: ensureLogisticsNetwork(military, militaryResourcesOf(proposed)),
        reason: 'công trình mới cập nhật năng lực tuyển quân và hậu cần',
        source: 'json',
      });
    }

    const result = applyPatch(snapshot, ops, { actor: 'engine', skipPermissions: true });
    if (result.applied && result.next !== null) {
      useGameStore.getState().commitBatch(result.next);
      return;
    }
    note(`Không ghi được: ${result.failures.map((row) => row.message).join('; ')}`);
  };

  // --- lệnh của lãnh chúa ---------------------------------------------------

  const place = (buildingId: string, at: Cell): void => {
    const snapshot = useGameStore.getState().snapshot();
    const result = startProject(holding, buildingId, at, {
      turn: snapshot.meta.turn,
      // Kiến trúc sư là một NPC THẬT phải đi tìm (mục 6); chừng nào Phần 15 chưa
      // sinh ra họ thì chỗ này để 0, và mọi công trình lớn sẽ từ chối khởi công
      // — đúng như thiết kế, chứ không phải một chỗ chưa làm xong.
      architectSkill: 0,
      allowIllegal: true,
    });
    if (!result.ok) {
      note(`Không khởi công được: ${result.reason}`);
      return;
    }
    commit(result.holding, `Phần 12: khởi công ${buildingOf(buildingId)?.name ?? buildingId}`);
    setSelected('');
    pickTool('xem');
    note(
      result.illegal
        ? `Khởi công KHÔNG GIẤY PHÉP: ${buildingOf(buildingId)?.name ?? buildingId}.`
        : `Khởi công ${buildingOf(buildingId)?.name ?? buildingId}.`,
    );
  };

  const drawWall = (points: WallPoint[]): void => {
    const materialId = wallMaterial === '' ? WALL_BY_TIER[tier.rank] ?? 'rao-go' : wallMaterial;
    const result = startWall({
      points,
      materialId,
      level: wallLevel,
      stores: holding.stores,
      existing: holding.walls,
      field: fieldOf(holding),
    });
    if (!result.ok || result.line === null) {
      note(`Chưa dựng được tường: ${result.reason}`);
      return;
    }
    const stores = { ...holding.stores };
    for (const [id, amount] of Object.entries(result.spend)) stores[id] = (stores[id] ?? 0) - amount;
    commit(
      { ...holding, stores, walls: assignLayers([...holding.walls, result.line]) },
      'Phần 12: khởi công một tuyến tường',
    );
    note(`Khởi công ${describeWall(result.line)}.`);
  };

  const drawRoad = (points: Cell[]): void => {
    const result = startRoad({
      points,
      surfaceId: roadSurface,
      width: roadWidth,
      stores: holding.stores,
      existing: holding.roads,
      field: fieldOf(holding),
    });
    if (!result.ok || result.line === null) {
      note(`Chưa lát được đường: ${result.reason}`);
      return;
    }
    const stores = { ...holding.stores };
    for (const [id, amount] of Object.entries(result.spend)) stores[id] = (stores[id] ?? 0) - amount;
    commit({ ...holding, stores, roads: [...holding.roads, result.line] }, 'Phần 12: khởi công một tuyến đường');
    note(`Khởi công ${describeRoad(result.line)}.`);
  };

  const tryUpgrade = (): void => {
    const result = upgrade(holding, true);
    if (!result.ok) {
      note(`Chưa lên cấp được: ${result.reason}`);
      return;
    }
    commit(result.holding, 'Phần 12: thành trì lên cấp');
    note(`${holding.name} lên ${tierOf(result.holding.tierId)?.name ?? '?'}${result.illegal ? ' — XÂY LẬU' : ''}.`);
  };

  const check = canUpgrade(holding);
  const palette = allBuildings().filter((row) => row.minTier <= tier.rank && !row.perimeter);
  const groups = [...new Set(palette.map((row) => row.group))];
  const wallMetres = Math.round(
    cellsToMetres(standingWalls(holding.walls).reduce((sum, wall) => sum + wall.length, 0)),
  );

  return (
    <div className="fixed inset-0 z-40 flex flex-col overflow-hidden bg-ink text-parchment">
      {/* --- thanh trên: chuyển thành trì, ngày, đóng ------------------------ */}
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-oak-light bg-oak px-3 py-2">
        {list.map((row) => (
          <button
            key={row.id}
            type="button"
            onClick={() => { setViewing(row.id); setPicked(null); }}
            className={`rounded border px-2 py-1 text-xs ${
              row.id === holding.id ? 'border-brass bg-brass/15 text-brass' : 'border-oak-light text-vellum/80'
            }`}
          >
            {row.seat && <span title="tòa chính">★ </span>}
            {tierOf(row.tierId)?.article ?? ''} {row.name}
          </button>
        ))}

        {/* BẢNG TRẠNG THÁI THỜI GIAN — chỗ cái nút "chạy một tuần" từng đứng.
            Người chơi phải THẤY nhịp mình đang chờ; không thấy thì "thành trì
            tự chạy theo lịch" trông y hệt "thành trì không chạy". */}
        <span className="ml-auto flex items-center gap-2 text-xs">
          <span className="text-vellum/70">{formatGameDate(date)}</span>
          <span
            className="rounded border border-oak-light px-2 py-0.5 text-[10px] text-vellum/60"
            title="Thành trì chốt sổ mỗi bảy ngày. Thời gian trôi theo diễn biến, không có nút tua."
          >
            chốt sổ sau {daysToSettlement(holding)} ngày
          </span>
        </span>

        <button type="button" onClick={onClose} className="rounded border border-oak-light px-2 py-1 text-xs">
          Đóng
        </button>
      </header>

      {/* --- thanh công cụ --------------------------------------------------- */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-oak-light bg-oak/70 px-3 py-1.5 text-xs">
        <h2 className="text-sm text-brass">
          {tier.article} {holding.name}
        </h2>
        <span className="text-[10px] text-vellum/60">
          {tier.name} (cấp {tier.rank}/5) · tầm với {Math.round(cellsToMetres(planningRadius(holding)))} thước
          {wallMetres > 0 && ` · tường ${wallMetres} thước`}
          {holding.roads.length > 0 && ` · phố lát ${pavedMetres(holding.roads)} thước`}
        </span>

        <span className="mx-1 h-4 w-px bg-oak-light" />

        <ToolButton id="xem" tool={tool} onPick={pickTool} label="Xem" hint="Bấm vào một thứ để đọc sổ của nó" />
        <ToolButton id="dat" tool={tool} onPick={pickTool} label="Đặt công trình" hint="Chọn công trình rồi bấm lên đất" />
        <ToolButton id="tuong" tool={tool} onPick={pickTool} label="Tường thành" hint="Bấm từng điểm để vạch tuyến" />
        <ToolButton id="duong" tool={tool} onPick={pickTool} label="Đường đi" hint="Bấm từng điểm để lát quãng phố" />

        <span className="mx-1 h-4 w-px bg-oak-light" />

        <PanelButton id="kho" side={side} onPick={setSide} label="Kho & nhân công" />
        <PanelButton id="xay" side={side} onPick={setSide} label="Hàng đợi" />
        <PanelButton id="dan" side={side} onPick={setSide} label="Dân cư" />
        <PanelButton id="vay" side={side} onPick={setSide} label="Nếu bị vây" />
        <PanelButton id="lop" side={side} onPick={setSide} label="Lớp bản đồ" />

        <span className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={tryUpgrade}
            disabled={check.next === null}
            className="rounded border border-brass px-2 py-1 text-brass disabled:opacity-40"
          >
            Lên {check.next?.name ?? 'cấp'}
          </button>
          <UpgradeGate check={check} />
        </span>
      </div>

      {/* --- bản đồ tràn khung, panel nổi lên trên --------------------------- */}
      <div className="relative flex min-h-0 flex-1">
        <HoldingMap
          holding={holding}
          tool={tool}
          selected={selected}
          picked={picked}
          onPick={setPicked}
          onPlace={place}
          onWall={drawWall}
          onRoad={drawRoad}
          draft={draft}
          onDraft={setDraft}
          showNodes={showNodes}
          showCoverage={showCoverage}
          zoneFilter={zoneFilter}
          onPreview={(next, reason) => { setPreview({ preview: next, reason }); }}
        />

        {/* bảng bên trái: công cụ đang cầm */}
        <div className="pointer-events-none absolute left-3 top-3 flex max-h-[calc(100%-1.5rem)] gap-3">
          {tool === 'tuong' && (
            <WallToolPanel
              holding={holding}
              materialId={wallMaterial === '' ? WALL_BY_TIER[tier.rank] ?? 'rao-go' : wallMaterial}
              level={wallLevel}
              maxMaterialId={WALL_BY_TIER[tier.rank] ?? 'rao-go'}
              draft={draft}
              onMaterial={setWallMaterial}
              onLevel={setWallLevel}
              onClose={() => { pickTool('xem'); }}
            />
          )}
          {tool === 'duong' && (
            <RoadToolPanel
              holding={holding}
              surfaceId={roadSurface}
              width={roadWidth}
              draft={draft}
              onSurface={setRoadSurface}
              onWidth={setRoadWidth}
              onClose={() => { pickTool('xem'); }}
            />
          )}
          {side === 'lop' && (
            <LayerPanel
              holding={holding}
              showNodes={showNodes}
              showCoverage={showCoverage}
              zoneFilter={zoneFilter}
              onToggleNodes={setShowNodes}
              onToggleCoverage={setShowCoverage}
              onToggleZone={(zone) => {
                setZoneFilter((current) => {
                  const all = holding.nodes.map((row) => row.zone);
                  const base = current.length === 0 ? [...new Set(all)] : current;
                  return base.includes(zone) ? base.filter((row) => row !== zone) : [...base, zone];
                });
              }}
              onAllZones={() => { setZoneFilter([]); }}
              onNoZones={() => { setZoneFilter(['__khong-co__']); }}
              onClose={() => { setSide(null); }}
            />
          )}
        </div>

        {/* bảng bên phải: tra cứu và bốn bảng của mục 11 */}
        <div className="pointer-events-none absolute right-3 top-3 flex max-h-[calc(100%-1.5rem)] gap-3">
          {tool === 'dat' && selected !== '' && (
            <PreviewCard
              name={buildingOf(selected)?.name ?? selected}
              preview={preview.preview}
              reason={preview.reason}
            />
          )}
          {picked !== null && (
            <Inspector
              holding={holding}
              streets={streets.streets}
              selection={picked}
              onClose={() => { setPicked(null); }}
              onDemolish={(id) => {
                // `demolish` hoàn lại một phần vật tư và trả về tên đã phá —
                // nhật ký cần cả hai, nên không rút gọn thành một dòng.
                const result = demolish(holding, id);
                commit(result.holding, `Phần 12: phá dỡ ${result.name}`);
                const back = Object.entries(result.recovered)
                  .map(([resourceId, amount]) => `${Math.round(amount)} ${resourceOf(resourceId)?.name ?? resourceId}`)
                  .join(', ');
                note(`Phá dỡ ${result.name}${back === '' ? '' : ` — thu lại ${back}`}.`);
                setPicked(null);
              }}
              onCancelProject={(id) => {
                commit(cancelProject(holding, id), 'Phần 12: dỡ một công trường');
                setPicked(null);
              }}
              onRazeWall={(id) => {
                commit(
                  { ...holding, walls: assignLayers(holding.walls.filter((row) => row.id !== id)) },
                  'Phần 12: phá một tuyến tường',
                );
                setPicked(null);
              }}
              onRazeRoad={(id) => {
                commit({ ...holding, roads: removeRoad(holding.roads, id) }, 'Phần 12: phá một tuyến đường');
                setPicked(null);
              }}
              onRazeStreet={(id) => {
                commit(
                  { ...holding, streetsRazed: razeStreet(holding.streetsRazed, id) },
                  'Phần 12: cho phá một lối mòn',
                );
                setPicked(null);
              }}
            />
          )}

          {side !== null && side !== 'lop' && (
            <Panel title={SIDE_TITLES[side]} onClose={() => { setSide(null); }}>
              {side === 'kho' && <ResourcePanel holding={holding} production={production} pool={pool} date={date} />}
              {side === 'xay' && (
                <BuildQueue
                  holding={holding}
                  date={date}
                  onCancel={(projectId) => { commit(cancelProject(holding, projectId), 'Phần 12: dỡ một công trường'); }}
                />
              )}
              {side === 'dan' && <PopulationPanel holding={holding} />}
              {side === 'vay' && <SiegePanel holding={holding} />}
            </Panel>
          )}
        </div>

        {/* nhật ký: nổi ở góc dưới trái, tự lùi khi có bảng công cụ */}
        {log.length > 0 && (
          <div className="pointer-events-auto absolute bottom-3 left-3 max-h-40 w-[22rem] overflow-y-auto rounded border border-oak-light bg-oak/90 p-2 text-[11px] text-vellum/70 shadow-lg">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[10px] font-semibold tracking-[0.2em] text-brass uppercase">Nhật ký</span>
              <button type="button" onClick={() => { setLog([]); }} className="text-vellum/40 hover:text-vellum">
                ✕
              </button>
            </div>
            <ul className="flex flex-col gap-0.5">
              {log.map((line, index) => (
                <li key={`${String(index)}-${line}`}>{line}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* --- bảng chọn công trình, chỉ khi đang cầm công cụ Đặt -------------- */}
      {tool === 'dat' && (
        <section className="shrink-0 overflow-y-auto border-t border-oak-light bg-oak px-3 py-2" style={{ maxHeight: '11rem' }}>
          {groups.map((group) => (
            <div key={group} className="mb-1.5">
              <p className="mb-1 text-[10px] text-vellum/60">{GROUP_NAMES[group] ?? group}</p>
              <div className="flex flex-wrap gap-1">
                {palette
                  .filter((row) => row.group === group)
                  .map((row) => {
                    const affordable = Object.entries(row.cost).every(
                      ([id, amount]) => (holding.stores[id] ?? 0) >= amount,
                    );
                    return (
                      <button
                        key={row.id}
                        type="button"
                        onClick={() => { setSelected(selected === row.id ? '' : row.id); }}
                        title={costLabel(row.cost)}
                        className={`rounded border px-1.5 py-0.5 text-[10px] ${
                          selected === row.id
                            ? 'border-brass bg-brass/15 text-brass'
                            : affordable
                              ? 'border-oak-light text-vellum/80'
                              : 'border-oak-light/50 text-vellum/40'
                        }`}
                      >
                        {row.name} {row.size[0]}×{row.size[1]}
                      </button>
                    );
                  })}
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

const SIDE_TITLES: Readonly<Record<'kho' | 'dan' | 'xay' | 'vay', string>> = {
  kho: 'Kho & nhân công',
  xay: 'Hàng đợi xây dựng',
  dan: 'Dân cư',
  vay: 'Nếu bị vây',
};

function ToolButton({
  id,
  tool,
  onPick,
  label,
  hint,
}: {
  id: MapTool;
  tool: MapTool;
  onPick: (tool: MapTool) => void;
  label: string;
  hint: string;
}): ReactNode {
  return (
    <button
      type="button"
      title={hint}
      onClick={() => { onPick(id); }}
      className={`rounded border px-2 py-1 ${
        tool === id ? 'border-brass bg-brass/15 text-brass' : 'border-oak-light text-vellum/70'
      }`}
    >
      {label}
    </button>
  );
}

function PanelButton({
  id,
  side,
  onPick,
  label,
}: {
  id: Exclude<SidePanel, null>;
  side: SidePanel;
  onPick: (side: SidePanel) => void;
  label: string;
}): ReactNode {
  return (
    <button
      type="button"
      onClick={() => { onPick(side === id ? null : id); }}
      className={`rounded border px-2 py-1 ${
        side === id ? 'border-brass bg-brass/15 text-brass' : 'border-oak-light text-vellum/70'
      }`}
    >
      {label}
    </button>
  );
}

function costLabel(cost: Record<string, number>): string {
  const parts = Object.entries(cost).map(([id, amount]) => `${String(amount)} ${resourceOf(id)?.name ?? id}`);
  return parts.length === 0 ? 'không tốn gì' : parts.join(', ');
}

/**
 * ĐỦ BỐN THỨ (mục 3) — hiện đủ bốn cửa, không chỉ hiện một nút xám.
 *
 * Cửa thứ tư là GIẤY PHÉP, và nó phải hiện ra ngay cả khi ba cửa kia đã đủ:
 * người chơi VẪN được xây lậu, nhưng phải biết mình đang chọn cái gì.
 */
function UpgradeGate({ check }: { check: ReturnType<typeof canUpgrade> }): ReactNode {
  if (check.next === null) return <span className="text-[10px] text-vellum/60">Đã ở cấp cao nhất.</span>;
  return (
    <span className="flex flex-wrap gap-1 text-[10px]">
      <Gate ok={check.population.ok} label={`dân ${String(check.population.have)}/${String(check.population.need)}`} />
      <Gate
        ok={check.buildings.ok}
        label={
          check.buildings.ok
            ? 'đủ công trình'
            : `thiếu ${check.buildings.missing.map((id) => buildingOf(id)?.name ?? id).join(', ')}`
        }
      />
      <Gate
        ok={check.cost.ok}
        label={
          check.cost.ok
            ? 'đủ vật liệu'
            : `thiếu ${Object.entries(check.cost.missing)
                .map(([id, amount]) => `${String(Math.ceil(amount))} ${resourceOf(id)?.name ?? id}`)
                .join(', ')}`
        }
      />
      <Gate ok={check.permit.ok} label={check.permit.ok ? 'có giấy phép' : 'CHƯA CÓ GIẤY PHÉP — xây lậu'} />
    </span>
  );
}

function Gate({ ok, label }: { ok: boolean; label: string }): ReactNode {
  return (
    <span className={`rounded border px-1.5 py-0.5 ${ok ? 'border-brass/60 text-brass' : 'border-blood/60 text-blood'}`}>
      {ok ? '✓' : '✗'} {label}
    </span>
  );
}
