/**
 * GÓI XUẤT/NHẬP CỦA TẦNG C (Phần 0 mục 4).
 *
 * Luật của mục 4, viết lại cho rõ:
 *   Export = gộp Tầng A + Tầng B thành MỘT file `.json`, có `schemaVersion` và
 *            checksum.
 *   Import = migrate TRƯỚC, Zod validate TRƯỚC, rồi mới ghi. File hỏng phải để
 *            save đang có nguyên vẹn (R4).
 *
 * File này chỉ có logic THUẦN — dựng gói, băm, kiểm, migrate. Phần đụng tới đĩa
 * nằm ở `jsonfile.ts`. Tách ra vì luật ở trên phải test được mà không cần trình
 * duyệt, và vì một ngày nào đó gói này sẽ đi qua đường khác (chia sẻ, sao lưu
 * tự động) mà luật thì không được đổi theo đường đi.
 */

import { z } from 'zod';
import type { TurnRecord } from '@/core/turn';
import { migrateToCurrent } from '@/state/migrate';
import { CURRENT_SCHEMA_VERSION, gameDateSchema, rngHubStateSchema } from '@/state/schema';
import type { GameState } from '@/state/slices';

export const BUNDLE_FORMAT = 'eu1444-save';

// ---------------------------------------------------------------------------
// Zod cho biên bản lượt
// ---------------------------------------------------------------------------

const checkModifierSchema = z.object({
  label: z.string(),
  value: z.number(),
  source: z.string(),
});

const checkResultSchema = z.object({
  id: z.string(),
  system: z.enum(['d100', 'd20', '3d6', 'pool']),
  domain: z.string(),
  difficulty: z.enum(['de-dang', 'thuong', 'kho', 'rat-kho', 'cuc-kho', 'gan-bat-kha']),
  tier: z.enum(['critFail', 'fail', 'costlySuccess', 'success', 'critSuccess']),
  raw: z.array(z.number()),
  target: z.number().optional(),
  dc: z.number().optional(),
  margin: z.number(),
  base: z.number().optional(),
  baseLabel: z.string().optional(),
  modifiers: z.array(checkModifierSchema),
  seedUsed: z.string(),
  narrativeHint: z.string(),
  consequence: z
    .object({ kind: z.enum(['cost', 'boon', 'escalation']), text: z.string() })
    .optional(),
});

/**
 * Biên bản một lượt.
 *
 * `.loose()` ở vài chỗ là cố ý: một save do bản build sau tạo ra có thể mang
 * thêm trường, và Phần 0 mục 4 nói không bao giờ vứt save cũ — nguyên tắc đó
 * chỉ có nghĩa nếu nó cũng đúng theo chiều ngược lại.
 */
export const turnRecordSchema = z.object({
  turn: z.int().nonnegative(),
  gameDate: gameDateSchema,
  rngBefore: rngHubStateSchema,
  input: z
    .object({
      kind: z.enum(['freeform', 'minigame']),
      text: z.string(),
      minigameId: z.string().optional(),
      minigameChoiceId: z.string().optional(),
      checkSkillId: z.string().optional(),
      checkDifficulty: z.enum(['de-dang', 'thuong', 'kho', 'rat-kho', 'cuc-kho', 'gan-bat-kha']).optional(),
      skipCheck: z.boolean().optional(),
    })
    .loose(),
  outcome: z
    .object({
      checks: z.array(checkResultSchema),
      engineOps: z.array(z.unknown()),
      timeCost: z.number(),
      rngAfter: rngHubStateSchema,
    })
    .loose(),
  narrative: z.string(),
  patch: z
    .object({
      applied: z.boolean(),
      opCount: z.int().nonnegative(),
      rejections: z.array(z.object({ path: z.string(), reason: z.string() })),
    })
    .loose(),
  tick: z.object({ eventCount: z.number(), llmCallsUsed: z.number() }).loose(),
  reachedStep: z.enum([
    'input',
    'resolve',
    'context',
    'call',
    'parse',
    'validate',
    'derive',
    'tick',
    'render',
    'persist',
  ]),
  wallClock: z.number(),
});

// ---------------------------------------------------------------------------
// Gói
// ---------------------------------------------------------------------------

/** Hình dạng file xuất ra. Chốt sớm vì save sống lâu hơn bản build. */
export interface ExportBundle {
  format: typeof BUNDLE_FORMAT;
  schemaVersion: number;
  /** Thời điểm thực (epoch ms) lúc xuất. */
  exportedAt: number;
  /** Băm trên JSON chuẩn hóa của `state` + `turns`. */
  checksum: string;
  state: GameState;
  turns: TurnRecord[];
}

/** Vỏ ngoài, kiểm trước khi đụng tới ruột. */
const envelopeSchema = z.object({
  format: z.literal(BUNDLE_FORMAT),
  schemaVersion: z.int().positive(),
  exportedAt: z.number(),
  checksum: z.string().min(1),
  state: z.unknown(),
  turns: z.array(z.unknown()),
});

// ---------------------------------------------------------------------------
// Checksum
// ---------------------------------------------------------------------------

/**
 * JSON có thứ tự khóa ổn định.
 *
 * `JSON.stringify` giữ nguyên thứ tự khóa lúc chèn, mà thứ tự đó đổi theo đường
 * state được dựng lên. Băm trên chuỗi chưa chuẩn hóa nghĩa là cùng một ván chơi
 * xuất hai lần ra hai checksum khác nhau, và cảnh báo "file hỏng" sẽ kêu oan
 * cho tới khi không ai còn tin nó nữa.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`);
  return `{${entries.join(',')}}`;
}

/**
 * FNV-1a chạy hai vòng với hai hạt khác nhau, ghép thành 16 ký tự hex.
 *
 * Đây là bộ dò HỎNG FILE, không phải bộ chống sửa trộm: ai cũng tính lại được.
 * Đúng thứ mục 4 cần — nó bắt file tải dở, ổ đĩa lỗi, hay một lần sửa tay lúc
 * debug bị quên mất.
 */
export function checksum(text: string): string {
  const pass = (seed: number): string => {
    let hash = seed;
    for (let index = 0; index < text.length; index++) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619) >>> 0;
    }
    return hash.toString(16).padStart(8, '0');
  };
  return `${pass(2166136261)}${pass(3221225473)}`;
}

/**
 * Phần ruột được băm.
 *
 * Nhận `unknown` chứ không nhận `GameState`: lúc nhập, checksum phải tính trên
 * đúng thứ đã đọc từ file, TRƯỚC migrate và trước khi loại biên bản hỏng. Băm
 * bản đã migrate thì mọi save cũ đều báo "checksum lệch" — cảnh báo kêu oan vài
 * lần là từ đó không ai đọc nó nữa.
 */
function payloadOf(state: unknown, turns: readonly unknown[]): string {
  return canonicalJson({ state, turns });
}

/** Dựng gói xuất. Checksum tính trên đúng phần ruột, không tính trên vỏ. */
export function buildBundle(
  state: GameState,
  turns: readonly TurnRecord[],
  now: number = Date.now(),
): ExportBundle {
  return {
    format: BUNDLE_FORMAT,
    schemaVersion: state.meta.schemaVersion,
    exportedAt: now,
    checksum: checksum(payloadOf(state, turns)),
    state,
    turns: [...turns],
  };
}

export function serializeBundle(bundle: ExportBundle): string {
  return `${JSON.stringify(bundle, null, 2)}\n`;
}

// ---------------------------------------------------------------------------
// Nhập
// ---------------------------------------------------------------------------

export class BundleError extends Error {
  constructor(
    message: string,
    /** Người chơi đọc được ngay, không phải đọc log. */
    readonly detail: string = '',
  ) {
    super(message);
    this.name = 'BundleError';
  }
}

export interface ParsedBundle {
  bundle: ExportBundle;
  /** Vấn đề không chặn: checksum lệch, biên bản lượt hỏng, save phải nâng cấp. */
  warnings: string[];
}

/**
 * Đọc một gói và trả về bản ĐÃ migrate, ĐÃ validate.
 *
 * Ném khi state không dùng được — người gọi bắt và giữ nguyên save đang có
 * (R4). Những thứ hỏng mà KHÔNG làm ván chơi vô dụng thì chỉ cảnh báo:
 *
 *   checksum lệch    file có thể đã bị sửa tay, mà sửa tay lúc debug chính là
 *                    một lý do Tầng C tồn tại (mục 4) — chặn ở đây là chặn đúng
 *                    công dụng của nó.
 *   biên bản lượt hỏng  lịch sử là kho tra cứu, không phải state. Bỏ dòng hỏng
 *                    còn hơn từ chối cả ván chơi vì một dòng nhật ký.
 */
export function parseBundle(raw: unknown): ParsedBundle {
  const envelope = envelopeSchema.safeParse(raw);
  if (!envelope.success) {
    throw new BundleError(
      'File này không phải một ván chơi eu1444.',
      envelope.error.issues.map((issue) => `${issue.path.join('.') || '(gốc)'}: ${issue.message}`).join('; '),
    );
  }

  const warnings: string[] = [];
  const data = envelope.data;

  if (data.schemaVersion > CURRENT_SCHEMA_VERSION) {
    throw new BundleError(
      `Ván chơi này thuộc schema v${data.schemaVersion}, bản build đang chạy mới tới v${CURRENT_SCHEMA_VERSION}.`,
      'Cập nhật bản build rồi nhập lại — hạ cấp một save là làm mất dữ liệu.',
    );
  }

  // MIGRATE TRƯỚC, VALIDATE TRƯỚC, ghi SAU (mục 4).
  let state: GameState;
  try {
    state = migrateToCurrent(data.state);
  } catch (cause) {
    throw new BundleError('Ván chơi trong file không đọc được.', String(cause));
  }
  if (data.schemaVersion < CURRENT_SCHEMA_VERSION) {
    warnings.push(`Đã nâng save từ schema v${data.schemaVersion} lên v${CURRENT_SCHEMA_VERSION}.`);
  }

  const turns: TurnRecord[] = [];
  let dropped = 0;
  for (const candidate of data.turns) {
    const parsed = turnRecordSchema.safeParse(candidate);
    if (parsed.success) turns.push(parsed.data as unknown as TurnRecord);
    else dropped++;
  }
  if (dropped > 0) {
    warnings.push(`${dropped} biên bản lượt trong file không đọc được và đã bị bỏ; ván chơi vẫn nhập được.`);
  }

  if (checksum(payloadOf(data.state, data.turns)) !== data.checksum) {
    warnings.push(
      'Checksum không khớp — file đã bị sửa sau khi xuất, hoặc tải về dở. Ván chơi vẫn nhập được vì đã qua Zod.',
    );
  }

  return {
    bundle: { ...data, schemaVersion: state.meta.schemaVersion, state, turns },
    warnings,
  };
}
