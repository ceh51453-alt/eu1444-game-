/**
 * Bài test của Phần 3.
 *
 * Bài quan trọng nhất nằm ở cuối: mục 12.9 — TURN LOOP CHẠY THÔNG. Đó là cột
 * mốc lớn nhất của cả giai đoạn A, nên nó được viết như một lượt chơi thật:
 * hành động giả → engine tung xúc sắc → prompt lắp từ bộ khối mặc định →
 * "model" trả về narrative kèm khối UpdateVariable → MVU của Phần 2 apply.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { ConnCfg, LLMProvider, LLMRequest, LLMResponse } from './provider';
import {
  BLOCK_SPECS,
  LOCKED_BLOCK_IDS,
  checkBlockOrder,
  defaultBlocks,
  duplicateBlock,
  moveBlock,
  parseBundle,
  removeBlock,
  restoreDefault,
  serializeBlocks,
  sortBlocks,
  toggleBlock,
  updateBlock,
} from './blocks';
import { DEFAULT_BUDGET, estimateTokens, trimToBudget, type CountedBlock } from './budget';
import { TemplateWriteError, evaluateCondition, readonlyState, renderTemplate } from './ejs';
import { createMacroContext, expandMacros, macroRng, resetScratch } from './macros';
import { assemblePrompt, emptyPromptInput, runTurn } from './pipeline';
import { MAX_REPAIR_ATTEMPTS } from '@/state/repair';
import { registerGameSlices } from '@/state/register';
import { slices, type GameState } from '@/state/slices';
import { createInitialState } from '@/state/store';
import { createRng } from '@/core/rng';
import { TIER_LABELS, runCheck } from '@/systems/check';

beforeEach(() => {
  if (slices.get('character') === undefined) registerGameSlices();
});

function freshState(): GameState {
  if (slices.get('character') === undefined) registerGameSlices();
  return createInitialState('hat-giong-thu', 'Aldric');
}

// ---------------------------------------------------------------------------
// Mục 5 + 6 — engine template
// ---------------------------------------------------------------------------

describe('EJS (mục 5, 6)', () => {
  it('giữ nguyên ba thẻ của EJS và không escape HTML', () => {
    const result = renderTemplate(
      `<% const ten = 'Bá tước "Reinhard"'; %><%= ten %>|<%- ten %>`,
      {},
    );
    expect(result.error).toBeNull();
    // Escape HTML sẽ biến dấu nháy thành &quot; và phá luôn khung ╔ của khối 6A.
    expect(result.text).toBe('Bá tước "Reinhard"|Bá tước "Reinhard"');
  });

  it('giá trị rỗng in ra chuỗi rỗng, không in chữ "undefined"', () => {
    expect(renderTemplate('[<%= khong %>]', { khong: undefined }).text).toBe('[]');
  });

  it('template hỏng KHÔNG ném — khối bị bỏ qua, lượt vẫn chạy tiếp', () => {
    const result = renderTemplate('<%= thieu_ngoac', {});
    expect(result.text).toBe('');
    expect(result.error).not.toBeNull();
  });

  it('ghi vào state từ template là ném ngay', () => {
    const state = readonlyState({ character: { stats: { hp: 20 } } });
    expect(() => {
      state.character.stats.hp = 1;
    }).toThrow(TemplateWriteError);
  });

  it('cắt template chạy quá lâu thay vì treo game', () => {
    const result = renderTemplate('<% while (true) { } %>', {});
    expect(result.error?.kind).toBe('qua-gio');
    expect(result.elapsedMs).toBeLessThan(2000);
  });

  it('vòng for(;;) không thoát cũng bị cắt', () => {
    expect(renderTemplate('<% for (;;) { } %>', {}).error?.kind).toBe('qua-gio');
  });

  it('vòng lặp bình thường vẫn chạy đủ', () => {
    const result = renderTemplate('<% for (let i = 0; i < 3; i++) { %>[<%= i %>]<% } %>', {});
    expect(result.text).toBe('[0][1][2]');
  });

  it('condition hỏng bị coi là sai, không phải đúng', () => {
    expect(evaluateCondition('khong_ton_tai.length > 0', {}).value).toBe(false);
    expect(evaluateCondition('so > 2', { so: 5 }).value).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Mục 7 — macro
// ---------------------------------------------------------------------------

describe('macro (mục 7)', () => {
  function context() {
    return createMacroContext({
      gameDate: { year: 1444, month: 3, day: 12, hour: 9 },
      user: 'Aldric',
      char: 'Eleanor',
      rng: macroRng('hat-giong-thu', 1),
      readState: (path) => (path === 'character.stats.str' ? 10 : undefined),
    });
  }

  it('setvar/getvar chạy trong không gian NHÁP, không chạm state', () => {
    const macros = context();
    const first = expandMacros('{{setvar::ngonngu::vi}}A', macros, 'khoi-1');
    const second = expandMacros('B<%= 1 %>{{getvar::ngonngu}}', macros, 'khoi-13');

    expect(first.text).toBe('A');
    // Phạm vi nháp là TOÀN BỘ prompt: ghi ở khối đầu, đọc được ở khối cuối.
    expect(second.text).toBe('B<%= 1 %>vi');
  });

  it('nháp bị dọn sạch mỗi lần lắp prompt', () => {
    const macros = context();
    expandMacros('{{setvar::x::1}}', macros, 'k');
    resetScratch(macros);
    expect(expandMacros('{{getvar::x}}', macros, 'k').text).toBe('');
  });

  it('đọc state game phải có tiền tố @state.', () => {
    const macros = context();
    expect(expandMacros('{{getvar::@state.character.stats.str}}', macros, 'k').text).toBe('10');
  });

  it('ghi vào state từ macro là LỖI CỨNG', () => {
    const result = expandMacros('{{setvar::@state.character.stats.hp::1}}', context(), 'k');
    expect(result.text).toBe('');
    expect(result.issues[0]?.level).toBe('loi');
    expect(result.issues[0]?.message).toContain('UpdateVariable');
  });

  it('ngẫu nhiên dùng seeded RNG và CACHE theo lượt', () => {
    const macros = context();
    const template = '{{roll:2d6+1}}/{{roll:2d6+1}}';
    const first = expandMacros(template, macros, 'khoi-8').text;

    // Render lại trong cùng một lượt (vòng sửa lỗi của Phần 2) phải ra y hệt.
    const again = expandMacros(template, macros, 'khoi-8').text;
    expect(again).toBe(first);

    // Hai lần xuất hiện trong cùng khối vẫn là hai lần tung khác nhau.
    expect(first.split('/')).toHaveLength(2);
  });

  it('cùng seed cùng lượt cho ra cùng kết quả (R3)', () => {
    const a = expandMacros('{{random:a,b,c,d,e}}', context(), 'k').text;
    const b = expandMacros('{{random:a,b,c,d,e}}', context(), 'k').text;
    expect(a).toBe(b);
  });

  it('macro lồng nhau chỉ chạy khi MacroNest bật', () => {
    const off = createMacroContext({ gameDate: { year: 1444, month: 1, day: 1, hour: 6 }, user: 'Aldric' });
    off.scratch.set('ten', '{{user}}');
    expect(expandMacros('{{getvar::ten}}', off, 'k').text).toBe('{{user}}');

    const on = createMacroContext({
      gameDate: { year: 1444, month: 1, day: 1, hour: 6 },
      user: 'Aldric',
      nest: true,
    });
    on.scratch.set('ten', '{{user}}');
    expect(expandMacros('{{getvar::ten}}', on, 'k').text).toBe('Aldric');
  });
});

// ---------------------------------------------------------------------------
// Mục 3 + 4 — bộ khối
// ---------------------------------------------------------------------------

describe('khối prompt (mục 3, 4)', () => {
  it('nạp đủ 17 khối mặc định từ /prompts', () => {
    const blocks = defaultBlocks();
    expect(blocks).toHaveLength(17);
    expect(blocks.every((block) => block.template.trim() !== '')).toBe(true);
    // Khối 14 KHÔNG có trong bảng của mục 4: nó là cửa từ truyện vào minigame
    // (`/src/systems/encounter`), thêm sau khi Phần 9–11 đã xong.
    expect(BLOCK_SPECS.map((spec) => spec.docNumber)).toEqual([
      '1', '2', '3', '4', '5', '6A', '7', '14', '8', '15', '9', '6B', '16', '10', '11', '12', '13',
    ]);
  });

  it('khối quân đội dựng được lệnh điều quân của chiến đồ mà không nổ template', () => {
    const template = defaultBlocks().find((block) => block.id === 'quan-doi')?.template ?? '';
    expect(template).not.toBe('');

    const army = {
      total: 900,
      land: 900,
      navy: 0,
      armies: 1,
      fleets: 0,
      morale: 60,
      experience: 20,
      training: 40,
      manpowerFree: 100,
      logisticsFree: 100,
      barracks: 1,
      recruitment: [],
      recruitable: [],
      chienDo: [
        { id: 'army_1', name: 'Đạo quân thứ nhất', where: 'Huyện Beaulieu', stance: 'hanh-quan', heading: 'Thành Troyes', daysLeft: 9 },
        { id: 'army_2', name: 'Đạo quân thứ hai', where: 'Thành Ehrenfeld', stance: 'vay-thanh', heading: '', daysLeft: 0 },
      ],
    };
    const rendered = renderTemplate(template, {
      q: { army: () => army },
      fmt: { approx: (value: number) => String(value), list: (rows: string[]) => rows.join(', '), table: () => '' },
    });

    expect(rendered.error).toBeNull();
    // Hai câu này là hợp đồng với người kể chuyện: quân đang đi thì nói rõ còn
    // mấy ngày, và không được kể nó đã tới nơi.
    expect(rendered.text).toContain('đang hành quân');
    expect(rendered.text).toContain('còn chừng 9 ngày');
    expect(rendered.text).toContain('<DieuQuan');
    expect(rendered.text).toContain('KHÔNG BAO GIỜ DỊCH CHUYỂN TỨC THỜI');
  });

  it('bộ mặc định thỏa mọi bất biến về vị trí', () => {
    expect(checkBlockOrder(defaultBlocks())).toEqual([]);
  });

  it('khối 6A và 6B cách nhau ít nhất 3 khối (Phụ lục A mục 7)', () => {
    const blocks = sortBlocks(defaultBlocks());
    const holding = blocks.findIndex((block) => block.id === 'thanh-tri');
    const realm = blocks.findIndex((block) => block.id === 'lanh-tho');
    expect(realm - holding - 1).toBeGreaterThanOrEqual(3);
  });

  it('bốn khối [LOCKED] không tắt, không xóa, không kéo được', () => {
    const blocks = defaultBlocks();
    expect(LOCKED_BLOCK_IDS).toHaveLength(4);

    for (const id of LOCKED_BLOCK_IDS) {
      expect(toggleBlock(blocks, id, false).find((block) => block.id === id)?.enabled).toBe(true);
      expect(removeBlock(blocks, id)).toHaveLength(blocks.length);
      expect(moveBlock(blocks, id, 0).refused).not.toBeNull();
    }
  });

  it('không thả được khối thường vào chỗ của khối [LOCKED]', () => {
    const blocks = defaultBlocks();
    const locked = sortBlocks(blocks).findIndex((block) => block.id === 'dinh-dang-dau-ra');
    expect(moveBlock(blocks, 'vai-tro', locked).refused).not.toBeNull();
  });

  it('kéo thả hợp lệ thì đổi thứ tự và đánh số lại', () => {
    const moved = moveBlock(defaultBlocks(), 'boi-canh', 4);
    expect(moved.refused).toBeNull();
    expect(sortBlocks(moved.blocks)[4]?.id).toBe('boi-canh');
    expect(moved.blocks.map((block) => block.order)).toEqual([...Array(17).keys()].map((i) => i + 1));
  });

  it('nhân bản ra khối không khóa, sửa được', () => {
    const blocks = duplicateBlock(defaultBlocks(), 'vai-tro');
    const copy = blocks.find((block) => block.id === 'vai-tro-2');
    expect(copy?.locked).toBe(false);
    expect(updateBlock(blocks, 'vai-tro-2', { template: 'xin chào' }).find((b) => b.id === 'vai-tro-2')?.template)
      .toBe('xin chào');
  });

  it('khôi phục mặc định lấy lại đúng nội dung file .ejs', () => {
    const edited = updateBlock(defaultBlocks(), 'vai-tro', { template: 'đã sửa' });
    const restored = restoreDefault(edited, 'vai-tro');
    expect(restored.find((block) => block.id === 'vai-tro')?.template).toBe(
      defaultBlocks().find((block) => block.id === 'vai-tro')?.template,
    );
  });

  it('export rồi import lại ra đúng bộ khối', () => {
    const blocks = defaultBlocks();
    const outcome = parseBundle(JSON.parse(serializeBlocks(blocks)) as unknown);
    expect(outcome.issues).toEqual([]);
    expect(outcome.blocks.map((block) => block.id)).toEqual(sortBlocks(blocks).map((block) => block.id));
  });

  it('file chia sẻ thiếu khối [LOCKED] thì được bù lại, không nạp im lặng', () => {
    const blocks = defaultBlocks().filter((block) => block.id !== 'dinh-dang-dau-ra');
    const outcome = parseBundle(JSON.parse(serializeBlocks(blocks)) as unknown);

    expect(outcome.blocks.some((block) => block.id === 'dinh-dang-dau-ra')).toBe(true);
    expect(outcome.issues.join(' ')).toContain('bù lại');
    expect(checkBlockOrder(outcome.blocks)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Mục 9 — ngân sách token
// ---------------------------------------------------------------------------

describe('ngân sách token (mục 9)', () => {
  const block = (id: string, priority: number, tokens: number): CountedBlock => ({
    id,
    name: id,
    priority,
    tokens,
  });

  it('ước lượng theo tiếng Việt chứ không theo tiếng Anh', () => {
    // 2.5 ký tự/token: 100 ký tự tiếng Việt ≈ 40 token, không phải 25.
    expect(estimateTokens('x'.repeat(100))).toBe(40);
  });

  it('cắt từ ưu tiên thấp lên, cùng ưu tiên thì cắt khối dài nhất trước', () => {
    const outcome = trimToBudget(
      [block('giu', 9, 100), block('dai', 4, 300), block('ngan', 4, 50), block('vua', 6, 100)],
      { total: 400, reserveForOutput: 0 },
    );
    // Cắt 'dai' (ưu tiên thấp nhất, dài nhất) là đủ về dưới ngưỡng — dừng ngay,
    // không cắt lây sang 'ngan' cùng hạng.
    expect(outcome.dropped.map((item) => item.block.id)).toEqual(['dai']);
    expect(outcome.kept.map((item) => item.id)).toEqual(['giu', 'ngan', 'vua']);
    expect(outcome.overflow).toBeNull();
  });

  it('khối ưu tiên 10 không bao giờ bị cắt, và vượt thì dừng hẳn', () => {
    const outcome = trimToBudget([block('locked', 10, 900), block('thuong', 5, 100)], {
      total: 500,
      reserveForOutput: 0,
    });
    expect(outcome.kept.map((item) => item.id)).toEqual(['locked']);
    expect(outcome.overflow).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Lắp prompt
// ---------------------------------------------------------------------------

describe('lắp prompt (mục 6, 7.3)', () => {
  it('bốn khối [LOCKED] luôn có mặt trong prompt đã lắp', async () => {
    const state = freshState();
    const prompt = await assemblePrompt(defaultBlocks(), {
      ...emptyPromptInput(state),
      action: { kind: 'freeform', text: 'đi tới chợ hỏi thăm về Eleanor' },
    });

    const kept = prompt.blocks.filter((block) => block.skipped === null).map((block) => block.id);
    for (const id of LOCKED_BLOCK_IDS) expect(kept, `thiếu ${id}`).toContain(id);
    expect(prompt.overflow).toBeNull();
  });

  it('khối có condition sai thì bị bỏ, không chèn dữ liệu giả vào prompt', async () => {
    const state = freshState();
    const prompt = await assemblePrompt(defaultBlocks(), emptyPromptInput(state));
    const skipped = (id: string) => prompt.blocks.find((block) => block.id === id)?.skipped;

    // Chưa có thành trì, chưa có lãnh thổ, chưa có thương tích, chưa có lịch sử.
    expect(skipped('thanh-tri')).toBe('condition sai');
    expect(skipped('lanh-tho')).toBe('condition sai');
    expect(skipped('thuong-tich')).toBe('condition sai');
    expect(skipped('lich-su-gan')).toBe('condition sai');
  });

  it('không khối nào lỗi template với state mặc định', async () => {
    const state = freshState();
    const prompt = await assemblePrompt(defaultBlocks(), {
      ...emptyPromptInput(state),
      action: { kind: 'freeform', text: 'thử' },
    });
    const broken = prompt.blocks.filter((block) => block.error !== null);
    expect(broken.map((block) => `${block.id}: ${block.error?.message ?? ''}`)).toEqual([]);
  });

  it('khối 13 liệt kê đúng đường dẫn AI được ghi', async () => {
    const state = freshState();
    const prompt = await assemblePrompt(defaultBlocks(), emptyPromptInput(state));
    const syntax = prompt.blocks.find((block) => block.id === 'dinh-dang-dau-ra');

    expect(syntax?.text).toContain('character.relations.*');
    expect(syntax?.text).toContain('character.stats.*');
    // `meta.seed` là locked — phải nằm ở danh sách cấm, không nằm ở danh sách ghi được.
    expect(syntax?.text).toContain('meta.seed');
  });

  it('tin nhắn đầu tiên luôn là user, và hai user liền nhau được gộp', async () => {
    const state = freshState();
    const prompt = await assemblePrompt(defaultBlocks(), {
      ...emptyPromptInput(state),
      action: { kind: 'freeform', text: 'gõ cửa nhà thợ rèn' },
      history: [
        {
          turn: 1,
          gameDate: state.meta.gameDate,
          action: 'vào thành',
          narrative: 'Cổng thành mở ra trước mặt ngài.',
          outcome: '',
        },
      ],
    });

    expect(prompt.messages[0]?.role).toBe('user');
    expect(prompt.messages).toHaveLength(1);
    expect(prompt.messages[0]?.content).toContain('gõ cửa nhà thợ rèn');
    expect(prompt.messages[0]?.content).toContain('Cổng thành mở ra');
  });

  it('khối 11 in đủ bốn hệ, điều chỉnh, hệ quả và câu mệnh lệnh (Phần 5 mục 10)', async () => {
    const state = freshState();
    const rng = createRng('khoi-11');
    const checks = [
      runCheck(rng, {
        id: 'check.thuyet-phuc',
        system: 'd100',
        domain: 'social.dam-phan',
        difficulty: 'kho',
        base: 55,
      }).result,
      runCheck(rng, { id: 'check.ne-don', system: 'd20', domain: 'combat.ne', difficulty: 'thuong', base: 3 })
        .result,
      runCheck(rng, {
        id: 'check.xay-tuong',
        system: '3d6',
        domain: 'admin.xay-dung',
        difficulty: 'thuong',
        base: 12,
      }).result,
      runCheck(rng, {
        id: 'check.xung-phong',
        system: 'pool',
        domain: 'combat.xung-phong',
        difficulty: 'kho',
        base: 10,
      }).result,
    ];

    const prompt = await assemblePrompt(defaultBlocks(), {
      ...emptyPromptInput(state),
      action: { kind: 'freeform', text: 'thuyết phục Bá tước Reinhard cho mượn quân' },
      roll: { checks, timeCost: 30, notes: [] },
    });

    const block = prompt.blocks.find((candidate) => candidate.id === 'ket-qua-xuc-sac');
    expect(block?.error).toBeNull();
    expect(block?.skipped).toBeNull();

    const text = block?.text ?? '';
    expect(text).toContain('KẾT QUẢ ĐÃ ĐƯỢC QUYẾT ĐỊNH');
    expect(text).toContain('thuyết phục Bá tước Reinhard');
    // Mục 2: người chơi — và model — luôn phải thấy hệ nào đang chạy.
    expect(text).toContain('d100 tung-dưới');
    expect(text).toContain('d20 + chỉ số vs DC');
    expect(text).toContain('3d6 tung-dưới');
    expect(text).toContain('dice pool d6');
    expect(text).toContain('Độ khó Khó');

    for (const check of checks) {
      expect(text).toContain(TIER_LABELS[check.tier]);
      // `narrativeHint` do engine sinh, phải đi nguyên vẹn vào prompt (mục 10).
      for (const line of check.narrativeHint.split('\n')) expect(text).toContain(line);
      if (check.consequence !== undefined) expect(text).toContain(check.consequence.text);
    }

    console.log(`\n${'='.repeat(70)}\n${text}\n${'='.repeat(70)}`);
  });

  it('in ra prompt hoàn chỉnh để đối chiếu bằng mắt', async () => {
    const state = freshState();
    const prompt = await assemblePrompt(defaultBlocks(), {
      ...emptyPromptInput(state),
      action: { kind: 'freeform', text: 'hỏi thăm người bán muối về tin tức từ kinh thành' },
      scene: {
        place: 'chợ phiên ngoài cổng nam thành Ehrenfeld',
        npcs: [{ id: 'npc_eleanor', name: 'Eleanor', role: 'người bán muối' }],
        weather: 'mưa phùn, gió bấc',
        timeOfDay: 'gần trưa',
        notes: [],
      },
    });

    console.log(`\n${'='.repeat(70)}\n${prompt.preview}\n${'='.repeat(70)}`);
    console.log(`tổng ${prompt.tokens} token / ngân sách ${prompt.limit}`);
    expect(prompt.tokens).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Mục 12.9 — TURN LOOP CHẠY THÔNG
// ---------------------------------------------------------------------------

/** Provider giả: trả về đúng thứ một model thật trả về, không gọi mạng. */
function fakeProvider(replies: string[]): LLMProvider {
  const queue = [...replies];
  return {
    id: 'openai',
    label: 'giả lập',
    paramSchema: z.object({}).loose(),
    defaultParams: {},
    paramSpecs: [],
    unsupportedParams: () => [],
    warnings: () => [],
    sanitizeParams: (params) => ({ params, removed: [] }),
    listModels: async () => [],
    async stream(_req: LLMRequest, _cfg: ConnCfg, onChunk: (text: string) => void): Promise<LLMResponse> {
      const text = queue.shift() ?? '';
      onChunk(text);
      return { text, raw: text };
    },
  };
}

const FAKE_CFG: ConnCfg = {
  providerId: 'openai',
  baseUrl: 'https://vi-du',
  password: '',
  model: 'gia-lap',
  params: {},
  timeoutMs: 1000,
};

describe('turn loop đầu-cuối (mục 12.9)', () => {
  it('một lượt chạy trọn: xúc sắc → prompt → model → MVU apply', async () => {
    const state = freshState();
    const reply = [
      'Người bán muối ngẩng lên khi ngài tới gần, tay vẫn xúc muối vào đấu gỗ.',
      'Bà ta kể chuyện kinh thành bằng giọng của người đã kể nó mười lần trong buổi sáng.',
      '',
      '<UpdateVariable>',
      "_.set('character.relations.eleanor', null, { \"trust\": 8, \"note\": \"nàng nhớ mặt ngài\" });//ngài mua muối và hỏi chuyện tử tế",
      "_.push('character.notes.rumors', 'Giáo hoàng sắp ra sắc chỉ về thuế muối');//nghe lỏm ngoài chợ",
      '</UpdateVariable>',
    ].join('\n');

    let streamed = '';
    const result = await runTurn(
      state,
      { kind: 'freeform', text: 'hỏi thăm người bán muối về tin tức từ kinh thành' },
      {
        provider: fakeProvider([reply]),
        cfg: FAKE_CFG,
        blocks: defaultBlocks(),
        budget: DEFAULT_BUDGET,
        charName: 'Eleanor',
        onChunk: (chunk) => {
          streamed += chunk;
        },
      },
    );

    // Bước 2 chạy trước bước 4 — kết quả xúc sắc đã có trong prompt (R1).
    expect(result.prompt.system).toContain('KẾT QUẢ ĐÃ ĐƯỢC QUYẾT ĐỊNH');
    expect(streamed).not.toBe('');

    // Bước 5: narrative sạch, không còn khối kỹ thuật.
    expect(result.narrative).toContain('Người bán muối');
    expect(result.narrative).not.toContain('UpdateVariable');

    // Bước 6: MVU apply cả lô.
    expect(result.error).toBeNull();
    expect(result.ops).toHaveLength(2);
    expect(result.patch?.applied).toBe(true);

    const next = result.nextState;
    expect(next).not.toBeNull();
    const character = next?.['character'] as { relations: Record<string, { trust: number }>; notes: { rumors: string[] } };
    expect(character.relations['eleanor']?.trust).toBe(8);
    expect(character.notes.rumors).toHaveLength(1);

    // Bước 7: biến phụ tính lại.
    expect(result.derived['combatPower']).toBeGreaterThan(0);
    expect(result.reachedStep).toBe('derive');
  });

  it('lô sai bị từ chối, AI được nhờ sửa, sửa xong thì apply (Phần 2 mục 6)', async () => {
    const state = freshState();
    const sai = [
      'Ngài rút kiếm.',
      '<UpdateVariable>',
      "_.set('character.stats.hp', 20, 12);//bị đâm một nhát",
      '</UpdateVariable>',
    ].join('\n');
    const dung = [
      '<UpdateVariable>',
      "_.push('character.flags', 'da_rut_kiem');//ngài đã rút kiếm giữa chợ",
      '</UpdateVariable>',
    ].join('\n');

    const result = await runTurn(
      state,
      { kind: 'freeform', text: 'rút kiếm' },
      { provider: fakeProvider([sai, dung]), cfg: FAKE_CFG, blocks: defaultBlocks() },
    );

    expect(result.repair?.repaired).toBe(true);
    expect(result.patch?.applied).toBe(true);
    const character = result.nextState?.['character'] as { flags: string[] };
    expect(character.flags).toEqual(['da_rut_kiem']);
  });

  it('AI sửa hai lần vẫn hỏng thì giao đủ dữ liệu cho modal tầng 2 (Phần 2 mục 6)', async () => {
    const state = freshState();
    const sai = [
      'Ngài với tay lấy túi tiền.',
      '<UpdateVariable>',
      "_.set('character.stats.hp', 20, 12);//bị đâm một nhát",
      '</UpdateVariable>',
    ].join('\n');

    // Ba lần cùng một lỗi: lần đầu + hai lần sửa của tầng 1.
    const result = await runTurn(
      state,
      { kind: 'freeform', text: 'lấy túi tiền' },
      { provider: fakeProvider([sai, sai, sai]), cfg: FAKE_CFG, blocks: defaultBlocks() },
    );

    expect(result.repair?.repaired).toBe(false);
    expect(result.repair?.attempts).toHaveLength(MAX_REPAIR_ATTEMPTS);
    // Lô của AI KHÔNG được lọt vào state. `nextState` vẫn có thể khác null vì
    // engine đã tự ghi phần của mình trước lời gọi AI (điểm rèn luyện của Phần
    // 8, vòng cơ thể của Phần 7) — thứ phải giữ nguyên là ô mà AI vừa đòi sửa.
    expect(result.patch?.applied).toBe(false);
    expect((result.nextState?.['character'] as { stats: { hp: number } } | undefined)?.stats.hp ?? 20).toBe(20);

    // Đây đúng là ba thứ modal cần: lô op, lỗi còn lại, và state để đối chiếu.
    expect(result.repair?.ops).toHaveLength(1);
    expect(result.repair?.final.failures[0]?.step).toBe('B2');
    expect(result.repair?.final.failures[0]?.message).toContain('engine');
  });

  it('mỗi lượt sinh một biên bản đầy đủ cho bước 10 (Phần 0 mục 6)', async () => {
    const state = freshState();
    const rngBefore = structuredClone(state.meta.rng);

    const result = await runTurn(
      state,
      { kind: 'freeform', text: 'trèo tường' },
      {
        provider: fakeProvider([
          "Ngài bám mép đá.\n<UpdateVariable>\n_.push('character.flags', 'da_treo_tuong');//ngài trèo tường\n</UpdateVariable>",
        ]),
        cfg: FAKE_CFG,
        blocks: defaultBlocks(),
      },
    );

    const record = result.record;
    expect(record.turn).toBe(state.meta.turn + 1);
    expect(record.input.text).toBe('trèo tường');
    expect(record.narrative).toContain('mép đá');
    expect(record.patch.applied).toBe(true);
    expect(record.patch.opCount).toBe(1);
    expect(record.reachedStep).toBe('derive');
    // Undo tua về ĐÂY, nên `rngBefore` phải là vị trí TRƯỚC khi bước 2 rút (R3).
    expect(record.rngBefore).toEqual(rngBefore);
    expect(record.outcome.rngAfter).not.toEqual(rngBefore);
    expect(record.outcome.checks).toHaveLength(1);
  });

  it('lượt hỏng ở bước call vẫn có biên bản, chỉ khác reachedStep', async () => {
    const state = freshState();
    const broken: LLMProvider = {
      ...fakeProvider([]),
      stream: async () => {
        throw new Error('proxy 502');
      },
    };
    const result = await runTurn(
      state,
      { kind: 'freeform', text: 'đi tiếp' },
      { provider: broken, cfg: FAKE_CFG, blocks: defaultBlocks() },
    );

    expect(result.record.reachedStep).toBe('call');
    expect(result.record.patch.applied).toBe(false);
    expect(result.record.narrative).toBe('');
  });

  it('model không trả khối nào thì state giữ nguyên, không crash (R4)', async () => {
    const state = freshState();
    const result = await runTurn(
      state,
      { kind: 'freeform', text: 'nhìn quanh' },
      { provider: fakeProvider(['Chợ ồn ào như mọi buổi sáng.']), cfg: FAKE_CFG, blocks: defaultBlocks() },
    );

    expect(result.narrative).toContain('Chợ ồn ào');
    // Không có lô nào để áp, nên không có gì của AI lọt vào state. Engine thì
    // vẫn ghi phần của nó (điểm rèn luyện của Phần 8) — đó không phải "state
    // đổi vì AI", nên `patch` phải là null chứ không phải là một lô bị từ chối.
    expect(result.patch).toBeNull();
    expect(result.error).toContain('UpdateVariable');
  });

  it('gọi AI hỏng thì lượt dừng ở bước call và nói rõ vì sao', async () => {
    const state = freshState();
    const broken: LLMProvider = {
      ...fakeProvider([]),
      stream: async () => {
        throw new Error('proxy 502');
      },
    };
    const result = await runTurn(
      state,
      { kind: 'freeform', text: 'đi tiếp' },
      { provider: broken, cfg: FAKE_CFG, blocks: defaultBlocks() },
    );

    expect(result.reachedStep).toBe('call');
    expect(result.error).toContain('proxy 502');
    expect(result.narrative).toBe('');
    expect(result.patch).toBeNull();
    // Buổi tập vừa rồi ĐÃ xảy ra: xúc sắc tung xong trước khi proxy chết, nên
    // điểm rèn luyện của Phần 8 ở lại. Vứt nó đi vì một sự cố mạng là làm người
    // chơi quên mất thứ họ vừa học — cùng lý do vòng cơ thể của Phần 7 ở lại.
    expect(result.record.outcome.checks).toHaveLength(1);
  });

  it('cùng seed cùng hành động cho cùng kết quả xúc sắc (R3)', async () => {
    const run = async (): Promise<string> => {
      const result = await runTurn(
        freshState(),
        { kind: 'freeform', text: 'trèo tường' },
        { provider: fakeProvider(['Ngài bám lấy mép đá.']), cfg: FAKE_CFG, blocks: defaultBlocks() },
      );
      const dice = result.prompt.blocks.find((block) => block.id === 'ket-qua-xuc-sac');
      return dice?.text ?? '';
    };
    expect(await run()).toBe(await run());
  });
});

// ---------------------------------------------------------------------------
// Cửa từ truyện vào minigame (`/src/systems/encounter`)
// ---------------------------------------------------------------------------

describe('thẻ mời trận đánh đi qua vòng lặp lượt', () => {
  /** Nhân vật đã chốt — cửa kiểm duyệt thứ nhất của `screenEncounters`. */
  function playingState(): GameState {
    const state = freshState();
    const character = state['character'] as { identity: { finalized: boolean } };
    character.identity.finalized = true;
    return state;
  }

  it('bóc thẻ khỏi đoạn văn và giao lại một lời mời cho UI', async () => {
    const reply = [
      'Ser Aymer đứng dậy khỏi ghế, và tiếng ghế kéo trên đá làm cả sảnh im lại.',
      '<RequestDuel loai="dau-danh-du" doi-thu="Ser Aymer" trinh-do="hơn" noi="đại sảnh" cuoc="danh dự của nàng" />',
      '<UpdateVariable>',
      '</UpdateVariable>',
    ].join('\n');

    const result = await runTurn(
      playingState(),
      { kind: 'freeform', text: 'ngài đứng dậy đáp lời' },
      { provider: fakeProvider([reply]), cfg: FAKE_CFG, blocks: defaultBlocks() },
    );

    // Người chơi đọc truyện, không đọc thẻ.
    expect(result.narrative).not.toContain('RequestDuel');
    expect(result.narrative).toContain('Ser Aymer đứng dậy');

    // Và lời mời đi ra ngoài cho UI hỏi người chơi — KHÔNG tự mở minigame.
    expect(result.encounter).not.toBeNull();
    expect(result.encounter?.request.kindId).toBe('dau-danh-du');
    expect(result.encounter?.request.power).toBe('hon');
    expect(result.encounter?.title).toContain('Ser Aymer');
  });

  it('lượt không có thẻ nào thì không có lời mời nào', async () => {
    const result = await runTurn(
      playingState(),
      { kind: 'freeform', text: 'đi tiếp' },
      { provider: fakeProvider(['Con đường trống, và trời sắp mưa.']), cfg: FAKE_CFG, blocks: defaultBlocks() },
    );
    expect(result.encounter).toBeNull();
    expect(result.encounterIssues).toHaveLength(0);
  });

  it('chưa chốt nhân vật thì thẻ bị từ chối, và nói rõ vì sao', async () => {
    const result = await runTurn(
      freshState(),
      { kind: 'freeform', text: 'đi tiếp' },
      {
        provider: fakeProvider(['Hắn rút kiếm.\n<RequestDuel doi-thu="Ser Aymer" />']),
        cfg: FAKE_CFG,
        blocks: defaultBlocks(),
      },
    );
    expect(result.encounter).toBeNull();
    expect(result.encounterIssues[0]).toContain('chưa có nhân vật');
    // R4: lời mời hỏng không làm hỏng lượt — đoạn văn vẫn hiện ra.
    expect(result.narrative).toBe('Hắn rút kiếm.');
  });
});
