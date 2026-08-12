/**
 * Gemini native adapter (part 1 section 3.2).
 *
 * Carries the three constraints the spec calls out by name:
 *  (a) `thinkingBudget` alongside `thinkingLevel` → 400. Stripped on import
 *      and on every send, with a warning surfaced to the UI.
 *  (b) `temperature` below 1.0 → a yellow warning under the slider.
 *  (c) `thoughtSignature` must be stored and echoed back verbatim next turn,
 *      or every later turn 400s.
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

/**
 * `maxOutputTokens` KHÔNG nằm ở đây: trần đầu ra là `ConnCfg.maxOutputTokens`
 * và adapter đặt nó thẳng vào `generationConfig` sau khi trải danh sách này ra.
 */
const GENERATION_KEYS = ['temperature', 'topP', 'topK'] as const;

const paramSchema = z
  .object({
    temperature: z.number().min(0).max(2).optional(),
    topP: z.number().min(0).max(1).optional(),
    topK: z.number().int().min(1).max(1000).optional(),
    maxOutputTokens: z.number().int().min(1).max(2000000).optional(),
    thinkingLevel: z.enum(['OFF', 'LOW', 'MEDIUM', 'HIGH']).optional(),
    thinkingBudget: z.number().int().min(0).optional(),
  })
  .loose();

const paramSpecs: ParamSpec[] = [
  {
    key: 'temperature',
    label: 'Temperature',
    kind: 'number',
    min: 0,
    max: 2,
    step: 0.01,
    default: 1,
    help: 'Mặc định 1.0 và nên giữ nguyên.',
  },
  { key: 'topP', label: 'Top P', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.95 },
  { key: 'topK', label: 'Top K', kind: 'integer', min: 1, max: 1000, step: 1, default: 64 },
  {
    key: 'thinkingLevel',
    label: 'Thinking level',
    kind: 'enum',
    options: ['OFF', 'LOW', 'MEDIUM', 'HIGH'],
    default: 'HIGH',
  },
  {
    key: 'thinkingBudget',
    label: 'Thinking budget (cũ)',
    kind: 'integer',
    min: 0,
    step: 128,
    default: 0,
    help: 'Kiểu cũ. Gửi cùng thinkingLevel là API trả 400 — engine sẽ tự loại bỏ.',
  },
];

/**
 * Bảng model bỏ qua tham số nào.
 *
 * Các model Flash đời mới lặng lẽ bỏ qua temperature/topK/topP — slider vẫn kéo
 * được nhưng không có tác dụng gì, nên UI phải làm mờ chúng thay vì để người
 * chơi tưởng mình đang chỉnh được (Phần 1 mục 3.2).
 *
 * Đây là bảng heuristic: khi quét được model thật từ proxy, đối chiếu lại.
 */
const IGNORED_BY_MODEL: ReadonlyArray<{ pattern: RegExp; ignores: string[] }> = [
  { pattern: /flash-lite/i, ignores: ['temperature', 'topP', 'topK'] },
  { pattern: /gemini-[3-9][^a-z]*flash/i, ignores: ['temperature', 'topP', 'topK'] },
];

interface GeminiPart {
  text?: string;
  thought?: boolean;
  thoughtSignature?: string;
}

interface GeminiChunk {
  candidates?: { content?: { parts?: GeminiPart[]; role?: string }; finishReason?: string }[];
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  error?: { message?: string; code?: number };
}

export const geminiProvider: LLMProvider = {
  id: 'gemini',
  label: 'Gemini native',
  paramSchema,
  defaultParams: defaultsOf(paramSpecs),
  paramSpecs,

  unsupportedParams(model: string): string[] {
    const ignored = new Set<string>();
    for (const rule of IGNORED_BY_MODEL) {
      if (rule.pattern.test(model)) for (const key of rule.ignores) ignored.add(key);
    }
    return [...ignored];
  },

  warnings(params: Record<string, unknown>, model: string): ParamWarning[] {
    const out: ParamWarning[] = [];

    // (b) — chữ này đúng theo Phần 1 mục 3.2b.
    const temperature = params['temperature'];
    if (typeof temperature === 'number' && temperature < 1) {
      out.push({
        key: 'temperature',
        level: 'warn',
        message: 'Dòng Gemini 3 khuyến nghị giữ 1.0; hạ thấp làm giảm chất lượng suy luận.',
      });
    }

    for (const key of this.unsupportedParams(model)) {
      out.push({ key, level: 'info', message: `Model "${model}" bỏ qua tham số này.` });
    }
    return out;
  },

  // (a) — thinkingBudget đi cùng thinkingLevel là 400 ngay lập tức.
  sanitizeParams(params: Record<string, unknown>) {
    const next = { ...params };
    const removed: ParamWarning[] = [];

    const hasLevel = typeof next['thinkingLevel'] === 'string' && next['thinkingLevel'] !== '';
    const budget = next['thinkingBudget'];
    const hasBudget = typeof budget === 'number' && budget > 0;

    if (hasLevel && hasBudget) {
      delete next['thinkingBudget'];
      removed.push({
        key: 'thinkingBudget',
        level: 'warn',
        message: 'Đã loại bỏ thinkingBudget: gửi cùng thinkingLevel sẽ bị API trả 400.',
      });
    }
    return { params: next, removed };
  },

  async listModels(cfg: ConnCfg, signal?: AbortSignal): Promise<ModelInfo[]> {
    const result = await loggedJson({
      profile: 'scan',
      providerId: 'gemini',
      model: '(quét model)',
      request: {
        url: `${trimBaseUrl(cfg.baseUrl)}/v1beta/models`,
        method: 'GET',
        headers: { 'x-goog-api-key': cfg.password },
        timeoutMs: cfg.timeoutMs,
        signal,
      },
    });

    const parsed = z
      .object({
        models: z.array(
          z
            .object({
              name: z.string(),
              displayName: z.string().optional(),
              inputTokenLimit: z.number().optional(),
              outputTokenLimit: z.number().optional(),
              supportedGenerationMethods: z.array(z.string()).optional(),
            })
            .loose(),
        ),
      })
      .safeParse(result.data);
    if (!parsed.success) {
      throw new LlmError('parse', { detail: 'GET /v1beta/models không có mảng models[].name' });
    }

    return parsed.data.models
      .filter(
        (model) =>
          model.supportedGenerationMethods === undefined ||
          model.supportedGenerationMethods.some((method) => method.includes('generateContent')),
      )
      .map((model) => ({
        id: model.name.replace(/^models\//, ''),
        ...(model.displayName === undefined ? {} : { label: model.displayName }),
        ...(model.inputTokenLimit === undefined ? {} : { contextWindow: model.inputTokenLimit }),
        ...(model.outputTokenLimit === undefined ? {} : { maxOutput: model.outputTokenLimit }),
      }));
  },

  async stream(req: LLMRequest, cfg: ConnCfg, onChunk: (text: string) => void): Promise<LLMResponse> {
    const { params: cleaned } = this.sanitizeParams(cfg.params, cfg.model);
    const generationConfig: Record<string, unknown> = {
      ...pickParams(cleaned, GENERATION_KEYS, this.unsupportedParams(cfg.model)),
      maxOutputTokens: req.maxTokens,
    };
    if (typeof cleaned['thinkingLevel'] === 'string') {
      generationConfig['thinkingConfig'] = { thinkingLevel: cleaned['thinkingLevel'] };
    } else if (typeof cleaned['thinkingBudget'] === 'number' && cleaned['thinkingBudget'] > 0) {
      generationConfig['thinkingConfig'] = { thinkingBudget: cleaned['thinkingBudget'] };
    }
    if (req.stopSequences !== undefined && req.stopSequences.length > 0) {
      generationConfig['stopSequences'] = req.stopSequences;
    }

    const contents = req.messages.map((message) => ({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: message.content } as GeminiPart],
    }));

    // (c) — echo the stored signature onto the most recent model turn. Without
    // this the next request 400s, and the failure looks unrelated.
    const carried = req.meta?.['thoughtSignature'];
    if (typeof carried === 'string' && carried !== '') {
      for (let index = contents.length - 1; index >= 0; index--) {
        const turn = contents[index];
        if (turn?.role !== 'model') continue;
        const part = turn.parts[0];
        if (part !== undefined) part.thoughtSignature = carried;
        break;
      }
    }

    const body: Record<string, unknown> = { contents, generationConfig };
    if (req.system.trim() !== '') {
      body['systemInstruction'] = { parts: [{ text: req.system }] };
    }

    let text = '';
    let usage: { in: number; out: number } | null = null;
    let thoughtSignature: string | null = null;
    const rawEvents: unknown[] = [];

    const model = encodeURIComponent(cfg.model);
    const base = trimBaseUrl(cfg.baseUrl);
    const headers = { 'x-goog-api-key': cfg.password, 'Content-Type': 'application/json' };

    // Không streaming: `:generateContent`, một câu trả lời trọn vẹn.
    if (cfg.stream === false) {
      const result = await loggedJson({
        profile: profileOf(req.meta),
        providerId: 'gemini',
        model: cfg.model,
        request: {
          url: `${base}/v1beta/models/${model}:generateContent`,
          method: 'POST',
          headers,
          body,
          timeoutMs: cfg.timeoutMs,
          signal: req.signal,
        },
      });

      const payload = result.data as GeminiChunk;
      if (payload?.error !== undefined) {
        throw new LlmError('server', { detail: payload.error.message ?? 'Gemini trả về lỗi' });
      }
      for (const part of payload?.candidates?.[0]?.content?.parts ?? []) {
        if (typeof part.thoughtSignature === 'string' && part.thoughtSignature !== '') {
          thoughtSignature = part.thoughtSignature;
        }
        if (part.thought === true) continue;
        if (typeof part.text === 'string' && part.text !== '') text += part.text;
      }
      if (text !== '') onChunk(text);
      if (payload?.usageMetadata !== undefined) {
        usage = {
          in: payload.usageMetadata.promptTokenCount ?? 0,
          out: payload.usageMetadata.candidatesTokenCount ?? 0,
        };
      }
      return {
        text,
        raw: result.data,
        ...(usage === null ? {} : { usage }),
        ...(thoughtSignature === null ? {} : { meta: { thoughtSignature } }),
      };
    }

    await loggedSse(
      {
        profile: profileOf(req.meta),
        providerId: 'gemini',
        model: cfg.model,
        request: {
          url: `${base}/v1beta/models/${model}:streamGenerateContent?alt=sse`,
          method: 'POST',
          headers,
          body,
          timeoutMs: cfg.timeoutMs,
          signal: req.signal,
        },
      },
      (event) => {
        const payload = parseSseJson(event.data);
        if (payload === null) return;
        rawEvents.push(payload);

        const chunk = payload as GeminiChunk;
        if (chunk.error !== undefined) {
          throw new LlmError('server', { detail: chunk.error.message ?? 'lỗi trong luồng SSE' });
        }

        for (const part of chunk.candidates?.[0]?.content?.parts ?? []) {
          if (typeof part.thoughtSignature === 'string' && part.thoughtSignature !== '') {
            thoughtSignature = part.thoughtSignature;
          }
          // `thought: true` parts are the model's own reasoning, not narrative.
          if (part.thought === true) continue;
          if (typeof part.text === 'string' && part.text !== '') {
            text += part.text;
            onChunk(part.text);
          }
        }

        if (chunk.usageMetadata !== undefined) {
          usage = {
            in: chunk.usageMetadata.promptTokenCount ?? 0,
            out: chunk.usageMetadata.candidatesTokenCount ?? 0,
          };
        }
      },
      () => usage,
    );

    return {
      text,
      raw: rawEvents,
      ...(usage === null ? {} : { usage }),
      ...(thoughtSignature === null ? {} : { meta: { thoughtSignature } }),
    };
  },

  /**
   * Đếm token thật (part 3 section 9). Gemini là nhà cung cấp duy nhất trong
   * ba cái ở đây có endpoint đếm riêng, nên ngân sách token của Phần 3 chỉ
   * chính xác tuyệt đối khi đang chạy Gemini; hai cái còn lại dùng ước lượng.
   */
  async countTokens(text: string, cfg: ConnCfg, signal?: AbortSignal): Promise<number> {
    const model = encodeURIComponent(cfg.model);
    const result = await loggedJson({
      profile: 'đếm token',
      providerId: 'gemini',
      model: cfg.model,
      request: {
        url: `${trimBaseUrl(cfg.baseUrl)}/v1beta/models/${model}:countTokens`,
        method: 'POST',
        headers: { 'x-goog-api-key': cfg.password, 'Content-Type': 'application/json' },
        body: { contents: [{ role: 'user', parts: [{ text }] }] },
        timeoutMs: cfg.timeoutMs,
        signal,
      },
    });

    const parsed = z.object({ totalTokens: z.number() }).safeParse(result.data);
    if (!parsed.success) {
      throw new LlmError('parse', { detail: ':countTokens không trả về totalTokens' });
    }
    return parsed.data.totalTokens;
  },
};
