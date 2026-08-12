/**
 * Màn Cài đặt ở cột trái của shell (Phần 1 mục 7, Phần 3 mục 10).
 * [Kết nối chính] [Mô phỏng ngầm] [Cập nhật biến] [Preset] [Khối prompt] …
 *
 * Nút thu gọn nằm ở đây chứ không ở `AppShell`: bảng này chiếm 384px cố định
 * trên một layout ba cột, và ở màn hình 1366px thì phần diễn biến — thứ người
 * chơi thật sự đọc — chỉ còn hơn một nửa màn hình.
 */

import { useEffect, useState, type ReactNode } from 'react';
import { useSettingsStore } from '@/state/settings';
import { LorebookTab } from '@/ui/lore/LorebookTab';
import { PromptManagerTab } from '@/ui/prompts/PromptManagerTab';
import { ConnectionTab } from './ConnectionTab';
import { PresetTab } from './PresetTab';
import { RegexTab } from './RegexTab';
import { ScriptTab } from './ScriptTab';
import { StorageTab } from './StorageTab';
import { DebugTab } from './DebugTab';
import { VariablesTab } from './VariablesTab';
import { CodexTab } from '@/ui/codex';

const TABS = [
  { id: 'main', label: 'Kết nối chính' },
  { id: 'worldtick', label: 'Mô phỏng ngầm' },
  { id: 'varconn', label: 'Cập nhật biến' },
  { id: 'preset', label: 'Preset' },
  { id: 'prompts', label: 'Khối prompt' },
  { id: 'lore', label: 'Lorebook' },
  { id: 'codex', label: 'Codex' },
  { id: 'regex', label: 'Regex' },
  { id: 'script', label: 'Script' },
  { id: 'variables', label: 'Biến' },
  { id: 'storage', label: 'Lưu trữ' },
  { id: 'debug', label: 'Debug' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export interface SettingsPanelProps {
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}

export function SettingsPanel({ collapsed = false, onToggleCollapsed }: SettingsPanelProps = {}): ReactNode {
  const [tab, setTab] = useState<TabId>('main');
  const loaded = useSettingsStore((state) => state.loaded);

  useEffect(() => {
    void useSettingsStore.getState().hydrate();
  }, []);

  // Thu gọn: chỉ còn một dải dọc đủ rộng cho cái nút mở lại. KHÔNG tháo
  // component ra khỏi cây — tháo ra là mất hết state cục bộ của mọi tab, và
  // người chơi mở lại sẽ thấy mình quay về tab đầu tiên với mọi ô lọc trống.
  if (collapsed) {
    return (
      <div className="flex h-full flex-col items-center gap-3 py-3">
        <button
          type="button"
          onClick={onToggleCollapsed}
          title="Mở lại bảng cài đặt"
          aria-label="Mở lại bảng cài đặt"
          className="rounded border border-oak-light px-1.5 py-1 text-xs text-brass hover:bg-oak-light"
        >
          ▶
        </button>
        <span
          className="text-[10px] tracking-[0.3em] text-vellum/40 uppercase"
          style={{ writingMode: 'vertical-rl' }}
        >
          Cài đặt
        </span>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b border-oak-light px-4 py-3">
        <p className="text-xs tracking-[0.2em] text-brass uppercase">Cài đặt</p>
        {onToggleCollapsed !== undefined && (
          <button
            type="button"
            onClick={onToggleCollapsed}
            title="Thu gọn bảng cài đặt"
            aria-label="Thu gọn bảng cài đặt"
            className="rounded border border-oak-light px-1.5 py-0.5 text-xs text-vellum/60 hover:bg-oak-light hover:text-brass"
          >
            ◀
          </button>
        )}
      </div>

      <nav className="flex flex-wrap gap-1 border-b border-oak-light px-2 py-2">
        {TABS.map((candidate) => (
          <button
            key={candidate.id}
            type="button"
            onClick={() => setTab(candidate.id)}
            className={`rounded px-2 py-1 text-xs transition-colors ${
              tab === candidate.id ? 'bg-brass/20 text-brass' : 'text-vellum/60 hover:bg-oak-light'
            }`}
          >
            {candidate.label}
          </button>
        ))}
      </nav>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {!loaded && <p className="text-sm text-vellum/40 italic">Đang đọc cài đặt…</p>}
        {loaded && tab === 'main' && <ConnectionTab profile="main" />}
        {loaded && tab === 'worldtick' && <ConnectionTab profile="worldtick" />}
        {loaded && tab === 'varconn' && <ConnectionTab profile="variables" />}
        {loaded && tab === 'preset' && <PresetTab />}
        {loaded && tab === 'prompts' && <PromptManagerTab />}
        {loaded && tab === 'lore' && <LorebookTab />}
        {loaded && tab === 'codex' && <CodexTab />}
        {loaded && tab === 'regex' && <RegexTab />}
        {loaded && tab === 'script' && <ScriptTab />}
        {loaded && tab === 'variables' && <VariablesTab />}
        {loaded && tab === 'storage' && <StorageTab />}
        {loaded && tab === 'debug' && <DebugTab />}
      </div>
    </div>
  );
}
