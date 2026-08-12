/**
 * Màn Cài đặt ở cột trái của shell.
 *
 * Ràng buộc: bốn khối prompt `[LOCKED]` phải bị chặn CỨNG trong chính UI, không
 * phải chỉ ẩn đi. Tắt cái nút là chưa đủ (README mục 3.3) — `ai/blocks.ts` chặn
 * ở tầng dữ liệu, và `PromptManager` chặn lại một lần nữa ở tầng thao tác.
 */

export { SettingsPanel } from './SettingsPanel';
export { ConnectionTab } from './ConnectionTab';
export { PresetTab } from './PresetTab';
export { ScriptTab } from './ScriptTab';
export { StorageTab } from './StorageTab';
export { VariablesTab } from './VariablesTab';
export { DebugTab } from './DebugTab';
export { SimPanel } from './SimPanel';
