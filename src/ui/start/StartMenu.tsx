import { useState, type ReactNode } from 'react';
import { formatGameDate } from '@/core/clock';
import { useTurnStore } from '@/state/turn';
import { SettingsPanel } from '@/ui/settings/SettingsPanel';
import { Button, TextInput, Warning } from '@/ui/settings/controls';

export type StartMenuView = 'main' | 'saves' | 'settings';

export interface StartMenuProps {
  view: StartMenuView;
  canClose: boolean;
  onView(view: StartMenuView): void;
  onNewGame(): Promise<void>;
  onContinue(): Promise<void>;
  onPlayLoaded(): void;
  onClose(): void;
}

function MainMenu({
  canContinue,
  activeLabel,
  onNewGame,
  onContinue,
  onSaves,
  onSettings,
}: {
  canContinue: boolean;
  activeLabel: string;
  onNewGame(): void;
  onContinue(): void;
  onSaves(): void;
  onSettings(): void;
}): ReactNode {
  const itemClass =
    'start-menu-choice group flex w-full flex-col rounded border border-oak-light bg-oak/70 px-5 py-4 text-left transition hover:border-brass hover:bg-oak-light disabled:cursor-not-allowed disabled:opacity-35';
  return (
    <div className="start-menu-list mx-auto flex w-full max-w-lg flex-col gap-3">
      <button type="button" className={itemClass} onClick={onNewGame}>
        <span className="start-menu-choice-title text-base tracking-wide text-brass">Bắt đầu mới</span>
        <span className="start-menu-choice-note mt-1 text-xs text-vellum/50">Tạo một chiến dịch và nhân vật mới, không ghi đè save cũ.</span>
      </button>
      <button type="button" className={itemClass} onClick={onContinue} disabled={!canContinue}>
        <span className="start-menu-choice-title text-base tracking-wide text-brass">Tiếp tục</span>
        <span className="start-menu-choice-note mt-1 text-xs text-vellum/50">
          {canContinue ? `Trở lại ${activeLabel}.` : 'Chưa có ván chơi nào trên máy này.'}
        </span>
      </button>
      <button type="button" className={itemClass} onClick={onSaves}>
        <span className="start-menu-choice-title text-base tracking-wide text-brass">File save</span>
        <span className="start-menu-choice-note mt-1 text-xs text-vellum/50">Nạp, tạo bản sao, xóa, nhập hoặc xuất ván chơi.</span>
      </button>
      <button type="button" className={itemClass} onClick={onSettings}>
        <span className="start-menu-choice-title text-base tracking-wide text-brass">Cài đặt</span>
        <span className="start-menu-choice-note mt-1 text-xs text-vellum/50">Kết nối AI, preset, prompt, lorebook và lưu trữ.</span>
      </button>
    </div>
  );
}

function SaveFiles({ onPlayLoaded }: { onPlayLoaded(): void }): ReactNode {
  const slots = useTurnStore((state) => state.slots);
  const activeSlotId = useTurnStore((state) => state.activeSlotId);
  const store = useTurnStore.getState();
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (task: () => Promise<void>, success?: string): Promise<void> => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await task();
      if (success !== undefined) setMessage(success);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1">
      <div className="rounded border border-oak-light bg-oak/50 p-3">
        <p className="text-xs tracking-[0.2em] text-brass uppercase">Lưu ván hiện tại</p>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <TextInput
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="Tên file save mới"
            disabled={busy || slots.length === 0}
          />
          <Button
            variant="primary"
            disabled={busy || slots.length === 0}
            onClick={() => void run(async () => { await store.saveSlot(label); setLabel(''); }, 'Đã tạo file save mới.')}
          >
            Tạo file mới
          </Button>
          <Button
            disabled={busy || slots.length === 0}
            onClick={() => void run(() => store.saveCurrent(), 'Đã lưu file đang chơi.')}
          >
            Lưu ngay
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <p className="text-xs tracking-[0.2em] text-brass uppercase">Các file trên máy</p>
        <div className="flex gap-2">
          <Button
            disabled={busy || slots.length === 0}
            onClick={() => void run(async () => { setMessage(await store.exportSave()); })}
          >
            Xuất JSON
          </Button>
          <Button
            disabled={busy}
            onClick={() => void run(async () => { setMessage(await store.importSave()); onPlayLoaded(); })}
          >
            Nhập JSON
          </Button>
        </div>
      </div>

      {slots.length === 0 && (
        <p className="rounded border border-oak-light bg-ink/50 p-4 text-sm text-vellum/50 italic">
          Chưa có file save. Hãy bắt đầu một ván mới hoặc nhập file JSON.
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {slots.map((slot) => {
          const active = slot.id === activeSlotId;
          return (
            <li key={slot.id} className={`rounded border p-3 ${active ? 'border-brass bg-brass/5' : 'border-oak-light bg-oak/40'}`}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-sm text-parchment">
                    {slot.label}{active ? <span className="ml-2 text-xs text-brass">đang chơi</span> : null}
                  </p>
                  <p className="mt-1 text-xs text-vellum/45">
                    Lượt {slot.turn} · {formatGameDate(slot.gameDate)} · lưu {new Date(slot.updatedAt).toLocaleString('vi-VN')}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button
                    variant={active ? 'primary' : 'normal'}
                    disabled={busy}
                    onClick={() => void run(async () => { await store.loadSlot(slot.id); onPlayLoaded(); })}
                  >
                    {active ? 'Vào game' : 'Nạp'}
                  </Button>
                  <Button
                    variant="danger"
                    disabled={busy || active}
                    onClick={() => {
                      if (window.confirm(`Xóa file save “${slot.label}”? Thao tác này không thể hoàn tác.`)) {
                        void run(() => store.deleteSlot(slot.id), 'Đã xóa file save.');
                      }
                    }}
                  >
                    Xóa
                  </Button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {message !== null && <Warning level="info">{message}</Warning>}
      {error !== null && <Warning level="warn">{error}</Warning>}
    </div>
  );
}

export function StartMenu({
  view,
  canClose,
  onView,
  onNewGame,
  onContinue,
  onPlayLoaded,
  onClose,
}: StartMenuProps): ReactNode {
  const booted = useTurnStore((state) => state.booted);
  const slots = useTurnStore((state) => state.slots);
  const activeSlotId = useTurnStore((state) => state.activeSlotId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = slots.find((slot) => slot.id === activeSlotId) ?? slots[0];

  const launch = async (task: () => Promise<void>): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await task();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="start-menu-overlay fixed inset-0 z-[90] flex items-center justify-center bg-ink/95 px-4 py-6 text-parchment backdrop-blur-sm">
      <section className={`start-menu-panel flex max-h-full w-full flex-col overflow-hidden rounded border border-oak-light bg-ink shadow-2xl ${view === 'settings' ? 'start-menu-panel-wide max-w-6xl' : 'start-menu-panel-compact max-w-3xl'}`}>
        <header className="start-menu-header flex items-center justify-between border-b border-oak-light bg-oak/70 px-5 py-4">
          <div>
            <p className="start-menu-kicker text-xs tracking-[0.35em] text-brass uppercase">Châu Âu · 1444</p>
            <p className="start-menu-subtitle mt-1 text-xs text-vellum/45">Biên niên sử sống qua từng lần trở lại</p>
          </div>
          <div className="flex gap-2">
            {view !== 'main' && <Button onClick={() => onView('main')}>← Trở lại</Button>}
            {canClose && <Button onClick={onClose}>Đóng</Button>}
          </div>
        </header>

        <div className={`start-menu-content min-h-0 flex-1 ${view === 'settings' ? 'overflow-hidden' : 'start-menu-content-padded overflow-y-auto p-6'}`}>
          {!booted ? (
            <p className="py-16 text-center text-sm text-vellum/50 italic">Đang đọc dữ liệu đã lưu…</p>
          ) : view === 'settings' ? (
            <div className="h-[75vh] overflow-hidden bg-oak">
              <SettingsPanel />
            </div>
          ) : view === 'saves' ? (
            <SaveFiles onPlayLoaded={onPlayLoaded} />
          ) : (
            <MainMenu
              canContinue={slots.length > 0 && !busy}
              activeLabel={active?.label ?? 'ván gần nhất'}
              onNewGame={() => void launch(onNewGame)}
              onContinue={() => void launch(onContinue)}
              onSaves={() => onView('saves')}
              onSettings={() => onView('settings')}
            />
          )}
          {error !== null && <div className="mx-auto mt-4 max-w-lg"><Warning level="warn">{error}</Warning></div>}
        </div>
      </section>
    </div>
  );
}
