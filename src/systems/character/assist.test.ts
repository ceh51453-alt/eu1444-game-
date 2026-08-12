/**
 * Bài test của thanh "Nhờ AI" (Phần 6 mục 9).
 *
 * Mọi bài ở đây gác đúng MỘT câu: AI đề nghị, ENGINE phán quyết. Một đề nghị
 * chỉ số 16 cả mười hai ô, một id chủng tộc bịa ra, một khối JSON gãy giữa
 * chừng — không thứ nào được phép lọt vào bản nháp, và không thứ nào được phép
 * làm nổ trình tạo nhân vật (R4).
 *
 * Bài cuối là bài quan trọng nhất: nhờ AI dựng cả nhân vật rồi CHỐT THẬT bằng
 * `buildInitialState`. Nếu một chỗ nào đó lọt qua kẹp của engine, schema hợp
 * nhất sẽ bắt được ở đó — và đó chính là chỗ nó phải bị bắt.
 */

import { describe, expect, it } from 'vitest';
import { createRng } from '@/core/rng';
import { registerGameSlices } from '@/state/register';
import { applyAssist, assistPrompt, parseAssist, type AssistSuggestion } from './assist';
import {
  allIssues,
  buildInitialState,
  newDraft,
  rollAppearance,
  rollFamily,
  rollSecrets,
  skillPointsLeft,
  statPointsLeft,
  withOrigin,
  withRace,
  type CharacterDraft,
} from './create';
import { pointBuy } from './origins';
import { statCapOf } from './races';
import { STAT_IDS } from './stats';

registerGameSlices();

const SEED = 'assist-test';

function rng() {
  return createRng(`${SEED}::generation`);
}

function baseDraft(): CharacterDraft {
  return withOrigin(withRace(newDraft(SEED), 'race_frank'), 'origin_hiep-si');
}

/** Bản nháp đã đi hết chín bước — nền để đo một lần nhờ AI làm đổi những gì. */
function fullDraft(): CharacterDraft {
  const stream = rng();
  let draft = baseDraft();
  draft = { ...draft, givenName: 'Thử', familyName: 'Nghiệm' };
  draft = rollAppearance(draft, stream);
  draft = rollFamily(draft, stream);
  draft = rollSecrets(draft, stream);
  return draft;
}

function apply(draft: CharacterDraft, suggestion: AssistSuggestion) {
  return applyAssist(draft, suggestion, rng());
}

// ---------------------------------------------------------------------------
// Prompt — chỉ hỏi đúng phần đang hỏi
// ---------------------------------------------------------------------------

describe('assistPrompt', () => {
  it('chỉ liệt kê khóa và danh mục của bước đang hỏi', () => {
    const prompt = assistPrompt(baseDraft(), 'ngoai-hinh', '');

    expect(prompt.user).toContain('"appearance"');
    expect(prompt.user).toContain('"clothing"');
    // Bấm "điền bước Ngoại hình" mà prompt vẫn dán 76 kỹ năng và 35 chủng tộc
    // là trả tiền token cho thứ AI không được phép đụng tới.
    expect(prompt.user).not.toContain('CHỦNG TỘC:');
    expect(prompt.user).not.toContain('KỸ NĂNG:');
    expect(prompt.user).not.toContain('"stats"');
  });

  it('cả nhân vật thì gom đủ chín bước và mọi danh mục', () => {
    const prompt = assistPrompt(baseDraft(), 'tat-ca', '');

    for (const key of ['"raceId"', '"originId"', '"stats"', '"skills"', '"secrets"', '"opening"']) {
      expect(prompt.user).toContain(key);
    }
    expect(prompt.user).toContain('race_frank');
    expect(prompt.user).toContain('NGÂN SÁCH CHỈ SỐ');
    expect(prompt.user).toContain('NGÂN SÁCH KỸ NĂNG');
  });

  it('câu người chơi gõ vào đi nguyên văn vào prompt', () => {
    const wish = 'một tu sĩ bỏ dòng, giỏi chữ nghĩa, đang trốn nợ';
    expect(assistPrompt(baseDraft(), 'tat-ca', wish).user).toContain(wish);
  });

  it('không có câu nào thì vẫn nói rõ cho AI biết là được tự do', () => {
    expect(assistPrompt(baseDraft(), 'chung-toc', '   ').user).toContain('KHÔNG NÊU YÊU CẦU RIÊNG');
  });

  /**
   * Người chơi trả tiền cho từng token của prompt này. Một danh mục mới thêm
   * vào mà quên trần `CATALOG_LIMIT` sẽ đội giá mỗi lần bấm nút, và không có gì
   * trên màn hình nói ra — nên để bài test nói.
   */
  it('không phình ra ngoài tầm: mỗi bước dưới 12k ký tự, cả nhân vật dưới 40k', () => {
    const draft = baseDraft();
    for (const step of ['chung-toc', 'xuat-than', 'ky-nang', 'trang-bi', 'xac-nhan'] as const) {
      const prompt = assistPrompt(draft, step, '');
      expect(prompt.system.length + prompt.user.length).toBeLessThan(12_000);
    }
    const all = assistPrompt(draft, 'tat-ca', '');
    expect(all.system.length + all.user.length).toBeLessThan(40_000);
  });
});

// ---------------------------------------------------------------------------
// Đọc chữ AI trả về — hỏng thì không áp gì (R4)
// ---------------------------------------------------------------------------

describe('parseAssist', () => {
  it('cắt được khối JSON nằm giữa lời dẫn và dấu ```', () => {
    const raw = 'Đây là nhân vật của ngài:\n```json\n{ "givenName": "Aymer" }\n```\nChúc vui.';
    const parsed = parseAssist(raw);

    expect(parsed.suggestion?.givenName).toBe('Aymer');
    expect(parsed.issues).toEqual([]);
  });

  it('nhận số viết dưới dạng chuỗi', () => {
    expect(parseAssist('{ "age": "37" }').suggestion?.age).toBe(37);
  });

  it('chữ không có JSON thì trả null kèm lý do, không ném', () => {
    const parsed = parseAssist('Xin lỗi, tôi không thể làm việc này.');

    expect(parsed.suggestion).toBeNull();
    expect(parsed.issues).toHaveLength(1);
  });

  it('JSON bị cắt giữa chừng thì nói đúng bệnh: chạm trần token đầu ra', () => {
    const parsed = parseAssist('{ "givenName": "Aymer", "age": ');

    expect(parsed.suggestion).toBeNull();
    expect(parsed.issues[0]).toContain('trần token đầu ra');
  });

  it('JSON đóng ngoặc nhưng sai cú pháp thì trả null, không ném', () => {
    const parsed = parseAssist('{ "givenName": "Aymer",, }');

    expect(parsed.suggestion).toBeNull();
    expect(parsed.issues[0]).toContain('hỏng');
  });

  it('sai kiểu thì từ chối cả lô và nói rõ ở khóa nào', () => {
    const parsed = parseAssist('{ "age": null, "sex": "khác" }');

    expect(parsed.suggestion).toBeNull();
    expect(parsed.issues.join(' ')).toContain('sex');
  });

  it('khóa AI tự bịa thêm thì bỏ qua nhưng phải nói ra', () => {
    const parsed = parseAssist('{ "givenName": "Aymer", "level": 40, "hp": 100 }');

    expect(parsed.suggestion?.givenName).toBe('Aymer');
    expect(parsed.issues[0]).toContain('level');
  });
});

// ---------------------------------------------------------------------------
// Chỉ số — point-buy là cửa duy nhất
// ---------------------------------------------------------------------------

describe('applyAssist · chỉ số', () => {
  it('đòi 16 cả mười hai ô thì bị hạ về đúng ngân sách', () => {
    const draft = baseDraft();
    const wanted = Object.fromEntries(STAT_IDS.map((id) => [id, 16]));

    const outcome = apply(draft, { stats: wanted });

    expect(statPointsLeft(outcome.draft)).toBe(0);
    expect(outcome.notes.join(' ')).not.toBe('');
    for (const id of STAT_IDS) {
      expect(outcome.draft.allocated[id]).toBeLessThanOrEqual(pointBuy().maxAtCreation);
    }
  });

  it('vượt trần chủng tộc thì kẹp xuống trần của tộc, và nói ra', () => {
    const draft = withOrigin(withRace(newDraft(SEED), 'race_ogre'), 'origin_hiep-si');
    const cap = statCapOf('race_ogre', 'int');

    const outcome = apply(draft, { stats: { int: 20 } });

    expect(outcome.draft.allocated.int).toBeLessThanOrEqual(cap);
    expect(outcome.notes.join(' ')).toContain('INT');
  });

  it('tiêu thiếu thì engine dồn nốt, không để lại điểm lẻ chặn nút Chốt', () => {
    const outcome = apply(baseDraft(), { stats: { str: 12, vit: 11 } });

    expect(statPointsLeft(outcome.draft)).toBe(0);
    // Dồn theo đúng thứ tự AI ưu tiên: ô AI đòi cao nhất vẫn phải là ô cao nhất.
    expect(outcome.draft.allocated.str).toBeGreaterThanOrEqual(12);
  });

  it('tên chỉ số lạ thì bỏ, không nổ', () => {
    const outcome = apply(baseDraft(), { stats: { luck: 18, str: 12 } });

    expect(outcome.notes.join(' ')).toContain('luck');
    expect(statPointsLeft(outcome.draft)).toBe(0);
  });

  it('đổi chủng tộc rồi mới kẹp chỉ số — không phải theo trần của tộc cũ', () => {
    const outcome = apply(baseDraft(), { raceId: 'race_kobold', stats: { str: 16 } });

    expect(outcome.draft.raceId).toBe('race_kobold');
    expect(outcome.draft.allocated.str).toBeLessThanOrEqual(statCapOf('race_kobold', 'str'));
  });
});

// ---------------------------------------------------------------------------
// Kỹ năng — ngân sách của bước 5
// ---------------------------------------------------------------------------

describe('applyAssist · kỹ năng', () => {
  it('đòi quá ngân sách thì chỉ rót được tới hết điểm', () => {
    const draft = baseDraft();
    const wanted: Record<string, number> = {
      'skill_kiem-thuat': 6,
      'skill_cuoi-ngua': 6,
      'skill_chi-huy': 6,
    };

    const outcome = apply(draft, { skills: wanted });

    expect(skillPointsLeft(outcome.draft)).toBe(0);
    const perPoint = pointBuy().skillTrainingPerPoint;
    for (const training of Object.values(outcome.draft.skills)) {
      expect(training % perPoint).toBe(0);
      expect(training).toBeLessThanOrEqual(pointBuy().skillMaxAtCreation);
    }
  });

  it('id kỹ năng bịa ra thì bỏ và nói ra', () => {
    const outcome = apply(baseDraft(), { skills: { skill_khong_co_that: 3, 'skill_kiem-thuat': 2 } });

    expect(outcome.notes.join(' ')).toContain('skill_khong_co_that');
    expect(outcome.draft.skills['skill_khong_co_that']).toBeUndefined();
    expect(outcome.draft.skills['skill_kiem-thuat']).toBeGreaterThan(0);
  });

  it('nhận cả dạng mảng { id, points }', () => {
    const outcome = apply(baseDraft(), { skills: [{ id: 'skill_kiem-thuat', points: 2 }] });

    // Ít nhất chừng ấy: điểm lẻ còn thừa được dồn tiếp vào chính nghề AI chọn.
    expect(outcome.draft.skills['skill_kiem-thuat']).toBeGreaterThanOrEqual(2 * pointBuy().skillTrainingPerPoint);
    expect(skillPointsLeft(outcome.draft)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Id bịa ra — bỏ từng cái một, không hủy cả lô
// ---------------------------------------------------------------------------

describe('applyAssist · id không có trong data', () => {
  it('chủng tộc, giai tầng, gia tộc, thế lực, tôn giáo, trang bị lạ đều bị bỏ', () => {
    const draft = fullDraft();

    const outcome = apply(draft, {
      raceId: 'race_rong_lua',
      originId: 'origin_hoang_de',
      houseId: 'house_khong_co',
      allegiance: { nationId: 'nation_atlantis', religionId: 'religion_khong_co' },
      gear: [{ item: 'item_sung-truong' }, { item: 'item_kiem-dai' }],
      givenName: 'Aymer',
    });

    expect(outcome.draft.raceId).toBe(draft.raceId);
    expect(outcome.draft.originId).toBe(draft.originId);
    expect(outcome.draft.houseId).toBe(draft.houseId);
    expect(outcome.draft.allegiance.nationId).toBe(draft.allegiance.nationId);
    expect(outcome.draft.allegiance.religionId).toBe(draft.allegiance.religionId);
    expect(outcome.draft.gear.some((entry) => entry.item === 'item_sung-truong')).toBe(false);
    // Phần đúng vẫn phải đi qua: bỏ một id sai không được kéo theo cả lô.
    expect(outcome.draft.givenName).toBe('Aymer');
    expect(outcome.notes.length).toBeGreaterThanOrEqual(5);
  });

  it('vùng sinh lạ thì giữ nguyên vùng cũ', () => {
    const draft = baseDraft();
    const outcome = apply(draft, { birthRegionId: 'region_khong_co' });

    expect(outcome.draft.birthRegionId).toBe(draft.birthRegionId);
  });
});

// ---------------------------------------------------------------------------
// Tuổi, bí mật, ngoại hình
// ---------------------------------------------------------------------------

describe('applyAssist · những chỗ có trần', () => {
  it('tuổi ngoài khoảng chọn được thì bị kẹp', () => {
    const outcome = apply(baseDraft(), { age: 900 });

    expect(outcome.draft.age).toBeLessThan(900);
    expect(outcome.notes.join(' ')).toContain('kẹp tuổi');
  });

  it('quá ba bí mật thì chỉ giữ ba (mục 7 cho 1–3)', () => {
    const outcome = apply(fullDraft(), {
      secrets: ['một', 'hai', 'ba', 'bốn', 'năm'],
    });

    expect(outcome.draft.secrets).toHaveLength(3);
    expect(outcome.draft.secrets[0]?.text).toBe('một');
  });

  it('cơ + mỡ vượt 100 thì kẹp lại — ràng buộc chéo của slice', () => {
    const outcome = apply(fullDraft(), { appearance: { musclePct: 70, fatPct: 60 } });
    const appearance = outcome.draft.appearance;

    expect(appearance).not.toBeNull();
    expect((appearance?.musclePct ?? 0) + (appearance?.fatPct ?? 0)).toBeLessThanOrEqual(100);
    expect(outcome.notes.join(' ')).toContain('cơ + mỡ');
  });

  it('chưa dựng ngoại hình mà AI chỉ sửa vài ô thì rút một bản theo tộc trước', () => {
    const outcome = apply(baseDraft(), { appearance: { hair: 'bạc trắng' } });

    expect(outcome.draft.appearance?.hair).toBe('bạc trắng');
    expect(outcome.draft.appearance?.heightCm).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Người nhà — chỉ sửa người đã có
// ---------------------------------------------------------------------------

describe('applyAssist · gia đình', () => {
  it('khớp theo id và KHÔNG đụng vào 12 chỉ số của người nhà', () => {
    const draft = fullDraft();
    const father = draft.family.find((member) => member.relation === 'cha');
    expect(father).toBeDefined();

    const outcome = apply(draft, {
      family: [{ id: father?.id ?? '', name: 'Guillaume Nghiệm', goal: 'muốn con mình không đi lính', attitude: 55 }],
    });

    const after = outcome.draft.family.find((member) => member.id === father?.id);
    expect(after?.name).toBe('Guillaume Nghiệm');
    expect(after?.attitude).toBe(55);
    expect(after?.stats).toEqual(father?.stats);
  });

  it('id không khớp ai thì bỏ, không thêm người mới', () => {
    const draft = fullDraft();
    const outcome = apply(draft, { family: [{ id: 'npc_khong_co', name: 'Ma' }] });

    expect(outcome.draft.family).toHaveLength(draft.family.length);
    expect(outcome.notes.join(' ')).toContain('npc_khong_co');
  });

  it('chưa sinh gia tộc thì sinh bằng seeded RNG trước khi áp lời AI', () => {
    const draft = baseDraft();
    expect(draft.family).toHaveLength(0);

    const outcome = apply(draft, { family: [{ relation: 'cha', goal: 'muốn giữ đất của nhà' }] });

    expect(outcome.draft.family.length).toBeGreaterThan(0);
    expect(outcome.draft.family.find((member) => member.relation === 'cha')?.goal).toBe('muốn giữ đất của nhà');
  });

  it('thái độ ngoài thang -100..100 thì kẹp', () => {
    const draft = fullDraft();
    const father = draft.family.find((member) => member.relation === 'cha');

    const outcome = apply(draft, { family: [{ id: father?.id ?? '', attitude: 400 }] });

    expect(outcome.draft.family.find((member) => member.id === father?.id)?.attitude).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// Bản nháp cũ không được đổi, và bản mới phải chốt được
// ---------------------------------------------------------------------------

describe('applyAssist · toàn cục', () => {
  it('không sửa bản nháp gốc — người chơi bấm "Bỏ" là mất sạch dấu vết', () => {
    const draft = fullDraft();
    const before = JSON.parse(JSON.stringify(draft)) as CharacterDraft;

    apply(draft, { raceId: 'race_lun-nui', stats: { str: 16 }, givenName: 'Khác' });

    expect(draft).toEqual(before);
  });

  it('nhờ dựng cả nhân vật thì chốt được thật, không còn chỗ nào thiếu', () => {
    const suggestion: AssistSuggestion = {
      raceId: 'race_latin',
      sex: 'nam',
      originId: 'origin_giao-si',
      age: 34,
      stats: { int: 15, elo: 14, wil: 12, emp: 11, per: 10, wit: 10 },
      skills: { 'skill_hoc-van': 4, 'skill_giang-dao': 3, 'skill_y-thuat': 2 },
      appearance: { build: 'gầy', hair: 'hoa râm', eyes: 'nâu sẫm', face: 'gò má cao, môi mỏng' },
      clothing: 'áo chùng thâm đã sờn, một cây thánh giá gỗ',
      secrets: ['Ngài giữ một bản chép tay mà Giáo hội đã ra lệnh đốt.'],
      allegiance: { piety: 65, standing: 'tang-lu' },
      personalityNote: 'nói chậm, hay trích sách, không bao giờ trả lời thẳng câu hỏi đầu tiên',
      givenName: 'Anselmo',
      familyName: 'da Pavia',
      family: [{ relation: 'cha', goal: 'muốn con trai bỏ nhà dòng mà về nối nghiệp' }],
    };

    const outcome = apply(fullDraft(), suggestion);

    expect(allIssues(outcome.draft)).toEqual([]);
    expect(() => buildInitialState(outcome.draft)).not.toThrow();
    expect(outcome.changes.length).toBeGreaterThan(5);
  });

  it('mỗi chỗ đổi đều kể được trước và sau', () => {
    const outcome = apply(fullDraft(), { givenName: 'Aymer', personalityNote: 'ít nói' });
    const name = outcome.changes.find((change) => change.label === 'Tên');

    expect(name?.before).toBe('Thử');
    expect(name?.after).toBe('Aymer');
  });

  it('đề nghị rỗng thì không đổi gì và không kể gì', () => {
    const draft = fullDraft();
    const outcome = apply(draft, {});

    expect(outcome.changes).toEqual([]);
    expect(outcome.draft).toEqual(draft);
  });
});
