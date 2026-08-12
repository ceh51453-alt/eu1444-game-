/**
 * NHÓM CÔNG TRÌNH PHÒNG THỦ ĐỔ VÀO `Fortification` CỦA PHẦN 11 (Phần 12 mục 5,
 * việc 12.6).
 *
 * > "**THẬT SỰ nối, xây thêm tháp phải làm cuộc vây hãm khác đi.**"
 *
 * Đó là cả yêu cầu, và nó chỉ được đáp ứng nếu `Fortification` được DỰNG RA TỪ
 * công trình có thật trong thành trì, chứ không phải tra một khuôn mẫu rồi cộng
 * thêm vài điểm. Cách tra khuôn là cách hai hệ lặng lẽ tách khỏi nhau: người
 * chơi xây thêm bốn cái tháp, khuôn vẫn khai năm tháp, và cuộc vây hãm không hề
 * biết chuyện gì đã xảy ra trong hai mươi năm qua.
 *
 * Nên hàm ở đây đọc `fortify` của TỪNG công trình đã dựng:
 *
 *   `bld_thap`      → một `WallTower` thật trong `outerWall.towers`
 *   `bld_tuong-da`  → `outerWall` với `integrity`, `height`, `thickness` của nó
 *   `bld_cong`      → `gatehouse`, kèm cổng lật và cầu treo
 *   `bld_hao`       → `moat`, và ngập nước nếu quanh thành có nguồn nước
 *   `bld_gieng`     → `wells` — số giếng quyết định cắt nước có giết được thành không
 *   `bld_kho-luong` → `keep.stores` và số tuần cầm cự
 *   `bld_thap-chinh`→ `keep`
 *
 * KHUÔN MẪU CỦA CẤP CHỈ LÀM MỘT VIỆC: cho `templateId` để Phần 11 biết đang nói
 * về loại công sự nào, và làm nền cho một thành trì CHƯA xây gì (một cái thôn
 * không tường vẫn phải bị vây được). Mọi con số đều đến từ công trình.
 *
 * CHIỀU ĐI CỦA QUAN HỆ NÀY LÀ MỘT CHIỀU: `holdings` dựng ra một `Fortification`
 * và trao cho Phần 11. `siege` không bao giờ đọc ngược vào `holdings`.
 */

import { garrisonMen, type Fortification, type GarrisonUnit, type WallLayer, type WallTower } from '@/systems/siege/types';
import { siegeConfig } from '@/systems/siege/data';
import { adjacencyOf } from './adjacency';
import { buildingOf, terrainOf, tierOf, upkeepConfig, type FortifyContribution } from './data';
import { chokeFactor } from './grid';
import { garrisonOf } from './garrison';
import type { Holding, PlacedBuilding } from './types';

export class HoldingFortifyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HoldingFortifyError';
  }
}

/** Công trình còn đứng vững đủ để tính vào công sự không. */
function standing(placed: PlacedBuilding): boolean {
  return placed.integrity >= upkeepConfig().ruinedBelow;
}

interface FortPart {
  placed: PlacedBuilding;
  fortify: FortifyContribution;
}

function fortifyParts(holding: Holding): FortPart[] {
  const parts: FortPart[] = [];
  for (const placed of holding.buildings) {
    if (!standing(placed)) continue;
    const building = buildingOf(placed.buildingId);
    if (building?.fortify === undefined) continue;
    parts.push({ placed, fortify: building.fortify });
  }
  return parts;
}

/** Quanh thành có nguồn nước không — quyết định hào khô hay hào ngập. */
function hasWater(holding: Holding): boolean {
  const inGrid = holding.tiles.some((tile) => terrainOf(tile.terrain)?.tags.includes('nuoc') === true);
  const outside = holding.hinterland.some((row) => terrainOf(row.terrain)?.tags.includes('nuoc') === true);
  return inGrid || outside;
}

/**
 * Công trình hư hại thì công sự yếu đi THEO TỈ LỆ, không phải mất hẳn.
 *
 * Một bức tường 60/100 vẫn là một bức tường; nó chỉ vỡ sớm hơn. Cách khác — coi
 * dưới ngưỡng là không có tường — làm cuộc vây hãm nhảy bậc, và bên thủ đang giữ
 * một bức tường nứt bỗng thấy mình đứng ngoài trời.
 */
function wear(placed: PlacedBuilding): number {
  return Math.max(0.25, placed.integrity / 100) * Math.max(0.5, placed.quality);
}

function buildWall(
  id: string,
  fallbackName: string,
  parts: readonly FortPart[],
  layer: 'ngoai' | 'trong',
  towerBonus: number,
): WallLayer | null {
  const wallPart = parts.find((part) => part.fortify.wallLayer === layer);
  if (wallPart === undefined) return null;

  const factor = wear(wallPart.placed);
  const integrity = Math.max(1, wallPart.fortify.integrity * factor);

  // Tháp chỉ mọc trên tường NGOÀI: `bld_thap` đòi `requiresWall` và đứng ở vành
  // lưới, và Phần 11 mục 2 cũng chỉ bắn tháp của lớp đang giữ.
  const towers: WallTower[] = [];
  if (layer === 'ngoai') {
    let index = 0;
    for (const part of parts) {
      for (let count = 0; count < part.fortify.towers; count++) {
        index++;
        const towerIntegrity = Math.max(1, (part.fortify.towerIntegrity + towerBonus) * wear(part.placed));
        towers.push({
          id: `tuong-ngoai_thap_${String(index)}`,
          name: part.placed.customName === '' ? `Tháp ${String(index)}` : part.placed.customName,
          integrity: towerIntegrity,
          maxIntegrity: towerIntegrity,
        });
      }
    }
  }

  // Lỗ châu mai và rune khắc cộng thẳng vào độ bền tường: chúng khai `integrity`
  // mà không khai `wallLayer`, nên chúng là phần THÊM chứ không phải một lớp mới.
  const extra = parts
    .filter((part) => part.fortify.wallLayer === undefined && part.fortify.integrity > 0)
    .reduce((sum, part) => sum + part.fortify.integrity * wear(part.placed), 0);

  const total = layer === 'ngoai' ? integrity + extra : integrity;

  return {
    id,
    name: wallPart.fortify.wallName === '' ? fallbackName : wallPart.fortify.wallName,
    integrity: total,
    maxIntegrity: total,
    height: wallPart.fortify.height,
    thickness: wallPart.fortify.thickness,
    towers,
    breached: false,
  };
}

export interface FortifyOptions {
  /** Quân đồn trú huy động sẵn. Bỏ trống thì lấy từ `garrisonOf`. */
  garrison?: GarrisonUnit[];
  /** Kho lương mang vào cuộc vây hãm, tính bằng PHẦN một người một tuần. */
  food?: number;
}

/**
 * DỰNG `Fortification` TỪ MỘT THÀNH TRÌ THẬT.
 *
 * Đây là cửa DUY NHẤT giữa Phần 12 và Phần 11 theo chiều công sự. Phần 11 nhận
 * một `Fortification` và không cần biết nó đến từ một khuôn mẫu hay từ hai mươi
 * năm xây dựng của người chơi — đó chính là điều làm hai phần nối được với nhau
 * mà không phần nào phải biết ruột phần kia.
 */
export function fortificationFromHolding(holding: Holding, options: FortifyOptions = {}): Fortification {
  const tier = tierOf(holding.tierId);
  if (tier === null) throw new HoldingFortifyError(`thành trì ở cấp lạ: ${holding.tierId}`);

  const parts = fortifyParts(holding);
  const adjacency = adjacencyOf(holding, { besieged: true });
  const towerBonus = adjacency.wallIntegrity / Math.max(1, parts.filter((part) => part.fortify.towers > 0).length);

  const outer =
    buildWall('tuong-ngoai', tier.wall, parts, 'ngoai', towerBonus) ??
    // Một cái thôn không tường VẪN phải bị vây được. Hàng rào tạm này là hàng
    // rào thật của một khu định cư chưa có gì: đủ để chặn sói, không đủ để chặn
    // một đội quân — và Phần 11 sẽ nói đúng điều đó.
    {
      id: 'tuong-ngoai',
      name: 'không có tường, chỉ hàng giậu',
      integrity: 12,
      maxIntegrity: 12,
      height: 1.2,
      thickness: 0.2,
      towers: [],
      breached: false,
    };

  const inner = buildWall('tuong-trong', 'tường trong', parts, 'trong', 0);

  const gatePart = parts.find((part) => part.fortify.gateIntegrity > 0);
  const gateIntegrity = gatePart === undefined ? 20 : Math.max(1, gatePart.fortify.gateIntegrity * wear(gatePart.placed));

  const moatPart = parts.find((part) => part.fortify.moatWidth > 0);

  const keepPart = parts.find((part) => part.fortify.keepIntegrity > 0);
  const wells = parts.reduce((sum, part) => sum + part.fortify.wells, 0);
  const storeBonus = parts.reduce((sum, part) => sum + part.fortify.stores * wear(part.placed), 0);

  const garrison = options.garrison ?? garrisonOf(holding).units;

  // Kho lương ĐỔI ĐƠN VỊ ở đây và chỉ ở đây: `stores` của thành trì tính bằng
  // giạ, mà `supplies.food` của Phần 11 tính bằng PHẦN một người một tuần. Hai
  // đơn vị này đã được khai bằng nhau trong `data/resources.json`, nên phép đổi
  // là một-một — nhưng chỗ đổi vẫn phải có đúng một, nếu không sẽ có hai.
  const food = options.food ?? Math.max(0, holding.stores['luong-thuc'] ?? 0);
  const config = siegeConfig();

  return {
    id: holding.id,
    templateId: tier.fortTemplate,
    name: holding.name,
    tier: tier.rank,
    moat:
      moatPart === undefined
        ? null
        : {
            width: moatPart.fortify.moatWidth,
            wet: moatPart.fortify.moatWetIfWater && hasWater(holding),
            filled: 0,
          },
    outerWall: outer,
    gatehouse: {
      integrity: gateIntegrity,
      maxIntegrity: gateIntegrity,
      drawbridge: parts.some((part) => part.fortify.drawbridge) && moatPart !== undefined,
      portcullis: parts.some((part) => part.fortify.portcullis),
      murderHoles: parts.some((part) => part.fortify.murderHoles),
      broken: false,
    },
    // BỐ CỤC ĐI THẲNG VÀO PHẦN 11 (mục 4, câu cuối): thành xây kín thì đường
    // trong thành hẹp, và `bailey.area` là thứ Phần 11 chia ra để lấy mật độ
    // phòng thủ. Một thành chật là một thành khó tổng công.
    bailey: {
      area: holding.gridSize * holding.gridSize * chokeFactor(holding),
      buildings: holding.buildings.map((placed) => buildingOf(placed.buildingId)?.name ?? placed.buildingId),
    },
    innerWall: inner,
    keep:
      keepPart === undefined
        ? { integrity: 30, maxIntegrity: 30, capacity: holding.population.total * 0.05, stores: storeBonus * 0.2 }
        : {
            integrity: Math.max(1, keepPart.fortify.keepIntegrity * wear(keepPart.placed)),
            maxIntegrity: keepPart.fortify.keepIntegrity,
            capacity: keepPart.fortify.keepCapacity,
            stores: storeBonus,
          },
    wells,
    garrison,
    population: Math.round(holding.population.total),
    supplies: {
      food,
      // Nước dự trữ quy về CÙNG đơn vị phần-một-người-một-tuần của Phần 11: một
      // giếng nuôi được cả thành trong `weeksWithoutWater` lần số tuần mà thành
      // không giếng cầm cự nổi. Không giếng thì con số này bằng 0, và mục 3 của
      // Phần 11 sẽ giết thành đúng như nó nói.
      water:
        wells *
        config.water.weeksWithoutWater *
        Math.max(1, holding.population.total) *
        config.consumption.waterPerManWeek,
      fodder: Math.max(0, holding.stores['go'] ?? 0) * 0.2,
      materials: Math.max(0, holding.stores['da'] ?? 0) + Math.max(0, holding.stores['go'] ?? 0),
    },
    heldLayer: 'tuong-ngoai',
    lostLayers: [],
  };
}

// ---------------------------------------------------------------------------
// Biến phụ: SỐ TUẦN CẦM CỰ (mục 10)
// ---------------------------------------------------------------------------

export interface SiegeReadiness {
  /** Số tuần cầm cự được nếu bị vây ngay bây giờ. Con số bảng "Nếu bị vây" hiện. */
  weeks: number;
  /** Tuần cầm cự do lương quyết định. */
  foodWeeks: number;
  /** Tuần cầm cự do nước quyết định. Không giếng thì rất ngắn. */
  waterWeeks: number;
  /** Chỉ số phòng thủ tổng hợp, để so hai thành trì với nhau. */
  defence: number;
  /** Điểm yếu bố cục, câu tiếng Việt để UI hiện thẳng (mục 11). */
  weaknesses: string[];
}

/**
 * "NẾU BỊ VÂY" — bảng của mục 11, và là biến phụ của mục 10.
 *
 * Con số này KHÔNG được tính riêng một kiểu ở đây rồi một kiểu khác ở Phần 11.
 * Nó dùng đúng `consumption` và `water` của `data/fortifications.json`, nên khi
 * cuộc vây hãm thật bắt đầu thì người chơi thấy đúng con số họ đã đọc trên bảng.
 */
export function siegeReadiness(holding: Holding): SiegeReadiness {
  const config = siegeConfig();
  const fort = fortificationFromHolding(holding);
  const adjacency = adjacencyOf(holding, { besieged: true });

  const mouths = garrisonMen(fort) + fort.population;
  const perWeek = mouths * config.consumption.foodPerManWeek;
  const foodWeeks = perWeek <= 0 ? 0 : fort.supplies.food / perWeek;
  const waterWeeks = fort.wells > 0 ? Number.POSITIVE_INFINITY : config.water.weeksWithoutWater;

  const weeks = Math.max(0, Math.min(foodWeeks, waterWeeks) + adjacency.siegeWeeks);

  const weaknesses: string[] = [];
  if (fort.wells === 0) weaknesses.push('Không có giếng riêng — cắt nguồn nước là thành mất trong vài tuần.');
  if (fort.outerWall.towers.length === 0) weaknesses.push('Tường không có tháp — không bắn dọc chân tường được.');
  if (fort.innerWall === null) weaknesses.push('Chỉ có một lớp tường — mất tường ngoài là mất thành.');
  if (fort.moat === null) weaknesses.push('Không hào — thang dựng thẳng vào chân tường, và đào hầm không ai cản.');
  if (!fort.gatehouse.portcullis) weaknesses.push('Cổng không có cổng lật — phá cổng là xong.');
  if (foodWeeks < 8) weaknesses.push(`Kho lương chỉ đủ ${foodWeeks.toFixed(1)} tuần.`);
  if (holding.buildings.every((placed) => buildingOf(placed.buildingId)?.id !== 'bld_kho-luong')) {
    weaknesses.push('Không có kho lương — thóc mốc trước khi vòng vây siết.');
  }

  const defence =
    fort.outerWall.integrity +
    (fort.innerWall?.integrity ?? 0) * 0.8 +
    fort.keep.integrity * 0.6 +
    fort.outerWall.towers.reduce((sum, tower) => sum + tower.integrity, 0) * 0.5 +
    (fort.moat === null ? 0 : fort.moat.width * 8) +
    garrisonMen(fort) * 0.6;

  return { weeks, foodWeeks, waterWeeks, defence, weaknesses };
}
