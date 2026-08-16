/**
 * KIỂU DỮ LIỆU CỦA TẦNG THÀNH TRÌ (Phần 12).
 *
 * MỘT THÀNH TRÌ LÀ MỘT ĐIỂM. Mọi thứ trong file này có tọa độ, đếm được, và đi
 * bộ hết trong một ngày (Phụ lục A mục 1). Nếu một ngày nào đó có ai định thêm
 * `taxRate`, `vassals` hay `provinces` vào `Holding`, đó là dấu hiệu hai tầng
 * đang lẫn — chúng thuộc `realm` của Phần 13, và mục 1 của Phần 12 nói thẳng là
 * hai slice KHÔNG được đọc thẳng vào nhau.
 *
 * ĐƠN VỊ (Phụ lục A mục 5): người, công trình, Ô 5 MÉT, tuần, giạ, thước tường,
 * số quân đồn trú. KHÔNG BAO GIỜ phần trăm dân số — phần trăm là ngôn ngữ của
 * lãnh thổ, và một con số phần trăm lọt vào đây sẽ kéo theo cả giọng văn của
 * tầng kia.
 *
 * ---
 *
 * BA THỨ BIẾN MẤT KHỎI `Holding` TRONG CUỘC ĐẠI TU KHÔNG GIAN, và cả ba đều
 * biến mất vì cùng một lý do: chúng lưu lại một thứ tính lại được.
 *
 *  - `tiles[]` — hàng nghìn ô địa hình. Bây giờ là một trường liên tục sinh tất
 *    định từ `seed`; xem `field.ts`. Một số nguyên 32 bit thay cho 256 dòng dữ
 *    liệu, và mảnh đất còn đẹp hơn hẳn.
 *  - `gridSize` — cạnh lưới theo cấp. Bây giờ đất là đất ấy từ đầu, lên cấp chỉ
 *    NỚI BÁN KÍNH QUY HOẠCH. Bước "mở rộng lưới" từng là chỗ duy nhất một công
 *    trình có thể rơi mất, và nó không còn tồn tại.
 *  - `hinterland[]` — bảng đếm ruộng ngoài tường. Bây giờ đếm thật trên đất
 *    thật trong bán kính quy hoạch; xem `terrainTally` trong `field.ts`.
 *
 * Và bốn thứ MỚI vào, cả bốn đều là thứ không tính lại được vì chúng là LỊCH SỬ
 * CỦA NGƯỜI CHƠI chứ không phải hình dạng của đất: `nodes` (trữ lượng đã đào
 * hết bao nhiêu), `walls` (đã vạch tuyến tường ở đâu), `roads` (đã bỏ tiền lát
 * quãng phố nào) và `streetsRazed` (đã cho phá con ngõ tự sinh nào).
 *
 * Phép thử để biết một thứ thuộc nhóm nào: **hỏi hạt giống có trả lời được
 * không.** Con sông thì có, nên nó không nằm trong save. Việc lãnh chúa đã lát
 * đá phố nào thì không, nên nó nằm.
 */

import type { HoldingId } from '@/core/ids';
import type { ResourceNode } from './nodes';
import type { RoadLine } from './roads';
import type { WallLine } from './walls';

// ---------------------------------------------------------------------------
// Toạ độ
// ---------------------------------------------------------------------------

/**
 * Toạ độ Ô, gốc ở góc tây-bắc của mảnh đất, mỗi ô 5 m.
 *
 * Gốc ở GÓC chứ không ở tâm dù mọi bán kính đều đo từ tâm, vì một hệ toạ độ
 * không âm đơn giản hơn hẳn khi đánh chỉ số vào mảng và khi ghi ra save.
 */
export interface Cell {
  x: number;
  y: number;
}

/** Một công trình ĐÃ DỰNG XONG, đứng ở một chỗ cụ thể. */
export interface PlacedBuilding {
  /** Id thực thể, duy nhất trong thành trì này. */
  id: string;
  /** Id trong `data/buildings.json`. */
  buildingId: string;
  /** Góc tây-bắc của khuôn viên, tính bằng ô. */
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
  /**
   * Vùng tài nguyên công trình này đang khai thác. Rỗng là không bám vùng nào.
   *
   * Xưởng cưa không bám vùng rừng thì không ra gỗ, và đó là một sự thật hình
   * học: nó đang đứng giữa đồng.
   */
  nodeId: string;
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
  /** Vùng tài nguyên dự án sẽ bám khi xong. Rỗng là không bám vùng nào. */
  nodeId: string;
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
 * Một dòng trong bảng đếm địa hình quanh thành.
 *
 * KHÔNG còn lưu trong save: `terrainTally()` đếm lại từ mảnh đất thật mỗi khi
 * cần. Kiểu vẫn tồn tại vì `labour.ts` nói bằng thứ tiếng này, và vì đổi cả
 * cách tính sản lượng trong một cuộc đại tu về KHÔNG GIAN là đổi hai thứ cùng
 * lúc — cách chắc chắn nhất để không biết thứ nào làm lệch cân bằng.
 */
export interface HinterlandTile {
  terrain: string;
  count: number;
}

// ---------------------------------------------------------------------------
// Mảnh đất
// ---------------------------------------------------------------------------

/**
 * GỢI Ý ĐỊA THẾ TỪ LỜI KỂ.
 *
 * Cầu nối hai chiều giữa văn bản và bản đồ. Khi AI kể "toà thành dựng bên khúc
 * sông cạn" thì bản đồ BẮT BUỘC phải có một dòng sông, nếu không hai nguồn sự
 * thật nói hai chuyện và người chơi tin cái nào cũng sai. Đây là chỗ duy nhất
 * lời kể được phép động tới hình dạng của đất — và nó chỉ bật cờ, không vẽ.
 */
export interface TerrainHint {
  river: boolean;
  sea: boolean;
  mountain: boolean;
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
  /** Công trình phòng thủ và tuyến tường đã được phép xây. */
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

  // --- mảnh đất -----------------------------------------------------------
  /**
   * Hạt giống địa hình. Cả 6 km vuông đất sinh ra từ đúng con số này, nên nó là
   * thứ DUY NHẤT về địa hình cần nằm trong save.
   *
   * Đổi hạt giống là đổi mảnh đất, nên nó `locked`: một thành trì không được
   * thức dậy vào một buổi sáng và thấy con sông của mình đã dời chỗ.
   */
  seed: number;
  /** Địa hình VĨ MÔ của nút bản đồ thế giới chứa thành trì này. */
  dominant: string;
  coastal: boolean;
  /** Toạ độ px trên bản đồ thế giới — chỗ thành trì này thật sự toạ lạc. */
  anchor: Cell;
  hint: TerrainHint;

  buildings: PlacedBuilding[];
  projects: BuildProject[];
  /** Mỏ, rừng và bãi cá — có biên, có trữ lượng, có ngày cạn. */
  nodes: ResourceNode[];
  /** Tuyến tường người chơi tự vạch. Xây rồi là nằm đó cho tới khi bị phá. */
  walls: WallLine[];
  /**
   * Tuyến đường người chơi bỏ tiền lát. KHÔNG phải mạng đường của thành — quan
   * lộ và ngõ mòn sinh tất định từ `seed` và không tốn một byte nào (`streets.ts`).
   */
  roads: RoadLine[];
  /**
   * Id những tuyến TỰ SINH người chơi đã cho phá.
   *
   * Lưu ý dạng: một chuỗi id, không phải một bản sao của tuyến. Cả mạng đường
   * dựng lại được từ hạt giống bất cứ lúc nào, nên thứ duy nhất phải giữ là ý
   * muốn của người chơi — và giữ nó bằng vài chục byte thay vì vài nghìn toạ độ.
   */
  streetsRazed: string[];

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
  /**
   * SỔ NGÀY CÒN NỢ — số ngày lịch đã trôi mà chưa gộp thành một tuần chốt sổ.
   *
   * Thành trì chốt sổ theo TUẦN (mùa vụ, khẩu phần, tiến độ công trường đều
   * tính theo tuần), nhưng thời gian trong game trôi theo NGÀY và trôi theo lời
   * kể: một cảnh nói chuyện trong sảnh tốn hai giờ, một chuyến đi sứ tốn mười
   * một ngày. Con số này là chỗ hai nhịp ấy gặp nhau — ngày cộng dồn vào đây,
   * đủ bảy thì một tuần được chốt và bảy ngày bị trừ đi.
   *
   * Nó tồn tại thay cho cái nút "chạy một tuần" của bản cũ. Cái nút ấy cho phép
   * lãnh chúa nuôi thành hai mươi năm trong khi ngoài kia mới là chiều thứ Ba,
   * và hai cái đồng hồ chạy lệch nhau thì mọi hạn chót trong game mất nghĩa.
   */
  daysOwed: number;
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
  /** Bán kính quy hoạch hiện tại, tính bằng thước. */
  planningMetres: number;
  /** Tổng chiều dài mọi tuyến tường đã dựng, tính bằng thước. */
  wallMetres: number;
  /**
   * Quân đang có trên mỗi người cần có để canh kín tường. Dưới 1 là có chỗ
   * trống trên mặt tường — và một vòng tường quá rộng là chỗ trống ấy.
   */
  wallDensity: number;
}
