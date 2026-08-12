/**
 * CHỒNG THẺ SỰ KIỆN — LUỒNG 1 của Phần 15 mục 7.
 *
 * *"Nhiều khung cùng lúc thì **XẾP CHỒNG thành một chồng thẻ**, người chơi lật
 * từng cái, **không phải đóng lần lượt từng hộp thoại**."*
 *
 * Khác biệt giữa hai cách nghe nhỏ nhưng không nhỏ. Sáu hộp thoại nối đuôi nhau
 * là sáu lần người chơi bị bắt đóng một thứ họ chưa kịp đọc, và tới cái thứ tư
 * thì họ bấm "đóng" theo phản xạ. Một chồng thẻ thì họ thấy ngay còn mấy tấm,
 * lật qua lại được, và quyết định theo thứ tự mình muốn.
 *
 * THỨ TỰ CHỒNG do `sim/events.ts → stackCards` quyết: hạn chót gần nhất đứng
 * trước, rồi mới tới mức quan trọng. Component này không sắp xếp lại — nếu nó tự
 * sắp thì luật "cái gì gấp hơn" sẽ nằm ở hai chỗ và hai chỗ sẽ lệch nhau.
 *
 * Thẻ KHÔNG CÓ nút "đóng tất cả". Đó là cố ý: mỗi tấm ở đây hoặc đòi một quyết
 * định, hoặc là chuyện mức 5 — và một cái nút quét sạch cả hai loại là cái nút
 * mà ai cũng bấm.
 */

import { useState, type ReactNode } from 'react';
import { formatGameDate } from '@/core/clock';
import { regionName } from '@/lore/regions';
import type { WorldEvent } from '@/sim';

export interface EventCardsProps {
  /** Biến cố đang nằm trên chồng, đúng thứ tự `stackCards` đã xếp. */
  events: readonly WorldEvent[];
  /** Người chơi chọn một phương án. `optionId` rỗng nghĩa là "đã đọc, bỏ qua". */
  onChoose: (eventId: string, optionId: string) => void;
}

export function EventCards({ events, onChoose }: EventCardsProps): ReactNode {
  const [at, setAt] = useState(0);
  if (events.length === 0) return null;

  const index = Math.min(at, events.length - 1);
  const event = events[index];
  if (event === undefined) return null;

  const options = event.options ?? [];

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-ink/80 p-6">
      <div className="relative w-full max-w-xl">
        {/*
          Hai tấm giả phía sau — chúng KHÔNG phải trang trí: người chơi phải thấy
          ngay đây là một chồng chứ không phải một hộp thoại đơn lẻ, trước cả khi
          đọc dòng "1/4".
        */}
        {events.length > 1 && (
          <div className="absolute inset-x-3 -top-2 h-4 rounded-t border border-oak-light bg-oak/70" aria-hidden />
        )}
        {events.length > 2 && (
          <div className="absolute inset-x-6 -top-4 h-4 rounded-t border border-oak-light bg-oak/50" aria-hidden />
        )}

        <article className="relative rounded border border-brass bg-oak p-5 shadow-2xl">
          <header className="mb-3 flex items-baseline justify-between gap-3">
            <span className="text-[10px] tracking-[0.2em] text-brass uppercase">
              {event.scope} · mức {event.importance}/5
            </span>
            <span className="font-mono text-[10px] text-vellum/50">
              {index + 1}/{events.length}
            </span>
          </header>

          <h2 className="text-lg leading-snug text-parchment">{event.headline}</h2>
          {/*
            Biến cố mức 1–3 dùng mẫu một câu, nên tiêu đề và nội dung trùng nhau
            (`text.ts` cắt tiêu đề ra từ chính câu ấy). In hai lần là để người
            chơi đọc đúng một câu hai lượt và tưởng mình vừa bỏ sót cái gì.
          */}
          {event.text !== event.headline && (
            <p className="mt-2 text-sm leading-relaxed whitespace-pre-line text-vellum/85">{event.text}</p>
          )}

          <p className="mt-3 text-[11px] text-vellum/45">
            {regionName(event.regionId)} · {formatGameDate(event.occurredAt)}
            {event.deadline === undefined ? '' : ` · hạn chót ${formatGameDate(event.deadline)}`}
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            {options.length === 0 ? (
              <button
                type="button"
                onClick={() => onChoose(event.id, '')}
                className="rounded border border-oak-light px-3 py-1.5 text-sm text-vellum hover:bg-oak-light"
              >
                Đã rõ
              </button>
            ) : (
              options.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  title={option.note}
                  onClick={() => onChoose(event.id, option.id)}
                  className="rounded border border-brass px-3 py-1.5 text-left text-sm text-brass hover:bg-brass/10"
                >
                  <span className="block">{option.label}</span>
                  {option.note !== '' && <span className="block text-[10px] text-vellum/50">{option.note}</span>}
                </button>
              ))
            )}
          </div>

          {events.length > 1 && (
            <footer className="mt-4 flex items-center justify-between border-t border-oak-light pt-3">
              <button
                type="button"
                disabled={index === 0}
                onClick={() => setAt(index - 1)}
                className="rounded border border-oak-light px-2 py-1 text-xs text-vellum disabled:opacity-30"
              >
                ← tấm trước
              </button>
              <button
                type="button"
                disabled={index >= events.length - 1}
                onClick={() => setAt(index + 1)}
                className="rounded border border-oak-light px-2 py-1 text-xs text-vellum disabled:opacity-30"
              >
                tấm sau →
              </button>
            </footer>
          )}
        </article>
      </div>
    </div>
  );
}
