/**
 * PromptBlock — cấu trúc khối prompt mà Phần 3 sẽ dùng.
 *
 * PHẦN 1 CHỈ ĐỊNH NGHĨA VỎ. Nội dung 13 khối mặc định, macro, EJS đều thuộc
 * Phần 3. Ở đây chỉ cần đủ để trình import preset SillyTavern có chỗ đổ vào.
 */

export type BlockRole = 'system' | 'user' | 'assistant';

export type BlockPlacement =
  /** injection_position 0 — xếp theo thứ tự trong danh sách. */
  | { kind: 'sequential' }
  /** injection_position 1 — chèn theo độ sâu tính từ cuối lịch sử. */
  | { kind: 'depth'; depth: number };

export type BlockSource =
  /** Có trong preset và có trong prompt_order. */
  | 'preset'
  /** Có trong prompts[] nhưng KHÔNG có trong prompt_order (cái bẫy số 2). */
  | 'orphan'
  /** Do engine tự chèn vì preset không thể có (mục 6.4). */
  | 'engine';

export interface PromptBlock {
  /** Từ `identifier`. KHÔNG BAO GIỜ từ `id` (cái bẫy số 3). */
  id: string;
  name: string;
  /** Lấy từ prompt_order, không lấy từ prompts[].enabled (cái bẫy số 1). */
  enabled: boolean;
  role: BlockRole;
  /** Từ `content`. Phần 3 render nó bằng EJS. */
  template: string;
  placement: BlockPlacement;
  /** Khóa phụ khi sắp xếp trong cùng độ sâu. */
  injectionOrder: number;
  systemPrompt: boolean;
  marker: boolean;
  forbidOverrides: boolean;
  /**
   * [LOCKED]: không được tắt, không được xóa, không được kéo ra khỏi vị trí.
   * UI phải chặn cứng chứ không chỉ ẩn nút.
   */
  locked: boolean;
  /** Càng cao càng giữ lại lâu khi cắt theo ngân sách token (Phần 3 mục 9). */
  budgetPriority: number;
  source: BlockSource;
  injectionTrigger?: string[];
  /** Khối của game mà marker này ánh xạ tới, nếu là marker (mục 6.3). */
  gameBlock?: string;
}

/**
 * BỐN KHỐI [LOCKED] ENGINE PHẢI TỰ CHÈN (mục 6.4).
 *
 * SillyTavern không có khái niệm tương đương, nên preset của người dùng không
 * bao giờ chứa chúng. Thiếu khối 11 là AI bịa số (phá R1); thiếu khối 13 là
 * không parse được patch (phá toàn bộ Phần 2).
 */
export const LOCKED_BLOCK_IDS = {
  /** Khối 2 — Luật bất biến cho AI. Chèn ngay sau khối system đầu tiên. */
  rules: 'engine.rules',
  /** Khối 11 — KẾT QUẢ XÚC SẮC. Chèn sát trước chatHistory. */
  diceResults: 'engine.diceResults',
  /** Khối 12 — Hành động người chơi. Chèn sau chatHistory. */
  playerAction: 'engine.playerAction',
  /** Khối 13 — Cú pháp UpdateVariable. Chèn cuối cùng. */
  updateSyntax: 'engine.updateSyntax',
} as const;

export type LockedBlockId = (typeof LOCKED_BLOCK_IDS)[keyof typeof LOCKED_BLOCK_IDS];

export function isLockedBlockId(id: string): id is LockedBlockId {
  return (Object.values(LOCKED_BLOCK_IDS) as string[]).includes(id);
}

/** Chỗ chèn của từng khối engine, so với mốc `chatHistory`. */
export type LockedAnchor = 'afterFirstSystem' | 'beforeChatHistory' | 'afterChatHistory' | 'last';

export interface LockedBlockSpec {
  id: LockedBlockId;
  name: string;
  role: BlockRole;
  anchor: LockedAnchor;
  /** Số khối trong Phần 3, để tra chéo. */
  blockNumber: number;
}

export const LOCKED_BLOCK_SPECS: readonly LockedBlockSpec[] = [
  { id: LOCKED_BLOCK_IDS.rules, name: 'Luật bất biến cho AI', role: 'system', anchor: 'afterFirstSystem', blockNumber: 2 },
  { id: LOCKED_BLOCK_IDS.diceResults, name: 'KẾT QUẢ XÚC SẮC', role: 'system', anchor: 'beforeChatHistory', blockNumber: 11 },
  { id: LOCKED_BLOCK_IDS.playerAction, name: 'Hành động người chơi', role: 'user', anchor: 'afterChatHistory', blockNumber: 12 },
  { id: LOCKED_BLOCK_IDS.updateSyntax, name: 'Cú pháp UpdateVariable', role: 'system', anchor: 'last', blockNumber: 13 },
] as const;

/**
 * TÁM Ô CẮM (marker) → khối của game (mục 6.3).
 * SillyTavern tự điền chúng; ở đây game phải điền bằng dữ liệu của mình.
 */
export const MARKER_TO_GAME_BLOCK: Readonly<Record<string, string>> = {
  personaDescription: 'khối 5 — Hồ sơ nhân vật người chơi',
  charDescription: 'khối 8 — Cảnh hiện tại: NPC đang đối thoại',
  charPersonality: 'khối 8 (nối tiếp)',
  scenario: 'khối 3 — Bối cảnh thế giới',
  worldInfoBefore: 'khối 4 — Lorebook, phần chèn TRƯỚC',
  worldInfoAfter: 'khối 4 — Lorebook, phần chèn SAU',
  dialogueExamples: 'khối mới, mặc định tắt',
  chatHistory: 'khối 10 — Lịch sử gần',
};

/** Marker mà mục 6.3 nói phải mặc định TẮT. */
export const MARKERS_DEFAULT_OFF: ReadonlySet<string> = new Set(['dialogueExamples']);

/** Marker đánh dấu chỗ lịch sử hội thoại — mốc để neo khối 11 và 12. */
export const CHAT_HISTORY_MARKER = 'chatHistory';

/** Suy ra budgetPriority theo mục 6.5. */
export function deriveBudgetPriority(identifier: string, source: BlockSource): number {
  if (source === 'engine') return 10;
  if (identifier === CHAT_HISTORY_MARKER) return 5;
  if (identifier.startsWith('worldInfo')) return 7;
  return 6;
}
