import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { debugLog, formatDebugLog, redactHeaders } from './debuglog';
import { classifyThrown, kindForStatus, LlmError } from './errors';
import { fetchJson, RETRY_BACKOFF_MS } from './http';
import { checkConnection, getProvider, type ConnCfg } from './provider';
import { SseParser } from './sse';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

const calls: Call[] = [];

function record(input: RequestInfo | URL, init?: RequestInit): Call {
  const call: Call = {
    url: String(input),
    method: init?.method ?? 'GET',
    headers: (init?.headers ?? {}) as Record<string, string>,
    body: typeof init?.body === 'string' ? JSON.parse(init.body) : null,
  };
  calls.push(call);
  return call;
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

function sseResponse(chunks: string[]): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

function cfg(overrides: Partial<ConnCfg> = {}): ConnCfg {
  return {
    providerId: 'openai',
    baseUrl: 'https://proxy.test/v1',
    password: 'mat-khau-rat-bi-mat',
    model: 'gpt-test',
    params: {},
    timeoutMs: 600000,
    ...overrides,
  };
}

beforeEach(() => {
  calls.length = 0;
  debugLog.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// SSE
// ---------------------------------------------------------------------------

describe('sse — bóc khung sự kiện', () => {
  it('ghép nhiều dòng data thành một sự kiện', () => {
    const parser = new SseParser();
    expect(parser.push('data: một\ndata: hai\n\n')).toEqual([{ event: '', data: 'một\nhai' }]);
  });

  it('chịu được \\r\\n và dòng chú thích', () => {
    const parser = new SseParser();
    expect(parser.push(': nhịp tim\r\ndata: xin chào\r\n\r\n')).toEqual([
      { event: '', data: 'xin chào' },
    ]);
  });

  it('chịu được sự kiện bị cắt giữa chừng qua hai chunk', () => {
    const parser = new SseParser();
    expect(parser.push('data: {"a"')).toEqual([]);
    expect(parser.push(':1}\n\n')).toEqual([{ event: '', data: '{"a":1}' }]);
  });

  it('đọc được tên sự kiện', () => {
    const parser = new SseParser();
    expect(parser.push('event: message_stop\ndata: {}\n\n')).toEqual([
      { event: 'message_stop', data: '{}' },
    ]);
  });

  it('trả nốt sự kiện cuối khi thiếu dòng trống kết thúc', () => {
    const parser = new SseParser();
    parser.push('data: cuối');
    expect(parser.finish()).toEqual([{ event: '', data: 'cuối' }]);
  });
});

// ---------------------------------------------------------------------------
// Phân loại lỗi (mục 4)
// ---------------------------------------------------------------------------

describe('lỗi — phân biệt bốn nguyên nhân, không gộp thành "Lỗi kết nối"', () => {
  it('ánh xạ status sang đúng loại', () => {
    expect(kindForStatus(401)).toBe('auth');
    expect(kindForStatus(403)).toBe('auth');
    expect(kindForStatus(404)).toBe('notfound');
    expect(kindForStatus(429)).toBe('ratelimit');
    expect(kindForStatus(500)).toBe('server');
    expect(kindForStatus(503)).toBe('server');
    expect(kindForStatus(400)).toBe('badrequest');
  });

  it('mỗi loại có câu tiếng Việt riêng, đúng chữ của đặc tả', () => {
    expect(new LlmError('network').vi).toBe('Proxy không cho phép gọi từ trình duyệt');
    expect(new LlmError('auth').vi).toBe('Sai mật khẩu proxy');
    expect(new LlmError('notfound').vi).toBe('Sai URL hoặc sai tên model');
    expect(new LlmError('ratelimit').vi).toBe('Bị giới hạn tốc độ');
  });

  it('bốn câu đó khác hẳn nhau — không có chỗ nào gộp', () => {
    const messages = (['network', 'auth', 'notfound', 'ratelimit'] as const).map(
      (kind) => new LlmError(kind).vi,
    );
    expect(new Set(messages).size).toBe(4);
  });

  it('TypeError của fetch thành lỗi mạng/CORS', () => {
    expect(classifyThrown(new TypeError('Failed to fetch')).kind).toBe('network');
  });

  it('phân biệt hết giờ với người chơi bấm Dừng', () => {
    const abort = new DOMException('aborted', 'AbortError');
    expect(classifyThrown(abort, true).kind).toBe('timeout');
    expect(classifyThrown(abort, false).kind).toBe('aborted');
  });

  it('chỉ 429 và 5xx mới đáng thử lại', () => {
    expect(new LlmError('ratelimit').retryable).toBe(true);
    expect(new LlmError('server').retryable).toBe(true);
    expect(new LlmError('auth').retryable).toBe(false);
    expect(new LlmError('notfound').retryable).toBe(false);
    expect(new LlmError('badrequest').retryable).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Retry (mục 8)
// ---------------------------------------------------------------------------

describe('http — thử lại tối đa 3 lần, backoff 1s / 4s / 10s', () => {
  it('dùng đúng ba mốc backoff', () => {
    expect([...RETRY_BACKOFF_MS]).toEqual([1000, 4000, 10000]);
  });

  it('thử lại 429 rồi thành công', async () => {
    vi.useFakeTimers();
    let attempt = 0;
    vi.stubGlobal('fetch', () => {
      attempt++;
      return Promise.resolve(attempt < 3 ? jsonResponse({ error: 'chậm lại' }, 429) : jsonResponse({ ok: 1 }));
    });

    const promise = fetchJson({
      url: 'https://proxy.test/x',
      method: 'GET',
      headers: {},
      timeoutMs: 600000,
    });
    await vi.advanceTimersByTimeAsync(20000);

    await expect(promise).resolves.toMatchObject({ data: { ok: 1 } });
    expect(attempt).toBe(3);
  });

  it('bỏ cuộc sau 4 lần gọi (1 lần đầu + 3 lần thử lại)', async () => {
    vi.useFakeTimers();
    let attempt = 0;
    vi.stubGlobal('fetch', () => {
      attempt++;
      return Promise.resolve(jsonResponse({}, 503));
    });

    const promise = fetchJson({
      url: 'https://proxy.test/x',
      method: 'GET',
      headers: {},
      timeoutMs: 600000,
    }).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(60000);

    expect((await promise as LlmError).kind).toBe('server');
    expect(attempt).toBe(4);
  });

  it('KHÔNG thử lại 401 — thử lại chỉ làm khóa tài khoản nhanh hơn', async () => {
    let attempt = 0;
    vi.stubGlobal('fetch', () => {
      attempt++;
      return Promise.resolve(jsonResponse({}, 401));
    });

    await expect(
      fetchJson({ url: 'https://proxy.test/x', method: 'GET', headers: {}, timeoutMs: 600000 }),
    ).rejects.toMatchObject({ kind: 'auth' });
    expect(attempt).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Adapter OpenAI (mục 3.1)
// ---------------------------------------------------------------------------

describe('adapter OpenAI', () => {
  it('quét model từ GET /models → data[].id', async () => {
    vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
      record(input, init);
      return Promise.resolve(jsonResponse({ data: [{ id: 'gpt-a' }, { id: 'gpt-b' }] }));
    });

    const models = await getProvider('openai').listModels(cfg());
    expect(models.map((model) => model.id)).toEqual(['gpt-a', 'gpt-b']);
    expect(calls[0]?.url).toBe('https://proxy.test/v1/models');
    expect(calls[0]?.headers['Authorization']).toBe('Bearer mat-khau-rat-bi-mat');
  });

  it('gửi system vào mảng messages và stream ra từng mẩu chữ', async () => {
    vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
      record(input, init);
      return Promise.resolve(
        sseResponse([
          'data: {"choices":[{"delta":{"content":"Xin "}}]}\n\n',
          'data: {"choices":[{"delta":{"content":"chào"}}]}\n\n',
          'data: {"usage":{"prompt_tokens":12,"completion_tokens":3}}\n\n',
          'data: [DONE]\n\n',
        ]),
      );
    });

    const chunks: string[] = [];
    const response = await getProvider('openai').stream(
      { system: 'luật', messages: [{ role: 'user', content: 'chào' }], maxTokens: 100 },
      cfg(),
      (chunk) => chunks.push(chunk),
    );

    expect(chunks).toEqual(['Xin ', 'chào']);
    expect(response.text).toBe('Xin chào');
    expect(response.usage).toEqual({ in: 12, out: 3 });

    const body = calls[0]?.body as { messages: { role: string }[]; stream: boolean; max_tokens: number };
    expect(calls[0]?.url).toBe('https://proxy.test/v1/chat/completions');
    expect(body.messages[0]).toEqual({ role: 'system', content: 'luật' });
    expect(body.stream).toBe(true);
    expect(body.max_tokens).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// Adapter Gemini (mục 3.2)
// ---------------------------------------------------------------------------

describe('adapter Gemini', () => {
  const geminiCfg = cfg({
    providerId: 'gemini',
    baseUrl: 'https://proxy.test',
    model: 'gemini-3-pro',
    params: { temperature: 1, topP: 0.95, topK: 64, thinkingLevel: 'HIGH' },
  });

  it('quét model, cắt tiền tố models/ và bỏ model không sinh nội dung', async () => {
    vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
      record(input, init);
      return Promise.resolve(
        jsonResponse({
          models: [
            { name: 'models/gemini-3-pro', displayName: 'Gemini 3 Pro', inputTokenLimit: 1000000, supportedGenerationMethods: ['generateContent'] },
            { name: 'models/text-embedding', supportedGenerationMethods: ['embedContent'] },
          ],
        }),
      );
    });

    const models = await getProvider('gemini').listModels(geminiCfg);
    expect(models).toEqual([
      { id: 'gemini-3-pro', label: 'Gemini 3 Pro', contextWindow: 1000000 },
    ]);
    expect(calls[0]?.url).toBe('https://proxy.test/v1beta/models');
    expect(calls[0]?.headers['x-goog-api-key']).toBe('mat-khau-rat-bi-mat');
  });

  it('(a) loại bỏ thinkingBudget khi đã có thinkingLevel và nói rõ lý do', () => {
    const provider = getProvider('gemini');
    const result = provider.sanitizeParams(
      { thinkingLevel: 'HIGH', thinkingBudget: 8192 },
      'gemini-3-pro',
    );
    expect(result.params['thinkingBudget']).toBeUndefined();
    expect(result.removed[0]?.message).toContain('400');
  });

  it('(a) giữ nguyên thinkingBudget khi KHÔNG có thinkingLevel', () => {
    const result = getProvider('gemini').sanitizeParams({ thinkingBudget: 8192 }, 'gemini-3-pro');
    expect(result.params['thinkingBudget']).toBe(8192);
    expect(result.removed).toHaveLength(0);
  });

  it('(b) cảnh báo vàng khi hạ temperature xuống dưới 1.0', () => {
    const warnings = getProvider('gemini').warnings({ temperature: 0.7 }, 'gemini-3-pro');
    const temperature = warnings.find((warning) => warning.key === 'temperature');
    expect(temperature?.level).toBe('warn');
    expect(temperature?.message).toBe(
      'Dòng Gemini 3 khuyến nghị giữ 1.0; hạ thấp làm giảm chất lượng suy luận.',
    );
  });

  it('(b) không cảnh báo khi giữ 1.0', () => {
    const warnings = getProvider('gemini').warnings({ temperature: 1 }, 'gemini-3-pro');
    expect(warnings.some((warning) => warning.key === 'temperature')).toBe(false);
  });

  it('biết model Flash bỏ qua tham số nào, để UI làm mờ slider', () => {
    const provider = getProvider('gemini');
    expect(provider.unsupportedParams('gemini-3-flash').sort()).toEqual(['temperature', 'topK', 'topP']);
    expect(provider.unsupportedParams('gemini-3-flash-lite').sort()).toEqual(['temperature', 'topK', 'topP']);
    expect(provider.unsupportedParams('gemini-3-pro')).toEqual([]);
  });

  it('không gửi tham số mà model bỏ qua', async () => {
    vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
      record(input, init);
      return Promise.resolve(sseResponse(['data: {"candidates":[{"content":{"parts":[{"text":"ừ"}]}}]}\n\n']));
    });

    await getProvider('gemini').stream(
      { system: '', messages: [{ role: 'user', content: 'chào' }], maxTokens: 64 },
      { ...geminiCfg, model: 'gemini-3-flash' },
      () => {},
    );

    const generationConfig = (calls[0]?.body as { generationConfig: Record<string, unknown> })
      .generationConfig;
    expect(generationConfig['temperature']).toBeUndefined();
    expect(generationConfig['topP']).toBeUndefined();
    expect(generationConfig['topK']).toBeUndefined();
  });

  it('gửi systemInstruction riêng và đổi vai assistant thành model', async () => {
    vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
      record(input, init);
      return Promise.resolve(sseResponse(['data: {"candidates":[{"content":{"parts":[{"text":"ừ"}]}}]}\n\n']));
    });

    await getProvider('gemini').stream(
      {
        system: 'luật bất biến',
        messages: [
          { role: 'user', content: 'chào' },
          { role: 'assistant', content: 'chào lại' },
        ],
        maxTokens: 64,
      },
      geminiCfg,
      () => {},
    );

    const body = calls[0]?.body as {
      systemInstruction: { parts: { text: string }[] };
      contents: { role: string }[];
    };
    expect(calls[0]?.url).toBe(
      'https://proxy.test/v1beta/models/gemini-3-pro:streamGenerateContent?alt=sse',
    );
    expect(body.systemInstruction.parts[0]?.text).toBe('luật bất biến');
    expect(body.contents.map((turn) => turn.role)).toEqual(['user', 'model']);
  });

  it('(c) lưu thoughtSignature nhận được và echo lại nguyên văn ở lượt sau', async () => {
    vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
      record(input, init);
      return Promise.resolve(
        sseResponse([
          'data: {"candidates":[{"content":{"parts":[{"text":"ừ","thoughtSignature":"CHU-KY-123"}]}}]}\n\n',
        ]),
      );
    });

    const first = await getProvider('gemini').stream(
      { system: '', messages: [{ role: 'user', content: 'chào' }], maxTokens: 64 },
      geminiCfg,
      () => {},
    );
    expect(first.meta?.['thoughtSignature']).toBe('CHU-KY-123');

    await getProvider('gemini').stream(
      {
        system: '',
        messages: [
          { role: 'user', content: 'chào' },
          { role: 'assistant', content: 'ừ' },
          { role: 'user', content: 'tiếp' },
        ],
        maxTokens: 64,
        meta: { thoughtSignature: first.meta?.['thoughtSignature'] },
      },
      geminiCfg,
      () => {},
    );

    const contents = (calls[1]?.body as { contents: { role: string; parts: { thoughtSignature?: string }[] }[] })
      .contents;
    const modelTurn = contents.find((turn) => turn.role === 'model');
    expect(modelTurn?.parts[0]?.thoughtSignature).toBe('CHU-KY-123');
  });

  it('bỏ qua phần thought:true — đó là suy luận, không phải diễn biến', async () => {
    vi.stubGlobal('fetch', () =>
      Promise.resolve(
        sseResponse([
          'data: {"candidates":[{"content":{"parts":[{"text":"đang nghĩ","thought":true},{"text":"kết quả"}]}}]}\n\n',
        ]),
      ),
    );

    const chunks: string[] = [];
    const response = await getProvider('gemini').stream(
      { system: '', messages: [{ role: 'user', content: 'x' }], maxTokens: 64 },
      geminiCfg,
      (chunk) => chunks.push(chunk),
    );
    expect(chunks).toEqual(['kết quả']);
    expect(response.text).toBe('kết quả');
  });
});

// ---------------------------------------------------------------------------
// Adapter Anthropic (mục 3.3)
// ---------------------------------------------------------------------------

describe('adapter Anthropic', () => {
  const anthropicCfg = cfg({
    providerId: 'anthropic',
    baseUrl: 'https://proxy.test',
    model: 'claude-sonnet-4-6',
    params: { temperature: 0.8 },
  });

  it('gửi ba header bắt buộc, kể cả cờ cho phép gọi thẳng từ trình duyệt', async () => {
    vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
      record(input, init);
      return Promise.resolve(jsonResponse({ data: [{ id: 'claude-sonnet-4-6' }] }));
    });

    await getProvider('anthropic').listModels(anthropicCfg);
    expect(calls[0]?.url).toBe('https://proxy.test/v1/models');
    expect(calls[0]?.headers['x-api-key']).toBe('mat-khau-rat-bi-mat');
    expect(calls[0]?.headers['anthropic-version']).toBe('2023-06-01');
    expect(calls[0]?.headers['anthropic-dangerous-direct-browser-access']).toBe('true');
  });

  it('đặt system ở field riêng, KHÔNG nhét vào mảng messages', async () => {
    vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
      record(input, init);
      return Promise.resolve(
        sseResponse([
          'event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":20,"output_tokens":0}}}\n\n',
          'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Vâng"}}\n\n',
          'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":5}}\n\n',
        ]),
      );
    });

    const chunks: string[] = [];
    const response = await getProvider('anthropic').stream(
      { system: 'luật bất biến', messages: [{ role: 'user', content: 'chào' }], maxTokens: 128 },
      anthropicCfg,
      (chunk) => chunks.push(chunk),
    );

    const body = calls[0]?.body as { system: string; messages: { role: string }[]; max_tokens: number };
    expect(body.system).toBe('luật bất biến');
    expect(body.messages.every((message) => message.role !== 'system')).toBe(true);
    expect(body.max_tokens).toBe(128);
    expect(chunks).toEqual(['Vâng']);
    expect(response.usage).toEqual({ in: 20, out: 5 });
  });

  it('biết model đời mới TỪ CHỐI tham số lấy mẫu, và tự loại bỏ chúng', async () => {
    const provider = getProvider('anthropic');
    expect(provider.unsupportedParams('claude-sonnet-4-6')).toEqual([]);
    expect(provider.unsupportedParams('claude-opus-4-7').sort()).toEqual(['temperature', 'top_k', 'top_p']);
    expect(provider.unsupportedParams('claude-opus-5').sort()).toEqual(['temperature', 'top_k', 'top_p']);

    vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
      record(input, init);
      return Promise.resolve(sseResponse(['event: message_stop\ndata: {"type":"message_stop"}\n\n']));
    });

    await provider.stream(
      { system: '', messages: [{ role: 'user', content: 'x' }], maxTokens: 64 },
      { ...anthropicCfg, model: 'claude-opus-5', params: { temperature: 0.5, top_p: 0.9 } },
      () => {},
    );
    const body = calls[0]?.body as Record<string, unknown>;
    expect(body['temperature']).toBeUndefined();
    expect(body['top_p']).toBeUndefined();
  });

  it('vẫn gửi tham số lấy mẫu cho model còn nhận', async () => {
    vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
      record(input, init);
      return Promise.resolve(sseResponse(['event: message_stop\ndata: {"type":"message_stop"}\n\n']));
    });

    await getProvider('anthropic').stream(
      { system: '', messages: [{ role: 'user', content: 'x' }], maxTokens: 64 },
      anthropicCfg,
      () => {},
    );
    expect((calls[0]?.body as Record<string, unknown>)['temperature']).toBe(0.8);
  });

  it('coi stop_reason refusal là kết quả bị từ chối, không phải lỗi mạng', async () => {
    vi.stubGlobal('fetch', () =>
      Promise.resolve(
        sseResponse([
          'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"refusal"}}\n\n',
        ]),
      ),
    );

    await expect(
      getProvider('anthropic').stream(
        { system: '', messages: [{ role: 'user', content: 'x' }], maxTokens: 64 },
        anthropicCfg,
        () => {},
      ),
    ).rejects.toMatchObject({ kind: 'badrequest' });
  });
});

// ---------------------------------------------------------------------------
// Ping + nhật ký debug (mục 7, 8)
// ---------------------------------------------------------------------------

describe('kiểm tra kết nối và nhật ký debug', () => {
  it('gửi ping và trả về chữ nhận được kèm độ trễ', async () => {
    vi.stubGlobal('fetch', () =>
      Promise.resolve(sseResponse(['data: {"choices":[{"delta":{"content":"pong"}}]}\n\n'])),
    );

    const result = await checkConnection(cfg());
    expect(result.ok).toBe(true);
    expect(result.sample).toBe('pong');
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('báo đúng nguyên nhân khi ping hỏng', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('Failed to fetch')));

    const result = await checkConnection(cfg());
    expect(result.ok).toBe(false);
    expect(result.error?.vi).toBe('Proxy không cho phép gọi từ trình duyệt');
  });

  it('KHÔNG BAO GIỜ ghi mật khẩu proxy vào nhật ký', async () => {
    vi.stubGlobal('fetch', () =>
      Promise.resolve(sseResponse(['data: {"choices":[{"delta":{"content":"pong"}}]}\n\n'])),
    );
    await checkConnection(cfg());

    const dump = formatDebugLog(debugLog.entries());
    expect(dump).not.toContain('mat-khau-rat-bi-mat');
    expect(dump).toContain('«đã ẩn»');
  });

  it('ẩn mọi header chứa bí mật, không phân biệt hoa thường', () => {
    expect(
      redactHeaders({
        Authorization: 'Bearer x',
        'X-Api-Key': 'y',
        'x-goog-api-key': 'z',
        'Content-Type': 'application/json',
      }),
    ).toEqual({
      Authorization: '«đã ẩn»',
      'X-Api-Key': '«đã ẩn»',
      'x-goog-api-key': '«đã ẩn»',
      'Content-Type': 'application/json',
    });
  });

  it('giữ tối đa 50 mục trong bộ đệm vòng', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(jsonResponse({ data: [] })));
    for (let i = 0; i < 55; i++) {
      await getProvider('openai').listModels(cfg());
    }
    expect(debugLog.entries()).toHaveLength(50);
  });
});
