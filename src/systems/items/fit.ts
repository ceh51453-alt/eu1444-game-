/**
 * VỪA NGƯỜI (Phần 16 mục 8) — cơ chế đặc trưng, và mục "hai chỗ dễ bị làm hời
 * hợt" ở cuối đặc tả nói thẳng vì sao không được bỏ: ĐÓ LÀ THỨ KHIẾN CHIẾN LỢI
 * PHẨM TRỞ THÀNH TÀI SẢN PHẢI XỬ LÝ CHỨ KHÔNG PHẢI MỘT NÚT "TRANG BỊ NGAY".
 *
 * Cướp được bộ giáp của một hiệp sĩ tử trận thì món đó chủ yếu để BÁN hoặc để
 * ĐEM VỀ SỬA. Giáp lưới thì ngược lại — co giãn, ai mặc cũng tạm được, và đó
 * là ưu thế thật của nó ở đầu thế kỷ.
 *
 * MỘT CHỖ LỆCH KHỎI MÔ HÌNH CỦA MỤC 2, có lý do: mục 2 chỉ khai `fitTo` là một
 * `npcId`. Nhưng người được đo may thường là một hiệp sĩ đã chết ở một tỉnh
 * khác và không có mặt trong state nào cả — tra ngược ra vóc dáng của họ là bất
 * khả. Nên món giáp mang theo LUÔN `fitShape`: chủng tộc, chiều cao, cân nặng
 * lúc đo. `fitTo` vẫn còn, và nó vẫn là câu trả lời cho "bộ này của ai".
 */

import type { GameState } from '@/state/slices';
import { readPath } from '@/state/slices';
import { armorPieceOf, fitConfig, itemValue, type FitGrade } from './data';
import type { BodyShape, Item } from './types';

export type { BodyShape };

/** Ai đang mặc: id để so với `fitTo`, và vóc dáng để so với `fitShape`. */
export interface Wearer {
  /** Rỗng = nhân vật người chơi, đúng quy ước `CheckSpec.actor` của Phần 5. */
  id: string;
  shape: BodyShape;
}

export function shapeOfState(state: GameState | null | undefined): BodyShape {
  const race = readPath(state ?? {}, 'character.identity.race');
  const height = readPath(state ?? {}, 'character.appearance.heightCm');
  const weight = readPath(state ?? {}, 'character.appearance.weightKg');
  return {
    race: typeof race === 'string' ? race : '',
    heightCm: typeof height === 'number' ? height : 172,
    weightKg: typeof weight === 'number' ? weight : 72,
  };
}

export function wearerOfState(state: GameState | null | undefined, id = ''): Wearer {
  return { id, shape: shapeOfState(state) };
}

// ---------------------------------------------------------------------------
// Chấm mức vừa
// ---------------------------------------------------------------------------

function gradeRow(id: string): FitGrade {
  const grades = fitConfig().grades;
  const found = grades.find((grade) => grade.id === id);
  if (found !== undefined) return found;
  const first = grades[0];
  if (first === undefined) throw new Error('data/armor.json không khai mức vừa người nào');
  return first;
}

export interface FitResult {
  grade: FitGrade;
  wearable: boolean;
  /** Câu giải thích cho ô "Vừa người" của UI mục 18. */
  reason: string;
}

/**
 * Món này vừa với người này tới mức nào.
 *
 * BỐN MỨC CỦA MỤC 8, và mức thứ tư gộp hai đường không mặc được: khác chủng tộc
 * (khung xương khác, không có mức chênh nào cứu được — Lùn và Ogre không thể
 * đổi giáp cho nhau), và chênh lệch vượt quá cả ngưỡng xa nhất (một bộ giáp
 * lệch hai cỡ thì đơn giản là không cài lại được).
 */
export function fitOf(
  itemId: string,
  fitTo: string,
  fitShape: BodyShape | null,
  wearer: Wearer,
): FitResult {
  const piece = armorPieceOf(itemId);
  const config = fitConfig();

  if (piece === null || piece.fit === 'khong-can') {
    return { grade: gradeRow('vua'), wearable: true, reason: 'Không cần đo.' };
  }

  const sameRace =
    fitShape === null || fitShape.race === '' || wearer.shape.race === '' || fitShape.race === wearer.shape.race;

  if (piece.fit === 'co-gian') {
    // Giáp lưới co giãn: ai mặc cũng tạm được. Khác chủng tộc thì vẫn xộc xệch,
    // nhưng nó KHÔNG chặn — đó chính là điểm mạnh mà mục 8 nói tới.
    if (sameRace) return { grade: gradeRow('vua'), wearable: true, reason: 'Co giãn — vừa đủ dùng.' };
    return {
      grade: gradeRow('gan-vua'),
      wearable: true,
      reason: 'Co giãn nên mặc được, nhưng đây không phải bộ may cho khung xương này.',
    };
  }

  // Từ đây trở xuống là `do-may` — giáp tấm.
  if (config.raceStrict && !sameRace) {
    return {
      grade: gradeRow('khong-mac-duoc'),
      wearable: false,
      reason: 'Bộ này gò cho một khung xương khác chủng tộc — không cài lại được.',
    };
  }
  if (fitTo !== '' && fitTo === wearer.id) {
    return { grade: gradeRow('vua'), wearable: true, reason: 'Đo may cho đúng người này.' };
  }
  if (fitShape === null) {
    return {
      grade: gradeRow('khac-voc'),
      wearable: true,
      reason: 'Không đo cho ai cả — mọi khớp đều lệch một chút.',
    };
  }

  const dHeight = Math.abs(fitShape.heightCm - wearer.shape.heightCm);
  const dWeight =
    fitShape.weightKg <= 0 ? 100 : (Math.abs(fitShape.weightKg - wearer.shape.weightKg) / fitShape.weightKg) * 100;

  if (dHeight <= config.tolerance.heightCm && dWeight <= config.tolerance.weightPct) {
    return {
      grade: gradeRow('gan-vua'),
      wearable: true,
      reason: `Cùng vóc dáng, khác người (lệch ${String(Math.round(dHeight))} cm, ${String(Math.round(dWeight))}% cân).`,
    };
  }
  if (dHeight <= config.tolerance.farHeightCm && dWeight <= config.tolerance.farWeightPct) {
    return {
      grade: gradeRow('khac-voc'),
      wearable: true,
      reason: `Khác vóc dáng (lệch ${String(Math.round(dHeight))} cm, ${String(Math.round(dWeight))}% cân) — mệt rất nhanh.`,
    };
  }
  return {
    grade: gradeRow('khong-mac-duoc'),
    wearable: false,
    reason: `Lệch quá xa (${String(Math.round(dHeight))} cm, ${String(Math.round(dWeight))}% cân) — bộ giáp không khép lại được.`,
  };
}

/** Chấm mức vừa cho một vật phẩm thật — số đo lấy từ chính món ấy. */
export function fitOfItem(item: Item, wearer: Wearer): FitResult {
  return fitOf(item.templateId, item.fitTo, item.fitShape ?? null, wearer);
}

// ---------------------------------------------------------------------------
// Tổng hợp cho cả bộ
// ---------------------------------------------------------------------------

export interface FitPenalty {
  agi: number;
  speed: number;
  /** Cộng vào mức tiêu hao thể lực mỗi hiệp của Phần 9. */
  stamina: number;
  jointLock: number;
  /** Món không mặc được — UI phải chặn cứng, không chỉ hiện chữ đỏ. */
  refused: { itemId: string; reason: string }[];
  lines: { itemId: string; grade: string; reason: string }[];
}

/**
 * Cộng dồn phạt vừa người của cả bộ.
 *
 * Phạt AGI KHÔNG cộng thẳng: hai món lệch cỡ không làm người ta chậm gấp đôi,
 * họ chỉ chậm bằng món tệ nhất cộng một phần của phần còn lại. Cộng thẳng thì
 * một bộ mười hai mảnh cướp được sẽ cho ra một con số vô nghĩa.
 */
export function fitPenaltyOf(
  worn: readonly { itemId: string; fitTo: string; fitShape: BodyShape | null }[],
  wearer: Wearer,
): FitPenalty {
  const out: FitPenalty = { agi: 0, speed: 0, stamina: 0, jointLock: 0, refused: [], lines: [] };
  const agiValues: number[] = [];
  const speedValues: number[] = [];

  for (const entry of worn) {
    if (armorPieceOf(entry.itemId) === null) continue;
    const result = fitOf(entry.itemId, entry.fitTo, entry.fitShape, wearer);
    out.lines.push({ itemId: entry.itemId, grade: result.grade.id, reason: result.reason });
    if (!result.wearable) {
      out.refused.push({ itemId: entry.itemId, reason: result.reason });
      continue;
    }
    if (result.grade.agi !== 0) agiValues.push(result.grade.agi);
    if (result.grade.speed !== 0) speedValues.push(result.grade.speed);
    out.stamina += result.grade.stamina;
    out.jointLock += result.grade.jointLock;
  }

  const worst = (values: number[]): number => {
    if (values.length === 0) return 0;
    const sorted = values.slice().sort((left, right) => left - right);
    const head = sorted[0] ?? 0;
    const rest = sorted.slice(1).reduce((sum, value) => sum + value, 0);
    return Math.round(head + rest * 0.35);
  };

  out.agi = worst(agiValues);
  out.speed = worst(speedValues);
  out.stamina = Math.round(out.stamina * 10) / 10;
  return out;
}

// ---------------------------------------------------------------------------
// Sửa lại cho vừa (mục 8)
// ---------------------------------------------------------------------------

export interface RefitPlan {
  possible: boolean;
  skill: string;
  skillMin: number;
  weeks: number;
  cost: number;
  building: string;
  note: string;
}

/**
 * Kế hoạch sửa một món cho vừa người mới.
 *
 * "Sửa lại cho vừa cần thợ giáp giỏi, TỐN TIỀN VÀ TỐN NHIỀU TUẦN" (mục 8) — cả
 * ba vế đều phải là con số, nếu không thì người chơi sẽ mặc ngay bộ giáp cướp
 * được và cả cơ chế biến mất.
 */
export function refitPlan(itemId: string, fromGrade: string): RefitPlan {
  const config = fitConfig().refit;
  const base: RefitPlan = {
    possible: true,
    skill: config.skill,
    skillMin: config.skillMin,
    weeks: config.weeks,
    cost: Math.round(itemValue(itemId) * config.costPct),
    building: config.building,
    note: '',
  };

  if (fromGrade === 'vua') return { ...base, possible: false, weeks: 0, cost: 0, note: 'Đã vừa rồi.' };
  if (fromGrade === 'khong-mac-duoc') {
    // Khác chủng tộc thì không phải sửa mà là rèn lại từ đầu — gấp ba tuần công
    // và gấp bốn tiền, và đến lúc ấy thì mua mới thường rẻ hơn. Đó là câu trả
    // lời cơ học cho "cướp được bộ giáp của một hiệp sĩ thì chủ yếu để BÁN".
    return {
      ...base,
      weeks: config.weeks * 3,
      cost: Math.round(itemValue(itemId) * config.costPct * 4),
      note: 'Khung xương khác hẳn — gần như phải gò lại từ đầu.',
    };
  }
  if (fromGrade === 'khac-voc') {
    return { ...base, weeks: config.weeks * 2, cost: Math.round(itemValue(itemId) * config.costPct * 2) };
  }
  return base;
}
