/**
 * Undo stack.
 *
 * R3 spells out what undo means here: rewinding restores `rngState` as well,
 * so redoing the same action rolls the same dice. Undo is a way to take back a
 * misclick, NOT a way to reroll a bad outcome — the game has no reroll, and
 * this is the module that has to make that stick.
 *
 * Consequence of that rule: an entry holds a FULL state snapshot taken before
 * the turn ran, RNG streams included. Anything cheaper (a diff, a patch log)
 * risks leaving the generator ahead of where the state thinks it is, and that
 * is exactly the hole a save-scummer walks through.
 *
 * History lives OUTSIDE `GameState` on purpose: it is not game data, it must
 * not bloat every autosave, and it must not be exported to another player.
 */

import type { RngHubState } from '@/core/rng';
import type { PatchOp } from './mvu-parse';
import type { GameState } from './slices';

/** How many turns back the player can step by default. */
export const DEFAULT_UNDO_DEPTH = 20;

export interface HistoryEntry {
  /** Turn number the snapshot was taken BEFORE. */
  turn: number;
  /** Short description of what is about to happen, for the undo menu. */
  label: string;
  /** Full pre-turn state, RNG streams included. */
  state: GameState;
  /** Wall-clock epoch ms, for display only. */
  recordedAt: number;
}

export class TurnHistory {
  readonly capacity: number;
  #entries: HistoryEntry[] = [];

  constructor(capacity: number = DEFAULT_UNDO_DEPTH) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new RangeError(`undo depth must be a positive integer, got ${capacity}`);
    }
    this.capacity = capacity;
  }

  /** Number of steps the player can currently take back. */
  get depth(): number {
    return this.#entries.length;
  }

  get canUndo(): boolean {
    return this.#entries.length > 0;
  }

  /**
   * Record the state BEFORE a turn runs. Call this at step 1 of the loop, not
   * step 10 — a turn that crashes halfway must still be undoable.
   */
  push(state: GameState, label: string, now: number = Date.now()): void {
    this.#entries.push({
      turn: state.meta.turn,
      label,
      state: structuredClone(state),
      recordedAt: now,
    });
    if (this.#entries.length > this.capacity) {
      this.#entries.splice(0, this.#entries.length - this.capacity);
    }
  }

  /**
   * Step back one turn. Returns the state to install, or null when there is
   * nothing left to undo. The caller feeds the result to `store.loadState`.
   */
  undo(): GameState | null {
    const entry = this.#entries.pop();
    if (entry === undefined) return null;
    return structuredClone(entry.state);
  }

  /** What undo would take back, without taking it back. */
  peek(): HistoryEntry | null {
    const entry = this.#entries.at(-1);
    return entry === undefined ? null : { ...entry, state: structuredClone(entry.state) };
  }

  /** Labels newest-first, for an undo menu. */
  list(): ReadonlyArray<{ turn: number; label: string; recordedAt: number }> {
    return this.#entries
      .map(({ turn, label, recordedAt }) => ({ turn, label, recordedAt }))
      .reverse();
  }

  /** Drop everything. Call on new game and on load. */
  clear(): void {
    this.#entries = [];
  }
}

// ---------------------------------------------------------------------------
// NHẬT KÝ PATCH (Phần 2 mục 8)
// ---------------------------------------------------------------------------

/** Một bản ghi lượt, đúng theo Phần 2 mục 8. */
export interface PatchLogEntry {
  turn: number;
  seed: string;
  /** Vị trí mọi dòng xúc sắc ĐẦU lượt — undo tua về đây (R3). */
  rngState: RngHubState;
  ops: PatchOp[];
  before: GameState;
  after: GameState;
  ts: number;
  /** Đặt khi người chơi sửa tay ở tầng 2 (Phần 2 mục 6). */
  manualOverride?: boolean;
}

/** Bản ghi rút gọn giữ trong RAM: đủ để hiện danh sách, không giữ hai state. */
export interface PatchLogSummary {
  turn: number;
  ts: number;
  opCount: number;
  changedPaths: string[];
  manualOverride: boolean;
}

/**
 * Nơi nhận bản ghi đầy đủ.
 *
 * Đích thật là Tầng B (SQLite) — Phần 2 mục 8 nói rõ "không giữ hết trong RAM".
 * Sink được cắm ở `persist/storage.ts`, chỗ duy nhất biết Tầng B có mở được
 * hay không. Trình duyệt không có OPFS thì chưa ai cắm, và lúc đó chỉ còn phần
 * rút gọn trong RAM — mất nó không hỏng ván chơi.
 */
export interface PatchLogSink {
  append(entry: PatchLogEntry): Promise<void>;
  read(limit: number): Promise<PatchLogEntry[]>;
}

/** Số lượt gần nhất phải giữ được (Phần 2 mục 8). */
export const PATCH_LOG_WINDOW = 200;

export class PatchLog {
  #summaries: PatchLogSummary[] = [];
  #sink: PatchLogSink | null;
  #failures: string[] = [];

  constructor(
    sink: PatchLogSink | null = null,
    readonly window: number = PATCH_LOG_WINDOW,
  ) {
    this.#sink = sink;
  }

  setSink(sink: PatchLogSink | null): void {
    this.#sink = sink;
  }

  /**
   * Ghi một lượt. Phần rút gọn vào RAM ngay; bản đầy đủ đi ra sink.
   * Sink hỏng KHÔNG được làm hỏng lượt chơi — chỉ ghi lại là đã hỏng.
   */
  record(entry: PatchLogEntry): void {
    this.#summaries.push({
      turn: entry.turn,
      ts: entry.ts,
      opCount: entry.ops.length,
      changedPaths: entry.ops.map((op) => op.path),
      manualOverride: entry.manualOverride === true,
    });
    if (this.#summaries.length > this.window) {
      this.#summaries.splice(0, this.#summaries.length - this.window);
    }

    void this.#sink?.append(entry).catch((error: unknown) => {
      this.#failures.push(`lượt ${entry.turn}: ${String(error)}`);
    });
  }

  summaries(): readonly PatchLogSummary[] {
    return this.#summaries;
  }

  /** Những lần ghi ra Tầng B đã hỏng — hiện ở tab Debug. */
  sinkFailures(): readonly string[] {
    return this.#failures;
  }

  async full(limit = this.window): Promise<PatchLogEntry[]> {
    return (await this.#sink?.read(limit)) ?? [];
  }

  clear(): void {
    this.#summaries = [];
    this.#failures = [];
  }
}

export const patchLog = new PatchLog();
