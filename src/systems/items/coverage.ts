/**
 * BẢN ĐỒ CHE PHỦ GIÁP — CƠ CHẾ TRUNG TÂM CỦA PHẦN 16 (mục 3 và 4).
 *
 * README mục 8.5 xếp file này là chỗ dễ hỏng thứ năm của cả dự án, và nói rõ
 * cách nó hỏng: rút giáp thành MỘT con số phòng thủ tổng thì mất hết chiều sâu
 * và làm hỏng luôn cơ chế "đâm khe hở" của Phần 9. Nên ở đây không có con số
 * ấy. Cái thay nó là ba thứ, và cả ba đều đi tới tận cùng:
 *
 *   1. CHE PHỦ THEO VÙNG — 20 vùng của Phần 7, mỗi vùng một con số 0–100.
 *      Cộng dồn mọi món; chưa đủ 100 là còn khe.
 *   2. BA TRỤC CHỐNG RIÊNG — chém, đâm, đập. Không bao giờ gộp.
 *   3. CHỒNG LỚP — món tốt nhất, cộng một phần của món dưới. Đây là chỗ
 *      "áo lót độn là nền của mọi bộ" thành cơ học chứ không phải một lời khuyên.
 *
 * `average` ở cuối `CoverageMap` là con số tổng DUY NHẤT trong file, và nó chỉ
 * để HIỆN trên ba thanh của UI mục 18. Không phép kiểm nào được đọc nó — làm
 * thế là đi đường vòng về đúng cái con số mà README cấm.
 */

import { allRegions, regionOf } from '@/systems/body/regions';
import type { CarriedGear } from '@/systems/character/gear';
import {
  AXES,
  armorClassOf,
  armorPieceOf,
  bareClass,
  damageKindOf,
  emptyTriple,
  enchantmentOf,
  gapName,
  itemMaterial,
  layeringConfig,
  materialOf,
  qualityOf,
  type ArmorPiece,
  type Axis,
  type AxisTriple,
} from './data';
import type { CoverageMap, Item, ItemDamage, RegionCover } from './types';

/**
 * MỘT MÓN ĐANG MẶC, ở dạng tối thiểu mà bản đồ che phủ cần.
 *
 * Cố ý KHÔNG nhận thẳng `Item`: hàm này còn phải chạy được cho NPC và cho đối
 * thủ trong một trận đấu, nơi không có slice `items` nào cả. `wornFromItems` và
 * `wornFromCarried` là hai cửa đổi vào, và cả hai đổ về cùng một hình dạng.
 */
export interface WornPiece {
  instanceId: string;
  itemId: string;
  material: string;
  /** 1–5. */
  quality: number;
  /** 0–100. */
  condition: number;
  damage: ItemDamage[];
  enchantment: string;
  /** Id người được đo may. Rỗng là chưa đo cho ai (mục 8). */
  fitTo: string;
}

export function wornFromItems(items: readonly Item[]): WornPiece[] {
  return items.map((item) => ({
    instanceId: item.id,
    itemId: item.templateId,
    material: item.material,
    quality: item.quality,
    condition: item.condition,
    damage: item.damage,
    enchantment: item.enchantment,
    fitTo: item.fitTo,
  }));
}

/**
 * Đổi trang bị khai báo của Phần 6 sang dạng Phần 16 dùng.
 *
 * Món chưa mặc thì bỏ qua — chỉ món đang mang mới che được gì. Chất lượng đi
 * qua `qualityOf`, và bảng `alias` của `item-templates.json` lo phần bốn bậc cũ
 * của `gear.json` thành năm bậc của mục 7 mà không phải migrate save.
 */
export function wornFromCarried(carried: readonly CarriedGear[]): WornPiece[] {
  const worn: WornPiece[] = [];
  for (const [index, entry] of carried.entries()) {
    if (!entry.equipped) continue;
    worn.push({
      instanceId: `${entry.item}#${String(index)}`,
      itemId: entry.item,
      material: entry.material === '' ? itemMaterial(entry.item) : entry.material,
      quality: qualityOf(entry.quality).level,
      condition: 100,
      damage: [],
      enchantment: '',
      fitTo: '',
    });
  }
  return worn;
}

// ---------------------------------------------------------------------------
// Một món giáp: che bao nhiêu, chống bao nhiêu
// ---------------------------------------------------------------------------

/**
 * Tình trạng ăn vào sức chống, nhưng KHÔNG ăn hết.
 *
 * Sàn 0.6 là cố ý: một bộ giáp cũ nát vẫn là kim loại, và cho nó tụt về 0 thì
 * người chơi sẽ học được rằng bỏ bê bảo dưỡng tương đương với cởi giáp ra —
 * điều đó sai, và nó xóa mất cả mục 10, nơi hư hỏng CỤ THỂ mới là thứ đáng sợ.
 */
function conditionFactor(condition: number): number {
  return 0.6 + 0.4 * (Math.max(0, Math.min(100, condition)) / 100);
}

interface PieceProfile {
  worn: WornPiece;
  piece: ArmorPiece;
  protection: AxisTriple;
  /** Vùng → phần trăm che phủ THẬT, đã trừ hư hỏng. */
  coverage: Map<string, number>;
  slipped: boolean;
}

function damageAdjust(worn: WornPiece): {
  protect: AxisTriple;
  coverageAll: number;
  coverageByRegion: Map<string, number>;
  slipped: boolean;
} {
  const protect = emptyTriple();
  const coverageByRegion = new Map<string, number>();
  let coverageAll = 0;
  let slipped = false;

  for (const entry of worn.damage) {
    const kind = damageKindOf(entry.kind);
    if (kind === null) continue;
    if (kind.slipsOff) slipped = true;
    for (const axis of AXES) protect[axis] += kind.protect[axis];

    if (kind.coverage === 0) continue;
    if (kind.regional && entry.regionId !== '') {
      coverageByRegion.set(entry.regionId, (coverageByRegion.get(entry.regionId) ?? 0) + kind.coverage);
    } else {
      coverageAll += kind.coverage;
    }
  }

  return { protect, coverageAll, coverageByRegion, slipped };
}

function profileOf(worn: WornPiece): PieceProfile | null {
  const piece = armorPieceOf(worn.itemId);
  if (piece === null) return null;

  const material = materialOf(worn.material);
  const quality = qualityOf(qualityLevelId(worn.quality));
  const enchantment = worn.enchantment === '' ? null : enchantmentOf(worn.enchantment);
  const damage = damageAdjust(worn);
  const wear = conditionFactor(worn.condition);

  const protection = emptyTriple();
  for (const axis of AXES) {
    const raw =
      piece.protection[axis] * material.protection[axis] +
      quality.protect +
      (enchantment?.armor[axis] ?? 0) +
      damage.protect[axis];
    protection[axis] = Math.max(0, Math.round(raw * wear));
  }

  const coverage = new Map<string, number>();
  for (const cover of piece.covers) {
    const delta = damage.coverageByRegion.get(cover.region) ?? 0;
    const value = cover.coverage + delta + damage.coverageAll;
    coverage.set(cover.region, Math.max(0, Math.min(100, value)));
  }

  return { worn, piece, protection, coverage, slipped: damage.slipped };
}

/** Bậc chất lượng theo số 1–5 → id, để tra chung một bảng với `data/gear.json`. */
function qualityLevelId(level: number): string {
  const clamped = Math.max(1, Math.min(5, Math.round(level)));
  return ['vung-ve', 'thuong', 'tot', 'thuong-pham', 'tuyet-tac'][clamped - 1] ?? 'thuong';
}

// ---------------------------------------------------------------------------
// Bản đồ che phủ
// ---------------------------------------------------------------------------

/**
 * Dựng bản đồ che phủ đủ 20 vùng.
 *
 * MỌI VÙNG ĐỀU CÓ MẶT trong kết quả, kể cả vùng trần. Bỏ vùng trần đi thì UI
 * mục 18 không vẽ được chỗ hở — mà chỗ hở mới là thứ người chơi cần nhìn.
 */
export function buildCoverage(worn: readonly WornPiece[]): CoverageMap {
  const profiles = worn
    .map((entry) => profileOf(entry))
    .filter((profile): profile is PieceProfile => profile !== null && !profile.slipped);

  const layering = layeringConfig();
  const bare = bareClass();
  const byRegion = new Map<string, RegionCover>();
  const average = emptyTriple();
  let heaviestRank = bare.rank;
  let heaviest = bare.id;

  for (const region of allRegions()) {
    const covering = profiles.filter((profile) => (profile.coverage.get(region.id) ?? 0) > 0);

    let coverage = 0;
    let classId = bare.id;
    let classRank = bare.rank;
    for (const profile of covering) {
      coverage += profile.coverage.get(region.id) ?? 0;
      const armorClass = armorClassOf(profile.piece.class);
      if (armorClass !== null && armorClass.rank > classRank) {
        classRank = armorClass.rank;
        classId = armorClass.id;
      }
    }
    coverage = Math.min(100, Math.round(coverage));
    if (classRank > heaviestRank) {
      heaviestRank = classRank;
      heaviest = classId;
    }

    // CHỒNG LỚP: món tốt nhất trên trục này, cộng một phần của món thứ hai và
    // thứ ba. Xếp lại theo TỪNG TRỤC chứ không xếp một lần theo tổng — một cái
    // áo độn đứng thứ ba về chống chém có thể đứng đầu về chống đập, và gộp thứ
    // hạng lại là mất đúng điều đó.
    const protection = emptyTriple();
    for (const axis of AXES) {
      const values = covering.map((profile) => profile.protection[axis]).sort((left, right) => right - left);
      const total =
        (values[0] ?? 0) + (values[1] ?? 0) * layering.second + (values[2] ?? 0) * layering.third;
      protection[axis] = Math.round(Math.min(layering.max, total));
    }

    const cover: RegionCover = {
      regionId: region.id,
      coverage,
      protection,
      pieces: covering
        .slice()
        .sort((left, right) => right.protection.chem - left.protection.chem)
        .map((profile) => profile.piece.id),
      armorClassId: classId,
      // TÊN KHE HỞ chỉ có nghĩa khi có một bộ giáp để mà hở: "nách trái" nói
      // rằng bộ giáp này chừa nách ra. Một người cởi trần thì cả người là chỗ
      // hở, và gọi vùng mặt của họ là "khe mắt" là nói một câu vô nghĩa.
      gapName: coverage >= 100 || coverage <= 0 ? '' : gapName(region.id),
    };
    byRegion.set(region.id, cover);

    for (const axis of AXES) {
      average[axis] += (region.hitWeight * protection[axis] * coverage) / 10000;
    }
  }

  for (const axis of AXES) average[axis] = Math.round(average[axis]);

  const gaps = [...byRegion.values()]
    .filter((cover) => cover.coverage < 100)
    .sort((left, right) => left.coverage - right.coverage);

  return { byRegion, gaps, heaviest, average };
}

/** Bản đồ của một người không mặc gì — dùng làm mặc định và trong test. */
export function bareCoverage(): CoverageMap {
  return buildCoverage([]);
}

// ---------------------------------------------------------------------------
// Đọc bản đồ
// ---------------------------------------------------------------------------

export function coverAt(map: CoverageMap, regionId: string): RegionCover {
  const found = map.byRegion.get(regionId);
  if (found !== undefined) return found;
  return {
    regionId,
    coverage: 0,
    protection: emptyTriple(),
    pieces: [],
    armorClassId: bareClass().id,
    gapName: '',
  };
}

/** Sức chống trên MỘT trục ở MỘT vùng. Ba trục không bao giờ được cộng lại. */
export function protectionAt(map: CoverageMap, regionId: string, axis: Axis): number {
  return coverAt(map, regionId).protection[axis];
}

/**
 * Che phủ theo vùng, dạng `Record` — đúng thứ `HitOptions` của Phần 7 nhận.
 *
 * Đây là cầu nối duy nhất giữa Phần 16 và `body/inflict.ts`: Phần 7 KHÔNG import
 * gì từ đây (một vòng import giữa hai hệ chạy lúc khởi động là loại lỗi chỉ nổ ở
 * bản build production), nó chỉ nhận một bảng số.
 */
export function coverageRecord(map: CoverageMap): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [regionId, cover] of map.byRegion) {
    if (cover.coverage > 0) out[regionId] = cover.coverage;
  }
  return out;
}

/** Vùng còn hở, nặng nhất trước. Chỗ mũi dao rondel đi tìm (mục 5). */
export function gapsOf(map: CoverageMap): RegionCover[] {
  return [...map.gaps];
}

/** Vùng hoàn toàn không có gì che. */
export function bareRegions(map: CoverageMap): string[] {
  return [...map.byRegion.values()].filter((cover) => cover.coverage <= 0).map((cover) => cover.regionId);
}

/** Đối thủ có đang mặc giáp tấm không — nhãn `dich-giap-tam` của Phần 8. */
export function wearingPlate(map: CoverageMap): boolean {
  return armorClassOf(map.heaviest)?.plate ?? false;
}

/** Tên loại giáp nặng nhất, để biên niên gọi đúng chữ. */
export function heaviestClassName(map: CoverageMap): string {
  return armorClassOf(map.heaviest)?.name ?? bareClass().name;
}

/** Một dòng đọc được cho UI: "Ngực — kín, chống chém 92 / đâm 88 / đập 60". */
export function describeRegion(map: CoverageMap, regionId: string): string {
  const cover = coverAt(map, regionId);
  const region = regionOf(regionId);
  const name = region?.name ?? regionId;
  const state =
    cover.coverage >= 100
      ? 'kín'
      : cover.coverage <= 0
        ? 'trần'
        : `hở ${String(100 - cover.coverage)}%${cover.gapName === '' ? '' : ` (${cover.gapName})`}`;
  return `${name} — ${state}, chống chém ${String(cover.protection.chem)} / đâm ${String(
    cover.protection.dam,
  )} / đập ${String(cover.protection.dap)}`;
}
