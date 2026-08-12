/**
 * MỘT NĂM CỦA CHÂU LỤC — nơi tám bàn cờ, bảng dân số, bản đồ tôn giáo và ma trận
 * quan hệ gặp nhau.
 *
 * THỨ TỰ SÁU BƯỚC LÀ MỘT HỢP ĐỒNG, không phải một tình cờ:
 *
 *   1. quan hệ       chiến tranh, hòa ước, đất đổi chủ — TRƯỚC, để minigame biết
 *                    năm nay mình đang đánh ai và thắng thua ra sao
 *   2. minigame      tám bảng chạy độc lập, mỗi bảng chỉ đọc `MinigameContext`
 *   3. dội           tuyên bố lớn của bước 2 chảy sang các nước khác qua data
 *   4. dân số        chính sách, oán hận, nổi dậy sắc tộc, và DÒNG DI DÂN
 *   5. tôn giáo      dị giáo lớn theo tiếng vọng khủng hoảng, Giáo hội đáp lại
 *   6. dòng thời gian  gom mọi biến cố, phát ra eventbus cho Phần 15
 *
 * Bước 1 đứng trước bước 2 vì một minigame không được phép tự quyết mình vừa
 * thắng trận nào — nếu Đế quốc Orc tự tuyên bố chinh phục thì Đông La Mã sẽ mất
 * đất mà không có ai đánh nó, và cả ma trận quan hệ thành trang trí.
 *
 * Bước 4 đứng sau bước 2 vì chính sách với thiểu số là quyết định của minigame
 * (Orc trọng dụng, Frank truy bức), còn hệ quả của chính sách thì chung cho cả
 * tám — đó là ranh giới giữa "lối chơi riêng" và "hệ thống bắt buộc" của mục 3.
 */

import type { Rng } from '@/core/rng';
import { minigameOf } from '@/nations';
import { powerName, rippleOf, spreadConfig } from './data';
import { advanceDemographics, pickDestination, receiveMigrants, type Departure } from './demographics';
import { emitWorldEvents, internalEvent } from './events';
import {
  advanceReligionYear,
  dominantFaith,
  pushCrisis,
  respondToHeresy,
  shift,
  type FaithArea,
  type HeresyEcho,
} from './religion';
import { adjustRelation, advanceRelationsYear, applyRipple } from './relations';
import type { NationsSliceState, ReligionsSliceState } from './slice';
import type { AccessTier, ExileCommunity, MinigameContext, PowerState, RelationRow, WorldEvent } from './types';

/** Dòng RNG riêng của tầng thế giới (R3): số lần tung một năm đổi theo cách chơi. */
export const NATIONS_STREAM = 'nations';

export interface WorldYearInput {
  nations: NationsSliceState;
  religions: ReligionsSliceState;
  year: number;
  /** Tầng tiếp cận của người chơi với từng thế lực. Thiếu thì coi như chỉ quan sát. */
  tiers?: Readonly<Record<string, AccessTier>>;
  /** Khủng hoảng từ ngoài đưa vào: đói kém của Phần 13, dịch bệnh của Phần 15. */
  crises?: readonly string[];
}

export interface WorldYearReport {
  nations: NationsSliceState;
  religions: ReligionsSliceState;
  /** Biến cố trong năm, mới nhất ở cuối. Đã phát ra eventbus. */
  events: WorldEvent[];
  lines: string[];
}

const TIMELINE_LIMIT = 400;

export function advanceWorldYear(rng: Rng, input: WorldYearInput): WorldYearReport {
  const { year } = input;
  const lines: string[] = [];
  const events: WorldEvent[] = [];
  let powers: PowerState[] = input.nations.powers.map((power) => ({ ...power }));
  let relations: RelationRow[] = input.nations.relations.map((row) => ({ ...row }));
  let exiles: ExileCommunity[] = [...input.nations.exiles];
  let echoes: HeresyEcho[] = [...input.religions.echoes];
  let areas: FaithArea[] = input.religions.areas.map((area) => ({ areaId: area.areaId, mix: area.mix.map((row) => ({ ...row })) }));

  const alive = (): PowerState[] => powers.filter((power) => !power.fallen);
  const churchPrestige = churchPrestigeOf(powers, input.religions);

  // --- 1. QUAN HỆ -----------------------------------------------------------
  const relationYear = advanceRelationsYear(rng, relations, alive(), year);
  relations = relationYear.rows;
  lines.push(...relationYear.lines);
  events.push(...relationYear.events);

  const won = new Map<string, number>();
  const lost = new Map<string, number>();
  for (const conquest of relationYear.conquests) {
    won.set(conquest.winner, (won.get(conquest.winner) ?? 0) + 1);
    lost.set(conquest.loser, (lost.get(conquest.loser) ?? 0) + 1);
  }

  // Đất đổi chủ ngay ở bước 1, để bước 2 nhìn thấy bản đồ đúng của năm nay.
  powers = powers.map((power) => {
    const gained = won.get(power.id) ?? 0;
    const shed = lost.get(power.id) ?? 0;
    if (gained === 0 && shed === 0) return power;
    return { ...power, land: Math.max(0, power.land + gained - shed) };
  });

  // Vũ khí thiêng đang treo trên đầu ai — đọc từ bảng Giáo triều của NĂM TRƯỚC.
  const sanctions = sanctionsFrom(powers);
  const alarms = heresyAlarmsOf(areas);
  const dominantFaiths: Record<string, string> = {};
  for (const area of areas) {
    if (area.areaId.startsWith('nation_')) dominantFaiths[area.areaId] = dominantFaith(area);
  }

  // --- 2. TÁM MINIGAME ------------------------------------------------------
  const crisisTriggers = new Set<string>(input.crises ?? []);
  const heresyResponses: { areaId: string; responseId: string }[] = [];
  const issued: { sourceId: string; targetId: string; kind: string }[] = [];

  powers = powers.map((power) => {
    if (power.fallen) return power;
    const context: MinigameContext = {
      power,
      year,
      relations,
      churchPrestige,
      tier: input.tiers?.[power.id] ?? 'quan-sat',
      atWar: relations.some((row) => row.atWar && (row.a === power.id || row.b === power.id)),
      campaignsWon: won.get(power.id) ?? 0,
      campaignsLost: lost.get(power.id) ?? 0,
      powerIds: alive().map((row) => row.id),
      sanctions: sanctions.get(power.id) ?? { excommunicated: false, interdict: false },
      heresyAlarms: alarms,
      dominantFaiths,
    };

    const report = minigameOf(power.minigame).year(rng, context);
    lines.push(...report.lines.map((line) => `[${powerName(power.id)}] ${line}`));
    events.push(...report.events);
    for (const trigger of report.crisisTriggers ?? []) crisisTriggers.add(trigger);
    if (report.heresyResponse !== undefined) heresyResponses.push(report.heresyResponse);
    for (const sanction of report.sanctionsIssued ?? []) {
      issued.push({ sourceId: power.id, targetId: sanction.targetId, kind: sanction.kind });
    }

    return applyDeltas({ ...power, board: report.board }, report.deltas, report.fallen ?? false, year, events, lines);
  });

  // --- 3. DỘI SANG NHAU -----------------------------------------------------
  for (const sanction of issued) {
    const outcome = applyRipple({
      rippleId: 'ripple_va-tuyet-thong',
      year,
      sourceId: sanction.sourceId,
      targetId: sanction.targetId,
      powers: alive(),
      rows: relations,
    });
    powers = applyRippleDeltas(powers, outcome.deltas);
    for (const shift of outcome.relationShifts) relations = adjustRelation(relations, shift.a, shift.b, shift.delta);
    events.push(outcome.event);
    lines.push(...outcome.lines);
  }

  // Dòng dội của các tuyên bố khác: mỗi biến cố `chau-luc` có `rippleId` khai sẵn
  // thì chạy đúng bảng data, không có thì chỉ nằm trong dòng thời gian.
  for (const event of [...events]) {
    if (event.rippleId === '' || rippleOf(event.rippleId) === null) continue;
    const outcome = applyRipple({
      rippleId: event.rippleId,
      year,
      sourceId: event.powerId,
      powers: alive(),
      rows: relations,
    });
    powers = applyRippleDeltas(powers, outcome.deltas);
    for (const trigger of outcome.heresyTriggers) crisisTriggers.add(trigger);
  }

  // --- 4. DÂN SỐ VÀ DÒNG DI DÂN ---------------------------------------------
  const departures: Departure[] = [];
  powers = powers.map((power) => {
    if (power.fallen) return power;
    const report = advanceDemographics(rng, power, year);
    lines.push(...report.lines.map((line) => `[${powerName(power.id)}] ${line}`));
    departures.push(...report.departures);
    for (const revolt of report.revolts) {
      if (revolt.risk >= 50) {
        events.push(
          internalEvent(power.id, year, `Nhóm ${revolt.raceId} ở ${powerName(power.id)} đã tới sát ngưỡng nổi dậy (${String(revolt.risk)}%).`),
        );
      }
    }
    return {
      ...power,
      groups: report.groups,
      treasury: power.treasury + report.treasury,
      stability: clampMeter(power.stability + report.stability),
      dominantMood: clampMeter(power.dominantMood + report.dominantMood),
    };
  });

  const migration = spreadConfig().migration;
  for (const departure of departures) {
    const destinationId = pickDestination(departure, alive(), relations);
    if (destinationId === '') continue;
    const host = powers.find((power) => power.id === destinationId);
    if (host === undefined) continue;

    const received = receiveMigrants(host, departure, year);
    powers = powers.map((power) => (power.id === destinationId ? received.power : power));
    exiles = [...exiles, received.exile];
    lines.push(received.line);
    // Chỉ một LÀN SÓNG mới là chuyện của châu lục. Vài nghìn người đi lẻ mỗi năm
    // vẫn được ghi vào nhật ký của nước ấy, nhưng đẩy tất cả ra dòng thời gian thì
    // sáu chục năm sẽ chỉ còn là một danh sách di dân, và mọi biến cố khác chìm.
    if (departure.people >= 14000) {
      events.push({
        id: `di-cu-${departure.raceId}-${departure.fromPowerId}-${String(year)}`,
        year,
        powerId: departure.fromPowerId,
        rippleId: 'ripple_di-cu',
        text: `Cộng đồng ${departure.raceId} chạy khỏi ${powerName(departure.fromPowerId)} sang ${powerName(destinationId)}.`,
        scope: 'chau-luc',
        targets: [destinationId],
      });
    }

    // NGƯỜI ĐI MANG CẢ NHÀ THỜ CỦA HỌ ĐI THEO. Đây là vế thứ hai của mục 3 mà
    // rất dễ quên: nước B nhận được nhân lực, kỹ năng — và một cộng đồng đức tin
    // mới, thứ mà năm chục năm sau sẽ là một vấn đề của chính nước B.
    const fromArea = areas.find((row) => row.areaId === departure.fromPowerId);
    const toArea = areas.find((row) => row.areaId === destinationId);
    if (fromArea !== undefined && toArea !== undefined) {
      const faith = dominantFaith(fromArea);
      const moved = ((departure.people / 1000) * migration.sharePerThousandArrivals) / 100;
      const shifted = shift(toArea, dominantFaith(toArea), faith, moved);
      areas = areas.map((row) => (row.areaId === destinationId ? shifted : row));
    }
  }

  // --- 5. TÔN GIÁO ----------------------------------------------------------
  for (const trigger of crisisTriggers) {
    echoes = pushCrisis(echoes, trigger);
    lines.push(`Khủng hoảng "${trigger}" đẩy một tiếng vọng vào bản đồ tôn giáo.`);
  }

  for (const response of heresyResponses) {
    const area = areas.find((row) => row.areaId === response.areaId);
    if (area === undefined) continue;
    const result = respondToHeresy(area, response.responseId, churchPrestige);
    areas = areas.map((row) => (row.areaId === area.areaId ? result.area : row));
    lines.push(result.line);
    powers = powers.map((power) =>
      power.id === 'nation_giao-trieu'
        ? { ...power, treasury: power.treasury - result.cost, prestige: clampMeter(power.prestige + result.prestige) }
        : power,
    );
  }

  const religionYear = advanceReligionYear(rng, { areas, echoes, churchPrestige, year });
  areas = religionYear.areas;
  echoes = religionYear.echoes;
  lines.push(...religionYear.lines);

  // --- 6. DÒNG THỜI GIAN ----------------------------------------------------
  const timeline = [...input.nations.timeline, ...events].slice(-TIMELINE_LIMIT);
  emitWorldEvents(events.filter((event) => event.scope === 'chau-luc'));

  return {
    nations: {
      ...input.nations,
      powers,
      relations,
      timeline,
      exiles,
    },
    religions: {
      ...input.religions,
      areas,
      echoes,
      prestige: { ...input.religions.prestige, 'rel_giao-hoi': churchPrestigeOf(powers, input.religions) },
    },
    events,
    lines,
  };
}

/** Cộng kết quả một năm của minigame vào bảy con số chung. */
function applyDeltas(
  power: PowerState,
  deltas: { treasury?: number; income?: number; prestige?: number; stability?: number; cohesion?: number; military?: number; land?: number },
  fallen: boolean,
  year: number,
  events: WorldEvent[],
  lines: string[],
): PowerState {
  const next: PowerState = {
    ...power,
    treasury: power.treasury + (deltas.treasury ?? 0),
    income: Math.max(0, power.income + (deltas.income ?? 0)),
    prestige: clampMeter(power.prestige + (deltas.prestige ?? 0)),
    stability: clampMeter(power.stability + (deltas.stability ?? 0)),
    cohesion: clampMeter(power.cohesion + (deltas.cohesion ?? 0)),
    military: clampMeter(power.military + (deltas.military ?? 0)),
    land: Math.max(0, power.land + (deltas.land ?? 0)),
    fallen: power.fallen || fallen,
  };

  if (fallen && !power.fallen) {
    lines.push(`${powerName(power.id)} sụp đổ trong năm ${String(year)}.`);
    events.push({
      id: `sup-${power.id}-${String(year)}`,
      year,
      powerId: power.id,
      rippleId: '',
      text: `${powerName(power.id)} sụp đổ.`,
      scope: 'chau-luc',
      targets: [],
    });
  }
  return next;
}

function applyRippleDeltas(powers: readonly PowerState[], deltas: ReadonlyMap<string, Partial<PowerState>>): PowerState[] {
  return powers.map((power) => {
    const delta = deltas.get(power.id);
    if (delta === undefined) return power;
    return {
      ...power,
      treasury: power.treasury + (delta.treasury ?? 0),
      income: Math.max(0, power.income + (delta.income ?? 0)),
      prestige: clampMeter(power.prestige + (delta.prestige ?? 0)),
      stability: clampMeter(power.stability + (delta.stability ?? 0)),
      cohesion: clampMeter(power.cohesion + (delta.cohesion ?? 0)),
      military: clampMeter(power.military + (delta.military ?? 0)),
      land: Math.max(0, power.land + (delta.land ?? 0)),
    };
  });
}

/**
 * Uy tín Giáo hội = uy tín thiêng liêng trên bảng Giáo triều.
 *
 * MỘT nguồn sự thật, và nó nằm ở bảng của người sở hữu nó. Bản đồ tôn giáo chỉ
 * chép lại để Phần 15 đọc mà không phải mở bảng nào.
 */
function churchPrestigeOf(powers: readonly PowerState[], religions: ReligionsSliceState): number {
  const papacy = powers.find((power) => power.board.kind === 'mat-nghi');
  if (papacy?.board.kind === 'mat-nghi') return papacy.board.spiritualPrestige;
  return religions.prestige['rel_giao-hoi'] ?? 60;
}

function sanctionsFrom(powers: readonly PowerState[]): Map<string, { excommunicated: boolean; interdict: boolean }> {
  const map = new Map<string, { excommunicated: boolean; interdict: boolean }>();
  const papacy = powers.find((power) => power.board.kind === 'mat-nghi');
  if (papacy?.board.kind !== 'mat-nghi') return map;
  for (const id of papacy.board.excommunicated) map.set(id, { excommunicated: true, interdict: false });
  for (const id of papacy.board.interdicts) map.set(id, { excommunicated: true, interdict: true });
  return map;
}

/** Vùng có dị giáo vượt ngưỡng — Giáo triều đọc bảng này để chọn phản ứng. */
function heresyAlarmsOf(areas: readonly FaithArea[]): { areaId: string; share: number }[] {
  const alarms: { areaId: string; share: number }[] = [];
  for (const area of areas) {
    const share = area.mix
      .filter((row) => row.religionId.startsWith('rel_di-giao'))
      .reduce((sum, row) => sum + row.share, 0);
    if (share >= 0.12) alarms.push({ areaId: area.areaId, share: Math.round(share * 1000) / 1000 });
  }
  return alarms.sort((left, right) => right.share - left.share);
}

function clampMeter(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value * 10) / 10));
}
