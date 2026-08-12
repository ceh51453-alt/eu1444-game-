/**
 * LƯỢT THEO ĐIỂM KHỞI ĐỘNG (Phần 10 mục 4).
 *
 * Công thức của mục 4.1 được cài NGUYÊN VĂN, kể cả bốn phép chia cho 20:
 *
 *   d20 + (loại đơn vị) + (WIT chỉ huy) + sĩ khí/20 − mệt mỏi/20 − mất đội hình/20
 *
 * ĐÂY KHÔNG PHẢI MỘT PHÉP KIỂM. Nó không có ngưỡng, không có năm cấp, không có
 * hệ quả — nó chỉ xếp thứ tự. Nên nó KHÔNG đi qua `runCheck` của Phần 5: một cú
 * tung không phân thắng bại mà vẫn đẻ ra một `CheckResult` sẽ làm bảng thống kê
 * của tab Debug đầy những dòng vô nghĩa, và làm cả bài Monte Carlo của Phần 5 đọc
 * sai tỷ lệ thành công của hệ d20. Nó vẫn dùng đúng `Rng` đã seed (R3).
 *
 * VÌ SAO ĐIỂM KHỞI ĐỘNG CAO LÀ LỢI THẾ THẬT (mục 4, câu cuối): không phải vì đi
 * trước, mà vì đơn vị chưa hành động được PHẢN ỨNG. Kỵ binh nhẹ đi cuối cùng vẫn
 * kịp bắn vào lưng kẻ vừa chạy ngang qua; khối giáo dài đi cuối thì chỉ còn cách
 * cam chịu. `opportunityTargets` là chỗ vế đó thành cơ học.
 */

import type { Rng } from '@/core/rng';
import { battleConfig, timeOfDayOf, unitTypeOf } from './data';
import { arcOf, distance } from './grid';
import { canShoot } from './clash';
import { seesInDark } from './modifiers';
import { controllable, onField, otherSide, type BattleState, type BattleUnit } from './types';

export interface InitiativePart {
  label: string;
  value: number;
}

export interface InitiativeRoll {
  unitId: string;
  total: number;
  /** Bảng cộng trừ, để UI hiện được vì sao đơn vị này đi trước (mục 14). */
  parts: InitiativePart[];
}

/** WIT của tướng cầm đơn vị. Không ai cầm thì không có vế đó. */
function commanderWit(battle: BattleState, unit: BattleUnit): number {
  if (unit.commanderId === '') return 0;
  const officer = battle.officers.find((entry) => entry.id === unit.commanderId);
  if (officer === undefined || !officer.alive) return 0;
  // Thang chỉ số 1–20 quanh 10; điểm khởi động cộng phần LỆCH, không cộng cả con
  // số, nếu không thì một tướng trung bình đã đẩy mọi đơn vị lên mười điểm.
  return officer.wit - 10;
}

export function rollInitiativeFor(battle: BattleState, rng: Rng, unit: BattleUnit): InitiativeRoll {
  const config = battleConfig().initiative;
  const type = unitTypeOf(unit.typeId);
  const time = timeOfDayOf(battle.timeId);
  const parts: InitiativePart[] = [];

  const die = rng.int(1, 20);
  parts.push({ label: 'd20', value: die });

  const typeBonus = type?.initiative ?? 0;
  if (typeBonus !== 0) parts.push({ label: type?.name ?? 'binh chủng', value: typeBonus });

  const wit = commanderWit(battle, unit);
  if (wit !== 0) parts.push({ label: 'Trực giác chỉ huy', value: wit });

  const morale = unit.morale / config.moraleDivisor;
  const fatigue = -unit.fatigue / config.fatigueDivisor;
  const disorder = -(100 - unit.cohesion) / config.disorderDivisor;
  parts.push({ label: 'Sĩ khí', value: Math.round(morale * 10) / 10 });
  if (fatigue !== 0) parts.push({ label: 'Mệt mỏi', value: Math.round(fatigue * 10) / 10 });
  if (disorder !== 0) parts.push({ label: 'Mất đội hình', value: Math.round(disorder * 10) / 10 });

  // Mục 9b: ban đêm phạt điểm khởi động — trừ đơn vị nhìn được trong tối.
  let night = 0;
  if (time !== null && time.night && !seesInDark(unit)) {
    night = time.initiative;
    if (night !== 0) parts.push({ label: `${time.name}`, value: night });
  } else if (time !== null && !time.night && time.initiative !== 0) {
    night = time.initiative;
    parts.push({ label: `${time.name}`, value: night });
  }

  // GIỮ lệnh (mục 4.3): bỏ lượt vòng trước để chờ, và vòng này vào sớm hơn.
  const held = unit.holding ? config.holdBonus : 0;
  if (held !== 0) parts.push({ label: 'Đã giữ lệnh chờ', value: held });

  const total = die + typeBonus + wit + morale + fatigue + disorder + night + held;
  return { unitId: unit.id, total: Math.round(total * 10) / 10, parts };
}

/**
 * Tung điểm khởi động cho MỌI đơn vị và xếp giảm dần (mục 4.1–4.2).
 *
 * Thứ tự tung là thứ tự `battle.units`, cố định. Đổi nó là đổi mọi trận đánh của
 * mọi ván đã lưu mà không có gì trên màn hình nói ra (R3). Hòa điểm thì đơn vị
 * đứng trước trong danh sách đi trước — một luật tùy tiện nhưng ỔN ĐỊNH, và ổn
 * định là thứ R3 cần.
 */
export function rollInitiative(battle: BattleState, rng: Rng): InitiativeRoll[] {
  const rolls: InitiativeRoll[] = [];
  for (const unit of battle.units) {
    if (!onField(unit)) continue;
    const roll = rollInitiativeFor(battle, rng, unit);
    unit.initiative = roll.total;
    rolls.push(roll);
  }
  return rolls.sort((left, right) => right.total - left.total);
}

// ---------------------------------------------------------------------------
// Phản ứng cơ hội (mục 4.4)
// ---------------------------------------------------------------------------

export interface Reaction {
  /** Đơn vị ra đòn phản ứng. */
  unit: BattleUnit;
  /** Bắn theo, hay đánh vào sườn/lưng. */
  ranged: boolean;
  reason: string;
}

/**
 * Ai được đánh vào kẻ vừa đi ngang qua.
 *
 * Ba điều kiện, và cả ba đều nằm trong một câu của mục 4.4:
 *   · "đơn vị CHƯA HÀNH ĐỘNG"  → `!acted`, hoặc đang giữ lệnh chờ đúng lúc này
 *   · "bắn vào kẻ ĐI NGANG QUA" → mover nằm trong tầm bắn sau khi đã đi xong
 *   · "đánh vào sườn kẻ VỪA QUAY LƯNG" → cận chiến, và cung đòn không phải chính diện
 *
 * Mỗi đơn vị phản ứng một lần một vòng. Không có trần ấy thì một khối cung thủ
 * đứng giữa bản đồ sẽ bắn mười lăm loạt trong một vòng, và điểm khởi động — thứ
 * mục 4 dựng cả mục để làm cho có nghĩa — thành vô nghĩa.
 */
export function opportunityTargets(battle: BattleState, mover: BattleUnit, movedCells: number): Reaction[] {
  if (!onField(mover)) return [];
  const reactions: Reaction[] = [];

  for (const unit of battle.units) {
    if (unit.side === mover.side || !onField(unit) || !controllable(unit)) continue;
    if (unit.reacted) continue;
    if (unit.acted && !unit.holding) continue;

    const gap = distance(unit.pos, mover.pos);
    const arc = arcOf(mover.pos, mover.facing, unit.pos);

    // Cận chiến: chỉ khi kẻ kia thật sự QUAY LƯNG hoặc phơi sườn ra. Đơn vị đi
    // thẳng vào mặt mình thì không phải "đi ngang qua" — đó là một cuộc tấn công,
    // và nó đã được phân giải ở lượt của chính nó.
    if (gap <= 1 && arc !== 'front') {
      reactions.push({ unit, ranged: false, reason: `${mover.name} phơi ${arc === 'back' ? 'lưng' : 'sườn'} khi đi qua` });
      continue;
    }

    // Bắn theo: chỉ khi kẻ kia THẬT SỰ đã di chuyển. Đứng yên thì không ai gọi
    // là "đi ngang qua", và một loạt tên miễn phí mỗi vòng cho mọi cung thủ sẽ
    // làm cung thủ mạnh gấp đôi thiết kế.
    if (movedCells > 0 && canShoot(battle, unit, mover)) {
      reactions.push({ unit, ranged: true, reason: `${mover.name} chạy ngang tầm bắn` });
    }
  }

  return reactions;
}

/** Kẻ địch gần nhất còn trên bàn cờ. Bộ chọn nước đi của engine đọc hàm này. */
export function nearestEnemy(battle: BattleState, unit: BattleUnit): BattleUnit | null {
  let best: BattleUnit | null = null;
  let bestGap = Number.POSITIVE_INFINITY;
  for (const foe of battle.units) {
    if (foe.side === otherSide(unit.side) && onField(foe)) {
      const gap = distance(unit.pos, foe.pos);
      if (gap < bestGap) {
        best = foe;
        bestGap = gap;
      }
    }
  }
  return best;
}
