/**
 * TƯỚC VỊ, THÁI ẤP, CHÍNH DANH, THỪA KẾ — Phần 13 mục 2–5 và mục 9.
 *
 * THÁI ẤP LÀ MỘT TỜ GIẤY CÓ ẤN TRIỆN (Phụ lục A mục 1). Không hàm nào trong thư
 * mục này nhận một `Holding`, và đó là ranh giới quan trọng nhất của cả phần:
 * chiếm được thành trì không có nghĩa là được thái ấp, mất thái ấp không có
 * nghĩa là mất thành trì.
 *
 * Cửa vào của phần còn lại của game:
 *   `grantTitle` / `usurp` / `revoke`   ba con đường lên tước và một đường xuống
 *   `canTake`                          có lấy được không, và VÌ SAO không
 *   `panelFor`                         bảng trạng thái mỗi cấp mở ra (mục 4, 11)
 *   `primaryTitleOf` / `highestRank`   tước đang cai trị
 *   `heirLine` / `succeed`             hàng thừa kế và cái chết không phải game over
 *   `registerTitleSources`             chính danh cắm vào registry của Phần 5
 */

export {
  TITLE_PATHS,
  type FiefObligations,
  type Heir,
  type HeldTitle,
  type LegitimacyEntry,
  type TitlePath,
} from './types';

export {
  TitleDataError,
  allLadders,
  allTitles,
  courtConfig,
  courtSeatOf,
  courtSeats,
  courtSeatsFor,
  heirRelation,
  isRuleDomain,
  grantName,
  ladderHistoryOf,
  ladderForNation,
  ladderOf,
  landKindName,
  legitimacyConfig,
  noHeirRules,
  obligationConfig,
  panelFor,
  panelOf,
  rankOf,
  ruleCheckConfig,
  successionConfig,
  successionLawOf,
  successionLaws,
  titleName,
  titleHistoryOf,
  titleInfluenceConfig,
  titleOf,
  titlePathName,
  titlesOfLadder,
  vassalCapFor,
  vassalConfig,
  type CourtConfig,
  type CourtSeat,
  type HeirRelation,
  type LegitimacyConfig,
  type NoHeirOption,
  type NoHeirRules,
  type ObligationConfig,
  type RuleCheckConfig,
  type SuccessionConfig,
  type SuccessionLaw,
  type Title,
  type TitleHistoryProfile,
  type TitleInfluenceConfig,
  type TitleInfluenceEffect,
  type TitleLadder,
  type TitlePanel,
  type VassalConfig,
} from './data';

export {
  TITLE_INFLUENCE_SOURCE,
  registerTitleInfluenceSource,
  titleInfluenceSource,
} from './influence';

export {
  LEGITIMACY_SOURCE,
  adjustLegitimacy,
  clampLegitimacy,
  driftLegitimacy,
  legitimacyLabel,
  legitimacySource,
  registerTitleSources,
  startingLegitimacy,
  yearsToRebuild,
} from './legitimacy';

export {
  TitleGrantError,
  arrearsVerdict,
  callLevy,
  canTake,
  condemn,
  grantTitle,
  ladderFor,
  obligationsFor,
  recognise,
  resetYear,
  revoke,
  usurp,
  type ArrearsVerdict,
  type GrantOptions,
  type RevokeResult,
  type TakeContext,
  type TakeVerdict,
  type UsurpResult,
} from './grant';

export {
  SuccessionError,
  heirLine,
  heirOf,
  noHeirCrisis,
  noHeirOptions,
  succeed,
  successionLawFor,
  type HeirLineOptions,
  type Kin,
  type SuccessionKind,
  type SuccessionOutcome,
} from './succession';

export {
  hasGrant,
  heldTitleOf,
  heldTitleSchema,
  heldTitles,
  highestRank,
  primaryTitleOf,
  titlesSlice,
  titlesSliceSchema,
  titlesStateOf,
  viewingTitleOf,
  type TitlesSliceState,
} from './slice';
