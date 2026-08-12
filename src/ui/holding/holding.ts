/**
 * MỞ MÀN HÌNH THÀNH TRÌ TỪ VÁN CHƠI ĐANG CHẠY.
 *
 * Ưu tiên các thành trì ĐÃ CÓ trong state. Chỉ khi chưa có cái nào — ván chơi mới
 * dựng, hoặc người chơi xuất thân nông nô — thì mới dựng một thôn khởi đầu, và
 * nó đi theo con đường `phat-trien` của mục 2: không ai cho gì, nên cũng không ai
 * đòi gì, và mọi viên đá đều do người chơi đặt.
 *
 * Thành trì khai lúc tạo nhân vật nằm ở `data/starting-possessions.json` (Phần 6)
 * — đó là LỚP KHAI BÁO, còn hệ thật là Phần 12, đúng như bảng tra của README mục
 * 5 nói. Cửa dưới đây là chỗ hai thứ ấy gặp nhau.
 */

import type { Rng } from '@/core/rng';
import type { GameState } from '@/state/slices';
import { characterOf } from '@/systems/character/slice';
import { allHoldings, createHolding, uniqueHoldingName, type Holding } from '@/systems/holding';

/** Tên thôn khởi đầu, để không đụng tên bất kỳ lãnh thổ nào (Phụ lục A mục 9a). */
const SEED_NAMES = ['Bạch Dương', 'Cửa Suối', 'Gò Sồi', 'Bến Sậy', 'Đồi Mía'];

export function openHoldings(state: GameState, rng: Rng): Holding[] {
  const existing = allHoldings(state);
  if (existing.length > 0) return existing;

  // Danh sách tên đã dùng đến từ NGOÀI, không phải từ slice `realm` — Phụ lục A
  // mục 9a chặn trùng tên ở khâu dữ liệu, và mục 1 của Phần 12 cấm `holdings`
  // đọc thẳng sang tầng lãnh thổ. Ở đây chưa có thành trì nào nên danh sách rỗng;
  // khi Phần 13 có tên lãnh thổ thật thì nó truyền vào qua cửa này.
  const name = uniqueHoldingName(rng.pick(SEED_NAMES), []);
  const raceId = characterOf(state)?.identity.race ?? 'race_frank';

  return [
    createHolding(rng, {
      slug: 'thon-khoi-dau',
      name,
      path: 'phat-trien',
      turn: state.meta.turn,
      seat: true,
      population: 62,
      races: [{ raceId, people: 62 }],
      // Đủ để dựng căn nhà đầu tiên và đào cái giếng đầu tiên, không hơn. Mọi
      // thứ sau đó phải tự kiếm — đó là cả ý nghĩa của con đường `phat-trien`.
      stores: { tien: 60, go: 40, da: 10 },
    }),
  ];
}
