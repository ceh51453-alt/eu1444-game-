/**
 * SLICE `world` — quyền ghi đúng bảng mục 10.
 *
 * ```
 * thời gian, thời tiết, mọi chỉ số thế giới    engine
 * hàng đợi sự kiện, tin đang lan               engine
 * mục tiêu và tính cách agent                  ai (qua tick sâu, có kiểm duyệt)
 * tin đồn, dư luận                             ai
 * ```
 *
 * MỘT SLICE, KHÔNG PHẢI HAI, khác hẳn Phần 13 và 14: agent, tin, và sự kiện KHÔNG
 * tách được. Một sự kiện sinh ra một tin; tin ấy tới tai một agent và đổi cái
 * agent tưởng là đúng; cái agent tưởng là đúng sinh ra sự kiện tiếp theo. Ba thứ
 * ấy là một vòng khép kín và cắt nó thành ba slice là ba lần đọc chéo mỗi tháng.
 *
 * VÌ SAO AI ĐƯỢC GHI VÀO `agents.*.goals` VÀ `agents.*.personality`, mà KHÔNG
 * được ghi vào `resources`: mục tiêu và tính cách là Ý ĐỊNH, và mục 1 nói thẳng
 * LLM trong mô phỏng ngầm chỉ đề xuất ý định. Nguồn lực là SỐ, và số thì engine
 * tính — một agent tự khai mình có ba nghìn quân là R1 vỡ ở chỗ không ai kiểm.
 *
 * "Có kiểm duyệt" trong bảng trên không phải một lời hứa suông: `batch.ts` vứt
 * mọi quyết định trỏ ra ngoài danh mục hành động đóng, và MVU vẫn chặn mọi op
 * chạm vào đường dẫn quyền `engine`. Hai lớp, và lớp thứ hai không tin lớp đầu.
 *
 * BIẾN PHỤ đăng ký ở cuối file, đúng mục 10: bản đồ tri thức của người chơi và
 * chỉ số ổn định châu lục.
 */

import { z } from 'zod';
import { DEFAULT_START_DATE } from '@/core/clock';
import type { GameState, SliceDefinition } from '@/state/slices';
import { costConfig, newsConfig } from './data';

const meter = z.number().min(0).max(100);

const gameDateSchema = z.object({
  year: z.number().int(),
  month: z.number().int().min(1).max(12),
  day: z.number().int().min(1).max(31),
  hour: z.number().int().min(0).max(23),
});

// ---------------------------------------------------------------------------
// Agent
// ---------------------------------------------------------------------------

export const agentGoalSchema = z.object({
  id: z.string().min(1),
  kind: z.string().min(1),
  target: z.string().default(''),
  priority: meter,
  deadline: z.number().int().optional(),
  progress: meter,
});

export const agentSchema = z.object({
  npcId: z.string().min(1),
  name: z.string().default(''),
  tier: z.enum(['A', 'B', 'C']),
  regionId: z.string().default(''),
  powerId: z.string().default(''),
  age: z.number().int().min(0).max(140),
  alive: z.boolean().default(true),
  goals: z.array(agentGoalSchema).default([]),
  personality: z.record(z.string(), meter).default({}),
  resources: z.object({
    money: z.number(),
    men: meter,
    influence: meter,
  }),
  relationships: z
    .array(z.object({ npcId: z.string().min(1), bond: z.number().min(-100).max(100), kind: z.string().default('') }))
    .default([]),
  knowledge: z.array(z.string()).default([]),
  pendingActions: z
    .array(
      z.object({
        actionId: z.string().min(1),
        targetId: z.string().default(''),
        magnitude: z.string().default('vua'),
        dueMonth: z.number().int(),
        goalId: z.string().default(''),
      }),
    )
    .default([]),
  lastActedTick: z.number().int().default(0),
  wokeBy: z.string().default(''),
});

// ---------------------------------------------------------------------------
// Sự kiện và tin
// ---------------------------------------------------------------------------

export const worldEventSchema = z.object({
  id: z.string().min(1),
  kind: z.string().min(1),
  scope: z.enum(['the-gioi', 'quoc-gia', 'vung', 'thanh-tri', 'ca-nhan']),
  importance: z.number().int().min(1).max(5),
  requiresDecision: z.boolean().default(false),
  options: z.array(z.object({ id: z.string().min(1), label: z.string(), note: z.string().default('') })).optional(),
  deadline: gameDateSchema.optional(),
  regionId: z.string().default(''),
  occurredAt: gameDateSchema,
  actorId: z.string().default(''),
  targetId: z.string().default(''),
  amount: z.number().default(0),
  text: z.string().default(''),
  headline: z.string().default(''),
  effects: z.array(z.object({ path: z.string(), delta: z.number() })).default([]),
});

export const newsItemSchema = z.object({
  id: z.string().min(1),
  eventId: z.string().min(1),
  origin: z.object({ x: z.number(), y: z.number() }),
  originRegionId: z.string().default(''),
  destinationRegionId: z.string().default(''),
  occurredAt: gameDateSchema,
  importance: z.number().int().min(1).max(5),
  carrierId: z.string().min(1),
  daysLeft: z.number().min(0),
  daysTotal: z.number().min(0),
  accuracy: meter,
  distortions: z.array(z.string()).default([]),
  numberFactor: z.number().min(0).default(1),
  flipped: z.boolean().default(false),
});

export const arrivedNewsSchema = z.object({
  id: z.string().min(1),
  eventId: z.string().min(1),
  kind: z.string().default(''),
  importance: z.number().int().min(1).max(5),
  scope: z.enum(['the-gioi', 'quoc-gia', 'vung', 'thanh-tri', 'ca-nhan']).default('vung'),
  arrivedAt: gameDateSchema,
  occurredAt: gameDateSchema,
  source: z.string().default(''),
  daysLate: z.number().min(0).default(0),
  confidence: meter,
  text: z.string().default(''),
  headline: z.string().default(''),
  distortions: z.array(z.string()).default([]),
  read: z.boolean().default(false),
  regionId: z.string().default(''),
});

// ---------------------------------------------------------------------------
// Slice
// ---------------------------------------------------------------------------

export const worldSliceSchema = z.object({
  /**
   * Tháng tuyệt đối (`year * 12 + month`) của tick sâu gần nhất.
   *
   * Không lưu `GameDate` ở đây: `meta.gameDate` đã là nguồn sự thật của thời
   * gian, và hai cuốn lịch trong một save là hai cuốn lịch sẽ lệch nhau.
   */
  lastDeepMonth: z.number().int().default(0),
  lastFastTurn: z.number().int().default(-1),
  agents: z.array(agentSchema).default([]),
  /** Tin ĐANG TRÊN ĐƯỜNG. Rời khỏi đây khi `daysLeft` về 0. */
  inFlight: z.array(newsItemSchema).default([]),
  /** Hàng đợi biến cố đã xảy ra — nguồn sự thật, chưa chắc người chơi đã biết. */
  events: z.array(worldEventSchema).default([]),
  /** LUỒNG 2 của mục 7: dòng tin luôn hiển thị, kiểu biên niên. */
  feed: z.array(arrivedNewsSchema).default([]),
  /** LUỒNG 1 của mục 7: chồng thẻ cần người chơi quyết định. Giữ id sự kiện. */
  cards: z.array(z.string()).default([]),
  /** Vùng người chơi đã đầu tư sứ giả / mua tin / gián điệp (mục 6). */
  intel: z.array(z.object({ regionId: z.string().min(1), kindId: z.string().min(1) })).default([]),
  budget: z.object({
    /** Tháng tuyệt đối mà bộ đếm đang tính cho. Sang tháng mới thì reset. */
    month: z.number().int().default(0),
    requestsUsed: z.number().int().min(0).default(0),
    textRequestsUsed: z.number().int().min(0).default(0),
    tokensIn: z.number().int().min(0).default(0),
    tokensOut: z.number().int().min(0).default(0),
    /** Cộng dồn cả ván, đơn vị đô. Giá lấy từ cài đặt, không nằm trong save. */
    costUsd: z.number().min(0).default(0),
    /**
     * Số tick sâu đã chạy cả ván.
     *
     * Mẫu số của câu hỏi mà mục 13 gọi là quan trọng nhất — *"chơi một năm trong
     * game tốn bao nhiêu tiền proxy"*. Suy ngược từ `lastDeepMonth` thì sai với
     * mọi save nạp giữa chừng, và suy từ số dòng nhật ký thì sai vì nhật ký có
     * trần.
     */
    monthsSimulated: z.number().int().min(0).default(0),
    /** NÚT TẮT HẲN LLM trong mô phỏng ngầm (mục 5). */
    llmEnabled: z.boolean().default(true),
    maxRequestsPerMonth: z.number().int().min(0).default(3),
  }),
  /** Nhật ký tick sâu — tua lại được để tìm chỗ hỏng (mục 9). */
  log: z.array(z.string()).default([]),
  /** Bất biến đã vi phạm và đã tự sửa. Không bao giờ im lặng bỏ qua (mục 9). */
  repairs: z.array(z.string()).default([]),
  /** Tin đồn — AI ghi (mục 10). Engine không đọc để tính bất cứ thứ gì. */
  rumours: z.array(z.object({ regionId: z.string().default(''), text: z.string() })).default([]),
  /** Dư luận — AI ghi. Cũng không vào công thức nào. */
  opinion: z.array(z.object({ subject: z.string().default(''), text: z.string() })).default([]),
});

export type WorldSliceState = z.infer<typeof worldSliceSchema>;

export const worldSlice: SliceDefinition = {
  id: 'world',
  version: 1,
  schema: worldSliceSchema,
  defaults: () => ({
    lastDeepMonth: DEFAULT_START_DATE.year * 12 + DEFAULT_START_DATE.month,
    lastFastTurn: -1,
    agents: [],
    inFlight: [],
    events: [],
    feed: [],
    cards: [],
    intel: [],
    budget: {
      month: DEFAULT_START_DATE.year * 12 + DEFAULT_START_DATE.month,
      requestsUsed: 0,
      textRequestsUsed: 0,
      tokensIn: 0,
      tokensOut: 0,
      costUsd: 0,
      monthsSimulated: 0,
      llmEnabled: costConfig().llmEnabledDefault,
      maxRequestsPerMonth: costConfig().maxRequestsPerMonth,
    },
    log: [],
    repairs: [],
    rumours: [],
    opinion: [],
  }),

  permissions: {
    // Thời gian, hàng đợi, tin đang lan, ngân sách: engine, không ngoại lệ.
    lastDeepMonth: 'engine',
    lastFastTurn: 'engine',
    inFlight: 'engine',
    'inFlight.*': 'engine',
    events: 'engine',
    'events.*': 'engine',
    feed: 'engine',
    'feed.*': 'engine',
    cards: 'engine',
    'cards.*': 'engine',
    intel: 'engine',
    'intel.*': 'engine',
    'budget.*': 'engine',
    log: 'engine',
    'log.*': 'engine',
    repairs: 'engine',
    'repairs.*': 'engine',

    // Agent: engine giữ cả mảng và mọi con số của nó…
    agents: 'engine',
    'agents.*': 'engine',
    'agents.*.resources': 'engine',
    'agents.*.resources.*': 'engine',
    'agents.*.tier': 'engine',
    'agents.*.alive': 'engine',
    'agents.*.age': 'engine',
    'agents.*.knowledge': 'engine',
    'agents.*.knowledge.*': 'engine',
    // …trừ hai thứ là Ý ĐỊNH chứ không phải số (mục 10).
    'agents.*.goals': 'ai',
    'agents.*.goals.*': 'ai',
    'agents.*.personality': 'ai',
    'agents.*.personality.*': 'ai',

    // Hai chỗ AI ghi thoải mái, và cả hai không có hệ quả cơ học nào.
    rumours: 'ai',
    'rumours.*': 'ai',
    opinion: 'ai',
    'opinion.*': 'ai',
  },

  derived: [
    {
      /**
       * BẢN ĐỒ TRI THỨC (mục 10, mục 11) — vùng nào mình nắm rõ, vùng nào chỉ
       * nghe đồn, vùng nào mù tịt.
       *
       * Tính từ DÒNG TIN chứ không từ slice tri thức của Phần 4, và khác biệt ấy
       * là cố ý: `knowledge.known` nói người chơi biết những SỰ VIỆC nào, còn bản
       * đồ này nói người chơi có tai mắt Ở ĐÂU. Một người biết rõ mười chuyện ở
       * Constantinople vẫn mù tịt về Novgorod, và cái mù tịt ấy mới là thứ đáng vẽ
       * lên bản đồ.
       */
      id: 'banDoTriThuc',
      deps: ['world'],
      compute(state: GameState): unknown {
        const parsed = worldSliceSchema.safeParse(state['world']);
        if (!parsed.success) return [];

        const rumourBelow = newsConfig().rumourBelow;
        const byRegion = new Map<string, { count: number; sum: number; latest: number }>();
        for (const item of parsed.data.feed) {
          if (item.regionId === '') continue;
          const row = byRegion.get(item.regionId) ?? { count: 0, sum: 0, latest: 0 };
          const stamp = item.arrivedAt.year * 372 + item.arrivedAt.month * 31 + item.arrivedAt.day;
          byRegion.set(item.regionId, {
            count: row.count + 1,
            sum: row.sum + item.confidence,
            latest: Math.max(row.latest, stamp),
          });
        }

        const intelBonus = new Map<string, number>();
        for (const row of parsed.data.intel) {
          intelBonus.set(row.regionId, (intelBonus.get(row.regionId) ?? 0) + 12);
        }

        const ids = new Set([...byRegion.keys(), ...intelBonus.keys()]);
        return [...ids]
          .map((regionId) => {
            const row = byRegion.get(regionId);
            const average = row === undefined || row.count === 0 ? 0 : row.sum / row.count;
            // Nghe nhiều lần về một nơi thì hiểu nơi ấy rõ hơn, nhưng lợi ích
            // giảm dần: mười tin đồn không thành một sứ giả.
            const depth = row === undefined ? 0 : Math.min(20, Math.log2(row.count + 1) * 9);
            const clarity = Math.round(Math.min(100, average * 0.75 + depth + (intelBonus.get(regionId) ?? 0)));
            return {
              regionId,
              clarity,
              reports: row?.count ?? 0,
              level: clarity >= rumourBelow + 20 ? 'biet-ro' : clarity >= rumourBelow - 20 ? 'nghe-noi' : 'mu-tit',
            };
          })
          .sort((left, right) => right.clarity - left.clarity);
      },
    },
    {
      /**
       * ỔN ĐỊNH CHÂU LỤC (mục 10) — một con số 0–100 đọc từ chính mô phỏng.
       *
       * KHÔNG đọc slice `nations`: bàn cờ chính trị của Phần 14 đã có biến phụ
       * riêng cho cán cân quyền lực và nguy cơ ly khai. Con số ở đây trả lời một
       * câu khác — "châu lục này đang yên hay đang cháy", đo bằng mật độ và mức
       * quan trọng của biến cố gần đây. Một châu Âu không có biến cố nào là một
       * châu Âu yên; một châu Âu tháng nào cũng có ba việc mức 5 thì không.
       */
      id: 'onDinhChauLuc',
      deps: ['world', 'meta'],
      compute(state: GameState): unknown {
        const parsed = worldSliceSchema.safeParse(state['world']);
        if (!parsed.success) return 100;

        const now = state.meta.gameDate.year * 12 + state.meta.gameDate.month;
        let heat = 0;
        for (const event of parsed.data.events) {
          const age = now - (event.occurredAt.year * 12 + event.occurredAt.month);
          if (age < 0 || age > 24) continue;
          // Biến cố cũ nguội dần, biến cố lớn nóng lâu hơn.
          heat += event.importance * event.importance * (1 - age / 24);
        }
        return Math.max(0, Math.min(100, Math.round(100 - heat * 1.5)));
      },
    },
  ],

  constraints: [
    {
      id: 'world.tin-khong-di-nguoc-thoi-gian',
      /**
       * Một tin tới nơi TRƯỚC khi chuyện xảy ra là cả hệ tin tức nói dối, và nó
       * nói dối theo cách người chơi không bao giờ tự phát hiện được — họ chỉ
       * thấy mình biết trước mọi thứ và tưởng đó là do mình chơi giỏi.
       */
      check(state: GameState): string | null {
        const parsed = worldSliceSchema.safeParse(state['world']);
        if (!parsed.success) return null;
        for (const item of parsed.data.feed) {
          const arrived = item.arrivedAt.year * 372 + item.arrivedAt.month * 31 + item.arrivedAt.day;
          const occurred = item.occurredAt.year * 372 + item.occurredAt.month * 31 + item.occurredAt.day;
          if (arrived < occurred) return `tin "${item.id}" tới trước khi chuyện xảy ra`;
        }
        return null;
      },
    },
    {
      id: 'world.moi-agent-mot-dong',
      /** Hai dòng cho cùng một NPC thì "ông ta đang định làm gì" có hai đáp án. */
      check(state: GameState): string | null {
        const parsed = worldSliceSchema.safeParse(state['world']);
        if (!parsed.success) return null;
        const seen = new Set<string>();
        for (const agent of parsed.data.agents) {
          if (seen.has(agent.npcId)) return `agent "${agent.npcId}" có hai dòng`;
          seen.add(agent.npcId);
        }
        return null;
      },
    },
    {
      id: 'world.the-can-quyet-phai-co-su-kien',
      /** Một tấm thẻ trỏ vào biến cố đã bị dọn đi là một hộp thoại rỗng. */
      check(state: GameState): string | null {
        const parsed = worldSliceSchema.safeParse(state['world']);
        if (!parsed.success) return null;
        const ids = new Set(parsed.data.events.map((event) => event.id));
        const orphan = parsed.data.cards.find((cardId) => !ids.has(cardId));
        return orphan === undefined ? null : `thẻ "${orphan}" không còn biến cố nào`;
      },
    },
  ],
};

// ---------------------------------------------------------------------------
// Đọc
// ---------------------------------------------------------------------------

export function worldStateOf(state: GameState | null): WorldSliceState | null {
  if (state === null) return null;
  const parsed = worldSliceSchema.safeParse(state['world']);
  return parsed.success ? parsed.data : null;
}

export function agentOf(state: GameState | null, npcId: string): WorldSliceState['agents'][number] | null {
  return worldStateOf(state)?.agents.find((agent) => agent.npcId === npcId) ?? null;
}

/** Tháng tuyệt đối — đơn vị nhịp của tick sâu. */
export function absoluteMonth(date: { year: number; month: number }): number {
  return date.year * 12 + date.month;
}
