/**
 * BẢNG HÀNH ĐỘNG (Phần 9 mục 11, gạch đầu dòng 2).
 *
 * "Bảng hành động bên dưới, mỗi nút hiện: chi phí thể lực, tầm, tốc độ."
 *
 * NÚT TẮT VẪN HIỆN, KÈM LÝ DO. Giấu hẳn nút thì người chơi không bao giờ học
 * được rằng cây thương dài của mình vô dụng ở cự ly một ô — họ chỉ thấy bảng đổi
 * và không hiểu vì sao. Đó cũng là tinh thần của README mục 8.4: game không có
 * reroll, nên mọi thứ chặn người chơi lại đều phải nói ra tên nó.
 */

import type { ReactNode } from 'react';
import {
  UNAVAILABLE_LABELS,
  type ActionOption,
  type ChosenAction,
  type ResolvedAction,
} from '@/minigames/duel';

export interface ActionBarProps {
  options: readonly ActionOption[];
  onChoose: (chosen: ChosenAction) => void;
  disabled?: boolean;
}

const CATEGORY_ORDER = ['tan-cong', 'phong-thu', 'di-chuyen', 'dac-biet', 'ky-thuat', 'the'] as const;

const CATEGORY_NAMES: Readonly<Record<string, string>> = {
  'tan-cong': 'Tấn công',
  'phong-thu': 'Phòng thủ',
  'di-chuyen': 'Di chuyển',
  the: 'Thế',
  'dac-biet': 'Đặc biệt',
  'ky-thuat': 'Chiêu thức',
};

const SPEED_NAMES: Readonly<Record<string, string>> = { nhanh: 'nhanh', vua: 'vừa', cham: 'chậm' };

function reachLabel(action: ResolvedAction): string {
  if (!action.attack) return '—';
  const { min, max } = action.reach;
  return min === max ? `${max} ô` : `${min}–${max} ô`;
}

export function ActionBar({ options, onChoose, disabled = false }: ActionBarProps): ReactNode {
  return (
    <div className="flex flex-col gap-3">
      {CATEGORY_ORDER.map((category) => {
        const group = options.filter((entry) => entry.action.category === category);
        if (group.length === 0) return null;

        return (
          <section key={category} className="flex flex-col gap-1.5">
            <h4 className="text-[0.65rem] font-semibold tracking-[0.18em] text-brass uppercase">
              {CATEGORY_NAMES[category] ?? category}
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {group.map(({ action, blocked }) => (
                <button
                  key={action.key}
                  type="button"
                  disabled={disabled || blocked !== null}
                  title={blocked === null ? action.base.note : UNAVAILABLE_LABELS[blocked]}
                  onClick={() =>
                    onChoose(action.nodeId === '' ? { actionId: action.actionId } : { actionId: action.actionId, nodeId: action.nodeId })
                  }
                  className={[
                    'flex min-w-[8.5rem] flex-col items-start gap-0.5 rounded border px-2 py-1.5 text-left transition',
                    blocked === null
                      ? 'border-oak-light bg-oak text-parchment hover:border-brass hover:bg-oak-light'
                      : 'cursor-not-allowed border-oak-light/40 bg-oak/40 text-parchment/35',
                  ].join(' ')}
                >
                  <span className="text-sm leading-tight">{action.name}</span>
                  <span className="text-[0.65rem] text-parchment/55">
                    {Math.round(action.staminaCost)} sức · {reachLabel(action)} · {SPEED_NAMES[action.speed] ?? action.speed}
                  </span>
                  {blocked !== null && (
                    <span className="text-[0.65rem] text-[#b8332b]">{UNAVAILABLE_LABELS[blocked]}</span>
                  )}
                </button>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
