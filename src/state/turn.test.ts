/**
 * Vòng sửa lỗi TẦNG 2 nối vào store (Phần 2 mục 6).
 *
 * Bài quan trọng nhất ở đây là bài cuối: sửa tay KHÔNG được kéo lượt và vị trí
 * xúc sắc lùi lại. Modal nhận một lô op cùng với state để đối chiếu; nếu state
 * đó là ảnh chụp TRƯỚC lượt thì `commitBatch` sẽ ghi đè luôn cả `meta.turn` và
 * `meta.rng` về lúc chưa tung — và lượt kế tiếp tung lại đúng con số cũ. Đó là
 * R3 vỡ theo kiểu im lặng, nên nó cần một bài test riêng.
 */

import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { applyPatch, type PatchOp } from './mvu';
import { registerGameSlices } from './register';
import { slices } from './slices';
import { createInitialState, useGameStore } from './store';
import { patchLog } from './history';
import { useTurnStore } from './turn';

const OPS: PatchOp[] = [
  {
    op: 'set',
    path: 'character.stats.hp',
    from: 20,
    to: 12,
    reason: 'bị đâm một nhát',
    source: 'st',
  },
];

beforeEach(() => {
  if (slices.get('character') === undefined) registerGameSlices();
  patchLog.clear();

  // Ảnh chụp TRƯỚC lượt: lượt 4, xúc sắc mới rút 9 lần.
  const state = createInitialState('hat-giong-tang-2', 'Aldric');
  state.meta.turn = 4;
  state.meta.rng.streams['main'] = { ...state.meta.rng.streams['main']!, draws: 9 };

  // State đang sống thì đã đi tiếp: bước 2 rút thêm một lần, bước 10 tăng lượt.
  const live = structuredClone(state);
  live.meta.turn = 5;
  live.meta.rng.streams['main'] = { ...live.meta.rng.streams['main']!, draws: 10 };
  useGameStore.getState().loadState(live);

  useTurnStore.setState({
    review: {
      // Cố ý đưa ảnh chụp CŨ vào modal — đây chính là cái bẫy cần chặn.
      state,
      failures: [],
      ops: OPS,
      record: {
        turn: 5,
        gameDate: state.meta.gameDate,
        rngBefore: state.meta.rng,
        input: { kind: 'freeform', text: 'lao vào ngõ' },
        outcome: { checks: [], engineOps: [], timeCost: 10, rngAfter: state.meta.rng },
        narrative: 'Lưỡi dao lóe lên.',
        patch: { applied: false, opCount: 1, rejections: [] },
        tick: { eventCount: 0, llmCallsUsed: 0 },
        reachedStep: 'derive',
        wallClock: Date.now(),
      },
    },
    error: null,
  });
});

describe('sửa tay tầng 2', () => {
  it('áp được op mà AI không được phép ghi, và đánh dấu manualOverride', () => {
    const pending = useTurnStore.getState().review;
    expect(pending).not.toBeNull();

    // Đúng thứ modal làm khi bấm "Áp dụng dù sao" rồi "Áp dụng tất cả".
    const applied = applyPatch(pending!.state, OPS, {
      actor: 'player',
      skipPermissions: true,
      skipBounds: true,
    });
    expect(applied.applied).toBe(true);

    useTurnStore.getState().resolveReview(applied, true);

    const after = useGameStore.getState().snapshot();
    expect((after['character'] as { stats: { hp: number } }).stats.hp).toBe(12);
    expect(useTurnStore.getState().review).toBeNull();

    const logged = patchLog.summaries().at(-1);
    expect(logged?.manualOverride).toBe(true);
    // Sửa tay chạy SAU khi bước 10 đã tăng lượt; nhật ký phải ghi đúng lượt 5,
    // không phải lượt 6.
    expect(logged?.turn).toBe(5);
  });

  it('KHÔNG kéo lượt và vị trí xúc sắc lùi lại (R3)', () => {
    const pending = useTurnStore.getState().review;
    const applied = applyPatch(pending!.state, OPS, {
      actor: 'player',
      skipPermissions: true,
      skipBounds: true,
    });
    useTurnStore.getState().resolveReview(applied, true);

    const after = useGameStore.getState().snapshot();
    expect(after.meta.turn).toBe(5);
    expect(after.meta.rng.streams['main']?.draws).toBe(10);
  });

  it('bỏ toàn bộ lô thì state giữ nguyên nhưng vẫn vào nhật ký', () => {
    useTurnStore.getState().discardReview();

    const after = useGameStore.getState().snapshot();
    expect((after['character'] as { stats: { hp: number } }).stats.hp).toBe(20);
    expect(useTurnStore.getState().review).toBeNull();
    expect(useTurnStore.getState().error).toContain('giữ nguyên');

    const logged = patchLog.summaries().at(-1);
    expect(logged?.opCount).toBe(1);
    expect(logged?.manualOverride).toBe(false);
  });
});
