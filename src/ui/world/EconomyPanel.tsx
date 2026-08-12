import type { ReactNode } from 'react';
import { economyGoods } from '@/systems/economy/data';
import { economySummary } from '@/systems/economy/model';
import type { EconomySliceState } from '@/systems/economy/slice';
import { powerName } from '@/systems/nations';

export interface EconomyPanelProps {
  economy: EconomySliceState;
  selectedPowerId: string;
}

const NUMBER = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 });
const COMPACT = new Intl.NumberFormat('vi-VN', { notation: 'compact', maximumFractionDigits: 1 });

/** Bảng chung cho phép đọc từ kinh tế toàn cầu xuống sổ cái và từng mặt hàng. */
export function EconomyPanel({ economy, selectedPowerId }: EconomyPanelProps): ReactNode {
  const summary = economySummary(economy);
  const market = economy.markets.find((entry) => entry.powerId === selectedPowerId) ?? economy.markets[0] ?? null;
  const goods = economyGoods();

  if (market === null) {
    return <p className="text-xs text-vellum/50">Nền kinh tế sẽ được khởi tạo khi thế giới bước sang tháng đầu tiên.</p>;
  }

  const selectedRoutes = economy.routes
    .filter((route) => route.fromPowerId === market.powerId || route.toPowerId === market.powerId)
    .sort((left, right) => right.value - left.value);
  const selectedEvents = economy.events.filter((event) => event.powerId === market.powerId).slice(0, 8);
  const debtRatio = market.gdp <= 0 ? 0 : (market.debt / market.gdp) * 100;

  return (
    <section className="space-y-3">
      <header className="border-b border-oak pb-2">
        <p className="text-[10px] uppercase tracking-[0.2em] text-vellum/40">Kinh tế thế giới</p>
        <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
          <Metric label="Dân số" value={compact(summary.totalPopulation)} />
          <Metric label="Tổng sản lượng" value={money(summary.totalGdp)} />
          <Metric label="Thương mại tháng" value={money(summary.tradeVolume)} />
          <Metric label="Lạm phát bình quân" value={percent(summary.averageInflation)} tone={trend(summary.averageInflation, true)} />
          <Metric label="Thất nghiệp" value={percent(summary.averageUnemployment)} tone={trend(summary.averageUnemployment - 8, true)} />
          <Metric label="Thị trường thiếu hàng" value={NUMBER.format(summary.stressedMarkets)} tone={summary.stressedMarkets > 0 ? 'text-rust' : 'text-moss'} />
        </div>
        <p className="mt-1 text-[10px] text-vellum/45">
          Lớn nhất: {powerName(summary.richestPowerId)} · tăng nhanh nhất: {powerName(summary.fastestGrowthPowerId)}
        </p>
      </header>

      <div className="overflow-x-auto rounded border border-oak/60">
        <table className="w-full min-w-[760px] text-left text-[11px]">
          <thead className="bg-oak/35 text-[9px] uppercase tracking-wide text-vellum/45">
            <tr>
              <th className="px-2 py-1.5">Quốc gia</th>
              <th className="px-2 py-1.5 text-right">Dân số</th>
              <th className="px-2 py-1.5 text-right">Sản lượng</th>
              <th className="px-2 py-1.5 text-right">Tăng trưởng</th>
              <th className="px-2 py-1.5 text-right">Lạm phát</th>
              <th className="px-2 py-1.5 text-right">Thất nghiệp</th>
              <th className="px-2 py-1.5 text-right">Nợ</th>
              <th className="px-2 py-1.5 text-right">Mậu dịch</th>
            </tr>
          </thead>
          <tbody>
            {[...economy.markets]
              .sort((left, right) => right.gdp - left.gdp)
              .map((entry) => (
                <tr key={entry.powerId} className={entry.powerId === market.powerId ? 'bg-gold/5 text-parchment' : 'border-t border-oak/30 text-vellum/65'}>
                  <td className="px-2 py-1.5">{powerName(entry.powerId)}</td>
                  <td className="px-2 py-1.5 text-right font-mono">{compact(entry.population)}</td>
                  <td className="px-2 py-1.5 text-right font-mono">{money(entry.gdp)}</td>
                  <td className={`px-2 py-1.5 text-right font-mono ${trend(entry.growth)}`}>{percent(entry.growth)}</td>
                  <td className={`px-2 py-1.5 text-right font-mono ${trend(entry.inflation, true)}`}>{percent(entry.inflation)}</td>
                  <td className="px-2 py-1.5 text-right font-mono">{percent(entry.unemployment)}</td>
                  <td className="px-2 py-1.5 text-right font-mono">{money(entry.debt)}</td>
                  <td className={`px-2 py-1.5 text-right font-mono ${trend(entry.ledger.tradeBalance)}`}>{signedMoney(entry.ledger.tradeBalance)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <div>
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-sm text-parchment">{powerName(market.powerId)}</h3>
          <span className="text-[10px] text-vellum/40">thuế {percent(market.taxRate * 100)} · thuế quan {percent(market.tariffRate * 100)}</span>
        </div>
        <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
          <Metric label="Dân số" value={compact(market.population)} />
          <Metric label="Lực lượng lao động" value={compact(market.workforce)} />
          <Metric label="Sản lượng" value={money(market.gdp)} />
          <Metric label="Tăng trưởng năm" value={percent(market.growth)} tone={trend(market.growth)} />
          <Metric label="Chỉ số lương" value={NUMBER.format(market.wages)} />
          <Metric label="Chi phí sinh hoạt" value={NUMBER.format(market.costOfLiving)} tone={trend(market.costOfLiving - market.wages, true)} />
          <Metric label="Thịnh vượng" value={NUMBER.format(market.prosperity)} tone={trend(market.prosperity - 50)} />
          <Metric label="Nghèo đói" value={percent(market.poverty)} tone={trend(market.poverty - 35, true)} />
          <Metric label="Năng suất" value={NUMBER.format(market.productivity)} />
          <Metric label="Hạ tầng" value={NUMBER.format(market.infrastructure)} />
          <Metric label="Năng lực thương mại" value={NUMBER.format(market.tradeCapacity)} />
          <Metric label="Xếp hạng tín dụng" value={NUMBER.format(market.creditRating)} tone={trend(market.creditRating - 50)} />
          <Metric label="Nợ công" value={money(market.debt)} tone={trend(debtRatio - 80, true)} />
          <Metric label="Nợ / sản lượng" value={percent(debtRatio)} tone={trend(debtRatio - 80, true)} />
          <Metric label="Lãi vay" value={percent(market.interestRate * 100)} tone={trend(market.interestRate * 100 - 8, true)} />
          <Metric label="Lạm phát" value={percent(market.inflation)} tone={trend(market.inflation, true)} />
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_17rem]">
        <div className="overflow-x-auto rounded border border-oak/60">
          <table className="w-full min-w-[760px] text-left text-[11px]">
            <thead className="bg-oak/35 text-[9px] uppercase tracking-wide text-vellum/45">
              <tr>
                <th className="px-2 py-1.5">Hàng hóa</th>
                <th className="px-2 py-1.5 text-right">Sản xuất</th>
                <th className="px-2 py-1.5 text-right">Tiêu dùng</th>
                <th className="px-2 py-1.5 text-right">Kho</th>
                <th className="px-2 py-1.5 text-right">Giá</th>
                <th className="px-2 py-1.5 text-right">Biến động</th>
                <th className="px-2 py-1.5 text-right">Nhập</th>
                <th className="px-2 py-1.5 text-right">Xuất</th>
                <th className="px-2 py-1.5 text-right">Thiếu</th>
              </tr>
            </thead>
            <tbody>
              {market.goods.map((entry) => {
                const good = goods.find((row) => row.id === entry.goodId);
                const shortage = entry.unmetDemand > entry.consumption * 0.03;
                return (
                  <tr key={entry.goodId} className="border-t border-oak/30 text-vellum/65">
                    <td className="px-2 py-1.5 text-parchment">{good?.name ?? entry.goodId}</td>
                    <td className="px-2 py-1.5 text-right font-mono">{compact(entry.production)}</td>
                    <td className="px-2 py-1.5 text-right font-mono">{compact(entry.consumption)}</td>
                    <td className="px-2 py-1.5 text-right font-mono">{compact(entry.stockpile)}</td>
                    <td className="px-2 py-1.5 text-right font-mono">{NUMBER.format(entry.price)}</td>
                    <td className={`px-2 py-1.5 text-right font-mono ${trend(entry.priceChange, true)}`}>{percent(entry.priceChange)}</td>
                    <td className="px-2 py-1.5 text-right font-mono">{compact(entry.imports)}</td>
                    <td className="px-2 py-1.5 text-right font-mono">{compact(entry.exports)}</td>
                    <td className={`px-2 py-1.5 text-right font-mono ${shortage ? 'text-rust' : ''}`}>{compact(entry.unmetDemand)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <aside className="space-y-3">
          <div className="rounded border border-oak/60 p-2">
            <p className="mb-1 text-[10px] uppercase tracking-wide text-vellum/40">Ngân sách tháng</p>
            <LedgerLine label="Thuế" value={market.ledger.taxRevenue} />
            <LedgerLine label="Thuế quan" value={market.ledger.tariffRevenue} />
            <LedgerLine label="Lợi tức thương mại" value={market.ledger.tradeRevenue} />
            <LedgerLine label="Hành chính" value={-market.ledger.administration} />
            <LedgerLine label="Quân đội" value={-market.ledger.militaryExpense} />
            <LedgerLine label="Lãi nợ" value={-market.ledger.debtService} />
            <LedgerLine label="Cứu tế" value={-market.ledger.relief} />
            <div className="mt-1 border-t border-oak/50 pt-1">
              <LedgerLine label="Thặng dư / thâm hụt" value={market.ledger.net} strong />
            </div>
          </div>

          <div className="rounded border border-oak/60 p-2">
            <p className="mb-1 text-[10px] uppercase tracking-wide text-vellum/40">Tuyến hàng tháng này</p>
            {selectedRoutes.length === 0 && <p className="text-[10px] text-vellum/40">Không có tuyến đang hoạt động.</p>}
            {selectedRoutes.slice(0, 8).map((route) => {
              const outbound = route.fromPowerId === market.powerId;
              const other = outbound ? route.toPowerId : route.fromPowerId;
              return (
                <div key={route.id} className="border-t border-oak/30 py-1 first:border-0">
                  <div className="flex justify-between gap-2 text-[10px]">
                    <span className={outbound ? 'text-moss' : 'text-brass'}>{outbound ? 'Xuất' : 'Nhập'} {goods.find((good) => good.id === route.goodId)?.name ?? route.goodId}</span>
                    <span className="font-mono text-vellum/60">{money(route.value)}</span>
                  </div>
                  <p className="truncate text-[9px] text-vellum/35">{powerName(other)} · hao hụt {percent(route.loss)}</p>
                </div>
              );
            })}
          </div>
        </aside>
      </div>

      {selectedEvents.length > 0 && (
        <div className="rounded border border-oak/60 p-2">
          <p className="mb-1 text-[10px] uppercase tracking-wide text-vellum/40">Biến cố kinh tế</p>
          {selectedEvents.map((event) => (
            <div key={event.id} className="flex gap-2 border-t border-oak/30 py-1 text-[10px] first:border-0">
              <span className="shrink-0 font-mono text-vellum/35">{String(event.month)}/{String(event.year)}</span>
              <span className={event.severity >= 60 ? 'text-rust' : 'text-vellum/65'}>{event.text}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function Metric({ label, value, tone = 'text-parchment' }: { label: string; value: string; tone?: string }): ReactNode {
  return (
    <div className="rounded border border-oak/50 bg-oak/10 px-2 py-1">
      <p className="truncate text-[9px] uppercase tracking-wide text-vellum/40">{label}</p>
      <p className={`truncate font-mono text-xs ${tone}`}>{value}</p>
    </div>
  );
}

function LedgerLine({ label, value, strong = false }: { label: string; value: number; strong?: boolean }): ReactNode {
  return (
    <div className={`flex justify-between gap-2 py-0.5 text-[10px] ${strong ? 'text-parchment' : 'text-vellum/60'}`}>
      <span>{label}</span>
      <span className={`font-mono ${value < 0 ? 'text-rust' : value > 0 ? 'text-moss' : ''}`}>{signedMoney(value)}</span>
    </div>
  );
}

function compact(value: number): string {
  return COMPACT.format(value);
}

function money(value: number): string {
  return `${COMPACT.format(value)} ¤`;
}

function signedMoney(value: number): string {
  return `${value > 0 ? '+' : ''}${COMPACT.format(value)} ¤`;
}

function percent(value: number): string {
  return `${value > 0 ? '+' : ''}${NUMBER.format(value)}%`;
}

function trend(value: number, inverse = false): string {
  if (Math.abs(value) < 0.05) return 'text-vellum/60';
  const positive = value > 0;
  return positive !== inverse ? 'text-moss' : 'text-rust';
}
