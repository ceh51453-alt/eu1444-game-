/**
 * CẦU NỐI GIỮA MÔ PHỎNG NGẦM VÀ PHẦN CÒN LẠI CỦA GAME.
 *
 * `deeptick.ts` cố ý không biết Phần 14 tồn tại: nó nhận `PowerSnapshot[]`,
 * `TitleHolding[]`, một câu tóm tắt tình hình, và một cuốn sổ tra tên. Nhờ vậy
 * bài test A của mục 12 chạy được trên một thế giới dựng tay, không cần nạp tám
 * bàn cờ chính trị.
 *
 * File này là chỗ DUY NHẤT biết cả hai bên. Nó đọc slice `nations` và `titles`
 * rồi nặn ra đúng bốn thứ ấy — và nó nhập THẲNG vào `slice.ts` của hai hệ đó,
 * không nhập barrel, cùng lý do với `ai/query.ts`: barrel của Phần 14 kéo theo
 * `create.ts` → cả tám minigame, và một tick nhanh không có lý do gì để nạp tám
 * bàn cờ vào bộ nhớ.
 */

import { regionName } from '@/lore/regions';
import type { GameState } from '@/state/slices';
import { nationsStateOf } from '@/systems/nations/slice';
import { powerName } from '@/systems/nations/data';
import { titlesStateOf } from '@/systems/titles/slice';
import { DEFAULT_NAMES, type NameBook } from './news';
import { worldStateOf } from './slice';
import type { PowerSnapshot, TitleHolding } from './invariants';

/**
 * Sổ tra tên.
 *
 * Ba nguồn, theo đúng thứ tự cụ thể dần: agent của Phần 15 (một con người có
 * tên), thế lực của Phần 14 (một quốc gia), rồi tới id trần. Một id lọt xuống
 * đáy vẫn hiện ra chứ không biến thành chuỗi rỗng — một dòng tin nói "một kẻ nào
 * đó vừa chết" ít vô dụng hơn một dòng tin nói " vừa chết".
 */
export function nameBookOf(state: GameState): NameBook {
  const agents = new Map((worldStateOf(state)?.agents ?? []).map((agent) => [agent.npcId, agent.name]));

  return {
    actor(id) {
      if (id === '') return DEFAULT_NAMES.actor('');
      const agent = agents.get(id);
      if (agent !== undefined && agent !== '') return agent;
      if (id.startsWith('nation_')) return powerName(id);
      // MỘT NƠI CHỐN CŨNG ĐỨNG ĐƯỢC VÀO CHỖ CHỦ THỂ: mục tiêu của một agent
      // thường là một lãnh thổ ("leo lên tước ở Burgundy"), và biến cố sinh ra
      // từ mục tiêu ấy mang chính id lãnh thổ làm `targetId`. Không tra ở đây
      // thì dòng tin sẽ đọc thành "không nghe lệnh realm_burgundy nữa".
      if (id.startsWith('realm_') || id.startsWith('prov_') || id.startsWith('hold_')) return regionName(id);
      return id;
    },
    place(id) {
      if (id === '') return DEFAULT_NAMES.place('');
      return regionName(id);
    },
  };
}

/** Bảng quốc gia rút gọn cho `enforceInvariants` và `capDrift`. */
export function powerSnapshots(state: GameState): PowerSnapshot[] {
  return (nationsStateOf(state)?.powers ?? []).map((power) => ({
    id: power.id,
    land: power.land,
    treasury: power.treasury,
    prestige: power.prestige,
    stability: power.stability,
    cohesion: power.cohesion,
    military: power.military,
    fallen: power.fallen,
  }));
}

/**
 * Thế lực đang có CHIẾN TRANH THẬT — miễn trần lãnh thổ của mục 9.
 *
 * "Thật" nghĩa là có một dòng `atWar` trong ma trận quan hệ của Phần 14, tức là
 * đã có một cuộc chiến được mô phỏng chứ không phải một con số tự trôi. Đó chính
 * là ranh giới mà mục 9 vạch ra: *"trừ khi có chiến tranh thật đã mô phỏng"*.
 */
export function powersAtWar(state: GameState): Set<string> {
  const rows = nationsStateOf(state)?.relations ?? [];
  const set = new Set<string>();
  for (const row of rows) {
    if (!row.atWar) continue;
    set.add(row.a);
    set.add(row.b);
  }
  return set;
}

/** Tước đang được giữ, cho phép kiểm `inv_mot-tuoc-mot-nguoi`. */
export function titleHoldings(state: GameState): TitleHolding[] {
  const held = titlesStateOf(state)?.held ?? [];
  // Người chơi là người giữ mọi tước trong `titles.held` — slice ấy là sổ của
  // riêng họ. NPC giữ tước gì thì nằm ở `vassals`, và Phần 13 đã bảo đảm một
  // chư hầu chỉ có một dòng, nên phép kiểm ở đây chỉ cần lo phần của người chơi.
  return held.map((title) => ({ titleId: title.titleId, holderId: 'player' }));
}

/**
 * Câu tóm tắt tình hình đi thẳng vào prompt tầng A (bước B1).
 *
 * NGẮN CÓ CHỦ Ý. Đây là phần đắt nhất của mỗi request: nó lặp lại ở mọi tháng,
 * cho mọi agent trong lô. Một bản tóm tắt dài gấp ba làm hoá đơn dài gấp ba mà
 * không làm quyết định của một bá tước thông minh hơn chút nào — ông ta chỉ cần
 * biết ai đang mạnh lên và ai đang đánh nhau.
 */
export function situationOf(state: GameState): string {
  const nations = nationsStateOf(state);
  if (nations === null || nations.powers.length === 0) return '';

  const alive = nations.powers.filter((power) => !power.fallen);
  const strongest = [...alive]
    .sort((left, right) => right.land - left.land)
    .slice(0, 3)
    .map((power) => powerName(power.id));

  const wars = nations.relations
    .filter((row) => row.atWar)
    .slice(0, 4)
    .map((row) => `${powerName(row.a)} đánh ${powerName(row.b)}`);

  const parts = [`mạnh nhất: ${strongest.join(', ')}`];
  if (wars.length > 0) parts.push(`đang có chiến sự: ${wars.join('; ')}`);
  return parts.join('. ');
}
