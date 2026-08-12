/**
 * Danh sách khối kéo thả (Phần 3 mục 10).
 *
 * Mỗi dòng: `[☰ kéo] [✓ bật] [tên] [role] [depth] [số token] [⚙ sửa]`.
 *
 * Khối [LOCKED] hiện ổ khóa, KHÔNG kéo được, KHÔNG tắt được, và cũng không
 * nhận thả — chặn ở cả ba lớp: thuộc tính `draggable`, `disabled` của ô tick,
 * và các hàm thuần trong `ai/blocks.ts`. Ẩn nút thôi thì chưa đủ, vì mục 4 nói
 * rõ UI phải chặn cứng.
 */

import { useState, type ReactNode } from 'react';
import { sortBlocks, type PromptBlock } from '@/ai/blocks';
import { priorityColor } from '@/ai/budget';
import { usePromptStore } from '@/state/prompts';

interface BlockListProps {
  /** Số token của từng khối sau khi render. */
  tokens: Readonly<Record<string, number>>;
  /** Vì sao khối không vào prompt lần lắp gần nhất. */
  skipped: Readonly<Record<string, string>>;
  onEdit(id: string): void;
  compact?: boolean;
}

export function BlockList({ tokens, skipped, onEdit, compact = false }: BlockListProps): ReactNode {
  const blocks = usePromptStore((state) => state.blocks);
  const store = usePromptStore.getState();
  const [dragging, setDragging] = useState<string | null>(null);

  return (
    <ul className="flex flex-col gap-1">
      {sortBlocks(blocks).map((block, index) => (
        <li
          key={block.id}
          draggable={!block.locked}
          onDragStart={() => setDragging(block.id)}
          onDragOver={(event) => {
            if (dragging !== null && !block.locked) event.preventDefault();
          }}
          onDrop={() => {
            if (dragging !== null) store.move(dragging, index);
            setDragging(null);
          }}
          onDragEnd={() => setDragging(null)}
          className={`flex items-center gap-2 rounded border px-2 py-1 text-xs ${
            block.locked
              ? 'border-brass/50 bg-brass/5'
              : 'cursor-grab border-oak-light bg-ink/40 hover:border-vellum/40'
          } ${block.enabled ? '' : 'opacity-45'}`}
        >
          <span className="text-vellum/30" title={block.locked ? 'Khối [LOCKED] — không kéo được' : 'Kéo để đổi thứ tự'}>
            {block.locked ? '🔒' : '☰'}
          </span>

          <input
            type="checkbox"
            checked={block.enabled}
            disabled={block.locked}
            title={block.locked ? 'Khối [LOCKED] — không được tắt' : 'Bật/tắt khối'}
            onChange={(event) => store.toggle(block.id, event.target.checked)}
          />

          <span className="min-w-0 flex-1 truncate" title={`${block.id}${skipped[block.id] === undefined ? '' : ` — ${skipped[block.id] ?? ''}`}`}>
            {block.name}
          </span>

          {!compact && <span className="text-vellum/40">{block.role}</span>}

          {block.placement !== 'sequential' && (
            <span className="text-vellum/40" title="Chèn ngược từ cuối">
              d{block.placement.depth}
            </span>
          )}

          <span
            className="inline-block h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: priorityColor(block.budgetPriority) }}
            title={`Ưu tiên ngân sách ${block.budgetPriority}${block.budgetPriority === 10 ? ' — không bao giờ bị cắt' : ''}`}
          />

          <span className="w-14 text-right text-vellum/50 tabular-nums" title="Token sau khi render">
            {skipped[block.id] === undefined ? `${tokens[block.id] ?? 0}` : '—'}
          </span>

          <button
            type="button"
            onClick={() => onEdit(block.id)}
            title="Sửa template"
            className="rounded px-1 text-vellum/60 hover:bg-oak-light hover:text-brass"
          >
            ⚙
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Thanh ngân sách trực quan: mỗi khối một dải, nhìn ra ngay ai ăn hết token. */
export function BudgetBar({
  blocks,
  tokens,
  limit,
}: {
  blocks: readonly PromptBlock[];
  tokens: Readonly<Record<string, number>>;
  limit: number;
}): ReactNode {
  const used = Object.values(tokens).reduce((sum, value) => sum + value, 0);
  const scale = Math.max(used, limit);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex h-3 w-full overflow-hidden rounded border border-oak-light bg-ink">
        {sortBlocks(blocks).map((block) => {
          const value = tokens[block.id] ?? 0;
          if (value === 0) return null;
          return (
            <span
              key={block.id}
              title={`${block.name}: ${value} token (ưu tiên ${block.budgetPriority})`}
              style={{ width: `${(value / scale) * 100}%`, backgroundColor: priorityColor(block.budgetPriority) }}
            />
          );
        })}
      </div>
      <p className={`text-xs ${used > limit ? 'text-red-300' : 'text-vellum/50'}`}>
        {used} / {limit} token{used > limit ? ' — vượt ngân sách' : ''}
      </p>
    </div>
  );
}
