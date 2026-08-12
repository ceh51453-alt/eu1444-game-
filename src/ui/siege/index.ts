/**
 * MÀN HÌNH CÔNG THÀNH & THỦ THÀNH — Phần 11 mục 9.
 *
 * Hai giai đoạn, hai bộ mặt: lịch tuần với hai bảng đối xứng và bảng hành động
 * của đúng bên người chơi đang đứng; rồi lưới có tầng khi tổng công.
 */

export { SiegeScreen, type SiegeScreenProps } from './SiegeScreen';
export { CrossSection } from './CrossSection';
export { BesiegerPanel, DefenderPanel, ReputationRow } from './SidePanels';
export { ActionTable, Timeline, type ActionTableProps } from './ActionTable';
export { AssaultView } from './AssaultView';
export { createCastleSiege } from './siege';
