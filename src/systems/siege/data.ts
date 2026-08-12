/**
 * NẠP BỐN FILE DATA CỦA PHẦN 11 (mục 10.1) theo R5.
 *
 * `fortifications.json` · `siege-engines.json` · `siege-events.json` ·
 * `surrender-terms.json`
 *
 * Kiểm THAM CHIẾU lúc nạp chứ không chỉ kiểm hình dạng, đúng khuôn `battle/data.ts`
 * của Phần 10 — và ở đây có thêm một loại kiểm mà Phần 10 không cần: KHOÁ HIỆU ỨNG
 * CỦA SỰ KIỆN. Một sự kiện khai `{"besigerMorale": -8}` (gõ thiếu chữ) sẽ chạy êm
 * ru suốt cuộc vây hãm và không làm gì cả, còn người cân bằng thì tin rằng nó có
 * làm. Nên danh sách khoá là một tập ĐÓNG, và một khoá lạ nổ ngay lúc khởi động
 * chứ không im lặng biến mất (R4).
 *
 * MỌI CON SỐ ĐIỀU CHỈNH THEO THANG d100, DƯƠNG LÀ LỢI. Chúng đi qua
 * `scaleToSystem` của Phần 5 mục 7 để đổi sang hệ đang chạy. Phần 11 KHÔNG có
 * bảng quy đổi riêng — nếu có thì "mưa dầm" ở công thành sẽ nặng khác "mưa dầm" ở
 * dã chiến mà không ai cố ý thiết kế thế.
 */

import { z } from 'zod';
import fortificationsFile from '@data/fortifications.json';
import enginesFile from '@data/siege-engines.json';
import eventsFile from '@data/siege-events.json';
import termsFile from '@data/surrender-terms.json';
import { DIFFICULTY_BANDS } from '@/systems/check/difficulty';
import type { DifficultyBand } from '@/core/turn';

export class SiegeDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SiegeDataError';
  }
}

const bandSchema = z.enum(DIFFICULTY_BANDS as readonly [DifficultyBand, ...DifficultyBand[]]);

const tierShareSchema = z.object({
  critSuccess: z.number(),
  success: z.number(),
  costlySuccess: z.number(),
  fail: z.number(),
  critFail: z.number(),
});

export type TierShare = z.infer<typeof tierShareSchema>;

// ---------------------------------------------------------------------------
// fortifications.json
// ---------------------------------------------------------------------------

const rationSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  factor: z.number().min(0.05).max(1),
  morale: z.number(),
  health: z.number(),
  note: z.string().default(''),
});

export type RationLevel = z.infer<typeof rationSchema>;

const consumptionSchema = z.object({
  foodPerManWeek: z.number().min(0),
  fodderPerHorseWeek: z.number().min(0),
  waterPerManWeek: z.number().min(0),
  campSupplyPerManWeek: z.number().min(0),
  haulBase: z.number().min(0),
  haulPerCircumvallation: z.number(),
  starvingMorale: z.number(),
  starvingLossShare: z.number().min(0).max(1),
  smuggledPerWeek: z.number().min(0),
});

const diseaseSchema = z.object({
  checkId: z.string().min(1),
  hygieneStart: z.number().min(0).max(100),
  hygieneDrainPerWeek: z.number().min(0),
  crowdingPer1000: z.number().min(0),
  crowdingBand: z.array(z.object({ upTo: z.number(), band: bandSchema })).min(1),
  crowdingAboveBand: bandSchema,
  deathShare: tierShareSchema,
  outbreakOnCritFail: z.boolean().default(true),
  outbreakWeeks: z.number().int().min(0),
  outbreakExtraShare: z.number().min(0).max(1),
  hygieneOnCritSuccess: z.number(),
  hygieneOnCritFail: z.number(),
  wetMoatPenalty: z.number(),
  corpseThrowPenalty: z.number(),
  corpseThrowChurch: z.number(),
  moralePerDeathPercent: z.number().min(0),
  insideHygieneBonus: z.number(),
  insideCrowdingPer1000: z.number().min(0),
});

const serviceSchema = z.object({
  defaultDays: z.number().int().min(1),
  payPerManPerWeek: z.number().min(0),
  leaveShare: z.number().min(0).max(1),
  moraleOnLeave: z.number(),
  mercenaryPayPerManPerWeek: z.number().min(0),
  mercenaryMutinyShare: z.number().min(0).max(1),
  mercenaryPillageChance: z.number().min(0).max(100),
});

const desertionSchema = z.object({
  moraleBelow: z.number().min(0).max(100),
  baseShare: z.number().min(0).max(1),
  hungryShare: z.number().min(0).max(1),
  unpaidShare: z.number().min(0).max(1),
  perMoralePointBelow: z.number().min(0),
  winterExtra: z.number().min(0).max(1),
  insideFactor: z.number().min(0).max(1),
});

const seasonSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  weeks: z.number().int().min(1),
  disease: z.number(),
  attrition: z.number().min(0).max(1),
  morale: z.number(),
  haul: z.number().min(0),
  note: z.string().default(''),
});

export type Season = z.infer<typeof seasonSchema>;

const siegeMoraleSchema = z.object({
  checkId: z.string().min(1),
  checkBelow: z.number().min(0).max(100),
  garrisonBase: z.number().min(0).max(100),
  populationBase: z.number().min(0).max(100),
  besiegerBase: z.number().min(0).max(100),
  besiegerPerWeek: z.number(),
  defenderPerWeek: z.number(),
  wallBreach: z.number(),
  towerFell: z.number(),
  gateFell: z.number(),
  layerLost: z.number(),
  bombardedPerWeek: z.number(),
  reliefHope: z.number(),
  reliefCrushed: z.number(),
  sermon: z.number(),
  execution: z.number(),
  executionPopulation: z.number(),
  expelCivilians: z.number(),
  sortieBurnedEngine: z.number(),
  sortieFailed: z.number(),
  starving: z.number(),
  thirsty: z.number(),
  surrenderBelow: z.number().min(0).max(100),
});

const repairSchema = z.object({
  integrityPerWeek: z.number().min(0),
  materialsPerPoint: z.number().min(0),
  populationMorale: z.number(),
  requiresPopulation: z.number().min(0),
});

const waterSchema = z.object({
  weeksWithoutWater: z.number().int().min(1),
  cutMoralePerWeek: z.number(),
  cutLossShare: z.number().min(0).max(1),
  wellFailChance: z.number().min(0).max(100),
});

const assaultLayerSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  /** Số đợt đánh qua được cùng lúc — chỗ thắt cổ chai của mục 6. */
  frontage: z.number().int().min(1),
  /** Con số để IN RA cho người đọc. Thứ quyết định số hit cần là `band`. */
  defence: z.number().min(0),
  band: bandSchema,
  exposure: z.number().min(0),
  /** Lớp này đánh bằng cơ chế Phần 9 quy mô nhỏ. */
  duel: z.boolean().default(false),
  note: z.string().default(''),
});

export type AssaultLayer = z.infer<typeof assaultLayerSchema>;

const assaultMethodSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  layer: z.string().min(1),
  requiresEngine: z.string().default(''),
  requiresBreach: z.boolean().default(false),
  targetsGate: z.boolean().default(false),
  keepsFormation: z.boolean().default(false),
  attack: z.number(),
  exposure: z.number().min(0),
  roundsPerLayer: z.number().min(0.1),
  note: z.string().default(''),
});

export type AssaultMethod = z.infer<typeof assaultMethodSchema>;

const assaultSchema = z.object({
  maxRounds: z.number().int().min(1),
  waveShare: z.number().min(0.01).max(1),
  layers: z.array(assaultLayerSchema).min(2),
  methods: z.array(assaultMethodSchema).min(1),
  forlornHope: z.object({
    share: z.number().min(0).max(1),
    attack: z.number(),
    casualtyMultiplier: z.number().min(1),
    moraleIfHolds: z.number(),
    moraleIfWiped: z.number(),
    reputation: z.number(),
    loot: z.number().min(0),
  }),
  defenderDensityPerLayer: z.number().min(0),
  boilingOil: z.number(),
  murderHoleBonus: z.number(),
  heightPerMeter: z.number().min(0),
  casualtyBase: z.number().min(0).max(1),
  defenderCasualtyShare: z.number().min(0).max(1),
  breakOffShare: z.number().min(0).max(1),
  dicePerHundred: z.number().min(0),
  maxDice: z.number().int().min(1),
  qualityCenter: z.number(),
  breachEasesBand: z.number().int().min(0),
  thinGarrisonShare: z.number().min(0).max(1),
  thinGarrisonEasesBand: z.number().int().min(0),
});

export type AssaultConfig = z.infer<typeof assaultSchema>;

const fortConfigSchema = z.object({
  daysPerWeek: z.number().int().min(1),
  maxWeeks: z.number().int().min(4),
  rations: z.array(rationSchema).min(2),
  consumption: consumptionSchema,
  disease: diseaseSchema,
  service: serviceSchema,
  desertion: desertionSchema,
  seasons: z.array(seasonSchema).min(1),
  morale: siegeMoraleSchema,
  repair: repairSchema,
  water: waterSchema,
  assault: assaultSchema,
});

export type SiegeConfig = z.infer<typeof fortConfigSchema>;

const wallTemplateSchema = z.object({
  name: z.string().min(1),
  integrity: z.number().min(1),
  height: z.number().min(0),
  thickness: z.number().min(0),
  towers: z.number().int().min(0),
  towerIntegrity: z.number().min(0),
});

const templateSchema = z.object({
  id: z.string().startsWith('fort_'),
  name: z.string().min(1),
  tier: z.number().int().min(1).max(5),
  moat: z.object({ width: z.number().min(0), wet: z.boolean() }).nullable(),
  outerWall: wallTemplateSchema,
  gatehouse: z.object({
    integrity: z.number().min(1),
    drawbridge: z.boolean(),
    portcullis: z.boolean(),
    murderHoles: z.boolean(),
  }),
  bailey: z.object({ area: z.number().min(0), buildings: z.array(z.string()).default([]) }),
  innerWall: wallTemplateSchema.nullable(),
  keep: z.object({ integrity: z.number().min(1), capacity: z.number().min(0), stores: z.number().min(0) }),
  wells: z.number().int().min(0),
  garrison: z.number().int().min(0),
  population: z.number().int().min(0),
  supplies: z.object({
    food: z.number().min(0),
    water: z.number().min(0),
    fodder: z.number().min(0),
    materials: z.number().min(0),
  }),
  note: z.string().default(''),
});

export type FortTemplate = z.infer<typeof templateSchema>;

const fortificationsFileSchema = z.object({
  version: z.number(),
  config: fortConfigSchema,
  templates: z.array(templateSchema).min(1),
});

// ---------------------------------------------------------------------------
// siege-engines.json
// ---------------------------------------------------------------------------

const engineSchema = z.object({
  id: z.string().startsWith('engine_'),
  name: z.string().min(1),
  kind: z.string().min(1),
  buildWeeks: z.number().min(0),
  crew: z.number().int().min(1),
  cost: z.number().min(0),
  wallDamage: z.number().min(0),
  gateDamage: z.number().min(0).default(0),
  moraleDamage: z.number().min(0).default(0),
  rangeMeters: z.number().min(0).default(0),
  burnable: z.boolean().default(true),
  canThrowCorpses: z.boolean().default(false),
  requiresMoatFilled: z.boolean().default(false),
  antiPersonnel: z.number().min(0).default(0),
  tags: z.array(z.string()).default([]),
  note: z.string().default(''),
});

export type SiegeEngineType = z.infer<typeof engineSchema>;

const counterMineSchema = z.object({
  checkId: z.string().min(1),
  domain: z.string().min(1),
  listenBand: bandSchema,
  fightBand: bandSchema,
  maxRounds: z.number().int().min(1),
  crewDefault: z.number().int().min(1),
  darkPenalty: z.number(),
  nightSightBonus: z.number(),
  casualtyPerRound: z.number().min(0).max(1),
  collapseOnCritFail: z.number().min(0).max(1),
  floodChance: z.number().min(0).max(100),
  winStopsMine: z.boolean().default(true),
  moraleWinner: z.number(),
  moraleLoser: z.number(),
});

export type CounterMineConfig = z.infer<typeof counterMineSchema>;

const miningSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  baseWeeks: z.number().min(1),
  minersPerCrew: z.number().int().min(1),
  checkId: z.string().min(1),
  domain: z.string().min(1),
  band: bandSchema,
  progressByTier: tierShareSchema,
  critFailCollapse: z.number().min(0).max(1),
  wetMoatPenalty: z.number(),
  rockPenalty: z.number(),
  collapseIntegrity: z.number().min(0),
  collapseTowerChance: z.number().min(0).max(100),
  skilledRaces: z.record(z.string(), z.number()),
  counterMine: counterMineSchema,
});

export type MiningConfig = z.infer<typeof miningSchema>;

const engineConfigSchema = z.object({
  crewShare: z.number().min(0).max(1),
  carpenterBonus: z.number(),
  rainPenalty: z.number(),
  winterPenalty: z.number(),
  burnBaseChance: z.number().min(0).max(100),
  guardedPenalty: z.number(),
  rebuildFactor: z.number().min(0).max(1),
  bombardCheckId: z.string().min(1),
  bombardDomain: z.string().min(1),
  bombardBand: bandSchema,
  damageByTier: tierShareSchema,
  critFailBreaks: z.number().min(0).max(100),
  thicknessScale: z.number().min(0),
  towerShareOfHits: z.number().min(0).max(1),
});

export type EngineConfig = z.infer<typeof engineConfigSchema>;

const enginesFileSchema = z.object({
  version: z.number(),
  config: engineConfigSchema,
  engines: z.array(engineSchema).min(1),
  mining: miningSchema,
});

// ---------------------------------------------------------------------------
// siege-events.json — tập khoá ĐÓNG, xem chú thích đầu file
// ---------------------------------------------------------------------------

export const EVENT_CONDITION_KEYS = [
  'weekAtLeast',
  'reliefPossible',
  'insideOnly',
  'hasEngineTag',
  'hygieneBelow',
  'defenderMoraleBelow',
  'populationMoraleBelow',
  'mercenaryUnpaid',
] as const;

export const EVENT_EFFECT_KEYS = [
  'besiegerMorale',
  'defenderMorale',
  'populationMorale',
  'besiegerLoss',
  'defenderLoss',
  'hygiene',
  'outbreak',
  'treasury',
  'campSupply',
  'defenderFood',
  'materials',
  'wallIntegrity',
  'wells',
  'circumvallation',
  'engineDestroyed',
  'engineRebuild',
  'bombardBonus',
  'bombardPause',
  'mineProgress',
  'reliefIncoming',
  'weeksToRelief',
  'truceWeeks',
  'cruelty',
  'mercy',
  'church',
  'noQuarter',
  'sackPressure',
  'gateOpenChance',
  'rationLevel',
  'mercenaryPaidWeeks',
  'mercenaryLeave',
  'speechCheck',
  'endSiege',
] as const;

export type EventEffectKey = (typeof EVENT_EFFECT_KEYS)[number];

const effectValueSchema = z.union([z.number(), z.string(), z.boolean()]);

const eventOptionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  for: z.enum(['vay', 'thu']),
  text: z.string().default(''),
  effects: z.record(z.string(), effectValueSchema).default({}),
});

export type SiegeEventOption = z.infer<typeof eventOptionSchema>;

const eventSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  side: z.enum(['vay', 'thu', 'ca-hai']),
  weight: z.number().min(0),
  when: z.record(z.string(), z.union([z.number(), z.boolean(), z.string()])).default({}),
  text: z.string().min(1),
  options: z.array(eventOptionSchema).min(1),
});

export type SiegeEventDef = z.infer<typeof eventSchema>;

const eventsFileSchema = z.object({
  version: z.number(),
  config: z.object({
    checkId: z.string().min(1),
    weeklyChance: z.number().min(0).max(100),
    minWeekBetween: z.number().int().min(0),
    sameEventCooldown: z.number().int().min(0),
  }),
  events: z.array(eventSchema).min(1),
});

export type EventsConfig = z.infer<typeof eventsFileSchema>['config'];

// ---------------------------------------------------------------------------
// surrender-terms.json
// ---------------------------------------------------------------------------

const termSchema = z.object({
  id: z.string().startsWith('term_'),
  name: z.string().min(1),
  ask: z.enum(['vay', 'thu']),
  group: z.string().min(1),
  weight: z.number().min(0),
  conditional: z.boolean().default(false),
  text: z.string().default(''),
  effects: z.record(z.string(), z.number()).default({}),
});

export type SurrenderTerm = z.infer<typeof termSchema>;

const packageSchema = z.object({
  id: z.string().startsWith('pkg_'),
  name: z.string().min(1),
  by: z.enum(['vay', 'thu']),
  terms: z.array(z.string()).min(1),
  note: z.string().default(''),
});

export type TermPackage = z.infer<typeof packageSchema>;

const parleyModifierSchema = z.object({
  forceRatioPer: z.number(),
  forceRatioCap: z.number(),
  foodWeeksFull: z.number().min(0),
  foodWeeksBonus: z.number(),
  foodWeeksEmpty: z.number().min(0),
  foodEmptyPenalty: z.number(),
  wallBreached: z.number(),
  layerLost: z.number(),
  reliefExpected: z.number(),
  reliefCrushed: z.number(),
  weeksBesiegedPer4: z.number(),
  weeksBesiegedCap: z.number(),
  crueltyPer10: z.number(),
  crueltyFloor: z.number(),
  mercyPer10: z.number(),
  mercyCap: z.number(),
  churchCondemned: z.number(),
  noQuarterDeclared: z.number(),
  starvingGarrison: z.number(),
  plagueInside: z.number(),
});

export type ParleyModifiers = z.infer<typeof parleyModifierSchema>;

const contractConfigSchema = z.object({
  defaultDeadlineWeeks: z.number().int().min(1),
  minDeadlineWeeks: z.number().int().min(1),
  maxDeadlineWeeks: z.number().int().min(1),
  freezesHostilities: z.boolean().default(true),
  reliefArrivesVoids: z.boolean().default(true),
  breakHonor: z.number(),
  breakChurch: z.number(),
  breakCruelty: z.number(),
  keepHonor: z.number(),
  keepMercy: z.number(),
});

export type ContractConfig = z.infer<typeof contractConfigSchema>;

const sackSchema = z.object({
  lootPerPopulation: z.number().min(0),
  lootFromStores: z.number().min(0),
  moraleIfSacked: z.number(),
  moraleIfSpared: z.number(),
  mutinyChanceIfSpared: z.number().min(0).max(100),
  mutinyChancePerSackPressure: z.number().min(0),
  crueltyIfSacked: z.number(),
  mercyIfSpared: z.number(),
  churchIfSacked: z.number(),
  churchIfSpared: z.number(),
  reputationIfSacked: z.number(),
  reputationIfSpared: z.number(),
  localHatredIfSacked: z.number(),
  populationLossIfSacked: z.number().min(0).max(1),
  crueltyStatePath: z.string().min(1),
  mercyStatePath: z.string().min(1),
  crueltyDecayPerYear: z.number().min(0),
});

export type SackConfig = z.infer<typeof sackSchema>;

const parleyConfigSchema = z.object({
  checkId: z.string().min(1),
  domain: z.string().min(1),
  skills: z.array(z.string()).min(1),
  defaultSkill: z.string().min(1),
  baseWithoutSkill: z.number().min(0),
  band: bandSchema,
  refusalCooldownWeeks: z.number().int().min(0),
  modifiers: parleyModifierSchema,
  contract: contractConfigSchema,
});

export type ParleyConfig = z.infer<typeof parleyConfigSchema>;

const termsFileSchema = z.object({
  version: z.number(),
  config: parleyConfigSchema,
  terms: z.array(termSchema).min(1),
  packages: z.array(packageSchema).min(1),
  sack: sackSchema,
});

// ---------------------------------------------------------------------------
// Nạp và kiểm tham chiếu
// ---------------------------------------------------------------------------

interface Loaded {
  config: SiegeConfig;
  templates: Map<string, FortTemplate>;
  rations: Map<string, RationLevel>;
  seasons: Season[];
  layers: Map<string, AssaultLayer>;
  methods: Map<string, AssaultMethod>;
  engineConfig: EngineConfig;
  engines: Map<string, SiegeEngineType>;
  mining: MiningConfig;
  eventsConfig: EventsConfig;
  events: SiegeEventDef[];
  parley: ParleyConfig;
  terms: Map<string, SurrenderTerm>;
  packages: Map<string, TermPackage>;
  sack: SackConfig;
}

function parse<T>(schema: z.ZodType<T>, raw: unknown, file: string): T {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new SiegeDataError(`${file} hỏng ở "${issue?.path.join('.') ?? '?'}": ${issue?.message ?? 'không rõ'}`);
  }
  return parsed.data;
}

function load(): Loaded {
  const forts = parse(fortificationsFileSchema, fortificationsFile, 'data/fortifications.json');
  const engines = parse(enginesFileSchema, enginesFile, 'data/siege-engines.json');
  const events = parse(eventsFileSchema, eventsFile, 'data/siege-events.json');
  const terms = parse(termsFileSchema, termsFile, 'data/surrender-terms.json');

  // --- khẩu phần: phải xếp GIẢM DẦN, vì UI cho người chơi trượt lên xuống theo
  // thứ tự này và một bảng xếp lộn sẽ hiện "cắt khẩu phần" ở phía dư dả.
  const rations = new Map<string, RationLevel>();
  let previousFactor = Number.POSITIVE_INFINITY;
  for (const row of forts.config.rations) {
    if (rations.has(row.id)) throw new SiegeDataError(`khẩu phần trùng id: ${row.id}`);
    if (row.factor >= previousFactor) {
      throw new SiegeDataError(`bảng khẩu phần phải xếp giảm dần, "${row.id}" phá thứ tự`);
    }
    previousFactor = row.factor;
    rations.set(row.id, row);
  }

  const engineById = new Map<string, SiegeEngineType>();
  for (const engine of engines.engines) {
    if (engineById.has(engine.id)) throw new SiegeDataError(`máy công thành trùng id: ${engine.id}`);
    // Một cỗ máy không phá được tường, không phá được cổng, không giết được ai và
    // không dùng được lúc tổng công là một dòng data không bao giờ có tác dụng gì.
    const useless =
      engine.wallDamage === 0 &&
      engine.gateDamage === 0 &&
      engine.antiPersonnel === 0 &&
      engine.moraleDamage === 0 &&
      !engine.tags.includes('tong-cong');
    if (useless) throw new SiegeDataError(`máy "${engine.id}" không làm được gì trong cả hai giai đoạn`);
    engineById.set(engine.id, engine);
  }

  const layerById = new Map<string, AssaultLayer>();
  for (const layer of forts.config.assault.layers) {
    if (layerById.has(layer.id)) throw new SiegeDataError(`lớp tổng công trùng id: ${layer.id}`);
    layerById.set(layer.id, layer);
  }

  const methodById = new Map<string, AssaultMethod>();
  for (const method of forts.config.assault.methods) {
    if (methodById.has(method.id)) throw new SiegeDataError(`cách tổng công trùng id: ${method.id}`);
    if (!layerById.has(method.layer)) {
      throw new SiegeDataError(`cách "${method.id}" trỏ lớp "${method.layer}" không có trong assault.layers`);
    }
    // KIỂM CHÉO HAI FILE. Một cách đánh đòi một cỗ máy không tồn tại thì cả nhánh
    // ấy im lặng biến mất khỏi bảng hành động, và người chơi sẽ không bao giờ biết
    // vì sao "tháp công thành" không hiện lên.
    if (method.requiresEngine !== '' && !engineById.has(method.requiresEngine)) {
      throw new SiegeDataError(
        `cách "${method.id}" đòi máy "${method.requiresEngine}" không có trong siege-engines.json`,
      );
    }
    methodById.set(method.id, method);
  }

  const templates = new Map<string, FortTemplate>();
  for (const template of forts.templates) {
    if (templates.has(template.id)) throw new SiegeDataError(`khuôn công sự trùng id: ${template.id}`);
    // Tường trong PHẢI thấp hơn hoặc cao hơn tường ngoài thì tùy, nhưng kho của
    // tháp chính không được lớn hơn kho cả thành — nếu không thì lùi vào tháp lại
    // thành một nước đi có lợi về lương thực, và mục 2 nói ngược lại.
    if (template.keep.stores > template.supplies.food) {
      throw new SiegeDataError(`khuôn "${template.id}": kho tháp chính lớn hơn cả kho thành`);
    }
    templates.set(template.id, template);
  }

  const conditionKeys = new Set<string>(EVENT_CONDITION_KEYS);
  const effectKeys = new Set<string>(EVENT_EFFECT_KEYS);
  const eventIds = new Set<string>();
  for (const event of events.events) {
    if (eventIds.has(event.id)) throw new SiegeDataError(`sự kiện trùng id: ${event.id}`);
    eventIds.add(event.id);
    for (const key of Object.keys(event.when)) {
      if (key.startsWith('$')) continue;
      if (!conditionKeys.has(key)) throw new SiegeDataError(`sự kiện "${event.id}" khai điều kiện lạ: "${key}"`);
    }
    for (const option of event.options) {
      for (const key of Object.keys(option.effects)) {
        if (key.startsWith('$')) continue;
        if (!effectKeys.has(key)) {
          throw new SiegeDataError(`sự kiện "${event.id}", lựa chọn "${option.id}" khai hiệu ứng lạ: "${key}"`);
        }
      }
      const ration = option.effects['rationLevel'];
      if (typeof ration === 'string' && !rations.has(ration)) {
        throw new SiegeDataError(`sự kiện "${event.id}" đặt khẩu phần "${ration}" chưa khai`);
      }
    }
  }

  const termById = new Map<string, SurrenderTerm>();
  for (const term of terms.terms) {
    if (termById.has(term.id)) throw new SiegeDataError(`điều khoản trùng id: ${term.id}`);
    termById.set(term.id, term);
  }

  const packageById = new Map<string, TermPackage>();
  for (const bundle of terms.packages) {
    if (packageById.has(bundle.id)) throw new SiegeDataError(`gói điều khoản trùng id: ${bundle.id}`);
    for (const id of bundle.terms) {
      if (!termById.has(id)) throw new SiegeDataError(`gói "${bundle.id}" trỏ điều khoản "${id}" chưa khai`);
    }
    packageById.set(bundle.id, bundle);
  }

  if (!termById.has(terms.config.defaultSkill) && !terms.config.skills.includes(terms.config.defaultSkill)) {
    throw new SiegeDataError(`kỹ năng đàm phán mặc định "${terms.config.defaultSkill}" không nằm trong danh sách`);
  }
  if (!terms.terms.some((term) => term.conditional)) {
    throw new SiegeDataError('surrender-terms.json không có điều khoản nào là khế ước có điều kiện (mục 5)');
  }

  return {
    config: forts.config,
    templates,
    rations,
    seasons: forts.config.seasons,
    layers: layerById,
    methods: methodById,
    engineConfig: engines.config,
    engines: engineById,
    mining: engines.mining,
    eventsConfig: events.config,
    events: events.events,
    parley: terms.config,
    terms: termById,
    packages: packageById,
    sack: terms.sack,
  };
}

const DATA = load();

// ---------------------------------------------------------------------------
// Đọc
// ---------------------------------------------------------------------------

export function siegeConfig(): SiegeConfig {
  return DATA.config;
}

export function assaultConfig(): AssaultConfig {
  return DATA.config.assault;
}

export function allFortTemplates(): FortTemplate[] {
  return [...DATA.templates.values()];
}

export function fortTemplateOf(id: string): FortTemplate | null {
  return DATA.templates.get(id) ?? null;
}

export function allRations(): RationLevel[] {
  return [...DATA.rations.values()];
}

export function rationOf(id: string): RationLevel {
  const found = DATA.rations.get(id);
  if (found !== undefined) return found;
  const first = DATA.config.rations[0];
  if (first === undefined) throw new SiegeDataError('data/fortifications.json không khai khẩu phần nào');
  return first;
}

export function allSeasons(): Season[] {
  return DATA.seasons;
}

export function seasonOf(id: string): Season {
  const found = DATA.seasons.find((season) => season.id === id);
  if (found !== undefined) return found;
  const first = DATA.seasons[0];
  if (first === undefined) throw new SiegeDataError('data/fortifications.json không khai mùa nào');
  return first;
}

/** Mùa kế tiếp trong vòng xoay bốn mùa. */
export function nextSeason(id: string): Season {
  const index = DATA.seasons.findIndex((season) => season.id === id);
  const next = DATA.seasons[(index + 1) % DATA.seasons.length];
  if (next === undefined) throw new SiegeDataError('bảng mùa rỗng');
  return next;
}

export function assaultLayers(): AssaultLayer[] {
  return [...DATA.layers.values()];
}

export function assaultLayerOf(id: string): AssaultLayer | null {
  return DATA.layers.get(id) ?? null;
}

export function assaultMethods(): AssaultMethod[] {
  return [...DATA.methods.values()];
}

export function assaultMethodOf(id: string): AssaultMethod | null {
  return DATA.methods.get(id) ?? null;
}

export function engineConfig(): EngineConfig {
  return DATA.engineConfig;
}

export function allEngineTypes(): SiegeEngineType[] {
  return [...DATA.engines.values()];
}

export function engineTypeOf(id: string): SiegeEngineType | null {
  return DATA.engines.get(id) ?? null;
}

export function miningConfig(): MiningConfig {
  return DATA.mining;
}

export function counterMineConfig(): CounterMineConfig {
  return DATA.mining.counterMine;
}

export function eventsConfig(): EventsConfig {
  return DATA.eventsConfig;
}

export function allSiegeEvents(): SiegeEventDef[] {
  return DATA.events;
}

export function parleyConfig(): ParleyConfig {
  return DATA.parley;
}

export function allTerms(): SurrenderTerm[] {
  return [...DATA.terms.values()];
}

export function termOf(id: string): SurrenderTerm | null {
  return DATA.terms.get(id) ?? null;
}

export function allPackages(): TermPackage[] {
  return [...DATA.packages.values()];
}

export function packageOf(id: string): TermPackage | null {
  return DATA.packages.get(id) ?? null;
}

export function sackConfig(): SackConfig {
  return DATA.sack;
}

/** Bậc độ khó của phép kiểm dịch bệnh, suy từ số người trong trại (mục 3). */
export function crowdingBand(men: number): DifficultyBand {
  for (const row of DATA.config.disease.crowdingBand) {
    if (men <= row.upTo) return row.band;
  }
  return DATA.config.disease.crowdingAboveBand;
}

/** Đội thợ chủng tộc này đào nhanh hơn bao nhiêu, thang d100 (mục 3). */
export function minerBonus(raceId: string): number {
  return DATA.mining.skilledRaces[raceId] ?? 0;
}
