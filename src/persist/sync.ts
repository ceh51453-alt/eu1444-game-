/**
 * Storage orchestration — enforces the sync rules of part 0 section 4 so no
 * caller has to remember them.
 *
 * The rules, restated:
 * - Runtime reads and writes tier A only.
 * - End of turn: write A, and append the turn record to B.
 * - Export merges A + B into one file (tier C).
 * - Import validates before writing, and never overwrites on failure.
 *
 * Mất một dòng kho lưu trữ KHÔNG BAO GIỜ được làm hỏng lượt chơi: Tầng B hỏng
 * chỉ sinh cảnh báo, còn Tầng A hỏng thì người gọi biết ngay ở lần ghi đầu.
 */

import type { TurnRecord } from '@/core/turn';
import type { GameState } from '@/state/schema';
import { buildBundle, type ExportBundle, type ParsedBundle } from './bundle';
import { AUTOSAVE_SLOT, type PersistenceLayer, type SaveSlotMeta } from './index';

/** Tầng C làm được hai việc ngoài `PersistenceLayer` — xuất và nhập file. */
export interface FileTier extends PersistenceLayer {
  exportBundle(bundle: ExportBundle): Promise<string>;
  importBundle(): Promise<ParsedBundle>;
}

export interface StorageTiers {
  /** State sống. Bắt buộc. */
  a: PersistenceLayer;
  /** Kho lưu trữ. Vắng mặt khi trình duyệt không có OPFS. */
  b?: PersistenceLayer;
  /** Xuất/nhập file tay. */
  c?: FileTier;
}

export interface PersistTurnReport {
  /** Tier A write succeeded. False means the turn is NOT safely stored. */
  stateWritten: boolean;
  /** Tier B append succeeded. False is tolerable. */
  archived: boolean;
  /** Non-fatal problems worth surfacing in the log. */
  warnings: string[];
}

export class StorageManager {
  constructor(private readonly tiers: StorageTiers) {}

  /** Open every configured tier that is actually available in this browser. */
  async open(): Promise<string[]> {
    const opened: string[] = [];
    for (const layer of [this.tiers.a, this.tiers.b, this.tiers.c]) {
      if (layer === undefined) continue;
      if (!(await layer.isAvailable())) continue;
      try {
        await layer.open();
        opened.push(layer.name);
      } catch {
        // A tier that will not open is simply absent; tier A failing is caught
        // by the caller when the first write throws.
      }
    }
    return opened;
  }

  async close(): Promise<void> {
    for (const layer of [this.tiers.a, this.tiers.b, this.tiers.c]) {
      await layer?.close();
    }
  }

  /** Step 10 of the turn loop. */
  async persistTurn(
    state: GameState,
    record: TurnRecord,
    slotId: string = AUTOSAVE_SLOT,
  ): Promise<PersistTurnReport> {
    const warnings: string[] = [];

    await this.tiers.a.saveState(slotId, state);

    let archived = false;
    if (this.tiers.b !== undefined) {
      try {
        await this.tiers.b.appendTurn(slotId, record);
        archived = true;
      } catch (error) {
        warnings.push(`tier B append failed: ${String(error)}`);
      }
    }
    // Tier A keeps a short tail regardless, so undo works without tier B.
    try {
      await this.tiers.a.appendTurn(slotId, record);
    } catch (error) {
      warnings.push(`tier A turn log failed: ${String(error)}`);
    }

    return { stateWritten: true, archived, warnings };
  }

  /** Boot path: load the live save, or null for a fresh campaign. */
  async loadLive(slotId: string = AUTOSAVE_SLOT): Promise<GameState | null> {
    return this.tiers.a.loadState(slotId);
  }

  async listSlots(): Promise<SaveSlotMeta[]> {
    return this.tiers.a.listSlots();
  }

  /** Ghi state hiện tại mà không tạo thêm một biên bản lượt. */
  async saveSnapshot(state: GameState, slotId: string, label?: string): Promise<void> {
    await this.tiers.a.saveState(slotId, state, label);
  }

  /** Xóa trọn một slot ở các tầng có mặt. */
  async deleteSave(slotId: string): Promise<void> {
    await this.tiers.a.deleteSlot(slotId);
    try {
      await this.tiers.b?.deleteSlot(slotId);
    } catch {
      // Tầng B chỉ là kho lịch sử; xóa state sống ở A vẫn là kết quả chính.
    }
  }

  /**
   * Tạo một file save mới từ ván đang chạy, gồm cả phần lịch sử còn đọc được.
   */
  async cloneSave(
    state: GameState,
    sourceSlotId: string,
    targetSlotId: string,
    label: string,
  ): Promise<void> {
    await this.tiers.a.saveState(targetSlotId, state, label);
    const history = await this.fullHistory(sourceSlotId);
    for (const record of history.turns) {
      await this.tiers.a.appendTurn(targetSlotId, record);
      try {
        await this.tiers.b?.appendTurn(targetSlotId, record);
      } catch {
        // Bản sao vẫn dùng được đầy đủ ở Tầng A khi kho dài hạn vắng mặt.
      }
    }
  }

  /**
   * Toàn bộ lịch sử lượt: hỏi Tầng B trước, không có thì lấy phần đuôi Tầng A.
   *
   * Tầng A cố tình chỉ giữ 200 lượt gần nhất (`TIER_A_TURN_WINDOW`), nên khi
   * không có Tầng B thì gói xuất ra sẽ CỤT lịch sử xa — người gọi phải nói điều
   * đó ra chứ không được để người chơi tưởng mình đã sao lưu đủ.
   */
  async fullHistory(slotId: string = AUTOSAVE_SLOT): Promise<{ turns: TurnRecord[]; complete: boolean }> {
    if (this.tiers.b !== undefined) {
      try {
        return { turns: await this.tiers.b.readTurns(slotId), complete: true };
      } catch {
        // Kho hỏng thì vẫn còn phần đuôi ở Tầng A.
      }
    }
    try {
      return { turns: await this.tiers.a.readTurns(slotId), complete: false };
    } catch {
      return { turns: [], complete: false };
    }
  }

  /**
   * Xuất = gộp A + B thành MỘT file, có `schemaVersion` và checksum (mục 4).
   *
   * `state` nhận từ ngoài chứ không đọc lại Tầng A: người chơi bấm Xuất là muốn
   * ván chơi ĐANG NHÌN THẤY, mà autosave thì chỉ ghi ở cuối lượt. Đọc lại đĩa
   * sẽ lặng lẽ xuất ra một trạng thái cũ hơn.
   */
  async exportSave(
    state: GameState,
    slotId: string = AUTOSAVE_SLOT,
  ): Promise<{ fileName: string; turnCount: number; complete: boolean }> {
    if (this.tiers.c === undefined) {
      throw new Error('Tầng C chưa mở — không xuất được file.');
    }
    const history = await this.fullHistory(slotId);
    const bundle = buildBundle(state, history.turns);
    const fileName = await this.tiers.c.exportBundle(bundle);
    return { fileName, turnCount: history.turns.length, complete: history.complete };
  }

  /**
   * Nhập = migrate → Zod validate → RỒI MỚI ghi (mục 4).
   *
   * Ghi vào Tầng A chỉ xảy ra sau khi `parseBundle` đã trả về; hỏng ở bất cứ
   * đâu trước đó thì ngoại lệ bay lên và save đang có không bị đụng tới (R4).
   */
  async importSave(slotId: string = AUTOSAVE_SLOT): Promise<ParsedBundle> {
    if (this.tiers.c === undefined) {
      throw new Error('Tầng C chưa mở — không nhập được file.');
    }
    const parsed = await this.tiers.c.importBundle();

    await this.tiers.a.saveState(slotId, parsed.bundle.state);
    for (const record of parsed.bundle.turns) {
      try {
        await this.tiers.a.appendTurn(slotId, record);
        await this.tiers.b?.appendTurn(slotId, record);
      } catch (error) {
        parsed.warnings.push(`không ghi lại được biên bản lượt ${record.turn}: ${String(error)}`);
      }
    }
    return parsed;
  }
}
