import { describe, expect, it } from 'vitest';
import { limitsOf } from '../providers/shared';
import { tuneFromPreset } from './params';
import type { SillyTavernPreset } from './schema';

/**
 * Tham số cấp cao nhất của preset "Tawa δέλτα" thật, đúng như trong file:
 * hai con số token khác nhau một cách rất dễ nhầm — 2.000.000 vào, 65.000 ra.
 */
const TAWA: SillyTavernPreset = {
  temperature: 1.1,
  frequency_penalty: 0,
  presence_penalty: 0,
  top_p: 0.9,
  top_k: 64,
  top_a: 0,
  min_p: 0,
  repetition_penalty: 1,
  openai_max_context: 2000000,
  openai_max_tokens: 65000,
  stream_openai: true,
  reasoning_effort: 'max',
  verbosity: 'auto',
  seed: -1,
  n: 1,
};

describe('tuneFromPreset — hai con số token không được lẫn vào nhau', () => {
  it('openai_max_tokens là TRẦN ĐẦU RA, openai_max_context là CỬA SỔ NGỮ CẢNH', () => {
    const tuning = tuneFromPreset(TAWA, 'openai');

    expect(tuning.tokens.input).toBe(2000000);
    expect(tuning.tokens.output).toBe(65000);
  });

  it('hạ trần đầu ra khi nó nuốt hết ngân sách prompt', () => {
    const tuning = tuneFromPreset({ openai_max_context: 8000, openai_max_tokens: 8000 }, 'openai');

    expect(tuning.tokens.output).toBe(4000);
    expect(tuning.ignored.join('\n')).toContain('đã hạ trần đầu ra');
  });
});

describe('tuneFromPreset — đổi tên theo từng chuẩn API', () => {
  it('OpenAI giữ nguyên tên', () => {
    const tuning = tuneFromPreset(TAWA, 'openai');

    expect(tuning.params['temperature']).toBe(1.1);
    expect(tuning.params['top_p']).toBe(0.9);
    expect(tuning.params['top_k']).toBe(64);
    expect(tuning.params['reasoning_effort']).toBe('max');
  });

  it('Gemini đổi sang topP/topK/maxOutputTokens và thinkingLevel', () => {
    const tuning = tuneFromPreset(TAWA, 'gemini');

    expect(tuning.params['topP']).toBe(0.9);
    expect(tuning.params['topK']).toBe(64);
    expect(tuning.tokens.output).toBe(65000);
    // reasoning_effort "max" không có ở Gemini — nó là thinkingLevel HIGH.
    expect(tuning.params['thinkingLevel']).toBe('HIGH');
    expect(tuning.params['top_p']).toBeUndefined();
  });

  it('Anthropic bỏ qua tham số nó không có, và ép temperature về miền hợp lệ', () => {
    const tuning = tuneFromPreset(TAWA, 'anthropic');

    // Anthropic chỉ nhận temperature ≤ 1; 1.1 của preset phải bị kẹp lại.
    expect(tuning.params['temperature']).toBe(1);
    expect(tuning.params['frequency_penalty']).toBeUndefined();
    expect(tuning.ignored.join('\n')).toContain('frequency_penalty');
  });
});

describe('tuneFromPreset — cái gì KHÔNG được gửi đi', () => {
  it('không bật tham số ngoài chuẩn khi preset để nguyên giá trị trung tính', () => {
    const tuning = tuneFromPreset(TAWA, 'openai');

    // min_p 0, top_a 0, repetition_penalty 1, n 1 đều là mặc định của SillyTavern.
    // Gửi chúng lên một proxy không hiểu là ăn 400 mà chẳng đổi lại được gì.
    expect(tuning.params['min_p']).toBeUndefined();
    expect(tuning.params['top_a']).toBeUndefined();
    expect(tuning.params['repetition_penalty']).toBeUndefined();
    expect(tuning.params['n']).toBeUndefined();
  });

  it('bật tham số ngoài chuẩn khi preset thật sự đặt nó', () => {
    const tuning = tuneFromPreset({ ...TAWA, min_p: 0.05 }, 'openai');
    expect(tuning.params['min_p']).toBe(0.05);
  });

  it('seed -1 nghĩa là ngẫu nhiên, không phải seed số -1', () => {
    const tuning = tuneFromPreset(TAWA, 'openai');
    expect(tuning.params['seed']).toBeUndefined();
    expect(tuning.ignored.join('\n')).toContain('seed: -1');
  });

  it('bỏ qua giá trị enum không nằm trong danh sách', () => {
    const tuning = tuneFromPreset(TAWA, 'openai');
    // verbosity "auto" không phải low/medium/high.
    expect(tuning.params['verbosity']).toBeUndefined();
    expect(tuning.ignored.join('\n')).toContain('verbosity');
  });
});

describe('tuneFromPreset — chế độ streaming', () => {
  it('đọc stream_openai', () => {
    expect(tuneFromPreset(TAWA, 'openai').stream).toBe(true);
    expect(tuneFromPreset({ ...TAWA, stream_openai: false }, 'openai').stream).toBe(false);
  });

  it('preset không nói gì thì giữ nguyên cài đặt cũ', () => {
    expect(tuneFromPreset({ temperature: 1 }, 'openai').stream).toBeUndefined();
  });
});

describe('limitsOf — đọc trần model từ GET /models', () => {
  it('OpenRouter: context_length + top_provider.max_completion_tokens', () => {
    expect(
      limitsOf({ context_length: 2000000, top_provider: { max_completion_tokens: 65000 } }),
    ).toEqual({ contextWindow: 2000000, maxOutput: 65000 });
  });

  it('max_tokens BẰNG cửa sổ ngữ cảnh là cửa sổ ngữ cảnh, không phải trần đầu ra', () => {
    // Đây chính là chỗ đẻ ra "trần đầu ra 2 triệu": nhiều proxy dùng `max_tokens`
    // để nói về cửa sổ ngữ cảnh. Nhận nó làm trần đầu ra là sai.
    expect(limitsOf({ context_length: 2000000, max_tokens: 2000000 })).toEqual({
      contextWindow: 2000000,
    });
  });

  it('max_tokens KHÁC cửa sổ ngữ cảnh thì mới là trần đầu ra', () => {
    expect(limitsOf({ context_length: 200000, max_tokens: 64000 })).toEqual({
      contextWindow: 200000,
      maxOutput: 64000,
    });
  });

  it('vLLM: max_model_len', () => {
    expect(limitsOf({ max_model_len: 32768 })).toEqual({ contextWindow: 32768 });
  });

  it('không có gì thì không đoán bừa', () => {
    expect(limitsOf({ id: 'model-la' })).toEqual({});
  });
});
