/**
 * PHẢN ĐÀO HẦM — MỘT MINIGAME NHỎ RIÊNG, RẤT CHẾT CHÓC (Phần 11 mục 3, mục 10.5).
 *
 * "Đào ngược lại gặp hầm địch, đánh nhau dưới lòng đất trong bóng tối."
 *
 * BA THỨ BỊ GỠ BỎ SO VỚI MỌI PHA ĐÁNH NHAU KHÁC TRONG GAME, và chính ba thứ ấy
 * làm nó chết chóc chứ không phải một con số thương vong cao:
 *
 *   KHÔNG CÓ ĐỘI HÌNH   một đường hầm rộng vừa đủ hai người bò. Số đông vô dụng,
 *                       nên `crew` chỉ quyết định cầm cự được mấy hiệp, không
 *                       quyết định thắng thua.
 *   KHÔNG CÓ TẦM BẮN    không cung, không giáo dài, không ai bắn ai. Mọi thứ ở
 *                       khoảng cách một cánh tay.
 *   KHÔNG AI CHẠY ĐƯỢC  không có "vỡ trận" ở đây. Hầm chỉ có một đầu, và người
 *                       thua thì không về. Vì thế `casualtyPerRound` cao gấp mấy
 *                       lần mọi chỗ khác, và điều đó là ĐÚNG chứ không phải lệch
 *                       cân bằng.
 *
 * Hệ quả: người NHÌN ĐƯỢC TRONG TỐI gần như bất khả chiến bại dưới đây — một đội
 * thợ Lùn hay một toán Huyết Tộc trong hầm là chuyện khác hẳn cùng đám ấy trên
 * mặt đất. `darkSource` của Phần 11 in ra cả hai chiều của luật ấy.
 *
 * THẮNG THÌ HẦM ĐỊCH DỪNG HẲN. Đó là toàn bộ lý do liều: một đường hầm chạy tới
 * nơi là một đoạn tường sụp, và không có tường thì không có cuộc vây hãm nào kéo
 * dài thêm được nữa.
 */

import type { Rng } from '@/core/rng';
import { runCheck } from '@/systems/check/run';
import {
  COUNTERMINE_DOMAIN,
  counterMineConfig,
  killBesieger,
  killDefender,
  makeView,
  minerBonus,
  withSiegeView,
  type SiegeState,
} from '@/systems/siege';

export interface CounterMineRound {
  n: number;
  tier: string;
  /** Bên thủ mất bao nhiêu người trong hiệp này. */
  ours: number;
  theirs: number;
  line: string;
}

export interface CounterMineReport {
  won: boolean;
  /** Cả hai hầm sập, không ai thắng. */
  collapsed: boolean;
  flooded: boolean;
  losses: number;
  enemyLosses: number;
  rounds: CounterMineRound[];
  lines: string[];
}

/**
 * Một trận dưới lòng đất.
 *
 * Vòng lặp có TRẦN CỨNG (`maxRounds`) vì cùng lý do với `MAX_ROUNDS` của Phần 10:
 * một cấu hình data hỏng không được phép treo vòng lặp, và ở đây thì "cả hai bên
 * cùng không chết" là một kết cục hoàn toàn có thể xảy ra — lúc ấy hai bên bịt
 * hầm lại và bỏ đi, đúng như trong sử.
 */
export function counterMine(siege: SiegeState, rng: Rng, crew?: number): CounterMineReport {
  const config = counterMineConfig();
  const out: CounterMineReport = {
    won: false,
    collapsed: false,
    flooded: false,
    losses: 0,
    enemyLosses: 0,
    rounds: [],
    lines: [],
  };

  const shaft = siege.attacker.mines.find((mine) => mine.detected && !mine.collapsed && !mine.fired);
  if (shaft === undefined) {
    out.lines.push('Không nghe thấy tiếng cuốc nào nữa. Không có gì để đào ngược lại.');
    return out;
  }

  let ours = Math.max(8, Math.round(crew ?? config.crewDefault));
  let theirs = Math.max(8, Math.round(shaft.crew));
  siege.defender.counterMines += 1;

  // Bên đào hầm hay là bên nhìn được trong tối — đó là lý do người ta thuê Lùn.
  const theirSight = minerBonus(shaft.raceId) >= 30;

  out.lines.push(
    `Người ta đào một ngách chéo xuống, dừng lại mỗi mười bước để nghe. Đến ngày thứ tư thì hai mũi cuốc chạm nhau qua một vách đất mỏng.`,
  );

  for (let round = 1; round <= config.maxRounds; round++) {
    if (ours <= 0 || theirs <= 0) break;

    const check = withSiegeView(
      makeView(siege, 'thu', { underground: true, nightSight: false }),
      () =>
        runCheck(rng, {
          id: config.checkId,
          system: 'pool',
          domain: COUNTERMINE_DOMAIN,
          difficulty: config.fightBand,
          // Số đông không giúp mấy: hầm rộng vừa hai người. Trần bốn viên là hình
          // dạng của cái hầm, không phải một con số cân bằng.
          base: Math.max(1, Math.min(4, Math.round(ours / 20))) + (theirSight ? -1 : 0),
          actor: siege.playerSide === 'thu' ? '' : 'npc_thu',
          tags: ['duoi-long-dat', 'ban-dem'],
          state: siege.state,
        }),
    );
    siege.checks.push({ week: siege.week, side: 'thu', what: `đánh nhau dưới hầm, hiệp ${String(round)}`, result: check.result });

    const tier = check.result.tier;
    let ourLoss = Math.round(ours * config.casualtyPerRound);
    let theirLoss = Math.round(theirs * config.casualtyPerRound);
    let line: string;

    switch (tier) {
      case 'critSuccess':
        theirLoss = Math.round(theirs * config.casualtyPerRound * 2);
        ourLoss = Math.round(ourLoss * 0.4);
        line = 'Một ngọn đèn bị đá đổ. Trong bóng tối hoàn toàn, bên mình đánh xuôi còn bên kia đánh ngược.';
        break;
      case 'success':
        ourLoss = Math.round(ourLoss * 0.7);
        line = 'Đẩy được họ lùi lại chừng mười bước, qua chỗ vách chống.';
        break;
      case 'costlySuccess':
        line = 'Giằng co ở đúng chỗ vách vỡ, cả hai bên đều không nhìn thấy gì.';
        break;
      case 'fail':
        theirLoss = Math.round(theirLoss * 0.5);
        line = 'Bị đẩy ngược về phía cửa ngách. Có người kêu ở đằng sau và không ai quay lại được.';
        break;
      case 'critFail':
        line = 'Cột chống gãy.';
        break;
    }

    ours = Math.max(0, ours - ourLoss);
    theirs = Math.max(0, theirs - theirLoss);
    out.losses += killDefender(siege, ourLoss, 'combat');
    out.enemyLosses += killBesieger(siege, theirLoss, 'combat');
    out.rounds.push({ n: round, tier, ours: ourLoss, theirs: theirLoss, line });
    out.lines.push(`Hiệp ${String(round)}: ${line}`);

    if (tier === 'critFail' && rng.int(1, 100) <= config.collapseOnCritFail * 100) {
      out.collapsed = true;
      shaft.collapsed = true;
      const buried = Math.round(ours * 0.6);
      out.losses += killDefender(siege, buried, 'combat');
      out.enemyLosses += killBesieger(siege, Math.round(theirs * 0.6), 'combat');
      out.lines.push('Cả hai đường hầm sụp xuống cùng một lúc. Không ai ở dưới đó lên nữa, và không bên nào đào lại chỗ ấy.');
      break;
    }
  }

  if (!out.collapsed && theirs <= 0) {
    out.won = true;
    if (config.winStopsMine) shaft.collapsed = true;
    siege.defender.garrisonMorale = Math.min(100, siege.defender.garrisonMorale + config.moraleWinner);
    siege.attacker.morale = Math.max(0, siege.attacker.morale + config.moraleLoser);
    out.lines.push('Đội thợ của họ không còn ai. Người ta bịt đầu hầm lại bằng đá và đất sét — chỗ ấy coi như xong.');

    // Đổ nước vào hầm địch là cách rẻ nhất để chắc chắn nó xong hẳn.
    if (rng.int(1, 100) <= config.floodChance) {
      out.flooded = true;
      out.lines.push('Rồi họ dẫn nước từ giếng đổ vào. Đến chiều thì không còn nghe thấy gì từ dưới đó nữa.');
    }
  } else if (!out.collapsed && ours <= 0) {
    siege.defender.garrisonMorale = Math.max(0, siege.defender.garrisonMorale + config.moraleLoser);
    out.lines.push('Không ai trong đội phản đào quay lên. Tiếng cuốc dưới lòng đất tiếp tục, gần hơn tuần trước.');
  } else if (!out.collapsed) {
    out.lines.push('Đến hiệp cuối thì hai bên cùng lùi lại và bịt hầm mình lại. Chuyện dưới đó tạm dừng ở đấy.');
  }

  return out;
}
