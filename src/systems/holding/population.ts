/**
 * DÂN SỐ & LÒNG DÂN (Phần 12 mục 8).
 *
 * MỘT NGUYÊN TẮC CHI PHỐI CẢ FILE: **dân số là một con số CHÍNH XÁC của một
 * ĐIỂM** (Phụ lục A mục 6). Lãnh chúa biết rõ thành mình có bao nhiêu miệng ăn.
 * Con số ước chừng và giọng "khoảng chín nghìn nhân khẩu" là của tầng lãnh thổ,
 * và nếu nó lọt vào đây thì hai tầng bắt đầu nói cùng một giọng — đúng chỗ Phụ
 * lục A nói là dễ vỡ nhất.
 *
 * BỐN CHỖ ĐÁNG GIẢI THÍCH:
 *
 * **Lòng dân TRÔI, không nhảy.** Một tuần thiếu lương không làm dân nổi loạn;
 * một nạn đói kéo dài thì có. `moraleDriftPerWeek` là thứ biến "đói" từ một sự
 * kiện thành một quá trình, và cả thang bất ổn của mục 8 chỉ có nghĩa khi người
 * chơi có thời gian nhìn thấy nó tới.
 *
 * **Tăng dân chủ yếu là NHẬP CƯ.** Sinh tự nhiên thời trung cổ gần như bằng
 * không. Một thị trấn lớn lên vì người ở nơi khác dọn đến, và họ chỉ dọn đến khi
 * còn chỗ ở, còn việc và còn lương. Đó là lý do nuôi một thôn lên đại thành mất
 * hàng chục năm chứ không phải hàng chục mùa — và là lý do bài test của mục 12.11
 * ra một con số lớn.
 *
 * **Mỗi nhóm xã hội có lòng dân RIÊNG.** Cùng một chính sách, nông nô và thương
 * nhân phản ứng khác nhau; lòng dân chung chỉ là bình quân có trọng số. Không
 * tách ra thì "thành phần dân cư" của mục 8 chỉ còn là một bảng để nhìn.
 *
 * **Căng thẳng chủng tộc cần HAI bên đủ đông.** Một tộc thiểu số mười người
 * không gây ra căng thẳng, họ chỉ bị bắt nạt. Hai nhóm ngang nhau mới va vào
 * nhau — nên công thức nhân với độ cân bằng, không nhân với số đầu người.
 */

import { raceOf } from '@/systems/character/races';
import { buildingOf, holdingConfig, labourConfig, skilledTrades, unrestFor } from './data';
import type { Capacity, Production } from './labour';
import type { Holding, Population, RaceCount, StratumCount } from './types';

// ---------------------------------------------------------------------------
// Lòng dân
// ---------------------------------------------------------------------------

/**
 * Những gì thành trì phải BIẾT về lãnh chúa của nó, và không được tự đi lấy.
 *
 * Đây là một tham số chứ không phải một cú đọc store, và đó là cố ý: mục 1 nói
 * "nếu thấy mình đang viết một hàm đọc cả hai slice để tính một con số, dừng lại".
 * Danh tiếng lãnh chúa nằm ở `siege` (Phần 11) và thương tật nằm ở `body` (Phần
 * 7); `holdings` nhận chúng qua cửa này, do `week.ts` bơm vào.
 */
export interface LordContext {
  /** `siege.reputation.tanBao` — tiếng tàn bạo. */
  cruelty: number;
  /** `siege.reputation.nhanTu` — tiếng nhân từ. */
  mercy: number;
  /** Lãnh chúa có tàn phế vĩnh viễn không (Phần 7 mục 8). */
  maimed: boolean;
}

export const NO_LORD: LordContext = { cruelty: 0, mercy: 0, maimed: false };

export interface MoraleInput {
  production: Production;
  capacity: Capacity;
  foodEaten: number;
  lord: LordContext;
}

export interface MoraleLine {
  label: string;
  value: number;
}

/**
 * Mốc lòng dân mà tuần này đang kéo về.
 *
 * Trả về CẢ danh sách dòng, vì game không có reroll nên người chơi phải xem được
 * vì sao dân giận — cùng lý do README mục 8.4 nêu cho registry modifier của Phần 5.
 */
export function moraleTarget(holding: Holding, input: MoraleInput): { target: number; lines: MoraleLine[] } {
  const config = holdingConfig();
  const factors = config.moraleFactors;
  const lines: MoraleLine[] = [];
  let target = 50;

  const push = (label: string, value: number): void => {
    if (Math.abs(value) < 0.05) return;
    lines.push({ label, value });
    target += value;
  };

  // --- no đủ
  const surplus = input.production.food - input.foodEaten;
  if (input.production.food <= 0 && holding.population.total > 0) {
    push('đói', factors.starving);
  } else if (surplus < 0) {
    const share = Math.min(1, -surplus / Math.max(1, input.foodEaten));
    push('thiếu lương', factors.foodShort * share);
  } else {
    const share = Math.min(1, surplus / Math.max(1, input.foodEaten));
    push('dư lương', factors.foodSurplusFull * share);
  }

  // --- chỗ ở và việc làm
  if (holding.population.total > input.capacity.housing) {
    push('chật chội', factors.housingShort);
  }
  const workers = holding.population.total * labourConfig().workforceShare;
  if (input.production.jobs < workers) {
    const idle = 1 - input.production.jobs / Math.max(1, workers);
    push('không đủ việc làm', factors.jobShort + factors.unemployedShare * idle);
  }

  // --- tôn giáo, công lý, vẻ đẹp
  if (input.production.faith >= 15) push('có nhà thờ', factors.churchPresent);
  else if (input.production.faith > 0) push('có nhà nguyện', factors.chapelPresent);
  if (input.production.justice > 0) push('có nơi xử án', factors.justicePresent);
  push('vẻ đẹp thành trì', Math.min(factors.beautyCap, input.production.beauty * factors.beautyPerPoint));

  // --- an ninh
  const garrison = holding.buildings.some((placed) => (buildingOf(placed.buildingId)?.garrison?.capacity ?? 0) > 0);
  push(garrison ? 'có quân đồn trú' : 'không ai canh', garrison ? factors.garrisonSafety : factors.noGarrison);
  if (holding.besieged) push('đang bị vây', factors.besieged);
  if (holding.plague) push('có dịch', factors.plague);

  // --- quân dịch
  if (holding.population.levied > 0 && holding.population.total > 0) {
    const tenths = (holding.population.levied / holding.population.total) * 10;
    push('đang gọi quân', factors.levyPerTenPercent * tenths);
    if (holding.population.levyWeeks > labourConfig().levyExhaustionWeeks) {
      const over = holding.population.levyWeeks - labourConfig().levyExhaustionWeeks;
      push('gọi quân quá lâu', labourConfig().levyExhaustionMorale * over);
    }
  }

  // --- lãnh chúa
  push('tiếng tàn bạo của lãnh chúa', (input.lord.cruelty / 10) * factors.lordCrueltyPer10);
  push('tiếng nhân từ của lãnh chúa', (input.lord.mercy / 10) * factors.lordMercyPer10);
  if (input.lord.maimed) push('lãnh chúa mang tật', factors.lordMaimed);
  push('chính danh', ((holding.ownership.legitimacy - 50) / 10) * factors.legitimacyPer10);

  // --- căng thẳng chủng tộc và hận thù sau khi bị chiếm
  push('căng thẳng chủng tộc', holding.population.raceTension * factors.raceTensionPerPoint);
  if (holding.ownership.conqueredHatred > 0) {
    push('dân thù địch', (factors.conqueredHatred * holding.ownership.conqueredHatred) / 100);
  }

  return { target: Math.max(0, Math.min(100, target)), lines };
}

/** Lòng dân của TỪNG nhóm — cùng một mốc, nhưng mỗi nhóm ngả về nó khác nhau. */
function driftStrata(strata: readonly StratumCount[], target: number, drift: number): StratumCount[] {
  const config = holdingConfig();
  return strata.map((group) => {
    const row = config.strata.find((entry) => entry.id === group.id);
    // Nhóm nói to hơn thì cũng đổi ý nhanh hơn: `moraleWeight` vừa là trọng số
    // trong bình quân, vừa là tốc độ. Một nhóm ồn ào mà chậm đổi ý thì trên thực
    // tế chỉ là một con số cố định cộng vào lòng dân chung.
    const speed = drift * (row?.moraleWeight ?? 1);
    return { ...group, morale: group.morale + (target - group.morale) * Math.min(1, speed) };
  });
}

function weightedMorale(strata: readonly StratumCount[]): number {
  const config = holdingConfig();
  let sum = 0;
  let weight = 0;
  for (const group of strata) {
    const row = config.strata.find((entry) => entry.id === group.id);
    const w = (row?.moraleWeight ?? 1) * Math.max(1, group.people);
    sum += group.morale * w;
    weight += w;
  }
  return weight === 0 ? 50 : sum / weight;
}

// ---------------------------------------------------------------------------
// Phân tầng xã hội
// ---------------------------------------------------------------------------

/**
 * Tỉ lệ các nhóm DỊCH theo công trình có trong thành.
 *
 * Xây chợ thì thương nhân đến; xây tu viện thì giáo sĩ đến. Nếu tỉ lệ cố định
 * thì "mỗi nhóm có yêu cầu riêng" của mục 8 chỉ còn là một dòng chữ, vì người
 * chơi không tác động được vào thành phần dân cư của mình.
 */
export function rebalanceStrata(holding: Holding, total: number): StratumCount[] {
  const config = holdingConfig();
  const present = new Set(holding.buildings.map((placed) => placed.buildingId));

  const targets = config.strata.map((row) => {
    const pull = row.grows.filter((id) => present.has(id)).length;
    return { id: row.id, share: row.share * (1 + 0.18 * pull) };
  });
  const sum = targets.reduce((acc, row) => acc + row.share, 0);

  const current = new Map(holding.population.strata.map((row) => [row.id, row]));
  return targets.map((row) => {
    const existing = current.get(row.id);
    const wanted = (row.share / sum) * total;
    const now = existing?.people ?? wanted;
    // Trôi 4% mỗi tuần: một phường hội mới không đổi thành phần dân cư trong một
    // đêm, nhưng trong vài năm thì đổi hẳn.
    const people = now + (wanted - now) * 0.04;
    return { id: row.id, people: Math.max(0, people), morale: existing?.morale ?? config.moraleStart };
  });
}

// ---------------------------------------------------------------------------
// Căng thẳng chủng tộc
// ---------------------------------------------------------------------------

/**
 * Bảng quan hệ của Phần 6 khai thái độ tộc → QUỐC GIA, không khai tộc → tộc.
 * Nên căng thẳng trong một thành trì suy ra từ hai thứ Phần 6 CÓ khai: cùng
 * nhóm chủng tộc, và cùng đứng phía nào với Giáo hội. Phần 14 mục 3 sẽ thay
 * bằng `PowerDemographics`; tới lúc ấy chỉ đổi số trong data, không đổi hàm này.
 */
export function raceTensionOf(holding: Holding): number {
  const config = holdingConfig().raceTension;
  const rows = holding.population.races.filter((row) => row.people > 0);
  if (rows.length < 2) return 0;

  const total = rows.reduce((sum, row) => sum + row.people, 0);
  if (total <= 0) return 0;

  let tension = 0;
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i];
      const b = rows[j];
      if (a === undefined || b === undefined) continue;
      const raceA = raceOf(a.raceId);
      const raceB = raceOf(b.raceId);

      let pair = raceA?.group === raceB?.group ? config.sameGroup : config.differentGroup;
      const churchA = raceA?.church ?? '';
      const churchB = raceB?.church ?? '';
      if (churchA === churchB) pair += config.sameChurch;
      else if (config.outcastChurchIds.includes(churchA) || config.outcastChurchIds.includes(churchB)) {
        pair += config.outcastChurch;
      } else pair += config.differentChurch;

      // Độ cân bằng: 1 khi hai bên ngang nhau, gần 0 khi một bên áp đảo.
      const shareA = a.people / total;
      const shareB = b.people / total;
      const balance = (config.balanceWeight * shareA * shareB) / Math.pow(shareA + shareB, 2);
      tension += Math.min(config.perPairCap, pair * balance);
    }
  }

  const present = new Set(holding.buildings.map((placed) => placed.buildingId));
  for (const [id, value] of Object.entries(config.toleranceBuildings)) {
    if (present.has(id)) tension += value;
  }

  return Math.max(0, Math.min(config.totalCap, tension));
}

/** Chia lại số đầu người theo tộc khi tổng dân đổi. Tỉ lệ giữ nguyên. */
function scaleRaces(races: readonly RaceCount[], total: number): RaceCount[] {
  const sum = races.reduce((acc, row) => acc + row.people, 0);
  if (sum <= 0 || races.length === 0) return races.map((row) => ({ ...row }));
  return races.map((row) => ({ ...row, people: (row.people / sum) * total }));
}

// ---------------------------------------------------------------------------
// Thợ lành nghề
// ---------------------------------------------------------------------------

/**
 * Đào tạo thợ (mục 6). Thợ lành nghề khác dân thường: phải THUÊ hoặc ĐÀO TẠO.
 *
 * Chỗ đào tạo là các công trình khai `trains`, và số chỗ là ràng buộc thật —
 * không có xưởng nghề thì không có thợ đá, và không có thợ đá thì không có tường
 * đá. Cả một nhánh phát triển bị khoá bởi một công trình, và đó là chủ ý.
 */
export function tickTraining(population: Population, holding: Holding): Population {
  const trades = skilledTrades();
  const speedBonus = holding.buildings.reduce((sum, placed) => sum + (buildingOf(placed.buildingId)?.trainSpeed ?? 0), 0);

  const slots = new Map<string, number>();
  for (const placed of holding.buildings) {
    const building = buildingOf(placed.buildingId);
    if (building === null) continue;
    for (const [id, count] of Object.entries(building.trains)) {
      slots.set(id, (slots.get(id) ?? 0) + count);
    }
  }

  const training = population.training.map((row) => ({ ...row, weeksLeft: row.weeksLeft - 1 }));
  const skilled = { ...population.skilled };
  const remaining: typeof training = [];
  for (const row of training) {
    if (row.weeksLeft <= 0) skilled[row.skillId] = (skilled[row.skillId] ?? 0) + 1;
    else remaining.push(row);
  }

  for (const trade of trades) {
    const capacity = slots.get(trade.id) ?? 0;
    const inProgress = remaining.filter((row) => row.skillId === trade.id).length;
    for (let index = inProgress; index < capacity; index++) {
      const weeks = Math.max(4, Math.round(trade.trainWeeks * (1 - Math.min(0.6, speedBonus))));
      remaining.push({ skillId: trade.id, weeksLeft: weeks });
    }
  }

  return { ...population, skilled, training: remaining };
}

/** Thuê thợ từ nơi khác. Nhanh hơn đào tạo, nhưng phải trả tiền và họ sẽ đi. */
export function hireSkilled(holding: Holding, tradeId: string, count: number): { holding: Holding; hired: number } {
  const trade = skilledTrades().find((row) => row.id === tradeId);
  if (trade === undefined || count <= 0) return { holding, hired: 0 };
  const budget = Math.max(0, holding.stores['tien'] ?? 0);
  const hired = Math.min(count, Math.floor(budget / Math.max(0.01, trade.hireCost)));
  if (hired <= 0) return { holding, hired: 0 };

  return {
    hired,
    holding: {
      ...holding,
      stores: { ...holding.stores, tien: budget - hired * trade.hireCost },
      population: {
        ...holding.population,
        skilled: { ...holding.population.skilled, [tradeId]: (holding.population.skilled[tradeId] ?? 0) + hired },
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Một tuần của dân cư
// ---------------------------------------------------------------------------

export interface PopulationWeekResult {
  population: Population;
  morale: number;
  /** Người đến, người đi, người chết — ba con số riêng, vì chúng kể ba câu chuyện. */
  born: number;
  arrived: number;
  left: number;
  died: number;
  lines: MoraleLine[];
  unrestId: string;
  /** Có bạo loạn tuần này không (engine quyết, AI chỉ kể). */
  riotRisk: number;
}

export function advancePopulation(holding: Holding, input: MoraleInput): PopulationWeekResult {
  const config = holdingConfig();
  const weeks = config.weeksPerYear;
  const { target, lines } = moraleTarget(holding, input);

  const strataDrifted = driftStrata(holding.population.strata, target, config.moraleDriftPerWeek);
  const morale = weightedMorale(strataDrifted);
  const unrest = unrestFor(morale);

  const total = holding.population.total;
  const capacity = input.capacity.total;
  const slack = capacity <= 0 ? 0 : (capacity - total) / Math.max(1, capacity);

  let born = 0;
  let arrived = 0;
  let left = 0;
  let died = 0;

  const starving = input.production.food + (holding.stores['luong-thuc'] ?? 0) < input.foodEaten;

  if (!starving && morale >= config.naturalGrowthMoraleFloor && total < capacity) {
    born = (total * config.naturalGrowthPerYear) / weeks;
  }
  if (!starving && morale >= config.immigrationMoraleFloor && slack >= config.immigrationSlackFloor) {
    // Nhập cư chậm lại khi thành gần đầy: người ta không dọn tới một nơi hết chỗ.
    arrived = ((total * config.immigrationPerYear) / weeks) * Math.min(1, slack / 0.25);
  }
  if (total > capacity && capacity > 0) {
    left += ((total - capacity) * config.overCapacityLeavePerYear) / weeks;
  }
  if (starving) {
    died += total * config.starvationDeathPerWeek;
    left += total * config.starvationLeavePerWeek;
  }
  if (holding.plague) died += total * config.plagueDeathPerWeek;
  left += total * unrest.fleePerWeek;

  const next = Math.max(0, total + born + arrived - left - died);
  const strata = rebalanceStrata(holding, next).map((group, index) => ({
    ...group,
    morale: strataDrifted[index]?.morale ?? group.morale,
  }));

  const population: Population = {
    ...holding.population,
    total: next,
    morale,
    strata,
    races: scaleRaces(holding.population.races, next),
    raceTension: raceTensionOf(holding),
    levyWeeks: holding.population.levied > 0 ? holding.population.levyWeeks + 1 : 0,
  };

  return {
    population,
    morale,
    born,
    arrived,
    left,
    died,
    lines,
    unrestId: unrest.id,
    riotRisk: unrest.riotChance,
  };
}
