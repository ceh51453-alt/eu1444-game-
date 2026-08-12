/**
 * Bước 10 của vòng lặp lượt, chạy trên bộ tầng THẬT.
 *
 * `sync.ts` và `indexeddb.ts` đã có test riêng từ Phần 0, nhưng cho tới trước
 * bài này thì không có ai khởi tạo chúng — nghĩa là game chạy hết Phần 3 mà
 * chưa từng ghi được một lượt nào xuống đĩa. Bài test ở đây gác đúng chỗ đó:
 * mở tầng, ghi một lượt, rồi nạp lại như lúc khởi động.
 *
 * Từ khi Tầng B có thật, bài test còn phải gác thêm một điều: Tầng B VẮNG MẶT
 * không phải là lỗi. Trình duyệt không có OPFS thì ván chơi vẫn chạy trọn vẹn,
 * chỉ mất kho tra cứu dài hạn — và giao diện phải nói ra điều đó.
 */

import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { GameState } from '@/state/slices';
import type { TurnRecord } from '@/core/turn';
import { patchLog } from '@/state/history';
import { registerGameSlices } from '@/state/register';
import { slices } from '@/state/slices';
import { createInitialState } from '@/state/store';
import { checkLog } from '@/systems/check';
import { buildBundle, parseBundle, type ExportBundle, type ParsedBundle } from './bundle';
import { AUTOSAVE_SLOT } from './index';
import { IndexedDbLayer } from './indexeddb';
import { memoryConnection } from './memory-db';
import { SqliteLayer } from './sqlite';
import { archiveLayer, openStorage, resetStorage, setArchiveFactory, storageStatus } from './storage';
import { StorageManager, type FileTier } from './sync';

function record(turn: number): TurnRecord {
  const state = createInitialState('hat-giong-luu-tru');
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

beforeEach(() => {
  if (slices.get('character') === undefined) registerGameSlices();
  // Mỗi bài dựng lại bộ tầng từ đầu; dữ liệu trong fake-indexeddb cố ý giữ
  // nguyên, vì "mở lại và đọc được cái lần trước ghi" chính là thứ đang test.
  resetStorage();
});

afterEach(() => {
  setArchiveFactory(null);
  resetStorage();
});

describe('tầng lưu trữ sống (Phần 0 mục 4)', () => {
  it('không có OPFS thì chạy trên mình Tầng A và NÓI RA điều đó', async () => {
    const storage = await openStorage();
    expect(storage).not.toBeNull();

    const status = storageStatus();
    expect(status.degraded).toBe(false);
    expect(status.opened).toContain('indexeddb');
    // node không có OPFS — Tầng B không được lắp vào rồi cảnh báo mỗi lượt.
    expect(status.opened).not.toContain('sqlite-opfs');
    expect(status.message).toContain('Tầng B');
    expect(archiveLayer()).toBeNull();
  });

  it('ghi một lượt rồi nạp lại đúng state đó lúc khởi động', async () => {
    const storage = await openStorage();
    if (storage === null) throw new Error('không mở được tầng lưu trữ');

    const state = createInitialState('hat-giong-luu-tru', 'Aldric');
    state.meta.turn = 7;

    const report = await storage.persistTurn(state, record(7));
    expect(report.stateWritten).toBe(true);
    // Không có Tầng B thì `archived` là false, và đó KHÔNG phải lỗi.
    expect(report.archived).toBe(false);
    expect(report.warnings).toEqual([]);

    const loaded = await storage.loadLive();
    expect(loaded?.meta.turn).toBe(7);
    expect(loaded?.player.name).toBe('Aldric');
    expect(loaded?.meta.seed).toBe('hat-giong-luu-tru');
  });

  it('giữ được biên bản lượt trong Tầng A để undo dùng khi chưa có Tầng B', async () => {
    const storage = await openStorage();
    if (storage === null) throw new Error('không mở được tầng lưu trữ');

    const state = createInitialState('hat-giong-luu-tru');
    for (const turn of [1, 2, 3]) {
      await storage.persistTurn({ ...state, meta: { ...state.meta, turn } }, record(turn));
    }

    const slots = await storage.listSlots();
    expect(slots.map((slot) => slot.id)).toContain(AUTOSAVE_SLOT);
    expect(slots.find((slot) => slot.id === AUTOSAVE_SLOT)?.turn).toBe(3);
  });

  it('mở nhiều lần vẫn chỉ dựng một bộ tầng', async () => {
    const first = await openStorage();
    const second = await openStorage();
    expect(second).toBe(first);
  });
});

describe('Tầng B có mặt (Phần 2 mục 8, Phần 5 mục 11)', () => {
  beforeEach(() => {
    setArchiveFactory(() => new SqliteLayer(memoryConnection));
    patchLog.clear();
    checkLog.clear();
  });

  it('lắp vào thì mỗi lượt được lưu trữ, không còn cảnh báo', async () => {
    const storage = await openStorage();
    if (storage === null) throw new Error('không mở được tầng lưu trữ');

    expect(storageStatus().opened).toContain('sqlite-opfs');

    const state = createInitialState('hat-giong-kho');
    const report = await storage.persistTurn(state, record(1));
    expect(report.archived).toBe(true);
    expect(report.warnings).toEqual([]);
    expect((await archiveLayer()?.counts(AUTOSAVE_SLOT))?.turns).toBe(1);
  });

  it('hai nhật ký của Phần 2 và Phần 5 chảy xuống đĩa, không còn kẹt trong RAM', async () => {
    await openStorage();
    const layer = archiveLayer();
    if (layer === null) throw new Error('Tầng B chưa lắp');

    const before = createInitialState('hat-giong-kho');
    patchLog.record({
      turn: 3,
      seed: before.meta.seed,
      rngState: before.meta.rng,
      ops: [{ op: 'set', path: 'character.flags', to: ['x'], reason: 'thử', source: 'json' }],
      before,
      after: before,
      ts: 1_700_000_000_000,
    });
    checkLog.record(3, {
      id: 'check.hanh-dong',
      system: 'd100',
      domain: 'skill.chung',
      difficulty: 'thuong',
      tier: 'costlySuccess',
      raw: [55],
      target: 50,
      margin: -5,
      modifiers: [],
      seedUsed: 'hat-giong-kho::main#0',
      narrativeHint: 'Hãy viết cảnh này theo đúng kết quả trên.',
    });

    // Sink là async; cho vòng microtask chạy hết trước khi hỏi đĩa.
    await Promise.resolve();
    await Promise.resolve();

    expect(await layer.counts(AUTOSAVE_SLOT)).toMatchObject({ patches: 1, checks: 1 });
    expect(await layer.checkStats(AUTOSAVE_SLOT)).toEqual([
      { system: 'd100', tier: 'costlySuccess', count: 1 },
    ]);
    expect(patchLog.sinkFailures()).toEqual([]);
    expect(checkLog.sinkFailures()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Xuất / nhập (mục 4)
// ---------------------------------------------------------------------------

/** Tầng C giả: giữ file trong RAM, để test được luật mà không cần trình duyệt. */
class FakeFileTier implements FileTier {
  readonly tier = 'C' as const;
  readonly name = 'fake-jsonfile';
  written: string | null = null;
  toRead: unknown = null;

  async isAvailable(): Promise<boolean> {
    return true;
  }
  async open(): Promise<void> {}
  async close(): Promise<void> {}
  async saveState(): Promise<void> {
    throw new Error('không dùng');
  }
  async loadState(): Promise<GameState | null> {
    throw new Error('không dùng');
  }
  async listSlots(): Promise<never> {
    throw new Error('không dùng');
  }
  async deleteSlot(): Promise<void> {
    throw new Error('không dùng');
  }
  async appendTurn(): Promise<void> {
    throw new Error('không dùng');
  }
  async readTurns(): Promise<never> {
    throw new Error('không dùng');
  }
  async exportBundle(bundle: ExportBundle): Promise<string> {
    this.written = JSON.stringify(bundle);
    return 'ban-thu.json';
  }
  async importBundle(): Promise<ParsedBundle> {
    return parseBundle(this.toRead);
  }
}

describe('xuất và nhập ván chơi (mục 4)', () => {
  async function tiers(): Promise<{ manager: StorageManager; file: FakeFileTier; b: SqliteLayer }> {
    const a = new IndexedDbLayer();
    await a.open();
    const b = new SqliteLayer(memoryConnection);
    await b.open();
    const file = new FakeFileTier();
    return { manager: new StorageManager({ a, b, c: file }), file, b };
  }

  it('xuất gộp state của Tầng A với TOÀN BỘ lịch sử của Tầng B', async () => {
    const { manager, file } = await tiers();
    const state = createInitialState('hat-giong-xuat', 'Aldric');

    for (let turn = 1; turn <= 5; turn++) {
      await manager.persistTurn({ ...state, meta: { ...state.meta, turn } }, record(turn));
    }

    const outcome = await manager.exportSave({ ...state, meta: { ...state.meta, turn: 5 } });
    expect(outcome.turnCount).toBe(5);
    expect(outcome.complete).toBe(true);

    const written = JSON.parse(file.written ?? '{}') as ExportBundle;
    expect(written.state.meta.turn).toBe(5);
    expect(written.turns).toHaveLength(5);
    expect(written.checksum).toHaveLength(16);
  });

  it('không có Tầng B thì vẫn xuất được, nhưng báo là lịch sử CHƯA ĐỦ', async () => {
    const a = new IndexedDbLayer();
    await a.open();
    const file = new FakeFileTier();
    const manager = new StorageManager({ a, c: file });

    const state = createInitialState('hat-giong-cut');
    await manager.persistTurn(state, record(1));

    const outcome = await manager.exportSave(state);
    expect(outcome.complete).toBe(false);
  });

  it('nhập ghi state và dựng lại lịch sử ở cả hai tầng', async () => {
    const { manager, file, b } = await tiers();
    const state = createInitialState('hat-giong-nhap', 'Reinhard');
    state.meta.turn = 2;
    file.toRead = JSON.parse(JSON.stringify(buildBundle(state, [record(1), record(2)]))) as unknown;

    const parsed = await manager.importSave();
    expect(parsed.warnings).toEqual([]);

    const live = await manager.loadLive();
    expect(live?.player.name).toBe('Reinhard');
    expect((await b.counts(AUTOSAVE_SLOT)).turns).toBe(2);
  });

  it('file hỏng thì save đang có KHÔNG bị đụng tới (R4)', async () => {
    const { manager, file } = await tiers();
    const good = createInitialState('hat-giong-cu-con-day', 'Aldric');
    await manager.persistTurn(good, record(1));

    file.toRead = { format: 'thứ-gì-đó-khác' };
    await expect(manager.importSave()).rejects.toThrow();

    const live = await manager.loadLive();
    expect(live?.player.name).toBe('Aldric');
    expect(live?.meta.seed).toBe('hat-giong-cu-con-day');
  });
});
