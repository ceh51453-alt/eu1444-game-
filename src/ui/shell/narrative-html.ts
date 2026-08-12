/**
 * ĐOẠN VĂN SAU REGEX KHÔNG CÒN LÀ CHỮ THUẦN (Phần 1 mục 6.7).
 *
 * 32 trên 50 regex của preset thật là `markdownOnly`, và việc chúng làm là
 * THAY CHỮ BẰNG HTML: khung gập cho chuỗi tư duy, bảng tùy chọn hành động,
 * khung tóm tắt. Vẽ kết quả đó bằng `{text}` trong một thẻ `<p>` thì React
 * escape hết, và người chơi nhìn thấy nguyên mã nguồn `<!DOCTYPE html>` chảy
 * xuống màn hình thay vì cái khung. Đó là toàn bộ chuyện "bật regex lên là bể".
 *
 * Ở đây tách một đoạn văn thành ba loại mảnh, vì ba loại phải vẽ khác nhau:
 *
 *   - `text`     — chữ thường, giữ nguyên xuống dòng.
 *   - `markup`   — HTML rời nằm trong dòng chảy tin nhắn (`<div class="cot-…">`).
 *                  Vẽ thẳng vào DOM của game, nên phải LỌC.
 *   - `document` — khối ```html trọn vẹn, có `<!DOCTYPE>`, `<head>`, và nhất là
 *                  luật CSS cho `body`. Vẽ thẳng vào DOM là luật đó đè lên
 *                  giao diện của cả game. Loại này đi vào iframe sandbox, đúng
 *                  chỗ SillyTavern đặt nó, nên script trang trí trong đó vẫn
 *                  chạy mà không với được ra ngoài.
 */

export type NarrativeSegment =
  | { kind: 'text'; text: string }
  | { kind: 'markup'; html: string }
  | { kind: 'document'; html: string };

/** Bỏ cả thẻ lẫn ruột: không có lý do chính đáng nào để chúng ở trong tin nhắn. */
const DROP_WITH_CONTENT = new Set([
  'script', 'iframe', 'object', 'embed', 'form', 'input', 'textarea', 'select',
  'base', 'template', 'noscript', 'title', 'frame', 'frameset', 'applet',
]);

/** Bỏ thẻ, GIỮ ruột: vỏ tài liệu không có nghĩa gì khi nằm giữa một tin nhắn. */
const UNWRAP = new Set(['html', 'head', 'body']);

/**
 * Thẻ được phép vẽ. Danh sách CHO PHÉP chứ không phải danh sách cấm: preset và
 * lorebook là file người khác viết, và một danh sách cấm thì luôn thiếu đúng
 * cái thẻ mình chưa nghĩ ra.
 */
const ALLOWED = new Set([
  'a', 'abbr', 'article', 'aside', 'b', 'bdi', 'bdo', 'blockquote', 'br', 'button',
  'canvas', 'caption', 'center', 'cite', 'code', 'col', 'colgroup', 'data', 'dd',
  'del', 'details', 'dfn', 'div', 'dl', 'dt', 'em', 'figcaption', 'figure', 'font',
  'footer', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hgroup', 'hr', 'i',
  'img', 'ins', 'kbd', 'label', 'legend', 'li', 'main', 'mark', 'marquee', 'meter',
  'nav', 'ol', 'output', 'p', 'picture', 'pre', 'progress', 'q', 'rp', 'rt', 'ruby',
  's', 'samp', 'section', 'small', 'source', 'span', 'strong', 'style', 'sub',
  'summary', 'sup', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'time', 'tr',
  'u', 'ul', 'var', 'wbr',
  // SVG: preset dùng cho biểu tượng nhỏ trong khung tư duy.
  'svg', 'g', 'path', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'rect',
  'text', 'tspan', 'defs', 'linearGradient', 'radialGradient', 'stop', 'use',
  'clipPath', 'mask', 'pattern', 'filter', 'feGaussianBlur', 'feOffset', 'feBlend',
  'feColorMatrix', 'feMerge', 'feMergeNode', 'animate', 'animateTransform',
]);

/** Thẻ rỗng: không có thẻ đóng, nên không được đẩy vào ngăn xếp "đang bỏ". */
const VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta',
  'param', 'source', 'track', 'wbr',
]);

/** Giao thức nhét mã chạy được vào một thuộc tính URL. */
const DANGEROUS_URL = /^\s*(?:javascript|vbscript|data)\s*:/i;
const URL_ATTRS = new Set(['href', 'src', 'srcset', 'action', 'formaction', 'xlink:href', 'data', 'poster']);

interface ParsedTag {
  name: string;
  closing: boolean;
  selfClosing: boolean;
  attrs: string;
  /** Vị trí ngay sau dấu `>`. */
  end: number;
}

/** Đọc một thẻ bắt đầu ở `at`. `null` nghĩa là dấu `<` đó chỉ là chữ. */
function parseTag(html: string, at: number): ParsedTag | null {
  let i = at + 1;
  const closing = html[i] === '/';
  if (closing) i += 1;

  const nameStart = i;
  while (i < html.length && /[A-Za-z0-9:-]/.test(html[i] as string)) i += 1;
  if (i === nameStart) return null;
  const name = html.slice(nameStart, i);

  // Đi tới `>` nhưng KHÔNG dừng ở dấu `>` nằm trong giá trị có nháy —
  // `style="content:'>'"` là hợp lệ và cắt ở đó là vỡ cả phần còn lại.
  let quote = '';
  const attrStart = i;
  while (i < html.length) {
    const char = html[i] as string;
    if (quote !== '') {
      if (char === quote) quote = '';
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === '>') {
      break;
    }
    i += 1;
  }
  if (i >= html.length) return null;

  let attrs = html.slice(attrStart, i);
  const selfClosing = attrs.trimEnd().endsWith('/');
  if (selfClosing) attrs = attrs.trimEnd().slice(0, -1);
  return { name, closing, selfClosing, attrs, end: i + 1 };
}

/** Giữ thuộc tính, trừ trình xử lý sự kiện và URL chạy được mã. */
function cleanAttributes(attrs: string): string {
  const kept: string[] = [];
  let i = 0;

  while (i < attrs.length) {
    while (i < attrs.length && /\s/.test(attrs[i] as string)) i += 1;
    const nameStart = i;
    while (i < attrs.length && !/[\s=]/.test(attrs[i] as string)) i += 1;
    const name = attrs.slice(nameStart, i);
    if (name === '') break;

    while (i < attrs.length && /\s/.test(attrs[i] as string)) i += 1;
    let value: string | null = null;
    if (attrs[i] === '=') {
      i += 1;
      while (i < attrs.length && /\s/.test(attrs[i] as string)) i += 1;
      const quote = attrs[i];
      if (quote === '"' || quote === "'") {
        i += 1;
        const valueStart = i;
        while (i < attrs.length && attrs[i] !== quote) i += 1;
        value = attrs.slice(valueStart, i);
        i += 1;
      } else {
        const valueStart = i;
        while (i < attrs.length && !/\s/.test(attrs[i] as string)) i += 1;
        value = attrs.slice(valueStart, i);
      }
    }

    const lower = name.toLowerCase();
    if (lower.startsWith('on')) continue;
    if (URL_ATTRS.has(lower) && value !== null && DANGEROUS_URL.test(value)) continue;
    kept.push(value === null ? lower : `${lower}="${value.replace(/"/g, '&quot;')}"`);
  }

  return kept.length === 0 ? '' : ` ${kept.join(' ')}`;
}

/**
 * Chỉ escape `<` và `>`, KHÔNG escape `&`.
 *
 * Đầu vào ở đây đã là HTML do regex của preset sinh ra, đầy `&nbsp;` và
 * `&amp;`. Escape cả `&` là biến chúng thành `&amp;nbsp;` — chữ hiện ra đúng
 * cái mã thực thể thay vì khoảng trắng.
 */
function escapeText(text: string): string {
  return text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** `<style>` là thẻ chữ THÔ: ruột của nó đi thẳng, không escape. */
const RAW_TEXT = new Set(['style']);

/**
 * Lọc HTML rời trước khi vẽ vào DOM của game.
 *
 * Không dùng `DOMParser`: hàm này phải chạy được cả trong test (môi trường
 * `node`, không có DOM), và một bộ lọc không test được là một bộ lọc không biết
 * mình còn đúng hay không.
 */
export function sanitizeMarkup(html: string): string {
  let out = '';
  let i = 0;
  /** Các thẻ loại "bỏ cả ruột" đang mở. Khác rỗng thì mọi thứ đọc được đều bỏ. */
  const dropping: string[] = [];

  while (i < html.length) {
    const lt = html.indexOf('<', i);
    if (lt === -1) {
      if (dropping.length === 0) out += escapeText(html.slice(i));
      break;
    }
    if (dropping.length === 0) out += escapeText(html.slice(i, lt));

    if (html.startsWith('<!--', lt)) {
      const end = html.indexOf('-->', lt + 4);
      i = end === -1 ? html.length : end + 3;
      continue;
    }
    if (html.startsWith('<!', lt)) {
      const end = html.indexOf('>', lt);
      i = end === -1 ? html.length : end + 1;
      continue;
    }

    const tag = parseTag(html, lt);
    if (tag === null) {
      if (dropping.length === 0) out += '&lt;';
      i = lt + 1;
      continue;
    }
    i = tag.end;
    const name = tag.name.toLowerCase();
    const empty = tag.selfClosing || VOID_TAGS.has(name);

    if (dropping.length > 0) {
      if (tag.closing && name === dropping[dropping.length - 1]) dropping.pop();
      else if (!tag.closing && !empty && DROP_WITH_CONTENT.has(name)) dropping.push(name);
      continue;
    }
    if (DROP_WITH_CONTENT.has(name)) {
      if (!tag.closing && !empty) dropping.push(name);
      continue;
    }
    if (UNWRAP.has(name)) continue;
    if (!ALLOWED.has(name) && !ALLOWED.has(tag.name)) continue;

    const printed = ALLOWED.has(tag.name) ? tag.name : name;
    out += tag.closing
      ? `</${printed}>`
      : `<${printed}${cleanAttributes(tag.attrs)}${tag.selfClosing ? ' /' : ''}>`;

    // Cả bộ trang trí của preset nằm trong `<style>`, và CSS thì có `>` thật
    // (`.cot-wrapper > summary`). Escape ruột của nó là bẻ gãy mọi bộ chọn con.
    if (!tag.closing && !empty && RAW_TEXT.has(name)) {
      const close = html.toLowerCase().indexOf(`</${name}`, i);
      const stop = close === -1 ? html.length : close;
      out += html.slice(i, stop);
      i = stop;
    }
  }

  return out;
}

/** Có thẻ nào đáng vẽ không — chữ thuần thì đi đường `<p>` cũ, rẻ hơn. */
export function looksLikeMarkup(text: string): boolean {
  return /<([A-Za-z][A-Za-z0-9:-]*)(\s[^>]*)?\/?>/.test(text);
}

const HTML_FENCE = /```[ \t]*html[ \t]*\r?\n?([\s\S]*?)(?:```|$)/gi;

/**
 * Cắt một đoạn văn thành các mảnh vẽ được.
 *
 * Khối ```html tách ra trước, vì đó là thứ duy nhất phải vào iframe. Phần còn
 * lại chỉ cần biết nó có thẻ hay không.
 */
export function splitNarrative(text: string): NarrativeSegment[] {
  const segments: NarrativeSegment[] = [];

  const pushLoose = (chunk: string): void => {
    if (chunk.trim() === '') return;
    segments.push(looksLikeMarkup(chunk) ? { kind: 'markup', html: chunk } : { kind: 'text', text: chunk });
  };

  let last = 0;
  HTML_FENCE.lastIndex = 0;
  for (let match = HTML_FENCE.exec(text); match !== null; match = HTML_FENCE.exec(text)) {
    pushLoose(text.slice(last, match.index));
    const body = (match[1] ?? '').trim();
    if (body !== '') segments.push({ kind: 'document', html: body });
    last = match.index + match[0].length;
  }
  pushLoose(text.slice(last));

  return segments;
}

/**
 * Bọc một khối ```html thành `srcdoc` cho iframe.
 *
 * Thêm đúng hai thứ: nền trong suốt để khung hòa vào trang, và một mẩu script
 * báo chiều cao ra ngoài — không có nó thì iframe phải đoán chiều cao, và mọi
 * khung trang trí đều thừa hoặc thiếu chỗ. Script này chạy trong sandbox KHÔNG
 * có `allow-same-origin`, nên nó không đọc được gì của game.
 */
export function sandboxDocument(html: string, channel: string): string {
  const measure = `<script>(function(){
  var send = function(){
    var doc = document.documentElement, body = document.body;
    var height = Math.max(doc ? doc.scrollHeight : 0, body ? body.scrollHeight : 0);
    parent.postMessage({ channel: ${JSON.stringify(channel)}, height: height }, '*');
  };
  window.addEventListener('load', send);
  if (typeof ResizeObserver === 'function') new ResizeObserver(send).observe(document.documentElement);
  setTimeout(send, 60); setTimeout(send, 400);
})();</script>`;
  const style = '<style>html,body{margin:0;padding:0;background:transparent;overflow:hidden;}</style>';
  const tail = `${style}${measure}`;

  if (!/<html[\s>]/i.test(html)) {
    return `<!doctype html><html><head><meta charset="utf-8">${style}</head><body>${html}${measure}</body></html>`;
  }
  // Tài liệu thật hay thiếu thẻ đóng. Chèn vào chỗ đóng gần nhất còn tìm được,
  // và nếu không có chỗ nào thì nối vào cuối — thà thừa một thẻ hơn là mất
  // mẩu đo chiều cao và để cái khung cụt mất một nửa.
  if (/<\/body\s*>/i.test(html)) return html.replace(/<\/body\s*>/i, `${tail}</body>`);
  if (/<\/html\s*>/i.test(html)) return html.replace(/<\/html\s*>/i, `${tail}</html>`);
  return `${html}${tail}`;
}
