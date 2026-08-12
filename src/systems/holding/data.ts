/**
 * NẠP BỐN FILE DATA CỦA PHẦN 12 (mục 12.1) theo R5.
 *
 * `buildings.json` · `settlement-tiers.json` · `resources.json` · `adjacency.json`
 *
 * Kiểm THAM CHIẾU lúc nạp chứ không chỉ kiểm hình dạng, đúng khuôn `siege/data.ts`
 * của Phần 11. Ba loại kiểm mà phần này cần thêm, cả ba đều rút ra từ chỗ dễ hỏng
 * của chính nó:
 *
 *  1. KHOÁ HIỆU ỨNG KỀ NHAU LÀ TẬP ĐÓNG. Một luật khai `{"happines": -6}` chạy êm
 *     suốt ván và không làm gì cả, còn người cân bằng thì tin là nó có làm (R4).
 *  2. MỌI CÔNG TRÌNH PHẢI ĐẶT ĐƯỢC Ở CẤP CỦA NÓ. Một công trình 3×3 khai `minTier`
 *     là cấp có lưới 4×4 thì nó không bao giờ hiện lên, và không ai biết vì sao.
 *  3. TIÊN QUYẾT KHÔNG ĐƯỢC ĐI NGƯỢC CẤP. `bld_x` cấp 3 đòi `bld_y` cấp 4 là một
 *     vòng khoá chết: không lên cấp 4 được vì thiếu x, không xây x được vì thiếu y.
 *
 * Còn một kiểm nữa, và nó là kiểm quan trọng nhất của cả phần: MỖI CẤP PHẢI TRỎ
 * TỚI MỘT KHUÔN CÓ THẬT TRONG `data/fortifications.json`. Không có nó thì nhóm
 * công trình phòng thủ không đổ vào `Fortification` của Phần 11 được, và mục 12.6
 * biến thành hai hệ rời nhau — đúng thứ mục 5 cấm.
 */

import { z } from 'zod';
import buildingsFile from '@data/buildings.json';
import tiersFile from '@data/settlement-tiers.json';
import resourcesFile from '@data/resources.json';
import adjacencyFile from '@data/adjacency.json';
import { DIFFICULTY_BANDS } from '@/systems/check/difficulty';
import { fortTemplateOf } from '@/systems/siege/data';
import type { DifficultyBand } from '@/core/turn';

export class HoldingDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HoldingDataError';
  }
}

const bandSchema = z.enum(DIFFICULTY_BANDS as readonly [DifficultyBand, ...DifficultyBand[]]);
const amountSchema = z.record(z.string(), z.number());

// ---------------------------------------------------------------------------
// resources.json
// ---------------------------------------------------------------------------

const resourceSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  unit: z.string().min(1),
  perishable: z.boolean(),
  spoilPerWeek: z.number().min(0).max(1),
  bulk: z.number().min(0),
  note: z.string().default(''),
});

export type Resource = z.infer<typeof resourceSchema>;

const terrainSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  weight: z.number().min(0),
  buildFactor: z.number().min(0).max(2),
  yields: amountSchema.default({}),
  tags: z.array(z.string()).default([]),
  buildable: z.boolean().default(true),
  note: z.string().default(''),
});

export type HoldingTerrain = z.infer<typeof terrainSchema>;

const labourSeasonSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  /** Phần nhân lực mùa vụ đòi. Gieo và gặt hút gần hết (mục 6). */
  farmDemand: z.number().min(0).max(1),
  buildFactor: z.number().min(0).max(2),
  /** Mùa đông FALSE: vữa không đông, công trình đá đứng im (mục 6). */
  stoneWork: z.boolean(),
  note: z.string().default(''),
});

export type LabourSeason = z.infer<typeof labourSeasonSchema>;

const skilledSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  trainWeeks: z.number().int().min(1),
  trainCost: z.number().min(0),
  hireCost: z.number().min(0),
  upkeepPerWeek: z.number().min(0),
  fromStratum: z.string().min(1),
  note: z.string().default(''),
});

export type SkilledTrade = z.infer<typeof skilledSchema>;

const architectSchema = z.object({
  /** Công trình chiếm từ ngần này ô trở lên là bắt buộc có kiến trúc sư. */
  requiredFromSize: z.number().int().min(1),
  baseSkillWithout: z.number().min(0),
  speedPerTenSkill: z.number().min(0),
  qualityPerTenSkill: z.number().min(0),
  feePerWeek: z.number().min(0),
});

export type ArchitectConfig = z.infer<typeof architectSchema>;

const labourSchema = z.object({
  workforceShare: z.number().min(0.05).max(1),
  seasons: z.array(labourSeasonSchema).length(4),
  harvestPenaltyPerWorker: z.number().min(0),
  harvestPenaltyFloor: z.number().min(0).max(1),
  maxCrewMultiplier: z.number().min(1),
  overCrewFactor: z.number().min(0).max(1),
  skilled: z.array(skilledSchema).min(1),
  withoutSkilledFactor: z.number().min(0).max(1),
  partialSkilledFloor: z.number().min(0).max(1),
  architect: architectSchema,
  levyWorkerCost: z.number().min(0),
  levyExhaustionWeeks: z.number().int().min(1),
  levyExhaustionMorale: z.number(),
});

export type LabourConfig = z.infer<typeof labourSchema>;

const upkeepSchema = z.object({
  decayPerWeek: z.number().min(0),
  /** Phải lớn hơn `decayPerWeek` — xem `$repairComment` trong data. */
  upkeepRecoveryPerWeek: z.number().min(0),
  decayUnpaidPerWeek: z.number().min(0),
  winterExtraDecay: z.number().min(0),
  besiegedExtraDecay: z.number().min(0),
  repairPerWeekPerWorker: z.number().min(0),
  repairMaterialPerPoint: z.number().min(0),
  ruinedBelow: z.number().min(0).max(100),
  outputAtRuined: z.number().min(0).max(1),
  outputPerIntegrityPoint: z.number().min(0),
  collapseBelow: z.number().min(0).max(100),
});

export type UpkeepConfig = z.infer<typeof upkeepSchema>;

const qualityTierSchema = z.object({
  integrity: z.number().min(0).max(100),
  outputFactor: z.number().min(0).default(1),
  costOverrun: z.number().min(0).default(0),
  extraWeeks: z.number().min(0).default(0),
  decayMultiplier: z.number().min(0).default(1),
  collapsed: z.boolean().default(false),
  materialLoss: z.number().min(0).max(1).default(0),
  deathsPerTenCrew: z.number().min(0).default(0),
  note: z.string().default(''),
});

export type QualityTier = z.infer<typeof qualityTierSchema>;

const qualitySchema = z.object({
  checkId: z.string().min(1),
  domain: z.string().min(1),
  baseTarget: z.number().min(3).max(18),
  tiers: z.object({
    critSuccess: qualityTierSchema,
    success: qualityTierSchema,
    costlySuccess: qualityTierSchema,
    fail: qualityTierSchema,
    critFail: qualityTierSchema,
  }),
});

export type QualityConfig = z.infer<typeof qualitySchema>;

const resourcesFileSchema = z.object({
  version: z.number(),
  resources: z.array(resourceSchema).min(1),
  terrain: z.array(terrainSchema).min(1),
  labour: labourSchema,
  upkeep: upkeepSchema,
  quality: qualitySchema,
});

// ---------------------------------------------------------------------------
// settlement-tiers.json
// ---------------------------------------------------------------------------

const unrestSchema = z.object({
  upTo: z.number().min(0).max(100),
  id: z.string().min(1),
  name: z.string().min(1),
  outputFactor: z.number().min(0),
  fleePerWeek: z.number().min(0).max(1),
  riotChance: z.number().min(0).max(100),
});

export type UnrestRow = z.infer<typeof unrestSchema>;

const stratumSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  share: z.number().min(0).max(1),
  moraleWeight: z.number().min(0),
  workforceShare: z.number().min(0).max(1),
  wants: z.array(z.string()).default([]),
  hatesTax: z.number().min(0),
  grows: z.array(z.string()).default([]),
  note: z.string().default(''),
});

export type Stratum = z.infer<typeof stratumSchema>;

const raceTensionSchema = z.object({
  sameGroup: z.number(),
  differentGroup: z.number(),
  sameChurch: z.number(),
  differentChurch: z.number(),
  outcastChurch: z.number(),
  outcastChurchIds: z.array(z.string()).default([]),
  balanceWeight: z.number().min(0),
  perPairCap: z.number().min(0),
  totalCap: z.number().min(0),
  toleranceBuildings: amountSchema.default({}),
  outputPerPoint: z.number().min(0),
});

export type RaceTensionConfig = z.infer<typeof raceTensionSchema>;

const moraleFactorsSchema = z.object({
  foodSurplusFull: z.number(),
  foodShort: z.number(),
  starving: z.number(),
  housingShort: z.number(),
  jobShort: z.number(),
  unemployedShare: z.number(),
  chapelPresent: z.number(),
  churchPresent: z.number(),
  justicePresent: z.number(),
  beautyPerPoint: z.number(),
  beautyCap: z.number(),
  garrisonSafety: z.number(),
  noGarrison: z.number(),
  besieged: z.number(),
  plague: z.number(),
  levyPerTenPercent: z.number(),
  lordCrueltyPer10: z.number(),
  lordMercyPer10: z.number(),
  lordMaimed: z.number(),
  legitimacyPer10: z.number(),
  raceTensionPerPoint: z.number(),
  conqueredHatred: z.number(),
  conqueredHatredDecayPerYear: z.number().min(0),
});

export type MoraleFactors = z.infer<typeof moraleFactorsSchema>;

const tierConfigSchema = z.object({
  weeksPerYear: z.number().int().min(1),
  foodPerPersonWeek: z.number().min(0),
  naturalGrowthPerYear: z.number().min(0),
  immigrationPerYear: z.number().min(0),
  immigrationMoraleFloor: z.number().min(0).max(100),
  immigrationSlackFloor: z.number().min(0).max(1),
  naturalGrowthMoraleFloor: z.number().min(0).max(100),
  overCapacityLeavePerYear: z.number().min(0).max(1),
  starvationDeathPerWeek: z.number().min(0).max(1),
  starvationLeavePerWeek: z.number().min(0).max(1),
  plagueDeathPerWeek: z.number().min(0).max(1),
  sackDeathShare: z.number().min(0).max(1),
  moraleStart: z.number().min(0).max(100),
  moraleDriftPerWeek: z.number().min(0).max(1),
  moraleFactors: moraleFactorsSchema,
  unrestLadder: z.array(unrestSchema).min(2),
  strata: z.array(stratumSchema).min(2),
  raceTension: raceTensionSchema,
  /** Phần nhân lực tự tìm được việc — xem `$informalJobComment` trong data. */
  informalJobShare: z.number().min(0).max(0.9).default(0),
  hinterlandPerTier: z.array(z.number().int().min(0)).length(5),
});

export type HoldingConfig = z.infer<typeof tierConfigSchema>;

const upgradeSchema = z.object({
  populationAtLeast: z.number().int().min(0),
  requiresBuildings: z.array(z.string()).default([]),
  cost: amountSchema.default({}),
  weeks: z.number().int().min(1),
  requiresPermit: z.boolean().default(true),
  checkDifficulty: bandSchema,
});

export type TierUpgrade = z.infer<typeof upgradeSchema>;

const tierSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  rank: z.number().int().min(1).max(5),
  /** LOẠI TỪ BẮT BUỘC của Phụ lục A mục 9c: "thành Ehrenfeld", không bao giờ "Ehrenfeld". */
  article: z.string().min(1),
  population: z.object({ min: z.number().int().min(0), max: z.number().int().min(1) }),
  wall: z.string().min(1),
  grid: z.number().int().min(2).max(64),
  /** Lều tự dựng và ruộng phần đã có sẵn — xem `$baseCapacityComment` trong data. */
  baseHousing: z.number().min(0).default(0),
  baseJobs: z.number().min(0).default(0),
  /** Khuôn trong `data/fortifications.json` — cầu nối sang Phần 11. */
  fortTemplate: z.string().startsWith('fort_'),
  highlights: z.array(z.string()).default([]),
  maxProjects: z.number().int().min(1),
  baseBeauty: z.number(),
  upgrade: upgradeSchema.optional(),
  note: z.string().default(''),
});

export type SettlementTier = z.infer<typeof tierSchema>;

const tiersFileSchema = z.object({
  version: z.number(),
  config: tierConfigSchema,
  tiers: z.array(tierSchema).length(5),
});

// ---------------------------------------------------------------------------
// buildings.json
// ---------------------------------------------------------------------------

export const BUILDING_GROUPS = [
  'san-xuat',
  'quan-su',
  'dan-sinh',
  'ton-giao',
  'hanh-chinh',
  'hoc-van',
  'phong-thu',
  'dac-thu-toc',
] as const;

export type BuildingGroup = (typeof BUILDING_GROUPS)[number];

/**
 * ĐÓNG GÓP VÀO `Fortification` CỦA PHẦN 11 (mục 5).
 *
 * Đây là khối làm cho câu "xây gì hôm nay quyết định cuộc vây hãm năm sau" thành
 * một quan hệ có thật. Mỗi khoá ở đây đi thẳng vào một trường của `Fortification`
 * ở `systems/siege/types.ts` — không có bảng quy đổi trung gian, vì một bảng quy
 * đổi là đúng chỗ để hai hệ lặng lẽ tách khỏi nhau.
 */
const fortifySchema = z.object({
  wallLayer: z.enum(['ngoai', 'trong']).optional(),
  replacesWall: z.boolean().default(false),
  wallName: z.string().default(''),
  integrity: z.number().default(0),
  height: z.number().min(0).default(0),
  thickness: z.number().min(0).default(0),
  towers: z.number().int().min(0).default(0),
  towerIntegrity: z.number().min(0).default(0),
  gateIntegrity: z.number().min(0).default(0),
  portcullis: z.boolean().default(false),
  drawbridge: z.boolean().default(false),
  murderHoles: z.boolean().default(false),
  moatWidth: z.number().min(0).default(0),
  moatWetIfWater: z.boolean().default(false),
  keepIntegrity: z.number().min(0).default(0),
  keepCapacity: z.number().min(0).default(0),
  stores: z.number().min(0).default(0),
  wells: z.number().int().min(0).default(0),
  counterMineBonus: z.number().default(0),
  watchBonus: z.number().default(0),
});

export type FortifyContribution = z.infer<typeof fortifySchema>;

/** ĐÓNG GÓP VÀO QUÂN ĐỒN TRÚ — binh chủng là `data/units.json` của Phần 10. */
const garrisonSchema = z.object({
  capacity: z.number().int().min(0).default(0),
  quality: z.number().int().min(1).max(5).default(3),
  qualityBonus: z.number().int().min(0).default(0),
  unitType: z.string().default(''),
  trainingWeeks: z.number().int().min(0).default(0),
});

export type GarrisonContribution = z.infer<typeof garrisonSchema>;

const terrainRuleSchema = z.object({
  require: z.array(z.string()).default([]),
  prefer: z.array(z.string()).default([]),
  forbid: z.array(z.string()).default([]),
});

const buildingSchema = z.object({
  id: z.string().startsWith('bld_'),
  name: z.string().min(1),
  group: z.enum(BUILDING_GROUPS),
  size: z.tuple([z.number().int().min(0), z.number().int().min(0)]),
  /** Không chiếm ô nào: chạy vòng quanh mép thành. */
  perimeter: z.boolean().default(false),
  /** Bắt buộc đặt trên vành ngoài của lưới. */
  border: z.boolean().default(false),
  minTier: z.number().int().min(1).max(5),
  material: z.enum(['go', 'da', 'dat']),
  manWeeks: z.number().min(1),
  minWeeks: z.number().int().min(1),
  minCrew: z.number().int().min(1),
  skilled: amountSchema.default({}),
  cost: amountSchema.default({}),
  upkeep: amountSchema.default({}),
  jobs: z.number().min(0).default(0),
  housing: z.number().min(0).default(0),
  output: amountSchema.default({}),
  consumes: amountSchema.default({}),
  storage: amountSchema.default({}),
  spoilFactor: z.number().min(0).max(1).default(1),
  /** Nhân sản lượng RUỘNG NGOÀI TƯỜNG. Nông trại không tự sinh ra lương. */
  farmMultiplier: z.number().min(0).default(0),
  happiness: z.number().default(0),
  beauty: z.number().default(0),
  faith: z.number().default(0),
  justice: z.number().default(0),
  order: z.number().default(0),
  authority: z.number().default(0),
  literacy: z.number().default(0),
  hygiene: z.number().default(0),
  trade: z.number().default(0),
  plagueResist: z.number().min(0).max(1).default(0),
  trainSpeed: z.number().min(0).default(0),
  trains: amountSchema.default({}),
  needsArchitect: z.boolean().default(false),
  requires: z.array(z.string()).default([]),
  requiresWall: z.boolean().default(false),
  races: z.array(z.string()).default([]),
  terrain: terrainRuleSchema.default({ require: [], prefer: [], forbid: [] }),
  fortify: fortifySchema.optional(),
  garrison: garrisonSchema.optional(),
  note: z.string().default(''),
});

export type Building = z.infer<typeof buildingSchema>;

const buildingsFileSchema = z.object({
  version: z.number(),
  buildings: z.array(buildingSchema).min(1),
});

// ---------------------------------------------------------------------------
// adjacency.json
// ---------------------------------------------------------------------------

export const ADJACENCY_EFFECT_KEYS = [
  'output',
  'happiness',
  'beauty',
  'faith',
  'trade',
  'upkeep',
  'hygiene',
  'siegeWeeks',
  'wallIntegrity',
  'buildSpeed',
] as const;

export type AdjacencyEffectKey = (typeof ADJACENCY_EFFECT_KEYS)[number];

const selectorSchema = z.object({
  kind: z.enum(['building', 'group', 'terrain', 'terrainTag', 'wall']),
  ids: z.array(z.string()).default([]),
});

export type AdjacencySelector = z.infer<typeof selectorSchema>;

const ruleSchema = z.object({
  id: z.string().min(1),
  subject: selectorSchema,
  neighbor: selectorSchema,
  /** Chebyshev. 0 nghĩa là chính ô mình đứng (hoặc chính mép tường). */
  radius: z.number().int().min(0).max(4),
  stacks: z.number().int().min(1),
  effect: z.enum(ADJACENCY_EFFECT_KEYS),
  mode: z.enum(['factor', 'flat']),
  value: z.number(),
  when: z.enum(['always', 'besieged']).default('always'),
  note: z.string().default(''),
});

export type AdjacencyRule = z.infer<typeof ruleSchema>;

const adjacencyFileSchema = z.object({
  version: z.number(),
  config: z.object({
    defaultRadius: z.number().int().min(0),
    maxTotalOutputFactor: z.number().min(1),
    minTotalOutputFactor: z.number().min(0).max(1),
  }),
  effectKeys: z.array(z.string()).min(1),
  rules: z.array(ruleSchema).min(1),
});

export type AdjacencyConfig = z.infer<typeof adjacencyFileSchema>['config'];

// ---------------------------------------------------------------------------
// Nạp và kiểm tham chiếu
// ---------------------------------------------------------------------------

interface Loaded {
  resources: Map<string, Resource>;
  terrain: Map<string, HoldingTerrain>;
  terrainTags: Set<string>;
  labour: LabourConfig;
  upkeep: UpkeepConfig;
  quality: QualityConfig;
  config: HoldingConfig;
  tiers: SettlementTier[];
  tierById: Map<string, SettlementTier>;
  buildings: Map<string, Building>;
  adjacencyConfig: AdjacencyConfig;
  rules: AdjacencyRule[];
}

function parse<T>(schema: z.ZodType<T>, raw: unknown, file: string): T {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new HoldingDataError(
      `${file} hỏng ở "${issue?.path.join('.') ?? '?'}": ${issue?.message ?? 'không rõ'}`,
    );
  }
  return parsed.data;
}

function checkAmounts(
  amounts: Record<string, number>,
  resources: Map<string, Resource>,
  where: string,
): void {
  for (const id of Object.keys(amounts)) {
    if (!resources.has(id)) {
      throw new HoldingDataError(`${where} nhắc tài nguyên "${id}" chưa khai trong data/resources.json`);
    }
  }
}

function load(): Loaded {
  const res = parse(resourcesFileSchema, resourcesFile, 'data/resources.json');
  const tiersRaw = parse(tiersFileSchema, tiersFile, 'data/settlement-tiers.json');
  const blds = parse(buildingsFileSchema, buildingsFile, 'data/buildings.json');
  const adj = parse(adjacencyFileSchema, adjacencyFile, 'data/adjacency.json');

  // --- tài nguyên và địa hình
  const resources = new Map<string, Resource>();
  for (const row of res.resources) {
    if (resources.has(row.id)) throw new HoldingDataError(`tài nguyên trùng id: ${row.id}`);
    resources.set(row.id, row);
  }

  const terrain = new Map<string, HoldingTerrain>();
  const terrainTags = new Set<string>();
  for (const row of res.terrain) {
    if (terrain.has(row.id)) throw new HoldingDataError(`địa hình trùng id: ${row.id}`);
    checkAmounts(row.yields, resources, `địa hình "${row.id}"`);
    for (const tag of row.tags) terrainTags.add(tag);
    terrain.set(row.id, row);
  }
  if (![...terrain.values()].some((row) => row.buildable && row.weight > 0)) {
    throw new HoldingDataError('data/resources.json không có địa hình nào vừa xây được vừa sinh ra được');
  }

  // --- thợ lành nghề phải trỏ vào một nhóm xã hội có thật
  const strataIds = new Set(tiersRaw.config.strata.map((row) => row.id));
  for (const trade of res.labour.skilled) {
    if (!strataIds.has(trade.fromStratum)) {
      throw new HoldingDataError(
        `thợ "${trade.id}" lấy người từ nhóm "${trade.fromStratum}" chưa khai trong settlement-tiers.json`,
      );
    }
  }

  // --- bậc bất ổn phải xếp TĂNG DẦN và phủ tới 100, vì tra bảng dừng ở dòng đầu
  //     khớp: xếp lộn thì "một lòng" sẽ nuốt luôn "bỏ trốn hàng loạt".
  let previousUpTo = -1;
  for (const row of tiersRaw.config.unrestLadder) {
    if (row.upTo <= previousUpTo) {
      throw new HoldingDataError(`bậc bất ổn phải xếp tăng dần, "${row.id}" phá thứ tự`);
    }
    previousUpTo = row.upTo;
  }
  if (previousUpTo < 100) throw new HoldingDataError('bậc bất ổn không phủ tới 100');

  // Trả đủ chi phí duy trì mà công trình vẫn mục dần thì mọi thành trì đều tự
  // sập sau vài chục năm và không ai hiểu vì sao. Xem `$repairComment` trong data.
  if (res.upkeep.upkeepRecoveryPerWeek <= res.upkeep.decayPerWeek) {
    throw new HoldingDataError(
      'upkeepRecoveryPerWeek phải lớn hơn decayPerWeek, nếu không công trình đã trả tiền duy trì vẫn hỏng dần',
    );
  }
  if (res.upkeep.decayUnpaidPerWeek <= res.upkeep.decayPerWeek) {
    throw new HoldingDataError('decayUnpaidPerWeek phải lớn hơn decayPerWeek, nếu không bỏ bê chẳng mất gì');
  }

  const strataShare = tiersRaw.config.strata.reduce((sum, row) => sum + row.share, 0);
  if (Math.abs(strataShare - 1) > 0.02) {
    throw new HoldingDataError(`tổng tỉ lệ các nhóm xã hội phải bằng 1, đang là ${strataShare.toFixed(3)}`);
  }

  // --- các cấp khu định cư
  const tierById = new Map<string, SettlementTier>();
  const tiers = [...tiersRaw.tiers].sort((a, b) => a.rank - b.rank);
  let previousGrid = 0;
  let previousMax = -1;
  for (const tier of tiers) {
    if (tierById.has(tier.id)) throw new HoldingDataError(`cấp khu định cư trùng id: ${tier.id}`);
    // Lưới MỞ RỘNG chứ không reset (mục 3). Một cấp trên có lưới nhỏ hơn cấp dưới
    // thì "mở rộng" hoá ra là xoá công trình, và cả câu đó thành sai.
    if (tier.grid <= previousGrid) {
      throw new HoldingDataError(`cấp "${tier.id}" có lưới ${String(tier.grid)} không lớn hơn cấp trước`);
    }
    previousGrid = tier.grid;
    // Bảng mục 3 dùng chung mốc ở hai cấp liền nhau (Làng 100–500, Trấn 500–2.000),
    // nên bằng nhau là hợp lệ; chỉ CHỒNG LÊN mới sai, vì lúc ấy một con số dân
    // ứng với hai cấp và `tierForPopulation` trả lời khác nhau tuỳ chiều quét.
    if (tier.population.min < previousMax && tier.rank > 1) {
      throw new HoldingDataError(`ngưỡng dân số của cấp "${tier.id}" chồng lên cấp trước`);
    }
    previousMax = tier.population.max;
    // Cầu nối sang Phần 11. Thiếu nó là mục 12.6 không thực hiện được.
    if (fortTemplateOf(tier.fortTemplate) === null) {
      throw new HoldingDataError(
        `cấp "${tier.id}" trỏ khuôn công sự "${tier.fortTemplate}" không có trong data/fortifications.json`,
      );
    }
    if (tier.upgrade !== undefined) checkAmounts(tier.upgrade.cost, resources, `nâng cấp "${tier.id}"`);
    tierById.set(tier.id, tier);
  }
  const firstTier = tiers[0];
  if (firstTier === undefined) throw new HoldingDataError('data/settlement-tiers.json rỗng');
  if (firstTier.upgrade !== undefined) {
    throw new HoldingDataError(`cấp thấp nhất "${firstTier.id}" không được khai điều kiện nâng cấp`);
  }

  // --- công trình
  const buildings = new Map<string, Building>();
  for (const building of blds.buildings) {
    if (buildings.has(building.id)) throw new HoldingDataError(`công trình trùng id: ${building.id}`);
    checkAmounts(building.cost, resources, `công trình "${building.id}" (cost)`);
    checkAmounts(building.upkeep, resources, `công trình "${building.id}" (upkeep)`);
    checkAmounts(building.output, resources, `công trình "${building.id}" (output)`);
    checkAmounts(building.consumes, resources, `công trình "${building.id}" (consumes)`);
    checkAmounts(building.storage, resources, `công trình "${building.id}" (storage)`);

    for (const skill of Object.keys(building.skilled)) {
      if (!res.labour.skilled.some((trade) => trade.id === skill)) {
        throw new HoldingDataError(`công trình "${building.id}" đòi thợ "${skill}" chưa khai`);
      }
    }
    for (const skill of Object.keys(building.trains)) {
      if (!res.labour.skilled.some((trade) => trade.id === skill)) {
        throw new HoldingDataError(`công trình "${building.id}" đào tạo thợ "${skill}" chưa khai`);
      }
    }
    for (const name of [...building.terrain.require, ...building.terrain.prefer, ...building.terrain.forbid]) {
      if (!terrain.has(name) && !terrainTags.has(name)) {
        throw new HoldingDataError(`công trình "${building.id}" nhắc địa hình/nhãn "${name}" không có`);
      }
    }

    const [width, height] = building.size;
    if (building.perimeter) {
      if (width !== 0 || height !== 0) {
        throw new HoldingDataError(`công trình vành đai "${building.id}" phải khai size [0,0]`);
      }
    } else if (width < 1 || height < 1) {
      throw new HoldingDataError(`công trình "${building.id}" khai size 0 mà không phải vành đai`);
    }

    // Kiểm 2 của chú thích đầu file: đặt được ở cấp của nó thì mới có nghĩa.
    const homeTier = tiers.find((tier) => tier.rank === building.minTier);
    if (homeTier === undefined) {
      throw new HoldingDataError(`công trình "${building.id}" khai minTier ${String(building.minTier)} không có cấp nào`);
    }
    if (!building.perimeter && (width > homeTier.grid || height > homeTier.grid)) {
      throw new HoldingDataError(
        `công trình "${building.id}" (${String(width)}×${String(height)}) không đặt vừa lưới ${String(homeTier.grid)} của cấp "${homeTier.id}"`,
      );
    }
    buildings.set(building.id, building);
  }

  // --- tiên quyết: kiểm sau khi đã có đủ bảng, và kiểm cả chiều cấp (kiểm 3)
  for (const building of buildings.values()) {
    for (const id of building.requires) {
      const prereq = buildings.get(id);
      if (prereq === undefined) {
        throw new HoldingDataError(`công trình "${building.id}" đòi tiên quyết "${id}" không có`);
      }
      if (prereq.minTier > building.minTier) {
        throw new HoldingDataError(
          `vòng khoá chết: "${building.id}" (cấp ${String(building.minTier)}) đòi "${id}" ở cấp ${String(prereq.minTier)}`,
        );
      }
    }
    if (building.garrison !== undefined && building.garrison.unitType !== '' && building.garrison.capacity === 0) {
      throw new HoldingDataError(`công trình "${building.id}" khai binh chủng nhưng sức chứa đồn trú bằng 0`);
    }
  }

  // --- điều kiện lên cấp và bảng gợi ý phải trỏ vào công trình có thật, và
  //     phải mở được ở cấp DƯỚI: đòi một thứ chỉ có ở cấp trên là khoá chết.
  for (const tier of tiers) {
    for (const id of tier.highlights) {
      const building = buildings.get(id);
      if (building === undefined) throw new HoldingDataError(`cấp "${tier.id}" gợi ý công trình "${id}" không có`);
      if (building.minTier !== tier.rank) {
        throw new HoldingDataError(
          `cấp "${tier.id}" gợi ý "${id}" nhưng công trình ấy mở ở cấp ${String(building.minTier)}`,
        );
      }
    }
    if (tier.upgrade === undefined) continue;
    for (const id of tier.upgrade.requiresBuildings) {
      const building = buildings.get(id);
      if (building === undefined) {
        throw new HoldingDataError(`cấp "${tier.id}" đòi công trình "${id}" không có`);
      }
      if (building.minTier >= tier.rank) {
        throw new HoldingDataError(
          `vòng khoá chết: lên cấp "${tier.id}" đòi "${id}" mà công trình ấy chỉ mở ở cấp ${String(building.minTier)}`,
        );
      }
    }
  }

  // Nhóm phòng thủ phải có ít nhất một công trình đổ vào Fortification, nếu không
  // thì mục 12.6 không có gì để nối.
  const fortifiers = [...buildings.values()].filter((row) => row.fortify !== undefined);
  if (fortifiers.length === 0) {
    throw new HoldingDataError('không công trình nào khai `fortify` — nhóm phòng thủ không nối được vào Phần 11');
  }
  if (![...buildings.values()].some((row) => row.garrison !== undefined && row.garrison.capacity > 0)) {
    throw new HoldingDataError('không công trình nào sinh ra quân đồn trú — không nối được vào Phần 10');
  }

  // --- luật kề nhau
  const effectKeys = new Set<string>(ADJACENCY_EFFECT_KEYS);
  for (const declared of adj.effectKeys) {
    if (!effectKeys.has(declared)) {
      throw new HoldingDataError(`data/adjacency.json khai khoá hiệu ứng lạ: "${declared}"`);
    }
  }
  const ruleIds = new Set<string>();
  const groupIds = new Set<string>(BUILDING_GROUPS);
  const checkSelector = (selector: AdjacencySelector, where: string): void => {
    if (selector.kind === 'wall') return;
    if (selector.ids.length === 0) throw new HoldingDataError(`${where} không khai id nào`);
    for (const id of selector.ids) {
      if (selector.kind === 'building' && !buildings.has(id)) {
        throw new HoldingDataError(`${where} trỏ công trình "${id}" không có`);
      }
      if (selector.kind === 'group' && !groupIds.has(id)) {
        throw new HoldingDataError(`${where} trỏ nhóm "${id}" không có`);
      }
      if (selector.kind === 'terrain' && !terrain.has(id)) {
        throw new HoldingDataError(`${where} trỏ địa hình "${id}" không có`);
      }
      if (selector.kind === 'terrainTag' && !terrainTags.has(id)) {
        throw new HoldingDataError(`${where} trỏ nhãn địa hình "${id}" không có`);
      }
    }
  };
  for (const rule of adj.rules) {
    if (ruleIds.has(rule.id)) throw new HoldingDataError(`luật kề nhau trùng id: ${rule.id}`);
    ruleIds.add(rule.id);
    checkSelector(rule.subject, `luật "${rule.id}" (subject)`);
    checkSelector(rule.neighbor, `luật "${rule.id}" (neighbor)`);
    // Chủ thể là `wall` thì không có ô nào để tính từ đó ra — luật sẽ im lặng
    // không chạy, đúng loại lỗi mà chú thích đầu file nói phải nổ ngay.
    if (rule.subject.kind === 'wall') {
      throw new HoldingDataError(`luật "${rule.id}" lấy tường làm chủ thể — tường không đứng ở ô nào`);
    }
  }

  // Bảy luật của mục 4 là hợp đồng thiết kế, không phải nội dung tuỳ chọn: mất
  // một luật là mất một mảng chiều sâu quy hoạch mà không ai nhận ra.
  for (const required of [
    'adj_coi-xay-nuoc',
    'adj_thuoc-da-nha-o',
    'adj_cho-cong',
    'adj_lo-ren-mo',
    'adj_nha-tho-quang-truong',
    'adj_nha-o-tuong',
    'adj_kho-luong-gieng',
  ]) {
    if (!ruleIds.has(required)) {
      throw new HoldingDataError(`data/adjacency.json thiếu luật bắt buộc của mục 4: "${required}"`);
    }
  }

  for (const [id, value] of Object.entries(tiersRaw.config.raceTension.toleranceBuildings)) {
    if (!buildings.has(id)) throw new HoldingDataError(`bảng khoan dung nhắc công trình "${id}" không có`);
    if (value > 0) throw new HoldingDataError(`công trình khoan dung "${id}" phải làm GIẢM căng thẳng`);
  }
  for (const stratum of tiersRaw.config.strata) {
    for (const id of stratum.grows) {
      if (!buildings.has(id)) {
        throw new HoldingDataError(`nhóm "${stratum.id}" nhắc công trình "${id}" không có`);
      }
    }
  }

  return {
    resources,
    terrain,
    terrainTags,
    labour: res.labour,
    upkeep: res.upkeep,
    quality: res.quality,
    config: tiersRaw.config,
    tiers,
    tierById,
    buildings,
    adjacencyConfig: adj.config,
    rules: adj.rules,
  };
}

const DATA = load();

// ---------------------------------------------------------------------------
// Đọc
// ---------------------------------------------------------------------------

export function holdingConfig(): HoldingConfig {
  return DATA.config;
}

export function labourConfig(): LabourConfig {
  return DATA.labour;
}

export function upkeepConfig(): UpkeepConfig {
  return DATA.upkeep;
}

export function qualityConfig(): QualityConfig {
  return DATA.quality;
}

export function allResources(): Resource[] {
  return [...DATA.resources.values()];
}

export function resourceOf(id: string): Resource | null {
  return DATA.resources.get(id) ?? null;
}

export function allTerrain(): HoldingTerrain[] {
  return [...DATA.terrain.values()];
}

export function terrainOf(id: string): HoldingTerrain | null {
  return DATA.terrain.get(id) ?? null;
}

/** Một nhãn hoặc một id địa hình có khớp ô này không. Dùng cho `require`/`forbid`. */
export function terrainMatches(terrainId: string, name: string): boolean {
  if (terrainId === name) return true;
  return terrainOf(terrainId)?.tags.includes(name) ?? false;
}

export function allTiers(): SettlementTier[] {
  return DATA.tiers;
}

export function tierOf(id: string): SettlementTier | null {
  return DATA.tierById.get(id) ?? null;
}

export function tierByRank(rank: number): SettlementTier | null {
  return DATA.tiers.find((tier) => tier.rank === rank) ?? null;
}

/** Cấp thấp nhất — chỗ một thôn bắt đầu. */
export function lowestTier(): SettlementTier {
  const tier = DATA.tiers[0];
  if (tier === undefined) throw new HoldingDataError('bảng cấp khu định cư rỗng');
  return tier;
}

export function allBuildings(): Building[] {
  return [...DATA.buildings.values()];
}

export function buildingOf(id: string): Building | null {
  return DATA.buildings.get(id) ?? null;
}

export function buildingName(id: string): string {
  return DATA.buildings.get(id)?.name ?? id;
}

export function buildingsOfGroup(group: BuildingGroup): Building[] {
  return [...DATA.buildings.values()].filter((row) => row.group === group);
}

export function skilledTrades(): SkilledTrade[] {
  return DATA.labour.skilled;
}

export function architectConfig(): ArchitectConfig {
  return DATA.labour.architect;
}

/** Mùa lao động theo id — cùng bộ id với `data/fortifications.json`. */
export function labourSeasonOf(id: string): LabourSeason {
  const found = DATA.labour.seasons.find((season) => season.id === id);
  if (found !== undefined) return found;
  const first = DATA.labour.seasons[0];
  if (first === undefined) throw new HoldingDataError('data/resources.json không khai mùa nào');
  return first;
}

export function labourSeasons(): LabourSeason[] {
  return DATA.labour.seasons;
}

export function adjacencyRules(): AdjacencyRule[] {
  return DATA.rules;
}

export function adjacencyConfig(): AdjacencyConfig {
  return DATA.adjacencyConfig;
}

export function strata(): Stratum[] {
  return DATA.config.strata;
}

export function stratumOf(id: string): Stratum | null {
  return DATA.config.strata.find((row) => row.id === id) ?? null;
}

/** Bậc bất ổn ứng với một mức lòng dân (mục 8). */
export function unrestFor(morale: number): UnrestRow {
  for (const row of DATA.config.unrestLadder) {
    if (morale <= row.upTo) return row;
  }
  const last = DATA.config.unrestLadder.at(-1);
  if (last === undefined) throw new HoldingDataError('thang bất ổn rỗng');
  return last;
}

/** Số ô ruộng ngoài tường ở một cấp. */
export function hinterlandTilesFor(rank: number): number {
  return DATA.config.hinterlandPerTier[rank - 1] ?? 0;
}
