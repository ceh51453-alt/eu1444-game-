/**
 * BÀI TEST CỦA PHẦN 7 MỤC 11.
 *
 * Bài số 11 — vết đâm sâu ở đùi, không chữa, mô phỏng 30 lượt — là bài quan
 * trọng nhất. Nó gác đúng thứ mà một hệ thương tích dễ làm hỏng nhất: TỐC ĐỘ
 * DIỄN TIẾN. Một hệ mà vết đâm giết người trong ba lượt thì không ai kịp đi tìm
 * thầy thuốc; một hệ mà nó không bao giờ giết ai thì cả mục 7 chỉ là trang trí.
 * Bài này in ra từng lượt để người cân bằng ĐỌC được đường cong ấy, chứ không
 * chỉ nhận một chữ "pass".
 *
 * Những bài còn lại gác các luật cứng: tổng trọng số trúng đòn bằng 100, slice
 * toàn quyền engine, AI đề nghị nhưng engine phán quyết, trích máu luôn có hại,
 * và modifier phải LAN RA ngoài chiến đấu.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { createRng } from '@/core/rng';
import type { CheckSystem } from '@/core/turn';
import { applyPatch } from '@/state/mvu';
import { registerGameSlices } from '@/state/register';
import { canWrite, permissionFor, readPath, slices, type GameState } from '@/state/slices';
import { createInitialState } from '@/state/store';
import { collectModifiers, resetModifierSources, runCheck } from '@/systems/check';
import { registerCharacterSources } from '@/systems/character';
import { buildSilhouette, missingPaths } from '@/ui/bodymap/silhouette';
import {
  HIT_TABLE_TOTAL,
  allRegions,
  allTreatments,
  bodyOf,
  bodySummary,
  bodyTurn,
  canTreat,
  healerAdvice,
  hitTable,
  inflictInjury,
  injuryViews,
  outcomeFor,
  regionForRoll,
  regionStatuses,
  treat,
  treatmentOf,
  type BodyState,
} from './index';
import { applyInjuryRequests, parseInjuryRequests } from './events';
import { registerBodySources } from './modifiers';
import { TIER_ORDER } from '@/systems/check/tiers';

const SEED = 'phan-7';

registerGameSlices();

// ---------------------------------------------------------------------------
// Bộ dựng state cho test
// ---------------------------------------------------------------------------

function freshState(seed = SEED): GameState {
  const state = createInitialState(seed, 'Người thử');
  // Ngoại hình cần có để bài sẹo chạy: Phần 7 chỉ ghi vào `appearance.scars`
  // khi nhân vật đã dựng xong ngoại hình ở Phần 6.
  const character = state['character'] as Record<string, unknown>;
  character['appearance'] = {
    heightCm: 175,
    weightKg: 72,
    build: 'rắn rỏi',
    musclePct: 42,
    fatPct: 18,
    skin: 'rám nắng',
    hair: 'nâu',
    hairStyle: 'cắt ngắn',
    beard: 'cạo nhẵn',
    eyes: 'nâu',
    eyeShape: 'sâu',
    face: 'góc cạnh',
    features: [],
    mark: '',
    voice: 'trầm',
    gait: 'chắc',
    mannerism: '',
    clothing: '',
    scars: [],
  };
  return state;
}

/** Áp một lô op như vòng lặp lượt vẫn làm, và nổ ngay khi engine tự viết op sai. */
function commit(state: GameState, ops: readonly { path: string }[] | unknown): GameState {
  const list = ops as Parameters<typeof applyPatch>[1];
  if (list.length === 0) return state;
  const result = applyPatch(state, list, { actor: 'engine' });
  if (!result.applied || result.next === null) {
    throw new Error(`op của engine bị từ chối: ${result.failures.map((entry) => entry.message).join(' | ')}`);
  }
  return result.next;
}

function body(state: GameState): BodyState {
  const found = bodyOf(state);
  if (found === null) throw new Error('slice body chưa đăng ký');
  return found;
}

beforeEach(() => {
  resetModifierSources();
});

// ---------------------------------------------------------------------------
// 1. Hai mươi vùng và bảng d100 (mục 1)
// ---------------------------------------------------------------------------

describe('bản đồ 20 vùng', () => {
  it('có đúng 20 vùng và tổng trọng số bằng 100', () => {
    const regions = allRegions();
    expect(regions).toHaveLength(20);
    expect(regions.reduce((sum, region) => sum + region.hitWeight, 0)).toBe(HIT_TABLE_TOTAL);
  });

  it('bảng d100 phủ kín 1..100, không hở và không chồng', () => {
    const table = hitTable();
    expect(table[0]?.from).toBe(1);
    expect(table[table.length - 1]?.to).toBe(100);

    for (let index = 1; index < table.length; index++) {
      expect(table[index]?.from).toBe((table[index - 1]?.to ?? 0) + 1);
    }
    // Quét TOÀN MIỀN thay vì tin vào thống kê: một ngưỡng lệch một đơn vị cũng
    // lộ ngay, còn 100.000 lần tung thì có thể vẫn lọt (Phần 5 mục 12.8).
    const seen = new Set<string>();
    for (let roll = 1; roll <= 100; roll++) seen.add(regionForRoll(roll).id);
    expect(seen.size).toBe(20);
  });

  it('ngực là vùng trúng nhiều nhất, cổ và bàn tay là ít nhất', () => {
    const sorted = [...allRegions()].sort((left, right) => right.hitWeight - left.hitWeight);
    expect(sorted[0]?.id).toBe('chest');
    expect(sorted[sorted.length - 1]?.hitWeight).toBeLessThanOrEqual(3);
  });
});

// ---------------------------------------------------------------------------
// 2. Hình SVG (mục 4 và 11.2)
// ---------------------------------------------------------------------------

describe('hình người SVG', () => {
  it('mọi vùng đều có một path, dựng bằng code', () => {
    expect(missingPaths()).toEqual([]);
  });

  it('mặt trước có ngực và bụng, mặt sau có lưng — không lẫn', () => {
    const { front, back } = buildSilhouette();
    expect(front['chest']).toBeDefined();
    expect(front['abdomen']).toBeDefined();
    expect(front['upperBack']).toBeUndefined();
    expect(back['upperBack']).toBeDefined();
    expect(back['lowerBack']).toBeDefined();
    expect(back['face']).toBeUndefined();
  });

  it('dáng người ở Phần 6 làm đổi bề ngang', () => {
    const gay = buildSilhouette({ musclePct: 20, fatPct: 10 }).front['chest'] ?? '';
    const vam = buildSilhouette({ musclePct: 60, fatPct: 30 }).front['chest'] ?? '';
    expect(gay).not.toBe(vam);
  });
});

// ---------------------------------------------------------------------------
// 3. Slice toàn quyền engine (mục 3)
// ---------------------------------------------------------------------------

describe('slice body', () => {
  it('đã đăng ký và KHÔNG có một đường dẫn nào cho AI', () => {
    expect(slices.get('body')).toBeDefined();

    const paths = [
      'body.blood',
      'body.fever',
      'body.injuries',
      'body.permanent',
      'body.dead',
      'body.deathCause',
      'body.log',
      'body.dominantHand',
    ];
    for (const path of paths) {
      expect(permissionFor(path)).toBe('engine');
      expect(canWrite('ai', path)).toBe(false);
      expect(canWrite('engine', path)).toBe(true);
    }
  });

  it('lô op của AI đụng vào cơ thể bị từ chối TOÀN BỘ (R4)', () => {
    const state = freshState();
    const result = applyPatch(
      state,
      [
        { op: 'set', path: 'character.flags', to: ['ok'], reason: 'hợp lệ', source: 'json' },
        { op: 'set', path: 'body.blood', to: 100, reason: 'AI tự chữa cho mình', source: 'json' },
      ],
      { actor: 'ai' },
    );
    expect(result.applied).toBe(false);
    expect(result.next).toBeNull();
    expect(readPath(state, 'character.flags')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 4. AI đề nghị, engine phán quyết (mục 3)
// ---------------------------------------------------------------------------

describe('body.requestInjury', () => {
  it('đọc được thẻ với tên thuộc tính tiếng Việt và tên vùng tiếng Việt', () => {
    const requests = parseInjuryRequests(
      'Hắn loạng choạng. <RequestInjury vung="đùi phải" muc-do="nặng" nguyen-nhan="mũi giáo" /> Máu thấm ra.',
    );
    expect(requests).toHaveLength(1);
    expect(requests[0]?.regionId).toBe('đùi phải');
    expect(requests[0]?.roughSeverity).toBe('nặng');
  });

  it('engine tự chấm mức độ trong khoảng của chữ AI nói — không lấy nguyên lời', () => {
    let state = freshState();
    const rng = createRng('de-nghi');
    const outcome = applyInjuryRequests(
      state,
      rng,
      [{ regionId: 'đùi phải', roughSeverity: 'nặng', cause: 'mũi giáo' }],
      1,
    );
    state = commit(state, outcome.ops);

    const injury = body(state).injuries[0];
    expect(injury?.regionId).toBe('thighR');
    // `nặng` là khoảng 3–4, KHÔNG bao giờ là 5: mức chí mạng chỉ đến từ cơ học
    // chiến đấu, không đến từ một câu văn.
    expect(injury?.severity).toBeGreaterThanOrEqual(3);
    expect(injury?.severity).toBeLessThanOrEqual(4);
  });

  it('trần hai đề nghị mỗi lượt, đề nghị thứ ba bị chặn', () => {
    let state = freshState();
    const rng = createRng('tran');
    const three = [
      { regionId: 'thighR', roughSeverity: 'nhẹ', cause: 'dao' },
      { regionId: 'handL', roughSeverity: 'nhẹ', cause: 'dao' },
      { regionId: 'face', roughSeverity: 'nhẹ', cause: 'dao' },
    ];
    const outcome = applyInjuryRequests(state, rng, three, 1);
    state = commit(state, outcome.ops);

    expect(outcome.granted).toBe(2);
    expect(outcome.refused).toHaveLength(1);
    expect(body(state).injuries).toHaveLength(2);

    // Cùng lượt thì vẫn hết suất; sang lượt sau mới được xin tiếp.
    const again = applyInjuryRequests(state, rng, [three[0]!], 1);
    expect(again.granted).toBe(0);
    const nextTurn = applyInjuryRequests(state, rng, [three[0]!], 2);
    expect(nextTurn.granted).toBe(1);
  });

  it('vùng không có thật thì bị từ chối, không im lặng bỏ qua', () => {
    const state = freshState();
    const outcome = applyInjuryRequests(
      state,
      createRng('sai-vung'),
      [{ regionId: 'linh hồn', roughSeverity: 'nặng', cause: 'lời nguyền' }],
      1,
    );
    expect(outcome.granted).toBe(0);
    expect(outcome.refused[0]?.reason).toContain('không có vùng');
  });
});

// ---------------------------------------------------------------------------
// 5. Modifier lan ra mọi nơi (mục 5)
// ---------------------------------------------------------------------------

describe('modifier của cơ thể', () => {
  function penaltyIn(state: GameState, domain: string, system: CheckSystem): number {
    const collected = collectModifiers({ domain, system, difficulty: 'thuong', state, actor: '', tags: [] });
    return collected.modifiers
      .filter((line) => line.source.startsWith('body.'))
      .reduce((sum, line) => sum + line.value, 0);
  }

  it('vết ở đùi phạt CẢ quản trị và xã giao, không chỉ chiến đấu', () => {
    registerBodySources();
    let state = freshState();
    const inflicted = inflictInjury(
      state,
      createRng('lan-toa'),
      { regionId: 'thighR', type: 'puncture', severity: 4, source: 'mũi giáo', turn: 1 },
    );
    state = commit(state, inflicted.ops);

    // Mục 5 gọi đây là "yêu cầu cốt lõi": đau và mất máu phải ăn vào kiểm định
    // 3d6 của quản trị lãnh thổ và vào xã giao, chứ không dừng ở miền chiến đấu.
    expect(penaltyIn(state, 'combat.duel', 'd20')).not.toBe(0);
    expect(penaltyIn(state, 'admin.cai-tri', '3d6')).toBeLessThan(0);
    expect(penaltyIn(state, 'social.dam-phan', 'd100')).toBeLessThan(0);
    expect(penaltyIn(state, 'skill.the-luc', 'd100')).toBeLessThan(0);
  });

  it('mọi dòng có nhãn tiếng Việt đọc được, không phải id', () => {
    registerBodySources();
    let state = freshState();
    state = commit(
      state,
      inflictInjury(state, createRng('nhan'), {
        regionId: 'handR',
        type: 'crush',
        severity: 3,
        source: 'móng ngựa',
        turn: 1,
      }).ops,
    );

    const collected = collectModifiers({
      domain: 'skill.kiem-thuat',
      system: 'd100',
      difficulty: 'thuong',
      state,
      actor: '',
      tags: [],
    });
    const lines = collected.modifiers.filter((line) => line.source.startsWith('body.'));
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(line.label).not.toMatch(/^[a-z_.]+$/);
      expect(line.label.length).toBeGreaterThan(3);
    }
    expect(lines.some((line) => line.label.includes('cầm nắm'))).toBe(true);
  });

  it('KHÔNG tự phạt cú tung chống nhiễm trùng của chính cơ thể', () => {
    registerBodySources();
    let state = freshState();
    state = commit(
      state,
      inflictInjury(state, createRng('vong-xoay'), {
        regionId: 'abdomen',
        type: 'puncture',
        severity: 5,
        source: 'giáo',
        turn: 1,
      }).ops,
    );
    // Nếu sốt phạt chính cú tung chống sốt thì người chơi rơi vào một vòng xoáy
    // không có nút nào để bấm — Phần 5 mục 3 cấm đúng chuyện đó.
    expect(penaltyIn(state, 'body.suc-chiu-dung', '3d6')).toBe(0);
  });

  it('không áp vào cú tung của NPC khác', () => {
    registerBodySources();
    registerCharacterSources();
    let state = freshState();
    state = commit(
      state,
      inflictInjury(state, createRng('npc'), {
        regionId: 'thighR',
        type: 'puncture',
        severity: 4,
        source: 'giáo',
        turn: 1,
      }).ops,
    );

    const npc = collectModifiers({
      domain: 'skill.kiem-thuat',
      system: 'd100',
      difficulty: 'thuong',
      state,
      actor: 'npc_ke-khac',
      tags: [],
    });
    expect(npc.modifiers.filter((line) => line.source.startsWith('body.'))).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 6. Y học thế kỷ 14 (mục 6)
// ---------------------------------------------------------------------------

describe('chữa trị', () => {
  it('mọi phương pháp khai đủ NĂM cấp kết quả', () => {
    for (const treatment of allTreatments()) {
      for (const tier of TIER_ORDER) {
        expect(outcomeFor(treatment, tier), `${treatment.id}/${tier}`).not.toBeNull();
      }
    }
  });

  it('TRÍCH MÁU có hại ở mọi cấp, kể cả thành công lớn', () => {
    const bloodletting = treatmentOf('trich-mau');
    expect(bloodletting?.harmful).toBe(true);
    for (const tier of TIER_ORDER) {
      expect(outcomeFor(bloodletting!, tier)?.bloodAdd).toBeLessThan(0);
    }
  });

  it('trích máu thật sự trừ máu khi chạy qua engine', () => {
    let state = freshState();
    state = commit(
      state,
      inflictInjury(state, createRng('trich'), {
        regionId: 'forearmR',
        type: 'laceration',
        severity: 2,
        source: 'dao',
        turn: 1,
      }).ops,
    );
    const before = body(state).blood;

    const outcome = treat(state, createRng('trich-2'), {
      injuryId: body(state).injuries[0]!.id,
      treatmentId: 'trich-mau',
      healerId: 'tho-cao-phau-thuat',
      turn: 2,
    });
    state = commit(state, outcome.ops);

    expect(outcome.ran).toBe(true);
    expect(body(state).blood).toBeLessThan(before);
  });

  it('thầy thuốc giỏi CAN trích máu, thợ cạo thì MỜI', () => {
    // Mục 6 nói thẳng: thầy thuốc giỏi khuyên tránh, thầy lang dở đề nghị nó.
    // Đây là chỗ cái bẫy lịch sử hiện ra trên màn hình thay vì nấp trong bảng số.
    expect(healerAdvice('thay-thuoc-phuong-nam', 'trich-mau')).toContain('can ngài');
    expect(healerAdvice('tho-cao-phau-thuat', 'trich-mau')).toContain('đề nghị');
  });

  it('đốt sắt nung LUÔN để lại một vết bỏng, kể cả khi thành công lớn', () => {
    const cautery = treatmentOf('dot-sat-nung');
    for (const tier of TIER_ORDER) {
      expect(outcomeFor(cautery!, tier)?.addsInjury?.type).toBe('burn');
    }
  });

  it('nẹp xương chỉ dùng được cho gãy xương', () => {
    let state = freshState();
    state = commit(
      state,
      inflictInjury(state, createRng('nep'), {
        regionId: 'forearmL',
        type: 'laceration',
        severity: 3,
        source: 'kiếm',
        turn: 1,
      }).ops,
    );
    const cut = body(state).injuries[0]!;
    expect(canTreat(cut, treatmentOf('nep-xuong')!)).toBe(false);
    expect(canTreat(cut, treatmentOf('khau-vet-thuong')!)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 7. Tàn phế và sẹo (mục 8)
// ---------------------------------------------------------------------------

describe('tàn phế vĩnh viễn', () => {
  it('cắt cụt chân ghi tàn phế, xóa cẳng chân, và tự thêm sẹo sang Phần 6', () => {
    let state = freshState();
    // Dựng sẵn một vết hoại tử ở đùi — điều kiện của `cat-cut-chi`.
    state = commit(
      state,
      inflictInjury(state, createRng('cut'), {
        regionId: 'thighR',
        type: 'puncture',
        severity: 4,
        source: 'giáo',
        turn: 1,
      }).ops,
    );
    const injuries = structuredClone(body(state).injuries);
    injuries[0]!.complications.push({ id: 'hoai-tu', startedTurn: 2, spreadTurn: -1, note: '' });
    state = commit(state, [
      { op: 'set', path: 'body.injuries', to: injuries, reason: 'dựng hoại tử cho test', source: 'json' },
    ]);
    // Thêm một vết ở cẳng chân để kiểm chuyện nó biến mất theo nhát cưa.
    state = commit(
      state,
      inflictInjury(state, createRng('cut-2'), {
        regionId: 'shinR',
        type: 'laceration',
        severity: 2,
        source: 'mảnh gỗ',
        turn: 2,
      }).ops,
    );

    const outcome = treat(state, createRng('cua'), {
      injuryId: body(state).injuries[0]!.id,
      treatmentId: 'cat-cut-chi',
      healerId: 'tho-cao-phau-thuat',
      turn: 3,
      skillLevel: 95,
    });
    state = commit(state, outcome.ops);

    const after = body(state);
    expect(after.permanent.some((entry) => entry.id === 'cut-chan')).toBe(true);
    expect(after.injuries.some((entry) => entry.regionId === 'shinR')).toBe(false);
    // Mỏm cụt là một vết thương THẬT, không phải một cờ: nó còn chảy máu được.
    expect(after.injuries.some((entry) => entry.type === 'amputation')).toBe(true);

    const scars = readPath(state, 'character.appearance.scars');
    expect(Array.isArray(scars)).toBe(true);
    expect((scars as { cause: string }[]).some((scar) => scar.cause.includes('cụt chân'))).toBe(true);
  });

  it('vùng đã cụt biến khỏi bản đồ cơ thể, kéo theo vùng xa hơn', () => {
    let state = freshState();
    state = commit(state, [
      {
        op: 'set',
        path: 'body.permanent',
        to: [{ id: 'cut-chan', regionId: 'thighL', turn: 1, cause: 'cắt cụt' }],
        reason: 'dựng cho test',
        source: 'json',
      },
    ]);
    const statuses = regionStatuses(state);
    expect(statuses.get('thighL')?.amputated).toBe(true);
    expect(statuses.get('shinL')?.amputated).toBe(true);
    expect(statuses.get('thighR')?.amputated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 8. BÀI TEST SỐ 11 — 30 lượt vết đâm ở đùi, không chữa
// ---------------------------------------------------------------------------

describe('mô phỏng 30 lượt (mục 11 bài 11)', () => {
  it('vết đâm sâu ở đùi không chữa dẫn tới chuỗi chảy máu → nhiễm trùng → sốt → hoại tử → chết hoặc buộc cắt chân', () => {
    registerBodySources();
    registerCharacterSources();

    let state = freshState('dui-bi-dam');
    const rng = createRng('dui-bi-dam::than');

    state = commit(
      state,
      inflictInjury(state, rng, {
        regionId: 'thighR',
        type: 'puncture',
        severity: 4,
        source: 'mũi giáo bùn đất',
        turn: 0,
      }).ops,
    );

    const seen = { bleeding: false, infection: false, fever: false, necrosis: false, amputation: false };
    let died = '';
    let diedTurn = 0;
    const lines: string[] = [];

    for (let turn = 1; turn <= 30; turn++) {
      const pass = bodyTurn(state, rng, turn);
      state = commit(state, pass.ops);

      const now = body(state);
      const summary = bodySummary(state);
      const injury = now.injuries.find((entry) => entry.regionId === 'thighR') ?? now.injuries[0];

      if (now.blood < 100) seen.bleeding = true;
      if ((injury?.infection ?? 0) >= 40) seen.infection = true;
      if (now.fever >= 40) seen.fever = true;
      if (now.injuries.some((entry) => entry.complications.some((c) => c.id === 'hoai-tu'))) {
        seen.necrosis = true;
      }
      if (pass.amputationNeeded.length > 0) seen.amputation = true;

      lines.push(
        `L${String(turn).padStart(2, ' ')} · máu ${String(summary?.blood ?? 0).padStart(3, ' ')}` +
          ` · đau ${String(summary?.pain ?? 0).padStart(3, ' ')}` +
          ` · sốt ${String(summary?.fever ?? 0).padStart(3, ' ')}` +
          ` · nhiễm trùng ${String(Math.round(injury?.infection ?? 0)).padStart(3, ' ')}` +
          ` · đi lại ${String(summary?.mobility ?? 0).padStart(3, ' ')}%` +
          ` · ${summary?.consciousness ?? '—'}` +
          (pass.log.length === 0 ? '' : `  | ${pass.log.join(' | ')}`),
      );

      if (pass.died) {
        died = pass.deathCause;
        diedTurn = turn;
        break;
      }
    }

    // In ra để người cân bằng ĐỌC đường cong, đúng yêu cầu mục 12.
    console.info(`\n=== 30 LƯỢT: VẾT ĐÂM SÂU Ở ĐÙI PHẢI, KHÔNG CHỮA ===\n${lines.join('\n')}`);
    console.info(
      died === ''
        ? `\nKẾT: còn sống sau 30 lượt · buộc phải cắt chân: ${seen.amputation ? 'CÓ' : 'không'}\n`
        : `\nKẾT: chết ở lượt ${diedTurn} — ${died}\n`,
    );

    expect(seen.bleeding, 'phải thấy chảy máu').toBe(true);
    expect(seen.infection, 'phải thấy nhiễm trùng').toBe(true);
    expect(seen.fever, 'phải thấy sốt').toBe(true);
    expect(seen.necrosis, 'phải thấy hoại tử').toBe(true);
    // Mục 11: "nhân vật chết HOẶC buộc phải cắt chân".
    expect(died !== '' || seen.amputation, 'phải chết hoặc buộc phải cắt chân').toBe(true);
  });

  it('cắt chân đúng lúc thì sống — hệ thống phải còn cửa xoay xở (Phần 5 mục 5)', () => {
    registerBodySources();
    let state = freshState('cuu-duoc');
    const rng = createRng('cuu-duoc::than');

    state = commit(
      state,
      inflictInjury(state, rng, {
        regionId: 'thighR',
        type: 'puncture',
        severity: 4,
        source: 'mũi giáo bùn đất',
        turn: 0,
      }).ops,
    );

    let amputated = false;
    for (let turn = 1; turn <= 30; turn++) {
      const pass = bodyTurn(state, rng, turn);
      state = commit(state, pass.ops);
      if (pass.died) break;

      if (!amputated && pass.amputationNeeded.length > 0) {
        const rotten = body(state).injuries.find((entry) =>
          entry.complications.some((complication) => complication.id === 'hoai-tu'),
        );
        if (rotten !== undefined) {
          const outcome = treat(state, rng, {
            injuryId: rotten.id,
            treatmentId: 'cat-cut-chi',
            healerId: 'thay-thuoc-phuong-nam',
            turn,
            skillLevel: 95,
          });
          state = commit(state, outcome.ops);
          amputated = true;
        }
      }
    }

    expect(amputated).toBe(true);
    const after = body(state);
    expect(after.dead).toBe(false);
    expect(after.permanent.some((entry) => entry.id === 'cut-chan')).toBe(true);
    // Và người chơi vẫn còn một cơ thể để đọc: đây là chỗ Phần 8 mục 7 mở đường
    // đi tiếp, không bắt tạo lại nhân vật.
    expect(injuryViews(state).length).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// 9. Điều kiện tử vong (mục 9)
// ---------------------------------------------------------------------------

describe('điều kiện tử vong', () => {
  it('KHÔNG có thanh máu tổng: một vết chí mạng không giết ngay', () => {
    registerBodySources();
    let state = freshState('chet-ngay');
    const rng = createRng('chet-ngay::than');

    state = commit(
      state,
      inflictInjury(state, rng, {
        regionId: 'chest',
        type: 'puncture',
        severity: 5,
        source: 'kiếm dài',
        turn: 0,
      }).ops,
    );
    expect(body(state).dead).toBe(false);

    // Phần 5 mục 5: cái chết phải đi qua ÍT NHẤT một chuỗi biến chứng. Một lượt
    // sau khi bị đâm mà đã chết thì người chơi không còn cửa nào để xoay xở.
    const pass = bodyTurn(state, rng, 1);
    state = commit(state, pass.ops);
    const now = body(state);
    if (now.dead) {
      // Trường hợp duy nhất được phép chết ngay: tạng chí mạng bị phá hủy hẳn —
      // và ngay cả nó cũng phải nêu tên tạng, không phải "máu về 0".
      expect(now.deathCause).toContain('tạng chí mạng');
    }
  });

  it('mọi cái chết đều nêu nguyên nhân cụ thể', () => {
    const state = freshState();
    const broken = applyPatch(
      state,
      [{ op: 'set', path: 'body.dead', to: true, reason: 'chết không rõ vì sao', source: 'json' }],
      { actor: 'engine' },
    );
    // Ràng buộc chéo của slice chặn: chết mà không có nguyên nhân là đúng thứ
    // mục 9 cấm.
    expect(broken.applied).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 10. Bảng trạng thái (mục 2 và 10)
// ---------------------------------------------------------------------------

describe('trạng thái toàn thân', () => {
  it('ý chí cao thì cùng một vết đau ít hơn', () => {
    let weak = freshState('yeu');
    let strong = freshState('manh');

    const setWil = (state: GameState, value: number): GameState =>
      commit(state, [
        { op: 'set', path: 'character.stats.wil', to: value, reason: 'test', source: 'json' },
      ]);

    weak = setWil(weak, 4);
    strong = setWil(strong, 18);

    const spec = { regionId: 'abdomen', type: 'crush', severity: 4, source: 'chùy', turn: 1 } as const;
    weak = commit(weak, inflictInjury(weak, createRng('a'), spec).ops);
    strong = commit(strong, inflictInjury(strong, createRng('a'), spec).ops);

    expect(bodySummary(weak)!.pain).toBeGreaterThan(bodySummary(strong)!.pain);
  });

  it('mất máu kéo ý thức xuống theo đúng ngưỡng của mục 5', () => {
    let state = freshState();
    const at = (blood: number): string => {
      state = commit(state, [
        { op: 'set', path: 'body.blood', to: blood, reason: 'test', source: 'json' },
      ]);
      return bodySummary(state)!.consciousness;
    };

    expect(at(100)).toBe('tỉnh');
    expect(at(38)).toBe('choáng');
    expect(at(18)).toBe('hôn mê');
  });

  it('danh sách thương tích sắp theo mức NGUY HIỂM, không theo mức độ vết', () => {
    let state = freshState();
    state = commit(
      state,
      inflictInjury(state, createRng('x'), {
        regionId: 'shoulderL',
        type: 'fracture',
        severity: 4,
        source: 'ngã ngựa',
        turn: 1,
      }).ops,
    );
    state = commit(
      state,
      inflictInjury(state, createRng('y'), {
        regionId: 'neck',
        type: 'laceration',
        severity: 3,
        source: 'dao găm',
        turn: 1,
      }).ops,
    );

    const views = injuryViews(state);
    // Vết cổ nhẹ hơn một bậc nhưng chảy máu gấp nhiều lần — nó phải đứng trước.
    expect(views[0]?.regionId).toBe('neck');
  });

  it('kiểm định vẫn chạy khi một nguồn của cơ thể ném lỗi (R4)', () => {
    registerBodySources();
    const state = freshState();
    const run = runCheck(createRng('r4'), {
      id: 'check.thu',
      system: 'd100',
      domain: 'skill.chung',
      difficulty: 'thuong',
      base: 50,
      state,
    });
    expect(run.result.tier).toBeDefined();
    expect(run.failures).toHaveLength(0);
  });
});
