/**
 * SƠ ĐỒ MẶT CẮT THÀNH TRÌ (Phần 11 mục 9).
 *
 * "Sơ đồ mặt cắt thành trì, hiện integrity TỪNG LỚP." Chữ *từng lớp* là chữ
 * quyết định: một thanh máu duy nhất sẽ nói dối người chơi về thứ đang xảy ra.
 * Bức tường ngoài có thể đã vỡ trong khi tường trong còn nguyên, và cả quyết định
 * "có nên lùi vào chưa" — quyết định đắt nhất của bên thủ ở mục 2 — chỉ đưa ra
 * được nếu người chơi NHÌN THẤY cả ba lớp cùng lúc.
 *
 * Vẽ theo CHIỀU NGANG, từ ngoài vào trong, vì đó là hướng một đạo quân đi vào và
 * cũng là hướng bên thủ lùi lại. Lớp đang giữ được đánh dấu; lớp đã mất thì mờ
 * đi nhưng KHÔNG biến mất — người chơi phải còn thấy cái họ đã bỏ lại.
 */

import type { ReactNode } from 'react';
import { crossSection, type Fortification } from '@/systems/siege';

function tone(row: { held: boolean; lost: boolean; integrity: number; max: number }): string {
  if (row.lost) return 'border-oak-light/40 bg-oak/30 text-parchment/35';
  if (row.held) return 'border-brass bg-oak text-parchment';
  return 'border-oak-light bg-oak/60 text-parchment/70';
}

function barColour(share: number): string {
  if (share <= 0) return 'bg-[#b8332b]';
  if (share < 0.35) return 'bg-[#b8332b]';
  if (share < 0.7) return 'bg-[#d9a441]';
  return 'bg-[#7d9a6a]';
}

export function CrossSection({ fort }: { fort: Fortification }): ReactNode {
  const rows = crossSection(fort);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-end gap-1 overflow-x-auto pb-1">
        {rows.map((row) => {
          const share = row.max <= 0 ? 0 : row.integrity / row.max;
          return (
            <div
              key={row.id}
              className={`flex min-w-[7.5rem] flex-1 flex-col gap-1 rounded border px-2 py-1.5 ${tone(row)}`}
              title={row.note}
            >
              <div className="flex items-baseline justify-between gap-1">
                <span className="truncate text-[0.68rem] font-semibold">{row.name}</span>
                {row.held && <span className="shrink-0 text-[0.55rem] tracking-widest text-brass uppercase">đang giữ</span>}
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink/60">
                <div className={`h-full ${barColour(share)}`} style={{ width: `${String(Math.max(0, Math.min(100, share * 100)))}%` }} />
              </div>
              <span className="font-mono text-[0.6rem] text-parchment/55">
                {row.integrity}/{row.max}
              </span>
              <span className="truncate text-[0.58rem] text-parchment/45" title={row.note}>
                {row.note}
              </span>
            </div>
          );
        })}
      </div>
      <p className="text-[0.58rem] text-parchment/35">
        Từ ngoài vào trong. Mất một lớp chưa phải mất thành — nhưng lùi vào thì diện tích nhỏ lại, mật độ phòng thủ
        tăng, và lương nằm lại phía ngoài.
      </p>
    </div>
  );
}
