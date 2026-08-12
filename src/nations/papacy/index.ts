/**
 * GIÁO TRIỀU — minigame MẬT NGHỊ & QUYỀN LỰC THIÊNG (Phần 14 mục 2.7).
 * *Thể loại: chính trị nội bộ cộng đòn bẩy lên toàn thế giới.*
 *
 * Thế lực duy nhất trong tám cái mà QUÂN ĐỘI gần như không có nghĩa lý gì, và
 * cũng là thế lực duy nhất chạm được vào bảy bảng còn lại mà không cần một người
 * lính nào. Vũ khí của nó là lời nói có hiệu lực pháp lý:
 *
 *   vạ tuyệt thông cá nhân     một người mất chỗ đứng
 *   CẤM CHẾ CẢ VƯƠNG QUỐC      đóng cửa mọi nhà thờ — chư hầu được CỞI LỜI THỀ
 *   kêu gọi thập tự chinh      cả châu lục phải trả lời
 *   phong thánh, phán xử       uy tín thành đòn bẩy
 *   bán ân xá                  tiền ngay, và dị giáo lớn lên vì chính chuyện đó
 *   lập tòa dị giáo            dập được, hoặc tạo ra người tử đạo
 *
 * MỌI TUYÊN BỐ ĐỀU PHÁT EVENT RA TOÀN THẾ GIỚI (mục 12) — đó là lý do file này
 * gọi `proclaim` nhiều hơn bảy file kia cộng lại.
 *
 * RỦI RO ĐẶC TRƯNG: uy tín xuống quá thấp thì một quốc gia lớn dựng lên GIÁO
 * HOÀNG THỨ HAI, và cả thế giới phải chọn phe. Đây là biến cố lớn nhất mà Phần 15
 * có thể sinh ra — nên khi nó xảy ra, dị giáo được đẩy một tiếng vọng sáu năm.
 */

import { z } from 'zod';
import type { Rng } from '@/core/rng';
import { powerName } from '@/systems/nations/data';
import { proclaim } from '@/systems/nations/events';
import type { MinigameContext, MinigameModule, MinigameYear, PapacyBoard, PowerBoard, WorldEvent } from '@/systems/nations/types';

const seedSchema = z.object({
  spiritualPrestige: z.number().min(0).max(100).default(60),
  vacancy: z.boolean().default(false),
  indulgenceYears: z.number().int().min(0).default(0),
  cardinals: z
    .array(
      z.object({
        id: z.string().min(1),
        name: z.string().min(1),
        faction: z.string().min(1),
        age: z.number().min(0),
        loyalty: z.number().min(0).max(100),
        influence: z.number().min(0).max(100),
        raceId: z.string().default(''),
      }),
    )
    .default([]),
  factions: z.array(z.object({ id: z.string().min(1), name: z.string().min(1), wants: z.string().default('') })).default([]),
  weapons: z.array(z.record(z.string(), z.unknown())).default([]),
  antipope: z
    .object({ exists: z.boolean().default(false), backer: z.string().default(''), sinceYear: z.number().int().default(0) })
    .default({ exists: false, backer: '', sinceYear: 0 }),
  interdicts: z.array(z.string()).default([]),
  excommunicated: z.array(z.string()).default([]),
});

/**
 * MẬT NGHỊ.
 *
 * Phe nào cộng lại nhiều ảnh hưởng nhất thì thắng — nhưng nếu hai phe đầu sát
 * nhau VÀ uy tín Giáo hội đã thấp thì mật nghị bế tắc, và bế tắc là cửa vào của
 * Giáo hoàng thứ hai. Chính vì thế "phong thêm hồng y phe mình TRƯỚC KHI CHẾT"
 * (mục 2.7) mới là nước đi quan trọng nhất của cả bảng này.
 */
export function conclave(board: PapacyBoard): { winner: string; deadlock: boolean; tally: { faction: string; weight: number }[] } {
  const weights = new Map<string, number>();
  for (const cardinal of board.cardinals) {
    weights.set(cardinal.faction, (weights.get(cardinal.faction) ?? 0) + cardinal.influence * (0.5 + cardinal.loyalty / 200));
  }
  const tally = [...weights.entries()]
    .map(([faction, weight]) => ({ faction, weight: Math.round(weight) }))
    .sort((left, right) => right.weight - left.weight);

  const first = tally[0];
  const second = tally[1];
  if (first === undefined) return { winner: '', deadlock: true, tally };
  const deadlock = second !== undefined && first.weight - second.weight < first.weight * 0.12;
  return { winner: first.faction, deadlock, tally };
}

/** Phong thêm hồng y phe mình. Nước đi này chỉ trả cổ tức sau khi người phong chết. */
export function appointCardinal(
  board: PapacyBoard,
  cardinal: { id: string; name: string; faction: string; age: number; raceId: string },
): { board: PapacyBoard; cost: number; line: string } {
  return {
    board: {
      ...board,
      cardinals: [
        ...board.cardinals,
        { ...cardinal, loyalty: 72, influence: 40, appointedBy: board.popeFaction },
      ],
    },
    cost: 80,
    line: `${cardinal.name} được phong hồng y. Một lá phiếu nữa cho phe ${cardinal.faction} ở mật nghị sau.`,
  };
}

export const papacy: MinigameModule = {
  kind: 'mat-nghi',
  name: 'Mật nghị & quyền lực thiêng',

  create(seed): PowerBoard {
    const parsed = seedSchema.parse(seed);
    const board: PapacyBoard = {
      kind: 'mat-nghi',
      spiritualPrestige: parsed.spiritualPrestige,
      cardinals: parsed.cardinals.map((cardinal) => ({ ...cardinal, appointedBy: '' })),
      vacancy: parsed.vacancy,
      lastConclaveYear: 0,
      popeFaction: '',
      excommunicated: parsed.excommunicated,
      interdicts: parsed.interdicts,
      crusadeTarget: '',
      indulgenceYears: parsed.indulgenceYears,
      antipope: parsed.antipope,
      heresyWatch: [],
    };
    const first = conclave(board);
    return { ...board, popeFaction: first.winner };
  },

  year(rng: Rng, context: MinigameContext): MinigameYear {
    const board = context.power.board;
    if (board.kind !== 'mat-nghi') throw new Error('bảng sai thể loại cho Giáo triều');
    return papacyYear(rng, board, context);
  },
};

function papacyYear(rng: Rng, board: PapacyBoard, context: MinigameContext): MinigameYear {
  const lines: string[] = [];
  const events: WorldEvent[] = [];
  const sanctionsIssued: NonNullable<MinigameYear['sanctionsIssued']> = [];
  const crisisTriggers: string[] = [];
  const { power, year } = context;
  let next: PapacyBoard = { ...board, heresyWatch: [...context.heresyAlarms] };
  let treasury = 0;
  let prestige = 0;
  let stability = 0;

  // --- HỒNG Y GIÀ ĐI, VÀ CHẾT ------------------------------------------------
  const survivors: PapacyBoard['cardinals'] = [];
  for (const cardinal of next.cardinals) {
    const aged = { ...cardinal, age: cardinal.age + 1 };
    // Thiên Duệ và Cao Tiên sống lâu hơn nhiều — một hồng y trường thọ là một lá
    // phiếu không bao giờ mất, và đó là lý do phe của họ luôn nặng cân.
    const longLived = aged.raceId === 'race_thien-due' || aged.raceId === 'race_cao-tien';
    const deathAge = longLived ? 320 : 78;
    if (aged.age > deathAge && rng.int(1, 100) <= 22) {
      lines.push(`${aged.name} qua đời.`);
      continue;
    }
    survivors.push(aged);
  }
  next = { ...next, cardinals: survivors };

  // Giáo hoàng chết → khuyết ngôi → MẬT NGHỊ.
  if (!next.vacancy && year - next.lastConclaveYear > 9 && rng.int(1, 100) <= 16) {
    next = { ...next, vacancy: true };
    lines.push('Giáo hoàng băng hà. Ngôi khuyết.');
  }

  if (next.vacancy) {
    const result = conclave(next);
    if (result.deadlock && next.spiritualPrestige < 45 && !next.antipope.exists) {
      // GIÁO HOÀNG THỨ HAI. Biến cố lớn nhất của cả phần.
      const backer = strongestOutsider(context);
      next = {
        ...next,
        antipope: { exists: true, backer, sinceYear: year },
        vacancy: false,
        lastConclaveYear: year,
        popeFaction: result.tally[0]?.faction ?? next.popeFaction,
        spiritualPrestige: Math.max(0, next.spiritualPrestige - 25),
      };
      crisisTriggers.push('hai-giao-hoang');
      prestige -= 20;
      stability -= 12;
      lines.push(`Mật nghị bế tắc. ${powerName(backer)} dựng lên một Giáo hoàng thứ hai, và cả thế giới phải chọn phe.`);
      events.push(
        proclaim({
          powerId: power.id,
          kind: 'hai-giao-hoang',
          targets: context.powerIds.filter((id) => id !== power.id),
          year,
          text: `Xuất hiện Giáo hoàng thứ hai do ${powerName(backer)} dựng lên. Cả châu lục phải chọn phe.`,
          headline: 'Hai Giáo hoàng',
        }),
      );
    } else if (result.winner !== '') {
      next = { ...next, vacancy: false, popeFaction: result.winner, lastConclaveYear: year };
      lines.push(`Mật nghị xong: phe ${result.winner} đưa được người của mình lên ngôi.`);
      events.push(
        proclaim({
          powerId: power.id,
          kind: 'mat-nghi',
          targets: [],
          year,
          text: `Mật nghị bầu xong Giáo hoàng mới — phe ${result.winner}.`,
          headline: 'Có Giáo hoàng mới',
        }),
      );
      prestige += 3;
    }
  }

  // --- UY TÍN THIÊNG LIÊNG ---------------------------------------------------
  let spiritual = next.spiritualPrestige;
  spiritual += next.antipope.exists ? -2.5 : 0.6;
  spiritual -= next.indulgenceYears > 0 ? 1.5 : 0;
  spiritual -= next.interdicts.length * 0.8;

  // --- VŨ KHÍ ----------------------------------------------------------------
  // Giáo triều chỉ ra tay khi có lý do: một thế lực quan hệ rất xấu, hoặc một thế
  // lực đang che chở dị giáo. Ra tay quá tay thì uy tín rơi, và uy tín rơi thì
  // vũ khí cùn — vòng phản hồi ấy giữ cho nó không thành một cái nút bấm miễn phí.
  const worst = worstRelation(context);
  const worstIsFlock = context.dominantFaiths[worst.id] === 'rel_giao-hoi';

  // KẺ NGOẠI ĐẠO KHÔNG SỢ VẠ. Cấm chế một đế quốc không theo đạo mình là đóng cửa
  // những nhà thờ không tồn tại; với họ Giáo hoàng chỉ có một thứ dùng được, và
  // nó tốn tiền chứ không tốn giấy.
  if (worst.id !== '' && worst.value < -60 && !worstIsFlock && next.crusadeTarget === '' && rng.int(1, 100) <= 12) {
    next = { ...next, crusadeTarget: worst.id };
    treasury -= 180;
    spiritual += 4;
    lines.push(`Kêu gọi thập tự chinh chống ${powerName(worst.id)}.`);
    events.push(
      proclaim({
        powerId: power.id,
        kind: 'thap-tu-chinh',
        targets: [worst.id],
        year,
        text: `Giáo hoàng kêu gọi thập tự chinh chống ${powerName(worst.id)}.`,
        headline: `Thập tự chinh chống ${powerName(worst.id)}`,
      }),
    );
  } else if (next.crusadeTarget !== '' && rng.int(1, 100) <= 35) {
    // Thập tự chinh nào rồi cũng tan, và cái giá của một cuộc tan là uy tín.
    const won = rng.int(1, 100) <= 35;
    spiritual += won ? 8 : -12;
    lines.push(won ? `Thập tự chinh chống ${powerName(next.crusadeTarget)} thắng một trận lớn.` : `Thập tự chinh tan rã ở dọc đường.`);
    next = { ...next, crusadeTarget: '' };
  }

  if (worst.id !== '' && worst.value < -55 && worstIsFlock && !next.excommunicated.includes(worst.id) && rng.int(1, 100) <= 22) {
    const heavy = worst.value < -75 && spiritual > 55;
    next = heavy
      ? { ...next, interdicts: [...next.interdicts, worst.id], excommunicated: [...next.excommunicated, worst.id] }
      : { ...next, excommunicated: [...next.excommunicated, worst.id] };
    sanctionsIssued.push({ targetId: worst.id, kind: heavy ? 'cam-che' : 'va-tuyet-thong' });
    spiritual -= heavy ? 12 : 4;
    lines.push(
      heavy
        ? `CẤM CHẾ cả ${powerName(worst.id)}: mọi nhà thờ đóng cửa, chư hầu ở đó được cởi lời thề.`
        : `Vạ tuyệt thông người cai trị ${powerName(worst.id)}.`,
    );
    events.push(
      proclaim({
        powerId: power.id,
        kind: heavy ? 'cam-che' : 'va-tuyet-thong',
        targets: [worst.id],
        year,
        text: heavy
          ? `Giáo hoàng ra lệnh cấm chế toàn ${powerName(worst.id)} — chư hầu của họ được cởi lời thề trung thành.`
          : `Giáo hoàng ra vạ tuyệt thông với người cai trị ${powerName(worst.id)}.`,
        headline: heavy ? `Cấm chế toàn ${powerName(worst.id)}` : `Vạ tuyệt thông ${powerName(worst.id)}`,
      }),
    );
  }

  // Gỡ vạ khi quan hệ đã nguôi: một lệnh vạ giữ mãi là một lệnh vạ hết thiêng.
  const forgiven = next.excommunicated.filter((id) => (relationTo(context, id) ?? -100) > -30);
  if (forgiven.length > 0) {
    next = {
      ...next,
      excommunicated: next.excommunicated.filter((id) => !forgiven.includes(id)),
      interdicts: next.interdicts.filter((id) => !forgiven.includes(id)),
    };
    lines.push(`Gỡ vạ cho ${forgiven.map((id) => powerName(id)).join(', ')}.`);
    spiritual += 2;
  }

  // --- BÁN ÂN XÁ -------------------------------------------------------------
  // Ngân khố cạn thì bán ân xá, và bán ân xá là cách chắc chắn nhất để nuôi dị
  // giáo. Đây là vòng lặp trung tâm của cả thể loại này.
  let indulgenceYears = next.indulgenceYears;
  if (power.treasury < 200) {
    treasury += 260;
    spiritual -= 7;
    indulgenceYears += 1;
    crisisTriggers.push('ban-an-xa');
    lines.push('Ngân khố cạn — Giáo triều bán ân xá. Ở phương bắc người ta bắt đầu chép lại những bài giảng khó nghe.');
  } else if (indulgenceYears > 0) {
    indulgenceYears -= 1;
  }

  // --- DỊ GIÁO ---------------------------------------------------------------
  let heresyResponse: MinigameYear['heresyResponse'];
  const worstAlarm = [...context.heresyAlarms].sort((left, right) => right.share - left.share)[0];
  if (worstAlarm !== undefined) {
    const responseId =
      worstAlarm.share > 0.4 && spiritual > 50
        ? 'thap-tu-noi-bo'
        : worstAlarm.share > 0.28
          ? 'toa-di-giao'
          : spiritual > 55 && power.treasury > 300
            ? 'cai-cach'
            : 'giang-dao';
    heresyResponse = { areaId: worstAlarm.areaId, responseId };
    lines.push(`Giáo hội đáp lại dị giáo ở ${worstAlarm.areaId} (${(worstAlarm.share * 100).toFixed(0)}%).`);
  }

  next = {
    ...next,
    spiritualPrestige: Math.max(0, Math.min(100, Math.round(spiritual * 10) / 10)),
    indulgenceYears,
  };

  return {
    board: next,
    deltas: {
      // NGÂN KHỐ GIÁO TRIỀU LUÔN THIẾU, và đó là động cơ của cả thể loại này.
      // Thu từ thập phân chỉ là một phần nhỏ của thu nhập danh nghĩa, còn chi thì
      // đếm được: mỗi hồng y là một triều đình nhỏ, mỗi lệnh cấm chế là một đoàn
      // sứ giả phải nuôi. Trừ ra âm đều đặn nghĩa là sớm muộn cũng phải bán ân xá —
      // và bán ân xá là thứ nuôi dị giáo (mục 5). Vòng lặp ấy là minigame này.
      treasury: Math.round(treasury + power.income * 0.15 - next.cardinals.length * 11 - next.interdicts.length * 15),
      prestige: Math.round((prestige + (next.spiritualPrestige - power.prestige) * 0.25) * 10) / 10,
      stability: Math.round(stability * 10) / 10,
      cohesion: next.antipope.exists ? -4 : 1,
    },
    lines,
    events,
    ...(heresyResponse === undefined ? {} : { heresyResponse }),
    ...(sanctionsIssued.length > 0 ? { sanctionsIssued } : {}),
    // Bán ân xá nuôi dị giáo, và hai Giáo hoàng nuôi nó mạnh hơn mọi thứ khác.
    ...(crisisTriggers.length > 0 ? { crisisTriggers } : {}),
  };
}

function relationTo(context: MinigameContext, other: string): number | null {
  const row = context.relations.find(
    (entry) => (entry.a === context.power.id && entry.b === other) || (entry.b === context.power.id && entry.a === other),
  );
  return row?.value ?? null;
}

function worstRelation(context: MinigameContext): { id: string; value: number } {
  let worst = { id: '', value: 0 };
  for (const id of context.powerIds) {
    if (id === context.power.id) continue;
    const value = relationTo(context, id);
    if (value !== null && value < worst.value) worst = { id, value };
  }
  return worst;
}

/** Ai dựng nổi một Giáo hoàng thứ hai: kẻ mạnh nhất đang bất hòa với La Mã. */
function strongestOutsider(context: MinigameContext): string {
  let best = '';
  let bestScore = -Infinity;
  for (const id of context.powerIds) {
    if (id === context.power.id) continue;
    const relation = relationTo(context, id) ?? 0;
    const score = -relation + (id === 'nation_frank' ? 25 : 0);
    if (score > bestScore) {
      bestScore = score;
      best = id;
    }
  }
  return best;
}
