/**
 * SLICE `holdings` — NHIỀU THÀNH TRÌ, MỘT TÒA CHÍNH (Phần 12 mục 10, việc 12.2).
 *
 * QUYỀN GHI, đúng bảng của mục 10:
 * ```
 * mọi con số (dân, tài nguyên, tiến độ, integrity)   engine
 * bố cục lưới, hàng đợi xây dựng                     engine (người chơi bấm)
 * tên thành trì, tên công trình do người chơi đặt     locked sau khi đặt
 * danh tiếng địa phương, tin đồn trong thành          ai
 * quan hệ với các nhân vật trong thành                ai
 * ```
 *
 * HAI CHỖ ĐÁNG GIẢI THÍCH:
 *
 * **Tên là `locked`, không phải `engine`.** Mục 10 nói "locked SAU KHI đặt", mà
 * quyền ghi trong Phần 2 là tĩnh theo đường dẫn chứ không theo thời điểm. Nên
 * tên khoá cứng từ đầu và chỉ đổi được qua `renameHolding()` — một cửa hẹp, cố
 * ý, chạy ở lúc tạo. AI không bao giờ đổi được tên một thành trì, và đó chính là
 * điều mục 10 muốn: nếu AI đổi tên được thì Phụ lục A mục 9a (không trùng tên
 * với lãnh thổ) mất chỗ dựa ngay lượt đầu.
 *
 * **`rumours` và `relations` là `ai`.** Đây là hai chỗ DUY NHẤT trong cả slice
 * mà AI được ghi, và cả hai đều là văn bản không có hệ quả cơ học. Nếu AI ghi
 * được vào `population.total` thì một đoạn văn cảm động sẽ sinh ra ba trăm dân,
 * và R1 sụp trong đúng một lượt.
 *
 * KHÔNG SLICE NÀO ĐỌC THẲNG VÀO SLICE KIA (mục 1). `holdings` không khai một
 * trường nào trỏ sang `realm`; quan hệ giữa hai tầng đi qua ba giao diện ở
 * `interfaces.ts`, và chúng là dữ liệu thuần chứ không phải con trỏ.
 */

import { z } from 'zod';
import { holdingIdSchema } from '@/state/schema/ids';
import type { GameState, SliceDefinition } from '@/state/slices';
import type { Holding } from './types';

const cellSchema = z.object({ x: z.number().int(), y: z.number().int() });

const tileSchema = z.object({
  x: z.number().int().min(0),
  y: z.number().int().min(0),
  terrain: z.string().min(1),
  occupiedBy: z.string().default(''),
});

const placedSchema = z.object({
  id: z.string().min(1),
  buildingId: z.string().startsWith('bld_'),
  at: cellSchema,
  integrity: z.number().min(0).max(100),
  quality: z.number().min(0),
  decayMultiplier: z.number().min(0),
  customName: z.string().default(''),
  builtOnTurn: z.number().int().min(0),
  maintained: z.boolean().default(true),
});

const projectSchema = z.object({
  id: z.string().min(1),
  buildingId: z.string().startsWith('bld_'),
  at: cellSchema,
  manWeeksLeft: z.number().min(0),
  weeksLeft: z.number().min(0),
  crew: z.number().min(0),
  delivered: z.record(z.string(), z.number()).default({}),
  missing: z.record(z.string(), z.number()).default({}),
  architectSkill: z.number().min(0).max(100),
  architectId: z.string().default(''),
  stalled: z.string().default(''),
  startedOnTurn: z.number().int().min(0),
  qualityTier: z.string().default(''),
});

const populationSchema = z.object({
  total: z.number().min(0),
  morale: z.number().min(0).max(100),
  strata: z
    .array(z.object({ id: z.string().min(1), people: z.number().min(0), morale: z.number().min(0).max(100) }))
    .default([]),
  races: z.array(z.object({ raceId: z.string().min(1), people: z.number().min(0) })).default([]),
  raceTension: z.number().min(0),
  levied: z.number().min(0),
  levyWeeks: z.number().int().min(0),
  skilled: z.record(z.string(), z.number()).default({}),
  training: z.array(z.object({ skillId: z.string().min(1), weeksLeft: z.number().min(0) })).default([]),
});

export const holdingSchema = z.object({
  id: holdingIdSchema,
  name: z.string().min(1),
  tierId: z.string().min(1),
  gridSize: z.number().int().min(2),
  tiles: z.array(tileSchema),
  buildings: z.array(placedSchema).default([]),
  projects: z.array(projectSchema).default([]),
  hinterland: z.array(z.object({ terrain: z.string().min(1), count: z.number().int().min(0) })).default([]),
  population: populationSchema,
  stores: z.record(z.string(), z.number()).default({}),
  ownership: z.object({
    path: z.enum(['xuat-than', 'duoc-phong', 'danh-chiem', 'phat-trien']),
    legitimacy: z.number().min(0).max(100),
    rivalClaimant: z.string().default(''),
    sinceTurn: z.number().int().min(0),
    conqueredHatred: z.number().min(0).max(100),
  }),
  permits: z.object({
    granted: z.array(z.string()).default([]),
    grantedWorks: z.array(z.string()).default([]),
    illegalWorks: z.array(z.string()).default([]),
    discovered: z.boolean().default(false),
  }),
  obligations: z.object({
    serviceDaysPerYear: z.number().min(0),
    tributePerYear: z.number().min(0),
    produceQuotaPerYear: z.number().min(0),
    paidThisYear: z.boolean().default(false),
    arrearsYears: z.number().int().min(0),
  }),
  seat: z.boolean().default(false),
  besieged: z.boolean().default(false),
  plague: z.boolean().default(false),
  hygiene: z.number().min(0).max(100),
  lastTurn: z.number().int().min(0),
  weeksLived: z.number().int().min(0),
});

export const holdingsSliceSchema = z.object({
  /** Danh sách thành trì đang sở hữu. Rỗng là chưa có cái nào. */
  list: z.array(holdingSchema).default([]),
  /** Thành trì đang mở trên màn hình. Rỗng nghĩa là chưa chọn. */
  viewing: z.string().default(''),
  /** Tin đồn trong thành — AI ghi, engine không đọc để tính gì. */
  rumours: z.array(z.object({ holdingId: z.string(), text: z.string() })).default([]),
  /** Quan hệ với người trong thành — AI ghi. */
  relations: z.array(z.object({ holdingId: z.string(), npcId: z.string(), note: z.string() })).default([]),
  /** Danh tiếng địa phương của lãnh chúa ở từng thành trì — AI ghi. */
  localFame: z.array(z.object({ holdingId: z.string(), text: z.string() })).default([]),
});

export type HoldingsSliceState = z.infer<typeof holdingsSliceSchema>;

export const holdingsSlice: SliceDefinition = {
  id: 'holdings',
  version: 1,
  schema: holdingsSliceSchema,
  defaults: () => ({ list: [], viewing: '', rumours: [], relations: [], localFame: [] }),
  permissions: {
    // Con số: engine. Không có ngoại lệ, và đây là lá chắn chính của R1 ở phần này.
    'list.*.population.*': 'engine',
    'list.*.stores.*': 'engine',
    'list.*.projects.*': 'engine',
    'list.*.buildings.*': 'engine',
    'list.*.tiles.*': 'engine',
    'list.*.hinterland.*': 'engine',
    'list.*.ownership.*': 'engine',
    'list.*.permits.*': 'engine',
    'list.*.obligations.*': 'engine',
    'list.*.hygiene': 'engine',
    'list.*.gridSize': 'engine',
    'list.*.tierId': 'engine',
    'list.*.besieged': 'engine',
    'list.*.plague': 'engine',
    'list.*.seat': 'engine',
    'list.*.lastTurn': 'engine',
    'list.*.weeksLived': 'engine',
    // Tên: khoá cứng. Xem chú thích đầu file.
    'list.*.id': 'locked',
    'list.*.name': 'locked',
    'list.*.buildings.*.customName': 'locked',
    // Ba chỗ duy nhất AI được ghi, và cả ba đều không có hệ quả cơ học.
    //
    // Khai CẢ MẢNG chứ không chỉ khai `rumours.*`: thêm một tin đồn là một op
    // `push` VÀO CHÍNH MẢNG, và quyền của `holdings.rumours.*` không nói gì về
    // quyền của `holdings.rumours`. Chỉ khai phần tử thì AI đọc được tin đồn mà
    // không bao giờ thêm được cái nào, và cả ba dòng này thành trang trí.
    rumours: 'ai',
    'rumours.*': 'ai',
    relations: 'ai',
    'relations.*': 'ai',
    localFame: 'ai',
    'localFame.*': 'ai',
    viewing: 'engine',
  },
  constraints: [
    {
      id: 'holdings.mot-toa-chinh',
      /**
       * ĐÚNG MỘT TÒA CHÍNH (mục 12.2).
       *
       * Hai tòa chính nghĩa là hai "nơi ở", và mọi thứ hỏi "lãnh chúa đang ở
       * đâu" — khối prompt 6A của Phụ lục A, phần thưởng lòng dân, hàng thừa kế
       * của Phần 13 — sẽ nhận hai câu trả lời khác nhau tùy chỗ nào hỏi trước.
       */
      check(state: GameState): string | null {
        const parsed = holdingsSliceSchema.safeParse(state['holdings']);
        if (!parsed.success) return null;
        const seats = parsed.data.list.filter((holding) => holding.seat);
        if (parsed.data.list.length > 0 && seats.length === 0) {
          return 'có thành trì nhưng không thành nào là tòa chính';
        }
        if (seats.length > 1) {
          return `có ${String(seats.length)} tòa chính: ${seats.map((row) => row.name).join(', ')}`;
        }
        return null;
      },
    },
    {
      id: 'holdings.khong-trung-ten',
      /** Phụ lục A mục 9a — chặn trùng tên từ khâu DỮ LIỆU, không phải khâu prompt. */
      check(state: GameState): string | null {
        const parsed = holdingsSliceSchema.safeParse(state['holdings']);
        if (!parsed.success) return null;
        const seen = new Set<string>();
        for (const holding of parsed.data.list) {
          const key = holding.name.trim().toLocaleLowerCase('vi');
          if (seen.has(key)) return `hai thành trì cùng tên "${holding.name}"`;
          seen.add(key);
        }
        return null;
      },
    },
  ],
};

// ---------------------------------------------------------------------------
// Đọc
// ---------------------------------------------------------------------------

export function holdingsStateOf(state: GameState | null): HoldingsSliceState | null {
  if (state === null) return null;
  const parsed = holdingsSliceSchema.safeParse(state['holdings']);
  return parsed.success ? parsed.data : null;
}

export function allHoldings(state: GameState | null): Holding[] {
  return (holdingsStateOf(state)?.list ?? []) as Holding[];
}

export function holdingById(state: GameState | null, id: string): Holding | null {
  return allHoldings(state).find((holding) => holding.id === id) ?? null;
}

/** TÒA CHÍNH — nơi ở. Khối prompt 6A của Phụ lục A đứng ở đây. */
export function seatOf(state: GameState | null): Holding | null {
  return allHoldings(state).find((holding) => holding.seat) ?? null;
}

/**
 * TỔNG DÂN của mọi thành trì đang sở hữu.
 *
 * Đây là BIẾN PHỤ cộng từ các thành trì, đúng như mục 1 yêu cầu — không phải một
 * biến gốc ai đó cập nhật song song. Phần 13 muốn biết tổng dân một vùng thì cộng
 * từ đây, và phải LÀM TRÒN kèm chữ "ước chừng" trước khi đưa vào prompt (Phụ lục
 * A mục 6). Con số chính xác chỉ được nói ở tầng thành trì.
 */
export function totalPopulation(state: GameState | null): number {
  return allHoldings(state).reduce((sum, holding) => sum + holding.population.total, 0);
}
