/**
 * KIỂU CỦA MỘT TRẬN QUYẾT ĐẤU (Phần 9).
 *
 * MỘT QUYẾT ĐỊNH ĐÁNG GIẢI THÍCH: mỗi đấu sĩ mang một `BodyState` RIÊNG, kể cả
 * NPC. Phần 7 chỉ mô hình hóa cơ thể của NHÂN VẬT NGƯỜI CHƠI — `state.body` là
 * một slice duy nhất, không phải một bảng theo id. Nhưng mục 8 của Phần 9 bắt
 * "mỗi đòn trúng đi thẳng qua Phần 7" và "không có thanh máu trận đấu riêng",
 * nên đối thủ cũng phải có một cơ thể thật với đủ hai mươi vùng, chứ không phải
 * một con số hp trá hình.
 *
 * Cách nối hai thứ đó lại:
 *   · trong trận, cả hai bên dùng `Fighter.body` — hàm thuần, không đụng store
 *   · vết thương của NGƯỜI CHƠI đồng thời sinh `PatchOp` đi qua MVU với actor
 *     `engine` (R2), nên state thật vẫn là sự thật duy nhất sau khi trận kết thúc
 *   · vết thương của NPC sống trong `Fighter.body` và chết theo trận đấu, cho
 *     tới khi Phần 15 dựng cơ thể cho NPC ba tầng phân giải
 *
 * `Fighter.id` RỖNG nghĩa là nhân vật người chơi. Đó là quy ước `CheckSpec.actor`
 * của Phần 5, và nhờ giữ đúng nó mà bảy nguồn modifier của Phần 7, ba nguồn của
 * Phần 8 và sáu nguồn của Phần 6 tự bật lên cho người chơi mà Phần 9 không phải
 * gọi một hàm nào.
 */

import type { CheckResult } from '@/core/turn';
import type { RngState } from '@/core/rng';
import type { PatchOp } from '@/state/mvu-parse';
import type { GameState } from '@/state/slices';
import type { BodyState } from '@/systems/body/slice';
import type { StatBlock } from '@/systems/character/stats';
import type { ChronicleRound, ChronicleSetting } from '@/systems/combat/chronicle';
import type { ArenaState, Cell, Dir8 } from './arena';
import type { Doctrine } from './doctrine';
import type { Loadout } from './equipment';

export type SideId = 'a' | 'b';

export function otherSide(side: SideId): SideId {
  return side === 'a' ? 'b' : 'a';
}

export interface Fighter {
  /** `CheckSpec.actor`. RỖNG = nhân vật người chơi (Phần 5). */
  id: string;
  name: string;
  side: SideId;
  /** Một dòng nhận dạng cho biên niên: chủng tộc, tước vị, dáng vẻ. */
  description: string;
  /** Quan hệ với người chơi, cho doctrine và cho biên niên. */
  relation: string;

  stats: StatBlock;
  /** Id kỹ năng → điểm rèn luyện 0–100. Chỗ DUY NHẤT giữ con số kỹ năng của NPC. */
  skills: Record<string, number>;
  /** Node Phần 8 đã mở. Người chơi lấy từ `skills.unlockedNodes`. */
  nodes: string[];
  /**
   * Thế đang bật, id node. Của NGƯỜI CHƠI thì đây chỉ là bản sao để UI đọc —
   * sự thật nằm ở `skills.activeStance` trong state, và nguồn `skills.the` của
   * Phần 8 đọc chỗ đó. Của ĐỐI THỦ thì đây là sự thật duy nhất.
   */
  stance: string;
  loadout: Loadout;

  pos: Cell;
  facing: Dir8;
  stamina: number;
  staminaMax: number;
  /** Thế trận −5..+5 (mục 6). */
  tempo: number;
  body: BodyState;

  /** Đã rơi vũ khí — một cửa kết thúc của mục 9. */
  disarmed: boolean;
  /** Đang nằm dưới đất. */
  prone: boolean;
  yielded: boolean;
  /** Bị hất cát: mù cho tới hết hiệp này. 0 là nhìn thấy bình thường. */
  blindUntil: number;
  /** Đã đổ máu — điều kiện kết thúc của đấu danh dự. */
  bled: boolean;
  /** Đã bước ra khỏi vòng đấu. */
  leftArena: boolean;

  doctrine: Doctrine;
  /** Nhãn hoàn cảnh cố định của đấu sĩ này, đổ vào `ModifierContext.tags`. */
  tags: string[];
}

/** Một lựa chọn hành động đã chốt cho một hiệp. */
export interface ChosenAction {
  actionId: string;
  /** Node Phần 8 khi hành động là một chiêu thức hoặc một thế. */
  nodeId?: string;
  /** Hướng quay, cho hành động có `move.turn = "free"`. */
  facing?: Dir8;
}

/** Một cú tung của trận, kèm bên đã tung nó. */
export interface DuelCheck {
  side: SideId;
  result: CheckResult;
}

export interface RoundLogLine {
  round: number;
  /** Bên gây ra dòng này. Rỗng là dòng của trọng tài / của cả trận. */
  side: SideId | '';
  text: string;
}

export interface DuelState {
  id: string;
  kindId: string;
  arena: ArenaState;
  a: Fighter;
  b: Fighter;
  /** Hiệp SẮP đánh. Bắt đầu ở 1. */
  round: number;
  finished: boolean;
  /** Id cửa ra trong `endings` của `data/arenas.json`. Rỗng khi chưa xong. */
  ending: string;
  winner: SideId | '';
  /** Biên niên đang tích, đúng định dạng dùng chung của Phần 10 và 11. */
  rounds: ChronicleRound[];
  /**
   * MỌI cú tung của trận, theo thứ tự, KÈM bên đã tung.
   *
   * `CheckResult` không mang `actor`, mà hai chỗ dùng lại đều cần biết ai tung:
   * bảng điều chỉnh của UI (mục 11) phải xếp đúng cột, và điểm thực hành của
   * Phần 8 chỉ được tính trên cú tung của người chơi — cú tung của đối thủ không
   * dạy người chơi được gì.
   */
  checks: DuelCheck[];
  log: RoundLogLine[];
  setting: ChronicleSetting;
  stakes: string;
  /**
   * Op cho MVU — CHỈ của người chơi, và CHỈ được áp sau khi trận kết thúc.
   * Áp giữa chừng thì `undo` một hiệp sẽ để lại nửa trận trong state.
   */
  playerOps: PatchOp[];
  /**
   * BẢN LÀM VIỆC của state, cho những phép kiểm của NGƯỜI CHƠI.
   *
   * Bảy nguồn modifier của Phần 7 và ba nguồn của Phần 8 đọc `ctx.state`, nên
   * cơn đau vừa nhận ở hiệp trước phải có mặt trong đó ngay ở hiệp sau. Engine
   * áp op của người chơi vào bản này qua MVU với actor `engine` (R2) và đồng
   * thời tích chúng vào `playerOps`; người gọi mới là chỗ chốt vào store thật,
   * vì họ mới giữ ngăn xếp undo.
   */
  state: GameState | null;
  /**
   * VỊ TRÍ DÒNG XÚC SẮC của riêng trận đấu, cập nhật sau mỗi hiệp.
   *
   * Không có ô này thì UI — vốn dựng lại `RngHub` từ `meta.rng` ở mỗi lần bấm —
   * sẽ khởi động lại dòng từ đúng một chỗ hết hiệp này sang hiệp khác, và cả
   * trận đấu tung ra cùng một con xúc sắc. Vị trí cuối được ghi vào
   * `meta.rng.streams.duel` lúc chốt trận, nên tải lại save rồi đánh tiếp vẫn
   * đúng R3.
   */
  rngState: RngState;
  /** Lượt game trận đấu diễn ra, để đóng dấu `Injury.inflictedTurn`. */
  turn: number;
  /** Đã gọi LLM mấy lần. Mục 1 cho tối đa 3 (1 lúc vào trận + 2 khúc ngoặt). */
  llmCalls: number;
}

export function fighterOf(duel: DuelState, side: SideId): Fighter {
  return side === 'a' ? duel.a : duel.b;
}

export function opponentOf(duel: DuelState, side: SideId): Fighter {
  return fighterOf(duel, otherSide(side));
}
