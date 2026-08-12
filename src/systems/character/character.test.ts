/**
 * Bài test của Phần 6 mục 10.
 *
 * Bài số 8 — ba nhân vật khác chủng tộc và giai tầng, cùng một kiểm định, phải
 * ra modifier khác nhau ĐÚNG NHƯ DỮ LIỆU — là bài quan trọng nhất. Nó gác đúng
 * chỗ README mục 8.4 gọi là điểm dễ hỏng thứ tư: nếu chủng tộc và chỉ số không
 * đi qua registry mà được cộng lén ở đâu đó, bài này vẫn thấy kết quả đổi nhưng
 * `CheckResult.modifiers` sẽ không có dòng nào giải thích, và nó hỏng.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import racesFile from '@data/races.json';
import { createRng } from '@/core/rng';
import { computeDerived } from '@/state/derived';
import { allRegions } from '@/lore/regions';
import { migrateToCurrent } from '@/state/migrate';
import { registerGameSlices } from '@/state/register';
import { canWrite, pathExists, permissionFor, slices, type GameState } from '@/state/slices';
import { createInitialState } from '@/state/store';
import {
  GEAR_SOURCE_ID,
  RELIGION_SOURCE_ID,
  STAT_SOURCE_ID,
  TRAIT_SOURCE_ID,
  registerCharacterSources,
} from './modifiers';
import { resetModifierSources, runCheck, type CheckSpec } from '@/systems/check';
import { freeformSkillFor } from '@/systems/check/resolve';
import {
  allHouses,
  allOrigins,
  allSkills,
  ageStageOf,
  allCultures,
  allGear,
  allRaces,
  allReligions,
  allTraits,
  carry,
  effectiveAge,
  fiefTitles,
  gearEffect,
  gearOf,
  holdingIdFor,
  houseHeadName,
  houseOf,
  housesByGroup,
  housesForOrigin,
  lorePeople,
  loreEntryOf,
  lorePersonName,
  originOf,
  searchHouses,
  playableRaces,
  pointBuy,
  raceOf,
  slugify,
  startAgeRange,
  startingLine,
  statCapOf,
  statCost,
  statModsOf,
  traitOf,
  traitsOf,
} from './index';
import {
  allIssues,
  buildInitialState,
  canRaiseSkill,
  canRaiseStat,
  finalStats,
  finalize,
  newDraft,
  openingSceneAction,
  raiseSkill,
  raiseStat,
  rollAppearance,
  rollFamily,
  rollSecrets,
  setFamilyHouse,
  skillPointsLeft,
  statPointsLeft,
  stepHints,
  stepIssues,
  withHouse,
  withOrigin,
  withRace,
  type CharacterDraft,
} from './create';
import { domainOfSkill, skillOf } from './skills';
import { STAT_IDS, skillPercent, statContribution } from './stats';
import { characterOf, type CharacterState } from './slice';
import { allHoldings } from '@/systems/holding';
import { heldTitles } from '@/systems/titles';
import { codexOf } from '@/systems/codex';

const SEED = 'phan-6';

registerGameSlices();

// ---------------------------------------------------------------------------
// Dựng nhân vật cho test
// ---------------------------------------------------------------------------

function spendEverything(draft: CharacterDraft): CharacterDraft {
  let out = draft;

  for (let guard = 0; guard < 500 && statPointsLeft(out) > 0; guard++) {
    let moved = false;
    for (const id of STAT_IDS) {
      if (statPointsLeft(out) <= 0) break;
      if (!canRaiseStat(out, id)) continue;
      out = raiseStat(out, id);
      moved = true;
    }
    if (!moved) break;
  }

  const skillIds = allSkills().map((skill) => skill.id);
  for (let guard = 0; guard < 500 && skillPointsLeft(out) > 0; guard++) {
    let moved = false;
    for (const skillId of skillIds) {
      if (skillPointsLeft(out) <= 0) break;
      if (!canRaiseSkill(out, skillId)) continue;
      out = raiseSkill(out, skillId);
      moved = true;
    }
    if (!moved) break;
  }

  return out;
}

/**
 * Bản nháp đầy đủ cho test — đã đi hết chín bước, dùng seed riêng để tái lập được.
 *
 * Xuất thân đi qua `withOrigin` chứ KHÔNG gán thẳng `originId`: trang bị, tài
 * sản, thành trì và thái ấp khởi đầu đều do hàm đó đổ vào. Gán tay mỗi cái id
 * thì bản nháp có xuất thân mà không có gì trong tay, và mấy bài kiểm trang bị
 * ở dưới sẽ đo một nhân vật trần trụi.
 *
 * `birthOrderId` phải đặt TRƯỚC `withOrigin`, vì chính nó quyết định con cả có
 * thừa kế hay không (Phần 6 mục 3).
 */
function draftFor(
  raceId: string,
  originId: string,
  seed = SEED,
  birthOrderId = 'con-thu',
): CharacterDraft {
  const rng = createRng(seed);
  let draft = withRace(newDraft(seed), raceId);
  draft = withOrigin({ ...draft, birthOrderId, givenName: 'Thử', familyName: 'Nghiệm' }, originId);
  draft = spendEverything(draft);
  draft = rollAppearance(draft, rng);
  draft = rollFamily(draft, rng);
  draft = rollSecrets(draft, rng);
  return draft;
}

function stateFor(raceId: string, originId: string): GameState {
  return buildInitialState(draftFor(raceId, originId));
}

// ---------------------------------------------------------------------------
// Mục 2 — dữ liệu chủng tộc
// ---------------------------------------------------------------------------

describe('mục 2 — data/races.json', () => {
  it('không chỗ nào trong code đếm sẵn số chủng tộc', () => {
    const raw = (racesFile as { races: unknown[] }).races.length;
    expect(allRaces()).toHaveLength(raw);
    // Danh sách sẽ còn dài thêm, nên bài test cũng không được viết cứng con số.
    expect(playableRaces().length).toBeGreaterThan(30);
    expect(playableRaces().every((race) => !race.isGroupNode)).toBe(true);
  });

  it('node nhóm không chọn được lúc tạo nhân vật', () => {
    const group = allRaces().find((race) => race.isGroupNode);
    expect(group).toBeDefined();
    expect(playableRaces().some((race) => race.id === group?.id)).toBe(false);
  });

  it('tổng mod chỉ số của MỌI tộc bằng 0 — không tộc nào mạnh hơn trần trụi', () => {
    for (const race of playableRaces()) {
      const total = STAT_IDS.reduce((sum, id) => sum + statModsOf(race.id)[id], 0);
      expect(`${race.id}: ${total}`).toBe(`${race.id}: 0`);
    }
  });

  it('mỗi tộc có 2–3 đặc tính bẩm sinh, và đặc tính nào cũng có thật', () => {
    for (const race of playableRaces()) {
      const traits = traitsOf(race.id);
      expect(traits.length).toBeGreaterThanOrEqual(2);
      expect(traits.length).toBeLessThanOrEqual(3);
      for (const id of traits) expect(traitOf(id)).not.toBeNull();
    }
  });

  it('mọi tộc chơi được đều có ngoại hình, ngôn ngữ và spread', () => {
    for (const race of playableRaces()) {
      expect(race.appearance, race.id).toBeDefined();
      expect(race.language, race.id).not.toBe('');
      expect(race.spreadNote, race.id).not.toBe('');
    }
  });

  it('trần chủng tộc chỉ được khai THẤP hơn trần chung', () => {
    for (const race of playableRaces()) {
      for (const id of STAT_IDS) expect(statCapOf(race.id, id)).toBeLessThanOrEqual(20);
    }
  });

  it('miền `skill.*` mà đặc tính khai đều trỏ tới kỹ năng có thật', () => {
    const domains = new Set(allSkills().map((skill) => domainOfSkill(skill.id)));
    for (const trait of allTraits()) {
      for (const effect of trait.effects) {
        for (const domain of effect.domains) {
          if (!domain.startsWith('skill.') || domain.endsWith('*')) continue;
          expect(`${trait.id} → ${domain}`).toBe(`${trait.id} → ${domains.has(domain) ? domain : 'KHÔNG CÓ'}`);
        }
      }
    }
  });

  it('giai đoạn tuổi khai theo tỉ lệ nên tộc sống 600 năm dùng chung một bảng', () => {
    // Cao Tiên sống 600 năm: 120 tuổi vẫn là thanh niên.
    expect(ageStageOf('race_cao-tien', 120).id).toBe('thanh-nien');
    // Orc sống 55 năm: 45 tuổi đã là lão niên.
    expect(ageStageOf('race_orc', 45).id).toBe('lao-nien');
    // Tuổi hiệu dụng quy hai tộc đó về cùng một thang để so được với nhau.
    expect(effectiveAge('race_cao-tien', 120)).toBe(14);
    expect(effectiveAge('race_orc', 45)).toBe(57);
  });

  it('tuổi khởi đầu không sinh ra nhân vật trẻ con, kể cả ở tộc sống ngắn', () => {
    for (const race of playableRaces()) {
      const [low, high] = startAgeRange(race.id);
      expect(low, race.id).toBeGreaterThanOrEqual(16);
      expect(high, race.id).toBeGreaterThanOrEqual(low);
      // Và cũng không đẩy nhân vật vào giai đoạn già ngay từ đầu.
      expect(ageStageOf(race.id, low).id, race.id).not.toBe('lao-nien');
      expect(ageStageOf(race.id, low).id, race.id).not.toBe('dai-lao');
    }
  });

  it('tộc không già đi đứng vĩnh viễn ở một giai đoạn', () => {
    expect(raceOf('race_huyet-toc')?.lifespan).toBeNull();
    expect(ageStageOf('race_huyet-toc', 30).id).toBe('thanh-nien');
    expect(ageStageOf('race_huyet-toc', 800).id).toBe('thanh-nien');
  });
});

// ---------------------------------------------------------------------------
// Mục 3 — xuất thân
// ---------------------------------------------------------------------------

describe('mục 3 — xuất thân chỉ ảnh hưởng vạch xuất phát', () => {
  it('đủ chín giai tầng, đúng bảng của mục 3', () => {
    expect(allOrigins()).toHaveLength(9);
    expect(originOf('origin_nong-no')).toMatchObject({ statPoints: 8, skillPoints: 6, prestige: 0, relations: 0 });
    expect(originOf('origin_giao-si')).toMatchObject({ statPoints: 9, skillPoints: 14, prestige: 25, relations: 4 });
    expect(originOf('origin_vuong-that')).toMatchObject({ statPoints: 15, skillPoints: 12, prestige: 85, relations: 12 });
  });

  it('thứ tự con và tình trạng gia tộc dịch vạch xuất phát, không khóa gì cả', () => {
    const caThinh = startingLine('origin_quy-toc-nho', 'con-ca', 'thinh');
    const thuLuuVong = startingLine('origin_quy-toc-nho', 'con-ngoai-gia-thu', 'luu-vong');

    expect(caThinh.inherits).toBe(true);
    expect(thuLuuVong.inherits).toBe(false);
    expect(thuLuuVong.coins).toBeLessThan(caThinh.coins);
    expect(thuLuuVong.prestige).toBeLessThan(caThinh.prestige);
    // Nhưng KHÔNG có trường nào nói "tối đa được lên tới tước gì".
    expect(Object.keys(caThinh)).toEqual(['coins', 'prestige', 'relationSlots', 'inherits', 'property']);
  });

  it('giá point-buy lũy tiến, và hoàn lại đúng số đã tiêu', () => {
    const config = pointBuy();
    expect(statCost(config.baseStat, 14)).toBe(6);
    // 14 → 16 đắt gấp đôi.
    expect(statCost(14, 16)).toBe(4);
    expect(statCost(16, 14)).toBe(-4);
    expect(statCost(10, 10)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Mục 1 và 9 — point-buy và trần chủng tộc
// ---------------------------------------------------------------------------

describe('mục 9 bước 3 — point-buy tôn trọng trần chủng tộc', () => {
  it('không phân được quá trần của tộc', () => {
    // Ogre có trần INT 12, thấp hơn trần lúc tạo là 16.
    let draft = withRace(newDraft(SEED), 'race_ogre');
    draft = { ...draft, originId: 'origin_vuong-that' };
    for (let guard = 0; guard < 40 && canRaiseStat(draft, 'int'); guard++) draft = raiseStat(draft, 'int');
    expect(draft.allocated.int).toBe(12);
  });

  it('đổi chủng tộc thì kéo chỉ số về trong trần tộc mới', () => {
    let draft = withRace(newDraft(SEED), 'race_cao-tien');
    draft = { ...draft, originId: 'origin_vuong-that' };
    for (let guard = 0; guard < 40 && canRaiseStat(draft, 'int'); guard++) draft = raiseStat(draft, 'int');
    expect(draft.allocated.int).toBe(16);

    const thanhOgre = withRace(draft, 'race_ogre');
    expect(thanhOgre.allocated.int).toBe(12);
  });

  it('chỉ số cuối = điểm đã phân + mod chủng tộc, kẹp vào trần', () => {
    const draft = withRace(newDraft(SEED), 'race_orc');
    const final = finalStats(draft);
    const base = pointBuy().baseStat;
    expect(final.str).toBe(base + 2);
    expect(final.emp).toBe(base - 2);
  });
});

// ---------------------------------------------------------------------------
// Mục 8 — quyền ghi của slice
// ---------------------------------------------------------------------------

describe('mục 8 — quyền ghi', () => {
  it('đúng bảng của mục 8', () => {
    expect(permissionFor('character.identity.race')).toBe('locked');
    expect(permissionFor('character.identity.birthDate')).toBe('locked');
    expect(permissionFor('character.identity.finalized')).toBe('locked');

    expect(permissionFor('character.stats.hp')).toBe('engine');
    expect(permissionFor('character.stats.str')).toBe('engine');
    expect(permissionFor('character.skills.skill_kiem-thuat.level')).toBe('engine');

    // Ngoại hình khóa, TRỪ sẹo — Phần 7 ghi vào đó khi thương tích liền lại.
    expect(permissionFor('character.appearance.hair')).toBe('locked');
    expect(permissionFor('character.appearance.scars')).toBe('engine');
    expect(permissionFor('character.appearance.scars.0.site')).toBe('engine');

    expect(permissionFor('character.relations.eleanor.trust')).toBe('ai');
    expect(permissionFor('character.secrets.0.revealed')).toBe('ai');
    expect(permissionFor('character.personality.note')).toBe('ai');
    expect(permissionFor('character.notes.rumors')).toBe('ai');
  });

  it('người nhà: gốc locked, chỉ số engine, thái độ ai (mục 6)', () => {
    expect(permissionFor('character.family.npc_cha.name')).toBe('locked');
    expect(permissionFor('character.family.npc_cha.race')).toBe('locked');
    expect(permissionFor('character.family.npc_cha.stats.body')).toBe('engine');
    expect(permissionFor('character.family.npc_cha.attitude')).toBe('ai');
    expect(permissionFor('character.family.npc_cha.goal')).toBe('ai');
  });

  it('AI không ghi được vào chỉ số, và không ai ghi được vào chủng tộc', () => {
    expect(canWrite('ai', 'character.stats.agi')).toBe(false);
    expect(canWrite('engine', 'character.stats.agi')).toBe(true);
    expect(canWrite('engine', 'character.identity.race')).toBe(false);
    expect(canWrite('ai', 'character.family.npc_cha.attitude')).toBe(true);
  });

  it('mười hai chỉ số có trong schema, một ô bịa ra thì không', () => {
    for (const id of STAT_IDS) expect(pathExists(`character.stats.${id}`)).toBe(true);
    expect(pathExists('character.stats.mana')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Biến phụ của mục 8
// ---------------------------------------------------------------------------

describe('mục 8 — biến phụ', () => {
  it('sức nâng, sức chở, tốc độ, tầm nhìn, máu tối đa, tuổi hiệu dụng', () => {
    const state = createInitialState('bien-phu');
    const character = characterOf(state) as CharacterState;
    character.stats.str = 14;
    character.stats.vit = 12;
    character.stats.agi = 11;
    character.stats.per = 13;
    character.identity.race = 'race_cao-tien';
    character.identity.age = 120;

    const derived = computeDerived(state, { strict: true });
    expect(derived['sucNang']).toBe(70);
    expect(derived['sucCho']).toBe(40);
    expect(derived['tocDo']).toBe(37);
    expect(derived['tamNhin']).toBe(124);
    expect(derived['mauToiDa']).toBe(34);
    expect(derived['tuoiHieuDung']).toBe(14);
  });

  it('ràng buộc chéo chặn chỉ số vượt trần chủng tộc', () => {
    const state = createInitialState('rang-buoc');
    const character = characterOf(state) as CharacterState;
    character.identity.race = 'race_ogre';
    character.stats.int = 18;

    const failing = slices
      .constraints()
      .map(({ constraint }) => constraint.check(state))
      .filter((message) => message !== null);
    expect(failing.join(' ')).toContain('vượt trần 12');
  });
});

// ---------------------------------------------------------------------------
// Mục 6 — sinh gia tộc bằng seeded RNG
// ---------------------------------------------------------------------------

describe('mục 6 — gia tộc', () => {
  it('cùng seed cho cùng gia tộc (R3)', () => {
    const a = rollFamily(withRace(newDraft('gia-toc'), 'race_frank'), createRng('gia-toc'));
    const b = rollFamily(withRace(newDraft('gia-toc'), 'race_frank'), createRng('gia-toc'));
    expect(a.family).toEqual(b.family);
    expect(a.family.length).toBeGreaterThan(0);
  });

  it('mỗi người nhà là NPC thật: có id, chỉ số, tuổi, tình trạng, thái độ, mục tiêu', () => {
    const draft = rollFamily(withRace(newDraft('npc'), 'race_teuton'), createRng('npc'));
    for (const member of draft.family) {
      expect(member.id).toMatch(/^npc_[a-z-]+(-\d+)?$/);
      expect(member.name).not.toBe('');
      // Đủ 12 chỉ số như người chơi, không phải một bộ rút gọn riêng.
      for (const id of STAT_IDS) expect(member.stats[id], `${member.id}.${id}`).toBeGreaterThan(0);
      expect(member.goal).not.toBe('');
      expect(member.attitude).toBeGreaterThanOrEqual(-100);
    }
    // Id phải duy nhất, nếu không thì hai người nhà đè lên nhau lúc vào state.
    expect(new Set(draft.family.map((member) => member.id)).size).toBe(draft.family.length);
  });

  it('không hai người nhà nào trùng tên riêng', () => {
    for (let index = 0; index < 30; index++) {
      const draft = rollFamily(
        { ...withRace(newDraft(`ten-${index}`), 'race_frank'), originId: 'origin_vuong-that' },
        createRng(`ten-${index}`),
      );
      const given = draft.family.map((member) => member.name.split(' ')[0]);
      expect(new Set(given).size, `seed ten-${index}`).toBe(given.length);
    }
  });

  it('anh chị nhiều tuổi hơn người chơi, em thì ít hơn', () => {
    for (let index = 0; index < 25; index++) {
      const draft = rollFamily(withRace(newDraft(`anh-em-${index}`), 'race_frank'), createRng(`anh-em-${index}`));
      for (const member of draft.family) {
        if (member.relation === 'anh' || member.relation === 'chi') {
          expect(member.age, `${member.name} là ${member.relation}`).toBeGreaterThan(draft.age);
        }
        if (member.relation === 'em') {
          expect(member.age, `${member.name} là em`).toBeLessThanOrEqual(draft.age);
        }
      }
    }
  });

  it('tuổi người nhà co giãn theo tuổi thọ của tộc', () => {
    const tien = rollFamily(
      { ...withRace(newDraft('tuoi'), 'race_cao-tien'), age: 150 },
      createRng('tuoi'),
    );
    const chaTien = tien.family.find((member) => member.relation === 'cha');
    // Cha của một Cao Tiên 150 tuổi phải hơn con hàng trăm năm, không phải hai mươi.
    expect(chaTien?.age ?? 0).toBeGreaterThan(300);
  });

  it('gia tộc tuyệt tự thì người thân còn sống ít hơn hẳn gia tộc thịnh', () => {
    const base = withRace(newDraft('song-chet'), 'race_frank');
    let thinh = 0;
    let tuyetTu = 0;
    for (let index = 0; index < 40; index++) {
      const rngA = createRng(`song-chet-${index}`);
      const rngB = createRng(`song-chet-${index}`);
      thinh += rollFamily({ ...base, lineageStateId: 'thinh' }, rngA).family.filter((member) => member.alive).length;
      tuyetTu += rollFamily({ ...base, lineageStateId: 'tuyet-tu' }, rngB).family.filter((member) => member.alive).length;
    }
    expect(tuyetTu).toBeLessThan(thinh);
  });
});

// ---------------------------------------------------------------------------
// Mục 4 — ngoại hình
// ---------------------------------------------------------------------------

describe('mục 4 — ngoại hình', () => {
  it('nằm trong dải của chủng tộc và cơ + mỡ không quá 100', () => {
    for (const race of playableRaces()) {
      const shape = race.appearance;
      if (shape === undefined) continue;
      const rng = createRng(`ngoai-hinh-${race.id}`);
      for (let index = 0; index < 5; index++) {
        const appearance = rollAppearance(withRace(newDraft('x'), race.id), rng).appearance;
        if (appearance === null) throw new Error('không dựng được ngoại hình');
        expect(appearance.heightCm, race.id).toBeGreaterThanOrEqual(shape.heightCm[0] - 10);
        expect(appearance.heightCm, race.id).toBeLessThanOrEqual(shape.heightCm[1] + 1);
        expect(appearance.musclePct + appearance.fatPct, race.id).toBeLessThanOrEqual(100);
      }
    }
  });

  it('nút ngẫu nhiên dùng seeded RNG nên tái lập được', () => {
    const a = rollAppearance(withRace(newDraft('nh'), 'race_lang-nhan'), createRng('nh'));
    const b = rollAppearance(withRace(newDraft('nh'), 'race_lang-nhan'), createRng('nh'));
    expect(a.appearance).toEqual(b.appearance);
  });
});

// ---------------------------------------------------------------------------
// Mục 9 — chốt nhân vật
// ---------------------------------------------------------------------------

describe('mục 9 — luồng chín bước', () => {
  it('bản nháp đủ thì không còn vấn đề nào', () => {
    expect(allIssues(draftFor('race_frank', 'origin_hiep-si'))).toEqual([]);
  });

  it('bản nháp thiếu thì nói ra thiếu ở đâu, và chốt bị chặn', () => {
    const draft = newDraft('thieu');
    expect(allIssues(draft).length).toBeGreaterThan(0);
    expect(() => buildInitialState(draft)).toThrow(/chưa xong/);
  });

  it('phiếu nhân vật chốt xong hợp lệ với schema của slice', () => {
    const character = finalize(draftFor('race_orc', 'origin_hiep-si'));
    expect(character.identity.finalized).toBe(true);
    expect(character.identity.race).toBe('race_orc');
    expect(character.stats.hp).toBe(character.stats.maxHp);
    expect(character.resources.coins).toBeGreaterThan(0);
    expect(Object.keys(character.family).length).toBeGreaterThan(0);
  });

  it('chốt nhân vật tạo hồ sơ Codex đầy đủ cho từng người trong gia đình', () => {
    const state = buildInitialState(draftFor('race_frank', 'origin_hiep-si'));
    const character = characterOf(state) as CharacterState;
    const codex = codexOf(state);

    expect(Object.keys(codex.npcs)).toHaveLength(Object.keys(character.family).length);
    for (const member of Object.values(character.family)) {
      const npc = codex.npcs[member.id];
      expect(npc).toBeDefined();
      expect(npc).toMatchObject({
        id: member.id,
        name: member.name,
        role: member.role,
        houseId: member.houseId,
        loreEntry: member.loreEntry,
        alive: member.alive,
        status: member.status,
        age: member.age,
        statistics: member.stats,
      });
      expect(npc?.personality.goals).toEqual(member.goal === '' ? [] : [member.goal]);
      expect(npc?.relationships['npc_nguoi-choi']?.affection).toBe(member.attitude);
      expect(npc?.sources[0]?.confidence).toBe(100);
    }
  });

  it('mang ảnh chân dung từ bản nháp vào save nhân vật', () => {
    const portrait = 'data:image/png;base64,iVBORw0KGgo=';
    const character = finalize({ ...draftFor('race_orc', 'origin_hiep-si'), portrait });

    expect(character.identity.portrait).toBe(portrait);
    expect(characterOf(buildInitialState({ ...draftFor('race_orc', 'origin_hiep-si'), portrait }))?.identity.portrait)
      .toBe(portrait);
  });

  it('save cũ chưa có ảnh vẫn nạp được với chân dung rỗng', () => {
    const raw = structuredClone(createInitialState('save-cu')) as Record<string, unknown>;
    const character = raw['character'] as { identity: Record<string, unknown> };
    delete character.identity['portrait'];

    expect(characterOf(migrateToCurrent(raw))?.identity.portrait).toBe('');
  });

  it('bí mật khởi đầu cắm thẳng vào slice tri thức của Phần 4 (mục 7)', () => {
    const state = stateFor('race_ma-due', 'origin_thuong-nhan');
    const character = characterOf(state) as CharacterState;
    const knowledge = state['knowledge'] as { known: Record<string, { confidence: number }> };

    expect(character.secrets.length).toBeGreaterThan(0);
    for (const secret of character.secrets) {
      expect(knowledge.known[secret.id]?.confidence).toBe(100);
    }
  });

  it('bước 7 chỉ nhận 1–3 bí mật có nội dung', () => {
    const valid = rollSecrets(newDraft('bi-mat-hop-le'), createRng('bi-mat-hop-le'));
    expect(stepIssues(valid, 'the-luc')).toEqual([]);

    const blank = { ...valid, secrets: [{ id: 'secret_1', text: '   ', revealed: false }] };
    expect(stepIssues(blank, 'the-luc')).toContain('Có bí mật khởi đầu chưa viết nội dung.');

    const tooMany = {
      ...valid,
      secrets: Array.from({ length: 4 }, (_, index) => ({
        id: `secret_${index + 1}`,
        text: `Bí mật ${index + 1}`,
        revealed: false,
      })),
    };
    expect(stepIssues(tooMany, 'the-luc')).toContain('Có quá 3 bí mật khởi đầu (mục 7 chỉ cho 1–3).');
  });

  it('lời nhờ AI viết đoạn mở đầu nêu đủ lựa chọn và ra lệnh không đụng vào số (R1)', () => {
    // Đại quý tộc con cả để lời này có đủ cả trang bị, thành trì và thái ấp.
    const character = finalize(draftFor('race_frank', 'origin_dai-quy-toc', SEED, 'con-ca'));
    const text = openingSceneAction(character);

    expect(text).toContain('Đang mang trên người');
    expect(text).toContain('Đang giữ một thành trì');
    expect(text).toContain('Được phong');
    expect(text).toContain('Văn hóa nuôi dạy');

    expect(text).toContain(character.identity.name);
    expect(text).toContain('Frank');
    expect(text).toContain('Đại quý tộc');
    expect(text).toContain('Ngoại hình');
    // Chữ đọc được, không phải id của engine.
    expect(text).not.toMatch(/realm_|prov_|origin_|race_|nation_|item_|hold_|fief_|rel_|cul_/);
    // Và không tự lặp cấp/tước vào tên: "Trấn Trấn không tên" là lỗi hiển thị.
    expect(text).not.toMatch(/(Thôn|Làng|Trấn|Thành|Đại thành) \1/);
    // Mệnh lệnh của mục 9 phải có mặt nguyên văn, không được rút gọn thành gợi ý.
    expect(text).toContain('chỉ viết cảnh mở đầu');
    expect(text).toContain('KHÔNG được thêm, bớt hay đổi bất kỳ chỉ số');
  });

  it('cùng bản nháp cho cùng state ban đầu (R3)', () => {
    expect(stateFor('race_lun-nui', 'origin_tho-thu-cong')).toEqual(
      stateFor('race_lun-nui', 'origin_tho-thu-cong'),
    );
  });
});

// ---------------------------------------------------------------------------
// Mục 10.8 — BÀI TEST CHÍNH
// ---------------------------------------------------------------------------

describe('mục 10.8 — ba nhân vật, một kiểm định, modifier khác nhau', () => {
  beforeEach(() => {
    resetModifierSources();
    registerCharacterSources();
  });

  /** Xây cất dưới hầm: đúng chỗ đặc tính `Mắt trong đá` của Lùn Núi bật lên. */
  const trongHam = (state: GameState): CheckSpec => ({
    id: 'check.thu',
    system: 'd100',
    domain: 'skill.xay-cat',
    difficulty: 'thuong',
    base: 0,
    state,
    tags: ['trong-ham'],
  });

  it('cả ba đều có dòng chỉ số, và con số đúng công thức chỉ số × 3', () => {
    const nhanVat = [
      stateFor('race_lun-nui', 'origin_tho-thu-cong'),
      stateFor('race_cao-tien', 'origin_giao-si'),
      stateFor('race_orc', 'origin_hiep-si'),
    ];

    for (const state of nhanVat) {
      const result = runCheck(createRng(SEED), trongHam(state)).result;
      const line = result.modifiers.find((entry) => entry.source === STAT_SOURCE_ID);
      const stat = (characterOf(state) as CharacterState).stats.str;

      expect(line, 'thiếu dòng chỉ số — chủng tộc và chỉ số phải đi qua registry').toBeDefined();
      expect(line?.value).toBe(statContribution('d100', stat));
      expect(line?.label).toContain('Sức mạnh');
    }
  });

  it('chỉ Lùn Núi có dòng đặc tính, đúng con số trong data/traits.json', () => {
    const lun = stateFor('race_lun-nui', 'origin_tho-thu-cong');
    const tien = stateFor('race_cao-tien', 'origin_giao-si');
    const orc = stateFor('race_orc', 'origin_hiep-si');

    const dongDacTinh = (state: GameState): { label: string; value: number }[] =>
      runCheck(createRng(SEED), trongHam(state)).result.modifiers.filter(
        (entry) => entry.source === TRAIT_SOURCE_ID,
      );

    const cuaLun = dongDacTinh(lun);
    expect(cuaLun.map((entry) => entry.label)).toContain('Mắt trong đá');
    // Con số phải bằng đúng thứ khai trong data, không phải một số nào đó trong code.
    const khaiTrongData = traitOf('trait_mat-trong-da')?.effects.find((effect) =>
      effect.domains.includes('skill.xay-cat'),
    );
    expect(cuaLun.find((entry) => entry.label === 'Mắt trong đá')?.value).toBe(khaiTrongData?.value);

    expect(dongDacTinh(tien)).toEqual([]);
    expect(dongDacTinh(orc)).toEqual([]);
  });

  it('ba nhân vật ra ba ngưỡng khác nhau, và chênh lệch đọc được từng dòng', () => {
    const nguong = (raceId: string, originId: string): number => {
      const state = stateFor(raceId, originId);
      const result = runCheck(createRng(SEED), trongHam(state)).result;
      const tong = result.modifiers.reduce((sum, line) => sum + line.value, 0);
      // Ngưỡng cuối phải bằng đúng tổng các dòng cộng với nền — nếu lệch thì có
      // ai đó đang cộng lén một khoản không hiện ra.
      expect(result.target).toBe(tong);
      return result.target ?? 0;
    };

    const lun = nguong('race_lun-nui', 'origin_tho-thu-cong');
    const tien = nguong('race_cao-tien', 'origin_giao-si');
    const orc = nguong('race_orc', 'origin_hiep-si');

    expect(new Set([lun, tien, orc]).size).toBe(3);
    // Lùn Núi (STR +2, Mắt trong đá +15) phải hơn Cao Tiên (STR -2, không đặc tính).
    expect(lun).toBeGreaterThan(tien);
  });

  it('đặc tính có điều kiện thì TẮT khi hoàn cảnh không khớp', () => {
    const state = stateFor('race_lun-nui', 'origin_tho-thu-cong');
    const ngoaiTroi = runCheck(createRng(SEED), { ...trongHam(state), tags: [] }).result;
    expect(ngoaiTroi.modifiers.some((line) => line.label === 'Mắt trong đá')).toBe(false);
  });

  it('đặc tính hai chiều: Huyết Tộc mạnh trong đêm, yếu dưới nắng gắt', () => {
    const state = stateFor('race_huyet-toc', 'origin_dai-quy-toc');
    const spec = (tags: string[]): CheckSpec => ({
      id: 'check.thu',
      system: 'd100',
      domain: 'skill.len-lut',
      difficulty: 'thuong',
      base: 0,
      state,
      tags,
    });

    const dem = runCheck(createRng(SEED), spec(['ban-dem'])).result;
    const trua = runCheck(createRng(SEED), spec(['nang-gat'])).result;

    expect(dem.modifiers.some((line) => line.label === 'Mắt trong tối' && line.value > 0)).toBe(true);
    expect(trua.modifiers.some((line) => line.label === 'Sợ ánh sáng' && line.value < 0)).toBe(true);
    expect(dem.target ?? 0).toBeGreaterThan(trua.target ?? 0);
  });

  it('nguồn quy đổi đúng đơn vị của từng hệ (d100 / 3d6 / d20)', () => {
    const state = stateFor('race_lun-nui', 'origin_tho-thu-cong');
    const str = (characterOf(state) as CharacterState).stats.str;

    const d100 = runCheck(createRng(SEED), trongHam(state)).result;
    expect(d100.modifiers.find((line) => line.source === STAT_SOURCE_ID)?.value).toBe(str * 3);

    // `skill.xay-dung` thuộc nhóm Quản trị nên chạy 3d6, và chỉ số vào thẳng
    // ngưỡng chứ không nhân ba.
    const admin = runCheck(createRng(SEED), {
      ...trongHam(state),
      system: '3d6',
      domain: 'skill.xay-dung',
    }).result;
    const int = (characterOf(state) as CharacterState).stats.int;
    expect(admin.modifiers.find((line) => line.source === STAT_SOURCE_ID)?.value).toBe(int);
  });

  it('phép kiểm của một NPC KHÔNG mượn chỉ số của người chơi', () => {
    const state = stateFor('race_lun-nui', 'origin_tho-thu-cong');
    const cuaNpc = runCheck(createRng(SEED), { ...trongHam(state), actor: 'npc_ai-do' }).result;
    expect(cuaNpc.modifiers.some((line) => line.source === STAT_SOURCE_ID)).toBe(false);
    expect(cuaNpc.modifiers.some((line) => line.source === TRAIT_SOURCE_ID)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Mục 7 — tôn giáo, văn hóa, thế lực
// ---------------------------------------------------------------------------

describe('mục 7 — tôn giáo và văn hóa', () => {
  beforeEach(() => {
    resetModifierSources();
    registerCharacterSources();
  });

  const spec = (state: GameState, domain: string, tags: string[] = []): CheckSpec => ({
    id: 'check.thu',
    system: 'd100',
    domain,
    difficulty: 'thuong',
    base: 0,
    state,
    tags,
  });

  it('mọi miền `skill.*` mà tôn giáo và văn hóa khai đều trỏ tới kỹ năng có thật', () => {
    const domains = new Set(allSkills().map((skill) => domainOfSkill(skill.id)));
    for (const belief of [...allReligions(), ...allCultures()]) {
      for (const effect of belief.effects) {
        for (const domain of effect.domains) {
          if (!domain.startsWith('skill.') || domain.endsWith('*')) continue;
          expect(`${belief.id} → ${domain}`).toBe(`${belief.id} → ${domains.has(domain) ? domain : 'KHÔNG CÓ'}`);
        }
      }
    }
  });

  it('mức sùng đạo nhân vào hiệu ứng — sùng đạo 0 thì tôn giáo không đụng vào con số nào', () => {
    const state = stateFor('race_teuton', 'origin_giao-si');
    const character = characterOf(state) as CharacterState;
    character.allegiance.religionId = 'rel_giao-hoi';

    character.allegiance.piety = 100;
    const sungDao = runCheck(createRng(SEED), spec(state, 'skill.giang-dao')).result;

    character.allegiance.piety = 0;
    const hoNguoi = runCheck(createRng(SEED), spec(state, 'skill.giang-dao')).result;

    const dong = (result: typeof sungDao): number =>
      result.modifiers.filter((line) => line.source === RELIGION_SOURCE_ID).reduce((sum, line) => sum + line.value, 0);

    expect(dong(sungDao)).toBe(15);
    expect(dong(hoNguoi)).toBe(0);
  });

  it('sùng đạo nhân CẢ vế cấm, không chỉ vế thưởng', () => {
    const state = stateFor('race_teuton', 'origin_giao-si');
    const character = characterOf(state) as CharacterState;
    character.allegiance.religionId = 'rel_giao-hoi';
    character.allegiance.piety = 100;

    // Giáo hội cấm huyền thuật: người sùng đạo bị phạt NẶNG hơn, không nhẹ hơn.
    const line = runCheck(createRng(SEED), spec(state, 'skill.huyen-thuat')).result.modifiers.find(
      (entry) => entry.source === RELIGION_SOURCE_ID,
    );
    expect(line?.value).toBe(-20);
  });

  it('văn hóa tách khỏi chủng tộc: một Frank nuôi ở thảo nguyên cưỡi ngựa giỏi hơn', () => {
    const tay = stateFor('race_frank', 'origin_nong-no');
    const thaoNguyen = stateFor('race_frank', 'origin_nong-no');
    (characterOf(tay) as CharacterState).identity.cultureId = 'cul_thanh-bang-latin';
    (characterOf(thaoNguyen) as CharacterState).identity.cultureId = 'cul_thao-nguyen';

    const nguong = (state: GameState): number =>
      runCheck(createRng(SEED), spec(state, 'skill.cuoi-ngua')).result.target ?? 0;

    expect(nguong(thaoNguyen)).toBeGreaterThan(nguong(tay));
    // Nhưng chỉ số thì vẫn y hệt nhau — văn hóa dạy, chủng tộc cho thân thể.
    expect((characterOf(tay) as CharacterState).stats).toEqual((characterOf(thaoNguyen) as CharacterState).stats);
  });

  it('thái độ các thế lực ghi xuống state, và sửa tay được đè lên mặc định', () => {
    const draft = { ...draftFor('race_orc', 'origin_hiep-si') };
    draft.allegiance = { ...draft.allegiance, attitudes: { 'nation_giao-trieu': 40 } };
    const character = finalize(draft);

    expect(character.allegiance.attitudes['nation_ottoman']).toBe(25);
    expect(character.allegiance.attitudes['nation_giao-trieu']).toBe(40);
  });
});

// ---------------------------------------------------------------------------
// Mục 9 bước 8 — trang bị, thành trì, thái ấp
// ---------------------------------------------------------------------------

describe('mục 9 bước 8 — khai báo sở hữu', () => {
  beforeEach(() => {
    resetModifierSources();
    registerCharacterSources();
  });

  it('mọi món trang bị của mọi giai tầng đều có thật trong data/gear.json', () => {
    for (const origin of allOrigins()) {
      for (const entry of origin.gear) {
        expect(gearOf(entry.item), `${origin.id} → ${entry.item}`).not.toBeNull();
      }
    }
  });

  it('giáp KHÔNG khai một con số phòng thủ tổng — chỉ khai vùng cơ thể nó che', () => {
    for (const item of allGear().filter((entry) => entry.kind === 'giap')) {
      expect(item.coverage.length, item.id).toBeGreaterThan(0);
      // README mục 8.5: rút giáp thành một con số là hỏng cơ chế đâm khe hở.
      expect(item.skillBonus, item.id).toBeUndefined();
    }
  });

  it('tay nghề thợ đổi thật con số: kiệt tác hơn thợ vụng đúng 30 điểm d100', () => {
    const tot = carry('item_kiem-dai', { quality: 'kiet-tac' });
    const te = carry('item_kiem-dai', { quality: 'tho-vung' });
    if (tot === null || te === null) throw new Error('không dựng được món trang bị');
    expect((gearEffect(tot)?.value ?? 0) - (gearEffect(te)?.value ?? 0)).toBe(30);
  });

  it('chỉ món ĐANG MANG mới cộng vào phép kiểm', () => {
    const state = stateFor('race_frank', 'origin_hiep-si');
    const character = characterOf(state) as CharacterState;
    const spec = (): CheckSpec => ({
      id: 'check.thu',
      system: 'd100',
      domain: 'skill.kiem-thuat',
      difficulty: 'thuong',
      base: 0,
      state,
      tags: [],
    });

    const dangCam = runCheck(createRng(SEED), spec()).result;
    expect(dangCam.modifiers.some((line) => line.source === GEAR_SOURCE_ID && line.label.includes('Kiếm dài'))).toBe(true);

    for (const entry of character.gear) entry.equipped = false;
    const trongTui = runCheck(createRng(SEED), spec()).result;
    expect(trongTui.modifiers.some((line) => line.source === GEAR_SOURCE_ID)).toBe(false);
  });

  it('con thứ KHÔNG thừa kế thành trì và thái ấp, nhưng vẫn mang được trang bị', () => {
    const conCa = withOrigin({ ...newDraft('thua-ke'), birthOrderId: 'con-ca' }, 'origin_dai-quy-toc');
    const conThu = withOrigin({ ...newDraft('thua-ke'), birthOrderId: 'con-thu' }, 'origin_dai-quy-toc');

    expect(conCa.holdings.length).toBeGreaterThan(0);
    expect(conCa.fiefs.length).toBeGreaterThan(0);
    expect(conThu.holdings).toEqual([]);
    expect(conThu.fiefs).toEqual([]);
    expect(conThu.gear.length).toBe(conCa.gear.length);
  });

  it('đổi thứ tự con SAU khi đã chọn giai tầng vẫn dựng lại phần thừa kế', () => {
    // Đây là bug đã gặp thật: ô "thứ tự trong nhà" gán thẳng `birthOrderId` thì
    // người chơi đổi sang con cả mà tay vẫn trắng, và chỉ phát hiện ở bước 8.
    const base = withOrigin({ ...newDraft('doi-thu-tu'), birthOrderId: 'con-thu' }, 'origin_dai-quy-toc');
    expect(base.holdings).toEqual([]);

    const doiSangConCa = withOrigin({ ...base, birthOrderId: 'con-ca' }, base.originId);
    expect(doiSangConCa.holdings.length).toBeGreaterThan(0);
    expect(doiSangConCa.fiefs.length).toBeGreaterThan(0);
  });

  it('ba tầng nằm ở ba khóa riêng — thành trì, thái ấp, lãnh thổ không lẫn vào nhau', () => {
    const character = finalize(draftFor('race_frank', 'origin_dai-quy-toc', SEED, 'con-ca'));
    expect(character.holdings.every((entry) => entry.id.startsWith('hold_'))).toBe(true);
    expect(character.fiefs.every((entry) => entry.id.startsWith('fief_'))).toBe(true);
    expect(typeof character.realmRole).toBe('string');
  });

  it('biến phụ: trọng lượng mang và bậc tước cao nhất', () => {
    const state = buildInitialState(draftFor('race_frank', 'origin_dai-quy-toc', SEED, 'con-ca'));
    const derived = computeDerived(state, { strict: true });
    expect(derived['trongLuongMang']).toBeGreaterThan(20);
    // Đại quý tộc khởi đầu là Bá tước — bậc 4 trên thang của Phần 13 mục 2.
    expect(derived['bacTuoc']).toBe(4);
  });

  it('thành trì và tước vị lúc tạo được gieo sang hệ thật, không chỉ nằm trong hồ sơ chữ', () => {
    const state = buildInitialState(draftFor('race_frank', 'origin_dai-quy-toc', SEED, 'con-ca'));
    const character = characterOf(state) as CharacterState;
    const holdings = allHoldings(state);
    const titles = heldTitles(state);

    expect(holdings).toHaveLength(character.holdings.length);
    expect(holdings[0]?.id).toBe(character.holdings[0]?.id);
    expect(holdings.filter((holding) => holding.seat)).toHaveLength(1);
    expect(titles).toHaveLength(character.fiefs.length);
    expect(titles[0]?.fiefId).toBe(character.fiefs[0]?.id);
    expect(titles[0]?.titleId).toBe('ba-tuoc');
  });

  it('con đường có tước quyết định chính danh ban đầu, không mặc định mọi tước là thừa kế', () => {
    const base = draftFor('race_frank', 'origin_dai-quy-toc', SEED, 'con-ca');
    const draft = { ...base, fiefs: base.fiefs.map((fief) => ({ ...fief, acquisition: 'chiem-doat' as const })) };
    const title = heldTitles(buildInitialState(draft))[0];

    expect(title?.path).toBe('chiem-doat');
    expect(title?.legitimacy).toBe(22);
    expect(title?.churchRecognised).toBe(false);
  });

  it('slugify sinh id hợp lệ từ tên tiếng Việt có dấu', () => {
    expect(slugify('Thôn Bạch Dương')).toBe('thon-bach-duong');
    expect(holdingIdFor('Thành Ehrenfeld')).toBe('hold_thanh-ehrenfeld');
    expect(holdingIdFor('Thôn A', new Set(['hold_thon-a']))).toBe('hold_thon-a-2');
  });

  it('hai thành trì trùng id bị ràng buộc chéo chặn lại', () => {
    const state = createInitialState('trung-id');
    const character = characterOf(state) as CharacterState;
    character.holdings = [
      { id: 'hold_a', name: 'A', tier: 'thon', role: 'chu-so-huu', regionId: '', note: '' },
      { id: 'hold_a', name: 'A lần hai', tier: 'thon', role: 'chu-so-huu', regionId: '', note: '' },
    ];
    const failing = slices
      .constraints()
      .map(({ constraint }) => constraint.check(state))
      .filter((message) => message !== null);
    expect(failing.join(' ')).toContain('trùng id');
  });
});

// ---------------------------------------------------------------------------
// Gia tộc và quyền thừa kế — nối nhân vật vào thế giới đã có
// ---------------------------------------------------------------------------

describe('gia tộc', () => {
  it('mọi con trỏ của gia tộc đều trỏ vào thứ có thật', () => {
    const people = new Set(lorePeople().map((person) => person.id));
    const regions = new Set(allRegions().map((region) => region.id));
    const races = new Set(allRaces().map((race) => race.id));
    const ranks = new Set(fiefTitles().map((title) => title.id));

    for (const house of allHouses()) {
      // `head` rỗng là hợp lệ — nhà lịch sử không có nhân vật trong lorebook thì
      // dùng `headName` thay. Nhưng đã khai thì phải trỏ vào người có thật.
      if (house.head !== '') {
        expect(people.has(house.head), `${house.id} → head ${house.head}`).toBe(true);
      }
      expect(races.has(house.race), `${house.id} → race ${house.race}`).toBe(true);
      expect(ranks.has(house.rank), `${house.id} → rank ${house.rank}`).toBe(true);
      for (const key of ['realm', 'seat', 'province'] as const) {
        const value = house[key];
        if (value === '') continue;
        expect(regions.has(value), `${house.id} → ${key} ${value}`).toBe(true);
      }
      for (const claim of house.claims) {
        expect(regions.has(claim), `${house.id} → claim ${claim}`).toBe(true);
      }
    }
  });

  it('mọi gia tộc đều có người đứng đầu, dù không có trong lorebook', () => {
    for (const house of allHouses()) {
      expect(houseHeadName(house.id), house.id).not.toBe('');
      // Đúng một trong hai nguồn, không phải cả hai và không phải không nguồn nào.
      expect(house.head === '' ? house.headName !== '' : house.headName === '', house.id).toBe(true);
    }
  });

  it('đối địch và liên minh LUÔN hai chiều', () => {
    // Một bên coi là thù mà bên kia không biết thì bảng chính trị của Phần 13/14
    // sẽ đọc ra hai thế giới khác nhau tùy nó hỏi từ phía nào.
    for (const house of allHouses()) {
      for (const rival of house.rivals) {
        expect(houseOf(rival)?.rivals, `${house.id} ↔ ${rival}`).toContain(house.id);
      }
      for (const ally of house.allies) {
        expect(houseOf(ally)?.allies, `${house.id} ↔ ${ally}`).toContain(house.id);
      }
      expect(house.rivals, house.id).not.toContain(house.id);
      expect(house.allies, house.id).not.toContain(house.id);
    }
  });

  it('nhánh trưởng và nhánh thứ khớp nhau hai chiều', () => {
    for (const house of allHouses()) {
      if (house.parent !== '') {
        expect(houseOf(house.parent)?.cadets, `${house.id} → ${house.parent}`).toContain(house.id);
      }
      for (const cadet of house.cadets) {
        expect(houseOf(cadet)?.parent, `${house.id} → ${cadet}`).toBe(house.id);
      }
    }
  });

  it('kho gia tộc đủ rộng và xếp được theo vùng', () => {
    expect(allHouses().length).toBeGreaterThan(100);
    // Quá nửa số nhà KHÔNG có nhân vật lorebook — đó là chỗ lịch sử thật bù vào.
    expect(allHouses().filter((house) => house.head === '').length).toBeGreaterThan(40);
    const groups = housesByGroup();
    expect(groups.length).toBeGreaterThan(15);
    expect(groups.reduce((sum, group) => sum + group.houses.length, 0)).toBe(allHouses().length);
  });

  it('tìm gia tộc bỏ dấu, khớp cả vùng lẫn chủng tộc', () => {
    expect(searchHouses('habsburg').map((house) => house.id)).toContain('house_habsburg');
    // Không dấu vẫn ra.
    expect(searchHouses('hunyadi').map((house) => house.id)).toContain('house_hunyadi');
    expect(searchHouses('vuong quoc phap').length).toBeGreaterThan(1);
    expect(searchHouses('khong-co-nha-nao-ten-nhu-vay')).toEqual([]);
    // Ô tìm rỗng thì trả về hết, không phải trả về rỗng.
    expect(searchHouses('  ').length).toBe(allHouses().length);
  });

  it('gia tộc lịch sử được gán chủng tộc hợp vùng', () => {
    // Hunyadi ở Hungary — vùng của Long Duệ, Mục Nhân và Huyết Tộc theo 14b.
    expect(houseOf('house_hunyadi')?.race).toBe('race_long-due');
    // Fugger ở Swabia — Gnome là tộc cơ khí và ngân hàng của Đế quốc.
    expect(houseOf('house_fugger')?.race).toBe('race_gnome');
  });

  it('giai tầng thấp không chọn được gia tộc, giai tầng cao thì có', () => {
    expect(housesForOrigin('origin_nong-no')).toEqual([]);
    expect(housesForOrigin('origin_nong-dan-tu-do')).toEqual([]);
    expect(housesForOrigin('origin_vuong-that').length).toBeGreaterThan(0);
    // Vương thất chọn được cả nhà bậc đại quý tộc; đại quý tộc thì không với tới
    // vương thất.
    const vuongThat = housesForOrigin('origin_vuong-that').map((house) => house.id);
    const daiQuyToc = housesForOrigin('origin_dai-quy-toc').map((house) => house.id);
    expect(vuongThat).toContain('house_valois');
    expect(daiQuyToc).not.toContain('house_valois');
  });

  it('chọn gia tộc kéo theo họ, thành trì gốc và yêu sách', () => {
    const draft = withHouse(withOrigin({ ...newDraft('nha'), birthOrderId: 'con-ca' }, 'origin_vuong-that'), 'house_habsburg');

    expect(draft.familyName).toBe('Habsburg');
    // Nhà Habsburg đóng ở Vienna — thành trì có thật trong regions.json.
    expect(draft.holdings.some((entry) => entry.id === 'hold_vienna')).toBe(true);
    // Và mang theo yêu sách lên ngai Đế quốc.
    expect(draft.claims.some((claim) => claim.target === 'realm_hre')).toBe(true);
  });

  it('"mẹ là con gái vua Đức" thành một yêu sách thật', () => {
    let draft = withHouse(withOrigin({ ...newDraft('me-vua'), birthOrderId: 'con-ca' }, 'origin_vuong-that'), 'house_valois');
    draft = rollFamily(draft, createRng('me-vua'));

    const truoc = draft.claims.filter((claim) => claim.target === 'realm_hre');
    expect(truoc).toEqual([]);

    const me = draft.family.find((member) => member.relation === 'me');
    if (me === undefined) throw new Error('bản nháp không có mẹ');
    // Nhà Habsburg đang đòi ngai Đế quốc; gán nhà mẹ là Habsburg thì người chơi
    // đứng trong hàng qua mẹ.
    draft = setFamilyHouse(draft, me.id, 'house_habsburg');

    const sau = draft.claims.find((claim) => claim.target === 'realm_hre');
    expect(sau).toBeDefined();
    expect(sau?.through).toBe(me.id);
    expect(sau?.throughLabel).toContain('mẹ');
    // Yêu sách qua mẹ yếu hơn yêu sách của chính mình.
    expect(sau?.strength).not.toBe('manh');

    // Và mẹ mang họ nhà MẸ, không mang họ nhà chồng.
    const meSau = draft.family.find((member) => member.id === me.id);
    expect(meSau?.name).toContain('Habsburg');
    expect(meSau?.name).not.toContain('Valois');
  });

  it('tên người nhà đã gõ tay thì đổi nhà KHÔNG ghi đè lên', () => {
    let draft = withHouse(withOrigin({ ...newDraft('ten-tay'), birthOrderId: 'con-ca' }, 'origin_vuong-that'), 'house_valois');
    draft = rollFamily(draft, createRng('ten-tay'));
    const me = draft.family.find((member) => member.relation === 'me');
    if (me === undefined) throw new Error('bản nháp không có mẹ');

    draft = { ...draft, family: draft.family.map((m) => (m.id === me.id ? { ...m, name: 'Bà Cả' } : m)) };
    draft = setFamilyHouse(draft, me.id, 'house_habsburg');

    expect(draft.family.find((m) => m.id === me.id)?.name).toBe('Bà Cả');
    // Yêu sách vẫn mọc ra bình thường.
    expect(draft.claims.some((claim) => claim.target === 'realm_hre')).toBe(true);
  });

  it('yêu sách của gia tộc mình mạnh hơn yêu sách qua người nhà', () => {
    let draft = withHouse(withOrigin({ ...newDraft('manh-yeu'), birthOrderId: 'con-ca' }, 'origin_vuong-that'), 'house_valois');
    draft = rollFamily(draft, createRng('manh-yeu'));
    const cuaMinh = draft.claims.find((claim) => claim.target === 'realm_france');
    expect(cuaMinh?.strength).toBe('manh');
  });

  it('đổi nhà của mẹ nhiều lần KHÔNG chồng yêu sách lên nhau', () => {
    let draft = withHouse(withOrigin({ ...newDraft('doi-nha'), birthOrderId: 'con-ca' }, 'origin_vuong-that'), 'house_valois');
    draft = rollFamily(draft, createRng('doi-nha'));
    const me = draft.family.find((member) => member.relation === 'me');
    if (me === undefined) throw new Error('bản nháp không có mẹ');

    draft = setFamilyHouse(draft, me.id, 'house_habsburg');
    draft = setFamilyHouse(draft, me.id, 'house_lancaster');
    draft = setFamilyHouse(draft, me.id, 'house_oldenburg');

    expect(draft.claims.some((claim) => claim.target === 'realm_hre')).toBe(false);
    expect(draft.claims.some((claim) => claim.target === 'realm_england')).toBe(false);
    expect(draft.claims.some((claim) => claim.target === 'realm_denmark')).toBe(true);
    // Và không có hai dòng nào cùng trỏ một mục tiêu.
    const targets = draft.claims.map((claim) => `${claim.kind}:${claim.target}`);
    expect(new Set(targets).size).toBe(targets.length);
  });

  it('bỏ gia tộc thì yêu sách theo nó biến mất', () => {
    let draft = withHouse(withOrigin({ ...newDraft('bo-nha'), birthOrderId: 'con-ca' }, 'origin_vuong-that'), 'house_habsburg');
    expect(draft.claims.length).toBeGreaterThan(0);
    draft = withHouse(draft, '');
    expect(draft.claims).toEqual([]);
  });

  it('lorebook đi kèm bản build có đủ nhân vật để nối vào', () => {
    const people = lorePeople();
    expect(people.length).toBeGreaterThan(50);
    expect(lorePersonName('npc_charlotte-de-valois')).toBe('Charlotte de Valois');
  });

  it('đọc được nội dung đầy đủ của từng entry lorebook bằng ID', () => {
    const details = loreEntryOf('npc_charlotte-de-valois');
    expect(details?.entry.title).toBe('Charlotte de Valois');
    expect(details?.entry.content.length).toBeGreaterThan(500);
    expect(details?.bookId).not.toBe('');
    expect(loreEntryOf('entry-khong-ton-tai')).toBeNull();
  });

  it('KHÔNG cho chọn tầng bí mật của lorebook lúc tạo nhân vật', () => {
    // Lorebook chiến dịch có tầng `gated`/`secret` là mặt riêng và động cơ thật
    // của cùng những nhân vật đó. Cho chọn tầng ấy là để người chơi đọc bí mật
    // của cả thế giới trước khi ván bắt đầu — đúng bệnh mà cổng tri thức của
    // Phần 4 sinh ra để chữa.
    const ids = new Set(lorePeople().map((person) => person.id));
    expect(ids.has('npc_frederica-von-habsburg')).toBe(true);
    expect(ids.has('npc_frederica-von-habsburg-rieng-tu')).toBe(false);
    expect(ids.has('npc_frederica-von-habsburg-be-trong')).toBe(false);
  });

  it('giai tầng có gia tộc mà bỏ trống là NHẮC, không phải chặn', () => {
    const draft = withOrigin({ ...newDraft('nhac') }, 'origin_dai-quy-toc');
    expect(stepHints(draft, 'xuat-than').length).toBeGreaterThan(0);
    // Nhưng không nằm trong danh sách chặn nút chốt.
    expect(stepIssues(draft, 'xuat-than')).toEqual([]);
  });

  it('yêu sách và sở hữu là hai khóa RIÊNG trong state', () => {
    const draft = withHouse(withOrigin({ ...newDraft('rieng'), birthOrderId: 'con-ca' }, 'origin_vuong-that'), 'house_habsburg');
    const character = finalize(spendEverything({ ...draft, givenName: 'Thử', familyName: 'Habsburg' }));

    // Đòi ngai Đế quốc, nhưng KHÔNG giữ nó.
    expect(character.claims.some((claim) => claim.target === 'realm_hre')).toBe(true);
    expect(character.holdings.some((entry) => entry.id === 'realm_hre')).toBe(false);
    expect(character.fiefs.some((entry) => entry.id === 'realm_hre')).toBe(false);
  });
});

describe('cảnh mở đầu', () => {
  it('nơi và người chọn ở bước 9 đi vào lời nhờ AI', () => {
    const draft = {
      ...draftFor('race_frank', 'origin_hiep-si'),
      opening: {
        holdingId: 'hold_troyes',
        withNpc: 'npc_charlotte-de-valois',
        situation: 'vừa bị gọi vào đại sảnh giữa đêm',
      },
    };
    const text = openingSceneAction(finalize(draft));

    expect(text).toContain('CẢNH MỞ ĐẦU DIỄN RA Ở: Thành Troyes');
    expect(text).toContain('Charlotte de Valois');
    expect(text).toContain('vừa bị gọi vào đại sảnh giữa đêm');
  });

  it('không chọn gì thì lời nhờ AI không có dòng cảnh mở đầu', () => {
    const text = openingSceneAction(finalize(draftFor('race_frank', 'origin_nong-no')));
    expect(text).not.toContain('CẢNH MỞ ĐẦU DIỄN RA Ở');
  });
});

// ---------------------------------------------------------------------------
// Nối vào Phần 5 mục 12.6
// ---------------------------------------------------------------------------

describe('nền của lượt tự do', () => {
  it('có nhân vật thì lấy điểm rèn luyện thật, không lấy con số giả', () => {
    const state = stateFor('race_frank', 'origin_hiep-si');
    const character = characterOf(state) as CharacterState;
    character.skills['skill_chung'] = { level: 25 };
    expect(freeformSkillFor(state)).toBe(25);
  });

  it('state chưa có nhân vật thì lùi về con số giả của Phần 5', () => {
    const rong = { meta: {}, player: {} } as unknown as GameState;
    expect(freeformSkillFor(rong)).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// Mục 5 — danh mục kỹ năng
// ---------------------------------------------------------------------------

describe('mục 5 — data/skills.json', () => {
  it('mười nhóm, và mỗi kỹ năng gán đúng một hệ xúc sắc của Phần 5', () => {
    expect(new Set(allSkills().map((skill) => skill.group)).size).toBe(10);
    for (const skill of allSkills()) {
      expect(['d100', '3d6'], skill.id).toContain(skill.system);
    }
  });

  it('nhóm Quản trị chạy 3d6 vì đó là năng lực dài hạn', () => {
    for (const skill of allSkills().filter((entry) => entry.group === 'quan-tri')) {
      expect(skill.system, skill.id).toBe('3d6');
    }
  });

  it('miền suy từ id nên nguồn khai `skill.*` bắt được hết', () => {
    expect(domainOfSkill('skill_kiem-thuat')).toBe('skill.kiem-thuat');
    expect(skillOf('skill_kiem-thuat')?.stat).toBe('agi');
  });

  it('công thức mục 1 khớp với con số hiện ra ở phiếu nhân vật', () => {
    expect(skillPercent(14, 20)).toBe(62);
    expect(statContribution('d20', 14)).toBe(2);
    expect(statContribution('pool', 14)).toBeNull();
  });
});
