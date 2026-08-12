/**
 * NHẬT KÝ HIỆP (Phần 9 mục 11, gạch đầu dòng 4).
 *
 * "Nhật ký hiệp cuộn bên phải, ghi từng đòn bằng lời ngắn."
 *
 * BẰNG LỜI NGẮN, không phải bằng văn xuôi. Văn xuôi là việc của bản diễn biến
 * sau trận (mục 10), và trộn hai thứ vào một chỗ thì người chơi không phân biệt
 * được đâu là điều engine đã quyết và đâu là điều AI vừa tô thêm — mà R1 sống
 * hay chết ở đúng ranh giới đó.
 *
 * Dòng có cú tung kèm theo được mở ra thành bảng điều chỉnh của Phần 5: đó là
 * chỗ người chơi đọc "vì sao tôi thua hiệp này".
 */

import { useState, type ReactNode } from 'react';
import { TIER_LABELS } from '@/systems/check';
import type { DuelCheck, RoundLogLine, SideId } from '@/minigames/duel';

export interface RoundLogProps {
  lines: readonly RoundLogLine[];
  checks: readonly DuelCheck[];
  playerSide: SideId;
  /** Chỉ hiện tới hết hiệp này. `null` là hiện hết — dùng cho chế độ xem lại. */
  upToRound?: number | null;
}

function CheckDetail({ entry }: { entry: DuelCheck }): ReactNode {
  const [open, setOpen] = useState(false);
  const { result } = entry;

  return (
    <div className="mt-1 rounded border border-oak-light/50 bg-ink/40 px-2 py-1">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-baseline justify-between text-left text-[0.65rem] text-parchment/70 hover:text-brass"
      >
        <span>
          {result.id} · d20 {result.raw.join('+')} / DC {result.dc ?? '?'}
        </span>
        <span className="text-brass">{TIER_LABELS[result.tier]}</span>
      </button>
      {open && (
        <ul className="mt-1 flex flex-col gap-0.5 border-t border-oak-light/40 pt-1">
          {result.modifiers.length === 0 && <li className="text-[0.65rem] text-parchment/40">không có điều chỉnh nào</li>}
          {result.modifiers.map((line, index) => (
            <li key={`${line.source}-${index}`} className="flex justify-between gap-2 text-[0.65rem]">
              <span className="text-parchment/65">{line.label}</span>
              <span className={line.value <= 0 ? 'tabular-nums text-[#7a9a5b]' : 'tabular-nums text-[#b8332b]'}>
                {line.value > 0 ? '+' : ''}
                {line.value}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function RoundLog({ lines, checks, playerSide, upToRound = null }: RoundLogProps): ReactNode {
  const rounds = [...new Set(lines.map((line) => line.round))]
    .filter((round) => upToRound === null || round <= upToRound)
    .sort((left, right) => right - left);

  // Cú tung xếp theo hiệp: hai cú mỗi hiệp có va chạm, không có cú nào ở hiệp
  // hai bên chỉ đi vòng quanh nhau.
  const perRound = new Map<number, DuelCheck[]>();
  let cursor = 0;
  for (const round of [...new Set(lines.map((line) => line.round))].sort((left, right) => left - right)) {
    const slice = checks.slice(cursor, cursor + 2);
    if (slice.length > 0 && slice.some((entry) => entry.result.id.startsWith('duel.'))) {
      perRound.set(round, slice);
      cursor += slice.length;
    }
  }

  return (
    <div className="flex h-full flex-col gap-2 overflow-y-auto pr-1">
      {rounds.length === 0 && <p className="text-xs text-parchment/45">Chưa có hiệp nào.</p>}
      {rounds.map((round) => (
        <section key={round} className="rounded border border-oak-light bg-oak px-2 py-1.5">
          <h4 className="text-[0.65rem] font-semibold tracking-[0.18em] text-brass uppercase">Hiệp {round}</h4>
          <ul className="mt-1 flex flex-col gap-0.5">
            {lines
              .filter((line) => line.round === round)
              .map((line, index) => (
                <li
                  key={`${round}-${index}`}
                  className={[
                    'text-xs leading-snug',
                    line.side === '' ? 'text-parchment/80 italic' : '',
                    line.side === playerSide ? 'text-parchment' : '',
                    line.side !== '' && line.side !== playerSide ? 'text-parchment/65' : '',
                  ].join(' ')}
                >
                  {line.text}
                </li>
              ))}
          </ul>
          {(perRound.get(round) ?? []).map((entry, index) => (
            <CheckDetail key={`${round}-check-${index}`} entry={entry} />
          ))}
        </section>
      ))}
    </div>
  );
}
