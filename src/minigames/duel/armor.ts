/**
 * QUY TẮC GIÁP — Phần 9 mục 7, HIỆN THỰC ĐẦY ĐỦ Ở PHẦN 16 (mục 19 việc 4).
 *
 * "Giáp thay đổi LOẠI thương tích có thể xảy ra." Câu đó vẫn chia file này làm
 * hai nửa chạy ở HAI THỜI ĐIỂM khác nhau:
 *
 *   `preHitArmor`   TRƯỚC cú tung. Bên tấn công đang đối mặt với bộ giáp nào,
 *                   và cú tung ấy khó lên bao nhiêu. Đây là vế "đâm vào khe hở
 *                   giáp cần kiểm định khó hơn nhiều", và nó KHÔNG đổi ở Phần
 *                   16: mức khó vẫn tra `armorRules` theo LOẠI giáp, vì người
 *                   đang vung kiếm nhìn thấy cả bộ giáp trước mặt chứ không
 *                   biết trước mũi kiếm sẽ đi vào đâu.
 *   `postHitArmor`  SAU khi đã trúng và đã biết trúng vào ĐÂU. ĐÂY LÀ CHỖ PHẦN
 *                   16 THAY RUỘT: không còn tra một bảng "loại đòn × loại giáp"
 *                   nữa mà đi qua BẢN ĐỒ CHE PHỦ — che bao nhiêu phần trăm ở
 *                   đúng vùng ấy, chống bao nhiêu trên đúng TRỤC của đòn ấy.
 *
 * Cái được là chiều sâu mà mục 3–4 đòi: cùng một đường chém, trúng ngực tấm thì
 * dội lại, trúng nách thì đi thẳng vào người. Bảng cũ không phân biệt được hai
 * chỗ đó vì nó chỉ biết "đối thủ mặc giáp tấm".
 */

import type { Rng } from '@/core/rng';
import type { InjuryType } from '@/systems/body/catalog';
import { INJURY_TYPES } from '@/systems/body/catalog';
import { regionName } from '@/systems/body/regions';
import type { HitOptions } from '@/systems/body/inflict';
import { resolutionConfig, resolveArmor, strikeOf, type Strike } from '@/systems/items';
import { armorPiercingConfig, armorRules, type ArmorRule } from './data';
import { coveredCells, gapsOf, type Loadout } from './equipment';
import type { ResolvedAction } from './actions';

/** Nhãn đòn dùng để tra `armorRules`. Đòn không mang nhãn nào thì không tra. */
export function attackTagOf(action: ResolvedAction): string | null {
  for (const tag of ['dap', 'dam', 'chem', 'vat-lon']) {
    if (action.tags.includes(tag)) return tag;
  }
  return null;
}

function ruleFor(tag: string, armorClassId: string): ArmorRule | null {
  return armorRules().find((rule) => rule.attack === tag && rule.armorClass === armorClassId) ?? null;
}

// ---------------------------------------------------------------------------
// Trước cú tung
// ---------------------------------------------------------------------------

export interface PreHitArmor {
  /** Điều chỉnh thang d100, âm là khó hơn. */
  mod: number;
  note: string;
  /** Đối thủ đang mặc giáp tấm — nhãn `dich-giap-tam` của Phần 8 bật lên. */
  facingPlate: boolean;
}

export function preHitArmor(action: ResolvedAction, foe: Loadout): PreHitArmor {
  const facingPlate = foe.heaviest.plate;
  const tag = attackTagOf(action);
  if (tag === null) return { mod: 0, note: '', facingPlate };

  const rule = ruleFor(tag, foe.heaviest.id);
  if (rule === null || rule.hitMod === 0) return { mod: 0, note: '', facingPlate };

  // `gapOnly`: mức phạt là cái giá của việc NHẮM vào khe hở. Một mũi đâm bừa vào
  // tấm ngực thì dễ trúng như thường — nó chỉ vô dụng, và `postHitArmor` mới là
  // chỗ nói ra điều đó. Tính mức phạt cho cả hai lối là phạt hai lần một lỗi.
  if (rule.gapOnly && !action.targetsGaps) return { mod: 0, note: '', facingPlate };

  // Nửa kiếm: nắm hẳn vào lưỡi mà đâm thì phần lớn mức phạt biến mất. Phần còn
  // lại của chiêu — dòng +25 mà node đã khai — đi qua registry của Phần 8, không
  // cộng ở đây. Hai vế ở hai chỗ, và cả hai đều hiện ra thành dòng đọc được.
  const relief = action.armorPiercing ? armorPiercingConfig().gapPenaltyRelief : 0;
  const mod = Math.round(rule.hitMod * (1 - relief));
  if (mod === 0) return { mod: 0, note: '', facingPlate };

  const note = action.armorPiercing
    ? `Đâm khe ${foe.heaviest.name.toLowerCase()} (nắm lưỡi)`
    : `${foe.heaviest.name} chắn đường`;
  return { mod, note, facingPlate };
}

/** Nhãn hoàn cảnh mà bộ giáp đối thủ bật lên cho registry (Phần 8 đã dùng sẵn). */
export function armorTags(foe: Loadout): string[] {
  return foe.heaviest.plate ? ['dich-giap-tam'] : [];
}

// ---------------------------------------------------------------------------
// Vị trí trúng đòn
// ---------------------------------------------------------------------------

/**
 * Dựng `HitOptions` của Phần 7 mục 1 từ một đòn cụ thể.
 *
 * Phần 7 chừa sẵn ba chỗ cắm — `postureBias`, `coverage`, `rerollCovered` — và
 * ghi rõ "bảng tư thế thật thuộc về Phần 9". Đây là bảng đó. Phần 16 đổi chỗ
 * cắm thứ hai từ danh sách ô giáp sang BẢN ĐỒ PHẦN TRĂM, nên "trượt khỏi chỗ có
 * giáp" bây giờ tỉ lệ với mức che phủ thật thay vì là một cờ có/không.
 */
export function hitOptionsFor(action: ResolvedAction, foe: Loadout): HitOptions {
  const bias: Record<string, number> = { ...action.base.aimBias };

  if (action.targetsGaps) {
    // Mũi dao và thế nửa kiếm không chém bừa: chúng đi tìm chỗ hở. Trọng số cộng
    // vào từng VÙNG còn hở, chứ không phải một cờ "bỏ qua giáp".
    const weight = resolutionConfig().gapAimBias;
    for (const region of gapsOf(foe)) bias[region] = (bias[region] ?? 1) * weight;
  }

  const coverage = coveredCells(foe);
  return {
    ...(Object.keys(bias).length === 0 ? {} : { postureBias: bias }),
    ...(Object.keys(coverage).length === 0 ? {} : { coverage }),
    // TUNG LẠI CHỈ CHO ĐÒN ĐANG ĐI TÌM KHE HỞ, và đây là một thay đổi thật so
    // với bản Phần 9. Ở đó mọi đòn đều được tung lại một lần khi rơi vào ô có
    // giáp, vì mô hình cũ chỉ biết "ô này có giáp" hoặc "không" — nên tung lại
    // là cách duy nhất diễn tả mũi giáo trượt đi. Bây giờ `resolveArmor` đã tung
    // riêng một lần để xem đòn rơi vào phần kim loại hay vào khe, nên giữ thêm
    // cú tung lại cho MỌI đòn là thưởng hai lần cho cùng một hiện tượng: một
    // đường chém bừa sẽ tự đi tìm nách, và bộ giáp tấm rỉ ra một phần tư số trận
    // mà lẽ ra nó phải thắng gần hết. Đòn CỐ Ý nhắm khe thì vẫn được tung lại —
    // đó mới là chỗ kỹ thuật của người đánh có nghĩa.
    rerollCovered: action.targetsGaps ? 2 : 0,
  };
}

// ---------------------------------------------------------------------------
// Sau khi đã trúng
// ---------------------------------------------------------------------------

export interface PostHitArmor {
  /** Trần mức độ vết thương. 5 nghĩa là không cắt gì cả. */
  severityCap: number;
  /** Loại vết bị đổi thành, hoặc null khi giữ nguyên. */
  forceType: InjuryType | null;
  /** Vết đi qua chỗ giáp không che — nách, bẹn, khe che cổ. */
  throughGap: boolean;
  /** Vũ khí bạc: vết thương KHÔNG TỰ LÀNH cho Huyết Tộc (Phần 14b mục D). */
  silver: boolean;
  /** Một dòng cho nhật ký hiệp. Rỗng khi giáp không đổi gì. */
  note: string;
}

function asInjuryType(value: string): InjuryType | null {
  if (value === '') return null;
  return (INJURY_TYPES as readonly string[]).includes(value) ? (value as InjuryType) : null;
}

/**
 * Vết thương này thành cái gì sau khi đi qua giáp ở ĐÚNG vùng vừa trúng.
 *
 * Toàn bộ phán quyết nằm ở `resolveArmor` của Phần 16 — file này chỉ dịch kết
 * quả sang từ vựng mà `landHit` của Phần 9 đã đọc. Một luật giáp, một chỗ.
 */
export function postHitArmor(
  rng: Rng,
  action: ResolvedAction,
  foe: Loadout,
  attacker: Loadout,
  regionId: string,
  options: { blunted?: boolean } = {},
): PostHitArmor {
  const tag = attackTagOf(action);
  const strike: Strike | null =
    tag === null
      ? null
      : strikeOf(attacker.mainWeapon, {
          tags: [tag],
          targetsGaps: action.targetsGaps,
          ...(options.blunted === true ? { blunted: true } : {}),
        });

  if (strike === null) {
    // Đòn không mang trục nào — vật lộn, hất cát, húc khiên. Giáp không đổi gì,
    // và nói rằng nó đổi là bịa ra một luật thứ hai cho một trường hợp không có.
    return { severityCap: 5, forceType: null, throughGap: false, silver: false, note: '' };
  }

  const outcome = resolveArmor(rng, strike, foe.coverage, regionId);
  const note =
    outcome.kind === 'khe-ho' && outcome.note === ''
      ? ''
      : outcome.kind === 'chan'
        ? `${foe.heaviest.name} ăn trọn đòn ở ${regionName(regionId).toLowerCase()}`
        : outcome.note;

  return {
    severityCap: outcome.severityCap,
    forceType: asInjuryType(outcome.forceType),
    throughGap: outcome.kind === 'khe-ho',
    silver: strike.silver,
    note,
  };
}
