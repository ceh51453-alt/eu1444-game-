/**
 * CHƯ HẦU — NPC THẬT, CÓ THỂ PHẢN (mục 7).
 *
 * > "Chư hầu mạnh + lòng trung thấp + có yêu sách = NỔI LOẠN. Nhiều chư hầu liên
 * > kết thành phe. Đây phải là mối đe dọa THƯỜNG TRỰC ở tước vị cao, không phải
 * > sự kiện hiếm."
 *
 * Ba chữ "thường trực" là yêu cầu thiết kế nặng nhất của mục này, và nó quyết
 * định hình dạng của cả file: lòng trung TRÔI XUỐNG mỗi năm theo áp lực đang có,
 * chứ không tụt một cục khi người chơi bấm nhầm một nút. Một hệ thống chỉ trừ
 * lòng trung theo sự kiện thì người chơi học được cách không bấm nút ấy, và mối
 * đe dọa biến mất.
 *
 * MỌI LÝ DO ĐỀU CÓ TÊN. `LoyaltyLine` mang theo nhãn tiếng Việt của từng khoản —
 * bảng chư hầu của mục 11 phải trả lời được "vì sao Otto đang lung lay", và câu
 * trả lời "vì thuế của ngài" phải đến từ chính con số đã trừ, không phải từ một
 * đoạn văn AI viết thêm.
 */

import type { Rng } from '@/core/rng';
import { makeId, type NpcId } from '@/core/ids';
import { runCheck } from '@/systems/check';
import type { GameState } from '@/state/slices';
import { rankOf, vassalCapFor, vassalConfig } from '@/systems/titles';
import {
  factionMemberRankByNumber,
  factionMemberRankOf,
  factionOrganizationTierOf,
  factionOrganizationTiers,
} from '@/systems/factions';
import type { Faction, Grievance, Vassal } from './types';

export class RealmVassalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RealmVassalError';
  }
}

export interface CreateVassalOptions {
  slug: string;
  name: string;
  titleId: string;
  fiefId?: string;
  provinceIds?: string[];
  loyalty?: number;
  ambition?: number;
  personality?: string;
  claims?: string[];
  holdingCount?: number;
  levyMen?: number;
  /** Nghĩa vụ chư hầu nợ NGƯỜI CHƠI — vế còn lại của hợp đồng hai chiều. */
  obligations?: { tax: number; levyDays: number; courtAttendance: number };
}

export function createVassal(options: CreateVassalOptions): Vassal {
  const config = vassalConfig();
  return {
    npcId: makeId('npc', options.slug) as NpcId,
    name: options.name,
    titleId: options.titleId,
    fiefId: options.fiefId ?? '',
    provinceIds: options.provinceIds ?? [],
    loyalty: options.loyalty ?? config.startLoyalty,
    power: 0,
    ambition: options.ambition ?? 40,
    personality: options.personality ?? '',
    claims: options.claims ?? [],
    obligations: options.obligations ?? { tax: 0.2, levyDays: 40, courtAttendance: 2 },
    grievances: [],
    rebelling: false,
    factionId: '',
    holdingCount: options.holdingCount ?? 1,
    levyMen: options.levyMen ?? 0,
  };
}

/**
 * SỨC MẠNH của một chư hầu: quân, tiền, đất so với lãnh chúa (mục 7).
 *
 * `holdingCount` và `levyMen` ĐI VÀO TỪ NGOÀI qua `createVassal` hoặc qua bản
 * cập nhật hằng năm — hàm này KHÔNG đọc `holdings`. Đó là ranh giới của mục 1, và
 * nó phải giữ được ngay ở chỗ cám dỗ nhất: chỗ cần biết một chư hầu mạnh cỡ nào.
 */
export function powerOf(vassal: Vassal): number {
  const config = vassalConfig().power;
  const raw =
    vassal.holdingCount * config.perHolding +
    vassal.provinceIds.length * config.perProvince +
    (vassal.levyMen / 100) * config.perLevyHundred +
    rankOf(vassal.titleId) * config.perTitleRank;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

/** Sức nặng cộng dồn của mọi mối hận đang ôm. */
export function grievanceWeight(vassal: Vassal): number {
  const config = vassalConfig();
  return vassal.grievances.reduce((sum, entry) => sum + entry.weight, 0) * config.grievanceWeight;
}

export function addGrievance(vassal: Vassal, reason: string, weight: number, year: number): Vassal {
  const config = vassalConfig();
  const grievance: Grievance = {
    id: `hn_${String(year)}_${String(vassal.grievances.length + 1)}`,
    year,
    reason,
    weight,
  };
  // Mối hận cũ nhất rơi ra khi vượt trần: một chư hầu nhớ lâu, nhưng không nhớ
  // vô hạn — và một mảng không có trần sẽ phình ra suốt một ván bốn mươi năm.
  const kept = [...vassal.grievances, grievance].slice(-config.maxGrievances);
  return { ...vassal, grievances: kept };
}

// ---------------------------------------------------------------------------
// Lòng trung
// ---------------------------------------------------------------------------

export interface LoyaltyLine {
  label: string;
  value: number;
}

export interface LoyaltyPressure {
  /** Thuế vượt mức thường lệ — tính sẵn ở `taxes.taxPressure`. */
  tax: number;
  /** Số ngày quân dịch gọi vượt hạn trong năm. */
  levyDaysOver: number;
  /** Chính danh của lãnh chúa. Thấp thì chư hầu không thấy lý do phải nghe. */
  liegeLegitimacy: number;
  /** Hệ quả cộng dồn của luật đang áp. */
  law: number;
  /** Lãnh chúa có ghé qua trong năm không. */
  visited: boolean;
  /** Phe khác đang chiêu dụ. */
  courted: boolean;
  /** Sức mạnh của chư hầu so với lãnh chúa: thấy lãnh chúa yếu thì bớt kính. */
  liegePower: number;
}

/**
 * MỘT NĂM LÒNG TRUNG, và mỗi khoản có tên.
 *
 * Bảy nguồn GIẢM của mục 7 đều có mặt: thuế nặng, gọi quân quá nhiều, xử án bất
 * công (đi vào qua mối hận), chính danh lãnh chúa thấp, bị lấy mất đất (mối hận),
 * thấy lãnh chúa yếu, phe khác chiêu dụ. Bốn nguồn TĂNG cũng vậy — chúng vào qua
 * `applyLoyaltyEvent`, vì chúng là SỰ KIỆN chứ không phải áp lực thường trực.
 */
export function loyaltyYear(vassal: Vassal, pressure: LoyaltyPressure): { vassal: Vassal; lines: LoyaltyLine[] } {
  const config = vassalConfig();
  const lines: LoyaltyLine[] = [];
  let delta = 0;

  const add = (label: string, value: number): void => {
    if (Math.abs(value) < 0.05) return;
    lines.push({ label, value: Math.round(value * 10) / 10 });
    delta += value;
  };

  // TRÔI VỀ mức nền — đây là cái làm cho lòng trung hồi lại nếu người chơi ngừng
  // vặn, và cũng là cái làm cho nó KHÔNG hồi nếu áp lực vẫn còn.
  const gap = config.settleLoyalty - vassal.loyalty;
  add('Thời gian trôi', Math.sign(gap) * Math.min(Math.abs(gap), config.driftPerYear));

  add('Thuế của lãnh chúa', pressure.tax * config.loyalty.taxPerPointOverBase);
  if (pressure.levyDaysOver > 0) {
    add('Gọi quân quá hạn', (pressure.levyDaysOver / 10) * config.loyalty.levyPerTenDaysOver);
  }

  const legitimacyGap = 50 - pressure.liegeLegitimacy;
  if (legitimacyGap > 0) {
    add('Chính danh lãnh chúa thấp', (legitimacyGap / 10) * config.loyalty.liegeLegitimacyPer10Below);
  }

  add('Luật đang áp', pressure.law);

  if (pressure.visited) add('Lãnh chúa có ghé qua', config.loyalty.liegePresencePerYear);
  if (pressure.courted) add('Phe khác chiêu dụ', config.loyalty.rivalCourting);

  const powerGap = powerOf(vassal) - pressure.liegePower;
  if (powerGap > 0) {
    add('Thấy lãnh chúa yếu hơn mình', (powerGap / 10) * config.loyalty.liegeWeakPerTenPower);
  }

  // Mối hận: không trừ thẳng vào lòng trung mỗi năm — chúng ĐÈ lên trần. Một chư
  // hầu ôm ba mối hận thì dù có được tặng quà cũng không quay lại mức cũ, và đó
  // là khác biệt giữa "đang giận" với "đã hết tin".
  const weight = grievanceWeight(vassal);
  const ceiling = Math.max(10, 100 - weight);

  const ambitionFactor = 1 + (vassal.ambition - 40) / 200;
  const next = Math.max(0, Math.min(ceiling, vassal.loyalty + delta * (delta < 0 ? ambitionFactor : 1 / ambitionFactor)));

  if (weight > 0) lines.push({ label: `${String(vassal.grievances.length)} mối hận (trần ${String(Math.round(ceiling))})`, value: 0 });

  // Mối hận phai dần. Rất chậm — mục 7 nói chư hầu "ghi nhớ MỌI lần bị đối xử tệ".
  const grievances = vassal.grievances
    .map((entry) => ({ ...entry, weight: entry.weight - config.grievanceDecayPerYear }))
    .filter((entry) => entry.weight > 0);

  return { vassal: { ...vassal, loyalty: Math.round(next * 10) / 10, grievances, power: powerOf(vassal) }, lines };
}

/** Bốn nguồn TĂNG và hai nguồn GIẢM theo sự kiện (mục 7). */
export type LoyaltyEvent =
  | 'ban-dat'
  | 'ban-tuoc'
  | 'thang-tran'
  | 'thua-tran'
  | 'xu-cong-bang'
  | 'xu-bat-cong'
  | 'hon-nhan'
  | 'qua-cap'
  | 'lay-mat-dat';

const EVENT_LABELS: Readonly<Record<LoyaltyEvent, string>> = {
  'ban-dat': 'Được ban đất',
  'ban-tuoc': 'Được ban tước',
  'thang-tran': 'Lãnh chúa thắng trận',
  'thua-tran': 'Lãnh chúa thua trận',
  'xu-cong-bang': 'Được xử công bằng',
  'xu-bat-cong': 'Bị xử bất công',
  'hon-nhan': 'Hôn nhân',
  'qua-cap': 'Quà cáp',
  'lay-mat-dat': 'Bị lấy mất đất',
};

export function applyLoyaltyEvent(vassal: Vassal, event: LoyaltyEvent, year: number): { vassal: Vassal; line: LoyaltyLine } {
  const config = vassalConfig().loyalty;
  const table: Record<LoyaltyEvent, number> = {
    'ban-dat': config.landGranted,
    'ban-tuoc': config.titleGranted,
    'thang-tran': config.battleWon,
    'thua-tran': config.battleLost,
    'xu-cong-bang': config.fairVerdict,
    'xu-bat-cong': config.unfairVerdict,
    'hon-nhan': config.marriage,
    'qua-cap': config.gift,
    'lay-mat-dat': config.landSeized,
  };

  const value = table[event];
  let next: Vassal = { ...vassal, loyalty: Math.max(0, Math.min(100, vassal.loyalty + value)) };

  // Hai sự kiện nặng để lại MỐI HẬN, không chỉ để lại một khoản trừ: mục 7 nói
  // chư hầu "ghi nhớ mọi lần bị đối xử tệ", và trí nhớ ấy phải sống lâu hơn con số.
  if (event === 'xu-bat-cong') next = addGrievance(next, 'Bị xử bất công', 6, year);
  if (event === 'lay-mat-dat') next = addGrievance(next, 'Bị lấy mất đất', 14, year);
  if (event === 'thua-tran') next = addGrievance(next, 'Theo lãnh chúa ra trận rồi thua', 3, year);

  return { vassal: next, line: { label: EVENT_LABELS[event], value } };
}

/** Giá tiền của một điểm lòng trung mua bằng quà. */
export function giftCost(points: number): number {
  return Math.round(Math.max(0, points) * vassalConfig().loyalty.giftCostPerPoint);
}

// ---------------------------------------------------------------------------
// Nổi loạn
// ---------------------------------------------------------------------------

export interface RebellionRisk {
  /** 0–100. Không bao giờ chạm 100 (Phần 5 mục 7: luôn còn hai cửa). */
  risk: number;
  /** Ba vế của mục 7, tách riêng để bảng cảnh báo của mục 11 giải thích được. */
  reasons: LoyaltyLine[];
  /** Đủ điều kiện nổ chưa: lòng trung dưới ngưỡng VÀ đủ sức. */
  ready: boolean;
}

/**
 * NGUY CƠ NỔI LOẠN = lòng trung thấp × đủ sức × có cớ.
 *
 * Ba vế NHÂN chứ không cộng, và đó là điều làm cho hệ này đúng: một chư hầu trung
 * thành nhưng cực mạnh thì không phản, một chư hầu căm ghét nhưng không có quân
 * cũng không phản. Chỉ khi cả ba cùng có thì đám cháy mới bén.
 */
export function rebellionRisk(
  vassal: Vassal,
  liegeLegitimacy: number,
  alliedRebels = 0,
  faction: Faction | null = null,
): RebellionRisk {
  const config = vassalConfig().rebellion;
  const reasons: LoyaltyLine[] = [];

  const disloyalty = Math.max(0, config.loyaltyBelow - vassal.loyalty) / Math.max(1, config.loyaltyBelow);
  const strength = Math.max(0, powerOf(vassal) / 100 - config.powerRatioNeeded) / Math.max(0.01, 1 - config.powerRatioNeeded);

  reasons.push({ label: `Lòng trung ${String(Math.round(vassal.loyalty))}`, value: Math.round(disloyalty * 100) });
  reasons.push({ label: `Sức mạnh ${String(powerOf(vassal))}`, value: Math.round(strength * 100) });

  let base = disloyalty * strength * 100;

  if (vassal.claims.length > 0) {
    base += config.claimBonus;
    reasons.push({ label: `${String(vassal.claims.length)} yêu sách`, value: config.claimBonus });
  }
  if (vassal.factionId !== '') {
    const tier = faction === null ? null : factionOrganizationTierOf(faction.tierId);
    const memberRank = faction === null ? null : factionMemberRankOf(faction.memberRanks[vassal.npcId] ?? 'thanh-vien-tuyen-the');
    const factionBonus = faction === null || tier === null
      ? config.factionBonus
      : Math.round(tier.rebellionBonus * (0.75 + faction.cohesion / 200) + (memberRank?.rank ?? 0) * 2);
    base += factionBonus;
    reasons.push({
      label: faction === null
        ? 'Đứng trong một phe chưa rõ tổ chức'
        : `${memberRank?.name ?? 'Thành viên'} · ${tier?.name ?? faction.tierId}`,
      value: factionBonus,
    });
  }
  if (alliedRebels > 0) {
    base += alliedRebels * config.perAlliedRebel;
    reasons.push({ label: `${String(alliedRebels)} chư hầu khác đã phản`, value: alliedRebels * config.perAlliedRebel });
  }

  const legitimacyGap = 50 - liegeLegitimacy;
  if (legitimacyGap > 0) {
    const bonus = (legitimacyGap / 10) * Math.abs(config.liegeLegitimacyPer10);
    base += bonus;
    reasons.push({ label: `Chính danh lãnh chúa ${String(Math.round(liegeLegitimacy))}`, value: Math.round(bonus) });
  }

  const risk = Math.max(0, Math.min(config.riskCap, Math.round(base)));
  return {
    risk,
    reasons,
    ready: vassal.loyalty < config.loyaltyBelow && powerOf(vassal) / 100 >= config.powerRatioNeeded,
  };
}

export interface RebellionCheck {
  vassal: Vassal;
  rebelled: boolean;
  risk: number;
  line: string;
}

/**
 * Chư hầu này có phản năm nay không.
 *
 * Tung một lần mỗi năm cho mỗi chư hầu ĐỦ ĐIỀU KIỆN. `rng.int(1,100) <= risk` chứ
 * không dùng `runCheck`: đây không phải một hành động của ai cả — không có người
 * kiểm định, không có độ khó, không có modifier nào áp vào. Nhét nó vào hệ 5 cấp
 * sẽ tạo ra một "thất bại có giá" của một việc không ai làm.
 */
export function checkRebellion(
  rng: Rng,
  vassal: Vassal,
  liegeLegitimacy: number,
  alliedRebels = 0,
  faction: Faction | null = null,
): RebellionCheck {
  const assessment = rebellionRisk(vassal, liegeLegitimacy, alliedRebels, faction);
  if (!assessment.ready || vassal.rebelling) {
    return { vassal, rebelled: false, risk: assessment.risk, line: '' };
  }

  const roll = rng.int(1, 100);
  if (roll > assessment.risk) {
    return {
      vassal,
      rebelled: false,
      risk: assessment.risk,
      line: `${vassal.name} vẫn chưa động, nhưng ai cũng biết ông ta đang đếm.`,
    };
  }

  return {
    vassal: { ...vassal, rebelling: true },
    rebelled: true,
    risk: assessment.risk,
    line: `${vassal.name} NỔI LOẠN — nguy cơ ${String(assessment.risk)} trên trăm, xúc sắc ra ${String(roll)}.`,
  };
}

/** Một chư hầu chịu khuất phục lại. Lòng trung KHÔNG về mức cũ, và không nên. */
export function submit(vassal: Vassal, year: number): Vassal {
  return addGrievance({ ...vassal, rebelling: false, loyalty: Math.max(vassal.loyalty, 30) }, 'Đã từng bị đánh bại', 8, year);
}

// ---------------------------------------------------------------------------
// Phe cánh
// ---------------------------------------------------------------------------

function clampMeter(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

/** Tính lại cấp, thủ lĩnh và chức vị khi sức mạnh hoặc thành viên đổi. */
export function refreshFaction(faction: Faction, vassals: readonly Vassal[]): Faction {
  const members = vassals.filter((vassal) => faction.members.includes(vassal.npcId));
  if (members.length === 0) return { ...faction, members: [], leaderId: '', memberRanks: {}, influence: 0, cohesion: 0 };

  const cohesion = clampMeter(
    members.reduce((sum, member) => sum + (100 - member.loyalty) * 0.7 + member.ambition * 0.3, 0) / members.length,
  );
  const averagePower = members.reduce((sum, member) => sum + powerOf(member), 0) / members.length;
  const influence = clampMeter(averagePower * 0.55 + members.length * 4 + cohesion * 0.25);
  const tier = [...factionOrganizationTiers()]
    .sort((left, right) => right.rank - left.rank)
    .find((entry) => members.length >= entry.minMembers && influence >= entry.minInfluence)
    ?? factionOrganizationTiers()[0]!;
  const ranked = [...members].sort(
    (left, right) => (powerOf(right) + right.ambition + (100 - right.loyalty)) - (powerOf(left) + left.ambition + (100 - left.loyalty)),
  );
  const leaderId = ranked[0]?.npcId ?? '';
  const average = members.reduce((sum, member) => sum + powerOf(member), 0) / members.length;
  const memberRanks: Record<string, string> = {};
  ranked.forEach((member, index) => {
    const roleRank = index === 0 ? 4 : index === 1 && members.length >= 3 ? 3 : powerOf(member) >= average ? 2 : 1;
    memberRanks[member.npcId] = factionMemberRankByNumber(roleRank).id;
  });

  return {
    ...faction,
    members: members.map((member) => member.npcId),
    tierId: tier.id,
    cohesion,
    influence,
    leaderId,
    memberRanks,
  };
}

/**
 * NHIỀU CHƯ HẦU LIÊN KẾT THÀNH PHE (mục 7).
 *
 * Điều kiện: cùng bất mãn (dưới ngưỡng phản) và có ít nhất hai người. Phe làm mọi
 * thành viên nguy hiểm hơn (`factionBonus`), nên một lãnh chúa phát hiện phe sớm
 * — bằng gián điệp trưởng của mục 8 — có cơ hội tách họ ra trước khi đủ đông.
 */
export function formFaction(vassals: readonly Vassal[], year: number, name: string, demand: string): {
  vassals: Vassal[];
  faction: Faction | null;
} {
  const config = vassalConfig().rebellion;
  const angry = vassals.filter((vassal) => vassal.loyalty < config.loyaltyBelow + 10 && !vassal.rebelling);
  if (angry.length < 2) return { vassals: [...vassals], faction: null };

  const draft: Faction = {
    id: `phe_${String(year)}`,
    name,
    members: angry.map((vassal) => vassal.npcId),
    tierId: 'nhom-ket-uoc',
    cohesion: 0,
    influence: 0,
    leaderId: '',
    memberRanks: {},
    demand,
    formedYear: year,
  };
  const faction = refreshFaction(draft, angry);

  return {
    faction,
    vassals: vassals.map((vassal) =>
      faction.members.includes(vassal.npcId) ? { ...vassal, factionId: faction.id } : vassal,
    ),
  };
}

/**
 * GIỮ CHƯ HẦU — một hành động chủ động, và là một kiểm định thật.
 *
 * 3d6, miền `rule.giu-chu-hau`. Thành công thì hoãn được một năm; thất bại nặng
 * thì chính lần đi thuyết phục ấy thành một mối hận mới.
 */
export function persuade(
  rng: Rng,
  vassal: Vassal,
  base: number,
  year: number,
  state: GameState | null = null,
): { vassal: Vassal; line: string } {
  const config = vassalConfig().rebellion;
  const run = runCheck(rng, {
    id: 'check.giu-chu-hau',
    system: '3d6',
    domain: config.checkDomain,
    difficulty: vassal.loyalty < 30 ? 'rat-kho' : 'kho',
    base,
    tags: ['cai-tri', 'chu-hau'],
    state,
  });

  switch (run.result.tier) {
    case 'critSuccess':
      return { vassal: { ...vassal, loyalty: Math.min(100, vassal.loyalty + 12) }, line: `${vassal.name} thề lại, và lần này có người làm chứng.` };
    case 'success':
      return { vassal: { ...vassal, loyalty: Math.min(100, vassal.loyalty + 7) }, line: `${vassal.name} nguôi đi phần nào.` };
    case 'costlySuccess':
      return { vassal: { ...vassal, loyalty: Math.min(100, vassal.loyalty + 5) }, line: `${vassal.name} nguôi đi, nhưng đòi một thứ ngài chưa muốn cho.` };
    case 'fail':
      return { vassal, line: `${vassal.name} nghe hết, gật đầu, và không đổi ý gì cả.` };
    case 'critFail':
      return {
        vassal: addGrievance(vassal, 'Bị lãnh chúa nói xúc phạm giữa triều', 5, year),
        line: `${vassal.name} bỏ về giữa chừng. Bây giờ có thêm một mối hận nữa.`,
      };
  }
}

/** Trần chư hầu ở một bậc — dưới bá tước là 0, và đó là ngưỡng của mục 2. */
export function vassalCapOf(titleId: string): number {
  return vassalCapFor(rankOf(titleId));
}
