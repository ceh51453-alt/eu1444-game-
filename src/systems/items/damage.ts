/**
 * HƯ HỎNG & BẢO DƯỠNG (Phần 16 mục 10) — KHÔNG DÙNG MỘT THANH ĐỘ BỀN.
 *
 * `condition` vẫn có, nhưng nó chỉ là tổng hao mòn và nó KHÔNG đổi luật chơi ở
 * đâu ngoài một hệ số nhân nhẹ. Thứ thật sự đổi cơ học là DANH SÁCH hư hỏng cụ
 * thể: một thanh kiếm mẻ lưỡi mài lại được ngay tại lều, một thanh cong thì
 * phải chờ tới thị trấn có lò rèn, và một bộ giáp thủng ở yếm thì hở đúng chỗ
 * người ta nhắm. Một con số duy nhất không nói ra được ba chuyện khác nhau ấy.
 *
 * VÀ ĐÂY LÀ CHỖ NỐI VÀO PHẦN 11: "MỘT ĐẠO QUÂN KHÔNG CÓ THỢ RÈN ĐI THEO SẼ RÃ
 * TRANG BỊ SAU VÀI TUẦN CHIẾN DỊCH." `campaignWear` là câu đó thành con số, và
 * vòng tuần vây hãm gọi nó.
 */

import type { Rng } from '@/core/rng';
import {
  damageKindOf,
  damageKinds,
  itemValue,
  maintenanceConfig,
  materialOf,
  qualityByLevel,
  type DamageKind,
} from './data';
import type { Item, ItemDamage } from './types';

// ---------------------------------------------------------------------------
// Hao mòn
// ---------------------------------------------------------------------------

function clampCondition(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value * 10) / 10));
}

/** Loại hư hỏng có áp được cho món này không. */
function fits(kind: DamageKind, item: Item, options: { storage?: boolean; bow?: boolean }): boolean {
  if (!kind.applies.includes(item.kind)) return false;
  if (kind.storageOnly && options.storage !== true) return false;
  if (kind.bowOnly && options.bow !== true) return false;
  if (kind.broken) return false; // gãy là hệ quả của một cú cụ thể, không phải hao mòn
  return true;
}

export interface WearOptions {
  turn: number;
  /** Vùng cơ thể vừa bị đánh — để giáp móp và giáp thủng nằm ĐÚNG chỗ ấy. */
  regionId?: string;
  /** Đang nằm trong kho ẩm, không phải đang dùng. */
  storage?: boolean;
  bow?: boolean;
  /** Hệ số nhân vào lượng hao mòn — thiếu thợ rèn thì nhân lên. */
  factor?: number;
}

/**
 * Tung một hư hỏng cụ thể.
 *
 * Trọng số đến từ `damageBias` của vật liệu (mục 6): sắt rèn móp và cong gấp
 * rưỡi thép, thép Lùn gần như không mẻ, cung sừng thì giãn dây gấp đôi. Nhờ vậy
 * "vật liệu nào cũng có mặt yếu riêng" của mục 6 hiện ra ở đây chứ không chỉ
 * nằm trong một con số chống.
 */
export function rollDamage(rng: Rng, item: Item, options: WearOptions): ItemDamage | null {
  const material = materialOf(item.material);
  const candidates = damageKinds().filter((kind) =>
    fits(kind, item, { storage: options.storage ?? false, bow: options.bow ?? false }),
  );
  if (candidates.length === 0) return null;

  const weights = candidates.map((kind) => Math.max(0, material.damageBias[kind.id] ?? 1));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (total <= 0) return null;

  let cursor = rng.next() * total;
  let picked = candidates[0];
  for (const [index, kind] of candidates.entries()) {
    cursor -= weights[index] ?? 0;
    if (cursor < 0) {
      picked = kind;
      break;
    }
  }
  if (picked === undefined) return null;

  return {
    kind: picked.id,
    regionId: picked.regional ? (options.regionId ?? '') : '',
    turn: options.turn,
    note: '',
  };
}

export interface WearResult {
  item: Item;
  added: ItemDamage | null;
  lines: string[];
}

/**
 * Hao mòn sau một trận, và có thể sinh một hư hỏng cụ thể.
 *
 * Xác suất sinh hư hỏng đọc theo NGƯỠNG TÌNH TRẠNG (`damageAtCondition`), nên
 * một món càng bỏ bê thì càng dễ hỏng thêm — đó là vòng xoáy mà mục 10 muốn:
 * bỏ bê thì vào trận sau với đồ hỏng, và đồ hỏng thì hỏng nhanh hơn nữa.
 */
export function wearItem(rng: Rng, item: Item, options: WearOptions): WearResult {
  const config = maintenanceConfig();
  const quality = qualityByLevel(item.quality);
  const decay = quality.conditionDecay;
  const base = options.storage === true ? config.wetStorageExtra : config.conditionPerBattle;
  const next = clampCondition(item.condition - base * decay * (options.factor ?? 1));

  const row = config.damageAtCondition
    .filter((entry) => next < entry.below)
    .sort((left, right) => right.chance - left.chance)[0];
  const chance = row?.chance ?? 0;

  const lines: string[] = [];
  let added: ItemDamage | null = null;
  if (chance > 0 && rng.int(1, 100) <= chance) {
    added = rollDamage(rng, { ...item, condition: next }, options);
    if (added !== null) {
      lines.push(`${item.name}: ${damageKindOf(added.kind)?.name ?? added.kind}`);
    }
  }

  return {
    item: { ...item, condition: next, damage: added === null ? item.damage : [...item.damage, added] },
    added,
    lines,
  };
}

// ---------------------------------------------------------------------------
// Thợ rèn theo quân (mục 10, nối Phần 11)
// ---------------------------------------------------------------------------

export interface CampaignWear {
  /** Điểm tình trạng MỘT TUẦN chiến dịch lấy đi của mỗi bộ trang bị. */
  conditionLost: number;
  /** Tỷ lệ trang bị sinh hư hỏng cụ thể trong tuần, phần trăm. */
  breakdownPct: number;
  smithsNeeded: number;
  smithsHave: number;
  line: string;
}

/**
 * Một tuần chiến dịch bào mòn trang bị của cả đạo quân bao nhiêu.
 *
 * Mỗi thợ chăm được `perSmith` người. Thiếu thợ thì phần chênh lệch nhân với
 * `noSmithMultiplier`, và ĐẠO QUÂN KHÔNG CÓ THỢ NÀO thì ăn trọn hệ số ấy —
 * đúng câu "rã trang bị sau vài tuần chiến dịch" của mục 10.
 */
export function campaignWear(troops: number, smiths: number): CampaignWear {
  const config = maintenanceConfig();
  const needed = Math.ceil(Math.max(0, troops) / config.perSmith);
  const covered = needed === 0 ? 1 : Math.min(1, Math.max(0, smiths) / needed);
  const multiplier = 1 + (config.noSmithMultiplier - 1) * (1 - covered);
  const lost = Math.round(config.conditionPerCampaignWeek * multiplier * 10) / 10;

  const line =
    smiths <= 0 && troops > 0
      ? `Không có thợ rèn nào đi theo — trang bị mất ${String(lost)} điểm tình trạng mỗi tuần.`
      : covered >= 1
        ? `${String(smiths)} thợ rèn đủ cho ${String(troops)} quân.`
        : `Thiếu thợ rèn: ${String(smiths)}/${String(needed)} — trang bị mất ${String(lost)} điểm mỗi tuần.`;

  return {
    conditionLost: lost,
    breakdownPct: Math.round((1 - covered) * 30),
    smithsNeeded: needed,
    smithsHave: Math.max(0, smiths),
    line,
  };
}

// ---------------------------------------------------------------------------
// Bảo dưỡng và sửa chữa
// ---------------------------------------------------------------------------

export interface MaintenancePlan {
  hours: number;
  supplies: number;
  cost: number;
  /** Hư hỏng cụ thể phải sửa riêng, kèm chỗ sửa được. */
  repairs: { kind: string; name: string; hours: number; supplies: number; skill: string; skillMin: number; building: string; note: string }[];
  line: string;
}

/**
 * Bảo dưỡng tốn bao nhiêu THỜI GIAN và VẬT TƯ (mục 10).
 *
 * Hai phần tách bạch, vì chúng làm ở hai chỗ khác nhau: lau dầu và mài lưỡi làm
 * được ngay tại lều, còn gò một tấm móp thì phải có lò rèn. Gộp chúng thành một
 * con số "chi phí sửa" là xóa mất lý do một đạo quân cần mang thợ theo.
 */
export function maintenancePlan(item: Item): MaintenancePlan {
  const config = maintenanceConfig();
  const missing = Math.max(0, 100 - item.condition);
  const hours = Math.round((missing / config.restorePerHour) * 10) / 10;
  const supplies = Math.round(hours * config.suppliesPerHour * 10) / 10;

  const repairs = item.damage.map((entry) => {
    const kind = damageKindOf(entry.kind);
    return {
      kind: entry.kind,
      name: kind?.name ?? entry.kind,
      hours: kind?.repair.hours ?? 0,
      supplies: kind?.repair.supplies ?? 0,
      skill: kind?.repair.skill ?? '',
      skillMin: kind?.repair.skillMin ?? 0,
      building: kind?.repair.building ?? '',
      note: kind?.repair.note ?? '',
    };
  });

  const totalHours = Math.round((hours + repairs.reduce((sum, repair) => sum + repair.hours, 0)) * 10) / 10;
  const totalSupplies = Math.round((supplies + repairs.reduce((sum, repair) => sum + repair.supplies, 0)) * 10) / 10;

  return {
    hours,
    supplies,
    cost: Math.round(itemValue(item.templateId) * 0.02 * totalSupplies),
    repairs,
    line:
      repairs.length === 0
        ? `${String(totalHours)} giờ lau chùi, ${String(totalSupplies)} phần vật tư.`
        : `${String(totalHours)} giờ và ${String(totalSupplies)} phần vật tư — trong đó ${String(
            repairs.length,
          )} hư hỏng phải sửa riêng.`,
  };
}

/** Bỏ ra một số giờ bảo dưỡng: hồi tình trạng, KHÔNG tự sửa hư hỏng cụ thể. */
export function applyMaintenance(item: Item, hours: number): Item {
  const config = maintenanceConfig();
  return { ...item, condition: clampCondition(item.condition + Math.max(0, hours) * config.restorePerHour) };
}

/** Sửa một hư hỏng cụ thể. Trả về món đã gỡ hư hỏng ấy khỏi danh sách. */
export function repairDamage(item: Item, kindId: string, regionId = ''): Item {
  let removed = false;
  const damage = item.damage.filter((entry) => {
    if (removed) return true;
    if (entry.kind !== kindId) return true;
    if (regionId !== '' && entry.regionId !== regionId) return true;
    removed = true;
    return false;
  });
  return removed ? { ...item, damage } : item;
}

/**
 * GỈ SÉT LAN DẦN nếu không lau dầu (mục 10), và XƯƠNG TROLL TỰ LIỀN LẠI nếu
 * được giữ ẩm (mục 6).
 *
 * Hai luật ngược chiều nhau nằm cùng một hàm là cố ý: cả hai đều là "một tuần
 * trôi qua với món đồ này", và tách chúng ra hai chỗ là ngày nào đó một tuần sẽ
 * được đếm hai lần.
 */
export function weeklyTick(item: Item, options: { oiled: boolean; damp: boolean }): Item {
  const material = materialOf(item.material);
  let condition = item.condition;

  for (const entry of item.damage) {
    const kind = damageKindOf(entry.kind);
    if (kind === null || !kind.spreads) continue;
    if (options.oiled) continue;
    condition -= kind.spreadPerWeek * material.rust;
  }

  // Xương Troll: bảo dưỡng lạ — không lau dầu mà bọc vải ướt.
  if (material.selfRepair > 0 && options.damp) condition += material.selfRepair;

  return { ...item, condition: clampCondition(condition) };
}
