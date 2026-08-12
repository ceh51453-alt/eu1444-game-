/**
 * LUỒNG TẠO NHÂN VẬT 9 BƯỚC (Phần 6 mục 9).
 *
 * Model thuần, không dính React và không dính store: mỗi hàm nhận bản nháp và
 * trả bản nháp mới. Nhờ vậy toàn bộ luật tạo nhân vật test được mà không cần
 * dựng DOM, và UI ở `src/ui/character` chỉ còn là một lớp hiển thị.
 *
 * VÌ SAO CHỐT NHÂN VẬT KHÔNG ĐI QUA MVU: MVU là đường sửa state ĐANG CHẠY, và
 * `identity.*` ở đó là `locked` — cố tình, vì sau khi ván bắt đầu thì không ai
 * được đổi chủng tộc hay ngày sinh nữa. Tạo nhân vật không phải một patch mà là
 * việc dựng STATE BAN ĐẦU, cùng loại với `createInitialState` của Phần 0. Nên
 * bước 9 dựng thẳng một `GameState` hoàn chỉnh, validate bằng schema hợp nhất
 * rồi nạp vào store — R2 vẫn giữ, vì không có gì lọt vào state mà chưa qua Zod.
 */

import type { GameState } from '@/state/slices';
import { slices } from '@/state/slices';
import { createInitialState } from '@/state/store';
import { createRng, type Rng } from '@/core/rng';
import { DEFAULT_START_DATE } from '@/core/clock';
import { regionName } from '@/lore/regions';
import { seedInto } from '@/systems/items/seed';
import { createHolding, type OwnershipPath } from '@/systems/holding';
import { grantTitle, type HeldTitle } from '@/systems/titles';
import { seedFactionMemberships } from '@/systems/factions';
import { npcCodexSchema, type CodexState } from '@/systems/codex';
import { cultureOf, religionOf, suggestedCulture, suggestedReligion } from './beliefs';
import { carry, gearName, materialName, qualityName, type CarriedGear } from './gear';
import {
  claimLabel,
  claimsFromHouse,
  houseName,
  houseOf,
  lorePersonName,
  originHasHouses,
  type DerivedClaim,
} from './houses';
import {
  fiefIdFor,
  fiefTitleName,
  holdingIdFor,
  holdingRoleName,
  obligationName,
  realmRoleName,
  settlementTierName,
} from './possessions';
import {
  familyRelationLabel,
  generateFamily,
  generateOutsideRelations,
  generateSecrets,
  randomAppearance,
  randomFamilyName,
  randomGivenName,
  type OutsideRelation,
  type Sex,
} from './generate';
import {
  ageSkillBonus,
  allOrigins,
  birthOrderOf,
  lineageStateOf,
  originOf,
  pointBuy,
  startingLine,
  statCost,
  statStepCost,
} from './origins';
import {
  ageStageOf,
  attitudeTable,
  creationAgeRange,
  effectiveAge,
  nationName,
  playableRaces,
  raceOf,
  startAgeRange,
  statCapOf,
  statModsOf,
} from './races';
import { allSkills, skillOf } from './skills';
import type { Appearance, CharacterState, FamilyMember, Secret } from './slice';
import { characterSchema } from './slice';
import { STAT_IDS, clampStat, emptyStatBlock, type StatBlock, type StatId } from './stats';

// ---------------------------------------------------------------------------
// Chín bước
// ---------------------------------------------------------------------------

export const CREATION_STEPS = [
  { id: 'chung-toc', name: 'Chủng tộc', hint: 'So mod chỉ số, đặc tính và vị thế xã hội' },
  { id: 'xuat-than', name: 'Xuất thân', hint: 'Giai tầng, vùng sinh, thứ tự con, tình trạng gia tộc' },
  { id: 'chi-so', name: 'Chỉ số', hint: 'Point-buy, trần chủng tộc hiện ngay bên cạnh' },
  { id: 'ngoai-hinh', name: 'Ngoại hình', hint: 'Chi tiết đủ cho Phần 7 dựng hình người' },
  { id: 'ky-nang', name: 'Kỹ năng', hint: 'Phân điểm rèn luyện' },
  { id: 'gia-dinh', name: 'Gia đình', hint: 'Sinh tự động bằng seeded RNG, sửa được' },
  { id: 'the-luc', name: 'Thế lực', hint: 'Trung thành, tôn giáo, hội đoàn, bí mật' },
  { id: 'trang-bi', name: 'Trang bị', hint: 'Theo giai tầng' },
  { id: 'xac-nhan', name: 'Xác nhận', hint: 'Toàn bộ phiếu nhân vật, chốt seed' },
] as const;

export type CreationStepId = (typeof CREATION_STEPS)[number]['id'];

export function stepIndex(id: CreationStepId): number {
  return CREATION_STEPS.findIndex((step) => step.id === id);
}

// ---------------------------------------------------------------------------
// Bản nháp
// ---------------------------------------------------------------------------

export interface DraftAllegiance {
  liege: string;
  nationId: string;
  standing: string;
  religionId: string;
  piety: number;
  guilds: string[];
  /** Ghi đè thái độ mặc định suy từ chủng tộc. Khóa vắng nghĩa là dùng mặc định. */
  attitudes: Record<string, number>;
}

export interface DraftHolding {
  id: string;
  name: string;
  tier: string;
  role: string;
  regionId: string;
  note: string;
}

export interface DraftFief {
  id: string;
  name: string;
  title: string;
  /** Con đường có tước: được phong, thừa kế, hoặc chiếm đoạt. */
  acquisition: 'duoc-phong' | 'thua-ke' | 'chiem-doat';
  liege: string;
  obligations: string[];
  note: string;
}

export interface DraftOpening {
  holdingId: string;
  withNpc: string;
  situation: string;
}

export interface CharacterDraft {
  seed: string;
  /** Ảnh chân dung đã thu nhỏ, lưu dưới dạng data URL cùng ván chơi. */
  portrait: string;
  raceId: string;
  originId: string;
  /** Gia tộc — dây nối vào thế giới đã có. Rỗng với người không có tên tuổi. */
  houseId: string;
  /** Yêu sách đã chốt. Suy ra từ gia tộc của mình và của cha mẹ, rồi sửa tay được. */
  claims: DerivedClaim[];
  opening: DraftOpening;
  /** Nơi SINH. */
  birthRegionId: string;
  /** Nơi ĐANG ĐỨNG lúc ván bắt đầu — lệch với nơi sinh là chuyện thường. */
  startRegionId: string;
  /** Văn hóa nuôi dạy, có thể khác chủng tộc. */
  cultureId: string;
  culturalFit: number;
  birthOrderId: string;
  lineageStateId: string;
  givenName: string;
  familyName: string;
  sex: Sex;
  age: number;
  /** Chỉ số ĐÃ PHÂN, chưa cộng mod chủng tộc. Point-buy chạy trên bảng này. */
  allocated: StatBlock;
  appearance: Appearance | null;
  clothing: string;
  /** skillId → điểm rèn luyện (bội số của `skillTrainingPerPoint`). */
  skills: Record<string, number>;
  family: FamilyMember[];
  outsideRelations: OutsideRelation[];
  allegiance: DraftAllegiance;
  gear: CarriedGear[];
  property: string[];
  holdings: DraftHolding[];
  fiefs: DraftFief[];
  realmRole: string;
  secrets: Secret[];
  personalityNote: string;
}

export function newDraft(seed: string): CharacterDraft {
  const race = playableRaces()[0];
  const origin = allOrigins()[0];
  const raceId = race?.id ?? '';
  const [ageLow] = startAgeRange(raceId);
  const birthRegionId = race?.homelands[0] ?? '';

  const draft: CharacterDraft = {
    seed,
    portrait: '',
    raceId,
    originId: origin?.id ?? '',
    houseId: '',
    claims: [],
    opening: { holdingId: '', withNpc: '', situation: '' },
    birthRegionId,
    startRegionId: birthRegionId,
    cultureId: suggestedCulture(raceId, birthRegionId)?.id ?? '',
    culturalFit: 70,
    birthOrderId: 'con-thu',
    lineageStateId: 'thinh',
    givenName: '',
    familyName: '',
    sex: 'nam',
    age: ageLow,
    allocated: emptyStatBlock(pointBuy().baseStat),
    appearance: null,
    clothing: '',
    skills: {},
    family: [],
    outsideRelations: [],
    allegiance: {
      liege: '',
      nationId: '',
      standing: 'than-dan',
      religionId: suggestedReligion(race?.church ?? '')?.id ?? '',
      piety: 30,
      guilds: [],
      attitudes: {},
    },
    gear: [],
    property: [],
    holdings: [],
    fiefs: [],
    realmRole: 'khong-co',
    secrets: [],
    personalityNote: '',
  };

  return withOrigin(draft, draft.originId);
}

/**
 * Đổi giai tầng kéo theo TOÀN BỘ vạch xuất phát: trang bị, tài sản, thành trì,
 * thái ấp, vai trò với lãnh thổ.
 *
 * Không kéo theo là người chơi đổi từ Nông nô sang Vương thất mà vẫn tay trắng,
 * rồi phải tự nhớ quay lại bước 8 điền tay. Cái gì suy được từ dữ liệu thì suy,
 * và người chơi sửa đè lên sau đó.
 */
export function withOrigin(draft: CharacterDraft, originId: string): CharacterDraft {
  const origin = originOf(originId);
  if (origin === null) return { ...draft, originId };

  const inherits = birthOrderOf(draft.birthOrderId)?.inherits ?? false;
  return {
    ...draft,
    originId,
    gear: origin.gear
      .map((entry) =>
        carry(entry.item, {
          ...(entry.material === undefined ? {} : { material: entry.material }),
          ...(entry.quality === undefined ? {} : { quality: entry.quality }),
        }),
      )
      .filter((entry): entry is CarriedGear => entry !== null),
    property: [...startingLine(originId, draft.birthOrderId, draft.lineageStateId).property],
    // Con thứ KHÔNG thừa kế thành trì hay thái ấp — mục 3 nói thẳng "con cả
    // thừa kế, con thứ phải tự lập". Trang bị thì vẫn được mang theo.
    holdings: inherits ? origin.holdings.map((entry, index) => defaultHolding(draft, entry.tier, entry.role, index)) : [],
    fiefs: inherits ? origin.fiefs.map((entry, index) => defaultFief(draft, entry.title, entry.obligations, index)) : [],
    realmRole: inherits ? origin.realmRole : 'khong-co',
  };
}

/**
 * Tên mặc định KHÔNG chứa cấp và KHÔNG chứa tước.
 *
 * Mọi chỗ hiển thị đều in `cấp + tên` hoặc `tước + tên`, nên một tên mặc định
 * kiểu "Trấn không tên" sẽ đọc thành "Trấn Trấn không tên". Để trống phần đó và
 * để chỗ hiển thị ghép vào.
 */
export const UNNAMED = 'chưa đặt tên';

// ---------------------------------------------------------------------------
// Gia tộc và yêu sách (bước 2 và bước 6)
// ---------------------------------------------------------------------------

/**
 * Chọn gia tộc kéo theo rất nhiều thứ, và đó chính là điểm.
 *
 * Chọn "Nhà Habsburg" là chọn luôn: họ của mình, thành trì gốc, lãnh thổ nhà
 * đang cai trị, tước vị của nhà, và một yêu sách lên ngai Đế quốc. Không kéo
 * theo thì gia tộc chỉ là một dòng chữ, và người chơi phải tự điền lại mười ô
 * mà dữ liệu đã biết sẵn.
 *
 * Cha mẹ mặc định mang cùng nhà — bước 6 đổi lại được, và đổi nhà của mẹ chính
 * là chỗ "mẹ là con gái vua Đức" thành một yêu sách thật.
 */
export function withHouse(draft: CharacterDraft, houseId: string): CharacterDraft {
  const house = houseOf(houseId);
  if (house === null) {
    return recomputeClaims({ ...draft, houseId: '', family: clearHouses(draft.family) });
  }

  const family = draft.family.map((member) =>
    // Nhà là của DÒNG CHA theo lệ phong kiến Tây Âu; mẹ giữ nhà cũ của mẹ, và
    // đó là chỗ yêu sách thứ hai mọc ra. Bước 6 sửa tay được cả hai.
    member.relation === 'me' || member.relation === 'ba' ? member : { ...member, houseId },
  );

  return recomputeClaims({
    ...draft,
    houseId,
    familyName: houseSurname(houseId),
    family,
    holdings:
      house.seat === '' || draft.holdings.some((entry) => entry.id === house.seat)
        ? draft.holdings
        : [
            {
              id: house.seat,
              name: regionName(house.seat),
              tier: 'thanh',
              role: 'chu-so-huu',
              regionId: house.province === '' ? draft.birthRegionId : house.province,
              note: `Thành trì gốc của ${house.name}.`,
            },
            ...draft.holdings,
          ],
  });
}

function clearHouses(family: readonly FamilyMember[]): FamilyMember[] {
  return family.map((member) => ({ ...member, houseId: '' }));
}

/** Người nhà nào mang yêu sách theo được — chỉ dòng máu trực hệ và anh chị. */
const CLAIM_BEARING = new Set(['cha', 'me', 'ong', 'ba', 'anh', 'chi']);

/**
 * Tính lại toàn bộ yêu sách từ gia tộc của mình và của người nhà.
 *
 * Chạy lại từ đầu mỗi lần thay vì cộng dồn: người chơi đổi nhà của mẹ ba lần thì
 * ba yêu sách cũ phải biến mất, không phải chồng lên nhau. Yêu sách người chơi
 * TỰ THÊM (`through` rỗng) thì giữ nguyên.
 */
export function recomputeClaims(draft: CharacterDraft): CharacterDraft {
  const manual = draft.claims.filter((claim) => claim.through === '');
  const derived: DerivedClaim[] = [];
  const seen = new Set<string>();

  const add = (claims: readonly DerivedClaim[]): void => {
    for (const claim of claims) {
      const key = `${claim.kind}:${claim.target}`;
      // Cùng một ngai đến từ hai đường thì giữ đường MẠNH hơn, không giữ cả hai.
      const existing = derived.findIndex((entry) => `${entry.kind}:${entry.target}` === key);
      if (existing === -1) {
        derived.push(claim);
        seen.add(key);
        continue;
      }
      const current = derived[existing];
      if (current !== undefined && strengthRank(claim.strength) < strengthRank(current.strength)) {
        derived[existing] = claim;
      }
    }
  };

  if (draft.houseId !== '') {
    add(claimsFromHouse(draft.houseId, 'ban_than', 'chính ngài', 'ban_than'));
  }
  for (const member of draft.family) {
    if (member.houseId === '' || !CLAIM_BEARING.has(member.relation)) continue;
    add(claimsFromHouse(member.houseId, member.id, `${familyRelationLabel(member.relation)} ${member.name}`, member.relation));
  }

  return { ...draft, claims: [...derived, ...manual] };
}

function strengthRank(strength: string): number {
  return ['manh', 'vua', 'yeu', 'tranh-cai'].indexOf(strength);
}

/** Họ của một gia tộc, bỏ mấy chữ chỉ loại ở đầu tên. */
export function houseSurname(houseId: string): string {
  return houseOf(houseId)?.name.replace(/^(Nhà|Thị tộc|Hãn tộc|Liên minh thị tộc)\s+/u, '') ?? '';
}

/**
 * Đổi gia tộc của MỘT người nhà — chỗ "mẹ là con gái vua Đức" thành cơ học.
 *
 * Đổi luôn họ theo nhà mới, NHƯNG chỉ khi người đó còn mang họ tự sinh. Một cái
 * tên người chơi đã gõ tay thì không được ghi đè: họ có thể cố ý cho mẹ mang họ
 * chồng, hoặc một cái tên riêng có lý do trong truyện.
 */
export function setFamilyHouse(draft: CharacterDraft, memberId: string, houseId: string): CharacterDraft {
  const surname = houseSurname(houseId);

  return recomputeClaims({
    ...draft,
    family: draft.family.map((member) => {
      if (member.id !== memberId) return member;
      const given = member.name.split(' ')[0] ?? member.name;
      const autoNamed = member.name === `${given} ${draft.familyName}` || member.name === `${given} ${houseSurname(member.houseId)}`;
      return {
        ...member,
        houseId,
        name: surname !== '' && autoNamed ? `${given} ${surname}` : member.name,
      };
    }),
  });
}

function defaultHolding(draft: CharacterDraft, tier: string, role: string, index: number): DraftHolding {
  return {
    id: holdingIdFor(`${tier}-${draft.seed}-${index}`),
    name: UNNAMED,
    tier,
    role,
    regionId: draft.birthRegionId,
    note: '',
  };
}

function defaultFief(draft: CharacterDraft, title: string, obligations: readonly string[], index: number): DraftFief {
  return {
    id: fiefIdFor(`${title}-${draft.seed}-${index}`),
    name: UNNAMED,
    title,
    acquisition: 'thua-ke',
    liege: '',
    obligations: [...obligations],
    note: '',
  };
}

/**
 * Đổi chủng tộc kéo theo vùng sinh, tuổi và trần chỉ số.
 *
 * Không giữ nguyên mấy thứ đó là cố ý: một nhân vật Cao Tiên 21 tuổi sinh ở
 * Ottoman thì mọi con số phía sau đều vô nghĩa, và người chơi sẽ chỉ phát hiện
 * ra ở bước 9.
 */
export function withRace(draft: CharacterDraft, raceId: string): CharacterDraft {
  const race = raceOf(raceId);
  // Kẹp theo khoảng CHỌN ĐƯỢC, không phải khoảng gợi ý: đổi tộc cho một lão
  // tướng năm mươi tuổi mà bị kéo về hai mươi thì cả nhân vật đổi nghĩa.
  const [ageLow, ageHigh] = creationAgeRange(raceId);
  const allocated = { ...draft.allocated };
  const limit = pointBuy().maxAtCreation;
  for (const id of STAT_IDS) {
    allocated[id] = Math.min(allocated[id], limit, statCapOf(raceId, id));
  }

  const birthRegionId =
    race?.homelands.includes(draft.birthRegionId) === true ? draft.birthRegionId : race?.homelands[0] ?? '';

  return {
    ...draft,
    raceId,
    allocated,
    birthRegionId,
    startRegionId: birthRegionId,
    cultureId: suggestedCulture(raceId, birthRegionId)?.id ?? draft.cultureId,
    age: Math.min(Math.max(draft.age, ageLow), ageHigh),
    appearance: null,
    family: [],
    allegiance: {
      ...draft.allegiance,
      religionId: suggestedReligion(race?.church ?? '')?.id ?? draft.allegiance.religionId,
      attitudes: {},
    },
  };
}

// ---------------------------------------------------------------------------
// Bước 3 — point-buy
// ---------------------------------------------------------------------------

export function statPointsSpent(draft: CharacterDraft): number {
  const base = pointBuy().baseStat;
  return STAT_IDS.reduce((total, id) => total + statCost(base, draft.allocated[id]), 0);
}

export function statPointsLeft(draft: CharacterDraft): number {
  return (originOf(draft.originId)?.statPoints ?? 0) - statPointsSpent(draft);
}

/** Trần LÚC TẠO của một chỉ số: thấp hơn trong hai — trần point-buy và trần chủng tộc. */
export function creationCap(draft: CharacterDraft, stat: StatId): number {
  return Math.min(pointBuy().maxAtCreation, statCapOf(draft.raceId, stat));
}

export function canRaiseStat(draft: CharacterDraft, stat: StatId): boolean {
  const value = draft.allocated[stat];
  if (value >= creationCap(draft, stat)) return false;
  return statPointsLeft(draft) >= statStepCost(value);
}

export function canLowerStat(draft: CharacterDraft, stat: StatId): boolean {
  return draft.allocated[stat] > pointBuy().minAtCreation;
}

export function raiseStat(draft: CharacterDraft, stat: StatId): CharacterDraft {
  if (!canRaiseStat(draft, stat)) return draft;
  return { ...draft, allocated: { ...draft.allocated, [stat]: draft.allocated[stat] + 1 } };
}

export function lowerStat(draft: CharacterDraft, stat: StatId): CharacterDraft {
  if (!canLowerStat(draft, stat)) return draft;
  return { ...draft, allocated: { ...draft.allocated, [stat]: draft.allocated[stat] - 1 } };
}

/** Chỉ số CUỐI: điểm đã phân + mod chủng tộc, kẹp vào trần của tộc. */
export function finalStats(draft: CharacterDraft): StatBlock {
  const mods = statModsOf(draft.raceId);
  const out = emptyStatBlock();
  for (const id of STAT_IDS) {
    out[id] = clampStat(draft.allocated[id] + mods[id], statCapOf(draft.raceId, id));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Bước 5 — kỹ năng
// ---------------------------------------------------------------------------

export function skillPointsSpent(draft: CharacterDraft): number {
  const perPoint = pointBuy().skillTrainingPerPoint;
  return Object.values(draft.skills).reduce((total, training) => total + training / perPoint, 0);
}

/**
 * Điểm kỹ năng vì tuổi — dương là được thêm, âm là bị bớt.
 *
 * Đọc qua TUỔI HIỆU DỤNG nên bảng này dùng chung cho cả tộc sống 40 năm lẫn tộc
 * sống 800 năm mà không phải viết hai luật.
 */
export function ageSkillPoints(draft: CharacterDraft): number {
  return ageSkillBonus(effectiveAge(draft.raceId, draft.age));
}

/** Ngân sách điểm kỹ năng THẬT: giai tầng cho bao nhiêu, tuổi cộng trừ bao nhiêu. */
export function skillPointBudget(draft: CharacterDraft): number {
  return Math.max(0, (originOf(draft.originId)?.skillPoints ?? 0) + ageSkillPoints(draft));
}

export function skillPointsLeft(draft: CharacterDraft): number {
  return skillPointBudget(draft) - skillPointsSpent(draft);
}

/**
 * Đổi tuổi, kẹp vào khoảng chọn được của chủng tộc.
 *
 * Đi qua một hàm riêng chứ không gán thẳng `draft.age` vì tuổi kéo theo ngân
 * sách điểm kỹ năng: hạ tuổi xuống mà đang tiêu hết điểm thì bước 5 lập tức
 * thành "tiêu quá N điểm", và người chơi phải THẤY điều đó ngay chứ không phải
 * tới bước 9 mới biết.
 */
export function withAge(draft: CharacterDraft, age: number): CharacterDraft {
  const [low, high] = creationAgeRange(draft.raceId);
  const clamped = Math.min(high, Math.max(low, Math.round(age)));
  return { ...draft, age: Number.isFinite(clamped) ? clamped : low };
}

/** Giai đoạn tuổi hiện tại của bản nháp — UI và phiếu xem trước đọc chỗ này. */
export function draftAgeStage(draft: CharacterDraft): ReturnType<typeof ageStageOf> {
  return ageStageOf(draft.raceId, draft.age);
}

export function canRaiseSkill(draft: CharacterDraft, skillId: string): boolean {
  if (skillOf(skillId) === null) return false;
  const config = pointBuy();
  const training = draft.skills[skillId] ?? 0;
  return training + config.skillTrainingPerPoint <= config.skillMaxAtCreation && skillPointsLeft(draft) >= 1;
}

export function raiseSkill(draft: CharacterDraft, skillId: string): CharacterDraft {
  if (!canRaiseSkill(draft, skillId)) return draft;
  const step = pointBuy().skillTrainingPerPoint;
  return { ...draft, skills: { ...draft.skills, [skillId]: (draft.skills[skillId] ?? 0) + step } };
}

export function lowerSkill(draft: CharacterDraft, skillId: string): CharacterDraft {
  const step = pointBuy().skillTrainingPerPoint;
  const training = (draft.skills[skillId] ?? 0) - step;
  const skills = { ...draft.skills };
  if (training <= 0) delete skills[skillId];
  else skills[skillId] = training;
  return { ...draft, skills };
}

// ---------------------------------------------------------------------------
// Sinh bằng seeded RNG (bước 4, 6, 7)
// ---------------------------------------------------------------------------

export function rollAppearance(draft: CharacterDraft, rng: Rng): CharacterDraft {
  return { ...draft, appearance: randomAppearance(rng, draft.raceId, draft.sex) };
}

export function rollNames(draft: CharacterDraft, rng: Rng): CharacterDraft {
  return {
    ...draft,
    givenName: randomGivenName(rng, draft.raceId, draft.sex),
    familyName: randomFamilyName(rng, draft.raceId),
  };
}

export function rollFamily(draft: CharacterDraft, rng: Rng): CharacterDraft {
  const line = startingLine(draft.originId, draft.birthOrderId, draft.lineageStateId);
  const lineage = draft.lineageStateId;
  // Gia tộc suy, lưu vong hay tuyệt tự thì người thân còn sống ít hơn — đó chính
  // là nghĩa cơ học của bốn tình trạng ở mục 3, không phải một dòng mô tả.
  const survivalBias = lineage === 'tuyet-tu' ? 0.3 : lineage === 'luu-vong' ? 0.6 : lineage === 'suy' ? 0.85 : 1;
  const familyName = draft.familyName === '' ? randomFamilyName(rng, draft.raceId) : draft.familyName;

  const family = generateFamily(rng, {
    raceId: draft.raceId,
    age: draft.age,
    familyName,
    survivalBias,
    breadth: Math.min(4, Math.round(line.relationSlots / 3)),
  });

  // Sinh lại gia tộc KHÔNG được xóa mất dây nối vào thế giới: nhà của người
  // chơi vẫn theo dòng cha, và yêu sách phải được tính lại chứ không rơi rụng.
  return recomputeClaims({
    ...draft,
    familyName,
    family: draft.houseId === '' ? family : family.map((member) =>
      member.relation === 'me' || member.relation === 'ba' ? member : { ...member, houseId: draft.houseId },
    ),
    outsideRelations: generateOutsideRelations(rng, draft.raceId, Math.min(5, line.relationSlots)),
  });
}

export function rollSecrets(draft: CharacterDraft, rng: Rng): CharacterDraft {
  return { ...draft, secrets: generateSecrets(rng) };
}

// ---------------------------------------------------------------------------
// Kiểm từng bước — quay lui được nên không bước nào được im lặng bỏ qua
// ---------------------------------------------------------------------------

export function stepIssues(draft: CharacterDraft, step: CreationStepId): string[] {
  const issues: string[] = [];
  switch (step) {
    case 'chung-toc':
      if (raceOf(draft.raceId) === null) issues.push('Chưa chọn chủng tộc.');
      break;
    case 'xuat-than':
      if (originOf(draft.originId) === null) issues.push('Chưa chọn giai tầng.');
      if (draft.birthRegionId === '') issues.push('Chưa chọn vùng sinh.');
      break;
    case 'chi-so': {
      const left = statPointsLeft(draft);
      if (left > 0) issues.push(`Còn ${left} điểm chỉ số chưa phân.`);
      if (left < 0) issues.push(`Tiêu quá ${-left} điểm chỉ số.`);
      break;
    }
    case 'ngoai-hinh':
      if (draft.appearance === null) issues.push('Chưa dựng ngoại hình.');
      break;
    case 'ky-nang': {
      const left = skillPointsLeft(draft);
      if (left > 0) issues.push(`Còn ${left} điểm kỹ năng chưa phân.`);
      if (left < 0) issues.push(`Tiêu quá ${-left} điểm kỹ năng.`);
      break;
    }
    case 'gia-dinh':
      if (draft.family.length === 0) issues.push('Chưa sinh gia tộc.');
      break;
    case 'the-luc':
      if (draft.secrets.length === 0) issues.push('Chưa có bí mật khởi đầu nào (mục 7 đòi 1–3).');
      if (draft.secrets.length > 3) issues.push('Có quá 3 bí mật khởi đầu (mục 7 chỉ cho 1–3).');
      if (draft.secrets.some((secret) => secret.text.trim() === '')) issues.push('Có bí mật khởi đầu chưa viết nội dung.');
      break;
    case 'trang-bi':
      break;
    case 'xac-nhan':
      if (draft.givenName.trim() === '') issues.push('Chưa đặt tên.');
      break;
  }
  return issues;
}

/** Mọi vấn đề còn lại của cả chín bước — bảng xem trước bên phải hiện liên tục. */
export function allIssues(draft: CharacterDraft): string[] {
  return CREATION_STEPS.flatMap((step) => stepIssues(draft, step.id));
}

/**
 * Nhắc nhở KHÔNG chặn — khác `stepIssues` ở đúng chỗ đó.
 *
 * `allIssues` là cửa chặn nút "Chốt nhân vật", nên mọi thứ nhét vào đó đều thành
 * bắt buộc. Một quý tộc không thuộc gia tộc nào là nhân vật hoàn toàn hợp lệ —
 * chỉ là người chơi thường quên mất rằng mình chọn được, và mất luôn dây nối vào
 * thế giới. Đó là một lời nhắc, không phải một lỗi.
 */
export function stepHints(draft: CharacterDraft, step: CreationStepId): string[] {
  const hints: string[] = [];
  if (step === 'xuat-than' && originHasHouses(draft.originId) && draft.houseId === '') {
    hints.push('Giai tầng này chọn được gia tộc — chọn một nhà là có luôn thành trì gốc và quyền thừa kế.');
  }
  if (step === 'xac-nhan' && draft.opening.holdingId === '' && draft.opening.withNpc === '') {
    hints.push('Chưa chọn cảnh mở đầu. Không chọn thì AI tự dựng, và ván nào cũng bắt đầu giống nhau.');
  }
  return hints;
}

export function fullName(draft: CharacterDraft): string {
  return [draft.givenName, draft.familyName].filter((part) => part !== '').join(' ').trim();
}

// ---------------------------------------------------------------------------
// Bước 9 — chốt
// ---------------------------------------------------------------------------

export class CreationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CreationError';
  }
}

/**
 * Tóm tắt bằng chữ của mọi thứ đang sở hữu — cho prompt và cho phiếu nhân vật.
 *
 * Ba tầng in ra bằng ba câu khác nhau, cố ý: người đọc phải thấy ngay "giữ một
 * Làng" khác "được phong Nam tước" khác "cai trị một vùng" (README mục 6).
 */
/**
 * Trần một dòng tóm tắt, khớp `.max(120)` của `characterSchema.possessions`.
 *
 * Cắt ở đây chứ không nới schema: `possessions` là TÓM TẮT bằng chữ cho prompt,
 * và một dòng dài hơn thế thì vừa tốn token vừa không còn là tóm tắt. Sự thật
 * đầy đủ nằm ở `holdings`, `fiefs` và `property` — ba khóa có cấu trúc, và
 * Phần 12–13 đọc chúng chứ không đọc dòng chữ này.
 */
const SUMMARY_LIMIT = 120;

function trimLine(text: string): string {
  if (text.length <= SUMMARY_LIMIT) return text;
  const cut = text.slice(0, SUMMARY_LIMIT - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > SUMMARY_LIMIT - 30 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/**
 * Gia tộc, người đứng đầu, và yêu sách — ba dòng nối nhân vật vào thế giới.
 *
 * Người đứng đầu in ra bằng TÊN trong lorebook chứ không phải id: AI đã có hồ sơ
 * của người đó qua cổng tri thức của Phần 4, nên gọi đúng tên là nó nhận ra và
 * kể nhất quán với mọi chỗ khác.
 */
function houseLines(character: CharacterState): string[] {
  const out: string[] = [];
  const house = houseOf(character.identity.houseId);

  if (house !== null) {
    const head = house.head === '' ? '' : lorePersonName(house.head);
    out.push(
      `Gia tộc: ${house.name}${house.realm === '' ? '' : `, đang cai trị ${regionName(house.realm)}`}` +
        `${head === '' ? '' : `. Người đứng đầu hiện tại là ${head}`}. ${house.note}`,
    );
  }

  for (const claim of character.claims) {
    out.push(`${claimLabel(claim)} — ${claim.note}`);
  }
  return out;
}

export function holdingLabel(tier: string, name: string): string {
  return `${settlementTierName(tier)} ${name}`.trim();
}

function summarisePossessions(draft: CharacterDraft): string[] {
  const out: string[] = [];
  for (const holding of draft.holdings) {
    out.push(`${holdingLabel(holding.tier, holding.name)} — ${holdingRoleName(holding.role)}`);
  }
  for (const fief of draft.fiefs) {
    const duties = fief.obligations.map(obligationName).join(', ');
    const named = fief.name === UNNAMED || fief.name === '' ? '' : ` của ${fief.name}`;
    out.push(`${fiefTitleName(fief.title)}${named}${duties === '' ? '' : ` — nghĩa vụ: ${duties}`}`);
  }
  if (draft.realmRole !== 'khong-co') out.push(`Với lãnh thổ: ${realmRoleName(draft.realmRole)}`);
  out.push(...draft.property);
  return out.slice(0, 40).map(trimLine);
}

/** Nhân vật hoàn chỉnh từ bản nháp. Thuần: cùng bản nháp cho cùng nhân vật. */
export function finalize(draft: CharacterDraft): CharacterState {
  const stats = finalStats(draft);
  const line = startingLine(draft.originId, draft.birthOrderId, draft.lineageStateId);
  const race = raceOf(draft.raceId);
  const maxHp = 10 + stats.vit * 2;

  const family: Record<string, FamilyMember> = {};
  for (const member of draft.family) family[member.id] = member;

  const relations: Record<string, { trust: number; note: string; kind?: string }> = {};
  for (const relation of draft.outsideRelations) {
    relations[relation.id] = { trust: relation.trust, note: relation.note, kind: relation.kind };
  }

  const skills: Record<string, { level: number }> = {};
  for (const [skillId, training] of Object.entries(draft.skills)) {
    if (training > 0) skills[skillId] = { level: training };
  }

  // Thái độ mặc định suy từ chủng tộc và từ nations.json, rồi lấy ghi đè của
  // người chơi đè lên. Ghi cả bảng xuống state chứ không tính lại mỗi lần đọc:
  // Phần 13/14 sẽ SỬA những con số này theo diễn biến, nên chúng phải là state.
  const attitudes: Record<string, number> = { ...attitudeTable(draft.raceId), ...draft.allegiance.attitudes };
  const memberships = seedFactionMemberships(
    draft.allegiance.guilds,
    draft.allegiance.nationId,
    DEFAULT_START_DATE.year,
  );

  // Tên "chưa đặt tên" hữu ích trong UI bản nháp nhưng không được lọt sang các
  // hệ thành trì/tước vị thật: hai cơ nghiệp cùng tên ấy sẽ vi phạm ràng buộc
  // duy nhất tên ngay lúc chốt. Tạo tên trung tính, tái lập được, rồi dùng cùng
  // một tên ở hồ sơ nhân vật và ở slice đích để hai phía không lệch nhau.
  const holdings = draft.holdings.map((entry, index) => ({
    ...entry,
    name: entry.name.trim() === '' || entry.name === UNNAMED ? `Cơ nghiệp ${String(index + 1)}` : entry.name.trim(),
  }));
  const fiefs = draft.fiefs.map((entry, index) => ({
    ...entry,
    name: entry.name.trim() === '' || entry.name === UNNAMED ? `Thái ấp ${String(index + 1)}` : entry.name.trim(),
    obligations: [...entry.obligations],
  }));

  const candidate = {
    identity: {
      id: 'npc_nguoi-choi',
      race: draft.raceId,
      name: fullName(draft),
      portrait: draft.portrait,
      sex: draft.sex,
      originId: draft.originId,
      birthRegionId: draft.birthRegionId,
      startRegionId: draft.startRegionId === '' ? draft.birthRegionId : draft.startRegionId,
      cultureId: draft.cultureId,
      culturalFit: draft.culturalFit,
      birthOrderId: draft.birthOrderId,
      lineageStateId: draft.lineageStateId,
      houseId: draft.houseId,
      lineageName: draft.familyName,
      birthDate: { ...DEFAULT_START_DATE, year: DEFAULT_START_DATE.year - draft.age },
      age: draft.age,
      language: cultureOf(draft.cultureId)?.language ?? race?.language ?? '',
      finalized: true,
    },
    stats: { hp: maxHp, maxHp, ...stats },
    skills,
    appearance: draft.appearance === null ? undefined : { ...draft.appearance, clothing: draft.clothing },
    family,
    relations,
    allegiance: {
      liege: draft.allegiance.liege,
      nationId: draft.allegiance.nationId,
      standing: draft.allegiance.standing,
      religionId: draft.allegiance.religionId,
      religion: religionOf(draft.allegiance.religionId)?.name ?? '',
      piety: draft.allegiance.piety,
      guilds: [...draft.allegiance.guilds],
      memberships,
      activeFactionId: memberships[0]?.id ?? '',
      attitudes,
    },
    holdings,
    fiefs,
    realmRole: draft.realmRole,
    claims: draft.claims.map((claim) => ({ ...claim })),
    opening: { ...draft.opening },
    secrets: draft.secrets.map((secret) => ({ ...secret })),
    resources: { coins: line.coins, prestige: line.prestige },
    gear: draft.gear.map((entry) => ({ ...entry })),
    property: [...draft.property],
    possessions: summarisePossessions(draft),
    personality: { traits: [], note: draft.personalityNote },
    flags: [],
    notes: { rumors: [] },
  };

  const parsed = characterSchema.safeParse(candidate);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new CreationError(
      `phiếu nhân vật không hợp lệ ở "${issue?.path.join('.') ?? '?'}": ${issue?.message ?? 'không rõ'}`,
    );
  }
  return parsed.data;
}

function holdingPath(role: string): OwnershipPath {
  if (role === 'duoc-uy-thac' || role === 'don-tru') return 'duoc-phong';
  if (role === 'dang-tranh-chap') return 'danh-chiem';
  return 'xuat-than';
}

/** Gieo lựa chọn bước 8 sang hệ thành trì thật của Phần 12. */
function seedStartingHoldings(state: GameState, character: CharacterState, seed: string): void {
  const target = state['holdings'];
  if (typeof target !== 'object' || target === null || character.holdings.length === 0) return;
  const rng = createRng(`${seed}::thanh-tri-khoi-dau`);
  const list = character.holdings.map((entry, index) =>
    createHolding(rng, {
      slug: entry.id.replace(/^hold_/u, ''),
      name: entry.name,
      path: holdingPath(entry.role),
      turn: 0,
      tierId: entry.tier,
      races: [{ raceId: character.identity.race, people: 1 }],
      seat: index === 0,
      ...(entry.role === 'dang-tranh-chap' ? { rivalClaimant: 'người đang tranh quyền sở hữu' } : {}),
    }),
  );
  // `createHolding` cần số người của từng tộc bằng tổng dân. Lấp lại sau khi
  // hàm đã chọn dân số theo cấp, thay vì chép một bảng dân số thứ hai ở đây.
  for (const holding of list) {
    holding.population.races = [{ raceId: character.identity.race, people: holding.population.total }];
  }
  Object.assign(target, { list, viewing: list[0]?.id ?? '' });
}

/** Gieo thái ấp/tước vị bước 8 sang hệ chính danh thật của Phần 13. */
function seedStartingTitles(state: GameState, character: CharacterState): void {
  const target = state['titles'];
  if (typeof target !== 'object' || target === null || character.fiefs.length === 0) return;
  const held: HeldTitle[] = character.fiefs.map((entry) => ({
    ...grantTitle({
      titleId: entry.title,
      fiefName: entry.name,
      path: entry.acquisition,
      year: state.meta.gameDate.year,
      liege: entry.liege,
      note: [entry.note, entry.obligations.map(obligationName).join(', ')].filter((line) => line !== '').join(' · '),
    }),
    // Giữ đúng id mà màn tạo nhân vật đã sinh; đây là dây nối giữa hồ sơ và tờ
    // giấy pháp lý, không được sinh một id khác từ cùng cái tên.
    fiefId: entry.id as HeldTitle['fiefId'],
  }));
  Object.assign(target, { held, viewing: held[0]?.fiefId ?? '' });
}

/**
 * Biến từng người ở bước Gia đình thành một hồ sơ Codex ngay khi bắt đầu ván.
 *
 * `character.family` vẫn là nguồn dữ liệu mô phỏng; Codex là hồ sơ để người chơi xem và để AI
 * nhận diện thực thể. Vì hai nơi phục vụ hai việc khác nhau, mọi trường có cấu trúc của người thân
 * đều được chép sang trường tương ứng thay vì chỉ để lại một câu tóm tắt dễ mất thông tin.
 */
function seedFamilyCodex(state: GameState, character: CharacterState): void {
  const target = state['codex'];
  if (typeof target !== 'object' || target === null) return;

  const codex = target as CodexState;
  const playerName = character.identity.name;
  for (const member of Object.values(character.family)) {
    const relation = familyRelationLabel(member.relation);
    const race = raceOf(member.race);
    const memberHouse = member.houseId === '' ? '' : houseName(member.houseId);
    const life = member.alive ? 'còn sống' : 'đã mất';
    const family = [
      `${relation} của ${playerName}`,
      ...(memberHouse === '' ? [] : [`Thuộc ${memberHouse}`]),
    ];
    const notes = [
      member.note,
      member.loreEntry === '' ? '' : `Hồ sơ lore: ${member.loreEntry}`,
    ].filter((line) => line !== '').join(' · ');

    codex.npcs[member.id] = npcCodexSchema.parse({
      id: member.id,
      name: member.name,
      summary: `${relation} của ${playerName}; ${member.age} tuổi; ${life}; ${member.status}. Vai trò: ${member.role}.`,
      tags: ['gia đình', member.relation, life, member.status, ...(memberHouse === '' ? [] : [memberHouse])],
      sources: [{ turn: 0, source: 'tạo nhân vật · bước Gia đình', confidence: 100 }],
      portrait: '',
      role: member.role,
      familyRelation: relation,
      houseId: member.houseId,
      loreEntry: member.loreEntry,
      alive: member.alive,
      status: member.status,
      sex: member.sex === 'nu' ? 'female' : 'male',
      gender: member.sex === 'nu' ? 'nữ' : 'nam',
      age: member.age,
      adultConfirmed: member.age >= 18,
      species: race?.name ?? member.race,
      race: race?.name ?? member.race,
      personality: { goals: member.goal === '' ? [] : [member.goal] },
      statistics: member.stats,
      background: {
        occupation: member.role,
        family,
        affiliations: memberHouse === '' ? [] : [memberHouse],
        motivations: member.goal === '' ? [] : [member.goal],
        notes,
      },
      relationships: {
        'npc_nguoi-choi': {
          targetId: 'npc_nguoi-choi',
          type: relation,
          status: member.status,
          affection: member.attitude,
          sinceTurn: 0,
          lastUpdatedTurn: 0,
          notes: member.note,
        },
      },
    });
  }
}

/**
 * State ban đầu của cả ván, dựng từ bản nháp.
 *
 * Bí mật khởi đầu được cắm thẳng vào slice tri thức của Phần 4 (mục 7): nhân
 * vật BIẾT chuyện của chính mình với `confidence: 100`, nên cổng tri thức không
 * bao giờ chặn nó, còn NPC thì vẫn không biết cho tới khi bị lộ.
 */
export function buildInitialState(draft: CharacterDraft): GameState {
  const issues = allIssues(draft);
  if (issues.length > 0) throw new CreationError(`chưa xong: ${issues.join(' ')}`);

  const state = createInitialState(draft.seed, fullName(draft));
  const character = finalize(draft);
  (state as Record<string, unknown>)['character'] = character;

  const knowledge = state['knowledge'];
  if (typeof knowledge === 'object' && knowledge !== null) {
    const known: Record<string, { learnedTurn: number; source: string; confidence: number }> = {};
    for (const secret of character.secrets) {
      known[secret.id] = { learnedTurn: 0, source: 'chuyện của chính mình', confidence: 100 };
    }
    Object.assign(knowledge, {
      known,
      regionId: draft.birthRegionId,
      factionId: draft.allegiance.nationId,
    });
  }

  // TRANG BỊ KHAI BÁO → VẬT PHẨM THẬT (Phần 16). `character.gear` vẫn ở nguyên
  // chỗ cũ vì prompt của Phần 3 và phiếu nhân vật đọc nó; `items.owned` là bản
  // theo dõi từng vết mẻ trên chính những món ấy. Hai lớp, hai việc.
  if (slices.get('items') !== undefined) {
    seedInto(state as unknown as GameState, character.gear);
  }

  // Các lựa chọn ở bước 8 không chỉ là chữ trong hồ sơ: gieo chúng vào đúng hệ
  // sở hữu để bảng trạng thái, công/thủ thành, quyền chỉ huy và chính danh cùng
  // đọc một sự thật ngay từ lượt đầu tiên.
  seedStartingHoldings(state as unknown as GameState, character, draft.seed);
  seedStartingTitles(state as unknown as GameState, character);
  seedFamilyCodex(state as unknown as GameState, character);

  const parsed = slices.rootSchema().safeParse(state);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new CreationError(
      `state ban đầu không hợp lệ ở "${issue?.path.join('.') ?? '?'}": ${issue?.message ?? 'không rõ'}`,
    );
  }
  return parsed.data as unknown as GameState;
}

// ---------------------------------------------------------------------------
// Đoạn mở đầu (mục 9, sau bước 9)
// ---------------------------------------------------------------------------

/**
 * Hành động mở màn: nêu rõ mọi lựa chọn ở chín bước, và ra lệnh cho AI CHỈ viết
 * cảnh mở đầu.
 *
 * Câu lệnh cuối là R1 viết ra thành lời. Không có nó thì lời gọi đầu tiên là
 * lời gọi dễ bị AI "giúp" nhất — nó vừa đọc một phiếu nhân vật đầy con số và sẽ
 * rất muốn tặng thêm một thanh kiếm hoặc nâng một chỉ số cho hợp cảnh.
 *
 * Hàm THUẦN và trả về chữ, không tự gọi proxy: người chơi bấm gửi thì lượt đó
 * mới chạy, và nó chạy qua đúng vòng lặp 10 bước như mọi lượt khác.
 */
export function openingSceneAction(character: CharacterState): string {
  const race = raceOf(character.identity.race);
  const origin = originOf(character.identity.originId);
  const living = Object.values(character.family).filter((member) => member.alive);
  const appearance = character.appearance;

  const order = birthOrderOf(character.identity.birthOrderId);
  const lineage = lineageStateOf(character.identity.lineageStateId);

  // Mọi thứ trong lời này phải là CHỮ ĐỌC ĐƯỢC, không phải id. `realm_france`
  // và `con-thu` là ngôn ngữ của engine; đưa chúng cho AI là buộc nó đoán, và
  // nó sẽ đoán sai theo kiểu rất khó phát hiện trong một đoạn văn trôi chảy.
  const lines = [
    'Hãy viết CẢNH MỞ ĐẦU cho nhân vật dưới đây.',
    '',
    `Tên: ${character.identity.name}`,
    `Chủng tộc: ${race?.name ?? character.identity.race}${race === null ? '' : ` — ${race.standing}`}`,
    `Giai tầng: ${origin?.name ?? character.identity.originId}${origin === null ? '' : ` — ${origin.description}`}`,
    ...houseLines(character),
    `Tuổi: ${character.identity.age} · Giới: ${character.identity.sex === 'nam' ? 'nam' : 'nữ'}`,
    `Nơi sinh: ${regionName(character.identity.birthRegionId)}`,
    `Đang ở: ${regionName(character.identity.startRegionId)}`,
    `Văn hóa nuôi dạy: ${cultureOf(character.identity.cultureId)?.name ?? 'không rõ'} (hòa nhập ${
      character.identity.culturalFit
    }/100)`,
    `Thứ tự trong nhà: ${order?.name ?? character.identity.birthOrderId} · Tình trạng gia tộc: ${
      lineage?.name ?? character.identity.lineageStateId
    }`,
    `Tiền: ${character.resources.coins} đồng bạc · Uy tín: ${character.resources.prestige}`,
  ];

  const worn = character.gear.filter((entry) => entry.equipped);
  if (worn.length > 0) {
    lines.push(
      `Đang mang trên người: ${worn
        .map((entry) => {
          const quality = entry.quality === 'thuong' ? '' : ` ${qualityName(entry.quality)}`;
          const material = entry.material === '' ? '' : ` bằng ${materialName(entry.material)}`;
          return `${gearName(entry.item)}${material}${quality}`;
        })
        .join(', ')}`,
    );
  }
  const packed = character.gear.filter((entry) => !entry.equipped);
  if (packed.length > 0) {
    lines.push(`Trong hành lý: ${packed.map((entry) => gearName(entry.item)).join(', ')}`);
  }

  // Ba tầng in ra bằng ba câu khác nhau, cố ý: AI phải thấy "giữ một Làng" khác
  // "được phong Nam tước" khác "cai trị một vùng" (README mục 6).
  for (const holding of character.holdings) {
    lines.push(
      `Đang giữ một thành trì: ${holdingLabel(holding.tier, holding.name)}, tư cách ${holdingRoleName(
        holding.role,
      )}${holding.regionId === '' ? '' : `, nằm ở ${regionName(holding.regionId)}`}.`,
    );
  }
  for (const fief of character.fiefs) {
    const duties = fief.obligations.map(obligationName).join(', ');
    lines.push(
      `Được phong ${fiefTitleName(fief.title)}${fief.name === UNNAMED || fief.name === '' ? '' : ` của ${fief.name}`}` +
        `${fief.liege === '' ? '' : `, thề với ${fief.liege}`}` +
        `${duties === '' ? '.' : `, nghĩa vụ: ${duties}.`}`,
    );
  }
  if (character.realmRole !== 'khong-co') {
    lines.push(`Với lãnh thổ: ${realmRoleName(character.realmRole)}.`);
  }
  if (character.property.length > 0) {
    lines.push(`Tài sản khác: ${character.property.join(', ')}.`);
  }

  if (appearance !== undefined) {
    lines.push(
      `Ngoại hình: cao ${appearance.heightCm} cm, nặng ${appearance.weightKg} kg, dáng ${appearance.build};` +
        ` da ${appearance.skin}, tóc ${appearance.hair} (${appearance.hairStyle}), mắt ${appearance.eyes};` +
        ` ${appearance.face}; giọng ${appearance.voice}; dáng đi ${appearance.gait}; ${appearance.mannerism}` +
        (appearance.features.length === 0 ? '' : `; đặc trưng chủng tộc: ${appearance.features.join(', ')}`),
    );
  }

  if (living.length > 0) {
    lines.push(
      `Người thân còn sống: ${living
        .map(
          (member) =>
            `${familyRelationLabel(member.relation)} ${member.name} (${member.age} tuổi, ${member.status})`,
        )
        .join('; ')}`,
    );
  }

  const allegiance = character.allegiance;
  const religion = religionOf(allegiance.religionId);
  lines.push(
    `Trung thành: ${allegiance.nationId === '' ? 'chưa thuộc thế lực nào' : nationName(allegiance.nationId)}` +
      `${allegiance.liege === '' ? '' : `, lãnh chúa trực tiếp ${allegiance.liege}`}` +
      ` · Tôn giáo: ${religion?.name ?? 'không theo đạo nào'} (sùng đạo ${allegiance.piety}/100)` +
      `${allegiance.guilds.length === 0 ? '' : ` · Hội đoàn: ${allegiance.guilds.join(', ')}`}`,
  );
  if (religion !== null && religion.taboos.length > 0 && allegiance.piety >= 40) {
    lines.push(`Điều nhân vật kiêng: ${religion.taboos.join(', ')}.`);
  }

  if (character.secrets.length > 0) {
    lines.push(`Điều nhân vật đang giấu: ${character.secrets.map((secret) => secret.text).join(' ')}`);
  }

  // Cảnh mở đầu: nơi, người, và tình huống. Đây là thứ người chơi chọn ở bước 9
  // để không phải nhận một cảnh mở màn chung chung.
  const opening = character.opening;
  if (opening.holdingId !== '' || opening.withNpc !== '' || opening.situation !== '') {
    lines.push('');
    if (opening.holdingId !== '') lines.push(`CẢNH MỞ ĐẦU DIỄN RA Ở: ${regionName(opening.holdingId)}.`);
    if (opening.withNpc !== '') {
      lines.push(`Có mặt cùng nhân vật: ${lorePersonName(opening.withNpc)}. Giữ đúng tính cách của người này như hồ sơ mô tả.`);
    }
    if (opening.situation !== '') lines.push(`Tình huống lúc màn kéo lên: ${opening.situation}`);
  }

  lines.push(
    '',
    'MỆNH LỆNH: chỉ viết cảnh mở đầu — nhân vật đang ở đâu, đang làm gì, không khí ra sao.',
    'KHÔNG được thêm, bớt hay đổi bất kỳ chỉ số, tài nguyên, vật phẩm hay quan hệ nào.',
    'KHÔNG được quyết định thành hay bại của việc gì. Mọi con số do engine giữ.',
  );

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Bảng so sánh của bước 1
// ---------------------------------------------------------------------------

export interface SkillPreviewRow {
  skillId: string;
  name: string;
  system: string;
  /** Ngưỡng d100 đọc được: chỉ số × 3 + rèn luyện. */
  percent: number;
}

/** Kỹ năng nào bị chỉ số vừa sửa ảnh hưởng — bước 3 hiện ngay bên cạnh. */
export function skillsAffectedBy(stat: StatId): SkillPreviewRow[] {
  return allSkills()
    .filter((skill) => skill.stat === stat)
    .map((skill) => ({ skillId: skill.id, name: skill.name, system: skill.system, percent: 0 }));
}

/** Ngưỡng đọc được của một kỹ năng theo bản nháp hiện tại. */
export function draftSkillPercent(draft: CharacterDraft, skillId: string): number {
  const skill = skillOf(skillId);
  if (skill === null) return 0;
  return finalStats(draft)[skill.stat] * 3 + (draft.skills[skillId] ?? 0);
}
