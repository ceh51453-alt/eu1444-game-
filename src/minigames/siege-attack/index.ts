/**
 * CÔNG THÀNH — bảng hành động BÊN VÂY và cuộc TỔNG CÔNG (Phần 11).
 *
 * Thư mục này giữ đúng hai thứ, và cả hai đều là "vai người đứng ngoài tường":
 *
 *   `actions.ts`    chín hành động của mục 3 — vòng vây, hầm, máy, bắn phá, cắt
 *                   nước, ném xác, chiêu hàng, mua chuộc, đợi
 *   `assault.ts`    giai đoạn 2 trên lưới có tầng (mục 6)
 *   `duel-link.ts`  chiến trên mặt tường → nhường sân cho Phần 9
 *
 * Nhịp tuần, công sự, đàm phán, cướp phá và biên niên KHÔNG ở đây — chúng ở
 * `/src/systems/siege/`, vì mục 2 nói `Fortification` được ĐIỀN từ nhóm công
 * trình phòng thủ của Phần 12, và Phần 12 không được phải import từ một minigame.
 *
 * Xem `README.md` cùng thư mục cho hợp đồng đọc/ghi state.
 */

export {
  autoBesiegerAction,
  besiegerActions,
  bombard,
  bribeInsider,
  buildCircumvallation,
  buildEngine,
  cutWater,
  digMine,
  offerTerms,
  throwCorpses,
  wait,
} from './actions';

export {
  assaultBreakdown,
  assaultRound,
  assaultSummary,
  availableMethods,
  forlornReward,
  layerPath,
  runAssault,
  settleAssault,
  startAssault,
  type AssaultBreakdown,
  type AssaultRoundResult,
  type AssaultSetup,
  type AssaultSummary,
} from './assault';

export {
  canFightOnWall,
  fightOnWall,
  isDuelLayer,
  playerFellFromWall,
  playerOnWall,
  resolveWallFight,
  wallDefender,
  type WallFight,
  type WallFightResult,
} from './duel-link';
