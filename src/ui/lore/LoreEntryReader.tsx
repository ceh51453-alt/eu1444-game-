import { useState, type ReactNode } from 'react';
import type { LoreEntry } from '@/lore/types';
import { loreEntryOf } from '@/systems/character';
import { Button } from '@/ui/settings/controls';

export interface LoreEntryReaderProps {
  entryId: string;
  /** Mở sẵn khi entry được chọn trong một ngữ cảnh cần đối chiếu. */
  defaultOpen?: boolean;
}

export interface LoreEntryDetailsProps {
  entry: LoreEntry;
  bookName?: string;
  bookId?: string;
}

function dateText(value: LoreEntry['validFrom']): string {
  if (value === undefined) return 'không giới hạn';
  return `${String(value.day).padStart(2, '0')}/${String(value.month).padStart(2, '0')}/${String(value.year)}`;
}

function listText(values: readonly string[] | undefined): string {
  return values === undefined || values.length === 0 ? 'không có' : values.join(' · ');
}

function yesNo(value: boolean): string {
  return value ? 'Có' : 'Không';
}

function DetailRow({ label, children }: { label: string; children: ReactNode }): ReactNode {
  return (
    <div className="grid gap-1 border-b border-oak-light/35 py-1.5 last:border-b-0 sm:grid-cols-[9rem_minmax(0,1fr)]">
      <dt className="text-[11px] text-vellum/45">{label}</dt>
      <dd className="text-xs whitespace-pre-wrap break-words text-parchment">{children}</dd>
    </div>
  );
}

function DetailSection({ title, children }: { title: string; children: ReactNode }): ReactNode {
  return (
    <section className="rounded border border-oak-light bg-ink/35 p-2">
      <h4 className="mb-1 text-[10px] tracking-[0.18em] text-brass uppercase">{title}</h4>
      <dl>{children}</dl>
    </section>
  );
}

/** Bản đọc đầy đủ cho một entry, không cho sửa và không bỏ sót các trường vận hành. */
export function LoreEntryDetails({ entry, bookName, bookId }: LoreEntryDetailsProps): ReactNode {
  const placement = entry.placement === 'block' ? 'Khối lorebook' : `Độ sâu ${String(entry.placement.depth)}`;
  const related = entry.related?.map((item) => `${item.id} (${String(item.pullWeight)})`).join(' · ');

  return (
    <article className="flex min-h-0 flex-col gap-2 overflow-y-auto pr-1">
      <header className="rounded border border-brass/35 bg-brass/5 p-3">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <h3 className="text-base text-brass">{entry.title || '(entry chưa có tiêu đề)'}</h3>
          <span className="rounded border border-oak-light px-1.5 py-0.5 text-[10px] text-vellum/60">{entry.type}</span>
          <span
            className={`rounded border px-1.5 py-0.5 text-[10px] ${
              entry.knowledge === 'secret'
                ? 'border-red-900/70 text-red-300'
                : entry.knowledge === 'gated'
                  ? 'border-amber-800/70 text-amber-300'
                  : 'border-oak-light text-vellum/60'
            }`}
          >
            {entry.knowledge}
          </span>
        </div>
        <p className="mt-1 font-mono text-[10px] text-vellum/40">{entry.id}</p>
        {(bookName !== undefined || bookId !== undefined) && (
          <p className="mt-1 text-[11px] text-vellum/50">
            Sách: {bookName ?? bookId}
            {bookName !== undefined && bookId !== undefined ? ` · ${bookId}` : ''}
          </p>
        )}
        {entry.summary !== undefined && entry.summary !== '' && (
          <p className="mt-2 text-xs whitespace-pre-wrap text-vellum/75">{entry.summary}</p>
        )}
      </header>

      <DetailSection title="Nội dung">
        <p className="text-xs whitespace-pre-wrap text-parchment">
          {entry.content === '' ? '(entry chưa có nội dung)' : entry.content}
        </p>
      </DetailSection>

      {entry.variants !== undefined && entry.variants.length > 0 && (
        <DetailSection title={`Biến thể nội dung (${String(entry.variants.length)})`}>
          <div className="flex flex-col gap-2">
            {entry.variants.map((variant, index) => (
              <div key={`${variant.audience}-${String(index)}`} className="rounded border border-oak-light/50 p-2">
                <p className="text-[10px] tracking-wider text-brass uppercase">Đối tượng · {variant.audience}</p>
                <p className="mt-1 text-xs whitespace-pre-wrap text-vellum/75">{variant.content}</p>
              </div>
            ))}
          </div>
        </DetailSection>
      )}

      <DetailSection title="Kích hoạt và phạm vi">
        <DetailRow label="Từ khóa chính">{listText(entry.keys)}</DetailRow>
        <DetailRow label="Từ khóa phụ">
          {entry.keysSecondary === undefined
            ? 'không có'
            : `${entry.keysSecondary.logic}: ${listText(entry.keysSecondary.keys)}`}
        </DetailRow>
        <DetailRow label="Cách khớp">
          {entry.matchMode} · phân biệt hoa/thường: {yesNo(entry.caseSensitive)} · luôn xét: {yesNo(entry.constant)}
        </DetailRow>
        <DetailRow label="Điều kiện state">{entry.condition?.trim() || 'không có'}</DetailRow>
        <DetailRow label="Thời gian">
          {dateText(entry.validFrom)} → {dateText(entry.validUntil)}
        </DetailRow>
        <DetailRow label="Vùng">
          {listText(entry.regions)} · tính vùng kề: {yesNo(entry.includeAdjacent)}
        </DetailRow>
        <DetailRow label="Cổng tri thức">
          {entry.knowledge}
          {entry.knowledge === 'gated' ? ` · cần: ${listText(entry.requiresKnowledge)}` : ''}
        </DetailRow>
      </DetailSection>

      <DetailSection title="Cách chèn và hành vi">
        <DetailRow label="Vị trí">{placement}{entry.role === undefined ? '' : ` · vai trò ${entry.role}`}</DetailRow>
        <DetailRow label="Xếp hạng">
          trọng số {String(entry.weight)} · ưu tiên ngân sách {String(entry.budgetPriority)}
        </DetailRow>
        <DetailRow label="Xác suất">{entry.probability === undefined ? 'mặc định 100%' : `${String(entry.probability)}%`}</DetailRow>
        <DetailRow label="Sticky / cooldown / delay">
          {String(entry.sticky ?? 0)} / {String(entry.cooldown ?? 0)} / {String(entry.delay ?? 0)} lượt
        </DetailRow>
        <DetailRow label="Kéo theo">{related === undefined || related === '' ? 'không có' : related}</DetailRow>
        <DetailRow label="Đệ quy">
          quét lại: {yesNo(entry.recurse)} · chỉ từ tin gốc: {yesNo(entry.preventRecursion)}
        </DetailRow>
      </DetailSection>

      <DetailSection title="Trigger">
        <DetailRow label="Thiết lập">
          chỉ chạy một lần: {yesNo(entry.triggerOnce)} · nghỉ {String(entry.triggerCooldown ?? 0)} lượt
        </DetailRow>
        <DetailRow label="Danh sách trigger">
          {entry.triggers === undefined || entry.triggers.length === 0
            ? 'không có'
            : entry.triggers.map((trigger, index) => (
                <span key={`${trigger.when}-${String(index)}`} className="mb-1 block last:mb-0">
                  {trigger.when} → {trigger.emit.event}
                  {' · payload: '}
                  <code className="text-vellum/65">{JSON.stringify(trigger.emit.payload)}</code>
                </span>
              ))}
        </DetailRow>
      </DetailSection>
    </article>
  );
}

/** Bản đọc thu gọn theo ID; chỉ hiện entry mà phía gọi đã chủ động cung cấp. */
export function LoreEntryReader({ entryId, defaultOpen = false }: LoreEntryReaderProps): ReactNode {
  const [open, setOpen] = useState(defaultOpen);
  const details = entryId === '' ? null : loreEntryOf(entryId);

  if (entryId === '') return null;
  if (details === null) {
    return (
      <p className="rounded border border-amber-800/50 bg-amber-950/15 px-2 py-1.5 text-xs text-amber-300">
        Không tìm thấy entry “{entryId}” trong kho lorebook hiện tại.
      </p>
    );
  }

  const { entry } = details;
  return (
    <section className="rounded border border-oak-light bg-ink/55 p-2">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-parchment">{entry.title}</p>
          <p className="truncate font-mono text-[10px] text-vellum/40">
            {entry.id} · {entry.type} · {details.bookName}
          </p>
        </div>
        <Button onClick={() => setOpen((value) => !value)}>{open ? 'Thu nội dung' : 'Đọc entry'}</Button>
      </div>

      {entry.summary !== undefined && entry.summary !== '' && !open && (
        <p className="mt-2 text-xs whitespace-pre-wrap text-vellum/70">{entry.summary}</p>
      )}

      {open && (
        <div className="mt-2 max-h-[32rem] overflow-y-auto border-t border-oak-light pt-2">
          <LoreEntryDetails entry={entry} bookName={details.bookName} bookId={details.bookId} />
        </div>
      )}
    </section>
  );
}
