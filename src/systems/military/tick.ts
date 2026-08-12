import type { GameDate } from '@/core/clock';
import type { PatchOp } from '@/state/mvu-parse';
import type { GameState } from '@/state/slices';
import { realmStateOf } from '@/systems/realm/slice';
import { advanceMilitaryMonth, militaryResourcesOf } from './recruitment';
import { militaryStateOf } from './slice';

export interface MilitaryTickResult {
  ops: PatchOp[];
  lines: string[];
}

/** Cho quân phí, tuyển mộ và tiếp tế chạy khi thời gian truyện bước sang tháng. */
export function runMilitaryMonthTick(state: GameState, date: GameDate): MilitaryTickResult {
  const military = militaryStateOf(state);
  const realm = realmStateOf(state);
  if (military === null || realm === null || realm.id === '') return { ops: [], lines: [] };
  const active = military.recruitment.length > 0 || military.forces.some((force) => force.units.some((unit) => unit.strength > 0));
  if (!active) return { ops: [], lines: [] };

  const result = advanceMilitaryMonth(military, realm.treasury, {
    resources: militaryResourcesOf(state),
    date,
  });
  return {
    ops: [
      {
        op: 'set',
        path: 'military',
        from: military,
        to: result.military,
        reason: `quân phí, tuyển mộ và hậu cần tháng ${String(date.month)}/${String(date.year)}`,
        source: 'json',
      },
      {
        op: 'set',
        path: 'realm',
        from: realm,
        to: { ...realm, treasury: result.treasury },
        reason: 'chi quân phí, mua quân nhu và vận chuyển tiếp tế',
        source: 'json',
      },
    ],
    lines: result.lines.map((line) => `[quân lực] ${line}`),
  };
}
