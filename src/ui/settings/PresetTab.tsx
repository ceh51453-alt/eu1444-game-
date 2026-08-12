/**
 * Tab Preset (Phần 1 mục 6 và 7).
 *
 * Chỗ quan trọng nhất ở đây là bốn khối [LOCKED]: UI phải CHẶN CỨNG, không chỉ
 * ẩn nút. Ở đây nghĩa là checkbox bị disabled, nút kéo không hiện, và store
 * cũng từ chối lệnh tắt/di chuyển kể cả khi có ai gọi thẳng vào nó.
 *
 * Việc thứ hai, thêm sau: nạp preset xong thì THAM SỐ CỦA NÓ PHẢI CÓ HIỆU LỰC.
 * Trước đây `samplerParams` chỉ được giữ lại để export ra không mất trường, nên
 * người chơi nạp một preset đặt temperature 1.1 và reasoning_effort "max" rồi
 * chơi cả buổi với mặc định của engine mà không hay biết.
 */

import { useRef, useState, type ReactNode } from 'react';
import { formatImportReport, importSillyTavernPreset, PresetImportError } from '@/ai/preset/import';
import { serializePreset } from '@/ai/preset/export';
import { scriptHost } from '@/ai/scripts/host';
import { PROFILE_LABELS, type ProfileId } from '@/ai/provider';
import { useSettingsStore } from '@/state/settings';
import { Button, Warning } from './controls';

export function PresetTab(): ReactNode {
  const preset = useSettingsStore((state) => state.preset);
  const report = useSettingsStore((state) => state.presetReport);
  const store = useSettingsStore.getState();
  const fileInput = useRef<HTMLInputElement | null>(null);
  const [error, setError] = useState<string[] | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  /** Áp tham số của preset — kể cả hai trần token — vào một hồ sơ. */
  const applyTo = (profile: ProfileId): void => {
    const result = store.applyPresetTuning(profile);
    if (result === null) return;

    void store.persist();
    const tokens =
      result.input === undefined && result.output === undefined
        ? ''
        : ` · vào ${result.input?.toLocaleString('vi-VN') ?? '—'} / ra ${result.output?.toLocaleString('vi-VN') ?? '—'} token`;
    setNote(
      `Đã áp ${result.applied.length} tham số vào "${PROFILE_LABELS[profile]}"` +
        `${result.ignored.length === 0 ? '' : `, bỏ qua ${result.ignored.length}`}${tokens}.`,
    );

    // Báo cáo phải kể lại lần áp này, nếu không thì hai lần bấm nút cho ra cùng
    // một báo cáo cũ và người chơi không biết lần vừa rồi đã làm gì.
    const current = useSettingsStore.getState().presetReport;
    if (current !== null) {
      store.setPreset(useSettingsStore.getState().preset, {
        ...current,
        tuning: [
          ...current.tuning.filter((entry) => entry.profile !== PROFILE_LABELS[profile]),
          { profile: PROFILE_LABELS[profile], applied: result.applied, ignored: result.ignored },
        ],
      });
    }
  };

  const onFile = async (file: File): Promise<void> => {
    setError(null);
    setNote(null);
    try {
      const raw: unknown = JSON.parse(await file.text());
      const result = importSillyTavernPreset(raw, file.name.replace(/\.json$/i, ''));
      store.setPreset(result.preset, result.report);
      scriptHost.load(result.preset.helperScripts);
      // Áp ngay vào hồ sơ chính: nạp preset mà tham số không có hiệu lực là
      // đúng cái bẫy mô tả ở đầu file này.
      applyTo('main');
    } catch (cause) {
      if (cause instanceof PresetImportError) setError([cause.message, ...cause.issues]);
      else setError(['Không đọc được file JSON', String(cause)]);
    }
  };

  const download = (): void => {
    if (preset === null) return;
    const blob = new Blob([serializePreset(preset)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${preset.name}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-3">
      <input
        ref={fileInput}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file !== undefined) void onFile(file);
          event.target.value = '';
        }}
      />

      <div className="flex gap-2">
        <Button variant="primary" onClick={() => fileInput.current?.click()}>
          Nạp preset SillyTavern
        </Button>
        <Button onClick={download} disabled={preset === null}>
          Xuất ra .json
        </Button>
      </div>

      {error !== null && (
        <Warning level="warn">
          {error.map((line, index) => (
            <span key={index} className="block">
              {line}
            </span>
          ))}
        </Warning>
      )}

      {preset !== null && (
        <div className="flex flex-col gap-1 rounded border border-oak-light bg-ink/60 p-2">
          <p className="text-xs tracking-[0.2em] text-brass uppercase">Áp tham số vào hồ sơ</p>
          <p className="text-xs text-vellum/50">
            Temperature, top-p/k, chế độ streaming và hai trần token — đổi sang đúng tên của từng
            chuẩn API. <code>openai_max_context</code> là CỬA SỔ NGỮ CẢNH (token vào),{' '}
            <code>openai_max_tokens</code> là TRẦN SINH RA (token ra) — hai con số khác nhau.
          </p>
          <div className="mt-1 flex flex-wrap gap-2">
            <Button onClick={() => applyTo('main')}>{PROFILE_LABELS.main}</Button>
            <Button onClick={() => applyTo('worldtick')}>{PROFILE_LABELS.worldtick}</Button>
            <Button onClick={() => applyTo('variables')}>{PROFILE_LABELS.variables}</Button>
          </div>
          {note !== null && <p className="mt-1 text-xs text-emerald-300">{note}</p>}
        </div>
      )}

      {report !== null && (
        <details open className="rounded border border-oak-light bg-ink/60 p-2">
          <summary className="cursor-pointer text-xs tracking-[0.2em] text-brass uppercase">
            Báo cáo import
          </summary>
          <pre className="mt-2 overflow-x-auto text-[11px] whitespace-pre-wrap text-vellum/80">
            {formatImportReport(report)}
          </pre>
        </details>
      )}

      {preset !== null && (
        <div className="flex flex-col gap-1">
          <p className="text-xs tracking-[0.2em] text-brass uppercase">
            Khối prompt ({preset.blocks.length})
          </p>
          <p className="text-xs text-vellum/40">Kéo thả để đổi thứ tự. Khối [LOCKED] không kéo và không tắt được.</p>

          <ul className="flex flex-col gap-1">
            {preset.blocks.map((block, index) => (
              <li
                key={block.id}
                draggable={!block.locked}
                onDragStart={() => setDragging(block.id)}
                onDragOver={(event) => {
                  if (dragging !== null && !block.locked) event.preventDefault();
                }}
                onDrop={() => {
                  if (dragging !== null) store.moveBlock(dragging, index);
                  setDragging(null);
                }}
                onDragEnd={() => setDragging(null)}
                className={`flex items-center gap-2 rounded border px-2 py-1 text-xs ${
                  block.locked
                    ? 'border-brass/50 bg-brass/5'
                    : 'cursor-grab border-oak-light bg-ink/40 hover:border-vellum/40'
                }`}
              >
                <input
                  type="checkbox"
                  checked={block.enabled}
                  disabled={block.locked}
                  title={block.locked ? 'Khối [LOCKED] — không được tắt' : undefined}
                  onChange={(event) => store.toggleBlock(block.id, event.target.checked)}
                />
                <span className="flex-1 truncate" title={block.id}>
                  {block.name}
                </span>
                {block.marker && <span className="text-vellum/40" title={block.gameBlock}>ô cắm</span>}
                {block.source === 'orphan' && <span className="text-amber-300" title="Mồ côi">mồ côi</span>}
                {block.locked && <span className="text-brass">🔒</span>}
                <span className="text-vellum/30" title="Ưu tiên ngân sách token">
                  p{block.budgetPriority}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
