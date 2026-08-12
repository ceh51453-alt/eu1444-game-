/**
 * TAB THẾ GIỚI — Phần 14 mục 8.
 *
 * Tám thẻ quốc gia, tám bảng trạng thái KHÁC HẲN NHAU, một bản đồ tôn giáo chuyển
 * lớp được, và dòng thời gian sự kiện lớn của châu lục.
 *
 * Màn hình này không bao giờ từ chối mở, khác mọi màn hình khác của game: mục 1
 * nói bảng trạng thái quốc gia xem được từ lượt đầu tiên, dù người chơi là nông
 * nô. Cái đổi theo tước vị là NÚT BẤM, và cái đổi theo tri thức là ĐỘ RÕ.
 */

export { WorldScreen, type WorldScreenProps } from './WorldScreen';
export { EconomyPanel, type EconomyPanelProps } from './EconomyPanel';
export { openWorld, type OpenWorld } from './world';
// Ba mảnh của Phần 15 mục 11. `LiveNewsFeed` nối thẳng vào store vì nó sống ở
// cột phải và phải LUÔN hiển thị; ba cái kia nhận dữ liệu qua props như mọi màn
// hình khác.
export { LiveNewsFeed, NewsFeed, NewsItemRow, type NewsFeedProps } from './NewsFeed';
// Đọc slice `world` từ React PHẢI đi qua hook này — xem ghi chú ở đầu file về
// vòng lặp render mà một selector trả object mới sẽ gây ra.
export { useWorld } from './useWorld';
export { EventCards, type EventCardsProps } from './EventCards';
export { Chronicle, KnowledgeMap, type ChronicleProps, type KnowledgeMapProps, type KnowledgeRow } from './Chronicle';
export { Bar, Fog, Line, TierBadge, TierButton, type FogProps } from './parts';
export { OttomanBoard, type OttomanBoardProps } from './boards/OttomanBoard';
export { ByzantiumBoard, type ByzantiumBoardProps } from './boards/ByzantiumBoard';
export { SwissBoard, type SwissBoardProps } from './boards/SwissBoard';
export { HordeBoard, type HordeBoardProps } from './boards/HordeBoard';
export { HreBoard, type HreBoardProps } from './boards/HreBoard';
export { FranceBoard, type FranceBoardProps } from './boards/FranceBoard';
export { PapacyBoard, type PapacyBoardProps } from './boards/PapacyBoard';
export { LatinBoard, type LatinBoardProps } from './boards/LatinBoard';
