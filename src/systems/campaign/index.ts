/**
 * CHIẾN ĐỒ — bản đồ chinh phục ba tầng, tách hẳn khỏi bản đồ đo đường đi của
 * Phần 15 (`src/sim/map.ts`, `data/world-map.json`).
 *
 * Cửa vào của cả hệ. Không module nào ngoài thư mục này được import thẳng
 * `./data` hay `./slice` — đi qua đây thì đổi cấu trúc bên trong không phải sửa
 * mười chỗ khác.
 */

export type {
  ArmyStance,
  CampaignArmy,
  CampaignConfig,
  CampaignFaction,
  CampaignLevel,
  CampaignLink,
  CampaignNode,
  ConquestProgress,
  LinkKind,
  MarchOrder,
  NodeStatus,
  SiegeMark,
  SiteKind,
} from './types';

export {
  CampaignDataError,
  ancestorAtLevel,
  ancestryOf,
  campaignConfig,
  campaignFaction,
  campaignFactions,
  campaignLinks,
  campaignNode,
  campaignNodes,
  campaignSize,
  childrenOfNode,
  districtsUnder,
  factionColor,
  factionName,
  isObjective,
  linkBetween,
  linksOf,
  neighbourIds,
  nodeForRegion,
  nodesAtLevel,
  objectivesUnder,
  terrainRow,
} from './data';

export {
  campaignSlice,
  campaignSliceSchema,
  campaignStateOf,
  emptyCampaign,
  withChronicle,
  type CampaignSliceState,
} from './slice';

export {
  canCapture,
  captureObjective,
  conquestOf,
  controllerOf,
  holderOf,
  isUnder,
  leadingAttackerOf,
  loyalTo,
  overlordChain,
  paintOf,
  realmsHeldBy,
  releaseVassal,
  statusOf,
  submitAsVassal,
  topLiegeOf,
  type ConquestOutcome,
  type NodePaint,
} from './conquest';

export { runCampaignTick, type CampaignTickResult } from './tick';

export {
  handleAiMarchOrders,
  marchableArmies,
  parseMarchOrders,
  stripMarchOrders,
  type AiMarchOutcome,
  type AiMarchRequest,
} from './tags';

export {
  advanceMarches,
  advanceSieges,
  armiesAt,
  armiesUnder,
  beginSiege,
  campaignRoute,
  deployArmy,
  liftSiege,
  moveArmyFromNarrative,
  orderMarch,
  placementOf,
  seatDistrictOf,
  type ArmyPlacement,
  type CampaignRoute,
  type MarchOutcome,
  type SiegeTickResult,
} from './march';

export { battleCampaignOps, siegeCampaignOps } from './combat';
