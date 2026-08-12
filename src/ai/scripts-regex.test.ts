import { beforeEach, describe, expect, it } from 'vitest';
import {
  applyRegexScripts,
  appliesTo,
  looksCatastrophic,
  normalizeRegexScript,
  parseFindRegex,
  type RegexScript,
} from './regex/runner';
import { classifyScript, ScriptHost, SCRIPT_API_DTS, type HelperScript } from './scripts/host';

// ---------------------------------------------------------------------------
// Regex (mục 6.7)
// ---------------------------------------------------------------------------

describe('regex — đọc mẫu', () => {
  it('bóc được dạng /.../flags của SillyTavern', () => {
    expect(parseFindRegex('/<thinking>[\\s\\S]*?<\\/thinking>/g')).toEqual({
      pattern: '<thinking>[\\s\\S]*?<\\/thinking>',
      flags: 'g',
    });
  });

  it('chấp nhận cả chuỗi regex trần', () => {
    expect(parseFindRegex('\\(OOC:[^)]*\\)')).toEqual({ pattern: '\\(OOC:[^)]*\\)', flags: '' });
  });

  it('giữ nguyên cờ tác giả viết, không tự thêm g', () => {
    expect(normalizeRegexScript({ findRegex: '/x/i' }, 0).flags).toBe('i');
    expect(normalizeRegexScript({ findRegex: '/x/gi' }, 0).flags).toBe('gi');
    // Mẫu trần (có thật trong preset Ako) không có cờ nào — thêm g vào là đổi
    // ngữ nghĩa từ "thay một lần" thành "thay hết".
    expect(normalizeRegexScript({ findRegex: '^([\\s\\S]*)$' }, 0).flags).toBe('');
  });
});

describe('regex — chặn mẫu có thể treo UI', () => {
  it('bắt được định lượng lồng nhau', () => {
    expect(looksCatastrophic('(a+)+')).toBe(true);
    expect(looksCatastrophic('(\\s*\\w*)*')).toBe(true);
    expect(looksCatastrophic('(\\d+)*')).toBe(true);
  });

  it('không bắt nhầm mẫu bình thường', () => {
    expect(looksCatastrophic('<thinking>[\\s\\S]*?<\\/thinking>')).toBe(false);
    expect(looksCatastrophic('\\(OOC:[^)]*\\)')).toBe(false);
    expect(looksCatastrophic('^\\d{4}-\\d{2}-\\d{2}$')).toBe(false);
    // Luân phiên ký tự đơn dưới một dấu sao là tuyến tính, không nguy hiểm.
    expect(looksCatastrophic('(x|y)*')).toBe(false);
  });

  it('script bị từ chối vẫn hiện trên UI nhưng không chạy', () => {
    const script = normalizeRegexScript({ findRegex: '/(a+)+$/', scriptName: 'nguy hiểm' }, 0);
    expect(script.rejected).toBeDefined();
    expect(appliesTo(script, { placement: 1, target: 'prompt' })).toBe(false);

    const result = applyRegexScripts('aaaa', [script], { placement: 1, target: 'prompt' });
    expect(result.text).toBe('aaaa');
    expect(result.skipped[0]?.reason).toContain('quay lui thảm họa');
  });

  it('mẫu sai cú pháp bị đánh dấu thay vì làm crash', () => {
    expect(normalizeRegexScript({ findRegex: '/[/' }, 0).rejected).toContain('không hợp lệ');
  });
});

describe('regex — lọc theo ngữ cảnh', () => {
  const base = (patch: Partial<RegexScript>): RegexScript => ({
    id: 's',
    name: 's',
    enabled: true,
    findSource: 'x',
    flags: 'g',
    replace: '',
    trimStrings: [],
    placements: [],
    minDepth: null,
    maxDepth: null,
    markdownOnly: false,
    promptOnly: false,
    substituteRegex: false,
    ...patch,
  });

  it('promptOnly chỉ chạy khi gửi lên AI', () => {
    const script = base({ promptOnly: true });
    expect(appliesTo(script, { placement: 2, target: 'prompt' })).toBe(true);
    expect(appliesTo(script, { placement: 2, target: 'display' })).toBe(false);
  });

  it('markdownOnly chỉ chạy khi hiển thị', () => {
    const script = base({ markdownOnly: true });
    expect(appliesTo(script, { placement: 2, target: 'display' })).toBe(true);
    expect(appliesTo(script, { placement: 2, target: 'prompt' })).toBe(false);
  });

  it('lọc theo placement: 1 người dùng, 2 AI, 3 lệnh, 5 lorebook', () => {
    const script = base({ placements: [2] });
    expect(appliesTo(script, { placement: 2, target: 'prompt' })).toBe(true);
    expect(appliesTo(script, { placement: 1, target: 'prompt' })).toBe(false);
    expect(appliesTo(script, { placement: 5, target: 'prompt' })).toBe(false);
  });

  it('lọc theo minDepth / maxDepth', () => {
    const script = base({ minDepth: 1, maxDepth: 3 });
    expect(appliesTo(script, { placement: 1, target: 'prompt', depth: 0 })).toBe(false);
    expect(appliesTo(script, { placement: 1, target: 'prompt', depth: 2 })).toBe(true);
    expect(appliesTo(script, { placement: 1, target: 'prompt', depth: 9 })).toBe(false);
  });

  it('script bị tắt thì không chạy', () => {
    expect(appliesTo(base({ enabled: false }), { placement: 1, target: 'prompt' })).toBe(false);
  });
});

describe('regex — hai việc thật mà file mẫu cần', () => {
  const cutThinking = normalizeRegexScript(
    {
      id: 'cut',
      findRegex: '/<thinking>[\\s\\S]*?<\\/thinking>/g',
      replaceString: '',
      placement: [2],
      promptOnly: true,
    },
    0,
  );
  const wrapThinking = normalizeRegexScript(
    {
      id: 'wrap',
      findRegex: '/<thinking>([\\s\\S]*?)<\\/thinking>/g',
      replaceString: '<div class="tu-duy">$1</div>',
      placement: [2],
      markdownOnly: true,
    },
    1,
  );

  const source = 'Trước.<thinking>suy nghĩ nội bộ</thinking>Sau.';

  it('cắt khối <thinking> khỏi cái GỬI LÊN AI', () => {
    const result = applyRegexScripts(source, [cutThinking, wrapThinking], {
      placement: 2,
      target: 'prompt',
    });
    expect(result.text).toBe('Trước.Sau.');
    expect(result.applied).toEqual(['cut']);
  });

  it('bọc khối <thinking> bằng CSS ở cái HIỂN THỊ', () => {
    const result = applyRegexScripts(source, [cutThinking, wrapThinking], {
      placement: 2,
      target: 'display',
    });
    expect(result.text).toBe('Trước.<div class="tu-duy">suy nghĩ nội bộ</div>Sau.');
    expect(result.applied).toEqual(['wrap']);
  });

  it('áp dụng trimStrings sau khi thay', () => {
    const script = normalizeRegexScript(
      { id: 't', findRegex: '/a/g', replaceString: 'b', trimStrings: ['XX'] },
      0,
    );
    expect(applyRegexScripts('aXXa', [script], { placement: 1, target: 'prompt' }).text).toBe('bb');
  });

  it('mẫu không có cờ g chỉ thay lần đầu, đúng như tác giả viết', () => {
    const script = normalizeRegexScript({ id: 't', findRegex: 'a', replaceString: 'b' }, 0);
    expect(applyRegexScripts('aaa', [script], { placement: 1, target: 'prompt' }).text).toBe('baa');
  });
});

describe('regex — ngân sách thời gian', () => {
  it('bỏ qua script còn lại khi hết ngân sách, thay vì để UI đứng', () => {
    const scripts = Array.from({ length: 3 }, (_, index) =>
      normalizeRegexScript({ id: `s${index}`, findRegex: 'a', replaceString: 'b' }, index),
    );
    const result = applyRegexScripts('aaa', scripts, { placement: 1, target: 'prompt' }, 0);
    expect(result.applied).toHaveLength(0);
    expect(result.skipped).toHaveLength(3);
    expect(result.skipped[0]?.reason).toContain('Hết ngân sách');
  });
});

// ---------------------------------------------------------------------------
// tavern_helper (mục 6.8)
// ---------------------------------------------------------------------------

describe('script — phân loại theo NHIỆM VỤ, không theo mức tin cậy', () => {
  it('script đụng DOM là loại UI — đẩy vào Worker là giết nó', () => {
    expect(classifyScript({ content: "document.querySelector('.x')" }).kind).toBe('ui');
    expect(classifyScript({ content: 'el.innerHTML = "<b>x</b>"' }).kind).toBe('ui');
    expect(classifyScript({ content: 'node.style.color = "red"' }).kind).toBe('ui');
    expect(classifyScript({ content: 'window.addEventListener("x", f)' }).kind).toBe('ui');
    expect(classifyScript({ content: 'registerRenderHook(fn)' }).kind).toBe('ui');
  });

  it('cờ khai báo tay thắng mọi suy đoán', () => {
    const result = classifyScript({ content: 'return 1 + 1;', runsOnMainThread: true });
    expect(result.kind).toBe('ui');
    expect(result.reason).toContain('runsOnMainThread');
  });

  it('script biến đổi dữ liệu thuần là loại tính toán', () => {
    const result = classifyScript({ content: 'return api.state.meta.turn * 2;' });
    expect(result.kind).toBe('compute');
    expect(result.reason).toContain('hủy được');
  });
});

describe('script — chạy trên luồng chính, cách ly lỗi từng cái', () => {
  let host: ScriptHost;

  const uiScript = (id: string, code: string): HelperScript => ({
    id,
    name: id,
    enabled: true,
    kind: 'ui',
    code,
    kindReason: 'test',
  });

  beforeEach(() => {
    host = new ScriptHost();
  });

  it('một script lỗi thì tắt riêng nó, phần còn lại vẫn chạy', async () => {
    host.load([
      uiScript('hong', 'throw new Error("vỡ");'),
      uiScript('lanh-lan', 'return "ổn";'),
    ]);

    const runs = await host.runAll({ meta: { turn: 1 } });
    expect(runs).toHaveLength(2);
    expect(runs[0]?.ok).toBe(false);
    expect(runs[0]?.error).toContain('vỡ');
    expect(runs[1]?.ok).toBe(true);
    expect(runs[1]?.value).toBe('ổn');
  });

  it('ghi log kèm TÊN script, tách khỏi console trình duyệt', async () => {
    host.load([uiScript('ke-chuyen', 'api.log("đang chạy"); return null;')]);
    await host.runAll({});

    const logs = host.logs();
    expect(logs[0]?.scriptName).toBe('ke-chuyen');
    expect(logs[0]?.args.join(' ')).toContain('đang chạy');
  });

  it('đo thời gian chạy từng script mỗi lượt', async () => {
    host.load([uiScript('nhanh', 'return 1;')]);
    const runs = await host.runAll({});
    expect(runs[0]?.elapsedMs).toBeGreaterThanOrEqual(0);
    expect(host.lastRuns()).toHaveLength(1);
  });

  it('script đọc được state tự do', async () => {
    host.load([uiScript('doc', 'return api.state.meta.turn;')]);
    const runs = await host.runAll({ meta: { turn: 42 } });
    expect(runs[0]?.value).toBe(42);
  });

  it('script GHI vào state không có tác dụng — chỉ PatchOp mới đổi được', async () => {
    const state = { meta: { turn: 1 } };
    host.load([
      uiScript('ghi-lau', 'api.state.meta.turn = 999; return [{path:"meta.turn",op:"set",value:2}];'),
    ]);

    const runs = await host.runAll(structuredClone(state));
    // Bản state thật không đổi; script chỉ đề xuất qua PatchOp.
    expect(state.meta.turn).toBe(1);
    expect(runs[0]?.value).toEqual([{ path: 'meta.turn', op: 'set', value: 2 }]);
  });

  it('script tắt thì không chạy', async () => {
    host.load([{ ...uiScript('tat', 'return 1;'), enabled: false }]);
    expect(await host.runAll({})).toHaveLength(0);
  });

  it('nút "Dừng mọi script" chặn mọi lượt chạy sau đó', async () => {
    host.load([uiScript('a', 'return 1;')]);
    host.stopAll();
    expect(host.stopped).toBe(true);
    expect(await host.runAll({})).toHaveLength(0);

    host.resume();
    expect(await host.runAll({})).toHaveLength(1);
  });

  it('nút "Chạy thử" chạy đúng một script với state hiện tại', async () => {
    host.load([uiScript('a', 'return 1;'), uiScript('b', 'return 2;')]);
    const run = await host.runOne('b', {});
    expect(run.scriptId).toBe('b');
    expect(run.value).toBe(2);
  });

  it('loại tính toán không chạy được khi môi trường không có Worker, và nói rõ', async () => {
    host.load([{ ...uiScript('tinh', 'return 1;'), kind: 'compute' }]);
    const runs = await host.runAll({});
    expect(runs[0]?.ok).toBe(false);
    expect(runs[0]?.error).toContain('Worker');
  });
});

describe('script — khai báo kiểu xuất ra .d.ts', () => {
  it('nói rõ state chỉ đọc và PatchOp là đường ghi duy nhất', () => {
    expect(SCRIPT_API_DTS).toContain('readonly state');
    expect(SCRIPT_API_DTS).toContain('PatchOp');
    expect(SCRIPT_API_DTS).toContain('KHÔNG có tác dụng');
  });
});
