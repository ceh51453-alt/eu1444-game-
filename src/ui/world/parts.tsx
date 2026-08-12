/**
 * MẢNH DÙNG CHUNG CỦA TAB THẾ GIỚI — Phần 14 mục 8.
 *
 * CHỖ NÀY LÀ NGOẠI LỆ DUY NHẤT của luật "tám giao diện khác hẳn nhau" (mục 10.5),
 * và ranh giới của ngoại lệ ấy phải rõ: ở đây CHỈ có màn sương, phù hiệu tầng
 * tiếp cận, và một cái thanh. Không có `<PowerBoard>` chung, không có bảng chỉ số
 * chung, không có bố cục chung. Tám bảng tự dựng lấy hình dạng của mình từ ba
 * mảnh này — cũng như tám tờ giấy khác nhau vẫn dùng chung một loại mực.
 *
 * MÀN SƯƠNG là mảnh quan trọng nhất: mục 8 nói chỗ nào chưa biết thì hiện mờ kèm
 * "tin đồn chưa xác thực", KHÔNG hiện số liệu thật. Nên `<Fog>` không làm mờ một
 * con số đúng — nó THAY con số bằng một lời mô tả. Người chơi không có cách nào
 * suy ngược ra, và đó là điểm.
 */

import type { ReactNode } from 'react';
import { blurNumber, tierLabel, type AccessTier, type ClarityLevel } from '@/systems/nations';

export interface FogProps {
  value: number;
  clarity: ClarityLevel;
  scale?: 'meter' | 'money' | 'men';
  suffix?: string;
}

/** Một con số nhìn qua màn sương. Biết rõ thì thấy số; không thì thấy một lời đồn. */
export function Fog({ value, clarity, scale = 'meter', suffix = '' }: FogProps): ReactNode {
  const text = blurNumber(value, clarity, scale);
  if (clarity === 'biet-ro') {
    return (
      <span className="font-mono text-xs text-parchment">
        {text}
        {suffix}
      </span>
    );
  }
  return (
    <span className="font-mono text-xs italic text-vellum/45" title="tin đồn chưa xác thực">
      {text}
    </span>
  );
}

/** Phù hiệu ở GÓC TRÊN mỗi bảng: Quan sát / Tác động / Chơi (mục 8). */
export function TierBadge({ tier, clarityLabel }: { tier: AccessTier; clarityLabel: string }): ReactNode {
  const tone =
    tier === 'choi-that'
      ? 'border-gold/60 text-gold'
      : tier === 'tac-dong'
        ? 'border-oak-light text-parchment'
        : 'border-oak text-vellum/50';
  return (
    <div className="flex items-center gap-2">
      <span className={`rounded border px-2 py-0.5 text-[10px] uppercase tracking-wide ${tone}`}>{tierLabel(tier)}</span>
      {clarityLabel !== '' && <span className="text-[10px] italic text-vellum/40">{clarityLabel}</span>}
    </div>
  );
}

export function Bar({ value, tone, title }: { value: number; tone: string; title?: string }): ReactNode {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded bg-ink" title={title ?? ''}>
      <div className={`h-full ${tone}`} style={{ width: `${String(Math.max(0, Math.min(100, value)))}%` }} />
    </div>
  );
}

export function Line({ label, children }: { label: string; children: ReactNode }): ReactNode {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-vellum/60">{label}</span>
      {children}
    </div>
  );
}

/** Nút hành động của tầng 2 và tầng 3. Chưa đủ tầng thì KHÔNG HIỆN — không xám. */
export function TierButton({
  tier,
  needs,
  label,
  onClick,
}: {
  tier: AccessTier;
  needs: AccessTier;
  label: string;
  onClick: () => void;
}): ReactNode {
  const rank = { 'quan-sat': 1, 'tac-dong': 2, 'choi-that': 3 };
  if (rank[tier] < rank[needs]) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded border border-oak-light px-2 py-0.5 text-[11px] text-parchment hover:bg-oak/40"
    >
      {label}
    </button>
  );
}
