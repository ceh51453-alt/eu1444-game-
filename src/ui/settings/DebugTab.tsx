/**
 * Tab Debug (Phần 1 mục 7 — "rất quan trọng cho cả dự án").
 *
 * Hiện nguyên văn request cuối và response cuối, đếm token vào/ra, ước tính
 * chi phí mỗi lượt, và copy tất cả ra clipboard.
 *
 * Giá token do người dùng tự nhập: engine không thể biết proxy tính bao nhiêu,
 * và bịa ra một con số còn tệ hơn là không có số nào.
 */

import { useEffect, useState, type ReactNode } from 'react';
import { debugLog, formatDebugLog, type DebugEntry } from '@/ai/debuglog';
import { archiveLayer } from '@/persist/storage';
import { patchLog, PATCH_LOG_WINDOW } from '@/state/history';
import { useSettingsStore } from '@/state/settings';
import { useTurnStore } from '@/state/turn';
import { PROFILE_IDS, PROFILE_LABELS, type ProfileId } from '@/ai/provider';
import { DiceStatsPanel } from '@/ui/panels';
import { Button, Field, TextInput } from './controls';
import { SimPanel } from './SimPanel';

function cost(usage: { in: number; out: number } | null, price: { inPerMTok: number; outPerMTok: number }): number {
  if (usage === null) return 0;
  return (usage.in / 1_000_000) * price.inPerMTok + (usage.out / 1_000_000) * price.outPerMTok;
}

function PricingRow({ profile }: { profile: ProfileId }): ReactNode {
  const price = useSettingsStore((state) => state.pricing[profile]);
  const store = useSettingsStore.getState();
  return (
    <div className="flex gap-2">
      <Field label={`${PROFILE_LABELS[profile]} · $/1M vào`}>
        <TextInput
          type="number"
          min={0}
          step={0.01}
          value={price.inPerMTok}
          onChange={(event) => store.setPricing(profile, { ...price, inPerMTok: Number(event.target.value) })}
          onBlur={() => void store.persist()}
        />
      </Field>
      <Field label={`${PROFILE_LABELS[profile]} · $/1M ra`}>
        <TextInput
          type="number"
          min={0}
          step={0.01}
          value={price.outPerMTok}
          onChange={(event) => store.setPricing(profile, { ...price, outPerMTok: Number(event.target.value) })}
          onBlur={() => void store.persist()}
        />
      </Field>
    </div>
  );
}

/**
 * Nhãn hồ sơ trong nhật ký gỡ lỗi → bảng giá.
 *
 * Nhật ký ghi cả những nhãn không phải hồ sơ (`scan`, `đếm token`), và chúng
 * dùng giá của hồ sơ chính vì đó là kết nối đã phát ra chúng.
 */
function priceKey(profile: string): ProfileId {
  return (PROFILE_IDS as readonly string[]).includes(profile) ? (profile as ProfileId) : 'main';
}

/** Tình trạng Tầng A (Phần 0 mục 4) — save lặng lẽ hỏng là kiểu hỏng tệ nhất. */
function StoragePanel(): ReactNode {
  const note = useTurnStore((state) => state.storageNote);
  const savedAt = useTurnStore((state) => state.savedAt);

  return (
    <div className="rounded border border-oak-light bg-ink/60 p-2 text-xs">
      <p className="mb-1 tracking-[0.2em] text-brass uppercase">Lưu trữ</p>
      <p className="text-vellum/70">{note}</p>
      <p className="text-vellum/50">
        {savedAt === null
          ? 'Chưa ghi lượt nào xuống đĩa trong phiên này.'
          : `Lượt gần nhất đã ghi lúc ${new Date(savedAt).toLocaleTimeString('vi-VN')}.`}
      </p>
    </div>
  );
}

/**
 * Nhật ký patch (Phần 2 mục 8).
 *
 * Chỉ hiện bản rút gọn giữ trong RAM; bản đầy đủ `{before, after}` đi ra sink
 * của Tầng B. Trình duyệt không có OPFS thì Tầng B vắng mặt và bản đầy đủ mất
 * theo mỗi lần tải lại trang — chỗ này phải nói thẳng ra điều đó thay vì để
 * người đọc tưởng nhật ký đã được lưu.
 */
function PatchLogPanel(): ReactNode {
  const [, force] = useState(0);
  const summaries = patchLog.summaries();
  const failures = patchLog.sinkFailures();

  return (
    <details className="rounded border border-oak-light bg-ink/60 p-2">
      <summary
        className="cursor-pointer text-xs tracking-[0.2em] text-brass uppercase"
        onClick={() => force((tick) => tick + 1)}
      >
        Nhật ký patch — {summaries.length}/{PATCH_LOG_WINDOW} lượt
      </summary>

      <p className="mt-1 text-[11px] text-vellum/40">
        Bản rút gọn trong bộ nhớ.{' '}
        {archiveLayer() === null
          ? 'Tầng B không chạy nên state trước/sau không được lưu lại.'
          : 'Bản đầy đủ (state trước và sau) nằm ở Tầng B.'}
      </p>

      {summaries.length === 0 ? (
        <p className="mt-1 text-[11px] text-vellum/50 italic">Chưa lượt nào ghi biến.</p>
      ) : (
        <ul className="mt-1 flex flex-col gap-0.5 text-[11px]">
          {[...summaries].reverse().map((entry) => (
            <li key={`${entry.turn}-${entry.ts}`} className={entry.manualOverride ? 'text-amber-300' : 'text-vellum/70'}>
              Lượt {entry.turn} · {entry.opCount} op
              {entry.manualOverride ? ' · SỬA TAY' : ''} — {entry.changedPaths.join(', ')}
            </li>
          ))}
        </ul>
      )}

      {failures.map((failure, index) => (
        <p key={index} className="mt-1 text-[11px] text-red-300">
          {failure}
        </p>
      ))}
    </details>
  );
}

export function DebugTab(): ReactNode {
  const [entries, setEntries] = useState<readonly DebugEntry[]>(debugLog.entries());
  const [copied, setCopied] = useState(false);
  const pricing = useSettingsStore((state) => state.pricing);

  useEffect(() => debugLog.subscribe(setEntries), []);

  const last = entries.at(-1) ?? null;
  const totalIn = entries.reduce((sum, entry) => sum + (entry.usage?.in ?? 0), 0);
  const totalOut = entries.reduce((sum, entry) => sum + (entry.usage?.out ?? 0), 0);
  const totalCost = entries.reduce(
    (sum, entry) => sum + cost(entry.usage, pricing[priceKey(entry.profile)]),
    0,
  );

  const copy = async (): Promise<void> => {
    await navigator.clipboard.writeText(formatDebugLog(entries));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <Button onClick={() => void copy()} disabled={entries.length === 0}>
          {copied ? 'Đã chép ✓' : 'Copy toàn bộ'}
        </Button>
        <Button onClick={() => debugLog.clear()} disabled={entries.length === 0}>
          Xóa
        </Button>
      </div>

      <div className="rounded border border-oak-light bg-ink/60 p-2 text-xs">
        <p className="text-vellum/70">
          {entries.length} lượt gọi trong bộ đệm (tối đa 50)
        </p>
        <p className="text-vellum/70">
          Token: <b>{totalIn}</b> vào · <b>{totalOut}</b> ra
        </p>
        <p className="text-vellum/70">
          Chi phí ước tính: <b>${totalCost.toFixed(4)}</b>
        </p>
      </div>

      {PROFILE_IDS.map((profile) => (
        <PricingRow key={profile} profile={profile} />
      ))}

      <StoragePanel />
      <DiceStatsPanel />
      <SimPanel />
      <PatchLogPanel />

      {last === null ? (
        <p className="text-sm text-vellum/50 italic">Chưa có lượt gọi nào.</p>
      ) : (
        <>
          <details open className="rounded border border-oak-light bg-ink/60 p-2">
            <summary className="cursor-pointer text-xs tracking-[0.2em] text-brass uppercase">
              Request cuối cùng — {last.method} {last.url}
            </summary>
            <pre className="mt-2 max-h-64 overflow-auto text-[11px] whitespace-pre-wrap text-vellum/80">
              {JSON.stringify(last.headers, null, 2)}
              {'\n\n'}
              {last.requestBody}
            </pre>
          </details>

          <details open className="rounded border border-oak-light bg-ink/60 p-2">
            <summary className="cursor-pointer text-xs tracking-[0.2em] text-brass uppercase">
              Response cuối cùng — {last.status ?? 'không có'}
              {last.errorKind === null ? '' : ` · ${last.errorKind}`} · {last.latencyMs}ms
            </summary>
            <pre className="mt-2 max-h-64 overflow-auto text-[11px] whitespace-pre-wrap text-vellum/80">
              {last.responseBody === '' ? '(rỗng)' : last.responseBody}
            </pre>
          </details>
        </>
      )}
    </div>
  );
}
