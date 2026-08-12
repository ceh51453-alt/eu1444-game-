/**
 * VÒNG LƯỢT CỦA PHẦN 8 — chỗ tiến bộ thật sự xảy ra.
 *
 * Gọi ở BƯỚC 2 của vòng lặp lượt, ngay sau khi phép kiểm đã tung xong và trước
 * khi prompt được lắp. Thứ tự đó quan trọng: nếu điểm rèn luyện chỉ được cộng
 * sau lời gọi AI thì người kể chuyện sẽ viết cảnh bằng con số của hôm qua, và
 * cái lượt mà người chơi lên bậc Thành thạo sẽ được kể như một buổi tập bình
 * thường.
 *
 * Không hàm nào ở đây ghi store: chúng trả `PatchOp[]`, và `ai/pipeline.ts` áp
 * với actor `engine` (R2, R4).
 */

import type { CheckResult } from '@/core/turn';
import type { PatchOp } from '@/state/mvu-parse';
import type { GameState } from '@/state/slices';
import { awardXp, practiceFromChecks, xpSourcesFromChecks } from './progress';
import { finishStudy, studyDue } from './teach';
import { skillsOf } from './slice';

export interface SkillTurnOutcome {
  ops: PatchOp[];
  /** Dòng chữ đưa vào `RollContext.notes` — người kể chuyện đọc được tiến bộ. */
  lines: string[];
}

/**
 * Một lượt của hệ kỹ năng: đổ điểm thực hành, trao điểm KN, và kết thúc khóa học
 * đã tới hạn.
 *
 * Khóa học kết thúc TRƯỚC khi cộng điểm thực hành của lượt, cố ý: hôm cuối của
 * khóa học thì người chơi đã có con số mới, và cú tung của chính hôm đó phải
 * tính trên con số ấy chứ không phải trên con số cũ.
 */
export function skillsTurn(state: GameState, checks: readonly CheckResult[], turn: number): SkillTurnOutcome {
  if (skillsOf(state) === null) return { ops: [], lines: [] };

  const ops: PatchOp[] = [];
  const lines: string[] = [];

  if (studyDue(state)) {
    const done = finishStudy(state, turn);
    ops.push(...done.ops);
    lines.push(...done.lines);
  }

  const practice = practiceFromChecks(state, checks, turn);
  ops.push(...practice.ops);
  // CHỈ báo khi con số thật sự nhích lên. Dòng "+3 điểm thực hành (2/14)" là thứ
  // người chơi xem ở tab Kỹ năng, không phải thứ người kể chuyện cần: nhét nó
  // vào prompt mỗi lượt là trả token cho một dòng vô nghĩa và làm loãng khối 11.
  lines.push(...practice.gains.filter((gain) => gain.levels > 0).map((gain) => gain.line));

  const xp = awardXp(state, xpSourcesFromChecks(checks));
  ops.push(...xp.ops);
  lines.push(...xp.lines);

  return { ops, lines };
}
