/**
 * THÀNH TRÌ: XÂY DỰNG MỘT ĐIỂM — Phần 12.
 *
 * Một thành trì là một ĐIỂM trên bản đồ: có toạ độ, có tường, có lưới ô, có công
 * trình cụ thể, có dân số đếm được, có kho hàng đếm được. Người chơi XÂY nó.
 *
 * LÃNH THỔ (Phần 13) là chuyện khác hẳn và ở một slice khác hẳn. Xem `README.md`
 * cùng thư mục cho bản kiểm tra ranh giới đầy đủ.
 *
 * Cửa vào của phần còn lại của game:
 *   `createHolding`             dựng một thành trì mới, một trong bốn con đường
 *   `advanceWeek`               một tuần: mùa, nhân công, sản xuất, xây, dân
 *   `upgrade` / `canUpgrade`    lên cấp, cần ĐỦ BỐN thứ
 *   `startProject`              đặt một công trình vào hàng đợi
 *   `fortificationFromHolding`  → Phần 11 (công sự)
 *   `garrisonOf`                → Phần 10 (đơn vị quân)
 *   `contribution` / `ship`     ba giao diện với lãnh thổ và với thành trì khác
 */

export type {
  BuildProject,
  Cell,
  HinterlandTile,
  Holding,
  HoldingSummary,
  HoldingTile,
  Obligations,
  Ownership,
  OwnershipPath,
  Permits,
  PlacedBuilding,
  Population,
  RaceCount,
  StratumCount,
} from './types';
export { OWNERSHIP_PATHS } from './types';

export {
  ADJACENCY_EFFECT_KEYS,
  BUILDING_GROUPS,
  HoldingDataError,
  adjacencyConfig,
  adjacencyRules,
  allBuildings,
  allResources,
  allTerrain,
  allTiers,
  architectConfig,
  buildingName,
  buildingOf,
  buildingsOfGroup,
  hinterlandTilesFor,
  holdingConfig,
  labourConfig,
  labourSeasonOf,
  labourSeasons,
  lowestTier,
  qualityConfig,
  resourceOf,
  skilledTrades,
  strata,
  stratumOf,
  terrainMatches,
  terrainOf,
  tierByRank,
  tierOf,
  unrestFor,
  upkeepConfig,
  type AdjacencyEffectKey,
  type AdjacencyRule,
  type Building,
  type BuildingGroup,
  type FortifyContribution,
  type GarrisonContribution,
  type HoldingConfig,
  type HoldingTerrain,
  type LabourSeason,
  type QualityConfig,
  type Resource,
  type SettlementTier,
  type SkilledTrade,
  type Stratum,
  type TierUpgrade,
  type UnrestRow,
} from './data';

export {
  HoldingGridError,
  canPlace,
  cellsOf,
  chebyshev,
  chokeFactor,
  expandGrid,
  freeCells,
  generateGrid,
  generateHinterland,
  growHinterland,
  hasWall,
  isBorderCell,
  occupy,
  placedAt,
  placementOptions,
  release,
  tileAt,
  type GridSetup,
  type PlacementCheck,
} from './grid';

export {
  adjacencyFor,
  adjacencyOf,
  noEffects,
  previewPlacement,
  type AdjacencyContext,
  type AdjacencyEffects,
  type AdjacencyLine,
  type HoldingAdjacency,
  type PlacementPreview,
} from './adjacency';

export {
  capacityOf,
  foodEaten,
  harvestFactor,
  labourOf,
  outputFactorOf,
  produce,
  type Capacity,
  type LabourPool,
  type Production,
  type ProductionContext,
} from './labour';

export {
  HoldingBuildError,
  advanceProjects,
  cancelProject,
  demolish,
  entityIdFor,
  needsPermit,
  payUpkeep,
  qualityBandFor,
  repair,
  startProject,
  type BuildWeekResult,
  type CompletedBuilding,
  type StartOptions,
  type StartResult,
  type UpkeepResult,
  type WeekOptions,
} from './build';

export {
  NO_LORD,
  advancePopulation,
  hireSkilled,
  moraleTarget,
  raceTensionOf,
  rebalanceStrata,
  tickTraining,
  type LordContext,
  type MoraleInput,
  type MoraleLine,
  type PopulationWeekResult,
} from './population';

export {
  HoldingFortifyError,
  fortificationFromHolding,
  siegeReadiness,
  type FortifyOptions,
  type SiegeReadiness,
} from './fortify';

export {
  dismissLevy,
  garrisonOf,
  levy,
  serviceDays,
  type GarrisonReport,
  type GarrisonSource,
  type LevyResult,
} from './garrison';

export {
  PATH_PROFILES,
  driftLegitimacy,
  holdingLabel,
  makeSeat,
  ownershipFor,
  seize,
  settleClaim,
  uniqueHoldingName,
  type PathProfile,
} from './ownership';

export {
  applyRealmOrder,
  contribution,
  payObligations,
  ship,
  surplusOf,
  workshopOf,
  type RealmOrder,
  type RealmOrderKind,
  type Shipment,
  type ShipmentResult,
  type Tribute,
} from './interfaces';

export { createHolding, tierForPopulation, type CreateHoldingOptions } from './create';

export {
  HOLDING_STREAM,
  advanceWeek,
  autoAssign,
  canUpgrade,
  nextWeek,
  qualityCheckId,
  summarize,
  upgrade,
  type UpgradeCheck,
  type UpgradeResult,
  type WeekInput,
  type WeekReport,
} from './week';

export {
  allHoldings,
  holdingById,
  holdingsSlice,
  holdingsSliceSchema,
  holdingsStateOf,
  seatOf,
  totalPopulation,
  type HoldingsSliceState,
} from './slice';
