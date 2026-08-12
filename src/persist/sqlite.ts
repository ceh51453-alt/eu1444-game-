/**
 * Tầng B — SQLite biên dịch sang WASM, file `.db` nằm trong OPFS (Phần 0 mục 4).
 *
 * VÌ SAO TẦNG NÀY TỒN TẠI: lịch sử lượt chơi, log world-tick, danh bạ NPC, bảng
 * tỉnh và lãnh thổ, biên niên sử chiến trận — tất cả đều sẽ lên hàng chục nghìn
 * dòng và cần truy vấn theo điều kiện. IndexedDB làm việc đó rất tệ, SQL thì
 * không.
 *
 * BA QUYẾT ĐỊNH CÀI ĐẶT, cả ba đều đáng giải thích:
 *
 * 1. DATABASE SỐNG TRONG MỘT WORKER. Không phải để chạy song song mà vì bắt
 *    buộc: VFS `opfs-sahpool` cần `createSyncAccessHandle`, hàm mà trình duyệt
 *    chỉ phơi ra trong Worker. Chi tiết ở `sqlite-worker.ts`.
 *
 * 2. VFS là `opfs-sahpool`, KHÔNG phải `opfs`. Bản `opfs` còn đòi thêm
 *    cross-origin isolation (COOP/COEP) — mà `dist/` mở bằng một file server
 *    bất kỳ thì không có hai header đó, nên Tầng B sẽ chết đúng lúc người chơi
 *    build ra để chơi thật.
 *
 * 3. KHÔNG chỉ nhét JSON vào một cột. Cột nào cần lọc thì tách hẳn ra
 *    (`turn`, `tier`, `system`, `domain`…), JSON giữ nguyên bản đầy đủ bên
 *    cạnh. Nếu chỉ có một cột blob thì tầng này chẳng hơn gì Tầng A, mà cả lý
 *    do tồn tại của nó là truy vấn được.
 *
 * Append-only từ góc nhìn của engine: Tầng B KHÔNG BAO GIỜ giữ state mà Tầng A
 * chưa có. `saveState`/`loadState` cố tình không hỗ trợ — trộn state sống vào
 * kho lưu trữ là cách hai tầng bắt đầu nói khác nhau.
 */

import type { CheckResult, TurnRecord } from '@/core/turn';
import type { GameState } from '@/state/schema';
import type { CheckLogEntry, CheckLogSink } from '@/systems/check';
import type { PatchLogEntry, PatchLogSink } from '@/state/history';
import {
  PersistenceError,
  UnsupportedOperationError,
  type PersistenceLayer,
  type SaveSlotMeta,
  type StorageTier,
  type TurnQuery,
} from './index';
import type { WorkerRequest, WorkerResponse } from './sqlite-worker';

/**
 * Cửa duy nhất tới database. Bất đồng bộ vì database nằm sau một Worker; bản
 * in-memory của test bọc lại một DB đồng bộ cho vừa cửa này.
 */
export interface SqlConnection {
  exec(sql: string, bind?: unknown[]): Promise<Record<string, unknown>[]>;
  close(): Promise<void>;
}

export type ConnectionOpener = () => Promise<SqlConnection>;

/** Tên file trong pool OPFS. Đổi tên này là bỏ rơi mọi kho cũ. */
export const SQLITE_FILE = '/eu1444-archive.db';

/** Thư mục OPFS riêng của pool. */
export const SQLITE_POOL_DIR = '.eu1444-sqlite';

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS turns (
     slot TEXT NOT NULL,
     turn INTEGER NOT NULL,
     ts INTEGER NOT NULL,
     game_year INTEGER NOT NULL,
     game_month INTEGER NOT NULL,
     game_day INTEGER NOT NULL,
     reached_step TEXT NOT NULL,
     applied INTEGER NOT NULL,
     op_count INTEGER NOT NULL,
     record TEXT NOT NULL,
     PRIMARY KEY (slot, turn)
   )`,
  `CREATE TABLE IF NOT EXISTS checks (
     row_id INTEGER PRIMARY KEY AUTOINCREMENT,
     slot TEXT NOT NULL,
     turn INTEGER NOT NULL,
     ts INTEGER NOT NULL,
     check_id TEXT NOT NULL,
     system TEXT NOT NULL,
     domain TEXT NOT NULL,
     tier TEXT NOT NULL,
     result TEXT NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS checks_by_slot_turn ON checks (slot, turn)`,
  `CREATE INDEX IF NOT EXISTS checks_by_system_tier ON checks (system, tier)`,
  `CREATE TABLE IF NOT EXISTS patches (
     row_id INTEGER PRIMARY KEY AUTOINCREMENT,
     slot TEXT NOT NULL,
     turn INTEGER NOT NULL,
     ts INTEGER NOT NULL,
     op_count INTEGER NOT NULL,
     manual_override INTEGER NOT NULL,
     entry TEXT NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS patches_by_slot_turn ON patches (slot, turn)`,
] as const;

/** Một dòng thống kê xúc sắc lấy thẳng bằng SQL, không phải đếm trong RAM. */
export interface TierBCheckStat {
  system: string;
  tier: string;
  count: number;
}

export interface TierBCounts {
  turns: number;
  checks: number;
  patches: number;
}

function text(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  return typeof value === 'string' ? value : '';
}

function num(row: Record<string, unknown>, key: string): number {
  const value = row[key];
  return typeof value === 'number' ? value : 0;
}

// ---------------------------------------------------------------------------
// Kết nối qua Worker
// ---------------------------------------------------------------------------

/**
 * Mở database thật trong một Worker.
 *
 * Worker nạp bằng `new URL(..., import.meta.url)` — cú pháp Vite hiểu và tự
 * đóng gói ở bản build, thay vì một đường dẫn chuỗi chỉ đúng lúc chạy dev.
 */
export const workerConnection: ConnectionOpener = async () => {
  const worker = new Worker(new URL('./sqlite-worker.ts', import.meta.url), { type: 'module' });

  let nextId = 1;
  const waiting = new Map<number, { resolve: (rows: Record<string, unknown>[]) => void; reject: (error: Error) => void }>();

  worker.addEventListener('message', (event: MessageEvent<WorkerResponse>) => {
    const response = event.data;
    const pending = waiting.get(response.id);
    if (pending === undefined) return;
    waiting.delete(response.id);
    if (response.ok) pending.resolve(response.rows ?? []);
    else pending.reject(new Error(response.error ?? 'Tầng B lỗi không rõ'));
  });

  // Worker chết giữa chừng (hết bộ nhớ, tab bị đóng băng) mà không ai được báo
  // thì mọi lời gọi sau treo vĩnh viễn. Hủy hết phần đang chờ và nói ra.
  worker.addEventListener('error', (event) => {
    for (const [, pending] of waiting) pending.reject(new Error(`Worker Tầng B hỏng: ${event.message}`));
    waiting.clear();
  });

  const send = (request: Omit<WorkerRequest, 'id'>): Promise<Record<string, unknown>[]> => {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      waiting.set(id, { resolve, reject });
      worker.postMessage({ ...request, id } satisfies WorkerRequest);
    });
  };

  await send({ kind: 'open', directory: SQLITE_POOL_DIR, poolName: 'eu1444', file: SQLITE_FILE });

  return {
    exec: (sql, bind = []) => send({ kind: 'exec', sql, bind }),
    close: async () => {
      await send({ kind: 'close' });
      worker.terminate();
    },
  };
};

// ---------------------------------------------------------------------------
// Tầng
// ---------------------------------------------------------------------------

export class SqliteLayer implements PersistenceLayer {
  readonly tier: StorageTier = 'B';
  readonly name = 'sqlite-opfs';

  #connection: SqlConnection | null = null;
  readonly #open: ConnectionOpener;
  readonly #alwaysAvailable: boolean;

  constructor(openConnection?: ConnectionOpener) {
    this.#open = openConnection ?? workerConnection;
    // Bản tiêm vào (test, hoặc một VFS khác sau này) tự chịu trách nhiệm về khả
    // dụng; chỉ bản OPFS mặc định mới phải dò trình duyệt.
    this.#alwaysAvailable = openConnection !== undefined;
  }

  async isAvailable(): Promise<boolean> {
    if (this.#alwaysAvailable) return true;
    return (
      typeof Worker !== 'undefined' &&
      typeof navigator !== 'undefined' &&
      'storage' in navigator &&
      typeof navigator.storage.getDirectory === 'function'
    );
  }

  async open(): Promise<void> {
    if (this.#connection !== null) return;
    try {
      const connection = await this.#open();
      for (const statement of SCHEMA) await connection.exec(statement);
      this.#connection = connection;
    } catch (cause) {
      throw new PersistenceError(`không mở được Tầng B (SQLite/OPFS): ${String(cause)}`, cause);
    }
  }

  async close(): Promise<void> {
    await this.#connection?.close();
    this.#connection = null;
  }

  #require(): SqlConnection {
    if (this.#connection === null) {
      throw new PersistenceError('Tầng B được dùng trước khi open()');
    }
    return this.#connection;
  }

  // -------------------------------------------------------------------------
  // State sống — cố tình KHÔNG hỗ trợ
  // -------------------------------------------------------------------------

  async saveState(_slotId: string, _state: GameState, _label?: string): Promise<void> {
    throw new UnsupportedOperationError('B', 'saveState');
  }

  async loadState(_slotId: string): Promise<GameState | null> {
    throw new UnsupportedOperationError('B', 'loadState');
  }

  // -------------------------------------------------------------------------
  // Lượt chơi
  // -------------------------------------------------------------------------

  /**
   * Danh sách slot suy từ chính bảng `turns`.
   *
   * Tầng B không giữ state nên không biết `schemaVersion` thật. Đây là dữ liệu
   * để TRA CỨU; danh sách save để NẠP thì luôn hỏi Tầng A.
   */
  async listSlots(): Promise<SaveSlotMeta[]> {
    const rows = await this.#require().exec(
      `SELECT slot,
              MAX(turn) AS turn,
              MAX(ts)   AS updated_at,
              COUNT(*)  AS rows_kept
         FROM turns
        GROUP BY slot
        ORDER BY slot`,
    );

    const slots: SaveSlotMeta[] = [];
    for (const row of rows) {
      const slot = text(row, 'slot');
      const last = (
        await this.#require().exec(
          `SELECT game_year, game_month, game_day FROM turns
            WHERE slot = ? ORDER BY turn DESC LIMIT 1`,
          [slot],
        )
      )[0];
      slots.push({
        id: slot,
        label: `${slot} · ${num(row, 'rows_kept')} lượt trong kho`,
        schemaVersion: 0,
        turn: num(row, 'turn'),
        gameDate: {
          year: last === undefined ? 0 : num(last, 'game_year'),
          month: last === undefined ? 1 : num(last, 'game_month'),
          day: last === undefined ? 1 : num(last, 'game_day'),
          hour: 0,
        },
        updatedAt: num(row, 'updated_at'),
      });
    }
    return slots;
  }

  async deleteSlot(slotId: string): Promise<void> {
    const connection = this.#require();
    await connection.exec('DELETE FROM turns   WHERE slot = ?', [slotId]);
    await connection.exec('DELETE FROM checks  WHERE slot = ?', [slotId]);
    await connection.exec('DELETE FROM patches WHERE slot = ?', [slotId]);
  }

  /**
   * Ghi một biên bản lượt.
   *
   * `INSERT OR REPLACE`: chơi lại một lượt sau khi hoàn tác phải ĐÈ lên biên
   * bản cũ, không được để hai bản của cùng một lượt nằm cạnh nhau — lúc đó
   * không ai biết bản nào là chuyện đã thật sự xảy ra.
   */
  async appendTurn(slotId: string, record: TurnRecord): Promise<void> {
    await this.#require().exec(
      `INSERT OR REPLACE INTO turns
         (slot, turn, ts, game_year, game_month, game_day, reached_step, applied, op_count, record)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        slotId,
        record.turn,
        record.wallClock,
        record.gameDate.year,
        record.gameDate.month,
        record.gameDate.day,
        record.reachedStep,
        record.patch.applied ? 1 : 0,
        record.patch.opCount,
        JSON.stringify(record),
      ],
    );
  }

  async readTurns(slotId: string, query: TurnQuery = {}): Promise<TurnRecord[]> {
    const from = query.fromTurn ?? 0;
    const to = query.toTurn ?? Number.MAX_SAFE_INTEGER;
    const limit = query.limit ?? -1;

    // Lấy N dòng MỚI NHẤT rồi đảo lại: `TurnQuery.limit` là "trần dòng trả về,
    // mới nhất ở cuối", nên cắt từ đầu danh sách là cắt nhầm đầu lịch sử.
    const rows = await this.#require().exec(
      `SELECT record FROM turns
        WHERE slot = ? AND turn BETWEEN ? AND ?
        ORDER BY turn DESC
        LIMIT ?`,
      [slotId, from, to, limit],
    );

    return rows.reverse().map((row) => JSON.parse(text(row, 'record')) as TurnRecord);
  }

  // -------------------------------------------------------------------------
  // Nhật ký xúc sắc (Phần 5 mục 11)
  // -------------------------------------------------------------------------

  async appendCheck(slotId: string, entry: CheckLogEntry): Promise<void> {
    const check: CheckResult = entry.result;
    await this.#require().exec(
      `INSERT INTO checks (slot, turn, ts, check_id, system, domain, tier, result)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [slotId, entry.turn, entry.ts, check.id, check.system, check.domain, check.tier, JSON.stringify(check)],
    );
  }

  async readChecks(slotId: string, limit: number): Promise<CheckLogEntry[]> {
    const rows = await this.#require().exec(
      `SELECT turn, ts, result FROM checks
        WHERE slot = ? ORDER BY row_id DESC LIMIT ?`,
      [slotId, limit],
    );
    return rows.reverse().map((row) => ({
      turn: num(row, 'turn'),
      ts: num(row, 'ts'),
      result: JSON.parse(text(row, 'result')) as CheckResult,
    }));
  }

  /**
   * Phân phối 5 cấp theo hệ, tính bằng SQL trên TOÀN BỘ kho.
   *
   * Đây chính là thứ Tầng A không làm được: bảng thống kê ở tab Debug chỉ đếm
   * 500 lần tung còn trong RAM, mà cân bằng thì cần cả ván chơi.
   */
  async checkStats(slotId: string): Promise<TierBCheckStat[]> {
    const rows = await this.#require().exec(
      `SELECT system, tier, COUNT(*) AS count FROM checks
        WHERE slot = ? GROUP BY system, tier ORDER BY system, tier`,
      [slotId],
    );
    return rows.map((row) => ({
      system: text(row, 'system'),
      tier: text(row, 'tier'),
      count: num(row, 'count'),
    }));
  }

  // -------------------------------------------------------------------------
  // Nhật ký patch (Phần 2 mục 8)
  // -------------------------------------------------------------------------

  async appendPatch(slotId: string, entry: PatchLogEntry): Promise<void> {
    await this.#require().exec(
      `INSERT INTO patches (slot, turn, ts, op_count, manual_override, entry)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [slotId, entry.turn, entry.ts, entry.ops.length, entry.manualOverride === true ? 1 : 0, JSON.stringify(entry)],
    );
  }

  async readPatches(slotId: string, limit: number): Promise<PatchLogEntry[]> {
    const rows = await this.#require().exec(
      `SELECT entry FROM patches
        WHERE slot = ? ORDER BY row_id DESC LIMIT ?`,
      [slotId, limit],
    );
    return rows.reverse().map((row) => JSON.parse(text(row, 'entry')) as PatchLogEntry);
  }

  // -------------------------------------------------------------------------
  // Tra cứu chung
  // -------------------------------------------------------------------------

  async counts(slotId: string): Promise<TierBCounts> {
    const one = async (table: 'turns' | 'checks' | 'patches'): Promise<number> => {
      const rows = await this.#require().exec(`SELECT COUNT(*) AS n FROM ${table} WHERE slot = ?`, [slotId]);
      return num(rows[0] ?? {}, 'n');
    };
    return { turns: await one('turns'), checks: await one('checks'), patches: await one('patches') };
  }
}

/**
 * Sink của `checkLog` và `patchLog`.
 *
 * Hai lớp log ở Phần 2 và Phần 5 cố tình không biết Tầng B là gì — chúng chỉ
 * biết một interface hai hàm. Đây là chỗ duy nhất nối hai đầu lại.
 */
export function checkSinkFor(layer: SqliteLayer, slotId: string): CheckLogSink {
  return {
    append: (entry) => layer.appendCheck(slotId, entry),
    read: (limit) => layer.readChecks(slotId, limit),
  };
}

export function patchSinkFor(layer: SqliteLayer, slotId: string): PatchLogSink {
  return {
    append: (entry) => layer.appendPatch(slotId, entry),
    read: (limit) => layer.readPatches(slotId, limit),
  };
}
