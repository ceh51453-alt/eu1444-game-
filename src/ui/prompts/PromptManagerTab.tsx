/**
 * Tab "Khối prompt" trong Cài đặt (Phần 3 mục 10).
 *
 * Bản gọn: kéo thả, bật/tắt, thanh ngân sách, số token từng khối. Panel xem
 * trước và editor nằm ở bản toàn màn hình vì cột này chỉ rộng 24rem.
 */

import { useEffect, useState, type ReactNode } from 'react';
import { usePromptStore } from '@/state/prompts';
import { Button } from '@/ui/settings/controls';
import { BlockList, BudgetBar } from './BlockList';
import { BlockToolbar, BlockWarnings, BudgetSettings, PromptManager } from './PromptManager';
import { usePromptPreview } from './usePreview';

export function PromptManagerTab(): ReactNode {
  const blocks = usePromptStore((state) => state.blocks);
  const loaded = usePromptStore((state) => state.loaded);
  const store = usePromptStore.getState();
  const preview = usePromptPreview();
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    void usePromptStore.getState().hydrate();
  }, []);

  if (!loaded) return <p className="text-sm text-vellum/40 italic">Đang nạp khối prompt…</p>;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Button variant="primary" onClick={() => setFullscreen(true)}>
          Mở Prompt Manager
        </Button>
        <span className="text-xs text-vellum/40">{blocks.length} khối</span>
      </div>

      <BlockToolbar />
      <BudgetSettings />
      <BlockWarnings />
      <BudgetBar blocks={blocks} tokens={preview.tokens} limit={preview.prompt?.limit ?? 0} />

      <BlockList
        compact
        tokens={preview.tokens}
        skipped={preview.skipped}
        onEdit={(id) => {
          store.setEditing(id);
          setFullscreen(true);
        }}
      />

      {fullscreen && <PromptManager onClose={() => setFullscreen(false)} />}
    </div>
  );
}
