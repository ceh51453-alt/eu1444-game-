/**
 * BẢNG HÀNH ĐỘNG — "KHÁC NHAU HOÀN TOÀN TÙY NGƯỜI CHƠI ĐANG Ở BÊN NÀO" (Phần 11 mục 9).
 *
 * Component này KHÔNG nhận một cờ `side` rồi tự chọn bảng. Nó nhận thẳng danh
 * sách hành động mà người gọi đã lấy từ đúng một trong hai thư mục minigame —
 * `minigames/siege-attack/actions.ts` hoặc `minigames/siege-defense/actions.ts`.
 *
 * Đó là cách giữ lời hứa của mục 10.4 tới tận lớp UI: nếu ở đây có một câu
 * `side === 'vay' ? … : …` thì hai bảng lại gặp nhau ở màn hình, và cái ngày một
 * người thêm "sửa tường" vào bảng bên vây cho tiện thì không có gì chặn lại.
 *
 * Hành động không bấm được vẫn HIỆN, chỉ mờ đi và giữ nguyên dòng giải thích —
 * người chơi phải đọc được rằng "đổ nước sôi" tồn tại và vì sao tuần này chưa
 * dùng được, chứ không phải thấy nó biến mất khỏi danh sách.
 */

import type { ReactNode } from 'react';
import type { SiegeAction, SiegeState } from '@/systems/siege';

export interface ActionTableProps {
  siege: SiegeState;
  actions: readonly SiegeAction[];
  /** Id hành động đang chọn cho tuần này. */
  chosen: string;
  onChoose: (id: string) => void;
  title: string;
  note: string;
  disabled?: boolean;
}

export function ActionTable({ siege, actions, chosen, onChoose, title, note, disabled = false }: ActionTableProps): ReactNode {
  return (
    <section className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-[0.65rem] font-semibold tracking-[0.18em] text-brass uppercase">{title}</h3>
        <span className="text-[0.55rem] text-parchment/35">một tuần, một việc</span>
      </div>
      <p className="text-[0.58rem] text-parchment/40">{note}</p>

      <ul className="flex flex-col gap-0.5">
        {actions.map((action) => {
          const available = !disabled && action.available(siege);
          const picked = chosen === action.id;
          return (
            <li key={action.id}>
              <button
                type="button"
                disabled={!available}
                onClick={() => onChoose(action.id)}
                title={action.note}
                className={`w-full rounded border px-2 py-1 text-left transition-colors ${
                  picked
                    ? 'border-brass bg-brass/10 text-parchment'
                    : available
                      ? 'border-oak-light bg-oak text-parchment/85 hover:bg-oak-light'
                      : 'cursor-not-allowed border-oak-light/40 bg-oak/30 text-parchment/30'
                }`}
              >
                <span className="block truncate text-[0.7rem] font-medium">{action.name}</span>
                <span className="block truncate text-[0.58rem] text-parchment/45" title={action.note}>
                  {action.note}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Mốc sự kiện trên trục thời gian (mục 9). */
export function Timeline({ siege }: { siege: SiegeState }): ReactNode {
  const marks = siege.weeks.filter((week) => week.milestones.length > 0 || week.events.length > 0);

  if (marks.length === 0) {
    return <p className="text-[0.6rem] text-parchment/35">Chưa có tuần nào đáng ghi lại.</p>;
  }

  return (
    <ol className="flex flex-col gap-1">
      {marks.slice(-14).map((week) => (
        <li key={week.week} className="flex gap-2 text-[0.62rem] leading-snug">
          <span className="shrink-0 font-mono text-parchment/35">T{week.week}</span>
          <span className="min-w-0 flex-1">
            {week.milestones.map((line, index) => (
              <span key={`m${String(index)}`} className="block text-[#d9a441]">
                ⚑ {line}
              </span>
            ))}
            {week.events.map((line, index) => (
              <span key={`e${String(index)}`} className="block text-parchment/65">
                ◈ {line}
              </span>
            ))}
          </span>
        </li>
      ))}
    </ol>
  );
}
