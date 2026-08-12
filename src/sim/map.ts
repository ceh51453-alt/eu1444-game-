/**
 * ĐO ĐƯỜNG ĐI GIỮA HAI NƠI — nền của mục 6.
 *
 * "Tin đi theo tuyến đường thật: đường cái nhanh, núi và biển chậm, mùa đông
 * chậm." Câu ấy chỉ có nghĩa nếu có một ĐỒ THỊ thật để đi, chứ không phải một
 * phép trừ toạ độ. Đường chim bay từ Genoa tới Vienna là 700 km; đường thật phải
 * vượt Alps, và một sứ giả mùa đông sẽ mất gấp ba.
 *
 * ĐỒ THỊ DỰNG TỪ BA NGUỒN, và không nguồn nào chép lại nguồn nào:
 *
 *   `regions.json → adjacent`   láng giềng — hai vùng chạm nhau thì đi bộ được
 *   `regions.json → parentId`   thứ bậc — từ làng ra tỉnh, từ tỉnh ra lãnh thổ
 *   `world-map.json → lanes`    TUYẾN có thật mà hai nguồn trên không nói ra:
 *                               galley Venice–Constantinople, đèo Mont Cenis,
 *                               đường sông Rhine
 *
 * Lục địa `reg_europa` CỐ Ý không có toạ độ (xem `tools/tao-ban-do.mjs`): nó là
 * gốc của cây vùng chứ không phải một nơi chốn, và nối mọi thứ vào nó là mở một
 * cổng dịch chuyển tức thời giữa Lisboa và Moskva.
 *
 * Hai vùng không có đường nào nối thì KHÔNG phải là không tới được — người ta
 * vẫn băng đồng. `fallbackFactor` là cái giá của việc ấy, và nó cố ý đắt.
 */

import { seasonOfDate, type GameDate, type SeasonId } from '@/core/clock';
import { allRegions, regionOf } from '@/lore/regions';
import { mapConfig, mapLanes, mapNode, type MapNode } from './data';

export interface Edge {
  to: string;
  /** Khoảng cách km giữa hai đầu. */
  km: number;
  /** Nhân vào tốc độ. Lớn hơn 1 là đi nhanh hơn đồng bằng có đường cái. */
  factor: number;
  /** `lang-gieng`, `thu-bac`, hoặc id loại tuyến của `world-map.json`. */
  kind: string;
}

export interface Route {
  /** Chuỗi vùng đi qua, gồm cả điểm đầu và điểm cuối. */
  path: string[];
  /** Tổng km thật đi trên đường, KHÔNG phải đường chim bay. */
  km: number;
  /**
   * "Km quy đổi": mỗi đoạn chia cho hệ số của nó. Đây mới là thứ đổi ra ngày đi,
   * vì 100 km đường núi không phải 100 km đường cái.
   */
  effortKm: number;
  /** Số chặng — mỗi lần đổi người kể là một lần tin méo thêm (mục 6). */
  hops: number;
  /** Không có đường nào nối: đã phải băng đồng. */
  fallback: boolean;
}

// ---------------------------------------------------------------------------
// Dựng đồ thị một lần
// ---------------------------------------------------------------------------

function distance(a: MapNode, b: MapNode): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Hệ số của một cạnh láng giềng: địa hình xấu hơn thắng, đường tốt hơn không cứu nổi. */
function terrainEdgeFactor(a: MapNode, b: MapNode): number {
  const config = mapConfig();
  const terrainA = config.terrainFactor[a.terrain] ?? 1;
  const terrainB = config.terrainFactor[b.terrain] ?? 1;
  const roads = config.roadFactor[Math.min(a.roads, b.roads)] ?? 1;
  return Math.min(terrainA, terrainB) * roads;
}

function buildGraph(): Map<string, Edge[]> {
  const graph = new Map<string, Edge[]>();
  const config = mapConfig();

  const push = (from: string, edge: Edge): void => {
    const list = graph.get(from);
    if (list === undefined) graph.set(from, [edge]);
    else if (!list.some((existing) => existing.to === edge.to && existing.factor >= edge.factor)) list.push(edge);
  };

  const link = (fromId: string, toId: string, factor: number, kind: string): void => {
    const from = mapNode(fromId);
    const to = mapNode(toId);
    if (from === null || to === null) return;
    // Hai vùng cùng toạ độ (thành phố nằm đúng trên tỉnh của nó) vẫn phải có một
    // quãng tối thiểu, nếu không thì `effortKm` chia cho 0 và mọi tin từ đó đi
    // tức thời.
    const km = Math.max(3, distance(from, to));
    push(fromId, { to: toId, km, factor, kind });
    push(toId, { to: fromId, km, factor, kind });
  };

  for (const region of allRegions()) {
    if (mapNode(region.id) === null) continue;

    for (const neighbourId of region.adjacent) {
      const from = mapNode(region.id);
      const to = mapNode(neighbourId);
      if (from === null || to === null) continue;
      link(region.id, neighbourId, terrainEdgeFactor(from, to), 'lang-gieng');
    }

    if (region.parentId !== null && mapNode(region.parentId) !== null) {
      link(region.id, region.parentId, config.hierarchyFactor, 'thu-bac');
    }
  }

  // Tuyến khai tay THAY hệ số địa hình chứ không cộng thêm: một chiếc galley đi
  // Venice–Constantinople không quan tâm giữa đường có núi hay không.
  for (const lane of mapLanes()) {
    link(lane.a, lane.b, config.laneFactor[lane.kind] ?? 1, lane.kind);
  }

  return graph;
}

const GRAPH = buildGraph();

export function edgesFrom(regionId: string): readonly Edge[] {
  return GRAPH.get(regionId) ?? [];
}

/**
 * Vùng gần nhất CÓ TOẠ ĐỘ, leo theo cây vùng.
 *
 * Một entry lorebook có thể đặt người chơi ở một nơi mà bản đồ chưa có toạ độ.
 * Trả về `null` thì mọi tin về nơi ấy biến mất không dấu vết, nên leo lên tỉnh
 * rồi lên lãnh thổ vẫn tốt hơn nhiều — sai vài chục cây số, không sai cả hệ.
 */
export function anchorOf(regionId: string): string | null {
  let current = regionId;
  for (let guard = 0; guard < 32; guard++) {
    if (mapNode(current) !== null) return current;
    const node = regionOf(current);
    if (node === null || node.parentId === null) return null;
    current = node.parentId;
  }
  return null;
}

export function coordsOf(regionId: string): { x: number; y: number } | null {
  const anchor = anchorOf(regionId);
  if (anchor === null) return null;
  const node = mapNode(anchor);
  return node === null ? null : { x: node.x, y: node.y };
}

// ---------------------------------------------------------------------------
// Tìm đường
// ---------------------------------------------------------------------------

interface Frontier {
  id: string;
  effort: number;
}

/**
 * Dijkstra trên `effortKm`, không phải trên km.
 *
 * Chọn đường theo km thật là chọn con đường NGẮN NHẤT, mà tin tức không đi đường
 * ngắn nhất — nó đi đường NHANH NHẤT. Một lá thư từ Augsburg tới Milan vòng qua
 * đèo Mont Cenis xa hơn đường thẳng xuyên Alps, và vẫn tới sớm hơn nhiều.
 *
 * Hàng đợi là một mảng quét tuyến tính chứ không phải heap: đồ thị có 121 đỉnh và
 * hàm này chạy vài lần mỗi tháng game. Một heap ở đây là thêm bốn chục dòng code
 * để tiết kiệm vài micro giây.
 */
export function findRoute(fromId: string, toId: string): Route {
  const from = anchorOf(fromId);
  const to = anchorOf(toId);

  if (from === null || to === null) return strandedRoute(fromId, toId);
  if (from === to) return { path: [from], km: 0, effortKm: 0, hops: 0, fallback: false };

  const effort = new Map<string, number>([[from, 0]]);
  const kmSoFar = new Map<string, number>([[from, 0]]);
  const previous = new Map<string, string>();
  const settled = new Set<string>();
  const frontier: Frontier[] = [{ id: from, effort: 0 }];

  while (frontier.length > 0) {
    let bestAt = 0;
    for (let index = 1; index < frontier.length; index++) {
      const candidate = frontier[index];
      const best = frontier[bestAt];
      if (candidate !== undefined && best !== undefined && candidate.effort < best.effort) bestAt = index;
    }
    const current = frontier.splice(bestAt, 1)[0];
    if (current === undefined) break;
    if (settled.has(current.id)) continue;
    settled.add(current.id);
    if (current.id === to) break;

    for (const edge of edgesFrom(current.id)) {
      if (settled.has(edge.to)) continue;
      const next = current.effort + edge.km / Math.max(0.05, edge.factor);
      if (next >= (effort.get(edge.to) ?? Infinity)) continue;
      effort.set(edge.to, next);
      kmSoFar.set(edge.to, (kmSoFar.get(current.id) ?? 0) + edge.km);
      previous.set(edge.to, current.id);
      frontier.push({ id: edge.to, effort: next });
    }
  }

  if (!settled.has(to)) return strandedRoute(from, to);

  const path: string[] = [to];
  for (let guard = 0; guard < 256; guard++) {
    const step = previous.get(path[0] ?? '');
    if (step === undefined) break;
    path.unshift(step);
    if (step === from) break;
  }

  return {
    path,
    km: Math.round(kmSoFar.get(to) ?? 0),
    effortKm: Math.round(effort.get(to) ?? 0),
    hops: Math.max(1, path.length - 1),
    fallback: false,
  };
}

/**
 * Không có đường: băng đồng theo đường chim bay, trả giá bằng `fallbackFactor`.
 *
 * KHÔNG trả `Infinity` và không ném. Một vùng bị cô lập trên đồ thị vẫn là một
 * nơi có người sống, và tin từ đó vẫn phải tới được — chỉ là rất muộn và rất
 * sai, đúng như thực tế của một nơi không ai đi qua.
 */
function strandedRoute(fromId: string, toId: string): Route {
  const from = coordsOf(fromId);
  const to = coordsOf(toId);
  const km = from === null || to === null ? 2500 : Math.hypot(from.x - to.x, from.y - to.y);
  return {
    path: [fromId, toId],
    km: Math.round(km),
    effortKm: Math.round(km / mapConfig().fallbackFactor),
    hops: 1,
    fallback: true,
  };
}

// ---------------------------------------------------------------------------
// Đổi ra ngày đi
// ---------------------------------------------------------------------------

export function seasonFactor(season: SeasonId): number {
  return mapConfig().seasonFactor[season] ?? 1;
}

/**
 * Bao nhiêu ngày để đi hết con đường này.
 *
 * Mùa lấy ở NGÀY XUẤT PHÁT, không tính lại giữa đường: một chuyến đi ba tháng
 * mùa thu sang mùa đông thì đúng là chậm dần thật, nhưng mô phỏng lại điều đó
 * đòi cắt chuyến đi thành từng đoạn theo mùa — mà cả hệ này chỉ cần biết "tin ấy
 * tới muộn bao nhiêu", không cần biết nó chậm ở khúc nào.
 */
export function travelDays(route: Route, kmPerDay: number, date: GameDate, speedBonus = 1): number {
  const speed = Math.max(1, kmPerDay * seasonFactor(seasonOfDate(date)) * speedBonus);
  return Math.max(1, Math.round(route.effortKm / speed));
}

/** Đường chim bay, dùng cho `reachKm` của mục 6 — tầm với đo bằng khoảng cách thật. */
export function crowKm(fromId: string, toId: string): number {
  const from = coordsOf(fromId);
  const to = coordsOf(toId);
  if (from === null || to === null) return Infinity;
  return Math.round(Math.hypot(from.x - to.x, from.y - to.y));
}

/** Số đỉnh có toạ độ. Tab Debug in ra để biết bản đồ đã nạp đủ chưa. */
export function graphSize(): { nodes: number; edges: number } {
  let edges = 0;
  for (const list of GRAPH.values()) edges += list.length;
  return { nodes: GRAPH.size, edges: Math.round(edges / 2) };
}
