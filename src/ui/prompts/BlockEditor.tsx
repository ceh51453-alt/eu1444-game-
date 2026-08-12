/**
 * EDITOR TEMPLATE (Phần 3 mục 11).
 *
 * Bốn thứ bắt buộc, và cả bốn đều để rút ngắn vòng thử–sai: soạn EJS có tô cú
 * pháp, xem trước render lại sau 300ms, lỗi hiện ngay kèm số dòng, và bảng tra
 * cứu click-là-chèn để không phải nhớ tên biến.
 */

import { useRef, type ReactNode } from 'react';
import { restoreDefault, sortBlocks, type PromptBlock } from '@/ai/blocks';
import { PENDING_QUERIES } from '@/ai/query';
import { usePromptStore } from '@/state/prompts';
import { Button, CodeEditor, Field, Select, TextInput, Warning, type CodeEditorHandle } from '@/ui/settings/controls';
import { usePromptPreview } from './usePreview';

interface Reference {
  label: string;
  insert: string;
  note: string;
}

const LOCALS: readonly Reference[] = [
  { label: 'state', insert: '<%= state.player.name %>', note: 'toàn bộ state — CHỈ ĐỌC, ghi vào là ném lỗi' },
  { label: 'd', insert: '<%= d.combatPower %>', note: 'biến phụ (Phần 2 mục 7)' },
  { label: 'roll', insert: '<% for (const check of roll.checks) { %>', note: 'kết quả xúc sắc engine đã tung ở bước 2' },
  { label: 'lore', insert: '<% for (const entry of lore) { %>', note: 'mục lorebook đã khớp (Phần 4 điền)' },
  { label: 'history', insert: '<% for (const turn of history.slice(-8)) { %>', note: 'các lượt gần đây' },
  { label: 'scene', insert: '<%= scene.place %>', note: 'nơi chốn, NPC có mặt, thời tiết' },
  { label: 'now', insert: '<%= fmt.date(now) %>', note: 'ngày giờ trong game' },
  { label: 'budget', insert: '<%= budget.remaining %>', note: '{ total, used, remaining }' },
  { label: 'action', insert: '<%= action.text %>', note: 'hành động người chơi lượt này' },
  { label: 'schema', insert: '<% for (const item of schema.writable) { %>', note: 'đường dẫn theo quyền ghi' },
];

const QUERIES: readonly Reference[] = [
  { label: 'q.npc(id)', insert: "<%= q.npc('npc_eleanor').name %>", note: 'NPC trong cảnh + quan hệ' },
  { label: 'q.relation(id)', insert: "<%= q.relation('eleanor').note %>", note: 'quan hệ với một NPC' },
  { label: 'q.injuries()', insert: '<% for (const i of q.injuries()) { %>', note: '' },
  { label: 'q.title()', insert: '<%= q.title() %>', note: '' },
  { label: 'q.holding()', insert: '<%= q.holding().name %>', note: '' },
  { label: 'q.realm()', insert: '<%= q.realm().name %>', note: '' },
  { label: 'q.army()', insert: '<%= q.army() %>', note: '' },
  { label: 'q.nation(id)', insert: "<%= q.nation('fra') %>", note: '' },
  { label: 'q.skills(branch)', insert: '<% for (const s of q.skills()) { %>', note: '' },
  { label: 'q.recentEvents(n)', insert: '<% for (const e of q.recentEvents(5)) { %>', note: 'lượt gần đây' },
  { label: 'q.rumors()', insert: '<%= fmt.list(q.rumors()) %>', note: 'tin đồn đang nghe được' },
  { label: 'q.calendar()', insert: '<%= q.calendar().weekday %>', note: 'ngày, thứ, chuỗi hiển thị' },
];

const FORMATS: readonly Reference[] = [
  { label: 'fmt.date(d)', insert: '<%= fmt.date(now) %>', note: 'ngày 12 tháng ba năm 1444' },
  { label: 'fmt.money(n)', insert: '<%= fmt.money(1240) %>', note: '1.240 đồng' },
  { label: 'fmt.list(arr)', insert: '<%= fmt.list(q.rumors()) %>', note: 'a, b và c' },
  { label: 'fmt.table(rows)', insert: '<%= fmt.table(history) %>', note: 'bảng canh cột' },
  { label: 'fmt.pct(n)', insert: '<%= fmt.pct(18) %>', note: '18%' },
  { label: 'fmt.approx(n)', insert: '<%= fmt.approx(9143) %>', note: 'BẮT BUỘC cho mọi số cấp lãnh thổ' },
];

const MACROS: readonly Reference[] = [
  { label: '{{user}}', insert: '{{user}}', note: 'tên người chơi' },
  { label: '{{char}}', insert: '{{char}}', note: 'NPC đang đối thoại' },
  { label: '{{time}}', insert: '{{time}}', note: 'giờ trong game' },
  { label: '{{date}}', insert: '{{date}}', note: 'ngày trong game' },
  { label: '{{weekday}}', insert: '{{weekday}}', note: 'thứ trong tuần' },
  { label: '{{lastMessage}}', insert: '{{lastMessage}}', note: 'đoạn văn lượt trước' },
  { label: '{{random:a,b,c}}', insert: '{{random:a,b,c}}', note: 'seeded, cache theo lượt' },
  { label: '{{roll:2d6+1}}', insert: '{{roll:2d6+1}}', note: 'seeded, cache theo lượt' },
  { label: '{{pick:a,b,c}}', insert: '{{pick:a,b,c}}', note: 'seeded, cache theo lượt' },
  { label: '{{getvar::x}}', insert: '{{getvar::x}}', note: 'đọc biến NHÁP' },
  { label: '{{setvar::x::y}}', insert: '{{setvar::x::y}}', note: 'ghi biến NHÁP, xóa mỗi lần lắp' },
  {
    label: '{{getvar::@state.…}}',
    insert: '{{getvar::@state.character.stats.str}}',
    note: 'đọc state game — ghi thì LỖI CỨNG',
  },
  { label: '{{// ghi chú }}', insert: '{{// ghi chú }}', note: 'chú thích, không in ra' },
  { label: '{{trim}}', insert: '{{trim}}', note: 'dọn khoảng trắng quanh chỗ này' },
  { label: '{{noop}}', insert: '{{noop}}', note: 'không làm gì' },
  { label: '{{newline}}', insert: '{{newline}}', note: 'xuống dòng' },
  { label: '{{original}}', insert: '{{original}}', note: 'nội dung khối trước khi bị ghi đè' },
];

function ReferenceGroup({
  title,
  items,
  onInsert,
}: {
  title: string;
  items: readonly Reference[];
  onInsert(text: string): void;
}): ReactNode {
  return (
    <details className="rounded border border-oak-light bg-ink/40">
      <summary className="cursor-pointer px-2 py-1 text-xs tracking-[0.15em] text-brass uppercase">{title}</summary>
      <ul className="flex flex-col px-1 pb-1">
        {items.map((item) => {
          const pending = PENDING_QUERIES[item.label.replace(/\(.*$/, '').replace(/^q\./, '')];
          return (
            <li key={item.label}>
              <button
                type="button"
                onClick={() => onInsert(item.insert)}
                title={pending === undefined ? item.note : `Chưa có — ${pending}`}
                className="flex w-full items-baseline gap-2 rounded px-1 py-0.5 text-left text-[11px] hover:bg-oak-light"
              >
                <code className={pending === undefined ? 'text-vellum' : 'text-vellum/40 line-through'}>
                  {item.label}
                </code>
                <span className="min-w-0 flex-1 truncate text-vellum/40">{pending ?? item.note}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </details>
  );
}

export function BlockEditor({ blockId, onClose }: { blockId: string; onClose(): void }): ReactNode {
  const block = usePromptStore((state) => state.blocks.find((candidate) => candidate.id === blockId));
  if (block === undefined) return null;
  return <EditorBody key={blockId} block={block} onClose={onClose} />;
}

function EditorBody({ block, onClose }: { block: PromptBlock; onClose(): void }): ReactNode {
  const store = usePromptStore.getState();
  const editor = useRef<CodeEditorHandle | null>(null);
  const preview = usePromptPreview([block]);
  const rendered = preview.prompt?.blocks[0];
  const isDefault = restoreDefault([block], block.id)[0]?.template === block.template;

  const patch = (change: Partial<Omit<PromptBlock, 'id' | 'locked'>>): void => {
    store.update(block.id, change);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex items-center gap-2">
        <TextInput value={block.name} onChange={(event) => patch({ name: event.target.value })} />
        {block.locked && <span className="shrink-0 text-brass" title="Khối [LOCKED]">🔒</span>}
        <Button onClick={onClose}>Đóng</Button>
      </div>

      <div className="grid grid-cols-4 gap-2">
        <Field label="Vai">
          <Select
            value={block.role}
            disabled={block.locked}
            onChange={(event) => patch({ role: event.target.value as PromptBlock['role'] })}
          >
            <option value="system">system</option>
            <option value="user">user</option>
            <option value="assistant">assistant</option>
          </Select>
        </Field>
        <Field label="Chèn theo độ sâu">
          <TextInput
            type="number"
            min={0}
            disabled={block.locked}
            value={block.placement === 'sequential' ? '' : block.placement.depth}
            placeholder="tuần tự"
            onChange={(event) =>
              patch({
                placement: event.target.value === '' ? 'sequential' : { depth: Number(event.target.value) },
              })
            }
          />
        </Field>
        <Field label="Ưu tiên ngân sách" hint={block.budgetPriority === 10 ? 'không bao giờ bị cắt' : undefined}>
          <TextInput
            type="number"
            min={1}
            max={10}
            disabled={block.locked}
            value={block.budgetPriority}
            onChange={(event) => patch({ budgetPriority: Math.max(1, Math.min(10, Number(event.target.value))) })}
          />
        </Field>
        <Field label="Điều kiện (EJS)" hint="sai thì bỏ khối">
          <TextInput
            value={block.condition ?? ''}
            placeholder="lore.length > 0"
            onChange={(event) => patch({ condition: event.target.value })}
          />
        </Field>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[1fr_16rem] gap-2">
        <div className="flex min-h-0 flex-col gap-2">
          <CodeEditor
            value={block.template}
            handle={editor}
            height="18rem"
            onChange={(value) => patch({ template: value })}
          />

          {rendered !== undefined && rendered.error !== null && (
            <Warning level="warn">
              {rendered.error.line === null ? '' : `dòng ${rendered.error.line}: `}
              {rendered.error.message}
            </Warning>
          )}
          {rendered?.macroIssues.map((issue, index) => (
            <Warning key={index} level={issue.level === 'loi' ? 'warn' : 'info'}>
              {issue.macro}: {issue.message}
            </Warning>
          ))}

          <div className="min-h-0 flex-1 overflow-auto rounded border border-oak-light bg-ink/60 p-2">
            <p className="mb-1 text-xs tracking-[0.2em] text-brass uppercase">
              Xem trước {rendered === undefined ? '' : `· ${rendered.tokens} token`}
              {rendered === undefined || rendered.skipped === null ? '' : ` · ${rendered.skipped}`}
            </p>
            <pre className="text-[11px] whitespace-pre-wrap text-vellum/80">{rendered?.text ?? ''}</pre>
          </div>

          <div className="flex gap-2">
            <Button onClick={() => store.restore(block.id)} disabled={isDefault}>
              Khôi phục khối này về mặc định
            </Button>
          </div>
        </div>

        <div className="flex min-h-0 flex-col gap-1 overflow-y-auto">
          <ReferenceGroup title="Biến" items={LOCALS} onInsert={(text) => editor.current?.insert(text)} />
          <ReferenceGroup title="Hàm q" items={QUERIES} onInsert={(text) => editor.current?.insert(text)} />
          <ReferenceGroup title="Hàm fmt" items={FORMATS} onInsert={(text) => editor.current?.insert(text)} />
          <ReferenceGroup title="Macro" items={MACROS} onInsert={(text) => editor.current?.insert(text)} />
          <p className="px-1 text-[11px] text-vellum/40">
            Thẻ: <code>{'<% %>'}</code> chạy lệnh · <code>{'<%= %>'}</code> in ra ·{' '}
            <code>{'<%- %>'}</code> in thô · <code>{'-%>'}</code> nuốt một dòng trống.
          </p>
        </div>
      </div>
    </div>
  );
}

/** Danh sách khối để chọn nhanh trong editor toàn màn hình. */
export function BlockPicker({ current, onPick }: { current: string; onPick(id: string): void }): ReactNode {
  const blocks = usePromptStore((state) => state.blocks);
  return (
    <select
      value={current}
      onChange={(event) => onPick(event.target.value)}
      className="rounded border border-oak-light bg-ink px-2 py-1 text-xs text-parchment"
    >
      {sortBlocks(blocks).map((block) => (
        <option key={block.id} value={block.id}>
          {block.name}
        </option>
      ))}
    </select>
  );
}
