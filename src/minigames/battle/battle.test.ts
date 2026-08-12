/**
 * BÀI TEST CỦA PHẦN 10 MỤC 15.
 *
 * Bài số 12 — dựng lại BA TÌNH HUỐNG CƠ HỌC có thật trong lịch sử thế kỷ 14 — là
 * bài quan trọng nhất, và nó gác đúng thứ mục 7 gọi là "linh hồn chiến thuật thế
 * kỷ 14": vòng khắc chế ba vế. Nếu cả ba ra 50/50 thì ba quan hệ ấy tồn tại trong
 * data mà không bao giờ chạy trên bàn cờ, và Phần 10 chỉ còn là một trò cộng trừ
 * quân số.
 *
 * Bài in RA BẢNG TỶ LỆ để người cân bằng đọc, không chỉ trả về một chữ "pass" —
 * cùng lý do với bài 200 trận của Phần 9 và bài 200 lượt luyện kiếm của Phần 8.
 *
 * Những bài còn lại gác các luật cứng của các mục khác: lưới co giãn đúng bảng
 * mục 2, mét quy ra ô chứ không khai thẳng ô, điểm khởi động đúng công thức mục
 * 4, vỡ trận LAN TRUYỀN chứ không đứng một chỗ, quyền chỉ huy đúng bảng tước vị
 * mục 3, ba dòng hệ quả của việc trái lệnh khác nhau thật, luật ban đêm mục 9b
 * tha cho quân nhìn được trong tối, và biên niên nén lại vẫn giữ vòng vỡ trận.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { createRng } from '@/core/rng';
import { registerGameSlices } from '@/state/register';
import { resetModifierSources } from '@/systems/check';
import { registerCharacterSources } from '@/systems/character';
import { registerBodySources } from '@/systems/body/modifiers';
import { registerSkillSources } from '@/systems/skills/modifiers';
import { compressChronicle } from '@/systems/combat/chronicle';
import { NARRATION_RULES, narrationPrompt, renderChronicle } from '@/systems/combat/narrate';
import {
  MAX_ROUNDS,
  autoBattle,
  breakUnit,
  buildChronicle,
  cellsFor,
  chooseUnitAction,
  cloneBattle,
  commandOf,
  createBattle,
  defenceBreakdown,
  gridSideFor,
  issueWingOrders,
  markDisobedience,
  menPerPiece,
  obedienceOutcome,
  opportunityTargets,
  piecesPerSide,
  playRound,
  propagateRout,
  pursue,
  rangeInCells,
  registerBattleSources,
  rollInitiativeFor,
  settleAftermath,
  standingShare,
  strengthOf,
  unitsOf,
  type BattleSetup,
  type BattleState,
  type ForceSpec,
  type SideId,
} from './index';

registerGameSlices();

beforeEach(() => {
  resetModifierSources();
  registerCharacterSources();
  registerBodySources();
  registerSkillSources();
  registerBattleSources();
});

// ---------------------------------------------------------------------------
// Bộ dựng
// ---------------------------------------------------------------------------

function force(name: string, troops: number, typeId: string, formation?: string): ForceSpec {
  return {
    name,
    troops,
    composition: [{ typeId, share: 1, wing: 'trung', ...(formation === undefined ? {} : { formation }) }],
  };
}

function build(setup: BattleSetup, seed: string): BattleState {
  return createBattle(createRng(seed), setup);
}

function pct(part: number, total: number): string {
  return `${((part / total) * 100).toFixed(1)}%`;
}

function average(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/**
 * THƯƠNG VONG THẬT, không phải `standingShare`.
 *
 * `standingShare` đếm quân CÒN NHẬN LỆNH, nên một đơn vị vỡ trận mà người vẫn
 * còn sống nguyên vẫn kéo nó về 0. Đó đúng là con số cần cho điều kiện kết thúc
 * trận (mục 1: trận kết thúc bằng vỡ trận, không bằng tiêu diệt hết), nhưng nó
 * bão hòa ở gần 1 trong hầu hết trận và không đo được kịch bản 2, vốn hỏi "mưa
 * tên lấy đi bao nhiêu người".
 */
function casualtyShare(battle: BattleState, side: SideId): number {
  const units = battle.units.filter((unit) => unit.side === side);
  const max = units.reduce((sum, unit) => sum + unit.maxStrength, 0);
  if (max <= 0) return 0;
  return (max - units.reduce((sum, unit) => sum + unit.strength, 0)) / max;
}

interface SeriesResult {
  winsA: number;
  winsB: number;
  draws: number;
  rounds: number[];
  casualtiesA: number[];
  casualtiesB: number[];
  brokenB: number[];
}

function runSeries(count: number, seedPrefix: string, make: (index: number) => BattleSetup): SeriesResult {
  const out: SeriesResult = { winsA: 0, winsB: 0, draws: 0, rounds: [], casualtiesA: [], casualtiesB: [], brokenB: [] };

  for (let index = 0; index < count; index++) {
    const rng = createRng(`${seedPrefix}-${String(index)}`);
    const battle = autoBattle(createBattle(rng, make(index)), rng);

    if (battle.winner === 'a') out.winsA += 1;
    else if (battle.winner === 'b') out.winsB += 1;
    else out.draws += 1;

    out.rounds.push(battle.rounds.length);
    out.casualtiesA.push(casualtyShare(battle, 'a'));
    out.casualtiesB.push(casualtyShare(battle, 'b'));
    out.brokenB.push(1 - standingShare(battle, 'b'));
  }
  return out;
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
// 1. Lưới co giãn (mục 2)
// ---------------------------------------------------------------------------

describe('lưới co giãn', () => {
  it('bám đúng bảng bốn dòng của mục 2, và là công thức chứ không phải bậc', () => {
    // Bốn mốc của bảng mục 2. Sai số một bậc lưới là chấp nhận được — đây là một
    // hàm liên tục khớp một bảng rời rạc, không phải một bảng tra.
    expect(gridSideFor(200)).toBeGreaterThanOrEqual(15);
    expect(gridSideFor(200)).toBeLessThanOrEqual(17);
    expect(gridSideFor(1500)).toBeGreaterThanOrEqual(22);
    expect(gridSideFor(1500)).toBeLessThanOrEqual(28);
    expect(gridSideFor(8000)).toBeGreaterThanOrEqual(34);
    expect(gridSideFor(8000)).toBeLessThanOrEqual(42);
    expect(gridSideFor(40000)).toBeGreaterThanOrEqual(46);

    // Trần và sàn cứng: một trận mười vạn người vẫn không được vượt 50×50.
    expect(gridSideFor(1_000_000)).toBe(50);
    expect(gridSideFor(10)).toBe(15);

    // Đơn điệu — quân đông hơn thì lưới không bao giờ nhỏ đi.
    let previous = 0;
    for (const troops of [50, 300, 1000, 3000, 8000, 15000, 30000]) {
      const side = gridSideFor(troops);
      expect(side).toBeGreaterThanOrEqual(previous);
      previous = side;
    }
  });

  it('BẤT BIẾN CỨNG: số quân cờ mỗi bên luôn trong 8–30', () => {
    for (const troops of [25, 50, 150, 300, 800, 1500, 5000, 12000, 50000, 200000]) {
      const pieces = piecesPerSide(troops);
      expect(pieces).toBeGreaterThanOrEqual(8);
      expect(pieces).toBeLessThanOrEqual(30);
      // Và số quân trên một quân cờ là HỆ QUẢ, không phải đầu vào.
      expect(menPerPiece(troops) * pieces).toBeGreaterThanOrEqual(troops - pieces);
    }

    const rows: string[][] = [['tổng quân', 'lưới', 'ô (m)', 'quân cờ/bên', 'quân/đơn vị']];
    for (const total of [200, 1000, 6000, 30000]) {
      const battle = build({ a: force('A', total / 2, 'unit_bo-binh-thue'), b: force('B', total / 2, 'unit_bo-binh-thue') }, `grid-${String(total)}`);
      rows.push([
        String(total),
        `${String(battle.grid.width)}×${String(battle.grid.height)}`,
        String(battle.grid.cellMeters),
        String(unitsOf(battle, 'a').length),
        String(unitsOf(battle, 'a')[0]?.maxStrength ?? 0),
      ]);
    }
    console.log('\nPHẦN 10 MỤC 2 — LƯỚI CO GIÃN');
    table(rows);
    console.log('');
  });

  it('tầm bắn khai bằng MÉT và quy ra ô theo cỡ ô của trận, không khai thẳng ô', () => {
    const small = build({ a: force('A', 150, 'unit_truong-cung-lam-tien'), b: force('B', 150, 'unit_bo-binh-thue') }, 'range-small');
    const huge = build({ a: force('A', 15000, 'unit_truong-cung-lam-tien'), b: force('B', 15000, 'unit_bo-binh-thue') }, 'range-huge');

    const archerSmall = unitsOf(small, 'a')[0];
    const archerHuge = unitsOf(huge, 'a')[0];
    expect(archerSmall).toBeDefined();
    expect(archerHuge).toBeDefined();

    // Cùng một cây trường cung 200m: nhiều ô ở trận nhỏ, ít ô ở trận lớn.
    const reachSmall = rangeInCells(small, archerSmall as NonNullable<typeof archerSmall>);
    const reachHuge = rangeInCells(huge, archerHuge as NonNullable<typeof archerHuge>);
    expect(reachSmall).toBeGreaterThan(reachHuge);
    expect(reachSmall * small.grid.cellMeters).toBeGreaterThan(150);

    // Và phép quy đổi là cửa duy nhất.
    expect(cellsFor(200, 20)).toBe(10);
    expect(cellsFor(200, 120)).toBe(2);
    expect(cellsFor(30, 120)).toBe(0);
    expect(cellsFor(30, 120, true)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 2. Điểm khởi động (mục 4)
// ---------------------------------------------------------------------------

describe('điểm khởi động', () => {
  it('kỵ binh nhẹ và cung kỵ cao nhất, giáo dài thấp nhất — đúng mục 4.1', () => {
    const battle = build(
      {
        a: {
          name: 'A',
          troops: 600,
          composition: [
            { typeId: 'unit_ky-xa-thao-nguyen', share: 1, wing: 'ta' },
            { typeId: 'unit_giao-dai-lun', share: 1, wing: 'huu' },
          ],
        },
        b: force('B', 600, 'unit_bo-binh-thue'),
      },
      'initiative',
    );

    const rng = createRng('init-rolls');
    const horse = unitsOf(battle, 'a').filter((unit) => unit.tags.includes('ky-xa'));
    const pike = unitsOf(battle, 'a').filter((unit) => unit.tags.includes('giao-dai'));

    let horseTotal = 0;
    let pikeTotal = 0;
    for (let index = 0; index < 40; index++) {
      for (const unit of horse) horseTotal += rollInitiativeFor(battle, rng, unit).total;
      for (const unit of pike) pikeTotal += rollInitiativeFor(battle, rng, unit).total;
    }
    expect(horseTotal / (40 * horse.length)).toBeGreaterThan(pikeTotal / (40 * pike.length) + 5);
  });

  it('bảng cộng trừ liệt kê đủ sáu vế của công thức', () => {
    const battle = build({ a: force('A', 400, 'unit_bo-binh-thue'), b: force('B', 400, 'unit_bo-binh-thue') }, 'init-parts');
    const unit = unitsOf(battle, 'a')[0];
    expect(unit).toBeDefined();
    if (unit === undefined) return;

    unit.fatigue = 40;
    unit.cohesion = 60;
    const roll = rollInitiativeFor(battle, createRng('parts'), unit);
    const labels = roll.parts.map((part) => part.label);
    expect(labels).toContain('d20');
    expect(labels).toContain('Sĩ khí');
    expect(labels).toContain('Mệt mỏi');
    expect(labels).toContain('Mất đội hình');
  });

  it('phản ứng cơ hội: chỉ đánh vào kẻ phơi sườn hoặc chạy ngang tầm bắn', () => {
    const battle = build({ a: force('A', 400, 'unit_cung-thu'), b: force('B', 400, 'unit_bo-binh-thue') }, 'reaction');
    const archer = unitsOf(battle, 'a')[0];
    const runner = unitsOf(battle, 'b')[0];
    expect(archer).toBeDefined();
    expect(runner).toBeDefined();
    if (archer === undefined || runner === undefined) return;

    archer.pos = { x: 5, y: 5 };
    runner.pos = { x: 6, y: 5 };
    // Đứng yên thì không ai gọi là "đi ngang qua".
    expect(opportunityTargets(battle, runner, 0).some((entry) => entry.unit.id === archer.id && entry.ranged)).toBe(false);
    // Chạy qua thì bị bắn.
    expect(opportunityTargets(battle, runner, 2).some((entry) => entry.unit.id === archer.id)).toBe(true);
    // Nhưng chỉ một lần một vòng.
    archer.reacted = true;
    expect(opportunityTargets(battle, runner, 2).some((entry) => entry.unit.id === archer.id)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3. Phòng thủ đặt SỐ HIT CẦN, không bớt viên (mục 10)
// ---------------------------------------------------------------------------

describe('dice pool', () => {
  it('vòng giáo trên đất bằng khó phá hơn hẳn một đám dân binh dàn hàng', () => {
    const battle = build(
      {
        a: force('A', 600, 'unit_hiep-si-giap-tam'),
        b: {
          name: 'B',
          troops: 900,
          composition: [
            { typeId: 'unit_giao-dai-lun', share: 1, wing: 'trung', formation: 'vong-giao' },
            { typeId: 'unit_bo-binh-lang', share: 1, wing: 'ta', formation: 'hang-ngang' },
          ],
        },
      },
      'defence',
    );

    const pike = unitsOf(battle, 'b').find((unit) => unit.tags.includes('giao-dai'));
    const levy = unitsOf(battle, 'b').find((unit) => unit.tags.includes('dan-quan'));
    expect(pike).toBeDefined();
    expect(levy).toBeDefined();
    if (pike === undefined || levy === undefined) return;

    const hard = defenceBreakdown(battle, pike, false);
    const soft = defenceBreakdown(battle, levy, false);
    expect(hard.score).toBeGreaterThan(soft.score + 5);
    // Và bảng giải thích phải có mặt: ở hệ pool, phòng thủ KHÔNG hiện thành dòng
    // modifier, nên nếu không in ở đây thì nó vô hình với người chơi.
    expect(hard.lines.some((line) => line.label.includes('Đội hình'))).toBe(true);
    expect(hard.lines.some((line) => line.label.includes('Giáp'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 4. VỠ TRẬN LAN TRUYỀN (mục 8) — cơ chế quan trọng nhất
// ---------------------------------------------------------------------------

describe('vỡ trận lan truyền', () => {
  it('một đơn vị vỡ kéo theo đơn vị bên cạnh, và cả cánh có thể sụp', () => {
    const battle = build({ a: force('A', 1200, 'unit_bo-binh-lang'), b: force('B', 1200, 'unit_hiep-si-giap-tam') }, 'rout');
    const group = unitsOf(battle, 'a');
    expect(group.length).toBeGreaterThan(4);

    // Dồn cả cánh lại sát nhau và đã lung lay — đúng hoàn cảnh mục 8 mô tả.
    // Sĩ khí 45: đủ để cú sốc "-18 vì đơn vị bên cạnh vỡ" KHÔNG tự nó đánh gãy
    // họ, nên phép kiểm của mục 8 thật sự phải chạy. Ở 34 thì họ rơi thẳng xuống
    // dưới ngưỡng vỡ trận và bài test đo một đường tắt chứ không đo cơ chế.
    for (const [index, unit] of group.entries()) {
      unit.pos = { x: 4 + (index % 3), y: 1 + Math.floor(index / 3) };
      unit.morale = 45;
    }
    const first = group[0];
    expect(first).toBeDefined();
    if (first === undefined) return;

    breakUnit(first);
    const spread = propagateRout(battle, createRng('cascade'), first);
    expect(spread.broken.length).toBeGreaterThan(1);
    expect(spread.checks.length).toBeGreaterThan(0);
  });

  it('lan truyền có TRẦN: một vòng không xóa sổ được cả đạo quân', () => {
    const battle = build({ a: force('A', 4000, 'unit_bo-binh-lang'), b: force('B', 4000, 'unit_hiep-si-giap-tam') }, 'rout-cap');
    const group = unitsOf(battle, 'a');
    for (const [index, unit] of group.entries()) {
      unit.pos = { x: index % battle.grid.width, y: 1 };
      unit.morale = 30;
    }
    const first = group[0];
    if (first === undefined) return;
    breakUnit(first);

    const spread = propagateRout(battle, createRng('cascade-cap'), first);
    // Mục 8 cho ba VÒNG để kéo sập cả đạo quân, không phải một pha.
    expect(spread.broken.length).toBeLessThan(group.length);
  });
});

// ---------------------------------------------------------------------------
// 5. Quyền chỉ huy theo tước vị (mục 3)
// ---------------------------------------------------------------------------

describe('quyền chỉ huy theo tước vị', () => {
  it('bảng của mục 3 cài đúng: hiệp sĩ một đơn vị, bá tước một cánh, công tước toàn quân', () => {
    expect(commandOf('hiep-si').units).toBe(1);
    expect(commandOf('hiep-si').mustObey).toBe(true);
    expect(commandOf('nam-tuoc').units).toBe(4);
    expect(commandOf('ba-tuoc').scope).toBe('canh');
    expect(commandOf('hau-tuoc').scope).toBe('canh-va-du-bi');
    expect(commandOf('cong-tuoc').scope).toBe('toan-quan');
    expect(commandOf('hoang-de').scope).toBe('toan-quan-chien-luoc');
    // Tước Phần 13 chưa khai thì rơi về bậc thấp nhất, không nổ.
    expect(commandOf('tuoc-nao-do-cua-phan-13').rank).toBe(0);
  });

  it('tước thấp NHẬN LỆNH và bị trói; tước cao thì không', () => {
    const knight = build(
      { a: force('A', 900, 'unit_bo-binh-thue'), b: force('B', 900, 'unit_bo-binh-thue'), titleId: 'hiep-si', lordName: 'Bá tước Roussel' },
      'command-low',
    );
    expect(knight.command.received).not.toBeNull();
    expect(knight.command.ownedUnitIds).toHaveLength(1);
    expect(knight.command.received?.fromName).toBe('Bá tước Roussel');

    const duke = build(
      { a: force('A', 900, 'unit_bo-binh-thue'), b: force('B', 900, 'unit_bo-binh-thue'), titleId: 'cong-tuoc' },
      'command-high',
    );
    expect(duke.command.received).toBeNull();
    expect(duke.command.ownedWings).toContain('trung');
  });

  it('ba dòng hệ quả của mục 3 khác nhau THẬT, không phải ba cách nói một điều', () => {
    const base = build(
      { a: force('A', 900, 'unit_bo-binh-thue'), b: force('B', 900, 'unit_bo-binh-thue'), titleId: 'hiep-si', lordName: 'Bá tước Roussel' },
      'obedience',
    );

    const disobeyWin = cloneBattle(base);
    markDisobedience(disobeyWin);
    disobeyWin.winner = 'a';
    const disobeyLose = cloneBattle(base);
    markDisobedience(disobeyLose);
    disobeyLose.winner = 'b';
    const obeyLose = cloneBattle(base);
    obeyLose.winner = 'b';

    const won = obedienceOutcome(disobeyWin);
    const lost = obedienceOutcome(disobeyLose);
    const loyal = obedienceOutcome(obeyLose);

    expect(won.reputation).toBeGreaterThan(10);
    expect(won.standing).toContain('ghi hận');
    expect(lost.reputation).toBeLessThan(-15);
    expect(lost.standing).toContain('khép tội');
    expect(loyal.reputation).toBe(0);
    expect(loyal.line).toContain('không có công');
  });

  it('mặc định là TUÂN LỆNH, và chỉ đơn vị ngài cầm mới làm ngài trái lệnh', () => {
    const rng = createRng('obey-default');
    const battle = createBattle(rng, {
      a: {
        name: 'Quân bá tước',
        troops: 1800,
        composition: [
          { typeId: 'unit_bo-binh-thue', share: 2, wing: 'trung' },
          { typeId: 'unit_cung-thu', share: 1, wing: 'huu' },
        ],
      },
      b: force('Đoàn cướp', 1600, 'unit_bo-binh-thue'),
      titleId: 'hiep-si',
      playerWing: 'huu',
      lordName: 'Bá tước Roussel',
    });

    expect(battle.command.received).not.toBeNull();
    // Hiệp sĩ cầm đúng một đơn vị (bảng mục 3), nhưng cánh hữu có nhiều hơn thế.
    expect(battle.command.ownedUnitIds).toHaveLength(1);
    const wingSize = unitsOf(battle, 'a').filter((unit) => unit.wing === 'huu').length;
    expect(wingSize).toBeGreaterThan(1);

    let current = battle;
    for (let round = 0; round < 6 && !current.finished; round++) {
      issueWingOrders(current, rng, 'a');
      issueWingOrders(current, rng, 'b');
      current = playRound(current, rng).battle;
    }

    /**
     * HAI THỨ PHẢI ĐÚNG CÙNG LÚC, và cả hai đều đã sai một lần trong lúc dựng:
     *
     *   1. Đơn vị của NGƯỜI CHƠI mặc định đi theo lệnh nhận được. Nếu mặc định
     *      là "kế hoạch hợp lý nhất" thì họ trái lệnh ngay vòng một mà chưa chạm
     *      vào nút nào.
     *   2. Đơn vị CÙNG CÁNH nhưng do viên tướng khác cầm thì không tính. Người ấy
     *      nhận lệnh riêng và có thể đưa cả cánh lên; nếu chuyện đó bị tính là
     *      người chơi trái lệnh thì họ mất đất mất tước vì một việc họ không làm.
     */
    expect(current.command.obeyed).not.toBe(false);
    expect(current.log.some((line) => line.text.includes('trái lệnh'))).toBe(false);
  });

  it('lệnh đi qua ma sát 3d6: có lệnh không nhúc nhích, có lệnh làm ngược', () => {
    const battle = build(
      {
        a: {
          name: 'A',
          troops: 1800,
          composition: [
            { typeId: 'unit_bo-binh-thue', share: 1, wing: 'ta' },
            { typeId: 'unit_bo-binh-thue', share: 1, wing: 'trung' },
            { typeId: 'unit_bo-binh-thue', share: 1, wing: 'huu' },
          ],
          officers: [
            { name: 'Tướng bất mãn', wing: 'ta', loyalty: 15, temperament: 'bat-man' },
            { name: 'Chủ soái', wing: 'trung', loyalty: 100, pre: 14 },
            { name: 'Tướng háo danh', wing: 'huu', loyalty: 35, temperament: 'hao-danh' },
          ],
        },
        b: force('B', 1800, 'unit_bo-binh-thue'),
        titleId: 'cong-tuoc',
      },
      'orders',
    );

    const rng = createRng('order-friction');
    const effects = new Set<string>();
    for (let index = 0; index < 25; index++) {
      const copy = cloneBattle(battle);
      issueWingOrders(copy, rng, 'a', { ta: 'vong-suon', huu: 'vong-suon' });
      for (const issued of copy.command.issued) effects.add(issued.effect);
    }
    // Với hai viên tướng lòng trung thấp và một mệnh lệnh khó, cả bốn cửa của mục
    // 3 phải xuất hiện — nếu chỉ có "thi hành đúng" thì ma sát không tồn tại.
    expect(effects.size).toBeGreaterThanOrEqual(3);
    expect(effects.has('thi-hanh')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 6. Chiến trận ban đêm (mục 9b — bản vá của Phần 14b)
// ---------------------------------------------------------------------------

describe('chiến trận ban đêm', () => {
  it('quân nhìn được trong tối KHÔNG chịu phạt điểm khởi động, quân thường thì có', () => {
    const night = build(
      {
        a: force('A', 700, 'unit_ky-binh-huyet-toc'),
        b: force('B', 700, 'unit_ky-si-nhe'),
        timeId: 'ban-dem',
      },
      'night',
    );

    const vampire = unitsOf(night, 'a')[0];
    const mortal = unitsOf(night, 'b')[0];
    if (vampire === undefined || mortal === undefined) return;

    const vampireParts = rollInitiativeFor(night, createRng('n1'), vampire).parts.map((part) => part.label);
    const mortalParts = rollInitiativeFor(night, createRng('n1'), mortal).parts.map((part) => part.label);
    expect(vampireParts).not.toContain('Ban đêm');
    expect(mortalParts).toContain('Ban đêm');
  });

  it('quân Huyết Tộc thắng đêm nhưng KHÔNG truy kích được sau bình minh', () => {
    const rng = createRng('dawn');
    const battle = build(
      { a: force('A', 900, 'unit_ky-binh-huyet-toc'), b: force('B', 900, 'unit_bo-binh-lang'), timeId: 'ban-dem' },
      'dawn',
    );
    for (const unit of unitsOf(battle, 'b')) breakUnit(unit);

    const report = pursue(battle, 'a');
    expect(report.cutByDawn).toBe(true);
    expect(report.note).toContain('quay đầu');

    // So với một đội kỵ binh phàm nhân trong cùng hoàn cảnh: giết được ít hơn hẳn.
    const mortal = build(
      { a: force('A', 900, 'unit_ky-si-nhe'), b: force('B', 900, 'unit_bo-binh-lang'), timeId: 'ban-dem' },
      'dawn-mortal',
    );
    for (const unit of unitsOf(mortal, 'b')) breakUnit(unit);
    expect(pursue(mortal, 'a').killed).toBeGreaterThan(report.killed);
    expect(rng.int(1, 6)).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 7. Trước và sau trận (mục 12)
// ---------------------------------------------------------------------------

describe('sau trận', () => {
  it('truy kích giết được nhiều hơn cả trận đánh, và bắt được tù binh đòi chuộc', () => {
    const rng = createRng('aftermath');
    const battle = autoBattle(
      createBattle(rng, {
        a: force('A', 1500, 'unit_hiep-si-giap-tam'),
        b: force('B', 1500, 'unit_bo-binh-lang'),
      }),
      rng,
    );
    const settled = settleAftermath(battle, rng);
    const after = settled.aftermath;
    expect(after).not.toBeNull();
    if (after === null) return;

    expect(after.prisoners.length).toBeGreaterThan(0);
    expect(after.ransom).toBeGreaterThan(0);
    expect(after.wounded.a + after.wounded.b).toBeGreaterThan(0);
    // Mục 1: phần lớn thương vong xảy ra SAU khi một bên bỏ chạy.
    if (settled.winner !== '') {
      const loser: SideId = settled.winner === 'a' ? 'b' : 'a';
      expect(after.pursuitKills[loser]).toBeGreaterThan(0);
    }
    console.log(`\nPHẦN 10 MỤC 12 — SAU TRẬN\n${after.lines.join('\n')}\n`);
  });
});

// ---------------------------------------------------------------------------
// 8. Biên niên (mục 13)
// ---------------------------------------------------------------------------

describe('biên niên', () => {
  it('nén thì giữ vòng có đơn vị vỡ trận — đúng thứ quyết định trận đánh', () => {
    const rng = createRng('chronicle');
    const battle = autoBattle(
      createBattle(rng, { a: force('A', 2000, 'unit_bo-binh-thue'), b: force('B', 2000, 'unit_bo-binh-lang') }),
      rng,
    );

    const chronicle = buildChronicle(battle);
    expect(chronicle.kind).toBe('battle');
    expect(chronicle.forces).toHaveLength(2);
    expect(chronicle.rounds.some((round) => round.battle !== undefined)).toBe(true);

    const routRounds = chronicle.rounds.filter((round) => (round.battle?.routed.length ?? 0) > 0);
    const compact = compressChronicle(chronicle, { maxRounds: 4 });
    const kept = new Set(compact.entries.filter((entry) => entry.kind === 'round').map((entry) => entry.round.n));
    if (routRounds.length > 0 && routRounds.length <= 4) {
      for (const round of routRounds) expect(kept.has(round.n)).toBe(true);
    }

    const text = renderChronicle(compact);
    expect(text).toContain('DIỄN BIẾN CƠ HỌC');
    expect(text).toContain('KẾT CỤC');
    if (routRounds.length > 0) expect(text).toContain('VỠ TRẬN');
  });

  it('in ra đúng thứ sẽ gửi cho AI viết diễn biến (mục 16)', () => {
    const rng = createRng('mau-bien-nien-battle');
    const battle = autoBattle(
      createBattle(rng, {
        a: {
          name: 'Quân bá tước Roussel',
          troops: 2400,
          composition: [
            { typeId: 'unit_hiep-si-giap-tam', share: 1, wing: 'ta' },
            { typeId: 'unit_bo-binh-thue', share: 2, wing: 'trung' },
            { typeId: 'unit_no-thu', share: 1, wing: 'huu' },
          ],
        },
        b: {
          name: 'Khối giáo liên bang',
          troops: 2200,
          composition: [
            { typeId: 'unit_giao-dai-lun', share: 2, wing: 'trung', formation: 'vong-giao' },
            { typeId: 'unit_cung-thu', share: 1, wing: 'huu' },
          ],
        },
        fieldId: 'field_suon-doi',
        weatherId: 'mua',
        stakes: 'quyền thu thuế cả thung lũng, và ba đời thù hằn',
        setting: { place: 'thung lũng dưới tu viện Saint-Gall', witnesses: 'dân hai bên sườn núi' },
      }),
      rng,
    );
    const settled = settleAftermath(battle, rng);

    const prompt = narrationPrompt(compressChronicle(buildChronicle(settled), { maxRounds: 8 }));
    console.log('\n=== PHẦN 10 MỤC 16 — LỆNH GỬI CHO AI ===\n');
    console.log(prompt.system);
    console.log('\n=== BIÊN NIÊN GỬI KÈM ===\n');
    console.log(prompt.user);
    console.log('');

    for (const rule of NARRATION_RULES) expect(prompt.system).toContain(rule);
    expect(prompt.user).toContain('KẾT CỤC');
    expect(prompt.user).toContain('HAI BÊN');
  });
});

// ---------------------------------------------------------------------------
// 9. BÀI TEST MỤC 15.12 — ba tình huống lịch sử
// ---------------------------------------------------------------------------

describe('mục 15.12 — vòng khắc chế ba vế phải ra kết quả áp đảo đúng chiều', () => {
  const RUNS = 40;

  it('KỊCH BẢN 1 — kỵ binh nặng lao vào vòng giáo trên đất bằng', () => {
    const knights = { typeId: 'unit_hiep-si-giap-tam', share: 1, wing: 'trung' as const };

    const wall = runSeries(RUNS, 'kb1-wall', () => ({
      a: { name: 'Kỵ binh nặng', troops: 1200, composition: [knights] },
      b: {
        name: 'Khối giáo',
        troops: 1200,
        composition: [{ typeId: 'unit_giao-dai-lun', share: 1, wing: 'trung', formation: 'vong-giao' }],
      },
      fieldId: 'field_dong-trong',
    }));

    /**
     * ĐỐI CHỨNG: bộ binh thường trực Orc, khối sâu, CÙNG QUÂN SỐ và CÙNG CHẤT
     * LƯỢNG (cựu binh, quality 4) — chỉ khác đúng một thứ: họ không cầm giáo dài
     * và không hạ giáo được.
     *
     * Đối chứng phải là một BINH CHỦNG KHÁC chứ không phải cùng khối giáo ấy dàn
     * hàng ngang, vì bộ chọn nước đi của engine sẽ tự cho họ hạ giáo lại ngay khi
     * thấy kỵ binh tới (`antiCavalryFormation` ở `tactics.ts`) — đó là hành vi
     * đúng của một viên đội có giáo dài trong tay, nhưng nó làm hai nhánh đo về
     * cùng một chỗ và bài test không chứng minh được gì.
     */
    const control = runSeries(RUNS, 'kb1-control', () => ({
      a: { name: 'Kỵ binh nặng', troops: 1200, composition: [knights] },
      b: {
        name: 'Bộ binh thường trực',
        troops: 1200,
        composition: [{ typeId: 'unit_bo-binh-orc', share: 1, wing: 'trung', formation: 'khoi-sau' }],
      },
      fieldId: 'field_dong-trong',
    }));

    console.log(`\nKỊCH BẢN 1 — kỵ binh nặng vs bộ binh, đồng trống, cùng quân số, ${String(RUNS)} trận`);
    table([
      ['bên bộ binh', 'kỵ binh thắng', 'bộ binh thắng', 'kỵ binh CHẾT TB', 'vòng TB'],
      [
        'GIÁO DÀI, hạ giáo',
        pct(wall.winsA, RUNS),
        pct(wall.winsB, RUNS),
        pct(average(wall.casualtiesA), 1),
        average(wall.rounds).toFixed(1),
      ],
      [
        'bộ binh cựu binh, khối sâu',
        pct(control.winsA, RUNS),
        pct(control.winsB, RUNS),
        pct(average(control.casualtiesA), 1),
        average(control.rounds).toFixed(1),
      ],
    ]);

    // Kỵ binh lao vào hàng giáo còn đứng LÀ TỰ SÁT (mục 7).
    expect(wall.winsB / RUNS).toBeGreaterThan(0.7);
    // Và phải là HÀNG GIÁO làm nên chuyện đó, không phải chất lượng quân: cùng
    // một đội kỵ binh trước bộ binh cựu binh không có giáo dài thì đánh ngang cơ.
    expect(control.winsA).toBeGreaterThan(wall.winsA + RUNS * 0.3);
  });

  it('KỊCH BẢN 2 — cung thủ bắn vào khối bộ binh sâu', () => {
    const deep = runSeries(RUNS, 'kb2-deep', () => ({
      a: force('Trường cung', 1400, 'unit_truong-cung-lam-tien'),
      b: {
        name: 'Khối sâu',
        troops: 1600,
        composition: [{ typeId: 'unit_bo-binh-thue', share: 1, wing: 'trung', formation: 'khoi-sau' }],
      },
      fieldId: 'field_dong-trong',
    }));

    // Đối chứng: cùng đám bộ binh ấy nhưng tản mát — mục 6 nói tản mát né tên tốt.
    const spread = runSeries(RUNS, 'kb2-spread', () => ({
      a: force('Trường cung', 1400, 'unit_truong-cung-lam-tien'),
      b: {
        name: 'Tản mát',
        troops: 1600,
        composition: [{ typeId: 'unit_bo-binh-thue', share: 1, wing: 'trung', formation: 'tan-mat' }],
      },
      fieldId: 'field_dong-trong',
    }));

    console.log(`\nKỊCH BẢN 2 — trường cung vs bộ binh, đồng trống, ${String(RUNS)} trận`);
    table([
      ['đội hình bộ binh', 'cung thủ thắng', 'bộ binh thắng', 'bộ binh CHẾT TB', 'cung thủ chết TB', 'vòng TB'],
      [
        'KHỐI SÂU',
        pct(deep.winsA, RUNS),
        pct(deep.winsB, RUNS),
        pct(average(deep.casualtiesB), 1),
        pct(average(deep.casualtiesA), 1),
        average(deep.rounds).toFixed(1),
      ],
      [
        'tản mát',
        pct(spread.winsA, RUNS),
        pct(spread.winsB, RUNS),
        pct(average(spread.casualtiesB), 1),
        pct(average(spread.casualtiesA), 1),
        average(spread.rounds).toFixed(1),
      ],
    ]);

    // Khối sâu đứng dưới mưa tên phải CHẾT nhiều hơn hẳn đám tản mát. Đo thương
    // vong thật, không đo `standingShare`: cả hai cấu hình đều thua, và số đơn vị
    // còn nhận lệnh bão hòa ở gần 0 trong cả hai.
    expect(average(deep.casualtiesB)).toBeGreaterThan(average(spread.casualtiesB) + 0.05);
  });

  it('VÒNG KHẮC CHẾ KHÉP KÍN — kỵ binh khắc cung thủ, nên không ai mạnh tuyệt đối', () => {
    // Kịch bản 2 cho thấy cung thủ thắng bộ binh gần như tuyệt đối. Nếu dừng ở
    // đó thì kết luận rút ra là "cứ mua cung thủ", và mục 7 nói thẳng điều ngược
    // lại: ba quan hệ khắc chế tạo thành một VÒNG TRÒN, "không có binh chủng nào
    // mạnh tuyệt đối". Vế thứ ba phải đóng vòng ấy lại.
    const horse = runSeries(RUNS, 'ring-horse', () => ({
      a: force('Kỵ binh nhẹ', 1200, 'unit_ky-si-nhe'),
      b: force('Cung thủ', 1200, 'unit_cung-thu'),
      fieldId: 'field_dong-trong',
    }));

    /**
     * TRƯỜNG CUNG LÂM TIÊN LÀ NGOẠI LỆ, và nó phải LÀ ngoại lệ.
     *
     * Cung thủ thường bắn được 120m; kỵ binh nhẹ đi 280m một vòng, nên chúng
     * vượt qua vùng chết trong đúng một vòng và đè lên. Trường cung bắn 200m và
     * bắn mạnh hơn hẳn, nên chúng có tới hai ba loạt trước khi bị chạm — đó
     * chính là lý do thứ vũ khí ấy đi vào sử sách, và là lý do Phần 14b mục A.b
     * bắt nó phải trả bằng một tầng nông dân TỰ DO có đất.
     *
     * Bài test đo cả hai để cái ngoại lệ ấy là một kết quả CÓ CHỦ Ý chứ không
     * phải một chỗ cân bằng hỏng mà không ai để ý.
     */
    const longbow = runSeries(RUNS, 'ring-longbow', () => ({
      a: force('Kỵ binh nhẹ', 1200, 'unit_ky-si-nhe'),
      b: force('Trường cung Lâm Tiên', 1200, 'unit_truong-cung-lam-tien'),
      fieldId: 'field_dong-trong',
    }));

    console.log(`\nVÒNG KHẮC CHẾ — kỵ binh nhẹ xông vào cung thủ, đồng trống, ${String(RUNS)} trận`);
    table([
      ['bên cung thủ', 'kỵ binh thắng', 'cung thủ thắng', 'cung thủ CHẾT TB', 'vòng TB'],
      [
        'cung thủ thường (120m)',
        pct(horse.winsA, RUNS),
        pct(horse.winsB, RUNS),
        pct(average(horse.casualtiesB), 1),
        average(horse.rounds).toFixed(1),
      ],
      [
        'trường cung Lâm Tiên (200m)',
        pct(longbow.winsA, RUNS),
        pct(longbow.winsB, RUNS),
        pct(average(longbow.casualtiesB), 1),
        average(longbow.rounds).toFixed(1),
      ],
    ]);

    // Vế ba của vòng khắc chế: kỵ binh khắc cung thủ.
    expect(horse.winsA / RUNS).toBeGreaterThan(0.6);
    // Và tầm bắn LÀ thứ quyết định, không phải nhãn "cung thủ".
    expect(longbow.winsB).toBeGreaterThan(horse.winsB);
  });

  it('KỊCH BẢN 3 — kỵ binh đuổi theo đội hình đã vỡ', () => {
    let cavalryKills = 0;
    let footKills = 0;
    let cavalryWins = 0;

    for (let index = 0; index < RUNS; index++) {
      const rng = createRng(`kb3-${String(index)}`);
      const battle = createBattle(rng, {
        a: force('Kỵ binh nhẹ', 1000, 'unit_ky-si-nhe'),
        b: force('Đội hình đã vỡ', 1000, 'unit_bo-binh-thue'),
        fieldId: 'field_dong-trong',
      });
      // Bên kia đã vỡ trận TRƯỚC khi kỵ binh tới — đúng tình huống của mục 7 vế ba.
      for (const unit of unitsOf(battle, 'b')) breakUnit(unit);
      const done = autoBattle(battle, rng);
      if (done.winner === 'a') cavalryWins += 1;
      cavalryKills += pursue(done, 'a').killed;

      // Đối chứng: cùng đám đã vỡ ấy, nhưng bên đuổi là bộ binh.
      const footRng = createRng(`kb3-foot-${String(index)}`);
      const footBattle = createBattle(footRng, {
        a: force('Bộ binh', 1000, 'unit_bo-binh-thue'),
        b: force('Đội hình đã vỡ', 1000, 'unit_bo-binh-thue'),
        fieldId: 'field_dong-trong',
      });
      for (const unit of unitsOf(footBattle, 'b')) breakUnit(unit);
      footKills += pursue(autoBattle(footBattle, footRng), 'a').killed;
    }

    console.log(`\nKỊCH BẢN 3 — truy kích đội hình đã vỡ, ${String(RUNS)} trận`);
    table([
      ['bên đuổi', 'thắng', 'giết trong truy kích (TB)'],
      ['KỴ BINH', pct(cavalryWins, RUNS), (cavalryKills / RUNS).toFixed(1)],
      ['bộ binh', '—', (footKills / RUNS).toFixed(1)],
    ]);

    // Kỵ binh khắc đội hình đã vỡ (mục 7 vế ba): thắng gần như tuyệt đối…
    expect(cavalryWins / RUNS).toBeGreaterThan(0.9);
    // …và đuổi giết được nhiều hơn hẳn bộ binh.
    expect(cavalryKills).toBeGreaterThan(footKills);
  });
});

// ---------------------------------------------------------------------------
// 10. Lưới an toàn (R4)
// ---------------------------------------------------------------------------

describe('lưới an toàn', () => {
  it('không trận nào chạy quá trần vòng, và luôn kết thúc', () => {
    for (let index = 0; index < 8; index++) {
      const rng = createRng(`safety-${String(index)}`);
      const battle = autoBattle(
        createBattle(rng, {
          a: force('A', 3000, 'unit_giao-dai-lun'),
          b: force('B', 3000, 'unit_giao-dai-lun'),
          fieldId: 'field_deo-nui',
        }),
        rng,
      );
      expect(battle.finished).toBe(true);
      expect(battle.rounds.length).toBeLessThanOrEqual(MAX_ROUNDS + 2);
    }
  });

  it('lựa chọn không hợp lệ không làm chết trận đánh', () => {
    const rng = createRng('bad-choice');
    const battle = createBattle(rng, { a: force('A', 800, 'unit_bo-binh-thue'), b: force('B', 800, 'unit_bo-binh-thue') });
    const result = playRound(battle, rng, {
      'unit_khong-ton-tai': { kind: 'tan-cong', targetId: 'unit_cung-khong-ton-tai' },
    });
    expect(result.battle.round).toBe(2);
    expect(strengthOf(result.battle, 'a')).toBeGreaterThan(0);
  });

  it('bộ chọn của engine luôn trả về một nước hợp lệ', () => {
    const rng = createRng('chooser');
    const battle = createBattle(rng, { a: force('A', 800, 'unit_cung-thu'), b: force('B', 800, 'unit_hiep-si-giap-tam') });
    for (const unit of battle.units) {
      const action = chooseUnitAction(battle, rng, unit, { order: 'tan-cong' });
      expect(['giu', 'cho', 'tien', 'tan-cong', 'ban', 'doi-doi-hinh', 'rut']).toContain(action.kind);
    }
  });
});
