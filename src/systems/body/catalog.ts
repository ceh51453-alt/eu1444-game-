/**
 * BẢNG TRA THƯƠNG TÍCH (Phần 7 mục 2, 7, 8, 9) — nạp từ `/data/injuries.json`.
 *
 * Mọi con số cân bằng của hệ cơ thể ở trong file data, không ở trong code (R5).
 * Cái nằm trong code là TRÌNH TỰ: mức độ × loại × vùng, rồi mỗi lượt một vòng
 * chảy máu → nhiễm trùng → lành → biến chứng. Trình tự đó là cơ chế, không phải
 * nội dung, nên nó ở đây là đúng chỗ.
 *
 * Hiệu ứng của tàn phế vĩnh viễn dùng lại khuôn `effectSchema` của Phần 6: cùng
 * hình dạng thì cùng một đường quy đổi hệ với đặc tính chủng tộc và trang bị,
 * và không có chỗ nào để hai bên lệch nhau ở khâu 3d6.
 */

import { z } from 'zod';
import injuriesFile from '@data/injuries.json';
import type { CheckTier } from '@/core/turn';
import { effectSchema } from '@/systems/character/effects';
import type { DifficultyBand } from '@/systems/check';
import { BodyDataError } from './regions';

/** Mười loại thương tích của mục 2. */
export const INJURY_TYPES = [
  'blunt',
  'laceration',
  'puncture',
  'fracture',
  'burn',
  'crush',
  'dislocation',
  'concussion',
  'internal',
  'amputation',
] as const;

export type InjuryType = (typeof INJURY_TYPES)[number];
export type Severity = 1 | 2 | 3 | 4 | 5;

/**
 * `satisfies` ở đây là một hàng rào biên dịch, không phải trang trí: nếu Phần 5
 * đổi thang độ khó mà file này không đổi theo, lỗi phải nổ lúc build chứ không
 * phải lúc một biến chứng im lặng rơi về bậc mặc định.
 */
const DIFFICULTY_BANDS = [
  'de-dang',
  'thuong',
  'kho',
  'rat-kho',
  'cuc-kho',
  'gan-bat-kha',
] as const satisfies readonly DifficultyBand[];

const difficultyBand = z.enum(DIFFICULTY_BANDS);

const severityRowSchema = z.object({
  level: z.int().min(1).max(5),
  name: z.string().min(1),
  bleed: z.number().min(0),
  infectionGrowth: z.number().min(0),
  pain: z.number().min(0).max(100),
  healTurns: z.number().min(1),
  color: z.string().default('#888888'),
});

const typeRowSchema = z.object({
  id: z.enum(INJURY_TYPES),
  name: z.string().min(1),
  verb: z.string().default(''),
  bleedFactor: z.number().min(0).default(1),
  infectionFactor: z.number().min(0).default(1),
  painFactor: z.number().min(0).default(1),
  healFactor: z.number().min(0).default(1),
  /** Vết bẩn — điều kiện của uốn ván (mục 7). */
  dirty: z.boolean().default(false),
  /** Vết hở: còn chảy máu và còn là cửa vào của nhiễm trùng. */
  open: z.boolean().default(false),
  needsSplint: z.boolean().default(false),
  needsSetting: z.boolean().default(false),
  stunning: z.boolean().default(false),
  hidden: z.boolean().default(false),
  permanent: z.boolean().default(false),
  note: z.string().default(''),
});

const causeRowSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  keywords: z.array(z.string()).default([]),
  default: z.boolean().default(false),
  weights: z.partialRecord(z.enum(INJURY_TYPES), z.number()),
});

/** Tám loại điều kiện mà engine đọc được — không nhiều hơn (xem `$complicationsComment`). */
const triggerSchema = z.object({
  kind: z.enum(['infection', 'blood', 'wound', 'fracture', 'dislocation', 'immobile', 'spine', 'artery']),
  atLeast: z.number().optional(),
  atMost: z.number().optional(),
  minSeverity: z.number().optional(),
  types: z.array(z.enum(INJURY_TYPES)).default([]),
  dirty: z.boolean().optional(),
  chancePerTurn: z.number().optional(),
  afterTurns: z.number().optional(),
  belowMobility: z.number().optional(),
  unlessTreatments: z.array(z.string()).default([]),
});

const complicationRowSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  trigger: triggerSchema,
  difficulty: difficultyBand.default('thuong'),
  perTurn: z
    .object({
      bleeding: z.number().default(0),
      infection: z.number().default(0),
      pain: z.number().default(0),
      feverTarget: z.number().default(0),
      blood: z.number().default(0),
    })
    .default({ bleeding: 0, infection: 0, pain: 0, feverTarget: 0, blood: 0 }),
  spreadTurns: z.number().optional(),
  forcesAmputation: z.boolean().default(false),
  lethalInTrunkAfter: z.number().optional(),
  lethalAfter: z.number().optional(),
  clotResist: z.boolean().default(false),
  escalatesTo: z.string().optional(),
  permanentOnResolve: z.string().optional(),
  note: z.string().default(''),
});

const permanentRowSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  scarCause: z.string().default(''),
  mobilityPenalty: z.number().min(0).max(100).default(0),
  gripLoss: z.number().min(0).max(100).default(0),
  prosthetic: z.string().optional(),
  effects: z.array(effectSchema).default([]),
  note: z.string().default(''),
});

const prostheticRowSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  for: z.array(z.string()).default([]),
  /** Giảm bao nhiêu phần mức phạt, 0–1. KHÔNG bao giờ là 1 (mục 8). */
  relief: z.number().min(0).max(0.9).default(0),
  price: z.number().min(0).default(0),
  requiresCraft: z.string().optional(),
  note: z.string().default(''),
});

const diseaseRowSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  owner: z.string().default('Phần 15'),
  vector: z.string().default('moi-truong'),
  contagious: z.boolean().default(false),
  incubationTurns: z.number().min(0).default(0),
  feverTarget: z.number().min(0).max(100).default(0),
  painPerTurn: z.number().min(0).default(0),
  lethalAfter: z.number().min(1).default(99),
  difficulty: difficultyBand.default('rat-kho'),
  note: z.string().default(''),
});

const wholeBodySchema = z.object({
  bloodMax: z.number().default(100),
  bloodRegenPerTurn: z.number().default(1.2),
  bloodRegenBlockedAtFever: z.number().default(60),
  clotFlat: z.number().default(1),
  clotVitDivisor: z.number().default(8),
  clotFraction: z.number().default(0.25),
  bloodPenaltyLadder: z.array(z.object({ below: z.number(), penalty: z.number() })).default([]),
  painFactor: z.number().default(0.4),
  painWilReference: z.number().default(12),
  painWilFloor: z.number().default(2),
  feverFromInfection: z.number().default(0.9),
  feverStep: z.number().default(8),
  feverNecrosisBonus: z.number().default(20),
  feverPenaltyFactor: z.number().default(0.35),
  feverPenaltyFloor: z.number().default(25),
  shockPainWeight: z.number().default(0.5),
  shockBloodWeight: z.number().default(0.8),
  shockFreshTurns: z.number().default(3),
  shockFreshPerSeverity: z.number().default(8),
  consciousness: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        bloodBelow: z.number().optional(),
        painAtLeast: z.number().optional(),
        feverAtLeast: z.number().optional(),
        shockAtLeast: z.number().optional(),
      }),
    )
    .min(1),
  mobilityPerSeverity: z.number().default(14),
  mobilityBloodWeight: z.number().default(0.35),
  gripPerSeverity: z.number().default(16),
  staminaPerSeverity: z.number().default(12),
  staminaBloodWeight: z.number().default(0.6),
  staminaFeverWeight: z.number().default(0.5),
  regionPenaltyPerSeverity: z.number().default(5),
  regionPenaltyGripFactor: z.number().default(0.6),
  mobilityPenaltyFactor: z.number().default(0.35),
});

const fileSchema = z.object({
  severities: z.array(severityRowSchema).length(5),
  types: z.array(typeRowSchema).min(1),
  causes: z.array(causeRowSchema).min(1),
  aiSeverity: z.record(z.string(), z.tuple([z.number(), z.number()])),
  aiRequestsPerTurn: z.int().min(1).default(2),
  tierSeverity: z.record(z.string(), z.tuple([z.number(), z.number()])),
  toanThan: wholeBodySchema,
  complications: z.array(complicationRowSchema).default([]),
  permanent: z.array(permanentRowSchema).default([]),
  prosthetics: z.array(prostheticRowSchema).default([]),
  diseases: z.array(diseaseRowSchema).default([]),
  /**
   * VẾT DO BẠC GÂY RA (Phần 16 mục 6, Phần 14b mục D).
   *
   * Luật nằm ở đây chứ không ở Phần 16 vì nó là một luật HỒI PHỤC, và mọi luật
   * hồi phục đều thuộc Phần 7. Phần 16 chỉ có việc đánh dấu vết nào do bạc gây
   * ra — nó biết vật liệu, còn ở đây mới biết cơ thể lành thế nào.
   */
  silver: z
    .object({
      racesAffected: z.array(z.string()).default([]),
      healFactor: z.number().min(0).default(0),
      note: z.string().default(''),
    })
    .default({ racesAffected: [], healFactor: 0, note: '' }),
  death: z.object({
    bloodAtOrBelow: z.number().default(0),
    feverAtLeast: z.number().default(100),
    feverTurnsAllowed: z.number().default(3),
    vitalOrganDestroyedAtSeverity: z.number().default(5),
    necrosisInTrunkTurns: z.number().default(3),
    causes: z.record(z.string(), z.string()).default({}),
  }),
});

export type SeverityRow = z.infer<typeof severityRowSchema>;
export type InjuryTypeRow = z.infer<typeof typeRowSchema>;
export type CauseRow = z.infer<typeof causeRowSchema>;
export type ComplicationRow = z.infer<typeof complicationRowSchema>;
export type PermanentRow = z.infer<typeof permanentRowSchema>;
export type ProstheticRow = z.infer<typeof prostheticRowSchema>;
export type DiseaseRow = z.infer<typeof diseaseRowSchema>;
export type WholeBodyTuning = z.infer<typeof wholeBodySchema>;
export type DeathRules = z.infer<typeof fileSchema>['death'];

function load(): z.infer<typeof fileSchema> {
  const parsed = fileSchema.safeParse(injuriesFile);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new BodyDataError(
      `data/injuries.json hỏng ở "${issue?.path.join('.') ?? '?'}": ${issue?.message ?? 'không rõ'}`,
    );
  }

  const permanentIds = new Set(parsed.data.permanent.map((row) => row.id));
  for (const complication of parsed.data.complications) {
    const permanent = complication.permanentOnResolve;
    if (permanent !== undefined && !permanentIds.has(permanent)) {
      throw new BodyDataError(
        `biến chứng "${complication.id}" dẫn tới tàn phế "${permanent}" không có trong bảng permanent`,
      );
    }
  }
  for (const row of parsed.data.permanent) {
    const prosthetic = row.prosthetic;
    if (prosthetic !== undefined && !parsed.data.prosthetics.some((item) => item.id === prosthetic)) {
      throw new BodyDataError(`tàn phế "${row.id}" trỏ tới dụng cụ "${prosthetic}" không có trong bảng prosthetics`);
    }
  }
  if (!parsed.data.causes.some((cause) => cause.default)) {
    throw new BodyDataError('data/injuries.json thiếu nguyên nhân mặc định (`default: true`)');
  }

  return parsed.data;
}

const DATA = load();

// ---------------------------------------------------------------------------
// Đọc
// ---------------------------------------------------------------------------

export function severityRow(level: number): SeverityRow {
  const clamped = Math.max(1, Math.min(5, Math.round(level)));
  const row = DATA.severities.find((entry) => entry.level === clamped);
  if (row === undefined) throw new BodyDataError(`không có mức độ thương tích ${clamped}`);
  return row;
}

export function severityName(level: number): string {
  return severityRow(level).name;
}

export function severityColor(level: number): string {
  return severityRow(level).color;
}

export function injuryTypeRow(id: string): InjuryTypeRow {
  const row = DATA.types.find((entry) => entry.id === id);
  if (row === undefined) throw new BodyDataError(`không có loại thương tích "${id}"`);
  return row;
}

export function injuryTypeName(id: string): string {
  return DATA.types.find((entry) => entry.id === id)?.name ?? id;
}

export function allInjuryTypes(): InjuryTypeRow[] {
  return [...DATA.types];
}

export function allCauses(): CauseRow[] {
  return [...DATA.causes];
}

/**
 * Tra nguyên nhân theo ID, khớp chính xác.
 *
 * Có mặt bên cạnh `causeFromText` vì hai người gọi khác nhau: AI gửi `cause`
 * bằng LỜI (mục 3) và phải khớp theo từ khóa, còn ENGINE — Phần 9 khai vũ khí
 * trong `data/weapons.json`, Phần 10 khai binh chủng — biết đích danh id. Bắt
 * engine đi vòng qua bộ khớp từ khóa nghĩa là một id gõ đúng vẫn có thể rơi về
 * `khong-ro` chỉ vì nó không chứa từ khóa nào, và mọi vết của cây búa sẽ trông
 * như vết kiếm mà không có gì báo.
 */
export function causeOf(id: string): CauseRow | null {
  return DATA.causes.find((cause) => cause.id === id) ?? null;
}

export function defaultCause(): CauseRow {
  const row = DATA.causes.find((cause) => cause.default);
  if (row === undefined) throw new BodyDataError('thiếu nguyên nhân mặc định');
  return row;
}

/**
 * Đọc một câu mô tả tự do thành nguyên nhân đã biết.
 *
 * Mục 3 cho AI gửi `cause` bằng lời chứ không bằng id — bắt model nhớ id nội bộ
 * là bảo đảm nó sẽ gõ sai, và một id gõ sai thì im lặng rơi về mặc định. Khớp
 * theo từ khóa: nguyên nhân nào có từ khóa dài nhất khớp thì thắng, để "dao găm"
 * không bị "dao" của một mục khác cướp mất.
 */
export function causeFromText(text: string): CauseRow {
  const lowered = text.toLowerCase();
  let best: { cause: CauseRow; length: number } | null = null;

  for (const cause of DATA.causes) {
    for (const keyword of cause.keywords) {
      if (!lowered.includes(keyword.toLowerCase())) continue;
      if (best === null || keyword.length > best.length) best = { cause, length: keyword.length };
    }
  }
  return best?.cause ?? defaultCause();
}

export function allComplications(): ComplicationRow[] {
  return [...DATA.complications];
}

export function complicationOf(id: string): ComplicationRow | null {
  return DATA.complications.find((row) => row.id === id) ?? null;
}

export function complicationName(id: string): string {
  return complicationOf(id)?.name ?? id;
}

export function allPermanent(): PermanentRow[] {
  return [...DATA.permanent];
}

export function permanentOf(id: string): PermanentRow | null {
  return DATA.permanent.find((row) => row.id === id) ?? null;
}

export function permanentName(id: string): string {
  return permanentOf(id)?.name ?? id;
}

export function allProsthetics(): ProstheticRow[] {
  return [...DATA.prosthetics];
}

export function prostheticOf(id: string): ProstheticRow | null {
  return DATA.prosthetics.find((row) => row.id === id) ?? null;
}

/** Dụng cụ dùng được cho một loại tàn phế. */
export function prostheticsFor(permanentId: string): ProstheticRow[] {
  return DATA.prosthetics.filter((row) => row.for.includes(permanentId));
}

export function allDiseases(): DiseaseRow[] {
  return [...DATA.diseases];
}

export function diseaseOf(id: string): DiseaseRow | null {
  return DATA.diseases.find((row) => row.id === id) ?? null;
}

export function wholeBodyTuning(): WholeBodyTuning {
  return DATA.toanThan;
}

export function deathRules(): DeathRules {
  return DATA.death;
}

/** Luật vết do bạc gây ra (Phần 16 mục 6, Phần 14b mục D). */
export function silverRule(): { racesAffected: string[]; healFactor: number; note: string } {
  return DATA.silver;
}

export function deathCauseLabel(id: string): string {
  return DATA.death.causes[id] ?? id;
}

/** Trần số lần AI được xin gây thương tích trong một lượt (mục 3). */
export function aiRequestsPerTurn(): number {
  return DATA.aiRequestsPerTurn;
}

/** Khoảng mức độ ứng với một chữ mà AI được nói: `nhẹ` · `vừa` · `nặng`. */
export function aiSeverityRange(word: string): [number, number] | null {
  const key = word.trim().toLowerCase();
  return DATA.aiSeverity[key] ?? null;
}

export function aiSeverityWords(): string[] {
  return Object.keys(DATA.aiSeverity);
}

/** Khoảng mức độ ứng với một cấp kết quả kiểm định (Phần 5). */
export function tierSeverityRange(tier: CheckTier): [number, number] {
  return DATA.tierSeverity[tier] ?? [1, 2];
}
