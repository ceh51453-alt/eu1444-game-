import { z } from 'zod';
import logisticsFile from '@data/logistics.json';
import type { SupplyType, TransportMode } from './types';

const supplySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  unit: z.string().min(1),
  needPerTroop: z.number().min(0),
  trainingNeedPerTroop: z.number().min(0),
  cost: z.number().min(0),
  depotShare: z.number().min(0).max(1),
  priority: z.number().int().min(1),
});

const transportSchema = z.object({
  id: z.enum(['duong-bo', 'duong-song', 'duong-bien', 'duong-nui']),
  name: z.string().min(1),
  capacityFactor: z.number().min(0),
  costFactor: z.number().min(0),
  lossFactor: z.number().min(0),
  winterFactor: z.number().min(0).max(1),
});

const schema = z.object({
  version: z.number().int(),
  config: z.object({
    reserveMonths: z.number().min(0),
    fieldReserveMonths: z.number().min(0),
    depotOpeningFill: z.number().min(0).max(1),
    depotReorderTarget: z.number().min(0).max(1),
    monthlyReplenishment: z.number().min(0).max(1),
    baseRouteLoss: z.number().min(0).max(1),
    winterMonths: z.array(z.number().int().min(1).max(12)),
    winterCapacityFactor: z.number().min(0).max(1),
    blockadeCapacityFactor: z.number().min(0).max(1),
    routeWearPerMonth: z.number().min(0),
    transportCostPerPoint: z.number().min(0),
    severeShortageAttrition: z.number().min(0).max(1),
    shortageAttrition: z.number().min(0).max(1),
  }),
  supplies: z.array(supplySchema).min(1),
  transportModes: z.array(transportSchema).min(1),
  terrainFactors: z.record(z.string(), z.number().min(0)).default({}),
});

const DATA = schema.parse(logisticsFile);

export type LogisticsConfig = z.infer<typeof schema>['config'];
export type TransportProfile = z.infer<typeof transportSchema>;

export function logisticsConfig(): LogisticsConfig {
  return { ...DATA.config, winterMonths: [...DATA.config.winterMonths] };
}

export function supplyTypes(): SupplyType[] {
  return DATA.supplies.map((supply) => ({ ...supply }));
}

export function supplyTypeOf(id: string): SupplyType | null {
  return DATA.supplies.find((supply) => supply.id === id) ?? null;
}

export function transportProfiles(): TransportProfile[] {
  return DATA.transportModes.map((mode) => ({ ...mode }));
}

export function transportProfile(mode: TransportMode): TransportProfile {
  const found = DATA.transportModes.find((row) => row.id === mode);
  if (found === undefined) throw new Error(`không có phương thức vận tải ${mode}`);
  return found;
}

export function terrainFactor(terrain: string): number {
  return DATA.terrainFactors[terrain] ?? 0.75;
}
