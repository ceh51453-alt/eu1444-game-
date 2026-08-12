/**
 * Kết nối SQLite in-memory, dùng cho test.
 *
 * CÙNG MỘT bản SQLite mà Tầng B chạy trong trình duyệt, chỉ khác hai chỗ: VFS
 * là `:memory:` thay cho `opfs-sahpool`, và không có Worker ở giữa. Nhờ vậy bài
 * test kiểm đúng những câu SQL sẽ chạy thật, chứ không kiểm một bản giả lập
 * viết bằng mảng — mà bản giả lập thì không bao giờ báo cho biết
 * `INSERT OR REPLACE` hay `LIMIT -1` có làm đúng điều mình tưởng hay không.
 */

import type { ConnectionOpener, SqlConnection } from './sqlite';

interface OoDatabase {
  exec(options: {
    sql: string;
    bind?: unknown[];
    rowMode?: 'object';
    callback?: (row: Record<string, unknown>) => void;
  }): unknown;
  close(): void;
}

export const memoryConnection: ConnectionOpener = async (): Promise<SqlConnection> => {
  const { default: sqlite3InitModule } = await import('@sqlite.org/sqlite-wasm');
  const sqlite3 = await sqlite3InitModule();
  const db = new sqlite3.oo1.DB(':memory:') as unknown as OoDatabase;

  return {
    exec: async (sql, bind = []) => {
      const rows: Record<string, unknown>[] = [];
      db.exec({ sql, bind, rowMode: 'object', callback: (row) => void rows.push(row) });
      return rows;
    },
    close: async () => {
      db.close();
    },
  };
};
