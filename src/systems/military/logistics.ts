import type { GameDate } from '@/core/clock';
import { unitTypeOf } from '@/minigames/battle/data';
import { logisticsConfig, supplyTypeOf, supplyTypes, terrainFactor, transportProfile } from './logistics-data';
import type { MilitarySliceState } from './slice';
import type {
  ForceLogistics,
  LogisticsDepot,
  LogisticsState,
  MilitaryResources,
  RationPolicy,
  SupplyAmount,
  SupplyCondition,
  SupplyRoute,
  SupplyStock,
  TransportMode,
} from './types';

export interface LogisticsMonthContext {
  resources?: MilitaryResources;
  date?: GameDate;
  /** 0 là đóng quân, 1 là chiến dịch liên tục. */
  campaignIntensity?: number;
}

export interface LogisticsMonthResult {
  military: MilitarySliceState;
  treasury: number;
  lines: string[];
  procurementCost: number;
  transportCost: number;
}

export interface LogisticsSummary {
  depotStock: number;
  depotCapacity: number;
  reservePercent: number;
  averageSupply: number;
  forcesStrained: number;
  forcesCutOff: number;
  routeCapacity: number;
  routeUsed: number;
  delivered: number;
  lost: number;
  monthlyCost: number;
}

/** Dựng kho và tuyến còn thiếu nhưng giữ nguyên tồn kho, hao mòn và chính sách cũ. */
export function ensureLogisticsNetwork(current: MilitarySliceState, resources: MilitaryResources): MilitarySliceState {
  const supplies = supplyTypes();
  const logistics = structuredClone(current.logistics);
  const fallbackCapacity = Math.max(120, resources.logisticsCapacity);
  const sites = resources.depotSites !== undefined && resources.depotSites.length > 0
    ? resources.depotSites
    : [{ id: 'depot_main', name: 'Kho quân nhu trung tâm', capacity: fallbackCapacity, condition: 82, besieged: false }];

  const depots: LogisticsDepot[] = sites.map((site) => {
    const old = logistics.depots.find((depot) => depot.id === site.id);
    const capacity = Math.max(1, site.capacity);
    return {
      id: site.id,
      name: site.name,
      location: site.name,
      capacity,
      condition: site.condition,
      security: old?.security ?? 65,
      besieged: site.besieged,
      stocks: supplies.map((supply) => {
        const oldStock = old?.stocks.find((stock) => stock.supplyId === supply.id);
        const stockCapacity = capacity * supply.depotShare;
        return {
          supplyId: supply.id,
          amount: Math.min(stockCapacity, oldStock?.amount ?? stockCapacity * logisticsConfig().depotOpeningFill),
          capacity: stockCapacity,
        };
      }),
    };
  });

  const forceIds = new Set([
    ...current.forces.map((force) => force.id),
    ...current.recruitment.map((order) => order.destinationId),
  ]);
  const targetIds = [...forceIds];
  const routeCapacity = Math.max(4, resources.logisticsCapacity / Math.max(1, targetIds.length) / 12);
  const routes: SupplyRoute[] = targetIds.map((forceId, index) => {
    const old = logistics.routes.find((route) => route.toForceId === forceId);
    const force = current.forces.find((entry) => entry.id === forceId);
    const order = current.recruitment.find((entry) => entry.destinationId === forceId);
    const navy = force?.kind === 'navy' || order?.forceKind === 'navy';
    const depot = depots[index % depots.length];
    return old === undefined
      ? {
          id: `supply_${forceId}`,
          fromDepotId: depot?.id ?? 'depot_main',
          toForceId: forceId,
          mode: navy ? 'duong-bien' : 'duong-bo',
          terrain: navy ? 'bien' : 'dong-bang',
          distance: Math.max(1, index + 1),
          capacity: routeCapacity,
          condition: 82,
          risk: 8,
          escort: 15,
          blockaded: false,
          active: true,
          deliveredLastMonth: 0,
          lostLastMonth: 0,
          costLastMonth: 0,
        }
      : { ...old, capacity: routeCapacity };
  });

  const forces: ForceLogistics[] = targetIds.map((forceId) => {
    const old = logistics.forces.find((status) => status.forceId === forceId);
    return old ?? {
      forceId,
      priority: 3,
      ration: 'thuong',
      condition: 'du-day',
      supplyLevel: 100,
      daysOfSupply: 0,
      demand: [],
      delivered: [],
      carried: supplies.map((supply) => ({ supplyId: supply.id, amount: 0, capacity: 0 })),
      shortages: [],
      transportCapacity: 0,
      transportUsed: 0,
      losses: 0,
    };
  });

  return { ...current, logistics: { ...logistics, depots, routes, forces } };
}

/** Sản xuất, vận chuyển, tiêu dùng và hậu quả thiếu quân nhu trong một tháng. */
export function advanceLogisticsMonth(
  current: MilitarySliceState,
  treasuryInput: number,
  context: LogisticsMonthContext = {},
): LogisticsMonthResult {
  const resources = context.resources ?? fallbackResources(current);
  const date = context.date ?? { year: 0, month: 1, day: 1, hour: 0 };
  const campaignIntensity = clamp(context.campaignIntensity ?? 0.2, 0, 1);
  const config = logisticsConfig();
  const supplies = supplyTypes();
  let military = ensureLogisticsNetwork(current, resources);
  let logistics: LogisticsState = structuredClone(military.logistics);
  let treasury = treasuryInput;
  let procurementCost = 0;
  let transportCost = 0;
  const lines: string[] = [];

  // Kho tự mua/bổ sung tới mức dự trữ, nhưng bị giới hạn bởi công suất kho và tiền thật.
  logistics.depots = logistics.depots.map((depot) => ({
    ...depot,
    stocks: [...depot.stocks]
      .sort((left, right) => (supplyTypeOf(left.supplyId)?.priority ?? 99) - (supplyTypeOf(right.supplyId)?.priority ?? 99))
      .map((stock) => {
        const supply = supplyTypeOf(stock.supplyId);
        if (supply === null) return stock;
        if (logistics.forces.length === 0) return stock;
        const target = stock.capacity * config.depotReorderTarget;
        const productionCap = stock.capacity * config.monthlyReplenishment * (depot.condition / 100) * (depot.besieged ? 0.12 : 1);
        const wanted = Math.max(0, Math.min(target - stock.amount, productionCap));
        const affordable = supply.cost <= 0 ? wanted : Math.min(wanted, Math.max(0, treasury) / supply.cost);
        const cost = affordable * supply.cost;
        treasury -= cost;
        procurementCost += cost;
        return { ...stock, amount: round(Math.min(stock.capacity, stock.amount + affordable)) };
      }),
  }));

  const demandByForce = new Map<string, SupplyAmount[]>();
  for (const status of logistics.forces) {
    demandByForce.set(status.forceId, forceDemand(military, status.forceId, status.ration, campaignIntensity));
  }

  const nextStatuses = new Map<string, ForceLogistics>();
  const routeResults = new Map<string, SupplyRoute>();
  const orderedStatuses = [...logistics.forces].sort((left, right) => right.priority - left.priority || left.forceId.localeCompare(right.forceId));

  for (const oldStatus of orderedStatuses) {
    const demand = demandByForce.get(oldStatus.forceId) ?? [];
    const route = logistics.routes.find((entry) => entry.toForceId === oldStatus.forceId);
    const depot = route === undefined ? undefined : logistics.depots.find((entry) => entry.id === route.fromDepotId);
    const carried = supplies.map((supply) => {
      const old = oldStatus.carried.find((stock) => stock.supplyId === supply.id);
      const monthlyNeed = amountOf(demand, supply.id);
      const capacity = Math.max(monthlyNeed * (config.fieldReserveMonths + 1), old?.capacity ?? 0);
      return { supplyId: supply.id, amount: Math.min(capacity, old?.amount ?? 0), capacity };
    });
    const delivered: SupplyAmount[] = supplies.map((supply) => ({ supplyId: supply.id, amount: 0 }));
    let transportCapacity = 0;
    let transportUsed = 0;
    let losses = 0;
    let routeTransportCost = 0;

    if (route !== undefined && depot !== undefined && route.active) {
      const mode = transportProfile(route.mode);
      const winter = config.winterMonths.includes(date.month) ? mode.winterFactor : 1;
      const blockade = route.blockaded ? config.blockadeCapacityFactor : 1;
      const distanceFactor = 1 / (1 + Math.max(0, route.distance - 1) * 0.12);
      transportCapacity = route.capacity * mode.capacityFactor * terrainFactor(route.terrain) * (route.condition / 100) * winter * blockade * distanceFactor;
      let remaining = transportCapacity;

      for (const supply of [...supplies].sort((left, right) => left.priority - right.priority)) {
        if (remaining <= 0) break;
        const need = amountOf(demand, supply.id);
        const stock = carried.find((entry) => entry.supplyId === supply.id);
        const depotStock = depot.stocks.find((entry) => entry.supplyId === supply.id);
        const deliveryRow = delivered.find((entry) => entry.supplyId === supply.id);
        if (stock === undefined || depotStock === undefined || deliveryRow === undefined) continue;
        const desired = Math.max(0, need * (config.fieldReserveMonths + 1) - stock.amount);
        const unitCost = config.transportCostPerPoint * mode.costFactor * Math.max(1, route.distance);
        const gross = Math.min(desired, depotStock.amount, remaining);
        if (gross <= 0) continue;
        const lossRate = clamp(
          config.baseRouteLoss * mode.lossFactor * (1 + Math.max(0, route.risk - route.escort) / 50) * (1 + route.distance * 0.04),
          0,
          0.55,
        );
        const net = gross * (1 - lossRate);
        const cost = Math.min(Math.max(0, treasury), gross * unitCost);
        depotStock.amount = round(Math.max(0, depotStock.amount - gross));
        stock.amount = round(Math.min(stock.capacity, stock.amount + net));
        deliveryRow.amount = round(net);
        remaining -= gross;
        transportUsed += gross;
        losses += gross - net;
        treasury -= cost;
        transportCost += cost;
        routeTransportCost += cost;
      }

      routeResults.set(route.id, {
        ...route,
        condition: clamp(route.condition - config.routeWearPerMonth - (route.blockaded ? 2 : 0), 20, 100),
        deliveredLastMonth: round(delivered.reduce((sum, row) => sum + row.amount, 0)),
        lostLastMonth: round(losses),
        costLastMonth: round(routeTransportCost),
      });
    }

    const ratios: number[] = [];
    const shortages: string[] = [];
    for (const supply of supplies) {
      const need = amountOf(demand, supply.id);
      const stock = carried.find((entry) => entry.supplyId === supply.id);
      if (stock === undefined || need <= 0) continue;
      const consumed = Math.min(stock.amount, need);
      stock.amount = round(stock.amount - consumed);
      const ratio = consumed / need;
      ratios.push(ratio);
      if (ratio < 0.8) shortages.push(supply.id);
    }

    const supplyLevel = ratios.length === 0 ? 100 : average(ratios) * 100;
    const activeDemand = demand.filter((row) => row.amount > 0);
    const daysOfSupply = activeDemand.length === 0
      ? 0
      : Math.min(
          365,
          ...activeDemand.map((row) => (amountOfStocks(carried, row.supplyId) / Math.max(0.001, row.amount)) * 30),
        );
    const condition = supplyCondition(supplyLevel, route?.blockaded === true && daysOfSupply < 5);
    nextStatuses.set(oldStatus.forceId, {
      ...oldStatus,
      condition,
      supplyLevel: round(supplyLevel),
      daysOfSupply: round(daysOfSupply),
      demand: demand.map((row) => ({ ...row, amount: round(row.amount) })),
      delivered,
      carried,
      shortages,
      transportCapacity: round(transportCapacity),
      transportUsed: round(transportUsed),
      losses: round(losses),
    });
  }

  logistics.forces = logistics.forces.map((status) => nextStatuses.get(status.forceId) ?? status);
  logistics.routes = logistics.routes.map((route) => routeResults.get(route.id) ?? {
    ...route,
    deliveredLastMonth: 0,
    lostLastMonth: 0,
    costLastMonth: 0,
  });

  military = {
    ...military,
    forces: military.forces.map((force) => {
      const status = logistics.forces.find((entry) => entry.forceId === force.id);
      if (status === undefined) return force;
      const attrition = status.supplyLevel < 40
        ? config.severeShortageAttrition * (1 + campaignIntensity)
        : status.supplyLevel < 70
          ? config.shortageAttrition * (1 + campaignIntensity)
          : 0;
      const lacksMedicine = status.shortages.includes('duoc-pham');
      const rationPenalty = status.ration === 'giam' ? 1.2 : 0;
      const moraleDelta = status.supplyLevel >= 90 ? 0.7 : status.supplyLevel >= 70 ? -0.5 : status.supplyLevel >= 40 ? -5 : -11;
      const trainingDelta = status.supplyLevel >= 90 ? 0.6 : status.supplyLevel >= 70 ? 0 : status.supplyLevel >= 40 ? -1.8 : -4;
      return {
        ...force,
        units: force.units
          .map((unit) => ({
            ...unit,
            strength: Math.max(0, Math.round(unit.strength * (1 - attrition * (lacksMedicine ? 1.5 : 1)))),
            morale: clamp(unit.morale + moraleDelta - rationPenalty, 0, 100),
            training: clamp(unit.training + trainingDelta, 0, 100),
          }))
          .filter((unit) => unit.strength > 0),
      };
    }),
  };

  for (const status of logistics.forces) {
    if (status.condition === 'thieu' || status.condition === 'bi-cat') {
      const force = military.forces.find((entry) => entry.id === status.forceId);
      lines.push(
        `${force?.name ?? status.forceId} ${status.condition === 'bi-cat' ? 'bị cắt tiếp tế' : 'thiếu quân nhu'}: mức cấp ${String(Math.round(status.supplyLevel))}%, còn ${String(Math.round(status.daysOfSupply))} ngày dự trữ.`,
      );
    }
  }

  logistics.lastMonth = date.year * 12 + date.month;
  logistics.monthlyCost = round(procurementCost + transportCost);
  logistics.monthlyDelivered = round(logistics.routes.reduce((sum, route) => sum + route.deliveredLastMonth, 0));
  logistics.monthlyLost = round(logistics.routes.reduce((sum, route) => sum + route.lostLastMonth, 0));
  logistics.report = lines.length === 0
    ? [`Đã chuyển ${String(Math.round(logistics.monthlyDelivered))} điểm quân nhu; mọi lực lượng được tiếp tế.`]
    : lines;
  military = { ...military, logistics };

  return {
    military,
    treasury: round(treasury),
    lines: logistics.report,
    procurementCost: round(procurementCost),
    transportCost: round(transportCost),
  };
}

export function setForceSupplyPolicy(
  current: MilitarySliceState,
  forceId: string,
  ration: RationPolicy,
  priority: number,
): MilitarySliceState {
  return {
    ...current,
    logistics: {
      ...current.logistics,
      forces: current.logistics.forces.map((status) =>
        status.forceId === forceId ? { ...status, ration, priority: Math.round(clamp(priority, 1, 5)) } : status,
      ),
    },
  };
}

export function setSupplyRoute(
  current: MilitarySliceState,
  routeId: string,
  fromDepotId: string,
  mode: TransportMode,
  active: boolean,
): MilitarySliceState {
  if (!current.logistics.depots.some((depot) => depot.id === fromDepotId)) return current;
  return {
    ...current,
    logistics: {
      ...current.logistics,
      routes: current.logistics.routes.map((route) =>
        route.id === routeId
          ? { ...route, fromDepotId, mode, active, terrain: mode === 'duong-bien' ? 'bien' : route.terrain === 'bien' ? 'dong-bang' : route.terrain }
          : route,
      ),
    },
  };
}

export function logisticsSummaryOf(military: MilitarySliceState): LogisticsSummary {
  const logistics = military.logistics;
  const depotStock = logistics.depots.reduce((sum, depot) => sum + depot.stocks.reduce((stockSum, stock) => stockSum + stock.amount, 0), 0);
  const depotCapacity = logistics.depots.reduce((sum, depot) => sum + depot.stocks.reduce((stockSum, stock) => stockSum + stock.capacity, 0), 0);
  const routeCapacity = logistics.forces.reduce((sum, status) => sum + status.transportCapacity, 0);
  const routeUsed = logistics.forces.reduce((sum, status) => sum + status.transportUsed, 0);
  return {
    depotStock: round(depotStock),
    depotCapacity: round(depotCapacity),
    reservePercent: round(depotCapacity <= 0 ? 0 : depotStock / depotCapacity * 100),
    averageSupply: round(average(logistics.forces.map((status) => status.supplyLevel))),
    forcesStrained: logistics.forces.filter((status) => status.condition === 'cang' || status.condition === 'thieu').length,
    forcesCutOff: logistics.forces.filter((status) => status.condition === 'bi-cat').length,
    routeCapacity: round(routeCapacity),
    routeUsed: round(routeUsed),
    delivered: logistics.monthlyDelivered,
    lost: logistics.monthlyLost,
    monthlyCost: logistics.monthlyCost,
  };
}

function forceDemand(
  military: MilitarySliceState,
  forceId: string,
  ration: RationPolicy,
  campaignIntensity: number,
): SupplyAmount[] {
  const force = military.forces.find((entry) => entry.id === forceId);
  const orders = military.recruitment.filter((order) => order.destinationId === forceId);
  const queued = orders.reduce((sum, order) => sum + order.strength, 0);
  const troopCount = force?.units.reduce((sum, unit) => sum + unit.strength, 0) ?? 0;
  const mounted = force?.units.reduce((sum, unit) => {
    const type = unitTypeOf(unit.typeId);
    return sum + (type?.tags.some((tag) => tag === 'ky-binh' || tag === 'ky-xa') === true ? unit.strength : 0);
  }, 0) ?? 0;
  const ranged = force?.units.reduce((sum, unit) => {
    const type = unitTypeOf(unit.typeId);
    return sum + ((type?.ammo ?? 0) > 0 ? unit.strength : 0);
  }, 0) ?? 0;
  const navy = force?.kind === 'navy' ? troopCount : orders.filter((order) => order.forceKind === 'navy').reduce((sum, order) => sum + order.strength, 0);
  const rationFactor = ration === 'giam' ? 0.72 : ration === 'day-du' ? 1.16 : 1;

  return supplyTypes().map((supply) => {
    let amount = supply.needPerTroop * troopCount + supply.trainingNeedPerTroop * queued;
    if (supply.id === 'luong-thuc') amount *= rationFactor * (1 + campaignIntensity * 0.18);
    if (supply.id === 'co-kho') amount = mounted * 0.034 * rationFactor * (1 + campaignIntensity * 0.25);
    if (supply.id === 'dan-duoc') amount = ranged * 0.0035 * (0.35 + campaignIntensity) + queued * 0.001;
    if (supply.id === 'vat-tu-hai-quan') amount = navy * 0.018 * (1 + campaignIntensity * 0.5);
    return { supplyId: supply.id, amount };
  });
}

function fallbackResources(military: MilitarySliceState): MilitaryResources {
  const active = military.forces.reduce((sum, force) => sum + force.units.reduce((unitSum, unit) => unitSum + unit.strength, 0), 0);
  const queued = military.recruitment.reduce((sum, order) => sum + order.strength, 0);
  return {
    population: Math.max(1_000, active * 5),
    manpowerCapacity: Math.max(500, active + queued),
    logisticsCapacity: Math.max(240, active * 0.8 + queued * 0.5),
    barracks: 1,
    barracksCapacity: Math.max(300, queued),
  };
}

function supplyCondition(level: number, cutOff: boolean): SupplyCondition {
  if (cutOff || level < 40) return 'bi-cat';
  if (level < 70) return 'thieu';
  if (level < 90) return 'cang';
  return 'du-day';
}

function amountOf(rows: readonly SupplyAmount[], supplyId: string): number {
  return rows.find((row) => row.supplyId === supplyId)?.amount ?? 0;
}

function amountOfStocks(rows: readonly SupplyStock[], supplyId: string): number {
  return rows.find((row) => row.supplyId === supplyId)?.amount ?? 0;
}

function average(values: readonly number[]): number {
  return values.length === 0 ? 100 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
