/** Cầu nối UI từ một vụ án cấp lãnh thổ sang minigame quyết đấu. */

import type { Rng } from '@/core/rng';
import type { GameState } from '@/state/slices';
import { carry, type CarriedGear } from '@/systems/character/gear';
import { emptyStatBlock } from '@/systems/character/stats';
import {
  DEFAULT_DOCTRINE,
  createDuel,
  type DuelState,
  type FighterSpec,
} from '@/minigames/duel';
import type { JudicialDuelRequest } from '@/systems/realm';

function courtFighter(id: string, name: string): FighterSpec {
  const gear: CarriedGear[] = [];
  for (const itemId of ['item_kiem-mot-tay', 'item_ao-lot-giap']) {
    const item = carry(itemId);
    if (item !== null) gear.push(item);
  }
  return {
    id,
    name,
    description: 'một bên đương sự đã tuyên thệ nhận kết quả trận đấu làm phán quyết',
    relation: 'đương sự trước tòa',
    stats: { ...emptyStatBlock(10), str: 11, agi: 11, vit: 12, wil: 12 },
    skills: { 'skill_kiem-thuat': 35, skill_khien: 20, 'skill_tay-khong': 20 },
    gear,
    doctrine: DEFAULT_DOCTRINE,
  };
}

export function createJudicialDuel(
  request: JudicialDuelRequest,
  state: GameState,
  rng: Rng,
  turn: number,
): DuelState {
  return createDuel(rng, {
    id: `duel_${request.caseId}`,
    kindId: request.kind,
    arenaId: request.arenaId,
    a: courtFighter(request.challengerId, request.challengerName),
    b: courtFighter(request.defenderId, request.defenderName),
    state,
    turn,
    stakes: 'kết quả trận đấu là phán quyết có hiệu lực của vụ án',
    setting: {
      place: 'sân đấu của tòa lãnh chúa',
      timeOfDay: 'giữa ban ngày',
      witnesses: 'quan tòa, chư hầu và dân trong vùng',
    },
  });
}
