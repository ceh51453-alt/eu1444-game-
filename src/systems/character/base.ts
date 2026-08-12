/**
 * NĂNG LỰC NỀN của một phép kiểm — `CheckSpec.base` của Phần 5.
 *
 * CHIA VIỆC, và đây là chỗ dễ hiểu sai nhất của Phần 6:
 *
 *   `base`                 CHỈ có điểm rèn luyện
 *   dòng modifier riêng    chỉ số chính, đặc tính chủng tộc, sau này là trang bị
 *
 * Cộng lại vẫn đúng công thức của mục 1 — `kỹ năng% = chỉ số × 3 + rèn luyện +
 * trang bị` — nhưng bây giờ TỪNG VẾ hiện thành một dòng trong
 * `CheckResult.modifiers`. Đó là yêu cầu của README mục 8.4: game không có
 * reroll, nên người chơi phải đọc được vì sao mình hỏng. Một con số `base = 72`
 * gộp sẵn mọi thứ thì không ai truy ra được vế nào đã sai.
 *
 * File này CỐ Ý không import gì từ `systems/check`: `check/resolve.ts` gọi
 * ngược vào đây, và một vòng import giữa hai module chạy lúc khởi động là loại
 * lỗi chỉ nổ ở bản build production.
 */

import type { CheckSystem } from '@/core/turn';
import type { GameState } from '@/state/slices';
import { fallbackSkill, skillForDomain, skillOf } from './skills';
import { characterOf } from './slice';
import { skillContribution } from './stats';

/** Điểm rèn luyện thô của một kỹ năng, 0–100. Chưa học thì là 0. */
export function trainingLevel(state: GameState | null | undefined, skillId: string): number {
  return characterOf(state)?.skills[skillId]?.level ?? 0;
}

/** `CheckSpec.base` cho một kỹ năng cụ thể, quy sang đúng hệ của kỹ năng đó. */
export function skillBase(state: GameState | null | undefined, skillId: string): number {
  const skill = skillOf(skillId);
  if (skill === null) return 0;
  return skillContribution(skill.system, trainingLevel(state, skillId));
}

/** `CheckSpec.base` cho một MIỀN. Miền không thuộc kỹ năng nào thì nền là 0. */
export function domainBase(state: GameState | null | undefined, domain: string, system: CheckSystem): number {
  const skill = skillForDomain(domain);
  if (skill === null) return 0;
  return skillContribution(system, trainingLevel(state, skill.id));
}

/**
 * Nền của một lượt tự do — thay `DEFAULT_FREEFORM_SKILL` của Phần 5 mục 12.6.
 *
 * Một nhân vật chưa rèn `Ứng biến chung` thì nền bằng 0, và toàn bộ cơ hội đến
 * từ dòng chỉ số mà nguồn `character.chi-so` cộng vào. Đó là ý của mục 1: một
 * người bình thường (Trực giác 10) làm một việc không có nghề vẫn có 30% —
 * thấp hơn con số giả 50 của Phần 5, và thấp đúng như thiết kế.
 */
export function freeformBase(state: GameState | null | undefined): number {
  return trainingLevel(state, fallbackSkill().id);
}

/**
 * Tổng năng lực đọc được của một kỹ năng ở hệ d100 — `chỉ số × 3 + rèn luyện`.
 *
 * CHỈ dùng để HIỆN: bảng so sánh chủng tộc ở bước 1, phiếu nhân vật ở bước 9,
 * và test. Không phép kiểm nào được lấy con số này làm `base`, vì làm thế là
 * cộng chỉ số hai lần — một lần ở đây và một lần ở nguồn modifier.
 */
export function skillPercentOf(state: GameState | null | undefined, skillId: string): number {
  const skill = skillOf(skillId);
  if (skill === null) return 0;
  const stat = characterOf(state)?.stats[skill.stat] ?? 10;
  return stat * 3 + trainingLevel(state, skillId);
}
