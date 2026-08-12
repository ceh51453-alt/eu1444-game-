/**
 * BIÊN NIÊN MỘT CUỘC VÂY HÃM (Phần 11 mục 8).
 *
 * `CombatChronicle kind='siege'`, TRẢI CẢ HAI GIAI ĐOẠN — đó là câu đầu tiên của
 * mục 8 và cũng là chỗ dễ làm sai nhất. Hai giai đoạn có hai nhịp hoàn toàn khác
 * nhau: giai đoạn một đếm bằng TUẦN và không có ai đánh ai suốt hàng chục tuần;
 * giai đoạn hai đếm bằng ĐỢT và mỗi đợt là vài trăm người chết trong mười phút.
 * Nhét cả hai vào một mảng `rounds` là đúng ý mục 8 — nhưng chỉ đúng nếu mỗi vòng
 * tự khai nó là loại gì, nên tuần mang trường `siege` còn đợt tổng công mang
 * trường `battle`. Phép nén ở `systems/combat/chronicle.ts` đã biết cân cả hai.
 *
 * HAI BÊN LÀ HAI "NGƯỜI THAM GIA" CÓ ID `vay` VÀ `thu`. Nghe kỳ, nhưng nó làm
 * `digestOf` và `participantName` của định dạng chung chạy đúng mà không phải mở
 * một nhánh riêng cho vây hãm — và quan trọng hơn: `outcome.winnerId` là một id
 * tra được, chứ không phải một chuỗi tự do mà `auditNarrative` không đối chiếu nổi.
 */

import type { ChronicleRound, CombatChronicle } from '@/systems/combat/chronicle';
import { compressChronicle, type CompactChronicle } from '@/systems/combat/chronicle';
import { HELD_LAYER_LABELS, SIEGE_ENDINGS, garrisonMen, type SiegeState, type WeekReport } from './types';
import { termOf } from './data';

function weekRound(report: WeekReport): ChronicleRound {
  const round: ChronicleRound = {
    n: report.week,
    actions: [],
    injuries: [],
    // Định dạng chung đọc hai bản đồ này cho "đường cong": ở vây hãm, `tempoAfter`
    // là sĩ khí và `staminaAfter` là số người còn lại — cùng nghĩa với dã chiến.
    tempoAfter: { vay: report.attackerMorale, thu: report.garrisonMorale },
    staminaAfter: { vay: report.attackerTroops, thu: report.defenderMen },
    siege: {
      week: report.week,
      season: report.season,
      attackerAction: report.attackerAction,
      defenderAction: report.defenderAction,
      attackerTroops: report.attackerTroops,
      attackerMorale: report.attackerMorale,
      attackerSupplyWeeks: report.attackerSupplyWeeks,
      defenderMen: report.defenderMen,
      population: report.population,
      garrisonMorale: report.garrisonMorale,
      populationMorale: report.populationMorale,
      defenderFoodWeeks: report.defenderFoodWeeks,
      wallIntegrity: report.wallIntegrity,
      diseaseDeaths: report.diseaseDeaths,
      events: [...report.events],
      milestones: [...report.milestones],
    },
  };

  // `highlight` là thứ QUYẾT ĐỊNH tuần nào sống sót qua phép nén. Một tuần có mốc
  // là một tuần không được phép biến mất.
  if (report.milestones.length > 0) round.highlight = 'turningPoint';
  else if (report.events.length > 0) round.highlight = 'firstBlood';

  return round;
}

/** Tuần tường vỡ. 0 nghĩa là tường chưa bao giờ vỡ. */
function breachWeek(siege: SiegeState): number {
  for (const report of siege.weeks) {
    if (report.milestones.some((line) => line.includes('vỡ') || line.includes('sụt'))) return report.week;
  }
  return 0;
}

export function buildSiegeChronicle(siege: SiegeState): CombatChronicle {
  const rounds: ChronicleRound[] = siege.weeks.map(weekRound);
  // Giai đoạn hai nối vào SAU, đánh số tiếp từ tuần cuối — mục 8 nói biên niên
  // trải cả hai giai đoạn, và một cuộc tổng công đọc mà không biết nó xảy ra sau
  // bao nhiêu tuần đói thì mất hết ý nghĩa.
  for (const round of siege.assault?.rounds ?? []) {
    rounds.push({ ...round, n: siege.week + round.n });
  }

  const winner = siege.winner;
  const summary =
    winner === ''
      ? `Sau ${String(siege.week)} tuần, không bên nào giữ được ý mình.`
      : winner === 'vay'
        ? `${siege.fort.name} đổi chủ sau ${String(siege.week)} tuần — ${SIEGE_ENDINGS[siege.ending] ?? siege.ending}.`
        : `${siege.fort.name} giữ được sau ${String(siege.week)} tuần — ${SIEGE_ENDINGS[siege.ending] ?? siege.ending}.`;

  return {
    kind: 'siege',
    setting: { ...siege.setting },
    participants: [
      {
        id: 'vay',
        name: siege.attacker.name,
        side: 'bên vây',
        description: `${String(siege.attacker.startTroops)} người lúc kéo tới, do ${siege.attacker.commanderName} cầm quân`,
        gear: siege.attacker.engines.map((engine) => engine.name).join(', '),
        relation: siege.playerSide === 'vay' ? 'chính ngài' : '',
      },
      {
        id: 'thu',
        name: siege.defender.name,
        side: 'bên thủ',
        description: `${siege.fort.name}, do ${siege.defender.commanderName} coi giữ`,
        gear: '',
        relation: siege.playerSide === 'thu' ? 'chính ngài' : '',
      },
    ],
    forces: [
      {
        side: 'vay',
        name: siege.attacker.name,
        strength: siege.attacker.startTroops,
        units: siege.attacker.engines.length,
        commander: siege.attacker.commanderName,
      },
      {
        side: 'thu',
        name: siege.defender.name,
        strength: garrisonMen(siege.fort) + siege.defender.losses.hunger + siege.defender.losses.combat,
        units: siege.fort.garrison.length,
        commander: siege.defender.commanderName,
      },
    ],
    siege: {
      weeks: siege.week,
      fortification: `${siege.fort.name} (bậc ${String(siege.fort.tier)})`,
      parleys: siege.parleys.map(
        (entry) =>
          `tuần ${String(entry.week)}, ${entry.by === 'vay' ? 'bên vây' : 'bên thủ'} đề nghị — ${
            entry.accepted ? 'thỏa thuận' : 'không thành'
          }: ${entry.line}`,
      ),
      breachWeek: breachWeek(siege),
      layersLost: siege.fort.lostLayers.map((id) => HELD_LAYER_LABELS[id]),
      terms: siege.terms.map((id) => termOf(id)?.name ?? id),
      sacked: siege.sacked,
      attackerLosses: { ...siege.attacker.losses },
      defenderLosses: { ...siege.defender.losses },
    },
    stakes: siege.stakes,
    rounds,
    outcome: {
      winnerId: winner === '' ? '' : winner,
      ending: siege.ending,
      endingName: SIEGE_ENDINGS[siege.ending] ?? siege.ending,
      summary,
    },
    duration: {
      rounds: siege.week,
      // Một tuần là 10.080 phút. Con số này chỉ để định dạng chung không có ô rỗng;
      // bản render của vây hãm in TUẦN chứ không in phút.
      minutes: siege.week * 10080,
    },
    aftermath: aftermathLines(siege),
  };
}

function aftermathLines(siege: SiegeState): string[] {
  const lines: string[] = [];
  const losses = siege.attacker.losses;
  const dead = losses.disease + losses.hunger + losses.combat + losses.winter;

  lines.push(
    `Đạo quân vây kéo tới ${String(siege.attacker.startTroops)} người và còn ${String(siege.attacker.troops)}.`,
  );
  if (dead > 0) {
    const share = (losses.disease / Math.max(1, dead)) * 100;
    lines.push(
      `Trong số ${String(dead)} người nằm lại, ${String(losses.disease)} chết vì bệnh — ${Math.round(share)} phần trăm, nhiều hơn cả tên đạn.`,
    );
  }
  if (losses.departed > 0) {
    lines.push(`${String(losses.departed)} người về nhà đúng luật khi hết hạn, không phải đào ngũ.`);
  }
  if (siege.defender.losses.hunger > 0) {
    lines.push(`Trong tường, ${String(siege.defender.losses.hunger)} người chết đói.`);
  }
  if (siege.sacked === true) lines.push('Thành bị cướp phá — tiếng ấy sẽ đi trước đạo quân này tới mọi cổng thành sau.');
  if (siege.sacked === false) lines.push('Thành được tha — và cổng sau sẽ mở dễ hơn nhiều.');
  return lines;
}

/**
 * Biên niên đã nén, sẵn sàng đưa vào prompt.
 *
 * Trần mặc định cao hơn dã chiến (14 thay vì 10) vì một tuần vây hãm cõng ít
 * chữ hơn một vòng đánh nhau rất nhiều — nó là sáu dòng số, không phải hai mươi
 * dòng hành động.
 */
export function siegeChronicleFor(siege: SiegeState, maxRounds = 14): CompactChronicle {
  return compressChronicle(buildSiegeChronicle(siege), { maxRounds, keepFirst: 1, keepLast: 3 });
}
