import type { ReactNode } from 'react';
import {
  logisticsSummaryOf,
  supplyTypes,
  transportProfiles,
  type MilitarySliceState,
  type RationPolicy,
  type SupplyCondition,
  type TransportMode,
} from '@/systems/military';

export interface LogisticsPanelProps {
  military: MilitarySliceState;
  onPolicy: (forceId: string, ration: RationPolicy, priority: number) => void;
  onRoute: (routeId: string, depotId: string, mode: TransportMode, active: boolean) => void;
}

const RATION_LABELS: Readonly<Record<RationPolicy, string>> = {
  giam: 'Tiết giảm',
  thuong: 'Tiêu chuẩn',
  'day-du': 'Đầy đủ',
};
const RATION_POLICIES: readonly RationPolicy[] = ['giam', 'thuong', 'day-du'];

const CONDITION_LABELS: Readonly<Record<SupplyCondition, string>> = {
  'du-day': 'Đủ đầy',
  cang: 'Căng',
  thieu: 'Thiếu',
  'bi-cat': 'Bị cắt',
};

const CONDITION_TONE: Readonly<Record<SupplyCondition, string>> = {
  'du-day': 'text-moss',
  cang: 'text-brass',
  thieu: 'text-rust',
  'bi-cat': 'text-blood',
};

function n(value: number): string {
  return Math.round(value).toLocaleString('vi-VN');
}

function Bar({ value, tone = 'bg-moss' }: { value: number; tone?: string }): ReactNode {
  return (
    <span className="block h-1.5 overflow-hidden rounded bg-ink/80">
      <span className={`block h-full ${tone}`} style={{ width: `${String(Math.max(0, Math.min(100, value)))}%` }} />
    </span>
  );
}

export function LogisticsPanel({ military, onPolicy, onRoute }: LogisticsPanelProps): ReactNode {
  const logistics = military.logistics;
  const summary = logisticsSummaryOf(military);
  const supplies = supplyTypes();
  const modes = transportProfiles();

  return (
    <section className="space-y-3 rounded border border-oak-light bg-ink/25 p-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h4 className="text-[11px] tracking-[0.18em] text-brass uppercase">Mạng lưới hậu cần</h4>
          <p className="mt-0.5 text-[9px] text-vellum/45">
            Kho → tuyến vận tải → dự trữ dã chiến → tiêu dùng. Không có hàng trong kho thì năng lực vận tải cũng vô dụng.
          </p>
        </div>
        <div className="text-right text-[9px] text-vellum/45">
          <div>Chi tháng {n(summary.monthlyCost)}đ</div>
          <div>Mất dọc đường {n(summary.lost)}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
        {[
          ['Quân nhu trong kho', `${n(summary.depotStock)} / ${n(summary.depotCapacity)}`],
          ['Mức dự trữ', `${n(summary.reservePercent)}%`],
          ['Cấp phát bình quân', `${n(summary.averageSupply)}%`],
          ['Đã chuyển', n(summary.delivered)],
          ['Vận tải dùng', `${n(summary.routeUsed)} / ${n(summary.routeCapacity)}`],
          ['Lực lượng căng/thiếu', n(summary.forcesStrained)],
          ['Bị cắt tiếp tế', n(summary.forcesCutOff)],
          ['Hao hụt tuyến', n(summary.lost)],
        ].map(([label, value]) => (
          <div key={label} className="rounded border border-oak-light/60 px-2 py-1.5">
            <p className="text-[8px] uppercase tracking-wide text-vellum/40">{label}</p>
            <p className="mt-0.5 font-mono text-[11px] text-parchment">{value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-2 xl:grid-cols-2">
        {logistics.depots.map((depot) => {
          const stock = depot.stocks.reduce((sum, row) => sum + row.amount, 0);
          const capacity = depot.stocks.reduce((sum, row) => sum + row.capacity, 0);
          return (
            <div key={depot.id} className={`rounded border p-2 ${depot.besieged ? 'border-blood/70' : 'border-oak-light/60'}`}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[10px] text-parchment">{depot.name}</span>
                <span className={`font-mono text-[9px] ${depot.besieged ? 'text-blood' : 'text-vellum/45'}`}>
                  {depot.besieged ? 'đang bị vây · ' : ''}{n(stock)} / {n(capacity)}
                </span>
              </div>
              <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 sm:grid-cols-3">
                {depot.stocks.map((row) => {
                  const supply = supplies.find((entry) => entry.id === row.supplyId);
                  const ratio = row.capacity <= 0 ? 0 : row.amount / row.capacity * 100;
                  return (
                    <div key={row.supplyId}>
                      <div className="flex justify-between gap-1 text-[8px] text-vellum/45">
                        <span className="truncate">{supply?.name ?? row.supplyId}</span>
                        <span className="font-mono">{n(row.amount)}</span>
                      </div>
                      <Bar value={ratio} tone={ratio < 25 ? 'bg-rust' : ratio < 55 ? 'bg-brass' : 'bg-moss'} />
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
        {logistics.depots.length === 0 && <p className="text-[9px] text-vellum/40">Chưa có kho quân nhu.</p>}
      </div>

      <div className="overflow-x-auto rounded border border-oak-light/60">
        <table className="w-full min-w-[880px] text-left text-[9px]">
          <thead className="bg-oak/65 text-brass">
            <tr>
              <th className="px-2 py-1.5 font-normal">Lực lượng</th>
              <th className="px-2 py-1.5 font-normal">Trạng thái</th>
              <th className="px-2 py-1.5 text-right font-normal">Cấp phát</th>
              <th className="px-2 py-1.5 text-right font-normal">Dự trữ</th>
              <th className="px-2 py-1.5 font-normal">Thiếu</th>
              <th className="px-2 py-1.5 font-normal">Khẩu phần</th>
              <th className="px-2 py-1.5 font-normal">Ưu tiên</th>
            </tr>
          </thead>
          <tbody>
            {logistics.forces.map((status) => {
              const force = military.forces.find((entry) => entry.id === status.forceId);
              return (
                <tr key={status.forceId} className="border-t border-oak-light/45">
                  <td className="px-2 py-1.5 text-parchment">{force?.name ?? status.forceId}</td>
                  <td className={`px-2 py-1.5 ${CONDITION_TONE[status.condition]}`}>{CONDITION_LABELS[status.condition]}</td>
                  <td className="px-2 py-1.5 text-right font-mono">{n(status.supplyLevel)}%</td>
                  <td className="px-2 py-1.5 text-right font-mono">{n(status.daysOfSupply)} ngày</td>
                  <td className="max-w-40 truncate px-2 py-1.5 text-rust">
                    {status.shortages.map((id) => supplies.find((entry) => entry.id === id)?.name ?? id).join(', ') || '—'}
                  </td>
                  <td className="px-2 py-1.5">
                    <select
                      value={status.ration}
                      onChange={(event) => {
                        const ration = event.target.value;
                        if (ration === 'giam' || ration === 'thuong' || ration === 'day-du') {
                          onPolicy(status.forceId, ration, status.priority);
                        }
                      }}
                      className="rounded border border-oak-light bg-ink px-1 py-0.5 text-vellum"
                    >
                      {RATION_POLICIES.map((ration) => <option key={ration} value={ration}>{RATION_LABELS[ration]}</option>)}
                    </select>
                  </td>
                  <td className="px-2 py-1.5">
                    <select
                      value={status.priority}
                      onChange={(event) => onPolicy(status.forceId, status.ration, Number(event.target.value))}
                      className="rounded border border-oak-light bg-ink px-1 py-0.5 text-vellum"
                    >
                      {[1, 2, 3, 4, 5].map((priority) => <option key={priority} value={priority}>{String(priority)}{priority === 5 ? ' · cao nhất' : ''}</option>)}
                    </select>
                  </td>
                </tr>
              );
            })}
            {logistics.forces.length === 0 && <tr><td colSpan={7} className="px-3 py-4 text-center text-vellum/40">Chưa có lực lượng cần tiếp tế.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="overflow-x-auto rounded border border-oak-light/60">
        <table className="w-full min-w-[760px] text-left text-[9px]">
          <thead className="bg-oak/65 text-brass">
            <tr>
              <th className="px-2 py-1.5 font-normal">Đích</th>
              <th className="px-2 py-1.5 font-normal">Kho xuất</th>
              <th className="px-2 py-1.5 font-normal">Phương thức</th>
              <th className="px-2 py-1.5 font-normal">Địa hình</th>
              <th className="px-2 py-1.5 text-right font-normal">Khoảng cách</th>
              <th className="px-2 py-1.5 text-right font-normal">Tình trạng</th>
              <th className="px-2 py-1.5 text-right font-normal">Đã giao</th>
              <th className="px-2 py-1.5 text-right font-normal">Thất thoát</th>
              <th className="px-2 py-1.5 text-right font-normal">Hoạt động</th>
            </tr>
          </thead>
          <tbody>
            {logistics.routes.map((route) => {
              const force = military.forces.find((entry) => entry.id === route.toForceId);
              return (
                <tr key={route.id} className={`border-t border-oak-light/45 ${route.blockaded ? 'text-blood' : 'text-vellum/65'}`}>
                  <td className="px-2 py-1.5">{force?.name ?? route.toForceId}</td>
                  <td className="px-2 py-1.5">
                    <select
                      value={route.fromDepotId}
                      onChange={(event) => onRoute(route.id, event.target.value, route.mode, route.active)}
                      className="max-w-40 rounded border border-oak-light bg-ink px-1 py-0.5 text-vellum"
                    >
                      {logistics.depots.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
                    </select>
                  </td>
                  <td className="px-2 py-1.5">
                    <select
                      value={route.mode}
                      onChange={(event) => {
                        const value = event.target.value;
                        if (value === 'duong-bo' || value === 'duong-song' || value === 'duong-bien' || value === 'duong-nui') {
                          onRoute(route.id, route.fromDepotId, value, route.active);
                        }
                      }}
                      className="max-w-40 rounded border border-oak-light bg-ink px-1 py-0.5 text-vellum"
                    >
                      {modes.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
                    </select>
                  </td>
                  <td className="px-2 py-1.5">{route.terrain}{route.blockaded ? ' · phong tỏa' : ''}</td>
                  <td className="px-2 py-1.5 text-right font-mono">{n(route.distance)} chặng</td>
                  <td className="px-2 py-1.5 text-right font-mono">{n(route.condition)}%</td>
                  <td className="px-2 py-1.5 text-right font-mono">{n(route.deliveredLastMonth)}</td>
                  <td className="px-2 py-1.5 text-right font-mono">{n(route.lostLastMonth)}</td>
                  <td className="px-2 py-1.5 text-right">
                    <button
                      type="button"
                      onClick={() => onRoute(route.id, route.fromDepotId, route.mode, !route.active)}
                      className={`rounded border px-1.5 py-0.5 ${route.active ? 'border-moss/60 text-moss' : 'border-rust/60 text-rust'}`}
                    >
                      {route.active ? 'đang chạy' : 'đã dừng'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {logistics.report.length > 0 && (
        <div className="border-t border-oak-light/50 pt-2 text-[9px] text-vellum/50">
          {logistics.report.map((line, index) => <p key={`${String(index)}-${line}`}>· {line}</p>)}
        </div>
      )}
    </section>
  );
}
