/**
 * LUẬT ĐỌC CỦA MÀN TRANG BỊ (Phần 16 mục 18).
 *
 * Test ở đây không dựng cây React — nó gác đúng những phép suy mà người chơi
 * NHÌN THẤY và sẽ tin: vùng nào tô màu gì, vùng nào nhấp nháy, kho đủ mấy bộ.
 * Một lỗi ở đây không làm hỏng phép tính nào, nhưng nó nói dối người chơi về
 * chỗ họ đang hở — mà cả mục 18 tồn tại để họ nhìn là biết chỗ ấy.
 */

import { describe, expect, it } from 'vitest';
import { carry, type CarriedGear } from '@/systems/character/gear';
import { buildCoverage, newItem, weightOfItem, wornFromCarried } from '@/systems/items';
import type { GameState } from '@/state/slices';
import { armouryReport, FIT_FOR_ISSUE } from './armoury';
import { blinks, coverageColor, equipmentView, regionViews, COVERAGE_COLORS } from './view';

function gearOf(ids: readonly string[]): CarriedGear[] {
  return ids.map((id) => carry(id)).filter((entry): entry is CarriedGear => entry !== null);
}

function viewsFor(ids: readonly string[]) {
  return regionViews(buildCoverage(wornFromCarried(gearOf(ids))));
}

describe('màu và nhấp nháy theo che phủ', () => {
  it('bốn bậc, và chỉ vùng hở THẬT mới nháy', () => {
    expect(coverageColor(100)).toBe(COVERAGE_COLORS.kin);
    expect(coverageColor(90)).toBe(COVERAGE_COLORS.gan_kin);
    expect(coverageColor(40)).toBe(COVERAGE_COLORS.ho);
    expect(coverageColor(0)).toBe(COVERAGE_COLORS.tran);

    // Giáp tấm nào cũng hở vài phần trăm ở khớp. Cho tất cả cùng nháy thì cái
    // nháy không còn nghĩa gì, nên ngưỡng nằm ở 85.
    expect(blinks(95)).toBe(false);
    expect(blinks(85)).toBe(false);
    expect(blinks(84)).toBe(true);
    expect(blinks(0)).toBe(true);
  });
});

describe('dòng mô tả từng vùng', () => {
  it('KHE HỞ CÓ TÊN chỉ dành cho bộ giáp thật sự chừa chỗ đó ra', () => {
    const plate = viewsFor(['item_ao-lot-giap', 'item_giap-tam']);
    const armpit = plate.find((region) => region.regionId === 'shoulderL');
    expect(armpit?.gapName).toBe('nách trái');
    expect(armpit?.coverage).toBe(95);

    // Người cởi trần: cả người là chỗ hở, và gọi vùng mặt của họ là "khe mắt"
    // là nói một câu vô nghĩa.
    const naked = viewsFor([]);
    const face = naked.find((region) => region.regionId === 'face');
    expect(face?.coverage).toBe(0);
    expect(face?.gapName).toBe('');
  });

  it('tooltip nói đủ ba trục, không gộp một số', () => {
    const chest = viewsFor(['item_ao-lot-giap', 'item_giap-tam']).find((region) => region.regionId === 'chest');
    expect(chest?.tooltip).toContain('chém');
    expect(chest?.tooltip).toContain('đâm');
    expect(chest?.tooltip).toContain('đập');
    expect(chest?.pieces.length).toBeGreaterThan(1);
  });
});

describe('kho vũ khí của thành trì', () => {
  it('đếm BỘ theo món hiếm nhất, không theo tổng số món', () => {
    const stock = [
      ...Array.from({ length: 20 }, (_, index) => newItem('item_giap-luoi', { id: `a${String(index)}` })),
      ...Array.from({ length: 20 }, (_, index) => newItem('item_giao', { id: `w${String(index)}` })),
      ...Array.from({ length: 3 }, (_, index) => newItem('item_mu-sat', { id: `h${String(index)}` })),
    ];
    const report = armouryReport(stock);

    // Hai mươi thân, hai mươi vũ khí, ba mũ → ba bộ đủ, hai mươi người ra trận
    // được nhưng mười bảy người không có gì trên đầu.
    expect(report.sets).toBe(3);
    expect(report.soldiers).toBe(20);
    expect(report.rows.length).toBe(3);
  });

  it('món dưới ngưỡng phát cho lính thì không tính, và bị xếp vào danh sách chờ thợ rèn', () => {
    const stock = [
      newItem('item_giap-luoi', { id: 'ok', condition: 100 }),
      newItem('item_giap-luoi', { id: 'nat', condition: FIT_FOR_ISSUE - 10 }),
      newItem('item_giao', { id: 'w1' }),
      newItem('item_mu-sat', { id: 'h1' }),
    ];
    const report = armouryReport(stock);

    expect(report.sets).toBe(1);
    expect(report.needsWork.map((item) => item.id)).toEqual(['nat']);
  });
});

describe('túi đồ tách khỏi kho sở hữu', () => {
  it('chỉ món trong packed mới đi theo nhân vật và cân vào tổng tải', () => {
    const wornItem = newItem('item_ao-lot-giap', { id: 'dang-mac' });
    const bagItem = newItem('item_giap-luoi', { id: 'trong-tui' });
    const storedItem = newItem('item_giap-tam', { id: 'trong-kho' });
    const state = {
      items: {
        owned: [wornItem, bagItem, storedItem],
        nextItemNo: 4,
        rumors: {},
        patterns: [],
        smiths: 0,
      },
      equipment: {
        worn: [wornItem.id],
        packed: [bagItem.id],
        mainHand: '',
        offHand: '',
        belted: true,
      },
    } as unknown as GameState;

    const view = equipmentView(state);
    expect(view.packList.map((entry) => entry.item.id)).toEqual([bagItem.id]);
    expect(view.stashList.map((entry) => entry.item.id)).toEqual([storedItem.id]);
    expect(view.load.totalKg).toBeCloseTo(weightOfItem(wornItem) + weightOfItem(bagItem), 2);
  });
});
