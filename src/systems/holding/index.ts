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
  Obligations,
  Ownership,
  OwnershipPath,
  Permits,
  PlacedBuilding,
  Population,
  RaceCount,
  StratumCount,
  TerrainHint,
} from './types';
export { OWNERSHIP_PATHS } from './types';

// --- mảnh đất: tỉ lệ, trường địa hình, mạch tài nguyên, tuyến tường ---------

export {
  CELL_M,
  CENTER_CELL,
  DEFAULT_CLEARANCE_CELLS,
  GRID_CELLS,
  KEEP_YARD_CELLS,
  SPAN_M,
  cellsToMetres,
  discAreaKm2,
  distanceFromCentre,
  inGrid,
  legacyCellToNew,
  metresToCells,
  planningRadiusCells,
} from './scale';

export {
  TERRAIN_ORDER,
  TERRAIN_PROFILES,
  clearFieldCache,
  elevationAt,
  fieldRasterRGBA,
  generateField,
  isWaterTerrain,
  sampleField,
  seedFromId,
  terrainAt,
  terrainTally,
  terrainsUnder,
  waterNearby,
  type FieldOptions,
  type HoldingField,
  type RiverPoint,
  type TerrainProfile,
} from './field';

export {
  GRADE_LABEL,
  GRADE_MULTIPLIER,
  GRADE_RADIUS,
  NODE_LIMIT,
  NODE_ZONES,
  NODE_ZONE_DEFS,
  DECLINE_WEEKS,
  GROW_WEEKS,
  SEASON_GROWTH,
  bestNodeFor,
  bindNode,
  describeNode,
  ensureNodes,
  generateNodes,
  gradeReserve,
  inKeepYard,
  isRenewable,
  mineralReserve,
  nodeAreaKm2,
  nodeById,
  nodeCapacity,
  nodeHasRoom,
  nodeMultiplier,
  nodeShare,
  nodeYields,
  nodesInReach,
  nodesUnder,
  pointInNode,
  regenPerWeek,
  tickNode,
  tickNodes,
  zoneRenewal,
  type NodePoint,
  type NodeRenewal,
  type NodeTick,
  type NodeZone,
  type NodeZoneDef,
  type ResourceNode,
} from './nodes';

export {
  HoldingWallError,
  MAX_WALL_CELLS,
  WALL_MATERIALS,
  assignLayers,
  demolishWall,
  describeWall,
  distanceToWall,
  enclosedArea,
  hasWallOfLeast,
  innerWall,
  insideWall,
  isClosed,
  outerWall,
  planWall,
  standingWalls,
  startWall,
  upgradeWall,
  wallDensity,
  wallIntegrity,
  wallLength,
  wallMaterialOf,
  wallPrerequisiteOf,
  wallUpkeep,
  watchmenNeeded,
  type StartWallOptions,
  type WallBuildResult,
  type WallLayer,
  type WallLine,
  type WallMaterialDef,
  type WallPlan,
  type WallPoint,
} from './walls';

export {
  HoldingRoadError,
  MAX_ROAD_CELLS,
  ROAD_SURFACES,
  describeRoad,
  isRazed,
  pavedAreaM2,
  pavedMetres,
  pavedRoads,
  pavingHygiene,
  planRoad,
  razeStreet,
  removeRoad,
  restoreStreets,
  roadLength,
  roadSurfaceOf,
  roadUpkeep,
  startRoad,
  type RoadBuildResult,
  type RoadLine,
  type RoadPlan,
  type RoadSurfaceDef,
  type StartRoadOptions,
} from './roads';

export {
  STREET_KIND_NAMES,
  STREET_WIDTH,
  clearStreetCache,
  connectorLanes,
  describeStreet,
  distanceToStreet,
  gatesOn,
  pointAlong,
  streetLength,
  streetNetwork,
  type Bridge,
  type Gate,
  type Street,
  type StreetKind,
  type StreetNetwork,
  type StreetStop,
} from './streets';

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
  clearanceOf,
  footprintOf,
  hinterlandTilesFor,
  isWallBound,
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
  HoldingPlaceError,
  WALL_BOUND_CELLS,
  buildingAt,
  canPlace,
  cellsOf,
  centreOf,
  chokeFactor,
  fieldOf,
  findSpot,
  freeArea,
  hasRoomFor,
  hasWall,
  hinterlandOf,
  holdingStreets,
  inPlanningArea,
  nodeOfBuilding,
  occupiedRects,
  placementOptions,
  planningRadius,
  rectOf,
  terrainAtCell,
  walledAreaKm2,
  type PlacedRect,
  type PlacementCheck,
  type PlacementOptions,
} from './place';

export {
  builtCount,
  centreOfPlaced,
  layoutHolding,
  relocate,
  repairLayout,
  startingLayout,
  type LayoutItem,
  type RepairReport,
} from './layout';

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
  MAX_WEEKS_PER_TICK,
  daysToSettlement,
  runHoldingTick,
  type HoldingTickInput,
  type HoldingTickResult,
} from './tick';

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
