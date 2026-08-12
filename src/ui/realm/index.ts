/**
 * MÀN HÌNH LÃNH THỔ — Phần 13 mục 11.
 *
 * Bản đồ vùng theo tỉnh (KHÔNG có lưới ô), bảng trạng thái ĐỔI THEO TƯỚC VỊ đang
 * giữ, tab chuyển giữa các thái ấp, bảng chư hầu có thanh cảnh báo nguy cơ nổi
 * loạn, sổ nghĩa vụ hai chiều, danh sách vụ chờ xử, và cây kế vị.
 */

export { RealmScreen, type RealmScreenProps } from './RealmScreen';
export { MilitaryPanel, type MilitaryPanelProps } from './MilitaryPanel';
export {
  CourtDocket,
  CourtPanel,
  ObligationLedger,
  ProvinceMap,
  SuccessionTree,
  VassalPanel,
  type CourtDocketProps,
  type CourtPanelProps,
  type MapShading,
  type ObligationLedgerProps,
  type ProvinceMapProps,
  type SuccessionTreeProps,
  type VassalPanelProps,
} from './RealmPanels';
export { openRealm, type OpenRealm } from './realm';
