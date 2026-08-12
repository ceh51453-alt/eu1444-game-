/**
 * QUYỀN CHỈ HUY THEO TƯỚC VỊ, VÀ MA SÁT CỦA MỆNH LỆNH (Phần 10 mục 3).
 *
 * Mục 3 có một câu quyết định toàn bộ file này: **"Tước vị cao cho quyền lớn hơn
 * nhưng ma sát cũng lớn hơn. Không tầng nào là chế độ dễ."**
 *
 * Nên hai nhánh dưới đây phải đắt ngang nhau, chỉ khác chỗ đau:
 *
 *   TƯỚC THẤP   cầm một hai đơn vị, nhưng NHẬN LỆNH từ trên và bị trói bởi nó.
 *               Nguồn kịch tính là quyết định trái lệnh — và ba dòng hệ quả của
 *               mục 3 phải khác nhau thật, không phải ba cách nói cùng một điều.
 *   TOÀN QUÂN   cầm hết, nhưng mỗi mệnh lệnh phải qua 3d6 vs (PRE + lòng trung),
 *               và càng nhiều tướng thì càng nhiều chỗ hỏng.
 *
 * Nếu một nhánh dễ hơn hẳn nhánh kia thì cả thang tước vị của Phần 13 mất nghĩa
 * ở chỗ duy nhất mà người chơi cảm nhận được nó rõ nhất: trên chiến trường.
 *
 * TƯỚC VỊ KHÔNG DO PHẦN 10 SỞ HỮU. Phần 13 dựng thang thật. Bảng ở
 * `data/units.json → command` chỉ trả lời đúng một câu hỏi quân sự — "ra trận thì
 * cầm được bao nhiêu quân" — và `commandOf` cho tước lạ rơi về bậc thấp nhất chứ
 * không nổ, vì Phần 13 sẽ thêm bậc mà Phần 10 chưa biết.
 */

import type { CheckResult, CheckTier, DifficultyBand } from '@/core/turn';
import type { Rng } from '@/core/rng';
import { runCheck } from '@/systems/check/run';
import { battleConfig, commandOf } from './data';
import { distance, metersFor } from './grid';
import { ORDER_DOMAIN, commandFactor, publishCommand } from './modifiers';
import {
  ORDER_EFFECT_LABELS,
  ORDER_LABELS,
  WING_LABELS,
  controllable,
  onField,
  otherSide,
  playerCommands,
  unitsOf,
  type BattleState,
  type BattleUnit,
  type CommandState,
  type FieldOrder,
  type IssuedOrder,
  type Officer,
  type OrderEffect,
  type OrderId,
  type SideId,
  type WingId,
} from './types';

// ---------------------------------------------------------------------------
// Quyền chỉ huy
// ---------------------------------------------------------------------------

/** Người mang tước này có cầm toàn quân không. */
export function commandsWholeArmy(titleId: string): boolean {
  const scope = commandOf(titleId).scope;
  return scope === 'toan-quan' || scope === 'toan-quan-chien-luoc';
}

/** Có được quyết định chiến lược TRƯỚC trận không (chỉ Vương và Hoàng đế). */
export function setsStrategy(titleId: string): boolean {
  return commandOf(titleId).scope === 'toan-quan-chien-luoc';
}

export interface CommandSetup {
  titleId: string;
  side: SideId;
  /** Cánh người chơi được giao, khi tước đủ cầm một cánh. */
  wing?: WingId;
  /** Tên chủ soái, khi người chơi phải nhận lệnh. */
  lordName?: string;
}

/**
 * Chia quyền cho người chơi từ tước vị của họ (bảng của mục 3).
 *
 * Thứ tự chọn đơn vị KHÔNG ngẫu nhiên: lấy theo đúng thứ tự trong `battle.units`
 * của cánh được giao. Ngẫu nhiên ở đây nghĩa là tải lại một save rồi vào lại trận
 * thì người chơi cầm những đơn vị khác (R3).
 */
export function buildCommand(battle: BattleState, setup: CommandSetup): CommandState {
  const row = commandOf(setup.titleId);
  const side = setup.side;
  const wing = setup.wing ?? 'huu';

  const ownedWings: WingId[] = [];
  let ownedUnitIds: string[] = [];

  switch (row.scope) {
    case 'don-vi':
    case 'phan-doi': {
      const pool = unitsOf(battle, side).filter((unit) => unit.wing === wing);
      const fallback = pool.length > 0 ? pool : unitsOf(battle, side);
      ownedUnitIds = fallback.slice(0, Math.max(1, row.units)).map((unit) => unit.id);
      break;
    }
    case 'canh':
      ownedWings.push(wing);
      break;
    case 'canh-va-du-bi':
      ownedWings.push(wing, 'du-bi');
      break;
    case 'toan-quan':
    case 'toan-quan-chien-luoc':
      ownedWings.push('ta', 'trung', 'huu', 'du-bi');
      break;
  }

  return {
    titleId: row.titleId,
    titleName: row.name,
    scope: row.scope,
    ownedUnitIds,
    ownedWings,
    received: null,
    obeyed: null,
    disobeyedAtRound: 0,
    issued: [],
  };
}

// ---------------------------------------------------------------------------
// Lệnh nhận từ trên (mục 3, nhánh tước thấp)
// ---------------------------------------------------------------------------

/**
 * Khung nhiệm vụ chủ soái giao.
 *
 * Câu ví dụ của mục 3 — *"Giữ cánh phải, không được tiến trước khi trung quân
 * giao chiến"* — được dựng lại thành DỮ LIỆU: một mệnh lệnh, một cánh, và một
 * điều kiện kiểm được. Nếu nó chỉ là một dòng chữ thì engine không bao giờ biết
 * người chơi đã trái lệnh chưa, và cả nhánh kịch tính của mục 3 biến mất.
 */
export function fieldOrderFor(battle: BattleState, rng: Rng, lordName: string): FieldOrder {
  const wing = battle.command.ownedWings[0] ?? wingOfOwned(battle) ?? 'huu';
  const wingLabel = WING_LABELS[wing];

  // Ba khung lệnh, và chúng khác nhau ở chỗ ràng buộc chứ không ở chỗ chữ nghĩa.
  const kind = rng.int(0, 2);
  if (kind === 0) {
    return {
      id: 'giu',
      wing,
      text: `Giữ ${wingLabel}, không được tiến trước khi trung quân giao chiến.`,
      notBeforeRound: 0,
      requiresCenterEngaged: true,
      fromName: lordName,
    };
  }
  if (kind === 1) {
    const wait = rng.int(2, 4);
    return {
      id: 'giu',
      wing,
      text: `Đứng yên ở ${wingLabel} tới hết vòng ${String(wait)}. Sau đó tùy ngài.`,
      notBeforeRound: wait,
      requiresCenterEngaged: false,
      fromName: lordName,
    };
  }
  return {
    id: 'tan-cong',
    wing,
    text: `Đưa ${wingLabel} lên đánh ngay từ vòng đầu, ghìm chân chúng lại cho trung quân.`,
    notBeforeRound: 0,
    requiresCenterEngaged: false,
    fromName: lordName,
  };
}

function wingOfOwned(battle: BattleState): WingId | null {
  const first = battle.command.ownedUnitIds[0];
  if (first === undefined) return null;
  return battle.units.find((unit) => unit.id === first)?.wing ?? null;
}

/** Trung quân của một bên đã giao chiến chưa — điều kiện của khung lệnh thứ nhất. */
export function centerEngaged(battle: BattleState, side: SideId): boolean {
  const centre = unitsOf(battle, side).filter((unit) => unit.wing === 'trung');
  const foes = unitsOf(battle, otherSide(side));
  return centre.some((unit) => foes.some((foe) => distance(unit.pos, foe.pos) <= 1));
}

/**
 * Nước đi này có phá lệnh không.
 *
 * CHỈ xét lệnh `giu`: một mệnh lệnh "đánh đi" mà người chơi đánh chậm hơn ý chủ
 * soái là chuyện thường của mọi trận đánh, còn một mệnh lệnh "đứng yên" mà người
 * chơi bỏ vị trí là chuyện chỉ xảy ra khi họ CỐ Ý. Ranh giới ấy phải sắc, vì hệ
 * quả của nó — mất đất, mất tước — quá nặng để dựa vào một phép đo mờ.
 */
export function violatesOrder(battle: BattleState, unit: BattleUnit, movingForward: boolean): boolean {
  const order = battle.command.received;
  if (order === null || order.id !== 'giu') return false;
  if (!movingForward) return false;
  /**
   * CHỈ những đơn vị NGÀI CẦM mới làm ngài trái lệnh.
   *
   * Ở tước thấp, người chơi cầm một hai đơn vị trong một cánh mà người khác chỉ
   * huy. Viên tướng ấy nhận lệnh riêng của mình từ chủ soái và có thể đưa cả
   * cánh lên — nếu chuyện đó bị tính là người chơi trái lệnh thì họ lãnh hệ quả
   * nặng nhất của mục 3 (mất đất, mất tước) vì một việc họ không làm và không
   * ngăn được. Trái lệnh phải là một QUYẾT ĐỊNH, và quyết định chỉ tồn tại ở chỗ
   * người ta có quyền chọn.
   */
  if (!playerCommands(battle, unit)) return false;

  if (order.notBeforeRound > 0 && battle.round <= order.notBeforeRound) return true;
  if (order.requiresCenterEngaged && !centerEngaged(battle, unit.side)) return true;
  return false;
}

/** Ghi lại rằng người chơi đã trái lệnh. MỘT CHIỀU — không rút lại được. */
export function markDisobedience(battle: BattleState): void {
  if (battle.command.received === null) return;
  if (battle.command.obeyed === false) return;
  battle.command.obeyed = false;
  battle.command.disobeyedAtRound = battle.round;
}

export interface ObedienceOutcome {
  reputation: number;
  standing: string;
  line: string;
}

/**
 * Ba dòng hệ quả của mục 3, cài đúng nguyên văn:
 *
 *   trái lệnh + thắng trận → uy tín tăng mạnh, nhưng chủ soái ghi hận
 *   trái lệnh + thua       → có thể bị khép tội, mất đất, mất tước
 *   tuân lệnh + thua       → không bị trách, nhưng không có công
 */
export function obedienceOutcome(battle: BattleState): ObedienceOutcome {
  const order = battle.command.received;
  const won = battle.winner === battle.playerSide;

  if (order === null) {
    return won
      ? { reputation: 12, standing: 'Chính ngài là chủ soái, và ngài đã thắng.', line: 'Chiến công thuộc về ngài.' }
      : { reputation: -14, standing: 'Chính ngài là chủ soái, và ngài đã thua.', line: 'Không có ai để đổ lỗi.' };
  }

  const obeyed = battle.command.obeyed !== false;
  if (!obeyed && won) {
    return {
      reputation: 18,
      standing: `${order.fromName} ghi hận: ngài thắng bằng cách cãi lệnh.`,
      line: 'Uy tín ngài tăng mạnh, và chủ soái sẽ không quên chuyện này.',
    };
  }
  if (!obeyed && !won) {
    return {
      reputation: -22,
      standing: `${order.fromName} sẽ khép tội ngài — có thể mất đất, mất tước.`,
      line: `Ngài bỏ vị trí ở vòng ${String(battle.command.disobeyedAtRound)}, và trận thua.`,
    };
  }
  if (obeyed && won) {
    return {
      reputation: 8,
      standing: `${order.fromName} hài lòng.`,
      line: 'Ngài giữ đúng vị trí, và cánh của ngài đứng vững.',
    };
  }
  return {
    reputation: 0,
    standing: `${order.fromName} không trách ngài.`,
    line: 'Tuân lệnh và thua: không bị trách, nhưng cũng không có công.',
  };
}

// ---------------------------------------------------------------------------
// Ra lệnh cho tướng dưới quyền (mục 3, nhánh toàn quân)
// ---------------------------------------------------------------------------

const ORDER_DIFFICULTY: Readonly<Record<OrderId, DifficultyBand>> = {
  giu: 'de-dang',
  ban: 'de-dang',
  tien: 'thuong',
  'tan-cong': 'thuong',
  // Vòng đánh sườn là mệnh lệnh khó nhất của thế kỷ 14: đội quân đi vòng biến mất
  // khỏi tầm mắt chủ soái đúng lúc trận đánh đang quyết định.
  'vong-suon': 'kho',
  // Rút lui trước mặt địch — chỗ nhiều đạo quân tan không phải vì bị đánh.
  rut: 'kho',
};

function effectFor(tier: CheckTier): OrderEffect {
  switch (tier) {
    case 'critSuccess':
    case 'success':
      return 'thi-hanh';
    case 'costlySuccess':
      return 'cham-tre';
    case 'fail':
      return 'khong-nhuc-nhich';
    case 'critFail':
      return 'lam-nguoc';
  }
}

/** Tướng làm gì khi "làm ngược" — mục 3 kể ba khả năng, engine chọn theo TÍNH KHÍ. */
function contraryOrder(officer: Officer, order: OrderId): { order: OrderId; note: string } {
  switch (officer.temperament) {
    case 'lieu-linh':
      return { order: 'tan-cong', note: 'tự ý xông lên' };
    case 'hao-danh':
      return { order: 'vong-suon', note: 'tự ý đi tìm công lớn' };
    case 'than-trong':
      return { order: 'giu', note: 'nấn ná tại chỗ, không dám' };
    case 'bat-man':
      return { order: order === 'rut' ? 'giu' : 'rut', note: 'lui quân, mặc kệ lệnh' };
  }
}

export interface OrderOutcome {
  issued: IssuedOrder;
  check: CheckResult;
  /** Mệnh lệnh THẬT SỰ được thi hành, sau khi ma sát đã ăn vào. */
  actual: OrderId;
  /** Chậm một vòng: lệnh này chỉ có hiệu lực từ vòng sau. */
  delayed: boolean;
}

/**
 * Một mệnh lệnh đi từ người chơi tới một tướng dưới quyền.
 *
 * `base` gộp hai vế của mục 3 (PRE của người ra lệnh + lòng trung của người
 * nhận); TÍNH KHÍ và TẦM LỆNH đi qua registry thành hai dòng đọc được, vì đó là
 * hai thứ người chơi có thể thay đổi — chọn tướng khác, hoặc đứng gần hơn.
 */
export function issueOrder(
  battle: BattleState,
  rng: Rng,
  commander: Officer,
  officer: Officer,
  order: OrderId,
): OrderOutcome {
  const config = battleConfig().command;
  const commanderUnit = battle.units.find((unit) => unit.commanderId === commander.id && onField(unit)) ?? null;
  const officerUnit = battle.units.find((unit) => unit.commanderId === officer.id && onField(unit)) ?? null;

  const gapCells =
    commanderUnit === null || officerUnit === null ? 0 : distance(commanderUnit.pos, officerUnit.pos);
  const distanceMeters = metersFor(gapCells, battle.grid.cellMeters);
  const rangeMeters = config.rangeMeters * commandFactor(battle, commander);

  publishCommand({ officer, battle, distanceMeters, rangeMeters });
  let run;
  try {
    run = runCheck(rng, {
      id: 'battle.lenh',
      system: '3d6',
      domain: ORDER_DOMAIN,
      difficulty: ORDER_DIFFICULTY[order],
      base: Math.round(commander.pre / config.preDivisor) + Math.round(officer.loyalty / config.loyaltyDivisor),
      actor: officer.id,
      tags: [],
      state: battle.state,
    });
  } finally {
    publishCommand(null);
  }

  const effect = effectFor(run.result.tier);
  let actual = order;
  let note = '';

  if (effect === 'khong-nhuc-nhich') {
    actual = 'giu';
    note = 'không nhúc nhích';
  } else if (effect === 'lam-nguoc') {
    const contrary = contraryOrder(officer, order);
    actual = contrary.order;
    note = contrary.note;
  } else if (effect === 'cham-tre') {
    note = 'nhận lệnh muộn một vòng';
  }

  const issued: IssuedOrder = {
    round: battle.round,
    officerId: officer.id,
    officerName: officer.name,
    order,
    result: run.result.tier,
    effect,
    note: note === '' ? ORDER_EFFECT_LABELS[effect] : note,
  };

  return { issued, check: run.result, actual, delayed: effect === 'cham-tre' };
}

/** Nhãn tiếng Việt của một mệnh lệnh, cho UI và cho biên niên. */
export function orderLabel(order: OrderId): string {
  return ORDER_LABELS[order];
}

/** Đơn vị của một tướng còn cầm được không. Tướng chết thì cả cánh mất đầu. */
export function officerUnits(battle: BattleState, officer: Officer): BattleUnit[] {
  return battle.units.filter(
    (unit) => unit.side === officer.side && unit.wing === officer.wing && onField(unit) && controllable(unit),
  );
}
