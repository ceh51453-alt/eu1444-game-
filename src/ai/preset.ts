/**
 * Preset tham số AI, định dạng SillyTavern (Phần 1 mục 6).
 *
 * Bản hiện thực nằm trong thư mục `preset/`, tách thành bốn file vì bốn việc
 * khác hẳn nhau: `schema.ts` (Zod cho định dạng ST), `import.ts` (bốn cái bẫy),
 * `export.ts` (xuất ngược, giữ nguyên trường lạ), `blocks.ts` (hình dạng khối
 * đọc ra được). File này giữ đúng cái tên mà Phần 0 mục 7.2 đã đặt trong sơ đồ
 * thư mục và trỏ sang đó.
 *
 * Ràng buộc không đổi (README mục 8.2): khi nạp một preset SillyTavern, engine
 * PHẢI tự chèn lại bốn khối `[LOCKED]`. Thiếu khối 11 là AI bịa số (phá R1);
 * thiếu khối 13 là không parse được patch (phá Phần 2).
 */

export {
  CHAT_HISTORY_MARKER,
  LOCKED_BLOCK_IDS,
  LOCKED_BLOCK_SPECS,
  MARKERS_DEFAULT_OFF,
  MARKER_TO_GAME_BLOCK,
  deriveBudgetPriority,
  isLockedBlockId,
  type BlockPlacement,
  type BlockRole,
  type BlockSource,
  type PromptBlock,
} from './preset/blocks';

export {
  PresetImportError,
  formatImportReport,
  importSillyTavernPreset,
  type GamePreset,
  type ImportReport,
  type ImportResult,
} from './preset/import';

export { exportSillyTavernPreset, serializePreset } from './preset/export';

export { assemblePrompt as assemblePresetPreview, checkLockedPlacement, orderBlocks } from './preset/assemble';
