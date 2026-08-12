/**
 * SỰ KIỆN & THÔNG BÁO — Phần 15 mục 7.
 *
 * **HAI LUỒNG HIỂN THỊ — KHÔNG GIẤU GÌ, NHƯNG KHÔNG CHÔN VÙI.** Cả hai vế đều là
 * ràng buộc, và chúng kéo ngược nhau:
 *
 *   LUỒNG 1  KHUNG CHẶN MÀN HÌNH — chỉ cho việc **CẦN QUYẾT ĐỊNH**, hoặc mức 5.
 *            Nhiều khung cùng lúc thì XẾP CHỒNG thành một chồng thẻ, người chơi
 *            lật từng cái. Không phải đóng lần lượt từng hộp thoại.
 *   LUỒNG 2  DÒNG TIN LUÔN HIỂN THỊ — mọi thứ còn lại, kiểu biên niên, không
 *            chặn gì, lọc được, tìm được, lưu vĩnh viễn ở Tầng B.
 *
 * Ranh giới giữa hai luồng là câu hỏi DUY NHẤT: *"cái này có đòi người chơi bấm
 * gì không?"* Không đòi thì nó không được chặn, dù nó có to tới đâu — trừ mức 5,
 * vì một cuộc thập tự chinh mà người chơi bỏ lỡ vì đang cuộn dòng tin là một
 * kiểu hỏng riêng.
 *
 * FILE NÀY KHÔNG VẼ GÌ. Nó quyết định cái gì đi luồng nào, sắp xếp, và lọc — UI
 * ở `/src/ui/world/` chỉ hiển thị. Nhờ vậy luật "cái gì chặn màn hình" kiểm tra
 * được bằng test, thay vì nằm rải trong mấy component React.
 */

import { events as bus } from '@/core/eventbus';
import { newsConfig } from './data';
import type { ArrivedNews, EventScope, WorldEvent } from './types';

/** Biến cố mô phỏng ngầm vừa sinh ra — Phần 14 nghe kênh của nó, đây là kênh này. */
export const SIM_EVENT = 'sim.world';
/** Một tin vừa tới tai người chơi. UI dòng tin nghe kênh này. */
export const SIM_NEWS = 'sim.news';

/** Mức mà một biến cố chặn màn hình dù không đòi quyết định gì (mục 7). */
export const BLOCKING_IMPORTANCE = 5;

// ---------------------------------------------------------------------------
// Phân luồng
// ---------------------------------------------------------------------------

/** LUỒNG 1: cái này có được chặn màn hình không. */
export function isBlocking(event: WorldEvent): boolean {
  return event.requiresDecision || event.importance >= BLOCKING_IMPORTANCE;
}

export interface CardStack {
  /** Id biến cố, cái cần quyết định gấp nhất đứng trước. */
  cards: string[];
  /** Đã cắt bớt bao nhiêu vì vượt trần. Chúng vẫn nằm trong dòng tin. */
  dropped: number;
}

/**
 * Xếp chồng thẻ.
 *
 * THỨ TỰ: có hạn chót đứng trước (hạn gần nhất trước), rồi tới mức quan trọng.
 * Một quyết định hết hạn trong ba ngày mà nằm dưới một tuyên bố mức 5 không cần
 * làm gì thì chồng thẻ đã phản bội chính lý do nó tồn tại.
 *
 * Trần `cardLimit` là để chồng thẻ không thành một cỗ bài tú lơ khơ sau khi
 * người chơi tua sáu tháng. Cái bị cắt KHÔNG mất — nó vẫn ở dòng tin, và đó là
 * đúng nghĩa "không giấu gì".
 */
export function stackCards(pending: readonly WorldEvent[]): CardStack {
  const limit = newsConfig().cardLimit;
  const sorted = [...pending].filter(isBlocking).sort((left, right) => {
    const leftDeadline = left.deadline;
    const rightDeadline = right.deadline;
    if (leftDeadline !== undefined && rightDeadline !== undefined) {
      const a = leftDeadline.year * 372 + leftDeadline.month * 31 + leftDeadline.day;
      const b = rightDeadline.year * 372 + rightDeadline.month * 31 + rightDeadline.day;
      if (a !== b) return a - b;
    } else if (leftDeadline !== undefined) return -1;
    else if (rightDeadline !== undefined) return 1;
    return right.importance - left.importance;
  });

  return {
    cards: sorted.slice(0, limit).map((event) => event.id),
    dropped: Math.max(0, sorted.length - limit),
  };
}

// ---------------------------------------------------------------------------
// Dòng tin (LUỒNG 2)
// ---------------------------------------------------------------------------

export interface FeedFilter {
  /** Mức quan trọng tối thiểu. */
  minImportance?: number;
  scope?: EventScope | 'tat-ca';
  /** Loại biến cố — `data/news.json → templates.byKind`. */
  kind?: string;
  /** Độ tin cậy tối thiểu. Người chơi phải học cách nghi ngờ (mục 7). */
  minConfidence?: number;
  /** Chỉ tin chưa đọc. */
  unreadOnly?: boolean;
  /** Ô tìm kiếm của mục 7. So khớp không phân biệt hoa thường. */
  search?: string;
  /** Năm — "Biên niên sử" của mục 11 xem lại theo năm. */
  year?: number;
}

export function filterFeed(feed: readonly ArrivedNews[], filter: FeedFilter): ArrivedNews[] {
  const needle = (filter.search ?? '').trim().toLowerCase();

  return feed.filter((item) => {
    if (filter.minImportance !== undefined && item.importance < filter.minImportance) return false;
    if (filter.scope !== undefined && filter.scope !== 'tat-ca' && item.scope !== filter.scope) return false;
    if (filter.kind !== undefined && filter.kind !== '' && item.kind !== filter.kind) return false;
    if (filter.minConfidence !== undefined && item.confidence < filter.minConfidence) return false;
    if (filter.unreadOnly === true && item.read) return false;
    if (filter.year !== undefined && item.occurredAt.year !== filter.year) return false;
    if (needle !== '') {
      const haystack = `${item.headline} ${item.text} ${item.source}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    return true;
  });
}

/**
 * Chèn tin mới vào dòng, mới nhất đứng ĐẦU.
 *
 * Trần `feedLimit` cắt từ đuôi. Bản đầy đủ nằm ở Tầng B (mục 7: "có lưu trữ vĩnh
 * viễn trong Tầng B"), nên cắt ở đây chỉ là cắt bản đang giữ trong RAM — và
 * "Biên niên sử" của mục 11 đọc Tầng B chứ không đọc mảng này.
 */
export function pushFeed(feed: readonly ArrivedNews[], arrivals: readonly ArrivedNews[]): ArrivedNews[] {
  if (arrivals.length === 0) return [...feed];
  const limit = newsConfig().feedLimit;
  return [...arrivals, ...feed].slice(0, limit);
}

/** Tin quan trọng nhấp nháy ở đầu dòng cho tới khi người chơi đọc (mục 7). */
export function blinking(feed: readonly ArrivedNews[]): ArrivedNews[] {
  return feed.filter((item) => !item.read && item.importance >= 4);
}

export function markRead(feed: readonly ArrivedNews[], ids: readonly string[]): ArrivedNews[] {
  const set = new Set(ids);
  return feed.map((item) => (set.has(item.id) && !item.read ? { ...item, read: true } : item));
}

/**
 * Dòng nguồn hiện kèm MỌI thông báo (mục 7).
 *
 * *"sứ giả từ Köln, tin 12 ngày trước, độ tin cậy 60%"* — nguyên văn ví dụ của
 * mục 7, và nó là một câu chứ không phải ba ô riêng vì người chơi phải đọc được
 * cả ba cùng lúc để mà nghi ngờ.
 */
export function attribution(item: ArrivedNews): string {
  const days = Math.round(item.daysLate);
  const when = days <= 0 ? 'tin vừa tới' : `tin ${String(days)} ngày trước`;
  return `${item.source}, ${when}, độ tin cậy ${String(Math.round(item.confidence))}%`;
}

// ---------------------------------------------------------------------------
// Phát ra ngoài
// ---------------------------------------------------------------------------

/**
 * Phát biến cố lên eventbus.
 *
 * Handler KHÔNG được ghi state (luật của `core/eventbus.ts`) — muốn biến một
 * biến cố thành state thì dựng `PatchOp` và cho qua MVU. Ở đây chỉ phát, để lớp
 * UI và lorebook nghe được mà không phải import cả tầng mô phỏng.
 */
export function emitSimEvents(list: readonly WorldEvent[]): void {
  for (const event of list) bus.emit(SIM_EVENT, event, 'sim');
}

export function emitArrivals(list: readonly ArrivedNews[]): void {
  for (const item of list) bus.emit(SIM_NEWS, item, 'sim');
}

// ---------------------------------------------------------------------------
// Dọn hàng đợi
// ---------------------------------------------------------------------------

/** Trần biến cố giữ trong state. Bản đầy đủ nằm ở Tầng B. */
const EVENT_LIMIT = 800;

/**
 * Dọn hàng đợi biến cố.
 *
 * GIỮ LẠI mọi biến cố còn có tin đang trên đường trỏ tới, bất kể cũ tới đâu: một
 * tin mất tám tháng để tới nơi mà biến cố gốc đã bị dọn thì lúc tới nó không có
 * gì để kể, và cả chuyến đi tám tháng ấy thành công cốc.
 */
export function pruneEvents(
  list: readonly WorldEvent[],
  referencedIds: ReadonlySet<string>,
): WorldEvent[] {
  if (list.length <= EVENT_LIMIT) return [...list];
  const kept: WorldEvent[] = [];
  // Duyệt từ mới nhất về cũ nhất, giữ đủ trần rồi chỉ nhặt thêm cái còn được trỏ.
  for (let index = list.length - 1; index >= 0; index--) {
    const event = list[index];
    if (event === undefined) continue;
    if (kept.length < EVENT_LIMIT || referencedIds.has(event.id)) kept.unshift(event);
  }
  return kept;
}
