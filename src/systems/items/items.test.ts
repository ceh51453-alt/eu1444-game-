/**
 * BÀI TEST CỦA PHẦN 16 MỤC 19.
 *
 * Ba bài bắt buộc — A, B, C — gác đúng ba thứ mà "hai chỗ dễ bị làm hời hợt" ở
 * cuối đặc tả cảnh báo, cộng với luật thời đại của mục 1b:
 *
 *   A  Kiếm thường trước giáp tấm gần như không thắng nổi; đổi sang búa chiến
 *      thì TỶ LỆ ĐẢO NGƯỢC RÕ RỆT. Nếu bài này ra 50/50 thì ba trục chống đã bị
 *      gộp thành một con số, và README mục 8.5 nói đó là lúc cả cơ chế đâm khe
 *      hở lẫn lý do tồn tại của cây búa mất nghĩa cùng lúc.
 *   B  Bộ giáp cướp được của một hiệp sĩ Nhân tộc: Lùn KHÔNG mặc được, và một
 *      Nhân tộc khác vóc dáng thì bị phạt nặng. Đây là thứ khiến chiến lợi phẩm
 *      là một tài sản phải xử lý chứ không phải nút "trang bị ngay".
 *   C  Danh mục trang bị năm 1320, 1355, 1390 phải KHÁC NHAU RÕ RỆT.
 *
 * Bài A và C IN RA BẢNG cho người cân bằng đọc, không chỉ trả về một chữ "pass".
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { createRng } from '@/core/rng';
import { registerGameSlices } from '@/state/register';
import { resetModifierSources } from '@/systems/check';
import { registerCharacterSources } from '@/systems/character';
import { carry, type CarriedGear } from '@/systems/character/gear';
import { emptyStatBlock, type StatBlock } from '@/systems/character/stats';
import { registerBodySources } from '@/systems/body/modifiers';
import { registerSkillSources } from '@/systems/skills/modifiers';
import { autoDuel, createDuel, registerDuelSources, type FighterSpec } from '@/minigames/duel';
import {
  buildCoverage,
  buildLoad,
  campaignWear,
  canCraft,
  catalogForYear,
  coverAt,
  craft,
  fatigueOf,
  fitOf,
  gapsOf,
  itemName,
  maintenancePlan,
  newItem,
  recognitionOf,
  refitPlan,
  registerItemSources,
  resolveArmor,
  stampDevice,
  strikeOf,
  valueInPeasantYears,
  valueOf,
  wearItem,
  wornFromCarried,
  wornWeapon,
  type BodyShape,
} from './index';

registerGameSlices();

beforeEach(() => {
  resetModifierSources();
  registerCharacterSources();
  registerBodySources();
  registerSkillSources();
  registerItemSources();
  registerDuelSources();
});

// ---------------------------------------------------------------------------
// Bộ dựng
// ---------------------------------------------------------------------------

function stats(over: Partial<StatBlock> = {}): StatBlock {
  return { ...emptyStatBlock(10), str: 12, agi: 12, vit: 12, per: 12, wil: 12, ...over };
}

function gearOf(ids: readonly string[]): CarriedGear[] {
  const carried: CarriedGear[] = [];
  for (const id of ids) {
    const entry = carry(id);
    if (entry !== null) carried.push(entry);
  }
  return carried;
}

/** BỘ GIÁP TẤM ĐẦY ĐỦ của mục 12 — và áo lót độn là nền của nó (mục 3). */
const FULL_HARNESS = ['item_ao-lot-giap', 'item_giap-tam'];

function worn(ids: readonly string[]) {
  return wornFromCarried(gearOf(ids));
}

function pct(part: number, total: number): string {
  return `${((part / total) * 100).toFixed(1)}%`;
}

function printTable(title: string, rows: readonly (readonly string[])[]): void {
  const widths = rows[0]?.map((_, column) => Math.max(...rows.map((row) => (row[column] ?? '').length))) ?? [];
  const line = (row: readonly string[]): string =>
    row.map((cell, column) => cell.padEnd(widths[column] ?? cell.length)).join('  ').trimEnd();

  console.log(`\n${title}`);
  console.log(line(rows[0] ?? []));
  console.log(widths.map((width) => '─'.repeat(width)).join('  '));
  for (const row of rows.slice(1)) console.log(line(row));
}

// ---------------------------------------------------------------------------
// 1. Bản đồ che phủ (mục 3–4)
// ---------------------------------------------------------------------------

describe('bản đồ che phủ', () => {
  it('phủ đủ 20 vùng, và giáp tấm vẫn hở đúng những chỗ cơ thể phải cử động', () => {
    const map = buildCoverage(worn(FULL_HARNESS));

    expect(map.byRegion.size).toBe(20);
    expect(coverAt(map, 'chest').coverage).toBe(100);

    // Bảy khe hở điển hình của giáp tấm thế kỷ 14 (mục 4).
    const gaps = new Set(gapsOf(map).map((cover) => cover.regionId));
    for (const region of ['hips', 'face', 'handL', 'shoulderL', 'forearmR', 'shinL']) {
      expect(gaps.has(region)).toBe(true);
    }
    expect(coverAt(map, 'hips').gapName).toBe('bẹn');
    expect(coverAt(map, 'shoulderL').gapName).toBe('nách trái');
  });

  it('ba loại chống đi RIÊNG — tấm thép chặn lưỡi mà không chặn lực', () => {
    const chest = coverAt(buildCoverage(worn(FULL_HARNESS)), 'chest').protection;

    expect(chest.chem).toBeGreaterThan(80);
    expect(chest.dam).toBeGreaterThan(80);
    // Nếu ba trục bị gộp thì con số này bằng hai con số trên, và cả mục 5 mất nghĩa.
    expect(chest.dap).toBeLessThan(chest.chem - 20);
  });

  it('ÁO LÓT ĐỘN LÀ NỀN CỦA MỌI BỘ: giáp lưới trần gần như vô dụng trước đòn đập', () => {
    const bare = coverAt(buildCoverage(worn(['item_giap-luoi'])), 'chest').protection;
    const padded = coverAt(buildCoverage(worn(['item_ao-lot-giap', 'item_giap-luoi'])), 'chest').protection;

    expect(bare.dap).toBeLessThan(25);
    expect(padded.dap).toBeGreaterThan(bare.dap * 2);
    // Áo độn không giúp gì đáng kể cho việc chặn lưỡi — lưới đã làm việc đó.
    expect(padded.chem - bare.chem).toBeLessThan(20);
  });
});

// ---------------------------------------------------------------------------
// 2. BÀI TEST A (mục 19 việc 14)
// ---------------------------------------------------------------------------

interface SeriesResult {
  knightWins: number;
  attackerWins: number;
  draws: number;
  rounds: number[];
}

/**
 * HAI NGƯỜI GIỐNG HỆT NHAU, và đó là điểm của bài A.
 *
 * Cùng chỉ số, cùng 50 điểm kỹ năng, cùng một cây trường kiếm hai tay — khác
 * đúng một thứ: một người mặc giáp tấm đầy đủ. Rồi ở bảng 2, người không giáp
 * đổi trường kiếm lấy búa chiến, CÙNG tầm với và CÙNG hai tay, nên tỷ lệ đổi
 * bao nhiêu thì đó là do bản đồ che phủ chứ không do tầm với hay số tay cầm.
 */
function knight(): FighterSpec {
  return {
    id: 'npc_hiep-si',
    name: 'Hiệp sĩ giáp tấm',
    description: 'một khối thép biết đi',
    stats: stats(),
    skills: { 'skill_kiem-thuat': 50, 'skill_riu-bua': 50 },
    gear: gearOf([...FULL_HARNESS, 'item_kiem-dai']),
  };
}

/** Cùng một người, cùng một mức kỹ năng — CHỈ ĐỔI MÓN TRONG TAY. */
function challenger(weaponId: string, skillId: string): FighterSpec {
  return {
    id: 'npc_doi-thu',
    name: weaponId === 'item_kiem-dai' ? 'Tay kiếm thường' : 'Người cầm búa chiến',
    description: 'áo vải, và một món trong tay',
    stats: stats(),
    skills: { [skillId]: 50 },
    gear: gearOf([weaponId]),
  };
}

function runSeries(count: number, weaponId: string, skillId: string): SeriesResult {
  const result: SeriesResult = { knightWins: 0, attackerWins: 0, draws: 0, rounds: [] };

  for (let index = 0; index < count; index++) {
    const rng = createRng(`phan-16-test-a-${String(index)}`);
    const duel = autoDuel(
      createDuel(rng, {
        kindId: 'dau-sinh-tu',
        a: knight(),
        b: challenger(weaponId, skillId),
        arenaId: 'arena_san-dau',
      }),
      rng,
    );

    if (duel.winner === 'a') result.knightWins += 1;
    else if (duel.winner === 'b') result.attackerWins += 1;
    else result.draws += 1;
    result.rounds.push(duel.rounds.length);
  }
  return result;
}

describe('TEST A — kiếm thua giáp tấm, búa thắng', () => {
  it('chạy 200 trận mỗi loại vũ khí và in hai bảng', () => {
    const RUNS = 200;
    const sword = runSeries(RUNS, 'item_kiem-dai', 'skill_kiem-thuat');
    const hammer = runSeries(RUNS, 'item_bua-chien', 'skill_riu-bua');

    const table = (title: string, result: SeriesResult): void => {
      printTable(title, [
        ['', 'hiệp sĩ giáp tấm', 'người tấn công', 'hòa', 'số hiệp TB'],
        [
          'tỷ lệ thắng',
          pct(result.knightWins, RUNS),
          pct(result.attackerWins, RUNS),
          pct(result.draws, RUNS),
          (result.rounds.reduce((sum, value) => sum + value, 0) / RUNS).toFixed(1),
        ],
      ]);
    };

    console.log(`\nPHẦN 16 TEST A — ${RUNS} trận mỗi cấu hình, đấu sinh tử, hai bên cùng 50 điểm kỹ năng`);
    table('BẢNG 1 — đối thủ cầm TRƯỜNG KIẾM (cùng cây kiếm hiệp sĩ đang cầm)', sword);
    table('BẢNG 2 — đối thủ cầm BÚA CHIẾN (cùng tầm với, cùng hai tay)', hammer);
    console.log(
      `\nchênh lệch: cầm búa thay vì cầm kiếm đổi tỷ lệ thắng của người tấn công từ ${pct(
        sword.attackerWins,
        RUNS,
      )} lên ${pct(hammer.attackerWins, RUNS)}.\n`,
    );

    // Kiếm GẦN NHƯ KHÔNG THẮNG NỔI.
    expect(sword.attackerWins / RUNS).toBeLessThan(0.25);
    // Búa chiến phải ĐẢO NGƯỢC RÕ RỆT, không phải cải thiện một chút.
    expect(hammer.attackerWins).toBeGreaterThan(sword.attackerWins * 2);
    expect(hammer.attackerWins / RUNS).toBeGreaterThan(0.5);
  });

  it('cùng một tấm ngực: đường chém dội lại, cú đập đi thẳng qua', () => {
    const rng = createRng('chem-vs-dap');
    const map = buildCoverage(worn(FULL_HARNESS));

    const cut = strikeOf(wornWeapon('item_kiem-mot-tay'), { tags: ['chem'] });
    const crush = strikeOf(wornWeapon('item_bua-chien'), { tags: ['dap'] });
    expect(cut).not.toBeNull();
    expect(crush).not.toBeNull();

    const cutOutcome = resolveArmor(rng, { ...(cut as NonNullable<typeof cut>), targetsGaps: false }, map, 'chest');
    const crushOutcome = resolveArmor(rng, { ...(crush as NonNullable<typeof crush>), targetsGaps: false }, map, 'chest');

    expect(cutOutcome.kind).toBe('chan');
    expect(cutOutcome.severityCap).toBe(0);
    expect(crushOutcome.kind).toBe('xuyen');
    expect(crushOutcome.severityCap).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// 3. BÀI TEST B (mục 19 việc 15)
// ---------------------------------------------------------------------------

describe('TEST B — vừa người', () => {
  const knightShape: BodyShape = { race: 'race_nhan-loai', heightCm: 178, weightKg: 82 };

  it('cướp giáp của hiệp sĩ Nhân tộc rồi cho một Lùn mặc: PHẢI BÁO KHÔNG MẶC ĐƯỢC', () => {
    const dwarf = { id: 'npc_lun', shape: { race: 'race_lun-nui', heightCm: 138, weightKg: 84 } };
    const result = fitOf('item_giap-tam', 'npc_hiep-si', knightShape, dwarf);

    expect(result.wearable).toBe(false);
    expect(result.grade.id).toBe('khong-mac-duoc');
    console.log(`\nTEST B — Lùn mặc giáp Nhân tộc: ${result.reason}`);

    // Và sửa lại thì gần như phải gò lại từ đầu — đó là lý do người ta BÁN.
    const plan = refitPlan('item_giap-tam', result.grade.id);
    expect(plan.weeks).toBeGreaterThan(4);
    console.log(`  sửa lại: ${String(plan.weeks)} tuần, ${String(plan.cost)} đồng — thường thì bán còn hơn.`);
  });

  it('một Nhân tộc KHÁC VÓC DÁNG mặc được, nhưng bị phạt nặng', () => {
    const lanky = { id: 'npc_gay', shape: { race: 'race_nhan-loai', heightCm: 188, weightKg: 66 } };
    const result = fitOf('item_giap-tam', 'npc_hiep-si', knightShape, lanky);

    expect(result.wearable).toBe(true);
    expect(result.grade.id).toBe('khac-voc');
    expect(result.grade.agi).toBeLessThan(-10);
    expect(result.grade.jointLock).toBeGreaterThan(0);
    console.log(`TEST B — Nhân tộc khác vóc dáng: ${result.reason} (AGI ${String(result.grade.agi)})`);
  });

  it('cùng vóc dáng thì chỉ phạt nhẹ, và GIÁP LƯỚI thì ai mặc cũng được', () => {
    const similar = { id: 'npc_giong', shape: { race: 'race_nhan-loai', heightCm: 180, weightKg: 84 } };
    expect(fitOf('item_giap-tam', 'npc_hiep-si', knightShape, similar).grade.id).toBe('gan-vua');

    // Ưu thế THẬT của giáp lưới ở đầu thế kỷ (mục 8).
    const dwarf = { id: 'npc_lun', shape: { race: 'race_lun-nui', heightCm: 138, weightKg: 84 } };
    expect(fitOf('item_giap-luoi', 'npc_hiep-si', knightShape, dwarf).wearable).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 4. BÀI TEST C (mục 19 việc 16)
// ---------------------------------------------------------------------------

describe('TEST C — trang bị đổi theo dòng thời gian', () => {
  it('chạy 70 năm và in danh mục ở 1320, 1355, 1390 — ba danh mục khác nhau rõ rệt', () => {
    const years = [1320, 1355, 1390];
    const catalogs = years.map((year) => new Set(catalogForYear(year)));

    printTable('PHẦN 16 TEST C — danh mục trang bị theo năm', [
      ['năm', 'số món', 'món MỚI so với mốc trước'],
      ...years.map((year: number, index: number) => {
        const current = catalogs[index] ?? new Set<string>();
        const previous = catalogs[index - 1] ?? new Set<string>();
        const fresh = [...current].filter((id) => !previous.has(id)).map((id) => itemName(id));
        return [
          String(year),
          String(current.size),
          index === 0 ? '(mốc đầu)' : fresh.length === 0 ? '—' : fresh.join(', '),
        ];
      }),
    ]);

    const gone = years.map((_year, index) => {
      const current = catalogs[index] ?? new Set<string>();
      const previous = catalogs[index - 1] ?? new Set<string>();
      return [...previous].filter((id) => !current.has(id)).map((id) => itemName(id));
    });
    console.log(`\nmón BIẾN MẤT: 1355 — ${gone[1]?.join(', ') || 'chưa có'}; 1390 — ${gone[2]?.join(', ') || 'chưa có'}`);

    const [early, middle, late] = catalogs;
    expect(early).toBeDefined();
    expect(middle).toBeDefined();
    expect(late).toBeDefined();

    // Ba danh mục phải KHÁC NHAU RÕ RỆT, không phải ba bản sao.
    expect((middle as Set<string>).size).toBeGreaterThan((early as Set<string>).size);
    expect((late as Set<string>).size).toBeGreaterThan((middle as Set<string>).size);

    // ĐẦU THẾ KỶ CHỈ CÓ GIÁP LƯỚI VÀ ÁO GIÁP MẢNH; cuối thế kỷ mới có giáp tấm
    // toàn thân — câu của mục 1b, viết thành một khẳng định kiểm được.
    expect((early as Set<string>).has('item_giap-luoi')).toBe(true);
    expect((early as Set<string>).has('item_ao-giap-manh')).toBe(true);
    expect((early as Set<string>).has('item_giap-tam')).toBe(false);
    expect((early as Set<string>).has('item_yem-giap-tam')).toBe(false);
    expect((middle as Set<string>).has('item_yem-giap-tam')).toBe(false);
    expect((middle as Set<string>).has('item_mu-bascinet')).toBe(true);
    expect((late as Set<string>).has('item_giap-tam')).toBe(true);

    // Và thứ cũ thì BIẾN MẤT: đại mũ trụ và áo giáp mảnh không sống tới 1390.
    expect((late as Set<string>).has('item_mu-tru')).toBe(false);
    expect((late as Set<string>).has('item_ao-giap-manh')).toBe(false);
  });

  it('thợ phải HỌC ĐƯỢC kiểu mới thì mới làm được, và bản mẫu lan theo năm', () => {
    const smith = { id: 'npc_tho', skill: 80 };
    const workshop = { forgeLevel: 3, buildings: ['bld_lo-ren'], patterns: [] };

    // Năm 1375 kiểu giáp tấm toàn thân chưa tồn tại ở đâu cả.
    expect(canCraft({ templateId: 'item_giap-tam', material: 'thep', smith, workshop, year: 1375 }).possible).toBe(false);

    // Năm 1385 kiểu đã có, nhưng bản mẫu chưa lan ra khỏi Frank — vẫn làm được,
    // chỉ khó hơn hẳn, và đó là chỗ mục 11 khác một cánh cửa khóa cứng.
    const outside = canCraft({ templateId: 'item_giap-tam', material: 'thep', smith, workshop, year: 1385 });
    expect(outside.possible).toBe(true);
    expect(outside.hasPattern).toBe(false);

    const inFrance = canCraft({
      templateId: 'item_giap-tam',
      material: 'thep',
      smith,
      workshop,
      year: 1385,
      nationId: 'nation_frank',
    });
    expect(inFrance.hasPattern).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 5. Trọng lượng, hư hỏng, chế tạo, huy hiệu
// ---------------------------------------------------------------------------

describe('trọng lượng có phân bổ (mục 9)', () => {
  it('giáp tấm NẶNG HƠN giáp lưới mà MỆT ÍT HƠN — nghịch lý của cả mục 9', () => {
    const plate = buildLoad(worn(FULL_HARNESS));
    const mail = buildLoad(worn(['item_ao-lot-giap', 'item_giap-luoi']));

    expect(plate.totalKg).toBeGreaterThan(mail.totalKg);
    expect(plate.fatiguePerRound).toBeLessThan(mail.fatiguePerRound);
    expect(mail.shoulderKg).toBeGreaterThan(plate.shoulderKg);

    printTable('MỤC 9 — cùng người, hai bộ giáp', [
      ['bộ', 'tổng kg', 'trên vai', 'mệt mỗi hiệp', 'phạt bơi'],
      ['giáp tấm + áo độn', String(plate.totalKg), String(plate.shoulderKg), String(plate.fatiguePerRound), String(plate.swimPenalty)],
      ['giáp lưới + áo độn', String(mail.totalKg), String(mail.shoulderKg), String(mail.fatiguePerRound), String(mail.swimPenalty)],
    ]);
  });

  it('thiếu đai và móc treo thì tải dồn lên vai, và vai đau thì phạt chồng', () => {
    const belted = buildLoad(worn(FULL_HARNESS), { belted: true });
    const loose = buildLoad(worn(FULL_HARNESS), { belted: false });
    const hurt = buildLoad(worn(FULL_HARNESS), { belted: false, hurtShoulder: true });

    expect(loose.fatiguePerRound).toBeGreaterThan(belted.fatiguePerRound);
    expect(hurt.fatiguePerRound).toBeGreaterThan(loose.fatiguePerRound);
    expect(fatigueOf(10, 'vai')).toBeGreaterThan(fatigueOf(10, 'toan-than'));
  });
});

describe('hư hỏng và bảo dưỡng (mục 10)', () => {
  it('bỏ bê thì sinh hư hỏng CỤ THỂ, và mỗi loại sửa ở một chỗ khác nhau', () => {
    const rng = createRng('hu-hong');
    let sword = newItem('item_kiem-mot-tay', { material: 'sat' });

    for (let index = 0; index < 12; index++) {
      sword = wearItem(rng, sword, { turn: index }).item;
    }

    expect(sword.condition).toBeLessThan(60);
    expect(sword.damage.length).toBeGreaterThan(0);

    const plan = maintenancePlan(sword);
    expect(plan.hours).toBeGreaterThan(0);
    expect(plan.repairs.length).toBe(sword.damage.length);
    console.log(`\nMỤC 10 — thanh kiếm sắt sau 12 trận: tình trạng ${String(sword.condition)}, ${plan.line}`);
    for (const repair of plan.repairs) {
      console.log(`  ${repair.name}: ${String(repair.hours)} giờ${repair.building === '' ? ' (làm ngay tại lều)' : ` tại ${repair.building}`}`);
    }
  });

  it('MỘT ĐẠO QUÂN KHÔNG CÓ THỢ RÈN SẼ RÃ TRANG BỊ SAU VÀI TUẦN', () => {
    const staffed = campaignWear(1200, 10);
    const none = campaignWear(1200, 0);

    expect(none.conditionLost).toBeGreaterThan(staffed.conditionLost * 2);
    expect(none.smithsNeeded).toBe(10);

    let condition = 100;
    let weeks = 0;
    while (condition > 45 && weeks < 60) {
      condition -= none.conditionLost;
      weeks += 1;
    }
    console.log(
      `\nMỤC 10 — 1200 quân, không thợ rèn: ${none.line} Nửa số giáp hỏng sau ${String(weeks)} tuần chiến dịch.`,
    );
    expect(weeks).toBeLessThan(12);
  });
});

describe('chế tạo và giá cả (mục 7, 11, 12)', () => {
  it('tuyệt tác có TÊN RIÊNG và có lịch sử; lô hàng loạt thì không bao giờ vượt mức thường', () => {
    const rng = createRng('ren');
    const workshop = { forgeLevel: 4, buildings: ['bld_lo-ren'], patterns: ['pat_giap-luoi'] };
    const smith = { id: 'npc_tho-ca', skill: 90 };

    let masterpiece = null;
    for (let index = 0; index < 60 && masterpiece === null; index++) {
      const made = craft(rng, { templateId: 'item_kiem-mot-tay', material: 'thep-tot', smith, workshop, year: 1390, extraWeeks: 4 });
      if (made !== null && made.quality.named) masterpiece = made;
    }
    expect(masterpiece).not.toBeNull();
    expect(masterpiece?.made[0]?.history.length).toBeGreaterThan(0);

    const batch = craft(rng, {
      templateId: 'item_kiem-mot-tay',
      material: 'thep',
      smith,
      workshop,
      year: 1390,
      batch: 40,
    });
    expect(batch).not.toBeNull();
    expect(batch?.made.length).toBe(40);
    expect(batch?.quality.level).toBeLessThanOrEqual(2);
  });

  it('THANG GIÁ CỦA MỤC 12: một bộ giáp tấm đầy đủ bằng cả đời mấy chục nông dân', () => {
    const dagger = newItem('item_dao-gam');
    const harness = newItem('item_giap-tam');
    const warhorse = newItem('item_ngua-chien');

    printTable('MỤC 12 — thang giá, quy ra SỐ NĂM thu nhập của một nông dân tự do', [
      ['món', 'giá', 'bằng bao nhiêu năm của một nông dân'],
      ['dao găm', String(valueOf(dagger)), String(valueInPeasantYears(dagger))],
      ['ngựa chiến', String(valueOf(warhorse)), String(valueInPeasantYears(warhorse))],
      ['bộ giáp tấm đầy đủ', String(valueOf(harness)), String(valueInPeasantYears(harness))],
    ]);

    expect(valueInPeasantYears(dagger)).toBeLessThan(1);
    expect(valueInPeasantYears(harness)).toBeGreaterThan(50);
  });
});

describe('huy hiệu (mục 13)', () => {
  it('có huy hiệu thì bị bắt sống để đòi tiền; giáp đắt mà không huy hiệu thì bị coi là cướp', () => {
    const harness = newItem('item_giap-tam', { id: 'it_1' });
    const surcoat = stampDevice(newItem('item_ao-choang-len', { id: 'it_2' }), 'npc_ta', 'sư tử vàng trên nền đỏ');

    const known = recognitionOf([harness, surcoat]);
    expect(known.recognised).toBe(true);
    expect(known.captureBonus).toBeGreaterThan(0);
    expect(known.killBonus).toBe(0);

    const anonymous = recognitionOf([harness]);
    expect(anonymous.recognised).toBe(false);
    expect(anonymous.killBonus).toBeGreaterThan(0);
    console.log(`\nMỤC 13 — ${anonymous.lines.join(' ')}`);
  });
});

describe('vũ khí bạc (mục 6, Phần 14b mục D)', () => {
  it('đánh dấu được vết do bạc gây ra, và bạc thì yếu về cơ học', () => {
    const silver = strikeOf(wornWeapon('item_kiem-mot-tay', { material: 'bac' }), { tags: ['chem'] });
    const steel = strikeOf(wornWeapon('item_kiem-mot-tay', { material: 'thep' }), { tags: ['chem'] });

    expect(silver?.silver).toBe(true);
    expect(steel?.silver).toBe(false);
    // Yếu về cơ học là cái giá phải trả, và nó phải là một con số.
    expect(silver?.power ?? 0).toBeLessThan(steel?.power ?? 0);
  });
});
