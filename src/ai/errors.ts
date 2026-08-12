/**
 * LLM error taxonomy.
 *
 * Part 1 section 4 is explicit: a failed call must say WHICH failure it was.
 * Collapsing everything into "Lỗi kết nối" is called out as the single easiest
 * way to make this project undebuggable, because the four common causes need
 * four completely different fixes from the player.
 */

export type LlmErrorKind =
  /** fetch() itself failed — proxy unreachable, or no CORS headers. */
  | 'network'
  /** 401 / 403 — the proxy password is wrong. */
  | 'auth'
  /** 404 — wrong base URL or wrong model name. */
  | 'notfound'
  /** 429 — rate limited. */
  | 'ratelimit'
  /** 5xx — the proxy or upstream broke. */
  | 'server'
  /** 400 / 422 — we sent something the provider rejected. */
  | 'badrequest'
  /** Our timeout fired. */
  | 'timeout'
  /** The player pressed "Dừng". */
  | 'aborted'
  /** The response arrived but was not the shape we expected. */
  | 'parse'
  /** Anything unclassified. */
  | 'unknown';

/** Thông báo tiếng Việt cho người chơi. Đúng chữ như Phần 1 mục 4 yêu cầu. */
const MESSAGES: Record<LlmErrorKind, string> = {
  network: 'Proxy không cho phép gọi từ trình duyệt',
  auth: 'Sai mật khẩu proxy',
  notfound: 'Sai URL hoặc sai tên model',
  ratelimit: 'Bị giới hạn tốc độ',
  server: 'Proxy hoặc nhà cung cấp đang lỗi',
  badrequest: 'Yêu cầu gửi lên bị từ chối (sai tham số)',
  timeout: 'Quá thời gian chờ',
  aborted: 'Đã dừng theo yêu cầu',
  parse: 'Không đọc được phản hồi',
  unknown: 'Lỗi không xác định',
};

/** Only these are worth retrying (part 1 section 8). */
const RETRYABLE: ReadonlySet<LlmErrorKind> = new Set<LlmErrorKind>(['ratelimit', 'server']);

export interface LlmErrorOptions {
  status?: number;
  detail?: string;
  cause?: unknown;
  /**
   * Force retryability. Used when the kind alone is not enough — a 5xx that
   * arrives mid-stream is normally retryable, but replaying it would duplicate
   * text the player has already read.
   */
  retryable?: boolean;
}

export class LlmError extends Error {
  readonly kind: LlmErrorKind;
  /** HTTP status, when there was a response at all. */
  readonly status: number | undefined;
  /** Raw body (truncated) for the debug tab. */
  readonly detail: string | undefined;
  readonly #retryable: boolean | undefined;

  constructor(kind: LlmErrorKind, options: LlmErrorOptions = {}) {
    super(MESSAGES[kind]);
    this.name = 'LlmError';
    this.kind = kind;
    this.status = options.status;
    this.detail = options.detail;
    this.#retryable = options.retryable;
    if (options.cause !== undefined) this.cause = options.cause;
  }

  /** Câu hiện lên UI. */
  get vi(): string {
    return MESSAGES[this.kind];
  }

  get retryable(): boolean {
    return this.#retryable ?? RETRYABLE.has(this.kind);
  }
}

/** Map an HTTP status onto a kind. */
export function kindForStatus(status: number): LlmErrorKind {
  if (status === 401 || status === 403) return 'auth';
  if (status === 404) return 'notfound';
  if (status === 429) return 'ratelimit';
  if (status >= 500) return 'server';
  if (status === 400 || status === 422) return 'badrequest';
  return 'unknown';
}

/**
 * Classify a thrown value.
 *
 * A CORS rejection and a dead host are indistinguishable from JS — the browser
 * deliberately hides which one it was — so both land on `network`, whose
 * message names the likelier cause.
 */
export function classifyThrown(error: unknown, timedOut = false): LlmError {
  if (error instanceof LlmError) return error;

  if (error instanceof DOMException && error.name === 'AbortError') {
    return new LlmError(timedOut ? 'timeout' : 'aborted', { cause: error });
  }
  if (error instanceof TypeError) {
    return new LlmError('network', { detail: error.message, cause: error });
  }
  return new LlmError('unknown', { detail: String(error), cause: error });
}
