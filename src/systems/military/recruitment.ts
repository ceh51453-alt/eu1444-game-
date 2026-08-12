import { allUnitTypes, unitTypeOf, type UnitType } from '@/minigames/battle/data';
import { allHoldings } from '@/systems/holding/slice';
import { realmStateOf, vassalsStateOf } from '@/systems/realm/slice';
import type { GameDate } from '@/core/clock';
import type { GameState } from '@/state/slices';
import type {
  ForceKind,
  MilitaryForce,
  MilitaryResources,
  MilitarySummary,
  RecruitmentRequester,
  RecruitmentSource,
} from './types';
import type { MilitarySliceState } from './slice';
import { advanceLogisticsMonth, type LogisticsMonthContext } from './logistics';

export interface RecruitmentOption {
  type: UnitType;
  source: RecruitmentSource;
  forceKind: ForceKind;
  months: number;
  moneyPerCompany: number;
  logisticsPerCompany: number;
  manpowerPerCompany: number;
}

export interface RecruitInput {
  typeId: string;
  source: RecruitmentSource;
  companies: number;
  destinationId?: string;
  requestedBy: RecruitmentRequester;
  date: GameDate;
}

export interface RecruitResult {
  ok: boolean;
  military: MilitarySliceState;
  treasury: number;
  line: string;
}

export interface MilitaryMonthResult {
  military: MilitarySliceState;
  treasury: number;
  lines: string[];
  upkeepPaid: number;
  logisticsPaid: number;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, value));
}

/** Hải quân chưa đi vào minigame dã chiến, nên giữ danh mục hẹp tại tầng quân lực. */
const NAVAL_TYPES: readonly UnitType[] = [
  {
    id: 'naval_thuyen-van-tai',
    name: 'Đội thuyền vận tải thuê',
    factions: ['*'],
    races: [],
    tags: ['hai-quan', 'thue-ngoai'],
    standardStrength: 40,
    quality: 2,
    attack: 1,
    defence: 2,
    armor: 0,
    rangeMeters: 0,
    ammo: 0,
    speedMeters: 100,
    initiative: 0,
    moraleBase: 52,
    formations: ['hang-ngang'],
    upkeep: 8,
    hire: 60,
    requires: 'Hợp đồng với chủ thuyền ở một bến sông hoặc cảng biển.',
    note: 'Chở quân và lương; không phải chiến thuyền tuyến đầu.',
  },
  {
    id: 'naval_thuyen-chien',
    name: 'Chiến thuyền đánh thuê',
    factions: ['*'],
    races: [],
    tags: ['hai-quan', 'thue-ngoai'],
    standardStrength: 80,
    quality: 3,
    attack: 5,
    defence: 4,
    armor: 1,
    rangeMeters: 100,
    ammo: 6,
    speedMeters: 120,
    initiative: 1,
    moraleBase: 60,
    formations: ['hang-ngang'],
    upkeep: 16,
    hire: 140,
    requires: 'Hợp đồng hải quân và đủ hậu cần để nuôi thủy thủ quanh năm.',
    note: 'Một đoàn chiến thuyền nhỏ cùng thủy thủ và quân chèo.',
  },
];

export function recruitableTypeOf(id: string): UnitType | null {
  return unitTypeOf(id) ?? NAVAL_TYPES.find((type) => type.id === id) ?? null;
}

function forceKindOf(type: UnitType): ForceKind {
  return type.tags.includes('hai-quan') ? 'navy' : 'land';
}

function weighted(forces: readonly MilitaryForce[], field: 'morale' | 'experience' | 'training'): number {
  let total = 0;
  let points = 0;
  for (const force of forces) {
    for (const unit of force.units) {
      total += unit.strength;
      points += unit.strength * unit[field];
    }
  }
  return total <= 0 ? 0 : points / total;
}

export function summaryOf(military: MilitarySliceState): MilitarySummary {
  const activeForces = military.forces.filter((force) => force.units.some((unit) => unit.strength > 0));
  let landTroops = 0;
  let navyPersonnel = 0;
  let monthlyUpkeep = 0;
  let logisticsUsed = 0;
  let manpowerUsed = 0;

  for (const force of military.forces) {
    for (const unit of force.units) {
      if (force.kind === 'land') landTroops += unit.strength;
      else navyPersonnel += unit.strength;
      monthlyUpkeep += unit.monthlyUpkeep;
      logisticsUsed += unit.strength * (0.5 + unit.training / 200);
      if (unit.source !== 'mercenary') manpowerUsed += unit.strength;
    }
  }

  return {
    totalTroops: landTroops + navyPersonnel,
    landTroops,
    navyPersonnel,
    armies: activeForces.filter((force) => force.kind === 'land').length,
    fleets: activeForces.filter((force) => force.kind === 'navy').length,
    morale: weighted(military.forces, 'morale'),
    experience: weighted(military.forces, 'experience'),
    training: weighted(military.forces, 'training'),
    monthlyUpkeep,
    logisticsUsed,
    manpowerUsed,
    queuedTroops: military.recruitment.reduce((sum, order) => sum + order.strength, 0),
  };
}

/**
 * Cầu nối quân sự đọc ba nguồn mà bản thân lãnh thổ không được đọc thẳng:
 * dân và công trình ở thành trì, đường sá và chư hầu ở tầng cai trị.
 */
export function militaryResourcesOf(state: GameState): MilitaryResources {
  const holdings = allHoldings(state);
  const realm = realmStateOf(state);
  const vassals = vassalsStateOf(state);
  const population = Math.round(holdings.reduce((sum, holding) => sum + holding.population.total, 0));
  const barracksRows = holdings.flatMap((holding) =>
    holding.buildings.filter((building) => building.buildingId === 'bld_doanh-trai' && building.integrity >= 40),
  );
  const armouries = holdings.flatMap((holding) =>
    holding.buildings.filter((building) => building.buildingId === 'bld_kho-vu-khi' && building.integrity >= 40),
  );
  const barracksCapacity = Math.round(
    barracksRows.reduce((sum, building) => sum + 180 * building.quality * (building.integrity / 100), 0),
  );
  const roadCapacity = (realm?.provinces ?? []).reduce((sum, province) => sum + province.roads * 35, 0);
  const logisticsCapacity = Math.round(100 + barracksCapacity * 1.5 + armouries.length * 220 + roadCapacity);
  const depotHoldings = holdings.filter((holding) =>
    holding.seat || holding.buildings.some((building) =>
      (building.buildingId === 'bld_kho-vu-khi' || building.buildingId === 'bld_doanh-trai') && building.integrity >= 40,
    ),
  );
  const depotSites = depotHoldings.map((holding) => {
    const logisticsBuildings = holding.buildings.filter((building) =>
      building.buildingId === 'bld_kho-vu-khi' || building.buildingId === 'bld_doanh-trai',
    );
    const buildingCapacity = logisticsBuildings.reduce(
      (sum, building) => sum + 120 * building.quality * (building.integrity / 100),
      0,
    );
    const condition = logisticsBuildings.length === 0
      ? 65
      : logisticsBuildings.reduce((sum, building) => sum + building.integrity, 0) / logisticsBuildings.length;
    return {
      id: `depot_${holding.id}`,
      name: `Kho ${holding.name}`,
      capacity: Math.round(180 + buildingCapacity + holding.population.total * 0.02),
      condition: Math.round(condition),
      besieged: holding.besieged,
    };
  });
  const levyFloor = Math.round((vassals?.list ?? []).reduce((sum, vassal) => sum + vassal.levyMen, 0) * 0.35);
  const manpowerCapacity = Math.max(population > 0 ? Math.round(population * 0.18) : 0, levyFloor);

  return {
    population,
    manpowerCapacity,
    logisticsCapacity,
    barracks: barracksRows.length,
    barracksCapacity,
    roadCapacity,
    depotSites,
  };
}

export function sourceFor(type: UnitType): RecruitmentSource {
  if (type.tags.includes('dan-quan')) return 'levy';
  if (type.tags.includes('thue-ngoai')) return 'mercenary';
  return 'barracks';
}

export function recruitmentOption(type: UnitType, source = sourceFor(type)): RecruitmentOption {
  const companies = 1;
  const moneyFactor = source === 'levy' ? 0.35 : source === 'mercenary' ? 1 : 1.25;
  return {
    type,
    source,
    forceKind: forceKindOf(type),
    months: source === 'mercenary' ? 1 : source === 'levy' ? 1 : Math.max(2, type.quality),
    moneyPerCompany: Math.max(1, Math.round(type.hire * moneyFactor * companies)),
    logisticsPerCompany: Math.round(type.standardStrength * (0.5 + type.quality * 0.12)),
    manpowerPerCompany: source === 'mercenary' ? 0 : type.standardStrength,
  };
}

export function recruitmentOptions(faction = ''): RecruitmentOption[] {
  const folded = faction.replace(/^nation_/, '');
  const aliases = new Set([faction, folded, folded === 'hre' ? 'de-quoc' : folded]);
  return [...allUnitTypes(), ...NAVAL_TYPES]
    .filter((type) => type.factions.includes('*') || type.factions.some((entry) => aliases.has(entry)))
    .filter((type) => type.hire > 0 || type.tags.includes('dan-quan'))
    .map((type) => recruitmentOption(type))
    .sort((left, right) => left.source.localeCompare(right.source) || left.type.quality - right.type.quality);
}

function ensureForce(
  military: MilitarySliceState,
  kind: ForceKind,
  destinationId = '',
): { military: MilitarySliceState; forceId: string } {
  const requested = military.forces.find((force) => force.id === destinationId && force.kind === kind);
  if (requested !== undefined) return { military, forceId: requested.id };
  const existing = military.forces.find((force) => force.kind === kind);
  if (existing !== undefined) return { military, forceId: existing.id };

  const id = `${kind === 'land' ? 'army' : 'fleet'}_${String(military.nextForceNo)}`;
  const name = kind === 'land' ? `Đạo quân ${String(military.nextForceNo)}` : `Hạm đội ${String(military.nextForceNo)}`;
  return {
    forceId: id,
    military: {
      ...military,
      nextForceNo: military.nextForceNo + 1,
      forces: [
        ...military.forces,
        { id, name, kind, commander: '', location: kind === 'land' ? 'tòa chính' : 'bến gần nhất', units: [] },
      ],
    },
  };
}

export function recruitUnit(
  current: MilitarySliceState,
  treasury: number,
  resources: MilitaryResources,
  input: RecruitInput,
): RecruitResult {
  const type = recruitableTypeOf(input.typeId);
  if (type === null) return { ok: false, military: current, treasury, line: `Không có binh chủng ${input.typeId}.` };
  const naturalSource = sourceFor(type);
  if (naturalSource !== input.source) {
    return { ok: false, military: current, treasury, line: `${type.name} phải tuyển qua nguồn ${naturalSource}.` };
  }

  const companies = Math.max(1, Math.min(20, Math.round(input.companies)));
  const option = recruitmentOption(type, input.source);
  const moneyCost = option.moneyPerCompany * companies;
  const logisticsCost = option.logisticsPerCompany * companies;
  const manpowerCost = option.manpowerPerCompany * companies;
  const strength = type.standardStrength * companies;
  const summary = summaryOf(current);
  const queuedManpower = current.recruitment.reduce((sum, order) => sum + order.manpowerCost, 0);
  const queuedLogistics = current.recruitment.reduce((sum, order) => sum + order.logisticsCost, 0);

  if (input.source === 'barracks' && resources.barracks <= 0) {
    return { ok: false, military: current, treasury, line: `${type.name} cần một doanh trại còn hoạt động.` };
  }
  if (input.source === 'barracks') {
    const barracksQueued = current.recruitment
      .filter((order) => order.source === 'barracks')
      .reduce((sum, order) => sum + order.strength, 0);
    if (barracksQueued + strength > resources.barracksCapacity) {
      return { ok: false, military: current, treasury, line: 'Doanh trại không còn đủ sức chứa cho đợt huấn luyện này.' };
    }
  }
  if (summary.manpowerUsed + queuedManpower + manpowerCost > resources.manpowerCapacity) {
    return { ok: false, military: current, treasury, line: 'Không đủ nhân lực khả dụng để tuyển đợt quân này.' };
  }
  if (summary.logisticsUsed + queuedLogistics + logisticsCost > resources.logisticsCapacity) {
    return { ok: false, military: current, treasury, line: 'Hậu cần không đủ sức nuôi và trang bị thêm quân.' };
  }
  if (treasury < moneyCost) {
    return { ok: false, military: current, treasury, line: `Cần ${String(moneyCost)} đồng, kho bạc chỉ còn ${String(Math.round(treasury))}.` };
  }

  const forceKind = forceKindOf(type);
  const withForce = ensureForce(current, forceKind, input.destinationId);
  const orderNo = withForce.military.nextOrderNo;
  const order = {
    id: `recruit_${String(orderNo)}`,
    typeId: type.id,
    unitName: type.name,
    source: input.source,
    forceKind,
    companies,
    strength,
    destinationId: withForce.forceId,
    monthsTotal: option.months,
    monthsLeft: option.months,
    moneyCost,
    logisticsCost,
    manpowerCost,
    monthlyUpkeep: type.upkeep * companies,
    requestedBy: input.requestedBy,
    requestedOn: { ...input.date },
  } as const;

  return {
    ok: true,
    treasury: treasury - moneyCost,
    military: {
      ...withForce.military,
      nextOrderNo: orderNo + 1,
      recruitment: [...withForce.military.recruitment, order],
    },
    line: `Đã ghi danh ${String(strength)} ${type.name}; cần ${String(option.months)} tháng, tốn ${String(moneyCost)} đồng.`,
  };
}

function finishOrder(military: MilitarySliceState, order: MilitarySliceState['recruitment'][number]): MilitarySliceState {
  const type = recruitableTypeOf(order.typeId);
  const morale = type?.moraleBase ?? 50;
  const experience = order.source === 'mercenary' ? 45 : order.source === 'levy' ? 5 : 12;
  const training = order.source === 'mercenary' ? 65 : order.source === 'levy' ? 18 : 45 + (type?.quality ?? 1) * 7;
  const unitNo = military.nextUnitNo;
  const unit = {
    id: `cohort_${String(unitNo)}`,
    typeId: order.typeId,
    name: order.unitName,
    source: order.source,
    strength: order.strength,
    morale,
    experience,
    training: clamp(training),
    monthlyUpkeep: order.monthlyUpkeep,
  };

  return {
    ...military,
    nextUnitNo: unitNo + 1,
    forces: military.forces.map((force) =>
      force.id === order.destinationId ? { ...force, units: [...force.units, unit] } : force,
    ),
  };
}

export function advanceMilitaryMonth(
  current: MilitarySliceState,
  treasury: number,
  context: LogisticsMonthContext = {},
): MilitaryMonthResult {
  const lines: string[] = [];
  let military: MilitarySliceState = structuredClone(current);
  const upkeep = summaryOf(military).monthlyUpkeep;
  const paid = Math.min(treasury, upkeep);
  treasury -= paid;
  const fullyPaid = paid >= upkeep;

  military.forces = military.forces.map((force) => ({
    ...force,
    units: force.units
      .map((unit) => {
        const mercenaryDesertion = !fullyPaid && unit.source === 'mercenary' ? Math.max(1, Math.round(unit.strength * 0.18)) : 0;
        return {
          ...unit,
          strength: Math.max(0, unit.strength - mercenaryDesertion),
          morale: clamp(unit.morale + (fullyPaid ? 1 : -12)),
          training: clamp(unit.training + (fullyPaid ? 1.5 : -2)),
          experience: clamp(unit.experience + (fullyPaid ? 0.25 : 0)),
        };
      })
      .filter((unit) => unit.strength > 0),
  }));

  if (upkeep > 0) {
    lines.push(
      fullyPaid
        ? `Đã trả ${String(Math.round(upkeep))} đồng quân phí trong tháng.`
        : `Thiếu quân phí: chỉ trả ${String(Math.round(paid))}/${String(Math.round(upkeep))} đồng; sĩ khí giảm và lính đánh thuê bỏ đi.`,
    );
  }

  const supplied = advanceLogisticsMonth(military, treasury, context);
  military = supplied.military;
  treasury = supplied.treasury;
  lines.push(...supplied.lines);

  const progressed = military.recruitment.map((order) => {
    const supply = military.logistics.forces.find((status) => status.forceId === order.destinationId);
    if ((supply?.supplyLevel ?? 100) < 55) {
      lines.push(`${order.unitName} tạm ngừng huấn luyện vì doanh trại không nhận đủ quân nhu.`);
      return order;
    }
    return { ...order, monthsLeft: order.monthsLeft - 1 };
  });
  const completed = progressed.filter((order) => order.monthsLeft <= 0);
  for (const order of completed) {
    military = finishOrder(military, { ...order, monthsLeft: 1 });
    lines.push(`${String(order.strength)} ${order.unitName} đã huấn luyện xong và nhập ${order.destinationId}.`);
  }
  military.recruitment = progressed.filter((order) => order.monthsLeft > 0);
  if (lines.length === 0) lines.push('Tháng này quân đội không có biến động đáng kể.');
  military.lastMonthlyReport = lines;

  return {
    military,
    treasury,
    lines,
    upkeepPaid: paid,
    logisticsPaid: supplied.procurementCost + supplied.transportCost,
  };
}
