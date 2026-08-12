/**
 * TÁM THẾ LỰC, TÁM LỐI CHƠI — Phần 14.
 *
 * Tầng thứ ba và là tầng cuối của bản đồ quyền lực: THÀNH TRÌ là một điểm (Phần
 * 12), LÃNH THỔ là một vùng (Phần 13), THẾ LỰC là một BÀN CỜ CHÍNH TRỊ.
 *
 * Quy tắc kiểm tra trước khi thêm bất cứ thứ gì vào thư mục này, viết tiếp mạch
 * của Phụ lục A: **có tọa độ thì thuộc thành trì; có phạm vi áp dụng thì thuộc
 * lãnh thổ; có PHE, PHIẾU, hoặc CHỮ KÝ thì thuộc thế lực.**
 *
 * Cửa vào của phần còn lại của game:
 *   `createWorld`         dựng tám thế lực, ma trận quan hệ, bản đồ tôn giáo
 *   `advanceWorldYear`    một năm của cả châu lục
 *   `accessTierFor`       ba tầng tiếp cận — quyết định LÀM ĐƯỢC GÌ
 *   `clarityFor`          độ rõ theo tri thức — quyết định THẤY ĐƯỢC GÌ
 *   `setPolicy`           bốn chính sách với thiểu số (mục 3)
 *   `applyRipple`         một biến cố dội sang các nước khác (mục 6)
 *   `exportForPart15`     bản tóm tắt cho mô phỏng ngầm
 *   `proclaim`            tuyên bố lớn → popup toàn thế giới (mục 12)
 *
 * TÁM MINIGAME KHÔNG Ở ĐÂY. Chúng nằm ở `/src/nations/*`, mỗi thế lực một thư
 * mục, và chúng chỉ nhập `types`, `data`, `events` của thư mục này — không nhập
 * barrel này, vì thế sẽ thành vòng import qua `year.ts`.
 */

export type {
  AccessTier,
  ByzantineBoard,
  ClarityLevel,
  CorpsState,
  ExileCommunity,
  FranceBoard,
  HordeBoard,
  HreBoard,
  LatinBoard,
  MinigameContext,
  MinigameKind,
  MinigameModule,
  MinigameYear,
  MinorityStatus,
  OttomanBoard,
  PapacyBoard,
  PopulationGroup,
  PowerBoard,
  PowerState,
  RelationRow,
  SwissBoard,
  WorldEvent,
} from './types';

export { BOARD_OF_KIND, MINIGAME_KINDS } from './boards';

export {
  NationDataError,
  accessTiers,
  bargainOf,
  clarityConfig,
  countryRankOf,
  countryRanks,
  corpsConfig,
  corpsRowOf,
  corpsRows,
  dietConfig,
  dietFactionName,
  diplomacyConfig,
  electors,
  heresyConfig,
  governmentFormOf,
  governmentForms,
  registeredCountryRankOf,
  registeredGovernmentFormOf,
  knownReligion,
  migrationConfig,
  minorityPolicies,
  policyOf,
  powerName,
  powerRowOf,
  powerRows,
  princes,
  reformOf,
  reformRows,
  relationBandFor,
  relationSeeds,
  religionRelation,
  religionSeeds,
  revoltConfig,
  rippleOf,
  ripples,
  settablePolicies,
  spreadConfig,
  techBranchOf,
  techConfig,
  treaties,
  treatyOf,
  type Bargain,
  type ClarityRow,
  type CountryRank,
  type CorpsRow,
  type DiplomacyConfig,
  type Elector,
  type HeresyConfig,
  type HeresyResponse,
  type MinorityPolicy,
  type PowerRow,
  type GovernmentForm,
  type Prince,
  type Reform,
  type Ripple,
  type TechBranch,
  type Treaty,
} from './data';

export {
  activeTreatyCount,
  canAddTreaty,
  countryElevationVerdict,
  countryRankEffectiveEffects,
  countryRankOfPower,
  countryRankSupportOf,
  countryStyleOf,
  elevateCountry,
  governmentFormOfPower,
  nextCountryRankOf,
  type CountryElevationContext,
  type CountryElevationVerdict,
  type CountryRankSupport,
  type CountryStyle,
} from './country-rank';

export {
  accessTierFor,
  accessTierOf,
  blurNumber,
  clarityFor,
  clarityOf,
  tierAllows,
  tierLabel,
  tierRank,
  type AccessInput,
  type ClarityInput,
} from './access';

export {
  DemographyError,
  advanceDemographics,
  contributionOf,
  createGroup,
  dominantRaceOf,
  manpowerOf,
  pickDestination,
  policyChoices,
  receiveMigrants,
  revoltRisk,
  setPolicy,
  type DemographyYear,
  type Departure,
} from './demographics';

export {
  ReligionError,
  advanceReligionYear,
  dominantFaith,
  oppress,
  preach,
  pushCrisis,
  respondToHeresy,
  seedAreas,
  shareOf,
  shift,
  tensionOf,
  type FaithArea,
  type FaithShare,
  type HeresyEcho,
  type ReligionYearReport,
} from './religion';

export {
  RelationError,
  adjustRelation,
  advanceRelationsYear,
  applyRipple,
  breakTreaty,
  declareWar,
  exportForPart15,
  powerWeight,
  pressClaim,
  relationBetween,
  relationRow,
  ripplesFrom,
  seedRelations,
  signTreaty,
  type CoreDelta,
  type RelationsYearReport,
  type RippleOutcome,
} from './relations';

export {
  FALL_EVENT,
  NATION_EVENT,
  PROCLAMATION_EVENT,
  emitFall,
  emitWorldEvent,
  emitWorldEvents,
  internalEvent,
  proclaim,
  type Proclamation,
} from './events';

export { createPowers, createWorld, type CreatedWorld } from './create';

export { NATIONS_STREAM, advanceWorldYear, type WorldYearInput, type WorldYearReport } from './year';

export {
  exileSchema,
  faithAreaSchema,
  nationsSlice,
  nationsSliceSchema,
  nationsStateOf,
  populationGroupSchema,
  powerOf,
  powerStateSchema,
  relationRowSchema,
  religionsSlice,
  religionsSliceSchema,
  religionsStateOf,
  worldEventSchema,
  type NationsSliceState,
  type ReligionsSliceState,
} from './slice';
