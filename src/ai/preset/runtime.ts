/**
 * Chuyển bộ khối SillyTavern sang hình dạng mà pipeline của game thực sự chạy.
 *
 * Trình import cố ý giữ nguyên marker/placement của SillyTavern, còn pipeline
 * dùng các khối EJS giàu dữ liệu của game. Cầu nối này thay từng marker bằng
 * đúng khối game, giữ nội dung riêng của preset và thay bốn placeholder bắt
 * buộc bằng template thật của engine.
 */

import { defaultBlock, type PromptBlock as RuntimeBlock } from '@/ai/blocks';
import type { GamePreset } from './import';
import type { PromptBlock as PresetBlock } from './blocks';

const MARKER_PAYLOADS: Readonly<Record<string, readonly string[]>> = {
  scenario: ['boi-canh'],
  worldInfoBefore: ['lorebook'],
  worldInfoAfter: [],
  personaDescription: ['ho-so-nhan-vat'],
  charDescription: ['thanh-tri', 'thuong-tich', 'tran-danh', 'canh-hien-tai', 'codex-memory', 'tom-tat-xa', 'lanh-tho'],
  charPersonality: [],
  dialogueExamples: [],
  chatHistory: ['lich-su-gan'],
};

const ENGINE_PAYLOADS: Readonly<Record<string, string>> = {
  'engine.rules': 'luat-bat-bien',
  'engine.diceResults': 'ket-qua-xuc-sac',
  'engine.playerAction': 'hanh-dong',
  'engine.updateSyntax': 'dinh-dang-dau-ra',
};

const REQUIRED_ENGINE = ['luat-bat-bien', 'ket-qua-xuc-sac', 'hanh-dong', 'dinh-dang-dau-ra'] as const;

function runtimePlacement(block: PresetBlock): RuntimeBlock['placement'] {
  return block.placement.kind === 'depth' ? { depth: block.placement.depth } : 'sequential';
}

function presetRuntimeBlock(block: PresetBlock, index: number): RuntimeBlock {
  return {
    // Namespace tránh preset có identifier trùng id nội bộ của game.
    id: `preset:${block.id}:${String(index)}`,
    name: block.name,
    enabled: block.enabled,
    locked: block.locked,
    role: block.role,
    placement: runtimePlacement(block),
    order: index + 1,
    template: block.template,
    budgetPriority: block.budgetPriority,
  };
}

function clonePayload(
  id: string,
  enabled: boolean,
  byId: ReadonlyMap<string, RuntimeBlock>,
): RuntimeBlock | null {
  const source = byId.get(id) ?? defaultBlock(id);
  if (source === null) return null;
  return { ...source, enabled: source.locked ? true : source.enabled && enabled };
}

/**
 * Bộ khối có hiệu lực cho lượt kế tiếp. Không có preset thì trả lại chính bộ
 * Prompt Manager; có preset thì thứ tự/vai/nội dung của preset trở thành khung
 * chính và marker được điền bằng dữ liệu sống của game.
 */
export function runtimeBlocksForPreset(
  preset: GamePreset | null,
  gameBlocks: readonly RuntimeBlock[],
): RuntimeBlock[] {
  if (preset === null) return [...gameBlocks];

  const byId = new Map(gameBlocks.map((block) => [block.id, block] as const));
  const result: RuntimeBlock[] = [];
  const usedGameIds = new Set<string>();

  const pushPayload = (id: string, enabled: boolean): void => {
    if (usedGameIds.has(id)) return;
    const payload = clonePayload(id, enabled, byId);
    if (payload === null) return;
    usedGameIds.add(id);
    result.push(payload);
  };

  preset.blocks.forEach((block, index) => {
    const engineId = ENGINE_PAYLOADS[block.id];
    if (engineId !== undefined) {
      pushPayload(engineId, true);
      return;
    }

    if (block.marker) {
      for (const id of MARKER_PAYLOADS[block.id] ?? []) pushPayload(id, block.enabled);
      return;
    }

    result.push(presetRuntimeBlock(block, index));
  });

  // Preset lạ có thể thiếu marker. Không được vì thế mà mất luật, xúc sắc,
  // hành động hay cú pháp cập nhật biến; đây là hợp đồng an toàn của engine.
  for (const id of REQUIRED_ENGINE) pushPayload(id, true);

  // Khối do người chơi tự thêm trong Prompt Manager không có marker chuẩn.
  // Giữ chúng ngay trước khối hành động để preset không làm mất tuỳ biến cũ.
  const custom = gameBlocks.filter(
    (block) => !usedGameIds.has(block.id) && !block.locked && block.id !== 'vai-tro',
  );
  const actionIndex = result.findIndex((block) => block.id === 'hanh-dong');
  result.splice(actionIndex === -1 ? result.length : actionIndex, 0, ...custom);

  // Một preset không có system prompt vẫn cần vai trò người kể mặc định.
  if (!result.some((block) => block.enabled && block.role === 'system')) {
    const voice = clonePayload('vai-tro', true, byId);
    if (voice !== null) result.unshift(voice);
  }

  return result.map((block, index) => ({ ...block, order: index + 1 }));
}
