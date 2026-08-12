/**
 * TRẦN CHI PHÍ — Phần 15 mục 5, và là chỗ dễ hỏng thứ bảy của README.
 *
 * *"Ba tầng phân giải NPC và trần request mỗi tháng là bắt buộc. Không có chúng
 * thì chơi một năm trong game có thể tốn hàng chục đô tiền proxy."*
 *
 * BA LUẬT, và luật thứ hai mới là luật cứu tiền:
 *
 *  1. **Trần đếm THEO THÁNG GAME, không theo phiên chơi.** Người chơi tua sáu
 *     mươi năm trong một buổi chiều vẫn phải trả đúng ngần ấy request mỗi tháng.
 *  2. **VƯỢT TRẦN THÌ RƠI XUỐNG TẦNG B, KHÔNG XẾP HÀNG.** Một hàng đợi chỉ dời
 *     hoá đơn sang tháng sau, và nó dời kèm một cục nợ càng lúc càng to. Rơi
 *     xuống tầng B là chuyện đã rồi: tháng ấy thế giới chạy bằng engine.
 *  3. **Tắt hẳn LLM là một nút, không phải một cấu hình ẩn.** Bật lại lúc nào
 *     cũng được, và mô phỏng không đổi hình dạng — chỉ đổi ai đang nghĩ.
 *
 * Giá token do người dùng tự nhập ở tab Debug (Phần 1 mục 8): engine không thể
 * biết proxy tính bao nhiêu, và bịa ra một con số còn tệ hơn không có số nào.
 */

import { costConfig } from './data';
import type { WorldSliceState } from './slice';

export type Budget = WorldSliceState['budget'];

export interface Pricing {
  inPerMTok: number;
  outPerMTok: number;
}

export function initialBudget(month: number): Budget {
  const config = costConfig();
  return {
    month,
    requestsUsed: 0,
    textRequestsUsed: 0,
    tokensIn: 0,
    tokensOut: 0,
    costUsd: 0,
    monthsSimulated: 0,
    llmEnabled: config.llmEnabledDefault,
    maxRequestsPerMonth: config.maxRequestsPerMonth,
  };
}

/** Một tick sâu vừa chạy xong. Đây là mẫu số của mọi con số chi phí. */
export function countMonth(budget: Budget): Budget {
  return { ...budget, monthsSimulated: budget.monthsSimulated + 1 };
}

/**
 * Sang tháng mới thì bộ đếm request về 0 — nhưng TOKEN VÀ TIỀN THÌ KHÔNG.
 *
 * Hai con số ấy cộng dồn cả ván, vì câu hỏi mà mục 13 đặt ra là *"chơi một năm
 * trong game tốn bao nhiêu tiền proxy"*, và một con số reset hàng tháng không
 * trả lời được câu ấy.
 */
export function rollMonth(budget: Budget, month: number): Budget {
  if (budget.month === month) return budget;
  return { ...budget, month, requestsUsed: 0, textRequestsUsed: 0 };
}

/** Còn được gọi LLM cho tầng A tháng này không. */
export function canCallAgents(budget: Budget): boolean {
  return budget.llmEnabled && budget.requestsUsed < budget.maxRequestsPerMonth;
}

/** Còn được gọi LLM để viết văn bản sự kiện lớn không (mục 8). */
export function canCallText(budget: Budget): boolean {
  if (!budget.llmEnabled) return false;
  const config = costConfig();
  // Request viết văn bản đếm vào CÙNG một trần với request agent: cả hai đều là
  // tiền, và tách hai trần ra là mở một cửa sau để vượt trần chung.
  if (budget.requestsUsed >= budget.maxRequestsPerMonth) return false;
  return budget.textRequestsUsed < config.maxTextRequestsPerMonth;
}

/** Bao nhiêu agent còn được LLM nghĩ hộ tháng này. */
export function agentSlotsLeft(budget: Budget): number {
  if (!canCallAgents(budget)) return 0;
  const config = costConfig();
  const requests = Math.max(0, budget.maxRequestsPerMonth - budget.requestsUsed);
  return requests * config.agentsPerRequest;
}

export interface SpendInput {
  usage: { in: number; out: number };
  pricing: Pricing;
  kind: 'agents' | 'text';
}

export function spend(budget: Budget, input: SpendInput): Budget {
  const cost =
    (input.usage.in / 1_000_000) * input.pricing.inPerMTok +
    (input.usage.out / 1_000_000) * input.pricing.outPerMTok;

  return {
    ...budget,
    requestsUsed: budget.requestsUsed + 1,
    textRequestsUsed: budget.textRequestsUsed + (input.kind === 'text' ? 1 : 0),
    tokensIn: budget.tokensIn + input.usage.in,
    tokensOut: budget.tokensOut + input.usage.out,
    costUsd: budget.costUsd + cost,
  };
}

export function setLlmEnabled(budget: Budget, enabled: boolean): Budget {
  return { ...budget, llmEnabled: enabled };
}

export function setMonthlyCap(budget: Budget, cap: number): Budget {
  return { ...budget, maxRequestsPerMonth: Math.max(0, Math.round(cap)) };
}

/**
 * Câu trả lời cho Test C của mục 12.
 *
 * `perYear` là con số người chơi thật sự cần: chơi một năm trong game tốn bao
 * nhiêu. `months` là số tháng đã mô phỏng, không phải số tháng đã trôi trên đồng
 * hồ thật.
 */
export function costReport(
  budget: Budget,
  months = budget.monthsSimulated,
): { tokensIn: number; tokensOut: number; totalUsd: number; perMonthUsd: number; perYearUsd: number } {
  const safeMonths = Math.max(1, months);
  const perMonth = budget.costUsd / safeMonths;
  return {
    tokensIn: budget.tokensIn,
    tokensOut: budget.tokensOut,
    totalUsd: budget.costUsd,
    perMonthUsd: perMonth,
    perYearUsd: perMonth * 12,
  };
}
