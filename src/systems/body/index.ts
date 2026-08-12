/**
 * CƠ THỂ, THƯƠNG TÍCH, Y HỌC THẾ KỶ 14 — Phần 7.
 *
 * Hai mươi vùng, mười loại thương tích, biến chứng dây chuyền, tàn phế vĩnh
 * viễn, và năm cửa tử. KHÔNG có thanh máu tổng: người chơi phải nhìn vào cơ thể
 * chứ không nhìn vào một con số.
 *
 * Cửa vào của phần còn lại của game:
 *   `bodyTurn`             vòng tính mỗi lượt — chạy ở bước 2, TRƯỚC khi gọi AI
 *   `inflictFromCheck`     Phần 9–11 gây thương tích từ một `CheckResult`
 *   `handleAiText`         đọc thẻ `<RequestInjury>` của AI rồi phán quyết (mục 3)
 *   `treat`                một lần chữa trị, đủ 5 cấp kết quả
 *   `registerBodySources`  cắm bảy nguồn modifier vào registry của Phần 5
 *   `bodySummary` · `injuryViews` · `regionStatuses`  cho UI và cho khối prompt 7
 *
 * Xem `README.md` cùng thư mục cho hợp đồng đọc/ghi state.
 */

export {
  BodyDataError,
  HIT_TABLE_TOTAL,
  allRegions,
  depthFromTrunk,
  distalRegions,
  domainSet,
  domainsFor,
  hasArtery,
  hitTable,
  organOf,
  regionForRoll,
  regionGroups,
  regionIds,
  regionName,
  regionOf,
  regionsInGroup,
  regionsOnView,
  vitalOrgansOf,
  type BodyRegion,
  type Hand,
  type Organ,
  type RegionSide,
} from './regions';

export {
  INJURY_TYPES,
  aiRequestsPerTurn,
  aiSeverityRange,
  aiSeverityWords,
  allCauses,
  allComplications,
  allDiseases,
  allInjuryTypes,
  allPermanent,
  allProsthetics,
  causeFromText,
  causeOf,
  complicationName,
  complicationOf,
  deathCauseLabel,
  deathRules,
  diseaseOf,
  injuryTypeName,
  injuryTypeRow,
  permanentName,
  permanentOf,
  prostheticOf,
  prostheticsFor,
  severityColor,
  severityName,
  severityRow,
  tierSeverityRange,
  wholeBodyTuning,
  type ComplicationRow,
  type DiseaseRow,
  type InjuryType,
  type InjuryTypeRow,
  type PermanentRow,
  type ProstheticRow,
  type Severity,
  type SeverityRow,
} from './catalog';

export {
  allHealers,
  allTreatments,
  healerAdvice,
  healerOf,
  outcomeFor,
  treatmentName,
  treatmentOf,
  type Healer,
  type Treatment,
  type TreatmentOutcome,
} from './treatments';

export {
  BLOOD_MAX,
  bodyOf,
  bodySchema,
  bodySlice,
  defaultBody,
  injurySchema,
  openInjuries,
  statOf,
  type BodyLogEntry,
  type BodyState,
  type DiseaseEntry,
  type Injury,
  type InjuryComplication,
  type PermanentEntry,
} from './slice';

export {
  bloodMax,
  bloodPenalty,
  consciousnessOf,
  effectiveWil,
  feverPenalty,
  feverTargetOf,
  gripOf,
  gripPenaltyFactor,
  injuryCount,
  injuryPenalty,
  mobilityOf,
  mobilityPenalty,
  painOf,
  painPenalty,
  prostheticRelief,
  shockOf,
  staminaOf,
  type ConsciousnessLevel,
} from './vitals';

export {
  DEFAULT_AIM_CHANCE,
  buildInjury,
  inflictFromCheck,
  inflictInjury,
  injuryId,
  rollHitLocation,
  rollInjuryType,
  severityFromTier,
  type HitOptions,
  type InflictOutcome,
  type InjurySpec,
} from './inflict';

export { BODY_DOMAIN, bodyTurn, deathVerdict, type BodyTurnResult } from './tick';

export { LOG_SOFT_LIMIT, addPermanent, diffOps, newMutation, note, type BodyMutation, type ScarEntry } from './ops';

export {
  canTreat,
  healerSkill,
  healerSkillEstimate,
  treat,
  treatmentsFor,
  type TreatRequest,
  type TreatResult,
} from './treat';

export {
  BODY_EVENTS,
  applyInjuryRequests,
  collectInjuryRequests,
  handleAiText,
  parseInjuryRequests,
  registerBodyHandlers,
  resolveRegion,
  stripInjuryRequests,
  type InjuryRequest,
  type RequestOutcome,
} from './events';

export {
  BLOOD_SOURCE_ID,
  BODY_SOURCES,
  COMMAND_SOURCE_ID,
  FEVER_SOURCE_ID,
  MOBILITY_SOURCE_ID,
  PAIN_SOURCE_ID,
  PERMANENT_SOURCE_ID,
  REGION_SOURCE_ID,
  bloodSource,
  commandPenalty,
  commandSource,
  feverSource,
  mobilitySource,
  painSource,
  permanentSource,
  regionSource,
  registerBodySources,
} from './modifiers';

export {
  bodyStateOf,
  bodySummary,
  injuryView,
  injuryViews,
  regionColor,
  regionStatuses,
  regionStatusesOf,
  type BodySummary,
  type InjuryView,
  type RegionStatus,
} from './report';

/**
 * Dòng RNG riêng của cơ thể.
 *
 * Vòng lượt tung một số lần THAY ĐỔI theo số vết thương đang mang. Trên dòng
 * `main` thì con số đó đẩy lệch mọi cú tung của người chơi ở lượt sau, và
 * "cùng seed + cùng input = cùng kết quả" lặng lẽ hết đúng (R3). `RNG_STREAMS`
 * của Phần 0 nói rõ các hệ được mở dòng riêng của mình — đây là dòng của Phần 7.
 */
export const BODY_STREAM = 'body';
