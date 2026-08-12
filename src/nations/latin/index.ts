/**
 * THÀNH BANG LATIN — minigame NGÂN HÀNG & LÍNH ĐÁNH THUÊ (Phần 14 mục 2.8).
 * *Thể loại: quản lý tài chính và rủi ro.*
 *
 * Thế lực duy nhất mà bảng trạng thái là một SỔ CÁI. Không có phiếu bầu đế chế,
 * không có quân đoàn, không có hồng y — có bốn cột: cho ai vay, lãi bao nhiêu,
 * còn mấy năm, và xác suất mất trắng.
 *
 * BA RỦI RO, và cả ba đều là mặt trái của chính nguồn lợi:
 *
 *  1. **VUA QUỴT ĐƯỢC VÀ KHÔNG AI ĐÒI NỔI.** Cho vay lãi cao thì lời to, nhưng
 *     người vay càng túng thì lãi càng cao mà khả năng trả càng thấp — và không
 *     có tòa nào xử được một ông vua.
 *  2. **KHÔNG NUÔI QUÂN THƯỜNG TRỰC.** Thuê condottieri, và lính đánh thuê không
 *     được trả có thể quay sang TỐNG TIỀN CHÍNH MÌNH.
 *  3. **BẦU CỬ CÓ NHIỆM KỲ.** Mất ghế là mất tất cả, nên phải mua phiếu — và tiền
 *     mua phiếu là tiền không cho vay được.
 */

import { z } from 'zod';
import type { Rng } from '@/core/rng';
import { powerName } from '@/systems/nations/data';
import { internalEvent, proclaim } from '@/systems/nations/events';
import type { LatinBoard, MinigameContext, MinigameModule, MinigameYear, PowerBoard, WorldEvent } from '@/systems/nations/types';

const seedSchema = z.object({
  termYears: z.number().int().min(1).default(4),
  yearsLeftInTerm: z.number().int().min(0).default(4),
  councilSupport: z.number().min(0).max(100).default(52),
  grainPrice: z.number().min(0).default(100),
  creditRating: z.number().min(0).max(100).default(75),
  loans: z
    .array(
      z.object({
        id: z.string().min(1),
        debtor: z.string().min(1),
        principal: z.number().min(0),
        rate: z.number().min(0),
        yearsLeft: z.number().int().min(0),
        defaultRisk: z.number().min(0).max(100),
      }),
    )
    .default([]),
  condottieri: z
    .array(
      z.object({
        id: z.string().min(1),
        name: z.string().min(1),
        men: z.number().min(0),
        payPerYear: z.number().min(0),
        yearsLeft: z.number().int().min(0),
        mood: z.number().min(0).max(100),
        unpaidYears: z.number().int().min(0).default(0),
      }),
    )
    .default([]),
  routes: z
    .array(z.object({ id: z.string().min(1), name: z.string().min(1), income: z.number().min(0), monopoly: z.boolean().default(false) }))
    .default([]),
  councilFactions: z
    .array(z.object({ id: z.string().min(1), name: z.string().min(1), seats: z.number().int().min(0), wants: z.string().default('') }))
    .default([]),
});

/**
 * XÁC SUẤT VỠ NỢ của một khoản.
 *
 * Ba vế: con nợ đang khoẻ tới đâu, khoản vay to tới đâu so với thu nhập của họ,
 * và lãi có đang cao tới mức chính nó đẩy họ vào chỗ không trả nổi không. Vế thứ
 * ba là chỗ người chơi tự bẫy mình: cho vay lãi 22% cho một đế quốc đang hấp hối
 * trông rất lời trên sổ.
 */
export function defaultRiskOf(loan: { principal: number; rate: number }, debtor: { income: number; stability: number; prestige: number } | null): number {
  if (debtor === null) return 60;
  const burden = (loan.principal * (1 + loan.rate)) / Math.max(60, debtor.income);
  return Math.max(2, Math.min(95, Math.round(burden * 26 + (60 - debtor.stability) * 0.5 + loan.rate * 60 - debtor.prestige * 0.15)));
}

/** Cho vay. Lãi do người chơi đặt, và nó là quyết định trung tâm của bảng này. */
export function lend(
  board: LatinBoard,
  loan: { id: string; debtor: string; principal: number; rate: number; years: number },
  risk: number,
): { board: LatinBoard; outflow: number; line: string } {
  return {
    board: {
      ...board,
      loans: [
        ...board.loans,
        { id: loan.id, debtor: loan.debtor, principal: loan.principal, rate: loan.rate, yearsLeft: loan.years, defaultRisk: risk, defaulted: false },
      ],
    },
    outflow: loan.principal,
    line: `Cho ${powerName(loan.debtor)} vay ${String(loan.principal)} với lãi ${(loan.rate * 100).toFixed(0)}% — rủi ro vỡ nợ ${String(risk)}%.`,
  };
}

/** Mua phiếu hội đồng. Tiền mua phiếu là tiền không cho vay được. */
export function buyVotes(board: LatinBoard, spend: number): { board: LatinBoard; line: string } {
  const gain = Math.min(25, spend / 24);
  return {
    board: { ...board, councilSupport: Math.min(100, board.councilSupport + gain), bribeSpent: board.bribeSpent + spend },
    line: `Chi ${String(spend)} mua phiếu: ủng hộ trong hội đồng +${gain.toFixed(1)}.`,
  };
}

export const latin: MinigameModule = {
  kind: 'ngan-hang',
  name: 'Ngân hàng & lính đánh thuê',

  create(seed): PowerBoard {
    const parsed = seedSchema.parse(seed);
    return {
      kind: 'ngan-hang',
      loans: parsed.loans.map((loan) => ({ ...loan, defaulted: false })),
      condottieri: parsed.condottieri.map((band) => ({ ...band, extorting: false })),
      routes: parsed.routes,
      grainPrice: parsed.grainPrice,
      creditRating: parsed.creditRating,
      seat: true,
      termYears: parsed.termYears,
      yearsLeftInTerm: parsed.yearsLeftInTerm,
      councilSupport: parsed.councilSupport,
      bribeSpent: 0,
      councilFactions: parsed.councilFactions,
    };
  },

  year(rng: Rng, context: MinigameContext): MinigameYear {
    const board = context.power.board;
    if (board.kind !== 'ngan-hang') throw new Error('bảng sai thể loại cho Thành bang Latin');
    return latinYear(rng, board, context);
  },
};

function latinYear(rng: Rng, board: LatinBoard, context: MinigameContext): MinigameYear {
  const lines: string[] = [];
  const events: WorldEvent[] = [];
  const { power, year } = context;
  let treasury = 0;
  let prestige = 0;
  let stability = 0;
  let next: LatinBoard = { ...board };

  // --- SỔ CÁI ---------------------------------------------------------------
  const loans: LatinBoard['loans'] = [];
  for (const loan of next.loans) {
    // KHOẢN ĐÃ QUỴT VẪN NẰM TRONG SỔ. Đây không phải kế toán, đây là TRÍ NHỚ: một
    // ông vua quỵt rồi thì mười hai năm sau nhà băng mới lại nói chuyện với ông
    // ta, và trong mười hai năm ấy ông ta phải đi vay chỗ khác — hoặc không vay
    // được. Xóa nó ngay là năm sau lại cho chính người ấy vay tiếp.
    if (loan.defaulted) {
      const forgetIn = loan.yearsLeft - 1;
      if (forgetIn > 0) loans.push({ ...loan, yearsLeft: forgetIn });
      continue;
    }

    // Con nợ đang đánh nhau là con nợ sắp quỵt. Chiến tranh vừa là lý do họ vay
    // vừa là lý do họ không trả.
    const atWar = context.relations.some((row) => row.atWar && (row.a === loan.debtor || row.b === loan.debtor));
    const risk = Math.min(95, loan.defaultRisk + (atWar ? 6 : -1.5));

    if (rng.int(1, 100) <= risk) {
      treasury -= loan.principal * 0.35;
      prestige -= 3;
      next = { ...next, creditRating: Math.max(0, next.creditRating - 6) };
      lines.push(`${powerName(loan.debtor)} QUỴT khoản ${String(loan.principal)}. Không tòa nào xử được một ông vua.`);
      events.push(
        proclaim({
          powerId: power.id,
          kind: 'vo-no',
          targets: [loan.debtor],
          year,
          text: `${powerName(loan.debtor)} vỡ nợ với ${powerName(power.id)}.`,
          headline: `${powerName(loan.debtor)} quỵt nợ`,
        }),
      );
      loans.push({ ...loan, defaulted: true, yearsLeft: 12, defaultRisk: risk });
      continue;
    }

    const interest = loan.principal * loan.rate;
    treasury += interest;
    const yearsLeft = loan.yearsLeft - 1;
    if (yearsLeft <= 0) {
      treasury += loan.principal;
      lines.push(`${powerName(loan.debtor)} trả xong khoản ${String(loan.principal)}.`);
      continue;
    }
    loans.push({ ...loan, yearsLeft, defaultRisk: risk });
  }
  next = { ...next, loans };

  // Ai đang đánh nhau thì cần tiền, và họ tới đây. Lãi cao đúng bằng mức tuyệt vọng.
  const borrower = context.powerIds.find(
    (id) => id !== power.id && context.relations.some((row) => row.atWar && (row.a === id || row.b === id)) && !next.loans.some((loan) => loan.debtor === id),
  );
  if (borrower !== undefined && power.treasury > 400) {
    const principal = 200 + rng.int(0, 300);
    const rate = 0.1 + rng.int(0, 14) / 100;
    // Rủi ro tính MỖI NĂM, nên nó phải nhỏ: 4–16%/năm trên một khoản tám năm là
    // xác suất mất trắng khoảng một phần ba — đúng mức khiến cho vay vua vẫn là
    // một nghề, và vẫn là một nghề đáng sợ.
    const issued = lend(
      next,
      { id: `vay-${borrower}-${String(year)}`, debtor: borrower, principal, rate, years: 5 + rng.int(0, 4) },
      4 + rng.int(0, 12),
    );
    next = issued.board;
    treasury -= issued.outflow;
    lines.push(issued.line);
  }

  // --- CONDOTTIERI ----------------------------------------------------------
  const bands: LatinBoard['condottieri'] = [];
  for (const band of next.condottieri) {
    const affordable = power.treasury + treasury > band.payPerYear;
    if (affordable) {
      treasury -= band.payPerYear;
      bands.push({ ...band, mood: Math.min(100, band.mood + 4), unpaidYears: 0, extorting: false, yearsLeft: Math.max(0, band.yearsLeft - 1) });
      continue;
    }

    const unpaidYears = band.unpaidYears + 1;
    const mood = Math.max(0, band.mood - 18);
    if (unpaidYears >= 2 && !band.extorting) {
      treasury -= band.payPerYear * 2.5;
      stability -= 12;
      lines.push(`${band.name} không được trả hai năm — họ đóng quân trước cổng thành và đòi gấp đôi.`);
      events.push(internalEvent(power.id, year, `${band.name} tống tiền chính ${powerName(power.id)}.`));
      bands.push({ ...band, mood, unpaidYears, extorting: true, yearsLeft: band.yearsLeft });
      continue;
    }
    bands.push({ ...band, mood, unpaidYears, yearsLeft: band.yearsLeft });
  }
  next = { ...next, condottieri: bands };

  // --- TUYẾN THƯƠNG MẠI VÀ GIÁ LƯƠNG THỰC -----------------------------------
  const trade = next.routes.reduce((sum, route) => sum + route.income * (route.monopoly ? 1.2 : 0.9), 0);
  treasury += trade;
  const grainPrice = Math.max(60, Math.min(220, next.grainPrice + rng.int(-6, 8)));
  next = { ...next, grainPrice };
  if (grainPrice > 170) {
    lines.push(`Giá lương thực lên ${String(grainPrice)} — thành bang lời to, và cả châu lục đói.`);
  }

  // --- BẦU CỬ CÓ NHIỆM KỲ ---------------------------------------------------
  const yearsLeftInTerm = next.yearsLeftInTerm - 1;
  if (yearsLeftInTerm <= 0) {
    const support = next.councilSupport + (treasury > 0 ? 6 : -10) + (next.loans.some((loan) => loan.defaulted) ? -12 : 4);
    const kept = support >= 50;
    next = {
      ...next,
      seat: kept,
      yearsLeftInTerm: next.termYears,
      councilSupport: Math.max(0, Math.min(100, support)),
      bribeSpent: 0,
    };
    lines.push(
      kept
        ? `Bầu lại: giữ được ghế với ${String(Math.round(next.councilSupport))}% ủng hộ.`
        : 'MẤT GHẾ. Ở thành bang này mất ghế là mất tất cả — sổ cái sang tay người khác.',
    );
    if (!kept) {
      prestige -= 10;
      events.push(internalEvent(power.id, year, `Hội đồng ${powerName(power.id)} thay người đứng đầu.`));
    }
  } else {
    next = { ...next, yearsLeftInTerm };
  }

  return {
    board: next,
    deltas: {
      treasury: Math.round(treasury),
      income: Math.round((next.creditRating - 75) / 12),
      prestige: Math.round(prestige * 10) / 10,
      stability: Math.round(stability * 10) / 10,
      cohesion: next.seat ? 1 : -6,
      military: next.condottieri.some((band) => band.extorting) ? -4 : 0,
    },
    lines,
    events,
  };
}
