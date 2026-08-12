/**
 * Anthropic adapter (part 1 section 3.3).
 *
 * Two things bite here:
 *  - `anthropic-dangerous-direct-browser-access: true` is mandatory when
 *    calling from a browser; without it the request dies in CORS and the error
 *    looks like a dead proxy.
 *  - `system` is its own top-level field, NOT a message with role "system".
 *
 * A third one the spec did not know about: the newer models REJECT
 * `temperature` / `top_p` / `top_k` with a 400 rather than ignoring them, so
 * they are reported as unsupported and stripped before sending.
 */

import { z } from 'zod';
import { LlmError } from '../errors';
import {
  defaultsOf,
  type ConnCfg,
  type LLMProvider,
  type LLMRequest,
  type LLMResponse,
  type ModelInfo,
  type ParamSpec,
  type ParamWarning,
} from '../provider';
import { loggedJson, loggedSse, parseSseJson, pickParams, profileOf, trimBaseUrl } from './shared';

export const ANTHROPIC_VERSION = '2023-06-01';

const PARAM_KEYS = ['temperature', 'top_p', 'top_k'] as const;

const paramSchema = z
  .object({
    temperature: z.number().min(0).max(1).optional(),
    top_p: z.number().min(0).max(1).optional(),
    top_k: z.number().int().min(0).max(500).optional(),
  })
  .loose();

const paramSpecs: ParamSpec[] = [
  { key: 'temperature', label: 'Temperature', kind: 'number', min: 0, max: 1, step: 0.01, default: 1 },
  { key: 'top_p', label: 'Top P', kind: 'number', min: 0, max: 1, step: 0.01, default: 1 },
  { key: 'top_k', label: 'Top K', kind: 'integer', min: 0, max: 500, step: 1, default: 0 },
];

/**
 * Model nào TỪ CHỐI tham số lấy mẫu (trả 400, không phải bỏ qua im lặng).
 * Từ Opus 4.7 trở đi và cả dòng 5, temperature/top_p/top_k đã bị bỏ khỏi API.
 */
const REJECTS_SAMPLING = /(opus-4-[789]|opus-5|sonnet-5|fable-5|mythos-5)/i;

interface AnthropicEvent {
  type?: string;
  delta?: { type?: string; text?: string; stop_reason?: string };
  message?: { usage?: { input_tokens?: number; output_tokens?: number } };
  usage?: { output_tokens?: number };
  error?: { message?: string; type?: string };
}

export const anthropicProvider: LLMProvider = {
  id: 'anthropic',
  label: 'Anthropic',
  paramSchema,
  defaultParams: defaultsOf(paramSpecs),
  paramSpecs,

  unsupportedParams(model: string): string[] {
    return REJECTS_SAMPLING.test(model) ? [...PARAM_KEYS] : [];
  },

  warnings(_params: Record<string, unknown>, model: string): ParamWarning[] {
    return this.unsupportedParams(model).map((key) => ({
      key,
      level: 'warn' as const,
      message: `Model "${model}" đã bỏ tham số này; gửi lên sẽ bị trả 400. Engine tự loại bỏ.`,
    }));
  },

  sanitizeParams(params: Record<string, unknown>, model: string) {
    const next = { ...params };
    const removed: ParamWarning[] = [];
    for (const key of this.unsupportedParams(model)) {
      if (next[key] === undefined) continue;
      delete next[key];
      removed.push({
        key,
        level: 'warn',
        message: `Đã loại bỏ ${key}: model "${model}" không còn nhận tham số lấy mẫu.`,
      });
    }
    return { params: next, removed };
  },

  async listModels(cfg: ConnCfg, signal?: AbortSignal): Promise<ModelInfo[]> {
    const result = await loggedJson({
      profile: 'scan',
      providerId: 'anthropic',
      model: '(quét model)',
      request: {
        url: `${trimBaseUrl(cfg.baseUrl)}/v1/models`,
        method: 'GET',
        headers: {
          'x-api-key': cfg.password,
          'anthropic-version': ANTHROPIC_VERSION,
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        timeoutMs: cfg.timeoutMs,
        signal,
      },
    });

    const parsed = z
      .object({
        data: z.array(
          z
            .object({
              id: z.string(),
              display_name: z.string().optional(),
              max_input_tokens: z.number().optional(),
              max_tokens: z.number().optional(),
            })
            .loose(),
        ),
      })
      .safeParse(result.data);
    if (!parsed.success) {
      throw new LlmError('parse', { detail: 'GET /v1/models không có mảng data[].id' });
    }

    return parsed.data.data.map((model) => ({
      id: model.id,
      ...(model.display_name === undefined ? {} : { label: model.display_name }),
      ...(model.max_input_tokens === undefined ? {} : { contextWindow: model.max_input_tokens }),
      ...(model.max_tokens === undefined ? {} : { maxOutput: model.max_tokens }),
    }));
  },

  async stream(req: LLMRequest, cfg: ConnCfg, onChunk: (text: string) => void): Promise<LLMResponse> {
    const { params: cleaned } = this.sanitizeParams(cfg.params, cfg.model);

    const streaming = cfg.stream !== false;
    const body: Record<string, unknown> = {
      model: cfg.model,
      messages: req.messages,
      max_tokens: req.maxTokens,
      stream: streaming,
      ...pickParams(cleaned, PARAM_KEYS, this.unsupportedParams(cfg.model)),
    };
    // `system` là field riêng, KHÔNG nhét vào mảng messages.
    if (req.system.trim() !== '') body['system'] = req.system;
    if (req.stopSequences !== undefined && req.stopSequences.length > 0) {
      body['stop_sequences'] = req.stopSequences;
    }

    let text = '';
    let inTokens = 0;
    let outTokens = 0;
    let sawUsage = false;
    let stopReason: string | null = null;
    const rawEvents: unknown[] = [];

    const url = `${trimBaseUrl(cfg.baseUrl)}/v1/messages`;
    const headers = {
      'x-api-key': cfg.password,
      'anthropic-version': ANTHROPIC_VERSION,
      'anthropic-dangerous-direct-browser-access': 'true',
      'Content-Type': 'application/json',
    };

    // Không streaming: `content` là một mảng khối, gộp phần text lại.
    if (!streaming) {
      const result = await loggedJson({
        profile: profileOf(req.meta),
        providerId: 'anthropic',
        model: cfg.model,
        request: { url, method: 'POST', headers, body, timeoutMs: cfg.timeoutMs, signal: req.signal },
      });

      const payload = result.data as {
        content?: { type?: string; text?: string }[];
        usage?: { input_tokens?: number; output_tokens?: number };
        stop_reason?: string;
        error?: { message?: string };
      };
      if (payload?.error !== undefined) {
        throw new LlmError('server', { detail: payload.error.message ?? 'Anthropic trả về lỗi' });
      }
      if (payload?.stop_reason === 'refusal') {
        throw new LlmError('badrequest', {
          detail: 'Model từ chối yêu cầu (stop_reason: refusal). Đổi nội dung hoặc đổi model.',
        });
      }
      text = (payload?.content ?? [])
        .filter((piece) => piece.type === undefined || piece.type === 'text')
        .map((piece) => piece.text ?? '')
        .join('');
      if (text !== '') onChunk(text);
      const usage = payload?.usage;
      return {
        text,
        raw: result.data,
        ...(usage === undefined
          ? {}
          : { usage: { in: usage.input_tokens ?? 0, out: usage.output_tokens ?? 0 } }),
        ...(payload?.stop_reason === undefined ? {} : { meta: { stopReason: payload.stop_reason } }),
      };
    }

    await loggedSse(
      {
        profile: profileOf(req.meta),
        providerId: 'anthropic',
        model: cfg.model,
        request: { url, method: 'POST', headers, body, timeoutMs: cfg.timeoutMs, signal: req.signal },
      },
      (event) => {
        const payload = parseSseJson(event.data);
        if (payload === null) return;
        rawEvents.push(payload);

        const chunk = payload as AnthropicEvent;
        const type = chunk.type ?? event.event;

        if (type === 'error') {
          throw new LlmError('server', { detail: chunk.error?.message ?? 'lỗi trong luồng SSE' });
        }
        if (type === 'message_start') {
          const usage = chunk.message?.usage;
          if (usage !== undefined) {
            inTokens = usage.input_tokens ?? 0;
            outTokens = usage.output_tokens ?? 0;
            sawUsage = true;
          }
          return;
        }
        if (type === 'content_block_delta' && chunk.delta?.type === 'text_delta') {
          const delta = chunk.delta.text ?? '';
          if (delta !== '') {
            text += delta;
            onChunk(delta);
          }
          return;
        }
        if (type === 'message_delta') {
          if (chunk.usage?.output_tokens !== undefined) {
            outTokens = chunk.usage.output_tokens;
            sawUsage = true;
          }
          if (chunk.delta?.stop_reason !== undefined) stopReason = chunk.delta.stop_reason;
        }
      },
      () => (sawUsage ? { in: inTokens, out: outTokens } : null),
    );

    // Bộ lọc an toàn có thể từ chối; đó là kết quả hợp lệ chứ không phải lỗi mạng.
    if (stopReason === 'refusal') {
      throw new LlmError('badrequest', {
        detail: 'Model từ chối yêu cầu (stop_reason: refusal). Đổi nội dung hoặc đổi model.',
      });
    }

    return {
      text,
      raw: rawEvents,
      ...(sawUsage ? { usage: { in: inTokens, out: outTokens } } : {}),
      ...(stopReason === null ? {} : { meta: { stopReason } }),
    };
  },
};
