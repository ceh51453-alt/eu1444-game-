/**
 * MỞ NODE, BẬT THẾ, VÀ SỰ KIỆN ĐỘT PHÁ (Phần 8 mục 6, 7, 8).
 *
 * Một node có thể ở bốn trạng thái, và UI của mục 11 vẽ bốn kiểu khác nhau:
 *
 *   `unlocked`  đã mở — sáng
 *   `ready`     đủ điều kiện — viền nhấp nháy, hiện giá
 *   `locked`    thiếu điều kiện — mờ, hover nói ĐÚNG cái đang thiếu
 *   `hidden`    node `secret` chưa biết — KHÔNG hiện, kể cả dạng mờ
 *
 * `hidden` là chỗ dễ làm sai nhất và cũng là chỗ quan trọng nhất: một node bí
 * truyền hiện ra dạng mờ với dòng "cần biết về Isolde" đã tự nó tiết lộ rằng có
 * một thứ tên như thế tồn tại và ai đang giữ nó. Cổng tri thức của Phần 4 sinh
 * ra để chữa đúng bệnh đó, nên ở đây node bị lọc khỏi danh sách chứ không phải
 * chỉ làm mờ đi.
 *
 * Mọi hàm trả `PatchOp[]`; người gọi áp qua MVU với actor `engine` (R2).
 */

import type { PatchOp } from '@/state/mvu-parse';
import type { GameState } from '@/state/slices';
import { readPath } from '@/state/slices';
import { bodyOf } from '@/systems/body/slice';
import { characterOf } from '@/systems/character/slice';
import { STATS, type StatId } from '@/systems/character/stats';
import { breakthroughTeacherTier, isBreakthroughTrigger, tierAtLeast, tierOfLevel } from './catalog';
import { bestTeacherFor, canTeach, teacherLevelIn } from './caps';
import { nodeCost } from './load';
import { nodeName, nodeOf, nodesForSkill, type SkillNode } from './nodes';
import { levelOf, skillsOf } from './slice';

export type NodeStatus = 'unlocked' | 'ready' | 'locked' | 'hidden';

export interface NodeView {
  node: SkillNode;
  status: NodeStatus;
  /** Giá thật đã nhân hệ số tải học tập. */
  cost: number;
  /** ĐÚNG những thứ đang thiếu, bằng tiếng Việt. Rỗng khi đã đủ. */
  missing: string[];
  /** Cột trên đồ thị, suy từ độ sâu tiên quyết. */
  layer: number;
}

// ---------------------------------------------------------------------------
// Điều kiện
// ---------------------------------------------------------------------------

/** Tàn phế vĩnh viễn đang mang — nguồn của `bodyCondition` (mục 7). */
export function bodyConditions(state: GameState | null | undefined): string[] {
  return (bodyOf(state)?.permanent ?? []).map((entry) => entry.id);
}

/** Tri thức đã nắm — cổng của node `secret` (mục 6, nối Phần 4). */
export function knownFacts(state: GameState | null | undefined): string[] {
  const known = readPath(state ?? {}, 'knowledge.known');
  return known === null || typeof known !== 'object' ? [] : Object.keys(known as Record<string, unknown>);
}

/**
 * Node `secret` này đã lộ ra chưa.
 *
 * Chỉ cần biết MỘT trong các mảnh tri thức mà nó đòi là node hiện lên — biết một
 * nửa câu chuyện đủ để biết rằng còn nửa kia. Đòi biết đủ mới hiện thì người
 * chơi không bao giờ có manh mối để đi tìm nốt.
 */
export function isRevealed(state: GameState | null | undefined, node: SkillNode): boolean {
  if (node.kind !== 'secret') return true;
  if (node.prereq.knowledge.length === 0) return true;
  const known = new Set(knownFacts(state));
  return node.prereq.knowledge.some((id) => known.has(id));
}

/** Những thứ đang thiếu để mở node này, bằng tiếng Việt đọc được. */
export function missingFor(state: GameState | null | undefined, node: SkillNode): string[] {
  const missing: string[] = [];
  const skills = skillsOf(state);
  const unlocked = new Set(skills?.unlockedNodes ?? []);
  const level = levelOf(state, node.skillId);
  const prereq = node.prereq;

  const blocked = bodyConditions(state).filter((id) => node.lockedBy.includes(id));
  if (blocked.length > 0) {
    missing.push(`bị khóa vĩnh viễn bởi thương tật: ${blocked.join(', ')}`);
  }

  if (prereq.skillLevel !== undefined && level < prereq.skillLevel) {
    missing.push(`cần kỹ năng ${prereq.skillLevel} (đang ${level})`);
  }

  for (const id of prereq.nodes) {
    if (!unlocked.has(id)) missing.push(`cần mở trước: ${nodeName(id)}`);
  }

  if (prereq.anyOfNodes.length > 0 && !prereq.anyOfNodes.some((id) => unlocked.has(id))) {
    missing.push(`cần một trong: ${prereq.anyOfNodes.map(nodeName).join(' hoặc ')}`);
  }

  const stats = characterOf(state)?.stats;
  for (const [key, required] of Object.entries(prereq.stats)) {
    const stat = key as StatId;
    const value = stats?.[stat] ?? 0;
    if (required !== undefined && value < required) {
      missing.push(`cần ${STATS[stat].name} ${required} (đang ${value})`);
    }
  }

  if (prereq.bodyCondition.length > 0) {
    const conditions = new Set(bodyConditions(state));
    if (!prereq.bodyCondition.some((id) => conditions.has(id))) {
      // Nhánh nghịch cảnh: KHÔNG nói ra là "cần bị cụt tay" — đó là một câu vô
      // duyên với người đang lành lặn. Nói đúng thứ nó là: một con đường chỉ mở
      // ra cho người đã mất một thứ gì đó.
      missing.push('con đường này chỉ mở ra sau một thương tật vĩnh viễn');
    }
  }

  const teacher = bestTeacherFor(state, node.skillId);
  if (prereq.teacherRequired && !canTeach(teacher, node.skillId, level)) {
    missing.push('cần một người thầy hơn ngài ít nhất 15 điểm ở kỹ năng này');
  }

  const teacherNode = prereq.teacherNodeRequired;
  if (teacherNode !== undefined) {
    const has = teacher?.skills.some((row) => row.nodes.includes(teacherNode)) ?? false;
    if (!has) missing.push(`thầy phải chính mình có: ${nodeName(teacherNode)}`);
  }

  if (node.prereq.knowledge.length > 0) {
    const known = new Set(knownFacts(state));
    if (!node.prereq.knowledge.some((id) => known.has(id))) missing.push('chưa biết gì về thứ này');
  }

  const cost = nodeCost(state, node);
  const xp = skills?.xp ?? 0;
  if (xp < cost) missing.push(`cần ${cost} điểm KN (đang có ${Math.round(xp)})`);

  return missing;
}

/**
 * Trạng thái một node dưới mắt người chơi.
 *
 * Node `breakthrough` không bao giờ là `ready`: mục 8 nói thẳng engine kiểm tra
 * điều kiện chứ không cho người chơi bấm nút. Nó chỉ đổi sang `unlocked` khi một
 * hoàn cảnh cực hạn thật sự xảy ra.
 */
export function nodeStatus(state: GameState | null | undefined, node: SkillNode): NodeStatus {
  if (skillsOf(state)?.unlockedNodes.includes(node.id) === true) return 'unlocked';
  if (!isRevealed(state, node)) return 'hidden';
  if (node.kind === 'breakthrough') return 'locked';
  return missingFor(state, node).length === 0 ? 'ready' : 'locked';
}

/** Đồ thị của một kỹ năng dưới mắt người chơi — node `hidden` đã bị lọc bỏ. */
export function graphOf(state: GameState | null | undefined, skillId: string): NodeView[] {
  const views: NodeView[] = [];
  for (const node of nodesForSkill(skillId)) {
    const status = nodeStatus(state, node);
    if (status === 'hidden') continue;
    views.push({
      node,
      status,
      cost: nodeCost(state, node),
      missing: status === 'unlocked' ? [] : missingFor(state, node),
      layer: layerWithin(node, skillId),
    });
  }
  return views.sort((left, right) => left.layer - right.layer || left.node.name.localeCompare(right.node.name));
}

/**
 * Cột của node trên đồ thị của CHÍNH kỹ năng đó.
 *
 * Tính riêng chứ không dùng `layerOf` chung: một node đòi tiên quyết ở kỹ năng
 * khác thì trên đồ thị này nó vẫn là node gốc, và đẩy nó sang cột thứ tư chỉ vì
 * một dây nối không vẽ ở đây là làm hỏng bố cục.
 */
function layerWithin(node: SkillNode, skillId: string, seen: Set<string> = new Set()): number {
  if (seen.has(node.id)) return 0;
  seen.add(node.id);
  const parents = [...node.prereq.nodes, ...node.prereq.anyOfNodes]
    .map((id) => nodeOf(id))
    .filter((parent): parent is SkillNode => parent !== null && parent.skillId === skillId);
  if (parents.length === 0) return 0;
  return 1 + Math.max(...parents.map((parent) => layerWithin(parent, skillId, seen)));
}

// ---------------------------------------------------------------------------
// Mở node
// ---------------------------------------------------------------------------

export interface UnlockOutcome {
  ops: PatchOp[];
  /** Rỗng khi mở được; ngược lại là lý do đầu tiên. */
  blocked: string;
  cost: number;
}

export function unlockNode(state: GameState, nodeId: string): UnlockOutcome {
  const node = nodeOf(nodeId);
  if (node === null) return { ops: [], blocked: `không có node "${nodeId}"`, cost: 0 };

  const skills = skillsOf(state);
  if (skills === null) return { ops: [], blocked: 'chưa có slice kỹ năng', cost: 0 };
  if (skills.unlockedNodes.includes(nodeId)) return { ops: [], blocked: 'đã mở rồi', cost: 0 };

  if (node.kind === 'breakthrough') {
    return {
      ops: [],
      blocked: 'node đột phá không mua được — nó xảy ra, hoặc không (mục 8)',
      cost: 0,
    };
  }
  if (!isRevealed(state, node)) return { ops: [], blocked: 'chưa biết gì về thứ này', cost: 0 };

  const missing = missingFor(state, node);
  const cost = nodeCost(state, node);
  if (missing.length > 0) return { ops: [], blocked: missing[0] ?? 'chưa đủ điều kiện', cost };

  return {
    ops: [
      { op: 'push', path: 'skills.unlockedNodes', to: nodeId, reason: `mở nhánh ${node.name}`, source: 'json' },
      { op: 'add', path: 'skills.xp', to: -cost, reason: `trả ${cost} điểm KN cho ${node.name}`, source: 'json' },
    ],
    blocked: '',
    cost,
  };
}

// ---------------------------------------------------------------------------
// Thế (mục 6)
// ---------------------------------------------------------------------------

/**
 * Bật một thế, hoặc tắt hết khi truyền chuỗi rỗng.
 *
 * Một kỹ năng chỉ giữ được MỘT thế: bật cái này là tắt cái kia, và đó chính là
 * nghĩa của "bật lên là được cái này mất cái kia".
 */
export function setStance(state: GameState, skillId: string, nodeId: string): UnlockOutcome {
  if (nodeId === '') {
    return {
      ops: [{ op: 'delete', path: `skills.activeStance.${skillId}`, reason: 'bỏ thế', source: 'json' }],
      blocked: '',
      cost: 0,
    };
  }

  const node = nodeOf(nodeId);
  if (node === null || node.kind !== 'stance') return { ops: [], blocked: 'đây không phải một thế', cost: 0 };
  if (node.skillId !== skillId) return { ops: [], blocked: 'thế này không thuộc kỹ năng đó', cost: 0 };
  if (skillsOf(state)?.unlockedNodes.includes(nodeId) !== true) {
    return { ops: [], blocked: 'chưa mở thế này', cost: 0 };
  }

  return {
    ops: [
      {
        op: 'set',
        path: `skills.activeStance.${skillId}`,
        to: nodeId,
        reason: `vào thế ${node.name}`,
        source: 'json',
      },
    ],
    blocked: '',
    cost: 0,
  };
}

// ---------------------------------------------------------------------------
// Đột phá (mục 8)
// ---------------------------------------------------------------------------

export interface BreakthroughOutcome {
  ops: PatchOp[];
  blocked: string;
  nodeId: string;
}

/**
 * SỰ KIỆN ĐỘT PHÁ — engine cấp, không ai bấm nút.
 *
 * Ba điều kiện, và cả ba đều phải do thế giới tạo ra chứ không do người chơi
 * chọn: kỹ năng đã đứng ở trần của bậc Bậc thầy, đang có một Tông sư bên cạnh,
 * và vừa xảy ra một hoàn cảnh cực hạn trong danh sách `breakthrough.triggers`.
 *
 * Phần 9–11 gọi hàm này khi chúng biết trận đánh vừa kết thúc ra sao. Phần 8 chỉ
 * dựng cửa, không tự bịa ra hoàn cảnh.
 */
export function grantBreakthrough(
  state: GameState,
  skillId: string,
  triggerId: string,
  turn: number,
): BreakthroughOutcome {
  if (!isBreakthroughTrigger(triggerId)) {
    return { ops: [], blocked: `"${triggerId}" không phải một hoàn cảnh đột phá hợp lệ`, nodeId: '' };
  }

  const skills = skillsOf(state);
  if (skills === null) return { ops: [], blocked: 'chưa có slice kỹ năng', nodeId: '' };
  if (skills.breakthroughs[skillId] !== undefined) {
    return { ops: [], blocked: 'kỹ năng này đã đột phá rồi', nodeId: '' };
  }

  const teacher = bestTeacherFor(state, skillId);
  const teacherLevel = teacherLevelIn(teacher, skillId);
  if (teacherLevel <= 0 || !tierAtLeast(tierOfLevel(teacherLevel).id, breakthroughTeacherTier())) {
    return { ops: [], blocked: 'không có Tông sư nào bên cạnh để nhận ra chuyện vừa xảy ra', nodeId: '' };
  }

  const level = levelOf(state, skillId);
  const node = nodesForSkill(skillId).find((entry) => entry.kind === 'breakthrough');
  if (node === undefined) return { ops: [], blocked: 'kỹ năng này không có node đột phá', nodeId: '' };
  const required = node.prereq.skillLevel ?? 0;
  if (level < required) {
    return { ops: [], blocked: `kỹ năng mới ở ${level}, chưa tới ngưỡng đột phá ${required}`, nodeId: '' };
  }
  for (const id of node.prereq.nodes) {
    if (!skills.unlockedNodes.includes(id)) {
      return { ops: [], blocked: `chưa mở ${nodeName(id)} — chưa đi hết con đường thường`, nodeId: '' };
    }
  }

  const ops: PatchOp[] = [
    {
      op: 'set',
      path: `skills.breakthroughs.${skillId}`,
      to: triggerId,
      reason: `đột phá ở lượt ${turn}: ${triggerId}`,
      source: 'json',
    },
  ];
  if (!skills.unlockedNodes.includes(node.id)) {
    ops.push({
      op: 'push',
      path: 'skills.unlockedNodes',
      to: node.id,
      reason: `${node.name} — mở bằng sự kiện đột phá, không mua bằng điểm KN`,
      source: 'json',
    });
  }

  return { ops, blocked: '', nodeId: node.id };
}
