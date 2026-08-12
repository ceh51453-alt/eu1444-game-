/**
 * CỬA TỪ TRUYỆN VÀO MINIGAME — kiểu dữ liệu.
 *
 * Phần 9 mục 9 nói sáu loại quyết đấu "phần lớn nổ ra từ truyện"; Phần 10 và 11
 * nói y hệt về dã chiến và vây hãm. Cho tới trước file này, ba minigame chỉ mở
 * được bằng ba nút bấm tay ở bảng trạng thái, với đối thủ khai cứng trong
 * `/src/ui/*`— nghĩa là người kể chuyện có thể tả một hiệp sĩ rút kiếm ra thách
 * đấu mà không có cách nào biến nó thành một trận đấu thật.
 *
 * Cách hòa giải là cách của Phần 7 mục 3, y nguyên: **AI ĐỀ NGHỊ, ENGINE PHÁN
 * QUYẾT.** AI được nói ĐÚNG những thứ một người kể chuyện biết:
 *
 *   · đánh với ai      (một cái tên, một dòng tả, quan hệ với người chơi)
 *   · mạnh cỡ nào      (bốn nấc tương quan — không phải chỉ số kỹ năng)
 *   · to cỡ nào        (ba nấc quy mô)
 *   · ở đâu, vì cái gì (một địa danh, một câu được-mất)
 *   · quân số/tên phe  (chỉ khi chính câu chuyện đã xác lập)
 *
 * Engine tự chọn kỹ năng thật của đối thủ, trang bị, quân số từng cánh, binh
 * chủng, bậc công sự, mùa, và địa hình. AI không được BỊA số; số đã có trong
 * diễn biến phải được giữ nguyên để UI và truyện không nói hai sự thật khác nhau.
 *
 * NGƯỜI CHƠI VẪN LÀ NGƯỜI QUYẾT: một lời mời chỉ là một lời mời. Nó hiện thành
 * một tấm thẻ dưới đoạn văn với hai nút — vào trận, hoặc bỏ qua để engine tự
 * đánh. Tự động mở một lớp phủ toàn màn hình giữa lúc người ta đang đọc truyện
 * là cướp quyền điều khiển, và một trận vây hãm hai mươi tuần ập vào mặt người
 * chỉ muốn đọc tiếp là cách nhanh nhất để họ tắt game.
 */

import type { PatchOp } from '@/state/mvu-parse';

export type EncounterKind = 'duel' | 'battle' | 'siege';

/**
 * Bốn nấc tương quan lực lượng — thứ DUY NHẤT AI được nói về sức mạnh đối thủ.
 *
 * Bốn chữ, không phải một con số: người kể chuyện biết "hắn hơn anh một bậc",
 * không biết "kiếm thuật 63". Engine đổi bốn chữ ấy ra số THEO NGƯỜI CHƠI, nên
 * một đối thủ "ngang cơ" ở lượt 5 và ở lượt 300 là hai con người khác nhau.
 */
export type PowerTier = 'kem-hon' | 'ngang-co' | 'hon' | 'vuot-xa';

/** Ba nấc quy mô, cho dã chiến và vây hãm. */
export type ScaleTier = 'nho' | 'vua' | 'lon';

/** Bên người chơi đứng. Với vây hãm: `cong` là bên vây, `thu` là bên trong tường. */
export type StandSide = 'cong' | 'thu';

export const POWER_LABELS: Readonly<Record<PowerTier, string>> = {
  'kem-hon': 'kém hơn ngài',
  'ngang-co': 'ngang cơ',
  hon: 'hơn ngài một bậc',
  'vuot-xa': 'vượt xa ngài',
};

export const SCALE_LABELS: Readonly<Record<ScaleTier, string>> = {
  nho: 'nhỏ',
  vua: 'vừa',
  lon: 'lớn',
};

export const KIND_LABELS: Readonly<Record<EncounterKind, string>> = {
  duel: 'Quyết đấu',
  battle: 'Dã chiến',
  siege: 'Vây hãm',
};

/** Một lời mời đã đọc được từ thẻ, TRƯỚC khi engine kiểm duyệt. */
export interface EncounterRequest {
  kind: EncounterKind;
  /** Thẻ do model khai rõ, hay engine nhận ra trực tiếp từ đoạn truyện. */
  source: 'tag' | 'narrative';
  /** Câu trong output đã làm trận này xuất hiện; dùng để đối chiếu ở thẻ mời. */
  sourceText: string;
  /** Loại quyết đấu, id trong `data/arenas.json`. Rỗng với dã chiến và vây hãm. */
  kindId: string;
  /** Tên đối thủ, hoặc tên tòa thành với vây hãm. */
  foe: string;
  description: string;
  /** Quan hệ với người chơi — vào biên niên và vào doctrine của đối thủ. */
  relation: string;
  /** Tên chủ soái phe mình, khi người chơi không phải người cầm quân. */
  commander: string;
  /** Tên chủ soái đối phương, tách riêng để không đảo người khi người chơi thủ thành. */
  foeCommander: string;
  /** Tên đúng của hai lực lượng nếu câu chuyện đã thiết lập. */
  playerForceName: string;
  foeForceName: string;
  /**
   * Quân số đã được câu chuyện xác lập. `null` nghĩa là câu chuyện chưa nói,
   * lúc ấy engine mới được đọc quân lực thật trong state hoặc dùng ước lượng.
   */
  playerTroops: number | null;
  foeTroops: number | null;
  power: PowerTier;
  scale: ScaleTier;
  side: StandSide;
  place: string;
  stakes: string;
}

/** Lời mời đã qua kiểm duyệt, đang chờ người chơi bấm. */
export interface EncounterOffer {
  request: EncounterRequest;
  /** Dòng tiêu đề trên thẻ mời. */
  title: string;
  /** Engine sẽ dựng ra cái gì — người chơi đọc dòng này rồi mới quyết. */
  brief: string;
  /** Lượt game lời mời phát ra. */
  turn: number;
}

/** Kết quả kiểm duyệt một lô lời mời. */
export interface EncounterScreening {
  /** Lời mời được nhận. Mỗi lượt nhiều nhất MỘT. */
  offer: EncounterOffer | null;
  refused: { request: EncounterRequest; reason: string }[];
  /** Dòng giải thích cho tab Debug: engine đã sửa hoặc từ chối cái gì. */
  log: string[];
}

/** Kết quả engine tự đánh thay khi người chơi bấm "Bỏ qua". */
export interface AutoOutcome {
  ops: PatchOp[];
  /** Đoạn kể lại, đi thẳng vào dòng diễn biến và vào prompt lượt sau. */
  summary: string;
  /** Một dòng cơ học ngắn cho `TurnEntry.outcome`. */
  outcome: string;
}
