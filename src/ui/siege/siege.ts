/** Dựng công/thủ thành từ quân lực, hậu cần, kho bạc, chiến đồ và thành trì thật. */
import type { Rng } from '@/core/rng';
import type { GameState } from '@/state/slices';
import { characterOf } from '@/systems/character';
import { allHoldings, fortificationFromHolding } from '@/systems/holding';
import { militaryStateOf, type MilitaryForce } from '@/systems/military';
import { realmStateOf } from '@/systems/realm';
import {
  campaignNode,
  campaignStateOf,
} from '@/systems/campaign';
import { createSiege, type BesiegerSetup, type FortSetup, type SiegeSide, type SiegeState } from '@/systems/siege';

function seasonFor(month: number): string {
  if (month >= 3 && month <= 5) return 'xuan';
  if (month >= 6 && month <= 8) return 'ha';
  if (month >= 9 && month <= 11) return 'thu';
  return 'dong';
}

function templateFor(rank: number): string {
  if (rank >= 5) return 'fort_dai-thanh';
  if (rank >= 4) return 'fort_thanh-tri-kep';
  if (rank >= 3) return 'fort_lau-dai-da';
  if (rank >= 2) return 'fort_thap-canh';
  return 'fort_dinh-lang';
}

/**
 * Đạo quân vây, dựng từ quân lực và hậu cần THẬT khi có.
 *
 * `force` là một đạo quân trong slice `military` — có từng đơn vị, từng nguồn
 * lính, từng ngày lương trong xe. Quân của AI thì không: chiến đồ chỉ giữ một
 * con số `troops`, nên khi `force` vắng mặt, mọi thứ dưới đây suy ra từ chính
 * con số ấy theo tỉ lệ chuẩn. `knownTroops` vì thế BẮT BUỘC là một con số có
 * thật trong state — bản trước truyền thẳng hằng 2000 vào đây.
 */
function armySetup(state: GameState, force: MilitaryForce | undefined, knownTroops: number, enemy = false): BesiegerSetup {
  const troops = force?.units.reduce((sum, unit) => sum + unit.strength, 0) ?? knownTroops;
  const count = (source: string): number => force?.units
    .filter((unit) => unit.source === source)
    .reduce((sum, unit) => sum + unit.strength, 0) ?? 0;
  const logistics = force === undefined
    ? null
    : militaryStateOf(state)?.logistics.forces.find((status) => status.forceId === force.id) ?? null;
  const food = logistics?.carried.find((stock) => stock.supplyId === 'luong-thuc')?.amount;
  const character = characterOf(state);
  const realm = realmStateOf(state);
  return {
    name: force?.name ?? (enemy ? 'Đạo quân xâm lược' : 'Đạo quân vây'),
    commanderName: force?.commander || (enemy ? 'Chủ soái đối phương' : character?.identity.name || 'Chủ soái'),
    troops: Math.max(1, troops),
    levy: force === undefined ? Math.round(troops * 0.5) : count('levy'),
    mercenary: force === undefined ? Math.round(troops * 0.3) : count('mercenary'),
    retinue: force === undefined ? Math.round(troops * 0.2) : count('barracks'),
    treasury: enemy ? Math.max(1200, troops * 1.5) : Math.max(0, realm?.treasury ?? character?.resources.coins ?? 1200),
    supplies: Math.max(troops, food ?? troops * Math.max(2, (logistics?.daysOfSupply ?? 21) / 7)),
    engines: ['engine_thang', 'engine_xe-huc'],
    minerRaceId: 'race_lun-nui',
  };
}

export function createCastleSiege(
  state: GameState,
  rng: Rng,
  turn: number,
  playerSide: SiegeSide = 'vay',
): SiegeState {
  const character = characterOf(state);
  const name = character?.identity.name ?? '';
  const military = militaryStateOf(state);
  const campaign = campaignStateOf(state);
  const activeArmy = campaign?.armies.find((army) =>
    army.factionId === campaign.playerFactionId && army.siegeNodeId !== '' && army.forceId !== '',
  );
  const land = military?.forces.find((force) => force.id === activeArmy?.forceId)
    ?? military?.forces.find((force) => force.kind === 'land' && force.units.some((unit) => unit.strength > 0));
  const mappedArmy = campaign?.armies.find((army) => army.forceId === land?.id);
  const activeMark = playerSide === 'vay'
    ? campaign?.sieges.find((mark) => mark.armyId === mappedArmy?.id || mark.nodeId === mappedArmy?.siegeNodeId)
    : campaign?.sieges.find((mark) => mark.attackerId !== campaign.playerFactionId);
  const targetId = mappedArmy?.siegeNodeId || activeMark?.nodeId || '';
  const target = targetId === '' ? null : campaignNode(targetId);
  const owned = allHoldings(state);
  const defended = owned.find((holding) => holding.seat) ?? owned[0];

  const fort: FortSetup | ReturnType<typeof fortificationFromHolding> = playerSide === 'thu' && defended !== undefined
    ? fortificationFromHolding(defended)
    : {
        templateId: templateFor(target?.fort ?? 3),
        id: target?.id ?? 'hold_muc-tieu-chien-dich',
        name: target?.siteName || target?.name || 'Thành trì đối phương',
      };
  const defenderName = playerSide === 'thu' && defended !== undefined
    ? defended.name
    : target?.siteName || target?.name || 'Thành trì đối phương';
  const defenderTroops = Array.isArray(fort.garrison)
    ? fort.garrison.reduce((sum, unit) => sum + unit.men, 0)
    : Math.max(300, (target?.fort ?? 2) * 220);
  // Bên VÂY khi người chơi cầm quân: đọc `military` thật, không có thì lấy con
  // số ước lượng của chính đạo quân ấy trên chiến đồ. Bên vây khi người chơi
  // THỦ là quân AI — chiến đồ không giữ danh sách đơn vị của chúng, nên quy mô
  // suy từ đồn trú đang có, và điều đó được khai ở `armySetup`.
  const attacker = playerSide === 'vay'
    ? armySetup(state, land, Math.max(1, mappedArmy?.troops ?? activeArmy?.troops ?? 1))
    : armySetup(state, undefined, Math.max(600, defenderTroops * 2), true);

  return createSiege(rng, {
    fort,
    attacker,
    defender: {
      name: defenderName,
      commanderName: playerSide === 'thu' ? (name || 'Chỉ huy đồn trú') : 'Chỉ huy đồn trú đối phương',
      reliefHope: playerSide === 'thu',
    },
    playerSide,
    seasonId: seasonFor(state.meta.gameDate.month),
    reliefPossible: true,
    state,
    turn,
    stakes: target === null ? 'quyền kiểm soát thành trì và con đường tiếp tế quanh nó' : `quyền kiểm soát ${target.siteName || target.name} trên chiến đồ`,
    setting: {
      place: target?.name ?? defended?.name ?? 'vùng thành lũy',
      witnesses: name === '' ? 'dân trong thành và binh sĩ hai bên' : `dân trong thành, binh sĩ hai bên và những người biết mặt ${name}`,
    },
  });
}
