/**
 * HAI SLICE `realm` VÀ `vassals` — quyền ghi đúng bảng mục 10.
 *
 * ```
 * 'realm'   mọi con số (thuế, tài chính, unrest, phát triển)      engine
 *           luật đang áp, dự án đang chạy                          engine
 *           tin đồn trong vùng, dư luận                            ai
 * 'vassals' loyalty, power, obligations                            engine
 *           grievances, ambition, tin đồn về chư hầu               ai
 * ```
 *
 * HAI SLICE, KHÔNG PHẢI MỘT. Chư hầu là NPC thật và AI được ghi vào ba trường của
 * họ; lãnh thổ thì gần như toàn engine. Gộp lại thành một slice nghĩa là mẫu
 * quyền phải phân biệt `list.*.loyalty` với `list.*.grievances` bằng hai dòng
 * chồng lên nhau trên cùng một cây — làm được, nhưng một lần sửa ẩu là AI ghi
 * được vào lòng trung, và cả mục 7 sụp.
 *
 * `realm` KHÔNG ĐỌC THẲNG VÀO `holdings` (mục 1). Trong toàn bộ schema dưới đây,
 * chỗ duy nhất nhắc tới tầng thành trì là `provinces[*].holdingIds` — một danh
 * sách ID, đúng như mục 6 cho phép: "trỏ sang P12, KHÔNG sao chép dữ liệu". Tổng
 * dân vùng không có ở đây, và đó là cố ý: nó là BIẾN PHỤ cộng qua giao diện.
 *
 * BIẾN PHỤ đăng ký ở cuối file, đúng mục 10: tổng thu, tổng quân huy động được,
 * chỉ số ổn định, nguy cơ nổi loạn.
 */

import { z } from 'zod';
import { holdingIdSchema, provinceIdSchema, realmIdSchema, npcIdSchema } from '@/state/schema/ids';
import type { GameState, SliceDefinition } from '@/state/slices';
import { unrestBandFor } from './data';
import type { Province, Vassal } from './types';

// ---------------------------------------------------------------------------
// realm
// ---------------------------------------------------------------------------

const mixSchema = z.array(z.object({ id: z.string().min(1), share: z.number().min(0).max(1) }));

export const provinceSchema = z.object({
  id: provinceIdSchema,
  regionId: z.string().min(1),
  parentRealmId: realmIdSchema,
  fiefId: z.string().default(''),
  holderId: z.string().default(''),
  terrain: z.string().min(1),
  climate: z.string().min(1),
  area: z.number().min(0),
  /** TRỎ sang Phần 12 (mục 6). Danh sách id, không phải danh sách `Holding`. */
  holdingIds: z.array(holdingIdSchema).default([]),
  development: z.number().min(0).max(100),
  unrest: z.number().min(0).max(100),
  banditry: z.number().min(0).max(100),
  roads: z.number().int().min(0),
  infrastructure: z.array(z.string()).default([]),
  cultureMix: mixSchema.default([]),
  raceMix: mixSchema.default([]),
  resources: z.array(z.string()).default([]),
  laws: z.array(z.string()).default([]),
});

const activeProjectSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  provinceId: z.string().min(1),
  yearsLeft: z.number().min(0),
  spent: z.number().min(0),
  startedYear: z.number().int(),
  stalled: z.string().default(''),
});

const courtAppointmentSchema = z.object({
  seatId: z.string().min(1),
  npcId: z.string().min(1),
  name: z.string().min(1),
  skill: z.number().min(0).max(100),
  loyalty: z.number().min(0).max(100),
  sinceYear: z.number().int(),
  caughtSkimming: z.boolean().default(false),
});

const courtCaseSchema = z.object({
  id: z.string().min(1),
  caseTypeId: z.string().min(1),
  provinceId: z.string().default(''),
  plaintiff: z.string().default(''),
  plaintiffName: z.string().default(''),
  defendant: z.string().default(''),
  defendantName: z.string().default(''),
  openedYear: z.number().int(),
  summary: z.string().default(''),
  verdictId: z.string().default(''),
  bothRefuse: z.boolean().default(false),
});

const ledgerSchema = z.object({
  taxRevenue: z.number().default(0),
  tributeIn: z.number().default(0),
  tributeOut: z.number().default(0),
  lawUpkeep: z.number().default(0),
  courtSalary: z.number().default(0),
  projectSpend: z.number().default(0),
  skimmed: z.number().default(0),
  net: z.number().default(0),
});

export const realmSliceSchema = z.object({
  /** `realm_*`. Rỗng nghĩa là chưa cai trị vùng nào — phần lớn nhân vật. */
  id: z.string().default(''),
  /** Tên lãnh thổ, LUÔN kèm loại từ: "bá quốc Swabia" (Phụ lục A mục 9c). */
  name: z.string().default(''),
  provinces: z.array(provinceSchema).default([]),
  /** Thuế suất theo nhóm dân, tính bằng PHẦN TRĂM (Phụ lục A mục 5). */
  taxRates: z.record(z.string(), z.number().min(0).max(100)).default({}),
  /** Luật cấp lãnh thổ đang áp. */
  laws: z.array(z.string()).default([]),
  projects: z.array(activeProjectSchema).default([]),
  treasury: z.number().default(0),
  court: z.array(courtAppointmentSchema).default([]),
  cases: z.array(courtCaseSchema).default([]),
  ledger: ledgerSchema.default({
    taxRevenue: 0,
    tributeIn: 0,
    tributeOut: 0,
    lawUpkeep: 0,
    courtSalary: 0,
    projectSpend: 0,
    skimmed: 0,
    net: 0,
  }),
  /** Tỉnh đang mở trên bản đồ vùng. */
  viewing: z.string().default(''),
  /** Tin đồn trong vùng — AI ghi, engine không đọc để tính gì. */
  rumours: z.array(z.object({ provinceId: z.string(), text: z.string() })).default([]),
  /** Dư luận — AI ghi. Không có hệ quả cơ học nào. */
  opinion: z.array(z.object({ text: z.string() })).default([]),
});

export type RealmSliceState = z.infer<typeof realmSliceSchema>;

// ---------------------------------------------------------------------------
// vassals
// ---------------------------------------------------------------------------

const grievanceSchema = z.object({
  id: z.string().min(1),
  year: z.number().int(),
  reason: z.string().min(1),
  weight: z.number().min(0),
});

export const vassalSchema = z.object({
  npcId: npcIdSchema,
  name: z.string().min(1),
  titleId: z.string().min(1),
  fiefId: z.string().default(''),
  provinceIds: z.array(z.string()).default([]),
  loyalty: z.number().min(0).max(100),
  power: z.number().min(0).max(100),
  ambition: z.number().min(0).max(100),
  personality: z.string().default(''),
  claims: z.array(z.string()).default([]),
  obligations: z.object({
    tax: z.number().min(0),
    levyDays: z.number().min(0),
    courtAttendance: z.number().min(0),
  }),
  grievances: z.array(grievanceSchema).default([]),
  rebelling: z.boolean().default(false),
  factionId: z.string().default(''),
  holdingCount: z.number().int().min(0).default(0),
  levyMen: z.number().min(0).default(0),
});

export const vassalsSliceSchema = z.object({
  list: z.array(vassalSchema).default([]),
  factions: z
    .array(
      z.object({
        id: z.string().min(1),
        name: z.string().min(1),
        members: z.array(z.string()).default([]),
        tierId: z.string().min(1).default('nhom-ket-uoc'),
        cohesion: z.number().min(0).max(100).default(30),
        influence: z.number().min(0).max(100).default(0),
        leaderId: z.string().default(''),
        memberRanks: z.record(z.string(), z.string()).default({}),
        demand: z.string().default(''),
        formedYear: z.number().int(),
      }),
    )
    .default([]),
  /** Tin đồn về chư hầu — AI ghi (mục 10). */
  rumours: z.array(z.object({ npcId: z.string(), text: z.string() })).default([]),
});

export type VassalsSliceState = z.infer<typeof vassalsSliceSchema>;

// ---------------------------------------------------------------------------
// Đăng ký
// ---------------------------------------------------------------------------

export const realmSlice: SliceDefinition = {
  id: 'realm',
  version: 1,
  schema: realmSliceSchema,
  defaults: () => ({
    id: '',
    name: '',
    provinces: [],
    taxRates: {},
    laws: [],
    projects: [],
    treasury: 0,
    court: [],
    cases: [],
    ledger: { taxRevenue: 0, tributeIn: 0, tributeOut: 0, lawUpkeep: 0, courtSalary: 0, projectSpend: 0, skimmed: 0, net: 0 },
    viewing: '',
    rumours: [],
    opinion: [],
  }),
  permissions: {
    // Mọi con số: engine. Không ngoại lệ — đây là lá chắn R1 của phần này.
    'provinces.*': 'engine',
    'taxRates.*': 'engine',
    laws: 'engine',
    'laws.*': 'engine',
    'projects.*': 'engine',
    treasury: 'engine',
    'court.*': 'engine',
    'cases.*': 'engine',
    'ledger.*': 'engine',
    viewing: 'engine',
    // Tên lãnh thổ khoá cứng, cùng lý do tên thành trì khoá cứng ở Phần 12: Phụ
    // lục A mục 9a (không trùng tên) chỉ đứng vững khi tên không đổi được.
    id: 'locked',
    name: 'locked',
    // Hai chỗ DUY NHẤT AI được ghi, và cả hai đều không có hệ quả cơ học. Khai cả
    // mảng lẫn phần tử: thêm một tin đồn là một op `push` VÀO CHÍNH MẢNG.
    rumours: 'ai',
    'rumours.*': 'ai',
    opinion: 'ai',
    'opinion.*': 'ai',
  },
  derived: [
    {
      /** TỔNG THU dự kiến của cả vùng (mục 10). Ước chừng, và UI phải nói thế. */
      id: 'tongThuVung',
      // Khai cả slice chứ không khai từng nhánh: `safeParse` đọc TOÀN BỘ object
      // để kiểm hình dạng, nên một danh sách deps hẹp hơn là một lời khai sai —
      // và Proxy kiểm deps ở chế độ dev sẽ bắt đúng chỗ ấy.
      deps: ['realm'],
      compute(state: GameState): unknown {
        const parsed = realmSliceSchema.safeParse(state['realm']);
        if (!parsed.success) return 0;
        return Math.round(
          parsed.data.provinces.reduce(
            (sum, province) => sum + province.development * unrestBandFor(province.unrest).revenueFactor,
            0,
          ),
        );
      },
    },
    {
      /** CHỈ SỐ ỔN ĐỊNH 0–100: 100 trừ bất ổn trung bình có trọng số theo phát triển. */
      id: 'chiSoOnDinh',
      deps: ['realm'],
      compute(state: GameState): unknown {
        const parsed = realmSliceSchema.safeParse(state['realm']);
        if (!parsed.success || parsed.data.provinces.length === 0) return 100;
        const weight = parsed.data.provinces.reduce((sum, province) => sum + Math.max(1, province.development), 0);
        const unrest = parsed.data.provinces.reduce(
          (sum, province) => sum + province.unrest * Math.max(1, province.development),
          0,
        );
        return Math.round(100 - unrest / weight);
      },
    },
  ],
  constraints: [
    {
      id: 'realm.mot-tinh-mot-chu',
      /**
       * MỘT TỈNH KHÔNG ĐƯỢC NẰM TRONG HAI THÁI ẤP.
       *
       * Hai thái ấp cùng cai một tỉnh nghĩa là hai người cùng đặt thuế suất ở đó,
       * và câu "tỉnh này nộp cho ai" có hai câu trả lời — đúng loại lỗi mà sổ
       * nghĩa vụ của mục 11 sẽ hiện ra thành hai dòng mâu thuẫn.
       */
      check(state: GameState): string | null {
        const parsed = realmSliceSchema.safeParse(state['realm']);
        if (!parsed.success) return null;
        const seen = new Set<string>();
        for (const province of parsed.data.provinces) {
          if (seen.has(province.id)) return `tỉnh "${province.regionId}" xuất hiện hai lần`;
          seen.add(province.id);
        }
        return null;
      },
    },
    {
      id: 'realm.mot-thanh-tri-mot-tinh',
      /**
       * MỘT THÀNH TRÌ CHỈ NẰM TRONG MỘT TỈNH (Phụ lục A mục 9d).
       *
       * Ba tầng là lãnh thổ > tỉnh > thành trì. Một `hold_*` xuất hiện trong hai
       * tỉnh là ba tầng đã gãy ở tầng giữa, và mọi phép cộng "tổng của vùng" sẽ
       * đếm nó hai lần.
       */
      check(state: GameState): string | null {
        const parsed = realmSliceSchema.safeParse(state['realm']);
        if (!parsed.success) return null;
        const seen = new Map<string, string>();
        for (const province of parsed.data.provinces) {
          for (const holdingId of province.holdingIds) {
            const owner = seen.get(holdingId);
            if (owner !== undefined) return `thành trì ${holdingId} nằm trong cả hai tỉnh ${owner} và ${province.id}`;
            seen.set(holdingId, province.id);
          }
        }
        return null;
      },
    },
    {
      id: 'realm.mot-ghe-mot-nguoi',
      /** Hai người cùng một ghế triều đình thì lệnh của ai được nghe (mục 8). */
      check(state: GameState): string | null {
        const parsed = realmSliceSchema.safeParse(state['realm']);
        if (!parsed.success) return null;
        const seen = new Set<string>();
        for (const seat of parsed.data.court) {
          if (seen.has(seat.seatId)) return `hai người cùng giữ ghế "${seat.seatId}"`;
          seen.add(seat.seatId);
        }
        return null;
      },
    },
  ],
};

export const vassalsSlice: SliceDefinition = {
  id: 'vassals',
  version: 1,
  schema: vassalsSliceSchema,
  defaults: () => ({ list: [], factions: [], rumours: [] }),
  permissions: {
    'list.*.loyalty': 'engine',
    'list.*.power': 'engine',
    'list.*.obligations.*': 'engine',
    'list.*.rebelling': 'engine',
    'list.*.factionId': 'engine',
    'list.*.holdingCount': 'engine',
    'list.*.levyMen': 'engine',
    'list.*.titleId': 'engine',
    'list.*.provinceIds': 'engine',
    'list.*.provinceIds.*': 'engine',
    'list.*.claims': 'engine',
    'list.*.claims.*': 'engine',
    'list.*.npcId': 'locked',
    'list.*.name': 'locked',
    // Ba chỗ AI được ghi (mục 10). Mối hận và tham vọng là ĐỘNG CƠ, không phải
    // con số vào công thức trực tiếp — chúng đi qua `grievanceWeight` của data,
    // nên AI thêm một mối hận là thêm một LÝ DO, không phải tự cho mình một
    // khoản trừ lòng trung tùy ý.
    'list.*.grievances': 'ai',
    'list.*.grievances.*': 'ai',
    'list.*.ambition': 'ai',
    'list.*.personality': 'ai',
    list: 'engine',
    'list.*': 'engine',
    factions: 'engine',
    'factions.*': 'engine',
    rumours: 'ai',
    'rumours.*': 'ai',
  },
  derived: [
    {
      /** NGUY CƠ NỔI LOẠN cao nhất trong đám chư hầu (mục 10). */
      id: 'nguyCoNoiLoan',
      deps: ['vassals'],
      compute(state: GameState): unknown {
        const parsed = vassalsSliceSchema.safeParse(state['vassals']);
        if (!parsed.success || parsed.data.list.length === 0) return 0;
        // Công thức thật ở `vassals.ts`; biến phụ chỉ cần một con số để bảng
        // trạng thái có thanh cảnh báo, nên nó dùng ba vế của mục 7 ở dạng thô.
        return Math.round(
          Math.max(
            ...parsed.data.list.map(
              (vassal) => (100 - vassal.loyalty) * 0.6 + vassal.power * 0.3 + (vassal.claims.length > 0 ? 10 : 0),
            ),
          ),
        );
      },
    },
    {
      /** TỔNG QUÂN HUY ĐỘNG ĐƯỢC từ chư hầu — ước chừng (mục 10). */
      id: 'tongQuanChuHau',
      deps: ['vassals'],
      compute(state: GameState): unknown {
        const parsed = vassalsSliceSchema.safeParse(state['vassals']);
        if (!parsed.success) return 0;
        return Math.round(
          parsed.data.list
            .filter((vassal) => !vassal.rebelling)
            .reduce((sum, vassal) => sum + vassal.levyMen * Math.max(0.3, vassal.loyalty / 100), 0),
        );
      },
    },
  ],
};

// ---------------------------------------------------------------------------
// Đọc
// ---------------------------------------------------------------------------

export function realmStateOf(state: GameState | null): RealmSliceState | null {
  if (state === null) return null;
  const parsed = realmSliceSchema.safeParse(state['realm']);
  return parsed.success ? parsed.data : null;
}

export function vassalsStateOf(state: GameState | null): VassalsSliceState | null {
  if (state === null) return null;
  const parsed = vassalsSliceSchema.safeParse(state['vassals']);
  return parsed.success ? parsed.data : null;
}

export function allProvinces(state: GameState | null): Province[] {
  return (realmStateOf(state)?.provinces ?? []) as Province[];
}

export function provinceById(state: GameState | null, id: string): Province | null {
  return allProvinces(state).find((province) => province.id === id) ?? null;
}

export function allVassals(state: GameState | null): Vassal[] {
  return (vassalsStateOf(state)?.list ?? []) as Vassal[];
}

export function vassalById(state: GameState | null, npcId: string): Vassal | null {
  return allVassals(state).find((vassal) => vassal.npcId === npcId) ?? null;
}

/** Tỉnh thuộc một thái ấp. Đây là cửa nối `titles` với `realm`, và nó đi một chiều. */
export function provincesOfFief(state: GameState | null, fiefId: string): Province[] {
  return allProvinces(state).filter((province) => province.fiefId === fiefId);
}
