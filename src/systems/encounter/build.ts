/**
 * KIỂM DUYỆT LỜI MỜI, RỒI DỰNG VÁN.
 *
 * Đây là nửa "ENGINE PHÁN QUYẾT" của cửa. AI đã nói xong bốn thứ nó được nói
 * (ai, mạnh cỡ nào, to cỡ nào, ở đâu); từ đây trở đi không một con số nào đến từ
 * model.
 *
 * BỐN CỬA KIỂM DUYỆT, đúng thứ tự — cùng khuôn với Phần 7 mục 3:
 *   1. có nhân vật đã chốt chưa
 *   2. còn sống không
 *   3. còn suất trong trần MỘT trận mỗi lượt không
 *   4. id có thật không, chữ có hiểu được không
 *
 * Qua hết bốn cửa thì engine mới dựng — và dựng ĐẦY ĐỦ: kỹ năng thật của đối
 * thủ, trang bị, quân số từng cánh, binh chủng, bậc công sự, mùa, địa hình.
 *
 * TƯƠNG QUAN LÀ TƯƠNG ĐỐI VỚI NGƯỜI CHƠI, không phải một bảng số tuyệt đối. Một
 * kẻ "ngang cơ" ở lượt 5 và ở lượt 300 là hai con người khác hẳn nhau, và đó
 * chính là điều làm cho một lời mời giữa truyện có nghĩa suốt cả ván chơi thay
 * vì hết nghĩa sau mùa đông đầu tiên.
 */

import type { Rng } from '@/core/rng';
import type { GameState } from '@/state/slices';
import { bodyOf } from '@/systems/body/slice';
import { carry, type CarriedGear } from '@/systems/character/gear';
import { characterOf } from '@/systems/character/slice';
import { emptyStatBlock, type StatBlock } from '@/systems/character/stats';
import {
  ARCHETYPES,
  DEFAULT_DOCTRINE,
  allKinds,
  createDuel,
  kindOf,
  type Doctrine,
  type DuelState,
  type FighterSpec,
} from '@/minigames/duel';
import {
  createBattle,
  type BattleState,
  type CompositionEntry,
  type ForceSpec,
  type OfficerSpec,
} from '@/minigames/battle';
import { createSiege, type SiegeSetup, type SiegeState } from '@/systems/siege';
import { playerFighterSpec, skillLevels } from './player';
import { allHoldings, fortificationFromHolding } from '@/systems/holding';
import { militaryStateOf, type MilitaryForce } from '@/systems/military';
import { realmStateOf } from '@/systems/realm';
import { primaryTitleOf } from '@/systems/titles';
import { fold, type ParsedRequest } from './tags';
import {
  KIND_LABELS,
  POWER_LABELS,
  SCALE_LABELS,
  type EncounterOffer,
  type EncounterRequest,
  type EncounterScreening,
  type PowerTier,
  type ScaleTier,
} from './types';

export type BuiltEncounter =
  | { kind: 'duel'; duel: DuelState }
  | { kind: 'battle'; battle: BattleState }
  | { kind: 'siege'; siege: SiegeState };

/**
 * Loại quyết đấu mặc định khi AI không nói, hoặc nói một chữ engine không hiểu.
 *
 * `dau-danh-du` chứ không phải `dau-sinh-tu`: nó là loại duy nhất có
 * `firstBloodEnds`, nghĩa là một trận thật, có sắt thật, nhưng dừng ở giọt máu
 * đầu tiên. Cùng luật với mức độ thương tích của Phần 7 mục 3 — một chữ gõ sai
 * KHÔNG được phép mua thêm nguy hiểm cho người chơi.
 */
const DEFAULT_DUEL_KIND = 'dau-danh-du';

// ---------------------------------------------------------------------------
// Bảng đổi bốn nấc và ba nấc ra số
// ---------------------------------------------------------------------------

/** Quân số của phe người chơi trong một trận dã chiến, và của đạo quân vây. */
const TROOPS: Readonly<Record<ScaleTier, number>> = { nho: 600, vua: 1800, lon: 5200 };

/** Quân địch so với quân mình, theo bốn nấc tương quan. */
const FOE_RATIO: Readonly<Record<PowerTier, number>> = {
  'kem-hon': 0.7,
  'ngang-co': 1,
  hon: 1.35,
  'vuot-xa': 1.9,
};

/**
 * Kỹ năng đối thủ = kỹ năng NGƯỜI CHƠI qua một phép nhân, cộng một sàn tuyệt đối.
 *
 * Sàn có mặt vì phép nhân một mình cho ra những chuyện vô nghĩa: nhân 1,45 với
 * một tân binh 4 điểm ra một "kiếm sĩ vượt xa" 6 điểm. Sàn nói rằng một huyền
 * thoại vẫn là một huyền thoại kể cả khi người chơi chưa biết cầm kiếm — họ chỉ
 * đơn giản là không nên nhận lời.
 */
const SKILL_CURVE: Readonly<Record<PowerTier, { mult: number; add: number; floor: number }>> = {
  'kem-hon': { mult: 0.65, add: 0, floor: 5 },
  'ngang-co': { mult: 1, add: 2, floor: 15 },
  hon: { mult: 1.2, add: 10, floor: 32 },
  'vuot-xa': { mult: 1.45, add: 22, floor: 50 },
};

const FOE_STATS: Readonly<Record<PowerTier, Partial<StatBlock>>> = {
  'kem-hon': { str: 9, agi: 9, vit: 10, wil: 9 },
  'ngang-co': { str: 11, agi: 11, vit: 11, wil: 11 },
  hon: { str: 12, agi: 12, vit: 13, wil: 12 },
  'vuot-xa': { str: 14, agi: 14, vit: 14, wil: 13 },
};

const FOE_GEAR: Readonly<Record<PowerTier, readonly string[]>> = {
  'kem-hon': ['item_dao-gam', 'item_ao-lot-giap'],
  'ngang-co': ['item_kiem-mot-tay', 'item_giap-da', 'item_khien-tron'],
  hon: ['item_kiem-mot-tay', 'item_giap-luoi', 'item_mu-sat', 'item_khien-tron'],
  'vuot-xa': ['item_kiem-dai', 'item_giap-tam', 'item_mu-tru', 'item_gang-sat'],
};

/** Công sự vững cỡ nào, theo tương quan AI khai. */
const FORT_BY_POWER: Readonly<Record<PowerTier, string>> = {
  'kem-hon': 'fort_dinh-lang',
  'ngang-co': 'fort_lau-dai-da',
  hon: 'fort_thanh-tri-kep',
  'vuot-xa': 'fort_dai-thanh',
};

/** Từ khóa trong địa danh → sàn đấu của Phần 9. Truyện tả ở đâu thì đánh ở đó. */
const ARENA_WORDS: readonly (readonly [string, string])[] = [
  ['sanh', 'arena_dai-sanh'],
  ['phong-an', 'arena_dai-sanh'],
  ['cau', 'arena_cau-hep'],
  ['phong', 'arena_phong-ngu'],
  ['buong', 'arena_phong-ngu'],
  ['giuong', 'arena_phong-ngu'],
  ['lay', 'arena_bai-lay'],
  ['bun', 'arena_bai-lay'],
  ['dam', 'arena_bai-lay'],
  ['doi', 'arena_suon-doi'],
  ['doc', 'arena_suon-doi'],
  ['ngo', 'arena_ngo-hep'],
  ['hem', 'arena_ngo-hep'],
  ['pho', 'arena_ngo-hep'],
  ['san', 'arena_san-dau'],
];

/** Từ khóa trong địa danh → bãi chiến của Phần 10. */
const FIELD_WORDS: readonly (readonly [string, string])[] = [
  ['doi', 'field_suon-doi'],
  ['doc', 'field_suon-doi'],
  ['song', 'field_khuc-song'],
  ['ben', 'field_khuc-song'],
  ['rung', 'field_bia-rung'],
  ['lay', 'field_dat-lay'],
  ['dam', 'field_dat-lay'],
  ['bun', 'field_dat-lay'],
  ['deo', 'field_deo-nui'],
  ['nui', 'field_deo-nui'],
  ['hem', 'field_deo-nui'],
  ['lang', 'field_lang-mac'],
  ['xom', 'field_lang-mac'],
  ['thon', 'field_lang-mac'],
  ['dong', 'field_dong-trong'],
];

/** Từ khóa trong tên tòa thành → khuôn mẫu công sự, ưu tiên hơn bảng tương quan. */
const FORT_WORDS: readonly (readonly [string, string])[] = [
  ['dinh-lang', 'fort_dinh-lang'],
  ['rao', 'fort_dinh-lang'],
  ['thap', 'fort_thap-canh'],
  ['dai-thanh', 'fort_dai-thanh'],
  ['tuong-kep', 'fort_thanh-tri-kep'],
  ['thanh-tri', 'fort_thanh-tri-kep'],
  ['lau-dai', 'fort_lau-dai-da'],
];

function matchWord(text: string, table: readonly (readonly [string, string])[]): string | null {
  const folded = fold(text);
  if (folded === '') return null;
  for (const [word, id] of table) {
    if (folded.includes(word)) return id;
  }
  return null;
}

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
}

// ---------------------------------------------------------------------------
// Cửa kiểm duyệt
// ---------------------------------------------------------------------------

/** Loại quyết đấu AI khai, tra bằng id rồi bằng TÊN tiếng Việt. */
function resolveDuelKind(text: string): string | null {
  const wanted = text.trim();
  if (wanted === '') return null;
  if (kindOf(wanted) !== null) return wanted;

  const folded = fold(wanted);
  for (const kind of allKinds()) {
    if (fold(kind.id) === folded || fold(kind.name) === folded) return kind.id;
  }
  return null;
}

/**
 * Một dòng nói rõ engine SẼ dựng ra cái gì.
 *
 * Người chơi bấm "Vào trận" hay "Bỏ qua" dựa vào đúng dòng này, nên nó phải nói
 * con số thật — quân số thật, bậc công sự thật — chứ không phải một câu quảng
 * cáo. Số ở đây và số lúc dựng đến từ cùng một bảng, nên chúng không lệch được.
 */
function describe(request: EncounterRequest, state: GameState): { title: string; brief: string } {
  const where = request.place === '' ? '' : ` ở ${request.place}`;
  const stakes = request.stakes === '' ? '' : ` Được mất: ${request.stakes}.`;

  if (request.kind === 'duel') {
    const kind = kindOf(request.kindId);
    const foe = request.foe === '' ? 'một kẻ không xưng tên' : request.foe;
    const skill = foeSkill(request.power, skillLevels(state)['skill_kiem-thuat'] ?? 0);
    return {
      title: `${kind?.name ?? 'Quyết đấu'}: ${foe}`,
      brief:
        `${foe} — ${POWER_LABELS[request.power]}, kiếm thuật ${String(skill)}/100${where}.` +
        `${kind?.blunted === true ? ' Vũ khí cùn.' : ' Sắt thật.'}${stakes}`,
    };
  }

  if (request.kind === 'battle') {
    const ours = ourTroops(request, state);
    const theirs = Math.round(ours * FOE_RATIO[request.power]);
    const foe = request.foe === '' ? 'quân địch' : request.foe;
    return {
      title: `Dã chiến: ${foe}`,
      brief:
        `Khoảng ${String(ours)} quân của phe ngài đối đầu ${String(theirs)} quân ${foe}` +
        `${where}. Ngài ${request.side === 'thu' ? 'giữ đất' : 'là bên tiến lên'}.${stakes}`,
    };
  }

  const fortName = request.foe === '' ? 'tòa thành' : request.foe;
  const troops = siegeTroops(request, state);
  return {
    title: `Vây hãm: ${fortName}`,
    brief:
      `Đạo quân vây khoảng ${String(troops)} người, ${fortName} là ${fortLabel(fortTemplate(request))}. ` +
      `Ngài đứng ${request.side === 'thu' ? 'trong tường' : 'ngoài tường'}${where}.${stakes}`,
  };
}

function fortLabel(templateId: string): string {
  const names: Readonly<Record<string, string>> = {
    'fort_dinh-lang': 'một đình làng có rào',
    'fort_thap-canh': 'một tháp canh biên',
    'fort_lau-dai-da': 'một lâu đài đá',
    'fort_thanh-tri-kep': 'một thành trì tường kép',
    'fort_dai-thanh': 'một đại thành có tường vòng',
  };
  return names[templateId] ?? templateId;
}

/**
 * Xét một lô lời mời và trả về nhiều nhất MỘT.
 *
 * Trần một trận mỗi lượt không phải để tiết kiệm gì cả — nó là ràng buộc kể
 * chuyện. Một lượt là một cảnh; hai trận đánh trong một cảnh nghĩa là model đã
 * kể lố sang cảnh sau, và cho cả hai chạy là để nó tự viết cả một chiến dịch
 * trong một lần bấm.
 */
export function screenEncounters(
  state: GameState,
  parsed: readonly ParsedRequest[],
  turn: number,
): EncounterScreening {
  const screening: EncounterScreening = { offer: null, refused: [], log: [] };
  if (parsed.length === 0) return screening;

  const character = characterOf(state);
  if (character === null || !character.identity.finalized) {
    for (const item of parsed) screening.refused.push({ request: item.request, reason: 'chưa có nhân vật đã chốt' });
    return screening;
  }
  if (bodyOf(state)?.dead === true) {
    for (const item of parsed) screening.refused.push({ request: item.request, reason: 'nhân vật đã chết' });
    return screening;
  }

  for (const item of parsed) {
    if (screening.offer !== null) {
      screening.refused.push({ request: item.request, reason: 'mỗi lượt chỉ mở được một trận' });
      continue;
    }

    const request: EncounterRequest = { ...item.request };

    // Chữ lạ thì hạ về nấc THẤP NHẤT, không lùi về nấc giữa (Phần 7 mục 3).
    if (item.unknown.includes('power')) {
      request.power = 'kem-hon';
      screening.log.push('không hiểu tương quan AI khai — hạ về "kém hơn"');
    }
    if (item.unknown.includes('scale')) {
      request.scale = 'nho';
      screening.log.push('không hiểu quy mô AI khai — hạ về "nhỏ"');
    }
    if (item.unknown.includes('side')) {
      screening.log.push('không hiểu bên AI khai — mặc định ngài là bên chủ động');
    }

    if (request.kind === 'duel') {
      const resolved = resolveDuelKind(request.kindId);
      if (resolved === null) {
        if (request.kindId !== '') {
          screening.log.push(`không có loại quyết đấu "${request.kindId}" — dùng đấu danh dự (dừng ở giọt máu đầu)`);
        }
        request.kindId = DEFAULT_DUEL_KIND;
      } else {
        request.kindId = resolved;
      }
    }

    const described = describe(request, state);
    screening.offer = { request, title: described.title, brief: described.brief, turn };
  }

  return screening;
}

// ---------------------------------------------------------------------------
// Dựng — quyết đấu
// ---------------------------------------------------------------------------

function foeSkill(power: PowerTier, playerSkill: number): number {
  const curve = SKILL_CURVE[power];
  return clamp(Math.max(curve.floor, Math.round(playerSkill * curve.mult + curve.add)), 1, 95);
}

/**
 * Lối đánh của đối thủ.
 *
 * Đọc bằng LỜI TẢ trước, bằng tương quan sau: một tay cướp vẫn đánh như một tay
 * cướp dù hắn giỏi hơn hay kém hơn người chơi, và AI đã tả hắn là gì thì hắn nên
 * đánh đúng như thế. Phần 9 mục 1 vẫn cho phép hỏi model một doctrine riêng lúc
 * vào trận; đây chỉ là nước đi mặc định để trận nào cũng đánh được (R4).
 */
function foeDoctrine(request: EncounterRequest): Doctrine {
  const text = fold(`${request.foe} ${request.description} ${request.relation}`);
  if (/cuop|giac|tho-phi|luu-manh|sat-thu|do-te/.test(text)) return archetypeOr('ke-cuop');
  if (/hiep-si|quy-toc|ba-tuoc|ser|hiep/.test(text)) return archetypeOr('hiep-si');
  if (/dien|hung|du-ton|man-ro|cuong/.test(text)) return archetypeOr('hung-han');
  if (/gia|lao-luyen|day-dan|cuu-binh|thay/.test(text)) return archetypeOr('nhan-nai');

  if (request.power === 'vuot-xa') return archetypeOr('hiep-si');
  if (request.power === 'hon') return archetypeOr('hung-han');
  if (request.power === 'kem-hon') return archetypeOr('choi-ban');
  return DEFAULT_DOCTRINE;
}

function archetypeOr(id: string): Doctrine {
  return ARCHETYPES[id] ?? DEFAULT_DOCTRINE;
}

function foeFighterSpec(request: EncounterRequest, state: GameState): FighterSpec {
  const playerSkill = skillLevels(state)['skill_kiem-thuat'] ?? 0;
  const skill = foeSkill(request.power, playerSkill);

  const gear: CarriedGear[] = [];
  for (const id of FOE_GEAR[request.power]) {
    const entry = carry(id);
    if (entry !== null) gear.push(entry);
  }

  return {
    id: 'npc_doi-thu',
    name: request.foe === '' ? 'Kẻ thách đấu' : request.foe,
    description: request.description,
    relation: request.relation,
    stats: { ...emptyStatBlock(10), ...FOE_STATS[request.power] },
    skills: {
      'skill_kiem-thuat': skill,
      skill_khien: Math.round(skill * 0.8),
      'skill_tay-khong': Math.round(skill * 0.6),
    },
    gear,
    doctrine: foeDoctrine(request),
  };
}

function arenaFor(request: EncounterRequest): string {
  const matched = matchWord(request.place, ARENA_WORDS);
  if (matched !== null) return matched;
  if (request.kindId === 'dau-tap' || request.kindId === 'dau-giai') return 'arena_san-dau';
  if (request.kindId === 'phuc-kich') return 'arena_ngo-hep';
  return 'arena_san-dau';
}

export function buildDuel(request: EncounterRequest, state: GameState, rng: Rng, turn: number): DuelState {
  const kind = kindOf(request.kindId);
  return createDuel(rng, {
    kindId: kind === null ? DEFAULT_DUEL_KIND : kind.id,
    arenaId: arenaFor(request),
    // Vũ khí chỉ được MƯỢN ở sân tập. Bị chặn đường trong ngõ mà tay không thì
    // tay không — engine không phát kiếm từ hư không để cứu người chơi.
    a: playerFighterSpec(state, kind?.blunted === true),
    b: foeFighterSpec(request, state),
    state,
    turn,
    stakes: request.stakes,
    setting: {
      place: request.place,
      witnesses: request.relation === '' ? '' : 'những người biết chuyện giữa hai người',
    },
  });
}

// ---------------------------------------------------------------------------
// Dựng — dã chiến
// ---------------------------------------------------------------------------

/**
 * Quân của phe người chơi.
 *
 * Bên GIỮ ĐẤT ít quân hơn, và đó là chủ ý: trong truyện, người ta cố thủ vì
 * không đủ người để ra ngoài đánh. Trận nào cũng cân bằng hoàn hảo là trận nào
 * cũng giống nhau.
 */
function activeLandForce(state: GameState): MilitaryForce | null {
  return militaryStateOf(state)?.forces.find(
    (force) => force.kind === 'land' && force.units.some((unit) => unit.strength > 0),
  ) ?? null;
}

function forceTroops(force: MilitaryForce | null): number {
  return force?.units.reduce((sum, unit) => sum + Math.max(0, unit.strength), 0) ?? 0;
}

function ourTroops(request: EncounterRequest, state?: GameState): number {
  const real = state === undefined ? 0 : forceTroops(activeLandForce(state));
  if (real > 0) return real;
  const base = TROOPS[request.scale];
  return request.side === 'thu' ? Math.round(base * 0.8) : base;
}

function siegeTroops(request: EncounterRequest, state: GameState): number {
  // Chỉ dùng quân thật khi người chơi là bên vây. Khi thủ thành, quân vây là
  // đối phương do lời kể mở ra; lấy quân của chính ngài đặt ngoài tường là đảo phe.
  return request.side === 'cong' ? ourTroops(request, state) : TROOPS[request.scale];
}

type HostId = 'phong-kien' | 'cuop' | 'bo-lac';

const HOSTS: Readonly<Record<HostId, readonly CompositionEntry[]>> = {
  'phong-kien': [
    { typeId: 'unit_hiep-si-giap-tam', share: 1, wing: 'ta' },
    { typeId: 'unit_bo-binh-thue', share: 3, wing: 'trung' },
    { typeId: 'unit_cung-thu', share: 2, wing: 'huu' },
    { typeId: 'unit_bo-binh-lang', share: 2, wing: 'du-bi' },
  ],
  cuop: [
    { typeId: 'unit_ky-si-nhe', share: 2, wing: 'ta' },
    { typeId: 'unit_bo-binh-thue', share: 3, wing: 'trung' },
    { typeId: 'unit_giao-dai-dan-quan', share: 2, wing: 'huu' },
  ],
  'bo-lac': [
    { typeId: 'unit_bo-binh-orc', share: 4, wing: 'trung' },
    { typeId: 'unit_ky-xa-thao-nguyen', share: 2, wing: 'ta' },
    { typeId: 'unit_chien-binh-rung', share: 2, wing: 'huu' },
  ],
};

/** Địch là loại quân nào — đọc từ chính lời AI tả, không bốc thăm. */
function hostFor(request: EncounterRequest): readonly CompositionEntry[] {
  const text = fold(`${request.foe} ${request.description}`);
  if (/cuop|giac|tho-phi|luu-manh|danh-thue-vo-chu/.test(text)) return HOSTS['cuop'];
  if (/orc|bo-lac|man|thao-nguyen|rung/.test(text)) return HOSTS['bo-lac'];
  return HOSTS['phong-kien'];
}

/**
 * Ba viên tướng dưới quyền, một cho mỗi cánh.
 *
 * Lòng trung KHÔNG đầy: bảng tướng của Phần 10 mục 3 chỉ có nghĩa khi có kẻ
 * lưỡng lự, và một đạo quân toàn người trung thành tuyệt đối biến ma sát mệnh
 * lệnh 3d6 thành một phép cộng vô nghĩa.
 */
function officersFor(prefix: string, commander: string): OfficerSpec[] {
  return [
    { name: `${prefix} cánh tả`, wing: 'ta', loyalty: 65, skill: 48, wit: 12, temperament: 'lieu-linh' },
    { name: commander, wing: 'trung', loyalty: 95, skill: 58, wit: 12, pre: 13 },
    { name: `${prefix} cánh hữu`, wing: 'huu', loyalty: 55, skill: 44, wit: 12, temperament: 'than-trong' },
  ];
}

function forceComposition(force: MilitaryForce | null): readonly CompositionEntry[] {
  if (force === null) return HOSTS['phong-kien'];
  const wings = ['ta', 'trung', 'huu', 'du-bi'] as const;
  const byType = new Map<string, number>();
  for (const unit of force.units) {
    if (unit.strength <= 0) continue;
    byType.set(unit.typeId, (byType.get(unit.typeId) ?? 0) + unit.strength);
  }
  const rows = [...byType].map(([typeId, share], index) => ({
    typeId,
    share,
    wing: wings[index % wings.length] ?? 'trung',
  }));
  return rows.length === 0 ? HOSTS['phong-kien'] : rows;
}

export function buildBattle(request: EncounterRequest, state: GameState, rng: Rng, turn: number): BattleState {
  const name = characterOf(state)?.identity.name ?? '';
  const realForce = activeLandForce(state);
  const ours = ourTroops(request, state);
  const theirs = Math.max(50, Math.round(ours * FOE_RATIO[request.power]));
  const lordName = request.commander || realForce?.commander || name || 'chủ soái của ngài';
  const foeName = request.foe === '' ? 'Quân địch' : request.foe;
  const fieldId =
    matchWord(request.place, FIELD_WORDS) ?? (request.side === 'thu' ? 'field_suon-doi' : 'field_dong-trong');

  const ourForce: ForceSpec = {
    name: realForce?.name ?? `Quân của ${lordName}`,
    troops: ours,
    composition: forceComposition(realForce),
    officers: officersFor('Đội trưởng', lordName),
    commanderName: lordName,
  };
  const foeForce: ForceSpec = {
    name: foeName,
    troops: theirs,
    composition: hostFor(request),
    officers: officersFor(`Tay cầm quân của ${foeName},`, `Kẻ cầm đầu ${foeName}`),
    commanderName: `Kẻ cầm đầu ${foeName}`,
  };

  return createBattle(rng, {
    a: ourForce,
    b: foeForce,
    fieldId,
    playerSide: 'a',
    titleId: primaryTitleOf(state)?.titleId ?? 'thuong-dan',
    playerWing: 'huu',
    lordName,
    state,
    turn,
    stakes: request.stakes,
    setting: {
      place: request.place,
      witnesses: name === '' ? '' : `những người biết mặt ${name}`,
    },
  });
}

// ---------------------------------------------------------------------------
// Dựng — vây hãm
// ---------------------------------------------------------------------------

function fortTemplate(request: EncounterRequest): string {
  return matchWord(request.foe, FORT_WORDS) ?? matchWord(request.place, FORT_WORDS) ?? FORT_BY_POWER[request.power];
}

/** Mùa lấy từ LỊCH VÁN CHƠI: một cuộc vây hãm tháng Chạp phải là một cuộc vây hãm mùa đông. */
function seasonFor(state: GameState): string {
  const month = state.meta.gameDate.month;
  if (month >= 3 && month <= 5) return 'xuan';
  if (month >= 6 && month <= 8) return 'ha';
  if (month >= 9 && month <= 11) return 'thu';
  return 'dong';
}

function enginesFor(scale: ScaleTier): string[] {
  // Thang lúc nào cũng dựng được tại chỗ. Xe húc phải kéo theo, và trebuchet thì
  // KHÔNG có sẵn ở đây — mục 4 của Phần 11 bắt nó dựng tại trận, và ba tuần ấy
  // là ba tuần bên thủ dùng để làm việc khác.
  if (scale === 'nho') return ['engine_thang'];
  if (scale === 'vua') return ['engine_thang', 'engine_xe-huc'];
  return ['engine_thang', 'engine_xe-huc', 'engine_ballista'];
}

export function buildSiege(request: EncounterRequest, state: GameState, rng: Rng, turn: number): SiegeState {
  const name = characterOf(state)?.identity.name ?? '';
  const force = request.side === 'cong' ? activeLandForce(state) : null;
  const troops = siegeTroops(request, state);
  const templateId = fortTemplate(request);
  const wanted = fold(`${request.foe} ${request.place}`);
  const owned = allHoldings(state);
  const defended = request.side === 'thu'
    ? owned.find((holding) => wanted.includes(fold(holding.name))) ?? owned.find((holding) => holding.seat) ?? owned[0]
    : undefined;
  const fortName = defended?.name ?? (request.foe === '' ? 'tòa thành không tên' : request.foe);
  const besieger =
    request.side === 'cong'
      ? request.commander === ''
        ? 'Đạo quân của ngài'
        : `Quân ${request.commander}`
      : request.commander === ''
        ? 'Đạo quân vây'
        : `Quân ${request.commander}`;

  const attacker: SiegeSetup['attacker'] = {
    name: force?.name ?? besieger,
    commanderName: request.commander || force?.commander || (request.side === 'cong' ? name : '') || 'chủ soái',
    troops,
    levy: force?.units.filter((unit) => unit.source === 'levy').reduce((sum, unit) => sum + unit.strength, 0)
      ?? Math.round(troops * 0.45),
    mercenary: force?.units.filter((unit) => unit.source === 'mercenary').reduce((sum, unit) => sum + unit.strength, 0)
      ?? Math.round(troops * 0.3),
    retinue: force?.units.filter((unit) => unit.source === 'barracks').reduce((sum, unit) => sum + unit.strength, 0)
      ?? (troops - Math.round(troops * 0.45) - Math.round(troops * 0.3)),
    treasury: request.side === 'cong'
      ? Math.max(0, realmStateOf(state)?.treasury ?? characterOf(state)?.resources.coins ?? troops * 2)
      : troops * 2,
    supplies: (() => {
      if (force === null) return troops * 3;
      const logistics = militaryStateOf(state)?.logistics.forces.find((row) => row.forceId === force.id);
      const food = logistics?.carried.find((stock) => stock.supplyId === 'luong-thuc')?.amount;
      return Math.max(troops, food ?? troops * Math.max(2, (logistics?.daysOfSupply ?? 21) / 7));
    })(),
    engines: enginesFor(request.scale),
    minerRaceId: 'race_lun-nui',
  };

  return createSiege(rng, {
    fort: defended === undefined ? { templateId, name: fortName } : fortificationFromHolding(defended),
    attacker,
    defender: { name: fortName, commanderName: request.side === 'thu' ? (name || 'viên trấn thủ') : 'viên trấn thủ' },
    playerSide: request.side === 'thu' ? 'thu' : 'vay',
    seasonId: seasonFor(state),
    reliefPossible: true,
    state,
    turn,
    stakes: request.stakes,
    setting: {
      place: request.place === '' ? fortName : request.place,
      witnesses: name === '' ? '' : `những người biết mặt ${name}`,
    },
  });
}

// ---------------------------------------------------------------------------
// Cửa vào
// ---------------------------------------------------------------------------

/**
 * Dựng ván từ một lời mời đã qua kiểm duyệt.
 *
 * `rng` phải là DÒNG RIÊNG của minigame ấy (`DUEL_STREAM`, `BATTLE_STREAM`,
 * `SIEGE_STREAM`), đã khôi phục về vị trí trong save. Dựng bằng dòng `main` thì
 * mọi cú tung của mọi lượt sau lệch đi, và R3 hết đúng mà không ai nhìn thấy.
 */
export function buildEncounter(
  offer: EncounterOffer,
  state: GameState,
  rng: Rng,
  turn: number,
): BuiltEncounter {
  const request = offer.request;
  if (request.kind === 'battle') return { kind: 'battle', battle: buildBattle(request, state, rng, turn) };
  if (request.kind === 'siege') return { kind: 'siege', siege: buildSiege(request, state, rng, turn) };
  return { kind: 'duel', duel: buildDuel(request, state, rng, turn) };
}

/** Dòng nhãn ngắn cho UI: "Quyết đấu · ngang cơ · quy mô vừa". */
export function offerTag(offer: EncounterOffer): string {
  const request = offer.request;
  const parts = [KIND_LABELS[request.kind], POWER_LABELS[request.power]];
  if (request.kind !== 'duel') parts.push(`quy mô ${SCALE_LABELS[request.scale]}`);
  return parts.join(' · ');
}
