/**
 * MÔ HÌNH HIỂN THỊ CỦA MÀN TRANG BỊ (Phần 16 mục 18).
 *
 * Tách khỏi component vì cùng một lý do với `ui/realm/realm.ts` của Phần 13:
 * mấy phép suy này là LUẬT ĐỌC — vùng nào coi là hở, ngưỡng tải nào là quá
 * nặng, món nào chặn cứng không cho mặc — và luật thì phải kiểm được bằng test
 * mà không cần dựng một cây React.
 *
 * MÀU THEO CHE PHỦ là phần quan trọng nhất ở đây. Mục 18 gọi chế độ xem che phủ
 * là "màn hình quan trọng nhất của Phần 16", và nó chỉ làm được việc nếu người
 * chơi NHÌN MỘT CÁI là biết mình hở chỗ nào — không phải đọc hai mươi con số.
 */

import { regionName } from '@/systems/body';
import {
  buildCoverage,
  buildLoad,
  coverAt,
  equipmentOf,
  fitOfItem,
  itemName,
  maintenancePlan,
  packedItems,
  valueOf,
  wearerOfState,
  weightOfItem,
  wornFromItems,
  wornItems,
  armorPieceOf,
  damageKindOf,
  type CoverageMap,
  type Item,
  type LoadReport,
} from '@/systems/items';
import type { GameState } from '@/state/slices';

// ---------------------------------------------------------------------------
// Màu theo che phủ
// ---------------------------------------------------------------------------

/**
 * Bốn bậc, không phải một dải liên tục.
 *
 * Một dải gradient trông đẹp và không đọc được: mắt người không phân biệt được
 * 82% với 91% trên một mảng màu, mà chênh lệch ấy là chênh lệch giữa "còn khe"
 * và "gần kín". Bốn bậc thì đọc được từ đầu kia căn phòng.
 */
export const COVERAGE_COLORS = {
  kin: '#7c8ba1',
  gan_kin: '#c9a227',
  ho: '#d2691e',
  tran: '#8d5524',
} as const;

export function coverageColor(coverage: number): string {
  if (coverage >= 100) return COVERAGE_COLORS.kin;
  if (coverage >= 85) return COVERAGE_COLORS.gan_kin;
  if (coverage > 0) return COVERAGE_COLORS.ho;
  return COVERAGE_COLORS.tran;
}

/** Vùng NHẤP NHÁY ĐỎ: còn hở thật sự, không phải hở vài phần trăm cho khớp cử động. */
export function blinks(coverage: number): boolean {
  return coverage < 85;
}

// ---------------------------------------------------------------------------
// Một vùng trên bản đồ
// ---------------------------------------------------------------------------

export interface RegionView {
  regionId: string;
  name: string;
  coverage: number;
  chem: number;
  dam: number;
  dap: number;
  gapName: string;
  pieces: string[];
  color: string;
  blink: boolean;
  tooltip: string;
}

export function regionViews(map: CoverageMap): RegionView[] {
  return [...map.byRegion.values()].map((cover) => {
    const name = regionName(cover.regionId);
    const state =
      cover.coverage >= 100
        ? 'kín'
        : cover.coverage <= 0
          ? 'trần'
          : `hở ${String(100 - cover.coverage)}%${cover.gapName === '' ? '' : ` — ${cover.gapName}`}`;
    return {
      regionId: cover.regionId,
      name,
      coverage: cover.coverage,
      chem: cover.protection.chem,
      dam: cover.protection.dam,
      dap: cover.protection.dap,
      gapName: cover.gapName,
      pieces: cover.pieces.map((id) => itemName(id)),
      color: coverageColor(cover.coverage),
      blink: blinks(cover.coverage),
      tooltip: `${name} — ${state}\nchém ${String(cover.protection.chem)} · đâm ${String(
        cover.protection.dam,
      )} · đập ${String(cover.protection.dap)}${
        cover.pieces.length === 0 ? '' : `\n${cover.pieces.map((id) => itemName(id)).join(', ')}`
      }`,
    };
  });
}

// ---------------------------------------------------------------------------
// Cả màn hình
// ---------------------------------------------------------------------------

export interface WornView {
  item: Item;
  name: string;
  kg: number;
  value: number;
  isArmor: boolean;
  /** Mức vừa người và lời giải thích (mục 8). */
  fitGrade: string;
  fitReason: string;
  /** UI phải CHẶN CỨNG món không mặc được, không chỉ hiện chữ đỏ. */
  refused: boolean;
  damage: { kind: string; name: string; where: string }[];
  condition: number;
}

export interface EquipmentView {
  coverage: CoverageMap;
  regions: RegionView[];
  load: LoadReport;
  wornList: WornView[];
  packList: WornView[];
  /** Món sở hữu nhưng đang cất ở nhà/thành trì, không đi cùng nhân vật. */
  stashList: WornView[];
  /** Ba thanh RIÊNG — không gộp một số (mục 18). */
  bars: { chem: number; dam: number; dap: number };
  gaps: RegionView[];
  totalValue: number;
  /** Cảnh báo khi vượt ngưỡng: tải, khe hở nguy hiểm, món không vừa. */
  warnings: string[];
  maintenance: { itemId: string; name: string; line: string; hours: number }[];
}

/** Ngưỡng tải mà mục 18 đòi phải cảnh báo. Đo bằng kg, không bằng phần trăm. */
export const HEAVY_LOAD_KG = 28;

/**
 * Dựng toàn bộ màn trang bị từ state.
 *
 * Đọc ba tầng riêng: `equipment.worn` (đang mặc), `equipment.packed` (túi đồ),
 * và phần còn lại của `items.owned` (kho sở hữu). Không có chỗ nào trong file
 * này ghi vào state.
 */
export function equipmentView(state: GameState): EquipmentView {
  const equipment = equipmentOf(state);
  const wearer = wearerOfState(state);
  const equipped = wornItems(state);
  const packed = packedItems(state);
  const equippedIds = new Set(equipped.map((item) => item.id));
  const packedIds = new Set(packed.map((item) => item.id));
  const stored = (readOwned(state) ?? []).filter(
    (item) => !equippedIds.has(item.id) && !packedIds.has(item.id),
  );

  const coverage = buildCoverage(wornFromItems(equipped));
  const extraKg = [
    ...equipped.filter((item) => armorPieceOf(item.templateId) === null),
    ...packed,
  ].reduce((sum, item) => sum + weightOfItem(item), 0);
  const load = buildLoad(wornFromItems(equipped), {
    belted: equipment?.belted ?? true,
    extraKg,
  });

  const toView = (item: Item): WornView => {
    const fit = fitOfItem(item, wearer);
    return {
      item,
      name: item.name,
      kg: weightOfItem(item),
      value: valueOf(item),
      isArmor: armorPieceOf(item.templateId) !== null,
      fitGrade: fit.grade.name,
      fitReason: fit.reason,
      refused: !fit.wearable,
      condition: item.condition,
      damage: item.damage.map((entry) => ({
        kind: entry.kind,
        name: damageKindOf(entry.kind)?.name ?? entry.kind,
        where: entry.regionId === '' ? '' : regionName(entry.regionId),
      })),
    };
  };

  const wornList = equipped.map(toView);
  const packList = packed.map(toView);
  const stashList = stored.map(toView);
  const regions = regionViews(coverage);
  const gaps = regions.filter((region) => region.coverage < 100).sort((left, right) => left.coverage - right.coverage);

  const warnings: string[] = [];
  if (load.totalKg >= HEAVY_LOAD_KG) {
    warnings.push(`Mang ${String(Math.round(load.totalKg))} kg — vượt ngưỡng hành quân, và bơi qua sông là chìm.`);
  }
  if (load.shoulderKg >= 10) {
    warnings.push(`${String(load.shoulderKg)} kg treo hết trên vai: mệt nhanh hơn hẳn cùng số cân trải đều.`);
  }
  if (!load.belted) warnings.push('Thiếu đai và móc treo — tải dồn lên vai và phạt thêm.');
  for (const entry of wornList) {
    if (entry.refused) warnings.push(`${entry.name}: ${entry.fitReason}`);
  }
  const bare = regions.filter((region) => region.coverage <= 0);
  if (bare.length >= 10) warnings.push('Gần như không mặc gì — mọi đòn đều là đòn đầy đủ.');

  const maintenance = [...wornList, ...packList, ...stashList]
    .filter((entry) => entry.condition < 100 || entry.damage.length > 0)
    .map((entry) => {
      const plan = maintenancePlan(entry.item);
      return { itemId: entry.item.id, name: entry.name, line: plan.line, hours: plan.hours };
    });

  return {
    coverage,
    regions,
    load,
    wornList,
    packList,
    stashList,
    bars: { ...coverage.average },
    gaps,
    totalValue: wornList.reduce((sum, entry) => sum + entry.value, 0),
    warnings,
    maintenance,
  };
}

function readOwned(state: GameState): Item[] | null {
  const raw = (state as unknown as { items?: { owned?: Item[] } }).items?.owned;
  return Array.isArray(raw) ? raw : null;
}

/** Một dòng đọc được cho vùng đang chọn, dùng ở khung bên phải. */
export function describeSelected(map: CoverageMap, regionId: string): string {
  const cover = coverAt(map, regionId);
  if (cover.pieces.length === 0) return `${regionName(regionId)}: không có gì che.`;
  return `${regionName(regionId)}: ${cover.pieces.map((id) => itemName(id)).join(' + ')}`;
}
