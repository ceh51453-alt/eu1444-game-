/**
 * HÀM GAME TỰ VIẾT CHO TEMPLATE — object `q` và `fmt` (Phần 3 mục 8).
 *
 * Giai đoạn này chỉ dựng KHUNG. Vài hàm chạy thật ngay (những thứ Phần 0–2 đã
 * có state), số còn lại trả stub và được liệt kê ở `PENDING_QUERIES` để bảng
 * tra cứu trong editor nói thẳng cho người viết template biết cái nào chưa có.
 *
 * MỘT QUY TẮC DUY NHẤT, không có ngoại lệ: mọi hàm ở đây PURE và CHỈ ĐỌC.
 * Một hàm `q` gây side effect thì prompt sẽ đổi state, mà prompt được render
 * lại nhiều lần trong một lượt (vòng sửa lỗi của Phần 2) — nghĩa là side effect
 * đó chạy nhiều lần và không ai đếm được bao nhiêu lần.
 *
 * `fmt.approx` không phải hàm làm đẹp: Phụ lục A mục 6 bắt MỌI con số cấp lãnh
 * thổ vào prompt phải làm tròn và kèm chữ "chừng". Đó là thứ khiến AI tự đổi
 * giọng giữa THÀNH TRÌ (đếm chính xác) và LÃNH THỔ (ước lượng).
 */

import nationsFile from '@data/nations.json';
import { formatGameDate, type GameDate } from '@/core/clock';
import { readPath, type GameState } from '@/state/slices';
import type { DerivedValues } from '@/state/derived';
import { bodySummary, injuryViews, type InjuryView } from '@/systems/body';
// Nhập THẲNG `slice`, không nhập barrel `@/systems/nations`: barrel kéo theo
// `create.ts` → `/src/nations/*` → cả tám minigame, và một truy vấn prompt không
// có lý do gì để nạp tám bàn cờ chính trị vào bộ nhớ.
import { nationsStateOf } from '@/systems/nations/slice';
import { countryRankEffectiveEffects, countryRankSupportOf, countryStyleOf } from '@/systems/nations/country-rank';
import { codexPromptView, type CodexPromptView } from '@/systems/codex';
import { logisticsSummaryOf, militaryResourcesOf, militaryStateOf, recruitmentOptions, summaryOf } from '@/systems/military';
import { economyOf, economyStateOf } from '@/systems/economy/slice';
import { marchableArmies } from '@/systems/campaign';
import { characterOf } from '@/systems/character/slice';
import { originOf } from '@/systems/character/origins';
import { attitudeLabel, learnFactor, raceName, raceOf } from '@/systems/character/races';
import { traitName } from '@/systems/character/traits';
import { grantName, ladderOf, landKindName, titleHistoryOf, titleName, titleOf, titlePathName } from '@/systems/titles/data';
import { heldTitles, primaryTitleOf } from '@/systems/titles/slice';
import { realmStateOf, vassalsStateOf } from '@/systems/realm/slice';
import { daysRide, households } from '@/systems/realm/province';
import { lawName } from '@/systems/realm/data';
import {
  factionMemberRankOf,
  factionMembershipsOf,
  factionOrganizationTierOf,
  factionStandingOf,
  nextFactionRankOf,
} from '@/systems/factions';

// ---------------------------------------------------------------------------
// Ngữ cảnh mà `q` đọc
// ---------------------------------------------------------------------------

export interface SceneNpc {
  id: string;
  name: string;
  /** Vai của NPC trong cảnh: "lính gác", "chủ quán"… */
  role: string;
}

/** Cảnh hiện tại — nơi chốn, ai có mặt, thời tiết. Chưa phải slice của state. */
export interface SceneContext {
  place: string;
  npcs: SceneNpc[];
  weather: string;
  timeOfDay: string;
  notes: string[];
}

export function emptyScene(): SceneContext {
  return { place: '', npcs: [], weather: '', timeOfDay: '', notes: [] };
}

/** Một lượt đã chơi, giữ để dựng khối 9 và khối 10. */
export interface TurnEntry {
  turn: number;
  gameDate: GameDate;
  /** Hành động người chơi đã nhập. */
  action: string;
  /** Đoạn văn AI đã viết. */
  narrative: string;
  /** Một dòng tóm tắt kết quả cơ học của lượt. */
  outcome: string;
}

export interface QueryContext {
  state: GameState;
  derived: DerivedValues;
  /** Lượt gần đây, mới nhất ở CUỐI mảng. */
  history: readonly TurnEntry[];
  scene: SceneContext;
  charName?: string;
}

// ---------------------------------------------------------------------------
// `q`
// ---------------------------------------------------------------------------

export interface RelationView {
  trust: number;
  note: string;
}

export interface NpcView {
  id: string;
  name: string;
  role: string;
  relation: RelationView | null;
}

export interface CalendarView {
  date: GameDate;
  text: string;
  weekday: string;
}

export interface QueryApi {
  npc(id: string): NpcView | null;
  relation(id: string): RelationView | null;
  /** Thương tích đang mang, NGUY HIỂM NHẤT ĐỨNG TRƯỚC (Phần 7 mục 10). */
  injuries(): InjuryView[];
  /** Năm thanh của bảng "Cơ thể": máu, đau, sốt, thể lực, ý thức (Phần 7 mục 10). */
  body(): ReturnType<typeof bodySummary>;
  /** Xuất thân + chủng tộc ở dạng chữ đã giải nghĩa, dùng cho lời kể. */
  profile(): unknown | null;
  factions(): unknown[];
  title(): unknown | null;
  holding(): unknown | null;
  realm(): unknown | null;
  army(): unknown | null;
  nation(id: string): unknown | null;
  skills(branch?: string): unknown[];
  recentEvents(count?: number): TurnEntry[];
  rumors(): string[];
  calendar(): CalendarView;
  /** Bộ nhớ Codex: chỉ mục gọn và các hồ sơ liên quan trực tiếp tới cảnh. */
  codex(): CodexPromptView;
}

/** Hàm còn là stub, kèm phần sẽ điền vào. Bảng tra cứu của editor đọc cái này. */
export const PENDING_QUERIES: Readonly<Record<string, string>> = {
  holding: 'Phần 12 — thành trì',
  skills: 'Phần 8 — kỹ năng & nhánh',
};

const NATIONS: readonly unknown[] = (nationsFile as { nations?: unknown[] }).nations ?? [];

const WEEKDAYS = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'] as const;

function weekdayOf(date: GameDate): string {
  const stamp = new Date(Date.UTC(date.year, date.month - 1, date.day));
  stamp.setUTCFullYear(date.year);
  return WEEKDAYS[stamp.getUTCDay()] ?? '';
}

function relationsOf(state: GameState): Record<string, RelationView> {
  const raw = readPath(state, 'character.relations');
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};

  const out: Record<string, RelationView> = {};
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value !== 'object' || value === null) continue;
    const record = value as { trust?: unknown; note?: unknown };
    out[id] = {
      trust: typeof record.trust === 'number' ? record.trust : 0,
      note: typeof record.note === 'string' ? record.note : '',
    };
  }
  return out;
}

export function createQuery(context: QueryContext): QueryApi {
  return {
    npc(id) {
      const inScene = context.scene.npcs.find((npc) => npc.id === id || npc.name === id);
      const relation = relationsOf(context.state)[id] ?? null;
      if (inScene === undefined) {
        return relation === null ? null : { id, name: id, role: '', relation };
      }
      return { id: inScene.id, name: inScene.name, role: inScene.role, relation };
    },

    relation(id) {
      return relationsOf(context.state)[id] ?? null;
    },

    // Phần 7 — cơ thể. Khối prompt số 7 đọc thẳng hai hàm này, nên câu chữ mô
    // tả một vết thương chỉ có ĐÚNG MỘT nguồn: `report.ts`. Hai chỗ tự viết mô
    // tả riêng là hai chỗ sẽ lệch, và AI sẽ được kể một mức độ khác với mức độ
    // hiện trên bản đồ cơ thể.
    injuries: () => injuryViews(context.state),
    body: () => bodySummary(context.state),
    profile() {
      const character = characterOf(context.state);
      if (character === null) return null;
      const race = raceOf(character.identity.race);
      const origin = originOf(character.identity.originId);
      const nationId = character.allegiance.nationId;
      const attitude = nationId === '' ? null : (character.allegiance.attitudes[nationId] ?? 0);
      return {
        race: {
          id: character.identity.race,
          name: raceName(character.identity.race),
          standing: race?.standing ?? '',
          church: race?.church ?? '',
          lifespan: race?.lifespan ?? null,
          learnFactor: learnFactor(character.identity.race),
          traits: (race?.traits ?? []).map(traitName),
          spread: race?.spread ?? [],
          spreadNote: race?.spreadNote ?? '',
          currentNationAttitude: attitude,
          currentNationAttitudeLabel: attitude === null ? '' : attitudeLabel(attitude),
        },
        origin: {
          id: character.identity.originId,
          name: origin?.name ?? character.identity.originId,
          description: origin?.description ?? '',
          history: origin?.history ?? '',
          privileges: origin?.privileges ?? [],
          burdens: origin?.burdens ?? [],
        },
      };
    },

    factions() {
      return factionMembershipsOf(context.state).map((membership) => {
        const rank = factionMemberRankOf(membership.rankId);
        const standing = factionStandingOf(context.state, membership);
        const next = nextFactionRankOf(membership.rankId);
        return {
          id: membership.id,
          name: membership.name,
          kind: membership.kind,
          powerId: membership.powerId,
          rankId: rank.id,
          rank: rank.rank,
          rankName: rank.name,
          influence: membership.influence,
          loyalty: membership.loyalty,
          standing: standing.total,
          privileges: rank.privileges,
          duties: rank.duties,
          checkBonus: rank.checkBonus,
          nextRank: next === null ? null : { name: next.name, minStanding: next.minStanding },
          note: membership.note,
        };
      });
    },

    title() {
      const primary = primaryTitleOf(context.state);
      if (primary === null) return null;
      const rows = heldTitles(context.state).map((held) => {
        const definition = titleOf(held.titleId);
        const history = titleHistoryOf(held.titleId);
        return {
          id: held.titleId,
          name: titleName(held.titleId),
          fiefName: held.fiefName,
          ladder: ladderOf(held.ladderId)?.name ?? held.ladderId,
          rank: definition?.rank ?? 0,
          address: history?.address ?? '',
          legalCharacter: history?.legalCharacter ?? landKindName(definition?.landKind ?? 'khong'),
          path: titlePathName(held.path),
          grantedYear: held.sinceYear,
          legitimacy: Math.round(held.legitimacy),
          churchRecognised: held.churchRecognised,
          liege: held.liege,
          rivalClaimant: held.rivalClaimant,
          termEndsYear: held.termEndsYear,
          grants: (definition?.grants ?? []).map(grantName),
          loses: (definition?.loses ?? []).map(grantName),
          obligations: {
            levyDays: held.obligations.levyDays,
            levyDaysCalled: held.obligations.levyDaysCalled,
            tribute: held.obligations.tribute,
            paidThisYear: held.obligations.paidThisYear,
            courtDays: held.obligations.courtDays,
            attendedThisYear: held.obligations.attendedThisYear,
            arrearsYears: held.obligations.arrearsYears,
          },
          note: held.note || definition?.note || '',
        };
      });
      const selected = rows.find((row) => row.id === primary.titleId && row.fiefName === primary.fiefName) ?? rows[0];
      return selected === undefined ? null : { ...selected, held: rows };
    },
    holding: () => null,
    realm() {
      const realm = realmStateOf(context.state);
      if (realm === null || realm.id === '' || realm.name === '') return null;
      const vassals = vassalsStateOf(context.state);
      const titles = heldTitles(context.state);
      const unrest = realm.provinces.length === 0
        ? 0
        : Math.round(realm.provinces.reduce((sum, province) => sum + province.unrest, 0) / realm.provinces.length);
      return {
        name: realm.name,
        provinces: realm.provinces.length,
        spanDays: realm.provinces.reduce((sum, province) => sum + daysRide(province), 0),
        population: realm.provinces.reduce((sum, province) => sum + households(province) * 5, 0),
        taxFarm: realm.taxRates['nong-dan'] ?? realm.taxRates['nong'] ?? 0,
        taxTrade: realm.taxRates['thuong-nhan'] ?? realm.taxRates['thuong'] ?? 0,
        unrest,
        vassals: (vassals?.list ?? []).map((vassal) => `${vassal.name} (${titleName(vassal.titleId)})`),
        factions: (vassals?.factions ?? []).map((faction) => {
          const tier = factionOrganizationTierOf(faction.tierId);
          const leader = vassals?.list.find((vassal) => vassal.npcId === faction.leaderId)?.name ?? 'chưa rõ';
          return {
            name: faction.name,
            tier: tier.name,
            tierRank: tier.rank,
            members: faction.members.length,
            leader,
            cohesion: Math.round(faction.cohesion),
            influence: Math.round(faction.influence),
            demand: faction.demand,
          };
        }),
        laws: realm.laws.map(lawName),
        duties: titles.map((title) =>
          `${title.fiefName}: ${String(title.obligations.tribute)} đồng, ${String(title.obligations.levyDays)} ngày quân dịch`,
        ),
        pending: realm.cases.filter((row) => row.verdictId === '').map((row) => row.summary),
      };
    },
    army() {
      const military = militaryStateOf(context.state);
      const realmId = readPath(context.state, 'realm.id');
      if (military === null || typeof realmId !== 'string' || realmId === '') return null;
      const summary = summaryOf(military);
      const logistics = logisticsSummaryOf(military);
      const resources = militaryResourcesOf(context.state);
      const faction = readPath(context.state, 'character.allegiance.nationId');
      return {
        total: Math.round(summary.totalTroops),
        land: Math.round(summary.landTroops),
        navy: Math.round(summary.navyPersonnel),
        armies: summary.armies,
        fleets: summary.fleets,
        morale: Math.round(summary.morale),
        experience: Math.round(summary.experience),
        training: Math.round(summary.training),
        monthlyUpkeep: Math.round(summary.monthlyUpkeep),
        manpowerFree: Math.max(0, Math.round(resources.manpowerCapacity - summary.manpowerUsed)),
        logisticsFree: Math.max(0, Math.round(resources.logisticsCapacity - summary.logisticsUsed)),
        logistics: {
          reservePercent: Math.round(logistics.reservePercent),
          averageSupply: Math.round(logistics.averageSupply),
          strainedForces: logistics.forcesStrained,
          cutOffForces: logistics.forcesCutOff,
          monthlyCost: Math.round(logistics.monthlyCost),
          delivered: Math.round(logistics.delivered),
          lost: Math.round(logistics.lost),
          depots: military.logistics.depots.map((depot) => ({
            name: depot.name,
            besieged: depot.besieged,
            condition: Math.round(depot.condition),
            stocks: depot.stocks.map((stock) => ({
              supplyId: stock.supplyId,
              amount: Math.round(stock.amount),
              capacity: Math.round(stock.capacity),
            })),
          })),
          forces: military.logistics.forces.map((status) => ({
            forceId: status.forceId,
            condition: status.condition,
            supplyLevel: Math.round(status.supplyLevel),
            daysOfSupply: Math.round(status.daysOfSupply),
            shortages: [...status.shortages],
            ration: status.ration,
            priority: status.priority,
          })),
          routes: military.logistics.routes.map((route) => ({
            fromDepotId: route.fromDepotId,
            toForceId: route.toForceId,
            mode: route.mode,
            blockaded: route.blockaded,
            condition: Math.round(route.condition),
            delivered: Math.round(route.deliveredLastMonth),
            lost: Math.round(route.lostLastMonth),
          })),
        },
        barracks: resources.barracks,
        recruitable: recruitmentOptions(typeof faction === 'string' ? faction : '').map((option) => ({
          typeId: option.type.id,
          name: option.type.name,
          source: option.source,
          kind: option.forceKind,
          companySize: option.type.standardStrength,
          months: option.months,
        })),
        forces: military.forces.map((force) => ({
          id: force.id,
          name: force.name,
          kind: force.kind,
          troops: force.units.reduce((sum, unit) => sum + unit.strength, 0),
          units: force.units.map((unit) => ({ typeId: unit.typeId, name: unit.name, strength: unit.strength })),
        })),
        recruitment: military.recruitment.map((order) => ({
          typeId: order.typeId,
          name: order.unitName,
          strength: order.strength,
          monthsLeft: order.monthsLeft,
          source: order.source,
        })),
        /**
         * VỊ TRÍ trên chiến đồ — thứ mà `military` cố ý không biết.
         *
         * Người kể chuyện phải thấy đạo quân nào đang trên đường và còn mấy
         * ngày nữa mới tới, nếu không nó sẽ viết "quân đã đóng trước cổng
         * thành" trong khi bản đồ nói quân còn cách đó mười ngày — và người
         * chơi phát hiện ra ngay khi mở tab Chiến đồ.
         */
        chienDo: marchableArmies(context.state),
      };
    },
    skills: () => [],
    /**
     * MỘT THẾ LỰC — danh tính từ `data/nations.json`, TRẠNG THÁI từ slice
     * `nations` của Phần 14.
     *
     * Gộp hai nguồn ở đây chứ không ở prompt là có lý do: người viết prompt chỉ
     * muốn hỏi "nước này thế nào", và bắt họ tự ghép một dòng sổ đăng ký với một
     * bảng chỉ số là bắt họ nhớ hai hình dạng. Trả về gọn — bảng của Phần 14 có
     * hàng chục trường và phần lớn không có nghĩa gì với người kể chuyện.
     */
    nation(id) {
      const registry = NATIONS.find((nation) => (nation as { id?: unknown }).id === id) ?? null;
      const power = nationsStateOf(context.state)?.powers.find((row) => row.id === id) ?? null;
      const economy = economyOf(context.state, id);
      if (registry === null && power === null && economy === null) return null;
      if (power === null) return registry;
      const countryStyle = countryStyleOf(power);
      const countrySupport = countryRankSupportOf(power);
      const countryEffects = countryRankEffectiveEffects(power);
      return {
        ...(registry ?? {}),
        minigame: power.minigame,
        treasury: Math.round(power.treasury),
        prestige: Math.round(power.prestige),
        stability: Math.round(power.stability),
        cohesion: Math.round(power.cohesion),
        military: Math.round(power.military),
        land: power.land,
        fallen: power.fallen,
        countryRank: {
          id: countryStyle.rank.id,
          rank: countryStyle.rank.rank,
          name: countryStyle.rank.name,
          label: countryStyle.label,
          government: countryStyle.form.name,
          rulerTitle: countryStyle.rulerTitle,
          address: countryStyle.address,
          sinceYear: power.rankSinceYear,
          disputed: power.rankDisputed,
          support: countrySupport.value,
          supportLines: countrySupport.lines,
          basis: countryStyle.basis,
          rights: countryStyle.rank.rights,
          burdens: countryStyle.rank.burdens,
          effects: countryEffects,
        },
        /** Nhóm dân đang bị đối xử tệ nhất — thứ NPC trong nước ấy sẽ nhắc tới. */
        grievance: [...power.groups]
          .sort((left, right) => right.grievance - left.grievance)
          .slice(0, 2)
          .map((group) => ({ raceId: group.raceId, status: group.status, grievance: Math.round(group.grievance) })),
        economy: economy === null
          ? null
          : {
              population: Math.round(economy.population),
              workforce: Math.round(economy.workforce),
              gdp: Math.round(economy.gdp),
              growth: Math.round(economy.growth * 10) / 10,
              inflation: Math.round(economy.inflation * 10) / 10,
              unemployment: Math.round(economy.unemployment * 10) / 10,
              prosperity: Math.round(economy.prosperity),
              poverty: Math.round(economy.poverty),
              debt: Math.round(economy.debt),
              monthlyBalance: Math.round(economy.ledger.net),
              tradeBalance: Math.round(economy.ledger.tradeBalance),
              shortages: economy.goods
                .filter((good) => good.unmetDemand > good.consumption * 0.03)
                .map((good) => ({ goodId: good.goodId, unmet: Math.round(good.unmetDemand), priceChange: Math.round(good.priceChange) })),
              recentEvents: (economyStateOf(context.state)?.events ?? [])
                .filter((event) => event.powerId === id)
                .slice(0, 3)
                .map((event) => event.text),
            },
      };
    },

    recentEvents(count = 5) {
      if (count <= 0) return [];
      return context.history.slice(-count).map((entry) => ({ ...entry }));
    },

    rumors() {
      const raw = readPath(context.state, 'character.notes.rumors');
      return Array.isArray(raw) ? raw.filter((item): item is string => typeof item === 'string') : [];
    },

    calendar() {
      const date = context.state.meta.gameDate;
      return { date, text: formatGameDate(date), weekday: weekdayOf(date) };
    },

    codex() {
      return codexPromptView(context.state, context.scene, context.charName ?? '');
    },
  };
}

// ---------------------------------------------------------------------------
// `fmt`
// ---------------------------------------------------------------------------

export interface FormatApi {
  date(date: GameDate): string;
  money(amount: number): string;
  list(items: readonly unknown[]): string;
  table(rows: readonly unknown[]): string;
  pct(value: number): string;
  approx(value: number): string;
}

const MONTHS = [
  'tháng giêng',
  'tháng hai',
  'tháng ba',
  'tháng tư',
  'tháng năm',
  'tháng sáu',
  'tháng bảy',
  'tháng tám',
  'tháng chín',
  'tháng mười',
  'tháng mười một',
  'tháng chạp',
] as const;

const DIGITS = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'] as const;

function groupThousands(value: number): string {
  return Math.round(value).toLocaleString('vi-VN').replace(/ /g, '.');
}

/**
 * Làm tròn số cấp LÃNH THỔ (Phụ lục A mục 6).
 *
 * Không ai đếm được cả một vùng trong thế kỷ 14, nên state giữ số chính xác
 * còn prompt chỉ được thấy con số đã làm tròn kèm chữ "chừng". Đây là lý do
 * duy nhất hàm này tồn tại — nó là hàng rào ngôn ngữ, không phải tiện ích.
 */
function approximate(value: number): string {
  const magnitude = Math.abs(value);

  if (!Number.isFinite(value)) return 'không rõ';
  if (magnitude < 10) return `chừng ${Math.round(value)}`;
  if (magnitude < 100) return `chừng ${Math.round(value / 10) * 10}`;
  if (magnitude < 1000) return `chừng ${Math.round(value / 50) * 50}`;

  if (magnitude < 10000) {
    const thousands = Math.round(value / 1000);
    const word = DIGITS[Math.abs(thousands)];
    return word === undefined ? `chừng ${thousands} nghìn` : `chừng ${word} nghìn`;
  }
  if (magnitude < 1000000) {
    return `chừng ${groupThousands(Math.round(value / 10000) * 10)} nghìn`;
  }
  return `chừng ${(value / 1000000).toFixed(1).replace('.', ',')} triệu`;
}

function cellsOf(row: unknown): string[] {
  if (Array.isArray(row)) return row.map((cell) => (cell === null || cell === undefined ? '' : String(cell)));
  if (typeof row === 'object' && row !== null) {
    return Object.values(row as Record<string, unknown>).map((cell) =>
      cell === null || cell === undefined ? '' : String(cell),
    );
  }
  return [String(row)];
}

function headersOf(rows: readonly unknown[]): string[] | null {
  const first = rows[0];
  if (Array.isArray(first) || typeof first !== 'object' || first === null) return null;
  return Object.keys(first as Record<string, unknown>);
}

export const fmt: FormatApi = {
  date(date) {
    const month = MONTHS[date.month - 1] ?? `tháng ${date.month}`;
    return `ngày ${date.day} ${month} năm ${date.year}`;
  },

  money(amount) {
    return `${groupThousands(amount)} đồng`;
  },

  list(items) {
    const parts = items
      .map((item) => (item === null || item === undefined ? '' : String(item)))
      .filter((item) => item !== '');
    if (parts.length === 0) return 'không có';
    if (parts.length === 1) return parts[0] ?? '';
    return `${parts.slice(0, -1).join(', ')} và ${parts.at(-1) ?? ''}`;
  },

  /** Bảng chữ đơn giản. Cột canh đều để AI đọc được cấu trúc, không phải Markdown. */
  table(rows) {
    if (rows.length === 0) return '(trống)';
    const header = headersOf(rows);
    const body = rows.map(cellsOf);
    const all = header === null ? body : [header, ...body];

    const widths: number[] = [];
    for (const row of all) {
      row.forEach((cell, index) => {
        widths[index] = Math.max(widths[index] ?? 0, cell.length);
      });
    }

    const line = (row: string[]): string =>
      row.map((cell, index) => cell.padEnd(widths[index] ?? cell.length)).join('  ').trimEnd();

    if (header === null) return body.map(line).join('\n');
    return [line(header), widths.map((width) => '─'.repeat(width)).join('  '), ...body.map(line)].join('\n');
  },

  pct(value) {
    return `${Math.round(value * 10) / 10}%`;
  },

  approx: approximate,
};
