/**
 * BỐN BẢNG CÒN LẠI CỦA MỤC 11.
 *
 *   `ResourcePanel`    tài nguyên và nhân công, CÓ DỰ BÁO THEO MÙA
 *   `BuildQueue`       hàng đợi xây dựng với tiến độ từng tuần
 *   `PopulationPanel`  dân cư theo nhóm, theo chủng tộc, lòng dân từng nhóm
 *   `SiegePanel`       "Nếu bị vây" — số tuần cầm cự và điểm yếu bố cục
 *
 * MỘT LUẬT CHUNG CHO CẢ BỐN: **con số ở đây là con số CHÍNH XÁC** (Phụ lục A
 * mục 6). Lãnh chúa biết rõ thành mình — 1.240 dân, kho còn 380 giạ. Giọng ước
 * chừng ("khoảng chín nghìn nhân khẩu") thuộc về bảng lãnh thổ của Phần 13, và
 * nếu nó lọt vào đây thì hai tầng bắt đầu nói cùng một giọng.
 */

import type { ReactNode } from 'react';
import { seasonOfDate, type GameDate } from '@/core/clock';
import {
  buildingOf,
  capacityOf,
  foodEaten,
  harvestFactor,
  labourSeasonOf,
  labourSeasons,
  resourceOf,
  siegeReadiness,
  stratumOf,
  unrestFor,
  type Holding,
  type LabourPool,
  type Production,
} from '@/systems/holding';
import { raceName } from '@/systems/character/races';

function n(value: number): string {
  return Math.round(value).toLocaleString('vi-VN');
}

// ---------------------------------------------------------------------------
// Tài nguyên & nhân công
// ---------------------------------------------------------------------------

export interface ResourcePanelProps {
  holding: Holding;
  production: Production;
  pool: LabourPool;
  date: GameDate;
}

export function ResourcePanel({ holding, production, pool, date }: ResourcePanelProps): ReactNode {
  const capacity = capacityOf(production);
  const eaten = foodEaten(holding);
  const here = seasonOfDate(date);

  return (
    <section className="flex flex-col gap-3 text-xs">
      <h3 className="text-[10px] font-semibold tracking-[0.2em] text-brass uppercase">Kho & nhân công</h3>

      <table className="w-full">
        <tbody>
          {Object.entries(holding.stores)
            .filter(([, amount]) => amount > 0.5)
            .sort((a, b) => b[1] - a[1])
            .map(([id, amount]) => {
              const resource = resourceOf(id);
              const flow = id === 'luong-thuc' ? production.food - eaten - production.foodSold : production.resources[id] ?? 0;
              return (
                <tr key={id} className="border-b border-oak-light/50 last:border-b-0">
                  <td className="py-0.5 text-vellum/80">{resource?.name ?? id}</td>
                  <td className="py-0.5 text-right">{n(amount)}</td>
                  <td className="py-0.5 pl-2 text-right text-[10px] text-vellum/60">{resource?.unit ?? ''}</td>
                  <td className={`py-0.5 pl-2 text-right ${flow >= 0 ? 'text-parchment/70' : 'text-blood'}`}>
                    {flow >= 0 ? '+' : ''}
                    {n(flow)}/tuần
                  </td>
                </tr>
              );
            })}
        </tbody>
      </table>

      <div className="rounded border border-oak-light bg-oak/50 p-2">
        <p className="mb-1 text-[10px] tracking-widest text-brass uppercase">
          Nhân lực · {pool.season.name}
        </p>
        <p>
          {n(pool.workforce)} người làm được việc nặng · mùa vụ đòi {n(pool.farmNeed)} ·{' '}
          {pool.levied > 0 && <>đang cầm giáo {n(pool.levied)} · </>}
          <strong className={pool.free < 0 ? 'text-blood' : 'text-brass'}>còn rảnh {n(pool.free)}</strong>
        </p>
        <p className="mt-1 text-[10px] text-vellum/60">{pool.season.note}</p>
      </div>

      {/* DỰ BÁO THEO MÙA — mục 11. Không có nó thì người chơi khởi công một công
          trình đá vào tháng Mười và mất cả mùa đông mới biết vì sao nó đứng im. */}
      <div className="rounded border border-oak-light bg-oak/50 p-2">
        <p className="mb-1 text-[10px] tracking-widest text-brass uppercase">Dự báo bốn mùa</p>
        <table className="w-full">
          <tbody>
            {labourSeasons().map((season) => {
              const free = pool.workforce * (1 - season.farmDemand) - pool.levied;
              const current = season.id === here;
              return (
                <tr key={season.id} className={current ? 'text-brass' : 'text-vellum/70'}>
                  <td className="py-0.5">{season.name}</td>
                  <td className="py-0.5 text-right">{n(free)} rảnh</td>
                  <td className="py-0.5 pl-2 text-right">×{season.buildFactor.toFixed(2)}</td>
                  <td className="py-0.5 pl-2 text-right text-[10px]">
                    {season.stoneWork ? 'xây đá được' : 'KHÔNG xây đá'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="rounded border border-oak-light bg-oak/50 p-2">
        <p className="mb-1 text-[10px] tracking-widest text-brass uppercase">Sức chứa</p>
        <p>
          chỗ ở {n(capacity.housing)} · lương {n(capacity.food)} · việc làm {n(capacity.jobs)}
        </p>
        <p className="mt-1 text-brass">
          Nút thắt: {bottleneckName(capacity.bottleneck)} — {n(capacity.total)} người
        </p>
        {pool.free < 0 && (
          <p className="mt-1 text-blood">
            Đang lấn vào phần của mùa vụ — sản lượng còn {Math.round(harvestFactor(pool, -pool.free) * 100)}%.
          </p>
        )}
      </div>
    </section>
  );
}

function bottleneckName(id: 'cho-o' | 'luong-thuc' | 'viec-lam'): string {
  if (id === 'cho-o') return 'chỗ ở';
  if (id === 'luong-thuc') return 'lương thực';
  return 'việc làm';
}

// ---------------------------------------------------------------------------
// Hàng đợi xây dựng
// ---------------------------------------------------------------------------

export interface BuildQueueProps {
  holding: Holding;
  date: GameDate;
  onCancel: (projectId: string) => void;
}

export function BuildQueue({ holding, date, onCancel }: BuildQueueProps): ReactNode {
  const season = labourSeasonOf(seasonOfDate(date));

  return (
    <section className="flex flex-col gap-2 text-xs">
      <h3 className="text-[10px] font-semibold tracking-[0.2em] text-brass uppercase">Hàng đợi xây dựng</h3>
      {holding.projects.length === 0 && <p className="text-vellum/60">Không có công trường nào.</p>}

      {holding.projects.map((project) => {
        const building = buildingOf(project.buildingId);
        if (building === null) return null;
        const done = 1 - project.manWeeksLeft / Math.max(1, building.manWeeks);
        const frozen = building.material === 'da' && !season.stoneWork;

        return (
          <div key={project.id} className="rounded border border-oak-light bg-oak/50 p-2">
            <div className="flex items-baseline justify-between">
              <span className="text-parchment">{building.name}</span>
              <button
                type="button"
                onClick={() => onCancel(project.id)}
                className="text-[10px] text-blood hover:underline"
              >
                bỏ dở
              </button>
            </div>

            <div className="my-1 h-1.5 w-full rounded-sm bg-ink">
              <div
                className="h-1.5 rounded-sm bg-brass"
                style={{ width: `${String(Math.max(0, Math.min(100, done * 100)))}%` }}
              />
            </div>

            <p className="text-[10px] text-vellum/70">
              còn {n(project.weeksLeft)} tuần tối thiểu · {n(project.manWeeksLeft)} công · thợ đang phân{' '}
              {n(project.crew)}/{building.minCrew}
              {project.architectSkill > 0 && <> · kiến trúc sư {n(project.architectSkill)}</>}
            </p>

            {Object.keys(project.missing).length > 0 && (
              <p className="text-[10px] text-blood">
                thiếu:{' '}
                {Object.entries(project.missing)
                  .map(([id, amount]) => `${n(amount)} ${resourceOf(id)?.name ?? id}`)
                  .join(', ')}
              </p>
            )}
            {project.stalled !== '' && <p className="text-[10px] text-blood">{project.stalled}</p>}
            {frozen && project.stalled === '' && (
              <p className="text-[10px] text-blood">mùa đông — vữa không đông, công trường đứng</p>
            )}
          </div>
        );
      })}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Dân cư
// ---------------------------------------------------------------------------

export function PopulationPanel({ holding }: { holding: Holding }): ReactNode {
  const unrest = unrestFor(holding.population.morale);
  const total = holding.population.total;

  return (
    <section className="flex flex-col gap-3 text-xs">
      <h3 className="text-[10px] font-semibold tracking-[0.2em] text-brass uppercase">Dân cư</h3>

      <p>
        <strong className="text-parchment">{n(total)} người</strong> · lòng dân{' '}
        <strong className={holding.population.morale < 45 ? 'text-blood' : 'text-brass'}>
          {n(holding.population.morale)}
        </strong>{' '}
        ({unrest.name})
      </p>

      <div>
        <p className="mb-1 text-[10px] tracking-widest text-brass uppercase">Theo nhóm</p>
        <table className="w-full">
          <tbody>
            {holding.population.strata
              .filter((group) => group.people >= 0.5)
              .map((group) => (
                <tr key={group.id} className="border-b border-oak-light/40 last:border-b-0">
                  <td className="py-0.5 text-vellum/80">{stratumOf(group.id)?.name ?? group.id}</td>
                  <td className="py-0.5 text-right">{n(group.people)}</td>
                  <td className={`py-0.5 pl-2 text-right ${group.morale < 45 ? 'text-blood' : 'text-parchment/70'}`}>
                    {n(group.morale)}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <div>
        <p className="mb-1 text-[10px] tracking-widest text-brass uppercase">Theo chủng tộc</p>
        <table className="w-full">
          <tbody>
            {holding.population.races
              .filter((row) => row.people >= 0.5)
              .map((row) => (
                <tr key={row.raceId} className="border-b border-oak-light/40 last:border-b-0">
                  <td className="py-0.5 text-vellum/80">{raceName(row.raceId)}</td>
                  <td className="py-0.5 text-right">{n(row.people)}</td>
                </tr>
              ))}
          </tbody>
        </table>
        {holding.population.raceTension > 0 && (
          <p className="mt-1 text-[10px] text-blood">
            Căng thẳng giữa các tộc: {holding.population.raceTension.toFixed(1)} điểm
          </p>
        )}
      </div>

      {Object.keys(holding.population.skilled).length > 0 && (
        <div>
          <p className="mb-1 text-[10px] tracking-widest text-brass uppercase">Thợ lành nghề</p>
          <p className="text-vellum/80">
            {Object.entries(holding.population.skilled)
              .map(([id, count]) => `${id}: ${n(count)}`)
              .join(' · ')}
          </p>
          {holding.population.training.length > 0 && (
            <p className="text-[10px] text-vellum/60">
              đang đào tạo {holding.population.training.length} người
            </p>
          )}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// "Nếu bị vây"
// ---------------------------------------------------------------------------

/**
 * Bảng này nối THẲNG sang Phần 11 (mục 11, gạch đầu dòng thứ năm).
 *
 * Con số ở đây và con số của cuộc vây hãm thật phải là MỘT: `siegeReadiness()`
 * dựng đúng cái `Fortification` mà Phần 11 sẽ nhận, rồi tính trên chính nó. Hai
 * chỗ tính riêng là hai chỗ sẽ lệch, và người chơi sẽ đọc "cầm cự 14 tuần" rồi
 * mất thành ở tuần thứ sáu.
 */
export function SiegePanel({ holding }: { holding: Holding }): ReactNode {
  const readiness = siegeReadiness(holding);

  return (
    <section className="flex flex-col gap-2 text-xs">
      <h3 className="text-[10px] font-semibold tracking-[0.2em] text-brass uppercase">Nếu bị vây</h3>

      <p className="text-parchment">
        Cầm cự được{' '}
        <strong className={readiness.weeks < 8 ? 'text-blood' : 'text-brass'}>
          {readiness.weeks === Number.POSITIVE_INFINITY ? '—' : n(readiness.weeks)} tuần
        </strong>
      </p>
      <p className="text-[10px] text-vellum/70">
        lương đủ {n(readiness.foodWeeks)} tuần ·{' '}
        {readiness.waterWeeks === Number.POSITIVE_INFINITY
          ? 'có giếng riêng'
          : `không giếng — nước chỉ ${n(readiness.waterWeeks)} tuần`}{' '}
        · phòng thủ tổng hợp {n(readiness.defence)}
      </p>

      {readiness.weaknesses.length > 0 && (
        <ul className="flex flex-col gap-0.5">
          {readiness.weaknesses.map((line) => (
            <li key={line} className="text-blood">
              · {line}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
