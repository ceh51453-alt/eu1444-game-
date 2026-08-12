import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { assemblePrompt, checkLockedPlacement, orderBlocks } from './assemble';
import { LOCKED_BLOCK_IDS, LOCKED_BLOCK_SPECS } from './blocks';
import { exportSillyTavernPreset } from './export';
import { dedupeRegexScripts, formatImportReport, importSillyTavernPreset, PresetImportError } from './import';

const SAMPLES_DIR = join(import.meta.dirname, '..', '..', '..', 'presets', 'mau');

function loadSample(name: string): unknown {
  return JSON.parse(readFileSync(join(SAMPLES_DIR, `${name}.json`), 'utf8'));
}

function importSample(name: string) {
  return importSillyTavernPreset(loadSample(name), name);
}

describe('preset — nạp ba file mẫu và in báo cáo (Phần 1 mục 9.11)', () => {
  it.each(['day-du', 'toi-gian', 'khong-lich-su'])('nạp được "%s" và in ra báo cáo', (name) => {
    const { preset, report } = importSample(name);

    const text = formatImportReport(report);
    // Báo cáo là sản phẩm bắt buộc của mục 9.3 — in ra để đối chiếu bằng mắt.
    console.log(`\n${'='.repeat(60)}\n${text}`);

    expect(text).toContain('Đã bổ sung 4 khối bắt buộc của engine.');
    expect(report.engineInserted).toHaveLength(4);
    expect(preset.blocks.length).toBeGreaterThan(4);
  });

  it('render thử prompt hoàn chỉnh với state rỗng', () => {
    for (const name of ['day-du', 'toi-gian', 'khong-lich-su']) {
      const { preset } = importSample(name);
      const assembled = assemblePrompt(preset);

      // Bốn khối [LOCKED] luôn bật, nên luôn có mặt trong prompt đã ghép.
      const ids = assembled.messages.map((message) => message.blockId);
      for (const locked of Object.values(LOCKED_BLOCK_IDS)) {
        expect(ids, `${name} thiếu ${locked}`).toContain(locked);
      }
      expect(assembled.messages.every((message) => message.content !== undefined)).toBe(true);

      console.log(
        `\n--- prompt ghép từ "${name}" (${assembled.messages.length} khối) ---\n${assembled.messages
          .map((message) => `[${message.role}] ${message.blockId}: ${message.content.slice(0, 60)}`)
          .join('\n')}`,
      );
    }
  });
});

describe('preset — bốn cái bẫy khi import (mục 6.2)', () => {
  it('bẫy 1: enabled lấy theo prompt_order, không lấy theo prompts[]', () => {
    const { preset, report } = importSample('day-du');

    // scenario: prompts[].enabled = true nhưng prompt_order = false → phải TẮT.
    expect(preset.blocks.find((block) => block.id === 'scenario')?.enabled).toBe(false);
    // styleGuide: prompts[].enabled = false nhưng prompt_order = true → phải BẬT.
    expect(preset.blocks.find((block) => block.id === 'styleGuide')?.enabled).toBe(true);

    const mismatched = report.enabledMismatches.map((entry) => entry.identifier).sort();
    expect(mismatched).toEqual(['charDescription', 'charPersonality', 'scenario', 'styleGuide']);
    expect(report.enabledMismatches).toHaveLength(4);
  });

  it('bẫy 2: khối mồ côi xuống cuối, mặc định TẮT, có cảnh báo, không bị vứt', () => {
    const { preset, report } = importSample('day-du');

    expect(report.orphans.sort()).toEqual([
      'orphanLegacyJailbreak',
      'orphanTonePolice',
      'orphanUnused',
    ]);
    for (const id of report.orphans) {
      const block = preset.blocks.find((candidate) => candidate.id === id);
      expect(block, `mồ côi ${id} bị vứt mất`).toBeDefined();
      expect(block?.enabled).toBe(false);
      expect(block?.source).toBe('orphan');
    }
    expect(report.warnings.some((warning) => warning.includes('mồ côi'))).toBe(true);
  });

  it('bẫy 3: chỉ nối bằng identifier, bỏ qua id', () => {
    const { preset, report } = importSample('day-du');
    expect(preset.blocks.length).toBeGreaterThan(0);

    expect(report.idMismatches).toEqual([
      { identifier: 'styleGuide', id: 'style-guide-v2' },
      { identifier: 'nudgeDepth2', id: 'nudge-depth-2' },
    ]);
    // Không có khối nào mang id thay vì identifier.
    expect(preset.blocks.some((block) => block.id === 'style-guide-v2')).toBe(false);
    expect(preset.blocks.some((block) => block.id === 'styleGuide')).toBe(true);
  });

  it('bẫy 4: chọn prompt_order có character_id 100001, không lấy mục đầu tiên', () => {
    const { preset, report } = importSample('day-du');

    expect(report.orderSource).toEqual({ characterId: 100001, usedGlobalDefault: true });
    // Mục decoy 54321 chỉ có 2 khối; nếu lấy nhầm thì styleGuide sẽ thành mồ côi.
    expect(report.orphans).not.toContain('styleGuide');
    expect(preset.blocks.find((block) => block.id === 'styleGuide')?.source).toBe('preset');
  });

  it('báo lại khi prompt_order trỏ tới identifier không tồn tại', () => {
    const { report } = importSample('day-du');
    expect(report.danglingOrderEntries).toEqual(['khongTonTai']);
  });

  it('không có prompt_order thì mọi khối là mồ côi và tắt hết', () => {
    const { preset, report } = importSample('toi-gian');
    expect(report.orderSource.characterId).toBeNull();
    expect(report.orphans.sort()).toEqual(['chatHistory', 'main']);
    expect(preset.blocks.filter((block) => block.source === 'orphan').every((block) => !block.enabled)).toBe(
      true,
    );
  });
});

describe('preset — bốn khối [LOCKED] (mục 6.4)', () => {
  it('chèn đủ bốn khối vào đúng vị trí', () => {
    const { preset } = importSample('day-du');
    expect(checkLockedPlacement(preset.blocks)).toEqual([]);
  });

  it('chèn đủ bốn khối kể cả khi preset không có ô cắm chatHistory', () => {
    const { preset, report } = importSample('khong-lich-su');
    expect(report.engineInserted).toHaveLength(4);
    for (const spec of LOCKED_BLOCK_SPECS) {
      expect(preset.blocks.some((block) => block.id === spec.id)).toBe(true);
    }
    expect(report.warnings.some((warning) => warning.includes('chatHistory'))).toBe(true);
  });

  it('khối engine luôn bật, luôn locked, ưu tiên ngân sách cao nhất', () => {
    const { preset } = importSample('day-du');
    const engine = preset.blocks.filter((block) => block.source === 'engine');
    expect(engine).toHaveLength(4);
    for (const block of engine) {
      expect(block.enabled).toBe(true);
      expect(block.locked).toBe(true);
      expect(block.budgetPriority).toBe(10);
    }
  });

  it('khối forbid_overrides cũng được coi là locked (mục 6.5)', () => {
    const { preset } = importSample('day-du');
    expect(preset.blocks.find((block) => block.id === 'styleGuide')?.locked).toBe(true);
  });
});

describe('preset — ánh xạ trường và marker (mục 6.3, 6.5)', () => {
  it('ánh xạ tám ô cắm sang khối của game', () => {
    const { report } = importSample('day-du');
    const byId = new Map(report.markers.map((marker) => [marker.identifier, marker.gameBlock]));

    expect(byId.get('personaDescription')).toContain('khối 5');
    expect(byId.get('charDescription')).toContain('khối 8');
    expect(byId.get('charPersonality')).toContain('khối 8');
    expect(byId.get('scenario')).toContain('khối 3');
    expect(byId.get('worldInfoBefore')).toContain('khối 4');
    expect(byId.get('worldInfoAfter')).toContain('khối 4');
    expect(byId.get('chatHistory')).toContain('khối 10');
    expect(byId.get('dialogueExamples')).toContain('mặc định tắt');
  });

  it('dialogueExamples bị ép TẮT dù prompt_order bật', () => {
    const { preset } = importSample('day-du');
    expect(preset.blocks.find((block) => block.id === 'dialogueExamples')?.enabled).toBe(false);
  });

  it('injection_position 1 thành placement theo độ sâu', () => {
    const { preset } = importSample('day-du');
    const nudge = preset.blocks.find((block) => block.id === 'nudgeDepth2');
    expect(nudge?.placement).toEqual({ kind: 'depth', depth: 2 });
    expect(nudge?.injectionOrder).toBe(20);
    expect(nudge?.injectionTrigger).toEqual(['normal']);
  });

  it('suy ra budgetPriority đúng bảng ở mục 6.5', () => {
    const { preset } = importSample('day-du');
    const priority = (id: string): number | undefined =>
      preset.blocks.find((block) => block.id === id)?.budgetPriority;

    expect(priority('chatHistory')).toBe(5);
    expect(priority('worldInfoBefore')).toBe(7);
    expect(priority('worldInfoAfter')).toBe(7);
    expect(priority(LOCKED_BLOCK_IDS.updateSyntax)).toBe(10);
    expect(priority('main')).toBe(6);
  });

  it('xếp khối theo độ sâu sau khối tuần tự', () => {
    const { preset } = importSample('day-du');
    const ordered = orderBlocks(preset.blocks);
    const depthIndex = ordered.findIndex((block) => block.placement.kind === 'depth');
    const lastSequential = ordered.map((block) => block.placement.kind).lastIndexOf('sequential');
    expect(depthIndex).toBeGreaterThan(lastSequential);
  });
});

describe('preset — extensions, regex, script', () => {
  it('nhận diện đủ các khóa extensions và nói rõ cái nào chưa làm', () => {
    const { report } = importSample('day-du');
    const keys = report.extensions.map((entry) => entry.key);

    expect(keys).toContain('extensions.SPreset.RegexBinding');
    expect(keys).toContain('extensions.SPreset.ChatSquash');
    expect(keys).toContain('extensions.SPreset.MacroNest');
    expect(keys).toContain('extensions.regex_scripts');
    expect(keys).toContain('extensions.tavern_helper.scripts');
    expect(keys).toContain('extensions.entryGrouping');

    const squash = report.extensions.find((entry) => entry.key === 'extensions.SPreset.ChatSquash');
    expect(squash?.status).toBe('chưa hỗ trợ');
  });

  it('nạp regex từ cả RegexBinding lẫn regex_scripts, từ chối mẫu tham lam', () => {
    const { preset, report } = importSample('day-du');
    expect(report.regexScripts.total).toBe(4);
    expect(report.regexScripts.rejected).toBe(1);

    const greedy = preset.regexScripts.find((script) => script.id === 'greedy-danger');
    expect(greedy?.rejected).toContain('quay lui thảm họa');
    expect(preset.regexScripts.find((script) => script.id === 'trim-ooc')?.enabled).toBe(false);
  });

  /**
   * Preset thật chép cả bộ regex vào CẢ HAI khóa, và ở một mẫu, hai bản không
   * khớp nhau về `disabled`. Mẫu đó là `^([\s\S]*)$` → `""` — bản đang bật xóa
   * trắng mọi đoạn văn hiển thị. Đây là bài kiểm cho đúng ca đó.
   */
  it('gộp regex trùng id giữa hai khóa, và bản bị TẮT thắng', () => {
    expect(dedupeRegexScripts([
      { id: 'an-het', scriptName: 'Ẩn display', findRegex: '^([\\s\\S]*)$', replaceString: '', disabled: true },
      { id: 'an-het', scriptName: 'Ẩn display', findRegex: '^([\\s\\S]*)$', replaceString: '', disabled: false },
      { id: 'lam-dep', findRegex: '<thinking>', disabled: false },
      { id: 'lam-dep', findRegex: '<thinking>', disabled: false },
      { findRegex: 'khong-co-id' },
      { findRegex: 'khong-co-id' },
    ])).toEqual([
      { id: 'an-het', scriptName: 'Ẩn display', findRegex: '^([\\s\\S]*)$', replaceString: '', disabled: true },
      { id: 'lam-dep', findRegex: '<thinking>', disabled: false },
      { findRegex: 'khong-co-id' },
      { findRegex: 'khong-co-id' },
    ]);
  });

  it('phân loại script tavern_helper theo nhiệm vụ', () => {
    const { preset, report } = importSample('day-du');
    expect(report.helperScripts).toEqual({ ui: 1, compute: 1 });

    const ui = preset.helperScripts.find((script) => script.id === 'ui-fold-thinking');
    expect(ui?.kind).toBe('ui');
    expect(ui?.kindReason).toContain('document');

    const compute = preset.helperScripts.find((script) => script.id === 'compute-derive');
    expect(compute?.kind).toBe('compute');
  });
});

describe('preset — export ngược (mục 9.10)', () => {
  it('không xuất bốn khối engine ra ngoài', () => {
    const { preset } = importSample('day-du');
    const exported = exportSillyTavernPreset(preset);
    const identifiers = (exported.prompts ?? []).map((entry) => entry.identifier);
    for (const locked of Object.values(LOCKED_BLOCK_IDS)) {
      expect(identifiers).not.toContain(locked);
    }
  });

  it('vòng import → export → import không sinh thêm khối', () => {
    const first = importSample('day-du');
    const exported = exportSillyTavernPreset(first.preset);
    const second = importSillyTavernPreset(exported, 'day-du-vong-2');

    expect(second.preset.blocks).toHaveLength(first.preset.blocks.length);
    expect(second.report.engineInserted).toHaveLength(4);
    expect(checkLockedPlacement(second.preset.blocks)).toEqual([]);
  });

  it('giữ nguyên trường lạ của file gốc', () => {
    const { preset } = importSample('day-du');
    const exported = exportSillyTavernPreset(preset);
    expect(exported['wi_format']).toBe('{0}');
    expect(exported['scenario_format']).toBe('[Bối cảnh: {{scenario}}]');
    expect(exported.extensions?.entryGrouping).toEqual({ groups: [] });
  });

  it('mồ côi vẫn nằm trong prompts[] nhưng không vào prompt_order', () => {
    const { preset } = importSample('day-du');
    const exported = exportSillyTavernPreset(preset);
    const identifiers = (exported.prompts ?? []).map((entry) => entry.identifier);
    const ordered = (exported.prompt_order?.[0]?.order ?? []).map((entry) => entry.identifier);

    expect(identifiers).toContain('orphanUnused');
    expect(ordered).not.toContain('orphanUnused');
  });
});

describe('preset — từ chối file hỏng thay vì nạp một nửa (R4)', () => {
  it('ném PresetImportError kèm danh sách lỗi cụ thể', () => {
    const broken = { prompts: [{ name: 'thiếu identifier' }] };
    expect(() => importSillyTavernPreset(broken, 'hong')).toThrow(PresetImportError);

    try {
      importSillyTavernPreset(broken, 'hong');
    } catch (error) {
      expect(error).toBeInstanceOf(PresetImportError);
      expect((error as PresetImportError).issues.join(' ')).toContain('identifier');
    }
  });

  it('từ chối khi prompt_order sai kiểu', () => {
    expect(() =>
      importSillyTavernPreset({ prompt_order: [{ character_id: 'không phải số', order: [] }] }, 'hong'),
    ).toThrow(PresetImportError);
  });
});
