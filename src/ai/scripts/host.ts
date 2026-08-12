/**
 * `tavern_helper` script host (Phần 1 mục 6.8).
 *
 * PHÂN LOẠI THEO NHIỆM VỤ, KHÔNG THEO MỨC TIN CẬY:
 *
 *  - LOẠI UI  — chạy trên luồng chính, có DOM đầy đủ. Đây là loại chiếm đa số
 *    trong preset thật (làm đẹp chuỗi tư duy, khung gập, nút bấm). ĐẨY VÀO
 *    WORKER LÀ GIẾT SCRIPT chứ không phải làm nó an toàn hơn — Worker không có
 *    DOM. An toàn ở đây là try/catch quanh từng hook: script lỗi thì tắt hook
 *    đó, ghi log kèm tên, phần còn lại của game chạy tiếp.
 *
 *  - LOẠI TÍNH TOÁN — chạy trong Worker, để `terminate()` được khi treo.
 *
 * GIỚI HẠN DUY NHẤT, và nó là kiến trúc chứ không phải bảo mật: script KHÔNG
 * được ghi thẳng vào state. Muốn đổi state thì trả về `PatchOp[]` cho Phần 2
 * kiểm duyệt. Ghi thẳng được thì MVU không còn là đường ghi duy nhất, và
 * compare-and-swap, lịch sử, undo đều thành vô nghĩa. Đọc state thì tự do.
 */

import { sandboxPool, SandboxTimeout, type SandboxLogLine } from '../sandbox/pool';
import type { TavernHelperScriptRaw } from '../preset/schema';

export type ScriptKind = 'ui' | 'compute';

export interface HelperScript {
  id: string;
  name: string;
  enabled: boolean;
  kind: ScriptKind;
  code: string;
  /** Vì sao được xếp vào loại đó — hiện trên tab Script. */
  kindReason: string;
}

/**
 * Dấu hiệu script đụng vào DOM. Có bất kỳ cái nào là LOẠI UI.
 * Cờ khai báo tay `runsOnMainThread: true` thắng mọi suy đoán.
 */
const DOM_MARKERS: ReadonlyArray<{ pattern: RegExp; why: string }> = [
  { pattern: /\bdocument\b/, why: 'dùng document' },
  { pattern: /\binnerHTML\b/, why: 'ghi innerHTML' },
  { pattern: /\.style\b/, why: 'đổi style' },
  { pattern: /\bwindow\b/, why: 'dùng window' },
  { pattern: /\bquerySelector(All)?\b/, why: 'truy vấn DOM' },
  { pattern: /\baddEventListener\b/, why: 'gắn sự kiện DOM' },
  { pattern: /\bregisterRenderHook\b|\bonRender\b/, why: 'đăng ký render hook' },
];

export function classifyScript(raw: TavernHelperScriptRaw): { kind: ScriptKind; reason: string } {
  if (raw.runsOnMainThread === true) {
    return { kind: 'ui', reason: 'khai báo runsOnMainThread: true' };
  }
  for (const marker of DOM_MARKERS) {
    if (marker.pattern.test(raw.content)) return { kind: 'ui', reason: marker.why };
  }
  return { kind: 'compute', reason: 'không đụng DOM — chạy trong Worker để hủy được' };
}

export function normalizeHelperScript(raw: TavernHelperScriptRaw, index: number): HelperScript {
  const { kind, reason } = classifyScript(raw);
  return {
    id: raw.id ?? `script-${index}`,
    name: raw.name ?? raw.id ?? `Script ${index + 1}`,
    enabled: raw.enabled !== false,
    kind,
    code: raw.content,
    kindReason: reason,
  };
}

/** Dòng log của console riêng cho script (tách khỏi console trình duyệt). */
export interface ScriptLogLine extends SandboxLogLine {
  scriptId: string;
  scriptName: string;
}

/** Kết quả một lần chạy, để hiện thời gian từng script mỗi lượt. */
export interface ScriptRun {
  scriptId: string;
  scriptName: string;
  kind: ScriptKind;
  ok: boolean;
  elapsedMs: number;
  /** Giá trị script trả về. Chỉ `PatchOp[]` mới được Phần 2 xét. */
  value: unknown;
  error?: string;
  timedOut?: boolean;
}

export interface ScriptHostOptions {
  /** Trần thời gian cho script loại tính toán. Cấu hình được, có thể tắt hẳn. */
  timeoutMs: number;
  /** Đặt false để bỏ trần thời gian (mục 6.8 cho phép). */
  timeoutEnabled: boolean;
}

export const DEFAULT_SCRIPT_HOST_OPTIONS: ScriptHostOptions = {
  timeoutMs: 3000,
  timeoutEnabled: true,
};

/** Một tin AI tối thiểu theo hình dạng mà script Tavern Helper thường đọc. */
export interface TavernNarrativeMessage {
  id: number;
  text: string;
}

interface TavernMessage {
  is_user: boolean;
  mes: string;
  swipe_id: number;
  gen_started: boolean;
  extra: Record<string, unknown>;
  /** Bản gốc giúp giữ `extra.reasoning` khi render lại cùng một tin. */
  source: string;
}

type TavernListener = (...args: unknown[]) => void;

const TAVERN_EVENTS = {
  MESSAGE_UPDATED: 'message_updated',
  MESSAGE_RECEIVED: 'message_received',
  CHAT_CHANGED: 'chat_changed',
  CHARACTER_MESSAGE_RENDERED: 'character_message_rendered',
  STREAM_TOKEN_RECEIVED: 'stream_token_received',
} as const;

interface MiniQuery {
  on(event: string, handler: unknown): MiniQuery;
}

type LogListener = (lines: readonly ScriptLogLine[]) => void;

export class ScriptHost {
  #scripts: HelperScript[] = [];
  #logs: ScriptLogLine[] = [];
  #lastRuns: ScriptRun[] = [];
  #listeners = new Set<LogListener>();
  #tavernListeners = new Map<string, Set<TavernListener>>();
  #tavernMessages: TavernMessage[] = [];
  #scriptWindows = new Map<string, object>();
  #domCleanups: Array<() => void> = [];
  #reasoningSettings: Record<string, unknown> = {};
  #stopped = false;
  options: ScriptHostOptions = { ...DEFAULT_SCRIPT_HOST_OPTIONS };

  load(scripts: HelperScript[]): void {
    for (const cleanup of this.#domCleanups.splice(0)) cleanup();
    this.#scripts = scripts.map((script) => ({ ...script }));
    this.#tavernListeners.clear();
    this.#scriptWindows.clear();
    this.#reasoningSettings = {};
    this.#stopped = false;
  }

  /** Đồng bộ lịch sử kể chuyện sang `SillyTavern.chat` trước khi chạy script UI. */
  setNarrativeMessages(messages: readonly TavernNarrativeMessage[]): void {
    const previous = new Map(this.#tavernMessages.map((message, index) => [index, message] as const));
    const next: TavernMessage[] = [];

    for (const message of messages) {
      const old = previous.get(message.id);
      next[message.id] = {
        is_user: false,
        mes: message.text,
        swipe_id: 0,
        gen_started: false,
        extra: old?.source === message.text ? old.extra : {},
        source: message.text,
      };
    }

    // Listener của preset giữ tham chiếu đến chính mảng này, nên không được gán mảng mới.
    this.#tavernMessages.splice(0, this.#tavernMessages.length, ...next);
  }

  list(): readonly HelperScript[] {
    return this.#scripts;
  }

  setEnabled(id: string, enabled: boolean): void {
    const script = this.#scripts.find((candidate) => candidate.id === id);
    if (script !== undefined) script.enabled = enabled;
  }

  setCode(id: string, code: string): void {
    const script = this.#scripts.find((candidate) => candidate.id === id);
    if (script !== undefined) script.code = code;
  }

  logs(): readonly ScriptLogLine[] {
    return this.#logs;
  }

  lastRuns(): readonly ScriptRun[] {
    return this.#lastRuns;
  }

  clearLogs(): void {
    this.#logs = [];
    this.#emit();
  }

  subscribe(listener: LogListener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /** Nút "Dừng mọi script" cho lúc lỡ viết vòng lặp hỏng. */
  stopAll(): void {
    this.#stopped = true;
    sandboxPool.terminateAll();
    this.#push('*', 'engine', { level: 'warn', args: ['Đã dừng mọi script.'], at: Date.now() });
  }

  resume(): void {
    this.#stopped = false;
  }

  get stopped(): boolean {
    return this.#stopped;
  }

  /** Nút "Chạy thử" — một script, với state hiện tại, không đụng gì khác. */
  async runOne(id: string, state: unknown, input: unknown = null): Promise<ScriptRun> {
    const script = this.#scripts.find((candidate) => candidate.id === id);
    if (script === undefined) {
      return {
        scriptId: id,
        scriptName: id,
        kind: 'compute',
        ok: false,
        elapsedMs: 0,
        value: null,
        error: 'không có script với id này',
      };
    }
    const run = await this.#execute(script, state, input);
    this.#emitTavern(TAVERN_EVENTS.CHAT_CHANGED);
    return run;
  }

  /** Chạy toàn bộ script đang bật. Một script hỏng không kéo theo cái khác. */
  async runAll(state: unknown, input: unknown = null): Promise<ScriptRun[]> {
    if (this.#stopped) return [];
    const runs: ScriptRun[] = [];
    for (const script of this.#scripts) {
      if (!script.enabled) continue;
      runs.push(await this.#execute(script, state, input));
    }
    this.#lastRuns = runs;
    this.#emitTavern(TAVERN_EVENTS.CHAT_CHANGED);
    return runs;
  }

  #onTavern(scriptId: string, event: string, listener: TavernListener): void {
    let listeners = this.#tavernListeners.get(event);
    if (listeners === undefined) {
      listeners = new Set();
      this.#tavernListeners.set(event, listeners);
    }

    const guarded: TavernListener = (...args) => {
      const script = this.#scripts.find((candidate) => candidate.id === scriptId);
      if (this.#stopped || script?.enabled !== true) return;
      try {
        listener(...args);
      } catch (error) {
        this.#push(scriptId, script?.name ?? scriptId, {
          level: 'error',
          args: [`Lỗi trong hook ${event}: ${String(error)}`],
          at: Date.now(),
        });
      }
    };
    listeners.add(guarded);
  }

  #emitTavern(event: string, ...args: unknown[]): void {
    for (const listener of this.#tavernListeners.get(event) ?? []) listener(...args);
  }

  #updateMessageBlock(messageId: unknown, message: unknown): void {
    const id = typeof messageId === 'number' ? messageId : Number(messageId);
    if (!Number.isInteger(id) || id < 0) return;

    if (typeof document !== 'undefined') {
      // React đã chạy toàn bộ regex hiển thị trong `.mes_text`. Chỉ bỏ nguồn
      // reasoning mà script vừa chuyển thành panel; thay cả textContent ở đây
      // sẽ phá những khung HTML khác của cùng preset.
      const root = document.querySelector(`#chat [mesid="${String(id)}"] .mes_text`);
      root?.querySelectorAll('thinking, think').forEach((node) => node.remove());
    }

    const record = typeof message === 'object' && message !== null
      ? message as { mes?: unknown; extra?: unknown }
      : null;
    const current = this.#tavernMessages[id];
    if (current !== undefined && record !== null) {
      if (typeof record.mes === 'string') current.mes = record.mes;
      if (typeof record.extra === 'object' && record.extra !== null && !Array.isArray(record.extra)) {
        current.extra = record.extra as Record<string, unknown>;
      }
    }
    this.#emitTavern(TAVERN_EVENTS.MESSAGE_UPDATED, id);
  }

  #windowFor(scriptId: string): object {
    const existing = this.#scriptWindows.get(scriptId);
    if (existing !== undefined) return existing;

    const local: Record<PropertyKey, unknown> = {};
    const realWindow = typeof window === 'undefined' ? null : window;
    const proxy = new Proxy(local, {
      get: (target, property) => {
        if (Reflect.has(target, property)) return Reflect.get(target, property);
        if (property === 'chat') return this.#tavernMessages;
        if (property === 'updateMessageBlock') {
          return (messageId: unknown, message: unknown): void => this.#updateMessageBlock(messageId, message);
        }
        if (realWindow === null) return undefined;
        if (property === 'top' || property === 'parent' || property === 'self') return realWindow;
        const value: unknown = Reflect.get(realWindow, property, realWindow);
        return typeof value === 'function' ? value.bind(realWindow) : value;
      },
      set: (target, property, value) => {
        Reflect.set(target, property, value);
        return true;
      },
      has: (target, property) => Reflect.has(target, property) || (realWindow !== null && property in realWindow),
    });
    this.#scriptWindows.set(scriptId, proxy);
    return proxy;
  }

  #dollarFor(scriptWindow: object): (target: unknown) => MiniQuery {
    return (target: unknown): MiniQuery => {
      if (typeof target === 'function') target();
      const eventTarget = target === scriptWindow && typeof window !== 'undefined' ? window : target;
      const query: MiniQuery = {
        on: (event, handler) => {
          if (typeof EventTarget !== 'undefined' && eventTarget instanceof EventTarget && typeof handler === 'function') {
            const wrapped = (browserEvent: Event): void => {
              handler(browserEvent);
            };
            eventTarget.addEventListener(event, wrapped);
            this.#domCleanups.push(() => eventTarget.removeEventListener(event, wrapped));
          }
          return query;
        },
      };
      return query;
    };
  }

  async #execute(script: HelperScript, state: unknown, input: unknown): Promise<ScriptRun> {
    const base = { scriptId: script.id, scriptName: script.name, kind: script.kind };

    if (script.kind === 'ui') {
      // Luồng chính, DOM đầy đủ, try/catch quanh từng script.
      const started = performance.now();
      const logs: SandboxLogLine[] = [];
      try {
        const api = {
          state,
          input,
          log: (...args: unknown[]) => logs.push({ level: 'log', args: args.map(String), at: Date.now() }),
          warn: (...args: unknown[]) => logs.push({ level: 'warn', args: args.map(String), at: Date.now() }),
          error: (...args: unknown[]) => logs.push({ level: 'error', args: args.map(String), at: Date.now() }),
        };
        const scriptWindow = this.#windowFor(script.id);
        const sillyTavern = {
          chat: this.#tavernMessages,
          getContext: () => ({ powerUserSettings: { reasoning: this.#reasoningSettings } }),
          updateMessageBlock: (messageId: unknown, message: unknown): void => {
            this.#updateMessageBlock(messageId, message);
          },
        };
        const eventOn = (event: unknown, listener: unknown): void => {
          if (typeof event === 'string' && typeof listener === 'function') {
            this.#onTavern(script.id, event, (...args) => {
              listener(...args);
            });
          }
        };
        const scriptConsole = {
          log: (...args: unknown[]) => logs.push({ level: 'log' as const, args: args.map(String), at: Date.now() }),
          info: (...args: unknown[]) => logs.push({ level: 'log' as const, args: args.map(String), at: Date.now() }),
          debug: (...args: unknown[]) => logs.push({ level: 'log' as const, args: args.map(String), at: Date.now() }),
          warn: (...args: unknown[]) => logs.push({ level: 'warn' as const, args: args.map(String), at: Date.now() }),
          error: (...args: unknown[]) => logs.push({ level: 'error' as const, args: args.map(String), at: Date.now() }),
        };
        const fn = new Function(
          'api',
          'window',
          '$',
          'SillyTavern',
          'eventOn',
          'tavern_events',
          'getScriptId',
          'console',
          `"use strict";\n${script.code}`,
        ) as (...args: unknown[]) => unknown;
        const value = fn(
          api,
          scriptWindow,
          this.#dollarFor(scriptWindow),
          sillyTavern,
          eventOn,
          TAVERN_EVENTS,
          () => script.id,
          scriptConsole,
        );
        for (const line of logs) this.#push(script.id, script.name, line);
        return { ...base, ok: true, elapsedMs: Math.round(performance.now() - started), value };
      } catch (error) {
        for (const line of logs) this.#push(script.id, script.name, line);
        this.#push(script.id, script.name, { level: 'error', args: [String(error)], at: Date.now() });
        return {
          ...base,
          ok: false,
          elapsedMs: Math.round(performance.now() - started),
          value: null,
          error: String(error),
        };
      }
    }

    // Loại tính toán → Worker, hủy được.
    try {
      const result = await sandboxPool.run(
        { kind: 'script', id: script.id, code: script.code, state, input },
        this.options.timeoutEnabled ? this.options.timeoutMs : Number.MAX_SAFE_INTEGER,
      );
      for (const line of result.logs) this.#push(script.id, script.name, line);
      return { ...base, ok: true, elapsedMs: result.elapsedMs, value: result.value };
    } catch (error) {
      const timedOut = error instanceof SandboxTimeout;
      this.#push(script.id, script.name, { level: 'error', args: [String(error)], at: Date.now() });
      return {
        ...base,
        ok: false,
        elapsedMs: timedOut ? this.options.timeoutMs : 0,
        value: null,
        error: String(error),
        ...(timedOut ? { timedOut: true } : {}),
      };
    }
  }

  #push(scriptId: string, scriptName: string, line: SandboxLogLine): void {
    this.#logs.push({ ...line, scriptId, scriptName });
    if (this.#logs.length > 500) this.#logs.splice(0, this.#logs.length - 500);
    this.#emit();
  }

  #emit(): void {
    const snapshot = [...this.#logs];
    for (const listener of this.#listeners) listener(snapshot);
  }
}

export const scriptHost = new ScriptHost();

/**
 * Khai báo TypeScript cho API script, xuất ra file `.d.ts` (mục 6.8).
 * Người viết script tải file này về để có gợi ý trong editor.
 */
export const SCRIPT_API_DTS = `/**
 * API cho script tavern_helper của AI Medieval Fantasy Grand RPG.
 * Sinh tự động — đừng sửa tay.
 *
 * Script nhận một tham số duy nhất tên \`api\`.
 */
declare interface ScriptApi {
  /**
   * Ảnh chụp state hiện tại. ĐỌC tự do.
   * GHI vào đây KHÔNG có tác dụng: đây là bản sao.
   */
  readonly state: unknown;

  /** Dữ liệu vào của lượt này, nếu có. */
  readonly input: unknown;

  log(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

/**
 * Cách DUY NHẤT để đổi state: trả về mảng PatchOp cho Phần 2 kiểm duyệt.
 * Trả về thứ khác thì engine bỏ qua.
 */
declare interface PatchOp {
  path: string;
  op: 'set' | 'add' | 'remove';
  value?: unknown;
  /** Giá trị cũ, cho compare-and-swap của Phần 2. */
  expect?: unknown;
}

declare const api: ScriptApi;
`;
