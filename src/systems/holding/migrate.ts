/**
 * NÂNG SAVE CŨ LÊN MÔ HÌNH KHÔNG GIAN MỚI.
 *
 * Phần 0 mục 4 nói thẳng: một save cũ KHÔNG BAO GIỜ bị vứt đi. Cuộc đại tu này
 * đổi hẳn cách thành trì chiếm chỗ trong không gian, nên nó là phép thử nặng
 * nhất mà lời hứa ấy từng phải chịu — và đây là chỗ trả lời.
 *
 * BỐN VIỆC, theo đúng thứ tự:
 *
 *  1. **Gieo hạt giống.** Save cũ không có `seed`; suy từ id thành trì, nên cùng
 *     một thành trì luôn mở ra cùng một mảnh đất, ván nào cũng vậy.
 *  2. **Suy địa hình lớn từ bản đồ thế giới.** `data/world-map.json` đã khai
 *     mỗi nút là đồi, là đầm hay là ven biển từ trước cuộc đại tu này. Một thành
 *     trì tên `hold_venice` mở lại phải thấy nước, không phải một quả đồi ngẫu
 *     nhiên — dữ kiện ấy vốn đã nằm trong repo, chỉ là chưa ai hỏi tới.
 *  3. **Dịch toạ độ công trình.** Lưới cũ 4×4 tới 16×16 được trải ra kín vùng
 *     quy hoạch. Phép dịch này KHÔNG chính xác và không cần chính xác: nó chỉ
 *     đưa mọi thứ về đúng khu vực, `repairLayout` mới là chỗ dọn.
 *  4. **Đổi công trình vành đai thành tuyến tường.** Ai từng xây `bld_tuong-da`
 *     thì được một vòng tường đá khép kín quanh vùng quy hoạch — đúng bằng cái
 *     bức tường ấy vốn đại diện. Không ai mất bức tường mình đã trả tiền.
 *
 * Rồi `repairLayout` chạy: cái nào rơi xuống sông, chồng lên nhau hay lọt ra
 * ngoài tầm với thì được đẩy tới ô hợp lệ gần nhất.
 */

import worldMap from '@data/world-map.json';
import { tierOf } from './data';
import { seedFromId } from './field';
import { repairLayout } from './layout';
import { ensureNodes } from './nodes';
import { fieldOf } from './place';
import { CENTER_CELL, legacyCellToNew, planningRadiusCells } from './scale';
import { assignLayers, planWall, wallMaterialOf, type WallLine, type WallPoint } from './walls';
import type { Holding } from './types';

/**
 * Công trình vành đai của bản cũ → vật liệu tuyến tường.
 *
 * `bld_lo-chau-mai` không có mặt ở đây và đó là chủ ý: lỗ châu mai chưa bao giờ
 * là một bức tường, nó là một thứ gắn LÊN tường. Nó vẫn là công trình, chỉ đổi
 * từ "vành đai" sang "bám tường".
 */
const LEGACY_WALL_BUILDINGS: Readonly<Record<string, { materialId: string; layer: 'ngoai' | 'trong' }>> = {
  'bld_rao-go': { materialId: 'rao-go', layer: 'ngoai' },
  'bld_tuong-go': { materialId: 'tuong-go', layer: 'ngoai' },
  'bld_tuong-da': { materialId: 'tuong-da', layer: 'ngoai' },
  'bld_tuong-trong': { materialId: 'tuong-da', layer: 'trong' },
};

interface WorldNode {
  id: string;
  terrain: string;
  x: number;
  y: number;
}

let worldIndex: Map<string, WorldNode> | null = null;

function worldNodeOf(holdingId: string): WorldNode | null {
  if (worldIndex === null) {
    worldIndex = new Map((worldMap.nodes as WorldNode[]).map((node) => [node.id, node]));
  }
  return worldIndex.get(holdingId) ?? null;
}

/** Nút bản đồ thế giới khai `bien` hoặc `song` thì thành trì ấy có mặt nước. */
function coastalFrom(terrain: string): boolean {
  return terrain === 'bien';
}

// ---------------------------------------------------------------------------
// Một thành trì
// ---------------------------------------------------------------------------

interface LegacyHolding {
  id?: unknown;
  gridSize?: unknown;
  tiles?: unknown;
  hinterland?: unknown;
  buildings?: unknown;
  projects?: unknown;
  tierId?: unknown;
  [key: string]: unknown;
}

interface LegacyPlaced {
  id?: unknown;
  buildingId?: unknown;
  at?: { x?: unknown; y?: unknown };
  [key: string]: unknown;
}

function numberAt(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/**
 * Vẽ một vòng tường khép kín quanh vùng quy hoạch — bức tường mà công trình
 * vành đai của bản cũ vẫn luôn đại diện, giờ có hình dạng thật.
 *
 * Vòng ôm sát hơn bán kính quy hoạch một chút (0,62) chứ không ôm trọn: bán
 * kính quy hoạch bao cả ruộng và mỏ, mà chưa từng có thành trì trung cổ nào xây
 * tường quanh ruộng của mình. Ôm trọn sẽ tặng người chơi một bức tường dài gấp
 * đôi cái họ từng có, kèm phí duy trì và số quân canh của nó.
 */
function ringAround(radius: number, points = 16): WallPoint[] {
  const out: WallPoint[] = [];
  for (let index = 0; index < points; index++) {
    const angle = (index / points) * Math.PI * 2;
    out.push({
      x: Math.round(CENTER_CELL + Math.cos(angle) * radius),
      y: Math.round(CENTER_CELL + Math.sin(angle) * radius),
    });
  }
  const first = out[0];
  if (first !== undefined) out.push({ ...first });
  return out;
}

/**
 * Nâng MỘT thành trì. Nhận đối tượng thô từ save, trả về đối tượng thô đã đủ
 * hình dạng mới. Không kiểm schema ở đây — `migrateToCurrent` làm việc đó sau.
 */
export function migrateHolding(raw: LegacyHolding): Record<string, unknown> {
  const id = typeof raw['id'] === 'string' ? raw['id'] : 'hold_khong-ten';
  const node = worldNodeOf(id);
  const legacyGrid = Math.max(2, numberAt(raw['gridSize'], 4));
  const tierId = typeof raw['tierId'] === 'string' ? raw['tierId'] : 'thon';
  const rank = tierOf(tierId)?.rank ?? 1;
  const radius = planningRadiusCells(rank);

  const next: Record<string, unknown> = { ...raw };
  delete next['tiles'];
  delete next['gridSize'];
  delete next['hinterland'];

  next['seed'] = seedFromId(id);
  next['dominant'] = node?.terrain ?? 'dong-bang';
  next['coastal'] = coastalFrom(node?.terrain ?? '');
  next['anchor'] = { x: Math.round(node?.x ?? 0), y: Math.round(node?.y ?? 0) };
  next['hint'] = { river: false, sea: false, mountain: false };

  // --- công trình: tách tường ra khỏi phần còn lại
  const legacyBuildings = Array.isArray(raw['buildings']) ? (raw['buildings'] as LegacyPlaced[]) : [];
  const buildings: Record<string, unknown>[] = [];
  const walls: WallLine[] = [];

  for (const placed of legacyBuildings) {
    const buildingId = typeof placed['buildingId'] === 'string' ? placed['buildingId'] : '';
    const legacyWall = LEGACY_WALL_BUILDINGS[buildingId];

    if (legacyWall !== undefined) {
      const material = wallMaterialOf(legacyWall.materialId);
      if (material === null) continue;
      // Tường nội ôm hẹp hơn tường ngoại, đúng như một thành trì hai lớp thật.
      const ring = ringAround(radius * (legacyWall.layer === 'trong' ? 0.34 : 0.62));
      const plan = planWall(ring, legacyWall.materialId, 1, null);
      if (!plan.ok) continue;
      walls.push({
        id: `wall_cu-${String(walls.length + 1)}`,
        name: material.name,
        materialId: legacyWall.materialId,
        level: 1,
        points: ring,
        length: plan.length,
        closed: plan.closed,
        // Độ nguyên vẹn của công trình cũ đi thẳng sang tuyến: một bức tường
        // 60/100 vẫn là một bức tường 60/100, chỉ là bây giờ nó có chiều dài.
        integrity: Math.max(1, Math.min(100, numberAt(placed['integrity'], 100))),
        weeksLeft: 0,
        manWeeksLeft: 0,
        layer: legacyWall.layer,
      });
      continue;
    }

    const at = placed['at'] ?? {};
    const moved = legacyCellToNew(
      numberAt((at as { x?: unknown }).x, 0),
      numberAt((at as { y?: unknown }).y, 0),
      legacyGrid,
      radius,
    );
    buildings.push({ ...placed, at: moved, nodeId: '' });
  }

  next['buildings'] = buildings;
  next['walls'] = assignLayers(walls);

  // --- dự án đang xây: cùng phép dịch, cộng trường `nodeId` mới
  const legacyProjects = Array.isArray(raw['projects']) ? (raw['projects'] as LegacyPlaced[]) : [];
  next['projects'] = legacyProjects
    // Công trường đang dựng một bức tường vành đai không còn đích để về. Hoàn
    // lại thì phải sờ vào kho ở giữa một bước migration thuần; bỏ đi thì người
    // chơi mất một công trường dở. Bỏ đi là ít tệ hơn, và nó chỉ chạm tới đúng
    // những ván có một bức tường đang xây dở đúng lúc nâng cấp.
    .filter((project) => LEGACY_WALL_BUILDINGS[typeof project['buildingId'] === 'string' ? project['buildingId'] : ''] === undefined)
    .map((project) => {
      const at = project['at'] ?? {};
      return {
        ...project,
        at: legacyCellToNew(
          numberAt((at as { x?: unknown }).x, 0),
          numberAt((at as { y?: unknown }).y, 0),
          legacyGrid,
          radius,
        ),
        nodeId: '',
      };
    });

  next['nodes'] = [];

  // Save cũ chưa từng biết tới đường sá. Không suy ra gì cả và cũng không tặng
  // gì: mạng đường TỰ SINH thì `streets.ts` dựng lại từ hạt giống ngay lần mở
  // bản đồ đầu tiên, còn quãng phố lát đá là thứ phải bỏ tiền, và không ai được
  // một quãng phố miễn phí chỉ vì họ nâng cấp bản game.
  next['roads'] = [];
  next['streetsRazed'] = [];
  return next;
}

/**
 * Dọn bố cục SAU khi save đã qua schema.
 *
 * Phải chạy ở đây chứ không chạy trong `migrateHolding`, vì `repairLayout` cần
 * một `Holding` đã đúng kiểu — nó gọi `canPlace`, `ensureNodes` và cả bộ sinh
 * địa hình. Bước migration thuần chỉ đổi hình dạng dữ liệu; bước này mới là
 * bước hiểu dữ liệu ấy.
 */
export function settleMigratedHolding(holding: Holding): void {
  holding.nodes = ensureNodes(fieldOf(holding), holding.nodes, holding.walls);
  repairLayout(holding);
}

/** Nhận diện một thành trì còn ở hình dạng cũ. */
export function isLegacyHolding(raw: unknown): boolean {
  if (typeof raw !== 'object' || raw === null) return false;
  const row = raw as Record<string, unknown>;
  return row['seed'] === undefined || row['tiles'] !== undefined;
}
