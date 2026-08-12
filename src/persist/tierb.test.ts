/**
 * TẦNG B — SQLite (Phần 0 mục 4, Phần 2 mục 8, Phần 5 mục 11).
 *
 * Chạy trên `:memory:` chứ không phải OPFS: node không có OPFS, nhưng ĐÂY VẪN
 * LÀ SQLite thật với đúng những câu SQL sẽ chạy trong trình duyệt. Khác biệt
 * duy nhất là VFS.
 *
 * Thứ cần gác ở đây không phải "có ghi được không" mà là những chỗ Tầng A không
 * làm nổi và Tầng B sinh ra để làm: lọc theo điều kiện, đếm nhóm, và giữ lịch
 * sử dài hơn cửa sổ 200 lượt của Tầng A.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import type { CheckResult, TurnRecord } from '@/core/turn';
import { registerGameSlices } from '@/state/register';
import { slices } from '@/state/slices';
import { createInitialState } from '@/state/store';
import { memoryConnection } from './memory-db';
import { SqliteLayer, checkSinkFor, patchSinkFor } from './sqlite';

const SLOT = 'autosave';

function record(turn: number, overrides: Partial<TurnRecord> = {}): TurnRecord {
  const state = createInitialState('hat-giong-tang-b');
  return {
    turn,
    gameDate: { year: 1444, month: 11, day: 15 + (turn % 10), hour: 6 },
    rngBefore: state.meta.rng,
    input: { kind: 'freeform', text: `hành động ${turn}` },
    outcome: { checks: [], engineOps: [], timeCost: 10, rngAfter: state.meta.rng },
    narrative: `kể lượt ${turn}`,
    patch: { applied: true, opCount: 1, rejections: [] },
    tick: { eventCount: 0, llmCallsUsed: 0 },
    reachedStep: 'persist',
    wallClock: 1_700_000_000_000 + turn,
    ...overrides,
  };
}

function check(id: string, system: CheckResult['system'], tier: CheckResult['tier']): CheckResult {
  return {
    id,
    system,
    domain: 'skill.chung',
    difficulty: 'thuong',
    tier,
    raw: [42],
    target: 50,
    margin: 8,
    modifiers: [{ label: 'Độ khó Thường', value: 0, source: 'check.do-kho' }],
    seedUsed: 'hat-giong#0',
    narrativeHint: 'Hãy viết cảnh này theo đúng kết quả trên.',
  };
}

let layer: SqliteLayer;

beforeEach(async () => {
  if (slices.get('character') === undefined) registerGameSlices();
  layer = new SqliteLayer(memoryConnection);
  await layer.open();
});

describe('Tầng B — biên bản lượt', () => {
  it('ghi rồi đọc lại nguyên vẹn', async () => {
    await layer.appendTurn(SLOT, record(1));
    await layer.appendTurn(SLOT, record(2));

    const turns = await layer.readTurns(SLOT);
    expect(turns.map((turn) => turn.turn)).toEqual([1, 2]);
    expect(turns[1]?.narrative).toBe('kể lượt 2');
    expect(turns[0]?.rngBefore.streams['main']).toBeDefined();
  });

  it('lọc theo khoảng lượt — đây là thứ Tầng A làm rất tệ', async () => {
    for (let turn = 1; turn <= 40; turn++) await layer.appendTurn(SLOT, record(turn));

    const middle = await layer.readTurns(SLOT, { fromTurn: 10, toTurn: 14 });
    expect(middle.map((turn) => turn.turn)).toEqual([10, 11, 12, 13, 14]);
  });

  it('`limit` giữ N lượt MỚI NHẤT, không phải N lượt đầu tiên', async () => {
    for (let turn = 1; turn <= 40; turn++) await layer.appendTurn(SLOT, record(turn));

    const tail = await layer.readTurns(SLOT, { limit: 3 });
    expect(tail.map((turn) => turn.turn)).toEqual([38, 39, 40]);
  });

  it('giữ được lịch sử dài hơn cửa sổ 200 lượt của Tầng A', async () => {
    for (let turn = 1; turn <= 250; turn++) await layer.appendTurn(SLOT, record(turn));

    const all = await layer.readTurns(SLOT);
    expect(all).toHaveLength(250);
    expect(all[0]?.turn).toBe(1);
    expect((await layer.counts(SLOT)).turns).toBe(250);
  });

  it('chơi lại một lượt sau khi hoàn tác thì ĐÈ lên biên bản cũ', async () => {
    await layer.appendTurn(SLOT, record(5, { narrative: 'lần đầu' }));
    await layer.appendTurn(SLOT, record(5, { narrative: 'chơi lại' }));

    const turns = await layer.readTurns(SLOT);
    expect(turns).toHaveLength(1);
    expect(turns[0]?.narrative).toBe('chơi lại');
  });

  it('hai slot không thấy dữ liệu của nhau', async () => {
    await layer.appendTurn(SLOT, record(1));
    await layer.appendTurn('slot-khac', record(1));
    await layer.appendTurn('slot-khac', record(2));

    expect(await layer.readTurns(SLOT)).toHaveLength(1);
    expect((await layer.listSlots()).map((slot) => slot.id).sort()).toEqual(['autosave', 'slot-khac']);
  });

  it('xóa slot dọn sạch cả ba bảng', async () => {
    await layer.appendTurn(SLOT, record(1));
    await layer.appendCheck(SLOT, { turn: 1, ts: 1, result: check('check.a', 'd100', 'fail') });
    await layer.appendPatch(SLOT, {
      turn: 1,
      seed: 'x',
      rngState: { streams: {} },
      ops: [],
      before: createInitialState('x'),
      after: createInitialState('x'),
      ts: 1,
    });

    expect(await layer.counts(SLOT)).toEqual({ turns: 1, checks: 1, patches: 1 });
    await layer.deleteSlot(SLOT);
    expect(await layer.counts(SLOT)).toEqual({ turns: 0, checks: 0, patches: 0 });
  });

  it('state sống KHÔNG được phép nằm ở Tầng B', async () => {
    await expect(layer.saveState(SLOT, createInitialState('x'))).rejects.toThrow(/saveState/);
    await expect(layer.loadState(SLOT)).rejects.toThrow(/loadState/);
  });

  it('dùng trước khi open() thì ném, không lặng lẽ nuốt dữ liệu', async () => {
    const closed = new SqliteLayer(memoryConnection);
    await expect(closed.appendTurn(SLOT, record(1))).rejects.toThrow(/trước khi open/);
  });
});

describe('Tầng B — nhật ký xúc sắc (Phần 5 mục 11)', () => {
  it('đếm nhóm theo hệ và cấp bằng SQL trên TOÀN BỘ kho', async () => {
    const rows: Array<[CheckResult['system'], CheckResult['tier'], number]> = [
      ['d100', 'success', 5],
      ['d100', 'critFail', 2],
      ['pool', 'success', 3],
      ['pool', 'critFail', 7],
    ];
    let ts = 0;
    for (const [system, tier, count] of rows) {
      for (let i = 0; i < count; i++) {
        await layer.appendCheck(SLOT, { turn: 1, ts: ts++, result: check(`check.${system}`, system, tier) });
      }
    }

    const stats = await layer.checkStats(SLOT);
    expect(stats).toEqual([
      { system: 'd100', tier: 'critFail', count: 2 },
      { system: 'd100', tier: 'success', count: 5 },
      { system: 'pool', tier: 'critFail', count: 7 },
      { system: 'pool', tier: 'success', count: 3 },
    ]);
  });

  it('sink của `checkLog` ghi xuống và đọc lại được', async () => {
    const sink = checkSinkFor(layer, SLOT);
    for (let turn = 1; turn <= 5; turn++) {
      await sink.append({ turn, ts: turn, result: check(`check.${turn}`, 'd100', 'success') });
    }

    const read = await sink.read(3);
    expect(read.map((entry) => entry.turn)).toEqual([3, 4, 5]);
    expect(read[0]?.result.modifiers[0]?.label).toBe('Độ khó Thường');
  });
});

describe('Tầng B — nhật ký patch (Phần 2 mục 8)', () => {
  it('giữ được cả `before` và `after`, thứ Phần 2 cố ý không giữ trong RAM', async () => {
    const before = createInitialState('hat-giong-patch', 'Aldric');
    const after = { ...before, meta: { ...before.meta, turn: 1 } };
    const sink = patchSinkFor(layer, SLOT);

    await sink.append({
      turn: 1,
      seed: before.meta.seed,
      rngState: before.meta.rng,
      ops: [{ op: 'set', path: 'character.flags', to: ['x'], reason: 'thử', source: 'json' }],
      before,
      after,
      ts: 1_700_000_000_000,
      manualOverride: true,
    });

    const read = await sink.read(10);
    expect(read).toHaveLength(1);
    expect(read[0]?.before.player.name).toBe('Aldric');
    expect(read[0]?.after.meta.turn).toBe(1);
    expect(read[0]?.manualOverride).toBe(true);
  });
});
