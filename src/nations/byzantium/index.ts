/**
 * ĐẾ QUỐC ĐÔNG LA MÃ — minigame NỘI CHIẾN & CẦU VIỆN (Phần 14 mục 2.2).
 * *Thể loại: mọi lựa chọn cứu vãn đều đẩy nhanh sự sụp đổ.*
 *
 * Đế quốc cổ nhất, từng bá chủ, nay chỉ còn kinh đô và vài mảnh đất rời rạc. Cao
 * Tiên hợp vai này gần như hoàn hảo: sống lâu tới mức chính người đang cai trị
 * VẪN CÒN NHỚ thời hoàng kim. Đó là bi kịch cốt lõi, và nó có mặt trong cơ chế
 * chứ không chỉ trong lời kể — `conservatism` là một HÀM CỦA TUỔI trung bình hội
 * đồng, nên tuổi thọ của tộc này chính là thứ cản đường cải cách.
 *
 * BA CÁI BẪY, và cả ba đều là lối thoát trông rất hợp lý:
 *
 *   thắng nội chiến  → phải thuê quân ngoài → bên được thuê Ở LẠI, và mất một mảnh đất
 *   cầu viện phương Tây → phải HỢP NHẤT GIÁO HỘI → dân trong nước gọi mình là kẻ phản đạo
 *   giành lại eo biển  → phải đánh thành bang → mất luôn nguồn vay tiền
 *
 * **KHÔNG CÓ ĐÁP ÁN ĐÚNG.** Điều kiện thắng không phải mở rộng mà là SỐNG SÓT lâu
 * hơn dự kiến và giữ được thứ gì đó truyền lại — nên `survivalYears` là con số
 * duy nhất ở bảng này đi lên.
 */

import { z } from 'zod';
import type { Rng } from '@/core/rng';
import { powerName } from '@/systems/nations/data';
import { internalEvent, proclaim } from '@/systems/nations/events';
import type { ByzantineBoard, MinigameContext, MinigameModule, MinigameYear, PowerBoard, WorldEvent } from '@/systems/nations/types';

const seedSchema = z.object({
  unionProgress: z.number().min(0).max(100).default(0),
  unionSigned: z.boolean().default(false),
  populaceAnger: z.number().min(0).max(100).default(0),
  straitsIncome: z.number().min(0).default(200),
  latinShare: z.number().min(0).max(1).default(0.6),
  councilAvgAge: z.number().min(0).default(300),
  conservatism: z.number().min(0).max(100).default(60),
  survivalYears: z.number().int().min(0).default(0),
  claimants: z
    .array(
      z.object({
        id: z.string().min(1),
        name: z.string().min(1),
        strength: z.number().min(0).max(100),
        backer: z.string().default(''),
        age: z.number().min(0).default(120),
      }),
    )
    .default([]),
  lands: z
    .array(z.object({ id: z.string().min(1), name: z.string().min(1), value: z.number().min(0), core: z.boolean().default(false) }))
    .default([]),
  hireable: z.array(z.string()).default([]),
});

/** Hội đồng trường sinh: hệ số bảo thủ TĂNG THEO tuổi trung bình (mục 2.2d). */
export function conservatismFor(averageAge: number): number {
  return Math.max(0, Math.min(100, Math.round(28 + Math.sqrt(Math.max(0, averageAge)) * 2.1)));
}

/** Cái giá của việc thắng: một mảnh đất trả công cho bên được thuê. */
export function payThePiper(board: ByzantineBoard, hiredPower: string): { board: ByzantineBoard; lost: string } {
  const payable = board.lands.filter((land) => !land.core && land.lostTo === '');
  const piece = payable[payable.length - 1];
  if (piece === undefined) {
    const core = board.lands.find((land) => land.core && land.lostTo === '');
    if (core === undefined) return { board, lost: '' };
    return {
      board: { ...board, lands: board.lands.map((land) => (land.id === core.id ? { ...land, lostTo: hiredPower } : land)) },
      lost: core.name,
    };
  }
  return {
    board: { ...board, lands: board.lands.map((land) => (land.id === piece.id ? { ...land, lostTo: hiredPower } : land)) },
    lost: piece.name,
  };
}

export const byzantium: MinigameModule = {
  kind: 'noi-chien',
  name: 'Nội chiến & cầu viện',

  create(seed): PowerBoard {
    const parsed = seedSchema.parse(seed);
    return {
      kind: 'noi-chien',
      claimants: parsed.claimants,
      civilWar: { active: false, years: 0, challengerId: '', hiredPower: '' },
      unionProgress: parsed.unionProgress,
      unionSigned: parsed.unionSigned,
      populaceAnger: parsed.populaceAnger,
      straitsIncome: parsed.straitsIncome,
      latinShare: parsed.latinShare,
      councilAvgAge: parsed.councilAvgAge,
      conservatism: conservatismFor(parsed.councilAvgAge),
      survivalYears: parsed.survivalYears,
      lands: parsed.lands.map((land) => ({ ...land, lostTo: '' })),
      landByDecade: [],
    };
  },

  year(rng: Rng, context: MinigameContext): MinigameYear {
    const board = context.power.board;
    if (board.kind !== 'noi-chien') throw new Error('bảng sai thể loại cho Đông La Mã');
    return byzantineYear(rng, board, context);
  },
};

function byzantineYear(rng: Rng, board: ByzantineBoard, context: MinigameContext): MinigameYear {
  const lines: string[] = [];
  const events: WorldEvent[] = [];
  const { power, year } = context;
  let next: ByzantineBoard = { ...board, survivalYears: board.survivalYears + 1 };
  let landDelta = 0;
  let prestige = 0;
  let stability = 0;
  let treasury = 0;

  // --- d) HỘI ĐỒNG TRƯỜNG SINH ---------------------------------------------
  // Các trưởng lão sống qua thời huy hoàng và từ chối cải cách vì "cách cũ từng
  // hiệu quả". Người chơi phải chống lại chính KÝ ỨC của tộc mình.
  next = {
    ...next,
    councilAvgAge: next.councilAvgAge + 1,
    conservatism: conservatismFor(next.councilAvgAge + 1),
  };
  const reformDrag = next.conservatism / 100;

  // --- c) THU NHẬP TỪ EO BIỂN ----------------------------------------------
  // Các thành bang Latin đã giành gần hết quyền thu, và họ có hạm đội. Phần của
  // họ NHÍCH LÊN mỗi năm nếu không ai chặn — và chặn thì mất nguồn vay.
  const latinShare = Math.min(0.95, next.latinShare + 0.012 * (1 + reformDrag));
  const collected = Math.round(next.straitsIncome * (1 - latinShare));
  treasury += collected;
  next = { ...next, latinShare };
  if (latinShare > 0.85) {
    lines.push(`Thành bang Latin thu ${(latinShare * 100).toFixed(0)}% thuế eo biển. Kinh đô sống bằng phần thừa của khách trọ.`);
  }

  // --- a) NỘI CHIẾN HOÀNG GIA ----------------------------------------------
  const claimants = next.claimants.map((claimant) => ({
    ...claimant,
    age: claimant.age + 1,
    strength: Math.max(0, Math.min(100, claimant.strength + rng.int(-2, 4) - (power.stability > 60 ? 2 : 0))),
  }));
  next = { ...next, claimants };

  if (!next.civilWar.active) {
    const rival = [...claimants].sort((left, right) => right.strength - left.strength)[0];
    // NỘI CHIẾN LÀ TRẠNG THÁI BÌNH THƯỜNG CỦA TRIỀU ĐÌNH NÀY, không phải một tai
    // nạn hiếm. Bốn nhánh hoàng tộc cùng có yêu sách hợp lệ và ai cũng biết ngôi
    // đang ngồi trên một đế quốc chỉ còn ba mảnh đất — nên xác suất phải đủ cao
    // để trong một đời người nó xảy ra ít nhất một lần. Nếu để nó hiếm thì cả cái
    // bẫy của mục 2.2a (thắng nội chiến bằng quân đi thuê, rồi mất đất trả công)
    // sẽ không bao giờ bật, và thế lực này chỉ còn là một thanh chỉ số tụt dần.
    const ready = rival !== undefined && rival.strength > 42 && power.cohesion < 65;
    if (ready && rng.int(1, 100) <= Math.round(rival.strength - power.cohesion / 2 + 20)) {
      next = { ...next, civilWar: { active: true, years: 0, challengerId: rival.id, hiredPower: '' } };
      lines.push(`${rival.name} nổi lên tranh ngôi. Nội chiến bắt đầu.`);
      events.push(internalEvent(power.id, year, `Nội chiến hoàng gia nổ ra ở ${powerName(power.id)}: ${rival.name} tranh ngôi.`));
      stability -= 12;
    }
  } else {
    const years = next.civilWar.years + 1;
    const rival = claimants.find((claimant) => claimant.id === next.civilWar.challengerId);
    const rivalStrength = rival?.strength ?? 40;

    // MUỐN THẮNG THÌ PHẢI THUÊ QUÂN NGOÀI. Và bên được thuê SẼ Ở LẠI.
    // Đây là cách đế quốc Orc lần đầu đặt chân sang bờ bên này — do chính một
    // hoàng đế Tiên mời sang (mục 2.2a).
    const canWinAlone = power.military > rivalStrength + 15;
    if (!canWinAlone && next.civilWar.hiredPower === '') {
      const hired = strongestNeighbour(context);
      if (hired !== '') {
        // Trả công bằng ĐẤT khi còn đất mà trả. Khi chỉ còn kinh đô thì trả bằng
        // thứ duy nhất còn lại: thêm một phần quyền thu thuế eo biển — nghĩa là
        // cùng một cái bẫy, chỉ đổi mặt hàng, và lần sau còn ít hơn nữa để trả.
        const canPayInLand = power.land > 1;
        const paid = canPayInLand
          ? payThePiper({ ...next, civilWar: { ...next.civilWar, hiredPower: hired } }, hired)
          : { board: next, lost: 'thêm một phần thuế eo biển' };
        next = {
          ...paid.board,
          civilWar: { ...next.civilWar, years, hiredPower: hired },
          ...(canPayInLand ? {} : { latinShare: Math.min(0.95, next.latinShare + 0.08) }),
        };
        landDelta -= canPayInLand ? 1 : 0;
        prestige -= 6;
        lines.push(`Triều đình thuê quân của ${powerName(hired)} để dập ${rival?.name ?? 'kẻ tranh ngôi'} — và trả công bằng ${paid.lost}.`);
        events.push(
          proclaim({
            powerId: power.id,
            kind: 'thue-quan-ngoai',
            targets: [hired],
            year,
            text: `${powerName(power.id)} thuê quân của ${powerName(hired)} để thắng nội chiến — và bên được thuê ở lại ${paid.lost}.`,
            headline: `${powerName(power.id)} mời quân ngoài vào nhà`,
          }),
        );
      }
    }

    const advantage = power.military + (next.civilWar.hiredPower === '' ? 0 : 35) - rivalStrength;
    if (years >= 2 && advantage > 10) {
      lines.push(`Nội chiến chấm dứt sau ${String(years)} năm. Ngôi giữ được, đế quốc nhỏ đi.`);
      next = {
        ...next,
        civilWar: { active: false, years: 0, challengerId: '', hiredPower: '' },
        claimants: next.claimants.filter((claimant) => claimant.id !== next.civilWar.challengerId),
      };
      stability += 6;
    } else {
      next = { ...next, civilWar: { ...next.civilWar, years } };
      stability -= 6;
      treasury -= 60;
    }
  }

  // --- b) CẦU VIỆN PHƯƠNG TÂY ----------------------------------------------
  // Giáo triều sẵn sàng kêu gọi cứu viện, với giá là HỢP NHẤT GIÁO HỘI. Ký thì
  // dân trong nước nổi loạn và gọi mình là kẻ phản đạo; không ký thì không có
  // viện binh. KHÔNG CÓ ĐÁP ÁN ĐÚNG.
  const pressed = power.land <= 2 || next.civilWar.active || context.atWar;
  if (!next.unionSigned && pressed) {
    const progress = Math.min(100, next.unionProgress + 6 + (context.churchPrestige > 60 ? 3 : 0));
    next = { ...next, unionProgress: progress };
    if (progress >= 100) {
      next = { ...next, unionSigned: true, populaceAnger: Math.min(100, next.populaceAnger + 28) };
      stability -= 14;
      prestige -= 4;
      lines.push('Hợp nhất giáo hội được ký. Viện binh có thể tới — và dân trong kinh đô gọi hoàng đế là kẻ phản đạo.');
      events.push(
        proclaim({
          powerId: power.id,
          kind: 'hop-nhat-giao-hoi',
          targets: ['nation_giao-trieu'],
          year,
          text: `${powerName(power.id)} ký hợp nhất giáo hội với Giáo triều.`,
          headline: 'Hai giáo hội hợp nhất trên giấy',
        }),
      );
    } else if (progress > 40 && progress % 20 < 7) {
      lines.push(`Đàm phán hợp nhất giáo hội đã đi được ${String(progress)}%. Ở kinh đô người ta bắt đầu bàn tán.`);
    }
  }

  if (next.unionSigned) {
    // Dân giận nguôi RẤT chậm, và trong lúc ấy mỗi năm là một năm mất ổn định.
    const anger = Math.max(0, next.populaceAnger - 1.2);
    next = { ...next, populaceAnger: anger };
    stability -= anger / 25;
  }

  // --- e) SỐNG SÓT ----------------------------------------------------------
  if (year % 10 === 0) {
    next = { ...next, landByDecade: [...next.landByDecade, { year, land: Math.max(0, power.land + landDelta) }] };
  }

  if (power.land + landDelta <= 0) {
    lines.push('Kinh đô thất thủ. Đế quốc cổ nhất châu lục ngừng tồn tại.');
    return {
      board: next,
      deltas: { treasury, prestige: prestige - 20, stability, land: landDelta },
      lines,
      events,
      fallen: true,
    };
  }

  return {
    board: next,
    deltas: {
      treasury: Math.round(treasury),
      prestige: Math.round((prestige - 0.6) * 10) / 10,
      stability: Math.round(stability * 10) / 10,
      cohesion: next.civilWar.active ? -5 : 1,
      land: landDelta,
      // Cải cách bị hội đồng chặn: thu nhập tụt dần theo hệ số bảo thủ.
      income: -Math.round(power.income * 0.006 * reformDrag),
    },
    lines,
    events,
  };
}

/** Thuê ai: kẻ mạnh nhất mà mình với tới được — và đó thường là kẻ nguy hiểm nhất. */
function strongestNeighbour(context: MinigameContext): string {
  const candidates = context.powerIds.filter((id) => id !== context.power.id);
  let best = '';
  let bestScore = -Infinity;
  for (const id of candidates) {
    const relation = context.relations.find(
      (row) => (row.a === id && row.b === context.power.id) || (row.b === id && row.a === context.power.id),
    );
    // Quan hệ xấu KHÔNG loại ai khỏi danh sách: lịch sử của phần này chính là
    // chuyện một hoàng đế mời kẻ thù vào nhà vì kẻ thù có quân.
    const score = (relation?.value ?? 0) * 0.2 + (id === 'nation_ottoman' ? 60 : 30);
    if (score > bestScore) {
      bestScore = score;
      best = id;
    }
  }
  return best;
}
