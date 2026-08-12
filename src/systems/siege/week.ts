/**
 * MỘT TUẦN VÂY HÃM (Phần 11 mục 3).
 *
 * Đơn vị thời gian của giai đoạn 1 là TUẦN, và mục 3 liệt kê đúng những gì engine
 * phải tính mỗi tuần: "tiêu thụ lương hai bên, kiểm định bệnh dịch (3d6 theo Phần
 * 5), tiến độ máy móc và đường hầm, hư hại tường, kiểm định sĩ khí hai bên, đào
 * ngũ, thời tiết, sự kiện ngẫu nhiên". File này là tám mục ấy, mỗi mục một hàm,
 * theo đúng thứ tự đó — vì thứ tự CÓ tính: người chết vì đói tuần này thì tuần
 * sau không ăn nữa, và một đội thợ vừa bị chôn dưới hầm thì không đào tiếp.
 *
 * THẾ BẤT ĐỐI XỨNG CỦA MỤC 1 SỐNG Ở ĐÂY, không ở bảng hành động. Bảng hành động
 * chỉ là hai danh sách nút bấm; thứ làm hai vai chơi khác hẳn nhau là ở chỗ mỗi
 * tuần trôi qua, bên vây mất người vì DỊCH và vì HẾT HẠN, còn bên thủ mất người
 * vì ĐÓI và mất thành vì LÒNG NGƯỜI. Nếu hai bên cùng chịu một bộ hao mòn thì
 * cuộc vây hãm chỉ còn là một cuộc thi xem ai có nhiều lương hơn.
 *
 * HỆ XÚC SẮC: 3d6 cho mọi thứ ở đây (Phần 5 mục 2 — "năng lực dài hạn: quản trị,
 * xây dựng, kinh tế, HẬU CẦN"). Vệ sinh trại, tiến độ dựng máy, tiến độ đường
 * hầm, lòng người: bốn câu hỏi rất giống nhau, và chúng phải nằm chung một thang
 * để người chơi đọc được chúng cạnh nhau.
 */

import type { CheckResult, DifficultyBand } from '@/core/turn';
import type { Rng } from '@/core/rng';
import { runCheck } from '@/systems/check/run';
import { campaignWear } from '@/systems/items';
import {
  crowdingBand,
  engineConfig,
  engineTypeOf,
  minerBonus,
  miningConfig,
  nextSeason,
  rationOf,
  seasonOf,
  siegeConfig,
} from './data';
import { collapseByMine, damageGate, damageWall, killGarrison, repairWall } from './fortification';
import {
  BOMBARD_DOMAIN,
  DISEASE_DOMAIN,
  MINE_DOMAIN,
  SIEGE_MORALE_DOMAIN,
  makeView,
  withSiegeView,
  type SiegeView,
} from './modifiers';
import {
  campSupplyWeeks,
  foodWeeksLeft,
  garrisonMen,
  heldWall,
  liveEngines,
  mouthsInside,
  type LossLedger,
  type SiegeSide,
  type SiegeState,
} from './types';

/**
 * Ngưỡng 3d6 tung-dưới của một năng lực 0–100.
 *
 * Cùng công thức với `moraleTarget` của Phần 10 mục 8, và cố ý giống hệt: `6 +
 * giá trị/10`. Một trại sạch 80 điểm giữ được 90% số tuần; một trại 40 điểm thì
 * còn một nửa. Hệ số 1/10 chứ không phải 1/6 vì đúng lý do Phần 10 đã trả giá
 * một lần — với 1/6 thì một bậc "Khó" kéo mọi thứ xuống dưới 10%, và cả cuộc vây
 * hãm thành một chuỗi thảm họa không ai điều khiển được.
 */
export function threeD6Target(value: number): number {
  return Math.round(6 + value / 10);
}

export interface SiegeCheckSpec {
  id: string;
  domain: string;
  difficulty: DifficultyBand;
  base: number;
  what: string;
  tags?: readonly string[];
}

/** Một phép kiểm của cuộc vây hãm, đã gắn ảnh chụp và đã ghi vào sổ. */
export function siegeCheck(
  siege: SiegeState,
  rng: Rng,
  side: SiegeSide,
  spec: SiegeCheckSpec,
  extra: Partial<SiegeView> = {},
): CheckResult {
  const run = withSiegeView(makeView(siege, side, extra), () =>
    runCheck(rng, {
      id: spec.id,
      system: '3d6',
      domain: spec.domain,
      difficulty: spec.difficulty,
      base: spec.base,
      // Quy ước `actor` của Phần 5: bên người chơi đang cầm dùng id RỖNG, nhờ vậy
      // nguồn modifier của Phần 6, 7, 8 tự bật lên cho chính nhân vật họ.
      actor: side === siege.playerSide ? '' : `npc_${side}`,
      tags: spec.tags ?? [],
      state: siege.state,
    }),
  );
  siege.checks.push({ week: siege.week, side, what: spec.what, result: run.result });
  return run.result;
}

function log(siege: SiegeState, side: SiegeSide | '', text: string, major = false): void {
  siege.log.push({ week: siege.week, side, text, ...(major ? { major: true } : {}) });
}

/** Trừ người của bên vây và ghi đúng cột trong sổ tử. */
export function killBesieger(siege: SiegeState, men: number, cause: keyof LossLedger): number {
  const dead = Math.max(0, Math.min(siege.attacker.troops, Math.round(men)));
  if (dead <= 0) return 0;
  siege.attacker.troops -= dead;
  siege.attacker.losses[cause] += dead;

  // Người ra đi được rút theo đúng thành phần: chư hầu về nhà thì cột `levy` phải
  // giảm, không phải một con số tổng nào đó. Nếu không thì tuần sau engine vẫn
  // tưởng còn đủ chư hầu để trả lương.
  const pools: (keyof Pick<SiegeState['attacker'], 'levy' | 'mercenary' | 'retinue'>)[] = ['levy', 'mercenary', 'retinue'];
  let left = dead;
  const total = siege.attacker.levy + siege.attacker.mercenary + siege.attacker.retinue;
  if (total > 0) {
    for (const pool of pools) {
      const share = Math.min(siege.attacker[pool], Math.round((siege.attacker[pool] / total) * dead));
      siege.attacker[pool] -= share;
      left -= share;
    }
  }
  if (left > 0) {
    for (const pool of pools) {
      const take = Math.min(siege.attacker[pool], left);
      siege.attacker[pool] -= take;
      left -= take;
      if (left <= 0) break;
    }
  }
  return dead;
}

/** Trừ người bên trong tường: quân đồn trú trước, rồi tới dân. */
export function killDefender(siege: SiegeState, men: number, cause: keyof LossLedger, civiliansFirst = false): number {
  const want = Math.max(0, Math.round(men));
  if (want <= 0) return 0;
  let taken = 0;

  if (civiliansFirst) {
    const fromPeople = Math.min(siege.fort.population, want);
    siege.fort.population -= fromPeople;
    taken += fromPeople;
  }
  if (taken < want) {
    taken += killGarrison(siege.fort, want - taken);
  }
  if (taken < want && !civiliansFirst) {
    const fromPeople = Math.min(siege.fort.population, want - taken);
    siege.fort.population -= fromPeople;
    taken += fromPeople;
  }
  siege.defender.losses[cause] += taken;
  return taken;
}

// ---------------------------------------------------------------------------
// 1. Tiêu thụ lương hai bên
// ---------------------------------------------------------------------------

export interface ConsumeReport {
  hungerDeathsOutside: number;
  hungerDeathsInside: number;
  lines: string[];
  milestones: string[];
}

export function consumeTick(siege: SiegeState): ConsumeReport {
  const config = siegeConfig();
  const season = seasonOf(siege.seasonId);
  const out: ConsumeReport = { hungerDeathsOutside: 0, hungerDeathsInside: 0, lines: [], milestones: [] };

  // --- BÊN VÂY: tải từ xa, và vòng vây càng kín thì đoàn xe càng phải đi vòng.
  const haul =
    Math.max(0, config.consumption.haulBase + siege.attacker.circumvallation * config.consumption.haulPerCircumvallation) *
    season.haul;
  siege.attacker.supplies += haul;
  const eaten = siege.attacker.troops * config.consumption.foodPerManWeek + siege.attacker.horses * 0.4;
  siege.attacker.supplies -= eaten;

  if (siege.attacker.supplies < 0) {
    siege.attacker.outOfSupplyWeeks += 1;
    siege.attacker.supplies = 0;
    siege.attacker.morale += config.consumption.starvingMorale;
    out.hungerDeathsOutside = killBesieger(siege, siege.attacker.troops * config.consumption.starvingLossShare, 'hunger');
    out.lines.push(
      `Trại hết lương tuần thứ ${String(siege.attacker.outOfSupplyWeeks)}. ${String(out.hungerDeathsOutside)} người không dậy nổi.`,
    );
    if (siege.attacker.outOfSupplyWeeks === 1) out.milestones.push('Đạo quân vây bắt đầu đói');
  } else {
    siege.attacker.outOfSupplyWeeks = 0;
  }

  // --- BÊN THỦ: khẩu phần là quyết định cốt lõi (mục 3).
  //
  // Trước đó là lương LẬU. Một vòng vây hở thì đêm nào cũng có người trèo qua với
  // một bao thóc, và đó chính là thứ "dựng vòng vây" mua được: mỗi bậc kín thêm
  // là một phần ba số ấy mất đi. Không có vế này thì hành động tốn công nhất của
  // bảng bên vây không đổi lấy được gì nhìn thấy được.
  const smuggled = (config.consumption.smuggledPerWeek * Math.max(0, 3 - siege.attacker.circumvallation)) / 3;
  if (smuggled > 0) siege.fort.supplies.food += smuggled;

  const ration = rationOf(siege.defender.ration);
  const mouths = mouthsInside(siege);
  const need = mouths * config.consumption.foodPerManWeek * ration.factor;
  siege.fort.supplies.food -= need;

  if (siege.fort.supplies.food <= 0) {
    siege.fort.supplies.food = 0;
    siege.defender.garrisonMorale += config.morale.starving;
    siege.defender.populationMorale += config.morale.starving * 1.4;
    // Dân chết trước lính — đó là cách một thành bị vây thật sự chết, và nó phải
    // hiện ra trong sổ chứ không chỉ trong lời kể.
    out.hungerDeathsInside = killDefender(siege, mouths * 0.035, 'hunger', true);
    out.lines.push(`Kho lương cạn sạch. ${String(out.hungerDeathsInside)} người chết đói trong tuần.`);
    out.milestones.push('Trong thành hết lương');
  } else if (ration.factor < 1) {
    siege.defender.garrisonMorale += ration.morale;
    siege.defender.populationMorale += ration.morale * 1.3;
    if (ration.health < 0) {
      out.hungerDeathsInside = killDefender(siege, mouths * (-ration.health / 1400), 'hunger', true);
    }
  }

  // --- Nước: cắt nguồn nước cực mạnh NẾU không có giếng riêng (mục 3).
  if (siege.attacker.cutWater && siege.fort.wells <= 0) {
    siege.defender.waterCutWeeks += 1;
    siege.defender.garrisonMorale += config.water.cutMoralePerWeek;
    siege.defender.populationMorale += config.water.cutMoralePerWeek;
    const dead = killDefender(siege, mouths * config.water.cutLossShare, 'hunger', true);
    out.hungerDeathsInside += dead;
    out.lines.push(`Tuần thứ ${String(siege.defender.waterCutWeeks)} không có nước. ${String(dead)} người chết.`);
    if (siege.defender.waterCutWeeks === 1) out.milestones.push('Nguồn nước bị cắt');
  } else if (siege.attacker.cutWater) {
    out.lines.push('Suối bị chặn, nhưng trong thành có giếng riêng — chỉ thêm một việc phải xếp hàng.');
  }

  return out;
}

// ---------------------------------------------------------------------------
// 2. Bệnh dịch — mối đe dọa số một (mục 3)
// ---------------------------------------------------------------------------

export interface DiseaseReport {
  outside: number;
  inside: number;
  check: CheckResult | null;
  lines: string[];
  milestones: string[];
}

export function diseaseTick(siege: SiegeState, rng: Rng): DiseaseReport {
  const config = siegeConfig().disease;
  const out: DiseaseReport = { outside: 0, inside: 0, check: null, lines: [], milestones: [] };
  if (siege.attacker.troops <= 0) return out;

  // Trại bẩn dần theo tuần, và bẩn nhanh hơn khi đông. Đây là đồng hồ đếm ngược
  // thật sự của bên vây — không phải kho lương.
  const crowding = (siege.attacker.troops / 1000) * config.crowdingPer1000;
  siege.attacker.hygiene = Math.max(5, siege.attacker.hygiene - config.hygieneDrainPerWeek - crowding * 0.2);

  const band = crowdingBand(siege.attacker.troops);
  const check = siegeCheck(siege, rng, 'vay', {
    id: config.checkId,
    domain: DISEASE_DOMAIN,
    difficulty: band,
    base: threeD6Target(siege.attacker.hygiene),
    what: 'vệ sinh trại',
  });
  out.check = check;

  let share = config.deathShare[check.tier];
  if (check.tier === 'critFail' && config.outbreakOnCritFail) {
    siege.attacker.outbreakWeeks = config.outbreakWeeks;
    siege.attacker.hygiene = Math.max(5, siege.attacker.hygiene + config.hygieneOnCritFail);
    out.milestones.push('Dịch bùng trong trại vây');
  }
  if (check.tier === 'critSuccess') {
    siege.attacker.hygiene = Math.min(100, siege.attacker.hygiene + config.hygieneOnCritSuccess);
  }
  if (siege.attacker.outbreakWeeks > 0) {
    share += config.outbreakExtraShare;
    siege.attacker.outbreakWeeks -= 1;
  }

  out.outside = killBesieger(siege, siege.attacker.troops * share, 'disease');
  if (out.outside > 0) {
    const percent = (out.outside / Math.max(1, siege.attacker.troops + out.outside)) * 100;
    siege.attacker.morale -= percent * config.moralePerDeathPercent;
    out.lines.push(
      `Kiết lỵ và sốt lấy đi ${String(out.outside)} người trong trại. Vệ sinh còn ${String(
        Math.round(siege.attacker.hygiene),
      )}/100.`,
    );
  }

  // Bên trong tường cũng bệnh — nhất là khi bên vây ném xác qua tường (mục 3).
  const inside = mouthsInside(siege);
  if (inside > 0 && (siege.attacker.threwCorpses || siege.fort.lostLayers.length > 0)) {
    const insideCheck = siegeCheck(siege, rng, 'thu', {
      id: config.checkId,
      domain: DISEASE_DOMAIN,
      difficulty: crowdingBand(inside),
      base: threeD6Target(60 + (siege.attacker.threwCorpses ? -20 : 0)),
      what: 'bệnh dịch trong thành',
    });
    out.inside = killDefender(siege, inside * config.deathShare[insideCheck.tier], 'disease', true);
    if (out.inside > 0) {
      out.lines.push(`Trong thành, ${String(out.inside)} người chết vì bệnh.`);
      siege.defender.populationMorale -= 3;
    }
  }

  return out;
}

// ---------------------------------------------------------------------------
// 3. Hết hạn nghĩa vụ và hợp đồng lính đánh thuê (mục 3)
// ---------------------------------------------------------------------------

export interface ServiceReport {
  departed: number;
  paid: number;
  pillaged: boolean;
  lines: string[];
  milestones: string[];
}

/**
 * Chư hầu hết hạn thì CÓ QUYỀN về nhà — không phải đào ngũ, và đó là điểm khác
 * biệt quan trọng. Giữ họ lại được, nhưng phải trả tiền, và tiền ấy là một quyết
 * định thật: cùng số bạc ấy thuê được một đại đội đánh thuê mới.
 *
 * `pay` là ý CHỈ HUY, không phải một luật tự nhiên: người chơi bấm, hoặc chính
 * sách của engine quyết. Không trả thì tuần sau vòng vây mỏng đi một mảng lớn.
 */
export function serviceTick(siege: SiegeState, rng: Rng, pay: boolean): ServiceReport {
  const config = siegeConfig().service;
  const out: ServiceReport = { departed: 0, paid: 0, pillaged: false, lines: [], milestones: [] };

  siege.attacker.serviceDaysLeft -= siegeConfig().daysPerWeek;

  if (siege.attacker.serviceDaysLeft <= 0 && siege.attacker.levy > 0 && !siege.attacker.levyLeft) {
    const cost = siege.attacker.levy * config.payPerManPerWeek;
    if (pay && siege.attacker.treasury >= cost) {
      siege.attacker.treasury -= cost;
      out.paid += cost;
      siege.attacker.serviceDaysLeft = siegeConfig().daysPerWeek;
      out.lines.push(`Trả ${String(Math.round(cost))} đồng để giữ chư hầu lại thêm một tuần.`);
    } else {
      const leaving = Math.round(siege.attacker.levy * config.leaveShare);
      killBesieger(siege, leaving, 'departed');
      out.departed += leaving;
      siege.attacker.levyLeft = true;
      siege.attacker.morale += config.moraleOnLeave;
      siege.attacker.circumvallation = Math.max(0, siege.attacker.circumvallation - 1);
      out.lines.push(`Hạn bốn mươi ngày đã hết. ${String(leaving)} quân chư hầu cuốn cờ đi về, đúng luật.`);
      out.milestones.push('Chư hầu hết hạn nghĩa vụ và về nhà');
    }
  }

  // Lính đánh thuê: hết hợp đồng, không trả thì bỏ đi HOẶC quay sang cướp phá.
  if (siege.attacker.mercenary > 0 && !siege.attacker.mercenaryLeft) {
    siege.attacker.mercenaryWeeksPaid -= 1;
    if (siege.attacker.mercenaryWeeksPaid <= 0) {
      const cost = siege.attacker.mercenary * config.mercenaryPayPerManPerWeek;
      if (pay && siege.attacker.treasury >= cost) {
        siege.attacker.treasury -= cost;
        out.paid += cost;
        siege.attacker.mercenaryWeeksPaid = 4;
        out.lines.push(`Trả ${String(Math.round(cost))} đồng tiền công cho lính đánh thuê, đủ bốn tuần nữa.`);
      } else if (rng.int(1, 100) <= config.mercenaryPillageChance) {
        out.pillaged = true;
        siege.cruelty += 10;
        siege.church -= 6;
        siege.attacker.sackPressure += 20;
        const leaving = Math.round(siege.attacker.mercenary * config.mercenaryMutinyShare);
        killBesieger(siege, leaving, 'departed');
        out.departed += leaving;
        out.lines.push(
          `Không có bạc. Một nửa đại đội đánh thuê tỏa đi cướp mấy làng quanh đó và không quay lại vòng vây.`,
        );
        out.milestones.push('Lính đánh thuê không được trả công, quay sang cướp phá');
      } else {
        const leaving = Math.round(siege.attacker.mercenary * config.mercenaryMutinyShare);
        killBesieger(siege, leaving, 'departed');
        out.departed += leaving;
        siege.attacker.morale -= 8;
        out.lines.push(`Không có bạc. ${String(leaving)} lính đánh thuê xếp giáo lên xe và đi.`);
        out.milestones.push('Lính đánh thuê hết hợp đồng và bỏ đi');
      }
    }
  }

  return out;
}

// ---------------------------------------------------------------------------
// 4. Đào ngũ và hao mòn theo mùa (mục 3)
// ---------------------------------------------------------------------------

export interface AttritionReport {
  desertions: number;
  winterDeaths: number;
  insideDesertions: number;
  lines: string[];
}

export function attritionTick(siege: SiegeState): AttritionReport {
  const config = siegeConfig().desertion;
  const season = seasonOf(siege.seasonId);
  const out: AttritionReport = { desertions: 0, winterDeaths: 0, insideDesertions: 0, lines: [] };

  // Mùa đông: thương vong PHI CHIẾN ĐẤU tăng vọt (mục 3).
  if (season.attrition > 0) {
    out.winterDeaths = killBesieger(siege, siege.attacker.troops * season.attrition, 'winter');
    if (out.winterDeaths > 0) {
      out.lines.push(`${season.name}: ${String(out.winterDeaths)} người chết cóng hoặc chết vì vết thương cũ.`);
    }
  }

  let share = config.baseShare;
  if (siege.attacker.morale < config.moraleBelow) {
    share += (config.moraleBelow - siege.attacker.morale) * config.perMoralePointBelow;
  }
  if (siege.attacker.outOfSupplyWeeks > 0) share += config.hungryShare;
  if (siege.attacker.mercenaryWeeksPaid <= 0 && siege.attacker.mercenary > 0) share += config.unpaidShare;
  if (season.id === 'dong') share += config.winterExtra;

  out.desertions = killBesieger(siege, siege.attacker.troops * share, 'desertion');
  if (out.desertions > 0) {
    out.lines.push(`${String(out.desertions)} người biến mất khỏi trại trong đêm.`);
  }

  // Trong thành người ta khó đào ngũ hơn nhiều: ngoài kia là vòng vây.
  if (siege.defender.garrisonMorale < config.moraleBelow) {
    const inside = garrisonMen(siege.fort) * share * config.insideFactor;
    out.insideDesertions = killDefender(siege, inside, 'desertion');
    if (out.insideDesertions > 0) {
      out.lines.push(`${String(out.insideDesertions)} lính đồn trú trèo tường trốn ra trong đêm.`);
    }
  }

  return out;
}

// ---------------------------------------------------------------------------
// RÃ TRANG BỊ (Phần 16 mục 10, nối vào vòng tuần của mục 3)
// ---------------------------------------------------------------------------

export interface GearReport {
  /** Tình trạng trung bình còn lại, 0–100. */
  condition: number;
  lost: number;
  lines: string[];
  milestones: string[];
}

/**
 * Một tuần bào mòn trang bị của đạo quân vây thành.
 *
 * Phần 16 mục 10 nói thẳng: MỘT ĐẠO QUÂN KHÔNG CÓ THỢ RÈN ĐI THEO SẼ RÃ TRANG
 * BỊ SAU VÀI TUẦN CHIẾN DỊCH. Vòng tuần của mục 3 đã có cái đói, dịch bệnh, hạn
 * nghĩa vụ và đào ngũ; đây là cột thứ năm, và nó ăn thẳng vào tổng công: một
 * đạo quân vào bậc thang với giáp thủng và kiếm cong thì bậc thang ấy đắt hơn
 * hẳn.
 *
 * Con số hiện ra ở `attacker.gearCondition`, và Phần 11 mục 6 đọc nó khi tính
 * tương quan lực lượng — chứ không phải một dòng chữ trong nhật ký rồi thôi.
 */
export function gearTick(siege: SiegeState): GearReport {
  const wear = campaignWear(siege.attacker.troops, siege.attacker.smiths);
  const before = siege.attacker.gearCondition;
  siege.attacker.gearCondition = Math.max(0, Math.round((before - wear.conditionLost) * 10) / 10);

  const out: GearReport = {
    condition: siege.attacker.gearCondition,
    lost: Math.round((before - siege.attacker.gearCondition) * 10) / 10,
    lines: [],
    milestones: [],
  };

  // Chỉ nói khi có gì để nói: một dòng "trang bị mất 4 điểm" mỗi tuần trong hai
  // mươi tuần là hai mươi dòng không ai đọc, và chúng dìm mất những dòng thật.
  if (siege.attacker.smiths <= 0 && siege.attacker.troops > 0) out.lines.push(wear.line);

  for (const threshold of [70, 45, 25]) {
    if (before > threshold && siege.attacker.gearCondition <= threshold) {
      out.milestones.push(
        threshold >= 70
          ? 'Lưỡi kiếm bắt đầu mẻ, đai giáp bắt đầu đứt.'
          : threshold >= 45
            ? 'Nửa số giáp trong trại đã móp hoặc thủng, và không ai gò lại được.'
            : 'Trang bị của đạo quân rã thật sự: người ta vào trận với đồ đi mượn và đồ đi cướp.',
      );
    }
  }
  return out;
}

/** Mùa xoay vòng. Gọi ở cuối mỗi tuần. */
export function advanceSeason(siege: SiegeState): string {
  const season = seasonOf(siege.seasonId);
  siege.seasonWeek += 1;
  if (siege.seasonWeek < season.weeks) return '';
  siege.seasonWeek = 0;
  const next = nextSeason(siege.seasonId);
  siege.seasonId = next.id;
  return `${next.name} đến. ${next.note}.`;
}

// ---------------------------------------------------------------------------
// 5. Tiến độ máy công thành (mục 3)
// ---------------------------------------------------------------------------

export interface EngineReport {
  finished: string[];
  lines: string[];
  milestones: string[];
}

export function engineBuildTick(siege: SiegeState, rng: Rng): EngineReport {
  const config = engineConfig();
  const season = seasonOf(siege.seasonId);
  const out: EngineReport = { finished: [], lines: [], milestones: [] };

  const building = siege.attacker.engines.filter((engine) => !engine.built && !engine.destroyed);
  if (building.length === 0) return out;

  // Trần thợ: một đạo quân không dựng nổi mười cỗ trebuchet cùng lúc.
  const hands = siege.attacker.troops * config.crewShare;
  const needed = building.reduce((sum, engine) => sum + (engineTypeOf(engine.typeId)?.crew ?? 10), 0);
  const factor = needed <= 0 ? 1 : Math.min(1, hands / needed);

  for (const engine of building) {
    const type = engineTypeOf(engine.typeId);
    if (type === null) continue;
    const weeks = Math.max(0.1, type.buildWeeks);
    let step = (1 / weeks) * factor;
    if (season.id === 'dong') step *= 0.7;
    engine.progress = Math.min(1, engine.progress + step);
    if (engine.progress >= 1) {
      engine.built = true;
      out.finished.push(engine.name);
      out.lines.push(`${engine.name} dựng xong và được kéo vào vị trí.`);
      out.milestones.push(`${engine.name} vào vị trí`);
    }
  }
  // Một cú tung cho cả nhóm, để dòng RNG không phụ thuộc số máy đang dựng (R3
  // vẫn đúng, nhưng số lần tung ổn định thì bài test đọc dễ hơn nhiều).
  if (out.finished.length === 0 && rng.int(1, 100) <= 4) {
    const unlucky = building[0];
    if (unlucky !== undefined) {
      unlucky.progress = Math.max(0, unlucky.progress - 0.25);
      out.lines.push(`Một cái trục gãy khi đang lắp ${unlucky.name}. Thợ mộc bắt đầu lại từ hôm trước.`);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// 6. Bắn phá (mục 3)
// ---------------------------------------------------------------------------

export interface BombardReport {
  damage: number;
  breached: boolean;
  gateBroken: boolean;
  towerFell: string;
  killed: number;
  check: CheckResult | null;
  lines: string[];
  milestones: string[];
}

/**
 * Bắn phá làm ba việc, và việc thứ ba mới là việc thắng cuộc vây hãm.
 *
 * Hạ integrity tường thì ai cũng thấy. Nhưng mục 3 viết đủ ba vế — "hạ integrity
 * tường, ỒN ÀO, và hạ sĩ khí bên trong" — và một bức tường nứt không mở cổng cho
 * ai cả, còn một đám dân không ngủ được sáu tuần thì có.
 */
export function bombardTick(siege: SiegeState, rng: Rng): BombardReport {
  const config = engineConfig();
  const out: BombardReport = {
    damage: 0,
    breached: false,
    gateBroken: false,
    towerFell: '',
    killed: 0,
    check: null,
    lines: [],
    milestones: [],
  };

  if (siege.attacker.bombardPause > 0) {
    siege.attacker.bombardPause -= 1;
    out.lines.push('Máy bắn im lặng tuần này.');
    return out;
  }
  // Bắn phá là một HÀNH ĐỘNG, không phải một nhịp tự động — xem chú thích ở
  // `BesiegerState.bombarding`.
  if (!siege.attacker.bombarding) return out;

  const engines = liveEngines(siege).filter((engine) => {
    const type = engineTypeOf(engine.typeId);
    return type !== null && (type.wallDamage > 0 || type.gateDamage > 0 || type.antiPersonnel > 0);
  });
  if (engines.length === 0) return out;

  const check = siegeCheck(siege, rng, 'vay', {
    id: config.bombardCheckId,
    domain: BOMBARD_DOMAIN,
    difficulty: config.bombardBand,
    base: threeD6Target(58 + siege.attacker.bombardBonus),
    what: 'bắn phá',
  });
  out.check = check;
  const factor = config.damageByTier[check.tier];

  let wallRaw = 0;
  let gateRaw = 0;
  let moraleRaw = 0;
  let antiPersonnel = 0;
  for (const engine of engines) {
    const type = engineTypeOf(engine.typeId);
    if (type === null) continue;
    wallRaw += type.wallDamage;
    gateRaw += type.gateDamage;
    moraleRaw += type.moraleDamage;
    antiPersonnel += type.antiPersonnel;
  }

  if (wallRaw > 0) {
    const hit = damageWall(siege.fort, rng, wallRaw * factor);
    out.damage = hit.applied;
    out.breached = hit.breached;
    out.towerFell = hit.towerFell;
    out.lines.push(...hit.lines);
    if (hit.breached) out.milestones.push('Tường ngoài vỡ vì đạn đá');
    if (hit.towerFell !== '') out.milestones.push(`${hit.towerFell} đổ`);
  }
  if (gateRaw > 0 && (siege.fort.moat === null || siege.fort.moat.filled >= 1)) {
    const gate = damageGate(siege.fort, gateRaw * factor);
    out.gateBroken = gate.broken;
    out.lines.push(...gate.lines);
    if (gate.broken) out.milestones.push('Cổng bị phá');
  }
  if (antiPersonnel > 0) {
    out.killed = killDefender(siege, garrisonMen(siege.fort) * antiPersonnel * factor, 'combat');
  }

  // Vế thứ ba: ồn ào, và sáu tuần không ai ngủ.
  siege.defender.garrisonMorale += siegeConfig().morale.bombardedPerWeek;
  siege.defender.populationMorale -= moraleRaw * 0.6;

  if (check.tier === 'critFail' && rng.int(1, 100) <= config.critFailBreaks) {
    const victim = engines[rng.int(0, engines.length - 1)];
    if (victim !== undefined) {
      victim.destroyed = true;
      out.lines.push(`${victim.name} tự gãy khi bắn — cần bẩy đứt và đá rơi vào chính đội vận hành.`);
      out.milestones.push(`${victim.name} hỏng`);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// 7. Đường hầm (mục 3)
// ---------------------------------------------------------------------------

export interface MineReport {
  progress: number;
  fired: boolean;
  collapsed: boolean;
  detected: boolean;
  check: CheckResult | null;
  lines: string[];
  milestones: string[];
}

export function mineTick(siege: SiegeState, rng: Rng): MineReport {
  const config = miningConfig();
  const out: MineReport = {
    progress: 0,
    fired: false,
    collapsed: false,
    detected: false,
    check: null,
    lines: [],
    milestones: [],
  };

  const shaft = siege.attacker.mines.find((entry) => !entry.collapsed && !entry.fired);
  if (shaft === undefined) return out;

  // Hào NƯỚC là lý do người ta đào hào nước: nước ngấm xuống thì không hầm nào
  // trụ được. Đá cứng cũng thế, theo chiều khác.
  const tags: string[] = [];
  if (siege.fort.moat?.wet === true) tags.push('hao-nuoc');

  const bonus = minerBonus(shaft.raceId);
  const check = siegeCheck(
    siege,
    rng,
    'vay',
    {
      id: config.checkId,
      domain: MINE_DOMAIN,
      difficulty: config.band,
      base: threeD6Target(50 + bonus + (siege.fort.moat?.wet === true ? config.wetMoatPenalty : 0)),
      what: 'đào hầm',
      tags,
    },
    { underground: true, nightSight: bonus >= 30 },
  );
  out.check = check;

  const step = (1 / config.baseWeeks) * config.progressByTier[check.tier];
  shaft.progress = Math.min(1, shaft.progress + step);
  out.progress = shaft.progress;

  if (check.tier === 'critFail') {
    shaft.collapsed = true;
    out.collapsed = true;
    const dead = killBesieger(siege, shaft.crew * config.critFailCollapse, 'combat');
    out.lines.push(`Hầm sập vào chính người đào. ${String(dead)} người thợ nằm lại dưới đó.`);
    out.milestones.push('Đường hầm sập vào đội thợ');
    return out;
  }

  // Bên thủ nghe thấy tiếng cuốc — điều kiện để họ phản đào hầm.
  if (!shaft.detected && shaft.progress > 0.4) {
    const listen = siegeCheck(
      siege,
      rng,
      'thu',
      {
        id: config.counterMine.checkId,
        domain: config.counterMine.domain,
        difficulty: config.counterMine.listenBand,
        base: threeD6Target(55),
        what: 'nghe tiếng đào',
      },
      { underground: true },
    );
    if (listen.tier !== 'fail' && listen.tier !== 'critFail') {
      shaft.detected = true;
      out.detected = true;
      out.lines.push('Trong thành, người ta úp chậu nước xuống nền đá và thấy mặt nước rung. Có người đang đào.');
      out.milestones.push('Bên thủ phát hiện đường hầm');
    }
  }

  if (shaft.progress >= 1) {
    shaft.fired = true;
    out.fired = true;
    const hit = collapseByMine(siege.fort, rng);
    out.lines.push('Người ta chất củi và mỡ lợn dưới chân tường rồi châm lửa. Đến chiều thì mặt đất rùng lên.');
    out.lines.push(...hit.lines);
    out.milestones.push('Đường hầm nổ, tường sụt');
    if (hit.breached) siege.defender.garrisonMorale += siegeConfig().morale.wallBreach;
  }

  return out;
}

// ---------------------------------------------------------------------------
// 8. Sĩ khí hai bên (mục 3)
// ---------------------------------------------------------------------------

export interface MoraleReport {
  besieger: number;
  garrison: number;
  population: number;
  wantsSurrender: boolean;
  wantsToLift: boolean;
  checks: CheckResult[];
  lines: string[];
  milestones: string[];
}

/**
 * Hai phép kiểm, hai câu hỏi KHÁC NHAU — và đây là chỗ thế bất đối xứng của mục 1
 * hiện ra rõ nhất.
 *
 * Bên vây hỏi: "còn đáng ở lại đây thêm một tuần nữa không?" Bên thủ hỏi: "còn
 * ai chịu đứng gác nữa không?" Cùng một thang 3d6, nhưng hỏng ở hai bên dẫn tới
 * hai kết cục ngược nhau: một bên rút, một bên mở cổng.
 */
export function moraleTick(siege: SiegeState, rng: Rng): MoraleReport {
  const config = siegeConfig().morale;
  const out: MoraleReport = {
    besieger: 0,
    garrison: 0,
    population: 0,
    wantsSurrender: false,
    wantsToLift: false,
    checks: [],
    lines: [],
    milestones: [],
  };

  siege.attacker.morale += config.besiegerPerWeek;
  siege.defender.garrisonMorale += config.defenderPerWeek;
  siege.defender.populationMorale += config.defenderPerWeek * 1.2;

  if (siege.defender.reliefHope) {
    siege.defender.garrisonMorale += 1.5;
    siege.defender.populationMorale += 1.5;
  }

  siege.attacker.morale = Math.max(0, Math.min(100, siege.attacker.morale));
  siege.defender.garrisonMorale = Math.max(0, Math.min(100, siege.defender.garrisonMorale));
  siege.defender.populationMorale = Math.max(0, Math.min(100, siege.defender.populationMorale));

  out.besieger = siege.attacker.morale;
  out.garrison = siege.defender.garrisonMorale;
  out.population = siege.defender.populationMorale;

  if (siege.attacker.morale < config.checkBelow && siege.attacker.troops > 0) {
    const check = siegeCheck(siege, rng, 'vay', {
      id: config.checkId,
      domain: SIEGE_MORALE_DOMAIN,
      difficulty: 'thuong',
      base: threeD6Target(siege.attacker.morale),
      what: 'đạo quân vây có ở lại không',
    });
    out.checks.push(check);
    /**
     * MỘT CÚ TUNG HỎNG KHÔNG ĐƯỢC PHÉP KẾT THÚC CẢ CUỘC VÂY HÃM.
     *
     * Phép kiểm này chạy gần như mỗi tuần trong nửa sau của một cuộc vây hãm dài,
     * nên nếu `critFail` đơn lẻ là lệnh rút thì mười lăm tuần công sức tan vì một
     * lần 3d6 ra 17 — và người chơi không có cách nào phòng chuyện ấy. Nên
     * `critFail` là một CÚ SỐC nặng, và chỉ khi đạo quân đã ở đáy thì nó mới là
     * lệnh rút. Đó cũng đúng là hình dạng thật: người ta bỏ một cuộc vây hãm sau
     * nhiều tuần rệu rã, không phải sau một buổi họp tồi.
     */
    if (check.tier === 'critFail') {
      siege.attacker.morale = Math.max(0, siege.attacker.morale - 15);
      if (siege.attacker.morale < 20) {
        out.wantsToLift = true;
        out.lines.push('Các viên đội tới lều chỉ huy cùng một lúc. Không ai nói chữ "rút", nhưng ai cũng nói chuyện ấy.');
        out.milestones.push('Đạo quân vây đòi bỏ cuộc');
      } else {
        out.lines.push('Một đêm cãi vã trong lều chỉ huy. Sáng ra vòng vây vẫn còn đó, nhưng không ai còn tin vào nó nữa.');
        out.milestones.push('Đạo quân vây lung lay');
      }
    } else if (check.tier === 'fail') {
      siege.attacker.morale = Math.max(0, siege.attacker.morale - 6);
    }
  }

  // Lòng người trong thành kéo sĩ khí quân xuống theo — một đội đồn trú vững giữa
  // một thành phố đang đói không giữ được lâu.
  if (siege.defender.populationMorale < 30) {
    siege.defender.garrisonMorale = Math.max(0, siege.defender.garrisonMorale - 2);
  }

  if (siege.defender.garrisonMorale < config.surrenderBelow) {
    const check = siegeCheck(siege, rng, 'thu', {
      id: config.checkId,
      domain: SIEGE_MORALE_DOMAIN,
      difficulty: 'thuong',
      base: threeD6Target(siege.defender.garrisonMorale),
      what: 'quân đồn trú có giữ nữa không',
    });
    out.checks.push(check);
    if (check.tier === 'critFail' || check.tier === 'fail') {
      out.wantsSurrender = true;
      out.lines.push('Quân đồn trú tụ trước nhà cổng và đòi mở đàm phán. Đây là cách phần lớn thành trì đổi chủ.');
      out.milestones.push('Trong thành đòi mở cổng');
    }
  }

  return out;
}

// ---------------------------------------------------------------------------
// Sửa tường ban đêm (mục 3) — hành động, nhưng hệ quả tính chung nhịp tuần
// ---------------------------------------------------------------------------

export interface RepairReport {
  repaired: number;
  lines: string[];
}

export function repairTick(siege: SiegeState): RepairReport {
  const config = siegeConfig().repair;
  const wall = heldWall(siege.fort);
  if (wall === null || siege.fort.population < config.requiresPopulation) {
    return { repaired: 0, lines: ['Không còn đủ người để vác đá lên tường trong đêm.'] };
  }
  const done = repairWall(siege.fort, config.integrityPerWeek);
  if (done.repaired <= 0) {
    return { repaired: 0, lines: ['Không còn vật liệu để vá tường.'] };
  }
  siege.defender.populationMorale += config.populationMorale;
  return {
    repaired: done.repaired,
    lines: [
      `Suốt đêm, dân trong thành vác đá và rọ đất lên vá ${wall.name}: hồi ${String(
        Math.round(done.repaired),
      )} điểm, tốn ${String(Math.round(done.materials))} vật liệu.`,
    ],
  };
}

/** Con số hai bảng đối xứng của UI đọc (mục 9). */
export interface SiegeGauges {
  attackerSupplyWeeks: number;
  defenderFoodWeeks: number;
  wallShare: number;
  serviceDaysLeft: number;
}

export function gauges(siege: SiegeState): SiegeGauges {
  const wall = heldWall(siege.fort);
  return {
    attackerSupplyWeeks: campSupplyWeeks(siege),
    defenderFoodWeeks: foodWeeksLeft(siege, rationOf(siege.defender.ration).factor),
    wallShare: wall === null ? siege.fort.keep.integrity / Math.max(1, siege.fort.keep.maxIntegrity) : wall.integrity / Math.max(1, wall.maxIntegrity),
    serviceDaysLeft: siege.attacker.serviceDaysLeft,
  };
}

export { log as logWeek };
