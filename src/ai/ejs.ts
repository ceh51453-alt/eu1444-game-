/**
 * BỘ RENDER TEMPLATE (Phần 3 mục 5 và 6).
 *
 * VÌ SAO LÀ `eta` CHỨ KHÔNG PHẢI `ejs`: mục 5 cho phép đổi khi vướng
 * `new Function`/CSP, miễn GIỮ NGUYÊN cú pháp. Bản `ejs` 6 phát hành ESM có
 * `import fs from 'node:fs'` ngay dòng đầu — nó không nạp được trong trình
 * duyệt, mà cả game chạy local trong trình duyệt. `eta` cùng họ cú pháp, không
 * phụ thuộc Node, và cho cấu hình lại tiền tố thẻ.
 *
 * Ba thẻ của EJS được giữ nguyên chữ cho người viết template:
 *   `<% %>`   chạy lệnh
 *   `<%= %>`  in giá trị
 *   `<%- %>`  in thô  (eta đặt tiền tố `-` cho việc cắt khoảng trắng, nên thẻ
 *             này được đổi sang `<%~ %>` ở bước tiền xử lý — người viết
 *             template không thấy khác biệt)
 *
 * KHÔNG escape HTML. Đầu ra của template là chữ gửi cho LLM, không phải HTML:
 * escape sẽ biến dấu nháy tiếng Việt thành `&#39;` và phá luôn khung `╔`/`┌`
 * của khối 6A/6B. Thay vào đó `filterFunction` chỉ lo một việc: giá trị rỗng
 * in ra chuỗi rỗng chứ không in chữ "undefined" vào giữa prompt.
 */

// `eta/core` chứ không phải `eta`: bản mặc định kéo theo phần đọc template từ
// đĩa và `import fs from 'node:fs'` cùng với nó. Ở đây template đến từ
// IndexedDB, không bao giờ từ đĩa — nhập bản `core` là bundle không còn chỗ nào
// tham chiếu tới module của Node nữa.
import { Eta } from 'eta/core';
import type { TemplateFunction } from 'eta/core';

/** Mục 5: template chạy quá ngần này thì cắt. */
export const TEMPLATE_TIMEOUT_MS = 500;

export type TemplateErrorKind = 'bien-dich' | 'chay' | 'qua-gio';

export interface TemplateError {
  kind: TemplateErrorKind;
  message: string;
  /** Dòng trong template, khi đọc được từ thông báo lỗi. */
  line: number | null;
}

export interface RenderResult {
  /** Chuỗi đã render. Rỗng khi lỗi — khối hỏng bị bỏ qua, lượt vẫn chạy tiếp. */
  text: string;
  error: TemplateError | null;
  elapsedMs: number;
}

// ---------------------------------------------------------------------------
// State chỉ đọc (mục 6)
// ---------------------------------------------------------------------------

export class TemplateWriteError extends Error {
  constructor(readonly path: string) {
    super(
      `Template vừa ghi vào state tại "${path}". Không ghi được vào state từ template. Dùng khối UpdateVariable.`,
    );
    this.name = 'TemplateWriteError';
  }
}

const VIEWS = new WeakMap<object, object>();

/** Chỉ bọc dữ liệu thuần. Bọc Date/Map/Set là làm hỏng slot nội bộ của chúng. */
function wrappable(value: object): boolean {
  if (Array.isArray(value)) return true;
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}

function viewOf(value: unknown, path: string): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (!wrappable(value)) return value;

  const cached = VIEWS.get(value);
  if (cached !== undefined) return cached;

  const proxy = new Proxy(value, {
    get(target, property, receiver): unknown {
      const child = Reflect.get(target, property, receiver);
      if (typeof property === 'symbol') return child;
      return viewOf(child, path === '' ? property : `${path}.${property}`);
    },
    set(_target, property): boolean {
      throw new TemplateWriteError(`${path}.${String(property)}`);
    },
    deleteProperty(_target, property): boolean {
      throw new TemplateWriteError(`${path}.${String(property)}`);
    },
    defineProperty(_target, property): boolean {
      throw new TemplateWriteError(`${path}.${String(property)}`);
    },
    setPrototypeOf(): boolean {
      throw new TemplateWriteError(path);
    },
  });

  VIEWS.set(value, proxy);
  return proxy;
}

/**
 * Bọc state thành bản chỉ đọc. Ghi vào là ném ngay, không im lặng bỏ qua:
 * template ghi được state thì MVU không còn là đường ghi duy nhất (R2).
 */
export function readonlyState<T>(state: T, rootName = 'state'): T {
  return viewOf(state, rootName) as T;
}

// ---------------------------------------------------------------------------
// Chốt chặn vòng lặp vô tận (mục 5)
// ---------------------------------------------------------------------------

/**
 * JavaScript không ngắt được một vòng lặp đang chạy trên luồng chính, nên
 * "timeout" chỉ có thật nếu chính vòng lặp tự kiểm tra đồng hồ. Ở đây mã đã
 * biên dịch được vá lại: điều kiện lặp bị bọc thêm một lời gọi `__tick()`, và
 * `__tick` ném lỗi khi quá hạn.
 *
 * CHỈ vá `while` và `for(;;)` kiểu C. `for…of` / `for…in` duyệt một tập hữu
 * hạn nên không tự treo được; muốn treo thì phải có generator vô tận, mà thân
 * generator lại chứa một `while` — và cái đó thì đã bị vá rồi.
 */
function codeMask(source: string): Uint8Array {
  const mask = new Uint8Array(source.length);
  let index = 0;

  while (index < source.length) {
    const char = source[index] ?? '';
    const next = source[index + 1] ?? '';

    if (char === '/' && next === '/') {
      while (index < source.length && source[index] !== '\n') index++;
      continue;
    }
    if (char === '/' && next === '*') {
      index += 2;
      while (index < source.length && !(source[index] === '*' && source[index + 1] === '/')) index++;
      index += 2;
      continue;
    }
    if (char === "'" || char === '"' || char === '`') {
      index++;
      while (index < source.length) {
        const inner = source[index];
        if (inner === '\\') {
          index += 2;
          continue;
        }
        index++;
        if (inner === char) break;
      }
      continue;
    }

    mask[index] = 1;
    index++;
  }
  return mask;
}

/** Vị trí `)` khớp với `(` ở `open`, bỏ qua ngoặc nằm trong chuỗi. */
function matchParen(source: string, mask: Uint8Array, open: number): number {
  let depth = 0;
  for (let index = open; index < source.length; index++) {
    if (mask[index] !== 1) continue;
    const char = source[index];
    if (char === '(') depth++;
    else if (char === ')') {
      depth--;
      if (depth === 0) return index;
    }
  }
  return -1;
}

/** Các dấu `;` ở cấp ngoài cùng trong một nhóm ngoặc. */
function topLevelSemicolons(source: string, mask: Uint8Array, open: number, close: number): number[] {
  const out: number[] = [];
  let depth = 0;
  for (let index = open + 1; index < close; index++) {
    if (mask[index] !== 1) continue;
    const char = source[index];
    if (char === '(' || char === '[' || char === '{') depth++;
    else if (char === ')' || char === ']' || char === '}') depth--;
    else if (char === ';' && depth === 0) out.push(index);
  }
  return out;
}

const LOOP_KEYWORD = /(?:^|[^A-Za-z0-9_$.])(for|while)\s*\(/g;

export function instrumentLoops(source: string): string {
  const mask = codeMask(source);
  const inserts: { at: number; text: string }[] = [];

  LOOP_KEYWORD.lastIndex = 0;
  for (let match = LOOP_KEYWORD.exec(source); match !== null; match = LOOP_KEYWORD.exec(source)) {
    const open = match.index + match[0].length - 1;
    if (mask[open] !== 1) continue;

    const close = matchParen(source, mask, open);
    if (close === -1) continue;

    if (match[1] === 'while') {
      inserts.push({ at: open + 1, text: '__tick() && (' });
      inserts.push({ at: close, text: ')' });
      continue;
    }

    // `for`: chỉ dạng ba mệnh đề mới có chỗ cắm điều kiện.
    const semicolons = topLevelSemicolons(source, mask, open, close);
    const first = semicolons[0];
    const second = semicolons[1];
    if (semicolons.length !== 2 || first === undefined || second === undefined) continue;

    if (source.slice(first + 1, second).trim() === '') {
      inserts.push({ at: first + 1, text: '__tick()' });
    } else {
      inserts.push({ at: first + 1, text: '__tick() && (' });
      inserts.push({ at: second, text: ')' });
    }
  }

  let out = source;
  for (const insert of inserts.sort((left, right) => right.at - left.at)) {
    out = out.slice(0, insert.at) + insert.text + out.slice(insert.at);
  }
  return out;
}

const TIMEOUT_MARK = 'EJS_QUA_GIO';

const eta = new Eta({
  // `with(it)` — template viết `state.character` chứ không phải `it.state...`.
  useWith: true,
  autoEscape: false,
  autoFilter: true,
  filterFunction: (value: unknown) => (value === null || value === undefined ? '' : String(value)),
  autoTrim: false,
  cache: false,
  debug: true,
  functionHeader:
    `const __deadline = Date.now() + ${TEMPLATE_TIMEOUT_MS};` +
    `const __tick = () => { if (Date.now() > __deadline) throw new RangeError(${JSON.stringify(TIMEOUT_MARK)}); return true; };`,
  plugins: [{ processFnString: (fnString: string) => instrumentLoops(fnString) }],
});

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

/**
 * `<%- %>` của EJS = in thô. Trong eta tiền tố `-` đã dành cho việc cắt khoảng
 * trắng, nên thẻ được đổi sang `<%~ %>` trước khi biên dịch. Chỉ đổi đúng cụm
 * mở thẻ, không đụng tới `-` ở bất cứ chỗ nào khác.
 */
export function normalizeTags(source: string): string {
  return source.replace(/<%-(?!%)/g, '<%~');
}

const COMPILED = new Map<string, TemplateFunction>();

/** Xóa cache biên dịch — editor gọi khi người chơi khôi phục mặc định. */
export function clearTemplateCache(): void {
  COMPILED.clear();
}

function lineOf(message: string): number | null {
  const match = /(?:line|dòng)\s+(\d+)/i.exec(message);
  const captured = match?.[1];
  return captured === undefined ? null : Number.parseInt(captured, 10);
}

function toTemplateError(error: unknown, kind: TemplateErrorKind): TemplateError {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes(TIMEOUT_MARK)) {
    return {
      kind: 'qua-gio',
      message: `Template chạy quá ${TEMPLATE_TIMEOUT_MS}ms và đã bị cắt — nhiều khả năng có vòng lặp không thoát.`,
      line: null,
    };
  }
  if (error instanceof RangeError && /call stack/i.test(message)) {
    return { kind: 'chay', message: 'Template gọi đệ quy không đáy.', line: null };
  }
  return { kind, message, line: lineOf(message) };
}

/**
 * Render một template.
 *
 * KHÔNG BAO GIỜ ném. Template hỏng trả về `text: ''` kèm `error` — mục 5 nói
 * rõ: một dấu ngoặc thiếu không được làm treo lượt chơi.
 */
export function renderTemplate(source: string, locals: Record<string, unknown>): RenderResult {
  const started = Date.now();

  let compiled = COMPILED.get(source);
  if (compiled === undefined) {
    try {
      compiled = eta.compile(normalizeTags(source));
    } catch (error) {
      return { text: '', error: toTemplateError(error, 'bien-dich'), elapsedMs: Date.now() - started };
    }
    COMPILED.set(source, compiled);
  }

  try {
    // Tham số thứ hai bắt buộc phải có: ở chế độ `debug`, eta bọc thân template
    // trong try/catch và bộ bắt lỗi của nó đọc `options.filepath`. Bỏ trống thì
    // mọi lỗi trong template bị thay bằng một TypeError vô nghĩa về `filepath`.
    const text = compiled.call(eta, locals, {});
    return { text, error: null, elapsedMs: Date.now() - started };
  } catch (error) {
    return { text: '', error: toTemplateError(error, 'chay'), elapsedMs: Date.now() - started };
  }
}

/**
 * `condition` của một khối (mục 3): biểu thức EJS, sai hoặc hỏng thì bỏ khối.
 *
 * Biểu thức hỏng bị coi là `false` chứ không phải `true`: một khối chèn nhầm
 * thì AI đọc dữ liệu không đúng ngữ cảnh, còn một khối thiếu thì chỉ nhạt.
 */
export function evaluateCondition(
  expression: string,
  locals: Record<string, unknown>,
): { value: boolean; error: TemplateError | null } {
  const trimmed = expression.trim();
  if (trimmed === '') return { value: true, error: null };

  const result = renderTemplate(`<%= ((${trimmed}) ? 'co' : '') %>`, locals);
  if (result.error !== null) return { value: false, error: result.error };
  return { value: result.text === 'co', error: null };
}
