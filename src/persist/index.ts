/**
 * Persistence contract. The rest of the game knows ONLY this interface and
 * never which tier is behind it (part 0 section 4, last rule).
 *
 * Tier A — IndexedDB   live state, autosaved every turn.
 * Tier B — SQLite/OPFS  large queryable history. Absent when the browser has no
 *                       OPFS; the game still runs, it just loses the archive.
 * Tier C — JSON file    manual export / import, see `bundle.ts` for the rules.
 *
 * A tier that cannot serve a call throws `UnsupportedOperationError` rather
 * than silently doing nothing — a save that quietly failed is worse than one
 * that failed loudly.
 */

import type { GameDate } from '@/core/clock';
import type { TurnRecord } from '@/core/turn';
import type { GameState } from '@/state/schema';

export type StorageTier = 'A' | 'B' | 'C';

/** Enough to list saves without loading them. */
export interface SaveSlotMeta {
  id: string;
  label: string;
  schemaVersion: number;
  turn: number;
  gameDate: GameDate;
  /** Wall-clock epoch ms of the last write. */
  updatedAt: number;
}

export interface TurnQuery {
  /** Inclusive lower bound on turn number. */
  fromTurn?: number;
  /** Inclusive upper bound on turn number. */
  toTurn?: number;
  /** Cap on rows returned, newest last. */
  limit?: number;
}

export interface PersistenceLayer {
  readonly tier: StorageTier;
  readonly name: string;

  /** False when the browser lacks the API this tier needs. Never throws. */
  isAvailable(): Promise<boolean>;
  open(): Promise<void>;
  close(): Promise<void>;

  saveState(slotId: string, state: GameState, label?: string): Promise<void>;
  /** Null when the slot does not exist. Throws when it exists but is corrupt. */
  loadState(slotId: string): Promise<GameState | null>;
  listSlots(): Promise<SaveSlotMeta[]>;
  deleteSlot(slotId: string): Promise<void>;

  appendTurn(slotId: string, record: TurnRecord): Promise<void>;
  readTurns(slotId: string, query?: TurnQuery): Promise<TurnRecord[]>;
}

export class UnsupportedOperationError extends Error {
  constructor(tier: StorageTier, operation: string) {
    super(`storage tier ${tier} does not support ${operation}`);
    this.name = 'UnsupportedOperationError';
  }
}

export class PersistenceError extends Error {
  constructor(message: string, cause?: unknown) {
    // `cause` is inherited from Error; passing it through keeps the original
    // IndexedDB/OPFS failure attached instead of flattening it to a string.
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'PersistenceError';
  }
}

/** Slot used for the running campaign's autosave. */
export const AUTOSAVE_SLOT = 'autosave';
