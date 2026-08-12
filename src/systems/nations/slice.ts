/**
 * HAI SLICE `nations` VÀ `religions` — quyền ghi đúng bảng mục 7.
 *
 * ```
 * 'nations'   mọi chỉ số quốc gia, phiếu bầu, tiến độ cải cách   engine
 *             tin đồn triều đình, dư luận về một nhân vật         ai
 * 'religions' tỷ lệ theo vùng, uy tín tôn giáo                    engine
 *             lời tiên tri, tin đồn phép lạ                       ai
 * ```
 *
 * HAI SLICE, KHÔNG PHẢI MỘT, cùng lý do Phần 13 tách `realm` khỏi `vassals`: bản
 * đồ tôn giáo đổi theo một nhịp khác hẳn bàn cờ chính trị, và Phần 15 sẽ đọc nó
 * riêng. Gộp lại là một patch của AI về "tin đồn phép lạ" phải đi qua cùng một cây
 * quyền với tiến độ cải cách đế chế.
 *
 * VÌ SAO AI KHÔNG ĐƯỢC GHI MỘT CON SỐ NÀO Ở ĐÂY: cả hai slice là THẾ GIỚI CHẠY
 * SAU LƯNG NGƯỜI CHƠI. Nếu AI sửa được uy tín Giáo hội hay lá phiếu tuyển hầu thì
 * nó vừa kể chuyện vừa quyết định chuyện — và R1 sụp ở đúng chỗ khó phát hiện
 * nhất, vì không ai kiểm tra lại một câu văn.
 *
 * BIẾN PHỤ đăng ký ở cuối file, đúng mục 7: cán cân quyền lực châu lục, nguy cơ ly
 * khai từng nước, chỉ số căng thẳng tôn giáo.
 */

import { z } from 'zod';
import type { GameState, SliceDefinition } from '@/state/slices';
import { powerBoardSchema, MINIGAME_KINDS } from './boards';
import { religionRelation } from './data';

// ---------------------------------------------------------------------------
// nations
// ---------------------------------------------------------------------------

const meter = z.number().min(0).max(100);

export const populationGroupSchema = z.object({
  raceId: z.string().min(1),
  population: z.number().min(0).max(1),
  status: z.enum(['trong-dung', 'dung-nap', 'thue-rieng', 'truy-buc', 'han-che']),
  grievance: meter,
  usefulness: meter,
  /** Trần VĨNH VIỄN sau truy bức. Không bao giờ nâng lên lại (mục 3). */
  usefulnessCeiling: meter.default(100),
  persecutedSinceYear: z.number().int().min(0).default(0),
});

export const powerStateSchema = z.object({
  id: z.string().startsWith('nation_'),
  minigame: z.enum(MINIGAME_KINDS),
  treasury: z.number(),
  income: z.number(),
  prestige: meter,
  stability: meter,
  cohesion: meter,
  military: meter,
  land: z.number().min(0),
  groups: z.array(populationGroupSchema).default([]),
  dominantMood: meter.default(50),
  board: powerBoardSchema,
  fallen: z.boolean().default(false),
});

export const relationRowSchema = z.object({
  a: z.string().startsWith('nation_'),
  b: z.string().startsWith('nation_'),
  value: z.number().min(-100).max(100),
  base: z.number().min(-100).max(100),
  claim: z.boolean().default(false),
  atWar: z.boolean().default(false),
  warYears: z.number().int().min(0).default(0),
  exhaustion: z.number().min(0).default(0),
  treaties: z.array(z.object({ id: z.string().min(1), yearsLeft: z.number().int() })).default([]),
});

export const worldEventSchema = z.object({
  id: z.string().min(1),
  year: z.number().int(),
  powerId: z.string().default(''),
  rippleId: z.string().default(''),
  text: z.string().min(1),
  scope: z.enum(['noi-bo', 'chau-luc']),
  targets: z.array(z.string()).default([]),
});

export const exileSchema = z.object({
  raceId: z.string().min(1),
  fromPowerId: z.string().min(1),
  toPowerId: z.string().min(1),
  year: z.number().int(),
  people: z.number().min(0),
  grudge: meter,
});

export const nationsSliceSchema = z.object({
  powers: z.array(powerStateSchema).default([]),
  relations: z.array(relationRowSchema).default([]),
  /** DÒNG THỜI GIAN SỰ KIỆN LỚN CỦA CHÂU LỤC (mục 8). Mới nhất ở đầu. */
  timeline: z.array(worldEventSchema).default([]),
  /** Cộng đồng lưu vong — Phần 15 phải nhớ và cho họ hành động về sau (mục 3). */
  exiles: z.array(exileSchema).default([]),
  /** Thế lực đang mở trong tab Thế giới. */
  viewing: z.string().default(''),
  /** Tin đồn triều đình — AI ghi (mục 7). Không vào công thức nào. */
  courtRumours: z.array(z.object({ powerId: z.string(), text: z.string() })).default([]),
  /** Dư luận về một nhân vật — AI ghi. Cũng không vào công thức nào. */
  opinion: z.array(z.object({ subject: z.string(), text: z.string() })).default([]),
});

export type NationsSliceState = z.infer<typeof nationsSliceSchema>;

// ---------------------------------------------------------------------------
// religions
// ---------------------------------------------------------------------------

export const faithAreaSchema = z.object({
  areaId: z.string().min(1),
  mix: z.array(z.object({ religionId: z.string().startsWith('rel_'), share: z.number().min(0).max(1) })).default([]),
});

export const religionsSliceSchema = z.object({
  areas: z.array(faithAreaSchema).default([]),
  /** Uy tín từng tôn giáo, 0–100. Uy tín Giáo hội là con số Phần 15 đọc nhiều nhất. */
  prestige: z.record(z.string(), meter).default({}),
  /** Tiếng vọng khủng hoảng còn sống — quy tắc bắt buộc của mục 5. */
  echoes: z
    .array(z.object({ triggerId: z.string().min(1), yearsLeft: z.number().int().min(0), sharePerYear: z.number() }))
    .default([]),
  /** Lời tiên tri — AI ghi (mục 7). */
  prophecies: z.array(z.object({ areaId: z.string().default(''), text: z.string() })).default([]),
  /** Tin đồn phép lạ — AI ghi. */
  miracleRumours: z.array(z.object({ areaId: z.string().default(''), text: z.string() })).default([]),
});

export type ReligionsSliceState = z.infer<typeof religionsSliceSchema>;

// ---------------------------------------------------------------------------
// Đăng ký
// ---------------------------------------------------------------------------

export const nationsSlice: SliceDefinition = {
  id: 'nations',
  version: 1,
  schema: nationsSliceSchema,
  defaults: () => ({
    powers: [],
    relations: [],
    timeline: [],
    exiles: [],
    viewing: '',
    courtRumours: [],
    opinion: [],
  }),
  permissions: {
    // Mọi chỉ số quốc gia, phiếu bầu, tiến độ cải cách: engine, không ngoại lệ.
    powers: 'engine',
    'powers.*': 'engine',
    relations: 'engine',
    'relations.*': 'engine',
    timeline: 'engine',
    'timeline.*': 'engine',
    exiles: 'engine',
    'exiles.*': 'engine',
    viewing: 'engine',
    // Hai chỗ DUY NHẤT AI được ghi, và cả hai đều không có hệ quả cơ học.
    courtRumours: 'ai',
    'courtRumours.*': 'ai',
    opinion: 'ai',
    'opinion.*': 'ai',
  },
  derived: [
    {
      /**
       * CÁN CÂN QUYỀN LỰC CHÂU LỤC (mục 7) — phần trăm sức nặng của từng thế lực.
       *
       * Một con số duy nhất không nói được gì ở đây: câu hỏi thật luôn là "ai đang
       * lớn lên so với ai", nên biến phụ này trả về cả bảng.
       */
      id: 'canCanQuyenLuc',
      deps: ['nations'],
      compute(state: GameState): unknown {
        const parsed = nationsSliceSchema.safeParse(state['nations']);
        if (!parsed.success) return [];
        const alive = parsed.data.powers.filter((power) => !power.fallen);
        const weights = alive.map((power) => ({
          powerId: power.id,
          weight: Math.max(0, power.land * 6 + power.military * 0.8 + power.income / 60 + power.prestige * 0.3),
        }));
        const total = weights.reduce((sum, row) => sum + row.weight, 0) || 1;
        return weights
          .map((row) => ({ powerId: row.powerId, share: Math.round((row.weight / total) * 1000) / 10 }))
          .sort((left, right) => right.share - left.share);
      },
    },
    {
      /** NGUY CƠ LY KHAI từng nước (mục 7): gắn kết thấp cộng bất ổn cao. */
      id: 'nguyCoLyKhai',
      deps: ['nations'],
      compute(state: GameState): unknown {
        const parsed = nationsSliceSchema.safeParse(state['nations']);
        if (!parsed.success) return [];
        return parsed.data.powers
          .filter((power) => !power.fallen)
          .map((power) => ({
            powerId: power.id,
            risk: Math.max(0, Math.min(100, Math.round((100 - power.cohesion) * 0.6 + (100 - power.stability) * 0.4))),
          }))
          .sort((left, right) => right.risk - left.risk);
      },
    },
  ],
  constraints: [
    {
      id: 'nations.tam-the-loai-khac-nhau',
      /**
       * TÁM THẾ LỰC, TÁM THỂ LOẠI. Đây là mục 1 dựng thành ràng buộc chạy được:
       * một save mà hai thế lực cùng `minigame` là một save mà hai quốc gia chơi
       * giống nhau, và bài kiểm tra ranh giới của cả phần nằm ở đúng dòng này.
       */
      check(state: GameState): string | null {
        const parsed = nationsSliceSchema.safeParse(state['nations']);
        if (!parsed.success) return null;
        const seen = new Map<string, string>();
        for (const power of parsed.data.powers) {
          const owner = seen.get(power.minigame);
          if (owner !== undefined) return `"${power.id}" và "${owner}" cùng thể loại minigame "${power.minigame}"`;
          seen.set(power.minigame, power.id);
          if (power.board.kind !== power.minigame) {
            return `"${power.id}" khai thể loại "${power.minigame}" nhưng bảng là "${power.board.kind}"`;
          }
        }
        return null;
      },
    },
    {
      id: 'nations.mot-cap-mot-dong',
      /** Hai dòng cho cùng một cặp thì "hai nước này quan hệ thế nào" có hai đáp án. */
      check(state: GameState): string | null {
        const parsed = nationsSliceSchema.safeParse(state['nations']);
        if (!parsed.success) return null;
        const seen = new Set<string>();
        for (const row of parsed.data.relations) {
          const key = row.a < row.b ? `${row.a}|${row.b}` : `${row.b}|${row.a}`;
          if (seen.has(key)) return `cặp ${key} có hai dòng quan hệ`;
          seen.add(key);
        }
        return null;
      },
    },
    {
      id: 'nations.dan-so-cong-lai-mot',
      /** Oán hận và nổi dậy tính trên tỷ lệ dân — lệch tổng là tính trên dân số ma. */
      check(state: GameState): string | null {
        const parsed = nationsSliceSchema.safeParse(state['nations']);
        if (!parsed.success) return null;
        for (const power of parsed.data.powers) {
          if (power.groups.length === 0) continue;
          const total = power.groups.reduce((sum, group) => sum + group.population, 0);
          if (Math.abs(total - 1) > 0.05) {
            return `"${power.id}" có tổng tỷ lệ dân ${total.toFixed(2)}`;
          }
        }
        return null;
      },
    },
  ],
};

export const religionsSlice: SliceDefinition = {
  id: 'religions',
  version: 1,
  schema: religionsSliceSchema,
  defaults: () => ({ areas: [], prestige: {}, echoes: [], prophecies: [], miracleRumours: [] }),
  permissions: {
    areas: 'engine',
    'areas.*': 'engine',
    prestige: 'engine',
    'prestige.*': 'engine',
    echoes: 'engine',
    'echoes.*': 'engine',
    // Lời tiên tri và tin đồn phép lạ là CHỮ, không phải số. AI ghi thoải mái, và
    // engine không đọc chúng để tính bất cứ thứ gì — phép lạ THẬT đi qua
    // `spread.miracle` của data, không đi qua một câu văn.
    prophecies: 'ai',
    'prophecies.*': 'ai',
    miracleRumours: 'ai',
    'miracleRumours.*': 'ai',
  },
  derived: [
    {
      /**
       * CHỈ SỐ CĂNG THẲNG TÔN GIÁO (mục 7).
       *
       * Không phải "bao nhiêu tôn giáo" mà là "hai tôn giáo lớn nhất ghét nhau tới
       * đâu, và chúng có ngang sức không". Một vùng 95/5 giữa hai kẻ tử thù thì
       * yên; một vùng 50/50 thì sắp cháy.
       */
      id: 'cangThangTonGiao',
      deps: ['religions'],
      compute(state: GameState): unknown {
        const parsed = religionsSliceSchema.safeParse(state['religions']);
        if (!parsed.success) return [];
        return parsed.data.areas
          .map((area) => {
            const sorted = [...area.mix].sort((left, right) => right.share - left.share);
            const first = sorted[0];
            const second = sorted[1];
            if (first === undefined || second === undefined) return { areaId: area.areaId, tension: 0 };
            const hostility = Math.max(0, -religionRelation(first.religionId, second.religionId));
            const balance = (second.share / Math.max(0.0001, first.share)) * 2;
            return { areaId: area.areaId, tension: Math.round(Math.min(100, hostility * Math.min(1, balance))) };
          })
          .sort((left, right) => right.tension - left.tension);
      },
    },
  ],
  constraints: [
    {
      id: 'religions.ty-le-cong-lai-mot',
      check(state: GameState): string | null {
        const parsed = religionsSliceSchema.safeParse(state['religions']);
        if (!parsed.success) return null;
        for (const area of parsed.data.areas) {
          if (area.mix.length === 0) continue;
          const total = area.mix.reduce((sum, row) => sum + row.share, 0);
          if (Math.abs(total - 1) > 0.05) return `vùng "${area.areaId}" có tổng tỷ lệ tôn giáo ${total.toFixed(2)}`;
        }
        return null;
      },
    },
  ],
};

// ---------------------------------------------------------------------------
// Đọc
// ---------------------------------------------------------------------------

export function nationsStateOf(state: GameState | null): NationsSliceState | null {
  if (state === null) return null;
  const parsed = nationsSliceSchema.safeParse(state['nations']);
  return parsed.success ? parsed.data : null;
}

export function religionsStateOf(state: GameState | null): ReligionsSliceState | null {
  if (state === null) return null;
  const parsed = religionsSliceSchema.safeParse(state['religions']);
  return parsed.success ? parsed.data : null;
}

export function powerOf(state: GameState | null, powerId: string): NationsSliceState['powers'][number] | null {
  return nationsStateOf(state)?.powers.find((power) => power.id === powerId) ?? null;
}
