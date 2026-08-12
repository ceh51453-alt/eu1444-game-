import { describe, expect, it } from 'vitest';
import { defaultBlocks } from '@/ai/blocks';
import { importSillyTavernPreset } from './import';
import { runtimeBlocksForPreset } from './runtime';

describe('preset runtime bridge', () => {
  it('đưa nội dung preset vào prompt và thay marker bằng khối game thật', () => {
    const { preset } = importSillyTavernPreset({
      prompts: [
        { identifier: 'main', role: 'system', content: 'GIỌNG RIÊNG CỦA PRESET' },
        { identifier: 'scenario', marker: true, role: 'system', content: '' },
        { identifier: 'chatHistory', marker: true, role: 'user', content: '' },
      ],
      prompt_order: [
        {
          character_id: 100001,
          order: [
            { identifier: 'main', enabled: true },
            { identifier: 'scenario', enabled: true },
            { identifier: 'chatHistory', enabled: true },
          ],
        },
      ],
    });

    const blocks = runtimeBlocksForPreset(preset, defaultBlocks());
    expect(blocks.some((block) => block.template.includes('GIỌNG RIÊNG CỦA PRESET'))).toBe(true);
    expect(blocks.some((block) => block.id === 'boi-canh')).toBe(true);
    expect(blocks.some((block) => block.id === 'lich-su-gan')).toBe(true);
    expect(blocks.some((block) => block.id === 'codex-memory')).toBe(true);
    expect(blocks.some((block) => block.id === 'ket-qua-xuc-sac')).toBe(true);
    expect(blocks.at(-1)?.id).toBe('dinh-dang-dau-ra');
  });

  it('không đổi bộ Prompt Manager khi chưa nạp preset', () => {
    const game = defaultBlocks();
    expect(runtimeBlocksForPreset(null, game)).toEqual(game);
  });
});
