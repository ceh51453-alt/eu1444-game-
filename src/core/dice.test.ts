import { describe, expect, it } from 'vitest';
import { createRng } from './rng';
import {
  contest,
  d100,
  d20,
  degreeOfSuccess,
  roll,
  rollUnder,
  type DiceResult,
} from './dice';

const SEED = 'xuc-xac-1444';

describe('dice — notation parsing', () => {
  it('parses "3d6+2" into terms plus a flat modifier', () => {
    const rng = createRng(SEED);
    const result = roll(rng, '3d6+2');

    expect(result.notation).toBe('3d6+2');
    expect(result.terms).toHaveLength(1);
    expect(result.terms[0]?.count).toBe(3);
    expect(result.terms[0]?.sides).toBe(6);
    expect(result.terms[0]?.values).toHaveLength(3);
    expect(result.modifier).toBe(2);
    expect(result.total).toBe((result.terms[0]?.subtotal ?? 0) + 2);
    expect(result.total).toBeGreaterThanOrEqual(5);
    expect(result.total).toBeLessThanOrEqual(20);
  });

  it('defaults the die count to 1 for "d20"', () => {
    const result = roll(createRng(SEED), 'd20');
    expect(result.terms[0]?.count).toBe(1);
    expect(result.terms[0]?.sides).toBe(20);
    expect(result.total).toBeGreaterThanOrEqual(1);
    expect(result.total).toBeLessThanOrEqual(20);
  });

  it('handles several terms and negative signs', () => {
    const result = roll(createRng(SEED), '2d6+1d4-1');
    expect(result.terms.map((t) => t.sides)).toEqual([6, 4]);
    expect(result.modifier).toBe(-1);
    expect(result.total).toBeGreaterThanOrEqual(2);
    expect(result.total).toBeLessThanOrEqual(15);
  });

  it('subtracts a negatively signed dice term', () => {
    const result = roll(createRng(SEED), '1d6-1d6');
    expect(result.terms[1]?.sign).toBe(-1);
    expect(result.terms[1]?.subtotal).toBeLessThanOrEqual(0);
  });

  it('tolerates whitespace and uppercase D', () => {
    const result = roll(createRng(SEED), ' 3 D 6 + 2 ');
    expect(result.terms[0]?.count).toBe(3);
    expect(result.terms[0]?.sides).toBe(6);
    expect(result.modifier).toBe(2);
  });

  it('throws instead of silently returning 0 on bad notation', () => {
    const rng = createRng(SEED);
    for (const bad of ['', 'abc', '3d', 'd', '3d6 2', '3d6++2', '3d6+']) {
      expect(() => roll(rng, bad)).toThrow();
    }
  });

  it('refuses absurd dice counts and sizes', () => {
    const rng = createRng(SEED);
    expect(() => roll(rng, '5000d6')).toThrow(RangeError);
    expect(() => roll(rng, '1d5000')).toThrow(RangeError);
    expect(() => roll(rng, '0d6')).toThrow(RangeError);
  });
});

describe('dice — reproducibility (R3)', () => {
  it('replays 1000 identical rolls from the same seed', () => {
    const a = createRng(SEED);
    const b = createRng(SEED);

    const left: DiceResult[] = Array.from({ length: 1000 }, () => roll(a, '3d6+2'));
    const right: DiceResult[] = Array.from({ length: 1000 }, () => roll(b, '3d6+2'));

    expect(left).toEqual(right);
    expect(left.map((r) => r.total)).toEqual(right.map((r) => r.total));
  });

  it('replays d20, d100, rollUnder and contest identically', () => {
    const a = createRng(SEED);
    const b = createRng(SEED);

    const left = Array.from({ length: 250 }, () => ({
      d20: d20(a),
      d100: d100(a),
      under: rollUnder(a, 55),
      versus: contest(a, 3, 1),
    }));
    const right = Array.from({ length: 250 }, () => ({
      d20: d20(b),
      d100: d100(b),
      under: rollUnder(b, 55),
      versus: contest(b, 3, 1),
    }));

    expect(left).toEqual(right);
  });
});

describe('dice — roll-under', () => {
  it('reports success and margin against the target', () => {
    const rng = createRng(SEED);
    for (let i = 0; i < 2000; i++) {
      const result = rollUnder(rng, 40);
      expect(result.roll).toBeGreaterThanOrEqual(1);
      expect(result.roll).toBeLessThanOrEqual(100);
      expect(result.success).toBe(result.roll <= 40);
      expect(result.margin).toBe(40 - result.roll);
    }
  });

  it('clamps an out-of-range target instead of crashing (R4)', () => {
    const rng = createRng(SEED);
    expect(rollUnder(rng, -20).target).toBe(1);
    expect(rollUnder(rng, 400).target).toBe(100);
  });

  it('lands near the stated probability over 100k rolls', () => {
    const rng = createRng('kiem-dinh-roll-under');
    const draws = 100000;
    let hits = 0;
    for (let i = 0; i < draws; i++) {
      if (rollUnder(rng, 35).success) hits++;
    }
    expect(Math.abs(hits / draws - 0.35)).toBeLessThan(0.01);
  });
});

describe('dice — contest', () => {
  it('names the higher total as winner and reports both sides', () => {
    const rng = createRng(SEED);
    for (let i = 0; i < 2000; i++) {
      const result = contest(rng, 4, -2);
      expect(result.attacker.total).toBe(result.attacker.roll + 4);
      expect(result.defender.total).toBe(result.defender.roll - 2);
      const expected =
        result.attacker.total > result.defender.total
          ? 'attacker'
          : result.defender.total > result.attacker.total
            ? 'defender'
            : 'tie';
      expect(result.winner).toBe(expected);
      expect(result.margin).toBe(Math.abs(result.attacker.total - result.defender.total));
    }
  });

  it('favours the side with the bigger modifier', () => {
    const rng = createRng('doi-khang');
    let attackerWins = 0;
    const rounds = 20000;
    for (let i = 0; i < rounds; i++) {
      if (contest(rng, 8, 0).winner === 'attacker') attackerWins++;
    }
    expect(attackerWins / rounds).toBeGreaterThan(0.8);
  });
});

describe('dice — degreeOfSuccess', () => {
  it('is a pure function of the roll and the target', () => {
    expect(degreeOfSuccess(1, 50)).toBe('critSuccess');
    expect(degreeOfSuccess(5, 50)).toBe('critSuccess');
    expect(degreeOfSuccess(6, 50)).toBe('success');
    expect(degreeOfSuccess(50, 50)).toBe('success');
    expect(degreeOfSuccess(51, 50)).toBe('fail');
    expect(degreeOfSuccess(95, 50)).toBe('fail');
    expect(degreeOfSuccess(96, 50)).toBe('critFail');
    expect(degreeOfSuccess(100, 50)).toBe('critFail');
  });

  it('lets a critical override an otherwise ordinary outcome', () => {
    // Ngưỡng rất cao vẫn có thể hỏng nặng, ngưỡng rất thấp vẫn có thể thành công lớn.
    expect(degreeOfSuccess(98, 99)).toBe('critFail');
    expect(degreeOfSuccess(3, 2)).toBe('critSuccess');
  });

  it('honours custom thresholds', () => {
    const strict = { critSuccessAtOrBelow: 1, critFailAtOrAbove: 100 };
    expect(degreeOfSuccess(5, 50, strict)).toBe('success');
    expect(degreeOfSuccess(96, 50, strict)).toBe('fail');
    expect(degreeOfSuccess(100, 50, strict)).toBe('critFail');
  });
});
