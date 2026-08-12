/**
 * CỬA CỦA PHẦN 15.
 *
 * Phần còn lại của game nên nhập từ đây, không nhập thẳng vào file con — trừ hai
 * chỗ đã có tiền lệ trong dự án: `state/register.ts` nhập thẳng `./slice` để
 * tránh kéo cả tầng mô phỏng vào lúc khởi động, và `ai/query.ts` nhập thẳng
 * `./slice` cùng lý do (xem ghi chú ở đầu `query.ts` về barrel của Phần 14).
 */

export type {
  Agent,
  AgentGoal,
  AgentResources,
  AgentTier,
  ArrivedNews,
  EventOption,
  EventScope,
  NewsItem,
  PendingAction,
  Personality,
  TickReport,
  WorldEvent,
} from './types';

export {
  actionCatalogue,
  actionOf,
  carriers,
  carrierOf,
  costConfig,
  driftConfig,
  eventKinds,
  goalKinds,
  goalKindOf,
  intelKinds,
  magnitudeFactor,
  mapNodes,
  newsConfig,
  tierConfig,
  SimDataError,
} from './data';

export {
  absoluteMonth,
  agentOf,
  worldSlice,
  worldStateOf,
  type WorldSliceState,
} from './slice';

export { anchorOf, coordsOf, crowKm, edgesFrom, findRoute, graphSize, travelDays, type Edge, type Route } from './map';

export {
  activeGoal,
  createAgent,
  relevanceOf,
  retier,
  tierCounts,
  wake,
  type AgentSeed,
  type TierScore,
} from './agents';

export { decideTierB, advanceTierC, resourcePool, type Decision } from './decide';
export { askTierA, buildBatchPrompt, parseBatchReply, type BatchContext, type BatchDeps } from './batch';
export { resolveDecision, SIM_DOMAIN, type ResolveOutcome } from './resolve';

export {
  advanceNews,
  arrivalDate,
  carrierName,
  deliverNews,
  dispatchNews,
  intelBonusFor,
  DEFAULT_NAMES,
  type NameBook,
} from './news';

export {
  attribution,
  blinking,
  emitArrivals,
  emitSimEvents,
  filterFeed,
  isBlocking,
  markRead,
  pushFeed,
  stackCards,
  BLOCKING_IMPORTANCE,
  SIM_EVENT,
  SIM_NEWS,
  type FeedFilter,
} from './events';

export { askEventText, fillFromTemplates, needsLlmText, renderTemplate, LLM_TEXT_FLOOR } from './text';

export {
  agentSlotsLeft,
  canCallAgents,
  canCallText,
  costReport,
  initialBudget,
  rollMonth,
  setLlmEnabled,
  setMonthlyCap,
  spend,
  type Budget,
  type Pricing,
} from './cost';

export {
  appendLog,
  capDrift,
  enforceInvariants,
  type DriftResult,
  type InvariantResult,
  type PowerSnapshot,
  type TitleHolding,
} from './invariants';

export { advanceClock, runFastTick, type FastTickInput, type FastTickResult } from './fasttick';
export { runDeepTick, type DeepTickInput, type DeepTickResult } from './deeptick';
export { runWorldTick, MAX_CATCH_UP, WORLDTICK_STREAM, type WorldTickInput, type WorldTickResult } from './worldtick';
export { nameBookOf, powerSnapshots, powersAtWar, situationOf, titleHoldings } from './bridge';
export { ensureAgentsOp, seedAgents, seedableHouses, type SeedOptions } from './seed';
