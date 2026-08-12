/**
 * BÀI TEST CỦA PHẦN 9 MỤC 12.
 *
 * Bài số 10 — hiệp sĩ giáp tấm đấu tay kiếm không giáp nhưng kỹ năng cao hơn 20
 * điểm, chạy 200 trận — là bài quan trọng nhất, và nó gác đúng thứ mà mục 7 nói
 * là CHỦ Ý THIẾT KẾ: "chọn sai vũ khí trước một đối thủ mặc giáp tấm thì gần như
 * không thắng nổi". Nếu bài này ra 50/50 thì quy tắc giáp đã bị rút thành một
 * con số phòng thủ, và README mục 8.5 nói đó là lúc cả cơ chế đâm khe hở của
 * Phần 9 và cả nhánh nửa kiếm của Phần 8 mất nghĩa cùng lúc.
 *
 * Bài in RA BẢNG TỶ LỆ để người cân bằng đọc, không chỉ trả về một chữ "pass" —
 * cùng lý do với bài 200 lượt luyện kiếm của Phần 8.
 *
 * Những bài còn lại gác các luật cứng của các mục khác: ma trận tra được hai
 * chiều, tầm với thật sự quyết định, thế trận và thể lực đi qua registry của
 * Phần 5, thương tích đi thẳng qua Phần 7 (không có thanh máu riêng), sáu loại
 * hình có sáu cửa ra khác nhau, và biên niên nén lại vẫn giữ khúc ngoặt.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { createRng } from '@/core/rng';
import { registerGameSlices } from '@/state/register';
import { createInitialState } from '@/state/store';
import type { GameState } from '@/state/slices';
import { collectModifiers, resetModifierSources } from '@/systems/check';
import { registerCharacterSources } from '@/systems/character';
import { carry, type CarriedGear } from '@/systems/character/gear';
import { emptyStatBlock, type StatBlock } from '@/systems/character/stats';
import { registerBodySources } from '@/systems/body/modifiers';
import { registerSkillSources } from '@/systems/skills/modifiers';
import { compressChronicle } from '@/systems/combat/chronicle';
import { NARRATION_RULES, auditNarrative, narrationPrompt, renderChronicle } from '@/systems/combat/narrate';
import {
  ARCHETYPES,
  DEFAULT_DOCTRINE,
  applyDoctrine,
  arcOf,
  armorAt,
  autoDuel,
  buildChronicle,
  createDuel,
  distance,
  engineChoice,
  gapsOf,
  kindOf,
  matchup,
  parseDoctrine,
  preHitArmor,
  registerDuelSources,
  requestDoctrine,
  resolveAction,
  resolveNodeAction,
  runRound,
  threatenedCells,
  usableActions,
  type Doctrine,
  type DuelState,
  type Fighter,
  type FighterSpec,
  type ResolvedAction,
} from './index';

registerGameSlices();

const HALF_SWORD = 'node_kiem-thuat_nua-kiem';

beforeEach(() => {
  resetModifierSources();
  registerCharacterSources();
  registerBodySources();
  registerSkillSources();
  registerDuelSources();
});

// ---------------------------------------------------------------------------
// Bộ dựng đấu sĩ
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

const PLATE = ['item_kiem-dai', 'item_giap-tam', 'item_mu-tru', 'item_gang-sat', 'item_ghet-sat'];

function knight(doctrine?: Doctrine): FighterSpec {
  return {
    id: 'npc_hiep-si',
    name: 'Hiệp sĩ giáp tấm',
    description: 'một khối thép biết đi',
    stats: stats(),
    skills: { 'skill_kiem-thuat': 45 },
    gear: gearOf(PLATE),
    ...(doctrine === undefined ? {} : { doctrine }),
  };
}

function swordsman(nodes: readonly string[] = [], doctrine?: Doctrine): FighterSpec {
  return {
    id: 'npc_tay-kiem',
    name: 'Tay kiếm không giáp',
    description: 'áo vải, chân trần, và hai mươi năm cầm kiếm',
    stats: stats(),
    skills: { 'skill_kiem-thuat': 65 },
    gear: gearOf(['item_kiem-dai']),
    nodes: [...nodes],
    ...(doctrine === undefined ? {} : { doctrine }),
  };
}

interface SeriesResult {
  knightWins: number;
  swordsmanWins: number;
  draws: number;
  rounds: number[];
  endings: Record<string, number>;
}

function runSeries(count: number, nodes: readonly string[], kindId = 'dau-sinh-tu'): SeriesResult {
  const result: SeriesResult = { knightWins: 0, swordsmanWins: 0, draws: 0, rounds: [], endings: {} };

  for (let index = 0; index < count; index++) {
    const rng = createRng(`phan-9-test-${String(index)}`);
    const duel = autoDuel(
      createDuel(rng, { kindId, a: knight(), b: swordsman(nodes), arenaId: 'arena_san-dau' }),
      rng,
    );

    if (duel.winner === 'a') result.knightWins += 1;
    else if (duel.winner === 'b') result.swordsmanWins += 1;
    else result.draws += 1;

    result.rounds.push(duel.rounds.length);
    result.endings[duel.ending] = (result.endings[duel.ending] ?? 0) + 1;
  }
  return result;
}

/**
 * Một `Fighter` thật từ một hồ sơ — dựng qua chính `createDuel` chứ không nặn
 * tay, để test không bao giờ đo một cấu trúc mà engine không dùng.
 */
function fighterFrom(spec: FighterSpec): Fighter {
  return createDuel(createRng('fighter'), {
    kindId: 'dau-sinh-tu',
    a: spec,
    b: spec,
    arenaId: 'arena_san-dau',
  }).a;
}

function average(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function pct(part: number, total: number): string {
  return `${((part / total) * 100).toFixed(1)}%`;
}

// ---------------------------------------------------------------------------
// 1. Lưới, hướng mặt, tầm với (mục 2)
// ---------------------------------------------------------------------------

describe('đấu trường', () => {
  it('sinh đúng kích thước theo địa điểm, và cầu hẹp thì hẹp thật', () => {
    const rng = createRng('arena');
    const hall = createDuel(rng, { kindId: 'dau-danh-du', a: knight(), b: swordsman(), arenaId: 'arena_dai-sanh' });
    const bridge = createDuel(rng, { kindId: 'dau-danh-du', a: knight(), b: swordsman(), arenaId: 'arena_cau-hep' });

    expect(hall.arena.width).toBe(7);
    expect(hall.arena.height).toBe(7);
    expect(bridge.arena.width).toBe(3);
    expect(bridge.arena.height).toBe(9);
  });

  it('đánh vào sườn và sau lưng là hai cung khác nhau', () => {
    // Người phòng thủ ở (2,2) quay mặt về hướng bắc (0).
    expect(arcOf({ x: 2, y: 2 }, 0, { x: 2, y: 0 })).toBe('front');
    expect(arcOf({ x: 2, y: 2 }, 0, { x: 4, y: 2 })).toBe('flank');
    expect(arcOf({ x: 2, y: 2 }, 0, { x: 2, y: 4 })).toBe('back');
  });

  it('tầm với quyết định ô nào bị đe dọa — giáo dài khống chế xa hơn dao găm', () => {
    const rng = createRng('reach');
    const duel = createDuel(rng, { kindId: 'dau-sinh-tu', a: knight(), b: swordsman(), arenaId: 'arena_san-dau' });

    const spear = threatenedCells(duel.arena, { x: 4, y: 4 }, { min: 2, max: 3 });
    const dagger = threatenedCells(duel.arena, { x: 4, y: 4 }, { min: 0, max: 1 });

    expect(spear.length).toBeGreaterThan(dagger.length);
    // Cây thương KHÔNG với được ô kề sát: đó là toàn bộ điểm yếu của nó.
    expect(spear.some((cell) => distance(cell, { x: 4, y: 4 }) === 1)).toBe(false);
    expect(dagger.every((cell) => distance(cell, { x: 4, y: 4 }) === 1)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2. Ma trận tương khắc (mục 5)
// ---------------------------------------------------------------------------

describe('ma trận tương khắc', () => {
  it('đâm gặp chém thì đâm được cộng, và tra được cả hai chiều', () => {
    const forward = matchup(['tan-cong', 'dam'], ['tan-cong', 'chem']);
    expect(forward.a.mod).toBe(4);

    const backward = matchup(['tan-cong', 'chem'], ['tan-cong', 'dam']);
    expect(backward.b.mod).toBe(4);
  });

  it('đỡ cứng thua mũi đâm nhưng chặn được đường chém — và người đỡ tốn sức', () => {
    const versusThrust = matchup(['phong-thu', 'do-cung'], ['tan-cong', 'dam']);
    expect(versusThrust.a.mod).toBeLessThan(0);

    const versusCut = matchup(['phong-thu', 'do-cung'], ['tan-cong', 'chem']);
    expect(versusCut.b.mod).toBeLessThan(0);
    expect(versusCut.a.staminaExtra).toBeGreaterThan(0);
  });

  it('giả đòn ăn đòn thủ nhưng bị đòn thật phủ đầu', () => {
    const versusGuard = matchup(['tan-cong', 'gia-don'], ['phong-thu', 'do-cung']);
    expect(versusGuard.a.mod).toBe(6);
    expect(versusGuard.a.tempoExtra).toBe(1);

    const versusReal = matchup(['tan-cong', 'gia-don'], ['tan-cong', 'chem']);
    expect(versusReal.a.mod).toBeLessThan(0);
  });

  it('bước lùi làm đòn tới hụt lực, nhưng người lùi mất thế', () => {
    const pair = matchup(['di-chuyen', 'lui'], ['tan-cong', 'chem']);
    expect(pair.a.incomingSeverity).toBe(-1);
    expect(pair.a.tempoExtra).toBe(-1);
  });
});

// ---------------------------------------------------------------------------
// 3. Quy tắc giáp (mục 7)
// ---------------------------------------------------------------------------

describe('quy tắc giáp', () => {
  it('giáp tấm vẫn chừa nách, bẹn và khe cổ — chứ không phải một khối kín', () => {
    const plate = fighterFrom(knight()).loadout;
    const gaps = gapsOf(plate);

    expect(plate.heaviest.plate).toBe(true);
    expect(gaps).toContain('shoulderL');
    expect(gaps).toContain('hips');
    expect(gaps.length).toBeGreaterThan(0);
    // Ngực thì kín.
    expect(armorAt(plate, 'chest').armorClass.rank).toBeGreaterThan(0);
  });

  it('đâm nhắm khe giáp khó hơn hẳn, và nửa kiếm gỡ phần lớn mức phạt', () => {
    const plate = fighterFrom(knight()).loadout;
    const swordArm = fighterFrom(swordsman([HALF_SWORD]));
    const daggerArm = fighterFrom({ ...swordsman(), gear: gearOf(['item_dao-gam']) });
    const options = { blunted: false };

    const plain = resolveAction(swordArm, 'dam', options);
    expect(plain).not.toBeNull();
    // Đâm bừa vào tấm ngực: dễ trúng như thường — chỉ vô dụng.
    expect(preHitArmor(plain as ResolvedAction, plate).mod).toBe(0);

    const seeking = resolveAction(daggerArm, 'dam', options);
    expect(seeking).not.toBeNull();
    expect((seeking as ResolvedAction).targetsGaps).toBe(true);
    const seekingMod = preHitArmor(seeking as ResolvedAction, plate).mod;
    expect(seekingMod).toBeLessThan(0);

    const half = resolveNodeAction(swordArm, HALF_SWORD, options);
    expect(half).not.toBeNull();
    expect((half as ResolvedAction).armorPiercing).toBe(true);
    expect(preHitArmor(half as ResolvedAction, plate).mod).toBeGreaterThan(seekingMod);
  });
});

// ---------------------------------------------------------------------------
// 4. Nối vào registry của Phần 5 (mục 12.3)
// ---------------------------------------------------------------------------

describe('nối vào Phần 5', () => {
  it('thế trận, thể lực và tương khắc hiện thành dòng modifier đọc được', () => {
    const rng = createRng('modifiers');
    let duel = createDuel(rng, { kindId: 'dau-sinh-tu', a: knight(), b: swordsman(), arenaId: 'arena_san-dau' });

    // Ép hai người sát nhau rồi cho cả hai cùng đánh: chắc chắn có một pha va chạm.
    duel = { ...duel, a: { ...duel.a, pos: { x: 4, y: 4 }, tempo: 3, stamina: 20 }, b: { ...duel.b, pos: { x: 4, y: 5 } } };
    const result = runRound(duel, rng, { a: { actionId: 'chem-cheo' }, b: { actionId: 'do-cung' } });

    expect(result.checks.length).toBe(2);
    const labels = result.checks.flatMap((entry) => entry.result.modifiers.map((line) => line.label));
    const sources = result.checks.flatMap((entry) => entry.result.modifiers.map((line) => line.source));

    expect(sources).toContain('duel.the-tran');
    expect(sources).toContain('duel.the-luc');
    expect(labels.some((label) => label.includes('thế trận'))).toBe(true);
  });

  it('chỉ số của miền combat.* đến từ Phần 9, không từ Phần 6', () => {
    // Phần 6 mục 10.7 cố ý im lặng ở miền `combat.*`; nếu Phần 9 cũng im lặng
    // thì một cú né sẽ không có chỉ số nào cả.
    const outcome = collectModifiers({
      domain: 'combat.ne-tranh',
      system: 'd20',
      difficulty: 'thuong',
      state: null,
      actor: 'npc_ai-do',
      tags: [],
    });
    // Không có ảnh chụp sàn đấu thì nguồn phải im lặng chứ không nổ.
    expect(outcome.failures).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 5. Thương tích đi thẳng qua Phần 7 (mục 8)
// ---------------------------------------------------------------------------

describe('thương tích', () => {
  it('không có thanh máu riêng — vết thương là Injury thật của Phần 7', () => {
    const rng = createRng('injury');
    const duel = autoDuel(
      createDuel(rng, { kindId: 'dau-sinh-tu', a: knight(), b: swordsman(), arenaId: 'arena_san-dau' }),
      rng,
    );

    const wounds = [...duel.a.body.injuries, ...duel.b.body.injuries];
    expect(wounds.length).toBeGreaterThan(0);
    for (const injury of wounds) {
      expect(injury.id).toMatch(/^inj_/u);
      expect(injury.severity).toBeGreaterThanOrEqual(1);
      expect(injury.severity).toBeLessThanOrEqual(5);
      expect(injury.regionId).not.toBe('');
      expect(injury.healProgress).toBe(0);
    }
  });

  it('vết thương của NGƯỜI CHƠI thành PatchOp cho MVU, không ghi thẳng', () => {
    const state: GameState = createInitialState('phan-9-player');
    const player: FighterSpec = { ...swordsman(), id: '', name: 'Người chơi' };

    const rng = createRng('player-ops');
    const duel = autoDuel(
      createDuel(rng, { kindId: 'dau-sinh-tu', a: knight(), b: player, arenaId: 'arena_san-dau', state, turn: 3 }),
      rng,
    );

    expect(duel.playerOps.length).toBeGreaterThan(0);
    for (const op of duel.playerOps) {
      expect(op.path.startsWith('body.') || op.path.startsWith('skills.')).toBe(true);
    }
    // State GỐC không đổi: người gọi mới là chỗ chốt vào store (R2).
    expect((state['body'] as { injuries: unknown[] }).injuries).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 6. Sáu loại hình (mục 9)
// ---------------------------------------------------------------------------

describe('loại hình quyết đấu', () => {
  it('mỗi loại có cửa ra riêng, không phải cùng một trò ba cái tên', () => {
    expect(kindOf('dau-tap')?.endOn).not.toContain('chet');
    expect(kindOf('dau-sinh-tu')?.endOn).not.toContain('chiu-thua');
    expect(kindOf('dau-danh-du')?.endOn).toContain('do-mau');
    expect(kindOf('phuc-kich')?.freeOpeningRound).toBe(true);
    expect(kindOf('quyet-dau-tu-phap')?.legal).toBe(true);
  });

  it('đấu tập dùng vũ khí cùn nên không ai chết', () => {
    for (let index = 0; index < 25; index++) {
      const rng = createRng(`spar-${String(index)}`);
      const duel = autoDuel(
        createDuel(rng, { kindId: 'dau-tap', a: knight(), b: swordsman(), arenaId: 'arena_san-dau' }),
        rng,
      );
      expect(duel.ending).not.toBe('chet');
      for (const injury of [...duel.a.body.injuries, ...duel.b.body.injuries]) {
        expect(injury.severity).toBeLessThanOrEqual(2);
      }
    }
  });

  it('phục kích: bên bị phục kích không được chọn gì ở hiệp mở màn', () => {
    const rng = createRng('ambush');
    const duel = createDuel(rng, {
      kindId: 'phuc-kich',
      a: swordsman(),
      b: knight(),
      arenaId: 'arena_ngo-hep',
    });

    // Bị phục kích thì quay lưng lại — đòn đầu tiên rơi vào cung sau (mục 2).
    expect(duel.b.facing).toBe(duel.a.facing);

    // Dù người chơi bấm gì cho bên `b`, hiệp một họ vẫn chỉ kịp xoay người.
    const round = runRound(duel, rng, { a: { actionId: 'buoc-toi' }, b: { actionId: 'chem-cheo' } });
    const ambushed = round.round.actions.find((entry) => entry.actorId === duel.b.id);
    expect(ambushed?.action).not.toBe('Chém chéo');
    expect(round.duel.log.some((line) => line.text.includes('chưa kịp quay lại'))).toBe(true);

    // Và không có đường hàng: `endOn` của phục kích không có cửa `chiu-thua`.
    expect(kindOf('phuc-kich')?.yieldAllowed).toBe(false);
  });

  it('đấu danh dự dừng ở giọt máu đầu tiên', () => {
    let stoppedAtBlood = 0;
    for (let index = 0; index < 25; index++) {
      const rng = createRng(`honour-${String(index)}`);
      const duel = autoDuel(
        createDuel(rng, { kindId: 'dau-danh-du', a: knight(), b: swordsman(), arenaId: 'arena_san-dau' }),
        rng,
      );
      if (duel.ending === 'do-mau') stoppedAtBlood += 1;
    }
    expect(stoppedAtBlood).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 7. Doctrine (mục 1)
// ---------------------------------------------------------------------------

describe('doctrine', () => {
  it('JSON hỏng thì lùi về mặc định chứ không làm chết trận đấu (R4)', () => {
    expect(parseDoctrine('không phải JSON gì cả').fellBack).toBe(true);
    expect(parseDoctrine('{"aggression": 3}').fellBack).toBe(true);

    const good = parseDoctrine('```json\n{"aggression":0.9,"favoredActions":["đâm"]}\n```');
    expect(good.fellBack).toBe(false);
    expect(good.doctrine.aggression).toBe(0.9);
  });

  it('gọi LLM tối đa ba lần: một lúc vào trận, hai ở khúc ngoặt', () => {
    const rng = createRng('llm-budget');
    const base = createDuel(rng, { kindId: 'dau-sinh-tu', a: knight(), b: swordsman(), arenaId: 'arena_san-dau' });

    // Lần đầu luôn được gọi.
    const first = requestDoctrine(base, 'a');
    expect(first).not.toBeNull();
    expect(first?.system).toContain('JSON');

    const after = applyDoctrine(base, 'a', '{"aggression":0.9,"honor":0.1,"favoredActions":["đâm"]}');
    expect(after.issue).toBe('');
    expect(after.duel.a.doctrine.aggression).toBe(0.9);
    // Đòn ruột khai bằng tiếng Việt có dấu phải đổi được sang id (mục 1).
    expect(after.duel.a.doctrine.favoredActions).toContain('dam');

    // Lần thứ hai KHÔNG được gọi khi chưa có khúc ngoặt nào.
    expect(requestDoctrine(after.duel, 'a')).toBeNull();

    // Sắp thua thì được gọi lại — nhưng trần cứng vẫn chặn ở lần thứ ba.
    let hurt = { ...after.duel, a: { ...after.duel.a, stamina: 10 } };
    expect(requestDoctrine(hurt, 'a')).not.toBeNull();
    hurt = applyDoctrine(hurt, 'a', 'rác').duel;
    hurt = applyDoctrine(hurt, 'a', 'rác').duel;
    expect(hurt.llmCalls).toBe(3);
    expect(requestDoctrine(hurt, 'a')).toBeNull();
  });

  it('câu trả lời hỏng vẫn đếm một lượt gọi, và trận đấu chạy tiếp (R4)', () => {
    const rng = createRng('llm-junk');
    const base = createDuel(rng, { kindId: 'dau-sinh-tu', a: knight(), b: swordsman(), arenaId: 'arena_san-dau' });
    const after = applyDoctrine(base, 'b', 'xin lỗi, tôi không thể giúp việc đó');

    expect(after.issue).not.toBe('');
    expect(after.duel.llmCalls).toBe(1);
    expect(after.duel.b.doctrine).toEqual({ ...DEFAULT_DOCTRINE, favoredActions: [] });
    expect(autoDuel(after.duel, rng).finished).toBe(true);
  });

  it('người danh dự cao không bao giờ hất cát vào mắt', () => {
    const rng = createRng('honour-choice');
    const base = createDuel(rng, {
      kindId: 'dau-sinh-tu',
      a: knight(ARCHETYPES['hiep-si']),
      b: swordsman([], ARCHETYPES['choi-ban']),
      arenaId: 'arena_san-dau',
    });
    // Kéo hai người sát nhau: hất cát cần cự ly gần, nên phải bấm được thì phép đo mới có nghĩa.
    const duel: DuelState = {
      ...base,
      a: { ...base.a, pos: { x: 4, y: 4 } },
      b: { ...base.b, pos: { x: 4, y: 5 } },
    };

    const usable = usableActions(duel.b, duel.a, 1, { blunted: false });
    expect(usable.some((action) => action.actionId === 'hat-cat')).toBe(true);

    let knightSand = 0;
    let scoundrelSand = 0;
    for (let index = 0; index < 80; index++) {
      const roll = createRng(`sand-${String(index)}`);
      if (engineChoice(duel, 'a', roll).actionId === 'hat-cat') knightSand += 1;
      if (engineChoice(duel, 'b', roll).actionId === 'hat-cat') scoundrelSand += 1;
    }

    expect(knightSand).toBe(0);
    expect(scoundrelSand).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 8. Biên niên (mục 10)
// ---------------------------------------------------------------------------

describe('biên niên', () => {
  it('nén thì giữ hiệp có highlight và gộp những hiệp nhạt', () => {
    const rng = createRng('chronicle');
    const duel = autoDuel(
      createDuel(rng, { kindId: 'dau-sinh-tu', a: knight(), b: swordsman(), arenaId: 'arena_san-dau' }),
      rng,
    );

    const chronicle = buildChronicle(duel);
    const compact = compressChronicle(chronicle, { maxRounds: 3 });

    expect(chronicle.participants).toHaveLength(2);
    expect(chronicle.outcome.ending).not.toBe('');
    if (chronicle.rounds.length > 3) {
      expect(compact.keptRounds).toBeLessThanOrEqual(3);
      const highlights = chronicle.rounds.filter((round) => round.highlight !== undefined);
      const kept = new Set(
        compact.entries.filter((entry) => entry.kind === 'round').map((entry) => entry.round.n),
      );
      // Hiệp có khúc ngoặt phải sống sót qua phép nén — trừ khi có quá nhiều.
      if (highlights.length > 0 && highlights.length <= 3) {
        for (const round of highlights) expect(kept.has(round.n)).toBe(true);
      }
    }

    const text = renderChronicle(compact);
    expect(text).toContain('DIỄN BIẾN CƠ HỌC');
    expect(text).toContain('KẾT CỤC');
  });

  it('in ra đúng thứ sẽ gửi cho AI viết diễn biến (mục 13)', () => {
    // Mục 13 đòi đưa ra một bản diễn biến và xem AI có bịa thêm gì không. Bản
    // AI viết thì chỉ có khi có proxy; thứ KIỂM ĐƯỢC mà không cần mạng là đầu
    // vào của nó — và đó mới là chỗ R1 sống hay chết: nếu biên niên đã mơ hồ thì
    // không mệnh lệnh nào cứu được.
    const rng = createRng('mau-bien-nien');
    const duel = autoDuel(
      createDuel(rng, {
        kindId: 'dau-danh-du',
        a: knight(),
        b: swordsman([HALF_SWORD]),
        arenaId: 'arena_dai-sanh',
        stakes: 'một lời lăng mạ trước mặt ba mươi người',
        setting: { place: 'đại sảnh nhà Montfort', timeOfDay: 'sau bữa tối', witnesses: 'ba mươi khách dự tiệc' },
      }),
      rng,
    );

    const prompt = narrationPrompt(compressChronicle(buildChronicle(duel), { maxRounds: 8 }));
    console.log('\n=== PHẦN 9 MỤC 13 — LỆNH GỬI CHO AI ===\n');
    console.log(prompt.system);
    console.log('\n=== BIÊN NIÊN GỬI KÈM ===\n');
    console.log(prompt.user);
    console.log('');

    // Mọi mệnh lệnh của mục 10 phải có mặt, không cái nào được rơi rụng.
    for (const rule of NARRATION_RULES) expect(prompt.system).toContain(rule);
    expect(prompt.user).toContain('KẾT CỤC');
  });

  it('hậu kiểm bắt được tình tiết AI bịa thêm', () => {
    const rng = createRng('audit');
    const duel = autoDuel(
      createDuel(rng, { kindId: 'dau-danh-du', a: knight(), b: swordsman(), arenaId: 'arena_san-dau' }),
      rng,
    );
    const chronicle = buildChronicle(duel);

    const honest = 'Hai người đo nhau một lúc lâu. Đám đông nín thở.';
    expect(auditNarrative(honest, chronicle)).toHaveLength(0);

    if (chronicle.outcome.ending !== 'chet') {
      const invented = 'Nhát cuối cùng giết chết đối thủ ngay tại chỗ.';
      const issues = auditNarrative(invented, chronicle);
      expect(issues.some((issue) => issue.kind === 'cai-chet-them')).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// 9. BÀI TEST MỤC 12.10 — 200 trận
// ---------------------------------------------------------------------------

describe('mục 12.10 — giáp tấm thắng áp đảo, trừ khi bên kia có nửa kiếm', () => {
  it('chạy 200 trận và in bảng tỷ lệ thắng', () => {
    const RUNS = 200;
    const without = runSeries(RUNS, []);
    const withHalfSword = runSeries(RUNS, [HALF_SWORD]);

    const rows = [
      ['', 'hiệp sĩ giáp tấm', 'tay kiếm (+20 kỹ năng)', 'hòa', 'số hiệp TB'],
      [
        'không có nửa kiếm',
        pct(without.knightWins, RUNS),
        pct(without.swordsmanWins, RUNS),
        pct(without.draws, RUNS),
        average(without.rounds).toFixed(1),
      ],
      [
        'CÓ node nửa kiếm',
        pct(withHalfSword.knightWins, RUNS),
        pct(withHalfSword.swordsmanWins, RUNS),
        pct(withHalfSword.draws, RUNS),
        average(withHalfSword.rounds).toFixed(1),
      ],
    ];

    const widths = rows[0]?.map((_, column) => Math.max(...rows.map((row) => (row[column] ?? '').length))) ?? [];
    const line = (row: readonly string[]): string =>
      row.map((cell, column) => cell.padEnd(widths[column] ?? cell.length)).join('  ').trimEnd();

    console.log(`\nPHẦN 9 MỤC 12.10 — ${RUNS} trận mỗi cấu hình, đấu sinh tử, sân đấu 9×9`);
    console.log(line(rows[0] ?? []));
    console.log(widths.map((width) => '─'.repeat(width)).join('  '));
    for (const row of rows.slice(1)) console.log(line(row));
    console.log(`\ncửa ra khi không có nửa kiếm: ${JSON.stringify(without.endings)}`);
    console.log(`cửa ra khi có nửa kiếm:      ${JSON.stringify(withHalfSword.endings)}\n`);

    // Người mặc giáp phải THẮNG ÁP ĐẢO khi bên kia không có lời giải.
    expect(without.knightWins / RUNS).toBeGreaterThan(0.7);
    // Nửa kiếm phải LÀ lời giải, không chỉ là một cải thiện nhỏ.
    expect(withHalfSword.swordsmanWins).toBeGreaterThan(without.swordsmanWins * 2);
    expect(withHalfSword.swordsmanWins / RUNS).toBeGreaterThan(0.4);
  });
});
