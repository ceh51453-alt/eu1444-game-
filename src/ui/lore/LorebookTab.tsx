/**
 * Tab "Lorebook" trong Cài đặt (Phần 4 mục 11).
 *
 * Bản gọn: danh sách sách, bật/tắt, và lý do sách đang tự bật. Ba cột với panel
 * giải thích nằm ở bản toàn màn hình — cột Cài đặt chỉ rộng 24rem, mà panel
 * "vì sao entry bị loại" thì cần đọc được cả câu.
 */

import { useEffect, useState, type ReactNode } from 'react';
import { regionName } from '@/lore/regions';
import { useLorebookStore } from '@/state/lorebooks';
import { useTurnStore } from '@/state/turn';
import { Button } from '@/ui/settings/controls';
import { LorebookManager, LorebookWarnings, useCurrentRegion } from './LorebookManager';

export function LorebookTab(): ReactNode {
  const books = useLorebookStore((state) => state.books);
  const loaded = useLorebookStore((state) => state.loaded);
  const store = useLorebookStore.getState();
  const pass = useTurnStore((state) => state.lore);
  const region = useCurrentRegion();
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    void useLorebookStore.getState().hydrate();
  }, []);

  if (!loaded) return <p className="text-sm text-vellum/40 italic">Đang nạp lorebook…</p>;

  const active = pass.books.filter((book) => book.active);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Button variant="primary" onClick={() => setFullscreen(true)}>
          Mở Lorebook
        </Button>
        <span className="text-xs text-vellum/40">
          {books.length} sách · {books.reduce((sum, book) => sum + book.entries.length, 0)} entry
        </span>
      </div>

      {pass.books.length > 0 && (
        <p className="text-xs text-vellum/60">
          {active.length} sách đang bật
          {region === '' ? '.' : ` vì bạn đang ở ${regionName(region)}.`}
        </p>
      )}

      <LorebookWarnings />

      <ul className="flex flex-col gap-1">
        {books.map((book) => {
          const status = pass.books.find((item) => item.bookId === book.id);
          return (
            <li
              key={book.id}
              className={`flex flex-col gap-0.5 rounded border px-2 py-1 text-xs ${
                status?.active === true ? 'border-brass/50 bg-brass/5' : 'border-oak-light bg-ink/40'
              }`}
            >
              <span className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={book.enabled}
                  title={book.enabled ? 'Tắt sách này' : 'Bật sách này'}
                  onChange={(event) => store.patch(book.id, { enabled: event.target.checked })}
                />
                <span className="min-w-0 flex-1 truncate">{book.name}</span>
                <span className="text-vellum/40">{book.entries.length}</span>
                <button
                  type="button"
                  title="Mở trong trình quản lý"
                  className="rounded px-1 text-vellum/60 hover:bg-oak-light hover:text-brass"
                  onClick={() => {
                    store.select(book.id);
                    setFullscreen(true);
                  }}
                >
                  ⚙
                </button>
              </span>
              <span className="text-[11px] text-vellum/40">
                {book.scope.kind}
                {book.scope.refId === undefined || book.scope.refId === '' ? '' : `: ${book.scope.refId}`}
                {status === undefined ? '' : ` — ${status.reason}`}
              </span>
            </li>
          );
        })}
      </ul>

      {pass.decisions.length > 0 && (
        <p className="text-xs text-vellum/50">
          Lượt gần nhất: chèn {pass.items.length + pass.depthBlocks.length} mục ({pass.used}/{pass.limit} token),
          xét {pass.decisions.length} entry
          {pass.fired.length === 0 ? '' : `, bắn ${pass.fired.length} event`}
          {pass.deferred.length === 0 ? '' : `, hoãn ${pass.deferred.length}`}.
        </p>
      )}

      {fullscreen && <LorebookManager onClose={() => setFullscreen(false)} />}
    </div>
  );
}
