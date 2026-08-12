/**
 * HUY HIỆU & DANH TÍNH (Phần 16 mục 13) — BA TÁC DỤNG CƠ HỌC, không phải trang trí.
 *
 *   a) Được nhận ra → BỊ BẮT SỐNG để đòi tiền chuộc thay vì bị giết (Phần 10)
 *   b) Được nhận ra → uy tín tăng khi lập công, NHƯNG cũng bị nhắm làm mục tiêu
 *   c) GIẤU huy hiệu → đánh ẩn danh trong đấu giải, hoặc trốn thoát sau trận
 *      thua — nhưng nếu bị phát hiện là MẤT DANH DỰ NẶNG
 *
 * Và một luật thứ tư, nằm ở câu cuối mục 13 và dễ bị bỏ qua nhất: NGƯỜI MẶC
 * GIÁP TỐT MÀ KHÔNG CÓ HUY HIỆU THÌ BỊ COI LÀ CƯỚP VÀ BỊ GIẾT NGAY. Nó là mặt
 * trái của (a): giấu huy hiệu không phải một lựa chọn miễn phí.
 */

import type { Rng } from '@/core/rng';
import { heraldryConfig } from './data';
import { valueOf } from './item';
import type { Heraldry, Item } from './types';

/** Huy hiệu ĐANG HIỆN trên người, nếu có. Món che đi không tính. */
export function visibleDevice(items: readonly Item[]): Heraldry | null {
  const carriers = new Set(heraldryConfig().carriers);
  for (const item of items) {
    if (item.heraldry === null || !item.heraldry.visible) continue;
    if (!carriers.has(item.templateId)) continue;
    return item.heraldry;
  }
  return null;
}

/** Có mang huy hiệu nhưng đang che đi — trạng thái của mục 13c. */
export function hasHiddenDevice(items: readonly Item[]): boolean {
  return items.some((item) => item.heraldry !== null && !item.heraldry.visible);
}

export interface Recognition {
  recognised: boolean;
  device: string;
  ownerId: string;
  /** Cộng vào cơ hội BỊ BẮT SỐNG thay vì bị giết (mục 13a, nối Phần 10 mục 12). */
  captureBonus: number;
  /** Cộng vào cơ hội bị nhắm làm mục tiêu (mục 13b). */
  targetedBonus: number;
  /** Cộng vào cơ hội bị giết ngay vì bị coi là cướp (câu cuối mục 13). */
  killBonus: number;
  prestigePerVictory: number;
  lines: string[];
}

/**
 * Người này bước vào trận với danh tính nào.
 *
 * `armourValue` quyết định luật cuối: mặc đồ đắt mà không có huy hiệu thì không
 * ai tin ngài là quý tộc, và không ai giữ mạng một tên cướp mặc giáp tấm để đòi
 * tiền chuộc cả.
 */
export function recognitionOf(items: readonly Item[]): Recognition {
  const config = heraldryConfig();
  const device = visibleDevice(items);
  const armourValue = items.reduce((sum, item) => sum + (item.kind === 'giap' ? valueOf(item) : 0), 0);
  const rich = armourValue >= config.richArmourValue;
  const lines: string[] = [];

  if (device !== null) {
    lines.push(`Huy hiệu ${device.device} hiện rõ — ai cũng biết ngài là ai.`);
    return {
      recognised: true,
      device: device.device,
      ownerId: device.ownerId,
      captureBonus: config.captureChanceBonus,
      targetedBonus: config.targetedBonus,
      killBonus: 0,
      prestigePerVictory: config.prestigePerVictory,
      lines,
    };
  }

  if (rich) {
    lines.push('Giáp đắt tiền mà không huy hiệu: người ta sẽ coi ngài là cướp.');
  }
  if (hasHiddenDevice(items)) {
    lines.push('Huy hiệu đã che đi — đánh ẩn danh được, tới khi có người nhận ra.');
  }

  return {
    recognised: false,
    device: '',
    ownerId: '',
    captureBonus: 0,
    targetedBonus: 0,
    killBonus: rich ? config.richNoDeviceKillBonus : 0,
    prestigePerVictory: 0,
    lines,
  };
}

export interface Exposure {
  discovered: boolean;
  honourChange: number;
  line: string;
}

/**
 * Đánh ẩn danh xong: có ai nhận ra không.
 *
 * Tung MỘT lần cho cả trận, không phải mỗi hiệp: mục 13c nói "nếu bị phát hiện"
 * — một sự kiện, không phải một dòng rủi ro tích lũy tới mức chắc chắn xảy ra.
 */
export function rollExposure(rng: Rng, items: readonly Item[]): Exposure {
  const config = heraldryConfig();
  if (!hasHiddenDevice(items)) return { discovered: false, honourChange: 0, line: '' };

  const discovered = rng.int(1, 100) <= config.hiddenDiscoveryChance;
  return discovered
    ? {
        discovered: true,
        honourChange: config.hiddenHonourLoss,
        line: 'Có người nhận ra gương mặt dưới tấm che — giấu huy hiệu mà bị bắt gặp là chuyện không gột được.',
      }
    : { discovered: false, honourChange: 0, line: 'Không ai biết người ấy là ai.' };
}

/** Che huy hiệu đi, hoặc bày ra. Thuần: trả về món mới (§7.3). */
export function setDeviceVisible(item: Item, visible: boolean): Item {
  if (item.heraldry === null) return item;
  return { ...item, heraldry: { ...item.heraldry, visible } };
}

/** Khắc huy hiệu của một người lên món. */
export function stampDevice(item: Item, ownerId: string, device: string): Item {
  return { ...item, heraldry: { ownerId, device, visible: true } };
}
