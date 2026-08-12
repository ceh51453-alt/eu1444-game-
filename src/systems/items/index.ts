/**
 * TRANG BỊ, VŨ KHÍ, GIÁP TRỤ — Phần 16.
 *
 * Bản đồ che phủ giáp trên 20 vùng của Phần 7, ba loại chống riêng biệt, khe
 * hở là cơ chế trung tâm, vừa người, trọng lượng có phân bổ, hư hỏng cụ thể,
 * chế tạo có bản mẫu, và ba mốc thời đại.
 *
 * Cửa vào của phần còn lại của game:
 *   `buildCoverage` / `coverAt`   bản đồ che phủ và ba trục chống
 *   `strikeOf` / `resolveArmor`   một đòn đi qua giáp — bốn khả năng của mục 4
 *   `fitOf` / `fitPenaltyOf`      vừa người
 *   `buildLoad`                   tải và phân bổ tải
 *   `campaignWear`                thợ rèn theo quân (Phần 11 gọi)
 *   `recognitionOf`               huy hiệu → tù binh và tiền chuộc (Phần 10 gọi)
 *   `catalogForYear`              danh mục trang bị của một năm
 *   `registerItemSources`         cắm bốn nguồn vào registry Phần 5
 *
 * Xem `README.md` cùng thư mục cho hợp đồng đọc/ghi state.
 */

export {
  AXES,
  DEFAULT_QUALITY,
  ItemDataError,
  allArmorPieces,
  allEnchantments,
  allMaterials,
  allPatterns,
  allTemplates,
  allWeapons,
  armorClassOf,
  armorClasses,
  armorPieceOf,
  bareClass,
  bluntedCause,
  bluntedRule,
  carryConfig,
  carryModeOf,
  craftOf,
  craftRollConfig,
  damageKindOf,
  damageKinds,
  emptyTriple,
  enchantmentOf,
  factionCatalog,
  factionCatalogs,
  fitConfig,
  gapName,
  hasWeaponProfile,
  heraldryConfig,
  isSilver,
  itemKind,
  itemMaterial,
  itemName,
  itemSlot,
  itemValue,
  itemWeight,
  knownItemIds,
  layeringConfig,
  maintenanceConfig,
  massProduction,
  materialOf,
  patternLearningWays,
  patternOf,
  qualityByLevel,
  qualityOf,
  qualityRows,
  resolutionConfig,
  shieldProfile,
  siegeWeaponOf,
  siegeWeapons,
  templateOf,
  unarmedProfile,
  weaponProfile,
  type ArmorClass,
  type ArmorPiece,
  type Axis,
  type AxisTriple,
  type CarryMode,
  type CraftSpec,
  type DamageKind,
  type Enchantment,
  type FactionCatalog,
  type FitGrade,
  type ItemQuality,
  type ItemTemplate,
  type Material,
  type Pattern,
  type RangedProfile,
  type ShieldProfile,
  type WeaponProfile,
} from './data';

export {
  ITEM_KINDS,
  type ArmorOutcome,
  type BodyShape,
  type CoverageMap,
  type Heraldry,
  type HitOutcomeKind,
  type Item,
  type ItemDamage,
  type ItemKind,
  type RegionCover,
} from './types';

export {
  bareCoverage,
  bareRegions,
  buildCoverage,
  coverAt,
  coverageRecord,
  describeRegion,
  gapsOf,
  heaviestClassName,
  protectionAt,
  wearingPlate,
  wornFromCarried,
  wornFromItems,
  type WornPiece,
} from './coverage';

export {
  axisOfTags,
  penNeededAt,
  rangedPower,
  resolveArmor,
  strikeOf,
  weaponPower,
  wornWeapon,
  type PowerOptions,
  type Strike,
  type StrikeOptions,
  type WornWeapon,
} from './resolve';

export {
  PEASANT_YEARLY_INCOME,
  describeItem,
  isMasterpiece,
  isSilverItem,
  newItem,
  prestigeOf,
  remember,
  valueInPeasantYears,
  valueOf,
  weightOfItem,
} from './item';

export {
  fitOf,
  fitOfItem,
  fitPenaltyOf,
  refitPlan,
  shapeOfState,
  wearerOfState,
  type FitPenalty,
  type FitResult,
  type RefitPlan,
  type Wearer,
} from './fit';

export { buildLoad, fatigueOf, weightOf, type LoadOptions, type LoadReport } from './weight';

export {
  applyMaintenance,
  campaignWear,
  maintenancePlan,
  repairDamage,
  rollDamage,
  wearItem,
  weeklyTick,
  type CampaignWear,
  type MaintenancePlan,
  type WearOptions,
  type WearResult,
} from './damage';

export {
  canCraft,
  craft,
  learnPattern,
  learnPlans,
  type CraftFeasibility,
  type CraftOrder,
  type CraftResult,
  type LearnPlan,
  type Smith,
  type Workshop,
} from './craft';

export {
  catalogForYear,
  catalogTable,
  craftableInYear,
  eraRangeOf,
  existsInYear,
  exclusiveTo,
  patternAvailable,
  type CatalogOptions,
  type EraRange,
  type SpreadOptions,
} from './era';

export {
  hasHiddenDevice,
  recognitionOf,
  rollExposure,
  setDeviceVisible,
  stampDevice,
  visibleDevice,
  type Exposure,
  type Recognition,
} from './heraldry';

export {
  defaultEquipment,
  defaultItems,
  carriedItems,
  equipmentOf,
  equipmentSlice,
  itemsOf,
  itemsSlice,
  ownedItem,
  packedItems,
  wornItems,
  type EquipmentState,
  type ItemsState,
} from './slice';

export { seedInto, seedItems, seedOps, type SeedResult } from './seed';

export {
  ENCHANT_SOURCE_ID,
  FIT_SOURCE_ID,
  GEAR_SOURCE_ID,
  LOAD_SOURCE_ID,
  registerItemSources,
} from './modifiers';
