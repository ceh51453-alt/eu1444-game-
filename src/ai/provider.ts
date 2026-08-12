/**
 * The ONE interface the rest of the game is allowed to know (part 1 section 2).
 *
 * Nothing outside `/src/ai/` may branch on which provider is active. If a
 * caller needs to know, that is a signal the difference belongs in an adapter.
 *
 * The password the user types IS the proxy password. It is never logged, never
 * written into a save, and never included in an export bundle.
 */

import type { z } from 'zod';
import type { LlmError } from './errors';
import { openaiProvider } from './providers/openai';
import { geminiProvider } from './providers/gemini';
import { anthropicProvider } from './providers/anthropic';
import { customProvider } from './providers/custom';

export type ProviderId = 'openai' | 'gemini' | 'anthropic' | 'custom';

/**
 * Which connection profile a call belongs to (part 1 section 5).
 *
 * `variables` là hồ sơ thứ ba: nó chỉ chạy vòng sửa/cập nhật biến của Phần 2,
 * một việc ngắn và máy móc, nên gần như luôn nên trỏ vào một model rẻ hơn model
 * viết truyện. Bỏ trống thì engine dùng lại `main` — xem `configuredProfile`.
 */
export type ProfileId = 'main' | 'worldtick' | 'variables';

export const PROFILE_IDS: readonly ProfileId[] = ['main', 'worldtick', 'variables'];

export const PROFILE_LABELS: Record<ProfileId, string> = {
  main: 'Kết nối chính',
  worldtick: 'Mô phỏng ngầm',
  variables: 'Cập nhật biến',
};

export interface ConnCfg {
  providerId: ProviderId;
  baseUrl: string;
  /** Mật khẩu proxy — gửi kèm mỗi request. KHÔNG BAO GIỜ ghi log hay xuất ra file. */
  password: string;
  model: string;
  params: Record<string, unknown>;
  timeoutMs: number;
  /**
   * Chế độ streaming (`stream_openai` của preset SillyTavern).
   *
   * TẮT thì adapter gửi một request JSON thường và trả về nguyên đoạn một lượt —
   * `onChunk` được gọi đúng một lần với toàn bộ văn bản. Có proxy chặn hẳn SSE,
   * và với chúng thì đây là khác biệt giữa "chạy được" và "không chạy được".
   *
   * Không bắt buộc: cấu hình cũ đọc từ đĩa lên chưa có trường này, và mặc định
   * của cả ba adapter là bật.
   */
  stream?: boolean;
  /**
   * CỬA SỔ NGỮ CẢNH — trần token ĐẦU VÀO. Ngân sách prompt được cắt theo đây.
   *
   * Tách hẳn khỏi `maxOutputTokens` vì hai con số này gần như không bao giờ bằng
   * nhau: một model có thể nhận 2.000.000 token vào mà chỉ sinh ra được 65.000.
   * Gộp chúng làm một là hoặc gửi `max_tokens: 2000000` và ăn 400 ở mọi lượt,
   * hoặc cắt prompt xuống còn 65k và mất ba phần tư ngữ cảnh.
   */
  maxInputTokens?: number;
  /** TRẦN ĐẦU RA — số token model được phép SINH RA trong một lượt. */
  maxOutputTokens?: number;
  /**
   * Cấu hình riêng của provider `custom` (đường dẫn, header, thân bổ sung).
   * Ba provider dựng sẵn bỏ qua trường này.
   *
   * KHÔNG bắt buộc điền: mặc định để trống và adapter tự dò đường dẫn thường
   * gặp. Chỉ đụng tới khi proxy nằm ở một chỗ lạ.
   */
  custom?: CustomTransport;
}

/** Cửa sổ ngữ cảnh mặc định — nhắm vào model đời mới, không nhắm vào bản 8k. */
export const DEFAULT_MAX_INPUT_TOKENS = 131072;
/** Trần đầu ra mặc định. */
export const DEFAULT_MAX_OUTPUT_TOKENS = 8192;

/**
 * Provider `custom`: người chơi tự khai đường dẫn và header.
 *
 * Vẫn nói giọng OpenAI ở phần thân — đó là thứ gần như mọi proxy cộng đồng nói
 * được. Cái hay thay đổi giữa các proxy là ĐƯỜNG DẪN và CÁCH XÁC THỰC, nên đúng
 * ba thứ đó là thứ mở ra cho sửa.
 */
export interface CustomTransport {
  /** Ghép sau baseUrl. RỖNG = tự dò (xem `CHAT_PATH_CANDIDATES`). */
  chatPath: string;
  /** RỖNG = tự dò. */
  modelsPath: string;
  /** Tên header mang mật khẩu. RỖNG = tự dò `Authorization` rồi `x-api-key`. */
  authHeader: string;
  /** Tiền tố trước mật khẩu, ví dụ `Bearer `. Để rỗng nếu proxy không cần. */
  authPrefix: string;
  /** Header thêm, dạng JSON `{"tên": "giá trị"}`. Chuỗi rỗng = không có. */
  extraHeaders: string;
  /** Trường thêm vào thân request, dạng JSON. Chuỗi rỗng = không có. */
  extraBody: string;
}

/**
 * Mặc định là RỖNG HẾT, và đó là chủ ý.
 *
 * Người chơi dán URL proxy với mật khẩu vào rồi bấm "Kiểm tra kết nối" — đúng
 * như hai provider kia. Mọi ô dưới đây chỉ để gỡ khi cái tự dò không ra, và
 * chúng nằm sau một mục "Nâng cao" đóng sẵn.
 */
export const DEFAULT_CUSTOM_TRANSPORT: CustomTransport = {
  chatPath: '',
  modelsPath: '',
  authHeader: '',
  authPrefix: 'Bearer ',
  extraHeaders: '',
  extraBody: '',
};

export interface LLMRequest {
  system: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
  maxTokens: number;
  stopSequences?: string[];
  signal?: AbortSignal | undefined;
  /**
   * Carried across turns. Gemini's `thoughtSignature` lives here — dropping it
   * makes every later turn fail with a 400 (part 1 section 3.2c).
   */
  meta?: Record<string, unknown>;
}

export interface LLMResponse {
  text: string;
  /** Payload gốc, giữ nguyên để tra ở tab Debug. */
  raw: unknown;
  usage?: { in: number; out: number };
  /** Ví dụ `thoughtSignature` của Gemini. */
  meta?: Record<string, unknown>;
}

export interface ModelInfo {
  id: string;
  /** Tên hiển thị nếu nhà cung cấp có trả về. */
  label?: string;
  /** Cửa sổ ngữ cảnh, nếu biết. */
  contextWindow?: number;
  /** Trần token đầu ra, nếu biết. */
  maxOutput?: number;
}

/**
 * UI hint for one parameter. The settings panel renders the parameter area
 * from these (part 1 section 7), while `paramSchema` remains the thing that
 * actually validates.
 */
export interface ParamSpec {
  key: string;
  label: string;
  kind: 'number' | 'integer' | 'boolean' | 'string' | 'stringList' | 'enum';
  min?: number;
  max?: number;
  step?: number;
  options?: string[];
  default: unknown;
  help?: string;
  /**
   * Tham số KHÔNG gửi cho tới khi người chơi bật nó.
   *
   * `min_p`, `top_a`, `repetition_penalty`… không có trong API gốc của OpenAI:
   * proxy nào hiểu thì hiểu, proxy nào không thì trả 400. Gửi mặc định là làm
   * hỏng kết nối của người không cần chúng, nên chúng vắng mặt trong
   * `defaultParams` và UI hiện một ô tick "gửi tham số này".
   */
  optional?: boolean;
  /**
   * Trần thật lấy từ model đang chọn, khi biết. `maxOutput` của model ghi đè
   * `max` của spec — đó là chỗ 65k đầu ra bị nhầm thành 2 triệu.
   */
  boundBy?: 'maxOutput' | 'contextWindow';
}

/** `defaultParams` của một provider: bỏ qua mọi tham số `optional`. */
export function defaultsOf(specs: readonly ParamSpec[]): Record<string, unknown> {
  return Object.fromEntries(
    specs.filter((spec) => spec.optional !== true).map((spec) => [spec.key, spec.default]),
  );
}

/** A warning shown next to a control rather than thrown. */
export interface ParamWarning {
  key: string;
  level: 'warn' | 'info';
  message: string;
}

export interface LLMProvider {
  id: ProviderId;
  label: string;
  /** Tham số hợp lệ riêng của provider. */
  paramSchema: z.ZodType<Record<string, unknown>>;
  defaultParams: Record<string, unknown>;
  /** Mô tả từng tham số để UI dựng control động. */
  paramSpecs: ParamSpec[];

  /**
   * Parameters this MODEL ignores or rejects. The UI greys them out instead of
   * letting the player believe a dead slider does something (part 1 section 3.2).
   */
  unsupportedParams(model: string): string[];

  /** Cảnh báo hiện ngay dưới control, ví dụ Gemini temperature < 1.0. */
  warnings(params: Record<string, unknown>, model: string): ParamWarning[];

  /**
   * Strip params that would make the provider answer 400 — e.g. Gemini
   * rejecting `thinkingBudget` alongside `thinkingLevel`. Returns the cleaned
   * params plus what was dropped, so the UI can say so.
   */
  sanitizeParams(
    params: Record<string, unknown>,
    model: string,
  ): { params: Record<string, unknown>; removed: ParamWarning[] };

  listModels(cfg: ConnCfg, signal?: AbortSignal): Promise<ModelInfo[]>;
  stream(req: LLMRequest, cfg: ConnCfg, onChunk: (text: string) => void): Promise<LLMResponse>;

  /**
   * Đếm token THẬT, khi nhà cung cấp có endpoint riêng (part 3 section 9).
   * Không có thì để trống và ngân sách token rơi về ước lượng.
   */
  countTokens?(text: string, cfg: ConnCfg, signal?: AbortSignal): Promise<number>;
}

/** Kết quả nút "Kiểm tra kết nối". */
export interface ConnectionCheck {
  ok: boolean;
  latencyMs: number;
  /** Chữ nhận được khi ping thành công. */
  sample?: string;
  error?: LlmError;
}

const REGISTRY: Record<ProviderId, LLMProvider> = {
  openai: openaiProvider,
  gemini: geminiProvider,
  anthropic: anthropicProvider,
  custom: customProvider,
};

export function getProvider(id: ProviderId): LLMProvider {
  const provider = REGISTRY[id];
  if (provider === undefined) {
    throw new Error(`unknown provider "${id}"`);
  }
  return provider;
}

export function allProviders(): LLMProvider[] {
  return [REGISTRY.openai, REGISTRY.gemini, REGISTRY.anthropic, REGISTRY.custom];
}

/** Base URL without a trailing slash, so path joins stay predictable. */
export function trimBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, '');
}

/**
 * Send a one-word "ping" and report what happened — the whole of what part 1
 * asks the AI layer to do end to end.
 */
export async function checkConnection(
  cfg: ConnCfg,
  signal?: AbortSignal,
): Promise<ConnectionCheck> {
  const provider = getProvider(cfg.providerId);
  const started = performance.now();
  let streamed = '';

  try {
    const response = await provider.stream(
      {
        system: 'Trả lời đúng một từ.',
        messages: [{ role: 'user', content: 'ping' }],
        maxTokens: 32,
        signal,
      },
      cfg,
      (chunk) => {
        streamed += chunk;
      },
    );
    return {
      ok: true,
      latencyMs: Math.round(performance.now() - started),
      sample: (response.text === '' ? streamed : response.text).trim(),
    };
  } catch (error) {
    return {
      ok: false,
      latencyMs: Math.round(performance.now() - started),
      error: error as LlmError,
    };
  }
}
