/**
 * Regex scripts từ preset SillyTavern (Phần 1 mục 6.7).
 *
 * Trong file mẫu, regex được dùng để cắt khối <thinking> khỏi prompt và để bọc
 * chuỗi suy nghĩ bằng CSS khi hiển thị — cả hai đều cần cho game, nên phần này
 * phải hiện thực thật chứ không bỏ qua.
 *
 * VỀ TIMEOUT: JavaScript KHÔNG ngắt được một regex đang chạy trên luồng chính.
 * Nên ở đây có hai lớp:
 *   1. Chặn trước: bắt các mẫu có nguy cơ quay lui thảm họa, không cho chạy.
 *   2. Ngân sách thời gian giữa các script: một danh sách dài không thể treo UI,
 *      dù một regex tham lam đơn lẻ vẫn có thể.
 * Lớp thứ ba — hủy thật sự — nằm ở `sandbox/`, nơi regex chạy trong Worker và
 * `terminate()` được.
 */

import type { RegexScriptRaw } from '../preset/schema';

/** placement: 1 = tin nhắn người dùng, 2 = tin nhắn AI, 3 = lệnh, 5 = lorebook. */
export type RegexPlacement = 1 | 2 | 3 | 5;

/** `promptOnly` chỉ sửa cái gửi đi; `markdownOnly` chỉ sửa cái hiển thị. */
export type RegexTarget = 'prompt' | 'display';

export interface RegexScript {
  id: string;
  name: string;
  enabled: boolean;
  findSource: string;
  flags: string;
  replace: string;
  trimStrings: string[];
  placements: number[];
  minDepth: number | null;
  maxDepth: number | null;
  markdownOnly: boolean;
  promptOnly: boolean;
  substituteRegex: boolean;
  /** Đặt khi mẫu bị từ chối; script vẫn hiện trên UI nhưng không chạy. */
  rejected?: string;
}

export const DEFAULT_REGEX_TIMEOUT_MS = 1000;

/**
 * Mẫu `/.../flags` của SillyTavern, hoặc chuỗi regex trần.
 */
export function parseFindRegex(source: string): { pattern: string; flags: string } {
  const delimited = /^\/(.*)\/([gimsuy]*)$/s.exec(source);
  if (delimited !== null) {
    return { pattern: delimited[1] ?? '', flags: delimited[2] ?? '' };
  }
  return { pattern: source, flags: '' };
}

/**
 * Chặn trước những mẫu dễ quay lui thảm họa: một nhóm có định lượng lại nằm
 * trong một định lượng khác, ví dụ `(a+)+` hay `(\s*\w*)*`. Đây là dạng gây
 * treo phổ biến nhất và nhận diện được bằng cấu trúc, không cần chạy thử.
 */
export function looksCatastrophic(pattern: string): boolean {
  return /\((?:[^()\\]|\\.)*[+*}][^()]*\)\s*[+*]|\((?:[^()\\]|\\.)*\)\s*[+*]\s*[+*]/.test(pattern);
}

/** Chuẩn hóa một script thô từ preset. */
export function normalizeRegexScript(raw: RegexScriptRaw, index: number): RegexScript {
  const { pattern, flags } = parseFindRegex(raw.findRegex);
  const script: RegexScript = {
    id: raw.id ?? `regex-${index}`,
    name: raw.scriptName ?? raw.id ?? `Script ${index + 1}`,
    enabled: raw.disabled !== true,
    findSource: pattern,
    // GIỮ NGUYÊN cờ do tác giả viết. Tự thêm `g` là đổi ngữ nghĩa: một mẫu
    // như `^([\s\S]*)$` (có thật trong preset Ako) vốn chỉ thay một lần, thêm
    // `g` vào là thay nhiều lần và làm hỏng đầu ra.
    flags,
    replace: raw.replaceString ?? '',
    trimStrings: raw.trimStrings ?? [],
    placements: raw.placement ?? [],
    minDepth: raw.minDepth ?? null,
    maxDepth: raw.maxDepth ?? null,
    markdownOnly: raw.markdownOnly === true,
    promptOnly: raw.promptOnly === true,
    substituteRegex: raw.substituteRegex === true || raw.substituteRegex === 1,
  };

  if (looksCatastrophic(pattern)) {
    script.rejected = 'Mẫu có nguy cơ quay lui thảm họa (định lượng lồng nhau).';
    return script;
  }
  try {
    new RegExp(pattern, script.flags);
  } catch (error) {
    script.rejected = `Mẫu không hợp lệ: ${String(error)}`;
  }
  return script;
}

export interface RegexContext {
  /** Loại tin nhắn đang xử lý. */
  placement: RegexPlacement;
  /** Đang sửa cái gửi lên AI hay cái hiển thị cho người chơi. */
  target: RegexTarget;
  /** Độ sâu tính từ tin nhắn mới nhất; null khi không áp dụng. */
  depth?: number | null;
}

/** Script này có được chạy trong ngữ cảnh hiện tại không. */
export function appliesTo(script: RegexScript, context: RegexContext): boolean {
  if (!script.enabled || script.rejected !== undefined) return false;
  if (script.placements.length > 0 && !script.placements.includes(context.placement)) return false;

  // promptOnly: chỉ sửa khi gửi lên AI. markdownOnly: chỉ sửa cái hiển thị.
  if (script.promptOnly && context.target !== 'prompt') return false;
  if (script.markdownOnly && context.target !== 'display') return false;

  const depth = context.depth ?? null;
  if (depth !== null) {
    if (script.minDepth !== null && depth < script.minDepth) return false;
    if (script.maxDepth !== null && depth > script.maxDepth) return false;
  }
  return true;
}

export interface RegexRunResult {
  text: string;
  applied: string[];
  skipped: { id: string; reason: string }[];
  /** Tổng thời gian đã tiêu, ms. */
  elapsedMs: number;
}

/**
 * Áp dụng danh sách script. Hàm thuần trừ việc đọc đồng hồ.
 *
 * `budgetMs` là ngân sách cho CẢ danh sách: hết ngân sách thì các script còn
 * lại bị bỏ qua và ghi lý do, thay vì để người chơi ngồi nhìn màn hình đứng.
 */
export function applyRegexScripts(
  input: string,
  scripts: readonly RegexScript[],
  context: RegexContext,
  budgetMs: number = DEFAULT_REGEX_TIMEOUT_MS,
): RegexRunResult {
  const started = Date.now();
  const applied: string[] = [];
  const skipped: { id: string; reason: string }[] = [];
  let text = input;

  for (const script of scripts) {
    if (script.rejected !== undefined) {
      skipped.push({ id: script.id, reason: script.rejected });
      continue;
    }
    if (!appliesTo(script, context)) continue;

    if (Date.now() - started >= budgetMs) {
      skipped.push({ id: script.id, reason: `Hết ngân sách ${budgetMs}ms cho regex.` });
      continue;
    }

    try {
      const pattern = new RegExp(script.findSource, script.flags);
      let next = text.replace(pattern, script.replace);
      for (const trim of script.trimStrings) {
        if (trim !== '') next = next.split(trim).join('');
      }
      if (next !== text) applied.push(script.id);
      text = next;
    } catch (error) {
      skipped.push({ id: script.id, reason: `Lỗi khi chạy: ${String(error)}` });
    }
  }

  return { text, applied, skipped, elapsedMs: Date.now() - started };
}
