/**
 * Worker giữ database của Tầng B.
 *
 * VÌ SAO PHẢI LÀ WORKER — và đây là chỗ dễ mất nửa ngày nếu không ghi lại:
 * VFS `opfs-sahpool` cần `FileSystemFileHandle.createSyncAccessHandle`, mà trình
 * duyệt CHỈ phơi hàm đó ra trong ngữ cảnh Worker. Ở luồng chính nó là
 * `undefined`, và SQLite báo đúng một câu "Missing required OPFS APIs" không
 * nói gì thêm. Cross-origin isolation KHÔNG liên quan: có đủ COOP/COEP mà chạy
 * ở luồng chính thì vẫn hỏng y hệt.
 *
 * Đổi lại, cả Tầng B trở thành bất đồng bộ. Điều đó không phiền ai: mọi hàm của
 * `PersistenceLayer` vốn đã là `Promise`, và bước 10 của vòng lặp lượt cũng vậy.
 *
 * Giao thức cố tình bé nhất có thể — mở, chạy một câu SQL, đóng. Không có
 * transaction, không có prepared statement giữ qua lời gọi: mỗi câu là một
 * chuyến đi. Tầng B ghi vài dòng mỗi lượt chứ không phải vài nghìn, nên đánh
 * đổi này rẻ, và một giao thức bé thì không có chỗ cho trạng thái treo lơ lửng.
 */

import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
// Vite phát `.wasm` ra thành asset và trả về URL đúng ở cả dev lẫn bản build.
// Không có dòng này thì Emscripten tự dò `.wasm` theo `import.meta.url` của
// chunk đã bundle — chỗ đó không có file nào, và Tầng B chết chỉ ở bản build.
import wasmUrl from '@sqlite.org/sqlite-wasm/sqlite3.wasm?url';

export interface WorkerRequest {
  id: number;
  kind: 'open' | 'exec' | 'close';
  /** `open`: thư mục pool và tên file. */
  directory?: string;
  poolName?: string;
  file?: string;
  /** `exec`. */
  sql?: string;
  bind?: unknown[];
}

export interface WorkerResponse {
  id: number;
  ok: boolean;
  rows?: Record<string, unknown>[];
  error?: string;
}

interface OoDatabase {
  exec(options: {
    sql: string;
    bind?: unknown[];
    rowMode?: 'object';
    callback?: (row: Record<string, unknown>) => void;
  }): unknown;
  close(): void;
}

let db: OoDatabase | null = null;

/**
 * Khai lại chữ ký của `sqlite3InitModule` để nhận cấu hình Emscripten.
 *
 * File `.d.mts` của thư viện khai `init(): Promise<...>` không tham số, nhưng
 * hàm thật LÀ một Emscripten module factory và nhận đủ bộ ghi đè, `locateFile`
 * nằm trong đó. Đây là chỗ duy nhất trong dự án phải ép kiểu vì khai báo của
 * thư viện thiếu, và nó được thu hẹp đúng một trường thay vì mở ra `any`.
 */
type InitWithConfig = (config: {
  locateFile: (path: string) => string;
}) => ReturnType<typeof sqlite3InitModule>;

const initModule = sqlite3InitModule as unknown as InitWithConfig;

async function open(request: WorkerRequest): Promise<void> {
  if (db !== null) return;
  const sqlite3 = await initModule({ locateFile: () => wasmUrl });
  const pool = await sqlite3.installOpfsSAHPoolVfs({
    directory: request.directory ?? '.eu1444-sqlite',
    name: request.poolName ?? 'eu1444',
  });
  db = new pool.OpfsSAHPoolDb(request.file ?? '/eu1444-archive.db') as unknown as OoDatabase;
}

function exec(request: WorkerRequest): Record<string, unknown>[] {
  if (db === null) throw new Error('database chưa mở');
  const rows: Record<string, unknown>[] = [];
  db.exec({
    sql: request.sql ?? '',
    bind: request.bind ?? [],
    rowMode: 'object',
    callback: (row) => void rows.push(row),
  });
  return rows;
}

self.onmessage = (event: MessageEvent<WorkerRequest>): void => {
  const request = event.data;
  const reply = (response: WorkerResponse): void => void self.postMessage(response);

  void (async () => {
    try {
      switch (request.kind) {
        case 'open':
          await open(request);
          reply({ id: request.id, ok: true });
          break;
        case 'exec':
          reply({ id: request.id, ok: true, rows: exec(request) });
          break;
        case 'close':
          db?.close();
          db = null;
          reply({ id: request.id, ok: true });
          break;
      }
    } catch (error) {
      reply({ id: request.id, ok: false, error: String(error) });
    }
  })();
};
