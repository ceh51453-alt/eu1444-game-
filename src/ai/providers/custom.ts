/**
 * Provider "Tùy chỉnh" — dán URL proxy với mật khẩu vào là chạy.
 *
 * Ba adapter kia đều đoán CỨNG hình dạng của proxy: `/chat/completions` với
 * `Authorization: Bearer`, `/v1beta/models/…` với `x-goog-api-key`, `/v1/messages`
 * với `x-api-key`. Một proxy cộng đồng nói giọng OpenAI nhưng đặt endpoint ở
 * `/v1/chat/completions` hay `/api/v1/chat/completions`, hoặc đòi header
 * `x-api-key`, thì không cái nào trong ba cái đó gọi được — và người chơi chỉ
 * thấy một lỗi 404 hoặc 401 không giải thích được.
 *
 * Ở đây KHÔNG bắt khai gì cả. Adapter tự thử lần lượt những chỗ thường gặp,
 * và chỗ nào trả lời thì nó nhớ lấy. Mấy ô trong phần "Nâng cao" của UI chỉ để
 * ép tay khi proxy nằm ở một chỗ mà danh sách dưới đây không đoán ra.
 */

import { z } from 'zod';
import { LlmError } from '../errors';
import {
  DEFAULT_CUSTOM_TRANSPORT,
  defaultsOf,
  type ConnCfg,
  type CustomTransport,
  type LLMProvider,
  type LLMRequest,
  type LLMResponse,
  type ModelInfo,
  type ParamWarning,
} from '../provider';
import { OPENAI_PARAM_KEYS, openaiParamSpecs, readOpenAiJson } from './openai-shape';
import {
  limitsOf,
  loggedJson,
  loggedSse,
  parseSseJson,
  pickParams,
  profileOf,
  trimBaseUrl,
} from './shared';

const paramSchema = z.object({}).loose();

const paramSpecs = openaiParamSpecs;

/**
 * Chỗ đặt endpoint chat, theo thứ tự hay gặp.
 *
 * `''` đứng đầu nghĩa là "base URL ĐÃ trỏ thẳng vào endpoint" — có proxy cho
 * dán nguyên đường dẫn đầy đủ, và thử nó trước thì một URL như thế chạy ngay.
 */
export const CHAT_PATH_CANDIDATES = [
  '/chat/completions',
  '/v1/chat/completions',
  '/api/v1/chat/completions',
  '/openai/v1/chat/completions',
  '',
] as const;

export const MODELS_PATH_CANDIDATES = [
  '/models',
  '/v1/models',
  '/api/v1/models',
  '/openai/v1/models',
] as const;

/** Cách gắn mật khẩu vào request, theo thứ tự hay gặp. */
export const AUTH_CANDIDATES: readonly { header: string; prefix: string }[] = [
  { header: 'Authorization', prefix: 'Bearer ' },
  { header: 'x-api-key', prefix: '' },
  { header: 'api-key', prefix: '' },
];

export function transportOf(cfg: ConnCfg): CustomTransport {
  return { ...DEFAULT_CUSTOM_TRANSPORT, ...cfg.custom };
}

/** Ghép baseUrl với một đường dẫn, tha thứ cho dấu `/` thừa. */
export function joinPath(baseUrl: string, path: string): string {
  const trimmed = path.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  const base = trimBaseUrl(baseUrl);
  if (trimmed === '') return base;
  return `${base}/${trimmed.replace(/^\/+/, '')}`;
}

/**
 * Đọc một ô JSON của người dùng.
 * Rỗng = không có gì. Hỏng = ném lỗi có nói rõ ô nào, không phải nuốt đi.
 */
export function parseJsonField(text: string, label: string): Record<string, unknown> {
  const trimmed = text.trim();
  if (trimmed === '') return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (cause) {
    throw new LlmError('badrequest', {
      detail: `Ô "${label}" không phải JSON hợp lệ: ${String(cause)}`,
      cause,
    });
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new LlmError('badrequest', { detail: `Ô "${label}" phải là một object JSON.` });
  }
  return parsed as Record<string, unknown>;
}

function headersFor(
  cfg: ConnCfg,
  transport: CustomTransport,
  auth: { header: string; prefix: string },
): Record<string, string> {
  const extra = parseJsonField(transport.extraHeaders, 'Header thêm');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (auth.header !== '' && cfg.password !== '') {
    headers[auth.header] = `${auth.prefix}${cfg.password}`;
  }
  for (const [key, value] of Object.entries(extra)) headers[key] = String(value);
  return headers;
}

/** Cách xác thực sẽ thử, theo thứ tự. Khai tay thì chỉ đúng một cách. */
function authPlan(transport: CustomTransport): readonly { header: string; prefix: string }[] {
  if (transport.authHeader.trim() !== '') {
    return [{ header: transport.authHeader.trim(), prefix: transport.authPrefix }];
  }
  return AUTH_CANDIDATES;
}

/** Đường dẫn sẽ thử, theo thứ tự. Khai tay thì chỉ đúng một đường. */
function pathPlan(declared: string, candidates: readonly string[]): readonly string[] {
  const trimmed = declared.trim();
  return trimmed === '' ? candidates : [trimmed];
}

/**
 * Lỗi nào đáng thử tiếp, lỗi nào là câu trả lời cuối cùng.
 *
 * 404/405 = sai đường dẫn, 401/403 = sai cách xác thực — cả hai đều còn cửa.
 * Timeout, mất mạng, 500 hay 429 thì thử chỗ khác cũng vô ích và chỉ làm người
 * chơi chờ thêm vài lượt timeout nữa.
 */
function worthAnotherTry(error: unknown): boolean {
  if (!(error instanceof LlmError)) return false;
  return error.status === 404 || error.status === 405 || error.status === 401 || error.status === 403;
}

export interface ProbeResult {
  /** Đường dẫn và cách xác thực đã hoạt động. */
  transport: CustomTransport;
  models: ModelInfo[];
  /** Kể lại đã thử gì, để người chơi thấy vì sao nó chọn đường này. */
  log: string[];
}

function readModelList(data: unknown): ModelInfo[] {
  // Chấp nhận `{data:[…]}` kiểu OpenAI, `{models:[…]}`, và cả mảng trần —
  // proxy tự viết hay trả về đúng một danh sách tên model.
  const rows = Array.isArray(data)
    ? data
    : ((data as { data?: unknown })?.data ?? (data as { models?: unknown })?.models);
  if (!Array.isArray(rows)) return [];

  const out: ModelInfo[] = [];
  for (const row of rows) {
    if (typeof row === 'string') {
      out.push({ id: row });
      continue;
    }
    if (typeof row !== 'object' || row === null) continue;
    const entry = row as Record<string, unknown>;
    const rawId = entry['id'] ?? entry['name'] ?? entry['model'];
    if (typeof rawId !== 'string' || rawId === '') continue;
    // Gemini qua proxy trả `models/gemini-…`; giữ nguyên tên đó là gửi lên một
    // model id không tồn tại.
    const id = rawId.replace(/^models\//, '');
    const label = entry['display_name'] ?? entry['displayName'] ?? entry['name'];
    out.push({
      id,
      ...(typeof label === 'string' && label !== '' && label !== id ? { label } : {}),
      ...limitsOf(entry),
    });
  }
  return out;
}

/**
 * Dò xem proxy này nằm ở đâu và nhận mật khẩu kiểu gì.
 *
 * Chạy khi bấm "Quét model". Kết quả được ghi lại vào hồ sơ, nên mọi lần gọi
 * sau đi thẳng — không ai phải trả tiền cho việc dò hai lần.
 */
export async function probeCustomTransport(
  cfg: ConnCfg,
  signal?: AbortSignal,
): Promise<ProbeResult> {
  const transport = transportOf(cfg);
  const log: string[] = [];
  let last: unknown = null;

  for (const path of pathPlan(transport.modelsPath, MODELS_PATH_CANDIDATES)) {
    for (const auth of authPlan(transport)) {
      const url = joinPath(cfg.baseUrl, path);
      try {
        const result = await loggedJson({
          profile: 'scan',
          providerId: 'custom',
          model: '(dò endpoint)',
          request: {
            url,
            method: 'GET',
            headers: headersFor(cfg, transport, auth),
            timeoutMs: cfg.timeoutMs,
            signal,
          },
        });
        const models = readModelList(result.data);
        if (models.length === 0) {
          log.push(`${url} (${auth.header}): trả lời nhưng không có model nào.`);
          continue;
        }
        log.push(`✓ ${url} với header ${auth.header} — ${models.length} model.`);
        return {
          transport: { ...transport, modelsPath: path, authHeader: auth.header, authPrefix: auth.prefix },
          models,
          log,
        };
      } catch (error) {
        last = error;
        const status = error instanceof LlmError ? (error.status ?? '—') : '—';
        log.push(`✗ ${url} (${auth.header}): HTTP ${status}`);
        if (!worthAnotherTry(error)) throw error;
      }
    }
  }

  throw last instanceof LlmError
    ? new LlmError(last.kind, {
        ...(last.status === undefined ? {} : { status: last.status }),
        detail: `Không dò ra endpoint model.\n${log.join('\n')}`,
      })
    : new LlmError('parse', { detail: `Không dò ra endpoint model.\n${log.join('\n')}` });
}

interface CustomChunk {
  choices?: { delta?: { content?: string | null } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number } | null;
  error?: { message?: string } | null;
}

export const customProvider: LLMProvider = {
  id: 'custom',
  label: 'Tùy chỉnh (proxy bất kỳ)',
  paramSchema,
  defaultParams: defaultsOf(paramSpecs),
  paramSpecs,

  unsupportedParams: () => [],

  warnings(_params: Record<string, unknown>, _model: string): ParamWarning[] {
    return [
      {
        key: 'custom',
        level: 'info',
        message:
          'Thân request nói giọng OpenAI. Đường dẫn và header thì engine tự dò — chỉ mở phần "Nâng cao" khi nó dò không ra.',
      },
    ];
  },

  sanitizeParams: (params) => ({ params: { ...params }, removed: [] }),

  async listModels(cfg: ConnCfg, signal?: AbortSignal): Promise<ModelInfo[]> {
    return (await probeCustomTransport(cfg, signal)).models;
  },

  async stream(req: LLMRequest, cfg: ConnCfg, onChunk: (text: string) => void): Promise<LLMResponse> {
    const transport = transportOf(cfg);
    const messages: { role: string; content: string }[] = [];
    if (req.system.trim() !== '') messages.push({ role: 'system', content: req.system });
    messages.push(...req.messages);

    const streaming = cfg.stream !== false;
    const body: Record<string, unknown> = {
      model: cfg.model,
      messages,
      stream: streaming,
      ...pickParams(cfg.params, OPENAI_PARAM_KEYS, []),
      max_tokens: req.maxTokens,
      // Trường của người dùng đi SAU cùng: họ ghi đè được mọi thứ ở trên, kể cả
      // `model` và `stream`. Đó là lý do provider này tồn tại.
      ...parseJsonField(transport.extraBody, 'Thân thêm'),
    };
    if (req.stopSequences !== undefined && req.stopSequences.length > 0) {
      body['stop'] = req.stopSequences;
    }

    /*
      Cùng cách dò như lúc quét model, và cùng lý do: người chơi có thể chưa
      bấm "Quét model" bao giờ — họ gõ tay tên model rồi gửi thẳng một lượt.
      Chuỗi thử dừng ngay ở lỗi đầu tiên KHÔNG phải 404/401, nên một proxy hỏng
      thật vẫn báo lỗi sau đúng một lần gọi.
    */
    const paths = pathPlan(transport.chatPath, CHAT_PATH_CANDIDATES);
    const auths = authPlan(transport);
    const attempts: string[] = [];
    let last: unknown = null;

    for (const path of paths) {
      for (const auth of auths) {
        const url = joinPath(cfg.baseUrl, path);
        const headers = headersFor(cfg, transport, auth);
        try {
          if (!streaming) {
            const result = await loggedJson({
              profile: profileOf(req.meta),
              providerId: 'custom',
              model: cfg.model,
              request: { url, method: 'POST', headers, body, timeoutMs: cfg.timeoutMs, signal: req.signal },
            });
            const once = readOpenAiJson(result.data);
            if (once.text !== '') onChunk(once.text);
            return {
              text: once.text,
              raw: result.data,
              ...(once.usage === null ? {} : { usage: once.usage }),
            };
          }

          let text = '';
          let usage: { in: number; out: number } | null = null;
          const rawEvents: unknown[] = [];

          await loggedSse(
            {
              profile: profileOf(req.meta),
              providerId: 'custom',
              model: cfg.model,
              request: { url, method: 'POST', headers, body, timeoutMs: cfg.timeoutMs, signal: req.signal },
            },
            (event) => {
              const payload = parseSseJson(event.data);
              if (payload === null) return;
              rawEvents.push(payload);

              const chunk = payload as CustomChunk;
              if (chunk.error != null) {
                throw new LlmError('server', { detail: chunk.error.message ?? 'lỗi trong luồng SSE' });
              }
              const delta = chunk.choices?.[0]?.delta?.content;
              if (typeof delta === 'string' && delta !== '') {
                text += delta;
                onChunk(delta);
              }
              if (chunk.usage != null) {
                usage = { in: chunk.usage.prompt_tokens ?? 0, out: chunk.usage.completion_tokens ?? 0 };
              }
            },
            () => usage,
          );

          return { text, raw: rawEvents, ...(usage === null ? {} : { usage }) };
        } catch (error) {
          last = error;
          const status = error instanceof LlmError ? (error.status ?? '—') : '—';
          attempts.push(`✗ ${url} (${auth.header}): HTTP ${status}`);
          if (!worthAnotherTry(error)) throw error;
        }
      }
    }

    const detail = `Không tìm thấy endpoint chat trên proxy này.\n${attempts.join('\n')}`;
    throw last instanceof LlmError
      ? new LlmError(last.kind, {
          ...(last.status === undefined ? {} : { status: last.status }),
          detail,
        })
      : new LlmError('unknown', { detail });
  },
};
