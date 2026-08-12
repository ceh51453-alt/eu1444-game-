/**
 * TRANG BỊ CỦA MỘT ĐẤU SĨ — VIẾT LẠI Ở PHẦN 16 (mục 19 việc 4).
 *
 * Bản Phần 9 tự nạp `data/weapons.json` và `data/armor.json`, tự dựng một bảng
 * "ô giáp → loại giáp", và tự khai một danh sách khe hở theo VÙNG. Bản này
 * không còn nạp gì cả: nó gọi `@/systems/items`, nơi bản đồ che phủ thật sống.
 *
 * VÌ SAO FILE NÀY VẪN CÒN, thay vì cho Phần 9 gọi thẳng Phần 16: `Loadout` là
 * hình dạng mà cả `resolve.ts`, `actions.ts`, `modifiers.ts` và bốn component UI
 * của Phần 9 đã đọc. Giữ đúng hình dạng ấy nghĩa là Phần 16 thay được RUỘT của
 * giáp mà không phải sửa mười file — và mỗi file phải sửa là một chỗ có thể sửa
 * sai. Cái được thêm vào là `coverage`: bản đồ đầy đủ, cho ai cần bản đầy đủ.
 *
 * KHÔNG CÓ MỘT CON SỐ PHÒNG THỦ TỔNG, y như trước (README mục 8.5). `armorAt`
 * chỉ còn là một phép tra tên loại giáp để biên niên gọi đúng chữ; thứ quyết
 * định thương tích là `resolveArmor` của Phần 16.
 */

import { allRegions } from '@/systems/body/regions';
import { gearName, gearOf, type CarriedGear } from '@/systems/character/gear';
import {
  armorClassOf as itemArmorClassOf,
  armorClasses as itemArmorClasses,
  armorPieceOf,
  bareClass as itemBareClass,
  bluntedCause as itemBluntedCause,
  buildCoverage,
  buildLoad,
  coverAt,
  coverageRecord,
  hasWeaponProfile,
  itemName,
  qualityOf,
  shieldProfile as itemShieldProfile,
  unarmedProfile as itemUnarmedProfile,
  weaponProfile as itemWeaponProfile,
  weightOf,
  wornFromCarried,
  wornWeapon,
  type ArmorClass,
  type ArmorPiece,
  type CoverageMap,
  type ShieldProfile,
  type WeaponProfile,
  type WornPiece,
  type WornWeapon,
} from '@/systems/items';

export type { ArmorClass, ArmorPiece, ShieldProfile, WeaponProfile };

// Cửa đọc data — Phần 9 vẫn gọi bằng đúng tên cũ, ruột nằm ở Phần 16.
export const weaponProfile = itemWeaponProfile;
export const unarmedProfile = itemUnarmedProfile;
export const bluntedCause = itemBluntedCause;
export const armorClassOf = itemArmorClassOf;
export const armorClasses = itemArmorClasses;
export const bareClass = itemBareClass;
export const shieldProfile = itemShieldProfile;

export function armorPiece(itemId: string): ArmorPiece | null {
  return armorPieceOf(itemId);
}

// ---------------------------------------------------------------------------
// Trang bị đã gộp
// ---------------------------------------------------------------------------

/**
 * Trang bị của một đấu sĩ, dựng MỘT LẦN lúc vào trận rồi giữ nguyên suốt trận.
 *
 * Tính lại mỗi hiệp thì vòng lặp 200 trận của bài test mục 12.10 sẽ dựng lại
 * bản đồ che phủ hàng chục nghìn lần cho một kết quả không đổi.
 */
export interface Loadout {
  /** Nguyên văn danh sách món đang mang — nguồn `duel.trang-bi` đọc lại nó. */
  carried: CarriedGear[];
  weaponId: string;
  weapon: WeaponProfile;
  /** Vũ khí chính ở dạng vật phẩm cụ thể — `strikeOf` của Phần 16 cần nó. */
  mainWeapon: WornWeapon;
  shieldId: string;
  shield: ShieldProfile | null;
  /** BẢN ĐỒ CHE PHỦ ĐẦY ĐỦ của Phần 16 — nguồn sự thật của mọi thứ dưới đây. */
  coverage: CoverageMap;
  worn: WornPiece[];
  /** Id vùng → loại giáp che nó. Chỉ để GỌI TÊN, không để tính (xem đầu file). */
  armorByRegion: Map<string, ArmorClass>;
  /** Vùng chưa kín 100 — chỗ mũi đâm đi tìm. */
  gapRegions: Set<string>;
  /** Loại giáp NẶNG NHẤT đang mặc — nhãn `dich-giap-tam` tra chỗ này. */
  heaviest: ArmorClass;
  /** Thể lực mất mỗi hiệp: món giáp khai bao nhiêu, cộng tải và PHÂN BỔ tải. */
  staminaPerRound: number;
  weightFactor: number;
  sightPenalty: number;
  totalKg: number;
  /** Tên món để biên niên và UI gọi đúng chữ. */
  weaponName: string;
  armorName: string;
}

function displayName(itemId: string): string {
  return gearOf(itemId) === null ? itemName(itemId) : gearName(itemId);
}

export function buildLoadout(carried: readonly CarriedGear[]): Loadout {
  const bare = itemBareClass();
  const worn = wornFromCarried(carried);
  const coverage = buildCoverage(worn);

  let weaponId = '';
  let shieldId = '';
  let staminaPerRound = 0;
  let sightPenalty = 0;
  let armorName = '';
  // Món giáp ĐẠI DIỆN cho bộ đồ, để biên niên gọi đúng tên: loại nặng nhất
  // trước, rồi tới diện che rộng nhất. Một hiệp sĩ mặc giáp tấm phải được gọi là
  // "giáp tấm", không phải "ghệt sắt" chỉ vì đôi ghệt được duyệt sau cùng.
  let armorScore = -1;

  for (const entry of carried) {
    if (!entry.equipped) continue;

    const shield = itemShieldProfile(entry.item);
    if (shield !== null) {
      shieldId = entry.item;
      staminaPerRound += shield.staminaPerRound;
      continue;
    }

    const piece = armorPieceOf(entry.item);
    if (piece !== null) {
      staminaPerRound += piece.staminaPerRound;
      sightPenalty += piece.sightPenalty;
      const rank = itemArmorClassOf(piece.class)?.rank ?? 0;
      const score = rank * 100 + piece.covers.length;
      if (score > armorScore) {
        armorScore = score;
        armorName = displayName(entry.item);
      }
      continue;
    }

    // Vũ khí chính là món có tầm với XA NHẤT trong tay: một người cầm kiếm và
    // giắt dao găm thì đánh bằng kiếm, không phải bằng thứ nhặt được trước. Cung
    // và nỏ khai tầm CẬN CHIẾN ở đây (xem `$rangedComment` của weapons.json) nên
    // chúng không bao giờ giành mất chỗ của một thanh kiếm.
    if (!hasWeaponProfile(entry.item) && gearOf(entry.item)?.kind !== 'vu-khi') continue;
    const profile = itemWeaponProfile(entry.item);
    if (weaponId === '' || profile.reach.max > itemWeaponProfile(weaponId).reach.max) {
      weaponId = entry.item;
    }
  }

  // TRỌNG LƯỢNG CÓ PHÂN BỔ (Phần 16 mục 9): ba mươi cân trải đều mệt ít hơn
  // mười lăm cân treo trên vai, và đó là lý do giáp tấm thắng giáp lưới trong
  // lịch sử. Cộng thẳng tổng cân nặng vào đây là nói ngược lại.
  // Túi đồ vẫn nặng dù món bên trong không che cơ thể. Trước đây `equipped:
  // false` làm cả cân nặng biến mất, nên cất giáp vào ba-lô là một cách gian
  // thể lực miễn phí ngay giữa hai trận.
  const packedKg = carried
    .filter((entry) => !entry.equipped)
    .reduce((sum, entry) => sum + weightOf(entry.item, entry.material), 0);
  const load = buildLoad(worn, { extraKg: packedKg });

  const armorByRegion = new Map<string, ArmorClass>();
  const gapRegions = new Set<string>();
  for (const region of allRegions()) {
    const cover = coverAt(coverage, region.id);
    if (cover.coverage < 100) gapRegions.add(region.id);
    if (cover.coverage <= 0) continue;
    const armorClass = itemArmorClassOf(cover.armorClassId);
    if (armorClass !== null) armorByRegion.set(region.id, armorClass);
  }

  const mainEntry = carried.find((entry) => entry.equipped && entry.item === weaponId);
  const mainMaterial = mainEntry === undefined ? '' : mainEntry.material;
  const mainWeapon = wornWeapon(weaponId, {
    ...(mainMaterial === '' ? {} : { material: mainMaterial }),
    quality: mainEntry === undefined ? 2 : qualityOf(mainEntry.quality).level,
  });

  return {
    carried: carried.map((entry) => ({ ...entry })),
    weaponId,
    weapon: weaponId === '' ? itemUnarmedProfile() : itemWeaponProfile(weaponId),
    mainWeapon,
    shieldId,
    shield: shieldId === '' ? null : itemShieldProfile(shieldId),
    coverage,
    worn,
    armorByRegion,
    gapRegions,
    heaviest: itemArmorClassOf(coverage.heaviest) ?? bare,
    staminaPerRound: Math.round((staminaPerRound + load.fatiguePerRound) * 100) / 100,
    weightFactor: 1 + load.totalKg / 100,
    sightPenalty,
    totalKg: load.totalKg,
    weaponName: weaponId === '' ? 'tay không' : displayName(weaponId),
    armorName: armorName === '' ? bare.name.toLowerCase() : armorName,
  };
}

// ---------------------------------------------------------------------------
// Đọc
// ---------------------------------------------------------------------------

/**
 * Loại giáp che một vùng, và vùng đó còn hở không.
 *
 * `gap` bây giờ nghĩa là "chưa kín 100", không còn nghĩa "coi như trần". Một
 * vùng che 95% vẫn là giáp tấm, và cú tung có lọt vào năm phần trăm kia hay
 * không là việc của `resolveArmor` (Phần 16 mục 4).
 */
export function armorAt(loadout: Loadout, regionId: string): { armorClass: ArmorClass; gap: boolean } {
  const cover = coverAt(loadout.coverage, regionId);
  return {
    armorClass: itemArmorClassOf(cover.armorClassId) ?? itemBareClass(),
    gap: cover.coverage < 100,
  };
}

/** Vùng còn hở — chỗ mũi đâm đi tìm (Phần 9 mục 7, Phần 16 mục 4). */
export function gapsOf(loadout: Loadout): string[] {
  return loadout.coverage.gaps.map((cover) => cover.regionId);
}

/** Bản đồ che phủ dạng bảng số — đúng thứ `HitOptions` của Phần 7 nhận. */
export function coveredCells(loadout: Loadout): Record<string, number> {
  return coverageRecord(loadout.coverage);
}
