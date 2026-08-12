import type { GameDate } from '@/core/clock';

export type ForceKind = 'land' | 'navy';
export type RecruitmentSource = 'levy' | 'mercenary' | 'barracks';
export type RecruitmentRequester = 'player' | 'ai';

export interface MilitaryUnit {
  id: string;
  typeId: string;
  name: string;
  source: RecruitmentSource;
  strength: number;
  morale: number;
  experience: number;
  training: number;
  monthlyUpkeep: number;
}

export interface MilitaryForce {
  id: string;
  name: string;
  kind: ForceKind;
  commander: string;
  location: string;
  units: MilitaryUnit[];
}

export interface RecruitmentOrder {
  id: string;
  typeId: string;
  unitName: string;
  source: RecruitmentSource;
  forceKind: ForceKind;
  companies: number;
  strength: number;
  destinationId: string;
  monthsTotal: number;
  monthsLeft: number;
  moneyCost: number;
  logisticsCost: number;
  manpowerCost: number;
  monthlyUpkeep: number;
  requestedBy: RecruitmentRequester;
  requestedOn: GameDate;
}

export interface MilitaryResources {
  population: number;
  manpowerCapacity: number;
  logisticsCapacity: number;
  barracks: number;
  barracksCapacity: number;
  roadCapacity?: number;
  depotSites?: LogisticsDepotSite[];
}

export type SupplyId = 'luong-thuc' | 'co-kho' | 'dan-duoc' | 'trang-bi' | 'duoc-pham' | 'vat-tu-hai-quan';
export type TransportMode = 'duong-bo' | 'duong-song' | 'duong-bien' | 'duong-nui';
export type SupplyCondition = 'du-day' | 'cang' | 'thieu' | 'bi-cat';
export type RationPolicy = 'giam' | 'thuong' | 'day-du';

export interface SupplyType {
  id: string;
  name: string;
  unit: string;
  needPerTroop: number;
  trainingNeedPerTroop: number;
  cost: number;
  depotShare: number;
  priority: number;
}

export interface SupplyStock {
  supplyId: string;
  amount: number;
  capacity: number;
}

export interface LogisticsDepotSite {
  id: string;
  name: string;
  capacity: number;
  condition: number;
  besieged: boolean;
}

export interface LogisticsDepot {
  id: string;
  name: string;
  location: string;
  capacity: number;
  condition: number;
  security: number;
  besieged: boolean;
  stocks: SupplyStock[];
}

export interface SupplyRoute {
  id: string;
  fromDepotId: string;
  toForceId: string;
  mode: TransportMode;
  terrain: string;
  distance: number;
  capacity: number;
  condition: number;
  risk: number;
  escort: number;
  blockaded: boolean;
  active: boolean;
  deliveredLastMonth: number;
  lostLastMonth: number;
  costLastMonth: number;
}

export interface SupplyAmount {
  supplyId: string;
  amount: number;
}

export interface ForceLogistics {
  forceId: string;
  priority: number;
  ration: RationPolicy;
  condition: SupplyCondition;
  supplyLevel: number;
  daysOfSupply: number;
  demand: SupplyAmount[];
  delivered: SupplyAmount[];
  carried: SupplyStock[];
  shortages: string[];
  transportCapacity: number;
  transportUsed: number;
  losses: number;
}

export interface LogisticsState {
  depots: LogisticsDepot[];
  routes: SupplyRoute[];
  forces: ForceLogistics[];
  lastMonth: number;
  monthlyCost: number;
  monthlyDelivered: number;
  monthlyLost: number;
  report: string[];
}

export interface MilitarySummary {
  totalTroops: number;
  landTroops: number;
  navyPersonnel: number;
  armies: number;
  fleets: number;
  morale: number;
  experience: number;
  training: number;
  monthlyUpkeep: number;
  logisticsUsed: number;
  manpowerUsed: number;
  queuedTroops: number;
}
