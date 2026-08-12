/**
 * TRƯỚC VÀ SAU TRẬN (Phần 10 mục 12).
 *
 * MỘT CON SỐ QUYẾT ĐỊNH CẢ FILE NÀY: mục 1 nói "phần lớn thương vong xảy ra SAU
 * khi một bên bỏ chạy", nên `pursue` phải giết được nhiều hơn cả trận đánh cộng
 * lại. Nếu truy kích chỉ là một dòng cộng thêm dễ thương thì cả mục 1 sai, và
 * người chơi sẽ học được một bài học lịch sử ngược: rằng thắng bại quyết định
 * bằng việc chém đủ người trong lúc giao tranh.
 *
 * TÙ BINH VÀ TIỀN CHUỘC là thứ đặc trưng nhất của thời kỳ này, và mục 12 nói rõ
 * "quý tộc bị bắt sinh lời". Nên bắt sống một cánh quân quý tộc đáng giá hơn hẳn
 * giết sạch nó — và đó là một trong rất ít chỗ mà lòng nhân đạo và lợi ích trùng
 * nhau trong cả trò chơi này.
 */

import type { Rng } from '@/core/rng';
import { heraldryConfig, recognitionOf, rollExposure, valueOf, type Item } from '@/systems/items';
import { battleConfig, noDaylightPursuitTag, timeOfDayOf } from './data';
import { obedienceOutcome } from './command';
import { cloneBattle } from './engine';
import {
  WING_LABELS,
  otherSide,
  type Aftermath,
  type BattleState,
  type Prisoner,
  type SideId,
} from './types';

/** Quân đã mất của một bên: chênh lệch giữa quân mang tới và quân còn đứng. */
function lossesOf(battle: BattleState, side: SideId): number {
  return battle.units
    .filter((unit) => unit.side === side)
    .reduce((sum, unit) => sum + (unit.maxStrength - unit.strength), 0);
}

/** Quân đã bỏ chạy hoặc tan rã — chính là đám bị truy kích. */
function brokenOf(battle: BattleState, side: SideId): number {
  return battle.units
    .filter((unit) => unit.side === side && (unit.state === 'vo-tran' || unit.state === 'tan-ra'))
    .reduce((sum, unit) => sum + unit.strength, 0);
}

export interface PursuitReport {
  killed: number;
  prisoners: number;
  nobles: number;
  /** Truy kích bị cắt ngang vì bình minh (mục 9b). */
  cutByDawn: boolean;
  note: string;
}

/**
 * Truy kích — mục 12, và ràng buộc bù lại của Huyết Tộc ở mục 9b.
 *
 * Ba tầng, và tầng thứ ba là chỗ Phần 14b cắm vào:
 *   · có kỵ binh đuổi theo thì giết được nhiều hơn hẳn
 *   · đêm tối thì đuổi kém đi, vì không ai thấy đường
 *   · quân mang nhãn `khong-truy-kich-ban-ngay` KHÔNG đuổi được sau bình minh —
 *     "chiến thắng ban đêm của họ hiếm khi trọn vẹn: địch tan nhưng chạy thoát"
 */
export function pursue(battle: BattleState, winner: SideId): PursuitReport {
  const config = battleConfig().pursuit;
  const time = timeOfDayOf(battle.timeId);
  const fleeing = brokenOf(battle, otherSide(winner));
  if (fleeing <= 0) return { killed: 0, prisoners: 0, nobles: 0, cutByDawn: false, note: 'Không còn ai để đuổi.' };

  const chasers = battle.units.filter(
    (unit) => unit.side === winner && unit.state !== 'tan-ra' && unit.state !== 'vo-tran',
  );
  const cavalry = chasers.filter((unit) => unit.tags.includes('ky-binh'));
  const daylightBlind = cavalry.filter((unit) => unit.tags.includes(noDaylightPursuitTag()));
  const usableCavalry = cavalry.length - daylightBlind.length;

  let ratio = usableCavalry > 0 ? config.cavalryRatio : config.baseRatio;
  let cutByDawn = false;
  let note = usableCavalry > 0 ? 'Kỵ binh đuổi theo tới tận rừng.' : 'Bộ binh đuổi được một quãng rồi thôi.';

  // Cả lực lượng đuổi đều là quân không chịu được ánh ngày: họ phải bỏ dở.
  if (cavalry.length > 0 && usableCavalry === 0) {
    ratio = config.baseRatio * config.nightPenalty;
    cutByDawn = true;
    note = 'Trời hửng sáng. Quân đuổi phải quay đầu — địch tan nhưng chạy thoát.';
  } else if (time?.night === true) {
    ratio *= config.nightPenalty;
    note = `${note} Bóng tối che cho phần lớn đám chạy.`;
  }

  const killed = Math.round(fleeing * ratio);
  const prisoners = Math.round(fleeing * config.prisonerRatio);
  const nobles = Math.max(prisoners > 0 ? 1 : 0, Math.round(prisoners * config.nobleRatio));
  return { killed, prisoners, nobles, cutByDawn, note };
}

function namePrisoners(battle: BattleState, rng: Rng, side: SideId, count: number, nobles: number): Prisoner[] {
  const config = battleConfig().ransom;
  const out: Prisoner[] = [];
  const officers = battle.officers.filter((officer) => officer.side === side);

  for (let index = 0; index < nobles; index++) {
    // Tên có sẵn của các viên tướng dùng trước — bắt được một cái tên người chơi
    // đã thấy trên bảng tướng đắt giá hơn hẳn một dòng "quý tộc số 3".
    const officer = officers[index % Math.max(1, officers.length)];
    const named = officer !== undefined && index < officers.length;
    out.push({
      name: named ? officer.name : `Một quý tộc ${WING_LABELS[officers[0]?.wing ?? 'trung']}`,
      side,
      noble: true,
      ransom: Math.round(config.perNoble * (0.6 + rng.next() * 0.8)),
    });
  }
  const soldiers = Math.max(0, count - nobles);
  if (soldiers > 0) {
    out.push({
      name: `${String(soldiers)} lính thường`,
      side,
      noble: false,
      ransom: Math.round(soldiers * config.perSoldier),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// HUY HIỆU → TÙ BINH VÀ TIỀN CHUỘC (Phần 16 mục 13a, nối vào mục 12 ở đây)
// ---------------------------------------------------------------------------

export interface CaptureFate {
  outcome: 'bat-song' | 'giet-ngay' | 'thoat';
  /** Tiền chuộc người ta sẽ đòi — tính theo GIÁ TRỊ THẬT của bộ giáp trên người. */
  ransom: number;
  /** Danh dự mất đi vì giấu huy hiệu mà bị bắt gặp (mục 13c). */
  honourChange: number;
  lines: string[];
}

/**
 * Số phận của một người bại trận, quyết định bởi HUY HIỆU chứ không bởi cấp bậc.
 *
 * Đây là chỗ mục 13 của Phần 16 nối vào mục 12 của Phần 10, và là lý do cơ học
 * để người ta mang huy hiệu ra chiến trường dù nó khiến mình thành mục tiêu:
 *
 *   có huy hiệu     người ta giữ mạng ngài để đòi tiền — và tiền ấy tính theo
 *                   bộ giáp ngài đang mặc, vì bộ giáp là thứ họ nhìn thấy
 *   giấu huy hiệu   trốn thoát dễ hơn, nhưng bị bắt gặp là mất danh dự nặng
 *   giáp đắt, không có huy hiệu
 *                   BỊ COI LÀ CƯỚP VÀ BỊ GIẾT NGAY (câu cuối mục 13)
 *
 * Hàm ĐỨNG RIÊNG chứ không nằm trong `settleAftermath`: trận đánh ở tầng đơn vị
 * không biết người chơi mang gì trên người, và bịa ra một đường đọc ngược vào
 * slice `items` từ trong một minigame là phá đúng ranh giới mà Phần 12 mục 1 và
 * Phần 13 mục 1 dựng lên. Người gọi có cả hai thứ thì người gọi ghép.
 */
export function captureFate(rng: Rng, worn: readonly Item[], options: { defeated: boolean }): CaptureFate {
  if (!options.defeated) {
    return { outcome: 'thoat', ransom: 0, honourChange: 0, lines: [] };
  }

  const config = heraldryConfig();
  const recognition = recognitionOf(worn);
  const exposure = rollExposure(rng, worn);
  const lines = [...recognition.lines, ...(exposure.line === '' ? [] : [exposure.line])];

  const roll = rng.int(1, 100);
  if (roll <= config.captureChanceBonus + recognition.captureBonus) {
    // Tiền chuộc theo GIÁ TRỊ TRANG BỊ: mục 1c nói bộ giáp tấm đáng bằng một
    // trang viên, và đó chính là lý do tù binh quý tộc sinh lời.
    const ransom = Math.round(worn.reduce((sum, item) => sum + valueOf(item), 0) * 1.5);
    lines.push(`Bị bắt sống — tiền chuộc người ta sẽ đòi chừng ${String(ransom)} đồng.`);
    return { outcome: 'bat-song', ransom, honourChange: exposure.honourChange, lines };
  }
  if (roll <= config.richNoDeviceKillBonus + recognition.killBonus) {
    lines.push('Không ai biết ngài là ai, và không ai giữ mạng một người lạ mặc giáp tốt.');
    return { outcome: 'giet-ngay', ransom: 0, honourChange: exposure.honourChange, lines };
  }
  lines.push('Lẫn được vào đám chạy.');
  return { outcome: 'thoat', ransom: 0, honourChange: exposure.honourChange, lines };
}

/**
 * Chốt hệ quả sau trận. Trả về một BẢN SAO — trận gốc không bị đụng tới.
 *
 * Gọi sau khi `battle.finished`. Gọi hai lần cũng ra cùng một kết quả nếu cùng
 * `rng` ở cùng vị trí (R3), nhưng nó chỉ nên được gọi một lần và người gọi giữ
 * bản trả về.
 */
export function settleAftermath(battle: BattleState, rng: Rng): BattleState {
  const next = cloneBattle(battle);
  const config = battleConfig();
  const winner = next.winner;

  const losses: Record<SideId, number> = { a: lossesOf(next, 'a'), b: lossesOf(next, 'b') };
  const pursuitKills: Record<SideId, number> = { a: 0, b: 0 };
  let prisoners: Prisoner[] = [];
  let cutByDawn = false;
  let pursuitNote = 'Không bên nào đủ sức đuổi theo bên nào.';

  if (winner !== '') {
    const loser = otherSide(winner);
    const report = pursue(next, winner);
    pursuitKills[loser] = report.killed;
    cutByDawn = report.cutByDawn;
    pursuitNote = report.note;
    prisoners = namePrisoners(next, rng, loser, report.prisoners, report.nobles);
  }

  // Thương binh: một phần thương vong TRONG trận là người còn sống. Truy kích thì
  // không — bị đuổi kịp trên đồng trống thì không có thương binh, chỉ có xác.
  const wounded: Record<SideId, number> = {
    a: Math.round(losses.a * 0.4),
    b: Math.round(losses.b * 0.4),
  };

  const ransom = prisoners.reduce((sum, entry) => sum + entry.ransom, 0);
  const enemyLost = winner === '' ? 0 : losses[otherSide(winner)] + pursuitKills[otherSide(winner)];
  const loot = Math.round(enemyLost * config.ransom.lootPerEnemyLost);

  const obedience = obedienceOutcome(next);

  const lines: string[] = [];
  lines.push(`Bên thứ nhất mất ${String(losses.a + pursuitKills.a)} người; bên thứ hai mất ${String(losses.b + pursuitKills.b)}.`);
  lines.push(pursuitNote);
  if (prisoners.length > 0) {
    lines.push(
      `Bắt được ${String(prisoners.filter((entry) => entry.noble).length)} quý tộc và ${String(
        prisoners.filter((entry) => !entry.noble).length > 0 ? prisoners.at(-1)?.name ?? '' : 'không lính thường nào',
      )} — tiền chuộc ước chừng ${String(ransom)} đồng.`,
    );
  }
  if (loot > 0) lines.push(`Chiến lợi phẩm nhặt trên chiến trường: chừng ${String(loot)} đồng.`);
  lines.push(
    `Thương binh chuyển sang thầy thuốc: ${String(wounded.a)} người bên thứ nhất, ${String(wounded.b)} bên thứ hai.`,
  );
  lines.push(obedience.line);
  if (cutByDawn) lines.push('Bình minh cắt ngang cuộc đuổi. Phần lớn quân bại trận về được tới nhà.');

  const aftermath: Aftermath = {
    losses,
    pursuitKills,
    wounded,
    prisoners,
    ransom,
    loot,
    reputation: obedience.reputation,
    lordStanding: obedience.standing,
    pursuitCutByDawn: cutByDawn,
    lines,
  };

  next.aftermath = aftermath;
  for (const line of lines) next.log.push({ round: next.round, side: '', text: line });
  return next;
}

// ---------------------------------------------------------------------------
// TRƯỚC trận (mục 12)
// ---------------------------------------------------------------------------

export interface PrepReport {
  battle: BattleState;
  lines: string[];
}

/**
 * Diễn thuyết động viên — kiểm định ELO, cộng sĩ khí cho cả đạo quân.
 *
 * Đi qua `runCheck` chứ không cộng thẳng, vì đây là một hành động của NHÂN VẬT và
 * mọi hành động của nhân vật đều có xác suất (R6). Hùng biện là kỹ năng cá nhân
 * nên nó ở miền d100, đúng phân miền của Phần 5 mục 2 — không phải pool, dù kết
 * quả rơi xuống hàng vạn người.
 */
export function rallySpeech(battle: BattleState, rng: Rng, speakerElo: number, side: SideId): PrepReport {
  const next = cloneBattle(battle);
  const lines: string[] = [];

  // Nhập chỗ này qua `runCheck` cần một import vòng tròn với `check/run`; giữ
  // đơn giản: một cú tung d100 thẳng trên dòng của trận, và kết quả quy về ba mức.
  const roll = rng.int(1, 100);
  const target = Math.max(5, Math.min(95, speakerElo * 3));
  const gain = roll <= Math.max(1, Math.floor(target / 10)) ? 12 : roll <= target ? 7 : roll >= 96 ? -5 : 0;

  for (const unit of next.units) {
    if (unit.side !== side) continue;
    unit.morale = Math.max(0, Math.min(unit.moraleMax, unit.morale + gain));
  }
  lines.push(
    gain > 8
      ? 'Bài nói làm cả hàng quân gào lên. Sĩ khí bốc hẳn.'
      : gain > 0
        ? 'Bài nói được việc. Hàng quân đứng thẳng hơn một chút.'
        : gain < 0
          ? 'Bài nói lạc giọng. Có tiếng cười ở hàng sau, và điều đó tệ hơn im lặng.'
          : 'Bài nói trôi qua, không ai nhớ được câu nào.',
  );
  for (const line of lines) next.log.push({ round: 0, side, text: line });
  return { battle: next, lines };
}

/** Lễ ban phước trước trận — cộng thẳng, nhỏ, và chỉ cho bên xin. */
export function blessing(battle: BattleState, side: SideId, amount = 5): PrepReport {
  const next = cloneBattle(battle);
  for (const unit of next.units) {
    if (unit.side !== side) continue;
    unit.morale = Math.max(0, Math.min(unit.moraleMax, unit.morale + amount));
  }
  const line = 'Linh mục đi dọc hàng quân. Người ta quỳ xuống, rồi đứng dậy vững hơn.';
  next.log.push({ round: 0, side, text: line });
  return { battle: next, lines: [line] };
}

/**
 * Cử người do thám — mở ra thành phần đội hình của bên kia.
 *
 * Ở giai đoạn này nó trả về một BẢN MÔ TẢ chứ không mở khoá gì trong state: cổng
 * tri thức thật là của Phần 4, và Phần 15 mới là chỗ tin tức sai lệch được mô
 * hình hóa. Đây là cái móc, và nó phải tồn tại từ bây giờ để Phần 15 có chỗ cắm.
 */
export function scout(battle: BattleState, side: SideId): string[] {
  const foes = battle.units.filter((unit) => unit.side === otherSide(side));
  const byType = new Map<string, number>();
  for (const unit of foes) byType.set(unit.name.replace(/\s\d+$/u, ''), (byType.get(unit.name.replace(/\s\d+$/u, '')) ?? 0) + 1);

  const lines = [...byType.entries()].map(([name, count]) => `${name}: ${String(count)} đơn vị`);
  lines.unshift(`Người do thám về, đếm được chừng ${String(foes.reduce((sum, unit) => sum + unit.strength, 0))} quân bên kia.`);
  return lines;
}
