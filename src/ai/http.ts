/**
 * HTTP layer shared by the three adapters: timeout, abort, retry, and error
 * classification (part 1 sections 4 and 8).
 *
 * Retry policy is deliberately narrow — 429 and 5xx only, three attempts,
 * 1s / 4s / 10s. Retrying a 401 just locks the account out faster, and
 * retrying a 400 sends the same broken body again.
 */

import { classifyThrown, kindForStatus, LlmError } from './errors';
import { readSse, type SseEvent } from './sse';

export const RETRY_BACKOFF_MS = [1000, 4000, 10000] as const;
export const DEFAULT_TIMEOUT_MS = 120000;

export interface HttpRequest {
  url: string;
  method: 'GET' | 'POST';
  headers: Record<string, string>;
  body?: unknown;
  timeoutMs: number;
  /** The player's "Dừng" button. */
  signal?: AbortSignal | undefined;
}

export interface HttpJsonResult {
  status: number;
  data: unknown;
  rawBody: string;
  latencyMs: number;
}

function bodyText(body: unknown): string {
  return body === undefined ? '' : JSON.stringify(body);
}

/** Combine our timeout with the caller's abort signal. */
function makeSignal(timeoutMs: number, external: AbortSignal | undefined): {
  signal: AbortSignal;
  timedOut: () => boolean;
  dispose: () => void;
} {
  const controller = new AbortController();
  let timedOut = false;

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  const onExternalAbort = (): void => controller.abort();
  external?.addEventListener('abort', onExternalAbort);
  if (external?.aborted === true) controller.abort();

  return {
    signal: controller.signal,
    timedOut: () => timedOut,
    dispose: () => {
      clearTimeout(timer);
      external?.removeEventListener('abort', onExternalAbort);
    },
  };
}

async function readErrorBody(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, 4000);
  } catch {
    return '';
  }
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Run an attempt, retrying only the retryable kinds. `attempt` must be
 * side-effect free up to the point it can still fail retryably — which is why
 * streaming only retries before the first chunk has been handed to the caller.
 */
async function withRetry<T>(attempt: () => Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  let lastError: LlmError | null = null;

  for (let tryIndex = 0; tryIndex <= RETRY_BACKOFF_MS.length; tryIndex++) {
    try {
      return await attempt();
    } catch (error) {
      const llmError = error instanceof LlmError ? error : classifyThrown(error);
      if (!llmError.retryable || tryIndex === RETRY_BACKOFF_MS.length) throw llmError;
      lastError = llmError;
      const delay = RETRY_BACKOFF_MS[tryIndex] ?? 0;
      await sleep(delay);
      if (signal?.aborted === true) throw new LlmError('aborted');
    }
  }

  throw lastError ?? new LlmError('unknown');
}

/** One JSON request/response. Used for model scans and non-streaming calls. */
export async function fetchJson(request: HttpRequest): Promise<HttpJsonResult> {
  return withRetry(async () => {
    const started = performance.now();
    const gate = makeSignal(request.timeoutMs, request.signal);

    try {
      const response = await fetch(request.url, {
        method: request.method,
        headers: request.headers,
        body: request.body === undefined ? null : bodyText(request.body),
        signal: gate.signal,
      });

      const rawBody = await response.text();
      const latencyMs = Math.round(performance.now() - started);

      if (!response.ok) {
        throw new LlmError(kindForStatus(response.status), {
          status: response.status,
          detail: rawBody.slice(0, 4000),
        });
      }

      let data: unknown;
      try {
        data = rawBody === '' ? null : JSON.parse(rawBody);
      } catch (cause) {
        throw new LlmError('parse', { status: response.status, detail: rawBody.slice(0, 1000), cause });
      }

      return { status: response.status, data, rawBody, latencyMs };
    } catch (error) {
      throw classifyThrown(error, gate.timedOut());
    } finally {
      gate.dispose();
    }
  }, request.signal);
}

export interface SseResult {
  status: number;
  latencyMs: number;
}

/**
 * POST and consume an SSE response.
 *
 * `onEvent` starts firing as soon as bytes arrive, so a failure after the first
 * event is NOT retried — replaying it would duplicate text the caller has
 * already shown to the player.
 */
export async function fetchSse(
  request: HttpRequest,
  onEvent: (event: SseEvent) => void,
): Promise<SseResult> {
  let delivered = 0;

  const attempt = async (): Promise<SseResult> => {
    const started = performance.now();
    const gate = makeSignal(request.timeoutMs, request.signal);

    try {
      const response = await fetch(request.url, {
        method: request.method,
        headers: request.headers,
        body: request.body === undefined ? null : bodyText(request.body),
        signal: gate.signal,
      });

      if (!response.ok) {
        throw new LlmError(kindForStatus(response.status), {
          status: response.status,
          detail: await readErrorBody(response),
        });
      }
      if (response.body === null) {
        throw new LlmError('parse', { status: response.status, detail: 'phản hồi không có thân' });
      }

      for await (const event of readSse(response.body)) {
        delivered++;
        onEvent(event);
      }

      return { status: response.status, latencyMs: Math.round(performance.now() - started) };
    } catch (error) {
      const llmError = classifyThrown(error, gate.timedOut());
      // Past the first delivered event, a retry would re-emit text the player
      // has already read — surface the failure instead.
      if (delivered > 0 && llmError.retryable) {
        throw new LlmError(llmError.kind, {
          ...(llmError.status === undefined ? {} : { status: llmError.status }),
          detail: `${llmError.detail ?? ''} (đã nhận ${delivered} sự kiện, không thử lại)`.trim(),
          retryable: false,
        });
      }
      throw llmError;
    } finally {
      gate.dispose();
    }
  };

  return withRetry(attempt, request.signal);
}
