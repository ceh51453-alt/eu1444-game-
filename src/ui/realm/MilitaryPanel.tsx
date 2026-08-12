import { useMemo, useState, type ReactNode } from 'react';
import {
  recruitmentOptions,
  summaryOf,
  type MilitaryResources,
  type MilitarySliceState,
  type RecruitmentOption,
  type RecruitmentSource,
  type RationPolicy,
  type TransportMode,
} from '@/systems/military';
import { LogisticsPanel } from './LogisticsPanel';

const SOURCE_LABELS: Readonly<Record<RecruitmentSource, string>> = {
  levy: 'Tuyển dân binh',
  mercenary: 'Thuê lính / tàu',
  barracks: 'Qua doanh trại',
};

function n(value: number): string {
  return Math.round(value).toLocaleString('vi-VN');
}

function percent(value: number): string {
  return `${String(Math.round(value))}%`;
}

function Bar({ value, tone = 'bg-brass' }: { value: number; tone?: string }): ReactNode {
  return (
    <span className="block h-1.5 w-20 overflow-hidden rounded bg-ink/80" aria-label={`${String(Math.round(value))}%`}>
      <span className={`block h-full ${tone}`} style={{ width: `${String(Math.max(0, Math.min(100, value)))}%` }} />
    </span>
  );
}

export interface MilitaryPanelProps {
  military: MilitarySliceState;
  resources: MilitaryResources;
  treasury: number;
  faction: string;
  onRecruit: (option: RecruitmentOption, companies: number, destinationId: string) => void;
  onSupplyPolicy: (forceId: string, ration: RationPolicy, priority: number) => void;
  onSupplyRoute: (routeId: string, depotId: string, mode: TransportMode, active: boolean) => void;
}

export function MilitaryPanel({
  military,
  resources,
  treasury,
  faction,
  onRecruit,
  onSupplyPolicy,
  onSupplyRoute,
}: MilitaryPanelProps): ReactNode {
  const [source, setSource] = useState<RecruitmentSource>('levy');
  const [companies, setCompanies] = useState(1);
  const [destinationId, setDestinationId] = useState('');
  const summary = summaryOf(military);
  const options = useMemo(() => recruitmentOptions(faction).filter((option) => option.source === source), [faction, source]);
  const landForces = military.forces.filter((force) => force.kind === 'land');
  const manpowerFree = Math.max(
    0,
    resources.manpowerCapacity -
      summary.manpowerUsed -
      military.recruitment.reduce((sum, order) => sum + order.manpowerCost, 0),
  );
  const logisticsFree = Math.max(
    0,
    resources.logisticsCapacity -
      summary.logisticsUsed -
      military.recruitment.reduce((sum, order) => sum + order.logisticsCost, 0),
  );

  return (
    <section className="flex flex-col gap-3 rounded border border-oak-light bg-oak/20 p-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 className="text-xs tracking-[0.2em] text-brass uppercase">Quân lực &amp; tuyển mộ</h3>
          <p className="mt-1 text-[10px] text-vellum/50">
            Mỗi lệnh tuyển chiếm nhân lực và hậu cần ngay; quân chỉ nhập ngũ khi đủ số tháng.
          </p>
        </div>
        <div className="text-right text-[10px] text-vellum/60">
          <div>Kho bạc {n(treasury)}đ</div>
          <div>Quân phí tháng {n(summary.monthlyUpkeep)}đ</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
        {[
          ['Tổng quân', n(summary.totalTroops)],
          ['Lục quân', n(summary.landTroops)],
          ['Hải quân', n(summary.navyPersonnel)],
          ['Đạo quân', n(summary.armies)],
          ['Hạm đội', n(summary.fleets)],
          ['Sĩ khí', percent(summary.morale)],
          ['Kinh nghiệm', percent(summary.experience)],
          ['Huấn luyện', percent(summary.training)],
        ].map(([label, value]) => (
          <div key={label} className="rounded border border-oak-light/70 bg-ink/45 px-2 py-1.5">
            <div className="text-[9px] tracking-wide text-vellum/45 uppercase">{label}</div>
            <div className="mt-0.5 font-mono text-sm text-parchment">{value}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-2 lg:grid-cols-3">
        <div className="rounded border border-oak-light/70 px-2 py-2">
          <div className="flex justify-between text-[10px]"><span>Nhân lực khả dụng</span><span>{n(manpowerFree)} / {n(resources.manpowerCapacity)}</span></div>
          <Bar value={resources.manpowerCapacity <= 0 ? 0 : (manpowerFree / resources.manpowerCapacity) * 100} />
          <p className="mt-1 text-[9px] text-vellum/40">Nguồn dân và nghĩa vụ chư hầu; lính đánh thuê không lấy phần này.</p>
        </div>
        <div className="rounded border border-oak-light/70 px-2 py-2">
          <div className="flex justify-between text-[10px]"><span>Hậu cần còn trống</span><span>{n(logisticsFree)} / {n(resources.logisticsCapacity)}</span></div>
          <Bar value={resources.logisticsCapacity <= 0 ? 0 : (logisticsFree / resources.logisticsCapacity) * 100} tone="bg-emerald-600" />
          <p className="mt-1 text-[9px] text-vellum/40">Kho vũ khí, doanh trại và đường sá quyết định sức chứa.</p>
        </div>
        <div className="rounded border border-oak-light/70 px-2 py-2">
          <div className="flex justify-between text-[10px]"><span>Doanh trại hoạt động</span><span>{String(resources.barracks)} · sức chứa {n(resources.barracksCapacity)}</span></div>
          <Bar value={resources.barracks <= 0 ? 0 : Math.min(100, resources.barracks * 25)} tone="bg-sky-600" />
          <p className="mt-1 text-[9px] text-vellum/40">Bắt buộc với quân chính quy và tinh nhuệ.</p>
        </div>
      </div>

      <div className="overflow-x-auto rounded border border-oak-light/70">
        <table className="w-full min-w-[760px] border-collapse text-left text-[10px]">
          <thead className="bg-oak/70 text-brass">
            <tr>
              <th className="px-2 py-1.5 font-normal">Đạo quân / hạm đội</th>
              <th className="px-2 py-1.5 font-normal">Binh chủng</th>
              <th className="px-2 py-1.5 text-right font-normal">Quân số</th>
              <th className="px-2 py-1.5 font-normal">Nguồn</th>
              <th className="px-2 py-1.5 font-normal">Sĩ khí</th>
              <th className="px-2 py-1.5 font-normal">Kinh nghiệm</th>
              <th className="px-2 py-1.5 font-normal">Huấn luyện</th>
              <th className="px-2 py-1.5 text-right font-normal">Quân phí/tháng</th>
            </tr>
          </thead>
          <tbody>
            {military.forces.flatMap((force) =>
              force.units.map((unit) => (
                <tr key={unit.id} className="border-t border-oak-light/50">
                  <td className="px-2 py-1.5 text-parchment">{force.name}<span className="ml-1 text-vellum/35">· {force.kind === 'land' ? 'lục quân' : 'hải quân'}</span></td>
                  <td className="px-2 py-1.5">{unit.name}</td>
                  <td className="px-2 py-1.5 text-right font-mono">{n(unit.strength)}</td>
                  <td className="px-2 py-1.5 text-vellum/55">{SOURCE_LABELS[unit.source]}</td>
                  <td className="px-2 py-1.5"><span>{percent(unit.morale)}</span><Bar value={unit.morale} /></td>
                  <td className="px-2 py-1.5"><span>{percent(unit.experience)}</span><Bar value={unit.experience} tone="bg-amber-700" /></td>
                  <td className="px-2 py-1.5"><span>{percent(unit.training)}</span><Bar value={unit.training} tone="bg-sky-700" /></td>
                  <td className="px-2 py-1.5 text-right font-mono">{n(unit.monthlyUpkeep)}đ</td>
                </tr>
              )),
            )}
            {summary.totalTroops === 0 && (
              <tr><td colSpan={8} className="px-3 py-5 text-center text-vellum/40">Chưa có quân thường trực hay hạm đội.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <LogisticsPanel military={military} onPolicy={onSupplyPolicy} onRoute={onSupplyRoute} />

      {military.recruitment.length > 0 && (
        <div className="rounded border border-brass/40 bg-brass/5 p-2">
          <div className="mb-1 text-[10px] tracking-wider text-brass uppercase">Đang tuyển · {n(summary.queuedTroops)} người</div>
          <div className="grid gap-1 md:grid-cols-2">
            {military.recruitment.map((order) => (
              <div key={order.id} className="flex items-center justify-between rounded border border-oak-light/60 px-2 py-1 text-[10px]">
                <span>{n(order.strength)} {order.unitName}<span className="ml-1 text-vellum/35">· {SOURCE_LABELS[order.source]}</span></span>
                <span className="font-mono text-brass">còn {String(order.monthsLeft)} tháng</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {(Object.keys(SOURCE_LABELS) as RecruitmentSource[]).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setSource(id)}
              className={`rounded border px-2 py-1 text-[10px] ${source === id ? 'border-brass bg-brass/10 text-brass' : 'border-oak-light text-vellum/65'}`}
            >
              {SOURCE_LABELS[id]}
            </button>
          ))}
          <label className="ml-2 flex items-center gap-1 text-[10px] text-vellum/60">
            Số đội
            <input
              type="number"
              min={1}
              max={20}
              value={companies}
              onChange={(event) => setCompanies(Math.max(1, Math.min(20, Number(event.target.value) || 1)))}
              className="w-14 rounded border border-oak-light bg-ink px-1 py-0.5 font-mono text-parchment"
            />
          </label>
          {landForces.length > 0 && (
            <label className="flex items-center gap-1 text-[10px] text-vellum/60">
              Nhập vào
              <select
                value={destinationId}
                onChange={(event) => setDestinationId(event.target.value)}
                className="rounded border border-oak-light bg-ink px-1 py-0.5 text-parchment"
              >
                <option value="">Đạo quân đầu tiên</option>
                {landForces.map((force) => <option key={force.id} value={force.id}>{force.name}</option>)}
              </select>
            </label>
          )}
        </div>

        <div className="grid gap-1.5 md:grid-cols-2 xl:grid-cols-3">
          {options.map((option) => {
            const strength = option.type.standardStrength * companies;
            const money = option.moneyPerCompany * companies;
            const blockedByBarracks = source === 'barracks' && resources.barracks <= 0;
            const blocked = blockedByBarracks || treasury < money;
            return (
              <button
                key={option.type.id}
                type="button"
                disabled={blocked}
                onClick={() => onRecruit(option, companies, option.forceKind === 'land' ? destinationId : '')}
                className="flex items-center justify-between gap-2 rounded border border-oak-light px-2 py-2 text-left hover:bg-oak-light/40 disabled:cursor-not-allowed disabled:opacity-35"
                title={blockedByBarracks ? 'Cần xây Doanh trại trong một thành trì' : option.type.requires}
              >
                <span>
                  <span className="block text-xs text-parchment">{option.type.name}</span>
                  <span className="block text-[9px] text-vellum/40">{option.forceKind === 'land' ? 'lục quân' : 'hải quân'} · {n(strength)} người · {String(option.months)} tháng · cấp {String(option.type.quality)}</span>
                </span>
                <span className="shrink-0 text-right font-mono text-[10px] text-brass">{n(money)}đ</span>
              </button>
            );
          })}
          {options.length === 0 && (
            <p className="text-[10px] text-vellum/40">Không có binh chủng phù hợp với nguồn tuyển này.</p>
          )}
        </div>
      </div>

      {military.lastMonthlyReport.length > 0 && (
        <div className="border-t border-oak-light/60 pt-2 text-[10px] text-vellum/55">
          {military.lastMonthlyReport.map((line, index) => <p key={`${String(index)}-${line}`}>· {line}</p>)}
        </div>
      )}
    </section>
  );
}
