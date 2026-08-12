/**
 * HAI SLICE CỦA PHẦN 16 (mục 17), và hai cái tên riêng là cố ý.
 *
 *   `items`      MỌI món ngài sở hữu, kể cả món nằm trong rương ở nhà
 *   `equipment`  món nào ĐANG trên người, ở ô nào
 *
 * Tách ra vì hai câu hỏi khác nhau và đổi theo hai nhịp khác nhau: "ngài có
 * bao nhiêu tài sản" đổi khi ngài mua bán và khi đồ hỏng, còn "ngài đang mặc
 * gì" đổi mỗi lần ngài mặc giáp vào. Nhét chung một slice thì mỗi lần rút kiếm
 * ra khỏi bao lại phải viết lại cả kho.
 *
 * QUYỀN GHI theo đúng bảng mục 17: engine giữ mọi con số, và AI được ghi ĐÚNG
 * MỘT chỗ — `rumors`, tin đồn về một món. Đó là ranh giới đẹp nhất của cả Phần
 * 16: AI kể rằng thanh kiếm này bị nguyền, engine vẫn là nơi duy nhất biết nó
 * có bị nguyền thật hay không (R1).
 */

import { z } from 'zod';
import type { GameState, SliceDefinition } from '@/state/slices';
import { readPath } from '@/state/slices';
import { armorPieceOf, itemName, knownItemIds } from './data';
import { buildCoverage, wornFromItems, type WornPiece } from './coverage';
import { ITEM_KINDS, type Item } from './types';
import { valueOf, weightOfItem } from './item';
import { buildLoad } from './weight';

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

export const itemDamageSchema = z.object({
  kind: z.string().max(40),
  regionId: z.string().max(40).default(''),
  turn: z.int().min(0).default(0),
  note: z.string().max(200).default(''),
});

export const heraldrySchema = z.object({
  ownerId: z.string().max(60).default(''),
  device: z.string().max(120).default(''),
  visible: z.boolean().default(true),
});

export const itemSchema = z.object({
  id: z.string().max(80),
  templateId: z.string().max(60),
  /** Tên riêng của một tuyệt tác (mục 7), hoặc tên mẫu. */
  name: z.string().max(120),
  kind: z.enum(ITEM_KINDS),
  material: z.string().max(40).default(''),
  quality: z.int().min(1).max(5).default(2),
  condition: z.number().min(0).max(100).default(100),
  damage: z.array(itemDamageSchema).max(16).default([]),
  /** Id người được ĐO MAY (mục 8). */
  fitTo: z.string().max(60).default(''),
  /**
   * Vóc dáng lúc đo may. Mục 2 chỉ khai `fitTo`, nhưng người được đo thường là
   * một hiệp sĩ đã chết ở tỉnh khác và không có trong state nào — xem chú thích
   * đầu `fit.ts`.
   */
  fitShape: z
    .object({
      race: z.string().max(60).default(''),
      heightCm: z.number().min(0).max(400).default(0),
      weightKg: z.number().min(0).max(600).default(0),
    })
    .optional(),
  weightKg: z.number().min(0).max(2000).default(0),
  value: z.number().min(0).default(0),
  eraFrom: z.number().default(0),
  eraTo: z.number().default(9999),
  enchantment: z.string().max(60).default(''),
  heraldry: heraldrySchema.nullable().default(null),
  /** Ai từng cầm, dùng trong trận nào (mục 2) — engine ghi, không phải AI. */
  history: z.array(z.string().max(200)).max(40).default([]),
  note: z.string().max(300).default(''),
});

export const itemsSchema = z.object({
  owned: z.array(itemSchema).max(400).default([]),
  /** Bộ đếm sinh id vật phẩm mà không phải rút xúc sắc (R3). */
  nextItemNo: z.int().min(1).default(1),
  /**
   * TIN ĐỒN về một món — ô DUY NHẤT của Phần 16 mà AI ghi được (mục 17).
   * Khóa là id vật phẩm; giá trị là những câu người ta kể về nó.
   */
  rumors: z.record(z.string().max(80), z.array(z.string().max(300)).max(12)).default({}),
  /** Bản mẫu xưởng của ngài đã học (mục 11). */
  patterns: z.array(z.string().max(60)).max(60).default([]),
  /** Thợ rèn đi theo quân (mục 10, nối Phần 11). */
  smiths: z.int().min(0).max(500).default(0),
});

export const equipmentSchema = z.object({
  /** Id vật phẩm đang mặc/cầm. Bản đồ che phủ dựng từ đúng danh sách này. */
  worn: z.array(z.string().max(80)).max(40).default([]),
  /**
   * Id vật phẩm thật sự nằm trong túi/hành lý và đi cùng nhân vật.
   *
   * Trước đây mọi món `items.owned` nhưng không mặc đều bị UI gọi là "hành
   * lý". Điều đó làm một bộ giáp nằm trong kho thành trì cũng theo ngài vào
   * rừng và có thể mặc tức thì giữa trận. Danh sách riêng này là ranh giới giữa
   * TÚI ĐỒ và KHO SỞ HỮU.
   */
  packed: z.array(z.string().max(80)).max(120).default([]),
  mainHand: z.string().max(80).default(''),
  offHand: z.string().max(80).default(''),
  /** Có đai và móc treo không — quyết định tải nằm trên vai hay trải đều (mục 9). */
  belted: z.boolean().default(true),
});

export type ItemsState = z.infer<typeof itemsSchema>;
export type EquipmentState = z.infer<typeof equipmentSchema>;

// ---------------------------------------------------------------------------
// Đọc
// ---------------------------------------------------------------------------

export function itemsOf(state: GameState | null | undefined): ItemsState | null {
  if (state === null || state === undefined) return null;
  const raw = readPath(state, 'items');
  if (raw === null || raw === undefined || typeof raw !== 'object') return null;
  return raw as ItemsState;
}

export function equipmentOf(state: GameState | null | undefined): EquipmentState | null {
  if (state === null || state === undefined) return null;
  const raw = readPath(state, 'equipment');
  if (raw === null || raw === undefined || typeof raw !== 'object') return null;
  return raw as EquipmentState;
}

export function ownedItem(state: GameState | null | undefined, itemId: string): Item | null {
  return (itemsOf(state)?.owned.find((item) => item.id === itemId) as Item | undefined) ?? null;
}

/** Món ĐANG TRÊN NGƯỜI, theo đúng thứ tự trong `equipment.worn`. */
export function wornItems(state: GameState | null | undefined): Item[] {
  const items = itemsOf(state);
  const equipment = equipmentOf(state);
  if (items === null || equipment === null) return [];
  const byId = new Map(items.owned.map((item) => [item.id, item as Item] as const));
  return equipment.worn
    .map((id) => byId.get(id))
    .filter((item): item is Item => item !== undefined);
}

/** Món trong túi, theo đúng thứ tự người chơi xếp. */
export function packedItems(state: GameState | null | undefined): Item[] {
  const items = itemsOf(state);
  const equipment = equipmentOf(state);
  if (items === null || equipment === null) return [];
  const byId = new Map(items.owned.map((item) => [item.id, item as Item] as const));
  return (equipment.packed ?? [])
    .map((id) => byId.get(id))
    .filter((item): item is Item => item !== undefined);
}

/** Mọi món đi cùng nhân vật: đang mặc/cầm hoặc nằm trong túi. */
export function carriedItems(state: GameState | null | undefined): Item[] {
  const seen = new Set<string>();
  return [...wornItems(state), ...packedItems(state)].filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function wornPiecesOf(state: GameState): WornPiece[] {
  return wornFromItems(wornItems(state));
}

export function defaultItems(): ItemsState {
  return { owned: [], nextItemNo: 1, rumors: {}, patterns: [], smiths: 0 };
}

export function defaultEquipment(): EquipmentState {
  return { worn: [], packed: [], mainHand: '', offHand: '', belted: true };
}

// ---------------------------------------------------------------------------
// Slice `items`
// ---------------------------------------------------------------------------

export const itemsSlice: SliceDefinition = {
  id: 'items',
  version: 1,
  schema: itemsSchema,
  defaults: () => defaultItems() as unknown as Record<string, unknown>,

  permissions: {
    owned: 'engine',
    'owned.*': 'engine',
    nextItemNo: 'engine',
    patterns: 'engine',
    smiths: 'engine',
    // ĐÚNG MỘT Ô CHO AI (mục 17): tin đồn về một món. AI kể rằng thanh kiếm bị
    // nguyền; `owned.*.enchantment` — nơi biết nó CÓ bị nguyền thật không — vẫn
    // là của engine. Đó là R1 viết thành hai dòng bảng quyền.
    rumors: 'ai',
    'rumors.*': 'ai',
  },

  constraints: [
    {
      id: 'vat-pham-khong-trung-id',
      check(state) {
        const items = itemsOf(state);
        if (items === null) return null;
        const ids = items.owned.map((item) => item.id);
        return new Set(ids).size === ids.length ? null : 'hai vật phẩm trùng id';
      },
    },
    {
      /**
       * Một món trỏ về mẫu không tồn tại là một món không có cân nặng, không có
       * giá và không che được gì — nhưng vẫn nằm trong kho và vẫn hiện lên bảng
       * trang bị. Đây là loại lỗi chỉ lộ ra khi người chơi mặc nó vào trận.
       */
      id: 'vat-pham-phai-co-mau',
      check(state) {
        const items = itemsOf(state);
        if (items === null) return null;
        const known = new Set(knownItemIds());
        for (const item of items.owned) {
          if (!known.has(item.templateId)) {
            return `vật phẩm "${item.id}" trỏ về mẫu "${item.templateId}" không có trong data`;
          }
        }
        return null;
      },
    },
    {
      id: 'tin-don-phai-gan-vao-mot-mon-co-that',
      check(state) {
        const items = itemsOf(state);
        if (items === null) return null;
        const owned = new Set(items.owned.map((item) => item.id));
        for (const id of Object.keys(items.rumors)) {
          if (!owned.has(id)) return `tin đồn gắn vào vật phẩm "${id}" không có trong kho`;
        }
        return null;
      },
    },
  ],

  derived: [
    {
      /** TỔNG GIÁ TRỊ TRANG BỊ (mục 17) — con số Phần 10 đọc khi tính tiền chuộc. */
      id: 'tongGiaTriTrangBi',
      deps: ['items.owned', 'equipment.worn'],
      compute(state) {
        return wornItems(state).reduce((sum, item) => sum + valueOf(item), 0);
      },
    },
    {
      id: 'tongGiaTriKho',
      deps: ['items.owned'],
      compute(state) {
        return (itemsOf(state)?.owned ?? []).reduce((sum, item) => sum + valueOf(item as Item), 0);
      },
    },
  ],
};

// ---------------------------------------------------------------------------
// Slice `equipment`
// ---------------------------------------------------------------------------

export const equipmentSlice: SliceDefinition = {
  id: 'equipment',
  version: 1,
  schema: equipmentSchema,
  defaults: () => defaultEquipment() as unknown as Record<string, unknown>,

  // Mục 17: TOÀN QUYỀN `engine`. AI không được tự mặc giáp cho nhân vật — một
  // câu văn "ngài khoác vội bộ giáp" không được biến thành một bản đồ che phủ.
  permissions: {
    worn: 'engine',
    'worn.*': 'engine',
    packed: 'engine',
    'packed.*': 'engine',
    mainHand: 'engine',
    offHand: 'engine',
    belted: 'engine',
  },

  constraints: [
    {
      id: 'chi-mac-duoc-mon-dang-so-huu',
      check(state) {
        const items = itemsOf(state);
        const equipment = equipmentOf(state);
        if (items === null || equipment === null) return null;
        const owned = new Set(items.owned.map((item) => item.id));
        for (const id of [...equipment.worn, ...(equipment.packed ?? [])]) {
          if (!owned.has(id)) return `đang mặc "${id}" mà kho không có món đó`;
        }
        for (const id of [equipment.mainHand, equipment.offHand]) {
          if (id !== '' && !owned.has(id)) return `đang cầm "${id}" mà kho không có món đó`;
        }
        return null;
      },
    },
    {
      id: 'mot-mon-khong-vua-mac-vua-nam-trong-tui',
      check(state) {
        const equipment = equipmentOf(state);
        if (equipment === null) return null;
        const worn = new Set(equipment.worn);
        const duplicated = (equipment.packed ?? []).find((id) => worn.has(id));
        return duplicated === undefined ? null : `vật phẩm "${duplicated}" vừa mặc vừa nằm trong túi`;
      },
    },
    {
      /**
       * Tấm che mặt không có mũ bascinet thì úp vào không khí. `requires` của
       * `data/armor.json` khai quan hệ ấy; ở đây là chỗ nó được giữ.
       */
      id: 'mon-giap-phu-thuoc-phai-co-mon-nen',
      check(state) {
        const items = itemsOf(state);
        const equipment = equipmentOf(state);
        if (items === null || equipment === null) return null;
        const worn = new Set(
          equipment.worn
            .map((id) => items.owned.find((item) => item.id === id)?.templateId)
            .filter((id): id is string => id !== undefined),
        );
        for (const templateId of worn) {
          const needs = armorPieceOf(templateId)?.requires ?? '';
          if (needs !== '' && !worn.has(needs)) {
            return `${itemName(templateId)} cần ${itemName(needs)} mới đeo được`;
          }
        }
        return null;
      },
    },
  ],

  // BIẾN PHỤ CỦA MỤC 17. Tất cả đều là HÀM của "đang mặc gì" — giữ thêm một bản
  // sao trong state chỉ là chuẩn bị cho ngày hai bên lệch nhau (Phần 2 mục 7).
  derived: [
    {
      /** BẢN ĐỒ CHE PHỦ 20 VÙNG — thứ UI mục 18 vẽ và thứ mục 4 tra. */
      id: 'banDoCheChan',
      deps: ['items.owned', 'equipment.worn'],
      compute(state) {
        const map = buildCoverage(wornPiecesOf(state));
        const out: Record<string, { coverage: number; chem: number; dam: number; dap: number }> = {};
        for (const [regionId, cover] of map.byRegion) {
          out[regionId] = {
            coverage: cover.coverage,
            chem: cover.protection.chem,
            dam: cover.protection.dam,
            dap: cover.protection.dap,
          };
        }
        return out;
      },
    },
    {
      /** DANH SÁCH KHE HỞ ĐANG CÓ (mục 17) — vùng nào chưa kín, hở bao nhiêu. */
      id: 'kheHoDangCo',
      deps: ['items.owned', 'equipment.worn'],
      compute(state) {
        return buildCoverage(wornPiecesOf(state)).gaps.map((cover) => ({
          regionId: cover.regionId,
          coverage: cover.coverage,
          name: cover.gapName,
        }));
      },
    },
    {
      /** TỔNG TRỌNG LƯỢNG (mục 17), tính cả món không phải giáp. */
      id: 'tongTrongLuong',
      deps: ['items.owned', 'equipment.worn', 'equipment.packed', 'equipment.belted'],
      compute(state) {
        const worn = wornItems(state);
        const extra = [
          ...worn.filter((item) => armorPieceOf(item.templateId) === null),
          ...packedItems(state),
        ].reduce((sum, item) => sum + weightOfItem(item), 0);
        return buildLoad(wornFromItems(worn), {
          belted: equipmentOf(state)?.belted ?? true,
          extraKg: extra,
        }).totalKg;
      },
    },
    {
      /** PHẠT MỆT MỎI (mục 17) — điểm thể lực mất thêm mỗi hiệp vì tải và phân bổ. */
      id: 'phatMetMoi',
      deps: ['items.owned', 'equipment.worn', 'equipment.packed', 'equipment.belted'],
      compute(state) {
        const extraKg = packedItems(state).reduce((sum, item) => sum + weightOfItem(item), 0);
        return buildLoad(wornPiecesOf(state), {
          belted: equipmentOf(state)?.belted ?? true,
          extraKg,
        }).fatiguePerRound;
      },
    },
  ],
};
