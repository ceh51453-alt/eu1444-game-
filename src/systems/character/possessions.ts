/**
 * KHAI BÁO SỞ HỮU lúc tạo nhân vật (Phần 6 mục 9 bước 8) — nạp từ
 * `/data/starting-possessions.json` theo R5.
 *
 * BA TẦNG KHÔNG ĐƯỢC LẪN (README mục 6 và Phụ lục A). Ba khóa riêng trong state
 * chính là lớp phòng thủ đặt ngay ở khâu khai báo:
 *
 *   THÀNH TRÌ  một ĐIỂM, đi bộ hết trong một ngày, có tường và ô đất  → `holdings`
 *   LÃNH THỔ   một VÙNG, cưỡi ngựa nhiều ngày, gồm nhiều tỉnh          → `realmRole`
 *   THÁI ẤP    một TỜ GIẤY có ấn triện: tước vị + quyền + nghĩa vụ     → `fiefs`
 *
 * Phần 12 sở hữu thành trì thật, Phần 13 sở hữu tước vị và thái ấp thật. Ở đây
 * chỉ đủ từ vựng để hỏi "ngài đang giữ cái gì", rồi ghi câu trả lời xuống dưới
 * dạng hai phần đó đọc thẳng được.
 */

import { z } from 'zod';
import possessionsFile from '@data/starting-possessions.json';
import { makeId, type FiefId, type HoldingId } from '@/core/ids';
import { allRegions, regionOf } from '@/lore/regions';

const entrySchema = z.object({ id: z.string(), name: z.string(), note: z.string().default('') });

const fileSchema = z.object({
  settlementTiers: z.array(entrySchema.extend({ level: z.int(), population: z.string().default('') })),
  holdingRoles: z.array(entrySchema),
  fiefTitles: z.array(entrySchema.extend({ rank: z.int() })),
  fiefObligations: z.array(entrySchema),
  realmRoles: z.array(entrySchema),
});

export type SettlementTier = z.infer<typeof fileSchema>['settlementTiers'][number];
export type HoldingRole = z.infer<typeof entrySchema>;
export type FiefTitle = z.infer<typeof fileSchema>['fiefTitles'][number];

export class PossessionDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PossessionDataError';
  }
}

function load(): z.infer<typeof fileSchema> {
  const parsed = fileSchema.safeParse(possessionsFile);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new PossessionDataError(
      `data/starting-possessions.json hỏng ở "${issue?.path.join('.') ?? '?'}": ${issue?.message ?? 'không rõ'}`,
    );
  }
  return parsed.data;
}

const DATA = load();

export function settlementTiers(): SettlementTier[] {
  return [...DATA.settlementTiers];
}

export function settlementTierOf(id: string): SettlementTier | null {
  return DATA.settlementTiers.find((tier) => tier.id === id) ?? null;
}

export function settlementTierName(id: string): string {
  return settlementTierOf(id)?.name ?? id;
}

export function holdingRoles(): HoldingRole[] {
  return [...DATA.holdingRoles];
}

export function holdingRoleName(id: string): string {
  return DATA.holdingRoles.find((role) => role.id === id)?.name ?? id;
}

export function fiefTitles(): FiefTitle[] {
  return [...DATA.fiefTitles];
}

export function fiefTitleOf(id: string): FiefTitle | null {
  return DATA.fiefTitles.find((title) => title.id === id) ?? null;
}

export function fiefTitleName(id: string): string {
  return fiefTitleOf(id)?.name ?? id;
}

/**
 * Bậc tước cao nhất đang giữ. Phần 13 sẽ thay bằng thang thật của nó.
 *
 * KHÔNG có hàm nào ở đây trả về "trần tước vị": mục 3 nói thẳng xuất thân không
 * khóa trần, và một hàm như thế sẽ bị ai đó gọi để chặn.
 */
export function highestRank(titleIds: readonly string[]): number {
  return titleIds.reduce((best, id) => Math.max(best, fiefTitleOf(id)?.rank ?? 0), 0);
}

export function fiefObligations(): HoldingRole[] {
  return [...DATA.fiefObligations];
}

export function obligationName(id: string): string {
  return DATA.fiefObligations.find((entry) => entry.id === id)?.name ?? id;
}

export function realmRoles(): HoldingRole[] {
  return [...DATA.realmRoles];
}

export function realmRoleName(id: string): string {
  return DATA.realmRoles.find((role) => role.id === id)?.name ?? id;
}

// ---------------------------------------------------------------------------
// Sinh id
// ---------------------------------------------------------------------------

/**
 * Tên tiếng Việt → hậu tố id hợp lệ.
 *
 * `core/ids.ts` chỉ nhận `[a-z0-9][a-z0-9-]*`, nên "Thôn Bạch Dương" phải thành
 * `thon-bach-duong` chứ không phải một chuỗi có dấu mà `parseId` từ chối. Bỏ
 * dấu ở đây chứ không ở chỗ gọi, để mọi chỗ sinh id đi qua cùng một luật.
 */
export function slugify(text: string): string {
  const stripped = text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return stripped === '' ? 'khong-ten' : stripped;
}

/** Id thành trì từ tên người chơi gõ. Trùng thì thêm hậu tố số. */
export function holdingIdFor(name: string, taken: ReadonlySet<string> = new Set()): HoldingId {
  const base = slugify(name);
  for (let index = 0; index < 100; index++) {
    const candidate = makeId('holding', index === 0 ? base : `${base}-${index + 1}`);
    if (!taken.has(candidate)) return candidate;
  }
  return makeId('holding', `${base}-${Date.now().toString(36)}`);
}

export function fiefIdFor(name: string, taken: ReadonlySet<string> = new Set()): FiefId {
  const base = slugify(name);
  for (let index = 0; index < 100; index++) {
    const candidate = makeId('fief', index === 0 ? base : `${base}-${index + 1}`);
    if (!taken.has(candidate)) return candidate;
  }
  return makeId('fief', `${base}-${Date.now().toString(36)}`);
}

export interface KnownSettlement {
  id: string;
  name: string;
  parentId: string | null;
}

/**
 * Thành trì CÓ THẬT trong `regions.json` — 38 điểm đã dựng sẵn ở Phần 4.
 *
 * Bước 8 cho chọn một trong số này trước khi cho gõ tên mới: một Đại quý tộc
 * khai mình giữ Thành Ehrenfeld thì Phần 12 mở đúng thành trì đó ra, còn khai
 * một cái tên tự nghĩ thì Phần 12 phải dựng mới từ số không. Cả hai đều hợp lệ,
 * nhưng vế đầu nối được vào thế giới đã có.
 */
export function knownSettlements(): KnownSettlement[] {
  return allRegions()
    .filter((region) => region.kind === 'settlement')
    .map((region) => ({ id: region.id, name: region.name, parentId: region.parentId }));
}

/** Lọc theo vùng: chỉ những thành trì nằm TRONG `withinRegionId`, ở mọi độ sâu. */
export function settlementsWithin(withinRegionId: string): KnownSettlement[] {
  if (withinRegionId === '') return knownSettlements();
  return knownSettlements().filter((entry) => {
    let current: string | null = entry.parentId;
    for (let guard = 0; guard < 16 && current !== null; guard++) {
      if (current === withinRegionId) return true;
      current = regionOf(current)?.parentId ?? null;
    }
    return false;
  });
}
