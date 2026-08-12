/**
 * DÒNG TIN — LUỒNG 2 của Phần 15 mục 7, và bảng bên phải của mục 11.
 *
 * *"Mọi thứ còn lại chảy vào một bảng bên cạnh, kiểu biên niên. **Không chặn
 * gì.**"* Chữ "không chặn gì" là ràng buộc: không có modal ở đây, không có
 * `position: fixed`, không có gì nhảy ra trước mặt người đang đọc truyện. Việc
 * chặn màn hình là của `EventCards`, và ranh giới giữa hai luồng do
 * `sim/events.ts → isBlocking` quyết chứ không do component nào tự quyết.
 *
 * **MỖI THÔNG BÁO HIỆN KÈM ĐỘ TIN CẬY VÀ NGUỒN** — *"sứ giả từ Köln, tin 12 ngày
 * trước, độ tin cậy 60%"*. Không phải trang trí: **người chơi phải học cách nghi
 * ngờ**, và họ chỉ học được nếu ba con số ấy luôn nằm ngay dưới câu chuyện, kể
 * cả khi câu chuyện ấy đúng.
 *
 * Vì thế không có chỗ nào ở đây đánh dấu "tin này sai". Engine biết tin nào đã
 * bị bóp méo (`ArrivedNews.distortions`) và cố ý KHÔNG nói ra — nói ra là tước
 * mất của người chơi đúng cái quyết định mà mục 6 muốn họ phải tự cân nhắc.
 */

import { useMemo, useState, type ReactNode } from 'react';
import {
  attribution,
  blinking,
  eventKinds,
  filterFeed,
  markRead,
  newsConfig,
  worldStateOf,
  type ArrivedNews,
  type FeedFilter,
} from '@/sim';
import { regionName } from '@/lore/regions';
import { applyPatch } from '@/state/mvu';
import { useGameStore } from '@/state/store';
import { useWorld } from './useWorld';

/** Hằng số, không phải `[]` viết tại chỗ: một mảng mới mỗi render là một render mới. */
const EMPTY_FEED: readonly ArrivedNews[] = [];

const SCOPES: { id: NonNullable<FeedFilter['scope']>; label: string }[] = [
  { id: 'tat-ca', label: 'mọi phạm vi' },
  { id: 'the-gioi', label: 'thế giới' },
  { id: 'quoc-gia', label: 'quốc gia' },
  { id: 'vung', label: 'vùng' },
  { id: 'thanh-tri', label: 'thành trì' },
  { id: 'ca-nhan', label: 'cá nhân' },
];

/** Bốn nấc tin cậy, đọc thành lời. Con số vẫn hiện ở dòng nguồn. */
function confidenceTone(confidence: number): { tone: string; word: string } {
  const rumour = newsConfig().rumourBelow;
  if (confidence >= rumour + 25) return { tone: 'text-parchment', word: 'chắc chắn' };
  if (confidence >= rumour) return { tone: 'text-vellum/80', word: 'khá tin được' };
  if (confidence >= rumour - 25) return { tone: 'text-vellum/60 italic', word: 'nghe nói' };
  return { tone: 'text-vellum/45 italic', word: 'tin đồn suông' };
}

export interface NewsItemRowProps {
  item: ArrivedNews;
  onRead?: (id: string) => void;
}

export function NewsItemRow({ item, onRead }: NewsItemRowProps): ReactNode {
  const [open, setOpen] = useState(false);
  const tone = confidenceTone(item.confidence);
  // NHẤP NHÁY CHO TỚI KHI NGƯỜI CHƠI ĐỌC (mục 7) — chỉ tin quan trọng, và chỉ
  // một viền, không phải cả dòng: một danh sách nhấp nháy toàn bộ thì không có
  // gì nổi bật cả.
  const urgent = !item.read && item.importance >= 4;

  const toggle = (): void => {
    setOpen((value) => !value);
    if (!item.read && onRead !== undefined) onRead(item.id);
  };

  return (
    <li
      className={`border-b border-oak-light/60 px-3 py-2 last:border-b-0 ${
        urgent ? 'animate-pulse border-l-2 border-l-brass' : ''
      }`}
    >
      <button type="button" onClick={toggle} className="w-full text-left">
        <p className={`text-sm leading-snug ${tone.tone}`}>{item.headline}</p>
        <p className="mt-0.5 text-[10px] text-vellum/45">
          {attribution(item)} · {tone.word}
        </p>
      </button>

      {open && (
        <div className="mt-1.5 rounded bg-ink/50 px-2 py-1.5">
          <p className="text-xs leading-relaxed text-vellum/80">{item.text}</p>
          <p className="mt-1 text-[10px] text-vellum/40">
            {regionName(item.regionId)} · mức {item.importance}/5 · xảy ra{' '}
            {item.occurredAt.day}/{item.occurredAt.month}/{item.occurredAt.year}
          </p>
        </div>
      )}
    </li>
  );
}

export interface NewsFeedProps {
  feed: readonly ArrivedNews[];
  onRead?: (id: string) => void;
  /** Bộ lọc rút gọn cho cột phải; bảng đầy đủ nằm ở "Biên niên sử". */
  compact?: boolean;
  emptyNote?: string;
}

export function NewsFeed({ feed, onRead, compact = false, emptyNote }: NewsFeedProps): ReactNode {
  const [filter, setFilter] = useState<FeedFilter>({ scope: 'tat-ca' });
  const kinds = useMemo(() => eventKinds(), []);
  const shown = useMemo(() => filterFeed(feed, filter), [feed, filter]);
  const unread = blinking(feed).length;

  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-1.5 px-3 py-2">
        <input
          type="search"
          value={filter.search ?? ''}
          onChange={(event) => setFilter((current) => ({ ...current, search: event.target.value }))}
          placeholder="Tìm trong tin…"
          className="min-w-0 flex-1 rounded border border-oak-light bg-ink px-2 py-1 text-xs text-parchment placeholder:text-vellum/30"
        />
        {unread > 0 && (
          <span className="rounded border border-brass px-1.5 py-0.5 text-[10px] text-brass">{unread} mới</span>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5 px-3 pb-2 text-[10px]">
        <select
          value={filter.scope ?? 'tat-ca'}
          onChange={(event) =>
            setFilter((current) => ({
              ...current,
              scope: event.target.value as NonNullable<FeedFilter['scope']>,
            }))
          }
          className="rounded border border-oak-light bg-ink px-1 py-0.5 text-vellum"
        >
          {SCOPES.map((scope) => (
            <option key={scope.id} value={scope.id}>
              {scope.label}
            </option>
          ))}
        </select>

        <select
          value={filter.kind ?? ''}
          onChange={(event) => setFilter((current) => ({ ...current, kind: event.target.value }))}
          className="rounded border border-oak-light bg-ink px-1 py-0.5 text-vellum"
        >
          <option value="">mọi chủ đề</option>
          {kinds.map((kind) => (
            <option key={kind} value={kind}>
              {kind}
            </option>
          ))}
        </select>

        <select
          value={String(filter.minImportance ?? 1)}
          onChange={(event) => setFilter((current) => ({ ...current, minImportance: Number(event.target.value) }))}
          className="rounded border border-oak-light bg-ink px-1 py-0.5 text-vellum"
        >
          {[1, 2, 3, 4, 5].map((level) => (
            <option key={level} value={level}>
              từ mức {level}
            </option>
          ))}
        </select>

        {!compact && (
          <select
            value={String(filter.minConfidence ?? 0)}
            onChange={(event) => setFilter((current) => ({ ...current, minConfidence: Number(event.target.value) }))}
            className="rounded border border-oak-light bg-ink px-1 py-0.5 text-vellum"
          >
            {[0, 30, 60, 80].map((value) => (
              <option key={value} value={value}>
                tin cậy ≥ {value}%
              </option>
            ))}
          </select>
        )}

        <label className="flex items-center gap-1 text-vellum/60">
          <input
            type="checkbox"
            checked={filter.unreadOnly === true}
            onChange={(event) => setFilter((current) => ({ ...current, unreadOnly: event.target.checked }))}
          />
          chưa đọc
        </label>
      </div>

      {shown.length === 0 ? (
        <p className="px-3 pb-3 text-xs text-vellum/45 italic">
          {emptyNote ?? 'Chưa có tin nào tới tai ngài.'}
        </p>
      ) : (
        <ul className={`min-h-0 overflow-y-auto ${compact ? 'max-h-80' : ''}`}>
          {shown.map((item) => (
            <NewsItemRow key={item.id} item={item} {...(onRead === undefined ? {} : { onRead })} />
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Dòng tin nối thẳng vào store — bản dùng ở cột phải, LUÔN HIỂN THỊ (mục 11).
 *
 * Đánh dấu đã đọc đi qua MVU như mọi thay đổi khác (R2): `read` nằm trong slice
 * `world`, và một component tự `set()` vào store là một chỗ mà undo không tua
 * lại được.
 */
export function LiveNewsFeed(): ReactNode {
  const world = useWorld();
  const feed = world?.feed ?? EMPTY_FEED;

  const read = (id: string): void => {
    const store = useGameStore.getState();
    const snapshot = store.snapshot();
    const world = worldStateOf(snapshot);
    if (world === null) return;

    const applied = applyPatch(
      snapshot,
      [
        {
          op: 'set',
          path: 'world.feed',
          from: world.feed,
          to: markRead(world.feed, [id]),
          reason: 'người chơi đã đọc một tin',
          source: 'json',
        },
      ],
      { actor: 'engine' },
    );
    if (applied.applied && applied.next !== null) store.commitBatch(applied.next);
  };

  return <NewsFeed feed={feed} onRead={read} compact emptyNote="Thế giới vẫn im ắng — hoặc ngài chưa nghe được gì." />;
}
