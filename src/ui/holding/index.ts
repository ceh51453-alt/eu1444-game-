/**
 * MÀN HÌNH THÀNH TRÌ — Phần 12 mục 11.
 *
 * Bản đồ mảnh đất 5 m TRÀN KHUNG, kéo và phóng được, có mạng đường, có xem
 * trước hiệu ứng kề nhau, có công cụ vạch tường và lát phố. Bốn bảng của mục 11
 * là panel nổi bật tắt được, và bảng tra cứu hiện ra khi bấm vào một thứ trên
 * bản đồ.
 *
 * KHÔNG có nút tua thời gian và không có nút chốt: thành trì chạy theo lịch của
 * ván chơi, và lịch trôi theo diễn biến. Xem `systems/holding/tick.ts`.
 */

export { HoldingScreen, type HoldingScreenProps } from './HoldingScreen';
export { HoldingMap, type HoldingMapProps, type MapSelection, type MapTool } from './HoldingMap';
export { Inspector, LayerPanel, Panel, PreviewCard, RoadToolPanel, WallToolPanel } from './HoldingOverlays';
export {
  BuildQueue,
  PopulationPanel,
  ResourcePanel,
  SiegePanel,
  type BuildQueueProps,
  type ResourcePanelProps,
} from './HoldingPanels';
export { hasAnyHolding, openHoldings } from './holding';
