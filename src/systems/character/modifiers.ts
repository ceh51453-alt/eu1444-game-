/**
 * SÁU NGUỒN MODIFIER THẬT của Phần 6 (mục 10.7), cắm vào registry của Phần 5.
 *
 *   `character.chi-so`   chỉ số chính của kỹ năng đang kiểm
 *   `character.tuoi-tac` giai đoạn tuổi dịch chính chỉ số đó
 *   `character.dac-tinh` đặc tính bẩm sinh của chủng tộc
 *   `character.ton-giao` tôn giáo, nhân với mức sùng đạo
 *   `character.van-hoa`  văn hóa nuôi dạy, nhân với mức hòa nhập
 *   `character.trang-bi` vế `+ trang bị` của công thức mục 1
 *
 * Đây là chỗ mục 2 nói tới khi viết "đặc tính bẩm sinh phải cài đúng vào
 * registry modifier của Phần 5, không hardcode". Hệ quả cụ thể: một Lùn Núi
 * sùng đạo Lò Rèn, cầm búa của thợ giỏi, kiểm định xây cất dưới hầm sẽ ĐỌC ĐƯỢC
 * bốn dòng riêng biệt cộng lại — chứ không chỉ thấy một ngưỡng cao hơn mà không
 * hiểu vì sao.
 *
 * Bốn nguồn sau dùng CHUNG `linesFrom`: một vòng lặp duy nhất khớp miền, kiểm
 * tag, nhân cường độ và quy đổi hệ. Bốn bản sao gần giống nhau là bốn chỗ sẽ
 * lệch nhau, và thường lệch ở khâu quy đổi 3d6.
 */

import {
  domainMatches,
  modifierSources,
  registerModifierSource,
  type Modifier,
  type ModifierContext,
  type ModifierSource,
} from '@/systems/check/registry';
import { scaleToSystem } from '@/systems/check/sources';
import { beliefEffects, cultureOf, religionOf } from './beliefs';
import { effectApplies, scaleIntensity, type Effect } from './effects';
import { DEFAULT_QUALITY, gearEffect, gearName, qualityName } from './gear';
import { originOf } from './origins';
import { ageStageOf, nationName, raceName, traitsOf } from './races';
import { domainOfSkill, statForDomain } from './skills';
import { characterOf } from './slice';
import { STATS, statContribution } from './stats';
import { traitOf } from './traits';

export const STAT_SOURCE_ID = 'character.chi-so';
export const TRAIT_SOURCE_ID = 'character.dac-tinh';
export const RELIGION_SOURCE_ID = 'character.ton-giao';
export const CULTURE_SOURCE_ID = 'character.van-hoa';
export const GEAR_SOURCE_ID = 'character.trang-bi';
export const AGE_SOURCE_ID = 'character.tuoi-tac';
export const ORIGIN_SOURCE_ID = 'character.xuat-than';
export const RACE_STANDING_SOURCE_ID = 'character.vi-the-chung-toc';

/**
 * Phép kiểm này có phải của NHÂN VẬT NGƯỜI CHƠI không.
 *
 * `ctx.actor` rỗng nghĩa là người chơi (Phần 5). Một id NPC thì slice
 * `character` không nói gì về nó cả — cộng chỉ số của người chơi vào cú tung
 * của một NPC là loại lỗi rất khó nhìn ra, vì kết quả vẫn "hợp lý".
 */
function isPlayerActor(actor: string, characterId: string | undefined): boolean {
  return actor === '' || actor === characterId;
}

/**
 * Biến một danh sách hiệu ứng thành các dòng modifier.
 *
 * `intensity` là con số 0–100 nói nguồn bám chặt tới đâu (sùng đạo, hòa nhập).
 * `100` là không đổi gì. Dòng làm tròn về 0 bị bỏ hẳn — một dòng `+0` trong
 * bảng điều chỉnh chỉ làm người đọc mất thời gian.
 */
function linesFrom(
  effects: readonly Effect[],
  ctx: ModifierContext,
  label: string,
  source: string,
  intensity = 100,
): Modifier[] {
  const lines: Modifier[] = [];
  for (const effect of effects) {
    if (!effect.domains.some((pattern) => domainMatches(pattern, ctx.domain))) continue;
    if (!effectApplies(effect, ctx.tags)) continue;

    const value = intensity === 100 ? effect.value : scaleIntensity(effect.value, intensity);
    if (value === 0) continue;

    if (effect.kind === 'dieShift') {
      lines.push({ label, value, kind: 'dieShift', source });
      continue;
    }
    lines.push({ label, source, ...scaleToSystem(ctx.system, value) });
  }
  return lines;
}

/**
 * Chỉ số chính của kỹ năng đang kiểm, quy sang hệ đang chạy theo bốn dòng của
 * mục 1. Miền không thuộc kỹ năng nào (`combat.*`, `siege.*`…) thì im lặng bỏ
 * qua — Phần 9–11 là chủ sở hữu của những miền đó và sẽ khai chỉ số của chúng.
 */
export const statSource: ModifierSource = {
  id: STAT_SOURCE_ID,
  domains: ['*'],
  compute(ctx) {
    const character = characterOf(ctx.state);
    if (character === null) return null;
    if (!isPlayerActor(ctx.actor, character.identity.id)) return null;

    const stat = statForDomain(ctx.domain);
    if (stat === null) return null;

    const value = character.stats[stat];
    if (typeof value !== 'number') return null;

    const contribution = statContribution(ctx.system, value);
    // `null` ở hệ pool là hợp đồng của mục 1: quy mô lớn dùng chất lượng đơn vị,
    // không dùng chỉ số cá nhân.
    if (contribution === null || contribution === 0) return null;

    return [
      {
        label: `${STATS[stat].name} ${value}`,
        value: contribution,
        kind: 'flat',
        source: STAT_SOURCE_ID,
      },
    ];
  },
};

/**
 * TUỔI TÁC — giai đoạn tuổi dịch chỉ số chính của kỹ năng đang kiểm.
 *
 * Vì sao đây là một NGUỒN chứ không phải một khoản cộng thẳng vào
 * `character.stats`: nhân vật già đi trong lúc chơi. Ghi đè vào state thì phải
 * có ai đó nhớ trừ lại đúng khoản cũ mỗi lần bước sang giai đoạn mới, và cái
 * ngày người ta quên là ngày một Cao Tiên bước qua tuổi trung niên hai lần rồi
 * mất luôn 6 điểm Sức mạnh mà không ai lần ra được. Ở đây thì con số LÀ hàm của
 * tuổi hiện tại, không bao giờ lệch.
 *
 * Và vì nó đi qua registry nên người chơi ĐỌC ĐƯỢC một dòng "Lão niên · Sức mạnh
 * −3" giữa bảng điều chỉnh, thay vì chỉ thấy tay mình chậm dần mà không hiểu vì
 * sao (README mục 8.4).
 */
export const ageSource: ModifierSource = {
  id: AGE_SOURCE_ID,
  domains: ['*'],
  compute(ctx) {
    const character = characterOf(ctx.state);
    if (character === null) return null;
    if (!isPlayerActor(ctx.actor, character.identity.id)) return null;

    const stat = statForDomain(ctx.domain);
    if (stat === null) return null;

    const stage = ageStageOf(character.identity.race, character.identity.age);
    const shift = stage.statShift[stat];
    if (shift === undefined || shift === 0) return null;

    const value = character.stats[stat];
    if (typeof value !== 'number') return null;

    // Quy đổi ĐÚNG bằng đường của `character.chi-so`: chênh lệch giữa đóng góp
    // của chỉ số đã dịch và chỉ số gốc. Tự nhân 3 ở đây là dựng một bảng quy đổi
    // thứ hai, và hai bảng sẽ lệch nhau ở hệ d20 ngay lần đầu ai đó sửa một cái.
    const before = statContribution(ctx.system, value);
    const after = statContribution(ctx.system, Math.max(1, value + shift));
    if (before === null || after === null || after === before) return null;

    return [
      {
        label: `${stage.name} · ${STATS[stat].name} ${shift > 0 ? '+' : ''}${shift}`,
        value: after - before,
        kind: 'flat',
        source: AGE_SOURCE_ID,
      },
    ];
  },
};

/** Đặc tính bẩm sinh của chủng tộc, đọc thẳng từ `data/traits.json`. */
export const traitSource: ModifierSource = {
  id: TRAIT_SOURCE_ID,
  domains: ['*'],
  compute(ctx) {
    const character = characterOf(ctx.state);
    if (character === null) return null;
    if (!isPlayerActor(ctx.actor, character.identity.id)) return null;

    const lines: Modifier[] = [];
    for (const traitId of traitsOf(character.identity.race)) {
      const trait = traitOf(traitId);
      if (trait === null) continue;
      lines.push(...linesFrom(trait.effects, ctx, trait.name, TRAIT_SOURCE_ID));
    }
    return lines.length === 0 ? null : lines;
  },
};

/**
 * XUẤT THÂN — dấu nghề và vốn xã hội còn lại sau lúc tạo nhân vật.
 *
 * Nó không khóa một hành động hay một tước vị. Người sinh nông nô vẫn làm mọi
 * phép kiểm như người khác; họ chỉ không có cùng thói quen nghề nghiệp và cửa
 * xã hội với người lớn lên ở triều đình. Tất cả khoản cộng/trừ đều đi từ data
 * ra bảng modifier, nên người chơi luôn đọc được nguyên nhân.
 */
export const originSource: ModifierSource = {
  id: ORIGIN_SOURCE_ID,
  domains: ['skill.*', 'rule.*'],
  compute(ctx) {
    const character = characterOf(ctx.state);
    if (character === null) return null;
    if (!isPlayerActor(ctx.actor, character.identity.id)) return null;

    const origin = originOf(character.identity.originId);
    if (origin === null) return null;

    const lines = linesFrom(origin.effects, ctx, origin.name, ORIGIN_SOURCE_ID);
    if (
      origin.favouredSkillBonus !== 0 &&
      origin.favouredSkills.some((skillId) => domainOfSkill(skillId) === ctx.domain)
    ) {
      lines.push({
        label: `${origin.name} · nghề quen từ nhỏ`,
        source: ORIGIN_SOURCE_ID,
        ...scaleToSystem(ctx.system, origin.favouredSkillBonus),
      });
    }
    return lines.length === 0 ? null : lines;
  },
};

/** Những miền mà định kiến/chỗ đứng của một tộc trong thế lực thật sự tác động. */
const RACE_SOCIAL_DOMAINS = new Set([
  'skill.dam-phan',
  'skill.gay-thien-cam',
  'skill.uy-hiep',
  'skill.nghi-thuc',
  'rule.giu-chu-hau',
  'rule.bo-nhiem',
  'rule.ngoai-giao',
]);

/**
 * VỊ THẾ CHỦNG TỘC — nối bảng thái độ vốn đã lưu trong state vào phép kiểm.
 *
 * Đặc tính bẩm sinh ở `traitSource`; nguồn này chỉ nói tới xã hội. Vì đọc con
 * số trong state nên một cuộc cải cách, đàn áp hay hòa nhập ở Phần 14 có thể
 * đổi ảnh hưởng ngay, không phải sửa lại chủng tộc gốc.
 */
export const raceStandingSource: ModifierSource = {
  id: RACE_STANDING_SOURCE_ID,
  domains: [...RACE_SOCIAL_DOMAINS],
  compute(ctx) {
    if (!RACE_SOCIAL_DOMAINS.has(ctx.domain)) return null;
    const character = characterOf(ctx.state);
    if (character === null) return null;
    if (!isPlayerActor(ctx.actor, character.identity.id)) return null;

    const nationId = character.allegiance.nationId;
    if (nationId === '') return null;
    const attitude = character.allegiance.attitudes[nationId] ?? 0;
    // 25 (tộc cai trị) = +5 d100; -60 (bị truy bức) = -12 d100. Đủ nặng để
    // cảm nhận, nhưng tước vị và chính danh vẫn có thể bù hoặc đảo chiều.
    const value = Math.round(attitude / 5);
    if (value === 0) return null;
    return [
      {
        label: `${nationName(nationId)} nhìn ${raceName(character.identity.race)}: ${attitude >= 0 ? 'được trọng dụng' : 'bị định kiến'}`,
        source: RACE_STANDING_SOURCE_ID,
        ...scaleToSystem(ctx.system, value),
      },
    ];
  },
};

/**
 * Tôn giáo, nhân với mức sùng đạo.
 *
 * Nhân CẢ vế tốt lẫn vế xấu: người sùng đạo vừa được nhiều hơn từ đức tin vừa
 * bị trói nhiều hơn bởi điều cấm của nó. Chỉ nhân vế tốt thì sùng đạo tối đa
 * luôn là lựa chọn đúng, và cả một trục nhập vai biến thành một ô phải kéo hết.
 */
export const religionSource: ModifierSource = {
  id: RELIGION_SOURCE_ID,
  domains: ['*'],
  compute(ctx) {
    const character = characterOf(ctx.state);
    if (character === null) return null;
    if (!isPlayerActor(ctx.actor, character.identity.id)) return null;

    const religion = religionOf(character.allegiance.religionId);
    if (religion === null) return null;

    const lines = linesFrom(
      religion.effects,
      ctx,
      religion.shortName === '' ? religion.name : religion.shortName,
      RELIGION_SOURCE_ID,
      character.allegiance.piety,
    );
    return lines.length === 0 ? null : lines;
  },
};

/** Văn hóa nuôi dạy, nhân với mức hòa nhập. */
export const cultureSource: ModifierSource = {
  id: CULTURE_SOURCE_ID,
  domains: ['*'],
  compute(ctx) {
    const character = characterOf(ctx.state);
    if (character === null) return null;
    if (!isPlayerActor(ctx.actor, character.identity.id)) return null;

    const culture = cultureOf(character.identity.cultureId);
    if (culture === null) return null;

    const lines = linesFrom(
      culture.effects,
      ctx,
      culture.name,
      CULTURE_SOURCE_ID,
      character.identity.culturalFit,
    );
    return lines.length === 0 ? null : lines;
  },
};

/**
 * Vế `+ trang bị` của công thức mục 1.
 *
 * CHỈ món ĐANG MANG mới tính: một thanh kiếm nằm trong hành lý không giúp gì
 * cho cú chém đang diễn ra. Đây là nguồn Phần 16 sẽ thay thế — lúc đó nó đọc
 * bản đồ che phủ giáp và khe hở thay vì một `skillBonus` phẳng.
 */
export const gearSource: ModifierSource = {
  id: GEAR_SOURCE_ID,
  domains: ['*'],
  compute(ctx) {
    const character = characterOf(ctx.state);
    if (character === null) return null;
    if (!isPlayerActor(ctx.actor, character.identity.id)) return null;

    const lines: Modifier[] = [];
    for (const carried of character.gear) {
      if (!carried.equipped) continue;
      const effect = gearEffect(carried);
      if (effect === null) continue;
      // Nhãn phải là tên đọc được kèm tay nghề thợ: "Kiếm dài (kiệt tác)".
      // Người chơi cần thấy vì sao thanh kiếm này hơn thanh kia, chứ không chỉ
      // thấy một con số khác.
      const quality = carried.quality === DEFAULT_QUALITY ? '' : ` (${qualityName(carried.quality)})`;
      lines.push(...linesFrom([effect], ctx, `${gearName(carried.item)}${quality}`, GEAR_SOURCE_ID));
    }
    return lines.length === 0 ? null : lines;
  },
};

/** Hiệu ứng của một danh tính bất kỳ (tôn giáo hoặc văn hóa) — cho UI xem trước. */
export function previewEffects(id: string): readonly Effect[] {
  return beliefEffects(id);
}

/**
 * Đăng ký một lần lúc khởi động. Gọi lại lần nữa không nổ — `main.tsx` gọi lúc
 * boot, còn test gọi sau mỗi lần dọn registry.
 */
export function registerCharacterSources(): void {
  const already = new Set(modifierSources().map((source) => source.id));
  for (const source of [
    statSource,
    ageSource,
    traitSource,
    originSource,
    raceStandingSource,
    religionSource,
    cultureSource,
    gearSource,
  ]) {
    if (already.has(source.id)) continue;
    registerModifierSource(source);
  }
}
