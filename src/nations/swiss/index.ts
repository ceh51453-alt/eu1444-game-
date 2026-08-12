/**
 * LIÊN BANG NÚI — minigame LIÊN BANG & XUẤT KHẨU LÍNH ĐÁNH THUÊ (mục 2.3).
 * *Thể loại: đồng thuận và nghịch lý.*
 *
 * Không có vua, không có quý tộc, không phong kiến. Các bang tự trị họp hội đồng,
 * và MỌI QUYẾT ĐỊNH LỚN CẦN ĐỒNG THUẬN — không ai ra lệnh được cho ai. Người chơi
 * ở đây không cai trị, người chơi THUYẾT PHỤC, và mỗi bang có lợi ích riêng, thậm
 * chí thù nhau.
 *
 * BA NGHỊCH LÝ, và cả ba đều là hệ quả trực tiếp của chính thế mạnh:
 *
 *  1. **GIỮ ĐÈO** là thế mạnh tuyệt đối — khối giáo Lùn trên địa hình núi gần như
 *     bất khả chiến bại trước kỵ binh nặng (Phần 10 mục 7). Ra khỏi núi thì lợi
 *     thế biến mất, mà tiền thì nằm ngoài núi.
 *  2. **XUẤT KHẨU LÍNH ĐÁNH THUÊ** là nguồn thu chính. Tiền chảy về, thanh niên
 *     chết ở nước ngoài. Và có ngày hai bang nhận hợp đồng của hai bên ĐỐI ĐỊCH
 *     trong cùng một trận: anh em họ giết nhau vì tiền người lạ. Sự kiện ấy phải
 *     làm rung chuyển liên bang, nên nó là con số duy nhất ở bảng này không bao
 *     giờ giảm.
 *  3. **KẾT NẠP BANG MỚI** làm liên bang mạnh lên và có thể làm người chơi mất
 *     quyền kiểm soát hội đồng — vì mỗi bang mới là thêm phiếu, và phiếu ấy không
 *     thuộc về ai cả.
 */

import { z } from 'zod';
import type { Rng } from '@/core/rng';
import { powerName } from '@/systems/nations/data';
import { internalEvent, proclaim } from '@/systems/nations/events';
import type { MinigameContext, MinigameModule, MinigameYear, PowerBoard, SwissBoard, WorldEvent } from '@/systems/nations/types';

const seedSchema = z.object({
  youthsAbroad: z.number().min(0).default(0),
  empireRelation: z.number().min(-100).max(100).default(-60),
  cantons: z
    .array(
      z.object({
        id: z.string().min(1),
        name: z.string().min(1),
        votes: z.number().int().min(1),
        interest: z.string().default(''),
        mood: z.number().min(0).max(100),
        feudWith: z.string().default(''),
        menForHire: z.number().min(0).default(0),
      }),
    )
    .default([]),
  passes: z
    .array(
      z.object({
        id: z.string().min(1),
        name: z.string().min(1),
        garrison: z.number().min(0),
        held: z.boolean().default(true),
        tollPerYear: z.number().min(0).default(0),
      }),
    )
    .default([]),
  admitCandidates: z
    .array(
      z.object({
        id: z.string().min(1),
        name: z.string().min(1),
        votes: z.number().int().min(1),
        strength: z.number().min(0).max(100),
        interest: z.string().default(''),
      }),
    )
    .default([]),
  employers: z.array(z.string()).default([]),
});

/**
 * MỘT CUỘC BỎ PHIẾU Ở HỘI ĐỒNG LIÊN BANG.
 *
 * ĐỒNG THUẬN nghĩa là một bang phản đối cũng đủ chặn — nhưng "phản đối" ở đây
 * không phải một cú tung: nó là tâm trạng của bang ấy so với việc đang bàn. Hai
 * bang đang thù nhau thì bang này chống mọi thứ bang kia đề xuất, và đó là chỗ
 * người chơi phải gỡ trước khi bàn tới nội dung.
 */
export function callMotion(
  cantons: readonly SwissBoard['cantons'][number][],
  favours: string,
): { yes: number; no: number; passed: boolean; holdouts: string[] } {
  let yes = 0;
  let no = 0;
  const holdouts: string[] = [];
  for (const canton of cantons) {
    const feudPenalty = canton.feudWith !== '' && canton.feudWith === favours ? -25 : 0;
    const gain = canton.id === favours ? 30 : 0;
    const support = canton.mood + gain + feudPenalty;
    if (support >= 55) yes += canton.votes;
    else {
      no += canton.votes;
      holdouts.push(canton.name);
    }
  }
  return { yes, no, passed: no === 0 && yes > 0, holdouts };
}

/** Ký một hợp đồng lính đánh thuê cho một bang. Tiền về, thanh niên đi. */
export function signContract(
  board: SwissBoard,
  contract: { id: string; employer: string; cantonId: string; men: number; payPerYear: number; yearsLeft: number; theatre: string },
): { board: SwissBoard; clash: boolean; line: string } {
  const clash = board.contracts.some(
    (existing) => existing.theatre === contract.theatre && existing.employer !== contract.employer && existing.yearsLeft > 0,
  );
  return {
    board: {
      ...board,
      contracts: [...board.contracts, contract],
      cantons: board.cantons.map((canton) =>
        canton.id === contract.cantonId
          ? { ...canton, menForHire: Math.max(0, canton.menForHire - contract.men), menAbroad: canton.menAbroad + contract.men }
          : canton,
      ),
      youthsAbroad: board.youthsAbroad + contract.men,
    },
    clash,
    line: clash
      ? `Bang ${contract.cantonId} nhận hợp đồng của ${powerName(contract.employer)} ở ${contract.theatre} — nơi một bang khác đã nhận của phía bên kia.`
      : `Bang ${contract.cantonId} bán ${String(contract.men)} người cho ${powerName(contract.employer)}.`,
  };
}

export const swiss: MinigameModule = {
  kind: 'lien-bang',
  name: 'Liên bang & xuất khẩu lính đánh thuê',

  create(seed): PowerBoard {
    const parsed = seedSchema.parse(seed);
    return {
      kind: 'lien-bang',
      cantons: parsed.cantons.map((canton) => ({ ...canton, menAbroad: 0 })),
      motion: { text: '', yes: 0, no: 0, resolved: true },
      passes: parsed.passes,
      contracts: [],
      youthsAbroad: parsed.youthsAbroad,
      youthsDead: 0,
      fratricides: 0,
      admitCandidates: parsed.admitCandidates,
      empireRelation: parsed.empireRelation,
    };
  },

  year(rng: Rng, context: MinigameContext): MinigameYear {
    const board = context.power.board;
    if (board.kind !== 'lien-bang') throw new Error('bảng sai thể loại cho Liên bang Núi');
    return swissYear(rng, board, context);
  },
};

const THEATRES = ['đồng bằng Lombardy', 'thung lũng sông Rhône', 'biên giới Burgundy', 'đất Đế quốc phía bắc'] as const;

function swissYear(rng: Rng, board: SwissBoard, context: MinigameContext): MinigameYear {
  const lines: string[] = [];
  const events: WorldEvent[] = [];
  const { power, year } = context;
  let next: SwissBoard = { ...board };
  let treasury = 0;
  let prestige = 0;
  let cohesion = 0;
  let stability = 0;

  // --- b) GIỮ ĐÈO -----------------------------------------------------------
  const tolls = next.passes.filter((pass) => pass.held).reduce((sum, pass) => sum + pass.tollPerYear, 0);
  treasury += tolls;
  const lostPass = next.passes.find((pass) => !pass.held);
  if (lostPass !== undefined && rng.int(1, 100) <= 22) {
    next = { ...next, passes: next.passes.map((pass) => (pass.id === lostPass.id ? { ...pass, held: true, garrison: 600 } : pass)) };
    lines.push(`Khối giáo lấy lại ${lostPass.name}. Trên núi thì kỵ sĩ quý tộc chỉ là mục tiêu đứng yên.`);
    prestige += 3;
  }

  // --- c) XUẤT KHẨU LÍNH ĐÁNH THUÊ ------------------------------------------
  const employers = context.powerIds.filter((id) => id !== power.id);
  const wantsMen = employers.filter((id) => context.relations.some((row) => row.atWar && (row.a === id || row.b === id)));
  const hiring = wantsMen.length > 0 ? wantsMen : employers;

  const seller = next.cantons.filter((canton) => canton.menForHire > 800)[rng.int(0, Math.max(0, next.cantons.length - 1))];
  const employer = hiring[rng.int(0, Math.max(0, hiring.length - 1))];
  if (seller !== undefined && employer !== undefined && rng.int(1, 100) <= 65) {
    const theatre = THEATRES[rng.int(0, THEATRES.length - 1)] ?? 'một chiến trường xa';
    const men = Math.min(seller.menForHire, 800 + rng.int(0, 1600));
    const signed = signContract(next, {
      id: `hd-${String(year)}-${seller.id}`,
      employer,
      cantonId: seller.id,
      men,
      payPerYear: Math.round(men * 0.06),
      yearsLeft: 2 + rng.int(0, 2),
      theatre,
    });
    next = signed.board;
    lines.push(signed.line);

    // ANH EM HỌ GIẾT NHAU VÌ TIỀN NGƯỜI LẠ. Sự kiện này phải làm rung chuyển
    // liên bang, nên nó đánh vào gắn kết chứ không chỉ vào một dòng nhật ký.
    if (signed.clash) {
      const dead = Math.round(men * 0.18);
      next = {
        ...next,
        fratricides: next.fratricides + 1,
        youthsDead: next.youthsDead + dead,
        cantons: next.cantons.map((canton) => ({ ...canton, mood: Math.max(0, canton.mood - 12) })),
      };
      cohesion -= 14;
      stability -= 8;
      lines.push(`Hai bang gặp nhau ở hai phía một trận tại ${theatre}. ${String(dead)} người không về.`);
      events.push(
        proclaim({
          powerId: power.id,
          kind: 'huynh-de-tuong-tan',
          targets: [],
          year,
          text: `Hai bang của ${powerName(power.id)} đánh nhau ở ${theatre} vì hai hợp đồng đối địch.`,
          headline: 'Anh em họ giết nhau vì tiền người lạ',
        }),
      );
    }
  }

  const contracts = next.contracts
    .map((contract) => ({ ...contract, yearsLeft: contract.yearsLeft - 1 }))
    .filter((contract) => contract.yearsLeft > 0);
  const pay = next.contracts.reduce((sum, contract) => sum + contract.payPerYear, 0);
  treasury += pay;

  // Người về, người không về. Tỷ lệ chết ở nước ngoài là cái giá thường trực.
  const returning = next.contracts.filter((contract) => contract.yearsLeft <= 1);
  let deadThisYear = 0;
  for (const contract of returning) {
    const dead = Math.round(contract.men * (0.08 + rng.int(0, 6) / 100));
    deadThisYear += dead;
    next = {
      ...next,
      cantons: next.cantons.map((canton) =>
        canton.id === contract.cantonId
          ? {
              ...canton,
              menAbroad: Math.max(0, canton.menAbroad - contract.men),
              menForHire: canton.menForHire + Math.max(0, contract.men - dead),
              mood: Math.max(0, canton.mood - dead / 120),
            }
          : canton,
      ),
    };
  }
  next = {
    ...next,
    contracts,
    youthsDead: next.youthsDead + deadThisYear,
    youthsAbroad: Math.max(0, next.cantons.reduce((sum, canton) => sum + canton.menAbroad, 0)),
  };
  if (deadThisYear > 0) lines.push(`${String(deadThisYear)} thanh niên chết ở nước ngoài năm nay.`);

  // --- a) HỘI ĐỒNG LIÊN BANG ------------------------------------------------
  if (!next.motion.resolved) {
    const vote = callMotion(next.cantons, '');
    next = { ...next, motion: { ...next.motion, yes: vote.yes, no: vote.no, resolved: true } };
    lines.push(
      vote.passed
        ? `Hội đồng đồng thuận: ${next.motion.text}.`
        : `Hội đồng không đồng thuận về "${next.motion.text}" — ${vote.holdouts.join(', ')} chống.`,
    );
  }

  // --- d) KẾT NẠP BANG MỚI --------------------------------------------------
  if (next.admitCandidates.length > 0 && rng.int(1, 100) <= 12) {
    const candidate = next.admitCandidates[rng.int(0, next.admitCandidates.length - 1)];
    if (candidate !== undefined) {
      const vote = callMotion(next.cantons, candidate.id);
      if (vote.passed) {
        next = {
          ...next,
          cantons: [
            ...next.cantons,
            {
              id: candidate.id,
              name: candidate.name,
              votes: candidate.votes,
              interest: candidate.interest,
              mood: 58,
              feudWith: '',
              menForHire: Math.round(candidate.strength * 40),
              menAbroad: 0,
            },
          ],
          admitCandidates: next.admitCandidates.filter((row) => row.id !== candidate.id),
        };
        lines.push(`${candidate.name} vào liên bang với ${String(candidate.votes)} phiếu. Cán cân hội đồng vừa đổi.`);
        events.push(internalEvent(power.id, year, `${powerName(power.id)} kết nạp ${candidate.name}.`));
        prestige += 4;
        cohesion -= candidate.votes * 3;
      }
    }
  }

  // --- e) KẺ THÙ THƯỜNG TRỰC ------------------------------------------------
  const empireRelation = Math.max(-100, Math.min(100, next.empireRelation + (context.atWar ? -6 : 1)));
  next = { ...next, empireRelation };
  if (empireRelation < -80) {
    lines.push('Đế quốc và các gia tộc quý tộc lại nói tới chuyện đòi quyền cai trị trên núi.');
  }

  // Tâm trạng bang trôi về giữa: không ai giận mãi, và không ai vui mãi.
  next = {
    ...next,
    cantons: next.cantons.map((canton) => ({ ...canton, mood: Math.round(canton.mood + (60 - canton.mood) * 0.06) })),
  };

  return {
    board: next,
    deltas: {
      treasury: Math.round(treasury),
      prestige: Math.round(prestige * 10) / 10,
      cohesion: Math.round(cohesion * 10) / 10,
      stability: Math.round(stability * 10) / 10,
      military: next.youthsAbroad > 8000 ? -2 : 1,
    },
    lines,
    events,
  };
}
