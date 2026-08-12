/**
 * Bản đồ cơ thể SVG. OWNER: Phần 7 (20 vùng).
 *
 * Ràng buộc cứng của Phần 0 mục 3: SVG nội tuyến, mỗi vùng một `<path>` có id
 * riêng, tô lại qua biến CSS. Ảnh bitmap bị cấm.
 */

export { BodyMap, type BodyMapProps } from './BodyMap';
export { BodyPanel } from './BodyPanel';
export {
  AVERAGE_BUILD,
  VIEW_HEIGHT,
  VIEW_WIDTH,
  bboxOf,
  buildSilhouette,
  centroidOf,
  missingPaths,
  pointsOf,
  type Box,
  type Build,
  type Silhouette,
} from './silhouette';
