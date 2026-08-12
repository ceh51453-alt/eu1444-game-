/**
 * XUẤT THÂN (Phần 6 mục 3) — nạp từ `/data/origins.json` theo R5.
 *
 * LUẬT CỨNG của mục 3: xuất thân KHÔNG đặt trần tước vị. Một nông nô về lý
 * thuyết vẫn lên tới hoàng đế được; Phần 13 xét uy tín, đất và quan hệ hiện tại,
 * không xét chỗ sinh. Tuy vậy, nghề đã học, cửa đã quen và định kiến xã hội
 * không biến mất sau màn tạo nhân vật: `favouredSkillBonus` cùng `effects` giữ
 * các dấu ấy thành những dòng modifier đọc được, để xuất thân không chỉ là một
 * gói tiền và điểm dùng đúng một lần.
 */

import { z } from 'zod';
import originsFile from '@data/origins.json';
import { effectSchema } from './effects';

export const pointBuySchema = z.object({
  baseStat: z.int(),
  minAtCreation: z.int(),
  maxAtCreation: z.int(),
  statCostLadder: z.array(z.object({ upTo: z.int(), cost: z.int().min(1) })).min(1),
  skillTrainingPerPoint: z.int().min(1),
  skillMaxAtCreation: z.int().min(1),
  /** Tuổi đổi ra điểm kỹ năng khởi đầu — xem `ageSkillBonus`. */
  ageBonus: z
    .object({
      referenceAge: z.int(),
      skillPointsPerYear: z.number(),
      min: z.int(),
      max: z.int(),
    })
    .default({ referenceAge: 22, skillPointsPerYear: 0.4, min: -4, max: 14 }),
});

/** Một món trong bộ khởi đầu: id catalog, cộng chất liệu và tay nghề nếu khác mặc định. */
export const originGearSchema = z.object({
  item: z.string().startsWith('item_'),
  material: z.string().optional(),
  quality: z.string().optional(),
});

export const originSchema = z.object({
  id: z.string().startsWith('origin_'),
  name: z.string().min(1),
  description: z.string().default(''),
  statPoints: z.int(),
  skillPoints: z.int(),
  wealth: z.string(),
  prestige: z.int(),
  relations: z.int(),
  assetNote: z.string().default(''),
  favouredSkills: z.array(z.string()).default([]),
  /**
   * Dấu nghề còn theo nhân vật sau bước tạo: đây là kinh nghiệm xã hội và nghề
   * nghiệp đã ăn vào cách làm việc, KHÔNG phải một trần thăng tiến theo dòng dõi.
   */
  favouredSkillBonus: z.number().default(5),
  /** Bối cảnh lịch sử-xã hội để UI và người kể chuyện hiểu vì sao xuất thân này tồn tại. */
  history: z.string().default(''),
  privileges: z.array(z.string()).default([]),
  burdens: z.array(z.string()).default([]),
  /** Ảnh hưởng xã hội/nghề nghiệp còn hiệu lực trong lúc chơi. */
  effects: z.array(effectSchema).default([]),
  /** Trang bị mang theo — id trong `data/gear.json`. */
  gear: z.array(originGearSchema).default([]),
  /**
   * Tài sản KHÔNG phải thành trì và KHÔNG phải trang bị: nhà đất, xưởng, kho.
   * Để riêng vì một cái xưởng không phải một khu định cư có tường và ô đất.
   */
  property: z.array(z.string()).default([]),
  /** THÀNH TRÌ khởi đầu — chỉ con cả mới thừa kế (mục 3). */
  holdings: z.array(z.object({ tier: z.string(), role: z.string() })).default([]),
  /** THÁI ẤP khởi đầu — tờ giấy có ấn triện, không phải đất. */
  fiefs: z.array(z.object({ title: z.string(), obligations: z.array(z.string()).default([]) })).default([]),
  /** Vai trò với LÃNH THỔ. Phần lớn giai tầng là `khong-co`. */
  realmRole: z.string().default('khong-co'),
});

export const birthOrderSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().default(''),
  inherits: z.boolean(),
  prestige: z.int(),
  wealthMultiplier: z.number(),
  relations: z.int(),
});

export const lineageStateSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().default(''),
  prestige: z.int(),
  wealthMultiplier: z.number(),
  relations: z.int(),
});

const fileSchema = z.object({
  pointBuy: pointBuySchema,
  wealthBands: z.array(z.object({ id: z.string(), label: z.string(), coins: z.number() })),
  origins: z.array(originSchema).min(1),
  birthOrders: z.array(birthOrderSchema).min(1),
  lineageStates: z.array(lineageStateSchema).min(1),
  relationKinds: z.array(z.object({ id: z.string(), name: z.string() })).default([]),
});

export type PointBuy = z.infer<typeof pointBuySchema>;
export type Origin = z.infer<typeof originSchema>;
export type BirthOrder = z.infer<typeof birthOrderSchema>;
export type LineageState = z.infer<typeof lineageStateSchema>;
export type RelationKind = string;

export class OriginDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OriginDataError';
  }
}

function load(): z.infer<typeof fileSchema> {
  const parsed = fileSchema.safeParse(originsFile);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new OriginDataError(
      `data/origins.json hỏng ở "${issue?.path.join('.') ?? '?'}": ${issue?.message ?? 'không rõ'}`,
    );
  }
  const bands = new Set(parsed.data.wealthBands.map((band) => band.id));
  for (const origin of parsed.data.origins) {
    if (!bands.has(origin.wealth)) {
      throw new OriginDataError(`xuất thân "${origin.id}" trỏ tới mức tiền "${origin.wealth}" không có trong wealthBands`);
    }
  }
  return parsed.data;
}

const DATA = load();

export function allOrigins(): Origin[] {
  return [...DATA.origins];
}

export function originOf(id: string): Origin | null {
  return DATA.origins.find((origin) => origin.id === id) ?? null;
}

export function originName(id: string): string {
  return originOf(id)?.name ?? id;
}

export function allBirthOrders(): BirthOrder[] {
  return [...DATA.birthOrders];
}

export function birthOrderOf(id: string): BirthOrder | null {
  return DATA.birthOrders.find((order) => order.id === id) ?? null;
}

export function allLineageStates(): LineageState[] {
  return [...DATA.lineageStates];
}

export function lineageStateOf(id: string): LineageState | null {
  return DATA.lineageStates.find((state) => state.id === id) ?? null;
}

export function relationKinds(): { id: string; name: string }[] {
  return [...DATA.relationKinds];
}

export function pointBuy(): PointBuy {
  return DATA.pointBuy;
}

export function wealthLabel(bandId: string): string {
  return DATA.wealthBands.find((band) => band.id === bandId)?.label ?? bandId;
}

export function wealthCoins(bandId: string): number {
  return DATA.wealthBands.find((band) => band.id === bandId)?.coins ?? 0;
}

// ---------------------------------------------------------------------------
// Point-buy (mục 9 bước 3)
// ---------------------------------------------------------------------------

/**
 * Giá của MỘT điểm khi nâng chỉ số từ `value` lên `value + 1`.
 *
 * Thang lũy tiến để điểm cuối cùng đắt gấp ba điểm đầu. Không có thang này thì
 * mọi nhân vật đều dồn hết vào một ô và bỏ trắng mười một ô còn lại — mà cả bộ
 * 12 chỉ số tồn tại chính là để chuyện đó không xảy ra.
 */
export function statStepCost(value: number): number {
  const ladder = DATA.pointBuy.statCostLadder;
  for (const rung of ladder) {
    if (value < rung.upTo) return rung.cost;
  }
  return ladder[ladder.length - 1]?.cost ?? 1;
}

/** Tổng điểm để đi từ `from` lên `to`. Âm khi hạ xuống (hoàn lại đúng số đã tiêu). */
export function statCost(from: number, to: number): number {
  if (to === from) return 0;
  const low = Math.min(from, to);
  const high = Math.max(from, to);
  let total = 0;
  for (let value = low; value < high; value++) total += statStepCost(value);
  return to > from ? total : -total;
}

/** Ngân sách điểm chỉ số của một giai tầng. */
export function statBudget(originId: string): number {
  return originOf(originId)?.statPoints ?? 0;
}

export function skillBudget(originId: string): number {
  return originOf(originId)?.skillPoints ?? 0;
}

/**
 * ĐIỂM KỸ NĂNG TẶNG THÊM (hoặc bớt đi) VÌ TUỔI.
 *
 * Nhận TUỔI HIỆU DỤNG của Phần 6 mục 2, không nhận tuổi thô: một Cao Tiên 300
 * tuổi mới sống được chừng ấy đời người như một Frank 35 tuổi, và cả hai phải
 * nhận cùng một khoản. Truyền tuổi thô vào đây là biến mọi tộc trường thọ thành
 * bậc thầy ngay từ bước tạo nhân vật.
 *
 * Kẹp hai đầu vì hai lý do khác nhau: trần trên để một cụ già không mở màn với
 * kỹ năng của một tông sư (Phần 8 mới là đường lên đó, và nó đòi thầy), sàn dưới
 * để một thiếu niên vẫn còn đủ điểm dựng ra một nhân vật chơi được.
 */
export function ageSkillBonus(effectiveAge: number): number {
  const rule = DATA.pointBuy.ageBonus;
  const raw = Math.round((effectiveAge - rule.referenceAge) * rule.skillPointsPerYear);
  return Math.max(rule.min, Math.min(rule.max, raw));
}

// ---------------------------------------------------------------------------
// Vạch xuất phát tổng hợp
// ---------------------------------------------------------------------------

export interface StartingLine {
  coins: number;
  prestige: number;
  relationSlots: number;
  /** Con cả thừa kế thành trì và thái ấp; con thứ phải tự lập (mục 3). */
  inherits: boolean;
  /** Tài sản không phải thành trì, không phải trang bị — ai cũng mang theo được. */
  property: string[];
}

/**
 * Gộp giai tầng + thứ tự con + tình trạng gia tộc thành vạch xuất phát thật.
 *
 * Thuần theo nghĩa Phần 0 mục 7 — nhận id, trả số. Không đọc store, không tung
 * xúc sắc: cùng ba lựa chọn phải cho cùng một vạch, nếu không thì bảng xem
 * trước ở bước 2 nói một đằng và bước 9 chốt một nẻo.
 */
export function startingLine(originId: string, birthOrderId: string, lineageStateId: string): StartingLine {
  const origin = originOf(originId);
  const order = birthOrderOf(birthOrderId);
  const lineage = lineageStateOf(lineageStateId);
  if (origin === null) return { coins: 0, prestige: 0, relationSlots: 0, inherits: false, property: [] };

  const multiplier = (order?.wealthMultiplier ?? 1) * (lineage?.wealthMultiplier ?? 1);
  const inherits = order?.inherits ?? false;
  return {
    coins: Math.max(0, Math.round(wealthCoins(origin.wealth) * multiplier)),
    prestige: Math.max(0, origin.prestige + (order?.prestige ?? 0) + (lineage?.prestige ?? 0)),
    relationSlots: Math.max(0, origin.relations + (order?.relations ?? 0) + (lineage?.relations ?? 0)),
    inherits,
    // Con thứ vẫn giữ được thứ mang đi được; thứ không mang đi được thì ở lại
    // với người thừa kế. Đó là toàn bộ khác biệt giữa con cả và con thứ ở đây.
    property: inherits ? [...origin.property] : origin.property.slice(0, Math.max(0, origin.property.length - 1)),
  };
}
