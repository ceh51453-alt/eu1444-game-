/**
 * TỰ BỐ TRÍ VÀ SỬA BỐ CỤC.
 *
 * Hai việc, một lối nghĩ: đặt công trình vào chỗ hợp lệ gần toà chính nhất.
 *
 * `layoutHolding` dùng khi thành trì đã có sẵn từ đầu ván — quý tộc xuất thân
 * không bắt đầu với một bãi đất trống, và bốn con đường của mục 2 sẽ chỉ là
 * trang trí nếu ba trong bốn đều bắt đầu bằng cùng một bãi đất ấy.
 *
 * `repairLayout` dùng khi nạp save cũ, và nó là lý do cuộc đại tu này không vứt
 * đi ván chơi của ai. Save cũ có công trình đứng theo lưới 12×12; hệ toạ độ mới
 * dịch chúng ra một mảnh đất 1 200 ô, và ở đó có cái rơi xuống sông, có cái
 * chồng lên nhau, có cái lọt ra ngoài tầm với. Hàm này đẩy từng cái tới ô hợp lệ
 * gần nhất, theo một thứ tự có chủ ý.
 *
 * **Idempotent.** Chạy lại lần thứ hai không đổi gì. Đó không phải một tính chất
 * đẹp đẽ mà là một yêu cầu: hàm này chạy mỗi lần mở bản đồ thành trì, và một
 * hàm dời công trình mỗi lần chạy sẽ làm cả thành trì trôi đi trong mười lượt.
 */

import { allTiers, buildingOf, footprintOf, isWallBound, tierOf } from './data';
import { bestNodeFor, bindNode, ensureNodes, nodeCapacity } from './nodes';
import { canPlace, centreOf, fieldOf, findSpot, occupiedRects, planningRadius, rectOf, type PlacedRect } from './place';
import { CENTER_CELL } from './scale';
import { assignLayers } from './walls';
import type { Cell, Holding, PlacedBuilding } from './types';

/** Một dòng "dựng sẵn n cái loại X" khi tạo một thành trì đã có người ở. */
export interface LayoutItem {
  buildingId: string;
  count: number;
  /** Vị trí ghim sẵn cho công trình trọng yếu. Không hợp lệ thì tự tìm chỗ khác. */
  at?: Cell;
  /** Độ nguyên vẹn ban đầu — thành đánh chiếm được thì công trình đã hư hại. */
  integrity?: number;
  quality?: number;
}

/**
 * THỨ TỰ ĐẶT LÀ MỘT QUYẾT ĐỊNH THIẾT KẾ.
 *
 * Toà chính đứng giữa nền thành trước; rồi tới công trình bám tường (chúng chỉ
 * có một tuyến để bám, nên chỗ của chúng hẹp nhất); rồi tới công trình khai
 * thác (chúng phải đứng trên mạch, và mạch thì nằm đâu là nằm đó); sau cùng mới
 * tới phần còn lại, thứ có cả vùng quy hoạch để chọn.
 *
 * Đảo thứ tự này lại thì mấy cái nhà ở sẽ chiếm hết chỗ tốt quanh mạch sắt, và
 * cái mỏ — thứ duy nhất không dời đi đâu được — không còn chỗ đứng.
 */
function placementRank(buildingId: string): number {
  const building = buildingOf(buildingId);
  if (building === null) return 9;
  if (building.id === 'bld_thap-chinh' || building.id === 'bld_sanh-lanh-chua') return 0;
  if (isWallBound(building)) return 1;
  if (building.requiresNode.length > 0) return 2;
  return 3 + Math.max(0, 3 - Math.round(footprintOf(building) / 8));
}

let counter = 0;

function entityId(buildingId: string): string {
  counter += 1;
  return `${buildingId.replace('bld_', 'b_')}#${String(counter)}`;
}

/**
 * Dựng sẵn một bố cục. MUTATE `holding.buildings` và `holding.nodes`.
 *
 * Loại nào không tìm được chỗ thì BỎ QUA, không nhét bừa lên vách đá. Một cái
 * nông trại ở một thành trì toàn đá là một cái nông trại không nên tồn tại, và
 * đặt nó vào bằng mọi giá chỉ tạo ra một công trình sản lượng bằng không mà
 * người chơi phải trả phí duy trì trọn đời.
 */
export function layoutHolding(holding: Holding, plan: readonly LayoutItem[], turn = 0): Holding {
  holding.nodes = ensureNodes(fieldOf(holding), holding.nodes, holding.walls);

  const ordered = [...plan].sort((a, b) => placementRank(a.buildingId) - placementRank(b.buildingId));
  let salt = 7;

  for (const item of ordered) {
    const building = buildingOf(item.buildingId);
    if (building === null) continue;

    for (let index = 0; index < item.count; index++) {
      const size = footprintOf(building);
      let at: Cell | null = null;

      // Toà chính ngự giữa nền thành. Không đi tìm chỗ, không thương lượng —
      // cả `KEEP_YARD_CELLS` của `scale.ts` tồn tại để chỗ này luôn trống.
      if (placementRank(item.buildingId) === 0 && index === 0) {
        at = { x: Math.round(CENTER_CELL - size / 2), y: Math.round(CENTER_CELL - size / 2) };
      } else if (item.at !== undefined && index === 0 && canPlace(holding, item.buildingId, item.at, { seeding: true }).ok) {
        at = item.at;
      } else {
        at = findSpot(holding, item.buildingId, (salt += 11), { seeding: true });
      }
      if (at === null) continue;

      const check = canPlace(holding, item.buildingId, at, { seeding: true });
      const placed: PlacedBuilding = {
        id: entityId(item.buildingId),
        buildingId: item.buildingId,
        at,
        integrity: item.integrity ?? 100,
        quality: item.quality ?? 1,
        decayMultiplier: 1,
        customName: '',
        builtOnTurn: turn,
        maintained: true,
        nodeId: check.node?.id ?? '',
      };
      holding.buildings.push(placed);
      if (check.node !== null) bindNode(holding.nodes, placed.id, check.node.id);
    }
  }

  return holding;
}

// ---------------------------------------------------------------------------
// Sửa bố cục
// ---------------------------------------------------------------------------

export interface RepairReport {
  /** Số công trình phải dời chỗ. */
  moved: number;
  /** Số công trình không còn chỗ hợp lệ nào — vẫn giữ nguyên, UI vẫn vẽ được. */
  stranded: number;
  /** Số ràng buộc công trình ↔ mạch được dựng lại. */
  rebound: number;
}

/**
 * Đưa mọi công trình về chỗ hợp lệ. MUTATE `holding`.
 *
 * Công trình nào ĐANG đứng ở chỗ hợp lệ thì không động tới, và đó là chỗ tính
 * idempotent nằm: lần chạy thứ hai không tìm thấy gì để sửa nên không sửa gì.
 */
export function repairLayout(holding: Holding): RepairReport {
  const field = fieldOf(holding);
  holding.nodes = ensureNodes(field, holding.nodes, holding.walls);
  assignLayers(holding.walls);

  const report: RepairReport = { moved: 0, stranded: 0, rebound: 0 };

  // Xếp lại thứ tự trước khi dọn: cái khó chỗ nhất được chọn trước, để nó không
  // bị một cái nhà kho — thứ đặt đâu cũng được — chiếm mất chỗ duy nhất của nó.
  const ordered = [...holding.buildings].sort(
    (a, b) => placementRank(a.buildingId) - placementRank(b.buildingId),
  );

  const settled: PlacedRect[] = [];
  const kept: PlacedBuilding[] = [];

  for (const placed of ordered) {
    const building = buildingOf(placed.buildingId);
    if (building === null) {
      kept.push(placed);
      continue;
    }

    // Toà chính về đúng tâm, mọi lần. Nó là gốc toạ độ của cả thành trì.
    if (placementRank(placed.buildingId) === 0) {
      const size = footprintOf(building);
      const home = { x: Math.round(CENTER_CELL - size / 2), y: Math.round(CENTER_CELL - size / 2) };
      if (placed.at.x !== home.x || placed.at.y !== home.y) {
        placed.at = home;
        report.moved += 1;
      }
      settled.push(rectOf(building, placed.at, placed.id));
      kept.push(placed);
      continue;
    }

    // `probe` là một bản sao thành trì chỉ chứa những công trình ĐÃ dọn xong,
    // nên `canPlace` xét chồng lấn với đúng bố cục mới chứ không phải bố cục cũ.
    const probe: Holding = { ...holding, buildings: kept, projects: [] };
    if (canPlace(probe, placed.buildingId, placed.at, { seeding: true, excludeId: placed.id }).ok) {
      settled.push(rectOf(building, placed.at, placed.id));
      kept.push(placed);
      continue;
    }

    const spot = findSpot(probe, placed.buildingId, placed.id.length * 13, { seeding: true, excludeId: placed.id });
    if (spot === null) {
      report.stranded += 1;
      kept.push(placed);
      continue;
    }
    placed.at = spot;
    report.moved += 1;
    settled.push(rectOf(building, spot, placed.id));
    kept.push(placed);
  }

  holding.buildings = kept;
  report.rebound = rebindNodes(holding);
  return report;
}

/**
 * Dựng lại ràng buộc công trình ↔ mạch TỪ VỊ TRÍ THẬT.
 *
 * Sau khi dọn bố cục, một xưởng cưa có thể đã rời khỏi khu rừng nó từng khai
 * thác, và một mạch có thể đã bị tuyến tường mới đẩy đi chỗ khác. Nếu không
 * dựng lại thì `nodeId` trỏ vào một vùng không còn nằm dưới công trình, và UI
 * sẽ chỉ vào một khu rừng cách đó nửa cây số.
 */
function rebindNodes(holding: Holding): number {
  let rebound = 0;
  for (const node of holding.nodes) node.workedBy = [];

  for (const placed of holding.buildings) {
    const building = buildingOf(placed.buildingId);
    if (building === null || building.requiresNode.length === 0) {
      if (placed.nodeId !== '') {
        placed.nodeId = '';
        rebound += 1;
      }
      continue;
    }
    const node = bestNodeFor(holding.nodes, building.requiresNode, placed.at.x, placed.at.y, footprintOf(building));
    const nextId = node?.id ?? '';
    if (placed.nodeId !== nextId) {
      placed.nodeId = nextId;
      rebound += 1;
    }
    if (node !== null && node.workedBy.length < nodeCapacity(node)) node.workedBy.push(placed.id);
  }
  return rebound;
}

// ---------------------------------------------------------------------------
// Bố cục khởi đầu theo cấp
// ---------------------------------------------------------------------------

/**
 * Bố cục một thành trì ĐÃ CÓ NGƯỜI Ở, dựng theo cấp của nó.
 *
 * Lấy thẳng `highlights` của từng cấp trong `data/settlement-tiers.json` cộng
 * dồn từ cấp 1 lên: một cái Thành có đủ những gì một cái Trấn có, cộng phần của
 * riêng nó. Danh sách ấy vốn là "công trình tiêu biểu của cấp này", nên nó cũng
 * đúng là danh sách những thứ một thành trì cấp ấy nhất định phải có sẵn.
 */
export function startingLayout(tierId: string): LayoutItem[] {
  const tier = tierOf(tierId);
  if (tier === null) return [];

  const items: LayoutItem[] = [];
  const seen = new Set<string>();
  for (const level of allTiers()) {
    if (level.rank > tier.rank) continue;
    for (const id of level.highlights) {
      if (seen.has(id)) continue;
      seen.add(id);
      items.push({ buildingId: id, count: 1 });
    }
  }
  // Nhà ở nhân theo cấp: một đại thành tám nghìn dân không sống trong ba dãy nhà.
  items.push({ buildingId: 'bld_nha-go', count: Math.max(1, tier.rank) });
  return items;
}

/** Dời một công trình đã dựng sang chỗ khác. Trả về lý do nếu không được. */
export function relocate(holding: Holding, entityId: string, to: Cell): string {
  const placed = holding.buildings.find((row) => row.id === entityId);
  if (placed === undefined) return 'không có công trình nào mang id ấy';
  const check = canPlace(holding, placed.buildingId, to, { excludeId: entityId });
  if (!check.ok) return check.reason;
  placed.at = to;
  placed.nodeId = check.node?.id ?? '';
  rebindNodes(holding);
  return '';
}

/** Ô mà một công trình đang đứng, dùng cho UI và cho test. */
export function centreOfPlaced(placed: PlacedBuilding): Cell | null {
  const building = buildingOf(placed.buildingId);
  if (building === null) return null;
  return centreOf(building, placed.at);
}

/** Số công trình đang chiếm chỗ trong vùng quy hoạch. */
export function builtCount(holding: Holding): number {
  return occupiedRects(holding).length;
}

/** Bán kính quy hoạch hiện tại — tái xuất để `layout` là một cửa đủ dùng. */
export { planningRadius };
