/**
 * BÀI TEST CỦA PHẦN 13.
 *
 * Hai bài bắt buộc của mục 12:
 *
 *   **Test A (12.11)** — một Bá tước có 4 chư hầu, tăng thuế lên tối đa trong 5
 *   năm. PHẢI dẫn tới nổi loạn, và in đường cong lòng trung ra.
 *
 *   **Test B (12.12)** — KIỂM TRA RANH GIỚI: quét toàn bộ mã, liệt kê mọi chỗ
 *   `realm` chạm vào `holdings`, và mọi chỗ đều phải đi qua giao diện đã khai ở
 *   `holding/interfaces.ts`.
 *
 * Bài B không đo cân bằng, nó đo KIẾN TRÚC — và nó chạy bằng cách đọc chính mã
 * nguồn, vì một ranh giới chỉ được giữ bằng lời hứa thì sẽ vỡ ở phần sau.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { createRng } from '@/core/rng';
import { canWrite, slices } from '@/state/slices';
import { registerGameSlices } from '@/state/register';
import { createInitialState } from '@/state/store';
import { resetModifierSources, runCheck } from '@/systems/check';
import { registerCheckSources } from '@/systems/check/sources';
import { applyRealmOrder } from '@/systems/holding';
import { createHolding } from '@/systems/holding';
import {
  TITLE_INFLUENCE_SOURCE,
  canTake,
  grantTitle,
  heirLine,
  panelFor,
  rankOf,
  registerTitleSources,
  succeed,
  successionLawFor,
  titlesOfLadder,
  usurp,
  vassalCapFor,
  type HeldTitle,
  type Kin,
} from '@/systems/titles';
import {
  advanceRealmYear,
  callHost,
  createRealm,
  createVassal,
  developmentConfig,
  grantPermit,
  households,
  levyEstimate,
  issueLaw,
  judge,
  lawOrder,
  maxRates,
  openCase,
  rebellionRisk,
  siegeServiceDays,
  verdictOptions,
  type RealmSliceState,
  type Vassal,
  type VassalsSliceState,
} from './index';

const SOURCE_DIR = join(import.meta.dirname);

beforeAll(() => {
  slices.reset();
  registerGameSlices();
  resetModifierSources();
  registerCheckSources();
  registerTitleSources();
});

// ---------------------------------------------------------------------------
// Một bá quốc giả lập
// ---------------------------------------------------------------------------

const PROVINCES = ['prov_swabia', 'prov_bayern', 'prov_franken', 'prov_baden'];

function aCounty(): { realm: RealmSliceState; vassals: VassalsSliceState; titles: HeldTitle[] } {
  const title = grantTitle({
    titleId: 'ba-tuoc',
    fiefName: 'Thái ấp Bá tước Swabia',
    path: 'duoc-phong',
    year: 1444,
    liege: 'Công tước Áo',
  });

  const realm = createRealm({
    slug: 'swabia',
    name: 'Bá quốc Swabia',
    fromRealmId: 'realm_hre',
    provinceIds: PROVINCES,
    fiefId: title.fiefId,
    treasury: 800,
  });

  // Bốn nam tước, mỗi người một tỉnh. Đủ mạnh để phản được — mục 7 nói nổi loạn
  // phải là mối đe dọa THƯỜNG TRỰC, nên bốn chư hầu bù nhìn thì không kiểm được gì.
  const names = ['Reinhard', 'Otto', 'Hilda', 'Gerhard'];
  const vassals: Vassal[] = names.map((name, index) =>
    createVassal({
      slug: name.toLowerCase(),
      name: `Nam tước ${name}`,
      titleId: 'nam-tuoc',
      provinceIds: [realm.provinces[index]?.id ?? ''],
      holdingCount: 2,
      levyMen: 300,
      ambition: 40 + index * 5,
      personality: 'thực dụng',
    }),
  );

  return { realm, titles: [title], vassals: { list: vassals, factions: [], rumours: [] } };
}

// ---------------------------------------------------------------------------
// Mục 2, 3, 4 — thang tước vị và bảng trạng thái
// ---------------------------------------------------------------------------

describe('Phần 13 mục 2–4 — mỗi cấp mở ra một trò chơi KHÁC', () => {
  it('mỗi bậc của thang Tây Âu mở một bảng riêng, không phải cùng một bảng số to hơn', () => {
    const panels = titlesOfLadder('tay-au')
      .filter((title) => title.rank > 0)
      .map((title) => panelFor(title.id)?.id ?? '');
    expect(panels.every((id) => id !== '')).toBe(true);
    // Chín bậc có tước, và không hai bậc liền nhau nào dùng chung một bảng.
    for (let index = 1; index < panels.length; index++) {
      expect(panels[index]).not.toBe(panels[index - 1]);
    }
  });

  it('BÁ TƯỚC là ngưỡng đầu tiên có chư hầu thật (mục 2)', () => {
    expect(vassalCapFor(rankOf('tu-tuoc'))).toBe(0);
    expect(vassalCapFor(rankOf('ba-tuoc'))).toBeGreaterThan(0);
  });

  it('bảng hầu tước là bảng quận CỘNG biên phòng, không phải một bảng chép lại', () => {
    const county = panelFor('ba-tuoc');
    const march = panelFor('hau-tuoc');
    const countySections = (county?.sections ?? []).map((row) => row.id);
    const marchSections = (march?.sections ?? []).map((row) => row.id);
    for (const id of countySections) expect(marchSections).toContain(id);
    expect(marchSections).toContain('bien-phong');
  });

  it('thang không thế tập thì không ai thừa kế được (mục 3)', () => {
    const ctx = { nationId: 'nation_ottoman', blood: 0, age: 30, held: [] };
    expect(canTake('orc-si-quan', 'thua-ke', ctx).ok).toBe(false);
    expect(canTake('orc-si-quan', 'nang-luc' as never, ctx).ok).toBe(true);
  });

  it('Tuyển hầu CHỈ tồn tại trong Đế quốc (mục 2)', () => {
    const base = { blood: 100, age: 40, held: [] };
    expect(canTake('tuyen-hau', 'duoc-phong', { ...base, nationId: 'nation_frank' }).ok).toBe(false);
    expect(canTake('tuyen-hau', 'duoc-phong', { ...base, nationId: 'nation_hre' }).ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Mục 5 — chính danh
// ---------------------------------------------------------------------------

describe('Phần 13 mục 5 — chính danh là chỉ số trung tâm', () => {
  it('ba con đường cho ba vạch xuất phát rất khác nhau', () => {
    const granted = grantTitle({ titleId: 'ba-tuoc', fiefName: 'Thái ấp A', path: 'duoc-phong', year: 1444 });
    const inherited = grantTitle({ titleId: 'ba-tuoc', fiefName: 'Thái ấp B', path: 'thua-ke', year: 1444 });
    const seized = usurp({ titleId: 'ba-tuoc', fiefName: 'Thái ấp C', year: 1444 });

    expect(granted.legitimacy).toBeGreaterThan(inherited.legitimacy);
    expect(inherited.legitimacy).toBeGreaterThan(seized.title.legitimacy);
    expect(seized.title.churchRecognised).toBe(false);
    expect(seized.vassalPenalty).toBeLessThan(0);
  });

  it('chính danh đi vào kiểm định cai trị QUA REGISTRY, và có dòng giải thích', () => {
    const seized = usurp({ titleId: 'ba-tuoc', fiefName: 'Thái ấp Đoạt', year: 1444 });
    const state = { ...createInitialState('chinh-danh'), titles: { held: [seized.title], viewing: '', successionLawId: 'truong-nam', designatedHeir: '', legitimacyLog: [] } };

    const run = runCheck(createRng('chinh-danh'), {
      id: 'check.thu-thue',
      system: '3d6',
      domain: 'rule.thu-thue',
      difficulty: 'thuong',
      base: 12,
      state,
    });

    const line = run.result.modifiers.find((row) => row.source === 'titles.chinh-danh');
    expect(line).toBeDefined();
    expect(line?.value).toBeLessThan(0);
    expect(line?.label).toContain('Chính danh');
  });

  it('KHÔNG áp vào đánh nhau — một bá tước tiếm quyền vẫn cầm kiếm giỏi như cũ', () => {
    const seized = usurp({ titleId: 'ba-tuoc', fiefName: 'Thái ấp Đoạt Hai', year: 1444 });
    const state = { ...createInitialState('kiem'), titles: { held: [seized.title], viewing: '', successionLawId: 'truong-nam', designatedHeir: '', legitimacyLog: [] } };

    const run = runCheck(createRng('kiem'), {
      id: 'check.kiem-thuat',
      system: 'd100',
      domain: 'skill.kiem-thuat',
      difficulty: 'thuong',
      base: 50,
      state,
    });

    expect(run.result.modifiers.some((row) => row.source === 'titles.chinh-danh')).toBe(false);
    expect(run.result.modifiers.some((row) => row.source === TITLE_INFLUENCE_SOURCE)).toBe(false);
  });

  it('tước tạo thẩm quyền đúng miền — quyền định thuế không phải một khoản cộng trang trí', () => {
    const title = grantTitle({ titleId: 'ba-tuoc', fiefName: 'Thái ấp Thuế', path: 'duoc-phong', year: 1444 });
    const state = { ...createInitialState('tham-quyen'), titles: { held: [title], viewing: '', successionLawId: 'truong-nam', designatedHeir: '', legitimacyLog: [] } };

    const tax = runCheck(createRng('tham-quyen'), {
      id: 'check.thu-thue',
      system: '3d6',
      domain: 'rule.thu-thue',
      difficulty: 'thuong',
      base: 10,
      state,
    }).result.modifiers.filter((row) => row.source === TITLE_INFLUENCE_SOURCE);

    expect(tax.some((row) => row.label.includes('Quyền định thuế suất') && row.value > 0)).toBe(true);
    expect(tax.some((row) => row.label.includes('Quyền tài phán'))).toBe(false);
  });

  it('người tranh tước, Giáo hội chưa công nhận và nợ nghĩa vụ đều để lại dòng phạt riêng', () => {
    const seized = usurp({
      titleId: 'ba-tuoc',
      fiefName: 'Thái ấp Tranh Chấp',
      year: 1444,
      rivalClaimant: 'Bá tước Otto',
    }).title;
    seized.obligations.arrearsYears = 2;
    const state = { ...createInitialState('suc-ep'), titles: { held: [seized], viewing: '', successionLawId: 'truong-nam', designatedHeir: '', legitimacyLog: [] } };

    const lines = runCheck(createRng('suc-ep'), {
      id: 'check.giu-chu-hau',
      system: '3d6',
      domain: 'rule.giu-chu-hau',
      difficulty: 'thuong',
      base: 10,
      state,
    }).result.modifiers.filter((row) => row.source === TITLE_INFLUENCE_SOURCE);

    expect(lines.some((row) => row.label.includes('Giáo hội') && row.value < 0)).toBe(true);
    expect(lines.some((row) => row.label.includes('tranh cùng tước') && row.value < 0)).toBe(true);
    expect(lines.some((row) => row.label.includes('Nợ nghĩa vụ') && row.value < 0)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Mục 8 — xử án, giấy phép, và hai cửa sang phần khác
// ---------------------------------------------------------------------------

describe('Phần 13 mục 8 — cai trị', () => {
  it('quyết đấu tư pháp chỉ mở khi CẢ HAI bên không phục, và luật cấm thì đóng', () => {
    const base = openCase({
      caseTypeId: 'vu_tranh-chap-ranh-gioi',
      provinceId: 'prov_swabia',
      plaintiff: 'npc_otto',
      plaintiffName: 'Nam tước Otto',
      defendant: 'npc_hilda',
      defendantName: 'Nam tước Hilda',
      year: 1444,
    });

    const oneRefuses = verdictOptions(base, []).map((row) => row.id);
    expect(oneRefuses).not.toContain('quyet-dau-tu-phap');

    const bothRefuse = { ...base, bothRefuse: true };
    expect(verdictOptions(bothRefuse, []).map((row) => row.id)).toContain('quyet-dau-tu-phap');
    expect(verdictOptions(bothRefuse, ['luat_cam-quyet-dau']).map((row) => row.id)).not.toContain('quyet-dau-tu-phap');
  });

  it('xử công bằng tăng chính danh, xử thiên vị thì không', () => {
    const courtCase = openCase({
      caseTypeId: 'vu_trom-cap',
      provinceId: 'prov_swabia',
      plaintiff: 'dan',
      plaintiffName: 'dân làng',
      defendant: 'dan',
      defendantName: 'một kẻ trộm',
      year: 1444,
    });

    const fair = judge(createRng('xu-an-cong-bang'), courtCase, 'xu-cong-bang', { base: 16 });
    const bribed = judge(createRng('xu-an-nhan-tien'), courtCase, 'nhan-tien', { base: 16 });

    expect(fair.legitimacy).toBeGreaterThan(0);
    expect(bribed.legitimacy).toBeLessThan(0);
    expect(bribed.revenue).toBeGreaterThan(0);
  });

  it('CẤP GIẤY PHÉP XÂY nối thẳng vào Phần 12: tờ lệnh đi xuống mở khoá đúng công trình', () => {
    const holding = createHolding(createRng('cap-phep'), {
      slug: 'thu-nghiem',
      name: 'Làng Thử Nghiệm',
      path: 'phat-trien',
      turn: 0,
      seat: true,
    });

    const permit = grantPermit(createRng('cap-phep'), {
      applicantId: 'npc_otto',
      applicantName: 'Nam tước Otto',
      permit: 'bld_coi-xay',
      tier: 2,
    });

    expect(permit.order).not.toBeNull();
    expect(permit.order?.kind).toBe('cap-phep');

    const applied = applyRealmOrder(holding, permit.order!);
    expect(applied.holding.permits.grantedWorks).toContain('bld_coi-xay');
  });

  it('một điều luật đi xuống thành trì chỉ mang HAI CON SỐ, không mang nguyên văn', () => {
    const order = lawOrder('luat_doc-quyen-coi-xay');
    expect(order.kind).toBe('dat-luat');
    expect(Object.keys(order.law ?? {}).sort()).toEqual(['label', 'moraleShift', 'outputShift']);
  });
});

// ---------------------------------------------------------------------------
// Mục 9 — thừa kế
// ---------------------------------------------------------------------------

describe('Phần 13 mục 9 — cái chết không phải màn hình game over', () => {
  const family: Record<string, Kin> = {
    con1: { name: 'Adelheid', relation: 'con', sex: 'nu', age: 19, alive: true },
    con2: { name: 'Konrad', relation: 'con', sex: 'nam', age: 14, alive: true },
    con3: { name: 'Wilhelm', relation: 'con', sex: 'nam', age: 21, alive: true },
    em: { name: 'Gisela', relation: 'em', sex: 'nu', age: 30, alive: true },
    chet: { name: 'Ludwig', relation: 'con', sex: 'nam', age: 25, alive: false },
  };

  it('trưởng nam xếp con trai lớn nhất lên đầu, và người chết không đứng trong hàng', () => {
    const line = heirLine(family, successionLawFor('tay-au'));
    expect(line[0]?.name).toBe('Wilhelm');
    expect(line.some((heir) => heir.name === 'Ludwig')).toBe(false);
    // Con gái VẪN trong hàng, chỉ đứng sau — bỏ hẳn ra thì khủng hoảng kế vị xảy
    // ra thường xuyên hơn thực tế rất nhiều.
    expect(line.some((heir) => heir.name === 'Adelheid')).toBe(true);
  });

  it('theo dòng mẹ thì thứ tự đảo lại', () => {
    const line = heirLine(family, successionLawFor('cao-tien', 'theo-dong-me'));
    expect(line[0]?.name).toBe('Adelheid');
  });

  it('kế thừa ĐẤT và TƯỚC, KHÔNG kế thừa kỹ năng và quan hệ', () => {
    const title = grantTitle({ titleId: 'ba-tuoc', fiefName: 'Thái ấp Kế Vị', path: 'duoc-phong', year: 1444 });
    const outcome = succeed([title], family, successionLawFor('tay-au'), 1470);

    expect(outcome.held).toHaveLength(1);
    expect(outcome.heir?.name).toBe('Wilhelm');
    expect(outcome.inherits).toContain('fiefs');
    expect(outcome.inherits).not.toContain('skills');
    expect(outcome.inherits).not.toContain('relations');
    expect(outcome.resets).toContain('skills');
    // Cả một cuộc kế vị SẠCH cũng mất chính danh và mất lòng trung: chư hầu thề
    // với NGƯỜI, không thề với cái ghế.
    expect(outcome.held[0]!.legitimacy).toBeLessThan(title.legitimacy);
    expect(outcome.vassalLoyaltyDelta).toBeLessThan(0);
  });

  it('luật chia đều làm một đế quốc rã dần', () => {
    const a = grantTitle({ titleId: 'ba-tuoc', fiefName: 'Thái ấp Một', path: 'duoc-phong', year: 1444 });
    const b = grantTitle({ titleId: 'nam-tuoc', fiefName: 'Thái ấp Hai', path: 'thua-ke', year: 1444 });
    const outcome = succeed([a, b], family, successionLawFor('tay-au', 'chia-deu'), 1470);
    expect(outcome.held).toHaveLength(1);
    expect(outcome.split).toHaveLength(1);
  });

  it('không còn ai trong hàng là KHỦNG HOẢNG, không phải im lặng', () => {
    const title = grantTitle({ titleId: 'ba-tuoc', fiefName: 'Thái ấp Tuyệt Tự', path: 'duoc-phong', year: 1444 });
    const outcome = succeed([title], {}, successionLawFor('tay-au'), 1470);
    expect(outcome.crisis).toBe(true);
    expect(outcome.heir).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Mục 10 — quyền ghi
// ---------------------------------------------------------------------------

describe('Phần 13 mục 10 — quyền ghi', () => {
  it('AI không ghi được vào bất kỳ con số nào của lãnh thổ', () => {
    expect(canWrite('ai', 'realm.treasury')).toBe(false);
    expect(canWrite('ai', 'realm.taxRates.nong')).toBe(false);
    expect(canWrite('ai', 'realm.provinces.0.unrest')).toBe(false);
    expect(canWrite('ai', 'vassals.list.0.loyalty')).toBe(false);
    expect(canWrite('ai', 'vassals.list.0.power')).toBe(false);
    expect(canWrite('ai', 'titles.held.0.legitimacy')).toBe(false);
  });

  it('AI ghi được đúng những chỗ mục 10 cho phép, và cả MẢNG lẫn phần tử', () => {
    expect(canWrite('ai', 'realm.rumours')).toBe(true);
    expect(canWrite('ai', 'realm.rumours.0.text')).toBe(true);
    expect(canWrite('ai', 'realm.opinion')).toBe(true);
    expect(canWrite('ai', 'vassals.list.0.grievances')).toBe(true);
    expect(canWrite('ai', 'vassals.list.0.ambition')).toBe(true);
    expect(canWrite('ai', 'vassals.rumours')).toBe(true);
  });

  it('tên lãnh thổ và tên chư hầu khoá cứng (Phụ lục A mục 9a)', () => {
    expect(canWrite('engine', 'realm.name')).toBe(false);
    expect(canWrite('engine', 'vassals.list.0.name')).toBe(false);
    expect(canWrite('engine', 'titles.held.0.fiefName')).toBe(false);
  });

  it('ba ràng buộc chéo bắt được ba lỗi lẫn tầng', () => {
    const { realm } = aCounty();
    const slice = slices.get('realm');

    const twoProvinces = { ...createInitialState('rang-buoc'), realm: { ...realm, provinces: [realm.provinces[0], realm.provinces[0]] } };
    expect(slice?.constraints?.find((row) => row.id === 'realm.mot-tinh-mot-chu')?.check(twoProvinces)).toContain('hai lần');

    const shared = {
      ...createInitialState('rang-buoc'),
      realm: {
        ...realm,
        provinces: [
          { ...realm.provinces[0], holdingIds: ['hold_ehrenfeld'] },
          { ...realm.provinces[1], holdingIds: ['hold_ehrenfeld'] },
        ],
      },
    };
    expect(slice?.constraints?.find((row) => row.id === 'realm.mot-thanh-tri-mot-tinh')?.check(shared)).toContain('hold_ehrenfeld');
  });
});

// ---------------------------------------------------------------------------
// TEST A — mục 12.11
// ---------------------------------------------------------------------------

describe('Phần 13 mục 12.11 — TEST A: tăng thuế 5 năm PHẢI dẫn tới nổi loạn', () => {
  it('in đường cong lòng trung, và có ít nhất một chư hầu phản', () => {
    const rng = createRng('test-a-tang-thue');
    const start = aCounty();

    let realm: RealmSliceState = { ...start.realm, taxRates: maxRates() };
    let vassals = start.vassals;
    let titles = start.titles;

    const curve: { year: number; loyalty: number[]; risk: number[]; rebels: string[]; treasury: number; legitimacy: number }[] = [];
    const allRebels: string[] = [];

    for (let offset = 0; offset < 5; offset++) {
      const year = 1445 + offset;
      const report = advanceRealmYear(rng, { realm, vassals, titles, year, ruleSkill: 11 });

      realm = report.realm;
      vassals = report.vassals;
      titles = report.titles;
      allRebels.push(...report.rebelled);

      curve.push({
        year,
        loyalty: vassals.list.map((vassal) => Math.round(vassal.loyalty)),
        risk: vassals.list.map((vassal) => rebellionRisk(vassal, titles[0]?.legitimacy ?? 50).risk),
        rebels: report.rebelled,
        treasury: Math.round(realm.treasury),
        legitimacy: Math.round(titles[0]?.legitimacy ?? 0),
      });
    }

    const names = start.vassals.list.map((vassal) => vassal.name.replace('Nam tước ', ''));
    const lines: string[] = [];
    lines.push('');
    lines.push('┌─ TEST A — BÁ TƯỚC VẶN THUẾ KỊCH TRẦN NĂM NĂM ────────────────────');
    lines.push(`│ Bá quốc Swabia · 4 tỉnh · 4 chư hầu · thuế: ${Object.entries(maxRates()).map(([id, rate]) => `${id} ${String(rate)}%`).join(', ')}`);
    lines.push('│');
    lines.push(`│ ĐƯỜNG CONG LÒNG TRUNG      ${names.map((name) => name.padStart(9)).join('')}`);
    for (const row of curve) {
      lines.push(`│   ${String(row.year)}  lòng trung        ${row.loyalty.map((value) => String(value).padStart(9)).join('')}`);
      lines.push(`│         nguy cơ nổi loạn ${row.risk.map((value) => `${String(value)}%`.padStart(9)).join('')}`);
      if (row.rebels.length > 0) lines.push(`│         → NỔI LOẠN: ${row.rebels.join(', ')}`);
    }
    lines.push('│');
    lines.push('│ KHO VÀ CHÍNH DANH');
    for (const row of curve) {
      lines.push(`│   ${String(row.year)}  kho ${String(row.treasury).padStart(6)} đồng · chính danh ${String(row.legitimacy).padStart(3)}`);
    }
    lines.push('│');
    lines.push(`│ KẾT: ${allRebels.length === 0 ? 'không ai phản' : `${String(allRebels.length)} cuộc nổi loạn — ${allRebels.join(', ')}`}`);
    lines.push('└──────────────────────────────────────────────────────────────────');
    // eslint-disable-next-line no-console
    console.log(lines.join('\n'));

    // Ngưỡng nghiệm thu của chính mục 12.11.
    expect(allRebels.length).toBeGreaterThan(0);
    // Và lòng trung phải ĐI XUỐNG ĐỀU chứ không tụt một cục rồi đứng yên: mối đe
    // dọa phải là THƯỜNG TRỰC (mục 7).
    expect(curve[0]!.loyalty[0]!).toBeLessThan(start.vassals.list[0]!.loyalty);
    expect(curve[2]!.loyalty[0]!).toBeLessThan(curve[0]!.loyalty[0]!);
  }, 30_000);

  it('giữ nguyên thuế thường lệ thì KHÔNG ai phản — nổi loạn là hệ quả, không phải nền', () => {
    const rng = createRng('test-a-thue-thuong');
    const start = aCounty();

    let realm = start.realm;
    let vassals = start.vassals;
    let titles = start.titles;

    for (let offset = 0; offset < 5; offset++) {
      const report = advanceRealmYear(rng, { realm, vassals, titles, year: 1445 + offset, ruleSkill: 11 });
      realm = report.realm;
      vassals = report.vassals;
      titles = report.titles;
      expect(report.rebelled).toEqual([]);
    }

    expect(vassals.list.every((vassal) => vassal.loyalty > 40)).toBe(true);
  }, 30_000);

  it('luật gọi quân mở rộng cộng thẳng vào SỐ NGÀY QUÂN DỊCH mà Phần 11 đọc (mục 12.5)', () => {
    const start = aCounty();
    const issued = issueLaw([], 'luat_quan-dich-mo-rong');
    expect(issued.laws).toContain('luat_quan-dich-mo-rong');

    const plain = callHost({ titles: start.titles, vassals: start.vassals.list });
    const extended = callHost({ titles: start.titles, vassals: start.vassals.list, laws: issued.laws });

    // Con số này đi THẲNG vào `SiegeSetup.attacker.serviceDays` của Phần 11, và
    // ở đó nó là thứ quyết định một cuộc vây 14 tuần có nằm trong hạn hay không.
    expect(extended.days).toBe(plain.days + 20);
    expect(siegeServiceDays({ titles: start.titles, vassals: start.vassals.list, laws: issued.laws })).toBe(extended.days);
  });

  it('đạo quân ở lại đúng bằng HẠN NGẮN NHẤT, và chư hầu đang phản không tới', () => {
    const start = aCounty();
    const vassals = start.vassals.list.map((vassal, index) =>
      index === 0
        ? { ...vassal, obligations: { ...vassal.obligations, levyDays: 20 } }
        : index === 1
          ? { ...vassal, rebelling: true }
          : vassal,
    );

    const host = callHost({ titles: start.titles, vassals });
    expect(host.days).toBe(20);
    expect(host.weakest).toContain('Reinhard');
    expect(host.contingents.some((row) => row.name.includes('Otto'))).toBe(false);
    expect(host.lines.some((line) => line.includes('đang phản'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TEST B — mục 12.12
// ---------------------------------------------------------------------------

describe('Phần 13 mục 12.12 — TEST B: KIỂM TRA RANH GIỚI', () => {
  const files = readdirSync(SOURCE_DIR).filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'));

  /** Bỏ chú thích: quét MÃ, không quét lời giải thích vì sao phải cấm. */
  function codeOf(name: string): string {
    return readFileSync(join(SOURCE_DIR, name), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/\/\/.*$/gm, ' ');
  }

  it('LIỆT KÊ mọi chỗ `realm` chạm vào `holdings` — và mọi chỗ đều qua giao diện đã khai', () => {
    const touches: { file: string; line: number; text: string; typeOnly: boolean }[] = [];

    for (const name of files) {
      const raw = readFileSync(join(SOURCE_DIR, name), 'utf8').split(/\r?\n/);
      raw.forEach((text, index) => {
        if (!text.includes('@/systems/holding')) return;
        // Chỉ tính DÒNG MÃ, không tính dòng chú thích nhắc tới đường dẫn ấy.
        const trimmed = text.trim();
        if (trimmed.startsWith('*') || trimmed.startsWith('//')) return;
        touches.push({
          file: name,
          line: index + 1,
          text: trimmed,
          typeOnly: /^import\s+type\s/.test(trimmed),
        });
      });
    }

    const report: string[] = [];
    report.push('');
    report.push('┌─ TEST B — MỌI CHỖ `realm` CHẠM VÀO `holdings` ───────────────────');
    if (touches.length === 0) {
      report.push('│ (không có chỗ nào)');
    }
    for (const touch of touches) {
      report.push(`│ ${touch.file}:${String(touch.line)}`);
      report.push(`│    ${touch.text}`);
      report.push(`│    → ${touch.typeOnly ? 'CHỈ KIỂU (import type) — hợp lệ, không còn mã sau khi biên dịch' : 'IMPORT GIÁ TRỊ — VI PHẠM'}`);
    }
    report.push('│');
    report.push('│ Ba giao diện được phép (holding/interfaces.ts):');
    report.push('│   holding → realm   Tribute      nộp nghĩa vụ, quân dịch, đóng góp sản lượng');
    report.push('│   realm → holding   RealmOrder   cấp phép · bảo hộ · trưng dụng · đặt luật');
    report.push('│   holding ↔ holding Shipment     buôn bán, tiếp tế');
    report.push('└──────────────────────────────────────────────────────────────────');
    // eslint-disable-next-line no-console
    console.log(report.join('\n'));

    // Mọi chỗ chạm phải là `import type` từ ĐÚNG file giao diện.
    for (const touch of touches) {
      expect(touch.typeOnly, `${touch.file}:${String(touch.line)}`).toBe(true);
      expect(touch.text, `${touch.file}:${String(touch.line)}`).toContain('holding/interfaces');
    }
  });

  it('không file nào của `realm` đọc slice `holdings`', () => {
    const offenders: string[] = [];
    for (const name of files) {
      const source = codeOf(name);
      if (/state\['holdings'\]/.test(source)) offenders.push(`${name}: đọc state['holdings']`);
      if (/\ballHoldings\b|\bholdingById\b|\bseatOf\b|\btotalPopulation\b/.test(source)) {
        offenders.push(`${name}: gọi hàm đọc của slice holdings`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('không file nào của `realm` nhắc tới từ vựng của tầng thành trì', () => {
    // Phụ lục A mục 4: lưới ô, công trình, dân đếm được đều là của tầng dưới.
    // Một trường `gridSize` ở tầng này nghĩa là hai tầng đã lẫn.
    const banned = [/\bgridSize\b/, /\bbuildingId\b/, /\bmanWeeks/, /population\.total/, /\bstores\b/];
    const offenders: string[] = [];
    for (const name of files) {
      const source = codeOf(name);
      for (const pattern of banned) {
        if (pattern.test(source)) offenders.push(`${name}: ${pattern.source}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('mọi id tỉnh mang tiền tố prov_, mọi id lãnh thổ mang realm_ (Phụ lục A mục 9b)', () => {
    const { realm } = aCounty();
    expect(realm.id.startsWith('realm_')).toBe(true);
    expect(realm.provinces.every((province) => province.id.startsWith('prov_'))).toBe(true);
    expect(realm.provinces.every((province) => province.parentRealmId.startsWith('realm_'))).toBe(true);
  });

  it('con số cấp vùng là ƯỚC CHỪNG, không phải con số chính xác (Phụ lục A mục 6)', () => {
    const { realm } = aCounty();
    const province = realm.provinces[0]!;
    // Số hộ đã LÀM TRÒN SẴN ở hàm, không phải làm tròn ở chỗ hiển thị: tầng này
    // không bao giờ được nói "năm nghìn bốn trăm sáu mươi hộ".
    const rough = households(province);
    expect(rough % 50).toBe(0);
    expect(rough).not.toBe(Math.round(province.development * developmentConfig().householdsPerPoint));
    // Và số quân cũng thế: làm tròn tới hàng chục, kèm chữ "ước chừng" ở UI.
    expect(levyEstimate(province) % 10).toBe(0);
  });
});
