/**
 * Trình import preset SillyTavern (Phần 1 mục 6.2 → 6.5).
 *
 * Bốn cái bẫy đã kiểm chứng trên file thật, cả bốn đều được xử lý ở đây:
 *   1. `prompt_order[0].order` MỚI LÀ NGUỒN SỰ THẬT về thứ tự VÀ về enabled.
 *   2. Có prompt mồ côi — nằm trong `prompts[]` mà không có trong prompt_order.
 *      Đưa xuống cuối, MẶC ĐỊNH TẮT, kèm cảnh báo. Không được im lặng bỏ đi.
 *   3. `id` không phải lúc nào cũng bằng `identifier`. Chỉ dùng `identifier`.
 *   4. `prompt_order` là mảng theo character_id — lấy 100001 nếu có.
 *
 * Và mục 6.4: engine BẮT BUỘC tự chèn bốn khối [LOCKED], không phụ thuộc file
 * preset có gì. Thiếu chúng là AI bịa số và không trả patch.
 */

import { z } from 'zod';
import { normalizeRegexScript, type RegexScript } from '../regex/runner';
import { normalizeHelperScript, type HelperScript } from '../scripts/host';
import {
  CHAT_HISTORY_MARKER,
  deriveBudgetPriority,
  LOCKED_BLOCK_SPECS,
  MARKER_TO_GAME_BLOCK,
  MARKERS_DEFAULT_OFF,
  type BlockPlacement,
  type BlockRole,
  type PromptBlock,
} from './blocks';
import {
  GLOBAL_CHARACTER_ID,
  regexesOf,
  sillyTavernPresetSchema,
  type PromptEntry,
  type RegexScriptRaw,
  type SillyTavernPreset,
} from './schema';

export interface GamePreset {
  name: string;
  /** Tham số sampler ở cấp cao nhất, giữ nguyên tên của SillyTavern. */
  samplerParams: Record<string, unknown>;
  blocks: PromptBlock[];
  regexScripts: RegexScript[];
  helperScripts: HelperScript[];
  /** Bản gốc, giữ nguyên để export lại không mất trường nào. */
  source: SillyTavernPreset;
}

export interface ImportReport {
  presetName: string;
  /** Tổng số khối sau khi import, kể cả khối engine chèn thêm. */
  totalBlocks: number;
  /** Số khối lấy từ prompt_order. */
  fromOrder: number;
  /** Mồ côi: có trong prompts[] mà không có trong prompt_order (bẫy 2). */
  orphans: string[];
  /** prompt_order trỏ tới identifier không tồn tại trong prompts[]. */
  danglingOrderEntries: string[];
  /** prompts[].enabled mâu thuẫn với prompt_order[].enabled (bẫy 1). */
  enabledMismatches: { identifier: string; inPrompts: boolean; inOrder: boolean }[];
  /** `id` khác `identifier` (bẫy 3) — đã bỏ qua `id`. */
  idMismatches: { identifier: string; id: string }[];
  /** prompt_order nào đã được chọn (bẫy 4). */
  orderSource: { characterId: number | null; usedGlobalDefault: boolean };
  /** Marker đã ánh xạ sang khối của game (mục 6.3). */
  markers: { identifier: string; gameBlock: string; forcedOff: boolean }[];
  /** Bốn khối engine đã chèn (mục 6.4). */
  engineInserted: string[];
  regexScripts: { total: number; rejected: number };
  helperScripts: { ui: number; compute: number };
  /**
   * Tham số của preset đã áp vào hồ sơ kết nối nào, và cái gì bị bỏ qua.
   * Trống khi người gọi không yêu cầu áp (ví dụ trong test của trình import).
   */
  tuning: { profile: string; applied: string[]; ignored: string[] }[];
  /** Extension nào nhận ra, cái nào chưa làm được. */
  extensions: { key: string; status: 'đã hỗ trợ' | 'chưa hỗ trợ'; note: string }[];
  warnings: string[];
  /** Thông báo bắt buộc hiện lên sau khi import (mục 6.4). */
  notice: string;
}

export interface ImportResult {
  preset: GamePreset;
  report: ImportReport;
}

export class PresetImportError extends Error {
  constructor(
    message: string,
    readonly issues: string[],
  ) {
    super(message);
    this.name = 'PresetImportError';
  }
}

const SAMPLER_KEYS = [
  'temperature',
  'frequency_penalty',
  'presence_penalty',
  'top_p',
  'top_k',
  'top_a',
  'min_p',
  'repetition_penalty',
  'openai_max_context',
  'openai_max_tokens',
  'max_context_unlocked',
  'seed',
  'n',
  'stream_openai',
  'reasoning_effort',
  'verbosity',
  'show_thoughts',
  'function_calling',
  'tool_call_recurse_limit',
  'enable_web_search',
  'squash_system_messages',
  'names_behavior',
  'wrap_in_quotes',
  'continue_prefill',
  'continue_postfix',
  'assistant_prefill',
  'assistant_impersonation',
] as const;

function placementOf(entry: PromptEntry): BlockPlacement {
  return entry.injection_position === 1
    ? { kind: 'depth', depth: entry.injection_depth ?? 0 }
    : { kind: 'sequential' };
}

function roleOf(entry: PromptEntry): BlockRole {
  return entry.role ?? (entry.system_prompt === true ? 'system' : 'user');
}

function toBlock(entry: PromptEntry, enabled: boolean, source: 'preset' | 'orphan'): PromptBlock {
  const marker = entry.marker === true;
  const gameBlock = MARKER_TO_GAME_BLOCK[entry.identifier];

  const block: PromptBlock = {
    id: entry.identifier,
    name: entry.name ?? entry.identifier,
    enabled,
    role: roleOf(entry),
    template: entry.content ?? '',
    placement: placementOf(entry),
    injectionOrder: entry.injection_order ?? 0,
    systemPrompt: entry.system_prompt === true,
    marker,
    forbidOverrides: entry.forbid_overrides === true,
    // forbid_overrides true → coi như locked, không cho sửa nội dung (mục 6.5).
    locked: entry.forbid_overrides === true,
    budgetPriority: deriveBudgetPriority(entry.identifier, source),
    source,
  };
  if (entry.injection_trigger !== undefined) block.injectionTrigger = entry.injection_trigger;
  if (gameBlock !== undefined) block.gameBlock = gameBlock;
  return block;
}

function engineBlock(spec: (typeof LOCKED_BLOCK_SPECS)[number]): PromptBlock {
  return {
    id: spec.id,
    name: `[LOCKED] ${spec.name}`,
    enabled: true,
    role: spec.role,
    // Nội dung thật là file .ejs của Phần 3; Phần 1 chỉ giữ chỗ.
    template: `<%- block${spec.blockNumber} %>`,
    placement: { kind: 'sequential' },
    injectionOrder: 0,
    systemPrompt: spec.role === 'system',
    marker: false,
    forbidOverrides: true,
    locked: true,
    budgetPriority: deriveBudgetPriority(spec.id, 'engine'),
    source: 'engine',
  };
}

/**
 * Chèn bốn khối [LOCKED] vào đúng chỗ (mục 6.4).
 * Neo theo marker `chatHistory`; nếu preset không có marker đó thì vẫn phải
 * chèn được, chỉ là kèm cảnh báo — thiếu khối còn tệ hơn đặt sai chỗ.
 */
function insertLockedBlocks(blocks: PromptBlock[], warnings: string[]): string[] {
  const inserted: string[] = [];
  const specById = new Map(LOCKED_BLOCK_SPECS.map((spec) => [spec.anchor, spec] as const));

  const rules = specById.get('afterFirstSystem');
  if (rules !== undefined) {
    const firstSystem = blocks.findIndex((block) => block.role === 'system');
    blocks.splice(firstSystem === -1 ? 0 : firstSystem + 1, 0, engineBlock(rules));
    inserted.push(rules.id);
    if (firstSystem === -1) {
      warnings.push('Preset không có khối system nào — đã đặt "Luật bất biến" lên đầu.');
    }
  }

  const historyIndex = blocks.findIndex((block) => block.id === CHAT_HISTORY_MARKER);
  if (historyIndex === -1) {
    warnings.push(
      `Preset không có ô cắm "${CHAT_HISTORY_MARKER}" — đã đặt khối KẾT QUẢ XÚC SẮC và Hành động người chơi ở cuối danh sách.`,
    );
  }

  const dice = specById.get('beforeChatHistory');
  if (dice !== undefined) {
    const at = historyIndex === -1 ? blocks.length : historyIndex;
    blocks.splice(at, 0, engineBlock(dice));
    inserted.push(dice.id);
  }

  const action = specById.get('afterChatHistory');
  if (action !== undefined) {
    const at = blocks.findIndex((block) => block.id === CHAT_HISTORY_MARKER);
    blocks.splice(at === -1 ? blocks.length : at + 1, 0, engineBlock(action));
    inserted.push(action.id);
  }

  const syntax = specById.get('last');
  if (syntax !== undefined) {
    blocks.push(engineBlock(syntax));
    inserted.push(syntax.id);
  }

  return inserted;
}

function describeExtensions(preset: SillyTavernPreset): ImportReport['extensions'] {
  const out: ImportReport['extensions'] = [];
  const extensions = preset.extensions;
  if (extensions === undefined) return out;

  const sPreset = extensions.SPreset;
  if (sPreset?.ChatSquash !== undefined) {
    out.push({
      key: 'extensions.SPreset.ChatSquash',
      status: 'chưa hỗ trợ',
      note: 'Gộp lịch sử thành một khối User:/Assistant: — sẽ làm ở Phần 3 nếu cần.',
    });
  }
  if (sPreset?.MacroNest !== undefined) {
    out.push({
      key: 'extensions.SPreset.MacroNest',
      status: 'chưa hỗ trợ',
      note: 'Macro lồng nhau — thuộc Phần 3.',
    });
  }
  if (sPreset?.RegexBinding !== undefined) {
    out.push({ key: 'extensions.SPreset.RegexBinding', status: 'đã hỗ trợ', note: 'Đã nạp vào bộ chạy regex.' });
  }
  if (sPreset?.ToolBindings !== undefined) {
    out.push({ key: 'extensions.SPreset.ToolBindings', status: 'chưa hỗ trợ', note: 'Thường rỗng.' });
  }
  if (extensions.regex_scripts !== undefined) {
    out.push({ key: 'extensions.regex_scripts', status: 'đã hỗ trợ', note: 'Regex kiểu ST cũ, cùng cơ chế.' });
  }
  if (extensions.tavern_helper !== undefined) {
    out.push({ key: 'extensions.tavern_helper.scripts', status: 'đã hỗ trợ', note: 'Đã nạp vào bộ chạy script.' });
  }
  if (extensions.entryGrouping !== undefined) {
    out.push({
      key: 'extensions.entryGrouping',
      status: 'chưa hỗ trợ',
      note: 'Gom nhóm khối trên UI — sẽ dùng khi dựng cây trong Prompt Manager.',
    });
  }
  return out;
}

/**
 * Gộp hai danh sách regex của preset thành một, theo `id`.
 *
 * Bản ĐẦU giữ mẫu và chuỗi thay — hai bản trùng id luôn giống nhau ở hai chỗ
 * đó. Chỉ `disabled` mới hay lệch, và ở đó quy tắc là: TẮT THẮNG. Chạy nhầm một
 * mẫu tác giả đã tắt thì thiệt hại không có trần — preset này có một mẫu xóa
 * trắng cả đoạn văn; bỏ sót một mẫu tác giả đã bật thì cùng lắm mất một khung
 * trang trí, và người chơi bật lại được ở tab Regex.
 */
export function dedupeRegexScripts(scripts: readonly RegexScriptRaw[]): RegexScriptRaw[] {
  const out: RegexScriptRaw[] = [];
  const seen = new Map<string, number>();

  for (const script of scripts) {
    // Mẫu không có id thì không có cách nào biết nó trùng với cái nào — giữ cả.
    if (script.id === undefined || script.id === '') {
      out.push(script);
      continue;
    }
    const at = seen.get(script.id);
    if (at === undefined) {
      seen.set(script.id, out.length);
      out.push(script);
      continue;
    }
    if (script.disabled === true) out[at] = { ...out[at] as RegexScriptRaw, disabled: true };
  }
  return out;
}

/**
 * Nạp một preset SillyTavern.
 * Sai schema thì ném lỗi và KHÔNG trả về preset một nửa (R4).
 */
export function importSillyTavernPreset(raw: unknown, presetName = 'preset'): ImportResult {
  const parsed = sillyTavernPresetSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map(
      (issue) => `${issue.path.join('.') || '(gốc)'}: ${issue.message}`,
    );
    throw new PresetImportError(`Không nạp được preset "${presetName}"`, issues);
  }
  const preset = parsed.data;
  const warnings: string[] = [];

  // --- Bẫy 4: chọn đúng prompt_order ---------------------------------------
  const orders = preset.prompt_order ?? [];
  const global = orders.find((order) => order.character_id === GLOBAL_CHARACTER_ID);
  const chosen = global ?? orders[0];
  const orderSource = {
    characterId: chosen?.character_id ?? null,
    usedGlobalDefault: global !== undefined,
  };
  if (orders.length > 1 && global === undefined) {
    warnings.push(
      `prompt_order có ${orders.length} mục và không có character_id ${GLOBAL_CHARACTER_ID}; đã dùng mục đầu tiên (character_id ${chosen?.character_id ?? '?'}).`,
    );
  }
  if (chosen === undefined) {
    warnings.push('Preset không có prompt_order — mọi khối đều bị coi là mồ côi và mặc định tắt.');
  }

  // --- Bẫy 3: chỉ nối bằng identifier, bỏ qua id ---------------------------
  const entries = preset.prompts ?? [];
  const byIdentifier = new Map<string, PromptEntry>();
  const idMismatches: ImportReport['idMismatches'] = [];
  for (const entry of entries) {
    if (byIdentifier.has(entry.identifier)) {
      warnings.push(`prompts[] có hai mục cùng identifier "${entry.identifier}"; đã giữ mục đầu.`);
      continue;
    }
    byIdentifier.set(entry.identifier, entry);
    if (entry.id !== undefined && entry.id !== entry.identifier) {
      idMismatches.push({ identifier: entry.identifier, id: entry.id });
    }
  }

  // --- Bẫy 1: enabled lấy theo prompt_order --------------------------------
  const blocks: PromptBlock[] = [];
  const enabledMismatches: ImportReport['enabledMismatches'] = [];
  const danglingOrderEntries: string[] = [];
  const placed = new Set<string>();

  for (const orderEntry of chosen?.order ?? []) {
    const entry = byIdentifier.get(orderEntry.identifier);
    if (entry === undefined) {
      danglingOrderEntries.push(orderEntry.identifier);
      continue;
    }
    placed.add(orderEntry.identifier);

    const inOrder = orderEntry.enabled ?? entry.enabled ?? true;
    if (
      orderEntry.enabled !== undefined &&
      entry.enabled !== undefined &&
      orderEntry.enabled !== entry.enabled
    ) {
      enabledMismatches.push({
        identifier: entry.identifier,
        inPrompts: entry.enabled,
        inOrder: orderEntry.enabled,
      });
    }

    // Marker dialogueExamples: mục 6.3 nói mặc định TẮT.
    const forcedOff = entry.marker === true && MARKERS_DEFAULT_OFF.has(entry.identifier);
    blocks.push(toBlock(entry, forcedOff ? false : inOrder, 'preset'));
  }

  // --- Bẫy 2: mồ côi xuống cuối, mặc định tắt, có cảnh báo -----------------
  const orphans: string[] = [];
  for (const entry of entries) {
    if (placed.has(entry.identifier)) continue;
    orphans.push(entry.identifier);
    blocks.push(toBlock(entry, false, 'orphan'));
  }
  if (orphans.length > 0) {
    warnings.push(
      `${orphans.length} khối mồ côi (có trong prompts[] nhưng không có trong prompt_order) đã được đưa xuống cuối và TẮT sẵn: ${orphans.join(', ')}.`,
    );
  }
  if (danglingOrderEntries.length > 0) {
    warnings.push(
      `prompt_order trỏ tới ${danglingOrderEntries.length} identifier không có trong prompts[]: ${danglingOrderEntries.join(', ')}.`,
    );
  }
  if (enabledMismatches.length > 0) {
    warnings.push(
      `${enabledMismatches.length} khối có prompts[].enabled mâu thuẫn với prompt_order; đã lấy theo prompt_order.`,
    );
  }

  const fromOrder = blocks.length - orphans.length;

  // --- Mục 6.3: ghi lại ánh xạ marker --------------------------------------
  const markers = blocks
    .filter((block) => block.marker)
    .map((block) => ({
      identifier: block.id,
      gameBlock: block.gameBlock ?? '(chưa có khối tương ứng)',
      forcedOff: MARKERS_DEFAULT_OFF.has(block.id),
    }));
  const unmappedMarkers = markers.filter((marker) => marker.gameBlock.startsWith('('));
  if (unmappedMarkers.length > 0) {
    warnings.push(
      `Có ${unmappedMarkers.length} ô cắm không nằm trong bảng tám marker: ${unmappedMarkers.map((m) => m.identifier).join(', ')}.`,
    );
  }

  // --- Mục 6.4: chèn bốn khối [LOCKED] -------------------------------------
  const engineInserted = insertLockedBlocks(blocks, warnings);

  // --- Regex + tavern_helper ------------------------------------------------
  //
  // HAI DANH SÁCH NÀY LÀ CÙNG MỘT BỘ REGEX, KHÔNG PHẢI HAI BỘ RỜI.
  //
  // Preset thật chép cả bộ vào cả `SPreset.RegexBinding` lẫn `regex_scripts`:
  // 27 + 23, trùng id gần hết. Nối thẳng hai mảng thì mỗi mẫu chạy HAI LẦN —
  // đủ để một mẫu bọc HTML bọc chồng lên chính nó — và tệ hơn nhiều: ở chỗ hai
  // bản KHÔNG khớp nhau về `disabled`, bản đang bật thắng. Trong preset Tawa
  // có đúng một mẫu như thế, "Ẩn display chathistory": `^([\s\S]*)$` → `""`,
  // tác giả đã TẮT ở bản này và quên tắt ở bản kia. Bật lên là mọi đoạn văn
  // hiển thị bị xóa sạch thành chuỗi rỗng.
  const rawRegex = dedupeRegexScripts([
    ...regexesOf(preset.extensions?.SPreset?.RegexBinding),
    ...(preset.extensions?.regex_scripts ?? []),
  ]);
  const regexScripts = rawRegex.map((script, index) => normalizeRegexScript(script, index));
  const rejectedRegex = regexScripts.filter((script) => script.rejected !== undefined);
  if (rejectedRegex.length > 0) {
    warnings.push(
      `${rejectedRegex.length} regex bị từ chối vì có nguy cơ treo UI: ${rejectedRegex.map((s) => s.name).join(', ')}.`,
    );
  }

  const helperScripts = (preset.extensions?.tavern_helper?.scripts ?? []).map((script, index) =>
    normalizeHelperScript(script, index),
  );

  const samplerParams: Record<string, unknown> = {};
  for (const key of SAMPLER_KEYS) {
    const value = preset[key];
    if (value !== undefined) samplerParams[key] = value;
  }

  const report: ImportReport = {
    presetName,
    totalBlocks: blocks.length,
    fromOrder,
    orphans,
    danglingOrderEntries,
    enabledMismatches,
    idMismatches,
    orderSource,
    markers,
    engineInserted,
    regexScripts: { total: regexScripts.length, rejected: rejectedRegex.length },
    helperScripts: {
      ui: helperScripts.filter((script) => script.kind === 'ui').length,
      compute: helperScripts.filter((script) => script.kind === 'compute').length,
    },
    tuning: [],
    extensions: describeExtensions(preset),
    warnings,
    notice: 'Đã bổ sung 4 khối bắt buộc của engine.',
  };

  return {
    preset: { name: presetName, samplerParams, blocks, regexScripts, helperScripts, source: preset },
    report,
  };
}

/** Báo cáo import ở dạng chữ, để hiện trên UI và in ra trong test. */
export function formatImportReport(report: ImportReport): string {
  const lines: string[] = [
    `Preset: ${report.presetName}`,
    `Tổng số khối: ${report.totalBlocks} (${report.fromOrder} từ prompt_order, ${report.orphans.length} mồ côi, ${report.engineInserted.length} do engine chèn)`,
    `prompt_order đã dùng: character_id ${report.orderSource.characterId ?? '(không có)'}${report.orderSource.usedGlobalDefault ? ' — mặc định toàn cục' : ''}`,
    `Lệch enabled giữa prompts[] và prompt_order: ${report.enabledMismatches.length}`,
    `id khác identifier: ${report.idMismatches.length} (đã bỏ qua id)`,
    `Ô cắm marker: ${report.markers.length}`,
    `Regex: ${report.regexScripts.total} (${report.regexScripts.rejected} bị từ chối)`,
    `Script tavern_helper: ${report.helperScripts.ui} loại UI, ${report.helperScripts.compute} loại tính toán`,
    `${report.notice}`,
  ];
  for (const tuning of report.tuning) {
    lines.push(`Tham số đã áp vào hồ sơ "${tuning.profile}":`);
    for (const line of tuning.applied) lines.push(`  ✓ ${line}`);
    for (const line of tuning.ignored) lines.push(`  – bỏ qua ${line}`);
  }
  if (report.extensions.length > 0) {
    lines.push('Extensions:');
    for (const extension of report.extensions) {
      lines.push(`  - ${extension.key}: ${extension.status} — ${extension.note}`);
    }
  }
  if (report.warnings.length > 0) {
    lines.push('Cảnh báo:');
    for (const warning of report.warnings) lines.push(`  ! ${warning}`);
  }
  return lines.join('\n');
}

/** Zod schema của chính báo cáo, dùng khi lưu báo cáo xuống Tầng A. */
export const importReportSchema = z.object({
  presetName: z.string(),
  totalBlocks: z.number(),
  notice: z.string(),
});
