/**
 * TRÌNH QUÉT LOREBOOK (Phần 4 mục 3, 4, 6, 7, 8, 9).
 *
 * NĂM LỚP CHẠY ĐÚNG THỨ TỰ NÀY, và thứ tự là chuyện hiệu năng chứ không phải
 * thẩm mỹ:
 *
 *   L1 sách đang bật?      so vài trường, rẻ nhất
 *   L2 đúng khoảng ngày?   so số
 *   L3 đúng vùng?          đi lên cây vùng, vẫn rẻ
 *   L4 condition (EJS)?    BIÊN DỊCH VÀ CHẠY MÃ — đắt gấp bội ba lớp trên
 *   L5 cổng tri thức?      đọc state
 *
 * Đảo L4 lên trước là mỗi lượt chạy EJS cho từng entry của mọi sách, kể cả
 * những entry mà vùng đã loại từ đầu. Một bộ lorebook cỡ vừa có vài trăm entry.
 *
 * Mỗi entry ĐƯỢC XÉT đều để lại một `LoreDecision` — kể cả entry bị loại ngay ở
 * lớp đầu. Đó là dữ liệu của panel "vì sao entry này được chèn / bị loại" ở mục
 * 11, và mục 14 đòi phải đưa ra được một ca bị loại ở L5.
 */

import type { GameDate } from '@/core/clock';
import type { Rng } from '@/core/rng';
import { evaluateCondition } from '@/ai/ejs';
import { looksCatastrophic } from '@/ai/regex/runner';
import type { GameState } from '@/state/slices';
import racesFile from '@data/races.json';
import { checkGate, currentFaction, memoryOf } from './knowledge';
import { isWithin, matchesRegions, regionName } from './regions';
import type { LoreDecision, LoreEntry, LoreLayerId, LoreLayerResult, Lorebook } from './types';

/** Trần độ sâu đệ quy (mục 8). */
export const DEFAULT_MAX_DEPTH = 3;

/** Thưởng điểm của mục 9. Để lộ ra ngoài vì UI phải giải thích được điểm số. */
export const SCORE_BONUS = {
  /** Khớp trong tin nhắn mới nhất. */
  newest: 5,
  /** Khớp cả keysSecondary. */
  secondary: 3,
  /** Entry gắn đúng vùng đang đứng. */
  sameRegion: 4,
  /** Entry `constant` vẫn tranh ngân sách, nhưng đứng đầu hàng (mục 9). */
  constant: 1000,
} as const;

export interface ScanText {
  text: string;
  /** 0 là tin nhắn mới nhất. Càng lớn càng xa. */
  recency: number;
}

export interface ScanInput {
  books: readonly Lorebook[];
  state: GameState;
  turn: number;
  now: GameDate;
  regionId: string;
  texts: readonly ScanText[];
  /** Seeded RNG cho `probability` — không bao giờ `Math.random` (R3). */
  rng: Rng;
  /** locals của Phần 3, để chạy `condition`. */
  locals: Record<string, unknown>;
  /** Phe / chủng tộc / quốc gia, để chọn variant (mục 6). */
  audience: readonly string[];
  /** `worldtick` là kênh duy nhất thấy được entry `secret`. */
  channel?: 'main' | 'worldtick';
  maxDepth?: number;
}

export interface ActivatedEntry {
  entry: LoreEntry;
  book: Lorebook;
  /** Nội dung đã chọn variant, chưa render EJS. */
  content: string;
  /** Bản tóm tắt đã render. Chỉ có sau bước render của `pass.ts`. */
  summary?: string;
  score: number;
  matchedKeys: string[];
  depth: number;
  pulledBy?: string;
  /** Ghi chú cổng tri thức, khi người chơi mới chỉ nghe tin đồn. */
  note?: string;
}

export interface BookActivation {
  bookId: string;
  name: string;
  active: boolean;
  reason: string;
}

export interface ScanResult {
  activated: ActivatedEntry[];
  decisions: LoreDecision[];
  /** Đệ quy chạm trần, kèm chuỗi entry đã đi qua (mục 8). */
  warnings: string[];
  /** Sách nào đang bật và vì sao — cột trái của UI đọc cái này. */
  books: BookActivation[];
}

// ---------------------------------------------------------------------------
// L1 — sách đang bật (mục 3)
// ---------------------------------------------------------------------------

function raceOf(state: GameState): string {
  const character = state['character'];
  if (typeof character !== 'object' || character === null) return '';
  const identity = (character as { identity?: { race?: unknown } }).identity;
  return typeof identity?.race === 'string' ? identity.race : '';
}

/**
 * Quê quán của từng tộc, đọc từ `data/races.json`.
 *
 * Đây là vế thứ hai của `scope.kind: 'race'` trong mục 3 — "hoặc đang ở vùng mà
 * chủng tộc đó chiếm đa số". Trước đây vế này để trống vì `races.json` rỗng.
 *
 * `reg_europa` bị LOẠI khỏi phép so: nó là cả lục địa, và một tộc "có mặt khắp
 * Europa" (Bán Tiên, Ma Duệ, Quạ Nhân) mà tính là đa số thì sách của tộc đó bật
 * ở mọi chỗ — tức là vế này biến thành `global` trá hình.
 */
const QUE_QUAN: ReadonlyMap<string, readonly string[]> = new Map(
  ((racesFile as { races?: { id?: string; homelands?: string[] }[] }).races ?? [])
    .filter((race): race is { id: string; homelands?: string[] } => typeof race.id === 'string')
    .map((race) => [race.id, (race.homelands ?? []).filter((id) => id !== 'reg_europa')]),
);

/**
 * Sách có `autoScope` được tính lại mỗi lượt.
 *
 * `enabled = false` thắng tất cả: đó là công tắc tay của người chơi, và
 * autoScope không có quyền bật lại thứ họ đã tắt.
 */
export function bookActivation(book: Lorebook, state: GameState, regionId: string): BookActivation {
  const base = { bookId: book.id, name: book.name };
  if (!book.enabled) return { ...base, active: false, reason: 'tắt tay' };
  if (!book.autoScope) return { ...base, active: true, reason: 'bật tay' };

  const ref = book.scope.refId ?? '';
  const faction = currentFaction(state);
  switch (book.scope.kind) {
    case 'global':
      return { ...base, active: true, reason: 'sách toàn cục' };

    case 'topic':
      // Mục 3: sách theo chủ đề CHỈ bật tay. autoScope trên nó là vô nghĩa.
      return { ...base, active: false, reason: 'sách theo chủ đề — chỉ bật tay' };

    case 'region': {
      const matched = matchesRegions(regionId, [ref], false);
      return {
        ...base,
        active: matched.passed,
        reason: matched.passed ? `đang ở ${regionName(regionId)}` : matched.reason,
      };
    }

    case 'nation': {
      // Hai đường vào, và đường nào cũng đủ: đang ĐỨNG trong quốc gia đó, hoặc
      // đang THUỘC về nó. Vế thứ hai đọc `knowledge.factionId` — ô chọn tay ở
      // tab Lorebook đặt nó, cho tới khi Phần 13 suy ra được từ tước vị.
      if (faction !== '' && faction === ref) {
        return { ...base, active: true, reason: `nhân vật thuộc ${ref}` };
      }
      const matched = matchesRegions(regionId, [ref], false);
      return {
        ...base,
        active: matched.passed,
        reason: matched.passed
          ? `đang ở trong ${regionName(ref)}`
          : `${matched.reason}, và cũng không thuộc ${ref}`,
      };
    }

    case 'race': {
      const race = raceOf(state);
      if (race !== '' && race === ref) {
        return { ...base, active: true, reason: `nhân vật là tộc ${race}` };
      }
      // Vế hai của mục 3: đang ở vùng mà tộc đó chiếm đa số.
      const que = QUE_QUAN.get(ref) ?? [];
      const trong = que.find((home) => regionId !== '' && isWithin(regionId, home));
      if (trong !== undefined) {
        return { ...base, active: true, reason: `${regionName(regionId)} là đất của tộc ${ref}` };
      }
      return {
        ...base,
        active: false,
        reason:
          que.length === 0
            ? `nhân vật không phải tộc ${ref}, và races.json chưa khai quê quán của tộc này`
            : `nhân vật không phải tộc ${ref}, và cũng không đứng trên đất của tộc đó`,
      };
    }

    case 'faction': {
      // Trước đây luôn tắt vì chưa có phe thật. Giờ có ô chọn tay, nên nó theo
      // đúng luật của mục 3: bật khi nhân vật thuộc phe đó.
      const matched = faction !== '' && faction === ref;
      return {
        ...base,
        active: matched,
        reason: matched
          ? `nhân vật thuộc phe ${ref}`
          : faction === ''
            ? 'chưa chọn phe hiện tại — đặt ở tab Lorebook, hoặc bật tay'
            : `nhân vật đang thuộc ${faction}, không phải ${ref}`,
      };
    }

    default:
      return { ...base, active: false, reason: 'scope không nhận ra' };
  }
}

// ---------------------------------------------------------------------------
// L2 — thời gian
// ---------------------------------------------------------------------------

function stamp(date: GameDate): number {
  return ((date.year * 12 + (date.month - 1)) * 31 + (date.day - 1)) * 24 + date.hour;
}

function formatDate(date: GameDate): string {
  return `${date.day}/${date.month}/${date.year}`;
}

function checkTime(entry: LoreEntry, now: GameDate): LoreLayerResult {
  const at = stamp(now);
  if (entry.validFrom !== undefined && at < stamp(entry.validFrom)) {
    return { layer: 'L2', passed: false, reason: `chưa tới ${formatDate(entry.validFrom)}` };
  }
  if (entry.validUntil !== undefined && at > stamp(entry.validUntil)) {
    return { layer: 'L2', passed: false, reason: `đã quá ${formatDate(entry.validUntil)}` };
  }
  const bounded = entry.validFrom !== undefined || entry.validUntil !== undefined;
  return {
    layer: 'L2',
    passed: true,
    reason: bounded ? 'nằm trong khoảng hiệu lực' : 'không giới hạn thời gian',
  };
}

// ---------------------------------------------------------------------------
// Từ khóa
// ---------------------------------------------------------------------------

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Từ khóa khớp trong một đoạn văn bản.
 *
 * Mẫu `regex` do người chơi viết, nên mẫu có nguy cơ quay lui thảm họa bị TỪ
 * CHỐI chứ không chạy thử — cùng lớp phòng thủ mà Phần 1 mục 6.7 dựng cho regex
 * của preset, vì lý do y hệt: JavaScript không ngắt được một regex đang chạy.
 */
export function matchKeys(
  text: string,
  keys: readonly string[],
  mode: LoreEntry['matchMode'],
  caseSensitive: boolean,
): string[] {
  if (text === '' || keys.length === 0) return [];
  const flags = caseSensitive ? '' : 'i';

  return keys.filter((key) => {
    if (key === '') return false;
    try {
      if (mode === 'regex') {
        if (looksCatastrophic(key)) return false;
        return new RegExp(key, flags).test(text);
      }
      if (mode === 'wholeWord') {
        // `\b` không nhận ra ranh giới của chữ có dấu tiếng Việt, nên ranh giới
        // ở đây là "không phải chữ cái Unicode" thay vì `\b`.
        return new RegExp(`(?<!\\p{L})${escapeRegex(key)}(?!\\p{L})`, `${flags}u`).test(text);
      }
      return caseSensitive ? text.includes(key) : text.toLowerCase().includes(key.toLowerCase());
    } catch {
      return false;
    }
  });
}

/** `keysSecondary` theo bốn phép logic của SillyTavern. */
function checkSecondary(
  entry: LoreEntry,
  text: string,
): { passed: boolean; matched: string[]; reason: string } {
  const secondary = entry.keysSecondary;
  if (secondary === undefined || secondary.keys.length === 0) {
    return { passed: true, matched: [], reason: 'không có từ khóa phụ' };
  }

  const matched = matchKeys(text, secondary.keys, entry.matchMode, entry.caseSensitive);
  const all = matched.length === secondary.keys.length;
  const any = matched.length > 0;

  switch (secondary.logic) {
    case 'AND_ALL':
      return { passed: all, matched, reason: all ? 'khớp hết từ khóa phụ' : 'thiếu từ khóa phụ' };
    case 'AND_ANY':
      return { passed: any, matched, reason: any ? 'khớp một từ khóa phụ' : 'không khớp từ khóa phụ nào' };
    case 'NOT_ANY':
      return { passed: !any, matched, reason: any ? `bị chặn bởi "${matched.join(', ')}"` : 'không có từ khóa cấm' };
    case 'NOT_ALL':
      return { passed: !all, matched, reason: all ? 'có đủ bộ từ khóa cấm' : 'không đủ bộ từ khóa cấm' };
    default:
      return { passed: true, matched, reason: 'logic không nhận ra — cho qua' };
  }
}

// ---------------------------------------------------------------------------
// Biến thể theo góc nhìn (mục 6)
// ---------------------------------------------------------------------------

export function pickVariant(entry: LoreEntry, audience: readonly string[]): string {
  for (const tag of audience) {
    const variant = entry.variants?.find((candidate) => candidate.audience === tag);
    if (variant !== undefined) return variant.content;
  }
  return entry.content;
}

// ---------------------------------------------------------------------------
// Quét
// ---------------------------------------------------------------------------

interface Candidate {
  entry: LoreEntry;
  book: Lorebook;
}

function decisionOf(
  candidate: Candidate,
  layers: LoreLayerResult[],
  extra: Partial<LoreDecision> = {},
): LoreDecision {
  const blocked = layers.find((layer) => !layer.passed);
  return {
    bookId: candidate.book.id,
    bookName: candidate.book.name,
    entryId: candidate.entry.id,
    title: candidate.entry.title,
    layers,
    blockedAt: blocked?.layer ?? null,
    matchedKeys: [],
    score: 0,
    outcome: blocked === undefined ? 'chèn' : 'loại',
    depth: 0,
    tokens: 0,
    ...extra,
  };
}

interface Job {
  candidate: Candidate;
  text: string;
  depth: number;
  pulledBy?: string;
  pullWeight?: number;
}

export function scanLore(input: ScanInput): ScanResult {
  const channel = input.channel ?? 'main';
  const maxDepth = input.maxDepth ?? DEFAULT_MAX_DEPTH;

  const books = input.books.map((book) => bookActivation(book, input.state, input.regionId));
  const activeIds = new Set(books.filter((book) => book.active).map((book) => book.bookId));

  const decisions: LoreDecision[] = [];
  const warnings: string[] = [];
  const activated: ActivatedEntry[] = [];
  /** Đã kích hoạt — không xét lại. */
  const seen = new Set<string>();
  /** Bị chặn DỨT KHOÁT ở năm lớp hoặc ở xác suất — không có đường vòng. */
  const excluded = new Set<string>();

  const candidates: Candidate[] = [];
  const byId = new Map<string, Candidate>();
  for (const book of input.books) {
    for (const entry of book.entries) {
      const candidate = { entry, book };
      candidates.push(candidate);
      // Sách priority cao thắng khi hai sách có entry trùng id (mục 2).
      const rival = byId.get(entry.id);
      if (rival === undefined || book.priority > rival.book.priority) byId.set(entry.id, candidate);
    }
  }

  const newest = input.texts.find((text) => text.recency === 0)?.text ?? '';
  const haystack = input.texts.map((text) => text.text).join('\n');

  /** Năm lớp + delay/cooldown. Mảng trả về luôn kể lại đủ những lớp đã chạy. */
  const gauntlet = (candidate: Candidate): LoreLayerResult[] => {
    const { entry, book } = candidate;
    const layers: LoreLayerResult[] = [];

    const active = activeIds.has(book.id);
    const bookReason = books.find((item) => item.bookId === book.id)?.reason ?? '';
    layers.push({ layer: 'L1', passed: active, reason: `sách "${book.name}": ${bookReason}` });
    if (!active) return layers;

    const time = checkTime(entry, input.now);
    layers.push(time);
    if (!time.passed) return layers;

    const region = matchesRegions(input.regionId, entry.regions, entry.includeAdjacent);
    layers.push({ layer: 'L3', passed: region.passed, reason: region.reason });
    if (!region.passed) return layers;

    if (entry.condition !== undefined && entry.condition.trim() !== '') {
      const evaluated = evaluateCondition(entry.condition, input.locals);
      layers.push({
        layer: 'L4',
        passed: evaluated.value,
        reason:
          evaluated.error !== null
            ? `condition lỗi (coi như sai): ${evaluated.error.message}`
            : `condition "${entry.condition}" → ${String(evaluated.value)}`,
      });
      if (!evaluated.value) return layers;
    } else {
      layers.push({ layer: 'L4', passed: true, reason: 'không có condition' });
    }

    const gate = checkGate(entry, input.state, channel);
    layers.push({ layer: 'L5', passed: gate.passed, reason: gate.reason });
    if (!gate.passed) return layers;

    const memory = memoryOf(input.state, entry.id);
    if (entry.delay !== undefined && input.turn < entry.delay) {
      layers.push({ layer: 'behaviour', passed: false, reason: `chỉ tính từ lượt ${entry.delay}` });
      return layers;
    }
    if (
      entry.cooldown !== undefined &&
      memory.lastInsertedTurn >= 0 &&
      input.turn - memory.lastInsertedTurn < entry.cooldown
    ) {
      layers.push({
        layer: 'behaviour',
        passed: false,
        reason: `đang nghỉ ${entry.cooldown} lượt, chèn gần nhất ở lượt ${memory.lastInsertedTurn}`,
      });
      return layers;
    }
    layers.push({ layer: 'behaviour', passed: true, reason: 'không vướng delay hay cooldown' });
    return layers;
  };

  /** Ghi biên bản, GHI ĐÈ bản cũ của cùng entry. */
  const record = (entryId: string, value: LoreDecision): void => {
    const at = decisions.findIndex((item) => item.entryId === entryId);
    if (at === -1) decisions.push(value);
    else decisions[at] = value;
  };

  /** Từ khóa → xác suất → chấm điểm. */
  const consider = (job: Job): ActivatedEntry | null => {
    const { entry, book } = job.candidate;
    if (seen.has(entry.id) || excluded.has(entry.id)) return null;

    if (entry.preventRecursion && job.depth > 0) {
      excluded.add(entry.id);
      record(
        entry.id,
        decisionOf(
          job.candidate,
          [{ layer: 'keys', passed: false, reason: 'preventRecursion — chỉ kích được từ tin nhắn gốc' }],
          { depth: job.depth },
        ),
      );
      return null;
    }

    const layers = gauntlet(job.candidate);
    if (layers.some((layer) => !layer.passed)) {
      // Chặn ở năm lớp là chặn DỨT KHOÁT: vùng, thời gian, cổng tri thức không
      // đổi trong cùng một lượt, nên không có đường vòng qua quan hệ hay đệ quy.
      excluded.add(entry.id);
      record(
        entry.id,
        decisionOf(job.candidate, layers, {
          depth: job.depth,
          ...(job.pulledBy === undefined ? {} : { pulledBy: job.pulledBy }),
        }),
      );
      return null;
    }

    const memory = memoryOf(input.state, entry.id);
    const sticky = memory.stickyUntilTurn >= input.turn;

    let matched: string[] = [];
    let secondaryBonus = 0;

    if (job.pulledBy !== undefined) {
      layers.push({ layer: 'keys', passed: true, reason: `được kéo vào từ "${job.pulledBy}"` });
    } else if (entry.constant) {
      layers.push({ layer: 'keys', passed: true, reason: 'entry constant — không cần từ khóa' });
    } else if (sticky) {
      layers.push({
        layer: 'keys',
        passed: true,
        reason: `còn dính (sticky) tới hết lượt ${memory.stickyUntilTurn}`,
      });
    } else {
      // Trượt từ khóa KHÔNG phải dứt khoát: cùng entry đó vẫn có thể vào qua
      // quan hệ (mục 7) hoặc qua một vòng đệ quy (mục 8), và lúc đó biên bản cũ
      // được ghi đè bằng biên bản mới.
      matched = matchKeys(job.text, entry.keys, entry.matchMode, entry.caseSensitive);
      if (matched.length === 0) {
        layers.push({ layer: 'keys', passed: false, reason: 'không khớp từ khóa nào' });
        record(entry.id, decisionOf(job.candidate, layers, { depth: job.depth }));
        return null;
      }
      const secondary = checkSecondary(entry, job.text);
      if (!secondary.passed) {
        layers.push({ layer: 'keys', passed: false, reason: secondary.reason });
        record(entry.id, decisionOf(job.candidate, layers, { depth: job.depth, matchedKeys: matched }));
        return null;
      }
      if (secondary.matched.length > 0) secondaryBonus = SCORE_BONUS.secondary;
      layers.push({ layer: 'keys', passed: true, reason: `khớp: ${matched.join(', ')}` });
    }

    if (entry.probability !== undefined && entry.probability < 100) {
      const rolled = input.rng.int(1, 100);
      const passed = rolled <= entry.probability;
      layers.push({ layer: 'probability', passed, reason: `tung ${rolled} so với ngưỡng ${entry.probability}` });
      if (!passed) {
        // Đã tung rồi thì thôi: tung lại ở vòng đệ quy là cho entry hai cơ hội
        // cho cùng một ngưỡng, và xác suất thật khác hẳn con số người chơi ghi.
        excluded.add(entry.id);
        record(entry.id, decisionOf(job.candidate, layers, { depth: job.depth, matchedKeys: matched }));
        return null;
      }
    }

    // --- điểm (mục 9) -----------------------------------------------------
    let score = matched.length * entry.weight + secondaryBonus;
    if (matched.length > 0 && matchKeys(newest, matched, entry.matchMode, entry.caseSensitive).length > 0) {
      score += SCORE_BONUS.newest;
    }
    if ((entry.regions ?? []).includes(input.regionId)) score += SCORE_BONUS.sameRegion;
    if (entry.constant) score += SCORE_BONUS.constant;
    if (sticky && matched.length === 0) score += entry.weight;
    score *= job.pullWeight ?? 1;

    const gate = checkGate(entry, input.state, channel);
    seen.add(entry.id);

    record(
      entry.id,
      decisionOf(job.candidate, layers, {
        depth: job.depth,
        matchedKeys: matched,
        score,
        outcome: 'chèn',
        ...(job.pulledBy === undefined ? {} : { pulledBy: job.pulledBy }),
      }),
    );

    return {
      entry,
      book,
      content: pickVariant(entry, input.audience),
      score,
      matchedKeys: matched,
      depth: job.depth,
      ...(job.pulledBy === undefined ? {} : { pulledBy: job.pulledBy }),
      ...(gate.note === undefined ? {} : { note: gate.note }),
    };
  };

  // BA PHA, CHẠY TÁCH HẲN NHAU.
  //
  // Gộp chúng vào một hàng đợi duy nhất thì thứ tự entry trong file quyết định
  // kết quả: một entry nằm trước entry kéo nó vào sẽ bị xét trước, trượt từ
  // khóa, rồi không còn cửa vào nữa. Tách pha là thứ khiến kết quả không phụ
  // thuộc vào việc người chơi sắp entry theo thứ tự nào.
  const chain: string[] = [];

  // --- pha 0: quét tin nhắn gốc -------------------------------------------
  for (const candidate of candidates) {
    const result = consider({ candidate, text: haystack, depth: 0 });
    if (result === null) continue;
    activated.push(result);
    chain.push(result.entry.id);
  }

  // --- pha 1: kéo quan hệ, CHỈ MỘT TẦNG (mục 7) ---------------------------
  // Chụp danh sách trước khi kéo: entry được kéo vào không kéo tiếp entry khác.
  for (const source of [...activated]) {
    for (const relation of source.entry.related ?? []) {
      const target = byId.get(relation.id);
      if (target === undefined) continue;
      const result = consider({
        candidate: target,
        text: haystack,
        depth: source.depth,
        pulledBy: source.entry.id,
        pullWeight: relation.pullWeight,
      });
      if (result !== null) activated.push(result);
    }
  }

  // --- pha 2: đệ quy (mục 8) ----------------------------------------------
  let frontier = activated.filter((item) => item.entry.recurse);
  for (let depth = 1; depth <= maxDepth && frontier.length > 0; depth++) {
    const next: ActivatedEntry[] = [];
    for (const source of frontier) {
      for (const candidate of candidates) {
        const result = consider({ candidate, text: source.content, depth });
        if (result === null) continue;
        activated.push(result);
        chain.push(result.entry.id);
        if (result.entry.recurse) next.push(result);
      }
    }
    if (depth === maxDepth && next.length > 0) {
      warnings.push(
        `Đệ quy chạm trần ${maxDepth}, còn ${next.length} entry chưa quét tiếp. Chuỗi đã đi qua: ${chain.join(' → ')}.`,
      );
      break;
    }
    frontier = next;
  }

  activated.sort((left, right) => right.score - left.score);
  decisions.sort((left, right) => right.score - left.score);

  return { activated, decisions, warnings, books };
}

/** Entry bị chặn ở lớp nào, gom theo lớp. Dùng cho phần thống kê trên UI. */
export function countByLayer(decisions: readonly LoreDecision[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const item of decisions) {
    const key: LoreLayerId | 'chèn' = item.blockedAt ?? 'chèn';
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
}
