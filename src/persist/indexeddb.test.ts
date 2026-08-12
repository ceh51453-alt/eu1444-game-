import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import type { TurnRecord } from '@/core/turn';
import { CURRENT_SCHEMA_VERSION } from '@/state/schema';
import { createInitialState, rngHubFor } from '@/state/store';
import { IndexedDbLayer, TIER_A_TURN_WINDOW } from './indexeddb';
import { AUTOSAVE_SLOT } from './index';

function makeTurn(turn: number): TurnRecord {
  const state = createInitialState('seed-turn');
  return {
    turn,
    gameDate: state.meta.gameDate,
    rngBefore: state.meta.rng,
    input: { kind: 'freeform', text: `hành động ${turn}` },
    outcome: { checks: [], engineOps: [], timeCost: 60, rngAfter: state.meta.rng },
    narrative: `kể lượt ${turn}`,
    patch: { applied: true, opCount: 0, rejections: [] },
    tick: { eventCount: 0, llmCallsUsed: 0 },
    reachedStep: 'persist',
    wallClock: 1_700_000_000_000 + turn,
  };
}

describe('persist tier A — IndexedDB', () => {
  let layer: IndexedDbLayer;

  beforeEach(async () => {
    layer = new IndexedDbLayer();
    await layer.open();
    for (const slot of await layer.listSlots()) {
      await layer.deleteSlot(slot.id);
    }
  });

  it('reports itself as tier A and available', async () => {
    expect(layer.tier).toBe('A');
    expect(await layer.isAvailable()).toBe(true);
  });

  it('round-trips every rng stream without losing its position (R3)', async () => {
    const state = createInitialState('hat-giong-1444', 'Aldric');
    state.meta.turn = 12;

    const hub = rngHubFor(state);
    for (let i = 0; i < 999; i++) hub.main().int(1, 6);
    for (let i = 0; i < 7; i++) hub.stream('worldtick').int(1, 6);
    state.meta.rng = hub.getState();

    await layer.saveState(AUTOSAVE_SLOT, state);
    const loaded = await layer.loadState(AUTOSAVE_SLOT);

    expect(loaded).toEqual(state);
    expect(loaded?.meta.rng.streams['main']?.draws).toBe(999);
    expect(loaded?.meta.rng.streams['worldtick']?.draws).toBe(7);
  });

  it('returns null for a slot that was never written', async () => {
    expect(await layer.loadState('khong-ton-tai')).toBeNull();
  });

  it('lists slots without loading full state', async () => {
    await layer.saveState('slot-1', createInitialState('a', 'Anh'), 'Ván một');
    await layer.saveState('slot-2', createInitialState('b', 'Bảo'), 'Ván hai');

    const slots = await layer.listSlots();
    expect(slots.map((s) => s.id).sort()).toEqual(['slot-1', 'slot-2']);
    expect(slots.find((s) => s.id === 'slot-1')?.label).toBe('Ván một');
    expect(slots.every((s) => s.schemaVersion === CURRENT_SCHEMA_VERSION)).toBe(true);
  });

  it('overwrites a slot rather than duplicating it', async () => {
    const state = createInitialState('ghi-de', 'Ban đầu');
    await layer.saveState(AUTOSAVE_SLOT, state);
    state.player.name = 'Về sau';
    await layer.saveState(AUTOSAVE_SLOT, state);

    expect(await layer.listSlots()).toHaveLength(1);
    expect((await layer.loadState(AUTOSAVE_SLOT))?.player.name).toBe('Về sau');
  });

  it('appends and reads back turn records in order', async () => {
    for (let turn = 1; turn <= 5; turn++) {
      await layer.appendTurn(AUTOSAVE_SLOT, makeTurn(turn));
    }
    const turns = await layer.readTurns(AUTOSAVE_SLOT);
    expect(turns.map((t) => t.turn)).toEqual([1, 2, 3, 4, 5]);
    expect(turns[2]?.narrative).toBe('kể lượt 3');
  });

  it('filters turns by range and limit', async () => {
    for (let turn = 1; turn <= 10; turn++) {
      await layer.appendTurn(AUTOSAVE_SLOT, makeTurn(turn));
    }
    expect((await layer.readTurns(AUTOSAVE_SLOT, { fromTurn: 4, toTurn: 6 })).map((t) => t.turn)).toEqual([
      4, 5, 6,
    ]);
    expect((await layer.readTurns(AUTOSAVE_SLOT, { limit: 3 })).map((t) => t.turn)).toEqual([8, 9, 10]);
  });

  it('keeps only a bounded window of recent turns in tier A', async () => {
    const total = TIER_A_TURN_WINDOW + 5;
    for (let turn = 1; turn <= total; turn++) {
      await layer.appendTurn(AUTOSAVE_SLOT, makeTurn(turn));
    }
    const turns = await layer.readTurns(AUTOSAVE_SLOT);
    expect(turns.length).toBeLessThanOrEqual(TIER_A_TURN_WINDOW + 1);
    expect(turns.at(-1)?.turn).toBe(total);
  });

  it('keeps turn logs of different slots apart', async () => {
    await layer.appendTurn('slot-1', makeTurn(1));
    await layer.appendTurn('slot-2', makeTurn(2));

    expect((await layer.readTurns('slot-1')).map((t) => t.turn)).toEqual([1]);
    expect((await layer.readTurns('slot-2')).map((t) => t.turn)).toEqual([2]);
  });

  it('deletes a slot together with its turn log', async () => {
    await layer.saveState('slot-1', createInitialState('x'));
    await layer.appendTurn('slot-1', makeTurn(1));
    await layer.deleteSlot('slot-1');

    expect(await layer.loadState('slot-1')).toBeNull();
    expect(await layer.readTurns('slot-1')).toEqual([]);
  });

  it('refuses to hand back a corrupt save instead of returning junk (R4)', async () => {
    const state = createInitialState('hong', 'Ai đó');
    await layer.saveState('slot-hong', state);

    // Bypass the layer to simulate a save damaged by hand-editing.
    await layer.close();
    const raw = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('eu1444', 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = raw.transaction('saves', 'readwrite');
      tx.objectStore('saves').put({
        id: 'slot-hong',
        label: 'hong',
        state: { meta: { schemaVersion: CURRENT_SCHEMA_VERSION, seed: '', turn: -3 }, player: {} },
        updatedAt: Date.now(),
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    raw.close();

    await layer.open();
    await expect(layer.loadState('slot-hong')).rejects.toThrow();
  });

  it('throws a clear error when used before open()', async () => {
    const cold = new IndexedDbLayer();
    await expect(cold.loadState(AUTOSAVE_SLOT)).rejects.toThrow(/before open/);
  });
});
