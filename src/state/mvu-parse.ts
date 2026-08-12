/**
 * Bóc khối `<UpdateVariable>` và chuẩn hóa HAI CÚ PHÁP về một dạng nội bộ
 * (Phần 2 mục 4).
 *
 * AI có thể trả về cú pháp SillyTavern, cú pháp JSON, hoặc cả hai trong cùng
 * một response. Parser tự nhận diện rồi quy hết về `PatchOp[]`.
 *
 * `reason` là BẮT BUỘC. Không có lý do thì op không hợp lệ — vì khi op bị từ
 * chối, lý do chính là thứ giúp người chơi hiểu AI đang định làm gì.
 */

export type PatchOpKind = 'set' | 'add' | 'push' | 'pull' | 'delete';

export interface PatchOp {
  op: PatchOpKind;
  path: string;
  /** Giá trị cũ mà AI NGHĨ là đang có. Lá chắn compare-and-swap ở B4. */
  from?: unknown;
  to?: unknown;
  reason: string;
  source: 'st' | 'json';
}

export interface ParseIssue {
  /** Nguyên văn đoạn không đọc được. */
  raw: string;
  message: string;
}

export interface ParseResult {
  ops: PatchOp[];
  issues: ParseIssue[];
  /** Số thẻ `<UpdateVariable>` tìm thấy. */
  blockCount: number;
}

const OP_KINDS: ReadonlySet<string> = new Set(['set', 'add', 'push', 'pull', 'delete']);

const BLOCK_PATTERN = /<UpdateVariable[^>]*>([\s\S]*?)<\/UpdateVariable\s*>/gi;

// ---------------------------------------------------------------------------
// Đọc giá trị kiểu JS/JSON nới lỏng
// ---------------------------------------------------------------------------

class ValueReader {
  #text: string;
  #at = 0;

  constructor(text: string) {
    this.#text = text;
  }

  get rest(): string {
    return this.#text.slice(this.#at);
  }

  skipSpace(): void {
    while (this.#at < this.#text.length && /\s/.test(this.#text[this.#at] ?? '')) this.#at++;
  }

  read(): unknown {
    this.skipSpace();
    const char = this.#text[this.#at];
    if (char === undefined) throw new SyntaxError('hết chuỗi giữa chừng');

    if (char === '"' || char === "'" || char === '`') return this.#readString(char);
    if (char === '[') return this.#readArray();
    if (char === '{') return this.#readObject();

    const word = /^(true|false|null|undefined)\b/.exec(this.rest);
    if (word !== null) {
      this.#at += word[0].length;
      return word[0] === 'true' ? true : word[0] === 'false' ? false : null;
    }

    const number = /^-?\d+(\.\d+)?([eE][+-]?\d+)?/.exec(this.rest);
    if (number !== null) {
      this.#at += number[0].length;
      return Number(number[0]);
    }

    throw new SyntaxError(`không đọc được giá trị tại "${this.rest.slice(0, 24)}"`);
  }

  #readString(quote: string): string {
    this.#at++; // dấu mở
    let out = '';
    while (this.#at < this.#text.length) {
      const char = this.#text[this.#at];
      if (char === '\\') {
        const next = this.#text[this.#at + 1] ?? '';
        const escapes: Record<string, string> = { n: '\n', t: '\t', r: '\r', '\\': '\\', "'": "'", '"': '"', '`': '`' };
        out += escapes[next] ?? next;
        this.#at += 2;
        continue;
      }
      if (char === quote) {
        this.#at++;
        return out;
      }
      out += char;
      this.#at++;
    }
    throw new SyntaxError('chuỗi thiếu dấu đóng');
  }

  #readArray(): unknown[] {
    this.#at++; // [
    const out: unknown[] = [];
    this.skipSpace();
    if (this.#text[this.#at] === ']') {
      this.#at++;
      return out;
    }
    for (;;) {
      out.push(this.read());
      this.skipSpace();
      const char = this.#text[this.#at];
      if (char === ',') {
        this.#at++;
        this.skipSpace();
        if (this.#text[this.#at] === ']') {
          this.#at++;
          return out;
        }
        continue;
      }
      if (char === ']') {
        this.#at++;
        return out;
      }
      throw new SyntaxError('mảng thiếu dấu phẩy hoặc dấu đóng');
    }
  }

  #readObject(): Record<string, unknown> {
    this.#at++; // {
    const out: Record<string, unknown> = {};
    this.skipSpace();
    if (this.#text[this.#at] === '}') {
      this.#at++;
      return out;
    }
    for (;;) {
      this.skipSpace();
      const quote = this.#text[this.#at];
      let key: string;
      if (quote === '"' || quote === "'" || quote === '`') {
        key = this.#readString(quote);
      } else {
        const bare = /^[A-Za-z_$][\w$]*/.exec(this.rest);
        if (bare === null) throw new SyntaxError('khóa object không hợp lệ');
        key = bare[0];
        this.#at += bare[0].length;
      }
      this.skipSpace();
      if (this.#text[this.#at] !== ':') throw new SyntaxError('khóa object thiếu dấu hai chấm');
      this.#at++;
      out[key] = this.read();
      this.skipSpace();
      const char = this.#text[this.#at];
      if (char === ',') {
        this.#at++;
        this.skipSpace();
        if (this.#text[this.#at] === '}') {
          this.#at++;
          return out;
        }
        continue;
      }
      if (char === '}') {
        this.#at++;
        return out;
      }
      throw new SyntaxError('object thiếu dấu phẩy hoặc dấu đóng');
    }
  }
}

/** Tách danh sách tham số ở cấp cao nhất, tôn trọng chuỗi và ngoặc lồng. */
export function splitArguments(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let current = '';

  for (let index = 0; index < text.length; index++) {
    const char = text[index] ?? '';
    if (quote !== null) {
      current += char;
      if (char === '\\') {
        current += text[index + 1] ?? '';
        index++;
      } else if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      current += char;
      continue;
    }
    if (char === '[' || char === '{' || char === '(') depth++;
    if (char === ']' || char === '}' || char === ')') depth--;
    if (char === ',' && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  if (current.trim() !== '') parts.push(current);
  return parts;
}

// ---------------------------------------------------------------------------
// Cú pháp SillyTavern (mục 4.1)
// ---------------------------------------------------------------------------

/** Tìm dấu `)` đóng lại lời gọi, bỏ qua ngoặc nằm trong chuỗi. */
function findCallEnd(text: string, openIndex: number): number {
  let depth = 0;
  let quote: string | null = null;
  for (let index = openIndex; index < text.length; index++) {
    const char = text[index] ?? '';
    if (quote !== null) {
      if (char === '\\') index++;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }
    if (char === '(') depth++;
    if (char === ')') {
      depth--;
      if (depth === 0) return index;
    }
  }
  return -1;
}

const CALL_PATTERN = /_\.\s*([A-Za-z]+)\s*\(/g;

export function parseSillyTavernSyntax(text: string, issues: ParseIssue[]): PatchOp[] {
  const ops: PatchOp[] = [];
  CALL_PATTERN.lastIndex = 0;

  for (let match = CALL_PATTERN.exec(text); match !== null; match = CALL_PATTERN.exec(text)) {
    const kind = (match[1] ?? '').toLowerCase();
    const openIndex = match.index + match[0].length - 1;
    const closeIndex = findCallEnd(text, openIndex);
    if (closeIndex === -1) {
      issues.push({ raw: text.slice(match.index, match.index + 80), message: 'thiếu dấu ) đóng lời gọi' });
      break;
    }
    CALL_PATTERN.lastIndex = closeIndex + 1;

    const rawCall = text.slice(match.index, closeIndex + 1);
    if (!OP_KINDS.has(kind)) {
      issues.push({ raw: rawCall, message: `không có thao tác "_.${kind}"` });
      continue;
    }

    // Lý do nằm trong `//…` sau lời gọi, tới hết dòng.
    const tail = text.slice(closeIndex + 1);
    const lineEnd = tail.indexOf('\n');
    const tailLine = lineEnd === -1 ? tail : tail.slice(0, lineEnd);
    const commentAt = tailLine.indexOf('//');
    const reason = commentAt === -1 ? '' : tailLine.slice(commentAt + 2).trim();

    let args: unknown[];
    try {
      args = splitArguments(text.slice(openIndex + 1, closeIndex)).map((part) => {
        const reader = new ValueReader(part);
        return reader.read();
      });
    } catch (error) {
      issues.push({ raw: rawCall, message: `không đọc được tham số: ${String(error)}` });
      continue;
    }

    const path = args[0];
    if (typeof path !== 'string' || path === '') {
      issues.push({ raw: rawCall, message: 'tham số đầu tiên phải là đường dẫn dạng chuỗi' });
      continue;
    }
    if (reason === '') {
      issues.push({
        raw: rawCall,
        message: 'thiếu lý do — mỗi op phải có ghi chú //lý do ở cuối dòng',
      });
      continue;
    }

    const op: PatchOp = { op: kind as PatchOpKind, path, reason, source: 'st' };

    if (kind === 'delete') {
      if (args.length > 1) op.from = args[1];
    } else if (kind === 'set') {
      // `_.set(path, cũ, mới)` — ba tham số là dạng đầy đủ.
      // `_.set(path, mới)` — thiếu giá trị cũ, B4 sẽ chỉ chấp nhận khi path
      // đang trống.
      if (args.length >= 3) {
        op.from = args[1];
        op.to = args[2];
      } else {
        op.to = args[1];
      }
    } else {
      op.to = args[1];
    }

    ops.push(op);
  }

  return ops;
}

// ---------------------------------------------------------------------------
// Cú pháp JSON (mục 4.2)
// ---------------------------------------------------------------------------

function toJsonOp(raw: unknown, issues: ParseIssue[]): PatchOp | null {
  if (typeof raw !== 'object' || raw === null) {
    issues.push({ raw: JSON.stringify(raw) ?? String(raw), message: 'op phải là một object' });
    return null;
  }
  const record = raw as Record<string, unknown>;
  const kind = record['op'];
  const path = record['path'];
  const reason = record['reason'];

  if (typeof kind !== 'string' || !OP_KINDS.has(kind)) {
    issues.push({ raw: JSON.stringify(raw), message: `thao tác "${String(kind)}" không hợp lệ` });
    return null;
  }
  if (typeof path !== 'string' || path === '') {
    issues.push({ raw: JSON.stringify(raw), message: 'thiếu "path"' });
    return null;
  }
  if (typeof reason !== 'string' || reason.trim() === '') {
    issues.push({ raw: JSON.stringify(raw), message: 'thiếu "reason" — mỗi op phải nói rõ lý do' });
    return null;
  }

  const op: PatchOp = { op: kind as PatchOpKind, path, reason: reason.trim(), source: 'json' };
  if ('from' in record) op.from = record['from'];
  if ('to' in record) op.to = record['to'];
  return op;
}

export function parseJsonSyntax(text: string, issues: ParseIssue[]): PatchOp[] {
  let parsed: unknown;
  try {
    parsed = new ValueReader(text).read();
  } catch (error) {
    issues.push({ raw: text.slice(0, 120), message: `JSON không đọc được: ${String(error)}` });
    return [];
  }

  const list = Array.isArray(parsed)
    ? parsed
    : typeof parsed === 'object' && parsed !== null && Array.isArray((parsed as { ops?: unknown }).ops)
      ? ((parsed as { ops: unknown[] }).ops)
      : null;

  if (list === null) {
    // Một op đơn lẻ cũng chấp nhận.
    const single = toJsonOp(parsed, issues);
    return single === null ? [] : [single];
  }

  const ops: PatchOp[] = [];
  for (const entry of list) {
    const op = toJsonOp(entry, issues);
    if (op !== null) ops.push(op);
  }
  return ops;
}

// ---------------------------------------------------------------------------
// Nhận diện và gộp
// ---------------------------------------------------------------------------

function parseMixedByLine(content: string, issues: ParseIssue[]): PatchOp[] {
  const ops: PatchOp[] = [];
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('//')) continue;
    if (trimmed.startsWith('_')) ops.push(...parseSillyTavernSyntax(trimmed, issues));
    else if (trimmed.startsWith('{') || trimmed.startsWith('[')) ops.push(...parseJsonSyntax(trimmed, issues));
    else issues.push({ raw: trimmed.slice(0, 120), message: 'dòng không thuộc cú pháp nào' });
  }
  return ops;
}

/** Đọc nội dung một khối. */
export function parseUpdateBlock(content: string): { ops: PatchOp[]; issues: ParseIssue[] } {
  const issues: ParseIssue[] = [];
  const trimmed = content.trim();
  if (trimmed === '') return { ops: [], issues };

  const hasSt = /_\.\s*[A-Za-z]+\s*\(/.test(trimmed);
  const first = trimmed[0];

  if ((first === '{' || first === '[') && !hasSt) {
    const ops = parseJsonSyntax(trimmed, issues);
    // JSON hỏng ở dạng nguyên khối vẫn còn cửa đọc theo dòng.
    return ops.length > 0 || issues.length === 0
      ? { ops, issues }
      : { ops: parseMixedByLine(trimmed, []), issues };
  }

  if (first === '_' && !trimmed.includes('{"') && !/^\s*\{/m.test(trimmed)) {
    return { ops: parseSillyTavernSyntax(trimmed, issues), issues };
  }

  // Lẫn lộn: tách theo dòng và xử lý từng dòng.
  return { ops: parseMixedByLine(trimmed, issues), issues };
}

/**
 * Bóc TẤT CẢ thẻ `<UpdateVariable>` trong một response và gộp op theo đúng
 * thứ tự xuất hiện.
 */
export function parseUpdateVariables(response: string): ParseResult {
  const ops: PatchOp[] = [];
  const issues: ParseIssue[] = [];
  let blockCount = 0;

  BLOCK_PATTERN.lastIndex = 0;
  for (let match = BLOCK_PATTERN.exec(response); match !== null; match = BLOCK_PATTERN.exec(response)) {
    blockCount++;
    const result = parseUpdateBlock(match[1] ?? '');
    ops.push(...result.ops);
    issues.push(...result.issues);
  }

  return { ops, issues, blockCount };
}

/** Tách phần kể chuyện khỏi các khối kỹ thuật. */
export function stripUpdateBlocks(response: string): string {
  return response.replace(BLOCK_PATTERN, '').trim();
}
