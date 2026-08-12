/**
 * KIỂM ĐỊNH ĐỐI KHÁNG (Phần 5 mục 9).
 *
 * Ba luật của mục 9:
 *   1. Hai bên cùng tung TRONG CÙNG MỘT HỆ.
 *   2. So `margin`; chênh lệch quy ra cấp theo cùng bảng ở mục 4.
 *   3. Hòa → bên PHÒNG THỦ thắng, và cấp của họ là `costlySuccess`.
 *
 * Luật 3 là thứ giữ cho PvP không đứng hình: một trận đấu mà hòa nghĩa là không
 * ai làm gì được ai sẽ kéo dài vô tận. Bên phòng thủ giữ được thế, nhưng giữ
 * bằng một cái giá — nên thế trận vẫn nhích.
 *
 * Trong đối kháng thì kẻ thắng ĐÃ đạt mục tiêu và kẻ thua ĐÃ hỏng, nên hai đầu
 * thang không dùng tới: cấp của người thắng nằm trong
 * `costlySuccess → success → critSuccess`, của người thua nằm trong
 * `fail → critFail`. Chênh lệch càng lớn thì càng lệch về hai đầu.
 */

import type { CheckConsequence, CheckResult, CheckSystem, CheckTier } from '@/core/turn';
import type { Rng } from '@/core/rng';
import { CheckError } from './difficulty';
import { pickConsequence, consequenceKindFor, type ConsequenceTable } from './consequence';
import { narrativeHint } from './hint';
import { runCheck, type CheckOptions, type CheckSpec } from './run';

/**
 * Hai mốc chênh lệch cho mỗi hệ, suy thẳng từ khoảng cách trong bảng mục 4:
 *
 *   d20   `clear` 4  vì dưới −3 đã là thất bại · `decisive` 10 là mốc critSuccess
 *   d100  `clear` 11 vì cửa sổ costlySuccess rộng đúng 10 · `decisive` 30
 *   3d6   `clear` 3  vì cửa sổ costlySuccess rộng 2 · `decisive` 5 là mốc T−5
 *   pool  `clear` 1  vì hụt 1 hit đã là costlySuccess · `decisive` 3 là mốc R+3
 *
 * Một bảng duy nhất, để cân bằng đối kháng của PvP (Phần 9) và chiến trận
 * (Phần 10) sửa được ở một chỗ.
 */
export const CONTEST_LADDER: Readonly<Record<CheckSystem, { clear: number; decisive: number }>> = {
  d100: { clear: 11, decisive: 30 },
  d20: { clear: 4, decisive: 10 },
  '3d6': { clear: 3, decisive: 5 },
  pool: { clear: 1, decisive: 3 },
};

export type ContestSide = 'attacker' | 'defender';

export interface ContestOutcome {
  winner: ContestSide;
  attacker: CheckResult;
  defender: CheckResult;
  /** Chênh lệch CÓ DẤU: `margin` bên công trừ `margin` bên thủ. `0` là hòa. */
  diff: number;
  failures: { source: string; error: string }[];
}

function winnerTier(system: CheckSystem, diff: number): CheckTier {
  const ladder = CONTEST_LADDER[system];
  if (diff >= ladder.decisive) return 'critSuccess';
  if (diff >= ladder.clear) return 'success';
  return 'costlySuccess';
}

function loserTier(system: CheckSystem, diff: number): CheckTier {
  return diff >= CONTEST_LADDER[system].decisive ? 'critFail' : 'fail';
}

/**
 * Đổi cấp của một `CheckResult` rồi dựng lại phần phụ thuộc cấp.
 *
 * Hệ quả và câu mệnh lệnh phải sinh LẠI chứ không giữ nguyên: một cú tung riêng
 * lẻ ra `fail` nhưng thắng đối kháng thì cần một cái giá, mà bản cũ thì không
 * có. Giữ lại là để AI đọc một dòng "Cái giá engine đã định" mâu thuẫn với cấp
 * ngay bên trên nó.
 */
function retier(
  rng: Rng,
  result: CheckResult,
  tier: CheckTier,
  table: ConsequenceTable | undefined,
): CheckResult {
  const keep = result.consequence;
  const consequence: CheckConsequence | null =
    keep !== undefined && keep.kind === consequenceKindFor(tier)
      ? keep
      : pickConsequence(rng, tier, result.domain, table);

  const next: CheckResult = { ...result, tier, narrativeHint: narrativeHint(tier, consequence) };
  if (consequence === null) delete next.consequence;
  else next.consequence = consequence;
  return next;
}

/**
 * Chạy một đối kháng. Bên tấn công tung trước, luôn luôn — thứ tự rút xúc sắc
 * là một phần của R3, không được để nó phụ thuộc vào ai "nhanh hơn".
 */
export function contestedCheck(
  rng: Rng,
  attackerSpec: CheckSpec,
  defenderSpec: CheckSpec,
  options?: CheckOptions,
): ContestOutcome {
  if (attackerSpec.system !== defenderSpec.system) {
    throw new CheckError(
      `đối kháng phải cùng hệ (mục 9): bên công dùng ${attackerSpec.system}, bên thủ dùng ${defenderSpec.system}`,
    );
  }

  const attackerRun = runCheck(rng, attackerSpec, options);
  const defenderRun = runCheck(rng, defenderSpec, options);
  const system = attackerSpec.system;
  const table = options?.consequences;

  const gap = attackerRun.result.margin - defenderRun.result.margin;
  const winner: ContestSide = gap > 0 ? 'attacker' : 'defender';
  const diff = Math.abs(gap);

  // Hòa: bên thủ giữ được thế, nhưng giữ bằng một cái giá (luật 3 của mục 9).
  const attackerTier =
    winner === 'attacker' ? winnerTier(system, diff) : loserTier(system, diff);
  const defenderTier =
    winner === 'defender' ? (gap === 0 ? 'costlySuccess' : winnerTier(system, diff)) : loserTier(system, diff);

  return {
    winner,
    diff: gap,
    attacker: retier(rng, attackerRun.result, attackerTier, table),
    defender: retier(rng, defenderRun.result, defenderTier, table),
    failures: [...attackerRun.failures, ...defenderRun.failures],
  };
}
