import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyPatch } from './mvu';
import { buildRepairPrompt, MAX_REPAIR_ATTEMPTS, repairPatch } from './repair';
import { registerGameSlices } from './register';
import { readPath, slices, type GameState } from './slices';
import { createInitialState } from './store';

function freshState(): GameState {
  return createInitialState('hat-giong-sua-loi', 'Aldric');
}

/** Lô op mà AI hay gửi sai: đòi tự trừ máu. */
function badBatch() {
  return applyPatch(
    freshState(),
    [
      { op: 'set' as const, path: 'character.stats.hp', from: 20, to: 12, reason: 'bị đâm', source: 'st' as const },
      {
        op: 'push' as const,
        path: 'character.flags',
        to: 'bi_thuong',
        reason: 'có vết thương',
        source: 'st' as const,
      },
    ],
    { actor: 'ai' },
  );
}

beforeEach(() => {
  slices.reset();
  registerGameSlices();
});

describe('vòng sửa lỗi — lời nhắc gửi cho AI', () => {
  it('nói rõ op nào sai và vì sao', () => {
    const prompt = buildRepairPrompt(badBatch().failures, freshState());
    expect(prompt).toContain("_.set('character.stats.hp'");
    expect(prompt).toContain("quyền 'engine'");
    expect(prompt).toContain('MÔ TẢ nó trong truyện');
  });

  it('kèm giá trị THẬT đang có, để AI hết cớ dùng state cũ', () => {
    const prompt = buildRepairPrompt(badBatch().failures, freshState());
    expect(prompt).toContain('GIÁ TRỊ THẬT ĐANG CÓ TRONG STATE:');
    expect(prompt).toContain('character.stats.hp = 20');
  });

  it('kèm trích đoạn schema và quyền ghi của path', () => {
    const prompt = buildRepairPrompt(badBatch().failures, freshState());
    expect(prompt).toContain('SCHEMA HỢP LỆ CỦA CÁC PATH TRÊN:');
    expect(prompt).toContain('quyền ghi: engine');
  });

  it('ra lệnh chỉ trả lại khối biến, KHÔNG viết lại truyện', () => {
    const prompt = buildRepairPrompt(badBatch().failures, freshState());
    expect(prompt).toContain('CHỈ trả lại khối <UpdateVariable> đã sửa');
    expect(prompt).toContain('KHÔNG viết lại truyện');
  });

  it('lời nhắc phải NGẮN — không kèm lại toàn bộ context', () => {
    const prompt = buildRepairPrompt(badBatch().failures, freshState());
    // Vài trăm ký tự, không phải vài chục nghìn: gửi lại cả ngữ cảnh là tốn
    // tiền cho đúng một việc sửa vài dòng biến.
    expect(prompt.length).toBeLessThan(2000);
    // Và không được chứa nguyên state.
    expect(prompt).not.toContain('rngState');
    expect(prompt).not.toContain('"streams"');
  });
});

describe('vòng sửa lỗi — tầng 1, tối đa 2 lần', () => {
  it('AI sửa đúng ngay lần đầu thì áp được', async () => {
    const state = freshState();
    const ask = vi.fn(async () =>
      "<UpdateVariable>_.push('character.flags', 'bi_thuong');//có vết thương</UpdateVariable>",
    );

    const outcome = await repairPatch({ state, failures: badBatch().failures, ask });

    expect(outcome.repaired).toBe(true);
    expect(ask).toHaveBeenCalledTimes(1);
    expect(readPath(outcome.final.next!, 'character.flags')).toEqual(['bi_thuong']);
    // Máu KHÔNG bị AI đụng vào.
    expect(readPath(outcome.final.next!, 'character.stats.hp')).toBe(20);
  });

  it('sai lần một, đúng lần hai', async () => {
    const state = freshState();
    let call = 0;
    const ask = vi.fn(async () => {
      call++;
      return call === 1
        ? "<UpdateVariable>_.set('character.stats.hp', 20, 12);//vẫn cố trừ máu</UpdateVariable>"
        : "<UpdateVariable>_.push('character.flags', 'bi_thuong');//có vết thương</UpdateVariable>";
    });

    const outcome = await repairPatch({ state, failures: badBatch().failures, ask });

    expect(outcome.repaired).toBe(true);
    expect(outcome.attempts).toHaveLength(2);
    expect(outcome.attempts[0]?.result.applied).toBe(false);
  });

  it('bỏ cuộc sau 2 lần và trả lỗi cuối để mở tầng 2', async () => {
    const ask = vi.fn(async () =>
      "<UpdateVariable>_.set('character.stats.hp', 20, 12);//vẫn cố trừ máu</UpdateVariable>",
    );

    const outcome = await repairPatch({ state: freshState(), failures: badBatch().failures, ask });

    expect(outcome.repaired).toBe(false);
    expect(ask).toHaveBeenCalledTimes(MAX_REPAIR_ATTEMPTS);
    expect(outcome.final.applied).toBe(false);
    expect(outcome.final.failures[0]?.step).toBe('B2');
  });

  it('lần sửa thứ hai dùng lỗi MỚI, không lặp lại lỗi cũ', async () => {
    const prompts: string[] = [];
    let call = 0;
    const ask = vi.fn(async (prompt: string) => {
      prompts.push(prompt);
      call++;
      // Lần một sửa được quyền nhưng lại sai kiểu.
      return call === 1
        ? "<UpdateVariable>_.push('character.flags', 12345);//cờ số</UpdateVariable>"
        : "<UpdateVariable>_.push('character.flags', 'bi_thuong');//có vết thương</UpdateVariable>";
    });

    await repairPatch({ state: freshState(), failures: badBatch().failures, ask });

    // Danh sách lỗi phải thay đổi giữa hai lần; phần luật chung thì giữ nguyên.
    expect(prompts[0]).toContain('LỖI (B2)');
    expect(prompts[0]).toContain('character.stats.hp');
    expect(prompts[1]).toContain('LỖI (B5)');
    expect(prompts[1]).not.toContain('LỖI (B2)');
    expect(prompts[1]).not.toContain('character.stats.hp = ');
  });

  it('AI trả về rỗng thì ghi lại và vẫn đủ 2 lần', async () => {
    const ask = vi.fn(async () => 'Xin lỗi, tôi không hiểu.');
    const outcome = await repairPatch({ state: freshState(), failures: badBatch().failures, ask });

    expect(outcome.repaired).toBe(false);
    expect(ask).toHaveBeenCalledTimes(2);
    expect(outcome.final.failures[0]?.message).toContain('không trả về op nào đọc được');
  });

  it('gọi AI hỏng thì dừng, không nuốt lỗi', async () => {
    const ask = vi.fn(async () => {
      throw new Error('proxy chết');
    });
    const outcome = await repairPatch({ state: freshState(), failures: badBatch().failures, ask });

    expect(outcome.repaired).toBe(false);
    expect(outcome.attempts).toHaveLength(1);
    expect(outcome.final.failures[0]?.message).toContain('proxy chết');
  });

  it('state gốc không đổi trong suốt vòng sửa lỗi', async () => {
    const state = freshState();
    const before = structuredClone(state);
    const ask = vi.fn(async () =>
      "<UpdateVariable>_.push('character.flags', 'bi_thuong');//có vết thương</UpdateVariable>",
    );

    await repairPatch({ state, failures: badBatch().failures, ask });
    expect(state).toEqual(before);
  });
});
