/**
 * MỞ MÀN HÌNH THÀNH TRÌ TỪ VÁN CHƠI ĐANG CHẠY.
 *
 * Chỉ mở những thành trì ĐÃ CÓ THẬT trong state. **Không dựng gì cả.**
 *
 * Bản trước dựng sẵn một cái thôn khi state chưa có thành trì nào, và đó là một
 * món quà không ai xin: một tên du thủ du thực, một thầy tu, một đứa con thứ
 * không được thừa kế gì — cả ba mở bảng trạng thái ra đều thấy mình đang làm
 * chủ một cái thôn sáu chục dân. Bước 8 của Phần 6 (`starting-possessions.json`)
 * đã HỎI người chơi giữ cái gì; dựng thêm ở đây là trả lời hộ họ, và trả lời
 * ngược lại với câu họ vừa nói.
 *
 * Bốn con đường có thành trì của mục 2 vẫn còn nguyên — `xuat-than` là con
 * đường đi qua khâu tạo nhân vật, ba con đường kia (`duoc-phong`, `danh-chiem`,
 * `phat-trien`) là chuyện xảy ra TRONG ván chơi và đi qua `createHolding` ở
 * đúng cái lượt chúng xảy ra. Không con đường nào trong bốn cái đi qua đây.
 *
 * Nút "Thành trì" trên bảng trạng thái vì thế cũng chỉ hiện khi có thật —
 * xem `hasHolding` trong `ui/shell/StatusPanel.tsx`. Một cái nút mở ra màn hình
 * trống là một lời hứa suông; không có nút mới là câu trả lời đúng cho một nhân
 * vật không có tấc đất nào.
 */

import type { GameState } from '@/state/slices';
import { allHoldings, type Holding } from '@/systems/holding';

export function openHoldings(state: GameState): Holding[] {
  return allHoldings(state);
}

/** Nhân vật này có tấc đất nào không. Bảng trạng thái hỏi câu này. */
export function hasAnyHolding(state: GameState | null): boolean {
  return state !== null && allHoldings(state).length > 0;
}
