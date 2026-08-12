/**
 * BỐN HỆ XÚC SẮC, MỘT KIỂU KẾT QUẢ (Phần 5 mục 2, 3, 4).
 *
 * PHÂN MIỀN CỨNG (mục 2) — một hành động chỉ dùng ĐÚNG MỘT hệ:
 *   d100  KỸ NĂNG CÁ NHÂN      kiếm thuật, cung, cưỡi ngựa, đàm phán, y thuật…
 *   d20   ĐỐI KHÁNG NHANH      từng đòn PvP, né, chặn, giằng co, rượt đuổi
 *   3d6   NĂNG LỰC DÀI HẠN     quản trị, xây dựng, kinh tế, hậu cần, mưu kế
 *   pool  QUY MÔ LỚN           đụng độ đơn vị quân, xung phong, bắn loạt, công phá
 *
 * Rủi ro của bốn hệ là người chơi mất khả năng ước lượng cơ hội. Cách trị của
 * mục 2: mỗi miền một hệ cố định, và UI LUÔN hiện tên hệ đang chạy. Việc gì
 * trông như thuộc hai miền thì tách thành hai kiểm định nối tiếp, không trộn.
 *
 * Hàm ở đây THUẦN theo nghĩa của Phần 0 mục 7: đầu vào là spec + một `Rng`, đầu
 * ra là `CheckResult`. Không đọc store, không ghi state, không log. Ghi log là
 * việc của vòng lặp lượt (mục 11) — nếu `runCheck` tự ghi thì bài Monte Carlo
 * 100.000 lần của mục 12.8 sẽ nuốt sạch bộ nhớ.
 */

import type { CheckModifierLine, CheckResult, CheckSystem } from '@/core/turn';
import type { Rng } from '@/core/rng';
import type { GameState } from '@/state/slices';
import { difficulty, type DifficultyBand } from './difficulty';
import {
  clamp,
  collectModifiers,
  foldModifiers,
  DEFAULT_CLAMPS,
  type ClampConfig,
  type ModifierContext,
} from './registry';
import { d100Tier, d20Tier, poolTier, shiftTier, tallyPool, threeD6Tier } from './tiers';
import { pickConsequence, type ConsequenceTable } from './consequence';
import { narrativeHint } from './hint';

export interface CheckSpec {
  /** Định danh phép kiểm, ví dụ `check.thuyet-phuc`. */
  id: string;
  system: CheckSystem;
  /** Miền — quyết định nguồn modifier nào chạy và tra bảng hệ quả nào. */
  domain: string;
  /** TÊN BẬC, không bao giờ là số thô (mục 8). */
  difficulty: DifficultyBand;
  /**
   * Năng lực gốc, nghĩa tùy hệ:
   *   d100  kỹ năng 0–100
   *   d20   chỉ số cộng vào mặt xúc sắc
   *   3d6   chỉ số + cấp kỹ năng
   *   pool  số viên xúc sắc trước điều chỉnh (suy từ quy mô đơn vị)
   */
  base: number;
  /** Id NPC đang kiểm định. Rỗng là người chơi. */
  actor?: string;
  tags?: readonly string[];
  state?: GameState | null;
}

export interface CheckOptions {
  clamps?: Partial<Record<CheckSystem, ClampConfig>>;
  consequences?: ConsequenceTable;
}

export interface CheckRun {
  result: CheckResult;
  /**
   * Nguồn modifier đã ném lỗi. Phép kiểm VẪN chạy với các nguồn còn lại (R4),
   * nhưng lỗi phải nổi lên tới tab Debug chứ không được nuốt: một nguồn chết âm
   * thầm nghĩa là người chơi đang chịu một thiệt thòi không ai giải thích được.
   */
  failures: { source: string; error: string }[];
}

function clampFor(system: CheckSystem, options: CheckOptions | undefined): ClampConfig {
  return options?.clamps?.[system] ?? DEFAULT_CLAMPS[system];
}

/** `seed::stream#draws` — đủ để tung lại đúng con xúc sắc này (R3). */
function stamp(rng: Rng): string {
  const state = rng.getState();
  return `${state.seed}#${state.draws}`;
}

/**
 * Bậc độ khó thành một dòng trong `modifiers` — nhưng CHỈ ở hai hệ mà nó thật
 * sự cộng vào ngưỡng.
 *
 * Ví dụ của mục 10 in `-20 (Khó)` giữa danh sách điều chỉnh, và ở d100/3d6 thì
 * đúng là thế. Ở d20 và pool thì bậc không cộng vào cú tung mà ĐẶT ra DC hoặc
 * số hit cần — hai con số đã nằm sẵn ở `dc` và `target`. Nhét chúng vào danh
 * sách điều chỉnh dưới dạng `+12` là nói dối người đọc về thứ vừa xảy ra; tên
 * bậc thì đã có `CheckResult.difficulty` giữ, nên không mất thông tin nào.
 */
function difficultyLine(system: CheckSystem, band: DifficultyBand): CheckModifierLine | null {
  const row = difficulty(band);
  const source = 'check.do-kho';
  if (system === 'd100') return { label: `Độ khó ${row.label}`, value: row.d100, source };
  if (system === '3d6') return { label: `Độ khó ${row.label}`, value: row.d6, source };
  return null;
}

/**
 * Chạy một phép kiểm.
 *
 * THỨ TỰ BẤT BIẾN: gom modifier → cộng dồn → kẹp → TUNG → xếp cấp → dịch bậc →
 * chọn hệ quả → sinh câu mệnh lệnh. Tung sau khi đã chốt ngưỡng, và ngưỡng
 * không bao giờ được sửa lại sau khi đã thấy con xúc sắc.
 */
export function runCheck(rng: Rng, spec: CheckSpec, options?: CheckOptions): CheckRun {
  const context: ModifierContext = {
    domain: spec.domain,
    system: spec.system,
    difficulty: spec.difficulty,
    state: spec.state ?? null,
    actor: spec.actor ?? '',
    tags: spec.tags ?? [],
  };

  const collected = collectModifiers(context);
  const folded = foldModifiers(collected.modifiers);
  const row = difficulty(spec.difficulty);
  const band = difficultyLine(spec.system, spec.difficulty);
  const modifiers: CheckModifierLine[] = band === null ? folded.lines : [band, ...folded.lines];
  const seedUsed = stamp(rng);

  let tier: CheckResult['tier'];
  let raw: number[];
  let margin: number;
  let target: number | undefined;
  let dc: number | undefined;

  switch (spec.system) {
    case 'd100': {
      target = clamp(spec.base + row.d100 + folded.flat, clampFor('d100', options));
      const roll = rng.int(1, 100);
      raw = [roll];
      margin = target - roll;
      tier = d100Tier(roll, target);
      break;
    }
    case 'd20': {
      dc = clamp(row.dc + folded.dc, clampFor('d20', options));
      const bonus = spec.base + folded.flat;
      const roll = rng.int(1, 20);
      raw = [roll];
      margin = roll + bonus - dc;
      tier = d20Tier(roll, bonus, dc);
      break;
    }
    case '3d6': {
      target = clamp(spec.base + row.d6 + folded.flat, clampFor('3d6', options));
      raw = [rng.int(1, 6), rng.int(1, 6), rng.int(1, 6)];
      const sum = raw.reduce((total, face) => total + face, 0);
      margin = target - sum;
      tier = threeD6Tier(sum, target);
      break;
    }
    case 'pool': {
      const dice = clamp(spec.base + folded.pool, clampFor('pool', options));
      const required = Math.max(1, row.pool);
      target = required;
      raw = Array.from({ length: dice }, () => rng.int(1, 6));
      margin = tallyPool(raw).successes - required;
      tier = poolTier(raw, required);
      break;
    }
  }

  tier = shiftTier(tier, folded.dieShift);

  const consequence = pickConsequence(rng, tier, spec.domain, options?.consequences);

  const result: CheckResult = {
    id: spec.id,
    system: spec.system,
    domain: spec.domain,
    difficulty: spec.difficulty,
    tier,
    raw,
    margin,
    modifiers,
    seedUsed,
    narrativeHint: narrativeHint(tier, consequence),
    ...(target === undefined ? {} : { target }),
    ...(dc === undefined ? {} : { dc }),
    ...(consequence === null ? {} : { consequence }),
  };

  return { result, failures: collected.failures };
}
