import { addDays } from '@/core/clock';
import type { PatchOp } from '@/state/mvu-parse';
import type { GameState } from '@/state/slices';
import type { BattleState, SideId } from '@/minigames/battle';
import type { SiegeState } from '@/systems/siege';
import { characterOf } from '@/systems/character';
import { allHoldings, holdingsStateOf, type Holding } from '@/systems/holding';
import { militaryStateOf, type MilitarySliceState } from '@/systems/military';
import { realmStateOf } from '@/systems/realm';
import { campaignStateOf, withChronicle, type CampaignSliceState } from './slice';
import { captureObjective } from './conquest';

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value));
}

function survivalOf(battle: BattleState, side: SideId): number {
  const units = battle.units.filter((unit) => unit.side === side);
  const start = units.reduce((sum, unit) => sum + unit.maxStrength, 0);
  const alive = units.reduce((sum, unit) => sum + Math.max(0, unit.strength), 0);
  return start <= 0 ? 0 : clamp(alive / start, 0, 1);
}

function typeSurvivalOf(battle: BattleState, side: SideId): Map<string, number> {
  const rows = new Map<string, { start: number; alive: number }>();
  for (const unit of battle.units.filter((entry) => entry.side === side)) {
    const current = rows.get(unit.typeId) ?? { start: 0, alive: 0 };
    current.start += unit.maxStrength;
    current.alive += Math.max(0, unit.strength);
    rows.set(unit.typeId, current);
  }
  return new Map([...rows].map(([id, row]) => [id, row.start <= 0 ? 0 : clamp(row.alive / row.start, 0, 1)]));
}

function playerForceId(campaign: CampaignSliceState | null, military: MilitarySliceState): string {
  const mapped = campaign?.armies.find((army) =>
    army.factionId === campaign.playerFactionId && military.forces.some((force) => force.id === army.forceId),
  );
  return mapped?.forceId ?? military.forces.find((force) => force.kind === 'land' && force.units.some((unit) => unit.strength > 0))?.id ?? '';
}

function campaignAfterBattle(
  campaign: CampaignSliceState,
  forceId: string,
  playerTroops: number,
  playerRatio: number,
  enemyRatio: number,
  victory: boolean,
): CampaignSliceState {
  const playerArmy = campaign.armies.find((army) => army.forceId === forceId);
  if (playerArmy === undefined) return campaign;
  const enemies = campaign.armies.filter(
    (army) => army.nodeId === playerArmy.nodeId && army.factionId !== playerArmy.factionId,
  );
  const enemyIds = new Set(enemies.map((army) => army.id));
  const armies = campaign.armies
    .map((army) => {
      if (army.id === playerArmy.id) {
        return { ...army, troops: playerTroops, stance: 'dong-quan' as const, march: null };
      }
      if (!enemyIds.has(army.id)) return army;
      const troops = Math.max(0, Math.round(army.troops * enemyRatio));
      return { ...army, troops, stance: 'dong-quan' as const, march: null, siegeNodeId: '' };
    })
    .filter((army) => army.troops > 0);
  const lostShare = Math.round((1 - playerRatio) * 100);
  const line = victory
    ? `${playerArmy.name} thắng dã chiến tại vị trí đang đóng; còn ${String(playerTroops)} quân, tổn thất ${String(lostShare)}%.`
    : `${playerArmy.name} thua dã chiến; còn ${String(playerTroops)} quân và phải dừng hành quân.`;
  return withChronicle({ ...campaign, armies }, [line]);
}

function settleMilitaryBattle(
  state: GameState,
  battle: BattleState,
): { military: MilitarySliceState; forceId: string; troops: number } | null {
  const military = militaryStateOf(state);
  if (military === null || battle.aftermath === null) return null;
  const campaign = campaignStateOf(state);
  const forceId = playerForceId(campaign, military);
  if (forceId === '') return null;

  const overall = survivalOf(battle, battle.playerSide);
  const typeRatio = typeSurvivalOf(battle, battle.playerSide);
  const victory = battle.winner === battle.playerSide;
  const morale = battle.units
    .filter((unit) => unit.side === battle.playerSide && unit.strength > 0)
    .reduce((sum, unit, _index, rows) => sum + unit.morale / Math.max(1, rows.length), 0);

  const forces = military.forces.map((force) => {
    if (force.id !== forceId) return force;
    return {
      ...force,
      units: force.units
        .map((unit) => {
          const ratio = typeRatio.get(unit.typeId) ?? overall;
          return {
            ...unit,
            strength: Math.max(0, Math.round(unit.strength * ratio)),
            morale: clamp(unit.morale * 0.45 + morale * 0.55 + (victory ? 4 : -7)),
            experience: clamp(unit.experience + (victory ? 3 : 1)),
            training: clamp(unit.training + (victory ? 1 : -2)),
            monthlyUpkeep: Math.max(0, unit.monthlyUpkeep * ratio),
          };
        })
        .filter((unit) => unit.strength > 0),
    };
  });
  const troops = forces.find((force) => force.id === forceId)?.units.reduce((sum, unit) => sum + unit.strength, 0) ?? 0;
  const logistics = {
    ...military.logistics,
    forces: military.logistics.forces.map((status) =>
      status.forceId !== forceId
        ? status
        : {
            ...status,
            supplyLevel: clamp(status.supplyLevel - Math.max(4, battle.round * 0.8)),
            daysOfSupply: Math.max(0, status.daysOfSupply - Math.max(2, Math.ceil(battle.round / 2))),
            condition: status.supplyLevel < 35 ? ('thieu' as const) : status.condition,
            carried: status.carried.map((stock) => ({
              ...stock,
              amount: Math.max(0, stock.amount - stock.capacity * Math.min(0.55, battle.round * 0.015)),
            })),
          },
    ),
  };
  return { military: { ...military, forces, logistics }, forceId, troops };
}

/** Hệ quả dã chiến chảy về quân lực, hậu cần, kho bạc, nhân vật và chiến đồ. */
export function battleCampaignOps(state: GameState, battle: BattleState): PatchOp[] {
  if (!battle.finished || battle.aftermath === null) return [];
  const settled = settleMilitaryBattle(state, battle);
  if (settled === null) {
    const character = characterOf(state);
    if (character === null) return [];
    const spoils = battle.winner === battle.playerSide ? battle.aftermath.loot + battle.aftermath.ransom : 0;
    return [
      { op: 'set', path: 'character.resources.coins', to: Math.round(character.resources.coins + spoils * 0.2), reason: 'phần chiến lợi phẩm của nhân vật khi đi cùng quân đồng minh', source: 'json' },
      { op: 'set', path: 'character.resources.prestige', to: clamp(character.resources.prestige + battle.aftermath.reputation, -100, 1000), reason: 'uy tín sau dã chiến', source: 'json' },
    ];
  }
  const ops: PatchOp[] = [{
    op: 'set', path: 'military', to: settled.military,
    reason: 'thương vong, sĩ khí, kinh nghiệm và quân nhu sau dã chiến', source: 'json',
  }];
  const campaign = campaignStateOf(state);
  if (campaign !== null) {
    const mine = survivalOf(battle, battle.playerSide);
    const theirs = survivalOf(battle, battle.playerSide === 'a' ? 'b' : 'a');
    ops.push({
      op: 'set', path: 'campaign',
      to: campaignAfterBattle(campaign, settled.forceId, settled.troops, mine, theirs, battle.winner === battle.playerSide),
      reason: 'cập nhật quân số và vị trí đạo quân trên chiến đồ sau dã chiến', source: 'json',
    });
  }
  const character = characterOf(state);
  const spoils = battle.winner === battle.playerSide ? battle.aftermath.loot + battle.aftermath.ransom : 0;
  if (character !== null) {
    ops.push(
      { op: 'set', path: 'character.resources.coins', to: Math.round(character.resources.coins + spoils * 0.2), reason: 'phần chiến lợi phẩm của nhân vật', source: 'json' },
      { op: 'set', path: 'character.resources.prestige', to: clamp(character.resources.prestige + battle.aftermath.reputation, -100, 1000), reason: 'uy tín sau dã chiến', source: 'json' },
    );
  }
  const realm = realmStateOf(state);
  if (realm !== null && spoils > 0) {
    ops.push({ op: 'set', path: 'realm.treasury', to: realm.treasury + spoils * 0.8, reason: 'chiến lợi phẩm và tiền chuộc nhập kho', source: 'json' });
  }
  return ops;
}

function damagedHolding(holding: Holding, siege: SiegeState): Holding {
  const populationRatio = holding.population.total <= 0 ? 0 : clamp(siege.fort.population / holding.population.total, 0, 1);
  const wallRatio = siege.fort.outerWall.maxIntegrity <= 0
    ? 0
    : clamp(siege.fort.outerWall.integrity / siege.fort.outerWall.maxIntegrity, 0.15, 1);
  const buildingRatio = clamp(0.7 + wallRatio * 0.3, 0.55, 1);
  return {
    ...holding,
    besieged: false,
    stores: { ...holding.stores, 'luong-thuc': Math.max(0, siege.fort.supplies.food) },
    buildings: holding.buildings.map((building) => ({ ...building, integrity: Math.max(5, building.integrity * buildingRatio) })),
    population: {
      ...holding.population,
      total: siege.fort.population,
      morale: clamp(siege.defender.populationMorale),
      strata: holding.population.strata.map((row) => ({ ...row, people: row.people * populationRatio, morale: clamp(siege.defender.populationMorale) })),
      races: holding.population.races.map((row) => ({ ...row, people: row.people * populationRatio })),
    },
  };
}

/** Hệ quả công/thủ thành: thời gian, quân lực, kho bạc, thành trì và quyền kiểm soát đất. */
export function siegeCampaignOps(state: GameState, siege: SiegeState): PatchOp[] {
  if (!siege.finished) return [];
  const ops: PatchOp[] = [];
  const military = militaryStateOf(state);
  const campaign = campaignStateOf(state);
  let forceId = '';
  let troops = 0;
  if (military !== null && siege.playerSide === 'vay') {
    forceId = playerForceId(campaign, military);
    const ratio = siege.attacker.startTroops <= 0 ? 0 : clamp(siege.attacker.troops / siege.attacker.startTroops, 0, 1);
    const forces = military.forces.map((force) => force.id !== forceId ? force : ({
      ...force,
      units: force.units
        .map((unit) => ({
          ...unit,
          strength: Math.max(0, Math.round(unit.strength * ratio)),
          morale: clamp(unit.morale * 0.55 + siege.attacker.morale * 0.45 + (siege.winner === 'vay' ? 3 : -8)),
          experience: clamp(unit.experience + (siege.winner === 'vay' ? 3 : 1)),
          monthlyUpkeep: unit.monthlyUpkeep * ratio,
        }))
        .filter((unit) => unit.strength > 0),
    }));
    troops = forces.find((force) => force.id === forceId)?.units.reduce((sum, unit) => sum + unit.strength, 0) ?? 0;
    const logistics = {
      ...military.logistics,
      forces: military.logistics.forces.map((status) => status.forceId !== forceId ? status : ({
        ...status,
        supplyLevel: clamp(status.supplyLevel - Math.min(70, siege.week * 3)),
        daysOfSupply: Math.max(0, Math.floor(siege.attacker.supplies / Math.max(1, siege.attacker.troops) * 7)),
        condition: siege.attacker.supplies <= siege.attacker.troops ? ('thieu' as const) : status.condition,
      })),
    };
    ops.push({ op: 'set', path: 'military', to: { ...military, forces, logistics }, reason: 'hao quân và quân nhu sau cuộc vây hãm', source: 'json' });
    const realm = realmStateOf(state);
    if (realm !== null) {
      ops.push({ op: 'set', path: 'realm.treasury', to: Math.max(0, Math.min(realm.treasury, siege.attacker.treasury)), reason: 'chi phí quân lương, công binh và lính thuê trong cuộc vây hãm', source: 'json' });
    }
  }

  if (campaign !== null) {
    const playerArmy = campaign.armies.find((army) => army.forceId === forceId)
      ?? campaign.armies.find((army) => army.factionId === campaign.playerFactionId && army.siegeNodeId !== '');
    const mark = playerArmy === undefined
      ? campaign.sieges.find((row) => siege.playerSide === 'thu' && row.attackerId !== campaign.playerFactionId)
      : campaign.sieges.find((row) => row.nodeId === playerArmy.siegeNodeId || row.armyId === playerArmy.id);
    const targetId = playerArmy?.siegeNodeId ?? mark?.nodeId ?? '';
    let next = campaign;
    if (targetId !== '') {
      if (siege.playerSide === 'vay' && siege.winner === 'vay') {
        const factionId = playerArmy?.factionId ?? campaign.playerFactionId;
        const captured = captureObjective(next, targetId, factionId);
        next = captured.refused === '' ? captured.campaign : withChronicle(next, [`Thắng vây hãm nhưng chưa thể tiếp quản mục tiêu: ${captured.refused}.`]);
      } else if (siege.playerSide === 'thu' && siege.winner === 'vay' && mark !== undefined) {
        const captured = captureObjective(next, targetId, mark.attackerId);
        next = captured.refused === '' ? captured.campaign : next;
      } else {
        next = withChronicle({ ...next, sieges: next.sieges.filter((row) => row.nodeId !== targetId) }, [
          siege.playerSide === 'thu' ? 'Quân vây bị đẩy khỏi thành.' : 'Cuộc vây hãm thất bại; đạo quân rút khỏi chân thành.',
        ]);
      }
    }
    if (playerArmy !== undefined) {
      next = {
        ...next,
        armies: next.armies.map((army) => army.id === playerArmy.id
          ? { ...army, troops: troops || army.troops, stance: siege.winner === 'vay' && siege.playerSide === 'vay' ? ('chiem-dong' as const) : ('dong-quan' as const), siegeNodeId: '' }
          : army),
      };
    }
    ops.push({ op: 'set', path: 'campaign', to: next, reason: 'kết quả công thủ thành đổi quyền kiểm soát trên chiến đồ', source: 'json' });
  }

  const holdings = holdingsStateOf(state);
  const defended = allHoldings(state).find((holding) => holding.id === siege.fort.id);
  if (holdings !== null && defended !== undefined) {
    const list = siege.playerSide === 'thu' && siege.winner === 'vay'
      ? holdings.list.filter((holding) => holding.id !== defended.id)
      : holdings.list.map((holding) => holding.id === defended.id ? damagedHolding(holding, siege) : holding);
    ops.push({ op: 'set', path: 'holdings.list', to: list, reason: 'lương, dân số và công trình chịu hậu quả của cuộc vây hãm', source: 'json' });
  }
  ops.push({ op: 'set', path: 'meta.gameDate', to: addDays(state.meta.gameDate, Math.max(1, siege.week) * 7), reason: 'thời gian đã trôi qua trong cuộc vây hãm', source: 'json' });
  return ops;
}
