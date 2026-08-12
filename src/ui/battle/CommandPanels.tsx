/**
 * BA BẢNG CỦA MỤC 14: thứ tự khởi động, khung lệnh nhận từ chủ soái, bảng tướng.
 *
 * Ba bảng này là chỗ mục 3 và mục 4 hiện ra thành thứ bấm được. Nếu thiếu chúng
 * thì cả hai mục ấy vẫn chạy đúng trong engine mà người chơi không bao giờ biết:
 * họ sẽ thấy một viên tướng không nhúc nhích và kết luận rằng game hỏng, chứ
 * không kết luận rằng người ấy lòng trung thấp và mình đã ra một mệnh lệnh khó.
 */

import type { ReactNode } from 'react';
import { TIER_LABELS } from '@/systems/check';
import {
  ORDER_EFFECT_LABELS,
  ORDER_IDS,
  ORDER_LABELS,
  TEMPERAMENT_LABELS,
  UNIT_STATE_LABELS,
  WING_LABELS,
  unitById,
  type BattleState,
  type InitiativeRoll,
  type OrderId,
  type WingId,
} from '@/minigames/battle';

// ---------------------------------------------------------------------------
// Thứ tự khởi động (mục 14, gạch thứ ba)
// ---------------------------------------------------------------------------

export function InitiativeTable({
  battle,
  rolls,
  onSelect,
}: {
  battle: BattleState;
  rolls: readonly InitiativeRoll[];
  onSelect?: (unitId: string) => void;
}): ReactNode {
  if (rolls.length === 0) {
    return <p className="text-xs text-parchment/45 italic">Chưa tung điểm khởi động — vòng đầu chưa bắt đầu.</p>;
  }

  return (
    <ol className="flex flex-col gap-0.5">
      {rolls.slice(0, 14).map((roll) => {
        const unit = unitById(battle, roll.unitId);
        if (unit === null) return null;
        const mine = unit.side === battle.playerSide;
        return (
          <li key={roll.unitId}>
            <button
              type="button"
              onClick={onSelect === undefined ? undefined : () => onSelect(roll.unitId)}
              title={roll.parts.map((part) => `${part.label}: ${part.value > 0 ? '+' : ''}${part.value}`).join('\n')}
              className={`flex w-full items-baseline justify-between gap-2 rounded px-1.5 py-0.5 text-left text-xs hover:bg-oak-light ${
                mine ? 'text-parchment' : 'text-parchment/60'
              }`}
            >
              <span className="truncate">
                {mine ? '▪' : '○'} {unit.name}
              </span>
              <span className="shrink-0 font-mono text-brass tabular-nums">{roll.total.toFixed(1)}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

// ---------------------------------------------------------------------------
// Khung lệnh nhận từ chủ soái (mục 14, gạch thứ tư)
// ---------------------------------------------------------------------------

/**
 * "Có nút tuân hoặc trái lệnh."
 *
 * Nút TRÁI LỆNH không tự nó làm gì trên bàn cờ — nó chỉ mở khoá. Việc trái lệnh
 * xảy ra khi người chơi THẬT SỰ đưa quân lên trước hạn, và engine ghi nhận ở
 * đúng lúc ấy (`violatesOrder` ở `command.ts`). Một cái nút tự ghi "đã trái lệnh"
 * mà quân vẫn đứng yên sẽ khiến người chơi lãnh trọn hệ quả nặng nhất của mục 3
 * mà chưa làm gì cả.
 */
export function FieldOrderBox({ battle }: { battle: BattleState }): ReactNode {
  const order = battle.command.received;
  if (order === null) {
    return (
      <p className="text-xs text-parchment/60">
        Ngài cầm toàn quân với tư cách <span className="text-brass">{battle.command.titleName}</span>. Không ai ra lệnh
        cho ngài — và mọi chỗ hỏng đều là của ngài.
      </p>
    );
  }

  const broken = battle.command.obeyed === false;
  return (
    <div
      className={`rounded border px-3 py-2 ${
        broken ? 'border-[#b8332b]/60 bg-[#b8332b]/10' : 'border-brass/40 bg-brass/5'
      }`}
    >
      <p className="text-[0.6rem] tracking-[0.18em] text-brass uppercase">Lệnh từ {order.fromName}</p>
      <p className="mt-1 text-sm text-parchment/90 italic">“{order.text}”</p>
      <p className="mt-1.5 text-[0.65rem] text-parchment/55">
        {broken
          ? `Ngài đã phá lệnh ở vòng ${String(battle.command.disobeyedAtRound)}. Thắng thì uy tín tăng mạnh và chủ soái ghi hận; thua thì có thể mất đất, mất tước.`
          : 'Đưa quân lên trước hạn là trái lệnh. Engine ghi lại đúng lúc ngài làm, không phải lúc ngài định làm.'}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bảng tướng dưới quyền (mục 14, gạch thứ năm)
// ---------------------------------------------------------------------------

export function OfficerTable({
  battle,
  chosen,
  onChoose,
}: {
  battle: BattleState;
  chosen: Partial<Record<WingId, OrderId>>;
  onChoose: (wing: WingId, order: OrderId) => void;
}): ReactNode {
  const officers = battle.officers.filter((officer) => officer.side === battle.playerSide);
  if (officers.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {officers.map((officer) => {
        const last = [...battle.command.issued].reverse().find((entry) => entry.officerId === officer.id);
        const units = battle.units.filter(
          (unit) => unit.side === officer.side && unit.wing === officer.wing && unit.state !== 'tan-ra',
        );
        const worst = units.reduce<string>((state, unit) => (unit.state === 'vo-tran' ? unit.state : state), 'vung');

        return (
          <div key={officer.id} className="rounded border border-oak-light px-2 py-1.5">
            <div className="flex items-baseline justify-between gap-2">
              <span className={`truncate text-xs ${officer.alive ? 'text-parchment' : 'text-[#b8332b] line-through'}`}>
                {officer.name}
              </span>
              <span className="shrink-0 text-[0.6rem] text-parchment/50">{WING_LABELS[officer.wing]}</span>
            </div>
            <div className="mt-0.5 flex flex-wrap gap-x-3 text-[0.6rem] text-parchment/55">
              <span>lòng trung {officer.loyalty}</span>
              <span>{TEMPERAMENT_LABELS[officer.temperament]}</span>
              <span>{units.length} đơn vị · {UNIT_STATE_LABELS[worst as keyof typeof UNIT_STATE_LABELS]}</span>
            </div>

            {last !== undefined && (
              <p className="mt-1 text-[0.6rem] text-parchment/70">
                lệnh vừa rồi: <span className="text-brass">{ORDER_LABELS[last.order]}</span> →{' '}
                {TIER_LABELS[last.result]} · {ORDER_EFFECT_LABELS[last.effect]}
              </p>
            )}

            {officer.alive && (
              <div className="mt-1 flex flex-wrap gap-1">
                {ORDER_IDS.map((id) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => onChoose(officer.wing, id)}
                    className={`rounded border px-1.5 py-0.5 text-[0.6rem] ${
                      chosen[officer.wing] === id
                        ? 'border-brass bg-brass/15 text-brass'
                        : 'border-oak-light text-parchment/60 hover:bg-oak-light'
                    }`}
                  >
                    {ORDER_LABELS[id]}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
