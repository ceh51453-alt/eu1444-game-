/**
 * CHIẾN TRÊN MẶT TƯỜNG — cầu nối sang minigame quyết đấu của Phần 9 (mục 6).
 *
 * "Không gian cực hẹp, hai người một hàng. Lợi thế thuộc bên thủ TUYỆT ĐỐI.
 * Chuyển sang cơ chế Phần 9 quy mô nhỏ." Và: "Đội tiên phong… Người chơi có thể
 * tự dẫn → chuyển sang Phần 9."
 *
 * ĐẤU TRƯỜNG PHẢI LÀ MỘT CHỖ HẸP, và đó là chi tiết quan trọng nhất của file này.
 * `arena_cau-hep` của Phần 9 đã là đúng thứ ấy: một chỗ không lùi được, không đi
 * vòng được, hai người một hàng. Nếu ném người chơi vào `arena_san-dau` thì "lợi
 * thế thuộc bên thủ tuyệt đối" biến mất khỏi cơ học và chỉ còn là một câu trong
 * tài liệu — họ sẽ đánh nhau trên một cái sân rộng và thắng bằng cách đi vòng,
 * đúng thứ không ai làm được trên một lan can rộng một mét hai.
 *
 * GIÁ CỦA NÚT BẤM NÀY, cùng luật với Phần 10 mục 11: trong lúc người chơi đang
 * đấu, `assault.duelling` bật lên và họ KHÔNG điều đợt nào cả. Ở một cuộc tổng
 * công, hai hiệp như thế có thể là cả một đợt bị đánh bật.
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
import { assaultLayerOf, cloneSiege, garrisonMen, type AssaultWave, type SiegeState } from '@/systems/siege';

/** Lớp nào thì đánh tay đôi được — data khai `duel: true` (mặt tường, tháp chính). */
export function isDuelLayer(layerId: string): boolean {
  return assaultLayerOf(layerId)?.duel === true;
}

/** Người chơi có bước lên được không: phải đang dẫn một đợt đã tới lớp cận chiến. */
export function canFightOnWall(siege: SiegeState): boolean {
  const assault = siege.assault;
  if (assault === null || assault.finished || assault.duelling) return false;
  return assault.waves.some((wave) => wave.playerLed && !wave.spent && !wave.through && isDuelLayer(wave.layerId));
}

function skillLevels(state: GameState): Record<string, number> {
  const skills = characterOf(state)?.skills ?? {};
  const out: Record<string, number> = {};
  for (const [id, entry] of Object.entries(skills)) out[id] = entry.level;
  return out;
}

/** Nhân vật người chơi, đúng như họ đang đứng trên đầu một cái thang. */
export function playerOnWall(state: GameState): FighterSpec {
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
    description: 'vừa lên tới đầu thang, một tay còn bám vào bậc trên cùng',
    stats,
    skills: skillLevels(state),
    gear: carried,
    nodes: skillsOf(state)?.unlockedNodes ?? [],
    ...(stance === undefined ? {} : { stance }),
  };
}

/**
 * Người giữ đoạn lan can ấy.
 *
 * Chất lượng suy từ ĐỘI ĐỒN TRÚ CÒN LẠI, không phải từ một con số cố định: một
 * thành đã bị vây hai mươi tuần thì người đứng trên tường là một ông thợ mộc đói
 * lả, còn một thành mới bị vây ba tuần thì đó là một tay lính chuyên nghiệp. Nếu
 * ai cũng như ai thì hai mươi tuần vây hãm không đổi được gì ở đúng cái khoảnh
 * khắc chúng đáng ra phải đổi nhiều nhất.
 */
export function wallDefender(siege: SiegeState): FighterSpec {
  const start = siege.weeks[0]?.defenderMen ?? garrisonMen(siege.fort);
  const share = start <= 0 ? 1 : garrisonMen(siege.fort) / start;
  const worn = Math.max(0, Math.min(1, 1 - share));
  const morale = siege.defender.garrisonMorale;

  const skill = Math.round(70 - worn * 30 - Math.max(0, 60 - morale) * 0.3);
  const stat = Math.round(12 - worn * 3);

  return {
    id: 'npc_giu-tuong',
    name: 'Người giữ đoạn lan can',
    description:
      worn > 0.5
        ? 'gầy rộc, mắt trũng, cầm một cây rìu bổ củi'
        : 'một tay lính đồn trú, giáp lưới và khiên tròn, đứng đúng chỗ hắn đã đứng suốt mấy tháng',
    stats: { ...emptyStatBlock(10), str: stat, agi: stat, vit: stat + 1, per: stat, wil: stat + 2 },
    skills: {
      'skill_kiem-thuat': Math.max(15, skill),
      skill_khien: Math.max(10, Math.round(skill * 0.8)),
      'skill_tay-khong': Math.max(10, Math.round(skill * 0.5)),
    },
    gear: gearForDefender(worn),
    doctrine: archetype('nhan-nai') ?? DEFAULT_DOCTRINE,
    relation: 'người đứng giữa ngài và cái thành này',
    tags: ['thu-thanh'],
  };
}

function gearForDefender(worn: number): CarriedGear[] {
  const ids = worn > 0.5 ? ['item_giao', 'item_ao-lot-giap'] : ['item_kiem-mot-tay', 'item_giap-luoi', 'item_mu-tru'];
  const carried: CarriedGear[] = [];
  for (const id of ids) {
    const entry = carry(id);
    if (entry !== null) carried.push(entry);
  }
  return carried;
}

// ---------------------------------------------------------------------------
// Vào và ra
// ---------------------------------------------------------------------------

export interface WallFight {
  siege: SiegeState;
  duel: DuelState;
  waveId: string;
}

export function fightOnWall(siege: SiegeState, rng: Rng): WallFight | null {
  if (!canFightOnWall(siege)) return null;
  const next = cloneSiege(siege);
  const assault = next.assault;
  if (assault === null || next.state === null) return null;

  const wave = assault.waves.find((entry) => entry.playerLed && !entry.spent && !entry.through && isDuelLayer(entry.layerId));
  if (wave === undefined) return null;

  assault.duelling = true;
  const layer = assaultLayerOf(wave.layerId);
  assault.log.push(`Ngài lên tới ${layer?.name.toLowerCase() ?? 'mặt tường'}. Chỗ này chỉ đủ cho hai người.`);

  const duel = createDuel(rng, {
    kindId: 'dau-sinh-tu',
    // Chỗ HẸP — xem chú thích đầu file. Đây không phải một chi tiết trang trí.
    arenaId: 'arena_cau-hep',
    a: playerOnWall(next.state),
    b: wallDefender(next),
    state: next.state,
    turn: next.turn,
    stakes: 'một chỗ đứng trên tường, và cả cuộc tổng công',
    setting: {
      place: `${layer?.name ?? 'mặt tường'} ${next.fort.name}`,
      weather: next.setting.weather,
      timeOfDay: 'rạng sáng',
      witnesses: 'cả hai đạo quân, từ hai phía của bức tường',
    },
  });

  return { siege: next, duel, waveId: wave.id };
}

export interface WallFightResult {
  siege: SiegeState;
  ops: PatchOp[];
  lines: string[];
}

/**
 * Người chơi giữ được chỗ đứng — hoặc bị hất xuống.
 *
 * Ba cửa ra, và chúng phải khác nhau THẬT:
 *   thắng   đợt của ngài qua được lớp ấy ngay, không cần thêm một cú tung nào
 *   hòa     đợt vẫn kẹt ở đó, và hiệp sau vẫn phải đánh
 *   gục     đợt mất người dẫn đầu và gãy — một cái thang không có ai trên đầu thì
 *           không ai ở dưới trèo lên nữa
 */
export function resolveWallFight(siege: SiegeState, duel: DuelState, waveId: string): WallFightResult {
  const next = cloneSiege(siege);
  const assault = next.assault;
  const lines: string[] = [];
  if (assault === null) return { siege: next, ops: [], lines };

  assault.duelling = false;
  const wave = assault.waves.find((entry) => entry.id === waveId);
  const player = duel.a;
  const playerWon = duel.winner === 'a';
  const playerDown = isDead(player) || isDown(player, duel.turn);

  if (wave !== undefined) {
    if (playerWon) {
      const path = pathAfter(next, wave);
      if (path === null) {
        wave.through = true;
        lines.push('Ngài đứng một mình trên lan can, và bên dưới là sân trong. Không còn gì chắn phía trước nữa.');
      } else {
        wave.layerId = path;
        lines.push(`Ngài hất được hắn xuống và giữ đủ lâu cho người sau lên. Đợt của ngài tràn tới ${path}.`);
      }
      next.attacker.morale = Math.min(100, next.attacker.morale + 8);
      next.defender.garrisonMorale = Math.max(0, next.defender.garrisonMorale - 10);
    } else if (playerDown) {
      wave.spent = true;
      lines.push('Ngài bị hất khỏi lan can. Cái thang phía dưới trống hẳn — không ai trèo lên một chỗ vừa có người rơi xuống.');
      next.attacker.morale = Math.max(0, next.attacker.morale - 12);
    } else {
      lines.push('Hai người rời nhau ra, không ai ngã. Ngài vẫn đứng đúng chỗ cũ, và hắn cũng thế.');
    }
  }

  for (const line of lines) {
    assault.log.push(line);
    next.log.push({ week: next.week, side: 'vay', text: line, major: true });
  }

  // Thương tích của người chơi đi qua MVU như mọi vết thương khác (R2). Phần 9 đã
  // tích sẵn chúng vào `duel.playerOps`; ở đây chỉ gộp thêm điểm thực hành.
  const ops: PatchOp[] = [...duel.playerOps, ...practiceOps(duel, 'a')];
  next.playerOps.push(...ops);
  return { siege: next, ops, lines };
}

function pathAfter(siege: SiegeState, wave: AssaultWave): string | null {
  const order = ['duoi-hao', 'chan-tuong', 'mat-tuong', 'san-trong', 'thap-chinh'];
  const index = order.indexOf(wave.layerId);
  void siege;
  return order[index + 1] ?? null;
}

/** Người chơi đã chết trên tường chưa — người gọi dùng để kết ván (mục 6). */
export function playerFellFromWall(duel: DuelState): boolean {
  return isDead(duel.a);
}
