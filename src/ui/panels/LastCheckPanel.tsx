/**
 * PANEL "CHI TIẾT LẦN TUNG GẦN NHẤT" (Phần 5 mục 11).
 *
 * Hiện ĐỦ từng dòng modifier, không gộp thành một con số. Đây không phải tiện
 * nghi: game không có reroll và không có điểm vận mệnh, nên nếu người chơi
 * không đọc được vì sao mình hỏng thì họ chỉ có thể kết luận là engine ăn gian
 * (Phần 5 mục 3). Tên hệ đứng ngay dòng đầu vì mục 2 đòi UI luôn nói rõ hệ nào
 * vừa chạy — bốn hệ mà không ghi tên thì không ai ước lượng nổi cơ hội.
 */

import { useMemo, type ReactNode } from 'react';
import type { CheckResult } from '@/core/turn';
import { CONSEQUENCE_LABELS, SYSTEM_LABELS, TIER_LABELS, checkLog, difficultyLabel } from '@/systems/check';
import { useTurnStore } from '@/state/turn';
import { Panel } from '@/ui/shell/AppShell';

const TIER_TONE: Readonly<Record<CheckResult['tier'], string>> = {
  critFail: 'text-red-300',
  fail: 'text-amber-300',
  costlySuccess: 'text-amber-200',
  success: 'text-emerald-300',
  critSuccess: 'text-emerald-200',
};

function rolled(check: CheckResult): string {
  if (check.system === 'pool') {
    return `${check.raw.length} viên d6: ${check.raw.join(' ')}`;
  }
  if (check.raw.length > 1) {
    const sum = check.raw.reduce((total, face) => total + face, 0);
    return `${check.raw.join('+')} = ${sum}`;
  }
  return String(check.raw[0] ?? 0);
}

function against(check: CheckResult): string {
  if (check.dc !== undefined) return `DC ${check.dc}`;
  if (check.system === 'pool') return `cần ${check.target ?? 0} thành công`;
  if (check.target !== undefined) return `ngưỡng ${check.target}`;
  return '';
}

export function LastCheckPanel(): ReactNode {
  // `checkLog` là một lớp thường, không phải store — nó không tự báo cho React.
  // Mốc lượt của `useTurnStore` là thứ đổi mỗi khi một lượt chốt, nên nó đủ để
  // kéo panel này vẽ lại. Phần 9–11 tung xúc sắc ngoài vòng lặp lượt sẽ cần một
  // mốc riêng, và chỗ cắm nằm đúng ở đây.
  const stamp = useTurnStore((state) => state.last?.record.turn ?? 0);
  const entry = useMemo(() => checkLog.last(), [stamp]);

  if (entry === null) {
    return (
      <Panel title="Lần tung gần nhất">
        <p className="text-sm text-vellum/50 italic">Engine chưa tung lần nào trong phiên này.</p>
      </Panel>
    );
  }

  const check = entry.result;
  const versus = against(check);

  return (
    <Panel title="Lần tung gần nhất">
      <div className="flex flex-col gap-1 text-xs">
        <p className="text-vellum/70">
          {check.id} · miền <span className="font-mono">{check.domain}</span>
        </p>
        <p className="text-vellum/70">
          Hệ: <b className="text-parchment">{SYSTEM_LABELS[check.system]}</b> · độ khó{' '}
          <b className="text-parchment">{difficultyLabel(check.difficulty)}</b>
        </p>
        <p className="text-vellum/70">
          Tung {rolled(check)}
          {versus === '' ? '' : ` · ${versus}`} · chênh {check.margin >= 0 ? '+' : ''}
          {check.margin}
        </p>
        <p className={`text-sm font-semibold ${TIER_TONE[check.tier]}`}>{TIER_LABELS[check.tier]}</p>
      </div>

      <div className="flex flex-col gap-0.5 text-xs">
        <p className="tracking-[0.15em] text-brass/80 uppercase">Điều chỉnh</p>
        {check.modifiers.length === 0 ? (
          <p className="text-vellum/50 italic">Không có điều chỉnh nào.</p>
        ) : (
          check.modifiers.map((line, index) => (
            <div key={`${line.source}-${index}`} className="flex items-baseline justify-between gap-2">
              <span className="truncate text-vellum/70" title={`nguồn: ${line.source}`}>
                {line.label}
              </span>
              <span className={`font-mono ${line.value < 0 ? 'text-red-300' : 'text-emerald-300'}`}>
                {line.value >= 0 ? '+' : ''}
                {line.value}
              </span>
            </div>
          ))
        )}
      </div>

      {check.consequence !== undefined && (
        <p className="rounded border-l-2 border-brass/60 bg-brass/5 px-2 py-1 text-xs text-vellum/80">
          <b className="text-brass">{CONSEQUENCE_LABELS[check.consequence.kind]}:</b>{' '}
          {check.consequence.text}
        </p>
      )}

      <p className="font-mono text-[10px] text-vellum/40" title="Dòng xúc sắc và vị trí đã rút (R3)">
        {check.seedUsed}
      </p>
    </Panel>
  );
}
