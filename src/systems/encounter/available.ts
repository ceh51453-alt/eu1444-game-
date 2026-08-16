/**
 * BỐN CÁI NÚT MỞ ĐƯỢC HAY KHÔNG — và vì sao không.
 *
 * "Đấu tập", "Ra trận", "Công thành", "Thủ thành" là bốn cửa duy nhất mà Phần
 * 9–11 tự mở được cho mình (xem README của thư mục này). Bản trước cho cả bốn
 * hiện ra ngay khi nhân vật vừa chốt xong, và bấm cái nào cũng ra một trận —
 * nhưng cái trận ấy phần lớn là BỊA: `ui/battle/field.ts` có một hàm tên thẳng
 * là `fallbackArmy` dựng 1.800 quân từ hư không, còn `ui/siege/siege.ts` phát
 * cho kẻ vây 2.000 người và một kho bạc 1.200 đồng khi state không có gì.
 *
 * Hai hệ quả, và cả hai đều tệ:
 *
 *  - **Con số nói dối.** Người chơi thấy đạo quân của mình có 1.800 người trong
 *    khi slice `military` nói không có ai. Sau trận, `battleCampaignOps` ghi
 *    thương vong về một đạo quân không tồn tại.
 *  - **Truyện nói dối.** Bấm "Công thành" giữa một cảnh uống rượu trong quán
 *    trọ thì đột nhiên có một cuộc vây hãm, mà không một dòng diễn biến nào
 *    dẫn tới đó.
 *
 * Nên bốn cái nút bây giờ hỏi state TRƯỚC: có đạo quân thật không, có địch đứng
 * cùng ô trên chiến đồ không, có đang vây ai không, có ai đang vây mình không.
 * Không có thì KHÔNG hiện nút. Đây là cùng một luật mà `ui/holding/holding.ts`
 * đã áp cho nút "Thành trì": một cái nút mở ra một màn hình bịa là một lời hứa
 * suông, và không có nút mới là câu trả lời đúng.
 *
 * `reason` luôn được điền kể cả khi `ok` — bảng trạng thái dùng nó làm tooltip,
 * nên người chơi biết mình đang sắp đánh ai chứ không chỉ biết là bấm được.
 */

import type { GameState } from '@/state/slices';
import { bodyOf } from '@/systems/body';
import { campaignStateOf } from '@/systems/campaign';
import { characterOf } from '@/systems/character';
import { allHoldings } from '@/systems/holding';
import { militaryStateOf, type MilitaryForce } from '@/systems/military';

export interface EncounterOption {
  ok: boolean;
  /** Câu tiếng Việt đọc được: đang đánh ai, hoặc vì sao chưa đánh được. */
  reason: string;
}

export interface AvailableEncounters {
  spar: EncounterOption;
  battle: EncounterOption;
  besiege: EncounterOption;
  defend: EncounterOption;
}

function no(reason: string): EncounterOption {
  return { ok: false, reason };
}

function yes(reason: string): EncounterOption {
  return { ok: true, reason };
}

const ALL_CLOSED = (reason: string): AvailableEncounters => ({
  spar: no(reason),
  battle: no(reason),
  besiege: no(reason),
  defend: no(reason),
});

/** Đạo quân bộ của người chơi còn quân sống. */
function livingLandForce(state: GameState): MilitaryForce | null {
  const military = militaryStateOf(state);
  if (military === null) return null;
  return (
    military.forces.find((force) => force.kind === 'land' && force.units.some((unit) => unit.strength > 0)) ?? null
  );
}

function troopsOf(force: MilitaryForce): number {
  return force.units.reduce((sum, unit) => sum + Math.max(0, unit.strength), 0);
}

/**
 * Bốn cửa, xét theo state THẬT.
 *
 * Hai cửa kiểm duyệt chung đứng trước, cùng hai cửa mà `screenEncounters` đã
 * dùng cho lời mời đến từ truyện: chưa chốt nhân vật thì không có ai để đánh,
 * và người chết thì không đánh nhau. Giữ chung một luật cho cả hai đường vào là
 * cách duy nhất để "truyện mở được trận mà nút bấm thì không" không xảy ra.
 */
export function availableEncounters(state: GameState | null): AvailableEncounters {
  if (state === null) return ALL_CLOSED('chưa có ván chơi');

  const character = characterOf(state);
  if (character === null || !character.identity.finalized) return ALL_CLOSED('chưa chốt nhân vật');
  if (bodyOf(state)?.dead === true) return ALL_CLOSED('nhân vật đã chết');

  // CHƯA CÓ DIỄN BIẾN NÀO. Lượt 0 là lúc màn kể còn trống — "Chưa có gì xảy ra.
  // Gõ một hành động ở dưới để chạy lượt đầu tiên." Bốn cái nút này đều là
  // những việc xảy ra TRONG một cảnh, nên trước khi có cảnh nào thì không cái
  // nào có chỗ đứng.
  if (state.meta.turn <= 0) return ALL_CLOSED('ván chơi chưa bắt đầu — hãy chạy lượt đầu tiên');

  return {
    spar: sparOption(),
    battle: battleOption(state),
    besiege: besiegeOption(state),
    defend: defendOption(state),
  };
}

/**
 * ĐẤU TẬP là cửa duy nhất trong bốn cái không đòi gì ở chiến đồ.
 *
 * Bạn tập là NPC dựng tại chỗ và điều đó có chủ ý (xem `ui/duel/spar.ts`) — sân
 * tập là chỗ luôn có người. Nên điều kiện của nó chỉ là hai cửa kiểm duyệt
 * chung cộng với "ván chơi đã chạy", cả ba đã xét ở trên.
 */
function sparOption(): EncounterOption {
  return yes('ra sân tập với lính trong trại');
}

/**
 * RA TRẬN cần một đạo quân THẬT và một kẻ địch đứng CÙNG Ô trên chiến đồ.
 *
 * Cả hai vế đều bắt buộc, và vế thứ hai là vế bản trước bỏ qua: có quân mà
 * không có ai trước mặt thì đó là một cuộc hành quân, không phải một trận đánh.
 */
function battleOption(state: GameState): EncounterOption {
  const force = livingLandForce(state);
  if (force === null) return no('chưa có đạo quân nào để ra trận');

  const campaign = campaignStateOf(state);
  if (campaign === null) return no('chưa có chiến đồ — chưa có mặt trận nào');

  const ours = campaign.armies.filter((army) => army.factionId === campaign.playerFactionId);
  if (ours.length === 0) return no(`${force.name} chưa lên chiến đồ`);

  for (const army of ours) {
    const enemy = campaign.armies.find(
      (other) => other.nodeId === army.nodeId && other.factionId !== army.factionId,
    );
    if (enemy !== undefined) {
      return yes(`${army.name} (${String(troopsOf(force))} quân) đối mặt ${enemy.name} (${String(enemy.troops)} quân)`);
    }
  }
  return no('không có quân địch nào đứng trước mặt');
}

/** CÔNG THÀNH cần một đạo quân của mình ĐANG vây một ô trên chiến đồ. */
function besiegeOption(state: GameState): EncounterOption {
  const campaign = campaignStateOf(state);
  if (campaign === null) return no('chưa có chiến đồ — chưa vây được ai');

  const army = campaign.armies.find(
    (row) => row.factionId === campaign.playerFactionId && row.siegeNodeId !== '',
  );
  if (army === undefined) return no('chưa đem quân tới vây thành nào');

  const mark = campaign.sieges.find((row) => row.armyId === army.id || row.nodeId === army.siegeNodeId);
  const weeks = mark?.weeks ?? 0;
  return yes(weeks > 0 ? `${army.name} đã vây ${String(weeks)} tuần` : `${army.name} vừa dựng trại vây`);
}

/**
 * THỦ THÀNH cần MỘT THÀNH TRÌ CỦA MÌNH đang bị vây.
 *
 * Hai nguồn, và chấp nhận cả hai: cờ `besieged` trên chính thành trì (Phần 12
 * bật khi cuộc vây bắt đầu) hoặc một dấu vây trên chiến đồ do phe khác dựng.
 * Chỉ đọc một nguồn thì một trong hai đường vào cuộc vây sẽ không mở được nút.
 */
function defendOption(state: GameState): EncounterOption {
  const besieged = allHoldings(state).find((holding) => holding.besieged);
  if (besieged !== undefined) return yes(`${besieged.name} đang bị vây`);

  const campaign = campaignStateOf(state);
  if (campaign === null) return no('không có thành trì nào của ngài đang bị vây');

  const mark = campaign.sieges.find((row) => row.attackerId !== campaign.playerFactionId);
  if (mark === undefined) return no('không có thành trì nào của ngài đang bị vây');

  // Dấu vây của một phe khác chỉ là chuyện của NGÀI nếu ô ấy là ô của ngài.
  const ourNode = campaign.control[mark.nodeId] === campaign.playerFactionId;
  if (!ourNode) return no('cuộc vây ấy không phải thành của ngài');
  return yes(`thành trên chiến đồ bị vây ${String(mark.weeks)} tuần`);
}
