/**
 * BÀI TEST CỦA PHẦN 8 MỤC 12.
 *
 * Bài số 10 — luyện kiếm 200 lượt KHÔNG có thầy — là bài quan trọng nhất, và nó
 * gác đúng thứ mà một hệ tiến bộ dễ làm hỏng nhất: NHỊP. Một hệ mà người chơi
 * chạm 60 sau hai mươi lượt thì cả mục 8 (thầy dạy) chỉ là thủ tục; một hệ mà
 * hai trăm lượt vẫn chưa qua nổi bậc Học việc thì không ai chơi tới đó. Bài này
 * IN RA đường cong để người cân bằng đọc, chứ không chỉ trả về một chữ "pass".
 *
 * Những bài còn lại gác các luật cứng của các mục khác: thất bại dạy nhiều nhất,
 * việc quá dễ cho 0 điểm, cày một hoàn cảnh thì điểm về 0, MỌI tàn phế vĩnh viễn
 * phải mở ra một con đường mới, node bí truyền không hiện khi chưa biết, và node
 * đột phá không mua được bằng nút bấm.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { createRng } from '@/core/rng';
import { addDays } from '@/core/clock';
import type { CheckResult } from '@/core/turn';
import { applyPatch } from '@/state/mvu';
import { registerGameSlices } from '@/state/register';
import { computeDerived } from '@/state/derived';
import { permissionFor, type GameState } from '@/state/slices';
import { createInitialState } from '@/state/store';
import { collectModifiers, resetModifierSources, runCheck, type DifficultyBand } from '@/systems/check';
import { DIFFICULTY_LADDER } from '@/systems/check/difficulty';
import { permanentOf } from '@/systems/body/catalog';
import injuriesFile from '@data/injuries.json';
import { registerCharacterSources } from '@/systems/character';
import { allSkills } from '@/systems/character/skills';
import {
  allNodes,
  allTiers,
  bestTeacherFor,
  capReport,
  defaultContext,
  finishStudy,
  grantBreakthrough,
  graphOf,
  grindFactor,
  hardCap,
  learningLoad,
  levelOf,
  nodeOf,
  nodesForBodyCondition,
  nodeStatus,
  nodesForSkill,
  planStudy,
  beginStudy,
  practiceFromChecks,
  practiceThreshold,
  rawPractice,
  rememberTeacher,
  registerSkillSources,
  selfStudyCap,
  setStance,
  skillsOf,
  slowBreakdown,
  teacherConfig,
  tierName,
  tierOfLevel,
  unlockNode,
} from './index';

const SEED = 'phan-8';
const KIEM = 'skill_kiem-thuat';

registerGameSlices();

beforeEach(() => {
  resetModifierSources();
  registerCharacterSources();
  registerSkillSources();
});

// ---------------------------------------------------------------------------
// Bộ dựng state cho test
// ---------------------------------------------------------------------------

/**
 * Một nhân vật đủ để luyện kiếm: Nhanh nhẹn 14 nên trần theo chỉ số không phải
 * là thứ chặn bài test — thứ phải chặn là bậc tự học, đúng như mục 2 nói.
 */
function freshState(overrides: { agi?: number; age?: number; race?: string } = {}): GameState {
  const state = createInitialState(SEED, 'Người thử');
  const character = state['character'] as Record<string, unknown>;
  const stats = character['stats'] as Record<string, number>;
  stats['agi'] = overrides.agi ?? 14;
  const identity = character['identity'] as Record<string, unknown>;
  identity['age'] = overrides.age ?? 20;
  if (overrides.race !== undefined) identity['race'] = overrides.race;
  return state;
}

function commit(state: GameState, ops: unknown): GameState {
  const list = ops as Parameters<typeof applyPatch>[1];
  if (list.length === 0) return state;
  const result = applyPatch(state, list, { actor: 'engine' });
  if (!result.applied || result.next === null) {
    throw new Error(`op của engine bị từ chối: ${result.failures.map((entry) => entry.message).join(' | ')}`);
  }
  return result.next;
}

function setLevel(state: GameState, skillId: string, level: number): GameState {
  return commit(state, [
    { op: 'set', path: `character.skills.${skillId}.level`, to: level, reason: 'dựng test', source: 'json' },
  ]);
}

/**
 * Bậc độ khó mà một người dạy võ sẽ chọn cho học trò ở trình độ này: khó nhất
 * mà vẫn còn cửa thắng. Đây chính là chỗ mục 3 nói "tiến bộ nhanh nhất khi làm
 * việc khó" — bài test phải luyện tập như người thật thì đường cong mới có nghĩa.
 */
function bandFor(raw: number): DifficultyBand {
  let best = DIFFICULTY_LADDER[0];
  let bestGap = Number.POSITIVE_INFINITY;
  for (const row of DIFFICULTY_LADDER) {
    const target = raw + row.d100;
    if (target < 25) continue;
    const gap = Math.abs(target - 55);
    if (gap < bestGap) {
      best = row;
      bestGap = gap;
    }
  }
  return (best ?? DIFFICULTY_LADDER[1])!.band;
}

/** Tám hoàn cảnh luyện tập khác nhau — mục 3 đòi phải ĐỔI HOÀN CẢNH, không phải đợi. */
const SPARRING = [
  'san-tap',
  'dau-go',
  'tren-bun',
  'ban-dem',
  'doi-thu-cao',
  'mac-giap',
  'trong-rung',
  'sau-hanh-quan',
] as const;

/** Một buổi luyện: tung một cú, đổ điểm thực hành, trả state mới. */
function trainOnce(state: GameState, turn: number): GameState {
  const level = levelOf(state, KIEM);
  const agi = (state['character'] as { stats: Record<string, number> }).stats['agi'] ?? 10;
  const band = bandFor(level + agi * 3);

  const run = runCheck(createRng(`${SEED}::luyen::${turn}`), {
    id: 'check.luyen-kiem',
    system: 'd100',
    domain: 'skill.kiem-thuat',
    difficulty: band,
    base: level,
    state,
  });

  const outcome = practiceFromChecks(state, [run.result], turn, {
    context: SPARRING[turn % SPARRING.length] ?? 'san-tap',
  });
  return commit(state, outcome.ops);
}

// ---------------------------------------------------------------------------
// Mục 2 — bậc kỹ năng và trần
// ---------------------------------------------------------------------------

describe('mục 2 — bậc kỹ năng và trần tự học', () => {
  it('bảy bậc liền mạch, trần cứng 95', () => {
    const tiers = allTiers();
    expect(tiers).toHaveLength(7);
    expect(tiers[0]?.id).toBe('chua-biet');
    expect(tiers[tiers.length - 1]?.to).toBe(hardCap());
    expect(hardCap()).toBe(95);
    // Trần cứng khớp clamp d100 của Phần 5: luôn còn 5% thất bại (R6).
    expect(tierName(60)).toBe('Thành thạo');
    expect(tierName(61)).toBe('Lão luyện');
    expect(tierOfLevel(95).id).toBe('tong-su');
  });

  it('tự học dừng ở 60, và lý do nói thẳng là cần thầy', () => {
    expect(selfStudyCap()).toBe(60);
    const state = setLevel(freshState(), KIEM, 60);
    const report = capReport(state, KIEM);
    expect(report.cap).toBe(60);
    expect(report.binding).toBe('bac');
    expect(report.reason).toContain('Bậc thầy');
  });

  it('trần chỉ số hạ trần kỹ năng xuống (mục 2)', () => {
    // Nhanh nhẹn 5 thì không ai thành bậc thầy kiếm được, dù luyện bao lâu.
    const state = freshState({ agi: 5 });
    expect(capReport(state, KIEM).cap).toBe(40);
    expect(capReport(state, KIEM).binding).toBe('chi-so');
  });
});

// ---------------------------------------------------------------------------
// Mục 3 — thực hành
// ---------------------------------------------------------------------------

describe('mục 3 — điểm thực hành', () => {
  it('thất bại dạy nhiều nhất', () => {
    expect(rawPractice('critFail')).toBeGreaterThan(rawPractice('fail'));
    expect(rawPractice('fail')).toBeGreaterThan(rawPractice('costlySuccess'));
    expect(rawPractice('costlySuccess')).toBeGreaterThan(rawPractice('success'));
    // Đại thành công dạy nhiều hơn thành công thường, nhưng vẫn kém thất bại.
    expect(rawPractice('critSuccess')).toBeGreaterThan(rawPractice('success'));
    expect(rawPractice('critSuccess')).toBeLessThan(rawPractice('fail'));
  });

  it('việc quá dễ so với trình độ cho 0 điểm', () => {
    const state = setLevel(freshState(), KIEM, 40);
    const easy: CheckResult = {
      id: 'check.qua-de',
      system: 'd100',
      domain: 'skill.kiem-thuat',
      difficulty: 'de-dang',
      tier: 'success',
      raw: [12],
      margin: 70,
      target: 90,
      modifiers: [],
      seedUsed: 'test#0',
      narrativeHint: '',
    };
    expect(practiceFromChecks(state, [easy], 1).ops).toHaveLength(0);
  });

  it('cày mãi một hoàn cảnh thì điểm tụt về 0, đổi hoàn cảnh thì lại đầy', () => {
    const log = Array.from({ length: 9 }, (_, index) => ({ context: 'san-tap', turn: index }));
    expect(grindFactor([], 'san-tap', 9)).toBe(1);
    expect(grindFactor(log.slice(0, 3), 'san-tap', 9)).toBe(1);
    expect(grindFactor(log, 'san-tap', 9)).toBe(0);
    // Cùng sổ tay đó nhưng hoàn cảnh khác: đầy điểm.
    expect(grindFactor(log, 'trong-rung', 9)).toBe(1);
    // Và cửa sổ lượt trôi qua thì sổ cũ hết hiệu lực.
    expect(grindFactor(log, 'san-tap', 100)).toBe(1);
  });

  it('ngưỡng lũy tiến theo bình phương bậc, và tự học ở bậc Thành thạo chạy nửa tốc độ', () => {
    const state = freshState({ age: 30 });
    const soHoc = practiceThreshold(state, 10, false);
    const hocViec = practiceThreshold(state, 30, false);
    const thanhThao = practiceThreshold(state, 50, false);

    // rank² : 1 → 4 → 9, rồi bậc Thành thạo còn nhân đôi vì tự học nửa tốc độ.
    expect(hocViec).toBeGreaterThan(soHoc * 2);
    expect(thanhThao).toBeGreaterThan(hocViec * 3);
    // Có thầy thì đúng bậc đó chạy đủ tốc độ — chỗ người thầy đáng tiền.
    expect(practiceThreshold(state, 50, true)).toBe(Math.round(thanhThao / 2));
  });

  it('nhãn hoàn cảnh mặc định phân biệt được hai kiểu việc khác nhau', () => {
    const base: CheckResult = {
      id: 'c',
      system: 'd100',
      domain: 'skill.kiem-thuat',
      difficulty: 'thuong',
      tier: 'fail',
      raw: [70],
      margin: -10,
      modifiers: [],
      seedUsed: 't#0',
      narrativeHint: '',
    };
    expect(defaultContext(base, ['san-tap'])).not.toBe(defaultContext(base, ['ban-dem']));
    expect(defaultContext(base, ['a', 'b'])).toBe(defaultContext(base, ['b', 'a']));
  });
});

// ---------------------------------------------------------------------------
// Mục 5 — tải học tập
// ---------------------------------------------------------------------------

describe('mục 5 — tải học tập càng rộng càng chậm', () => {
  it('sáu ô đầu miễn phí, sau đó chậm dần', () => {
    let state = freshState({ age: 30 });
    expect(slowBreakdown(state).loadFactor).toBe(1);

    // Mười hai kỹ năng ở bậc Thành thạo: load 12, vượt 6 ô miễn phí.
    for (const skill of allSkills().slice(0, 12)) state = setLevel(state, skill.id, 45);
    expect(learningLoad(state)).toBe(12);
    expect(slowBreakdown(state).loadFactor).toBeCloseTo(1.72, 2);
  });

  it('tuổi tác và chủng tộc nhân vào, không cộng vào', () => {
    const treTuoi = slowBreakdown(freshState({ age: 20 }));
    const giaCa = slowBreakdown(freshState({ age: 62 }));
    expect(treTuoi.ageFactor).toBe(0.85);
    expect(giaCa.ageFactor).toBe(1.6);

    // Cao Tiên 600 năm: học chậm gấp ~3, đúng con số mục 5 viết ra.
    const caoTien = slowBreakdown(freshState({ race: 'race_cao-tien', age: 120 }));
    expect(caoTien.raceFactor).toBeCloseTo(2.93, 1);
    // Nhưng tuổi hiệu dụng của họ mới 14 nên vế tuổi lại rẻ — đúng cái đánh đổi
    // mà mục 5 gọi là "đòn bẩy cân bằng chủng tộc".
    expect(caoTien.ageFactor).toBe(0.85);
  });

  it('vượt ngưỡng cảnh báo thì khung tải học tập phải nói ra', () => {
    let state = freshState({ age: 50 });
    for (const skill of allSkills().slice(0, 10)) state = setLevel(state, skill.id, 45);
    const breakdown = slowBreakdown(state);
    expect(breakdown.factor).toBeGreaterThan(1.5);
    expect(breakdown.heavy).toBe(true);
  });

  it('biến phụ dựng lại đúng con số đó', () => {
    let state = freshState({ age: 30 });
    for (const skill of allSkills().slice(0, 8)) state = setLevel(state, skill.id, 45);
    const derived = computeDerived(state, { strict: false });
    expect(derived['taiHocTap']).toBe(8);
    expect(derived['heSoCham']).toBeCloseTo(slowBreakdown(state).factor, 2);
  });
});

// ---------------------------------------------------------------------------
// Mục 6 — đồ thị nhánh
// ---------------------------------------------------------------------------

describe('mục 6 — đồ thị nhánh', () => {
  it('mọi kỹ năng đều có đồ thị, không cái nào rỗng', () => {
    for (const skill of allSkills()) {
      expect(nodesForSkill(skill.id).length, skill.id).toBeGreaterThan(0);
      // Và cái nào cũng có một cửa lên bậc Tông sư.
      expect(nodesForSkill(skill.id).some((node) => node.kind === 'breakthrough'), skill.id).toBe(true);
    }
  });

  it('mọi chiêu thức và thế đều khai dùng được ở đâu (mục 9)', () => {
    for (const node of allNodes()) {
      if (node.kind !== 'technique' && node.kind !== 'stance') continue;
      expect(node.usableIn.length, node.id).toBeGreaterThan(0);
    }
  });

  it('mở node trừ đúng số điểm KN, và không mở được khi thiếu điều kiện', () => {
    let state = setLevel(freshState(), KIEM, 25);
    state = commit(state, [{ op: 'set', path: 'skills.xp', to: 20, reason: 'test', source: 'json' }]);

    // Thiếu tiên quyết: Thế treo đòi Thế thủ trước.
    expect(unlockNode(state, 'node_kiem-thuat_the-treo').blocked).toContain('cần mở trước');

    const first = unlockNode(state, 'node_kiem-thuat_the-thu');
    expect(first.blocked).toBe('');
    state = commit(state, first.ops);
    expect(skillsOf(state)?.unlockedNodes).toContain('node_kiem-thuat_the-thu');
    expect(skillsOf(state)?.xp).toBe(20 - first.cost);

    // Bây giờ thì mở được, và không mở hai lần được.
    expect(unlockNode(state, 'node_kiem-thuat_the-treo').blocked).toBe('');
    expect(unlockNode(state, 'node_kiem-thuat_the-thu').blocked).toBe('đã mở rồi');
  });

  it('node bí truyền KHÔNG hiện khi chưa biết, kể cả dạng mờ', () => {
    const state = setLevel(freshState(), KIEM, 70);
    const secret = nodeOf('node_kiem-thuat_duong-kiem-hac-hoa');
    expect(secret?.kind).toBe('secret');
    expect(nodeStatus(state, secret!)).toBe('hidden');
    expect(graphOf(state, KIEM).some((view) => view.node.id === secret?.id)).toBe(false);

    // Biết về Isolde rồi thì node hiện ra — vẫn khóa, nhưng nhìn thấy được.
    const known = commit(state, [
      {
        op: 'set',
        path: 'knowledge.known.npc_isolde-rieng-tu',
        to: { learnedTurn: 3, source: 'nghe kể ở quán trọ', confidence: 60 },
        reason: 'test',
        source: 'json',
      },
    ]);
    expect(nodeStatus(known, secret!)).toBe('locked');
    expect(graphOf(known, KIEM).some((view) => view.node.id === secret?.id)).toBe(true);
  });

  it('mọi node bí truyền đều gắn với một NPC hoặc tổ chức có thật', () => {
    for (const node of allNodes()) {
      if (node.kind !== 'secret') continue;
      expect(node.prereq.knowledge.length, node.id).toBeGreaterThan(0);
      expect(`${node.source?.npc ?? ''}${node.source?.organization ?? ''}`, node.id).not.toBe('');
    }
  });

  it('thế chỉ cộng khi đang bật, và một kỹ năng chỉ giữ một thế', () => {
    let state = setLevel(freshState(), KIEM, 30);
    state = commit(state, [{ op: 'set', path: 'skills.xp', to: 20, reason: 'test', source: 'json' }]);
    state = commit(state, unlockNode(state, 'node_kiem-thuat_the-thu').ops);

    const probe = (): number => {
      const collected = collectModifiers({
        domain: 'skill.kiem-thuat',
        system: 'd100',
        difficulty: 'thuong',
        state,
        actor: '',
        tags: ['tan-cong'],
      });
      return collected.modifiers
        .filter((line) => line.source === 'skills.the')
        .reduce((sum, line) => sum + line.value, 0);
    };

    expect(probe()).toBe(0);
    state = commit(state, setStance(state, KIEM, 'node_kiem-thuat_the-thu').ops);
    expect(probe()).toBe(8);

    // Bật thế thứ hai là tắt thế thứ nhất — không cộng dồn.
    state = commit(state, unlockNode(state, 'node_kiem-thuat_the-treo').ops);
    state = commit(state, setStance(state, KIEM, 'node_kiem-thuat_the-treo').ops);
    expect(skillsOf(state)?.activeStance[KIEM]).toBe('node_kiem-thuat_the-treo');
    expect(probe()).toBe(-5);
  });

  it('hiệu ứng node đã mở đi qua registry Phần 5 chứ không tính riêng (mục 9)', () => {
    let state = setLevel(freshState(), KIEM, 25);
    state = commit(state, [{ op: 'set', path: 'skills.xp', to: 20, reason: 'test', source: 'json' }]);
    state = commit(state, unlockNode(state, `node_kiem-thuat_co-ban`).ops);

    const collected = collectModifiers({
      domain: 'skill.kiem-thuat',
      system: 'd100',
      difficulty: 'thuong',
      state,
      actor: '',
      tags: [],
    });
    const line = collected.modifiers.find((entry) => entry.source === 'skills.nhanh');
    expect(line?.value).toBe(5);

    // Và KHÔNG áp cho một NPC khác đang tung xúc sắc.
    const npc = collectModifiers({
      domain: 'skill.kiem-thuat',
      system: 'd100',
      difficulty: 'thuong',
      state,
      actor: 'npc_khac',
      tags: [],
    });
    expect(npc.modifiers.some((entry) => entry.source === 'skills.nhanh')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Mục 7 — nghịch cảnh mở nhánh
// ---------------------------------------------------------------------------

describe('mục 7 — mọi tàn phế vĩnh viễn phải mở ra một con đường mới', () => {
  it('không tàn phế nào là ngõ cụt', () => {
    const permanents = (injuriesFile as { permanent: { id: string }[] }).permanent;
    expect(permanents.length).toBeGreaterThan(0);
    for (const entry of permanents) {
      expect(permanentOf(entry.id)).not.toBeNull();
      const opened = nodesForBodyCondition(entry.id);
      // Đây là quy tắc thiết kế BẮT BUỘC của mục 7, không phải một lời khuyên.
      expect(opened.length, `tàn phế "${entry.id}" không mở ra nhánh nào`).toBeGreaterThan(0);
    }
  });

  it('cụt tay mở nhánh kiếm tay trái, và nhánh đó khóa với người lành lặn', () => {
    const lanh = setLevel(freshState(), KIEM, 40);
    const tayTrai = nodeOf('node_kiem-thuat_tay-trai')!;
    expect(nodeStatus(lanh, tayTrai)).toBe('locked');

    const cutTay = commit(lanh, [
      {
        op: 'push',
        path: 'body.permanent',
        to: { id: 'cut-tay', regionId: 'handR', turn: 4, cause: 'một nhát rìu ở Varna' },
        reason: 'test',
        source: 'json',
      },
      { op: 'set', path: 'skills.xp', to: 20, reason: 'test', source: 'json' },
    ]);
    expect(nodeStatus(cutTay, tayTrai)).toBe('ready');
    expect(unlockNode(cutTay, tayTrai.id).blocked).toBe('');
  });

  it('mù một mắt mở nhánh cận chiến cảm giác và khóa nhánh cung dài', () => {
    const state = commit(setLevel(freshState({ agi: 14 }), 'skill_cung-no', 45), [
      {
        op: 'push',
        path: 'body.permanent',
        to: { id: 'mu-mot-mat', regionId: 'face', turn: 9, cause: 'một mũi tên chột' },
        reason: 'test',
        source: 'json',
      },
      { op: 'set', path: 'skills.xp', to: 30, reason: 'test', source: 'json' },
    ]);

    const banXa = nodeOf('node_cung-no_ban-tam-xa')!;
    expect(unlockNode(state, banXa.id).blocked).toContain('khóa vĩnh viễn');
    const camGiac = nodeOf('node_kiem-thuat_cam-giac-can-chien')!;
    expect(nodeStatus(setLevel(state, KIEM, 30), camGiac)).toBe('ready');
  });
});

// ---------------------------------------------------------------------------
// Mục 8 — thầy dạy
// ---------------------------------------------------------------------------

describe('mục 8 — thầy dạy phá trần', () => {
  function withTeacher(
    state: GameState,
    options: { level: number; attitude?: number; quality?: number; price?: { kind: string; amount?: number; detail?: string } },
  ): GameState {
    const outcome = rememberTeacher(state, {
      npcId: 'npc_isolde',
      name: 'Isolde',
      skills: [{ skillId: KIEM, level: options.level, nodes: ['node_kiem-thuat_duong-kiem-hac-hoa'] }],
      quality: options.quality ?? 3,
      attitude: options.attitude ?? 70,
      attitudeRequired: 10,
      availability: 'doanh trại Hắc Hỏa, mùa đông',
      price: {
        kind: options.price?.kind ?? 'money',
        amount: options.price?.amount ?? 0,
        detail: options.price?.detail ?? '',
      },
    });
    if (outcome.blocked !== '') throw new Error(outcome.blocked);
    return commit(state, outcome.ops);
  }

  it('thầy phải hơn trò ít nhất 15 điểm', () => {
    const state = withTeacher(setLevel(freshState(), KIEM, 60), { level: 70 });
    expect(planStudy(state, 'npc_isolde', KIEM).blocked).toContain('15 điểm');

    const gioiHon = withTeacher(setLevel(freshState(), KIEM, 60), { level: 80 });
    expect(planStudy(gioiHon, 'npc_isolde', KIEM).blocked).toBe('');
  });

  it('thầy bậc Bậc thầy nâng trần lên khỏi 60, nhưng chỉ tới trình độ thầy trừ 15', () => {
    const state = withTeacher(setLevel(freshState(), KIEM, 60), { level: 80 });
    const report = capReport(state, KIEM);
    expect(report.cap).toBe(65);
    expect(report.binding).toBe('thay');
    expect(report.reason).toContain('80');
  });

  it('một khóa học không kéo tay mơ lên sát bậc thầy — nó phá trần rồi để tự luyện tiếp', () => {
    const state = withTeacher(setLevel(freshState(), KIEM, 5), { level: 80, quality: 3 });
    const plan = planStudy(state, 'npc_isolde', KIEM);
    // Trần mà người thầy này đưa tới là 65, nhưng MỘT khóa chỉ cho vài điểm.
    expect(capReport(state, KIEM).cap).toBe(65);
    expect(plan.levels).toBe(teacherConfig().maxLevelsPerCourse);
    expect(plan.levels).toBeLessThan(65 - 5);

    // Thầy giỏi hơn thì mỗi khóa cho nhiều hơn, và nhanh hơn.
    const danhSu = withTeacher(setLevel(freshState(), KIEM, 5), { level: 80, quality: 5 });
    const better = planStudy(danhSu, 'npc_isolde', KIEM);
    expect(better.levels).toBeGreaterThan(plan.levels);
    expect(better.days / better.levels).toBeLessThan(plan.days / plan.levels);
  });

  it('học xong thì con số lên thật, và không vượt trần của chính người thầy đó', () => {
    let state = withTeacher(setLevel(freshState(), KIEM, 62), { level: 80 });
    const plan = planStudy(state, 'npc_isolde', KIEM);
    state = commit(state, beginStudy(state, plan, 1).ops);
    const done = finishStudy(state, 1 + plan.days);
    state = commit(state, done.ops);

    // Trần của thầy này là 65: từ 62 chỉ lên được 3 điểm, dù khóa hứa 5.
    expect(levelOf(state, KIEM)).toBe(65);
    expect(skillsOf(state)?.study).toBeNull();
    expect(done.lines.join(' ')).toContain('Isolde');
  });

  it('quan hệ quá nhạt thì không nhận trò', () => {
    const state = withTeacher(setLevel(freshState(), KIEM, 40), { level: 80, attitude: 5 });
    expect(bestTeacherFor(state, KIEM)).toBeNull();
    expect(planStudy(state, 'npc_isolde', KIEM).blocked).toContain('thân');
  });

  it('giá không phải tiền thì thành nghĩa vụ có hạn chót trong state', () => {
    let state = withTeacher(setLevel(freshState(), KIEM, 40), {
      level: 80,
      price: { kind: 'favor', detail: 'một ân huệ, đòi lúc nào thì tùy Isolde' },
    });
    const plan = planStudy(state, 'npc_isolde', KIEM);
    expect(plan.blocked).toBe('');
    expect(plan.days).toBeGreaterThan(7);

    state = commit(state, beginStudy(state, plan, 3).ops);
    const obligation = skillsOf(state)?.obligations[0];
    expect(obligation?.kind).toBe('favor');
    expect(obligation?.settled).toBe(false);
    expect(obligation?.dueDate).not.toBe('');
    // Tiền thì không bị trừ, vì giá đâu phải tiền.
    expect((state['character'] as { resources: { coins: number } }).resources.coins).toBe(0);
    // Và khóa học chiếm lịch: state ghi rõ đang học gì với ai.
    expect(skillsOf(state)?.study?.teacherId).toBe('npc_isolde');
  });

  it('đang theo học thì mọi việc KHÁC bị phạt, việc đang học thì không', () => {
    let state = withTeacher(setLevel(freshState(), KIEM, 40), { level: 80 });
    state = commit(state, beginStudy(state, planStudy(state, 'npc_isolde', KIEM), 3).ops);

    const probe = (domain: string): number =>
      collectModifiers({ domain, system: 'd100', difficulty: 'thuong', state, actor: '', tags: [] })
        .modifiers.filter((line) => line.source === 'skills.hoc-tap')
        .reduce((sum, line) => sum + line.value, 0);

    expect(probe('skill.kiem-thuat')).toBe(0);
    expect(probe('skill.dam-phan')).toBe(-10);
  });

  it('đột phá KHÔNG mua được bằng nút bấm, và cần đúng hoàn cảnh', () => {
    let state = withTeacher(setLevel(freshState(), KIEM, 76), { level: 95 });
    state = commit(state, [{ op: 'set', path: 'skills.xp', to: 99, reason: 'test', source: 'json' }]);

    const node = nodesForSkill(KIEM).find((entry) => entry.kind === 'breakthrough')!;
    expect(unlockNode(state, node.id).blocked).toContain('không mua được');
    expect(nodeStatus(state, node)).toBe('locked');

    // Hoàn cảnh bịa ra thì engine từ chối.
    expect(grantBreakthrough(state, KIEM, 'ngoi-thien-ba-ngay', 40).blocked).toContain('không phải');

    // Chưa đi hết con đường thường thì cũng không.
    expect(grantBreakthrough(state, KIEM, 'song-sot-tran-thua', 40).blocked).toContain('chưa mở');

    state = commit(state, unlockNode(state, 'node_kiem-thuat_co-ban').ops);
    state = commit(state, unlockNode(state, 'node_kiem-thuat_thuan-thuc').ops);

    const granted = grantBreakthrough(state, KIEM, 'song-sot-tran-thua', 40);
    expect(granted.blocked).toBe('');
    state = commit(state, granted.ops);
    expect(skillsOf(state)?.breakthroughs[KIEM]).toBe('song-sot-tran-thua');
    // Và bây giờ trần mới lên tới bậc Tông sư.
    expect(capReport(state, KIEM).cap).toBe(95);
  });
});

// ---------------------------------------------------------------------------
// Mục 10 — quyền ghi
// ---------------------------------------------------------------------------

describe('mục 10 — quyền ghi của slice skills', () => {
  it('đúng bảng của mục 10', () => {
    expect(permissionFor('skills.practicePoints.skill_kiem-thuat')).toBe('engine');
    expect(permissionFor('skills.xp')).toBe('engine');
    expect(permissionFor('skills.unlockedNodes')).toBe('engine');
    // Người chơi bấm, không phải AI.
    expect(permissionFor('skills.activeStance.skill_kiem-thuat')).toBe('engine');
    expect(permissionFor('skills.breakthroughs.skill_kiem-thuat')).toBe('engine');
    expect(permissionFor('skills.obligations')).toBe('engine');
    // Đúng hai chỗ cho AI.
    expect(permissionFor('skills.teachers.npc_isolde.attitude')).toBe('ai');
    expect(permissionFor('skills.learningGoals')).toBe('ai');
    expect(permissionFor('skills.notes')).toBe('ai');
    // Nhưng KHÔNG phải trình độ của thầy — đó là một con số vào công thức trần.
    expect(permissionFor('skills.teachers.npc_isolde.skills')).toBe('engine');
  });

  it('con số kỹ năng vẫn nằm ở slice character, không nhân bản sang đây', () => {
    expect(permissionFor('character.skills.skill_kiem-thuat.level')).toBe('engine');
    const state = setLevel(freshState(), KIEM, 33);
    expect(levelOf(state, KIEM)).toBe(33);
    expect(skillsOf(state)).not.toBeNull();
    expect(Object.keys(skillsOf(state) ?? {})).not.toContain('levels');
  });
});

// ---------------------------------------------------------------------------
// Mục 12.10 — BÀI TEST CHÍNH
// ---------------------------------------------------------------------------

describe('mục 12.10 — luyện kiếm 200 lượt', () => {
  it('không thầy thì chững đúng ở 60; có thầy thì đi tiếp', () => {
    let state = freshState({ agi: 14, age: 20 });
    const curve: { turn: number; level: number; tier: string }[] = [];
    let plateauAt = 0;

    for (let turn = 1; turn <= 200; turn++) {
      state = trainOnce(state, turn);
      const level = levelOf(state, KIEM);
      if (level >= 60 && plateauAt === 0) plateauAt = turn;
      if (turn % 10 === 0 || turn === 1) {
        curve.push({ turn, level, tier: tierName(level) });
      }
    }

    // In ĐƯỜNG CONG ra, đúng thứ mục 13 đòi nộp lại cho người ra đề.
    const lines = curve.map((row) => `lượt ${String(row.turn).padStart(3)} · ${String(row.level).padStart(2)} · ${row.tier}`);
    console.log(`\nĐƯỜNG CONG TỰ LUYỆN (không thầy)\n${lines.join('\n')}`);
    console.log(`Chững lại ở lượt ${plateauAt}. Trần: ${capReport(state, KIEM).reason}`);

    expect(levelOf(state, KIEM)).toBe(60);
    // Chững lại THẬT SỰ chứ không phải vừa vặn tới 60 ở lượt cuối.
    expect(plateauAt).toBeGreaterThan(20);
    expect(plateauAt).toBeLessThan(190);
    expect(capReport(state, KIEM).reason).toContain('tự học chỉ tới đây');

    // --- Cấp một thầy bậc Bậc thầy ------------------------------------------
    const teacher = rememberTeacher(state, {
      npcId: 'npc_isolde',
      name: 'Isolde',
      skills: [{ skillId: KIEM, level: 85 }],
      quality: 4,
      attitude: 70,
      attitudeRequired: 10,
    });
    state = commit(state, teacher.ops);
    expect(capReport(state, KIEM).cap).toBe(70);

    const after: { turn: number; level: number }[] = [];
    for (let turn = 201; turn <= 280; turn++) {
      state = trainOnce(state, turn);
      if (turn % 10 === 0) after.push({ turn, level: levelOf(state, KIEM) });
    }
    console.log(
      `\nSAU KHI CÓ THẦY (Isolde, 85 điểm)\n${after
        .map((row) => `lượt ${row.turn} · ${row.level} · ${tierName(row.level)}`)
        .join('\n')}`,
    );

    expect(levelOf(state, KIEM)).toBeGreaterThan(60);
    expect(tierOfLevel(levelOf(state, KIEM)).id).toBe('lao-luyen');
  });
});

// ---------------------------------------------------------------------------
// Lịch — hạn chót của nghĩa vụ phải là một ngày có thật
// ---------------------------------------------------------------------------

describe('cộng ngày trong lịch Julius', () => {
  it('qua tháng, qua năm, và năm nhuận', () => {
    expect(addDays({ year: 1444, month: 11, day: 15, hour: 6 }, 20)).toMatchObject({
      year: 1444,
      month: 12,
      day: 5,
    });
    expect(addDays({ year: 1444, month: 12, day: 25, hour: 6 }, 10)).toMatchObject({
      year: 1445,
      month: 1,
      day: 4,
    });
    // 1444 chia hết cho 4 → tháng Hai có 29 ngày theo lịch Julius.
    expect(addDays({ year: 1444, month: 2, day: 28, hour: 6 }, 1)).toMatchObject({ month: 2, day: 29 });
    expect(addDays({ year: 1445, month: 2, day: 28, hour: 6 }, 1)).toMatchObject({ month: 3, day: 1 });
    // Ba năm phục vụ vẫn rơi vào một ngày có thật.
    expect(addDays({ year: 1444, month: 11, day: 15, hour: 6 }, 1095).year).toBe(1447);
  });
});
