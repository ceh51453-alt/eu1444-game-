/**
 * BA TẦNG TIẾP CẬN VÀ ĐỘ RÕ — Phần 14 mục 1 và mục 8.
 *
 * Câu quan trọng nhất của cả phần nằm ở mục 1, và nó là một câu về UI:
 *
 *   **BẢNG TRẠNG THÁI KHÔNG BAO GIỜ BỊ KHÓA XÁM.** Luôn hiện, chỉ khác ĐỘ RÕ và
 *   khác NHỮNG NÚT BẤM khả dụng.
 *
 * Nên ở đây có hai trục độc lập, và trộn chúng lại là hỏng cả hai:
 *
 *   TẦNG TIẾP CẬN  ← tước vị (Phần 13)      quyết định LÀM ĐƯỢC GÌ
 *   ĐỘ RÕ          ← tri thức (Phần 4)      quyết định THẤY ĐƯỢC GÌ
 *
 * Một nông nô đứng trong sân Giáo triều thấy rõ hơn một Công tước ở đầu kia châu
 * lục — và vẫn không bỏ phiếu được. Một Hoàng đế mù tin tức vẫn bỏ phiếu được,
 * chỉ là bỏ phiếu trong sương mù. Nếu hai trục này gộp làm một thì cả hai câu
 * chuyện ấy đều biến mất.
 */

import { knowledgeOf } from '@/lore/knowledge';
import type { GameState } from '@/state/slices';
import { rankOf, type HeldTitle } from '@/systems/titles';
import { accessTiers, clarityConfig, powerRowOf } from './data';
import type { AccessTier, ClarityLevel } from './types';

export interface AccessInput {
  powerId: string;
  /** Tước đang giữ. Chỉ tước CÙNG THANG với thế lực ấy mới mở được tầng 3. */
  titles: readonly HeldTitle[];
  /** Thế lực người chơi đang thuộc về (`knowledge.factionId`). */
  factionId: string;
}

export interface ClarityInput {
  powerId: string;
  /** `knowledge.known` — độ tin của tri thức về thế lực này. */
  confidence: number;
  factionId: string;
  /** Người chơi đang đứng trong triều đình thế lực ấy. */
  inCourt: boolean;
  /** Thế lực láng giềng của nơi người chơi đang ở. */
  neighbour: boolean;
}

/**
 * TẦNG TIẾP CẬN với một thế lực.
 *
 * Tầng 3 đòi tước ĐÚNG THANG: một Công tước Tây Âu bậc 7 không ngồi vào mật nghị
 * được, vì thang Giáo hội là một thang khác (Phần 13 mục 3). Đây chính là chỗ hệ
 * tước vị của Phần 13 trả tiền cho việc nó có nhiều thang.
 */
export function accessTierFor(input: AccessInput): AccessTier {
  const row = powerRowOf(input.powerId);
  if (row === null) return 'quan-sat';

  const sameLadder = input.titles.filter((title) => title.ladderId === row.access.ladder);
  const bestOnLadder = sameLadder.reduce((best, title) => Math.max(best, rankOf(title.titleId)), 0);
  const bestOverall = input.titles.reduce((best, title) => Math.max(best, rankOf(title.titleId)), 0);

  if (bestOnLadder >= row.access.playRank && input.factionId === input.powerId) return 'choi-that';
  if (bestOverall >= row.access.impactRank) return 'tac-dong';
  return 'quan-sat';
}

/** Tầng tiếp cận đọc thẳng từ state — tiện cho UI, và chỉ UI mới nên dùng. */
export function accessTierOf(state: GameState | null, powerId: string, titles: readonly HeldTitle[]): AccessTier {
  const knowledge = state === null ? { factionId: '' } : knowledgeOf(state);
  return accessTierFor({ powerId, titles, factionId: knowledge.factionId });
}

export function tierRank(tier: AccessTier): number {
  return accessTiers().find((row) => row.id === tier)?.rank ?? 1;
}

export function tierLabel(tier: AccessTier): string {
  return accessTiers().find((row) => row.id === tier)?.name ?? tier;
}

/** Tầng này có làm được việc cần tầng kia không. */
export function tierAllows(current: AccessTier, needed: AccessTier): boolean {
  return tierRank(current) >= tierRank(needed);
}

/**
 * ĐỘ RÕ của bảng một thế lực.
 *
 * Người trong triều thấy rõ, người ở xa chỉ thấy tin đồn mờ nhạt (mục 1). Ba
 * khoản cộng ở data, không ở đây, vì cân bằng chúng là việc của người chỉnh data.
 */
export function clarityFor(input: ClarityInput): { level: ClarityLevel; label: string; showsNumbers: boolean; confidence: number } {
  const config = clarityConfig();
  const confidence = Math.max(
    0,
    Math.min(
      100,
      input.confidence +
        (input.inCourt ? config.inCourtBonus : 0) +
        (input.factionId === input.powerId ? config.sameNationBonus : 0) +
        (input.neighbour ? config.neighbourBonus : 0),
    ),
  );

  const level = config.levels.find((row) => confidence <= row.upToConfidence) ?? config.levels[config.levels.length - 1];
  if (level === undefined) return { level: 'tin-don', label: 'tin đồn chưa xác thực', showsNumbers: false, confidence };
  return { level: level.id, label: level.label, showsNumbers: level.showsNumbers, confidence };
}

/** Độ rõ đọc thẳng từ state. Khóa tri thức là chính id thế lực. */
export function clarityOf(state: GameState | null, powerId: string): ReturnType<typeof clarityFor> {
  if (state === null) return clarityFor({ powerId, confidence: 0, factionId: '', inCourt: false, neighbour: false });
  const knowledge = knowledgeOf(state);
  const fact = knowledge.known[powerId];
  return clarityFor({
    powerId,
    confidence: fact?.confidence ?? 0,
    factionId: knowledge.factionId,
    inCourt: knowledge.regionId !== '' && powerRowOf(powerId) !== null && knowledge.factionId === powerId,
    neighbour: false,
  });
}

/**
 * MỘT CON SỐ NHÌN QUA MÀN SƯƠNG.
 *
 * Mục 8: "chỗ nào chưa biết thì hiện mờ kèm dòng *tin đồn chưa xác thực*, KHÔNG
 * hiện số liệu thật". Nên hàm này không làm tròn số thật — nó trả về một MÔ TẢ,
 * và người chơi không có cách nào suy ngược ra con số.
 */
export function blurNumber(value: number, level: ClarityLevel, scale: 'meter' | 'money' | 'men' = 'meter'): string {
  if (level === 'biet-ro') {
    if (scale === 'money') return String(Math.round(value));
    if (scale === 'men') return String(Math.round(value));
    return String(Math.round(value));
  }

  const bands: [number, string][] =
    scale === 'meter'
      ? [
          [20, 'rất thấp'],
          [40, 'thấp'],
          [60, 'tầm thường'],
          [80, 'cao'],
          [101, 'rất cao'],
        ]
      : scale === 'money'
        ? [
            [200, 'gần cạn'],
            [600, 'eo hẹp'],
            [1200, 'khá dày'],
            [Infinity, 'rủng rỉnh'],
          ]
        : [
            [2000, 'một nhúm'],
            [8000, 'vài nghìn'],
            [25000, 'một đạo quân'],
            [Infinity, 'đông không đếm nổi'],
          ];

  const band = bands.find(([limit]) => value < limit);
  const word = band?.[1] ?? '?';
  return level === 'tin-don' ? `nghe đâu ${word}` : word;
}
