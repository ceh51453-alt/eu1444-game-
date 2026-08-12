/**
 * THỰC HÀNH VÀ ĐIỂM KINH NGHIỆM (Phần 8 mục 3 và 4).
 *
 * Đây là nguồn tiến bộ TỰ ĐỘNG: mỗi lần kiểm định một kỹ năng là một lần cộng
 * điểm thực hành, và đủ ngưỡng thì con số kỹ năng nhích lên một điểm. Ba luật
 * của mục 3 nằm cả ở đây, và cả ba đều tồn tại để chống đúng một thứ — cày máy
 * móc:
 *
 *   1. THẤT BẠI DẠY NHIỀU NHẤT. Đại thất bại +4, thất bại +3, thành công +1.
 *      Người chơi tiến nhanh nhất khi làm việc khó, không phải khi lặp việc dễ.
 *   2. VIỆC QUÁ DỄ CHO 0 ĐIỂM. Đo bằng ngưỡng CUỐI sau mọi điều chỉnh.
 *   3. LẶP CÙNG MỘT HOÀN CẢNH THÌ ĐIỂM TỤT VỀ 0. Phải đổi hoàn cảnh, không phải
 *      đợi hết giờ.
 *
 * Mọi hàm ở đây THUẦN và trả về `PatchOp[]`; người gọi áp qua MVU với actor
 * `engine` (R2). Không hàm nào ghi store, không hàm nào tung xúc sắc — điểm thực
 * hành là hệ quả TẤT ĐỊNH của một cú tung đã xảy ra, nên nó không được rút thêm
 * một con xúc sắc nào (R3).
 */

import type { CheckResult, CheckTier } from '@/core/turn';
import type { PatchOp } from '@/state/mvu-parse';
import type { GameState } from '@/state/slices';
import { skillForDomain, skillOf } from '@/systems/character/skills';
import { capReport } from './caps';
import { practiceConfig, practicePoints, xpPerTurnCap, xpSourceOf, tierName } from './catalog';
import { practiceThreshold } from './load';
import { bestTeacherFor, canTeach } from './caps';
import { levelOf, skillsOf, type PracticeEntry } from './slice';

// ---------------------------------------------------------------------------
// Điểm của một cú tung
// ---------------------------------------------------------------------------

/** Điểm thực hành thô của một cấp kết quả (mục 3). */
export function rawPractice(tier: CheckTier): number {
  const table = practicePoints();
  return table[tier] ?? 0;
}

/**
 * Việc này có quá dễ so với trình độ hiện tại không (mục 3).
 *
 * Đo bằng NGƯỠNG CUỐI đã cộng độ khó và mọi modifier, chứ không đo bằng bậc độ
 * khó: một việc "Khó" với người mới vẫn là việc dễ với bậc thầy, và khe hở đó
 * chính là chỗ cày máy móc chui vào.
 */
export function tooEasy(result: CheckResult): boolean {
  const config = practiceConfig().easyTarget;
  if (result.target === undefined) return false;
  if (result.system === 'd100') return result.target >= config.d100;
  if (result.system === '3d6') return result.target >= config['3d6'];
  return false;
}

/**
 * Hệ số chống cày: 1 khi còn mới, tụt dần về 0 khi lặp mãi một hoàn cảnh.
 *
 * Đếm những lần dùng CÙNG `context` trong cửa sổ `windowTurns` lượt gần nhất.
 * Chỗ này cố ý không phạt việc dùng nhiều một kỹ năng — nó chỉ phạt việc dùng
 * nhiều một kỹ năng theo ĐÚNG MỘT KIỂU.
 */
export function grindFactor(log: readonly PracticeEntry[], context: string, turn: number): number {
  const config = practiceConfig().antiGrind;
  const repeats = log.filter(
    (entry) => entry.context === context && turn - entry.turn < config.windowTurns,
  ).length;
  if (repeats <= config.freeRepeats) return 1;
  return Math.max(0, 1 - (repeats - config.freeRepeats) / config.fadeSpan);
}

/**
 * Nhãn hoàn cảnh mặc định của một cú tung.
 *
 * Miền + bậc độ khó + nhãn hoàn cảnh: đủ để phân biệt "đấu tập trong sân" với
 * "đánh nhau trong rừng lúc trời mưa", mà không cần người gọi tự nghĩ ra một
 * chuỗi. Phần 9–11 truyền `context` riêng khi chúng biết rõ hơn (ai là đối thủ).
 */
export function defaultContext(result: CheckResult, tags: readonly string[] = []): string {
  return [result.domain, result.difficulty, ...[...tags].sort()].join('|');
}

// ---------------------------------------------------------------------------
// Một lần thực hành
// ---------------------------------------------------------------------------

export interface PracticeGain {
  skillId: string;
  /** Điểm thực hành cộng thêm, đã qua chống cày. */
  points: number;
  /** Số điểm kỹ năng lên được sau khi đổ ngưỡng. */
  levels: number;
  levelBefore: number;
  levelAfter: number;
  /** Điểm thực hành còn dư sau khi đổ. */
  remaining: number;
  threshold: number;
  /** Đã chạm trần — điểm thực hành ngừng đổ vào (mục 2). */
  capped: boolean;
  capReason: string;
  line: string;
}

export interface PracticeOutcome {
  ops: PatchOp[];
  gains: PracticeGain[];
  /** Dòng chữ cho log lượt và cho tab Debug. */
  lines: string[];
}

/**
 * Cộng điểm thực hành cho một lô kết quả kiểm định của MỘT lượt.
 *
 * Nhận cả lô chứ không nhận từng cú tung: một lượt có thể tung nhiều lần cùng
 * một kỹ năng (Phần 9 đấu tay đôi tung mỗi hiệp một lần), và ngưỡng phải được
 * đổ theo thứ tự chứ không phải tính song song rồi cộng lại — nếu không thì một
 * kỹ năng có thể vượt trần giữa lô mà không ai chặn.
 */
export function practiceFromChecks(
  state: GameState,
  checks: readonly CheckResult[],
  turn: number,
  options: { context?: string; tags?: readonly string[]; factor?: number } = {},
): PracticeOutcome {
  const skills = skillsOf(state);
  if (skills === null || checks.length === 0) return { ops: [], gains: [], lines: [] };

  const points = { ...skills.practicePoints };
  const log: Record<string, PracticeEntry[]> = {};
  for (const [skillId, entries] of Object.entries(skills.practiceLog)) log[skillId] = [...entries];

  const levels = new Map<string, number>();
  const gains: PracticeGain[] = [];
  const lines: string[] = [];
  const config = practiceConfig();

  for (const result of checks) {
    const skill = skillForDomain(result.domain);
    if (skill === null) continue;

    const before = levels.get(skill.id) ?? levelOf(state, skill.id);
    const report = capReport(state, skill.id);

    if (before >= report.cap) {
      // Chạm trần: KHÔNG tích điểm nữa. Tích rồi giữ đó để một ngày nào đó đổ ập
      // xuống là biến "tìm thầy" thành một thủ tục — người chơi chỉ việc cày sẵn
      // rồi thuê thầy một hôm là nhảy mười điểm, và cả mục 8 mất nghĩa.
      const entry: PracticeGain = {
        skillId: skill.id,
        points: 0,
        levels: 0,
        levelBefore: before,
        levelAfter: before,
        remaining: points[skill.id] ?? 0,
        threshold: 0,
        capped: true,
        capReason: report.reason,
        line: `${skill.name} đã chạm trần ${report.cap} — ${report.reason}`,
      };
      gains.push(entry);
      continue;
    }

    if (tooEasy(result)) continue;

    const raw = rawPractice(result.tier);
    if (raw <= 0) continue;

    const context = options.context ?? defaultContext(result, options.tags);
    const history = log[skill.id] ?? [];
    // `options.factor` là hệ số của HOÀN CẢNH, không phải của cú tung: một buổi
    // đấu tập tồn tại để học (Phần 9 mục 9 cho nó 1.5), còn một trận phục kích
    // thì người ta bận sống sót hơn là bận rút kinh nghiệm. Nó nhân vào SAU hệ
    // số chống cày, nên đấu tập với đúng một người mãi vẫn tụt về 0.
    const factor = grindFactor(history, context, turn) * Math.max(0, options.factor ?? 1);
    const gain = Math.round(raw * factor * 100) / 100;

    // Ghi lần dùng này vào sổ tay dù điểm bằng 0: chính những lần 0 điểm mới là
    // thứ giữ cho hệ số chống cày còn thấp cho tới khi người chơi đổi hoàn cảnh.
    history.push({ context, turn });
    log[skill.id] = history.filter((item) => turn - item.turn < config.antiGrind.windowTurns).slice(-60);
    if (gain <= 0) continue;

    const teacher = bestTeacherFor(state, skill.id);
    let level = before;
    let pool = (points[skill.id] ?? 0) + gain;
    let threshold = practiceThreshold(state, level, canTeach(teacher, skill.id, level));
    let gainedLevels = 0;

    while (pool >= threshold && level < report.cap) {
      pool -= threshold;
      level += 1;
      gainedLevels += 1;
      threshold = practiceThreshold(state, level, canTeach(teacher, skill.id, level));
    }
    // Chạm trần giữa chừng thì phần điểm dư KHÔNG giữ lại, cùng lý do ở trên.
    if (level >= report.cap) pool = 0;

    points[skill.id] = Math.round(pool * 100) / 100;
    if (gainedLevels > 0) levels.set(skill.id, level);

    const entry: PracticeGain = {
      skillId: skill.id,
      points: gain,
      levels: gainedLevels,
      levelBefore: before,
      levelAfter: level,
      remaining: points[skill.id] ?? 0,
      threshold,
      capped: level >= report.cap,
      capReason: report.reason,
      line:
        gainedLevels > 0
          ? `${skill.name} ${before} → ${level} (${tierName(level)})`
          : `${skill.name} +${gain} điểm thực hành (${points[skill.id]}/${threshold})`,
    };
    gains.push(entry);
    lines.push(entry.line);
  }

  if (gains.length === 0) return { ops: [], gains: [], lines: [] };

  const ops: PatchOp[] = [];
  const changedPoints = JSON.stringify(points) !== JSON.stringify(skills.practicePoints);
  const changedLog = JSON.stringify(log) !== JSON.stringify(skills.practiceLog);

  if (changedPoints) {
    ops.push({ op: 'set', path: 'skills.practicePoints', to: points, reason: 'điểm thực hành của lượt', source: 'json' });
  }
  if (changedLog) {
    ops.push({ op: 'set', path: 'skills.practiceLog', to: log, reason: 'sổ tay chống cày máy móc', source: 'json' });
  }
  for (const [skillId, level] of levels) {
    ops.push({
      op: 'set',
      path: `character.skills.${skillId}.level`,
      to: level,
      reason: `rèn luyện lên bậc ${tierName(level)}`,
      source: 'json',
    });
  }

  return { ops, gains, lines };
}

// ---------------------------------------------------------------------------
// Điểm kinh nghiệm (mục 4)
// ---------------------------------------------------------------------------

export interface XpOutcome {
  ops: PatchOp[];
  amount: number;
  lines: string[];
}

/**
 * Trao điểm KN từ những nguồn của mục 4.
 *
 * KHÔNG có nguồn nào là giết lẻ tẻ, và hàm này cố ý không nhận một con số tự do:
 * người gọi phải nêu ID NGUỒN, và số điểm nằm trong `data/skill-progress.json`.
 * Nhận số tự do là mở đường cho mỗi phần sau tự chọn một mức hào phóng riêng.
 */
export function awardXp(
  state: GameState,
  sourceIds: readonly string[],
  reasonNote = '',
): XpOutcome {
  const skills = skillsOf(state);
  if (skills === null || sourceIds.length === 0) return { ops: [], amount: 0, lines: [] };

  let amount = 0;
  const lines: string[] = [];
  for (const id of sourceIds) {
    const source = xpSourceOf(id);
    if (source === null) continue;
    amount += source.amount;
    lines.push(`${source.name}: +${source.amount} điểm KN`);
  }

  amount = Math.min(amount, xpPerTurnCap());
  if (amount <= 0) return { ops: [], amount: 0, lines: [] };

  return {
    ops: [
      {
        op: 'add',
        path: 'skills.xp',
        to: amount,
        reason: reasonNote === '' ? lines.join('; ') : reasonNote,
        source: 'json',
      },
      { op: 'add', path: 'skills.xpEarned', to: amount, reason: 'tổng điểm KN đã kiếm', source: 'json' },
    ],
    amount,
    lines,
  };
}

/**
 * Nguồn điểm KN suy được từ chính kết quả của lượt.
 *
 * Chỉ MỘT nguồn tự động, và nó là nguồn hẹp nhất trong bảng: "thất bại thảm hại
 * nhưng sống sót". Những nguồn còn lại — thắng trận, hoàn thành mục tiêu dài
 * hạn, đọc sách quý — thuộc về Phần 10, 13 và 15, nơi biết một trận đánh đã kết
 * thúc hay một mục tiêu đã xong. Đoán chúng từ một cú tung d100 là đoán sai.
 */
export function xpSourcesFromChecks(checks: readonly CheckResult[]): string[] {
  return checks.some((check) => check.tier === 'critFail' && skillForDomain(check.domain) !== null)
    ? ['that-bai-tham']
    : [];
}

/** Tên đọc được của một kỹ năng, để log không in ra id. */
export function skillLabel(skillId: string): string {
  return skillOf(skillId)?.name ?? skillId;
}
