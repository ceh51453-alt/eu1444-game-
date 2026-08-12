/**
 * NẠP BỐN FILE DATA CỦA PHẦN 10 (mục 15.1) theo R5.
 *
 * `units.json` · `formations.json` · `terrain.json` · `weather.json`
 *
 * Kiểm THAM CHIẾU lúc nạp chứ không chỉ kiểm hình dạng, đúng khuôn `duel/data.ts`
 * của Phần 9: một đơn vị khai đội hình không tồn tại, một dòng khắc chế trỏ tới
 * nhãn chưa khai, một chiến trường rắc địa hình lạ — cả ba đều là loại lỗi chỉ
 * hiện ra giữa trận, dưới dạng "vì sao hàng giáo này không chặn được kỵ binh".
 * Nổ ở đây, lúc khởi động.
 *
 * MỌI CON SỐ ĐIỀU CHỈNH THEO THANG d100, DƯƠNG LÀ LỢI. Chúng đi qua
 * `scaleToSystem` của Phần 5 mục 7 để đổi sang số viên xúc sắc của hệ pool. Phần
 * 10 KHÔNG được có bảng quy đổi riêng — nếu có thì "bùn lầy" ở dã chiến sẽ nặng
 * khác "bùn lầy" ở công thành mà không ai cố ý thiết kế thế.
 *
 * TẦM VÀ TỐC ĐỘ KHAI BẰNG MÉT, không bằng ô. Mục 2 cấm thẳng: "Không được ghi
 * thẳng 'cung bắn 6 ô'" — cỡ ô đổi theo quy mô trận, nên một con số ô là một con
 * số sai ở mọi trận trừ đúng một cỡ.
 */

import { z } from 'zod';
import unitsFile from '@data/units.json';
import formationsFile from '@data/formations.json';
import terrainFile from '@data/terrain.json';
import weatherFile from '@data/weather.json';
import { DIFFICULTY_BANDS } from '@/systems/check/difficulty';
import type { DifficultyBand } from '@/core/turn';

export class BattleDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BattleDataError';
  }
}

const bandSchema = z.enum(DIFFICULTY_BANDS as readonly [DifficultyBand, ...DifficultyBand[]]);

// ---------------------------------------------------------------------------
// units.json
// ---------------------------------------------------------------------------

export const COMMAND_SCOPES = [
  'don-vi',
  'phan-doi',
  'canh',
  'canh-va-du-bi',
  'toan-quan',
  'toan-quan-chien-luoc',
] as const;
export type CommandScope = (typeof COMMAND_SCOPES)[number];

const tagSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  note: z.string().default(''),
});

const counterSchema = z.object({
  when: z.string().min(1),
  against: z.string().min(1),
  /** Điều chỉnh cho bên mang nhãn `when`, thang d100. */
  self: z.number().default(0),
  /** Điều chỉnh cho bên kia, thang d100. */
  other: z.number().default(0),
  /**
   * Luật chỉ chạy khi đội hình của bên `when` có trường này khác 0.
   * `vsCavalry` cho hàng giáo: giáo dài chỉ khắc kỵ binh khi ĐỘI HÌNH CÒN ĐỨNG.
   */
  requiresFormationTag: z.string().default(''),
  note: z.string().default(''),
});

export type Counter = z.infer<typeof counterSchema>;

const commandRowSchema = z.object({
  titleId: z.string().min(1),
  name: z.string().min(1),
  rank: z.number().int().min(0),
  scope: z.enum(COMMAND_SCOPES),
  /** Số đơn vị cầm được khi `scope` là `don-vi` hoặc `phan-doi`. 0 = không giới hạn theo số. */
  units: z.number().int().min(0).default(0),
  mustObey: z.boolean().default(true),
  note: z.string().default(''),
});

export type CommandRow = z.infer<typeof commandRowSchema>;

const unitTypeSchema = z.object({
  id: z.string().startsWith('unit_'),
  name: z.string().min(1),
  /** Thế lực dùng được. `*` là ai cũng thuê được. */
  factions: z.array(z.string()).default(['*']),
  races: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  standardStrength: z.number().int().min(1),
  quality: z.number().int().min(1).max(5),
  /** Thang 0–10, đổ vào số viên xúc sắc. */
  attack: z.number().min(0).max(10),
  /** Thang 0–10, đổ vào điểm phòng thủ gộp → số thành công cần. */
  defence: z.number().min(0).max(10),
  armor: z.number().min(0).max(5).default(0),
  /** MÉT. 0 nghĩa là không bắn được. */
  rangeMeters: z.number().min(0).default(0),
  ammo: z.number().int().min(0).default(0),
  /** MÉT một vòng. */
  speedMeters: z.number().min(0),
  /** Vế "(loại đơn vị)" của công thức điểm khởi động ở mục 4. */
  initiative: z.number().default(0),
  moraleBase: z.number().min(0).max(100).default(60),
  formations: z.array(z.string()).min(1),
  upkeep: z.number().min(0).default(0),
  hire: z.number().min(0).default(0),
  requires: z.string().default(''),
  note: z.string().default(''),
});

export type UnitType = z.infer<typeof unitTypeSchema>;

const configSchema = z.object({
  roundMinutes: z.number().min(0.1).default(2),
  pool: z.object({
    strengthDice: z.number().min(0),
    qualityCenter: z.number(),
    chargeBonusDice: z.number(),
    maxDice: z.number().int().min(1),
  }),
  defence: z.object({
    bands: z.array(z.object({ upTo: z.number(), band: bandSchema })).min(1),
    aboveBand: bandSchema,
  }),
  casualties: z.object({
    baseRatio: z.number().min(0).max(1),
    byTier: z.object({
      critSuccess: z.number().min(0),
      success: z.number().min(0),
      costlySuccess: z.number().min(0),
      fail: z.number().min(0),
      critFail: z.number().min(0),
    }),
    riposteRatio: z.number().min(0),
    rangedRiposte: z.number().min(0),
    flankMultiplier: z.number().min(1),
    rearMultiplier: z.number().min(1),
    moralePerLossPercent: z.number().min(0),
    fatiguePerExchange: z.number().min(0),
    cohesionPerExchange: z.number().min(0),
  }),
  initiative: z.object({
    moraleDivisor: z.number().min(1),
    fatigueDivisor: z.number().min(1),
    disorderDivisor: z.number().min(1),
    holdBonus: z.number(),
  }),
  morale: z.object({
    states: z
      .array(z.object({ id: z.string().min(1), name: z.string().min(1), atLeast: z.number().min(0).max(100) }))
      .min(2),
    disbandName: z.string().min(1),
    checkBelow: z.number().min(0).max(100),
    commanderDeath: z.number().min(0),
    neighbourRout: z.number().min(0),
    flanked: z.number().min(0),
    rear: z.number().min(0),
    outnumbered: z.number().min(0),
    underFire: z.number().min(0),
    terror: z.number().min(0),
    /** Đợt xung phong gãy trước một đội hình chống kỵ — cú sốc của mục 7. */
    chargeRepulsed: z.number().min(0),
    wonMelee: z.number().min(0),
    commanderNear: z.number().min(0),
    highGround: z.number().min(0),
    restRecover: z.number().min(0),
    panicMeters: z.number().min(0),
    panicCascadeRounds: z.number().int().min(1),
    routMoveBonus: z.number().min(0),
    disbandAfterRounds: z.number().int().min(1),
  }),
  pursuit: z.object({
    baseRatio: z.number().min(0).max(1),
    cavalryRatio: z.number().min(0).max(1),
    prisonerRatio: z.number().min(0).max(1),
    nobleRatio: z.number().min(0).max(1),
    nightPenalty: z.number().min(0).max(1),
  }),
  ransom: z.object({
    perNoble: z.number().min(0),
    perSoldier: z.number().min(0),
    lootPerEnemyLost: z.number().min(0),
  }),
  command: z.object({
    preDivisor: z.number().min(0.1),
    loyaltyDivisor: z.number().min(0.1),
    rangeMeters: z.number().min(1),
    outOfRangePenalty: z.number().min(0),
  }),
});

export type BattleConfig = z.infer<typeof configSchema>;

const unitsFileSchema = z.object({
  version: z.number(),
  config: configSchema,
  tags: z.array(tagSchema).min(1),
  counters: z.array(counterSchema),
  command: z.array(commandRowSchema).min(1),
  units: z.array(unitTypeSchema).min(1),
});

// ---------------------------------------------------------------------------
// formations.json
// ---------------------------------------------------------------------------

const formationSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  /** Nhãn đơn vị BẮT BUỘC phải có mới xếp được đội hình này. Rỗng là ai cũng xếp được. */
  requiresTag: z.string().default(''),
  /** Số đơn vị địch đánh được cùng lúc. */
  frontage: z.number().int().min(1).default(1),
  attack: z.number().default(0),
  defence: z.number().default(0),
  /** Cộng riêng khi đang xung phong. */
  charge: z.number().default(0),
  /** Cộng riêng cho đòn đẩy của khối sâu. */
  push: z.number().default(0),
  /** Cộng khi bên KIA là kỵ binh xung phong. Đây là vế cứng của luật giáo dài. */
  vsCavalry: z.number().default(0),
  /** HỆ SỐ NHÂN vào thương vong do tên đạn. */
  rangedVulnerability: z.number().min(0).default(1),
  moveBonus: z.number().default(0),
  /** Cohesion hồi lại mỗi vòng khi đứng yên trong đội hình này. */
  cohesionKeep: z.number().min(0).default(0),
  /** Cohesion mất ngay sau khi chạm địch — nêm mất đội hình sau cú xuyên phá. */
  cohesionAfterContact: z.number().min(0).default(0),
  /** Không di chuyển được. Vòng giáo đứng im và chết vì tên. */
  immobile: z.boolean().default(false),
  note: z.string().default(''),
});

export type Formation = z.infer<typeof formationSchema>;

const formationsFileSchema = z.object({
  version: z.number(),
  formations: z.array(formationSchema).min(1),
  change: z.object({
    cohesionCost: z.number().min(0),
    nearEnemyExtraCost: z.number().min(0),
    nearEnemyMeters: z.number().min(0),
    staminaCost: z.number().min(0),
    endsTurn: z.boolean().default(true),
  }),
});

export type FormationChange = z.infer<typeof formationsFileSchema>['change'];

// ---------------------------------------------------------------------------
// terrain.json
// ---------------------------------------------------------------------------

const gridConfigSchema = z.object({
  sideBase: z.number().min(1),
  sideRefTroops: z.number().min(1),
  sideExponent: z.number().min(0),
  sideMin: z.number().int().min(3),
  sideMax: z.number().int().min(3),
  cellBaseMeters: z.number().min(1),
  cellExponent: z.number().min(0),
  cellMinMeters: z.number().min(1),
  cellMaxMeters: z.number().min(1),
  piecesBase: z.number().min(1),
  piecesRefTroops: z.number().min(1),
  piecesExponent: z.number().min(0),
  piecesMin: z.number().int().min(1),
  piecesMax: z.number().int().min(1),
  /** Khoảng cách dàn trận giữa hai đạo quân, tính bằng MÉT. */
  deployMeters: z.number().min(1),
});

export type GridConfig = z.infer<typeof gridConfigSchema>;

const battleTerrainSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  moveCost: z.number().min(1),
  passable: z.boolean().default(true),
  attack: z.number().default(0),
  defence: z.number().default(0),
  ranged: z.number().default(0),
  elevation: z.number().default(0),
  /** Phạt/thưởng riêng cho đơn vị mang nhãn `ky-binh`. */
  cavalry: z.number().default(0),
  /** Phạt riêng cho đơn vị mang nhãn `giap-nang`. */
  heavy: z.number().default(0),
  cohesionDrain: z.number().min(0).default(0),
  staminaExtra: z.number().min(0).default(0),
  /** % che khuất, giảm tầm nhìn xuyên qua ô. */
  concealment: z.number().min(0).max(100).default(0),
  /** 0 = không thắt cổ chai. >0 = số đơn vị đánh qua được cùng lúc. */
  frontage: z.number().int().min(0).default(0),
  moveBonus: z.number().default(0),
  note: z.string().default(''),
});

export type BattleTerrain = z.infer<typeof battleTerrainSchema>;

const featureSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('band'),
    terrain: z.string().min(1),
    edge: z.enum(['bac', 'nam', 'dong', 'tay']),
    /** Bề dày theo TỶ LỆ cạnh lưới, vì lưới co giãn theo quy mô trận. */
    depth: z.number().min(0).max(1),
  }),
  z.object({
    kind: z.literal('river'),
    terrain: z.string().min(1),
    crossingTerrain: z.string().min(1),
    crossings: z.number().int().min(1).default(1),
  }),
  z.object({
    kind: z.literal('patch'),
    terrain: z.string().min(1),
    count: z.number().int().min(1),
    radius: z.number().min(0).max(1),
  }),
]);

export type FieldFeature = z.infer<typeof featureSchema>;

const fieldSchema = z.object({
  id: z.string().startsWith('field_'),
  name: z.string().min(1),
  default: z.boolean().default(false),
  weights: z.record(z.string(), z.number().min(0)),
  features: z.array(featureSchema).default([]),
  note: z.string().default(''),
});

export type BattlefieldTemplate = z.infer<typeof fieldSchema>;

const terrainFileSchema = z.object({
  version: z.number(),
  grid: gridConfigSchema,
  terrain: z.array(battleTerrainSchema).min(1),
  fields: z.array(fieldSchema).min(1),
});

// ---------------------------------------------------------------------------
// weather.json
// ---------------------------------------------------------------------------

const weatherSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  default: z.boolean().default(false),
  ranged: z.number().default(0),
  /** HỆ SỐ NHÂN vào tầm nhìn. 1 là bình thường. */
  sightFactor: z.number().min(0).default(1),
  /** HỆ SỐ NHÂN vào tầm lệnh của chỉ huy. */
  commandFactor: z.number().min(0).default(1),
  initiative: z.number().default(0),
  moveExtra: z.number().min(0).default(0),
  fatigueExtra: z.number().min(0).default(0),
  heavyFatigueExtra: z.number().min(0).default(0),
  cohesionDrain: z.number().min(0).default(0),
  moraleDrain: z.number().min(0).default(0),
  note: z.string().default(''),
});

export type Weather = z.infer<typeof weatherSchema>;

const timeOfDaySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  default: z.boolean().default(false),
  night: z.boolean().default(false),
  /** Bình minh — cửa đóng lại của quân Huyết Tộc (mục 9b). */
  dawn: z.boolean().default(false),
  sightFactor: z.number().min(0).default(1),
  commandFactor: z.number().min(0).default(1),
  initiative: z.number().default(0),
  ranged: z.number().default(0),
  cohesionDrain: z.number().min(0).default(0),
  note: z.string().default(''),
});

export type TimeOfDay = z.infer<typeof timeOfDaySchema>;

const weatherFileSchema = z.object({
  version: z.number(),
  weather: z.array(weatherSchema).min(1),
  timesOfDay: z.array(timeOfDaySchema).min(1),
  nightVisionTag: z.string().min(1),
  noDaylightPursuitTag: z.string().min(1),
});

// ---------------------------------------------------------------------------
// Nạp và kiểm tham chiếu
// ---------------------------------------------------------------------------

interface Loaded {
  config: BattleConfig;
  grid: GridConfig;
  change: FormationChange;
  nightVisionTag: string;
  noDaylightPursuitTag: string;
  counters: readonly Counter[];
  tagName: Map<string, string>;
  typeById: Map<string, UnitType>;
  formationById: Map<string, Formation>;
  terrainById: Map<string, BattleTerrain>;
  fieldById: Map<string, BattlefieldTemplate>;
  weatherById: Map<string, Weather>;
  timeById: Map<string, TimeOfDay>;
  commandByTitle: Map<string, CommandRow>;
}

function parse<T>(schema: z.ZodType<T>, raw: unknown, file: string): T {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new BattleDataError(`${file} hỏng ở "${issue?.path.join('.') ?? '?'}": ${issue?.message ?? 'không rõ'}`);
  }
  return parsed.data;
}

function load(): Loaded {
  const units = parse(unitsFileSchema, unitsFile, 'data/units.json');
  const formations = parse(formationsFileSchema, formationsFile, 'data/formations.json');
  const terrain = parse(terrainFileSchema, terrainFile, 'data/terrain.json');
  const weather = parse(weatherFileSchema, weatherFile, 'data/weather.json');

  const tagName = new Map(units.tags.map((tag) => [tag.id, tag.name] as const));

  const formationById = new Map<string, Formation>();
  for (const formation of formations.formations) {
    if (formationById.has(formation.id)) throw new BattleDataError(`đội hình trùng id: ${formation.id}`);
    if (formation.requiresTag !== '' && !tagName.has(formation.requiresTag)) {
      throw new BattleDataError(`đội hình "${formation.id}" đòi nhãn "${formation.requiresTag}" chưa khai trong units.json`);
    }
    formationById.set(formation.id, formation);
  }

  const typeById = new Map<string, UnitType>();
  for (const type of units.units) {
    if (typeById.has(type.id)) throw new BattleDataError(`binh chủng trùng id: ${type.id}`);
    for (const tag of type.tags) {
      if (!tagName.has(tag)) {
        throw new BattleDataError(`binh chủng "${type.id}" mang nhãn "${tag}" không có trong từ vựng`);
      }
    }
    for (const id of type.formations) {
      const formation = formationById.get(id);
      if (formation === undefined) {
        throw new BattleDataError(`binh chủng "${type.id}" khai đội hình "${id}" không có trong formations.json`);
      }
      // Một khối giáo khai được xếp "nêm" là một dòng data không bao giờ chạy —
      // và người cân bằng sẽ tin rằng nó chạy.
      if (formation.requiresTag !== '' && !type.tags.includes(formation.requiresTag)) {
        throw new BattleDataError(
          `binh chủng "${type.id}" khai đội hình "${id}" nhưng thiếu nhãn bắt buộc "${formation.requiresTag}"`,
        );
      }
    }
    // Đơn vị có tầm mà không có đạn thì bắn đúng không lần nào.
    if (type.rangeMeters > 0 && type.ammo === 0) {
      throw new BattleDataError(`binh chủng "${type.id}" khai tầm bắn ${String(type.rangeMeters)}m nhưng không có đạn`);
    }
    typeById.set(type.id, type);
  }

  // `against` được phép là một NHÃN hoặc một ĐỘI HÌNH.
  //
  // Vế hai của mục 7 — "cung thủ khắc KHỐI BỘ BINH SÂU ĐỨNG YÊN" — nói về cách
  // người ta đang đứng, không về họ là ai: cùng một khối giáo Lùn, dàn hàng ngang
  // thì không còn là mồi cho cung thủ nữa. Bắt `against` phải là nhãn binh chủng
  // sẽ làm cả vế ấy không diễn đạt được, và người cân bằng sẽ phải bịa ra một
  // nhãn giả gắn cứng vào binh chủng — tức là mất đúng cái quyết định chiến thuật
  // mà mục 6 dựng cả một bảng đội hình để tạo ra.
  for (const row of units.counters) {
    if (!tagName.has(row.when)) throw new BattleDataError(`khắc chế: nhãn "${row.when}" không có trong từ vựng`);
    if (!tagName.has(row.against) && !formationById.has(row.against)) {
      throw new BattleDataError(`khắc chế: "${row.against}" không phải nhãn cũng không phải đội hình`);
    }
  }

  const commandByTitle = new Map<string, CommandRow>();
  for (const row of units.command) {
    if (commandByTitle.has(row.titleId)) throw new BattleDataError(`thang chỉ huy trùng tước vị: ${row.titleId}`);
    commandByTitle.set(row.titleId, row);
  }

  const terrainById = new Map<string, BattleTerrain>();
  for (const row of terrain.terrain) {
    if (terrainById.has(row.id)) throw new BattleDataError(`địa hình trùng id: ${row.id}`);
    terrainById.set(row.id, row);
  }

  const fieldById = new Map<string, BattlefieldTemplate>();
  for (const field of terrain.fields) {
    if (fieldById.has(field.id)) throw new BattleDataError(`chiến trường trùng id: ${field.id}`);
    for (const id of Object.keys(field.weights)) {
      if (!terrainById.has(id)) throw new BattleDataError(`chiến trường "${field.id}" rắc địa hình "${id}" chưa khai`);
    }
    for (const feature of field.features) {
      if (!terrainById.has(feature.terrain)) {
        throw new BattleDataError(`chiến trường "${field.id}" đặt địa hình "${feature.terrain}" chưa khai`);
      }
      if (feature.kind === 'river' && !terrainById.has(feature.crossingTerrain)) {
        throw new BattleDataError(`chiến trường "${field.id}" đặt chỗ qua sông "${feature.crossingTerrain}" chưa khai`);
      }
    }
    fieldById.set(field.id, field);
  }
  if (!terrain.fields.some((field) => field.default)) {
    throw new BattleDataError('data/terrain.json không có chiến trường nào đánh dấu `default`');
  }

  const weatherById = new Map(weather.weather.map((row) => [row.id, row] as const));
  const timeById = new Map(weather.timesOfDay.map((row) => [row.id, row] as const));
  if (!weather.weather.some((row) => row.default)) {
    throw new BattleDataError('data/weather.json không có thời tiết nào đánh dấu `default`');
  }
  if (!weather.timesOfDay.some((row) => row.default)) {
    throw new BattleDataError('data/weather.json không có thời điểm nào đánh dấu `default`');
  }
  if (!tagName.has(weather.nightVisionTag)) {
    throw new BattleDataError(`data/weather.json trỏ nhãn nhìn đêm "${weather.nightVisionTag}" chưa khai trong units.json`);
  }
  if (!tagName.has(weather.noDaylightPursuitTag)) {
    throw new BattleDataError(
      `data/weather.json trỏ nhãn "${weather.noDaylightPursuitTag}" chưa khai trong units.json`,
    );
  }

  // Trạng thái sĩ khí phải xếp GIẢM DẦN: `moraleState` đọc từ trên xuống và trả
  // về trạng thái đầu tiên khớp, nên một bảng xếp lộn sẽ cho mọi đơn vị cùng một
  // trạng thái mà không có gì nổ.
  let previous = 101;
  for (const state of units.config.morale.states) {
    if (state.atLeast >= previous) {
      throw new BattleDataError(`bảng trạng thái sĩ khí phải xếp giảm dần, "${state.id}" phá thứ tự`);
    }
    previous = state.atLeast;
  }

  return {
    config: units.config,
    grid: terrain.grid,
    change: formations.change,
    nightVisionTag: weather.nightVisionTag,
    noDaylightPursuitTag: weather.noDaylightPursuitTag,
    counters: units.counters,
    tagName,
    typeById,
    formationById,
    terrainById,
    fieldById,
    weatherById,
    timeById,
    commandByTitle,
  };
}

const DATA = load();

// ---------------------------------------------------------------------------
// Đọc
// ---------------------------------------------------------------------------

export function battleConfig(): BattleConfig {
  return DATA.config;
}

export function gridConfig(): GridConfig {
  return DATA.grid;
}

export function formationChange(): FormationChange {
  return DATA.change;
}

export function nightVisionTag(): string {
  return DATA.nightVisionTag;
}

export function noDaylightPursuitTag(): string {
  return DATA.noDaylightPursuitTag;
}

export function counterRows(): readonly Counter[] {
  return DATA.counters;
}

export function tagName(id: string): string {
  return DATA.tagName.get(id) ?? id;
}

export function allUnitTypes(): UnitType[] {
  return [...DATA.typeById.values()];
}

export function unitTypeOf(id: string): UnitType | null {
  return DATA.typeById.get(id) ?? null;
}

export function unitTypesFor(faction: string): UnitType[] {
  return allUnitTypes().filter((type) => type.factions.includes('*') || type.factions.includes(faction));
}

export function allFormations(): Formation[] {
  return [...DATA.formationById.values()];
}

export function formationOf(id: string): Formation | null {
  return DATA.formationById.get(id) ?? null;
}

export function formationName(id: string): string {
  return DATA.formationById.get(id)?.name ?? id;
}

export function allBattleTerrain(): BattleTerrain[] {
  return [...DATA.terrainById.values()];
}

export function battleTerrainOf(id: string): BattleTerrain | null {
  return DATA.terrainById.get(id) ?? null;
}

export function allFields(): BattlefieldTemplate[] {
  return [...DATA.fieldById.values()];
}

export function fieldOf(id: string): BattlefieldTemplate | null {
  return DATA.fieldById.get(id) ?? null;
}

export function defaultField(): BattlefieldTemplate {
  const found = allFields().find((field) => field.default);
  if (found === undefined) throw new BattleDataError('không có chiến trường mặc định');
  return found;
}

export function allWeather(): Weather[] {
  return [...DATA.weatherById.values()];
}

export function weatherOf(id: string): Weather | null {
  return DATA.weatherById.get(id) ?? null;
}

export function defaultWeather(): Weather {
  const found = allWeather().find((row) => row.default);
  if (found === undefined) throw new BattleDataError('không có thời tiết mặc định');
  return found;
}

export function allTimesOfDay(): TimeOfDay[] {
  return [...DATA.timeById.values()];
}

export function timeOfDayOf(id: string): TimeOfDay | null {
  return DATA.timeById.get(id) ?? null;
}

export function defaultTimeOfDay(): TimeOfDay {
  const found = allTimesOfDay().find((row) => row.default);
  if (found === undefined) throw new BattleDataError('không có thời điểm mặc định');
  return found;
}

export function commandRows(): CommandRow[] {
  return [...DATA.commandByTitle.values()].sort((left, right) => left.rank - right.rank);
}

/**
 * Quyền chỉ huy của một tước vị (mục 3).
 *
 * Tước vị KHÔNG do Phần 10 sở hữu — Phần 13 dựng thang thật và sẽ viết lại
 * `data/titles.json`. Bảng ở `units.json` là vế QUÂN SỰ của thang đó: nó chỉ trả
 * lời đúng một câu hỏi, "ra trận thì cầm được bao nhiêu quân". Tước vị lạ rơi về
 * bậc thấp nhất chứ không nổ, vì Phần 13 sẽ thêm bậc mà Phần 10 chưa biết.
 */
export function commandOf(titleId: string): CommandRow {
  const found = DATA.commandByTitle.get(titleId);
  if (found !== undefined) return found;
  const lowest = commandRows()[0];
  if (lowest === undefined) throw new BattleDataError('data/units.json không khai thang chỉ huy nào');
  return lowest;
}

/** Số thành công cần, suy từ điểm phòng thủ gộp (mục 10). */
export function defenceBand(score: number): DifficultyBand {
  for (const row of DATA.config.defence.bands) {
    if (score <= row.upTo) return row.band;
  }
  return DATA.config.defence.aboveBand;
}
