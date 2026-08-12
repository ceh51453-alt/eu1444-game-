/**
 * CÔNG SỰ NHIỀU LỚP, VÀ CÁI GIÁ CỦA VIỆC LÙI (Phần 11 mục 2).
 *
 * "Mất tường ngoài chưa phải mất thành." Câu ấy chỉ có nghĩa nếu việc lùi là một
 * NƯỚC ĐI CÓ ĐÁNH ĐỔI, chứ không phải một thanh máu thứ hai. Mục 2 viết đủ cả ba
 * vế của cái đánh đổi ấy, và `fallBack` phải làm đủ cả ba:
 *
 *   diện tích nhỏ lại      → `bailey.area` co xuống
 *   mật độ phòng thủ tăng  → `defenceDensity` cao lên, và tổng công khó hơn hẳn
 *   lương và nước NẰM LẠI  → kho ngoài mất, chỉ còn thứ đã kịp chuyển vào trong
 *
 * Vế thứ ba là vế người ta hay quên, và nó là vế đắt nhất: một thành lùi vào tháp
 * chính thì tường dày hơn, nhưng nó vừa đổi ba mươi tuần lương lấy sáu tuần.
 */

import type { Rng } from '@/core/rng';
import { SiegeDataError, fortTemplateOf, miningConfig, siegeConfig, type FortTemplate } from './data';
import {
  HELD_LAYER_LABELS,
  garrisonMen,
  heldWall,
  type Fortification,
  type GarrisonUnit,
  type HeldLayerId,
  type WallLayer,
  type WallTower,
} from './types';

export interface FortSetup {
  templateId: string;
  id?: string;
  name?: string;
  /** Ghi đè số quân đồn trú của khuôn mẫu. */
  garrison?: number;
  garrisonTypeId?: string;
  garrisonQuality?: 1 | 2 | 3 | 4 | 5;
  population?: number;
  /** Ghi đè kho lương, tính bằng PHẦN một người một tuần. */
  food?: number;
  wells?: number;
}

function towersFor(prefix: string, count: number, integrity: number): WallTower[] {
  const towers: WallTower[] = [];
  for (let index = 0; index < count; index++) {
    towers.push({
      id: `${prefix}_thap_${String(index + 1)}`,
      name: `Tháp ${String(index + 1)}`,
      integrity,
      maxIntegrity: integrity,
    });
  }
  return towers;
}

function wallFrom(prefix: string, row: FortTemplate['outerWall']): WallLayer {
  return {
    id: prefix,
    name: row.name,
    integrity: row.integrity,
    maxIntegrity: row.integrity,
    height: row.height,
    thickness: row.thickness,
    towers: towersFor(prefix, row.towers, row.towerIntegrity),
    breached: false,
  };
}

/**
 * Chia quân đồn trú thành mấy khối.
 *
 * Không rút xúc sắc: cùng một khuôn mẫu phải cho cùng một đám quân ở hai lần tải
 * cùng một save (R3). Người gọi muốn một đội đồn trú khác thì khai thẳng.
 */
function garrisonUnits(men: number, typeId: string, quality: 1 | 2 | 3 | 4 | 5): GarrisonUnit[] {
  if (men <= 0) return [];
  const blocks = Math.max(1, Math.min(6, Math.round(men / 60)));
  const per = Math.floor(men / blocks);
  const units: GarrisonUnit[] = [];
  for (let index = 0; index < blocks; index++) {
    const extra = index === blocks - 1 ? men - per * blocks : 0;
    units.push({
      id: `unit_don-tru_${String(index + 1)}`,
      typeId,
      name: `Đội đồn trú ${String(index + 1)}`,
      men: per + extra,
      quality,
    });
  }
  return units;
}

export function buildFortification(setup: FortSetup): Fortification {
  const template = fortTemplateOf(setup.templateId);
  if (template === null) {
    throw new SiegeDataError(`khuôn công sự không có trong data/fortifications.json: ${setup.templateId}`);
  }

  const garrison = Math.max(0, setup.garrison ?? template.garrison);
  const population = Math.max(0, setup.population ?? template.population);

  return {
    // `hold_*` — tiền tố bắt buộc của README dự án mục 7.1. Phần 12 sẽ dựng đối
    // tượng này từ thành trì thật và giữ nguyên id ấy.
    id: setup.id ?? `hold_${template.id.replace(/^fort_/, '')}`,
    templateId: template.id,
    name: setup.name ?? template.name,
    tier: template.tier,
    moat: template.moat === null ? null : { width: template.moat.width, wet: template.moat.wet, filled: 0 },
    outerWall: wallFrom('tuong-ngoai', template.outerWall),
    gatehouse: {
      integrity: template.gatehouse.integrity,
      maxIntegrity: template.gatehouse.integrity,
      drawbridge: template.gatehouse.drawbridge,
      portcullis: template.gatehouse.portcullis,
      murderHoles: template.gatehouse.murderHoles,
      broken: false,
    },
    bailey: { area: template.bailey.area, buildings: [...template.bailey.buildings] },
    innerWall: template.innerWall === null ? null : wallFrom('tuong-trong', template.innerWall),
    keep: {
      integrity: template.keep.integrity,
      maxIntegrity: template.keep.integrity,
      capacity: template.keep.capacity,
      stores: template.keep.stores,
    },
    wells: setup.wells ?? template.wells,
    garrison: garrisonUnits(garrison, setup.garrisonTypeId ?? 'unit_bo-binh-thue', setup.garrisonQuality ?? 3),
    population,
    supplies: {
      food: setup.food ?? template.supplies.food,
      water: template.supplies.water,
      fodder: template.supplies.fodder,
      materials: template.supplies.materials,
    },
    heldLayer: 'tuong-ngoai',
    lostLayers: [],
  };
}

// ---------------------------------------------------------------------------
// Hư hại
// ---------------------------------------------------------------------------

export interface WallDamage {
  /** Điểm integrity thật sự đã trừ, sau khi chia cho bề dày. */
  applied: number;
  breached: boolean;
  towerFell: string;
  lines: string[];
}

/**
 * Bắn phá lớp đang giữ.
 *
 * Bề dày CHIA sức phá chứ không trừ nó: một bức tường dày gấp đôi không phải là
 * một bức tường chịu thêm mấy chục điểm, nó là một bức tường mà mọi cỗ máy đều
 * mất gấp đôi thời gian. Nếu để bề dày trừ thẳng thì một cỗ trebuchet đủ mạnh sẽ
 * xuyên qua mọi thứ như nhau, và bậc thành trì của Phần 12 mất hết ý nghĩa.
 */
export function damageWall(fort: Fortification, rng: Rng, raw: number): WallDamage {
  const out: WallDamage = { applied: 0, breached: false, towerFell: '', lines: [] };
  const wall = heldWall(fort);
  if (wall === null || raw <= 0) return out;

  const scale = 1 / (1 + wall.thickness * 0.18);
  const amount = raw * scale;

  // Một phần đạn rơi vào tháp chứ không vào mặt tường — và một cái tháp đổ là một
  // đoạn tường không còn ai bắn xuống được, nên nó đáng ghi riêng.
  const towers = wall.towers.filter((tower) => tower.integrity > 0);
  if (towers.length > 0 && rng.int(1, 100) <= 30) {
    const tower = rng.pick(towers);
    tower.integrity = Math.max(0, tower.integrity - amount);
    out.applied = amount;
    if (tower.integrity <= 0) {
      out.towerFell = tower.name;
      out.lines.push(`${tower.name} của ${wall.name} đổ xuống, kéo theo một khúc lan can.`);
    }
    return out;
  }

  wall.integrity = Math.max(0, wall.integrity - amount);
  out.applied = amount;
  if (wall.integrity <= 0 && !wall.breached) {
    wall.breached = true;
    out.breached = true;
    out.lines.push(`${wall.name} vỡ. Một lỗ thủng rộng bằng ba cỗ xe hiện ra giữa hai tháp.`);
  }
  return out;
}

export function damageGate(fort: Fortification, raw: number): { broken: boolean; lines: string[] } {
  const lines: string[] = [];
  if (fort.gatehouse.broken || raw <= 0) return { broken: false, lines };
  fort.gatehouse.integrity = Math.max(0, fort.gatehouse.integrity - raw);
  if (fort.gatehouse.integrity > 0) return { broken: false, lines };
  fort.gatehouse.broken = true;
  lines.push('Cánh cổng bật khỏi bản lề. Cầu treo nằm sấp xuống bùn.');
  return { broken: true, lines };
}

/** Đường hầm nổ dưới chân tường — một cú, không phải mấy tuần bắn. */
export function collapseByMine(fort: Fortification, rng: Rng): WallDamage {
  const mining = miningConfig();
  const wall = heldWall(fort);
  const out: WallDamage = { applied: 0, breached: false, towerFell: '', lines: [] };
  if (wall === null) return out;

  const towers = wall.towers.filter((tower) => tower.integrity > 0);
  if (towers.length > 0 && rng.int(1, 100) <= mining.collapseTowerChance) {
    const tower = rng.pick(towers);
    tower.integrity = 0;
    out.towerFell = tower.name;
    out.lines.push(`${tower.name} lún xuống rồi đổ sập vào trong — cả cái chân nó vừa bị đốt rỗng.`);
  }
  wall.integrity = Math.max(0, wall.integrity - mining.collapseIntegrity);
  out.applied = mining.collapseIntegrity;
  if (wall.integrity <= 0 && !wall.breached) {
    wall.breached = true;
    out.breached = true;
    out.lines.push(`${wall.name} sụp xuống thành một con dốc gạch vụn. Không ai phải bắc thang nữa.`);
  }
  return out;
}

export function repairWall(fort: Fortification, points: number): { repaired: number; materials: number } {
  const config = siegeConfig().repair;
  const wall = heldWall(fort);
  if (wall === null || points <= 0) return { repaired: 0, materials: 0 };

  const room = wall.maxIntegrity - wall.integrity;
  const affordable = Math.min(points, fort.supplies.materials / Math.max(0.01, config.materialsPerPoint));
  const repaired = Math.max(0, Math.min(room, affordable));
  wall.integrity += repaired;
  // Vá được tới đâu thì lỗ thủng khép lại tới đó — nhưng một bức tường đã vỡ một
  // lần thì cái sẹo ấy còn nằm trong `lostLayers` của cuộc vây hãm.
  if (wall.integrity > wall.maxIntegrity * 0.25) wall.breached = false;

  const materials = repaired * config.materialsPerPoint;
  fort.supplies.materials = Math.max(0, fort.supplies.materials - materials);
  return { repaired, materials };
}

// ---------------------------------------------------------------------------
// Lùi một lớp — xem chú thích đầu file
// ---------------------------------------------------------------------------

export interface FallBack {
  moved: boolean;
  from: HeldLayerId;
  to: HeldLayerId;
  /** Lương bỏ lại phía ngoài. */
  foodLost: number;
  lines: string[];
}

function nextLayer(fort: Fortification): HeldLayerId | null {
  if (fort.heldLayer === 'tuong-ngoai') return fort.innerWall === null ? 'thap-chinh' : 'tuong-trong';
  if (fort.heldLayer === 'tuong-trong') return 'thap-chinh';
  return null;
}

export function canFallBack(fort: Fortification): boolean {
  return nextLayer(fort) !== null;
}

export function fallBack(fort: Fortification): FallBack {
  const from = fort.heldLayer;
  const to = nextLayer(fort);
  if (to === null) {
    return { moved: false, from, to: from, foodLost: 0, lines: ['Không còn lớp nào để lùi vào nữa.'] };
  }

  const lines: string[] = [];
  let foodLost = 0;

  if (to === 'thap-chinh') {
    // Vào tháp chính thì chỉ còn đúng thứ đã chất sẵn trong đó.
    const kept = Math.min(fort.supplies.food, fort.keep.stores);
    foodLost = fort.supplies.food - kept;
    fort.supplies.food = kept;
    fort.bailey.area = Math.max(0.5, fort.bailey.area * 0.15);
    lines.push(
      `Tất cả rút vào tháp chính. Cửa hạ xuống sau lưng người cuối cùng, và bên ngoài còn nguyên ${Math.round(
        foodLost,
      )} phần lương không ai kịp mang theo.`,
    );
  } else {
    // Kho ngoài mất một phần lớn: người ta chỉ vác được thứ vác được, trong một đêm.
    foodLost = fort.supplies.food * 0.45;
    fort.supplies.food -= foodLost;
    fort.supplies.materials *= 0.5;
    fort.bailey.area = Math.max(1, fort.bailey.area * 0.45);
    lines.push(
      `Bên thủ bỏ ${HELD_LAYER_LABELS[from]} và lùi vào ${HELD_LAYER_LABELS[to]}. Kho ngoài cháy trong đêm — mất ${Math.round(
        foodLost,
      )} phần lương.`,
    );
  }

  fort.lostLayers.push(from);
  fort.heldLayer = to;
  fort.population = Math.round(fort.population * (to === 'thap-chinh' ? 0.25 : 0.8));
  lines.push(
    `Người còn lại chen chặt hơn: ${Math.round(defenceDensity(fort))} người trên mỗi mẫu đất còn giữ được.`,
  );
  return { moved: true, from, to, foodLost, lines };
}

/** Mật độ phòng thủ — người trên mỗi mẫu đất còn giữ. Càng lùi càng dày. */
export function defenceDensity(fort: Fortification): number {
  const area = Math.max(0.5, fort.bailey.area);
  return (garrisonMen(fort) + fort.population * 0.2) / area;
}

/** Bức tường đang giữ còn lành tới đâu, 0–1. Dùng cho UI và cho điều chỉnh. */
export function wallShare(fort: Fortification): number {
  const wall = heldWall(fort);
  if (wall === null) return fort.keep.integrity / Math.max(1, fort.keep.maxIntegrity);
  return wall.integrity / Math.max(1, wall.maxIntegrity);
}

/** Sơ đồ mặt cắt cho UI (mục 9): mỗi lớp một dòng, có integrity riêng. */
export interface LayerView {
  id: string;
  name: string;
  integrity: number;
  max: number;
  held: boolean;
  lost: boolean;
  note: string;
}

export function crossSection(fort: Fortification): LayerView[] {
  const views: LayerView[] = [];

  if (fort.moat !== null) {
    views.push({
      id: 'hao',
      name: fort.moat.wet ? `Hào nước rộng ${String(fort.moat.width)}m` : `Hào khô rộng ${String(fort.moat.width)}m`,
      integrity: Math.round((1 - fort.moat.filled) * 100),
      max: 100,
      held: fort.moat.filled < 1,
      lost: fort.moat.filled >= 1,
      note: fort.moat.filled >= 1 ? 'đã bị lấp' : `lấp được ${Math.round(fort.moat.filled * 100)}%`,
    });
  }

  const wallView = (wall: WallLayer, id: HeldLayerId): LayerView => ({
    id,
    name: wall.name,
    integrity: Math.round(wall.integrity),
    max: Math.round(wall.maxIntegrity),
    held: fort.heldLayer === id,
    lost: fort.lostLayers.includes(id),
    note: `cao ${String(wall.height)}m · dày ${String(wall.thickness)}m · ${
      wall.towers.filter((tower) => tower.integrity > 0).length
    }/${wall.towers.length} tháp còn đứng${wall.breached ? ' · ĐÃ VỠ' : ''}`,
  });

  views.push(wallView(fort.outerWall, 'tuong-ngoai'));
  views.push({
    id: 'cong',
    name: 'Nhà cổng',
    integrity: Math.round(fort.gatehouse.integrity),
    max: Math.round(fort.gatehouse.maxIntegrity),
    held: !fort.gatehouse.broken,
    lost: fort.gatehouse.broken,
    note: [
      fort.gatehouse.drawbridge ? 'cầu treo' : '',
      fort.gatehouse.portcullis ? 'cửa sắt' : '',
      fort.gatehouse.murderHoles ? 'lỗ châu mai' : '',
    ]
      .filter((part) => part !== '')
      .join(' · '),
  });
  if (fort.innerWall !== null) views.push(wallView(fort.innerWall, 'tuong-trong'));
  views.push({
    id: 'thap-chinh',
    name: 'Tháp chính',
    integrity: Math.round(fort.keep.integrity),
    max: Math.round(fort.keep.maxIntegrity),
    held: fort.heldLayer === 'thap-chinh',
    lost: false,
    note: `chứa được ${String(fort.keep.capacity)} người · kho ${String(Math.round(fort.keep.stores))} phần`,
  });

  return views;
}

export function cloneFortification(fort: Fortification): Fortification {
  const cloneWall = (wall: WallLayer): WallLayer => ({
    ...wall,
    towers: wall.towers.map((tower) => ({ ...tower })),
  });
  return {
    ...fort,
    moat: fort.moat === null ? null : { ...fort.moat },
    outerWall: cloneWall(fort.outerWall),
    gatehouse: { ...fort.gatehouse },
    bailey: { ...fort.bailey, buildings: [...fort.bailey.buildings] },
    innerWall: fort.innerWall === null ? null : cloneWall(fort.innerWall),
    keep: { ...fort.keep },
    garrison: fort.garrison.map((unit) => ({ ...unit })),
    supplies: { ...fort.supplies },
    lostLayers: [...fort.lostLayers],
  };
}

/** Bớt người của đội đồn trú, chia đều theo tỷ lệ. Trả về số người thật đã mất. */
export function killGarrison(fort: Fortification, men: number): number {
  const total = garrisonMen(fort);
  if (total <= 0 || men <= 0) return 0;
  const share = Math.min(1, men / total);
  let removed = 0;
  for (const unit of fort.garrison) {
    const loss = Math.min(unit.men, Math.round(unit.men * share));
    unit.men -= loss;
    removed += loss;
  }
  return removed;
}
