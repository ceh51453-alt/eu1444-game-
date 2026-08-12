/**
 * MÔ HÌNH VẬT PHẨM (Phần 16 mục 2).
 *
 * Một `Item` là MỘT MÓN CỤ THỂ, không phải một dòng catalog: thanh kiếm này,
 * với vết mẻ này, do người thợ này rèn, đã ở trong tay ba người trước ngài.
 * Catalog là `templateId`; mọi thứ còn lại là lịch sử của riêng nó.
 *
 * `history` KHÔNG PHẢI TRANG TRÍ (mục 2): một thanh kiếm từng giết một vị vua
 * có giá trị xã hội riêng, và AI phải được biết để kể đúng. Đó là lý do nó là
 * một mảng chuỗi trong state chứ không phải một con số uy tín gộp sẵn.
 */

import type { Axis, AxisTriple } from './data';

export type { Axis, AxisTriple };

/** Tám loại của mục 2, giữ đúng từ vựng của `data/gear.json`. */
export const ITEM_KINDS = [
  'vu-khi',
  'giap',
  'khien',
  'quan-ao',
  'dung-cu',
  'vat-cuoi',
  'quan-nhu',
  'trang-suc',
] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];

/**
 * Một hư hỏng CỤ THỂ (mục 10) — không phải một điểm trừ vào thanh độ bền.
 *
 * `regionId` chỉ có nghĩa với hư hỏng `regional` (giáp móp, giáp thủng): một
 * lỗ thủng ở yếm giáp và một lỗ thủng ở ghệt là hai chuyện khác hẳn nhau, và
 * gộp chúng thành "giáp hỏng 20%" là xóa mất chính điều đó.
 */
export interface ItemDamage {
  /** Id trong `damageKinds` của `data/item-templates.json`. */
  kind: string;
  regionId: string;
  /** Lượt game lúc hỏng — để `gi-set` biết đã lan mấy tuần. */
  turn: number;
  note: string;
}

/**
 * Vóc dáng lúc ĐO MAY — chiều cao, cân nặng, chủng tộc (mục 8, lấy từ Phần 6).
 *
 * Mục 2 chỉ khai `fitTo` là một `npcId`. Nhưng người được đo may thường là một
 * hiệp sĩ đã chết ở tỉnh khác và không có mặt trong state nào cả, nên tra ngược
 * ra vóc dáng của họ là bất khả. Món giáp mang theo số đo của chính nó; `fitTo`
 * vẫn còn, và nó vẫn là câu trả lời cho "bộ này của ai".
 */
export interface BodyShape {
  race: string;
  heightCm: number;
  weightKg: number;
}

/** Huy hiệu trên áo choàng, khiên và cờ hiệu (mục 13). */
export interface Heraldry {
  ownerId: string;
  device: string;
  /** Che đi thì đánh ẩn danh được — và lộ ra là mất danh dự nặng (mục 13c). */
  visible: boolean;
}

/** Vật phẩm thật của mục 2. */
export interface Item {
  id: string;
  templateId: string;
  /** Tên riêng của một tuyệt tác, hoặc tên mẫu khi món này không có tên riêng. */
  name: string;
  kind: ItemKind;
  material: string;
  /** 1 vụng về → 5 tuyệt tác (mục 7). */
  quality: number;
  /** 0–100. Tổng hao mòn; thứ đổi cơ học là `damage` (mục 10). */
  condition: number;
  damage: ItemDamage[];
  /** Id người được ĐO MAY. Rỗng nghĩa là món chưa đo cho ai (mục 8). */
  fitTo: string;
  /** Số đo lúc đo may — xem `BodyShape` ở trên. */
  fitShape?: BodyShape;
  weightKg: number;
  value: number;
  eraFrom: number;
  eraTo: number;
  enchantment: string;
  heraldry: Heraldry | null;
  /** Ai từng cầm, dùng trong trận nào (mục 2). */
  history: string[];
  note: string;
}

// ---------------------------------------------------------------------------
// Bản đồ che phủ (mục 3–4)
// ---------------------------------------------------------------------------

/** Che phủ và ba giá trị chống trên MỘT vùng cơ thể. */
export interface RegionCover {
  regionId: string;
  /** 0–100. Dưới 100 là còn khe hở ở đúng vùng này (mục 4). */
  coverage: number;
  /** Ba trục RIÊNG, không gộp (mục 3). */
  protection: AxisTriple;
  /** Món giáp đang che, theo thứ tự chống tốt dần. */
  pieces: string[];
  /** Loại giáp nặng nhất che vùng này — dùng để gọi tên, không để tính. */
  armorClassId: string;
  /** Tên tiếng Việt của khe hở, nếu vùng này là một khe điển hình. */
  gapName: string;
}

/**
 * BẢN ĐỒ CHE PHỦ đủ 20 vùng — thứ README mục 8.5 bảo không được rút thành một
 * con số phòng thủ tổng. Mọi vùng đều có mặt, kể cả vùng trần: một bản đồ thiếu
 * vùng là một bản đồ mà UI không vẽ được chỗ hở.
 */
export interface CoverageMap {
  byRegion: Map<string, RegionCover>;
  /** Vùng chưa kín 100 — chỗ mũi đâm đi tìm. Sắp theo mức hở giảm dần. */
  gaps: RegionCover[];
  /** Loại giáp nặng nhất trên người — nhãn `dich-giap-tam` của Phần 8 tra chỗ này. */
  heaviest: string;
  /** Trung bình có trọng số theo bảng d100 — CHỈ để hiện, không phép kiểm nào dùng. */
  average: AxisTriple;
}

/** Bốn khả năng của mục 4. */
export type HitOutcomeKind = 'khe-ho' | 'xuyen' | 'dap-xuyen' | 'chan';

export interface ArmorOutcome {
  kind: HitOutcomeKind;
  /** Trần mức độ vết thương. 0 nghĩa là không sinh vết nào. */
  severityCap: number;
  /** Loại vết bị đổi thành, hoặc rỗng khi giữ nguyên. */
  forceType: string;
  /** Sức xuyên trừ sức chống trên đúng trục của đòn. */
  pen: number;
  coverage: number;
  axis: Axis;
  /** Một dòng cho nhật ký hiệp. */
  note: string;
}
