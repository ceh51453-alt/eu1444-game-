import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { importSillyTavernPreset } from '@/ai/preset/import';
import { applyRegexScripts } from '@/ai/regex/runner';
import { sanitizeMarkup, splitNarrative } from './narrative-html';

const ROOT = join(import.meta.dirname, '..', '..', '..');
const FILE = readdirSync(ROOT).find((name) => name.startsWith('Tawa') && name.endsWith('.json'));

function loadTawa(): ReturnType<typeof importSillyTavernPreset> {
  if (FILE === undefined) throw new Error('Không tìm thấy preset Tawa ở thư mục gốc.');
  const raw: unknown = JSON.parse(readFileSync(join(ROOT, FILE), 'utf8'));
  return importSillyTavernPreset(raw, 'tawa-html-test');
}

describe.skipIf(FILE === undefined)('preset Tawa — HTML do regex sinh ra', () => {
  it('đưa bảng lựa chọn dạng tài liệu đầy đủ vào iframe', () => {
    const { preset } = loadTawa();
    const choices = Array.from({ length: 10 }, (_, index) =>
      `${String(index + 1)}|Lựa chọn ${String(index + 1)}|Mô tả ${String(index + 1)}`,
    ).join('\n');
    const result = applyRegexScripts(`<choices>\n${choices}\n</choices>`, preset.regexScripts, {
      placement: 2,
      target: 'display',
    });

    const segments = splitNarrative(result.text);
    expect(segments.some((segment) => segment.kind === 'document')).toBe(true);
    expect(result.text).toContain('<!DOCTYPE html>');
    expect(result.text).toContain('Lựa chọn 1');
  });

  it('giữ HTML rời của khung tóm tắt sau khi lọc', () => {
    const { preset } = loadTawa();
    const source = [
      '<meow_FM>',
      'serial: 12',
      'time: Bình minh',
      'scene: Đại sảnh',
      'plot: Hội đồng bắt đầu',
      'seeds: Một lá thư bị giấu',
      '</meow_FM>',
    ].join('\n');
    const result = applyRegexScripts(source, preset.regexScripts, { placement: 2, target: 'display' });
    const markup = splitNarrative(result.text).find((segment) => segment.kind === 'markup');

    expect(markup?.kind).toBe('markup');
    if (markup?.kind !== 'markup') return;
    const safe = sanitizeMarkup(markup.html);
    expect(safe).toContain('tawa-summary-wrapper');
    expect(safe).toContain('<details');
    expect(safe).toContain('<style>');
  });
});
