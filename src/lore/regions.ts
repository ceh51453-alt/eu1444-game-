/**
 * CÂY VÙNG (Phần 4 mục 3).
 *
 * Hai câu hỏi mà cả `autoScope` lẫn lớp L3 đều hỏi:
 *   "vùng tôi đang đứng có NẰM TRONG vùng X không?"
 *   "nó có KỀ vùng X không?"
 *
 * Chữ "nằm trong" là chỗ dễ làm sai nhất. Một entry gắn với `prov_swabia` phải
 * chèn được khi người chơi đứng ở `hold_ehrenfeld` — thành trì nằm trong tỉnh.
 * Nhưng entry gắn với `hold_ehrenfeld` thì KHÔNG được chèn khi người chơi đang
 * ở `hold_brogg` cùng tỉnh: nội dung của một điểm không tự lan ra hàng xóm.
 * So sánh id bằng dấu bằng là hỏng vế đầu; so sánh theo tỉnh là hỏng vế sau.
 *
 * Dữ liệu ở `/data/regions.json` theo R5 — không hardcode nội dung.
 */

import regionsFile from '@data/regions.json';

export type RegionKind = 'continent' | 'realm' | 'province' | 'settlement';

export interface RegionNode {
  id: string;
  name: string;
  kind: RegionKind;
  parentId: string | null;
  adjacent: string[];
}

interface RegionsFile {
  regions?: {
    id: string;
    name: string;
    kind: string;
    parentId: string | null;
    adjacent?: string[];
  }[];
}

const KINDS: ReadonlySet<string> = new Set(['continent', 'realm', 'province', 'settlement']);

function load(): Map<string, RegionNode> {
  const map = new Map<string, RegionNode>();
  for (const raw of (regionsFile as RegionsFile).regions ?? []) {
    map.set(raw.id, {
      id: raw.id,
      name: raw.name,
      kind: KINDS.has(raw.kind) ? (raw.kind as RegionKind) : 'province',
      parentId: raw.parentId,
      adjacent: raw.adjacent ?? [],
    });
  }
  return map;
}

const REGIONS = load();

export function allRegions(): RegionNode[] {
  return [...REGIONS.values()];
}

export function regionOf(id: string): RegionNode | null {
  return REGIONS.get(id) ?? null;
}

export function regionName(id: string): string {
  return REGIONS.get(id)?.name ?? id;
}

/** Chuỗi từ node lên tới gốc, gồm chính nó. Dùng cho L3 và cho UI. */
export function ancestryOf(id: string): string[] {
  const chain: string[] = [];
  let current = REGIONS.get(id);
  // Dữ liệu người chơi sửa được, nên vòng lặp phải có trần chứ không tin cây.
  for (let guard = 0; guard < 32 && current !== undefined; guard++) {
    chain.push(current.id);
    current = current.parentId === null ? undefined : REGIONS.get(current.parentId);
  }
  return chain;
}

/** `id` LÀ `ancestorId` hoặc nằm trong nó. */
export function isWithin(id: string, ancestorId: string): boolean {
  return ancestryOf(id).includes(ancestorId);
}

/**
 * Kề nhau, SO Ở ĐÚNG TẦNG CỦA MỤC TIÊU.
 *
 * Đứng ở `hold_muhldorf` mà hỏi có kề `prov_swabia` không thì phải leo lên tầng
 * tỉnh của mình (`prov_bayern`) rồi mới so — hàng xóm hầu như luôn được khai ở
 * cấp tỉnh chứ không ở cấp từng làng, nên không leo thì `includeAdjacent` vô
 * dụng.
 *
 * Nhưng CHỈ leo tới đúng tầng đó, không leo tiếp. Nếu so cả chuỗi tổ tiên thì
 * "Đế quốc kề Pháp" sẽ biến mọi thành trì trong đế quốc thành hàng xóm của mọi
 * tỉnh Pháp, và `includeAdjacent` thành ra gần như bật toàn cục.
 */
export function isAdjacent(id: string, otherId: string): boolean {
  const other = REGIONS.get(otherId);
  if (other === undefined) return false;

  const peerId = ancestryOf(id).find((nodeId) => REGIONS.get(nodeId)?.kind === other.kind) ?? id;
  const peer = REGIONS.get(peerId);
  if (peer === undefined || peer.id === other.id) return false;

  return peer.adjacent.includes(other.id) || other.adjacent.includes(peer.id);
}

/**
 * Lớp L3 của mục 4. Entry không khai `regions` thì không bị vùng giới hạn.
 * Trả về cả lý do, vì panel "vì sao bị loại" cần nói được cụ thể.
 */
export function matchesRegions(
  current: string,
  regions: readonly string[] | undefined,
  includeAdjacent: boolean,
): { passed: boolean; reason: string } {
  if (regions === undefined || regions.length === 0) {
    return { passed: true, reason: 'entry không giới hạn vùng' };
  }
  if (current === '') {
    return { passed: false, reason: `entry chỉ dùng ở ${regions.map(regionName).join(', ')}, mà chưa biết đang ở đâu` };
  }

  const inside = regions.find((region) => isWithin(current, region));
  if (inside !== undefined) {
    return { passed: true, reason: `${regionName(current)} nằm trong ${regionName(inside)}` };
  }

  if (includeAdjacent) {
    const near = regions.find((region) => isAdjacent(current, region));
    if (near !== undefined) {
      return { passed: true, reason: `${regionName(current)} kề ${regionName(near)}` };
    }
  }

  return {
    passed: false,
    reason: `${regionName(current)} không thuộc ${regions.map(regionName).join(', ')}${
      includeAdjacent ? ' và cũng không kề' : ''
    }`,
  };
}
