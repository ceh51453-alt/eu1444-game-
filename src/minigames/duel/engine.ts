/**
 * VÒNG ĐỜI MỘT TRẬN QUYẾT ĐẤU — dựng, đánh từng hiệp, chốt, và giao biên niên.
 *
 * Đây là CỬA VÀO DUY NHẤT của Phần 9 cho phần còn lại của game. UI gọi
 * `createDuel` rồi `playRound`; bài test mục 12.10 gọi `autoDuel`; cả hai đi qua
 * đúng một con đường, nên thứ bài test đo được LÀ thứ người chơi sẽ chơi.
 *
 * DÒNG XÚC SẮC RIÊNG (`DUEL_STREAM`). Số lần tung trong một trận đấu thay đổi
 * theo số hiệp, số đòn trúng và số lần tra vị trí trúng đòn — nghĩa là nó thay
 * đổi theo cách người chơi đánh. Trên dòng `main` thì mọi cú tung của mọi lượt
 * SAU trận đấu sẽ lệch đi, và "cùng seed + cùng input = cùng kết quả" lặng lẽ
 * hết đúng (R3). Phần 0 mục 3 mở sẵn cơ chế dòng riêng cho đúng chuyện này.
 *
 * KHÔNG GHI STORE. Trận đấu áp op của người chơi vào một BẢN LÀM VIỆC của state
 * để những cú tung sau còn đọc được cơn đau vừa nhận, và trả `playerOps` cho
 * người gọi chốt vào store thật — vì người gọi mới là chỗ giữ ngăn xếp undo, và
 * undo phải tua về TRƯỚC cả trận chứ không phải về giữa hiệp thứ chín.
 */

import type { Rng } from '@/core/rng';
import type { GameState } from '@/state/slices';
import type { PatchOp } from '@/state/mvu-parse';
import type { CarriedGear } from '@/systems/character/gear';
import { bodyOf, defaultBody, type BodyState } from '@/systems/body/slice';
import { regionName } from '@/systems/body/regions';
import { severityName } from '@/systems/body/catalog';
import { practiceFromChecks } from '@/systems/skills/progress';
import type { StatBlock } from '@/systems/character/stats';
import {
  compressChronicle,
  type ChronicleParticipant,
  type ChronicleSetting,
  type CombatChronicle,
  type CompactChronicle,
} from '@/systems/combat/chronicle';
import { usableActions } from './actions';
import { generateArena, startingPositions, type Cell, type Dir8 } from './arena';
import { chooseAction } from './choose';
import { arenaOf, defaultArena, kindOf, staminaConfig, type DuelKind } from './data';
import {
  DEFAULT_DOCTRINE,
  MAX_LLM_CALLS,
  doctrinePrompt,
  parseDoctrine,
  resolveFavored,
  turningPointFor,
  type Doctrine,
  type DoctrineContext,
  type DoctrineRequest,
} from './doctrine';
import { buildLoadout } from './equipment';
import { endVerdict, pointsWinner, type EndVerdict } from './kinds';
import { cloneDuel, resolveOptionsOf, runRound, staminaMaxFor, type RoundResult } from './resolve';
import { distance } from './arena';
import { fighterOf, otherSide, type ChosenAction, type DuelState, type Fighter, type SideId } from './types';

/** Dòng RNG riêng của quyết đấu. Xem chú thích đầu file. */
export const DUEL_STREAM = 'duel';

// ---------------------------------------------------------------------------
// Dựng trận
// ---------------------------------------------------------------------------

export interface FighterSpec {
  /** RỖNG nghĩa là nhân vật người chơi — quy ước `actor` của Phần 5. */
  id: string;
  name: string;
  stats: StatBlock;
  /** Id kỹ năng → điểm rèn luyện 0–100. */
  skills: Record<string, number>;
  gear: readonly CarriedGear[];
  nodes?: readonly string[];
  stance?: string;
  description?: string;
  relation?: string;
  doctrine?: Doctrine;
  /** Cơ thể mang sẵn. Người chơi bỏ trống — engine lấy từ state. */
  body?: BodyState;
  tags?: readonly string[];
}

export interface DuelSetup {
  id?: string;
  kindId: string;
  arenaId?: string;
  a: FighterSpec;
  b: FighterSpec;
  setting?: Partial<ChronicleSetting>;
  stakes?: string;
  /** Lượt game trận đấu diễn ra. */
  turn?: number;
  /** State của ván chơi. Bỏ trống thì không bên nào là người chơi. */
  state?: GameState | null;
}

export class DuelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DuelError';
  }
}

function buildFighter(spec: FighterSpec, side: SideId, pos: Cell, facing: Dir8, state: GameState | null): Fighter {
  const loadout = buildLoadout([...spec.gear]);
  const body = spec.body ?? (spec.id === '' ? (bodyOf(state) ?? defaultBody()) : defaultBody());
  const staminaMax = staminaMaxFor(spec.stats.vit);

  const doctrine = spec.doctrine ?? DEFAULT_DOCTRINE;
  return {
    id: spec.id,
    name: spec.name,
    side,
    description: spec.description ?? '',
    relation: spec.relation ?? '',
    stats: { ...spec.stats },
    skills: { ...spec.skills },
    nodes: [...(spec.nodes ?? [])],
    stance: spec.stance ?? '',
    loadout,
    pos,
    facing,
    stamina: staminaMax,
    staminaMax,
    tempo: 0,
    body: { ...body, injuries: body.injuries.map((injury) => ({ ...injury })), log: [...body.log] },
    disarmed: false,
    prone: false,
    yielded: false,
    blindUntil: 0,
    bled: false,
    leftArena: false,
    // Đòn ruột khai bằng lời (mục 1 in ví dụ tiếng Việt có dấu) được đổi sang id
    // NGAY LÚC DỰNG, không đổi lại ở mỗi hiệp: bộ chọn chạy hai lần mỗi hiệp và
    // một phép chuẩn hóa chuỗi trong vòng lặp trong là thứ bài test 200 trận sẽ
    // trả giá.
    doctrine: { ...doctrine, favoredActions: resolveFavored(doctrine.favoredActions) },
    tags: [...(spec.tags ?? [])],
  };
}

export function createDuel(rng: Rng, setup: DuelSetup): DuelState {
  const kind = kindOf(setup.kindId);
  if (kind === null) throw new DuelError(`loại hình quyết đấu không có trong data/arenas.json: ${setup.kindId}`);

  const template = setup.arenaId === undefined ? defaultArena() : arenaOf(setup.arenaId);
  if (template === null) throw new DuelError(`đấu trường không có trong data/arenas.json: ${String(setup.arenaId)}`);

  const arena = generateArena(rng, template);
  const [start, end] = startingPositions(arena);
  const state = setup.state ?? null;

  // Hai người quay mặt vào nhau ngay từ đầu. Bắt đầu bằng một bên xoay lưng là
  // tặng không một hiệp đánh sau lưng, và mục 9 chỉ cho phép chuyện đó ở PHỤC
  // KÍCH — nơi cả hiệp mở màn là quà. Bên `a` là bên ra tay trước.
  const facingA: Dir8 = arena.height >= arena.width ? 4 : 2;
  const facingB: Dir8 = arena.height >= arena.width ? 0 : 6;
  const a = buildFighter(setup.a, 'a', start, facingA, state);
  const b = buildFighter(setup.b, 'b', end, kind.freeOpeningRound ? facingA : facingB, state);

  return {
    id: setup.id ?? `duel_${arena.id}_${String(setup.turn ?? 0)}`,
    kindId: kind.id,
    arena,
    a,
    b,
    round: 1,
    finished: false,
    ending: '',
    winner: '',
    rounds: [],
    checks: [],
    log: [],
    setting: {
      place: setup.setting?.place ?? '',
      ground: setup.setting?.ground ?? arena.name,
      weather: setup.setting?.weather ?? '',
      timeOfDay: setup.setting?.timeOfDay ?? '',
      witnesses: setup.setting?.witnesses ?? '',
    },
    stakes: setup.stakes ?? '',
    playerOps: [],
    state,
    rngState: rng.getState(),
    turn: setup.turn ?? 0,
    llmCalls: 0,
  };
}

// ---------------------------------------------------------------------------
// Nước đi của engine (tầng 2 của mục 1)
// ---------------------------------------------------------------------------

/**
 * Nước đi của một bên do engine chọn.
 *
 * Hết đường thì kêu hàng — nhưng CHỈ khi loại hình cho phép và chỉ khi thật sự
 * hết đường. Ở đấu sinh tử và phục kích thì `yieldAllowed` là false, và người ta
 * đánh tới lúc gục, đúng như mục 9 viết.
 */
export function engineChoice(duel: DuelState, side: SideId, rng: Rng): ChosenAction {
  const self = fighterOf(duel, side);
  const foe = fighterOf(duel, otherSide(side));
  const options = resolveOptionsOf(duel);
  const gap = distance(self.pos, foe.pos);

  const usable = usableActions(self, foe, gap, options);
  const kind = kindOf(duel.kindId);
  const hopeless = self.stamina <= staminaConfig().forcedDefenceBelow && self.body.blood < 45;

  if (hopeless && (kind?.yieldAllowed ?? false) && self.doctrine.honor < 0.85) {
    const yields = usable.find((action) => action.base.yields);
    if (yields !== undefined) return { actionId: yields.actionId };
  }

  const candidates = usable.filter((action) => !action.base.yields);
  const pool = candidates.length > 0 ? candidates : usable;
  if (pool.length === 0) return { actionId: 'xoay-mat' };

  const picked = chooseAction(rng, pool, { self, foe, arena: duel.arena, gap, round: duel.round }).action;
  return picked.nodeId === ''
    ? { actionId: picked.actionId }
    : { actionId: picked.actionId, nodeId: picked.nodeId };
}

// ---------------------------------------------------------------------------
// Đánh một hiệp
// ---------------------------------------------------------------------------

export interface PlayResult extends RoundResult {
  /** Kết cục nếu trận vừa kết thúc ở hiệp này. */
  verdict: EndVerdict | null;
}

/** Một hiệp: người chơi đã chọn, engine chọn cho bên kia. */
export function playRound(duel: DuelState, rng: Rng, playerChoice: ChosenAction, playerSide: SideId = 'a'): PlayResult {
  const npcSide = otherSide(playerSide);
  const npcChoice = engineChoice(duel, npcSide, rng);
  const choices = playerSide === 'a' ? { a: playerChoice, b: npcChoice } : { a: npcChoice, b: playerChoice };
  return settle(runRound(duel, rng, choices));
}

/** Một hiệp mà cả hai bên do engine chọn — bài test và chế độ xem lại dùng. */
export function autoRound(duel: DuelState, rng: Rng): PlayResult {
  const choices = { a: engineChoice(duel, 'a', rng), b: engineChoice(duel, 'b', rng) };
  return settle(runRound(duel, rng, choices));
}

function settle(result: RoundResult): PlayResult {
  const verdict = endVerdict(result.duel);
  if (verdict === null) return { ...result, verdict: null };

  const duel = result.duel;
  duel.finished = true;
  duel.ending = verdict.ending;
  duel.winner = verdict.winner;
  duel.log.push({ round: duel.round - 1, side: '', text: verdict.summary });
  return { ...result, duel, verdict };
}

/**
 * Đánh trọn một trận, cả hai bên do engine chọn.
 *
 * Trần cứng `maxRounds + 5` là lưới an toàn cho một cấu hình data hỏng — một
 * loại hình quên khai cửa ra nào cũng chạm được sẽ treo vòng lặp, và một
 * minigame treo là thứ R4 cấm.
 */
export function autoDuel(duel: DuelState, rng: Rng): DuelState {
  const kind = kindOf(duel.kindId);
  const ceiling = (kind?.maxRounds ?? 30) + 5;

  let current = duel;
  while (!current.finished && current.round <= ceiling) {
    current = autoRound(current, rng).duel;
  }
  if (!current.finished) {
    current.finished = true;
    current.ending = 'het-hiep';
    current.winner = pointsWinner(current);
  }
  return current;
}

// ---------------------------------------------------------------------------
// Chốt trận
// ---------------------------------------------------------------------------

function participantOf(fighter: Fighter): ChronicleParticipant {
  return {
    id: fighter.id,
    name: fighter.name,
    side: fighter.side,
    description: fighter.description,
    gear: `${fighter.loadout.weaponName}, ${fighter.loadout.armorName}`,
    relation: fighter.relation,
  };
}

function aftermathOf(duel: DuelState): string[] {
  const lines: string[] = [];
  for (const side of ['a', 'b'] as const) {
    const fighter = fighterOf(duel, side);
    const fresh = fighter.body.injuries.filter((injury) => injury.inflictedTurn === duel.turn);
    if (fresh.length === 0) {
      lines.push(`${fighter.name} không mang thêm vết nào.`);
      continue;
    }
    let worst: (typeof fresh)[number] | null = null;
    for (const injury of fresh) {
      if (worst === null || injury.severity > worst.severity) worst = injury;
    }
    if (worst === null) continue;
    lines.push(
      `${fighter.name} mang về ${fresh.length} vết, nặng nhất là ${regionName(worst.regionId).toLowerCase()} — ${severityName(
        worst.severity,
      ).toLowerCase()}.`,
    );
    if (fighter.body.blood < 70) lines.push(`${fighter.name} mất máu, còn ${Math.round(fighter.body.blood)}/100.`);
  }

  const kind = kindOf(duel.kindId);
  if (kind !== null && kind.reputation > 0 && duel.winner !== '') {
    lines.push(`${fighterOf(duel, duel.winner).name} được thêm uy tín (${kind.reputation}).`);
  }
  if (kind?.legal === true && duel.winner !== '') {
    lines.push(`Phán quyết thuộc về ${fighterOf(duel, duel.winner).name} — trận này có hiệu lực pháp lý.`);
  }
  if (kind?.ransom === true && duel.winner !== '') {
    lines.push(`${fighterOf(duel, otherSide(duel.winner)).name} nợ tiền chuộc ngựa và giáp.`);
  }
  return lines;
}

/** Số phút trong game một trận chiếm. Một hiệp chừng sáu giây. */
export function durationMinutes(rounds: number): number {
  return Math.max(1, Math.round((rounds * 6) / 60));
}

export function buildChronicle(duel: DuelState): CombatChronicle {
  const kind = kindOf(duel.kindId);
  return {
    kind: 'duel',
    setting: { ...duel.setting },
    participants: [participantOf(duel.a), participantOf(duel.b)],
    stakes: duel.stakes === '' ? (kind?.name ?? '') : duel.stakes,
    rounds: duel.rounds,
    outcome: {
      winnerId: duel.winner === '' ? '' : fighterOf(duel, duel.winner).id,
      ending: duel.ending,
      endingName: endVerdict(duel)?.endingName ?? duel.ending,
      summary: duel.log.at(-1)?.text ?? '',
    },
    duration: { rounds: duel.rounds.length, minutes: durationMinutes(duel.rounds.length) },
    aftermath: aftermathOf(duel),
  };
}

/** Biên niên đã nén, sẵn sàng đưa vào prompt viết diễn biến (mục 10). */
export function chronicleFor(duel: DuelState, maxRounds = 12): CompactChronicle {
  return compressChronicle(buildChronicle(duel), { maxRounds });
}

/**
 * Điểm thực hành của Phần 8 từ những cú tung của trận.
 *
 * `context` đặt theo ĐỐI THỦ, đúng như `skills/slice.ts` của Phần 8 đã hẹn:
 * "minigame của Phần 9–11 sẽ đặt theo đối thủ". Nhờ vậy luật chống cày của mục 3
 * chạy đúng — đấu tập với cùng một người mãi thì điểm tụt về 0, và người chơi
 * phải đi tìm đối thủ khác.
 */
export function practiceOps(duel: DuelState, playerSide: SideId = 'a'): PatchOp[] {
  if (duel.state === null) return [];
  const self = fighterOf(duel, playerSide);
  if (self.id !== '') return [];

  const foe = fighterOf(duel, otherSide(playerSide));
  const kind = kindOf(duel.kindId);

  // Cú tung của ĐỐI THỦ không dạy người chơi được gì.
  const mine = duel.checks.filter((entry) => entry.side === playerSide).map((entry) => entry.result);
  return practiceFromChecks(duel.state, mine, duel.turn, {
    context: `duel:${foe.id === '' ? foe.name : foe.id}`,
    tags: [duel.kindId],
    factor: kind?.practiceFactor ?? 1,
  }).ops;
}

export function kindDetails(duel: DuelState): DuelKind | null {
  return kindOf(duel.kindId);
}

// ---------------------------------------------------------------------------
// Tầng 1 của mục 1 — hai hàm nối doctrine vào trận đấu
// ---------------------------------------------------------------------------

/**
 * Prompt xin doctrine, HOẶC `null` khi không được gọi nữa.
 *
 * Trần cứng `MAX_LLM_CALLS` đứng ở đây chứ không ở `doctrine.ts`: mục 1 cho một
 * lần lúc vào trận cộng tối đa hai lần ở khúc ngoặt, và trần ấy phải là một con
 * số ĐẾM ĐƯỢC trên `DuelState` chứ không phải một lời hứa trong tài liệu. Một
 * trận dài chạm khúc ngoặt nhiều lần, và không có chỗ đếm thì mỗi trận đấu là
 * một hóa đơn không ai lường trước.
 */
export function requestDoctrine(duel: DuelState, side: SideId, context: Partial<DoctrineContext> = {}): DoctrineRequest | null {
  if (duel.llmCalls >= MAX_LLM_CALLS) return null;
  // Lần đầu thì luôn được gọi; từ lần thứ hai trở đi phải có khúc ngoặt thật.
  if (duel.llmCalls > 0 && turningPointFor(duel, side) === null) return null;

  const self = fighterOf(duel, side);
  const foe = fighterOf(duel, otherSide(side));
  const kind = kindOf(duel.kindId);

  return doctrinePrompt({
    profile: context.profile ?? `${self.name}${self.description === '' ? '' : ` — ${self.description}`}`,
    relation: context.relation ?? self.relation,
    situation: context.situation ?? duel.setting.place,
    stakes: context.stakes ?? duel.stakes,
    kind: context.kind ?? (kind?.name ?? 'quyết đấu'),
    gear:
      context.gear ??
      `${self.name}: ${self.loadout.weaponName}, ${self.loadout.armorName}. ${foe.name}: ${foe.loadout.weaponName}, ${foe.loadout.armorName}.`,
  });
}

/**
 * Đọc câu trả lời của LLM vào tính cách chiến đấu của một bên.
 *
 * Trả về `DuelState` MỚI, và luôn đếm thêm một lời gọi — kể cả khi câu trả lời
 * hỏng và doctrine rơi về mặc định (R4). Đếm cả lần hỏng là cố ý: một proxy đang
 * trả rác sẽ bị chặn lại sau ba lần, chứ không quay vòng mãi.
 */
export function applyDoctrine(duel: DuelState, side: SideId, reply: string): { duel: DuelState; issue: string } {
  const parsed = parseDoctrine(reply);
  const next = cloneDuel(duel);
  const fighter = side === 'a' ? next.a : next.b;
  fighter.doctrine = { ...parsed.doctrine, favoredActions: resolveFavored(parsed.doctrine.favoredActions) };
  next.llmCalls += 1;
  return { duel: next, issue: parsed.issue };
}
