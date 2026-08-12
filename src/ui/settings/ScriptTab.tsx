/**
 * Tab Script (Phần 1 mục 6.8) — công cụ cho người viết script.
 *
 * Sáu thứ mục 6.8 yêu cầu, đủ cả sáu: danh sách + bật/tắt + sửa bằng CodeMirror,
 * console riêng tách khỏi console trình duyệt, nút "Chạy thử" với state hiện
 * tại, thời gian chạy từng script, nút "Dừng mọi script", và xuất file .d.ts.
 */

import { useEffect, useState, type ReactNode } from 'react';
import { scriptHost, SCRIPT_API_DTS, type ScriptLogLine, type ScriptRun } from '@/ai/scripts/host';
import { useGameStore } from '@/state/store';
import { useSettingsStore } from '@/state/settings';
import { Button, CodeEditor, Field, TextInput, Warning } from './controls';

export function ScriptTab(): ReactNode {
  const preset = useSettingsStore((state) => state.preset);
  const timeoutMs = useSettingsStore((state) => state.scriptTimeoutMs);
  const timeoutEnabled = useSettingsStore((state) => state.scriptTimeoutEnabled);
  const settings = useSettingsStore.getState();

  const [selected, setSelected] = useState<string | null>(null);
  const [logs, setLogs] = useState<readonly ScriptLogLine[]>(scriptHost.logs());
  const [runs, setRuns] = useState<readonly ScriptRun[]>(scriptHost.lastRuns());
  const [tick, setTick] = useState(0);

  useEffect(() => scriptHost.subscribe(setLogs), []);
  useEffect(() => {
    scriptHost.options = { timeoutMs, timeoutEnabled };
  }, [timeoutMs, timeoutEnabled]);

  const scripts = scriptHost.list();
  const current = scripts.find((script) => script.id === selected) ?? null;

  const runOne = async (id: string): Promise<void> => {
    const state = useGameStore.getState().snapshot();
    const run = await scriptHost.runOne(id, state);
    setRuns([run, ...runs.filter((previous) => previous.scriptId !== id)]);
  };

  const downloadDts = (): void => {
    const blob = new Blob([SCRIPT_API_DTS], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'eu1444-script-api.d.ts';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  if (preset === null) {
    return <p className="text-sm text-vellum/50 italic">Nạp một preset ở tab Preset trước.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <Button variant="danger" onClick={() => scriptHost.stopAll()}>
          Dừng mọi script
        </Button>
        <Button onClick={() => scriptHost.resume()} disabled={!scriptHost.stopped}>
          Cho chạy lại
        </Button>
        <Button onClick={downloadDts}>Tải .d.ts</Button>
        <Button onClick={() => scriptHost.clearLogs()}>Xóa log</Button>
      </div>

      <div className="flex items-end gap-2">
        <Field label="Trần thời gian (ms)">
          <TextInput
            type="number"
            min={100}
            max={120000}
            step={100}
            value={timeoutMs}
            disabled={!timeoutEnabled}
            onChange={(event) => settings.setScriptTimeout(Number(event.target.value), timeoutEnabled)}
            onBlur={() => void settings.persist()}
          />
        </Field>
        <label className="flex items-center gap-2 pb-2 text-xs text-vellum/70">
          <input
            type="checkbox"
            checked={timeoutEnabled}
            onChange={(event) => {
              settings.setScriptTimeout(timeoutMs, event.target.checked);
              void settings.persist();
            }}
          />
          bật
        </label>
      </div>

      {scripts.length === 0 && (
        <Warning level="info">Preset này không có script tavern_helper nào.</Warning>
      )}

      <ul className="flex flex-col gap-1">
        {scripts.map((script) => {
          const run = runs.find((candidate) => candidate.scriptId === script.id);
          return (
            <li
              key={script.id}
              className="flex items-center gap-2 rounded border border-oak-light bg-ink/40 px-2 py-1 text-xs"
            >
              <input
                type="checkbox"
                checked={script.enabled}
                onChange={(event) => {
                  scriptHost.setEnabled(script.id, event.target.checked);
                  setTick(tick + 1);
                }}
              />
              <button
                type="button"
                className="flex-1 truncate text-left hover:text-brass"
                onClick={() => setSelected(script.id === selected ? null : script.id)}
              >
                {script.name}
              </button>
              <span
                className={script.kind === 'ui' ? 'text-sky-300' : 'text-emerald-300'}
                title={script.kindReason}
              >
                {script.kind === 'ui' ? 'UI' : 'tính toán'}
              </span>
              {run !== undefined && (
                <span className={run.ok ? 'text-vellum/40' : 'text-red-300'} title={run.error}>
                  {run.elapsedMs}ms{run.timedOut === true ? ' ⏱' : ''}
                </span>
              )}
              <Button onClick={() => void runOne(script.id)}>Chạy thử</Button>
            </li>
          );
        })}
      </ul>

      {current !== null && (
        <div className="flex flex-col gap-1">
          <p className="text-xs text-vellum/50">
            {current.name} — xếp loại <b>{current.kind}</b> vì {current.kindReason}.
          </p>
          <CodeEditor
            value={current.code}
            onChange={(code) => scriptHost.setCode(current.id, code)}
          />
          <Warning level="info">
            Script chỉ được ĐỌC state. Muốn đổi state thì trả về <code>PatchOp[]</code> cho Phần 2 kiểm duyệt.
          </Warning>
        </div>
      )}

      <div className="flex flex-col gap-1">
        <p className="text-xs tracking-[0.2em] text-brass uppercase">Console của script</p>
        <div className="max-h-48 overflow-y-auto rounded border border-oak-light bg-ink p-2 font-mono text-[11px]">
          {logs.length === 0 && <p className="text-vellum/30">chưa có log</p>}
          {logs.map((line, index) => (
            <p
              key={index}
              className={
                line.level === 'error'
                  ? 'text-red-300'
                  : line.level === 'warn'
                    ? 'text-amber-300'
                    : 'text-vellum/70'
              }
            >
              <span className="text-vellum/30">[{line.scriptName}]</span> {line.args.join(' ')}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}
