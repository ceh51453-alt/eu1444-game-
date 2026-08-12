/**
 * HAI CỘT HAI BÊN (Phần 9 mục 11, gạch đầu dòng 3).
 *
 * "Hai bên: thanh thể lực, thế trận, hình cơ thể thu nhỏ của Phần 7."
 *
 * Hình cơ thể dùng LẠI `BodyMap` của Phần 7 chứ không vẽ một cái hình riêng cho
 * đấu trường. Nếu Phần 9 vẽ lấy thì cùng một vết thương sẽ có hai màu ở hai màn
 * hình, và người chơi phải học hai bảng màu cho cùng một chuyện.
 *
 * KHÔNG CÓ THANH MÁU (mục 8). Thanh máu duy nhất ở đây là lượng máu CÒN LẠI của
 * Phần 7 — một trong năm cửa tử, không phải một bể hp.
 */

import type { ReactNode } from 'react';
import { BodyMap } from '@/ui/bodymap';
import { regionStatusesOf } from '@/systems/body';
import { tempoConfig, type Fighter } from '@/minigames/duel';

export interface FighterPanelProps {
  fighter: Fighter;
  /** Bên này là nhân vật người chơi. */
  isPlayer: boolean;
  compact?: boolean;
}

function Bar({ label, value, max, color }: { label: string; value: number; max: number; color: string }): ReactNode {
  const ratio = max <= 0 ? 0 : Math.max(0, Math.min(1, value / max));
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-baseline justify-between text-[0.65rem]">
        <span className="text-parchment/60">{label}</span>
        <span className="tabular-nums text-parchment/80">{Math.round(value)}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded bg-ink">
        <div className="h-full transition-all" style={{ width: `${ratio * 100}%`, background: color }} />
      </div>
    </div>
  );
}

/** Thế trận −5..+5 vẽ thành một thước hai chiều, vì nó có dấu. */
function TempoGauge({ tempo }: { tempo: number }): ReactNode {
  const config = tempoConfig();
  const span = config.max - config.min;
  const offset = ((tempo - config.min) / span) * 100;

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-baseline justify-between text-[0.65rem]">
        <span className="text-parchment/60">Thế trận</span>
        <span className="tabular-nums text-parchment/80">
          {tempo > 0 ? '+' : ''}
          {tempo}
        </span>
      </div>
      <div className="relative h-1.5 w-full rounded bg-ink">
        <div className="absolute inset-y-0 left-1/2 w-px bg-parchment/25" />
        <div
          className="absolute -top-0.5 h-2.5 w-1 rounded-sm transition-all"
          style={{ left: `calc(${offset}% - 2px)`, background: tempo >= 0 ? '#d9a441' : '#b8332b' }}
        />
      </div>
    </div>
  );
}

export function FighterPanel({ fighter, isPlayer, compact = false }: FighterPanelProps): ReactNode {
  const statuses = regionStatusesOf(fighter.body);
  const flags = [
    fighter.disarmed ? 'mất vũ khí' : '',
    fighter.prone ? 'đang nằm' : '',
    fighter.yielded ? 'đã chịu thua' : '',
    fighter.blindUntil > 0 ? 'cát vào mắt' : '',
    fighter.leftArena ? 'ra khỏi vòng' : '',
  ].filter((flag) => flag !== '');

  return (
    <section className="flex w-52 shrink-0 flex-col gap-2 rounded border border-oak-light bg-oak px-3 py-3">
      <header className="flex flex-col gap-0.5">
        <h3 className={`text-sm font-semibold ${isPlayer ? 'text-brass' : 'text-parchment'}`}>{fighter.name}</h3>
        <p className="text-[0.65rem] leading-tight text-parchment/55">
          {fighter.loadout.weaponName}, {fighter.loadout.armorName}
        </p>
        {fighter.description !== '' && (
          <p className="text-[0.62rem] leading-tight text-parchment/45">{fighter.description}</p>
        )}
      </header>

      <Bar label="Thể lực" value={fighter.stamina} max={fighter.staminaMax} color="#7a9a5b" />
      <Bar label="Máu còn lại" value={fighter.body.blood} max={100} color="#b8332b" />
      <TempoGauge tempo={fighter.tempo} />

      {flags.length > 0 && <p className="text-[0.65rem] text-[#d9a441]">{flags.join(' · ')}</p>}

      {!compact && (
        <div className="mt-1 flex justify-center">
          <BodyMap statuses={statuses} view="truoc" height={190} />
        </div>
      )}
    </section>
  );
}
