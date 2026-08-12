/**
 * NHỮNG THAY ĐỔI MÀ MÀN TRANG BỊ ĐƯỢC PHÉP LÀM.
 *
 * Mọi thứ đi qua MVU với actor `engine` (R2) — không component nào ghi thẳng
 * vào store. Hàm ở đây THUẦN: nhận state, trả về `PatchOp[]`, và người gọi mới
 * là chỗ áp. Cùng khuôn với `body/inflict.ts` của Phần 7, và vì cùng một lý do:
 * một thay đổi không đi qua MVU là một thay đổi mà undo không tua lại được.
 *
 * `equipment` toàn quyền `engine` (mục 17), nên bốn hàm này là CỬA DUY NHẤT để
 * đổi "đang mặc gì" — kể cả khi người chơi kéo thả bằng chuột.
 */

import type { PatchOp } from '@/state/mvu-parse';
import type { GameState } from '@/state/slices';
import {
  applyMaintenance,
  armorPieceOf,
  equipmentOf,
  fitOfItem,
  itemName,
  itemsOf,
  ownedItem,
  wearerOfState,
  type Item,
} from '@/systems/items';

export interface ActionResult {
  ops: PatchOp[];
  /** Lý do bị từ chối, rỗng khi làm được. */
  refused: string;
}

const ok = (ops: PatchOp[]): ActionResult => ({ ops, refused: '' });
const no = (refused: string): ActionResult => ({ ops: [], refused });

/**
 * MẶC MỘT MÓN.
 *
 * CHẶN CỨNG món không vừa, không chỉ hiện chữ đỏ — mục 18 đòi đúng chữ đó cho ô
 * "Vừa người", và ký hiệu `[LOCKED]` của README mục 3.3 nói rõ chặn ở UI là
 * chưa đủ khi luật nằm ở engine. Ở đây luật nằm ở engine: một bộ giáp gò cho
 * khung xương Lùn thì một người Ogre không cài lại được, và không có nút nào
 * trên đời đổi được điều đó.
 */
export function equipOps(state: GameState, itemId: string): ActionResult {
  const equipment = equipmentOf(state);
  const item = ownedItem(state, itemId);
  if (equipment === null || item === null) return no('Không tìm thấy món ấy trong kho.');
  if (equipment.worn.includes(itemId)) return no(`${item.name} đang mặc rồi.`);
  if (!(equipment.packed ?? []).includes(itemId)) {
    return no(`${item.name} đang ở kho sở hữu, chưa nằm trong túi đồ.`);
  }

  const fit = fitOfItem(item, wearerOfState(state));
  if (!fit.wearable) return no(`${item.name}: ${fit.reason}`);

  const needs = armorPieceOf(item.templateId)?.requires ?? '';
  if (needs !== '') {
    const items = itemsOf(state);
    const hasBase = equipment.worn.some(
      (id) => items?.owned.find((owned) => owned.id === id)?.templateId === needs,
    );
    if (!hasBase) return no(`${item.name} cần ${itemName(needs)} mới đeo được.`);
  }

  return ok([
    {
      op: 'set',
      path: 'equipment.packed',
      from: equipment.packed ?? [],
      to: (equipment.packed ?? []).filter((id) => id !== itemId),
      reason: `lấy ${item.name} khỏi túi để mặc`,
      source: 'json',
    },
    {
      op: 'push',
      path: 'equipment.worn',
      to: itemId,
      reason: `mặc ${item.name}`,
      source: 'json',
    },
  ]);
}

/**
 * CỞI MỘT MÓN.
 *
 * Cởi món NỀN thì cởi luôn món phụ thuộc vào nó: tháo mũ bascinet ra mà để tấm
 * che mặt lơ lửng thì ràng buộc `mon-giap-phu-thuoc-phai-co-mon-nen` của slice
 * sẽ từ chối CẢ LÔ (R4), và người chơi chỉ thấy một nút không làm gì cả.
 */
export function unequipOps(state: GameState, itemId: string): ActionResult {
  const equipment = equipmentOf(state);
  const items = itemsOf(state);
  if (equipment === null || items === null) return no('Chưa có kho trang bị.');
  if (!equipment.worn.includes(itemId)) return no('Món ấy không ở trên người.');

  const templateOfWorn = (id: string): string =>
    items.owned.find((owned) => owned.id === id)?.templateId ?? '';
  const removedTemplate = templateOfWorn(itemId);
  const dropped = new Set([itemId]);

  for (const id of equipment.worn) {
    if (armorPieceOf(templateOfWorn(id))?.requires === removedTemplate) dropped.add(id);
  }

  return ok([
    {
      op: 'set',
      path: 'equipment.worn',
      from: equipment.worn,
      to: equipment.worn.filter((id) => !dropped.has(id)),
      reason: `cởi ${itemName(removedTemplate)}`,
      source: 'json',
    },
    {
      op: 'set',
      path: 'equipment.packed',
      from: equipment.packed ?? [],
      to: [...new Set([...(equipment.packed ?? []), ...dropped])],
      reason: `xếp ${itemName(removedTemplate)} vào túi đồ`,
      source: 'json',
    },
  ]);
}

/** Lấy một món từ kho sở hữu cho vào túi để mang theo. */
export function packOps(state: GameState, itemId: string): ActionResult {
  const equipment = equipmentOf(state);
  const item = ownedItem(state, itemId);
  if (equipment === null || item === null) return no('Không tìm thấy món ấy trong kho.');
  if (equipment.worn.includes(itemId)) return no('Phải cởi món ấy trước khi xếp vào túi.');
  if ((equipment.packed ?? []).includes(itemId)) return no(`${item.name} đã nằm trong túi.`);
  return ok([{
    op: 'push',
    path: 'equipment.packed',
    to: itemId,
    reason: `lấy ${item.name} từ kho cho vào túi đồ`,
    source: 'json',
  }]);
}

/** Cất một món khỏi túi về kho sở hữu; món đó không còn đi theo nhân vật. */
export function stashOps(state: GameState, itemId: string): ActionResult {
  const equipment = equipmentOf(state);
  const item = ownedItem(state, itemId);
  if (equipment === null || item === null) return no('Không tìm thấy món ấy.');
  if (!(equipment.packed ?? []).includes(itemId)) return no(`${item.name} không nằm trong túi.`);
  return ok([{
    op: 'set',
    path: 'equipment.packed',
    from: equipment.packed ?? [],
    to: (equipment.packed ?? []).filter((id) => id !== itemId),
    reason: `cất ${item.name} về kho sở hữu`,
    source: 'json',
  }]);
}

/** Thắt đai và móc treo, hoặc bỏ ra (mục 9). */
export function beltOps(state: GameState, belted: boolean): ActionResult {
  const equipment = equipmentOf(state);
  if (equipment === null) return no('Chưa có kho trang bị.');
  if (equipment.belted === belted) return no('');

  return ok([
    {
      op: 'set',
      path: 'equipment.belted',
      from: equipment.belted,
      to: belted,
      reason: belted ? 'thắt đai và móc treo' : 'tháo đai',
      source: 'json',
    },
  ]);
}

/**
 * BẢO DƯỠNG một món: bỏ ra một số giờ, hồi tình trạng.
 *
 * KHÔNG tự sửa hư hỏng cụ thể — mục 10 tách hai việc, và chúng làm ở hai chỗ:
 * lau dầu và mài lưỡi làm được ngay tại lều, còn gò một tấm móp thì phải có lò
 * rèn. Nút này là cái thứ nhất.
 */
export function maintainOps(state: GameState, itemId: string, hours: number): ActionResult {
  const items = itemsOf(state);
  const item = ownedItem(state, itemId);
  if (items === null || item === null) return no('Không tìm thấy món ấy.');
  if (item.condition >= 100) return no(`${item.name} không cần chăm gì thêm.`);

  const index = items.owned.findIndex((owned) => owned.id === itemId);
  if (index < 0) return no('Không tìm thấy món ấy trong kho.');

  const after: Item = applyMaintenance(item, hours);
  return ok([
    {
      op: 'set',
      path: `items.owned.${String(index)}.condition`,
      from: item.condition,
      to: after.condition,
      reason: `bảo dưỡng ${item.name} trong ${String(hours)} giờ`,
      source: 'json',
    },
  ]);
}
