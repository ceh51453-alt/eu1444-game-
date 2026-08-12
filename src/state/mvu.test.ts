import { beforeEach, describe, expect, it } from 'vitest';
import {
  computeDerived,
  DerivedDepError,
  DerivedGraphError,
  derivedOrder,
  recomputeAll,
} from './derived';
import { applyPatch, deepEqual, type PatchOp } from './mvu';
import { parseUpdateBlock, parseUpdateVariables, stripUpdateBlocks } from './mvu-parse';
import { registerGameSlices } from './register';
import {
  canWrite,
  patternMatches,
  permissionFor,
  readPath,
  schemaAtPath,
  slices,
  SliceError,
  type GameState,
} from './slices';
import { createInitialState } from './store';

function freshState(): GameState {
  return createInitialState('hat-giong-phan-2', 'Aldric');
}

beforeEach(() => {
  slices.reset();
  registerGameSlices();
});

// ---------------------------------------------------------------------------
// Slice registry (mục 2)
// ---------------------------------------------------------------------------

describe('slice registry', () => {
  it('hợp nhất mọi slice thành root state, namespace theo id', () => {
    const state = freshState();
    // `knowledge` do Phần 4 đăng ký thêm, `body` do Phần 7, `skills` do Phần 8,
    // `siege` do Phần 11 (tiếng tàn bạo của mục 7), `holdings` do Phần 12, và
    // `titles` + `realm` + `vassals` do Phần 13 (mục 10), và `nations` +
    // `religions` do Phần 14 (mục 7), và `world` do Phần 15 (mục 10), và
    // `items` + `equipment` do Phần 16 (mục 17), cùng `codex` là bộ nhớ thực thể
    // bền vững của truyện — root state là hợp nhất của
    // MỌI slice đã đăng ký, nên danh sách này dài ra theo từng phần. `world` là
    // slice cuối cùng của Giai đoạn D; `items` và `equipment` đến sau vì Phần 16
    // nằm ở Giai đoạn C nhưng làm sau Phần 11.
    //
    // `realm` và `holdings` là HAI SLICE RIÊNG, và mục 1 của cả Phần 12 lẫn Phần
    // 13 cấm chúng đọc thẳng vào nhau: một VÙNG và một ĐIỂM chỉ trao đổi qua ba
    // giao diện khai ở `holding/interfaces.ts`.
    //
    // `campaign` là CHIẾN ĐỒ: nó giữ VỊ TRÍ của các đạo quân và chuyện ai đang
    // giữ ô đất nào, còn QUÂN SỐ vẫn nằm ở `military` — cùng một ranh giới, chỉ
    // đổi hai cái tên.
    expect(Object.keys(state).sort()).toEqual([
      'body',
      'campaign',
      'character',
      'codex',
      'economy',
      'equipment',
      'holdings',
      'items',
      'knowledge',
      'meta',
      'military',
      'nations',
      'player',
      'realm',
      'religions',
      'siege',
      'skills',
      'titles',
      'vassals',
      'world',
    ]);
    expect(readPath(state, 'character.stats.hp')).toBe(20);
    expect(readPath(state, 'meta.turn')).toBe(0);
  });

  it('chặn trùng namespace', () => {
    expect(() =>
      slices.register({
        id: 'character',
        schema: slices.get('character')!.schema,
        defaults: () => ({}),
      }),
    ).toThrow(SliceError);
  });

  it('chặn hai slice cùng đặt tên một biến phụ', () => {
    expect(() =>
      slices.register({
        id: 'khac',
        schema: slices.get('player')!.schema,
        defaults: () => ({ name: '' }),
        derived: [{ id: 'combatPower', deps: [], compute: () => 0 }],
      }),
    ).toThrow(/combatPower/);
  });

  it('id slice không được chứa dấu chấm', () => {
    expect(() =>
      slices.register({ id: 'a.b', schema: slices.get('player')!.schema, defaults: () => ({}) }),
    ).toThrow(SliceError);
  });

  it('giữ lại slice lạ từ save của bản build khác', () => {
    const parsed = slices.rootSchema().safeParse({
      ...freshState(),
      slicePlugin: { gi: 'do' },
    });
    expect(parsed.success).toBe(true);
    expect((parsed.data as Record<string, unknown>)['slicePlugin']).toEqual({ gi: 'do' });
  });
});

describe('đường dẫn trong schema (B1)', () => {
  const at = (path: string): boolean => schemaAtPath(slices.rootSchema(), path) !== null;

  it('đi qua object lồng nhau', () => {
    expect(at('character.stats.hp')).toBe(true);
    expect(at('character.identity.race')).toBe(true);
  });

  it('đi qua record với khóa bất kỳ', () => {
    expect(at('character.relations.eleanor.trust')).toBe(true);
    expect(at('character.relations.batky.note')).toBe(true);
  });

  it('đi qua mảng bằng chỉ số', () => {
    expect(at('character.flags.0')).toBe(true);
    expect(at('character.flags.abc')).toBe(false);
  });

  it('trả false cho path không tồn tại', () => {
    expect(at('character.stats.mana')).toBe(false);
    expect(at('khongcoslice.gi.do')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Quyền ghi (mục 3)
// ---------------------------------------------------------------------------

describe('quyền ghi biến', () => {
  it('khớp mẫu wildcard đúng MỘT đoạn', () => {
    expect(patternMatches('stats.*', 'stats.hp')).toBe(true);
    expect(patternMatches('stats.*', 'stats.hp.current')).toBe(false);
    expect(patternMatches('inventory.*.quantity', 'inventory.kiem.quantity')).toBe(true);
  });

  it('phân đúng ba mức cho slice mẫu', () => {
    expect(permissionFor('character.stats.hp')).toBe('engine');
    expect(permissionFor('character.relations.eleanor.trust')).toBe('ai');
    expect(permissionFor('character.flags')).toBe('ai');
    expect(permissionFor('character.identity.race')).toBe('locked');
    expect(permissionFor('meta.seed')).toBe('locked');
  });

  it('quyền của cha áp cho con', () => {
    expect(permissionFor('character.notes.rumors')).toBe('ai');
  });

  it('mặc định là engine khi không khai báo — an toàn hơn', () => {
    expect(permissionFor('character.chua.khai.bao')).toBe('engine');
  });

  it('AI không ghi được engine và locked; engine không ghi được locked', () => {
    expect(canWrite('ai', 'character.stats.hp')).toBe(false);
    expect(canWrite('ai', 'character.identity.race')).toBe(false);
    expect(canWrite('ai', 'character.flags')).toBe(true);
    expect(canWrite('engine', 'character.stats.hp')).toBe(true);
    expect(canWrite('engine', 'character.identity.race')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Parser hai cú pháp (mục 4)
// ---------------------------------------------------------------------------

describe('parser — cú pháp SillyTavern', () => {
  it('đọc _.set ba tham số và lấy lý do từ //', () => {
    const { ops } = parseUpdateBlock(
      "_.set('character.relations.eleanor.trust', 40, 55);//nàng thấy anh bênh vực mình",
    );
    expect(ops).toEqual([
      {
        op: 'set',
        path: 'character.relations.eleanor.trust',
        from: 40,
        to: 55,
        reason: 'nàng thấy anh bênh vực mình',
        source: 'st',
      },
    ]);
  });

  it('đọc đủ năm thao tác', () => {
    const { ops } = parseUpdateBlock(`
_.set('character.flags', ['a'], ['a','b']);//thêm cờ
_.add('character.stats.hp', 5);//hồi máu
_.push('character.flags', 'met_bishop');//gặp giám mục
_.pull('character.flags', 'is_stranger');//không còn lạ mặt
_.delete('character.notes.rumors');//tin đồn đã cũ
`);
    expect(ops.map((op) => op.op)).toEqual(['set', 'add', 'push', 'pull', 'delete']);
  });

  it('op thiếu lý do là op không hợp lệ', () => {
    const { ops, issues } = parseUpdateBlock("_.push('character.flags', 'x');");
    expect(ops).toHaveLength(0);
    expect(issues[0]?.message).toContain('thiếu lý do');
  });

  it('chịu được dấu phẩy và ngoặc nằm trong chuỗi', () => {
    const { ops } = parseUpdateBlock(
      "_.push('character.notes.rumors', 'Giáo hoàng nói: (sắp ra sắc chỉ, rất gấp)');//tin từ chợ",
    );
    expect(ops[0]?.to).toBe('Giáo hoàng nói: (sắp ra sắc chỉ, rất gấp)');
  });

  it('đọc được object và mảng lồng nhau', () => {
    const { ops } = parseUpdateBlock(
      "_.set('character.relations.eleanor', null, { trust: 10, note: 'mới gặp' });//lần đầu gặp",
    );
    expect(ops[0]?.to).toEqual({ trust: 10, note: 'mới gặp' });
  });

  it('_.set hai tham số thì không có giá trị cũ', () => {
    const { ops } = parseUpdateBlock("_.set('character.flags', ['x']);//khởi tạo");
    expect(ops[0]?.from).toBeUndefined();
    expect(ops[0]?.to).toEqual(['x']);
  });
});

describe('parser — cú pháp JSON', () => {
  it('đọc dạng { ops: [...] }', () => {
    const { ops } = parseUpdateBlock(
      JSON.stringify({
        ops: [
          {
            op: 'set',
            path: 'character.relations.eleanor.trust',
            from: 40,
            to: 55,
            reason: 'nàng thấy anh bênh vực mình',
          },
        ],
      }),
    );
    expect(ops[0]).toMatchObject({ op: 'set', to: 55, source: 'json' });
  });

  it('op JSON thiếu reason bị loại', () => {
    const { ops, issues } = parseUpdateBlock('{"ops":[{"op":"set","path":"character.flags","to":[]}]}');
    expect(ops).toHaveLength(0);
    expect(issues[0]?.message).toContain('reason');
  });
});

describe('parser — nhận diện và gộp', () => {
  it('xử lý được hai cú pháp lẫn lộn trong một khối', () => {
    const { ops } = parseUpdateBlock(`
_.push('character.flags', 'a');//cờ một
{"op":"push","path":"character.flags","to":"b","reason":"cờ hai"}
`);
    expect(ops.map((op) => op.source)).toEqual(['st', 'json']);
  });

  it('gộp NHIỀU thẻ UpdateVariable theo thứ tự xuất hiện', () => {
    const result = parseUpdateVariables(`
Truyện phần một.
<UpdateVariable>_.push('character.flags', 'mot');//một</UpdateVariable>
Truyện phần hai.
<UpdateVariable>_.push('character.flags', 'hai');//hai</UpdateVariable>
`);
    expect(result.blockCount).toBe(2);
    expect(result.ops.map((op) => op.to)).toEqual(['mot', 'hai']);
  });

  it('tách được phần kể chuyện khỏi khối kỹ thuật', () => {
    const narrative = stripUpdateBlocks(
      "Nàng gật đầu.\n<UpdateVariable>_.push('character.flags','x');//lý do</UpdateVariable>\nRồi quay đi.",
    );
    expect(narrative).toBe('Nàng gật đầu.\n\nRồi quay đi.');
  });
});

// ---------------------------------------------------------------------------
// BÀI TEST BẮT BUỘC (mục 10.9)
// ---------------------------------------------------------------------------

describe('pipeline — lô 5 op có 1 op sai phải reject cả 5', () => {
  const goodOps = (): PatchOp[] => [
    {
      op: 'set',
      path: 'character.relations.eleanor',
      to: { trust: 10, note: 'mới gặp' },
      reason: 'gặp lần đầu',
      source: 'st',
    },
    { op: 'push', path: 'character.flags', to: 'met_bishop', reason: 'gặp giám mục', source: 'st' },
    { op: 'push', path: 'character.notes.rumors', to: 'Sắp có sắc chỉ', reason: 'nghe ngoài chợ', source: 'st' },
    { op: 'push', path: 'character.flags', to: 'in_town', reason: 'vào thành', source: 'st' },
    {
      op: 'set',
      path: 'character.relations.marcus',
      to: { trust: -5, note: 'nghi ngờ' },
      reason: 'hắn nhìn đểu',
      source: 'st',
    },
  ];

  it('lô 5 op sạch thì áp được cả 5', () => {
    const state = freshState();
    const result = applyPatch(state, goodOps(), { actor: 'ai' });

    expect(result.applied).toBe(true);
    expect(result.failures).toEqual([]);
    expect(result.changedPaths).toHaveLength(5);
    expect(readPath(result.next!, 'character.flags')).toEqual(['met_bishop', 'in_town']);
    // State cũ KHÔNG bị đụng tới.
    expect(readPath(state, 'character.flags')).toEqual([]);
  });

  it.each([
    [
      'op sai quyền (B2)',
      { op: 'set', path: 'character.stats.hp', from: 20, to: 5, reason: 'bị đâm', source: 'st' } as PatchOp,
      'B2',
    ],
    [
      'op sai path (B1)',
      { op: 'set', path: 'character.stats.mana', to: 5, reason: 'phép thuật', source: 'st' } as PatchOp,
      'B1',
    ],
    [
      'op sai kiểu thao tác (B3)',
      {
        op: 'push',
        path: 'character.relations.eleanor.trust',
        to: 5,
        reason: 'thân hơn',
        source: 'st',
      } as PatchOp,
      'B3',
    ],
    [
      'op dùng state cũ (B4)',
      {
        op: 'set',
        path: 'character.relations.eleanor.trust',
        from: 99,
        to: 55,
        reason: 'thân hơn',
        source: 'st',
      } as PatchOp,
      'B4',
    ],
    [
      'op sai kiểu giá trị (B5)',
      { op: 'push', path: 'character.flags', to: 12345, reason: 'cờ số', source: 'st' } as PatchOp,
      'B5',
    ],
    [
      'op ngoài phạm vi (B6)',
      {
        op: 'set',
        path: 'character.relations.eleanor',
        to: { trust: 500, note: 'quá đà' },
        reason: 'rất thân',
        source: 'st',
      } as PatchOp,
      'B6',
    ],
  ])('%s → hủy CẢ LÔ, state không đổi', (_label, badOp, step) => {
    const state = freshState();
    const before = structuredClone(state);
    const batch = [...goodOps().slice(0, 4), badOp];

    const result = applyPatch(state, batch, { actor: 'ai' });

    expect(result.applied).toBe(false);
    expect(result.next).toBeNull();
    expect(result.changedPaths).toEqual([]);
    expect(result.failures.some((failure) => failure.step === step)).toBe(true);

    // Bốn op hợp lệ kia cũng KHÔNG được áp — đó chính là all-or-nothing.
    expect(state).toEqual(before);
    expect(readPath(state, 'character.flags')).toEqual([]);
    expect(readPath(state, 'character.relations')).toEqual({});
  });

  it('báo hết mọi op sai trong một lần, không dừng ở op đầu tiên', () => {
    const state = freshState();
    const result = applyPatch(
      state,
      [
        { op: 'set', path: 'character.stats.hp', from: 20, to: 5, reason: 'a', source: 'st' },
        { op: 'set', path: 'character.identity.race', from: 'race_teuton', to: 'race_lam-tien', reason: 'b', source: 'st' },
        { op: 'set', path: 'character.stats.mana', to: 1, reason: 'c', source: 'st' },
      ],
      { actor: 'ai' },
    );
    expect(result.failures).toHaveLength(3);
    expect(result.failures.map((failure) => failure.step).sort()).toEqual(['B1', 'B2', 'B2']);
  });
});

// ---------------------------------------------------------------------------
// Từng bước của pipeline
// ---------------------------------------------------------------------------

describe('pipeline — thông báo lỗi phải đủ để AI tự sửa', () => {
  it('B2 nói rõ engine giữ quyền và bảo AI mô tả trong truyện', () => {
    const result = applyPatch(
      freshState(),
      [{ op: 'set', path: 'character.stats.hp', from: 20, to: 5, reason: 'bị đâm', source: 'st' }],
      { actor: 'ai' },
    );
    const failure = result.failures[0];
    expect(failure?.message).toContain("quyền 'engine'");
    expect(failure?.message).toContain('MÔ TẢ nó trong truyện');
    expect(failure?.permission).toBe('engine');
  });

  it('B4 nói rõ giá trị cũ AI đưa và giá trị thật đang có', () => {
    const state = freshState();
    const seeded = applyPatch(
      state,
      [
        {
          op: 'set',
          path: 'character.relations.eleanor',
          to: { trust: 55, note: '' },
          reason: 'gặp',
          source: 'st',
        },
      ],
      { actor: 'ai' },
    ).next!;

    const result = applyPatch(
      seeded,
      [
        {
          op: 'set',
          path: 'character.relations.eleanor.trust',
          from: 40,
          to: 60,
          reason: 'thân hơn',
          source: 'st',
        },
      ],
      { actor: 'ai' },
    );
    expect(result.failures[0]?.message).toBe(
      'from=40 nhưng giá trị hiện tại là 55. State bạn dùng đã cũ.',
    );
    expect(result.failures[0]?.currentValue).toBe(55);
  });

  it('B4: from=null coi như "chưa có gì" khi schema không nhận null', () => {
    // Cả cú pháp MVU lẫn JSON đều không có `undefined`, nên AI viết `null` để
    // chỉ chỗ trống. Bắt nó fail là bộ gác báo nhầm chứ không phải AI sai.
    const result = applyPatch(
      freshState(),
      [
        {
          op: 'set',
          path: 'character.relations.eleanor',
          from: null,
          to: { trust: 12, note: 'nhớ mặt' },
          reason: 'gặp lần đầu',
          source: 'st',
        },
      ],
      { actor: 'ai' },
    );
    expect(result.applied).toBe(true);
  });

  it('B4: from=null vẫn bị soi khi path ĐANG có giá trị', () => {
    const seeded = applyPatch(
      freshState(),
      [
        {
          op: 'set',
          path: 'character.relations.eleanor',
          to: { trust: 12, note: '' },
          reason: 'gặp',
          source: 'st',
        },
      ],
      { actor: 'ai' },
    ).next!;

    const result = applyPatch(
      seeded,
      [
        {
          op: 'set',
          path: 'character.relations.eleanor',
          from: null,
          to: { trust: 30, note: '' },
          reason: 'thân hơn',
          source: 'st',
        },
      ],
      { actor: 'ai' },
    );
    expect(result.applied).toBe(false);
    expect(result.failures[0]?.step).toBe('B4');
  });

  it('B4: AI bỏ trống from chỉ được chấp nhận khi path đang trống', () => {
    const state = freshState();
    const ok = applyPatch(
      state,
      [
        {
          op: 'set',
          path: 'character.relations.eleanor',
          to: { trust: 1, note: '' },
          reason: 'mới',
          source: 'st',
        },
      ],
      { actor: 'ai' },
    );
    expect(ok.applied).toBe(true);

    const missing = applyPatch(
      ok.next!,
      [
        {
          op: 'set',
          path: 'character.relations.eleanor.trust',
          to: 9,
          reason: 'thân hơn',
          source: 'st',
        },
      ],
      { actor: 'ai' },
    );
    expect(missing.applied).toBe(false);
    expect(missing.failures[0]?.code).toBe('thieu-from');
  });

  it('engine không cần compare-and-swap, AI thì có', () => {
    const state = freshState();
    const engineWrite = applyPatch(
      state,
      [{ op: 'set', path: 'character.stats.hp', to: 12, reason: 'trúng đòn', source: 'st' }],
      { actor: 'engine' },
    );
    expect(engineWrite.applied).toBe(true);
    expect(readPath(engineWrite.next!, 'character.stats.hp')).toBe(12);
  });

  it('B7 bắt ràng buộc chéo hp <= maxHp', () => {
    const state = freshState();
    const result = applyPatch(
      state,
      [{ op: 'set', path: 'character.stats.hp', from: 20, to: 50, reason: 'hồi máu', source: 'st' }],
      { actor: 'engine' },
    );
    expect(result.applied).toBe(false);
    expect(result.failures[0]?.step).toBe('B7');
    expect(result.failures[0]?.message).toContain('hp=50 vượt quá maxHp=20');
  });

  it('add cộng số, push nối mảng', () => {
    const state = freshState();
    const result = applyPatch(
      state,
      [
        { op: 'add', path: 'character.stats.hp', to: -8, reason: 'trúng đòn', source: 'st' },
        { op: 'push', path: 'character.flags', to: 'bi_thuong', reason: 'có vết thương', source: 'st' },
      ],
      { actor: 'engine' },
    );
    expect(readPath(result.next!, 'character.stats.hp')).toBe(12);
    expect(readPath(result.next!, 'character.flags')).toEqual(['bi_thuong']);
  });

  it('pull bỏ phần tử khỏi mảng', () => {
    const seeded = applyPatch(
      freshState(),
      [{ op: 'set', path: 'character.flags', to: ['a', 'b'], reason: 'khởi tạo', source: 'st' }],
      { actor: 'engine' },
    ).next!;

    const result = applyPatch(
      seeded,
      [{ op: 'pull', path: 'character.flags', to: 'a', reason: 'hết hiệu lực', source: 'st' }],
      { actor: 'ai' },
    );
    expect(readPath(result.next!, 'character.flags')).toEqual(['b']);
  });
});

describe('pipeline — "Áp dụng dù sao" của tầng 2', () => {
  it('bỏ qua B2 để người chơi ghi vào path engine', () => {
    const result = applyPatch(
      freshState(),
      [{ op: 'set', path: 'character.stats.hp', from: 20, to: 5, reason: 'sửa tay', source: 'st' }],
      { actor: 'player', skipPermissions: true },
    );
    expect(result.applied).toBe(true);
  });

  it('bỏ qua B6 để vượt trần', () => {
    const result = applyPatch(
      freshState(),
      [
        {
          op: 'set',
          path: 'character.relations.eleanor',
          to: { trust: 500, note: 'quá đà' },
          reason: 'sửa tay',
          source: 'st',
        },
      ],
      { actor: 'player', skipBounds: true },
    );
    expect(result.applied).toBe(true);
  });

  it('KHÔNG BAO GIỜ bỏ qua B5 — phá kiểu là hỏng save', () => {
    const result = applyPatch(
      freshState(),
      [{ op: 'set', path: 'character.stats.hp', to: 'rất nhiều', reason: 'sửa tay', source: 'st' }],
      { actor: 'player', skipPermissions: true, skipBounds: true },
    );
    expect(result.applied).toBe(false);
    expect(result.failures[0]?.step).toBe('B5');
  });
});

// ---------------------------------------------------------------------------
// Biến phụ (mục 7)
// ---------------------------------------------------------------------------

describe('biến phụ', () => {
  it('tính đúng từ state', () => {
    const values = computeDerived(freshState(), { strict: true });
    expect(values['combatPower']).toBe(10);
  });

  it('đổi theo máu còn lại', () => {
    const hurt = applyPatch(
      freshState(),
      [{ op: 'set', path: 'character.stats.hp', from: 20, to: 10, reason: 'trúng đòn', source: 'st' }],
      { actor: 'engine' },
    ).next!;
    expect(computeDerived(hurt, { strict: true })['combatPower']).toBe(5);
  });

  it('ném lỗi khi compute đọc ngoài deps đã khai', () => {
    slices.register({
      id: 'xau',
      schema: slices.get('player')!.schema,
      defaults: () => ({ name: '' }),
      derived: [
        {
          id: 'docLen',
          deps: ['character.stats.str'],
          compute: (state) => (state['character'] as { stats: { hp: number } }).stats.hp,
        },
      ],
    });
    expect(() => computeDerived(freshState(), { strict: true })).toThrow(DerivedDepError);
  });

  it('sắp xếp topo theo phụ thuộc giữa các biến phụ', () => {
    const order = derivedOrder([
      { id: 'c', deps: ['derived.b'], compute: () => 0 },
      { id: 'a', deps: [], compute: () => 0 },
      { id: 'b', deps: ['derived.a'], compute: () => 0 },
    ]);
    expect(order).toEqual(['a', 'b', 'c']);
  });

  it('phát hiện chu trình và nói rõ vòng nào', () => {
    expect(() =>
      derivedOrder([
        { id: 'a', deps: ['derived.b'], compute: () => 0 },
        { id: 'b', deps: ['derived.a'], compute: () => 0 },
      ]),
    ).toThrow(DerivedGraphError);

    try {
      derivedOrder([
        { id: 'a', deps: ['derived.b'], compute: () => 0 },
        { id: 'b', deps: ['derived.a'], compute: () => 0 },
      ]);
    } catch (error) {
      expect((error as DerivedGraphError).cycle).toEqual(['a', 'b', 'a']);
    }
  });

  it('chỉ tính lại nhánh có deps thay đổi', () => {
    let calls = 0;
    slices.register({
      id: 'demdem',
      schema: slices.get('player')!.schema,
      defaults: () => ({ name: '' }),
      derived: [
        {
          id: 'demSoLan',
          deps: ['character.stats.str'],
          compute: () => {
            calls++;
            return calls;
          },
        },
      ],
    });

    const state = freshState();
    const first = computeDerived(state, { strict: true });
    expect(calls).toBe(1);

    // Đổi một path KHÔNG nằm trong deps → không tính lại.
    computeDerived(state, { strict: true, previous: first, changedPaths: ['character.flags'] });
    expect(calls).toBe(1);

    // Đổi đúng path trong deps → tính lại.
    computeDerived(state, { strict: true, previous: first, changedPaths: ['character.stats.str'] });
    expect(calls).toBe(2);
  });

  it('"Tính lại toàn bộ" bỏ cache, chạy lại từ đầu', () => {
    const state = freshState();
    expect(recomputeAll(state)['combatPower']).toBe(10);
  });

  it('MVU không ghi được vào biến phụ', () => {
    const result = applyPatch(
      freshState(),
      [{ op: 'set', path: 'derived.combatPower', to: 999, reason: 'mạnh lên', source: 'st' }],
      { actor: 'ai' },
    );
    expect(result.applied).toBe(false);
    expect(result.failures[0]?.step).toBe('B1');
  });
});

describe('deepEqual', () => {
  it('so sánh cấu trúc lồng nhau', () => {
    expect(deepEqual({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] })).toBe(true);
    expect(deepEqual({ a: [1, { b: 2 }] }, { a: [1, { b: 3 }] })).toBe(false);
    expect(deepEqual([1, 2], [1, 2, 3])).toBe(false);
    expect(deepEqual(null, undefined)).toBe(false);
  });
});
