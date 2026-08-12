/**
 * BA NGUỒN MODIFIER CỦA PHẦN 8 (mục 9) — cắm vào registry của Phần 5.
 *
 *   `skills.nhanh`     hiệu ứng thường trực của mọi node đã mở
 *   `skills.the`       thế đang bật, được cái này mất cái kia
 *   `skills.hoc-tap`   đang dở một khóa học thì đầu óc để ở chỗ khác
 *
 * Mục 9 nói thẳng: "Mọi `effects` đăng ký qua registry Phần 5, không tính riêng
 * ở đâu cả." Nếu Phần 9 tự cộng hiệu ứng của chiêu thức vào cú tung đấu tay đôi
 * thì dòng đó biến mất khỏi `CheckResult.modifiers`, và người chơi mở được một
 * nhánh xong không bao giờ nhìn thấy nó làm gì cho mình.
 *
 * Node `technique` KHÔNG tự cộng gì trong mọi hoàn cảnh: phần lớn hiệu ứng của
 * chúng khai `whenAnyTag`, và chỉ bật khi hoàn cảnh có nhãn đó. Một chiêu đâm
 * khe giáp không giúp gì khi đối thủ mặc áo vải, và điều đó phải đúng cả trong
 * bảng điều chỉnh chứ không chỉ đúng trong lời kể.
 */

import {
  domainMatches,
  modifierSources,
  registerModifierSource,
  type Modifier,
  type ModifierContext,
  type ModifierSource,
} from '@/systems/check/registry';
import { penaltyFor, scaleToSystem } from '@/systems/check/sources';
import { effectApplies } from '@/systems/character/effects';
import { nodeOf } from './nodes';
import { skillsOf, type SkillsState } from './slice';

export const NODE_SOURCE_ID = 'skills.nhanh';
export const STANCE_SOURCE_ID = 'skills.the';
export const STUDY_SOURCE_ID = 'skills.hoc-tap';

/**
 * Phép kiểm này có phải của NHÂN VẬT NGƯỜI CHƠI không.
 *
 * `ctx.actor` rỗng nghĩa là người chơi (Phần 5). Cộng chiêu thức của người chơi
 * vào cú tung của một NPC là loại lỗi rất khó nhìn ra, vì kết quả vẫn "hợp lý".
 */
function playerSkills(ctx: ModifierContext): SkillsState | null {
  if (ctx.actor !== '') return null;
  return skillsOf(ctx.state);
}

/**
 * Hiệu ứng của MỘT node thành các dòng modifier, đã khớp miền, khớp nhãn và quy
 * đổi sang hệ đang chạy.
 *
 * Xuất ra ngoài vì Phần 9: đối thủ trong một trận quyết đấu cũng có node đã mở,
 * nhưng node của họ KHÔNG nằm ở `state.skills` — slice ấy là của nhân vật người
 * chơi. Nguồn `duel.chieu-thuc` gọi thẳng hàm này thay vì chép lại vòng lặp
 * khớp hiệu ứng, vì hai bản sao của cùng một luật là hai chỗ sẽ lệch, và lệch ở
 * đây nghĩa là cùng một chiêu mạnh yếu khác nhau tùy ai đang dùng nó.
 */
export function nodeModifierLines(nodeId: string, ctx: ModifierContext, source: string): Modifier[] {
  const node = nodeOf(nodeId);
  if (node === null) return [];

  const lines: Modifier[] = [];
  for (const effect of node.effects) {
    if (!effect.domains.some((pattern) => domainMatches(pattern, ctx.domain))) continue;
    if (!effectApplies(effect, ctx.tags)) continue;
    if (effect.value === 0) continue;

    if (effect.kind === 'dieShift') {
      lines.push({ label: node.name, value: effect.value, kind: 'dieShift', source });
      continue;
    }
    lines.push({ label: node.name, source, ...scaleToSystem(ctx.system, effect.value) });
  }
  return lines;
}

/**
 * Node đã mở — trừ `stance`, vì thế chỉ tính khi đang bật.
 *
 * Đây là chỗ điểm KN cuối cùng biến thành một con số người chơi đọc được. Một
 * nhánh đã mua mà không bao giờ hiện lên dòng nào thì với người chơi nó không
 * tồn tại.
 */
export const nodeSource: ModifierSource = {
  id: NODE_SOURCE_ID,
  domains: ['*'],
  compute(ctx) {
    const skills = playerSkills(ctx);
    if (skills === null) return null;

    const lines: Modifier[] = [];
    for (const id of skills.unlockedNodes) {
      if (nodeOf(id)?.kind === 'stance') continue;
      lines.push(...nodeModifierLines(id, ctx, NODE_SOURCE_ID));
    }
    return lines.length === 0 ? null : lines;
  },
};

/** Thế đang bật. Một kỹ năng một thế — cái giá của nó nằm ngay trong `effects`. */
export const stanceSource: ModifierSource = {
  id: STANCE_SOURCE_ID,
  domains: ['*'],
  compute(ctx) {
    const skills = playerSkills(ctx);
    if (skills === null) return null;

    const lines: Modifier[] = [];
    for (const nodeId of Object.values(skills.activeStance)) {
      if (nodeId === '') continue;
      if (!skills.unlockedNodes.includes(nodeId)) continue;
      lines.push(...nodeModifierLines(nodeId, ctx, STANCE_SOURCE_ID));
    }
    return lines.length === 0 ? null : lines;
  },
};

/**
 * ĐANG DỞ MỘT KHÓA HỌC (mục 8).
 *
 * "Trong lúc đó người chơi không làm việc khác" — mức phạt này là câu đó viết ra
 * thành cơ học. Không áp cho chính kỹ năng đang học: người ta đang luyện nó cả
 * ngày, nên đó là thứ duy nhất họ làm tốt hơn bình thường.
 */
export const studySource: ModifierSource = {
  id: STUDY_SOURCE_ID,
  domains: ['*'],
  compute(ctx) {
    const skills = playerSkills(ctx);
    const study = skills?.study ?? null;
    if (study === null) return null;

    const learning = `skill.${study.skillId.replace(/^skill_/u, '')}`;
    if (domainMatches(learning, ctx.domain)) return null;

    return [penaltyFor(ctx.system, 'Đang theo học, đầu óc để chỗ khác', 10, STUDY_SOURCE_ID)];
  },
};

export const SKILL_SOURCES: readonly ModifierSource[] = [nodeSource, stanceSource, studySource];

/**
 * Đăng ký một lần lúc khởi động. Gọi lại lần nữa không nổ — `main.tsx` gọi lúc
 * boot, còn test gọi sau mỗi lần dọn registry.
 */
export function registerSkillSources(): void {
  const already = new Set(modifierSources().map((source) => source.id));
  for (const source of SKILL_SOURCES) {
    if (already.has(source.id)) continue;
    registerModifierSource(source);
  }
}
