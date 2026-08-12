import type { GameDate } from '@/core/clock';
import type { Rng } from '@/core/rng';
import { powerName } from '@/systems/nations/data';
import type { NationsSliceState } from '@/systems/nations/slice';
import { countryRankEffectiveEffects } from '@/systems/nations/country-rank';
import { economyConfig, economyGoods, economyProfile } from './data';
import type { EconomySliceState } from './slice';
import type {
  EconomyEvent,
  EconomyEventKind,
  EconomySummary,
  FiscalLedger,
  GoodMarket,
  NationalEconomy,
  TradeRoute,
} from './types';

const ZERO_LEDGER: FiscalLedger = {
  taxRevenue: 0,
  tariffRevenue: 0,
  tradeRevenue: 0,
  administration: 0,
  militaryExpense: 0,
  debtService: 0,
  relief: 0,
  totalRevenue: 0,
  totalExpense: 0,
  net: 0,
  tradeBalance: 0,
};

interface WorkingMarket {
  economy: NationalEconomy;
  atWar: boolean;
  harvestFailure: boolean;
}

export interface EconomyMonthResult {
  economy: EconomySliceState;
  nations: NationsSliceState;
  lines: string[];
}

/** Dựng điểm xuất phát kinh tế từ hồ sơ data và sức mạnh hiện có của quốc gia. */
export function createEconomy(nations: NationsSliceState): EconomySliceState {
  return {
    markets: nations.powers.map((power) => seedMarket(power)),
    routes: [],
    events: [],
    lastMonth: 0,
    sequence: 1,
  };
}

/**
 * Một tháng kinh tế hoàn chỉnh: sản xuất → giao thương → tiêu dùng → giá cả → ngân sách.
 * Mọi lần ngẫu nhiên đều đi qua RNG của world tick nên save/load vẫn tái lập tuyệt đối.
 */
export function advanceEconomyMonth(
  rng: Rng,
  economyInput: EconomySliceState,
  nationsInput: NationsSliceState,
  date: GameDate,
): EconomyMonthResult {
  const config = economyConfig();
  const goods = economyGoods();
  const absoluteMonth = date.year * 12 + date.month;
  const source = economyInput.markets.length === 0 ? createEconomy(nationsInput) : economyInput;
  const sourceByPower = new Map(source.markets.map((market) => [market.powerId, market]));
  const working: WorkingMarket[] = [];

  for (const power of nationsInput.powers) {
    const previous = sourceByPower.get(power.id) ?? seedMarket(power);
    const atWar = nationsInput.relations.some(
      (relation) => relation.atWar && (relation.a === power.id || relation.b === power.id),
    );
    const harvestFailure = date.month >= 7 && date.month <= 10 && rng.next() < 0.025;
    const previousGoods = new Map(previous.goods.map((market) => [market.goodId, market]));
    const nextGoods: GoodMarket[] = goods.map((good) => {
      const old = previousGoods.get(good.id) ?? seedGood(previous.population, good.id);
      const prosperityDemand = good.group === 'xa-xi' || good.group === 'ma-thuat' ? 0.55 + previous.prosperity / 110 : 1;
      const consumption = (previous.population / 1_000) * good.demandPerThousand * prosperityDemand;
      const seasonal = good.seasonal ? seasonalFactor(date.month) : 1;
      const failedHarvest = harvestFailure && good.id === 'luong-thuc' ? 0.42 : 1;
      const stability = 0.82 + power.stability / 550;
      const infrastructure = 0.84 + previous.infrastructure / 420;
      const war = atWar ? config.warProductionFactor : 1;
      const noise = 0.94 + rng.next() * 0.12;
      const productionFactor = previous.productionFactors[good.id] ?? 1;
      const production = consumption * productionFactor * seasonal * failedHarvest * stability * infrastructure * war * noise;

      return {
        goodId: good.id,
        production: round(production),
        consumption: round(consumption),
        stockpile: round(old.stockpile + production),
        price: old.price,
        priceChange: 0,
        imports: 0,
        exports: 0,
        unmetDemand: 0,
      };
    });

    working.push({
      economy: {
        ...previous,
        goods: nextGoods,
        ledger: { ...ZERO_LEDGER },
        history: [...previous.history],
      },
      atWar,
      harvestFailure,
    });
  }

  const routes: TradeRoute[] = [];
  const tradeBalances = new Map<string, number>();
  const tariffRevenues = new Map<string, number>();

  for (const good of goods) {
    const exporters = working
      .map((row) => ({ row, good: row.economy.goods.find((entry) => entry.goodId === good.id) }))
      .filter(hasMarketGood)
      .map(({ row, good: marketGood }) => ({
        row,
        good: marketGood,
        remaining: Math.max(
          0,
          marketGood.stockpile - marketGood.consumption * (1 + config.stockpileTargetMonths),
        ),
        capacity: marketGood.consumption * (0.08 + row.economy.tradeCapacity * 0.0028) * (row.atWar ? config.warTradeFactor : 1),
      }))
      .filter((entry) => entry.remaining > 0)
      .sort((left, right) => right.remaining - left.remaining);

    const importers = working
      .map((row) => ({ row, good: row.economy.goods.find((entry) => entry.goodId === good.id) }))
      .filter(hasMarketGood)
      .map(({ row, good: marketGood }) => ({
        row,
        good: marketGood,
        remaining: Math.max(
          0,
          marketGood.consumption * (1 + config.stockpileTargetMonths) - marketGood.stockpile,
        ),
        capacity: marketGood.consumption * (0.08 + row.economy.tradeCapacity * 0.0028) * (row.atWar ? config.warTradeFactor : 1),
      }))
      .filter((entry) => entry.remaining > 0)
      .sort((left, right) => right.remaining - left.remaining);

    for (const importer of importers) {
      const candidates = exporters
        .filter((exporter) => exporter.row.economy.powerId !== importer.row.economy.powerId)
        .map((exporter) => ({
          exporter,
          relation: relationBetween(
            nationsInput,
            exporter.row.economy.powerId,
            importer.row.economy.powerId,
          ),
        }))
        .filter(({ relation }) => relation !== null && !relation.atWar && relation.value >= config.tradeRelationFloor)
        .sort((left, right) => {
          const leftTreaty = left.relation?.treaties.some((treaty) => treaty.id === 'hiep_thuong-mai') ? 25 : 0;
          const rightTreaty = right.relation?.treaties.some((treaty) => treaty.id === 'hiep_thuong-mai') ? 25 : 0;
          return (right.relation?.value ?? -100) + rightTreaty - ((left.relation?.value ?? -100) + leftTreaty);
        });

      for (const candidate of candidates) {
        if (importer.remaining <= 0 || importer.capacity <= 0) break;
        const exporter = candidate.exporter;
        if (exporter.remaining <= 0 || exporter.capacity <= 0) continue;
        const relation = candidate.relation;
        if (relation === null) continue;

        const treatyFactor = relation.treaties.some((treaty) => treaty.id === 'hiep_thuong-mai') ? 1.2 : 1;
        const relationFactor = clamp(0.55 + (relation.value + 100) / 260, 0.45, 1.35) * treatyFactor;
        const routeCeiling = Math.min(exporter.remaining, importer.remaining, exporter.capacity, importer.capacity);
        const quantity = Math.min(routeCeiling, routeCeiling * relationFactor);
        if (quantity < 0.01) continue;

        const loss = clamp(config.routeLoss + Math.max(0, -relation.value) * 0.00025, 0, 0.18);
        const delivered = quantity * (1 - loss);
        const unitPrice = (exporter.good.price + importer.good.price) / 2;
        const value = (quantity * unitPrice) / 1_000;
        const tariff = value * importer.row.economy.tariffRate;

        exporter.good.stockpile = round(Math.max(0, exporter.good.stockpile - quantity));
        exporter.good.exports = round(exporter.good.exports + quantity);
        importer.good.stockpile = round(importer.good.stockpile + delivered);
        importer.good.imports = round(importer.good.imports + delivered);
        exporter.remaining -= quantity;
        exporter.capacity -= quantity;
        importer.remaining -= delivered;
        importer.capacity -= delivered;
        addTo(tradeBalances, exporter.row.economy.powerId, value);
        addTo(tradeBalances, importer.row.economy.powerId, -value);
        addTo(tariffRevenues, importer.row.economy.powerId, tariff);

        routes.push({
          id: `route_${String(absoluteMonth)}_${String(routes.length + 1)}`,
          fromPowerId: exporter.row.economy.powerId,
          toPowerId: importer.row.economy.powerId,
          goodId: good.id,
          quantity: round(quantity),
          unitPrice: round(unitPrice),
          value: round(value),
          tariff: round(tariff),
          loss: round(loss * 100),
        });
      }
    }
  }

  let sequence = source.sequence;
  const newEvents: EconomyEvent[] = [];
  const nationPowers = nationsInput.powers.map((power) => {
    const row = working.find((entry) => entry.economy.powerId === power.id);
    if (row === undefined) return power;
    const previous = sourceByPower.get(power.id) ?? seedMarket(power);
    const countryEffects = countryRankEffectiveEffects(power);
    const tradeBalance = tradeBalances.get(power.id) ?? 0;
    const tariffRevenue = tariffRevenues.get(power.id) ?? 0;
    let weightedPrice = 0;
    let totalWeight = 0;
    let weightedChange = 0;
    let essentialShortage = 0;
    let outputValue = 0;

    row.economy.goods = row.economy.goods.map((marketGood) => {
      const good = goods.find((entry) => entry.id === marketGood.goodId);
      if (good === undefined) return marketGood;
      const consumed = Math.min(marketGood.stockpile, marketGood.consumption);
      const stockpile = Math.max(0, marketGood.stockpile - consumed);
      const unmetDemand = Math.max(0, marketGood.consumption - consumed);
      const target = marketGood.consumption * config.stockpileTargetMonths;
      const pressure = clamp((target - stockpile) / Math.max(1, marketGood.consumption), -1.5, 2.5);
      const price = clamp(
        marketGood.price * (1 + pressure * good.volatility * config.priceAdjustment),
        good.basePrice * config.priceMinFactor,
        good.basePrice * config.priceMaxFactor,
      );
      const priceChange = ((price - marketGood.price) / Math.max(0.01, marketGood.price)) * 100;
      weightedPrice += (price / good.basePrice) * good.weight;
      weightedChange += priceChange * good.weight;
      totalWeight += good.weight;
      outputValue += (marketGood.production * good.basePrice) / 1_000;
      if (good.group === 'thiet-yeu') {
        essentialShortage += (unmetDemand / Math.max(1, marketGood.consumption)) * good.weight;
      }
      return {
        ...marketGood,
        stockpile: round(stockpile),
        unmetDemand: round(unmetDemand),
        price: round(price),
        priceChange: round(priceChange),
      };
    });

    const costOfLiving = totalWeight === 0 ? previous.costOfLiving : (weightedPrice / totalWeight) * 100;
    const inflation = clamp(totalWeight === 0 ? 0 : (weightedChange / totalWeight) * 12, -20, 80);
    const shortage = clamp(essentialShortage / 0.55, 0, 1);
    const monthlyGrowth =
      (previous.productivity - 50) * 0.0002 +
      (previous.prosperity - 50) * 0.00012 -
      previous.unemployment * 0.00005 -
      shortage * 0.025 -
      (row.atWar ? 0.004 : 0) +
      clamp(tradeBalance / Math.max(1, previous.gdp), -0.01, 0.01) * 0.3;
    const growth = clamp(monthlyGrowth * 1_200, -35, 18);
    const productionAnchor = Math.max(1, outputValue * 12);
    const gdpByGrowth = previous.gdp * (1 + monthlyGrowth);
    const gdp = Math.max(0, gdpByGrowth * 0.94 + productionAnchor * 0.06);
    const productivity = clamp(
      previous.productivity + (previous.infrastructure - previous.productivity) * 0.002 + (growth > 3 ? 0.03 : -0.01),
      0,
      100,
    );
    const unemployment = clamp(
      previous.unemployment - growth * 0.018 + shortage * 1.2 + (row.atWar ? 0.18 : -0.04),
      2,
      60,
    );
    const wages = Math.max(1, previous.wages * (1 + inflation / 1_200 * 0.58 + (productivity - previous.productivity) / 800));
    const povertyTarget = clamp(
      18 + unemployment * 0.9 + Math.max(0, costOfLiving - wages) * 0.28 + shortage * 32 - previous.prosperity * 0.12,
      2,
      95,
    );
    const poverty = clamp(previous.poverty * 0.88 + povertyTarget * 0.12, 0, 100);
    const prosperityTarget = clamp(72 - poverty * 0.55 - unemployment * 0.25 + previous.infrastructure * 0.28, 0, 100);
    const prosperity = clamp(previous.prosperity * 0.9 + prosperityTarget * 0.1, 0, 100);
    const annualPopulationGrowth = clamp(
      config.populationGrowthAnnual + (prosperity - 50) * 0.00015 - shortage * 0.08 - (row.atWar ? 0.003 : 0),
      config.populationDeclineFloor,
      0.018,
    );
    const population = Math.max(0, previous.population * (1 + annualPopulationGrowth / 12));
    const workforce = population * clamp(0.45 + previous.urbanization * 0.12, 0.42, 0.58);

    const taxRevenue = ((gdp * previous.taxRate) / 12) * countryEffects.taxFactor;
    const tradeRevenue = Math.max(0, tradeBalance) * 0.015 * countryEffects.tradeFactor;
    const administration = power.land * config.administrationPerLand * countryEffects.administrationFactor;
    const militaryExpense = power.military * config.militaryExpensePerPoint;
    const debtService = (previous.debt * previous.interestRate) / 12;
    const relief = shortage > 0.03 ? shortage * (population / 1_000_000) * 4 : 0;
    const totalRevenue = taxRevenue + tariffRevenue + tradeRevenue;
    const totalExpense = administration + militaryExpense + debtService + relief;
    const net = totalRevenue - totalExpense;
    let treasury = power.treasury + net;
    let debt = previous.debt;
    if (treasury < 0) {
      debt += -treasury;
      treasury = 0;
    } else if (net > 0 && debt > 0 && treasury > gdp * 0.08) {
      const repayment = Math.min(debt, net * 0.15);
      debt -= repayment;
      treasury -= repayment;
    }
    const debtRatio = debt / Math.max(1, gdp);
    const creditRating = clamp(88 - debtRatio * 34 - Math.max(0, inflation) * 0.45 - (100 - power.stability) * 0.12, 0, 100);
    const interestRate = clamp(0.025 + debtRatio * 0.04 + (100 - creditRating) * 0.001, 0.02, 0.3);
    const stabilityDelta =
      (growth > 4 ? 0.35 : growth < -5 ? -0.6 : 0) -
      (shortage > 0.08 ? 1.4 : 0) -
      (inflation > 18 ? 0.45 : 0) -
      (poverty > 60 ? 0.25 : 0);
    const stability = clamp(power.stability + stabilityDelta, 0, 100);
    const cohesion = clamp(power.cohesion + (shortage > 0.08 ? -0.6 : prosperity > 62 ? 0.12 : 0), 0, 100);

    row.economy = {
      ...row.economy,
      population: round(population),
      workforce: round(workforce),
      productivity: round(productivity),
      unemployment: round(unemployment),
      wages: round(wages),
      costOfLiving: round(costOfLiving),
      prosperity: round(prosperity),
      poverty: round(poverty),
      inflation: round(inflation),
      gdp: round(gdp),
      growth: round(growth),
      debt: round(debt),
      interestRate: round(interestRate),
      creditRating: round(creditRating),
      ledger: {
        taxRevenue: round(taxRevenue),
        tariffRevenue: round(tariffRevenue),
        tradeRevenue: round(tradeRevenue),
        administration: round(administration),
        militaryExpense: round(militaryExpense),
        debtService: round(debtService),
        relief: round(relief),
        totalRevenue: round(totalRevenue),
        totalExpense: round(totalExpense),
        net: round(net),
        tradeBalance: round(tradeBalance),
      },
      history: [
        ...previous.history,
        {
          year: date.year,
          month: date.month,
          gdp: round(gdp),
          growth: round(growth),
          inflation: round(inflation),
          unemployment: round(unemployment),
          foodPrice: row.economy.goods.find((entry) => entry.goodId === 'luong-thuc')?.price ?? 1,
          treasury: round(treasury),
          tradeBalance: round(tradeBalance),
        },
      ].slice(-config.historyMonths),
    };

    if (row.harvestFailure && !hasRecentEvent(source.events, power.id, 'mat-mua', absoluteMonth, 6)) {
      newEvents.push(makeEvent(sequence++, power.id, 'mat-mua', date, 55, `${powerName(power.id)} mất mùa; kho lương và giá cả bắt đầu chịu sức ép.`));
    }
    if (shortage > 0.08 && !hasRecentEvent(source.events, power.id, 'doi-kem', absoluteMonth, 4)) {
      newEvents.push(makeEvent(sequence++, power.id, 'doi-kem', date, clamp(shortage * 100, 35, 95), `${powerName(power.id)} rơi vào thiếu đói; dân số, ổn định và ngân khố cùng suy giảm.`));
    }
    if (inflation > 18 && !hasRecentEvent(source.events, power.id, 'lam-phat', absoluteMonth, 6)) {
      newEvents.push(makeEvent(sequence++, power.id, 'lam-phat', date, clamp(inflation, 25, 90), `Lạm phát tại ${powerName(power.id)} vượt kiểm soát (${round(inflation)}%/năm).`));
    }
    if (debtRatio > config.debtCrisisRatio && !hasRecentEvent(source.events, power.id, 'vo-no', absoluteMonth, 12)) {
      newEvents.push(makeEvent(sequence++, power.id, 'vo-no', date, clamp(debtRatio * 35, 45, 100), `${powerName(power.id)} lâm khủng hoảng nợ; lãi vay tăng vọt.`));
    }
    if (growth > 6 && previous.growth <= 6 && !hasRecentEvent(source.events, power.id, 'bung-no', absoluteMonth, 12)) {
      newEvents.push(makeEvent(sequence++, power.id, 'bung-no', date, clamp(growth * 5, 30, 85), `${powerName(power.id)} bước vào thời kỳ kinh tế bùng nổ.`));
    }
    if (growth > 1 && previous.growth < 0 && !hasRecentEvent(source.events, power.id, 'phuc-hoi', absoluteMonth, 8)) {
      newEvents.push(makeEvent(sequence++, power.id, 'phuc-hoi', date, 35, `Kinh tế ${powerName(power.id)} bắt đầu phục hồi.`));
    }

    return {
      ...power,
      treasury: round(treasury),
      income: round(totalRevenue * 12),
      stability: round(stability),
      cohesion: round(cohesion),
    };
  });

  const lines = newEvents.map((event) => `[kinh tế] ${event.text}`);
  if (routes.length > 0) {
    const volume = routes.reduce((sum, route) => sum + route.value, 0);
    lines.push(`[kinh tế] ${String(routes.length)} tuyến hàng hoạt động trong tháng, trị giá ${String(round(volume))}.`);
  }

  return {
    economy: {
      markets: working.map((row) => row.economy),
      routes,
      events: [...newEvents, ...source.events].slice(0, 120),
      lastMonth: absoluteMonth,
      sequence,
    },
    nations: { ...nationsInput, powers: nationPowers },
    lines,
  };
}

export function economySummary(economy: EconomySliceState): EconomySummary {
  const totalGdp = economy.markets.reduce((sum, market) => sum + market.gdp, 0);
  const totalPopulation = economy.markets.reduce((sum, market) => sum + market.population, 0);
  const tradeVolume = economy.routes.reduce((sum, route) => sum + route.value, 0);
  const averageInflation = average(economy.markets.map((market) => market.inflation));
  const averageUnemployment = average(economy.markets.map((market) => market.unemployment));
  const richest = [...economy.markets].sort((left, right) => right.gdp - left.gdp)[0];
  const fastest = [...economy.markets].sort((left, right) => right.growth - left.growth)[0];
  const stressedMarkets = economy.markets.reduce(
    (sum, market) => sum + market.goods.filter((good) => good.unmetDemand > good.consumption * 0.03).length,
    0,
  );
  return {
    totalGdp: round(totalGdp),
    totalPopulation: round(totalPopulation),
    tradeVolume: round(tradeVolume),
    averageInflation: round(averageInflation),
    averageUnemployment: round(averageUnemployment),
    richestPowerId: richest?.powerId ?? '',
    fastestGrowthPowerId: fastest?.powerId ?? '',
    stressedMarkets,
  };
}

function seedMarket(power: NationsSliceState['powers'][number]): NationalEconomy {
  const profile = economyProfile(power.id);
  const countryEffects = countryRankEffectiveEffects(power);
  const population = profile?.population ?? Math.max(300_000, power.land * 700_000);
  const urbanization = profile?.urbanization ?? 0.15;
  const productivity = profile?.productivity ?? clamp(power.income / 20, 30, 85);
  const prosperity = clamp((power.stability + power.cohesion + productivity) / 3, 0, 100);
  const unemployment = clamp(8 + (50 - productivity) * 0.08, 3, 22);
  const productionFactors = profile?.production ?? Object.fromEntries(economyGoods().map((good) => [good.id, 1]));
  return {
    powerId: power.id,
    population,
    workforce: population * clamp(0.45 + urbanization * 0.12, 0.42, 0.58),
    urbanization,
    productivity,
    unemployment,
    wages: 100,
    costOfLiving: 100,
    prosperity,
    poverty: clamp(55 - prosperity * 0.5, 5, 70),
    inflation: 0,
    gdp: Math.max(power.income * 4.8, power.land * 200),
    growth: 0,
    debt: profile?.debt ?? Math.max(0, -power.treasury),
    interestRate: 0.06,
    creditRating: clamp(60 + power.stability * 0.2 - (profile?.debt ?? 0) / 30, 20, 90),
    infrastructure: profile?.infrastructure ?? clamp(power.stability * 0.8, 20, 80),
    tradeCapacity: clamp(
      (profile?.tradeCapacity ?? clamp(power.cohesion * 0.8, 20, 80)) + countryEffects.tradeCapacityBonus,
      0,
      100,
    ),
    taxRate: profile?.taxRate ?? 0.18,
    tariffRate: profile?.tariffRate ?? 0.07,
    productionFactors: { ...productionFactors },
    goods: economyGoods().map((good) => seedGood(population, good.id)),
    ledger: { ...ZERO_LEDGER },
    history: [],
  };
}

function seedGood(population: number, goodId: string): GoodMarket {
  const good = economyGoods().find((entry) => entry.id === goodId);
  if (good === undefined) {
    return { goodId, production: 0, consumption: 0, stockpile: 0, price: 1, priceChange: 0, imports: 0, exports: 0, unmetDemand: 0 };
  }
  const consumption = (population / 1_000) * good.demandPerThousand;
  return {
    goodId,
    production: round(consumption),
    consumption: round(consumption),
    stockpile: round(consumption * economyConfig().stockpileTargetMonths),
    price: good.basePrice,
    priceChange: 0,
    imports: 0,
    exports: 0,
    unmetDemand: 0,
  };
}

function hasMarketGood(
  value: { row: WorkingMarket; good: GoodMarket | undefined },
): value is { row: WorkingMarket; good: GoodMarket } {
  return value.good !== undefined;
}

function relationBetween(nations: NationsSliceState, a: string, b: string): NationsSliceState['relations'][number] | null {
  return nations.relations.find((row) => (row.a === a && row.b === b) || (row.a === b && row.b === a)) ?? null;
}

function makeEvent(
  sequence: number,
  powerId: string,
  kind: EconomyEventKind,
  date: GameDate,
  severity: number,
  text: string,
): EconomyEvent {
  return {
    id: `econ_${String(date.year)}_${String(date.month)}_${String(sequence)}`,
    powerId,
    kind,
    year: date.year,
    month: date.month,
    severity: round(clamp(severity, 0, 100)),
    text,
  };
}

function hasRecentEvent(
  events: readonly EconomyEvent[],
  powerId: string,
  kind: EconomyEventKind,
  absoluteMonth: number,
  withinMonths: number,
): boolean {
  return events.some(
    (event) =>
      event.powerId === powerId &&
      event.kind === kind &&
      absoluteMonth - (event.year * 12 + event.month) <= withinMonths,
  );
}

function seasonalFactor(month: number): number {
  if (month <= 2) return 0.6;
  if (month <= 4) return 0.75;
  if (month <= 7) return 0.95;
  if (month <= 10) return 1.55;
  return month === 11 ? 1.15 : 0.6;
}

function addTo(values: Map<string, number>, key: string, amount: number): void {
  values.set(key, (values.get(key) ?? 0) + amount);
}

function average(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
