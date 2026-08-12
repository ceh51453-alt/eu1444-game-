/**
 * BỘ 12 CHỈ SỐ 4/4/4 (Phần 6 mục 1) và cầu nối sang Phần 5.
 *
 * Bốn công thức ở cuối file là CHỖ DUY NHẤT một chỉ số được phép biến thành con
 * số đi vào phép kiểm. Chúng ở đây chứ không rải trong từng minigame vì mục 1
 * khai đúng bốn dòng quy đổi, mỗi hệ một dòng — nếu Phần 9 tự nhân chỉ số với 3
 * còn Phần 10 nhân với 4 thì hai phần đó cân bằng khác nhau mà không ai cố ý
 * thiết kế như thế.
 *
 * Uy tín / Danh vọng KHÔNG có mặt ở đây. Nó là tài nguyên thay đổi liên tục
 * theo hành động, không phải một ô cố định của nhân vật — Phần 13 dựng.
 */

import type { CheckSystem } from '@/core/turn';

export const STAT_IDS = [
  'str',
  'agi',
  'vit',
  'per',
  'int',
  'wil',
  'wit',
  'arc',
  'pre',
  'elo',
  'gui',
  'emp',
] as const;

export type StatId = (typeof STAT_IDS)[number];

export type StatBlock = Record<StatId, number>;

export interface StatInfo {
  id: StatId;
  /** Tên tiếng Việt — đây là chữ người chơi đọc trong dòng modifier. */
  name: string;
  group: StatGroupId;
  /** Nó quyết định những gì, theo đúng mục 1. */
  covers: string;
}

export type StatGroupId = 'than-the' | 'tri-tue' | 'xa-hoi';

export const STAT_GROUPS: readonly { id: StatGroupId; name: string }[] = [
  { id: 'than-the', name: 'Thân thể' },
  { id: 'tri-tue', name: 'Trí tuệ' },
  { id: 'xa-hoi', name: 'Xã hội' },
] as const;

export const STATS: Readonly<Record<StatId, StatInfo>> = {
  str: { id: 'str', name: 'Sức mạnh', group: 'than-the', covers: 'nâng vác, sát thương cận chiến, phá cửa' },
  agi: { id: 'agi', name: 'Nhanh nhẹn', group: 'than-the', covers: 'né tránh, tốc độ, khéo tay, cưỡi ngựa' },
  vit: { id: 'vit', name: 'Thể chất', group: 'than-the', covers: 'máu tối đa, sức bền, kháng độc và dịch bệnh' },
  per: { id: 'per', name: 'Cảm quan', group: 'than-the', covers: 'thị lực, thính giác, phát hiện, bắn xa' },
  int: { id: 'int', name: 'Trí lực', group: 'tri-tue', covers: 'học vấn, ngôn ngữ, mưu lược, luật pháp' },
  wil: { id: 'wil', name: 'Ý chí', group: 'tri-tue', covers: 'kháng sợ hãi, chịu đau, kháng phép, giữ lời thề' },
  wit: { id: 'wit', name: 'Trực giác', group: 'tri-tue', covers: 'ứng biến, đọc tình huống, phản ứng bất ngờ' },
  arc: { id: 'arc', name: 'Huyền năng', group: 'tri-tue', covers: 'cảm ứng phép thuật và thần lực' },
  pre: { id: 'pre', name: 'Uy nghi', group: 'xa-hoi', covers: 'hiện diện, chỉ huy, khiến người khác phục' },
  elo: { id: 'elo', name: 'Hùng biện', group: 'xa-hoi', covers: 'thuyết phục, đàm phán, giảng đạo, kích động đám đông' },
  gui: { id: 'gui', name: 'Mưu mô', group: 'xa-hoi', covers: 'lừa dối, che giấu, âm mưu, phản gián' },
  emp: { id: 'emp', name: 'Đồng cảm', group: 'xa-hoi', covers: 'đọc người, gây thiện cảm, giữ lòng thuộc hạ' },
};

/** Thang 1–20 của mục 1. Trần THẬT của một nhân vật còn bị chủng tộc kẹp thêm. */
export const STAT_MIN = 1;
export const STAT_MAX = 20;

export function statsIn(group: StatGroupId): StatId[] {
  return STAT_IDS.filter((id) => STATS[id].group === group);
}

/** Người thường 8–10, xuất chúng 16+ — dùng cho nhãn trong UI, không vào công thức. */
export function statBandLabel(value: number): string {
  if (value <= 3) return 'tàn tật';
  if (value <= 6) return 'kém';
  if (value <= 10) return 'người thường';
  if (value <= 13) return 'khá';
  if (value <= 15) return 'giỏi';
  if (value <= 17) return 'xuất chúng';
  return 'phi thường';
}

export function emptyStatBlock(value = 0): StatBlock {
  const block = {} as StatBlock;
  for (const id of STAT_IDS) block[id] = value;
  return block;
}

export function addStatBlocks(base: StatBlock, ...others: readonly Partial<StatBlock>[]): StatBlock {
  const out = { ...base };
  for (const other of others) {
    for (const id of STAT_IDS) out[id] += other[id] ?? 0;
  }
  return out;
}

export function clampStat(value: number, cap = STAT_MAX): number {
  return Math.max(STAT_MIN, Math.min(cap, Math.round(value)));
}

export function isStatId(value: unknown): value is StatId {
  return typeof value === 'string' && (STAT_IDS as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// Nối vào Phần 5 (mục 1)
// ---------------------------------------------------------------------------

/**
 * `d100  kỹ năng% = (chỉ số chính × 3) + điểm rèn luyện + trang bị`
 *
 * Chỉ số KHÔNG được cộng sẵn vào `CheckSpec.base`, mà đi qua registry thành một
 * dòng riêng (xem `modifiers.ts`). Hàm này tồn tại để đọc ra tổng cuối — cho
 * UI, cho bảng so sánh chủng tộc, và cho test — chứ không phải để một hệ nào đó
 * tự cộng lấy.
 */
export function skillPercent(stat: number, training: number, gear = 0): number {
  return stat * 3 + training + gear;
}

/** `d20  mod = floor((chỉ số - 10) / 2)` */
export function d20Mod(stat: number): number {
  return Math.floor((stat - 10) / 2);
}

/** `3d6  T = chỉ số + cấp kỹ năng` */
export function threeD6Target(stat: number, skillLevel: number): number {
  return stat + skillLevel;
}

/**
 * Phần đóng góp của MỘT chỉ số vào hệ đang chạy, đúng bốn dòng của mục 1.
 *
 * `null` ở hệ pool là cố ý và là hợp đồng: mục 1 nói thẳng "pool không dùng chỉ
 * số cá nhân, dùng chất lượng đơn vị". Một chỉ số lọt vào dice pool nghĩa là
 * tướng giỏi làm cả vạn quân bắn chính xác hơn, và Phần 10 sẽ không bao giờ cân
 * bằng nổi.
 */
export function statContribution(system: CheckSystem, stat: number): number | null {
  switch (system) {
    case 'd100':
      return stat * 3;
    case '3d6':
      return stat;
    case 'd20':
      return d20Mod(stat);
    case 'pool':
      return null;
  }
}

/**
 * Phần đóng góp của ĐIỂM RÈN LUYỆN vào hệ đang chạy.
 *
 * `level` là điểm rèn luyện phẳng 0–100 — đơn vị của d100, vì d100 là hệ của kỹ
 * năng cá nhân. Hai hệ còn lại chạy trên thang hẹp hơn nên phải quy đổi, và quy
 * đổi nằm ĐÚNG MỘT CHỖ là đây: "cấp kỹ năng" của công thức 3d6 chính là
 * `level / 10`.
 *
 * Con số của d20 là cách đọc của Phần 6 — mục 1 không khai vế kỹ năng cho d20.
 * Phần 9 (đấu tay đôi) là chủ sở hữu thật của hệ đó và có quyền chỉnh lại BẢNG
 * NÀY; điều nó không được làm là dựng một bảng riêng ở chỗ khác, vì lúc đó "kiếm
 * thuật 60" sẽ có hai nghĩa khác nhau trong cùng một ván.
 */
export function skillContribution(system: CheckSystem, level: number): number {
  switch (system) {
    case 'd100':
      return Math.round(level);
    case '3d6':
      return Math.round(level / 10);
    case 'd20':
      return Math.floor(level / 20);
    case 'pool':
      return 0;
  }
}
