/**
 * CỬA TỪ TRUYỆN VÀO MINIGAME.
 *
 * Trước file này, ba minigame của Phần 9–11 chỉ mở được bằng ba nút bấm tay ở
 * bảng trạng thái, với đối thủ khai cứng trong `/src/ui`. Chú thích đầu
 * `spar.ts`, `field.ts` và `siege.ts` đều nói cùng một câu: "đây KHÔNG phải cách
 * duy nhất một trận nổ ra — phần lớn chúng đến từ truyện". Đây là chỗ mở cái cửa
 * ấy, và nó mở bằng đúng cơ chế mà Phần 7 mục 3 đã dựng cho thương tích: **AI ĐỀ
 * NGHỊ, ENGINE PHÁN QUYẾT.**
 *
 * Đường đi của một lời mời:
 *
 *   AI viết `<RequestDuel …/>` trong đoạn văn
 *     → `parseEncounterRequests`  đọc thẻ, `stripEncounterRequests` bóc khỏi truyện
 *     → `screenEncounters`        bốn cửa kiểm duyệt, nhiều nhất MỘT lời mời mỗi lượt
 *     → thẻ mời hiện dưới đoạn văn, người chơi bấm
 *         · "Vào trận" → `buildEncounter` dựng ván, màn hình của Phần 9/10/11 mở
 *         · "Bỏ qua"   → `autoResolve` engine đánh trọn trận rồi ghi hệ quả thật
 *     → `duelSummary` · `battleSummary` · `siegeSummary` kể lại cho lượt sau
 *
 * Xem `README.md` cùng thư mục cho hợp đồng đọc/ghi state.
 */

export {
  buildBattle,
  buildDuel,
  buildEncounter,
  buildSiege,
  offerTag,
  screenEncounters,
  type BuiltEncounter,
} from './build';

export { playerFighterSpec, skillLevels } from './player';

export {
  availableEncounters,
  type AvailableEncounters,
  type EncounterOption,
} from './available';

export {
  autoResolve,
  battleSummary,
  duelSummary,
  siegeSummary,
  type CombatSummary,
} from './resolve';

export {
  encounterRequestsFromOutput,
  fold,
  inferEncounterRequest,
  parseEncounterRequests,
  powerOf,
  scaleOf,
  sideOf,
  stripEncounterRequests,
  type ParsedRequest,
} from './tags';

export {
  KIND_LABELS,
  POWER_LABELS,
  SCALE_LABELS,
  type AutoOutcome,
  type EncounterKind,
  type EncounterOffer,
  type EncounterRequest,
  type EncounterScreening,
  type PowerTier,
  type ScaleTier,
  type StandSide,
} from './types';
