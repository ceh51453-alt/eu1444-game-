/**
 * SỔ ĐĂNG KÝ TÁM MINIGAME — Phần 14 mục 10.5.
 *
 * "TÁM minigame với TÁM giao diện khác nhau. **Làm lần lượt, không làm chung một
 * component rồi đổi nhãn.**"
 *
 * File này là chỗ DUY NHẤT tám module gặp nhau, và nó cố tình mỏng: một bảng tra
 * `MinigameKind → MinigameModule`, không có logic chung nào. Nếu một ngày có một
 * hàm `sharedYear()` xuất hiện ở đây thì tám thể loại đã bắt đầu trôi về một chỗ,
 * và mục 1 nói thẳng chuyện đó là làm sai.
 *
 * HƯỚNG IMPORT MỘT CHIỀU, và nó quan trọng hơn vẻ ngoài:
 *
 *   `/src/nations/*`  →  `@/systems/nations/{types,data,events}`   ✔
 *   `/src/nations/*`  →  `@/systems/nations` (barrel)              ✘ vòng import
 *   `@/systems/nations/year.ts`  →  `/src/nations`                 ✔
 *
 * Tám module chỉ được nhập KIỂU, DATA và EVENT — không nhập `year.ts`, không nhập
 * `slice.ts`, không đọc store. Mọi thứ một minigame cần biết đều nằm trong
 * `MinigameContext`, và mọi thứ nó muốn gây ra cho nước khác đều đi qua
 * `WorldEvent` cùng bảng dội của `data/diplomacy.json`.
 */

import type { MinigameKind, MinigameModule } from '@/systems/nations/types';
import { byzantium } from './byzantium';
import { france } from './france';
import { horde } from './horde';
import { hre } from './hre';
import { latin } from './latin';
import { ottoman } from './ottoman';
import { papacy } from './papacy';
import { swiss } from './swiss';

export { byzantium } from './byzantium';
export { france } from './france';
export { horde } from './horde';
export { hre } from './hre';
export { latin } from './latin';
export { ottoman } from './ottoman';
export { papacy } from './papacy';
export { swiss } from './swiss';

const MODULES: readonly MinigameModule[] = [ottoman, byzantium, swiss, horde, hre, france, papacy, latin];

export class MinigameRegistryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MinigameRegistryError';
  }
}

const BY_KIND = ((): Map<MinigameKind, MinigameModule> => {
  const map = new Map<MinigameKind, MinigameModule>();
  for (const module of MODULES) {
    if (map.has(module.kind)) {
      throw new MinigameRegistryError(
        `hai module cùng thể loại "${module.kind}" — mục 1: nếu hai quốc gia chơi giống nhau thì một trong hai làm sai`,
      );
    }
    map.set(module.kind, module);
  }
  return map;
})();

export function minigameOf(kind: MinigameKind): MinigameModule {
  const module = BY_KIND.get(kind);
  if (module === undefined) throw new MinigameRegistryError(`chưa có module nào cho thể loại "${kind}"`);
  return module;
}

export function allMinigames(): MinigameModule[] {
  return [...MODULES];
}
