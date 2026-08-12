/**
 * Tab Regex (Phần 1 mục 6.7).
 *
 * Regex của preset vẫn CHẠY từ trước — trình import nạp chúng và `assemblePrompt`
 * gọi chúng ở bước 1 của mỗi khối. Cái thiếu là chỗ NHÌN THẤY chúng: một preset
 * thật mang hàng chục regex, một cái trong đó cắt nhầm một đoạn văn, và không có
 * bảng này thì không có cách nào biết là cái nào.
 *
 * Ba thứ bảng này phải nói ra, vì cả ba đều vô hình ở mọi chỗ khác:
 *   - mẫu nào ĐANG chạy, chạy ở phía nào (gửi đi hay hiển thị), với vai nào;
 *   - mẫu nào bị TỪ CHỐI và vì sao (`runner.ts` chặn trước mẫu quay lui thảm hoạ);
 *   - và mẫu đó thật ra làm gì với một đoạn chữ cụ thể — ô thử ở cuối.
 */

import { useMemo, useState, type ReactNode } from 'react';
import {
  applyRegexScripts,
  appliesTo,
  type RegexPlacement,
  type RegexScript,
  type RegexTarget,
} from '@/ai/regex/runner';
import { useSettingsStore } from '@/state/settings';
import { Button, Field, Select, TextInput, Warning } from './controls';

const PLACEMENT_LABELS: Record<number, string> = {
  1: 'tin người dùng',
  2: 'tin AI',
  3: 'lệnh/hệ thống',
  5: 'lorebook',
};

function placementText(script: RegexScript): string {
  if (script.placements.length === 0) return 'mọi vị trí';
  return script.placements.map((code) => PLACEMENT_LABELS[code] ?? `#${code}`).join(', ');
}

function targetText(script: RegexScript): string {
  if (script.promptOnly) return 'chỉ khi GỬI ĐI';
  if (script.markdownOnly) return 'chỉ khi HIỂN THỊ';
  return 'cả hai phía';
}

function ScriptRow({ script }: { script: RegexScript }): ReactNode {
  const [open, setOpen] = useState(false);
  const store = useSettingsStore.getState();
  const rejected = script.rejected !== undefined;

  return (
    <li
      className={`rounded border px-2 py-1 text-xs ${
        rejected ? 'border-red-500/50 bg-red-500/5' : 'border-oak-light bg-ink/40'
      }`}
    >
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={script.enabled && !rejected}
          disabled={rejected}
          title={rejected ? 'Mẫu bị từ chối — không bật được' : undefined}
          onChange={(event) => store.toggleRegex(script.id, event.target.checked)}
        />
        <button
          type="button"
          className="flex-1 truncate text-left hover:text-brass"
          title={script.id}
          onClick={() => setOpen((previous) => !previous)}
        >
          {script.name}
        </button>
        <span className="shrink-0 text-vellum/40">{placementText(script)}</span>
        <span
          className={`shrink-0 ${script.promptOnly ? 'text-sky-300' : script.markdownOnly ? 'text-emerald-300' : 'text-vellum/40'}`}
        >
          {targetText(script)}
        </span>
        {rejected && <span className="shrink-0 text-red-300">bị từ chối</span>}
      </div>

      {rejected && <p className="mt-1 text-[11px] text-red-300">{script.rejected}</p>}

      {open && (
        <div className="mt-1 flex flex-col gap-1 border-t border-oak-light pt-1 text-[11px]">
          <p className="text-vellum/50">
            Tìm:{' '}
            <code className="break-all text-parchment">
              /{script.findSource}/{script.flags}
            </code>
          </p>
          <p className="text-vellum/50">
            Thay:{' '}
            <code className="break-all text-parchment">
              {script.replace === '' ? '(xóa hẳn)' : script.replace}
            </code>
          </p>
          {script.trimStrings.length > 0 && (
            <p className="text-vellum/50">Cắt bỏ: {script.trimStrings.map((s) => `"${s}"`).join(', ')}</p>
          )}
          {(script.minDepth !== null || script.maxDepth !== null) && (
            <p className="text-vellum/50">
              Độ sâu: {script.minDepth ?? '−∞'} … {script.maxDepth ?? '+∞'}
            </p>
          )}
        </div>
      )}
    </li>
  );
}

/** Chạy thử cả danh sách trên một đoạn chữ, đúng đường mà engine đi. */
function Tester({ scripts }: { scripts: readonly RegexScript[] }): ReactNode {
  const [text, setText] = useState('<thinking>nháp</thinking>Ngài bước vào đại sảnh.');
  const [target, setTarget] = useState<RegexTarget>('display');
  const [placement, setPlacement] = useState<RegexPlacement>(2);

  const result = useMemo(
    () => applyRegexScripts(text, scripts, { placement, target }),
    [text, scripts, placement, target],
  );
  const eligible = scripts.filter((script) => appliesTo(script, { placement, target }));

  return (
    <div className="flex flex-col gap-2 rounded border border-oak-light bg-ink/60 p-2">
      <p className="text-xs tracking-[0.2em] text-brass uppercase">Chạy thử</p>

      <div className="flex gap-2">
        <Field label="Phía">
          <Select value={target} onChange={(event) => setTarget(event.target.value as RegexTarget)}>
            <option value="prompt">gửi đi (prompt)</option>
            <option value="display">hiển thị (markdown)</option>
          </Select>
        </Field>
        <Field label="Vị trí">
          <Select
            value={String(placement)}
            onChange={(event) => setPlacement(Number(event.target.value) as RegexPlacement)}
          >
            <option value="1">tin người dùng</option>
            <option value="2">tin AI</option>
            <option value="3">lệnh/hệ thống</option>
            <option value="5">lorebook</option>
          </Select>
        </Field>
      </div>

      <textarea
        rows={3}
        value={text}
        onChange={(event) => setText(event.target.value)}
        className="w-full resize-y rounded border border-oak-light bg-ink px-2 py-1.5 font-mono text-xs text-parchment"
      />

      <p className="text-[11px] text-vellum/40">
        {eligible.length} mẫu hợp ngữ cảnh · {result.applied.length} mẫu đã đổi được chữ ·{' '}
        {result.elapsedMs}ms
      </p>
      <pre className="max-h-40 overflow-auto rounded border border-oak-light bg-ink p-2 font-mono text-[11px] whitespace-pre-wrap text-parchment">
        {result.text === '' ? '(rỗng)' : result.text}
      </pre>
      {result.skipped.length > 0 && (
        <ul className="flex flex-col gap-0.5 text-[11px] text-amber-300">
          {result.skipped.map((skip, index) => (
            <li key={index}>
              {skip.id}: {skip.reason}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function RegexTab(): ReactNode {
  const preset = useSettingsStore((state) => state.preset);
  const store = useSettingsStore.getState();
  const [filter, setFilter] = useState('');

  if (preset === null) {
    return <p className="text-sm text-vellum/50 italic">Nạp một preset ở tab Preset trước.</p>;
  }

  const scripts = preset.regexScripts;
  const shown = scripts.filter((script) =>
    filter === '' ? true : script.name.toLowerCase().includes(filter.toLowerCase()),
  );
  const active = scripts.filter((script) => script.enabled && script.rejected === undefined).length;
  const rejected = scripts.filter((script) => script.rejected !== undefined).length;

  const setAll = (enabled: boolean): void => {
    for (const script of scripts) {
      if (script.rejected === undefined) store.toggleRegex(script.id, enabled);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-vellum/50">
        {scripts.length} regex trong preset · {active} đang bật
        {rejected === 0 ? '' : ` · ${rejected} bị từ chối`}
      </p>

      {scripts.length === 0 && (
        <Warning level="info">
          Preset này không có regex nào (cả <code>extensions.SPreset.RegexBinding</code> lẫn{' '}
          <code>extensions.regex_scripts</code> đều trống).
        </Warning>
      )}

      {rejected > 0 && (
        <Warning level="warn">
          {rejected} mẫu bị chặn trước vì có nguy cơ quay lui thảm họa. JavaScript KHÔNG ngắt được một
          regex đang chạy trên luồng chính, nên chúng không có nút bật.
        </Warning>
      )}

      {scripts.length > 0 && (
        <>
          <div className="flex gap-2">
            <Button onClick={() => setAll(true)}>Bật tất cả</Button>
            <Button onClick={() => setAll(false)}>Tắt tất cả</Button>
          </div>

          <Field label={`Lọc theo tên (${shown.length}/${scripts.length})`}>
            <TextInput value={filter} placeholder="gõ để tìm…" onChange={(event) => setFilter(event.target.value)} />
          </Field>

          <ul className="flex flex-col gap-1">
            {shown.map((script) => (
              <ScriptRow key={script.id} script={script} />
            ))}
          </ul>

          <Tester scripts={scripts} />
        </>
      )}
    </div>
  );
}
