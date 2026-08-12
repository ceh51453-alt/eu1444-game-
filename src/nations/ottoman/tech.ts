/**
 * CÂY KỸ THUẬT — Phần 14 mục 2.1c. **Chỉ Đế quốc Orc mới có.**
 *
 * Đây là lời hứa lớn nhất của thế lực này với phần còn lại của game, và nó phải
 * trả bằng số liệu thật ở những phần khác chứ không phải bằng một dòng mô tả:
 * mục 2.1 nói Orc phải là thế lực DUY NHẤT hạ được tường đá dày bằng bắn phá
 * trong vài tuần thay vì vài tháng (Phần 11), và bậc `tech_phao` chính là chỗ con
 * số ấy đến từ.
 *
 * HAI RÀNG BUỘC làm cho cây này không phải một thanh trượt:
 *
 *  1. **CẦN HỌC VIỆN KỸ XẢO (quân đoàn 18) CÒN ĐƯỢC CẤP NGÂN SÁCH.** Cắt ngân
 *     sách đoàn ấy để mua sự yên ổn cho Tân Binh Đoàn là cả bảy nhánh đứng lại —
 *     và trong ba năm đầu, không ai thấy gì cả.
 *  2. **TIẾN ĐỘ TÍNH BẰNG NĂM, KHÔNG BẰNG TIỀN.** Tiền chỉ mở được cửa; thời gian
 *     mới là thứ trả. Một người cai trị sống ngắn không bao giờ thấy hết cây này.
 */

import { techBranchOf, techConfig } from '@/systems/nations/data';
import type { CorpsState, OttomanBoard } from '@/systems/nations/types';

export interface TechYearReport {
  tech: OttomanBoard['tech'];
  spent: number;
  completed: { branchId: string; level: number; effect: string }[];
  lines: string[];
}

/** Cây lúc bắt đầu: bảy nhánh, tất cả ở bậc 0. */
export function createTech(): OttomanBoard['tech'] {
  return techConfig().branches.map((branch) => ({ branchId: branch.id, level: 0, progressYears: 0 }));
}

/** Học Viện Kỹ Xảo có còn đủ ngân sách để cả cây chạy không. */
export function academyFunded(corps: readonly CorpsState[]): boolean {
  const config = techConfig();
  const academy = corps.find((entry) => entry.id === config.requiresCorps);
  if (academy === undefined) return false;
  if (academy.mutinying) return false;
  const demand = 0.06;
  return academy.budgetShare >= demand * config.budgetFloor;
}

/**
 * MỘT NĂM nghiên cứu.
 *
 * `budget` là tiền ngân khố dành cho nghiên cứu năm nay. Chỉ MỘT nhánh tiến mỗi
 * năm — nhánh đang được ưu tiên — vì Học Viện chỉ có chín trăm người, và cho cả
 * bảy nhánh cùng tiến sẽ biến thế lực này thành một quốc gia hiện đại trong hai
 * chục năm.
 */
export function techYear(
  tech: OttomanBoard['tech'],
  corps: readonly CorpsState[],
  budget: number,
  priority: string,
): TechYearReport {
  const lines: string[] = [];
  const completed: { branchId: string; level: number; effect: string }[] = [];

  if (!academyFunded(corps)) {
    return { tech, spent: 0, completed, lines: ['Học Viện Kỹ Xảo không đủ ngân sách — cả bảy nhánh đứng lại.'] };
  }

  const target = tech.find((row) => row.branchId === priority) ?? tech.find((row) => row.level < (techBranchOf(row.branchId)?.levels ?? 0));
  if (target === undefined) return { tech, spent: 0, completed, lines: [] };

  const branch = techBranchOf(target.branchId);
  if (branch === null || target.level >= branch.levels) return { tech, spent: 0, completed, lines: [] };
  if (budget < branch.costPerLevel / branch.yearsPerLevel) {
    return { tech, spent: 0, completed, lines: [`Nhánh ${branch.name} thiếu tiền năm nay.`] };
  }

  const spent = Math.round(branch.costPerLevel / branch.yearsPerLevel);
  const progressYears = target.progressYears + 1;

  if (progressYears >= branch.yearsPerLevel) {
    const level = target.level + 1;
    completed.push({ branchId: branch.id, level, effect: branch.effect });
    lines.push(`${branch.name} lên bậc ${String(level)}: ${branch.effect}.`);
    return {
      tech: tech.map((row) => (row.branchId === branch.id ? { branchId: row.branchId, level, progressYears: 0 } : row)),
      spent,
      completed,
      lines,
    };
  }

  return {
    tech: tech.map((row) => (row.branchId === branch.id ? { ...row, progressYears } : row)),
    spent,
    completed,
    lines,
  };
}

/** Bậc hiện tại của một nhánh. Phần 10, 11, 16 tra bằng hàm này. */
export function levelOf(tech: readonly OttomanBoard['tech'][number][], branchId: string): number {
  return tech.find((row) => row.branchId === branchId)?.level ?? 0;
}

/**
 * HỆ SỐ BẮN PHÁ cho Phần 11.
 *
 * Đây là cái cửa duy nhất mà lời hứa "Orc là thế lực duy nhất hạ được tường đá
 * bằng pháo trong vài tuần" đi qua. Phần 11 nhân hệ số này vào tốc độ phá tường;
 * bậc 0 trả về 1, nghĩa là không có gì đặc biệt cả.
 */
export function siegeBattery(tech: readonly OttomanBoard['tech'][number][]): number {
  return 1 + levelOf(tech, 'tech_phao') * 0.22 + levelOf(tech, 'tech_cong-thanh') * 0.15;
}

/** Thưởng chất lượng cho quân đoàn hỏa khí — vế Phần 10 của cây này. */
export function gunpowderQuality(tech: readonly OttomanBoard['tech'][number][]): number {
  return levelOf(tech, 'tech_thuoc-sung') * 3 + levelOf(tech, 'tech_luyen-kim') * 1.5;
}

/** Nhánh nào nên ưu tiên nếu người chơi không chọn: cái rẻ nhất còn dở dang. */
export function suggestPriority(tech: readonly OttomanBoard['tech'][number][]): string {
  const unfinished = tech
    .map((row) => ({ row, branch: techBranchOf(row.branchId) }))
    .filter((entry) => entry.branch !== null && entry.row.level < entry.branch.levels);
  const cheapest = unfinished.sort(
    (left, right) => (left.branch?.costPerLevel ?? 0) - (right.branch?.costPerLevel ?? 0),
  )[0];
  return cheapest?.row.branchId ?? '';
}
