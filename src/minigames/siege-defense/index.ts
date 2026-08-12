/**
 * THỦ THÀNH — bảng hành động BÊN THỦ, cuộc đột kích, và minigame dưới lòng đất (Phần 11).
 *
 * Thư mục này giữ đúng ba thứ, và cả ba đều là "vai người đứng sau tường":
 *
 *   `actions.ts`     chín hành động của mục 3 — khẩu phần, sửa tường, đột kích,
 *                    phản đào hầm, nước sôi, cầu viện, đuổi dân, giả vờ dư dả,
 *                    giữ lòng người
 *   `sortie.ts`      cuộc đột kích đốt máy công thành, quy mô rút gọn
 *   `countermine.ts` đánh nhau dưới lòng đất trong bóng tối (mục 10.5)
 *
 * KHÔNG import gì từ `minigames/siege-attack/`, và ngược lại. Mục 10.4 đòi hai
 * bảng hành động RIÊNG BIỆT, và cách chắc chắn nhất để hai bảng ấy không lặng lẽ
 * mọc thành một là để chúng không có đường nào tới nhau.
 *
 * Xem `README.md` cùng thư mục cho hợp đồng đọc/ghi state.
 */

export {
  autoDefenderAction,
  boilingOil,
  counterMineAction,
  defenderActions,
  expelCivilians,
  feignPlenty,
  holdHearts,
  repairWalls,
  sallyOut,
  sendForHelp,
  setRation,
  sueForTerms,
  type HeartsMode,
} from './actions';

export { sortie, type SortieReport } from './sortie';

export { counterMine, type CounterMineReport, type CounterMineRound } from './countermine';
