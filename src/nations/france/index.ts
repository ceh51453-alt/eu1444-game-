/**
 * VƯƠNG QUỐC FRANK — minigame TẬP QUYỀN (Phần 14 mục 2.6).
 * *Thể loại: thôn tính từng bước, quản lý bất mãn.*
 *
 * NGƯỢC HẲN ĐẾ QUỐC: ở đó quyền uy tự rơi và hoàng đế phải xin từng lá phiếu; ở
 * đây vương quyền mạnh dần và nuốt từng công quốc. Hai thế lực cạnh nhau trên bản
 * đồ mà đi ngược chiều nhau trên bàn cờ — đó là lý do cả hai cùng tồn tại trong
 * tám thể loại.
 *
 * BỐN CON ĐƯỜNG NUỐT, và chúng khác nhau ở TỐC ĐỘ và ở CÁI GIÁ:
 *
 *   luật pháp    chậm, rẻ, cần tòa tối cao       +6 bất mãn
 *   hôn nhân     rất chậm, tốn tiền              +4 bất mãn
 *   tuyệt tự     nhanh nhất, cần đúng thời điểm  +9 bất mãn
 *   chiến tranh  nhanh, rất đắt                  +18 bất mãn
 *
 * Mỗi lần nuốt: +đất trực thuộc, +BẤT MÃN QUÝ TỘC TOÀN QUỐC. Và bất mãn không nổ
 * lẻ tẻ — vượt ngưỡng là LIÊN MINH QUÝ TỘC NỔI DẬY, TẤT CẢ CÙNG LÚC. Đó là khác
 * biệt cơ học giữa phần này và hệ chư hầu của Phần 13: ở đây không có ai phản
 * trước ai, cả nước phản trong một mùa.
 */

import { z } from 'zod';
import type { Rng } from '@/core/rng';
import { powerName, powerRowOf } from '@/systems/nations/data';
import { internalEvent, proclaim } from '@/systems/nations/events';
import type { FranceBoard, MinigameContext, MinigameModule, MinigameYear, PowerBoard, WorldEvent } from '@/systems/nations/types';

const pathSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  years: z.number().int().min(1),
  cost: z.number().min(0),
  discontent: z.number(),
  check: z.string().min(1),
  difficulty: z.string().min(1),
  needsCourt: z.boolean().default(false),
  requiresHeirless: z.boolean().default(false),
});

const seedSchema = z.object({
  crownLand: z.number().min(0).default(4),
  vassalLand: z.number().min(0).default(8),
  discontent: z.number().min(0).max(100).default(20),
  revoltThreshold: z.number().min(0).max(100).default(70),
  duchies: z
    .array(
      z.object({
        id: z.string().min(1),
        name: z.string().min(1),
        strength: z.number().min(0).max(100),
        heirless: z.boolean().default(false),
        absorbed: z.boolean().default(false),
        claimStrength: z.number().min(0).max(100).default(0),
      }),
    )
    .default([]),
  paths: z.array(pathSchema).default([]),
});

export type AbsorbPath = z.infer<typeof pathSchema>;

/** Bốn con đường, đọc từ data — UI dựng nút từ đây chứ không hardcode. */
export function paths(): AbsorbPath[] {
  const row = powerRowOf('nation_frank');
  const parsed = z.object({ paths: z.array(pathSchema).default([]) }).safeParse(row?.board ?? {});
  return parsed.success ? parsed.data.paths : [];
}

/** Mở một vụ nuốt. Trả về bảng mới cùng khoản phải chi. */
export function pursue(board: FranceBoard, duchyId: string, pathId: string): { board: FranceBoard; cost: number; line: string } {
  const duchy = board.duchies.find((row) => row.id === duchyId);
  const path = paths().find((row) => row.id === pathId);
  if (duchy === undefined || path === undefined) return { board, cost: 0, line: 'Không có công quốc hoặc con đường ấy.' };
  if (duchy.absorbed) return { board, cost: 0, line: `${duchy.name} đã thuộc vương quyền rồi.` };
  if (path.requiresHeirless && !duchy.heirless) {
    return { board, cost: 0, line: `${duchy.name} vẫn có người thừa kế — đường tuyệt tự chưa mở.` };
  }
  if (board.suits.some((suit) => suit.duchyId === duchyId)) {
    return { board, cost: 0, line: `Đã có một vụ đang chạy với ${duchy.name}.` };
  }

  return {
    board: { ...board, suits: [...board.suits, { duchyId, pathId, yearsLeft: path.years, spent: path.cost }] },
    cost: path.cost,
    line: `Mở đường ${path.name.toLowerCase()} với ${duchy.name}: ${String(path.years)} năm.`,
  };
}

export const france: MinigameModule = {
  kind: 'tap-quyen',
  name: 'Tập quyền',

  create(seed): PowerBoard {
    const parsed = seedSchema.parse(seed);
    return {
      kind: 'tap-quyen',
      crownLand: parsed.crownLand,
      vassalLand: parsed.vassalLand,
      discontent: parsed.discontent,
      revoltThreshold: parsed.revoltThreshold,
      duchies: parsed.duchies.map((duchy) => ({ ...duchy, rebelling: false })),
      suits: [],
      nobleLeague: { formed: false, members: [], year: 0 },
    };
  },

  year(rng: Rng, context: MinigameContext): MinigameYear {
    const board = context.power.board;
    if (board.kind !== 'tap-quyen') throw new Error('bảng sai thể loại cho Vương quốc Frank');
    return franceYear(rng, board, context);
  },
};

function franceYear(rng: Rng, board: FranceBoard, context: MinigameContext): MinigameYear {
  const lines: string[] = [];
  const events: WorldEvent[] = [];
  const { power, year } = context;
  let next: FranceBoard = { ...board };
  let treasury = 0;
  let prestige = 0;
  let stability = 0;
  let cohesion = 0;

  // --- AI ĐANG KHÔNG CÓ CON THỪA KẾ -----------------------------------------
  // Bảng của thể loại này có một cột mà không thể loại nào khác có, và người chơi
  // giỏi sẽ đọc cột ấy trước mọi cột khác.
  const duchies = next.duchies.map((duchy) => {
    if (duchy.absorbed || duchy.heirless) return duchy;
    if (rng.int(1, 100) <= 3) {
      lines.push(`${duchy.name} vừa mất người thừa kế cuối cùng.`);
      return { ...duchy, heirless: true };
    }
    return duchy;
  });
  next = { ...next, duchies };

  // --- BỘ MÁY TỰ MỞ VỤ MỚI (khi người chơi không ở tầng 3) -------------------
  if (next.suits.length === 0 && next.discontent < next.revoltThreshold - 15) {
    const target = pickTarget(next, rng);
    if (target !== null) {
      const started = pursue(next, target.duchyId, target.pathId);
      next = started.board;
      treasury -= started.cost;
      if (started.line !== '') lines.push(started.line);
    }
  }

  // --- VỤ ĐANG CHẠY ---------------------------------------------------------
  const remaining: FranceBoard['suits'] = [];
  for (const suit of next.suits) {
    const yearsLeft = suit.yearsLeft - 1;
    if (yearsLeft > 0) {
      remaining.push({ ...suit, yearsLeft });
      continue;
    }

    const duchy = next.duchies.find((row) => row.id === suit.duchyId);
    const path = paths().find((row) => row.id === suit.pathId);
    if (duchy === undefined || path === undefined) continue;

    // Thắng hay không: yêu sách cộng sức vương quyền, trừ sức công quốc.
    const odds = 35 + duchy.claimStrength * 0.5 + power.prestige * 0.2 - duchy.strength * 0.5;
    if (rng.int(1, 100) <= Math.max(5, Math.min(95, odds))) {
      next = {
        ...next,
        duchies: next.duchies.map((row) => (row.id === duchy.id ? { ...row, absorbed: true } : row)),
        crownLand: next.crownLand + 1,
        vassalLand: Math.max(0, next.vassalLand - 1),
        discontent: Math.min(100, next.discontent + path.discontent),
      };
      prestige += 4;
      lines.push(`${duchy.name} về vương quyền bằng đường ${path.name.toLowerCase()}. Bất mãn quý tộc +${String(path.discontent)}.`);
      events.push(
        proclaim({
          powerId: power.id,
          kind: 'thon-tinh',
          targets: [],
          year,
          text: `${powerName(power.id)} thu ${duchy.name} về đất vương quyền.`,
          headline: `${duchy.name} về vương quyền`,
        }),
      );
    } else {
      next = { ...next, discontent: Math.min(100, next.discontent + path.discontent / 2) };
      lines.push(`Vụ ${path.name.toLowerCase()} với ${duchy.name} thất bại. Quý tộc nhớ là vương quyền đã thử.`);
      prestige -= 2;
    }
  }
  next = { ...next, suits: remaining };

  // --- BẤT MÃN VÀ LIÊN MINH QUÝ TỘC -----------------------------------------
  const cooling = next.discontent > 0 ? -1.4 : 0;
  next = { ...next, discontent: Math.max(0, Math.min(100, next.discontent + cooling)) };

  if (!next.nobleLeague.formed && next.discontent >= next.revoltThreshold) {
    const members = next.duchies.filter((duchy) => !duchy.absorbed).map((duchy) => duchy.id);
    next = {
      ...next,
      nobleLeague: { formed: true, members, year },
      duchies: next.duchies.map((duchy) => (duchy.absorbed ? duchy : { ...duchy, rebelling: true })),
    };
    stability -= 26;
    cohesion -= 20;
    lines.push(`LIÊN MINH QUÝ TỘC NỔI DẬY — ${String(members.length)} công quốc cùng lúc, không ai đi trước ai.`);
    events.push(
      proclaim({
        powerId: power.id,
        kind: 'lien-minh-quy-toc',
        targets: [],
        year,
        text: `Liên minh quý tộc nổi dậy chống ${powerName(power.id)}: ${String(members.length)} công quốc cùng cầm vũ khí.`,
        headline: 'Cả nước quý tộc phản cùng một mùa',
      }),
    );
  } else if (next.nobleLeague.formed) {
    // Dập được hay không: quân vương quyền so với tổng sức công quốc còn lại.
    const rebelStrength = next.duchies.filter((duchy) => duchy.rebelling).reduce((sum, duchy) => sum + duchy.strength, 0);
    const crown = power.military * 2.2 + power.prestige;
    if (crown > rebelStrength) {
      next = {
        ...next,
        nobleLeague: { formed: false, members: [], year: 0 },
        duchies: next.duchies.map((duchy) => ({ ...duchy, rebelling: false, strength: Math.max(0, duchy.strength - 8) })),
        discontent: Math.max(0, next.discontent - 25),
      };
      prestige += 8;
      stability += 10;
      lines.push('Cuộc nổi dậy bị dập. Mỗi công quốc yếu đi, và bất mãn lùi lại — lần này.');
      events.push(internalEvent(power.id, year, `${powerName(power.id)} dập được liên minh quý tộc.`));
    } else {
      treasury -= 180;
      stability -= 8;
      next = { ...next, crownLand: Math.max(0, next.crownLand - 0.5), vassalLand: next.vassalLand + 0.5 };
      lines.push('Liên minh quý tộc vẫn cầm cự. Vương quyền trả lại đất để mua thời gian.');
    }
  }

  return {
    board: next,
    deltas: {
      treasury: Math.round(treasury + next.crownLand * 24),
      income: Math.round((next.crownLand - board.crownLand) * 30),
      prestige: Math.round(prestige * 10) / 10,
      stability: Math.round((stability + (next.discontent > 50 ? -2 : 1)) * 10) / 10,
      cohesion: Math.round((cohesion + (next.nobleLeague.formed ? -4 : 1.5)) * 10) / 10,
      land: 0,
    },
    lines,
    events,
  };
}

/** Bộ máy chọn mục tiêu: ưu tiên công quốc tuyệt tự, rồi tới yêu sách mạnh nhất. */
function pickTarget(board: FranceBoard, rng: Rng): { duchyId: string; pathId: string } | null {
  const open = board.duchies.filter((duchy) => !duchy.absorbed);
  if (open.length === 0) return null;

  const heirless = open.find((duchy) => duchy.heirless);
  if (heirless !== undefined) return { duchyId: heirless.id, pathId: 'tuyet-tu' };

  const sorted = [...open].sort((left, right) => right.claimStrength - left.claimStrength);
  const target = sorted[0];
  if (target === undefined) return null;

  // Yêu sách mạnh thì ra tòa; yếu thì cưới; rất yếu mà giàu thì đánh.
  const pathId = target.claimStrength >= 60 ? 'phap-luat' : target.claimStrength >= 40 ? 'hon-nhan' : rng.int(1, 100) <= 35 ? 'chien-tranh' : 'hon-nhan';
  return { duchyId: target.id, pathId };
}
