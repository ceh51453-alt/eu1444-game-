/**
 * KIỂM ĐỊNH & XÁC SUẤT — Phần 5.
 *
 * Bước 2 của vòng lặp lượt: nơi engine quyết định MỌI thứ trước khi AI được nói
 * một chữ nào (R1). Bốn hệ xúc sắc phân miền cứng, một thang 5 cấp duy nhất,
 * một registry modifier mà mọi phần sau cắm vào.
 *
 * Cửa vào của phần còn lại của game chỉ có ba hàm:
 *   `runCheck`        một phép kiểm
 *   `contestedCheck`  hai bên đối kháng trong cùng một hệ
 *   `resolveTurn`     bước 2 của một lượt tự do, dùng bởi `/src/ai/pipeline`
 *
 * Xem `README.md` cùng thư mục cho hợp đồng đọc/ghi state.
 */

export {
  DIFFICULTY_BANDS,
  DIFFICULTY_LADDER,
  CheckError,
  difficulty,
  difficultyLabel,
  type DifficultyBand,
  type DifficultyRow,
} from './difficulty';

export {
  DEFAULT_CLAMPS,
  ModifierSourceError,
  clamp,
  collectModifiers,
  domainMatches,
  foldModifiers,
  modifierSources,
  registerModifierSource,
  resetModifierSources,
  unregisterModifierSource,
  type ClampConfig,
  type CollectOutcome,
  type FoldedModifiers,
  type Modifier,
  type ModifierContext,
  type ModifierKind,
  type ModifierSource,
} from './registry';

export {
  TIER_LABELS,
  TIER_ORDER,
  d100Tier,
  d20Tier,
  d20TierFromMargin,
  isSuccess,
  poolTier,
  shiftTier,
  tallyPool,
  threeD6Tier,
  type PoolTally,
} from './tiers';

export {
  CONSEQUENCE_ISSUES,
  CONSEQUENCE_TABLE,
  bucketFor,
  consequenceKindFor,
  pickConsequence,
  type ConsequenceBucket,
  type ConsequenceTable,
} from './consequence';

export { CONSEQUENCE_LABELS, SYSTEM_LABELS, narrativeHint } from './hint';

export { runCheck, type CheckOptions, type CheckRun, type CheckSpec } from './run';

export { CONTEST_LADDER, contestedCheck, type ContestOutcome, type ContestSide } from './contest';

export {
  CHECK_LOG_WINDOW,
  CheckLog,
  checkLog,
  type CheckLogEntry,
  type CheckLogSink,
  type SystemStats,
} from './log';

export { bonusFor, fatigueSource, penaltyFor, registerCheckSources, scaleToSystem, weatherSource } from './sources';

export { DEFAULT_FREEFORM_SKILL, FREEFORM_CHECK, freeformSkillFor, resolveTurn } from './resolve';
