/**
 * CHUYỂN ĐỔI TỪ WORLD INFO CỦA SILLYTAVERN (Phần 4 mục 12).
 *
 * Người chơi đã có sẵn sách; bắt họ gõ lại từ đầu là cách chắc chắn nhất để họ
 * không dùng hệ này. Ánh xạ theo đúng mục 12:
 *
 *   key            → keys
 *   keysecondary   → keysSecondary  (kèm selectiveLogic)
 *   order          → weight
 *   position/depth → placement
 *   constant       → constant
 *
 * Field nào ST không có thì đặt MẶC ĐỊNH AN TOÀN, và "an toàn" ở đây có nghĩa
 * rất cụ thể: `knowledge = 'public'` (sách cũ không có khái niệm cổng tri thức,
 * đoán là bí mật sẽ làm chúng câm hết) nhưng `recurse = false` (đệ quy bật sẵn
 * cho một sách chưa từng được thiết kế cho nó là đường ngắn nhất tới nổ ngân
 * sách).
 */

import { lorebookSchema, type Lorebook, type LoreEntry, type SecondaryLogic } from './types';

/** `selectiveLogic` của SillyTavern. Thứ tự này lấy từ mã nguồn ST, không đoán. */
const SELECTIVE_LOGIC: Readonly<Record<number, SecondaryLogic>> = {
  0: 'AND_ANY',
  1: 'NOT_ALL',
  2: 'NOT_ANY',
  3: 'AND_ALL',
};

/** `position` 4 là "chèn theo độ sâu"; các giá trị khác đều là chèn theo khối. */
const POSITION_AT_DEPTH = 4;

interface WorldInfoEntry {
  uid?: number | string;
  key?: unknown;
  keys?: unknown;
  keysecondary?: unknown;
  comment?: unknown;
  content?: unknown;
  constant?: unknown;
  selective?: unknown;
  selectiveLogic?: unknown;
  order?: unknown;
  position?: unknown;
  depth?: unknown;
  role?: unknown;
  disable?: unknown;
  probability?: unknown;
  useProbability?: unknown;
  caseSensitive?: unknown;
  matchWholeWords?: unknown;
  preventRecursion?: unknown;
  excludeRecursion?: unknown;
  delay?: unknown;
  sticky?: unknown;
  cooldown?: unknown;
}

export interface ConvertReport {
  bookName: string;
  total: number;
  /** Entry bị bỏ vì không có nội dung. */
  skipped: string[];
  /** Entry đang tắt trong file gốc — giữ nguyên trạng thái tắt. */
  disabled: string[];
  warnings: string[];
}

export interface ConvertResult {
  book: Lorebook;
  report: ConvertReport;
}

function stringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string' && item.trim() !== '');
  }
  // ST cũ đôi khi lưu một chuỗi ngăn bằng dấu phẩy.
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item !== '');
  }
  return [];
}

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Nhận ra một file World Info mà không cần người dùng nói trước. */
export function looksLikeWorldInfo(raw: unknown): boolean {
  if (typeof raw !== 'object' || raw === null) return false;
  const entries = (raw as { entries?: unknown }).entries;
  if (typeof entries !== 'object' || entries === null) return false;

  const first = Array.isArray(entries) ? entries[0] : Object.values(entries)[0];
  if (typeof first !== 'object' || first === null) return false;
  // `key` (số ít) là dấu vân tay của ST; định dạng của game dùng `keys`.
  return 'key' in first || 'keysecondary' in first || 'uid' in first;
}

function toEntry(raw: WorldInfoEntry, index: number, report: ConvertReport): LoreEntry | null {
  const content = typeof raw.content === 'string' ? raw.content : '';
  const title = typeof raw.comment === 'string' && raw.comment !== '' ? raw.comment : `Entry ${index + 1}`;
  const id = `st-${String(raw.uid ?? index)}`;

  if (content.trim() === '') {
    report.skipped.push(title);
    return null;
  }
  if (raw.disable === true) report.disabled.push(title);

  const keys = stringList(raw.key ?? raw.keys);
  const secondaryKeys = stringList(raw.keysecondary);
  const constant = raw.constant === true;

  if (keys.length === 0 && !constant) {
    report.warnings.push(`"${title}" không có từ khóa và cũng không constant — sẽ không bao giờ khớp.`);
  }

  const atDepth = num(raw.position, 0) === POSITION_AT_DEPTH;
  const entry: LoreEntry = {
    id,
    title,
    type: 'custom',
    content,
    keys,
    matchMode: raw.matchWholeWords === true ? 'wholeWord' : 'plain',
    caseSensitive: raw.caseSensitive === true,
    constant,
    includeAdjacent: false,
    // Mặc định an toàn của mục 12.
    knowledge: 'public',
    placement: atDepth ? { depth: Math.max(0, Math.round(num(raw.depth, 4))) } : 'block',
    weight: num(raw.order, 100),
    budgetPriority: 7,
    recurse: false,
    preventRecursion: raw.preventRecursion === true || raw.excludeRecursion === true,
    triggerOnce: false,
  };

  if (secondaryKeys.length > 0) {
    const logic = SELECTIVE_LOGIC[num(raw.selectiveLogic, 0)] ?? 'AND_ANY';
    // `selective: false` trong ST nghĩa là bỏ qua từ khóa phụ, dù có khai.
    if (raw.selective !== false) entry.keysSecondary = { logic, keys: secondaryKeys };
  }

  if (typeof raw.role === 'string' && ['system', 'user', 'assistant'].includes(raw.role)) {
    entry.role = raw.role as LoreEntry['role'];
  }
  if (raw.useProbability === true) entry.probability = num(raw.probability, 100);
  if (typeof raw.delay === 'number') entry.delay = Math.max(0, Math.round(raw.delay));
  if (typeof raw.sticky === 'number' && raw.sticky > 0) entry.sticky = Math.round(raw.sticky);
  if (typeof raw.cooldown === 'number' && raw.cooldown > 0) entry.cooldown = Math.round(raw.cooldown);

  return entry;
}

/**
 * Chuyển một file World Info thành sách của game.
 *
 * Entry đang tắt trong file gốc vẫn được chuyển sang, chỉ là entry không có nội
 * dung mới bị bỏ: người chơi tắt một entry là quyết định của họ, mất luôn entry
 * khi nhập lại thì họ không lấy lại được.
 */
export function convertWorldInfo(raw: unknown, bookName = 'World Info'): ConvertResult {
  const report: ConvertReport = { bookName, total: 0, skipped: [], disabled: [], warnings: [] };

  const container = typeof raw === 'object' && raw !== null ? (raw as { entries?: unknown }).entries : null;
  const list: WorldInfoEntry[] = Array.isArray(container)
    ? (container as WorldInfoEntry[])
    : typeof container === 'object' && container !== null
      ? (Object.values(container) as WorldInfoEntry[])
      : [];

  if (list.length === 0) report.warnings.push('File không có entry nào đọc được.');

  const entries: LoreEntry[] = [];
  const usedIds = new Set<string>();
  for (const [index, item] of list.entries()) {
    const entry = toEntry(item, index, report);
    if (entry === null) continue;
    // uid trùng nhau có thật trong file cũ; giữ nguyên id là entry sau nuốt entry trước.
    let id = entry.id;
    for (let suffix = 2; usedIds.has(id); suffix++) id = `${entry.id}-${suffix}`;
    usedIds.add(id);
    entries.push({ ...entry, id });
  }
  report.total = entries.length;

  const book: Lorebook = lorebookSchema.parse({
    id: `book-st-${Date.now().toString(36)}`,
    name: bookName,
    version: 1,
    scope: { kind: 'topic' },
    enabled: true,
    autoScope: false,
    priority: 0,
    entries,
  });

  return { book, report };
}

export function formatConvertReport(report: ConvertReport): string {
  const lines = [
    `Sách: ${report.bookName}`,
    `Đã chuyển ${report.total} entry`,
    `Bỏ vì rỗng: ${report.skipped.length}`,
    `Đang tắt trong file gốc: ${report.disabled.length}`,
    'Mặc định đã đặt: knowledge = public, recurse = false, scope = topic (chỉ bật tay)',
  ];
  if (report.warnings.length > 0) {
    lines.push('Cảnh báo:');
    for (const warning of report.warnings) lines.push(`  ! ${warning}`);
  }
  return lines.join('\n');
}
