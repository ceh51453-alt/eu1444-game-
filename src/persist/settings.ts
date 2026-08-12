/**
 * App settings storage — tier A, but a separate database from the campaign
 * saves.
 *
 * Settings are not game state: they survive across campaigns, they must never
 * enter an export bundle (they hold the proxy password), and they must not be
 * dragged through `migrate.ts` every time the game schema moves. Keeping them
 * in their own IndexedDB database makes all three true by construction.
 */

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { PersistenceError } from './index';

const DB_NAME = 'eu1444-settings';
const DB_VERSION = 1;
const SETTINGS_KEY = 'app';

interface SettingsDB extends DBSchema {
  settings: {
    key: string;
    value: { id: string; blob: unknown; updatedAt: number };
  };
}

let db: IDBPDatabase<SettingsDB> | null = null;

async function open(): Promise<IDBPDatabase<SettingsDB>> {
  if (db !== null) return db;
  try {
    db = await openDB<SettingsDB>(DB_NAME, DB_VERSION, {
      upgrade(database) {
        if (!database.objectStoreNames.contains('settings')) {
          database.createObjectStore('settings', { keyPath: 'id' });
        }
      },
    });
    return db;
  } catch (cause) {
    throw new PersistenceError('could not open the settings database', cause);
  }
}

export function settingsAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}

/** Ghi cài đặt. Mật khẩu proxy nằm trong đây — xem cảnh báo trên UI. */
export async function saveSettings(blob: unknown): Promise<void> {
  const database = await open();
  await database.put('settings', { id: SETTINGS_KEY, blob, updatedAt: Date.now() });
}

/** Đọc cài đặt thô. Người gọi tự validate bằng Zod trước khi tin. */
export async function loadSettings(): Promise<unknown | null> {
  const database = await open();
  const row = await database.get('settings', SETTINGS_KEY);
  return row?.blob ?? null;
}

export async function clearSettings(): Promise<void> {
  const database = await open();
  await database.delete('settings', SETTINGS_KEY);
}

export async function closeSettings(): Promise<void> {
  db?.close();
  db = null;
}
