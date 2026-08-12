/**
 * Y HỌC THẾ KỶ 14 (Phần 7 mục 6) — nạp từ `/data/treatments.json`.
 *
 * File này chỉ NẠP và TRA. Chỗ chạy phép kiểm và áp hệ quả nằm ở `treat.ts`.
 *
 * Hai luật của mục 6 được gác ngay ở loader, vì cả hai đều là thứ dễ bị làm
 * mềm đi trong lúc cân bằng số:
 *
 *   · TRÍCH MÁU phải có hại ở MỌI cấp kết quả. Một bảng mà `critSuccess` của
 *     trích máu không trừ máu là bảng đã bỏ mất cái bẫy lịch sử có chủ ý.
 *   · Mỗi phương pháp phải khai đủ năm cấp. Thiếu một cấp nghĩa là có một kết
 *     quả kiểm định không dẫn tới gì cả, và người chơi sẽ thấy mình tung xúc
 *     sắc để không có chuyện gì xảy ra.
 */

import { z } from 'zod';
import treatmentsFile from '@data/treatments.json';
import type { CheckTier } from '@/core/turn';
import { TIER_ORDER, type DifficultyBand } from '@/systems/check';
import { INJURY_TYPES } from './catalog';
import { BodyDataError } from './regions';

const DIFFICULTY_BANDS = [
  'de-dang',
  'thuong',
  'kho',
  'rat-kho',
  'cuc-kho',
  'gan-bat-kha',
] as const satisfies readonly DifficultyBand[];

const outcomeSchema = z.object({
  /** Nhân vào lượng máu đang chảy của vết đó. 0 là cầm hẳn. */
  bleedingMul: z.number().min(0).optional(),
  infectionAdd: z.number().default(0),
  painAdd: z.number().default(0),
  /** Cộng thẳng vào tiến độ lành 0–100. */
  healBonus: z.number().default(0),
  /** Chất lượng chữa 1–5, nhân vào tốc độ lành các lượt sau (mục 2). */
  quality: z.int().min(1).max(5).optional(),
  treated: z.boolean().default(false),
  /** Đổi máu toàn thân. Âm là mất máu. */
  bloodAdd: z.number().default(0),
  /** Gây thêm một vết mới — đốt sắt nung luôn để lại một vết bỏng. */
  addsInjury: z
    .object({
      type: z.enum(INJURY_TYPES),
      severity: z.int().min(1).max(5),
      /** Vùng khác vùng đang chữa; bỏ trống là cùng vùng. */
      region: z.string().optional(),
    })
    .optional(),
  /** Gỡ hẳn các biến chứng này. */
  resolves: z.array(z.string()).default([]),
  causesPermanent: z.string().optional(),
  amputates: z.boolean().default(false),
  /** Mở lại vết thương: tiến độ lành về 0. */
  reopens: z.boolean().default(false),
  /** Cầu nguyện: WIL tạm thời, không phải hiệu ứng vật lý. */
  willBonus: z.number().default(0),
  willTurns: z.number().default(0),
  text: z.string().default(''),
});

const treatmentSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  /** Kỹ năng dùng để kiểm định, id trong `data/skills.json`. */
  skill: z.string().min(1),
  difficulty: z.enum(DIFFICULTY_BANDS),
  appliesTo: z
    .object({
      types: z.array(z.enum(INJURY_TYPES)).default([]),
      regions: z.array(z.string()).default([]),
      minSeverity: z.number().default(1),
      requiresLimb: z.boolean().default(false),
      requiresComplications: z.array(z.string()).default([]),
      /** Dùng được cho mọi vết — trích máu và cầu nguyện. */
      any: z.boolean().default(false),
    })
    .default({ types: [], regions: [], minSeverity: 1, requiresLimb: false, requiresComplications: [], any: false }),
  timeTurns: z.number().min(0).default(1),
  supplies: z.array(z.string()).default([]),
  price: z.number().min(0).default(0),
  /** Có hại về mặt cơ học — trích máu. */
  harmful: z.boolean().default(false),
  /** Làm lại được nhiều lượt liên tiếp. */
  repeatable: z.boolean().default(false),
  /** Có tác dụng vật lý không. Cầu nguyện thì không (mục 6). */
  physical: z.boolean().default(true),
  /** Bắt buộc cho loại vết đó — nẹp xương. */
  required: z.boolean().default(false),
  summary: z.string().default(''),
  risks: z.string().default(''),
  advice: z.string().default(''),
  outcomes: z.record(z.string(), outcomeSchema),
});

const healerSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  /** Khoảng điểm rèn luyện d100. `null` là dùng kỹ năng của chính người chơi. */
  skill: z.tuple([z.number(), z.number()]).nullable().default(null),
  price: z.number().min(0).default(0),
  prefers: z.array(z.string()).default([]),
  advisesAgainst: z.array(z.string()).default([]),
  note: z.string().default(''),
});

const fileSchema = z.object({
  treatments: z.array(treatmentSchema).min(1),
  healers: z.array(healerSchema).min(1),
});

export type TreatmentOutcome = z.infer<typeof outcomeSchema>;
export type Treatment = z.infer<typeof treatmentSchema>;
export type Healer = z.infer<typeof healerSchema>;

function load(): { treatments: Map<string, Treatment>; healers: Healer[] } {
  const parsed = fileSchema.safeParse(treatmentsFile);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new BodyDataError(
      `data/treatments.json hỏng ở "${issue?.path.join('.') ?? '?'}": ${issue?.message ?? 'không rõ'}`,
    );
  }

  const treatments = new Map<string, Treatment>();
  for (const treatment of parsed.data.treatments) {
    if (treatments.has(treatment.id)) throw new BodyDataError(`phương pháp trùng id: ${treatment.id}`);

    for (const tier of TIER_ORDER) {
      if (treatment.outcomes[tier] === undefined) {
        throw new BodyDataError(`phương pháp "${treatment.id}" thiếu cấp kết quả "${tier}" — mục 6 đòi đủ năm cấp`);
      }
    }

    if (treatment.harmful) {
      // Luật lịch sử của mục 6: trích máu KHÔNG được có một cấp nào có lợi.
      for (const tier of TIER_ORDER) {
        const outcome = treatment.outcomes[tier];
        if (outcome !== undefined && outcome.bloodAdd >= 0) {
          throw new BodyDataError(
            `phương pháp có hại "${treatment.id}" phải trừ máu ở MỌI cấp — cấp "${tier}" đang là ${outcome.bloodAdd}`,
          );
        }
      }
    }

    treatments.set(treatment.id, treatment);
  }

  const healerIds = new Set<string>();
  for (const healer of parsed.data.healers) {
    if (healerIds.has(healer.id)) throw new BodyDataError(`người chữa trùng id: ${healer.id}`);
    healerIds.add(healer.id);
    for (const id of [...healer.prefers, ...healer.advisesAgainst]) {
      if (!treatments.has(id)) {
        throw new BodyDataError(`người chữa "${healer.id}" nhắc tới phương pháp "${id}" không có trong bảng`);
      }
    }
  }

  return { treatments, healers: parsed.data.healers };
}

const DATA = load();

// ---------------------------------------------------------------------------
// Đọc
// ---------------------------------------------------------------------------

export function allTreatments(): Treatment[] {
  return [...DATA.treatments.values()];
}

export function treatmentOf(id: string): Treatment | null {
  return DATA.treatments.get(id) ?? null;
}

export function treatmentName(id: string): string {
  return DATA.treatments.get(id)?.name ?? id;
}

export function outcomeFor(treatment: Treatment, tier: CheckTier): TreatmentOutcome | null {
  return treatment.outcomes[tier] ?? null;
}

export function allHealers(): Healer[] {
  return [...DATA.healers];
}

export function healerOf(id: string): Healer | null {
  return DATA.healers.find((healer) => healer.id === id) ?? null;
}

/**
 * Người chữa này có can ngăn phương pháp đó không (mục 6).
 *
 * Đây là chỗ cái bẫy trích máu trở thành thứ ĐỌC ĐƯỢC trên màn hình thay vì một
 * hình phạt giấu trong bảng số: thầy thuốc học ở phương nam sẽ can, thợ cạo
 * ngoài chợ thì mời chào. Người chơi vẫn được quyền chọn sai.
 */
export function healerAdvice(healerId: string, treatmentId: string): string {
  const healer = healerOf(healerId);
  const treatment = treatmentOf(treatmentId);
  if (healer === null || treatment === null) return '';
  if (healer.advisesAgainst.includes(treatmentId)) {
    return `${healer.name} can ngài đừng dùng ${treatment.name.toLowerCase()}.`;
  }
  if (healer.prefers.includes(treatmentId)) {
    return `${healer.name} đề nghị chính ${treatment.name.toLowerCase()}.`;
  }
  return '';
}
