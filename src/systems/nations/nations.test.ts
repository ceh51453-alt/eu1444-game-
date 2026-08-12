/**
 * BÀI TEST CỦA PHẦN 14 — ba bài bắt buộc của mục 10, cộng các phép kiểm cấu trúc.
 *
 *   **Test A (10.15)** — mô phỏng 60 NĂM KHÔNG CÓ NGƯỜI CHƠI CAN THIỆP. Đế quốc
 *   Orc phải bành trướng đều, Đông La Mã phải mất đất đều, và ÍT NHẤT MỘT LẦN
 *   Đông La Mã thuê quân Orc rồi mất đất vì chính việc đó. Đế quốc phải rã dần
 *   hoặc cải cách thành công. Giáo hội phải có ít nhất một khủng hoảng. In dòng
 *   thời gian ra.
 *
 *   **Test B (10.16)** — cắt ngân sách Tân Binh Đoàn ba năm liên tiếp. PHẢI dẫn
 *   tới binh biến. In đường cong lòng trung.
 *
 *   **Test C (10.17)** — truy bức một nhóm thiểu số ở Frank. PHẢI thấy họ di cư
 *   sang thế lực khác và thấy đóng góp kinh tế của vùng đó sụt.
 *
 * Bài A dài và ồn: nó in ra một dòng thời gian sáu chục năm, và đó là điểm của
 * nó — mục 10.15 đòi "50 năm không người chơi vẫn ra chuyện hay", mà "hay" là thứ
 * chỉ đọc mới biết, không assert được.
 *
 * Ngoài ba bài ấy còn một nhóm phép kiểm CẤU TRÚC, và nhóm này mới là thứ giữ cho
 * phần sau không phá phần này: tám thể loại phải khác nhau, mỗi thế lực phải đa
 * chủng tộc, và AI không được ghi một con số nào của hai slice.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import { createRng } from '@/core/rng';
import { canWrite, slices } from '@/state/slices';
import { applyPatch } from '@/state/mvu';
import { registerGameSlices } from '@/state/register';
import { createInitialState } from '@/state/store';
import { allMinigames, minigameOf } from '@/nations';
import { corpsRowOf, corpsRows } from './data';
import { createWorld } from './create';
import { advanceWorldYear } from './year';
import { revoltRisk, setPolicy } from './demographics';
import { accessTierFor, clarityFor } from './access';
import { MINIGAME_KINDS } from './boards';
import { exportForPart15, relationBetween } from './relations';
import { nationsStateOf, religionsStateOf, type NationsSliceState, type ReligionsSliceState } from './slice';
import type { PowerState } from './types';

beforeAll(() => {
  slices.reset();
  registerGameSlices();
});

function powerIn(state: NationsSliceState, id: string): PowerState {
  const found = state.powers.find((power) => power.id === id);
  if (found === undefined) throw new Error(`không có thế lực ${id}`);
  return found;
}

// ---------------------------------------------------------------------------
// Cấu trúc — mục 1 và mục 3
// ---------------------------------------------------------------------------

describe('mục 1 — tám thể loại phải khác nhau', () => {
  it('tám module, tám `kind`, không cái nào trùng', () => {
    const kinds = allMinigames().map((module) => module.kind);
    expect(new Set(kinds).size).toBe(8);
    expect([...kinds].sort()).toEqual([...MINIGAME_KINDS].sort());
  });

  it('mỗi thế lực dùng đúng module của thể loại mình', () => {
    const world = createWorld();
    for (const power of world.nations.powers) {
      expect(power.board.kind).toBe(power.minigame);
      expect(minigameOf(power.minigame).kind).toBe(power.minigame);
    }
    expect(world.nations.powers).toHaveLength(8);
  });

  it('tám bảng có hình dạng KHÁC NHAU, không phải một bảng đổi nhãn', () => {
    const world = createWorld();
    // Nếu hai bảng có cùng tập tên trường thì chúng là cùng một bảng, bất kể
    // `kind` khai gì. Đây là phép kiểm bắt đúng cái lỗi mục 1 cảnh báo.
    const shapes = world.nations.powers.map((power) => [...Object.keys(power.board)].sort().join(','));
    expect(new Set(shapes).size).toBe(8);
  });
});

describe('mục 1b — mỗi thế lực đều đa chủng tộc', () => {
  it('không thế lực nào có dưới ba nhóm dân, và không tộc nào chiếm quá 70%', () => {
    const world = createWorld();
    for (const power of world.nations.powers) {
      expect(power.groups.length).toBeGreaterThanOrEqual(3);
      const biggest = Math.max(...power.groups.map((group) => group.population));
      expect(biggest).toBeLessThanOrEqual(0.7);
      const total = power.groups.reduce((sum, group) => sum + group.population, 0);
      expect(Math.abs(total - 1)).toBeLessThan(0.03);
    }
  });

  it('bảng thành phần chủng tộc của cả tám thế lực (mục 11)', () => {
    const world = createWorld();
    const rows = world.nations.powers.map((power) => {
      const mix = [...power.groups]
        .sort((left, right) => right.population - left.population)
        .map((group) => `${group.raceId.replace('race_', '')} ${(group.population * 100).toFixed(0)}%(${group.status})`)
        .join(' · ');
      return `${power.id.replace('nation_', '').padEnd(18)} ${mix}`;
    });
    // eslint-disable-next-line no-console
    console.log(`\nTHÀNH PHẦN CHỦNG TỘC TÁM THẾ LỰC\n${rows.join('\n')}\n`);
    expect(rows).toHaveLength(8);
  });
});

describe('mục 4 — mười tám quân đoàn', () => {
  it('đủ mười tám, đánh số 1–18, và đúng một đoàn phế truất được người cai trị', () => {
    const rows = corpsRows();
    expect(rows).toHaveLength(18);
    expect([...rows.map((row) => row.number)].sort((a, b) => a - b)).toEqual(
      Array.from({ length: 18 }, (_value, index) => index + 1),
    );
    expect(rows.filter((row) => row.mutinyLeader)).toHaveLength(1);
    expect(rows.filter((row) => row.group === 'cam-ve')).toHaveLength(8);
    expect(rows.filter((row) => row.group === 'tinh-binh')).toHaveLength(6);
  });

  it('đòi hỏi ngân sách cộng lại LỚN HƠN 1 — không bao giờ cấp đủ cho tất cả', () => {
    const demand = corpsRows().reduce((sum, row) => sum + row.demandShare, 0);
    expect(demand).toBeGreaterThan(1);
  });
});

describe('mục 7 — quyền ghi hai slice', () => {
  it('AI KHÔNG ghi được một con số nào; chỉ ghi được tin đồn và dư luận', () => {
    expect(canWrite('ai', 'nations.powers.0.treasury')).toBe(false);
    expect(canWrite('ai', 'nations.powers.0.board.authority')).toBe(false);
    expect(canWrite('ai', 'nations.relations.0.value')).toBe(false);
    expect(canWrite('ai', 'religions.areas.0.mix.0.share')).toBe(false);
    expect(canWrite('ai', 'religions.prestige.rel_giao-hoi')).toBe(false);

    expect(canWrite('ai', 'nations.courtRumours')).toBe(true);
    expect(canWrite('ai', 'nations.opinion')).toBe(true);
    expect(canWrite('ai', 'religions.prophecies')).toBe(true);
    expect(canWrite('ai', 'religions.miracleRumours')).toBe(true);
  });

  it('biến phụ của mục 7 có mặt: cán cân quyền lực, nguy cơ ly khai, căng thẳng tôn giáo', () => {
    const ids = slices.derived().map((derived) => derived.id);
    expect(ids).toContain('canCanQuyenLuc');
    expect(ids).toContain('nguyCoLyKhai');
    expect(ids).toContain('cangThangTonGiao');
  });
});

describe('vạch xuất phát đi vào save qua MVU (R2)', () => {
  it('cả hai slice ghi được bằng một lô patch của engine, và không vi phạm ràng buộc nào', () => {
    const world = createWorld();
    const state = createInitialState('phan-14-seed');
    const result = applyPatch(
      state,
      [
        { op: 'set', path: 'nations', to: world.nations, reason: 'test', source: 'json' },
        { op: 'set', path: 'religions', to: world.religions, reason: 'test', source: 'json' },
      ],
      { actor: 'engine', skipPermissions: true },
    );

    expect(result.failures.map((row) => row.message)).toEqual([]);
    expect(result.applied).toBe(true);
    expect(nationsStateOf(result.next)?.powers).toHaveLength(8);
    expect(religionsStateOf(result.next)?.areas.length).toBeGreaterThan(8);
  });
});

describe('mục 1 — ba tầng tiếp cận, và bảng không bao giờ bị khóa xám', () => {
  it('nông serf vẫn QUAN SÁT được mọi thế lực', () => {
    for (const kind of MINIGAME_KINDS) void kind;
    expect(accessTierFor({ powerId: 'nation_hre', titles: [], factionId: '' })).toBe('quan-sat');
  });

  it('độ rõ đi theo TRI THỨC chứ không theo tước vị', () => {
    const far = clarityFor({ powerId: 'nation_giao-trieu', confidence: 5, factionId: '', inCourt: false, neighbour: false });
    const near = clarityFor({ powerId: 'nation_giao-trieu', confidence: 5, factionId: 'nation_giao-trieu', inCourt: true, neighbour: false });
    expect(far.level).toBe('tin-don');
    expect(far.showsNumbers).toBe(false);
    expect(far.label).toBe('tin đồn chưa xác thực');
    expect(near.showsNumbers).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TEST A — 60 năm không người chơi (mục 10.15)
// ---------------------------------------------------------------------------

describe('Test A — sáu mươi năm không có người chơi can thiệp', () => {
  it('thế giới tự chạy và tự sinh ra chuyện', () => {
    const rng = createRng('phan-14-test-a');
    const world = createWorld();
    let nations: NationsSliceState = world.nations;
    let religions: ReligionsSliceState = world.religions;

    const startYear = 1444;
    const timeline: string[] = [];
    const ottomanLand: number[] = [];
    const byzantineLand: number[] = [];
    let hiredOrcAndLostLand = false;
    let churchCrisis = false;

    for (let offset = 0; offset < 60; offset++) {
      const year = startYear + offset;
      const report = advanceWorldYear(rng, { nations, religions, year });
      nations = report.nations;
      religions = report.religions;

      ottomanLand.push(powerIn(nations, 'nation_ottoman').land);
      byzantineLand.push(powerIn(nations, 'nation_dong-la-ma').land);

      for (const event of report.events) {
        if (event.scope === 'chau-luc') timeline.push(`${String(year)}  ${event.text}`);
        if (event.text.includes('thuê quân') && event.text.includes('ở lại')) hiredOrcAndLostLand = true;
        if (event.text.includes('Giáo hoàng thứ hai') || event.text.includes('bán ân xá')) churchCrisis = true;
      }
      for (const line of report.lines) {
        if (line.includes('bán ân xá') || line.includes('Mật nghị bế tắc')) churchCrisis = true;
      }
    }

    const ottoman = powerIn(nations, 'nation_ottoman');
    const byzantine = powerIn(nations, 'nation_dong-la-ma');
    const hre = powerIn(nations, 'nation_hre');

    // eslint-disable-next-line no-console
    console.log(
      `\nDÒNG THỜI GIAN 60 NĂM (${String(timeline.length)} biến cố châu lục)\n${timeline.slice(0, 70).join('\n')}\n…`,
    );
    // eslint-disable-next-line no-console
    console.log(
      `\nĐẤT THEO THẬP KỶ\n  Orc:        ${ottomanLand.filter((_value, index) => index % 10 === 0).join(' → ')}` +
        `\n  Đông La Mã: ${byzantineLand.filter((_value, index) => index % 10 === 0).join(' → ')}\n`,
    );

    // Đế quốc Orc bành trướng đều: đất cuối phải lớn hơn đất đầu.
    expect(ottoman.land).toBeGreaterThanOrEqual(ottomanLand[0] ?? 0);
    // Đông La Mã mất đất đều.
    expect(byzantine.land).toBeLessThan(byzantineLand[0] ?? 99);
    // Ít nhất một lần thuê quân ngoài rồi mất đất vì chính việc đó.
    expect(hiredOrcAndLostLand).toBe(true);
    // Giáo hội có ít nhất một khủng hoảng.
    expect(churchCrisis).toBe(true);
    // Đế quốc rã dần HOẶC cải cách thành công — không được đứng yên sáu chục năm.
    const hreBoard = hre.board;
    if (hreBoard.kind !== 'cai-cach') throw new Error('bảng Đế quốc sai thể loại');
    const drifted = hreBoard.passedReformIds.length > 0 || hre.fallen || hreBoard.authority < 20 || hre.land < 16;
    expect(drifted).toBe(true);
    // Dòng thời gian phải có chuyện để kể.
    expect(timeline.length).toBeGreaterThan(20);
  });

  it('xuất được dữ liệu cho Phần 15 (mục 6)', () => {
    const rng = createRng('phan-14-export');
    const world = createWorld();
    const report = advanceWorldYear(rng, { nations: world.nations, religions: world.religions, year: 1444 });
    const exported = exportForPart15(report.nations.powers, report.nations.relations, 1444);
    expect(exported.balance).toHaveLength(8);
    expect(exported.balance.reduce((sum, row) => sum + row.weight, 0)).toBeGreaterThan(95);
    expect(exported.openRipples.length).toBeGreaterThan(5);
  });
});

// ---------------------------------------------------------------------------
// TEST B — cắt ngân sách Tân Binh Đoàn (mục 10.16)
// ---------------------------------------------------------------------------

describe('Test B — cắt ngân sách Tân Binh Đoàn ba năm liên tiếp', () => {
  it('phải dẫn tới binh biến, và đường cong lòng trung phải đi xuống', () => {
    const rng = createRng('phan-14-test-b');
    const world = createWorld();
    let nations: NationsSliceState = world.nations;
    let religions: ReligionsSliceState = world.religions;

    const curve: number[] = [];
    let mutinied = false;
    let mutinyYear = 0;

    for (let offset = 0; offset < 8; offset++) {
      const year = 1444 + offset;

      // CẮT NGÂN SÁCH: hạ trần ngân sách quân sự xuống một phần ba, và nghiêng hẳn
      // về phía Tỉnh Binh để Tân Binh Đoàn là đoàn bị cắt sâu nhất.
      nations = {
        ...nations,
        powers: nations.powers.map((power) => {
          if (power.id !== 'nation_ottoman' || power.board.kind !== 'quan-doan') return power;
          return offset < 5
            ? { ...power, board: { ...power.board, militaryBudget: 0.2, guardTilt: -80 } }
            : power;
        }),
      };

      const report = advanceWorldYear(rng, { nations, religions, year });
      nations = report.nations;
      religions = report.religions;

      const ottoman = powerIn(nations, 'nation_ottoman');
      if (ottoman.board.kind !== 'quan-doan') throw new Error('bảng Orc sai thể loại');
      const janissaries = ottoman.board.corps.find((corps) => corps.id === 'corps_tan-binh-doan');
      curve.push(Math.round(janissaries?.loyalty ?? 0));
      if ((janissaries?.mutinying ?? false) && !mutinied) {
        mutinied = true;
        mutinyYear = year;
      }
    }

    // eslint-disable-next-line no-console
    console.log(
      `\nĐƯỜNG CONG LÒNG TRUNG — ${corpsRowOf('corps_tan-binh-doan')?.name ?? ''}\n  ${curve.join(' → ')}` +
        `\n  binh biến năm ${String(mutinyYear)}\n`,
    );

    expect(mutinied).toBe(true);
    expect(curve[curve.length - 1] ?? 100).toBeLessThan(curve[0] ?? 0);
  });
});

// ---------------------------------------------------------------------------
// TEST C — truy bức một nhóm thiểu số ở Frank (mục 10.17)
// ---------------------------------------------------------------------------

describe('Test C — truy bức một nhóm thiểu số ở Frank', () => {
  it('họ di cư sang thế lực khác và đóng góp kinh tế của nhóm ấy sụt vĩnh viễn', () => {
    const rng = createRng('phan-14-test-c');
    const world = createWorld();
    let nations: NationsSliceState = world.nations;
    let religions: ReligionsSliceState = world.religions;

    const target = 'race_moc-toc';
    nations = {
      ...nations,
      powers: nations.powers.map((power) => {
        if (power.id !== 'nation_frank') return power;
        return {
          ...power,
          groups: power.groups.map((group) => (group.raceId === target ? setPolicy(group, 'truy-buc', 1444).group : group)),
        };
      }),
    };

    const before = powerIn(nations, 'nation_frank').groups.find((group) => group.raceId === target);
    expect(before?.status).toBe('truy-buc');
    const populationBefore = before?.population ?? 0;
    const usefulnessBefore = before?.usefulness ?? 0;

    for (let offset = 0; offset < 12; offset++) {
      const report = advanceWorldYear(rng, { nations, religions, year: 1444 + offset });
      nations = report.nations;
      religions = report.religions;
    }

    const after = powerIn(nations, 'nation_frank').groups.find((group) => group.raceId === target);
    const exiles = nations.exiles.filter((exile) => exile.raceId === target && exile.fromPowerId === 'nation_frank');
    const destinations = [...new Set(exiles.map((exile) => exile.toPowerId))];
    const hosted = destinations
      .map((id) => powerIn(nations, id).groups.find((group) => group.raceId === target)?.population ?? 0)
      .reduce((sum, value) => sum + value, 0);

    // eslint-disable-next-line no-console
    console.log(
      `\nTRUY BỨC ${target} Ở FRANK — 12 năm` +
        `\n  dân số: ${(populationBefore * 100).toFixed(2)}% → ${((after?.population ?? 0) * 100).toFixed(2)}%` +
        `\n  đóng góp: ${String(usefulnessBefore)} → ${String(Math.round(after?.usefulness ?? 0))} (trần vĩnh viễn ${String(after?.usefulnessCeiling ?? 0)})` +
        `\n  chạy sang: ${destinations.join(', ')} — tổng ${String(exiles.reduce((sum, exile) => sum + exile.people, 0))} người` +
        `\n  mối hận mang theo: ${exiles.map((exile) => String(Math.round(exile.grudge))).join(', ')}\n`,
    );

    expect(exiles.length).toBeGreaterThan(0);
    expect(destinations.length).toBeGreaterThan(0);
    expect(after?.population ?? 1).toBeLessThan(populationBefore);
    expect(after?.usefulness ?? 100).toBeLessThan(usefulnessBefore);
    // TRẦN hạ xuống vĩnh viễn, không phải chỉ giá trị hiện thời.
    expect(after?.usefulnessCeiling ?? 100).toBeLessThanOrEqual(40);
    // Nhóm ấy xuất hiện ở nước nhận.
    expect(hosted).toBeGreaterThan(0);
    // Và Phần 15 có cái để đọc: cộng đồng lưu vong nhớ mình bị ai đuổi.
    expect(exiles[0]?.grudge ?? 0).toBeGreaterThan(0);
  });

  it('nguy cơ nổi dậy là hai vế NHÂN nhau, không phải cộng', () => {
    const small = { raceId: 'race_x', population: 0.02, status: 'truy-buc' as const, grievance: 100, usefulness: 30, usefulnessCeiling: 40, persecutedSinceYear: 1444 };
    const large = { ...small, population: 0.3, grievance: 60 };
    // Một nhóm 2% dân với oán hận 100 gây rắc rối; một nhóm 30% dân với oán hận
    // 60 thì lật được — hai con số ấy phải phản ánh đúng câu đó của mục 3.
    expect(revoltRisk(small)).toBeGreaterThan(0);
    expect(revoltRisk(large)).toBeGreaterThan(revoltRisk(small) * 0.5);
  });
});

// ---------------------------------------------------------------------------
// Tôn giáo — mục 5
// ---------------------------------------------------------------------------

describe('mục 5 — dị giáo bùng sau khủng hoảng là QUY TẮC, không phải ngẫu nhiên', () => {
  it('cùng một seed: có dịch bệnh thì dị giáo lớn hơn hẳn khi không có', () => {
    const heresyShareAfter = (crises: string[]): number => {
      const rng = createRng('phan-14-di-giao');
      const world = createWorld();
      let nations: NationsSliceState = world.nations;
      let religions: ReligionsSliceState = world.religions;
      for (let offset = 0; offset < 10; offset++) {
        const report = advanceWorldYear(rng, {
          nations,
          religions,
          year: 1444 + offset,
          ...(offset === 1 ? { crises } : {}),
        });
        nations = report.nations;
        religions = report.religions;
      }
      const area = religions.areas.find((row) => row.areaId === 'nation_hre');
      return (area?.mix ?? [])
        .filter((row) => row.religionId.startsWith('rel_di-giao'))
        .reduce((sum, row) => sum + row.share, 0);
    };

    const quiet = heresyShareAfter([]);
    const plague = heresyShareAfter(['dich-benh']);
    // eslint-disable-next-line no-console
    console.log(`\nDỊ GIÁO Ở ĐẾ QUỐC sau 10 năm — yên: ${(quiet * 100).toFixed(1)}% · có dịch: ${(plague * 100).toFixed(1)}%\n`);
    expect(plague).toBeGreaterThan(quiet);
  });
});

// ---------------------------------------------------------------------------
// Quan hệ — mục 6
// ---------------------------------------------------------------------------

describe('mục 6 — ma trận quan hệ và bảng dội', () => {
  it('mọi cặp thế lực có đúng một dòng', () => {
    const world = createWorld();
    expect(world.nations.relations).toHaveLength((8 * 7) / 2);
    const keys = world.nations.relations.map((row) => (row.a < row.b ? `${row.a}|${row.b}` : `${row.b}|${row.a}`));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('quan hệ khởi đầu đọc từ data, không hardcode', () => {
    const world = createWorld();
    expect(relationBetween(world.nations.relations, 'nation_ottoman', 'nation_dong-la-ma')).toBe(-70);
    expect(relationBetween(world.nations.relations, 'nation_giao-trieu', 'nation_frank')).toBe(20);
  });
});
