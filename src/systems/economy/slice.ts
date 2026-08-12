import { z } from 'zod';
import type { GameState, SliceDefinition } from '@/state/slices';

const meter = z.number().min(0).max(100);

const goodMarketSchema = z.object({
  goodId: z.string().min(1),
  production: z.number().min(0),
  consumption: z.number().min(0),
  stockpile: z.number().min(0),
  price: z.number().min(0.01),
  priceChange: z.number(),
  imports: z.number().min(0),
  exports: z.number().min(0),
  unmetDemand: z.number().min(0),
});

const ledgerSchema = z.object({
  taxRevenue: z.number(),
  tariffRevenue: z.number(),
  tradeRevenue: z.number(),
  administration: z.number().min(0),
  militaryExpense: z.number().min(0),
  debtService: z.number().min(0),
  relief: z.number().min(0),
  totalRevenue: z.number(),
  totalExpense: z.number(),
  net: z.number(),
  tradeBalance: z.number(),
});

const historySchema = z.object({
  year: z.number().int(),
  month: z.number().int().min(1).max(12),
  gdp: z.number().min(0),
  growth: z.number(),
  inflation: z.number(),
  unemployment: z.number().min(0).max(100),
  foodPrice: z.number().min(0),
  treasury: z.number(),
  tradeBalance: z.number(),
});

export const nationalEconomySchema = z.object({
  powerId: z.string().startsWith('nation_'),
  population: z.number().min(0),
  workforce: z.number().min(0),
  urbanization: z.number().min(0).max(1),
  productivity: meter,
  unemployment: meter,
  wages: z.number().min(0),
  costOfLiving: z.number().min(0),
  prosperity: meter,
  poverty: meter,
  inflation: z.number(),
  gdp: z.number().min(0),
  growth: z.number(),
  debt: z.number().min(0),
  interestRate: z.number().min(0),
  creditRating: meter,
  infrastructure: meter,
  tradeCapacity: meter,
  taxRate: z.number().min(0).max(1),
  tariffRate: z.number().min(0).max(1),
  productionFactors: z.record(z.string(), z.number().min(0)).default({}),
  goods: z.array(goodMarketSchema).default([]),
  ledger: ledgerSchema,
  history: z.array(historySchema).default([]),
});

const tradeRouteSchema = z.object({
  id: z.string().min(1),
  fromPowerId: z.string().startsWith('nation_'),
  toPowerId: z.string().startsWith('nation_'),
  goodId: z.string().min(1),
  quantity: z.number().min(0),
  unitPrice: z.number().min(0),
  value: z.number().min(0),
  tariff: z.number().min(0),
  loss: z.number().min(0),
});

const economyEventSchema = z.object({
  id: z.string().min(1),
  powerId: z.string().startsWith('nation_'),
  kind: z.enum(['mat-mua', 'doi-kem', 'lam-phat', 'vo-no', 'bung-no', 'phuc-hoi']),
  year: z.number().int(),
  month: z.number().int().min(1).max(12),
  severity: meter,
  text: z.string().min(1),
});

export const economySliceSchema = z.object({
  markets: z.array(nationalEconomySchema).default([]),
  routes: z.array(tradeRouteSchema).default([]),
  events: z.array(economyEventSchema).default([]),
  lastMonth: z.number().int().default(0),
  sequence: z.number().int().min(1).default(1),
});

export type EconomySliceState = z.infer<typeof economySliceSchema>;

export const economySlice: SliceDefinition = {
  id: 'economy',
  version: 1,
  schema: economySliceSchema,
  defaults: () => ({ markets: [], routes: [], events: [], lastMonth: 0, sequence: 1 }),
  permissions: {
    markets: 'engine',
    'markets.*': 'engine',
    routes: 'engine',
    'routes.*': 'engine',
    events: 'engine',
    'events.*': 'engine',
    lastMonth: 'engine',
    sequence: 'engine',
  },
};

export function economyStateOf(state: GameState | null): EconomySliceState | null {
  if (state === null) return null;
  const parsed = economySliceSchema.safeParse(state['economy']);
  return parsed.success ? parsed.data : null;
}

export function economyOf(state: GameState | null, powerId: string): EconomySliceState['markets'][number] | null {
  return economyStateOf(state)?.markets.find((market) => market.powerId === powerId) ?? null;
}
