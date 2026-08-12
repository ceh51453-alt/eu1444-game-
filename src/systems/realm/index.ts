/**
 * LÃNH THỔ: CAI TRỊ MỘT VÙNG — Phần 13.
 *
 * Một lãnh thổ là một VÙNG: nhiều tỉnh, mỗi tỉnh chứa nhiều thành trì. KHÔNG có
 * lưới ô, KHÔNG đặt công trình nào, chỉ ban chính sách, thu thuế, bổ nhiệm, xử
 * án, giữ chư hầu (mục 1).
 *
 * QUY TẮC KIỂM TRA, đọc trước khi thêm bất kỳ thứ gì vào thư mục này: **nếu thứ
 * đó có TỌA ĐỘ thì nó thuộc thành trì; nếu nó chỉ có PHẠM VI ÁP DỤNG thì nó thuộc
 * lãnh thổ.**
 *
 * Cửa vào của phần còn lại của game:
 *   `createRealm`                dựng một vùng từ `data/provinces.json`
 *   `advanceRealmYear`           một năm: thu, chi, tỉnh, dự án, chư hầu, tòa án
 *   `collectTaxes` / `setRate`   thuế của DÂN — không phải nghĩa vụ của thành trì
 *   `issueLaw` / `lawOrder`      ban luật, và tờ lệnh đi xuống Phần 12
 *   `grantPermit`                cấp giấy phép xây → Phần 12 mục 3
 *   `judge` / `judicialDuelRequest`  xử án, và cửa sang Phần 9
 *   `callHost` / `siegeServiceDays`  gọi quân, và hạn nghĩa vụ → Phần 11
 *   `rebellionRisk` / `checkRebellion`  mối đe dọa thường trực của mục 7
 *
 * BỐN CHỖ DUY NHẤT thư mục này chạm tới Phần 12, và cả bốn đều là `import type`:
 * `Tribute` đi VÀO qua tham số (`year.ts`, `levy.ts`), `RealmOrder` đi RA từ
 * `laws.ts` và `permits.ts`. Không hàm nào nhận một `Holding`, không hàm nào đọc
 * `state['holdings']`.
 */

export type {
  ActiveProject,
  CourtAppointment,
  CourtCase,
  Faction,
  Grievance,
  Province,
  RealmLedger,
  Vassal,
} from './types';

export {
  RealmDataError,
  allLaws,
  allProjects,
  allTerrains,
  banditryBandFor,
  banditryConfig,
  caseTypeOf,
  caseTypes,
  climateOf,
  developmentConfig,
  infrastructureKeys,
  justiceConfig,
  lawName,
  lawOf,
  lawsForRank,
  levyConfig,
  permitConfig,
  projectOf,
  provinceRowOf,
  provinceRows,
  provinceRowsOfRealm,
  roadLevelOf,
  roadLevels,
  taxConfig,
  taxGroupOf,
  taxGroups,
  terrainOf,
  unrestBandFor,
  unrestConfig,
  verdictOf,
  verdicts,
  type BanditryBand,
  type CaseType,
  type Climate,
  type JusticeConfig,
  type Law,
  type LawEffects,
  type PermitConfig,
  type ProvinceRow,
  type ProvinceTerrain,
  type RealmProject,
  type RoadLevel,
  type TaxConfig,
  type TaxGroup,
  type UnrestBand,
  type UnrestConfig,
  type Verdict,
} from './data';

export {
  RealmProvinceError,
  advanceProvinceYear,
  createProvince,
  daysRide,
  households,
  levyEstimate,
  patrol,
  provinceFromId,
  provinceLabel,
  provinceName,
  suppress,
  yieldFactor,
  type PatrolResult,
  type ProvinceYearInput,
  type ProvinceYearResult,
  type SuppressResult,
} from './province';

export {
  averageOverBase,
  collectTaxes,
  defaultRates,
  maxRates,
  rateLabel,
  setRate,
  taxPressure,
  type RevenueResult,
  type TaxPressure,
} from './taxes';

export {
  RealmLawError,
  applyOneOffLaw,
  canIssue,
  foldLaws,
  issueLaw,
  lawLabel,
  lawOrder,
  lawsAvailable,
  lawsOn,
  permitRequiredFromTier,
  repealLaw,
  type IssueResult,
  type LawVerdict,
  type OneOffLawResult,
} from './laws';

export {
  RealmVassalError,
  addGrievance,
  adjustVassalLoyalty,
  applyLoyaltyEvent,
  checkRebellion,
  createVassal,
  formFaction,
  giftCost,
  grievanceWeight,
  loyaltyYear,
  persuade,
  powerOf,
  refreshFaction,
  rebellionRisk,
  submit,
  vassalCapOf,
  type CreateVassalOptions,
  type LoyaltyEvent,
  type LoyaltyLine,
  type LoyaltyPressure,
  type RebellionCheck,
  type RebellionRisk,
} from './vassals';

export {
  RealmCourtError,
  appoint,
  blunder,
  courtBonus,
  courtEffects,
  dismiss,
  skim,
  vacantSeats,
  type AppointOptions,
  type BlunderResult,
  type CourtEffects,
  type SkimResult,
} from './court';

export {
  RealmJusticeError,
  applyDuelVerdict,
  backlogUnrest,
  judge,
  judicialDuelRequest,
  openCase,
  rollCaseType,
  verdictOptions,
  type DuelVerdictResult,
  type JudgeResult,
  type JudicialDuelRequest,
  type OpenCaseOptions,
} from './justice';

export {
  grantPermit,
  permitVerdict,
  punishIllegalWorks,
  refusePermit,
  type IllegalWorkResult,
  type PermitRequest,
  type PermitResult,
  type PermitVerdict,
} from './permits';

export {
  RealmProjectError,
  advanceProjects,
  canStart,
  projectsAvailable,
  startProject,
  travelWeeks,
  type ProjectVerdict,
  type ProjectYearResult,
} from './projects';

export {
  callHost,
  siegeServiceDays,
  type CallHostInput,
  type Contingent,
  type HostCall,
} from './levy';

export {
  attachHolding,
  createRealm,
  detachHolding,
  uniqueRealmName,
  type CreateRealmOptions,
} from './create';

export {
  REALM_STREAM,
  advanceRealmYear,
  type RealmYearInput,
  type RealmYearReport,
  type VassalYearRow,
} from './year';

export {
  allProvinces,
  allVassals,
  provinceById,
  provinceSchema,
  provincesOfFief,
  realmSlice,
  realmSliceSchema,
  realmStateOf,
  vassalById,
  vassalSchema,
  vassalsSlice,
  vassalsSliceSchema,
  vassalsStateOf,
  type RealmSliceState,
  type VassalsSliceState,
} from './slice';
