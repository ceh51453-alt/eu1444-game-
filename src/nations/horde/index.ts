/**
 * HÃN QUỐC THẢO NGUYÊN — minigame CỐNG NẠP & PHÂN LIỆT (Phần 14 mục 2.4).
 * *Thể loại: bòn rút bên ngoài trong khi bên trong đang tan.*
 *
 * **KHÔNG PHẢI MAN RỢ.** Đây là thế lực có hệ thống trạm dịch nhanh nhất thế
 * giới, thu thuế bài bản, và bảo hộ tuyến thương mại xuyên lục địa. Nó không cai
 * trị trực tiếp các công quốc định cư — nó CẤP SẮC: giấy phép cai trị cho ông
 * hoàng nào chịu nộp nhiều nhất và ngoan nhất, rút lại được bất cứ lúc nào, và
 * chơi họ chống lẫn nhau.
 *
 * Cái bẫy nằm ngay trong công cụ: **một chư hầu được ưu ái quá lâu sẽ mạnh lên và
 * không nộp nữa.** Cấp sắc cho kẻ mạnh nhất là cách nhanh nhất để nuôi kẻ sẽ lật
 * mình — nhưng cấp cho kẻ yếu thì sổ cống nạp mỏng đi ngay năm nay.
 *
 * Và nguồn tiền lớn nhất cũng là đường đi của cái chết: **DỊCH HẠCH KHỞI PHÁT TỪ
 * VÙNG NÀY VÀ LAN THEO CHÍNH CÁC TUYẾN MÌNH BẢO HỘ** (nối thẳng vào Phần 15).
 */

import { z } from 'zod';
import type { Rng } from '@/core/rng';
import { powerName } from '@/systems/nations/data';
import { internalEvent, proclaim } from '@/systems/nations/events';
import type { HordeBoard, MinigameContext, MinigameModule, MinigameYear, PowerBoard, WorldEvent } from '@/systems/nations/types';

const seedSchema = z.object({
  settlement: z.number().min(-100).max(100).default(-60),
  plagueLevel: z.number().min(0).max(100).default(0),
  plagueOutbreakYear: z.number().int().min(0).default(0),
  religionPull: z.record(z.string(), z.number()).default({}),
  khanates: z
    .array(
      z.object({
        id: z.string().min(1),
        name: z.string().min(1),
        loyalty: z.number().min(0).max(100),
        strength: z.number().min(0).max(100),
        seat: z.boolean().default(false),
      }),
    )
    .default([]),
  tributaries: z
    .array(
      z.object({
        id: z.string().min(1),
        name: z.string().min(1),
        patent: z.boolean().default(false),
        tribute: z.number().min(0),
        strength: z.number().min(0).max(100),
        favouredYears: z.number().int().min(0).default(0),
        arrears: z.number().int().min(0).default(0),
      }),
    )
    .default([]),
  routes: z
    .array(
      z.object({
        id: z.string().min(1),
        name: z.string().min(1),
        income: z.number().min(0),
        plagueRisk: z.number().min(0).max(100),
        protected: z.boolean().default(true),
      }),
    )
    .default([]),
});

/**
 * CẤP SẮC cho một chư hầu, và rút của người đang giữ.
 *
 * Chỉ một tờ sắc có hiệu lực mỗi lần — đó là cả cơ chế: giấy phép độc quyền là
 * thứ đáng để các ông hoàng cắn nhau, còn nếu ai cũng có thì không ai nộp gì.
 */
export function grantPatent(board: HordeBoard, tributaryId: string): { board: HordeBoard; line: string } {
  const target = board.tributaries.find((row) => row.id === tributaryId);
  if (target === undefined) return { board, line: `Không có chư hầu nào tên "${tributaryId}".` };
  const previous = board.tributaries.find((row) => row.patent && row.id !== tributaryId);
  return {
    board: {
      ...board,
      tributaries: board.tributaries.map((row) =>
        row.id === tributaryId
          ? { ...row, patent: true, favouredYears: 0 }
          : row.patent
            ? { ...row, patent: false, favouredYears: 0, strength: Math.max(0, row.strength - 6) }
            : row,
      ),
    },
    line:
      previous === undefined
        ? `Sắc cai trị trao cho ${target.name}.`
        : `Sắc cai trị chuyển từ ${previous.name} sang ${target.name}. Hai nhà ấy sẽ nhớ chuyện này rất lâu.`,
  };
}

/** Rút sắc: chư hầu mất quyền, mất một phần sức, và ghi nợ oán. */
export function revokePatent(board: HordeBoard): { board: HordeBoard; line: string } {
  const holder = board.tributaries.find((row) => row.patent);
  if (holder === undefined) return { board, line: 'Không ai đang giữ sắc.' };
  return {
    board: {
      ...board,
      tributaries: board.tributaries.map((row) =>
        row.id === holder.id ? { ...row, patent: false, strength: Math.max(0, row.strength - 10), arrears: row.arrears + 1 } : row,
      ),
    },
    line: `Rút sắc của ${holder.name}.`,
  };
}

export const horde: MinigameModule = {
  kind: 'cong-nap',
  name: 'Cống nạp & phân liệt',

  create(seed): PowerBoard {
    const parsed = seedSchema.parse(seed);
    return {
      kind: 'cong-nap',
      tributaries: parsed.tributaries.map((row) => ({ ...row, defiant: false })),
      khanates: parsed.khanates.map((row) => ({ ...row, broken: false })),
      routes: parsed.routes,
      plagueLevel: parsed.plagueLevel,
      plagueOutbreakYear: parsed.plagueOutbreakYear,
      settlement: parsed.settlement,
      religionPull: parsed.religionPull,
    };
  },

  year(rng: Rng, context: MinigameContext): MinigameYear {
    const board = context.power.board;
    if (board.kind !== 'cong-nap') throw new Error('bảng sai thể loại cho Hãn quốc thảo nguyên');
    return hordeYear(rng, board, context);
  },
};

function hordeYear(rng: Rng, board: HordeBoard, context: MinigameContext): MinigameYear {
  const lines: string[] = [];
  const events: WorldEvent[] = [];
  const crisisTriggers: string[] = [];
  const { power, year } = context;
  let treasury = 0;
  let prestige = 0;
  let cohesion = 0;
  let stability = 0;
  let military = 0;
  let landDelta = 0;

  // --- a) SỔ CỐNG NẠP -------------------------------------------------------
  const tributaries = board.tributaries.map((row) => {
    const favouredYears = row.patent ? row.favouredYears + 1 : Math.max(0, row.favouredYears - 1);

    // Được ưu ái lâu thì mạnh lên. Đây là cái bẫy của chính công cụ.
    const strength = Math.max(0, Math.min(100, row.strength + (row.patent ? 1.6 : -0.4)));
    const overmighty = strength > 70 && favouredYears >= 6;

    if (row.defiant || overmighty) {
      if (!row.defiant) {
        lines.push(`${row.name} đã đủ mạnh và ngừng nộp cống. Sắc cai trị trong tay họ giờ là của họ, không phải của đại hãn.`);
        events.push(internalEvent(power.id, year, `${row.name} ngừng nộp cống cho ${powerName(power.id)}.`));
        prestige -= 5;
      }
      return { ...row, favouredYears, strength, defiant: true, arrears: row.arrears + 1 };
    }

    // Nộp hay không nộp: sức mạnh của chư hầu so với uy tín của đại hãn.
    const willing = power.prestige + (row.patent ? 20 : 0) - strength * 0.8;
    if (willing > 0 || rng.int(1, 100) <= 55) {
      treasury += row.tribute * (row.patent ? 1.15 : 1);
      return { ...row, favouredYears, strength, arrears: 0 };
    }
    lines.push(`${row.name} khất cống năm nay.`);
    return { ...row, favouredYears, strength, arrears: row.arrears + 1 };
  });

  // --- b) PHÂN LIỆT NỘI BỘ --------------------------------------------------
  // Hãn quốc đang tách thành các hãn quốc nhỏ tranh nhau. Giữ liên minh bằng
  // CHIẾN LỢI PHẨM và bằng UY TÍN — hết cả hai thì không lời hứa nào giữ nổi.
  const spoils = context.campaignsWon * 8;
  const khanates = board.khanates.map((khanate) => {
    if (khanate.broken || khanate.seat) return khanate;
    const loyalty = Math.max(0, Math.min(100, khanate.loyalty + spoils + power.prestige / 25 - 3.2));
    if (loyalty < 25 && rng.int(1, 100) <= 30) {
      lines.push(`${khanate.name} tách ra và tự xưng hãn. Đại trướng nhỏ đi một mảnh.`);
      events.push(
        proclaim({
          powerId: power.id,
          kind: 'phan-liet',
          targets: [],
          year,
          text: `${khanate.name} tách khỏi ${powerName(power.id)}.`,
          headline: `${khanate.name} tự xưng hãn`,
        }),
      );
      return { ...khanate, loyalty, broken: true };
    }
    return { ...khanate, loyalty };
  });
  const brokenNow = khanates.filter((khanate) => khanate.broken).length - board.khanates.filter((khanate) => khanate.broken).length;
  if (brokenNow > 0) {
    landDelta -= brokenNow;
    cohesion -= 12 * brokenNow;
    military -= 6 * brokenNow;
  }

  // --- c) TUYẾN THƯƠNG MẠI VÀ ĐẠI DỊCH --------------------------------------
  const routeIncome = board.routes.reduce((sum, route) => sum + route.income * (route.protected ? 1 : 0.6), 0);
  treasury += routeIncome;

  const risk = board.routes.reduce((sum, route) => sum + (route.protected ? route.plagueRisk : route.plagueRisk / 2), 0);
  let plagueLevel = Math.min(100, board.plagueLevel + risk / 8);
  let plagueOutbreakYear = board.plagueOutbreakYear;

  if (plagueLevel > 45 && rng.int(1, 100) <= Math.round(plagueLevel - 45)) {
    plagueLevel = 0;
    plagueOutbreakYear = year;
    lines.push('Dịch hạch bùng lên trên tuyến thương mại — và lan theo chính những con đường mình bảo hộ.');
    events.push(
      proclaim({
        powerId: power.id,
        kind: 'dai-dich',
        targets: [],
        year,
        text: 'Dịch hạch khởi phát từ thảo nguyên và đi theo các tuyến thương mại về phía tây.',
        headline: 'Dịch hạch trên đường thương mại',
      }),
    );
    stability -= 14;
    treasury -= routeIncome * 0.35;
    // Dịch hạch là KHỦNG HOẢNG theo nghĩa của mục 5: nó không chỉ giết người, nó
    // đẩy một tiếng vọng bốn năm vào bản đồ tôn giáo của cả châu lục.
    crisisTriggers.push('dich-benh');
  }

  // --- d) ĐỊNH CƯ HAY DU MỤC ------------------------------------------------
  // Định cư thì giàu, có thành thị, thuế ổn định, nhưng kỵ binh mất dần sức chiến
  // đấu qua vài thế hệ. Giữ du mục thì nghèo hơn nhưng quân đội luôn đáng sợ.
  const drift = treasury > power.income ? 1.2 : -0.6;
  const settlement = Math.max(-100, Math.min(100, board.settlement + drift));
  const settled = (settlement + 100) / 200;
  military -= settled > 0.5 ? 0.8 : 0;
  if (Math.abs(settlement) < 5 && Math.abs(board.settlement) >= 5) {
    lines.push('Đại trướng đứng giữa hai lối sống: một nửa dựng thành, một nửa vẫn dời trại theo cỏ.');
  }

  // --- e) BA PHÍA KÉO VỀ BA HƯỚNG -------------------------------------------
  const pull = { ...board.religionPull };
  for (const key of Object.keys(pull)) {
    const current = pull[key] ?? 0;
    pull[key] = Math.max(0, current + (key === 'rel_thao-nguyen' ? -0.4 : 0.25));
  }

  return {
    board: {
      ...board,
      tributaries,
      khanates,
      plagueLevel,
      plagueOutbreakYear,
      settlement,
      religionPull: pull,
    },
    deltas: {
      treasury: Math.round(treasury - power.income * 0.35),
      income: Math.round(settled * 6 - 3),
      prestige: Math.round((prestige + (context.campaignsWon > 0 ? 4 : -0.8)) * 10) / 10,
      stability: Math.round(stability * 10) / 10,
      cohesion: Math.round((cohesion + (tributaries.some((row) => row.defiant) ? -3 : 1)) * 10) / 10,
      military: Math.round(military * 10) / 10,
      land: landDelta,
    },
    lines,
    events,
    ...(crisisTriggers.length > 0 ? { crisisTriggers } : {}),
  };
}
