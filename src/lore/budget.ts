/**
 * NGÂN SÁCH CỦA KHỐI 4 (Phần 4 mục 9, nối vào Phần 3 mục 9).
 *
 * Hai tầng ngân sách, và chúng không thay được cho nhau:
 *   tầng này   chọn entry nào vào khối 4, theo ĐIỂM
 *   Phần 3     chọn khối nào sống sót, theo `budgetPriority`
 *
 * Bỏ tầng này và để Phần 3 tự cắt thì lorebook hoặc vào hết (nổ ngân sách) hoặc
 * bị cắt cả khối (mất sạch tri thức) — không có mức giữa. Điểm số của mục 9
 * chính là thứ tạo ra mức giữa đó.
 *
 * `summary` là đường lui chứ không phải trang trí: một entry dài không lọt ngân
 * sách vẫn còn cửa vào bằng bản ngắn, và AI biết có chuyện đó tồn tại vẫn hơn
 * là không biết gì.
 */

import { estimateTokens } from '@/ai/budget';
import type { ActivatedEntry } from './scanner';
import type { LoreDecision, LoreItem } from './types';

/**
 * Ngân sách mặc định cho riêng khối 4, tính bằng token.
 *
 * Con số này đi đôi với `DEFAULT_BUDGET` của Phần 3: nó phải đủ để một lượt
 * chèn được vài entry ĐẦY ĐỦ chứ không chỉ vài bản tóm tắt, vì một entry nhân
 * vật viết tử tế đã ~2.000 token. Đổi ở đây thì đổi luôn ô "Ngân sách lorebook"
 * trong tab Prompt — người chơi chỉnh được, đây chỉ là điểm khởi đầu.
 */
export const DEFAULT_LORE_BUDGET = 24000;

export interface LoreSelection {
  /** Entry gộp vào khối 4 của prompt. */
  items: LoreItem[];
  /** Entry có `placement: {depth}` — Phần 3 lắp chúng như khối chèn theo độ sâu. */
  depthItems: LoreItem[];
  used: number;
  limit: number;
  dropped: { id: string; title: string; reason: string }[];
}

function toItem(activated: ActivatedEntry, content: string, tokens: number): LoreItem {
  const { entry, book } = activated;
  return {
    id: entry.id,
    title: entry.title,
    content,
    scope: book.name,
    ...(activated.note === undefined ? {} : { note: activated.note }),
    placement: entry.placement,
    role: entry.role ?? 'system',
    budgetPriority: entry.budgetPriority,
    score: activated.score,
    tokens,
  };
}

/**
 * Lấy entry theo điểm giảm dần cho tới hết ngân sách.
 *
 * `decisions` bị sửa TẠI CHỖ để panel của mục 11 nói được "entry này qua hết
 * năm lớp nhưng bị ngân sách cắt" — kết cục hay gây ngạc nhiên nhất, và cũng là
 * kết cục dễ bị tưởng nhầm thành bug nhất.
 */
export function selectWithinBudget(
  activated: readonly ActivatedEntry[],
  decisions: LoreDecision[],
  limit: number = DEFAULT_LORE_BUDGET,
): LoreSelection {
  const items: LoreItem[] = [];
  const depthItems: LoreItem[] = [];
  const dropped: LoreSelection['dropped'] = [];
  let used = 0;

  const find = (id: string): LoreDecision | undefined =>
    decisions.find((entry) => entry.entryId === id);

  // `activated` đã sắp theo điểm giảm dần ở scanner; entry `constant` mang
  // thưởng rất lớn nên tự nhiên đứng đầu mà không cần luật riêng (mục 9).
  for (const candidate of activated) {
    const decision = find(candidate.entry.id);
    const full = candidate.content;
    const fullTokens = estimateTokens(full);

    if (used + fullTokens <= limit) {
      const item = toItem(candidate, full, fullTokens);
      (item.placement === 'block' ? items : depthItems).push(item);
      used += fullTokens;
      if (decision !== undefined) {
        decision.tokens = fullTokens;
        decision.outcome = 'chèn';
      }
      continue;
    }

    // Bản đã render nếu Phần 4 render được, nguyên văn nếu không: `summary`
    // cũng là template như `content`, nên nó phải đi qua đúng một đường.
    const summary = candidate.summary ?? candidate.entry.summary;
    if (summary !== undefined && summary.trim() !== '') {
      const summaryTokens = estimateTokens(summary);
      if (used + summaryTokens <= limit) {
        const item = toItem(candidate, summary, summaryTokens);
        (item.placement === 'block' ? items : depthItems).push(item);
        used += summaryTokens;
        if (decision !== undefined) {
          decision.tokens = summaryTokens;
          decision.outcome = 'chèn bản tóm tắt';
        }
        continue;
      }
    }

    const reason = `hết ngân sách khối 4: cần ${fullTokens} token, chỉ còn ${Math.max(0, limit - used)}`;
    dropped.push({ id: candidate.entry.id, title: candidate.entry.title, reason });
    if (decision !== undefined) {
      decision.tokens = fullTokens;
      decision.outcome = 'loại';
      decision.blockedAt = 'budget';
      decision.layers = [...decision.layers, { layer: 'budget', passed: false, reason }];
    }
  }

  return { items, depthItems, used, limit, dropped };
}
