/**
 * PROMPT MANAGER (Phần 3 mục 10).
 *
 * Cột trái của shell chỉ rộng 24rem, không đủ để vừa kéo thả vừa xem trước
 * prompt hoàn chỉnh — nên tab trong Cài đặt giữ phần kéo thả, còn bản toàn màn
 * hình mở ra thêm panel XEM TRƯỚC và editor template.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { checkBlockOrder, sortBlocks } from '@/ai/blocks';
import { priorityColor } from '@/ai/budget';
import { DEFAULT_MAX_INPUT_TOKENS, DEFAULT_MAX_OUTPUT_TOKENS } from '@/ai/provider';
import { DEFAULT_LORE_BUDGET } from '@/lore/budget';
import { usePromptStore } from '@/state/prompts';
import { useSettingsStore } from '@/state/settings';
import { useTurnStore } from '@/state/turn';
import { Button, Field, TextInput, Warning } from '@/ui/settings/controls';
import { BlockEditor } from './BlockEditor';
import { BlockList, BudgetBar } from './BlockList';
import { usePromptPreview } from './usePreview';

/** Nút chung của cả tab lẫn bản toàn màn hình. */
export function BlockToolbar(): ReactNode {
  const store = usePromptStore.getState();
  const fileInput = useRef<HTMLInputElement | null>(null);
  const [name, setName] = useState('');

  const download = (): void => {
    const blob = new Blob([store.exportBundle()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'khoi-prompt.json';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const upload = async (file: File): Promise<void> => {
    try {
      store.importBundle(JSON.parse(await file.text()) as unknown);
    } catch (error) {
      store.importBundle({ loi: String(error) });
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        ref={fileInput}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file !== undefined) void upload(file);
          event.target.value = '';
        }}
      />
      <TextInput
        value={name}
        placeholder="tên khối mới"
        className="w-40"
        onChange={(event) => setName(event.target.value)}
      />
      <Button
        onClick={() => {
          store.add(name);
          setName('');
        }}
      >
        Thêm khối
      </Button>
      <Button onClick={() => store.restoreAll()}>Khôi phục mặc định</Button>
      <Button onClick={download}>Export</Button>
      <Button onClick={() => fileInput.current?.click()}>Import</Button>
    </div>
  );
}

/**
 * Cấu hình ngân sách (mục 9).
 *
 * Hai con số token thuộc về HỒ SƠ KẾT NỐI, không thuộc về ván chơi: chúng là
 * trần của model đang chọn, và đổi model thì phải đổi cùng lúc. Chúng vẫn sửa
 * được ở đây — cùng một ô, cùng một nguồn — nhưng "chừa cho đầu ra" đã đổi tên
 * thành đúng thứ nó là: TRẦN SINH RA, con số gửi thẳng lên nhà cung cấp.
 *
 * Chỉ `lore` là của riêng store lượt, vì trần lorebook không dính gì tới ai
 * đang chạy model.
 */
export function BudgetSettings(): ReactNode {
  const budget = useTurnStore((state) => state.budget);
  const main = useSettingsStore((state) => state.profiles.main);
  const store = useTurnStore.getState();
  const settings = useSettingsStore.getState();

  const total = main.maxInputTokens ?? DEFAULT_MAX_INPUT_TOKENS;
  const output = main.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS;

  return (
    <div className="grid grid-cols-3 gap-2">
      <Field label="Vào — cửa sổ ngữ cảnh" hint="của hồ sơ Kết nối chính">
        <TextInput
          type="number"
          min={1000}
          step={1000}
          value={total}
          onChange={(event) => {
            settings.patchProfile('main', { maxInputTokens: Math.max(1000, Number(event.target.value)) });
          }}
          onBlur={() => void settings.persist()}
        />
      </Field>
      <Field label="Ra — trần sinh ra" hint="cũng là max_tokens gửi lên proxy">
        <TextInput
          type="number"
          min={64}
          step={256}
          value={output}
          onChange={(event) => {
            settings.patchProfile('main', { maxOutputTokens: Math.max(64, Number(event.target.value)) });
          }}
          onBlur={() => void settings.persist()}
        />
      </Field>
      <Field label="Ngân sách lorebook" hint="trần riêng của khối 4">
        <TextInput
          type="number"
          min={0}
          step={500}
          value={budget.lore ?? DEFAULT_LORE_BUDGET}
          onChange={(event) => store.setBudget({ ...budget, lore: Math.max(0, Number(event.target.value)) })}
        />
      </Field>
    </div>
  );
}

/** Cảnh báo về thứ tự khối và về lần nạp/kéo thả gần nhất. */
export function BlockWarnings(): ReactNode {
  const blocks = usePromptStore((state) => state.blocks);
  const issues = usePromptStore((state) => state.issues);
  const refusal = usePromptStore((state) => state.refusal);
  const problems = checkBlockOrder(blocks);

  if (problems.length === 0 && issues.length === 0 && refusal === null) return null;

  return (
    <div className="flex flex-col gap-1">
      {problems.map((problem) => (
        <Warning key={problem} level="warn">
          {problem}
        </Warning>
      ))}
      {refusal !== null && <Warning level="info">Không kéo được: {refusal}</Warning>}
      {issues.map((issue) => (
        <Warning key={issue} level="info">
          {issue}
        </Warning>
      ))}
    </div>
  );
}

export function PromptManager({ onClose }: { onClose(): void }): ReactNode {
  const blocks = usePromptStore((state) => state.blocks);
  const editing = usePromptStore((state) => state.editing);
  const store = usePromptStore.getState();
  const preview = usePromptPreview();

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const kept = preview.prompt?.blocks.filter((block) => block.skipped === null) ?? [];
  const byId = new Map(sortBlocks(blocks).map((block) => [block.id, block] as const));

  return (
    <div className="fixed inset-0 z-50 flex flex-col gap-3 bg-ink/95 p-4">
      <div className="flex items-center gap-3">
        <h2 className="text-xs tracking-[0.2em] text-brass uppercase">Prompt Manager</h2>
        <span className="text-xs text-vellum/40">
          {blocks.length} khối · {preview.prompt?.tokens ?? 0}/{preview.prompt?.limit ?? 0} token
          {preview.busy ? ' · đang lắp…' : ''}
        </span>
        <div className="flex-1" />
        <Button onClick={onClose}>Đóng (Esc)</Button>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[26rem_1fr] gap-4">
        <div className="flex min-h-0 flex-col gap-2 overflow-y-auto pr-1">
          <BlockToolbar />
          <BudgetSettings />
          <BlockWarnings />
          <BudgetBar blocks={blocks} tokens={preview.tokens} limit={preview.prompt?.limit ?? 0} />
          <BlockList tokens={preview.tokens} skipped={preview.skipped} onEdit={(id) => store.setEditing(id)} />
        </div>

        <div className="flex min-h-0 flex-col gap-2 overflow-hidden rounded border border-oak-light bg-oak/40 p-3">
          {editing === null ? (
            <>
              <p className="text-xs tracking-[0.2em] text-brass uppercase">Xem trước prompt hoàn chỉnh</p>
              {preview.prompt?.overflow != null && <Warning level="warn">{preview.prompt.overflow}</Warning>}
              <div className="min-h-0 flex-1 overflow-y-auto">
                {kept.map((block) => (
                  <div
                    key={block.id}
                    className="mb-3 border-l-2 pl-2"
                    style={{ borderColor: priorityColor(block.priority) }}
                  >
                    <p className="text-[11px] text-vellum/40">
                      [{block.role}] {block.name} · {block.tokens} token
                    </p>
                    <pre className="text-[11px] whitespace-pre-wrap text-vellum/85">{block.text}</pre>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <BlockEditor
              blockId={byId.has(editing) ? editing : (sortBlocks(blocks)[0]?.id ?? editing)}
              onClose={() => store.setEditing(null)}
            />
          )}
        </div>
      </div>
    </div>
  );
}
