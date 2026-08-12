/**
 * SINH NGẪU NHIÊN BẰNG SEEDED RNG (Phần 6 mục 4 và mục 6).
 *
 * Mọi hàm ở đây nhận một `Rng` và KHÔNG bao giờ gọi `Math.random()` (R3). Chúng
 * nên chạy trên dòng `generation` chứ không phải dòng `main`: sinh lại gia tộc
 * ở bước 6 mà làm xê dịch dòng xúc sắc của người chơi thì hai ván cùng seed sẽ
 * lệch nhau chỉ vì một người bấm "sinh lại" thêm một lần.
 *
 * Người nhà là NPC THẬT (mục 6): có id, chỉ số rút gọn, tuổi, tình trạng, thái
 * độ và mục tiêu riêng — không phải chữ trang trí trong một đoạn tiểu sử.
 */

import { z } from 'zod';
import namesFile from '@data/names.json';
import type { Rng } from '@/core/rng';
import { appearanceCommon, raceOf, startAgeRange, statCapOf, statModsOf } from './races';
import type { Appearance, FamilyMember, Secret } from './slice';
import { STAT_IDS, clampStat, type StatBlock } from './stats';

// ---------------------------------------------------------------------------
// Tên
// ---------------------------------------------------------------------------

const namePoolSchema = z.object({
  male: z.array(z.string()).min(1),
  female: z.array(z.string()).min(1),
  family: z.array(z.string()).min(1),
});

const namesSchema = z.object({ pools: z.record(z.string(), namePoolSchema) });

const NAME_POOLS = namesSchema.parse(namesFile).pools;
const DEFAULT_POOL_KEY = 'mac-dinh';

/**
 * Kho tên của một tộc: id tộc → id nhóm → mặc định.
 *
 * Ba tầng chứ không một: bốn nhánh nhân tộc nghe phải khác hẳn nhau, còn một
 * tộc mới thêm vào mà chưa có kho riêng thì vẫn phải chạy được — chỉ là tên
 * nghe chung chung, chứ không phải nổ giữa lúc tạo nhân vật.
 */
function poolFor(raceId: string): z.infer<typeof namePoolSchema> {
  const race = raceOf(raceId);
  const fallback = NAME_POOLS[DEFAULT_POOL_KEY];
  if (fallback === undefined) throw new Error(`data/names.json thiếu kho "${DEFAULT_POOL_KEY}"`);
  return NAME_POOLS[raceId] ?? (race === null ? fallback : NAME_POOLS[race.group] ?? fallback);
}

export type Sex = 'nam' | 'nu';

export function randomGivenName(rng: Rng, raceId: string, sex: Sex): string {
  const pool = poolFor(raceId);
  return rng.pick(sex === 'nam' ? pool.male : pool.female);
}

export function randomFamilyName(rng: Rng, raceId: string): string {
  return rng.pick(poolFor(raceId).family);
}

export function randomFullName(rng: Rng, raceId: string, sex: Sex, familyName?: string): string {
  const given = randomGivenName(rng, raceId, sex);
  const family = familyName ?? randomFamilyName(rng, raceId);
  return `${given} ${family}`;
}

/**
 * Tên riêng chưa ai trong nhà dùng.
 *
 * Kho tên hữu hạn nên rút ngẫu nhiên sáu người là gần như chắc chắn trùng, và
 * một gia tộc có mẹ lẫn bà đều tên Constance đọc như một cái bug chứ không như
 * phong tục đặt tên theo bà. Thử lại vài lần rồi chịu — thà trùng còn hơn treo.
 */
function uniqueGivenName(rng: Rng, raceId: string, sex: Sex, used: Set<string>): string {
  for (let attempt = 0; attempt < 12; attempt++) {
    const name = randomGivenName(rng, raceId, sex);
    if (!used.has(name)) {
      used.add(name);
      return name;
    }
  }
  return randomGivenName(rng, raceId, sex);
}

/** Nhãn tiếng Việt của quan hệ họ hàng. Id giữ dạng slug vì nó vào id NPC. */
export const FAMILY_RELATION_LABELS: Readonly<Record<string, string>> = {
  cha: 'cha',
  me: 'mẹ',
  anh: 'anh',
  chi: 'chị',
  em: 'em',
  ong: 'ông',
  ba: 'bà',
  vo: 'vợ',
  chong: 'chồng',
  con: 'con',
  'ho-hang': 'họ hàng',
};

export function familyRelationLabel(relation: string): string {
  return FAMILY_RELATION_LABELS[relation] ?? relation;
}

// ---------------------------------------------------------------------------
// Ngoại hình (mục 4)
// ---------------------------------------------------------------------------

function inRange(rng: Rng, range: readonly [number, number], decimals = 0): number {
  const [low, high] = range;
  const factor = 10 ** decimals;
  return Math.round((low + rng.next() * (high - low)) * factor) / factor;
}

/**
 * Ngoại hình đủ chi tiết cho Phần 7 dựng hình người, Phần 16 tính vừa người, và
 * AI mô tả nhất quán. Đây là hàm sau nút "ngẫu nhiên theo chủng tộc" của mục 4.
 */
export function randomAppearance(rng: Rng, raceId: string, sex: Sex): Appearance {
  const race = raceOf(raceId);
  const common = appearanceCommon();
  const shape = race?.appearance;

  const heightRange = shape?.heightCm ?? [160, 185];
  const weightRange = shape?.weightKg ?? [55, 90];
  const heightShift = sex === 'nu' ? common.heightFemaleShiftCm : 0;
  const weightShift = sex === 'nu' ? common.weightFemaleShiftPct : 0;

  const muscle = inRange(rng, shape?.musclePct ?? [30, 50]);
  const fatRange = shape?.fatPct ?? [10, 25];
  // Cơ + mỡ không được vượt 100% — ràng buộc chéo của slice sẽ chặn, nên kẹp ở
  // đây chứ không đẩy một nhân vật hỏng ra tới bước xác nhận.
  const fat = Math.min(inRange(rng, fatRange), Math.max(1, 95 - muscle));

  const features = shape?.features ?? [];
  const beard = sex === 'nam' ? rng.pick(common.beards) : 'nhẵn nhụi';

  return {
    heightCm: Math.round(inRange(rng, heightRange) + heightShift),
    weightKg: Math.round(inRange(rng, weightRange) * (1 + weightShift)),
    build: rng.pick(shape?.builds ?? ['cân đối']),
    musclePct: muscle,
    fatPct: fat,
    skin: rng.pick(shape?.skin ?? ['trắng ngà']),
    hair: rng.pick(shape?.hair ?? ['nâu']),
    hairStyle: rng.pick(common.hairStyles),
    beard,
    eyes: rng.pick(shape?.eyes ?? ['nâu']),
    eyeShape: rng.pick(common.eyeShapes),
    face: rng.pick(common.faceFeatures),
    features: features.length === 0 ? [] : rng.shuffle(features).slice(0, Math.min(3, features.length)),
    mark: rng.pick(common.marks),
    voice: rng.pick(common.voices),
    gait: rng.pick(common.gaits),
    mannerism: rng.pick(common.mannerisms),
    clothing: '',
    scars: [],
  };
}

/** Một vết sẹo có sẵn, dùng cho nút "thêm sẹo" ở bước 4. */
export function randomScar(rng: Rng): { site: string; cause: string; note: string } {
  const common = appearanceCommon();
  return { site: rng.pick(common.scarSites), cause: rng.pick(common.scarCauses), note: '' };
}

// ---------------------------------------------------------------------------
// Gia tộc (mục 6)
// ---------------------------------------------------------------------------

const GOALS: readonly string[] = [
  'muốn nhà mình được nhắc tới trong một bản ghi chép nào đó',
  'muốn trả xong món nợ mà cả nhà giả vờ không biết',
  'muốn con mình không phải làm cái nghề mình đang làm',
  'muốn lấy lại thứ đã mất trước khi mình ra đời',
  'muốn được đi khỏi đây một lần và không quay lại',
  'muốn người anh em kia thất bại, nhưng không muốn nói ra',
  'muốn giữ cho mọi thứ y nguyên như hiện tại',
  'muốn được ai đó ngoài nhà mình coi trọng',
  'muốn biết chuyện gì thật sự đã xảy ra năm đó',
  'muốn cưới được vào một nhà cao hơn',
];

const STATUSES: readonly string[] = ['khỏe', 'khỏe', 'khỏe', 'ốm yếu', 'tật cũ chưa lành', 'ăn nên làm ra', 'đang mắc nợ'];

const DEAD_STATUSES: readonly string[] = ['đã mất vì bệnh', 'đã mất trong một trận đánh', 'đã mất khi sinh nở', 'mất tích, coi như đã mất'];

const ROLES: readonly string[] = [
  'làm ruộng',
  'giữ nhà',
  'học nghề',
  'buôn bán vặt',
  'đi lính',
  'phụ việc nhà thờ',
  'chăn gia súc',
  'thợ trong phường hội',
  'không làm gì rõ ràng',
  'coi sóc sổ sách trong nhà',
];

export interface FamilyOptions {
  raceId: string;
  /** Tuổi nhân vật người chơi. */
  age: number;
  /** Họ của gia tộc, để người nhà mang cùng họ. */
  familyName: string;
  /** Xác suất người thân còn sống bị hạ xuống khi gia tộc suy/lưu vong/tuyệt tự. */
  survivalBias: number;
  /** Giai tầng càng cao thì họ hàng càng nhiều người có tên. */
  breadth: number;
}

/**
 * Mười hai chỉ số cho một NPC người nhà.
 *
 * Rút quanh mức người thường (mục 1: 8–10) rồi CỘNG mod chủng tộc và kẹp vào
 * trần của tộc, đúng như nhân vật người chơi. Bỏ hai bước sau là người nhà của
 * một Ogre sẽ có INT 14 trong khi trần của tộc là 12, và ràng buộc chéo của
 * slice sẽ chặn ngay lúc chốt — nhưng chặn với một câu khó hiểu.
 */
function npcStats(rng: Rng, raceId: string): StatBlock {
  const mods = statModsOf(raceId);
  const block = {} as StatBlock;
  for (const id of STAT_IDS) {
    block[id] = clampStat(rng.int(7, 12) + mods[id], statCapOf(raceId, id));
  }
  return block;
}

function member(
  rng: Rng,
  options: FamilyOptions,
  relation: string,
  index: number,
  sex: Sex,
  age: number,
  aliveChance: number,
  usedNames: Set<string>,
): FamilyMember {
  const alive = rng.next() < aliveChance * options.survivalBias;
  return {
    id: `npc_${relation}${index === 0 ? '' : `-${index}`}`,
    name: `${uniqueGivenName(rng, options.raceId, sex, usedNames)} ${options.familyName}`,
    relation,
    race: options.raceId,
    // Gia tộc do `create.ts` gán sau khi sinh: nó biết nhà của người chơi, còn
    // hàm này thì không — và không nên biết, vì nó chỉ dựng người.
    houseId: '',
    loreEntry: '',
    sex,
    age: Math.max(0, Math.round(age)),
    alive,
    status: alive ? rng.pick(STATUSES) : rng.pick(DEAD_STATUSES),
    stats: npcStats(rng, options.raceId),
    role: rng.pick(ROLES),
    // Người nhà mặc định nghiêng về thiện cảm, nhưng không phải ai cũng vậy —
    // một gia tộc mà mọi người đều thương nhau thì không sinh ra được câu chuyện nào.
    attitude: rng.int(-30, 70),
    goal: rng.pick(GOALS),
    note: '',
  };
}

/**
 * Sinh cây gia tộc. Sửa tay được ở bước 6 — hàm này chỉ dựng bản nháp đầu tiên.
 *
 * Tuổi của người nhà co giãn theo tuổi thọ của tộc: cha của một Cao Tiên 120
 * tuổi phải hơn con vài trăm năm, không phải hơn hai mươi.
 */
export function generateFamily(rng: Rng, options: FamilyOptions): FamilyMember[] {
  const race = raceOf(options.raceId);
  const lifespan = race?.lifespan ?? 70;
  const scale = Math.max(1, lifespan / 70);
  const out: FamilyMember[] = [];
  const usedNames = new Set<string>();

  const parentGap = rng.int(20, 38) * scale;
  out.push(member(rng, options, 'cha', 0, 'nam', options.age + parentGap, 0.75, usedNames));
  out.push(member(rng, options, 'me', 0, 'nu', options.age + parentGap - rng.int(0, 6) * scale, 0.8, usedNames));

  const siblings = rng.int(0, 2 + Math.round(options.breadth));
  for (let index = 0; index < siblings; index++) {
    const sex: Sex = rng.next() < 0.5 ? 'nam' : 'nu';
    const gap = rng.int(-8, 8) * scale;
    // `gap` DƯƠNG nghĩa là nhiều tuổi hơn, tức là anh hoặc chị. Nhầm dấu ở đây
    // sinh ra "chị mười tuổi" của một nhân vật mười tám, và không bài test số
    // nào bắt được vì mọi trường đều hợp lệ.
    const relation = gap > 0 ? (sex === 'nam' ? 'anh' : 'chi') : 'em';
    const same = out.filter((entry) => entry.relation === relation).length;
    out.push(member(rng, options, relation, same, sex, Math.max(1, options.age + gap), 0.85, usedNames));
  }

  // Ông bà: với tộc sống ngắn thì hầu như đã mất, và đó là chuyện bình thường
  // của thế kỷ 14 chứ không phải một bi kịch riêng.
  const grandparents = rng.int(0, 4);
  for (let index = 0; index < grandparents; index++) {
    const sex: Sex = index % 2 === 0 ? 'nam' : 'nu';
    const relation = sex === 'nam' ? 'ong' : 'ba';
    const same = out.filter((entry) => entry.relation === relation).length;
    out.push(member(rng, options, relation, same, sex, options.age + parentGap * 2, 0.25, usedNames));
  }

  const [startLow] = startAgeRange(options.raceId);
  const married = options.age > startLow + 4 * scale && rng.next() < 0.35;
  if (married) {
    const sex: Sex = rng.next() < 0.5 ? 'nam' : 'nu';
    out.push(
      member(rng, options, sex === 'nam' ? 'chong' : 'vo', 0, sex, options.age + rng.int(-5, 5) * scale, 0.9, usedNames),
    );
    const children = rng.int(0, 2);
    for (let index = 0; index < children; index++) {
      out.push(
        member(rng, options, 'con', index, rng.next() < 0.5 ? 'nam' : 'nu', rng.int(0, 6) * scale, 0.7, usedNames),
      );
    }
  }

  const cousins = Math.max(0, Math.round(options.breadth) - 1);
  for (let index = 0; index < cousins; index++) {
    out.push(
      member(
        rng,
        options,
        'ho-hang',
        index,
        rng.next() < 0.5 ? 'nam' : 'nu',
        options.age + rng.int(-15, 25) * scale,
        0.8,
        usedNames,
      ),
    );
  }

  return out;
}

// ---------------------------------------------------------------------------
// Quan hệ ngoài gia đình và bí mật (mục 6, mục 7)
// ---------------------------------------------------------------------------

const OUTSIDE_KINDS: readonly { kind: string; notes: readonly string[] }[] = [
  { kind: 'thay-day', notes: ['dạy ngài nghề mà ngài đang sống bằng nó', 'khắt khe, nhưng chưa bao giờ nói dối ngài'] },
  { kind: 'ban-than', notes: ['biết chuyện mà nhà ngài không biết', 'từng che cho ngài một lần, và chưa đòi lại'] },
  { kind: 'ke-thu', notes: ['chưa ra mặt, nhưng nhớ rất kỹ', 'mất một thứ vì ngài, và không quên'] },
  { kind: 'an-nhan', notes: ['đã trả tiền cho ngài một lần, không nói ra vì sao', 'cho ngài chỗ trú khi không ai cho'] },
  { kind: 'chu-no', notes: ['giữ giấy nợ có chữ ký của nhà ngài', 'lịch sự cho tới hạn cuối'] },
];

export interface OutsideRelation {
  id: string;
  name: string;
  kind: string;
  trust: number;
  note: string;
}

export function generateOutsideRelations(rng: Rng, raceId: string, count: number): OutsideRelation[] {
  const out: OutsideRelation[] = [];
  for (let index = 0; index < Math.max(0, count); index++) {
    const template = OUTSIDE_KINDS[index % OUTSIDE_KINDS.length];
    if (template === undefined) break;
    const sex: Sex = rng.next() < 0.5 ? 'nam' : 'nu';
    out.push({
      id: `npc_quan-he-${index + 1}`,
      name: randomFullName(rng, raceId, sex),
      kind: template.kind,
      trust: template.kind === 'ke-thu' || template.kind === 'chu-no' ? rng.int(-70, -10) : rng.int(20, 80),
      note: rng.pick(template.notes),
    });
  }
  return out;
}

const SECRETS: readonly string[] = [
  'Ngài không phải con ruột của người mà ngài gọi là cha.',
  'Ngài từng lấy trộm một thứ mà tới giờ vẫn chưa ai phát hiện ra người lấy.',
  'Ngài có mặt ở đó cái đêm người ta vẫn còn nhắc, và ngài đã không làm gì.',
  'Ngài mang một dấu trên người mà Giáo hội sẽ hỏi rất kỹ nếu trông thấy.',
  'Ngài nợ một khoản mà giấy nợ đang nằm trong tay người ngài chưa từng gặp.',
  'Ngài biết đọc một thứ chữ mà người cùng giai tầng với ngài lẽ ra không biết.',
  'Có một người vẫn sống, mà cả nhà ngài đã khai là đã chết.',
  'Ngài đã hứa một lời thề với một bên mà ngài đang phụng sự bên kia.',
];

/** 1–3 điều nhân vật giấu (mục 7). Cắm vào slice tri thức của Phần 4 lúc chốt. */
export function generateSecrets(rng: Rng, count = 0): Secret[] {
  const wanted = count > 0 ? count : rng.int(1, 3);
  return rng
    .shuffle(SECRETS)
    .slice(0, Math.min(wanted, SECRETS.length))
    .map((text, index) => ({ id: `secret_${index + 1}`, text, revealed: false }));
}
