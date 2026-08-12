export { economyConfig, economyGood, economyGoods, economyProfile, economyProfiles } from './data';
export { advanceEconomyMonth, createEconomy, economySummary, type EconomyMonthResult } from './model';
export { economyOf, economySlice, economySliceSchema, economyStateOf, nationalEconomySchema, type EconomySliceState } from './slice';
export { runEconomyTick, type EconomyTickResult } from './tick';
export type {
  EconomyEvent,
  EconomyEventKind,
  EconomyGood,
  EconomyHistoryRow,
  EconomySummary,
  FiscalLedger,
  GoodGroup,
  GoodMarket,
  NationalEconomy,
  TradeRoute,
} from './types';
