/**
 * BẢNG HÃN QUỐC THẢO NGUYÊN — cống nạp & phân liệt (mục 2.4, mục 8).
 *
 * Hình dạng riêng: **MỘT SỔ THU.** Cột trái là các hãn quốc con (bên trong đang
 * tan), cột phải là sổ cống nạp (bên ngoài đang bòn được). Hai cột đọc ngược
 * chiều nhau, đúng thể loại: bòn rút bên ngoài trong khi bên trong đang tan.
 *
 * Dưới cùng là thứ không bảng nào khác có: THANH CẢNH BÁO DỊCH BỆNH nằm ngay cạnh
 * bảng thu nhập tuyến thương mại — vì đó là cùng một con đường.
 */

import type { ReactNode } from 'react';
import type { AccessTier, ClarityLevel, HordeBoard as Board } from '@/systems/nations';
import { Bar, Fog, Line } from '../parts';

export interface HordeBoardProps {
  board: Board;
  tier: AccessTier;
  clarity: ClarityLevel;
}

export function HordeBoard({ board, tier, clarity }: HordeBoardProps): ReactNode {
  const settled = (board.settlement + 100) / 2;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        {/* Bên trong đang tan. */}
        <div className="rounded border border-oak/60 p-2">
          <p className="mb-1 text-[10px] uppercase tracking-wide text-vellum/40">Hãn quốc con</p>
          {board.khanates.map((khanate) => (
            <div key={khanate.id} className="mb-1">
              <Line label={khanate.name}>
                <span className={`text-[11px] ${khanate.broken ? 'text-rust' : 'text-vellum/60'}`}>
                  {khanate.broken ? 'đã tách' : khanate.seat ? 'kinh đô' : ''}
                </span>
              </Line>
              {!khanate.broken && <Bar value={khanate.loyalty} tone={khanate.loyalty < 35 ? 'bg-rust' : 'bg-moss'} />}
            </div>
          ))}
        </div>

        {/* Bên ngoài đang bòn được. */}
        <div className="rounded border border-oak/60 p-2">
          <p className="mb-1 text-[10px] uppercase tracking-wide text-vellum/40">Sổ cống nạp</p>
          {board.tributaries.map((row) => (
            <div key={row.id} className={`mb-0.5 rounded px-1 ${row.patent ? 'bg-gold/10' : ''}`}>
              <Line label={`${row.patent ? '⌘ ' : ''}${row.name}`}>
                <span className={`text-[11px] ${row.defiant ? 'text-rust' : 'text-vellum/60'}`}>
                  {row.defiant ? 'ngừng nộp' : `${String(Math.round(row.tribute))}/năm`}
                </span>
              </Line>
              {row.patent && row.favouredYears >= 5 && (
                <p className="text-[10px] text-rust">được ưu ái {String(row.favouredYears)} năm — đang mạnh lên</p>
              )}
            </div>
          ))}
          <p className="mt-1 text-[10px] italic text-vellum/40">⌘ là kẻ đang giữ sắc. Rút lại được bất cứ lúc nào.</p>
        </div>
      </div>

      {/* Tuyến thương mại VÀ đường đi của đại dịch — cùng một bảng, cố ý. */}
      <div className="rounded border border-oak/60 p-2">
        <p className="mb-1 text-[10px] uppercase tracking-wide text-vellum/40">Tuyến thương mại</p>
        {board.routes.map((route) => (
          <Line key={route.id} label={route.name}>
            <span className="text-[11px] text-vellum/60">
              <Fog value={route.income} clarity={clarity} scale="money" /> · rủi ro dịch {String(route.plagueRisk)}
              {route.protected ? '' : ' · không bảo hộ'}
            </span>
          </Line>
        ))}
        <div className="mt-2">
          <div className="flex items-baseline justify-between text-[10px] uppercase tracking-wide text-vellum/40">
            <span>mầm dịch tích tụ</span>
            {board.plagueOutbreakYear > 0 && <span className="text-rust">bùng gần nhất: {String(board.plagueOutbreakYear)}</span>}
          </div>
          <Bar value={board.plagueLevel} tone={board.plagueLevel > 45 ? 'bg-rust' : 'bg-oak-light'} />
          <p className="mt-1 text-[10px] italic text-vellum/40">
            Dịch đi theo chính những con đường mình bảo hộ.
          </p>
        </div>
      </div>

      {/* Định cư hay du mục — một thanh, hai lối sống. */}
      <div className="rounded border border-oak/60 p-2">
        <div className="flex items-baseline justify-between text-[10px] uppercase tracking-wide text-vellum/40">
          <span>du mục · quân đội đáng sợ</span>
          <span>định cư · thuế ổn định</span>
        </div>
        <div className="relative mt-1 h-2 rounded bg-ink">
          <div className="absolute top-0 h-2 w-1 rounded bg-gold" style={{ left: `${String(settled)}%` }} />
        </div>
      </div>

      {tier === 'choi-that' && (
        <p className="text-[11px] text-vellum/50">Cấp sắc cho ai, rút của ai, và có bảo hộ tuyến nào không — ba quyết định của một năm.</p>
      )}
    </div>
  );
}
