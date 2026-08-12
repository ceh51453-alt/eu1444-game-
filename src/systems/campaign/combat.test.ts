import { describe, expect, it } from 'vitest';
import { createRng } from '@/core/rng';
import type { GameState } from '@/state/slices';
import { autoBattle, settleAftermath } from '@/minigames/battle';
import { createHolding, holdingsSliceSchema } from '@/systems/holding';
import { militarySliceSchema } from '@/systems/military';
import { createFieldBattle } from '@/ui/battle';
import { createCastleSiege } from '@/ui/siege';
import { emptyCampaign, nodesAtLevel } from './index';
import { battleCampaignOps } from './combat';

const DATE = { year: 1444, month: 11, day: 30, hour: 6 } as const;

function military() {
  return militarySliceSchema.parse({
    forces: [{
      id: 'force_1',
      name: 'Đạo quân thử nghiệm',
      kind: 'land',
      commander: 'An',
      location: 'chiến đồ',
      units: [
        { id: 'unit_1', typeId: 'unit_bo-binh-thue', name: 'Bộ binh', source: 'mercenary', strength: 360, morale: 70, experience: 30, training: 50, monthlyUpkeep: 40 },
        { id: 'unit_2', typeId: 'unit_cung-thu', name: 'Cung thủ', source: 'barracks', strength: 140, morale: 65, experience: 25, training: 55, monthlyUpkeep: 24 },
      ],
    }],
  });
}

function battleState(): GameState {
  const node = nodesAtLevel(3).find((row) => !row.water) ?? nodesAtLevel(3)[0];
  if (node === undefined) throw new Error('bản đồ không có huyện để thử');
  return {
    meta: { turn: 4, seed: 'ket-noi', gameDate: DATE, rng: { streams: {} } },
    military: military(),
    campaign: {
      ...emptyCampaign(),
      playerFactionId: 'phe_thu-nghiem',
      armies: [
        { id: 'army_1', name: 'Đạo quân thử nghiệm', factionId: 'phe_thu-nghiem', forceId: 'force_1', troops: 500, nodeId: node.id, stance: 'dong-quan', march: null, siegeNodeId: '' },
        { id: 'army_2', name: 'Quân đối phương', factionId: 'phe_doi-phuong', forceId: '', troops: 460, nodeId: node.id, stance: 'dong-quan', march: null, siegeNodeId: '' },
      ],
    },
  } as unknown as GameState;
}

describe('cầu nối mini game với ván chơi', () => {
  it('dã chiến lấy đúng quân số thật và trả thương vong về quân lực lẫn chiến đồ', () => {
    const state = battleState();
    const rng = createRng('danh-that');
    const opened = createFieldBattle(state, rng, state.meta.turn);
    const initial = opened.units.filter((unit) => unit.side === 'a').reduce((sum, unit) => sum + unit.maxStrength, 0);
    expect(initial).toBeGreaterThanOrEqual(495);
    expect(initial).toBeLessThanOrEqual(505);

    const finished = settleAftermath(autoBattle(opened, rng), rng);
    const ops = battleCampaignOps(state, finished);
    const militaryOp = ops.find((op) => op.path === 'military' && op.op === 'set');
    const campaignOp = ops.find((op) => op.path === 'campaign' && op.op === 'set');
    expect(militaryOp).toBeDefined();
    expect(campaignOp).toBeDefined();
    const nextMilitary = militaryOp?.op === 'set' ? militarySliceSchema.parse(militaryOp.to) : military();
    const survivors = nextMilitary.forces[0]?.units.reduce((sum, unit) => sum + unit.strength, 0) ?? 0;
    expect(survivors).toBeLessThanOrEqual(500);
  });

  it('thủ thành dùng đúng công sự, dân và kho lương mà người chơi đã xây', () => {
    const holding = createHolding(createRng('thanh-that'), {
      slug: 'thanh-thu-nghiem',
      name: 'Tân Thành',
      path: 'phat-trien',
      turn: 3,
      population: 420,
      seat: true,
      stores: { 'luong-thuc': 1350, go: 80, da: 60 },
    });
    const state = {
      meta: { turn: 4, seed: 'thu-thanh', gameDate: DATE, rng: { streams: {} } },
      military: military(),
      holdings: holdingsSliceSchema.parse({ list: [holding], viewing: holding.id }),
      campaign: emptyCampaign(),
    } as unknown as GameState;
    const siege = createCastleSiege(state, createRng('thu-thanh'), 4, 'thu');
    expect(siege.playerSide).toBe('thu');
    expect(siege.fort.id).toBe(holding.id);
    expect(siege.fort.name).toBe(holding.name);
    expect(siege.fort.population).toBe(420);
    expect(siege.fort.supplies.food).toBe(1350);
  });
});
