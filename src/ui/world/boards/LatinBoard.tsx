/**
 * BẢNG THÀNH BANG LATIN — ngân hàng & lính đánh thuê (mục 2.8, mục 8).
 *
 * Hình dạng riêng: **MỘT TRANG SỔ CÁI.** Bảng có tiêu đề cột, có số căn phải, có
 * dòng kẻ — nó phải trông như một trang sổ chứ không như một bảng trạng thái quốc
 * gia, vì thế lực này nhìn thế giới qua đúng bốn cột: cho ai vay, lãi bao nhiêu,
 * còn mấy năm, và xác suất mất trắng.
 *
 * Dưới sổ cái là hai thứ đếm ngược: hợp đồng condottieri và NHIỆM KỲ. Mất ghế là
 * mất tất cả, nên con số đếm ngược ấy đứng cùng chỗ với các khoản nợ — cùng một
 * loại rủi ro, chỉ khác đơn vị.
 */

import type { ReactNode } from 'react';
import { powerName, type AccessTier, type ClarityLevel, type LatinBoard as Board } from '@/systems/nations';
import { Bar, Fog, Line } from '../parts';

export interface LatinBoardProps {
  board: Board;
  tier: AccessTier;
  clarity: ClarityLevel;
}

export function LatinBoard({ board, tier, clarity }: LatinBoardProps): ReactNode {
  const live = board.loans.filter((loan) => !loan.defaulted);
  const outstanding = live.reduce((sum, loan) => sum + loan.principal, 0);

  return (
    <div className="space-y-3">
      {/* Sổ cái. */}
      <div className="rounded border border-oak/60 p-2">
        <p className="mb-1 text-[10px] uppercase tracking-wide text-vellum/40">
          Sổ cái · dư nợ <Fog value={outstanding} clarity={clarity} scale="money" /> · tín nhiệm {String(Math.round(board.creditRating))}
        </p>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[10px] uppercase text-vellum/35">
              <th className="text-left font-normal">con nợ</th>
              <th className="text-right font-normal">gốc</th>
              <th className="text-right font-normal">lãi</th>
              <th className="text-right font-normal">còn</th>
              <th className="text-right font-normal">vỡ nợ/năm</th>
            </tr>
          </thead>
          <tbody>
            {board.loans.map((loan) => (
              <tr key={loan.id} className="border-b border-oak/30 last:border-0">
                <td className={`py-0.5 ${loan.defaulted ? 'text-rust line-through' : 'text-parchment'}`}>{powerName(loan.debtor)}</td>
                <td className="py-0.5 text-right font-mono">{String(Math.round(loan.principal))}</td>
                <td className="py-0.5 text-right font-mono">{(loan.rate * 100).toFixed(0)}%</td>
                <td className="py-0.5 text-right font-mono">{loan.defaulted ? '—' : `${String(loan.yearsLeft)}n`}</td>
                <td className={`py-0.5 text-right font-mono ${loan.defaultRisk > 25 ? 'text-rust' : 'text-vellum/60'}`}>
                  {loan.defaulted ? 'QUỴT' : `${String(Math.round(loan.defaultRisk))}%`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-1 text-[10px] italic text-vellum/40">Vua quỵt được, và không ai đòi nổi một ông vua.</p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {/* Condottieri: quân của người khác, và họ biết thế. */}
        <div className="rounded border border-oak/60 p-2">
          <p className="mb-1 text-[10px] uppercase tracking-wide text-vellum/40">Condottieri</p>
          {board.condottieri.map((band) => (
            <div key={band.id} className={`mb-1 rounded px-1 ${band.extorting ? 'bg-rust/15' : ''}`}>
              <Line label={band.name}>
                <span className="text-[11px] text-vellum/60">
                  {String(band.men)} người · {String(band.payPerYear)}/năm · còn {String(band.yearsLeft)}n
                </span>
              </Line>
              <Bar value={band.mood} tone={band.mood < 40 ? 'bg-rust' : 'bg-moss'} />
              {band.extorting && <p className="text-[10px] text-rust">ĐANG TỐNG TIỀN chính thành bang.</p>}
              {band.unpaidYears > 0 && !band.extorting && (
                <p className="text-[10px] text-rust">chưa trả {String(band.unpaidYears)} năm</p>
              )}
            </div>
          ))}
        </div>

        {/* Nhiệm kỳ và hội đồng. */}
        <div className="rounded border border-oak/60 p-2">
          <p className="mb-1 text-[10px] uppercase tracking-wide text-vellum/40">Ghế và nhiệm kỳ</p>
          <Line label="còn lại">
            <span className="font-mono text-xs text-parchment">
              {String(board.yearsLeftInTerm)}/{String(board.termYears)} năm
            </span>
          </Line>
          <Line label="ủng hộ trong hội đồng">
            <Fog value={board.councilSupport} clarity={clarity} />
          </Line>
          <Bar value={board.councilSupport} tone={board.councilSupport < 50 ? 'bg-rust' : 'bg-moss'} />
          <div className="mt-1 space-y-0.5">
            {board.councilFactions.map((faction) => (
              <Line key={faction.id} label={faction.name}>
                <span className="text-[11px] text-vellum/50">{String(faction.seats)} ghế</span>
              </Line>
            ))}
          </div>
          {!board.seat && <p className="mt-1 text-[11px] text-rust">MẤT GHẾ — và mất ghế là mất tất cả.</p>}
        </div>
      </div>

      {/* Tuyến thương mại và giá lương thực toàn châu lục. */}
      <div className="rounded border border-oak/60 p-2">
        <p className="mb-1 text-[10px] uppercase tracking-wide text-vellum/40">
          Tuyến thương mại · giá lương thực {String(Math.round(board.grainPrice))}
        </p>
        {board.routes.map((route) => (
          <Line key={route.id} label={`${route.name}${route.monopoly ? ' (độc quyền)' : ''}`}>
            <Fog value={route.income} clarity={clarity} scale="money" />
          </Line>
        ))}
        {board.grainPrice > 150 && (
          <p className="mt-1 text-[11px] text-rust">Giá cao: thành bang lời to, và cả châu lục đói — đói kém nuôi dị giáo.</p>
        )}
      </div>

      {tier === 'choi-that' && (
        <p className="text-[11px] text-vellum/50">
          Cho vay bao nhiêu, lãi bao nhiêu, trả condottieri hay không, và chi bao nhiêu để mua phiếu giữ ghế.
        </p>
      )}
    </div>
  );
}
