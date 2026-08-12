/**
 * THẦY DẠY (Phần 8 mục 8) — thứ PHÁ TRẦN.
 *
 * Ba luật khiến hệ này không thành một cái nút bấm:
 *
 *   1. TỐN THỜI GIAN TRONG GAME THẬT. Một khóa học chiếm hàng tuần tới hàng
 *      tháng, và trong lúc đó người chơi không làm việc khác. Đây là chi phí cơ
 *      hội, và nó là phần đắt nhất của việc học — đắt hơn tiền.
 *   2. GIÁ THƯỜNG KHÔNG PHẢI TIỀN. Một lời thề, một ân huệ phải trả sau, ba năm
 *      phục vụ. Những thứ đó thành NGHĨA VỤ có cấu trúc trong state, và Phần 15
 *      đọc chúng để đòi.
 *   3. QUAN HỆ QUYẾT ĐỊNH THẦY CÓ DẠY HẾT KHÔNG. Dưới ngưỡng thì không nhận trò;
 *      trên ngưỡng nhưng chưa thân thì giấu nghề, và khóa học mất bớt kết quả.
 *
 * Tìm thầy KHÔNG nằm ở đây: nó là hoạt động thế giới thật — hỏi thăm, lần theo
 * tin đồn lorebook, được tiến cử. Ở đây chỉ có chỗ GHI LẠI một người thầy đã tìm
 * ra, và luật của việc học với họ.
 */

import type { PatchOp } from '@/state/mvu-parse';
import type { GameState } from '@/state/slices';
import { addDays, formatGameDate } from '@/core/clock';
import { skillOf } from '@/systems/character/skills';
import { priceKindOf, teacherConfig, teacherQuality, tierName } from './catalog';
import { bestTeacherFor, canTeach, capReport, teacherLevelIn } from './caps';
import { studyDays } from './load';
import { nodeName, nodeOf } from './nodes';
import { levelOf, skillsOf, type Obligation, type Teacher, type TeacherPrice } from './slice';

// ---------------------------------------------------------------------------
// Ghi một người thầy vào sổ
// ---------------------------------------------------------------------------

export interface TeacherDraft {
  npcId: string;
  name?: string;
  skills: { skillId: string; level: number; nodes?: string[] }[];
  quality?: number;
  price?: TeacherPrice;
  availability?: string;
  attitudeRequired?: number;
  attitude?: number;
  note?: string;
}

/**
 * Ghi lại một người thầy vừa tìm ra.
 *
 * Kiểm kỹ năng và node có thật ngay tại đây: một người thầy dạy `skill_kiem-thuâ`
 * gõ sai một dấu sẽ không bao giờ khớp với kỹ năng nào, và người chơi sẽ trả giá
 * cho một khóa học không nâng được gì.
 */
export function rememberTeacher(state: GameState, draft: TeacherDraft): { ops: PatchOp[]; blocked: string } {
  if (skillsOf(state) === null) return { ops: [], blocked: 'chưa có slice kỹ năng' };
  if (draft.npcId.trim() === '') return { ops: [], blocked: 'người thầy phải có id' };

  for (const entry of draft.skills) {
    if (skillOf(entry.skillId) === null) {
      return { ops: [], blocked: `thầy dạy kỹ năng "${entry.skillId}" không có trong data/skills.json` };
    }
    for (const id of entry.nodes ?? []) {
      if (nodeOf(id) === null) return { ops: [], blocked: `thầy có node "${id}" không có trong bảng node` };
    }
  }

  const teacher: Teacher = {
    npcId: draft.npcId,
    name: draft.name ?? draft.npcId,
    skills: draft.skills.map((entry) => ({
      skillId: entry.skillId,
      level: entry.level,
      nodes: [...(entry.nodes ?? [])],
    })),
    quality: draft.quality ?? 3,
    price: draft.price ?? { kind: 'money', amount: 0, detail: '' },
    availability: draft.availability ?? '',
    attitudeRequired: draft.attitudeRequired ?? 0,
    attitude: draft.attitude ?? 0,
    note: draft.note ?? '',
  };

  return {
    ops: [
      {
        op: 'set',
        path: `skills.teachers.${draft.npcId}`,
        to: teacher,
        reason: `ghi lại người thầy ${teacher.name}`,
        source: 'json',
      },
    ],
    blocked: '',
  };
}

// ---------------------------------------------------------------------------
// Một khóa học
// ---------------------------------------------------------------------------

export interface StudyPlan {
  teacherId: string;
  teacherName: string;
  skillId: string;
  /** Rỗng là học để lên con số; có id là học một node cụ thể. */
  nodeId: string;
  /** Số điểm kỹ năng khóa học này mang lại, ĐÃ trừ phần thầy giấu nghề. */
  levels: number;
  days: number;
  /** Ngày trong game khóa học kết thúc. */
  endsOn: string;
  price: TeacherPrice;
  /** Thầy có giấu nghề không, và mất bao nhiêu vì thế. */
  holdingBack: boolean;
  blocked: string;
}

/**
 * Dự tính một khóa học — UI hiện NGUYÊN bảng này trước khi người chơi đồng ý.
 *
 * `levels` tính bằng khoảng cách tới trần mà chính người thầy này đưa tới, không
 * phải một con số cố định: một Bậc thầy 80 điểm kéo người ở 58 lên 65 rồi hết
 * chỗ dạy, và người chơi phải thấy con số 65 đó TRƯỚC khi thề một lời thề.
 */
export function planStudy(
  state: GameState,
  teacherId: string,
  skillId: string,
  nodeId = '',
): StudyPlan {
  const config = teacherConfig();
  const teacher = skillsOf(state)?.teachers[teacherId] ?? null;
  const empty: StudyPlan = {
    teacherId,
    teacherName: teacher?.name ?? teacherId,
    skillId,
    nodeId,
    levels: 0,
    days: 0,
    endsOn: '',
    price: teacher?.price ?? { kind: 'money', amount: 0, detail: '' },
    holdingBack: false,
    blocked: '',
  };

  if (teacher === null) return { ...empty, blocked: 'chưa biết người thầy này' };
  if (skillOf(skillId) === null) return { ...empty, blocked: 'không có kỹ năng này' };
  if (skillsOf(state)?.study !== null && skillsOf(state)?.study !== undefined) {
    return { ...empty, blocked: 'đang dở một khóa học khác' };
  }
  if (teacher.attitude < Math.max(teacher.attitudeRequired, config.attitude.teachFloor)) {
    return { ...empty, blocked: `${teacher.name} chưa coi ngài đủ thân để nhận làm trò` };
  }

  const level = levelOf(state, skillId);
  if (!canTeach(teacher, skillId, level)) {
    return {
      ...empty,
      blocked: `${teacher.name} ở ${teacherLevelIn(teacher, skillId)} điểm, phải hơn ngài ít nhất ${
        config.minLead
      } điểm mới còn gì để dạy`,
    };
  }

  const quality = teacherQuality(teacher.quality);
  const holdingBack = teacher.attitude < config.attitude.fullFloor;

  if (nodeId !== '') {
    const node = nodeOf(nodeId);
    if (node === null || node.skillId !== skillId) return { ...empty, blocked: 'node này không thuộc kỹ năng đó' };
    const days = studyDays(state, { nodes: 1, teacherSpeed: quality.speed });
    return {
      ...empty,
      levels: 0,
      days,
      endsOn: endDate(state, days),
      price: teacher.price,
      holdingBack,
      blocked: '',
    };
  }

  const ceiling = Math.min(capReport(state, skillId).cap, teacherLevelIn(teacher, skillId) - config.minLead);
  const room = Math.max(0, ceiling - level);
  if (room <= 0) return { ...empty, blocked: `${teacher.name} không còn gì để dạy ngài ở kỹ năng này` };

  // MỘT khóa học không đưa người ta từ tay mơ lên sát bậc thầy. Thầy phá trần và
  // chỉ đường; phần còn lại vẫn phải tự luyện ra (mục 1 — ba nguồn tiến bộ không
  // thay thế nhau). Không có trần này thì cả cơ chế thực hành của mục 3 thành đồ
  // trang trí, và người chơi chỉ cần đủ tiền là xong.
  const perCourse = Math.max(1, Math.round(config.maxLevelsPerCourse * quality.speed));
  const gross = Math.min(room, perCourse);
  const levels = holdingBack ? Math.floor(gross * (1 - config.attitude.holdBackPenalty)) : gross;

  const days = studyDays(state, { levels: Math.max(1, levels), teacherSpeed: quality.speed });
  return {
    ...empty,
    levels,
    days,
    endsOn: endDate(state, days),
    price: teacher.price,
    holdingBack,
    blocked: levels <= 0 ? `${teacher.name} nhận dạy nhưng giấu hết nghề — quan hệ còn quá nhạt` : '',
  };
}

function endDate(state: GameState, days: number): string {
  return formatGameDate(addDays(state.meta.gameDate, days));
}

/**
 * Bắt đầu một khóa học: khóa lịch, ghi nghĩa vụ, trừ tiền nếu giá là tiền.
 *
 * Nghĩa vụ ghi NGAY lúc bắt đầu chứ không lúc kết thúc: người thầy dạy trước và
 * đòi sau chính là hình dạng nguy hiểm của món nợ này, và người chơi phải thấy
 * nó nằm trong sổ ngay từ hôm đầu.
 */
export function beginStudy(state: GameState, plan: StudyPlan, turn: number): { ops: PatchOp[]; blocked: string } {
  if (plan.blocked !== '') return { ops: [], blocked: plan.blocked };
  const skills = skillsOf(state);
  if (skills === null) return { ops: [], blocked: 'chưa có slice kỹ năng' };

  const teacher = skills.teachers[plan.teacherId];
  if (teacher === undefined) return { ops: [], blocked: 'chưa biết người thầy này' };

  const kind = priceKindOf(plan.price.kind);
  const coins = readCoins(state);
  if (kind !== null && !kind.obligation && plan.price.amount > coins) {
    return { ops: [], blocked: `cần ${plan.price.amount} đồng bạc, đang có ${coins}` };
  }

  const ops: PatchOp[] = [
    {
      op: 'set',
      path: 'skills.study',
      to: {
        teacherId: plan.teacherId,
        skillId: plan.skillId,
        nodeId: plan.nodeId,
        startedTurn: turn,
        days: plan.days,
        levels: plan.levels,
      },
      reason: `học ${skillOf(plan.skillId)?.name ?? plan.skillId} với ${teacher.name}, ${plan.days} ngày`,
      source: 'json',
    },
  ];

  if (kind !== null && !kind.obligation && plan.price.amount > 0) {
    ops.push({
      op: 'add',
      path: 'character.resources.coins',
      to: -plan.price.amount,
      reason: `học phí trả ${teacher.name}`,
      source: 'json',
    });
  }

  if (kind !== null && kind.obligation) {
    const obligation: Obligation = {
      id: `oblig_${plan.teacherId}_${turn}`,
      teacherId: plan.teacherId,
      kind: kind.id,
      detail: plan.price.detail === '' ? kind.name : plan.price.detail,
      owedTurn: turn,
      dueDate: kind.defaultDays > 0 ? formatGameDate(addDays(state.meta.gameDate, kind.defaultDays)) : '',
      settled: false,
    };
    ops.push({
      op: 'push',
      path: 'skills.obligations',
      to: obligation,
      reason: `nợ ${teacher.name}: ${obligation.detail}`,
      source: 'json',
    });
  }

  return { ops, blocked: '' };
}

/**
 * Kết thúc khóa học: đổ điểm kỹ năng hoặc mở node, rồi dọn lịch.
 *
 * Trần vẫn được tôn trọng ở đây: một khóa học đã trả giá xong vẫn không đẩy ai
 * vượt qua trần của chính người thầy đó. Nếu không thì mọi luật của mục 2 chỉ
 * cần một khóa học là đi vòng qua được.
 */
export function finishStudy(state: GameState, turn: number): { ops: PatchOp[]; lines: string[] } {
  const skills = skillsOf(state);
  const study = skills?.study ?? null;
  if (skills === null || study === null) return { ops: [], lines: [] };

  const ops: PatchOp[] = [
    { op: 'set', path: 'skills.study', to: null, reason: 'khóa học kết thúc', source: 'json' },
  ];
  const lines: string[] = [];
  const teacher = skills.teachers[study.teacherId];
  const teacherName = teacher?.name ?? study.teacherId;

  if (study.nodeId !== '') {
    if (!skills.unlockedNodes.includes(study.nodeId)) {
      ops.push({
        op: 'push',
        path: 'skills.unlockedNodes',
        to: study.nodeId,
        reason: `học xong ${nodeName(study.nodeId)} với ${teacherName}`,
        source: 'json',
      });
      lines.push(`Học xong ${nodeName(study.nodeId)} với ${teacherName}.`);
    }
    return { ops, lines };
  }

  const level = levelOf(state, study.skillId);
  const ceiling = Math.min(
    capReport(state, study.skillId).cap,
    teacherLevelIn(teacher ?? null, study.skillId) - teacherConfig().minLead,
  );
  const next = Math.min(ceiling, level + study.levels);
  if (next > level) {
    ops.push({
      op: 'set',
      path: `character.skills.${study.skillId}.level`,
      to: next,
      reason: `học với ${teacherName} tới lượt ${turn}`,
      source: 'json',
    });
    lines.push(
      `${skillOf(study.skillId)?.name ?? study.skillId} ${level} → ${next} (${tierName(next)}) nhờ ${teacherName}.`,
    );
  } else {
    lines.push(`Khóa học với ${teacherName} kết thúc mà không nâng được gì thêm.`);
  }

  return { ops, lines };
}

/** Khóa học đã tới hạn chưa — vòng lượt gọi mỗi lượt. */
export function studyDue(state: GameState): boolean {
  const study = skillsOf(state)?.study ?? null;
  if (study === null) return false;
  const elapsed = state.meta.turn - study.startedTurn;
  // Một lượt là một ngày trong game ở mức thô nhất; Phần 13 chốt nhịp thời gian
  // thật và chỗ này đọc lại từ đó.
  return elapsed >= study.days;
}

/** Người thầy tốt nhất đang có cho một kỹ năng, kèm câu mô tả cho UI. */
export function teacherLine(state: GameState, skillId: string): string {
  const teacher = bestTeacherFor(state, skillId);
  if (teacher === null) return 'chưa biết người thầy nào';
  const level = teacherLevelIn(teacher, skillId);
  const quality = teacherQuality(teacher.quality);
  const usable = canTeach(teacher, skillId, levelOf(state, skillId));
  return `${teacher.name} · ${level} điểm · ${quality.name}${usable ? '' : ' · đã hết chỗ dạy cho ngài'}`;
}

function readCoins(state: GameState): number {
  const raw = (state as unknown as { character?: { resources?: { coins?: unknown } } }).character?.resources?.coins;
  return typeof raw === 'number' ? raw : 0;
}
