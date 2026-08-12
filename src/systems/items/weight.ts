/**
 * TRỌNG LƯỢNG & MỆT MỎI (Phần 16 mục 9) — KHÔNG CHỈ TÍNH TỔNG CÂN NẶNG.
 *
 * Cả mục 9 nằm trong một nghịch lý có thật: giáp tấm vừa người NẶNG HƠN giáp
 * lưới dài mà MỆT ÍT HƠN, vì ba mươi cân trải đều lên toàn thân là ba mươi cân
 * mà người ta vẫn chạy, leo và lăn được, còn mười lăm cân treo hết trên vai thì
 * bóp lấy vai suốt cả ngày hành quân. Một hệ chỉ cộng cân nặng sẽ nói ngược lại,
 * và nói ngược lại là làm hỏng lý do lịch sử khiến giáp tấm thắng giáp lưới.
 *
 * Bốn chỗ đọc kết quả ở đây:
 *   Phần 9   `fatiguePerRound` cộng vào tiêu hao thể lực mỗi hiệp
 *   Phần 10  `speedPenalty` vào tốc độ và điểm khởi động
 *   Phần 11  `marchPenalty` vào sức bền hành quân
 *   mọi nơi  `swimPenalty` — và bơi qua sông thì gần như chắc chắn chìm
 */

import { armorPieceOf, carryConfig, carryModeOf, itemWeight, materialOf, shieldProfile } from './data';
import type { WornPiece } from './coverage';

export interface LoadOptions {
  /** Có đai và móc treo không. Thiếu thì giáp tấm cũng treo lên vai (mục 9). */
  belted?: boolean;
  /** Vai đang có thương tích — phạt CHỒNG với tải treo vai (mục 9, nối Phần 7). */
  hurtShoulder?: boolean;
  /** Món mang thêm ngoài giáp: vũ khí, hành lý, lương khô. */
  extraKg?: number;
}

export interface LoadReport {
  totalKg: number;
  /** Cân nặng theo từng cách mang — `toan-than`, `vai`, `dau`, `chi`. */
  byCarry: Record<string, number>;
  /** Điểm thể lực mất THÊM mỗi hiệp, cộng vào `staminaPerRound` của Phần 9. */
  fatiguePerRound: number;
  /** Trừ vào tốc độ và điểm khởi động của Phần 10. */
  speedPenalty: number;
  /** Trừ vào sức bền hành quân của Phần 11. */
  marchPenalty: number;
  /** Cộng vào ĐỘ KHÓ phép kiểm bơi. Số dương là khó hơn. */
  swimPenalty: number;
  /** Phần tải nằm trên vai — con số làm nên cả nghịch lý ở đầu file. */
  shoulderKg: number;
  belted: boolean;
  lines: string[];
}

/** Cân nặng thật của một món: cân mẫu nhân hệ số vật liệu (mục 6). */
export function weightOf(itemId: string, materialId: string): number {
  return Math.round(itemWeight(itemId) * materialOf(materialId).weightFactor * 100) / 100;
}

/**
 * Tính tải và phân bổ của một bộ đang mặc.
 *
 * Món không phải giáp cũng có cân nặng, nhưng chúng đi vào `extraKg` chứ không
 * vào bản đồ phân bổ: một túi lương khô đeo chéo không phải một bài toán về
 * cách tải nằm trên xương, và giả vờ rằng nó là thì sẽ làm loãng mất chỗ duy
 * nhất mà phân bổ có nghĩa.
 */
export function buildLoad(worn: readonly WornPiece[], options: LoadOptions = {}): LoadReport {
  const config = carryConfig();
  const belted = options.belted ?? true;
  const byCarry: Record<string, number> = {};
  const lines: string[] = [];

  let totalKg = options.extraKg ?? 0;
  let shoulderKg = 0;
  let fatigue = 0;

  for (const entry of worn) {
    const piece = armorPieceOf(entry.itemId);
    const shield = shieldProfile(entry.itemId);
    if (piece === null && shield === null) continue;

    const kg = weightOf(entry.itemId, entry.material);
    totalKg += kg;

    // Không đai thì tải "trải đều toàn thân" tụt về "treo trên vai" — đó là toàn
    // bộ nội dung của dòng "đeo lệch, thiếu đai → phạt thêm".
    const declared = piece?.carry ?? shield?.carry ?? 'toan-than';
    const mode = !belted && declared === 'toan-than' ? 'vai' : declared;
    byCarry[mode] = Math.round(((byCarry[mode] ?? 0) + kg) * 100) / 100;

    const row = carryModeOf(mode);
    let cost = kg * (row?.fatiguePerKg ?? 0);
    if (mode === 'vai') {
      shoulderKg += kg;
      if (options.hurtShoulder === true) cost *= config.hurtShoulderFactor;
    }
    if (!belted && declared === 'toan-than') cost *= 1 + config.unbeltedPenalty;
    fatigue += cost;
  }

  totalKg = Math.round(totalKg * 100) / 100;
  fatigue = Math.round(fatigue * 100) / 100;

  if (shoulderKg > 0) {
    lines.push(
      `${String(Math.round(shoulderKg * 10) / 10)} kg treo trên vai${
        options.hurtShoulder === true ? ' — và vai đang có thương tích' : ''
      }.`,
    );
  }
  if (!belted) lines.push('Không đai và móc treo: tải dồn hết lên vai.');
  if (totalKg >= 25) lines.push(`Tổng tải ${String(Math.round(totalKg))} kg — bơi qua sông là chìm.`);

  return {
    totalKg,
    byCarry,
    fatiguePerRound: fatigue,
    speedPenalty: Math.round(totalKg / 8),
    marchPenalty: Math.round(totalKg / 5),
    swimPenalty: Math.round(totalKg * config.swimPenaltyPerKg),
    shoulderKg: Math.round(shoulderKg * 10) / 10,
    belted,
    lines,
  };
}

/**
 * So hai bộ có cùng tổng cân nhưng khác cách phân bổ.
 *
 * Chỉ để hiện và để test: bài kiểm của mục 9 phải đọc được rằng cùng 15 kg thì
 * treo vai mệt hơn trải đều, chứ không phải tin lời chú thích.
 */
export function fatigueOf(kg: number, carryMode: string): number {
  return Math.round(kg * (carryModeOf(carryMode)?.fatiguePerKg ?? 0) * 100) / 100;
}
