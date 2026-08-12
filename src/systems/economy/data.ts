import { z } from 'zod';
import economyFile from '@data/economy.json';
import type { EconomyGood } from './types';

const goodSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  group: z.enum(['thiet-yeu', 'nguyen-lieu', 'che-tao', 'quan-su', 'xa-xi', 'ma-thuat']),
  basePrice: z.number().min(0.01),
  demandPerThousand: z.number().min(0),
  volatility: z.number().min(0),
  weight: z.number().min(0),
  seasonal: z.boolean().default(false),
});

const profileSchema = z.object({
  powerId: z.string().startsWith('nation_'),
  population: z.number().min(1),
  urbanization: z.number().min(0).max(1),
  productivity: z.number().min(0).max(100),
  taxRate: z.number().min(0).max(1),
  tariffRate: z.number().min(0).max(1),
  infrastructure: z.number().min(0).max(100),
  tradeCapacity: z.number().min(0).max(100),
  debt: z.number().min(0),
  production: z.record(z.string(), z.number().min(0)).default({}),
});

const schema = z.object({
  version: z.number().int(),
  config: z.object({
    populationGrowthAnnual: z.number(),
    populationDeclineFloor: z.number(),
    stockpileTargetMonths: z.number().min(0),
    priceMinFactor: z.number().min(0.01),
    priceMaxFactor: z.number().min(1),
    priceAdjustment: z.number().min(0),
    warProductionFactor: z.number().min(0).max(1),
    warTradeFactor: z.number().min(0).max(1),
    tradeRelationFloor: z.number().min(-100).max(100),
    routeLoss: z.number().min(0).max(1),
    militaryExpensePerPoint: z.number().min(0),
    administrationPerLand: z.number().min(0),
    debtCrisisRatio: z.number().min(0),
    faminePriceFactor: z.number().min(1),
    historyMonths: z.number().int().min(1),
  }),
  goods: z.array(goodSchema).min(1),
  profiles: z.array(profileSchema).min(1),
});

const DATA = schema.parse(economyFile);

export type EconomyConfig = z.infer<typeof schema>['config'];
export type EconomyProfile = z.infer<typeof profileSchema>;

export function economyConfig(): EconomyConfig {
  return DATA.config;
}

export function economyGoods(): EconomyGood[] {
  return DATA.goods.map((good) => ({ ...good }));
}

export function economyGood(id: string): EconomyGood | null {
  return DATA.goods.find((good) => good.id === id) ?? null;
}

export function economyProfiles(): EconomyProfile[] {
  return DATA.profiles.map((profile) => ({ ...profile, production: { ...profile.production } }));
}

export function economyProfile(powerId: string): EconomyProfile | null {
  const profile = DATA.profiles.find((row) => row.powerId === powerId);
  return profile === undefined ? null : { ...profile, production: { ...profile.production } };
}
