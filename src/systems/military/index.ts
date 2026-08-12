export type {
  ForceKind,
  MilitaryForce,
  MilitaryResources,
  MilitarySummary,
  MilitaryUnit,
  RecruitmentOrder,
  RecruitmentRequester,
  RecruitmentSource,
} from './types';
export { runMilitaryMonthTick, type MilitaryTickResult } from './tick';
export { militarySlice, militarySliceSchema, militaryStateOf, type MilitarySliceState } from './slice';
export {
  advanceMilitaryMonth,
  militaryResourcesOf,
  recruitableTypeOf,
  recruitUnit,
  recruitmentOption,
  recruitmentOptions,
  sourceFor,
  summaryOf,
  type MilitaryMonthResult,
  type RecruitInput,
  type RecruitResult,
  type RecruitmentOption,
} from './recruitment';
export {
  handleAiRecruitment,
  parseRecruitmentRequests,
  stripRecruitmentRequests,
  type AiRecruitmentOutcome,
  type AiRecruitmentRequest,
} from './tags';
export {
  advanceLogisticsMonth,
  ensureLogisticsNetwork,
  logisticsSummaryOf,
  setForceSupplyPolicy,
  setSupplyRoute,
  type LogisticsMonthContext,
  type LogisticsMonthResult,
  type LogisticsSummary,
} from './logistics';
export { logisticsConfig, supplyTypeOf, supplyTypes, transportProfile, transportProfiles } from './logistics-data';
export type {
  ForceLogistics,
  LogisticsDepot,
  LogisticsDepotSite,
  LogisticsState,
  RationPolicy,
  SupplyAmount,
  SupplyCondition,
  SupplyId,
  SupplyRoute,
  SupplyStock,
  SupplyType,
  TransportMode,
} from './types';
