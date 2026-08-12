/**
 * KHO VŨ KHÍ CỦA THÀNH TRÌ (Phần 16 mục 18, dòng cuối).
 *
 * Trang bị cho quân đồn trú HÀNG LOẠT là một bài toán khác hẳn mặc giáp cho một
 * người, và mục 11 nói ra sự khác ấy: chọn giữa NHIỀU ĐỒ TẦM THƯỜNG hay ÍT ĐỒ
 * TỐT. Nên báo cáo ở đây không hỏi "ai mặc gì" — nó hỏi kho có bao nhiêu bộ, đủ
 * cho bao nhiêu người, và bao nhiêu món đang chờ thợ rèn.
 *
 * MỘT BỘ TỐI THIỂU là ba thứ: một món che thân, một món che đầu, một vũ khí.
 * Không có mũ thì một mũi tên lạc kết thúc một người lính, và một đạo quân
 * không mũ là một đạo quân sẽ tan ở loạt tên thứ hai — nên đếm "bộ" theo món
 * hiếm nhất trong ba, không theo tổng số món.
 */

import { armorPieceOf, hasWeaponProfile, itemName, qualityByLevel, valueOf, type Item } from '@/systems/items';

export interface ArmouryRow {
  templateId: string;
  count: number;
  avgQuality: number;
  avgCondition: number;
  value: number;
}

export interface ArmouryReport {
  rows: ArmouryRow[];
  /** Số BỘ đủ dùng — theo món hiếm nhất trong ba loại, không theo tổng. */
  sets: number;
  soldiers: number;
  value: number;
  /** Món tình trạng dưới ngưỡng hoặc đang có hư hỏng cụ thể. */
  needsWork: Item[];
  /** Một món mẫu để quy giá ra số năm nông dân — luôn có, kể cả khi kho rỗng. */
  sample: Item;
}

/** Dưới mức này thì món ấy không nên phát cho ai cả. */
export const FIT_FOR_ISSUE = 60;

function covers(templateId: string, group: 'than' | 'dau'): boolean {
  const piece = armorPieceOf(templateId);
  if (piece === null) return false;
  const regions = piece.covers.map((cover) => cover.region);
  return group === 'dau'
    ? regions.some((region) => region === 'skull' || region === 'face')
    : regions.some((region) => region === 'chest' || region === 'abdomen');
}

export function armouryReport(stock: readonly Item[]): ArmouryReport {
  const byTemplate = new Map<string, Item[]>();
  for (const item of stock) {
    const bucket = byTemplate.get(item.templateId) ?? [];
    bucket.push(item);
    byTemplate.set(item.templateId, bucket);
  }

  const rows: ArmouryRow[] = [...byTemplate.entries()]
    .map(([templateId, items]) => ({
      templateId,
      count: items.length,
      avgQuality: Math.round(items.reduce((sum, item) => sum + item.quality, 0) / items.length),
      avgCondition: Math.round(items.reduce((sum, item) => sum + item.condition, 0) / items.length),
      value: items.reduce((sum, item) => sum + valueOf(item), 0),
    }))
    .sort((left, right) => itemName(left.templateId).localeCompare(itemName(right.templateId), 'vi'));

  const usable = stock.filter((item) => item.condition >= FIT_FOR_ISSUE);
  const bodies = usable.filter((item) => covers(item.templateId, 'than')).length;
  const heads = usable.filter((item) => covers(item.templateId, 'dau')).length;
  const weapons = usable.filter((item) => hasWeaponProfile(item.templateId)).length;
  const sets = Math.min(bodies, heads, weapons);

  return {
    rows,
    sets,
    // Một người lính vẫn ra trận được với vũ khí và một món che thân; cái thiếu
    // là mũ. Nên "trang bị được bao nhiêu người" rộng hơn "bao nhiêu bộ đủ".
    soldiers: Math.min(bodies, weapons),
    value: stock.reduce((sum, item) => sum + valueOf(item), 0),
    needsWork: stock.filter((item) => item.condition < FIT_FOR_ISSUE || item.damage.length > 0),
    sample: stock[0] ?? emptySample(),
  };
}

function emptySample(): Item {
  return {
    id: '',
    templateId: '',
    name: '',
    kind: 'dung-cu',
    material: '',
    quality: 2,
    condition: 100,
    damage: [],
    fitTo: '',
    weightKg: 0,
    value: 0,
    eraFrom: 0,
    eraTo: 9999,
    enchantment: '',
    heraldry: null,
    history: [],
    note: '',
  };
}

/** Bậc chất lượng trung bình đọc thành chữ — cho dòng tóm tắt của UI. */
export function averageQualityName(rows: readonly ArmouryRow[]): string {
  if (rows.length === 0) return '—';
  const total = rows.reduce((sum, row) => sum + row.avgQuality * row.count, 0);
  const count = rows.reduce((sum, row) => sum + row.count, 0);
  return qualityByLevel(Math.round(total / Math.max(1, count))).name;
}
