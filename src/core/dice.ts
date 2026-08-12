/**
 * Dice primitives. Everything here is deterministic given an `Rng`.
 *
 * Nguyên tắc R1: engine tung xúc sắc TRƯỚC rồi mới đưa kết quả vào prompt.
 * Mọi hàm ở đây đều trả về đầy đủ chi tiết (từng mặt xúc sắc, từng cộng trừ)
 * để lớp trên có thể giải trình cho người chơi — game này không có reroll nên
 * minh bạch là bắt buộc.
 *
 * PHẠM VI PHẦN 0: chỉ những nguyên hàm được liệt kê ở mục 8.4. Bốn hệ xúc sắc
 * phân miền, thang 5 cấp kết quả và registry modifier thuộc về Phần 5.
 */

import type { Rng } from './rng';

/** Một cụm `NdM` trong chuỗi notation. */
export interface DiceTerm {
  /** Số viên xúc sắc. */
  count: number;
  /** Số mặt mỗi viên. */
  sides: number;
  /** `+1` cộng vào tổng, `-1` trừ khỏi tổng. */
  sign: 1 | -1;
  /** Giá trị từng viên, theo đúng thứ tự đã tung. */
  values: number[];
  /** Tổng của cụm này, đã tính dấu. */
  subtotal: number;
}

export interface DiceResult {
  /** Chuỗi gốc, giữ nguyên để hiện lại trong log. */
  notation: string;
  /** Tổng cuối cùng. */
  total: number;
  /** Các cụm xúc sắc. */
  terms: DiceTerm[];
  /** Tổng các số hằng (đã tính dấu). */
  modifier: number;
}

export interface RollUnderResult {
  /** Tung được bao nhiêu (1–100). */
  roll: number;
  /** Ngưỡng cần tung dưới hoặc bằng. */
  target: number;
  /** `true` khi `roll <= target`. */
  success: boolean;
  /** `target - roll`. Dương là thành công dư, âm là hụt bao nhiêu. */
  margin: number;
}

export type ContestWinner = 'attacker' | 'defender' | 'tie';

export interface ContestResult {
  winner: ContestWinner;
  /** Chênh lệch tuyệt đối giữa hai tổng. `0` khi hòa. */
  margin: number;
  attacker: { roll: number; modifier: number; total: number };
  defender: { roll: number; modifier: number; total: number };
}

/**
 * Bốn cấp kết quả cho Phần 0.
 * CHÚ Ý: Phần 5 thay bằng thang 5 cấp chuẩn hóa. Đừng xây luật gameplay lên
 * trên bốn cấp này.
 */
export type Degree = 'critFail' | 'fail' | 'success' | 'critSuccess';

export interface DegreeThresholds {
  /** Tung <= giá trị này là thành công lớn bất kể ngưỡng. */
  critSuccessAtOrBelow: number;
  /** Tung >= giá trị này là thất bại nặng bất kể ngưỡng. */
  critFailAtOrAbove: number;
}

export const DEFAULT_DEGREE_THRESHOLDS: DegreeThresholds = {
  critSuccessAtOrBelow: 5,
  critFailAtOrAbove: 96,
};

const MAX_DICE_COUNT = 1000;
const MAX_DICE_SIDES = 1000;

// Mỗi cụm: dấu tùy chọn, rồi hoặc `NdM` (N mặc định 1) hoặc một số hằng.
// Khoảng trắng nằm trong pattern chứ KHÔNG xóa trước — xóa trước thì "3d6 2"
// dính thành "3d62" và lọt qua như một notation hợp lệ.
const TERM_PATTERN = /\s*([+-]?)\s*(?:(\d*)\s*[dD]\s*(\d+)|(\d+))\s*/g;

/**
 * Tung theo notation, ví dụ `"3d6+2"`, `"d20"`, `"2d6+1d4-1"`.
 * Ném lỗi nếu chuỗi sai cú pháp — im lặng trả 0 sẽ giấu bug đến tận Phần 5.
 */
export function roll(rng: Rng, notation: string): DiceResult {
  if (notation.trim().length === 0) {
    throw new SyntaxError('dice.roll: notation rỗng');
  }

  const terms: DiceTerm[] = [];
  let modifier = 0;
  let consumed = 0;
  let isFirstTerm = true;

  TERM_PATTERN.lastIndex = 0;
  for (
    let match = TERM_PATTERN.exec(notation);
    match !== null;
    match = TERM_PATTERN.exec(notation)
  ) {
    if (match.index !== consumed) {
      throw new SyntaxError(`dice.roll: ký tự lạ trong "${notation}"`);
    }
    consumed = match.index + match[0].length;

    const signToken = match[1];
    if (signToken === '' && !isFirstTerm) {
      throw new SyntaxError(`dice.roll: thiếu dấu + hoặc - trong "${notation}"`);
    }
    const sign: 1 | -1 = signToken === '-' ? -1 : 1;
    isFirstTerm = false;

    const flat = match[4];
    if (flat !== undefined) {
      modifier += sign * Number.parseInt(flat, 10);
      continue;
    }

    const countToken = match[2];
    const sidesToken = match[3];
    if (sidesToken === undefined) {
      throw new SyntaxError(`dice.roll: thiếu số mặt trong "${notation}"`);
    }
    const count = countToken === undefined || countToken === '' ? 1 : Number.parseInt(countToken, 10);
    const sides = Number.parseInt(sidesToken, 10);

    if (count < 1 || count > MAX_DICE_COUNT) {
      throw new RangeError(`dice.roll: số viên phải trong 1..${MAX_DICE_COUNT}, nhận ${count}`);
    }
    if (sides < 1 || sides > MAX_DICE_SIDES) {
      throw new RangeError(`dice.roll: số mặt phải trong 1..${MAX_DICE_SIDES}, nhận ${sides}`);
    }

    const values: number[] = [];
    let sum = 0;
    for (let i = 0; i < count; i++) {
      const value = rng.int(1, sides);
      values.push(value);
      sum += value;
    }
    terms.push({ count, sides, sign, values, subtotal: sign * sum });
  }

  if (consumed !== notation.length) {
    throw new SyntaxError(`dice.roll: không đọc được "${notation}"`);
  }

  const total = terms.reduce((acc, term) => acc + term.subtotal, modifier);
  return { notation, total, terms, modifier };
}

/** Một viên d20. */
export function d20(rng: Rng): number {
  return rng.int(1, 20);
}

/** Một viên d100 (01–100). */
export function d100(rng: Rng): number {
  return rng.int(1, 100);
}

/**
 * Hệ tung-dưới trên d100: tung <= ngưỡng là thành công.
 * `target` được kẹp về 1..100 trước khi so — ngưỡng 0 hay 150 là lỗi ở lớp
 * gọi, nhưng ở đây không được crash giữa lượt (R4).
 */
export function rollUnder(rng: Rng, target: number): RollUnderResult {
  const clamped = Math.max(1, Math.min(100, Math.round(target)));
  const value = d100(rng);
  return {
    roll: value,
    target: clamped,
    success: value <= clamped,
    margin: clamped - value,
  };
}

/**
 * Đối kháng: hai bên cùng tung d20 rồi cộng modifier, ai cao hơn thì thắng.
 * TẠM THỜI cho Phần 0 — Phần 5 sẽ chốt hệ đối kháng thật.
 */
export function contest(rng: Rng, attackerMod: number, defenderMod: number): ContestResult {
  const attackerRoll = d20(rng);
  const defenderRoll = d20(rng);
  const attackerTotal = attackerRoll + attackerMod;
  const defenderTotal = defenderRoll + defenderMod;

  let winner: ContestWinner = 'tie';
  if (attackerTotal > defenderTotal) winner = 'attacker';
  else if (defenderTotal > attackerTotal) winner = 'defender';

  return {
    winner,
    margin: Math.abs(attackerTotal - defenderTotal),
    attacker: { roll: attackerRoll, modifier: attackerMod, total: attackerTotal },
    defender: { roll: defenderRoll, modifier: defenderMod, total: defenderTotal },
  };
}

/**
 * Xếp cấp kết quả cho một lần tung d100 tung-dưới.
 * Hàm thuần, không dùng RNG — nhận số đã tung nên test được trực tiếp.
 */
export function degreeOfSuccess(
  rollValue: number,
  target: number,
  thresholds: DegreeThresholds = DEFAULT_DEGREE_THRESHOLDS,
): Degree {
  if (rollValue <= thresholds.critSuccessAtOrBelow) return 'critSuccess';
  if (rollValue >= thresholds.critFailAtOrAbove) return 'critFail';
  return rollValue <= target ? 'success' : 'fail';
}
