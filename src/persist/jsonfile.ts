/**
 * Tầng C — file JSON ngoài, qua File System Access API, thoái lui về
 * download/upload khi trình duyệt không có nó (Phần 0 mục 4).
 *
 * VÌ SAO TẦNG NÀY TỒN TẠI: sao lưu, chia sẻ ván chơi, và quan trọng nhất là mở
 * save ra bằng trình soạn thảo để sửa tay lúc debug. Điều cuối cùng đó là lý do
 * checksum lệch chỉ CẢNH BÁO chứ không chặn (xem `bundle.ts`) — chặn thì đúng
 * công dụng chính của tầng này bị khóa.
 *
 * Luật dựng gói, băm, migrate và validate nằm hết ở `bundle.ts`. File này chỉ
 * lo phần đụng tới đĩa, và đó là toàn bộ phần không test được trong node.
 */

import type { TurnRecord } from '@/core/turn';
import type { GameState } from '@/state/schema';
import { parseBundle, serializeBundle, type ExportBundle, type ParsedBundle } from './bundle';
import {
  UnsupportedOperationError,
  type PersistenceLayer,
  type SaveSlotMeta,
  type StorageTier,
  type TurnQuery,
} from './index';

export type { ExportBundle } from './bundle';

/** Tên file gợi ý. Có lượt và ngày trong game để xếp thư mục nhìn là hiểu. */
export function suggestedFileName(bundle: ExportBundle): string {
  const date = bundle.state.meta.gameDate;
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `eu1444-luot${bundle.state.meta.turn}-${date.year}${pad(date.month)}${pad(date.day)}.json`;
}

interface FilePickerWindow {
  showSaveFilePicker?: (options: unknown) => Promise<{
    createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void> }>;
  }>;
  showOpenFilePicker?: (options: unknown) => Promise<Array<{ getFile(): Promise<File> }>>;
}

function picker(): FilePickerWindow {
  return typeof window === 'undefined' ? {} : (window as unknown as FilePickerWindow);
}

/** Người chơi bấm Hủy trên hộp thoại chọn file. Không phải lỗi. */
export class FileDialogCancelled extends Error {
  constructor() {
    super('người chơi đã hủy hộp thoại chọn file');
    this.name = 'FileDialogCancelled';
  }
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

const FILE_TYPES = [{ description: 'Ván chơi eu1444', accept: { 'application/json': ['.json'] } }];

/** Thoái lui: thẻ `<a download>`. Chạy ở mọi trình duyệt, kể cả Firefox. */
function downloadFallback(text: string, fileName: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

/** Thoái lui: `<input type="file">` ẩn. */
function uploadFallback(): Promise<string> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (file === undefined) {
        reject(new FileDialogCancelled());
        return;
      }
      file.text().then(resolve, reject);
    });
    // Hộp thoại bị hủy thì `change` không bao giờ bắn, nên `cancel` là đường
    // duy nhất biết được — trình duyệt cũ không có nó thì Promise treo, và một
    // Promise treo ở đây chỉ nghĩa là nút Nhập không phản hồi cho tới khi bấm
    // lại. Đó là cái giá rẻ nhất trong các lựa chọn.
    input.addEventListener('cancel', () => reject(new FileDialogCancelled()));
    input.click();
  });
}

export class JsonFileLayer implements PersistenceLayer {
  readonly tier: StorageTier = 'C';
  readonly name = 'jsonfile';

  async isAvailable(): Promise<boolean> {
    // Đường thoái lui chạy ở mọi nơi, nên tầng này luôn dùng được.
    return true;
  }

  async open(): Promise<void> {
    // Không giữ handle nào; mỗi lần xuất/nhập tự chọn file của nó.
  }

  async close(): Promise<void> {
    // Không có gì để đóng.
  }

  async saveState(_slotId: string, _state: GameState, _label?: string): Promise<void> {
    throw new UnsupportedOperationError('C', 'saveState (dùng exportBundle)');
  }

  async loadState(_slotId: string): Promise<GameState | null> {
    throw new UnsupportedOperationError('C', 'loadState (dùng importBundle)');
  }

  async listSlots(): Promise<SaveSlotMeta[]> {
    throw new UnsupportedOperationError('C', 'listSlots');
  }

  async deleteSlot(_slotId: string): Promise<void> {
    throw new UnsupportedOperationError('C', 'deleteSlot');
  }

  async appendTurn(_slotId: string, _record: TurnRecord): Promise<void> {
    throw new UnsupportedOperationError('C', 'appendTurn');
  }

  async readTurns(_slotId: string, _query?: TurnQuery): Promise<TurnRecord[]> {
    throw new UnsupportedOperationError('C', 'readTurns');
  }

  /** Ghi một gói ra đĩa. Trả về tên file đã dùng. */
  async exportBundle(bundle: ExportBundle): Promise<string> {
    const text = serializeBundle(bundle);
    const fileName = suggestedFileName(bundle);
    const showSaveFilePicker = picker().showSaveFilePicker;

    if (showSaveFilePicker === undefined) {
      downloadFallback(text, fileName);
      return fileName;
    }

    try {
      const handle = await showSaveFilePicker({ suggestedName: fileName, types: FILE_TYPES });
      const writable = await handle.createWritable();
      await writable.write(text);
      await writable.close();
      return fileName;
    } catch (error) {
      if (isAbort(error)) throw new FileDialogCancelled();
      // Một số ngữ cảnh (iframe, quyền bị chặn) có API nhưng gọi là hỏng —
      // đường thoái lui vẫn đưa được file cho người chơi.
      downloadFallback(text, fileName);
      return fileName;
    }
  }

  /**
   * Đọc một gói về. Đã migrate và đã qua Zod trước khi trả ra — người gọi nhận
   * được thứ dùng được ngay, hoặc một ngoại lệ, không có ở giữa (R4).
   */
  async importBundle(): Promise<ParsedBundle> {
    const showOpenFilePicker = picker().showOpenFilePicker;

    let text: string;
    if (showOpenFilePicker === undefined) {
      text = await uploadFallback();
    } else {
      try {
        const [handle] = await showOpenFilePicker({ types: FILE_TYPES, multiple: false });
        if (handle === undefined) throw new FileDialogCancelled();
        text = await (await handle.getFile()).text();
      } catch (error) {
        if (isAbort(error)) throw new FileDialogCancelled();
        if (error instanceof FileDialogCancelled) throw error;
        text = await uploadFallback();
      }
    }

    return parseBundle(JSON.parse(text) as unknown);
  }
}
