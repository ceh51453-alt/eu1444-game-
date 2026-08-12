/**
 * Three-region layout, part 0 section 8.8: settings on the left, narrative in
 * the middle, status on the right.
 *
 * PART 0 SCOPE: layout only. The regions are deliberately near-empty — content
 * arrives from part 1 (settings), part 3 (narrative) and part 2 onward (status).
 */

import type { ReactNode } from 'react';

interface AppShellProps {
  settings: ReactNode;
  narrative: ReactNode;
  status: ReactNode;
  /** Cột cài đặt thu về một dải dọc; nội dung vẫn nằm trong cây React. */
  settingsCollapsed?: boolean;
}

export function AppShell({
  settings,
  narrative,
  status,
  settingsCollapsed = false,
}: AppShellProps): ReactNode {
  return (
    <div className="relative flex h-full min-h-0 w-full overflow-hidden bg-ink text-parchment">
      <aside
        aria-label="Cài đặt"
        className={`hidden shrink-0 flex-col overflow-hidden border-r border-oak-light bg-oak transition-[width] duration-150 lg:flex ${
          settingsCollapsed ? 'w-10' : 'w-96'
        }`}
      >
        {settings}
      </aside>

      <main aria-label="Diễn biến" className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {narrative}
      </main>

      <aside
        aria-label="Bảng trạng thái"
        className="hidden w-80 shrink-0 flex-col overflow-y-auto border-l border-oak-light bg-oak xl:flex"
      >
        {status}
      </aside>

    </div>
  );
}

interface PanelProps {
  title: string;
  children?: ReactNode;
}

/** Khung chung cho hai cột hai bên, để tiêu đề trông giống nhau. */
export function Panel({ title, children }: PanelProps): ReactNode {
  return (
    <section className="flex flex-col gap-3 border-b border-oak-light px-4 py-4 last:border-b-0">
      <h2 className="text-xs font-semibold tracking-[0.2em] text-brass uppercase">{title}</h2>
      {children}
    </section>
  );
}
