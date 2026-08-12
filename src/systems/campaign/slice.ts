/**
 * SLICE `campaign` — AI ĐANG GIỮ CÁI GÌ, VÀ QUÂN ĐANG ĐỨNG Ở ĐÂU.
 *
 * Slice này cố tình NHỎ. Nó không chép lại bản đồ (bản đồ là dữ liệu tĩnh ở
 * `data/campaign-map.json`) và không chép lại quân số (quân số là của slice
 * `military`). Nó chỉ giữ đúng bốn thứ mà bản đồ không tự biết:
 *
 *   `control`   mục tiêu nào ĐÃ ĐỔI CHỦ — và chỉ những mục tiêu đã đổi chủ.
 *               Ô chưa ai đụng tới không có mặt ở đây; chủ của nó vẫn là chủ
 *               khai trong file dữ liệu. Ghi cả 438 mục tiêu vào save chỉ để
 *               chép lại một thứ đã có sẵn là cách chắc chắn nhất để hai bản
 *               lệch nhau ở lần sửa bản đồ đầu tiên.
 *   `vassals`   ai thần phục ai. Chư hầu KHÔNG mất đất: nó vẫn giữ ô của mình,
 *               nhưng ô ấy tính vào cuộc chinh phục của tôn chủ (mục 4 của
 *               `conquest`), và trên bản đồ nó mang màu tôn chủ kèm sọc màu cũ.
 *   `armies`    vị trí và tư thế. Quân số ở đây là con số ƯỚC LƯỢNG để vẽ nhãn.
 *   `sieges`    cuộc vây nào đang diễn ra ở ô nào, và đã bao nhiêu tuần.
 *
 * QUYỀN GHI LÀ `engine` CHO TẤT CẢ, không có ngoại lệ và đây là chỗ quan trọng
 * nhất của cả phần: nếu AI ghi thẳng được vào `armies.*.nodeId` thì một câu văn
 * "đạo quân của ngài đã tới trước cổng Vienna" là đủ để dịch chuyển ba nghìn
 * người qua bốn trăm cây số, và toàn bộ cơ chế hành quân của `march.ts` trở
 * thành đồ trang trí. Người kể chuyện muốn dời quân thì gọi
 * `moveArmyFromNarrative`, và hàm ấy trả về một LỆNH HÀNH QUÂN chứ không phải
 * một vị trí mới (R1).
 */

import { z } from 'zod';
import type { GameState, SliceDefinition } from '@/state/slices';

const marchSchema = z.object({
  path: z.array(z.string().min(1)).min(2),
  legIndex: z.number().int().min(0),
  legProgress: z.number().min(0).max(1),
  kmPerDay: z.number().min(1),
  kmDone: z.number().min(0),
  kmTotal: z.number().min(0),
  needsShip: z.boolean().default(false),
});

const armySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  factionId: z.string().default(''),
  forceId: z.string().default(''),
  troops: z.number().int().min(0).default(0),
  nodeId: z.string().min(1),
  stance: z.enum(['dong-quan', 'hanh-quan', 'vay-thanh', 'chiem-dong']).default('dong-quan'),
  march: marchSchema.nullable().default(null),
  siegeNodeId: z.string().default(''),
});

const siegeSchema = z.object({
  nodeId: z.string().min(1),
  attackerId: z.string().min(1),
  armyId: z.string().default(''),
  weeks: z.number().min(0).default(0),
  weeksNeeded: z.number().min(0).default(0),
});

export const campaignSliceSchema = z.object({
  /** `huyen_* → phe_*`. Chỉ ghi mục tiêu ĐÃ đổi chủ. */
  control: z.record(z.string(), z.string()).default({}),
  /** `phe_chư-hầu → phe_tôn-chủ`. */
  vassals: z.record(z.string(), z.string()).default({}),
  armies: z.array(armySchema).default([]),
  sieges: z.array(siegeSchema).default([]),
  /** Phe của người chơi. Rỗng khi người chơi chưa thuộc về ai. */
  playerFactionId: z.string().default(''),
  nextArmyNo: z.number().int().min(1).default(1),
  /** Sổ biến động lãnh thổ, mới nhất đứng đầu. Cắt còn 60 dòng. */
  chronicle: z.array(z.string()).default([]),
});

export type CampaignSliceState = z.infer<typeof campaignSliceSchema>;

export const campaignSlice: SliceDefinition = {
  id: 'campaign',
  version: 1,
  schema: campaignSliceSchema,
  defaults: () => ({
    control: {},
    vassals: {},
    armies: [],
    sieges: [],
    playerFactionId: '',
    nextArmyNo: 1,
    chronicle: [],
  }),
  permissions: {
    control: 'engine',
    'control.*': 'engine',
    vassals: 'engine',
    'vassals.*': 'engine',
    armies: 'engine',
    'armies.*': 'engine',
    sieges: 'engine',
    'sieges.*': 'engine',
    playerFactionId: 'engine',
    nextArmyNo: 'engine',
    chronicle: 'engine',
    'chronicle.*': 'engine',
  },
};

export function campaignStateOf(state: GameState | null): CampaignSliceState | null {
  if (state === null) return null;
  const parsed = campaignSliceSchema.safeParse(state['campaign']);
  return parsed.success ? parsed.data : null;
}

/** State rỗng — dùng cho test và cho màn hình mở trước khi có ván chơi. */
export function emptyCampaign(): CampaignSliceState {
  return campaignSliceSchema.parse({});
}

/** Thêm một dòng vào sổ biến động, giữ 60 dòng gần nhất. */
export function withChronicle(campaign: CampaignSliceState, lines: readonly string[]): CampaignSliceState {
  if (lines.length === 0) return campaign;
  return { ...campaign, chronicle: [...lines, ...campaign.chronicle].slice(0, 60) };
}
