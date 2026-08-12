/**
 * Vẽ một đoạn văn ĐÃ qua regex hiển thị (Phần 1 mục 6.7).
 *
 * Xem `narrative-html.ts` cho lý do phải chia ba loại mảnh. Ở đây chỉ còn phần
 * React: mảnh chữ vào `<p>`, mảnh HTML rời vào một `<div>` đã lọc, và khối
 * ```html vào iframe sandbox tự đo chiều cao.
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { sandboxDocument, sanitizeMarkup, splitNarrative } from './narrative-html';

let channelCounter = 0;

/**
 * Khối ```html của preset là một trang HTML trọn vẹn, kể cả luật CSS cho
 * `body`. Vẽ thẳng vào DOM của game là để nó sơn lại cả giao diện, nên nó vào
 * iframe — cùng chỗ SillyTavern đặt nó.
 *
 * `sandbox="allow-scripts"` KHÔNG kèm `allow-same-origin`: script trang trí
 * (nút đổi tối/sáng, khung gập) vẫn chạy, nhưng iframe nằm ở một origin mờ, nên
 * nó không đọc được DOM, không đọc được lưu trữ, và không điều hướng được trang
 * ngoài.
 */
function HtmlDocument({ html }: { html: string }): ReactNode {
  const channel = useMemo(() => `khung-${String((channelCounter += 1))}`, []);
  const srcDoc = useMemo(() => sandboxDocument(html, channel), [html, channel]);
  const [height, setHeight] = useState(160);
  const frame = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    const onMessage = (event: MessageEvent): void => {
      // Không kiểm được `event.origin` vì sandbox không có same-origin: origin
      // của nó là "null". Kênh riêng cho từng khung mới là thứ phân biệt được.
      const data = event.data as { channel?: unknown; height?: unknown } | null;
      if (data === null || typeof data !== 'object') return;
      if (data.channel !== channel || typeof data.height !== 'number') return;
      // Trần 4000px: một trang lỗi có thể tự báo chiều cao vô hạn, và một iframe
      // cao vô hạn đẩy mọi thứ khác ra khỏi màn hình.
      setHeight(Math.min(Math.max(Math.ceil(data.height), 40), 4_000));
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [channel]);

  return (
    <iframe
      ref={frame}
      title="Khung trang trí của preset"
      sandbox="allow-scripts"
      srcDoc={srcDoc}
      loading="lazy"
      style={{ height: `${String(height)}px` }}
      className="w-full border-0 bg-transparent"
    />
  );
}

export interface NarrativeProps {
  /** Chữ đã chạy qua regex `markdownOnly`. */
  text: string;
}

export function Narrative({ text }: NarrativeProps): ReactNode {
  const segments = useMemo(() => splitNarrative(text), [text]);

  if (segments.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      {segments.map((segment, index) => {
        if (segment.kind === 'text') {
          return (
            <p key={index} className="whitespace-pre-wrap text-parchment/90">
              {segment.text.trim()}
            </p>
          );
        }
        if (segment.kind === 'document') {
          return <HtmlDocument key={index} html={segment.html} />;
        }
        return (
          <div
            key={index}
            className="narrative-markup text-parchment/90"
            dangerouslySetInnerHTML={{ __html: sanitizeMarkup(segment.html) }}
          />
        );
      })}
    </div>
  );
}
