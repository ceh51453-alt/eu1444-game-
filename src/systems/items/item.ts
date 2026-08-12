/**
 * DỰNG VÀ ĐỌC MỘT VẬT PHẨM CỤ THỂ (Phần 16 mục 2, 7, 12).
 *
 * TRANG BỊ LÀ TÀI SẢN LỚN (mục 1c): một bộ giáp tấm đầy đủ đáng giá bằng một
 * trang viên, và đó là lý do tù binh quý tộc sinh lời và là lý do người ta cướp
 * xác. Nên `valueOf` không phải một con số trang trí — nó là thứ Phần 10 đọc
 * khi tính tiền chuộc và Phần 13 đọc khi chia gia sản.
 *
 * Thang giá đi thẳng từ mục 12, nơi lấy THU NHẬP NĂM CỦA MỘT NÔNG DÂN TỰ DO
 * (8–12) làm mốc. Giữ đúng mốc ấy là cách duy nhất để người chơi CẢM NHẬN được
 * rằng trang bị đầy đủ cho một hiệp sĩ tốn bằng cả đời của mấy chục nông dân.
 */

import {
  enchantmentOf,
  itemKind,
  itemMaterial,
  itemName,
  itemValue,
  itemWeight,
  materialOf,
  qualityByLevel,
} from './data';
import { eraRangeOf } from './era';
import type { Item, ItemKind } from './types';
import { ITEM_KINDS } from './types';

/** Thu nhập năm của một nông dân tự do (mục 12) — mốc để mọi giá so vào. */
export const PEASANT_YEARLY_INCOME = 10;

function asKind(value: string): ItemKind {
  return (ITEM_KINDS as readonly string[]).includes(value) ? (value as ItemKind) : 'dung-cu';
}

/**
 * Một món mới toanh từ mẫu.
 *
 * `condition` khởi điểm 100 và `damage` rỗng: một món vừa ra lò chưa có lịch sử
 * hư hỏng nào, và cả mục 10 chỉ đọc được nếu người chơi nhìn thấy danh sách ấy
 * dài ra theo từng trận.
 */
export function newItem(templateId: string, over: Partial<Item> = {}): Item {
  const era = eraRangeOf(templateId);
  return {
    id: over.id ?? templateId,
    templateId,
    name: over.name ?? itemName(templateId),
    kind: over.kind ?? asKind(itemKind(templateId)),
    material: over.material ?? itemMaterial(templateId),
    quality: over.quality ?? 2,
    condition: over.condition ?? 100,
    damage: over.damage ?? [],
    fitTo: over.fitTo ?? '',
    ...(over.fitShape === undefined ? {} : { fitShape: over.fitShape }),
    weightKg: over.weightKg ?? itemWeight(templateId),
    value: over.value ?? itemValue(templateId),
    eraFrom: over.eraFrom ?? era.from,
    eraTo: over.eraTo ?? era.to,
    enchantment: over.enchantment ?? '',
    heraldry: over.heraldry ?? null,
    history: over.history ?? [],
    note: over.note ?? '',
  };
}

// ---------------------------------------------------------------------------
// Đọc
// ---------------------------------------------------------------------------

export function weightOfItem(item: Item): number {
  const enchantment = item.enchantment === '' ? null : enchantmentOf(item.enchantment);
  const factor = materialOf(item.material).weightFactor * (enchantment?.weightFactor ?? 1);
  return Math.round(item.weightKg * factor * 100) / 100;
}

/**
 * Giá thật của một món: giá mẫu × vật liệu × tay nghề × tình trạng, cộng phần
 * giá trị xã hội của một tuyệt tác và của một món có lịch sử.
 *
 * `history` VÀO GIÁ (mục 2): một thanh kiếm từng giết một vị vua đắt hơn một
 * thanh giống hệt nó, và nếu con số không phản ánh điều đó thì `history` đúng
 * là trang trí — thứ mà mục 2 nói thẳng là nó không phải.
 */
export function valueOf(item: Item): number {
  const material = materialOf(item.material);
  const quality = qualityByLevel(item.quality);
  const enchantment = item.enchantment === '' ? null : enchantmentOf(item.enchantment);

  const wear = 0.35 + 0.65 * (Math.max(0, Math.min(100, item.condition)) / 100);
  const broken = item.damage.length > 0 ? Math.max(0.4, 1 - item.damage.length * 0.12) : 1;
  const story = 1 + Math.min(0.5, item.history.length * 0.05);
  const magic = enchantment === null ? 1 : 4;

  return Math.max(0, Math.round(item.value * material.priceFactor * quality.priceFactor * wear * broken * story * magic));
}

/** Giá quy ra SỐ NĂM thu nhập của một nông dân tự do — con số của mục 12. */
export function valueInPeasantYears(item: Item): number {
  return Math.round((valueOf(item) / PEASANT_YEARLY_INCOME) * 10) / 10;
}

/** BẠC hoặc thánh vật: vết thương KHÔNG TỰ LÀNH cho Huyết Tộc (Phần 14b mục D). */
export function isSilverItem(item: Item): boolean {
  const enchantment = item.enchantment === '' ? null : enchantmentOf(item.enchantment);
  return materialOf(item.material).silver || (enchantment?.silverLike ?? false);
}

export function isMasterpiece(item: Item): boolean {
  return qualityByLevel(item.quality).named;
}

/** Uy tín xã hội của món — Phần 13 đọc khi ai đó đem tặng nó. */
export function prestigeOf(item: Item): number {
  return qualityByLevel(item.quality).prestige + Math.min(10, item.history.length * 2);
}

/** Nối một dòng vào lịch sử món. Thuần: trả về món mới (§7.3). */
export function remember(item: Item, line: string): Item {
  if (line.trim() === '') return item;
  return { ...item, history: [...item.history, line].slice(-40) };
}

export function describeItem(item: Item): string {
  const quality = qualityByLevel(item.quality);
  const material = materialOf(item.material);
  const parts = [item.name, `${material.name}, ${quality.name}`];
  if (item.condition < 90) parts.push(`tình trạng ${String(Math.round(item.condition))}`);
  if (item.damage.length > 0) parts.push(`${String(item.damage.length)} hư hỏng`);
  if (item.enchantment !== '') parts.push(enchantmentOf(item.enchantment)?.name ?? item.enchantment);
  return parts.join(' · ');
}
