/**
 * ĐẾ QUỐC (La Mã Thần thánh) — minigame CẢI CÁCH ĐẾ CHẾ (Phần 14 mục 2.5).
 * *Thể loại: bỏ phiếu và mặc cả.*
 *
 * Vấn đề: đế quốc quá lớn, hoàng đế do BẦU, hàng trăm chư hầu gần như độc lập.
 * Đế hội họp định kỳ và mỗi kỳ đưa ra một DỰ LUẬT CẢI CÁCH. Mỗi dự luật tăng
 * QUYỀN UY ĐẾ CHẾ và giảm TỰ DO CHƯ HẦU — nên chư hầu càng mạnh càng chống, và
 * cái giá của một lá phiếu tính bằng đất, tước, nợ, hoặc một cuộc hôn nhân.
 *
 * ĐIỂM KHÁC BIỆT VỚI BẢY THỂ LOẠI KIA: ở đây không có gì tự chạy. Quyền uy TỰ RƠI
 * mỗi năm (`authorityDriftPerYear` âm), nên đứng yên là thua chậm. Thất bại không
 * phải bị chinh phục mà là RÃ DẦN THÀNH CÁC QUỐC GIA RIÊNG — và trên bảng, nó chỉ
 * là một con số đi xuống trong hai chục năm.
 *
 * Vũ khí của Giáo hoàng cắm thẳng vào đây: vạ tuyệt thông CỞI LỜI THỀ của chư
 * hầu, nghĩa là `freedom` nhảy vọt trong đúng một năm.
 */

import { z } from 'zod';
import type { Rng } from '@/core/rng';
import { dietConfig, electors, powerName, princes, reformOf, reformRows } from '@/systems/nations/data';
import { internalEvent, proclaim } from '@/systems/nations/events';
import type { HreBoard, MinigameContext, MinigameModule, MinigameYear, PowerBoard, WorldEvent } from '@/systems/nations/types';

const seedSchema = z.object({
  authority: z.number().min(0).max(100).default(28),
  freedom: z.number().min(0).max(100).default(72),
  yearsToDiet: z.number().int().min(0).default(1),
  pendingReformId: z.string().default(''),
  passedReformIds: z.array(z.string()).default([]),
  papacyStance: z.enum(['lien-minh', 'trung-lap', 'chong-doi']).default('trung-lap'),
  collapseYears: z.number().int().min(0).default(0),
});

export interface VoteTally {
  electorYes: number;
  electorNo: number;
  princeYes: number;
  princeNo: number;
  passed: boolean;
  /** Ai chống mạnh nhất — người chơi tầng 3 mua phiếu của đúng những người này. */
  blockers: string[];
}

/**
 * ĐẾM PHIẾU MỘT DỰ LUẬT.
 *
 * Hai viện, và cả hai đều phải qua: đủ phiếu TUYỂN HẦU và đủ phiếu CHƯ HẦU LỚN.
 * `abstainCountsAgainst` là một luật nhỏ nhưng đắt: bỏ phiếu trắng tính là chống,
 * nên "không làm gì" cũng là một hành động chính trị ở Đế hội này.
 */
export function tally(board: HreBoard, reformId: string): VoteTally {
  const config = dietConfig();
  const reform = reformOf(reformId);
  const blockers: string[] = [];
  let electorYes = 0;
  let electorNo = 0;
  let princeYes = 0;
  let princeNo = 0;

  for (const elector of electors()) {
    const lean = leanOf(board, elector.id, elector.lean, reform?.opposedByFaction ?? [], reform?.favouredByFaction ?? [], elector.faction, elector.strength, reform?.opposePerStrengthPoint ?? 0);
    if (lean >= config.vote.leanToVoteAt) electorYes += 1;
    else {
      electorNo += 1;
      blockers.push(elector.name);
    }
  }

  const totalSeats = princes().reduce((sum, prince) => sum + prince.seats, 0) || 1;
  for (const prince of princes()) {
    const lean = leanOf(board, prince.id, prince.lean, reform?.opposedByFaction ?? [], reform?.favouredByFaction ?? [], prince.faction, prince.strength, reform?.opposePerStrengthPoint ?? 0);
    if (lean >= config.vote.leanToVoteAt) princeYes += prince.seats;
    else {
      princeNo += prince.seats;
      blockers.push(prince.name);
    }
  }

  return {
    electorYes,
    electorNo,
    princeYes,
    princeNo,
    passed: electorYes >= config.vote.electorMajority && princeYes / totalSeats >= config.vote.princeShareNeeded,
    blockers,
  };
}

function leanOf(
  board: HreBoard,
  voterId: string,
  baseLean: number,
  opposed: readonly string[],
  favoured: readonly string[],
  faction: string,
  strength: number,
  opposePerStrengthPoint: number,
): number {
  const config = dietConfig();
  const current = board.leans[voterId] ?? baseLean;
  const factionShift = (opposed.includes(faction) ? -22 : 0) + (favoured.includes(faction) ? 18 : 0);
  // CHƯ HẦU CÀNG MẠNH CÀNG CHỐNG. Không phải tính cách — là lợi ích.
  const strengthShift = -strength * opposePerStrengthPoint;
  // Liên minh với Giáo hoàng kéo được phe giáo hội và một phần chư hầu; chống lại
  // Giáo hoàng thì mất cả hai, và mất tuyển hầu giáo sĩ nặng hơn cả (mục 2.5).
  const papal =
    board.papacyStance === 'lien-minh'
      ? config.papacy.allyPrinceSwing * (faction === 'giao-hoi' ? 1.5 : 0.4)
      : board.papacyStance === 'chong-doi'
        ? (faction === 'giao-hoi' ? config.papacy.defyElectorSwing : config.papacy.defyPrinceSwing) * 0.8
        : 0;
  return Math.max(0, Math.min(100, current + factionShift + strengthShift + papal));
}

/** Mặc cả một lá phiếu: ban đất, ban tước, tha nợ, hôn nhân, dọa nạt, chia rẽ. */
export function bargain(board: HreBoard, voterId: string, bargainId: string): { board: HreBoard; cost: number; line: string } {
  const config = dietConfig();
  const option = config.bargains.find((row) => row.id === bargainId);
  if (option === undefined) return { board, cost: 0, line: `Không có cách mặc cả nào tên "${bargainId}".` };
  if (option.oncePerHouse && board.bargainsUsed.includes(`${bargainId}:${voterId}`)) {
    return { board, cost: 0, line: `${option.name} với người này đã dùng rồi — mỗi nhà chỉ một lần.` };
  }

  const current = board.leans[voterId] ?? 50;
  return {
    board: {
      ...board,
      leans: { ...board.leans, [voterId]: Math.max(0, Math.min(100, current + option.swing - option.backlash)) },
      authority: Math.max(0, board.authority - option.authorityCost),
      bargainsUsed: [...board.bargainsUsed, `${bargainId}:${voterId}`],
    },
    cost: option.cost,
    line: `${option.name}: phiếu của ${voterId} nghiêng thêm ${String(option.swing)}${option.backlash > 0 ? `, nhưng để lại ${String(option.backlash)} điểm oán` : ''}.`,
  };
}

export const hre: MinigameModule = {
  kind: 'cai-cach',
  name: 'Cải cách đế chế',

  create(seed): PowerBoard {
    const parsed = seedSchema.parse(seed);
    const leans: Record<string, number> = {};
    for (const elector of electors()) leans[elector.id] = elector.lean;
    for (const prince of princes()) leans[prince.id] = prince.lean;
    return {
      kind: 'cai-cach',
      authority: parsed.authority,
      freedom: parsed.freedom,
      yearsToDiet: parsed.yearsToDiet,
      pendingReformId: parsed.pendingReformId,
      passedReformIds: parsed.passedReformIds,
      leans,
      bargainsUsed: [],
      papacyStance: parsed.papacyStance,
      excommunicated: false,
      collapseYears: parsed.collapseYears,
      lastDietYear: 0,
    };
  },

  year(rng: Rng, context: MinigameContext): MinigameYear {
    const board = context.power.board;
    if (board.kind !== 'cai-cach') throw new Error('bảng sai thể loại cho Đế quốc');
    return hreYear(rng, board, context);
  },
};

function hreYear(rng: Rng, board: HreBoard, context: MinigameContext): MinigameYear {
  const config = dietConfig();
  const lines: string[] = [];
  const events: WorldEvent[] = [];
  const { power, year } = context;
  let next: HreBoard = { ...board };
  let treasury = 0;
  let prestige = 0;
  let cohesion = 0;
  let landDelta = 0;

  // --- QUYỀN UY TỰ RƠI ------------------------------------------------------
  let authority = Math.max(0, Math.min(config.authorityMax, next.authority + config.authorityDriftPerYear));
  let freedom = Math.max(0, Math.min(100, next.freedom + 0.4));

  // --- VŨ KHÍ CỦA GIÁO HOÀNG ------------------------------------------------
  if (context.sanctions.excommunicated || context.sanctions.interdict) {
    if (!next.excommunicated) {
      lines.push('Hoàng đế bị vạ. Chư hầu được cởi lời thề trung thành, và ai cũng biết điều đó có nghĩa gì.');
      events.push(internalEvent(power.id, year, `Chư hầu ${powerName(power.id)} được cởi lời thề sau lệnh vạ của Giáo triều.`));
    }
    authority = Math.max(0, authority + config.papacy.excommunicationAuthority);
    freedom = Math.min(100, freedom + config.papacy.excommunicationFreedom);
    next = { ...next, excommunicated: true };
    cohesion -= 8;
  } else if (next.excommunicated) {
    next = { ...next, excommunicated: false };
    lines.push('Lệnh vạ được gỡ. Lời thề nối lại, nhưng không ai quên là nó đã từng đứt.');
  }

  if (next.papacyStance === 'lien-minh') authority += config.papacy.allyAuthorityPerYear;

  // --- MỐI ĐE DỌA BÊN NGOÀI LÀ THỨ DUY NHẤT LÀM CHƯ HẦU NGỒI LẠI --------------
  // Không có nó thì đế quốc này chỉ có một quỹ đạo: rã. Có nó thì cải cách có
  // đường đi, và đó cũng đúng là cách lịch sử của nguyên mẫu diễn ra — hoà bình
  // đế chế được thông qua khi có một đạo quân đứng ở biên giới phía đông.
  next = {
    ...next,
    leans: Object.fromEntries(
      Object.entries(next.leans).map(([id, lean]) => [id, Math.max(0, Math.min(100, lean + (context.atWar ? 2 : -0.5)))]),
    ),
  };

  // --- ĐẾ HỘI ---------------------------------------------------------------
  const yearsToDiet = next.yearsToDiet - 1;
  if (yearsToDiet <= 0) {
    const candidate = nextReform(next);
    if (candidate === null) {
      lines.push('Đế hội họp và không còn dự luật nào để bàn: sáu cải cách đã thông qua đủ. Đế quốc giờ là một quốc gia.');
      prestige += 4;
      next = { ...next, yearsToDiet: config.dietEveryYears, lastDietYear: year };
    } else {
      const vote = tally(next, candidate.id);
      next = { ...next, pendingReformId: candidate.id, yearsToDiet: config.dietEveryYears, lastDietYear: year };
      if (vote.passed) {
        authority = Math.min(config.authorityMax, authority + candidate.authority);
        freedom = Math.max(0, freedom + candidate.freedom);
        next = {
          ...next,
          passedReformIds: [...next.passedReformIds, candidate.id],
          pendingReformId: '',
          // Thông qua rồi thì chư hầu nhớ dai: mọi phiếu nghiêng về phía chống một chút.
          leans: Object.fromEntries(Object.entries(next.leans).map(([id, lean]) => [id, Math.max(0, lean - 6)])),
        };
        prestige += 5;
        cohesion += 6;
        const income = candidate.effects['incomePerYear'] ?? 0;
        treasury += income;
        lines.push(`Đế hội THÔNG QUA ${candidate.name} (${String(vote.electorYes)}/7 tuyển hầu).`);
        events.push(
          proclaim({
            powerId: power.id,
            kind: 'cai-cach',
            targets: [],
            year,
            text: `Đế hội thông qua ${candidate.name}. Quyền uy đế chế lên ${String(Math.round(authority))}.`,
            headline: `Đế hội thông qua ${candidate.name}`,
          }),
        );
      } else {
        authority = Math.max(0, authority - 1.5);
        lines.push(
          `Đế hội BÁC ${candidate.name}: ${String(vote.electorYes)}/7 tuyển hầu thuận, chư hầu lớn ${String(vote.princeYes)} ghế thuận. Chống mạnh nhất: ${vote.blockers.slice(0, 3).join(', ')}.`,
        );
      }
    }
  } else {
    next = { ...next, yearsToDiet };
  }

  // --- LY KHAI ---------------------------------------------------------------
  // Tự do chư hầu cao là mỗi năm một cơ hội để ai đó lặng lẽ đi ra.
  const secessionRisk = Math.max(0, (freedom - 60) * config.secessionRiskPerFreedomPoint);
  if (secessionRisk > 0 && rng.next() * 100 < secessionRisk) {
    landDelta -= 1;
    cohesion -= 6;
    prestige -= 3;
    lines.push('Một chư hầu lớn ngừng cử người tới Đế hội và bắt đầu tự gọi mình là vương quốc.');

    events.push(
      proclaim({
        powerId: power.id,
        kind: 'ly-khai',
        targets: [],
        year,
        text: `Một chư hầu lớn tách khỏi ${powerName(power.id)} và tự xưng độc lập.`,
        headline: 'Một mảnh đế quốc tự tách ra',
      }),
    );
  }

  // --- RÃ DẦN ---------------------------------------------------------------
  const collapseYears = authority <= config.collapseBelowAuthority ? next.collapseYears + 1 : 0;
  next = { ...next, authority, freedom, collapseYears };

  if (collapseYears >= config.collapseYears) {
    lines.push('Đế quốc không còn là một thứ gì cả: các chư hầu vẫn ở đó, danh hiệu vẫn ở đó, và không ai nghe ai nữa.');
    return {
      board: next,
      deltas: { treasury, prestige: prestige - 10, cohesion: cohesion - 20, land: landDelta },
      lines,
      events,
      fallen: true,
    };
  }

  return {
    board: next,
    deltas: {
      treasury: Math.round(treasury),
      prestige: Math.round(prestige * 10) / 10,
      cohesion: Math.round((cohesion + (authority > 50 ? 1 : -0.5)) * 10) / 10,
      stability: Math.round((authority - 40) / 20),
      land: landDelta,
      income: Math.round(next.passedReformIds.length * 1.5 - 1),
    },
    lines,
    events,
  };
}

/** Dự luật kế tiếp: cái có thứ tự thấp nhất mà điều kiện tiền đề đã đủ. */
export function nextReform(board: HreBoard): ReturnType<typeof reformOf> {
  for (const reform of reformRows()) {
    if (board.passedReformIds.includes(reform.id)) continue;
    if (reform.requiresPassed.every((required) => board.passedReformIds.includes(required))) return reform;
  }
  return null;
}
