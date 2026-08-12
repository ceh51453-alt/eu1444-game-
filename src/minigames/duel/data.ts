/**
 * NẠP `data/duel-matrix.json` VÀ `data/arenas.json` (Phần 9 mục 12.1) theo R5.
 *
 * Cả hai file đều được kiểm THAM CHIẾU lúc nạp, không chỉ kiểm hình dạng: một
 * hành động khai `speed: "nhanhh"`, một dòng ma trận trỏ tới nhãn không có
 * trong từ vựng, một đấu trường rắc địa hình chưa khai — cả ba đều là loại lỗi
 * chỉ hiện ra giữa một trận đấu, dưới dạng "vì sao đòn này không cộng gì cả".
 * Nổ ở đây, lúc khởi động, đúng như `skills/nodes.ts` của Phần 8 làm.
 *
 * MỌI CON SỐ ĐIỀU CHỈNH TRONG HAI FILE NÀY THEO THANG d100, dương là dễ hơn.
 * Chúng đi qua `scaleToSystem` của Phần 5 mục 7 để đổi sang DC của d20. Đó là
 * hợp đồng chung với thương tích (P7), kỹ năng (P8) và trang bị (P16) — Phần 9
 * không được có bảng quy đổi riêng.
 */

import { z } from 'zod';
import matrixFile from '@data/duel-matrix.json';
import arenasFile from '@data/arenas.json';
import { DIFFICULTY_BANDS } from '@/systems/check/difficulty';
import type { DifficultyBand } from '@/core/turn';

export class DuelDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DuelDataError';
  }
}

// ---------------------------------------------------------------------------
// duel-matrix.json
// ---------------------------------------------------------------------------

export const SPEED_IDS = ['nhanh', 'vua', 'cham'] as const;
export type SpeedId = (typeof SPEED_IDS)[number];

export const ACTION_CATEGORIES = ['di-chuyen', 'tan-cong', 'phong-thu', 'the', 'dac-biet', 'ky-thuat'] as const;
export type ActionCategory = (typeof ACTION_CATEGORIES)[number];

const bandSchema = z.enum(DIFFICULTY_BANDS as readonly [DifficultyBand, ...DifficultyBand[]]);

const moveSchema = z.object({
  /** Số ô đi theo hướng mặt. Âm là lùi. */
  forward: z.number().default(0),
  /** Số ô đi ngang; dương là sang phải theo hướng mặt. */
  strafe: z.number().default(0),
  /** `free` nghĩa là người chơi tự chọn hướng quay. */
  turn: z.literal('free').optional(),
  /** Quay mặt về phía đối thủ sau khi di chuyển xong. */
  faceEnemy: z.boolean().default(false),
});

const reachSchema = z.union([z.literal('$weapon'), z.object({ min: z.number().min(0), max: z.number().min(0) })]);

export const actionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  category: z.enum(ACTION_CATEGORIES),
  tags: z.array(z.string()).default([]),
  speed: z.enum(SPEED_IDS).default('vua'),
  /** Thể lực tiêu, trước khi nhân hệ số tốc độ và hệ số giáp. */
  stamina: z.number().min(0).default(0),
  /** `$weapon` · `$shield` · id kỹ năng thật · rỗng nghĩa là dùng `domain` khai thẳng. */
  skill: z.string().default(''),
  /** Rỗng nghĩa là suy từ kỹ năng. Khai thẳng cho những đòn không thuộc kỹ năng nào. */
  domain: z.string().default(''),
  difficulty: bandSchema.default('thuong'),
  reach: reachSchema.optional(),
  /** Vũ khí đang cầm phải có ĐỦ những nhãn này. */
  requiresWeaponTag: z.array(z.string()).default([]),
  requiresShield: z.boolean().default(false),
  move: moveSchema.optional(),
  /** Bảng tư thế đổ vào `HitOptions.postureBias` của Phần 7 mục 1. */
  aimBias: z.record(z.string(), z.number()).default({}),
  /** Cộng thẳng vào mức độ vết thương nếu trúng. */
  severityBonus: z.number().default(0),
  /** Đòn không gây thương tích — giả đòn, tước vũ khí, hất cát. */
  noInjury: z.boolean().default(false),
  /** Thắng thì đối thủ rơi vũ khí. */
  disarm: z.boolean().default(false),
  /** Thắng thì đối thủ ngã. */
  knockdown: z.boolean().default(false),
  /** Thắng thì đối thủ mù trong ngần này hiệp. */
  blinds: z.number().min(0).default(0),
  /** Cộng thẳng vào thế trận khi thắng hiệp. */
  tempoBonus: z.number().default(0),
  /** Bấm nút này là chịu thua. */
  yields: z.boolean().default(false),
  /** Đòn bẩn — doctrine `honor` cao sẽ không bao giờ chọn. */
  dishonourable: z.boolean().default(false),
  note: z.string().default(''),
});

export type DuelAction = z.infer<typeof actionSchema>;

const matrixRowSchema = z.object({
  when: z.string().min(1),
  against: z.string().min(1),
  /** Điều chỉnh cho bên mang nhãn `when`, thang d100. */
  self: z.number().default(0),
  /** Điều chỉnh cho bên kia, thang d100. */
  other: z.number().default(0),
  effects: z
    .object({
      /** Thể lực bên kia mất thêm. */
      otherStamina: z.number().default(0),
      /** Thế trận bên `when` được thêm khi thắng hiệp. */
      selfTempo: z.number().default(0),
      /** Mức độ vết thương mà bên `when` PHẢI CHỊU, cộng thẳng (thường âm). */
      incomingSeverity: z.number().default(0),
    })
    .optional(),
  note: z.string().default(''),
});

export type MatrixRow = z.infer<typeof matrixRowSchema>;

const matrixFileSchema = z.object({
  version: z.number(),
  tags: z.array(z.object({ id: z.string(), name: z.string(), note: z.string().default('') })).min(1),
  speeds: z
    .array(
      z.object({
        id: z.enum(SPEED_IDS),
        name: z.string(),
        initiative: z.number(),
        staminaFactor: z.number().min(0),
      }),
    )
    .min(1),
  tempo: z.object({
    min: z.number(),
    max: z.number(),
    perStep: z.number(),
    gain: z.object({
      critSuccess: z.number(),
      success: z.number(),
      costlySuccess: z.number(),
      fail: z.number(),
      critFail: z.number(),
    }),
    lockAttackBelow: z.number(),
    comboFrom: z.number(),
    comboKeep: z.number(),
    driftToZero: z.number(),
  }),
  stamina: z.object({
    max: z.number().min(1),
    recover: z.object({ base: z.number(), defending: z.number(), resting: z.number() }),
    vitReference: z.number().min(1),
    vitPerPoint: z.number(),
    injuryDrainPerSeverity: z.number(),
    penalties: z.array(z.object({ below: z.number(), penalty: z.number(), name: z.string() })),
    forcedDefenceBelow: z.number(),
  }),
  wounds: z.object({
    bleedPerRound: z.number().min(0).max(1),
    downBlood: z.number().min(0),
    downConsciousness: z.array(z.string()).min(1),
    downSeverity: z.number().min(1).max(5),
    deathBlood: z.number().min(0),
    gripDropBelow: z.number().min(0).max(100),
    absorbedStamina: z.number().min(0),
  }),
  facing: z.object({
    front: z.number(),
    flank: z.number(),
    back: z.number(),
    blindedTreatsAllAsFlank: z.boolean(),
  }),
  reach: z.object({
    tooFar: z.number(),
    tooClose: z.number(),
    missBeyond: z.number().min(0),
    grappleAt: z.number().min(0),
  }),
  armorRules: z.array(
    z.object({
      attack: z.string(),
      armorClass: z.string(),
      /** `0` nghĩa là đòn KHÔNG sinh vết thương nào — giáp nuốt trọn (mục 7). */
      severityCap: z.number().min(0).max(5),
      forceType: z.string().optional(),
      hitMod: z.number().default(0),
      gapOnly: z.boolean().default(false),
      note: z.string().default(''),
    }),
  ),
  armorPiercing: z.object({ gapPenaltyRelief: z.number().min(0).max(1), gapAimBias: z.number().min(1) }),
  actions: z.array(actionSchema).min(1),
  matrix: z.array(matrixRowSchema),
});

export type ArmorRule = z.infer<typeof matrixFileSchema>['armorRules'][number];
export type TempoConfig = z.infer<typeof matrixFileSchema>['tempo'];
export type StaminaConfig = z.infer<typeof matrixFileSchema>['stamina'];
export type WoundConfig = z.infer<typeof matrixFileSchema>['wounds'];
export type FacingConfig = z.infer<typeof matrixFileSchema>['facing'];
export type ReachConfig = z.infer<typeof matrixFileSchema>['reach'];

// ---------------------------------------------------------------------------
// arenas.json
// ---------------------------------------------------------------------------

const terrainSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  moveCost: z.number().min(1),
  attack: z.number().default(0),
  defence: z.number().default(0),
  staminaExtra: z.number().default(0),
  elevation: z.number().default(0),
  passable: z.boolean().default(true),
  /** Bước vào ô này là ra khỏi vòng đấu. */
  outOfBounds: z.boolean().default(false),
  /** Phần trăm nguy cơ trượt chân khi lùi hoặc vòng qua ô này. */
  footingRisk: z.number().min(0).max(100).default(0),
  note: z.string().default(''),
});

export type Terrain = z.infer<typeof terrainSchema>;

const arenaSchema = z.object({
  id: z.string().startsWith('arena_'),
  name: z.string().min(1),
  width: z.int().min(2).max(20),
  height: z.int().min(2).max(20),
  default: z.boolean().default(false),
  weights: z.record(z.string(), z.number().min(0)),
  fixed: z.array(z.object({ x: z.int().min(0), y: z.int().min(0), terrain: z.string() })).default([]),
  /** Địa hình phủ toàn bộ viền lưới, nếu có. */
  edgeTerrain: z.string().optional(),
  note: z.string().default(''),
});

export type ArenaTemplate = z.infer<typeof arenaSchema>;

const kindSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  blunted: z.boolean().default(false),
  severityCap: z.number().min(1).max(5).default(5),
  lethal: z.boolean().default(true),
  yieldAllowed: z.boolean().default(true),
  /** Mức độ vết thương làm trọng tài dừng trận. 0 là không có trọng tài. */
  refereeAt: z.number().min(0).max(5).default(0),
  firstBloodEnds: z.boolean().default(false),
  freeOpeningRound: z.boolean().default(false),
  endOn: z.array(z.string()).min(1),
  maxRounds: z.int().min(1),
  practiceFactor: z.number().min(0).default(1),
  reputation: z.number().default(0),
  ransom: z.boolean().default(false),
  legal: z.boolean().default(false),
  note: z.string().default(''),
});

export type DuelKind = z.infer<typeof kindSchema>;

const endingSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  loserIsYielder: z.boolean().default(false),
  note: z.string().default(''),
});

export type Ending = z.infer<typeof endingSchema>;

const arenaFileSchema = z.object({
  version: z.number(),
  terrain: z.array(terrainSchema).min(1),
  arenas: z.array(arenaSchema).min(1),
  kinds: z.array(kindSchema).min(1),
  endings: z.array(endingSchema).min(1),
});

// ---------------------------------------------------------------------------
// Nạp và kiểm tham chiếu
// ---------------------------------------------------------------------------

interface Loaded {
  matrix: z.infer<typeof matrixFileSchema>;
  arenas: z.infer<typeof arenaFileSchema>;
  actionById: Map<string, DuelAction>;
  terrainById: Map<string, Terrain>;
  arenaById: Map<string, ArenaTemplate>;
  kindById: Map<string, DuelKind>;
  endingById: Map<string, Ending>;
}

function parse<T>(schema: z.ZodType<T>, raw: unknown, file: string): T {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new DuelDataError(`${file} hỏng ở "${issue?.path.join('.') ?? '?'}": ${issue?.message ?? 'không rõ'}`);
  }
  return parsed.data;
}

function load(): Loaded {
  const matrix = parse(matrixFileSchema, matrixFile, 'data/duel-matrix.json');
  const arenas = parse(arenaFileSchema, arenasFile, 'data/arenas.json');

  const tags = new Set(matrix.tags.map((tag) => tag.id));
  const actionById = new Map<string, DuelAction>();
  for (const action of matrix.actions) {
    if (actionById.has(action.id)) throw new DuelDataError(`hành động trùng id: ${action.id}`);
    for (const tag of action.tags) {
      if (!tags.has(tag)) {
        throw new DuelDataError(`hành động "${action.id}" mang nhãn "${tag}" không có trong từ vựng ma trận`);
      }
    }
    actionById.set(action.id, action);
  }

  // Một dòng ma trận trỏ tới nhãn không tồn tại là một dòng vĩnh viễn không bao
  // giờ khớp — nó chỉ làm người cân bằng tin rằng luật ấy đang chạy.
  for (const row of matrix.matrix) {
    if (!tags.has(row.when)) throw new DuelDataError(`ma trận: nhãn "${row.when}" không có trong từ vựng`);
    if (!tags.has(row.against)) throw new DuelDataError(`ma trận: nhãn "${row.against}" không có trong từ vựng`);
  }
  for (const rule of matrix.armorRules) {
    if (!tags.has(rule.attack)) {
      throw new DuelDataError(`armorRules: nhãn đòn "${rule.attack}" không có trong từ vựng`);
    }
  }

  const terrainById = new Map(arenas.terrain.map((row) => [row.id, row] as const));
  const arenaById = new Map<string, ArenaTemplate>();
  for (const arena of arenas.arenas) {
    if (arenaById.has(arena.id)) throw new DuelDataError(`đấu trường trùng id: ${arena.id}`);
    for (const id of Object.keys(arena.weights)) {
      if (!terrainById.has(id)) throw new DuelDataError(`đấu trường "${arena.id}" rắc địa hình "${id}" chưa khai`);
    }
    for (const cell of arena.fixed) {
      if (!terrainById.has(cell.terrain)) {
        throw new DuelDataError(`đấu trường "${arena.id}" đặt địa hình "${cell.terrain}" chưa khai`);
      }
      if (cell.x >= arena.width || cell.y >= arena.height) {
        throw new DuelDataError(`đấu trường "${arena.id}" đặt ô cố định (${cell.x},${cell.y}) ra ngoài lưới`);
      }
    }
    if (arena.edgeTerrain !== undefined && !terrainById.has(arena.edgeTerrain)) {
      throw new DuelDataError(`đấu trường "${arena.id}" viền bằng địa hình "${arena.edgeTerrain}" chưa khai`);
    }
    arenaById.set(arena.id, arena);
  }
  if (!arenas.arenas.some((arena) => arena.default)) {
    throw new DuelDataError('data/arenas.json không có đấu trường nào đánh dấu `default`');
  }

  const endingById = new Map(arenas.endings.map((row) => [row.id, row] as const));
  const kindById = new Map<string, DuelKind>();
  for (const kind of arenas.kinds) {
    if (kindById.has(kind.id)) throw new DuelDataError(`loại hình quyết đấu trùng id: ${kind.id}`);
    for (const id of kind.endOn) {
      if (!endingById.has(id)) {
        throw new DuelDataError(`loại hình "${kind.id}" khai cửa ra "${id}" không có trong bảng endings`);
      }
    }
    kindById.set(kind.id, kind);
  }

  return { matrix, arenas, actionById, terrainById, arenaById, kindById, endingById };
}

const DATA = load();

// ---------------------------------------------------------------------------
// Đọc
// ---------------------------------------------------------------------------

export function allActions(): DuelAction[] {
  return [...DATA.actionById.values()];
}

export function actionOf(id: string): DuelAction | null {
  return DATA.actionById.get(id) ?? null;
}

export function actionName(id: string): string {
  return DATA.actionById.get(id)?.name ?? id;
}

export function matrixRows(): readonly MatrixRow[] {
  return DATA.matrix.matrix;
}

export function tempoConfig(): TempoConfig {
  return DATA.matrix.tempo;
}

export function staminaConfig(): StaminaConfig {
  return DATA.matrix.stamina;
}

export function facingConfig(): FacingConfig {
  return DATA.matrix.facing;
}

export function woundConfig(): WoundConfig {
  return DATA.matrix.wounds;
}

export function reachConfig(): ReachConfig {
  return DATA.matrix.reach;
}

export function armorRules(): readonly ArmorRule[] {
  return DATA.matrix.armorRules;
}

export function armorPiercingConfig(): { gapPenaltyRelief: number; gapAimBias: number } {
  return DATA.matrix.armorPiercing;
}

export function speedRow(id: SpeedId): { id: SpeedId; name: string; initiative: number; staminaFactor: number } {
  const row = DATA.matrix.speeds.find((entry) => entry.id === id);
  if (row === undefined) throw new DuelDataError(`tốc độ không có trong bảng: ${id}`);
  return row;
}

export function tagName(id: string): string {
  return DATA.matrix.tags.find((tag) => tag.id === id)?.name ?? id;
}

export function allTerrain(): Terrain[] {
  return [...DATA.terrainById.values()];
}

export function terrainOf(id: string): Terrain | null {
  return DATA.terrainById.get(id) ?? null;
}

export function allArenas(): ArenaTemplate[] {
  return [...DATA.arenaById.values()];
}

export function arenaOf(id: string): ArenaTemplate | null {
  return DATA.arenaById.get(id) ?? null;
}

export function defaultArena(): ArenaTemplate {
  const found = allArenas().find((arena) => arena.default);
  if (found === undefined) throw new DuelDataError('không có đấu trường mặc định');
  return found;
}

export function allKinds(): DuelKind[] {
  return [...DATA.kindById.values()];
}

export function kindOf(id: string): DuelKind | null {
  return DATA.kindById.get(id) ?? null;
}

export function endingName(id: string): string {
  return DATA.endingById.get(id)?.name ?? id;
}

export function allEndings(): Ending[] {
  return [...DATA.endingById.values()];
}
