/**
 * ĐẾ QUỐC ORC — minigame MƯỜI TÁM QUÂN ĐOÀN & CHIÊU MỘ DỊ TỘC (Phần 14 mục 2.1).
 * *Thể loại: quản lý một cỗ máy quân sự và cân bằng phe phái trong nội bộ nó.*
 *
 * **BỎ HOÀN TOÀN HÌNH ẢNH BỘ LẠC.** Orc ở đây là thế lực có tổ chức chặt chẽ nhất
 * và kỹ thuật cao nhất trong thế giới: quân thường trực ăn lương và huấn luyện
 * quanh năm trong khi cả châu Âu còn dựa vào quân dịch chư hầu 40 ngày; dẫn đầu
 * về thuốc súng và công thành; quan lại chọn theo NĂNG LỰC, không theo dòng dõi.
 *
 * MỐI ĐE DỌA LỚN NHẤT KHÔNG PHẢI KẺ THÙ BÊN NGOÀI MÀ LÀ QUÂN ĐỘI CỦA CHÍNH MÌNH.
 * Cả năm gạch đầu dòng a–e của mục 2.1 chảy về đúng một chỗ: cỗ máy này không có
 * chế độ nghỉ. Ngừng bành trướng thì ngân sách mười tám quân đoàn không kham nổi,
 * lương chậm, và Tân Binh Đoàn phế truất người cai trị.
 */

import { z } from 'zod';
import type { Rng } from '@/core/rng';
import { corpsConfig, corpsRowOf, powerName } from '@/systems/nations/data';
import { internalEvent, proclaim } from '@/systems/nations/events';
import type { MinigameContext, MinigameModule, MinigameYear, OttomanBoard, PowerBoard, WorldEvent } from '@/systems/nations/types';
import { corpsYear, createCorps, militaryOf, totalPayroll } from './corps';
import { devshirmeYear } from './devshirme';
import { createTech, gunpowderQuality, suggestPriority, techYear } from './tech';

export { allocate, corpsYear, createCorps, militaryOf, mutinyRisk, payrollOf, setTilt, totalPayroll } from './corps';
export { devshirmeYear, eligibleRegions, guardComposition, levy, spare } from './devshirme';
export { academyFunded, createTech, gunpowderQuality, levelOf, siegeBattery, suggestPriority, techYear } from './tech';

const seedSchema = z.object({
  militaryBudget: z.number().min(0).max(1).default(0.6),
  religiousPolicy: z.enum(['khoan-dung', 'cuong-buc']).default('khoan-dung'),
  yearsSinceConquest: z.number().int().min(0).default(0),
  yearsOfArrears: z.number().int().min(0).default(0),
  devshirmeRegions: z
    .array(
      z.object({
        regionId: z.string().min(1),
        races: z.array(z.string()).default([]),
        resentment: z.number().min(0).max(100).default(0),
        intakeYears: z.number().int().default(0),
      }),
    )
    .default([]),
  conquestTargets: z.array(z.string()).default([]),
});

export const ottoman: MinigameModule = {
  kind: 'quan-doan',
  name: 'Mười tám quân đoàn & chiêu mộ dị tộc',

  create(seed): PowerBoard {
    const parsed = seedSchema.parse(seed);
    return {
      kind: 'quan-doan',
      militaryBudget: parsed.militaryBudget,
      corps: createCorps(),
      guardTilt: 0,
      arrearYears: parsed.yearsOfArrears,
      devshirme: parsed.devshirmeRegions.map((region) => ({
        regionId: region.regionId,
        races: region.races,
        resentment: region.resentment,
        intakeYears: region.intakeYears,
        revolted: false,
      })),
      tech: createTech(),
      religiousPolicy: parsed.religiousPolicy,
      assimilation: 0,
      yearsSinceConquest: parsed.yearsSinceConquest,
      deposed: false,
    };
  },

  year(rng: Rng, context: MinigameContext): MinigameYear {
    const board = context.power.board;
    if (board.kind !== 'quan-doan') throw new Error('bảng sai thể loại cho Đế quốc Orc');
    return ottomanYear(rng, board, context);
  },
};

function ottomanYear(rng: Rng, board: OttomanBoard, context: MinigameContext): MinigameYear {
  const config = corpsConfig();
  const lines: string[] = [];
  const events: WorldEvent[] = [];
  const { power, year } = context;

  // --- e) CHIẾN LỢI PHẨM: mỗi cuộc chinh phục nuôi cuộc chinh phục kế tiếp ----
  const conquered = context.campaignsWon > 0;
  const yearsSinceConquest = conquered ? 0 : board.yearsSinceConquest + 1;
  const plunder = Math.round(
    config.budget.expansionIncomePerConquest * Math.pow(config.budget.expansionDecayPerYear, yearsSinceConquest),
  );
  if (conquered) {
    lines.push(`Một cuộc chinh phục mới. Chiến lợi phẩm ${String(plunder)} chảy về, và mười tám quân đoàn được trả lương đúng hạn.`);
  } else if (yearsSinceConquest > config.budget.peaceYearsBeforeStrain) {
    lines.push(`${String(yearsSinceConquest)} năm không có cuộc chinh phục nào. Cỗ máy không có chế độ nghỉ, và nó bắt đầu đòi.`);
  }

  // --- a) MƯỜI TÁM QUÂN ĐOÀN ------------------------------------------------
  const budget = Math.max(0, (power.income + plunder) * board.militaryBudget);
  const corpsReport = corpsYear(rng, {
    corps: board.corps,
    budget,
    guardTilt: board.guardTilt,
    arrearYears: board.arrearYears,
    campaignsWon: context.campaignsWon,
    atWar: context.atWar,
    idleYears: yearsSinceConquest,
  });
  lines.push(...corpsReport.lines);

  // --- b) CHIÊU MỘ DỊ TỘC ---------------------------------------------------
  const devshirme = devshirmeYear(rng, board, corpsReport.corps);
  lines.push(...devshirme.lines);
  for (const regionId of devshirme.revolted) {
    events.push(internalEvent(power.id, year, `Vùng chiêu mộ ${regionId} nổi dậy chống ${powerName(power.id)}.`));
  }

  // --- c) CÂY KỸ THUẬT ------------------------------------------------------
  const researchBudget = Math.max(0, power.treasury * 0.12);
  const tech = techYear(board.tech, devshirme.corps, researchBudget, suggestPriority(board.tech));
  lines.push(...tech.lines);
  for (const done of tech.completed) {
    events.push(internalEvent(power.id, year, `${powerName(power.id)} hoàn tất một bậc kỹ thuật: ${done.effect}.`));
  }

  // --- d) CHÍNH SÁCH TÔN GIÁO ----------------------------------------------
  const policy = config.religiousPolicy.options.find((option) => option.id === board.religiousPolicy);
  let assimilation = board.assimilation;
  let stability = 0;
  if (policy !== undefined) {
    assimilation = Math.min(100, assimilation + policy.assimilationPerYear);
    stability -= policy.unrestPerYear * 0.5;
    if (policy.id === 'cuong-buc' && assimilation >= policy.permanentAtAssimilation) {
      lines.push('Vùng chinh phục đã đồng hóa xong — từ nay nó là của đế quốc vĩnh viễn.');
    }
  }

  // --- BINH BIẾN VÀ PHẾ TRUẤT ----------------------------------------------
  let fallen = false;
  if (corpsReport.mutinied.length > 0) {
    const names = corpsReport.mutinied.map((id) => corpsRowOf(id)?.name ?? id).join(', ');
    events.push(
      proclaim({
        powerId: power.id,
        kind: 'binh-bien',
        targets: [],
        year,
        text: `Binh biến trong quân đội ${powerName(power.id)}: ${names}.`,
        headline: `Binh biến ở ${powerName(power.id)}`,
      }),
    );
    stability -= 10 * corpsReport.mutinied.length;
  }
  if (corpsReport.deposedBy !== '') {
    fallen = true;
    events.push(
      proclaim({
        powerId: power.id,
        kind: 'phe-truat',
        targets: [],
        year,
        text: `${corpsRowOf(corpsReport.deposedBy)?.name ?? corpsReport.deposedBy} phế truất người cai trị ${powerName(power.id)}.`,
        headline: 'Cấm vệ phế truất người cai trị',
      }),
    );
  }

  const nextBoard: OttomanBoard = {
    ...board,
    corps: devshirme.corps,
    devshirme: devshirme.regions,
    tech: tech.tech,
    arrearYears: corpsReport.arrearYears,
    yearsSinceConquest,
    assimilation,
    deposed: board.deposed || fallen,
  };

  const payroll = totalPayroll(devshirme.corps);
  const spent = Math.min(budget, payroll) + tech.spent;

  return {
    board: nextBoard,
    deltas: {
      treasury: Math.round(plunder + power.income * (1 - board.militaryBudget) - spent),
      prestige: (conquered ? corpsConfig().expansion.prestigePerConquest : corpsConfig().expansion.prestigeLossPerIdleYear) - devshirme.churchCondemn * 0.05,
      stability: Math.round(stability * 10) / 10,
      military: Math.round((militaryOf(devshirme.corps) + gunpowderQuality(tech.tech) - power.military) * 0.5),
      cohesion: corpsReport.mutinied.length > 0 ? -6 : 1,
    },
    lines,
    events,
    ...(fallen ? { fallen: true } : {}),
  };
}
