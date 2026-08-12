/**
 * ĐỒ THỊ NHÁNH (Phần 8 mục 6) — nạp từ `/data/skill-nodes.json` theo R5.
 *
 * KHÔNG phải cây theo tầng. Là đồ thị có hướng: `prereq.nodes` là AND,
 * `prereq.anyOfNodes` là OR, và một node có thể đứng sau nhiều đường khác nhau.
 * Thứ tự trong file không có nghĩa gì — vị trí trên UI suy ra từ độ sâu tiên
 * quyết ở `layerOf`, chứ không ai gõ tay tọa độ.
 *
 * XƯƠNG SỐNG NỞ RA TỪ `templates`: mỗi kỹ năng trong `data/skills.json` đều nhận
 * ba node chung (nền tảng, thuần thục, vượt ngưỡng). Nhờ vậy không kỹ năng nào có
 * đồ thị rỗng, và cửa lên bậc Tông sư có mặt ở mọi kỹ năng mà không phải chép 76
 * lần. `$self` trong `domains` được thay bằng miền của chính kỹ năng đó.
 *
 * TOÀN BỘ THAM CHIẾU ĐƯỢC KIỂM LÚC NẠP: một node trỏ tới kỹ năng không có, một
 * tiên quyết trỏ tới node đã đổi tên, một `bodyCondition` gõ sai tên tàn phế —
 * cả ba đều làm node đó vĩnh viễn không mở được, và người chơi sẽ chỉ thấy một ô
 * mờ không bao giờ sáng lên. Nổ ở đây, lúc khởi động.
 */

import { z } from 'zod';
import nodesFile from '@data/skill-nodes.json';
import { permanentOf } from '@/systems/body/catalog';
import { effectSchema, type Effect } from '@/systems/character/effects';
import { allSkills, domainOfSkill, skillOf } from '@/systems/character/skills';
import { STAT_IDS, type StatId } from '@/systems/character/stats';

export const NODE_KINDS = ['technique', 'stance', 'passive', 'breakthrough', 'secret'] as const;
export type NodeKind = (typeof NODE_KINDS)[number];

export const USABLE_IN = ['duel', 'battle', 'siege', 'social', 'admin', 'field'] as const;
export type UsableIn = (typeof USABLE_IN)[number];

export const prereqSchema = z.object({
  skillLevel: z.number().min(0).optional(),
  /** AND — phải mở ĐỦ những node này. */
  nodes: z.array(z.string()).default([]),
  /** OR — chỉ cần một trong số này. */
  anyOfNodes: z.array(z.string()).default([]),
  stats: z.partialRecord(z.enum(STAT_IDS), z.number()).default({}),
  /** Id tàn phế vĩnh viễn trong `data/injuries.json` — nghịch cảnh mở nhánh (mục 7). */
  bodyCondition: z.array(z.string()).default([]),
  teacherRequired: z.boolean().default(false),
  /** Thầy phải CHÍNH MÌNH có node này (mục 8). */
  teacherNodeRequired: z.string().optional(),
  /** Id tri thức của Phần 4 — cổng cho node `secret`. */
  knowledge: z.array(z.string()).default([]),
});

export const nodeSchema = z.object({
  id: z.string().startsWith('node_'),
  skillId: z.string().startsWith('skill_'),
  name: z.string().min(1),
  description: z.string().default(''),
  kind: z.enum(NODE_KINDS),
  /** Điểm KN, nhân hệ số tải học tập lúc mua. */
  cost: z.number().min(0),
  prereq: prereqSchema.default({
    nodes: [],
    anyOfNodes: [],
    stats: {},
    bodyCondition: [],
    teacherRequired: false,
    knowledge: [],
  }),
  /** Tàn phế vĩnh viễn KHÓA node này lại (mục 7). */
  lockedBy: z.array(z.string()).default([]),
  usableIn: z.array(z.enum(USABLE_IN)).default([]),
  effects: z.array(effectSchema).default([]),
  /** Dữ liệu chiêu thức cho Phần 9/10 đọc. Phần 8 chỉ định nghĩa chỗ chứa. */
  mechanics: z.unknown().optional(),
  /** Node `secret` phải gắn với một NPC hoặc tổ chức CÓ THẬT trong thế giới. */
  source: z.object({ npc: z.string().default(''), organization: z.string().default('') }).optional(),
});

const templateSchema = nodeSchema
  .omit({ id: true, skillId: true })
  .extend({ id: z.string().min(1) });

const fileSchema = z.object({
  kinds: z.array(z.object({ id: z.enum(NODE_KINDS), name: z.string(), note: z.string().default('') })).min(1),
  usableIn: z.array(z.object({ id: z.enum(USABLE_IN), name: z.string() })).min(1),
  templates: z.array(templateSchema).default([]),
  nodes: z.array(nodeSchema).default([]),
});

export type SkillNode = z.infer<typeof nodeSchema>;
export type NodePrereq = z.infer<typeof prereqSchema>;

export class SkillNodeDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SkillNodeDataError';
  }
}

// ---------------------------------------------------------------------------
// Nạp và nở
// ---------------------------------------------------------------------------

/** `skill_kiem-thuat` → `kiem-thuat`. Dùng để đặt id node sinh từ khuôn. */
function slugOf(skillId: string): string {
  return skillId.startsWith('skill_') ? skillId.slice('skill_'.length) : skillId;
}

export function templateNodeId(skillId: string, templateId: string): string {
  return `node_${slugOf(skillId)}_${templateId}`;
}

/** Thay `$self` bằng miền của chính kỹ năng đang nở khuôn. */
function resolveEffects(effects: readonly Effect[], skillId: string): Effect[] {
  const domain = domainOfSkill(skillId);
  return effects.map((effect) => ({
    ...effect,
    domains: effect.domains.map((pattern) => (pattern === '$self' ? domain : pattern)),
  }));
}

function expandTemplate(template: z.infer<typeof templateSchema>, skillId: string): SkillNode {
  const skillName = skillOf(skillId)?.name ?? slugOf(skillId);
  return {
    ...template,
    id: templateNodeId(skillId, template.id),
    skillId,
    name: `${template.name} — ${skillName}`,
    effects: resolveEffects(template.effects, skillId),
    prereq: {
      ...template.prereq,
      // Tiên quyết của khuôn trỏ tới khuôn khác bằng id NGẮN; đổi sang id thật
      // của chính kỹ năng này, nếu không thì mọi kỹ năng sẽ cùng trỏ về một node.
      nodes: template.prereq.nodes.map((id) => (id.startsWith('node_') ? id : templateNodeId(skillId, id))),
      anyOfNodes: template.prereq.anyOfNodes.map((id) =>
        id.startsWith('node_') ? id : templateNodeId(skillId, id),
      ),
    },
  };
}

interface Loaded {
  byId: Map<string, SkillNode>;
  bySkill: Map<string, SkillNode[]>;
  kinds: Map<NodeKind, string>;
  usableIn: Map<UsableIn, string>;
}

function load(): Loaded {
  const parsed = fileSchema.safeParse(nodesFile);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new SkillNodeDataError(
      `data/skill-nodes.json hỏng ở "${issue?.path.join('.') ?? '?'}": ${issue?.message ?? 'không rõ'}`,
    );
  }

  const byId = new Map<string, SkillNode>();
  const add = (node: SkillNode): void => {
    if (byId.has(node.id)) throw new SkillNodeDataError(`node trùng id: ${node.id}`);
    byId.set(node.id, node);
  };

  for (const skill of allSkills()) {
    for (const template of parsed.data.templates) add(expandTemplate(template, skill.id));
  }
  for (const node of parsed.data.nodes) add(node);

  // --- Kiểm tham chiếu -----------------------------------------------------
  for (const node of byId.values()) {
    if (skillOf(node.skillId) === null) {
      throw new SkillNodeDataError(`node "${node.id}" thuộc kỹ năng "${node.skillId}" không có trong data/skills.json`);
    }
    for (const id of [...node.prereq.nodes, ...node.prereq.anyOfNodes]) {
      if (!byId.has(id)) throw new SkillNodeDataError(`node "${node.id}" đòi tiên quyết "${id}" không tồn tại`);
    }
    const teacherNode = node.prereq.teacherNodeRequired;
    if (teacherNode !== undefined && !byId.has(teacherNode)) {
      throw new SkillNodeDataError(`node "${node.id}" đòi thầy có node "${teacherNode}" không tồn tại`);
    }
    for (const id of [...node.prereq.bodyCondition, ...node.lockedBy]) {
      if (permanentOf(id) === null) {
        throw new SkillNodeDataError(
          `node "${node.id}" trỏ tới tàn phế "${id}" không có trong bảng permanent của data/injuries.json`,
        );
      }
    }
    // Mục 9: một chiêu KHÔNG được im lặng dùng được ở mọi nơi.
    if ((node.kind === 'technique' || node.kind === 'stance') && node.usableIn.length === 0) {
      throw new SkillNodeDataError(`node "${node.id}" là ${node.kind} nhưng không khai usableIn (mục 9)`);
    }
    // Mục 6: node bí truyền phải gắn với người thật và với một cổng tri thức.
    if (node.kind === 'secret') {
      if (node.prereq.knowledge.length === 0) {
        throw new SkillNodeDataError(`node bí truyền "${node.id}" không khai cổng tri thức (mục 6)`);
      }
      const source = node.source;
      if (source === undefined || (source.npc === '' && source.organization === '')) {
        throw new SkillNodeDataError(
          `node bí truyền "${node.id}" không gắn với NPC hay tổ chức nào có thật trong thế giới (mục 6)`,
        );
      }
    }
  }

  // --- Chu trình ------------------------------------------------------------
  // Một vòng trong tiên quyết là một nhóm node vĩnh viễn không mở được, và trên
  // UI thì chúng chỉ là mấy ô mờ không bao giờ sáng. Nổ lúc khởi động.
  const status = new Map<string, 'visiting' | 'done'>();
  const visit = (id: string, trail: string[]): void => {
    const state = status.get(id);
    if (state === 'done') return;
    if (state === 'visiting') {
      throw new SkillNodeDataError(`đồ thị node có chu trình: ${[...trail.slice(trail.indexOf(id)), id].join(' → ')}`);
    }
    status.set(id, 'visiting');
    const node = byId.get(id);
    for (const next of [...(node?.prereq.nodes ?? []), ...(node?.prereq.anyOfNodes ?? [])]) {
      visit(next, [...trail, id]);
    }
    status.set(id, 'done');
  };
  for (const id of byId.keys()) visit(id, []);

  const bySkill = new Map<string, SkillNode[]>();
  for (const node of byId.values()) {
    const bucket = bySkill.get(node.skillId) ?? [];
    bucket.push(node);
    bySkill.set(node.skillId, bucket);
  }

  return {
    byId,
    bySkill,
    kinds: new Map(parsed.data.kinds.map((kind) => [kind.id, kind.name] as const)),
    usableIn: new Map(parsed.data.usableIn.map((entry) => [entry.id, entry.name] as const)),
  };
}

const DATA = load();

// ---------------------------------------------------------------------------
// Đọc
// ---------------------------------------------------------------------------

export function allNodes(): SkillNode[] {
  return [...DATA.byId.values()];
}

export function nodeOf(id: string): SkillNode | null {
  return DATA.byId.get(id) ?? null;
}

export function nodeName(id: string): string {
  return DATA.byId.get(id)?.name ?? id;
}

export function nodesForSkill(skillId: string): SkillNode[] {
  return [...(DATA.bySkill.get(skillId) ?? [])];
}

export function kindName(kind: NodeKind): string {
  return DATA.kinds.get(kind) ?? kind;
}

export function usableInName(id: UsableIn): string {
  return DATA.usableIn.get(id) ?? id;
}

export function usableInNames(node: SkillNode): string {
  return node.usableIn.map(usableInName).join(', ');
}

/** Node đột phá của một kỹ năng — cửa duy nhất lên bậc Tông sư. */
export function breakthroughNodesOf(skillId: string): SkillNode[] {
  return nodesForSkill(skillId).filter((node) => node.kind === 'breakthrough');
}

/** Node mở ra nhờ một tàn phế vĩnh viễn (mục 7). */
export function nodesForBodyCondition(permanentId: string): SkillNode[] {
  return allNodes().filter((node) => node.prereq.bodyCondition.includes(permanentId));
}

/**
 * Độ sâu tiên quyết — UI xếp cột theo con số này.
 *
 * Tính bằng đường dài nhất về tới một node không có tiên quyết node nào. Đồ thị
 * đã được kiểm không có chu trình lúc nạp, nên đệ quy ở đây luôn dừng.
 */
export function layerOf(id: string, seen: Set<string> = new Set()): number {
  const node = DATA.byId.get(id);
  if (node === undefined || seen.has(id)) return 0;
  seen.add(id);
  const parents = [...node.prereq.nodes, ...node.prereq.anyOfNodes];
  if (parents.length === 0) return 0;
  return 1 + Math.max(...parents.map((parent) => layerOf(parent, seen)));
}

/** Chỉ số chính của kỹ năng mà node này thuộc về — dùng cho trần theo chỉ số. */
export function statOfNode(node: SkillNode): StatId | null {
  return skillOf(node.skillId)?.stat ?? null;
}
