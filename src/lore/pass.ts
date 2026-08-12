/**
 * MỘT LƯỢT QUÉT LOREBOOK, TỪ ĐẦU TỚI CUỐI.
 *
 * Nối bốn mảnh của Phần 4 lại theo đúng thứ tự bắt buộc:
 *
 *   quét (mục 4)  →  render EJS  →  ngân sách (mục 9)  →  trigger (mục 10)
 *
 * Render TRƯỚC ngân sách là có lý do: nội dung entry là template, và một
 * template ba dòng có thể nở ra ba chục dòng. Đếm token trên bản chưa render là
 * đếm nhầm, mà đếm nhầm ngân sách thì prompt vỡ ở lượt chơi chứ không vỡ ở đây.
 *
 * Trigger chạy SAU CÙNG và chỉ cho những entry THẬT SỰ được chèn: bắn event cho
 * một entry vừa bị ngân sách cắt là báo cho người chơi một chuyện mà AI không hề
 * được kể.
 *
 * MACRO ĐỨNG TRƯỚC EJS, đúng thứ tự của Phần 3 mục 7. Phần 3 chạy macro trên
 * template của KHỐI, mà nội dung entry chỉ được EJS nhét vào khối sau đó — nên
 * không có bước này thì `{{user}}` trong một sách nhập từ SillyTavern đi thẳng
 * vào prompt dưới dạng bốn dấu ngoặc nhọn. Sách cũ dùng macro rất dày, và bắt
 * người chơi gõ lại toàn bộ sang `<%= state.player.name %>` là cách chắc chắn
 * nhất để họ bỏ hệ này.
 */

import type { GameDate } from '@/core/clock';
import type { Rng } from '@/core/rng';
import { renderTemplate } from '@/ai/ejs';
import { expandMacros, type MacroContext } from '@/ai/macros';
import type { PromptBlock } from '@/ai/blocks';
import type { PatchOp } from '@/state/mvu-parse';
import type { GameState } from '@/state/slices';
import { DEFAULT_LORE_BUDGET, selectWithinBudget } from './budget';
import { memoryOf, rememberEntryOp } from './knowledge';
import { scanLore, type ActivatedEntry, type BookActivation, type ScanText } from './scanner';
import { fireTriggers, type FiredEvent } from './triggers';
import type { LoreDecision, LoreItem, Lorebook } from './types';

export interface LorePassInput {
  books: readonly Lorebook[];
  state: GameState;
  turn: number;
  now: GameDate;
  regionId: string;
  /** Vùng ở lượt trước — trigger `onEnterRegion` cần nó. */
  previousRegionId: string;
  texts: readonly ScanText[];
  locals: Record<string, unknown>;
  audience: readonly string[];
  rng: Rng;
  /** Bỏ trống thì nội dung entry không được chạy macro, chỉ chạy EJS. */
  macros?: MacroContext;
  budgetTokens?: number;
  channel?: 'main' | 'worldtick';
}

export interface LorePass {
  /** Entry gộp vào khối 4. */
  items: LoreItem[];
  /** Entry chèn theo độ sâu, đã đóng gói thành khối cho Phần 3 lắp. */
  depthBlocks: PromptBlock[];
  decisions: LoreDecision[];
  books: BookActivation[];
  warnings: string[];
  /** Op của trigger + op ghi nhớ. Người gọi đưa qua MVU với actor `engine`. */
  ops: PatchOp[];
  notices: { title: string; body: string }[];
  fired: FiredEvent[];
  deferred: FiredEvent[];
  used: number;
  limit: number;
}

const EMPTY_PASS: Omit<LorePass, 'limit'> = {
  items: [],
  depthBlocks: [],
  decisions: [],
  books: [],
  warnings: [],
  ops: [],
  notices: [],
  fired: [],
  deferred: [],
  used: 0,
};

export function emptyLorePass(limit: number = DEFAULT_LORE_BUDGET): LorePass {
  return { ...EMPTY_PASS, limit };
}

/** Khối tổng hợp cho một entry chèn theo độ sâu. */
function toDepthBlock(item: LoreItem): PromptBlock {
  return {
    id: `lore.${item.id}`,
    name: `Lore · ${item.title}`,
    enabled: true,
    locked: false,
    role: item.role,
    placement: item.placement === 'block' ? 'sequential' : { depth: item.placement.depth },
    // Chen vào giữa nhóm khối [LOCKED] ở cuối là đổi hợp đồng vị trí của Phần 3,
    // nên khối lore luôn đứng sau tất cả khối thường.
    order: 1000,
    template: item.content,
    budgetPriority: item.budgetPriority,
  };
}

export function runLorePass(input: LorePassInput): LorePass {
  const limit = input.budgetTokens ?? DEFAULT_LORE_BUDGET;

  const scan = scanLore({
    books: input.books,
    state: input.state,
    turn: input.turn,
    now: input.now,
    regionId: input.regionId,
    texts: input.texts,
    rng: input.rng,
    locals: input.locals,
    audience: input.audience,
    ...(input.channel === undefined ? {} : { channel: input.channel }),
  });

  const warnings = [...scan.warnings];

  // --- macro rồi EJS, trước khi đếm token ----------------------------------
  const macros = input.macros;

  /** Một đoạn chữ của entry đi qua đúng hai bước, y như một khối của Phần 3. */
  const prepare = (source: string, entryId: string, what: string): string | null => {
    const expanded = macros === undefined ? source : expandMacros(source, macros, `lore.${entryId}`).text;
    const result = renderTemplate(expanded, input.locals);
    if (result.error !== null) {
      warnings.push(`Entry "${entryId}" render lỗi ở ${what}: ${result.error.message}. Dùng nguyên văn.`);
      return null;
    }
    return result.text.trim();
  };

  const rendered: ActivatedEntry[] = scan.activated.map((activated) => {
    const id = activated.entry.id;
    const content = prepare(activated.content, id, 'nội dung');
    // `summary` cũng là template: ngân sách có thể chọn nó thay cho bản đầy đủ,
    // và lúc đó nó đi thẳng vào prompt.
    const raw = activated.entry.summary;
    const summary = raw === undefined || raw.trim() === '' ? undefined : prepare(raw, id, 'summary');

    return {
      ...activated,
      content: content ?? activated.content,
      ...(summary === null || summary === undefined ? {} : { summary }),
    };
  });

  // --- ngân sách khối 4 ----------------------------------------------------
  const selection = selectWithinBudget(rendered, scan.decisions, limit);

  // --- trigger, chỉ cho entry thật sự vào prompt ---------------------------
  const insertedIds = new Set([...selection.items, ...selection.depthItems].map((item) => item.id));
  const inserted = rendered.filter((activated) => insertedIds.has(activated.entry.id));

  const triggers = fireTriggers(inserted, {
    state: input.state,
    turn: input.turn,
    now: input.now,
    regionId: input.regionId,
    previousRegionId: input.previousRegionId,
  });

  // --- ghi nhớ: cooldown và sticky của lượt sau đọc chỗ này ----------------
  const ops: PatchOp[] = [...triggers.ops];
  for (const activated of inserted) {
    const sticky = activated.entry.sticky;
    const memory = memoryOf(input.state, activated.entry.id);
    const op = rememberEntryOp(input.state, activated.entry.id, {
      lastInsertedTurn: input.turn,
      ...(sticky === undefined || sticky <= 0
        ? {}
        : { stickyUntilTurn: Math.max(memory.stickyUntilTurn, input.turn + sticky) }),
    });
    if (op !== null) ops.push(op);
  }

  return {
    items: selection.items,
    depthBlocks: selection.depthItems.map(toDepthBlock),
    decisions: scan.decisions,
    books: scan.books,
    warnings: [...warnings, ...triggers.log.filter((line) => line.includes('hỏng'))],
    ops,
    notices: triggers.notices,
    fired: triggers.fired,
    deferred: triggers.deferred,
    used: selection.used,
    limit: selection.limit,
  };
}
