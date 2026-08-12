/**
 * Store của bộ khối prompt (Phần 3 mục 2 và 10).
 *
 * KHÔNG PHẢI GameState: khối prompt sống qua nhiều ván chơi, không đi qua MVU,
 * không nằm trong save. Chúng có kho riêng trong IndexedDB, giống cài đặt kết
 * nối — cùng lý do: chúng không được lôi qua `migrate.ts` mỗi lần schema game
 * đổi.
 *
 * Mọi lệnh sửa đều đi qua hàm thuần trong `ai/blocks.ts` rồi mới ghi vào store,
 * nên luật chặn khối [LOCKED] chỉ tồn tại ở MỘT chỗ.
 */

import { create } from 'zustand';
import {
  addBlock,
  defaultBlocks,
  duplicateBlock,
  loadBlocks,
  moveBlock,
  parseBundle,
  removeBlock,
  restoreDefault,
  saveBlocks,
  serializeBlocks,
  toggleBlock,
  updateBlock,
  type PromptBlock,
} from '@/ai/blocks';
import { clearTemplateCache } from '@/ai/ejs';

export interface PromptState {
  blocks: PromptBlock[];
  loaded: boolean;
  /** Cảnh báo lúc nạp hoặc lúc import. Hiện trên UI cho tới khi người chơi dọn. */
  issues: string[];
  /** Lý do nước kéo thả gần nhất bị từ chối. */
  refusal: string | null;
  /** Khối đang mở trong editor. */
  editing: string | null;
}

export interface PromptActions {
  hydrate(): Promise<void>;
  toggle(id: string, enabled: boolean): void;
  move(id: string, toIndex: number): void;
  update(id: string, patch: Partial<Omit<PromptBlock, 'id' | 'locked'>>): void;
  remove(id: string): void;
  duplicate(id: string): void;
  add(name: string): void;
  restore(id: string): void;
  restoreAll(): void;
  importBundle(raw: unknown): void;
  exportBundle(): string;
  setEditing(id: string | null): void;
  clearIssues(): void;
}

export type PromptStore = PromptState & PromptActions;

export const usePromptStore = create<PromptStore>()((set, get) => {
  /** Ghi xuống IndexedDB. Ghi hỏng chỉ mất bản lưu, không làm hỏng phiên đang chơi. */
  const commit = (blocks: PromptBlock[]): void => {
    // Template đổi thì bản biên dịch cũ không còn dùng được.
    clearTemplateCache();
    set({ blocks });
    void saveBlocks(blocks).catch((error: unknown) => {
      set((state) => ({ issues: [...state.issues, `Không ghi được khối prompt: ${String(error)}`] }));
    });
  };

  return {
    blocks: [],
    loaded: false,
    issues: [],
    refusal: null,
    editing: null,

    async hydrate() {
      if (get().loaded) return;
      try {
        const result = await loadBlocks();
        set({ blocks: result.blocks, loaded: true, issues: result.issues });
      } catch (error) {
        set({ blocks: defaultBlocks(), loaded: true, issues: [`Không đọc được khối prompt: ${String(error)}`] });
      }
    },

    toggle(id, enabled) {
      commit(toggleBlock(get().blocks, id, enabled));
    },

    move(id, toIndex) {
      const result = moveBlock(get().blocks, id, toIndex);
      set({ refusal: result.refused });
      if (result.refused === null) commit(result.blocks);
    },

    update(id, patch) {
      commit(updateBlock(get().blocks, id, patch));
    },

    remove(id) {
      commit(removeBlock(get().blocks, id));
      if (get().editing === id) set({ editing: null });
    },

    duplicate(id) {
      commit(duplicateBlock(get().blocks, id));
    },

    add(name) {
      commit(addBlock(get().blocks, name));
    },

    restore(id) {
      commit(restoreDefault(get().blocks, id));
    },

    restoreAll() {
      commit(defaultBlocks());
      set({ issues: ['Đã khôi phục toàn bộ khối về bản mặc định trong /prompts.'] });
    },

    importBundle(raw) {
      const outcome = parseBundle(raw);
      if (outcome.blocks.length === 0) {
        set({ issues: ['Không nạp được file khối prompt:', ...outcome.issues] });
        return;
      }
      commit(outcome.blocks);
      set({ issues: outcome.issues });
    },

    exportBundle() {
      return serializeBlocks(get().blocks);
    },

    setEditing(editing) {
      set({ editing });
    },

    clearIssues() {
      set({ issues: [], refusal: null });
    },
  };
});
