/**
 * TẦNG C — gói xuất/nhập (Phần 0 mục 4).
 *
 * Luật đang gác ở đây, theo đúng thứ tự mục 4 viết:
 *   xuất  = gộp A + B, có `schemaVersion` và checksum
 *   nhập  = migrate TRƯỚC, Zod validate TRƯỚC, ghi SAU — file hỏng để save cũ
 *           nguyên vẹn (R4)
 *
 * Ranh giới quan trọng nhất và cũng dễ cài sai nhất: cái gì CHẶN, cái gì chỉ
 * CẢNH BÁO. Chặn quá tay thì Tầng C mất đúng công dụng chính của nó — mở save
 * ra sửa tay lúc debug.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { initialRngState, MAIN_STREAM } from '@/core/rng';
import type { TurnRecord } from '@/core/turn';
import { registerGameSlices } from '@/state/register';
import { CURRENT_SCHEMA_VERSION } from '@/state/schema';
import { slices } from '@/state/slices';
import { createInitialState } from '@/state/store';
import {
  BUNDLE_FORMAT,
  BundleError,
  buildBundle,
  canonicalJson,
  checksum,
  parseBundle,
  serializeBundle,
} from './bundle';

beforeEach(() => {
  if (slices.get('character') === undefined) registerGameSlices();
});

function record(turn: number): TurnRecord {
  const state = createInitialState('hat-giong-goi');
  return {
    turn,
    gameDate: state.meta.gameDate,
    rngBefore: state.meta.rng,
    input: { kind: 'freeform', text: `hành động ${turn}` },
    outcome: { checks: [], engineOps: [], timeCost: 10, rngAfter: state.meta.rng },
    narrative: `kể lượt ${turn}`,
    patch: { applied: true, opCount: 1, rejections: [] },
    tick: { eventCount: 0, llmCallsUsed: 0 },
    reachedStep: 'persist',
    wallClock: 1_700_000_000_000 + turn,
  };
}

/** Đi qua JSON đúng như một file thật, để không test trên tham chiếu trong RAM. */
function roundTrip(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value)) as unknown;
}

describe('JSON chuẩn hóa và checksum', () => {
  it('thứ tự khóa không đổi được checksum', () => {
    const left = { b: 1, a: { d: 2, c: [3, 4] } };
    const right = { a: { c: [3, 4], d: 2 }, b: 1 };
    expect(canonicalJson(left)).toBe(canonicalJson(right));
    expect(checksum(canonicalJson(left))).toBe(checksum(canonicalJson(right)));
  });

  it('thứ tự PHẦN TỬ MẢNG thì có đổi — mảng là dữ liệu, không phải tập hợp', () => {
    expect(canonicalJson([1, 2])).not.toBe(canonicalJson([2, 1]));
  });

  it('đổi một ký tự là đổi checksum', () => {
    expect(checksum('a')).not.toBe(checksum('b'));
    expect(checksum('a')).toHaveLength(16);
  });
});

describe('xuất', () => {
  it('gói mang schemaVersion và checksum', () => {
    const state = createInitialState('hat-giong-goi', 'Aldric');
    const bundle = buildBundle(state, [record(1), record(2)], 1_700_000_000_000);

    expect(bundle.format).toBe(BUNDLE_FORMAT);
    expect(bundle.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(bundle.checksum).toHaveLength(16);
    expect(bundle.turns).toHaveLength(2);
    expect(serializeBundle(bundle).endsWith('\n')).toBe(true);
  });

  it('cùng một ván chơi xuất hai lần ra cùng một checksum', () => {
    const state = createInitialState('hat-giong-goi', 'Aldric');
    const first = buildBundle(state, [record(1)], 1);
    const second = buildBundle(structuredClone(state), [record(1)], 999);
    expect(second.checksum).toBe(first.checksum);
  });
});

describe('nhập — cái gì được vào', () => {
  it('gói xuất ra nhập lại được, không cảnh báo nào', () => {
    const state = createInitialState('hat-giong-goi', 'Aldric');
    state.meta.turn = 12;
    const parsed = parseBundle(roundTrip(buildBundle(state, [record(11), record(12)])));

    expect(parsed.warnings).toEqual([]);
    expect(parsed.bundle.state.meta.turn).toBe(12);
    expect(parsed.bundle.state.player.name).toBe('Aldric');
    expect(parsed.bundle.turns.map((turn) => turn.turn)).toEqual([11, 12]);
  });

  it('save v1 được NÂNG CẤP chứ không bị vứt', () => {
    const legacy = createInitialState('hat-giong-cu') as unknown as Record<string, unknown>;
    const meta = { ...(legacy['meta'] as Record<string, unknown>) };
    meta['schemaVersion'] = 1;
    meta['rngState'] = initialRngState('hat-giong-cu');
    delete meta['rng'];

    const parsed = parseBundle({
      format: BUNDLE_FORMAT,
      schemaVersion: 1,
      exportedAt: 1,
      checksum: 'khong-quan-trong',
      state: { ...legacy, meta },
      turns: [],
    });

    expect(parsed.bundle.state.meta.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(parsed.bundle.state.meta.rng.streams[MAIN_STREAM]).toBeDefined();
    expect(parsed.warnings.some((warning) => warning.includes('Đã nâng save'))).toBe(true);
  });

  it('sửa tay xong vẫn nhập được, chỉ CẢNH BÁO checksum lệch', () => {
    // Sửa save bằng trình soạn thảo là một trong những lý do Tầng C tồn tại
    // (mục 4). Chặn ở đây là khóa đúng công dụng chính của nó.
    const state = createInitialState('hat-giong-goi', 'Aldric');
    const bundle = roundTrip(buildBundle(state, [])) as Record<string, unknown>;
    (bundle['state'] as { player: { name: string } }).player.name = 'Reinhard';

    const parsed = parseBundle(bundle);
    expect(parsed.bundle.state.player.name).toBe('Reinhard');
    expect(parsed.warnings.some((warning) => warning.includes('Checksum'))).toBe(true);
  });

  it('biên bản lượt hỏng bị bỏ, ván chơi vẫn vào', () => {
    const state = createInitialState('hat-giong-goi');
    const bundle = roundTrip(buildBundle(state, [record(1), record(2)])) as Record<string, unknown>;
    const turns = bundle['turns'] as unknown[];
    turns[0] = { turn: 'không phải số' };

    const parsed = parseBundle(bundle);
    expect(parsed.bundle.turns.map((turn) => turn.turn)).toEqual([2]);
    expect(parsed.warnings.some((warning) => warning.includes('1 biên bản lượt'))).toBe(true);
  });
});

describe('nhập — cái gì bị chặn (R4)', () => {
  it('file lạ', () => {
    expect(() => parseBundle({ hello: 'world' })).toThrow(BundleError);
    expect(() => parseBundle('không phải object')).toThrow(BundleError);
  });

  it('save của bản build mới hơn — hạ cấp là mất dữ liệu', () => {
    const state = createInitialState('hat-giong-goi');
    const bundle = roundTrip(buildBundle(state, [])) as Record<string, unknown>;
    bundle['schemaVersion'] = CURRENT_SCHEMA_VERSION + 5;

    expect(() => parseBundle(bundle)).toThrow(/mới tới v/);
  });

  it('state không qua nổi Zod thì ném, KHÔNG trả về một nửa', () => {
    const state = createInitialState('hat-giong-goi');
    const bundle = roundTrip(buildBundle(state, [])) as Record<string, unknown>;
    // Seed là `locked` và là danh tính của ván chơi — rỗng thì R3 không còn nghĩa.
    (bundle['state'] as { meta: { seed: string } }).meta.seed = '';

    expect(() => parseBundle(bundle)).toThrow(BundleError);
    expect(() => parseBundle(bundle)).toThrow(/không đọc được/);
  });

  it('thiếu hẳn khối meta', () => {
    expect(() =>
      parseBundle({
        format: BUNDLE_FORMAT,
        schemaVersion: 2,
        exportedAt: 1,
        checksum: 'x',
        state: { player: { name: 'a' } },
        turns: [],
      }),
    ).toThrow(BundleError);
  });
});
