/**
 * ĐỤNG ĐỘ ĐƠN VỊ — DICE POOL d6 (Phần 10 mục 10).
 *
 * Phần 5 mục 2 phân miền cứng: quy mô lớn thì dùng pool, và mục 10 nhắc lại đúng
 * một câu. Nên MỌI pha va chạm ở đây đi qua `runCheck` với `system: 'pool'`, và
 * không có đường nào khác.
 *
 * HAI VẾ CỦA MỘT PHA, VÀ CHÚNG KHÔNG ĐỐI XỨNG:
 *
 *   SỐ VIÊN     f(quân số, chất lượng, đội hình, đội ngũ, địa hình) — mục 10
 *   SỐ HIT CẦN  f(phòng thủ địch, giáp, đội hình, địa hình)         — mục 10
 *
 * Vế thứ nhất đi qua REGISTRY của Phần 5: mỗi thứ một dòng đọc được, vì người
 * chơi phải hiểu được vì sao đợt xung phong của mình tan. Vế thứ hai đi qua
 * THANG ĐỘ KHÓ CHUẨN HÓA (Phần 5 mục 8) — ở hệ pool, "khó" nghĩa là cần nhiều
 * hit hơn, không phải bớt viên của người tấn công. `defenceBreakdown` in bản chi
 * tiết của nó ra cho UI, vì `CheckResult.modifiers` cố ý không chứa nó
 * (`difficultyLine` của Phần 5 giải thích tại sao).
 *
 * THƯƠNG VONG TRONG TRẬN CỐ Ý NHỎ. Mục 1 nói thẳng: phần lớn thương vong xảy ra
 * SAU khi một bên bỏ chạy. Một pha thắng đẹp lấy đi chừng một phần mười quân số
 * và một phần ba sĩ khí — nghĩa là trận đánh được quyết bằng sĩ khí, đúng như
 * mục 8 đòi, còn chỗ người ta chết thật là khúc truy kích ở `aftermath.ts`.
 */

import type { CheckResult, CheckTier, DifficultyBand } from '@/core/turn';
import type { Rng } from '@/core/rng';
import { runCheck } from '@/systems/check/run';
import { battleConfig, defenceBand, formationOf, unitTypeOf } from './data';
import { arcOf, concealmentBetween, distance, elevationAt, terrainAt, type Arc } from './grid';
import {
  CLASH_DOMAIN,
  VOLLEY_DOMAIN,
  publishEngagement,
  type Engagement,
  type EngagementView,
} from './modifiers';
import type { BattleState, BattleUnit } from './types';

// ---------------------------------------------------------------------------
// Số viên xúc sắc
// ---------------------------------------------------------------------------

/**
 * Số viên TRƯỚC registry: chỉ quân số và sức đánh của binh chủng.
 *
 * Mọi thứ khác — chất lượng, đội hình, sĩ khí, đội ngũ, mệt mỏi, địa hình, thời
 * tiết, đêm, cung đánh, khắc chế — đi qua registry thành những dòng riêng. Gộp
 * chúng vào đây thì bảng điều chỉnh chỉ còn một con số và người chơi không đọc
 * được gì cả (README dự án mục 8.4).
 */
export function baseDice(unit: BattleUnit): number {
  const type = unitTypeOf(unit.typeId);
  const config = battleConfig().pool;
  const ratio = unit.maxStrength <= 0 ? 0 : Math.max(0, Math.min(1, unit.strength / unit.maxStrength));
  const attack = type?.attack ?? 4;
  return Math.max(1, Math.round(attack + config.strengthDice * ratio + (unit.charging ? config.chargeBonusDice : 0)));
}

// ---------------------------------------------------------------------------
// Điểm phòng thủ → số hit cần
// ---------------------------------------------------------------------------

export interface DefenceLine {
  label: string;
  value: number;
}

export interface DefenceBreakdown {
  score: number;
  band: DifficultyBand;
  lines: DefenceLine[];
}

/**
 * Điểm phòng thủ gộp của bên bị đánh, và bảng giải thích đi kèm.
 *
 * Bảng ấy KHÔNG phải trang trí. Ở hệ pool, phòng thủ đặt ra số hit cần chứ không
 * hiện thành dòng modifier, nên nếu không in nó ra ở đâu đó thì người chơi mãi
 * mãi không biết vì sao đánh một khối giáo Lùn trong vòng giáo lại cần bốn hit
 * còn đánh một đám dân binh chỉ cần hai.
 */
export function defenceBreakdown(
  battle: BattleState,
  defender: BattleUnit,
  ranged: boolean,
  attacker?: BattleUnit,
): DefenceBreakdown {
  const type = unitTypeOf(defender.typeId);
  const formation = formationOf(defender.formation);
  const terrain = terrainAt(battle.grid, defender.pos);
  const lines: DefenceLine[] = [];

  const push = (label: string, value: number): void => {
    if (Math.abs(value) < 0.05) return;
    lines.push({ label, value: Math.round(value * 10) / 10 });
  };

  const base = type?.defence ?? 4;
  const armor = type?.armor ?? 0;
  push('Sức chống đỡ của binh chủng', base);
  push('Giáp', armor);

  const formationDefence = (formation?.defence ?? 0) / 5;
  push(`Đội hình ${formation?.name ?? defender.formation}`, formationDefence);

  const terrainDefence = terrain.defence / 5;
  push(`Đứng ở ${terrain.name.toLowerCase()}`, terrainDefence);

  const quality = (defender.quality - battleConfig().pool.qualityCenter) * 0.6;
  push('Chất lượng đơn vị', quality);

  const disorder = -(100 - defender.cohesion) / 25;
  push('Đội hình đã xộc xệch', disorder);

  const morale = (defender.morale - 60) / 40;
  push('Sĩ khí', morale);

  // Bắn vào một đám tản mát thì khó, bắn vào một khối sâu thì không trượt được.
  // Vế này chỉ áp cho tên đạn — cận chiến đã có `formation.defence` lo.
  const spread = ranged ? (1 / Math.max(0.2, formation?.rangedVulnerability ?? 1) - 1) * 2 : 0;
  if (ranged) push(`${formation?.name ?? ''} trước tên đạn`, spread);

  /**
   * VẾ MỘT CỦA VÒNG KHẮC CHẾ (mục 7), và nó phải nằm ở ĐÂY chứ không chỉ ở
   * registry — đây là chỗ đầu tiên viết Phần 10 rất dễ để hụt.
   *
   * `formationSource` cộng `vsCavalry` vào SỐ VIÊN của hàng giáo khi hàng giáo
   * ra đòn. Nhưng một vòng giáo KHÔNG ra đòn: nó đứng im và chờ. Đợt xung phong
   * là do KỴ BINH phát động, nên nếu luật chỉ sống ở phía người tấn công thì hàng
   * giáo chỉ được hưởng nó đúng một lần — cái vòng nó phản kích — rồi sau đó
   * trận đánh biến thành một cuộc mài mòn mà bên đứng im, vốn có `attack` âm,
   * chắc chắn thua. Bài test mục 15.12 bắt được đúng chuyện đó: hàng giáo hạ
   * giáo THUA nhiều hơn hàng giáo dàn ngang, tức là ngược hoàn toàn với mục 7.
   *
   * Cây giáo dài không làm người cầm nó đánh mạnh hơn. Nó làm CON NGỰA KHÔNG LAO
   * VÀO. Đó là một con số phòng thủ, và ở hệ pool thì phòng thủ nghĩa là số hit
   * cần — chính là ô này.
   */
  let versusHorse = 0;
  if (!ranged && attacker !== undefined && attacker.tags.includes('ky-binh') && (formation?.vsCavalry ?? 0) !== 0) {
    versusHorse = (formation?.vsCavalry ?? 0) / 5;
    // Lao vào bằng tốc độ thì càng chết: người ta không dừng lại kịp.
    if (attacker.charging) versusHorse *= 1.3;
    push(`${formation?.name ?? ''} đón kỵ binh`, versusHorse);
  }

  const score = base + armor + formationDefence + terrainDefence + quality + disorder + morale + spread + versusHorse;
  return { score, band: defenceBand(score), lines };
}

// ---------------------------------------------------------------------------
// Một pha va chạm
// ---------------------------------------------------------------------------

export interface ClashOutcome {
  check: CheckResult;
  tier: CheckTier;
  defence: DefenceBreakdown;
  /** Quân bên bị đánh mất. */
  defenderLosses: number;
  /** Quân bên ra đòn mất — cận chiến thì luôn có, bắn thì không. */
  attackerLosses: number;
  defenderMoraleLoss: number;
  attackerMoraleGain: number;
  arc: Arc;
  ranged: boolean;
  /** Một dòng engine ghi sẵn cho biên niên. */
  note: string;
}

const RIPOSTE_BY_TIER: Readonly<Record<CheckTier, number>> = {
  critSuccess: 0.15,
  success: 0.4,
  costlySuccess: 0.85,
  fail: 1.25,
  critFail: 1.9,
};

function viewFor(
  battle: BattleState,
  unit: BattleUnit,
  foe: BattleUnit,
  attacking: boolean,
  ranged: boolean,
): EngagementView {
  return {
    unit,
    battle,
    attacking,
    arc: arcOf(foe.pos, foe.facing, unit.pos),
    foeTags: foeTagsOf(foe),
    foeFormationId: foe.formation,
    elevation: elevationAt(battle.grid, unit.pos) - elevationAt(battle.grid, foe.pos),
    ranged,
    concealment: concealmentBetween(battle.grid, unit.pos, foe.pos),
  };
}

/**
 * Nhãn của một đơn vị TRONG MỘT PHA, gồm cả hai nhãn engine bật lên.
 *
 * `xung-phong` và `vo-tran` không khai ở binh chủng vì chúng là TRẠNG THÁI, không
 * phải bản chất: một đội kỵ binh chỉ là "kỵ binh xung phong" đúng vào cái vòng nó
 * đang lao tới, và luật giáo dài của mục 7 chỉ được phép bắn ở đúng vòng ấy.
 */
export function foeTagsOf(unit: BattleUnit): string[] {
  const tags = [...unit.tags];
  if (unit.charging && !tags.includes('xung-phong')) tags.push('xung-phong');
  if ((unit.state === 'vo-tran' || unit.state === 'nao-nung') && !tags.includes('vo-tran')) tags.push('vo-tran');
  return tags;
}

/**
 * Phân giải một pha: MỘT cú tung, hai vế thương vong.
 *
 * Một cú tung chứ không phải hai là quyết định của mục 10 chứ không phải một phép
 * rút gọn: ở cấp chiến trận, "ai thắng pha này" là một câu hỏi duy nhất, và một
 * trận bốn mươi vòng với hai mươi đơn vị mỗi bên mà mỗi pha tung hai lần thì bài
 * test ba kịch bản sẽ tung hàng triệu con xúc sắc cho một con số duy nhất.
 */
export function resolveClash(
  battle: BattleState,
  rng: Rng,
  attacker: BattleUnit,
  defender: BattleUnit,
  options: { ranged?: boolean } = {},
): ClashOutcome {
  const ranged = options.ranged ?? false;
  const config = battleConfig().casualties;
  const defence = defenceBreakdown(battle, defender, ranged, attacker);

  const map = new Map<string, EngagementView>();
  map.set(attacker.id, viewFor(battle, attacker, defender, true, ranged));
  map.set(defender.id, viewFor(battle, defender, attacker, false, ranged));
  const snapshot: Engagement = { byActor: map };

  publishEngagement(snapshot);
  let run;
  try {
    run = runCheck(rng, {
      id: ranged ? 'battle.ban-loat' : 'battle.dung-do',
      system: 'pool',
      domain: ranged ? VOLLEY_DOMAIN : CLASH_DOMAIN,
      difficulty: defence.band,
      base: baseDice(attacker),
      actor: attacker.id,
      tags: attacker.tags,
      state: battle.state,
    });
  } finally {
    // Gỡ ảnh chụp xuống NGAY, kể cả khi một nguồn ném lỗi: một ảnh chụp còn treo
    // sẽ dính vào phép kiểm kế tiếp của một đơn vị hoàn toàn khác.
    publishEngagement(null);
  }

  const tier = run.result.tier;
  const arc = arcOf(defender.pos, defender.facing, attacker.pos);
  const arcMultiplier = arc === 'back' ? config.rearMultiplier : arc === 'flank' ? config.flankMultiplier : 1;
  const rangedVulnerability = ranged ? (formationOf(defender.formation)?.rangedVulnerability ?? 1) : 1;

  const defenderLosses = Math.min(
    defender.strength,
    Math.round(defender.strength * config.baseRatio * config.byTier[tier] * arcMultiplier * rangedVulnerability),
  );
  const attackerLosses = ranged
    ? Math.round(attacker.strength * config.baseRatio * config.rangedRiposte)
    : Math.min(
        attacker.strength,
        Math.round(attacker.strength * config.baseRatio * config.riposteRatio * RIPOSTE_BY_TIER[tier]),
      );

  const lossPercent = defender.maxStrength <= 0 ? 0 : (defenderLosses / defender.maxStrength) * 100;
  const defenderMoraleLoss = Math.round(lossPercent * config.moralePerLossPercent * arcMultiplier);

  /**
   * NGƯỜI RA ĐÒN CŨNG MẤT SĨ KHÍ VÌ NGƯỜI CỦA MÌNH NGÃ XUỐNG.
   *
   * Không có vế này thì một đợt xung phong thất bại vẫn đánh lại được mãi: kỵ
   * binh chảy máu nhưng không bao giờ sợ, còn hàng giáo thì mất sĩ khí đều đặn
   * chỉ vì đứng đó chịu đòn. Kết quả là "kỵ binh lao vào hàng giáo là tự sát"
   * (mục 7) thành "kỵ binh lao vào hàng giáo rồi mài dần cho tới khi thắng" —
   * bài test mục 15.12 bắt được đúng chuyện đó.
   *
   * `chargeRepulsed` là vế thứ hai, và nó là vế mang tinh thần của mục 1: cái
   * quyết định không phải số người ngã xuống mà là khoảnh khắc một đội quân biết
   * rằng đợt đánh của mình vừa gãy trước một bức tường giáo.
   */
  const attackerLossPercent = attacker.maxStrength <= 0 ? 0 : (attackerLosses / attacker.maxStrength) * 100;
  const morale = battleConfig().morale;
  // "Tăng vì THẮNG CẬN CHIẾN" — mục 8 viết đúng ba chữ ấy, và chúng loại trừ tên
  // đạn. Một loạt tên trúng đích không cho cung thủ cảm giác đã đẩy lùi được ai;
  // họ vẫn đứng nguyên chỗ cũ và địch vẫn đang tiến tới. Cho cung thủ hưởng vế
  // này là cho họ một nguồn sĩ khí MIỄN PHÍ mỗi vòng, không rủi ro — và khi ấy
  // vế ba của vòng khắc chế (kỵ binh khắc cung thủ) không bao giờ xảy ra: đội kỵ
  // binh chảy máu dần trong lúc tiến, còn đám cung thủ thì mỗi vòng một hăng hơn.
  let attackerMoraleGain = !ranged && (tier === 'critSuccess' || tier === 'success') ? morale.wonMelee : 0;
  attackerMoraleGain -= Math.round(attackerLossPercent * config.moralePerLossPercent);
  if (
    !ranged &&
    attacker.charging &&
    (tier === 'fail' || tier === 'critFail') &&
    (formationOf(defender.formation)?.vsCavalry ?? 0) > 0
  ) {
    attackerMoraleGain -= morale.chargeRepulsed;
  }

  return {
    check: run.result,
    tier,
    defence,
    defenderLosses,
    attackerLosses,
    defenderMoraleLoss,
    attackerMoraleGain,
    arc,
    ranged,
    note: noteFor(tier, arc, ranged, defenderLosses),
  };
}

function noteFor(tier: CheckTier, arc: Arc, ranged: boolean, losses: number): string {
  const where = arc === 'back' ? ' vào sau lưng' : arc === 'flank' ? ' vào sườn' : '';
  const verb = ranged ? 'Loạt tên' : 'Cú đánh';
  switch (tier) {
    case 'critSuccess':
      return `${verb}${where} xuyên thẳng — ${String(losses)} người ngã xuống`;
    case 'success':
      return `${verb}${where} ăn — ${String(losses)} người ngã xuống`;
    case 'costlySuccess':
      return `${verb}${where} tới được, nhưng phải trả giá`;
    case 'fail':
      return ranged ? 'Loạt tên rơi vô ích' : 'Bị chặn lại, hàng trước dồn cục';
    case 'critFail':
      return ranged ? 'Bắn loạn, tên bay quá đầu' : 'Đợt đánh gãy — hàng ngũ rối tung';
  }
}

// ---------------------------------------------------------------------------
// Bắn xa: tầm, đường ngắm, đạn
// ---------------------------------------------------------------------------

/** Tầm bắn của đơn vị này TÍNH BẰNG Ô, ở đúng cỡ ô của trận này (mục 2). */
export function rangeInCells(battle: BattleState, unit: BattleUnit): number {
  const type = unitTypeOf(unit.typeId);
  if (type === null || type.rangeMeters <= 0) return 0;
  // KHÔNG bật `atLeastOne`: một khẩu súng tay tám mươi mét đúng là không với tới
  // ô bên cạnh khi ô ấy rộng một trăm hai mươi mét. Đó là sự thật của trận đánh
  // ở quy mô ấy, không phải một lỗi làm tròn.
  return Math.round(type.rangeMeters / battle.grid.cellMeters);
}

export function canShoot(battle: BattleState, unit: BattleUnit, target: BattleUnit): boolean {
  if (unit.ammo <= 0) return false;
  const reach = rangeInCells(battle, unit);
  if (reach <= 0) return false;
  const gap = distance(unit.pos, target.pos);
  if (gap > reach) return false;
  // Che khuất hoàn toàn thì không bắn được; che một phần thì vẫn bắn, chỉ tệ hơn
  // — và phần "tệ hơn" đã nằm trong `groundSource` của registry.
  return concealmentBetween(battle.grid, unit.pos, target.pos) < 100;
}
