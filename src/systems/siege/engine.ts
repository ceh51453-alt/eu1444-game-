/**
 * VÒNG ĐỜI MỘT CUỘC VÂY HÃM — dựng, chạy từng tuần, tăng tốc, và chốt.
 *
 * Đây là CỬA VÀO DUY NHẤT của Phần 11 cho phần còn lại của game. UI gọi
 * `createSiege` rồi `runWeek`; bài test mục 11 gọi `fastForward`; cả hai đi qua
 * đúng một con đường, nên thứ bài test đo được LÀ thứ người chơi sẽ chơi.
 *
 * HÀNH ĐỘNG ĐƯỢC TIÊM VÀO, KHÔNG ĐƯỢC IMPORT. `WeekPlan` mang theo cả hàm giải
 * quyết của nó, nên `systems/siege/` không bao giờ phải import từ
 * `minigames/siege-attack/` hay `minigames/siege-defense/`. Đó không phải một sở
 * thích kiến trúc: mục 10.4 đòi HAI BẢNG HÀNH ĐỘNG RIÊNG BIỆT, và cách chắc chắn
 * nhất để hai bảng ấy không lặng lẽ mọc thành một là để lõi vây hãm không biết
 * bảng nào tồn tại.
 *
 * DÒNG XÚC SẮC RIÊNG (`SIEGE_STREAM`), cùng lý do với Phần 9 và 10 và nặng hơn cả
 * hai: số lần tung trong một cuộc vây hãm thay đổi theo số tuần, số máy đang
 * dựng, số đường hầm, và số sự kiện rơi ra. Trên dòng `main` thì mọi cú tung của
 * mọi lượt SAU cuộc vây hãm sẽ lệch đi (R3).
 *
 * KHÔNG GHI STORE. Cuộc vây hãm tích `playerOps` và trả cho người gọi chốt một
 * lần — undo phải tua về TRƯỚC cả cuộc vây hãm, không phải về giữa tuần thứ chín.
 */

import type { Rng } from '@/core/rng';
import type { GameState } from '@/state/slices';
import type { ChronicleSetting } from '@/systems/combat/chronicle';
import { allRations, engineTypeOf, miningConfig, packageOf, rationOf, seasonOf, siegeConfig } from './data';
import { buildFortification, canFallBack, cloneFortification, fallBack, wallShare, type FortSetup } from './fortification';
import { autoChooseOption, chooseEventOption, eventDefOf, rollEvent } from './events';
import { autoOffer, contractTick, parley, settleTerms } from './parley';
import { crueltyOf, churchOf, mercyOf } from './slice';
import {
  advanceSeason,
  attritionTick,
  bombardTick,
  consumeTick,
  diseaseTick,
  engineBuildTick,
  gauges,
  gearTick,
  mineTick,
  moraleTick,
  serviceTick,
} from './week';
import {
  SIEGE_ENDINGS,
  campSupplyWeeks,
  emptyLedger,
  foodWeeksLeft,
  garrisonMen,
  heldWall,
  ledgerTotal,
  mouthsInside,
  type SiegeSide,
  type SiegeState,
  type Fortification,
  type WeekReport,
} from './types';

/** Dòng RNG riêng của công thành. Xem chú thích đầu file. */
export const SIEGE_STREAM = 'siege';

export class SiegeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SiegeError';
  }
}

// ---------------------------------------------------------------------------
// Hành động một tuần
// ---------------------------------------------------------------------------

export interface SiegeAction {
  id: string;
  name: string;
  side: SiegeSide;
  /** Một dòng giải thích cho người chơi đọc trước khi bấm. */
  note: string;
  /** Bấm được tuần này không. */
  available(siege: SiegeState): boolean;
  /** Chạy TRƯỚC phần hao mòn của tuần. Trả về dòng nhật ký. */
  apply(siege: SiegeState, rng: Rng): string[];
}

export interface WeekPlan {
  attacker?: SiegeAction | null;
  defender?: SiegeAction | null;
  /** Có bỏ tiền giữ chư hầu và trả lính đánh thuê không (mục 3). */
  payTroops?: boolean;
}

// ---------------------------------------------------------------------------
// Dựng
// ---------------------------------------------------------------------------

export interface BesiegerSetup {
  name?: string;
  commanderName?: string;
  troops: number;
  /** Chia theo thành phần. Không khai thì engine chia 5 : 3 : 2. */
  levy?: number;
  mercenary?: number;
  retinue?: number;
  /** Thợ rèn đi theo (Phần 16 mục 10). Không khai thì một người cho mỗi 120 quân. */
  smiths?: number;
  /** Tình trạng trang bị lúc tới nơi. Một đạo quân vừa đánh xong không tới với 100. */
  gearCondition?: number;
  horses?: number;
  treasury?: number;
  /** Lương mang theo, tính bằng phần một người một tuần. */
  supplies?: number;
  /** Id máy công thành đã có sẵn lúc tới nơi. Còn lại phải dựng tại chỗ. */
  engines?: readonly string[];
  minerRaceId?: string;
  serviceDays?: number;
  mercenaryWeeksPaid?: number;
  circumvallation?: number;
}

export interface DefenderSetup {
  name?: string;
  commanderName?: string;
  ration?: string;
  reliefHope?: boolean;
}

export interface SiegeSetup {
  id?: string;
  /** Có thể nhận thẳng công sự dựng từ thành trì thật của người chơi. */
  fort: FortSetup | Fortification;
  attacker: BesiegerSetup;
  defender?: DefenderSetup;
  playerSide?: SiegeSide;
  seasonId?: string;
  reliefPossible?: boolean;
  setting?: Partial<ChronicleSetting>;
  stakes?: string;
  turn?: number;
  state?: GameState | null;
}

export function createSiege(rng: Rng, setup: SiegeSetup): SiegeState {
  const config = siegeConfig();
  const fort = 'outerWall' in setup.fort ? cloneFortification(setup.fort) : buildFortification(setup.fort);
  const troops = Math.max(1, Math.round(setup.attacker.troops));

  const levy = setup.attacker.levy ?? Math.round(troops * 0.5);
  const mercenary = setup.attacker.mercenary ?? Math.round(troops * 0.3);
  const retinue = setup.attacker.retinue ?? Math.max(0, troops - levy - mercenary);

  const engines = (setup.attacker.engines ?? []).map((typeId, index) => {
    const type = engineTypeOf(typeId);
    if (type === null) throw new SiegeError(`máy công thành không có trong data/siege-engines.json: ${typeId}`);
    return {
      id: `engine_${String(index + 1)}`,
      typeId,
      name: type.name,
      // Máy mang sẵn tới nơi thì đã dựng xong. Máy phải dựng tại chỗ do hành động
      // "dựng máy công thành" của bảng bên vây thêm vào, và nó bắt đầu từ 0.
      progress: 1,
      built: true,
      destroyed: false,
      guarded: false,
    };
  });

  const season = seasonOf(setup.seasonId ?? 'ha');
  const playerSide = setup.playerSide ?? 'vay';

  const siege: SiegeState = {
    id: setup.id ?? `siege_${fort.id}_${String(setup.turn ?? 0)}`,
    week: 1,
    seasonId: season.id,
    seasonWeek: 0,
    fort,
    attacker: {
      name: setup.attacker.name ?? 'Đạo quân vây',
      commanderName: setup.attacker.commanderName ?? 'chủ soái',
      troops,
      startTroops: troops,
      levy,
      mercenary,
      retinue,
      // Một thợ rèn cho mỗi trăm hai mươi người là mức một đạo quân được tổ chức
      // tử tế mang theo (Phần 16 mục 10). Người gọi khai 0 nghĩa là một đạo quân
      // gom vội — và mười bốn tuần sau họ sẽ biết điều đó.
      smiths: setup.attacker.smiths ?? Math.round(troops / 120),
      gearCondition: setup.attacker.gearCondition ?? 100,
      horses: setup.attacker.horses ?? Math.round(troops * 0.12),
      morale: config.morale.besiegerBase,
      hygiene: config.disease.hygieneStart,
      treasury: setup.attacker.treasury ?? 1200,
      supplies: setup.attacker.supplies ?? troops * 3,
      serviceDaysLeft: setup.attacker.serviceDays ?? config.service.defaultDays,
      mercenaryWeeksPaid: setup.attacker.mercenaryWeeksPaid ?? 4,
      circumvallation: setup.attacker.circumvallation ?? 0,
      engines,
      mines: [],
      minerRaceId: setup.attacker.minerRaceId ?? '',
      losses: emptyLedger(),
      outbreakWeeks: 0,
      outOfSupplyWeeks: 0,
      levyLeft: false,
      mercenaryLeft: false,
      noQuarter: false,
      sackPressure: 0,
      bombardPause: 0,
      bombarding: false,
      bombardBonus: 0,
      threwCorpses: false,
      cutWater: false,
    },
    defender: {
      name: setup.defender?.name ?? fort.name,
      commanderName: setup.defender?.commanderName ?? 'viên trấn thủ',
      garrisonMorale: config.morale.garrisonBase,
      populationMorale: config.morale.populationBase,
      ration: rationOf(setup.defender?.ration ?? allRations()[0]?.id ?? 'day-du').id,
      civiliansExpelled: 0,
      waterCutWeeks: 0,
      counterMines: 0,
      sorties: 0,
      lastSortieWeek: -99,
      losses: emptyLedger(),
      reliefHope: setup.defender?.reliefHope ?? false,
      honor: 0,
      lastParleyWeek: 0,
    },
    playerSide,
    phase: 'vay-ham',
    contract: null,
    reliefPossible: setup.reliefPossible ?? true,
    reliefIncoming: false,
    weeksToRelief: 0,
    truceWeeks: 0,
    // TIẾNG TÀN BẠO NẠP TỪ STATE, không bắt đầu lại từ 0 mỗi cuộc vây hãm — đó
    // chính là chỗ mục 7 khép vòng: thành trước quyết định bàn đàm phán thành sau.
    cruelty: crueltyOf(setup.state ?? null),
    mercy: mercyOf(setup.state ?? null),
    church: churchOf(setup.state ?? null),
    finished: false,
    winner: '',
    ending: '',
    terms: [],
    sacked: null,
    weeks: [],
    parleys: [],
    log: [],
    checks: [],
    events: [],
    pendingEvent: null,
    eventCooldown: {},
    assault: null,
    setting: {
      place: setup.setting?.place ?? fort.name,
      ground: setup.setting?.ground ?? `${fort.name}, bậc ${String(fort.tier)}`,
      weather: setup.setting?.weather ?? season.name,
      timeOfDay: setup.setting?.timeOfDay ?? '',
      witnesses: setup.setting?.witnesses ?? '',
    },
    stakes: setup.stakes ?? '',
    playerOps: [],
    state: setup.state ?? null,
    rngState: rng.getState(),
    turn: setup.turn ?? 0,
    llmCalls: 0,
  };

  siege.log.push({
    week: 1,
    side: '',
    text: `${siege.attacker.name} (${String(troops)} người) dựng trại trước ${fort.name}. Trong tường có ${String(
      garrisonMen(fort),
    )} lính và ${String(fort.population)} dân.`,
    major: true,
  });
  return siege;
}

export function cloneSiege(siege: SiegeState): SiegeState {
  return {
    ...siege,
    fort: cloneFortification(siege.fort),
    attacker: {
      ...siege.attacker,
      engines: siege.attacker.engines.map((engine) => ({ ...engine })),
      mines: siege.attacker.mines.map((mine) => ({ ...mine })),
      losses: { ...siege.attacker.losses },
    },
    defender: { ...siege.defender, losses: { ...siege.defender.losses } },
    contract: siege.contract === null ? null : { ...siege.contract, terms: [...siege.contract.terms] },
    terms: [...siege.terms],
    weeks: [...siege.weeks],
    parleys: [...siege.parleys],
    log: [...siege.log],
    checks: [...siege.checks],
    events: [...siege.events],
    pendingEvent: siege.pendingEvent === null ? null : { ...siege.pendingEvent, lines: [...siege.pendingEvent.lines] },
    eventCooldown: { ...siege.eventCooldown },
    assault:
      siege.assault === null
        ? null
        : {
            ...siege.assault,
            waves: siege.assault.waves.map((wave) => ({ ...wave })),
            taken: [...siege.assault.taken],
            log: [...siege.assault.log],
            rounds: [...siege.assault.rounds],
          },
    setting: { ...siege.setting },
    playerOps: [...siege.playerOps],
  };
}

// ---------------------------------------------------------------------------
// Một tuần
// ---------------------------------------------------------------------------

export interface WeekResult {
  siege: SiegeState;
  report: WeekReport;
  /** Popup đang chờ người chơi chọn. Tuần sau không chạy được khi còn cái này. */
  pending: SiegeState['pendingEvent'];
}

/** Hai bên có đang bị khế ước hoặc lệnh ngừng chiến trói tay không (mục 5). */
export function hostilitiesFrozen(siege: SiegeState): boolean {
  if (siege.truceWeeks > 0) return true;
  return siege.contract !== null && siege.contract.honored === null;
}

function reportOf(siege: SiegeState, plan: WeekPlan, parts: {
  disease: number;
  hunger: number;
  combat: number;
  desertion: number;
  departed: number;
  inside: number;
  mine: number;
  events: string[];
  milestones: string[];
  lines: string[];
}): WeekReport {
  const wall = heldWall(siege.fort);
  const view = gauges(siege);
  return {
    week: siege.week,
    season: seasonOf(siege.seasonId).name,
    attackerAction: plan.attacker?.name ?? 'đợi',
    defenderAction: plan.defender?.name ?? 'giữ nguyên',
    attackerTroops: siege.attacker.troops,
    attackerMorale: siege.attacker.morale,
    attackerSupplyWeeks: view.attackerSupplyWeeks,
    defenderMen: garrisonMen(siege.fort),
    population: siege.fort.population,
    garrisonMorale: siege.defender.garrisonMorale,
    populationMorale: siege.defender.populationMorale,
    defenderFoodWeeks: view.defenderFoodWeeks,
    wallIntegrity: wall?.integrity ?? siege.fort.keep.integrity,
    wallMax: wall?.maxIntegrity ?? siege.fort.keep.maxIntegrity,
    diseaseDeaths: parts.disease,
    hungerDeaths: parts.hunger,
    combatDeaths: parts.combat,
    desertions: parts.desertion,
    departed: parts.departed,
    insideDeaths: parts.inside,
    mineProgress: parts.mine,
    events: parts.events,
    milestones: parts.milestones,
    lines: parts.lines,
    notable: parts.milestones.length > 0 || parts.events.length > 0 || siege.pendingEvent !== null || siege.finished,
  };
}

/**
 * Một tuần vây hãm.
 *
 * THỨ TỰ LÀ HỢP ĐỒNG, không phải chi tiết cài đặt — xem chú thích đầu `week.ts`.
 * Hành động chạy TRƯỚC hao mòn, vì người ta quyết định rồi mới chịu hậu quả; và
 * sự kiện rơi ra CUỐI CÙNG, vì một popup hỏi "quân cứu viện đang tới, ngài làm
 * gì" mà hỏi trước khi biết tuần này còn bao nhiêu người là một câu hỏi vô nghĩa.
 */
export function runWeek(siege: SiegeState, rng: Rng, plan: WeekPlan = {}): WeekResult {
  const next = cloneSiege(siege);
  if (next.finished || next.pendingEvent !== null) {
    return { siege: next, report: reportOf(next, plan, emptyParts()), pending: next.pendingEvent };
  }

  const parts = emptyParts();
  const frozen = hostilitiesFrozen(next);

  // --- Hành động hai bên (hai bảng RIÊNG BIỆT, tiêm từ ngoài vào)
  if (plan.attacker != null && plan.attacker.available(next)) {
    for (const line of plan.attacker.apply(next, rng)) parts.lines.push(line);
  }
  if (plan.defender != null && plan.defender.available(next)) {
    for (const line of plan.defender.apply(next, rng)) parts.lines.push(line);
  }

  // --- Hao mòn (mục 3), theo đúng thứ tự mục ấy liệt kê
  const consumed = consumeTick(next);
  parts.hunger += consumed.hungerDeathsOutside;
  parts.inside += consumed.hungerDeathsInside;
  parts.lines.push(...consumed.lines);
  parts.milestones.push(...consumed.milestones);

  const disease = diseaseTick(next, rng);
  parts.disease += disease.outside;
  parts.inside += disease.inside;
  parts.lines.push(...disease.lines);
  parts.milestones.push(...disease.milestones);

  const service = serviceTick(next, rng, plan.payTroops ?? true);
  parts.departed += service.departed;
  parts.lines.push(...service.lines);
  parts.milestones.push(...service.milestones);

  const attrition = attritionTick(next);
  parts.desertion += attrition.desertions;
  parts.disease += attrition.winterDeaths;
  parts.inside += attrition.insideDesertions;
  parts.lines.push(...attrition.lines);

  // CỘT THỨ NĂM của hao mòn (Phần 16 mục 10): trang bị rã dần nếu không có thợ
  // rèn đi theo. Đứng sau bốn cột kia vì nó không giết ai — nó chỉ làm cho cái
  // giá của tổng công đắt lên, và cái giá ấy chỉ đọc được ở tuần cuối cùng.
  const gear = gearTick(next);
  parts.lines.push(...gear.lines);
  parts.milestones.push(...gear.milestones);

  // --- Máy móc, bắn phá, đường hầm. Khế ước đóng băng cả ba (mục 5).
  const built = engineBuildTick(next, rng);
  parts.lines.push(...built.lines);
  parts.milestones.push(...built.milestones);

  if (!frozen) {
    const bombard = bombardTick(next, rng);
    parts.combat += bombard.killed;
    parts.lines.push(...bombard.lines);
    parts.milestones.push(...bombard.milestones);
    if (bombard.damage > 0) {
      // Thấy tường sứt là thấy tiến bộ, và một đạo quân thấy tiến bộ thì ở lại
      // thêm một tuần. Không có vế này thì mọi cuộc vây hãm đều tan trước khi
      // tường vỡ, và cả nhánh bắn phá của mục 3 không bao giờ dùng tới.
      next.attacker.morale = Math.min(100, next.attacker.morale + 1.5);
    }
    if (bombard.breached) next.defender.garrisonMorale += siegeConfig().morale.wallBreach;
    if (bombard.towerFell !== '') next.defender.garrisonMorale += siegeConfig().morale.towerFell;
    if (bombard.gateBroken) next.defender.garrisonMorale += siegeConfig().morale.gateFell;

    const mine = mineTick(next, rng);
    parts.mine = mine.progress;
    parts.lines.push(...mine.lines);
    parts.milestones.push(...mine.milestones);
  } else {
    parts.lines.push('Khế ước còn hiệu lực: không ai bắn một phát nào tuần này.');
    if (next.truceWeeks > 0) next.truceWeeks -= 1;
  }

  // --- Bên thủ lùi một lớp khi lớp đang giữ đã hỏng hẳn (mục 2)
  if (wallShare(next.fort) <= 0 && canFallBack(next.fort)) {
    const moved = fallBack(next.fort);
    parts.lines.push(...moved.lines);
    parts.milestones.push(`Bên thủ lùi vào ${moved.to}`);
    next.defender.garrisonMorale += siegeConfig().morale.layerLost;
  }

  // --- Sĩ khí hai bên
  const morale = moraleTick(next, rng);
  parts.lines.push(...morale.lines);
  parts.milestones.push(...morale.milestones);

  // --- Quân cứu viện đếm ngược
  if (next.reliefIncoming) {
    next.weeksToRelief -= 1;
    if (next.weeksToRelief === 1) parts.milestones.push('Quân cứu viện còn một tuần đường');
  }

  // --- Khế ước
  const contract = contractTick(next);
  parts.lines.push(...contract.lines);
  if (contract.due) {
    next.finished = true;
    next.winner = 'vay';
    next.ending = 'khe-uoc-den-han';
    settleTerms(next, next.contract?.terms ?? []);
    parts.milestones.push('Khế ước tới hạn, cổng mở');
  }

  // --- Bên thủ xin đàm phán khi quân đồn trú đã gãy (mục 1: phần lớn thành trì
  //     đổi chủ vì thỏa thuận, không phải vì tổng công)
  if (!next.finished && morale.wantsSurrender && next.playerSide === 'vay' && next.week >= next.defender.lastParleyWeek) {
    const offer = autoOffer(next, 'thu');
    const outcome = parley(next, rng, offer);
    parts.lines.push(...outcome.lines);
    parts.milestones.push(outcome.accepted ? 'Bên thủ xin khất tới ngày hẹn và được nhận' : 'Bên thủ xin điều kiện nhưng bị từ chối');
  }

  // --- Sự kiện (mục 4). Rơi ra CUỐI CÙNG — xem chú thích trên.
  if (!next.finished) {
    const event = rollEvent(next, rng);
    if (event !== null) {
      const def = eventDefOf(event.eventId);
      const mine = def === null ? [] : def.options.filter((option) => option.for === next.playerSide);
      if (mine.length > 0) {
        // Lựa chọn thuộc về người chơi: treo popup và DỪNG mọi thứ lại.
        next.pendingEvent = event;
        parts.events.push(event.name);
      } else if (def !== null) {
        next.pendingEvent = event;
        const record = chooseEventOption(next, rng, autoChooseOption(next, def));
        if (record !== null) {
          parts.events.push(`${record.name}: ${record.optionLabel}`);
          parts.lines.push(...record.lines);
        }
      }
    }
  }

  const seasonLine = advanceSeason(next);
  if (seasonLine !== '') {
    next.setting.weather = seasonOf(next.seasonId).name;
    parts.lines.push(seasonLine);
    parts.milestones.push(seasonLine);
  }

  settle(next, morale.wantsToLift);

  const report = reportOf(next, plan, parts);
  next.weeks.push(report);
  next.week += 1;
  // Cờ một-tuần tắt lại: hành động của tuần này không được tự chạy lại ở tuần sau.
  next.attacker.bombarding = false;
  next.attacker.bombardBonus = 0;
  next.rngState = rng.getState();
  for (const line of parts.lines) next.log.push({ week: report.week, side: '', text: line });

  return { siege: next, report, pending: next.pendingEvent };
}

function emptyParts(): {
  disease: number;
  hunger: number;
  combat: number;
  desertion: number;
  departed: number;
  inside: number;
  mine: number;
  events: string[];
  milestones: string[];
  lines: string[];
} {
  return {
    disease: 0,
    hunger: 0,
    combat: 0,
    desertion: 0,
    departed: 0,
    inside: 0,
    mine: 0,
    events: [],
    milestones: [],
    lines: [],
  };
}

// ---------------------------------------------------------------------------
// Kết thúc
// ---------------------------------------------------------------------------

/**
 * Cuộc vây hãm kết thúc khi nào.
 *
 * TÁM CỬA RA, và chúng không phải tám cách nói một điều. Mục 1 nói phần lớn thành
 * trì đổi chủ vì HẾT LƯƠNG hoặc vì THỎA THUẬN — nên hai cửa ấy phải là hai cửa
 * dễ tới nhất, còn `ha-bang-tong-cong` thì nằm ở cuối một con đường rất đắt.
 */
export function settle(siege: SiegeState, besiegerWantsToLift = false): void {
  if (siege.finished) return;
  const config = siegeConfig();

  const finish = (winner: SiegeSide | '', ending: string): void => {
    siege.finished = true;
    siege.winner = winner;
    siege.ending = ending;
    siege.phase = 'xong';
    siege.log.push({ week: siege.week, side: '', text: `Kết thúc: ${SIEGE_ENDINGS[ending] ?? ending}.`, major: true });
  };

  // --- Bên vây gãy trước
  if (siege.attacker.troops <= 0) return finish('thu', 'tan-ra');
  if (siege.attacker.troops < siege.attacker.startTroops * 0.15) return finish('thu', 'tan-ra');
  if (besiegerWantsToLift) return finish('thu', 'bo-vay');

  // --- Quân cứu viện tới nơi
  if (siege.reliefIncoming && siege.weeksToRelief <= 0) return finish('thu', 'cuu-vien-giai-vay');

  // --- Bên thủ gãy
  const men = garrisonMen(siege.fort);
  if (men <= 0 && siege.fort.population <= 0) return finish('vay', 'ha-bang-tong-cong');
  if (siege.defender.waterCutWeeks >= config.water.weeksWithoutWater) return finish('vay', 'het-nuoc');
  if (siege.fort.supplies.food <= 0 && siege.defender.garrisonMorale < config.morale.surrenderBelow) {
    return finish('vay', 'het-luong');
  }
  if (siege.defender.garrisonMorale <= 6) return finish('vay', 'het-luong');

  if (siege.week >= config.maxWeeks) return finish('', 'het-han');
}

// ---------------------------------------------------------------------------
// TĂNG TỐC (mục 3)
// ---------------------------------------------------------------------------

export interface FastForward {
  siege: SiegeState;
  reports: WeekReport[];
  /** Vì sao dừng lại. Rỗng nghĩa là chạy hết số tuần đã xin. */
  stoppedBy: string;
}

/**
 * Chạy nhiều tuần liền, TỰ DỪNG khi có sự kiện đáng chú ý.
 *
 * Mục 3 kể tên đúng bốn thứ đáng dừng: "cứu viện xuất hiện, tường sập, dịch bùng,
 * có lời đề nghị đàm phán". Tất cả đều đi qua `WeekReport.notable`, nên thêm một
 * loại mốc mới ở `week.ts` là nó tự biết dừng — không phải sửa hàm này.
 *
 * Nút này là thứ làm giai đoạn một CHƠI ĐƯỢC. Không có nó, một cuộc vây hãm hai
 * mươi tuần là hai mươi lần bấm cùng một nút để xem cùng một bảng số nhích đi một
 * chút; có nó, người chơi bấm một lần và engine dừng đúng ở chỗ có việc để làm.
 */
export function fastForward(
  siege: SiegeState,
  rng: Rng,
  weeks: number,
  plan: WeekPlan | ((siege: SiegeState) => WeekPlan) = {},
): FastForward {
  let current = siege;
  const reports: WeekReport[] = [];
  const limit = Math.max(1, Math.min(siegeConfig().maxWeeks, Math.round(weeks)));

  for (let index = 0; index < limit; index++) {
    if (current.finished || current.pendingEvent !== null) break;
    const weekPlan = typeof plan === 'function' ? plan(current) : plan;
    const result = runWeek(current, rng, weekPlan);
    current = result.siege;
    reports.push(result.report);
    if (result.report.notable) {
      const reason =
        result.report.milestones[0] ?? result.report.events[0] ?? (current.finished ? 'cuộc vây hãm kết thúc' : 'có việc phải quyết');
      return { siege: current, reports, stoppedBy: reason };
    }
  }
  return { siege: current, reports, stoppedBy: '' };
}

/** Người chơi chốt một lựa chọn của popup đang treo, rồi tuần sau chạy tiếp được. */
export function resolveEvent(siege: SiegeState, rng: Rng, optionId: string): SiegeState {
  const next = cloneSiege(siege);
  chooseEventOption(next, rng, optionId);
  settle(next);
  next.rngState = rng.getState();
  return next;
}

// ---------------------------------------------------------------------------
// Bảng số cho UI và cho bài test
// ---------------------------------------------------------------------------

export interface SiegeSummary {
  weeks: number;
  attackerStart: number;
  attackerLeft: number;
  attackerLosses: SiegeState['attacker']['losses'];
  defenderStart: number;
  defenderLeft: number;
  defenderLosses: SiegeState['defender']['losses'];
  foodWeeksLeft: number;
  supplyWeeksLeft: number;
  wallShare: number;
  winner: SiegeSide | '';
  ending: string;
  endingName: string;
}

export function summarise(siege: SiegeState): SiegeSummary {
  const first = siege.weeks[0];
  return {
    weeks: siege.weeks.length,
    attackerStart: siege.attacker.startTroops,
    attackerLeft: siege.attacker.troops,
    attackerLosses: { ...siege.attacker.losses },
    defenderStart: (first?.defenderMen ?? garrisonMen(siege.fort)) + ledgerTotal(siege.defender.losses),
    defenderLeft: garrisonMen(siege.fort),
    defenderLosses: { ...siege.defender.losses },
    foodWeeksLeft: foodWeeksLeft(siege, rationOf(siege.defender.ration).factor),
    supplyWeeksLeft: campSupplyWeeks(siege),
    wallShare: wallShare(siege.fort),
    winner: siege.winner,
    ending: siege.ending,
    endingName: SIEGE_ENDINGS[siege.ending] ?? siege.ending,
  };
}

/** Bắt đầu một đường hầm (bảng hành động bên vây gọi vào đây). */
export function openMine(siege: SiegeState, crew: number, raceId: string): void {
  const config = miningConfig();
  siege.attacker.mines.push({
    id: `mine_${String(siege.attacker.mines.length + 1)}`,
    progress: 0,
    crew: Math.max(config.minersPerCrew, Math.round(crew)),
    raceId,
    collapsed: false,
    fired: false,
    detected: false,
  });
}

/** Gói điều khoản mặc định khi thành mở cổng mà không ai kịp ngồi vào bàn. */
export function defaultTerms(): string[] {
  return packageOf('pkg_thong-thuong')?.terms ?? [];
}

/** Miệng ăn còn lại trong tường — UI và bảng hành động bên thủ đọc. */
export function mouths(siege: SiegeState): number {
  return mouthsInside(siege);
}
