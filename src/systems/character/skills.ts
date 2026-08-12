/**
 * DANH MỤC KỸ NĂNG PHẲNG (Phần 6 mục 5) — nạp từ `/data/skills.json` theo R5.
 *
 * Cây kỹ năng, nhánh chuyên sâu, trần tự học và thầy dạy là Phần 8. Ở đây chỉ
 * cần đủ để một phép kiểm biết nó dùng chỉ số nào và chạy hệ nào.
 *
 * MIỀN suy thẳng từ id (`skill_kiem-thuat` → `skill.kiem-thuat`) chứ không khai
 * riêng một field: hai chỗ khai cùng một thứ là hai chỗ lệch nhau được, và một
 * miền gõ sai thì mọi nguồn modifier khai `skill.*` im lặng không bao giờ chạy —
 * đúng loại lỗi mà Phần 5 mục 7 cảnh báo.
 */

import { z } from 'zod';
import skillsFile from '@data/skills.json';
import { STAT_IDS, type StatId } from './stats';

export const skillSchema = z.object({
  id: z.string().startsWith('skill_'),
  name: z.string().min(1),
  group: z.string().min(1),
  stat: z.enum(STAT_IDS),
  /** Chỉ d100 và 3d6: d20 là từng đòn đối kháng, pool là quy mô đơn vị (Phần 5 mục 2). */
  system: z.enum(['d100', '3d6']),
  description: z.string().default(''),
  /** Đường lui cho lượt tự do — chỉ được có đúng một kỹ năng như thế. */
  fallback: z.boolean().default(false),
});

export const skillGroupSchema = z.object({ id: z.string().min(1), name: z.string().min(1) });

export type Skill = z.infer<typeof skillSchema>;
export type SkillGroup = z.infer<typeof skillGroupSchema>;
export type SkillSystem = Skill['system'];

const fileSchema = z.object({
  groups: z.array(skillGroupSchema),
  skills: z.array(skillSchema),
});

export class SkillDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SkillDataError';
  }
}

interface Loaded {
  groups: SkillGroup[];
  skills: Map<string, Skill>;
  byDomain: Map<string, Skill>;
  fallback: Skill;
}

/** `skill_kiem-thuat` → `skill.kiem-thuat`. */
export function domainOfSkill(skillId: string): string {
  return `skill.${skillId.slice('skill_'.length)}`;
}

function load(): Loaded {
  const parsed = fileSchema.safeParse(skillsFile);
  if (!parsed.success) {
    throw new SkillDataError(`data/skills.json hỏng: ${parsed.error.issues[0]?.message ?? 'không rõ'}`);
  }

  const groupIds = new Set(parsed.data.groups.map((group) => group.id));
  const skills = new Map<string, Skill>();
  const byDomain = new Map<string, Skill>();
  let fallback: Skill | null = null;

  for (const skill of parsed.data.skills) {
    if (skills.has(skill.id)) throw new SkillDataError(`kỹ năng trùng id: ${skill.id}`);
    if (!groupIds.has(skill.group)) {
      throw new SkillDataError(`kỹ năng "${skill.id}" thuộc nhóm "${skill.group}" không có trong danh sách nhóm`);
    }
    if (skill.fallback) {
      if (fallback !== null) throw new SkillDataError('chỉ được có đúng một kỹ năng fallback');
      fallback = skill;
    }
    skills.set(skill.id, skill);
    byDomain.set(domainOfSkill(skill.id), skill);
  }

  if (fallback === null) {
    throw new SkillDataError('thiếu kỹ năng fallback cho lượt tự do (miền skill.chung của Phần 5 mục 12.6)');
  }

  return { groups: parsed.data.groups, skills, byDomain, fallback };
}

const DATA = load();

export function allSkills(): Skill[] {
  return [...DATA.skills.values()];
}

export function skillGroups(): SkillGroup[] {
  return [...DATA.groups];
}

export function skillsInGroup(groupId: string): Skill[] {
  return allSkills().filter((skill) => skill.group === groupId);
}

export function skillOf(id: string): Skill | null {
  return DATA.skills.get(id) ?? null;
}

export function skillName(id: string): string {
  return DATA.skills.get(id)?.name ?? id;
}

export function groupName(id: string): string {
  return DATA.groups.find((group) => group.id === id)?.name ?? id;
}

/** Kỹ năng của một miền kiểm định, hoặc null khi miền không thuộc về kỹ năng nào. */
export function skillForDomain(domain: string): Skill | null {
  return DATA.byDomain.get(domain) ?? null;
}

/** Kỹ năng nền cho lượt tự do — `skill.chung` của Phần 5 mục 12.6. */
export function fallbackSkill(): Skill {
  return DATA.fallback;
}

export function statForDomain(domain: string): StatId | null {
  return skillForDomain(domain)?.stat ?? null;
}
