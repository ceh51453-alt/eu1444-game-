/**
 * UI QUẢN LÝ LOREBOOK (Phần 4 mục 11).
 *
 * Ba cột và một panel dưới. Panel dưới — "vì sao entry này được chèn / bị loại"
 * — là thứ mục 11 gọi là công cụ debug quan trọng nhất của cả phần, và mục 14
 * đòi phải đưa ra được một ca bị loại ở L5. Nó hiện KẾT QUẢ TỪNG LỚP chứ không
 * chỉ hiện kết luận: biết entry bị loại thì vô dụng, biết nó bị loại ở L3 vì
 * đang đứng sai tỉnh thì sửa được ngay.
 */

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { LORE_LAYER_NAMES, type LoreDecision } from '@/lore/types';
import { countByLayer } from '@/lore/scanner';
import { allRegions, regionName } from '@/lore/regions';
import { setFactionOp, setRegionOp } from '@/lore/knowledge';
import { duplicateIds } from '@/lore/lorebook';
import nationsFile from '@data/nations.json';
import { applyPatch } from '@/state/mvu';
import { useLorebookStore } from '@/state/lorebooks';
import { useTurnStore } from '@/state/turn';
import { useGameStore } from '@/state/store';
import { Button, Field, Select, TextInput, Warning } from '@/ui/settings/controls';
import { EntryForm } from './EntryForm';

/**
 * Vùng nhân vật đang đứng, lấy thẳng từ slice `knowledge`.
 *
 * Chọn đúng một chuỗi chứ không chọn cả store: chọn cả store là component vẽ
 * lại sau mỗi lần bất kỳ biến nào đổi, mà cột này thì đứng cạnh một form đang
 * được gõ.
 */
export function useCurrentRegion(): string {
  return useGameStore((state) => (state['knowledge'] as { regionId?: string } | undefined)?.regionId ?? '');
}

export function useCurrentFaction(): string {
  return useGameStore((state) => (state['knowledge'] as { factionId?: string } | undefined)?.factionId ?? '');
}

interface NationRow {
  id: string;
  name: string;
  canon?: boolean;
}

const NATIONS: readonly NationRow[] = ((nationsFile as { nations?: NationRow[] }).nations ?? []).filter(
  (nation) => typeof nation.id === 'string',
);

/**
 * "Nhân vật đang ở đâu" và "đang thuộc phe nào".
 *
 * Hai giá trị này quyết định lớp L3, quyết định sách nào tự bật ở L1, và quyết
 * định biến thể nào được chọn — tức là ba trong số những thứ khó đoán nhất của
 * Phần 4. Trước đây chúng chỉ đặt được bằng cách gõ tay vào tab Biến, nên phần
 * lớn người dùng không bao giờ đặt, và rồi kết luận rằng entry gắn vùng "bị
 * hỏng". Đặt ngay cạnh panel giải thích thì sửa một cái là thấy hậu quả liền.
 *
 * Ghi qua MVU với actor 'engine' như mọi đường ghi khác (R2) — UI không có cửa
 * riêng vào state.
 */
function ViTriVaPhe(): ReactNode {
  const regionId = useCurrentRegion();
  const factionId = useCurrentFaction();
  const [error, setError] = useState<string | null>(null);

  const apply = (op: ReturnType<typeof setRegionOp>): void => {
    if (op === null) return;
    const result = applyPatch(useGameStore.getState().snapshot(), [op], { actor: 'engine' });
    if (!result.applied) {
      setError(result.failures.map((failure) => `${failure.step}: ${failure.message}`).join('\n'));
      return;
    }
    setError(null);
    useGameStore.getState().commitBatch(result.next!);
  };

  const regions = allRegions();
  const order = { continent: 0, realm: 1, province: 2, settlement: 3 } as const;

  return (
    <div className="flex flex-wrap items-end gap-2">
      <Field label="Nhân vật đang ở" hint="lớp L3 và sách kind 'region' đọc ô này">
        <Select
          value={regionId}
          onChange={(event) => apply(setRegionOp(useGameStore.getState().snapshot(), event.target.value))}
        >
          <option value="">— chưa biết đang ở đâu —</option>
          {[...regions]
            .sort((left, right) => order[left.kind] - order[right.kind] || left.name.localeCompare(right.name))
            .map((region) => (
              <option key={region.id} value={region.id}>
                {'· '.repeat(order[region.kind])}
                {region.name}
              </option>
            ))}
        </Select>
      </Field>
      <Field label="Phe hiện tại" hint="sách kind 'nation'/'faction' và variants đọc ô này">
        <Select
          value={factionId}
          onChange={(event) => apply(setFactionOp(useGameStore.getState().snapshot(), event.target.value))}
        >
          <option value="">— chưa thuộc phe nào —</option>
          {NATIONS.map((nation) => (
            <option key={nation.id} value={nation.id}>
              {nation.name}
              {nation.canon === false ? ' (ngoài tám thế lực)' : ''}
            </option>
          ))}
        </Select>
      </Field>
      {error !== null && <Warning level="warn">{error}</Warning>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Panel giải thích (mục 11)
// ---------------------------------------------------------------------------

function LayerRow({ decision }: { decision: LoreDecision }): ReactNode {
  return (
    <div className="border-t border-oak-light py-1">
      <p className="flex items-baseline gap-2">
        <span className={decision.outcome === 'loại' ? 'text-red-300' : 'text-emerald-300'}>
          {decision.outcome === 'loại' ? '✗' : '✓'}
        </span>
        <span className="text-parchment">{decision.title}</span>
        <code className="text-vellum/40">{decision.entryId}</code>
        <span className="text-vellum/40">· {decision.bookName}</span>
        {decision.pulledBy !== undefined && (
          <span className="text-brass">· kéo từ {decision.pulledBy}</span>
        )}
        {decision.depth > 0 && <span className="text-brass">· đệ quy sâu {decision.depth}</span>}
        <span className="flex-1" />
        <span className="text-vellum/50">
          {decision.outcome} · {decision.score.toFixed(1)} điểm · {decision.tokens} token
        </span>
      </p>
      <ul className="mt-0.5 ml-5 flex flex-col gap-0.5">
        {decision.layers.map((layer, index) => (
          <li key={index} className={layer.passed ? 'text-vellum/50' : 'text-amber-300'}>
            {layer.passed ? '·' : '✗'} {LORE_LAYER_NAMES[layer.layer]} — {layer.reason}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ExplainPanel({ decisions }: { decisions: readonly LoreDecision[] }): ReactNode {
  const [filter, setFilter] = useState<'tất cả' | 'chèn' | 'loại'>('tất cả');
  const counts = useMemo(() => countByLayer(decisions), [decisions]);

  const shown = decisions.filter((decision) => {
    if (filter === 'chèn') return decision.outcome !== 'loại';
    if (filter === 'loại') return decision.outcome === 'loại';
    return true;
  });

  return (
    <div className="flex min-h-0 flex-col gap-1">
      <div className="flex items-center gap-2">
        <p className="text-xs tracking-[0.2em] text-brass uppercase">Vì sao entry được chèn / bị loại</p>
        <span className="text-xs text-vellum/40">
          {Object.entries(counts)
            .map(([layer, count]) => `${layer === 'chèn' ? 'chèn' : `chặn ở ${layer}`}: ${count}`)
            .join(' · ')}
        </span>
        <div className="flex-1" />
        {(['tất cả', 'chèn', 'loại'] as const).map((option) => (
          <Button key={option} variant={filter === option ? 'primary' : 'normal'} onClick={() => setFilter(option)}>
            {option}
          </Button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto rounded border border-oak-light bg-ink/60 px-2 text-[11px]">
        {shown.length === 0 ? (
          <p className="py-2 text-vellum/40 italic">Chưa quét lần nào. Bấm "Thử quét" hoặc chơi một lượt.</p>
        ) : (
          shown.map((decision) => <LayerRow key={decision.entryId} decision={decision} />)
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ba cột
// ---------------------------------------------------------------------------

function BookColumn(): ReactNode {
  const books = useLorebookStore((state) => state.books);
  const selected = useLorebookStore((state) => state.selectedBook);
  const store = useLorebookStore.getState();
  const activation = useTurnStore((state) => state.lore.books);
  const regionId = useCurrentRegion();

  const active = activation.filter((book) => book.active).length;

  return (
    <div className="flex min-h-0 flex-col gap-1 overflow-y-auto pr-1">
      <p className="text-xs tracking-[0.2em] text-brass uppercase">Sách ({books.length})</p>
      {activation.length > 0 && (
        <p className="text-[11px] text-vellum/50">
          {active} sách đang bật
          {regionId === '' ? '.' : ` vì bạn đang ở ${regionName(regionId)}.`}
        </p>
      )}

      <ul className="flex flex-col gap-1">
        {books.map((book) => {
          const status = activation.find((item) => item.bookId === book.id);
          return (
            <li key={book.id}>
              <button
                type="button"
                onClick={() => store.select(book.id)}
                className={`w-full rounded border px-2 py-1 text-left text-xs ${
                  selected === book.id ? 'border-brass bg-brass/10' : 'border-oak-light bg-ink/40 hover:border-vellum/40'
                }`}
              >
                <span className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={book.enabled}
                    onClick={(event) => event.stopPropagation()}
                    onChange={(event) => store.patch(book.id, { enabled: event.target.checked })}
                  />
                  <span className="min-w-0 flex-1 truncate text-parchment">{book.name}</span>
                  <span className="text-vellum/40">{book.entries.length}</span>
                </span>
                <span className="mt-0.5 block text-[11px] text-vellum/40">
                  {book.scope.kind}
                  {book.scope.refId === undefined ? '' : `: ${book.scope.refId}`}
                  {status === undefined ? '' : ` · ${status.active ? 'ĐANG BẬT' : 'tắt'} — ${status.reason}`}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function EntryColumn(): ReactNode {
  const books = useLorebookStore((state) => state.books);
  const bookId = useLorebookStore((state) => state.selectedBook);
  const selected = useLorebookStore((state) => state.selectedEntry);
  const store = useLorebookStore.getState();
  const decisions = useTurnStore((state) => state.lore.decisions);

  const [search, setSearch] = useState('');
  const [type, setType] = useState('tất cả');
  const [gate, setGate] = useState('tất cả');

  const book = books.find((candidate) => candidate.id === bookId);
  if (book === undefined) {
    return <p className="text-xs text-vellum/40 italic">Chọn một sách ở cột trái.</p>;
  }

  const entries = book.entries.filter((entry) => {
    if (type !== 'tất cả' && entry.type !== type) return false;
    if (gate !== 'tất cả' && entry.knowledge !== gate) return false;
    if (search === '') return true;
    const needle = search.toLowerCase();
    return (
      entry.title.toLowerCase().includes(needle) ||
      entry.id.toLowerCase().includes(needle) ||
      entry.keys.some((key) => key.toLowerCase().includes(needle))
    );
  });

  return (
    <div className="flex min-h-0 flex-col gap-1">
      <div className="flex gap-1">
        <TextInput
          value={search}
          placeholder="tìm theo tên, id, từ khóa"
          onChange={(event) => setSearch(event.target.value)}
        />
        <Button onClick={() => store.addEntry(book.id)}>+</Button>
      </div>
      <div className="flex gap-1">
        <Select value={type} onChange={(event) => setType(event.target.value)}>
          <option>tất cả</option>
          {[...new Set(book.entries.map((entry) => entry.type))].map((value) => (
            <option key={value}>{value}</option>
          ))}
        </Select>
        <Select value={gate} onChange={(event) => setGate(event.target.value)}>
          <option>tất cả</option>
          <option>public</option>
          <option>gated</option>
          <option>secret</option>
        </Select>
      </div>

      <ul className="min-h-0 flex-1 overflow-y-auto">
        {entries.map((entry) => {
          const decision = decisions.find((item) => item.entryId === entry.id);
          const inserted = decision !== undefined && decision.outcome !== 'loại';
          return (
            <li key={entry.id}>
              <button
                type="button"
                onClick={() => store.select(book.id, entry.id)}
                className={`mb-1 w-full rounded border px-2 py-1 text-left text-xs ${
                  selected === entry.id
                    ? 'border-brass bg-brass/10'
                    : 'border-oak-light bg-ink/40 hover:border-vellum/40'
                }`}
              >
                <span className="flex items-center gap-2">
                  {inserted && <span className="text-emerald-300" title="Đang được chèn ở lượt này">●</span>}
                  <span className="min-w-0 flex-1 truncate text-parchment">{entry.title}</span>
                  {entry.constant && <span className="text-brass" title="Luôn chèn">∞</span>}
                  {entry.knowledge !== 'public' && (
                    <span className={entry.knowledge === 'secret' ? 'text-red-300' : 'text-amber-300'}>
                      {entry.knowledge}
                    </span>
                  )}
                </span>
                <span className="block truncate text-[11px] text-vellum/40">
                  {entry.keys.length === 0 ? '(không từ khóa)' : entry.keys.join(', ')}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Khung ngoài
// ---------------------------------------------------------------------------

export function LorebookToolbar(): ReactNode {
  const store = useLorebookStore.getState();
  const [name, setName] = useState('');

  const download = (text: string, filename: string): void => {
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        type="file"
        accept="application/json,.json"
        id="lore-import"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file !== undefined) {
            void file.text().then((text) => {
              try {
                store.importFile(JSON.parse(text) as unknown, file.name.replace(/\.json$/i, ''));
              } catch (error) {
                store.importFile({ loi: String(error) }, file.name);
              }
            });
          }
          event.target.value = '';
        }}
      />
      <TextInput
        value={name}
        placeholder="tên sách mới"
        className="w-40"
        onChange={(event) => setName(event.target.value)}
      />
      <Button
        onClick={() => {
          store.addBook(name);
          setName('');
        }}
      >
        Thêm sách
      </Button>
      <Button onClick={() => document.getElementById('lore-import')?.click()}>Import</Button>
      <Button onClick={() => download(store.exportAll(), 'lorebooks.json')}>Export cả bộ</Button>
      <Button
        disabled={store.selectedBook === null}
        onClick={() => {
          const bookId = useLorebookStore.getState().selectedBook;
          if (bookId !== null) download(store.exportBook(bookId), `${bookId}.json`);
        }}
      >
        Export sách này
      </Button>
    </div>
  );
}

export function LorebookWarnings(): ReactNode {
  const issues = useLorebookStore((state) => state.issues);
  const books = useLorebookStore((state) => state.books);
  const warnings = useTurnStore((state) => state.lore.warnings);
  const duplicates = duplicateIds(books);

  if (issues.length === 0 && warnings.length === 0 && duplicates.length === 0) return null;

  return (
    <div className="flex flex-col gap-1">
      {duplicates.map((item) => (
        <Warning key={item.id} level="warn">
          Entry id "{item.id}" xuất hiện ở {item.books.join(', ')} — sách priority cao hơn sẽ thắng.
        </Warning>
      ))}
      {warnings.map((warning) => (
        <Warning key={warning} level="warn">
          {warning}
        </Warning>
      ))}
      {issues.map((issue) => (
        <Warning key={issue} level="info">
          {issue}
        </Warning>
      ))}
    </div>
  );
}

export function LorebookManager({ onClose }: { onClose(): void }): ReactNode {
  const books = useLorebookStore((state) => state.books);
  const bookId = useLorebookStore((state) => state.selectedBook);
  const entryId = useLorebookStore((state) => state.selectedEntry);
  const store = useLorebookStore.getState();

  const pass = useTurnStore((state) => state.lore);
  const [probe, setProbe] = useState('Ngài hỏi thăm về bá tước Reinhard và chợ phiên.');
  const [dryRun, setDryRun] = useState<typeof pass | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const book = books.find((candidate) => candidate.id === bookId);
  const entry = book?.entries.find((candidate) => candidate.id === entryId);
  const shown = dryRun ?? pass;

  return (
    <div className="fixed inset-0 z-50 flex flex-col gap-3 bg-ink/95 p-4">
      <div className="flex items-center gap-3">
        <h2 className="text-xs tracking-[0.2em] text-brass uppercase">Lorebook</h2>
        <span className="text-xs text-vellum/40">
          {books.reduce((sum, item) => sum + item.entries.length, 0)} entry · lượt gần nhất chèn{' '}
          {pass.items.length + pass.depthBlocks.length} mục, {pass.used}/{pass.limit} token
        </span>
        <div className="flex-1" />
        <Button onClick={onClose}>Đóng (Esc)</Button>
      </div>

      <LorebookToolbar />
      <ViTriVaPhe />
      <LorebookWarnings />

      {book !== undefined && (
        <div className="grid grid-cols-4 gap-2">
          <Field label="Tên sách">
            <TextInput value={book.name} onChange={(event) => store.patch(book.id, { name: event.target.value })} />
          </Field>
          <Field label="Phạm vi">
            <Select
              value={book.scope.kind}
              onChange={(event) =>
                store.patch(book.id, {
                  scope: { ...book.scope, kind: event.target.value as typeof book.scope.kind },
                })
              }
            >
              {['global', 'nation', 'region', 'race', 'faction', 'topic'].map((kind) => (
                <option key={kind}>{kind}</option>
              ))}
            </Select>
          </Field>
          <Field label="Gắn với" hint="id vùng / quốc gia / chủng tộc">
            <TextInput
              value={book.scope.refId ?? ''}
              onChange={(event) => store.patch(book.id, { scope: { ...book.scope, refId: event.target.value } })}
            />
          </Field>
          <div className="flex items-end gap-2 pb-2">
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={book.autoScope}
                onChange={(event) => store.patch(book.id, { autoScope: event.target.checked })}
              />
              <span className="text-vellum/70">Tự bật theo vùng</span>
            </label>
            <Button variant="danger" onClick={() => store.deleteBook(book.id)}>
              Xóa sách
            </Button>
          </div>
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-[18rem_20rem_1fr] gap-3 overflow-hidden">
        <BookColumn />
        <EntryColumn />
        {entry === undefined || book === undefined ? (
          <p className="text-xs text-vellum/40 italic">Chọn một entry ở cột giữa để sửa.</p>
        ) : (
          <EntryForm
            key={entry.id}
            entry={entry}
            onSave={(next) => store.saveEntry(book.id, next)}
            onDelete={() => store.deleteEntry(book.id, entry.id)}
            onDuplicate={() => store.copyEntry(book.id, entry.id)}
          />
        )}
      </div>

      <div className="flex items-center gap-2">
        <TextInput
          value={probe}
          placeholder="gõ một đoạn văn bản giả để thử quét"
          onChange={(event) => setProbe(event.target.value)}
        />
        <Button variant="primary" onClick={() => setDryRun(useTurnStore.getState().dryRunLore(probe))}>
          Thử quét
        </Button>
        <Button onClick={() => setDryRun(null)} disabled={dryRun === null}>
          Xem lại lượt thật
        </Button>
        {dryRun !== null && <span className="text-xs text-brass">đang xem kết quả thử quét</span>}
      </div>

      <div className="h-64 min-h-0">
        <ExplainPanel decisions={shown.decisions} />
      </div>
    </div>
  );
}
