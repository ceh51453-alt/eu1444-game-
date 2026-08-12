/**
 * OpenAI-compatible adapter (part 1 section 3.1).
 *
 * The broadest of the three: most community proxies speak this shape even when
 * the model behind them is something else entirely.
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
  type ParamWarning,
} from '../provider';
import {
  openaiParamSpecs,
  OPENAI_PARAM_KEYS,
  readOpenAiJson,
  type OpenAiChunk,
} from './openai-shape';
import {
  limitsOf,
  loggedJson,
  loggedSse,
  parseSseJson,
  pickParams,
  profileOf,
  trimBaseUrl,
} from './shared';

const paramSpecs = openaiParamSpecs;

const paramSchema = z
  .object({
    temperature: z.number().min(0).max(2).optional(),
    top_p: z.number().min(0).max(1).optional(),
    top_k: z.number().int().min(0).max(500).optional(),
    top_a: z.number().min(0).max(1).optional(),
    min_p: z.number().min(0).max(1).optional(),
    repetition_penalty: z.number().min(0).max(2).optional(),
    frequency_penalty: z.number().min(-2).max(2).optional(),
    presence_penalty: z.number().min(-2).max(2).optional(),
    max_tokens: z.number().int().min(1).max(2000000).optional(),
    seed: z.number().int().optional(),
    n: z.number().int().min(1).max(8).optional(),
    reasoning_effort: z.enum(['minimal', 'low', 'medium', 'high', 'max']).optional(),
    verbosity: z.enum(['low', 'medium', 'high']).optional(),
    stop: z.array(z.string()).max(4).optional(),
  })
  .loose();

export const openaiProvider: LLMProvider = {
  id: 'openai',
  label: 'OpenAI-compatible',
  paramSchema,
  defaultParams: defaultsOf(paramSpecs),
  paramSpecs,

  unsupportedParams: () => [],

  warnings: (params) => {
    const out: ParamWarning[] = [];
    const stop = params['stop'];
    if (Array.isArray(stop) && stop.length > 4) {
      out.push({ key: 'stop', level: 'warn', message: 'Phần lớn API chỉ nhận tối đa 4 chuỗi dừng.' });
    }
    return out;
  },

  sanitizeParams: (params) => ({ params: { ...params }, removed: [] }),

  async listModels(cfg: ConnCfg, signal?: AbortSignal): Promise<ModelInfo[]> {
    const result = await loggedJson({
      profile: 'scan',
      providerId: 'openai',
      model: '(quét model)',
      request: {
        url: `${trimBaseUrl(cfg.baseUrl)}/models`,
        method: 'GET',
        headers: { Authorization: `Bearer ${cfg.password}` },
        timeoutMs: cfg.timeoutMs,
        signal,
      },
    });

    const parsed = z
      .object({ data: z.array(z.object({ id: z.string() }).loose()) })
      .safeParse(result.data);
    if (!parsed.success) {
      throw new LlmError('parse', { detail: 'GET /models không có mảng data[].id' });
    }
    return parsed.data.data.map((model) => {
      const entry = model as Record<string, unknown>;
      const name = entry['name'];
      return {
        id: model.id,
        ...(typeof name === 'string' && name !== '' ? { label: name } : {}),
        ...limitsOf(entry),
      };
    });
  },

  async stream(req: LLMRequest, cfg: ConnCfg, onChunk: (text: string) => void): Promise<LLMResponse> {
    const messages: { role: string; content: string }[] = [];
    if (req.system.trim() !== '') messages.push({ role: 'system', content: req.system });
    messages.push(...req.messages);

    const streaming = cfg.stream !== false;
    const body: Record<string, unknown> = {
      model: cfg.model,
      messages,
      stream: streaming,
      ...pickParams(cfg.params, OPENAI_PARAM_KEYS, this.unsupportedParams(cfg.model)),
      max_tokens: req.maxTokens,
    };
    if (req.stopSequences !== undefined && req.stopSequences.length > 0) {
      body['stop'] = req.stopSequences;
    }

    const url = `${trimBaseUrl(cfg.baseUrl)}/chat/completions`;
    const headers = { Authorization: `Bearer ${cfg.password}`, 'Content-Type': 'application/json' };

    // Không streaming: một request JSON, `onChunk` gọi đúng một lần với cả đoạn.
    if (!streaming) {
      const result = await loggedJson({
        profile: profileOf(req.meta),
        providerId: 'openai',
        model: cfg.model,
        request: { url, method: 'POST', headers, body, timeoutMs: cfg.timeoutMs, signal: req.signal },
      });
      const once = readOpenAiJson(result.data);
      if (once.text !== '') onChunk(once.text);
      return { text: once.text, raw: result.data, ...(once.usage === null ? {} : { usage: once.usage }) };
    }

    let text = '';
    let usage: { in: number; out: number } | null = null;
    const rawEvents: unknown[] = [];

    await loggedSse(
      {
        profile: profileOf(req.meta),
        providerId: 'openai',
        model: cfg.model,
        request: { url, method: 'POST', headers, body, timeoutMs: cfg.timeoutMs, signal: req.signal },
      },
      (event) => {
        const payload = parseSseJson(event.data);
        if (payload === null) return;
        rawEvents.push(payload);

        const chunk = payload as OpenAiChunk;
        if (chunk.error != null) {
          throw new LlmError('server', { detail: chunk.error.message ?? 'lỗi trong luồng SSE' });
        }
        const delta = chunk.choices?.[0]?.delta?.content;
        if (typeof delta === 'string' && delta !== '') {
          text += delta;
          onChunk(delta);
        }
        // Some proxies volunteer usage on the final chunk; we do not request it,
        // because `stream_options` makes stricter proxies answer 400.
        if (chunk.usage != null) {
          usage = { in: chunk.usage.prompt_tokens ?? 0, out: chunk.usage.completion_tokens ?? 0 };
        }
      },
      () => usage,
    );

    return { text, raw: rawEvents, ...(usage === null ? {} : { usage }) };
  },
};
