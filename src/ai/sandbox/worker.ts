/**
 * Compute worker.
 *
 * The reason this exists is NOT security — part 1 section 6.8 is explicit that
 * `tavern_helper` scripts need no security isolation, they are the player's own
 * code. The reason is `terminate()`: a script with a runaway loop, or a greedy
 * regex, cannot be interrupted on the main thread, and a hung game is
 * indistinguishable from a crashed one.
 *
 * Consequence: this worker has NO DOM. Scripts that touch `document` must be
 * classified as UI scripts and run on the main thread instead — pushing them in
 * here does not make them safer, it makes them dead.
 */

export interface SandboxLogLine {
  level: 'log' | 'warn' | 'error';
  args: string[];
  at: number;
}

export type SandboxJob =
  | { kind: 'script'; id: string; code: string; state: unknown; input: unknown }
  | { kind: 'regex'; id: string; pattern: string; flags: string; replace: string; input: string };

export type SandboxRequest = { jobId: number; job: SandboxJob };

export type SandboxReply =
  | { jobId: number; ok: true; value: unknown; logs: SandboxLogLine[] }
  | { jobId: number; ok: false; message: string; logs: SandboxLogLine[] };

function runJob(job: SandboxJob, logs: SandboxLogLine[]): unknown {
  if (job.kind === 'regex') {
    return job.input.replace(new RegExp(job.pattern, job.flags), job.replace);
  }

  const record =
    (level: SandboxLogLine['level']) =>
    (...args: unknown[]): void => {
      logs.push({ level, args: args.map((arg) => safeString(arg)), at: Date.now() });
    };

  // The API surface handed to a script. `state` is a structured clone — writing
  // to it changes nothing, which is the architectural limit from section 6.8:
  // scripts read state freely, but the only way to CHANGE state is to return
  // PatchOp[] for part 2 to vet.
  const api = {
    state: job.state,
    input: job.input,
    log: record('log'),
    warn: record('warn'),
    error: record('error'),
  };

  // eslint-disable-next-line no-new-func -- the player's own script, by design
  const fn = new Function('api', `"use strict";\n${job.code}`) as (arg: unknown) => unknown;
  return fn(api);
}

function safeString(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

self.onmessage = (event: MessageEvent<SandboxRequest>): void => {
  const { jobId, job } = event.data;
  const logs: SandboxLogLine[] = [];
  try {
    const value = runJob(job, logs);
    const reply: SandboxReply = { jobId, ok: true, value, logs };
    self.postMessage(reply);
  } catch (error) {
    const reply: SandboxReply = { jobId, ok: false, message: String(error), logs };
    self.postMessage(reply);
  }
};
