/**
 * TÁM BẢNG TRẠNG THÁI — Phần 14 mục 2, một schema cho mỗi thể loại minigame.
 *
 * VÌ SAO TÁM SCHEMA CHỨ KHÔNG PHẢI MỘT: mục 1 nói thẳng — tám minigame phải khác
 * nhau về THỂ LOẠI, không phải cùng một bảng số liệu đổi nhãn. Một schema chung
 * với vài trường tùy chọn là cách chắc chắn nhất để chuyện ấy xảy ra: sáu tháng
 * sau, `votes` sẽ được dùng cho cả phiếu Đế hội lẫn phiếu hội đồng bang lẫn phiếu
 * mật nghị, và ba thứ ấy sẽ trôi về cùng một công thức. Discriminated union theo
 * `kind` khiến chuyện đó không biên dịch được.
 *
 * VÌ SAO ZOD Ở ĐÂY MÀ KHÔNG PHẢI Ở `slice.ts`: kiểu TypeScript của tám bảng suy
 * ra TỪ schema (`z.infer`), nên chỉ có một nguồn sự thật. Ở Phần 13 kiểu được
 * viết tay song song với schema và chấp nhận được vì hình dạng nhỏ; ở đây tám
 * bảng cộng lại quá lớn để giữ hai bản chép tay khớp nhau lâu dài.
 *
 * Thứ tự các trường trong mỗi bảng cố ý trùng thứ tự các gạch đầu dòng a–e của
 * mục 2 tương ứng, để đọc song song hai bên là ra ngay chỗ thiếu.
 */

import { z } from 'zod';

/** Tám thể loại. Trùng một cái là hai quốc gia chơi giống nhau (mục 1). */
export const MINIGAME_KINDS = [
  'quan-doan',
  'noi-chien',
  'lien-bang',
  'cong-nap',
  'cai-cach',
  'tap-quyen',
  'mat-nghi',
  'ngan-hang',
] as const;

export type MinigameKind = (typeof MINIGAME_KINDS)[number];

const share = z.number().min(0).max(1);
const meter = z.number().min(0).max(100);

// ---------------------------------------------------------------------------
// 2.1 ĐẾ QUỐC ORC — mười tám quân đoàn & chiêu mộ dị tộc
// ---------------------------------------------------------------------------

export const corpsStateSchema = z.object({
  id: z.string().startsWith('corps_'),
  men: z.number().min(0),
  quality: meter,
  loyalty: meter,
  prestige: meter,
  /** Phần ngân sách quân sự thực nhận. So với `demandShare` của data là ra bất mãn. */
  budgetShare: share,
  mutinying: z.boolean().default(false),
  /** Số năm liên tiếp ở trạng thái binh biến. Tới ngưỡng là phế truất. */
  mutinyYears: z.number().int().min(0).default(0),
  /** Số năm liên tiếp không được giao trận nào. Uy thế rơi theo cái này. */
  neglectYears: z.number().int().min(0).default(0),
});

export const ottomanBoardSchema = z.object({
  kind: z.literal('quan-doan'),
  /** a) Ngân sách quân sự trên tổng thu. 18 đoàn cùng đòi và không bao giờ đủ. */
  militaryBudget: share,
  corps: z.array(corpsStateSchema).default([]),
  /** Chênh lệch ưu ái Cấm Vệ (dương) so với Tỉnh Binh (âm) — hai phe cấu trúc. */
  guardTilt: z.number().min(-100).max(100).default(0),
  arrearYears: z.number().int().min(0).default(0),
  /** b) Vùng bị chiêu mộ dị tộc và mức oán hận từng vùng. */
  devshirme: z
    .array(
      z.object({
        regionId: z.string().min(1),
        races: z.array(z.string()).default([]),
        resentment: meter,
        intakeYears: z.number().int().min(0).default(0),
        revolted: z.boolean().default(false),
      }),
    )
    .default([]),
  /** c) Cây kỹ thuật — thế lực DUY NHẤT có (mục 2.1c). */
  tech: z
    .array(
      z.object({
        branchId: z.string().min(1),
        level: z.number().int().min(0),
        progressYears: z.number().min(0).default(0),
      }),
    )
    .default([]),
  /** d) Chính sách tôn giáo với vùng chinh phục. */
  religiousPolicy: z.enum(['khoan-dung', 'cuong-buc']).default('khoan-dung'),
  assimilation: meter.default(0),
  /** e) Cỗ máy không có chế độ nghỉ. */
  yearsSinceConquest: z.number().int().min(0).default(0),
  deposed: z.boolean().default(false),
});

// ---------------------------------------------------------------------------
// 2.2 ĐÔNG LA MÃ — nội chiến & cầu viện
// ---------------------------------------------------------------------------

export const byzantineBoardSchema = z.object({
  kind: z.literal('noi-chien'),
  /** a) Các nhánh hoàng tộc và yêu sách. */
  claimants: z
    .array(
      z.object({
        id: z.string().min(1),
        name: z.string().min(1),
        strength: meter,
        /** Thế lực đứng sau. Thắng nhờ họ là trả công bằng đất. */
        backer: z.string().default(''),
        age: z.number().min(0).default(120),
      }),
    )
    .default([]),
  civilWar: z
    .object({
      active: z.boolean().default(false),
      years: z.number().int().min(0).default(0),
      challengerId: z.string().default(''),
      hiredPower: z.string().default(''),
    })
    .default({ active: false, years: 0, challengerId: '', hiredPower: '' }),
  /** b) Cán cân hợp nhất giáo hội. Ký thì dân nổi loạn, không ký thì không có viện binh. */
  unionProgress: meter.default(0),
  unionSigned: z.boolean().default(false),
  populaceAnger: meter.default(0),
  /** c) Thu nhập từ eo biển, và phần các thành bang Latin đã giành mất. */
  straitsIncome: z.number().min(0).default(0),
  latinShare: share.default(0),
  /** d) Hội đồng trường sinh: hệ số bảo thủ TĂNG THEO tuổi trung bình. */
  councilAvgAge: z.number().min(0).default(200),
  conservatism: meter.default(50),
  /** e) Điều kiện thắng là SỐNG SÓT lâu hơn dự kiến. */
  survivalYears: z.number().int().min(0).default(0),
  lands: z
    .array(
      z.object({
        id: z.string().min(1),
        name: z.string().min(1),
        value: z.number().min(0),
        core: z.boolean().default(false),
        lostTo: z.string().default(''),
      }),
    )
    .default([]),
  /** Bản đồ theo từng thập kỷ — đường đi xuống, và nó phải nhìn thấy được. */
  landByDecade: z.array(z.object({ year: z.number().int(), land: z.number().min(0) })).default([]),
});

// ---------------------------------------------------------------------------
// 2.3 LIÊN BANG NÚI — liên bang & xuất khẩu lính đánh thuê
// ---------------------------------------------------------------------------

export const swissBoardSchema = z.object({
  kind: z.literal('lien-bang'),
  /** a) Hội đồng liên bang: mọi quyết định lớn cần ĐỒNG THUẬN. Không ai ra lệnh được cho ai. */
  cantons: z
    .array(
      z.object({
        id: z.string().min(1),
        name: z.string().min(1),
        votes: z.number().int().min(1),
        interest: z.string().default(''),
        mood: meter,
        feudWith: z.string().default(''),
        menForHire: z.number().min(0).default(0),
        menAbroad: z.number().min(0).default(0),
      }),
    )
    .default([]),
  motion: z
    .object({
      text: z.string().default(''),
      yes: z.number().int().min(0).default(0),
      no: z.number().int().min(0).default(0),
      resolved: z.boolean().default(true),
    })
    .default({ text: '', yes: 0, no: 0, resolved: true }),
  /** b) Giữ đèo: thế mạnh phòng thủ tuyệt đối, và nó chỉ tồn tại trên núi. */
  passes: z
    .array(
      z.object({
        id: z.string().min(1),
        name: z.string().min(1),
        garrison: z.number().min(0),
        held: z.boolean().default(true),
        tollPerYear: z.number().min(0).default(0),
      }),
    )
    .default([]),
  /** c) Hợp đồng lính đánh thuê — nguồn thu chính, và chỗ hai bang có thể gặp nhau ở hai phía một trận. */
  contracts: z
    .array(
      z.object({
        id: z.string().min(1),
        employer: z.string().min(1),
        cantonId: z.string().min(1),
        men: z.number().min(0),
        payPerYear: z.number().min(0),
        yearsLeft: z.number().int().min(0),
        theatre: z.string().default(''),
      }),
    )
    .default([]),
  youthsAbroad: z.number().min(0).default(0),
  youthsDead: z.number().min(0).default(0),
  /** Số lần anh em họ đã giết nhau vì tiền người lạ. Con số này KHÔNG bao giờ giảm. */
  fratricides: z.number().int().min(0).default(0),
  /** d) Kết nạp bang mới — mỗi bang mới đổi cán cân bỏ phiếu. */
  admitCandidates: z
    .array(
      z.object({
        id: z.string().min(1),
        name: z.string().min(1),
        votes: z.number().int().min(1),
        strength: meter,
        interest: z.string().default(''),
      }),
    )
    .default([]),
  /** e) Kẻ thù thường trực. */
  empireRelation: z.number().min(-100).max(100).default(-60),
});

// ---------------------------------------------------------------------------
// 2.4 HÃN QUỐC THẢO NGUYÊN — cống nạp & phân liệt
// ---------------------------------------------------------------------------

export const hordeBoardSchema = z.object({
  kind: z.literal('cong-nap'),
  /** a) Cấp sắc cho chư hầu: giấy phép cai trị, rút lại được bất cứ lúc nào. */
  tributaries: z
    .array(
      z.object({
        id: z.string().min(1),
        name: z.string().min(1),
        patent: z.boolean().default(false),
        tribute: z.number().min(0),
        strength: meter,
        favouredYears: z.number().int().min(0).default(0),
        arrears: z.number().int().min(0).default(0),
        defiant: z.boolean().default(false),
      }),
    )
    .default([]),
  /** b) Phân liệt nội bộ: hãn quốc đang tách thành các hãn quốc nhỏ. */
  khanates: z
    .array(
      z.object({
        id: z.string().min(1),
        name: z.string().min(1),
        loyalty: meter,
        strength: meter,
        seat: z.boolean().default(false),
        broken: z.boolean().default(false),
      }),
    )
    .default([]),
  /** c) Tuyến thương mại — nguồn tiền lớn nhất, và ĐƯỜNG ĐI CỦA ĐẠI DỊCH. */
  routes: z
    .array(
      z.object({
        id: z.string().min(1),
        name: z.string().min(1),
        income: z.number().min(0),
        plagueRisk: z.number().min(0).max(100),
        protected: z.boolean().default(true),
      }),
    )
    .default([]),
  plagueLevel: meter.default(0),
  plagueOutbreakYear: z.number().int().min(0).default(0),
  /** d) Định cư hay du mục: -100 du mục thuần, +100 định cư thuần. */
  settlement: z.number().min(-100).max(100).default(-60),
  /** e) Ba phía kéo về ba hướng. */
  religionPull: z.record(z.string(), z.number()).default({}),
});

// ---------------------------------------------------------------------------
// 2.5 ĐẾ QUỐC — cải cách đế chế
// ---------------------------------------------------------------------------

export const hreBoardSchema = z.object({
  kind: z.literal('cai-cach'),
  authority: meter.default(28),
  freedom: meter.default(72),
  yearsToDiet: z.number().int().min(0).default(1),
  pendingReformId: z.string().default(''),
  passedReformIds: z.array(z.string()).default([]),
  /** Nghiêng của từng tuyển hầu và từng chư hầu lớn, 0–100. 55 trở lên là bỏ phiếu thuận. */
  leans: z.record(z.string(), meter).default({}),
  bargainsUsed: z.array(z.string()).default([]),
  /** Liên minh với Giáo hoàng hay chống lại — cả hai đều là công cụ, và đều đắt. */
  papacyStance: z.enum(['lien-minh', 'trung-lap', 'chong-doi']).default('trung-lap'),
  excommunicated: z.boolean().default(false),
  /** Số năm quyền uy ở dưới ngưỡng sụp. Đế quốc không chết đột ngột, nó rã dần. */
  collapseYears: z.number().int().min(0).default(0),
  lastDietYear: z.number().int().default(0),
});

// ---------------------------------------------------------------------------
// 2.6 VƯƠNG QUỐC FRANK — tập quyền
// ---------------------------------------------------------------------------

export const franceBoardSchema = z.object({
  kind: z.literal('tap-quyen'),
  crownLand: z.number().min(0).default(0),
  vassalLand: z.number().min(0).default(0),
  /** BẤT MÃN QUÝ TỘC toàn quốc. Vượt ngưỡng là liên minh nổi dậy TẤT CẢ CÙNG LÚC. */
  discontent: meter.default(0),
  revoltThreshold: meter.default(70),
  duchies: z
    .array(
      z.object({
        id: z.string().min(1),
        name: z.string().min(1),
        strength: meter,
        heirless: z.boolean().default(false),
        absorbed: z.boolean().default(false),
        claimStrength: meter.default(0),
        rebelling: z.boolean().default(false),
      }),
    )
    .default([]),
  /** Vụ kiện / hôn ước / chờ tuyệt tự / cuộc chiến đang chạy. */
  suits: z
    .array(
      z.object({
        duchyId: z.string().min(1),
        pathId: z.string().min(1),
        yearsLeft: z.number().int().min(0),
        spent: z.number().min(0).default(0),
      }),
    )
    .default([]),
  nobleLeague: z
    .object({ formed: z.boolean().default(false), members: z.array(z.string()).default([]), year: z.number().int().default(0) })
    .default({ formed: false, members: [], year: 0 }),
});

// ---------------------------------------------------------------------------
// 2.7 GIÁO TRIỀU — mật nghị & quyền lực thiêng
// ---------------------------------------------------------------------------

export const papacyBoardSchema = z.object({
  kind: z.literal('mat-nghi'),
  spiritualPrestige: meter.default(60),
  cardinals: z
    .array(
      z.object({
        id: z.string().min(1),
        name: z.string().min(1),
        faction: z.string().min(1),
        age: z.number().min(0),
        loyalty: meter,
        influence: meter,
        raceId: z.string().default(''),
        appointedBy: z.string().default(''),
      }),
    )
    .default([]),
  /** Khuyết ngôi → mật nghị. Ai phong thêm hồng y phe mình TRƯỚC KHI CHẾT thì thắng. */
  vacancy: z.boolean().default(false),
  lastConclaveYear: z.number().int().default(0),
  popeFaction: z.string().default(''),
  /** Vũ khí đã dùng và đang còn hiệu lực. */
  excommunicated: z.array(z.string()).default([]),
  interdicts: z.array(z.string()).default([]),
  crusadeTarget: z.string().default(''),
  indulgenceYears: z.number().int().min(0).default(0),
  /** Rủi ro đặc trưng: uy tín xuống quá thấp thì có GIÁO HOÀNG THỨ HAI. */
  antipope: z
    .object({ exists: z.boolean().default(false), backer: z.string().default(''), sinceYear: z.number().int().default(0) })
    .default({ exists: false, backer: '', sinceYear: 0 }),
  heresyWatch: z.array(z.object({ areaId: z.string(), share: z.number().min(0).max(1) })).default([]),
});

// ---------------------------------------------------------------------------
// 2.8 THÀNH BANG LATIN — ngân hàng & lính đánh thuê
// ---------------------------------------------------------------------------

export const latinBoardSchema = z.object({
  kind: z.literal('ngan-hang'),
  /** Sổ cái từng khoản cho vay và xác suất vỡ nợ. Vua QUỴT ĐƯỢC và không ai đòi nổi. */
  loans: z
    .array(
      z.object({
        id: z.string().min(1),
        debtor: z.string().min(1),
        principal: z.number().min(0),
        rate: z.number().min(0),
        yearsLeft: z.number().int().min(0),
        defaultRisk: meter,
        defaulted: z.boolean().default(false),
      }),
    )
    .default([]),
  /** Không nuôi quân thường trực — thuê condottieri, và họ tống tiền được chính mình. */
  condottieri: z
    .array(
      z.object({
        id: z.string().min(1),
        name: z.string().min(1),
        men: z.number().min(0),
        payPerYear: z.number().min(0),
        yearsLeft: z.number().int().min(0),
        mood: meter,
        unpaidYears: z.number().int().min(0).default(0),
        extorting: z.boolean().default(false),
      }),
    )
    .default([]),
  routes: z
    .array(
      z.object({
        id: z.string().min(1),
        name: z.string().min(1),
        income: z.number().min(0),
        monopoly: z.boolean().default(false),
      }),
    )
    .default([]),
  /** Thao túng giá lương thực toàn châu lục. 100 là giá thường. */
  grainPrice: z.number().min(0).default(100),
  creditRating: meter.default(75),
  /** Bầu cử nội bộ có nhiệm kỳ: mất ghế là mất tất cả, nên phải mua phiếu. */
  seat: z.boolean().default(true),
  termYears: z.number().int().min(1).default(4),
  yearsLeftInTerm: z.number().int().min(0).default(4),
  councilSupport: meter.default(50),
  bribeSpent: z.number().min(0).default(0),
  councilFactions: z
    .array(z.object({ id: z.string().min(1), name: z.string().min(1), seats: z.number().int().min(0), wants: z.string().default('') }))
    .default([]),
});

// ---------------------------------------------------------------------------
// Hợp nhất
// ---------------------------------------------------------------------------

/**
 * TÁM BẢNG, MỘT UNION PHÂN BIỆT BẰNG `kind`.
 *
 * Đây là chỗ luật "không làm chung một component rồi đổi nhãn" (mục 10.5) được
 * dựng thành kiểu: một hàm nhận `PowerBoard` mà không hỏi `kind` thì chỉ đọc được
 * đúng trường `kind`, và không có gì khác.
 */
export const powerBoardSchema = z.discriminatedUnion('kind', [
  ottomanBoardSchema,
  byzantineBoardSchema,
  swissBoardSchema,
  hordeBoardSchema,
  hreBoardSchema,
  franceBoardSchema,
  papacyBoardSchema,
  latinBoardSchema,
]);

export type CorpsState = z.infer<typeof corpsStateSchema>;
export type OttomanBoard = z.infer<typeof ottomanBoardSchema>;
export type ByzantineBoard = z.infer<typeof byzantineBoardSchema>;
export type SwissBoard = z.infer<typeof swissBoardSchema>;
export type HordeBoard = z.infer<typeof hordeBoardSchema>;
export type HreBoard = z.infer<typeof hreBoardSchema>;
export type FranceBoard = z.infer<typeof franceBoardSchema>;
export type PapacyBoard = z.infer<typeof papacyBoardSchema>;
export type LatinBoard = z.infer<typeof latinBoardSchema>;
export type PowerBoard = z.infer<typeof powerBoardSchema>;

/** Bảng nào thuộc thể loại nào — dùng cho phép kiểm "tám thể loại khác nhau". */
export const BOARD_OF_KIND: Readonly<Record<MinigameKind, string>> = {
  'quan-doan': 'Mười tám quân đoàn & chiêu mộ dị tộc',
  'noi-chien': 'Nội chiến & cầu viện',
  'lien-bang': 'Liên bang & xuất khẩu lính đánh thuê',
  'cong-nap': 'Cống nạp & phân liệt',
  'cai-cach': 'Cải cách đế chế',
  'tap-quyen': 'Tập quyền',
  'mat-nghi': 'Mật nghị & quyền lực thiêng',
  'ngan-hang': 'Ngân hàng & lính đánh thuê',
};
