/**
 * Provider `custom`: dán URL proxy với mật khẩu vào là chạy.
 *
 * Bài test này canh đúng một điều — người chơi KHÔNG phải khai gì thêm. Mọi
 * trường hợp dưới đây đều bắt đầu từ một `ConnCfg` chỉ có `baseUrl` và
 * `password`, đúng như cái ảnh chụp màn hình mà nó phải giống.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { debugLog } from '../debuglog';
import { LlmError } from '../errors';
import type { ConnCfg } from '../provider';
import { customProvider, joinPath, probeCustomTransport } from './custom';

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
}

const calls: Call[] = [];

function cfg(overrides: Partial<ConnCfg> = {}): ConnCfg {
  return {
    providerId: 'custom',
    baseUrl: 'https://gcli.ggchan.dev/',
    password: 'mat-khau-proxy',
    model: 'gemini-3-pro',
    params: {},
    timeoutMs: 5000,
    stream: false,
    ...overrides,
  };
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Chỉ đúng một (url, header) trả lời; mọi chỗ khác 404 hoặc 401. */
function serverAt(options: {
  url: string;
  authHeader?: string;
  body: unknown;
}): void {
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const headers = (init?.headers ?? {}) as Record<string, string>;
    calls.push({ url, method: init?.method ?? 'GET', headers });

    if (url !== options.url) return json({ error: 'not found' }, 404);
    if (options.authHeader !== undefined && headers[options.authHeader] === undefined) {
      return json({ error: 'unauthorized' }, 401);
    }
    return json(options.body);
  });
}

beforeEach(() => {
  calls.length = 0;
  debugLog.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('joinPath — tha thứ cho dấu gạch chéo', () => {
  it('bỏ dấu / thừa ở cả hai đầu', () => {
    expect(joinPath('https://a.dev/', '/v1/models')).toBe('https://a.dev/v1/models');
    expect(joinPath('https://a.dev', 'v1/models')).toBe('https://a.dev/v1/models');
  });

  it('đường dẫn rỗng nghĩa là base URL đã trỏ thẳng vào endpoint', () => {
    expect(joinPath('https://a.dev/v1/chat/completions', '')).toBe('https://a.dev/v1/chat/completions');
  });
});

describe('probeCustomTransport — tự dò, không bắt khai', () => {
  it('tìm ra /v1/models khi /models không có', async () => {
    serverAt({
      url: 'https://gcli.ggchan.dev/v1/models',
      body: { data: [{ id: 'gemini-3-pro', context_length: 2000000, max_completion_tokens: 65000 }] },
    });

    const probe = await probeCustomTransport(cfg());

    expect(probe.transport.modelsPath).toBe('/v1/models');
    expect(probe.models[0]).toEqual({
      id: 'gemini-3-pro',
      contextWindow: 2000000,
      maxOutput: 65000,
    });
    // Đã thử /models trước rồi mới tới /v1/models.
    expect(calls[0]?.url).toBe('https://gcli.ggchan.dev/models');
  });

  it('tìm ra header x-api-key khi Authorization bị từ chối', async () => {
    serverAt({
      url: 'https://gcli.ggchan.dev/models',
      authHeader: 'x-api-key',
      body: { data: [{ id: 'model-a' }] },
    });

    const probe = await probeCustomTransport(cfg());

    expect(probe.transport.authHeader).toBe('x-api-key');
    expect(probe.transport.authPrefix).toBe('');
  });

  it('bỏ tiền tố models/ mà proxy Gemini hay trả về', async () => {
    serverAt({
      url: 'https://gcli.ggchan.dev/models',
      body: { models: [{ name: 'models/gemini-3-flash' }] },
    });

    expect((await probeCustomTransport(cfg())).models[0]?.id).toBe('gemini-3-flash');
  });

  it('nhận cả mảng chuỗi trần của proxy tự viết', async () => {
    serverAt({ url: 'https://gcli.ggchan.dev/models', body: ['model-a', 'model-b'] });

    expect((await probeCustomTransport(cfg())).models.map((model) => model.id)).toEqual([
      'model-a',
      'model-b',
    ]);
  });

  it('dò hết mà không ra thì kể lại đã thử những đâu', async () => {
    vi.stubGlobal('fetch', async () => json({ error: 'nope' }, 404));

    await expect(probeCustomTransport(cfg())).rejects.toThrow(LlmError);
    await expect(probeCustomTransport(cfg())).rejects.toMatchObject({
      detail: expect.stringContaining('/v1/models'),
    });
  });

  it('lỗi KHÔNG phải 404/401 dừng ngay, không thử tiếp', async () => {
    // 400 nghĩa là proxy ĐÃ nghe thấy và không đồng ý. Thử thêm mười một tổ hợp
    // đường dẫn × header nữa chỉ làm người chơi chờ mười một lần timeout.
    let hits = 0;
    vi.stubGlobal('fetch', async () => {
      hits++;
      return json({ error: 'body sai' }, 400);
    });

    await expect(probeCustomTransport(cfg())).rejects.toThrow(LlmError);
    expect(hits).toBe(1);
  });
});

describe('customProvider.stream — gọi thẳng, không cần quét trước', () => {
  it('tự dò endpoint chat ngay trong lượt đầu tiên', async () => {
    serverAt({
      url: 'https://gcli.ggchan.dev/v1/chat/completions',
      body: {
        choices: [{ message: { content: 'Ngài bước vào đại sảnh.' } }],
        usage: { prompt_tokens: 12, completion_tokens: 7 },
      },
    });

    const chunks: string[] = [];
    const response = await customProvider.stream(
      { system: 'hệ thống', messages: [{ role: 'user', content: 'xin chào' }], maxTokens: 100 },
      cfg(),
      (text) => chunks.push(text),
    );

    expect(response.text).toBe('Ngài bước vào đại sảnh.');
    expect(response.usage).toEqual({ in: 12, out: 7 });
    // Không streaming: `onChunk` gọi đúng một lần với cả đoạn.
    expect(chunks).toEqual(['Ngài bước vào đại sảnh.']);
  });

  it('dùng thẳng đường dẫn đã dò ra trước đó, không dò lại', async () => {
    serverAt({
      url: 'https://gcli.ggchan.dev/v1/chat/completions',
      body: { choices: [{ message: { content: 'xong' } }] },
    });

    await customProvider.stream(
      { system: '', messages: [{ role: 'user', content: 'ping' }], maxTokens: 10 },
      cfg({
        custom: {
          chatPath: '/v1/chat/completions',
          modelsPath: '/v1/models',
          authHeader: 'Authorization',
          authPrefix: 'Bearer ',
          extraHeaders: '',
          extraBody: '',
        },
      }),
      () => {},
    );

    expect(calls).toHaveLength(1);
    expect(calls[0]?.headers['Authorization']).toBe('Bearer mat-khau-proxy');
  });

  it('trần đầu ra đi vào thân request đúng con số của lượt', async () => {
    let body: Record<string, unknown> = {};
    vi.stubGlobal('fetch', async (_input: RequestInfo | URL, init?: RequestInit) => {
      body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
      return json({ choices: [{ message: { content: 'ok' } }] });
    });

    await customProvider.stream(
      { system: '', messages: [{ role: 'user', content: 'ping' }], maxTokens: 65000 },
      cfg(),
      () => {},
    );

    expect(body['max_tokens']).toBe(65000);
    expect(body['stream']).toBe(false);
  });

  it('thân thêm của người dùng ghi đè mọi thứ', async () => {
    let body: Record<string, unknown> = {};
    vi.stubGlobal('fetch', async (_input: RequestInfo | URL, init?: RequestInit) => {
      body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
      return json({ choices: [{ message: { content: 'ok' } }] });
    });

    await customProvider.stream(
      { system: '', messages: [{ role: 'user', content: 'ping' }], maxTokens: 100 },
      cfg({
        custom: {
          chatPath: '/chat/completions',
          modelsPath: '',
          authHeader: '',
          authPrefix: '',
          extraHeaders: '{"x-title":"eu1444"}',
          extraBody: '{"max_tokens":999,"provider":{"order":["a"]}}',
        },
      }),
      () => {},
    );

    expect(body['max_tokens']).toBe(999);
    expect(body['provider']).toEqual({ order: ['a'] });
  });

  it('JSON hỏng trong ô "Thân thêm" nói rõ ô nào, không gửi đi thiếu', async () => {
    vi.stubGlobal('fetch', async () => json({ choices: [] }));

    await expect(
      customProvider.stream(
        { system: '', messages: [{ role: 'user', content: 'ping' }], maxTokens: 100 },
        cfg({
          custom: {
            chatPath: '/chat/completions',
            modelsPath: '',
            authHeader: '',
            authPrefix: '',
            extraHeaders: '',
            extraBody: '{ hỏng',
          },
        }),
        () => {},
      ),
    ).rejects.toMatchObject({ detail: expect.stringContaining('Thân thêm') });
    expect(calls).toHaveLength(0);
  });
});
