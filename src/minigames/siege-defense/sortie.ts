/**
 * ĐỘT KÍCH RA NGOÀI — MỤC TIÊU LÀ ĐỐT MÁY CÔNG THÀNH (Phần 11 mục 3).
 *
 * "Rủi ro cao, phần thưởng lớn. Dùng lưới nhỏ như Phần 9/10 quy mô RÚT GỌN."
 *
 * Chữ *rút gọn* là chữ quyết định hình dạng file này. Một cuộc đột kích thật kéo
 * dài chừng một giờ, có bốn mươi người, và cả nó xoay quanh đúng ba câu hỏi:
 * ra được không, đốt được không, về được không. Dựng một lưới ba mươi ô với điểm
 * khởi động và đội hình cho ba câu hỏi ấy là dựng một minigame thứ tư mà không ai
 * xin — và nó sẽ ngốn của người chơi mười phút cho một hành động họ bấm mười lần
 * trong một cuộc vây hãm. Nên ở đây là BA PHA, mỗi pha một phép kiểm, và cả ba
 * dùng đúng hai hệ mà Phần 5 mục 2 đã phân miền: d100 cho việc lẻn ra (kỹ năng cá
 * nhân của người dẫn đầu), pool cho việc đánh nhau ở chỗ máy bắn (quy mô đơn vị).
 *
 * PHẦN THƯỞNG PHẢI THẬT LỚN, nếu không thì không ai liều. Một cỗ trebuchet cháy
 * là ba tuần và bốn trăm hai mươi đồng của bên kia bốc hơi trong một giờ — và
 * `rebuildFactor` nói rằng dựng lại vẫn mất hơn một nửa số ấy.
 */

import type { Rng } from '@/core/rng';
import { runCheck } from '@/systems/check/run';
import { isSuccess } from '@/systems/check/tiers';
import {
  ASSAULT_DOMAIN,
  PARLEY_DOMAIN,
  SORTIE_DOMAIN,
  engineConfig,
  killBesieger,
  killDefender,
  makeView,
  siegeConfig,
  withSiegeView,
  type SiegeState,
} from '@/systems/siege';

export interface SortieReport {
  /** Tên những cỗ máy đã cháy. */
  burned: string[];
  /** Người bên thủ không quay về. */
  losses: number;
  /** Người bên vây chết ở chỗ máy bắn. */
  enemyLosses: number;
  /** Ra được khỏi cổng mà chưa bị phát hiện. */
  surprised: boolean;
  lines: string[];
}

export function sortie(siege: SiegeState, rng: Rng, men: number): SortieReport {
  const config = engineConfig();
  const morale = siegeConfig().morale;
  const out: SortieReport = { burned: [], losses: 0, enemyLosses: 0, surprised: false, lines: [] };

  const party = Math.max(10, Math.round(men));
  siege.defender.sorties += 1;
  siege.defender.lastSortieWeek = siege.week;

  // --- PHA 1: LẺN RA. Vòng vây càng kín thì cổng càng khó mở mà không ai nghe.
  const sneak = withSiegeView(makeView(siege, 'thu'), () =>
    runCheck(rng, {
      id: 'siege.dot-kich.len-ra',
      system: 'd100',
      domain: PARLEY_DOMAIN,
      difficulty: siege.attacker.circumvallation >= 2 ? 'rat-kho' : siege.attacker.circumvallation >= 1 ? 'kho' : 'thuong',
      base: 50,
      actor: siege.playerSide === 'thu' ? '' : 'npc_thu',
      tags: ['len-lut', 'ban-dem'],
      state: siege.state,
    }),
  );
  siege.checks.push({ week: siege.week, side: 'thu', what: 'lẻn ra khỏi cổng', result: sneak.result });
  out.surprised = isSuccess(sneak.result.tier);

  out.lines.push(
    out.surprised
      ? `Cổng phụ mở lúc gần sáng. ${String(party)} người ra ngoài, chân quấn giẻ, không ai cầm đuốc.`
      : `Cổng vừa hé thì chó trong trại sủa. ${String(party)} người phải chạy qua một khoảng đất đã có người chờ sẵn.`,
  );

  // --- PHA 2: TỚI CHỖ MÁY BẮN. Hệ pool — đây là một pha đụng độ có quy mô.
  const targets = siege.attacker.engines
    .filter((engine) => !engine.destroyed && engine.built)
    .sort((left, right) => (right.progress > left.progress ? 1 : -1));

  if (targets.length === 0) {
    out.lines.push('Tới nơi thì không có gì để đốt: bên kia chưa dựng xong cỗ nào.');
    return out;
  }

  // Mỗi cỗ máy một cú tung. Máy có lính canh thì khó hơn hẳn — và `guarded` là
  // thứ bên vây mua được bằng chính người của họ.
  for (const engine of targets.slice(0, 2)) {
    const guarded = engine.guarded;
    const check = withSiegeView(makeView(siege, 'thu', { forlorn: !out.surprised }), () =>
      runCheck(rng, {
        id: 'siege.dot-kich.dot-may',
        system: 'pool',
        domain: SORTIE_DOMAIN,
        difficulty: guarded ? 'rat-kho' : out.surprised ? 'thuong' : 'kho',
        base: Math.max(2, Math.min(10, Math.round(party / 25))),
        actor: siege.playerSide === 'thu' ? '' : 'npc_thu',
        tags: ['dot-kich'],
        state: siege.state,
      }),
    );
    siege.checks.push({ week: siege.week, side: 'thu', what: `đốt ${engine.name}`, result: check.result });

    const burnRoll = rng.int(1, 100);
    const chance = config.burnBaseChance + (out.surprised ? 20 : 0) + (guarded ? config.guardedPenalty : 0);

    if (isSuccess(check.result.tier) && burnRoll <= chance) {
      engine.destroyed = true;
      out.burned.push(engine.name);
      out.lines.push(`${engine.name} bốc cháy. Từ trên tường, cả thành nhìn thấy cái cột lửa ấy.`);
      out.enemyLosses += killBesieger(siege, party * 0.25, 'combat');
    } else {
      out.lines.push(`Không đốt nổi ${engine.name} — đám thợ ngủ ngay dưới chân nó và họ dậy rất nhanh.`);
      out.enemyLosses += killBesieger(siege, party * 0.1, 'combat');
    }

    // --- PHA 3: VỀ. Thương vong dồn hết vào đây, đúng như một cuộc đột kích thật:
    // người ta chết trên đường về, không phải lúc châm lửa.
    const back = withSiegeView(makeView(siege, 'thu'), () =>
      runCheck(rng, {
        id: 'siege.dot-kich.rut-ve',
        system: 'pool',
        domain: ASSAULT_DOMAIN,
        difficulty: out.surprised ? 'kho' : 'rat-kho',
        base: Math.max(2, Math.min(10, Math.round(party / 30))),
        actor: siege.playerSide === 'thu' ? '' : 'npc_thu',
        tags: ['rut-lui'],
        state: siege.state,
      }),
    );
    siege.checks.push({ week: siege.week, side: 'thu', what: 'rút về sau đột kích', result: back.result });

    const lostShare =
      back.result.tier === 'critFail' ? 0.75 : back.result.tier === 'fail' ? 0.45 : back.result.tier === 'costlySuccess' ? 0.28 : 0.12;
    out.losses += killDefender(siege, party * lostShare, 'combat');
    break;
  }

  if (out.burned.length > 0) {
    siege.defender.garrisonMorale = Math.min(100, siege.defender.garrisonMorale + morale.sortieBurnedEngine);
    siege.defender.populationMorale = Math.min(100, siege.defender.populationMorale + morale.sortieBurnedEngine * 0.6);
    siege.attacker.morale = Math.max(0, siege.attacker.morale - 10);
  } else {
    siege.defender.garrisonMorale = Math.max(0, siege.defender.garrisonMorale + morale.sortieFailed);
  }

  out.lines.push(
    out.losses >= party * 0.5
      ? `Chỉ ${String(Math.max(0, party - out.losses))} người quay về được. Cổng đóng lại sau lưng họ và không ai đếm nữa.`
      : `${String(Math.max(0, party - out.losses))} người quay về, mất ${String(out.losses)}.`,
  );
  return out;
}
