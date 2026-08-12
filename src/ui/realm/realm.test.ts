/**
 * CỬA MỞ MÀN HÌNH LÃNH THỔ.
 *
 * Bài test này gác đúng một câu của mục 11: **tước nào chưa đạt thì bảng đó KHÔNG
 * TỒN TẠI, không phải hiện ra rồi khóa.** Ở tầng cửa vào, "không tồn tại" nghĩa
 * là `openRealm` trả về `null` và màn hình không mở — chứ không phải mở ra một
 * bảng rỗng có nút bị làm mờ.
 *
 * Và một câu nữa của mục 2: chư hầu chỉ có từ bậc BÁ TƯỚC. Một nam tước mở màn
 * hình này sẽ thấy thái ấp của mình, không thấy một danh sách chư hầu trống.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import { registerGameSlices } from '@/state/register';
import { slices } from '@/state/slices';
import { createInitialState } from '@/state/store';
import { rankOf } from '@/systems/titles';
import { openRealm } from './realm';

beforeAll(() => {
  slices.reset();
  registerGameSlices();
});

function stateWithFief(titleId: string, name: string): ReturnType<typeof createInitialState> {
  const base = createInitialState('mo-lanh-tho');
  const character = base['character'] as Record<string, unknown>;
  return {
    ...base,
    character: {
      ...character,
      fiefs: [{ id: 'fief_khai-bao', name, title: titleId, liege: 'Công tước Áo', obligations: [], note: '' }],
    },
  };
}

describe('Phần 13 mục 11 — cửa mở bảng cai trị', () => {
  it('thường dân KHÔNG mở được bảng nào — bảng ấy không tồn tại', () => {
    expect(openRealm(createInitialState('thuong-dan'))).toBeNull();
  });

  it('nam tước có thái ấp nhưng KHÔNG có tỉnh và KHÔNG có chư hầu (mục 2)', () => {
    const opened = openRealm(stateWithFief('nam-tuoc', 'Thái ấp Nam tước Bạch Dương'));
    expect(opened).not.toBeNull();
    expect(opened?.titles).toHaveLength(1);
    expect(rankOf(opened?.titles[0]?.titleId ?? '')).toBe(2);
    expect(opened?.realm.provinces).toHaveLength(0);
    expect(opened?.vassals.list).toHaveLength(0);
  });

  it('bá tước mở ra một QUẬN thật: có tỉnh, có chư hầu, có thuế suất', () => {
    const opened = openRealm(stateWithFief('ba-tuoc', 'Thái ấp Bá tước Swabia'));
    expect(opened).not.toBeNull();
    expect(opened?.realm.provinces.length).toBeGreaterThan(0);
    expect(opened?.vassals.list.length).toBeGreaterThan(0);
    expect(Object.keys(opened?.realm.taxRates ?? {}).length).toBeGreaterThan(0);
    // Tên lãnh thổ LUÔN kèm loại từ, và tỉnh thì mang tiền tố `prov_` (Phụ lục A
    // mục 9b, 9c).
    expect(opened?.realm.name).not.toBe('');
    expect(opened?.realm.provinces.every((province) => province.id.startsWith('prov_'))).toBe(true);
    // Số tỉnh không vượt trần của bậc: một bá tước cai MỘT quận, không phải bốn.
    expect(opened?.realm.provinces).toHaveLength(1);
  });
});
