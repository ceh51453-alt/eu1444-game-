import { beforeAll, describe, expect, it } from 'vitest';
import { createRng } from '@/core/rng';
import { registerGameSlices } from '@/state/register';
import { canWrite, slices } from '@/state/slices';
import { createWorld } from '@/systems/nations/create';
import { advanceEconomyMonth, createEconomy, economySummary } from './model';

beforeAll(() => {
  slices.reset();
  registerGameSlices();
});

describe('nền kinh tế thế giới', () => {
  it('dựng đủ thị trường, hàng hóa và hồ sơ tài khóa cho tám thế lực', () => {
    const world = createWorld();
    const economy = createEconomy(world.nations);

    expect(economy.markets).toHaveLength(8);
    expect(economy.markets.every((market) => market.goods.length === 9)).toBe(true);
    expect(economy.markets.every((market) => market.population > 0 && market.gdp > 0)).toBe(true);
    expect(economy.markets.every((market) => market.goods.every((good) => good.stockpile >= 0 && good.price > 0))).toBe(true);
  });

  it('cùng seed và cùng đầu vào cho kết quả tháng giống hệt nhau', () => {
    const world = createWorld();
    const economy = createEconomy(world.nations);
    const left = advanceEconomyMonth(createRng('economy-repeat'), economy, world.nations, { year: 1444, month: 1, day: 1, hour: 0 });
    const right = advanceEconomyMonth(createRng('economy-repeat'), economy, world.nations, { year: 1444, month: 1, day: 1, hour: 0 });

    expect(left).toEqual(right);
  });

  it('mười hai tháng tạo giá động, thương mại, sổ ngân sách và lịch sử', () => {
    const world = createWorld();
    const rng = createRng('economy-year');
    let economy = createEconomy(world.nations);
    let nations = world.nations;
    let routeMonths = 0;

    for (let month = 1; month <= 12; month += 1) {
      const result = advanceEconomyMonth(rng, economy, nations, { year: 1444, month, day: 1, hour: 0 });
      economy = result.economy;
      nations = result.nations;
      if (economy.routes.length > 0) routeMonths += 1;
    }

    expect(routeMonths).toBeGreaterThan(0);
    expect(economy.lastMonth).toBe(1444 * 12 + 12);
    expect(economy.markets.every((market) => market.history.length === 12)).toBe(true);
    expect(economy.markets.some((market) => market.goods.some((good) => Math.abs(good.priceChange) > 0.01))).toBe(true);
    expect(economy.markets.every((market) => Number.isFinite(market.ledger.net))).toBe(true);
    expect(economy.markets.every((market) => market.debt >= 0 && market.goods.every((good) => good.stockpile >= 0))).toBe(true);

    const summary = economySummary(economy);
    expect(summary.totalPopulation).toBeGreaterThan(1_000_000);
    expect(summary.totalGdp).toBeGreaterThan(0);
    expect(summary.richestPowerId).toMatch(/^nation_/);
  });

  it('thiếu lương thực đẩy giá lên, tạo thiếu đói và làm giảm ổn định', () => {
    const world = createWorld();
    const seeded = createEconomy(world.nations);
    const ottoman = seeded.markets.find((market) => market.powerId === 'nation_ottoman');
    const oldPower = world.nations.powers.find((power) => power.id === 'nation_ottoman');
    if (ottoman === undefined || oldPower === undefined) throw new Error('thiếu dữ liệu Ottoman');
    ottoman.productionFactors['luong-thuc'] = 0;
    const food = ottoman.goods.find((good) => good.goodId === 'luong-thuc');
    if (food === undefined) throw new Error('thiếu mặt hàng lương thực');
    food.stockpile = 0;

    const result = advanceEconomyMonth(createRng('famine'), seeded, world.nations, { year: 1444, month: 3, day: 1, hour: 0 });
    const nextMarket = result.economy.markets.find((market) => market.powerId === 'nation_ottoman');
    const nextPower = result.nations.powers.find((power) => power.id === 'nation_ottoman');
    const nextFood = nextMarket?.goods.find((good) => good.goodId === 'luong-thuc');

    expect(nextFood?.price).toBeGreaterThan(food.price);
    expect(nextFood?.unmetDemand).toBeGreaterThan(0);
    expect(result.economy.events.some((event) => event.powerId === 'nation_ottoman' && event.kind === 'doi-kem')).toBe(true);
    expect(nextPower?.stability).toBeLessThan(oldPower.stability);
  });

  it('AI không thể sửa số liệu kinh tế', () => {
    expect(canWrite('ai', 'economy.markets.0.gdp')).toBe(false);
    expect(canWrite('ai', 'economy.routes.0.value')).toBe(false);
    expect(canWrite('ai', 'economy.events')).toBe(false);
  });
});
