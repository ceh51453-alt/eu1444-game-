/**
 * BƯỚC 2 CỦA VÒNG LẶP LƯỢT (Phần 5 mục 12.6).
 *
 * Đây là chỗ Phần 5 thay thế `placeholderResolver` của Phần 3. Điều phải đúng
 * ngay từ đầu vẫn là THỨ TỰ: xúc sắc tung xong mới tới lượt AI đọc kết quả (R1).
 * Cái mới của Phần 5 là kết quả đó bây giờ đi qua đủ bộ máy thật — thang độ
 * khó, registry modifier, thang 5 cấp, và một cái giá do engine chọn.
 *
 * Lượt tự do được xếp vào kỹ năng TRƯỚC lời gọi AI: người chơi có thể chọn rõ
 * trên UI, hoặc để bộ nhận diện cơ học chọn và vẫn có thể kiểm tra/đổi lại.
 * Không để model chọn sau khi đã kể, vì khi ấy nó đã nhìn thấy kết quả và R1
 * không còn được bảo đảm.
 *
 * PHẦN 6 ĐÃ THAY con số giả: nền bây giờ là điểm rèn luyện thật của kỹ năng
 * `Ứng biến chung`, còn chỉ số chính đi vào qua nguồn `character.chi-so` thành
 * một dòng đọc được. `DEFAULT_FREEFORM_SKILL` chỉ còn là đường lui cho state
 * chưa có nhân vật — test của các phần khác dựng state không đăng ký slice
 * `character`, và một lượt tự do ở đó vẫn phải chạy chứ không được nổ.
 */

import type { RollContext, TurnInput } from '@/core/turn';
import type { Rng } from '@/core/rng';
import type { GameState } from '@/state/slices';
import { characterOf } from '@/systems/character/slice';
import { domainBase, freeformBase } from '@/systems/character/base';
import {
  domainOfSkill,
  fallbackSkill,
  inferSkillForAction,
  skillName,
  skillOf,
} from '@/systems/character/skills';
import { runCheck, type CheckSpec } from './run';

/** Năng lực nền khi state chưa có nhân vật nào. */
export const DEFAULT_FREEFORM_SKILL = 50;

/**
 * Nền của lượt tự do.
 *
 * Có nhân vật thì lấy điểm rèn luyện thật (thường là 0 lúc mới tạo) và để chỉ
 * số nói phần còn lại qua registry. Chưa có nhân vật thì lùi về con số giả cũ.
 */
export function freeformSkillFor(state: GameState): number {
  return characterOf(state) === null ? DEFAULT_FREEFORM_SKILL : freeformBase(state);
}

/**
 * Phép kiểm mặc định của một lượt tự do.
 *
 * Miền `skill.chung` là miền có thật trong bảng hệ quả, không phải chuỗi rỗng:
 * miền rỗng thì `bucketFor` rơi thẳng xuống `*` và mọi nguồn modifier khai
 * `skill.*` sẽ im lặng không bao giờ chạy — đúng loại lệch mà mục 7 cảnh báo.
 */
export const FREEFORM_CHECK: Omit<CheckSpec, 'base'> = {
  id: 'check.hanh-dong',
  system: 'd100',
  domain: 'skill.chung',
  difficulty: 'thuong',
};

/** Số phút trong game một hành động tự do tiêu tốn. Phần 13 chốt thời gian thật. */
export const FREEFORM_TIME_COST = 10;

/**
 * Chạy bước 2 cho một hành động tự do.
 *
 * Hành động rỗng KHÔNG tung xúc sắc, và đó là chủ ý: rút một con xúc sắc rồi
 * vứt đi vẫn làm dòng RNG nhích, nên hai ván cùng seed sẽ lệch nhau chỉ vì một
 * người lỡ bấm gửi lúc ô nhập còn trống (R3).
 */
export function resolveTurn(action: TurnInput, rng: Rng, state: GameState): RollContext {
  if (action.text.trim() === '') {
    return { checks: [], timeCost: 0, notes: [] };
  }
  if (action.skipCheck === true) {
    return {
      checks: [],
      timeCost: FREEFORM_TIME_COST,
      notes: ['Người chơi đánh dấu đây là hành động thuần kể chuyện, engine không tung xúc xắc.'],
    };
  }

  const explicit = action.checkSkillId === undefined ? null : skillOf(action.checkSkillId);
  const skill = explicit ?? inferSkillForAction(action.text);
  const domain = domainOfSkill(skill.id);
  const system = skill.system;
  const fallback = fallbackSkill().id === skill.id;
  const base = characterOf(state) === null
    ? DEFAULT_FREEFORM_SKILL
    : (fallback ? freeformBase(state) : domainBase(state, domain, system));
  const run = runCheck(rng, {
    id: `check.${skill.id.replace(/^skill_/u, '')}`,
    system,
    domain,
    difficulty: action.checkDifficulty ?? FREEFORM_CHECK.difficulty,
    base,
    baseLabel: `${skillName(skill.id)} · cấp kỹ năng`,
    state,
  });

  const notes = run.failures.map(
    (failure) => `Nguồn modifier "${failure.source}" hỏng, phép kiểm chạy thiếu nó: ${failure.error}`,
  );

  notes.push(
    explicit === null && !fallback
      ? `Engine tự nhận diện kỹ năng: ${skillName(skill.id)}. Người chơi có thể chọn đè kỹ năng trước khi gửi.`
      : `Kỹ năng dùng cho phép kiểm: ${skillName(skill.id)}.`,
  );

  return { checks: [run.result], timeCost: FREEFORM_TIME_COST, notes };
}
