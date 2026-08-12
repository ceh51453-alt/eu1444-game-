/**
 * KHO SÁCH LOREBOOK — CRUD, lưu trữ, nhập/xuất (Phần 4 mục 12).
 *
 * Cùng cách chia như bộ khối prompt của Phần 3: hàm thuần và kho ở đây, store
 * zustand ở `state/lorebooks.ts`. Lý do vẫn thế — luật (sách [LOCKED] không có,
 * nhưng entry trùng id, sách trùng id, file hỏng thì có) chỉ nên tồn tại ở một
 * chỗ, và chỗ đó phải test được mà không cần dựng React.
 *
 * Trình nạp nhận BỐN dạng file và tự nhận diện: bundle của game, một sách đơn,
 * một mảng sách, và World Info của SillyTavern. Bắt người chơi tự biết mình
 * đang cầm file gì là bắt sai người.
 */

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { z } from 'zod';
import { convertWorldInfo, looksLikeWorldInfo, type ConvertReport } from './convert-st';
import {
  LORE_SCHEMA_VERSION,
  loreBundleSchema,
  loreEntrySchema,
  lorebookSchema,
  type LoreEntry,
  type Lorebook,
} from './types';

// ---------------------------------------------------------------------------
// Sách kèm sẵn
// ---------------------------------------------------------------------------

/**
 * Sách mẫu trong `/lorebooks`, nạp thô lúc build và gieo vào IndexedDB ở lần
 * chạy đầu — cùng cách Phần 3 gieo `/prompts`.
 *
 * Chúng là DỮ LIỆU MẪU, không phải nội dung chính thức của game: người chơi xóa
 * hay sửa thoải mái, và sau lần gieo đầu tiên thì IndexedDB là nguồn sự thật.
 */
const SEED_FILES = import.meta.glob<unknown>('/lorebooks/*.json', { import: 'default', eager: true });

export function seedBooks(): { books: Lorebook[]; issues: string[] } {
  const books: Lorebook[] = [];
  const issues: string[] = [];

  for (const [path, raw] of Object.entries(SEED_FILES)) {
    const outcome = parseLoreFile(raw, path.split('/').pop() ?? path);
    books.push(...outcome.books);
    for (const issue of outcome.issues) issues.push(`${path}: ${issue}`);
  }
  return { books, issues };
}

// ---------------------------------------------------------------------------
// CRUD — hàm thuần
// ---------------------------------------------------------------------------

export function emptyBook(name = 'Sách mới'): Lorebook {
  return lorebookSchema.parse({
    id: `book-${Date.now().toString(36)}`,
    name,
    scope: { kind: 'topic' },
    entries: [],
  });
}

export function emptyEntry(book: Lorebook, title = 'Entry mới'): LoreEntry {
  let suffix = book.entries.length + 1;
  while (book.entries.some((entry) => entry.id === `entry-${suffix}`)) suffix++;
  return loreEntrySchema.parse({ id: `entry-${suffix}`, title, content: '', keys: [] });
}

export function upsertBook(books: readonly Lorebook[], book: Lorebook): Lorebook[] {
  const at = books.findIndex((candidate) => candidate.id === book.id);
  if (at === -1) return [...books, book];
  return books.map((candidate, index) => (index === at ? book : candidate));
}

export function removeBook(books: readonly Lorebook[], bookId: string): Lorebook[] {
  return books.filter((book) => book.id !== bookId);
}

export function patchBook(
  books: readonly Lorebook[],
  bookId: string,
  patch: Partial<Omit<Lorebook, 'id' | 'entries'>>,
): Lorebook[] {
  return books.map((book) => (book.id === bookId ? { ...book, ...patch } : book));
}

export function upsertEntry(books: readonly Lorebook[], bookId: string, entry: LoreEntry): Lorebook[] {
  return books.map((book) => {
    if (book.id !== bookId) return book;
    const at = book.entries.findIndex((candidate) => candidate.id === entry.id);
    const entries = at === -1 ? [...book.entries, entry] : book.entries.map((c, i) => (i === at ? entry : c));
    return { ...book, entries };
  });
}

export function removeEntry(books: readonly Lorebook[], bookId: string, entryId: string): Lorebook[] {
  return books.map((book) =>
    book.id === bookId ? { ...book, entries: book.entries.filter((entry) => entry.id !== entryId) } : book,
  );
}

export function duplicateEntry(books: readonly Lorebook[], bookId: string, entryId: string): Lorebook[] {
  const book = books.find((candidate) => candidate.id === bookId);
  const source = book?.entries.find((entry) => entry.id === entryId);
  if (book === undefined || source === undefined) return [...books];

  let suffix = 2;
  while (book.entries.some((entry) => entry.id === `${entryId}-${suffix}`)) suffix++;
  const copy: LoreEntry = { ...source, id: `${entryId}-${suffix}`, title: `${source.title} (bản ${suffix})` };
  return upsertEntry(books, bookId, copy);
}

/**
 * Entry trùng id giữa hai sách: sách `priority` cao thắng.
 *
 * Trình quét cũng tự xử chuyện này, nhưng UI cần nói ra trước — hai entry cùng
 * id mà chỉ một cái từng xuất hiện là loại bug người chơi không tài nào đoán ra.
 */
export function duplicateIds(books: readonly Lorebook[]): { id: string; books: string[] }[] {
  const owners = new Map<string, string[]>();
  for (const book of books) {
    for (const entry of book.entries) {
      owners.set(entry.id, [...(owners.get(entry.id) ?? []), book.name]);
    }
  }
  return [...owners.entries()]
    .filter(([, names]) => names.length > 1)
    .map(([id, names]) => ({ id, books: names }));
}

// ---------------------------------------------------------------------------
// Nhập / xuất (mục 12)
// ---------------------------------------------------------------------------

export function serializeBooks(books: readonly Lorebook[]): string {
  return `${JSON.stringify(
    { kind: 'eu1444-lorebook', schemaVersion: LORE_SCHEMA_VERSION, exportedAt: Date.now(), books },
    null,
    2,
  )}\n`;
}

export function serializeBook(book: Lorebook): string {
  return serializeBooks([book]);
}

export interface LoreImportOutcome {
  books: Lorebook[];
  issues: string[];
  /** Có khi file nguồn là World Info của SillyTavern. */
  convert?: ConvertReport;
}

/**
 * Nạp một file sách. KHÔNG bao giờ ném.
 *
 * File hỏng trả về `books: []` kèm lý do cụ thể theo từng field — người chơi
 * sửa được một dòng JSON, còn "Không nạp được" thì họ chỉ biết đứng nhìn.
 */
export function parseLoreFile(raw: unknown, fallbackName = 'Sách nạp vào'): LoreImportOutcome {
  if (looksLikeWorldInfo(raw)) {
    const converted = convertWorldInfo(raw, fallbackName);
    return { books: [converted.book], issues: converted.report.warnings, convert: converted.report };
  }

  const bundle = loreBundleSchema.safeParse(raw);
  if (bundle.success) {
    const issues: string[] = [];
    if (bundle.data.schemaVersion !== LORE_SCHEMA_VERSION) {
      issues.push(
        `File dùng schemaVersion ${bundle.data.schemaVersion}, bản build này là ${LORE_SCHEMA_VERSION} — đã nạp theo cách hiểu hiện tại.`,
      );
    }
    return { books: bundle.data.books, issues };
  }

  const single = lorebookSchema.safeParse(raw);
  if (single.success) return { books: [single.data], issues: [] };

  const many = z.array(lorebookSchema).safeParse(raw);
  if (many.success) return { books: many.data, issues: [] };

  return {
    books: [],
    issues: [
      'Không nhận ra định dạng file. Đã thử: bundle của game, một sách đơn, mảng sách, World Info của SillyTavern.',
      ...bundle.error.issues.slice(0, 6).map((issue) => `${issue.path.join('.') || '(gốc)'}: ${issue.message}`),
    ],
  };
}

// ---------------------------------------------------------------------------
// Tầng A — IndexedDB
// ---------------------------------------------------------------------------

const DB_NAME = 'eu1444-lore';
const DB_VERSION = 1;
const ROW_ID = 'books';

interface LoreDB extends DBSchema {
  lore: {
    key: string;
    value: { id: string; books: Lorebook[]; updatedAt: number };
  };
}

let db: IDBPDatabase<LoreDB> | null = null;

export function loreStorageAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}

async function open(): Promise<IDBPDatabase<LoreDB>> {
  if (db !== null) return db;
  db = await openDB<LoreDB>(DB_NAME, DB_VERSION, {
    upgrade(database) {
      if (!database.objectStoreNames.contains('lore')) {
        database.createObjectStore('lore', { keyPath: 'id' });
      }
    },
  });
  return db;
}

export async function saveBooks(books: readonly Lorebook[]): Promise<void> {
  if (!loreStorageAvailable()) return;
  const database = await open();
  await database.put('lore', { id: ROW_ID, books: [...books], updatedAt: Date.now() });
}

export async function loadBooks(): Promise<{ books: Lorebook[]; seeded: boolean; issues: string[] }> {
  if (!loreStorageAvailable()) return { ...seedBooks(), seeded: true };

  const database = await open();
  const row = await database.get('lore', ROW_ID);
  if (row === undefined) {
    const seed = seedBooks();
    await saveBooks(seed.books);
    return { ...seed, seeded: true };
  }

  const parsed = z.array(lorebookSchema).safeParse(row.books);
  if (!parsed.success) {
    return {
      books: [],
      seeded: false,
      issues: ['Bản ghi lorebook trong IndexedDB không đọc được — đã bỏ qua để khỏi nạp dữ liệu hỏng.'],
    };
  }

  // File MỚI trong `/lorebooks` được gieo thêm vào kho đã có.
  //
  // Không có bước này thì bỏ một file mới vào thư mục sẽ không thấy gì trong
  // game, vì IndexedDB đã có bản ghi từ lần chạy trước — và người viết nội dung
  // sẽ tưởng file của mình hỏng. Sách đã có trong kho thì KHÔNG bị ghi đè: bản
  // trong kho là bản người chơi đã sửa.
  const books = [...parsed.data];
  const known = new Set(books.map((book) => book.id));
  const issues: string[] = [];

  for (const book of seedBooks().books) {
    if (known.has(book.id)) continue;
    books.push(book);
    issues.push(`Thấy sách mới trong /lorebooks: "${book.name}" (${book.entries.length} entry) — đã thêm vào kho.`);
  }
  if (issues.length > 0) await saveBooks(books);

  return { books, seeded: false, issues };
}

export async function clearBooks(): Promise<void> {
  if (!loreStorageAvailable()) return;
  const database = await open();
  await database.delete('lore', ROW_ID);
}
