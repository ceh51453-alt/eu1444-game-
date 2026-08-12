/**
 * Hình dạng "giọng OpenAI": danh sách tham số, mô tả UI của chúng, và cách đọc
 * một phản hồi không streaming.
 *
 * Ở riêng một file vì HAI adapter dùng chung nó — `openai` và `custom` — và để
 * `custom.ts` nhập thẳng từ `openai.ts` là dựng một vòng import qua `provider.ts`
 * mà chỉ vỡ khi có ai đó nhập `providers/openai` TRƯỚC `provider` (bài test của
 * Phần 15 làm đúng thế). Lúc đó `openaiParamSpecs` còn nằm trong vùng chết và
 * `defaultParams` của provider `custom` thành `undefined.filter(...)`.
 *
 * File này chỉ nhập KIỂU từ `provider.ts`, nên nó không nằm trên vòng nào cả.
 */

import { LlmError } from '../errors';
import type { ParamSpec } from '../provider';

/**
 * Tham số gửi lên, kể cả những cái không có trong API gốc.
 *
 * `top_a`, `min_p`, `repetition_penalty`, `n`, `reasoning_effort`, `verbosity`
 * đều có mặt trong preset SillyTavern thật. Chúng là `optional` ở dưới nên chỉ
 * đi kèm request khi người chơi bật, và `pickParams` tự bỏ chúng đi khi chưa bật.
 *
 * `max_tokens` KHÔNG có ở đây: trần đầu ra là `ConnCfg.maxOutputTokens`, và
 * adapter đặt nó thẳng vào thân request sau khi trải danh sách này ra. Để nó
 * làm một thanh trượt nữa là dựng một cái nút không nối vào đâu cả.
 */
export const OPENAI_PARAM_KEYS = [
  'temperature',
  'top_p',
  'top_k',
  'top_a',
  'min_p',
  'repetition_penalty',
  'frequency_penalty',
  'presence_penalty',
  'seed',
  'n',
  'reasoning_effort',
  'verbosity',
  'stop',
] as const;

export const openaiParamSpecs: ParamSpec[] = [
  { key: 'temperature', label: 'Temperature', kind: 'number', min: 0, max: 2, step: 0.01, default: 1 },
  { key: 'top_p', label: 'Top P', kind: 'number', min: 0, max: 1, step: 0.01, default: 1 },
  { key: 'top_k', label: 'Top K', kind: 'integer', min: 0, max: 500, step: 1, default: 0, help: 'Nhiều proxy OpenAI bỏ qua tham số này.' },
  { key: 'frequency_penalty', label: 'Frequency penalty', kind: 'number', min: -2, max: 2, step: 0.01, default: 0 },
  { key: 'presence_penalty', label: 'Presence penalty', kind: 'number', min: -2, max: 2, step: 0.01, default: 0 },
  { key: 'seed', label: 'Seed', kind: 'integer', step: 1, default: 0, help: 'Chỉ một số nhà cung cấp hỗ trợ.' },
  { key: 'stop', label: 'Stop sequences', kind: 'stringList', default: [] },
  {
    key: 'top_a',
    label: 'Top A',
    kind: 'number',
    min: 0,
    max: 1,
    step: 0.01,
    default: 0,
    optional: true,
    help: 'Ngoài API gốc của OpenAI. Chỉ bật khi proxy của bạn hiểu nó.',
  },
  {
    key: 'min_p',
    label: 'Min P',
    kind: 'number',
    min: 0,
    max: 1,
    step: 0.01,
    default: 0,
    optional: true,
    help: 'Ngoài API gốc của OpenAI. Chỉ bật khi proxy của bạn hiểu nó.',
  },
  {
    key: 'repetition_penalty',
    label: 'Repetition penalty',
    kind: 'number',
    min: 0,
    max: 2,
    step: 0.01,
    default: 1,
    optional: true,
    help: 'Ngoài API gốc của OpenAI. Chỉ bật khi proxy của bạn hiểu nó.',
  },
  { key: 'n', label: 'Số câu trả lời (n)', kind: 'integer', min: 1, max: 8, step: 1, default: 1, optional: true },
  {
    key: 'reasoning_effort',
    label: 'Reasoning effort',
    kind: 'enum',
    options: ['minimal', 'low', 'medium', 'high', 'max'],
    default: 'medium',
    optional: true,
    help: 'Chỉ model có suy luận mới nhận.',
  },
  {
    key: 'verbosity',
    label: 'Verbosity',
    kind: 'enum',
    options: ['low', 'medium', 'high'],
    default: 'medium',
    optional: true,
  },
];

export interface OpenAiChunk {
  choices?: {
    delta?: { content?: string | null };
    message?: { content?: string | null };
    finish_reason?: string | null;
  }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number } | null;
  error?: { message?: string } | null;
}

/**
 * Đọc một phản hồi KHÔNG streaming của `/chat/completions`.
 *
 * Dùng chung cho cả hai adapter: khác biệt giữa chúng nằm ở URL và header,
 * không nằm ở hình dạng câu trả lời.
 */
export function readOpenAiJson(data: unknown): {
  text: string;
  usage: { in: number; out: number } | null;
} {
  const payload = data as OpenAiChunk;
  if (payload?.error != null) {
    throw new LlmError('server', { detail: payload.error.message ?? 'proxy trả về lỗi' });
  }
  const choice = payload?.choices?.[0];
  const text = choice?.message?.content ?? choice?.delta?.content ?? '';
  const usage = payload?.usage;
  return {
    text: typeof text === 'string' ? text : '',
    usage: usage == null ? null : { in: usage.prompt_tokens ?? 0, out: usage.completion_tokens ?? 0 },
  };
}
