/**
 * CHIÊU MỘ DỊ TỘC — Phần 14 mục 2.1b.
 *
 * Cơ chế trung tâm của thế lực này, và cũng là chỗ "xen kẽ chủng tộc" của mục 3
 * hiện rõ nhất: lấy thiếu niên từ các vùng đã chinh phục, nuôi dạy từ nhỏ, cho ăn
 * học và huấn luyện, biến họ thành lực lượng tinh nhuệ nhất.
 *
 *   ĐƯỢC:  đội quân trung thành với CÁ NHÂN người cai trị, không dính gia tộc nào
 *   MẤT:   vùng bị chiêu mộ oán hận lâu dài, dễ nổi dậy, và Giáo hội lên án
 *
 * HỆ QUẢ THÚ VỊ, và nó là điểm cả cơ chế này tồn tại để tạo ra: **quân tinh nhuệ
 * của đế quốc Orc phần lớn KHÔNG PHẢI LÀ ORC.** Cao Tiên, Nhân tộc, Lùn đứng
 * trong hàng cấm vệ, và họ trung thành hơn bất kỳ quý tộc Orc nào.
 *
 * Đây cũng là nửa còn lại của câu trong mục 3: cùng một hệ thống thiểu số, Frank
 * dùng để truy bức, Orc dùng để biến thiểu số thành tầng lớp tinh nhuệ.
 */

import type { Rng } from '@/core/rng';
import { corpsConfig } from '@/systems/nations/data';
import type { CorpsState, OttomanBoard } from '@/systems/nations/types';

export interface DevshirmeYearReport {
  regions: OttomanBoard['devshirme'];
  corps: CorpsState[];
  /** Lời lên án cộng dồn của Giáo hội trong năm — tầng thế giới đổi ra quan hệ. */
  churchCondemn: number;
  revolted: string[];
  lines: string[];
}

/** Vùng nào còn chiêu mộ được: chưa nổi dậy và oán hận chưa vượt trần. */
export function eligibleRegions(board: OttomanBoard): OttomanBoard['devshirme'] {
  const config = corpsConfig().devshirme;
  return board.devshirme.filter((region) => !region.revolted && region.resentment < config.revoltResentmentAbove + 20);
}

/**
 * MỘT ĐỢT CHIÊU MỘ ở một vùng.
 *
 * Quân về ngay trong sổ, nhưng CHẤT LƯỢNG thì tám năm sau mới tới: `intakeYears`
 * đếm ngược chuyện ấy. Đây là lý do cắt chiêu mộ để mua sự yên ổn là một quyết
 * định mà người kế nhiệm mới phải trả giá.
 */
export function levy(board: OttomanBoard, regionId: string): { board: OttomanBoard; line: string } {
  const config = corpsConfig().devshirme;
  const region = board.devshirme.find((row) => row.regionId === regionId);
  if (region === undefined) return { board, line: `Không có vùng chiêu mộ nào tên "${regionId}".` };
  if (region.revolted) return { board, line: `${regionId} đang nổi dậy — không lấy được ai năm nay.` };

  return {
    board: {
      ...board,
      devshirme: board.devshirme.map((row) =>
        row.regionId === regionId
          ? { ...row, resentment: Math.min(100, row.resentment + config.resentmentPerLevy), intakeYears: row.intakeYears + 1 }
          : row,
      ),
    },
    line: `Lấy ${String(config.intakePerLevy)} thiếu niên ở ${regionId}. Oán hận vùng ấy tăng ${String(config.resentmentPerLevy)}.`,
  };
}

/**
 * MỘT NĂM của hệ chiêu mộ.
 *
 * Oán hận nguôi rất chậm (`resentmentDecayPerYear` chỉ 1,6/năm so với 9 mỗi đợt
 * lấy người) — nên một chính sách lấy người đều đặn sẽ dồn một vùng tới nổi dậy
 * trong khoảng một thập kỷ, và người chơi có đủ thời gian để thấy nó tới.
 */
export function devshirmeYear(rng: Rng, board: OttomanBoard, corps: readonly CorpsState[]): DevshirmeYearReport {
  const config = corpsConfig().devshirme;
  const lines: string[] = [];
  const revolted: string[] = [];
  let churchCondemn = 0;
  let intakeThisYear = 0;

  const regions = board.devshirme.map((region) => {
    if (region.revolted) {
      return { ...region, resentment: Math.min(100, region.resentment + 1) };
    }

    // Chính sách mặc định của bộ máy: vùng nào còn quy thuận thì năm nào cũng lấy.
    // Người chơi tầng 3 dừng được từng vùng bằng `levy`/`spare`.
    const taking = region.intakeYears >= 0 && region.resentment < config.revoltResentmentAbove;
    let resentment = region.resentment - config.resentmentDecayPerYear;
    let intakeYears = region.intakeYears;

    if (taking) {
      resentment += config.resentmentPerLevy;
      intakeYears += 1;
      intakeThisYear += config.intakePerLevy;
      churchCondemn += config.churchCondemnPerLevy;
    }

    resentment = Math.max(0, Math.min(100, resentment));

    if (resentment >= config.revoltResentmentAbove && rng.int(1, 100) <= resentment - config.revoltResentmentAbove + 10) {
      revolted.push(region.regionId);
      lines.push(`${region.regionId} nổi dậy — mười lăm năm lấy con người ta thì đến lúc người ta lấy lại.`);
      return { ...region, resentment, intakeYears, revolted: true };
    }

    return { ...region, resentment, intakeYears };
  });

  // Quân về hàng cấm vệ: chất lượng nhích lên và lòng trung với CÁ NHÂN người cai
  // trị được kéo về mức của data. Đây là chỗ cấm vệ khác mọi đội quân khác trong
  // game — họ không có gia tộc để mà nghiêng về.
  const guardShare = intakeThisYear / Math.max(1, config.intakePerLevy * Math.max(1, regions.length));
  const nextCorps = corps.map((entry) => {
    if (!entry.id.startsWith('corps_')) return entry;
    const isGuard = GUARD_IDS.has(entry.id);
    if (!isGuard || guardShare <= 0) return entry;
    return {
      ...entry,
      quality: Math.min(100, entry.quality + (config.qualityBonus / 100) * guardShare * 3),
      loyalty: Math.min(100, entry.loyalty + (config.loyaltyToRuler - entry.loyalty) * 0.08 * guardShare * 3),
    };
  });

  if (intakeThisYear > 0) {
    lines.push(`Chiêu mộ dị tộc: ${String(intakeThisYear)} thiếu niên vào trường cấm vệ năm nay.`);
  }

  return { regions, corps: nextCorps, churchCondemn, revolted, lines };
}

/** Tám quân đoàn Cấm Vệ — tuyển bằng chiêu mộ dị tộc, đúng mục 4. */
const GUARD_IDS = new Set([
  'corps_tan-binh-doan',
  'corps_cam-ky-doan',
  'corps_phao-doan',
  'corps_xa-phao-doan',
  'corps_hoa-cau-doan',
  'corps_cong-binh-doan',
  'corps_giap-khi-doan',
  'corps_thi-ve-doan',
]);

/** Tha một vùng: dừng lấy người ở đó. Oán hận nguôi, nhưng cấm vệ mỏng dần. */
export function spare(board: OttomanBoard, regionId: string): OttomanBoard {
  return {
    ...board,
    devshirme: board.devshirme.map((row) => (row.regionId === regionId ? { ...row, intakeYears: -1 } : row)),
  };
}

/** Thành phần chủng tộc của hàng cấm vệ — bảng này là bằng chứng của mục 2.1b. */
export function guardComposition(board: OttomanBoard): { raceId: string; weight: number }[] {
  const tally = new Map<string, number>();
  for (const region of board.devshirme) {
    if (region.intakeYears <= 0) continue;
    for (const race of region.races) {
      tally.set(race, (tally.get(race) ?? 0) + region.intakeYears);
    }
  }
  const total = [...tally.values()].reduce((sum, value) => sum + value, 0) || 1;
  return [...tally.entries()]
    .map(([raceId, weight]) => ({ raceId, weight: Math.round((weight / total) * 100) }))
    .sort((left, right) => right.weight - left.weight);
}
