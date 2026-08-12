/**
 * TRẦN HIỆN TẠI CỦA MỘT KỸ NĂNG (Phần 8 mục 2) — và LÝ DO của nó.
 *
 * Mục 11 đòi UI hiện "TRẦN HIỆN TẠI hiện rõ kèm lý do", nên hàm ở đây không trả
 * về một con số mà trả về cả câu giải thích. Một người chơi luyện kiếm hai chục
 * giờ trong game rồi đứng yên ở 60 mà không có gì trên màn hình nói vì sao thì
 * sẽ kết luận là game hỏng — và họ đúng, vì một cơ chế không đọc được thì đúng
 * là hỏng (README mục 8.4).
 *
 * BỐN THỨ CÙNG HẠ TRẦN, lấy cái thấp nhất:
 *   · trần cứng 95            luôn còn 5% thất bại (R6)
 *   · trần chỉ số             Sức mạnh 4 thì không thành bậc thầy búa được
 *   · trần bậc tự học 60      không thầy thì mãi mãi dừng ở đây
 *   · trần theo thầy đang có  thầy chỉ kéo được tới `trình độ thầy − 15`
 *
 * Vế cuối là chỗ dễ cài sai nhất. Mục 8 nói "thầy phải hơn trò ít nhất 15 điểm";
 * nếu chỉ dùng nó để chặn lúc bắt đầu khóa học thì UI sẽ hứa một cái trần 75 mà
 * người thầy hiện có không bao giờ đưa tới được. Nên nó nằm THẲNG trong công
 * thức trần, và người chơi đọc được "thầy của ngài chỉ dạy tới 65".
 *
 * Bậc Tông sư là ngoại lệ có chủ ý: tới đó thì Tông sư không còn dạy chiêu nữa,
 * họ đứng làm chứng cho một sự kiện đột phá (mục 8). Vế `−15` không áp ở đó.
 */

import type { GameState } from '@/state/slices';
import { characterOf } from '@/systems/character/slice';
import { skillOf } from '@/systems/character/skills';
import { allTiers, hardCap, statCapFor, teacherConfig, tierAtLeast, tierOfLevel } from './catalog';
import { skillsOf, type Teacher } from './slice';

export interface CapReport {
  /** Con số kỹ năng cao nhất đạt được lúc này. */
  cap: number;
  /** Câu tiếng Việt nói vì sao — đi thẳng ra UI. */
  reason: string;
  /** Vế nào đang chặn: `bac`, `thay`, `chi-so`, `cung`. */
  binding: 'bac' | 'thay' | 'chi-so' | 'cung';
  /** Trần nếu tìm được thầy đủ giỏi — để UI nói "kiếm thầy thì lên được tới đâu". */
  withBestTeacher: number;
}

/** Thầy giỏi nhất đang biết ở kỹ năng này. */
export function bestTeacherFor(state: GameState | null | undefined, skillId: string): Teacher | null {
  const teachers = Object.values(skillsOf(state)?.teachers ?? {});
  let best: Teacher | null = null;
  let bestLevel = -1;
  for (const teacher of teachers) {
    const entry = teacher.skills.find((row) => row.skillId === skillId);
    if (entry === undefined) continue;
    if (teacher.attitude < teacher.attitudeRequired) continue;
    if (teacher.attitude < teacherConfig().attitude.teachFloor) continue;
    if (entry.level > bestLevel) {
      best = teacher;
      bestLevel = entry.level;
    }
  }
  return best;
}

export function teacherLevelIn(teacher: Teacher | null, skillId: string): number {
  return teacher?.skills.find((row) => row.skillId === skillId)?.level ?? 0;
}

/**
 * Người thầy này còn dạy được kỹ năng đó cho một người ở trình độ `level` không.
 *
 * Mục 8: hơn trò ít nhất `minLead` điểm. Người thầy hết chỗ dạy KHÔNG biến mất
 * khỏi sổ — họ vẫn là quan hệ, vẫn là chỗ hỏi thăm để tìm người giỏi hơn.
 */
export function canTeach(teacher: Teacher | null, skillId: string, level: number): boolean {
  if (teacher === null) return false;
  if (teacher.attitude < Math.max(teacher.attitudeRequired, teacherConfig().attitude.teachFloor)) return false;
  return teacherLevelIn(teacher, skillId) - level >= teacherConfig().minLead;
}

/** Trần cao nhất mà bậc tự học đưa tới — 60 theo bảng của mục 2. */
export function selfStudyCap(): number {
  const free = allTiers().filter((tier) => tier.selfStudy === 'free' || tier.selfStudy === 'half');
  return free[free.length - 1]?.to ?? 0;
}

/** Trần do chỉ số chính của kỹ năng áp xuống. */
export function statCapOfSkill(state: GameState | null | undefined, skillId: string): number {
  const skill = skillOf(skillId);
  if (skill === null) return hardCap();
  const value = characterOf(state)?.stats[skill.stat];
  return statCapFor(typeof value === 'number' ? value : 10);
}

/**
 * Trần mà một người thầy ở trình độ `teacherLevel` đưa tới, chưa tính đột phá.
 *
 * Đi qua từng bậc đòi thầy theo thứ tự: thầy đạt bậc `teacherTier` thì bậc đó mở
 * ra, nhưng chỉ tới `trình độ thầy − minLead`.
 */
function teacherDrivenCap(teacherLevel: number): number {
  const lead = teacherConfig().minLead;
  let cap = selfStudyCap();
  if (teacherLevel <= 0) return cap;

  const teacherTier = tierOfLevel(teacherLevel).id;
  for (const tier of allTiers()) {
    if (tier.selfStudy !== 'teacher') continue;
    const required = tier.teacherTier;
    if (required === undefined || !tierAtLeast(teacherTier, required)) continue;
    cap = Math.max(cap, Math.min(tier.to, teacherLevel - lead));
  }
  return cap;
}

/** Bậc Tông sư đã mở chưa: cần đúng thầy VÀ một sự kiện đột phá đã xảy ra (mục 8). */
export function breakthroughOpen(state: GameState | null | undefined, skillId: string): boolean {
  const skills = skillsOf(state);
  if (skills === null) return false;
  if (skills.breakthroughs[skillId] === undefined) return false;

  const tier = allTiers().find((entry) => entry.selfStudy === 'breakthrough');
  const required = tier?.teacherTier;
  if (required === undefined) return false;

  const teacher = bestTeacherFor(state, skillId);
  const level = teacherLevelIn(teacher, skillId);
  return level > 0 && tierAtLeast(tierOfLevel(level).id, required);
}

/** Trần và lý do — thứ mục 11 hiện ngay cạnh mỗi dòng kỹ năng. */
export function capReport(state: GameState | null | undefined, skillId: string): CapReport {
  const hard = hardCap();
  const stat = statCapOfSkill(state, skillId);
  const teacher = bestTeacherFor(state, skillId);
  const teacherLevel = teacherLevelIn(teacher, skillId);

  const breakthroughTier = allTiers().find((entry) => entry.selfStudy === 'breakthrough');
  const fromTeacher = breakthroughOpen(state, skillId)
    ? breakthroughTier?.to ?? hard
    : teacherDrivenCap(teacherLevel);

  const cap = Math.min(hard, stat, fromTeacher);

  const nextTier = allTiers().find((entry) => entry.from > selfStudyCap() && entry.selfStudy === 'teacher');
  const needed = nextTier?.teacherTier === undefined ? null : allTiers().find((t) => t.id === nextTier.teacherTier);

  let binding: CapReport['binding'] = 'cung';
  let reason = `Trần cứng ${hard} — luôn còn 5% thất bại, không kỹ năng nào chắc thắng.`;

  if (cap === stat && stat < hard && stat <= fromTeacher) {
    binding = 'chi-so';
    const skill = skillOf(skillId);
    reason = `Trần ${cap}: ${
      skill === null ? 'chỉ số chính' : `chỉ số chính (${skill.stat.toUpperCase()})`
    } của ngài không đỡ nổi cao hơn.`;
  } else if (cap === fromTeacher && fromTeacher < hard) {
    if (teacherLevel <= 0) {
      binding = 'bac';
      reason = `Trần ${cap}: tự học chỉ tới đây. Cần thầy bậc ${needed?.name ?? 'cao hơn'} mới đi tiếp được.`;
    } else if (fromTeacher <= selfStudyCap()) {
      binding = 'bac';
      reason = `Trần ${cap}: thầy hiện có chưa đủ bậc — cần thầy bậc ${needed?.name ?? 'cao hơn'}.`;
    } else {
      binding = 'thay';
      reason = `Trần ${cap}: thầy của ngài ở ${teacherLevel} điểm, và thầy phải hơn trò ít nhất ${
        teacherConfig().minLead
      } điểm.`;
    }
  }

  return { cap, reason, binding, withBestTeacher: Math.min(hard, stat) };
}

/** Trần trần trụi, không kèm lý do — cho những chỗ chỉ cần con số. */
export function capOf(state: GameState | null | undefined, skillId: string): number {
  return capReport(state, skillId).cap;
}

/** Kỹ năng đã chạm trần chưa. Chạm rồi thì điểm thực hành ngừng đổ vào. */
export function atCap(state: GameState | null | undefined, skillId: string, level: number): boolean {
  return level >= capOf(state, skillId);
}
