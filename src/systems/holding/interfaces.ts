/**
 * BA GIAO DIỆN — CỬA DUY NHẤT GIỮA THÀNH TRÌ VÀ LÃNH THỔ (Phần 12 mục 1).
 *
 * ```
 * holding → realm    : nộp thuế, nộp quân dịch, đóng góp sản lượng
 * realm → holding    : cấp phép xây, bảo hộ, trưng dụng, đặt luật
 * holding ↔ holding  : buôn bán, tiếp tế
 * ```
 *
 * File này tồn tại để câu "hai slice KHÔNG đọc thẳng vào nhau" trở thành một
 * thứ CƯỠNG CHẾ ĐƯỢC chứ không phải một lời hứa. Mọi thứ đi qua ranh giới đều
 * phải là một trong ba kiểu dưới đây, và cả ba đều là **dữ liệu thuần**: không
 * kiểu nào cầm một `Holding`, không kiểu nào cầm một id lãnh thổ có nghĩa với
 * `holdings`. Chúng là những tờ giấy đi qua cổng thành, không phải hai bộ não
 * chung nhau một trí nhớ.
 *
 * BA LUẬT KHÔNG ĐƯỢC PHÁ:
 *
 *  1. **Không con số nào tồn tại ở cả hai chỗ.** Dân số là của thành trì. Tổng
 *     dân vùng là BIẾN PHỤ cộng từ các thành trì, và Phần 13 phải tự cộng lấy
 *     qua `contribution()` chứ không được giữ một bản sao.
 *  2. **Thành trì NỘP NGHĨA VỤ, không bị "thu thuế".** Thuế là thứ lãnh thổ thu
 *     từ DÂN (Phụ lục A mục 4, cụm sai số 2). Nên kiểu ở đây tên là `Tribute`
 *     và trường của nó là `obligationDays`, `tribute`, `produce` — không có chữ
 *     "thuế" nào, và đó là cố ý.
 *  3. **Không hàm nào ở đây được nhận cả state thành trì lẫn state lãnh thổ.**
 *     Nếu một ngày có hàm như thế, mục 1 nói thẳng: dừng lại, hai tầng đã lẫn.
 */

import type { HoldingId } from '@/core/ids';
import { garrisonOf, serviceDays } from './garrison';
import { foodEaten, labourOf, produce, type LabourPool } from './labour';
import type { GameDate } from '@/core/clock';
import type { Holding } from './types';
import type { Workshop } from '@/systems/items';

// ---------------------------------------------------------------------------
// 1. holding → realm
// ---------------------------------------------------------------------------

/**
 * Thành trì NỘP gì lên trong một năm.
 *
 * Đây là tờ giấy Phần 13 nhận được. Nó KHÔNG chứa dân số, không chứa danh sách
 * công trình, không chứa lưới ô — lãnh thổ không cần biết những thứ đó, và nếu
 * nó biết thì sớm muộn sẽ có một hàm cấp lãnh thổ tính toán dựa trên một cái
 * cối xay.
 */
export interface Tribute {
  holdingId: HoldingId;
  /** Số ngày quân dịch nợ mỗi năm — Phần 11 dùng đúng con số này khi đi vây. */
  obligationDays: number;
  /** Phần cống nộp, tính bằng đồng. KHÔNG phải "thuế". */
  tribute: number;
  /** Sản lượng đóng góp, tính bằng giạ. */
  produce: number;
  /** Số quân thành trì gọi được — lãnh thổ cần con số này để biết mình có gì. */
  levyAvailable: number;
  /** Nợ mấy năm rồi. Nợ lâu là cớ để lãnh chúa cấp trên ra tay. */
  arrearsYears: number;
  /** Đã nộp đủ năm nay chưa. */
  paid: boolean;
}

export function contribution(holding: Holding, titleId = 'thuong-dan'): Tribute {
  return {
    holdingId: holding.id,
    obligationDays: serviceDays(holding),
    tribute: holding.obligations.tributePerYear,
    produce: holding.obligations.produceQuotaPerYear,
    levyAvailable: garrisonOf(holding, titleId).capacity,
    arrearsYears: holding.obligations.arrearsYears,
    paid: holding.obligations.paidThisYear,
  };
}

/** Nộp nghĩa vụ. Trả về thành trì đã trừ kho — hoặc lý do không nộp nổi. */
export function payObligations(holding: Holding): { holding: Holding; paid: boolean; short: string } {
  const money = Math.max(0, holding.stores['tien'] ?? 0);
  const food = Math.max(0, holding.stores['luong-thuc'] ?? 0);
  const owed = holding.obligations;

  if (money < owed.tributePerYear || food < owed.produceQuotaPerYear) {
    return {
      holding: {
        ...holding,
        obligations: { ...owed, paidThisYear: false, arrearsYears: owed.arrearsYears + 1 },
      },
      paid: false,
      short: money < owed.tributePerYear ? 'thiếu tiền cống' : 'thiếu lương đóng góp',
    };
  }

  return {
    paid: true,
    short: '',
    holding: {
      ...holding,
      stores: {
        ...holding.stores,
        tien: money - owed.tributePerYear,
        'luong-thuc': food - owed.produceQuotaPerYear,
      },
      obligations: { ...owed, paidThisYear: true, arrearsYears: 0 },
    },
  };
}

// ---------------------------------------------------------------------------
// 2. realm → holding
// ---------------------------------------------------------------------------

/**
 * Lệnh từ lãnh thổ xuống thành trì.
 *
 * Bốn động từ của mục 1, và không có động từ thứ năm. Thêm một loại lệnh là
 * thêm một đường để tầng vĩ mô thò tay vào tầng vi mô, nên tập này ĐÓNG.
 */
export type RealmOrderKind = 'cap-phep' | 'bao-ho' | 'trung-dung' | 'dat-luat';

export interface RealmOrder {
  kind: RealmOrderKind;
  /** `cap-phep`: id cấp khu định cư hoặc id công trình được phép xây. */
  permit?: string;
  /** `bao-ho`: số quân lãnh chúa gửi tới đồn trú giúp. */
  troops?: number;
  /** `trung-dung`: lấy đi bao nhiêu, theo tài nguyên. */
  seize?: Record<string, number>;
  /**
   * `dat-luat`: luật thuộc LÃNH THỔ, nên thành trì chỉ nhận HỆ QUẢ của nó dưới
   * dạng vài con số — không nhận bản thân điều luật. Đây là chỗ ranh giới dễ vỡ
   * nhất, vì để nguyên văn điều luật xuống đây là mở đường cho cả bộ luật của
   * Phần 13 sống trong `holdings`.
   */
  law?: { moraleShift?: number; outputShift?: number; label: string };
}

export function applyRealmOrder(holding: Holding, order: RealmOrder): { holding: Holding; line: string } {
  switch (order.kind) {
    case 'cap-phep': {
      const permit = order.permit ?? '';
      if (permit === '') return { holding, line: 'Giấy phép không nói cho phép cái gì.' };
      const isTier = !permit.startsWith('bld_');
      const permits = isTier
        ? { ...holding.permits, granted: [...new Set([...holding.permits.granted, permit])] }
        : { ...holding.permits, grantedWorks: [...new Set([...holding.permits.grantedWorks, permit])] };
      return { holding: { ...holding, permits }, line: `Lãnh chúa cấp phép: ${permit}.` };
    }
    case 'bao-ho': {
      const troops = Math.max(0, Math.round(order.troops ?? 0));
      return {
        holding: {
          ...holding,
          ownership: { ...holding.ownership, legitimacy: Math.min(92, holding.ownership.legitimacy + 3) },
        },
        line: `Lãnh chúa gửi ${String(troops)} quân tới bảo hộ.`,
      };
    }
    case 'trung-dung': {
      const stores = { ...holding.stores };
      const taken: string[] = [];
      for (const [id, amount] of Object.entries(order.seize ?? {})) {
        const have = Math.max(0, stores[id] ?? 0);
        const got = Math.min(have, amount);
        stores[id] = have - got;
        if (got > 0) taken.push(`${String(Math.round(got))} ${id}`);
      }
      return {
        holding: { ...holding, stores },
        line: taken.length === 0 ? 'Không còn gì để trưng dụng.' : `Bị trưng dụng: ${taken.join(', ')}.`,
      };
    }
    case 'dat-luat': {
      const shift = order.law?.moraleShift ?? 0;
      const strata = holding.population.strata.map((group) => ({
        ...group,
        morale: Math.max(0, Math.min(100, group.morale + shift)),
      }));
      return {
        holding: { ...holding, population: { ...holding.population, strata } },
        line: `Luật mới có hiệu lực ở đây: ${order.law?.label ?? 'không rõ'}.`,
      };
    }
  }
}

// ---------------------------------------------------------------------------
// 3. holding ↔ holding
// ---------------------------------------------------------------------------

/** Một chuyến hàng giữa hai thành trì. Buôn bán và tiếp tế đi chung một cửa. */
export interface Shipment {
  from: HoldingId;
  to: HoldingId;
  goods: Record<string, number>;
  /** Số tuần đường đi. Tiếp tế tới muộn là tiếp tế vô ích. */
  weeks: number;
  /** Trả bằng tiền, 0 nghĩa là tiếp tế cho không. */
  price: number;
}

export interface ShipmentResult {
  from: Holding;
  to: Holding;
  sent: Record<string, number>;
  reason: string;
}

/**
 * Gửi hàng từ thành trì này sang thành trì kia.
 *
 * Nhận HAI `Holding` chứ không nhận state — đây là giao diện `holding ↔ holding`,
 * cả hai đầu đều ở cùng một tầng, nên không có ranh giới nào bị phá. Đường đi và
 * cướp đường thuộc về lãnh thổ (Phần 13) và sẽ được bơm vào qua `weeks`.
 */
export function ship(from: Holding, to: Holding, shipment: Shipment): ShipmentResult {
  if (from.id === to.id) return { from, to, sent: {}, reason: 'không gửi hàng cho chính mình' };
  if (from.besieged) return { from, to, sent: {}, reason: `${from.name} đang bị vây, không đoàn xe nào ra được` };

  const fromStores = { ...from.stores };
  const toStores = { ...to.stores };
  const sent: Record<string, number> = {};

  for (const [id, amount] of Object.entries(shipment.goods)) {
    const have = Math.max(0, fromStores[id] ?? 0);
    const moved = Math.min(have, Math.max(0, amount));
    if (moved <= 0) continue;
    fromStores[id] = have - moved;
    // Hao dọc đường: đi càng lâu, hỏng càng nhiều. Đây là lý do tiếp tế cho một
    // thành đang bị vây từ xa là một canh bạc, không phải một nút bấm.
    const arrived = moved * Math.max(0.5, 1 - 0.04 * shipment.weeks);
    toStores[id] = (toStores[id] ?? 0) + arrived;
    sent[id] = arrived;
  }

  if (shipment.price > 0) {
    const payable = Math.min(shipment.price, Math.max(0, toStores['tien'] ?? 0));
    toStores['tien'] = (toStores['tien'] ?? 0) - payable;
    fromStores['tien'] = (fromStores['tien'] ?? 0) + payable;
  }

  return {
    from: { ...from, stores: fromStores },
    to: { ...to, stores: toStores },
    sent,
    reason: '',
  };
}

/** Thành trì này còn dư gì để bán hoặc tiếp tế — cửa vào của giao diện thứ ba. */
export function surplusOf(holding: Holding, date: GameDate, pool?: LabourPool): Record<string, number> {
  const labour = pool ?? labourOf(holding, date);
  const production = produce(holding, { borrowed: 0, pool: labour, besieged: holding.besieged });
  const foodSurplus = production.food - foodEaten(holding);

  const surplus: Record<string, number> = {};
  if (foodSurplus > 0) surplus['luong-thuc'] = foodSurplus;
  for (const [id, amount] of Object.entries(production.resources)) {
    if (amount > 0) surplus[id] = amount;
  }
  return surplus;
}

// ---------------------------------------------------------------------------
// 4. holding → items (Phần 16 mục 11)
// ---------------------------------------------------------------------------

/**
 * Thành trì này là một cái XƯỞNG như thế nào.
 *
 * Chế tạo của Phần 16 cần ba thứ từ Phần 12, và chỉ ba thứ: có những công trình
 * nào, lò rèn tốt tới đâu, và xưởng đã học được bản mẫu nào. Nó KHÔNG cần biết
 * lưới ô, dân số hay kho hàng — nên đây là một tờ giấy đi qua cổng, đúng nghĩa
 * ba giao diện ở đầu file.
 *
 * `forgeLevel` lấy từ `quality` × `integrity` của chính cái lò: một lò rèn xây
 * ẩu và bỏ bê thì làm ra đồ ẩu, và đó là chỗ mục 7 của Phần 16 nói "chất lượng
 * lò rèn trong thành trì" mà không nói đó là con số nào. Con số là con số này.
 */
export function workshopOf(holding: Holding, patterns: readonly string[] = []): Workshop {
  const usable = holding.buildings.filter((placed) => placed.integrity >= 40);
  const forge = usable
    .filter((placed) => CRAFT_BUILDINGS.has(placed.buildingId))
    .reduce((best, placed) => Math.max(best, placed.quality * (placed.integrity / 100)), 0);

  return {
    forgeLevel: Math.round(forge * 10) / 10,
    buildings: usable.map((placed) => placed.buildingId),
    patterns: [...patterns],
  };
}

/**
 * Công trình LÀM RA ĐƯỢC trang bị. Danh sách hẹp có chủ ý: một cái cối xay tử tế
 * không giúp gì cho việc gò một tấm giáp, và cho nó cộng vào `forgeLevel` là
 * biến "xây thật nhiều công trình" thành đường tắt tới đồ tuyệt tác.
 */
const CRAFT_BUILDINGS = new Set(['bld_lo-ren', 'bld_xuong-cung-no', 'bld_xuong-duc', 'bld_xuong-nghe', 'bld_xuong-lon']);
