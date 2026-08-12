/**
 * Tab "Biến" — trình xem biến (Phần 2 mục 9).
 *
 * Cây state đầy đủ, gấp/mở được, tìm theo path. Mỗi node hiện giá trị, kiểu và
 * QUYỀN GHI — vì quyền ghi là thứ quyết định vì sao một đề xuất của AI bị từ
 * chối, và không nhìn thấy nó thì người chơi không hiểu chuyện gì xảy ra.
 */

import { useMemo, useState, type ReactNode } from 'react';
import { computeDerived, DERIVED_NAMESPACE, recomputeAll } from '@/state/derived';
import { applyPatch } from '@/state/mvu';
import { permissionFor, slices, type Permission } from '@/state/slices';
import { useGameStore } from '@/state/store';
import { Button, TextInput } from './controls';

const PERMISSION_STYLE: Record<Permission, { label: string; className: string }> = {
  engine: { label: 'engine', className: 'text-red-300' },
  ai: { label: 'ai', className: 'text-emerald-300' },
  locked: { label: 'locked', className: 'text-vellum/40' },
};

function typeOf(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return `array[${value.length}]`;
  return typeof value;
}

function preview(value: unknown): string {
  if (typeof value === 'string') return `"${value}"`;
  if (value === undefined) return '—';
  try {
    const text = JSON.stringify(value);
    return text === undefined ? String(value) : text.length > 60 ? `${text.slice(0, 60)}…` : text;
  } catch {
    return String(value);
  }
}

interface NodeProps {
  path: string;
  label: string;
  value: unknown;
  depth: number;
  filter: string;
  changed: ReadonlySet<string>;
  onEdit: (path: string, current: unknown) => void;
}

function isBranch(value: unknown): boolean {
  return typeof value === 'object' && value !== null;
}

function StateNode({ path, label, value, depth, filter, changed, onEdit }: NodeProps): ReactNode {
  const [open, setOpen] = useState(depth < 2);
  const branch = isBranch(value);
  const permission = permissionFor(path);
  const style = PERMISSION_STYLE[permission];

  const matches = filter === '' || path.toLowerCase().includes(filter.toLowerCase());
  const childEntries = branch
    ? Object.entries(value as Record<string, unknown>).map(([key, child]) => ({
        key,
        child,
        path: `${path}.${key}`,
      }))
    : [];
  const childMatches =
    filter !== '' && branch
      ? childEntries.some((entry) => entry.path.toLowerCase().includes(filter.toLowerCase()))
      : false;

  if (!matches && !childMatches) return null;

  return (
    <li>
      <div
        className={`flex items-center gap-2 rounded px-1 py-0.5 text-xs ${
          changed.has(path) ? 'bg-amber-500/20' : ''
        }`}
        style={{ paddingLeft: `${depth * 10}px` }}
      >
        {branch ? (
          <button
            type="button"
            className="w-3 shrink-0 text-vellum/50 hover:text-brass"
            onClick={() => setOpen((previous) => !previous)}
          >
            {open ? '▾' : '▸'}
          </button>
        ) : (
          <span className="w-3 shrink-0" />
        )}

        <span className="truncate text-vellum" title={path}>
          {label}
        </span>
        <span className="shrink-0 text-vellum/30">{typeOf(value)}</span>
        {!branch && <span className="truncate font-mono text-parchment">{preview(value)}</span>}
        <span className={`ml-auto shrink-0 ${style.className}`} title={`quyền ghi: ${permission}`}>
          {style.label}
        </span>
        {!branch && (
          <button
            type="button"
            className="shrink-0 text-vellum/40 hover:text-brass"
            title="Sửa tay (chế độ debug)"
            onClick={() => onEdit(path, value)}
          >
            ✎
          </button>
        )}
      </div>

      {branch && open && (
        <ul>
          {childEntries.map((entry) => (
            <StateNode
              key={entry.path}
              path={entry.path}
              label={entry.key}
              value={entry.child}
              depth={depth + 1}
              filter={filter}
              changed={changed}
              onEdit={onEdit}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

export function VariablesTab(): ReactNode {
  // KHÔNG dùng `useGameStore(store => store.snapshot())`: selector đó tạo object
  // mới mỗi lần render, nên React coi state luôn thay đổi và lặp vô hạn.
  // Lấy nguyên store (identity chỉ đổi khi state đổi thật) rồi chụp trong useMemo.
  const store = useGameStore();
  const state = useMemo(() => store.snapshot(), [store]);
  const [filter, setFilter] = useState('');
  const [changed, setChanged] = useState<ReadonlySet<string>>(new Set());
  const [editing, setEditing] = useState<{ path: string; text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recomputedAt, setRecomputedAt] = useState<number | null>(null);

  const derived = useMemo(() => {
    try {
      return computeDerived(state, { strict: false });
    } catch (cause) {
      return { _loi: String(cause) };
    }
  }, [state]);

  const derivedSpecs = useMemo(() => slices.derived(), []);

  const commitEdit = (): void => {
    if (editing === null) return;
    setError(null);
    let value: unknown;
    try {
      value = JSON.parse(editing.text);
    } catch {
      value = editing.text; // để người chơi gõ chuỗi trần
    }

    // Sửa tay là actor 'player' và bỏ qua B2/B6 — nhưng B5 thì không bao giờ.
    const result = applyPatch(
      state,
      [{ op: 'set', path: editing.path, to: value, reason: 'sửa tay ở tab Biến', source: 'json' }],
      { actor: 'player', skipPermissions: true, skipBounds: true },
    );

    if (!result.applied) {
      setError(result.failures.map((failure) => `${failure.step}: ${failure.message}`).join('\n'));
      return;
    }
    useGameStore.getState().commitBatch(result.next!);
    setChanged(new Set(result.changedPaths));
    setEditing(null);
  };

  return (
    <div className="flex flex-col gap-3">
      <TextInput
        value={filter}
        placeholder="tìm theo path, ví dụ character.stats"
        onChange={(event) => setFilter(event.target.value)}
      />

      <div className="flex flex-wrap gap-2">
        <Button
          onClick={() => {
            recomputeAll(state);
            setRecomputedAt(Date.now());
          }}
        >
          Tính lại toàn bộ biến phụ
        </Button>
        <Button onClick={() => setChanged(new Set())} disabled={changed.size === 0}>
          Xóa đánh dấu
        </Button>
      </div>
      {recomputedAt !== null && (
        <p className="text-xs text-vellum/40">
          Đã tính lại lúc {new Date(recomputedAt).toLocaleTimeString()}.
        </p>
      )}

      {editing !== null && (
        <div className="flex flex-col gap-2 rounded border border-brass/50 bg-brass/5 p-2">
          <p className="text-xs text-brass">Sửa tay: {editing.path}</p>
          <p className="text-xs text-vellum/50">
            Chế độ debug. Bỏ qua quyền ghi và ràng buộc phạm vi, nhưng KHÔNG bỏ qua kiểm kiểu.
          </p>
          <TextInput
            value={editing.text}
            onChange={(event) => setEditing({ ...editing, text: event.target.value })}
          />
          <div className="flex gap-2">
            <Button variant="primary" onClick={commitEdit}>
              Áp dụng
            </Button>
            <Button onClick={() => { setEditing(null); setError(null); }}>Hủy</Button>
          </div>
          {error !== null && (
            <pre className="text-xs whitespace-pre-wrap text-red-300">{error}</pre>
          )}
        </div>
      )}

      <div className="rounded border border-oak-light bg-ink/60 p-2">
        <p className="mb-1 text-xs tracking-[0.2em] text-brass uppercase">State</p>
        <ul>
          {Object.entries(state).map(([key, value]) => (
            <StateNode
              key={key}
              path={key}
              label={key}
              value={value}
              depth={0}
              filter={filter}
              changed={changed}
              onEdit={(path, current) =>
                setEditing({ path, text: typeof current === 'string' ? current : JSON.stringify(current) })
              }
            />
          ))}
        </ul>
      </div>

      <div className="rounded border border-oak-light bg-ink/60 p-2">
        <p className="mb-1 text-xs tracking-[0.2em] text-brass uppercase">
          Biến phụ · luôn quyền engine, AI không bao giờ ghi được
        </p>
        <ul className="flex flex-col gap-0.5">
          {derivedSpecs.map((spec) => (
            <li key={spec.id} className="flex items-center gap-2 text-xs">
              <span className="text-sky-300" title={`deps: ${spec.deps.join(', ')}`}>
                {DERIVED_NAMESPACE}.{spec.id}
              </span>
              <span className="font-mono text-parchment">{preview(derived[spec.id])}</span>
              <span className="ml-auto truncate text-vellum/30" title={spec.deps.join(', ')}>
                {spec.deps.length} deps
              </span>
            </li>
          ))}
          {derivedSpecs.length === 0 && <li className="text-xs text-vellum/30">chưa có biến phụ nào</li>}
        </ul>
      </div>
    </div>
  );
}
