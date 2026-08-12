/**
 * "TỰ MÌNH XÔNG LÊN" — cầu nối sang minigame quyết đấu của Phần 9 (mục 11).
 *
 * Mục 11 gọi đây là "một quyết định đắt giá, không phải một nút bấm miễn phí", và
 * ba vế của nó phải cùng có mặt, nếu không thì nó đúng là một nút bấm miễn phí:
 *
 *   LỢI   sĩ khí quanh mình tăng mạnh, có thể xoay chuyển một cánh
 *   HẠI   bị thương THẬT theo Phần 7, và chết thì mọi thứ chấm dứt
 *   GIÁ   trong lúc đấu, người chơi KHÔNG ra lệnh được — toàn quân tự xoay xở
 *
 * Vế thứ ba là vế dễ bị bỏ quên nhất và cũng là vế đắt nhất: `battle.duelling`
 * bật lên thì `playerCommands` trả về false cho MỌI đơn vị, và một vòng trôi qua
 * với cả đạo quân do engine cầm. Ở tước vị cao, ba vòng như thế có thể là cả trận
 * đánh.
 *
 * ĐỐI THỦ TƯƠNG XỨNG, không phải một con bù nhìn: mục 11 viết "một đối thủ tương
 * xứng". Engine dựng người ấy từ chính binh chủng của đơn vị địch đang đứng
 * trước mặt — đánh với cấm vệ dị tộc thì gặp một tay kiếm giỏi, đánh với dân
 * binh làng thì gặp một người nông dân cầm giáo. Nếu ai cũng như ai thì nút này
 * chỉ còn là một trò may rủi tách rời trận đánh.
 */

import type { Rng } from '@/core/rng';
import type { PatchOp } from '@/state/mvu-parse';
import type { GameState } from '@/state/slices';
import { carry, type CarriedGear } from '@/systems/character/gear';
import { characterOf } from '@/systems/character/slice';
import { emptyStatBlock, type StatBlock } from '@/systems/character/stats';
import { skillsOf } from '@/systems/skills/slice';
import {
  DEFAULT_DOCTRINE,
  archetype,
  createDuel,
  isDead,
  isDown,
  practiceOps,
  type DuelState,
  type FighterSpec,
} from '@/minigames/duel';
import { unitTypeOf } from './data';
import { distance } from './grid';
import { adjustMorale } from './morale';
import { cloneBattle } from './engine';
import { onField, otherSide, unitById, unitsOf, type BattleState, type BattleUnit } from './types';

// ---------------------------------------------------------------------------
// Hai hồ sơ đấu sĩ
// ---------------------------------------------------------------------------

function skillLevels(state: GameState): Record<string, number> {
  const skills = characterOf(state)?.skills ?? {};
  const out: Record<string, number> = {};
  for (const [id, entry] of Object.entries(skills)) out[id] = entry.level;
  return out;
}

/** Nhân vật người chơi, đúng như họ đang đứng trong hàng quân. */
export function playerFighter(state: GameState): FighterSpec {
  const character = characterOf(state);
  const gear = (character?.gear ?? []) as CarriedGear[];
  const stats = (character?.stats ?? emptyStatBlock(10)) as StatBlock;

  const armed = gear.some((entry) => entry.equipped);
  const borrowed = carry('item_kiem-mot-tay');
  const carried = armed || borrowed === null ? gear : [...gear, borrowed];
  const stance = Object.values(skillsOf(state)?.activeStance ?? {}).find((id) => id !== '');

  return {
    // RỖNG: quy ước `CheckSpec.actor` của Phần 5 — nhờ nó mà nguồn modifier của
    // Phần 6, 7 và 8 tự bật lên cho người chơi.
    id: '',
    name: character?.identity.name === undefined || character.identity.name === '' ? 'Ngài' : character.identity.name,
    description: 'giữa hàng quân, giáp còn dính bùn',
    stats,
    skills: skillLevels(state),
    gear: carried,
    nodes: skillsOf(state)?.unlockedNodes ?? [],
    ...(stance === undefined ? {} : { stance }),
  };
}

/** Trang bị của một đấu sĩ dựng từ binh chủng — nặng hay nhẹ theo giáp của đơn vị. */
function gearForUnit(unit: BattleUnit): CarriedGear[] {
  const type = unitTypeOf(unit.typeId);
  const armor = type?.armor ?? 1;
  const ids: string[] = [];

  if (unit.tags.includes('cung')) ids.push('item_kiem-mot-tay');
  else if (unit.tags.includes('giao-dai')) ids.push('item_giao');
  else ids.push(armor >= 4 ? 'item_kiem-dai' : 'item_kiem-mot-tay');

  if (armor >= 5) ids.push('item_giap-tam', 'item_mu-tru', 'item_gang-sat');
  else if (armor >= 3) ids.push('item_giap-luoi', 'item_mu-tru');
  else if (armor >= 2) ids.push('item_giap-da', 'item_mu-sat');
  else if (armor >= 1) ids.push('item_ao-lot-giap');

  const carried: CarriedGear[] = [];
  for (const id of ids) {
    const entry = carry(id);
    if (entry !== null) carried.push(entry);
  }
  return carried;
}

/**
 * Người bước ra đấu với người chơi.
 *
 * Chỉ số và kỹ năng suy từ CHẤT LƯỢNG đơn vị: tân binh là một thanh niên hoảng
 * sợ, cựu binh dày dạn là hai mươi năm cầm kiếm. Đây là chỗ `quality` của mục 5
 * — vốn chỉ là một con số trong dice pool — biến thành một con người.
 */
export function championFor(unit: BattleUnit): FighterSpec {
  const type = unitTypeOf(unit.typeId);
  const quality = unit.quality;
  const skill = 20 + quality * 12;
  const stat = 9 + Math.round(quality * 0.8);

  return {
    id: `npc_${unit.id}`,
    name: `Người cầm đầu ${type?.name ?? unit.name}`,
    description: `${type?.name ?? 'một người lính'}, bước ra khỏi hàng`,
    stats: { ...emptyStatBlock(10), str: stat, agi: stat, vit: stat + 1, per: stat, wil: stat + 1 },
    skills: {
      'skill_kiem-thuat': skill,
      skill_khien: Math.round(skill * 0.7),
      'skill_tay-khong': Math.round(skill * 0.5),
    },
    gear: gearForUnit(unit),
    doctrine: archetype(quality >= 4 ? 'hiep-si' : 'nhan-nai') ?? DEFAULT_DOCTRINE,
    relation: 'kẻ đứng chắn đường ngài',
    tags: [...unit.tags],
  };
}

// ---------------------------------------------------------------------------
// Vào và ra
// ---------------------------------------------------------------------------

export interface ChargeIn {
  battle: BattleState;
  duel: DuelState;
  /** Đơn vị địch người chơi vừa lao vào. */
  foeUnitId: string;
}

/** Người chơi có xông lên được không: phải có địch trong tầm một ô. */
export function canChargeIn(battle: BattleState, unitId: string): boolean {
  if (battle.duelling || battle.finished) return false;
  const unit = unitById(battle, unitId);
  if (unit === null || !onField(unit)) return false;
  return unitsOf(battle, otherSide(unit.side)).some((foe) => distance(unit.pos, foe.pos) <= 1);
}

/**
 * Người chơi bước ra khỏi hàng.
 *
 * Sĩ khí quanh mình tăng NGAY, trước khi biết kết quả — mục 11 nói "sĩ khí quanh
 * mình tăng mạnh", và đúng là thế: người ta thấy lãnh chúa của mình xông lên thì
 * hò reo ngay lúc ấy, không chờ xem ông ta có thắng không.
 */
export function chargeIn(battle: BattleState, rng: Rng, unitId: string): ChargeIn | null {
  if (!canChargeIn(battle, unitId)) return null;
  const next = cloneBattle(battle);
  const unit = unitById(next, unitId);
  if (unit === null || next.state === null) return null;

  const foe = unitsOf(next, otherSide(unit.side))
    .filter((entry) => distance(unit.pos, entry.pos) <= 1)
    .reduce<BattleUnit | null>((best, entry) => (best === null || entry.strength > best.strength ? entry : best), null);
  if (foe === null) return null;

  unit.playerLed = true;
  next.duelling = true;
  for (const friend of unitsOf(next, unit.side)) {
    if (distance(friend.pos, unit.pos) > 2) continue;
    adjustMorale(friend, friend.id === unit.id ? 14 : 9);
  }
  next.log.push({
    round: next.round,
    side: unit.side,
    text: `Ngài xuống ngựa và bước lên trước hàng ${unit.name}. Cả cánh quân gào lên.`,
    major: true,
  });

  const duel = createDuel(rng, {
    kindId: 'dau-sinh-tu',
    arenaId: 'arena_san-dau',
    a: playerFighter(next.state),
    b: championFor(foe),
    state: next.state,
    turn: next.turn,
    stakes: 'một cánh quân, và mạng của chính ngài',
    setting: {
      place: `giữa trận, ${next.setting.ground.toLowerCase()}`,
      weather: next.setting.weather,
      timeOfDay: next.setting.timeOfDay,
      witnesses: 'cả hai đạo quân',
    },
  });

  return { battle: next, duel, foeUnitId: foe.id };
}

export interface ChargeResult {
  battle: BattleState;
  /** Op cho MVU: thương tích và điểm thực hành của người chơi. */
  ops: PatchOp[];
  lines: string[];
}

/**
 * Người chơi quay lại hàng quân — hoặc không.
 *
 * Ba cửa ra, và chúng phải khác nhau THẬT:
 *   thắng   đơn vị địch mất sĩ khí nặng, quân mình bốc lên — "xoay chuyển một cánh"
 *   thua    quân quanh mình chao đảo; lãnh chúa gục giữa trận là đòn nặng nhất
 *   chết    mọi thứ chấm dứt (mục 11) — engine chỉ báo, người gọi mới là chỗ kết ván
 */
export function resolveCharge(battle: BattleState, duel: DuelState, foeUnitId: string, playerUnitId: string): ChargeResult {
  const next = cloneBattle(battle);
  next.duelling = false;

  const player = duel.a;
  const foe = unitById(next, foeUnitId);
  const own = unitById(next, playerUnitId);
  const lines: string[] = [];

  const playerWon = duel.winner === 'a';
  const playerDown = isDead(player) || isDown(player, duel.turn);

  if (playerWon && foe !== null) {
    adjustMorale(foe, -26);
    lines.push(`Ngài hạ được người cầm đầu ${foe.name}. Hàng trước của chúng chùn lại.`);
    for (const friend of unitsOf(next, next.playerSide)) {
      if (own === null || distance(friend.pos, own.pos) > 3) continue;
      adjustMorale(friend, 12);
    }
  } else if (playerDown) {
    lines.push('Ngài gục xuống giữa trận. Người ta kéo ngài về sau hàng.');
    for (const friend of unitsOf(next, next.playerSide)) {
      if (own === null || distance(friend.pos, own.pos) > 3) continue;
      adjustMorale(friend, -20);
    }
  } else {
    lines.push('Hai người rời nhau ra, không ai ngã. Hàng quân khép lại sau lưng ngài.');
  }

  for (const line of lines) next.log.push({ round: next.round, side: next.playerSide, text: line, major: true });

  // Thương tích của người chơi đi qua MVU như mọi vết thương khác (R2). Phần 9
  // đã tích sẵn chúng vào `duel.playerOps`; ở đây chỉ gộp thêm điểm thực hành.
  const ops: PatchOp[] = [...duel.playerOps, ...practiceOps(duel, 'a')];
  next.playerOps.push(...ops);
  return { battle: next, ops, lines };
}

/** Người chơi đã chết trong trận chưa — người gọi dùng để kết ván (mục 11). */
export function playerFell(duel: DuelState): boolean {
  return isDead(duel.a);
}
