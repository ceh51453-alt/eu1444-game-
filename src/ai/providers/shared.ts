/**
 * Helpers shared by the three adapters: URL joining, debug-log bookkeeping,
 * and param filtering.
 *
 * Lives in its own module so `provider.ts` (which imports the adapters) and the
 * adapters (which need these helpers) never form an import cycle.
 */

import { debugLog } from '../debuglog';
import { fetchJson, fetchSse, type HttpJsonResult, type HttpRequest } from '../http';
import { LlmError } from '../errors';
import type { SseEvent } from '../sse';

/** Base URL without a trailing slash, so path joins stay predictable. */
export function trimBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, '');
}

/** Drop keys the model does not accept, plus anything set to `undefined`. */
export function pickParams(
  params: Record<string, unknown>,
  allowed: readonly string[],
  unsupported: readonly string[],
): Record<string, unknown> {
  const blocked = new Set(unsupported);
  const out: Record<string, unknown> = {};
  for (const key of allowed) {
    if (blocked.has(key)) continue;
    const value = params[key];
    if (value === undefined || value === null) continue;
    if (typeof value === 'string' && value === '') continue;
    if (Array.isArray(value) && value.length === 0) continue;
    out[key] = value;
  }
  return out;
}

interface LogContext {
  profile: string;
  providerId: string;
  model: string;
  request: HttpRequest;
}

function contextOf(ctx: LogContext): number {
  return debugLog.start({
    profile: ctx.profile,
    providerId: ctx.providerId,
    model: ctx.model,
    method: ctx.request.method,
    url: ctx.request.url,
    headers: ctx.request.headers,
    requestBody: ctx.request.body === undefined ? '' : JSON.stringify(ctx.request.body, null, 2),
  });
}

/** JSON call with the debug tab wired up. */
export async function loggedJson(ctx: LogContext): Promise<HttpJsonResult> {
  const id = contextOf(ctx);
  try {
    const result = await fetchJson(ctx.request);
    debugLog.finish(id, {
      status: result.status,
      responseBody: result.rawBody,
      latencyMs: result.latencyMs,
    });
    return result;
  } catch (error) {
    const llmError = error instanceof LlmError ? error : new LlmError('unknown', { cause: error });
    debugLog.finish(id, {
      ...(llmError.status === undefined ? {} : { status: llmError.status }),
      responseBody: llmError.detail ?? '',
      errorKind: llmError.kind,
    });
    throw llmError;
  }
}

export interface LoggedSseResult {
  status: number;
  latencyMs: number;
}

/** SSE call with the debug tab wired up; every raw event is kept for display. */
export async function loggedSse(
  ctx: LogContext,
  onEvent: (event: SseEvent) => void,
  usageOf: () => { in: number; out: number } | null,
): Promise<LoggedSseResult> {
  const id = contextOf(ctx);
  const seen: string[] = [];

  try {
    const result = await fetchSse(ctx.request, (event) => {
      seen.push(event.event === '' ? event.data : `event: ${event.event}\ndata: ${event.data}`);
      onEvent(event);
    });
    debugLog.finish(id, {
      status: result.status,
      responseBody: seen.join('\n'),
      latencyMs: result.latencyMs,
      usage: usageOf(),
    });
    return result;
  } catch (error) {
    const llmError = error instanceof LlmError ? error : new LlmError('unknown', { cause: error });
    debugLog.finish(id, {
      ...(llmError.status === undefined ? {} : { status: llmError.status }),
      responseBody: [...seen, llmError.detail ?? ''].join('\n'),
      errorKind: llmError.kind,
    });
    throw llmError;
  }
}

/**
 * Trần ngữ cảnh và trần đầu ra của một mục trong `GET /models`.
 *
 * Không có chuẩn nào cả: OpenRouter trả `context_length` +
 * `top_provider.max_completion_tokens`, vLLM trả `max_model_len`, nhiều proxy
 * cộng đồng trả `max_tokens` mà lại có nghĩa là CỬA SỔ NGỮ CẢNH chứ không phải
 * trần đầu ra. Đó chính là chỗ 65k đầu ra bị đọc thành 2 triệu.
 *
 * Luật ở đây: chỉ nhận `max_tokens` làm trần ĐẦU RA khi biết chắc cửa sổ ngữ
 * cảnh là một số KHÁC. Bằng nhau nghĩa là proxy đang nói về cùng một thứ, và
 * lúc đó nó là cửa sổ ngữ cảnh.
 */
export function limitsOf(entry: Record<string, unknown>): {
  contextWindow?: number;
  maxOutput?: number;
} {
  const num = (value: unknown): number | undefined =>
    typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;

  const top = entry['top_provider'];
  const nested = typeof top === 'object' && top !== null ? (top as Record<string, unknown>) : {};

  const contextWindow =
    num(entry['context_length']) ??
    num(entry['context_window']) ??
    num(entry['max_context_length']) ??
    num(entry['max_input_tokens']) ??
    num(entry['max_model_len']) ??
    num(nested['context_length']);

  const declaredOutput =
    num(entry['max_completion_tokens']) ??
    num(entry['max_output_tokens']) ??
    num(nested['max_completion_tokens']);

  const looseMax = num(entry['max_tokens']);
  const maxOutput =
    declaredOutput ??
    (looseMax !== undefined && contextWindow !== undefined && looseMax !== contextWindow
      ? looseMax
      : undefined);

  return {
    ...(contextWindow === undefined ? {} : { contextWindow }),
    ...(maxOutput === undefined ? {} : { maxOutput }),
  };
}

/** Which profile a call belongs to, for the debug tab. */
export function profileOf(meta: Record<string, unknown> | undefined): string {
  const profile = meta?.['profile'];
  return typeof profile === 'string' ? profile : 'main';
}

/** Parse an SSE `data:` payload, tolerating the `[DONE]` sentinel. */
export function parseSseJson(data: string): unknown | null {
  const trimmed = data.trim();
  if (trimmed === '' || trimmed === '[DONE]') return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}
