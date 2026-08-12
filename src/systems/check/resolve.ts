/**
 * BƯỚC 2 CỦA VÒNG LẶP LƯỢT (Phần 5 mục 12.6).
 *
 * Đây là chỗ Phần 5 thay thế `placeholderResolver` của Phần 3. Điều phải đúng
 * ngay từ đầu vẫn là THỨ TỰ: xúc sắc tung xong mới tới lượt AI đọc kết quả (R1).
 * Cái mới của Phần 5 là kết quả đó bây giờ đi qua đủ bộ máy thật — thang độ
 * khó, registry modifier, thang 5 cấp, và một cái giá do engine chọn.
 *
 * CÒN GIẢ Ở CHỖ NÀO, và vì sao là cố ý: một hành động tự do gõ bằng tiếng Việt
 * thì engine không có cách nào biết nó thuộc miền nào hay cần kỹ năng gì. Suy
 * đoán ý định bằng từ khóa là việc của AI, không phải của engine, và làm ở đây
 * thì sẽ sai theo kiểu không ai sửa được. Nên lượt tự do dùng MỘT phép kiểm
 * d100 ở miền chung. Phần 9–11 không đi qua đường này mà gọi thẳng
 * `runCheck`/`contestedCheck` với miền của chúng.
 *
 * PHẦN 6 ĐÃ THAY con số giả: nền bây giờ là điểm rèn luyện thật của kỹ năng
 * `Ứng biến chung`, còn chỉ số chính đi vào qua nguồn `character.chi-so` thành
 * một dòng đọc được. `DEFAULT_FREEFORM_SKILL` chỉ còn là đường lui cho state
 * chưa có nhân vật — test của các phần khác dựng state không đăng ký slice
 * `character`, và một lượt tự do ở đó vẫn phải chạy chứ không được nổ.
 */

import type { RollContext, TurnInput } from '@/core/turn';
import type { Rng } from '@/core/rng';
import type { GameState } from '@/state/slices';
import { characterOf } from '@/systems/character/slice';
import { freeformBase } from '@/systems/character/base';
import { runCheck, type CheckSpec } from './run';

/** Năng lực nền khi state chưa có nhân vật nào. */
export const DEFAULT_FREEFORM_SKILL = 50;

/**
 * Nền của lượt tự do.
 *
 * Có nhân vật thì lấy điểm rèn luyện thật (thường là 0 lúc mới tạo) và để chỉ
 * số nói phần còn lại qua registry. Chưa có nhân vật thì lùi về con số giả cũ.
 */
export function freeformSkillFor(state: GameState): number {
  return characterOf(state) === null ? DEFAULT_FREEFORM_SKILL : freeformBase(state);
}

/**
 * Phép kiểm mặc định của một lượt tự do.
 *
 * Miền `skill.chung` là miền có thật trong bảng hệ quả, không phải chuỗi rỗng:
 * miền rỗng thì `bucketFor` rơi thẳng xuống `*` và mọi nguồn modifier khai
 * `skill.*` sẽ im lặng không bao giờ chạy — đúng loại lệch mà mục 7 cảnh báo.
 */
export const FREEFORM_CHECK: Omit<CheckSpec, 'base'> = {
  id: 'check.hanh-dong',
  system: 'd100',
  domain: 'skill.chung',
  difficulty: 'thuong',
};

/** Số phút trong game một hành động tự do tiêu tốn. Phần 13 chốt thời gian thật. */
export const FREEFORM_TIME_COST = 10;

/**
 * Chạy bước 2 cho một hành động tự do.
 *
 * Hành động rỗng KHÔNG tung xúc sắc, và đó là chủ ý: rút một con xúc sắc rồi
 * vứt đi vẫn làm dòng RNG nhích, nên hai ván cùng seed sẽ lệch nhau chỉ vì một
 * người lỡ bấm gửi lúc ô nhập còn trống (R3).
 */
export function resolveTurn(action: TurnInput, rng: Rng, state: GameState): RollContext {
  if (action.text.trim() === '') {
    return { checks: [], timeCost: 0, notes: [] };
  }

  const run = runCheck(rng, { ...FREEFORM_CHECK, base: freeformSkillFor(state), state });

  const notes = run.failures.map(
    (failure) => `Nguồn modifier "${failure.source}" hỏng, phép kiểm chạy thiếu nó: ${failure.error}`,
  );

  return { checks: [run.result], timeCost: FREEFORM_TIME_COST, notes };
}
