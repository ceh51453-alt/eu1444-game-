/**
 * VÂY HÃM VÀ TỔNG CÔNG — Phần 11.
 *
 * Cửa vào của phần còn lại của game:
 *   `createSiege`        dựng một cuộc vây hãm từ một khuôn công sự và một đạo quân
 *   `runWeek`            một tuần: hai bên đã chọn hành động, engine lo phần còn lại
 *   `fastForward`        chạy nhiều tuần, tự dừng khi có việc phải quyết (mục 3)
 *   `resolveEvent`       người chơi chốt một popup đang treo (mục 4)
 *   `parley` · `signContract` · `breakContract`   đàm phán và khế ước (mục 5)
 *   `sackOrSpare` · `reputationOps`               cướp phá, tha, và tiếng tàn bạo (mục 7)
 *   `buildSiegeChronicle` · `siegeChronicleFor`   biên niên kiểu biên niên sử (mục 8)
 *   `registerSiegeSources`                        cắm mười một nguồn vào registry Phần 5
 *
 * Hai bảng hành động KHÔNG ở đây — chúng ở `minigames/siege-attack/` và
 * `minigames/siege-defense/`, mỗi bảng một thư mục, và lõi vây hãm cố ý không
 * biết bảng nào tồn tại (xem chú thích đầu `engine.ts`).
 *
 * Xem `README.md` cùng thư mục cho hợp đồng đọc/ghi state.
 */

export {
  SiegeDataError,
  allEngineTypes,
  allFortTemplates,
  allPackages,
  allRations,
  allSeasons,
  allSiegeEvents,
  allTerms,
  assaultConfig,
  assaultLayerOf,
  assaultLayers,
  assaultMethodOf,
  assaultMethods,
  counterMineConfig,
  crowdingBand,
  engineConfig,
  engineTypeOf,
  eventsConfig,
  fortTemplateOf,
  minerBonus,
  miningConfig,
  nextSeason,
  packageOf,
  parleyConfig,
  rationOf,
  sackConfig,
  seasonOf,
  siegeConfig,
  termOf,
  type AssaultConfig,
  type AssaultLayer,
  type AssaultMethod,
  type ContractConfig,
  type CounterMineConfig,
  type EngineConfig,
  type EventsConfig,
  type FortTemplate,
  type MiningConfig,
  type ParleyConfig,
  type ParleyModifiers,
  type RationLevel,
  type SackConfig,
  type Season,
  type SiegeConfig,
  type SiegeEngineType,
  type SiegeEventDef,
  type SiegeEventOption,
  type SurrenderTerm,
  type TermPackage,
} from './data';

export {
  buildFortification,
  canFallBack,
  cloneFortification,
  collapseByMine,
  crossSection,
  damageGate,
  damageWall,
  defenceDensity,
  fallBack,
  killGarrison,
  repairWall,
  wallShare,
  type FallBack,
  type FortSetup,
  type LayerView,
  type WallDamage,
} from './fortification';

export {
  ASSAULT_DOMAIN,
  BALANCE_SOURCE_ID,
  BOMBARD_DOMAIN,
  COUNTERMINE_DOMAIN,
  DARK_SOURCE_ID,
  DENSITY_SOURCE_ID,
  DISEASE_DOMAIN,
  HUNGER_SOURCE_ID,
  HYGIENE_SOURCE_ID,
  METHOD_SOURCE_ID,
  MINE_DOMAIN,
  PARLEY_DOMAIN,
  RELIEF_SOURCE_ID,
  REPUTATION_SOURCE_ID,
  SEASON_SOURCE_ID,
  SERVICE_SOURCE_ID,
  SIEGE_MORALE_DOMAIN,
  SIEGE_SOURCES,
  SORTIE_DOMAIN,
  WALL_SOURCE_ID,
  describeView,
  makeView,
  publishSiege,
  registerSiegeSources,
  siegeView,
  withSiegeView,
  type SiegeView,
} from './modifiers';

export {
  advanceSeason,
  attritionTick,
  bombardTick,
  consumeTick,
  diseaseTick,
  engineBuildTick,
  gauges,
  killBesieger,
  killDefender,
  mineTick,
  moraleTick,
  repairTick,
  serviceTick,
  siegeCheck,
  threeD6Target,
  type AttritionReport,
  type BombardReport,
  type ConsumeReport,
  type DiseaseReport,
  type EngineReport,
  type MineReport,
  type MoraleReport,
  type RepairReport,
  type ServiceReport,
  type SiegeCheckSpec,
  type SiegeGauges,
} from './week';

export {
  applyEffects,
  autoChooseOption,
  chooseEventOption,
  eventAvailable,
  eventDefOf,
  optionsFor,
  rollEvent,
} from './events';

export {
  askWeight,
  autoOffer,
  breakContract,
  canParley,
  contractTick,
  parley,
  settleTerms,
  signContract,
  termsFor,
  type ContractTick,
  type ParleyOffer,
  type ParleyOutcome,
  type TermsOutcome,
} from './parley';

export { mayChoose, reputationOps, sackOrSpare, sackPressure, spoils, type SackOutcome, type SiegeSpoils } from './sack';

export { buildSiegeChronicle, siegeChronicleFor } from './chronicle';

export {
  SIEGE_STREAM,
  SiegeError,
  cloneSiege,
  createSiege,
  defaultTerms,
  fastForward,
  hostilitiesFrozen,
  mouths,
  openMine,
  resolveEvent,
  runWeek,
  settle,
  summarise,
  type BesiegerSetup,
  type DefenderSetup,
  type FastForward,
  type SiegeAction,
  type SiegeSetup,
  type SiegeSummary,
  type WeekPlan,
  type WeekResult,
} from './engine';

export { churchOf, crueltyOf, mercyOf, siegeSlice, siegeStateOf, type SiegeSliceState } from './slice';

export {
  HELD_LAYER_LABELS,
  PHASE_LABELS,
  SIDE_LABELS,
  SIEGE_ENDINGS,
  campSupplyWeeks,
  emptyLedger,
  engineById,
  foodWeeksLeft,
  garrisonMen,
  heldWall,
  ledgerDead,
  ledgerTotal,
  liveEngines,
  mouthsInside,
  otherSiegeSide,
  type AssaultState,
  type AssaultWave,
  type Bailey,
  type BesiegerState,
  type DefenderState,
  type Fortification,
  type GarrisonUnit,
  type Gatehouse,
  type HeldLayerId,
  type Keep,
  type LossLedger,
  type MineShaft,
  type Moat,
  type ParleyRecord,
  type SiegeCheck,
  type SiegeEngineInstance,
  type SiegeEventRecord,
  type SiegeLogLine,
  type SiegePhase,
  type SiegeSide,
  type SiegeState,
  type Supplies,
  type SurrenderContract,
  type WallLayer,
  type WallTower,
  type WeekReport,
} from './types';
