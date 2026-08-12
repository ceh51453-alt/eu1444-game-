/**
 * Phần phiên chơi không thuộc GameState nhưng phải sống qua F5: lịch sử chat,
 * cảnh hiện tại và các tuỳ chọn theo ván. Tách khỏi save state để không làm đổi
 * schema MVU, nhưng dùng cùng slot id nên chuyển file save không bị lẫn phiên.
 */

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { z } from 'zod';
import type { BudgetConfig } from '@/ai/budget';
import type { SceneContext, TurnEntry } from '@/ai/query';

const DB_NAME = 'eu1444-sessions';
const DB_VERSION = 1;
const ACTIVE_KEY = 'active-slot';

export interface CampaignSession {
  version: 1;
  entries: TurnEntry[];
  scene: SceneContext;
  budget: BudgetConfig;
  charName: string;
  tickNote: string;
  previousRegionId: string;
}

interface SessionRow {
  id: string;
  session: CampaignSession;
  updatedAt: number;
}

interface MetaRow {
  id: string;
  value: string;
}

interface SessionDB extends DBSchema {
  sessions: { key: string; value: SessionRow };
  meta: { key: string; value: MetaRow };
}

const gameDateSchema = z.object({
  year: z.number().int(),
  month: z.number().int(),
  day: z.number().int(),
  hour: z.number().int(),
});

const sessionSchema = z.object({
  version: z.literal(1),
  entries: z.array(
    z.object({
      turn: z.number().int().nonnegative(),
      gameDate: gameDateSchema,
      action: z.string(),
      narrative: z.string(),
      outcome: z.string(),
    }),
  ),
  scene: z.object({
    place: z.string(),
    npcs: z.array(z.object({ id: z.string(), name: z.string(), role: z.string() })),
    weather: z.string(),
    timeOfDay: z.string(),
    notes: z.array(z.string()),
  }),
  budget: z.object({
    total: z.number().positive(),
    reserveForOutput: z.number().nonnegative(),
    lore: z.number().positive().optional(),
  }),
  charName: z.string(),
  tickNote: z.string(),
  previousRegionId: z.string(),
});

let db: IDBPDatabase<SessionDB> | null = null;

async function open(): Promise<IDBPDatabase<SessionDB>> {
  if (db !== null) return db;
  db = await openDB<SessionDB>(DB_NAME, DB_VERSION, {
    upgrade(database) {
      if (!database.objectStoreNames.contains('sessions')) {
        database.createObjectStore('sessions', { keyPath: 'id' });
      }
      if (!database.objectStoreNames.contains('meta')) {
        database.createObjectStore('meta', { keyPath: 'id' });
      }
    },
  });
  return db;
}

export function sessionStorageAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}

export async function saveCampaignSession(slotId: string, session: CampaignSession): Promise<void> {
  if (!sessionStorageAvailable()) return;
  const database = await open();
  await database.put('sessions', { id: slotId, session: structuredClone(session), updatedAt: Date.now() });
}

export async function loadCampaignSession(slotId: string): Promise<CampaignSession | null> {
  if (!sessionStorageAvailable()) return null;
  const row = await (await open()).get('sessions', slotId);
  if (row === undefined) return null;
  const parsed = sessionSchema.safeParse(row.session);
  if (!parsed.success) return null;
  const data = parsed.data;
  return {
    ...data,
    budget:
      data.budget.lore === undefined
        ? { total: data.budget.total, reserveForOutput: data.budget.reserveForOutput }
        : {
            total: data.budget.total,
            reserveForOutput: data.budget.reserveForOutput,
            lore: data.budget.lore,
          },
  };
}

export async function deleteCampaignSession(slotId: string): Promise<void> {
  if (!sessionStorageAvailable()) return;
  await (await open()).delete('sessions', slotId);
}

export async function saveActiveSlot(slotId: string): Promise<void> {
  if (!sessionStorageAvailable()) return;
  await (await open()).put('meta', { id: ACTIVE_KEY, value: slotId });
}

export async function loadActiveSlot(): Promise<string | null> {
  if (!sessionStorageAvailable()) return null;
  return (await (await open()).get('meta', ACTIVE_KEY))?.value ?? null;
}

/** Đóng kết nối; chủ yếu dùng để test và khi ứng dụng được tháo hoàn toàn. */
export function closeSessionStorage(): void {
  db?.close();
  db = null;
}
