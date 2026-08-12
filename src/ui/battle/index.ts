/**
 * Màn hình dã chiến của Phần 10 mục 14.
 *
 * Cùng lý do với màn hình quyết đấu của Phần 9: một lưới tới 50×50 kèm bảng khởi
 * động, bảng tướng và nhật ký không nhét vừa cột phải 320px, nên nó mở thành một
 * lớp phủ toàn màn hình.
 */

export { BattleScreen, type BattleScreenProps } from './BattleScreen';
export { BattleGrid, type BattleGridProps } from './BattleGrid';
export { FieldOrderBox, InitiativeTable, OfficerTable } from './CommandPanels';
export { createFieldBattle } from './field';
