/**
 * VÒNG ĐỜI MỘT TRẬN DÃ CHIẾN — dựng, đánh từng vòng, chốt, và giao biên niên.
 *
 * Đây là CỬA VÀO DUY NHẤT của Phần 10 cho phần còn lại của game. UI gọi
 * `createBattle` rồi `playRound`; bài test mục 15.12 gọi `autoBattle`; cả hai đi
 * qua đúng một con đường, nên thứ bài test đo được LÀ thứ người chơi sẽ chơi.
 *
 * DÒNG XÚC SẮC RIÊNG (`BATTLE_STREAM`), cùng lý do với Phần 9 và nặng hơn: số
 * lần tung trong một trận dã chiến thay đổi theo số đơn vị còn sống, số vòng, số
 * phản ứng cơ hội và số nhánh của đợt vỡ trận lan truyền. Trên dòng `main` thì
 * mọi cú tung của mọi lượt SAU trận sẽ lệch đi, và "cùng seed + cùng input = cùng
 * kết quả" lặng lẽ hết đúng (R3).
 *
 * KHÔNG GHI STORE. Trận đánh tích `playerOps` và trả cho người gọi chốt một lần —
 * người gọi mới giữ ngăn xếp undo, và undo phải tua về TRƯỚC cả trận chứ không
 * phải về giữa vòng thứ chín.
 *
 * MỘT ĐIỀU KHÔNG CÓ Ở ĐÂY: LLM. Không một con số nào của trận đánh do AI quyết
 * (R1). LLM được gọi đúng một lần, SAU trận, để viết diễn biến từ biên niên —
 * `narrationPrompt` của Phần 9 lo phần đó, và nó bị cấm đổi kết quả.
 */

import type { Rng } from '@/core/rng';
import type { GameState } from '@/state/slices';
import type { ChronicleAction, ChronicleRound, ChronicleSetting, CombatChronicle } from '@/systems/combat/chronicle';
import { compressChronicle, type CompactChronicle } from '@/systems/combat/chronicle';
import {
  battleConfig,
  defaultField,
  defaultTimeOfDay,
  defaultWeather,
  fieldOf,
  formationOf,
  gridConfig,
  timeOfDayOf,
  unitTypeOf,
  weatherOf,
  BattleDataError,
} from './data';
import {
  cellsFor,
  distance,
  generateField,
  gridSideFor,
  menPerPiece,
  piecesPerSide,
  stepToward,
  terrainAt,
  type BattleGrid,
  type Cell,
  type Dir8,
} from './grid';
import { canShoot, resolveClash, type ClashOutcome } from './clash';
import { opportunityTargets, rollInitiative, type InitiativeRoll } from './initiative';
import {
  adjustMorale,
  ambientMorale,
  commanderFell,
  propagateRout,
  refreshState,
  stateLabel,
  tickRout,
} from './morale';
import { buildCommand, centerEngaged, fieldOrderFor, issueOrder, markDisobedience, violatesOrder, type CommandSetup } from './command';
import {
  chooseUnitAction,
  cohesionTick,
  fatigueTick,
  movePoints,
  routMove,
  type UnitAction,
} from './tactics';
import {
  WINGS,
  WING_LABELS,
  controllable,
  onField,
  standingShare,
  strengthOf,
  averageMorale,
  unitById,
  unitsOf,
  type BattleState,
  type BattleUnit,
  type Officer,
  type OrderId,
  type SideId,
  type Temperament,
  type WingId,
} from './types';

/** Dòng RNG riêng của dã chiến. Xem chú thích đầu file. */
export const BATTLE_STREAM = 'battle';

/** Trần cứng số vòng. Lưới an toàn cho một cấu hình data hỏng (R4). */
export const MAX_ROUNDS = 40;

export class BattleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BattleError';
  }
}

// ---------------------------------------------------------------------------
// Dựng trận
// ---------------------------------------------------------------------------

export interface CompositionEntry {
  typeId: string;
  /** Phần của đạo quân, tương đối với các dòng khác. */
  share: number;
  wing?: WingId;
  formation?: string;
  quality?: 1 | 2 | 3 | 4 | 5;
}

export interface OfficerSpec {
  id?: string;
  name: string;
  wing: WingId;
  loyalty?: number;
  skill?: number;
  wit?: number;
  pre?: number;
  temperament?: Temperament;
  description?: string;
}

export interface ForceSpec {
  name: string;
  /** Thế lực, để lọc binh chủng thuê được. Chỉ dùng cho UI. */
  faction?: string;
  /** TỔNG quân. Engine tự chia thành 8–30 quân cờ theo mục 2. */
  troops: number;
  composition: readonly CompositionEntry[];
  officers?: readonly OfficerSpec[];
  commanderName?: string;
}

export interface BattleSetup {
  id?: string;
  a: ForceSpec;
  b: ForceSpec;
  fieldId?: string;
  weatherId?: string;
  timeId?: string;
  /** Bên nhân vật người chơi đứng. */
  playerSide?: SideId;
  /** Tước vị người chơi — quyết định họ cầm bao nhiêu quân (mục 3). */
  titleId?: string;
  playerWing?: WingId;
  /** Tên chủ soái, khi tước vị người chơi không đủ cầm toàn quân. */
  lordName?: string;
  setting?: Partial<ChronicleSetting>;
  stakes?: string;
  turn?: number;
  state?: GameState | null;
}

const TEMPERAMENTS: readonly Temperament[] = ['lieu-linh', 'than-trong', 'hao-danh', 'bat-man'];

function defaultFormationFor(typeId: string): string {
  const type = unitTypeOf(typeId);
  const first = type?.formations[0];
  if (first === undefined) throw new BattleDataError(`binh chủng "${typeId}" không khai đội hình nào`);
  return first;
}

/**
 * Chia một đạo quân thành quân cờ (mục 2).
 *
 * Số quân cờ là BẤT BIẾN của mục 2 (8–30 mỗi bên); tỷ lệ binh chủng của người
 * gọi được tôn trọng ở mức tốt nhất có thể trong ngần ấy quân cờ. Dòng nào bị
 * làm tròn xuống 0 vẫn được một quân cờ, vì "tôi có mang theo pháo" mà trên bàn
 * cờ không có khẩu nào là một lời nói dối engine không được phép nói.
 */
function splitIntoPieces(force: ForceSpec, side: SideId): BattleUnit[] {
  const pieces = piecesPerSide(force.troops);
  const men = menPerPiece(force.troops);
  const totalShare = force.composition.reduce((sum, entry) => sum + Math.max(0, entry.share), 0);
  if (totalShare <= 0) throw new BattleError(`đạo quân "${force.name}" không khai binh chủng nào`);

  const counts = force.composition.map((entry) => Math.max(1, Math.round((entry.share / totalShare) * pieces)));
  // Kéo lại cho khớp trần: cắt từ dòng đông nhất, không cắt đều, để một dòng nhỏ
  // (pháo, cấm vệ) không bị xóa sổ vì làm tròn.
  let total = counts.reduce((sum, value) => sum + value, 0);
  while (total > pieces) {
    let biggest = 0;
    for (let index = 1; index < counts.length; index++) {
      if ((counts[index] ?? 0) > (counts[biggest] ?? 0)) biggest = index;
    }
    if ((counts[biggest] ?? 0) <= 1) break;
    counts[biggest] = (counts[biggest] ?? 1) - 1;
    total -= 1;
  }

  const units: BattleUnit[] = [];
  let serial = 0;
  for (const [index, entry] of force.composition.entries()) {
    const type = unitTypeOf(entry.typeId);
    if (type === null) throw new BattleError(`binh chủng không có trong data/units.json: ${entry.typeId}`);

    const wing = entry.wing ?? WINGS[index % 3] ?? 'trung';
    const formation = entry.formation ?? defaultFormationFor(entry.typeId);
    if (formationOf(formation) === null) throw new BattleError(`đội hình không có trong data: ${formation}`);

    for (let copy = 0; copy < (counts[index] ?? 1); copy++) {
      serial += 1;
      const quality = entry.quality ?? (type.quality as 1 | 2 | 3 | 4 | 5);
      units.push({
        id: `unit_${side}_${String(serial)}`,
        typeId: type.id,
        name: `${type.name} ${String(copy + 1)}`,
        side,
        wing,
        commanderId: '',
        strength: men,
        maxStrength: men,
        quality,
        morale: type.moraleBase,
        moraleMax: 100,
        fatigue: 0,
        cohesion: 100,
        formation,
        pos: { x: 0, y: 0 },
        facing: side === 'a' ? 4 : 0,
        ammo: type.ammo,
        state: 'vung',
        holding: false,
        acted: false,
        reacted: false,
        initiative: 0,
        charging: false,
        routRounds: 0,
        playerLed: false,
        tags: [...type.tags],
      });
    }
  }
  return units;
}

/**
 * Đặt quân lên mép của mình, chia theo cánh.
 *
 * Tả bên trái, trung ở giữa, hữu bên phải, dự bị lùi về sau một hàng — đúng cách
 * một đạo quân thế kỷ 14 dàn ra, và cũng là điều kiện để "đánh vào sườn" của mục
 * 8 có nghĩa. Nếu engine rắc quân đều khắp lưới thì không cánh nào có sườn.
 */
/**
 * Hai hàng dàn trận cách nhau bao nhiêu ô.
 *
 * KHÔNG phải hai mép lưới. Lưới co giãn theo quy mô (mục 2), nên hai mép của một
 * trận ba nghìn người cách nhau gần hai cây số — và một trận đánh mở màn bằng hai
 * mươi vòng hành quân là hai mươi vòng không có gì xảy ra, trong đó cung thủ bắn
 * hết sạch đạn trước khi bên kia tới được nơi. Ở trận nhỏ thì lưới hẹp hơn quãng
 * này, và hai bên trở về đúng hai mép — đó là lý do có `Math.min`.
 */
function deployRows(grid: BattleGrid): { rowA: number; rowB: number } {
  const separation = Math.min(grid.height - 2, cellsFor(gridConfig().deployMeters, grid.cellMeters, true));
  const rowA = Math.max(0, Math.floor((grid.height - 1 - separation) / 2));
  return { rowA, rowB: Math.min(grid.height - 1, rowA + separation) };
}

function deploy(units: BattleUnit[], grid: BattleGrid, side: SideId, homeRow: number): void {
  const step = side === 'a' ? 1 : -1;

  for (const wing of WINGS) {
    const group = units.filter((unit) => unit.wing === wing);
    if (group.length === 0) continue;

    const third = Math.floor(grid.width / 3);
    const start = wing === 'ta' ? 0 : wing === 'huu' ? third * 2 : third;
    const span = wing === 'trung' || wing === 'du-bi' ? grid.width - third * 2 : third;
    const row = homeRow + (wing === 'du-bi' ? step * 2 : 0);

    for (const [index, unit] of group.entries()) {
      const lane = span <= 0 ? 0 : index % span;
      const rank = span <= 0 ? index : Math.floor(index / span);
      unit.pos = {
        x: Math.max(0, Math.min(grid.width - 1, start + lane)),
        y: Math.max(0, Math.min(grid.height - 1, row + step * rank)),
      };
      unit.facing = (side === 'a' ? 4 : 0) as Dir8;
    }
  }
}

function buildOfficers(force: ForceSpec, side: SideId, units: readonly BattleUnit[]): Officer[] {
  const wingsPresent = WINGS.filter((wing) => units.some((unit) => unit.wing === wing));
  const custom = force.officers ?? [];
  const officers: Officer[] = [];

  for (const [index, wing] of wingsPresent.entries()) {
    const spec = custom.find((entry) => entry.wing === wing);
    const nightSighted = units
      .filter((unit) => unit.wing === wing)
      .every((unit) => unit.tags.includes('nhin-dem'));

    officers.push({
      id: spec?.id ?? `npc_tuong_${side}_${wing}`,
      name: spec?.name ?? `Tướng ${WING_LABELS[wing]} — ${force.name}`,
      side,
      wing,
      loyalty: spec?.loyalty ?? 70,
      skill: spec?.skill ?? 50,
      wit: spec?.wit ?? 11,
      pre: spec?.pre ?? 12,
      // Thứ tự tính khí CỐ ĐỊNH theo vị trí cánh, không rút xúc sắc: một đạo quân
      // phải giống hệt nhau ở hai lần tải cùng một save (R3), và người gọi muốn
      // một viên tướng bất mãn thì khai thẳng ở `officers`.
      temperament: spec?.temperament ?? TEMPERAMENTS[index % TEMPERAMENTS.length] ?? 'than-trong',
      alive: true,
      nightSighted,
      description: spec?.description ?? '',
    });
  }
  return officers;
}

export function createBattle(rng: Rng, setup: BattleSetup): BattleState {
  const field = setup.fieldId === undefined ? defaultField() : fieldOf(setup.fieldId);
  if (field === null) throw new BattleError(`chiến trường không có trong data/terrain.json: ${String(setup.fieldId)}`);

  const weather = setup.weatherId === undefined ? defaultWeather() : weatherOf(setup.weatherId);
  if (weather === null) throw new BattleError(`thời tiết không có trong data/weather.json: ${String(setup.weatherId)}`);

  const time = setup.timeId === undefined ? defaultTimeOfDay() : timeOfDayOf(setup.timeId);
  if (time === null) throw new BattleError(`thời điểm không có trong data/weather.json: ${String(setup.timeId)}`);

  const side = gridSideFor(setup.a.troops + setup.b.troops);
  const grid = generateField(rng, field, side);

  const unitsA = splitIntoPieces(setup.a, 'a');
  const unitsB = splitIntoPieces(setup.b, 'b');
  const rows = deployRows(grid);
  deploy(unitsA, grid, 'a', rows.rowA);
  deploy(unitsB, grid, 'b', rows.rowB);

  const officers = [...buildOfficers(setup.a, 'a', unitsA), ...buildOfficers(setup.b, 'b', unitsB)];
  const units = [...unitsA, ...unitsB];
  for (const unit of units) {
    unit.commanderId = officers.find((officer) => officer.side === unit.side && officer.wing === unit.wing)?.id ?? '';
  }

  const playerSide = setup.playerSide ?? 'a';
  const battle: BattleState = {
    id: setup.id ?? `battle_${grid.fieldId}_${String(setup.turn ?? 0)}`,
    grid,
    weatherId: weather.id,
    timeId: time.id,
    forces: {
      a: { name: setup.a.name, commanderName: setup.a.commanderName ?? '', startTroops: setup.a.troops },
      b: { name: setup.b.name, commanderName: setup.b.commanderName ?? '', startTroops: setup.b.troops },
    },
    units,
    officers,
    order: [],
    cursor: 0,
    round: 1,
    finished: false,
    winner: '',
    ending: '',
    rounds: [],
    checks: [],
    log: [],
    playerSide,
    command: {
      titleId: '',
      titleName: '',
      scope: 'don-vi',
      ownedUnitIds: [],
      ownedWings: [],
      received: null,
      obeyed: null,
      disobeyedAtRound: 0,
      issued: [],
    },
    wingOrders: {},
    delayedOrders: [],
    setting: {
      place: setup.setting?.place ?? '',
      ground: setup.setting?.ground ?? field.name,
      weather: setup.setting?.weather ?? weather.name,
      timeOfDay: setup.setting?.timeOfDay ?? time.name,
      witnesses: setup.setting?.witnesses ?? '',
    },
    stakes: setup.stakes ?? '',
    playerOps: [],
    state: setup.state ?? null,
    rngState: rng.getState(),
    turn: setup.turn ?? 0,
    duelling: false,
    aftermath: null,
    llmCalls: 0,
  };

  const commandSetup: CommandSetup = {
    titleId: setup.titleId ?? 'thuong-dan',
    side: playerSide,
    ...(setup.playerWing === undefined ? {} : { wing: setup.playerWing }),
  };
  battle.command = buildCommand(battle, commandSetup);

  /**
   * Người chơi mang tước thấp thì NHẬN LỆNH, và lệnh ấy trói họ suốt trận (mục 3).
   *
   * Điều kiện là NGƯỜI GỌI CÓ KHAI TƯỚC VỊ. Không khai nghĩa là trận này không
   * có nhân vật người chơi trong đó — một trận mô phỏng ngầm của Phần 15, hoặc
   * một bài test đo cơ học thuần. Sinh ra một khung nhiệm vụ cho một người không
   * có mặt thì mọi đơn vị của bên ấy sẽ đứng yên chờ một mệnh lệnh không ai đọc,
   * và cả trận đánh đo sai.
   */
  if (
    setup.titleId !== undefined &&
    battle.command.scope !== 'toan-quan' &&
    battle.command.scope !== 'toan-quan-chien-luoc'
  ) {
    battle.command.received = fieldOrderFor(battle, rng, setup.lordName ?? 'chủ soái');
    battle.command.obeyed = true;
  }
  for (const id of battle.command.ownedUnitIds) {
    const unit = unitById(battle, id);
    if (unit !== null) unit.playerLed = true;
  }
  battle.rngState = rng.getState();
  return battle;
}

// ---------------------------------------------------------------------------
// Bản sao làm việc
// ---------------------------------------------------------------------------

export function cloneBattle(battle: BattleState): BattleState {
  return {
    ...battle,
    grid: { ...battle.grid, cells: [...battle.grid.cells] },
    units: battle.units.map((unit) => ({ ...unit, pos: { ...unit.pos }, tags: [...unit.tags] })),
    officers: battle.officers.map((officer) => ({ ...officer })),
    order: [...battle.order],
    rounds: [...battle.rounds],
    checks: [...battle.checks],
    log: [...battle.log],
    command: {
      ...battle.command,
      ownedUnitIds: [...battle.command.ownedUnitIds],
      ownedWings: [...battle.command.ownedWings],
      issued: [...battle.command.issued],
    },
    wingOrders: { ...battle.wingOrders },
    delayedOrders: battle.delayedOrders.map((entry) => ({ ...entry })),
    playerOps: [...battle.playerOps],
  };
}

// ---------------------------------------------------------------------------
// Mệnh lệnh của một vòng (mục 3)
// ---------------------------------------------------------------------------

function wingKey(side: SideId, wing: WingId): string {
  return `${side}:${wing}`;
}

export function orderFor(battle: BattleState, unit: BattleUnit): OrderId {
  return battle.wingOrders[wingKey(unit.side, unit.wing)] ?? 'tan-cong';
}

/**
 * Kế hoạch của một chủ soái do engine cầm.
 *
 * Rất đơn giản có chủ ý: giữ cánh yếu, đánh bằng cánh mạnh, đưa dự bị vào khi
 * trung quân đã chạm. Đây là "kế hoạch của chủ soái" mà mục 3 nhắc tới, và nó
 * phải ĐỌC ĐƯỢC — một bộ tướng số phức tạp sẽ làm bài test mục 15.12 đo một thứ
 * không ai giải thích nổi.
 */
function plannedOrder(battle: BattleState, side: SideId, wing: WingId): OrderId {
  const mine = unitsOf(battle, side).filter((unit) => unit.wing === wing);
  if (mine.length === 0) return 'giu';

  /**
   * MẶC ĐỊNH LÀ TUÂN LỆNH.
   *
   * Cánh của người chơi, khi họ đang mang một mệnh lệnh từ trên, đi theo mệnh
   * lệnh ấy trừ khi chính họ bấm khác. Nếu mặc định là "kế hoạch hợp lý nhất"
   * thì người chơi trái lệnh ngay từ vòng một mà chưa chạm vào một cái nút nào,
   * rồi lãnh hệ quả nặng nhất của mục 3 — và cả nhánh kịch tính ấy, vốn xây trên
   * một quyết định, biến thành một cái bẫy.
   */
  const received = battle.command.received;
  if (received !== null && side === battle.playerSide && wing === received.wing) {
    const stillBound =
      (received.notBeforeRound > 0 && battle.round <= received.notBeforeRound) ||
      (received.requiresCenterEngaged && !centerEngaged(battle, side));
    if (stillBound || received.id !== 'giu') return received.id;
  }

  if (wing === 'du-bi') return centerEngaged(battle, side) ? 'tien' : 'giu';

  const ranged = mine.every((unit) => unit.ammo > 0 && (unitTypeOf(unit.typeId)?.rangeMeters ?? 0) > 0);
  if (ranged) return 'ban';

  const share = standingShare(battle, side);
  if (share < 0.4) return 'rut';

  // Hàng giáo dài GIỮ chứ không đuổi: cả giá trị của nó nằm ở chỗ đứng yên (mục 6).
  if (mine.every((unit) => unit.tags.includes('giao-dai'))) return 'giu';
  return 'tan-cong';
}

/**
 * Ra lệnh cho mọi cánh của một bên, qua đúng ma sát của mục 3.
 *
 * Bên do engine cầm cũng phải chịu ma sát ấy. Nếu chỉ người chơi bị 3d6 chặn còn
 * đối phương thì lệnh nào cũng thi hành đúng, thì "ma sát" không phải một luật
 * của thế giới mà là một hình phạt dành riêng cho người chơi.
 */
export function issueWingOrders(battle: BattleState, rng: Rng, side: SideId, chosen?: Partial<Record<WingId, OrderId>>): void {
  const commander =
    battle.officers.find((officer) => officer.side === side && officer.wing === 'trung' && officer.alive) ??
    battle.officers.find((officer) => officer.side === side && officer.alive) ??
    null;
  if (commander === null) return;

  for (const wing of WINGS) {
    const key = wingKey(side, wing);
    const officer = battle.officers.find((entry) => entry.side === side && entry.wing === wing);
    if (officer === undefined) continue;
    if (unitsOf(battle, side).every((unit) => unit.wing !== wing)) continue;

    const wanted = chosen?.[wing] ?? plannedOrder(battle, side, wing);

    // Chủ soái ra lệnh cho CHÍNH CÁNH MÌNH thì không có ma sát — không ai phải
    // truyền tin cho chính mình. Tướng chết thì cánh ấy mất đầu và giữ nguyên
    // lệnh cũ cho tới khi có người khác tới.
    if (officer.id === commander.id) {
      battle.wingOrders[key] = wanted;
      continue;
    }
    if (!officer.alive) continue;

    const outcome = issueOrder(battle, rng, commander, officer, wanted);
    battle.command.issued.push(outcome.issued);
    battle.checks.push({ round: battle.round, side, unitId: officer.id, result: outcome.check });

    if (outcome.delayed) {
      battle.delayedOrders.push({ key, order: outcome.actual, fromRound: battle.round + 1 });
      continue;
    }
    battle.wingOrders[key] = outcome.actual;
  }
}

function applyDelayedOrders(battle: BattleState): void {
  const still: BattleState['delayedOrders'] = [];
  for (const entry of battle.delayedOrders) {
    if (entry.fromRound <= battle.round) battle.wingOrders[entry.key] = entry.order;
    else still.push(entry);
  }
  battle.delayedOrders = still;
}

// ---------------------------------------------------------------------------
// Một vòng
// ---------------------------------------------------------------------------

export interface RoundResult {
  battle: BattleState;
  rolls: InitiativeRoll[];
  round: ChronicleRound;
  /** Đơn vị vỡ trận trong vòng này — thứ UI phải nhấn mạnh nhất. */
  routed: string[];
}

interface RoundScratch {
  actions: ChronicleAction[];
  moves: string[];
  routed: string[];
}

function log(battle: BattleState, side: SideId | '', text: string, major = false): void {
  battle.log.push({ round: battle.round, side, text, ...(major ? { major: true } : {}) });
}

function occupiedBy(battle: BattleState, mover: BattleUnit): (cell: Cell) => boolean {
  return (cell) => battle.units.some((unit) => unit.id !== mover.id && onField(unit) && unit.pos.x === cell.x && unit.pos.y === cell.y);
}

function applyClash(
  battle: BattleState,
  rng: Rng,
  attacker: BattleUnit,
  defender: BattleUnit,
  outcome: ClashOutcome,
  scratch: RoundScratch,
): void {
  const config = battleConfig().casualties;

  defender.strength = Math.max(0, defender.strength - outcome.defenderLosses);
  attacker.strength = Math.max(0, attacker.strength - outcome.attackerLosses);
  adjustMorale(defender, -outcome.defenderMoraleLoss);
  adjustMorale(attacker, outcome.attackerMoraleGain);

  attacker.fatigue = Math.min(100, attacker.fatigue + config.fatiguePerExchange);
  attacker.cohesion = Math.max(0, attacker.cohesion - config.cohesionPerExchange);
  if (!outcome.ranged) {
    defender.fatigue = Math.min(100, defender.fatigue + config.fatiguePerExchange);
    defender.cohesion = Math.max(0, defender.cohesion - config.cohesionPerExchange);
  }

  // Nêm mất đội hình NGAY SAU KHI CHẠM (mục 6). Đây là cái giá của cú xuyên phá,
  // và là lý do một đợt xung phong thất bại không bao giờ đánh lại được lần hai.
  if (attacker.charging) {
    const afterContact = formationOf(attacker.formation)?.cohesionAfterContact ?? 0;
    if (afterContact > 0) attacker.cohesion = Math.max(0, attacker.cohesion - afterContact);
  }

  battle.checks.push({ round: battle.round, side: attacker.side, unitId: attacker.id, result: outcome.check });
  scratch.actions.push({
    actorId: attacker.id,
    action: `${outcome.ranged ? 'bắn vào' : 'đánh vào'} ${defender.name}`,
    target: defender.id,
    result: outcome.tier,
    margin: outcome.check.margin,
    note: outcome.note,
  });

  refreshState(defender);
  refreshState(attacker);

  if (defender.strength <= 0) {
    defender.state = 'tan-ra';
    log(battle, attacker.side, `${defender.name} bị xóa sổ tại chỗ.`, true);
  }

  // VỠ TRẬN LAN TRUYỀN — cơ chế quan trọng nhất của cả phần (mục 8).
  if (defender.state === 'vo-tran' && !scratch.routed.includes(defender.id)) {
    const spread = propagateRout(battle, rng, defender);
    for (const id of spread.broken) {
      if (!scratch.routed.includes(id)) scratch.routed.push(id);
    }
    for (const entry of spread.checks) {
      battle.checks.push({ round: battle.round, side: defender.side, unitId: entry.unitId, result: entry.result });
    }
    log(battle, defender.side, `${defender.name} vỡ trận.`, true);
    for (const line of spread.lines) log(battle, defender.side, line, true);
  }
}

function meleeAttack(
  battle: BattleState,
  rng: Rng,
  attacker: BattleUnit,
  defender: BattleUnit,
  scratch: RoundScratch,
): void {
  const outcome = resolveClash(battle, rng, attacker, defender, { ranged: false });
  applyClash(battle, rng, attacker, defender, outcome, scratch);
}

function volley(battle: BattleState, rng: Rng, shooter: BattleUnit, target: BattleUnit, scratch: RoundScratch): void {
  shooter.ammo = Math.max(0, shooter.ammo - 1);
  const outcome = resolveClash(battle, rng, shooter, target, { ranged: true });
  applyClash(battle, rng, shooter, target, outcome, scratch);
  // Bị bắn liên tục là một nguồn giảm sĩ khí RIÊNG của mục 8, tách khỏi thương vong.
  adjustMorale(target, -battleConfig().morale.underFire);
}

function reactionsAfterMove(battle: BattleState, rng: Rng, mover: BattleUnit, moved: number, scratch: RoundScratch): void {
  if (moved <= 0) return;
  for (const reaction of opportunityTargets(battle, mover, moved)) {
    if (!onField(mover)) break;
    reaction.unit.reacted = true;
    const outcome = resolveClash(battle, rng, reaction.unit, mover, { ranged: reaction.ranged });
    if (reaction.ranged) reaction.unit.ammo = Math.max(0, reaction.unit.ammo - 1);
    applyClash(battle, rng, reaction.unit, mover, outcome, scratch);
    scratch.moves.push(`${reaction.unit.name} phản ứng: ${reaction.reason}.`);
  }
}

function moveUnit(
  battle: BattleState,
  rng: Rng,
  unit: BattleUnit,
  toward: Cell,
  scratch: RoundScratch,
): number {
  const budget = movePoints(battle, unit);
  if (budget <= 0) return 0;

  const before = { ...unit.pos };
  const outcome = stepToward(battle.grid, unit.pos, toward, budget, occupiedBy(battle, unit));
  unit.pos = outcome.cell;
  const moved = distance(before, unit.pos);
  if (moved === 0) return 0;

  // Quay mặt về hướng vừa đi: một khối quân không hành quân ngang.
  unit.facing = ((): Dir8 => {
    const dx = unit.pos.x - before.x;
    const dy = unit.pos.y - before.y;
    if (dx === 0 && dy === 0) return unit.facing;
    const angle = Math.atan2(dx, -dy);
    return (Math.round(angle / (Math.PI / 4) + 8) % 8) as Dir8;
  })();

  const terrain = terrainAt(battle.grid, unit.pos);
  if (terrain.cohesionDrain > 0) unit.cohesion = Math.max(0, unit.cohesion - terrain.cohesionDrain);

  reactionsAfterMove(battle, rng, unit, moved, scratch);
  return moved;
}

function actUnit(battle: BattleState, rng: Rng, unit: BattleUnit, action: UnitAction, scratch: RoundScratch): void {
  unit.acted = true;
  unit.holding = false;
  unit.charging = false;

  switch (action.kind) {
    case 'giu':
      break;

    case 'cho':
      // GIỮ LỆNH (mục 4.3): bỏ lượt để phản ứng sau. Hàng giáo chờ kỵ binh lao
      // vào rồi mới hạ giáo là ví dụ nguyên văn của mục ấy.
      unit.holding = true;
      unit.acted = false;
      break;

    case 'doi-doi-hinh': {
      const target = action.formation ?? unit.formation;
      const formation = formationOf(target);
      if (formation === null) break;
      const change = battleConfig();
      const near = battle.units.some(
        (foe) => foe.side !== unit.side && onField(foe) && distance(foe.pos, unit.pos) <= 2,
      );
      const cost = near ? 32 : 14;
      unit.formation = target;
      unit.cohesion = Math.max(0, unit.cohesion - cost);
      unit.fatigue = Math.min(100, unit.fatigue + change.casualties.fatiguePerExchange * 0.4);
      scratch.moves.push(
        `${unit.name} đổi sang ${formation.name}${near ? ' ngay trước mũi địch — hàng lối xộc xệch hẳn' : ''}.`,
      );
      break;
    }

    case 'ban': {
      const target = action.targetId === undefined ? null : unitById(battle, action.targetId);
      if (target === null || !onField(target) || !canShoot(battle, unit, target)) break;
      volley(battle, rng, unit, target, scratch);
      break;
    }

    case 'tan-cong': {
      const target = action.targetId === undefined ? null : unitById(battle, action.targetId);
      if (target === null || !onField(target)) break;
      if (distance(unit.pos, target.pos) > 1) {
        const moved = moveUnit(battle, rng, unit, target.pos, scratch);
        if (!onField(unit)) break;
        // XUNG PHONG: chạy tới rồi đánh trong cùng một vòng. Nhãn `xung-phong`
        // chỉ sống đúng pha này, và luật giáo dài của mục 7 chỉ bắn ở đây.
        if (moved > 0 && unit.tags.includes('ky-binh')) unit.charging = true;
      }
      if (distance(unit.pos, target.pos) <= 1) meleeAttack(battle, rng, unit, target, scratch);
      break;
    }

    case 'tien': {
      const toward = action.toward ?? (action.targetId === undefined ? null : unitById(battle, action.targetId)?.pos);
      if (toward === null || toward === undefined) break;

      // Trái lệnh: chỉ tính khi người chơi CHỦ ĐỘNG đưa quân lên (mục 3).
      if (unit.side === battle.playerSide && violatesOrder(battle, unit, true)) {
        markDisobedience(battle);
        log(battle, unit.side, `${unit.name} rời vị trí — ngài vừa trái lệnh ${battle.command.received?.fromName ?? ''}.`, true);
      }

      const moved = moveUnit(battle, rng, unit, toward, scratch);
      if (!onField(unit)) break;
      const foe = battle.units.find((entry) => entry.side !== unit.side && onField(entry) && distance(entry.pos, unit.pos) <= 1);
      if (foe !== undefined) {
        if (moved > 0 && unit.tags.includes('ky-binh')) unit.charging = true;
        meleeAttack(battle, rng, unit, foe, scratch);
      } else if (moved > 0) {
        scratch.moves.push(`${unit.name} tiến ${String(moved)} ô.`);
      }
      break;
    }

    case 'rut': {
      const toward = action.toward ?? unit.pos;
      const moved = moveUnit(battle, rng, unit, toward, scratch);
      if (moved > 0) scratch.moves.push(`${unit.name} lùi ${String(moved)} ô.`);
      break;
    }
  }
}

function wingNotes(battle: BattleState): ChronicleRound['battle'] {
  const wings: NonNullable<ChronicleRound['battle']>['wings'] = [];
  for (const side of ['a', 'b'] as const) {
    for (const wing of WINGS) {
      const group = unitsOf(battle, side).filter((unit) => unit.wing === wing);
      if (group.length === 0) continue;
      const strength = group.reduce((sum, unit) => sum + unit.strength, 0);
      const morale = group.reduce((sum, unit) => sum + unit.morale, 0) / group.length;
      const worst = group.reduce(
        (state, unit) => (rank(unit.state) < rank(state) ? unit.state : state),
        group[0]?.state ?? 'vung',
      );
      wings.push({ side, wing: `${side === 'a' ? 'bên thứ nhất' : 'bên thứ hai'} — ${WING_LABELS[wing]}`, strength, morale, state: stateLabel(worst) });
    }
  }
  return { wings, moves: [], routed: [], orders: [] };
}

const STATE_RANK: Readonly<Record<string, number>> = {
  'tan-ra': 0,
  'vo-tran': 1,
  'nao-nung': 2,
  'lung-lay': 3,
  vung: 4,
};

function rank(state: string): number {
  return STATE_RANK[state] ?? 4;
}

/**
 * Một vòng: tung khởi động, đi lần lượt theo thứ tự ấy, rồi tính sĩ khí cuối vòng.
 *
 * `choices` là nước đi người chơi đã bấm cho những đơn vị họ cầm; đơn vị nào
 * không có trong đó thì engine chọn theo mệnh lệnh đang treo trên cánh ấy.
 */
export function playRound(battle: BattleState, rng: Rng, choices: Record<string, UnitAction> = {}): RoundResult {
  const next = cloneBattle(battle);
  if (next.finished) {
    return { battle: next, rolls: [], round: emptyRound(next), routed: [] };
  }

  applyDelayedOrders(next);
  for (const unit of next.units) {
    unit.acted = false;
    unit.reacted = false;
    unit.charging = false;
  }

  const rolls = rollInitiative(next, rng);
  next.order = rolls.map((roll) => roll.unitId);
  next.cursor = 0;

  const scratch: RoundScratch = { actions: [], moves: [], routed: [] };

  for (const id of next.order) {
    const unit = unitById(next, id);
    if (unit === null || !onField(unit)) continue;
    if (unit.acted) continue;

    if (!controllable(unit)) {
      // Vỡ trận: chạy về mép, không nhận lệnh, và chạy qua đội hình bạn (mục 8).
      actUnit(next, rng, unit, routMove(next, unit), scratch);
      continue;
    }

    const chosen = choices[id] ?? chooseUnitAction(next, rng, unit, { order: orderFor(next, unit) });
    actUnit(next, rng, unit, chosen, scratch);
  }

  // Cuối vòng: mệt, đội ngũ, sĩ khí quanh trận, rồi mới tới chuyện ai tan hẳn.
  for (const unit of next.units) {
    if (!onField(unit)) continue;
    unit.fatigue = Math.max(0, Math.min(100, unit.fatigue + fatigueTick(next, unit, unit.acted)));
    unit.cohesion = Math.max(0, Math.min(100, unit.cohesion + cohesionTick(next, unit, unit.acted)));
  }
  const ambient = ambientMorale(next);
  for (const line of ambient) log(next, '', line);
  for (const line of tickRout(next)) log(next, '', line, true);

  const notes = wingNotes(next);
  const round: ChronicleRound = {
    n: next.round,
    actions: scratch.actions,
    injuries: [],
    tempoAfter: { a: averageMorale(next, 'a'), b: averageMorale(next, 'b') },
    staminaAfter: { a: strengthOf(next, 'a'), b: strengthOf(next, 'b') },
    battle: {
      wings: notes?.wings ?? [],
      moves: scratch.moves,
      routed: scratch.routed.map((id) => unitById(next, id)?.name ?? id),
      orders: next.command.issued
        .filter((entry) => entry.round === next.round)
        .map((entry) => ({ officer: entry.officerName, order: entry.order, result: entry.result, effect: entry.note })),
    },
  };
  if (scratch.routed.length > 0) round.highlight = 'turningPoint';

  next.rounds.push(round);
  next.round += 1;
  next.rngState = rng.getState();
  settle(next);

  return { battle: next, rolls, round, routed: scratch.routed };
}

function emptyRound(battle: BattleState): ChronicleRound {
  return {
    n: battle.round,
    actions: [],
    injuries: [],
    tempoAfter: { a: averageMorale(battle, 'a'), b: averageMorale(battle, 'b') },
    staminaAfter: { a: strengthOf(battle, 'a'), b: strengthOf(battle, 'b') },
  };
}

// ---------------------------------------------------------------------------
// Kết thúc trận
// ---------------------------------------------------------------------------

export const ENDINGS: Readonly<Record<string, string>> = {
  'vo-tran-toan-dien': 'một bên vỡ trận toàn diện',
  'tan-hang': 'một bên không còn đơn vị nào đứng',
  'het-gio': 'trời tối, hai bên tự rời nhau',
  'ca-hai-kiet': 'cả hai bên đều không đánh nổi nữa',
};

/**
 * Trận đánh kết thúc khi nào.
 *
 * Ngưỡng "còn dưới một phần tư" chứ không phải "hết sạch" là toàn bộ tinh thần
 * của mục 1: trận thế kỷ 14 kết thúc bằng VỠ TRẬN, không phải bằng tiêu diệt hết.
 * Một điều kiện "đánh tới người cuối cùng" sẽ biến mọi trận thành một cuộc mài
 * mòn, đúng thứ README dự án mục 8.6 cấm.
 */
function settle(battle: BattleState): void {
  if (battle.finished) return;

  const shareA = standingShare(battle, 'a');
  const shareB = standingShare(battle, 'b');
  const aliveA = unitsOf(battle, 'a').some((unit) => controllable(unit));
  const aliveB = unitsOf(battle, 'b').some((unit) => controllable(unit));

  const finish = (winner: SideId | '', ending: string): void => {
    battle.finished = true;
    battle.winner = winner;
    battle.ending = ending;
    log(battle, '', `Trận kết thúc: ${ENDINGS[ending] ?? ending}.`, true);
  };

  if (!aliveA && !aliveB) return finish('', 'ca-hai-kiet');
  if (!aliveA) return finish('b', 'tan-hang');
  if (!aliveB) return finish('a', 'tan-hang');
  if (shareA < 0.25 && shareA < shareB) return finish('b', 'vo-tran-toan-dien');
  if (shareB < 0.25 && shareB < shareA) return finish('a', 'vo-tran-toan-dien');
  if (battle.round > MAX_ROUNDS) {
    return finish(shareA === shareB ? '' : shareA > shareB ? 'a' : 'b', 'het-gio');
  }
}

/** Chủ soái tử trận — cửa mà Phần 9 mở ra khi người chơi xông lên và chết (mục 11). */
export function officerKilled(battle: BattleState, rng: Rng, officerId: string): BattleState {
  const next = cloneBattle(battle);
  for (const line of commanderFell(next, rng, officerId)) log(next, '', line, true);
  settle(next);
  return next;
}

/**
 * Đánh trọn một trận, không có người — bài test mục 15.12 và mô phỏng ngầm dùng.
 *
 * Trần cứng `MAX_ROUNDS + 2` là lưới an toàn cho một cấu hình data hỏng: một trận
 * mà không bên nào tới được ngưỡng vỡ trận sẽ treo vòng lặp, và một minigame treo
 * là thứ R4 cấm.
 */
export function autoBattle(battle: BattleState, rng: Rng): BattleState {
  // Clone ngay: `issueWingOrders` ghi vào trận nó nhận được, và người gọi giữ
  // bản gốc để tua lại (R3). Không clone thì bài test chạy hai lần trên cùng một
  // đối tượng sẽ cộng dồn mệnh lệnh của lần trước.
  let current = cloneBattle(battle);
  for (let guard = 0; guard < MAX_ROUNDS + 2 && !current.finished; guard++) {
    issueWingOrders(current, rng, 'a');
    issueWingOrders(current, rng, 'b');
    current = playRound(current, rng).battle;
  }
  if (!current.finished) {
    current = cloneBattle(current);
    current.finished = true;
    current.ending = 'het-gio';
    const shareA = standingShare(current, 'a');
    const shareB = standingShare(current, 'b');
    current.winner = shareA === shareB ? '' : shareA > shareB ? 'a' : 'b';
  }
  return current;
}

// ---------------------------------------------------------------------------
// Biên niên (mục 13)
// ---------------------------------------------------------------------------

function forceNote(battle: BattleState, side: SideId): CombatChronicle['forces'] extends undefined ? never : NonNullable<CombatChronicle['forces']>[number] {
  const units = battle.units.filter((unit) => unit.side === side);
  const commander = battle.officers.find((officer) => officer.side === side && officer.wing === 'trung');
  return {
    side,
    name: battle.forces[side].name,
    strength: units.reduce((sum, unit) => sum + unit.maxStrength, 0),
    units: units.length,
    commander: commander?.name ?? '',
  };
}

export function buildChronicle(battle: BattleState): CombatChronicle {
  const time = timeOfDayOf(battle.timeId);
  const summary =
    battle.winner === ''
      ? 'Hai bên rời nhau trong đêm, không ai giữ được chiến trường.'
      : `${battle.forces[battle.winner].name} giữ được chiến trường sau ${String(battle.rounds.length)} vòng.`;

  return {
    kind: 'battle',
    setting: { ...battle.setting },
    participants: battle.officers.map((officer) => ({
      id: officer.id,
      name: officer.name,
      side: `${officer.side} — ${WING_LABELS[officer.wing]}`,
      description: officer.description,
      gear: '',
      relation: officer.id === '' ? 'chính ngài' : '',
    })),
    forces: [forceNote(battle, 'a'), forceNote(battle, 'b')],
    stakes: battle.stakes,
    rounds: battle.rounds,
    outcome: {
      winnerId: battle.winner === '' ? '' : (battle.officers.find((officer) => officer.side === battle.winner)?.id ?? ''),
      ending: battle.ending,
      endingName: ENDINGS[battle.ending] ?? battle.ending,
      summary,
    },
    duration: {
      rounds: battle.rounds.length,
      minutes: Math.max(1, Math.round(battle.rounds.length * battleConfig().roundMinutes)),
    },
    aftermath: battle.aftermath?.lines ?? [`Trận đánh diễn ra ${time?.name.toLowerCase() ?? ''}.`],
  };
}

/** Biên niên đã nén, sẵn sàng đưa vào prompt viết diễn biến (mục 13). */
export function chronicleFor(battle: BattleState, maxRounds = 10): CompactChronicle {
  return compressChronicle(buildChronicle(battle), { maxRounds });
}
