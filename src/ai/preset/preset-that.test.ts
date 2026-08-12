/**
 * Bài test cuối của Phần 1 mục 9.11, chạy trên BA PRESET THẬT do người ra đề
 * cung cấp — không phải preset tự dựng.
 *
 * Đây là chỗ duy nhất phát hiện được những thứ preset tổng hợp không bao giờ
 * lộ ra, ví dụ `SPreset.RegexBinding` thực ra là `{ regexes: [...] }` chứ
 * không phải một mảng.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { assemblePrompt, checkLockedPlacement } from './assemble';
import { CHAT_HISTORY_MARKER, LOCKED_BLOCK_IDS, MARKER_TO_GAME_BLOCK } from './blocks';
import { exportSillyTavernPreset } from './export';
import { formatImportReport, importSillyTavernPreset, type ImportResult } from './import';

const DIR = join(import.meta.dirname, '..', '..', '..', 'presets', 'that');

const FILES = readdirSync(DIR).filter((name) => name.endsWith('.json'));

function importReal(file: string): ImportResult {
  return importSillyTavernPreset(
    JSON.parse(readFileSync(join(DIR, file), 'utf8')),
    file.replace(/\.json$/i, ''),
  );
}

describe('preset thật — nạp được cả ba', () => {
  it('có đủ ba file', () => {
    expect(FILES).toHaveLength(3);
  });

  it.each(FILES)('nạp được "%s" và in ra báo cáo import', (file) => {
    const { preset, report } = importReal(file);
    console.log(`\n${'='.repeat(70)}\n${formatImportReport(report)}`);

    expect(report.engineInserted).toHaveLength(4);
    expect(preset.blocks.length).toBeGreaterThan(100);
    expect(checkLockedPlacement(preset.blocks)).toEqual([]);
  });

  it.each(FILES)('render thử prompt hoàn chỉnh từ "%s" với state rỗng', (file) => {
    const { preset } = importReal(file);
    const assembled = assemblePrompt(preset);

    const ids = assembled.messages.map((message) => message.blockId);
    for (const locked of Object.values(LOCKED_BLOCK_IDS)) {
      expect(ids, `${file} thiếu ${locked}`).toContain(locked);
    }
    expect(assembled.messages.length).toBeGreaterThan(20);
    console.log(
      `\n--- "${file}": ${assembled.messages.length} khối bật, ${assembled.skipped.length} khối tắt, ${assembled.pendingMarkers.length} ô cắm chờ Phần 3 ---`,
    );
  });
});

describe('preset thật — bốn cái bẫy có thật trong dữ liệu', () => {
  it('bẫy 1: lệch enabled xuất hiện thật, và luôn lấy theo prompt_order', () => {
    const { preset, report } = importReal(
      FILES.find((file) => file.startsWith('Minh')) ?? FILES[0]!,
    );
    // File Minh Nguyệt có 21 mục lệch — nhiều gấp năm lần con số 4 mà đặc tả nêu.
    expect(report.enabledMismatches.length).toBeGreaterThan(0);

    for (const mismatch of report.enabledMismatches) {
      const block = preset.blocks.find((candidate) => candidate.id === mismatch.identifier);
      expect(block?.enabled, `${mismatch.identifier} phải theo prompt_order`).toBe(mismatch.inOrder);
    }
  });

  it('bẫy 2: mồ côi có thật ở cả ba file, luôn bị tắt và không bị vứt', () => {
    for (const file of FILES) {
      const { preset, report } = importReal(file);
      expect(report.orphans.length, `${file} phải có khối mồ côi`).toBeGreaterThan(0);

      for (const id of report.orphans) {
        const block = preset.blocks.find((candidate) => candidate.id === id);
        expect(block, `${file}: mồ côi ${id} bị vứt mất`).toBeDefined();
        expect(block?.enabled).toBe(false);
      }
    }
  });

  it('bẫy 3: dùng identifier, và không file nào có id lệch', () => {
    for (const file of FILES) {
      const { report } = importReal(file);
      // Ba file này id luôn trùng identifier — cái bẫy vẫn phải được gác,
      // nhưng ở đây nó không nổ.
      expect(report.idMismatches).toEqual([]);
    }
  });

  it('bẫy 4: cả ba file dùng đúng character_id 100001', () => {
    for (const file of FILES) {
      const { report } = importReal(file);
      expect(report.orderSource).toEqual({ characterId: 100001, usedGlobalDefault: true });
      expect(report.danglingOrderEntries).toEqual([]);
    }
  });
});

describe('preset thật — tám ô cắm và bốn khối [LOCKED]', () => {
  it('cả ba file có đủ tám ô cắm, ánh xạ hết sang khối của game', () => {
    for (const file of FILES) {
      const { report } = importReal(file);
      const identifiers = report.markers.map((marker) => marker.identifier).sort();
      expect(identifiers, file).toEqual(Object.keys(MARKER_TO_GAME_BLOCK).sort());

      for (const marker of report.markers) {
        expect(marker.gameBlock, `${file}/${marker.identifier}`).not.toContain('chưa có');
      }
    }
  });

  it('dialogueExamples bị ép TẮT ở cả ba file', () => {
    for (const file of FILES) {
      const { preset } = importReal(file);
      expect(preset.blocks.find((block) => block.id === 'dialogueExamples')?.enabled, file).toBe(false);
    }
  });

  it('khối KẾT QUẢ XÚC SẮC luôn nằm ngay trước chatHistory', () => {
    for (const file of FILES) {
      const { preset } = importReal(file);
      const history = preset.blocks.findIndex((block) => block.id === CHAT_HISTORY_MARKER);
      const dice = preset.blocks.findIndex((block) => block.id === LOCKED_BLOCK_IDS.diceResults);
      const action = preset.blocks.findIndex((block) => block.id === LOCKED_BLOCK_IDS.playerAction);

      expect(history, file).toBeGreaterThan(-1);
      expect(dice, file).toBe(history - 1);
      expect(action, file).toBe(history + 1);
    }
  });
});

describe('preset thật — regex và script', () => {
  it('đọc được RegexBinding dạng { regexes: [...] }, không phải mảng trần', () => {
    const tawa = FILES.find((file) => file.startsWith('Tawa'));
    expect(tawa).toBeDefined();
    const { preset, report } = importReal(tawa!);

    // 27 trong SPreset.RegexBinding.regexes + 23 trong extensions.regex_scripts.
    expect(report.regexScripts.total).toBe(50);
    expect(preset.regexScripts.filter((script) => script.rejected === undefined).length).toBeGreaterThan(
      40,
    );
  });

  it('mọi mẫu regex thật đều biên dịch được và không bị bộ gác bắt nhầm', () => {
    for (const file of FILES) {
      const { preset } = importReal(file);
      const rejected = preset.regexScripts.filter((script) => script.rejected !== undefined);
      if (rejected.length > 0) {
        console.log(
          `\n"${file}" có ${rejected.length} regex bị từ chối:\n${rejected
            .map((script) => `  - ${script.name}: ${script.rejected}`)
            .join('\n')}`,
        );
      }
      // Bộ gác chỉ được chặn mẫu thật sự nguy hiểm; chặn nhầm hàng loạt là hỏng.
      expect(rejected.length, `${file} bị chặn quá nhiều regex`).toBeLessThanOrEqual(
        Math.ceil(preset.regexScripts.length * 0.2),
      );
    }
  });

  it('giữ nguyên cờ regex tác giả viết', () => {
    const ako = FILES.find((file) => file.includes('Ako'));
    const { preset } = importReal(ako!);
    // Preset Ako viết mẫu trần, không cờ. Thêm `g` vào là đổi ngữ nghĩa.
    const bare = preset.regexScripts.filter((script) => script.flags === '');
    expect(bare.length).toBeGreaterThan(0);
  });

  it('phân loại đúng script 39k ký tự và các script còn lại', () => {
    const minh = FILES.find((file) => file.startsWith('Minh'));
    const { preset, report } = importReal(minh!);

    expect(report.helperScripts.ui + report.helperScripts.compute).toBe(5);
    const longest = [...preset.helperScripts].sort((a, b) => b.code.length - a.code.length)[0];
    expect(longest?.code.length).toBeGreaterThan(39000);
    console.log(
      `\nScript trong "${minh}":\n${preset.helperScripts
        .map((script) => `  - ${script.name} · ${script.kind} (${script.kindReason}) · ${script.code.length} ký tự · ${script.enabled ? 'bật' : 'tắt'}`)
        .join('\n')}`,
    );
  });

  it('file không có SPreset vẫn nạp bình thường', () => {
    const ako = FILES.find((file) => file.includes('Ako'));
    const { report } = importReal(ako!);
    expect(report.helperScripts).toEqual({ ui: 0, compute: 0 });
    expect(report.regexScripts.total).toBeGreaterThan(0);
    expect(report.extensions.some((entry) => entry.key === 'extensions.entryGrouping')).toBe(true);
  });
});

describe('preset thật — export ngược không làm hỏng file của người chơi', () => {
  it.each(FILES)('vòng import → export → import ổn định với "%s"', (file) => {
    const first = importReal(file);
    const exported = exportSillyTavernPreset(first.preset);
    const second = importSillyTavernPreset(exported, `${file}-vong-2`);

    expect(second.preset.blocks).toHaveLength(first.preset.blocks.length);
    expect(second.report.orphans.sort()).toEqual(first.report.orphans.sort());
    expect(second.report.engineInserted).toHaveLength(4);
    expect(checkLockedPlacement(second.preset.blocks)).toEqual([]);
  });

  it('không xuất khối engine ra ngoài, giữ nguyên extensions', () => {
    for (const file of FILES) {
      const { preset } = importReal(file);
      const exported = exportSillyTavernPreset(preset);
      const identifiers = (exported.prompts ?? []).map((entry) => entry.identifier);

      for (const locked of Object.values(LOCKED_BLOCK_IDS)) {
        expect(identifiers, file).not.toContain(locked);
      }
      expect(exported.extensions).toEqual(preset.source.extensions);
    }
  });
});
