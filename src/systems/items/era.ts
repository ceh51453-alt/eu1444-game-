/**
 * TRANG BỊ TIẾN HÓA THEO THỜI GIAN (Phần 16 mục 1b, việc 9).
 *
 * "Đầu thế kỷ chỉ có giáp lưới và áo giáp mảnh; cuối thế kỷ mới có giáp tấm
 * toàn thân. NGƯỜI CHƠI SỐNG ĐỦ LÂU SẼ THẤY CHIẾN TRƯỜNG THAY ĐỔI TRƯỚC MẮT."
 *
 * Hai cổng, và cả hai đều phải qua:
 *   1. `eraFrom`/`eraTo` của chính món — kiểu ấy đã có ai nghĩ ra chưa
 *   2. BẢN MẪU đã lan tới đây chưa (`spreadFrom`) — thợ phải HỌC ĐƯỢC kiểu mới
 *      thì mới làm được, và một kiểu vừa phát minh ở Frank thì hai mươi năm sau
 *      mới tới Rus
 *
 * Cổng thứ hai là chỗ mục 11 gọi là "cách công nghệ lan trong thế giới", và là
 * lý do bài test C của mục 19 in ra ba danh mục KHÁC NHAU RÕ RỆT chứ không phải
 * ba bản sao của cùng một danh sách.
 */

import {
  allTemplates,
  armorPieceOf,
  factionCatalog,
  knownItemIds,
  itemName,
  patternOf,
  siegeWeaponOf,
  templateOf,
  weaponProfile,
  hasWeaponProfile,
} from './data';

export interface EraRange {
  from: number;
  to: number;
}

const OPEN_FROM = 0;
const OPEN_TO = 9999;

/**
 * Khoảng thời đại của một món, gộp từ mọi nơi khai nó.
 *
 * Lấy khoảng HẸP NHẤT: một cái mũ trụ khai `eraTo: 1380` ở `armor.json` và
 * không khai gì ở mẫu thì nó vẫn biến mất năm 1380. Lấy khoảng rộng nhất sẽ
 * biến mọi giới hạn thành lời khuyên.
 */
export function eraRangeOf(itemId: string): EraRange {
  let from = OPEN_FROM;
  let to = OPEN_TO;

  const narrow = (
    source: { eraFrom?: number | undefined; eraTo?: number | undefined } | null | undefined,
  ): void => {
    if (source === null || source === undefined) return;
    if (source.eraFrom !== undefined) from = Math.max(from, source.eraFrom);
    if (source.eraTo !== undefined) to = Math.min(to, source.eraTo);
  };

  narrow(templateOf(itemId));
  narrow(armorPieceOf(itemId));
  narrow(siegeWeaponOf(itemId));
  if (hasWeaponProfile(itemId)) narrow(weaponProfile(itemId));

  return { from, to };
}

/** Kiểu này đã có ai nghĩ ra chưa, và đã lỗi thời chưa. */
export function existsInYear(itemId: string, year: number): boolean {
  const range = eraRangeOf(itemId);
  return year >= range.from && year <= range.to;
}

// ---------------------------------------------------------------------------
// Bản mẫu đã lan tới đâu (mục 11)
// ---------------------------------------------------------------------------

export interface SpreadOptions {
  /** Thế lực đang hỏi. Nơi phát minh biết trước phần còn lại của châu lục. */
  nationId?: string;
  /** Thợ đã học riêng bản mẫu này rồi — Phần 12 giữ danh sách. */
  knownPatterns?: readonly string[];
}

/**
 * Thợ ở đây, năm này, có làm được kiểu này không.
 *
 * Ba đường mở ra, đúng ba đường của mục 11: nơi phát minh biết từ năm phát
 * minh; nơi khác phải chờ nó lan tới; và bất cứ ai đã bỏ công HỌC (mua bản vẽ,
 * học từ thợ khác, tháo một món ra nghiên cứu) thì biết ngay không cần chờ.
 */
export function patternAvailable(patternId: string, year: number, options: SpreadOptions = {}): boolean {
  if (patternId === '') return true;
  if ((options.knownPatterns ?? []).includes(patternId)) return true;

  const pattern = patternOf(patternId);
  if (pattern === null) return false;
  if (pattern.origin !== '' && options.nationId === pattern.origin) return year >= pattern.inventedYear;
  return year >= pattern.spreadFrom;
}

/** Món này chế tạo được ở đây, năm này không — cả hai cổng cùng lúc. */
export function craftableInYear(itemId: string, year: number, options: SpreadOptions = {}): boolean {
  if (!existsInYear(itemId, year)) return false;
  return patternAvailable(templateOf(itemId)?.craft?.pattern ?? '', year, options);
}

// ---------------------------------------------------------------------------
// Danh mục theo năm — thứ bài test C in ra
// ---------------------------------------------------------------------------

export interface CatalogOptions extends SpreadOptions {
  /** Chỉ giữ món của thế lực này, cộng món không thuộc phe nào. */
  restrictToFaction?: boolean;
}

function factionOf(itemId: string): string {
  const template = templateOf(itemId);
  if (template !== undefined && template !== null && template.faction !== '') return template.faction;
  if (hasWeaponProfile(itemId)) {
    const faction = weaponProfile(itemId).faction;
    if (faction !== '') return faction;
  }
  return siegeWeaponOf(itemId)?.faction ?? '';
}

/**
 * Mọi món dùng được ở một năm.
 *
 * `restrictToFaction` bật lên thì lọc thêm theo mục 15: món độc quyền của phe
 * khác không có mặt trong danh mục của ngài, dù kiểu ấy đã tồn tại trên đời.
 */
export function catalogForYear(year: number, options: CatalogOptions = {}): string[] {
  const nation = options.nationId ?? '';
  const exclusive = new Set<string>();
  if (options.restrictToFaction === true) {
    for (const template of allTemplates()) {
      const owner = factionOf(template.id);
      if (owner !== '' && owner !== nation) exclusive.add(template.id);
    }
  }

  return knownItemIds()
    .filter((id) => existsInYear(id, year))
    .filter((id) => {
      if (options.restrictToFaction !== true) return true;
      const owner = factionOf(id);
      if (owner !== '' && owner !== nation) return false;
      return !exclusive.has(id);
    })
    .sort((left, right) => itemName(left).localeCompare(itemName(right), 'vi'));
}

/** Danh mục xếp theo nhóm vũ khí / giáp — dạng bảng để in ra ở bài test C. */
export function catalogTable(year: number, options: CatalogOptions = {}): { group: string; items: string[] }[] {
  const groups = new Map<string, string[]>();
  for (const id of catalogForYear(year, options)) {
    const group = hasWeaponProfile(id)
      ? (weaponProfile(id).group === '' ? 'vu-khi' : weaponProfile(id).group)
      : armorPieceOf(id) !== null
        ? 'giap'
        : 'khac';
    const bucket = groups.get(group) ?? [];
    bucket.push(itemName(id));
    groups.set(group, bucket);
  }
  return [...groups.entries()].map(([group, items]) => ({ group, items }));
}

/** Món chỉ thế lực này mới có (mục 15). */
export function exclusiveTo(nationId: string): string[] {
  return factionCatalog(nationId)?.exclusive ?? [];
}
