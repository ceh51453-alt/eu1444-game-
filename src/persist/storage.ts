/**
 * Bản lưu trữ SỐNG của ứng dụng — nối `StorageManager` vào bước 10 của vòng lặp
 * lượt (Phần 0 mục 4 và mục 6).
 *
 * Đây là chỗ DUY NHẤT dựng bộ ba tầng thật, và cũng là chỗ duy nhất biết đủ để
 * cắm sink cho hai nhật ký: `patchLog` của Phần 2 mục 8 và `checkLog` của Phần
 * 5 mục 11 đều được thiết kế để không biết Tầng B là gì — chúng chỉ biết một
 * interface hai hàm, và đây là nơi hai đầu gặp nhau.
 *
 * TẦNG B VẮNG MẶT KHÔNG PHẢI LÀ LỖI. Trình duyệt không có OPFS thì ván chơi vẫn
 * chạy trọn vẹn trên Tầng A; thứ mất đi là kho tra cứu dài hạn, và UI phải nói
 * ra điều đó chứ không được im lặng.
 */

import { patchLog } from '@/state/history';
import { checkLog } from '@/systems/check';
import { AUTOSAVE_SLOT } from './index';
import { IndexedDbLayer } from './indexeddb';
import { JsonFileLayer } from './jsonfile';
import { SqliteLayer, checkSinkFor, patchSinkFor } from './sqlite';
import { StorageManager, type StorageTiers } from './sync';

export interface StorageStatus {
  /** Tên các tầng đã mở được. */
  opened: string[];
  /** Tầng A không mở được — chơi vẫn được nhưng KHÔNG lưu được gì. */
  degraded: boolean;
  message: string;
}

let manager: StorageManager | null = null;
let archive: SqliteLayer | null = null;
let status: StorageStatus = { opened: [], degraded: true, message: 'Chưa mở tầng lưu trữ nào.' };
let opening: Promise<StorageManager | null> | null = null;
let archiveSlotId = AUTOSAVE_SLOT;

const DEFAULT_ARCHIVE_FACTORY = (): SqliteLayer => new SqliteLayer();

/** Cho phép test dựng Tầng B trên một database in-memory. `null` trả về mặc định. */
let archiveFactory: () => SqliteLayer = DEFAULT_ARCHIVE_FACTORY;

export function setArchiveFactory(factory: (() => SqliteLayer) | null): void {
  archiveFactory = factory ?? DEFAULT_ARCHIVE_FACTORY;
}

async function build(): Promise<StorageManager | null> {
  const a = new IndexedDbLayer();
  if (!(await a.isAvailable())) {
    status = {
      opened: [],
      degraded: true,
      message: 'Trình duyệt không có IndexedDB — ván chơi sẽ KHÔNG được lưu.',
    };
    return null;
  }

  try {
    await a.open();
  } catch (error) {
    status = { opened: [], degraded: true, message: `Không mở được Tầng A: ${String(error)}` };
    return null;
  }

  const tiers: StorageTiers = { a, c: new JsonFileLayer() };
  let archiveNote = '';

  const b = archiveFactory();
  try {
    if (await b.isAvailable()) {
      await b.open();
      tiers.b = b;
      archive = b;
      // Từ đây hai nhật ký mới thật sự chảy xuống đĩa. Trước đó chúng chỉ giữ
      // phần rút gọn trong RAM và mất theo mỗi lần tải lại trang.
      patchLog.setSink(patchSinkFor(b, archiveSlotId));
      checkLog.setSink(checkSinkFor(b, archiveSlotId));
    } else {
      archiveNote = 'Trình duyệt không có OPFS nên Tầng B (kho lịch sử) không chạy.';
    }
  } catch (error) {
    archiveNote = `Tầng B không mở được: ${String(error)}`;
  }

  const built = new StorageManager(tiers);
  const opened = await built.open();
  status = {
    opened,
    degraded: false,
    message: archiveNote === '' ? `Đang chạy: ${opened.join(', ')}.` : `Đang chạy: ${opened.join(', ')}. ${archiveNote}`,
  };
  return built;
}

/** Mở tầng lưu trữ một lần rồi dùng lại. Không bao giờ ném. */
export async function openStorage(): Promise<StorageManager | null> {
  if (manager !== null) return manager;
  opening ??= build().then((built) => {
    manager = built;
    return built;
  });
  return opening;
}

export function storageStatus(): StorageStatus {
  return status;
}

/**
 * Tầng B đang chạy, hoặc `null`.
 *
 * Lộ ra để tab Debug hỏi thẳng SQL — bảng thống kê trong RAM chỉ thấy 500 lần
 * tung gần nhất, còn cân bằng thì cần cả ván chơi (Phần 5 mục 11).
 */
export function archiveLayer(): SqliteLayer | null {
  return archive;
}

/** Chuyển hai nhật ký dài hạn sang đúng file save đang hoạt động. */
export function bindArchiveSlot(slotId: string): void {
  archiveSlotId = slotId;
  if (archive !== null) {
    patchLog.setSink(patchSinkFor(archive, slotId));
    checkLog.setSink(checkSinkFor(archive, slotId));
  }
}

/** Chỉ dùng trong test, để mỗi bài chạy trên một bộ tầng sạch. */
export function resetStorage(): void {
  manager = null;
  archive = null;
  opening = null;
  status = { opened: [], degraded: true, message: 'Chưa mở tầng lưu trữ nào.' };
  archiveSlotId = AUTOSAVE_SLOT;
  patchLog.setSink(null);
  checkLog.setSink(null);
}
