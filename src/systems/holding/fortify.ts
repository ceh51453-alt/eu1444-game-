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
import { buildingOf, footprintOf, upkeepConfig, tierOf, type FortifyContribution } from './data';
import { terrainAt } from './field';
import { chokeFactor, fieldOf, hinterlandOf, planningRadius, walledAreaKm2 } from './place';
import { garrisonOf } from './garrison';
import { CENTER_CELL, cellsToMetres } from './scale';
import {
  enclosedArea,
  innerWall,
  insideWall,
  standingWalls,
  wallDensity,
  wallIntegrity,
  wallMaterialOf,
  watchmenNeeded,
  outerWall as outerWallOf,
  type WallLine,
} from './walls';
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

/**
 * Quanh thành có nguồn nước không — quyết định hào khô hay hào ngập.
 *
 * Hỏi mảnh đất THẬT bây giờ trả lời được chính xác: một con sông chảy qua trong
 * bán kính quy hoạch thì hào dẫn nước được, một cái đầm cách đó bốn cây số thì
 * không. Bản cũ hỏi bảng đếm ruộng, mà bảng đếm không biết cái đầm ấy ở đâu.
 */
function hasWater(holding: Holding): boolean {
  const field = fieldOf(holding);
  const radius = planningRadius(holding);
  for (let ring = 40; ring <= radius; ring += 40) {
    for (let index = 0; index < 16; index++) {
      const angle = (index / 16) * Math.PI * 2;
      const id = terrainAt(field, CENTER_CELL + Math.cos(angle) * ring, CENTER_CELL + Math.sin(angle) * ring);
      if (id === 'song' || id === 'suoi' || id === 'bien') return true;
    }
  }
  return hinterlandOf(holding).some((row) => row.terrain === 'dam');
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

/**
 * DỰNG MỘT LỚP TƯỜNG CHO PHẦN 11 TỪ MỘT TUYẾN CÓ THẬT.
 *
 * Đây là chỗ cuộc đại tu về không gian trả cổ tức cho Phần 11. Bản cũ lấy độ
 * bền từ một công trình "vành đai" không có hình dạng; ở đây nó đến từ một
 * tuyến người chơi đã vạch, đã trả tiền theo từng thước, và đang phải cắt người
 * ra canh theo từng thước ấy.
 *
 * Tháp không còn "thuộc về lớp ngoài" theo quy ước — chúng được gán cho tuyến
 * mà chúng đứng gần nhất. Xây bốn cái tháp dọc tường nội thì tường nội có bốn
 * cái tháp, và cuộc vây hãm sẽ khác đi đúng ở lớp ấy.
 */
function buildWallLayer(
  wall: WallLine,
  holding: Holding,
  parts: readonly FortPart[],
  towerBonus: number,
): WallLayer {
  const material = wallMaterialOf(wall.materialId);
  const base = wallIntegrity(wall, fieldOf(holding));

  const towers: WallTower[] = [];
  let index = 0;
  for (const part of parts) {
    if (part.fortify.towers <= 0) continue;
    if (nearestWallId(holding, part.placed) !== wall.id) continue;
    for (let count = 0; count < part.fortify.towers; count++) {
      index++;
      const integrity = Math.max(1, (part.fortify.towerIntegrity + towerBonus) * wear(part.placed));
      towers.push({
        id: `${wall.id}_thap_${String(index)}`,
        name: part.placed.customName === '' ? `Tháp ${String(index)}` : part.placed.customName,
        integrity,
        maxIntegrity: integrity,
      });
    }
  }

  // Lỗ châu mai và rune khắc cộng thẳng vào độ bền: chúng khai `integrity` mà
  // không khai tường riêng, nên chúng là phần THÊM cho tuyến chúng bám vào.
  const extra = parts
    .filter((part) => part.fortify.wallLayer === undefined && part.fortify.integrity > 0)
    .filter((part) => nearestWallId(holding, part.placed) === wall.id)
    .reduce((sum, part) => sum + part.fortify.integrity * wear(part.placed), 0);

  const total = Math.max(1, base + extra);
  return {
    id: wall.layer === 'trong' ? 'tuong-trong' : 'tuong-ngoai',
    name: wall.name,
    integrity: total,
    maxIntegrity: total,
    height: material?.height ?? 4,
    thickness: material?.thickness ?? 1,
    towers,
    breached: false,
  };
}

/** Tuyến gần một công trình bám tường nhất — chỗ cái tháp ấy thật sự đứng. */
function nearestWallId(holding: Holding, placed: PlacedBuilding): string {
  const building = buildingOf(placed.buildingId);
  if (building === null) return '';
  const walls = standingWalls(holding.walls);
  let bestId = '';
  let best = Number.POSITIVE_INFINITY;
  for (const wall of walls) {
    const distance = distanceToLine(wall, placed);
    if (distance < best) {
      best = distance;
      bestId = wall.id;
    }
  }
  return bestId;
}

function distanceToLine(wall: WallLine, placed: PlacedBuilding): number {
  let best = Number.POSITIVE_INFINITY;
  for (const point of wall.points) {
    const distance = Math.hypot(point.x - placed.at.x, point.y - placed.at.y);
    if (distance < best) best = distance;
  }
  return best;
}

/**
 * Diện tích sân thành quy về thang "ô lưới" của bản cũ.
 *
 * Phần 11 chia `bailey.area` ra để lấy mật độ phòng thủ, và cả bảng cân bằng
 * của nó đã hiệu chỉnh theo thang cũ (lưới 4×4 tới 16×16, tức 16 tới 256 đơn
 * vị). Đưa thẳng số ô 5 m vào — một vòng tường bán kính 300 ô ôm 280 nghìn ô² —
 * sẽ làm mọi phép mật độ của Phần 11 lệch đi ba bậc mười. Nên đổi đơn vị ở đây,
 * và chỉ ở đây.
 */
const CELLS_PER_LEGACY_AREA_UNIT = 1600;

function baileyArea(holding: Holding): number {
  const wall = outerWallOf(holding.walls);
  const cells = wall === null ? Math.PI * planningRadius(holding) ** 2 * 0.25 : enclosedArea(wall.points);
  return Math.max(16, cells / CELLS_PER_LEGACY_AREA_UNIT);
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

  const outerLine = outerWallOf(holding.walls);
  const innerLine = innerWall(holding.walls);

  const outer =
    outerLine === null
      ? // Một cái thôn không tường VẪN phải bị vây được. Hàng rào tạm này là hàng
        // rào thật của một khu định cư chưa có gì: đủ để chặn sói, không đủ để
        // chặn một đội quân — và Phần 11 sẽ nói đúng điều đó.
        {
          id: 'tuong-ngoai',
          name: 'không có tường, chỉ hàng giậu',
          integrity: 12,
          maxIntegrity: 12,
          height: 1.2,
          thickness: 0.2,
          towers: [],
          breached: false,
        }
      : buildWallLayer(outerLine, holding, parts, towerBonus);

  const inner = innerLine === null ? null : buildWallLayer(innerLine, holding, parts, 0);

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
    // BỐ CỤC ĐI THẲNG VÀO PHẦN 11 (mục 4, câu cuối). Bây giờ `area` là diện
    // tích THẬT trong lòng tường ngoài, quy về cùng thang cũ (một "ô lưới" của
    // bản cũ ứng với chừng 40 m vuông) để Phần 11 không phải hiệu chỉnh lại.
    bailey: {
      area: baileyArea(holding) * chokeFactor(holding),
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
  const garrison = garrisonMen(fort);
  const walls = standingWalls(holding.walls);
  const watch = watchmenNeeded(walls);
  const density = wallDensity(walls, garrison);

  if (walls.length === 0) weaknesses.push('Chưa có tuyến tường nào — thành trì để ngỏ bốn phía.');
  // CHỖ TRỐNG TRÊN MẶT TƯỜNG. Con số này chỉ tồn tại được vì tường bây giờ có
  // chiều dài, và nó nói một điều bản cũ không nói nổi: vạch một vòng tường quá
  // rộng LÀM YẾU thành trì, không làm mạnh.
  if (watch > 0 && density < 1) {
    weaknesses.push(
      `Tường dài ${String(Math.round(cellsToMetres(walls.reduce((sum, wall) => sum + wall.length, 0))))} thước cần ${String(watch)} người canh, chỉ có ${String(garrison)} — mặt tường có chỗ trống.`,
    );
  }
  if (walls.length > 0 && walls.every((wall) => !wall.closed)) {
    weaknesses.push('Không tuyến nào khép kín — quân vây chỉ cần đi vòng qua đầu tường.');
  }
  if (fort.wells === 0) weaknesses.push('Không có giếng riêng — cắt nguồn nước là thành mất trong vài tuần.');
  if (fort.outerWall.towers.length === 0) weaknesses.push('Tường không có tháp — không bắn dọc chân tường được.');
  if (fort.innerWall === null) weaknesses.push('Chỉ có một lớp tường — mất tường ngoài là mất thành.');
  if (fort.moat === null) weaknesses.push('Không hào — thang dựng thẳng vào chân tường, và đào hầm không ai cản.');
  if (!fort.gatehouse.portcullis) weaknesses.push('Cổng không có cổng lật — phá cổng là xong.');
  if (foodWeeks < 8) weaknesses.push(`Kho lương chỉ đủ ${foodWeeks.toFixed(1)} tuần.`);
  if (holding.buildings.every((placed) => buildingOf(placed.buildingId)?.id !== 'bld_kho-luong')) {
    weaknesses.push('Không có kho lương — thóc mốc trước khi vòng vây siết.');
  }
  const outside = holding.buildings.filter((placed) => !insideAnyWall(holding, placed)).length;
  if (walls.length > 0 && outside > 0) {
    weaknesses.push(`${String(outside)} công trình nằm ngoài tường — quân vây đốt chúng trong tuần đầu.`);
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

/**
 * Công trình có nằm trong lòng một tuyến khép kín nào không.
 *
 * Câu hỏi này không tồn tại ở bản cũ, vì ở đó tường chạy quanh mép lưới nên mọi
 * thứ đều ở trong. Bây giờ người chơi tự vạch tuyến, và "cái gì nằm ngoài tường"
 * là một hệ quả trực tiếp của việc họ vạch rộng hay hẹp.
 */
function insideAnyWall(holding: Holding, placed: PlacedBuilding): boolean {
  const building = buildingOf(placed.buildingId);
  if (building === null) return true;
  const size = footprintOf(building);
  const centre = { x: placed.at.x + size / 2, y: placed.at.y + size / 2 };
  return standingWalls(holding.walls).some((wall) => insideWall(wall, centre.x, centre.y));
}

/** Diện tích trong lòng tường ngoài, km². Tái xuất để UI có một cửa duy nhất. */
export { walledAreaKm2 };
