/**
 * TRANG BỊ KHỞI ĐẦU (Phần 6 mục 9 bước 8) — nạp từ `/data/gear.json` theo R5.
 *
 * ĐÂY LÀ LỚP KHAI BÁO, KHÔNG PHẢI HỆ VẬT PHẨM. Phần 16 sở hữu vật phẩm thật:
 * bản đồ che phủ giáp, khe hở, độ bền, vừa người, ba mốc thời đại. Ranh giới
 * được vạch ở đúng hai chỗ:
 *
 *   `skillBonus`  CÓ, vì mục 1 đã có sẵn vế `+ trang bị` trong công thức d100,
 *                 và vế đó phải hiện thành một dòng đọc được chứ không nằm ẩn.
 *   phòng thủ     KHÔNG. Giáp chỉ khai `coverage` — nó che những vùng cơ thể
 *                 nào. README mục 8.5 nói rút giáp thành một con số tổng là
 *                 làm hỏng luôn cơ chế đâm khe hở của Phần 9, nên chỗ đó để
 *                 trống cho Phần 16 điền chứ không để Phần 6 đoán.
 */

import { z } from 'zod';
import gearFile from '@data/gear.json';
import { effectSchema, type Effect } from './effects';

export const gearItemSchema = z.object({
  id: z.string().startsWith('item_'),
  name: z.string().min(1),
  /** `vu-khi` · `khien` · `giap` · `quan-ao` · `dung-cu` · `vat-cuoi` · `quy-vat` · `giay-to`. */
  kind: z.string().min(1),
  slot: z.string().min(1),
  material: z.string().default(''),
  weightKg: z.number().min(0).default(0),
  price: z.number().min(0).default(0),
  /** Vế `+ trang bị` của mục 1. Vắng nghĩa là món này không đụng vào phép kiểm nào. */
  skillBonus: effectSchema.optional(),
  /** Vùng cơ thể món này che. Phần 7 và Phần 16 đọc; Phần 6 không tính gì từ nó. */
  coverage: z.array(z.string()).default([]),
  note: z.string().default(''),
});

export const materialSchema = z.object({ id: z.string(), name: z.string(), note: z.string().default('') });
export const qualitySchema = z.object({
  id: z.string(),
  name: z.string(),
  /** Cộng vào `skillBonus` theo thang d100. Kiệt tác hơn thợ vụng đúng 30 điểm. */
  bonus: z.number(),
  priceFactor: z.number().min(0),
});
export const slotSchema = z.object({ id: z.string(), name: z.string() });

const fileSchema = z.object({
  slots: z.array(slotSchema),
  materials: z.array(materialSchema),
  qualities: z.array(qualitySchema),
  items: z.array(gearItemSchema),
});

export type GearItem = z.infer<typeof gearItemSchema>;
export type GearMaterial = z.infer<typeof materialSchema>;
export type GearQuality = z.infer<typeof qualitySchema>;
export type GearSlot = z.infer<typeof slotSchema>;

export class GearDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GearDataError';
  }
}

function load(): z.infer<typeof fileSchema> & { byId: Map<string, GearItem> } {
  const parsed = fileSchema.safeParse(gearFile);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new GearDataError(`data/gear.json hỏng ở "${issue?.path.join('.') ?? '?'}": ${issue?.message ?? 'không rõ'}`);
  }

  const slots = new Set(parsed.data.slots.map((slot) => slot.id));
  const materials = new Set(parsed.data.materials.map((material) => material.id));
  const byId = new Map<string, GearItem>();

  for (const item of parsed.data.items) {
    if (byId.has(item.id)) throw new GearDataError(`vật phẩm trùng id: ${item.id}`);
    if (!slots.has(item.slot)) throw new GearDataError(`vật phẩm "${item.id}" dùng vị trí mặc "${item.slot}" không có thật`);
    if (item.material !== '' && !materials.has(item.material)) {
      throw new GearDataError(`vật phẩm "${item.id}" dùng chất liệu "${item.material}" không có thật`);
    }
    byId.set(item.id, item);
  }

  return { ...parsed.data, byId };
}

const DATA = load();

export const DEFAULT_QUALITY = 'thuong';

export function allGear(): GearItem[] {
  return [...DATA.byId.values()];
}

export function gearOf(id: string): GearItem | null {
  return DATA.byId.get(id) ?? null;
}

export function gearName(id: string): string {
  return DATA.byId.get(id)?.name ?? id;
}

export function gearKinds(): string[] {
  return [...new Set(allGear().map((item) => item.kind))];
}

export function gearOfKind(kind: string): GearItem[] {
  return allGear().filter((item) => item.kind === kind);
}

export function gearSlots(): GearSlot[] {
  return [...DATA.slots];
}

export function gearMaterials(): GearMaterial[] {
  return [...DATA.materials];
}

export function gearQualities(): GearQuality[] {
  return [...DATA.qualities];
}

export function slotName(id: string): string {
  return DATA.slots.find((slot) => slot.id === id)?.name ?? id;
}

export function materialName(id: string): string {
  return DATA.materials.find((material) => material.id === id)?.name ?? id;
}

export function qualityOf(id: string): GearQuality | null {
  return DATA.qualities.find((quality) => quality.id === id) ?? null;
}

export function qualityName(id: string): string {
  return qualityOf(id)?.name ?? id;
}

/** Một món ĐANG MANG: id catalog + chất liệu và chất lượng thật của món đó. */
export interface CarriedGear {
  item: string;
  material: string;
  quality: string;
  slot: string;
  /** Đang mặc/cầm, hay chỉ nằm trong hành lý. Chỉ món đang mang mới cộng modifier. */
  equipped: boolean;
  note: string;
}

/** Dựng một món đang mang từ catalog, lấp mọi ô còn trống bằng mặc định của món. */
export function carry(itemId: string, over: Partial<CarriedGear> = {}): CarriedGear | null {
  const item = gearOf(itemId);
  if (item === null) return null;
  return {
    item: itemId,
    material: over.material ?? item.material,
    quality: over.quality ?? DEFAULT_QUALITY,
    slot: over.slot ?? item.slot,
    equipped: over.equipped ?? item.slot !== 'ba-lo',
    note: over.note ?? '',
  };
}

/**
 * Hiệu ứng thật của một món đang mang: `skillBonus` của món cộng với mức chênh
 * do tay nghề thợ. Một thanh kiếm kiệt tác hơn một thanh thợ vụng đúng 30 điểm
 * d100, và cả hai đều là kiếm.
 */
export function gearEffect(carried: CarriedGear): Effect | null {
  const item = gearOf(carried.item);
  if (item?.skillBonus === undefined) return null;
  const bonus = qualityOf(carried.quality)?.bonus ?? 0;
  return { ...item.skillBonus, value: item.skillBonus.value + bonus };
}

export function gearWeight(carried: readonly CarriedGear[]): number {
  return Math.round(carried.reduce((total, entry) => total + (gearOf(entry.item)?.weightKg ?? 0), 0) * 10) / 10;
}

export function gearPrice(carried: CarriedGear): number {
  const item = gearOf(carried.item);
  if (item === null) return 0;
  return Math.round(item.price * (qualityOf(carried.quality)?.priceFactor ?? 1));
}

/** Vùng cơ thể đang được che, gộp mọi món đang mặc. Phần 7 và 16 dùng tiếp. */
export function coveredRegions(carried: readonly CarriedGear[]): string[] {
  const covered = new Set<string>();
  for (const entry of carried) {
    if (!entry.equipped) continue;
    for (const region of gearOf(entry.item)?.coverage ?? []) covered.add(region);
  }
  return [...covered];
}
