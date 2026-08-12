/**
 * "THỐNG KÊ XÚC SẮC" cho tab Debug (Phần 5 mục 11).
 *
 * Hai việc, và cả hai đều là việc của người cân bằng chứ không phải người chơi:
 *   · RNG có lệch không — 500 lần tung gần nhất đủ để nhìn ra một hệ hỏng nặng
 *   · tỷ lệ từng cấp có giống bảng Monte Carlo không — nếu khác xa thì hoặc
 *     modifier đang cộng sai, hoặc độ khó đang bị chọn sai chỗ nào đó
 *
 * Bài Monte Carlo của mục 12.8 kiểm ngưỡng ở trạng thái phòng thí nghiệm; bảng
 * này kiểm chúng ở trạng thái đang chơi thật, nơi modifier đã cắm vào.
 */

import { useState, type ReactNode } from 'react';
import type { CheckTier } from '@/core/turn';
import { archiveLayer } from '@/persist/storage';
import { CHECK_LOG_WINDOW, SYSTEM_LABELS, TIER_LABELS, TIER_ORDER, checkLog } from '@/systems/check';

const TIER_BAR: Readonly<Record<CheckTier, string>> = {
  critFail: 'bg-red-500/70',
  fail: 'bg-amber-600/60',
  costlySuccess: 'bg-brass/70',
  success: 'bg-emerald-600/60',
  critSuccess: 'bg-emerald-400/70',
};

export function DiceStatsPanel(): ReactNode {
  const [, force] = useState(0);
  const stats = checkLog.stats();
  const failures = checkLog.sinkFailures();
  const total = stats.reduce((sum, row) => sum + row.total, 0);

  return (
    <details className="rounded border border-oak-light bg-ink/60 p-2">
      <summary
        className="cursor-pointer text-xs tracking-[0.2em] text-brass uppercase"
        onClick={() => force((tick) => tick + 1)}
      >
        Thống kê xúc sắc — {total}/{CHECK_LOG_WINDOW} lần tung
      </summary>

      <p className="mt-1 text-[11px] text-vellum/40">
        {CHECK_LOG_WINDOW} lần tung gần nhất trong bộ nhớ.{' '}
        {archiveLayer() === null
          ? 'Tầng B không chạy nên không có bản dài hạn nào.'
          : 'Bản đầy đủ nằm ở Tầng B — xem tab Lưu trữ.'}
      </p>

      {total === 0 ? (
        <p className="mt-1 text-[11px] text-vellum/50 italic">Chưa có lần tung nào để thống kê.</p>
      ) : (
        <div className="mt-2 flex flex-col gap-2">
          {stats.map((row) => (
            <div key={row.system} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between text-[11px]">
                <span className="text-vellum/70">{SYSTEM_LABELS[row.system]}</span>
                <span className="font-mono text-vellum/50">{row.total} lần</span>
              </div>

              {row.total === 0 ? (
                <p className="text-[11px] text-vellum/30 italic">chưa chạy lần nào</p>
              ) : (
                <>
                  <div className="flex h-2 w-full overflow-hidden rounded bg-oak">
                    {TIER_ORDER.map((tier) => {
                      const share = (row.byTier[tier] / row.total) * 100;
                      if (share === 0) return null;
                      return (
                        <div
                          key={tier}
                          className={TIER_BAR[tier]}
                          style={{ width: `${share}%` }}
                          title={`${TIER_LABELS[tier]}: ${row.byTier[tier]} (${share.toFixed(1)}%)`}
                        />
                      );
                    })}
                  </div>
                  <ul className="flex flex-wrap gap-x-3 text-[10px] text-vellum/60">
                    {TIER_ORDER.map((tier) => (
                      <li key={tier}>
                        {TIER_LABELS[tier]} <b className="font-mono">{((row.byTier[tier] / row.total) * 100).toFixed(1)}%</b>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {failures.map((failure, index) => (
        <p key={index} className="mt-1 text-[11px] text-red-300">
          {failure}
        </p>
      ))}
    </details>
  );
}
