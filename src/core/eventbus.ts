/**
 * In-process event bus.
 *
 * Job: let systems announce what happened without importing each other. The
 * lorebook (part 4) fires `lore.knowledge.gain`, the knowledge slice picks it
 * up, and neither module knows the other exists. Part 0 section 7 forbids
 * cross-imports between systems; this is the seam that replaces them.
 *
 * TWO RULES, and part 4 section 10 leans on both:
 *
 * 1. HANDLERS NEVER MUTATE STATE. An event says something happened; turning
 *    that into a state change means producing `PatchOp[]` and letting MVU
 *    validate them. A handler that writes state directly bypasses
 *    compare-and-swap, the patch log and undo all at once (R2).
 *
 * 2. DELIVERY IS SYNCHRONOUS AND ORDERED. Handlers run in subscription order,
 *    every time, so replaying a save produces the same handler order — and
 *    therefore the same result (R3).
 *
 * A handler that throws is contained: the error is recorded and the remaining
 * handlers still run. One broken listener must not cost the player their turn
 * (R4).
 */

export interface GameEvent<T = unknown> {
  type: string;
  payload: T;
  /** Ai phát ra, để tra khi một event xuất hiện mà không rõ từ đâu. */
  source: string;
}

export type EventHandler<T = unknown> = (event: GameEvent<T>) => void;

export interface EmitReport {
  /** Số handler đã chạy xong. */
  delivered: number;
  /** Handler ném lỗi, kèm nguyên nhân. */
  failures: { owner: string; error: string }[];
}

interface Subscription {
  type: string;
  handler: EventHandler<never>;
  /** Tên chủ sở hữu, để `unregister` gỡ theo nhóm và để log đọc được. */
  owner: string;
}

class EventBus {
  #subscriptions: Subscription[] = [];
  #log: GameEvent[] = [];
  readonly logSize = 200;

  /** Đăng ký nghe. Trả về hàm gỡ. */
  on<T>(type: string, handler: EventHandler<T>, owner = 'ẩn danh'): () => void {
    const subscription: Subscription = { type, handler: handler as EventHandler<never>, owner };
    this.#subscriptions.push(subscription);
    return () => {
      const at = this.#subscriptions.indexOf(subscription);
      if (at !== -1) this.#subscriptions.splice(at, 1);
    };
  }

  /** Gỡ mọi đăng ký của một chủ sở hữu. Dùng khi module được nạp lại lúc dev. */
  unregister(owner: string): void {
    this.#subscriptions = this.#subscriptions.filter((entry) => entry.owner !== owner);
  }

  emit<T>(type: string, payload: T, source = 'engine'): EmitReport {
    const event: GameEvent<T> = { type, payload, source };

    this.#log.push(event as GameEvent);
    if (this.#log.length > this.logSize) {
      this.#log.splice(0, this.#log.length - this.logSize);
    }

    const report: EmitReport = { delivered: 0, failures: [] };
    // Chụp lại danh sách trước khi gọi: một handler tự gỡ mình giữa chừng
    // không được làm lệch vòng lặp đang chạy.
    for (const subscription of [...this.#subscriptions]) {
      if (subscription.type !== type) continue;
      try {
        (subscription.handler as EventHandler<T>)(event);
        report.delivered++;
      } catch (error) {
        report.failures.push({ owner: subscription.owner, error: String(error) });
      }
    }
    return report;
  }

  /** Số handler đang nghe một loại event, hoặc tổng cộng. */
  listenerCount(type?: string): number {
    if (type === undefined) return this.#subscriptions.length;
    return this.#subscriptions.filter((entry) => entry.type === type).length;
  }

  /** Event gần đây, cho tab Debug. */
  recent(limit = 50): readonly GameEvent[] {
    return this.#log.slice(-limit);
  }

  clear(): void {
    this.#subscriptions = [];
    this.#log = [];
  }
}

export const events = new EventBus();
