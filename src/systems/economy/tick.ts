import type { GameDate } from '@/core/clock';
import type { Rng } from '@/core/rng';
import type { PatchOp } from '@/state/mvu-parse';
import type { GameState } from '@/state/slices';
import { nationsStateOf } from '@/systems/nations/slice';
import { characterOf } from '@/systems/character';
import { realmStateOf } from '@/systems/realm';
import { advanceEconomyMonth, createEconomy } from './model';
import { economyStateOf } from './slice';

export interface EconomyTickResult {
  ops: PatchOp[];
  lines: string[];
}

/** Chuyển kết quả mô phỏng thuần thành lô MVU có compare-and-swap. */
export function runEconomyTick(state: GameState, rng: Rng, date: GameDate): EconomyTickResult {
  const nations = nationsStateOf(state);
  const economy = economyStateOf(state);
  if (nations === null || economy === null || nations.powers.length === 0) return { ops: [], lines: [] };

  const seeded = economy.markets.length === 0 ? createEconomy(nations) : economy;
  const result = advanceEconomyMonth(rng, seeded, nations, date);
  const ops: PatchOp[] = [
    {
      op: 'set',
      path: 'economy',
      from: economy,
      to: result.economy,
      reason: `mô phỏng kinh tế tháng ${String(date.month)}/${String(date.year)}`,
      source: 'json',
    },
    {
      op: 'set',
      path: 'nations',
      from: nations,
      to: result.nations,
      reason: 'thuế, chi tiêu, nợ và khủng hoảng cập nhật quốc lực',
      source: 'json',
    },
  ];
  const character = characterOf(state);
  const realm = realmStateOf(state);
  const playerMarket = result.economy.markets.find((market) => market.powerId === character?.allegiance.nationId);
  const lines = [...result.lines];
  if (realm !== null && realm.id !== '' && playerMarket !== undefined) {
    const share = Math.max(-realm.treasury, Math.min(800, playerMarket.ledger.net * 0.05));
    ops.push({
      op: 'set',
      path: 'realm',
      from: realm,
      to: { ...realm, treasury: realm.treasury + share },
      reason: 'phần thu chi kinh tế chuyển vào kho cai trị địa phương',
      source: 'json',
    });
    lines.push(`[kinh tế] Kho cai trị ${share >= 0 ? 'nhận' : 'bù'} ${String(Math.abs(Math.round(share)))} đồng từ cân đối tháng.`);
  }
  return {
    ops,
    lines,
  };
}
