/**
 * LẮP PROMPT VÀ CHẠY MỘT LƯỢT (Phần 3 mục 6, 7.3, 9, 12.6 và 12.9).
 *
 * Đây là chỗ vòng lặp mười bước của Phần 0 lần đầu chạy thông từ đầu tới cuối:
 * người chơi gõ một câu → engine tung xúc sắc → khối prompt render → gọi proxy
 * → tách narrative và patch → MVU kiểm duyệt và ghi.
 *
 * THỨ TỰ XỬ LÝ MỘT KHỐI (mục 7.3) — không được đổi:
 *   1. regex `promptOnly` hợp placement
 *   2. macro nháp (setvar/getvar), theo thứ tự xuất hiện
 *   3. macro lồng, nếu MacroNest bật
 *   4. EJS render
 *   5. đếm token
 *
 * Bước 2 chạy trước bước 4 cho TOÀN BỘ danh sách khối chứ không phải từng khối
 * một: preset SillyTavern thật đặt `setvar` ở khối đầu và đọc lại ở khối cuối,
 * nên phạm vi của không gian nháp là cả prompt. Vì thế hàm lắp đi hai vòng —
 * vòng một thay macro cho mọi khối, vòng hai mới render EJS.
 */

import { createRngHub, type Rng, type RngHubState } from '@/core/rng';
import type { MechanicalOutcome, RollContext, TurnInput, TurnRecord, TurnStep } from '@/core/turn';
import { BODY_STREAM, bodyTurn, handleAiText, stripInjuryRequests } from '@/systems/body';
import {
  encounterRequestsFromOutput,
  screenEncounters,
  stripEncounterRequests,
  type EncounterOffer,
} from '@/systems/encounter';
import { SYSTEM_LABELS, TIER_LABELS, checkLog, resolveTurn } from '@/systems/check';
import { skillsTurn } from '@/systems/skills';
import { computeDerived, type DerivedValues } from '@/state/derived';
import { applyPatch, type ApplyResult, type OpFailure } from '@/state/mvu';
import { parseUpdateVariables, stripUpdateBlocks, type ParseIssue, type PatchOp } from '@/state/mvu-parse';
import { providerCaller, repairPatch, type RepairOutcome } from '@/state/repair';
import { permissionFor, readPath, schemaAtPath, slices, type GameState } from '@/state/slices';
import { reconcileCodexOps } from '@/systems/codex';
import { handleAiRecruitment, stripRecruitmentRequests } from '@/systems/military';
import { handleAiMarchOrders, stripMarchOrders } from '@/systems/campaign';
import { applyRegexScripts, type RegexScript } from './regex/runner';
import { evaluateCondition, readonlyState, renderTemplate, type TemplateError } from './ejs';
import { createMacroContext, expandMacros, macroRng, resetScratch, type MacroContext, type MacroIssue } from './macros';
import { createQuery, emptyScene, fmt, type SceneContext, type TurnEntry } from './query';
import { sortBlocks, type PromptBlock } from './blocks';
import {
  DEFAULT_BUDGET,
  estimateCounter,
  promptLimit,
  trimToBudget,
  type BudgetConfig,
  type TokenCounter,
} from './budget';
import type { ConnCfg, LLMProvider, LLMRequest } from './provider';
import type { LoreItem } from '@/lore/types';

// ---------------------------------------------------------------------------
// Locals đưa vào template (mục 6)
// ---------------------------------------------------------------------------

/**
 * Một mục lorebook đã khớp, do trình quét của Phần 4 chọn ra.
 *
 * Kiểu nhập theo dạng CHỈ KIỂU: `/src/lore` phụ thuộc vào `/src/ai` (EJS, ngân
 * sách token, mô hình khối), nên nhập ngược lại ở mức giá trị sẽ thành vòng.
 */
export type { LoreItem } from '@/lore/types';

/**
 * Kết quả cơ học của lượt, đúng thứ khối 11 in ra.
 *
 * Kiểu nằm ở `@/core/turn` cùng chỗ với hợp đồng mười bước; re-export ở đây vì
 * đây là chỗ nó thành một local của template (mục 6).
 */
export type { RollContext } from '@/core/turn';

export function emptyRoll(): RollContext {
  return { checks: [], timeCost: 0, notes: [] };
}

/**
 * Danh sách đường dẫn theo quyền ghi, để khối 13 nói thẳng cho AI biết nó được
 * đụng vào đâu.
 *
 * Đây là một local NGOÀI danh sách của mục 6, cùng với `action`. Hai thứ này
 * bắt buộc phải có: khối 12 không viết được nếu không biết người chơi vừa làm
 * gì, và khối 13 mà không liệt kê được đường dẫn hợp lệ thì AI phải đoán —
 * mà đoán sai là cả lô patch bị từ chối (Phần 2 mục 5).
 */
export interface SchemaHint {
  writable: { path: string; type: string }[];
  engine: string[];
  locked: string[];
}

function coarseType(path: string): string {
  const schema = schemaAtPath(slices.rootSchema(), path);
  if (schema === null) return '?';
  const def = (schema as unknown as { def?: { type?: string; innerType?: { def?: { type?: string } } } }).def;
  return def?.type ?? def?.innerType?.def?.type ?? '?';
}

/** Gom quyền ghi đã khai trong từng slice thành ba danh sách. */
export function describeSchema(): SchemaHint {
  const hint: SchemaHint = { writable: [], engine: [], locked: [] };

  for (const slice of slices.all()) {
    for (const pattern of Object.keys(slice.permissions ?? {})) {
      const path = `${slice.id}.${pattern}`;
      const permission = permissionFor(path);
      if (permission === 'ai') hint.writable.push({ path, type: coarseType(path) });
      else if (permission === 'engine') hint.engine.push(path);
      else hint.locked.push(path);
    }
  }
  return hint;
}

export interface PromptInput {
  state: GameState;
  derived: DerivedValues;
  scene: SceneContext;
  /** Lượt đã chơi, mới nhất ở cuối. */
  history: readonly TurnEntry[];
  lore: readonly LoreItem[];
  roll: RollContext;
  action: TurnInput;
  budget: BudgetConfig;
  /** Regex của preset SillyTavern (Phần 1 mục 6.7). */
  regexScripts: readonly RegexScript[];
  /** `extensions.SPreset.MacroNest`. */
  macroNest: boolean;
  /** Tên NPC đang đối thoại — giá trị của macro `{{char}}`. */
  charName: string;
}

export function emptyPromptInput(state: GameState): PromptInput {
  return {
    state,
    derived: {},
    scene: emptyScene(),
    history: [],
    lore: [],
    roll: emptyRoll(),
    action: { kind: 'freeform', text: '' },
    budget: DEFAULT_BUDGET,
    regexScripts: [],
    macroNest: false,
    charName: '',
  };
}

// ---------------------------------------------------------------------------
// Lắp prompt
// ---------------------------------------------------------------------------

export interface RenderedBlock {
  id: string;
  name: string;
  role: PromptBlock['role'];
  placement: PromptBlock['placement'];
  priority: number;
  text: string;
  tokens: number;
  /** Lỗi template — khối bị bỏ qua nhưng lượt vẫn chạy tiếp (mục 5). */
  error: TemplateError | null;
  macroIssues: MacroIssue[];
  /** Vì sao khối không vào prompt: tắt, condition sai, rỗng, hay bị cắt. */
  skipped: string | null;
  elapsedMs: number;
}

export interface AssembledPrompt {
  system: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
  blocks: RenderedBlock[];
  /** Tổng token của phần đã giữ lại. */
  tokens: number;
  limit: number;
  /** Đặt khi cắt hết mức mà vẫn vượt ngân sách — KHÔNG được gửi đi (mục 9). */
  overflow: string | null;
  /** Toàn văn prompt, tô theo khối, cho panel xem trước. */
  preview: string;
}

/** Placement của regex theo vai khối (Phần 1 mục 6.7). */
function regexPlacement(role: PromptBlock['role']): 1 | 2 | 3 {
  if (role === 'user') return 1;
  if (role === 'assistant') return 2;
  return 3;
}

/**
 * Bộ locals của mục 6.
 *
 * Lộ ra ngoài vì trình quét lorebook của Phần 4 chạy `condition` bằng đúng bộ
 * locals này — hai bộ khác nhau thì một biểu thức chạy đúng trong editor lại
 * sai lúc chơi, và đó là loại lệch không ai tìm ra.
 */
export function buildPromptLocals(
  input: PromptInput,
  used: number,
  limit: number,
): Record<string, unknown> {
  const query = createQuery({
    state: input.state,
    derived: input.derived,
    history: input.history,
    scene: input.scene,
    charName: input.charName,
  });

  return {
    state: readonlyState(input.state),
    d: readonlyState(input.derived, 'd'),
    roll: input.roll,
    lore: input.lore,
    history: input.history,
    scene: input.scene,
    now: input.state.meta.gameDate,
    budget: { total: limit, used, remaining: Math.max(0, limit - used) },
    q: query,
    fmt,
    action: input.action,
    schema: describeSchema(),
  };
}

/**
 * Lắp danh sách khối thành một prompt hoàn chỉnh.
 *
 * Không bao giờ ném: khối hỏng bị đánh dấu `error` và bỏ qua. Chỉ có một
 * trường hợp dừng hẳn, và nó nằm ở `overflow` — vượt ngân sách sau khi đã cắt
 * hết mức thì mục 9 bắt phải báo lỗi thay vì gửi một prompt cụt đầu.
 */
export async function assemblePrompt(
  blocks: readonly PromptBlock[],
  input: PromptInput,
  counter: TokenCounter = estimateCounter,
  macroContext?: MacroContext,
): Promise<AssembledPrompt> {
  const limit = promptLimit(input.budget);
  const ordered = sortBlocks(blocks);

  const macros =
    macroContext ??
    createMacroContext({
      gameDate: input.state.meta.gameDate,
      user: input.state.player.name,
      char: input.charName,
      lastMessage: input.history.at(-1)?.narrative ?? '',
      rng: macroRng(input.state.meta.seed, input.state.meta.turn),
      readState: (path) => readPath(input.state, path),
      nest: input.macroNest,
    });

  // Không gian nháp sống trong đúng MỘT lần lắp (mục 7.1).
  resetScratch(macros);

  // --- Vòng 1: regex + macro cho MỌI khối ---------------------------------
  const staged: { block: PromptBlock; text: string; macroIssues: MacroIssue[]; skipped: string | null }[] = [];

  for (const block of ordered) {
    if (!block.enabled) {
      staged.push({ block, text: '', macroIssues: [], skipped: 'đang tắt' });
      continue;
    }

    const regexed = applyRegexScripts(block.template, input.regexScripts, {
      placement: regexPlacement(block.role),
      target: 'prompt',
    });
    const expanded = expandMacros(regexed.text, macros, block.id);
    staged.push({ block, text: expanded.text, macroIssues: expanded.issues, skipped: null });
  }

  // --- Vòng 2: EJS + đếm token --------------------------------------------
  const rendered: RenderedBlock[] = [];
  let running = 0;

  for (const item of staged) {
    const { block } = item;
    const base: RenderedBlock = {
      id: block.id,
      name: block.name,
      role: block.role,
      placement: block.placement,
      priority: block.budgetPriority,
      text: '',
      tokens: 0,
      error: null,
      macroIssues: item.macroIssues,
      skipped: item.skipped,
      elapsedMs: 0,
    };

    if (item.skipped !== null) {
      rendered.push(base);
      continue;
    }

    const locals = buildPromptLocals(input, running, limit);

    if (block.condition !== undefined && block.condition.trim() !== '') {
      const condition = evaluateCondition(block.condition, locals);
      if (condition.error !== null) {
        rendered.push({ ...base, error: condition.error, skipped: 'condition lỗi' });
        continue;
      }
      if (!condition.value) {
        rendered.push({ ...base, skipped: 'condition sai' });
        continue;
      }
    }

    const result = renderTemplate(item.text, locals);
    if (result.error !== null) {
      rendered.push({ ...base, error: result.error, elapsedMs: result.elapsedMs, skipped: 'template lỗi' });
      continue;
    }

    // `<% %>` đứng riêng một dòng để lại đúng cái dòng trống đó — EJS xưa nay
    // vẫn thế. Gộp ba dòng trống trở lên thành một: prompt sạch hơn và không
    // phải trả token cho khoảng trắng, mà template thì vẫn viết cho dễ đọc.
    const text = result.text.replace(/\n{3,}/g, '\n\n').trim();
    if (text === '') {
      rendered.push({ ...base, elapsedMs: result.elapsedMs, skipped: 'render ra chuỗi rỗng' });
      continue;
    }

    const tokens = await counter(text);
    running += tokens;
    rendered.push({ ...base, text, tokens, elapsedMs: result.elapsedMs });
  }

  // --- Ngân sách (mục 9) ---------------------------------------------------
  const live = rendered.filter((block) => block.skipped === null);
  const outcome = trimToBudget(live, input.budget);
  const keptIds = new Set(outcome.kept.map((block) => block.id));

  for (const block of rendered) {
    if (block.skipped !== null) continue;
    if (!keptIds.has(block.id)) block.skipped = 'bị cắt vì ngân sách token';
  }

  // --- Sắp chỗ: sequential trước, rồi chèn theo độ sâu ---------------------
  const kept = rendered.filter((block) => block.skipped === null);
  const laid: RenderedBlock[] = kept.filter((block) => block.placement === 'sequential');
  const byDepth = kept
    .filter((block) => block.placement !== 'sequential')
    .sort((left, right) => {
      const l = typeof left.placement === 'object' ? left.placement.depth : 0;
      const r = typeof right.placement === 'object' ? right.placement.depth : 0;
      return r - l;
    });

  for (const block of byDepth) {
    const depth = typeof block.placement === 'object' ? block.placement.depth : 0;
    laid.splice(Math.max(0, laid.length - depth), 0, block);
  }

  // --- Gộp thành LLMRequest ------------------------------------------------
  const systemParts = laid.filter((block) => block.role === 'system').map((block) => block.text);
  const messages: { role: 'user' | 'assistant'; content: string }[] = [];

  for (const block of laid) {
    if (block.role === 'system') continue;
    const previous = messages.at(-1);
    // Gộp hai tin nhắn cùng vai: Anthropic đòi vai luân phiên và trả 400 khi
    // có hai `user` liền nhau, mà bộ khối mặc định thì có đúng như thế
    // (khối 10 lịch sử và khối 12 hành động).
    if (previous !== undefined && previous.role === block.role) {
      previous.content = `${previous.content}\n\n${block.text}`;
      continue;
    }
    messages.push({ role: block.role, content: block.text });
  }

  // Tin nhắn đầu tiên phải là `user` — cùng lý do ở trên.
  if (messages.length === 0) {
    messages.push({ role: 'user', content: '(tiếp tục cảnh)' });
  } else if (messages[0]?.role === 'assistant') {
    messages.unshift({ role: 'user', content: '(tiếp tục cảnh)' });
  }

  const preview = laid
    .map((block) => `──── [${block.role}] ${block.name} · ${block.tokens} token ────\n${block.text}`)
    .join('\n\n');

  return {
    system: systemParts.join('\n\n'),
    messages,
    blocks: rendered,
    tokens: outcome.used,
    limit: outcome.limit,
    overflow: outcome.overflow,
    preview,
  };
}

export function toLLMRequest(prompt: AssembledPrompt, maxTokens: number): LLMRequest {
  return { system: prompt.system, messages: prompt.messages, maxTokens };
}

// ---------------------------------------------------------------------------
// Bước 2 — RESOLVE (Phần 5)
// ---------------------------------------------------------------------------

export type Resolver = (input: TurnInput, rng: Rng, state: GameState) => RollContext;

/**
 * Bộ giải mặc định của một lượt tự do — hệ kiểm định thật của Phần 5.
 *
 * Chi tiết và những chỗ còn dùng số nền nằm ở `/src/systems/check/resolve.ts`.
 * Minigame của Phần 9–11 KHÔNG đi qua đây; chúng gọi thẳng `runCheck` và
 * `contestedCheck` với miền của riêng chúng.
 */
export const defaultResolver: Resolver = (input, rng, state) => resolveTurn(input, rng, state);

// ---------------------------------------------------------------------------
// Vòng lặp một lượt (mục 12.9)
// ---------------------------------------------------------------------------

export interface TurnDeps {
  provider: LLMProvider;
  cfg: ConnCfg;
  /**
   * Hồ sơ riêng cho VÒNG CẬP NHẬT BIẾN (Phần 2 mục 6).
   *
   * Vòng đó không viết một chữ nào của truyện: nó đọc lỗi kiểm duyệt rồi trả về
   * một khối `<UpdateVariable>` đã sửa. Việc máy móc, prompt ngắn, và có thể xảy
   * ra hai lần mỗi lượt — nên nó xứng đáng có kết nối riêng, thường là một model
   * rẻ hơn nhiều. Bỏ trống thì dùng chính kết nối kể chuyện.
   */
  variablesProvider?: LLMProvider;
  variablesCfg?: ConnCfg;
  /** Nhãn hồ sơ cho tab Debug: `main` hay `variables`. */
  variablesProfile?: string;
  blocks: readonly PromptBlock[];
  budget?: BudgetConfig;
  regexScripts?: readonly RegexScript[];
  macroNest?: boolean;
  scene?: SceneContext;
  lore?: readonly LoreItem[];
  /**
   * Op do ENGINE tự tính trước khi gọi AI — hiện là trigger của lorebook
   * (Phần 4 mục 10). Chúng áp TRƯỚC lô của AI và với actor `engine`, vì chúng
   * là sự thật cơ học của lượt chứ không phải đề xuất.
   */
  engineOps?: readonly PatchOp[];
  history?: readonly TurnEntry[];
  charName?: string;
  maxTokens?: number;
  counter?: TokenCounter;
  resolve?: Resolver;
  onChunk?: (text: string) => void;
  signal?: AbortSignal;
}

export interface TurnResult {
  /** Bước cuối cùng chạy xong. Lượt hỏng giữa chừng vẫn đọc được tới đâu. */
  reachedStep: TurnStep;
  prompt: AssembledPrompt;
  /** Nguyên văn model trả về. */
  raw: string;
  narrative: string;
  ops: PatchOp[];
  parseIssues: ParseIssue[];
  patch: ApplyResult | null;
  repair: RepairOutcome | null;
  /**
   * Op của engine bị MVU từ chối. Khác lô của AI, đây là bug của engine chứ
   * không phải AI viết ẩu, nên nó phải nổi lên chứ không được nuốt.
   */
  engineFailures: OpFailure[];
  /** State sau khi ghi. `null` khi lô bị từ chối — state cũ giữ nguyên (R4). */
  nextState: GameState | null;
  derived: DerivedValues;
  rngAfter: RngHubState;
  entry: TurnEntry | null;
  /**
   * Lời mời trận đánh AI phát ra giữa đoạn văn, đã qua kiểm duyệt.
   *
   * `null` nghĩa là lượt này không có thẻ nào, hoặc có mà bị từ chối. Nó KHÔNG
   * tự mở minigame: UI hiện nó thành một tấm thẻ hai nút, và người chơi mới là
   * bên quyết (xem `/src/systems/encounter/README.md`).
   */
  encounter: EncounterOffer | null;
  /** Vì sao một lời mời bị từ chối, hoặc bị engine hạ nấc. Tab Debug đọc chỗ này. */
  encounterIssues: string[];
  /**
   * Biên bản lượt theo đúng hợp đồng của Phần 0 mục 6 — thứ bước 10 ghi xuống
   * Tầng A và nối vào Tầng B. Lượt hỏng giữa chừng VẪN có biên bản, chỉ khác
   * `reachedStep`.
   */
  record: TurnRecord;
  error: string | null;
}

/**
 * Một dòng tóm tắt cho danh sách lượt. Luôn nêu TÊN HỆ: mục 2 của Phần 5 nói
 * người chơi phải nhìn thấy hệ nào đang chạy, nếu không họ mất khả năng ước
 * lượng cơ hội của chính mình.
 */
function summarize(roll: RollContext): string {
  if (roll.checks.length === 0) return '';
  return roll.checks
    .map((check) => {
      const against =
        check.dc !== undefined
          ? `DC ${check.dc}`
          : check.target !== undefined
            ? `ngưỡng ${check.target}`
            : '';
      const rolled = check.raw.join('+');
      return `${check.id} · ${SYSTEM_LABELS[check.system]} ${rolled}${against === '' ? '' : ` / ${against}`} → ${TIER_LABELS[check.tier]}`;
    })
    .join('; ');
}

/**
 * Chạy trọn một lượt: bước 1 → 7 rồi trả về state mới cho người gọi commit.
 *
 * Không tự ghi vào store. Người gọi (UI) mới là chỗ biết lúc nào nên chốt —
 * và cũng là chỗ giữ ngăn xếp undo, vốn phải chụp state TRƯỚC khi lượt chạy.
 */
export async function runTurn(
  state: GameState,
  action: TurnInput,
  deps: TurnDeps,
): Promise<TurnResult> {
  const hub = createRngHub(state.meta.seed, state.meta.rng);
  const budget = deps.budget ?? DEFAULT_BUDGET;
  const turnNumber = state.meta.turn + 1;
  const engineFailures: OpFailure[] = [];

  // --- Bước 2a: VÒNG CƠ THỂ (Phần 7 mục 7) --------------------------------
  //
  // Chạy TRƯỚC phép kiểm của lượt và trước khi lắp prompt, vì cả hai đều phải
  // nhìn thấy cơ thể của HÔM NAY: cơn sốt lên trong đêm phải phạt cú tung sáng
  // nay, và người kể chuyện phải đọc được nó trước khi viết cảnh. Đặt vòng này
  // ở bước 8 thì mọi hệ quả của nó luôn trễ đúng một lượt.
  //
  // Dòng xúc sắc riêng: số lần tung ở đây thay đổi theo số vết thương đang
  // mang, và trên dòng `main` thì nó sẽ đẩy lệch mọi cú tung của người chơi (R3).
  const body = bodyTurn(state, hub.stream(BODY_STREAM), turnNumber);
  let opening = state;
  if (body.ops.length > 0) {
    const applied = applyPatch(state, body.ops, { actor: 'engine' });
    if (applied.applied && applied.next !== null) opening = applied.next;
    engineFailures.push(...applied.failures);
  }
  // Ghi TRƯỚC phép kiểm của lượt: `checkLog.last()` phải là cú tung mà người
  // chơi vừa gây ra, không phải một cú tung chống nhiễm trùng của cơ thể.
  checkLog.recordAll(turnNumber, body.checks);

  // --- Bước 2b: RESOLVE. Luôn chạy TRƯỚC mọi lời gọi AI (R1). -------------
  const resolver = deps.resolve ?? defaultResolver;
  const roll = resolver(action, hub.main(), opening);
  roll.notes.push(...body.log);

  // Mục 11 của Phần 5: MỌI lần tung phải vào log. Ghi ở đây chứ không ghi trong
  // `runCheck` — hàm đó phải thuần và phải rẻ, vì Phần 9–11 gọi nó trong vòng
  // lặp chiến trận và bài Monte Carlo gọi nó 100.000 lần một hệ.
  checkLog.recordAll(turnNumber, roll.checks);

  // --- Bước 2c: RÈN LUYỆN (Phần 8 mục 3) ----------------------------------
  //
  // Ngay sau phép kiểm và TRƯỚC khi lắp prompt: người kể chuyện phải đọc được
  // rằng cú tung vừa rồi đã đẩy kiếm thuật lên một bậc, chứ không kể lượt đó
  // như một buổi tập bình thường rồi mới thấy con số đổi ở lượt sau.
  //
  // Điểm rèn luyện là hệ quả TẤT ĐỊNH của cú tung đã xảy ra — không rút thêm
  // một con xúc sắc nào, nên nó không làm xê dịch dòng RNG (R3).
  const skills = skillsTurn(opening, roll.checks, turnNumber);
  if (skills.ops.length > 0) {
    const applied = applyPatch(opening, skills.ops, { actor: 'engine' });
    if (applied.applied && applied.next !== null) opening = applied.next;
    engineFailures.push(...applied.failures);
  }
  roll.notes.push(...skills.lines);

  // Biến phụ dựng trên state SAU vòng cơ thể: khối prompt số 7 và bảng trạng
  // thái phải nói cùng một con số với thứ vừa xảy ra trong đêm.
  const derivedBefore = computeDerived(opening);

  const input: PromptInput = {
    state: opening,
    derived: derivedBefore,
    scene: deps.scene ?? emptyScene(),
    history: deps.history ?? [],
    lore: deps.lore ?? [],
    roll,
    action,
    budget,
    regexScripts: deps.regexScripts ?? [],
    macroNest: deps.macroNest ?? false,
    charName: deps.charName ?? '',
  };

  // `state.meta.rng` là vị trí xúc sắc TRƯỚC khi bước 2 rút — undo tua về đây.
  const rngBefore = state.meta.rng;

  const buildRecord = (
    step: TurnStep,
    narrative: string,
    patch: ApplyResult | null,
    opCount = 0,
  ): TurnRecord => {
    const outcome: MechanicalOutcome = {
      checks: roll.checks,
      // Op của vòng cơ thể đứng ĐẦU, rồi tới op rèn luyện: cả hai đã áp trước
      // khi prompt được lắp, nên biên bản phải kể đúng thứ tự đó (Phần 0 mục 6).
      engineOps: [...body.ops, ...skills.ops, ...(deps.engineOps ?? [])],
      timeCost: roll.timeCost,
      rngAfter: hub.getState(),
    };
    return {
      turn: state.meta.turn + 1,
      gameDate: state.meta.gameDate,
      rngBefore,
      input: action,
      outcome,
      narrative,
      patch: {
        applied: patch?.applied ?? false,
        opCount,
        rejections: (patch?.failures ?? []).map((failure) => ({
          path: failure.op.path,
          reason: `${failure.step}: ${failure.message}`,
        })),
      },
      // Bước 8 thuộc Phần 15; tới lúc đó biên bản này mới có số thật.
      tick: { eventCount: 0, llmCallsUsed: 0 },
      reachedStep: step,
      wallClock: Date.now(),
    };
  };

  const fail = (
    step: TurnStep,
    prompt: AssembledPrompt,
    error: string,
    extra: Partial<TurnResult> = {},
  ): TurnResult => ({
    reachedStep: step,
    prompt,
    raw: '',
    narrative: '',
    ops: [],
    parseIssues: [],
    patch: null,
    repair: null,
    engineFailures: [...engineFailures],
    // Lượt hỏng ở bước 3 hoặc 4 vẫn phải GIỮ kết quả vòng cơ thể: cơn sốt đêm
    // qua đã xảy ra rồi, và vứt nó đi vì proxy lỗi là làm người chơi khỏe lại
    // nhờ một sự cố mạng.
    nextState: opening === state ? null : opening,
    derived: derivedBefore,
    rngAfter: hub.getState(),
    entry: null,
    encounter: null,
    encounterIssues: [],
    record: buildRecord(step, '', null),
    error,
    ...extra,
  });

  // --- Bước 3: CONTEXT ----------------------------------------------------
  const prompt = await assemblePrompt(deps.blocks, input, deps.counter ?? estimateCounter);
  if (prompt.overflow !== null) return fail('context', prompt, prompt.overflow);

  // --- Bước 4: CALL -------------------------------------------------------
  // Trần đầu ra CHÍNH LÀ phần ngân sách đã chừa lại (mục 9). Để hai con số rời
  // nhau thì "chừa 2000 token cho đầu ra" chỉ là một dòng chữ trên UI.
  const request: LLMRequest = {
    ...toLLMRequest(prompt, deps.maxTokens ?? budget.reserveForOutput),
    meta: { profile: 'main' },
    ...(deps.signal === undefined ? {} : { signal: deps.signal }),
  };

  let raw: string;
  try {
    const response = await deps.provider.stream(request, deps.cfg, deps.onChunk ?? (() => {}));
    raw = response.text;
  } catch (error) {
    return fail('call', prompt, `Gọi AI hỏng: ${String(error)}`);
  }

  // --- Bước 5: PARSE ------------------------------------------------------
  const parsed = parseUpdateVariables(raw);
  // Thẻ `<RequestInjury>` và `<Request{Duel,Battle,Siege}>` bị bóc khỏi đoạn văn
  // cùng lúc với khối UpdateVariable: người chơi đọc truyện, không đọc thẻ
  // (Phần 7 mục 3, và `/src/systems/encounter`).
  const narrative = stripMarchOrders(
    stripRecruitmentRequests(stripEncounterRequests(stripInjuryRequests(stripUpdateBlocks(raw)))),
  );
  // Thẻ là nguồn chính. Nếu model kể rõ một cuộc quyết đấu/dã chiến/vây hãm
  // nhưng quên thẻ, văn xuôi vẫn là một nguồn sự kiện và phải mở đúng minigame.
  const encounterRequests = encounterRequestsFromOutput(raw);

  // --- Bước 6: VALIDATE ---------------------------------------------------
  let patch: ApplyResult | null = null;
  let repair: RepairOutcome | null = null;
  let nextState: GameState | null = opening === state ? null : opening;

  // Op của engine áp TRƯỚC, và áp riêng: gộp chúng vào lô của AI thì một op sai
  // của AI sẽ kéo theo cả sự thật cơ học bị hủy (R4 là all-or-nothing TRONG một
  // lô, không phải giữa hai nguồn khác nhau).
  const engineOps = deps.engineOps ?? [];
  let base = opening;
  if (engineOps.length > 0) {
    const enginePatch = applyPatch(base, engineOps, { actor: 'engine' });
    if (enginePatch.applied && enginePatch.next !== null) {
      base = enginePatch.next;
      nextState = enginePatch.next;
    }
    engineFailures.push(...enginePatch.failures);
  }

  // Đề nghị gây thương tích của AI (Phần 7 mục 3): AI ĐỀ NGHỊ, engine PHÁN
  // QUYẾT. Áp thành một lô engine RIÊNG, sau lô của AI — nếu gộp chung thì một
  // op sai của AI sẽ hủy luôn vết thương mà chính nó vừa kể ra, và truyện với
  // cơ học lệch nhau ngay trong một lượt.
  const injuryRequests = handleAiText(base, hub.stream(BODY_STREAM), raw, turnNumber);
  if (injuryRequests.ops.length > 0) {
    const injuryPatch = applyPatch(base, injuryRequests.ops, { actor: 'engine' });
    if (injuryPatch.applied && injuryPatch.next !== null) {
      base = injuryPatch.next;
      nextState = injuryPatch.next;
    }
    engineFailures.push(...injuryPatch.failures);
  }

  // Truyện chỉ ĐỀ NGHỊ một lệnh tuyển. Bộ quân sự tự kiểm kho bạc, doanh trại,
  // nhân lực và hậu cần rồi mới tạo hàng đợi; model không được tự sinh quân.
  const recruitmentRequests = handleAiRecruitment(base, raw, base.meta.gameDate);
  if (recruitmentRequests.ops.length > 0) {
    const recruitmentPatch = applyPatch(base, recruitmentRequests.ops, { actor: 'engine' });
    if (recruitmentPatch.applied && recruitmentPatch.next !== null) {
      base = recruitmentPatch.next;
      nextState = recruitmentPatch.next;
    }
    engineFailures.push(...recruitmentPatch.failures);
  }

  // Truyện chỉ nói quân ĐI ĐÂU. Chiến đồ quyết đi đường nào, mấy chặng, mấy
  // ngày — và trong lúc đi thì đạo quân nằm giữa hai ô chứ không có mặt sẵn ở
  // đích. Đây là chỗ duy nhất một câu văn chạm được vào vị trí quân.
  const marchOrders = handleAiMarchOrders(base, raw);
  if (marchOrders.ops.length > 0) {
    const marchPatch = applyPatch(base, marchOrders.ops, { actor: 'engine' });
    if (marchPatch.applied && marchPatch.next !== null) {
      base = marchPatch.next;
      nextState = marchPatch.next;
    }
    engineFailures.push(...marchPatch.failures);
  }

  let aiOps = reconcileCodexOps(base, parsed.ops, turnNumber);
  if (aiOps.length > 0) {
    patch = applyPatch(base, aiOps, { actor: 'ai' });
    if (patch.applied) {
      nextState = patch.next;
    } else {
      // Vòng sửa lỗi tầng 1 của Phần 2 — ngắn, không kèm lại ngữ cảnh lượt.
      repair = await repairPatch({
        state: base,
        failures: patch.failures,
        ask: providerCaller(
          deps.variablesProvider ?? deps.provider,
          deps.variablesCfg ?? deps.cfg,
          1024,
          deps.variablesProfile ?? 'main',
        ),
        transformOps: (repairState, ops) => reconcileCodexOps(repairState, ops, turnNumber),
      });
      if (repair.repaired) {
        patch = repair.final;
        nextState = repair.final.next;
        aiOps = repair.ops;
      }
    }
  }

  // --- Bước 7: DERIVE -----------------------------------------------------
  const committed = nextState ?? opening;
  const derived = computeDerived(committed, {
    previous: derivedBefore,
    ...(patch === null ? {} : { changedPaths: patch.changedPaths }),
  });

  const entry: TurnEntry = {
    turn: state.meta.turn + 1,
    gameDate: committed.meta.gameDate,
    action: action.text,
    narrative,
    outcome: summarize(roll),
  };

  // Lời mời trận đánh xét trên state ĐÃ CHỐT, không xét trên `opening`: nếu vết
  // thương lượt này vừa giết nhân vật thì cửa kiểm duyệt phải nhìn thấy điều đó.
  const screening = screenEncounters(committed, encounterRequests, turnNumber);

  return {
    // Bước 8 (mô phỏng ngầm) thuộc Phần 15; bước 9 và 10 do người gọi làm.
    reachedStep: 'derive',
    record: buildRecord('derive', narrative, patch, aiOps.length),
    prompt,
    raw,
    narrative,
    ops: aiOps,
    parseIssues: parsed.issues,
    patch,
    repair,
    engineFailures,
    nextState,
    derived,
    rngAfter: hub.getState(),
    entry,
    encounter: screening.offer,
    encounterIssues: [
      ...screening.log,
      ...screening.refused.map((refusal) => `từ chối lời mời (${refusal.request.kind}): ${refusal.reason}`),
    ],
    error:
      parsed.blockCount === 0
        ? 'Model không trả về khối <UpdateVariable> nào — state giữ nguyên.'
        : patch !== null && !patch.applied
          ? 'Lô cập nhật biến bị từ chối sau cả vòng sửa lỗi — state giữ nguyên.'
          : null,
  };
}
