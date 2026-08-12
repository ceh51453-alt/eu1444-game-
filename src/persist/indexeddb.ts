/**
 * Tier A — IndexedDB. The live save: written every turn, read on boot.
 * This is the runtime source of truth (part 0 section 4).
 *
 * Tier A also keeps a short tail of recent turns so undo works before tier B
 * exists. The full chronicle belongs in tier B.
 */

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { TurnRecord } from '@/core/turn';
import { migrateToCurrent } from '@/state/migrate';
import type { GameState } from '@/state/schema';
import {
  PersistenceError,
  type PersistenceLayer,
  type SaveSlotMeta,
  type StorageTier,
  type TurnQuery,
} from './index';

const DB_NAME = 'eu1444';
const DB_VERSION = 1;

/** How many recent turns tier A keeps per slot before trimming the head. */
export const TIER_A_TURN_WINDOW = 200;

interface SaveRow {
  id: string;
  label: string;
  state: GameState;
  updatedAt: number;
}

interface TurnRow {
  slotId: string;
  turn: number;
  record: TurnRecord;
}

interface Eu1444DB extends DBSchema {
  saves: {
    key: string;
    value: SaveRow;
  };
  turns: {
    key: [string, number];
    value: TurnRow;
    indexes: { 'by-slot': string };
  };
}

export class IndexedDbLayer implements PersistenceLayer {
  readonly tier: StorageTier = 'A';
  readonly name = 'indexeddb';

  #db: IDBPDatabase<Eu1444DB> | null = null;

  async isAvailable(): Promise<boolean> {
    return typeof indexedDB !== 'undefined';
  }

  async open(): Promise<void> {
    if (this.#db !== null) return;
    try {
      this.#db = await openDB<Eu1444DB>(DB_NAME, DB_VERSION, {
        upgrade(db) {
          if (!db.objectStoreNames.contains('saves')) {
            db.createObjectStore('saves', { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains('turns')) {
            const turns = db.createObjectStore('turns', { keyPath: ['slotId', 'turn'] });
            turns.createIndex('by-slot', 'slotId');
          }
        },
      });
    } catch (cause) {
      throw new PersistenceError('could not open IndexedDB', cause);
    }
  }

  async close(): Promise<void> {
    this.#db?.close();
    this.#db = null;
  }

  #require(): IDBPDatabase<Eu1444DB> {
    if (this.#db === null) {
      throw new PersistenceError('IndexedDB layer used before open()');
    }
    return this.#db;
  }

  async saveState(slotId: string, state: GameState, label?: string): Promise<void> {
    const db = this.#require();
    const previous = label === undefined ? await db.get('saves', slotId) : undefined;
    const row: SaveRow = {
      id: slotId,
      label: label ?? previous?.label ?? slotId,
      state: structuredClone(state),
      updatedAt: Date.now(),
    };
    try {
      await db.put('saves', row);
    } catch (cause) {
      throw new PersistenceError(`could not write save "${slotId}"`, cause);
    }
  }

  async loadState(slotId: string): Promise<GameState | null> {
    const db = this.#require();
    const row = await db.get('saves', slotId);
    if (row === undefined) return null;
    // A save written by an older build is upgraded, never discarded, and is
    // validated before it is handed back (part 0 section 4).
    return migrateToCurrent(row.state);
  }

  async listSlots(): Promise<SaveSlotMeta[]> {
    const db = this.#require();
    const rows = await db.getAll('saves');
    return rows.map((row) => ({
      id: row.id,
      label: row.label,
      schemaVersion: row.state.meta.schemaVersion,
      turn: row.state.meta.turn,
      gameDate: row.state.meta.gameDate,
      updatedAt: row.updatedAt,
    }));
  }

  async deleteSlot(slotId: string): Promise<void> {
    const db = this.#require();
    const tx = db.transaction(['saves', 'turns'], 'readwrite');
    await tx.objectStore('saves').delete(slotId);
    const turns = tx.objectStore('turns');
    let cursor = await turns.index('by-slot').openCursor(slotId);
    while (cursor !== null) {
      await cursor.delete();
      cursor = await cursor.continue();
    }
    await tx.done;
  }

  async appendTurn(slotId: string, record: TurnRecord): Promise<void> {
    const db = this.#require();
    const tx = db.transaction('turns', 'readwrite');
    const store = tx.objectStore('turns');
    await store.put({ slotId, turn: record.turn, record: structuredClone(record) });

    // Trim the head so tier A stays small; tier B holds the full chronicle.
    const cutoff = record.turn - TIER_A_TURN_WINDOW;
    if (cutoff >= 0) {
      let cursor = await store.openCursor(IDBKeyRange.bound([slotId, 0], [slotId, cutoff]));
      while (cursor !== null) {
        await cursor.delete();
        cursor = await cursor.continue();
      }
    }
    await tx.done;
  }

  async readTurns(slotId: string, query: TurnQuery = {}): Promise<TurnRecord[]> {
    const db = this.#require();
    const from = query.fromTurn ?? 0;
    const to = query.toTurn ?? Number.MAX_SAFE_INTEGER;
    const rows = await db.getAll('turns', IDBKeyRange.bound([slotId, from], [slotId, to]));
    const records = rows.map((row) => row.record);
    if (query.limit !== undefined && records.length > query.limit) {
      return records.slice(records.length - query.limit);
    }
    return records;
  }
}
