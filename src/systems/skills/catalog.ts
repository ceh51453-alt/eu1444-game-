/**
 * BẢNG CÂN BẰNG CỦA PHẦN 8 — nạp từ `/data/skill-progress.json` theo R5.
 *
 * Không một con số nào của mục 2–5 và mục 8 được viết cứng trong code. Lý do rất
 * cụ thể: bài test mục 12.10 đo ĐƯỜNG CONG tiến bộ, và người cân bằng sẽ phải
 * kéo con số qua lại nhiều lần sau khi đọc đường cong đó. Mỗi lần kéo mà phải
 * sửa code là mỗi lần một chỗ khác quên sửa theo.
 *
 * File này CHỈ tra bảng. Việc cộng điểm, tính trần, tính hệ số chậm nằm ở
 * `progress.ts` và `load.ts` — tách ra vì chúng cần đọc state, còn ở đây thì
 * không có gì ngoài dữ liệu tĩnh.
 */

import { z } from 'zod';
import progressFile from '@data/skill-progress.json';

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

/**
 * Tự học tới đâu ở bậc này (mục 2).
 *
 *   `free`         thoải mái
 *   `half`         được, nhưng ngưỡng nhân đôi
 *   `teacher`      BẮT BUỘC có thầy bậc `teacherTier` trở lên
 *   `breakthrough` còn cần thêm một sự kiện đột phá (mục 8)
 */
export const SELF_STUDY = ['free', 'half', 'teacher', 'breakthrough'] as const;
export type SelfStudy = (typeof SELF_STUDY)[number];

export const tierSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  from: z.int().min(0),
  to: z.int().min(0),
  /** Bậc, dùng để bình phương trong công thức ngưỡng. KHÔNG phải chỉ số mảng. */
  rank: z.int().min(0),
  selfStudy: z.enum(SELF_STUDY),
  teacherTier: z.string().optional(),
});

export const tierValueSchema = z.object({
  critFail: z.number(),
  fail: z.number(),
  costlySuccess: z.number(),
  success: z.number(),
  critSuccess: z.number(),
});

const fileSchema = z.object({
  tiers: z.array(tierSchema).min(2),
  hardCap: z.int().min(1).max(100),
  statCap: z.object({ perStatPoint: z.number().min(0), floor: z.int().min(0) }),
  practice: z.object({
    points: tierValueSchema,
    thresholdBase: z.number().positive(),
    halfSpeed: z.number().positive(),
    easyTarget: z.object({ d100: z.number(), '3d6': z.number() }),
    antiGrind: z.object({
      windowTurns: z.int().min(1),
      freeRepeats: z.int().min(0),
      fadeSpan: z.int().min(1),
    }),
  }),
  load: z.object({
    freeSlots: z.int().min(0),
    perExtra: z.number().min(0),
    masteryTier: z.string().min(1),
    warnFactor: z.number().positive(),
  }),
  ageFactors: z
    .array(z.object({ upTo: z.number(), factor: z.number().positive(), label: z.string().default('') }))
    .min(1),
  xp: z.object({
    sources: z.array(z.object({ id: z.string(), name: z.string(), amount: z.int().min(0) })).min(1),
    perTurnCap: z.int().min(0),
  }),
  teacher: z.object({
    minLead: z.int().min(0),
    qualities: z
      .array(
        z.object({
          level: z.int().min(1).max(5),
          name: z.string(),
          speed: z.number().positive(),
          hardNode: z.number(),
        }),
      )
      .min(1),
    daysPerLevel: z.number().positive(),
    daysPerNode: z.number().positive(),
    /** Trần điểm kỹ năng MỘT khóa mang lại, trước khi nhân tốc độ của thầy. */
    maxLevelsPerCourse: z.int().min(1).default(5),
    attitude: z.object({
      teachFloor: z.number(),
      fullFloor: z.number(),
      holdBackPenalty: z.number().min(0).max(1),
    }),
    priceKinds: z
      .array(
        z.object({
          id: z.string(),
          name: z.string(),
          obligation: z.boolean(),
          defaultDays: z.int().min(0).default(0),
        }),
      )
      .min(1),
  }),
  breakthrough: z.object({
    requiredTeacherTier: z.string(),
    triggers: z.array(z.object({ id: z.string(), name: z.string() })).min(1),
  }),
});

export type SkillTier = z.infer<typeof tierSchema>;
export type TeacherQuality = z.infer<typeof fileSchema>['teacher']['qualities'][number];
export type PriceKind = z.infer<typeof fileSchema>['teacher']['priceKinds'][number];
export type XpSource = z.infer<typeof fileSchema>['xp']['sources'][number];
export type BreakthroughTrigger = z.infer<typeof fileSchema>['breakthrough']['triggers'][number];

export class SkillProgressDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SkillProgressDataError';
  }
}

function load(): z.infer<typeof fileSchema> {
  const parsed = fileSchema.safeParse(progressFile);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new SkillProgressDataError(
      `data/skill-progress.json hỏng ở "${issue?.path.join('.') ?? '?'}": ${issue?.message ?? 'không rõ'}`,
    );
  }

  const data = parsed.data;
  const ids = new Set(data.tiers.map((tier) => tier.id));

  // Thang bậc phải LIỀN MẠCH và không chồng nhau. Một khe hở giữa hai bậc nghĩa
  // là có một con số kỹ năng không thuộc bậc nào, và mọi thứ tra theo bậc — trần,
  // ngưỡng, yêu cầu thầy — sẽ im lặng trả về bậc cuối cùng.
  let previous = -1;
  for (const tier of data.tiers) {
    if (tier.from !== previous + 1) {
      throw new SkillProgressDataError(
        `bậc "${tier.id}" bắt đầu ở ${tier.from} nhưng bậc trước kết thúc ở ${previous} — thang bậc phải liền mạch`,
      );
    }
    if (tier.to < tier.from) {
      throw new SkillProgressDataError(`bậc "${tier.id}" có to=${tier.to} nhỏ hơn from=${tier.from}`);
    }
    if (tier.teacherTier !== undefined && !ids.has(tier.teacherTier)) {
      throw new SkillProgressDataError(`bậc "${tier.id}" đòi thầy bậc "${tier.teacherTier}" không có trong thang`);
    }
    previous = tier.to;
  }

  const top = data.tiers[data.tiers.length - 1];
  if (top !== undefined && top.to !== data.hardCap) {
    throw new SkillProgressDataError(
      `bậc cuối kết thúc ở ${top.to} nhưng trần cứng là ${data.hardCap} — hai con số này phải bằng nhau`,
    );
  }
  if (!ids.has(data.load.masteryTier)) {
    throw new SkillProgressDataError(`load.masteryTier trỏ tới bậc "${data.load.masteryTier}" không có trong thang`);
  }
  if (!ids.has(data.breakthrough.requiredTeacherTier)) {
    throw new SkillProgressDataError(
      `breakthrough.requiredTeacherTier trỏ tới bậc "${data.breakthrough.requiredTeacherTier}" không có trong thang`,
    );
  }

  return data;
}

const DATA = load();

// ---------------------------------------------------------------------------
// Bậc kỹ năng (mục 2)
// ---------------------------------------------------------------------------

export function allTiers(): SkillTier[] {
  return [...DATA.tiers];
}

/** Bậc của một con số kỹ năng. Trên trần cứng thì vẫn là bậc cuối. */
export function tierOfLevel(level: number): SkillTier {
  const found = DATA.tiers.find((tier) => level >= tier.from && level <= tier.to);
  const last = DATA.tiers[DATA.tiers.length - 1];
  if (found === undefined && last === undefined) {
    throw new SkillProgressDataError('bảng bậc rỗng');
  }
  return found ?? (last as SkillTier);
}

export function tierOf(id: string): SkillTier | null {
  return DATA.tiers.find((tier) => tier.id === id) ?? null;
}

export function tierName(level: number): string {
  return tierOfLevel(level).name;
}

/** Bậc này đứng trên bậc kia bao nhiêu nấc. Âm là thấp hơn. */
export function tierDistance(from: string, to: string): number {
  const a = DATA.tiers.findIndex((tier) => tier.id === from);
  const b = DATA.tiers.findIndex((tier) => tier.id === to);
  if (a === -1 || b === -1) return 0;
  return b - a;
}

/** Bậc `candidate` có đạt tới bậc `required` không. */
export function tierAtLeast(candidate: string, required: string): boolean {
  return tierDistance(required, candidate) >= 0;
}

export function hardCap(): number {
  return DATA.hardCap;
}

/** Trần do chỉ số chính áp xuống (mục 2 — "trần chỉ số có thể hạ thấp con số này"). */
export function statCapFor(stat: number): number {
  const rule = DATA.statCap;
  return Math.max(rule.floor, Math.round(stat * rule.perStatPoint));
}

// ---------------------------------------------------------------------------
// Thực hành (mục 3)
// ---------------------------------------------------------------------------

export function practicePoints(): z.infer<typeof tierValueSchema> {
  return DATA.practice.points;
}

export function practiceConfig(): z.infer<typeof fileSchema>['practice'] {
  return DATA.practice;
}

/**
 * Ngưỡng điểm thực hành để lên 1 điểm kỹ năng, TRƯỚC hệ số chậm.
 *
 * `base × rank²` — mục 3: "tăng lũy tiến theo bình phương bậc hiện tại". Nhân
 * đôi ở bậc chỉ tự học được nửa tốc độ, và chỉ khi KHÔNG có thầy: có thầy thì
 * bậc Thành thạo chạy đủ tốc độ, đó chính là chỗ thầy đáng tiền.
 */
export function baseThreshold(level: number, hasTeacher: boolean): number {
  const tier = tierOfLevel(level);
  const config = DATA.practice;
  const slow = tier.selfStudy === 'half' && !hasTeacher ? config.halfSpeed : 1;
  return Math.max(1, Math.round(config.thresholdBase * tier.rank * tier.rank * slow));
}

// ---------------------------------------------------------------------------
// Tải học tập và tuổi tác (mục 5)
// ---------------------------------------------------------------------------

export function loadConfig(): z.infer<typeof fileSchema>['load'] {
  return DATA.load;
}

/** Hệ số chậm theo TUỔI HIỆU DỤNG. Bảng của mục 5, đọc từ data. */
export function ageFactor(effectiveAge: number): { factor: number; label: string } {
  for (const band of DATA.ageFactors) {
    if (effectiveAge <= band.upTo) return { factor: band.factor, label: band.label };
  }
  const last = DATA.ageFactors[DATA.ageFactors.length - 1];
  return { factor: last?.factor ?? 1, label: last?.label ?? '' };
}

// ---------------------------------------------------------------------------
// Điểm kinh nghiệm (mục 4)
// ---------------------------------------------------------------------------

export function xpSources(): XpSource[] {
  return [...DATA.xp.sources];
}

export function xpSourceOf(id: string): XpSource | null {
  return DATA.xp.sources.find((source) => source.id === id) ?? null;
}

export function xpPerTurnCap(): number {
  return DATA.xp.perTurnCap;
}

// ---------------------------------------------------------------------------
// Thầy dạy (mục 8)
// ---------------------------------------------------------------------------

export function teacherConfig(): z.infer<typeof fileSchema>['teacher'] {
  return DATA.teacher;
}

export function teacherQuality(level: number): TeacherQuality {
  const rounded = Math.max(1, Math.min(5, Math.round(level)));
  const found = DATA.teacher.qualities.find((quality) => quality.level === rounded);
  const first = DATA.teacher.qualities[0];
  if (found === undefined && first === undefined) throw new SkillProgressDataError('bảng chất lượng thầy rỗng');
  return found ?? (first as TeacherQuality);
}

export function priceKinds(): PriceKind[] {
  return [...DATA.teacher.priceKinds];
}

export function priceKindOf(id: string): PriceKind | null {
  return DATA.teacher.priceKinds.find((kind) => kind.id === id) ?? null;
}

// ---------------------------------------------------------------------------
// Đột phá (mục 8)
// ---------------------------------------------------------------------------

export function breakthroughTriggers(): BreakthroughTrigger[] {
  return [...DATA.breakthrough.triggers];
}

export function breakthroughTeacherTier(): string {
  return DATA.breakthrough.requiredTeacherTier;
}

export function isBreakthroughTrigger(id: string): boolean {
  return DATA.breakthrough.triggers.some((trigger) => trigger.id === id);
}
