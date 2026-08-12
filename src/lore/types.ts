/**
 * MÔ HÌNH DỮ LIỆU LOREBOOK (Phần 4 mục 2).
 *
 * Zod là bản đặc tả thật, kiểu TypeScript suy ra từ nó — sách lorebook đến từ
 * file người chơi mang vào, nên nó phải qua cửa kiểm tra trước khi được tin.
 *
 * Mặc định được đặt ở tầng Zod chứ không ở chỗ dùng: một file World Info chuyển
 * đổi sang sẽ thiếu quá nửa số field, và mỗi field thiếu mà phải nhớ điền tay ở
 * chỗ dùng là một chỗ để quên. Mặc định an toàn nhất luôn là "không chèn":
 * `knowledge: 'public'` nhưng `constant: false`, `recurse: false`.
 */

import { z } from 'zod';
import { gameDateSchema } from '@/state/schema';

export const LORE_SCHEMA_VERSION = 1;

export const loreScopeKinds = ['global', 'nation', 'region', 'race', 'faction', 'topic'] as const;
export const loreEntryTypes = [
  'place',
  'person',
  'faction',
  'item',
  'concept',
  'custom',
  'law',
  'event',
  'creature',
] as const;

export const knowledgeGateSchema = z.enum(['public', 'gated', 'secret']);
export type KnowledgeGate = z.infer<typeof knowledgeGateSchema>;

/** Cách so khớp từ khóa. `regex` do người chơi viết nên phải chặn mẫu treo. */
export const matchModeSchema = z.enum(['plain', 'wholeWord', 'regex']);
export type MatchMode = z.infer<typeof matchModeSchema>;

export const secondaryLogicSchema = z.enum(['AND_ALL', 'AND_ANY', 'NOT_ALL', 'NOT_ANY']);
export type SecondaryLogic = z.infer<typeof secondaryLogicSchema>;

/** `'block'` = gộp vào khối 4; `{depth}` = chèn ngược từ cuối như khối depth. */
export const lorePlacementSchema = z.union([z.literal('block'), z.object({ depth: z.int().min(0) })]);
export type LorePlacement = z.infer<typeof lorePlacementSchema>;

export const loreTriggerSchema = z.object({
  when: z.enum(['onActivate', 'onFirstActivate', 'onEnterRegion', 'onDateReached']),
  emit: z.object({ event: z.string().min(1), payload: z.unknown() }),
});
export type LoreTrigger = z.infer<typeof loreTriggerSchema>;

export const loreEntrySchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  type: z.enum(loreEntryTypes).default('custom'),

  // --- Nội dung ---
  /** EJS render được, dùng locals của Phần 3. */
  content: z.string(),
  /** Cùng chủ đề, mỗi phe kể một kiểu (mục 6). */
  variants: z.array(z.object({ audience: z.string().min(1), content: z.string() })).optional(),
  /** Bản ngắn dùng khi hết ngân sách, thay vì bỏ hẳn entry (mục 9). */
  summary: z.string().optional(),

  // --- Lớp 1: từ khóa ---
  keys: z.array(z.string()).default([]),
  keysSecondary: z.object({ logic: secondaryLogicSchema, keys: z.array(z.string()) }).optional(),
  matchMode: matchModeSchema.default('plain'),
  caseSensitive: z.boolean().default(false),
  /** Luôn chèn, bỏ qua từ khóa — nhưng vẫn phải qua L1–L5 và vẫn tranh ngân sách. */
  constant: z.boolean().default(false),

  // --- Lớp 2: điều kiện state ---
  condition: z.string().optional(),

  // --- Lớp 3: thời gian trong game ---
  validFrom: gameDateSchema.optional(),
  validUntil: gameDateSchema.optional(),

  // --- Lớp 4: vị trí ---
  regions: z.array(z.string()).optional(),
  includeAdjacent: z.boolean().default(false),

  // --- Lớp 5: cổng tri thức ---
  knowledge: knowledgeGateSchema.default('public'),
  requiresKnowledge: z.array(z.string()).optional(),

  // --- Chèn ---
  placement: lorePlacementSchema.default('block'),
  role: z.enum(['system', 'user', 'assistant']).optional(),
  weight: z.number().default(10),
  budgetPriority: z.int().min(1).max(10).default(7),

  // --- Hành vi ---
  sticky: z.int().min(0).optional(),
  cooldown: z.int().min(0).optional(),
  delay: z.int().min(0).optional(),
  probability: z.number().min(0).max(100).optional(),

  // --- Quan hệ ---
  related: z.array(z.object({ id: z.string().min(1), pullWeight: z.number().min(0).max(1) })).optional(),
  recurse: z.boolean().default(false),
  preventRecursion: z.boolean().default(false),

  // --- Trigger ---
  triggers: z.array(loreTriggerSchema).optional(),
  triggerOnce: z.boolean().default(false),
  triggerCooldown: z.int().min(0).optional(),
});

export type LoreEntry = z.infer<typeof loreEntrySchema>;

export const loreScopeSchema = z.object({
  kind: z.enum(loreScopeKinds),
  refId: z.string().optional(),
});
export type LoreScope = z.infer<typeof loreScopeSchema>;

export const lorebookSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  version: z.int().default(1),
  scope: loreScopeSchema.default({ kind: 'global' }),
  /** Bật tay. `false` là tắt cứng, `autoScope` không bật lại được. */
  enabled: z.boolean().default(true),
  /** Tự bật/tắt theo vùng đang đứng (mục 3). */
  autoScope: z.boolean().default(false),
  /** Sách nào thắng khi hai entry cùng id. */
  priority: z.number().default(0),
  entries: z.array(loreEntrySchema).default([]),
});

export type Lorebook = z.infer<typeof lorebookSchema>;

/** File `.json` một sách hoặc cả bộ (mục 12). */
export const loreBundleSchema = z.object({
  kind: z.literal('eu1444-lorebook'),
  schemaVersion: z.int(),
  exportedAt: z.number(),
  books: z.array(lorebookSchema),
});
export type LoreBundle = z.infer<typeof loreBundleSchema>;

// ---------------------------------------------------------------------------
// Kết quả quét — thứ UI và prompt cùng đọc
// ---------------------------------------------------------------------------

/** Năm lớp của mục 4, cộng bốn cửa xét sau chúng. */
export type LoreLayerId =
  | 'L1'
  | 'L2'
  | 'L3'
  | 'L4'
  | 'L5'
  | 'behaviour'
  | 'keys'
  | 'probability'
  | 'budget';

/** Tên tiếng Việt của từng lớp, cho panel giải thích ở mục 11. */
export const LORE_LAYER_NAMES: Readonly<Record<LoreLayerId, string>> = {
  L1: 'L1 · sách đang bật?',
  L2: 'L2 · trong khoảng thời gian?',
  L3: 'L3 · đúng vùng?',
  L4: 'L4 · điều kiện state?',
  L5: 'L5 · cổng tri thức?',
  behaviour: 'delay / cooldown',
  keys: 'từ khóa',
  probability: 'xác suất',
  budget: 'ngân sách khối 4',
};

export interface LoreLayerResult {
  layer: LoreLayerId;
  passed: boolean;
  /** Câu giải thích hiện thẳng trên panel của mục 11. */
  reason: string;
}

export type LoreOutcome = 'chèn' | 'chèn bản tóm tắt' | 'loại';

/**
 * Vì sao một entry được chèn hay bị loại — sản phẩm chính của mục 11 và là thứ
 * mục 14 đòi phải đưa ra. Mỗi entry ĐƯỢC XÉT đều có đúng một bản ghi.
 */
export interface LoreDecision {
  bookId: string;
  bookName: string;
  entryId: string;
  title: string;
  layers: LoreLayerResult[];
  /** Lớp đầu tiên chặn nó lại. `null` khi entry qua hết. */
  blockedAt: LoreLayerId | null;
  matchedKeys: string[];
  score: number;
  outcome: LoreOutcome;
  /** Entry này vào qua đường quan hệ của entry nào (mục 7). */
  pulledBy?: string;
  /** Vòng đệ quy đã kích nó (mục 8). 0 là từ tin nhắn gốc. */
  depth: number;
  tokens: number;
}

/** Một entry đã được chọn, sẵn sàng đưa vào prompt. */
export interface LoreItem {
  id: string;
  title: string;
  /** Nội dung đã chọn variant, chưa render EJS. */
  content: string;
  scope: string;
  /** Ghi chú cho AI khi tri thức mới ở mức tin đồn (mục 5). */
  note?: string;
  placement: LorePlacement;
  role: 'system' | 'user' | 'assistant';
  budgetPriority: number;
  score: number;
  tokens: number;
}
