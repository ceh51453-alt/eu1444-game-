/**
 * Kiểm tra trên FILE PRESET THẬT của người chơi, nếu nó còn nằm ở gốc dự án.
 *
 * Bộ mẫu trong `presets/mau/` là ba file rút gọn dựng riêng cho test. File này
 * thì không: nó là preset đang chơi thật, 212 khối và hàng chục regex, và nó là
 * chỗ duy nhất chứng minh được đường đi từ "bấm Nạp preset" tới "temperature
 * 1.1 đã nằm trong hồ sơ kết nối" là thông.
 *
 * Vắng file thì bỏ qua chứ không đỏ: nó không phải tài sản của repo.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { importSillyTavernPreset } from './import';
import { tuneFromPreset } from './params';

const ROOT = join(import.meta.dirname, '..', '..', '..');

function findRealPreset(): string | null {
  if (!existsSync(ROOT)) return null;
  const name = readdirSync(ROOT).find((file) => file.startsWith('Tawa') && file.endsWith('.json'));
  return name === undefined ? null : join(ROOT, name);
}

const path = findRealPreset();

describe.skipIf(path === null)('preset thật — tham số phải có hiệu lực sau khi nạp', () => {
  it('nạp được và đọc ra đúng hai trần token', () => {
    const raw: unknown = JSON.parse(readFileSync(path as string, 'utf8'));
    const { preset, report } = importSillyTavernPreset(raw, 'tawa');

    expect(report.totalBlocks).toBeGreaterThan(100);
    expect(preset.regexScripts.length).toBeGreaterThan(0);

    const tuning = tuneFromPreset(preset.source, 'openai');
    expect(tuning.params['temperature']).toBe(1.1);
    expect(tuning.params['top_p']).toBe(0.9);
    expect(tuning.params['top_k']).toBe(64);
    expect(tuning.params['reasoning_effort']).toBe('max');
    expect(tuning.stream).toBe(true);

    // Đúng cái lỗi người chơi báo: 65k là ĐẦU RA, 2 triệu là ĐẦU VÀO.
    expect(tuning.tokens.input).toBe(2000000);
    expect(tuning.tokens.output).toBe(65000);
  });
});
