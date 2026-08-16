/**
 * ĐẶT CÔNG TRÌNH XUỐNG ĐẤT.
 *
 * File này thay `grid.ts` của bản cũ, và cái khác không phải là "chi tiết hơn"
 * mà là KHÁC LOẠI. Bản cũ hỏi "ô này trống không"; ở đây câu hỏi là "khoảnh đất
 * này chịu nổi công trình này không" — và nó có sáu vế, mỗi vế là một luật quy
 * hoạch có thật:
 *
 *  1. **Trong tầm với.** Ngoài bán kính quy hoạch là đất chưa khai phá; lãnh
 *     chúa một cái thôn không đi dựng xưởng cách nhà bốn cây số.
 *  2. **Không chồng, và có khoảng thở.** Hai khuôn viên chạm nhau đúng một ô
 *     vẫn là hai công trình không có lối đi ở giữa. Khoảng thở LÀ con đường.
 *  3. **Đất đỡ được.** Không ai xây trên mặt sông. Trừ những công trình sinh ra
 *     để làm đúng việc ấy — và chúng thì BẮT BUỘC phải đứng ở chỗ khó, nếu
 *     không chúng chỉ là một căn nhà đắt tiền.
 *  4. **Sát nước nếu nghề đòi thế.** Bến, cối xay nước, ruộng muối.
 *  5. **Trên mạch nếu là công trình khai thác.** Xưởng cưa giữa đồng trống
 *     không ra một khúc gỗ nào — và đó là hình học, không phải một con số phạt.
 *  6. **Bám tường nếu là công sự.** Tháp và cổng không đứng một mình giữa đồng.
 *
 * Mỗi lần từ chối đều trả về MỘT CÂU TIẾNG VIỆT. Người chơi bấm vào một chỗ và
 * thấy nút xám đi mà không có lý do thì sẽ đi hỏi ngoài game, và cả hệ quy hoạch
 * chỉ đáng chơi khi luật của nó hiện ra được.
 */

import {
  allTerrain,
  buildingOf,
  clearanceOf,
  footprintOf,
  hinterlandTilesFor,
  isWallBound,
  terrainMatches,
  terrainOf,
  tierOf,
  type Building,
} from './data';
import { generateField, terrainAt, terrainTally, terrainsUnder, waterNearby, type HoldingField } from './field';
import { bestNodeFor, nodeById, nodeYields, type ResourceNode } from './nodes';
import { CENTER_CELL, GRID_CELLS, KEEP_YARD_CELLS, cellsToMetres, inGrid, planningRadiusCells } from './scale';
import {
  connectorLanes,
  distanceToStreet,
  gatesOn,
  streetNetwork,
  type Bridge,
  type Gate,
  type Street,
  type StreetNetwork,
  type StreetStop,
} from './streets';
import {
  distanceToWall,
  enclosedArea,
  hasWallOfLeast,
  insideWall,
  outerWall,
  standingWalls,
  wallMaterialOf,
  wallPrerequisiteOf,
} from './walls';
import type { Cell, HinterlandTile, Holding, PlacedBuilding } from './types';

export class HoldingPlaceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HoldingPlaceError';
  }
}

// ---------------------------------------------------------------------------
// Mảnh đất của một thành trì
// ---------------------------------------------------------------------------

/**
 * Trường địa hình của một thành trì. Cache nằm trong `field.ts`, nên gọi hàm
 * này bao nhiêu lần cũng chỉ sinh một lần cho mỗi hạt giống.
 */
export function fieldOf(holding: Holding): HoldingField {
  return generateField(holding.id, {
    dominant: holding.dominant,
    coastal: holding.coastal,
    seed: holding.seed,
    hints: { river: holding.hint.river, sea: holding.hint.sea, mountain: holding.hint.mountain },
  });
}

/** Bán kính quy hoạch hiện tại, tính bằng ô. */
export function planningRadius(holding: Holding): number {
  return planningRadiusCells(tierOf(holding.tierId)?.rank ?? 1);
}

/**
 * MỌI CON ĐƯỜNG CỦA MỘT THÀNH TRÌ, gộp trong một lần gọi.
 *
 * Bốn thứ, và chúng đến từ bốn chỗ khác nhau — đó là lý do có hàm này thay vì
 * để màn hình tự ghép: quan lộ và ngõ vòng sinh từ hạt giống, ngõ nối sinh từ
 * danh sách công trình, tuyến người chơi cho phá thì lọc ra, còn cổng là giao
 * của đường với tường. Ghép sai thứ tự thì được một bản đồ có cổng dẫn vào một
 * con ngõ đã bị xoá.
 */
export function holdingStreets(holding: Holding): {
  network: StreetNetwork;
  /** Quan lộ, ngõ vòng và ngõ nối — đã bỏ những tuyến người chơi cho phá. */
  streets: Street[];
  bridges: Bridge[];
  gates: Gate[];
} {
  const network = streetNetwork(fieldOf(holding), planningRadius(holding));
  const razed = new Set(holding.streetsRazed);

  const trunk = [...network.highways, ...network.lanes].filter((street) => !razed.has(street.id));
  const stops: StreetStop[] = holding.buildings.map((placed) => ({
    id: placed.id,
    at: centreOf(buildingOf(placed.buildingId) ?? { size: [1, 1] } as Building, placed.at),
  }));
  const connectors = connectorLanes({ ...network, highways: trunk.filter((s) => s.kind !== 'ngo'), lanes: trunk.filter((s) => s.kind === 'ngo') }, stops)
    .filter((street) => !razed.has(street.id));

  const streets = [...trunk, ...connectors];
  // Cầu chỉ giữ lại nếu còn ít nhất một tuyến đang hiện chạy qua nó. Phá con
  // đường đi mà cây cầu vẫn đứng đó bắc qua hư không là chuyện bản đồ không
  // được phép kể.
  const bridges = network.bridges.filter((bridge) =>
    streets.some((street) => distanceToStreet(bridge.at, street.points) <= Math.max(10, bridge.span / 2)),
  );

  return { network, streets, bridges, gates: gatesOn(streets, holding.walls) };
}

/**
 * RUỘNG NGOÀI TƯỜNG, đếm lại từ mảnh đất thật.
 *
 * Thay cho mảng `hinterland` từng phải lưu trong save. Tổng số ô vẫn đúng bằng
 * `hinterlandPerTier` như trước — cân bằng sản lượng của cả Phần 12 đã hiệu
 * chỉnh theo con số ấy và không nên trôi đi trong một cuộc đại tu về KHÔNG GIAN.
 * Cái đổi là THÀNH PHẦN: một thành trì trên đá thật sự có ít đất tốt hơn một
 * thành trì giữa đồng, và trước đây điều đó chỉ đúng do may rủi lúc tung xúc xắc.
 */
export function hinterlandOf(holding: Holding): HinterlandTile[] {
  const rank = tierOf(holding.tierId)?.rank ?? 1;
  const total = hinterlandTilesFor(rank);
  return enforceYieldQuotas(terrainTally(fieldOf(holding), planningRadiusCells(rank), total), total);
}

/**
 * BỐN THỨ RUỘNG NGOÀI TƯỜNG PHẢI NHẢ RA ĐƯỢC.
 *
 * Hạn mức này có từ bản cũ (`MIN_YIELD_SHARE` trong `grid.ts`) và nó phải sống
 * sót, vì lý do sinh ra nó không hề đổi — chỉ có chỗ nó suýt chết là mới.
 *
 * Bảng đếm ở cấp 1 chỉ có TÁM ô. Chia tám ô theo tỉ lệ diện tích thật thì một
 * khu rừng chiếm 5% mảnh đất làm tròn thành số không, và cái thôn ấy vĩnh viễn
 * không có một khúc gỗ nào: nó không dựng nổi xưởng mộc (cần 30 gỗ), nên không
 * bao giờ có gỗ, nên không bao giờ dựng nổi xưởng mộc. `field.ts` đã bảo đảm có
 * RỪNG THẬT trên đất; chỗ này bảo đảm phép làm tròn không xoá mất nó.
 *
 * Lấy phần bù từ loại đất ĐÔNG NHẤT, nên tổng số ô không đổi và cân bằng sản
 * lượng của cả Phần 12 đứng yên.
 */
const MIN_YIELD_SHARE: Readonly<Record<string, number>> = {
  'luong-thuc': 0.5,
  go: 0.15,
  da: 0.1,
  // Sắt cũng là một vòng khoá: cối xay và lò rèn — hai công trình bắt buộc để
  // lên Trấn — đều đòi sắt, mà công trình duy nhất sinh ra sắt là cái mỏ, và mỏ
  // chỉ mở từ Trấn.
  sat: 0.06,
};

function enforceYieldQuotas(rows: HinterlandTile[], total: number): HinterlandTile[] {
  if (total <= 0) return rows;
  const out = rows.map((row) => ({ ...row }));
  const providers = (resourceId: string): string[] =>
    allTerrain()
      .filter((row) => (row.yields[resourceId] ?? 0) > 0)
      .map((row) => row.id);

  for (const [resourceId, share] of Object.entries(MIN_YIELD_SHARE)) {
    const ids = providers(resourceId);
    if (ids.length === 0) continue;
    const quota = Math.max(1, Math.ceil(total * share));
    const have = out.filter((row) => ids.includes(row.terrain)).reduce((sum, row) => sum + row.count, 0);
    let short = quota - have;
    if (short <= 0) continue;

    // Chỗ bù lấy từ loại đất đông nhất KHÔNG nằm trong nhóm đang thiếu — lấy từ
    // chính nhóm ấy là trò xoay vòng không thêm được ô nào.
    const donors = out
      .filter((row) => !ids.includes(row.terrain))
      .sort((a, b) => b.count - a.count);
    // Ưu tiên loại đất đã có mặt trên mảnh đất này; không có thì mượn loại nhẹ
    // nhất trong nhóm, vì thà một ô rừng đặt sai chỗ còn hơn một ván khoá chết.
    const target = out.find((row) => ids.includes(row.terrain))
      ?? { terrain: ids[0] ?? 'rung', count: 0 };
    if (!out.includes(target)) out.push(target);

    for (const donor of donors) {
      if (short <= 0) break;
      const taken = Math.min(short, Math.max(0, donor.count - 1));
      if (taken <= 0) continue;
      donor.count -= taken;
      target.count += taken;
      short -= taken;
    }
  }
  return out.filter((row) => row.count > 0);
}

// ---------------------------------------------------------------------------
// Hình học khuôn viên
// ---------------------------------------------------------------------------

/** Khuôn viên một công trình đã chiếm chỗ, kèm khoảng thở của nó. */
export interface PlacedRect {
  /** Id thực thể — công trình đã dựng hoặc dự án đang xây. */
  id: string;
  name: string;
  x: number;
  y: number;
  size: number;
  clearance: number;
}

export function rectOf(building: Building, at: Cell, id: string): PlacedRect {
  return {
    id, name: building.name,
    x: at.x, y: at.y,
    size: footprintOf(building),
    clearance: clearanceOf(building),
  };
}

/** Bốn góc của khuôn viên — cái `adjacency.ts` và UI cùng cần. */
export function cellsOf(building: Building, at: Cell): Cell[] {
  const size = footprintOf(building);
  if (size <= 0) return [];
  return [
    { x: at.x, y: at.y },
    { x: at.x + size - 1, y: at.y },
    { x: at.x, y: at.y + size - 1 },
    { x: at.x + size - 1, y: at.y + size - 1 },
  ];
}

/** Tâm khuôn viên. Mọi phép đo khoảng cách giữa hai công trình dùng con số này. */
export function centreOf(building: Building, at: Cell): Cell {
  const half = footprintOf(building) / 2;
  return { x: at.x + half, y: at.y + half };
}

function overlaps(ax: number, ay: number, aSize: number, bx: number, by: number, bSize: number): boolean {
  return ax < bx + bSize && bx < ax + aSize && ay < by + bSize && by < ay + aSize;
}

function tooClose(candidate: PlacedRect, taken: PlacedRect): boolean {
  return overlaps(
    candidate.x - candidate.clearance,
    candidate.y - candidate.clearance,
    candidate.size + candidate.clearance * 2,
    taken.x - taken.clearance,
    taken.y - taken.clearance,
    taken.size + taken.clearance * 2,
  );
}

/**
 * Mọi khuôn viên đang chiếm chỗ — công trình đã dựng VÀ dự án đang xây.
 *
 * Dự án phải có mặt ở đây, nếu không thì hai công trường mở cùng một chỗ và
 * người chơi chỉ phát hiện ra khi cái thứ hai xong và nuốt mất cái thứ nhất.
 */
export function occupiedRects(holding: Holding, excludeId = ''): PlacedRect[] {
  const out: PlacedRect[] = [];
  for (const placed of holding.buildings) {
    if (placed.id === excludeId) continue;
    const building = buildingOf(placed.buildingId);
    if (building === null) continue;
    out.push(rectOf(building, placed.at, placed.id));
  }
  for (const project of holding.projects) {
    if (project.id === excludeId) continue;
    const building = buildingOf(project.buildingId);
    if (building === null) continue;
    out.push(rectOf(building, project.at, project.id));
  }
  return out;
}

/** Công trình nằm dưới một ô — dùng khi người chơi bấm lên bản đồ. */
export function buildingAt(holding: Holding, x: number, y: number): PlacedBuilding | null {
  for (const placed of holding.buildings) {
    const building = buildingOf(placed.buildingId);
    if (building === null) continue;
    const size = footprintOf(building);
    if (x >= placed.at.x && x < placed.at.x + size && y >= placed.at.y && y < placed.at.y + size) return placed;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Tường
// ---------------------------------------------------------------------------

/** Thành trì đã có tường chưa — tháp, cổng, hào đều đòi có tường trước. */
export function hasWall(holding: Holding): boolean {
  return standingWalls(holding.walls).length > 0;
}

/** Công sự bám tường phải nằm trong chừng này ô kể từ mặt tường. */
export const WALL_BOUND_CELLS = 16;

// ---------------------------------------------------------------------------
// Kiểm tra trước khi đặt
// ---------------------------------------------------------------------------

export interface PlacementCheck {
  ok: boolean;
  /** Câu tiếng Việt đọc được, để UI hiện thẳng lên. Rỗng khi hợp lệ. */
  reason: string;
  /** Địa hình dưới khuôn viên — UI dùng để nói rõ vì sao chỗ này không được. */
  terrains: string[];
  /** Vùng tài nguyên công trình sẽ bám vào. */
  node: ResourceNode | null;
}

const OK: PlacementCheck = { ok: true, reason: '', terrains: [], node: null };

function no(reason: string, terrains: string[] = []): PlacementCheck {
  return { ok: false, reason, terrains, node: null };
}

export interface PlacementOptions {
  /** Chủng tộc của người chơi, cộng vào chủng tộc trong thành khi xét thợ riêng. */
  playerRaces?: readonly string[];
  /** Bỏ qua một thực thể khi xét chồng lấn — dùng khi dời một công trình sẵn có. */
  excludeId?: string;
  /** Bỏ qua luật giấy phép và tiên quyết — dùng khi tự bố trí lúc tạo thành trì. */
  seeding?: boolean;
  /**
   * Bảng khuôn viên đã chiếm chỗ, dựng sẵn.
   *
   * Không phải tối ưu vặt: `findSpot` hỏi `canPlace` ở hàng trăm chỗ, và nếu mỗi
   * lần hỏi lại dựng lại danh sách sáu chục khuôn viên thì một lần tìm chỗ là
   * hàng vạn phép. Bài test nuôi thành gọi `findSpot` vài chục nghìn lần, nên
   * chỗ này là chênh lệch giữa mười giây và mười phút.
   */
  taken?: readonly PlacedRect[];
}

/**
 * Đặt được công trình này ở đây không. `at` là góc TÂY-BẮC của khuôn viên.
 */
export function canPlace(holding: Holding, buildingId: string, at: Cell, options: PlacementOptions = {}): PlacementCheck {
  const building = buildingOf(buildingId);
  if (building === null) return no(`không có công trình "${buildingId}"`);

  const tier = tierOf(holding.tierId);
  if (tier === null) return no(`thành trì đang ở cấp lạ: ${holding.tierId}`);
  if (building.minTier > tier.rank) {
    return no(`${building.name} chỉ xây được từ cấp ${String(building.minTier)}, ${tier.name} chưa tới`);
  }

  if (building.races.length > 0) {
    const inTown = new Set([...holding.population.races.map((row) => row.raceId), ...(options.playerRaces ?? [])]);
    if (!building.races.some((raceId) => inTown.has(raceId))) {
      return no(`${building.name} cần thợ của chủng tộc riêng, trong thành không có ai`);
    }
  }

  if (options.seeding !== true) {
    for (const required of building.requires) {
      // Vài tiên quyết trong data trỏ tới công trình vành đai của bản cũ
      // (`bld_thap-chinh` đòi có tường đá trước). Chúng giờ là TUYẾN tường, và
      // câu hỏi đúng không còn là "có công trình ấy chưa" mà là "đã có một vòng
      // tường đủ tốt chưa" — xem `walls.ts`.
      const material = wallPrerequisiteOf(required);
      if (material !== null) {
        if (!hasWallOfLeast(holding.walls, material)) {
          return no(`${building.name} cần một vòng ${wallMaterialOf(material)?.name ?? material} khép kín trước`);
        }
        continue;
      }
      if (!holding.buildings.some((row) => row.buildingId === required)) {
        return no(`${building.name} cần có ${buildingOf(required)?.name ?? required} trước`);
      }
    }
  }

  const size = footprintOf(building);
  if (size <= 0) return no(`${building.name} không có khuôn viên — không đặt lên đất được`);

  // 1. trong lưới và trong tầm với
  if (!inGrid(at.x, at.y) || !inGrid(at.x + size - 1, at.y + size - 1)) {
    return no('khuôn viên lọt ra ngoài mảnh đất của thành trì');
  }
  const radius = planningRadius(holding);
  const centre = centreOf(building, at);
  const fromCentre = Math.hypot(centre.x - CENTER_CELL, centre.y - CENTER_CELL);
  if (fromCentre + size / 2 > radius) {
    return no(
      `ngoài vùng quy hoạch — ${tier.name} với tay tới ${String(Math.round(cellsToMetres(radius)))} thước quanh toà chính`,
    );
  }

  // 2. chồng lấn và khoảng thở
  const candidate = rectOf(building, at, '__moi__');
  const exclude = options.excludeId ?? '';
  const taken = options.taken ?? occupiedRects(holding, exclude);
  for (const rect of taken) {
    if (rect.id === exclude) continue;
    if (tooClose(candidate, rect)) {
      return no(`chồng lên hoặc quá sát ${rect.name} — phải chừa lối đi và khoảng trống`);
    }
  }

  // 3. thềm đất bên dưới
  const field = fieldOf(holding);
  const terrains = terrainsUnder(field, at.x, at.y, size);
  const allowed = new Set(building.overrideTerrain);

  for (const id of terrains) {
    if (allowed.has(id)) continue;
    const terrain = terrainOf(id);
    if (terrain === null) return no(`khoảnh đất có địa hình lạ: ${id}`, terrains);
    if (!terrain.buildable) return no(`không đặt được gì lên ${terrain.name}`, terrains);
    if (building.terrain.forbid.some((name) => terrainMatches(id, name))) {
      return no(`${building.name} không đặt được trên ${terrain.name}`, terrains);
    }
  }

  // Công trình đặc biệt PHẢI dùng đúng chỗ khó. Dựng nhà sàn giữa đồng bằng chỉ
  // là một căn nhà đắt tiền vô nghĩa, và cho phép nó là bỏ mất cả lý do nó tồn tại.
  if (building.overrideTerrain.length > 0 && !terrains.some((id) => allowed.has(id))) {
    const wanted = building.overrideTerrain.map((id) => terrainOf(id)?.name ?? id).join(' hoặc ');
    return no(`${building.name} chỉ có nghĩa khi dựng trên ${wanted}`, terrains);
  }

  if (building.terrain.require.length > 0) {
    const met = terrains.some((id) => building.terrain.require.some((name) => terrainMatches(id, name)));
    if (!met) {
      const wanted = building.terrain.require.map((name) => terrainOf(name)?.name ?? name).join(' hoặc ');
      return no(`${building.name} phải đặt trên ${wanted}`, terrains);
    }
  }

  // 4. sát nước
  if (building.nearWater && !waterNearby(field, at.x, at.y, size, 30)) {
    return no(`${building.name} phải dựng sát mép nước`, terrains);
  }

  // 5. bám tường
  if (isWallBound(building)) {
    if (!hasWall(holding)) return no(`${building.name} phải dựa vào tường, mà thành trì chưa có tường nào`, terrains);
    if (distanceToWall(standingWalls(holding.walls), centre.x, centre.y) > WALL_BOUND_CELLS + size / 2) {
      return no(`${building.name} phải dựng bám vào một tuyến tường`, terrains);
    }
  } else if (building.requiresWall && !hasWall(holding)) {
    return no(`${building.name} cần có tường trước`, terrains);
  }

  // 6. trên mạch
  if (building.requiresNode.length > 0) {
    const node = bestNodeFor(holding.nodes, building.requiresNode, at.x, at.y, size);
    if (node === null) {
      const wanted = building.requiresNode.join(' / ');
      return no(`${building.name} phải nằm trong vùng có ${wanted} — chỗ này không có mạch nào còn chỗ`, terrains);
    }
    return { ok: true, reason: '', terrains, node };
  }

  return { ...OK, terrains };
}

/**
 * Tìm chỗ hợp lệ GẦN TOÀ CHÍNH NHẤT — quét theo vòng tròn loang dần ra.
 *
 * Tất định theo `salt`, nên bố cục một thành trì dựng sẵn không đổi mỗi lần mở
 * lại ván. Công trình khai thác thì không quét vòng tròn: nó đi thẳng tới các
 * mạch đã biết, giàu trước nghèo sau — quét vòng tròn để tìm một cái mỏ là cách
 * chậm nhất có thể nghĩ ra, và thường là cách không tìm thấy.
 */
export function findSpot(holding: Holding, buildingId: string, salt = 0, options: PlacementOptions = {}): Cell | null {
  const building = buildingOf(buildingId);
  if (building === null) return null;
  const size = footprintOf(building);
  if (size <= 0) return null;
  const radius = planningRadius(holding);
  // Dựng bảng khuôn viên MỘT LẦN cho cả lần tìm — xem chú thích của `taken`.
  const scan: PlacementOptions = { ...options, taken: options.taken ?? occupiedRects(holding, options.excludeId ?? '') };

  if (building.requiresNode.length > 0) {
    const candidates = holding.nodes
      .filter((node) => node.grade > 0 && building.requiresNode.some((id) => nodeYields(node, id) > 0))
      .sort((a, b) => b.grade - a.grade);
    for (const node of candidates) {
      const at = { x: Math.round(node.at.x - size / 2), y: Math.round(node.at.y - size / 2) };
      if (canPlace(holding, buildingId, at, scan).ok) return at;
    }
    return null;
  }

  const step = Math.max(5, Math.round(size / 2));
  const start = Math.max(size, KEEP_YARD_CELLS + clearanceOf(building));
  for (let ring = start; ring <= radius; ring += step) {
    const slots = Math.max(8, Math.round((2 * Math.PI * ring) / step));
    for (let index = 0; index < slots; index++) {
      const angle = ((index + (salt % slots)) / slots) * Math.PI * 2;
      const at = {
        x: Math.round(CENTER_CELL + Math.cos(angle) * ring - size / 2),
        y: Math.round(CENTER_CELL + Math.sin(angle) * ring - size / 2),
      };
      if (canPlace(holding, buildingId, at, scan).ok) return at;
    }
  }
  return null;
}

/**
 * Còn chỗ cho công trình này không.
 *
 * Hỏi bằng `findSpot` chứ không bằng `placementOptions(...).length > 0`, và
 * khác biệt ấy không nhỏ: `findSpot` dừng ở chỗ hợp lệ ĐẦU TIÊN, còn
 * `placementOptions` quét kín cả vùng quy hoạch. Ở cấp Đại thành vùng ấy là hơn
 * hai vạn điểm lấy mẫu, và bài test nuôi thành hỏi câu này vài chục nghìn lần.
 */
export function hasRoomFor(holding: Holding, buildingId: string, options: PlacementOptions = {}): boolean {
  return findSpot(holding, buildingId, 0, options) !== null;
}

/**
 * Mọi chỗ đặt được, lấy mẫu thưa để UI tô sáng.
 *
 * Quét từng ô một trên một mảnh đất 1 200² là 1,44 triệu phép kiểm cho MỘT công
 * trình — nên ở đây quét theo bước bằng nửa khuôn viên. Kết quả là một tấm lưới
 * gợi ý, không phải danh sách đầy đủ; người chơi vẫn đặt được vào mọi ô hợp lệ
 * vì `canPlace` mới là trọng tài.
 */
export function placementOptions(holding: Holding, buildingId: string, options: PlacementOptions = {}): Cell[] {
  const building = buildingOf(buildingId);
  if (building === null) return [];
  const size = footprintOf(building);
  if (size <= 0) return [];

  const radius = planningRadius(holding);
  const step = Math.max(6, Math.round(size / 2));
  const scan: PlacementOptions = { ...options, taken: options.taken ?? occupiedRects(holding, options.excludeId ?? '') };
  const out: Cell[] = [];

  for (let y = CENTER_CELL - radius; y <= CENTER_CELL + radius; y += step) {
    for (let x = CENTER_CELL - radius; x <= CENTER_CELL + radius; x += step) {
      const at = { x: Math.round(x), y: Math.round(y) };
      if (canPlace(holding, buildingId, at, scan).ok) out.push(at);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Bố cục và phòng thủ
// ---------------------------------------------------------------------------

/** Diện tích còn trống trong vùng quy hoạch, tính bằng ô². */
export function freeArea(holding: Holding): number {
  const radius = planningRadius(holding);
  const total = Math.PI * radius * radius;
  let used = 0;
  for (const rect of occupiedRects(holding)) {
    const span = rect.size + rect.clearance * 2;
    used += span * span;
  }
  return Math.max(0, total - used);
}

/**
 * ĐƯỜNG ĐI TRONG THÀNH VÀ CHỖ THẮT CỔ CHAI (mục 4, câu cuối).
 *
 * Phần 11 mục 6 đánh tổng công theo lớp, và `frontage` của mỗi lớp là số đợt qua
 * được cùng lúc. Một thành xây kín mít thì quân vào được rồi vẫn phải chen qua
 * mấy con hẻm, nên bố cục CHẶT là một lợi thế phòng thủ có thật.
 *
 * Cái khác so với bản cũ: đo trong lòng TƯỜNG NGOÀI, không đo trên cả lưới. Đó
 * mới là chỗ quân địch phải chen — đất trống ngoài tường thì rộng bao nhiêu cũng
 * chẳng cản được ai, và tính nó vào là thưởng cho người chơi vì có nhiều ruộng.
 */
export function chokeFactor(holding: Holding): number {
  const wall = outerWall(holding.walls);
  const enclosed = wall === null ? Math.PI * planningRadius(holding) ** 2 : enclosedArea(wall.points);
  if (enclosed <= 0) return 1;

  let built = 0;
  for (const rect of occupiedRects(holding)) {
    const centre = { x: rect.x + rect.size / 2, y: rect.y + rect.size / 2 };
    if (wall !== null && !insideWall(wall, centre.x, centre.y)) continue;
    const span = rect.size + rect.clearance;
    built += span * span;
  }

  const open = Math.max(0, 1 - built / enclosed);
  // 1,0 khi trong tường trống trơn, xuống 0,55 khi kín đặc.
  return 0.55 + 0.45 * Math.min(1, open / 0.45);
}

/** Diện tích trong lòng tường ngoài, quy ra km² — con số UI hiện cho người chơi. */
export function walledAreaKm2(holding: Holding): number {
  const wall = outerWall(holding.walls);
  if (wall === null) return 0;
  const cells = enclosedArea(wall.points);
  return (cells * 25) / 1_000_000;
}

// ---------------------------------------------------------------------------
// Gắn mạch
// ---------------------------------------------------------------------------

/** Vùng tài nguyên một công trình đang bám. `null` là không bám vùng nào. */
export function nodeOfBuilding(holding: Holding, placed: PlacedBuilding): ResourceNode | null {
  return nodeById(holding.nodes, placed.nodeId);
}

/**
 * Địa hình ngay dưới tâm một ô — dùng cho tooltip và cho `adjacency.ts`.
 */
export function terrainAtCell(holding: Holding, cell: Cell): string {
  return terrainAt(fieldOf(holding), cell.x, cell.y);
}

/** Ô có nằm trong vùng quy hoạch không. */
export function inPlanningArea(holding: Holding, cell: Cell): boolean {
  return Math.hypot(cell.x - CENTER_CELL, cell.y - CENTER_CELL) <= planningRadius(holding);
}

export { CENTER_CELL, GRID_CELLS };
