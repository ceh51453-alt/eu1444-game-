/**
 * Ghép danh sách khối thành một prompt hoàn chỉnh.
 *
 * PHẠM VI PHẦN 1: chỉ ghép và sắp xếp. KHÔNG render EJS, KHÔNG thay macro,
 * KHÔNG dựng nội dung game — tất cả những thứ đó là Phần 3. Ở đây chỉ cần đủ
 * để chứng minh trình import cho ra một danh sách khối dùng được: đúng thứ tự,
 * đúng vai, bốn khối [LOCKED] nằm đúng chỗ, ô cắm còn nguyên chờ Phần 3 điền.
 */

import { CHAT_HISTORY_MARKER, LOCKED_BLOCK_IDS, type PromptBlock } from './blocks';
import type { GamePreset } from './import';

export interface AssembledMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  /** Khối nào sinh ra dòng này. */
  blockId: string;
}

export interface AssembledPrompt {
  messages: AssembledMessage[];
  /** Khối bị bỏ vì đang tắt. */
  skipped: string[];
  /** Ô cắm chưa có dữ liệu — Phần 3 sẽ điền. */
  pendingMarkers: string[];
}

/**
 * Sắp xếp: khối `sequential` giữ nguyên thứ tự trong danh sách; khối theo độ
 * sâu xếp sau, sâu nhất trước, trong cùng độ sâu thì theo `injectionOrder`.
 */
export function orderBlocks(blocks: readonly PromptBlock[]): PromptBlock[] {
  const sequential = blocks.filter((block) => block.placement.kind === 'sequential');
  const byDepth = blocks
    .filter((block) => block.placement.kind === 'depth')
    .sort((left, right) => {
      const leftDepth = left.placement.kind === 'depth' ? left.placement.depth : 0;
      const rightDepth = right.placement.kind === 'depth' ? right.placement.depth : 0;
      if (leftDepth !== rightDepth) return rightDepth - leftDepth;
      return right.injectionOrder - left.injectionOrder;
    });
  return [...sequential, ...byDepth];
}

/**
 * Nội dung giữ chỗ cho ô cắm và khối engine, khi chạy với state rỗng.
 * Phần 3 thay hàm này bằng bộ render thật.
 */
function placeholderFor(block: PromptBlock): string {
  if (block.marker) return `«${block.gameBlock ?? block.id}: chờ Phần 3»`;
  if (block.source === 'engine') return `«${block.name}: chờ Phần 3»`;
  return block.template;
}

export function assemblePrompt(preset: GamePreset): AssembledPrompt {
  const messages: AssembledMessage[] = [];
  const skipped: string[] = [];
  const pendingMarkers: string[] = [];

  for (const block of orderBlocks(preset.blocks)) {
    if (!block.enabled) {
      skipped.push(block.id);
      continue;
    }
    if (block.marker) pendingMarkers.push(block.id);
    messages.push({ role: block.role, content: placeholderFor(block), blockId: block.id });
  }

  return { messages, skipped, pendingMarkers };
}

/** Kiểm tra hợp đồng vị trí của bốn khối [LOCKED] (mục 6.4). */
export function checkLockedPlacement(blocks: readonly PromptBlock[]): string[] {
  const problems: string[] = [];
  const indexOf = (id: string): number => blocks.findIndex((block) => block.id === id);

  for (const id of Object.values(LOCKED_BLOCK_IDS)) {
    if (indexOf(id) === -1) problems.push(`thiếu khối [LOCKED] ${id}`);
  }

  const history = indexOf(CHAT_HISTORY_MARKER);
  if (history !== -1) {
    if (indexOf(LOCKED_BLOCK_IDS.diceResults) > history) {
      problems.push('khối KẾT QUẢ XÚC SẮC phải nằm TRƯỚC chatHistory');
    }
    if (indexOf(LOCKED_BLOCK_IDS.playerAction) < history) {
      problems.push('khối Hành động người chơi phải nằm SAU chatHistory');
    }
  }
  if (indexOf(LOCKED_BLOCK_IDS.updateSyntax) !== blocks.length - 1) {
    problems.push('khối Cú pháp UpdateVariable phải nằm cuối cùng');
  }
  return problems;
}
