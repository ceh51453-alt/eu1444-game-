/**
 * BÀI TEST MONTE CARLO — Phần 5 mục 12.8 và 13.
 *
 * "Chạy 100.000 lần mỗi hệ, in ra bảng tỷ lệ 5 cấp, đối chiếu với kỳ vọng lý
 * thuyết. Lệch quá 1% là có bug."
 *
 * KỲ VỌNG Ở ĐÂY TÍNH TAY TỪ BẢNG CỦA MỤC 4, không lấy lại từ code. Đó là toàn
 * bộ giá trị của bài test này: nếu kỳ vọng cũng suy ra từ chính hàm đang kiểm
 * thì hai bên sẽ sai giống hệt nhau và bảng vẫn đẹp. README mục 3.5 nói thẳng —
 * bài này là cách duy nhất phát hiện ngưỡng 5 cấp đã cài lệch.
 *
 * Chạy qua `runCheck` chứ không qua hàm ngưỡng trần: như thế mới kiểm luôn được
 * thang độ khó, phép kẹp và bộ tung xúc sắc, chứ không chỉ mấy phép so sánh.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { createRng } from '@/core/rng';
import type { CheckSystem, CheckTier } from '@/core/turn';
import { TIER_LABELS, TIER_ORDER, resetModifierSources, runCheck, type CheckSpec } from './index';

/** Mục 12.8 nói rõ con số này. Đừng hạ xuống cho test chạy nhanh. */
const DRAWS = 100_000;

/** Lệch quá 1 điểm phần trăm là có bug. */
const TOLERANCE_PP = 1;

type Distribution = Record<CheckTier, number>;

function emptyDistribution(): Distribution {
  const out = {} as Distribution;
  for (const tier of TIER_ORDER) out[tier] = 0;
  return out;
}

function sample(seed: string, spec: CheckSpec, draws = DRAWS): Distribution {
  const rng = createRng(seed);
  const counts = emptyDistribution();
  for (let i = 0; i < draws; i++) {
    counts[runCheck(rng, spec).result.tier]++;
  }
  return counts;
}

/** Bảng của mục 13 — thứ phải nhìn trước khi cắm chỉ số thật vào. */
function report(system: CheckSystem, label: string, counts: Distribution, expected: Distribution): string {
  const lines = [`\n═══ ${system} — ${label} · ${DRAWS.toLocaleString('vi-VN')} lần ═══`];
  lines.push('cấp                    thực tế      kỳ vọng      lệch');
  for (const tier of TIER_ORDER) {
    const actual = (counts[tier] / DRAWS) * 100;
    const want = expected[tier];
    lines.push(
      `${TIER_LABELS[tier].padEnd(20)} ${actual.toFixed(3).padStart(8)}%  ${want.toFixed(3).padStart(8)}%  ${(actual - want).toFixed(3).padStart(7)}pp`,
    );
  }
  return lines.join('\n');
}

function expectMatches(system: CheckSystem, label: string, counts: Distribution, expected: Distribution): void {
  console.log(report(system, label, counts, expected));
  for (const tier of TIER_ORDER) {
    const actual = (counts[tier] / DRAWS) * 100;
    expect(
      Math.abs(actual - expected[tier]),
      `${system} · ${tier}: thực tế ${actual.toFixed(3)}% vs kỳ vọng ${expected[tier].toFixed(3)}%`,
    ).toBeLessThan(TOLERANCE_PP);
  }
}

beforeEach(() => {
  // Registry phải RỖNG: kỳ vọng lý thuyết ở dưới tính cho ngưỡng trần, một
  // nguồn modifier còn sót lại sẽ đẩy cả bảng đi mà không ai hiểu vì sao.
  resetModifierSources();
});

describe('Monte Carlo — mục 12.8', () => {
  it(
    'd100 tung-dưới, kỹ năng 55 độ khó Thường',
    () => {
      /*
        Đếm tay trên 100 mặt, T = 55:
          critSuccess    1..5    (01 luôn thắng lớn; floor(55/10) = 5)      →  5
          success        6..55                                             → 50
          costlySuccess  56..65  (cửa sổ T+10)                             → 10
          critFail       96..100 (≥96 và > T; 100 luôn hỏng nặng)          →  5
          fail           66..95                                            → 30
      */
      const expected: Distribution = {
        critSuccess: 5,
        success: 50,
        costlySuccess: 10,
        fail: 30,
        critFail: 5,
      };
      const counts = sample('mc-d100', {
        id: 'mc.d100',
        system: 'd100',
        domain: 'skill.kiem-thuat',
        difficulty: 'thuong',
        base: 55,
      });
      expectMatches('d100', 'kỹ năng 55 · Thường', counts, expected);
    },
    120_000,
  );

  it(
    'd20 + chỉ số 3 vs DC 12 (độ khó Thường)',
    () => {
      /*
        margin = roll + 3 − 12 = roll − 9, trên 20 mặt:
          critSuccess    margin ≥ +10 → roll 19, 20                        →  2
          success        margin ≥  0  → roll 9..18                         → 10
          costlySuccess  margin ≥ −3  → roll 6, 7, 8                       →  3
          fail           margin ≥ −10 → roll 1..5                          →  5
        Rồi nat 1 hạ một bậc: roll 1 từ fail xuống critFail.
        Nat 20 nâng một bậc nhưng roll 20 đã là critSuccess, kẹp ở đỉnh thang.
          → critSuccess 2, success 10, costlySuccess 3, fail 4, critFail 1
      */
      const expected: Distribution = {
        critSuccess: 10,
        success: 50,
        costlySuccess: 15,
        fail: 20,
        critFail: 5,
      };
      const counts = sample('mc-d20', {
        id: 'mc.d20',
        system: 'd20',
        domain: 'combat.don',
        difficulty: 'thuong',
        base: 3,
      });
      expectMatches('d20', 'chỉ số +3 · DC 12', counts, expected);
    },
    120_000,
  );

  it(
    '3d6 tung-dưới, ngưỡng 12 độ khó Thường',
    () => {
      /*
        216 tổ hợp. Số cách ra từng tổng: 3:1 4:3 5:6 6:10 7:15 8:21 9:25
        10:27 11:27 12:25 13:21 14:15 15:10 16:6 17:3 18:1.
          critSuccess    tổng ≤ 7  (T−5)                       1+3+6+10+15 =  35
          success        tổng 8..12                     21+25+27+27+25     = 125
          costlySuccess  tổng 13, 14                            21+15      =  36
          fail           tổng 15, 16                            10+6       =  16
          critFail       tổng ≥ 17 (luôn luôn)                  3+1        =   4
        Cộng lại đúng 216.
      */
      const expected: Distribution = {
        critSuccess: (35 / 216) * 100,
        success: (125 / 216) * 100,
        costlySuccess: (36 / 216) * 100,
        fail: (16 / 216) * 100,
        critFail: (4 / 216) * 100,
      };
      const counts = sample('mc-3d6', {
        id: 'mc.3d6',
        system: '3d6',
        domain: 'admin.xay-dung',
        difficulty: 'thuong',
        base: 12,
      });
      expectMatches('3d6', 'ngưỡng 12 · Thường', counts, expected);
    },
    120_000,
  );

  it(
    'dice pool 8 viên, cần 2 thành công (độ khó Thường)',
    () => {
      /*
        Mỗi viên d6: thành công (5–6) p = 1/3, mặt 1 p = 1/6, còn lại p = 1/2.
        Kỳ vọng tính bằng đa thức đầy đủ trên (số thành công, số mặt 1), rồi xếp
        cấp bằng một bản cài ĐỘC LẬP viết thẳng từ chữ của mục 4 — nếu `poolTier`
        trôi khỏi đặc tả thì hai bên lệch nhau ngay.
      */
      const expected = poolExpectation(8, 2);
      const counts = sample('mc-pool', {
        id: 'mc.pool',
        system: 'pool',
        domain: 'combat.xung-phong',
        difficulty: 'thuong',
        base: 8,
      });
      expectMatches('pool', '8 viên · cần 2 hit', counts, expected);
    },
    120_000,
  );
});

// ---------------------------------------------------------------------------
// Kỳ vọng lý thuyết của dice pool
// ---------------------------------------------------------------------------

function choose(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let out = 1;
  for (let i = 0; i < k; i++) out = (out * (n - i)) / (i + 1);
  return out;
}

/** Bản cài ĐỘC LẬP của mục 4, viết thẳng từ đặc tả. Không gọi `poolTier`. */
function classifyPool(successes: number, ones: number, required: number): CheckTier {
  if (ones > successes) return 'critFail';
  if (successes >= required + 3) return 'critSuccess';
  if (successes >= required) return 'success';
  if (successes === required - 1) return 'costlySuccess';
  return 'fail';
}

function poolExpectation(dice: number, required: number): Distribution {
  const out = emptyDistribution();
  for (let successes = 0; successes <= dice; successes++) {
    for (let ones = 0; ones + successes <= dice; ones++) {
      const rest = dice - successes - ones;
      const probability =
        choose(dice, successes) *
        choose(dice - successes, ones) *
        Math.pow(1 / 3, successes) *
        Math.pow(1 / 6, ones) *
        Math.pow(1 / 2, rest);
      out[classifyPool(successes, ones, required)] += probability * 100;
    }
  }
  return out;
}
