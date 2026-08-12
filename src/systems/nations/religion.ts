/**
 * TÔN GIÁO CẠNH TRANH — Phần 14 mục 5.
 *
 * Mỗi vùng có TỶ LỆ theo tôn giáo, không phải một nhãn "vùng này theo đạo gì".
 * Một nhãn duy nhất là mất luôn khả năng kể chuyện quan trọng nhất của phần này:
 * một thành phố 40% dị giáo trông y hệt một thành phố 4% dị giáo trên bản đồ, cho
 * tới cái năm nó không giống nữa.
 *
 * QUY TẮC BẮT BUỘC của mục 5, và nó là quy tắc chứ không phải xác suất:
 *
 *   **DỊ GIÁO BÙNG MẠNH NHẤT SAU ĐÓI KÉM, SAU DỊCH BỆNH, VÀ KHI GIÁO HỘI MẤT UY
 *   TÍN** — mà uy tín mất mạnh nhất khi có hai Giáo hoàng.
 *
 * Nên khủng hoảng không cộng thẳng một lần rồi thôi: nó đẩy một TIẾNG VỌNG
 * (`echo`) sống vài năm, và trong những năm ấy phong trào lớn đều đặn. Một trận
 * dịch năm nay là một cuộc nổi loạn tôn giáo bốn năm sau — đó mới là hình dạng
 * đúng của chuyện này.
 *
 * Phản ứng của Giáo hội có thể dập được, HOẶC làm nó lan nhanh hơn. Ranh giới là
 * uy tín của chính Giáo hội: còn uy tín thì giàn hỏa dập được phong trào, mất uy
 * tín rồi thì mỗi giàn hỏa là một bài giảng cho phía bên kia.
 */

import type { Rng } from '@/core/rng';
import { heresyConfig, knownReligion, religionRelation, religionSeeds, spreadConfig } from './data';

export interface FaithShare {
  religionId: string;
  share: number;
}

export interface FaithArea {
  /** `nation_*` hoặc `prov_*`. */
  areaId: string;
  mix: FaithShare[];
}

/** Tiếng vọng của một cuộc khủng hoảng. Còn sống thì dị giáo còn lớn. */
export interface HeresyEcho {
  triggerId: string;
  yearsLeft: number;
  sharePerYear: number;
}

export interface ReligionYearInput {
  areas: readonly FaithArea[];
  echoes: readonly HeresyEcho[];
  /** Uy tín thiêng liêng của Giáo hội — bảng của Giáo triều là nguồn. */
  churchPrestige: number;
  year: number;
}

export interface ReligionYearReport {
  areas: FaithArea[];
  echoes: HeresyEcho[];
  lines: string[];
  /** Vùng có dị giáo vượt ngưỡng đáng báo động, cho bảng của Giáo triều. */
  alarms: { areaId: string; share: number }[];
}

export class ReligionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReligionError';
  }
}

/** Tỷ lệ khởi đầu, đọc thẳng từ data. */
export function seedAreas(): FaithArea[] {
  return religionSeeds().map((seed) => ({
    areaId: seed.areaId,
    mix: seed.mix.map((row) => ({ religionId: row.religionId, share: row.share })),
  }));
}

export function shareOf(area: FaithArea, religionId: string): number {
  return area.mix.find((row) => row.religionId === religionId)?.share ?? 0;
}

export function dominantFaith(area: FaithArea): string {
  let best: FaithShare | null = null;
  for (const row of area.mix) if (best === null || row.share > best.share) best = row;
  return best?.religionId ?? '';
}

/**
 * Dịch `delta` điểm thị phần từ `from` sang `to`, rồi chuẩn hóa lại về tổng 1.
 *
 * Chuẩn hóa mỗi lần chứ không tích lũy sai số: bản đồ tôn giáo được đọc bằng mắt,
 * và một vùng cộng lại 1,04 sẽ hiện thành một cột cao hơn khung.
 */
export function shift(area: FaithArea, from: string, to: string, delta: number): FaithArea {
  if (delta <= 0 || from === to) return area;
  if (!knownReligion(to)) throw new ReligionError(`tôn giáo "${to}" không có trong data`);

  const available = shareOf(area, from);
  const moved = Math.min(available, delta);
  if (moved <= 0) return area;

  const mix = area.mix.map((row) => (row.religionId === from ? { ...row, share: row.share - moved } : row));
  const target = mix.find((row) => row.religionId === to);
  if (target === undefined) mix.push({ religionId: to, share: moved });
  else target.share += moved;

  return { areaId: area.areaId, mix: normalise(mix) };
}

/** Đẩy một tiếng vọng khủng hoảng vào thế giới. Đây là cửa cho Phần 15 gọi vào. */
export function pushCrisis(echoes: readonly HeresyEcho[], triggerId: string): HeresyEcho[] {
  const trigger = heresyConfig().triggers.find((row) => row.id === triggerId);
  if (trigger === undefined) throw new ReligionError(`khủng hoảng "${triggerId}" chưa khai trong data/religions.json`);
  const rest = echoes.filter((echo) => echo.triggerId !== triggerId);
  return [...rest, { triggerId, yearsLeft: trigger.yearsOfEcho, sharePerYear: trigger.sharePerYear }];
}

/**
 * MỘT NĂM của bản đồ tôn giáo.
 *
 * Thứ tự: tiếng vọng khủng hoảng → dị giáo lớn lên → trôi về tôn giáo chủ đạo →
 * phép lạ. Dị giáo TRƯỚC trôi là cố ý: nếu trôi trước thì mọi phong trào non đều
 * bị bào mòn ngay trong năm nó vừa sinh ra, và quy tắc bắt buộc của mục 5 sẽ
 * không bao giờ nhìn thấy được.
 */
export function advanceReligionYear(rng: Rng, input: ReligionYearInput): ReligionYearReport {
  const config = spreadConfig();
  const heresy = heresyConfig();
  const lines: string[] = [];
  const alarms: { areaId: string; share: number }[] = [];

  // Uy tín thấp là một trigger LUÔN BẬT chứ không phải một biến cố: nó không có
  // tiếng vọng, nó là tình trạng hiện thời.
  const lowPrestige = heresy.triggers.find((trigger) => trigger.prestigeBelow > 0 && input.churchPrestige < trigger.prestigeBelow);
  const echoPush = input.echoes.reduce((sum, echo) => sum + echo.sharePerYear, 0) + (lowPrestige?.sharePerYear ?? 0);

  const areas = input.areas.map((area) => {
    let next: FaithArea = { areaId: area.areaId, mix: area.mix.map((row) => ({ ...row })) };

    // --- dị giáo -----------------------------------------------------------
    const orthodox = shareOf(next, heresy.sourceFaith);
    if (orthodox > 0.02) {
      const pressure = (heresy.basePerYear + echoPush) / 100;
      // Phong trào nào đã có chỗ đứng thì lớn nhanh hơn phong trào chưa ai nghe
      // tên: nhân với căn bậc hai của thị phần hiện có, cộng một sàn nhỏ để một
      // phong trào 0% vẫn có đường quay lại sau đại dịch kế tiếp.
      for (const movement of heresy.movements) {
        const foothold = Math.sqrt(Math.max(0.01, shareOf(next, movement)));
        const grown = pressure * orthodox * (0.35 + foothold);
        next = shift(next, heresy.sourceFaith, movement, grown);
      }
      const total = heresy.movements.reduce((sum, movement) => sum + shareOf(next, movement), 0);
      if (total >= 0.15) {
        alarms.push({ areaId: next.areaId, share: Math.round(total * 100) / 100 });
      }
      if (total >= 0.3 && echoPush > 0) {
        lines.push(`${next.areaId}: dị giáo đã chiếm ${(total * 100).toFixed(0)}% — giảng đạo không còn đủ.`);
      }
    }

    // --- trôi về tôn giáo chủ đạo -----------------------------------------
    const dominant = dominantFaith(next);
    for (const row of [...next.mix]) {
      if (row.religionId === dominant) continue;
      const hostility = Math.max(0, -religionRelation(dominant, row.religionId)) / 100;
      const drift = (config.driftToDominantPerYear / 100) * (0.5 + hostility) * row.share;
      next = shift(next, row.religionId, dominant, drift);
    }

    // --- tôn giáo dưới sàn thì biến mất -----------------------------------
    next = {
      areaId: next.areaId,
      mix: normalise(next.mix.filter((row) => row.share >= config.minShareToSurvive || row.religionId === dominant)),
    };

    // --- phép lạ -----------------------------------------------------------
    if (rng.int(1, 100) <= config.miracle.chancePerYear) {
      const blessed = next.mix[rng.int(0, Math.max(0, next.mix.length - 1))];
      if (blessed !== undefined && blessed.religionId !== dominant) {
        next = shift(next, dominant, blessed.religionId, config.miracle.sharePerEvent / 100);
        lines.push(`${next.areaId}: một phép lạ được kể lại, và người ta kể nó về ${blessed.religionId}.`);
      }
    }

    return next;
  });

  const echoes = input.echoes
    .map((echo) => ({ ...echo, yearsLeft: echo.yearsLeft - 1 }))
    .filter((echo) => echo.yearsLeft > 0);

  return { areas, echoes, lines, alarms };
}

/**
 * TRUYỀN ĐẠO vào một vùng. Tốn tiền, và tốn gấp đôi ở vùng thù địch.
 *
 * Trả về vùng mới cùng số tiền đã tiêu — người gọi tự trừ vào ngân khố, vì tầng
 * này không biết ngân khố của ai.
 */
export function preach(area: FaithArea, religionId: string, budget: number): { area: FaithArea; spent: number; line: string } {
  const config = spreadConfig().missionary;
  const dominant = dominantFaith(area);
  if (dominant === religionId) return { area, spent: 0, line: '' };

  const hostility = Math.max(0, -religionRelation(dominant, religionId));
  const costPerPoint = config.costPerPoint * (1 + hostility * config.resistancePerHostility);
  const points = Math.min(config.sharePerYear, budget / costPerPoint);
  if (points <= 0) return { area, spent: 0, line: '' };

  return {
    area: shift(area, dominant, religionId, points / 100),
    spent: Math.round(points * costPerPoint),
    line: `Truyền đạo ở ${area.areaId}: ${religionId} tăng ${points.toFixed(1)} điểm.`,
  };
}

/**
 * ĐÀN ÁP một tôn giáo trong một vùng.
 *
 * Hai kết cục, và chọn kết cục nào không phải do xúc sắc mà do UY TÍN của người
 * đàn áp — mục 5 nói "có thể dập được, hoặc có thể làm nó lan nhanh hơn", và làm
 * nó thành 50/50 sẽ biến một quyết định chính trị thành một trò may rủi.
 */
export function oppress(
  area: FaithArea,
  religionId: string,
  prestige: number,
): { area: FaithArea; backfired: boolean; unrest: number; line: string } {
  const config = spreadConfig().oppression;
  const dominant = dominantFaith(area);
  const backfired = prestige < config.backfireBelowPrestige;

  if (backfired) {
    return {
      area: shift(area, dominant, religionId, config.backfireSharePerYear / 100),
      backfired: true,
      unrest: config.unrestPerYear,
      line: `Đàn áp ${religionId} ở ${area.areaId} phản tác dụng: mỗi bản án là một bài giảng cho phía bên kia.`,
    };
  }

  return {
    area: shift(area, religionId, dominant, config.suppressPerYear / 100),
    backfired: false,
    unrest: config.unrestPerYear,
    line: `Đàn áp ${religionId} ở ${area.areaId}: thị phần của họ lùi ${String(config.suppressPerYear)} điểm.`,
  };
}

/**
 * PHẢN ỨNG CỦA GIÁO HỘI với dị giáo ở một vùng: giảng đạo, cải cách, tòa dị
 * giáo, thập tự chinh nội bộ (mục 5).
 */
export function respondToHeresy(
  area: FaithArea,
  responseId: string,
  churchPrestige: number,
): { area: FaithArea; cost: number; prestige: number; unrest: number; landDamage: number; line: string } {
  const heresy = heresyConfig();
  const response = heresy.responses.find((row) => row.id === responseId);
  if (response === undefined) throw new ReligionError(`phản ứng "${responseId}" chưa khai trong data`);
  if (response.requiresPrestige > 0 && churchPrestige < response.requiresPrestige) {
    return {
      area,
      cost: 0,
      prestige: 0,
      unrest: 0,
      landDamage: 0,
      line: `${response.name} cần uy tín ${String(response.requiresPrestige)}, Giáo hội chỉ còn ${String(Math.round(churchPrestige))}.`,
    };
  }

  const backfires = response.backfire > 0 && churchPrestige < response.backfireBelowPrestige;
  let next = area;
  for (const movement of heresy.movements) {
    if (backfires) next = shift(next, heresy.sourceFaith, movement, response.backfire / 100 / heresy.movements.length);
    else next = shift(next, movement, heresy.sourceFaith, response.suppress / 100);
  }

  return {
    area: next,
    cost: response.cost,
    prestige: response.prestige,
    unrest: response.unrest,
    landDamage: response.landDamage,
    line: backfires
      ? `${response.name} ở ${area.areaId} phản tác dụng — Giáo hội không còn đủ uy tín để làm chuyện này.`
      : `${response.name} ở ${area.areaId}: dị giáo lùi ${String(response.suppress)} điểm.`,
  };
}

/**
 * CHỈ SỐ CĂNG THẲNG TÔN GIÁO của một vùng, 0–100 (biến phụ của mục 7).
 *
 * Không phải "bao nhiêu tôn giáo" mà là "hai tôn giáo lớn nhất ghét nhau tới đâu,
 * và chúng có ngang sức không". Một vùng 95/5 giữa hai kẻ tử thù thì yên; một
 * vùng 50/50 giữa hai kẻ tử thù thì sắp cháy.
 */
export function tensionOf(area: FaithArea): number {
  const sorted = [...area.mix].sort((left, right) => right.share - left.share);
  const first = sorted[0];
  const second = sorted[1];
  if (first === undefined || second === undefined) return 0;
  const hostility = Math.max(0, -religionRelation(first.religionId, second.religionId));
  const balance = (second.share / Math.max(0.0001, first.share)) * 2;
  return Math.round(Math.min(100, hostility * Math.min(1, balance)));
}

function normalise(mix: readonly FaithShare[]): FaithShare[] {
  const total = mix.reduce((sum, row) => sum + row.share, 0);
  if (total <= 0) return mix.map((row) => ({ ...row }));
  return mix.map((row) => ({ religionId: row.religionId, share: Math.round((row.share / total) * 10000) / 10000 }));
}
