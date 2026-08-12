/**
 * DỰ ÁN CẤP VÙNG (mục 6).
 *
 * > "Dự án cấp vùng (KHÁC HẲN công trình cấp thành trì): đường, cầu, khai hoang,
 * > tháo nước đầm lầy, mở tuyến thương mại, lập chợ phiên, dựng đồn biên."
 *
 * Khác hẳn ở đâu? Ở chỗ chúng KHÔNG CÓ Ô ĐẤT NÀO. Một cái cầu ở tầng này không
 * nằm trên toạ độ nào, không chiếm ô nào, không cần kiến trúc sư đứng ở đó — nó
 * là một khoản chi và một khoảng thời gian, và khi xong thì cả TỈNH đổi số.
 *
 * Đơn vị thời gian ở đây là NĂM, không phải TUẦN. Đó là tín hiệu thị giác của Phụ
 * lục A mục 5: nhìn con số là biết đang đứng ở tầng nào. Công trường của Phần 12
 * đếm tuần; dự án vùng đếm năm.
 *
 * "CHỢ PHIÊN" ở đây là một QUYỀN ban cho cả vùng, khác hẳn cái CHỢ có mái nằm ở
 * một ô đất trong `data/buildings.json`. Hai thứ cùng tên, hai tầng — và đây đúng
 * là chỗ dễ lẫn nhất của cả phần.
 */

import type { Rng } from '@/core/rng';
import { runCheck } from '@/systems/check';
import type { GameState } from '@/state/slices';
import { allProjects, projectOf, roadLevels, type RealmProject } from './data';
import { provinceName } from './province';
import type { ActiveProject, Province } from './types';

export class RealmProjectError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RealmProjectError';
  }
}

export interface ProjectVerdict {
  ok: boolean;
  reason: string;
}

/**
 * Khởi công được không, và nếu không thì VÌ SAO.
 *
 * Sáu cửa chặn, tất cả đọc từ data: bậc tước, tiền, địa hình, bậc đường tối
 * thiểu, tỉnh biên giới, và "đã có rồi". Cửa cuối đáng nhắc: dựng cầu hai lần
 * không cho hai cây cầu, nó chỉ tiêu tiền hai lần.
 */
export function canStart(
  projectId: string,
  province: Province,
  rank: number,
  treasury: number,
  running: readonly ActiveProject[],
  isBorder = false,
): ProjectVerdict {
  const project = projectOf(projectId);
  if (project === null) return { ok: false, reason: `Không có dự án "${projectId}".` };

  if (rank < project.requiresRank) {
    return { ok: false, reason: `${project.name} đòi bậc ${String(project.requiresRank)} trở lên.` };
  }
  if (treasury < project.cost) {
    return { ok: false, reason: `${project.name} tốn ${String(project.cost)} đồng; kho còn ${String(Math.round(treasury))}.` };
  }
  if (project.requiresTerrain.length > 0 && !project.requiresTerrain.includes(province.terrain)) {
    return { ok: false, reason: `${project.name} không làm được trên địa hình này.` };
  }
  if (province.roads < project.requiresRoadLevel) {
    return { ok: false, reason: `${project.name} đòi đường ít nhất bậc ${String(project.requiresRoadLevel)}.` };
  }
  if (project.borderOnly && !isBorder) {
    return { ok: false, reason: `${project.name} chỉ dựng được ở tỉnh biên giới.` };
  }
  if (project.kind === 'infrastructure' && province.infrastructure.includes(project.key)) {
    return { ok: false, reason: `${provinceName(province)} đã có rồi.` };
  }
  if (project.kind === 'roads' && province.roads >= roadLevels().length - 1) {
    return { ok: false, reason: `Đường ở ${provinceName(province)} đã tới bậc cao nhất.` };
  }
  if (running.some((row) => row.projectId === projectId && row.provinceId === province.id)) {
    return { ok: false, reason: `${project.name} đang thi công ở đây rồi.` };
  }

  return { ok: true, reason: '' };
}

/** Dự án khởi công được ở một tỉnh, cho UI dựng danh sách. */
export function projectsAvailable(
  province: Province,
  rank: number,
  treasury: number,
  running: readonly ActiveProject[],
  isBorder = false,
): RealmProject[] {
  return allProjects().filter((project) => canStart(project.id, province, rank, treasury, running, isBorder).ok);
}

export function startProject(projectId: string, province: Province, year: number, index = 1): { project: ActiveProject; cost: number } {
  const project = projectOf(projectId);
  if (project === null) throw new RealmProjectError(`không có dự án "${projectId}"`);
  return {
    cost: project.cost,
    project: {
      id: `da_${String(year)}_${String(index)}`,
      projectId: project.id,
      provinceId: province.id,
      yearsLeft: project.years,
      spent: project.cost,
      startedYear: year,
      stalled: '',
    },
  };
}

export interface ProjectYearResult {
  running: ActiveProject[];
  /** Tỉnh đã nhận hệ quả của những dự án vừa xong. */
  provinces: Province[];
  lines: string[];
}

/**
 * MỘT NĂM CỦA MỌI DỰ ÁN.
 *
 * Chỉ tung xúc sắc LÚC HOÀN THÀNH, không tung mỗi năm — cùng lý do Phần 12 tung
 * một lần cho mỗi công trình: tung mỗi năm thì một dự án bốn năm chịu bốn lần rủi
 * ro, và không dự án dài nào còn đáng khởi công.
 */
export function advanceProjects(
  rng: Rng,
  running: readonly ActiveProject[],
  provinces: readonly Province[],
  options: { base: number; state?: GameState | null } = { base: 10 },
): ProjectYearResult {
  const result: ProjectYearResult = { running: [], provinces: [...provinces], lines: [] };

  for (const active of running) {
    const project = projectOf(active.projectId);
    if (project === null) continue;

    const yearsLeft = active.yearsLeft - 1;
    if (yearsLeft > 0) {
      result.running.push({ ...active, yearsLeft });
      continue;
    }

    const at = result.provinces.findIndex((province) => province.id === active.provinceId);
    const province = result.provinces[at];
    if (province === undefined) continue;

    const run = runCheck(rng, {
      id: 'check.du-an-vung',
      system: '3d6',
      domain: project.check,
      difficulty: project.difficulty,
      base: options.base,
      tags: ['cai-tri', 'du-an', project.kind],
      state: options.state ?? null,
    });

    // THẤT BẠI KHÔNG XÓA DỰ ÁN — nó kéo dài thêm một năm. Một con đường làm hỏng
    // thì người ta làm lại, không phải là con đường ấy biến mất khỏi bản đồ.
    if (run.result.tier === 'fail' || run.result.tier === 'critFail') {
      result.running.push({ ...active, yearsLeft: 1, stalled: 'phải làm lại một đoạn' });
      result.lines.push(`${project.name} ở ${provinceName(province)} hỏng một đoạn — thêm một năm nữa.`);
      continue;
    }

    const bonus = run.result.tier === 'critSuccess' ? 1.5 : 1;
    const updated: Province = {
      ...province,
      roads: Math.min(roadLevels().length - 1, province.roads + project.effects.roads),
      development: Math.max(0, Math.min(100, province.development + project.effects.development * bonus)),
      banditry: Math.max(0, Math.min(100, province.banditry + project.effects.banditry)),
      unrest: Math.max(0, Math.min(100, province.unrest + project.effects.unrest)),
      terrain: project.changesTerrainTo === '' ? province.terrain : project.changesTerrainTo,
      infrastructure:
        project.kind === 'infrastructure'
          ? [...new Set([...province.infrastructure, project.key])]
          : province.infrastructure,
    };

    result.provinces[at] = updated;
    result.lines.push(
      `${project.name} ở ${provinceName(province)} XONG${run.result.tier === 'critSuccess' ? ' — và làm tốt hơn cả hợp đồng' : ''}.`,
    );
  }

  return result;
}

/**
 * Số TUẦN ĐƯỜNG giữa hai tỉnh — con số Phần 12 nhận vào qua `Shipment.weeks`.
 *
 * Đây là toàn bộ chỗ mà "đường xá" của tầng vùng chạm tới tầng thành trì: một con
 * số. Không phải một con đường có toạ độ, không phải một danh sách trạm nghỉ.
 */
export function travelWeeks(from: Province, to: Province): number {
  const levels = roadLevels();
  const fromLevel = levels[Math.min(levels.length - 1, from.roads)];
  const toLevel = levels[Math.min(levels.length - 1, to.roads)];
  const perDay = ((fromLevel?.weeksPerDayRide ?? 1.6) + (toLevel?.weeksPerDayRide ?? 1.6)) / 2;
  const distance = (from.area + to.area) / 2;
  return Math.max(1, Math.round(distance * perDay));
}
