/**
 * NẠP NĂM FILE DATA CỦA PHẦN 16 (mục 19 việc 1) — theo R5, không hardcode nội dung.
 *
 *   `data/materials.json`       vật liệu, KHÔNG xếp thang tuyến tính (mục 6)
 *   `data/weapons.json`         vũ khí, ba trục xuyên (mục 5)
 *   `data/armor.json`           giáp, che phủ theo 20 vùng + ba trục chống (mục 3)
 *   `data/enchantments.json`    phù phép, chỉ năm nguồn, không có tiệm (mục 14)
 *   `data/item-templates.json`  mẫu vật phẩm, chất lượng, hư hỏng, chế tạo
 *
 * MỘT SỰ THẬT CHO MỖI CON SỐ. `data/gear.json` của Phần 6 vẫn là nơi khai tên,
 * cân nặng, giá và ô mặc; mẫu ở đây KẾ THỪA chúng và chỉ thêm phần Phần 16 sở
 * hữu. `itemName`/`itemWeight`/`itemValue` là ba cửa duy nhất để đọc, và chúng
 * tự đi qua chuỗi mẫu → gear → mặc định. Chép một con số sang file thứ hai là
 * dựng sẵn ngày hai bên lệch nhau.
 *
 * MỌI KIỂM TRA CHÉO NỔ LÚC KHỞI ĐỘNG, không lùi lặng lẽ: một vùng cơ thể gõ
 * sai tên là một khe hở không bao giờ mở ra, và cả nhánh "đâm khe giáp" của
 * Phần 8 sẽ im lặng vô dụng (cùng lý do `body/regions.ts` nổ khi tổng trọng số
 * lệch 100).
 */

import { z } from 'zod';
import materialsFile from '@data/materials.json';
import weaponsFile from '@data/weapons.json';
import armorFile from '@data/armor.json';
import enchantmentsFile from '@data/enchantments.json';
import templatesFile from '@data/item-templates.json';
import { causeOf } from '@/systems/body/catalog';
import { regionOf } from '@/systems/body/regions';
import { gearMaterials, gearOf } from '@/systems/character/gear';
import { skillOf } from '@/systems/character/skills';

export class ItemDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ItemDataError';
  }
}

function parse<T>(schema: z.ZodType<T>, raw: unknown, file: string): T {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new ItemDataError(`${file} hỏng ở "${issue?.path.join('.') ?? '?'}": ${issue?.message ?? 'không rõ'}`);
  }
  return parsed.data;
}

// ---------------------------------------------------------------------------
// Ba trục — mục 3. Không gộp, không rút gọn, ở mọi nơi trong Phần 16.
// ---------------------------------------------------------------------------

/** `chem` chống/xuyên chém · `dam` đâm · `dap` đập. Ba con số RIÊNG (mục 3). */
export const AXES = ['chem', 'dam', 'dap'] as const;
export type Axis = (typeof AXES)[number];

const axisSchema = z.object({ chem: z.number(), dam: z.number(), dap: z.number() });
export type AxisTriple = z.infer<typeof axisSchema>;

const axisPartial = z
  .object({ chem: z.number().default(0), dam: z.number().default(0), dap: z.number().default(0) })
  .default({ chem: 0, dam: 0, dap: 0 });

export function emptyTriple(): AxisTriple {
  return { chem: 0, dam: 0, dap: 0 };
}

// ---------------------------------------------------------------------------
// materials.json (mục 6)
// ---------------------------------------------------------------------------

const materialSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  family: z.string().default('kim-loai'),
  weightFactor: z.number().min(0.1).default(1),
  priceFactor: z.number().min(0).default(1),
  /** Hệ số NHÂN vào ba giá trị chống của món giáp. */
  protection: axisSchema,
  /** Hệ số NHÂN vào ba giá trị xuyên của vũ khí. */
  power: axisSchema,
  /** Giữ lưỡi: âm là mẻ nhanh, dương là giữ lâu (mục 6, mục 10). */
  edgeKeep: z.number().default(0),
  /** Tốc độ gỉ sét tương đối. 0 là không bao giờ gỉ. */
  rust: z.number().min(0).default(1),
  /** Phần trăm hiệu lực mất khi ẩm — cung sừng hỏng khi mưa (mục 6). */
  wetPenalty: z.number().min(0).default(0),
  /** Lực kéo cộng thêm cho thân cung. */
  bowDraw: z.number().default(0),
  /** BẠC: thứ duy nhất gây thương tích không tự lành cho Huyết Tộc (Phần 14b mục D). */
  silver: z.boolean().default(false),
  fireproof: z.boolean().default(false),
  /** Xương Troll tự liền lại nếu được giữ ẩm (mục 6) — điểm tình trạng hồi mỗi tuần. */
  selfRepair: z.number().min(0).default(0),
  /** Đồng thau và vàng: trang trí, không dùng cho vũ khí thật. */
  decorative: z.boolean().default(false),
  enchantable: z.boolean().default(false),
  /** Chỉ thế lực này bán. Rỗng là mua được ở mọi nơi. */
  source: z.string().default(''),
  craftSkillMin: z.number().min(0).default(0),
  /** Hệ số nhân vào xác suất sinh từng loại hư hỏng của mục 10. */
  damageBias: z.record(z.string(), z.number()).default({}),
  eraFrom: z.number().optional(),
  eraTo: z.number().optional(),
  note: z.string().default(''),
});

const materialsFileSchema = z.object({
  version: z.number(),
  default: materialSchema,
  materials: z.array(materialSchema).min(1),
});

export type Material = z.infer<typeof materialSchema>;

// ---------------------------------------------------------------------------
// weapons.json (mục 5)
// ---------------------------------------------------------------------------

const rangedSchema = z.object({
  /** Tầm bắn tính bằng ô. Tách khỏi `reach` — xem `$rangedComment` của file data. */
  cells: z.number().min(1),
  cause: z.string().min(1),
  power: axisSchema,
  reloadRounds: z.number().min(0).default(1),
  closeRangeBonus: z.number().default(0),
  wetPenalty: z.number().min(0).max(100).default(0),
  mountedOk: z.boolean().default(false),
  trainingYears: z.number().min(0).default(1),
  thrown: z.boolean().default(false),
  windlass: z.boolean().default(false),
  gunpowder: z.boolean().default(false),
  accuracyPenalty: z.number().default(0),
  /** Kiểm định sĩ khí cho địch lần đầu nghe tiếng nổ (mục 16). */
  terrorCheck: z.boolean().default(false),
  spooksHorses: z.boolean().default(false),
  /** Đại thất bại = tự gây thương tích cho chính mình (mục 16). */
  misfireOnCritFail: z.boolean().default(false),
});

const weaponProfileSchema = z.object({
  skill: z.string().min(1),
  tags: z.array(z.string()).default([]),
  reach: z.object({ min: z.number().min(0), max: z.number().min(0) }),
  cause: z.string().min(1),
  thrustCause: z.string().optional(),
  /** Sức xuyên theo ba trục (mục 3). Thang chung với `protection` của giáp. */
  power: axisSchema,
  speedShift: z.number().default(0),
  twoHanded: z.boolean().default(false),
  halfSword: z.boolean().default(false),
  gapSeeking: z.boolean().default(false),
  shield: z.boolean().default(false),
  /** Chùy, búa, rìu: giáp chặn lưỡi nhưng không chặn lực → gãy xương (mục 4). */
  crush: z.boolean().default(false),
  hook: z.boolean().default(false),
  group: z.string().default(''),
  formationBonus: z.boolean().default(false),
  formationOnly: z.boolean().default(false),
  mountedOnly: z.boolean().default(false),
  /** Thương kỵ: dùng một lần rồi gãy (mục 5). */
  oneUse: z.boolean().default(false),
  ranged: rangedSchema.optional(),
  faction: z.string().default(''),
  eraFrom: z.number().optional(),
  eraTo: z.number().optional(),
  note: z.string().default(''),
});

const weaponSchema = weaponProfileSchema.extend({ id: z.string().startsWith('item_') });

const weaponsFileSchema = z.object({
  version: z.number(),
  default: weaponProfileSchema,
  weapons: z.array(weaponSchema),
  siegeOnly: z
    .array(
      z.object({
        id: z.string().startsWith('item_'),
        faction: z.string().default(''),
        eraFrom: z.number().optional(),
        wallDamageFactor: z.number().min(0).default(1),
        wetPenalty: z.number().min(0).max(100).default(0),
        note: z.string().default(''),
      }),
    )
    .default([]),
  blunted: z.object({
    cause: z.string().min(1),
    powerFactor: z.number().min(0).max(1).default(0.5),
    note: z.string().default(''),
  }),
});

export type WeaponProfile = z.infer<typeof weaponProfileSchema>;
export type RangedProfile = z.infer<typeof rangedSchema>;
export type SiegeWeapon = z.infer<typeof weaponsFileSchema>['siegeOnly'][number];

// ---------------------------------------------------------------------------
// armor.json (mục 3, 4, 8, 9)
// ---------------------------------------------------------------------------

const armorClassSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  rank: z.int().min(0),
  plate: z.boolean().default(false),
});

const coverSchema = z.object({
  region: z.string().min(1),
  /** Phần trăm diện tích vùng thật sự có kim loại. Dưới 100 là còn khe (mục 4). */
  coverage: z.number().min(0).max(100),
});

const armorPieceSchema = z.object({
  id: z.string().startsWith('item_'),
  class: z.string().min(1),
  covers: z.array(coverSchema).min(1),
  /** Ba giá trị chống RIÊNG BIỆT (mục 3). Thang 0–100, đo bằng thép tôi. */
  protection: axisSchema,
  /** Cách tải nằm trên người — quyết định mệt, không quyết định cân nặng (mục 9). */
  carry: z.string().default('toan-than'),
  /** `do-may` · `co-gian` · `khong-can` (mục 8). */
  fit: z.string().default('co-gian'),
  staminaPerRound: z.number().min(0).default(0),
  sightPenalty: z.number().min(0).default(0),
  perPenalty: z.number().min(0).default(0),
  /** Áo lót độn: nền của mọi bộ (mục 3). */
  base: z.boolean().default(false),
  /** Món này phải đi kèm món kia — tấm che mặt cần mũ bascinet. */
  requires: z.string().default(''),
  eraFrom: z.number().optional(),
  eraTo: z.number().optional(),
  note: z.string().default(''),
});

const shieldSchema = z.object({
  id: z.string().startsWith('item_'),
  staminaPerRound: z.number().min(0).default(0),
  weightFactor: z.number().min(1).default(1),
  coverBonus: z.number().default(0),
  carry: z.string().default('chi'),
});

const bandSchema = z.object({
  id: z.string().min(1),
  minPen: z.number(),
  severityCap: z.int().min(0).max(5),
  forceType: z.string().optional(),
  note: z.string().default(''),
});

const fitGradeSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  agi: z.number().default(0),
  speed: z.number().default(0),
  stamina: z.number().default(0),
  jointLock: z.int().min(0).default(0),
  wearable: z.boolean().default(true),
  note: z.string().default(''),
});

const carryModeSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  fatiguePerKg: z.number().min(0),
  note: z.string().default(''),
});

const armorFileSchema = z.object({
  version: z.number(),
  classes: z.array(armorClassSchema).min(1),
  layering: z.object({ second: z.number().min(0).max(1), third: z.number().min(0).max(1), max: z.number().min(1).max(100) }),
  resolution: z.object({
    bands: z.array(bandSchema).min(1),
    crushForceType: z.string().default('fracture'),
    gapAimBias: z.number().min(1).default(4),
    gapRelief: z.number().min(0).max(1).default(0.75),
  }),
  fit: z.object({
    modes: z.array(z.object({ id: z.string(), name: z.string(), note: z.string().default('') })).min(1),
    grades: z.array(fitGradeSchema).min(1),
    tolerance: z.object({
      heightCm: z.number().min(0),
      weightPct: z.number().min(0),
      farHeightCm: z.number().min(0),
      farWeightPct: z.number().min(0),
    }),
    raceStrict: z.boolean().default(true),
    refit: z.object({
      skill: z.string().min(1),
      skillMin: z.number().min(0),
      weeks: z.number().min(0),
      costPct: z.number().min(0),
      building: z.string().default(''),
    }),
  }),
  carry: z.object({
    modes: z.array(carryModeSchema).min(1),
    unbeltedPenalty: z.number().min(0).default(0),
    hurtShoulderFactor: z.number().min(1).default(1),
    swimPenaltyPerKg: z.number().min(0).default(0),
  }),
  pieces: z.array(armorPieceSchema),
  shields: z.array(shieldSchema),
  gapNames: z.record(z.string(), z.string()).default({}),
});

export type ArmorClass = z.infer<typeof armorClassSchema>;
export type ArmorPiece = z.infer<typeof armorPieceSchema>;
export type ShieldProfile = z.infer<typeof shieldSchema>;
export type ResolutionBand = z.infer<typeof bandSchema>;
export type FitGrade = z.infer<typeof fitGradeSchema>;
export type CarryMode = z.infer<typeof carryModeSchema>;
export type LayeringConfig = z.infer<typeof armorFileSchema>['layering'];
export type FitConfig = z.infer<typeof armorFileSchema>['fit'];
export type CarryConfig = z.infer<typeof armorFileSchema>['carry'];
export type ResolutionConfig = z.infer<typeof armorFileSchema>['resolution'];

// ---------------------------------------------------------------------------
// enchantments.json (mục 14)
// ---------------------------------------------------------------------------

const enchantModifierSchema = z.object({
  label: z.string().min(1),
  value: z.number(),
  kind: z.enum(['flat', 'dc', 'pool', 'dieShift']),
  domains: z.array(z.string()).min(1),
  whenAnyTag: z.array(z.string()).default([]),
});

const enchantmentSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  source: z.string().default(''),
  origin: z.string().default(''),
  material: z.string().default(''),
  durable: z.boolean().default(false),
  /** Entry lorebook với `knowledge='gated'` (mục 14, Phần 4 mục 5). */
  loreEntry: z.string().default(''),
  gated: z.boolean().default(true),
  rarity: z.string().default('hiem'),
  weapon: axisPartial,
  armor: axisPartial,
  versus: z.array(z.string()).default([]),
  versusPower: axisPartial,
  silverLike: z.boolean().default(false),
  fireproof: z.boolean().default(false),
  weightFactor: z.number().min(0.1).default(1),
  conditionDecay: z.number().min(0).default(1),
  modifiers: z.array(enchantModifierSchema).default([]),
  cursed: z.boolean().default(false),
  hiddenUntilTurns: z.int().min(0).default(0),
  curse: z
    .object({ id: z.string(), revealAfterTurns: z.int().min(0).default(0), note: z.string().default('') })
    .optional(),
  note: z.string().default(''),
});

const enchantmentsFileSchema = z.object({ version: z.number(), enchantments: z.array(enchantmentSchema) });

export type Enchantment = z.infer<typeof enchantmentSchema>;
export type EnchantModifier = z.infer<typeof enchantModifierSchema>;

// ---------------------------------------------------------------------------
// item-templates.json (mục 2, 7, 10, 11, 12, 13, 15)
// ---------------------------------------------------------------------------

const qualitySchema = z.object({
  id: z.string().min(1),
  level: z.int().min(1).max(5),
  name: z.string().min(1),
  /** Id cũ của `data/gear.json` — save từ Phần 6 tra được mà không phải migrate. */
  alias: z.array(z.string()).default([]),
  bonus: z.number().default(0),
  power: z.number().default(0),
  protect: z.number().default(0),
  priceFactor: z.number().min(0).default(1),
  conditionDecay: z.number().min(0).default(1),
  /** Tuyệt tác có TÊN RIÊNG (mục 7). */
  named: z.boolean().default(false),
  prestige: z.number().default(0),
});

const repairSchema = z.object({
  skill: z.string().default(''),
  skillMin: z.number().min(0).default(0),
  hours: z.number().min(0).default(1),
  supplies: z.number().min(0).default(0),
  building: z.string().default(''),
  valuePct: z.number().min(0).default(0),
  note: z.string().default(''),
});

const damageKindSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  applies: z.array(z.string()).min(1),
  /** Hư hỏng nằm ở MỘT VÙNG cụ thể — giáp móp, giáp thủng (mục 10). */
  regional: z.boolean().default(false),
  coverage: z.number().default(0),
  power: axisPartial,
  protect: axisPartial,
  broken: z.boolean().default(false),
  slipsOff: z.boolean().default(false),
  spreads: z.boolean().default(false),
  spreadPerWeek: z.number().min(0).default(0),
  bowOnly: z.boolean().default(false),
  storageOnly: z.boolean().default(false),
  repair: repairSchema,
});

const craftSchema = z.object({
  skill: z.string().min(1),
  skillMin: z.number().min(0).default(0),
  building: z.string().default(''),
  manWeeks: z.number().min(0).default(1),
  pattern: z.string().default(''),
});

const templateSchema = z.object({
  id: z.string().startsWith('item_'),
  name: z.string().optional(),
  kind: z.string().optional(),
  slot: z.string().optional(),
  material: z.string().optional(),
  weightKg: z.number().min(0).optional(),
  value: z.number().min(0).optional(),
  eraFrom: z.number().optional(),
  eraTo: z.number().optional(),
  faction: z.string().default(''),
  craft: craftSchema.optional(),
  maintenance: z.object({ weeks: z.number().min(0), supplies: z.number().min(0).default(0) }).optional(),
  note: z.string().default(''),
});

const patternSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  skill: z.string().min(1),
  skillMin: z.number().min(0).default(0),
  learnDifficulty: z.string().default('thuong'),
  inventedYear: z.number(),
  /** Năm kiểu này bắt đầu lan ra ngoài nơi phát minh (mục 11). */
  spreadFrom: z.number(),
  origin: z.string().default(''),
});

const templatesFileSchema = z.object({
  version: z.number(),
  qualities: z.array(qualitySchema).min(1),
  craftRoll: z.object({
    system: z.string().default('3d6'),
    difficulty: z.string().default('thuong'),
    tiers: z.array(z.object({ minMargin: z.number(), quality: z.string() })).min(1),
    skillPerPoint: z.number().default(0),
    forgeQualityPerLevel: z.number().default(0),
    materialCraftMinPenalty: z.number().default(0),
    extraTimeFactor: z.number().default(0),
    noPatternPenalty: z.number().default(0),
  }),
  damageKinds: z.array(damageKindSchema).min(1),
  maintenance: z.object({
    conditionPerBattle: z.number().min(0),
    conditionPerCampaignWeek: z.number().min(0),
    wetStorageExtra: z.number().min(0).default(0),
    perSmith: z.number().min(1),
    noSmithMultiplier: z.number().min(1),
    damageAtCondition: z.array(z.object({ below: z.number(), chance: z.number().min(0).max(100) })).min(1),
    restorePerHour: z.number().min(0),
    suppliesPerHour: z.number().min(0),
  }),
  patterns: z.array(patternSchema).min(1),
  patternLearning: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        weeks: z.number().min(0),
        cost: z.number().min(0),
        needsTeacher: z.boolean().default(false),
        destroysItem: z.boolean().default(false),
        note: z.string().default(''),
      }),
    )
    .min(1),
  massProduction: z.object({
    batchMin: z.int().min(1),
    manWeekFactor: z.number().min(0),
    qualityShift: z.number(),
    maxQuality: z.string(),
    note: z.string().default(''),
  }),
  factions: z.record(
    z.string(),
    z.object({
      name: z.string(),
      catalog: z.array(z.string()).default([]),
      exclusive: z.array(z.string()).default([]),
      materials: z.array(z.string()).default([]),
      patterns: z.array(z.string()).default([]),
      wealthFactor: z.number().min(0).default(1),
      note: z.string().default(''),
    }),
  ),
  templates: z.array(templateSchema),
  heraldry: z.object({
    captureChanceBonus: z.number(),
    targetedBonus: z.number(),
    prestigePerVictory: z.number(),
    hiddenHonourLoss: z.number(),
    hiddenDiscoveryChance: z.number().min(0).max(100),
    richNoDeviceKillBonus: z.number(),
    richArmourValue: z.number().min(0),
    carriers: z.array(z.string()).default([]),
  }),
});

export type ItemQuality = z.infer<typeof qualitySchema>;
export type DamageKind = z.infer<typeof damageKindSchema>;
export type ItemTemplate = z.infer<typeof templateSchema>;
export type CraftSpec = z.infer<typeof craftSchema>;
export type Pattern = z.infer<typeof patternSchema>;
export type MaintenanceConfig = z.infer<typeof templatesFileSchema>['maintenance'];
export type CraftRollConfig = z.infer<typeof templatesFileSchema>['craftRoll'];
export type MassProduction = z.infer<typeof templatesFileSchema>['massProduction'];
export type FactionCatalog = z.infer<typeof templatesFileSchema>['factions'][string];
export type HeraldryConfig = z.infer<typeof templatesFileSchema>['heraldry'];
export type PatternLearning = z.infer<typeof templatesFileSchema>['patternLearning'][number];

// ---------------------------------------------------------------------------
// Nạp và kiểm chéo
// ---------------------------------------------------------------------------

interface Loaded {
  materials: Map<string, Material>;
  materialDefault: Material;
  weapons: Map<string, WeaponProfile>;
  weaponDefault: WeaponProfile;
  siegeOnly: Map<string, SiegeWeapon>;
  blunted: z.infer<typeof weaponsFileSchema>['blunted'];
  armorClasses: Map<string, ArmorClass>;
  pieces: Map<string, ArmorPiece>;
  shields: Map<string, ShieldProfile>;
  layering: LayeringConfig;
  resolution: ResolutionConfig;
  fit: FitConfig;
  carry: CarryConfig;
  gapNames: Record<string, string>;
  enchantments: Map<string, Enchantment>;
  qualities: ItemQuality[];
  qualityIndex: Map<string, ItemQuality>;
  craftRoll: CraftRollConfig;
  damageKinds: Map<string, DamageKind>;
  maintenance: MaintenanceConfig;
  patterns: Map<string, Pattern>;
  patternLearning: PatternLearning[];
  massProduction: MassProduction;
  factions: Record<string, FactionCatalog>;
  templates: Map<string, ItemTemplate>;
  heraldry: HeraldryConfig;
}

function checkCause(cause: string, where: string): void {
  if (causeOf(cause) === null) {
    throw new ItemDataError(`${where} khai nguyên nhân "${cause}" không có trong bảng causes của data/injuries.json`);
  }
}

function checkSkill(skill: string, where: string): void {
  if (skill !== '' && skillOf(skill) === null) {
    throw new ItemDataError(`${where} dùng kỹ năng "${skill}" không có trong data/skills.json`);
  }
}

function load(): Loaded {
  const materialsData = parse(materialsFileSchema, materialsFile, 'data/materials.json');
  const weaponsData = parse(weaponsFileSchema, weaponsFile, 'data/weapons.json');
  const armorData = parse(armorFileSchema, armorFile, 'data/armor.json');
  const enchantData = parse(enchantmentsFileSchema, enchantmentsFile, 'data/enchantments.json');
  const templateData = parse(templatesFileSchema, templatesFile, 'data/item-templates.json');

  // --- vật liệu ------------------------------------------------------------
  const materials = new Map<string, Material>();
  for (const material of materialsData.materials) {
    if (materials.has(material.id)) throw new ItemDataError(`vật liệu trùng id: ${material.id}`);
    materials.set(material.id, material);
  }
  // Bảng `materials` của `data/gear.json` chỉ có tên; cơ học nằm ở đây. Thiếu một
  // id nghĩa là một món của Phần 6 rơi về vật liệu mặc định mà không có gì báo,
  // và một thanh kiếm bạc sẽ lặng lẽ mất tính chất bạc trước Huyết Tộc.
  for (const material of gearMaterials()) {
    if (!materials.has(material.id)) {
      throw new ItemDataError(
        `data/gear.json khai vật liệu "${material.id}" mà data/materials.json không có — cơ học vật liệu sẽ rơi về mặc định trong im lặng`,
      );
    }
  }

  // --- mẫu vật phẩm --------------------------------------------------------
  const templates = new Map<string, ItemTemplate>();
  for (const template of templateData.templates) {
    if (templates.has(template.id)) throw new ItemDataError(`mẫu vật phẩm trùng id: ${template.id}`);
    const inherited = gearOf(template.id);
    if (inherited === null) {
      // Không kế thừa được thì phải khai đủ. Lùi lặng lẽ về mặc định là cách một
      // cây rìu cán dài thành món nặng 0 cân giá 0 đồng.
      for (const field of ['name', 'kind', 'slot', 'weightKg', 'value'] as const) {
        if (template[field] === undefined) {
          throw new ItemDataError(
            `mẫu "${template.id}" không có trong data/gear.json nên phải tự khai "${field}"`,
          );
        }
      }
    }
    const material = template.material ?? inherited?.material ?? '';
    if (material !== '' && !materials.has(material)) {
      throw new ItemDataError(`mẫu "${template.id}" dùng vật liệu "${material}" không có trong data/materials.json`);
    }
    if (template.craft !== undefined) checkSkill(template.craft.skill, `mẫu "${template.id}"`);
    templates.set(template.id, template);
  }

  const patterns = new Map<string, Pattern>();
  for (const pattern of templateData.patterns) {
    if (patterns.has(pattern.id)) throw new ItemDataError(`bản mẫu trùng id: ${pattern.id}`);
    checkSkill(pattern.skill, `bản mẫu "${pattern.id}"`);
    patterns.set(pattern.id, pattern);
  }
  for (const template of templates.values()) {
    const patternId = template.craft?.pattern ?? '';
    if (patternId !== '' && !patterns.has(patternId)) {
      throw new ItemDataError(`mẫu "${template.id}" cần bản mẫu "${patternId}" chưa khai`);
    }
  }

  const known = (id: string): boolean => templates.has(id) || gearOf(id) !== null;

  // --- vũ khí --------------------------------------------------------------
  checkSkill(weaponsData.default.skill, 'data/weapons.json → default');
  checkCause(weaponsData.default.cause, 'data/weapons.json → default');
  const weapons = new Map<string, WeaponProfile>();
  for (const weapon of weaponsData.weapons) {
    if (weapons.has(weapon.id)) throw new ItemDataError(`vũ khí trùng id: ${weapon.id}`);
    if (!known(weapon.id)) {
      throw new ItemDataError(`data/weapons.json tả "${weapon.id}" mà không mẫu nào và data/gear.json cũng không có`);
    }
    checkSkill(weapon.skill, `vũ khí "${weapon.id}"`);
    if (weapon.reach.max < weapon.reach.min) {
      throw new ItemDataError(`vũ khí "${weapon.id}" khai tầm với ngược: min ${weapon.reach.min} > max ${weapon.reach.max}`);
    }
    for (const cause of [weapon.cause, weapon.thrustCause ?? weapon.cause]) checkCause(cause, `vũ khí "${weapon.id}"`);
    if (weapon.ranged !== undefined) checkCause(weapon.ranged.cause, `tầm bắn của "${weapon.id}"`);
    weapons.set(weapon.id, weapon);
  }
  checkCause(weaponsData.blunted.cause, 'data/weapons.json → blunted');

  const siegeOnly = new Map(weaponsData.siegeOnly.map((row) => [row.id, row] as const));

  // --- giáp ----------------------------------------------------------------
  const armorClasses = new Map(armorData.classes.map((row) => [row.id, row] as const));
  const carryModes = new Set(armorData.carry.modes.map((mode) => mode.id));
  const fitModes = new Set(armorData.fit.modes.map((mode) => mode.id));

  const pieces = new Map<string, ArmorPiece>();
  for (const piece of armorData.pieces) {
    if (pieces.has(piece.id)) throw new ItemDataError(`giáp trùng id: ${piece.id}`);
    if (!known(piece.id)) {
      throw new ItemDataError(`data/armor.json tả "${piece.id}" mà không mẫu nào và data/gear.json cũng không có`);
    }
    if (!armorClasses.has(piece.class)) {
      throw new ItemDataError(`giáp "${piece.id}" thuộc loại "${piece.class}" chưa khai`);
    }
    if (!carryModes.has(piece.carry)) throw new ItemDataError(`giáp "${piece.id}" khai cách mang "${piece.carry}" chưa có`);
    if (!fitModes.has(piece.fit)) throw new ItemDataError(`giáp "${piece.id}" khai kiểu vừa người "${piece.fit}" chưa có`);
    // Một vùng gõ sai tên là một mảnh giáp che vào hư vô, và người chơi sẽ thấy
    // mình hở ở một chỗ mà bảng trang bị nói là đã kín.
    for (const cover of piece.covers) {
      if (regionOf(cover.region) === null) {
        throw new ItemDataError(`giáp "${piece.id}" che vùng "${cover.region}" không có trên bản đồ cơ thể`);
      }
    }
    if (piece.requires !== '' && !known(piece.requires)) {
      throw new ItemDataError(`giáp "${piece.id}" đòi món "${piece.requires}" không tồn tại`);
    }
    pieces.set(piece.id, piece);
  }
  for (const piece of pieces.values()) {
    if (piece.requires !== '' && !pieces.has(piece.requires)) {
      throw new ItemDataError(`giáp "${piece.id}" đòi "${piece.requires}" mà món đó không phải một mảnh giáp`);
    }
  }

  const shields = new Map<string, ShieldProfile>();
  for (const shield of armorData.shields) {
    if (!known(shield.id)) {
      throw new ItemDataError(`data/armor.json tả khiên "${shield.id}" mà không mẫu nào và data/gear.json cũng không có`);
    }
    shields.set(shield.id, shield);
  }
  for (const region of Object.keys(armorData.gapNames)) {
    if (regionOf(region) === null) {
      throw new ItemDataError(`gapNames đặt tên cho vùng "${region}" không có trên bản đồ cơ thể`);
    }
  }
  checkSkill(armorData.fit.refit.skill, 'data/armor.json → fit.refit');

  // --- chất lượng, hư hỏng, phù phép --------------------------------------
  const qualityIndex = new Map<string, ItemQuality>();
  for (const quality of templateData.qualities) {
    qualityIndex.set(quality.id, quality);
    for (const alias of quality.alias) qualityIndex.set(alias, quality);
  }

  const damageKinds = new Map<string, DamageKind>();
  for (const kind of templateData.damageKinds) {
    if (damageKinds.has(kind.id)) throw new ItemDataError(`loại hư hỏng trùng id: ${kind.id}`);
    checkSkill(kind.repair.skill, `hư hỏng "${kind.id}"`);
    damageKinds.set(kind.id, kind);
  }
  // `damageBias` trỏ vào loại hư hỏng — gõ sai thì hệ số im lặng không bao giờ áp.
  for (const material of materials.values()) {
    for (const id of Object.keys(material.damageBias)) {
      if (!damageKinds.has(id)) {
        throw new ItemDataError(`vật liệu "${material.id}" thiên lệch về hư hỏng "${id}" chưa khai trong item-templates.json`);
      }
    }
  }

  const enchantments = new Map<string, Enchantment>();
  for (const enchantment of enchantData.enchantments) {
    if (enchantments.has(enchantment.id)) throw new ItemDataError(`phù phép trùng id: ${enchantment.id}`);
    if (enchantment.material !== '' && !materials.has(enchantment.material)) {
      throw new ItemDataError(`phù phép "${enchantment.id}" dựa trên vật liệu "${enchantment.material}" không có thật`);
    }
    enchantments.set(enchantment.id, enchantment);
  }

  return {
    materials,
    materialDefault: materialsData.default,
    weapons,
    weaponDefault: weaponsData.default,
    siegeOnly,
    blunted: weaponsData.blunted,
    armorClasses,
    pieces,
    shields,
    layering: armorData.layering,
    resolution: armorData.resolution,
    fit: armorData.fit,
    carry: armorData.carry,
    gapNames: armorData.gapNames,
    enchantments,
    qualities: templateData.qualities,
    qualityIndex,
    craftRoll: templateData.craftRoll,
    damageKinds,
    maintenance: templateData.maintenance,
    patterns,
    patternLearning: templateData.patternLearning,
    massProduction: templateData.massProduction,
    factions: templateData.factions,
    templates,
    heraldry: templateData.heraldry,
  };
}

const DATA = load();

// ---------------------------------------------------------------------------
// Đọc — vật liệu
// ---------------------------------------------------------------------------

export function materialOf(id: string): Material {
  return DATA.materials.get(id) ?? DATA.materialDefault;
}

export function allMaterials(): Material[] {
  return [...DATA.materials.values()];
}

/** Vật liệu này có phải BẠC không — Phần 14b mục D tra chỗ này, không tra tên. */
export function isSilver(materialId: string): boolean {
  return materialOf(materialId).silver;
}

// ---------------------------------------------------------------------------
// Đọc — vũ khí
// ---------------------------------------------------------------------------

export function weaponProfile(itemId: string): WeaponProfile {
  return DATA.weapons.get(itemId) ?? DATA.weaponDefault;
}

export function hasWeaponProfile(itemId: string): boolean {
  return DATA.weapons.has(itemId);
}

export function unarmedProfile(): WeaponProfile {
  return DATA.weaponDefault;
}

export function allWeapons(): { id: string; profile: WeaponProfile }[] {
  return [...DATA.weapons.entries()].map(([id, profile]) => ({ id, profile }));
}

export function bluntedRule(): { cause: string; powerFactor: number; note: string } {
  return DATA.blunted;
}

export function bluntedCause(): string {
  return DATA.blunted.cause;
}

export function siegeWeaponOf(id: string): SiegeWeapon | null {
  return DATA.siegeOnly.get(id) ?? null;
}

export function siegeWeapons(): SiegeWeapon[] {
  return [...DATA.siegeOnly.values()];
}

// ---------------------------------------------------------------------------
// Đọc — giáp
// ---------------------------------------------------------------------------

export function armorPieceOf(itemId: string): ArmorPiece | null {
  return DATA.pieces.get(itemId) ?? null;
}

export function allArmorPieces(): ArmorPiece[] {
  return [...DATA.pieces.values()];
}

export function shieldProfile(itemId: string): ShieldProfile | null {
  return DATA.shields.get(itemId) ?? null;
}

export function armorClassOf(id: string): ArmorClass | null {
  return DATA.armorClasses.get(id) ?? null;
}

export function armorClasses(): ArmorClass[] {
  return [...DATA.armorClasses.values()].sort((left, right) => left.rank - right.rank);
}

/** Loại nhẹ nhất — "không giáp". Dùng khi không món nào che vùng bị trúng. */
export function bareClass(): ArmorClass {
  const bare = armorClasses()[0];
  if (bare === undefined) throw new ItemDataError('data/armor.json không khai loại giáp nào');
  return bare;
}

export function layeringConfig(): LayeringConfig {
  return DATA.layering;
}

export function resolutionConfig(): ResolutionConfig {
  return DATA.resolution;
}

export function fitConfig(): FitConfig {
  return DATA.fit;
}

export function carryConfig(): CarryConfig {
  return DATA.carry;
}

export function carryModeOf(id: string): CarryMode | null {
  return DATA.carry.modes.find((mode) => mode.id === id) ?? null;
}

/** Tên tiếng Việt của khe hở ở một vùng — "nách trái", "bẹn", "khe mắt". */
export function gapName(regionId: string): string {
  return DATA.gapNames[regionId] ?? '';
}

// ---------------------------------------------------------------------------
// Đọc — chất lượng, hư hỏng, bản mẫu, phe phái
// ---------------------------------------------------------------------------

export const DEFAULT_QUALITY = 'thuong';

export function qualityRows(): ItemQuality[] {
  return [...DATA.qualities];
}

export function qualityOf(id: string): ItemQuality {
  const found = DATA.qualityIndex.get(id);
  if (found !== undefined) return found;
  const fallback = DATA.qualityIndex.get(DEFAULT_QUALITY);
  if (fallback === undefined) throw new ItemDataError('data/item-templates.json không khai bậc chất lượng "thuong"');
  return fallback;
}

export function qualityByLevel(level: number): ItemQuality {
  const clamped = Math.max(1, Math.min(5, Math.round(level)));
  return DATA.qualities.find((quality) => quality.level === clamped) ?? qualityOf(DEFAULT_QUALITY);
}

export function damageKindOf(id: string): DamageKind | null {
  return DATA.damageKinds.get(id) ?? null;
}

export function damageKinds(): DamageKind[] {
  return [...DATA.damageKinds.values()];
}

export function maintenanceConfig(): MaintenanceConfig {
  return DATA.maintenance;
}

export function craftRollConfig(): CraftRollConfig {
  return DATA.craftRoll;
}

export function patternOf(id: string): Pattern | null {
  return DATA.patterns.get(id) ?? null;
}

export function allPatterns(): Pattern[] {
  return [...DATA.patterns.values()];
}

export function patternLearningWays(): PatternLearning[] {
  return [...DATA.patternLearning];
}

export function massProduction(): MassProduction {
  return DATA.massProduction;
}

export function factionCatalog(nationId: string): FactionCatalog | null {
  return DATA.factions[nationId] ?? null;
}

export function factionCatalogs(): { id: string; catalog: FactionCatalog }[] {
  return Object.entries(DATA.factions).map(([id, catalog]) => ({ id, catalog }));
}

export function heraldryConfig(): HeraldryConfig {
  return DATA.heraldry;
}

// ---------------------------------------------------------------------------
// Đọc — mẫu vật phẩm, đi qua chuỗi mẫu → gear
// ---------------------------------------------------------------------------

export function templateOf(id: string): ItemTemplate | null {
  return DATA.templates.get(id) ?? null;
}

export function allTemplates(): ItemTemplate[] {
  return [...DATA.templates.values()];
}

/** Mọi id vật phẩm Phần 16 biết tới: mẫu riêng cộng catalog của Phần 6. */
export function knownItemIds(): string[] {
  const ids = new Set<string>(DATA.templates.keys());
  for (const id of DATA.weapons.keys()) ids.add(id);
  for (const id of DATA.pieces.keys()) ids.add(id);
  for (const id of DATA.shields.keys()) ids.add(id);
  return [...ids];
}

export function itemName(id: string): string {
  return DATA.templates.get(id)?.name ?? gearOf(id)?.name ?? id;
}

export function itemKind(id: string): string {
  return DATA.templates.get(id)?.kind ?? gearOf(id)?.kind ?? '';
}

export function itemSlot(id: string): string {
  return DATA.templates.get(id)?.slot ?? gearOf(id)?.slot ?? 'mang-theo';
}

/** Vật liệu MẶC ĐỊNH của mẫu. Món cụ thể có thể được rèn bằng thứ khác. */
export function itemMaterial(id: string): string {
  return DATA.templates.get(id)?.material ?? gearOf(id)?.material ?? '';
}

export function itemWeight(id: string): number {
  return DATA.templates.get(id)?.weightKg ?? gearOf(id)?.weightKg ?? 0;
}

/** Giá gốc theo thang của mục 12. Chất lượng và vật liệu nhân vào sau. */
export function itemValue(id: string): number {
  return DATA.templates.get(id)?.value ?? gearOf(id)?.price ?? 0;
}

export function craftOf(id: string): CraftSpec | null {
  return DATA.templates.get(id)?.craft ?? null;
}

// ---------------------------------------------------------------------------
// Đọc — phù phép
// ---------------------------------------------------------------------------

export function enchantmentOf(id: string): Enchantment | null {
  return DATA.enchantments.get(id) ?? null;
}

export function allEnchantments(): Enchantment[] {
  return [...DATA.enchantments.values()];
}
