/**
 * SLICE `skills` (Phần 8 mục 10).
 *
 * CON SỐ KỸ NĂNG KHÔNG NẰM Ở ĐÂY, và đó là chỗ lệch duy nhất so với bảng của
 * mục 10. Nó nằm ở `character.skills.*.level` từ Phần 6, nơi `base.ts` đọc để
 * dựng `CheckSpec.base`, nơi prompt hồ sơ nhân vật in ra, và nơi bước 5 của
 * luồng tạo nhân vật ghi vào. Chép thêm một bản ở đây là dựng sẵn hai sự thật
 * cho cùng một con số, và cái ngày chúng lệch nhau thì không ai biết bên nào
 * đúng. Phần 8 GHI vào ô đó bằng op `engine` — quyền ấy Phần 6 đã khai sẵn, đúng
 * cùng một đường mà Phần 7 ghi sẹo sang `character.appearance.scars`.
 *
 * Còn lại theo đúng mục 10:
 *   practicePoints.*, xp, unlockedNodes, activeStance   engine
 *   teachers.*.attitude                                 ai
 *   learningGoals, notes                                ai
 *
 * `activeStance` là `engine` chứ không phải `ai` vì NGƯỜI CHƠI bấm nó. Một cái
 * thế thủ mà AI tự bật lên giữa lượt là AI đang quyết một chuyện cơ học (R1).
 */

import { z } from 'zod';
import type { GameState, SliceDefinition } from '@/state/slices';
import { readPath } from '@/state/slices';
import { characterOf } from '@/systems/character/slice';
import { effectiveAge, learnFactor } from '@/systems/character/races';
import { allSkills } from '@/systems/character/skills';
import { ageFactor, hardCap, loadConfig, tierOf } from './catalog';
import { nodeOf } from './nodes';

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

/**
 * Một lần dùng kỹ năng đã được ghi nhận, để chống cày máy móc (mục 3).
 *
 * `context` là "loại việc": cùng một kỹ năng dùng đi dùng lại cho cùng một loại
 * việc thì điểm tụt về 0. Nó do người gọi đặt — vòng lượt dùng miền + bậc độ
 * khó + nhãn hoàn cảnh, còn minigame của Phần 9–11 sẽ đặt theo đối thủ.
 */
export const practiceEntrySchema = z.object({
  context: z.string().max(80),
  turn: z.int().min(0),
});

export const teacherSkillSchema = z.object({
  skillId: z.string().max(60),
  level: z.int().min(0).max(100),
  nodes: z.array(z.string().max(80)).max(40).default([]),
});

export const teacherPriceSchema = z.object({
  /** Id trong `teacher.priceKinds` của `data/skill-progress.json`. */
  kind: z.string().max(30),
  /** Số tiền, hoặc 0 với những giá không phải tiền. */
  amount: z.int().min(0).default(0),
  detail: z.string().max(200).default(''),
});

export const teacherSchema = z.object({
  npcId: z.string().max(80),
  name: z.string().max(80).default(''),
  skills: z.array(teacherSkillSchema).max(20).default([]),
  quality: z.int().min(1).max(5).default(3),
  price: teacherPriceSchema.default({ kind: 'money', amount: 0, detail: '' }),
  /** Ở đâu, khi nào, có nhận trò không. */
  availability: z.string().max(200).default(''),
  /** Cần quan hệ tới mức nào thì mới dạy. */
  attitudeRequired: z.int().min(-100).max(100).default(0),
  /** Quan hệ hiện tại — ô DUY NHẤT trong slice này mà AI ghi được (mục 10). */
  attitude: z.int().min(-100).max(100).default(0),
  note: z.string().max(300).default(''),
});

/**
 * NGHĨA VỤ CÒN NỢ THẦY (mục 8).
 *
 * Một lời thề, một ân huệ phải trả sau, ba năm phục vụ — mục 8 nói thẳng những
 * thứ đó "thành nghĩa vụ trong state, và Phần 15 phải nhớ để đòi". Nên chúng là
 * một danh sách có cấu trúc với hạn chót, không phải một dòng chữ trong ghi chú.
 */
export const obligationSchema = z.object({
  id: z.string().max(60),
  teacherId: z.string().max(80),
  kind: z.string().max(30),
  detail: z.string().max(200).default(''),
  owedTurn: z.int().min(0),
  /** Ngày trong game phải trả xong. Rỗng là một món nợ không có hạn — nặng hơn. */
  dueDate: z.string().max(40).default(''),
  settled: z.boolean().default(false),
});

/** Một khóa học đang chạy — người chơi không làm việc khác trong lúc này. */
export const studySchema = z.object({
  teacherId: z.string().max(80),
  skillId: z.string().max(60),
  /** Rỗng là học để lên con số; có id là học một node cụ thể. */
  nodeId: z.string().max(80).default(''),
  startedTurn: z.int().min(0),
  /** Số ngày trong game khóa học chiếm. */
  days: z.int().min(0),
  /** Điểm kỹ năng khóa học này hứa mang lại. */
  levels: z.int().min(0).default(0),
});

export const skillsSchema = z.object({
  /** Điểm thực hành đang tích, theo từng kỹ năng. Đầy ngưỡng thì đổ ra 1 điểm kỹ năng. */
  practicePoints: z.record(z.string(), z.number().min(0)).default({}),
  /** Sổ tay chống cày: những lần dùng gần đây, cắt theo cửa sổ lượt. */
  practiceLog: z.record(z.string(), z.array(practiceEntrySchema).max(60)).default({}),
  /** Điểm kinh nghiệm chưa tiêu. Chỉ mở node, không mua thẳng con số (mục 4). */
  xp: z.number().min(0).default(0),
  xpEarned: z.number().min(0).default(0),
  unlockedNodes: z.array(z.string().max(80)).max(400).default([]),
  /** Thế đang bật, theo từng kỹ năng. Một kỹ năng chỉ giữ được một thế. */
  activeStance: z.record(z.string(), z.string().max(80)).default({}),
  /** Đã có sự kiện đột phá ở kỹ năng nào — engine cấp, không mua được (mục 8). */
  breakthroughs: z.record(z.string(), z.string().max(60)).default({}),
  teachers: z.record(z.string(), teacherSchema).default({}),
  obligations: z.array(obligationSchema).max(40).default([]),
  study: studySchema.nullable().default(null),
  /** AI ghi: nhân vật đang muốn học gì. */
  learningGoals: z.array(z.string().max(200)).max(10).default([]),
  notes: z.array(z.string().max(300)).max(30).default([]),
});

export type SkillsState = z.infer<typeof skillsSchema>;
export type Teacher = z.infer<typeof teacherSchema>;
export type TeacherPrice = z.infer<typeof teacherPriceSchema>;
export type Obligation = z.infer<typeof obligationSchema>;
export type StudySession = z.infer<typeof studySchema>;
export type PracticeEntry = z.infer<typeof practiceEntrySchema>;

// ---------------------------------------------------------------------------
// Đọc
// ---------------------------------------------------------------------------

export function skillsOf(state: GameState | null | undefined): SkillsState | null {
  if (state === null || state === undefined) return null;
  const raw = readPath(state, 'skills');
  if (raw === null || raw === undefined || typeof raw !== 'object') return null;
  return raw as SkillsState;
}

/** Con số kỹ năng — đọc từ slice `character`, chỗ DUY NHẤT giữ nó. */
export function levelOf(state: GameState | null | undefined, skillId: string): number {
  return characterOf(state)?.skills[skillId]?.level ?? 0;
}

/** Mọi kỹ năng đã có điểm, kèm con số. */
export function trainedSkills(state: GameState | null | undefined): { skillId: string; level: number }[] {
  const skills = characterOf(state)?.skills ?? {};
  return Object.entries(skills)
    .filter(([, entry]) => entry.level > 0)
    .map(([skillId, entry]) => ({ skillId, level: entry.level }));
}

export function isUnlocked(state: GameState | null | undefined, nodeId: string): boolean {
  return skillsOf(state)?.unlockedNodes.includes(nodeId) ?? false;
}

export function unlockedNodesOf(state: GameState | null | undefined, skillId?: string): string[] {
  const unlocked = skillsOf(state)?.unlockedNodes ?? [];
  if (skillId === undefined) return [...unlocked];
  return unlocked.filter((id) => nodeOf(id)?.skillId === skillId);
}

export function defaultSkills(): SkillsState {
  return {
    practicePoints: {},
    practiceLog: {},
    xp: 0,
    xpEarned: 0,
    unlockedNodes: [],
    activeStance: {},
    breakthroughs: {},
    teachers: {},
    obligations: [],
    study: null,
    learningGoals: [],
    notes: [],
  };
}

// ---------------------------------------------------------------------------
// Tải học tập — dùng chung cho biến phụ và cho `load.ts`
// ---------------------------------------------------------------------------

/**
 * `load = số node đã mở + số kỹ năng từ bậc Thành thạo trở lên` (mục 5).
 *
 * Hàm nằm ở đây chứ không ở `load.ts` vì biến phụ phải đọc được nó mà không kéo
 * theo cả module tính hệ số — biến phụ chỉ được đọc trong `deps` đã khai.
 */
export function learningLoad(state: GameState | null | undefined): number {
  const nodes = skillsOf(state)?.unlockedNodes.length ?? 0;
  const mastery = tierOf(loadConfig().masteryTier);
  const floor = mastery?.from ?? 41;
  const mastered = trainedSkills(state).filter((entry) => entry.level >= floor).length;
  return nodes + mastered;
}

/** Hệ số chậm của tải học tập, CHƯA nhân tuổi tác và chủng tộc. */
export function loadFactorOf(load: number): number {
  const config = loadConfig();
  return 1 + config.perExtra * Math.max(0, load - config.freeSlots);
}

// ---------------------------------------------------------------------------
// Slice
// ---------------------------------------------------------------------------

export const skillsSlice: SliceDefinition = {
  id: 'skills',
  version: 1,
  schema: skillsSchema,
  defaults: () => defaultSkills() as unknown as Record<string, unknown>,

  permissions: {
    // engine — mọi con số đi thẳng vào công thức.
    practicePoints: 'engine',
    'practicePoints.*': 'engine',
    practiceLog: 'engine',
    'practiceLog.*': 'engine',
    xp: 'engine',
    xpEarned: 'engine',
    unlockedNodes: 'engine',
    'unlockedNodes.*': 'engine',
    // Người chơi bấm, không phải AI (mục 10).
    activeStance: 'engine',
    'activeStance.*': 'engine',
    breakthroughs: 'engine',
    'breakthroughs.*': 'engine',
    teachers: 'engine',
    'teachers.*': 'engine',
    // Trừ đúng một ô: quan hệ với thầy là chuyện của truyện (mục 10).
    'teachers.*.attitude': 'ai',
    'teachers.*.note': 'ai',
    obligations: 'engine',
    'obligations.*': 'engine',
    study: 'engine',
    'study.*': 'engine',
    // ai — nhân vật đang muốn gì, và ghi chú.
    learningGoals: 'ai',
    notes: 'ai',
  },

  constraints: [
    {
      /**
       * Một node đã mở mà không có trong `data/skill-nodes.json` là một hiệu ứng
       * vô hình: người chơi đã trả điểm KN, registry thì không thấy gì để cộng.
       */
      id: 'node-da-mo-phai-co-that',
      check(state) {
        const skills = skillsOf(state);
        if (skills === null) return null;
        for (const id of skills.unlockedNodes) {
          if (nodeOf(id) === null) return `node "${id}" không có trong data/skill-nodes.json`;
        }
        return null;
      },
    },
    {
      id: 'node-khong-mo-hai-lan',
      check(state) {
        const skills = skillsOf(state);
        if (skills === null) return null;
        const ids = skills.unlockedNodes;
        return new Set(ids).size === ids.length ? null : 'một node bị mở hai lần';
      },
    },
    {
      /** Bật một thế chưa mở là dùng một chiêu mình không có. */
      id: 'the-dang-bat-phai-da-mo',
      check(state) {
        const skills = skillsOf(state);
        if (skills === null) return null;
        for (const [skillId, nodeId] of Object.entries(skills.activeStance)) {
          if (nodeId === '') continue;
          const node = nodeOf(nodeId);
          if (node === null) return `thế "${nodeId}" không có trong bảng node`;
          if (node.kind !== 'stance') return `"${nodeId}" không phải một thế`;
          if (node.skillId !== skillId) return `thế "${nodeId}" không thuộc kỹ năng ${skillId}`;
          if (!skills.unlockedNodes.includes(nodeId)) return `đang bật thế "${nodeId}" mà chưa mở nó`;
        }
        return null;
      },
    },
    {
      /**
       * Con số kỹ năng vượt trần cứng là phá luôn clamp d100 của Phần 5: một
       * ngưỡng trên 95 nghĩa là có hành động auto-thành-công, mà R6 cấm.
       */
      id: 'khong-ky-nang-nao-vuot-tran-cung',
      check(state) {
        const character = characterOf(state);
        if (character === null) return null;
        const cap = hardCap();
        for (const [skillId, entry] of Object.entries(character.skills)) {
          if (entry.level > cap) return `kỹ năng ${skillId} = ${entry.level} vượt trần cứng ${cap}`;
        }
        return null;
      },
    },
    {
      /** Nghĩa vụ trỏ tới một người thầy không có trong sổ là món nợ không ai đòi. */
      id: 'nghia-vu-phai-co-chu-no',
      check(state) {
        const skills = skillsOf(state);
        if (skills === null) return null;
        for (const obligation of skills.obligations) {
          if (skills.teachers[obligation.teacherId] === undefined) {
            return `nghĩa vụ "${obligation.id}" nợ một người thầy không có trong sổ: ${obligation.teacherId}`;
          }
        }
        return null;
      },
    },
  ],

  // Biến phụ của mục 10: tải học tập, hệ số chậm, số node đã mở, và số nghĩa vụ
  // chưa trả. Chúng LÀ hàm của state, dựng lại mỗi lượt, AI không ghi được.
  derived: [
    {
      id: 'taiHocTap',
      deps: ['skills.unlockedNodes', 'character.skills'],
      compute(state) {
        return learningLoad(state);
      },
    },
    {
      /**
       * Hệ số chậm TỔNG: tải học tập × tuổi tác × chủng tộc.
       *
       * Ba vế nhân với nhau chứ không cộng, vì chúng là ba lý do độc lập khiến
       * cùng một giờ luyện tập cho ra ít hơn. Một Cao Tiên già ôm mười lăm kỹ
       * năng phải chậm hơn hẳn tích của từng vế riêng lẻ, và đó chính là điểm.
       */
      id: 'heSoCham',
      deps: ['derived.taiHocTap', 'character.identity.age', 'character.identity.race'],
      compute(state) {
        const identity = characterOf(state)?.identity;
        const values = (state as unknown as { derived?: Record<string, unknown> }).derived ?? {};
        const load = typeof values['taiHocTap'] === 'number' ? (values['taiHocTap'] as number) : 0;
        const base = loadFactorOf(load);
        if (identity === undefined) return Math.round(base * 100) / 100;

        const age = ageFactorFor(identity.race, identity.age);
        const race = raceFactorFor(identity.race);
        return Math.round(base * age * race * 100) / 100;
      },
    },
    {
      id: 'soNodeDaMo',
      deps: ['skills.unlockedNodes'],
      compute(state) {
        return skillsOf(state)?.unlockedNodes.length ?? 0;
      },
    },
    {
      id: 'nghiaVuChuaTra',
      deps: ['skills.obligations'],
      compute(state) {
        return (skillsOf(state)?.obligations ?? []).filter((entry) => !entry.settled).length;
      },
    },
  ],
};

// ---------------------------------------------------------------------------
// Hai vế còn lại của hệ số chậm
// ---------------------------------------------------------------------------

export function ageFactorFor(raceId: string, age: number): number {
  return ageFactor(effectiveAge(raceId, age)).factor;
}

export function raceFactorFor(raceId: string): number {
  return learnFactor(raceId);
}

/** Số kỹ năng đã lên khỏi mốc "Thành thạo" — vế thứ hai của công thức load. */
export function masteredCount(state: GameState | null | undefined): number {
  const mastery = tierOf(loadConfig().masteryTier);
  const floor = mastery?.from ?? 41;
  return trainedSkills(state).filter((entry) => entry.level >= floor).length;
}

/** Danh mục phẳng để UI dựng danh sách mà không phải import cả Phần 6. */
export function skillCatalog(): ReturnType<typeof allSkills> {
  return allSkills();
}
