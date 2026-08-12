/**
 * TRẠNG THÁI TOÀN THÂN (Phần 7 mục 2) — hàm THUẦN, không RNG, không state ngoài.
 *
 * Đây là chỗ danh sách `Injury[]` biến thành bảy con số mà cả game đọc: đau,
 * sốc, ý thức, vận động, cầm nắm hai tay, thể lực. Chúng chạy ở bước 7 của vòng
 * lặp lượt qua `derived` của slice, và chạy lại trong mọi nguồn modifier —
 * nghĩa là chúng phải RẺ. Không tra data trong vòng lặp trong, không dựng mảng
 * trung gian không cần thiết.
 *
 * ĐAU CỘNG THEO KIỂU HAO MÒN, không cộng thẳng: `1 − Π(1 − pᵢ)`. Cộng thẳng thì
 * bốn vết xây xát đã đủ làm nhân vật ngất, mà bốn vết xây xát thì không. Cách
 * này giữ đúng trực giác: vết nặng quyết định phần lớn, những vết nhỏ chỉ đắp
 * thêm phần còn lại.
 *
 * WIL CHIA ĐAU ĐÚNG MỘT LẦN — ở `painOf`. Mục 2 và mục 5 đều nhắc tới WIL, và
 * đó là cùng một phép chia: con số hiện trên thanh "Đau" LÀ mức đau sau ý chí,
 * còn dòng modifier chỉ quy nó sang thang d100. Chia hai lần thì một nhân vật
 * WIL 16 gần như miễn nhiễm với thương tích.
 */

import { complicationOf, diseaseOf, permanentOf, prostheticOf, wholeBodyTuning } from './catalog';
import { regionOf, type Hand } from './regions';
import type { BodyState, Injury } from './slice';

const T = wholeBodyTuning();

export function bloodMax(): number {
  return T.bloodMax;
}

function clamp01to100(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** WIL sau khi cộng phần thưởng tạm thời của cầu nguyện (mục 6). */
export function effectiveWil(body: BodyState, wil: number, turn: number): number {
  const bonus = body.will.untilTurn > turn ? body.will.bonus : 0;
  return Math.max(1, wil + bonus);
}

/** Cộng hao mòn: mỗi vết chỉ ăn phần còn lại. */
function combine(values: readonly number[]): number {
  let remaining = 1;
  for (const value of values) {
    remaining *= 1 - clamp01to100(value) / 100;
  }
  return (1 - remaining) * 100;
}

// ---------------------------------------------------------------------------
// Đau
// ---------------------------------------------------------------------------

/**
 * Đau tổng 0–100, đã trừ theo ý chí.
 *
 * Bệnh (Phần 15) góp thẳng `painPerTurn` vào bể đau như một mức đứng yên. Phần 7
 * chỉ nuôi cái bể đó; con số của từng bệnh là việc của Phần 15 chốt.
 */
export function painOf(body: BodyState, wil: number, turn = Number.MAX_SAFE_INTEGER): number {
  const parts: number[] = [];
  for (const injury of body.injuries) {
    if (injury.healProgress >= 100) continue;
    parts.push(injury.pain);
  }
  for (const disease of body.diseases) {
    if (disease.incubating) continue;
    parts.push(diseaseOf(disease.id)?.painPerTurn ?? 0);
  }
  if (parts.length === 0) return 0;

  const raw = combine(parts);
  const relief = T.painWilReference / (T.painWilFloor + effectiveWil(body, wil, turn));
  return round1(clamp01to100(raw * relief));
}

// ---------------------------------------------------------------------------
// Sốc
// ---------------------------------------------------------------------------

/**
 * Sốc: đau cộng mất máu cộng cú sốc của những vết VỪA nhận.
 *
 * Vế "vừa nhận" là thứ tách sốc khỏi đau: một vết nặng ba tuần trước vẫn đau
 * như thế, nhưng nó không còn làm người ta ngã khỏi lưng ngựa nữa.
 */
export function shockOf(body: BodyState, wil: number, turn: number): number {
  const pain = painOf(body, wil, turn);
  const bloodLost = Math.max(0, T.bloodMax - body.blood);

  let fresh = 0;
  for (const injury of body.injuries) {
    if (turn - injury.inflictedTurn > T.shockFreshTurns) continue;
    if (injury.healProgress >= 100) continue;
    fresh += injury.severity * T.shockFreshPerSeverity;
  }

  const relief = T.painWilReference / (T.painWilFloor + effectiveWil(body, wil, turn));
  return round1(
    clamp01to100(pain * T.shockPainWeight + bloodLost * T.shockBloodWeight + fresh * relief),
  );
}

// ---------------------------------------------------------------------------
// Ý thức
// ---------------------------------------------------------------------------

export interface ConsciousnessLevel {
  id: string;
  name: string;
}

/**
 * Bốn mức của mục 2. Đi từ NẶNG nhất xuống: chỉ cần MỘT điều kiện chạm là rơi
 * xuống mức đó — hôn mê vì mất máu và hôn mê vì sốt là hai đường khác nhau tới
 * cùng một chỗ, và mục 9 đòi cả hai đường đều tồn tại.
 */
export function consciousnessOf(body: BodyState, wil: number, turn: number): ConsciousnessLevel {
  const pain = painOf(body, wil, turn);
  const shock = shockOf(body, wil, turn);
  const levels = T.consciousness;

  for (let index = levels.length - 1; index >= 1; index--) {
    const level = levels[index];
    if (level === undefined) continue;
    const hit =
      (level.bloodBelow !== undefined && body.blood < level.bloodBelow) ||
      (level.painAtLeast !== undefined && pain >= level.painAtLeast) ||
      (level.feverAtLeast !== undefined && body.fever >= level.feverAtLeast) ||
      (level.shockAtLeast !== undefined && shock >= level.shockAtLeast);
    if (hit) return { id: level.id, name: level.name };
  }

  const first = levels[0];
  return { id: first?.id ?? 'tinh', name: first?.name ?? 'tỉnh' };
}

// ---------------------------------------------------------------------------
// Vận động, cầm nắm, thể lực
// ---------------------------------------------------------------------------

/**
 * Phần mức phạt mà dụng cụ hỗ trợ gánh bớt, 0–1 (mục 8).
 *
 * KHÔNG BAO GIỜ tới 1: chân giả cho đi lại được, không cho chạy. Trần đó nằm ở
 * schema của `prosthetics` chứ không ở đây, để người cân bằng thấy nó ngay
 * trong file data.
 */
export function prostheticRelief(body: BodyState, permanentId: string): number {
  let best = 0;
  for (const owned of body.prosthetics) {
    const prosthetic = prostheticOf(owned);
    if (prosthetic === null || !prosthetic.for.includes(permanentId)) continue;
    best = Math.max(best, prosthetic.relief);
  }
  return best;
}

/** Mức phạt vĩnh viễn còn lại sau khi trừ phần dụng cụ hỗ trợ gánh bớt. */
function afterProsthetic(body: BodyState, permanentId: string, penalty: number): number {
  if (penalty === 0) return 0;
  return penalty * (1 - prostheticRelief(body, permanentId));
}

/**
 * Khả năng di chuyển 0–100%.
 *
 * Mục 5: nó ảnh hưởng cả hành quân CẤP CHIẾN DỊCH, không chỉ đánh nhau. Đó là
 * lý do nó là một con số toàn thân chứ không phải một mức phạt riêng của miền
 * chiến đấu — Phần 10 và Phần 13 đọc thẳng con số này.
 */
export function mobilityOf(body: BodyState): number {
  let penalty = 0;

  for (const injury of body.injuries) {
    if (injury.healProgress >= 100) continue;
    const region = regionOf(injury.regionId);
    if (region === null || region.mobilityWeight === 0) continue;
    penalty += injury.severity * T.mobilityPerSeverity * region.mobilityWeight;
  }

  for (const entry of body.permanent) {
    const row = permanentOf(entry.id);
    if (row === null) continue;
    penalty += afterProsthetic(body, entry.id, row.mobilityPenalty);
  }

  penalty += Math.max(0, T.bloodMax - body.blood) * T.mobilityBloodWeight;
  return Math.round(clamp01to100(100 - penalty));
}

/** Khả năng cầm nắm của MỘT bên tay, 0–100% (mục 2). */
export function gripOf(body: BodyState, hand: Hand): number {
  let penalty = 0;

  for (const injury of body.injuries) {
    if (injury.healProgress >= 100) continue;
    const region = regionOf(injury.regionId);
    if (region === null || region.grip !== hand || region.gripWeight === 0) continue;
    penalty += injury.severity * T.gripPerSeverity * region.gripWeight;
  }

  for (const entry of body.permanent) {
    const row = permanentOf(entry.id);
    if (row === null || row.gripLoss === 0) continue;
    // Tàn phế ghi kèm vùng, nên biết nó thuộc tay nào. Vùng rỗng (liệt nửa
    // người) tính cho cả hai tay — đó chính là nghĩa của "nửa người".
    const region = entry.regionId === '' ? null : regionOf(entry.regionId);
    if (region !== null && region.grip !== hand) continue;
    penalty += afterProsthetic(body, entry.id, row.gripLoss);
  }

  return Math.round(clamp01to100(100 - penalty));
}

/** Thể lực 0–100 — một trong năm thanh của mục 10. */
export function staminaOf(body: BodyState): number {
  let penalty = 0;

  for (const injury of body.injuries) {
    if (injury.healProgress >= 100) continue;
    const region = regionOf(injury.regionId);
    if (region === null || region.staminaWeight === 0) continue;
    penalty += injury.severity * T.staminaPerSeverity * region.staminaWeight;
  }

  penalty += Math.max(0, T.bloodMax - body.blood) * T.staminaBloodWeight;
  penalty += body.fever * T.staminaFeverWeight;
  return Math.round(clamp01to100(100 - penalty));
}

export function injuryCount(body: BodyState): number {
  return body.injuries.filter((injury) => injury.healProgress < 100).length;
}

// ---------------------------------------------------------------------------
// Sốt
// ---------------------------------------------------------------------------

/**
 * Mức sốt mà cơ thể đang HƯỚNG TỚI. Sốt không nhảy tới nơi ngay: mỗi lượt nó
 * bò về phía đích một bước `feverStep`, nên người chơi có mấy lượt để thấy nó
 * đang lên và còn kịp làm gì đó.
 */
export function feverTargetOf(body: BodyState): number {
  let worstInfection = 0;
  let extra = 0;

  for (const injury of body.injuries) {
    if (injury.healProgress >= 100) continue;
    worstInfection = Math.max(worstInfection, injury.infection);
    for (const complication of injury.complications) {
      extra += complicationOf(complication.id)?.perTurn.feverTarget ?? 0;
    }
  }

  for (const disease of body.diseases) {
    if (disease.incubating) continue;
    worstInfection = Math.max(worstInfection, diseaseOf(disease.id)?.feverTarget ?? 0);
  }

  return clamp01to100(worstInfection * T.feverFromInfection + extra);
}

// ---------------------------------------------------------------------------
// Quy ra mức phạt (thang d100, dương là nặng)
// ---------------------------------------------------------------------------

/** Phạt lũy tiến theo máu còn lại (mục 5). */
export function bloodPenalty(blood: number): number {
  let penalty = 0;
  for (const step of T.bloodPenaltyLadder) {
    if (blood < step.below) penalty = Math.max(penalty, step.penalty);
  }
  return penalty;
}

/** Phạt theo đau. `pain` đã trừ WIL rồi — đừng chia lần nữa. */
export function painPenalty(pain: number): number {
  return Math.round(pain * T.painFactor);
}

/** Phạt theo sốt. Dưới sàn thì chưa phạt: sốt nhẹ là khó chịu, không phải tàn tật. */
export function feverPenalty(fever: number): number {
  if (fever < T.feverPenaltyFloor) return 0;
  return Math.round((fever - T.feverPenaltyFloor) * T.feverPenaltyFactor);
}

/** Phạt theo mức vận động đã mất. */
export function mobilityPenalty(mobility: number): number {
  return Math.round(Math.max(0, 100 - mobility) * T.mobilityPenaltyFactor);
}

/** Mức phạt gốc của MỘT vết thương lên miền mà vùng của nó chi phối. */
export function injuryPenalty(injury: Injury, gripFactor = 1): number {
  return Math.round(injury.severity * T.regionPenaltyPerSeverity * gripFactor);
}

export function gripPenaltyFactor(): number {
  return T.regionPenaltyGripFactor;
}
