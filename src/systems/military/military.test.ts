import { describe, expect, it } from 'vitest';
import { addMonths } from '@/core/clock';
import { advanceMilitaryMonth, recruitUnit, summaryOf } from './recruitment';
import { ensureLogisticsNetwork, setForceSupplyPolicy, setSupplyRoute } from './logistics';
import { militarySliceSchema } from './slice';
import { parseRecruitmentRequests, stripRecruitmentRequests } from './tags';
import type { MilitaryResources } from './types';

const DATE = { year: 1444, month: 11, day: 30, hour: 6 } as const;
const RESOURCES: MilitaryResources = {
  population: 8_000,
  manpowerCapacity: 1_200,
  logisticsCapacity: 2_000,
  barracks: 1,
  barracksCapacity: 400,
};

function fresh() {
  return militarySliceSchema.parse({});
}

describe('quân lực và tuyển quân theo tháng', () => {
  it('tuyển dân binh trừ tiền, giữ nhân lực và chỉ nhập quân sau một tháng', () => {
    const started = recruitUnit(fresh(), 100, RESOURCES, {
      typeId: 'unit_bo-binh-lang',
      source: 'levy',
      companies: 2,
      requestedBy: 'player',
      date: DATE,
    });

    expect(started.ok).toBe(true);
    expect(started.treasury).toBeLessThan(100);
    expect(started.military.recruitment[0]?.strength).toBe(240);
    expect(summaryOf(started.military).totalTroops).toBe(0);

    const month = advanceMilitaryMonth(started.military, started.treasury);
    expect(month.military.recruitment).toHaveLength(0);
    expect(summaryOf(month.military).totalTroops).toBe(240);
    expect(month.lines.some((line) => line.includes('huấn luyện xong'))).toBe(true);
  });

  it('quân chính quy bị chặn nếu không có doanh trại', () => {
    const result = recruitUnit(fresh(), 1_000, { ...RESOURCES, barracks: 0, barracksCapacity: 0 }, {
      typeId: 'unit_hiep-si-giap-tam',
      source: 'barracks',
      companies: 1,
      requestedBy: 'player',
      date: DATE,
    });

    expect(result.ok).toBe(false);
    expect(result.line).toContain('doanh trại');
    expect(result.military.recruitment).toHaveLength(0);
  });

  it('lính đánh thuê bỏ đi và mất sĩ khí khi không có quân phí', () => {
    const started = recruitUnit(fresh(), 100, RESOURCES, {
      typeId: 'unit_bo-binh-thue',
      source: 'mercenary',
      companies: 1,
      requestedBy: 'player',
      date: DATE,
    });
    const arrived = advanceMilitaryMonth(started.military, started.treasury).military;
    const before = summaryOf(arrived).totalTroops;
    const unpaid = advanceMilitaryMonth(arrived, 0);
    expect(summaryOf(unpaid.military).totalTroops).toBeLessThan(before);
    expect(unpaid.lines.join(' ')).toContain('Thiếu quân phí');
  });

  it('thuê chiến thuyền sẽ lập một hạm đội thật', () => {
    const started = recruitUnit(fresh(), 500, RESOURCES, {
      typeId: 'naval_thuyen-chien',
      source: 'mercenary',
      companies: 1,
      requestedBy: 'player',
      date: DATE,
    });
    const arrived = advanceMilitaryMonth(started.military, started.treasury).military;
    expect(started.ok).toBe(true);
    expect(arrived.forces[0]?.kind).toBe('navy');
    expect(summaryOf(arrived).fleets).toBe(1);
    expect(summaryOf(arrived).navyPersonnel).toBe(80);
  });

  it('đọc lệnh tuyển trong diễn biến và giấu thẻ khỏi đoạn kể', () => {
    const raw = 'Ngài đóng ấn. <RequestRecruitment binh-chung="unit_cung-thu" so-doi="2" dao-quan="army_1" />';
    expect(parseRecruitmentRequests(raw)).toEqual([
      { typeId: 'unit_cung-thu', companies: 2, destinationId: 'army_1' },
    ]);
    expect(stripRecruitmentRequests(raw)).toBe('Ngài đóng ấn.');
  });

  it('cộng tháng kẹp ngày cuối tháng đúng lịch Julius', () => {
    expect(addMonths(DATE, 3)).toMatchObject({ year: 1445, month: 2, day: 28 });
    expect(addMonths({ ...DATE, year: 1443 }, 3)).toMatchObject({ year: 1444, month: 2, day: 29 });
  });

  it('dựng kho, tuyến vận tải, dự trữ dã chiến và sổ chi hậu cần thật', () => {
    const started = recruitUnit(fresh(), 300, RESOURCES, {
      typeId: 'unit_bo-binh-lang',
      source: 'levy',
      companies: 2,
      requestedBy: 'player',
      date: DATE,
    });
    const month = advanceMilitaryMonth(started.military, started.treasury, { resources: RESOURCES, date: DATE });
    const logistics = month.military.logistics;

    expect(logistics.depots).toHaveLength(1);
    expect(logistics.routes).toHaveLength(1);
    expect(logistics.forces).toHaveLength(1);
    expect(logistics.depots[0]?.stocks).toHaveLength(6);
    expect(logistics.monthlyDelivered).toBeGreaterThan(0);
    expect(month.logisticsPaid).toBeGreaterThan(0);
    expect(logistics.forces[0]?.supplyLevel).toBeGreaterThan(80);
  });

  it('mùa đông làm giảm năng lực tuyến so với mùa hè', () => {
    const started = recruitUnit(fresh(), 500, RESOURCES, {
      typeId: 'unit_bo-binh-lang',
      source: 'levy',
      companies: 2,
      requestedBy: 'player',
      date: DATE,
    });
    const arrived = advanceMilitaryMonth(started.military, started.treasury, { resources: RESOURCES, date: DATE }).military;
    const summer = advanceMilitaryMonth(structuredClone(arrived), 500, {
      resources: RESOURCES,
      date: { ...DATE, month: 6 },
    });
    const winter = advanceMilitaryMonth(structuredClone(arrived), 500, {
      resources: RESOURCES,
      date: { ...DATE, month: 1 },
    });

    expect(winter.military.logistics.forces[0]?.transportCapacity).toBeLessThan(
      summer.military.logistics.forces[0]?.transportCapacity ?? 0,
    );
  });

  it('tuyến bị cắt gây thiếu quân nhu, hao quân và giảm sĩ khí', () => {
    const started = recruitUnit(fresh(), 500, RESOURCES, {
      typeId: 'unit_bo-binh-lang',
      source: 'levy',
      companies: 2,
      requestedBy: 'player',
      date: DATE,
    });
    const arrived = advanceMilitaryMonth(started.military, started.treasury, { resources: RESOURCES, date: DATE }).military;
    const cut = structuredClone(arrived);
    cut.logistics.routes = cut.logistics.routes.map((route) => ({ ...route, active: false, blockaded: true }));
    cut.logistics.forces = cut.logistics.forces.map((status) => ({
      ...status,
      carried: status.carried.map((stock) => ({ ...stock, amount: 0 })),
    }));
    const before = summaryOf(cut);
    const result = advanceMilitaryMonth(cut, 500, { resources: RESOURCES, date: DATE, campaignIntensity: 1 });
    const after = summaryOf(result.military);

    expect(result.military.logistics.forces[0]?.condition).toBe('bi-cat');
    expect(after.totalTroops).toBeLessThan(before.totalTroops);
    expect(after.morale).toBeLessThan(before.morale);
    expect(result.lines.join(' ')).toContain('bị cắt tiếp tế');
  });

  it('thiếu tiếp tế làm hàng tuyển dừng huấn luyện', () => {
    const started = recruitUnit(fresh(), 300, RESOURCES, {
      typeId: 'unit_bo-binh-lang',
      source: 'levy',
      companies: 1,
      requestedBy: 'player',
      date: DATE,
    });
    const cut = ensureLogisticsNetwork(started.military, RESOURCES);
    cut.logistics.routes = cut.logistics.routes.map((route) => ({ ...route, active: false }));
    const month = advanceMilitaryMonth(cut, started.treasury, { resources: RESOURCES, date: DATE });

    expect(month.military.recruitment[0]?.monthsLeft).toBe(1);
    expect(month.lines.join(' ')).toContain('tạm ngừng huấn luyện');
  });

  it('đổi được khẩu phần và mức ưu tiên của từng đạo quân', () => {
    const started = recruitUnit(fresh(), 300, RESOURCES, {
      typeId: 'unit_bo-binh-lang',
      source: 'levy',
      companies: 1,
      requestedBy: 'player',
      date: DATE,
    });
    const network = ensureLogisticsNetwork(started.military, RESOURCES);
    const forceId = network.logistics.forces[0]?.forceId ?? '';
    const changed = setForceSupplyPolicy(network, forceId, 'day-du', 5);
    const route = changed.logistics.routes[0];
    const rerouted = route === undefined
      ? changed
      : setSupplyRoute(changed, route.id, changed.logistics.depots[0]?.id ?? '', 'duong-song', false);

    expect(changed.logistics.forces[0]).toMatchObject({ ration: 'day-du', priority: 5 });
    expect(rerouted.logistics.routes[0]).toMatchObject({ mode: 'duong-song', active: false });
  });
});
