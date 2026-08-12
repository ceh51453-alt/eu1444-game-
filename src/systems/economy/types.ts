export type GoodGroup = 'thiet-yeu' | 'nguyen-lieu' | 'che-tao' | 'quan-su' | 'xa-xi' | 'ma-thuat';

export interface EconomyGood {
  id: string;
  name: string;
  group: GoodGroup;
  basePrice: number;
  demandPerThousand: number;
  volatility: number;
  weight: number;
  seasonal: boolean;
}

export interface GoodMarket {
  goodId: string;
  production: number;
  consumption: number;
  stockpile: number;
  price: number;
  priceChange: number;
  imports: number;
  exports: number;
  unmetDemand: number;
}

export interface FiscalLedger {
  taxRevenue: number;
  tariffRevenue: number;
  tradeRevenue: number;
  administration: number;
  militaryExpense: number;
  debtService: number;
  relief: number;
  totalRevenue: number;
  totalExpense: number;
  net: number;
  tradeBalance: number;
}

export interface EconomyHistoryRow {
  year: number;
  month: number;
  gdp: number;
  growth: number;
  inflation: number;
  unemployment: number;
  foodPrice: number;
  treasury: number;
  tradeBalance: number;
}

export interface NationalEconomy {
  powerId: string;
  population: number;
  workforce: number;
  urbanization: number;
  productivity: number;
  unemployment: number;
  wages: number;
  costOfLiving: number;
  prosperity: number;
  poverty: number;
  inflation: number;
  gdp: number;
  growth: number;
  debt: number;
  interestRate: number;
  creditRating: number;
  infrastructure: number;
  tradeCapacity: number;
  taxRate: number;
  tariffRate: number;
  productionFactors: Record<string, number>;
  goods: GoodMarket[];
  ledger: FiscalLedger;
  history: EconomyHistoryRow[];
}

export interface TradeRoute {
  id: string;
  fromPowerId: string;
  toPowerId: string;
  goodId: string;
  quantity: number;
  unitPrice: number;
  value: number;
  tariff: number;
  loss: number;
}

export type EconomyEventKind = 'mat-mua' | 'doi-kem' | 'lam-phat' | 'vo-no' | 'bung-no' | 'phuc-hoi';

export interface EconomyEvent {
  id: string;
  powerId: string;
  kind: EconomyEventKind;
  year: number;
  month: number;
  severity: number;
  text: string;
}

export interface EconomySummary {
  totalGdp: number;
  totalPopulation: number;
  tradeVolume: number;
  averageInflation: number;
  averageUnemployment: number;
  richestPowerId: string;
  fastestGrowthPowerId: string;
  stressedMarkets: number;
}
