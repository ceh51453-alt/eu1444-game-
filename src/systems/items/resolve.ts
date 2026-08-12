/**
 * ĐÒN ĐI QUA GIÁP — BỐN KHẢ NĂNG CỦA MỤC 4.
 *
 *   khe hở       vùng chưa kín 100, và cú tung rơi đúng vào phần hở
 *                → thương tích ĐẦY ĐỦ, giáp coi như không có
 *   xuyên        sức xuyên hơn sức chống trên ĐÚNG trục của đòn
 *   đập xuyên    giáp chặn lưỡi nhưng KHÔNG chặn lực: chùy, búa, rìu cán dài
 *                gây gãy xương và nội thương ngay qua giáp
 *   chặn         không vết thương nào. Cái nó để lại là mệt (Phần 9 mục 8).
 *
 * Ba trục đi RIÊNG tới tận cùng: một đường chém và một mũi đâm vào CÙNG một
 * tấm ngực là hai phép so sánh khác nhau, với hai con số chống khác nhau. Gộp
 * chúng lại ở bất cứ đâu trong file này là xóa mất lý do tồn tại của cả mục 5.
 *
 * ĐÂY LÀ CHỖ "SỬA NGƯỢC PHẦN 7 VÀ PHẦN 9" của mục 19 việc 4 hội tụ: cả vòng
 * lượt (`body/inflict.ts`) lẫn trận quyết đấu (`minigames/duel/armor.ts`) đều
 * gọi vào đây, nên không có hai luật giáp nào tồn tại song song.
 */

import type { Rng } from '@/core/rng';
import { regionName } from '@/systems/body/regions';
import {
  AXES,
  bluntedRule,
  damageKindOf,
  emptyTriple,
  enchantmentOf,
  itemMaterial,
  materialOf,
  qualityByLevel,
  resolutionConfig,
  weaponProfile,
  type Axis,
  type AxisTriple,
  type WeaponProfile,
} from './data';
import { coverAt } from './coverage';
import type { ArmorOutcome, CoverageMap, ItemDamage } from './types';

/** Một vũ khí CỤ THỂ đang trong tay — cùng hình dạng tối thiểu với `WornPiece`. */
export interface WornWeapon {
  itemId: string;
  material: string;
  /** 1–5. */
  quality: number;
  /** 0–100. */
  condition: number;
  damage: ItemDamage[];
  enchantment: string;
}

export function wornWeapon(itemId: string, over: Partial<WornWeapon> = {}): WornWeapon {
  return {
    itemId,
    material: over.material ?? itemMaterial(itemId),
    quality: over.quality ?? 2,
    condition: over.condition ?? 100,
    damage: over.damage ?? [],
    enchantment: over.enchantment ?? '',
  };
}

/** Cùng đường cong với giáp: đồ cũ yếu đi, nhưng không bao giờ về 0. */
function conditionFactor(condition: number): number {
  return 0.6 + 0.4 * (Math.max(0, Math.min(100, condition)) / 100);
}

// ---------------------------------------------------------------------------
// Sức xuyên
// ---------------------------------------------------------------------------

export interface PowerOptions {
  /** Vũ khí cùn của đấu tập và đấu giải (Phần 9 mục 9). */
  blunted?: boolean;
}

/**
 * Ba con số xuyên THẬT của một món trong tay một người.
 *
 * Vật liệu nhân, tay nghề cộng, phù phép cộng, hư hỏng trừ, tình trạng nhân.
 * Thứ tự ấy là cố ý và giống hệt bên giáp (`coverage.ts`): hai bên phải đối
 * xứng, nếu không thì cân bằng một bên là mất cân bằng bên kia.
 */
export function weaponPower(weapon: WornWeapon, options: PowerOptions = {}): AxisTriple {
  const profile = weaponProfile(weapon.itemId);
  const material = materialOf(weapon.material);
  const quality = qualityByLevel(weapon.quality);
  const enchantment = weapon.enchantment === '' ? null : enchantmentOf(weapon.enchantment);
  const wear = conditionFactor(weapon.condition);
  const blunt = options.blunted === true ? bluntedRule().powerFactor : 1;

  const damage = emptyTriple();
  for (const entry of weapon.damage) {
    const kind = damageKindOf(entry.kind);
    if (kind === null) continue;
    for (const axis of AXES) damage[axis] += kind.power[axis];
  }

  const power = emptyTriple();
  for (const axis of AXES) {
    const raw =
      profile.power[axis] * material.power[axis] +
      quality.power +
      (enchantment?.weapon[axis] ?? 0) +
      damage[axis];
    power[axis] = Math.max(0, Math.round(raw * wear * blunt));
  }
  return power;
}

/** Sức xuyên của một cú bắn — khác hẳn sức của chính cây cung khi vụt vào đầu. */
export function rangedPower(weapon: WornWeapon, options: { wet?: boolean } = {}): AxisTriple | null {
  const ranged = weaponProfile(weapon.itemId).ranged;
  if (ranged === undefined) return null;

  const material = materialOf(weapon.material);
  const quality = qualityByLevel(weapon.quality);
  const wear = conditionFactor(weapon.condition);
  // Cung sừng hỏng khi mưa (mục 6), và thuốc súng ẩm là hỏng HOÀN TOÀN (mục 16).
  const wet = options.wet === true ? Math.max(ranged.wetPenalty, material.wetPenalty) : 0;
  const dry = Math.max(0, 1 - wet / 100);

  const power = emptyTriple();
  for (const axis of AXES) {
    power[axis] = Math.max(0, Math.round((ranged.power[axis] + quality.power) * wear * dry));
  }
  return power;
}

// ---------------------------------------------------------------------------
// Trục của một đòn
// ---------------------------------------------------------------------------

const TAG_TO_AXIS: Readonly<Record<string, Axis>> = { chem: 'chem', dam: 'dam', dap: 'dap' };

/**
 * Đòn này đi vào trục nào.
 *
 * Đọc theo thứ tự `dap` → `dam` → `chem` giống `attackTagOf` của Phần 9, để một
 * chiêu mang nhiều nhãn luôn được xử bằng CÙNG một trục ở cả hai chỗ. Hai thứ
 * tự khác nhau nghĩa là một cây kích gây gãy xương trong trận đấu và gây vết
 * cắt trong vòng lượt — cùng một chiêu, hai kết quả.
 */
export function axisOfTags(tags: readonly string[]): Axis | null {
  for (const tag of ['dap', 'dam', 'chem']) {
    const axis = TAG_TO_AXIS[tag];
    if (axis !== undefined && tags.includes(tag)) return axis;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Một cú đánh
// ---------------------------------------------------------------------------

export interface Strike {
  axis: Axis;
  power: number;
  /** Chùy, búa, rìu: đập xuyên qua thành GÃY XƯƠNG chứ không phải bầm tím. */
  crush: boolean;
  /** Đòn NHẮM vào khe hở — gỡ phần lớn che phủ, và trả giá ở cú tung (mục 4). */
  targetsGaps: boolean;
  /** Bạc: vết thương KHÔNG TỰ LÀNH cho Huyết Tộc (Phần 14b mục D). */
  silver: boolean;
  /** Tên món, để biên niên gọi đúng chữ. */
  weaponId: string;
}

export interface StrikeOptions extends PowerOptions {
  targetsGaps?: boolean;
  /** Nhãn đòn; nếu vắng thì lấy `tags` của chính hồ sơ vũ khí. */
  tags?: readonly string[];
  /** Dùng sức bắn thay cho sức cận chiến. */
  ranged?: boolean;
  wet?: boolean;
}

/** Dựng một cú đánh từ vũ khí + nhãn đòn. Trả về null khi đòn không mang trục nào. */
export function strikeOf(weapon: WornWeapon, options: StrikeOptions = {}): Strike | null {
  const profile: WeaponProfile = weaponProfile(weapon.itemId);
  const axis = axisOfTags(options.tags ?? profile.tags);
  if (axis === null) return null;

  const power =
    options.ranged === true
      ? (rangedPower(weapon, { wet: options.wet ?? false }) ?? weaponPower(weapon, options))
      : weaponPower(weapon, options);

  const enchantment = weapon.enchantment === '' ? null : enchantmentOf(weapon.enchantment);
  return {
    axis,
    power: power[axis],
    crush: profile.crush,
    targetsGaps: options.targetsGaps ?? profile.gapSeeking,
    silver: materialOf(weapon.material).silver || (enchantment?.silverLike ?? false),
    weaponId: weapon.itemId,
  };
}

// ---------------------------------------------------------------------------
// Bốn khả năng của mục 4
// ---------------------------------------------------------------------------

/**
 * Đòn này thành cái gì sau khi đi qua giáp ở ĐÚNG vùng vừa trúng.
 *
 * HAI CÚ TUNG, KHÔNG PHẢI MỘT, và thứ tự có nghĩa:
 *   1. trúng vào phần CÓ giáp hay vào KHE HỞ — quyết bởi `coverage` của vùng
 *   2. nếu có giáp: xuyên, đập xuyên, hay bị chặn — quyết bởi `pen` trên trục
 *
 * Một mũi dao vào nách không cần thắng bất kỳ phép so sánh sức chống nào, vì ở
 * đó không có gì để so. Đó là toàn bộ giá trị của khe hở, và gộp hai bước lại
 * thành một phép trừ duy nhất là làm mất nó.
 */
export function resolveArmor(rng: Rng, strike: Strike, map: CoverageMap, regionId: string): ArmorOutcome {
  const config = resolutionConfig();
  const cover = coverAt(map, regionId);
  const effective = strike.targetsGaps
    ? Math.round(cover.coverage * (1 - config.gapRelief))
    : cover.coverage;

  if (effective <= 0 || rng.int(1, 100) > effective) {
    const where = cover.gapName === '' ? regionName(regionId).toLowerCase() : cover.gapName;
    return {
      kind: 'khe-ho',
      severityCap: 5,
      forceType: '',
      pen: strike.power,
      coverage: cover.coverage,
      axis: strike.axis,
      note: cover.coverage <= 0 ? '' : `Mũi đòn lọt vào ${where}`,
    };
  }

  const protection = cover.protection[strike.axis];
  const pen = strike.power - protection;
  const band = config.bands.find((row) => pen >= row.minPen) ?? config.bands[config.bands.length - 1];
  if (band === undefined) {
    return {
      kind: 'chan',
      severityCap: 0,
      forceType: '',
      pen,
      coverage: cover.coverage,
      axis: strike.axis,
      note: '',
    };
  }

  const kind: ArmorOutcome['kind'] =
    band.id === 'chan' ? 'chan' : band.id === 'dap-xuyen' ? 'dap-xuyen' : 'xuyen';
  // Vũ khí có `crush` thì "đập xuyên qua" là GÃY XƯƠNG, không phải một vết bầm:
  // đó là câu "chùy, búa, rìu cán dài gây gãy xương và nội thương ngay qua giáp"
  // của mục 4, và nó là lý do duy nhất cây búa đáng giá gấp đôi cây kiếm.
  const forceType =
    kind === 'dap-xuyen' ? (strike.crush ? config.crushForceType : (band.forceType ?? '')) : (band.forceType ?? '');

  return {
    kind,
    severityCap: band.severityCap,
    forceType,
    pen,
    coverage: cover.coverage,
    axis: strike.axis,
    note: noteFor(kind, cover.armorClassId, regionId),
  };
}

function noteFor(kind: ArmorOutcome['kind'], armorClassId: string, regionId: string): string {
  const where = regionName(regionId).toLowerCase();
  switch (kind) {
    case 'chan':
      return `Giáp ở ${where} ăn trọn đòn`;
    case 'dap-xuyen':
      return `Giáp chặn lưỡi, nhưng lực đi thẳng qua ${where}`;
    case 'xuyen':
      return armorClassId === 'khong-giap' ? '' : `Đòn xuyên qua giáp ở ${where}`;
    default:
      return '';
  }
}

/**
 * Sức xuyên cần có để KHÔNG bị chặn ở một vùng — dùng cho bảng so sánh của UI
 * mục 18 và cho lời khuyên "cây kiếm này không có cửa nào ở đây".
 */
export function penNeededAt(map: CoverageMap, regionId: string, axis: Axis): number {
  const bands = resolutionConfig().bands;
  const through = bands.filter((band) => band.severityCap > 0);
  const easiest = through.reduce((min, band) => Math.min(min, band.minPen), Number.POSITIVE_INFINITY);
  return coverAt(map, regionId).protection[axis] + (Number.isFinite(easiest) ? easiest : 0);
}
