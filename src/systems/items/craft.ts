/**
 * CHẾ TẠO (Phần 16 mục 7 và 11) — nối vào kỹ năng Phần 8 và công trình Phần 12.
 *
 * Bốn thứ quyết định một món ra lò thế nào, và không thứ nào được bỏ:
 *   thợ         kỹ năng `skill_ren-sat` / `skill_che-tac` / `skill_co-khi`…
 *   công trình  lò rèn · xưởng cung nỏ · xưởng giáp, cấp trong thành trì Phần 12
 *   vật liệu    một số vật liệu đòi tay nghề tối thiểu mới đụng vào được
 *   BẢN MẪU     kiểu mới phải HỌC — và đó là cách công nghệ lan trong thế giới
 *
 * Kết quả đi qua MỘT KIỂM ĐỊNH 3d6 của Phần 5 (mục 7), không phải một bảng tra
 * tất định: hai người thợ giỏi ngang nhau vẫn cho ra hai món khác bậc, và một
 * thanh tuyệt tác vẫn là chuyện hiếm ngay cả với người giỏi nhất châu lục.
 */

import type { Rng } from '@/core/rng';
import type { DifficultyBand } from '@/systems/check/difficulty';
import { runCheck } from '@/systems/check/run';
import { isSuccess } from '@/systems/check/tiers';
import {
  craftOf,
  craftRollConfig,
  itemName,
  itemValue,
  massProduction,
  materialOf,
  patternLearningWays,
  patternOf,
  qualityByLevel,
  qualityOf,
  type CraftSpec,
  type ItemQuality,
} from './data';
import { patternAvailable, existsInYear, type SpreadOptions } from './era';
import { newItem } from './item';
import type { Item } from './types';

export interface Workshop {
  /** Cấp công trình trong thành trì (Phần 12). 0 là làm ngoài trời. */
  forgeLevel: number;
  /** Id công trình đang có — phải khớp `craft.building` của mẫu. */
  buildings: readonly string[];
  /** Bản mẫu mà xưởng này đã học (mục 11). */
  patterns: readonly string[];
}

export interface Smith {
  id: string;
  /** Điểm rèn luyện 0–100 của kỹ năng tương ứng (Phần 8). */
  skill: number;
}

export interface CraftOrder {
  templateId: string;
  material: string;
  smith: Smith;
  workshop: Workshop;
  year: number;
  /** Số tuần công bỏ THÊM so với `manWeeks` chuẩn — chậm mà kỹ (mục 7). */
  extraWeeks?: number;
  nationId?: string;
  /** Lô hàng loạt cho quân đội (mục 11). */
  batch?: number;
}

export interface CraftFeasibility {
  possible: boolean;
  reasons: string[];
  spec: CraftSpec | null;
  weeks: number;
  cost: number;
  hasPattern: boolean;
}

/**
 * Làm được không, và nếu không thì VÌ SAO.
 *
 * Trả về danh sách lý do chứ không phải một `false`: người chơi đứng trước một
 * cái lò rèn và bấm "rèn giáp tấm" phải đọc được là mình thiếu tay nghề, thiếu
 * bản mẫu, hay chỉ đơn giản là năm nay chưa ai nghĩ ra kiểu ấy.
 */
export function canCraft(order: CraftOrder): CraftFeasibility {
  const spec = craftOf(order.templateId);
  const reasons: string[] = [];

  if (spec === null) {
    return { possible: false, reasons: ['Không có công thức cho món này.'], spec: null, weeks: 0, cost: 0, hasPattern: false };
  }
  if (!existsInYear(order.templateId, order.year)) {
    reasons.push(`Năm ${String(order.year)} chưa ai làm ${itemName(order.templateId).toLowerCase()} kiểu này.`);
  }
  if (order.smith.skill < spec.skillMin) {
    reasons.push(`Cần tay nghề ${String(spec.skillMin)}, thợ mới có ${String(order.smith.skill)}.`);
  }
  if (spec.building !== '' && !order.workshop.buildings.includes(spec.building)) {
    reasons.push(`Thiếu công trình ${spec.building}.`);
  }

  const material = materialOf(order.material);
  if (order.smith.skill < material.craftSkillMin) {
    reasons.push(`${material.name} đòi tay nghề ${String(material.craftSkillMin)} mới đụng vào được.`);
  }
  if (material.decorative) {
    reasons.push(`${material.name} là vật liệu trang trí — không làm vũ khí thật được (mục 6).`);
  }

  const spread: SpreadOptions = {
    ...(order.nationId === undefined ? {} : { nationId: order.nationId }),
    knownPatterns: order.workshop.patterns,
  };
  const hasPattern = patternAvailable(spec.pattern, order.year, spread);

  const batch = Math.max(1, order.batch ?? 1);
  const mass = massProduction();
  const perItem = batch >= mass.batchMin ? spec.manWeeks * mass.manWeekFactor : spec.manWeeks;
  const weeks = Math.round((perItem * batch + (order.extraWeeks ?? 0)) * 10) / 10;
  const cost = Math.round(itemValue(order.templateId) * material.priceFactor * 0.4 * batch);

  return { possible: reasons.length === 0, reasons, spec, weeks, cost, hasPattern };
}

// ---------------------------------------------------------------------------
// Cú tung quyết định bậc (mục 7)
// ---------------------------------------------------------------------------

export interface CraftResult {
  made: Item[];
  quality: ItemQuality;
  margin: number;
  weeks: number;
  cost: number;
  lines: string[];
}

/**
 * Rèn xong: bậc chất lượng suy từ BIÊN ĐỘ của cú tung 3d6, không từ một bảng.
 *
 * Không có bản mẫu vẫn làm được — chỉ khó hơn hẳn (`noPatternPenalty`), và trên
 * thực tế gần như không bao giờ ra được tuyệt tác. Đó là thứ khiến việc đi học
 * một bản mẫu đáng bỏ tám tuần, thay vì một cánh cửa khóa cứng.
 */
export function craft(rng: Rng, order: CraftOrder): CraftResult | null {
  const feasibility = canCraft(order);
  if (!feasibility.possible || feasibility.spec === null) return null;

  const config = craftRollConfig();
  const material = materialOf(order.material);
  const bonus =
    order.smith.skill * config.skillPerPoint +
    order.workshop.forgeLevel * config.forgeQualityPerLevel +
    (order.smith.skill < material.craftSkillMin ? config.materialCraftMinPenalty : 0) +
    (order.extraWeeks ?? 0) * config.extraTimeFactor +
    (feasibility.hasPattern ? 0 : config.noPatternPenalty);

  const run = runCheck(rng, {
    id: 'craft.ren-do',
    system: '3d6',
    domain: `skill.${feasibility.spec.skill.replace('skill_', '')}`,
    difficulty: config.difficulty as DifficultyBand,
    base: Math.round(bonus),
    actor: order.smith.id,
    tags: ['che-tac'],
  });

  const margin = run.result.margin;
  const tier = config.tiers.find((row) => margin >= row.minMargin) ?? config.tiers[config.tiers.length - 1];
  let quality = qualityOf(tier?.quality ?? 'thuong');

  const batch = Math.max(1, order.batch ?? 1);
  const mass = massProduction();
  const lines: string[] = [];
  if (batch >= mass.batchMin) {
    // Sản xuất hàng loạt: nhanh gấp đôi và KHÔNG BAO GIỜ ra được món trên mức
    // trần. Đó là lý do binh lính và hiệp sĩ không mặc cùng một thứ (mục 11).
    const capped = Math.min(quality.level + mass.qualityShift, qualityOf(mass.maxQuality).level);
    quality = qualityByLevel(capped);
    lines.push(`Lô ${String(batch)} món: nhanh hơn, và không món nào vượt mức ${quality.name}.`);
  }
  if (!feasibility.hasPattern) lines.push('Làm chay không bản mẫu — mọi tỉ lệ đều lệch một chút.');

  const made: Item[] = [];
  for (let index = 0; index < batch; index++) {
    made.push(
      newItem(order.templateId, {
        id: `item#${order.templateId}#${String(order.year)}#${String(index)}`,
        material: order.material,
        quality: quality.level,
        ...(quality.named ? { name: `${itemName(order.templateId)} của ${order.smith.id === '' ? 'chính ngài' : order.smith.id}` } : {}),
        history: [`Rèn năm ${String(order.year)}${order.smith.id === '' ? '' : ` bởi ${order.smith.id}`}.`],
      }),
    );
  }

  lines.push(`${itemName(order.templateId)} — bậc ${quality.name} (biên độ ${String(margin)}).`);
  return { made, quality, margin, weeks: feasibility.weeks, cost: feasibility.cost, lines };
}

// ---------------------------------------------------------------------------
// Bản mẫu (mục 11)
// ---------------------------------------------------------------------------

export interface LearnPlan {
  patternId: string;
  wayId: string;
  weeks: number;
  cost: number;
  needsTeacher: boolean;
  destroysItem: boolean;
  difficulty: string;
  skillMin: number;
  note: string;
}

/**
 * Ba đường học một bản mẫu, và cái giá của từng đường.
 *
 * "Tháo một món có sẵn ra nghiên cứu" PHÁ HỦY món ấy — đó là chỗ một bộ giáp
 * cướp được đáng giá hơn nhiều so với giá bán của nó, và là lý do thứ hai (sau
 * mục 8) khiến chiến lợi phẩm là một quyết định chứ không phải một khoản tiền.
 */
export function learnPlans(patternId: string, sampleItemId = ''): LearnPlan[] {
  const pattern = patternOf(patternId);
  if (pattern === null) return [];
  const sampleValue = sampleItemId === '' ? itemValue('') : itemValue(sampleItemId);

  return patternLearningWays()
    .filter((way) => (way.destroysItem ? sampleItemId !== '' : true))
    .map((way) => ({
      patternId,
      wayId: way.id,
      weeks: way.weeks,
      cost: Math.round((way.destroysItem ? sampleValue : itemValue(sampleItemId)) * way.cost),
      needsTeacher: way.needsTeacher,
      destroysItem: way.destroysItem,
      difficulty: pattern.learnDifficulty,
      skillMin: pattern.skillMin,
      note: way.note,
    }));
}

/** Học xong chưa: một phép kiểm theo bậc khó của chính bản mẫu. */
export function learnPattern(rng: Rng, plan: LearnPlan, smith: Smith): { learned: boolean; line: string } {
  const pattern = patternOf(plan.patternId);
  if (pattern === null) return { learned: false, line: 'Không có bản mẫu ấy.' };
  if (smith.skill < pattern.skillMin) {
    return { learned: false, line: `Cần tay nghề ${String(pattern.skillMin)} mới hiểu nổi bản vẽ.` };
  }

  const run = runCheck(rng, {
    id: 'craft.hoc-ban-mau',
    system: '3d6',
    domain: `skill.${pattern.skill.replace('skill_', '')}`,
    difficulty: pattern.learnDifficulty as DifficultyBand,
    base: Math.round(smith.skill * craftRollConfig().skillPerPoint),
    actor: smith.id,
    tags: ['hoc-ban-mau'],
  });

  const learned = isSuccess(run.result.tier);
  return {
    learned,
    line: learned
      ? `Học được ${pattern.name} sau ${String(plan.weeks)} tuần.`
      : `${String(plan.weeks)} tuần trôi qua và bản vẽ vẫn là một mớ đường kẻ.`,
  };
}
