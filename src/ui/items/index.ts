/**
 * MÀN TRANG BỊ — Phần 16 mục 18.
 *
 * `EquipmentScreen` là lớp phủ toàn màn hình; `CoverageBody` là chế độ xem che
 * phủ mà mục 18 gọi là màn hình quan trọng nhất của cả phần. Luật đọc tách sang
 * `view.ts` và `armoury.ts` để test được mà không cần dựng cây React.
 */

export { EquipmentScreen } from './EquipmentScreen';
export { CoverageBody, type CoverageBodyProps, type CoverageMode } from './CoverageBody';
export {
  COVERAGE_COLORS,
  HEAVY_LOAD_KG,
  blinks,
  coverageColor,
  describeSelected,
  equipmentView,
  regionViews,
  type EquipmentView,
  type RegionView,
  type WornView,
} from './view';
export { FIT_FOR_ISSUE, armouryReport, averageQualityName, type ArmouryReport, type ArmouryRow } from './armoury';
export { beltOps, equipOps, maintainOps, unequipOps, type ActionResult } from './actions';
