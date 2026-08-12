/**
 * DỰNG MỘT LÃNH THỔ.
 *
 * Vạch xuất phát của tầng cai trị: một tên, một danh sách tỉnh, một bảng thuế
 * suất mặc định, một kho rỗng. KHÔNG có thành trì nào — `Province.holdingIds`
 * rỗng cho tới khi ai đó gắn vào, và việc gắn ấy đi qua `attachHolding` dưới đây
 * chứ không qua một cú đọc `state['holdings']`.
 *
 * TÊN LÃNH THỔ LUÔN KÈM LOẠI TỪ: "bá quốc Swabia", không bao giờ "Swabia" trần
 * trụi (Phụ lục A mục 9c). Và nó KHÔNG ĐƯỢC TRÙNG TÊN MỘT THÀNH TRÌ NÀO (mục 9a)
 * — `uniqueRealmName` nhận danh sách tên đã dùng TỪ NGOÀI, vì tầng này không đọc
 * được danh sách thành trì và cũng không nên đọc được.
 */

import { makeId, type RealmId } from '@/core/ids';
import { provinceRowsOfRealm, type ProvinceRow } from './data';
import { createProvince } from './province';
import { defaultRates } from './taxes';
import type { RealmSliceState } from './slice';
import type { Province } from './types';

export interface CreateRealmOptions {
  /** Hậu tố id, ví dụ `swabia` → `realm_swabia`. */
  slug: string;
  /** Tên đầy đủ kèm loại từ: "Bá quốc Swabia". */
  name: string;
  /** Id lãnh thổ trong `data/provinces.json` để lấy danh sách tỉnh. Rỗng thì không tỉnh nào. */
  fromRealmId?: string;
  /** Chỉ lấy những tỉnh này. Rỗng nghĩa là lấy hết. */
  provinceIds?: readonly string[];
  fiefId?: string;
  treasury?: number;
}

export function createRealm(options: CreateRealmOptions): RealmSliceState {
  const rows: ProvinceRow[] =
    options.fromRealmId === undefined || options.fromRealmId === ''
      ? []
      : provinceRowsOfRealm(options.fromRealmId).filter(
          (row) => (options.provinceIds ?? []).length === 0 || (options.provinceIds ?? []).includes(row.id),
        );

  return {
    id: makeId('realm', options.slug) as RealmId,
    name: options.name,
    provinces: rows.map((row) => createProvince(row, options.fiefId ?? '')),
    taxRates: defaultRates(),
    laws: [],
    projects: [],
    treasury: options.treasury ?? 0,
    court: [],
    cases: [],
    ledger: {
      taxRevenue: 0,
      tributeIn: 0,
      tributeOut: 0,
      lawUpkeep: 0,
      courtSalary: 0,
      projectSpend: 0,
      skimmed: 0,
      net: 0,
    },
    viewing: '',
    rumours: [],
    opinion: [],
  };
}

/**
 * Tên lãnh thổ không trùng tên thành trì nào (Phụ lục A mục 9a).
 *
 * `taken` đi vào TỪ NGOÀI. Đây là điểm đối xứng của `uniqueHoldingName` ở Phần 12,
 * và cả hai đều nhận danh sách qua tham số vì không tầng nào được đọc sổ của tầng
 * kia — chống lẫn tên ngay ở khâu dữ liệu chứ không ở khâu prompt.
 */
export function uniqueRealmName(name: string, taken: readonly string[]): string {
  const used = new Set(taken.map((entry) => entry.trim().toLocaleLowerCase('vi')));
  if (!used.has(name.trim().toLocaleLowerCase('vi'))) return name;
  for (let index = 2; index < 50; index++) {
    const candidate = `${name} ${romanNumeral(index)}`;
    if (!used.has(candidate.trim().toLocaleLowerCase('vi'))) return candidate;
  }
  return `${name} Hạ`;
}

function romanNumeral(value: number): string {
  const table: readonly [number, string][] = [
    [10, 'X'],
    [9, 'IX'],
    [5, 'V'],
    [4, 'IV'],
    [1, 'I'],
  ];
  let left = value;
  let out = '';
  for (const [amount, symbol] of table) {
    while (left >= amount) {
      out += symbol;
      left -= amount;
    }
  }
  return out;
}

/**
 * Gắn một thành trì vào một tỉnh.
 *
 * Nhận một CHUỖI ID, không nhận một `Holding` — ba tầng là lãnh thổ > tỉnh > thành
 * trì (Phụ lục A mục 9d), và tầng giữa chỉ cần biết TÊN của tầng dưới chứ không
 * cần biết trong đó có mấy cái cối xay.
 */
export function attachHolding(provinces: readonly Province[], provinceId: string, holdingId: string): Province[] {
  return provinces.map((province) =>
    province.id === provinceId && !province.holdingIds.includes(holdingId as Province['holdingIds'][number])
      ? { ...province, holdingIds: [...province.holdingIds, holdingId as Province['holdingIds'][number]] }
      : province,
  );
}

/** Gỡ một thành trì khỏi mọi tỉnh — mất thành thì tỉnh vẫn còn (Phụ lục A mục 1). */
export function detachHolding(provinces: readonly Province[], holdingId: string): Province[] {
  return provinces.map((province) => ({
    ...province,
    holdingIds: province.holdingIds.filter((id) => id !== holdingId),
  }));
}
