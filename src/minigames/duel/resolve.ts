/**
 * VÒNG MỘT HIỆP (Phần 9 mục 3) — sáu bước, đúng thứ tự, không có đường tắt.
 *
 *   B1  Hai bên chọn hành động ĐỒNG THỜI, giấu nhau   → người gọi đưa vào `choices`
 *   B2  Lộ đồng thời                                   → `resolveChoice`
 *   B3  Áp ma trận tương khắc → modifier khởi điểm     → `matchup` + `publishExchange`
 *   B4  Phân giải bằng d20 đối kháng (Phần 5)          → `contestedCheck`
 *   B5  Áp kết quả                                     → `landHit`, thế trận, thể lực
 *   B6  Ghi vào biên niên                              → `ChronicleRound`
 *
 * DI CHUYỂN XẢY RA TRƯỚC CÚ TUNG, và đó là một quyết định thiết kế chứ không
 * phải thứ tự tiện tay. Nó là thứ làm cho mục 2 có nghĩa: một bước lùi đúng lúc
 * kéo người ta ra khỏi tầm cây kiếm, và đòn chém hôm ấy đi vào không khí. Nếu
 * tung trước rồi mới bước thì cự ly chỉ còn là một con số trang trí.
 *
 * KHÔNG CÓ THANH MÁU TRẬN ĐẤU (mục 8). Mỗi đòn trúng đi thẳng qua Phần 7: tra
 * bảng vị trí, sinh `Injury` thật, và vết ấy còn nguyên sau khi trận kết thúc.
 * Đó là lý do file này không có một biến `hp` nào cả.
 */

import type { Rng } from '@/core/rng';
import type { CheckTier } from '@/core/turn';
import { applyPatch } from '@/state/mvu';
import type { PatchOp } from '@/state/mvu-parse';
import { CONTEST_LADDER, contestedCheck } from '@/systems/check/contest';
import type { CheckSpec } from '@/systems/check/run';
import { isSuccess } from '@/systems/check/tiers';
import { skillContribution } from '@/systems/character/stats';
import { buildInjury, injuryId, rollHitLocation, rollInjuryType, severityFromTier } from '@/systems/body/inflict';
import { injuryTypeName, severityName } from '@/systems/body/catalog';
import { regionName, regionOf } from '@/systems/body/regions';
import { consciousnessOf, gripOf } from '@/systems/body/vitals';
import type { Injury } from '@/systems/body/slice';
import type { ChronicleAction, ChronicleInjury, ChronicleRound, Highlight } from '@/systems/combat/chronicle';
import {
  fallbackAction,
  resolveAction,
  resolveNodeAction,
  availability,
  type ResolvedAction,
  type ResolveOptions,
} from './actions';
import { arcOf, distance, stepFrom, terrainAt, turn as turnDir, type Dir8 } from './arena';
import { armorTags, hitOptionsFor, postHitArmor, preHitArmor } from './armor';
import { kindOf, reachConfig, speedRow, staminaConfig, tempoConfig, woundConfig } from './data';
import { matchup, type MatchupSide } from './matrix';
import { publishExchange, type Exchange, type ExchangeView } from './modifiers';
import {
  fighterOf,
  otherSide,
  type ChosenAction,
  type DuelCheck,
  type DuelState,
  type Fighter,
  type RoundLogLine,
  type SideId,
} from './types';

// ---------------------------------------------------------------------------
// Sao chép — mọi hiệp trả về một DuelState MỚI
// ---------------------------------------------------------------------------

function cloneFighter(fighter: Fighter): Fighter {
  return {
    ...fighter,
    pos: { ...fighter.pos },
    nodes: [...fighter.nodes],
    tags: [...fighter.tags],
    skills: { ...fighter.skills },
    stats: { ...fighter.stats },
    body: { ...fighter.body, injuries: fighter.body.injuries.map((injury) => ({ ...injury })), log: [...fighter.body.log] },
  };
}

export function cloneDuel(duel: DuelState): DuelState {
  return {
    ...duel,
    a: cloneFighter(duel.a),
    b: cloneFighter(duel.b),
    rounds: [...duel.rounds],
    checks: [...duel.checks],
    log: [...duel.log],
    playerOps: [...duel.playerOps],
    arena: { ...duel.arena, cells: [...duel.arena.cells] },
  };
}

// ---------------------------------------------------------------------------
// B2 — lộ hành động
// ---------------------------------------------------------------------------

export function resolveOptionsOf(duel: DuelState): ResolveOptions {
  return { blunted: kindOf(duel.kindId)?.blunted ?? false };
}

/**
 * Đổi một lựa chọn thành hành động dùng được.
 *
 * Lựa chọn không hợp lệ — id lạ, node chưa mở, nút đang tắt — rơi về `xoay-mat`
 * chứ KHÔNG ném lỗi. Một trận đấu không được chết vì UI gửi lên một id cũ (R4),
 * và "ngài đứng yên xoay người" là một kết quả đọc được, khác hẳn với một màn
 * hình trắng.
 */
export function resolveChoice(
  duel: DuelState,
  side: SideId,
  chosen: ChosenAction,
  options: ResolveOptions,
): { action: ResolvedAction; refused: string } {
  const self = fighterOf(duel, side);
  const foe = fighterOf(duel, otherSide(side));
  const gap = distance(self.pos, foe.pos);

  const nodeId = chosen.nodeId ?? '';
  const resolved =
    nodeId === '' ? resolveAction(self, chosen.actionId, options) : resolveNodeAction(self, nodeId, options);

  if (resolved === null) {
    return { action: fallbackAction(self, options), refused: `hành động "${chosen.actionId}" không dùng được` };
  }
  if (nodeId !== '' && !self.nodes.includes(nodeId)) {
    return { action: fallbackAction(self, options), refused: `chưa mở node "${nodeId}"` };
  }

  const blocked = availability(self, foe, gap, resolved);
  if (blocked !== null) {
    return { action: fallbackAction(self, options), refused: `${resolved.name}: ${blocked}` };
  }
  return { action: resolved, refused: '' };
}

// ---------------------------------------------------------------------------
// Di chuyển
// ---------------------------------------------------------------------------

interface MoveNote {
  text: string;
  left: boolean;
}

function applyMovement(
  duel: DuelState,
  actions: Record<SideId, ResolvedAction>,
  choices: Record<SideId, ChosenAction>,
): Record<SideId, MoveNote> {
  const notes: Record<SideId, MoveNote> = { a: { text: '', left: false }, b: { text: '', left: false } };
  const before = { a: { ...duel.a.pos }, b: { ...duel.b.pos } };
  const targets: Record<SideId, { x: number; y: number }> = { a: before.a, b: before.b };

  for (const side of ['a', 'b'] as const) {
    const fighter = fighterOf(duel, side);
    const move = actions[side].base.move;
    if (move === undefined) continue;

    if (move.turn === 'free') {
      const facing = choices[side].facing;
      if (facing !== undefined) fighter.facing = facing;
      notes[side] = { text: 'xoay người', left: false };
      continue;
    }
    if (move.forward === 0 && move.strafe === 0) continue;

    const outcome = stepFrom(duel.arena, before[side], fighter.facing, move);
    targets[side] = outcome.cell;
    if (outcome.blocked) notes[side] = { text: 'bị chắn, không đi được', left: false };
    else if (outcome.left) notes[side] = { text: 'bước ra khỏi vòng', left: true };
    else if (outcome.slowed) notes[side] = { text: 'lún chân, chỉ đi được một ô', left: false };
  }

  // HAI NGƯỜI KHÔNG ĐỨNG CHUNG MỘT Ô, và ai giành được chỗ ấy là một câu hỏi
  // phải có câu trả lời.
  //
  // Cho cả hai khựng lại thì hai người cách nhau hai ô cùng bước tới sẽ mãi mãi
  // cách nhau hai ô: cả trận đấu treo ở đúng cự ly đó và không ai chạm được vào
  // ai. Nên bên có đòn NHANH HƠN chiếm được chỗ; hòa thì bên đang giữ nhịp;
  // hòa nữa thì bên `a` — tất định từ đầu tới cuối (R3).
  if (targets.a.x === targets.b.x && targets.a.y === targets.b.y) {
    const winner = pickInitiative(duel, ['a', 'b'], actions);
    const loser = otherSide(winner);
    targets[loser] = before[loser];
    notes[loser] = { text: 'bị chắn đường, phải đứng lại', left: false };
  }

  duel.a.pos = targets.a;
  duel.b.pos = targets.b;
  if (notes.a.left) duel.a.leftArena = true;
  if (notes.b.left) duel.b.leftArena = true;

  for (const side of ['a', 'b'] as const) {
    const move = actions[side].base.move;
    if (move?.faceEnemy !== true) continue;
    const self = fighterOf(duel, side);
    const foe = fighterOf(duel, otherSide(side));
    self.facing = faceToward(self.pos, foe.pos, self.facing);
  }

  return notes;
}

function faceToward(from: { x: number; y: number }, to: { x: number; y: number }, current: Dir8): Dir8 {
  if (from.x === to.x && from.y === to.y) return current;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const angle = Math.atan2(dx, -dy);
  return (((Math.round(angle / (Math.PI / 4)) + 8) % 8) as Dir8);
}

// ---------------------------------------------------------------------------
// B3 — ảnh chụp sàn đấu cho registry
// ---------------------------------------------------------------------------

function reachLine(action: ResolvedAction, gap: number): { mod: number; note: string; miss: boolean } {
  const config = reachConfig();
  if (!action.attack) return { mod: 0, note: '', miss: false };
  if (gap > action.reach.max + config.missBeyond) return { mod: 0, note: '', miss: true };
  if (gap > action.reach.max) return { mod: config.tooFar, note: 'Với không tới', miss: false };
  if (gap < action.reach.min) return { mod: config.tooClose, note: 'Quá gần, vũ khí không xoay được', miss: false };
  return { mod: 0, note: '', miss: false };
}

function buildView(
  duel: DuelState,
  side: SideId,
  action: ResolvedAction,
  side_matchup: MatchupSide,
): ExchangeView {
  const self = fighterOf(duel, side);
  const foe = fighterOf(duel, otherSide(side));
  const gap = distance(self.pos, foe.pos);

  const reach = reachLine(action, gap);
  const ground = terrainAt(duel.arena, self.pos);
  const foeGround = terrainAt(duel.arena, foe.pos);
  const armor = preHitArmor(action, foe.loadout);

  // Bị hất cát thì mọi hướng đều là sườn: người mù không có chính diện.
  const blinded = self.blindUntil >= duel.round;
  const arc = blinded ? 'flank' : arcOf(foe.pos, foe.facing, self.pos);

  return {
    fighter: self,
    matchup: side_matchup,
    arc,
    gap,
    reachMod: reach.mod,
    reachNote: reach.note,
    groundMod: action.attack ? ground.attack : ground.defence,
    groundName: ground.name,
    elevation: ground.elevation - foeGround.elevation,
    armorMod: armor.mod,
    armorNote: armor.note,
    attacking: action.attack,
  };
}

// ---------------------------------------------------------------------------
// B4 — phép kiểm
// ---------------------------------------------------------------------------

/** Miền phòng thủ khi đấu sĩ không chọn một đòn thủ nào — vẫn phải né lấy một cái. */
const PASSIVE_DEFENCE = { domain: 'combat.ne-tranh', difficulty: 'thuong' } as const;

function tagsFor(duel: DuelState, side: SideId, action: ResolvedAction): string[] {
  const self = fighterOf(duel, side);
  const foe = fighterOf(duel, otherSide(side));
  const tags = new Set<string>([...self.tags, ...action.tags]);

  for (const tag of armorTags(foe.loadout)) tags.add(tag);
  if (distance(self.pos, foe.pos) <= reachConfig().grappleAt) tags.add('giap-la-ca');
  if (duel.round === 1) tags.add('lan-dau-gap');
  return [...tags];
}

function specFor(duel: DuelState, side: SideId, action: ResolvedAction, defending: boolean): CheckSpec {
  const self = fighterOf(duel, side);
  const usePassive = defending && !action.defence;
  const skillId = usePassive ? '' : action.skillId;
  const level = skillId === '' ? 0 : (self.skills[skillId] ?? 0);

  return {
    id: `duel.${action.actionId}`,
    system: 'd20',
    domain: usePassive ? PASSIVE_DEFENCE.domain : action.domain,
    difficulty: usePassive ? PASSIVE_DEFENCE.difficulty : action.base.difficulty,
    base: skillContribution('d20', level),
    actor: self.id,
    tags: usePassive ? [...tagsFor(duel, side, action), 'phong-thu'] : tagsFor(duel, side, action),
    state: duel.state,
  };
}

// ---------------------------------------------------------------------------
// B5 — áp kết quả
// ---------------------------------------------------------------------------

interface HitOutcome {
  injury: Injury | null;
  note: string;
  throughGap: boolean;
  /**
   * Đòn tới nơi nhưng giáp nuốt trọn — không có vết thương nào.
   *
   * Đây là vế "gần như vô hiệu" của mục 7 viết ra thành cơ học. Nó KHÔNG phải
   * "trượt": người mặc giáp vẫn ăn nguyên cú va, và cái giá là thể lực. Nhờ vế
   * ấy mà một thanh kiếm trước giáp tấm vẫn còn đúng một đường — đánh cho người
   * ta kiệt sức trong bộ giáp của chính họ — mà không phải là một đường dễ.
   */
  absorbed: boolean;
}

/**
 * Một đòn trúng: tra vị trí, đi qua giáp, sinh `Injury` thật của Phần 7.
 *
 * MỨC ĐỘ SUY TỪ CẤP CỦA BÊN THUA, không phải bên thắng. Đó là hợp đồng của Phần
 * 7 mục 4 (`tierSeverity`): một người đỡ hỏng nặng thì ăn đòn nặng. Bên thắng
 * chỉ dịch mức độ ấy đi một nấc khi thắng chật vật — một đòn phải trả giá mới
 * vào được thì không vào sâu.
 */
function landHit(
  duel: DuelState,
  rng: Rng,
  attackerSide: SideId,
  action: ResolvedAction,
  attackerTier: CheckTier,
  victimTier: CheckTier,
  incomingSeverity: number,
): HitOutcome {
  const victim = fighterOf(duel, otherSide(attackerSide));
  const attacker = fighterOf(duel, attackerSide);
  const kind = kindOf(duel.kindId);

  const region = rollHitLocation(rng, hitOptionsFor(action, victim.loadout));
  // Phần 16 mục 4: bản đồ che phủ phán quyết, không phải một bảng loại-đòn ×
  // loại-giáp. Cần cả trang bị của BÊN ĐÁNH, vì sức xuyên đến từ vật liệu, tay
  // nghề và tình trạng của chính món trong tay họ.
  const armor = postHitArmor(rng, action, victim.loadout, attacker.loadout, region.id, {
    blunted: kind?.blunted ?? false,
  });
  const cause = action.cause;
  const type = armor.forceType ?? rollInjuryType(rng, cause);

  let severity = severityFromTier(rng, victimTier);
  severity += action.severityBonus + incomingSeverity;
  if (attackerTier === 'costlySuccess') severity -= 1;
  severity = Math.min(severity, armor.severityCap, kind?.severityCap ?? 5);
  if (severity < 1) {
    victim.stamina = Math.max(0, victim.stamina - woundConfig().absorbedStamina);
    return {
      injury: null,
      note: armor.note === '' ? 'đòn dội lại trên giáp' : armor.note,
      throughGap: armor.throughGap,
      absorbed: true,
    };
  }

  const injury = buildInjury(
    rng,
    {
      regionId: region.id,
      type,
      severity,
      source: `${action.name} — ${attacker.name}`,
      turn: duel.turn,
      silver: armor.silver,
    },
    injuryId(victim.body),
  );

  addInjury(duel, victim, injury);
  return { injury, note: armor.note, throughGap: armor.throughGap, absorbed: false };
}

/**
 * Nhét một vết vào cơ thể của đấu sĩ, và — nếu đó là người chơi — nhét luôn ba
 * op tương ứng vào MVU.
 *
 * Ba op giống hệt `inflictInjury` của Phần 7 sinh ra, và cố ý giống: đường vào
 * state của một vết thương chỉ có MỘT hình dạng, dù nó đến từ vòng lượt hay từ
 * một trận quyết đấu.
 */
function addInjury(duel: DuelState, victim: Fighter, injury: Injury): void {
  victim.body = {
    ...victim.body,
    injuries: [...victim.body.injuries, injury],
    nextInjuryNo: victim.body.nextInjuryNo + 1,
  };
  if (victim.id !== '') return;

  const line = `${regionName(injury.regionId)}: ${injuryTypeName(injury.type).toLowerCase()} ${severityName(
    injury.severity,
  ).toLowerCase()} (${injury.source})`;
  const ops: PatchOp[] = [
    { op: 'push', path: 'body.injuries', to: injury, reason: 'thương tích trong quyết đấu', source: 'json' },
    {
      op: 'set',
      path: 'body.nextInjuryNo',
      from: victim.body.nextInjuryNo - 1,
      to: victim.body.nextInjuryNo,
      reason: 'cấp id cho thương tích mới',
      source: 'json',
    },
    {
      op: 'push',
      path: 'body.log',
      to: { turn: duel.turn, kind: 'thuong-tich', text: line, regionId: injury.regionId },
      reason: 'ghi dòng thời gian thương tích',
      source: 'json',
    },
  ];

  duel.playerOps.push(...ops);
  if (duel.state === null) return;
  const applied = applyPatch(duel.state, ops, { actor: 'engine' });
  if (applied.applied && applied.next !== null) duel.state = applied.next;
}

/** Máu chảy trong hiệp — một phần rất nhỏ của mức chảy máu một LƯỢT (mục 8). */
function bleedRound(fighter: Fighter): number {
  const rate = woundConfig().bleedPerRound;
  let lost = 0;
  for (const injury of fighter.body.injuries) {
    if (injury.healProgress >= 100) continue;
    lost += injury.bleeding * rate;
  }
  if (lost <= 0) return 0;
  fighter.body = { ...fighter.body, blood: Math.max(0, fighter.body.blood - lost) };
  return lost;
}

// ---------------------------------------------------------------------------
// Thể lực và thế trận (mục 6)
// ---------------------------------------------------------------------------

export function staminaMaxFor(vit: number): number {
  const config = staminaConfig();
  return Math.round(config.max * (1 + ((vit - config.vitReference) * config.vitPerPoint) / 100));
}

function settleStamina(duel: DuelState, side: SideId, action: ResolvedAction, extra: number): void {
  const fighter = fighterOf(duel, side);
  const config = staminaConfig();
  const ground = terrainAt(duel.arena, fighter.pos);

  const recovery = action.defence
    ? config.recover.defending
    : action.attack
      ? config.recover.base
      : config.recover.resting;

  let drain = action.staminaCost + extra + ground.staminaExtra + fighter.loadout.staminaPerRound;
  for (const injury of fighter.body.injuries) {
    if (injury.healProgress >= 100) continue;
    drain += injury.severity * config.injuryDrainPerSeverity;
  }

  fighter.stamina = Math.max(0, Math.min(fighter.staminaMax, fighter.stamina + recovery - drain));
}

function settleTempo(duel: DuelState, side: SideId, tier: CheckTier | null, bonus: number): void {
  const fighter = fighterOf(duel, side);
  const config = tempoConfig();

  if (tier === null) {
    // Không va chạm nào: thế trận bò về 0. Không ai giữ được nhịp bằng cách
    // đứng nhìn nhau, và một trận đấu bế tắc phải tự gỡ bế tắc.
    const drift = Math.sign(fighter.tempo) * -config.driftToZero;
    fighter.tempo = Math.abs(fighter.tempo) <= config.driftToZero ? 0 : fighter.tempo + drift;
    return;
  }

  const gain = config.gain[tier] + bonus;
  fighter.tempo = Math.max(config.min, Math.min(config.max, fighter.tempo + gain));
}

// ---------------------------------------------------------------------------
// Vòng một hiệp
// ---------------------------------------------------------------------------

export interface RoundResult {
  duel: DuelState;
  round: ChronicleRound;
  lines: RoundLogLine[];
  /** Cú tung của cả hai bên, để UI hiện bảng điều chỉnh của Phần 5. */
  checks: DuelCheck[];
}

export interface RoundChoices {
  a: ChosenAction;
  b: ChosenAction;
}

export function runRound(duel: DuelState, rng: Rng, choices: RoundChoices): RoundResult {
  const next = cloneDuel(duel);
  const options = resolveOptionsOf(next);
  const lines: RoundLogLine[] = [];
  const chronicleActions: ChronicleAction[] = [];
  const injuries: ChronicleInjury[] = [];
  const checks: DuelCheck[] = [];

  const say = (side: SideId | '', text: string): void => {
    lines.push({ round: next.round, side, text });
  };

  // --- B2: lộ đồng thời ----------------------------------------------------
  const actions: Record<SideId, ResolvedAction> = { a: fallbackAction(next.a, options), b: fallbackAction(next.b, options) };
  for (const side of ['a', 'b'] as const) {
    const fighter = fighterOf(next, side);

    // Đang nằm dưới đất thì cả hiệp này chỉ đủ để đứng dậy. Ngã là mất một hiệp,
    // và đó là lý do `knockdown` đáng giá.
    if (fighter.prone) {
      fighter.prone = false;
      fighter.stamina = Math.max(0, fighter.stamina - 6);
      say(side, `${fighter.name} chống tay đứng dậy.`);
      chronicleActions.push({ actorId: fighter.id, action: 'gượng đứng dậy', result: 'costlySuccess', margin: 0 });
      continue;
    }

    // HIỆP MỞ MÀN MIỄN PHÍ CỦA PHỤC KÍCH (mục 9). Bên bị phục kích không được
    // chọn gì ở hiệp đầu: họ chưa biết có ai đứng sau lưng. `createDuel` đã đặt
    // họ quay lưng lại, nên đòn đầu tiên rơi vào cung sau — đó là toàn bộ giá
    // trị của việc nằm chờ trong bụi.
    if (side === 'b' && next.round === 1 && (kindOf(next.kindId)?.freeOpeningRound ?? false)) {
      actions[side] = fallbackAction(fighter, options);
      say(side, `${fighter.name} chưa kịp quay lại.`);
      continue;
    }

    const resolved = resolveChoice(next, side, choices[side], options);
    actions[side] = resolved.action;
    if (resolved.refused !== '') say(side, `${fighter.name}: ${resolved.refused} — đành xoay người.`);

    if (resolved.action.base.yields && (kindOf(next.kindId)?.yieldAllowed ?? true)) {
      fighter.yielded = true;
      say(side, `${fighter.name} ném vũ khí xuống.`);
    }
    if (resolved.action.category === 'the' && resolved.action.nodeId !== '') {
      applyStance(next, side, resolved.action.nodeId);
      say(side, `${fighter.name} chuyển sang ${resolved.action.name}.`);
    }
  }

  // --- Di chuyển trước cú tung --------------------------------------------
  const moves = applyMovement(next, actions, choices);
  for (const side of ['a', 'b'] as const) {
    if (moves[side].text === '') continue;
    say(side, `${fighterOf(next, side).name} ${moves[side].text}.`);
  }

  const gap = distance(next.a.pos, next.b.pos);
  const pair = matchup(actions.a.tags, actions.b.tags);
  const views: Record<SideId, ExchangeView> = {
    a: buildView(next, 'a', actions.a, pair.a),
    b: buildView(next, 'b', actions.b, pair.b),
  };

  // --- B4: phân giải ------------------------------------------------------
  const attackers = (['a', 'b'] as const).filter((side) => actions[side].attack);
  const misses = (['a', 'b'] as const).filter((side) => reachLine(actions[side], gap).miss && actions[side].attack);

  for (const side of misses) {
    say(side, `${fighterOf(next, side).name} vung ${actions[side].name.toLowerCase()} vào khoảng không — quá xa.`);
    chronicleActions.push({
      actorId: fighterOf(next, side).id,
      action: actions[side].name,
      result: 'fail',
      margin: 0,
      note: 'quá xa, đòn không tới',
    });
  }

  const live = attackers.filter((side) => !misses.includes(side));

  if (live.length === 0) {
    for (const side of ['a', 'b'] as const) {
      if (!misses.includes(side)) {
        chronicleActions.push({
          actorId: fighterOf(next, side).id,
          action: actions[side].name,
          result: 'costlySuccess',
          margin: 0,
        });
      }
      settleTempo(next, side, misses.includes(side) ? 'fail' : null, 0);
      settleStamina(next, side, actions[side], pair[side].staminaExtra);
    }
  } else {
    // Ai đứng vai BÊN CÔNG khi cả hai cùng lao vào: đòn nhanh hơn trước, hòa thì
    // bên đang giữ nhịp trước, hòa nữa thì bên `a`. Thứ tự rút xúc sắc phải tất
    // định — R3 không cho nó phụ thuộc vào ai bấm nút trước.
    const attackerSide = pickInitiative(next, live, actions);
    const defenderSide = otherSide(attackerSide);

    const exchange: Exchange = {
      byActor: new Map([
        [next.a.id, views.a],
        [next.b.id, views.b],
      ]),
    };
    publishExchange(exchange);
    let outcome;
    try {
      outcome = contestedCheck(
        rng,
        specFor(next, attackerSide, actions[attackerSide], false),
        specFor(next, defenderSide, actions[defenderSide], !actions[defenderSide].attack),
      );
    } finally {
      publishExchange(null);
    }

    checks.push(
      { side: attackerSide, result: outcome.attacker },
      { side: defenderSide, result: outcome.defender },
    );
    const tiers: Record<SideId, CheckTier> = { a: 'fail', b: 'fail' };
    tiers[attackerSide] = outcome.attacker.tier;
    tiers[defenderSide] = outcome.defender.tier;

    for (const side of ['a', 'b'] as const) {
      chronicleActions.push({
        actorId: fighterOf(next, side).id,
        action: actions[side].name,
        target: fighterOf(next, otherSide(side)).name,
        result: tiers[side],
        margin: side === attackerSide ? outcome.attacker.margin : outcome.defender.margin,
      });
    }

    const winner: SideId = outcome.winner === 'attacker' ? attackerSide : defenderSide;
    const loser = otherSide(winner);

    applyWin(next, rng, winner, loser, actions, tiers, pair, injuries, say);

    // SONG THƯƠNG: cả hai cùng lao vào và không ai hơn hẳn ai thì cả hai cùng ăn
    // đòn. Chuyện này có thật, và chính nó là thứ khiến người ta sợ đổi đòn.
    const bothAttacked = live.length === 2;
    if (bothAttacked && Math.abs(outcome.diff) < CONTEST_LADDER.d20.clear && actions[loser].harmful) {
      const hit = landHit(next, rng, loser, actions[loser], 'costlySuccess', 'fail', pair[winner].incomingSeverity - 1);
      recordHit(next, winner, hit, injuries, say);
      if (hit.injury !== null) say('', 'Cả hai cùng dính đòn — không ai kịp lùi.');
    }

    for (const side of ['a', 'b'] as const) {
      settleTempo(next, side, tiers[side], side === winner ? actions[side].base.tempoBonus + pair[side].tempoExtra : 0);
      settleStamina(next, side, actions[side], pair[side].staminaExtra);
    }
  }

  // --- Máu, ngã, rơi vũ khí -----------------------------------------------
  for (const side of ['a', 'b'] as const) {
    const fighter = fighterOf(next, side);
    const lost = bleedRound(fighter);
    if (lost >= 1) say(side, `${fighter.name} mất thêm máu (còn ${Math.round(fighter.body.blood)}).`);
    checkDrop(next, side, say);
  }

  // --- B6: biên niên ------------------------------------------------------
  const round: ChronicleRound = {
    n: next.round,
    actions: chronicleActions,
    injuries,
    tempoAfter: { [next.a.id]: next.a.tempo, [next.b.id]: next.b.tempo },
    staminaAfter: { [next.a.id]: Math.round(next.a.stamina), [next.b.id]: Math.round(next.b.stamina) },
  };
  const highlight = detectHighlight(duel, next, round);
  if (highlight !== null) round.highlight = highlight;

  next.rounds.push(round);
  next.checks.push(...checks);
  next.log.push(...lines);
  next.round += 1;
  // Vị trí dòng xúc sắc đi theo trận đấu, không đi theo lời gọi. Xem chú thích
  // `DuelState.rngState` — thiếu dòng này thì mỗi hiệp tung lại đúng con xúc sắc
  // của hiệp đầu tiên.
  next.rngState = rng.getState();

  return { duel: next, round, lines, checks };
}

// ---------------------------------------------------------------------------
// Mảnh việc của B5
// ---------------------------------------------------------------------------

function pickInitiative(duel: DuelState, live: readonly SideId[], actions: Record<SideId, ResolvedAction>): SideId {
  if (live.length === 1) return live[0] ?? 'a';
  const initiativeA = speedRow(actions.a.speed).initiative + duel.a.loadout.weapon.speedShift;
  const initiativeB = speedRow(actions.b.speed).initiative + duel.b.loadout.weapon.speedShift;
  if (initiativeA !== initiativeB) return initiativeA > initiativeB ? 'a' : 'b';
  if (duel.a.tempo !== duel.b.tempo) return duel.a.tempo > duel.b.tempo ? 'a' : 'b';
  return 'a';
}

function applyStance(duel: DuelState, side: SideId, nodeId: string): void {
  const fighter = fighterOf(duel, side);
  fighter.stance = nodeId;
  if (fighter.id !== '' || duel.state === null) return;

  // Của NGƯỜI CHƠI thì sự thật nằm ở `skills.activeStance`, và nguồn `skills.the`
  // của Phần 8 đọc chỗ đó. Ghi qua MVU chứ không sửa thẳng (R2).
  const skillId = nodeSkillOf(nodeId);
  if (skillId === '') return;
  const op: PatchOp = {
    op: 'set',
    path: `skills.activeStance.${skillId}`,
    to: nodeId,
    reason: 'đổi thế giữa trận đấu',
    source: 'json',
  };
  duel.playerOps.push(op);
  const applied = applyPatch(duel.state, [op], { actor: 'engine' });
  if (applied.applied && applied.next !== null) duel.state = applied.next;
}

function nodeSkillOf(nodeId: string): string {
  const parts = nodeId.split('_');
  return parts.length >= 2 ? `skill_${parts[1] ?? ''}` : '';
}

function applyWin(
  duel: DuelState,
  rng: Rng,
  winner: SideId,
  loser: SideId,
  actions: Record<SideId, ResolvedAction>,
  tiers: Record<SideId, CheckTier>,
  pair: { a: MatchupSide; b: MatchupSide },
  injuries: ChronicleInjury[],
  say: (side: SideId | '', text: string) => void,
): void {
  const action = actions[winner];
  const winnerName = fighterOf(duel, winner).name;
  const loserFighter = fighterOf(duel, loser);

  if (!isSuccess(tiers[winner])) return;

  if (action.harmful) {
    const hit = landHit(duel, rng, winner, action, tiers[winner], tiers[loser], pair[loser].incomingSeverity);
    recordHit(duel, loser, hit, injuries, say);
  } else if (action.defence) {
    say(winner, `${winnerName} đỡ được, và giành lại nhịp.`);
  }

  if (action.base.disarm) {
    loserFighter.disarmed = true;
    say(winner, `${winnerName} xoắn lấy vũ khí — ${loserFighter.name} buông tay.`);
  }
  if (action.base.knockdown) {
    loserFighter.prone = true;
    say(winner, `${loserFighter.name} ngã xuống.`);
  }
  if (action.base.blinds > 0) {
    loserFighter.blindUntil = duel.round + action.base.blinds;
    say(winner, `${loserFighter.name} ôm mặt — cát vào mắt.`);
  }
}

function recordHit(
  duel: DuelState,
  victimSide: SideId,
  hit: HitOutcome,
  injuries: ChronicleInjury[],
  say: (side: SideId | '', text: string) => void,
): void {
  const victim = fighterOf(duel, victimSide);
  if (hit.injury === null) {
    if (hit.note !== '') {
      say(victimSide, `${victim.name}: ${hit.note}${hit.absorbed ? ' — nhưng cú va vẫn rút sức' : ''}.`);
    }
    return;
  }

  const injury = hit.injury;
  injuries.push({
    actorId: victim.id,
    regionId: injury.regionId,
    region: regionName(injury.regionId),
    type: injury.type,
    severity: injury.severity,
    ...(hit.throughGap ? { throughGap: true } : {}),
  });
  if (injury.bleeding > 0) victim.bled = true;

  say(
    victimSide,
    `${victim.name} trúng ${regionName(injury.regionId).toLowerCase()}: ${injuryTypeName(
      injury.type,
    ).toLowerCase()} ${severityName(injury.severity).toLowerCase()}${hit.note === '' ? '' : ` — ${hit.note}`}.`,
  );
}

/** Rơi vũ khí vì tay hỏng, và ngã gục vì hết máu hoặc hết ý thức. */
function checkDrop(duel: DuelState, side: SideId, say: (side: SideId | '', text: string) => void): void {
  const fighter = fighterOf(duel, side);
  const config = woundConfig();

  if (!fighter.disarmed && fighter.loadout.weaponId !== '') {
    const hand = fighter.body.dominantHand;
    if (gripOf(fighter.body, hand) < config.gripDropBelow) {
      fighter.disarmed = true;
      say(side, `${fighter.name} không còn nắm nổi chuôi — vũ khí rơi xuống.`);
    }
  }

  const level = consciousnessOf(fighter.body, fighter.stats.wil, duel.turn);
  if (config.downConsciousness.includes(level.id) && !fighter.prone) {
    fighter.prone = true;
    say(side, `${fighter.name} khuỵu xuống — ${level.name}.`);
  }
}

function detectHighlight(before: DuelState, after: DuelState, round: ChronicleRound): Highlight | null {
  const worst = round.injuries.reduce((max, injury) => Math.max(max, injury.severity), 0);

  if (after.a.body.blood <= 25 || after.b.body.blood <= 25) return 'nearDeath';
  if (worst >= 4) return 'critical';
  if ((after.a.disarmed && !before.a.disarmed) || (after.b.disarmed && !before.b.disarmed)) return 'disarm';
  if ((after.a.bled && !before.a.bled) || (after.b.bled && !before.b.bled)) return 'firstBlood';

  const swing =
    Math.abs(after.a.tempo - before.a.tempo) + Math.abs(after.b.tempo - before.b.tempo);
  if (swing >= 4) return 'turningPoint';
  return null;
}

/** Hướng quay một bậc — dùng cho UI khi người chơi bấm xoay trái/phải. */
export function turnFacing(facing: Dir8, steps: number): Dir8 {
  return turnDir(facing, steps);
}

/** Vùng cơ thể có thật không — dùng lúc dựng đấu sĩ từ data ngoài. */
export function knownRegion(id: string): boolean {
  return regionOf(id) !== null;
}
