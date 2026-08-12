/**
 * REGISTRY MODIFIER — mọi module sau cắm vào đây (Phần 5 mục 7).
 *
 * README mục 8 xếp file này là chỗ dễ hỏng thứ tư của cả dự án, và lý do rất cụ
 * thể: nếu một phần nào đó tự cộng modifier riêng thay vì đăng ký vào đây, dòng
 * đó sẽ KHÔNG xuất hiện trong `CheckResult.modifiers`. Người chơi thấy mình
 * hỏng mà không biết vì sao, và vì game không có reroll nên họ chỉ có thể kết
 * luận là game ăn gian.
 *
 * Những nguồn sẽ đăng ký ở các phần sau: thương tích (P7), kỹ năng và nhánh
 * (P8), trang bị (P16), địa hình, thời tiết, sĩ khí, mệt mỏi, đói khát, tước
 * vị, uy tín, quan hệ NPC, phép thuật, chúc phúc tôn giáo.
 *
 * HAI LUẬT CHO MỌI NGUỒN:
 *   1. `compute` phải THUẦN — đọc ctx, trả về danh sách, không ghi state, không
 *      tung xúc sắc. Nó chạy trước mỗi phép kiểm, kể cả trong vòng lặp chiến
 *      trận (mục 9), nên phải rẻ.
 *   2. Nguồn ném lỗi KHÔNG được làm hỏng lượt (R4). Lỗi bị bắt lại, ghi vào
 *      `failures`, và phép kiểm vẫn chạy với những nguồn còn lại.
 */

import type { CheckModifierLine, CheckSystem } from '@/core/turn';
import type { GameState } from '@/state/slices';
import type { DifficultyBand } from './difficulty';

/**
 * Bốn kiểu điều chỉnh.
 *
 *   flat      cộng vào NGƯỠNG tung-dưới (d100, 3d6)
 *   dc        cộng vào ĐỘ KHÓ của hệ d20 (dương = khó hơn)
 *   pool      cộng vào SỐ VIÊN xúc sắc của dice pool
 *   dieShift  dịch CẤP KẾT QUẢ ±1 bậc, không đụng tới con số
 *
 * `pool` đổi số viên chứ không đổi số thành công cần: số thành công cần là thứ
 * thang độ khó của mục 8 quyết định, còn quy mô đơn vị và hoàn cảnh thì đổ vào
 * số viên. Trộn hai thứ đó vào một chỗ là mất luôn khả năng đọc "cần mấy hit".
 */
export type ModifierKind = 'flat' | 'dc' | 'pool' | 'dieShift';

export interface Modifier {
  /** Tiếng Việt đọc được — đây là câu người chơi sẽ đọc khi hỏi "vì sao tôi hỏng". */
  label: string;
  value: number;
  kind: ModifierKind;
  /** Id nguồn đã đăng ký. */
  source: string;
}

export interface ModifierContext {
  /** Miền của phép kiểm, ví dụ `skill.kiem-thuat`. */
  domain: string;
  system: CheckSystem;
  difficulty: DifficultyBand;
  /** State đọc-chỉ. Nguồn TUYỆT ĐỐI không được ghi vào đây (R2). */
  state: GameState | null;
  /** Ai đang kiểm định — id NPC. Rỗng nghĩa là người chơi. */
  actor: string;
  /** Nhãn hoàn cảnh tự do: `ban-dem`, `mua-lon`, `tren-ngua`… */
  tags: readonly string[];
}

export interface ModifierSource {
  id: string;
  /** Miền được áp. `skill.*` khớp mọi miền bắt đầu bằng `skill.`; `*` khớp tất cả. */
  domains: readonly string[];
  compute(ctx: ModifierContext): Modifier[] | null;
}

// ---------------------------------------------------------------------------
// Đăng ký
// ---------------------------------------------------------------------------

const sources = new Map<string, ModifierSource>();

export class ModifierSourceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ModifierSourceError';
  }
}

export function registerModifierSource(source: ModifierSource): void {
  if (source.id.trim() === '') {
    throw new ModifierSourceError('nguồn modifier phải có id');
  }
  if (sources.has(source.id)) {
    throw new ModifierSourceError(`nguồn modifier "${source.id}" đã đăng ký — trùng id`);
  }
  if (source.domains.length === 0) {
    throw new ModifierSourceError(`nguồn "${source.id}" không khai miền nào — nó sẽ không bao giờ chạy`);
  }
  sources.set(source.id, source);
}

export function unregisterModifierSource(id: string): boolean {
  return sources.delete(id);
}

/** Đã đăng ký những nguồn nào — tab Debug và test dùng. */
export function modifierSources(): readonly ModifierSource[] {
  return [...sources.values()];
}

/** Chỉ dùng trong test. */
export function resetModifierSources(): void {
  sources.clear();
}

/**
 * Mẫu miền có khớp không.
 * `*` khớp tất cả; `skill.*` khớp `skill.kiem-thuat` và cả `skill.kiem.dai-kiem`;
 * còn lại là so khớp nguyên văn.
 */
export function domainMatches(pattern: string, domain: string): boolean {
  if (pattern === '*') return true;
  if (pattern.endsWith('.*')) return domain.startsWith(pattern.slice(0, -1));
  return pattern === domain;
}

// ---------------------------------------------------------------------------
// Gom và cộng
// ---------------------------------------------------------------------------

export interface ClampConfig {
  min: number;
  max: number;
}

/**
 * Trần và sàn mặc định, cấu hình được (mục 7).
 *
 * d100 kẹp trong 5–95 vì mục 7 nói thẳng: LUÔN còn cửa thắng và cửa thua. Một
 * ngưỡng 100 nghĩa là chỉ còn `roll = 100` mới hỏng, và người chơi sẽ nhanh
 * chóng học được rằng có những hành động không cần nghĩ.
 *
 * 3d6 không cần kẹp để giữ hai cửa đó — mục 4 đã cho `roll ≤ 4` luôn là thành
 * công lớn và `roll ≥ 17` luôn là thất bại nặng — nhưng vẫn kẹp để ngưỡng không
 * trôi ra ngoài miền 3..18 mà vẫn trông như một con số có nghĩa.
 *
 * `pool` kẹp SỐ VIÊN: trần 20 viên của mục 4, sàn 1 viên vì không tung viên nào
 * thì không có phép kiểm nào cả.
 */
export const DEFAULT_CLAMPS: Readonly<Record<CheckSystem, ClampConfig>> = {
  d100: { min: 5, max: 95 },
  d20: { min: 1, max: 40 },
  '3d6': { min: 3, max: 17 },
  pool: { min: 1, max: 20 },
};

export interface CollectOutcome {
  modifiers: Modifier[];
  /** Nguồn ném lỗi. Phép kiểm vẫn chạy; chỗ này để tab Debug nói ra (R4). */
  failures: { source: string; error: string }[];
}

/**
 * Gọi mọi nguồn khớp miền. Thứ tự là thứ tự đăng ký, nên hai lần chạy cùng một
 * state cho ra cùng một danh sách — điều kiện cần của R3.
 */
export function collectModifiers(ctx: ModifierContext): CollectOutcome {
  const outcome: CollectOutcome = { modifiers: [], failures: [] };

  for (const source of sources.values()) {
    if (!source.domains.some((pattern) => domainMatches(pattern, ctx.domain))) continue;
    try {
      const produced = source.compute(ctx);
      if (produced === null) continue;
      for (const modifier of produced) {
        // Nguồn khai sai id là mất dấu vết: dòng đó sẽ hiện lên với một cái tên
        // không tra được. Ghi đè bằng id thật của nguồn.
        outcome.modifiers.push({ ...modifier, source: source.id });
      }
    } catch (error) {
      outcome.failures.push({ source: source.id, error: String(error) });
    }
  }

  return outcome;
}

export interface FoldedModifiers {
  /** Tổng `flat` — cộng vào ngưỡng tung-dưới. */
  flat: number;
  /** Tổng `dc` — cộng vào độ khó d20. */
  dc: number;
  /** Tổng `pool` — cộng vào số viên. */
  pool: number;
  /** Tổng `dieShift` — dịch cấp kết quả. */
  dieShift: number;
  /** Đúng những dòng sẽ hiện cho người chơi. */
  lines: CheckModifierLine[];
}

/**
 * Cộng dồn theo thứ tự của mục 7: **flat cộng dồn → nhân → clamp**.
 *
 * Chặng "nhân" đi qua ở đây mà chưa làm gì, có chủ ý: Phần 5 không có kiểu
 * modifier nào nhân (bốn kiểu của mục 7 đều là cộng hoặc dịch bậc). Chặng vẫn
 * đứng đúng chỗ để khi Phần 8 hoặc Phần 16 thêm hệ số nhân thì chỉ phải điền
 * vào giữa, không phải sắp lại thứ tự — mà sắp lại thứ tự thì mọi con số cân
 * bằng đã đo trước đó đều sai.
 *
 * Kẹp KHÔNG làm ở đây: nó phụ thuộc hệ và phải kẹp giá trị CUỐI (ngưỡng, DC, số
 * viên), chứ không phải kẹp tổng modifier. Xem `clamp` ở dưới.
 */
export function foldModifiers(modifiers: readonly Modifier[]): FoldedModifiers {
  const folded: FoldedModifiers = { flat: 0, dc: 0, pool: 0, dieShift: 0, lines: [] };

  for (const modifier of modifiers) {
    switch (modifier.kind) {
      case 'flat':
        folded.flat += modifier.value;
        break;
      case 'dc':
        folded.dc += modifier.value;
        break;
      case 'pool':
        folded.pool += modifier.value;
        break;
      case 'dieShift':
        folded.dieShift += modifier.value;
        break;
    }
    folded.lines.push({ label: modifier.label, value: modifier.value, source: modifier.source });
  }

  // Chặng "nhân" của mục 7 — chưa nguồn nào đăng ký hệ số ở Phần 5.

  return folded;
}

/** Kẹp giá trị cuối vào trần/sàn của hệ. */
export function clamp(value: number, config: ClampConfig): number {
  return Math.max(config.min, Math.min(config.max, Math.round(value)));
}
