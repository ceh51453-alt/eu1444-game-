/**
 * Zustand store — the single in-memory home of game state (R2).
 *
 * PART 0 SCOPE: the minimal shape from section 8.6 and nothing else. Slices for
 * character, body, holdings and so on register here from part 2 onward, and
 * only ever through MVU — no system may `set()` directly.
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { createRngHub, type RngHub, type RngHubState } from '@/core/rng';
import { slices, type GameState } from './slices';

export type { GameState } from './slices';

export interface GameStoreActions {
  /** Start a fresh campaign. Everything derived from `seed` is reproducible. */
  newGame(seed: string, playerName: string): void;
  /** Install a state loaded from disk. Caller must have validated it first. */
  loadState(state: GameState): void;
  /** Persist every stream's position after a turn's rolls (R3). */
  commitRng(rng: RngHubState): void;
  /** Advance the turn counter. The clock itself moves in a later part. */
  advanceTurn(): void;
  /**
   * Install a whole state computed elsewhere. MVU is the ONLY caller: it
   * validates a batch all-or-nothing and hands over the finished result, so
   * the store never sees a partially applied patch (R4).
   */
  commitBatch(next: GameState): void;
  /**
   * Lấp defaults cho slice đăng ký SAU khi store đã dựng.
   * Store khởi tạo lúc import module, còn slice gameplay đăng ký ở
   * `register.ts` — nên luôn có một khoảng mà state còn thiếu slice.
   */
  ensureSlices(): string[];
  /** Snapshot for the persistence layer — plain data, no store internals. */
  snapshot(): GameState;
}

export type GameStore = GameState & GameStoreActions;

/**
 * State ban đầu = defaults của MỌI slice đã đăng ký.
 * Thêm một slice mới không phải sửa hàm này (Phần 2 mục 2).
 */
export function createInitialState(seed: string, playerName = ''): GameState {
  const state = slices.defaults(seed);
  state.player.name = playerName;
  return state;
}

/**
 * Build an RNG hub positioned exactly where the save left off.
 *
 * The turn loop's usual shape:
 *   const hub = rngHubFor(store.snapshot());
 *   ... step 2 rolls on hub.main(), step 8 rolls on hub.stream('worldtick') ...
 *   store.commitRng(hub.getState());
 */
export function rngHubFor(state: GameState): RngHub {
  return createRngHub(state.meta.seed, state.meta.rng);
}

/** Seed used before the player starts a campaign. Replaced by `newGame`. */
const BOOTSTRAP_SEED = 'chua-bat-dau';

export const useGameStore = create<GameStore>()(
  immer((set, get) => ({
    ...createInitialState(BOOTSTRAP_SEED),

    newGame(seed, playerName) {
      set(() => createInitialState(seed, playerName));
    },

    loadState(state) {
      set((draft) => {
        // Thay TOÀN BỘ slice, kể cả slice mà bản build này chưa đăng ký —
        // vứt chúng đi là làm hỏng save của người chơi.
        for (const key of Object.keys(draft)) {
          if (typeof (draft as Record<string, unknown>)[key] === 'function') continue;
          delete (draft as Record<string, unknown>)[key];
        }
        Object.assign(draft, structuredClone(state));
      });
    },

    commitRng(rng) {
      set((draft) => {
        draft.meta.rng = structuredClone(rng);
      });
    },

    advanceTurn() {
      set((draft) => {
        draft.meta.turn += 1;
      });
    },

    commitBatch(next) {
      get().loadState(next);
    },

    ensureSlices() {
      const seed = get().meta.seed;
      const added: string[] = [];
      set((draft) => {
        for (const slice of slices.all()) {
          if ((draft as Record<string, unknown>)[slice.id] !== undefined) continue;
          (draft as Record<string, unknown>)[slice.id] = slice.defaults({ seed });
          added.push(slice.id);
        }
      });
      return added;
    },

    snapshot() {
      const out: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(get())) {
        if (typeof value === 'function') continue;
        out[key] = value;
      }
      return structuredClone(out) as unknown as GameState;
    },
  })),
);
