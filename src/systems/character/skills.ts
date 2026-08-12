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

/**
 * Những cách nói hành động thường gặp không trùng nguyên tên kỹ năng.
 *
 * Đây chỉ là bộ nhận diện cơ học chạy TRƯỚC lời gọi model (R1), không phải một
 * bộ hiểu ngôn ngữ. UI luôn cho người chơi chọn đè một kỹ năng, nên trường hợp
 * mơ hồ không bị khóa vào phán đoán của danh sách này.
 */
const ACTION_ALIASES: Readonly<Record<string, readonly string[]>> = {
  'skill_kiem-thuat': ['rút kiếm', 'đấu kiếm', 'chém', 'đâm kiếm'],
  'skill_thuong-kich': ['dùng giáo', 'dùng thương', 'đâm giáo'],
  'skill_riu-bua': ['dùng rìu', 'dùng búa', 'bổ rìu'],
  'skill_dao-gam': ['dao găm', 'dùng dao'],
  'skill_tay-khong': ['vật ngã', 'đấm', 'đá hắn', 'khóa tay', 'tay không'],
  'skill_khien': ['dùng khiên', 'đỡ bằng khiên'],
  'skill_cung-no': ['bắn cung', 'bắn nỏ', 'giương cung'],
  'skill_hoa-khi': ['bắn súng', 'khai hỏa'],
  'skill_nem-lao': ['ném lao', 'ném rìu', 'ném đá'],
  'skill_cuoi-ngua': ['cưỡi ngựa', 'phi ngựa', 'điều khiển ngựa'],
  'skill_the-luc': ['chạy', 'nâng', 'kéo', 'phá cửa'],
  'skill_leo-treo': ['trèo', 'leo tường', 'leo dây', 'leo vách'],
  'skill_nhao-lon': ['nhảy qua', 'lăn tránh', 'giữ thăng bằng'],
  'skill_boi-loi': ['bơi', 'qua sông'],
  'skill_cheo-thuyen': ['chèo thuyền', 'lái thuyền'],
  'skill_do-duong': ['tìm đường', 'định hướng', 'khỏi lạc'],
  'skill_ren-sat': ['rèn', 'sửa kiếm', 'sửa giáp'],
  'skill_moc': ['làm đồ gỗ', 'sửa đồ gỗ'],
  'skill_xay-cat': ['xây tường', 'trộn vữa', 'xếp đá'],
  'skill_che-tac': ['khắc', 'khảm', 'làm trang sức'],
  'skill_co-khi': ['sửa máy', 'ròng rọc', 'máy bắn đá'],
  'skill_gia-kim': ['chưng cất', 'luyện thuốc súng'],
  'skill_hoc-van': ['tra sách', 'đọc sách', 'viết thư'],
  'skill_ngon-ngu': ['dịch', 'phiên dịch', 'nói tiếng'],
  'skill_su-ky': ['tra lịch sử', 'nhớ lịch sử', 'gia phả'],
  'skill_luat-le': ['tra luật', 'viện luật', 'giáo luật'],
  'skill_thu-phap': ['chép sách', 'giả chữ', 'giả ấn'],
  'skill_muu-luoc': ['lập kế hoạch', 'bày mưu', 'chiến lược'],
  'skill_dam-phan': ['thuyết phục', 'đàm phán', 'thương lượng'],
  'skill_mac-ca': ['trả giá', 'mua rẻ', 'bán giá'],
  'skill_gay-thien-cam': ['làm quen', 'lấy lòng', 'tạo thiện cảm'],
  'skill_uy-hiep': ['đe dọa', 'hăm dọa', 'uy hiếp'],
  'skill_chi-huy': ['ra lệnh', 'chỉ huy', 'hiệu triệu binh'],
  'skill_kich-dong': ['kích động', 'xúi giục đám đông'],
  'skill_nghi-thuc': ['hành lễ', 'yết kiến', 'nghi thức'],
  'skill_doc-nguoi': ['đọc vị', 'xem phản ứng', 'đoán ý'],
  'skill_an-ui': ['an ủi', 'trấn an'],
  'skill_len-lut': ['lẻn', 'đi nhẹ', 'không gây tiếng động'],
  'skill_tron-nap': ['ẩn nấp', 'trốn', 'núp'],
  'skill_mo-khoa': ['mở khóa', 'phá khóa'],
  'skill_moc-tui': ['móc túi', 'trộm túi'],
  'skill_lua-doi': ['nói dối', 'lừa', 'bịa chuyện'],
  'skill_gia-dang': ['cải trang', 'giả dạng'],
  'skill_do-tham': ['nghe lỏm', 'theo dõi', 'do thám'],
  'skill_phan-gian': ['tìm gián điệp', 'phản gián'],
  'skill_doc-duoc': ['đầu độc', 'nhận độc', 'pha độc'],
  'skill_ke-toan': ['kiểm sổ', 'sổ sách', 'kế toán'],
  'skill_thu-thue': ['thu thuế', 'định thuế'],
  'skill_hau-can': ['tiếp tế', 'hậu cần', 'lương thảo'],
  'skill_xay-dung': ['quản lý công trình', 'điều công trường', 'xây pháo đài'],
  'skill_cai-tri': ['cai trị', 'quản trị vùng', 'ban hành chính sách'],
  'skill_xu-an': ['xét xử', 'phán xử', 'xử án'],
  'skill_ngoai-giao': ['lập liên minh', 'bang giao', 'ngoại giao'],
  'skill_tinh-bao': ['mạng lưới gián điệp', 'tổ chức tình báo'],
  'skill_huyen-thuat': ['thi triển phép', 'nghiên cứu ma thuật'],
  'skill_cam-ung': ['cảm nhận ma lực', 'dò ma lực'],
  'skill_phu-chu': ['vẽ phù', 'khắc phù', 'phù chú'],
  'skill_boi-toan': ['bói', 'đọc điềm'],
  'skill_tru-ta': ['trừ tà', 'xua quỷ'],
  'skill_sinh-ton': ['dựng trại', 'tìm nước', 'nhóm lửa'],
  'skill_san-ban': ['săn', 'đặt bẫy'],
  'skill_truy-dau': ['lần dấu', 'dấu chân', 'truy dấu'],
  'skill_tham-do': ['quan sát', 'nhìn quanh', 'tìm kiếm'],
  'skill_dao-ham': ['đào hầm', 'đào hào'],
  'skill_chiu-dung': ['chịu đau', 'chịu rét', 'chịu đựng'],
  'skill_y-thuat': ['khám bệnh', 'chữa bệnh', 'băng bó'],
  'skill_phau-thuat': ['phẫu thuật', 'khâu vết thương', 'cưa chân'],
  'skill_duoc-thao': ['hái thuốc', 'tìm thảo dược', 'bào chế thuốc'],
  'skill_ho-sinh': ['đỡ đẻ', 'hộ sinh'],
  'skill_thu-y': ['chữa ngựa', 'chữa gia súc'],
};

function normalizedAction(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toLowerCase()
    .replace(/đ/gu, 'd')
    .replace(/[^a-z0-9]+/gu, ' ')
    .trim();
}

/** Nhận diện kỹ năng tốt nhất cho hành động; không chắc thì trả kỹ năng fallback. */
export function inferSkillForAction(action: string): Skill {
  const haystack = ` ${normalizedAction(action)} `;
  let chosen: Skill | null = null;
  let bestLength = 0;

  for (const skill of allSkills()) {
    const aliases = [skill.name, ...(ACTION_ALIASES[skill.id] ?? [])];
    for (const alias of aliases) {
      const needle = normalizedAction(alias);
      if (needle.length <= bestLength || !haystack.includes(` ${needle} `)) continue;
      chosen = skill;
      bestLength = needle.length;
    }
  }

  return chosen ?? fallbackSkill();
}
