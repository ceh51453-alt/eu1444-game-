/**
 * BÀI TEST CỦA CỬA TỪ TRUYỆN VÀO MINIGAME.
 *
 * Bài quan trọng nhất là bài cuối cùng: **bỏ qua một trận phải TỐN đúng bằng
 * đánh nó.** Nếu engine đánh thay mà không ghi thương tích, không ghi điểm thực
 * hành, không đẩy dòng xúc sắc đi, thì nút "Bỏ qua" trở thành nút "thắng miễn
 * phí" và cách chơi tối ưu là không bao giờ chơi.
 *
 * Những bài còn lại gác bốn luật cứng của module:
 *   · AI không chạm được vào một con số nào — chỉ bốn nấc và ba nấc
 *   · chữ lạ thì HẠ nấc, không lùi về nấc giữa (khuôn của Phần 7 mục 3)
 *   · nhiều nhất MỘT lời mời mỗi lượt
 *   · tương quan là tương đối với NGƯỜI CHƠI, không phải một thang tuyệt đối
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { createRng } from '@/core/rng';
import { registerGameSlices } from '@/state/register';
import { createInitialState } from '@/state/store';
import { applyPatch } from '@/state/mvu';
import type { GameState } from '@/state/slices';
import { resetModifierSources } from '@/systems/check';
import { registerCharacterSources } from '@/systems/character';
import { characterOf, type CharacterState } from '@/systems/character/slice';
import { bodyOf } from '@/systems/body/slice';
import { registerBodySources } from '@/systems/body/modifiers';
import { registerSkillSources } from '@/systems/skills/modifiers';
import { registerDuelSources } from '@/minigames/duel';
import { registerBattleSources } from '@/minigames/battle';
import { registerSiegeSources } from '@/systems/siege';
import { militarySliceSchema } from '@/systems/military';
import { newItem } from '@/systems/items';
import {
  autoResolve,
  buildEncounter,
  parseEncounterRequests,
  playerFighterSpec,
  screenEncounters,
  stripEncounterRequests,
  type EncounterOffer,
} from './index';

registerGameSlices();

beforeEach(() => {
  resetModifierSources();
  registerCharacterSources();
  registerBodySources();
  registerSkillSources();
  registerDuelSources();
  registerBattleSources();
  registerSiegeSources();
});

/** Một ván chơi có nhân vật đã chốt, kiếm thuật đặt được. */
function playing(swordSkill = 40, seed = 'encounter'): GameState {
  const state = createInitialState(seed, 'Ngài');
  const character = characterOf(state) as CharacterState;
  character.identity.finalized = true;
  character.identity.name = 'Guillaume';
  character.skills = { 'skill_kiem-thuat': { level: swordSkill } };
  return state;
}

function offerFrom(raw: string, state: GameState): EncounterOffer {
  const screening = screenEncounters(state, parseEncounterRequests(raw), state.meta.turn + 1);
  const offer = screening.offer;
  if (offer === null) throw new Error(`không có lời mời nào: ${screening.refused.map((r) => r.reason).join('; ')}`);
  return offer;
}

// ---------------------------------------------------------------------------
// Đọc thẻ
// ---------------------------------------------------------------------------

describe('đọc thẻ trong văn bản AI', () => {
  it('đọc được cả ba thẻ, và nhận tiếng Việt có dấu', () => {
    const raw = [
      'Hắn rút kiếm.',
      '<RequestDuel loai="dau-danh-du" doi-thu="Ser Aymer" trinh-do="ngang cơ" noi="sân trước nhà thờ" />',
      '<RequestBattle doi-thu="Đoàn cướp biên" quy-mo="lớn" the="thủ" />',
      "<RequestSiege thanh='Lâu đài Montfort' ben='vây' trinh-do='vượt xa' />",
    ].join('\n');

    const parsed = parseEncounterRequests(raw);
    expect(parsed.map((item) => item.request.kind)).toEqual(['duel', 'battle', 'siege']);

    const duel = parsed[0]?.request;
    expect(duel?.foe).toBe('Ser Aymer');
    expect(duel?.power).toBe('ngang-co');
    expect(duel?.place).toBe('sân trước nhà thờ');

    expect(parsed[1]?.request.scale).toBe('lon');
    expect(parsed[1]?.request.side).toBe('thu');
    expect(parsed[2]?.request.power).toBe('vuot-xa');
    expect(parsed[2]?.request.side).toBe('cong');
  });

  it('bóc thẻ khỏi đoạn văn — người chơi đọc truyện, không đọc thẻ', () => {
    const raw = 'Hắn rút kiếm.\n<RequestDuel doi-thu="Ser Aymer" />\n';
    expect(stripEncounterRequests(raw)).toBe('Hắn rút kiếm.');
  });

  it('thẻ hỏng không làm hỏng gì — không có thẻ nào thì không có lời mời nào', () => {
    expect(parseEncounterRequests('Hắn rút kiếm rồi lại tra vào vỏ.')).toHaveLength(0);
    expect(parseEncounterRequests('<RequestFeast doi-thu="x" />')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Kiểm duyệt
// ---------------------------------------------------------------------------

describe('bốn cửa kiểm duyệt', () => {
  it('chữ lạ thì HẠ nấc, không lùi về nấc giữa', () => {
    const state = playing();
    const screening = screenEncounters(
      state,
      parseEncounterRequests('<RequestBattle doi-thu="X" trinh-do="mạnh khủng khiếp" quy-mo="mênh mông" />'),
      1,
    );
    expect(screening.offer?.request.power).toBe('kem-hon');
    expect(screening.offer?.request.scale).toBe('nho');
    expect(screening.log.length).toBe(2);
  });

  it('thuộc tính VẮNG MẶT thì rơi về nấc trung tính, không bị phạt', () => {
    const state = playing();
    const screening = screenEncounters(state, parseEncounterRequests('<RequestBattle doi-thu="X" />'), 1);
    expect(screening.offer?.request.power).toBe('ngang-co');
    expect(screening.offer?.request.scale).toBe('vua');
    expect(screening.log).toHaveLength(0);
  });

  it('nhiều nhất MỘT lời mời mỗi lượt', () => {
    const state = playing();
    const screening = screenEncounters(
      state,
      parseEncounterRequests('<RequestDuel doi-thu="A" /><RequestDuel doi-thu="B" /><RequestBattle doi-thu="C" />'),
      1,
    );
    expect(screening.offer?.request.foe).toBe('A');
    expect(screening.refused).toHaveLength(2);
    expect(screening.refused[0]?.reason).toContain('một trận');
  });

  it('chưa chốt nhân vật, hoặc đã chết, thì từ chối tất', () => {
    const fresh = createInitialState('chua-chot');
    expect(screenEncounters(fresh, parseEncounterRequests('<RequestDuel doi-thu="A" />'), 1).offer).toBeNull();

    const dead = playing();
    const body = bodyOf(dead);
    if (body !== null) body.dead = true;
    const screening = screenEncounters(dead, parseEncounterRequests('<RequestDuel doi-thu="A" />'), 1);
    expect(screening.offer).toBeNull();
    expect(screening.refused[0]?.reason).toBe('nhân vật đã chết');
  });

  it('loại quyết đấu không có thật thì lùi về đấu danh dự — dừng ở giọt máu đầu', () => {
    const state = playing();
    const screening = screenEncounters(
      state,
      parseEncounterRequests('<RequestDuel loai="dau-tu-than" doi-thu="A" />'),
      1,
    );
    expect(screening.offer?.request.kindId).toBe('dau-danh-du');
    expect(screening.log[0]).toContain('dau-tu-than');
  });

  it('nhận TÊN tiếng Việt của loại quyết đấu, không bắt nhớ id', () => {
    const state = playing();
    const offer = offerFrom('<RequestDuel loai="Đấu sinh tử" doi-thu="A" />', state);
    expect(offer.request.kindId).toBe('dau-sinh-tu');
  });
});

// ---------------------------------------------------------------------------
// Dựng ván
// ---------------------------------------------------------------------------

describe('engine dựng ván từ bốn chữ AI nói', () => {
  it('TƯƠNG QUAN LÀ TƯƠNG ĐỐI: cùng một chữ, hai người chơi khác nhau ra hai đối thủ khác nhau', () => {
    const raw = '<RequestDuel doi-thu="Ser Aymer" trinh-do="ngang cơ" />';

    const skillOf = (playerSkill: number): number => {
      const state = playing(playerSkill);
      const built = buildEncounter(offerFrom(raw, state), state, createRng('x'), 1);
      if (built.kind !== 'duel') throw new Error('phải là quyết đấu');
      return built.duel.b.skills['skill_kiem-thuat'] ?? 0;
    };

    const novice = skillOf(10);
    const veteran = skillOf(80);
    expect(veteran).toBeGreaterThan(novice + 30);
  });

  it('bốn nấc xếp đúng thứ tự, và "vượt xa" có sàn tuyệt đối', () => {
    const state = playing(10);
    const skills = (['kém hơn', 'ngang cơ', 'hơn', 'vượt xa'] as const).map((word) => {
      const built = buildEncounter(
        offerFrom(`<RequestDuel doi-thu="A" trinh-do="${word}" />`, state),
        state,
        createRng('x'),
        1,
      );
      if (built.kind !== 'duel') throw new Error('phải là quyết đấu');
      return built.duel.b.skills['skill_kiem-thuat'] ?? 0;
    });

    expect(skills[0]).toBeLessThan(skills[1] ?? 0);
    expect(skills[1]).toBeLessThan(skills[2] ?? 0);
    expect(skills[2]).toBeLessThan(skills[3] ?? 0);
    // Một huyền thoại vẫn là huyền thoại kể cả khi người chơi mới cầm kiếm.
    expect(skills[3]).toBeGreaterThanOrEqual(50);
  });

  it('địa danh trong truyện chọn sàn đấu và bãi chiến', () => {
    const state = playing();

    const duel = buildEncounter(
      offerFrom('<RequestDuel doi-thu="A" noi="một ngõ hẹp sau chợ" />', state),
      state,
      createRng('x'),
      1,
    );
    if (duel.kind !== 'duel') throw new Error('phải là quyết đấu');
    expect(duel.duel.arena.id).toContain('ngo-hep');

    const battle = buildEncounter(
      offerFrom('<RequestBattle doi-thu="A" noi="khúc sông dưới cầu đá" />', state),
      state,
      createRng('x'),
      1,
    );
    if (battle.kind !== 'battle') throw new Error('phải là dã chiến');
    expect(battle.battle.grid.fieldId).toBe('field_khuc-song');
  });

  it('quy mô ra quân số, tương quan ra tỷ lệ quân địch', () => {
    const state = playing();
    const built = buildEncounter(
      offerFrom('<RequestBattle doi-thu="Đoàn cướp" quy-mo="vừa" trinh-do="hơn" />', state),
      state,
      createRng('x'),
      1,
    );
    if (built.kind !== 'battle') throw new Error('phải là dã chiến');

    const menOf = (side: 'a' | 'b'): number =>
      built.battle.units.filter((unit) => unit.side === side).reduce((sum, unit) => sum + unit.strength, 0);
    const ours = menOf('a');
    const theirs = menOf('b');
    expect(theirs).toBeGreaterThan(ours);
    expect(theirs / ours).toBeLessThan(1.8);
  });

  it('vây hãm: bên người chơi, bậc tường và MÙA lấy từ lịch ván chơi', () => {
    const state = playing();
    state.meta.gameDate = { ...state.meta.gameDate, month: 1 };

    const built = buildEncounter(
      offerFrom('<RequestSiege thanh="Lâu đài Montfort" ben="thủ" trinh-do="vượt xa" quy-mo="lớn" />', state),
      state,
      createRng('x'),
      1,
    );
    if (built.kind !== 'siege') throw new Error('phải là vây hãm');

    expect(built.siege.playerSide).toBe('thu');
    expect(built.siege.seasonId).toBe('dong');
    // Tên tòa thành nói "lâu đài" nên nó thắng bảng tương quan — truyện tả gì thì dựng nấy.
    expect(built.siege.fort.templateId).toBe('fort_lau-dai-da');
    expect(built.siege.attacker.troops).toBe(5200);
  });
});

// ---------------------------------------------------------------------------
// Bỏ qua — bài quan trọng nhất
// ---------------------------------------------------------------------------

describe('bỏ qua: engine đánh thay và TÍNH TIỀN đầy đủ', () => {
  it('quyết đấu chạy tới cùng, ghi hệ quả thật, và đẩy dòng xúc sắc đi', () => {
    const state = playing(35);
    const rng = createRng('bo-qua');
    const built = buildEncounter(
      offerFrom('<RequestDuel loai="dau-sinh-tu" doi-thu="Ser Aymer" trinh-do="ngang cơ" />', state),
      state,
      rng,
      1,
    );
    const outcome = autoResolve(built, state, rng);

    if (built.kind !== 'duel') throw new Error('phải là quyết đấu');
    expect(outcome.summary).toContain('Ser Aymer');
    expect(outcome.outcome).toContain('Quyết đấu');

    // R3: vị trí dòng xúc sắc PHẢI về lại save, không thì trận sau tung lại
    // đúng chuỗi này.
    const rngOp = outcome.ops.find((op) => op.path === 'meta.rng.streams.duel');
    expect(rngOp).toBeDefined();

    // Và cả lô phải đi lọt qua MVU với actor engine — nếu không thì "bỏ qua" là
    // một trận đánh không tốn gì cả.
    const applied = applyPatch(state, outcome.ops, { actor: 'engine' });
    expect(applied.applied).toBe(true);
  });

  it('cùng seed, cùng lời mời thì ra cùng kết cục (R3)', () => {
    const raw = '<RequestDuel loai="dau-sinh-tu" doi-thu="Ser Aymer" trinh-do="ngang cơ" />';
    const once = (): string => {
      const state = playing(35, 'lap-lai');
      const rng = createRng('cung-mot-hat');
      const built = buildEncounter(offerFrom(raw, state), state, rng, 1);
      return autoResolve(built, state, rng).outcome;
    };
    expect(once()).toBe(once());
  });

  it('dã chiến chạy trọn, kể cả phần truy kích và tù binh sau trận', () => {
    const state = playing();
    const rng = createRng('da-chien');
    const built = buildEncounter(
      offerFrom('<RequestBattle doi-thu="Đoàn cướp biên" quy-mo="nhỏ" trinh-do="kém hơn" />', state),
      state,
      rng,
      1,
    );
    const outcome = autoResolve(built, state, rng);

    expect(outcome.outcome).toContain('Dã chiến');
    expect(outcome.summary).toContain('mất');
    expect(outcome.ops.some((op) => op.path === 'meta.rng.streams.battle')).toBe(true);
    expect(applyPatch(state, outcome.ops, { actor: 'engine' }).applied).toBe(true);
  });

  it('vây hãm chạy tới lúc ngã ngũ, không treo vòng lặp (R4)', () => {
    const state = playing();
    const rng = createRng('vay-ham');
    const built = buildEncounter(
      offerFrom('<RequestSiege thanh="Tháp canh biên" ben="vây" quy-mo="vừa" trinh-do="kém hơn" />', state),
      state,
      rng,
      1,
    );
    const outcome = autoResolve(built, state, rng);

    if (built.kind !== 'siege') throw new Error('phải là vây hãm');
    expect(outcome.outcome).toContain('Vây hãm');
    expect(outcome.summary).toContain('tuần');
    expect(outcome.ops.some((op) => op.path === 'meta.rng.streams.siege')).toBe(true);
    expect(applyPatch(state, outcome.ops, { actor: 'engine' }).applied).toBe(true);
  });
});

describe('liên kết dữ liệu thật với minigame', () => {
  it('dã chiến lấy quân số và thành phần từ đạo quân thật của người chơi', () => {
    const state = playing();
    state['military'] = militarySliceSchema.parse({
      forces: [{
        id: 'force_player',
        name: 'Đạo quân Montfort',
        kind: 'land',
        commander: 'Guillaume',
        location: 'biên giới',
        units: [
          { id: 'unit_levy', typeId: 'unit_bo-binh-thue', name: 'Bộ binh', source: 'levy', strength: 430, morale: 55, experience: 15, training: 25, monthlyUpkeep: 12 },
          { id: 'unit_archer', typeId: 'unit_cung-thu', name: 'Cung thủ', source: 'barracks', strength: 70, morale: 64, experience: 30, training: 48, monthlyUpkeep: 18 },
        ],
      }],
    });

    const built = buildEncounter(
      offerFrom('<RequestBattle doi-thu="Đoàn cướp" quy-mo="nhỏ" />', state),
      state,
      createRng('quan-that'),
      1,
    );
    if (built.kind !== 'battle') throw new Error('phải là dã chiến');
    const ours = built.battle.units
      .filter((unit) => unit.side === built.battle.playerSide)
      .reduce((sum, unit) => sum + unit.strength, 0);
    expect(ours).toBeGreaterThanOrEqual(495);
    expect(ours).toBeLessThanOrEqual(505);
    expect(built.battle.units.some((unit) => unit.side === built.battle.playerSide && unit.typeId === 'unit_cung-thu')).toBe(true);
  });

  it('quyết đấu lấy trang bị đang mặc và đồ trong túi từ hệ vật phẩm thật', () => {
    const state = playing();
    const sword = newItem('item_kiem-mot-tay', { id: 'kiem-that' });
    const armour = newItem('item_giap-luoi', { id: 'giap-trong-tui' });
    state['items'] = { owned: [sword, armour] };
    state['equipment'] = { worn: [sword.id], packed: [armour.id] };

    const fighter = playerFighterSpec(state);
    expect(fighter.gear).toEqual(expect.arrayContaining([
      expect.objectContaining({ item: 'item_kiem-mot-tay', equipped: true }),
      expect.objectContaining({ item: 'item_giap-luoi', equipped: false }),
    ]));
  });
});
