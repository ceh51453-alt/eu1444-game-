/**
 * KỸ NĂNG, RÈN LUYỆN, ĐỒ THỊ NHÁNH — Phần 8.
 *
 * Ba nguồn tiến bộ không thay thế nhau (mục 1):
 *   THỰC HÀNH  tăng con số. Tự động, chậm, có trần.
 *   ĐIỂM KN    mở nhánh. Người chơi tự tiêu.
 *   THẦY DẠY   phá trần. Không có thầy thì mãi mãi dừng ở ngưỡng.
 *
 * Cửa vào của phần còn lại của game:
 *   `skillsTurn`          bước 2 của một lượt — đổ điểm rèn luyện
 *   `capReport`           trần hiện tại của một kỹ năng KÈM LÝ DO
 *   `graphOf` / `unlockNode`  đồ thị nhánh và việc mở node
 *   `grantBreakthrough`   Phần 9–11 gọi khi một hoàn cảnh cực hạn xảy ra
 *   `registerSkillSources`  cắm hiệu ứng node vào registry của Phần 5
 *
 * Xem `README.md` cùng thư mục cho hợp đồng đọc/ghi state.
 */

export {
  SELF_STUDY,
  SkillProgressDataError,
  ageFactor,
  allTiers,
  baseThreshold,
  breakthroughTeacherTier,
  breakthroughTriggers,
  hardCap,
  isBreakthroughTrigger,
  loadConfig,
  practiceConfig,
  practicePoints,
  priceKindOf,
  priceKinds,
  statCapFor,
  teacherConfig,
  teacherQuality,
  tierAtLeast,
  tierDistance,
  tierName,
  tierOf,
  tierOfLevel,
  xpPerTurnCap,
  xpSourceOf,
  xpSources,
  type BreakthroughTrigger,
  type PriceKind,
  type SelfStudy,
  type SkillTier,
  type TeacherQuality,
  type XpSource,
} from './catalog';

export {
  NODE_KINDS,
  SkillNodeDataError,
  USABLE_IN,
  allNodes,
  breakthroughNodesOf,
  kindName,
  layerOf,
  nodeName,
  nodeOf,
  nodesForBodyCondition,
  nodesForSkill,
  statOfNode,
  templateNodeId,
  usableInName,
  usableInNames,
  type NodeKind,
  type NodePrereq,
  type SkillNode,
  type UsableIn,
} from './nodes';

export {
  ageFactorFor,
  defaultSkills,
  isUnlocked,
  learningLoad,
  levelOf,
  loadFactorOf,
  masteredCount,
  raceFactorFor,
  skillCatalog,
  skillsOf,
  skillsSchema,
  skillsSlice,
  trainedSkills,
  unlockedNodesOf,
  type Obligation,
  type PracticeEntry,
  type SkillsState,
  type StudySession,
  type Teacher,
  type TeacherPrice,
} from './slice';

export {
  ageSlowFactor,
  nodeCost,
  practiceThreshold,
  slowBreakdown,
  slowFactor,
  studyDays,
  type SlowBreakdown,
} from './load';

export {
  atCap,
  bestTeacherFor,
  breakthroughOpen,
  canTeach,
  capOf,
  capReport,
  selfStudyCap,
  statCapOfSkill,
  teacherLevelIn,
  type CapReport,
} from './caps';

export {
  awardXp,
  defaultContext,
  grindFactor,
  practiceFromChecks,
  rawPractice,
  skillLabel,
  tooEasy,
  xpSourcesFromChecks,
  type PracticeGain,
  type PracticeOutcome,
  type XpOutcome,
} from './progress';

export {
  bodyConditions,
  graphOf,
  grantBreakthrough,
  isRevealed,
  knownFacts,
  missingFor,
  nodeStatus,
  setStance,
  unlockNode,
  type BreakthroughOutcome,
  type NodeStatus,
  type NodeView,
  type UnlockOutcome,
} from './unlock';

export {
  beginStudy,
  finishStudy,
  planStudy,
  rememberTeacher,
  studyDue,
  teacherLine,
  type StudyPlan,
  type TeacherDraft,
} from './teach';

export {
  NODE_SOURCE_ID,
  SKILL_SOURCES,
  STANCE_SOURCE_ID,
  STUDY_SOURCE_ID,
  nodeModifierLines,
  nodeSource,
  registerSkillSources,
  stanceSource,
  studySource,
} from './modifiers';

export { skillsTurn, type SkillTurnOutcome } from './turn';
