/**
 * QUAN HỆ GIỮA CÁC THẾ LỰC — Phần 14 mục 6.
 *
 * Hai nửa, và nửa thứ hai mới là lý do phần này tồn tại:
 *
 *   1. MA TRẬN — quan hệ, chiến tranh, liên minh, hôn nhân, yêu sách, cấm vận.
 *   2. DỘI SANG NHAU — sự kiện ở một thế lực phải dội sang thế lực khác.
 *
 * Câu mẫu của mục 6 chạy được nguyên văn qua bảng `ripples` của
 * `data/diplomacy.json`: Giáo hoàng ra vạ với Hoàng đế → chư hầu Đế quốc được cởi
 * lời thề → Frank thừa cơ lấn đất → Thành bang cho cả hai bên vay tiền và lời to.
 *
 * QUAN HỆ TRÔI VỀ MỨC NỀN, YÊU SÁCH THÌ KHÔNG. Đây là ranh giới giữa "đang giận"
 * và "có quyền": một lần phản bội nguôi đi sau vài năm, nhưng một tờ yêu sách thì
 * nằm trong hòm và con cháu vẫn lôi ra được.
 *
 * `exportForPart15` là lời hứa cuối mục 6 — Phần 14 không mô phỏng thế giới, nó
 * chỉ phải xuất ra đủ dữ liệu để Phần 15 làm việc ấy.
 */

import type { Rng } from '@/core/rng';
import { diplomacyConfig, powerName, relationBandFor, relationSeeds, rippleOf, ripples, treatyOf } from './data';
import type { PowerState, RelationRow, WorldEvent } from './types';

export class RelationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RelationError';
  }
}

function orderPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

/** Ma trận khởi đầu: mọi cặp thế lực đều có một dòng, kể cả cặp chưa quen biết. */
export function seedRelations(powerIds: readonly string[]): RelationRow[] {
  const seeds = new Map<string, { value: number; claim: boolean }>();
  for (const seed of relationSeeds()) {
    const [a, b] = orderPair(seed.a, seed.b);
    seeds.set(`${a}|${b}`, { value: seed.value, claim: seed.claim });
  }

  const rows: RelationRow[] = [];
  const sorted = [...powerIds].sort();
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const a = sorted[i];
      const b = sorted[j];
      if (a === undefined || b === undefined) continue;
      const seed = seeds.get(`${a}|${b}`) ?? { value: 0, claim: false };
      rows.push({
        a,
        b,
        value: seed.value,
        base: seed.value,
        claim: seed.claim,
        atWar: false,
        warYears: 0,
        exhaustion: 0,
        treaties: [],
      });
    }
  }
  return rows;
}

export function relationRow(rows: readonly RelationRow[], a: string, b: string): RelationRow | null {
  const [x, y] = orderPair(a, b);
  return rows.find((row) => row.a === x && row.b === y) ?? null;
}

export function relationBetween(rows: readonly RelationRow[], a: string, b: string): number {
  return relationRow(rows, a, b)?.value ?? 0;
}

export function adjustRelation(rows: readonly RelationRow[], a: string, b: string, delta: number): RelationRow[] {
  const config = diplomacyConfig();
  const [x, y] = orderPair(a, b);
  return rows.map((row) =>
    row.a === x && row.b === y
      ? { ...row, value: Math.max(config.relationMin, Math.min(config.relationMax, row.value + delta)) }
      : row,
  );
}

/** Ký hiệp ước. Hôn ước và triều cống cũng đi qua đây — chúng là hiệp ước có giá. */
export function signTreaty(rows: readonly RelationRow[], a: string, b: string, treatyId: string): { rows: RelationRow[]; line: string } {
  const treaty = treatyOf(treatyId);
  if (treaty === null) throw new RelationError(`hiệp ước "${treatyId}" chưa khai trong data/diplomacy.json`);
  const [x, y] = orderPair(a, b);
  const next = rows.map((row) =>
    row.a === x && row.b === y
      ? {
          ...row,
          value: Math.min(diplomacyConfig().relationMax, row.value + treaty.relation),
          treaties: [...row.treaties.filter((entry) => entry.id !== treatyId), { id: treatyId, yearsLeft: treaty.years }],
        }
      : row,
  );
  return { rows: next, line: `${powerName(a)} và ${powerName(b)} ký ${treaty.name}.` };
}

export function breakTreaty(rows: readonly RelationRow[], a: string, b: string, treatyId: string): { rows: RelationRow[]; prestige: number; line: string } {
  const treaty = treatyOf(treatyId);
  if (treaty === null) throw new RelationError(`hiệp ước "${treatyId}" chưa khai`);
  const [x, y] = orderPair(a, b);
  const next = rows.map((row) =>
    row.a === x && row.b === y
      ? {
          ...row,
          value: Math.max(diplomacyConfig().relationMin, row.value + treaty.breakRelation),
          treaties: row.treaties.filter((entry) => entry.id !== treatyId),
        }
      : row,
  );
  return { rows: next, prestige: treaty.breakPrestige, line: `${powerName(a)} xé ${treaty.name} với ${powerName(b)}.` };
}

export function declareWar(rows: readonly RelationRow[], a: string, b: string): { rows: RelationRow[]; line: string } {
  const config = diplomacyConfig();
  const [x, y] = orderPair(a, b);
  return {
    rows: rows.map((row) =>
      row.a === x && row.b === y
        ? { ...row, atWar: true, warYears: 0, exhaustion: 0, value: Math.max(config.relationMin, row.value + config.war.relationOnDeclare) }
        : row,
    ),
    line: `${powerName(a)} tuyên chiến với ${powerName(b)}.`,
  };
}

/** Yêu sách: một tờ giấy, và nó KHÔNG trôi. */
export function pressClaim(rows: readonly RelationRow[], a: string, b: string): RelationRow[] {
  const [x, y] = orderPair(a, b);
  return rows.map((row) =>
    row.a === x && row.b === y
      ? { ...row, claim: true, value: Math.max(diplomacyConfig().relationMin, row.value + diplomacyConfig().claims.relationPenalty) }
      : row,
  );
}

/** Số năm vây hãm liên tục trước khi mảnh đất cuối cùng của một thế lực đổi chủ. */
const SIEGE_YEARS_FOR_LAST_LAND = 5;

export interface RelationsYearReport {
  rows: RelationRow[];
  events: WorldEvent[];
  /** Đất đổi chủ trong năm: `{ winner, loser }`. Tầng thế giới cộng vào `land`. */
  conquests: { winner: string; loser: string }[];
  lines: string[];
}

/**
 * MỘT NĂM của ma trận.
 *
 * Thứ tự: hiệp ước hết hạn → quan hệ trôi → chiến tranh đang chạy → chiến tranh
 * mới. Chiến tranh đang chạy xử TRƯỚC khi tung chiến tranh mới, nếu không thì một
 * cặp vừa hòa xong có thể đánh nhau lại ngay trong cùng một năm.
 */
export function advanceRelationsYear(
  rng: Rng,
  rows: readonly RelationRow[],
  powers: readonly PowerState[],
  year: number,
): RelationsYearReport {
  const config = diplomacyConfig();
  const lines: string[] = [];
  const events: WorldEvent[] = [];
  const conquests: { winner: string; loser: string }[] = [];
  const alive = new Map(powers.map((power) => [power.id, power]));

  const next = rows.map((row) => {
    const left = alive.get(row.a);
    const right = alive.get(row.b);
    if (left === undefined || right === undefined) return row;

    let updated: RelationRow = {
      ...row,
      treaties: row.treaties.map((entry) => ({ ...entry, yearsLeft: entry.yearsLeft === 0 ? 0 : entry.yearsLeft - 1 })).filter((entry) => entry.yearsLeft !== -1),
    };

    // Trôi về mức nền — trừ khi đang đánh nhau, lúc ấy không ai nguôi.
    if (!updated.atWar) {
      const gap = updated.base - updated.value;
      const step = Math.sign(gap) * Math.min(Math.abs(gap), config.driftToBasePerYear);
      updated = { ...updated, value: updated.value + step };
    }

    if (updated.atWar) {
      const warYears = updated.warYears + 1;
      const exhaustion = updated.exhaustion + config.war.warExhaustionPerYear;

      // Ai mạnh hơn thì thắng thế trong năm, nhưng không phải năm nào cũng có đất
      // đổi chủ — chiến tranh trung cổ phần lớn là hành quân và vây hãm.
      const edge = left.military + left.prestige / 4 - (right.military + right.prestige / 4);
      const roll = rng.int(1, 100);
      if (roll <= 30 + Math.abs(edge) / 3) {
        const winner = edge >= 0 ? left : right;
        const loser = edge >= 0 ? right : left;

        // KINH ĐÔ KHÔNG RƠI VÌ MỘT CUỘC CƯỚP PHÁ. Mảnh đất cuối cùng của một thế
        // lực là chỗ có tường dày nhất và có mọi thứ nó còn lại đứng sau tường
        // ấy; lấy nó đòi một cuộc VÂY HÃM, và vây hãm đo bằng năm chứ không bằng
        // một cú tung. Không có luật này thì Đông La Mã mất kinh đô trong tám
        // năm, và cả minigame của mục 2.2 — nội chiến, cầu viện, hội đồng trường
        // sinh — không kịp xảy ra một lần nào.
        if (loser.land <= 1 && updated.warYears < SIEGE_YEARS_FOR_LAST_LAND) {
          lines.push(`${powerName(winner.id)} thắng ngoài đồng, nhưng tường thành ${powerName(loser.id)} vẫn đứng.`);
        } else {
          conquests.push({ winner: winner.id, loser: loser.id });
          lines.push(`${powerName(winner.id)} thắng một chiến dịch trước ${powerName(loser.id)}.`);
        }
      }

      if (warYears >= config.war.yearsMin && exhaustion >= config.war.exhaustionPeaceAt) {
        lines.push(`${powerName(row.a)} và ${powerName(row.b)} nghị hòa sau ${String(warYears)} năm — cả hai đều kiệt.`);
        events.push({
          id: `hoa-${row.a}-${row.b}-${String(year)}`,
          year,
          powerId: row.a,
          rippleId: '',
          text: `${powerName(row.a)} và ${powerName(row.b)} nghị hòa.`,
          scope: 'chau-luc',
          targets: [row.b],
        });
        return { ...updated, atWar: false, warYears: 0, exhaustion: 0, value: Math.min(config.relationMax, updated.value + 10) };
      }
      return { ...updated, warYears, exhaustion };
    }

    // Chiến tranh mới. Yêu sách là lý do chính đáng, và nó nhân xác suất lên.
    const band = relationBandFor(updated.value);
    const chance = band.warChancePerYear * (updated.claim ? 1 + config.claims.warJustification / 100 : 1);
    const hasTruce = updated.treaties.some((entry) => {
      const treaty = treatyOf(entry.id);
      return treaty !== null && !treaty.callToArms && treaty.relation > 0;
    });
    if (!hasTruce && chance > 0 && rng.next() * 100 < chance) {
      // AI TUYÊN CHIẾN VỚI AI KHÔNG PHẢI CHUYỆN THỨ TỰ CHỮ CÁI. Kẻ mạnh hơn ra tay
      // trước, trừ khi kẻ yếu hơn là kẻ đang giữ yêu sách — một đế quốc hấp hối
      // vẫn đi đòi tỉnh của mình, nhưng nó không đi gây sự với người ngoài.
      const aggressor = left.military + left.prestige / 3 >= right.military + right.prestige / 3 ? left : right;
      const defender = aggressor.id === left.id ? right : left;
      lines.push(`${powerName(aggressor.id)} và ${powerName(defender.id)} rơi vào chiến tranh.`);
      events.push({
        id: `chien-${row.a}-${row.b}-${String(year)}`,
        year,
        powerId: aggressor.id,
        rippleId: '',
        text: `${powerName(aggressor.id)} tuyên chiến với ${powerName(defender.id)}.`,
        scope: 'chau-luc',
        targets: [defender.id],
      });
      return { ...updated, atWar: true, warYears: 0, exhaustion: 0, value: Math.max(config.relationMin, updated.value + config.war.relationOnDeclare) };
    }

    return updated;
  });

  return { rows: next, events, conquests, lines };
}

// ---------------------------------------------------------------------------
// Dội sang nhau (mục 6)
// ---------------------------------------------------------------------------

export type CoreDelta = Partial<Pick<PowerState, 'treasury' | 'income' | 'prestige' | 'stability' | 'cohesion' | 'military' | 'land'>>;

export interface RippleOutcome {
  event: WorldEvent;
  /** Thay đổi cộng dồn cho từng thế lực. */
  deltas: Map<string, CoreDelta>;
  relationShifts: { a: string; b: string; delta: number }[];
  /** Khủng hoảng cần đẩy vào bản đồ tôn giáo — `religion.pushCrisis` nhận id này. */
  heresyTriggers: string[];
  lines: string[];
}

export interface RippleInput {
  rippleId: string;
  year: number;
  sourceId: string;
  targetId?: string;
  /** Điền vào `{…}` của câu trong data. */
  slots?: Readonly<Record<string, string>>;
  powers: readonly PowerState[];
  rows: readonly RelationRow[];
}

/**
 * ÁP MỘT DÒNG DỘI.
 *
 * Không hàm nào ở đây tự quyết định hệ quả: mọi con số đến từ `data/diplomacy.json`
 * (R5). Vì thế thêm một chuỗi phản ứng mới cho Phần 15 là thêm một dòng data, và
 * KHÔNG phải sửa file này.
 */
export function applyRipple(input: RippleInput): RippleOutcome {
  const ripple = rippleOf(input.rippleId);
  if (ripple === null) throw new RelationError(`dòng dội "${input.rippleId}" chưa khai trong data/diplomacy.json`);

  const deltas = new Map<string, CoreDelta>();
  const relationShifts: { a: string; b: string; delta: number }[] = [];
  const heresyTriggers: string[] = [];
  const lines: string[] = [];
  const targets: string[] = [];

  const add = (powerId: string, delta: CoreDelta): void => {
    const current = deltas.get(powerId) ?? {};
    for (const [key, value] of Object.entries(delta)) {
      const field = key as keyof CoreDelta;
      current[field] = (current[field] ?? 0) + (value ?? 0);
    }
    deltas.set(powerId, current);
  };

  add(input.sourceId, coreDeltaOf(ripple.sourceEffects));

  if (input.targetId !== undefined && input.targetId !== '') {
    targets.push(input.targetId);
    add(input.targetId, coreDeltaOf(ripple.targetEffects));
    const relationToTarget = numberAt(ripple.neighbourEffects, 'relationToTarget');
    const claimPressure = numberAt(ripple.neighbourEffects, 'claimPressure');
    if (relationToTarget !== 0 || claimPressure !== 0) {
      for (const power of input.powers) {
        if (power.id === input.targetId || power.id === input.sourceId || power.fallen) continue;
        if (relationToTarget !== 0) relationShifts.push({ a: power.id, b: input.targetId, delta: relationToTarget });
      }
    }
  }

  const relationToSource = numberAt(ripple.neighbourEffects, 'relationToSource');
  if (relationToSource !== 0) {
    for (const power of input.powers) {
      if (power.id === input.sourceId || power.fallen) continue;
      relationShifts.push({ a: power.id, b: input.sourceId, delta: relationToSource });
    }
  }

  const worldDelta = coreDeltaOf(ripple.worldEffects);
  if (Object.keys(worldDelta).length > 0) {
    for (const power of input.powers) {
      if (power.fallen) continue;
      add(power.id, worldDelta);
      targets.push(power.id);
    }
  }
  const trigger = stringAt(ripple.worldEffects, 'heresyTrigger');
  if (trigger !== '') heresyTriggers.push(trigger);

  const text = fill(ripple.text, {
    source: powerName(input.sourceId),
    target: input.targetId === undefined ? '' : powerName(input.targetId),
    ...(input.slots ?? {}),
  });
  lines.push(text);

  return {
    event: {
      id: `${ripple.id}-${String(input.year)}-${input.sourceId}`,
      year: input.year,
      powerId: input.sourceId,
      rippleId: ripple.id,
      text,
      scope: Object.keys(ripple.worldEffects).length > 0 || targets.length > 0 ? 'chau-luc' : 'noi-bo',
      targets: [...new Set(targets)],
    },
    deltas,
    relationShifts,
    heresyTriggers,
    lines,
  };
}

/** Dòng dội nào khai sẵn cho một loại biến cố — UI và Phần 15 tra bằng cái này. */
export function ripplesFrom(powerId: string): { id: string; event: string; note: string }[] {
  return ripples()
    .filter((ripple) => ripple.from === powerId || ripple.from === 'any')
    .map((ripple) => ({ id: ripple.id, event: ripple.event, note: ripple.note }));
}

/**
 * XUẤT DỮ LIỆU CHO PHẦN 15 (mục 6, câu cuối).
 *
 * Phần 15 cần đúng bốn thứ để mô phỏng ngầm: cán cân quyền lực, ai đang đánh ai,
 * ai đang có yêu sách với ai, và chuỗi phản ứng nào đang mở. Không xuất state
 * thô — xuất một bản tóm tắt ĐỌC ĐƯỢC, vì phần lớn nó sẽ đi thẳng vào prompt của
 * một model rẻ tiền.
 */
export function exportForPart15(
  powers: readonly PowerState[],
  rows: readonly RelationRow[],
  year: number,
): {
  year: number;
  balance: { powerId: string; name: string; weight: number }[];
  wars: { a: string; b: string; years: number }[];
  claims: { a: string; b: string }[];
  openRipples: { id: string; event: string }[];
} {
  const total = powers.reduce((sum, power) => sum + powerWeight(power), 0) || 1;
  return {
    year,
    balance: powers.map((power) => ({
      powerId: power.id,
      name: powerName(power.id),
      weight: Math.round((powerWeight(power) / total) * 1000) / 10,
    })),
    wars: rows.filter((row) => row.atWar).map((row) => ({ a: row.a, b: row.b, years: row.warYears })),
    claims: rows.filter((row) => row.claim).map((row) => ({ a: row.a, b: row.b })),
    openRipples: ripples().map((ripple) => ({ id: ripple.id, event: ripple.event })),
  };
}

/** Sức nặng của một thế lực trong cán cân châu lục. */
export function powerWeight(power: PowerState): number {
  if (power.fallen) return 0;
  return Math.max(0, power.land * 6 + power.military * 0.8 + power.income / 60 + power.prestige * 0.3);
}

function coreDeltaOf(effects: Readonly<Record<string, unknown>>): CoreDelta {
  const delta: CoreDelta = {};
  const fields: (keyof CoreDelta)[] = ['treasury', 'income', 'prestige', 'stability', 'cohesion', 'military', 'land'];
  for (const field of fields) {
    const value = effects[field];
    if (typeof value === 'number') delta[field] = value;
  }
  return delta;
}

function numberAt(effects: Readonly<Record<string, unknown>>, key: string): number {
  const value = effects[key];
  return typeof value === 'number' ? value : 0;
}

function stringAt(effects: Readonly<Record<string, unknown>>, key: string): string {
  const value = effects[key];
  return typeof value === 'string' ? value : '';
}

function fill(template: string, slots: Readonly<Record<string, string>>): string {
  return template.replace(/\{(\w+)\}/g, (_match, key: string) => slots[key] ?? `{${key}}`);
}
