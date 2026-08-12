/**
 * HỢP ĐỒNG CHUNG CỦA VÒNG LẶP MỘT LƯỢT (Phần 0 mục 6).
 *
 * File này CHỈ khai báo kiểu, không implement. Mọi module ở các phần sau cắm
 * vào đúng một bước trong đây và không được tự bịa ra đường đi riêng.
 *
 * Trật tự 10 bước là bất biến. Đặc biệt bước 2 (RESOLVE) luôn chạy TRƯỚC bước
 * 4 (CALL): engine tung xúc sắc xong mới gửi kết quả cho AI như dữ kiện bắt
 * buộc — đó chính là R1.
 */

import type { RngHubState } from './rng';
import type { GameDate } from './clock';

export type TurnStep =
  | 'input' //  1. người chơi nhập hành động
  | 'resolve' //  2. engine tung xúc sắc → kết quả cơ học
  | 'context' //  3. gom state + lorebook + kết quả bước 2 → render EJS
  | 'call' //  4. gửi lên LLM qua proxy
  | 'parse' //  5. tách narrative và khối cập nhật biến
  | 'validate' //  6. MVU + Zod + clamp + apply (all-or-nothing)
  | 'derive' //  7. tính lại biến phụ
  | 'tick' //  8. mô phỏng ngầm
  | 'render' //  9. cập nhật UI
  | 'persist'; // 10. ghi Tầng A + append Tầng B

export const TURN_STEPS: readonly TurnStep[] = [
  'input',
  'resolve',
  'context',
  'call',
  'parse',
  'validate',
  'derive',
  'tick',
  'render',
  'persist',
] as const;

// ---------------------------------------------------------------------------
// Bước 1 — INPUT
// ---------------------------------------------------------------------------

/** Hành động người chơi nhập tự do, hoặc chọn ra từ một minigame. */
export interface TurnInput {
  kind: 'freeform' | 'minigame';
  /** Văn bản người chơi gõ. Rỗng khi hành động đến từ minigame. */
  text: string;
  /** Id minigame đang mở, nếu có. Chi tiết ở Phần 9–11. */
  minigameId?: string;
  /** Lựa chọn đã chọn trong minigame, dạng chưa định — Phần 9 chốt. */
  minigameChoiceId?: string;
  /** Kỹ năng người chơi chọn cho lượt tự do. Bỏ trống để engine tự nhận diện. */
  checkSkillId?: string;
  /** Bậc khó người chơi/chủ cảnh đã chấm. Mặc định là `thuong`. */
  checkDifficulty?: DifficultyBand;
  /** Hành động thuần kể chuyện, không có khả năng thất bại nên không tung. */
  skipCheck?: boolean;
}

/** Lựa chọn cơ học đi kèm ô hành động tự do của UI. */
export interface FreeformCheckChoice {
  /** Bỏ trống để engine tự nhận diện từ hành động. */
  skillId?: string;
  difficulty?: DifficultyBand;
  /** Cảnh thuần kể chuyện: vẫn tốn thời gian nhưng không rút RNG. */
  skip?: boolean;
}

// ---------------------------------------------------------------------------
// Bước 2 — RESOLVE (R1: chạy trước mọi lời gọi AI)
// ---------------------------------------------------------------------------

/**
 * Thang 5 cấp — thang DUY NHẤT của cả game (Phần 5 mục 3 và 5).
 *
 * Bốn hệ xúc sắc phân miền đều quy về đây, nên phần còn lại của game không cần
 * biết hệ nào vừa chạy. Nghĩa cơ học của từng cấp là hợp đồng cứng:
 *
 *   critFail       thất bại VÀ sinh một biến cố mới xấu hơn tình trạng ban đầu
 *   fail           không đạt, mất chi phí đã bỏ, tình hình giữ nguyên
 *   costlySuccess  ĐẠT nhưng phải trả một cái giá CỤ THỂ do engine chọn sẵn
 *   success        đạt đúng mục tiêu
 *   critSuccess    đạt VÀ có thêm một lợi ích cụ thể
 */
export type CheckTier = 'critFail' | 'fail' | 'costlySuccess' | 'success' | 'critSuccess';

/** Bốn hệ xúc sắc phân miền cứng (Phần 5 mục 2). */
export type CheckSystem = 'd100' | 'd20' | '3d6' | 'pool';

/**
 * Sáu bậc của thang độ khó chuẩn hóa (Phần 5 mục 8).
 *
 * Chỉ có TÊN BẬC ở tầng hợp đồng, không có số: bảng quy đổi sang từng hệ nằm
 * gọn trong `/src/systems/check/difficulty.ts` để cân bằng lại toàn game chỉ
 * phải sửa đúng một chỗ.
 */
export type DifficultyBand = 'de-dang' | 'thuong' | 'kho' | 'rat-kho' | 'cuc-kho' | 'gan-bat-kha';

/**
 * Một dòng điều chỉnh đã cộng vào phép kiểm.
 *
 * `label` phải là tiếng Việt đọc được, không phải id. Game không có reroll và
 * không có điểm vận mệnh, nên người chơi BẮT BUỘC phải hiểu vì sao mình hỏng —
 * nếu không họ sẽ cảm thấy game ăn gian (Phần 5 mục 3).
 */
export interface CheckModifierLine {
  label: string;
  value: number;
  /** Id nguồn đã đăng ký trong registry, ví dụ `body.injuries`. */
  source: string;
}

/**
 * Hệ quả cụ thể mà ENGINE đã chọn sẵn (Phần 5 mục 5).
 *
 * Có mặt ở đây chứ không để AI tự nghĩ ra: `costlySuccess` mà cái giá do AI bịa
 * thì cái giá đó không tồn tại trong state, và người chơi trả một thứ không ai
 * ghi lại được (R1, R2).
 */
export interface CheckConsequence {
  /** `cost` cho costlySuccess · `boon` cho critSuccess · `escalation` cho critFail. */
  kind: 'cost' | 'boon' | 'escalation';
  text: string;
}

/**
 * Một lần kiểm định do engine tung (Phần 5 mục 3).
 *
 * Đây là kiểu trả về DUY NHẤT của cả bốn hệ. Chủ sở hữu là `/src/systems/check`;
 * kiểu nằm ở đây vì nó là một mắt của hợp đồng vòng lặp lượt — bước 2 sinh ra
 * nó, bước 3 đổ nó vào khối 11, bước 10 ghi nó xuống Tầng B.
 */
export interface CheckResult {
  /** Định danh phép kiểm, ví dụ `check.thuyet-phuc`. */
  id: string;
  system: CheckSystem;
  /** Miền, ví dụ `skill.kiem-thuat`, `admin.xay-dung`. */
  domain: string;
  /** Bậc độ khó engine đã chấm. Ở d20 và pool nó nằm trong `dc`/`target`. */
  difficulty: DifficultyBand;
  tier: CheckTier;
  /** Xúc sắc thô đã tung, đúng thứ tự. */
  raw: number[];
  /** Ngưỡng tung-dưới (d100, 3d6) hoặc số thành công cần (pool). */
  target?: number;
  /** Độ khó của hệ d20. */
  dc?: number;
  /** Dương = thừa, âm = thiếu. */
  margin: number;
  /** Năng lực nền trước độ khó và modifier; có nhãn để người chơi biết nó đến từ đâu. */
  base?: number;
  baseLabel?: string;
  /** BẮT BUỘC liệt kê ĐỦ — xem `CheckModifierLine`. */
  modifiers: CheckModifierLine[];
  /** Dòng RNG và vị trí đã rút, để tung lại đúng con xúc sắc này (R3). */
  seedUsed: string;
  /** Câu mệnh lệnh ngắn cho AI (Phần 5 mục 10). Engine sinh, AI không sửa. */
  narrativeHint: string;
  /** Chỉ có ở critFail, costlySuccess và critSuccess. */
  consequence?: CheckConsequence;
}

/**
 * Kết quả cơ học TRẦN của bước 2 — đúng thứ khối 11 in ra.
 *
 * Khác `MechanicalOutcome` ở chỗ chưa có op engine và chưa có vị trí xúc sắc:
 * đây là phần mà template EJS đọc được (local `roll` của Phần 3 mục 6), nên nó
 * phải là dữ liệu thuần, không dính gì tới hạ tầng lưu trữ.
 */
export interface RollContext {
  checks: CheckResult[];
  /** Số phút trong game hành động này tiêu tốn. */
  timeCost: number;
  /** Ghi chú engine muốn nói thêm với AI hoặc với người cân bằng. */
  notes: string[];
}

/**
 * Toàn bộ kết quả cơ học của lượt. Đây là thứ DUY NHẤT được phép quyết định
 * thành/bại; AI đọc nó như dữ kiện, không được đảo ngược.
 */
export interface MechanicalOutcome {
  checks: CheckResult[];
  /** Thay đổi tài nguyên/chỉ số engine đã tự tính, dạng op MVU — Phần 2 chốt. */
  engineOps: unknown[];
  /** Số phút/giờ/ngày trong game mà hành động này tiêu tốn. */
  timeCost: number;
  /** Vị trí mọi dòng RNG ngay sau khi tung xong (R3). */
  rngAfter: RngHubState;
}

// ---------------------------------------------------------------------------
// Bước 3 — CONTEXT
// ---------------------------------------------------------------------------

/** Gói dữ liệu đưa vào EJS. Danh sách khối prompt đầy đủ ở Phần 3 mục 4. */
export interface PromptContext {
  /** Tên khối → chuỗi đã render. */
  blocks: Record<string, string>;
  /** Ước lượng token của từng khối, cho ngân sách token ở Phần 3 mục 9. */
  tokenEstimates: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Bước 4 — CALL
// ---------------------------------------------------------------------------

export interface LlmRequest {
  /** Preset tham số đang dùng. Cấu trúc ở Phần 1 mục 6. */
  presetId: string;
  context: PromptContext;
}

export interface LlmResponse {
  raw: string;
  /** Số token thật do provider báo về, nếu có. */
  usage?: { prompt: number; completion: number };
  /** Chuẩn API đã dùng: openai | gemini | anthropic. Phần 1 chốt. */
  transport: string;
}

// ---------------------------------------------------------------------------
// Bước 5 — PARSE
// ---------------------------------------------------------------------------

export interface ParsedResponse {
  /** Phần văn bản kể chuyện, đã bỏ mọi khối kỹ thuật. */
  narrative: string;
  /** Các khối đề xuất cập nhật biến, còn ở dạng thô. Phần 2 mổ tiếp. */
  patchBlocks: string[];
}

// ---------------------------------------------------------------------------
// Bước 6 — VALIDATE (R4: all-or-nothing)
// ---------------------------------------------------------------------------

export interface PatchOutcome {
  /** `true` chỉ khi TOÀN BỘ lô op hợp lệ và đã apply. */
  applied: boolean;
  /** Số op trong lô. */
  opCount: number;
  /** Lý do từ chối, để đưa vào vòng sửa lỗi ở Phần 2 mục 6. */
  rejections: ReadonlyArray<{ path: string; reason: string }>;
}

// ---------------------------------------------------------------------------
// Bước 8 — TICK
// ---------------------------------------------------------------------------

export interface TickOutcome {
  /** Số sự kiện ngầm đã sinh ra trong lượt này. */
  eventCount: number;
  /** Số lần gọi proxy mà mô phỏng ngầm đã tiêu. Trần tháng ở Phần 15 mục 5. */
  llmCallsUsed: number;
}

// ---------------------------------------------------------------------------
// Biên bản một lượt — ghi xuống Tầng B ở bước 10
// ---------------------------------------------------------------------------

export interface TurnRecord {
  turn: number;
  gameDate: GameDate;
  /** Vị trí mọi dòng RNG ĐẦU lượt. Undo tua về đây (chống save-scum, R3). */
  rngBefore: RngHubState;
  input: TurnInput;
  outcome: MechanicalOutcome;
  narrative: string;
  patch: PatchOutcome;
  tick: TickOutcome;
  /** Bước cuối cùng chạy xong. Lượt hỏng giữa chừng vẫn ghi lại được. */
  reachedStep: TurnStep;
  /** Thời điểm thực (epoch ms), phục vụ debug chứ không phải lịch trong game. */
  wallClock: number;
}
