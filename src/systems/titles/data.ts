/**
 * NẠP `data/titles.json` VÀ `data/succession.json` (mục 12.1) theo R5.
 *
 * Kiểm THAM CHIẾU lúc nạp chứ không chỉ kiểm hình dạng, đúng khuôn `holding/data.ts`
 * của Phần 12. Bốn phép kiểm ở đây đều rút ra từ chỗ dễ hỏng của chính phần này:
 *
 *  1. **MỖI BẬC PHẢI TRỎ TỚI MỘT PANEL CÓ THẬT.** Mục 4 là yêu cầu CỐT LÕI: mỗi
 *     cấp mở ra một trò chơi KHÁC. Một bậc trỏ vào panel không tồn tại thì UI của
 *     mục 11 hiện ra một bảng rỗng, và người chơi lên chức mà không thấy gì đổi.
 *  2. **THANG TÂY ÂU PHẢI KHỚP BẢNG `command` CỦA `data/units.json`.** README mục
 *     4.3 xếp đây vào danh sách "sửa ngược" của Phần 13: quyền chỉ huy theo tước
 *     vị là của Phần 10, nhưng THANG là của Phần 13. Lệch nhau thì một Tuyển hầu
 *     ra trận với quyền chỉ huy của một người không tước vị, và không ai hiểu vì sao.
 *  3. **`capByRank` PHẢI PHỦ ĐỦ 0–9.** Thiếu một bậc thì `vassalCap` của bậc ấy
 *     rơi về 0, và một Công tước bỗng không giữ nổi chư hầu nào.
 *  4. **LUẬT KẾ VỊ PHẢI TRỎ TỚI QUAN HỆ CÓ THẬT.** `order` là danh sách id quan
 *     hệ; một id gõ sai sẽ lặng lẽ không bao giờ khớp ai, và hàng thừa kế rỗng —
 *     tức là một cuộc khủng hoảng kế vị do lỗi chính tả.
 */

import { z } from 'zod';
import titlesFile from '@data/titles.json';
import successionFile from '@data/succession.json';
import { commandRows } from '@/minigames/battle/data';
import { STAT_IDS } from '@/systems/character/stats';
import { TITLE_PATHS } from './types';

export class TitleDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TitleDataError';
  }
}

// ---------------------------------------------------------------------------
// titles.json
// ---------------------------------------------------------------------------

const panelSectionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  ref: z.string().default(''),
});

const panelActionSchema = panelSectionSchema;

const panelSchema = z.object({
  id: z.string().startsWith('panel_'),
  name: z.string().min(1),
  /** Panel này cộng THÊM vào một panel khác — hầu tước là bảng quận + biên phòng. */
  extends: z.string().default(''),
  sections: z.array(panelSectionSchema).default([]),
  actions: z.array(panelActionSchema).default([]),
  note: z.string().default(''),
});

export type TitlePanel = z.infer<typeof panelSchema>;

const ladderSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  /** `the-tap` · `bau-cu` · `nang-luc` · `dong-mau` · `suc-manh` · `tay-nghe` · `uy-tin`. */
  advancement: z.string().min(1),
  nations: z.array(z.string()).default([]),
  successionDefault: z.string().min(1),
  hereditary: z.boolean().default(true),
  parallel: z.boolean().default(false),
  bloodGated: z.boolean().default(false),
  titleless: z.boolean().default(false),
  termYears: z.number().int().min(0).default(0),
  note: z.string().default(''),
});

export type TitleLadder = z.infer<typeof ladderSchema>;

const obligationSchema = z.object({
  levyDays: z.number().min(0),
  tribute: z.number().min(0),
  courtDays: z.number().min(0),
});

const titleSchema = z.object({
  id: z.string().min(1),
  ladderId: z.string().min(1),
  rank: z.number().int().min(0).max(9),
  name: z.string().min(1),
  landKind: z.string().min(1),
  panel: z.string().startsWith('panel_'),
  /** 0 nghĩa là KHÔNG giới hạn — khớp đúng quy ước của `data/units.json`. */
  commandUnits: z.number().int().min(0),
  provinceCap: z.number().int().min(0),
  obligations: obligationSchema,
  grants: z.array(z.string()).default([]),
  loses: z.array(z.string()).default([]),
  termYears: z.number().int().min(0).default(0),
  minBlood: z.number().int().min(0).max(100).default(0),
  minAge: z.number().int().min(0).default(0),
  requiresNation: z.string().default(''),
  meritExam: z.string().default(''),
  parallel: z.boolean().default(false),
  note: z.string().default(''),
});

export type Title = z.infer<typeof titleSchema>;

const courtSeatSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  brief: z.string().min(1),
  stat: z.string().min(1),
  skill: z.string().min(1),
  minRank: z.number().int().min(0).max(9),
  effect: z.object({
    revenue: z.number().default(0),
    levy: z.number().default(0),
    legitimacyPerYear: z.number().default(0),
    plotDetection: z.number().default(0),
    unrest: z.number().default(0),
    corruptionRisk: z.number().min(0).max(1),
  }),
  note: z.string().default(''),
});

export type CourtSeat = z.infer<typeof courtSeatSchema>;

const legitimacySchema = z.object({
  min: z.number(),
  max: z.number(),
  neutral: z.number(),
  startByPath: z.record(z.string(), z.number()),
  settle: z.number(),
  driftPerYear: z.number().min(0),
  perTenPoints: z.number().min(0),
  usurperVassalPenalty: z.number(),
  churchRecognitionBonus: z.number(),
  churchCondemnPenalty: z.number(),
  fairVerdictGain: z.number(),
  biasedVerdictLoss: z.number(),
  battleWonGain: z.number(),
  seizedLandLoss: z.number(),
  yearsToRebuild: z.number().min(1),
  rebelSuppressedGain: z.number(),
});

export type LegitimacyConfig = z.infer<typeof legitimacySchema>;

const obligationConfigSchema = z.object({
  arrearsSummonsYears: z.number().int().min(1),
  arrearsFineShare: z.number().min(0),
  arrearsSeizureYears: z.number().int().min(1),
  courtAbsenceLoyalty: z.number(),
  courtAbsenceLegitimacy: z.number(),
  levyOverCallDays: z.number().min(0),
  tributeShareOfRevenue: z.number().min(0).max(1),
});

export type ObligationConfig = z.infer<typeof obligationConfigSchema>;

const vassalConfigSchema = z.object({
  startLoyalty: z.number().min(0).max(100),
  settleLoyalty: z.number().min(0).max(100),
  driftPerYear: z.number().min(0),
  grievanceDecayPerYear: z.number().min(0),
  grievanceWeight: z.number().min(0),
  maxGrievances: z.number().int().min(1),
  loyalty: z.object({
    taxPerPointOverBase: z.number(),
    levyPerTenDaysOver: z.number(),
    unfairVerdict: z.number(),
    fairVerdict: z.number(),
    liegeLegitimacyPer10Below: z.number(),
    landSeized: z.number(),
    landGranted: z.number(),
    titleGranted: z.number(),
    battleWon: z.number(),
    battleLost: z.number(),
    marriage: z.number(),
    gift: z.number(),
    giftCostPerPoint: z.number().min(1),
    liegePresencePerYear: z.number(),
    rivalCourting: z.number(),
    liegeWeakPerTenPower: z.number(),
  }),
  rebellion: z.object({
    loyaltyBelow: z.number().min(0).max(100),
    powerRatioNeeded: z.number().min(0),
    claimBonus: z.number(),
    factionBonus: z.number(),
    perAlliedRebel: z.number(),
    liegeLegitimacyPer10: z.number(),
    checkDomain: z.string().min(1),
    riskCap: z.number().min(1).max(99),
  }),
  power: z.object({
    perHolding: z.number().min(0),
    perProvince: z.number().min(0),
    perLevyHundred: z.number().min(0),
    perTitleRank: z.number().min(0),
  }),
  capByRank: z.record(z.string(), z.number().int().min(0)),
});

export type VassalConfig = z.infer<typeof vassalConfigSchema>;

const checkConfigSchema = z.object({
  system: z.enum(['d100', 'd20', '3d6', 'pool']),
  domainPrefix: z.string().min(1),
  domains: z.array(z.string().min(1)).min(1),
});

export type RuleCheckConfig = z.infer<typeof checkConfigSchema>;

const courtConfigSchema = z.object({
  skillDivisor: z.number().min(1),
  loyaltyDivisor: z.number().min(1),
  skimBelowLoyalty: z.number().min(0).max(100),
  skimShare: z.number().min(0).max(1),
  blunderBelowSkill: z.number().min(0).max(100),
  blunderChance: z.number().min(0).max(100),
  vacantPenalty: z.number().min(0).max(1),
  salaryPerRank: z.number().min(0),
});

export type CourtConfig = z.infer<typeof courtConfigSchema>;

const influenceEffectSchema = z.object({
  label: z.string().min(1),
  domains: z.array(z.string().min(1)).min(1),
  value: z.number(),
});

const influenceSchema = z.object({
  rankAuthority: z.object({
    label: z.string().min(1),
    domains: z.array(z.string().min(1)).min(1),
    valuePerRank: z.number(),
  }),
  grants: z.record(z.string(), influenceEffectSchema).default({}),
  pressures: z.object({
    churchUnrecognised: influenceEffectSchema,
    rivalClaimant: influenceEffectSchema,
    arrearsPerYear: influenceEffectSchema,
    expiringTerm: influenceEffectSchema,
  }),
});

export type TitleInfluenceEffect = z.infer<typeof influenceEffectSchema>;
export type TitleInfluenceConfig = z.infer<typeof influenceSchema>;

const titleHistoryProfileSchema = z.object({
  address: z.string().default(''),
  historicalBasis: z.string().default(''),
  legalCharacter: z.string().default(''),
  privileges: z.array(z.string()).default([]),
  tensions: z.array(z.string()).default([]),
});

const historySchema = z.object({
  ladders: z.record(z.string(), z.string()).default({}),
  titles: z.record(z.string(), titleHistoryProfileSchema).default({}),
  landKinds: z.record(z.string(), z.string()).default({}),
  paths: z.record(z.string(), z.string()).default({}),
});

export type TitleHistoryProfile = z.infer<typeof titleHistoryProfileSchema>;

const titlesFileSchema = z.object({
  version: z.number(),
  config: z.object({
    check: checkConfigSchema,
    legitimacy: legitimacySchema,
    obligations: obligationConfigSchema,
    vassal: vassalConfigSchema,
    influence: influenceSchema,
  }),
  history: historySchema,
  panels: z.array(panelSchema).min(1),
  ladders: z.array(ladderSchema).min(1),
  titles: z.array(titleSchema).min(1),
  court: z.array(courtSeatSchema).min(1),
  courtConfig: courtConfigSchema,
});

// ---------------------------------------------------------------------------
// succession.json
// ---------------------------------------------------------------------------

const successionLawSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  /** `the-tap` · `bau-cu` · `thach-dau` · `hoi-dong-chon`. */
  kind: z.string().min(1),
  order: z.array(z.string().min(1)).min(1),
  splits: z.boolean(),
  genderBias: z.enum(['nam', 'nu', 'khong']),
  electorate: z.string().default(''),
  minElectors: z.number().int().min(0).default(0),
  opensDuel: z.boolean().default(false),
  duelKind: z.string().default(''),
  ignoresBlood: z.boolean().default(false),
  effects: z.object({
    vassalLoyalty: z.number(),
    unrest: z.number(),
    realmSplit: z.number(),
  }),
  note: z.string().default(''),
});

export type SuccessionLaw = z.infer<typeof successionLawSchema>;

const heirRelationSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  weight: z.number().min(0),
});

export type HeirRelation = z.infer<typeof heirRelationSchema>;

const noHeirOptionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  cost: z.number().min(0),
  legitimacy: z.number(),
  vassalLoyalty: z.number(),
  requiresRank: z.number().int().min(0).default(0),
  requiresVassals: z.number().int().min(0).default(0),
  losesRealm: z.boolean().default(false),
});

export type NoHeirOption = z.infer<typeof noHeirOptionSchema>;

const successionFileSchema = z.object({
  version: z.number(),
  config: z.object({
    inherits: z.array(z.string()).min(1),
    resets: z.array(z.string()).min(1),
    legitimacyOnSuccession: z.object({ clean: z.number(), disputed: z.number(), usurped: z.number() }),
    vassalLoyaltyOnSuccession: z.object({
      clean: z.number(),
      disputed: z.number(),
      usurped: z.number(),
      reswearYears: z.number().int().min(1),
    }),
    minorAge: z.number().int().min(1),
    regencyLoyaltyPerYear: z.number(),
    regentSkimShare: z.number().min(0).max(1),
    crisisYears: z.number().int().min(1),
    crisisNeighbourClaimChance: z.number().min(0).max(100),
    crisisUnrest: z.number(),
    electionCampaignCostPerVote: z.number().min(0),
    electionCheck: z.string().min(1),
    duelChallengeCheck: z.string().min(1),
  }),
  laws: z.array(successionLawSchema).min(1),
  relations: z.array(heirRelationSchema).min(1),
  noHeir: z.object({
    options: z.array(noHeirOptionSchema).min(1),
    ifNothing: z.object({
      crisis: z.boolean(),
      unrest: z.number(),
      neighbourClaims: z.number().int().min(0),
      legitimacy: z.number(),
    }),
  }),
});

export type SuccessionConfig = z.infer<typeof successionFileSchema>['config'];
export type NoHeirRules = z.infer<typeof successionFileSchema>['noHeir'];

// ---------------------------------------------------------------------------
// Nạp
// ---------------------------------------------------------------------------

interface TitleData {
  check: RuleCheckConfig;
  legitimacy: LegitimacyConfig;
  obligations: ObligationConfig;
  vassal: VassalConfig;
  influence: TitleInfluenceConfig;
  history: z.infer<typeof historySchema>;
  panels: Map<string, TitlePanel>;
  ladders: Map<string, TitleLadder>;
  titles: Map<string, Title>;
  court: CourtSeat[];
  courtConfig: CourtConfig;
  succession: SuccessionConfig;
  successionLaws: Map<string, SuccessionLaw>;
  heirRelations: Map<string, HeirRelation>;
  noHeir: NoHeirRules;
}

function parseOrThrow<T>(schema: z.ZodType<T>, file: unknown, name: string): T {
  const parsed = schema.safeParse(file);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new TitleDataError(
      `${name} hỏng ở "${issue?.path.join('.') ?? '?'}": ${issue?.message ?? 'không rõ'}`,
    );
  }
  return parsed.data;
}

function load(): TitleData {
  const file = parseOrThrow(titlesFileSchema, titlesFile, 'data/titles.json');
  const succession = parseOrThrow(successionFileSchema, successionFile, 'data/succession.json');

  const panels = new Map<string, TitlePanel>();
  for (const panel of file.panels) {
    if (panels.has(panel.id)) throw new TitleDataError(`panel trùng id: ${panel.id}`);
    panels.set(panel.id, panel);
  }
  for (const panel of file.panels) {
    if (panel.extends !== '' && !panels.has(panel.extends)) {
      throw new TitleDataError(`panel "${panel.id}" nối dài "${panel.extends}" mà panel ấy không có`);
    }
  }

  const ladders = new Map<string, TitleLadder>();
  for (const ladder of file.ladders) {
    if (ladders.has(ladder.id)) throw new TitleDataError(`thang trùng id: ${ladder.id}`);
    ladders.set(ladder.id, ladder);
  }

  const titles = new Map<string, Title>();
  for (const title of file.titles) {
    if (titles.has(title.id)) throw new TitleDataError(`tước trùng id: ${title.id}`);
    if (!ladders.has(title.ladderId)) {
      throw new TitleDataError(`tước "${title.id}" thuộc thang "${title.ladderId}" mà thang ấy không có`);
    }
    // Kiểm 1: mỗi bậc phải mở ra một bảng có thật (mục 4).
    if (!panels.has(title.panel)) {
      throw new TitleDataError(`tước "${title.id}" trỏ tới bảng "${title.panel}" mà bảng ấy không có`);
    }
    titles.set(title.id, title);
  }

  for (const ladder of ladders.values()) {
    if (!file.titles.some((title) => title.ladderId === ladder.id)) {
      throw new TitleDataError(`thang "${ladder.id}" không có bậc nào — người chơi phe ấy sẽ không có bảng nào để mở`);
    }
  }

  // Kiểm 2: thang Tây Âu phải khớp bảng `command` của Phần 10 (README mục 4.3).
  const commandByTitle = new Map(commandRows().map((row) => [row.titleId, row]));
  const western = file.titles.filter((title) => title.ladderId === 'tay-au');
  const missing = western.filter((title) => !commandByTitle.has(title.id)).map((title) => title.id);
  if (missing.length > 0) {
    throw new TitleDataError(
      `data/units.json → command thiếu bậc của thang Tây Âu: ${missing.join(', ')} — Phần 13 phải sửa ngược bảng ấy`,
    );
  }
  const drifted = western
    .filter((title) => (commandByTitle.get(title.id)?.rank ?? title.rank) !== title.rank)
    .map((title) => `${title.id} (titles.json ${String(title.rank)} ≠ units.json ${String(commandByTitle.get(title.id)?.rank ?? -1)})`);
  if (drifted.length > 0) {
    throw new TitleDataError(`hai file lệch bậc: ${drifted.join(', ')}`);
  }

  // Kiểm 3: trần chư hầu phải phủ đủ mười bậc.
  for (let rank = 0; rank <= 9; rank++) {
    if (file.config.vassal.capByRank[String(rank)] === undefined) {
      throw new TitleDataError(`config.vassal.capByRank thiếu bậc ${String(rank)}`);
    }
  }

  for (const path of TITLE_PATHS) {
    if (file.config.legitimacy.startByPath[path] === undefined) {
      throw new TitleDataError(`config.legitimacy.startByPath thiếu con đường "${path}"`);
    }
  }

  const statIds = new Set<string>(STAT_IDS);
  for (const seat of file.court) {
    if (!statIds.has(seat.stat)) {
      throw new TitleDataError(`ghế triều đình "${seat.id}" dùng chỉ số "${seat.stat}" không có trong 12 chỉ số của Phần 6`);
    }
  }

  const heirRelations = new Map<string, HeirRelation>();
  for (const relation of succession.relations) heirRelations.set(relation.id, relation);

  const successionLaws = new Map<string, SuccessionLaw>();
  for (const law of succession.laws) {
    if (successionLaws.has(law.id)) throw new TitleDataError(`luật kế vị trùng id: ${law.id}`);
    // Kiểm 4: một id quan hệ gõ sai là một cuộc khủng hoảng kế vị do lỗi chính tả.
    for (const relation of law.order) {
      if (!heirRelations.has(relation)) {
        throw new TitleDataError(`luật kế vị "${law.id}" xếp hàng theo "${relation}" mà quan hệ ấy không có trong bảng`);
      }
    }
    successionLaws.set(law.id, law);
  }

  for (const ladder of ladders.values()) {
    if (!successionLaws.has(ladder.successionDefault)) {
      throw new TitleDataError(
        `thang "${ladder.id}" mặc định luật kế vị "${ladder.successionDefault}" mà luật ấy không có`,
      );
    }
  }

  return {
    check: file.config.check,
    legitimacy: file.config.legitimacy,
    obligations: file.config.obligations,
    vassal: file.config.vassal,
    influence: file.config.influence,
    history: file.history,
    panels,
    ladders,
    titles,
    court: file.court,
    courtConfig: file.courtConfig,
    succession: succession.config,
    successionLaws,
    heirRelations,
    noHeir: succession.noHeir,
  };
}

const DATA = load();

// ---------------------------------------------------------------------------
// Đọc
// ---------------------------------------------------------------------------

export function ruleCheckConfig(): RuleCheckConfig {
  return DATA.check;
}

export function legitimacyConfig(): LegitimacyConfig {
  return DATA.legitimacy;
}

export function obligationConfig(): ObligationConfig {
  return DATA.obligations;
}

export function vassalConfig(): VassalConfig {
  return DATA.vassal;
}

export function titleInfluenceConfig(): TitleInfluenceConfig {
  return DATA.influence;
}

export function titleHistoryOf(titleId: string): TitleHistoryProfile | null {
  return DATA.history.titles[titleId] ?? null;
}

export function ladderHistoryOf(ladderId: string): string {
  return DATA.history.ladders[ladderId] ?? DATA.ladders.get(ladderId)?.note ?? '';
}

export function landKindName(id: string): string {
  return DATA.history.landKinds[id] ?? id;
}

export function titlePathName(id: string): string {
  return DATA.history.paths[id] ?? id;
}

export function grantName(id: string): string {
  return DATA.influence.grants[id]?.label ?? id.replaceAll('-', ' ');
}

export function courtConfig(): CourtConfig {
  return DATA.courtConfig;
}

export function successionConfig(): SuccessionConfig {
  return DATA.succession;
}

export function noHeirRules(): NoHeirRules {
  return DATA.noHeir;
}

export function allTitles(): Title[] {
  return [...DATA.titles.values()];
}

export function titleOf(id: string): Title | null {
  return DATA.titles.get(id) ?? null;
}

export function titleName(id: string): string {
  return DATA.titles.get(id)?.name ?? id;
}

/** Bậc của một tước. Tước lạ trả 0 — thường dân, không phải một lỗi. */
export function rankOf(id: string): number {
  return DATA.titles.get(id)?.rank ?? 0;
}

export function titlesOfLadder(ladderId: string): Title[] {
  return allTitles()
    .filter((title) => title.ladderId === ladderId)
    .sort((left, right) => left.rank - right.rank);
}

export function allLadders(): TitleLadder[] {
  return [...DATA.ladders.values()];
}

export function ladderOf(id: string): TitleLadder | null {
  return DATA.ladders.get(id) ?? null;
}

/** Thang của một thế lực. Không khai thì rơi về thang Tây Âu của mục 2. */
export function ladderForNation(nationId: string): TitleLadder {
  const found = allLadders().find((ladder) => ladder.nations.includes(nationId));
  const fallback = DATA.ladders.get('tay-au');
  if (fallback === undefined) throw new TitleDataError('data/titles.json không khai thang "tay-au"');
  return found ?? fallback;
}

export function panelOf(id: string): TitlePanel | null {
  return DATA.panels.get(id) ?? null;
}

/**
 * Bảng trạng thái ĐẦY ĐỦ của một tước, đã gộp panel cha (mục 4, mục 11).
 *
 * Hầu tước là "bảng quận + biên phòng", không phải một bảng riêng chép lại sáu
 * mục của bảng quận — chép lại là hai bảng sẽ lệch nhau ở lần sửa đầu tiên.
 */
export function panelFor(titleId: string): TitlePanel | null {
  const title = DATA.titles.get(titleId);
  if (title === undefined) return null;
  const panel = DATA.panels.get(title.panel);
  if (panel === undefined) return null;
  if (panel.extends === '') return panel;

  const parent = DATA.panels.get(panel.extends);
  if (parent === undefined) return panel;
  return {
    ...panel,
    sections: [...parent.sections, ...panel.sections],
    actions: [...parent.actions, ...panel.actions],
  };
}

export function courtSeats(): CourtSeat[] {
  return [...DATA.court];
}

export function courtSeatOf(id: string): CourtSeat | null {
  return DATA.court.find((seat) => seat.id === id) ?? null;
}

/** Ghế triều đình mở ở bậc này. Bậc thấp thì triều đình chưa tồn tại. */
export function courtSeatsFor(rank: number): CourtSeat[] {
  return DATA.court.filter((seat) => rank >= seat.minRank);
}

export function successionLaws(): SuccessionLaw[] {
  return [...DATA.successionLaws.values()];
}

export function successionLawOf(id: string): SuccessionLaw | null {
  return DATA.successionLaws.get(id) ?? null;
}

export function heirRelation(id: string): HeirRelation | null {
  return DATA.heirRelations.get(id) ?? null;
}

/** SỐ CHƯ HẦU giữ được ở một bậc (mục 7). Dưới bá tước là 0, và đó là mục 2. */
export function vassalCapFor(rank: number): number {
  return DATA.vassal.capByRank[String(Math.max(0, Math.min(9, Math.round(rank))))] ?? 0;
}

/** Miền kiểm định cai trị có hợp lệ không — chặn gõ sai ở khâu gọi. */
export function isRuleDomain(domain: string): boolean {
  return DATA.check.domains.includes(domain);
}
