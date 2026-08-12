/**
 * GIA TỘC VÀ QUYỀN THỪA KẾ (Phần 6) — nạp từ `/data/houses.json` theo R5.
 *
 * Đây là chỗ nhân vật người chơi NỐI VÀO THẾ GIỚI ĐÃ CÓ. Trước file này, một
 * "đại quý tộc" chỉ là một dòng chữ và vài con số; sau nó, đại quý tộc đó thuộc
 * Nhà Habsburg, thề với ai đó có tên trong lorebook, và có một yêu sách lên ngai
 * Đế quốc mà cả một phe đang tranh.
 *
 * BA CON TRỎ, và cả ba đều có bài test gác:
 *   `head`     → entry `person` trong lorebook (văn xuôi ở đó, không chép lại)
 *   `realm` / `seat` / `province` → `regions.json`
 *   `race`     → `races.json`
 *
 * YÊU SÁCH KHÁC VỚI SỞ HỮU. `claims` là thứ gia tộc ĐANG ĐÒI; `holdings` và
 * `fiefs` của slice là thứ nhân vật ĐANG GIỮ. Cả thế kỷ 15 nằm trong khoảng
 * cách giữa hai vế đó, nên gộp chúng lại là mất luôn phần thú vị nhất.
 *
 * Hệ thừa kế thật — ai đứng trước ai, chết thì ai lên, chư hầu có theo không —
 * là Phần 13. Ở đây chỉ khai vạch xuất phát.
 */

import { z } from 'zod';
import housesFile from '@data/houses.json';
import { seedBooks } from '@/lore/lorebook';
import { regionName, regionOf } from '@/lore/regions';
import { useLorebookStore } from '@/state/lorebooks';
import { fiefTitleOf } from './possessions';

export const houseSchema = z.object({
  id: z.string().startsWith('house_'),
  name: z.string().min(1),
  /** Quyết định giai tầng nào chọn được. KHÔNG khóa trần tước vị về sau (mục 3). */
  tier: z.string().min(1),
  /** Lãnh thổ gia tộc đang CAI TRỊ. Rỗng nghĩa là có tên tuổi mà không cai trị vùng nào. */
  realm: z.string().default(''),
  seat: z.string().default(''),
  province: z.string().default(''),
  rank: z.string().default('thuong-dan'),
  race: z.string().default(''),
  /** Người đứng đầu hiện tại — id một entry trong lorebook. Rỗng thì dùng `headName`. */
  head: z.string().default(''),
  /**
   * Tên người đứng đầu khi gia tộc KHÔNG có nhân vật trong lorebook.
   *
   * Nhà lịch sử có thật thì nhiều hơn nhân vật lorebook rất nhiều, và một danh
   * sách gia tộc mà nửa số dòng không có ai đứng đầu thì đọc như một bảng kế
   * toán. Tên sinh từ kho tên của chính chủng tộc gia tộc đó, nên nghe đúng
   * vùng — và đều là nữ, theo đúng thiết lập của thế giới này.
   */
  headName: z.string().default(''),
  status: z.string().default('thinh'),
  /** Vùng gia tộc ĐANG ĐÒI, chưa chắc đang giữ. */
  claims: z.array(z.string()).default([]),
  /** Nhánh thứ tách ra từ nhà này. */
  cadets: z.array(z.string()).default([]),
  /** Nhánh trưởng mà nhà này tách ra từ đó. */
  parent: z.string().default(''),
  /** Đối địch và liên minh — LUÔN hai chiều, có bài test gác. */
  rivals: z.array(z.string()).default([]),
  allies: z.array(z.string()).default([]),
  /** Vùng để xếp nhóm trong bộ chọn. Suy sẵn lúc dựng data. */
  group: z.string().default(''),
  note: z.string().default(''),
});

const entrySchema = z.object({ id: z.string(), name: z.string(), note: z.string().default('') });

const fileSchema = z.object({
  tiers: z.array(entrySchema.extend({ origins: z.array(z.string()).default([]) })),
  claimStrengths: z.array(entrySchema),
  houses: z.array(houseSchema),
});

export type House = z.infer<typeof houseSchema>;
export type HouseTier = z.infer<typeof fileSchema>['tiers'][number];

export class HouseDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HouseDataError';
  }
}

function load(): z.infer<typeof fileSchema> & { byId: Map<string, House> } {
  const parsed = fileSchema.safeParse(housesFile);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new HouseDataError(
      `data/houses.json hỏng ở "${issue?.path.join('.') ?? '?'}": ${issue?.message ?? 'không rõ'}`,
    );
  }
  const byId = new Map<string, House>();
  for (const house of parsed.data.houses) {
    if (byId.has(house.id)) throw new HouseDataError(`gia tộc trùng id: ${house.id}`);
    byId.set(house.id, house);
  }
  return { ...parsed.data, byId };
}

const DATA = load();

export function allHouses(): House[] {
  return [...DATA.byId.values()];
}

export function houseOf(id: string): House | null {
  return DATA.byId.get(id) ?? null;
}

export function houseName(id: string): string {
  return DATA.byId.get(id)?.name ?? id;
}

export function houseTiers(): HouseTier[] {
  return [...DATA.tiers];
}

export function claimStrengths(): { id: string; name: string; note: string }[] {
  return [...DATA.claimStrengths];
}

export function claimStrengthName(id: string): string {
  return DATA.claimStrengths.find((entry) => entry.id === id)?.name ?? id;
}

/**
 * Gia tộc chọn được ở một giai tầng.
 *
 * Một nông nô KHÔNG chọn gia tộc — và đó không phải hạn chế tùy tiện: gia tộc ở
 * đây nghĩa là một cái tên có người ngoài tỉnh nhận ra. Nông nô vẫn có gia đình,
 * vẫn có họ, chỉ là cái họ đó không mở được cửa nào.
 */
export function housesForOrigin(originId: string): House[] {
  const tiers = DATA.tiers.filter((tier) => tier.origins.includes(originId)).map((tier) => tier.id);
  if (tiers.length === 0) return [];
  return allHouses().filter((house) => tiers.includes(house.tier));
}

export function originHasHouses(originId: string): boolean {
  return housesForOrigin(originId).length > 0;
}

/** Gia tộc hợp với chủng tộc thì xếp lên đầu — gợi ý thôi, không lọc bỏ. */
export function housesForOriginAndRace(originId: string, raceId: string): House[] {
  return housesForOrigin(originId).sort((a, b) => Number(b.race === raceId) - Number(a.race === raceId));
}

// ---------------------------------------------------------------------------
// Nối vào lorebook
// ---------------------------------------------------------------------------

export interface LorePerson {
  id: string;
  title: string;
  summary: string;
}

/**
 * Danh sách nhân vật có thật trong lorebook.
 *
 * Đọc kho ĐANG DÙNG nếu nó đã hydrate — người chơi sửa lorebook thì trình tạo
 * nhân vật phải thấy bản sửa. Chưa hydrate thì lùi về sách mẫu đi kèm bản build,
 * vốn cũng chính là thứ sẽ được gieo vào IndexedDB ngay sau đó.
 *
 * CHỈ LẤY `public`, và đây không phải bộ lọc cho gọn danh sách. Lorebook chiến
 * dịch có hẳn một tầng `gated`/`secret` là mặt riêng và động cơ thật của cùng
 * những nhân vật đó (Phần 4 mục 5). Cho chọn tầng ấy lúc tạo nhân vật là để
 * người chơi đọc bí mật của cả thế giới trước khi ván bắt đầu — đúng cái bệnh
 * của SillyTavern mà cổng tri thức sinh ra để chữa.
 */
export function lorePeople(): LorePerson[] {
  const store = useLorebookStore.getState();
  const books = store.loaded && store.books.length > 0 ? store.books : seedBooks().books;
  const out: LorePerson[] = [];
  const seen = new Set<string>();

  for (const book of books) {
    for (const entry of book.entries) {
      if (entry.type !== 'person' || entry.knowledge !== 'public' || seen.has(entry.id)) continue;
      seen.add(entry.id);
      out.push({ id: entry.id, title: entry.title, summary: entry.summary ?? '' });
    }
  }
  return out.sort((a, b) => a.title.localeCompare(b.title, 'vi'));
}

export function lorePersonName(id: string): string {
  return lorePeople().find((person) => person.id === id)?.title ?? id;
}

/**
 * Người đứng đầu gia tộc, tên đọc được.
 *
 * Ưu tiên lorebook: nếu nhà này có nhân vật thật thì lấy tên ở đó, vì người chơi
 * sửa lorebook là tên phải đổi theo. Không có thì dùng `headName` sinh sẵn.
 */
export function houseHeadName(houseId: string): string {
  const house = houseOf(houseId);
  if (house === null) return '';
  return house.head === '' ? house.headName : lorePersonName(house.head);
}

/** Nhà này có nhân vật thật trong lorebook không — UI đánh dấu khác nhau. */
export function houseHasLoreHead(houseId: string): boolean {
  return (houseOf(houseId)?.head ?? '') !== '';
}

export function rivalsOf(houseId: string): House[] {
  return (houseOf(houseId)?.rivals ?? []).map(houseOf).filter((house): house is House => house !== null);
}

export function alliesOf(houseId: string): House[] {
  return (houseOf(houseId)?.allies ?? []).map(houseOf).filter((house): house is House => house !== null);
}

/** Nhánh trưởng và nhánh thứ — cây gia tộc một tầng, đủ cho lúc tạo nhân vật. */
export function relatedHouses(houseId: string): { parent: House | null; cadets: House[] } {
  const house = houseOf(houseId);
  if (house === null) return { parent: null, cadets: [] };
  return {
    parent: house.parent === '' ? null : houseOf(house.parent),
    cadets: house.cadets.map(houseOf).filter((entry): entry is House => entry !== null),
  };
}

// ---------------------------------------------------------------------------
// Tìm và xếp nhóm — 130 gia tộc thì một danh sách phẳng là không dùng được
// ---------------------------------------------------------------------------

/**
 * Xếp gia tộc theo vùng.
 *
 * Bộ chọn phẳng còn dùng được ở ba mươi dòng; ở một trăm ba mươi thì người chơi
 * chỉ cuộn chứ không chọn. Nhóm theo vùng là cách xếp DUY NHẤT khớp với cách
 * người ta thật sự tìm một gia tộc: nhớ nó ở đâu trước khi nhớ nó tên gì.
 */
export function housesByGroup(houses: readonly House[] = allHouses()): { group: string; houses: House[] }[] {
  const groups = new Map<string, House[]>();
  for (const house of houses) {
    const key = house.group === '' ? 'reg_europa' : house.group;
    const bucket = groups.get(key);
    if (bucket === undefined) groups.set(key, [house]);
    else bucket.push(house);
  }
  return [...groups.entries()]
    .map(([group, entries]) => ({ group, houses: entries.sort((a, b) => a.name.localeCompare(b.name, 'vi')) }))
    .sort((a, b) => regionName(a.group).localeCompare(regionName(b.group), 'vi'));
}

/** Bỏ dấu để gõ "habsburg" cũng ra "Nhà Habsburg", và "vuong quoc phap" ra Pháp. */
function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .toLowerCase();
}

/**
 * Tìm gia tộc theo tên, vùng, chủng tộc hoặc tên người đứng đầu.
 *
 * Gõ "phap" ra mọi nhà ở Pháp; gõ "habsburg" ra nhà đó; gõ "lun" ra nhà của tộc
 * Lùn. Người chơi nhớ được cái nào thì gõ cái đó.
 */
export function searchHouses(query: string, houses: readonly House[] = allHouses()): House[] {
  const needle = fold(query.trim());
  if (needle === '') return [...houses];

  return houses.filter((house) => {
    const haystack = [
      house.name,
      house.note,
      regionName(house.realm),
      regionName(house.province),
      regionName(house.group),
      houseHeadName(house.id),
      house.race,
    ]
      .map(fold)
      .join(' ');
    return haystack.includes(needle);
  });
}

// ---------------------------------------------------------------------------
// Yêu sách
// ---------------------------------------------------------------------------

export const CLAIM_KINDS = ['realm', 'fief', 'holding'] as const;
export type ClaimKind = (typeof CLAIM_KINDS)[number];

export interface DerivedClaim {
  id: string;
  kind: ClaimKind;
  target: string;
  targetName: string;
  strength: string;
  /** Thừa hưởng QUA AI — id người nhà trong bản nháp, hoặc id NPC lorebook. */
  through: string;
  throughLabel: string;
  note: string;
}

/**
 * Yêu sách suy ra từ một gia tộc, thừa hưởng qua một người cụ thể.
 *
 * ĐỘ MẠNH GIẢM DẦN THEO KHOẢNG CÁCH HUYẾT THỐNG, và đó là toàn bộ luật ở đây:
 * qua cha hoặc mẹ thì còn cãi được, qua ông bà thì phải giải thích, xa hơn nữa
 * thì chỉ là một câu chuyện kể trong bữa ăn. Ai đứng trước ai trong hàng thừa
 * kế là việc của Phần 13; Phần 6 chỉ nói yêu sách này có bao nhiêu sức nặng lúc
 * ván bắt đầu.
 */
const STRENGTH_BY_RELATION: Readonly<Record<string, string>> = {
  ban_than: 'manh',
  cha: 'vua',
  me: 'vua',
  ong: 'yeu',
  ba: 'yeu',
  anh: 'tranh-cai',
  chi: 'tranh-cai',
};

export function claimStrengthFor(relation: string): string {
  return STRENGTH_BY_RELATION[relation] ?? 'yeu';
}

function targetName(kind: ClaimKind, target: string): string {
  if (kind === 'realm') return regionOf(target) === null ? target : regionName(target);
  if (kind === 'holding') return regionName(target);
  return target;
}

/**
 * Mọi yêu sách một gia tộc mang lại, kể cả vùng nó đang cai trị.
 *
 * Vùng đang cai trị CŨNG là một yêu sách khi nhìn từ phía người chơi: mẹ ngài
 * là con gái vua Đức thì ngai đó có ngài trong hàng, dù nhà mẹ đang ngồi vững.
 */
export function claimsFromHouse(houseId: string, through: string, throughLabel: string, relation: string): DerivedClaim[] {
  const house = houseOf(houseId);
  if (house === null) return [];

  const strength = claimStrengthFor(relation);
  const targets = [...(house.realm === '' ? [] : [house.realm]), ...house.claims];

  return targets.map((target, index) => ({
    id: `claim_${houseId.slice('house_'.length)}-${index + 1}`,
    kind: 'realm' as ClaimKind,
    target,
    targetName: targetName('realm', target),
    strength: target === house.realm ? strength : weaken(strength),
    through,
    throughLabel,
    note:
      target === house.realm
        ? `${throughLabel} thuộc ${house.name}, dòng đang cai trị ${targetName('realm', target)}.`
        : `${house.name} đang đòi ${targetName('realm', target)}; ngài đứng trong hàng qua ${throughLabel}.`,
  }));
}

/** Yêu sách của một yêu sách yếu đi một bậc — đòi hộ nhà mẹ thì xa hơn đòi cho mình. */
function weaken(strength: string): string {
  const ladder = ['manh', 'vua', 'yeu', 'tranh-cai'];
  const at = ladder.indexOf(strength);
  return at === -1 || at === ladder.length - 1 ? 'tranh-cai' : (ladder[at + 1] ?? 'tranh-cai');
}

/** Nhãn đọc được của một yêu sách, cho phiếu nhân vật và cho prompt. */
export function claimLabel(claim: { targetName: string; strength: string; kind: string }): string {
  const what = claim.kind === 'realm' ? 'ngai' : claim.kind === 'fief' ? 'thái ấp' : 'thành trì';
  return `Yêu sách ${what} ${claim.targetName} (${claimStrengthName(claim.strength).toLowerCase()})`;
}

/** Bậc tước của gia tộc, đọc được. */
export function houseRankName(houseId: string): string {
  const rank = houseOf(houseId)?.rank ?? '';
  return rank === '' ? '' : fiefTitleOf(rank)?.name ?? rank;
}
