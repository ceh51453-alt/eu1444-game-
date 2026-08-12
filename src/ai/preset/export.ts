/**
 * Export ngược ra định dạng SillyTavern (Phần 1 mục 9.10).
 *
 * Hai nguyên tắc:
 *  - Mọi trường lạ trong file gốc phải sống sót. Người chơi có thể nạp preset
 *    vào đây, chỉnh vài khối, rồi mang ngược về SillyTavern — mất trường là
 *    làm hỏng preset của họ.
 *  - Bốn khối [LOCKED] của engine KHÔNG được xuất ra. Chúng không tồn tại
 *    trong mô hình của SillyTavern, và trình import sẽ tự chèn lại ở lần nạp
 *    sau. Xuất chúng ra là tạo bản sao mỗi vòng import/export.
 */

import { GLOBAL_CHARACTER_ID, type PromptEntry, type SillyTavernPreset } from './schema';
import type { PromptBlock } from './blocks';
import type { GamePreset } from './import';

function toPromptEntry(block: PromptBlock, original: PromptEntry | undefined): PromptEntry {
  const entry: PromptEntry = {
    // Giữ nguyên mọi trường lạ của mục gốc.
    ...original,
    identifier: block.id,
    name: block.name,
    enabled: block.enabled,
    role: block.role,
    content: block.template,
    system_prompt: block.systemPrompt,
    marker: block.marker,
    forbid_overrides: block.forbidOverrides,
    injection_position: block.placement.kind === 'depth' ? 1 : 0,
    injection_order: block.injectionOrder,
  };
  if (block.placement.kind === 'depth') entry.injection_depth = block.placement.depth;
  if (block.injectionTrigger !== undefined) entry.injection_trigger = block.injectionTrigger;
  return entry;
}

/**
 * Dựng lại một object preset SillyTavern từ preset đang dùng trong game.
 */
export function exportSillyTavernPreset(preset: GamePreset): SillyTavernPreset {
  const originals = new Map(
    (preset.source.prompts ?? []).map((entry) => [entry.identifier, entry] as const),
  );

  // Khối do engine chèn không thuộc mô hình của SillyTavern.
  const exportable = preset.blocks.filter((block) => block.source !== 'engine');

  const prompts = exportable.map((block) => toPromptEntry(block, originals.get(block.id)));

  // Mồ côi vẫn nằm trong prompts[] (đúng như file gốc) nhưng không vào order.
  const order = exportable
    .filter((block) => block.source !== 'orphan')
    .map((block) => ({ identifier: block.id, enabled: block.enabled }));

  const otherOrders = (preset.source.prompt_order ?? []).filter(
    (entry) => entry.character_id !== (preset.source.prompt_order?.[0]?.character_id ?? GLOBAL_CHARACTER_ID),
  );
  const characterId =
    preset.source.prompt_order?.find((entry) => entry.character_id === GLOBAL_CHARACTER_ID)
      ?.character_id ??
    preset.source.prompt_order?.[0]?.character_id ??
    GLOBAL_CHARACTER_ID;

  return {
    ...preset.source,
    ...preset.samplerParams,
    prompts,
    prompt_order: [{ character_id: characterId, order }, ...otherOrders],
  };
}

/** Chuỗi JSON để tải về. */
export function serializePreset(preset: GamePreset): string {
  return `${JSON.stringify(exportSillyTavernPreset(preset), null, 2)}\n`;
}
