/**
 * Store của kho lorebook (Phần 4 mục 11 và 12).
 *
 * KHÔNG PHẢI GameState, cùng lý do với bộ khối prompt: sách sống qua nhiều ván
 * chơi, không đi qua MVU, không nằm trong save. Thứ DUY NHẤT của lorebook nằm
 * trong save là bộ nhớ quét và tri thức người chơi — chúng ở slice `knowledge`,
 * vì chúng thay đổi theo từng ván.
 */

import { create } from 'zustand';
import {
  duplicateEntry,
  emptyBook,
  emptyEntry,
  loadBooks,
  parseLoreFile,
  patchBook,
  removeBook,
  removeEntry,
  saveBooks,
  serializeBook,
  serializeBooks,
  upsertBook,
  upsertEntry,
} from '@/lore/lorebook';
import type { LoreEntry, Lorebook } from '@/lore/types';

export interface LorebookState {
  books: Lorebook[];
  loaded: boolean;
  issues: string[];
  /** Sách đang chọn ở cột trái. */
  selectedBook: string | null;
  /** Entry đang mở ở cột phải. */
  selectedEntry: string | null;
}

export interface LorebookActions {
  hydrate(): Promise<void>;
  addBook(name: string): void;
  patch(bookId: string, patch: Partial<Omit<Lorebook, 'id' | 'entries'>>): void;
  deleteBook(bookId: string): void;
  addEntry(bookId: string): void;
  saveEntry(bookId: string, entry: LoreEntry): void;
  deleteEntry(bookId: string, entryId: string): void;
  copyEntry(bookId: string, entryId: string): void;
  importFile(raw: unknown, name: string): void;
  exportAll(): string;
  exportBook(bookId: string): string;
  select(bookId: string | null, entryId?: string | null): void;
  clearIssues(): void;
}

export type LorebookStore = LorebookState & LorebookActions;

export const useLorebookStore = create<LorebookStore>()((set, get) => {
  const commit = (books: Lorebook[]): void => {
    set({ books });
    void saveBooks(books).catch((error: unknown) => {
      set((state) => ({ issues: [...state.issues, `Không ghi được lorebook: ${String(error)}`] }));
    });
  };

  return {
    books: [],
    loaded: false,
    issues: [],
    selectedBook: null,
    selectedEntry: null,

    async hydrate() {
      if (get().loaded) return;
      try {
        const result = await loadBooks();
        set({
          books: result.books,
          loaded: true,
          issues: result.issues,
          selectedBook: result.books[0]?.id ?? null,
        });
      } catch (error) {
        set({ loaded: true, issues: [`Không đọc được lorebook: ${String(error)}`] });
      }
    },

    addBook(name) {
      const book = emptyBook(name.trim() === '' ? 'Sách mới' : name.trim());
      commit(upsertBook(get().books, book));
      set({ selectedBook: book.id, selectedEntry: null });
    },

    patch(bookId, patch) {
      commit(patchBook(get().books, bookId, patch));
    },

    deleteBook(bookId) {
      commit(removeBook(get().books, bookId));
      if (get().selectedBook === bookId) set({ selectedBook: null, selectedEntry: null });
    },

    addEntry(bookId) {
      const book = get().books.find((candidate) => candidate.id === bookId);
      if (book === undefined) return;
      const entry = emptyEntry(book);
      commit(upsertEntry(get().books, bookId, entry));
      set({ selectedEntry: entry.id });
    },

    saveEntry(bookId, entry) {
      commit(upsertEntry(get().books, bookId, entry));
    },

    deleteEntry(bookId, entryId) {
      commit(removeEntry(get().books, bookId, entryId));
      if (get().selectedEntry === entryId) set({ selectedEntry: null });
    },

    copyEntry(bookId, entryId) {
      commit(duplicateEntry(get().books, bookId, entryId));
    },

    importFile(raw, name) {
      const outcome = parseLoreFile(raw, name);
      if (outcome.books.length === 0) {
        set({ issues: ['Không nạp được file lorebook:', ...outcome.issues] });
        return;
      }

      // Sách trùng id thì GHI ĐÈ chứ không nhân đôi: nạp lại một sách vừa sửa là
      // thao tác thường xuyên nhất, và mỗi lần lại đẻ thêm một bản sao thì kho
      // sách hỏng sau ba lần.
      let books = get().books;
      for (const book of outcome.books) books = upsertBook(books, book);
      commit(books);

      const issues = [...outcome.issues];
      if (outcome.convert !== undefined) {
        issues.unshift(
          `Nhận ra file World Info của SillyTavern — đã chuyển ${outcome.convert.total} entry, đặt knowledge = public và recurse = false.`,
        );
      }
      set({ issues, selectedBook: outcome.books[0]?.id ?? get().selectedBook });
    },

    exportAll() {
      return serializeBooks(get().books);
    },

    exportBook(bookId) {
      const book = get().books.find((candidate) => candidate.id === bookId);
      return book === undefined ? '' : serializeBook(book);
    },

    select(bookId, entryId = null) {
      set({ selectedBook: bookId, selectedEntry: entryId });
    },

    clearIssues() {
      set({ issues: [] });
    },
  };
});
