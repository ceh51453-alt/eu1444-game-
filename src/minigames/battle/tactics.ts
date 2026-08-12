/**
 * NƯỚC ĐI CỦA ENGINE — cho mọi đơn vị người chơi không cầm (mục 3).
 *
 * Mục 3 nói rõ phần quân còn lại "do AI engine điều khiển theo kế hoạch của chủ
 * soái". `AI engine` ở đây KHÔNG phải LLM: mọi con số của trận đánh do engine
 * quyết (R1), và một trận bốn mươi vòng mà mỗi đơn vị mỗi vòng hỏi LLM một câu là
 * một hóa đơn không ai lường trước. Đây là một bộ luật ưu tiên, đọc được, và
 * bài test ba kịch bản của mục 15.12 đo đúng nó.
 *
 * BỘ LUẬT ĐƯỢC XẾP THEO ĐÚNG THỨ TỰ MỘT VIÊN ĐỘI THẾ KỶ 14 SUY NGHĨ:
 *   1. đang chạm mặt địch thì đánh, không nghĩ gì thêm
 *   2. thấy kỵ binh đang lao tới mà mình có giáo dài thì HẠ GIÁO — vế người của
 *      luật khắc chế ở mục 7; nếu bộ chọn không bao giờ đổi sang vòng giáo thì
 *      luật ấy có trong data mà không bao giờ chạy
 *   3. bắn được thì bắn, và bắn vào khối sâu trước
 *   4. còn lại thì tiến về phía địch gần nhất
 */

import type { Rng } from '@/core/rng';
import { battleConfig, formationOf, timeOfDayOf, unitTypeOf, weatherOf } from './data';
import { canShoot } from './clash';
import { cellsFor, distance, terrainAt, type Cell } from './grid';
import { nearestEnemy } from './initiative';
import { controllable, onField, otherSide, unitsOf, type BattleState, type BattleUnit, type OrderId } from './types';

export type UnitActionKind = 'giu' | 'cho' | 'tien' | 'tan-cong' | 'ban' | 'doi-doi-hinh' | 'rut';

export const ACTION_LABELS: Readonly<Record<UnitActionKind, string>> = {
  giu: 'giữ vị trí',
  cho: 'giữ lệnh, chờ phản ứng',
  tien: 'tiến lên',
  'tan-cong': 'xông vào đánh',
  ban: 'bắn',
  'doi-doi-hinh': 'đổi đội hình',
  rut: 'lùi lại',
};

export interface UnitAction {
  kind: UnitActionKind;
  targetId?: string;
  formation?: string;
  toward?: Cell;
}

// ---------------------------------------------------------------------------
// Ngân sách di chuyển
// ---------------------------------------------------------------------------

/**
 * Bao nhiêu điểm di chuyển một vòng, ở đúng cỡ ô của trận này.
 *
 * `atLeastOne` bật lên có chủ ý: ở trận vạn người, một ô rộng hơn trăm mét, và
 * một khối bộ binh đi sáu mươi mét mỗi vòng sẽ đứng yên vĩnh viễn nếu làm tròn
 * xuống. Ở quy mô ấy, "một vòng đi được một ô" là cách đọc đúng của bàn cờ, chứ
 * không phải một sự nới tay.
 */
export function movePoints(battle: BattleState, unit: BattleUnit): number {
  const type = unitTypeOf(unit.typeId);
  const formation = formationOf(unit.formation);
  if (formation?.immobile === true) return 0;

  const weather = weatherOf(battle.weatherId);
  const base = cellsFor(type?.speedMeters ?? 60, battle.grid.cellMeters, true);
  const terrainBonus = terrainAt(battle.grid, unit.pos).moveBonus;
  const points = base + (formation?.moveBonus ?? 0) + terrainBonus - (weather?.moveExtra ?? 0);

  // Đơn vị đang nao núng lùi dần chứ không tiến (mục 8), nhưng vẫn phải nhúc
  // nhích được — nếu không thì "lùi dần" thành "đứng yên chịu chết".
  return Math.max(unit.state === 'nao-nung' ? 1 : 0, Math.round(points));
}

/** Đơn vị này có xung phong được không: kỵ binh, còn hàng lối, và đủ đường chạy. */
export function canCharge(battle: BattleState, unit: BattleUnit, target: BattleUnit): boolean {
  if (!unit.tags.includes('ky-binh')) return false;
  if (unit.cohesion < 45) return false;
  const gap = distance(unit.pos, target.pos);
  return gap > 1 && gap <= movePoints(battle, unit);
}

// ---------------------------------------------------------------------------
// Chọn nước
// ---------------------------------------------------------------------------

/** Kẻ địch đáng bắn nhất: khối sâu trước, rồi tới đám đông nhất. */
export function bestShootTarget(battle: BattleState, unit: BattleUnit): BattleUnit | null {
  let best: BattleUnit | null = null;
  let bestScore = -Infinity;

  for (const foe of unitsOf(battle, otherSide(unit.side))) {
    if (!canShoot(battle, unit, foe)) continue;
    const formation = formationOf(foe.formation);
    // VẾ HAI CỦA MỤC 7 thành hành vi, không chỉ thành con số: cung thủ CHỌN bắn
    // vào khối sâu. Một bộ chọn bắn bừa sẽ làm luật "cung khắc khối sâu" đúng
    // trên giấy mà không bao giờ xảy ra trên bàn cờ.
    const vulnerability = formation?.rangedVulnerability ?? 1;
    const score = vulnerability * 100 + foe.strength / 10 - distance(unit.pos, foe.pos);
    if (score > bestScore) {
      best = foe;
      bestScore = score;
    }
  }
  return best;
}

/**
 * Đơn vị địch đáng TIẾN TỚI nhất — không phải đơn vị gần nhất.
 *
 * "Gần nhất" là câu trả lời sai, và nó sai theo một cách rất tốn kém: cả một
 * cánh quân cùng nhắm vào đúng một quân cờ địch, rồi giẫm lên nhau ở ba ô quanh
 * nó. `stepToward` không cho hai đơn vị đứng chung một ô, nên chín đơn vị phía
 * sau đứng chôn chân trong lúc ba đơn vị phía trước đánh nhau — và ở kịch bản
 * "kỵ binh khắc cung thủ" thì đám kỵ binh đứng chôn chân ấy chết dần vì tên mà
 * không bao giờ tới được nơi. Vòng khắc chế ba vế của mục 7 gãy đúng ở đây.
 *
 * Nên mỗi đơn vị trừ điểm những mục tiêu đã có người bám: đi xa thêm vài ô để
 * đánh vào một chỗ trống còn hơn xếp hàng chờ trước một chỗ đã kín.
 */
export function bestApproachTarget(battle: BattleState, unit: BattleUnit): BattleUnit | null {
  const foes = unitsOf(battle, otherSide(unit.side));
  let best: BattleUnit | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const foe of foes) {
    const engaged = unitsOf(battle, unit.side).filter(
      (friend) => friend.id !== unit.id && distance(friend.pos, foe.pos) <= 1,
    ).length;
    const frontage = formationOf(foe.formation)?.frontage ?? 1;
    const score = distance(unit.pos, foe.pos) + Math.max(0, engaged - frontage + 1) * 4;
    if (score < bestScore) {
      best = foe;
      bestScore = score;
    }
  }
  return best;
}

/** Kỵ binh địch đang lao tới trong tầm một vòng — điều kiện hạ giáo. */
export function cavalryClosing(battle: BattleState, unit: BattleUnit): BattleUnit | null {
  for (const foe of unitsOf(battle, otherSide(unit.side))) {
    if (!foe.tags.includes('ky-binh') || !controllable(foe)) continue;
    const gap = distance(unit.pos, foe.pos);
    if (gap <= Math.max(2, movePoints(battle, foe))) return foe;
  }
  return null;
}

/** Đội hình chống kỵ tốt nhất mà đơn vị này xếp được. */
export function antiCavalryFormation(unit: BattleUnit): string | null {
  const type = unitTypeOf(unit.typeId);
  if (type === null) return null;
  let best: string | null = null;
  let bestValue = 0;
  for (const id of type.formations) {
    const formation = formationOf(id);
    if (formation === null || formation.vsCavalry <= bestValue) continue;
    best = id;
    bestValue = formation.vsCavalry;
  }
  return best;
}

/** Đội hình đánh nhau tốt nhất — để rời vòng giáo khi kỵ binh đã hết. */
function assaultFormation(unit: BattleUnit): string | null {
  const type = unitTypeOf(unit.typeId);
  if (type === null) return null;
  let best: string | null = null;
  let bestValue = -Infinity;
  for (const id of type.formations) {
    const formation = formationOf(id);
    if (formation === null || formation.immobile) continue;
    const value = formation.attack + formation.push;
    if (value > bestValue) {
      best = id;
      bestValue = value;
    }
  }
  return best;
}

export interface TacticContext {
  /** Mệnh lệnh đang treo trên đầu đơn vị này, nếu có (mục 3). */
  order?: OrderId;
}

/**
 * Nước đi của engine cho một đơn vị.
 *
 * `rng` có mặt để phá thế bí một cách TÁI LẬP ĐƯỢC, không phải để làm bộ chọn
 * ngẫu nhiên: hai đơn vị cùng cách địch một quãng như nhau vẫn phải chọn khác
 * nhau một chút, nếu không cả một cánh quân sẽ đi thành một khối chữ nhật hoàn
 * hảo và trận đánh trông như một trò xếp hình.
 */
export function chooseUnitAction(
  battle: BattleState,
  rng: Rng,
  unit: BattleUnit,
  context: TacticContext = {},
): UnitAction {
  const order = context.order ?? 'tan-cong';
  const foe = nearestEnemy(battle, unit);
  if (foe === null) return { kind: 'giu' };

  const gap = distance(unit.pos, foe.pos);

  // 1. Chạm mặt thì đánh. Không có nhánh nào đứng trước nhánh này.
  if (gap <= 1 && order !== 'rut') {
    const adjacent = unitsOf(battle, otherSide(unit.side)).filter((enemy) => distance(unit.pos, enemy.pos) <= 1);
    // Đánh vào đơn vị YẾU NHẤT trong tầm với: một đơn vị sắp vỡ mà vỡ thật thì
    // kéo theo cả cánh (mục 8), và đó là món hời lớn nhất của cả trận đánh.
    const target = adjacent.reduce((best, enemy) => (enemy.morale < best.morale ? enemy : best), adjacent[0] ?? foe);
    return { kind: 'tan-cong', targetId: target.id };
  }

  // 2. HẠ GIÁO. Vế người của luật khắc chế mục 7.
  if (order !== 'rut') {
    const charger = cavalryClosing(battle, unit);
    const anti = antiCavalryFormation(unit);
    if (charger !== null && anti !== null && unit.formation !== anti) {
      return { kind: 'doi-doi-hinh', formation: anti };
    }
    // Kỵ binh đã hết mà mình vẫn đứng trong vòng giáo thì cả đơn vị vô dụng.
    if (charger === null && formationOf(unit.formation)?.immobile === true) {
      const assault = assaultFormation(unit);
      if (assault !== null) return { kind: 'doi-doi-hinh', formation: assault };
    }
  }

  // 3. Bắn được thì bắn.
  if (order !== 'rut' && unit.ammo > 0) {
    const target = bestShootTarget(battle, unit);
    if (target !== null) return { kind: 'ban', targetId: target.id };
  }

  if (order === 'rut') {
    const home = unit.side === 'a' ? 0 : battle.grid.height - 1;
    return { kind: 'rut', toward: { x: unit.pos.x, y: home } };
  }
  if (order === 'giu') {
    // Giữ lệnh CHỜ thay vì đứng ngây ra: mục 4.3 cho phép bỏ lượt để phản ứng
    // sau, và một hàng giáo chờ kỵ binh lao vào là ví dụ nguyên văn của mục ấy.
    return { kind: 'cho' };
  }

  // Lệnh "bắn" mà KHÔNG có mục tiêu trong tầm thì rơi xuống nhánh tiến ở dưới —
  // bước vào tầm rồi mới bắn. Đứng yên ở đây là một thế bí thật sự: hai đạo quân
  // toàn cung thủ đứng cách nhau tám trăm mét cùng chờ bên kia bước tới, và trận
  // đánh chạy hết trần bốn mươi vòng mà không ai bắn một mũi tên nào.



  // 4. Tiến. Vòng sườn thì nhắm mép đội hình địch thay vì nhắm chính diện.
  if (order === 'vong-suon') {
    const flank = unitsOf(battle, otherSide(unit.side)).reduce(
      (best, enemy) => (enemy.pos.x < best.pos.x ? enemy : best),
      foe,
    );
    const side = rng.int(0, 1) === 0 ? -2 : 2;
    return { kind: 'tien', targetId: flank.id, toward: { x: clampToGrid(flank.pos.x + side, battle), y: flank.pos.y } };
  }
  const target = bestApproachTarget(battle, unit) ?? foe;
  return { kind: 'tien', targetId: target.id, toward: target.pos };
}

function clampToGrid(x: number, battle: BattleState): number {
  return Math.max(0, Math.min(battle.grid.width - 1, x));
}

/** Nước đi của một đơn vị ĐÃ VỠ TRẬN: chạy về mép, không nhận lệnh (mục 8). */
export function routMove(battle: BattleState, unit: BattleUnit): UnitAction {
  const home = unit.side === 'a' ? 0 : battle.grid.height - 1;
  return { kind: 'rut', toward: { x: unit.pos.x, y: home } };
}

/** Mệt thêm sau một vòng, đã gộp địa hình và thời tiết. */
export function fatigueTick(battle: BattleState, unit: BattleUnit, acted: boolean): number {
  const weather = weatherOf(battle.weatherId);
  const terrain = terrainAt(battle.grid, unit.pos);
  const heavy = unit.tags.includes('giap-nang');

  let delta = acted ? battleConfig().casualties.fatiguePerExchange * 0.5 : -4;
  delta += terrain.staminaExtra;
  delta += weather?.fatigueExtra ?? 0;
  if (heavy) delta += weather?.heavyFatigueExtra ?? 0;
  return delta;
}

/** Đội ngũ hồi lại khi đứng yên trong một đội hình giữ được hàng. */
export function cohesionTick(battle: BattleState, unit: BattleUnit, acted: boolean): number {
  const formation = formationOf(unit.formation);
  const terrain = terrainAt(battle.grid, unit.pos);
  const time = timeOfDayOf(battle.timeId);
  const night = time?.night === true && !unit.tags.includes('nhin-dem') ? (time.cohesionDrain ?? 0) : 0;
  const keep = acted ? 0 : (formation?.cohesionKeep ?? 0);
  return keep - terrain.cohesionDrain - night;
}

/** Đơn vị còn đánh được không — dùng ở điều kiện kết thúc trận. */
export function stillFighting(unit: BattleUnit): boolean {
  return onField(unit) && controllable(unit);
}
