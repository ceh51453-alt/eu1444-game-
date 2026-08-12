/**
 * NGUỒN MODIFIER CỦA PHẦN 9 — cắm vào registry của Phần 5 mục 7.
 *
 * README mục 8.4 xếp registry là chỗ dễ hỏng thứ tư của cả dự án, và lý do đúng
 * hệt ở đây: nếu Phần 9 tự cộng thế trận, thể lực và tương khắc thẳng vào cú
 * tung thì những dòng ấy KHÔNG xuất hiện trong `CheckResult.modifiers`. Người
 * chơi thua một hiệp mà không biết mình thua vì kiệt sức hay vì chọn sai đòn, và
 * game không có reroll nên họ chỉ có thể kết luận là game ăn gian.
 *
 * MỘT CHỖ LỆCH SO VỚI PHẦN 6, 7, 8 — VÀ VÌ SAO:
 *
 * Ba phần kia đọc thẳng `ctx.state`, vì thứ chúng cần đều nằm trong state. Phần
 * 9 thì không: ĐỐI THỦ không có mặt trong `GameState` (Phần 7 chỉ mô hình hóa
 * cơ thể người chơi, Phần 8 chỉ giữ node của người chơi), và thứ quyết định một
 * hiệp — hai bên vừa chọn đòn gì, đứng cách nhau mấy ô, quay mặt hướng nào —
 * không phải state mà là một tình huống sống đúng một cú tung.
 *
 * Nên trước mỗi lần phân giải, engine CÔNG BỐ một ảnh chụp chỉ-đọc của sàn đấu
 * qua `publishExchange`, và gỡ xuống ngay sau đó. Các nguồn dưới đây tra ảnh
 * chụp ấy theo `ctx.actor`. Chúng vẫn THUẦN theo luật 1 của registry: cùng một
 * ảnh chụp và cùng một `ctx` thì luôn cho ra cùng một danh sách, không ghi
 * state, không tung xúc sắc.
 */

import type { Modifier, ModifierContext, ModifierSource } from '@/systems/check/registry';
import { domainMatches, modifierSources, registerModifierSource } from '@/systems/check/registry';
import { bonusFor, penaltyFor, scaleToSystem } from '@/systems/check/sources';
import { STATS, statContribution, type StatId } from '@/systems/character/stats';
import { statForDomain } from '@/systems/character/skills';
import { gearEffect, gearName } from '@/systems/character/gear';
import { nodeModifierLines } from '@/systems/skills/modifiers';
import { nodeOf } from '@/systems/skills/nodes';
import { injuryPenalty, painOf, painPenalty } from '@/systems/body/vitals';
import { facingConfig, staminaConfig, tempoConfig } from './data';
import type { MatchupSide } from './matrix';
import type { Arc } from './arena';
import type { Fighter } from './types';

export const STAT_SOURCE_ID = 'duel.chi-so';
export const MATRIX_SOURCE_ID = 'duel.tuong-khac';
export const TEMPO_SOURCE_ID = 'duel.the-tran';
export const STAMINA_SOURCE_ID = 'duel.the-luc';
export const FACING_SOURCE_ID = 'duel.huong-mat';
export const REACH_SOURCE_ID = 'duel.tam-voi';
export const GROUND_SOURCE_ID = 'duel.dia-hinh';
export const ARMOR_SOURCE_ID = 'duel.giap';
export const INJURY_SOURCE_ID = 'duel.thuong-tich';
export const NODE_SOURCE_ID = 'duel.chieu-thuc';
export const GEAR_SOURCE_ID = 'duel.trang-bi';

// ---------------------------------------------------------------------------
// Ảnh chụp sàn đấu
// ---------------------------------------------------------------------------

/** Mọi thứ một nguồn cần biết về MỘT đấu sĩ trong MỘT pha va chạm. */
export interface ExchangeView {
  fighter: Fighter;
  /** Gói tương khắc của chính bên này (mục 5). */
  matchup: MatchupSide;
  /** Cung mà đòn của bên này rơi vào của đối thủ (mục 2). */
  arc: Arc;
  /** Khoảng cách hiện tại, tính bằng ô. */
  gap: number;
  /** Điều chỉnh vì tầm với: quá xa, quá gần, hoặc 0. */
  reachMod: number;
  reachNote: string;
  /** Điều chỉnh của địa hình dưới chân. */
  groundMod: number;
  groundName: string;
  /** Chênh lệch cao độ so với đối thủ. */
  elevation: number;
  /** Điều chỉnh vì loại giáp đối thủ mặc ở vùng nhắm tới (mục 7). */
  armorMod: number;
  armorNote: string;
  /** Bên này đang tấn công hay đang thủ trong pha này. */
  attacking: boolean;
}

export interface Exchange {
  /** `CheckSpec.actor` → ảnh chụp. Người chơi mang khoá rỗng. */
  byActor: Map<string, ExchangeView>;
}

let current: Exchange | null = null;

/** Engine gọi ngay trước khi phân giải một pha, và gỡ xuống ngay sau đó. */
export function publishExchange(exchange: Exchange | null): void {
  current = exchange;
}

export function currentExchange(): Exchange | null {
  return current;
}

function viewOf(ctx: ModifierContext): ExchangeView | null {
  return current?.byActor.get(ctx.actor) ?? null;
}

/** Đấu sĩ này có phải nhân vật người chơi không (quy ước `actor` rỗng của Phần 5). */
function isPlayer(ctx: ModifierContext): boolean {
  return ctx.actor === '';
}

// ---------------------------------------------------------------------------
// 1. Chỉ số — vế Phần 6 cố ý để trống cho miền `combat.*`, và vế của NPC
// ---------------------------------------------------------------------------

/**
 * Phần 6 mục 10.7 viết thẳng: "Miền không thuộc kỹ năng nào (`combat.*`,
 * `siege.*`…) thì im lặng bỏ qua — Phần 9–11 là chủ sở hữu của những miền đó và
 * sẽ khai chỉ số của chúng." Đây là chỗ khai.
 *
 * Nguồn này cũng gánh phần chỉ số của ĐỐI THỦ ở MỌI miền, kể cả `skill.*`: NPC
 * không có mặt trong slice `character`, nên `character.chi-so` của Phần 6 trả về
 * null cho họ. Không có vế ấy thì mọi NPC đánh nhau như thể chỉ số bằng 0 — và
 * bài test 200 trận của mục 12.10 sẽ đo một thứ không phải trận đấu.
 */
const COMBAT_STATS: Readonly<Record<string, StatId>> = {
  'combat.ne-tranh': 'agi',
  'combat.duel': 'agi',
};

function statForDuelDomain(domain: string): StatId | null {
  const direct = COMBAT_STATS[domain];
  if (direct !== undefined) return direct;
  if (domain.startsWith('combat.')) return 'agi';
  return statForDomain(domain);
}

export const statSource: ModifierSource = {
  id: STAT_SOURCE_ID,
  domains: ['*'],
  compute(ctx) {
    const view = viewOf(ctx);
    if (view === null) return null;
    // Miền kỹ năng của NGƯỜI CHƠI đã có `character.chi-so` của Phần 6 lo. Cộng
    // thêm ở đây là cộng chỉ số hai lần cho đúng một bên.
    if (isPlayer(ctx) && !ctx.domain.startsWith('combat.')) return null;

    const stat = statForDuelDomain(ctx.domain);
    if (stat === null) return null;

    const value = view.fighter.stats[stat];
    const contribution = statContribution(ctx.system, value);
    if (contribution === null || contribution === 0) return null;

    return [{ label: `${STATS[stat].name} ${value}`, value: contribution, kind: 'flat', source: STAT_SOURCE_ID }];
  },
};

// ---------------------------------------------------------------------------
// 2. Ma trận tương khắc (mục 5)
// ---------------------------------------------------------------------------

export const matrixSource: ModifierSource = {
  id: MATRIX_SOURCE_ID,
  domains: ['*'],
  compute(ctx) {
    const view = viewOf(ctx);
    if (view === null || view.matchup.lines.length === 0) return null;

    return view.matchup.lines.map((line) => ({
      label: line.label,
      source: MATRIX_SOURCE_ID,
      ...scaleToSystem(ctx.system, line.value),
    }));
  },
};

// ---------------------------------------------------------------------------
// 3. Thế trận (mục 6)
// ---------------------------------------------------------------------------

export const tempoSource: ModifierSource = {
  id: TEMPO_SOURCE_ID,
  domains: ['*'],
  compute(ctx) {
    const view = viewOf(ctx);
    if (view === null || view.fighter.tempo === 0) return null;

    const tempo = view.fighter.tempo;
    const word = tempo > 0 ? 'Đang giữ nhịp' : 'Đang bị ép';
    return [
      {
        label: `${word} (thế trận ${tempo > 0 ? '+' : ''}${tempo})`,
        source: TEMPO_SOURCE_ID,
        ...scaleToSystem(ctx.system, tempo * tempoConfig().perStep),
      },
    ];
  },
};

// ---------------------------------------------------------------------------
// 4. Thể lực (mục 6)
// ---------------------------------------------------------------------------

/**
 * Phạt LŨY TIẾN theo bậc, không tuyến tính.
 *
 * Mục 6 nói người ta thua vì kiệt sức chứ ít khi vì một nhát chém đẹp. Một thang
 * tuyến tính thì tụt từ 100 xuống 50 và từ 50 xuống 0 tệ như nhau, và trận đấu
 * không bao giờ có cái khoảnh khắc hai tay rơi xuống.
 */
export function staminaPenalty(stamina: number): { penalty: number; name: string } {
  let penalty = 0;
  let name = '';
  for (const step of staminaConfig().penalties) {
    if (stamina < step.below && step.penalty > penalty) {
      penalty = step.penalty;
      name = step.name;
    }
  }
  return { penalty, name };
}

export const staminaSource: ModifierSource = {
  id: STAMINA_SOURCE_ID,
  domains: ['*'],
  compute(ctx) {
    const view = viewOf(ctx);
    if (view === null) return null;

    const { penalty, name } = staminaPenalty(view.fighter.stamina);
    if (penalty <= 0) return null;
    const label = `${(name[0] ?? '').toUpperCase()}${name.slice(1)} (thể lực ${Math.round(view.fighter.stamina)})`;
    return [penaltyFor(ctx.system, label, penalty, STAMINA_SOURCE_ID)];
  },
};

// ---------------------------------------------------------------------------
// 5. Hướng mặt (mục 2)
// ---------------------------------------------------------------------------

function facingBonus(arc: Arc): { value: number; label: string } {
  const config = facingConfig();
  if (arc === 'back') return { value: config.back, label: 'Đánh vào sau lưng' };
  if (arc === 'flank') return { value: config.flank, label: 'Đánh vào sườn' };
  return { value: config.front, label: 'Chính diện' };
}

export const facingSource: ModifierSource = {
  id: FACING_SOURCE_ID,
  domains: ['*'],
  compute(ctx) {
    const view = viewOf(ctx);
    if (view === null || !view.attacking) return null;

    const bonus = facingBonus(view.arc);
    if (bonus.value === 0) return null;
    return [bonusFor(ctx.system, bonus.label, bonus.value, FACING_SOURCE_ID)];
  },
};

// ---------------------------------------------------------------------------
// 6–8. Tầm với, địa hình, giáp — engine đã tính, nguồn chỉ công bố ra bảng
// ---------------------------------------------------------------------------

export const reachSource: ModifierSource = {
  id: REACH_SOURCE_ID,
  domains: ['*'],
  compute(ctx) {
    const view = viewOf(ctx);
    if (view === null || view.reachMod === 0) return null;
    return [{ label: view.reachNote, source: REACH_SOURCE_ID, ...scaleToSystem(ctx.system, view.reachMod) }];
  },
};

export const groundSource: ModifierSource = {
  id: GROUND_SOURCE_ID,
  domains: ['*'],
  compute(ctx) {
    const view = viewOf(ctx);
    if (view === null) return null;

    const lines: Modifier[] = [];
    if (view.groundMod !== 0) {
      lines.push({ label: view.groundName, source: GROUND_SOURCE_ID, ...scaleToSystem(ctx.system, view.groundMod) });
    }
    // Cao độ chỉ giúp bên đang ĐÁNH XUỐNG. Đứng cao mà đỡ đòn thì không lợi gì.
    if (view.attacking && view.elevation !== 0) {
      lines.push({
        label: view.elevation > 0 ? 'Đứng cao hơn' : 'Đứng thấp hơn',
        source: GROUND_SOURCE_ID,
        ...scaleToSystem(ctx.system, view.elevation * 8),
      });
    }
    return lines.length === 0 ? null : lines;
  },
};

export const armorSource: ModifierSource = {
  id: ARMOR_SOURCE_ID,
  domains: ['*'],
  compute(ctx) {
    const view = viewOf(ctx);
    if (view === null || !view.attacking || view.armorMod === 0) return null;
    return [{ label: view.armorNote, source: ARMOR_SOURCE_ID, ...scaleToSystem(ctx.system, view.armorMod) }];
  },
};

// ---------------------------------------------------------------------------
// 9–11. Ba nguồn CHỈ CHO ĐỐI THỦ
// ---------------------------------------------------------------------------

/**
 * Ba nguồn dưới đây trả về null cho người chơi, và đó là điều bắt buộc: bảy
 * nguồn của Phần 7, ba nguồn của Phần 8 và sáu nguồn của Phần 6 đã lo hết phần
 * người chơi. Chạy thêm ở đây là cộng đúp mọi thứ cho đúng một bên, và bảng
 * điều chỉnh sẽ hiện hai dòng giống hệt nhau — thứ người chơi sẽ đọc là bằng
 * chứng game hỏng.
 */
function opponentView(ctx: ModifierContext): ExchangeView | null {
  if (isPlayer(ctx)) return null;
  return viewOf(ctx);
}

export const injurySource: ModifierSource = {
  id: INJURY_SOURCE_ID,
  domains: ['*'],
  compute(ctx) {
    const view = opponentView(ctx);
    if (view === null) return null;

    const body = view.fighter.body;
    const lines: Modifier[] = [];

    const pain = painOf(body, view.fighter.stats.wil);
    const painValue = painPenalty(pain);
    if (painValue > 0) lines.push(penaltyFor(ctx.system, `Đau ${Math.round(pain)}/100`, painValue, INJURY_SOURCE_ID));

    // Vết nặng NHẤT, không cộng dồn từng vết: cùng một luật với `body.vung` của
    // Phần 7 mục 5 — ba vết nhỏ trên một cánh tay không tệ gấp ba một vết.
    let worst = 0;
    for (const injury of body.injuries) {
      if (injury.healProgress >= 100) continue;
      worst = Math.max(worst, injuryPenalty(injury));
    }
    if (worst > 0) lines.push(penaltyFor(ctx.system, 'Vết thương đang mang', worst, INJURY_SOURCE_ID));

    return lines.length === 0 ? null : lines;
  },
};

export const nodeSource: ModifierSource = {
  id: NODE_SOURCE_ID,
  domains: ['*'],
  compute(ctx) {
    const view = opponentView(ctx);
    if (view === null) return null;

    const lines: Modifier[] = [];
    for (const nodeId of view.fighter.nodes) {
      // Thế chỉ tính khi ĐANG BẬT — cùng luật với `skills.the` của Phần 8.
      if (nodeOf(nodeId)?.kind === 'stance') continue;
      lines.push(...nodeModifierLines(nodeId, ctx, NODE_SOURCE_ID));
    }
    if (view.fighter.stance !== '') {
      lines.push(...nodeModifierLines(view.fighter.stance, ctx, NODE_SOURCE_ID));
    }
    return lines.length === 0 ? null : lines;
  },
};

export const gearSource: ModifierSource = {
  id: GEAR_SOURCE_ID,
  domains: ['*'],
  compute(ctx) {
    const view = opponentView(ctx);
    if (view === null) return null;

    const lines: Modifier[] = [];
    for (const carried of view.fighter.loadout.carried) {
      if (!carried.equipped) continue;
      const effect = gearEffect(carried);
      if (effect === null || effect.value === 0) continue;
      if (!effect.domains.some((pattern) => domainMatches(pattern, ctx.domain))) continue;
      lines.push({
        label: `Trang bị: ${gearName(carried.item)}`,
        source: GEAR_SOURCE_ID,
        ...scaleToSystem(ctx.system, effect.value),
      });
    }
    return lines.length === 0 ? null : lines;
  },
};

// ---------------------------------------------------------------------------
// Đăng ký
// ---------------------------------------------------------------------------

export const DUEL_SOURCES: readonly ModifierSource[] = [
  statSource,
  matrixSource,
  tempoSource,
  staminaSource,
  facingSource,
  reachSource,
  groundSource,
  armorSource,
  injurySource,
  nodeSource,
  gearSource,
];

/**
 * Đăng ký một lần lúc khởi động. Gọi lại lần nữa không nổ — `main.tsx` gọi lúc
 * boot, còn test gọi sau mỗi lần dọn registry.
 */
export function registerDuelSources(): void {
  const already = new Set(modifierSources().map((source) => source.id));
  for (const source of DUEL_SOURCES) {
    if (already.has(source.id)) continue;
    registerModifierSource(source);
  }
}
