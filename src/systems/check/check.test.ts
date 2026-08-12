/**
 * Bài kiểm của Phần 5 — trừ Monte Carlo, nằm ở `montecarlo.test.ts`.
 *
 * Trọng tâm: ngưỡng của mục 4 phải đúng ĐẾN TỪNG ĐƠN VỊ, và registry phải là
 * đường DUY NHẤT mà modifier đi vào kết quả.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { createRng } from '@/core/rng';
import type { CheckTier } from '@/core/turn';
import {
  CONSEQUENCE_ISSUES,
  CONSEQUENCE_TABLE,
  CONTEST_LADDER,
  DEFAULT_CLAMPS,
  DIFFICULTY_LADDER,
  bucketFor,
  clamp,
  collectModifiers,
  consequenceKindFor,
  contestedCheck,
  d100Tier,
  d20Tier,
  difficulty,
  domainMatches,
  foldModifiers,
  isSuccess,
  pickConsequence,
  poolTier,
  registerCheckSources,
  registerModifierSource,
  resetModifierSources,
  runCheck,
  shiftTier,
  threeD6Tier,
  type CheckSpec,
  type ModifierContext,
} from './index';
import { CheckLog } from './log';
import { resolveTurn } from './resolve';
import { createInitialState } from '@/state/store';

const SEED = 'kiem-dinh-1444';

function ctx(overrides: Partial<ModifierContext> = {}): ModifierContext {
  return {
    domain: 'skill.kiem-thuat',
    system: 'd100',
    difficulty: 'thuong',
    state: null,
    actor: '',
    tags: [],
    ...overrides,
  };
}

function spec(overrides: Partial<CheckSpec> = {}): CheckSpec {
  return {
    id: 'check.thu',
    system: 'd100',
    domain: 'skill.kiem-thuat',
    difficulty: 'thuong',
    base: 50,
    ...overrides,
  };
}

beforeEach(() => {
  resetModifierSources();
});

// ---------------------------------------------------------------------------
// Mục 4 — ngưỡng 5 cấp
// ---------------------------------------------------------------------------

describe('mục 4 — d100 tung-dưới', () => {
  it('01 luôn là thành công lớn, 100 luôn là thất bại nặng', () => {
    expect(d100Tier(1, 5)).toBe('critSuccess');
    expect(d100Tier(1, 95)).toBe('critSuccess');
    expect(d100Tier(100, 95)).toBe('critFail');
    // Ngưỡng 95 nghĩa là 100 vẫn hỏng nặng — đó là "cửa thua" của mục 7.
    expect(d100Tier(100, 5)).toBe('critFail');
  });

  it('cửa thành công lớn là floor(T/10), tối thiểu 1', () => {
    expect(d100Tier(5, 55)).toBe('critSuccess');
    expect(d100Tier(6, 55)).toBe('success');
    // T = 5 thì floor(5/10) = 0, phải nâng lên 1.
    expect(d100Tier(1, 5)).toBe('critSuccess');
    expect(d100Tier(2, 5)).toBe('success');
  });

  it('cửa sổ trầy trật rộng đúng 10 điểm trên ngưỡng', () => {
    expect(d100Tier(50, 50)).toBe('success');
    expect(d100Tier(51, 50)).toBe('costlySuccess');
    expect(d100Tier(60, 50)).toBe('costlySuccess');
    expect(d100Tier(61, 50)).toBe('fail');
  });

  it('96–99 là hỏng nặng, TRỪ khi còn nằm trong cửa sổ trầy trật', () => {
    expect(d100Tier(96, 50)).toBe('critFail');
    expect(d100Tier(99, 50)).toBe('critFail');
    // Kỹ năng 90: 96–99 vẫn là trầy trật vượt qua, vì mục 4 xếp luật đó TRƯỚC.
    // Chỉ 100 mới kéo được người có nghề xuống hỏng nặng.
    expect(d100Tier(96, 90)).toBe('costlySuccess');
    expect(d100Tier(99, 90)).toBe('costlySuccess');
    expect(d100Tier(100, 90)).toBe('critFail');
  });
});

describe('mục 4 — d20 + chỉ số vs DC', () => {
  it('xếp cấp theo margin', () => {
    expect(d20Tier(10, 12, 12)).toBe('critSuccess'); // margin +10
    expect(d20Tier(10, 2, 12)).toBe('success'); //      margin  0
    expect(d20Tier(10, 0, 13)).toBe('costlySuccess'); // margin -3
    expect(d20Tier(10, 0, 14)).toBe('fail'); //          margin -4
    expect(d20Tier(10, 0, 20)).toBe('fail'); //          margin -10
    expect(d20Tier(10, 0, 21)).toBe('critFail'); //      margin -11
  });

  it('natural 20 nâng một bậc, natural 1 hạ một bậc', () => {
    // margin 0 → success, nat 20 nâng thành critSuccess.
    expect(d20Tier(20, -8, 12)).toBe('critSuccess');
    // margin 0 → success, nat 1 hạ thành costlySuccess.
    expect(d20Tier(1, 11, 12)).toBe('costlySuccess');
  });

  it('một mặt xúc sắc không biến thảm họa thành chiến thắng', () => {
    // Margin -30 vẫn là critFail; nat 20 chỉ kéo lên fail.
    expect(d20Tier(20, 0, 50)).toBe('fail');
  });
});

describe('mục 4 — 3d6 tung-dưới', () => {
  it('≤4 luôn thành công lớn, ≥17 luôn thất bại nặng', () => {
    expect(threeD6Tier(3, 3)).toBe('critSuccess');
    expect(threeD6Tier(4, 3)).toBe('critSuccess');
    expect(threeD6Tier(17, 17)).toBe('critFail');
    expect(threeD6Tier(18, 17)).toBe('critFail');
  });

  it('T−5 mở cửa thành công lớn, T+1 và T+2 là trầy trật', () => {
    expect(threeD6Tier(7, 12)).toBe('critSuccess');
    expect(threeD6Tier(8, 12)).toBe('success');
    expect(threeD6Tier(12, 12)).toBe('success');
    expect(threeD6Tier(13, 12)).toBe('costlySuccess');
    expect(threeD6Tier(14, 12)).toBe('costlySuccess');
    expect(threeD6Tier(15, 12)).toBe('fail');
  });
});

describe('mục 4 — dice pool', () => {
  const faces = (successes: number, ones: number, filler = 0): number[] => [
    ...Array.from({ length: successes }, () => 6),
    ...Array.from({ length: ones }, () => 1),
    ...Array.from({ length: filler }, () => 3),
  ];

  it('mặt 5–6 là thành công', () => {
    expect(poolTier([5, 6, 4, 3], 2)).toBe('success');
    // Không hit nào, cần 2 — hụt hẳn 2 nên không còn là trầy trật nữa.
    expect(poolTier([4, 4, 3, 2], 2)).toBe('fail');
    // Hụt đúng 1 hit thì vẫn là trầy trật vượt qua.
    expect(poolTier([4, 4, 3, 2], 1)).toBe('costlySuccess');
  });

  it('nhiều mặt 1 hơn số thành công là vỡ trận, bất kể đủ hit hay không', () => {
    expect(poolTier(faces(4, 5), 1)).toBe('critFail');
    expect(poolTier(faces(2, 3), 2)).toBe('critFail');
  });

  it('R+3 là thành công lớn, R−1 là trầy trật', () => {
    expect(poolTier(faces(6, 0, 4), 3)).toBe('critSuccess');
    expect(poolTier(faces(3, 0, 4), 3)).toBe('success');
    expect(poolTier(faces(2, 0, 4), 3)).toBe('costlySuccess');
    expect(poolTier(faces(1, 0, 4), 3)).toBe('fail');
  });
});

describe('thang cấp', () => {
  it('dịch bậc kẹp ở hai đầu', () => {
    expect(shiftTier('critFail', -3)).toBe('critFail');
    expect(shiftTier('critSuccess', 3)).toBe('critSuccess');
    expect(shiftTier('fail', 1)).toBe('costlySuccess');
  });

  it('costlySuccess ĐẠT mục tiêu — chỉ là phải trả giá', () => {
    expect(isSuccess('costlySuccess')).toBe(true);
    expect(isSuccess('fail')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Mục 8 — thang độ khó
// ---------------------------------------------------------------------------

describe('mục 8 — thang độ khó chuẩn hóa', () => {
  it('khớp nguyên văn bảng của mục 8', () => {
    expect(DIFFICULTY_LADDER.map((row) => [row.d100, row.dc, row.d6, row.pool])).toEqual([
      [40, 8, 4, 1],
      [0, 12, 0, 2],
      [-20, 16, -4, 3],
      [-40, 20, -8, 4],
      [-60, 25, -12, 6],
      [-80, 30, -16, 8],
    ]);
  });

  it('ném lỗi khi tên bậc lạ thay vì lặng lẽ lùi về "Thường"', () => {
    // @ts-expect-error — đúng thứ luật kiểu chặn, và runtime cũng phải chặn.
    expect(() => difficulty('de-thoi')).toThrow(/không có trong thang/);
  });

  it('bậc đi thẳng vào ngưỡng và hiện thành một dòng modifier', () => {
    const { result } = runCheck(createRng(SEED), spec({ difficulty: 'kho', base: 60 }));
    expect(result.target).toBe(40);
    expect(result.modifiers[0]?.label).toContain('Khó');
    expect(result.modifiers[0]?.value).toBe(-20);
  });
});

// ---------------------------------------------------------------------------
// Mục 7 — registry modifier
// ---------------------------------------------------------------------------

describe('mục 7 — registry modifier', () => {
  it('khớp miền theo mẫu', () => {
    expect(domainMatches('*', 'admin.xay-dung')).toBe(true);
    expect(domainMatches('skill.*', 'skill.kiem-thuat')).toBe(true);
    expect(domainMatches('skill.*', 'skill.y-thuat.phau')).toBe(true);
    expect(domainMatches('skill.*', 'combat.don')).toBe(false);
    expect(domainMatches('skill.kiem-thuat', 'skill.kiem-thuat')).toBe(true);
    expect(domainMatches('skill.kiem-thuat', 'skill.kiem')).toBe(false);
  });

  it('chỉ gọi nguồn khớp miền', () => {
    registerModifierSource({
      id: 'thu.skill',
      domains: ['skill.*'],
      compute: () => [{ label: 'Chỉ kỹ năng', value: -5, kind: 'flat', source: 'thu.skill' }],
    });
    registerModifierSource({
      id: 'thu.admin',
      domains: ['admin.*'],
      compute: () => [{ label: 'Chỉ quản trị', value: -7, kind: 'flat', source: 'thu.admin' }],
    });

    expect(collectModifiers(ctx()).modifiers.map((m) => m.source)).toEqual(['thu.skill']);
    expect(collectModifiers(ctx({ domain: 'admin.thu-thue' })).modifiers.map((m) => m.source)).toEqual([
      'thu.admin',
    ]);
  });

  it('nguồn ném lỗi KHÔNG làm hỏng phép kiểm, nhưng phải nổi lên (R4)', () => {
    registerModifierSource({
      id: 'thu.hong',
      domains: ['*'],
      compute: () => {
        throw new Error('nguồn này hỏng');
      },
    });
    registerModifierSource({
      id: 'thu.lanh',
      domains: ['*'],
      compute: () => [{ label: 'Vẫn chạy', value: -3, kind: 'flat', source: 'thu.lanh' }],
    });

    const run = runCheck(createRng(SEED), spec());
    expect(run.failures).toHaveLength(1);
    expect(run.failures[0]?.source).toBe('thu.hong');
    expect(run.result.modifiers.some((line) => line.label === 'Vẫn chạy')).toBe(true);
  });

  it('id nguồn bị ghi đè để không mất dấu vết', () => {
    registerModifierSource({
      id: 'thu.that',
      domains: ['*'],
      compute: () => [{ label: 'Khai sai nguồn', value: 1, kind: 'flat', source: 'khong-co-that' }],
    });
    expect(collectModifiers(ctx()).modifiers[0]?.source).toBe('thu.that');
  });

  it('từ chối đăng ký trùng id và đăng ký không khai miền', () => {
    registerModifierSource({ id: 'thu.mot', domains: ['*'], compute: () => null });
    expect(() => registerModifierSource({ id: 'thu.mot', domains: ['*'], compute: () => null })).toThrow(
      /trùng id/,
    );
    expect(() => registerModifierSource({ id: 'thu.hai', domains: [], compute: () => null })).toThrow(
      /không khai miền/,
    );
  });

  it('cộng dồn theo từng kiểu và giữ đủ dòng để giải trình', () => {
    const folded = foldModifiers([
      { label: 'Vết thương vai', value: -10, kind: 'flat', source: 'a' },
      { label: 'Ông ta đang nợ anh', value: 15, kind: 'flat', source: 'b' },
      { label: 'Địa hình xấu', value: 2, kind: 'dc', source: 'c' },
      { label: 'Thiếu quân', value: -3, kind: 'pool', source: 'd' },
      { label: 'Được chúc phúc', value: 1, kind: 'dieShift', source: 'e' },
    ]);
    expect(folded).toMatchObject({ flat: 5, dc: 2, pool: -3, dieShift: 1 });
    expect(folded.lines).toHaveLength(5);
  });

  it('kẹp d100 trong 5–95 để luôn còn cửa thắng và cửa thua', () => {
    expect(clamp(200, DEFAULT_CLAMPS.d100)).toBe(95);
    expect(clamp(-40, DEFAULT_CLAMPS.d100)).toBe(5);

    const rng = createRng(SEED);
    expect(runCheck(rng, spec({ base: 200 })).result.target).toBe(95);
    expect(runCheck(rng, spec({ base: -50 })).result.target).toBe(5);
  });

  it('dieShift dịch cấp mà không đụng tới con số', () => {
    const plain = runCheck(createRng(SEED), spec()).result;
    registerModifierSource({
      id: 'thu.chuc-phuc',
      domains: ['*'],
      compute: () => [{ label: 'Chúc phúc', value: 1, kind: 'dieShift', source: 'thu.chuc-phuc' }],
    });
    const blessed = runCheck(createRng(SEED), spec()).result;

    expect(blessed.raw).toEqual(plain.raw);
    expect(blessed.target).toBe(plain.target);
    expect(blessed.tier).toBe(shiftTier(plain.tier, 1));
  });

  it('hai nguồn giả của mục 7 tự quy đổi sang hệ đang chạy', () => {
    registerCheckSources();
    const rng = createRng(SEED);

    const d100 = runCheck(rng, spec({ tags: ['moi-met'] })).result;
    expect(d100.modifiers.some((line) => line.label === 'Mệt rã người' && line.value === -10)).toBe(true);

    const d20 = runCheck(rng, spec({ system: 'd20', base: 3, tags: ['moi-met'] })).result;
    // Ở d20 thì "mệt" đội DC lên chứ không bớt của người tung.
    expect(d20.dc).toBe(14);

    // Mệt mỏi chỉ khai `skill.*` và `combat.*` — quản trị không dính.
    const admin = runCheck(rng, spec({ domain: 'admin.xay-dung', system: '3d6', base: 12, tags: ['moi-met'] }))
      .result;
    expect(admin.modifiers.some((line) => line.label === 'Mệt rã người')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Mục 3 và 5 — kiểu kết quả và hệ quả
// ---------------------------------------------------------------------------

describe('mục 3 — kiểu kết quả thống nhất', () => {
  it('bốn hệ trả về cùng một hình dạng', () => {
    const rng = createRng(SEED);
    const runs = [
      runCheck(rng, spec({ system: 'd100', base: 55 })).result,
      runCheck(rng, spec({ system: 'd20', base: 3, domain: 'combat.don' })).result,
      runCheck(rng, spec({ system: '3d6', base: 12, domain: 'admin.xay-dung' })).result,
      runCheck(rng, spec({ system: 'pool', base: 8, domain: 'combat.xung-phong' })).result,
    ];

    for (const result of runs) {
      expect(result.id).toBe('check.thu');
      expect(result.raw.length).toBeGreaterThan(0);
      expect(result.difficulty).toBe('thuong');
      expect(result.seedUsed).toContain('#');
      expect(result.narrativeHint.length).toBeGreaterThan(0);
      expect(['critFail', 'fail', 'costlySuccess', 'success', 'critSuccess']).toContain(result.tier);
    }

    expect(runs[0]?.raw).toHaveLength(1);
    expect(runs[2]?.raw).toHaveLength(3);
    expect(runs[3]?.raw).toHaveLength(8);
  });

  it('bậc độ khó hiện thành dòng modifier ở hệ nó cộng vào ngưỡng, và chỉ ở đó', () => {
    const rng = createRng(SEED);
    const line = (system: CheckSpec['system'], base: number) =>
      runCheck(rng, spec({ system, base, difficulty: 'kho' })).result;

    // d100 và 3d6: bậc cộng thẳng vào ngưỡng, phải giải trình được.
    expect(line('d100', 55).modifiers).toEqual([
      { label: 'Độ khó Khó', value: -20, source: 'check.do-kho' },
    ]);
    expect(line('3d6', 12).modifiers).toEqual([
      { label: 'Độ khó Khó', value: -4, source: 'check.do-kho' },
    ]);

    // d20 và pool: bậc ĐẶT ra DC và số hit cần, không cộng vào cú tung. Con số
    // đã nằm ở `dc`/`target`, tên bậc nằm ở `difficulty` — không mất thông tin.
    const d20 = line('d20', 3);
    expect(d20.modifiers).toEqual([]);
    expect(d20.dc).toBe(16);
    expect(d20.difficulty).toBe('kho');

    const pool = line('pool', 8);
    expect(pool.modifiers).toEqual([]);
    expect(pool.target).toBe(3);
  });

  it('cùng seed + cùng spec = cùng kết quả (R3)', () => {
    const left = runCheck(createRng(SEED), spec()).result;
    const right = runCheck(createRng(SEED), spec()).result;
    expect(left).toEqual(right);
  });

  it('seedUsed trỏ đúng vị trí đã rút', () => {
    const rng = createRng(SEED);
    const first = runCheck(rng, spec()).result;
    const second = runCheck(rng, spec()).result;
    expect(first.seedUsed).toBe(`${SEED}#0`);
    expect(second.seedUsed).not.toBe(first.seedUsed);
  });
});

describe('mục 5 — hệ quả do engine chọn', () => {
  it('file dữ liệu đọc được', () => {
    expect(CONSEQUENCE_ISSUES).toEqual([]);
    expect(Object.keys(CONSEQUENCE_TABLE).length).toBeGreaterThan(1);
  });

  it('chỉ ba cấp cần hệ quả', () => {
    expect(consequenceKindFor('costlySuccess')).toBe('cost');
    expect(consequenceKindFor('critSuccess')).toBe('boon');
    expect(consequenceKindFor('critFail')).toBe('escalation');
    expect(consequenceKindFor('success')).toBeNull();
    expect(consequenceKindFor('fail')).toBeNull();
  });

  it('tra bucket: nguyên văn → mẫu dài nhất → *', () => {
    const table = {
      'skill.kiem-thuat': { cost: ['A'], boon: [], escalation: [] },
      'skill.*': { cost: ['B'], boon: [], escalation: [] },
      '*': { cost: ['C'], boon: [], escalation: [] },
    };
    expect(bucketFor('skill.kiem-thuat', table)?.cost).toEqual(['A']);
    expect(bucketFor('skill.cung', table)?.cost).toEqual(['B']);
    expect(bucketFor('admin.thu-thue', table)?.cost).toEqual(['C']);
  });

  it('chọn bằng seeded RNG nên tái lập được', () => {
    const left = pickConsequence(createRng(SEED), 'costlySuccess', 'social.dam-phan');
    const right = pickConsequence(createRng(SEED), 'costlySuccess', 'social.dam-phan');
    expect(left).not.toBeNull();
    expect(left).toEqual(right);
    expect(left?.kind).toBe('cost');
  });

  it('mọi lần trầy trật đều có cái giá, và AI không phải tự nghĩ', () => {
    const rng = createRng('gia-phai-tra');
    for (let i = 0; i < 300; i++) {
      const { result } = runCheck(rng, spec({ domain: 'social.dam-phan' }));
      if (result.tier === 'costlySuccess') {
        expect(result.consequence?.kind).toBe('cost');
        expect(result.consequence?.text.length).toBeGreaterThan(0);
      }
      if (result.tier === 'success' || result.tier === 'fail') {
        expect(result.consequence).toBeUndefined();
      }
    }
  });

  it('KHÔNG dòng biến cố nào giết ngay hay làm mất trắng thành trì', () => {
    // Ràng buộc cứng của mục 5: critFail chỉ được LEO THANG. Cái chết phải đến
    // qua chuỗi nhiều biến cố, để người chơi luôn thấy mình còn cửa xoay xở.
    const cam = /chết|tử vong|thiệt mạng|mất trắng|xóa sổ|tuyệt tự|mất mạng/i;
    for (const [domain, bucket] of Object.entries(CONSEQUENCE_TABLE)) {
      for (const line of bucket.escalation) {
        expect(cam.test(line), `${domain}: ${line}`).toBe(false);
      }
    }
  });

  it('câu mệnh lệnh nói đúng cái cấm của từng cấp (mục 10)', () => {
    const rng = createRng('menh-lenh');
    const seen = new Map<CheckTier, string>();
    for (let i = 0; i < 500 && seen.size < 5; i++) {
      const { result } = runCheck(rng, spec({ difficulty: i % 2 === 0 ? 'de-dang' : 'cuc-kho' }));
      seen.set(result.tier, result.narrativeHint);
    }

    expect(seen.get('costlySuccess')).toContain('KHÔNG được bỏ qua cái giá');
    expect(seen.get('fail')).toContain('KHÔNG được để hành động thành công');
    expect(seen.get('critFail')).toContain('mất trắng thành trì');
  });
});

// ---------------------------------------------------------------------------
// Mục 9 — đối kháng
// ---------------------------------------------------------------------------

describe('mục 9 — kiểm định đối kháng', () => {
  const attacker = spec({ id: 'check.cong', system: 'd20', domain: 'combat.don', base: 5 });
  const defender = spec({ id: 'check.thu', system: 'd20', domain: 'combat.ne', base: 3 });

  it('từ chối hai bên khác hệ', () => {
    expect(() => contestedCheck(createRng(SEED), attacker, { ...defender, system: 'd100' })).toThrow(
      /cùng hệ/,
    );
  });

  it('bên thắng luôn đạt mục tiêu, bên thua luôn hỏng', () => {
    const rng = createRng('doi-khang');
    for (let i = 0; i < 500; i++) {
      const outcome = contestedCheck(rng, attacker, defender);
      const won = outcome.winner === 'attacker' ? outcome.attacker : outcome.defender;
      const lost = outcome.winner === 'attacker' ? outcome.defender : outcome.attacker;

      expect(isSuccess(won.tier)).toBe(true);
      expect(isSuccess(lost.tier)).toBe(false);
      // Bên thắng phải có margin không thua bên kia.
      expect(outcome.winner === 'attacker' ? outcome.diff > 0 : outcome.diff <= 0).toBe(true);
    }
  });

  it('hòa thì bên phòng thủ thắng với cấp costlySuccess', () => {
    const rng = createRng('hoa');
    let ties = 0;
    for (let i = 0; i < 2000; i++) {
      const outcome = contestedCheck(rng, attacker, { ...defender, base: 5 });
      if (outcome.diff !== 0) continue;
      ties++;
      expect(outcome.winner).toBe('defender');
      expect(outcome.defender.tier).toBe('costlySuccess');
      expect(outcome.attacker.tier).toBe('fail');
    }
    expect(ties).toBeGreaterThan(0);
  });

  it('chênh lệch lớn đẩy hai bên ra hai đầu thang', () => {
    const rng = createRng('chenh-lech');
    let decisive = 0;
    for (let i = 0; i < 3000; i++) {
      const outcome = contestedCheck(rng, { ...attacker, base: 20 }, { ...defender, base: 0 });
      if (Math.abs(outcome.diff) < CONTEST_LADDER.d20.decisive) continue;
      decisive++;
      expect(outcome.attacker.tier).toBe('critSuccess');
      expect(outcome.defender.tier).toBe('critFail');
    }
    expect(decisive).toBeGreaterThan(0);
  });

  it('cấp đổi thì hệ quả và câu mệnh lệnh đổi theo', () => {
    const rng = createRng('he-qua-doi-khang');
    for (let i = 0; i < 200; i++) {
      const outcome = contestedCheck(rng, attacker, defender);
      for (const side of [outcome.attacker, outcome.defender]) {
        const need = consequenceKindFor(side.tier);
        if (need === null) expect(side.consequence).toBeUndefined();
        else expect(side.consequence?.kind).toBe(need);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Mục 11 và 12.6 — log và bước 2
// ---------------------------------------------------------------------------

describe('mục 11 — log và thống kê', () => {
  it('đếm theo hệ và theo cấp, hệ chưa chạy vẫn có dòng riêng', () => {
    const log = new CheckLog(null, 100);
    const rng = createRng(SEED);
    for (let i = 0; i < 50; i++) {
      log.record(1, runCheck(rng, spec()).result);
    }

    const stats = log.stats();
    expect(stats.map((row) => row.system)).toEqual(['d100', 'd20', '3d6', 'pool']);

    const d100 = stats.find((row) => row.system === 'd100');
    expect(d100?.total).toBe(50);
    expect(Object.values(d100?.byTier ?? {}).reduce((sum, count) => sum + count, 0)).toBe(50);
    expect(stats.find((row) => row.system === 'pool')?.total).toBe(0);
  });

  it('giữ đúng cửa sổ và nhớ lần tung gần nhất', () => {
    const log = new CheckLog(null, 10);
    const rng = createRng(SEED);
    for (let i = 0; i < 25; i++) log.record(i, runCheck(rng, spec()).result);

    expect(log.entries()).toHaveLength(10);
    expect(log.last()?.turn).toBe(24);
  });

  it('sink hỏng không làm hỏng lượt chơi', async () => {
    const log = new CheckLog({
      append: () => Promise.reject(new Error('Tầng B chưa có')),
      read: () => Promise.resolve([]),
    });
    log.record(1, runCheck(createRng(SEED), spec()).result);
    await Promise.resolve();
    expect(log.entries()).toHaveLength(1);
    expect(log.sinkFailures()).toHaveLength(1);
  });
});

describe('mục 12.6 — bước 2 của vòng lặp lượt', () => {
  const state = createInitialState('ban-do-thu');

  it('hành động rỗng KHÔNG rút xúc sắc', () => {
    const rng = createRng(SEED);
    const before = rng.getState().draws;
    const roll = resolveTurn({ kind: 'freeform', text: '   ' }, rng, state);

    expect(roll.checks).toHaveLength(0);
    expect(roll.timeCost).toBe(0);
    expect(rng.getState().draws).toBe(before);
  });

  it('tự nhận diện hành động thành đúng kỹ năng và hệ xúc xắc', () => {
    const roll = resolveTurn({ kind: 'freeform', text: 'trèo tường' }, createRng(SEED), state);
    expect(roll.checks).toHaveLength(1);
    expect(roll.checks[0]?.system).toBe('d100');
    expect(roll.checks[0]?.domain).toBe('skill.leo-treo');
    expect(roll.checks[0]?.baseLabel).toContain('Leo trèo');
    // Miền phải khớp `skill.*`, nếu không thì mọi nguồn của Phần 7/8 sẽ im lặng
    // không bao giờ chạy trong lượt tự do.
    expect(domainMatches('skill.*', roll.checks[0]?.domain ?? '')).toBe(true);
    expect(bucketFor(roll.checks[0]?.domain ?? '')).not.toBeNull();
  });

  it('cho người chơi chọn đè kỹ năng, hệ 3d6 và độ khó', () => {
    const roll = resolveTurn({
      kind: 'freeform',
      text: 'tổ chức lại cả hệ thống tiếp tế',
      checkSkillId: 'skill_hau-can',
      checkDifficulty: 'kho',
    }, createRng(SEED), state);

    expect(roll.checks[0]?.system).toBe('3d6');
    expect(roll.checks[0]?.domain).toBe('skill.hau-can');
    expect(roll.checks[0]?.difficulty).toBe('kho');
    expect(roll.checks[0]?.raw).toHaveLength(3);
  });

  it('hành động thuần kể chuyện không rút RNG nhưng vẫn tốn thời gian', () => {
    const rng = createRng(SEED);
    const before = rng.getState().draws;
    const roll = resolveTurn({ kind: 'freeform', text: 'ngồi nghe mưa', skipCheck: true }, rng, state);

    expect(roll.checks).toHaveLength(0);
    expect(roll.timeCost).toBeGreaterThan(0);
    expect(rng.getState().draws).toBe(before);
  });

  it('nguồn hỏng thành ghi chú cho AI chứ không thành ngoại lệ', () => {
    registerModifierSource({
      id: 'thu.no',
      domains: ['*'],
      compute: () => {
        throw new Error('bể');
      },
    });
    const roll = resolveTurn({ kind: 'freeform', text: 'đi tiếp' }, createRng(SEED), state);
    expect(roll.checks).toHaveLength(1);
    expect(roll.notes[0]).toContain('thu.no');
  });
});
