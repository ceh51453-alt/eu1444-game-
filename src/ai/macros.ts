/**
 * LỚP MACRO KIỂU SILLYTAVERN (Phần 3 mục 7).
 *
 * Chạy TRƯỚC EJS: macro là bước tiền xử lý VĂN BẢN, nó thay chữ trong template
 * rồi mới tới lượt EJS đọc cái đã thay.
 *
 * HAI KHÔNG GIAN TÊN TÁCH RỜI (mục 7.1) — đây là chỗ dễ làm sai nhất của cả
 * phần này. Preset SillyTavern thật gọi `setvar`/`getvar` hàng trăm lần, và
 * chúng KHÔNG phải state game: đó là cờ nháp của prompt (ngôn ngữ đầu ra, độ
 * dài, ngôi kể). Nếu để chúng ghi vào state thì mọi preset có sẵn sẽ lặng lẽ
 * phá save của người chơi.
 *
 *   nháp   `{{setvar::x::y}}` / `{{getvar::x}}`      — xóa sạch mỗi lần lắp
 *   state  `{{getvar::@state.character.stats.str}}`  — CHỈ ĐỌC
 *          `{{setvar::@state.…}}`                    — LỖI CỨNG
 *
 * NGẪU NHIÊN (mục 7.2): mọi `{{random}}`, `{{roll}}`, `{{pick}}` lấy từ seeded
 * RNG của Phần 0 và được CACHE theo lượt. Lý do rất cụ thể: khi Phần 2 gọi lại
 * AI để sửa patch, prompt phải render ra y hệt — khác một chữ là AI bị nhiễu
 * và sửa mò.
 */

import { roll as rollDice } from '@/core/dice';
import { createRng, type Rng } from '@/core/rng';
import { formatGameDate, type GameDate } from '@/core/clock';

/** Tiền tố bắt buộc để đọc state game từ macro (mục 7.1). */
export const STATE_PREFIX = '@state.';

/** Số vòng thay macro lồng nhau khi `MacroNest` bật (mục 7.3 bước 3). */
export const MAX_MACRO_NEST = 8;

export interface MacroIssue {
  /** Nguyên văn macro gây lỗi, kể cả hai dấu ngoặc. */
  macro: string;
  message: string;
  level: 'loi' | 'canh-bao';
}

export interface MacroRunResult {
  text: string;
  issues: MacroIssue[];
}

/**
 * Trạng thái sống suốt một lần lắp prompt.
 *
 * `scratch` và `cache` cố ý là hai thứ khác nhau: `scratch` xóa mỗi lần lắp
 * (mục 7.1), còn `cache` sống hết lượt để lần render lại cho ra đúng kết quả cũ
 * (mục 7.2b).
 */
export interface MacroContext {
  user: string;
  char: string;
  gameDate: GameDate;
  lastMessage: string;
  /** Giá trị của `{{original}}` — nội dung khối trước khi bị ghi đè. */
  original: string;
  rng: Rng;
  scratch: Map<string, string>;
  cache: Map<string, string>;
  /** Đọc state game. Đường ghi duy nhất vẫn là MVU, ở đây chỉ đọc. */
  readState: (path: string) => unknown;
  /** `extensions.SPreset.MacroNest` của preset. */
  nest: boolean;
}

/**
 * Dòng RNG riêng cho macro.
 *
 * Suy ra từ seed + số lượt chứ không rút từ dòng `main`: rút từ `main` thì số
 * macro trong template sẽ đẩy lệch xúc sắc của người chơi, và R3 mất ngay khi
 * ai đó sửa một khối prompt.
 */
export function macroRng(seed: string, turn: number): Rng {
  return createRng(`${seed}::prompt::${turn}`);
}

export function createMacroContext(init: Partial<MacroContext> & Pick<MacroContext, 'gameDate'>): MacroContext {
  return {
    user: '',
    char: '',
    lastMessage: '',
    original: '',
    rng: macroRng('chua-bat-dau', 0),
    scratch: new Map(),
    cache: new Map(),
    readState: () => undefined,
    nest: false,
    ...init,
  };
}

/** Đầu mỗi lần lắp prompt: dọn không gian nháp (mục 7.1). */
export function resetScratch(context: MacroContext): void {
  context.scratch.clear();
}

/** Đầu mỗi LƯỢT: dọn cache ngẫu nhiên (mục 7.2b). */
export function resetTurnCache(context: MacroContext): void {
  context.cache.clear();
}

// ---------------------------------------------------------------------------
// Định dạng giá trị
// ---------------------------------------------------------------------------

const WEEKDAYS = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'] as const;

function weekdayOf(date: GameDate): string {
  const stamp = new Date(Date.UTC(date.year, date.month - 1, date.day));
  // `Date` đặt năm hai chữ số vào thế kỷ 20; lịch của game bắt đầu ở 1444.
  stamp.setUTCFullYear(date.year);
  return WEEKDAYS[stamp.getUTCDay()] ?? '';
}

function stringify(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value) ?? '';
    } catch {
      return '';
    }
  }
  return String(value);
}

/** `a,b,c` hoặc `a::b::c` — preset thật dùng cả hai kiểu. */
function splitChoices(argument: string): string[] {
  const parts = argument.includes('::') ? argument.split('::') : argument.split(',');
  return parts.map((part) => part.trim()).filter((part) => part !== '');
}

// ---------------------------------------------------------------------------
// Thay macro
// ---------------------------------------------------------------------------

/** Macro không chứa macro khác — regex này luôn khớp cái trong cùng trước. */
const MACRO_PATTERN = /\{\{([^{}]*)\}\}/g;

/** Chỗ `{{trim}}` đứng, dọn khoảng trắng hai bên ở bước cuối. */
const TRIM_MARK = '\u0000';

interface PassState {
  context: MacroContext;
  blockId: string;
  issues: MacroIssue[];
  /** Lần xuất hiện thứ mấy của cùng một macro trong cùng một khối. */
  seen: Map<string, number>;
}

/**
 * Kết quả ngẫu nhiên đi qua cache. Khóa gồm cả số lần xuất hiện, nên hai
 * `{{roll:1d6}}` trong cùng một khối vẫn ra hai số khác nhau, mà render lại
 * lượt đó thì vẫn đúng hai số ấy.
 */
function cached(pass: PassState, raw: string, produce: (rng: Rng) => string): string {
  const occurrence = (pass.seen.get(raw) ?? 0) + 1;
  pass.seen.set(raw, occurrence);

  const key = `${pass.blockId}|${raw}|${occurrence}`;
  const hit = pass.context.cache.get(key);
  if (hit !== undefined) return hit;

  const value = produce(pass.context.rng);
  pass.context.cache.set(key, value);
  return value;
}

function readScratchOrState(pass: PassState, name: string, raw: string): string {
  if (!name.startsWith(STATE_PREFIX)) {
    return pass.context.scratch.get(name) ?? '';
  }
  const path = name.slice(STATE_PREFIX.length);
  const value = pass.context.readState(path);
  if (value === undefined) {
    pass.issues.push({
      macro: raw,
      level: 'canh-bao',
      message: `Đường dẫn state "${path}" chưa có giá trị.`,
    });
  }
  return stringify(value);
}

function evaluate(body: string, raw: string, pass: PassState): string | null {
  const trimmed = body.trim();
  if (trimmed === '') return '';
  if (trimmed.startsWith('//')) return ''; // {{// ghi chú }}

  const doubled = trimmed.split('::');
  const head = (doubled[0] ?? '').trim();
  const colon = trimmed.indexOf(':');
  const name = (doubled.length > 1 ? head : colon === -1 ? trimmed : trimmed.slice(0, colon)).trim().toLowerCase();
  const argument = doubled.length > 1 ? doubled.slice(1).join('::') : colon === -1 ? '' : trimmed.slice(colon + 1);

  switch (name) {
    case 'user':
      return pass.context.user;
    case 'char':
      return pass.context.char;
    case 'time':
      return `${String(pass.context.gameDate.hour).padStart(2, '0')}:00`;
    case 'date':
      return formatGameDate(pass.context.gameDate).split(' ')[0] ?? '';
    case 'weekday':
      return weekdayOf(pass.context.gameDate);
    case 'lastmessage':
      return pass.context.lastMessage;
    case 'original':
      return pass.context.original;
    case 'newline':
      return '\n';
    case 'noop':
      return '';
    case 'trim':
      return TRIM_MARK;

    case 'random':
    case 'pick': {
      const choices = splitChoices(argument);
      if (choices.length === 0) {
        pass.issues.push({ macro: raw, level: 'canh-bao', message: `{{${name}}} không có lựa chọn nào.` });
        return '';
      }
      return cached(pass, raw, (rng) => rng.pick(choices));
    }

    case 'roll': {
      const notation = argument.trim();
      return cached(pass, raw, (rng) => {
        try {
          return String(rollDice(rng, notation).total);
        } catch (error) {
          pass.issues.push({ macro: raw, level: 'loi', message: `Không đọc được xúc sắc: ${String(error)}` });
          return '';
        }
      });
    }

    case 'getvar':
      return readScratchOrState(pass, (doubled[1] ?? argument).trim(), raw);

    case 'setvar': {
      const target = (doubled[1] ?? '').trim();
      const value = doubled.slice(2).join('::');
      if (target === '') {
        pass.issues.push({ macro: raw, level: 'loi', message: '{{setvar}} thiếu tên biến.' });
        return '';
      }
      // LỖI CỨNG (mục 7.1). Không ghi, không im lặng — báo thẳng vào editor.
      if (target.startsWith(STATE_PREFIX)) {
        pass.issues.push({
          macro: raw,
          level: 'loi',
          message: 'Không ghi được vào state từ template. Dùng khối UpdateVariable.',
        });
        return '';
      }
      pass.context.scratch.set(target, value);
      return '';
    }

    default:
      return null; // macro lạ — giữ nguyên
  }
}

function onePass(text: string, pass: PassState): string {
  MACRO_PATTERN.lastIndex = 0;
  return text.replace(MACRO_PATTERN, (raw, body: string) => {
    const replacement = evaluate(body, raw, pass);
    if (replacement !== null) return replacement;
    pass.issues.push({ macro: raw, level: 'canh-bao', message: 'Macro không nhận ra — giữ nguyên chữ.' });
    return raw;
  });
}

/**
 * Thay macro trong nội dung MỘT khối.
 *
 * `scratch` KHÔNG bị dọn ở đây: phạm vi của nó là toàn bộ prompt (mục 7.3),
 * vì preset thật đặt `setvar` ở khối đầu rồi đọc lại ở khối cuối. Người gọi
 * dọn một lần trước khi duyệt hết danh sách khối.
 */
export function expandMacros(text: string, context: MacroContext, blockId = 'block'): MacroRunResult {
  const pass: PassState = { context, blockId, issues: [], seen: new Map() };

  let out = onePass(text, pass);
  if (context.nest) {
    for (let round = 1; round < MAX_MACRO_NEST; round++) {
      if (!out.includes('{{')) break;
      const next = onePass(out, pass);
      if (next === out) break;
      out = next;
    }
    if (/\{\{[^{}]*\}\}/.test(out)) {
      pass.issues.push({
        macro: '{{…}}',
        level: 'canh-bao',
        message: `Còn macro chưa thay sau ${MAX_MACRO_NEST} vòng lồng nhau.`,
      });
    }
  }

  return { text: out.replace(/[ \t]*\u0000[ \t]*\n?/g, ''), issues: pass.issues };
}
