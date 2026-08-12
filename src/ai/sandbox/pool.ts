/**
 * Worker lifecycle: send a job, wait with a timeout, `terminate()` on hang.
 *
 * One worker at a time is enough — scripts run per turn, not concurrently — and
 * a single worker makes "Dừng mọi script" a one-liner.
 */

import type { SandboxJob, SandboxLogLine, SandboxReply, SandboxRequest } from './worker';

export type { SandboxJob, SandboxLogLine } from './worker';

export const DEFAULT_SCRIPT_TIMEOUT_MS = 3000;

export interface SandboxResult {
  value: unknown;
  logs: SandboxLogLine[];
  elapsedMs: number;
}

export class SandboxTimeout extends Error {
  constructor(readonly timeoutMs: number) {
    super(`script vượt quá ${timeoutMs}ms và đã bị dừng`);
    this.name = 'SandboxTimeout';
  }
}

interface Pending {
  resolve: (result: SandboxResult) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  startedAt: number;
}

export class SandboxPool {
  #worker: Worker | null = null;
  #pending = new Map<number, Pending>();
  #nextJobId = 1;

  /** False in environments without Workers (node tests, very old browsers). */
  isAvailable(): boolean {
    return typeof Worker !== 'undefined';
  }

  #ensure(): Worker {
    if (this.#worker !== null) return this.#worker;

    const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<SandboxReply>): void => {
      const reply = event.data;
      const pending = this.#pending.get(reply.jobId);
      if (pending === undefined) return;
      this.#pending.delete(reply.jobId);
      clearTimeout(pending.timer);

      const elapsedMs = Date.now() - pending.startedAt;
      if (reply.ok) pending.resolve({ value: reply.value, logs: reply.logs, elapsedMs });
      else {
        const error = new Error(reply.message);
        error.name = 'SandboxError';
        Object.assign(error, { logs: reply.logs, elapsedMs });
        pending.reject(error);
      }
    };
    worker.onerror = (event: ErrorEvent): void => {
      this.#failAll(new Error(event.message === '' ? 'worker lỗi' : event.message));
    };

    this.#worker = worker;
    return worker;
  }

  async run(job: SandboxJob, timeoutMs: number = DEFAULT_SCRIPT_TIMEOUT_MS): Promise<SandboxResult> {
    if (!this.isAvailable()) {
      throw new Error('môi trường này không có Worker; script loại tính toán bị bỏ qua');
    }

    const worker = this.#ensure();
    const jobId = this.#nextJobId++;

    return new Promise<SandboxResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(jobId);
        // Only terminate() actually stops a runaway loop — this is the whole
        // reason compute scripts do not run on the main thread.
        this.terminateAll();
        reject(new SandboxTimeout(timeoutMs));
      }, timeoutMs);

      this.#pending.set(jobId, { resolve, reject, timer, startedAt: Date.now() });
      const request: SandboxRequest = { jobId, job };
      worker.postMessage(request);
    });
  }

  /** Nút "Dừng mọi script". */
  terminateAll(): void {
    this.#worker?.terminate();
    this.#worker = null;
    this.#failAll(new Error('mọi script đã bị dừng'));
  }

  #failAll(error: Error): void {
    for (const pending of this.#pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.#pending.clear();
  }
}

export const sandboxPool = new SandboxPool();
