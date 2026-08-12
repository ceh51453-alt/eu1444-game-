/**
 * KIỂU CỦA TẦNG THẾ LỰC — Phần 14 mục 1, 3, 6, 7.
 *
 * Ba tầng của game giờ đã đủ: THÀNH TRÌ là một điểm (Phần 12), LÃNH THỔ là một
 * vùng (Phần 13), THẾ LỰC là một BÀN CỜ CHÍNH TRỊ. Quy tắc kiểm tra để biết một
 * trường thuộc tầng nào, viết tiếp mạch của Phụ lục A:
 *
 *   có tọa độ                        → thành trì
 *   có phạm vi áp dụng               → lãnh thổ
 *   có PHE, PHIẾU, hoặc CHỮ KÝ       → thế lực
 *
 * Vì thế không kiểu nào ở đây có `x`, `y`, `holdingIds`, hay `taxRates`: một thế
 * lực không thu thuế của dân, nó nhận cống nạp, thu thuế đường, hoặc bán ân xá.
 *
 * Kiểu của tám bảng minigame nằm ở `boards.ts` và suy ra từ schema Zod — xem
 * phần đầu file ấy để biết vì sao tách.
 */

import type {
  ByzantineBoard,
  CorpsState,
  FranceBoard,
  HordeBoard,
  HreBoard,
  LatinBoard,
  MinigameKind,
  OttomanBoard,
  PapacyBoard,
  PowerBoard,
  SwissBoard,
} from './boards';

export type {
  ByzantineBoard,
  CorpsState,
  FranceBoard,
  HordeBoard,
  HreBoard,
  LatinBoard,
  MinigameKind,
  OttomanBoard,
  PapacyBoard,
  PowerBoard,
  SwissBoard,
};

/**
 * BA TẦNG TIẾP CẬN (mục 1), áp cho MỌI quốc gia.
 *
 * Bảng trạng thái KHÔNG BAO GIỜ bị khóa xám. Luôn hiện, chỉ khác độ rõ và khác
 * những nút bấm khả dụng — nên tầng tiếp cận là một thuộc tính của NGƯỜI CHƠI với
 * một thế lực, không phải một thuộc tính của bảng.
 */
export type AccessTier = 'quan-sat' | 'tac-dong' | 'choi-that';

/** Độ rõ của bảng, suy từ tri thức của Phần 4 chứ không từ tước vị. */
export type ClarityLevel = 'tin-don' | 'nghe-noi' | 'biet-ro';

/** Năm trạng thái của mục 3. Bốn cái đầu đặt được, `han-che` thì không. */
export type MinorityStatus = 'trong-dung' | 'dung-nap' | 'thue-rieng' | 'truy-buc' | 'han-che';

/**
 * MỘT NHÓM DÂN trong một thế lực.
 *
 * MỖI THẾ LỰC ĐỀU ĐA CHỦNG TỘC (mục 1b): danh sách này luôn dài hơn một dòng, và
 * dòng đầu tiên (tộc thống trị) không bao giờ chiếm quá nửa ở thế lực nào —
 * `nations.test.ts` giữ lời hứa ấy.
 */
export interface PopulationGroup {
  raceId: string;
  /** Tỷ lệ dân số, 0–1. Tổng mọi nhóm của một thế lực xấp xỉ 1. */
  population: number;
  status: MinorityStatus;
  /** 0–100. Cao + đông = nổi dậy sắc tộc (mục 3). */
  grievance: number;
  /** Đóng góp kinh tế/quân sự, 0–100. */
  usefulness: number;
  /**
   * TRẦN VĨNH VIỄN của `usefulness` sau khi bị truy bức.
   *
   * Đây là chỗ câu "mất VĨNH VIỄN đóng góp kinh tế của nhóm đó" (mục 3) sống
   * trong dữ liệu: đổi lại chính sách tử tế thì oán hận nguôi dần, nhưng người đã
   * đi thì đã đi, và trần này không bao giờ nâng lên nữa.
   */
  usefulnessCeiling: number;
  /** Đã từng bị truy bức ở đây. Phần 15 đọc để cho cộng đồng lưu vong hành động. */
  persecutedSinceYear: number;
}

/** Một cộng đồng lưu vong đang sống ở nước khác và vẫn nhớ vì sao mình ở đó. */
export interface ExileCommunity {
  raceId: string;
  fromPowerId: string;
  toPowerId: string;
  year: number;
  people: number;
  /** Mối hận mang theo. KHÔNG trôi về 0 như quan hệ giữa hai nước. */
  grudge: number;
}

/**
 * MỘT THẾ LỰC.
 *
 * Bảy con số chung cho cả tám, và ĐÚNG BẢY: mọi thứ đặc trưng của từng thể loại
 * nằm trong `board`. Thêm con số thứ tám vào đây là bắt đầu con đường "cùng một
 * bảng số liệu đổi nhãn" mà mục 1 cấm.
 */
export interface PowerState {
  /** `nation_*` — id trong mảng `nations` của `data/nations.json`. */
  id: string;
  minigame: MinigameKind;
  treasury: number;
  income: number;
  prestige: number;
  stability: number;
  /** Gắn kết nội bộ. Rơi xuống đáy là ly khai, không phải bị chinh phục. */
  cohesion: number;
  military: number;
  /** Đất, đo bằng ĐƠN VỊ TRỪU TƯỢNG chứ không phải tỉnh — tầng này không vẽ bản đồ. */
  land: number;
  groups: PopulationGroup[];
  /** Tâm trạng tộc thống trị: "bọn ngoại tộc đang cướp chỗ của ta" (mục 3). */
  dominantMood: number;
  board: PowerBoard;
  /** Đã sụp: bị phế truất, rã, hoặc mất kinh đô. Vẫn nằm trong danh sách để Phần 15 đọc. */
  fallen: boolean;
}

/** Một dòng trong ma trận quan hệ (mục 6). Đối xứng: `a` luôn nhỏ hơn `b` theo thứ tự chữ. */
export interface RelationRow {
  a: string;
  b: string;
  value: number;
  /** Mức nền để quan hệ trôi về. Yêu sách và chiến tranh không đổi mức nền. */
  base: number;
  claim: boolean;
  atWar: boolean;
  warYears: number;
  exhaustion: number;
  treaties: { id: string; yearsLeft: number }[];
}

/**
 * MỘT BIẾN CỐ CHÂU LỤC.
 *
 * Mục 12 đòi: mọi tuyên bố lớn phát event ra ngoài, đặc biệt là của Giáo hoàng.
 * `scope` quyết định nó chỉ vào dòng thời gian của một nước hay bắn ra eventbus
 * cho Phần 15 dựng popup.
 */
export interface WorldEvent {
  id: string;
  year: number;
  /** Thế lực phát ra. Rỗng nghĩa là chuyện của cả châu lục. */
  powerId: string;
  /** Id trong bảng `ripples` của `data/diplomacy.json`, hoặc rỗng nếu không dội đi đâu. */
  rippleId: string;
  text: string;
  scope: 'noi-bo' | 'chau-luc';
  /** Thế lực bị ảnh hưởng, để Phần 15 tra ngược. */
  targets: string[];
}

/**
 * MỘT MINIGAME.
 *
 * Tám module ở `/src/nations/*` cài đúng giao diện này và KHÔNG dùng chung gì
 * khác ngoài nó — mục 10.5 nói thẳng: "làm lần lượt, không làm chung một
 * component rồi đổi nhãn". Hợp đồng chung dừng lại ở `create` và `year`; mọi thứ
 * bên trong hai hàm ấy là của riêng từng thể loại.
 */
export interface MinigameModule {
  kind: MinigameKind;
  /** Tên thể loại, hiện ở góc bảng: "Cải cách đế chế", "Mật nghị & quyền lực thiêng"… */
  name: string;
  /** Dựng bảng khởi đầu từ hạt giống khai trong `data/nations.json → powers[].board`. */
  create(seed: Readonly<Record<string, unknown>>): PowerBoard;
  year(rng: import('@/core/rng').Rng, context: MinigameContext): MinigameYear;
}

/** Kết quả một năm của một minigame. Mọi minigame trả về đúng hình dạng này. */
export interface MinigameYear {
  board: PowerBoard;
  /** Cộng thẳng vào bảy con số chung. Thiếu trường nào là không đổi trường ấy. */
  deltas: Partial<Pick<PowerState, 'treasury' | 'income' | 'prestige' | 'stability' | 'cohesion' | 'military' | 'land'>>;
  lines: string[];
  events: WorldEvent[];
  /** Đặt `true` khi thế lực vừa sụp trong năm nay. */
  fallen?: boolean;
  /**
   * PHẢN ỨNG VỚI DỊ GIÁO — chỉ Giáo triều dùng (mục 5).
   *
   * Minigame không tự sửa bản đồ tôn giáo: nó KHAI ra phản ứng đã chọn, và tầng
   * thế giới áp vào `religions`. Cùng lý do minigame không sửa bảng nước khác —
   * một slice, một chủ ghi.
   */
  heresyResponse?: { areaId: string; responseId: string };
  /**
   * VŨ KHÍ THIÊNG vừa giáng xuống ai — cũng chỉ Giáo triều dùng.
   *
   * Tầng thế giới đọc cái này để dựng `sanctions` cho các thế lực bị nhắm ở năm
   * sau, và để chạy dòng dội `ripple_va-tuyet-thong`.
   */
  sanctionsIssued?: { targetId: string; kind: 'va-tuyet-thong' | 'cam-che' }[];
  /**
   * KHỦNG HOẢNG vừa sinh ra trong năm — id trong `religions.json → heresy.triggers`.
   *
   * Đói kém, dịch bệnh, hai Giáo hoàng, bán ân xá quá tay. Tầng thế giới đẩy
   * chúng thành TIẾNG VỌNG sống vài năm, đúng quy tắc bắt buộc của mục 5.
   */
  crisisTriggers?: string[];
}

/**
 * Bối cảnh một năm mà engine đưa cho minigame. Minigame KHÔNG đọc store, KHÔNG
 * đọc slice, và KHÔNG sửa thế lực khác — mọi thứ nó cần đều nằm trong đây, và
 * mọi thứ nó muốn gây ra cho nước khác đều đi qua `WorldEvent` + bảng dội.
 */
export interface MinigameContext {
  power: PowerState;
  year: number;
  /** Quan hệ với mọi thế lực khác, đọc-only. */
  relations: readonly RelationRow[];
  /** Uy tín của Giáo hội — vài minigame đọc nó (Đông La Mã, Đế quốc, Frank). */
  churchPrestige: number;
  /** Người chơi đang ở tầng nào với thế lực này. Tầng 3 thì minigame KHÔNG tự quyết. */
  tier: AccessTier;
  /** Đang có cuộc chiến nào không — ma trận quan hệ tính trước, minigame chỉ đọc. */
  atWar: boolean;
  /** Chiến dịch thắng và thua trong năm. Đất đã do tầng thế giới cộng trừ rồi. */
  campaignsWon: number;
  campaignsLost: number;
  /** Danh sách thế lực còn sống, để minigame nào cần chọn đối tượng thì chọn. */
  powerIds: readonly string[];
  /**
   * VŨ KHÍ THIÊNG đang giáng lên thế lực này.
   *
   * Giáo triều KHÔNG ghi vào bảng của nước khác — nó tuyên bố, tầng thế giới đọc
   * bảng của Giáo triều rồi đưa sự thật ấy vào đây. Nhờ thế "chư hầu được cởi lời
   * thề" là một dữ kiện mà minigame Đế quốc tự diễn giải theo luật của nó, chứ
   * không phải một con số Giáo triều thò tay trừ thẳng.
   */
  sanctions: { excommunicated: boolean; interdict: boolean };
  /**
   * Vùng đang có dị giáo vượt ngưỡng báo động, do bản đồ tôn giáo tính ra.
   *
   * Chỉ Giáo triều dùng tới, nhưng nó nằm ở bối cảnh CHUNG chứ không phải một
   * tham số riêng: bảy thế lực kia cũng nhìn thấy được chuyện ấy, và một ngày
   * Đế quốc sẽ muốn biết dị giáo đang lan ở đâu để quyết định đứng về phía nào.
   */
  heresyAlarms: readonly { areaId: string; share: number }[];
  /**
   * Tôn giáo chủ đạo của từng thế lực, đọc từ bản đồ tôn giáo.
   *
   * Không có nó thì Giáo triều sẽ ra lệnh CẤM CHẾ một đế quốc không theo đạo mình
   * — đóng cửa những nhà thờ không tồn tại, cởi lời thề mà không ai từng thề. Vũ
   * khí thiêng chỉ có hiệu lực trong phạm vi đức tin của chính nó, và đó là lý do
   * với kẻ ngoại đạo thì Giáo hoàng phải dùng thứ khác: thập tự chinh.
   */
  dominantFaiths: Readonly<Record<string, string>>;
}
