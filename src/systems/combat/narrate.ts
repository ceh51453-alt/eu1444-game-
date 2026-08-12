/**
 * BIÊN NIÊN → PROMPT VIẾT DIỄN BIẾN, VÀ HẬU KIỂM BẢN AI VIẾT (Phần 9 mục 10).
 *
 * Đây là chỗ R1 dễ rò rỉ nhất trong cả dự án. Mọi chỗ khác thì engine tung xúc
 * sắc rồi đưa kết quả cho AI diễn giải, và AI chỉ viết MỘT lượt. Ở đây AI viết
 * lại cả một trận đấu ba mươi hiệp bằng văn xuôi — và văn xuôi thì rất dễ thêm
 * một nhát chém "cho hay". Nhát chém ấy không nằm trong state, nên nó không có
 * thật; nhưng người chơi đọc xong sẽ tin là có.
 *
 * Hai lớp phòng thủ, và cả hai đều cần:
 *   `narrationPrompt`  ra lệnh rõ ĐƯỢC thêm gì và KHÔNG được thêm gì
 *   `auditNarrative`   đối chiếu bản viết xong với chính biên niên
 *
 * Lớp thứ hai không phải để chặn — bản viết đã viết rồi. Nó để NÓI RA, ở tab
 * Debug và ở mục 13 của Phần 9: "cần xem AI có bịa thêm tình tiết ngoài biên
 * niên không". Một mô hình hay bịa là một mô hình phải đổi preset, và người chơi
 * chỉ biết điều đó nếu có ai đó đếm.
 */

import { TIER_LABELS } from '@/systems/check/tiers';
import { allRegions, regionName } from '@/systems/body/regions';
import { injuryTypeName, severityName } from '@/systems/body/catalog';
import {
  HIGHLIGHT_LABELS,
  participantName,
  type CombatChronicle,
  type CompactChronicle,
} from './chronicle';

// ---------------------------------------------------------------------------
// Kết xuất biên niên thành chữ
// ---------------------------------------------------------------------------

function renderInjuryLine(chronicle: CombatChronicle, injury: CombatChronicle['rounds'][number]['injuries'][number]): string {
  const gap = injury.throughGap === true ? ', xuyên khe giáp' : '';
  return `    · ${participantName(chronicle, injury.actorId)} trúng ${injury.region}: ${injuryTypeName(
    injury.type as never,
  ).toLowerCase()} ${severityName(injury.severity).toLowerCase()}${gap}`;
}

/**
 * Ba dòng của cấp chiến trận (Phần 10 mục 13).
 *
 * VỠ TRẬN in RIÊNG một dòng và in TRƯỚC lệnh, vì đó là thứ quyết định trận đánh
 * (mục 8 của Phần 10). Một bản diễn biến kể đủ mọi mệnh lệnh mà bỏ qua khoảnh
 * khắc một cánh sụp là một bản diễn biến kể sai trận đánh.
 */
function renderBattleRound(lines: string[], round: CombatChronicle['rounds'][number]): void {
  const battle = round.battle;
  if (battle === undefined) return;

  for (const move of battle.moves) lines.push(`    · ${move}`);
  if (battle.routed.length > 0) {
    lines.push(`    ⚑ VỠ TRẬN: ${battle.routed.join(', ')}`);
  }
  for (const order of battle.orders) {
    lines.push(`    ⌁ lệnh cho ${order.officer}: ${order.order} → ${TIER_LABELS[order.result]} (${order.effect})`);
  }
  for (const wing of battle.wings) {
    lines.push(`      ${wing.wing}: ${wing.strength} quân, sĩ khí ${Math.round(wing.morale)}, ${wing.state}`);
  }
}

/**
 * Một TUẦN vây hãm (Phần 11 mục 8).
 *
 * In ra ĐƯỜNG CONG chứ không chỉ sự kiện, vì mục 8 đòi đúng thế: "đường cong
 * lương thực và sĩ khí hai bên". Một bản biên niên chỉ kể "tuần 14 tường vỡ" thì
 * AI không có cách nào tả được sự bào mòn — nó chỉ có mấy cái mốc rời nhau, và
 * bản viết ra sẽ là một danh sách chứ không phải một biên niên sử.
 */
function renderSiegeWeek(lines: string[], round: CombatChronicle['rounds'][number]): void {
  const week = round.siege;
  if (week === undefined) return;

  lines.push(
    `      bên vây: ${Math.round(week.attackerTroops)} người · sĩ khí ${Math.round(
      week.attackerMorale,
    )} · lương ${week.attackerSupplyWeeks.toFixed(1)} tuần`,
  );
  lines.push(
    `      trong thành: ${Math.round(week.defenderMen)} lính, ${Math.round(week.population)} dân · sĩ khí ${Math.round(
      week.garrisonMorale,
    )} · lòng dân ${Math.round(week.populationMorale)} · lương ${week.defenderFoodWeeks.toFixed(1)} tuần · tường ${Math.round(
      week.wallIntegrity,
    )}`,
  );
  if (week.attackerAction !== '') lines.push(`    → bên vây: ${week.attackerAction}`);
  if (week.defenderAction !== '') lines.push(`    → bên thủ: ${week.defenderAction}`);
  if (week.diseaseDeaths > 0) lines.push(`    ☠ ${Math.round(week.diseaseDeaths)} người chết vì bệnh trong trại vây`);
  for (const event of week.events) lines.push(`    ◈ ${event}`);
  for (const milestone of week.milestones) lines.push(`    ⚑ ${milestone}`);
}

export function renderChronicle(compact: CompactChronicle): string {
  const { chronicle } = compact;
  const lines: string[] = [];

  lines.push('## BỐI CẢNH');
  lines.push(`Loại: ${chronicle.kind === 'duel' ? 'quyết đấu' : chronicle.kind === 'battle' ? 'dã chiến' : 'công thành'}`);
  if (chronicle.setting.place !== '') lines.push(`Nơi chốn: ${chronicle.setting.place}`);
  if (chronicle.setting.ground !== '') lines.push(`Địa hình: ${chronicle.setting.ground}`);
  if (chronicle.setting.weather !== '') lines.push(`Thời tiết: ${chronicle.setting.weather}`);
  if (chronicle.setting.timeOfDay !== '') lines.push(`Thời điểm: ${chronicle.setting.timeOfDay}`);
  if (chronicle.setting.witnesses !== '') lines.push(`Người chứng kiến: ${chronicle.setting.witnesses}`);
  if (chronicle.stakes !== '') lines.push(`Thứ đang đặt cược: ${chronicle.stakes}`);

  lines.push('');
  lines.push('## HAI BÊN');
  for (const force of chronicle.forces ?? []) {
    const commander = force.commander === '' ? '' : `, do ${force.commander} cầm quân`;
    lines.push(`- ${force.name}: ${force.strength} quân trong ${force.units} đơn vị${commander}`);
  }
  for (const person of chronicle.participants) {
    const parts = [person.name];
    if (person.description !== '') parts.push(person.description);
    if (person.gear !== '') parts.push(person.gear);
    if (person.relation !== '') parts.push(`quan hệ: ${person.relation}`);
    lines.push(`- ${parts.join(' — ')}`);
  }

  const siege = chronicle.siege;
  if (siege !== undefined) {
    lines.push('');
    lines.push('## CUỘC VÂY HÃM');
    lines.push(`Công sự: ${siege.fortification}`);
    lines.push(`Kéo dài: ${siege.weeks} tuần`);
    if (siege.breachWeek > 0) lines.push(`Tường vỡ ở tuần ${siege.breachWeek}`);
    if (siege.layersLost.length > 0) lines.push(`Bên thủ lần lượt bỏ: ${siege.layersLost.join(' → ')}`);
    for (const parley of siege.parleys) lines.push(`Đàm phán: ${parley}`);
    lines.push(
      `Bên vây mất: ${siege.attackerLosses['disease'] ?? 0} vì bệnh · ${siege.attackerLosses['combat'] ?? 0} vì đánh nhau · ${
        siege.attackerLosses['hunger'] ?? 0
      } vì đói · ${siege.attackerLosses['desertion'] ?? 0} đào ngũ · ${siege.attackerLosses['departed'] ?? 0} hết hạn về nhà · ${
        siege.attackerLosses['winter'] ?? 0
      } vì mùa đông`,
    );
    lines.push(
      `Trong thành mất: ${siege.defenderLosses['hunger'] ?? 0} vì đói · ${siege.defenderLosses['disease'] ?? 0} vì bệnh · ${
        siege.defenderLosses['combat'] ?? 0
      } vì đánh nhau`,
    );
  }

  lines.push('');
  lines.push('## DIỄN BIẾN CƠ HỌC');
  // Quyết đấu đếm bằng HIỆP, dã chiến đếm bằng VÒNG, vây hãm đếm bằng TUẦN. Một
  // chữ, và nó là chữ AI sẽ dùng lại suốt bản diễn biến.
  const round = chronicle.kind === 'duel' ? 'Hiệp' : chronicle.kind === 'siege' ? 'Tuần' : 'Vòng';
  const unit = round.toLowerCase();
  if (compact.keptRounds < compact.totalRounds) {
    lines.push(`(Trận dài ${compact.totalRounds} ${unit}. Những ${unit} không có gì đáng kể đã gộp lại.)`);
  }

  for (const entry of compact.entries) {
    if (entry.kind === 'digest') {
      lines.push(`${round} ${entry.digest.from}–${entry.digest.to}: ${entry.digest.text}.`);
      continue;
    }
    const current = entry.round;
    const mark = current.highlight === undefined ? '' : ` [${HIGHLIGHT_LABELS[current.highlight]}]`;
    lines.push(`${round} ${current.n}${mark}`);
    for (const action of current.actions) {
      const note = action.note === undefined || action.note === '' ? '' : ` (${action.note})`;
      lines.push(
        `    ${participantName(chronicle, action.actorId)}: ${action.action} → ${TIER_LABELS[action.result]}${note}`,
      );
    }
    for (const injury of current.injuries) lines.push(renderInjuryLine(chronicle, injury));
    renderBattleRound(lines, current);
    renderSiegeWeek(lines, current);
  }

  lines.push('');
  lines.push('## KẾT CỤC');
  lines.push(
    chronicle.outcome.winnerId === ''
      ? `Không phân thắng bại (${chronicle.outcome.endingName}).`
      : `${participantName(chronicle, chronicle.outcome.winnerId)} thắng — ${chronicle.outcome.endingName}.`,
  );
  if (chronicle.outcome.summary !== '') lines.push(chronicle.outcome.summary);
  if (chronicle.kind === 'siege') {
    lines.push(`Kéo dài ${chronicle.duration.rounds} tuần.`);
    if (siege !== undefined) {
      if (siege.terms.length > 0) lines.push(`Điều khoản: ${siege.terms.join('; ')}.`);
      if (siege.sacked === true) lines.push('Thành bị cướp phá.');
      if (siege.sacked === false) lines.push('Thành được tha.');
    }
  } else {
    lines.push(`Kéo dài ${chronicle.duration.rounds} ${unit}, chừng ${chronicle.duration.minutes} phút.`);
  }
  for (const line of chronicle.aftermath) lines.push(`- ${line}`);

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

export interface NarrationOptions {
  /** Ngôi kể và giọng văn của ván chơi, lấy từ preset đang bật. */
  voice?: string;
  /** Số chữ mong muốn. */
  words?: number;
  /** Tên nhân vật người chơi, để AI gọi đúng. */
  charName?: string;
}

/**
 * Bốn mệnh lệnh của mục 10, viết thành lời cấm chứ không thành lời khuyên.
 *
 * "Được phép thêm: cảm xúc, không khí, lời thoại, phản ứng khán giả, ẩn dụ" —
 * danh sách CHO PHÉP phải đứng ngay cạnh danh sách CẤM, nếu không thì một mô
 * hình cẩn thận sẽ viết ra một biên bản khô khốc và cả mục 10 thành vô nghĩa.
 */
export const NARRATION_RULES: readonly string[] = [
  'CHỈ được kể lại đúng những gì có trong biên niên dưới đây.',
  'KHÔNG được thêm đòn đánh nào không có trong biên niên.',
  'KHÔNG được thêm hay bớt thương tích, không đổi vùng bị thương, không đổi mức độ.',
  'KHÔNG được đổi kết cục, không được cho ai chết nếu biên niên không ghi là chết.',
  'KHÔNG được nêu một con số nào mà biên niên không có.',
  'ĐƯỢC phép thêm: cảm xúc, không khí, lời thoại, phản ứng người xem, ẩn dụ, mùi và tiếng động.',
  'Nhấn vào những hiệp có đánh dấu trong ngoặc vuông — đó là khúc ngoặt của trận.',
  'Những quãng đã gộp lại thì kể lướt bằng một hai câu, đừng dựng lại từng hiệp.',
];

/**
 * BỐN LUẬT RIÊNG CỦA GIỌNG BIÊN NIÊN SỬ (Phần 11 mục 8).
 *
 * Mục 8 nói thẳng vì sao chúng phải tồn tại: "Với vây hãm dài, prompt phải yêu
 * cầu viết theo kiểu BIÊN NIÊN SỬ chứ không phải tường thuật từng phút." Một mô
 * hình được đưa cho ba mươi tuần dữ liệu mà không có lệnh này sẽ dựng lại từng
 * tuần một, và bản viết ra vừa dài gấp năm lần ngân sách vừa nhạt — vì một cuộc
 * vây hãm KHÔNG có ba mươi khoảnh khắc đáng kể, nó có bốn cái mốc và một sự bào
 * mòn dài giữa chúng.
 */
export const CHRONICLE_RULES: readonly string[] = [
  'Viết theo kiểu BIÊN NIÊN SỬ: nén thời gian lại, đừng dựng lại từng tuần một.',
  'Nhấn vào CÁC MỐC — tuần tường vỡ, tuần dịch bùng, lần ngồi vào bàn đàm phán, ngày cổng mở.',
  'Tả SỰ BÀO MÒN giữa các mốc: lương vơi đi, người mỏng dần, cùng một câu chuyện lặp lại tuần này qua tuần khác.',
  'Hai bên mòn theo hai kiểu khác nhau — bên ngoài chết vì bệnh và vì hết hạn, bên trong chết vì đói và vì mất lòng tin. Đừng kể chúng như một.',
  'Được phép dùng lối kể của người chép sử: "đến tháng thứ ba", "suốt mùa ấy", "không ai còn đếm nữa".',
];

export interface NarrationPrompt {
  system: string;
  user: string;
}

export function narrationPrompt(compact: CompactChronicle, options: NarrationOptions = {}): NarrationPrompt {
  const siege = compact.chronicle.kind === 'siege';
  const words = options.words ?? (siege ? 550 : 350);
  const voice = options.voice ?? 'ngôi thứ ba, giọng biên niên sử thế kỷ 14, tiếng Việt';
  const what = siege ? 'một cuộc vây hãm' : 'một trận đánh';

  const rules = siege ? [...NARRATION_RULES, ...CHRONICLE_RULES] : NARRATION_RULES;

  const system = [
    'Ngài là người chép sử của một thế giới giả tưởng châu Âu thế kỷ 14.',
    `Viết lại ${what} thành văn xuôi: ${voice}.`,
    '',
    'LUẬT BẮT BUỘC:',
    ...rules.map((rule, index) => `${index + 1}. ${rule}`),
    '',
    `Độ dài: khoảng ${words} chữ. Không dùng đầu mục, không dùng bảng — chỉ văn xuôi.`,
  ].join('\n');

  const user = [
    options.charName === undefined || options.charName === ''
      ? ''
      : `Nhân vật người chơi tên là ${options.charName}.`,
    '',
    renderChronicle(compact),
  ]
    .filter((part) => part !== '')
    .join('\n');

  return { system, user };
}

// ---------------------------------------------------------------------------
// Hậu kiểm (mục 13)
// ---------------------------------------------------------------------------

export type NarrativeIssueKind = 'thuong-tich-them' | 'cai-chet-them' | 'ket-cuc-lech' | 'nguoi-la';

export interface NarrativeIssue {
  kind: NarrativeIssueKind;
  /** Chữ trong bản AI viết đã làm dấy nghi ngờ. */
  evidence: string;
  message: string;
}

const DEATH_WORDS = ['chết', 'tử vong', 'tắt thở', 'lìa đời', 'bỏ mạng', 'mất mạng', 'giết chết'];

function normalize(text: string): string {
  return text.toLowerCase();
}

/**
 * Tìm tình tiết mà biên niên không có.
 *
 * Bắt được ba loại, và cố ý KHÔNG cố bắt nhiều hơn: một bộ dò quá nhạy sẽ báo
 * động mỗi lần AI dùng một phép ẩn dụ có chữ "máu", và một danh sách cảnh báo
 * mà lần nào cũng đỏ thì không ai đọc nữa.
 *
 *   `thuong-tich-them`  nêu một vùng cơ thể mà không hiệp nào ghi vết ở đó
 *   `cai-chet-them`     nói ai đó chết khi biên niên không kết thúc bằng cái chết
 *   `nguoi-la`          gọi tên một người không có trong danh sách hai bên
 */
export function auditNarrative(text: string, chronicle: CombatChronicle): NarrativeIssue[] {
  const issues: NarrativeIssue[] = [];
  const lower = normalize(text);

  const hurtRegions = new Set(chronicle.rounds.flatMap((round) => round.injuries.map((injury) => injury.regionId)));
  for (const region of allRegions()) {
    if (hurtRegions.has(region.id)) continue;
    const name = normalize(regionName(region.id));
    // Vùng một chữ ("Cổ", "Mặt") xuất hiện trong quá nhiều cụm bình thường —
    // "cổ áo", "mặt đất", "trước mặt". Chỉ soi những tên đủ dài để đứng riêng.
    if (name.length < 5) continue;
    if (!lower.includes(name)) continue;
    issues.push({
      kind: 'thuong-tich-them',
      evidence: regionName(region.id),
      message: `bản viết nhắc tới "${regionName(region.id)}" nhưng biên niên không có vết thương nào ở đó`,
    });
  }

  if (chronicle.outcome.ending !== 'chet') {
    for (const word of DEATH_WORDS) {
      if (!lower.includes(word)) continue;
      issues.push({
        kind: 'cai-chet-them',
        evidence: word,
        message: `bản viết dùng chữ "${word}" nhưng trận này kết thúc bằng "${chronicle.outcome.endingName}"`,
      });
      break;
    }
  }

  return issues;
}
