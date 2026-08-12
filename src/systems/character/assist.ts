/**
 * NHỜ AI ĐIỀN GIÚP MỘT BƯỚC TẠO NHÂN VẬT (Phần 6 mục 9).
 *
 * Chín bước là chín tờ giấy trắng, và phần lớn người chơi không muốn tự nghĩ ra
 * mười lăm ô ngoại hình lẫn mục tiêu riêng của bảy người nhà. Module này là chỗ
 * họ mô tả bằng MỘT CÂU rồi để AI dựng phần còn lại — cho một bước, hoặc cho cả
 * chín bước một lượt.
 *
 * BA RÀNG BUỘC, và cả ba đều là ràng buộc của dự án chứ không phải của module:
 *
 *   R1 — AI ĐỀ NGHỊ, ENGINE PHÁN QUYẾT. Không con số nào của AI đi thẳng vào bản
 *        nháp. Chỉ số đi qua đúng point-buy của bước 3, kỹ năng đi qua đúng ngân
 *        sách của bước 5, tuổi đi qua `withAge`. Cái gì vượt thì bị kẹp và được
 *        ghi ra `notes` — giống hệt lối `handleAiText` của Phần 7 xử đề nghị gây
 *        thương tích.
 *   R4 — HỎNG THÌ KHÔNG ÁP GÌ. `parseAssist` không bao giờ ném: JSON hỏng, thiếu
 *        khối, hay sai kiểu đều trả `null` kèm lý do, và bản nháp giữ nguyên.
 *   R5 — KHÔNG HARDCODE NỘI DUNG. Mọi danh mục đọc từ `/data/*.json` qua đúng
 *        những hàm mà UI đang dùng, nên thêm một chủng tộc mới là AI thấy ngay.
 *
 * THUẦN và KHÔNG GỌI MẠNG: dựng prompt, đọc chữ trả về, áp vào bản nháp. Lời gọi
 * proxy nằm ở `/src/ui/character/Assist.tsx` — nhờ vậy toàn bộ luật ở đây test
 * được mà không cần một cái provider giả.
 *
 * QUYỀN CỦA AI ĐÚNG BẰNG QUYỀN CỦA CÁI TAY: mỗi khóa JSON dưới đây tương ứng với
 * một control có thật trên màn hình bước đó. Chỗ duy nhất lệch là 12 chỉ số của
 * người nhà — chúng do engine rút trong trần chủng tộc, và bắt AI viết lại 12 con
 * số cho bảy người là vừa tốn token vừa mở đường cho một gia tộc toàn thiên tài.
 */

import { z } from 'zod';
import type { Rng } from '@/core/rng';
import { allRegions, regionName } from '@/lore/regions';
import { cultureOf, culturesForRace, religionOf, religionsForRace } from './beliefs';
import { allGear, carry, gearName, gearMaterials, gearOf, gearQualities, type CarriedGear } from './gear';
import { houseName, houseOf, housesForOriginAndRace, lorePeople, lorePersonName } from './houses';
import { knownSettlements, settlementsWithin } from './possessions';
import {
  allBirthOrders,
  allLineageStates,
  allOrigins,
  originName,
  originOf,
  pointBuy,
  relationKinds,
  startingLine,
} from './origins';
import { creationAgeRange, nationIds, nationName, playableRaces, raceName, raceOf, startAgeRange } from './races';
import { allSkills, groupName, skillName, skillOf } from './skills';
import { familyRelationLabel, randomAppearance } from './generate';
import type { Appearance, FamilyMember, Secret } from './slice';
import { STATS, STAT_IDS, type StatBlock, type StatId } from './stats';
import {
  CREATION_STEPS,
  canLowerStat,
  canRaiseSkill,
  canRaiseStat,
  creationCap,
  finalStats,
  lowerStat,
  raiseSkill,
  raiseStat,
  recomputeClaims,
  rollFamily,
  setFamilyHouse,
  skillPointBudget,
  skillPointsLeft,
  statPointsLeft,
  withAge,
  withHouse,
  withOrigin,
  withRace,
  type CharacterDraft,
  type CreationStepId,
} from './create';

// ---------------------------------------------------------------------------
// Đích của một lần nhờ
// ---------------------------------------------------------------------------

/** Một bước, hoặc cả chín bước một lượt. */
export type AssistTarget = CreationStepId | 'tat-ca';

export function assistTargetLabel(target: AssistTarget): string {
  if (target === 'tat-ca') return 'cả nhân vật';
  return CREATION_STEPS.find((step) => step.id === target)?.name ?? target;
}

/**
 * Khóa JSON mà AI được điền cho từng bước.
 *
 * Bảng này là hợp đồng: prompt chỉ liệt kê những khóa của bước đang hỏi, và
 * `applyAssist` cũng chỉ đọc chừng ấy khóa. Nhờ vậy bấm "điền bước Ngoại hình"
 * không bao giờ lặng lẽ đổi mất chủng tộc mà người chơi đã chọn tay ở bước 1.
 */
const STEP_KEYS = {
  'chung-toc': ['raceId', 'sex'],
  'xuat-than': ['originId', 'houseId', 'birthRegionId', 'startRegionId', 'birthOrderId', 'lineageStateId', 'age'],
  'chi-so': ['stats'],
  'ngoai-hinh': ['appearance', 'clothing'],
  'ky-nang': ['skills'],
  'gia-dinh': ['family', 'outsideRelations'],
  'the-luc': ['allegiance', 'cultureId', 'culturalFit', 'secrets'],
  'trang-bi': ['gear', 'property', 'holdings', 'fiefs'],
  'xac-nhan': ['givenName', 'familyName', 'personalityNote', 'opening'],
} as const satisfies Record<CreationStepId, readonly string[]>;

type SuggestionKey = (typeof STEP_KEYS)[CreationStepId][number];

function keysFor(target: AssistTarget): SuggestionKey[] {
  if (target !== 'tat-ca') return [...STEP_KEYS[target]];
  return CREATION_STEPS.flatMap((step) => [...STEP_KEYS[step.id]]);
}

// ---------------------------------------------------------------------------
// Hình dạng AI phải trả về
// ---------------------------------------------------------------------------

/**
 * Số có thể tới dưới dạng chuỗi.
 *
 * Model trả `"age": "24"` là chuyện thường ngày, và từ chối cả lô chỉ vì một cặp
 * nháy là hành xử của một trình biên dịch chứ không phải của một trợ thủ. Nhưng
 * `null` thì KHÔNG nhận: `z.coerce.number()` biến nó thành 0, và một tuổi 0 lọt
 * qua sẽ bị kẹp thành tuổi tối thiểu mà không ai biết là AI đã bỏ trống ô đó.
 */
const numeric = z
  .union([z.number(), z.string().regex(/^\s*-?\d+(?:[.,]\d+)?\s*$/u)])
  .transform((value) => (typeof value === 'number' ? value : Number(value.trim().replace(',', '.'))));

const textOrEntry = z.union([z.string(), z.object({ text: z.string() })]);

const appearanceInput = z
  .object({
    heightCm: numeric,
    weightKg: numeric,
    build: z.string(),
    musclePct: numeric,
    fatPct: numeric,
    skin: z.string(),
    hair: z.string(),
    hairStyle: z.string(),
    beard: z.string(),
    eyes: z.string(),
    eyeShape: z.string(),
    face: z.string(),
    features: z.array(z.string()),
    mark: z.string(),
    voice: z.string(),
    gait: z.string(),
    mannerism: z.string(),
    scars: z.array(z.object({ site: z.string(), cause: z.string(), note: z.string().optional() })),
  })
  .partial();

const familyInput = z
  .object({
    id: z.string(),
    relation: z.string(),
    name: z.string(),
    role: z.string(),
    goal: z.string(),
    note: z.string(),
    status: z.string(),
    attitude: numeric,
    age: numeric,
    alive: z.boolean(),
    houseId: z.string(),
    loreEntry: z.string(),
  })
  .partial();

const relationInput = z
  .object({ id: z.string(), name: z.string(), kind: z.string(), trust: numeric, note: z.string() })
  .partial();

const gearInput = z.union([
  z.string(),
  z
    .object({ item: z.string(), material: z.string(), quality: z.string(), equipped: z.boolean(), note: z.string() })
    .partial()
    .required({ item: true }),
]);

const possessionInput = z.object({ name: z.string(), note: z.string(), liege: z.string() }).partial();

export const assistSuggestionSchema = z
  .object({
    raceId: z.string(),
    sex: z.enum(['nam', 'nu']),
    originId: z.string(),
    houseId: z.string(),
    birthRegionId: z.string(),
    startRegionId: z.string(),
    birthOrderId: z.string(),
    lineageStateId: z.string(),
    age: numeric,
    stats: z.record(z.string(), numeric),
    appearance: appearanceInput,
    clothing: z.string(),
    skills: z.union([z.record(z.string(), numeric), z.array(z.object({ id: z.string(), points: numeric }))]),
    family: z.array(familyInput),
    outsideRelations: z.array(relationInput),
    allegiance: z
      .object({
        nationId: z.string(),
        liege: z.string(),
        standing: z.string(),
        religionId: z.string(),
        piety: numeric,
        guilds: z.array(z.string()),
      })
      .partial(),
    cultureId: z.string(),
    culturalFit: numeric,
    secrets: z.array(textOrEntry),
    gear: z.array(gearInput),
    property: z.array(z.string()),
    holdings: z.array(possessionInput),
    fiefs: z.array(possessionInput),
    givenName: z.string(),
    familyName: z.string(),
    personalityNote: z.string(),
    opening: z.object({ holdingId: z.string(), withNpc: z.string(), situation: z.string() }).partial(),
    /** Một câu AI tự giải thích lựa chọn. Không vào bản nháp, chỉ hiện ở bảng duyệt. */
    note: z.string(),
  })
  .partial();

export type AssistSuggestion = z.infer<typeof assistSuggestionSchema>;

// ---------------------------------------------------------------------------
// Dựng prompt
// ---------------------------------------------------------------------------

/** Trần số dòng của một danh mục trong prompt. */
const CATALOG_LIMIT = 60;

function catalogLines(title: string, rows: readonly string[]): string {
  if (rows.length === 0) return `${title}: (trống)`;
  const shown = rows.slice(0, CATALOG_LIMIT);
  const tail = rows.length > shown.length ? `\n  … và ${rows.length - shown.length} mục nữa (đừng bịa id ngoài danh sách)` : '';
  return `${title}:\n${shown.map((row) => `  ${row}`).join('\n')}${tail}`;
}

/**
 * Danh mục id hợp lệ cho những khóa đang hỏi.
 *
 * Chỉ nạp đúng phần cần: hỏi riêng bước Ngoại hình mà vẫn dán 130 gia tộc và 76
 * kỹ năng vào prompt là trả tiền token cho thứ AI không được phép đụng tới.
 */
function catalogsFor(draft: CharacterDraft, keys: readonly SuggestionKey[]): string[] {
  const want = new Set<string>(keys);
  const out: string[] = [];

  if (want.has('raceId')) {
    out.push(
      catalogLines(
        'CHỦNG TỘC',
        playableRaces().map((race) => `${race.id} | ${race.name} | ${race.standing}`),
      ),
    );
  }
  if (want.has('originId')) {
    out.push(
      catalogLines(
        'GIAI TẦNG',
        allOrigins().map((origin) => `${origin.id} | ${origin.name} | chỉ số +${origin.statPoints}, kỹ năng +${origin.skillPoints}`),
      ),
    );
    out.push(`THỨ TỰ TRONG NHÀ: ${allBirthOrders().map((order) => `${order.id} (${order.name})`).join(', ')}`);
    out.push(`TÌNH TRẠNG GIA TỘC: ${allLineageStates().map((state) => `${state.id} (${state.name})`).join(', ')}`);
  }
  if (want.has('houseId')) {
    const houses = housesForOriginAndRace(draft.originId, draft.raceId);
    out.push(
      catalogLines(
        'GIA TỘC CHỌN ĐƯỢC (để trống nếu nhân vật không có tên tuổi)',
        houses.map((house) => `${house.id} | ${house.name} | ${house.note}`),
      ),
    );
  }
  if (want.has('birthRegionId')) {
    const homelands = raceOf(draft.raceId)?.homelands ?? [];
    out.push(
      catalogLines(
        'VÙNG SINH (vùng bản địa của chủng tộc đang chọn)',
        (homelands.length > 0 ? homelands : allRegions().map((region) => region.id)).map(
          (id) => `${id} | ${regionName(id)}`,
        ),
      ),
    );
  }
  if (want.has('startRegionId')) {
    out.push(
      catalogLines(
        'NƠI KHỞI ĐẦU (lệch với nơi sinh là chuyện thường: lưu vong, hành hương, đi lính)',
        allRegions()
          .filter((region) => region.kind !== 'settlement')
          .map((region) => `${region.id} | ${region.name}`),
      ),
    );
  }
  if (want.has('stats')) {
    out.push(
      catalogLines(
        'CHỈ SỐ (thang 1–20, người thường 8–10, xuất chúng 16+)',
        STAT_IDS.map((id) => `${id} | ${STATS[id].name} | ${STATS[id].covers}`),
      ),
    );
  }
  if (want.has('skills')) {
    out.push(
      catalogLines(
        'KỸ NĂNG',
        allSkills().map((skill) => `${skill.id} | ${skill.name} | ${groupName(skill.group)} | ${skill.stat}`),
      ),
    );
  }
  if (want.has('cultureId')) {
    out.push(
      catalogLines(
        'VĂN HÓA NUÔI DẠY (có thể khác chủng tộc — đó thường là chỗ hay nhất)',
        culturesForRace(draft.raceId, draft.birthRegionId).map((culture) => `${culture.id} | ${culture.name}`),
      ),
    );
  }
  if (want.has('allegiance')) {
    out.push(catalogLines('THẾ LỰC', nationIds().map((id) => `${id} | ${nationName(id)}`)));
    out.push(
      catalogLines(
        'TÔN GIÁO',
        religionsForRace(raceOf(draft.raceId)?.church ?? '').map((religion) => `${religion.id} | ${religion.name} | ${religion.stance}`),
      ),
    );
    out.push(`VAI TRÒ TRONG THẾ LỰC: ${NATION_STANDING_IDS.join(', ')}`);
  }
  if (want.has('outsideRelations')) {
    out.push(`LOẠI QUAN HỆ NGOÀI GIA ĐÌNH: ${relationKinds().map((kind) => `${kind.id} (${kind.name})`).join(', ')}`);
  }
  if (want.has('family')) {
    out.push(`QUAN HỆ HỌ HÀNG: ${Object.entries(FAMILY_RELATIONS).map(([id, label]) => `${id} (${label})`).join(', ')}`);
  }
  if (want.has('gear')) {
    out.push(
      catalogLines(
        'TRANG BỊ',
        allGear().map((item) => `${item.id} | ${item.name} | ${item.kind} | ${item.price}đ | ${item.weightKg}kg`),
      ),
    );
    out.push(`CHẤT LIỆU: ${gearMaterials().map((material) => material.id).join(', ')}`);
    out.push(`TAY NGHỀ: ${gearQualities().map((quality) => quality.id).join(', ')}`);
  }
  if (want.has('opening')) {
    const nearby = settlementsWithin(draft.startRegionId === '' ? draft.birthRegionId : draft.startRegionId);
    out.push(
      catalogLines(
        'NƠI MỞ MÀN (thành trì có thật; để trống thì AI tự chọn lúc viết cảnh)',
        (nearby.length > 0 ? nearby : knownSettlements()).map((entry) => `${entry.id} | ${entry.name}`),
      ),
    );
    out.push(
      catalogLines(
        'NGƯỜI CÓ MẶT LÚC MỞ MÀN (nhân vật có thật trong lorebook)',
        lorePeople().map((person) => `${person.id} | ${person.title}`),
      ),
    );
  }

  return out;
}

/** Vai trò trong một thế lực — cùng bảng với `NATION_STANDINGS` của bước 7. */
const NATION_STANDING_IDS: readonly string[] = [
  'than-dan',
  'chu-hau',
  'quan-lai',
  'tang-lu',
  'linh-danh-thue',
  'khach-tru',
  'luu-vong',
  'ngoai-vong',
];

const FAMILY_RELATIONS: Readonly<Record<string, string>> = {
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

/** Khóa JSON → mô tả ngắn cho AI. Chính là hợp đồng của mục "quyền của AI". */
const KEY_HELP: Readonly<Record<SuggestionKey, string>> = {
  raceId: '"raceId": id chủng tộc trong danh mục',
  sex: '"sex": "nam" hoặc "nu"',
  originId: '"originId": id giai tầng',
  houseId: '"houseId": id gia tộc, hoặc "" nếu không thuộc nhà nào',
  birthRegionId: '"birthRegionId": id vùng sinh',
  startRegionId: '"startRegionId": id nơi đang đứng lúc ván bắt đầu',
  birthOrderId: '"birthOrderId": id thứ tự trong nhà',
  lineageStateId: '"lineageStateId": id tình trạng gia tộc',
  age: '"age": tuổi, số nguyên',
  stats: '"stats": { "str": 12, "agi": 10, … } — ĐỦ 12 chỉ số, mỗi cái là giá trị CUỐI trước mod chủng tộc',
  appearance:
    '"appearance": { "heightCm", "weightKg", "build", "musclePct", "fatPct", "skin", "hair", "hairStyle", "beard", "eyes", "eyeShape", "face", "features": [], "mark", "voice", "gait", "mannerism", "scars": [{"site","cause","note"}] }',
  clothing: '"clothing": quần áo và trang sức khởi đầu, một câu',
  skills: '"skills": { "skill_kiem-thuat": 3, … } — SỐ ĐIỂM rót vào kỹ năng đó, không phải phần trăm',
  family:
    '"family": [ { "id": id người nhà đang có, "name", "role", "goal", "note", "status", "attitude": -100..100, "houseId" } ] — CHỈ sửa người đã có, đừng thêm người mới',
  outsideRelations: '"outsideRelations": [ { "id", "name", "kind", "trust": -100..100, "note" } ]',
  allegiance: '"allegiance": { "nationId", "liege", "standing", "religionId", "piety": 0..100, "guilds": [] }',
  cultureId: '"cultureId": id văn hóa nuôi dạy',
  culturalFit: '"culturalFit": 0..100, mức hòa nhập với văn hóa đó',
  secrets: '"secrets": [ "điều nhân vật giấu", … ] — ĐÚNG 1 tới 3 câu',
  gear: '"gear": [ { "item": id trang bị, "material", "quality", "equipped": true/false } ]',
  property: '"property": [ "nhà đất, xưởng, kho hàng…" ]',
  holdings: '"holdings": [ { "name", "note" } ] — đặt tên cho thành trì đang giữ, theo THỨ TỰ đang có',
  fiefs: '"fiefs": [ { "name", "liege", "note" } ] — đặt tên cho thái ấp đang giữ, theo THỨ TỰ đang có',
  givenName: '"givenName": tên riêng',
  familyName: '"familyName": họ',
  personalityNote: '"personalityNote": một hai câu về tính cách, giọng nói chuyện',
  opening: '"opening": { "holdingId", "withNpc", "situation" } — cảnh mở màn',
};

/**
 * Bản nháp hiện tại, viết bằng CHỮ ĐỌC ĐƯỢC chứ không phải id.
 *
 * Cùng lý do với `openingSceneAction`: `origin_nong-no` và `con-thu` là ngôn ngữ
 * của engine. Đưa id trần cho AI là bắt nó đoán, và nó sẽ đoán sai theo kiểu rất
 * khó phát hiện. Id chỉ xuất hiện ở phần DANH MỤC, nơi nó là thứ phải chọn.
 */
function draftSummary(draft: CharacterDraft): string[] {
  const origin = originOf(draft.originId);
  const line = startingLine(draft.originId, draft.birthOrderId, draft.lineageStateId);
  const stats = STAT_IDS.map((id) => `${id} ${draft.allocated[id]}`).join(' ');
  const skills = Object.entries(draft.skills)
    .filter(([, training]) => training > 0)
    .map(([id, training]) => `${skillName(id)} ${training / pointBuy().skillTrainingPerPoint} điểm`)
    .join(', ');

  const out = [
    `Tên: ${[draft.givenName, draft.familyName].filter((part) => part !== '').join(' ') || '(chưa đặt)'}`,
    `Chủng tộc: ${raceName(draft.raceId)} · giới ${draft.sex === 'nam' ? 'nam' : 'nữ'} · ${draft.age} tuổi`,
    `Giai tầng: ${origin?.name ?? '(chưa chọn)'} — ${origin?.description ?? ''}`,
    `Gia tộc: ${draft.houseId === '' ? 'không có tên tuổi' : houseName(draft.houseId)}`,
    `Nơi sinh: ${regionName(draft.birthRegionId)} · đang ở: ${regionName(draft.startRegionId)}`,
    `Văn hóa: ${cultureOf(draft.cultureId)?.name ?? 'chưa rõ'} (hòa nhập ${draft.culturalFit}/100)`,
    `Tôn giáo: ${religionOf(draft.allegiance.religionId)?.name ?? 'không theo đạo nào'} (sùng đạo ${draft.allegiance.piety}/100)`,
    `Thế lực: ${draft.allegiance.nationId === '' ? 'không thuộc thế lực nào' : nationName(draft.allegiance.nationId)}`,
    `Chỉ số đã phân: ${stats}`,
    `Kỹ năng đã phân: ${skills === '' ? 'chưa có' : skills}`,
    `Vạch xuất phát: ${line.coins} đồng bạc · uy tín ${line.prestige} · ${line.inherits ? 'có thừa kế' : 'không thừa kế'}`,
  ];

  if (draft.appearance !== null) {
    out.push(
      `Ngoại hình hiện tại: cao ${draft.appearance.heightCm}cm, nặng ${draft.appearance.weightKg}kg, dáng ${draft.appearance.build}, tóc ${draft.appearance.hair}, mắt ${draft.appearance.eyes}`,
    );
  }
  if (draft.family.length > 0) {
    out.push(
      `Người nhà đang có (sửa thì phải giữ đúng "id"): ${draft.family
        .map((member) => `${member.id}=${familyRelationLabel(member.relation)} ${member.name} (${member.age} tuổi, ${member.alive ? member.status : 'đã mất'})`)
        .join('; ')}`,
    );
  }
  if (draft.outsideRelations.length > 0) {
    out.push(
      `Quan hệ ngoài gia đình: ${draft.outsideRelations.map((relation) => `${relation.id}=${relation.name} (${relation.kind})`).join('; ')}`,
    );
  }
  if (draft.holdings.length > 0) {
    out.push(`Thành trì đang giữ: ${draft.holdings.map((holding) => holding.name).join(', ')}`);
  }
  if (draft.fiefs.length > 0) {
    out.push(`Thái ấp đang giữ: ${draft.fiefs.map((fief) => fief.name).join(', ')}`);
  }
  if (draft.secrets.length > 0) {
    out.push(`Bí mật hiện có: ${draft.secrets.map((secret) => secret.text).join(' | ')}`);
  }
  return out;
}

/** Ngân sách mà AI PHẢI tiêu vừa đúng — nêu thẳng, vì nó là luật của bước 3 và 5. */
function budgetLines(draft: CharacterDraft, keys: readonly SuggestionKey[]): string[] {
  const config = pointBuy();
  const out: string[] = [];

  if (keys.includes('stats')) {
    const budget = originOf(draft.originId)?.statPoints ?? 0;
    out.push(
      `NGÂN SÁCH CHỈ SỐ: ${budget} điểm, tiêu từ mức nền ${config.baseStat} cho cả 12 ô.` +
        ` Giá lũy tiến: lên tới ${config.statCostLadder[0]?.upTo ?? 14} thì 1 điểm/bậc, cao hơn thì 2 rồi 3.` +
        ` Trần lúc tạo là ${config.maxAtCreation} và còn bị trần chủng tộc kẹp thêm.` +
        ` Tiêu quá thì engine hạ bớt, tiêu thiếu thì engine dồn nốt — nên hãy tiêu vừa đúng.`,
    );
  }
  if (keys.includes('skills')) {
    out.push(
      `NGÂN SÁCH KỸ NĂNG: ${skillPointBudget(draft)} điểm (giai tầng cộng tuổi tác).` +
        ` Một điểm = ${config.skillTrainingPerPoint} điểm rèn luyện, trần lúc tạo là ${
          config.skillMaxAtCreation / config.skillTrainingPerPoint
        } điểm cho một kỹ năng.` +
        ` Đừng rải đều: một nhân vật có ba bốn nghề rõ rệt đọc ra người, còn mười hai kỹ năng mỗi thứ một điểm thì không.`,
    );
  }
  if (keys.includes('age')) {
    const [low, high] = creationAgeRange(draft.raceId);
    const [suggestLow, suggestHigh] = startAgeRange(draft.raceId);
    out.push(`TUỔI: chọn được ${low}–${high}, tuổi vào đời thường thấy của tộc này là ${suggestLow}–${suggestHigh}.`);
  }
  if (keys.includes('gear')) {
    const line = startingLine(draft.originId, draft.birthOrderId, draft.lineageStateId);
    out.push(`TIỀN MANG THEO: ${line.coins} đồng bạc — đừng khoác lên người một bộ giáp đắt hơn cả gia sản.`);
  }
  return out;
}

export interface AssistPrompt {
  system: string;
  user: string;
}

/**
 * Prompt cho một lần nhờ. Thuần: cùng bản nháp + cùng đích cho cùng chữ.
 *
 * `wish` là câu người chơi gõ vào ô mô tả. Nó đứng ĐẦU phần yêu cầu chứ không
 * nằm lẫn giữa danh mục: khi model phải chọn giữa "hợp với dữ liệu" và "hợp với
 * câu người chơi vừa gõ", câu ấy phải thắng.
 */
export function assistPrompt(draft: CharacterDraft, target: AssistTarget, wish = ''): AssistPrompt {
  const keys = keysFor(target);
  const wanted = wish.trim();

  const system = [
    'Bạn là người phụ dựng nhân vật cho một game nhập vai bối cảnh châu Âu thế kỷ 14, thế giới giả tưởng có hơn ba mươi chủng tộc sống xen kẽ.',
    'Nhiệm vụ: điền giúp một phần phiếu nhân vật, theo đúng khuôn JSON được yêu cầu.',
    '',
    'LUẬT BẤT DI BẤT DỊCH:',
    '1. Chỉ trả về MỘT khối JSON. Không lời dẫn, không giải thích ngoài khối, không markdown ngoài dấu ```.',
    '2. Chỉ dùng id có trong DANH MỤC. Không bịa id mới. Không chắc thì bỏ trống khóa đó.',
    '3. Chỉ điền những khóa được liệt kê. Khóa lạ sẽ bị bỏ qua.',
    '4. Mọi con số đều là ĐỀ NGHỊ: engine sẽ kẹp lại theo ngân sách và trần. Đừng cố lách.',
    '5. Giữ giọng thế kỷ 14: không nhắc súng ống, khoa học hiện đại, hay chức danh thời nay.',
    '',
    'Viết mọi phần chữ bằng TIẾNG VIỆT, ngắn và cụ thể. Một nhân vật hay là một nhân vật có mâu thuẫn, không phải một nhân vật hoàn hảo.',
  ].join('\n');

  const user = [
    `VIỆC CẦN LÀM: điền phần "${assistTargetLabel(target)}" của phiếu nhân vật.`,
    ...(wanted === ''
      ? ['NGƯỜI CHƠI KHÔNG NÊU YÊU CẦU RIÊNG — hãy tự dựng một nhân vật có cá tính, hợp với những gì đã chọn dưới đây.']
      : ['NGƯỜI CHƠI MUỐN:', wanted]),
    '',
    'PHIẾU NHÂN VẬT HIỆN TẠI:',
    ...draftSummary(draft).map((entry) => `  ${entry}`),
    ...(budgetLines(draft, keys).length === 0 ? [] : ['', ...budgetLines(draft, keys)]),
    '',
    ...catalogsFor(draft, keys),
    '',
    'TRẢ VỀ ĐÚNG MỘT KHỐI JSON VỚI CÁC KHÓA SAU (bỏ khóa nào không chắc):',
    ...keys.map((key) => `  ${KEY_HELP[key]}`),
    '  "note": một câu ngắn nói vì sao ngài chọn như vậy',
  ].join('\n');

  return { system, user };
}

// ---------------------------------------------------------------------------
// Đọc chữ AI trả về
// ---------------------------------------------------------------------------

export interface AssistParse {
  suggestion: AssistSuggestion | null;
  /** Vì sao không đọc được, hoặc khóa nào bị bỏ qua. Hiện thẳng cho người chơi. */
  issues: string[];
}

/**
 * Cắt khối JSON ra khỏi chữ model trả về.
 *
 * Model rất hay kèm một câu dẫn hoặc bọc trong ```json dù prompt đã cấm. Thà
 * chịu khó tìm còn hơn bắt người chơi bấm lại chỉ vì một dòng "Đây là nhân vật
 * của ngài:".
 */
function extractJson(raw: string): string | null {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/iu.exec(raw);
  const body = fenced?.[1] ?? raw;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  return body.slice(start, end + 1);
}

/** Không bao giờ ném (R4): chữ hỏng thì trả `null` kèm lý do, bản nháp giữ nguyên. */
export function parseAssist(raw: string): AssistParse {
  const text = extractJson(raw);
  if (text === null) {
    // Mở ngoặc mà không có ngoặc đóng gần như luôn là một thứ: model chạm trần
    // token đầu ra giữa chừng. Nói đúng bệnh thì người chơi biết nới trần ở tab
    // Cài đặt, thay vì bấm lại năm lần và nhận đúng lỗi ấy năm lần.
    const truncated = raw.includes('{') && !raw.includes('}');
    return {
      suggestion: null,
      issues: [
        truncated
          ? 'Khối JSON bị cắt giữa chừng — nhiều khả năng chạm trần token đầu ra. Nới "Trần đầu ra" ở tab Cài đặt rồi thử lại.'
          : 'AI không trả về khối JSON nào — thử bấm lại, hoặc đổi model.',
      ],
    };
  }

  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    return { suggestion: null, issues: [`Khối JSON hỏng: ${error instanceof Error ? error.message : String(error)}`] };
  }

  const parsed = assistSuggestionSchema.safeParse(value);
  if (!parsed.success) {
    return {
      suggestion: null,
      issues: parsed.error.issues
        .slice(0, 5)
        .map((issue) => `Sai kiểu ở "${issue.path.join('.')}": ${issue.message}`),
    };
  }

  const issues: string[] = [];
  if (typeof value === 'object' && value !== null) {
    const known = new Set(Object.keys(assistSuggestionSchema.shape));
    const unknown = Object.keys(value).filter((key) => !known.has(key));
    if (unknown.length > 0) issues.push(`Bỏ qua khóa AI tự thêm: ${unknown.join(', ')}`);
  }

  return { suggestion: parsed.data, issues };
}

// ---------------------------------------------------------------------------
// Áp vào bản nháp — engine phán quyết
// ---------------------------------------------------------------------------

/** Một dòng của bảng duyệt: đổi cái gì, từ đâu sang đâu. */
export interface AssistChange {
  label: string;
  before: string;
  after: string;
}

export interface AssistOutcome {
  draft: CharacterDraft;
  changes: AssistChange[];
  /** Cái gì bị kẹp, bị bỏ, hoặc engine tự dồn nốt. */
  notes: string[];
  /** Câu AI tự giải thích, nếu có. */
  note: string;
}

function clip(text: string, max: number): string {
  const trimmed = text.trim();
  return trimmed.length <= max ? trimmed : trimmed.slice(0, max).trimEnd();
}

function clamp(value: number, low: number, high: number): number {
  if (!Number.isFinite(value)) return low;
  return Math.min(high, Math.max(low, value));
}

class Recorder {
  readonly changes: AssistChange[] = [];
  readonly notes: string[] = [];

  change(label: string, before: string, after: string): void {
    if (before === after) return;
    this.changes.push({ label, before, after });
  }

  note(text: string): void {
    this.notes.push(text);
  }
}

/**
 * CHỈ SỐ — đi qua đúng point-buy của bước 3, không đường tắt.
 *
 * Ba bước, và bước thứ ba mới là bước quan trọng: đặt mục tiêu đã kẹp trần, hạ
 * bớt nếu tiêu quá, rồi DỒN NỐT nếu tiêu thiếu. Không dồn nốt thì một lần nhờ AI
 * gần như luôn để lại vài điểm lẻ, và nút "Chốt nhân vật" vẫn khóa — người chơi
 * nhờ giúp mà vẫn phải tự ngồi bấm cộng từng ô.
 */
function applyStats(draft: CharacterDraft, wanted: Record<string, number>, log: Recorder): CharacterDraft {
  const before = { ...draft.allocated };
  const config = pointBuy();
  const target = { ...draft.allocated } as StatBlock;
  const asked: Partial<Record<StatId, number>> = {};

  for (const [key, value] of Object.entries(wanted)) {
    const id = key.trim().toLowerCase() as StatId;
    if (!STAT_IDS.includes(id)) {
      log.note(`bỏ chỉ số lạ "${key}"`);
      continue;
    }
    const rounded = Math.round(value);
    const capped = clamp(rounded, config.minAtCreation, creationCap(draft, id));
    if (capped !== rounded) log.note(`kẹp ${id.toUpperCase()} ${rounded} → ${capped} (trần lúc tạo)`);
    target[id] = capped;
    asked[id] = capped;
  }

  let next: CharacterDraft = { ...draft, allocated: target };

  // Đòi quá ngân sách là chuyện thường: model không tính nổi thang giá lũy tiến
  // trong đầu. Nói ra CON SỐ vượt chứ không lặng lẽ sửa — đó là chỗ người chơi
  // thấy ranh giới giữa "AI đề nghị" và "engine quyết".
  const overshoot = statPointsLeft(next);
  if (overshoot < 0) log.note(`đề nghị chỉ số vượt ngân sách ${-overshoot} điểm — engine hạ bớt cho vừa`);

  // Tiêu quá: hạ dần ô cao nhất. Hạ ô cao nhất chứ không hạ ô AI vừa nâng, vì ô
  // cao nhất là ô đắt nhất — hạ một bậc ở đó gỡ được tới ba điểm.
  for (let guard = 0; guard < 400 && statPointsLeft(next) < 0; guard++) {
    const candidates = STAT_IDS.filter((id) => canLowerStat(next, id)).sort(
      (left, right) => next.allocated[right] - next.allocated[left],
    );
    const id = candidates[0];
    if (id === undefined) break;
    next = lowerStat(next, id);
  }

  // Còn thừa: dồn VÒNG TRÒN theo thứ tự AI ưu tiên, mỗi lượt một bậc. Dồn hết
  // vào ô đầu danh sách thì AI xin STR 12 lại nhận về STR 16 — đúng ngân sách
  // nhưng sai hẳn nhân vật. Ô AI có nói tới đứng trước ô AI bỏ trống.
  const order = [...STAT_IDS].sort((left, right) => (asked[right] ?? target[right]) - (asked[left] ?? target[left]));
  const ring = [...new Set([...order.filter((id) => asked[id] !== undefined), ...order])];
  const spare = statPointsLeft(next);
  let cursor = 0;
  for (let guard = 0; guard < 400 && statPointsLeft(next) > 0; guard++) {
    let raised = false;
    for (let probe = 0; probe < ring.length; probe++) {
      const id = ring[(cursor + probe) % ring.length];
      if (id === undefined || !canRaiseStat(next, id)) continue;
      next = raiseStat(next, id);
      cursor = (cursor + probe + 1) % ring.length;
      raised = true;
      break;
    }
    if (!raised) break;
  }
  const leftover = statPointsLeft(next);
  if (spare > 0 && leftover < spare) log.note(`dồn nốt ${spare - leftover} điểm chỉ số còn thừa`);
  if (leftover !== 0) log.note(`còn ${leftover} điểm chỉ số không dồn được (đã chạm trần)`);

  const changed = STAT_IDS.filter((id) => before[id] !== next.allocated[id]);
  if (changed.length > 0) {
    log.change(
      'Chỉ số',
      changed.map((id) => `${id.toUpperCase()} ${before[id]}`).join(' · '),
      changed.map((id) => `${id.toUpperCase()} ${next.allocated[id]}`).join(' · '),
    );
  }
  return next;
}

/** KỸ NĂNG — cùng lối với chỉ số: rót theo ý AI, kẹp theo ngân sách của bước 5. */
function applySkills(
  draft: CharacterDraft,
  wanted: readonly { id: string; points: number }[],
  log: Recorder,
): CharacterDraft {
  const config = pointBuy();
  const before = { ...draft.skills };
  let next: CharacterDraft = { ...draft, skills: {} };

  const ranked = wanted
    .map((entry) => ({ id: entry.id.trim(), points: Math.max(0, Math.round(entry.points)) }))
    .filter((entry) => {
      if (skillOf(entry.id) !== null) return true;
      log.note(`bỏ kỹ năng lạ "${entry.id}"`);
      return false;
    })
    .sort((left, right) => right.points - left.points);

  for (const entry of ranked) {
    for (let step = 0; step < entry.points; step++) {
      if (!canRaiseSkill(next, entry.id)) {
        log.note(`không rót hết được vào ${skillName(entry.id)} (hết điểm hoặc chạm trần)`);
        break;
      }
      next = raiseSkill(next, entry.id);
    }
  }

  // Dồn nốt điểm lẻ: nghề AI đã chọn trước, rồi nghề ruột của giai tầng, cuối
  // cùng mới tới phần còn lại — và phần còn lại xếp theo chỉ số CAO NHẤT của
  // chính nhân vật này, để mấy điểm dôi ra vẫn rơi vào thứ hắn có khiếu.
  //
  // Cùng lý do với chỉ số: người chơi nhờ điền thì phải nhận về một bước đã
  // xong. Để lại ba điểm lẻ là để lại một nút "Chốt nhân vật" vẫn khóa.
  const stats = finalStats(next);
  const rest = allSkills()
    .map((skill) => skill.id)
    .sort((left, right) => (stats[skillOf(right)?.stat ?? 'str'] ?? 0) - (stats[skillOf(left)?.stat ?? 'str'] ?? 0));
  const ring = [
    ...new Set([...ranked.map((entry) => entry.id), ...(originOf(draft.originId)?.favouredSkills ?? []), ...rest]),
  ];
  // Khác chỗ dồn chỉ số: ở đây ĐÀO SÂU chứ không rải vòng tròn. Trần một kỹ
  // năng lúc tạo đã chặn sẵn ở sáu điểm, nên đổ đầy từng nghề một sẽ dừng lại
  // đúng lúc — còn rải mỗi nghề một điểm thì sinh ra một người biết hai mươi
  // thứ và không giỏi thứ nào.
  const spare = skillPointsLeft(next);
  for (let guard = 0; guard < 400 && skillPointsLeft(next) > 0; guard++) {
    const id = ring.find((entry) => canRaiseSkill(next, entry));
    if (id === undefined) break;
    next = raiseSkill(next, id);
  }
  const leftover = skillPointsLeft(next);
  if (spare > 0 && leftover < spare) log.note(`dồn nốt ${spare - leftover} điểm kỹ năng còn thừa`);
  if (leftover > 0) log.note(`còn ${leftover} điểm kỹ năng chưa phân`);

  const describe = (skills: Record<string, number>): string => {
    const rows = Object.entries(skills).filter(([, training]) => training > 0);
    if (rows.length === 0) return 'chưa phân';
    return rows
      .map(([id, training]) => `${skillName(id)} ${training / config.skillTrainingPerPoint}`)
      .join(' · ');
  };
  log.change('Kỹ năng', describe(before), describe(next.skills));
  return next;
}

/** NGOẠI HÌNH — chồng lên bản đang có; chưa có thì rút một bản theo tộc trước đã. */
function applyAppearance(
  draft: CharacterDraft,
  wanted: z.infer<typeof appearanceInput>,
  rng: Rng,
  log: Recorder,
): CharacterDraft {
  const base: Appearance =
    draft.appearance ?? randomAppearance(rng, draft.raceId, draft.sex);
  const next: Appearance = { ...base };

  const text = (value: string | undefined, max: number): string | undefined =>
    value === undefined ? undefined : clip(value, max);

  next.build = text(wanted.build, 40) ?? next.build;
  next.skin = text(wanted.skin, 60) ?? next.skin;
  next.hair = text(wanted.hair, 60) ?? next.hair;
  next.hairStyle = text(wanted.hairStyle, 60) ?? next.hairStyle;
  next.beard = text(wanted.beard, 60) ?? next.beard;
  next.eyes = text(wanted.eyes, 60) ?? next.eyes;
  next.eyeShape = text(wanted.eyeShape, 60) ?? next.eyeShape;
  next.face = text(wanted.face, 120) ?? next.face;
  next.mark = text(wanted.mark, 80) ?? next.mark;
  next.voice = text(wanted.voice, 60) ?? next.voice;
  next.gait = text(wanted.gait, 60) ?? next.gait;
  next.mannerism = text(wanted.mannerism, 80) ?? next.mannerism;

  if (wanted.heightCm !== undefined) next.heightCm = Math.round(clamp(wanted.heightCm, 30, 400));
  if (wanted.weightKg !== undefined) next.weightKg = Math.round(clamp(wanted.weightKg, 5, 600));
  if (wanted.musclePct !== undefined) next.musclePct = Math.round(clamp(wanted.musclePct, 0, 100));
  if (wanted.fatPct !== undefined) next.fatPct = Math.round(clamp(wanted.fatPct, 0, 100));

  // Ràng buộc chéo của slice: cơ + mỡ ≤ 100. Kẹp ở đây chứ không đẩy một nhân vật
  // hỏng ra tới nút "Chốt" rồi mới nổ.
  if (next.musclePct + next.fatPct > 100) {
    const fat = Math.max(1, 100 - next.musclePct);
    log.note(`kẹp tỉ lệ mỡ ${next.fatPct}% → ${fat}% (cơ + mỡ không quá 100)`);
    next.fatPct = fat;
  }

  if (wanted.features !== undefined) {
    next.features = wanted.features.map((entry) => clip(entry, 80)).filter((entry) => entry !== '').slice(0, 12);
  }
  if (wanted.scars !== undefined) {
    next.scars = wanted.scars
      .map((scar) => ({ site: clip(scar.site, 60), cause: clip(scar.cause, 60), note: clip(scar.note ?? '', 200) }))
      .filter((scar) => scar.site !== '' && scar.cause !== '')
      .slice(0, 60);
  }

  log.change(
    'Ngoại hình',
    draft.appearance === null
      ? 'chưa dựng'
      : `cao ${base.heightCm}cm · nặng ${base.weightKg}kg · ${base.build} · tóc ${base.hair} · mắt ${base.eyes}`,
    `cao ${next.heightCm}cm · nặng ${next.weightKg}kg · ${next.build} · tóc ${next.hair} · mắt ${next.eyes}`,
  );
  return { ...draft, appearance: next };
}

/** NGƯỜI NHÀ — chỉ sửa người đã có, khớp theo id rồi mới tới quan hệ. */
function applyFamily(
  draft: CharacterDraft,
  wanted: readonly z.infer<typeof familyInput>[],
  log: Recorder,
): CharacterDraft {
  let next = draft;
  const used = new Set<string>();

  for (const entry of wanted) {
    const byId = entry.id === undefined ? undefined : next.family.find((member) => member.id === entry.id);
    const byRelation =
      byId !== undefined || entry.relation === undefined
        ? undefined
        : next.family.find((member) => member.relation === entry.relation && !used.has(member.id));
    const current = byId ?? byRelation;
    if (current === undefined) {
      log.note(`bỏ người nhà không khớp ai đang có: ${entry.id ?? entry.name ?? entry.relation ?? '(không tên)'}`);
      continue;
    }
    used.add(current.id);

    const patch: FamilyMember = { ...current };
    if (entry.name !== undefined && entry.name.trim() !== '') patch.name = clip(entry.name, 80);
    if (entry.role !== undefined) patch.role = clip(entry.role, 80);
    if (entry.goal !== undefined) patch.goal = clip(entry.goal, 200);
    if (entry.note !== undefined) patch.note = clip(entry.note, 200);
    if (entry.status !== undefined) patch.status = clip(entry.status, 60);
    if (entry.attitude !== undefined) patch.attitude = Math.round(clamp(entry.attitude, -100, 100));
    if (entry.age !== undefined) patch.age = Math.round(clamp(entry.age, 0, 2000));
    if (entry.alive !== undefined) patch.alive = entry.alive;
    if (entry.loreEntry !== undefined && lorePeople().some((person) => person.id === entry.loreEntry)) {
      patch.loreEntry = entry.loreEntry;
    }

    next = { ...next, family: next.family.map((member) => (member.id === current.id ? patch : member)) };

    // Gia tộc đi đường riêng: nó phải tính lại cả bảng yêu sách, và đó chính là
    // chỗ "mẹ là con gái vua Đức" thành một dòng thừa kế thật.
    if (entry.houseId !== undefined && entry.houseId !== current.houseId) {
      if (entry.houseId === '' || houseOf(entry.houseId) !== null) {
        next = setFamilyHouse(next, current.id, entry.houseId);
        log.change(`Nhà của ${familyRelationLabel(current.relation)} ${patch.name}`, houseName(current.houseId) || '—', houseName(entry.houseId) || '—');
      } else {
        log.note(`bỏ gia tộc lạ "${entry.houseId}" của ${patch.name}`);
      }
    }

    const describe = (member: FamilyMember): string =>
      `${member.name} · ${member.role === '' ? 'không rõ việc' : member.role} · thái độ ${member.attitude}${
        member.goal === '' ? '' : ` · ${member.goal}`
      }`;
    log.change(`Người nhà · ${familyRelationLabel(current.relation)}`, describe(current), describe(patch));
  }
  return next;
}

function applyOutsideRelations(
  draft: CharacterDraft,
  wanted: readonly z.infer<typeof relationInput>[],
  log: Recorder,
): CharacterDraft {
  const kinds = new Set(relationKinds().map((kind) => kind.id));
  let relations = [...draft.outsideRelations];

  for (const entry of wanted) {
    const index = entry.id === undefined ? -1 : relations.findIndex((relation) => relation.id === entry.id);
    if (index === -1) {
      log.note(`bỏ quan hệ không khớp ai đang có: ${entry.id ?? entry.name ?? '(không tên)'}`);
      continue;
    }
    const current = relations[index];
    if (current === undefined) continue;
    const patched = {
      ...current,
      ...(entry.name === undefined || entry.name.trim() === '' ? {} : { name: clip(entry.name, 80) }),
      ...(entry.kind !== undefined && kinds.has(entry.kind) ? { kind: entry.kind } : {}),
      ...(entry.trust === undefined ? {} : { trust: Math.round(clamp(entry.trust, -100, 100)) }),
      ...(entry.note === undefined ? {} : { note: clip(entry.note, 200) }),
    };
    relations = relations.map((relation, at) => (at === index ? patched : relation));
    log.change(
      `Quan hệ · ${current.kind}`,
      `${current.name} (tin ${current.trust}) ${current.note}`,
      `${patched.name} (tin ${patched.trust}) ${patched.note}`,
    );
  }
  return { ...draft, outsideRelations: relations };
}

/** TRANG BỊ — mỗi món phải là một id có thật; `carry` là cửa duy nhất. */
function applyGear(draft: CharacterDraft, wanted: readonly z.infer<typeof gearInput>[], log: Recorder): CharacterDraft {
  const materials = new Set(gearMaterials().map((material) => material.id));
  const qualities = new Set(gearQualities().map((quality) => quality.id));
  const gear: CarriedGear[] = [];

  for (const entry of wanted) {
    const request = typeof entry === 'string' ? { item: entry } : entry;
    if (gearOf(request.item) === null) {
      log.note(`bỏ trang bị lạ "${request.item}"`);
      continue;
    }
    const added = carry(request.item, {
      ...(request.material !== undefined && materials.has(request.material) ? { material: request.material } : {}),
      ...(request.quality !== undefined && qualities.has(request.quality) ? { quality: request.quality } : {}),
      ...(request.equipped === undefined ? {} : { equipped: request.equipped }),
      ...(request.note === undefined ? {} : { note: clip(request.note, 200) }),
    });
    if (added !== null) gear.push(added);
  }

  const describe = (list: readonly CarriedGear[]): string =>
    list.length === 0 ? 'không mang gì' : list.map((entry) => gearName(entry.item)).join(', ');
  log.change('Trang bị', describe(draft.gear), describe(gear));
  return { ...draft, gear };
}

/**
 * Áp một đề nghị vào bản nháp và kể lại đã đổi những gì.
 *
 * THỨ TỰ KHÔNG ĐƯỢC ĐỔI. `withRace` dựng lại vùng sinh, tuổi và xóa ngoại hình
 * lẫn gia tộc; `withOrigin` dựng lại trang bị và phần thừa kế. Nếu chỉ số chạy
 * trước chủng tộc thì trần vừa dùng để kẹp là trần của tộc CŨ, và cả bảng
 * point-buy sai lặng lẽ.
 *
 * Không tự ghi vào store và không tự chốt nhân vật: nó trả bản nháp mới để UI
 * đưa người chơi duyệt trước — AI đề nghị, engine kẹp, NGƯỜI CHƠI chốt.
 */
export function applyAssist(draft: CharacterDraft, suggestion: AssistSuggestion, rng: Rng): AssistOutcome {
  const log = new Recorder();
  let next = draft;

  // --- Bước 1: chủng tộc -----------------------------------------------------
  if (suggestion.raceId !== undefined && suggestion.raceId !== next.raceId) {
    if (raceOf(suggestion.raceId) === null || !playableRaces().some((race) => race.id === suggestion.raceId)) {
      log.note(`bỏ chủng tộc lạ "${suggestion.raceId}"`);
    } else {
      const hadAppearance = next.appearance !== null;
      const hadFamily = next.family.length > 0;
      log.change('Chủng tộc', raceName(next.raceId), raceName(suggestion.raceId));
      next = withRace(next, suggestion.raceId);
      if (hadAppearance || hadFamily) log.note('đổi chủng tộc nên ngoại hình và gia tộc phải dựng lại');
    }
  }
  if (suggestion.sex !== undefined && suggestion.sex !== next.sex) {
    log.change('Giới', next.sex === 'nam' ? 'nam' : 'nữ', suggestion.sex === 'nam' ? 'nam' : 'nữ');
    next = { ...next, sex: suggestion.sex };
  }

  // --- Bước 2: xuất thân -----------------------------------------------------
  if (suggestion.birthOrderId !== undefined) {
    if (allBirthOrders().some((order) => order.id === suggestion.birthOrderId)) {
      next = { ...next, birthOrderId: suggestion.birthOrderId };
    } else {
      log.note(`bỏ thứ tự trong nhà lạ "${suggestion.birthOrderId}"`);
    }
  }
  if (suggestion.lineageStateId !== undefined) {
    if (allLineageStates().some((state) => state.id === suggestion.lineageStateId)) {
      next = { ...next, lineageStateId: suggestion.lineageStateId };
    } else {
      log.note(`bỏ tình trạng gia tộc lạ "${suggestion.lineageStateId}"`);
    }
  }
  if (suggestion.originId !== undefined && originOf(suggestion.originId) !== null) {
    if (suggestion.originId !== draft.originId) {
      log.change('Giai tầng', originName(draft.originId), originName(suggestion.originId));
    }
    next = withOrigin(next, suggestion.originId);
  } else if (next.birthOrderId !== draft.birthOrderId || next.lineageStateId !== draft.lineageStateId) {
    // Hai ô này quyết định có thừa kế và còn lại bao nhiêu tài sản, nên đổi
    // chúng phải chạy lại `withOrigin` — đúng như hai ô select ở bước 2.
    next = withOrigin(next, next.originId);
  }
  if (next.birthOrderId !== draft.birthOrderId) {
    log.change('Thứ tự trong nhà', draft.birthOrderId, next.birthOrderId);
  }
  if (next.lineageStateId !== draft.lineageStateId) {
    log.change('Tình trạng gia tộc', draft.lineageStateId, next.lineageStateId);
  }
  if (suggestion.originId !== undefined && originOf(suggestion.originId) === null) {
    log.note(`bỏ giai tầng lạ "${suggestion.originId}"`);
  }

  if (suggestion.birthRegionId !== undefined) {
    if (regionExists(suggestion.birthRegionId)) {
      log.change('Nơi sinh', regionName(next.birthRegionId), regionName(suggestion.birthRegionId));
      next = { ...next, birthRegionId: suggestion.birthRegionId };
    } else {
      log.note(`bỏ vùng sinh lạ "${suggestion.birthRegionId}"`);
    }
  }
  if (suggestion.startRegionId !== undefined) {
    if (regionExists(suggestion.startRegionId)) {
      log.change('Nơi khởi đầu', regionName(next.startRegionId), regionName(suggestion.startRegionId));
      next = { ...next, startRegionId: suggestion.startRegionId };
    } else {
      log.note(`bỏ nơi khởi đầu lạ "${suggestion.startRegionId}"`);
    }
  }

  if (suggestion.houseId !== undefined && suggestion.houseId !== next.houseId) {
    if (suggestion.houseId === '' || houseOf(suggestion.houseId) !== null) {
      log.change('Gia tộc', houseName(next.houseId) || 'không có tên tuổi', houseName(suggestion.houseId) || 'không có tên tuổi');
      next = withHouse(next, suggestion.houseId);
    } else {
      log.note(`bỏ gia tộc lạ "${suggestion.houseId}"`);
    }
  }

  if (suggestion.age !== undefined) {
    const aged = withAge(next, suggestion.age);
    if (aged.age !== Math.round(suggestion.age)) {
      log.note(`kẹp tuổi ${Math.round(suggestion.age)} → ${aged.age} (khoảng chọn được của tộc)`);
    }
    log.change('Tuổi', String(next.age), String(aged.age));
    next = aged;
  }

  // --- Bước 3: chỉ số --------------------------------------------------------
  if (suggestion.stats !== undefined) {
    next = applyStats(next, suggestion.stats, log);
  }

  // --- Bước 4: ngoại hình ----------------------------------------------------
  if (suggestion.appearance !== undefined) {
    next = applyAppearance(next, suggestion.appearance, rng, log);
  }
  if (suggestion.clothing !== undefined) {
    log.change('Quần áo khởi đầu', next.clothing || '—', clip(suggestion.clothing, 200) || '—');
    next = { ...next, clothing: clip(suggestion.clothing, 200) };
  }

  // --- Bước 5: kỹ năng -------------------------------------------------------
  if (suggestion.skills !== undefined) {
    const rows = Array.isArray(suggestion.skills)
      ? suggestion.skills.map((entry) => ({ id: entry.id, points: entry.points }))
      : Object.entries(suggestion.skills).map(([id, points]) => ({ id, points }));
    next = applySkills(next, rows, log);
  }

  // --- Bước 6: gia đình ------------------------------------------------------
  if (suggestion.family !== undefined && suggestion.family.length > 0) {
    // Chưa sinh gia tộc mà AI đã viết sẵn tính cách cho từng người thì phải có
    // người trước đã: sinh bằng seeded RNG rồi mới chồng lời AI lên.
    if (next.family.length === 0) {
      next = rollFamily(next, rng);
      log.note('chưa có gia tộc nên đã sinh một cây bằng seeded RNG trước khi áp lời AI');
    }
    next = applyFamily(next, suggestion.family, log);
  }
  if (suggestion.outsideRelations !== undefined && suggestion.outsideRelations.length > 0) {
    next = applyOutsideRelations(next, suggestion.outsideRelations, log);
  }

  // --- Bước 7: thế lực -------------------------------------------------------
  if (suggestion.cultureId !== undefined) {
    if (cultureOf(suggestion.cultureId) !== null || suggestion.cultureId === '') {
      log.change('Văn hóa nuôi dạy', cultureOf(next.cultureId)?.name ?? '—', cultureOf(suggestion.cultureId)?.name ?? '—');
      next = { ...next, cultureId: suggestion.cultureId };
    } else {
      log.note(`bỏ văn hóa lạ "${suggestion.cultureId}"`);
    }
  }
  if (suggestion.culturalFit !== undefined) {
    next = { ...next, culturalFit: Math.round(clamp(suggestion.culturalFit, 0, 100)) };
    log.change('Mức hòa nhập', `${draft.culturalFit}/100`, `${next.culturalFit}/100`);
  }
  if (suggestion.allegiance !== undefined) {
    next = applyAllegiance(next, suggestion.allegiance, log);
  }
  if (suggestion.secrets !== undefined) {
    const secrets: Secret[] = suggestion.secrets
      .map((entry) => (typeof entry === 'string' ? entry : entry.text))
      .map((text) => clip(text, 300))
      .filter((text) => text !== '')
      .slice(0, 3)
      .map((text, index) => ({ id: `secret_${index + 1}`, text, revealed: false }));
    if (suggestion.secrets.length > 3) log.note('mục 7 chỉ cho 1–3 bí mật, đã giữ ba điều đầu');
    if (secrets.length > 0) {
      log.change(
        'Bí mật khởi đầu',
        draft.secrets.map((secret) => secret.text).join(' | ') || 'chưa có',
        secrets.map((secret) => secret.text).join(' | '),
      );
      next = { ...next, secrets };
    }
  }

  // --- Bước 8: trang bị và tài sản -------------------------------------------
  if (suggestion.gear !== undefined) {
    next = applyGear(next, suggestion.gear, log);
  }
  if (suggestion.property !== undefined) {
    const property = suggestion.property.map((entry) => clip(entry, 120)).filter((entry) => entry !== '').slice(0, 40);
    log.change('Tài sản khác', draft.property.join(', ') || 'không có', property.join(', ') || 'không có');
    next = { ...next, property };
  }
  if (suggestion.holdings !== undefined && next.holdings.length > 0) {
    const holdings = next.holdings.map((holding, index) => {
      const entry = suggestion.holdings?.[index];
      if (entry === undefined) return holding;
      return {
        ...holding,
        ...(entry.name === undefined || entry.name.trim() === '' ? {} : { name: clip(entry.name, 60) }),
        ...(entry.note === undefined ? {} : { note: clip(entry.note, 200) }),
      };
    });
    log.change(
      'Thành trì đang giữ',
      next.holdings.map((holding) => holding.name).join(', '),
      holdings.map((holding) => holding.name).join(', '),
    );
    next = { ...next, holdings };
  }
  if (suggestion.fiefs !== undefined && next.fiefs.length > 0) {
    const fiefs = next.fiefs.map((fief, index) => {
      const entry = suggestion.fiefs?.[index];
      if (entry === undefined) return fief;
      return {
        ...fief,
        ...(entry.name === undefined || entry.name.trim() === '' ? {} : { name: clip(entry.name, 60) }),
        ...(entry.liege === undefined ? {} : { liege: clip(entry.liege, 80) }),
        ...(entry.note === undefined ? {} : { note: clip(entry.note, 200) }),
      };
    });
    log.change(
      'Thái ấp đang giữ',
      next.fiefs.map((fief) => fief.name).join(', '),
      fiefs.map((fief) => fief.name).join(', '),
    );
    next = { ...next, fiefs };
  }

  // --- Bước 9: tên, tính cách, cảnh mở đầu -----------------------------------
  if (suggestion.givenName !== undefined && suggestion.givenName.trim() !== '') {
    log.change('Tên', draft.givenName || '(chưa đặt)', clip(suggestion.givenName, 40));
    next = { ...next, givenName: clip(suggestion.givenName, 40) };
  }
  if (suggestion.familyName !== undefined) {
    log.change('Họ', draft.familyName || '(chưa đặt)', clip(suggestion.familyName, 40) || '(không có)');
    next = { ...next, familyName: clip(suggestion.familyName, 40) };
  }
  if (suggestion.personalityNote !== undefined) {
    log.change('Ghi chú tính cách', draft.personalityNote || '—', clip(suggestion.personalityNote, 400) || '—');
    next = { ...next, personalityNote: clip(suggestion.personalityNote, 400) };
  }
  if (suggestion.opening !== undefined) {
    next = applyOpening(next, suggestion.opening, log);
  }

  // Yêu sách suy ra từ cây gia tộc, nên chạy lại một lần ở cuối: `withHouse` và
  // `setFamilyHouse` đã tự tính, nhưng đổi CHỦNG TỘC thì cả cây bị dựng lại.
  next = recomputeClaims(next);

  return { draft: next, changes: log.changes, notes: log.notes, note: suggestion.note ?? '' };
}

function regionExists(id: string): boolean {
  return allRegions().some((region) => region.id === id);
}

function applyAllegiance(
  draft: CharacterDraft,
  wanted: NonNullable<AssistSuggestion['allegiance']>,
  log: Recorder,
): CharacterDraft {
  const allegiance = { ...draft.allegiance };

  if (wanted.nationId !== undefined) {
    if (wanted.nationId === '' || nationIds().includes(wanted.nationId)) {
      log.change('Trung thành', nationName(allegiance.nationId) || 'không thuộc thế lực nào', nationName(wanted.nationId) || 'không thuộc thế lực nào');
      allegiance.nationId = wanted.nationId;
    } else {
      log.note(`bỏ thế lực lạ "${wanted.nationId}"`);
    }
  }
  if (wanted.religionId !== undefined) {
    if (wanted.religionId === '' || religionOf(wanted.religionId) !== null) {
      log.change('Tôn giáo', religionOf(allegiance.religionId)?.name ?? '—', religionOf(wanted.religionId)?.name ?? '—');
      allegiance.religionId = wanted.religionId;
    } else {
      log.note(`bỏ tôn giáo lạ "${wanted.religionId}"`);
    }
  }
  if (wanted.standing !== undefined && NATION_STANDING_IDS.includes(wanted.standing)) {
    allegiance.standing = wanted.standing;
  } else if (wanted.standing !== undefined) {
    log.note(`bỏ vai trò lạ "${wanted.standing}"`);
  }
  if (wanted.liege !== undefined) allegiance.liege = clip(wanted.liege, 80);
  if (wanted.piety !== undefined) allegiance.piety = Math.round(clamp(wanted.piety, 0, 100));
  if (wanted.guilds !== undefined) {
    allegiance.guilds = wanted.guilds.map((guild) => clip(guild, 60)).filter((guild) => guild !== '').slice(0, 10);
    log.change('Hội đoàn', draft.allegiance.guilds.join(', ') || 'không có', allegiance.guilds.join(', ') || 'không có');
  }
  if (allegiance.liege !== draft.allegiance.liege) {
    log.change('Lãnh chúa trực tiếp', draft.allegiance.liege || 'chưa thề với ai', allegiance.liege || 'chưa thề với ai');
  }
  if (allegiance.piety !== draft.allegiance.piety) {
    log.change('Mức sùng đạo', `${draft.allegiance.piety}/100`, `${allegiance.piety}/100`);
  }
  if (allegiance.standing !== draft.allegiance.standing) {
    log.change('Vai trò trong thế lực', draft.allegiance.standing, allegiance.standing);
  }

  return { ...draft, allegiance };
}

function applyOpening(
  draft: CharacterDraft,
  wanted: NonNullable<AssistSuggestion['opening']>,
  log: Recorder,
): CharacterDraft {
  const opening = { ...draft.opening };

  if (wanted.holdingId !== undefined) {
    if (wanted.holdingId === '' || knownSettlements().some((entry) => entry.id === wanted.holdingId)) {
      opening.holdingId = wanted.holdingId;
    } else {
      log.note(`bỏ nơi mở màn lạ "${wanted.holdingId}"`);
    }
  }
  if (wanted.withNpc !== undefined) {
    if (wanted.withNpc === '' || lorePeople().some((person) => person.id === wanted.withNpc)) {
      opening.withNpc = wanted.withNpc;
    } else {
      log.note(`bỏ nhân vật lorebook lạ "${wanted.withNpc}"`);
    }
  }
  if (wanted.situation !== undefined) opening.situation = clip(wanted.situation, 300);

  log.change(
    'Cảnh mở đầu',
    describeOpening(draft.opening),
    describeOpening(opening),
  );
  return { ...draft, opening };
}

function describeOpening(opening: CharacterDraft['opening']): string {
  const parts = [
    opening.holdingId === '' ? 'AI tự chọn nơi' : regionName(opening.holdingId),
    opening.withNpc === '' ? 'một mình' : lorePersonName(opening.withNpc),
    opening.situation === '' ? 'AI tự dựng tình huống' : opening.situation,
  ];
  return parts.join(' · ');
}
