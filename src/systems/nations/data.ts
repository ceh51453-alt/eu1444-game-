/**
 * NẠP NĂM FILE DATA CỦA PHẦN 14 (mục 10.1–10.3) theo R5.
 *
 *   `data/nations.json → powers`  tám thế lực, ba tầng tiếp cận, bốn chính sách
 *   `data/orc-corps.json`         mười tám quân đoàn + cây kỹ thuật
 *   `data/religions.json`         bốn khối mới: spread, heresy, relations, seeds
 *   `data/reforms.json`           sáu dự luật, bảy tuyển hầu, bảng mặc cả
 *   `data/diplomacy.json`         ma trận quan hệ + BẢNG DỘI SANG NHAU
 *
 * TÁM PHÉP KIỂM THAM CHIẾU, và cả tám đều rút ra từ một chỗ dễ hỏng có thật:
 *
 *  1. **TÁM THỂ LOẠI PHẢI KHÁC NHAU.** Đây là phép kiểm quan trọng nhất của cả
 *     phần: mục 1 nói "nếu hai quốc gia chơi giống nhau thì một trong hai làm
 *     sai", và một file data trùng `minigame` là cách chuyện đó bắt đầu.
 *  2. **`nationId` PHẢI LÀ MỘT THẾ LỰC CANON CÓ THẬT** trong mảng `nations` —
 *     tên thế lực có đúng MỘT nguồn sự thật, và nguồn ấy là mảng cũ.
 *  3. **CHỦNG TỘC PHẢI CÓ TRONG `races.json`, và tổng tỷ lệ dân xấp xỉ 1.** Lệch
 *     là oán hận với nổi dậy tính trên một dân số không tồn tại.
 *  4. **KHÔNG THẾ LỰC NÀO ĐƯỢC CHỈ CÓ MỘT TỘC** (mục 1b: "nếu một thế lực chỉ có
 *     một tộc thuần thì đã làm sai").
 *  5. **`status` PHẢI LÀ MỘT CHÍNH SÁCH CÓ KHAI**, nếu không thì cả bảng hệ quả
 *     của mục 3 im lặng bỏ qua nhóm ấy.
 *  6. **MƯỜI TÁM QUÂN ĐOÀN, ĐÁNH SỐ 1–18, ĐÚNG MỘT ĐOÀN LÀM BINH BIẾN ĐƯỢC.**
 *  7. **DỰ LUẬT, PHE, TUYẾN, HỒNG Y, KHOẢN VAY TRỎ ĐI ĐÂU THÌ CHỖ ẤY PHẢI CÓ.**
 *  8. **TỔNG TỶ LỆ TÔN GIÁO MỖI VÙNG XẤP XỈ 1**, và `areaId` phải là một thế lực
 *     hoặc một tỉnh có thật.
 */

import { z } from 'zod';
import nationsFile from '@data/nations.json';
import corpsFile from '@data/orc-corps.json';
import religionsFile from '@data/religions.json';
import reformsFile from '@data/reforms.json';
import diplomacyFile from '@data/diplomacy.json';
import racesFile from '@data/races.json';
import provincesFile from '@data/provinces.json';
import { MINIGAME_KINDS, type MinigameKind } from './boards';

export class NationDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NationDataError';
  }
}

const share = z.number().min(0).max(1);
const meter = z.number().min(0).max(100);

// ---------------------------------------------------------------------------
// nations.json → powers
// ---------------------------------------------------------------------------

const accessTierSchema = z.object({
  id: z.enum(['quan-sat', 'tac-dong', 'choi-that']),
  rank: z.number().int().min(1).max(3),
  name: z.string().min(1),
  note: z.string().default(''),
});

const clarityLevelSchema = z.object({
  id: z.enum(['tin-don', 'nghe-noi', 'biet-ro']),
  upToConfidence: z.number().min(0).max(100),
  name: z.string().min(1),
  blurs: z.boolean(),
  showsNumbers: z.boolean(),
  label: z.string().default(''),
});

const minorityPolicySchema = z.object({
  id: z.enum(['trong-dung', 'dung-nap', 'thue-rieng', 'truy-buc', 'han-che']),
  name: z.string().min(1),
  settable: z.boolean(),
  gains: z.string().default(''),
  costs: z.string().default(''),
  grievancePerYear: z.number(),
  usefulnessPerYear: z.number(),
  usefulnessCap: z.number().min(0).max(100),
  dominantMoodPerYear: z.number(),
  taxFactor: z.number().min(0),
  seizureOnce: z.number().min(0).default(0),
  manpowerFactor: z.number().min(0),
  emigrationPerYear: z.number().min(0),
  immigrationDraw: z.number(),
  permanentUsefulnessFloor: z.boolean().default(false),
  exileMemoryYears: z.number().int().min(0).default(0),
});

const revoltConfigSchema = z.object({
  grievanceFloor: z.number().min(0).max(100),
  riskPerGrievancePoint: z.number(),
  populationWeight: z.number(),
  riskCap: z.number().min(0).max(100),
  check: z.string().min(1),
  difficulty: z.string().min(1),
  stabilityHit: z.number(),
  treasuryHit: z.number(),
  grievanceAfterCrush: z.number(),
  grievanceAfterConcession: z.number(),
  usefulnessAfterCrush: z.number(),
});

const migrationConfigSchema = z.object({
  peoplePerSharePoint: z.number().min(0),
  arrivalUsefulnessTransfer: z.number().min(0).max(1),
  arrivalGrievance: z.number(),
  hostDominantMood: z.number(),
  minSharePointToMove: z.number().min(0),
});

const groupRowSchema = z.object({
  raceId: z.string().startsWith('race_'),
  population: share,
  status: z.enum(['trong-dung', 'dung-nap', 'thue-rieng', 'truy-buc', 'han-che']),
  grievance: meter,
  usefulness: meter,
});

const countryRankSchema = z.object({
  id: z.string().min(1),
  rank: z.int().min(1).max(9),
  name: z.string().min(1),
  rulerTitle: z.string().min(1),
  address: z.string().min(1),
  minLand: z.number().min(0),
  minPrestige: meter,
  minStability: meter,
  minCohesion: meter,
  minRulerTitleRank: z.int().min(0).max(9),
  elevationTreasury: z.number().min(0),
  elevationPrestige: z.number().min(0),
  treatyCapacity: z.int().min(0),
  vassalCapacity: z.int().min(0),
  diplomaticWeight: z.number(),
  militaryCommandBonus: z.number(),
  taxFactor: z.number().positive(),
  administrationFactor: z.number().positive(),
  tradeFactor: z.number().positive(),
  tradeCapacityBonus: z.number(),
  factionPressure: z.number(),
  rights: z.array(z.string().min(1)),
  burdens: z.array(z.string().min(1)),
});

const governmentFormSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  rulerTitle: z.string(),
  address: z.string(),
  note: z.string().min(1),
});

const powerRowSchema = z.object({
  nationId: z.string().startsWith('nation_'),
  countryRankId: z.string().min(1),
  governmentFormId: z.string().min(1),
  rankBasis: z.string().min(1),
  rankDisputed: z.boolean().default(false),
  minigame: z.enum(MINIGAME_KINDS),
  genre: z.string().min(1),
  threat: z.string().default(''),
  victory: z.string().default(''),
  failure: z.string().default(''),
  access: z.object({
    ladder: z.string().min(1),
    impactRank: z.number().int().min(0).max(9),
    playRank: z.number().int().min(0).max(9),
  }),
  state: z.object({
    treasury: z.number(),
    income: z.number(),
    prestige: meter,
    stability: meter,
    cohesion: meter,
    military: meter,
    land: z.number().min(0),
  }),
  demographics: z.object({
    dominantRace: z.string().startsWith('race_'),
    nativeRaces: z.array(z.string()).default([]),
    groups: z.array(groupRowSchema).min(2),
    note: z.string().default(''),
  }),
  /** Hạt giống bảng riêng của từng thể loại. Hình dạng do minigame ấy tự hiểu. */
  board: z.record(z.string(), z.unknown()).default({}),
});

const nationsFileSchema = z.object({
  nations: z.array(z.object({
    id: z.string(),
    name: z.string(),
    countryRankId: z.string().min(1),
    governmentFormId: z.string().min(1),
    regions: z.array(z.string().min(1)).default([]),
    canon: z.boolean().default(false),
  })).min(1),
  countryRanks: z.array(countryRankSchema).min(2),
  governmentForms: z.array(governmentFormSchema).min(1),
  accessTiers: z.array(accessTierSchema).length(3),
  clarity: z.object({
    levels: z.array(clarityLevelSchema).min(1),
    inCourtBonus: z.number(),
    sameNationBonus: z.number(),
    neighbourBonus: z.number(),
  }),
  minorityPolicies: z.object({
    policies: z.array(minorityPolicySchema).min(4),
    revolt: revoltConfigSchema,
    migration: migrationConfigSchema,
  }),
  powers: z.array(powerRowSchema).length(8),
});

export type PowerRow = z.infer<typeof powerRowSchema>;
export type CountryRank = z.infer<typeof countryRankSchema>;
export type GovernmentForm = z.infer<typeof governmentFormSchema>;
export type GroupRow = z.infer<typeof groupRowSchema>;
export type MinorityPolicy = z.infer<typeof minorityPolicySchema>;
export type RevoltConfig = z.infer<typeof revoltConfigSchema>;
export type MigrationConfig = z.infer<typeof migrationConfigSchema>;
export type AccessTierRow = z.infer<typeof accessTierSchema>;
export type ClarityRow = z.infer<typeof clarityLevelSchema>;
export type ClarityConfig = z.infer<typeof nationsFileSchema>['clarity'];

// ---------------------------------------------------------------------------
// orc-corps.json
// ---------------------------------------------------------------------------

const corpsRowSchema = z.object({
  id: z.string().startsWith('corps_'),
  number: z.number().int().min(1).max(18),
  name: z.string().min(1),
  group: z.enum(['cam-ve', 'tinh-binh', 'chuyen-mon']),
  recruit: z.string().min(1),
  men: z.number().min(0),
  quality: meter,
  loyalty: meter,
  prestige: meter,
  demandShare: share,
  equipment: z.array(z.string()).default([]),
  specialty: z.array(z.string()).default([]),
  mounted: z.boolean().default(false),
  household: z.boolean().default(false),
  mutinyLeader: z.boolean().default(false),
  factionLeader: z.boolean().default(false),
  livesOnPlunder: z.boolean().default(false),
  techSource: z.boolean().default(false),
  techBranch: z.string().default(''),
  note: z.string().default(''),
});

const techBranchSchema = z.object({
  id: z.string().startsWith('tech_'),
  name: z.string().min(1),
  levels: z.number().int().min(1),
  costPerLevel: z.number().min(0),
  yearsPerLevel: z.number().min(1),
  effect: z.string().default(''),
});

const corpsFileSchema = z.object({
  config: z.object({
    mutiny: z.object({
      prestigeAbove: meter,
      loyaltyBelow: meter,
      riskPerPrestigePoint: z.number(),
      riskPerLoyaltyPointMissing: z.number(),
      riskPerArrearYear: z.number(),
      riskCap: meter,
      check: z.string().min(1),
      difficulty: z.string().min(1),
      depositionAt: z.number().int().min(1),
      spreadToGroup: z.number(),
      calmPerPayRestored: z.number(),
      calmPerVictory: z.number(),
    }),
    budget: z.object({
      payPerThousandMen: z.number().min(0),
      underfundedBelow: z.number().min(0),
      loyaltyPerUnderfundedTenth: z.number(),
      loyaltyPerOverfundedTenth: z.number(),
      arrearLoyalty: z.number(),
      arrearPrestige: z.number(),
      expansionIncomePerConquest: z.number().min(0),
      expansionDecayPerYear: z.number().min(0).max(1),
      peaceYearsBeforeStrain: z.number().int().min(0),
      strainLoyaltyPerYear: z.number(),
    }),
    faction: z.object({
      guardGroup: z.string().min(1),
      provincialGroup: z.string().min(1),
      tiltPerBudgetTenth: z.number(),
      loyaltyPerTiltPoint: z.number(),
      prestigePerVictory: z.number(),
      prestigePerNeglectYear: z.number(),
      neglectAfterYears: z.number().int().min(0),
    }),
    devshirme: z.object({
      intakePerLevy: z.number().min(0),
      resentmentPerLevy: z.number(),
      resentmentDecayPerYear: z.number(),
      revoltResentmentAbove: meter,
      loyaltyToRuler: meter,
      qualityBonus: z.number(),
      churchCondemnPerLevy: z.number(),
      yearsToReadyTroops: z.number().int().min(1),
      eligibleRaces: z.array(z.string()).min(1),
    }),
    religiousPolicy: z.object({
      options: z
        .array(
          z.object({
            id: z.enum(['khoan-dung', 'cuong-buc']),
            name: z.string().min(1),
            taxFactor: z.number().min(0),
            manpowerFactor: z.number().min(0),
            unrestPerYear: z.number(),
            assimilationPerYear: z.number(),
            churchOpinion: z.number(),
            revoltUnrestAbove: z.number().default(101),
            permanentAtAssimilation: z.number().default(101),
          }),
        )
        .length(2),
    }),
    expansion: z.object({
      conquestCheck: z.string().min(1),
      difficulty: z.string().min(1),
      landPerConquest: z.number().min(0),
      prestigePerConquest: z.number(),
      prestigeLossPerIdleYear: z.number(),
      resentmentPerConquest: z.number(),
    }),
  }),
  tech: z.object({
    requiresCorps: z.string().startsWith('corps_'),
    budgetFloor: z.number().min(0).max(1),
    branches: z.array(techBranchSchema).min(1),
  }),
  corps: z.array(corpsRowSchema).length(18),
});

export type CorpsRow = z.infer<typeof corpsRowSchema>;
export type TechBranch = z.infer<typeof techBranchSchema>;
export type CorpsConfig = z.infer<typeof corpsFileSchema>['config'];
export type TechConfig = z.infer<typeof corpsFileSchema>['tech'];

// ---------------------------------------------------------------------------
// religions.json — bốn khối của Phần 14
// ---------------------------------------------------------------------------

const spreadSchema = z.object({
  driftToDominantPerYear: z.number(),
  minShareToSurvive: z.number().min(0),
  missionary: z.object({
    sharePerYear: z.number(),
    costPerPoint: z.number().min(0),
    check: z.string().min(1),
    difficulty: z.string().min(1),
    resistancePerHostility: z.number(),
  }),
  migration: z.object({ sharePerThousandArrivals: z.number() }),
  oppression: z.object({
    suppressPerYear: z.number(),
    unrestPerYear: z.number(),
    grievancePerYear: z.number(),
    backfireBelowPrestige: z.number(),
    backfireSharePerYear: z.number(),
  }),
  miracle: z.object({ chancePerYear: z.number(), sharePerEvent: z.number(), prestigePerEvent: z.number() }),
});

const heresySchema = z.object({
  movements: z.array(z.string().startsWith('rel_')).min(1),
  sourceFaith: z.string().startsWith('rel_'),
  basePerYear: z.number(),
  triggers: z
    .array(
      z.object({
        id: z.string().min(1),
        name: z.string().min(1),
        sharePerYear: z.number(),
        yearsOfEcho: z.number().int().min(0),
        prestigeBelow: z.number().default(0),
      }),
    )
    .min(1),
  responses: z
    .array(
      z.object({
        id: z.string().min(1),
        name: z.string().min(1),
        cost: z.number().min(0),
        suppress: z.number(),
        prestige: z.number(),
        unrest: z.number(),
        backfire: z.number(),
        backfireBelowPrestige: z.number().default(0),
        requiresPrestige: z.number().default(0),
        landDamage: z.number().default(0),
        note: z.string().default(''),
      }),
    )
    .min(1),
});

const religionsFileSchema = z.object({
  religions: z.array(z.object({ id: z.string().startsWith('rel_'), name: z.string().min(1), heresyOf: z.string().default('') })).min(1),
  spread: spreadSchema,
  heresy: heresySchema,
  relations: z.object({
    default: z.number(),
    pairs: z.array(z.object({ a: z.string(), b: z.string(), value: z.number(), note: z.string().default('') })),
  }),
  seeds: z.object({
    areas: z
      .array(
        z.object({
          areaId: z.string().min(1),
          mix: z.array(z.object({ religionId: z.string().startsWith('rel_'), share })).min(1),
        }),
      )
      .min(1),
  }),
});

export type SpreadConfig = z.infer<typeof spreadSchema>;
export type HeresyConfig = z.infer<typeof heresySchema>;
export type HeresyResponse = HeresyConfig['responses'][number];
export type HeresyTrigger = HeresyConfig['triggers'][number];
export type ReligionSeed = z.infer<typeof religionsFileSchema>['seeds']['areas'][number];

// ---------------------------------------------------------------------------
// reforms.json
// ---------------------------------------------------------------------------

const reformSchema = z.object({
  id: z.string().startsWith('reform_'),
  name: z.string().min(1),
  summary: z.string().default(''),
  order: z.number().int().min(1),
  authority: z.number(),
  freedom: z.number(),
  requiresPassed: z.array(z.string()).default([]),
  opposedByFaction: z.array(z.string()).default([]),
  favouredByFaction: z.array(z.string()).default([]),
  opposePerStrengthPoint: z.number(),
  effects: z.record(z.string(), z.number()).default({}),
  note: z.string().default(''),
});

const voterSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  lean: meter,
  faction: z.string().min(1),
  raceId: z.string().default(''),
  strength: meter.default(50),
});

const reformsFileSchema = z.object({
  config: z.object({
    dietEveryYears: z.number().int().min(1),
    authorityStart: meter,
    authorityMax: meter,
    authorityDriftPerYear: z.number(),
    collapseBelowAuthority: z.number(),
    collapseYears: z.number().int().min(1),
    secessionRiskPerFreedomPoint: z.number(),
    vote: z.object({
      electorMajority: z.number().int().min(1),
      princeShareNeeded: z.number().min(0).max(1),
      abstainCountsAgainst: z.boolean(),
      leanToVoteAt: meter,
      swingPerBargain: z.number(),
      swingPerIntimidation: z.number(),
      intimidationBacklash: z.number(),
      intimidationCheck: z.string().min(1),
      difficulty: z.string().min(1),
    }),
    bargains: z
      .array(
        z.object({
          id: z.string().min(1),
          name: z.string().min(1),
          cost: z.number().min(0),
          authorityCost: z.number(),
          swing: z.number(),
          prestigeCost: z.number().default(0),
          backlash: z.number().default(0),
          oncePerHouse: z.boolean().default(false),
          requiresCheck: z.boolean().default(false),
          splitsFaction: z.boolean().default(false),
          note: z.string().default(''),
        }),
      )
      .min(1),
    papacy: z.object({
      allyAuthorityPerYear: z.number(),
      allyPrinceSwing: z.number(),
      allyChurchDemand: z.string().default(''),
      defyPrinceSwing: z.number(),
      defyElectorSwing: z.number(),
      excommunicationAuthority: z.number(),
      excommunicationFreedom: z.number(),
    }),
  }),
  electors: z.array(voterSchema.extend({ kind: z.enum(['giao-si', 'the-tuc']), price: z.string().default('') })).min(3),
  princes: z.array(voterSchema.extend({ seats: z.number().int().min(1), note: z.string().default('') })).min(3),
  factions: z.array(z.object({ id: z.string().min(1), name: z.string().min(1), wants: z.string().default('') })).min(2),
  reforms: z.array(reformSchema).min(1),
});

export type Reform = z.infer<typeof reformSchema>;
export type Elector = z.infer<typeof reformsFileSchema>['electors'][number];
export type Prince = z.infer<typeof reformsFileSchema>['princes'][number];
export type DietConfig = z.infer<typeof reformsFileSchema>['config'];
export type Bargain = DietConfig['bargains'][number];

// ---------------------------------------------------------------------------
// diplomacy.json
// ---------------------------------------------------------------------------

const treatySchema = z.object({
  id: z.string().startsWith('hiep_'),
  name: z.string().min(1),
  years: z.number().int().min(0),
  relation: z.number(),
  callToArms: z.boolean().default(false),
  incomeBonus: z.number().default(0),
  tributePerYear: z.number().default(0),
  claimOnExtinction: z.boolean().default(false),
  religionShift: z.number().default(0),
  populaceAnger: z.number().default(0),
  breakRelation: z.number(),
  breakPrestige: z.number().default(0),
  note: z.string().default(''),
});

const rippleSchema = z.object({
  id: z.string().startsWith('ripple_'),
  event: z.string().min(1),
  from: z.string().min(1),
  text: z.string().min(1),
  sourceEffects: z.record(z.string(), z.unknown()).default({}),
  targetEffects: z.record(z.string(), z.unknown()).default({}),
  neighbourEffects: z.record(z.string(), z.unknown()).default({}),
  worldEffects: z.record(z.string(), z.unknown()).default({}),
  note: z.string().default(''),
});

const diplomacyFileSchema = z.object({
  config: z.object({
    relationMin: z.number(),
    relationMax: z.number(),
    driftToBasePerYear: z.number(),
    bands: z.array(z.object({ upTo: z.number(), id: z.string().min(1), name: z.string().min(1), warChancePerYear: z.number() })).min(1),
    war: z.object({
      declareCheck: z.string().min(1),
      difficulty: z.string().min(1),
      relationOnDeclare: z.number(),
      prestigePerVictory: z.number(),
      prestigePerDefeat: z.number(),
      landPerVictory: z.number(),
      yearsMin: z.number().int().min(1),
      warExhaustionPerYear: z.number(),
      exhaustionPeaceAt: z.number(),
    }),
    claims: z.object({
      yearsToFade: z.number().int().min(0),
      relationPenalty: z.number(),
      warJustification: z.number(),
      inheritedByHeir: z.boolean(),
    }),
    marriage: z.object({ relationBonus: z.number(), yearsOfEffect: z.number().int(), unionChancePerYear: z.number() }),
    embargo: z.object({ relationPenalty: z.number(), targetIncomeFactor: z.number(), selfIncomeFactor: z.number(), note: z.string().default('') }),
  }),
  treaties: z.array(treatySchema).min(1),
  pairs: z
    .array(
      z.object({
        a: z.string().startsWith('nation_'),
        b: z.string().startsWith('nation_'),
        value: z.number(),
        claim: z.boolean().default(false),
        note: z.string().default(''),
      }),
    )
    .min(1),
  ripples: z.array(rippleSchema).min(1),
});

export type Treaty = z.infer<typeof treatySchema>;
export type Ripple = z.infer<typeof rippleSchema>;
export type DiplomacyConfig = z.infer<typeof diplomacyFileSchema>['config'];
export type RelationBand = DiplomacyConfig['bands'][number];
export type RelationSeed = z.infer<typeof diplomacyFileSchema>['pairs'][number];

// ---------------------------------------------------------------------------
// Nạp
// ---------------------------------------------------------------------------

function parseOrThrow<T>(schema: z.ZodType<T>, file: unknown, name: string): T {
  const parsed = schema.safeParse(file);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new NationDataError(`${name} hỏng ở "${issue?.path.join('.') ?? '?'}": ${issue?.message ?? 'không rõ'}`);
  }
  return parsed.data;
}

interface NationData {
  powers: Map<string, PowerRow>;
  nationNames: Map<string, string>;
  nationRegions: Map<string, string[]>;
  registeredCountryRanks: Map<string, string>;
  registeredGovernmentForms: Map<string, string>;
  countryRanks: Map<string, CountryRank>;
  governmentForms: Map<string, GovernmentForm>;
  accessTiers: AccessTierRow[];
  clarity: ClarityConfig;
  policies: Map<string, MinorityPolicy>;
  revolt: RevoltConfig;
  migration: MigrationConfig;
  corps: CorpsRow[];
  corpsConfig: CorpsConfig;
  tech: TechConfig;
  spread: SpreadConfig;
  heresy: HeresyConfig;
  religionRelations: Map<string, number>;
  religionRelationDefault: number;
  religionSeeds: ReligionSeed[];
  religionIds: Set<string>;
  reforms: Map<string, Reform>;
  electors: Elector[];
  princes: Prince[];
  dietFactions: Map<string, string>;
  diet: DietConfig;
  diplomacy: DiplomacyConfig;
  treaties: Map<string, Treaty>;
  relationSeeds: RelationSeed[];
  ripples: Map<string, Ripple>;
}

function load(): NationData {
  const nations = parseOrThrow(nationsFileSchema, nationsFile, 'data/nations.json');
  const corpsData = parseOrThrow(corpsFileSchema, corpsFile, 'data/orc-corps.json');
  const religions = parseOrThrow(religionsFileSchema, religionsFile, 'data/religions.json');
  const reforms = parseOrThrow(reformsFileSchema, reformsFile, 'data/reforms.json');
  const diplomacy = parseOrThrow(diplomacyFileSchema, diplomacyFile, 'data/diplomacy.json');

  const raceIds = new Set(
    parseOrThrow(z.object({ races: z.array(z.object({ id: z.string() })) }), racesFile, 'data/races.json').races.map((race) => race.id),
  );
  const provinceIds = new Set(
    parseOrThrow(z.object({ provinces: z.array(z.object({ id: z.string() })) }), provincesFile, 'data/provinces.json').provinces.map(
      (province) => province.id,
    ),
  );

  // --- 2. thế lực phải có thật và phải canon ------------------------------
  const canon = new Map<string, string>();
  const allNationNames = new Map<string, string>();
  const nationRegions = new Map<string, string[]>();
  for (const nation of nations.nations) {
    allNationNames.set(nation.id, nation.name);
    nationRegions.set(nation.id, [...nation.regions]);
    if (nation.canon) canon.set(nation.id, nation.name);
  }

  const policies = new Map<string, MinorityPolicy>();
  for (const policy of nations.minorityPolicies.policies) policies.set(policy.id, policy);

  const countryRanks = new Map<string, CountryRank>();
  const countryRankNumbers = new Set<number>();
  for (const rank of nations.countryRanks) {
    if (countryRanks.has(rank.id)) throw new NationDataError(`cấp quốc gia trùng id: ${rank.id}`);
    if (countryRankNumbers.has(rank.rank)) throw new NationDataError(`hai cấp quốc gia cùng bậc ${String(rank.rank)}`);
    countryRanks.set(rank.id, rank);
    countryRankNumbers.add(rank.rank);
  }
  const governmentForms = new Map<string, GovernmentForm>();
  for (const form of nations.governmentForms) {
    if (governmentForms.has(form.id)) throw new NationDataError(`thể chế quốc gia trùng id: ${form.id}`);
    governmentForms.set(form.id, form);
  }
  const registeredCountryRanks = new Map<string, string>();
  const registeredGovernmentForms = new Map<string, string>();
  for (const nation of nations.nations) {
    if (!countryRanks.has(nation.countryRankId)) {
      throw new NationDataError(`quốc gia "${nation.id}" dùng cấp "${nation.countryRankId}" chưa khai`);
    }
    if (!governmentForms.has(nation.governmentFormId)) {
      throw new NationDataError(`quốc gia "${nation.id}" dùng thể chế "${nation.governmentFormId}" chưa khai`);
    }
    registeredCountryRanks.set(nation.id, nation.countryRankId);
    registeredGovernmentForms.set(nation.id, nation.governmentFormId);
  }

  const powers = new Map<string, PowerRow>();
  const kinds = new Map<MinigameKind, string>();
  for (const power of nations.powers) {
    if (powers.has(power.nationId)) throw new NationDataError(`thế lực trùng id: ${power.nationId}`);
    if (!canon.has(power.nationId)) {
      throw new NationDataError(
        `powers[] trỏ tới "${power.nationId}" mà mảng nations không có thế lực canon nào tên thế — tên thế lực chỉ có một nguồn sự thật`,
      );
    }
    if (!countryRanks.has(power.countryRankId)) {
      throw new NationDataError(`thế lực "${power.nationId}" dùng cấp quốc gia "${power.countryRankId}" chưa khai`);
    }
    if (!governmentForms.has(power.governmentFormId)) {
      throw new NationDataError(`thế lực "${power.nationId}" dùng thể chế "${power.governmentFormId}" chưa khai`);
    }
    if (registeredCountryRanks.get(power.nationId) !== power.countryRankId) {
      throw new NationDataError(`cấp gameplay của "${power.nationId}" không khớp sổ đăng ký quốc gia`);
    }
    if (registeredGovernmentForms.get(power.nationId) !== power.governmentFormId) {
      throw new NationDataError(`thể chế gameplay của "${power.nationId}" không khớp sổ đăng ký quốc gia`);
    }

    // --- 1. tám thể loại khác nhau ---------------------------------------
    const owner = kinds.get(power.minigame);
    if (owner !== undefined) {
      throw new NationDataError(
        `"${power.nationId}" và "${owner}" cùng thể loại "${power.minigame}" — mục 1: nếu hai quốc gia chơi giống nhau thì một trong hai làm sai`,
      );
    }
    kinds.set(power.minigame, power.nationId);

    // --- 3, 4, 5. dân số ---------------------------------------------------
    const groups = power.demographics.groups;
    const total = groups.reduce((sum, group) => sum + group.population, 0);
    if (Math.abs(total - 1) > 0.02) {
      throw new NationDataError(`thế lực "${power.nationId}" có tổng tỷ lệ dân ${total.toFixed(2)}, phải xấp xỉ 1`);
    }
    if (groups.length < 3) {
      throw new NationDataError(`thế lực "${power.nationId}" chỉ khai ${String(groups.length)} nhóm dân — mục 1b: mỗi thế lực đều đa chủng tộc`);
    }
    const seenRaces = new Set<string>();
    for (const group of groups) {
      if (!raceIds.has(group.raceId)) {
        throw new NationDataError(`thế lực "${power.nationId}" khai tộc "${group.raceId}" không có trong races.json`);
      }
      if (seenRaces.has(group.raceId)) {
        throw new NationDataError(`thế lực "${power.nationId}" khai tộc "${group.raceId}" hai lần`);
      }
      seenRaces.add(group.raceId);
      if (!policies.has(group.status)) {
        throw new NationDataError(`thế lực "${power.nationId}" đặt tộc "${group.raceId}" vào trạng thái "${group.status}" chưa khai trong bảng chính sách`);
      }
    }
    if (!seenRaces.has(power.demographics.dominantRace)) {
      throw new NationDataError(`thế lực "${power.nationId}" khai tộc thống trị "${power.demographics.dominantRace}" mà không có nhóm dân nào của tộc ấy`);
    }
    const dominantShare = groups.find((group) => group.raceId === power.demographics.dominantRace)?.population ?? 0;
    if (dominantShare > 0.7) {
      throw new NationDataError(
        `thế lực "${power.nationId}" có tộc thống trị chiếm ${(dominantShare * 100).toFixed(0)}% — mục 1b: dân cư luôn pha trộn, một tộc thuần là đã làm sai`,
      );
    }

    powers.set(power.nationId, power);
  }

  if (powers.size !== MINIGAME_KINDS.length) {
    throw new NationDataError(`khai ${String(powers.size)} thế lực nhưng có ${String(MINIGAME_KINDS.length)} thể loại minigame`);
  }

  // --- 6. mười tám quân đoàn ---------------------------------------------
  const corpsById = new Map<string, CorpsRow>();
  const numbers = new Set<number>();
  const branchIds = new Set(corpsData.tech.branches.map((branch) => branch.id));
  let mutinyLeaders = 0;
  for (const corps of corpsData.corps) {
    if (corpsById.has(corps.id)) throw new NationDataError(`quân đoàn trùng id: ${corps.id}`);
    if (numbers.has(corps.number)) throw new NationDataError(`quân đoàn trùng số hiệu: ${String(corps.number)}`);
    numbers.add(corps.number);
    if (corps.techBranch !== '' && !branchIds.has(corps.techBranch)) {
      throw new NationDataError(`quân đoàn "${corps.id}" trỏ nhánh kỹ thuật "${corps.techBranch}" không có trong cây`);
    }
    if (corps.mutinyLeader) mutinyLeaders += 1;
    corpsById.set(corps.id, corps);
  }
  for (let number = 1; number <= 18; number++) {
    if (!numbers.has(number)) throw new NationDataError(`thiếu quân đoàn số ${String(number)} — mục 4 đòi đủ mười tám`);
  }
  if (mutinyLeaders !== 1) {
    throw new NationDataError(
      `có ${String(mutinyLeaders)} quân đoàn khai mutinyLeader — mục 4 chỉ cho ĐÚNG MỘT (Tân Binh Đoàn), vì kết cục thất bại đặc trưng phải có một khuôn mặt`,
    );
  }
  if (!corpsById.has(corpsData.tech.requiresCorps)) {
    throw new NationDataError(`cây kỹ thuật đòi quân đoàn "${corpsData.tech.requiresCorps}" mà quân đoàn ấy không có`);
  }
  for (const race of corpsData.config.devshirme.eligibleRaces) {
    if (!raceIds.has(race)) throw new NationDataError(`chiêu mộ dị tộc khai tộc "${race}" không có trong races.json`);
  }

  // --- 8. tôn giáo --------------------------------------------------------
  const religionIds = new Set(religions.religions.map((religion) => religion.id));
  for (const movement of religions.heresy.movements) {
    const found = religions.religions.find((religion) => religion.id === movement);
    if (found === undefined) throw new NationDataError(`phong trào dị giáo "${movement}" không có trong danh sách tôn giáo`);
    if (found.heresyOf !== religions.heresy.sourceFaith) {
      throw new NationDataError(
        `"${movement}" phải khai heresyOf = "${religions.heresy.sourceFaith}" — mục 5: dị giáo phát sinh TỪ TRONG Giáo hội Chính thống`,
      );
    }
  }
  const religionRelations = new Map<string, number>();
  for (const pair of religions.relations.pairs) {
    for (const id of [pair.a, pair.b]) {
      if (!religionIds.has(id)) throw new NationDataError(`ma trận tôn giáo nhắc "${id}" không có trong danh sách`);
    }
    religionRelations.set(religionPairKey(pair.a, pair.b), pair.value);
  }
  for (const area of religions.seeds.areas) {
    if (!canon.has(area.areaId) && !provinceIds.has(area.areaId)) {
      throw new NationDataError(`tỷ lệ tôn giáo khai cho "${area.areaId}" mà đó không phải thế lực canon cũng không phải tỉnh có thật`);
    }
    const total = area.mix.reduce((sum, row) => sum + row.share, 0);
    if (Math.abs(total - 1) > 0.02) {
      throw new NationDataError(`tỷ lệ tôn giáo của "${area.areaId}" cộng lại ${total.toFixed(2)}, phải xấp xỉ 1`);
    }
    for (const row of area.mix) {
      if (!religionIds.has(row.religionId)) {
        throw new NationDataError(`"${area.areaId}" khai tôn giáo "${row.religionId}" không có trong danh sách`);
      }
    }
  }

  // --- 7. cải cách và ngoại giao -----------------------------------------
  const dietFactions = new Map<string, string>();
  for (const faction of reforms.factions) dietFactions.set(faction.id, faction.name);

  const reformById = new Map<string, Reform>();
  for (const reform of reforms.reforms) {
    if (reformById.has(reform.id)) throw new NationDataError(`dự luật trùng id: ${reform.id}`);
    for (const faction of [...reform.opposedByFaction, ...reform.favouredByFaction]) {
      if (!dietFactions.has(faction)) throw new NationDataError(`dự luật "${reform.id}" nhắc phe "${faction}" chưa khai`);
    }
    reformById.set(reform.id, reform);
  }
  for (const reform of reforms.reforms) {
    for (const required of reform.requiresPassed) {
      if (!reformById.has(required)) throw new NationDataError(`dự luật "${reform.id}" đòi "${required}" thông qua trước mà không có dự luật ấy`);
    }
  }
  for (const voter of [...reforms.electors, ...reforms.princes]) {
    if (!dietFactions.has(voter.faction)) throw new NationDataError(`"${voter.id}" thuộc phe "${voter.faction}" chưa khai`);
    if (voter.raceId !== '' && !raceIds.has(voter.raceId)) {
      throw new NationDataError(`"${voter.id}" khai tộc "${voter.raceId}" không có trong races.json`);
    }
  }
  if (reforms.electors.length < reforms.config.vote.electorMajority) {
    throw new NationDataError('số tuyển hầu ít hơn số phiếu cần để quá bán — không dự luật nào thông qua được');
  }

  const treaties = new Map<string, Treaty>();
  for (const treaty of diplomacy.treaties) treaties.set(treaty.id, treaty);
  for (const pair of diplomacy.pairs) {
    for (const id of [pair.a, pair.b]) {
      if (!canon.has(id)) throw new NationDataError(`ma trận quan hệ nhắc "${id}" không phải thế lực canon`);
    }
  }
  const ripples = new Map<string, Ripple>();
  for (const ripple of diplomacy.ripples) {
    if (ripple.from !== 'any' && !canon.has(ripple.from)) {
      throw new NationDataError(`dội "${ripple.id}" phát từ "${ripple.from}" mà đó không phải thế lực canon`);
    }
    ripples.set(ripple.id, ripple);
  }

  return {
    powers,
    nationNames: allNationNames,
    nationRegions,
    registeredCountryRanks,
    registeredGovernmentForms,
    countryRanks,
    governmentForms,
    accessTiers: nations.accessTiers,
    clarity: nations.clarity,
    policies,
    revolt: nations.minorityPolicies.revolt,
    migration: nations.minorityPolicies.migration,
    corps: corpsData.corps,
    corpsConfig: corpsData.config,
    tech: corpsData.tech,
    spread: religions.spread,
    heresy: religions.heresy,
    religionRelations,
    religionRelationDefault: religions.relations.default,
    religionSeeds: religions.seeds.areas,
    religionIds,
    reforms: reformById,
    electors: reforms.electors,
    princes: reforms.princes,
    dietFactions,
    diet: reforms.config,
    diplomacy: diplomacy.config,
    treaties,
    relationSeeds: diplomacy.pairs,
    ripples,
  };
}

function religionPairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

const DATA = load();

// ---------------------------------------------------------------------------
// Đọc
// ---------------------------------------------------------------------------

export function powerRows(): PowerRow[] {
  return [...DATA.powers.values()];
}

export function powerRowOf(nationId: string): PowerRow | null {
  return DATA.powers.get(nationId) ?? null;
}

export function powerName(nationId: string): string {
  return DATA.nationNames.get(nationId) ?? nationId;
}

/** Các vùng lãnh thổ được đăng ký cho một quốc gia, theo thứ tự ưu tiên trong dữ liệu. */
export function nationRegionsOf(nationId: string): string[] {
  return (DATA.nationRegions.get(nationId) ?? []).filter((id) => id.startsWith('realm_'));
}

export function countryRanks(): CountryRank[] {
  return [...DATA.countryRanks.values()].sort((left, right) => left.rank - right.rank);
}

export function countryRankOf(id: string): CountryRank | null {
  return DATA.countryRanks.get(id) ?? null;
}

export function governmentForms(): GovernmentForm[] {
  return [...DATA.governmentForms.values()];
}

export function governmentFormOf(id: string): GovernmentForm | null {
  return DATA.governmentForms.get(id) ?? null;
}

export function registeredCountryRankOf(nationId: string): CountryRank | null {
  return countryRankOf(DATA.registeredCountryRanks.get(nationId) ?? '');
}

export function registeredGovernmentFormOf(nationId: string): GovernmentForm | null {
  return governmentFormOf(DATA.registeredGovernmentForms.get(nationId) ?? '');
}

export function accessTiers(): AccessTierRow[] {
  return [...DATA.accessTiers];
}

export function clarityConfig(): ClarityConfig {
  return DATA.clarity;
}

export function minorityPolicies(): MinorityPolicy[] {
  return [...DATA.policies.values()];
}

/** Bốn chính sách ĐẶT ĐƯỢC. `han-che` không nằm trong đây, đúng mục 3. */
export function settablePolicies(): MinorityPolicy[] {
  return minorityPolicies().filter((policy) => policy.settable);
}

export function policyOf(id: string): MinorityPolicy | null {
  return DATA.policies.get(id) ?? null;
}

export function revoltConfig(): RevoltConfig {
  return DATA.revolt;
}

export function migrationConfig(): MigrationConfig {
  return DATA.migration;
}

export function corpsRows(): CorpsRow[] {
  return [...DATA.corps];
}

export function corpsRowOf(id: string): CorpsRow | null {
  return DATA.corps.find((corps) => corps.id === id) ?? null;
}

export function corpsConfig(): CorpsConfig {
  return DATA.corpsConfig;
}

export function techConfig(): TechConfig {
  return DATA.tech;
}

export function techBranchOf(id: string): TechBranch | null {
  return DATA.tech.branches.find((branch) => branch.id === id) ?? null;
}

export function spreadConfig(): SpreadConfig {
  return DATA.spread;
}

export function heresyConfig(): HeresyConfig {
  return DATA.heresy;
}

/** Quan hệ giữa hai tôn giáo, -100..100. Không khai thì mặc định "không quen biết". */
export function religionRelation(a: string, b: string): number {
  if (a === b) return 100;
  return DATA.religionRelations.get(religionPairKey(a, b)) ?? DATA.religionRelationDefault;
}

export function religionSeeds(): ReligionSeed[] {
  return DATA.religionSeeds;
}

export function knownReligion(id: string): boolean {
  return DATA.religionIds.has(id);
}

export function reformRows(): Reform[] {
  return [...DATA.reforms.values()].sort((left, right) => left.order - right.order);
}

export function reformOf(id: string): Reform | null {
  return DATA.reforms.get(id) ?? null;
}

export function electors(): Elector[] {
  return [...DATA.electors];
}

export function princes(): Prince[] {
  return [...DATA.princes];
}

export function dietConfig(): DietConfig {
  return DATA.diet;
}

export function bargainOf(id: string): Bargain | null {
  return DATA.diet.bargains.find((bargain) => bargain.id === id) ?? null;
}

export function dietFactionName(id: string): string {
  return DATA.dietFactions.get(id) ?? id;
}

export function diplomacyConfig(): DiplomacyConfig {
  return DATA.diplomacy;
}

export function relationBandFor(value: number): RelationBand {
  const found = DATA.diplomacy.bands.find((band) => value <= band.upTo);
  const last = DATA.diplomacy.bands[DATA.diplomacy.bands.length - 1];
  if (found === undefined && last === undefined) throw new NationDataError('bảng quan hệ rỗng');
  return found ?? (last as RelationBand);
}

export function treatyOf(id: string): Treaty | null {
  return DATA.treaties.get(id) ?? null;
}

export function treaties(): Treaty[] {
  return [...DATA.treaties.values()];
}

export function relationSeeds(): RelationSeed[] {
  return [...DATA.relationSeeds];
}

export function ripples(): Ripple[] {
  return [...DATA.ripples.values()];
}

export function rippleOf(id: string): Ripple | null {
  return DATA.ripples.get(id) ?? null;
}
