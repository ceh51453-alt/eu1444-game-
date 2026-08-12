/**
 * TẢI HỌC TẬP (Phần 8 mục 5) — càng rộng càng chậm.
 *
 *   load        = số node đã mở + số kỹ năng từ bậc Thành thạo trở lên
 *   hệ số chậm  = (1 + 0.12 × max(0, load − 6)) × hệ số tuổi × hệ số chủng tộc
 *
 * Áp lên ĐÚNG BA CHỖ mà mục 5 liệt kê: ngưỡng điểm thực hành, giá điểm KN của
 * node mới, và thời gian học với thầy. Không áp lên chính cú tung — một người
 * ôm mười lăm kỹ năng không đánh kiếm tệ hơn, họ chỉ tiến bộ chậm hơn. Nhầm chỗ
 * này là biến một cơ chế tiến bộ thành một mức phạt chiến đấu.
 *
 * KHÔNG CÓ TRẦN CỨNG cho `load`, cố ý: mục 5 muốn người chơi tự chọn đánh đổi
 * giữa chuyên và rộng, chứ không muốn engine chặn họ ở một con số.
 */

import type { GameState } from '@/state/slices';
import { characterOf } from '@/systems/character/slice';
import { effectiveAge } from '@/systems/character/races';
import { ageFactor, baseThreshold, loadConfig, teacherConfig } from './catalog';
import type { SkillNode } from './nodes';
import { ageFactorFor, learningLoad, loadFactorOf, raceFactorFor } from './slice';

export interface SlowBreakdown {
  load: number;
  /** Vế tải học tập. */
  loadFactor: number;
  ageFactor: number;
  ageLabel: string;
  raceFactor: number;
  /** Tích của ba vế — con số thật sự nhân vào ngưỡng. */
  factor: number;
  /** Vượt ngưỡng cảnh báo của mục 11 chưa. */
  heavy: boolean;
}

/**
 * Bảng phân rã hệ số chậm — UI hiện NGUYÊN bảng này chứ không hiện một con số.
 *
 * Game không có reroll, nên người chơi phải đọc được vì sao mình học chậm: vì ôm
 * quá nhiều nhánh, vì đã già, hay vì sinh ra là Mộc Tộc. Ba lý do đó dẫn tới ba
 * quyết định khác nhau (README mục 8.4).
 */
export function slowBreakdown(state: GameState | null | undefined): SlowBreakdown {
  const identity = characterOf(state)?.identity;
  const load = learningLoad(state);
  const loadFactor = loadFactorOf(load);

  const age =
    identity === undefined
      ? { factor: 1, label: '' }
      : ageFactor(effectiveAge(identity.race, identity.age));
  const race = identity === undefined ? 1 : raceFactorFor(identity.race);

  const factor = loadFactor * age.factor * race;
  return {
    load,
    loadFactor: round2(loadFactor),
    ageFactor: age.factor,
    ageLabel: age.label,
    raceFactor: race,
    factor: round2(factor),
    heavy: factor > loadConfig().warnFactor,
  };
}

export function slowFactor(state: GameState | null | undefined): number {
  return slowBreakdown(state).factor;
}

/**
 * Ngưỡng điểm thực hành để lên 1 điểm ở kỹ năng này, ĐÃ nhân hệ số chậm.
 *
 * `hasTeacher` không phải một tiện nghi: ở bậc Thành thạo, tự học chạy nửa tốc
 * độ (mục 2), nên cùng một người cùng một kỹ năng có hai ngưỡng khác nhau tùy
 * lúc đó có ai dạy hay không.
 */
export function practiceThreshold(
  state: GameState | null | undefined,
  level: number,
  hasTeacher: boolean,
): number {
  return Math.max(1, Math.round(baseThreshold(level, hasTeacher) * slowFactor(state)));
}

/** Giá điểm KN thật của một node, ĐÃ nhân hệ số chậm (mục 6). */
export function nodeCost(state: GameState | null | undefined, node: SkillNode): number {
  return Math.max(1, Math.round(node.cost * slowFactor(state)));
}

/**
 * Số NGÀY TRONG GAME một khóa học chiếm (mục 8).
 *
 * Thầy giỏi rút ngắn nó, tải học tập kéo dài nó. Đây là chi phí cơ hội thật:
 * trong lúc học thì người chơi không cai trị, không đánh trận, không đi tìm
 * người khác — và thế giới của Phần 15 vẫn chạy.
 */
export function studyDays(
  state: GameState | null | undefined,
  options: { levels?: number; nodes?: number; teacherSpeed: number },
): number {
  const config = teacherConfig();
  const factor = slowFactor(state);
  const speed = Math.max(0.1, options.teacherSpeed);
  const days =
    ((options.levels ?? 0) * config.daysPerLevel + (options.nodes ?? 0) * config.daysPerNode) *
    factor /
    speed;
  return Math.max(1, Math.round(days));
}

export function ageSlowFactor(raceId: string, age: number): number {
  return ageFactorFor(raceId, age);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
