/**
 * NẠP `data/laws.json` VÀ `data/provinces.json` (mục 12.1) theo R5.
 *
 * Kiểm THAM CHIẾU lúc nạp, đúng khuôn `holding/data.ts`. Năm phép kiểm, và cả
 * năm đều rút ra từ chỗ dễ hỏng của chính phần này:
 *
 *  1. **MỌI TỈNH PHẢI CÓ NODE TRONG `regions.json`.** Tên tỉnh KHÔNG được khai ở
 *     `provinces.json` — nó lấy từ cây vùng của Phần 4. Một địa danh hai nguồn
 *     sự thật là cách chắc chắn nhất để prompt gọi cùng một chỗ bằng hai cái tên.
 *  2. **ĐỊA HÌNH, KHÍ HẬU, HẠ TẦNG LÀ TẬP ĐÓNG.** Một khóa gõ sai chạy êm suốt
 *     ván và không làm gì cả, còn người cân bằng thì tin là nó có làm (R4).
 *  3. **NHÓM THUẾ CỦA MỘT ĐIỀU LUẬT PHẢI CÓ THẬT.** `opposedBy: ["quy-tôc"]` gõ
 *     sai dấu sẽ không bao giờ khớp ai, và điều luật mất một nửa hệ quả.
 *  4. **TỔNG TỶ LỆ VĂN HÓA / CHỦNG TỘC CỦA MỘT TỈNH PHẢI XẤP XỈ 1.** Lệch là
 *     lòng dân và tuyển quân tính trên một dân số không tồn tại.
 *  5. **DỰ ÁN PHẢI TRỎ TỚI MỘT KHÓA HẠ TẦNG CÓ THẬT** khi nó khai `key`.
 *
 * Còn một luật nữa, và nó là luật quan trọng nhất của cả file: **KHÔNG TRƯỜNG NÀO
 * Ở ĐÂY ĐƯỢC CÓ TỌA ĐỘ.** Nếu một ngày có ai thêm `x`, `y`, hay `buildingId` vào
 * `provinces.json` thì hai tầng đã lẫn, và mục 1 nói thẳng: dừng lại.
 */

import { z } from 'zod';
import lawsFile from '@data/laws.json';
import provincesFile from '@data/provinces.json';
import { regionOf } from '@/lore/regions';
import { DIFFICULTY_BANDS } from '@/systems/check/difficulty';
import type { DifficultyBand } from '@/core/turn';

export class RealmDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RealmDataError';
  }
}

const bandSchema = z.enum(DIFFICULTY_BANDS as readonly [DifficultyBand, ...DifficultyBand[]]);

// ---------------------------------------------------------------------------
// laws.json
// ---------------------------------------------------------------------------

const taxGroupSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  /** Nhóm dân ở tầng thành trì mà nhóm thuế này phủ — chỉ để đọc, không để tính. */
  covers: z.array(z.string()).default([]),
  share: z.number().min(0).max(1),
  baseRate: z.number().min(0).max(100),
  minRate: z.number().min(0).max(100),
  maxRate: z.number().min(0).max(100),
  hatesTax: z.number().min(0),
  unrestPerPointOver: z.number(),
  yieldPerPoint: z.number().min(0),
  fleeAbove: z.number().min(0).max(100).default(101),
  fleePerPointOver: z.number().min(0).default(0),
  legitimacyPerPoint: z.number().default(0),
  vassalLoyaltyPerPoint: z.number().default(0),
  note: z.string().default(''),
});

export type TaxGroup = z.infer<typeof taxGroupSchema>;

const taxConfigSchema = z.object({
  groups: z.array(taxGroupSchema).min(1),
  revenuePerDevelopment: z.number().min(0),
  revenuePerThousandHouseholds: z.number().min(0),
  banditryLossPerPoint: z.number().min(0),
  unrestLossPerPoint: z.number().min(0),
  collectionCheck: z.string().min(1),
  collectionDifficulty: bandSchema,
  collectionBonusPerTier: z.record(z.string(), z.number()),
});

export type TaxConfig = z.infer<typeof taxConfigSchema>;

const bandRowSchema = z.object({
  upTo: z.number().min(0).max(100),
  id: z.string().min(1),
  name: z.string().min(1),
  revenueFactor: z.number().min(0),
});

const unrestConfigSchema = z.object({
  min: z.number(),
  max: z.number(),
  settle: z.number(),
  driftPerYear: z.number().min(0),
  bands: z.array(bandRowSchema.extend({ banditryPerYear: z.number() })).min(1),
  suppressCheck: z.string().min(1),
  suppressDifficulty: bandSchema,
  suppressDrop: z.number().min(0),
  suppressLegitimacyCost: z.number(),
});

export type UnrestConfig = z.infer<typeof unrestConfigSchema>;
export type UnrestBand = UnrestConfig['bands'][number];

const justiceConfigSchema = z.object({
  check: z.string().min(1),
  casesPerYearPerProvince: z.number().min(0),
  backlogUnrestPerCase: z.number().min(0),
  backlogLimit: z.number().int().min(1),
  ignoredCaseLegitimacy: z.number(),
  judicialDuel: z.object({
    requiresBothRefuse: z.boolean(),
    arenaId: z.string().min(1),
    kind: z.string().min(1),
    legitimacyIfHonoured: z.number(),
    legitimacyIfIgnored: z.number(),
    loserLoyalty: z.number(),
    winnerLoyalty: z.number(),
    bannedByLaw: z.string().min(1),
  }),
});

export type JusticeConfig = z.infer<typeof justiceConfigSchema>;

const permitConfigSchema = z.object({
  requiresRank: z.number().int().min(0).max(9),
  check: z.string().min(1),
  difficulty: bandSchema,
  feePerTier: z.number().min(0),
  feePerWork: z.number().min(0),
  refuseUnrest: z.number(),
  refuseVassalLoyalty: z.number(),
  grantVassalLoyalty: z.number(),
  illegalDiscoveryFine: z.number().min(0),
  illegalDiscoveryLoyalty: z.number(),
});

export type PermitConfig = z.infer<typeof permitConfigSchema>;

const lawEffectsSchema = z.object({
  unrest: z.number(),
  banditry: z.number(),
  vassalLoyalty: z.number(),
  revenueFactor: z.number(),
  levyDays: z.number(),
  development: z.number(),
  legitimacyPerYear: z.number().default(0),
});

export type LawEffects = z.infer<typeof lawEffectsSchema>;

const lawSchema = z.object({
  id: z.string().startsWith('luat_'),
  name: z.string().min(1),
  scope: z.enum(['realm', 'province']),
  requiresRank: z.number().int().min(0).max(9),
  cost: z.number().min(0),
  upkeepPerYear: z.number().min(0),
  oneOff: z.boolean().default(false),
  effects: lawEffectsSchema,
  /**
   * HỆ QUẢ XUỐNG TỚI THÀNH TRÌ — hai con số, không phải nguyên văn điều luật.
   * Đây đúng là thứ `RealmOrder.law` của Phần 12 cho phép mang qua ranh giới.
   */
  holdingEffect: z.object({ moraleShift: z.number(), outputShift: z.number().default(0) }),
  opposedBy: z.array(z.string()).default([]),
  favouredBy: z.array(z.string()).default([]),
  casesPerYearBonus: z.number().default(0),
  permitRequiredFromTier: z.number().int().min(0).default(0),
  roadsPerYear: z.number().default(0),
  note: z.string().default(''),
});

export type Law = z.infer<typeof lawSchema>;

const caseTypeSchema = z.object({
  id: z.string().startsWith('vu_'),
  name: z.string().min(1),
  parties: z.array(z.string()).length(2),
  difficulty: bandSchema,
  allowsJudicialDuel: z.boolean(),
  weight: z.number().min(0),
  unrestIfIgnored: z.number().default(0),
  legitimacyIfIgnored: z.number().default(0),
  churchWatching: z.boolean().default(false),
  note: z.string().default(''),
});

export type CaseType = z.infer<typeof caseTypeSchema>;

const verdictSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  favours: z.enum(['a', 'b', 'khong']),
  requiresCheck: z.boolean().default(false),
  opensDuel: z.boolean().default(false),
  keepsCase: z.boolean().default(false),
  corrupt: z.boolean().default(false),
  effects: z.object({
    legitimacy: z.number(),
    loyaltyFavoured: z.number(),
    loyaltyOther: z.number(),
    unrest: z.number(),
    revenue: z.number(),
  }),
  note: z.string().default(''),
});

export type Verdict = z.infer<typeof verdictSchema>;

const lawsFileSchema = z.object({
  version: z.number(),
  config: z.object({
    tax: taxConfigSchema,
    unrest: unrestConfigSchema,
    justice: justiceConfigSchema,
    permit: permitConfigSchema,
  }),
  laws: z.array(lawSchema).min(1),
  caseTypes: z.array(caseTypeSchema).min(1),
  verdicts: z.array(verdictSchema).min(1),
});

// ---------------------------------------------------------------------------
// provinces.json
// ---------------------------------------------------------------------------

const developmentConfigSchema = z.object({
  min: z.number(),
  max: z.number(),
  growthPerYear: z.number(),
  unrestStallAbove: z.number(),
  banditryStallAbove: z.number(),
  householdsPerPoint: z.number().min(1),
});

const banditryConfigSchema = z.object({
  min: z.number(),
  max: z.number(),
  settle: z.number(),
  roadPenaltyPerLevel: z.number(),
  patrolCheck: z.string().min(1),
  patrolDifficulty: bandSchema,
  patrolDrop: z.number().min(0),
  patrolCostPerProvince: z.number().min(0),
  bands: z.array(bandRowSchema.extend({ tradeFactor: z.number().min(0) })).min(1),
});

export type BanditryBand = z.infer<typeof banditryConfigSchema>['bands'][number];

const roadLevelSchema = z.object({
  level: z.number().int().min(0),
  name: z.string().min(1),
  weeksPerDayRide: z.number().min(0),
  tradeFactor: z.number().min(0),
});

export type RoadLevel = z.infer<typeof roadLevelSchema>;

const provinceTerrainSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  revenueFactor: z.number().min(0),
  levyFactor: z.number().min(0),
  banditryBase: z.number().min(0),
  daysRidePerArea: z.number().min(0),
});

export type ProvinceTerrain = z.infer<typeof provinceTerrainSchema>;

const climateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  revenueFactor: z.number().min(0),
});

export type Climate = z.infer<typeof climateSchema>;

const projectSchema = z.object({
  id: z.string().startsWith('duan_'),
  name: z.string().min(1),
  kind: z.enum(['roads', 'infrastructure']),
  key: z.string().default(''),
  requiresRank: z.number().int().min(0).max(9),
  cost: z.number().min(0),
  years: z.number().int().min(1),
  check: z.string().min(1),
  difficulty: bandSchema,
  effects: z.object({
    roads: z.number(),
    development: z.number(),
    banditry: z.number(),
    unrest: z.number(),
    tradeFactor: z.number(),
  }),
  requiresTerrain: z.array(z.string()).default([]),
  requiresRoadLevel: z.number().int().min(0).default(0),
  changesTerrainTo: z.string().default(''),
  borderOnly: z.boolean().default(false),
  note: z.string().default(''),
});

export type RealmProject = z.infer<typeof projectSchema>;

const mixSchema = z.array(z.object({ id: z.string().min(1), share: z.number().min(0).max(1) }));

const provinceRowSchema = z.object({
  id: z.string().startsWith('prov_'),
  regionId: z.string().startsWith('prov_'),
  realmId: z.string().startsWith('realm_'),
  terrain: z.string().min(1),
  climate: z.string().min(1),
  area: z.number().min(1),
  development: z.number().min(0).max(100),
  unrest: z.number().min(0).max(100),
  banditry: z.number().min(0).max(100),
  roads: z.number().int().min(0),
  infrastructure: z.array(z.string()).default([]),
  cultureMix: mixSchema.default([]),
  raceMix: mixSchema.default([]),
  resources: z.array(z.string()).default([]),
  note: z.string().default(''),
});

export type ProvinceRow = z.infer<typeof provinceRowSchema>;

const provincesFileSchema = z.object({
  version: z.number(),
  config: z.object({
    development: developmentConfigSchema,
    banditry: banditryConfigSchema,
    roads: z.object({ levels: z.array(roadLevelSchema).min(2) }),
    infrastructure: z.object({ keys: z.array(z.string()).min(1) }),
    terrains: z.array(provinceTerrainSchema).min(1),
    climates: z.array(climateSchema).min(1),
    levy: z.object({
      menPerDevelopmentPoint: z.number().min(0),
      unrestPenaltyPerPoint: z.number().min(0),
      loyaltyFloor: z.number().min(0).max(1),
    }),
  }),
  projects: z.array(projectSchema).min(1),
  provinces: z.array(provinceRowSchema).min(1),
});

export type DevelopmentConfig = z.infer<typeof developmentConfigSchema>;
export type BanditryConfig = z.infer<typeof banditryConfigSchema>;
export type LevyConfig = z.infer<typeof provincesFileSchema>['config']['levy'];

// ---------------------------------------------------------------------------
// Nạp
// ---------------------------------------------------------------------------

interface RealmData {
  tax: TaxConfig;
  unrest: UnrestConfig;
  justice: JusticeConfig;
  permit: PermitConfig;
  laws: Map<string, Law>;
  caseTypes: CaseType[];
  verdicts: Map<string, Verdict>;
  development: DevelopmentConfig;
  banditry: BanditryConfig;
  roads: RoadLevel[];
  infrastructureKeys: Set<string>;
  terrains: Map<string, ProvinceTerrain>;
  climates: Map<string, Climate>;
  levy: LevyConfig;
  projects: Map<string, RealmProject>;
  provinces: Map<string, ProvinceRow>;
}

function parseOrThrow<T>(schema: z.ZodType<T>, file: unknown, name: string): T {
  const parsed = schema.safeParse(file);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new RealmDataError(
      `${name} hỏng ở "${issue?.path.join('.') ?? '?'}": ${issue?.message ?? 'không rõ'}`,
    );
  }
  return parsed.data;
}

function load(): RealmData {
  const lawFile = parseOrThrow(lawsFileSchema, lawsFile, 'data/laws.json');
  const provFile = parseOrThrow(provincesFileSchema, provincesFile, 'data/provinces.json');

  const groupIds = new Set(lawFile.config.tax.groups.map((group) => group.id));

  const laws = new Map<string, Law>();
  for (const law of lawFile.laws) {
    if (laws.has(law.id)) throw new RealmDataError(`luật trùng id: ${law.id}`);
    // Kiểm 3: nhóm dân trong `opposedBy`/`favouredBy` phải có thật, nếu không thì
    // một nửa hệ quả của điều luật biến mất mà không ai thấy.
    for (const group of [...law.opposedBy, ...law.favouredBy]) {
      if (!groupIds.has(group)) {
        throw new RealmDataError(`luật "${law.id}" nhắc nhóm "${group}" mà bảng thuế không có nhóm ấy`);
      }
    }
    laws.set(law.id, law);
  }

  const verdicts = new Map<string, Verdict>();
  for (const verdict of lawFile.verdicts) verdicts.set(verdict.id, verdict);
  if (!laws.has(lawFile.config.justice.judicialDuel.bannedByLaw)) {
    throw new RealmDataError(
      `config.justice.judicialDuel.bannedByLaw trỏ tới luật "${lawFile.config.justice.judicialDuel.bannedByLaw}" mà luật ấy không có`,
    );
  }
  if (!lawFile.verdicts.some((verdict) => verdict.opensDuel)) {
    throw new RealmDataError('không phán quyết nào mở quyết đấu tư pháp — mục 8 đòi cửa sang Phần 9');
  }

  const terrains = new Map<string, ProvinceTerrain>();
  for (const terrain of provFile.config.terrains) terrains.set(terrain.id, terrain);
  const climates = new Map<string, Climate>();
  for (const climate of provFile.config.climates) climates.set(climate.id, climate);
  const infrastructureKeys = new Set(provFile.config.infrastructure.keys);

  const projects = new Map<string, RealmProject>();
  for (const project of provFile.projects) {
    if (projects.has(project.id)) throw new RealmDataError(`dự án trùng id: ${project.id}`);
    // Kiểm 5.
    if (project.kind === 'infrastructure' && !infrastructureKeys.has(project.key)) {
      throw new RealmDataError(`dự án "${project.id}" dựng hạ tầng "${project.key}" không có trong tập đóng`);
    }
    for (const terrain of project.requiresTerrain) {
      if (!terrains.has(terrain)) {
        throw new RealmDataError(`dự án "${project.id}" đòi địa hình "${terrain}" không có trong bảng`);
      }
    }
    if (project.changesTerrainTo !== '' && !terrains.has(project.changesTerrainTo)) {
      throw new RealmDataError(`dự án "${project.id}" đổi địa hình sang "${project.changesTerrainTo}" không có trong bảng`);
    }
    projects.set(project.id, project);
  }

  const provinces = new Map<string, ProvinceRow>();
  for (const province of provFile.provinces) {
    if (provinces.has(province.id)) throw new RealmDataError(`tỉnh trùng id: ${province.id}`);
    // Kiểm 1: tên tỉnh sống ở `regions.json`, không sống ở đây.
    if (regionOf(province.regionId) === null) {
      throw new RealmDataError(`tỉnh "${province.id}" trỏ tới node "${province.regionId}" không có trong regions.json`);
    }
    // Kiểm 2.
    if (!terrains.has(province.terrain)) {
      throw new RealmDataError(`tỉnh "${province.id}" khai địa hình "${province.terrain}" không có trong bảng`);
    }
    if (!climates.has(province.climate)) {
      throw new RealmDataError(`tỉnh "${province.id}" khai khí hậu "${province.climate}" không có trong bảng`);
    }
    for (const key of province.infrastructure) {
      if (!infrastructureKeys.has(key)) {
        throw new RealmDataError(`tỉnh "${province.id}" khai hạ tầng "${key}" không có trong tập đóng`);
      }
    }
    if (province.roads >= provFile.config.roads.levels.length) {
      throw new RealmDataError(`tỉnh "${province.id}" khai đường bậc ${String(province.roads)} mà thang chỉ có ${String(provFile.config.roads.levels.length)} bậc`);
    }
    // Kiểm 4.
    for (const [label, mix] of [['văn hóa', province.cultureMix], ['chủng tộc', province.raceMix]] as const) {
      if (mix.length === 0) continue;
      const total = mix.reduce((sum, row) => sum + row.share, 0);
      if (Math.abs(total - 1) > 0.02) {
        throw new RealmDataError(
          `tỉnh "${province.id}" có tổng tỷ lệ ${label} là ${total.toFixed(2)}, phải xấp xỉ 1`,
        );
      }
    }
    provinces.set(province.id, province);
  }

  return {
    tax: lawFile.config.tax,
    unrest: lawFile.config.unrest,
    justice: lawFile.config.justice,
    permit: lawFile.config.permit,
    laws,
    caseTypes: lawFile.caseTypes,
    verdicts,
    development: provFile.config.development,
    banditry: provFile.config.banditry,
    roads: provFile.config.roads.levels,
    infrastructureKeys,
    terrains,
    climates,
    levy: provFile.config.levy,
    projects,
    provinces,
  };
}

const DATA = load();

// ---------------------------------------------------------------------------
// Đọc
// ---------------------------------------------------------------------------

export function taxConfig(): TaxConfig {
  return DATA.tax;
}

export function taxGroups(): TaxGroup[] {
  return [...DATA.tax.groups];
}

export function taxGroupOf(id: string): TaxGroup | null {
  return DATA.tax.groups.find((group) => group.id === id) ?? null;
}

export function unrestConfig(): UnrestConfig {
  return DATA.unrest;
}

/** Bậc bất ổn của một điểm số. Bảng đóng, tra từ dưới lên. */
export function unrestBandFor(value: number): UnrestBand {
  const found = DATA.unrest.bands.find((band) => value <= band.upTo);
  const last = DATA.unrest.bands[DATA.unrest.bands.length - 1];
  if (found === undefined && last === undefined) throw new RealmDataError('bảng bất ổn rỗng');
  return found ?? (last as UnrestBand);
}

export function banditryConfig(): BanditryConfig {
  return DATA.banditry;
}

export function banditryBandFor(value: number): BanditryBand {
  const found = DATA.banditry.bands.find((band) => value <= band.upTo);
  const last = DATA.banditry.bands[DATA.banditry.bands.length - 1];
  if (found === undefined && last === undefined) throw new RealmDataError('bảng cướp bóc rỗng');
  return found ?? (last as BanditryBand);
}

export function justiceConfig(): JusticeConfig {
  return DATA.justice;
}

export function permitConfig(): PermitConfig {
  return DATA.permit;
}

export function developmentConfig(): DevelopmentConfig {
  return DATA.development;
}

export function levyConfig(): LevyConfig {
  return DATA.levy;
}

export function allLaws(): Law[] {
  return [...DATA.laws.values()];
}

export function lawOf(id: string): Law | null {
  return DATA.laws.get(id) ?? null;
}

export function lawName(id: string): string {
  return DATA.laws.get(id)?.name ?? id;
}

/** Luật ban được ở một bậc tước. Bậc thấp thì danh sách ngắn — và đó là mục 4. */
export function lawsForRank(rank: number): Law[] {
  return allLaws().filter((law) => rank >= law.requiresRank);
}

export function caseTypes(): CaseType[] {
  return [...DATA.caseTypes];
}

export function caseTypeOf(id: string): CaseType | null {
  return DATA.caseTypes.find((row) => row.id === id) ?? null;
}

export function verdicts(): Verdict[] {
  return [...DATA.verdicts.values()];
}

export function verdictOf(id: string): Verdict | null {
  return DATA.verdicts.get(id) ?? null;
}

export function roadLevels(): RoadLevel[] {
  return [...DATA.roads];
}

export function roadLevelOf(level: number): RoadLevel {
  const clamped = Math.max(0, Math.min(DATA.roads.length - 1, Math.round(level)));
  const row = DATA.roads[clamped];
  if (row === undefined) throw new RealmDataError('thang đường rỗng');
  return row;
}

export function terrainOf(id: string): ProvinceTerrain | null {
  return DATA.terrains.get(id) ?? null;
}

export function allTerrains(): ProvinceTerrain[] {
  return [...DATA.terrains.values()];
}

export function climateOf(id: string): Climate | null {
  return DATA.climates.get(id) ?? null;
}

export function infrastructureKeys(): string[] {
  return [...DATA.infrastructureKeys];
}

export function allProjects(): RealmProject[] {
  return [...DATA.projects.values()];
}

export function projectOf(id: string): RealmProject | null {
  return DATA.projects.get(id) ?? null;
}

export function provinceRows(): ProvinceRow[] {
  return [...DATA.provinces.values()];
}

export function provinceRowOf(id: string): ProvinceRow | null {
  return DATA.provinces.get(id) ?? null;
}

/** Tỉnh thuộc một lãnh thổ, theo data — vạch xuất phát của một ván chơi. */
export function provinceRowsOfRealm(realmId: string): ProvinceRow[] {
  return provinceRows().filter((province) => province.realmId === realmId);
}
