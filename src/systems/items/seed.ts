/**
 * TỪ KHAI BÁO CỦA PHẦN 6 THÀNH VẬT PHẨM THẬT CỦA PHẦN 16.
 *
 * `data/gear.json` nói NGÀI ĐANG MANG GÌ; nó không nói thanh kiếm ấy do ai rèn,
 * đã mẻ chưa, đo may cho ai. Hàm ở đây là cây cầu: chạy MỘT LẦN lúc chốt nhân
 * vật, đổi danh sách `character.gear` thành `items.owned` và `equipment.worn`.
 *
 * ĐO MAY THEO CHÍNH NGƯỜI VỪA TẠO: một hiệp sĩ bắt đầu ván chơi với bộ giáp của
 * chính mình, không phải với một bộ đi mượn. Cơ chế vừa người của mục 8 chỉ có
 * nghĩa khi nó là chuyện xảy ra với CHIẾN LỢI PHẨM — bắt người chơi chịu phạt
 * ngay từ trang bị khởi đầu là phạt họ vì đã tồn tại.
 *
 * `character.gear` VẪN CÒN sau khi seed, và đó là cố ý: nó là lớp khai báo mà
 * prompt của Phần 3 và phiếu nhân vật của Phần 6 đọc. Hai lớp, hai việc — cái
 * này nói "ngài xuất thân có gì", cái kia theo dõi từng vết mẻ trên nó.
 */

import type { PatchOp } from '@/state/mvu-parse';
import type { GameState } from '@/state/slices';
import { readPath } from '@/state/slices';
import type { CarriedGear } from '@/systems/character/gear';
import { armorPieceOf, hasWeaponProfile, qualityOf, shieldProfile } from './data';
import { shapeOfState } from './fit';
import { newItem } from './item';
import type { Item } from './types';

export interface SeedResult {
  items: Item[];
  worn: string[];
  packed: string[];
  mainHand: string;
  offHand: string;
}

/**
 * Dựng kho và bộ đồ đang mặc từ trang bị khai báo.
 *
 * Không tung xúc sắc: id suy từ vị trí trong danh sách (R3), và chất lượng lấy
 * đúng bậc mà `data/origins.json` đã khai. Một luồng tạo nhân vật hai lần cho
 * cùng một draft phải ra cùng một kho.
 */
export function seedItems(state: GameState, carried: readonly CarriedGear[]): SeedResult {
  const shape = shapeOfState(state);
  const items: Item[] = [];
  const worn: string[] = [];
  const packed: string[] = [];
  let mainHand = '';
  let offHand = '';

  for (const [index, entry] of carried.entries()) {
    const id = `item#khoi-dau#${String(index)}`;
    const isArmor = armorPieceOf(entry.item) !== null;

    const item = newItem(entry.item, {
      id,
      quality: qualityOf(entry.quality).level,
      ...(entry.material === '' ? {} : { material: entry.material }),
      ...(entry.note === '' ? {} : { note: entry.note }),
      // Giáp khởi đầu ĐO MAY cho chính người chơi — xem chú thích đầu file.
      ...(isArmor ? { fitTo: '', fitShape: shape } : {}),
      history: ['Mang theo từ lúc bắt đầu.'],
    });
    items.push(item);

    if (!entry.equipped) {
      packed.push(id);
      continue;
    }
    worn.push(id);
    if (shieldProfile(entry.item) !== null) offHand = id;
    else if (hasWeaponProfile(entry.item) && mainHand === '') mainHand = id;
  }

  return { items, worn, packed, mainHand, offHand };
}

/**
 * Op để nhét kho vừa dựng vào state qua MVU (R2).
 *
 * Trả về op chứ không ghi thẳng, cùng khuôn với `body/inflict.ts`: đường vào
 * state chỉ có một hình dạng, dù thay đổi đến từ lúc tạo nhân vật hay từ giữa
 * một trận đánh.
 */
export function seedOps(state: GameState, carried: readonly CarriedGear[]): PatchOp[] {
  const seeded = seedItems(state, carried);
  if (seeded.items.length === 0) return [];

  const owned = readPath(state, 'items.owned');
  const wornNow = readPath(state, 'equipment.worn');
  const packedNow = readPath(state, 'equipment.packed');

  return [
    {
      op: 'set',
      path: 'items.owned',
      from: Array.isArray(owned) ? owned : [],
      to: seeded.items,
      reason: 'dựng vật phẩm thật từ trang bị khởi đầu',
      source: 'json',
    },
    {
      op: 'set',
      path: 'equipment.worn',
      from: Array.isArray(wornNow) ? wornNow : [],
      to: seeded.worn,
      reason: 'mặc trang bị khởi đầu',
      source: 'json',
    },
    {
      op: 'set',
      path: 'equipment.packed',
      from: Array.isArray(packedNow) ? packedNow : [],
      to: seeded.packed,
      reason: 'xếp trang bị khởi đầu chưa mặc vào túi đồ',
      source: 'json',
    },
    {
      op: 'set',
      path: 'equipment.mainHand',
      to: seeded.mainHand,
      reason: 'vũ khí chính lúc bắt đầu',
      source: 'json',
    },
    {
      op: 'set',
      path: 'equipment.offHand',
      to: seeded.offHand,
      reason: 'tay còn lại lúc bắt đầu',
      source: 'json',
    },
  ];
}

/**
 * Ghi thẳng vào một state ĐANG DỰNG, dùng ở `buildInitialState` của Phần 6.
 *
 * Đây là ngoại lệ duy nhất với "mọi thay đổi qua MVU", và nó hợp lệ vì lúc này
 * chưa có ván chơi nào: state đang được nặn ra và sẽ được Zod kiểm nguyên khối
 * ngay sau đó. Trong ván chơi thì `seedOps` mới là cửa.
 */
export function seedInto(state: GameState, carried: readonly CarriedGear[]): void {
  const seeded = seedItems(state, carried);
  const items = state['items'];
  const equipment = state['equipment'];

  if (typeof items === 'object' && items !== null) {
    Object.assign(items, { owned: seeded.items, nextItemNo: seeded.items.length + 1 });
  }
  if (typeof equipment === 'object' && equipment !== null) {
    Object.assign(equipment, {
      worn: seeded.worn,
      packed: seeded.packed,
      mainHand: seeded.mainHand,
      offHand: seeded.offHand,
    });
  }
}
