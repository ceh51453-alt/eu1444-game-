/**
 * TẦNG 2 CỦA KIẾN TRÚC LAI (Phần 9 mục 1) — BỘ CHỌN HÀNH ĐỘNG.
 *
 * "Bộ chọn hành động deterministic, chấm điểm mọi hành động khả dĩ theo doctrine
 * + tình hình lưới + thể lực + thương tích, rồi chọn bằng softmax có seeded RNG
 * (không phải luôn chọn cái tốt nhất, để khó đoán)."
 *
 * VÌ SAO SOFTMAX CHỨ KHÔNG PHẢI ARGMAX: một đối thủ luôn chọn nước tốt nhất là
 * một đối thủ học thuộc được sau ba trận. Người chơi sẽ tìm ra một chuỗi bấm
 * thắng mọi lần, và cả mục 5 về tương khắc chỉ còn là một câu đố đã có đáp án.
 * Softmax giữ cho nước tốt vẫn hay được chọn mà không bao giờ chắc chắn.
 *
 * VÌ SAO KHÔNG GỌI LLM Ở ĐÂY: mục 1 mở đầu bằng đúng lệnh cấm ấy. Tính cách đến
 * từ doctrine (một lời gọi), còn nước đi thì engine tự tính — bấm nút là ra ngay.
 *
 * MỌI THỨ Ở ĐÂY THUẦN VÀ TẤT ĐỊNH trừ đúng một cú rút xúc sắc cuối cùng. Cùng
 * một thế trận và cùng một vị trí dòng RNG thì luôn ra cùng một nước (R3).
 */

import type { Rng } from '@/core/rng';
import { staminaConfig, tempoConfig } from './data';
import { attackTagOf } from './armor';
import { stepFrom, type ArenaState } from './arena';
import type { ResolvedAction } from './actions';
import type { Fighter } from './types';

export interface ScoreContext {
  self: Fighter;
  foe: Fighter;
  /** Lưới đấu — bộ chọn phải biết chỗ nào là tường. */
  arena: ArenaState;
  /** Khoảng cách hiện tại, tính bằng ô. */
  gap: number;
  /** Hiệp đang đánh. */
  round: number;
}

export interface ScoredAction {
  action: ResolvedAction;
  score: number;
  /** Vì sao điểm ra thế — cho tab Debug và cho test. */
  reasons: { label: string; value: number }[];
}

function inReach(action: ResolvedAction, gap: number): boolean {
  return gap >= action.reach.min && gap <= action.reach.max;
}

/** Cự ly mà vũ khí của chính mình đánh tốt nhất. */
function sweetSpot(fighter: Fighter): { min: number; max: number } {
  return fighter.loadout.weapon.reach;
}

/**
 * Chấm điểm MỘT hành động.
 *
 * Không có "điểm đúng": bảng dưới đây là một bộ trọng số cân bằng được, và mọi
 * dòng đều đi kèm nhãn để đọc được ở tab Debug. Điều bắt buộc là nó TẤT ĐỊNH và
 * nó thật sự đọc doctrine — một bộ chọn bỏ qua doctrine thì cả tầng 1 của mục 1
 * chỉ còn là một câu văn mở màn đắt tiền.
 */
export function scoreAction(action: ResolvedAction, ctx: ScoreContext): ScoredAction {
  const doctrine = ctx.self.doctrine;
  const reasons: { label: string; value: number }[] = [];
  let score = 10;

  const add = (label: string, value: number): void => {
    if (value === 0) return;
    score += value;
    reasons.push({ label, value });
  };

  // --- Tính cách -----------------------------------------------------------
  if (action.attack) add('hung hãn', (doctrine.aggression - 0.4) * 30);
  if (action.defence) add('nhẫn nại', (doctrine.patience - 0.4) * 22);
  if (action.category === 'di-chuyen') add('đo cự ly', doctrine.patience * 10);

  if (action.base.dishonourable) {
    // Danh dự cao thì đòn bẩn không phải "kém hấp dẫn" — nó là thứ người ấy
    // không làm. Trọng số phải đủ lớn để không bao giờ lọt qua softmax.
    add('đòn bẩn', -doctrine.honor * 120 + 10);
  }
  if (doctrine.favoredActions.length > 0) {
    const favored = doctrine.favoredActions;
    if (favored.includes(action.actionId) || favored.includes(action.nodeId)) add('đòn ruột', 14);
  }

  // --- Cự ly ---------------------------------------------------------------
  const spot = sweetSpot(ctx.self);
  const foeSpot = sweetSpot(ctx.foe);
  const insideOwn = ctx.gap >= spot.min && ctx.gap <= spot.max;
  const insideFoe = ctx.gap >= foeSpot.min && ctx.gap <= foeSpot.max;

  if (action.attack) {
    if (inReach(action, ctx.gap)) add('đúng tầm', 18);
    else add('với không tới', -22);
  }

  // NGHỀ CỦA MÌNH. Không có dòng này thì một tay kiếm hai mươi năm sẽ vật lộn với
  // một hiệp sĩ mặc giáp chỉ vì bảng điểm bảo "giáp nặng dễ vật ngã" — mà anh ta
  // chưa vật ai bao giờ. Người ta đánh bằng thứ mình biết đánh.
  if (action.skillId !== '') add('nghề của mình', ((ctx.self.skills[action.skillId] ?? 0) - 35) * 0.35);

  // Đỡ một đòn không tồn tại là một hiệp cho không. Ở ngoài tầm của địch thì
  // việc phải làm là giành cự ly, không phải giơ vũ khí lên.
  if (action.defence && ctx.gap > foeSpot.max) add('địch còn ở xa', -20);

  const move = action.base.move;
  if (move !== undefined && (move.forward !== 0 || move.strafe !== 0)) {
    const forward = move.forward;
    // Cự ly là toàn bộ nghệ thuật của mục 2: ở trong tầm mình mà ngoài tầm địch
    // là chỗ đứng đáng mơ ước; ở trong tầm địch mà ngoài tầm mình là chỗ chết.
    if (!insideOwn && forward > 0 && ctx.gap > spot.max) add('bước vào tầm mình', 20);
    if (insideFoe && !insideOwn && forward < 0) add('thoát khỏi tầm địch', 22);
    if (insideOwn && !insideFoe && forward !== 0) add('đang ở chỗ tốt, đừng đi', -18);
    if (forward < 0 && !insideFoe) add('lùi khỏi một chỗ chẳng ai với tới', -14);
    if (forward === 0 && move.strafe !== 0) add('vòng tìm sườn', 8 + doctrine.patience * 8);

    // KHÔNG ĐI VÀO TƯỜNG. Không có dòng này thì một đấu sĩ đứng sát mép sân sẽ
    // bấm cùng một nước vô hiệu hết hiệp này sang hiệp khác, và người chơi đọc
    // nhật ký chỉ thấy "bị chắn, không đi được" hai mươi lần.
    if (stepFrom(ctx.arena, ctx.self.pos, ctx.self.facing, move).blocked) add('bước vào tường', -60);
  }

  // --- Thể lực và thương tích ---------------------------------------------
  const stamina = staminaConfig();
  const lowStamina = ctx.self.stamina < (stamina.penalties[1]?.below ?? 40);
  if (lowStamina) {
    add('đang đuối, tiếc sức', -action.staminaCost * 1.6);
    if (action.defence) add('lấy lại hơi', 16);
  }
  if (ctx.self.stamina < ctx.foe.stamina - 25 && action.defence) add('kéo dài để hồi', 12);
  if (ctx.foe.stamina < ctx.self.stamina - 25 && action.attack) add('địch đã đuối, ép tới', 14);

  if (doctrine.targetsWounded && action.attack && ctx.foe.body.injuries.length > 0) {
    add('địch đã có vết', 12);
  }

  // --- Thế trận ------------------------------------------------------------
  const tempo = tempoConfig();
  if (ctx.self.tempo >= tempo.comboFrom && action.attack) add('đang giữ nhịp, đánh tiếp', 14);
  if (ctx.self.tempo <= -2 && action.defence) add('đang bị ép, thủ lại', 16);
  if (ctx.self.tempo <= -2 && action.attack) add('bị ép mà còn xông lên', -10);

  // --- Giáp: engine BIẾT thứ mục 7 nói, và đối thủ cũng biết ---------------
  const tag = attackTagOf(action);
  if (action.attack && ctx.foe.loadout.heaviest.plate) {
    if (tag === 'chem') add('chém vào giáp tấm là vô ích', -30);
    if (tag === 'dap') add('giáp tấm sợ búa', 26);
    if (action.armorPiercing || action.targetsGaps) add('biết chỗ giáp hở', 24);
    if (action.tags.includes('vat-lon')) add('vật ngã một bộ giáp nặng', 16);
  }

  // --- Liều lĩnh -----------------------------------------------------------
  if (action.base.speed === 'cham') add('đòn chậm mà nặng', (doctrine.riskTolerance - 0.5) * 24);
  if (action.base.knockdown || action.base.disarm) add('dứt điểm', doctrine.riskTolerance * 14);
  if (action.severityBonus > 0) add('đòn nặng', doctrine.riskTolerance * 10);

  // --- Không bao giờ tự bấm nút đầu hàng ----------------------------------
  // Kêu hàng là quyết định của người chơi, và của engine khi hết đường (xem
  // `engine.ts`). Bộ chọn không được rút nó ra giữa một trận đang cân.
  if (action.base.yields) add('không nghĩ tới chuyện hàng', -1000);

  return { action, score, reasons };
}

/**
 * Nhiệt độ softmax.
 *
 * Người nhẫn nại đánh có bài — nhiệt độ thấp, gần như luôn chọn nước tốt. Người
 * nóng nảy khó đoán hơn, và cái khó đoán ấy chính là điểm yếu của họ: đôi khi họ
 * chọn nước tệ.
 */
export function temperatureFor(fighter: Fighter): number {
  return 4 + (1 - fighter.doctrine.patience) * 7;
}

export interface Choice {
  action: ResolvedAction;
  scored: ScoredAction[];
  /** Xác suất nước vừa chọn, để tab Debug hiện ra. */
  probability: number;
}

/**
 * Chọn một nước bằng softmax có seeded RNG.
 *
 * Trừ điểm cao nhất trước khi lấy `exp` — không phải để làm đẹp, mà để một bảng
 * điểm rộng không tràn thành `Infinity` và biến softmax thành argmax trong im
 * lặng. Đúng một cú `rng.next()` cho mỗi lần chọn, và nó là cú rút DUY NHẤT của
 * tầng 2 (R3).
 */
export function chooseAction(rng: Rng, candidates: readonly ResolvedAction[], ctx: ScoreContext): Choice {
  if (candidates.length === 0) throw new Error('bộ chọn hành động nhận danh sách rỗng');

  const scored = candidates.map((action) => scoreAction(action, ctx));
  const temperature = temperatureFor(ctx.self);
  const best = scored.reduce((max, entry) => Math.max(max, entry.score), -Infinity);

  const weights = scored.map((entry) => Math.exp((entry.score - best) / temperature));
  const total = weights.reduce((sum, weight) => sum + weight, 0);

  let cursor = rng.next() * total;
  for (const [index, weight] of weights.entries()) {
    cursor -= weight;
    if (cursor < 0) {
      const picked = scored[index];
      if (picked !== undefined) return { action: picked.action, scored, probability: weight / total };
    }
  }

  const last = scored[scored.length - 1];
  const lastWeight = weights[weights.length - 1] ?? 1;
  if (last === undefined) throw new Error('bộ chọn hành động không chọn được gì');
  return { action: last.action, scored, probability: lastWeight / total };
}
