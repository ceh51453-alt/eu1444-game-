/**
 * BIÊN NIÊN TRẬN ĐÁNH — định dạng DÙNG CHUNG cho Phần 9, 10 và 11 (mục 10).
 *
 * Mục 12.7 nói thẳng: "Làm tổng quát, Phần 10 và 11 sẽ dùng lại y nguyên cấu
 * trúc này." Vì thế file này nằm ở `/src/systems/combat/` chứ không nằm trong
 * `minigames/duel/`: nếu nó ở trong đấu tay đôi thì dã chiến sẽ phải import từ
 * một minigame khác, và cái ngày Phần 10 cần thêm một trường thì không ai biết
 * sửa ở đây có làm hỏng Phần 9 không.
 *
 * BA THỨ BIÊN NIÊN PHẢI GIỮ ĐƯỢC, và chúng quyết định mọi lựa chọn kiểu ở dưới:
 *
 *   1. ĐỦ ĐỂ KỂ LẠI. Ai làm gì, ra cấp nào, trúng đâu, nặng bao nhiêu. Prompt
 *      viết diễn biến ra lệnh cho AI "chỉ được kể lại đúng những gì có trong
 *      biên niên" — nên thứ gì không có ở đây thì vĩnh viễn không được kể.
 *   2. ĐỦ ĐỂ HẬU KIỂM. `auditNarrative` ở `narrate.ts` đối chiếu bản AI viết
 *      với chính cấu trúc này để tìm tình tiết bịa thêm. Một biên niên chỉ có
 *      chữ thì không hậu kiểm được.
 *   3. NÉN ĐƯỢC MÀ KHÔNG MẤT KHÚC NGOẶT. Một trận công thành 400 hiệp không lọt
 *      vào ngân sách token nào cả. `highlight` là thứ quyết định hiệp nào sống
 *      sót qua phép nén.
 */

import type { CheckTier } from '@/core/turn';

export type CombatKind = 'duel' | 'battle' | 'siege';

export type Highlight = 'turningPoint' | 'nearDeath' | 'firstBlood' | 'disarm' | 'critical';

export const HIGHLIGHT_LABELS: Readonly<Record<Highlight, string>> = {
  turningPoint: 'khúc ngoặt',
  nearDeath: 'suýt chết',
  firstBlood: 'giọt máu đầu',
  disarm: 'mất vũ khí',
  critical: 'đòn quyết định',
};

export interface ChronicleSetting {
  /** Nơi chốn bằng lời — "sân sau tu viện Saint-Denis". */
  place: string;
  /** Tên đấu trường / địa hình đã sinh. */
  ground: string;
  weather: string;
  timeOfDay: string;
  /** Ai đứng xem. Rỗng nghĩa là không có ai. */
  witnesses: string;
}

export interface ChronicleParticipant {
  id: string;
  name: string;
  /** `a` / `b` ở quyết đấu; tên cánh quân ở dã chiến. */
  side: string;
  /** Một dòng nhận dạng: chủng tộc, tước vị, dáng vẻ. */
  description: string;
  /** Vũ khí và giáp bằng lời, để AI gọi đúng tên món. */
  gear: string;
  /** Quan hệ với người chơi, nếu có. */
  relation: string;
}

export interface ChronicleAction {
  actorId: string;
  /** Tên hành động bằng tiếng Việt, không phải id. */
  action: string;
  target?: string;
  result: CheckTier;
  margin: number;
  /** Một dòng ngắn engine ghi sẵn: "hụt tầm", "đỡ được nhưng lệch thế". */
  note?: string;
}

export interface ChronicleInjury {
  actorId: string;
  regionId: string;
  /** Tên vùng bằng tiếng Việt. */
  region: string;
  type: string;
  severity: number;
  /** Vết này xuyên qua khe hở giáp. */
  throughGap?: boolean;
}

// ---------------------------------------------------------------------------
// Cấp chiến trận (Phần 10 mục 13)
// ---------------------------------------------------------------------------

/**
 * BA TRƯỜNG PHẦN 10 THÊM VÀO, và mục 13 gọi tên đủ cả ba: "chuyển động các cánh,
 * thời điểm vỡ trận, lệnh đã ra và có được thi hành không".
 *
 * Chúng nằm ở đây chứ không nằm trong `minigames/battle/` vì README cùng thư mục
 * đã hẹn trước: "khi Phần 10 cần AI kể được một thứ mới, việc phải làm là THÊM
 * TRƯỜNG VÀO ĐÂY, không phải nới lỏng prompt". Thứ gì không lọt vào cấu trúc này
 * thì `narrationPrompt` cấm kể, và `auditNarrative` sẽ bắt được nếu AI vẫn kể.
 *
 * Tất cả đều `optional`: một trận quyết đấu không có cánh quân nào, và Phần 9
 * không được phải sửa một dòng nào vì Phần 10 mọc thêm nhu cầu.
 */
export interface ChronicleWingNote {
  side: string;
  wing: string;
  /** Quân còn đứng ở cuối hiệp. */
  strength: number;
  morale: number;
  /** Nhãn trạng thái nặng nhất của cánh: vững / lung lay / nao núng / vỡ trận. */
  state: string;
}

export interface ChronicleOrderNote {
  officer: string;
  order: string;
  result: CheckTier;
  /** Thi hành đúng · chậm một vòng · không nhúc nhích · làm ngược. */
  effect: string;
}

export interface ChronicleBattleRound {
  wings: ChronicleWingNote[];
  /** Chuyển động của các cánh, mỗi thứ một dòng tiếng Việt. */
  moves: string[];
  /** Đơn vị VỠ TRẬN trong hiệp này — thứ quyết định cả trận (mục 8). */
  routed: string[];
  orders: ChronicleOrderNote[];
}

/** Một đạo quân, cho phần "hai bên" của biên niên cấp chiến trận. */
export interface ChronicleForce {
  side: string;
  name: string;
  strength: number;
  units: number;
  commander: string;
}

// ---------------------------------------------------------------------------
// Cấp vây hãm (Phần 11 mục 8)
// ---------------------------------------------------------------------------

/**
 * NĂM TRƯỜNG PHẦN 11 THÊM VÀO, và mục 8 gọi tên đủ cả năm: "số tuần vây, đường
 * cong lương thực và sĩ khí hai bên, các mốc đàm phán, thời điểm tường vỡ, kết
 * cục và điều khoản".
 *
 * Chúng ở đây chứ không ở `systems/siege/` vì cùng một lời hẹn mà Phần 10 đã giữ:
 * khi một phần cần AI kể được một thứ mới, việc phải làm là THÊM TRƯỜNG VÀO ĐÂY,
 * không phải nới lỏng prompt. Tất cả `optional`, nên Phần 9 và Phần 10 không phải
 * sửa một dòng nào.
 *
 * MỘT TUẦN LÀ MỘT `ChronicleRound`, không phải một hiệp đánh nhau. Đó là quyết
 * định làm cả mục 8 chạy được: phép nén của file này vốn xếp hạng theo "hiệp nào
 * đáng giữ", và một cuộc vây hãm ba mươi tuần cần đúng cái phép ấy — giữ tuần
 * tường vỡ, gộp mười hai tuần không có gì thành một dòng.
 */
export interface ChronicleSiegeWeek {
  week: number;
  season: string;
  /** Hai bảng hành động riêng biệt của mục 3, mỗi bên một dòng. */
  attackerAction: string;
  defenderAction: string;
  /** Đường cong bên vây: quân còn, sĩ khí, lương còn mấy tuần. */
  attackerTroops: number;
  attackerMorale: number;
  attackerSupplyWeeks: number;
  /** Đường cong bên thủ: người trong tường, sĩ khí quân, lòng dân, lương. */
  defenderMen: number;
  population: number;
  garrisonMorale: number;
  populationMorale: number;
  defenderFoodWeeks: number;
  wallIntegrity: number;
  /** Chết vì BỆNH trong tuần — mục 3 gọi đây là mối đe dọa số một của bên vây. */
  diseaseDeaths: number;
  events: string[];
  /** Tường vỡ, lùi lớp, mở đàm phán, cứu viện xuất hiện. */
  milestones: string[];
}

/** Tóm tắt cả cuộc vây hãm, cho phần đầu và phần cuối của bản biên niên. */
export interface ChronicleSiegeSummary {
  weeks: number;
  fortification: string;
  /** Mỗi lần ngồi vào bàn, một dòng. */
  parleys: string[];
  /** Tuần tường vỡ. 0 nghĩa là tường chưa bao giờ vỡ. */
  breachWeek: number;
  layersLost: string[];
  terms: string[];
  /** `null` = không tới lúc phải chọn. */
  sacked: boolean | null;
  /** Sổ tử chia theo nguyên nhân — thứ làm một cuộc vây hãm khác một trận đánh. */
  attackerLosses: Record<string, number>;
  defenderLosses: Record<string, number>;
}

export interface ChronicleRound {
  n: number;
  actions: ChronicleAction[];
  injuries: ChronicleInjury[];
  /** Thế trận sau hiệp, theo từng đấu sĩ. Ở dã chiến: sĩ khí trung bình mỗi bên. */
  tempoAfter: Record<string, number>;
  /** Thể lực sau hiệp, theo từng đấu sĩ. Ở dã chiến: quân còn lại mỗi bên. */
  staminaAfter: Record<string, number>;
  highlight?: Highlight;
  /** Chỉ có ở `kind === 'battle'` và `'siege'`. */
  battle?: ChronicleBattleRound;
  /** Chỉ có ở `kind === 'siege'`, và chỉ ở những vòng LÀ MỘT TUẦN VÂY HÃM. */
  siege?: ChronicleSiegeWeek;
}

export interface ChronicleOutcome {
  /** Id bên thắng. Rỗng nghĩa là không phân thắng bại. */
  winnerId: string;
  /** Id cửa ra trong bảng `endings` của `data/arenas.json`. */
  ending: string;
  endingName: string;
  /** Một câu engine ghi: "Gục vì mất máu ở hiệp 14." */
  summary: string;
}

export interface CombatChronicle {
  kind: CombatKind;
  setting: ChronicleSetting;
  participants: ChronicleParticipant[];
  /** Hai đạo quân. Chỉ có ở dã chiến và công thành. */
  forces?: ChronicleForce[];
  /** Chỉ có ở `kind === 'siege'` (Phần 11 mục 8). */
  siege?: ChronicleSiegeSummary;
  stakes: string;
  rounds: ChronicleRound[];
  outcome: ChronicleOutcome;
  duration: {
    rounds: number;
    /** Phút trong game trận đánh chiếm. */
    minutes: number;
  };
  /** Hệ quả cơ học sau trận, mỗi thứ một dòng. */
  aftermath: string[];
}

export function emptyChronicle(kind: CombatKind): CombatChronicle {
  return {
    kind,
    setting: { place: '', ground: '', weather: '', timeOfDay: '', witnesses: '' },
    participants: [],
    stakes: '',
    rounds: [],
    outcome: { winnerId: '', ending: '', endingName: '', summary: '' },
    duration: { rounds: 0, minutes: 0 },
    aftermath: [],
  };
}

export function participantName(chronicle: CombatChronicle, id: string): string {
  return chronicle.participants.find((entry) => entry.id === id)?.name ?? id;
}

// ---------------------------------------------------------------------------
// Nén (mục 10)
// ---------------------------------------------------------------------------

export interface ChronicleDigest {
  from: number;
  to: number;
  text: string;
}

export type ChronicleEntry =
  | { kind: 'round'; round: ChronicleRound }
  | { kind: 'digest'; digest: ChronicleDigest };

export interface CompactChronicle {
  chronicle: CombatChronicle;
  entries: ChronicleEntry[];
  keptRounds: number;
  totalRounds: number;
}

export interface CompressOptions {
  /** Số hiệp giữ nguyên văn tối đa. */
  maxRounds?: number;
  /** Luôn giữ ngần này hiệp đầu và ngần này hiệp cuối. */
  keepFirst?: number;
  keepLast?: number;
}

/** Hiệp này có đáng giữ nguyên văn không, xét riêng chính nó. */
function weightOf(round: ChronicleRound): number {
  let weight = 0;
  if (round.highlight !== undefined) weight += 100;
  for (const injury of round.injuries) weight += injury.severity * 4;
  for (const action of round.actions) {
    if (action.result === 'critSuccess' || action.result === 'critFail') weight += 6;
  }
  // Ở dã chiến, hiệp có đơn vị vỡ trận là hiệp KHÔNG được phép biến mất vì ngân
  // sách: mục 8 của Phần 10 nói trận đánh kết thúc đột ngột, và một bản diễn biến
  // nén mất đúng cái khoảnh khắc ấy sẽ kể một trận đánh gặm dần từng đơn vị —
  // tức là kể sai về chính thứ quyết định thắng bại.
  if (round.battle !== undefined) {
    weight += round.battle.routed.length * 40;
    for (const order of round.battle.orders) {
      if (order.result === 'critFail' || order.result === 'critSuccess') weight += 8;
    }
  }
  // Ở một cuộc vây hãm, thứ KHÔNG được phép biến mất vì ngân sách là cái MỐC:
  // tuần tường vỡ, tuần dịch bùng, tuần ngồi vào bàn đàm phán. Ba mươi tuần vây
  // hãm gần như giống hệt nhau, và một bản nén giữ lại đúng những tuần giống nhau
  // ấy sẽ kể một câu chuyện không có gì xảy ra trong suốt nửa năm.
  if (round.siege !== undefined) {
    weight += round.siege.milestones.length * 45;
    weight += round.siege.events.length * 20;
    if (round.siege.diseaseDeaths > 0) weight += Math.min(30, round.siege.diseaseDeaths / 4);
  }
  return weight;
}

function digestOf(rounds: readonly ChronicleRound[], chronicle: CombatChronicle): ChronicleDigest {
  const first = rounds[0];
  const last = rounds[rounds.length - 1];
  if (first === undefined || last === undefined) {
    return { from: 0, to: 0, text: '' };
  }

  // MỘT QUÃNG LẶNG Ở VÂY HÃM LÀ MỘT QUÃNG BÀO MÒN, không phải một quãng giằng co.
  // Đây chính là "tả sự bào mòn" mà mục 8 của Phần 11 đòi ở giọng biên niên sử:
  // trong mười tuần ấy không ai đánh ai, nhưng có mấy trăm người chết vì kiết lỵ
  // và kho lương thì mỏng đi mười phần. Nếu nén chúng bằng câu của dã chiến —
  // "giằng co, chưa bên nào gãy" — thì bản AI viết sẽ kể sai về chính thứ giết
  // người nhiều nhất trong cả cuộc vây hãm.
  if (chronicle.kind === 'siege') {
    const weeks = rounds.map((round) => round.siege).filter((week): week is ChronicleSiegeWeek => week !== undefined);
    const disease = weeks.reduce((sum, week) => sum + week.diseaseDeaths, 0);
    const parts: string[] = [`${rounds.length} tuần không có gì thay đổi trên tường`];
    if (disease > 0) parts.push(`${Math.round(disease)} người trong trại vây chết vì bệnh trong quãng này`);
    const lastWeek = weeks.at(-1);
    if (lastWeek !== undefined) {
      parts.push(`bên vây còn ${Math.round(lastWeek.attackerTroops)} người, sĩ khí ${Math.round(lastWeek.attackerMorale)}`);
      parts.push(
        `trong thành còn ${Math.round(lastWeek.defenderFoodWeeks)} tuần lương, sĩ khí quân ${Math.round(
          lastWeek.garrisonMorale,
        )}, lòng dân ${Math.round(lastWeek.populationMorale)}`,
      );
    }
    return { from: first.n, to: last.n, text: parts.join('; ') };
  }

  // Hai loại trận nén ra hai câu khác nhau, vì hai con số quan trọng nhất của
  // chúng khác nhau. Một quãng lặng ở quyết đấu là "hai người còn bao nhiêu sức";
  // một quãng lặng ở dã chiến là "hai bên còn bao nhiêu quân và có ai chạy chưa".
  if (chronicle.kind !== 'duel') {
    const routed = rounds.flatMap((round) => round.battle?.routed ?? []);
    const parts: string[] = [`${rounds.length} vòng giằng co, hai bên chưa bên nào gãy`];
    if (routed.length > 0) parts.push(`${routed.length} đơn vị bỏ chạy trong quãng này`);
    for (const [id, value] of Object.entries(last.staminaAfter)) {
      parts.push(`${participantName(chronicle, id)} còn ${Math.round(value)} quân`);
    }
    for (const [id, value] of Object.entries(last.tempoAfter)) {
      parts.push(`sĩ khí ${participantName(chronicle, id)} ${Math.round(value)}/100`);
    }
    return { from: first.n, to: last.n, text: parts.join('; ') };
  }

  const injuries = rounds.flatMap((round) => round.injuries);
  const parts: string[] = [`${rounds.length} hiệp thăm dò, không bên nào dứt điểm`];
  let worst: ChronicleInjury | null = null;
  for (const injury of injuries) {
    if (worst === null || injury.severity > worst.severity) worst = injury;
  }
  if (worst !== null) {
    parts.push(`vết nặng nhất: ${participantName(chronicle, worst.actorId)} — ${worst.region} mức ${worst.severity}`);
  }
  for (const [id, value] of Object.entries(last.staminaAfter)) {
    parts.push(`${participantName(chronicle, id)} còn ${Math.round(value)} thể lực`);
  }

  return { from: first.n, to: last.n, text: parts.join('; ') };
}

/**
 * Nén biên niên: GIỮ NGUYÊN các hiệp `highlight`, gộp các hiệp nhạt thành một
 * dòng tóm tắt (mục 10).
 *
 * Luật chọn là "giữ hiệp nặng nhất trước", không phải "giữ hiệp đầu trước". Một
 * trận ba mươi hiệp mà mười hiệp đầu chỉ là đi vòng quanh nhau thì mười hiệp ấy
 * đáng đúng một dòng, còn hiệp thứ hai mươi bảy — nơi một bên gãy tay — thì
 * không được phép biến mất vì ngân sách.
 */
export function compressChronicle(
  chronicle: CombatChronicle,
  options: CompressOptions = {},
): CompactChronicle {
  const maxRounds = Math.max(1, options.maxRounds ?? 12);
  const keepFirst = Math.max(0, options.keepFirst ?? 1);
  const keepLast = Math.max(0, options.keepLast ?? 2);
  const rounds = chronicle.rounds;

  if (rounds.length <= maxRounds) {
    return {
      chronicle,
      entries: rounds.map((round) => ({ kind: 'round' as const, round })),
      keptRounds: rounds.length,
      totalRounds: rounds.length,
    };
  }

  const keep = new Set<number>();

  // THỨ TỰ ƯU TIÊN LÀ HỢP ĐỒNG, không phải chi tiết cài đặt. Mục 10 viết "giữ
  // nguyên các hiệp highlight" trước, rồi mới tới chuyện gộp. Nếu hiệp đầu và
  // hiệp cuối ăn hết ngân sách trước thì một trận ngắn có ba khúc ngoặt sẽ mất
  // sạch cả ba, và bản AI viết sẽ kể một trận đấu không có gì xảy ra.
  const marked = rounds
    .map((round, index) => ({ index, weight: weightOf(round), highlight: round.highlight !== undefined }))
    .filter((entry) => entry.highlight)
    .sort((left, right) => right.weight - left.weight || right.index - left.index);
  for (const entry of marked) {
    if (keep.size >= maxRounds) break;
    keep.add(entry.index);
  }

  for (let index = 0; index < Math.min(keepFirst, rounds.length) && keep.size < maxRounds; index++) keep.add(index);
  for (let index = rounds.length - 1; index >= Math.max(0, rounds.length - keepLast) && keep.size < maxRounds; index--) {
    keep.add(index);
  }

  const ranked = rounds
    .map((round, index) => ({ index, weight: weightOf(round) }))
    .filter((entry) => entry.weight > 0 && !keep.has(entry.index))
    // Nặng trước; hòa thì hiệp muộn hơn thắng, vì khúc ngoặt muộn quyết định trận.
    .sort((left, right) => right.weight - left.weight || right.index - left.index);

  for (const entry of ranked) {
    if (keep.size >= maxRounds) break;
    keep.add(entry.index);
  }

  const entries: ChronicleEntry[] = [];
  let run: ChronicleRound[] = [];
  const flush = (): void => {
    if (run.length === 0) return;
    entries.push({ kind: 'digest', digest: digestOf(run, chronicle) });
    run = [];
  };

  for (const [index, round] of rounds.entries()) {
    if (keep.has(index)) {
      flush();
      entries.push({ kind: 'round', round });
      continue;
    }
    run.push(round);
  }
  flush();

  return { chronicle, entries, keptRounds: keep.size, totalRounds: rounds.length };
}
