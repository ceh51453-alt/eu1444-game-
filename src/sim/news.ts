/**
 * TIN TỨC LAN TRUYỀN — Phần 15 mục 6, cơ chế đặc trưng của thế kỷ 14.
 *
 * Một sự kiện xảy ra ở một toạ độ và **KHÔNG** tự động vào tri thức của người
 * chơi. Nó phải đi — mất chừng ấy ngày, và mất chừng ấy độ chính xác trên đường.
 *
 * BỐN QUY TẮC, và cả bốn đều ở file này:
 *
 *  1. **Đi theo tuyến thật.** `map.ts` tìm đường, ở đây chỉ đổi ra ngày.
 *  2. **Càng xa thì đến càng muộn VÀ càng sai.** Hai vế, và vế thứ hai mới là
 *     thứ làm nên phần này: một trận thua có thể tới nơi thành một trận thắng.
 *  3. **Việc lớn đi nhanh hơn và xa hơn.** `importance` quyết ai chịu mang tin.
 *  4. **Tin sai VẪN được ghi vào tri thức**, và AI kể chuyện sẽ dựa vào nó.
 *     Đây là tính năng, không phải lỗi — nên không có chỗ nào ở đây "sửa lại cho
 *     đúng" trước khi ghi.
 *
 * ĐỘ CHÍNH XÁC CHỐT LÚC GỬI, không giảm dần từng ngày. Cả quãng đường đã biết
 * ngay lúc tin lên đường, nên tính một lần là đủ; giảm dần từng ngày chỉ thêm
 * một vòng lặp và thêm một chỗ để làm tròn sai. Điều đó cũng giữ R3: số lần rút
 * xúc sắc của một tin không đổi theo việc người chơi bấm bao nhiêu lượt.
 */

import { addDays, type GameDate } from '@/core/clock';
import type { Rng } from '@/core/rng';
import { regionName } from '@/lore/regions';
import {
  carrierOf,
  carriers,
  distortionTemplates,
  hedges,
  importanceRow,
  intelKindOf,
  newsConfig,
  omens,
  templatesFor,
  type Carrier,
  type DistortionTemplate,
} from './data';
import { anchorOf, coordsOf, crowKm, edgesFrom, findRoute, travelDays } from './map';
import type { ArrivedNews, NewsItem, WorldEvent } from './types';

/** Ai đầu tư vào vùng nào — `world.intel` của slice. */
export interface IntelInvestment {
  regionId: string;
  kindId: string;
}

/**
 * Cách tra tên. Truyền vào chứ không import: id của một biến cố có thể là agent
 * (Phần 15), thế lực (Phần 14), hoặc thành trì (Phần 12), và `news.ts` không có
 * lý do gì để biết cả ba hệ ấy.
 */
export interface NameBook {
  actor(id: string): string;
  place(id: string): string;
}

export const DEFAULT_NAMES: NameBook = {
  actor: (id) => (id === '' ? 'một kẻ nào đó' : id),
  place: (id) => (id === '' ? 'đâu đó' : regionName(id)),
};

// ---------------------------------------------------------------------------
// Gửi tin đi
// ---------------------------------------------------------------------------

/** Lợi thế tình báo người chơi đã mua ở một vùng (mục 6, vế cuối). */
export function intelBonusFor(
  intel: readonly IntelInvestment[],
  regionId: string,
): { speedBonus: number; accuracyBonus: number } {
  let speedBonus = 1;
  let accuracyBonus = 0;
  for (const row of intel) {
    if (row.regionId !== regionId) continue;
    const kind = intelKindOf(row.kindId);
    if (kind === null) continue;
    speedBonus *= kind.speedBonus;
    accuracyBonus += kind.accuracyBonus;
  }
  return { speedBonus, accuracyBonus };
}

/**
 * Ai chịu mang tin này đi xa ngần ấy.
 *
 * `reachKm` của mức quan trọng nhân với `reachFactor` của từng loại người đưa
 * tin: một tin đồn đi xa hơn một sứ giả ở cùng mức quan trọng, vì không ai phải
 * trả tiền cho nó đi. Nó chỉ tới muộn hơn nhiều và sai hơn nhiều.
 */
function carriersFor(importance: number, km: number): Carrier[] {
  const row = importanceRow(importance);
  const out: Carrier[] = [];
  for (const carrierId of row.carriers) {
    const carrier = carrierOf(carrierId);
    if (carrier === null) continue;
    if (km <= row.reachKm * carrier.reachFactor) out.push(carrier);
  }
  return out;
}

/** Tối đa hai bản của một biến cố: bản nhanh và bản chậm. */
const MAX_VERSIONS = 2;

export interface DispatchInput {
  event: Pick<WorldEvent, 'id' | 'regionId' | 'importance' | 'occurredAt'>;
  /** Vùng người chơi đang đứng — đích của mọi tin trong hệ này. */
  toRegionId: string;
  now: GameDate;
  intel: readonly IntelInvestment[];
}

/**
 * Cho một biến cố lên đường.
 *
 * Trả về TỐI ĐA HAI bản: bản của người đưa tin nhanh nhất tới được, và bản của
 * người chậm nhất. Hai bản là cố ý và là một tính năng — tin đồn tới trước, sai
 * nhiều; sứ giả tới sau, đúng hơn. Người chơi sống mấy tuần với bản sai, và đó
 * chính là cảm giác mà mục 6 muốn.
 *
 * Trả về mảng rỗng nghĩa là chuyện ấy quá nhỏ hoặc quá xa để tới tai người chơi.
 * Nó vẫn xảy ra, vẫn nằm trong `world.events`, chỉ là người chơi không biết.
 */
export function dispatchNews(rng: Rng, input: DispatchInput): NewsItem[] {
  const { event, toRegionId, now, intel } = input;
  if (event.regionId === '' || toRegionId === '') return [];

  const origin = coordsOf(event.regionId);
  if (origin === null) return [];

  const km = crowKm(event.regionId, toRegionId);
  if (!Number.isFinite(km)) return [];

  const eligible = carriersFor(event.importance, km);
  if (eligible.length === 0) return [];

  const route = findRoute(event.regionId, toRegionId);
  const bonus = intelBonusFor(intel, event.regionId);
  const config = newsConfig();
  const speedFactor = importanceRow(event.importance).speedFactor;

  // Nhanh nhất và chậm nhất. Một người thì chỉ có một bản, và đó cũng đúng: một
  // chuyện nhỏ chỉ có tin đồn kể lại, không ai cử sứ giả đi báo.
  const sorted = [...eligible].sort((left, right) => right.kmPerDay - left.kmPerDay);
  const chosen = sorted.length <= MAX_VERSIONS ? sorted : [sorted[0], sorted[sorted.length - 1]];

  const items: NewsItem[] = [];
  for (const carrier of chosen) {
    if (carrier === undefined) continue;

    const days = Math.min(
      config.maxDaysInFlight,
      travelDays(route, carrier.kmPerDay * speedFactor, now, bonus.speedBonus),
    );

    // Càng xa VÀ càng qua nhiều miệng thì càng sai. Hai vế cộng lại, không nhân:
    // một chuyến đi thẳng rất dài vẫn đúng hơn một chuỗi mười lần kể lại ngắn.
    const raw =
      carrier.baseAccuracy -
      (carrier.lossPer100Km * route.km) / 100 -
      carrier.lossPerHop * route.hops +
      bonus.accuracyBonus;
    // Đường băng đồng thì thêm một khoản phạt: không ai đi tuyến ấy thường xuyên
    // nên tin về nó luôn là tin của một người duy nhất vừa đi qua.
    const accuracy = clampAccuracy(raw - (route.fallback ? 12 : 0), config.minAccuracy);

    const rolled = rollDistortions(rng, accuracy);
    items.push({
      id: `${event.id}::${carrier.id}`,
      eventId: event.id,
      origin,
      originRegionId: event.regionId,
      destinationRegionId: toRegionId,
      occurredAt: event.occurredAt,
      importance: event.importance,
      carrierId: carrier.id,
      daysLeft: days,
      daysTotal: days,
      accuracy,
      distortions: rolled.ids,
      numberFactor: rolled.numberFactor,
      flipped: rolled.flipped,
    });
  }

  return items;
}

function clampAccuracy(value: number, floor: number): number {
  return Math.max(floor, Math.min(100, Math.round(value)));
}

// ---------------------------------------------------------------------------
// Bóp méo (mục 6)
// ---------------------------------------------------------------------------

interface RolledDistortions {
  ids: string[];
  numberFactor: number;
  flipped: boolean;
}

/**
 * Bốc mẫu bóp méo theo trọng số.
 *
 * Số mẫu dính vào tỷ lệ với mức độ SAI, không phải với khoảng cách: một tin đi
 * xa nhưng có sứ giả riêng vẫn tới nơi gần như nguyên vẹn, và đó chính là thứ
 * người chơi mua khi họ nuôi sứ giả.
 */
function rollDistortions(rng: Rng, accuracy: number): RolledDistortions {
  const pool = distortionTemplates().filter((template) => accuracy < template.belowAccuracy);
  const result: RolledDistortions = { ids: [], numberFactor: 1, flipped: false };
  if (pool.length === 0) return result;

  const slots = accuracy >= 75 ? 1 : accuracy >= 50 ? 2 : accuracy >= 30 ? 3 : 4;
  const taken = new Set<string>();

  for (let slot = 0; slot < slots; slot++) {
    const available = pool.filter((template) => !taken.has(template.id));
    if (available.length === 0) break;

    const total = available.reduce((sum, template) => sum + template.weight, 0);
    if (total <= 0) break;
    let ticket = rng.next() * total;
    let picked: DistortionTemplate | undefined;
    for (const template of available) {
      ticket -= template.weight;
      if (ticket <= 0) {
        picked = template;
        break;
      }
    }
    picked = picked ?? available[available.length - 1];
    if (picked === undefined) break;

    taken.add(picked.id);
    result.ids.push(picked.id);

    if (picked.kind === 'so-lieu' && picked.numberFactor !== undefined) {
      const [low, high] = picked.numberFactor;
      result.numberFactor *= low + rng.next() * (high - low);
    }
    if (picked.kind === 'ket-cuc') result.flipped = true;
  }

  return result;
}

function hasKind(item: NewsItem, kind: DistortionTemplate['kind']): boolean {
  return distortionTemplates().some((template) => template.kind === kind && item.distortions.includes(template.id));
}

// ---------------------------------------------------------------------------
// Trên đường
// ---------------------------------------------------------------------------

export interface AdvanceResult {
  inFlight: NewsItem[];
  arrived: NewsItem[];
}

/**
 * Cho mọi tin đi thêm `days` ngày.
 *
 * KHÔNG rút xúc sắc: mọi thứ ngẫu nhiên của một tin đã chốt lúc gửi. Nhờ vậy hàm
 * này gọi được ở tick nhanh, mỗi lượt, mà không đẩy lệch dòng xúc sắc nào (R3).
 */
export function advanceNews(items: readonly NewsItem[], days: number): AdvanceResult {
  const inFlight: NewsItem[] = [];
  const arrived: NewsItem[] = [];

  for (const item of items) {
    const left = item.daysLeft - Math.max(0, days);
    if (left <= 0) arrived.push({ ...item, daysLeft: 0 });
    else inFlight.push({ ...item, daysLeft: left });
  }

  return { inFlight, arrived };
}

// ---------------------------------------------------------------------------
// Tới nơi
// ---------------------------------------------------------------------------

function fillTemplate(
  template: string,
  fields: { chuThe: string; mucTieu: string; noi: string; so: string; nam: string },
): string {
  return template
    .replace(/\{chuThe\}/g, fields.chuThe)
    .replace(/\{mucTieu\}/g, fields.mucTieu)
    .replace(/\{noi\}/g, fields.noi)
    .replace(/\{so\}/g, fields.so)
    .replace(/\{nam\}/g, fields.nam)
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function groupThousands(value: number): string {
  return Math.round(value).toLocaleString('vi-VN').replace(/ /g, '.');
}

/**
 * Một vùng "gần đúng" để kể sai chỗ.
 *
 * Kể sai sang một nơi ở đầu kia châu lục thì người chơi phát hiện ngay và cả cơ
 * chế thành trò đùa. Sai sang hàng xóm thì đúng kiểu sai của người kể lại — và
 * người chơi phải thật sự cân nhắc mới biết mình đang bị kể sai.
 */
function nearbyRegion(rng: Rng, regionId: string): string {
  const anchor = anchorOf(regionId);
  if (anchor === null) return regionId;
  // Hàng xóm trên chính đồ thị tuyến đường: chúng luôn là những nơi mà người kể
  // lại vừa đi qua, nên nhầm sang chúng là kiểu nhầm hợp lý nhất.
  const candidates = edgesFrom(anchor).map((edge) => edge.to);
  if (candidates.length === 0) return regionId;
  return rng.pick(candidates);
}

export interface DeliverInput {
  event: WorldEvent;
  item: NewsItem;
  arrivedAt: GameDate;
  names?: NameBook;
}

/**
 * Biến một tin vừa tới thành DÒNG CHỮ NGƯỜI CHƠI ĐỌC.
 *
 * Đây là chỗ duy nhất trong cả dự án mà engine cố ý viết ra một điều KHÔNG ĐÚNG
 * với state. Nó hợp lệ vì `WorldEvent` vẫn giữ nguyên sự thật, và mọi công thức
 * đều đọc `WorldEvent` chứ không đọc dòng này — người chơi và AI kể chuyện là
 * hai bên duy nhất đọc nó, và cả hai ĐƯỢC PHÉP tin nhầm.
 */
export function deliverNews(rng: Rng, input: DeliverInput): ArrivedNews {
  const { event, item, arrivedAt } = input;
  const names = input.names ?? DEFAULT_NAMES;
  const config = newsConfig();
  const carrier = carrierOf(item.carrierId);

  const flipped = item.flipped;
  const actorId = flipped ? event.targetId : event.actorId;
  const targetId = flipped ? event.actorId : event.targetId;
  const placeId = hasKind(item, 'dia-danh') ? nearbyRegion(rng, event.regionId) : event.regionId;
  const amount = Math.round(event.amount * item.numberFactor);

  const wrongPerson = hasKind(item, 'nhan-vat');
  const lostDetail = hasKind(item, 'chi-tiet');

  const template = rng.pick([...templatesFor(event.kind)]);
  const body = fillTemplate(template, {
    chuThe: wrongPerson ? `một người nhà ${names.actor(actorId)}` : names.actor(actorId),
    mucTieu: names.actor(targetId),
    noi: names.place(placeId),
    so: amount > 0 ? groupThousands(amount) : '',
    nam: String(event.occurredAt.year),
  });

  // Tin nguyên vẹn thì dùng nguyên văn của biến cố — với mức 4–5 đó là đoạn văn
  // LLM đã viết ở `text.ts`, và viết lại nó từ mẫu là vứt đi thứ vừa mua bằng
  // một request. Tin đã méo thì phải dựng lại từ mẫu, vì không có cách nào bóp
  // méo một đoạn văn xuôi mà không thành ra vô nghĩa.
  const pristine = item.distortions.length === 0 && event.text !== '';
  let text = pristine ? event.text : body;

  if (!pristine) {
    const hedge = item.accuracy < config.rumourBelow ? rng.pick([...hedges()]) : '';
    if (hedge !== '') text = `${hedge} ${text.charAt(0).toLowerCase()}${text.slice(1)}`;
    if (hasKind(item, 'them-thao')) text = `${text} Và ${rng.pick([...omens()])}.`;
    if (lostDetail) text = text.split('.')[0]?.concat('.') ?? text;
  }

  const daysLate = item.daysTotal;
  const from = names.place(item.originRegionId);
  const source = carrier === null ? from : `${carrier.name} từ ${from}`;

  return {
    id: item.id,
    eventId: event.id,
    kind: event.kind,
    importance: event.importance,
    scope: event.scope,
    arrivedAt,
    occurredAt: event.occurredAt,
    source,
    daysLate,
    confidence: item.accuracy,
    text,
    headline: pristine && event.headline !== '' ? event.headline : text.split('.')[0] ?? text,
    distortions: [...item.distortions],
    read: false,
    regionId: event.regionId,
  };
}

/** Ngày dự kiến tới nơi — tab Debug và bảng "tin đang trên đường" đọc nó. */
export function arrivalDate(item: NewsItem, now: GameDate): GameDate {
  return addDays(now, item.daysLeft);
}

/** Tên hiển thị của một loại người đưa tin, cho UI. */
export function carrierName(id: string): string {
  return carrierOf(id)?.name ?? id;
}

/** Mọi loại người đưa tin — bảng lọc của dòng tin đọc nó. */
export function allCarriers(): readonly Carrier[] {
  return carriers();
}
