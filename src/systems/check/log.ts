/**
 * LOG & THỐNG KÊ XÚC SẮC (Phần 5 mục 11).
 *
 * Hai người dùng, hai nhu cầu khác nhau:
 *   người chơi  "vì sao tôi hỏng?" → panel chi tiết lần tung gần nhất, đủ mọi
 *               dòng modifier. Game không có reroll nên đây không phải tiện
 *               nghi, nó là điều kiện để người chơi tin vào engine.
 *   người cân bằng  "hệ này có lệch không?" → phân phối 5 cấp theo từng hệ.
 *
 * Đích thật của bản đầy đủ là Tầng B (mục 11). Cấu trúc giống hệt `PatchLog`
 * của Phần 2: phần rút gọn ở RAM, bản đầy đủ đi ra sink mà `persist/storage.ts`
 * cắm vào. Trình duyệt không có OPFS thì không có sink, và mất nó không làm
 * hỏng ván chơi — chỉ mất khả năng thống kê quá 500 lần tung gần nhất.
 */

import type { CheckResult, CheckSystem, CheckTier } from '@/core/turn';
import { TIER_ORDER } from './tiers';

export interface CheckLogEntry {
  turn: number;
  /** Thời điểm thực (epoch ms), phục vụ debug chứ không phải lịch trong game. */
  ts: number;
  result: CheckResult;
}

export interface CheckLogSink {
  append(entry: CheckLogEntry): Promise<void>;
  read(limit: number): Promise<CheckLogEntry[]>;
}

export interface SystemStats {
  system: CheckSystem;
  total: number;
  byTier: Record<CheckTier, number>;
}

/** Số lần tung gần nhất giữ được trong RAM. */
export const CHECK_LOG_WINDOW = 500;

const SYSTEMS: readonly CheckSystem[] = ['d100', 'd20', '3d6', 'pool'] as const;

function emptyTierCounts(): Record<CheckTier, number> {
  const counts = {} as Record<CheckTier, number>;
  for (const tier of TIER_ORDER) counts[tier] = 0;
  return counts;
}

export class CheckLog {
  #entries: CheckLogEntry[] = [];
  #sink: CheckLogSink | null;
  #failures: string[] = [];

  constructor(
    sink: CheckLogSink | null = null,
    readonly window: number = CHECK_LOG_WINDOW,
  ) {
    this.#sink = sink;
  }

  setSink(sink: CheckLogSink | null): void {
    this.#sink = sink;
  }

  /** Ghi một lần tung. Sink hỏng KHÔNG được làm hỏng lượt chơi (R4). */
  record(turn: number, result: CheckResult, now: number = Date.now()): void {
    const entry: CheckLogEntry = { turn, ts: now, result };
    this.#entries.push(entry);
    if (this.#entries.length > this.window) {
      this.#entries.splice(0, this.#entries.length - this.window);
    }

    void this.#sink?.append(entry).catch((error: unknown) => {
      this.#failures.push(`lượt ${turn} · ${result.id}: ${String(error)}`);
    });
  }

  recordAll(turn: number, results: readonly CheckResult[], now: number = Date.now()): void {
    for (const result of results) this.record(turn, result, now);
  }

  entries(): readonly CheckLogEntry[] {
    return this.#entries;
  }

  last(): CheckLogEntry | null {
    return this.#entries.at(-1) ?? null;
  }

  /**
   * Phân phối 5 cấp theo từng hệ.
   *
   * Hệ chưa tung lần nào vẫn có một dòng với `total = 0`: một bảng thống kê
   * thiếu hẳn một hệ trông y như hệ đó cân bằng, mà thật ra là nó chưa bao giờ
   * chạy — và đó lại chính là thứ cần nhìn thấy.
   */
  stats(): SystemStats[] {
    const table = new Map<CheckSystem, SystemStats>(
      SYSTEMS.map((system) => [system, { system, total: 0, byTier: emptyTierCounts() }]),
    );

    for (const entry of this.#entries) {
      const row = table.get(entry.result.system);
      if (row === undefined) continue;
      row.total++;
      row.byTier[entry.result.tier]++;
    }

    return [...table.values()];
  }

  /** Những lần ghi ra Tầng B đã hỏng — hiện ở tab Debug. */
  sinkFailures(): readonly string[] {
    return this.#failures;
  }

  async full(limit = this.window): Promise<CheckLogEntry[]> {
    return (await this.#sink?.read(limit)) ?? [];
  }

  clear(): void {
    this.#entries = [];
    this.#failures = [];
  }
}

export const checkLog = new CheckLog();
