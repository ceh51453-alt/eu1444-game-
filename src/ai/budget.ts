/**
 * NGÂN SÁCH TOKEN (Phần 3 mục 9).
 *
 * Ước lượng theo TIẾNG VIỆT, không theo tiếng Anh. Con số quen thuộc "4 ký tự
 * một token" là của tiếng Anh; tiếng Việt có dấu, và phần lớn tokenizer BPE cắt
 * một âm tiết có dấu thành hai đến ba token. Dùng nhầm tỷ lệ tiếng Anh là ước
 * thiếu khoảng 40%, và cái giá không phải là ước sai — mà là prompt vượt cửa sổ
 * ngữ cảnh ngay giữa lượt chơi.
 *
 * Khi provider có endpoint đếm thật (Gemini có `:countTokens`) thì dùng nó,
 * ước lượng chỉ là đường lui.
 */

import type { ConnCfg, LLMProvider } from './provider';

/** Tỷ lệ ước lượng cho tiếng Việt (mục 9). */
export const CHARS_PER_TOKEN_VI = 2.5;

export interface BudgetConfig {
  /** Tổng ngân sách cho một lần gọi. */
  total: number;
  /** Chừa lại cho đầu ra. */
  reserveForOutput: number;
  /**
   * Trần riêng của khối 4 (lorebook), tính bằng token. Bỏ trống thì Phần 4 dùng
   * `DEFAULT_LORE_BUDGET`.
   *
   * Tách khỏi `total` vì hai con số trả lời hai câu hỏi khác nhau: `total` là
   * cửa sổ ngữ cảnh của provider, còn con số này là "cho AI đọc bao nhiêu tri
   * thức mỗi lượt". Cửa sổ 2 triệu token của Gemini không có nghĩa là nên đổ cả
   * lorebook vào mỗi lượt — nhưng nó có nghĩa là 1.500 token là quá keo.
   */
  lore?: number;
}

/**
 * Mặc định nhắm vào cửa sổ ngữ cảnh lớn (Gemini, Claude), không nhắm vào các
 * bản 8k đời đầu: một entry nhân vật của lorebook đang dùng đã ~2.000 token,
 * nên trần 1.500 cho cả khối 4 là cắt đúng thứ đắt nhất trong sách.
 */
export const DEFAULT_BUDGET: BudgetConfig = { total: 131072, reserveForOutput: 8192, lore: 24000 };

/** Ngân sách còn lại cho phần prompt. */
export function promptLimit(config: BudgetConfig): number {
  return Math.max(0, config.total - config.reserveForOutput);
}

export function estimateTokens(text: string): number {
  if (text === '') return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN_VI);
}

/** Đếm token. Bất đồng bộ vì bản đếm thật là một lời gọi mạng. */
export type TokenCounter = (text: string) => Promise<number>;

export const estimateCounter: TokenCounter = async (text) => estimateTokens(text);

/**
 * Bộ đếm dùng provider khi provider có, ước lượng khi không.
 * Lỗi mạng KHÔNG được làm hỏng lượt: rơi về ước lượng và đi tiếp (R4).
 */
export function providerCounter(provider: LLMProvider, cfg: ConnCfg): TokenCounter {
  const count = provider.countTokens;
  if (count === undefined) return estimateCounter;

  return async (text: string): Promise<number> => {
    try {
      return await count.call(provider, text, cfg);
    } catch {
      return estimateTokens(text);
    }
  };
}

// ---------------------------------------------------------------------------
// Cắt theo ưu tiên
// ---------------------------------------------------------------------------

/** Ưu tiên này không bao giờ bị cắt (mục 9). */
export const UNCUTTABLE_PRIORITY = 10;

export interface CountedBlock {
  id: string;
  name: string;
  priority: number;
  tokens: number;
}

export interface BudgetOutcome<T extends CountedBlock> {
  kept: T[];
  /** Khối đã cắt, kèm lý do để hiện lên thanh ngân sách. */
  dropped: { block: T; reason: string }[];
  used: number;
  limit: number;
  /**
   * Đặt khi CẮT HẾT MỨC MÀ VẪN VƯỢT. Lúc đó không gửi đi — mục 9 nói rõ:
   * dừng lại và báo lỗi, vì cắt tiếp là cắt vào khối [LOCKED] và lượt sau sẽ
   * hỏng theo cách khó hiểu hơn nhiều.
   */
  overflow: string | null;
}

/**
 * Cắt cho vừa ngân sách.
 *
 * Thứ tự cắt: ưu tiên thấp trước; trong cùng một ưu tiên thì khối DÀI NHẤT
 * trước — cắt một khối dài đổi lại giữ được vài khối ngắn cùng hạng.
 */
export function trimToBudget<T extends CountedBlock>(
  blocks: readonly T[],
  config: BudgetConfig = DEFAULT_BUDGET,
): BudgetOutcome<T> {
  const limit = promptLimit(config);
  const kept = [...blocks];
  const dropped: { block: T; reason: string }[] = [];

  const total = (list: readonly T[]): number => list.reduce((sum, block) => sum + block.tokens, 0);
  let used = total(kept);

  while (used > limit) {
    const candidates = kept.filter((block) => block.priority < UNCUTTABLE_PRIORITY);
    if (candidates.length === 0) break;

    let worst = candidates[0];
    if (worst === undefined) break;
    for (const candidate of candidates) {
      if (
        candidate.priority < worst.priority ||
        (candidate.priority === worst.priority && candidate.tokens > worst.tokens)
      ) {
        worst = candidate;
      }
    }

    const at = kept.indexOf(worst);
    kept.splice(at, 1);
    dropped.push({
      block: worst,
      reason: `cắt vì vượt ngân sách (ưu tiên ${worst.priority}, ${worst.tokens} token)`,
    });
    used = total(kept);
  }

  const overflow =
    used > limit
      ? `Chỉ còn khối ưu tiên ${UNCUTTABLE_PRIORITY} mà vẫn cần ${used} token, quá ngân sách ${limit}. Không gửi đi. Hãy tăng tổng ngân sách hoặc rút ngắn khối [LOCKED].`
      : null;

  return { kept, dropped, used, limit, overflow };
}

/** Màu cho thanh ngân sách trực quan (mục 9) — theo ưu tiên, không theo khối. */
export function priorityColor(priority: number): string {
  if (priority >= UNCUTTABLE_PRIORITY) return '#c9a227'; // brass — không cắt được
  if (priority >= 8) return '#7fa650';
  if (priority >= 6) return '#4f86c6';
  if (priority >= 4) return '#8a6fb0';
  return '#a05a4a';
}
