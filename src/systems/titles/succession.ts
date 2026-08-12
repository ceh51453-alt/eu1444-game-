/**
 * THỪA KẾ (mục 9) — và cơ chế làm cho cái chết không phải màn hình game over.
 *
 * > "Khi nhân vật người chơi chết: chơi tiếp bằng người thừa kế, kế thừa đất và
 * > tước nhưng KHÔNG kế thừa kỹ năng và quan hệ."
 *
 * Danh sách "kế thừa cái gì" là một DANH SÁCH ĐÓNG nằm trong
 * `data/succession.json → config.inherits`, không phải một chuỗi if. Đó là toàn
 * bộ hợp đồng của cơ chế chơi dài hạn, và nếu nó nằm rải trong code thì phần sau
 * sẽ thêm một khóa vào đó mà không ai nhận ra người thừa kế vừa được thừa hưởng
 * cả trí nhớ của người chết.
 *
 * SÁU LUẬT KẾ VỊ, mỗi phe một luật (mục 9). Chúng khác nhau ở ba chỗ: THỨ TỰ xếp
 * hàng, có CHIA ĐẤT không, và có mở ra một cuộc bầu cử hay một trận thách đấu
 * không. Ba chỗ ấy đều là trường trong data.
 */

import { ladderOf, noHeirRules, successionConfig, successionLawOf, heirRelation } from './data';
import type { HeirRelation, NoHeirOption, NoHeirRules, SuccessionLaw } from './data';
import type { Heir, HeldTitle } from './types';

export class SuccessionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SuccessionError';
  }
}

/**
 * Một người trong nhà, đủ để xếp hàng thừa kế.
 *
 * Khai theo CẤU TRÚC chứ không import kiểu của slice `character`: hàng thừa kế
 * cũng phải xếp được cho một NPC chư hầu, và một chư hầu không có `character`.
 */
export interface Kin {
  name: string;
  /** `con`, `anh`, `chi`, `em`, `chau`, `ho-hang`… đúng từ vựng của Phần 6. */
  relation: string;
  sex: 'nam' | 'nu';
  age: number;
  alive: boolean;
}

/** Luật kế vị đang áp: người chơi chọn được, không chọn thì theo thang. */
export function successionLawFor(ladderId: string, override = ''): SuccessionLaw {
  const chosen = override === '' ? null : successionLawOf(override);
  if (chosen !== null) return chosen;
  const ladder = ladderOf(ladderId);
  const fallback = successionLawOf(ladder?.successionDefault ?? 'truong-nam');
  if (fallback === null) throw new SuccessionError(`không có luật kế vị nào cho thang "${ladderId}"`);
  return fallback;
}

/**
 * Một người nhà khớp với ô nào trong `order` của luật.
 *
 * Đây là chỗ "con trai lớn nhất" khác "con trai thứ": cả hai đều là `relation:
 * 'con'` trong Phần 6, và thứ tự sinh cộng giới tính mới tách chúng ra.
 */
function slotFor(kin: Kin, eldestChildAge: number, eldestDaughterAge: number): string[] {
  const slots: string[] = [];
  if (kin.relation === 'con') {
    slots.push('moi-con');
    if (kin.sex === 'nam') slots.push(kin.age >= eldestChildAge ? 'con-trai-lon-nhat' : 'con-trai-khac');
    else slots.push(kin.age >= eldestDaughterAge ? 'con-gai-lon-nhat' : 'con-gai-khac');
  }
  if (kin.relation === 'anh' || kin.relation === 'em') {
    slots.push(kin.sex === 'nam' ? 'anh-em-trai' : 'chi-em-gai');
  }
  if (kin.relation === 'chi') slots.push('chi-em-gai');
  if (kin.relation === 'chau') slots.push(kin.sex === 'nam' ? 'chau-trai' : 'chau-gai-ben-me');
  if (kin.relation === 'ho-hang') slots.push('ho-hang-gan', 'ho-hang-ben-me');
  return slots;
}

export interface HeirLineOptions {
  /** Người thừa kế đã chỉ định. Đứng đầu hàng bất kể luật, và trả giá ở nơi khác. */
  designated?: string;
}

/**
 * HÀNG THỪA KẾ, có thứ tự và có LÝ DO.
 *
 * Lý do không phải trang trí: mục 11 đòi cây kế vị "hiện rõ ai sẽ nối nghiệp", và
 * một danh sách tên không nói được vì sao đứa con thứ đứng trước đứa cháu.
 */
export function heirLine(
  family: Readonly<Record<string, Kin>>,
  law: SuccessionLaw,
  options: HeirLineOptions = {},
): Heir[] {
  const living = Object.entries(family).filter(([, kin]) => kin.alive);

  const childAges = living.filter(([, kin]) => kin.relation === 'con');
  const eldestSon = Math.max(0, ...childAges.filter(([, kin]) => kin.sex === 'nam').map(([, kin]) => kin.age));
  const eldestDaughter = Math.max(0, ...childAges.filter(([, kin]) => kin.sex === 'nu').map(([, kin]) => kin.age));

  const heirs: Heir[] = [];
  for (const [id, kin] of living) {
    const slots = slotFor(kin, eldestSon, eldestDaughter);
    let best: { relation: HeirRelation; position: number } | null = null;
    for (const slot of slots) {
      const position = law.order.indexOf(slot);
      if (position === -1) continue;
      const relation = heirRelation(slot);
      if (relation === null) continue;
      if (best === null || position < best.position) best = { relation, position };
    }
    if (best === null) continue;

    // Thiên vị giới tính của luật: một luật trưởng nam vẫn xếp con gái vào hàng,
    // chỉ là xếp sau. Bỏ hẳn họ ra thì "không có người thừa kế" sẽ xảy ra thường
    // xuyên hơn thực tế rất nhiều, và khủng hoảng kế vị mất hết sức nặng.
    const genderPenalty = law.genderBias === 'khong' || law.genderBias === kin.sex ? 0 : 12;
    const weight = best.relation.weight - best.position * 4 - genderPenalty + Math.min(8, kin.age / 10);

    heirs.push({
      id,
      name: kin.name,
      relation: kin.relation,
      age: kin.age,
      sex: kin.sex,
      alive: true,
      weight,
      reason: `${best.relation.name}${genderPenalty > 0 ? ' (luật thiên vị bên kia)' : ''}`,
    });
  }

  const designated = options.designated ?? '';
  if (designated !== '') {
    const at = heirs.findIndex((heir) => heir.id === designated);
    if (at >= 0) {
      const chosen = heirs[at];
      if (chosen !== undefined) {
        heirs[at] = { ...chosen, weight: chosen.weight + 1000, reason: `${chosen.reason} · được chỉ định` };
      }
    }
  }

  return heirs.sort((left, right) => right.weight - left.weight);
}

/** Ai sẽ nối nghiệp. `null` nghĩa là KHỦNG HOẢNG (mục 9). */
export function heirOf(
  family: Readonly<Record<string, Kin>>,
  law: SuccessionLaw,
  options: HeirLineOptions = {},
): Heir | null {
  if (law.kind !== 'the-tap') {
    // Bầu cử, thách đấu, hội đồng chọn: hàng huyết thống không quyết định gì cả.
    // Trả về null để chỗ gọi biết phải mở một cuộc bầu, một trận đấu, hoặc một
    // phiên hội đồng — chứ không phải im lặng trao ngôi cho đứa con lớn.
    return null;
  }
  return heirLine(family, law, options)[0] ?? null;
}

// ---------------------------------------------------------------------------
// Kế vị
// ---------------------------------------------------------------------------

/** Cuộc kế vị này sạch tới đâu. */
export type SuccessionKind = 'clean' | 'disputed' | 'usurped';

export interface SuccessionOutcome {
  /** Tước người thừa kế nhận được, đã trừ chính danh. */
  held: HeldTitle[];
  /** Tước bị chia cho anh em (luật `chia-deu`) — chúng thành thái ấp của người khác. */
  split: HeldTitle[];
  heir: Heir | null;
  kind: SuccessionKind;
  /** Áp cho MỌI chư hầu: họ thề với NGƯỜI, không thề với cái ghế. */
  vassalLoyaltyDelta: number;
  /** Nhiếp chính khi người thừa kế chưa đủ tuổi. */
  regency: boolean;
  crisis: boolean;
  lines: string[];
  /** Đúng những khóa được mang sang, đọc từ data. Kỹ năng và quan hệ KHÔNG có ở đây. */
  inherits: readonly string[];
  resets: readonly string[];
}

/**
 * NGƯỜI CHƠI CHẾT → chơi tiếp bằng người thừa kế (mục 9).
 *
 * Hàm này THUẦN và không đụng vào store: nó nhận tước đang giữ cộng gia đình, trả
 * về tước của người kế nghiệp cộng những khoản phải áp. Ai gọi nó thì ghi xuống
 * state qua MVU (R2).
 */
export function succeed(
  held: readonly HeldTitle[],
  family: Readonly<Record<string, Kin>>,
  law: SuccessionLaw,
  year: number,
  options: HeirLineOptions = {},
): SuccessionOutcome {
  const config = successionConfig();
  const heir = heirOf(family, law, options);
  const lines: string[] = [];

  if (heir === null && law.kind === 'the-tap') {
    const rules = noHeirRules();
    return {
      held: [],
      split: [],
      heir: null,
      kind: 'disputed',
      vassalLoyaltyDelta: config.vassalLoyaltyOnSuccession.disputed,
      regency: false,
      crisis: true,
      inherits: config.inherits,
      resets: config.resets,
      lines: [
        'Không còn ai trong hàng thừa kế.',
        `Hàng xóm nghe tin trước cả chư hầu: ${String(rules.ifNothing.neighbourClaims)} yêu sách mọc lên trong vòng một mùa.`,
      ],
    };
  }

  const contested = held.some((title) => title.rivalClaimant !== '');
  const kind: SuccessionKind = contested ? 'disputed' : 'clean';
  const legitimacyDelta = config.legitimacyOnSuccession[kind];
  const regency = heir !== null && heir.age < config.minorAge;

  // Luật `chia-deu`: mỗi tước ngoài tước cao nhất rơi sang một người con khác.
  // Đây là chỗ "Đế quốc rã dần, rất đúng lịch sử" của mục 9 thành cơ học.
  const sorted = [...held].sort((left, right) => right.legitimacy - left.legitimacy);
  const kept = law.splits ? sorted.slice(0, 1) : sorted;
  const split = law.splits ? sorted.slice(1) : [];

  const inherited = kept.map((title) => ({
    ...title,
    legitimacy: Math.max(0, Math.min(100, title.legitimacy + legitimacyDelta)),
    sinceYear: year,
    obligations: {
      ...title.obligations,
      paidThisYear: false,
      attendedThisYear: false,
      levyDaysCalled: 0,
    },
  }));

  if (heir !== null) {
    lines.push(`${heir.name} nối nghiệp — ${heir.reason}.`);
  }
  if (regency) {
    lines.push(`Người kế nghiệp mới ${String(heir?.age ?? 0)} tuổi: phải có nhiếp chính, và nhiếp chính thì ăn bớt.`);
  }
  if (split.length > 0) {
    lines.push(`Luật chia đều: ${String(split.length)} thái ấp rơi sang tay anh em — họ là chư hầu của ngài từ hôm nay, trên giấy.`);
  }
  lines.push('Chư hầu thề với NGƯỜI, không thề với cái ghế: cả một cuộc kế vị sạch cũng phải đi thề lại một vòng.');

  return {
    held: inherited,
    split,
    heir,
    kind,
    vassalLoyaltyDelta: config.vassalLoyaltyOnSuccession[kind] + law.effects.vassalLoyalty,
    regency,
    crisis: false,
    inherits: config.inherits,
    resets: config.resets,
    lines,
  };
}

/** Ba lối thoát khi không có người thừa kế (mục 9). Cả ba đều phải trả giá. */
export function noHeirOptions(rank: number, vassalCount: number): NoHeirOption[] {
  return noHeirRules().options.filter(
    (option) => rank >= option.requiresRank && vassalCount >= option.requiresVassals,
  );
}

/** Chưa chọn gì thì khủng hoảng ập xuống — con số nằm ở data, không ở đây. */
export function noHeirCrisis(): NoHeirRules['ifNothing'] {
  return noHeirRules().ifNothing;
}
