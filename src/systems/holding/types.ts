/**
 * KIỂU DỮ LIỆU CỦA TẦNG THÀNH TRÌ (Phần 12).
 *
 * MỘT THÀNH TRÌ LÀ MỘT ĐIỂM. Mọi thứ trong file này có tọa độ, đếm được, và đi
 * bộ hết trong một ngày (Phụ lục A mục 1). Nếu một ngày nào đó có ai định thêm
 * `taxRate`, `vassals` hay `provinces` vào `Holding`, đó là dấu hiệu hai tầng
 * đang lẫn — chúng thuộc `realm` của Phần 13, và mục 1 của Phần 12 nói thẳng là
 * hai slice KHÔNG được đọc thẳng vào nhau.
 *
 * ĐƠN VỊ (Phụ lục A mục 5): người, công trình, ô, tuần, giạ, thước tường, số
 * quân đồn trú. KHÔNG BAO GIỜ phần trăm dân số — phần trăm là ngôn ngữ của lãnh
 * thổ, và một con số phần trăm lọt vào đây sẽ kéo theo cả giọng văn của tầng kia.
 */

import type { HoldingId } from '@/core/ids';

// ---------------------------------------------------------------------------
// Lưới ô
// ---------------------------------------------------------------------------

/** Toạ độ ô, gốc ở góc tây-bắc. Lưới MỞ RỘNG chứ không reset, nên gốc cố định. */
export interface Cell {
  x: number;
  y: number;
}

export interface HoldingTile {
  x: number;
  y: number;
  /** Id trong `data/resources.json → terrain`. */
  terrain: string;
  /** Id công trình đang chiếm ô, rỗng là đất trống. */
  occupiedBy: string;
}

/** Một công trình ĐÃ DỰNG XONG, đứng ở một chỗ cụ thể. */
export interface PlacedBuilding {
  /** Id thực thể, duy nhất trong thành trì này. */
  id: string;
  /** Id trong `data/buildings.json`. */
  buildingId: string;
  /** Góc tây-bắc. Công trình vành đai (`perimeter`) dùng `{x:-1,y:-1}`. */
  at: Cell;
  /** 0–100. Dưới `ruinedBelow` là ngừng sản xuất, dưới `collapseBelow` là sập. */
  integrity: number;
  /** Hệ số sản lượng do kiểm định chất lượng lúc hoàn thành quyết định (mục 7). */
  quality: number;
  /** Nhân bổ sung vào tốc độ xuống cấp — công trình xây hỏng thì mau hỏng. */
  decayMultiplier: number;
  /** Tên người chơi tự đặt. `locked` sau khi đặt (mục 10). */
  customName: string;
  /** Lượt trong game lúc hoàn thành. */
  builtOnTurn: number;
  /** Có trả chi phí duy trì tuần vừa rồi không. Bỏ bê là hỏng. */
  maintained: boolean;
}

/** Một dự án ĐANG XÂY (mục 7). */
export interface BuildProject {
  id: string;
  buildingId: string;
  at: Cell;
  /** Tổng công lao động còn phải bỏ ra. */
  manWeeksLeft: number;
  /** Số tuần tối thiểu còn lại — không rút ngắn được bằng cách thêm người. */
  weeksLeft: number;
  /** Nhân công đang phân cho dự án này tuần này. */
  crew: number;
  /** Vật liệu đã giao. Thiếu là công trường đứng. */
  delivered: Record<string, number>;
  /** Vật liệu còn thiếu, tính lại mỗi tuần. */
  missing: Record<string, number>;
  /** Kỹ năng kiến trúc sư đang trông coi, 0–100. 0 là không có ai. */
  architectSkill: number;
  /** Id NPC kiến trúc sư — một người THẬT, phải đi tìm (mục 6). */
  architectId: string;
  /** Vì sao tuần này không tiến, rỗng là đang chạy. */
  stalled: string;
  /** Lượt trong game lúc khởi công. */
  startedOnTurn: number;
  /**
   * Cấp kiểm định chất lượng đã tung, rỗng là chưa tung.
   *
   * Tồn tại vì `costlySuccess` nghĩa là "vượt ngân sách HOẶC CHẬM" (mục 7), và
   * cái chậm ấy phải là những tuần có thật. Giữ lại cấp đã tung để khi công
   * trường chạy nốt mấy tuần đền bù thì KHÔNG tung lại — tung lại là mở cửa cho
   * save-scum ngay giữa một hệ thống mà R3 đã cố công đóng lại.
   */
  qualityTier: string;
}

// ---------------------------------------------------------------------------
// Dân cư
// ---------------------------------------------------------------------------

/** Một nhóm xã hội trong thành (mục 8). */
export interface StratumCount {
  id: string;
  people: number;
  /** Lòng dân RIÊNG của nhóm, 0–100. Cùng một chính sách, mỗi nhóm phản ứng khác. */
  morale: number;
}

/** Một chủng tộc sống trong thành. Nhiều tộc chung sống thì có căng thẳng riêng. */
export interface RaceCount {
  raceId: string;
  people: number;
}

export interface Population {
  /** SỐ NGƯỜI, con số CHÍNH XÁC (Phụ lục A mục 6). Lãnh chúa biết rõ thành mình. */
  total: number;
  /** Lòng dân chung 0–100, bình quân có trọng số theo nhóm. */
  morale: number;
  strata: StratumCount[];
  races: RaceCount[];
  /** Điểm căng thẳng chủng tộc, 0 là không có. */
  raceTension: number;
  /** Số người đang cầm giáo theo lệnh gọi quân — họ không cày và không xây. */
  levied: number;
  /** Số tuần liên tiếp đã gọi quân. Gọi quá lâu là kiệt quệ (mục 9). */
  levyWeeks: number;
  /** Thợ lành nghề đang có, theo id trong `data/resources.json → labour.skilled`. */
  skilled: Record<string, number>;
  /** Thợ đang đào tạo: id → số tuần còn lại của từng người. */
  training: { skillId: string; weeksLeft: number }[];
}

// ---------------------------------------------------------------------------
// Ruộng ngoài tường
// ---------------------------------------------------------------------------

/**
 * Ô địa hình QUANH thành trì (mục 6). Vẫn là tầng thành trì: đi bộ tới được
 * trong một ngày. KHÔNG phải tỉnh — tỉnh CHỨA thành trì, không nằm trong nó.
 */
export interface HinterlandTile {
  terrain: string;
  count: number;
}

// ---------------------------------------------------------------------------
// Sở hữu
// ---------------------------------------------------------------------------

/** BỐN CON ĐƯỜNG CÓ THÀNH TRÌ (mục 2). Mỗi đường một mức chính danh khác nhau. */
export const OWNERSHIP_PATHS = ['xuat-than', 'duoc-phong', 'danh-chiem', 'phat-trien'] as const;
export type OwnershipPath = (typeof OWNERSHIP_PATHS)[number];

export interface Ownership {
  path: OwnershipPath;
  /** 0–100. Thấp thì dân bớt phục tùng và có người kiện lên lãnh chúa (Phần 13). */
  legitimacy: number;
  /** Có một người tự nhận là chủ hợp pháp ở đâu đó không (đường `danh-chiem`). */
  rivalClaimant: string;
  /** Lượt trong game lúc thành trì về tay người chơi. */
  sinceTurn: number;
  /** Dân thù địch còn lại sau khi bị đánh chiếm, 0–100. Nguội dần theo năm. */
  conqueredHatred: number;
}

// ---------------------------------------------------------------------------
// Giao diện với LÃNH THỔ (Phần 13) — xem `interfaces.ts`
// ---------------------------------------------------------------------------

/**
 * GIẤY PHÉP XÂY từ lãnh chúa cấp trên (mục 3d, mục 12.9).
 *
 * Phần 13 sẽ hoàn thiện; giờ đây chỉ là một CỜ. Xây lậu VẪN làm được — đó là
 * lựa chọn của người chơi, không phải lỗi — nhưng nó ghi lại vào `illegalWorks`
 * để Phần 15 có chỗ mà cho lãnh chúa phản ứng.
 */
export interface Permits {
  /** Id cấp khu định cư đã được phép lên. */
  granted: string[];
  /** Công trình phòng thủ đã được phép xây. */
  grantedWorks: string[];
  /** Đã xây mà chưa xin phép. Lãnh chúa có quyền đem quân san bằng. */
  illegalWorks: string[];
  /** Lãnh chúa cấp trên có biết chuyện xây lậu chưa. */
  discovered: boolean;
}

/** Nghĩa vụ thành trì NỘP LÊN lãnh thổ. Thành trì NỘP, không bị "thu thuế". */
export interface Obligations {
  /** Số ngày quân dịch mỗi năm — chính là hạn nghĩa vụ Phần 11 dùng khi đi vây. */
  serviceDaysPerYear: number;
  /** Phần cống nộp mỗi năm, tính bằng đồng. */
  tributePerYear: number;
  /** Phần sản lượng phải đóng góp, tính bằng giạ mỗi năm. */
  produceQuotaPerYear: number;
  /** Đã nộp đủ trong năm nay chưa. */
  paidThisYear: boolean;
  /** Số năm liên tiếp nợ nghĩa vụ. */
  arrearsYears: number;
}

// ---------------------------------------------------------------------------
// Thành trì
// ---------------------------------------------------------------------------

export interface Holding {
  /** `hold_*` — nhìn id là biết loại (Phụ lục A mục 9b). */
  id: HoldingId;
  /**
   * Tên TRẦN, không có loại từ. Loại từ ("thành", "làng"…) do `holdingLabel()`
   * ghép vào lúc đưa cho AI, vì Phụ lục A mục 9c cấm tên trần trụi trong văn bản.
   */
  name: string;
  /** Id cấp trong `data/settlement-tiers.json`. */
  tierId: string;
  /** Cạnh lưới hiện tại. Lên cấp thì MỞ RỘNG, công trình cũ giữ nguyên tọa độ. */
  gridSize: number;
  tiles: HoldingTile[];
  buildings: PlacedBuilding[];
  projects: BuildProject[];
  hinterland: HinterlandTile[];
  population: Population;
  /** Kho hàng, theo id trong `data/resources.json`. Con số CHÍNH XÁC. */
  stores: Record<string, number>;
  ownership: Ownership;
  permits: Permits;
  obligations: Obligations;
  /** TÒA CHÍNH — thành trì chính, nơi ở. Đúng một cái trong cả danh sách. */
  seat: boolean;
  /** Đang bị vây hay không. Đổi hẳn cách tính lòng dân và xuống cấp. */
  besieged: boolean;
  /** Đang có dịch. */
  plague: boolean;
  /** Vệ sinh 0–100 — cộng thẳng vào phép kiểm dịch bệnh của Phần 11 mục 3. */
  hygiene: number;
  /** Lượt trong game của lần cập nhật cuối. */
  lastTurn: number;
  /** Số tuần đã trôi qua kể từ khi thành trì được dựng. */
  weeksLived: number;
}

// ---------------------------------------------------------------------------
// Biến phụ — CỘNG TỪ thành trì, không phải biến gốc (mục 1, mục 10)
// ---------------------------------------------------------------------------

/** Bảng tổng kết một tuần, để UI và AI đọc. Không lưu vào state. */
export interface HoldingSummary {
  id: string;
  name: string;
  tierId: string;
  population: number;
  morale: number;
  /** Sản lượng lương thực mỗi tuần, tính bằng giạ. */
  foodPerWeek: number;
  /** Lương ăn hết mỗi tuần. */
  foodEatenPerWeek: number;
  /** Sức chứa dân của thành: chỗ ở, lương, và việc làm — cái nào nhỏ nhất thắng. */
  capacity: number;
  housingCapacity: number;
  foodCapacity: number;
  jobCapacity: number;
  /** Nhân lực tổng và phần rảnh sau khi trừ mùa vụ và quân dịch. */
  workforce: number;
  freeLabour: number;
  /** SỐ TUẦN CẦM CỰ NẾU BỊ VÂY — biến phụ mục 10, và Phần 11 đọc lại. */
  siegeWeeks: number;
  /** Quân đồn trú huy động được. */
  garrison: number;
  /** Chỉ số phòng thủ tổng hợp, để so hai thành trì với nhau. */
  defence: number;
  beauty: number;
  unrest: string;
}
