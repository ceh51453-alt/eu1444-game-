/**
 * MÀN HÌNH THÀNH TRÌ — Phần 12 mục 11.
 *
 * Lưới ô kéo thả có xem trước hiệu ứng kề nhau, bảng tài nguyên và nhân công có
 * dự báo bốn mùa, hàng đợi xây dựng, bảng dân cư theo nhóm và theo chủng tộc,
 * bảng "Nếu bị vây" nối sang Phần 11, và thanh chuyển nhanh giữa các thành trì
 * có đánh dấu tòa chính.
 */

export { HoldingScreen, type HoldingScreenProps } from './HoldingScreen';
export { HoldingGrid, type HoldingGridProps } from './HoldingGrid';
export {
  BuildQueue,
  PopulationPanel,
  ResourcePanel,
  SiegePanel,
  type BuildQueueProps,
  type ResourcePanelProps,
} from './HoldingPanels';
export { openHoldings } from './holding';
