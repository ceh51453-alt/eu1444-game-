/**
 * SLICE `character` THẬT (Phần 6) — thay slice tối giản của Phần 2 mục 10.8.
 *
 * Slice cũ giữ đúng ba ô (`hp`, `maxHp`, `str`) để chứng minh cơ chế quyền ghi
 * chạy. Slice này giữ nhân vật thật, và vẫn giữ NGUYÊN ba ô đó cùng `relations`,
 * `flags`, `notes.rumors`: chúng đã đi vào prompt (`prompts/05-ho-so-nhan-vat.ejs`),
 * vào `ai/query.ts`, vào trigger của Phần 4 và vào bảng biến của tab Cài đặt.
 * Đổi tên chúng ở đây là làm hỏng bốn chỗ ấy để đổi lấy đúng một cái tên đẹp hơn.
 *
 * QUYỀN GHI — đúng bảng của mục 8:
 *   identity.*, race, birthDate      locked
 *   stats.*, hp, skills.*.level      engine
 *   appearance.scars.*               engine   (Phần 7 thêm vào khi bị thương)
 *   appearance.* còn lại             locked
 *   relations.*, secrets.*           ai
 *   personality.*, notes.*           ai
 *
 * Vì sao `relations.*.trust` chứ không phải `relations.*.attitude` như mục 8
 * viết: đó là cùng một con số — thái độ của NPC với nhân vật — và cái tên `trust`
 * đã nằm trong prompt, trong `QueryApi.relation()` và trong test từ Phần 2.
 */

import { z } from 'zod';
import { DEFAULT_START_DATE } from '@/core/clock';
import { gameDateSchema } from '@/state/schema';
import type { GameState, SliceDefinition } from '@/state/slices';
import { readPath } from '@/state/slices';
import { gearWeight } from './gear';
import { highestRank } from './possessions';
import { effectiveAge, statCapOf } from './races';
import { STAT_IDS, STAT_MAX, STAT_MIN, type StatId } from './stats';

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const statValue = z.int().min(STAT_MIN).max(STAT_MAX);

export const scarSchema = z.object({
  /** Vùng trên bản đồ cơ thể của Phần 7. Ở Phần 6 mới là một chuỗi tự do. */
  site: z.string().max(60),
  cause: z.string().max(60),
  note: z.string().max(200).default(''),
});

export const appearanceSchema = z.object({
  heightCm: z.number().min(30).max(400),
  weightKg: z.number().min(5).max(600),
  build: z.string().max(40),
  /** Phần 7 dùng THẲNG cặp này để dựng bản đồ cơ thể (mục 4). */
  musclePct: z.number().min(0).max(100),
  fatPct: z.number().min(0).max(100),
  skin: z.string().max(60),
  hair: z.string().max(60),
  hairStyle: z.string().max(60),
  beard: z.string().max(60),
  eyes: z.string().max(60),
  eyeShape: z.string().max(60),
  face: z.string().max(120),
  /** Đặc trưng chủng tộc: sừng, tai, vảy, lông, cánh… */
  features: z.array(z.string().max(80)).max(12).default([]),
  mark: z.string().max(80).default(''),
  voice: z.string().max(60),
  gait: z.string().max(60),
  mannerism: z.string().max(80),
  clothing: z.string().max(200).default(''),
  /** Sẹo. Phần 7 GHI vào đây khi thương tích liền lại — nên nó là `engine`. */
  scars: z.array(scarSchema).max(60).default([]),
});

/**
 * Người nhà mang ĐỦ 12 chỉ số như người chơi, không phải một bộ rút gọn riêng.
 *
 * Đắt hơn cho save, nhưng đổi lại người nhà dùng chung được MỌI công thức: họ
 * kiểm định được bằng `runCheck`, chỉ huy được ở Phần 10, và mô phỏng ngầm ở
 * Phần 15 không phải nội suy ba con số thành mười hai. Một bộ chỉ số rút gọn
 * riêng nghĩa là mỗi phần sau phải tự đoán cách quy đổi, và chúng sẽ đoán khác
 * nhau.
 */
export const npcStatsSchema = z
  .object({
    str: statValue.default(10),
    agi: statValue.default(10),
    vit: statValue.default(10),
    per: statValue.default(10),
    int: statValue.default(10),
    wil: statValue.default(10),
    wit: statValue.default(10),
    arc: statValue.default(10),
    pre: statValue.default(10),
    elo: statValue.default(10),
    gui: statValue.default(10),
    emp: statValue.default(10),
  })
  .strict();

export const familyMemberSchema = z.object({
  id: z.string().max(60),
  name: z.string().max(80),
  /** `cha`, `me`, `anh`, `chi`, `em`, `ong`, `ba`, `vo`, `chong`, `con`, `ho-hang`. */
  relation: z.string().max(40),
  /** Người nhà có thể khác tộc với người chơi — con nuôi, mẹ kế, hôn nhân khác tộc. */
  race: z.string().max(60),
  /**
   * Gia tộc người này SINH RA TỪ — id trong `data/houses.json`.
   *
   * Đây là chỗ "mẹ là con gái vua Đức" thành cơ học: gán nhà mẹ là một gia tộc
   * đang cai trị thì `claims` của nhân vật mọc ra một yêu sách lên ngai đó.
   */
  houseId: z.string().max(60).default(''),
  /** Nếu người này CHÍNH LÀ một nhân vật trong lorebook thì trỏ vào đó. */
  loreEntry: z.string().max(80).default(''),
  sex: z.enum(['nam', 'nu']),
  age: z.int().min(0).max(2000),
  alive: z.boolean(),
  /** Tình trạng: khỏe, ốm yếu, mất tích, đã mất… */
  status: z.string().max(60),
  stats: npcStatsSchema,
  /** Nghề hoặc vai trò trong nhà. */
  role: z.string().max(80).default(''),
  /** Thái độ với người chơi, -100..100. AI ghi được. */
  attitude: z.int().min(-100).max(100),
  /** Mục tiêu riêng — người nhà là NPC thật, không phải chữ trang trí (mục 6). */
  goal: z.string().max(200),
  note: z.string().max(200).default(''),
});

/** Một món ĐANG MANG. Catalog ở `data/gear.json`; Phần 16 thay bằng vật phẩm thật. */
export const carriedGearSchema = z.object({
  item: z.string().max(60),
  material: z.string().max(40).default(''),
  quality: z.string().max(40).default('thuong'),
  slot: z.string().max(40).default('mang-theo'),
  equipped: z.boolean().default(true),
  note: z.string().max(200).default(''),
});

/** THÀNH TRÌ — một ĐIỂM. Phần 12 dựng hệ thật từ khai báo này. */
export const holdingClaimSchema = z.object({
  id: z.string().max(60),
  name: z.string().max(80),
  /** `thon` · `lang` · `tran` · `thanh` · `dai-thanh` (Phần 12 mục 3). */
  tier: z.string().max(40),
  /** `chu-so-huu` · `duoc-uy-thac` · `dong-so-huu` · `thua-ke-cho` · `dang-tranh-chap` · `don-tru`. */
  role: z.string().max(40),
  /** Tỉnh hoặc lãnh thổ chứa nó, id trong `regions.json`. */
  regionId: z.string().max(60).default(''),
  note: z.string().max(200).default(''),
});

/**
 * YÊU SÁCH — thứ nhân vật ĐANG ĐÒI, khác hẳn thứ đang giữ.
 *
 * `holdings` và `fiefs` là sở hữu; cái này là quyền đòi. Cả thế kỷ 15 nằm trong
 * khoảng cách giữa hai vế, nên chúng phải là hai khóa riêng. Phần 13 dựng hàng
 * thừa kế thật và quyết định yêu sách nào thắng.
 */
export const claimSchema = z.object({
  id: z.string().max(60),
  /** `realm` · `fief` · `holding`. */
  kind: z.string().max(20),
  target: z.string().max(60),
  targetName: z.string().max(80),
  /** `manh` · `vua` · `yeu` · `tranh-cai`. */
  strength: z.string().max(20),
  /** Thừa hưởng QUA AI — id người nhà, hoặc id NPC trong lorebook. */
  through: z.string().max(80).default(''),
  throughLabel: z.string().max(80).default(''),
  note: z.string().max(300).default(''),
});

/** THÁI ẤP — một TỜ GIẤY có ấn triện. Phần 13 dựng hệ thật từ khai báo này. */
export const fiefClaimSchema = z.object({
  id: z.string().max(60),
  name: z.string().max(80),
  /** Bậc trong thang tước vị (Phần 13 mục 2). */
  title: z.string().max(40),
  /** Thề với ai — id NPC hoặc tên. Rỗng nghĩa là giữ trực tiếp từ vương quyền. */
  liege: z.string().max(80).default(''),
  obligations: z.array(z.string().max(60)).max(8).default([]),
  note: z.string().max(200).default(''),
});

export const secretSchema = z.object({
  id: z.string().max(60),
  text: z.string().max(300),
  /** Đã bị lộ chưa. Cắm sang slice tri thức của Phần 4 lúc tạo nhân vật. */
  revealed: z.boolean().default(false),
});

export const characterSchema = z.object({
  identity: z.object({
    id: z.string(),
    /**
     * Chủng tộc chốt lúc tạo nhân vật — một id trong `data/races.json`.
     *
     * Phải là id thật chứ không phải một chữ tùy tiện như `'nguoi'`: Phần 4 lấy
     * thẳng giá trị này làm tag `audience` để chọn biến thể, và làm vế so của
     * sách `scope.kind: 'race'`. Một chữ không có trong bảng thì hai cơ chế đó
     * im lặng không bao giờ khớp.
     */
    race: z.string(),
    name: z.string().max(80).default(''),
    sex: z.enum(['nam', 'nu']).default('nam'),
    originId: z.string().default(''),
    birthRegionId: z.string().default(''),
    birthOrderId: z.string().default(''),
    lineageStateId: z.string().default(''),
    lineageName: z.string().max(80).default(''),
    /**
     * Nơi ĐANG ĐỨNG lúc ván bắt đầu — khác `birthRegionId`.
     *
     * Hai thứ này lệch nhau thường xuyên và cái lệch đó chính là câu chuyện:
     * lưu vong, hành hương, bị bán làm nô, đi lính đánh thuê. Gộp làm một là
     * mất luôn khả năng kể những chuyện đó ngay từ dòng đầu.
     */
    startRegionId: z.string().max(60).default(''),
    /**
     * Gia tộc — id trong `data/houses.json`, rỗng với người không có tên tuổi.
     *
     * Đây là dây nối vào thế giới đã có: gia tộc trỏ sang một entry lorebook
     * (người đứng đầu), sang `regions.json` (lãnh thổ, thành trì gốc), và mang
     * theo yêu sách. Một "đại quý tộc" không có nhà thì chỉ là mấy con số.
     */
    houseId: z.string().max(60).default(''),
    /** Văn hóa nuôi dạy — có thể khác chủng tộc. Id trong `data/cultures.json`. */
    cultureId: z.string().max(60).default(''),
    /** Mức hòa nhập văn hóa 0–100: nhân vào hiệu ứng của văn hóa đó. */
    culturalFit: z.int().min(0).max(100).default(70),
    birthDate: gameDateSchema.default({ ...DEFAULT_START_DATE, year: DEFAULT_START_DATE.year - 20 }),
    age: z.int().min(0).max(5000).default(20),
    language: z.string().max(80).default(''),
    /**
     * Đã đi hết luồng 9 bước chưa. UI mở trình tạo nhân vật khi còn `false`.
     * `locked` như mọi thứ khác trong `identity`: bước 9 là chỗ duy nhất bật nó.
     */
    finalized: z.boolean().default(false),
  }),

  stats: z
    .object({
      hp: z.int().min(0).max(200),
      maxHp: z.int().min(1).max(200),
      str: statValue,
      agi: statValue.default(10),
      vit: statValue.default(10),
      per: statValue.default(10),
      int: statValue.default(10),
      wil: statValue.default(10),
      wit: statValue.default(10),
      arc: statValue.default(10),
      pre: statValue.default(10),
      elo: statValue.default(10),
      gui: statValue.default(10),
      emp: statValue.default(10),
    })
    // Không `.loose()`: một ô lạ như `stats.mana` phải bị từ chối ở bước B1 chứ
    // không lặng lẽ nằm trong save (Phần 2 mục 10.3).
    .strict(),

  /**
   * Điểm rèn luyện phẳng 0–100. Cây kỹ năng và nhánh là Phần 8.
   *
   * Mọi nhánh mới của Phần 6 đều có `.default()`, kể cả những nhánh mà nhân vật
   * nào cũng có: một save tạo ở Phần 2–5 chỉ có `hp`, `maxHp`, `str`, và nếu các
   * nhánh này bắt buộc thì save đó parse hỏng rồi mất trắng. Đây là đường nâng
   * cấp thật của slice, không phải sự cẩu thả về kiểu.
   */
  skills: z.record(z.string(), z.object({ level: z.int().min(0).max(100) })).default({}),

  appearance: appearanceSchema.optional(),

  family: z.record(z.string(), familyMemberSchema).default({}),

  /** Quan hệ ngoài gia đình — AI ghi tự do trong giới hạn schema. */
  relations: z.record(
    z.string(),
    z.object({
      trust: z.int().min(-100).max(100),
      note: z.string().max(200),
      /** `thay-day`, `ban-than`, `ke-thu`, `an-nhan`, `chu-no`… Vắng là quen biết thường. */
      kind: z.string().max(40).optional(),
    }),
  ),

  allegiance: z
    .object({
      /** Lãnh chúa trực tiếp — id NPC hoặc tên. Rỗng nghĩa là chưa thề với ai. */
      liege: z.string().max(80).default(''),
      nationId: z.string().max(60).default(''),
      /** Vai trò trong thế lực đó: `than-dan`, `chu-hau`, `quan-lai`, `linh-danh-thue`… */
      standing: z.string().max(60).default('than-dan'),
      /** Id trong `data/religions.json`. `religion` bên dưới giữ tên đọc được. */
      religionId: z.string().max(60).default(''),
      religion: z.string().max(80).default(''),
      /** Mức sùng đạo 0–100: nhân vào hiệu ứng của tôn giáo đó. */
      piety: z.int().min(0).max(100).default(30),
      /** Phường hội, dòng tu, hiệp sĩ đoàn, hội thương nhân, hội trộm. */
      guilds: z.array(z.string().max(80)).max(10).default([]),
      /** Thái độ với từng thế lực, tính từ chủng tộc + xuất thân rồi sửa tay được. */
      attitudes: z.record(z.string(), z.int().min(-100).max(100)).default({}),
    })
    .default({
      liege: '',
      nationId: '',
      standing: 'than-dan',
      religionId: '',
      religion: '',
      piety: 30,
      guilds: [],
      attitudes: {},
    }),

  /** THÀNH TRÌ đang giữ — một ĐIỂM. Phần 12 dựng hệ thật từ đây. */
  holdings: z.array(holdingClaimSchema).max(20).default([]),

  /** THÁI ẤP đang giữ — một TỜ GIẤY. Phần 13 dựng hệ thật từ đây. */
  fiefs: z.array(fiefClaimSchema).max(20).default([]),

  /** Vai trò với LÃNH THỔ — một VÙNG. `khong-co` là phần lớn nhân vật. */
  realmRole: z.string().max(40).default('khong-co'),

  /** Yêu sách đang giữ — thứ ĐÒI, không phải thứ GIỮ. Phần 13 xử. */
  claims: z.array(claimSchema).max(20).default([]),

  /**
   * Cảnh mở đầu: ván bắt đầu ở đâu và có ai ở đó.
   *
   * Tách khỏi `identity.startRegionId` vì cái kia là VÙNG (một tỉnh, một lãnh
   * thổ) còn cái này là ĐIỂM và là người — thứ AI cần để viết đúng một cảnh,
   * chứ không phải để định vị trên bản đồ.
   */
  opening: z
    .object({
      /** Thành trì mở màn, id `hold_*` trong `regions.json`. */
      holdingId: z.string().max(60).default(''),
      /** Ai có mặt — id NPC trong lorebook. */
      withNpc: z.string().max(80).default(''),
      /** Đang làm gì lúc màn kéo lên. */
      situation: z.string().max(300).default(''),
    })
    .default({ holdingId: '', withNpc: '', situation: '' }),

  /** 1–3 điều nhân vật giấu (mục 7). Cắm sẵn vào slice tri thức của Phần 4. */
  secrets: z.array(secretSchema).max(10).default([]),

  resources: z
    .object({
      coins: z.int().min(0),
      /** Uy tín KHÔNG phải chỉ số (mục 1) — nó là tài nguyên, Phần 13 làm tiếp. */
      prestige: z.int().min(-100).max(1000),
    })
    .default({ coins: 0, prestige: 0 }),

  /** Trang bị đang mang. Catalog ở `data/gear.json`; Phần 16 thay bằng vật phẩm thật. */
  gear: z.array(carriedGearSchema).max(60).default([]),

  /**
   * Tài sản KHÔNG phải thành trì và KHÔNG phải trang bị: nhà đất, xưởng, kho
   * hàng, phần vốn. Để riêng vì một cái xưởng không phải một khu định cư có
   * tường và ô đất — nhét nó vào `holdings` là lẫn tầng ngay ở khâu dữ liệu.
   */
  property: z.array(z.string().max(120)).max(40).default([]),

  /** Tóm tắt bằng chữ cho prompt và cho phiếu nhân vật. */
  possessions: z.array(z.string().max(120)).max(40).default([]),

  personality: z
    .object({
      traits: z.array(z.string().max(60)).max(12).default([]),
      note: z.string().max(400).default(''),
    })
    .default({ traits: [], note: '' }),

  /** Cờ tình tiết. */
  flags: z.array(z.string()).max(50),
  notes: z.object({
    rumors: z.array(z.string().max(300)).max(50),
  }),
});

export type CharacterState = z.infer<typeof characterSchema>;
export type Appearance = z.infer<typeof appearanceSchema>;
export type FamilyMember = z.infer<typeof familyMemberSchema>;
export type Scar = z.infer<typeof scarSchema>;
export type Secret = z.infer<typeof secretSchema>;

// ---------------------------------------------------------------------------
// Đọc
// ---------------------------------------------------------------------------

/** Nhân vật hiện tại, hoặc null khi slice chưa đăng ký (test của phần khác). */
export function characterOf(state: GameState | null | undefined): CharacterState | null {
  if (state === null || state === undefined) return null;
  const raw = readPath(state, 'character');
  if (raw === null || raw === undefined || typeof raw !== 'object') return null;
  return raw as CharacterState;
}

/** Giá trị một chỉ số. Trả về null khi không có nhân vật — người gọi tự quyết. */
export function statValueOf(state: GameState | null | undefined, stat: StatId): number | null {
  const character = characterOf(state);
  const value = character?.stats[stat];
  return typeof value === 'number' ? value : null;
}

/** Điểm rèn luyện của một kỹ năng. Chưa học thì là 0, không phải null. */
export function trainingOf(state: GameState | null | undefined, skillId: string): number {
  return characterOf(state)?.skills[skillId]?.level ?? 0;
}

// ---------------------------------------------------------------------------
// Slice
// ---------------------------------------------------------------------------

function defaultStats(): Record<string, number> {
  const stats: Record<string, number> = { hp: 20, maxHp: 20 };
  for (const id of STAT_IDS) stats[id] = 10;
  return stats;
}

export const characterSlice: SliceDefinition = {
  id: 'character',
  version: 2,
  schema: characterSchema,

  defaults: () => ({
    identity: {
      id: 'npc_nguoi-choi',
      race: 'race_teuton',
      name: '',
      sex: 'nam',
      originId: '',
      birthRegionId: '',
      birthOrderId: '',
      lineageStateId: '',
      lineageName: '',
      startRegionId: '',
      houseId: '',
      cultureId: '',
      culturalFit: 70,
      birthDate: { ...DEFAULT_START_DATE, year: DEFAULT_START_DATE.year - 20 },
      age: 20,
      language: '',
      finalized: false,
    },
    stats: defaultStats(),
    skills: {},
    family: {},
    relations: {},
    allegiance: {
      liege: '',
      nationId: '',
      standing: 'than-dan',
      religionId: '',
      religion: '',
      piety: 30,
      guilds: [],
      attitudes: {},
    },
    holdings: [],
    fiefs: [],
    realmRole: 'khong-co',
    claims: [],
    opening: { holdingId: '', withNpc: '', situation: '' },
    secrets: [],
    resources: { coins: 0, prestige: 0 },
    gear: [],
    property: [],
    possessions: [],
    personality: { traits: [], note: '' },
    flags: [],
    notes: { rumors: [] },
  }),

  permissions: {
    // locked — chốt lúc tạo nhân vật rồi không ai ghi nữa, kể cả engine.
    'identity.*': 'locked',
    // engine — số vào thẳng công thức, AI đề xuất là bị từ chối.
    'stats.*': 'engine',
    'skills.*': 'engine',
    'skills.*.level': 'engine',
    'resources.*': 'engine',
    possessions: 'engine',
    property: 'engine',
    // Trang bị là số vào công thức (vế `+ trang bị` của mục 1). Phần 16 ghi
    // vào đây khi món đồ hỏng, gãy hoặc bị lấy mất — AI đề xuất là bị từ chối.
    gear: 'engine',
    'gear.*': 'engine',
    // Ba tầng sở hữu: engine ghi, vì mất một thành trì là hệ quả cơ học của
    // Phần 11/12/13, không phải một câu AI kể ra.
    holdings: 'engine',
    'holdings.*': 'engine',
    fiefs: 'engine',
    'fiefs.*': 'engine',
    realmRole: 'engine',
    // Yêu sách mạnh lên hay mất đi là hệ quả của Phần 13 (thừa kế, tước đoạt),
    // không phải một câu AI kể ra giữa lượt.
    claims: 'engine',
    'claims.*': 'engine',
    // Cảnh mở đầu chốt lúc tạo và không đổi nữa — nó là quá khứ, không phải state.
    'opening.*': 'locked',
    // Ngoại hình chốt lúc tạo, TRỪ sẹo: Phần 7 ghi vào đó khi thương tích liền.
    'appearance.*': 'locked',
    'appearance.scars': 'engine',
    'appearance.scars.*': 'engine',
    // Người nhà: thông tin gốc locked, chỉ số engine, thái độ và mục tiêu ai (mục 6).
    'family.*': 'locked',
    'family.*.stats': 'engine',
    'family.*.stats.*': 'engine',
    'family.*.attitude': 'ai',
    'family.*.goal': 'ai',
    'family.*.note': 'ai',
    'family.*.status': 'engine',
    'family.*.alive': 'engine',
    'family.*.age': 'engine',
    // ai — mô tả trạng thái thế giới truyện.
    'relations.*': 'ai',
    'secrets.*': 'ai',
    'allegiance.*': 'ai',
    // Trừ thái độ các thế lực: đó là con số vào phép kiểm ngoại giao của Phần
    // 13/14, không phải một lời kể.
    'allegiance.attitudes': 'engine',
    'allegiance.attitudes.*': 'engine',
    'personality.*': 'ai',
    flags: 'ai',
    'notes.*': 'ai',
  },

  constraints: [
    {
      id: 'hp-khong-vuot-maxHp',
      check(state) {
        const character = characterOf(state);
        if (character === null) return null;
        const { hp, maxHp } = character.stats;
        return hp > maxHp ? `hp=${hp} vượt quá maxHp=${maxHp}` : null;
      },
    },
    {
      /**
       * Trần chủng tộc là ràng buộc CHÉO chứ không phải `.max()` trong schema:
       * trần phụ thuộc `identity.race`, mà Zod không nhìn được sang field khác.
       * Không có nó thì một op engine cẩu thả đẩy Ogre lên INT 20 và không gì
       * chặn lại.
       */
      id: 'chi-so-khong-vuot-tran-chung-toc',
      check(state) {
        const character = characterOf(state);
        if (character === null) return null;
        const race = character.identity.race;
        for (const id of STAT_IDS) {
          const value = character.stats[id];
          const cap = statCapOf(race, id);
          if (typeof value === 'number' && value > cap) {
            return `${id}=${value} vượt trần ${cap} của chủng tộc ${race}`;
          }
        }
        return null;
      },
    },
    {
      /**
       * Hai thành trì trùng id là hai thành trì đè lên nhau lúc Phần 12 dựng
       * bảng, và cái mất đi sẽ không ai tìm được nữa. Cùng lý do với thái ấp.
       */
      id: 'so-huu-khong-trung-id',
      check(state) {
        const character = characterOf(state);
        if (character === null) return null;
        const holdings = character.holdings.map((entry) => entry.id);
        if (new Set(holdings).size !== holdings.length) return 'hai thành trì trùng id';
        const fiefs = character.fiefs.map((entry) => entry.id);
        if (new Set(fiefs).size !== fiefs.length) return 'hai thái ấp trùng id';
        return null;
      },
    },
    {
      id: 'ty-le-co-mo-khong-qua-100',
      check(state) {
        const appearance = characterOf(state)?.appearance;
        if (appearance === undefined) return null;
        const total = appearance.musclePct + appearance.fatPct;
        return total > 100 ? `cơ ${appearance.musclePct}% + mỡ ${appearance.fatPct}% vượt quá 100%` : null;
      },
    },
  ],

  // Biến phụ của mục 8: sức nâng, tốc độ, máu tối đa, sức chở, tầm nhìn, tuổi
  // tác hiệu dụng. Chúng là HÀM của state, dựng lại mỗi lượt, AI không ghi được.
  derived: [
    {
      id: 'combatPower',
      deps: ['character.stats.str', 'character.stats.hp', 'character.stats.maxHp'],
      compute(state) {
        const character = characterOf(state);
        if (character === null) return 0;
        const { str, hp, maxHp } = character.stats;
        // Sức chiến đấu tụt theo tỉ lệ máu còn lại.
        return Math.round(str * (hp / Math.max(1, maxHp)) * 10) / 10;
      },
    },
    {
      /** Máu tối đa THEO CÔNG THỨC. `stats.maxHp` là giá trị đã áp — Phần 7 hạ nó xuống khi tàn phế. */
      id: 'mauToiDa',
      deps: ['character.stats.vit'],
      compute(state) {
        const vit = characterOf(state)?.stats.vit;
        return typeof vit === 'number' ? 10 + vit * 2 : 0;
      },
    },
    {
      /** Sức nâng tối đa, kg. */
      id: 'sucNang',
      deps: ['character.stats.str'],
      compute(state) {
        const str = characterOf(state)?.stats.str;
        return typeof str === 'number' ? str * 5 : 0;
      },
    },
    {
      /** Sức chở đi đường dài mà không bị phạt, kg. */
      id: 'sucCho',
      deps: ['character.stats.str', 'character.stats.vit'],
      compute(state) {
        const stats = characterOf(state)?.stats;
        if (stats === undefined) return 0;
        return Math.round(stats.str * 2 + stats.vit);
      },
    },
    {
      /** Bước đi mỗi lượt, mét. */
      id: 'tocDo',
      deps: ['character.stats.agi', 'character.stats.vit'],
      compute(state) {
        const stats = characterOf(state)?.stats;
        if (stats === undefined) return 0;
        return Math.round(20 + stats.agi + stats.vit / 2);
      },
    },
    {
      /** Tầm nhìn rõ mặt người, mét. */
      id: 'tamNhin',
      deps: ['character.stats.per'],
      compute(state) {
        const per = characterOf(state)?.stats.per;
        return typeof per === 'number' ? 20 + per * 8 : 0;
      },
    },
    {
      /** Tổng cân nặng đang mang, kg. So với `sucCho` ra mức quá tải. */
      id: 'trongLuongMang',
      deps: ['character.gear'],
      compute(state) {
        const gear = characterOf(state)?.gear;
        return gear === undefined ? 0 : gearWeight(gear);
      },
    },
    {
      /**
       * Bậc tước cao nhất đang giữ, 0–9 theo thang Phần 13 mục 2.
       *
       * Đây là biến phụ chứ không phải một ô trong state: nó LÀ hàm của danh
       * sách thái ấp, và giữ thêm một bản sao là chuẩn bị sẵn cho ngày hai bên
       * lệch nhau sau một lần tước đoạt.
       */
      id: 'bacTuoc',
      deps: ['character.fiefs'],
      compute(state) {
        const fiefs = characterOf(state)?.fiefs;
        return fiefs === undefined ? 0 : highestRank(fiefs.map((fief) => fief.title));
      },
    },
    {
      /**
       * Tuổi tác hiệu dụng — tuổi quy về thang người thường.
       *
       * Có nó thì một Cao Tiên 180 tuổi và một Frank 21 tuổi so được với nhau,
       * và Phần 8 không phải viết hai bảng học tập riêng cho tộc sống 600 năm.
       */
      id: 'tuoiHieuDung',
      deps: ['character.identity.age', 'character.identity.race'],
      compute(state) {
        const identity = characterOf(state)?.identity;
        if (identity === undefined) return 0;
        return effectiveAge(identity.race, identity.age);
      },
    },
  ],
};
