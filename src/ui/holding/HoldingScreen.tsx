/**
 * MÀN HÌNH THÀNH TRÌ — Phần 12 mục 11.
 *
 * Sáu thứ mục 11 đòi, và cả sáu đều có mặt:
 *   1. bản đồ lưới, kéo thả, hiện trước hiệu ứng kề nhau  → `HoldingGrid`
 *   2. bảng tài nguyên và nhân công, dự báo theo mùa       → `ResourcePanel`
 *   3. hàng đợi xây dựng với tiến độ từng tuần             → `BuildQueue`
 *   4. bảng dân cư theo nhóm và theo chủng tộc             → `PopulationPanel`
 *   5. bảng "Nếu bị vây", nối sang Phần 11                 → `SiegePanel`
 *   6. nút chuyển nhanh giữa các thành trì, đánh dấu tòa chính → thanh trên cùng
 *
 * MÀN HÌNH KHÔNG GHI STORE GIỮA CHỪNG, cùng luật với Phần 9, 10, 11: mọi thay
 * đổi tích trong state cục bộ, và chỉ khi bấm "Chốt" thì cả lô mới đi qua MVU
 * một lần với actor `engine`. Chốt từng tuần thì `undo` một cái sẽ để lại nửa
 * năm xây dựng trong state.
 *
 * MỘT TUẦN LÀ MỘT LƯỢT BẤM, và nút "chạy một năm" là thứ làm hai mươi năm nuôi
 * thành chơi được — nó tự dừng khi có công trình xong, có công trình sập, hoặc
 * lòng dân rơi xuống mức bạo loạn.
 */

import { useMemo, useState, type ReactNode } from 'react';
import { addDays, formatGameDate, type GameDate } from '@/core/clock';
import { createRngHub } from '@/core/rng';
import { applyPatch } from '@/state/mvu';
import type { PatchOp } from '@/state/mvu-parse';
import type { GameState } from '@/state/slices';
import { useGameStore } from '@/state/store';
import { crueltyOf, mercyOf } from '@/systems/siege';
import {
  HOLDING_STREAM,
  advanceWeek,
  allBuildings,
  buildingOf,
  cancelProject,
  canUpgrade,
  labourOf,
  produce,
  resourceOf,
  startProject,
  tierOf,
  unrestFor,
  upgrade,
  type Cell,
  type Holding,
} from '@/systems/holding';
import { HoldingGrid } from './HoldingGrid';
import { ensureLogisticsNetwork, militaryResourcesOf, militaryStateOf } from '@/systems/military';
import { BuildQueue, PopulationPanel, ResourcePanel, SiegePanel } from './HoldingPanels';

export interface HoldingScreenProps {
  holdings: readonly Holding[];
  date: GameDate;
  onClose: () => void;
}

const GROUP_NAMES: Readonly<Record<string, string>> = {
  'san-xuat': 'Sản xuất',
  'quan-su': 'Quân sự',
  'dan-sinh': 'Dân sinh',
  'ton-giao': 'Tôn giáo',
  'hanh-chinh': 'Hành chính',
  'hoc-van': 'Học vấn',
  'phong-thu': 'Phòng thủ',
  'dac-thu-toc': 'Đặc thù tộc',
};

export function HoldingScreen({ holdings: initial, date: startDate, onClose }: HoldingScreenProps): ReactNode {
  const [list, setList] = useState<Holding[]>([...initial]);
  const [viewing, setViewing] = useState(initial.find((row) => row.seat)?.id ?? initial[0]?.id ?? '');
  const [date, setDate] = useState<GameDate>(startDate);
  const [selected, setSelected] = useState('');
  const [log, setLog] = useState<string[]>([]);
  const [committed, setCommitted] = useState(false);

  const holding = list.find((row) => row.id === viewing) ?? list[0] ?? null;
  const tier = holding === null ? null : tierOf(holding.tierId);

  const { pool, production } = useMemo(() => {
    if (holding === null) return { pool: null, production: null };
    const labour = labourOf(holding, date);
    return { pool: labour, production: produce(holding, { borrowed: 0, pool: labour, besieged: holding.besieged }) };
  }, [holding, date]);

  if (holding === null || tier === null || pool === null || production === null) return null;

  const replace = (next: Holding): void => {
    setList((rows) => rows.map((row) => (row.id === next.id ? next : row)));
  };

  /** Dòng xúc sắc RIÊNG của thành trì, khôi phục ở mỗi lần bấm (R3). */
  const rngFor = (): ReturnType<ReturnType<typeof createRngHub>['stream']> => {
    const snapshot = useGameStore.getState().snapshot();
    return createRngHub(snapshot.meta.seed, snapshot.meta.rng).stream(HOLDING_STREAM);
  };

  const lord = (): { cruelty: number; mercy: number; maimed: boolean } => {
    const snapshot = useGameStore.getState().snapshot();
    return { cruelty: crueltyOf(snapshot), mercy: mercyOf(snapshot), maimed: false };
  };

  const runWeeks = (count: number): void => {
    const rng = rngFor();
    const snapshot = useGameStore.getState().snapshot();
    let current = holding;
    let when = date;
    const notes: string[] = [];

    for (let index = 0; index < count; index++) {
      const report = advanceWeek(current, rng, {
        date: when,
        turn: snapshot.meta.turn,
        lord: lord(),
        autoAssign: true,
        allowBorrow: true,
        state: snapshot,
      });
      current = report.holding;
      when = addDays(when, 7);
      for (const note of report.notes) notes.push(`${formatGameDate(when)} — ${note}`);

      // Tự dừng khi có chuyện đáng nhìn: một công trình xong, một công trình
      // sập, hoặc dân bắt đầu bỏ đi. Chạy tiếp qua những mốc ấy là cách chắc
      // chắn nhất để người chơi không bao giờ thấy chúng.
      const worthStopping =
        report.build.completed.length > 0 ||
        report.build.collapsed.length > 0 ||
        unrestFor(report.morale).riotChance > 0;
      if (worthStopping && index < count - 1) break;
    }

    replace(current);
    setDate(when);
    setLog((rows) => [...notes, ...rows].slice(0, 60));
    setCommitted(false);
  };

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
      setLog((rows) => [`Không khởi công được: ${result.reason}`, ...rows].slice(0, 60));
      return;
    }
    replace(result.holding);
    setSelected('');
    setCommitted(false);
    if (result.illegal) {
      setLog((rows) => [`Khởi công KHÔNG GIẤY PHÉP: ${buildingOf(buildingId)?.name ?? buildingId}.`, ...rows]);
    }
  };

  const tryUpgrade = (): void => {
    const result = upgrade(holding, rngFor(), true);
    if (!result.ok) {
      setLog((rows) => [`Chưa lên cấp được: ${result.reason}`, ...rows].slice(0, 60));
      return;
    }
    replace(result.holding);
    setCommitted(false);
    setLog((rows) =>
      [
        `${holding.name} lên ${tierOf(result.holding.tierId)?.name ?? '?'}${result.illegal ? ' — XÂY LẬU' : ''}.`,
        ...rows,
      ].slice(0, 60),
    );
  };

  /** Chốt cả lô qua MVU một lần, actor `engine` (R2, R4). */
  const commit = (): void => {
    const snapshot = useGameStore.getState().snapshot();
    const ops: PatchOp[] = [
      {
        op: 'set',
        path: 'holdings.list',
        to: list,
        reason: 'Phần 12: kết quả xây dựng và dân cư của các tuần vừa qua',
        source: 'json',
      },
      { op: 'set', path: 'holdings.viewing', to: viewing, reason: 'Phần 12: thành trì đang mở', source: 'json' },
      {
        op: 'set',
        path: 'meta.gameDate',
        to: date,
        reason: 'thời gian xây dựng và sản xuất đã trôi qua theo tuần',
        source: 'json',
      },
    ];
    const military = militaryStateOf(snapshot);
    if (military !== null) {
      const currentHoldingSlice = (snapshot['holdings'] ?? {}) as Record<string, unknown>;
      const proposed = {
        ...snapshot,
        holdings: { ...currentHoldingSlice, list, viewing },
      } as GameState;
      ops.push({
        op: 'set',
        path: 'military',
        to: ensureLogisticsNetwork(military, militaryResourcesOf(proposed)),
        reason: 'doanh trại, kho và công trình mới cập nhật ngay năng lực tuyển quân và hậu cần',
        source: 'json',
      });
    }
    // `name` và `id` là `locked` (mục 10) — ghi cả mảng `list` sẽ đụng vào chúng,
    // nên lô này đi với `skipPermissions`: đây là engine ghi kết quả của chính
    // mình, không phải AI đề xuất một thay đổi.
    const result = applyPatch(snapshot, ops, { actor: 'engine', skipPermissions: true });
    if (result.applied && result.next !== null) {
      useGameStore.getState().commitBatch(result.next);
      setCommitted(true);
      return;
    }
    setLog((rows) => [`Chốt thất bại: ${result.failures.map((row) => row.message).join('; ')}`, ...rows]);
  };

  const check = canUpgrade(holding);
  const palette = allBuildings().filter((row) => row.minTier <= tier.rank);
  const groups = [...new Set(palette.map((row) => row.group))];

  return (
    <div className="fixed inset-0 z-40 flex flex-col overflow-hidden bg-ink text-parchment">
      {/* 6. Nút chuyển nhanh giữa các thành trì, ĐÁNH DẤU RÕ TÒA CHÍNH. */}
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-oak-light bg-oak px-4 py-2">
        {list.map((row) => (
          <button
            key={row.id}
            type="button"
            onClick={() => setViewing(row.id)}
            className={`rounded border px-2 py-1 text-xs ${
              row.id === viewing ? 'border-brass bg-brass/15 text-brass' : 'border-oak-light text-vellum/80'
            }`}
          >
            {row.seat && <span title="tòa chính">★ </span>}
            {tierOf(row.tierId)?.article ?? ''} {row.name}
          </button>
        ))}

        <span className="ml-auto text-xs text-vellum/70">{formatGameDate(date)}</span>
        <button
          type="button"
          onClick={commit}
          disabled={committed}
          className="rounded border border-brass px-2 py-1 text-xs text-brass disabled:opacity-40"
        >
          {committed ? 'đã chốt' : 'Chốt kết quả'}
        </button>
        <button type="button" onClick={onClose} className="rounded border border-oak-light px-2 py-1 text-xs">
          Đóng
        </button>
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <main className="flex min-w-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
          <div className="flex flex-wrap items-baseline gap-3">
            <h2 className="text-lg text-brass">
              {tier.article} {holding.name}
            </h2>
            <span className="text-xs text-vellum/70">
              {tier.name} (cấp {tier.rank}/5) · tường: {tier.wall} · lưới {holding.gridSize}×{holding.gridSize}
            </span>
            {holding.permits.illegalWorks.length > 0 && (
              <span className="rounded border border-blood/60 px-2 py-0.5 text-[10px] text-blood">
                {holding.permits.illegalWorks.length} công trình xây lậu
              </span>
            )}
          </div>

          <HoldingGrid holding={holding} selected={selected} onPlace={place} />

          <section className="flex flex-col gap-2">
            <h3 className="text-[10px] font-semibold tracking-[0.2em] text-brass uppercase">Chọn công trình</h3>
            {groups.map((group) => (
              <div key={group}>
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
                          draggable
                          onDragStart={(event) => {
                            event.dataTransfer.setData('text/plain', row.id);
                            setSelected(row.id);
                          }}
                          onClick={() => setSelected(selected === row.id ? '' : row.id)}
                          title={costLabel(row.cost)}
                          className={`rounded border px-1.5 py-0.5 text-[10px] ${
                            selected === row.id
                              ? 'border-brass bg-brass/15 text-brass'
                              : affordable
                                ? 'border-oak-light text-vellum/80'
                                : 'border-oak-light/50 text-vellum/40'
                          }`}
                        >
                          {row.name}
                          {row.perimeter ? ' ⌒' : ` ${String(row.size[0])}×${String(row.size[1])}`}
                        </button>
                      );
                    })}
                </div>
              </div>
            ))}
          </section>

          <section className="flex flex-wrap items-center gap-2 border-t border-oak-light pt-3">
            <button
              type="button"
              onClick={() => runWeeks(1)}
              className="rounded border border-brass px-3 py-1 text-xs text-brass hover:bg-brass/10"
            >
              Một tuần
            </button>
            <button
              type="button"
              onClick={() => runWeeks(52)}
              className="rounded border border-brass px-3 py-1 text-xs text-brass hover:bg-brass/10"
            >
              Một năm (tự dừng khi có chuyện)
            </button>
            <button
              type="button"
              onClick={tryUpgrade}
              disabled={!check.ok && !check.population.ok}
              className="rounded border border-brass px-3 py-1 text-xs text-brass disabled:opacity-40"
            >
              Lên {check.next?.name ?? 'cấp'}
            </button>
            <UpgradeGate check={check} />
          </section>

          {log.length > 0 && (
            <section className="border-t border-oak-light pt-3 text-[11px] text-vellum/70">
              <h3 className="mb-1 text-[10px] font-semibold tracking-[0.2em] text-brass uppercase">Nhật ký</h3>
              <ul className="flex flex-col gap-0.5">
                {log.map((line, index) => (
                  <li key={`${String(index)}-${line}`}>{line}</li>
                ))}
              </ul>
            </section>
          )}
        </main>

        <aside className="hidden w-80 shrink-0 flex-col gap-4 overflow-y-auto border-l border-oak-light bg-oak p-4 lg:flex">
          <ResourcePanel holding={holding} production={production} pool={pool} date={date} />
          <BuildQueue
            holding={holding}
            date={date}
            onCancel={(projectId) => {
              replace(cancelProject(holding, projectId));
              setCommitted(false);
            }}
          />
          <PopulationPanel holding={holding} />
          <SiegePanel holding={holding} />
        </aside>
      </div>
    </div>
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
  if (check.next === null) return <span className="text-xs text-vellum/60">Đã ở cấp cao nhất.</span>;
  return (
    <span className="flex flex-wrap gap-2 text-[10px]">
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
