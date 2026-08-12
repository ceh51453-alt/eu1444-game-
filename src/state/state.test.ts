import { describe, expect, it } from 'vitest';
import { initialRngState, MAIN_STREAM } from '@/core/rng';
import { migrateToCurrent, MigrationError, canMigrate } from './migrate';
import { DEFAULT_START_DATE } from '@/core/clock';
import { CURRENT_SCHEMA_VERSION } from './schema';
import { slices } from './slices';

const gameStateSchema = slices.rootSchema();
import { createInitialState, rngHubFor, useGameStore } from './store';

describe('state — initial shape', () => {
  it('matches the schema and starts on the campaign date', () => {
    const state = createInitialState('hat-giong', 'Aldric');
    expect(gameStateSchema.safeParse(state).success).toBe(true);
    expect(state.meta.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(state.meta.turn).toBe(0);
    // Đọc từ `clock.ts` chứ không chép lại con số: mốc mở màn là quyết định
    // của chiến dịch và nó đã dời một lần (sang sau trận Varna).
    expect(state.meta.gameDate).toEqual(DEFAULT_START_DATE);
    expect(Object.keys(state.meta.rng.streams)).toEqual([MAIN_STREAM]);
    expect(state.meta.rng.streams[MAIN_STREAM]?.draws).toBe(0);
  });

  it('gives two campaigns with the same seed the same starting rng position', () => {
    expect(createInitialState('x').meta.rng).toEqual(createInitialState('x').meta.rng);
  });
});

describe('state — store', () => {
  it('resets everything on newGame', () => {
    const store = useGameStore.getState();
    store.advanceTurn();
    store.newGame('van-moi', 'Bertrand');

    const next = useGameStore.getState();
    expect(next.meta.turn).toBe(0);
    expect(next.meta.seed).toBe('van-moi');
    expect(next.player.name).toBe('Bertrand');
  });

  it('commits every stream position so a save can resume them (R3)', () => {
    useGameStore.getState().newGame('cam-rng', 'Cecil');
    const hub = rngHubFor(useGameStore.getState().snapshot());
    for (let i = 0; i < 20; i++) hub.main().int(1, 6);
    for (let i = 0; i < 3; i++) hub.stream('worldtick').int(1, 6);

    useGameStore.getState().commitRng(hub.getState());
    const stored = useGameStore.getState().meta.rng;
    expect(stored.streams[MAIN_STREAM]?.draws).toBe(20);
    expect(stored.streams['worldtick']?.draws).toBe(3);
    expect(stored).toEqual(hub.getState());
  });

  it('hands the turn loop a hub sitting exactly where the save left it', () => {
    useGameStore.getState().newGame('tiep-tuc', 'Clara');
    const first = rngHubFor(useGameStore.getState().snapshot());
    const drawn = Array.from({ length: 10 }, () => first.main().int(1, 100));
    useGameStore.getState().commitRng(first.getState());

    // Bối cảnh mới, ví dụ tải lại trang: phải tung tiếp chứ không tung lại.
    const resumed = rngHubFor(useGameStore.getState().snapshot());
    const next = Array.from({ length: 10 }, () => resumed.main().int(1, 100));
    expect(next).not.toEqual(drawn);

    const replayed = rngHubFor({
      ...useGameStore.getState().snapshot(),
      meta: { ...useGameStore.getState().meta, rng: createInitialState('tiep-tuc').meta.rng },
    });
    expect(Array.from({ length: 10 }, () => replayed.main().int(1, 100))).toEqual(drawn);
  });

  it('produces a snapshot that is plain data, detached from the store', () => {
    useGameStore.getState().newGame('anh-chup', 'Denise');
    const snapshot = useGameStore.getState().snapshot();

    snapshot.player.name = 'đã sửa bên ngoài';
    expect(useGameStore.getState().player.name).toBe('Denise');
    expect(gameStateSchema.safeParse(snapshot).success).toBe(true);
  });

  it('installs a loaded state wholesale', () => {
    const loaded = createInitialState('tu-file', 'Edric');
    loaded.meta.turn = 42;
    useGameStore.getState().loadState(loaded);

    expect(useGameStore.getState().meta.turn).toBe(42);
    expect(useGameStore.getState().player.name).toBe('Edric');
  });
});

describe('state — migration', () => {
  it('accepts a current save unchanged', () => {
    const state = createInitialState('nguyen-ven', 'Fabien');
    expect(migrateToCurrent(structuredClone(state))).toEqual(state);
  });

  it('rejects a save from a newer build instead of guessing', () => {
    const state = createInitialState('tuong-lai');
    state.meta.schemaVersion = CURRENT_SCHEMA_VERSION + 1;
    expect(() => migrateToCurrent(state)).toThrow(MigrationError);
  });

  it('rejects a save with no usable version marker', () => {
    for (const bad of [null, 42, {}, { meta: {} }, { meta: { schemaVersion: 'một' } }]) {
      expect(() => migrateToCurrent(bad)).toThrow(MigrationError);
    }
  });

  it('rejects a structurally broken save rather than importing half of it (R4)', () => {
    const broken = { meta: { schemaVersion: CURRENT_SCHEMA_VERSION, seed: '', turn: -3 }, player: {} };
    expect(() => migrateToCurrent(broken)).toThrow(MigrationError);
    expect(canMigrate(broken)).toBe(false);
  });

  it('lifts a v1 save into the named-stream shape without losing its position', () => {
    const legacyRng = initialRngState('van-cu');
    const v1Save = {
      meta: {
        schemaVersion: 1,
        seed: 'van-cu',
        rngState: { ...legacyRng, draws: 314 },
        turn: 9,
        gameDate: { year: 1447, month: 6, day: 3, hour: 12 },
      },
      player: { name: 'Hugo' },
    };

    const migrated = migrateToCurrent(v1Save);

    expect(migrated.meta.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.meta.turn).toBe(9);
    expect(migrated.player.name).toBe('Hugo');
    expect(migrated.meta.rng.streams[MAIN_STREAM]).toEqual({ ...legacyRng, draws: 314 });
    expect('rngState' in migrated.meta).toBe(false);
    // Save cũ không bị sửa tại chỗ.
    expect(v1Save.meta.schemaVersion).toBe(1);
  });

  it('refuses a v1 save that has no rng position to carry over', () => {
    const v1Save = {
      meta: {
        schemaVersion: 1,
        seed: 'thieu-rng',
        turn: 0,
        gameDate: { year: 1444, month: 1, day: 1, hour: 6 },
      },
      player: { name: '' },
    };
    expect(() => migrateToCurrent(v1Save)).toThrow(MigrationError);
  });

  it('does not mutate the raw save it was handed', () => {
    const state = createInitialState('bat-bien', 'Gaston');
    const raw = structuredClone(state);
    migrateToCurrent(raw);
    expect(raw).toEqual(state);
  });
});
