/**
 * BỐN CON ĐƯỜNG CÓ THÀNH TRÌ VÀ CHỈ SỐ CHÍNH DANH (Phần 12 mục 2, việc 12.8).
 *
 * Bốn con đường không chỉ khác nhau ở chỗ bắt đầu — chúng khác nhau ở chỗ NGƯỜI
 * CHƠI PHẢI SỐNG VỚI CÁI GÌ SAU ĐÓ:
 *
 *   **xuất thân**   dân trung thành, nhưng công trình cũ nát và có thể có anh em
 *                   tranh quyền thừa kế. Chính danh cao nhất, và đó là thứ duy
 *                   nhất được cho không.
 *   **được phong**  chính danh cao, nhưng KÈM NGHĨA VỤ. Có thể bị thu hồi. Đây là
 *                   con đường mà lãnh chúa cấp trên luôn có mặt trong mọi tính toán.
 *   **đánh chiếm**  dân THÙ ĐỊCH, công trình hư hại, chính danh thấp, và LUÔN CÒN
 *                   một người tự nhận là chủ hợp pháp ở đâu đó. Con đường nhanh
 *                   nhất, và là con đường duy nhất sinh ra một kẻ thù có tên.
 *   **phát triển**  chậm nhất, không ai cho gì, nhưng dân trung thành nhất và
 *                   hoàn toàn theo ý mình.
 *
 * CHÍNH DANH LÀM BA VIỆC, và cả ba đều nằm ở chỗ khác đọc vào chứ không nằm ở
 * đây: **dân phục tùng** (`population.moraleTarget`), **chư hầu công nhận** và
 * **khả năng bị kiện lên lãnh chúa cấp trên** (cả hai là Phần 13).
 */

import type { HoldingId } from '@/core/ids';
import { holdingConfig } from './data';
import type { Holding, Ownership, OwnershipPath } from './types';

export interface PathProfile {
  path: OwnershipPath;
  name: string;
  legitimacy: number;
  /** Lòng dân lúc nhận thành. */
  morale: number;
  /** Công trình bắt đầu ở mức hư hại nào. */
  integrity: number;
  /** Dân thù địch 0–100. Chỉ đường `danh-chiem` có. */
  hatred: number;
  /** Có kẻ tự nhận là chủ hợp pháp không. */
  rival: boolean;
  /** Nghĩa vụ kèm theo, tính bằng ngày quân dịch mỗi năm. */
  serviceDays: number;
  note: string;
}

export const PATH_PROFILES: Readonly<Record<OwnershipPath, PathProfile>> = {
  'xuat-than': {
    path: 'xuat-than',
    name: 'Xuất thân',
    legitimacy: 78,
    morale: 62,
    integrity: 68,
    hatred: 0,
    rival: false,
    serviceDays: 40,
    note: 'Nhà mình từ đời ông. Dân biết mặt, nhưng mái đã dột và sổ nợ thì dài.',
  },
  'duoc-phong': {
    path: 'duoc-phong',
    name: 'Được phong',
    legitimacy: 70,
    morale: 52,
    integrity: 85,
    hatred: 0,
    rival: false,
    serviceDays: 60,
    note: 'Ban vì công lao, và thu hồi được vì thất sủng. Nghĩa vụ nặng hơn hẳn.',
  },
  'danh-chiem': {
    path: 'danh-chiem',
    name: 'Đánh chiếm',
    legitimacy: 22,
    morale: 26,
    integrity: 45,
    hatred: 70,
    rival: true,
    serviceDays: 0,
    note: 'Cổng còn vết cháy và dân còn nhớ tên người cũ. Luôn có một kẻ tự nhận là chủ hợp pháp.',
  },
  'phat-trien': {
    path: 'phat-trien',
    name: 'Phát triển lên',
    legitimacy: 48,
    morale: 66,
    integrity: 100,
    hatred: 0,
    rival: false,
    serviceDays: 20,
    note: 'Không ai cho gì, nên cũng không ai đòi gì. Mọi viên đá đều do mình đặt.',
  },
};

export function ownershipFor(path: OwnershipPath, turn: number, rivalName = ''): Ownership {
  const profile = PATH_PROFILES[path];
  return {
    path,
    legitimacy: profile.legitimacy,
    rivalClaimant: profile.rival ? (rivalName === '' ? 'một người thừa kế của nhà cũ' : rivalName) : '',
    sinceTurn: turn,
    conqueredHatred: profile.hatred,
  };
}

/**
 * Chính danh trôi theo thời gian — nhưng KHÔNG tự đầy lên tới 100.
 *
 * Một thành trì cướp được thì mỗi năm bớt tanh mùi máu một chút; đó là lịch sử
 * thật. Nhưng trần của nó thấp hơn trần của một thành được phong, và khoảng cách
 * ấy chỉ đóng lại bằng một hành vi PHÁP LÝ ở Phần 13 — được công nhận, được
 * phong lại, hoặc cưới vào nhà cũ. Nếu để nó tự lên 100 thì cả sức nặng của mục
 * 2 tan sau vài chục tuần chơi.
 */
export function driftLegitimacy(ownership: Ownership, weeks: number): Ownership {
  const config = holdingConfig();
  const ceiling = ownership.path === 'danh-chiem' ? (ownership.rivalClaimant === '' ? 70 : 55) : 92;
  const perWeek = 0.05;
  const legitimacy = Math.min(ceiling, ownership.legitimacy + perWeek * weeks);

  const decay = (config.moraleFactors.conqueredHatredDecayPerYear / config.weeksPerYear) * weeks;
  return {
    ...ownership,
    legitimacy,
    conqueredHatred: Math.max(0, ownership.conqueredHatred - decay),
  };
}

/** Kẻ tự nhận là chủ hợp pháp đã bị dẹp — bằng dao hoặc bằng giấy. */
export function settleClaim(holding: Holding, legitimacyGain: number): Holding {
  return {
    ...holding,
    ownership: {
      ...holding.ownership,
      rivalClaimant: '',
      legitimacy: Math.min(92, holding.ownership.legitimacy + legitimacyGain),
    },
  };
}

/**
 * Thành trì đổi chủ sau một cuộc vây hãm (Phần 11 mục 7).
 *
 * Vào bằng đường `danh-chiem`, và điều đó ĐỔI HẲN thành trì chứ không chỉ đổi
 * một cái tên trong sổ: dân thù địch, công trình hư, lòng dân sập. Nếu chỉ đổi
 * tên chủ thì đánh chiếm thành ra là con đường có lợi nhất về mọi mặt, và mục 2
 * nói ngược lại.
 */
export function seize(holding: Holding, turn: number, sacked: boolean, rivalName = ''): Holding {
  const profile = PATH_PROFILES['danh-chiem'];
  const config = holdingConfig();
  const damage = sacked ? 0.55 : 0.8;

  const populationLoss = sacked ? config.sackDeathShare : 0.04;
  const total = holding.population.total * (1 - populationLoss);

  return {
    ...holding,
    ownership: ownershipFor('danh-chiem', turn, rivalName),
    seat: false,
    permits: { granted: [], grantedWorks: [], illegalWorks: [], discovered: false },
    obligations: { ...holding.obligations, paidThisYear: false, arrearsYears: 0 },
    buildings: holding.buildings.map((placed) => ({
      ...placed,
      integrity: Math.max(5, placed.integrity * damage),
    })),
    population: {
      ...holding.population,
      total,
      morale: sacked ? 12 : profile.morale,
      strata: holding.population.strata.map((group) => ({
        ...group,
        people: group.people * (1 - populationLoss),
        morale: sacked ? 12 : profile.morale,
      })),
      races: holding.population.races.map((row) => ({ ...row, people: row.people * (1 - populationLoss) })),
      levied: 0,
      levyWeeks: 0,
    },
    // Kho về tay kẻ thắng. Cướp phá thì không còn gì, không cướp thì còn một nửa.
    stores: Object.fromEntries(
      Object.entries(holding.stores).map(([id, amount]) => [id, sacked ? 0 : amount * 0.5]),
    ),
  };
}

/** Tên có loại từ — Phụ lục A mục 9c cấm tên trần trụi trong văn bản cho AI. */
export function holdingLabel(holding: Holding, tierArticle: string): string {
  return `${tierArticle} ${holding.name}`;
}

/**
 * Hai thành trì KHÔNG được trùng tên với một lãnh thổ (Phụ lục A mục 9a).
 *
 * Kiểm ở khâu dữ liệu, không kiểm ở khâu prompt: chặn được từ gốc thì AI không
 * có cơ hội lẫn, còn nhắc AI đừng lẫn thì có ngày nó vẫn lẫn. Hàm nhận danh
 * sách tên đã dùng từ BÊN NGOÀI chứ không tự đi đọc slice `realm` — đúng cái mà
 * mục 1 cấm.
 */
export function uniqueHoldingName(wanted: string, taken: readonly string[]): string {
  const key = (name: string): string => name.trim().toLocaleLowerCase('vi');
  const used = new Set(taken.map(key));
  if (!used.has(key(wanted))) return wanted;

  // Hậu tố tiếng Việt thật, không phải số: "thành Ehrenfeld Hạ" đọc như một địa
  // danh, còn "thành Ehrenfeld 2" đọc như một lỗi hiển thị — và AI sẽ học theo
  // bất cứ giọng nào nó thấy trong dữ liệu.
  for (const suffix of ['Hạ', 'Thượng', 'Tân', 'Đông', 'Tây', 'Nam', 'Bắc']) {
    const candidate = `${wanted} ${suffix}`;
    if (!used.has(key(candidate))) return candidate;
  }
  for (let index = 2; index < 100; index++) {
    const candidate = `${wanted} Mới ${String(index)}`;
    if (!used.has(key(candidate))) return candidate;
  }
  return `${wanted} Mới`;
}

/** Đánh dấu tòa chính. Đúng MỘT thành trì được mang dấu này. */
export function makeSeat(holdings: readonly Holding[], id: HoldingId): Holding[] {
  return holdings.map((holding) => ({ ...holding, seat: holding.id === id }));
}
