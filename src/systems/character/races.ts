/**
 * CHỦNG TỘC (Phần 6 mục 2) — nạp từ `/data/races.json` theo R5.
 *
 * LUẬT CỨNG của mục 2: KHÔNG được viết cứng số lượng tộc vào bất kỳ đâu trong
 * code. Danh sách còn dài thêm, và mọi thứ ở file này đều đi qua `allRaces()`
 * chứ không đi qua một hằng số đếm sẵn.
 *
 * Thái độ quốc gia không nằm hết trong races.json: nền suy từ `nations.json`
 * (tộc nào cai trị thế lực nào, tộc nào có mặt), còn races.json chỉ khai CHỖ
 * LỆCH. Chép cả bảng vào hai file là bảo đảm sẽ có ngày hai file nói khác nhau.
 */

import { z } from 'zod';
import racesFile from '@data/races.json';
import nationsFile from '@data/nations.json';
import { STAT_IDS, STAT_MAX, type StatBlock, type StatId } from './stats';
import { traitOf } from './traits';

const rangeSchema = z.tuple([z.number(), z.number()]);

export const raceAppearanceSchema = z.object({
  heightCm: rangeSchema,
  weightKg: rangeSchema,
  /** Tỉ lệ cơ và mỡ, phần trăm. Phần 7 dùng THẲNG cho bản đồ cơ thể (mục 4). */
  musclePct: rangeSchema,
  fatPct: rangeSchema,
  builds: z.array(z.string()).min(1),
  skin: z.array(z.string()).min(1),
  hair: z.array(z.string()).min(1),
  eyes: z.array(z.string()).min(1),
  /** Đặc trưng chủng tộc: sừng, tai, vảy, lông, cánh… */
  features: z.array(z.string()).default([]),
});

export const raceSchema = z.object({
  id: z.string().startsWith('race_'),
  name: z.string().min(1),
  englishName: z.string().default(''),
  aliases: z.array(z.string()).default([]),
  group: z.string().min(1),
  parentRace: z.string().optional(),
  /** Node nhóm không chọn được lúc tạo nhân vật. */
  isGroupNode: z.boolean().default(false),
  playable: z.boolean().default(true),
  standing: z.string().default(''),
  church: z.string().default(''),
  /** `null` = không già đi (Huyết Tộc) hoặc chưa ai đo được. */
  lifespan: z.number().nullable().default(null),
  homelands: z.array(z.string()).default([]),
  /**
   * Ghi đè hệ số học của Phần 8 mục 5. Vắng thì suy từ tuổi thọ — xem
   * `learnFactor` ở cuối file. Chỉ khai ở tộc thật sự lệch khỏi luật chung.
   */
  learnRate: z.number().positive().optional(),
  loreEntry: z.string().default(''),
  note: z.string().default(''),
  language: z.string().default(''),
  stats: z.partialRecord(z.enum(STAT_IDS), z.number()).default({}),
  statCaps: z.partialRecord(z.enum(STAT_IDS), z.number()).default({}),
  traits: z.array(z.string()).default([]),
  appearance: raceAppearanceSchema.optional(),
  /** CHỈ khai chỗ lệch với nền suy từ nations.json. */
  attitudes: z.record(z.string(), z.number()).default({}),
  spread: z.array(z.object({ nation: z.string(), role: z.string() })).default([]),
  spreadNote: z.string().default(''),
});

export const ageStageSchema = z.object({
  id: z.string(),
  name: z.string(),
  from: z.number(),
  to: z.number(),
  statShift: z.partialRecord(z.enum(STAT_IDS), z.number()).default({}),
});

const appearanceCommonSchema = z.object({
  heightFemaleShiftCm: z.number().default(0),
  weightFemaleShiftPct: z.number().default(0),
  hairStyles: z.array(z.string()).min(1),
  beards: z.array(z.string()).min(1),
  eyeShapes: z.array(z.string()).min(1),
  faceFeatures: z.array(z.string()).min(1),
  voices: z.array(z.string()).min(1),
  gaits: z.array(z.string()).min(1),
  mannerisms: z.array(z.string()).min(1),
  marks: z.array(z.string()).min(1),
  scarSites: z.array(z.string()).min(1),
  scarCauses: z.array(z.string()).min(1),
});

const fileSchema = z.object({
  statCapDefault: z.number().default(STAT_MAX),
  ageTemplate: z.object({
    stages: z.array(ageStageSchema).min(1),
    agelessStage: z.string(),
    startAgeRatio: rangeSchema,
    /** Khoảng tuổi CHỌN ĐƯỢC lúc tạo, rộng hơn khoảng gợi ý ở trên. */
    creationAgeRatio: rangeSchema.default([0.18, 0.85]),
    /** Sàn tuổi khởi đầu, để tộc sống ngắn không sinh ra nhân vật trẻ con. */
    minStartAge: z.int().default(16),
    agelessReferenceLifespan: z.number(),
    /** Đòn bẩy tốc độ học theo tuổi thọ (Phần 8 mục 5). */
    learning: z
      .object({
        exponent: z.number().default(0.5),
        agelessLifespan: z.number().default(500),
        min: z.number().default(0.6),
        max: z.number().default(4),
      })
      .default({ exponent: 0.5, agelessLifespan: 500, min: 0.6, max: 4 }),
  }),
  appearanceCommon: appearanceCommonSchema,
  groups: z.array(z.object({ id: z.string(), name: z.string() })).default([]),
  races: z.array(raceSchema),
});

export type Race = z.infer<typeof raceSchema>;
export type RaceAppearance = z.infer<typeof raceAppearanceSchema>;
export type AgeStage = z.infer<typeof ageStageSchema>;
export type AppearanceCommon = z.infer<typeof appearanceCommonSchema>;

export class RaceDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RaceDataError';
  }
}

function load(): z.infer<typeof fileSchema> & { byId: Map<string, Race> } {
  const parsed = fileSchema.safeParse(racesFile);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new RaceDataError(
      `data/races.json hỏng ở "${issue?.path.join('.') ?? '?'}": ${issue?.message ?? 'không rõ'}`,
    );
  }

  const byId = new Map<string, Race>();
  for (const race of parsed.data.races) {
    if (byId.has(race.id)) throw new RaceDataError(`chủng tộc trùng id: ${race.id}`);
    // Một đặc tính gõ sai tên thì im lặng biến mất khỏi mọi phép kiểm, và người
    // chơi chịu thiệt suốt ván mà không có gì trên màn hình nói ra. Nổ ở đây.
    for (const traitId of race.traits) {
      if (traitOf(traitId) === null) {
        throw new RaceDataError(`chủng tộc "${race.id}" trỏ tới đặc tính "${traitId}" không có trong data/traits.json`);
      }
    }
    byId.set(race.id, race);
  }

  return { ...parsed.data, byId };
}

const DATA = load();

// ---------------------------------------------------------------------------
// Đọc
// ---------------------------------------------------------------------------

export function allRaces(): Race[] {
  return [...DATA.byId.values()];
}

/** Tộc chọn được lúc tạo nhân vật — bỏ node nhóm và bỏ tộc khai `playable: false`. */
export function playableRaces(): Race[] {
  return allRaces().filter((race) => race.playable && !race.isGroupNode);
}

export function raceOf(id: string): Race | null {
  return DATA.byId.get(id) ?? null;
}

export function raceName(id: string): string {
  return DATA.byId.get(id)?.name ?? id;
}

export function raceGroups(): { id: string; name: string }[] {
  return [...DATA.groups];
}

export function appearanceCommon(): AppearanceCommon {
  return DATA.appearanceCommon;
}

export function statCapDefault(): number {
  return DATA.statCapDefault;
}

/** Mod 12 chỉ số của một tộc, đủ 12 ô kể cả những ô bằng 0. */
export function statModsOf(raceId: string): StatBlock {
  const race = DATA.byId.get(raceId);
  const block = {} as StatBlock;
  for (const id of STAT_IDS) block[id] = race?.stats[id] ?? 0;
  return block;
}

/** Trần của một chỉ số ở tộc này. Tộc chỉ khai chỗ THẤP hơn trần chung. */
export function statCapOf(raceId: string, stat: StatId): number {
  return DATA.byId.get(raceId)?.statCaps[stat] ?? DATA.statCapDefault;
}

export function statCapsOf(raceId: string): StatBlock {
  const block = {} as StatBlock;
  for (const id of STAT_IDS) block[id] = statCapOf(raceId, id);
  return block;
}

export function traitsOf(raceId: string): string[] {
  return DATA.byId.get(raceId)?.traits ?? [];
}

// ---------------------------------------------------------------------------
// Tuổi
// ---------------------------------------------------------------------------

export function ageStages(): AgeStage[] {
  return DATA.ageTemplate.stages;
}

/**
 * Giai đoạn tuổi. Giai đoạn khai theo TỈ LỆ tuổi thọ, nên một tộc sống 600 năm
 * và một tộc sống 40 năm dùng chung một bảng — thêm tộc mới không phải thêm bảng.
 *
 * `lifespan: null` là tộc không già đi: đứng vĩnh viễn ở giai đoạn `agelessStage`,
 * bất kể đã sống bao lâu. Huyết Tộc của Phần 14b mục D chỉ chết vì bị giết.
 */
export function ageStageOf(raceId: string, age: number): AgeStage {
  const race = DATA.byId.get(raceId);
  const stages = DATA.ageTemplate.stages;
  const last = stages[stages.length - 1];
  if (last === undefined) throw new RaceDataError('ageTemplate.stages rỗng');

  if (race?.lifespan == null) {
    return stages.find((stage) => stage.id === DATA.ageTemplate.agelessStage) ?? last;
  }

  const ratio = age / race.lifespan;
  return stages.find((stage) => ratio >= stage.from && ratio < stage.to) ?? last;
}

/**
 * Tuổi khởi đầu hợp lý lúc tạo nhân vật, theo TỈ LỆ tuổi thọ của tộc.
 *
 * Sàn `minStartAge` cần thiết vì tỉ lệ một mình sinh ra kết quả vô lý ở hai đầu:
 * một Kobold sống 40 năm sẽ bắt đầu ở tuổi mười, còn một Mộc Tộc sống 800 năm
 * thì hai trăm tuổi vẫn đang ở đầu đời — vế sau đúng, vế trước thì không.
 */
export function startAgeRange(raceId: string): [number, number] {
  const race = DATA.byId.get(raceId);
  const lifespan = race?.lifespan ?? DATA.ageTemplate.agelessReferenceLifespan;
  const [low, high] = DATA.ageTemplate.startAgeRatio;
  const floor = DATA.ageTemplate.minStartAge;
  const min = Math.max(floor, Math.round(lifespan * low));
  return [min, Math.max(min, Math.round(lifespan * high))];
}

/** Tuổi hiệu dụng: tuổi quy về thang người thường, để so tộc sống 600 năm với tộc sống 55 năm. */
export function effectiveAge(raceId: string, age: number): number {
  const race = DATA.byId.get(raceId);
  const reference = DATA.ageTemplate.agelessReferenceLifespan;
  if (race?.lifespan == null || race.lifespan <= 0) return Math.min(age, reference);
  return Math.round((age / race.lifespan) * reference);
}

/**
 * Khoảng tuổi CHỌN ĐƯỢC lúc tạo nhân vật — rộng hơn `startAgeRange`.
 *
 * Hai khoảng khác nhau và cả hai đều cần: `startAgeRange` là chỗ con trỏ đứng
 * lúc mở trình tạo (một nhân vật vừa vào đời), còn khoảng này là chỗ người chơi
 * ĐƯỢC PHÉP đi tới. Gộp làm một thì không ai dựng nổi một lão tướng, mà nửa số
 * nhân vật thú vị của thế kỷ 15 đều đã ngoài bốn mươi.
 *
 * Trần trên dừng ở cuối bậc Lão niên: Đại lão là chỗ để nhân vật già đi tới
 * trong lúc chơi, không phải chỗ để bắt đầu.
 */
export function creationAgeRange(raceId: string): [number, number] {
  const race = DATA.byId.get(raceId);
  const lifespan = race?.lifespan ?? DATA.ageTemplate.agelessReferenceLifespan;
  const [low, high] = DATA.ageTemplate.creationAgeRatio;
  const floor = DATA.ageTemplate.minStartAge;
  const min = Math.max(floor, Math.round(lifespan * low));
  return [min, Math.max(min, Math.round(lifespan * high))];
}

/**
 * Chỉ số dịch đi vì tuổi (Phần 6 mục 2, bảng `ageTemplate.stages`).
 *
 * Trả về bảng THƯA — chỉ những chỉ số thật sự đổi — vì nó đi thẳng vào dòng
 * modifier mà người chơi đọc, và một dòng `Trí lực +0` chỉ tốn chỗ.
 */
export function ageStatShift(raceId: string, age: number): Partial<StatBlock> {
  return { ...ageStageOf(raceId, age).statShift };
}

/**
 * HỆ SỐ HỌC THEO CHỦNG TỘC (Phần 8 mục 5) — số càng lớn càng học chậm.
 *
 * Suy từ tuổi thọ chứ không khai tay từng tộc: `(tuổi thọ / 70) ^ 0.5`. Cao Tiên
 * sống 600 năm ra đúng ~3 lần chậm hơn như mục 5 viết, Kobold sống 40 năm thì
 * học nhanh hơn người thường. Thêm một tộc mới là có ngay hệ số hợp lý mà không
 * phải nhớ điền thêm một bảng — đúng tinh thần R5, vì luật nằm trong data chứ
 * không phải danh sách nằm trong code.
 *
 * Tộc không già đi dùng `agelessLifespan`: chúng có vô hạn thời gian, nên không
 * thể là tộc học nhanh nhất bảng.
 */
export function learnFactor(raceId: string): number {
  const race = DATA.byId.get(raceId);
  const rule = DATA.ageTemplate.learning;
  if (race?.learnRate !== undefined) return race.learnRate;

  const lifespan = race?.lifespan ?? rule.agelessLifespan;
  const reference = DATA.ageTemplate.agelessReferenceLifespan;
  if (lifespan <= 0 || reference <= 0) return 1;

  const raw = Math.pow(lifespan / reference, rule.exponent);
  return Math.max(rule.min, Math.min(rule.max, Math.round(raw * 100) / 100));
}

// ---------------------------------------------------------------------------
// Thái độ quốc gia (mục 2 và mục 7)
// ---------------------------------------------------------------------------

const nationsSchema = z.object({
  nations: z
    .array(
      z.object({
        id: z.string(),
        name: z.string().default(''),
        rulingRaces: z.array(z.string()).default([]),
        otherRaces: z.array(z.string()).default([]),
      }),
    )
    .default([]),
});

const NATIONS = nationsSchema.parse(nationsFile).nations;

/** Nền thái độ suy từ vai trò của tộc trong thế lực đó. */
export const ATTITUDE_BASE = {
  ruling: 25,
  present: 10,
  /** Qua tộc cha (ví dụ nhánh Frank hưởng chỗ `race_nhan-loai` có mặt). */
  parent: 5,
  absent: -5,
} as const;

export function nationIds(): string[] {
  return NATIONS.map((nation) => nation.id);
}

export function nationName(id: string): string {
  return NATIONS.find((nation) => nation.id === id)?.name ?? id;
}

/**
 * Thái độ ban đầu của một thế lực với một chủng tộc, thang -100..100.
 *
 * `attitudes` trong races.json GHI ĐÈ chứ không cộng dồn: những chỗ lịch sử bẻ
 * ngược cái nền (Orc với Giáo triều, Huyết Tộc với Dòng tu Teuton) phải nói
 * được con số cuối cùng, không phải một khoản cộng vào thứ mình không thấy.
 */
export function raceAttitudeTo(raceId: string, nationId: string): number {
  const race = DATA.byId.get(raceId);
  const override = race?.attitudes[nationId];
  if (override !== undefined) return override;

  const nation = NATIONS.find((candidate) => candidate.id === nationId);
  if (nation === undefined) return 0;

  if (nation.rulingRaces.includes(raceId)) return ATTITUDE_BASE.ruling;
  if (nation.otherRaces.includes(raceId)) return ATTITUDE_BASE.present;

  const parent = race?.parentRace;
  if (parent !== undefined && (nation.rulingRaces.includes(parent) || nation.otherRaces.includes(parent))) {
    return ATTITUDE_BASE.parent;
  }
  return ATTITUDE_BASE.absent;
}

/** Bảng thái độ đủ mọi thế lực — bước 7 của luồng tạo nhân vật dùng để hiện sẵn. */
export function attitudeTable(raceId: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const nation of NATIONS) out[nation.id] = raceAttitudeTo(raceId, nation.id);
  return out;
}

/** Nhãn tiếng Việt cho một mức thái độ. */
export function attitudeLabel(value: number): string {
  if (value <= -60) return 'thù địch';
  if (value <= -25) return 'nghi kỵ';
  if (value < 10) return 'dửng dưng';
  if (value < 25) return 'chấp nhận';
  return 'thân thiện';
}
