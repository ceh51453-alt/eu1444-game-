/**
 * In-memory ring buffer of the last 50 LLM exchanges (part 1 section 8),
 * feeding the Debug tab.
 *
 * Never stores the proxy password. Redaction happens here rather than at each
 * call site, so a new adapter cannot forget to do it.
 */

export const DEBUG_LOG_SIZE = 50;

export interface DebugEntry {
  id: number;
  /** Which connection profile made the call. */
  profile: string;
  providerId: string;
  model: string;
  method: string;
  url: string;
  /** Headers with every secret already replaced. */
  headers: Record<string, string>;
  requestBody: string;
  status: number | null;
  responseBody: string;
  /** Round trip in ms. */
  latencyMs: number;
  /** Token usage as reported by the provider, when it reports any. */
  usage: { in: number; out: number } | null;
  errorKind: string | null;
  startedAt: number;
}

const SECRET_HEADERS = new Set(['authorization', 'x-api-key', 'x-goog-api-key', 'api-key']);
const MAX_BODY_CHARS = 20000;

export function redactHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    out[key] = SECRET_HEADERS.has(key.toLowerCase()) ? '«đã ẩn»' : value;
  }
  return out;
}

function clip(text: string): string {
  return text.length > MAX_BODY_CHARS
    ? `${text.slice(0, MAX_BODY_CHARS)}\n… (cắt bớt ${text.length - MAX_BODY_CHARS} ký tự)`
    : text;
}

type Listener = (entries: readonly DebugEntry[]) => void;

class DebugLog {
  #entries: DebugEntry[] = [];
  #nextId = 1;
  #listeners = new Set<Listener>();

  /** Open an entry when the request goes out; it is completed on the way back. */
  start(init: Omit<DebugEntry, 'id' | 'status' | 'responseBody' | 'latencyMs' | 'usage' | 'errorKind' | 'startedAt'>): number {
    const entry: DebugEntry = {
      ...init,
      id: this.#nextId++,
      headers: redactHeaders(init.headers),
      requestBody: clip(init.requestBody),
      status: null,
      responseBody: '',
      latencyMs: 0,
      usage: null,
      errorKind: null,
      startedAt: Date.now(),
    };
    this.#entries.push(entry);
    if (this.#entries.length > DEBUG_LOG_SIZE) {
      this.#entries.splice(0, this.#entries.length - DEBUG_LOG_SIZE);
    }
    this.#emit();
    return entry.id;
  }

  finish(
    id: number,
    patch: Partial<Pick<DebugEntry, 'status' | 'responseBody' | 'latencyMs' | 'usage' | 'errorKind'>>,
  ): void {
    const entry = this.#entries.find((candidate) => candidate.id === id);
    if (entry === undefined) return;
    if (patch.status !== undefined) entry.status = patch.status;
    if (patch.responseBody !== undefined) entry.responseBody = clip(patch.responseBody);
    if (patch.latencyMs !== undefined) entry.latencyMs = patch.latencyMs;
    if (patch.usage !== undefined) entry.usage = patch.usage;
    if (patch.errorKind !== undefined) entry.errorKind = patch.errorKind;
    this.#emit();
  }

  entries(): readonly DebugEntry[] {
    return this.#entries;
  }

  last(): DebugEntry | null {
    return this.#entries.at(-1) ?? null;
  }

  clear(): void {
    this.#entries = [];
    this.#emit();
  }

  subscribe(listener: Listener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  #emit(): void {
    const snapshot = [...this.#entries];
    for (const listener of this.#listeners) listener(snapshot);
  }
}

export const debugLog = new DebugLog();

/** Whole buffer as text, for the "copy to clipboard" button. */
export function formatDebugLog(entries: readonly DebugEntry[]): string {
  return entries
    .map((entry) =>
      [
        `#${entry.id} ${new Date(entry.startedAt).toISOString()} [${entry.profile}] ${entry.providerId}/${entry.model}`,
        `${entry.method} ${entry.url}`,
        `headers: ${JSON.stringify(entry.headers, null, 2)}`,
        `--- request ---`,
        entry.requestBody,
        `--- response (${entry.status ?? 'không có'}, ${entry.latencyMs}ms${entry.errorKind === null ? '' : `, lỗi: ${entry.errorKind}`}) ---`,
        entry.responseBody,
      ].join('\n'),
    )
    .join('\n\n========================================\n\n');
}
