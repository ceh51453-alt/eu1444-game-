/**
 * QUYẾT ĐẤU: LƯỚI NHỎ + CHỌN CHIÊU ĐỒNG THỜI — Phần 9.
 *
 * Minigame đầu tiên của dự án, và là chỗ dựng `CombatChronicle` mà Phần 10 và 11
 * dùng lại (định dạng ấy ở `/src/systems/combat/`, không ở đây).
 *
 * Cửa vào của phần còn lại của game:
 *   `createDuel`          dựng một trận từ hai hồ sơ đấu sĩ
 *   `playRound`           một hiệp: người chơi đã chọn, engine chọn cho NPC
 *   `autoDuel`            đánh trọn một trận không có người — bài test và mô phỏng
 *   `buildChronicle`      biên niên đầy đủ · `chronicleFor` bản đã nén cho prompt
 *   `practiceOps`         điểm thực hành của Phần 8 từ những cú tung của trận
 *   `registerDuelSources` cắm mười một nguồn modifier vào registry của Phần 5
 *   `doctrinePrompt` · `parseDoctrine`  tầng 1 của kiến trúc lai (mục 1)
 *
 * Xem `README.md` cùng thư mục cho hợp đồng đọc/ghi state.
 */

export {
  DuelDataError,
  actionName,
  actionOf,
  allActions,
  allArenas,
  allEndings,
  allKinds,
  allTerrain,
  arenaOf,
  armorPiercingConfig,
  armorRules,
  defaultArena,
  endingName,
  facingConfig,
  kindOf,
  matrixRows,
  reachConfig,
  speedRow,
  staminaConfig,
  tagName,
  tempoConfig,
  terrainOf,
  woundConfig,
  type ActionCategory,
  type ArenaTemplate,
  type ArmorRule,
  type DuelAction,
  type DuelKind,
  type Ending,
  type MatrixRow,
  type SpeedId,
  type Terrain,
} from './data';

export {
  DIR_NAMES,
  DIR_VECTORS,
  arcOf,
  dirGap,
  dirName,
  directionTo,
  distance,
  generateArena,
  inBounds,
  lineBlocked,
  outOfBounds,
  passable,
  sameCell,
  startingPositions,
  stepFrom,
  terrainAt,
  threatenedCells,
  turn,
  type Arc,
  type ArenaState,
  type Cell,
  type Dir8,
  type MoveOutcome,
} from './arena';

export {
  armorAt,
  armorClassOf,
  armorClasses,
  bareClass,
  bluntedCause,
  buildLoadout,
  coveredCells,
  gapsOf,
  unarmedProfile,
  weaponProfile,
  type ArmorClass,
  type ArmorPiece,
  type Loadout,
  type WeaponProfile,
} from './equipment';

export { matchup, type Matchup, type MatchupSide } from './matrix';

export {
  UNAVAILABLE_LABELS,
  availability,
  fallbackAction,
  optionsFor,
  resolveAction,
  resolveNodeAction,
  usableActions,
  type ActionOption,
  type ResolveOptions,
  type ResolvedAction,
  type Unavailable,
} from './actions';

export {
  armorTags,
  attackTagOf,
  hitOptionsFor,
  postHitArmor,
  preHitArmor,
  type PostHitArmor,
  type PreHitArmor,
} from './armor';

export {
  ARMOR_SOURCE_ID,
  DUEL_SOURCES,
  FACING_SOURCE_ID,
  GEAR_SOURCE_ID,
  GROUND_SOURCE_ID,
  INJURY_SOURCE_ID,
  MATRIX_SOURCE_ID,
  NODE_SOURCE_ID,
  REACH_SOURCE_ID,
  STAMINA_SOURCE_ID,
  STAT_SOURCE_ID,
  TEMPO_SOURCE_ID,
  currentExchange,
  publishExchange,
  registerDuelSources,
  staminaPenalty,
  type Exchange,
  type ExchangeView,
} from './modifiers';

export {
  ARCHETYPES,
  DEFAULT_DOCTRINE,
  MAX_LLM_CALLS,
  TURNING_POINT_LABELS,
  archetype,
  doctrinePrompt,
  doctrineSchema,
  parseDoctrine,
  resolveFavored,
  turningPointFor,
  type Doctrine,
  type DoctrineContext,
  type DoctrineParse,
  type DoctrineRequest,
  type TurningPoint,
} from './doctrine';

export {
  chooseAction,
  scoreAction,
  temperatureFor,
  type Choice,
  type ScoreContext,
  type ScoredAction,
} from './choose';

export {
  cloneDuel,
  resolveChoice,
  resolveOptionsOf,
  runRound,
  staminaMaxFor,
  type RoundChoices,
  type RoundResult,
} from './resolve';

export {
  endVerdict,
  hasFreeOpening,
  intervene,
  isDead,
  isDown,
  pointsWinner,
  type EndVerdict,
} from './kinds';

export {
  DUEL_STREAM,
  DuelError,
  applyDoctrine,
  autoDuel,
  autoRound,
  buildChronicle,
  chronicleFor,
  createDuel,
  durationMinutes,
  engineChoice,
  kindDetails,
  playRound,
  practiceOps,
  requestDoctrine,
  type DuelSetup,
  type FighterSpec,
  type PlayResult,
} from './engine';

export {
  fighterOf,
  opponentOf,
  otherSide,
  type ChosenAction,
  type DuelCheck,
  type DuelState,
  type Fighter,
  type RoundLogLine,
  type SideId,
} from './types';
