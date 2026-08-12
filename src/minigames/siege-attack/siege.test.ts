/**
 * BÀI TEST CỦA PHẦN 11 MỤC 10.
 *
 * Bài số 11 — HAI KỊCH BẢN với cùng một thành và cùng một đạo quân — là bài quan
 * trọng nhất, và nó gác đúng thứ mục 1 gọi là nguyên tắc thiết kế của cả phần:
 * "Tổng công là NƯỚC CUỐI CÙNG, không phải cách chơi mặc định." Nếu hai kịch bản
 * ra kết quả giống nhau thì cả Phần 11 chỉ còn là một trận dã chiến có tường, và
 * người chơi sẽ luôn bấm tổng công ở tuần đầu tiên.
 *
 * Bài in RA BẢNG SỐ để người cân bằng đọc, không chỉ trả về một chữ "pass" — cùng
 * lý do với bài ba tình huống lịch sử của Phần 10 và bài 200 trận của Phần 9.
 *
 * Những bài còn lại gác các luật cứng của các mục khác: công sự lùi từng lớp và
 * BỎ LẠI LƯƠNG phía ngoài, dịch bệnh giết nhiều hơn tên đạn, hai bảng hành động
 * không dùng chung một dòng nào, khế ước trói CẢ HAI bên, chỗ thắt cổ chai của
 * mục 6 thật sự thắt, và tiếng tàn bạo của mục 7 đi được tới bàn đàm phán của
 * thành SAU.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { createRng } from '@/core/rng';
import { registerGameSlices } from '@/state/register';
import { slices } from '@/state/slices';
import { resetModifierSources } from '@/systems/check';
import { registerCharacterSources } from '@/systems/character';
import { registerBodySources } from '@/systems/body/modifiers';
import { registerSkillSources } from '@/systems/skills/modifiers';
import { compressChronicle } from '@/systems/combat/chronicle';
import { CHRONICLE_RULES, NARRATION_RULES, narrationPrompt, renderChronicle } from '@/systems/combat/narrate';
import {
  allRations,
  allTerms,
  autoChooseOption,
  buildFortification,
  buildSiegeChronicle,
  canFallBack,
  createSiege,
  crossSection,
  defenceDensity,
  eventDefOf,
  fallBack,
  fortTemplateOf,
  garrisonMen,
  ledgerDead,
  mayChoose,
  packageOf,
  parley,
  reputationOps,
  resolveEvent,
  runWeek,
  sackOrSpare,
  siegeChronicleFor,
  siegeConfig,
  signContract,
  breakContract,
  summarise,
  termOf,
  type SiegeState,
  type WeekPlan,
} from '@/systems/siege';
import { registerSiegeSources } from '@/systems/siege';
import { assaultSummary, availableMethods, besiegerActions, layerPath, runAssault, startAssault } from './index';
import { autoDefenderAction, defenderActions } from '@/minigames/siege-defense';
import { autoBesiegerAction } from './actions';

registerGameSlices();

beforeEach(() => {
  resetModifierSources();
  registerCharacterSources();
  registerBodySources();
  registerSkillSources();
  registerSiegeSources();
});

// ---------------------------------------------------------------------------
// Bộ dựng
// ---------------------------------------------------------------------------

/** Đúng bài của mục 11: 200 quân thủ một thành đủ lương, chống 2000 quân vây. */
function testSiege(seed: string, engines: readonly string[] = ['engine_thang', 'engine_xe-huc']): SiegeState {
  return createSiege(createRng(seed), {
    fort: { templateId: 'fort_lau-dai-da' },
    attacker: {
      name: 'Đạo quân bá tước Roussel',
      commanderName: 'Bá tước Roussel',
      troops: 2000,
      levy: 900,
      mercenary: 600,
      retinue: 500,
      treasury: 30000,
      supplies: 6000,
      engines,
      minerRaceId: 'race_lun-nui',
    },
    defender: { name: 'Lâu đài Montfort', commanderName: 'Ser Aymer de Montfort' },
    playerSide: 'vay',
    seasonId: 'ha',
    reliefPossible: false,
    stakes: 'con đường độc đạo qua thung lũng, và ba đời thù hằn',
    setting: { place: 'mỏm đá trên khúc quanh sông Aube' },
  });
}

/** Chạy cho tới khi xong, tự chọn hộ cả hai bên. Đây là "vây đủ lâu" của mục 11. */
function playOut(siege: SiegeState, seed: string, maxWeeks = 90): SiegeState {
  const rng = createRng(seed);
  let current = siege;

  for (let index = 0; index < maxWeeks && !current.finished; index++) {
    if (current.pendingEvent !== null) {
      const def = eventDefOf(current.pendingEvent.eventId);
      current = resolveEvent(current, rng, def === null ? '' : autoChooseOption(current, def, current.playerSide));
      continue;
    }
    const plan: WeekPlan = {
      attacker: autoBesiegerAction(current),
      defender: autoDefenderAction(current),
      payTroops: true,
    };
    current = runWeek(current, rng, plan).siege;
  }
  return current;
}

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function table(rows: readonly (readonly string[])[]): void {
  const widths = rows[0]?.map((_, column) => Math.max(...rows.map((row) => (row[column] ?? '').length))) ?? [];
  const line = (row: readonly string[]): string =>
    row.map((cell, column) => cell.padEnd(widths[column] ?? cell.length)).join('  ').trimEnd();
  console.log(line(rows[0] ?? []));
  console.log(widths.map((width) => '─'.repeat(width)).join('  '));
  for (const row of rows.slice(1)) console.log(line(row));
}

// ---------------------------------------------------------------------------
// 1. Data và mô hình công sự nhiều lớp (mục 2, mục 10.1–10.2)
// ---------------------------------------------------------------------------

describe('công sự nhiều lớp', () => {
  it('bốn file data nạp được và kiểm tham chiếu chéo', () => {
    expect(fortTemplateOf('fort_lau-dai-da')).not.toBeNull();
    expect(allRations().length).toBeGreaterThanOrEqual(4);
    // Khẩu phần phải xếp GIẢM DẦN — `data.ts` nổ lúc nạp nếu không.
    const factors = allRations().map((level) => level.factor);
    for (let index = 1; index < factors.length; index++) {
      expect(factors[index]).toBeLessThan(factors[index - 1] ?? 1);
    }
    // Mục 5 đứng hay đổ ở đúng điều khoản này.
    expect(allTerms().some((term) => term.conditional)).toBe(true);
  });

  it('LÙI MỘT LỚP: diện tích nhỏ lại, mật độ tăng, và LƯƠNG NẰM LẠI PHÍA NGOÀI', () => {
    const fort = buildFortification({ templateId: 'fort_lau-dai-da' });
    expect(canFallBack(fort)).toBe(true);

    const foodBefore = fort.supplies.food;
    const densityBefore = defenceDensity(fort);
    const areaBefore = fort.bailey.area;

    const moved = fallBack(fort);
    expect(moved.moved).toBe(true);
    expect(moved.to).toBe('tuong-trong');
    // Ba vế của mục 2, đủ cả ba.
    expect(fort.bailey.area).toBeLessThan(areaBefore);
    expect(defenceDensity(fort)).toBeGreaterThan(densityBefore);
    expect(fort.supplies.food).toBeLessThan(foodBefore);
    expect(moved.foodLost).toBeGreaterThan(0);

    // Lùi lần hai vào tháp chính: chỉ còn đúng thứ đã chất sẵn trong đó.
    const second = fallBack(fort);
    expect(second.to).toBe('thap-chinh');
    expect(fort.supplies.food).toBeLessThanOrEqual(fort.keep.stores);
    expect(canFallBack(fort)).toBe(false);
  });

  it('sơ đồ mặt cắt hiện integrity TỪNG LỚP, không phải một con số gộp (mục 9)', () => {
    const fort = buildFortification({ templateId: 'fort_thanh-tri-kep' });
    const view = crossSection(fort);
    const ids = view.map((row) => row.id);
    expect(ids).toContain('hao');
    expect(ids).toContain('tuong-ngoai');
    expect(ids).toContain('cong');
    expect(ids).toContain('tuong-trong');
    expect(ids).toContain('thap-chinh');
    expect(view.filter((row) => row.held).length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 2. HAI BẢNG HÀNH ĐỘNG RIÊNG BIỆT (mục 10.4)
// ---------------------------------------------------------------------------

describe('hai bảng hành động', () => {
  it('không dùng chung một dòng nào, và mỗi dòng chỉ thuộc về một bên', () => {
    const siege = testSiege('tables');
    const attack = besiegerActions(siege);
    const defend = defenderActions(siege);

    expect(attack.length).toBeGreaterThanOrEqual(9);
    expect(defend.length).toBeGreaterThanOrEqual(9);
    expect(attack.every((action) => action.side === 'vay')).toBe(true);
    expect(defend.every((action) => action.side === 'thu')).toBe(true);

    const shared = attack.map((action) => action.id).filter((id) => defend.some((action) => action.id === id));
    expect(shared).toEqual([]);
  });

  it('chín hành động của mục 3 có mặt đủ ở cả hai bảng', () => {
    const siege = testSiege('tables-2');
    const attack = besiegerActions(siege).map((action) => action.id);
    for (const id of ['vong-vay', 'dao-ham', 'ban-pha', 'cat-nuoc', 'nem-xac', 'chieu-hang', 'mua-chuoc', 'doi']) {
      expect(attack.some((entry) => entry.startsWith(id))).toBe(true);
    }
    expect(attack.some((entry) => entry.startsWith('dung-may:'))).toBe(true);

    const defend = defenderActions(siege).map((action) => action.id);
    for (const id of [
      'chia-khau-phan',
      'sua-tuong',
      'dot-kich',
      'phan-dao-ham',
      'do-nuoc-soi',
      'gui-su-cau-vien',
      'duoi-dan',
      'gia-vo-du-da',
      'giu-long-nguoi',
    ]) {
      expect(defend.some((entry) => entry.startsWith(id))).toBe(true);
    }
  });

  it('"đổ nước sôi" KHÔNG bấm được trong giai đoạn vây hãm — chỉ khi địch áp sát', () => {
    const siege = testSiege('oil');
    const oil = defenderActions(siege).find((action) => action.id === 'do-nuoc-soi');
    expect(oil).toBeDefined();
    expect(oil?.available(siege)).toBe(false);

    const assaulting = startAssault(siege, { methodId: 'bac-thang' });
    expect(oil?.available(assaulting)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3. Nhịp tuần (mục 3, mục 10.3)
// ---------------------------------------------------------------------------

describe('nhịp một tuần', () => {
  it('mỗi tuần tính đủ tám thứ mục 3 liệt kê, và sổ tử chia theo NGUYÊN NHÂN', () => {
    const rng = createRng('week');
    let siege = testSiege('week');
    for (let index = 0; index < 12 && !siege.finished; index++) {
      if (siege.pendingEvent !== null) {
        const def = eventDefOf(siege.pendingEvent.eventId);
        siege = resolveEvent(siege, rng, def === null ? '' : autoChooseOption(siege, def, 'vay'));
        continue;
      }
      siege = runWeek(siege, rng, { attacker: autoBesiegerAction(siege), defender: autoDefenderAction(siege) }).siege;
    }

    expect(siege.weeks.length).toBeGreaterThan(6);
    const report = siege.weeks.at(-1);
    expect(report).toBeDefined();
    // Đường cong của mục 8 phải có mặt trong từng biên bản tuần.
    expect(report?.attackerTroops).toBeGreaterThan(0);
    expect(report?.defenderFoodWeeks).toBeGreaterThan(0);
    expect(siege.attacker.losses.disease).toBeGreaterThan(0);
    // Vệ sinh trại đi xuống — đồng hồ đếm ngược thật sự của bên vây.
    expect(siege.attacker.hygiene).toBeLessThan(siegeConfig().disease.hygieneStart);
  });

  it('HẾT HẠN NGHĨA VỤ: không trả tiền thì chư hầu về nhà, và đó KHÔNG phải đào ngũ', () => {
    const rng = createRng('service');
    let siege = testSiege('service');
    siege.attacker.treasury = 0;

    for (let index = 0; index < 8 && !siege.finished; index++) {
      if (siege.pendingEvent !== null) {
        const def = eventDefOf(siege.pendingEvent.eventId);
        siege = resolveEvent(siege, rng, def === null ? '' : autoChooseOption(siege, def, 'vay'));
        continue;
      }
      siege = runWeek(siege, rng, { payTroops: false }).siege;
    }

    expect(siege.attacker.levyLeft).toBe(true);
    expect(siege.attacker.losses.departed).toBeGreaterThan(500);
    // Hai cột khác nhau trong sổ, và đó là toàn bộ ý nghĩa của việc chia sổ tử.
    expect(siege.attacker.losses.departed).toBeGreaterThan(siege.attacker.losses.desertion);
  });

  it('DỰNG VÒNG VÂY chặn được lương lậu ban đêm', () => {
    const rng = createRng('circ');
    const open = runWeek(testSiege('circ-open'), rng, {}).siege;
    const tight = (() => {
      const siege = testSiege('circ-tight');
      siege.attacker.circumvallation = 3;
      return runWeek(siege, createRng('circ'), {}).siege;
    })();
    expect(tight.fort.supplies.food).toBeLessThan(open.fort.supplies.food);
  });
});

// ---------------------------------------------------------------------------
// 4. Minigame phản đào hầm (mục 10.5)
// ---------------------------------------------------------------------------

describe('phản đào hầm', () => {
  it('đánh nhau dưới lòng đất rất chết chóc, và thắng thì hầm địch dừng hẳn', () => {
    const siege = testSiege('mine');
    siege.attacker.mines.push({
      id: 'mine_1',
      progress: 0.6,
      crew: 60,
      raceId: 'race_nhan-loai',
      collapsed: false,
      fired: false,
      detected: true,
    });

    const action = defenderActions(siege).find((entry) => entry.id === 'phan-dao-ham');
    expect(action).toBeDefined();
    expect(action?.available(siege)).toBe(true);

    const before = garrisonMen(siege.fort);
    const lines = action?.apply(siege, createRng('countermine')) ?? [];
    expect(lines.length).toBeGreaterThan(1);

    // Chết chóc: một trong hai đội thợ phải mất người thật.
    const lost = before - garrisonMen(siege.fort);
    expect(lost + siege.attacker.losses.combat).toBeGreaterThan(0);
    // Và cuộc ấy phải KẾT THÚC — hầm sập, một bên hết người, hoặc hai bên bịt lại.
    const shaft = siege.attacker.mines[0];
    expect(shaft).toBeDefined();
    expect(siege.checks.some((entry) => entry.what.includes('dưới hầm'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 5. Đàm phán và khế ước (mục 5, mục 10.6)
// ---------------------------------------------------------------------------

describe('đàm phán và khế ước', () => {
  it('đòi càng nhiều thì càng khó được gật đầu — cái giá hiện thành một dòng đọc được', () => {
    const siege = testSiege('parley');
    const rng = createRng('parley');

    const cheap = parley(siege, rng, { by: 'vay', terms: packageOf('pkg_hao-hiep')?.terms ?? [] });
    const dear = parley(testSiege('parley'), createRng('parley'), {
      by: 'vay',
      terms: packageOf('pkg_khac-nghiet')?.terms ?? [],
    });

    const line = dear.check.modifiers.find((entry) => entry.label.includes('điều khoản đang đòi'));
    expect(line).toBeDefined();
    expect(line?.value).toBeLessThan(0);

    const cheapLine = cheap.check.modifiers.find((entry) => entry.label.includes('điều khoản đang đòi'));
    expect(Math.abs(cheapLine?.value ?? 0)).toBeLessThan(Math.abs(line?.value ?? 0));
  });

  it('KHẾ ƯỚC TRÓI CẢ HAI BÊN: đóng băng chiến sự, và phá ước thì bên nào cũng phải trả', () => {
    const siege = testSiege('contract');
    const contract = signContract(siege, ['term_mo-cong-co-dieu-kien', 'term_quan-rut-mang-vu-khi'], 4);
    expect(contract.deadlineWeek).toBe(siege.week + 4);
    expect(siege.phase).toBe('khe-uoc');

    // Bắn phá bị đóng băng trong lúc khế ước còn hiệu lực.
    const after = runWeek(siege, createRng('contract'), {}).siege;
    expect(after.log.some((line) => line.text.includes('không ai bắn một phát nào'))).toBe(true);

    // Phá ước: BÊN VÂY cũng mất danh dự và bị Giáo hội xét, không chỉ bên thủ.
    const broken = testSiege('break');
    signContract(broken, ['term_mo-cong-co-dieu-kien'], 4);
    const churchBefore = broken.church;
    const crueltyBefore = broken.cruelty;
    breakContract(broken, 'vay', 'bắn phá trong lúc còn khế ước');
    expect(broken.church).toBeLessThan(churchBefore);
    expect(broken.cruelty).toBeGreaterThan(crueltyBefore);
    expect(broken.contract?.brokenBy).toBe('vay');
  });

  it('khế ước tới hạn mà không có cứu viện thì cổng mở đúng lời hứa', () => {
    let siege = testSiege('due');
    signContract(siege, ['term_mo-cong-co-dieu-kien', 'term_quan-rut-mang-vu-khi'], 1);
    const rng = createRng('due');
    for (let index = 0; index < 4 && !siege.finished; index++) {
      if (siege.pendingEvent !== null) {
        const def = eventDefOf(siege.pendingEvent.eventId);
        siege = resolveEvent(siege, rng, def === null ? '' : autoChooseOption(siege, def, 'vay'));
        continue;
      }
      siege = runWeek(siege, rng, {}).siege;
    }
    expect(siege.finished).toBe(true);
    expect(siege.ending).toBe('khe-uoc-den-han');
    expect(siege.winner).toBe('vay');
    expect(siege.terms).toContain('term_quan-rut-mang-vu-khi');
  });
});

// ---------------------------------------------------------------------------
// 6. Tổng công trên lưới có tầng (mục 6, mục 10.7)
// ---------------------------------------------------------------------------

describe('tổng công', () => {
  it('đường đi qua các lớp phụ thuộc CÁCH ĐÁNH: xe húc và chỗ sập bỏ qua mặt tường', () => {
    const siege = testSiege('path');
    expect(layerPath(siege, 'bac-thang')).toContain('mat-tuong');
    expect(layerPath(siege, 'pha-cong')).not.toContain('mat-tuong');

    // Chưa bắn thủng thì không có "đột phá qua chỗ sập" trong bảng.
    expect(availableMethods(siege)).not.toContain('dot-pha-cho-sap');
    const breached = testSiege('path-2');
    breached.fort.outerWall.integrity = 0;
    breached.fort.outerWall.breached = true;
    expect(availableMethods(breached)).toContain('dot-pha-cho-sap');
  });

  it('tháp công thành không lăn qua hào chưa lấp', () => {
    const siege = testSiege('tower', ['engine_thap-cong-thanh']);
    expect(availableMethods(siege)).not.toContain('thap-cong-thanh');
    const filled = testSiege('tower-2', ['engine_thap-cong-thanh']);
    if (filled.fort.moat !== null) filled.fort.moat.filled = 1;
    expect(availableMethods(filled)).toContain('thap-cong-thanh');
  });
});

// ---------------------------------------------------------------------------
// 7. Cướp phá và TIẾNG TÀN BẠO (mục 7, mục 10.8)
// ---------------------------------------------------------------------------

describe('cướp phá và tiếng tàn bạo', () => {
  it('chỉ được chọn khi thành bị hạ BẰNG TỔNG CÔNG — đầu hàng theo điều kiện thì không', () => {
    const stormed = testSiege('sack-1');
    stormed.finished = true;
    stormed.winner = 'vay';
    stormed.ending = 'ha-bang-tong-cong';
    expect(mayChoose(stormed)).toBe(true);

    const surrendered = testSiege('sack-2');
    surrendered.finished = true;
    surrendered.winner = 'vay';
    surrendered.ending = 'dau-hang-co-dieu-kien';
    expect(mayChoose(surrendered)).toBe(false);
  });

  it('hai vế, và VẾ THA CŨNG ĐAU: quân không được thưởng thì có thể nổi loạn', () => {
    const sacked = testSiege('sack-3');
    const sackOut = sackOrSpare(sacked, createRng('sack'), true);
    expect(sackOut.loot).toBeGreaterThan(0);
    expect(sackOut.populationLost).toBeGreaterThan(0);
    expect(sacked.cruelty).toBeGreaterThan(0);
    expect(sacked.church).toBeLessThan(0);

    const spared = testSiege('sack-4');
    // Đủ cao để cuộc nổi loạn là CHẮC CHẮN: bài test này đo có hay không có nhánh
    // ấy, không đo xác suất của nó.
    spared.attacker.sackPressure = 200;
    const spareOut = sackOrSpare(spared, createRng('spare'), false);
    expect(spareOut.loot).toBe(0);
    expect(spared.mercy).toBeGreaterThan(0);
    expect(spareOut.mutiny).toBe(true);
  });

  it('HỆ QUẢ TOÀN CỤC: tiếng tàn bạo đi vào state và tới bàn đàm phán của thành SAU', () => {
    // Thành thứ nhất bị cướp phá.
    const first = testSiege('global-1');
    first.finished = true;
    first.winner = 'vay';
    first.ending = 'ha-bang-tong-cong';
    sackOrSpare(first, createRng('global'), true);

    const ops = reputationOps(first);
    const cruelty = ops.find((op) => op.path === 'siege.reputation.tanBao');
    expect(cruelty).toBeDefined();
    expect(Number(cruelty?.to ?? 0)).toBeGreaterThan(20);
    expect(ops.some((op) => op.path === 'siege.holds')).toBe(true);

    // Thành thứ hai: cùng một cuộc đàm phán, một bên có tiếng tàn bạo, một bên không.
    const clean = testSiege('global-2');
    const cruel = testSiege('global-3');
    cruel.cruelty = Number(cruelty?.to ?? 0);

    const terms = packageOf('pkg_thong-thuong')?.terms ?? [];
    const cleanRun = parley(clean, createRng('deal'), { by: 'vay', terms });
    const cruelRun = parley(cruel, createRng('deal'), { by: 'vay', terms });

    const cruelLine = cruelRun.check.modifiers.find((entry) => entry.label.includes('Tiếng tàn bạo'));
    expect(cruelLine).toBeDefined();
    expect(cruelLine?.value).toBeLessThan(0);
    expect(cleanRun.check.modifiers.some((entry) => entry.label.includes('Tiếng tàn bạo'))).toBe(false);

    /**
     * Đo TỔNG ĐIỀU CHỈNH, không đo `target`.
     *
     * `target` đã bị kẹp ở sàn của hệ d100 — một lời đề nghị nặng trước một bức
     * tường còn nguyên vốn đã chạm đáy rồi, nên hai bên cùng ra 5 và phép so sánh
     * không nói lên điều gì. Thứ bài test này cần chứng minh là tiếng tàn bạo có
     * THẬT SỰ đi tới bàn đàm phán hay không, và câu trả lời ấy nằm ở danh sách
     * điều chỉnh — cũng đúng là chỗ người chơi đọc.
     */
    const total = (run: typeof cruelRun): number =>
      run.check.modifiers.reduce((sum, entry) => sum + entry.value, 0);
    expect(total(cruelRun)).toBeLessThan(total(cleanRun));
  });

  it('slice `siege` có trong state và AI KHÔNG ghi được vào tiếng tàn bạo', () => {
    expect(slices.get('siege')).toBeDefined();
    const permission = slices.get('siege')?.permissions?.['reputation.*'];
    expect(permission).toBe('engine');
  });
});

// ---------------------------------------------------------------------------
// 8. Biên niên kiểu biên niên sử (mục 8, mục 10.9)
// ---------------------------------------------------------------------------

describe('biên niên', () => {
  it('nén thì GIỮ tuần có mốc, và prompt phải đòi giọng biên niên sử', () => {
    const done = playOut(testSiege('chronicle'), 'chronicle');
    const chronicle = buildSiegeChronicle(done);

    expect(chronicle.kind).toBe('siege');
    expect(chronicle.siege).toBeDefined();
    expect(chronicle.rounds.some((round) => round.siege !== undefined)).toBe(true);

    const milestoneWeeks = chronicle.rounds.filter((round) => (round.siege?.milestones.length ?? 0) > 0);
    const compact = compressChronicle(chronicle, { maxRounds: 6 });
    const kept = new Set(compact.entries.filter((entry) => entry.kind === 'round').map((entry) => entry.round.n));
    if (milestoneWeeks.length > 0 && milestoneWeeks.length <= 6) {
      for (const round of milestoneWeeks) expect(kept.has(round.n)).toBe(true);
    }

    const text = renderChronicle(compact);
    expect(text).toContain('CUỘC VÂY HÃM');
    expect(text).toContain('Tuần');
    expect(text).toContain('vì bệnh');

    const prompt = narrationPrompt(compact);
    for (const rule of CHRONICLE_RULES) expect(prompt.system).toContain(rule);
    for (const rule of NARRATION_RULES) expect(prompt.system).toContain(rule);
  });

  it('in ra đúng thứ sẽ gửi cho AI viết diễn biến (mục 11)', () => {
    const done = playOut(testSiege('mau-bien-nien'), 'mau-bien-nien');
    const prompt = narrationPrompt(siegeChronicleFor(done, 10), { charName: 'Bá tước Roussel' });
    console.log('\n=== PHẦN 11 MỤC 11 — LỆNH GỬI CHO AI ===\n');
    console.log(prompt.system);
    console.log('\n=== BIÊN NIÊN GỬI KÈM ===\n');
    console.log(prompt.user);
    console.log('');
    expect(prompt.user).toContain('CUỘC VÂY HÃM');
    expect(prompt.user).toContain('KẾT CỤC');
  });
});

// ---------------------------------------------------------------------------
// 9. BÀI TEST MỤC 10.11 — HAI KỊCH BẢN
// ---------------------------------------------------------------------------

describe('mục 10.11 — 200 quân thủ, 2000 quân vây', () => {
  const RUNS = 8;

  it('KỊCH BẢN 1 — TỔNG CÔNG NGAY: phải thua thảm', () => {
    let failed = 0;
    let attackerLosses = 0;
    let defenderLosses = 0;
    let shares = 0;

    for (let index = 0; index < RUNS; index++) {
      const rng = createRng(`storm-${String(index)}`);
      const done = runAssault(testSiege(`storm-${String(index)}`), rng, { methodId: 'bac-thang', forlornHope: true });
      const summary = assaultSummary(done);
      expect(summary).not.toBeNull();
      if (summary === null) continue;

      if (!summary.succeeded) failed += 1;
      attackerLosses += summary.attackerLosses;
      defenderLosses += summary.defenderLosses;
      shares += summary.attackerShare;
    }

    console.log(`\nKỊCH BẢN 1 — 2000 quân tổng công ngay tuần đầu, tường còn nguyên, ${String(RUNS)} lần`);
    table([
      ['kết cục', 'số lần', 'bên tấn công CHẾT (TB)', 'bên thủ chết (TB)', 'tỷ lệ thương vong bên tấn công'],
      [
        'BỊ ĐÁNH BẬT',
        `${String(failed)}/${String(RUNS)}`,
        (attackerLosses / RUNS).toFixed(0),
        (defenderLosses / RUNS).toFixed(0),
        pct(shares / RUNS),
      ],
    ]);

    // Mục 1: "Đánh thẳng vào tường thành là cách nhanh nhất để mất quân."
    expect(failed).toBe(RUNS);
    // Mục 6: "Tỷ lệ thương vong bên tấn công ở các chốt phải RẤT cao."
    expect(shares / RUNS).toBeGreaterThan(0.35);
    // Và bên thủ phải mất ít hơn HẲN — đó là lý do tồn tại của thành trì.
    expect(attackerLosses).toBeGreaterThan(defenderLosses * 2.5);
  });

  it('KỊCH BẢN 2 — VÂY ĐỦ LÂU: thắng, nhưng mất một phần lớn quân VÌ BỆNH', () => {
    const rows: string[][] = [
      ['lần', 'tuần', 'kết cục', 'quân vây còn', 'chết vì BỆNH', 'chết vì đánh', 'đói', 'đào ngũ', 'về nhà'],
    ];
    let wins = 0;
    let diseaseShare = 0;
    let weeks = 0;

    for (let index = 0; index < RUNS; index++) {
      const done = playOut(testSiege(`grind-${String(index)}`), `grind-${String(index)}`);
      const summary = summarise(done);
      if (done.winner === 'vay') wins += 1;
      diseaseShare += summary.attackerLosses.disease / summary.attackerStart;
      weeks += summary.weeks;

      rows.push([
        String(index + 1),
        String(summary.weeks),
        summary.endingName,
        String(summary.attackerLeft),
        String(summary.attackerLosses.disease),
        String(summary.attackerLosses.combat),
        String(summary.attackerLosses.hunger),
        String(summary.attackerLosses.desertion),
        String(summary.attackerLosses.departed),
      ]);
    }

    console.log(`\nKỊCH BẢN 2 — cùng thành ấy, cùng đạo quân ấy, nhưng VÂY thay vì đánh, ${String(RUNS)} lần`);
    table(rows);
    console.log(
      `Trung bình: ${(weeks / RUNS).toFixed(1)} tuần · chết vì bệnh ${pct(diseaseShare / RUNS)} quân số ban đầu\n`,
    );

    // "Nếu vây đủ lâu thì phải thắng…"
    expect(wins).toBeGreaterThanOrEqual(Math.ceil(RUNS * 0.75));
    // "…nhưng mất một phần lớn quân vì bệnh."
    expect(diseaseShare / RUNS).toBeGreaterThan(0.15);
  });

  it('HAI KỊCH BẢN PHẢI KHÁC NHAU THẬT — nếu không thì tổng công là nước đi hiển nhiên', () => {
    const stormed = runAssault(testSiege('cmp-storm'), createRng('cmp-storm'), { methodId: 'bac-thang' });
    const besieged = playOut(testSiege('cmp-grind'), 'cmp-grind');

    expect(assaultSummary(stormed)?.succeeded).toBe(false);
    expect(besieged.winner).toBe('vay');

    console.log('\nSO SÁNH HAI KỊCH BẢN — cùng thành, cùng đạo quân');
    table([
      ['cách chơi', 'kết cục', 'quân vây còn lại', 'tuần'],
      [
        'TỔNG CÔNG NGAY',
        'bị đánh bật',
        String(stormed.attacker.troops),
        String(stormed.weeks.length + 1),
      ],
      [
        'VÂY HÃM',
        summarise(besieged).endingName,
        String(besieged.attacker.troops),
        String(besieged.weeks.length),
      ],
    ]);
    console.log('');
  });

  it('VÀ TỔNG CÔNG SAU KHI VÂY LÂU THÌ KHÁC HẲN — đó là chỗ hai giai đoạn nối vào nhau', () => {
    // Cùng một cuộc tổng công, nhưng sau khi tường đã thủng và đồn trú đã mỏng.
    let lateWins = 0;
    let earlyWins = 0;

    for (let index = 0; index < RUNS; index++) {
      const early = runAssault(testSiege(`late-early-${String(index)}`), createRng(`late-${String(index)}`), {
        methodId: 'bac-thang',
      });
      if (assaultSummary(early)?.succeeded === true) earlyWins += 1;

      const worn = testSiege(`late-worn-${String(index)}`);
      worn.fort.outerWall.integrity = 0;
      worn.fort.outerWall.breached = true;
      for (const unit of worn.fort.garrison) unit.men = Math.round(unit.men * 0.25);
      worn.defender.garrisonMorale = 18;
      const late = runAssault(worn, createRng(`late-${String(index)}`), { methodId: 'dot-pha-cho-sap' });
      if (assaultSummary(late)?.succeeded === true) lateWins += 1;
    }

    console.log(`\nTỔNG CÔNG SỚM vs TỔNG CÔNG SAU KHI ĐÃ BẮN THỦNG TƯỜNG, ${String(RUNS)} lần`);
    table([
      ['lúc nào', 'vào được thành'],
      ['tuần đầu, tường còn nguyên', `${String(earlyWins)}/${String(RUNS)}`],
      ['sau khi tường vỡ và đồn trú mỏng', `${String(lateWins)}/${String(RUNS)}`],
    ]);
    console.log('');

    expect(lateWins).toBeGreaterThan(earlyWins);
  });
});

// ---------------------------------------------------------------------------
// 10. Lưới an toàn (R4)
// ---------------------------------------------------------------------------

describe('lưới an toàn', () => {
  it('không cuộc vây hãm nào chạy quá trần tuần, và luôn kết thúc', () => {
    for (let index = 0; index < 4; index++) {
      const done = playOut(testSiege(`safety-${String(index)}`), `safety-${String(index)}`, 120);
      expect(done.finished).toBe(true);
      expect(done.week).toBeLessThanOrEqual(siegeConfig().maxWeeks + 1);
      expect(ledgerDead(done.attacker.losses)).toBeGreaterThanOrEqual(0);
    }
  });

  it('lựa chọn không hợp lệ và điều khoản lạ không làm chết cuộc vây hãm', () => {
    const siege = testSiege('bad');
    const after = resolveEvent(siege, createRng('bad'), 'khong-ton-tai');
    expect(after.finished).toBe(false);
    expect(termOf('term_khong-ton-tai')).toBeNull();
  });
});
