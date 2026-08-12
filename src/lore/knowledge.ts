/**
 * CỔNG TRI THỨC (Phần 4 mục 5) — chỗ hệ này hơn hẳn SillyTavern.
 *
 * Bệnh của ST: lorebook chèn vào là AI biết hết, nên NPC vô tình nói ra những
 * chuyện nhân vật chưa từng nghe. Người chơi không có cách nào biết mình vừa bị
 * lộ bài, và cảm giác "thế giới này có bí mật" chết ngay ở đó.
 *
 * Ba mức:
 *   public  chèn tự do
 *   gated   chỉ chèn khi người chơi có ĐỦ `requiresKnowledge`
 *   secret  KHÔNG BAO GIỜ vào prompt chính; chỉ vào prompt mô phỏng ngầm
 *           (Phần 15), để thế giới vẫn vận hành đúng sau lưng người chơi
 *
 * `confidence` không phải trang trí: biết một chuyện ở mức tin đồn khác hẳn
 * biết chắc. Entry qua cổng với confidence thấp được chèn KÈM GHI CHÚ, để AI
 * cho NPC nói năng dè dặt đúng mức thay vì tuyên bố như đinh đóng cột.
 */

import { z } from 'zod';
import type { PatchOp } from '@/state/mvu-parse';
import { readPath, type GameState, type SliceDefinition } from '@/state/slices';
import type { KnowledgeGate, LoreEntry } from './types';

/** Dưới ngưỡng này thì tri thức mới là tin đồn, không phải điều chắc chắn. */
export const RUMOUR_CONFIDENCE = 60;

export const knownFactSchema = z.object({
  learnedTurn: z.int().min(0),
  /** Nghe từ đâu: tên NPC, "đọc được", "tự suy ra"… */
  source: z.string().max(200),
  confidence: z.int().min(0).max(100),
});

/** Bộ nhớ của trình quét giữa các lượt — sticky, cooldown, trigger đều cần nó. */
export const entryMemorySchema = z.object({
  /** Lượt gần nhất entry được chèn. `-1` là chưa bao giờ. */
  lastInsertedTurn: z.int(),
  lastTriggeredTurn: z.int(),
  triggerCount: z.int().min(0),
  /** Còn được chèn kèm tới hết lượt này dù không khớp nữa (`sticky`). */
  stickyUntilTurn: z.int(),
});

export const knowledgeSchema = z.object({
  /** Tri thức người chơi đã nắm. */
  known: z.record(z.string(), knownFactSchema),
  /**
   * Bộ nhớ quét. Nằm trong state chứ không nằm trong RAM là có chủ ý: sticky và
   * cooldown quyết định entry nào vào prompt, mà entry nào vào prompt thì quyết
   * định AI viết gì. Để ngoài save là undo và load lại ra một câu chuyện khác
   * với cùng một seed — R3 vỡ.
   */
  entries: z.record(z.string(), entryMemorySchema),
  /**
   * Vùng nhân vật đang đứng.
   *
   * Tạm trú ở đây vì lorebook là hệ đầu tiên cần tới nó. Phần 12 (thành trì) và
   * Phần 13 (lãnh thổ) sẽ dựng chỗ ở thật cho vị trí; lúc đó chuyển sang và bỏ
   * field này.
   */
  regionId: z.string(),
  /**
   * Thế lực nhân vật đang thuộc về, id trong `data/nations.json`.
   *
   * `.default('')` chứ không phải bắt buộc: save cũ không có field này, và một
   * field mới bắt buộc là save cũ parse hỏng rồi mất sạch tri thức đã nhặt.
   *
   * Cùng lý do tạm trú với `regionId`. Phần 13 (chư hầu) và Phần 14 (phe phái
   * thật) sẽ suy ra nó từ tước vị và từ quan hệ, lúc đó ô chọn tay ở tab
   * Lorebook thành ô ghi đè chứ không còn là nguồn duy nhất.
   */
  factionId: z.string().default(''),
});

export type KnowledgeState = z.infer<typeof knowledgeSchema>;
export type KnownFact = z.infer<typeof knownFactSchema>;
export type EntryMemory = z.infer<typeof entryMemorySchema>;

export const EMPTY_MEMORY: EntryMemory = {
  lastInsertedTurn: -1,
  lastTriggeredTurn: -1,
  triggerCount: 0,
  stickyUntilTurn: -1,
};

export const knowledgeSlice: SliceDefinition = {
  id: 'knowledge',
  version: 1,
  schema: knowledgeSchema,

  defaults: () => ({ known: {}, entries: {}, regionId: '', factionId: '' }),

  permissions: {
    // Mục 5: tri thức thêm được bằng trigger HOẶC bằng patch quyền 'ai'. Đây là
    // mô tả trạng thái thế giới truyện, không phải số vào công thức.
    'known.*': 'ai',
    // Bộ nhớ quét và vị trí là việc của engine. AI ghi được vào đây thì nó tự
    // quyết được entry nào chèn ở lượt sau — tức là tự viết prompt cho chính nó.
    'entries.*': 'engine',
    regionId: 'engine',
    factionId: 'engine',
  },
};

// ---------------------------------------------------------------------------
// Đọc
// ---------------------------------------------------------------------------

export function knowledgeOf(state: GameState): KnowledgeState {
  const raw = readPath(state, 'knowledge');
  const parsed = knowledgeSchema.safeParse(raw);
  return parsed.success ? parsed.data : { known: {}, entries: {}, regionId: '', factionId: '' };
}

export function currentRegion(state: GameState): string {
  return knowledgeOf(state).regionId;
}

export function memoryOf(state: GameState, entryId: string): EntryMemory {
  return knowledgeOf(state).entries[entryId] ?? EMPTY_MEMORY;
}

// ---------------------------------------------------------------------------
// Cổng
// ---------------------------------------------------------------------------

export interface GateResult {
  passed: boolean;
  reason: string;
  /** Ghi chú kèm vào prompt khi tri thức mới ở mức tin đồn. */
  note?: string;
}

/**
 * Lớp L5 của mục 4.
 *
 * `secret` bị chặn ở đây và KHÔNG có đường vòng: người gọi muốn dựng prompt cho
 * mô phỏng ngầm thì truyền `audience: 'worldtick'`, và đó là chỗ duy nhất
 * `secret` lọt qua.
 */
export function checkGate(
  entry: Pick<LoreEntry, 'knowledge' | 'requiresKnowledge'>,
  state: GameState,
  audience: 'main' | 'worldtick' = 'main',
): GateResult {
  const gate: KnowledgeGate = entry.knowledge;

  if (gate === 'public') return { passed: true, reason: 'tri thức công khai' };

  if (gate === 'secret') {
    return audience === 'worldtick'
      ? { passed: true, reason: 'bí mật — chỉ mô phỏng ngầm được thấy' }
      : { passed: false, reason: 'bí mật — không bao giờ vào prompt chính' };
  }

  const required = entry.requiresKnowledge ?? [];
  if (required.length === 0) {
    return { passed: true, reason: 'gated nhưng không đòi tri thức nào' };
  }

  const known = knowledgeOf(state).known;
  const missing = required.filter((id) => known[id] === undefined);
  if (missing.length > 0) {
    return { passed: false, reason: `nhân vật chưa biết: ${missing.join(', ')}` };
  }

  const weakest = required.reduce(
    (lowest, id) => Math.min(lowest, known[id]?.confidence ?? 0),
    100,
  );
  if (weakest < RUMOUR_CONFIDENCE) {
    return {
      passed: true,
      reason: `biết nhưng chỉ ở mức tin đồn (độ tin cậy ${weakest})`,
      note: 'Nhân vật chỉ NGHE TIN ĐỒN về việc này, chưa chắc chắn. Cho nhân vật và NPC nói năng dè dặt, đừng khẳng định như đã tận mắt.',
    };
  }

  return { passed: true, reason: `đã biết đủ ${required.length} tri thức cần có` };
}

// ---------------------------------------------------------------------------
// Ghi — luôn qua MVU, không bao giờ ghi thẳng
// ---------------------------------------------------------------------------

export interface KnowledgeGain {
  id: string;
  source: string;
  confidence: number;
}

/**
 * Dựng op thêm tri thức. Người gọi đưa nó qua `applyPatch` như mọi thay đổi
 * khác — mục 10(a) cấm trigger ghi thẳng vào state, và đây chính là chỗ ranh
 * giới đó được giữ.
 */
export function gainKnowledgeOp(state: GameState, gain: KnowledgeGain, turn: number): PatchOp | null {
  const known = knowledgeOf(state).known;
  const existing = known[gain.id];

  // Biết rồi mà tin mới không chắc hơn thì không ghi gì: một op không đổi giá
  // trị vẫn tốn một dòng nhật ký và vẫn có thể trượt compare-and-swap.
  if (existing !== undefined && existing.confidence >= gain.confidence) return null;

  return {
    op: 'set',
    path: `knowledge.known.${gain.id}`,
    ...(existing === undefined ? {} : { from: existing }),
    to: {
      learnedTurn: turn,
      source: gain.source.slice(0, 200),
      confidence: Math.max(0, Math.min(100, Math.round(gain.confidence))),
    },
    reason:
      existing === undefined
        ? `biết thêm "${gain.id}" từ ${gain.source}`
        : `chắc chắn hơn về "${gain.id}" nhờ ${gain.source}`,
    source: 'json',
  };
}

/** Ghi lại lượt entry vừa được chèn / vừa bắn trigger. */
export function rememberEntryOp(
  state: GameState,
  entryId: string,
  patch: Partial<EntryMemory>,
): PatchOp | null {
  const current = memoryOf(state, entryId);
  const next = { ...current, ...patch };
  if (
    next.lastInsertedTurn === current.lastInsertedTurn &&
    next.lastTriggeredTurn === current.lastTriggeredTurn &&
    next.triggerCount === current.triggerCount &&
    next.stickyUntilTurn === current.stickyUntilTurn
  ) {
    return null;
  }

  const known = knowledgeOf(state).entries[entryId];
  return {
    op: 'set',
    path: `knowledge.entries.${entryId}`,
    ...(known === undefined ? {} : { from: known }),
    to: next,
    reason: `cập nhật bộ nhớ lorebook cho "${entryId}"`,
    source: 'json',
  };
}

export function setRegionOp(state: GameState, regionId: string): PatchOp | null {
  const current = currentRegion(state);
  if (current === regionId) return null;
  return {
    op: 'set',
    path: 'knowledge.regionId',
    from: current,
    to: regionId,
    reason: `nhân vật chuyển sang vùng "${regionId}"`,
    source: 'json',
  };
}

export function currentFaction(state: GameState): string {
  return knowledgeOf(state).factionId;
}

export function setFactionOp(state: GameState, factionId: string): PatchOp | null {
  const current = currentFaction(state);
  if (current === factionId) return null;
  return {
    op: 'set',
    path: 'knowledge.factionId',
    from: current,
    to: factionId,
    reason: `nhân vật đứng về thế lực "${factionId}"`,
    source: 'json',
  };
}
