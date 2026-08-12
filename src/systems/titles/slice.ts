/**
 * SLICE `titles` — TƯỚC ĐANG GIỮ VÀ CHÍNH DANH (mục 10).
 *
 * QUYỀN GHI, đúng bảng của mục 10:
 * ```
 * tước đang giữ, chính danh        engine
 * ```
 * Không có một dòng `ai` nào trong cả slice này, và đó không phải sự khắt khe
 * thừa. Chính danh là chỉ số trung tâm của cả phần (mục 5) và nó chảy vào MỌI
 * kiểm định cai trị qua registry của Phần 5. Cho AI ghi được vào đó nghĩa là một
 * đoạn văn cảm động sẽ hợp thức hóa một cuộc tiếm quyền, và R1 sụp trong đúng
 * một lượt.
 *
 * TÊN THÁI ẤP `locked` cùng lý do tên thành trì `locked` ở Phần 12: Phụ lục A
 * mục 9a chỉ đứng vững khi tên không đổi được sau lúc đặt.
 *
 * SLICE NÀY KHÔNG BIẾT GÌ VỀ `holdings`. Một thái ấp là một TỜ GIẤY; nó không
 * khai một thành trì nào, không khai một ô đất nào, và không khai một con số dân
 * nào. Mất thái ấp không có nghĩa là mất thành trì (Phụ lục A mục 1) — hai việc
 * ấy chỉ tách được nếu hai tầng không cầm chung một con trỏ.
 */

import { z } from 'zod';
import { fiefIdSchema } from '@/state/schema/ids';
import type { GameState, SliceDefinition } from '@/state/slices';
import { rankOf, titleOf } from './data';
import { TITLE_PATHS, type HeldTitle } from './types';

const obligationsSchema = z.object({
  levyDays: z.number().min(0),
  tribute: z.number().min(0),
  courtDays: z.number().min(0),
  paidThisYear: z.boolean().default(false),
  attendedThisYear: z.boolean().default(false),
  arrearsYears: z.number().int().min(0).default(0),
  levyDaysCalled: z.number().min(0).default(0),
});

export const heldTitleSchema = z.object({
  titleId: z.string().min(1),
  fiefId: fiefIdSchema,
  fiefName: z.string().min(1),
  ladderId: z.string().min(1),
  path: z.enum(TITLE_PATHS),
  legitimacy: z.number().min(0).max(100),
  sinceYear: z.number().int(),
  liege: z.string().default(''),
  obligations: obligationsSchema,
  termEndsYear: z.number().int().min(0).default(0),
  rivalClaimant: z.string().default(''),
  churchRecognised: z.boolean().default(false),
  note: z.string().default(''),
});

export const titlesSliceSchema = z.object({
  /** Mọi tước đang giữ, ở mọi thang (mục 3). Rỗng nghĩa là thường dân. */
  held: z.array(heldTitleSchema).default([]),
  /**
   * Tước đang mở trên màn hình. Rỗng nghĩa là chưa chọn — UI của mục 11 tự lấy
   * bậc cao nhất.
   */
  viewing: z.string().default(''),
  /** Luật kế vị đang áp cho nhà này (mục 9). */
  successionLawId: z.string().default('truong-nam'),
  /** Người thừa kế đã chỉ định. Rỗng nghĩa là để luật tự xếp. */
  designatedHeir: z.string().default(''),
  /** Sổ chính danh: mỗi dòng một lý do. Đây là câu trả lời cho "vì sao tôi hỏng". */
  legitimacyLog: z
    .array(
      z.object({
        year: z.number().int(),
        fiefId: z.string(),
        delta: z.number(),
        reason: z.string(),
      }),
    )
    .default([]),
});

export type TitlesSliceState = z.infer<typeof titlesSliceSchema>;

export const titlesSlice: SliceDefinition = {
  id: 'titles',
  version: 1,
  schema: titlesSliceSchema,
  defaults: () => ({
    held: [],
    viewing: '',
    successionLawId: 'truong-nam',
    designatedHeir: '',
    legitimacyLog: [],
  }),
  permissions: {
    held: 'engine',
    'held.*': 'engine',
    'held.*.legitimacy': 'engine',
    'held.*.obligations.*': 'engine',
    // Tên thái ấp và id: khoá cứng. Xem chú thích đầu file.
    'held.*.fiefId': 'locked',
    'held.*.fiefName': 'locked',
    viewing: 'engine',
    successionLawId: 'engine',
    designatedHeir: 'engine',
    legitimacyLog: 'engine',
    'legitimacyLog.*': 'engine',
  },
  constraints: [
    {
      id: 'titles.mot-thai-ap-mot-to-giay',
      /**
       * KHÔNG HAI TƯỚC NÀO DÙNG CHUNG MỘT TỜ GIẤY.
       *
       * Hai `HeldTitle` cùng `fiefId` nghĩa là hai bộ nghĩa vụ trên cùng một thái
       * ấp, và câu hỏi "năm nay ngài nợ bao nhiêu ngày quân dịch" có hai câu trả
       * lời tùy chỗ nào hỏi trước — đúng loại lỗi mà Phần 11 sẽ nuốt im lặng.
       */
      check(state: GameState): string | null {
        const parsed = titlesSliceSchema.safeParse(state['titles']);
        if (!parsed.success) return null;
        const seen = new Set<string>();
        for (const title of parsed.data.held) {
          if (seen.has(title.fiefId)) return `hai tước cùng cầm thái ấp "${title.fiefName}"`;
          seen.add(title.fiefId);
        }
        return null;
      },
    },
    {
      id: 'titles.tuoc-phai-co-trong-thang',
      /** Một tước không có trong `data/titles.json` là một bảng trạng thái rỗng (mục 4). */
      check(state: GameState): string | null {
        const parsed = titlesSliceSchema.safeParse(state['titles']);
        if (!parsed.success) return null;
        for (const held of parsed.data.held) {
          if (titleOf(held.titleId) === null) return `tước "${held.titleId}" không có trong thang nào`;
        }
        return null;
      },
    },
  ],
};

// ---------------------------------------------------------------------------
// Đọc
// ---------------------------------------------------------------------------

export function titlesStateOf(state: GameState | null): TitlesSliceState | null {
  if (state === null) return null;
  const parsed = titlesSliceSchema.safeParse(state['titles']);
  return parsed.success ? parsed.data : null;
}

export function heldTitles(state: GameState | null): HeldTitle[] {
  return (titlesStateOf(state)?.held ?? []) as HeldTitle[];
}

export function heldTitleOf(state: GameState | null, fiefId: string): HeldTitle | null {
  return heldTitles(state).find((title) => title.fiefId === fiefId) ?? null;
}

/**
 * TƯỚC CAO NHẤT ĐANG GIỮ.
 *
 * Người chơi giữ nhiều tước ở nhiều thang cùng lúc (mục 3), nên "tước của ngài"
 * là một câu hỏi có nhiều câu trả lời. Hàm này trả lời đúng một câu hẹp: tờ giấy
 * nào có bậc cao nhất — và đó là tờ mà kiểm định cai trị đứng lên.
 */
export function primaryTitleOf(state: GameState | null): HeldTitle | null {
  let best: HeldTitle | null = null;
  for (const title of heldTitles(state)) {
    if (best === null || rankOf(title.titleId) > rankOf(best.titleId)) best = title;
  }
  return best;
}

/** Bậc cao nhất đang giữ. 0 là thường dân — không có bảng cai trị nào. */
export function highestRank(state: GameState | null): number {
  const title = primaryTitleOf(state);
  return title === null ? 0 : rankOf(title.titleId);
}

/** Tước đang mở trên màn hình, hoặc bậc cao nhất khi chưa chọn (mục 11). */
export function viewingTitleOf(state: GameState | null): HeldTitle | null {
  const slice = titlesStateOf(state);
  if (slice === null) return null;
  const chosen = slice.held.find((title) => title.fiefId === slice.viewing);
  return (chosen ?? null) === null ? primaryTitleOf(state) : ((chosen ?? null) as HeldTitle | null);
}

/** Quyền một tước mở ra có đang nằm trong tay người chơi không (mục 4). */
export function hasGrant(state: GameState | null, grant: string): boolean {
  return heldTitles(state).some((held) => (titleOf(held.titleId)?.grants ?? []).includes(grant));
}
