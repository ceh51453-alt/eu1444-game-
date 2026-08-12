import { z } from 'zod';
import type { GameState, SliceDefinition } from '@/state/slices';

const sourceSchema = z.enum(['levy', 'mercenary', 'barracks']);
const stockSchema = z.object({
  supplyId: z.string().min(1),
  amount: z.number().min(0),
  capacity: z.number().min(0),
});

const logisticsSchema = z.object({
  depots: z.array(z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    location: z.string().min(1),
    capacity: z.number().min(0),
    condition: z.number().min(0).max(100),
    security: z.number().min(0).max(100),
    besieged: z.boolean(),
    stocks: z.array(stockSchema),
  })).default([]),
  routes: z.array(z.object({
    id: z.string().min(1),
    fromDepotId: z.string().min(1),
    toForceId: z.string().min(1),
    mode: z.enum(['duong-bo', 'duong-song', 'duong-bien', 'duong-nui']),
    terrain: z.string().min(1),
    distance: z.number().min(0),
    capacity: z.number().min(0),
    condition: z.number().min(0).max(100),
    risk: z.number().min(0).max(100),
    escort: z.number().min(0).max(100),
    blockaded: z.boolean(),
    active: z.boolean(),
    deliveredLastMonth: z.number().min(0),
    lostLastMonth: z.number().min(0),
    costLastMonth: z.number().min(0),
  })).default([]),
  forces: z.array(z.object({
    forceId: z.string().min(1),
    priority: z.number().int().min(1).max(5),
    ration: z.enum(['giam', 'thuong', 'day-du']),
    condition: z.enum(['du-day', 'cang', 'thieu', 'bi-cat']),
    supplyLevel: z.number().min(0).max(100),
    daysOfSupply: z.number().min(0),
    demand: z.array(z.object({ supplyId: z.string().min(1), amount: z.number().min(0) })),
    delivered: z.array(z.object({ supplyId: z.string().min(1), amount: z.number().min(0) })),
    carried: z.array(stockSchema),
    shortages: z.array(z.string()).default([]),
    transportCapacity: z.number().min(0),
    transportUsed: z.number().min(0),
    losses: z.number().min(0),
  })).default([]),
  lastMonth: z.number().int().default(0),
  monthlyCost: z.number().min(0).default(0),
  monthlyDelivered: z.number().min(0).default(0),
  monthlyLost: z.number().min(0).default(0),
  report: z.array(z.string()).default([]),
});

const militaryUnitSchema = z.object({
  id: z.string().min(1),
  typeId: z.string().min(1),
  name: z.string().min(1),
  source: sourceSchema,
  strength: z.number().int().min(0),
  morale: z.number().min(0).max(100),
  experience: z.number().min(0).max(100),
  training: z.number().min(0).max(100),
  monthlyUpkeep: z.number().min(0),
});

const forceSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: z.enum(['land', 'navy']),
  commander: z.string().default(''),
  location: z.string().default('tòa chính'),
  units: z.array(militaryUnitSchema).default([]),
});

const recruitmentSchema = z.object({
  id: z.string().min(1),
  typeId: z.string().min(1),
  unitName: z.string().min(1),
  source: sourceSchema,
  forceKind: z.enum(['land', 'navy']).default('land'),
  companies: z.number().int().min(1),
  strength: z.number().int().min(1),
  destinationId: z.string().min(1),
  monthsTotal: z.number().int().min(1),
  monthsLeft: z.number().int().min(1),
  moneyCost: z.number().min(0),
  logisticsCost: z.number().min(0),
  manpowerCost: z.number().int().min(0),
  monthlyUpkeep: z.number().min(0),
  requestedBy: z.enum(['player', 'ai']),
  requestedOn: z.object({
    year: z.number().int(),
    month: z.number().int().min(1).max(12),
    day: z.number().int().min(1).max(31),
    hour: z.number().int().min(0).max(23),
  }),
});

export const militarySliceSchema = z.object({
  forces: z.array(forceSchema).default([]),
  recruitment: z.array(recruitmentSchema).default([]),
  nextForceNo: z.number().int().min(1).default(1),
  nextOrderNo: z.number().int().min(1).default(1),
  nextUnitNo: z.number().int().min(1).default(1),
  lastMonthlyReport: z.array(z.string()).default([]),
  logistics: logisticsSchema.default({
    depots: [],
    routes: [],
    forces: [],
    lastMonth: 0,
    monthlyCost: 0,
    monthlyDelivered: 0,
    monthlyLost: 0,
    report: [],
  }),
});

export type MilitarySliceState = z.infer<typeof militarySliceSchema>;

export const militarySlice: SliceDefinition = {
  id: 'military',
  version: 1,
  schema: militarySliceSchema,
  defaults: () => ({
    forces: [],
    recruitment: [],
    nextForceNo: 1,
    nextOrderNo: 1,
    nextUnitNo: 1,
    lastMonthlyReport: [],
    logistics: {
      depots: [],
      routes: [],
      forces: [],
      lastMonth: 0,
      monthlyCost: 0,
      monthlyDelivered: 0,
      monthlyLost: 0,
      report: [],
    },
  }),
  permissions: {
    forces: 'engine',
    'forces.*': 'engine',
    recruitment: 'engine',
    'recruitment.*': 'engine',
    nextForceNo: 'engine',
    nextOrderNo: 'engine',
    nextUnitNo: 'engine',
    lastMonthlyReport: 'engine',
    'lastMonthlyReport.*': 'engine',
    logistics: 'engine',
    'logistics.*': 'engine',
  },
};

export function militaryStateOf(state: GameState | null): MilitarySliceState | null {
  if (state === null) return null;
  const parsed = militarySliceSchema.safeParse(state['military']);
  return parsed.success ? parsed.data : null;
}
