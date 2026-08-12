/**
 * NHÂN VẬT NGƯỜI CHƠI, DẠNG MỘT ĐẤU SĨ.
 *
 * Tách ra khỏi `/src/ui/duel/spar.ts` vì từ file này trở đi có HAI cửa dựng
 * trận đấu — nút "Đấu tập" ở bảng trạng thái, và lời mời AI phát ra giữa truyện
 * — mà cả hai đều phải dựng người chơi y hệt nhau. Hai bản sao của cùng một
 * phép đổi là hai bản sẽ lệch nhau ở lần sửa thứ ba.
 *
 * Hướng phụ thuộc: `/src/ui` gọi vào đây, không bao giờ ngược lại.
 */

import type { GameState } from '@/state/slices';
import { carry, type CarriedGear } from '@/systems/character/gear';
import { characterOf } from '@/systems/character/slice';
import { emptyStatBlock, type StatBlock } from '@/systems/character/stats';
import { skillsOf } from '@/systems/skills/slice';
import type { FighterSpec } from '@/minigames/duel';
import { equipmentOf, hasWeaponProfile, itemsOf, qualityByLevel } from '@/systems/items';

/** Kỹ năng của người chơi, dạng phẳng mà `FighterSpec` cần. */
export function skillLevels(state: GameState): Record<string, number> {
  const skills = characterOf(state)?.skills ?? {};
  const out: Record<string, number> = {};
  for (const [id, entry] of Object.entries(skills)) out[id] = entry.level;
  return out;
}

/** Thế đang bật, nếu có. Của người chơi thì sự thật nằm ở `skills.activeStance`. */
function activeStance(state: GameState): string {
  return Object.values(skillsOf(state)?.activeStance ?? {}).find((id) => id !== '') ?? '';
}

/**
 * Người chơi bước vào sàn đấu.
 *
 * `id` RỖNG là quy ước `CheckSpec.actor` của Phần 5 — nhờ nó mà nguồn modifier
 * của Phần 6, 7 và 8 tự bật lên cho người chơi mà không ai phải gọi hàm nào.
 *
 * `borrowWeapon` bật khi sàn đấu có sẵn vũ khí tập để mượn: một buổi đấu tập mà
 * người chơi đứng không cầm gì là một buổi đấu tập vô nghĩa. Ở một trận thật thì
 * TẮT — tay không đối mặt với một kẻ rút kiếm là một tình thế có thật, và engine
 * không được phép phát vũ khí từ hư không để cứu người chơi khỏi nó.
 */
export function playerFighterSpec(state: GameState, borrowWeapon = false): FighterSpec {
  const character = characterOf(state);
  const equipment = equipmentOf(state);
  const items = itemsOf(state);
  const byId = new Map((items?.owned ?? []).map((item) => [item.id, item] as const));
  const trueGear: CarriedGear[] = [
    ...(equipment?.worn ?? []).map((id) => ({ id, equipped: true })),
    ...(equipment?.packed ?? []).map((id) => ({ id, equipped: false })),
  ].flatMap(({ id, equipped }) => {
    const item = byId.get(id);
    if (item === undefined) return [];
    const converted = carry(item.templateId, {
      material: item.material,
      quality: qualityByLevel(item.quality).id,
      equipped,
      note: item.note,
    });
    return converted === null ? [] : [converted];
  });
  // Save cũ hoặc test hẹp chưa có slice vật phẩm thật thì vẫn đọc lớp khai báo
  // của nhân vật. Khi hai slice có mặt, `equipment` là nguồn sự thật duy nhất.
  const gear = equipment !== null && items !== null
    ? trueGear
    : ((character?.gear ?? []) as CarriedGear[]);
  const stats = (character?.stats ?? emptyStatBlock(10)) as StatBlock;

  const armed = gear.some((entry) => entry.equipped && hasWeaponProfile(entry.item));
  const borrowed = borrowWeapon ? carry('item_kiem-mot-tay') : null;
  const carried = armed || borrowed === null ? gear : [...gear, borrowed];

  const stance = activeStance(state);
  const name = character?.identity.name;

  return {
    id: '',
    name: name === undefined || name === '' ? 'Ngài' : name,
    description: '',
    stats,
    skills: skillLevels(state),
    gear: carried,
    nodes: skillsOf(state)?.unlockedNodes ?? [],
    ...(stance === '' ? {} : { stance }),
  };
}
