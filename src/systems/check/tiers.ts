/**
 * NGƯỠNG 5 CẤP CHO TỪNG HỆ (Phần 5 mục 4).
 *
 * Mọi hàm ở đây THUẦN và KHÔNG dùng RNG: chúng nhận con xúc sắc đã tung. Đó là
 * điều kiện để bài Monte Carlo của mục 12.8 kiểm được ngưỡng bằng cách quét
 * toàn miền thay vì tin vào 100.000 lần tung — quét toàn miền thì một ngưỡng
 * cài lệch một đơn vị cũng lộ ngay, còn thống kê thì có thể vẫn lọt.
 *
 * THỨ TỰ CÁC LUẬT LÀ HỢP ĐỒNG, không phải chi tiết cài đặt. Mục 4 viết mỗi hệ
 * thành một danh sách có thứ tự và luật đứng trước thắng. Chỗ dễ hiểu nhầm nhất
 * là d100 với ngưỡng cao: T = 90, tung 97 rơi vào cả "T < roll ≤ T+10" lẫn
 * "roll ≥ 96 và roll > T". Danh sách của mục 4 đặt costlySuccess TRƯỚC, nên
 * costlySuccess thắng — người có kỹ năng 90 thì trầy trật vượt qua, chứ không
 * hỏng nặng. Chỉ `roll = 100` mới kéo họ xuống, vì đó là luật "luôn luôn".
 */

import type { CheckTier } from '@/core/turn';

/** Xấu nhất → tốt nhất. `dieShift` và nat20/nat1 dịch trên trục này. */
export const TIER_ORDER: readonly CheckTier[] = [
  'critFail',
  'fail',
  'costlySuccess',
  'success',
  'critSuccess',
] as const;

/** Nhãn tiếng Việt, dùng chung cho khối 11, UI và log. */
export const TIER_LABELS: Readonly<Record<CheckTier, string>> = {
  critFail: 'THẤT BẠI NẶNG',
  fail: 'THẤT BẠI',
  costlySuccess: 'THÀNH CÔNG CÓ GIÁ',
  success: 'THÀNH CÔNG',
  critSuccess: 'THÀNH CÔNG LỚN',
};

/** Cấp này có đạt được mục tiêu không. `costlySuccess` CÓ — chỉ là phải trả giá. */
export function isSuccess(tier: CheckTier): boolean {
  return tier === 'costlySuccess' || tier === 'success' || tier === 'critSuccess';
}

/** Dịch cấp lên/xuống, kẹp ở hai đầu thang. */
export function shiftTier(tier: CheckTier, steps: number): CheckTier {
  if (steps === 0) return tier;
  const at = TIER_ORDER.indexOf(tier);
  const moved = Math.max(0, Math.min(TIER_ORDER.length - 1, at + steps));
  const next = TIER_ORDER[moved];
  return next ?? tier;
}

// ---------------------------------------------------------------------------
// d100 tung-dưới — KỸ NĂNG CÁ NHÂN
// ---------------------------------------------------------------------------

/** `T` = kỹ năng SAU khi đã cộng modifier và kẹp. */
export function d100Tier(roll: number, target: number): CheckTier {
  if (roll === 1) return 'critSuccess';
  if (roll === 100) return 'critFail';
  if (roll <= Math.max(1, Math.floor(target / 10))) return 'critSuccess';
  if (roll <= target) return 'success';
  if (roll <= target + 10) return 'costlySuccess';
  if (roll >= 96) return 'critFail';
  return 'fail';
}

// ---------------------------------------------------------------------------
// d20 + chỉ số vs DC — ĐỐI KHÁNG NHANH, PHẢN XẠ
// ---------------------------------------------------------------------------

/** Cấp theo `margin` đơn thuần, chưa tính nat20/nat1. Dùng lại ở kiểm định đối kháng. */
export function d20TierFromMargin(margin: number): CheckTier {
  if (margin >= 10) return 'critSuccess';
  if (margin >= 0) return 'success';
  if (margin >= -3) return 'costlySuccess';
  if (margin >= -10) return 'fail';
  return 'critFail';
}

/**
 * `natural 20` nâng một bậc, `natural 1` hạ một bậc — tính TRÊN cấp đã suy ra
 * từ margin, không phải thay thế nó. Nat 20 với margin thảm hại vẫn chỉ kéo
 * `critFail` lên `fail`: mục 5 nói cái chết phải đến qua chuỗi biến cố, và điều
 * ngược lại cũng đúng — một mặt xúc sắc không được biến thảm họa thành chiến thắng.
 */
export function d20Tier(roll: number, modifier: number, dc: number): CheckTier {
  const base = d20TierFromMargin(roll + modifier - dc);
  if (roll === 20) return shiftTier(base, 1);
  if (roll === 1) return shiftTier(base, -1);
  return base;
}

// ---------------------------------------------------------------------------
// 3d6 tung-dưới — NĂNG LỰC DÀI HẠN
// ---------------------------------------------------------------------------

/**
 * `T` = chỉ số + cấp kỹ năng, sau modifier và kẹp.
 * `roll` là TỔNG ba viên (3..18).
 */
export function threeD6Tier(roll: number, target: number): CheckTier {
  if (roll <= 4) return 'critSuccess';
  if (roll >= 17) return 'critFail';
  if (roll <= target - 5) return 'critSuccess';
  if (roll <= target) return 'success';
  if (roll === target + 1 || roll === target + 2) return 'costlySuccess';
  return 'fail';
}

// ---------------------------------------------------------------------------
// Dice pool (d6) — QUY MÔ LỚN
// ---------------------------------------------------------------------------

export interface PoolTally {
  /** Mặt 5–6. */
  successes: number;
  /** Mặt 1 — đếm riêng vì chúng là điều kiện vỡ trận. */
  ones: number;
}

export function tallyPool(faces: readonly number[]): PoolTally {
  let successes = 0;
  let ones = 0;
  for (const face of faces) {
    if (face >= 5) successes++;
    else if (face === 1) ones++;
  }
  return { successes, ones };
}

/**
 * `required` = số thành công cần, do thang độ khó của mục 8 quyết định.
 *
 * Luật vỡ trận đứng TRƯỚC mọi luật khác: một đợt xung phong ném ra nhiều mặt 1
 * hơn số hit là đội hình tan, bất kể có đủ hit hay không. Đây chính là cái mà
 * README mục 8.6 gọi là "trận đánh phải kết thúc đột ngột".
 */
export function poolTier(faces: readonly number[], required: number): CheckTier {
  const { successes, ones } = tallyPool(faces);
  if (ones > successes) return 'critFail';
  if (successes >= required + 3) return 'critSuccess';
  if (successes >= required) return 'success';
  if (successes === required - 1) return 'costlySuccess';
  return 'fail';
}
