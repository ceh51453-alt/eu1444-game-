/**
 * DỰNG MỘT BUỔI ĐẤU TẬP TỪ VÁN CHƠI ĐANG CHẠY.
 *
 * Đây KHÔNG phải cách duy nhất một trận quyết đấu bắt đầu — mục 9 có sáu loại,
 * và phần lớn chúng nổ ra từ truyện: một lời thách, một phiên tòa, một ổ phục
 * kích. Những cửa ấy do các phần sau mở (Phần 13 cho quyết đấu tư pháp, Phần 15
 * cho phục kích trên đường). Cửa ở đây là cửa duy nhất Phần 9 tự mở được: người
 * chơi bước ra sân tập.
 *
 * Đối thủ tập là NPC dựng tại chỗ, không nằm trong state — Phần 15 mới là chỗ
 * NPC có đời sống riêng. Nên bạn tập không nhớ trận trước, và điều đó đúng: luật
 * chống cày của Phần 8 mục 3 đã lo chuyện tập mãi với một người, qua `context`
 * mà `practiceOps` đặt theo đối thủ.
 */

import type { Rng } from '@/core/rng';
import type { GameState } from '@/state/slices';
import { carry, type CarriedGear } from '@/systems/character/gear';
import { emptyStatBlock } from '@/systems/character/stats';
// Người chơi dựng ở `/src/systems/encounter/player.ts`, không dựng ở đây: từ khi
// truyện mở được trận đấu (cửa của `systems/encounter`), có HAI chỗ cần dựng
// người chơi thành đấu sĩ, và hai bản sao là hai bản sẽ lệch nhau ở lần sửa thứ ba.
import { playerFighterSpec, skillLevels } from '@/systems/encounter';
import { DEFAULT_DOCTRINE, archetype, createDuel, type DuelState, type FighterSpec } from '@/minigames/duel';

/**
 * Bạn tập: kỹ năng bám theo người chơi để buổi tập luôn đáng giá.
 *
 * KHÔNG bám sát tuyệt đối. Kém hơn một chút thì người chơi thắng nhiều hơn thua,
 * đúng cảm giác của một sân tập — và Phần 8 mục 3 đã lo phần "thất bại dạy nhiều
 * nhất", nên một bạn tập ngang cơ hoàn hảo sẽ làm điểm thực hành lên nhanh bất
 * thường mà không ai cố ý thiết kế thế.
 */
function partnerSpec(state: GameState): FighterSpec {
  const level = skillLevels(state)['skill_kiem-thuat'] ?? 0;
  const gear: CarriedGear[] = [];
  for (const id of ['item_kiem-mot-tay', 'item_ao-lot-giap']) {
    const entry = carry(id);
    if (entry !== null) gear.push(entry);
  }

  return {
    id: 'npc_ban-tap',
    name: 'Bạn tập ở sân',
    description: 'một tay lính già đã đấu tập với ba đời lãnh chúa',
    stats: { ...emptyStatBlock(10), str: 11, agi: 11, vit: 12, wil: 11 },
    skills: { 'skill_kiem-thuat': Math.max(10, Math.round(level * 0.9)), skill_khien: 20, 'skill_tay-khong': 25 },
    gear,
    doctrine: archetype('nhan-nai') ?? DEFAULT_DOCTRINE,
    relation: 'người dạy đánh nhau ở sân sau',
  };
}

export function createSparringDuel(state: GameState, rng: Rng, turn: number): DuelState {
  return createDuel(rng, {
    kindId: 'dau-tap',
    arenaId: 'arena_san-dau',
    // Sân tập có kiếm cùn cho mượn: một buổi đấu tập mà người chơi đứng không
    // cầm gì là một buổi đấu tập vô nghĩa.
    a: playerFighterSpec(state, true),
    b: partnerSpec(state),
    state,
    turn,
    stakes: 'điểm thực hành, và một buổi chiều',
    setting: { place: 'sân tập sau chuồng ngựa', timeOfDay: 'xế chiều', witnesses: 'vài người hầu đứng xem' },
  });
}
