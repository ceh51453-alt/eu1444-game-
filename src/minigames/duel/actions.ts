/**
 * BẢNG HÀNH ĐỘNG THÀNH HÀNH ĐỘNG DÙNG ĐƯỢC (Phần 9 mục 4).
 *
 * `data/duel-matrix.json` khai KHUÔN; file này nở khuôn ra theo người đang cầm
 * vũ khí gì, đứng cách bao xa, còn bao nhiêu sức, và đã mở những node nào của
 * Phần 8. Cùng một dòng "Đâm" cho ra một tầm với khác khi trong tay là cây
 * thương dài và khi trong tay là con dao găm — mục 2 gọi đó là toàn bộ nghệ
 * thuật của quyết đấu.
 *
 * CHIÊU THỨC CỦA PHẦN 8 KHÔNG PHẢI MỘT HỆ RIÊNG. Mục 4 nói "mọi node
 * kind='technique' có usableIn chứa 'duel'" là một hành động, nên chúng nở ra
 * từ CÙNG bảng hành động: một chiêu là một đòn nền cộng thêm thứ mà `mechanics`
 * của node nói. Nhờ vậy ma trận tương khắc, tầm với, thể lực và quy tắc giáp áp
 * cho chiêu thức y như áp cho đòn thường, không phải viết lại lần thứ hai.
 */

import { z } from 'zod';
import { nodeOf, type SkillNode } from '@/systems/skills/nodes';
import { domainOfSkill } from '@/systems/character/skills';
import {
  actionOf,
  allActions,
  reachConfig,
  speedRow,
  staminaConfig,
  tempoConfig,
  type ActionCategory,
  type DuelAction,
  type SpeedId,
} from './data';
import { bluntedCause } from './equipment';
import type { Fighter } from './types';

/** Một hành động đã nở đầy đủ cho MỘT đấu sĩ ở MỘT hoàn cảnh. */
export interface ResolvedAction {
  /** Khoá duy nhất cho UI và cho biên niên: `actionId` hoặc `actionId:nodeId`. */
  key: string;
  actionId: string;
  nodeId: string;
  name: string;
  category: ActionCategory;
  base: DuelAction;
  /** Kỹ năng thật sẽ kiểm. Rỗng nghĩa là đòn không thuộc kỹ năng nào. */
  skillId: string;
  domain: string;
  reach: { min: number; max: number };
  /** Nhãn của hành động CỘNG nhãn của vũ khí — ma trận tra bộ này. */
  tags: string[];
  speed: SpeedId;
  initiative: number;
  staminaCost: number;
  /** Đòn tìm khe hở giáp (dao găm, hoặc node `targetsGaps`). */
  targetsGaps: boolean;
  /** Đòn gỡ được phần lớn mức phạt đâm-vào-giáp-tấm (node nửa kiếm). */
  armorPiercing: boolean;
  severityBonus: number;
  /** Nguyên nhân thương tích, id trong bảng `causes` của `data/injuries.json`. */
  cause: string;
  /** Đòn này có thể gây thương tích không. */
  harmful: boolean;
  attack: boolean;
  defence: boolean;
}

const mechanicsSchema = z
  .object({
    /** Đòn nền mà chiêu này dựa lên. Không khai thì engine suy từ những cờ dưới. */
    baseAction: z.string(),
    armorPiercing: z.boolean(),
    targetsGaps: z.boolean(),
    severityBonus: z.number(),
    /** Chỉ dùng được khi hai vũ khí đã dính vào nhau. */
    requiresBind: z.boolean(),
    disarmChance: z.string(),
    /** Cần đang ngồi trên lưng ngựa — Phần 10 mới có ngựa trong quyết đấu. */
    mounted: z.boolean(),
    stance: z.string(),
  })
  .partial();

type Mechanics = z.infer<typeof mechanicsSchema>;

function mechanicsOf(node: SkillNode): Mechanics {
  const parsed = mechanicsSchema.safeParse(node.mechanics ?? {});
  return parsed.success ? parsed.data : {};
}

// ---------------------------------------------------------------------------
// Nở một hành động
// ---------------------------------------------------------------------------

export interface ResolveOptions {
  /** Vũ khí cùn của đấu tập và đấu giải (mục 9). */
  blunted: boolean;
}

function skillFor(fighter: Fighter, action: DuelAction): string {
  if (action.skill === '$weapon') return fighter.loadout.weapon.skill;
  if (action.skill === '$shield') {
    const shield = fighter.loadout.shieldId;
    return shield === '' ? fighter.loadout.weapon.skill : 'skill_khien';
  }
  return action.skill;
}

function reachFor(fighter: Fighter, action: DuelAction): { min: number; max: number } {
  const reach = action.reach;
  if (reach === undefined) return { min: 0, max: 0 };
  if (reach === '$weapon') return { ...fighter.loadout.weapon.reach };
  return { ...reach };
}

function causeFor(fighter: Fighter, tags: readonly string[], options: ResolveOptions): string {
  if (options.blunted) return bluntedCause();
  const weapon = fighter.loadout.weapon;
  if (tags.includes('dam') && weapon.thrustCause !== undefined) return weapon.thrustCause;
  return weapon.cause;
}

/**
 * Chi phí thể lực thật: chi phí khuôn × hệ số tốc độ × hệ số nặng của giáp.
 *
 * Giáp nhân vào CHI PHÍ chứ không trừ thẳng vào thanh thể lực mỗi hiệp — hai
 * cách cho ra hai cảm giác khác nhau. Nhân vào chi phí nghĩa là người mặc giáp
 * tấm đứng yên thì gần như không mất gì, còn cứ mỗi lần vung kiếm là mất nhiều
 * hơn người kia. Đó chính là chuyện xảy ra thật.
 */
function staminaFor(fighter: Fighter, action: DuelAction): number {
  const speed = speedRow(action.speed);
  return Math.round(action.stamina * speed.staminaFactor * fighter.loadout.weightFactor * 10) / 10;
}

/** Nở một hành động nền (không có node). */
export function resolveAction(
  fighter: Fighter,
  actionId: string,
  options: ResolveOptions,
): ResolvedAction | null {
  const action = actionOf(actionId);
  if (action === null) return null;

  const attack = action.tags.includes('tan-cong');
  // Nhãn của hành động là nhãn của ĐÒN, không phải của vũ khí: cùng một cây kích
  // thì "Đâm" mang nhãn `dam` và "Đập" mang nhãn `dap`, và ma trận phải thấy
  // đúng một trong hai. Vũ khí chỉ quyết định đòn ấy có bấm được không, qua
  // `requiresWeaponTag`.
  const tags = [...action.tags];
  const skillId = skillFor(fighter, action);
  const domain = action.domain !== '' ? action.domain : skillId === '' ? 'combat.duel' : domainOfSkill(skillId);

  return {
    key: action.id,
    actionId: action.id,
    nodeId: '',
    name: action.name,
    category: action.category,
    base: action,
    skillId,
    domain,
    reach: reachFor(fighter, action),
    tags,
    speed: action.speed,
    initiative: speedRow(action.speed).initiative,
    staminaCost: staminaFor(fighter, action),
    targetsGaps: attack && tags.includes('dam') && fighter.loadout.weapon.gapSeeking,
    armorPiercing: false,
    severityBonus: action.severityBonus,
    cause: causeFor(fighter, tags, options),
    harmful: attack && !action.noInjury,
    attack,
    defence: action.tags.includes('phong-thu'),
  };
}

/** Đòn nền mà một chiêu thức dựa lên, khi node không khai `baseAction`. */
function inferBase(fighter: Fighter, mechanics: Mechanics): string {
  if (mechanics.baseAction !== undefined && actionOf(mechanics.baseAction) !== null) return mechanics.baseAction;
  if (mechanics.disarmChance !== undefined) return 'tuoc-vu-khi';
  if (mechanics.targetsGaps === true || mechanics.armorPiercing === true) return 'dam';

  const weaponTags = fighter.loadout.weapon.tags;
  if (weaponTags.includes('chem')) return 'chem-cheo';
  if (weaponTags.includes('dam')) return 'dam';
  return 'dap';
}

/** Nở một chiêu thức hoặc một thế của Phần 8 thành hành động dùng được. */
export function resolveNodeAction(
  fighter: Fighter,
  nodeId: string,
  options: ResolveOptions,
): ResolvedAction | null {
  const node = nodeOf(nodeId);
  if (node === null) return null;
  if (!node.usableIn.includes('duel')) return null;
  if (node.kind !== 'technique' && node.kind !== 'stance' && node.kind !== 'secret') return null;

  const mechanics = mechanicsOf(node);
  // Ngựa chưa vào được lưới đấu tay đôi: mục 2 khai đấu trường là chỗ đi bộ, còn
  // chiến đấu trên yên là chuyện của Phần 10. Node ấy vẫn tồn tại và vẫn cộng
  // hiệu ứng qua registry — nó chỉ không mọc thêm một nút bấm ở đây.
  if (mechanics.mounted === true) return null;

  const baseId = node.kind === 'stance' ? 'doi-the' : inferBase(fighter, mechanics);
  const resolved = resolveAction(fighter, baseId, options);
  if (resolved === null) return null;

  return {
    ...resolved,
    key: `${resolved.actionId}:${node.id}`,
    nodeId: node.id,
    name: node.name,
    category: node.kind === 'stance' ? 'the' : 'ky-thuat',
    targetsGaps: resolved.targetsGaps || mechanics.targetsGaps === true,
    armorPiercing: resolved.armorPiercing || mechanics.armorPiercing === true,
    severityBonus: resolved.severityBonus + (mechanics.severityBonus ?? 0),
  };
}

// ---------------------------------------------------------------------------
// Bấm được hay không
// ---------------------------------------------------------------------------

export type Unavailable =
  | 'het-the-luc'
  | 'buoc-phai-thu'
  | 'the-tran-khoa'
  | 'sai-vu-khi'
  | 'khong-co-khien'
  | 'ngoai-tam'
  | 'chua-giap-la-ca'
  | 'khong-doi-thu';

export const UNAVAILABLE_LABELS: Readonly<Record<Unavailable, string>> = {
  'het-the-luc': 'không còn đủ sức',
  'buoc-phai-thu': 'kiệt sức, chỉ còn thủ được',
  'the-tran-khoa': 'đang bị ép, đòn này không mở được',
  'sai-vu-khi': 'vũ khí trong tay không làm được đòn này',
  'khong-co-khien': 'không có khiên',
  'ngoai-tam': 'ngoài tầm với',
  'chua-giap-la-ca': 'phải áp sát mới dùng được',
  'khong-doi-thu': 'không có ai để đánh',
};

export interface ActionOption {
  action: ResolvedAction;
  /** `null` nghĩa là bấm được. */
  blocked: Unavailable | null;
}

/**
 * Vì sao một hành động không bấm được — trả về LÝ DO chứ không lặng lẽ giấu nút.
 *
 * Mục 11 bắt mỗi nút hiện chi phí thể lực, tầm và tốc độ. Giấu hẳn nút thì
 * người chơi không bao giờ học được rằng cây thương dài của mình vô dụng ở cự
 * ly này — họ chỉ thấy bảng hành động đổi và không hiểu vì sao.
 */
export function availability(
  fighter: Fighter,
  foe: Fighter,
  gap: number,
  action: ResolvedAction,
): Unavailable | null {
  const stamina = staminaConfig();
  const tempo = tempoConfig();
  const reach = reachConfig();

  if (action.staminaCost > fighter.stamina) return 'het-the-luc';
  if (action.base.requiresShield && fighter.loadout.shieldId === '') return 'khong-co-khien';

  const weaponTags = fighter.loadout.weapon.tags;
  for (const needed of action.base.requiresWeaponTag) {
    if (!weaponTags.includes(needed)) return 'sai-vu-khi';
  }

  if (action.attack) {
    if (foe.leftArena) return 'khong-doi-thu';
    if (fighter.stamina < stamina.forcedDefenceBelow) return 'buoc-phai-thu';
    if (fighter.tempo < tempo.lockAttackBelow && action.speed !== 'nhanh') return 'the-tran-khoa';
    if (gap > action.reach.max + reach.missBeyond) return 'ngoai-tam';
    if (action.tags.includes('giap-la-ca') && gap > reach.grappleAt) return 'chua-giap-la-ca';
  }

  return null;
}

/**
 * Mọi hành động của một đấu sĩ ở hiệp này, kèm lý do nút nào tắt.
 *
 * Thứ tự CỐ ĐỊNH: theo thứ tự trong `data/duel-matrix.json`, rồi tới chiêu thức
 * theo thứ tự node. Bộ chọn softmax của NPC duyệt đúng danh sách này, nên thứ tự
 * đổi là mọi cú tung sau đó đổi theo (R3).
 */
export function optionsFor(
  fighter: Fighter,
  foe: Fighter,
  gap: number,
  options: ResolveOptions,
): ActionOption[] {
  const list: ActionOption[] = [];

  for (const base of allActions()) {
    // `doi-the` chỉ hiện qua từng thế đã mở, không hiện dưới dạng khuôn trống.
    if (base.id === 'doi-the') continue;
    const resolved = resolveAction(fighter, base.id, options);
    if (resolved === null) continue;
    list.push({ action: resolved, blocked: availability(fighter, foe, gap, resolved) });
  }

  for (const nodeId of fighter.nodes) {
    const resolved = resolveNodeAction(fighter, nodeId, options);
    if (resolved === null) continue;
    list.push({ action: resolved, blocked: availability(fighter, foe, gap, resolved) });
  }

  return list;
}

/** Chỉ những hành động bấm được. */
export function usableActions(
  fighter: Fighter,
  foe: Fighter,
  gap: number,
  options: ResolveOptions,
): ResolvedAction[] {
  return optionsFor(fighter, foe, gap, options)
    .filter((entry) => entry.blocked === null)
    .map((entry) => entry.action);
}

/** Hành động cuối cùng còn lại khi mọi thứ khác bị khóa: đứng thở. */
export function fallbackAction(fighter: Fighter, options: ResolveOptions): ResolvedAction {
  const resolved = resolveAction(fighter, 'xoay-mat', options);
  if (resolved !== null) return resolved;
  throw new Error('data/duel-matrix.json thiếu hành động "xoay-mat"');
}
