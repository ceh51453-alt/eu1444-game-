/**
 * GÂY THƯƠNG TÍCH (Phần 7 mục 1 và 4) — engine tung, engine phán quyết.
 *
 * Ba đường vào, một cửa ra:
 *   `inflictFromCheck`  từ một `CheckResult` thua (Phần 9–11 gọi)
 *   `inflictRequest`    từ đề nghị của AI (mục 3, đã kiểm duyệt ở `events.ts`)
 *   `inflictInjury`     engine tự quyết hết — dùng cho hệ quả cơ học và cho test
 *
 * Cả ba đều đi qua `buildInjury`, nên không có đường nào nhét được vào state một
 * vết thương chưa qua bảng mức độ × loại × vùng. Đó là điều kiện để R1 còn
 * nghĩa: nếu AI mô tả "một nhát chí mạng" mà engine không tự chấm lại mức độ
 * thì AI vừa quyết một con số.
 *
 * Hàm ở đây KHÔNG ghi state. Chúng trả về `PatchOp[]`, và người gọi đưa qua MVU
 * với actor `engine` như mọi thay đổi khác (R2).
 */

import type { CheckResult, CheckTier } from '@/core/turn';
import type { Rng } from '@/core/rng';
import type { PatchOp } from '@/state/mvu-parse';
import type { GameState } from '@/state/slices';
import {
  causeFromText,
  causeOf,
  injuryTypeRow,
  severityName,
  severityRow,
  tierSeverityRange,
  type InjuryType,
} from './catalog';
import { allRegions, regionForRoll, regionOf, vitalOrgansOf, type BodyRegion } from './regions';
import { bodyOf, type BodyState, type Injury } from './slice';

// ---------------------------------------------------------------------------
// Vị trí trúng đòn (mục 1)
// ---------------------------------------------------------------------------

export interface HitOptions {
  /**
   * Vùng mà chiêu thức nhắm tới. Không bảo đảm trúng — `aimChance` mới quyết
   * định, và trượt thì rơi về bảng d100 bình thường.
   */
  aim?: string;
  aimChance?: number;
  /**
   * Hệ số nhân vào trọng số theo TƯ THẾ, khóa là id vùng hoặc id nhóm.
   *
   * Bảng tư thế thật thuộc về Phần 9 (đấu tay đôi) và Phần 10 (dã chiến) — nơi
   * biết thế nào là "địch nằm dưới đất" hay "ta ở trên lưng ngựa". Ở đây chỉ có
   * CƠ CHẾ nhận bảng đó; nhét sẵn một bảng tư thế vào Phần 7 là đoán mò thay
   * cho hai phần chưa làm.
   */
  postureBias?: Readonly<Record<string, number>>;
  /**
   * BẢN ĐỒ CHE PHỦ của Phần 16 mục 3–4: id vùng → phần trăm che phủ 0–100.
   *
   * Thay `coveredCells` của bản Phần 7, vốn chỉ biết một ô giáp "có" hoặc
   * "không". Ở đây một vùng che 85% và một vùng che 100% là hai chuyện khác
   * nhau, và cả cơ chế khe hở nằm trong khoảng chênh ấy.
   *
   * Phần 7 KHÔNG import gì từ Phần 16 — nó chỉ nhận một bảng số. Một vòng import
   * giữa hai hệ chạy lúc khởi động là loại lỗi chỉ nổ ở bản build production.
   */
  coverage?: Readonly<Record<string, number>>;
  /**
   * Số lần tung lại khi đòn rơi vào chỗ có giáp — mũi giáo trượt trên tấm thép
   * và đi tìm khớp. Xác suất trượt đúng bằng mức che phủ của vùng ấy, nên một
   * bộ giáp hở nhiều thì trượt ít.
   */
  rerollCovered?: number;
}

/** Xác suất chiêu thức nhắm trúng đúng vùng định nhắm, phần trăm. */
export const DEFAULT_AIM_CHANCE = 55;

function biasedPick(rng: Rng, bias: Readonly<Record<string, number>>): BodyRegion {
  const regions = allRegions();
  const weights = regions.map(
    (region) => region.hitWeight * (bias[region.id] ?? bias[region.group] ?? 1),
  );
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (total <= 0) return regionForRoll(rng.int(1, 100));

  let cursor = rng.next() * total;
  for (const [index, weight] of weights.entries()) {
    cursor -= weight;
    if (cursor < 0) {
      const region = regions[index];
      if (region !== undefined) return region;
    }
  }
  const last = regions[regions.length - 1];
  if (last === undefined) throw new Error('bảng vùng cơ thể rỗng');
  return last;
}

/**
 * Tung vị trí trúng đòn.
 *
 * Không có tư thế thì đi qua ĐÚNG bảng d100 của mục 1 (`rng.int(1,100)`), để
 * bài test phân phối kiểm được bảng thật chứ không kiểm một phép chọn có trọng
 * số tương đương-nhưng-không-giống.
 */
export function rollHitLocation(rng: Rng, options: HitOptions = {}): BodyRegion {
  const aimed = options.aim === undefined ? null : regionOf(options.aim);
  if (aimed !== null && rng.int(1, 100) <= (options.aimChance ?? DEFAULT_AIM_CHANCE)) {
    return aimed;
  }

  const bias = options.postureBias;
  const pick = (): BodyRegion =>
    bias === undefined || Object.keys(bias).length === 0
      ? regionForRoll(rng.int(1, 100))
      : biasedPick(rng, bias);

  let region = pick();
  const coverage = options.coverage;
  let rerolls = options.rerollCovered ?? 1;
  while (rerolls > 0 && coverage !== undefined && rng.int(1, 100) <= (coverage[region.id] ?? 0)) {
    region = pick();
    rerolls--;
  }
  return region;
}

// ---------------------------------------------------------------------------
// Loại và mức độ
// ---------------------------------------------------------------------------

/**
 * Loại thương tích, tung theo phân phối của nguyên nhân trong `data/injuries.json`.
 *
 * Nhận CẢ id lẫn lời: engine (Phần 9–11) biết đích danh `luoi-kiem`, còn AI gửi
 * "một nhát kiếm ngang sườn" và phải đi qua bộ khớp từ khóa của mục 3. Thử id
 * trước, vì id khớp chính xác thì không có gì để đoán.
 */
export function rollInjuryType(rng: Rng, causeText: string): InjuryType {
  const cause = causeOf(causeText) ?? causeFromText(causeText);
  const entries = Object.entries(cause.weights).filter(
    (entry): entry is [InjuryType, number] => typeof entry[1] === 'number' && entry[1] > 0,
  );
  if (entries.length === 0) return 'blunt';

  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let cursor = rng.next() * total;
  for (const [type, weight] of entries) {
    cursor -= weight;
    if (cursor < 0) return type;
  }
  return entries[0]?.[0] ?? 'blunt';
}

function rollRange(rng: Rng, range: readonly [number, number]): number {
  const low = Math.max(1, Math.min(5, Math.round(range[0])));
  const high = Math.max(low, Math.min(5, Math.round(range[1])));
  return rng.int(low, high);
}

/** Mức độ suy từ cấp kết quả kiểm định (Phần 5). */
export function severityFromTier(rng: Rng, tier: CheckTier): number {
  return rollRange(rng, tierSeverityRange(tier));
}

// ---------------------------------------------------------------------------
// Dựng vết thương
// ---------------------------------------------------------------------------

export interface InjurySpec {
  regionId: string;
  type: InjuryType;
  severity: number;
  source: string;
  turn: number;
  /** Vết do VŨ KHÍ BẠC gây ra (Phần 16 mục 6, Phần 14b mục D). */
  silver?: boolean;
}

/**
 * Một vết thương hoàn chỉnh từ mức độ × loại × vùng.
 *
 * Nhiễm trùng khởi điểm luôn là 0: vết thương không bẩn sẵn, nó bẩn DẦN. Cả
 * chuỗi của mục 7 — nhiễm trùng → sốt → hoại tử — chỉ đọc được nếu người chơi
 * nhìn thấy con số ấy bò lên qua từng lượt.
 */
export function buildInjury(rng: Rng, spec: InjurySpec, id: string): Injury {
  const region = regionOf(spec.regionId);
  if (region === null) throw new Error(`vùng cơ thể không tồn tại: ${spec.regionId}`);

  const severity = Math.max(1, Math.min(5, Math.round(spec.severity)));
  const row = severityRow(severity);
  const type = injuryTypeRow(spec.type);

  const bleeding = Math.min(100, Math.round(row.bleed * type.bleedFactor * region.bleedFactor * 10) / 10);
  const pain = Math.min(100, Math.round(row.pain * type.painFactor * region.painFactor));

  // Tạng chí mạng chỉ hỏng hẳn ở mức 5, và vẫn phải qua một cú tung: một nhát
  // xuyên ngực không phải lúc nào cũng trúng tim, và mục 9 đòi cái chết đến từ
  // một nguyên nhân cụ thể chứ không từ một ngưỡng.
  const vitals = vitalOrgansOf(region);
  const destroyed =
    severity === 5 && vitals.length > 0 && type.open && rng.int(1, 100) <= 45
      ? (vitals[rng.int(0, vitals.length - 1)]?.id ?? null)
      : null;

  return {
    id,
    regionId: region.id,
    inflictedTurn: spec.turn,
    source: spec.source,
    type: spec.type,
    severity,
    bleeding,
    infection: 0,
    pain,
    treated: false,
    treatments: [],
    healProgress: 0,
    complications: [],
    silver: spec.silver ?? false,
    ...(destroyed === null ? {} : { organDestroyed: destroyed }),
  };
}

/** Id thương tích. Suy từ bộ đếm trong slice, KHÔNG rút xúc sắc (R3). */
export function injuryId(body: BodyState, offset = 0): string {
  return `inj_${body.nextInjuryNo + offset}`;
}

export interface InflictOutcome {
  ops: PatchOp[];
  injury: Injury | null;
  log: string[];
}

function describe(injury: Injury, region: BodyRegion): string {
  const type = injuryTypeRow(injury.type);
  return `${region.name}: ${type.name.toLowerCase()} ${severityName(injury.severity).toLowerCase()} (${injury.source})`;
}

/**
 * Gây một vết thương và trả về op để người gọi đưa qua MVU.
 *
 * Ba op mỗi lần, không hơn: nối vết vào danh sách, tăng bộ đếm id, và ghi một
 * dòng vào sổ tay thời gian của mục 10.
 */
export function inflictInjury(
  state: GameState,
  rng: Rng,
  spec: InjurySpec,
  reason = 'engine gây thương tích',
): InflictOutcome {
  const body = bodyOf(state);
  if (body === null) return { ops: [], injury: null, log: ['chưa có slice body — bỏ qua'] };
  if (body.dead) return { ops: [], injury: null, log: ['nhân vật đã chết — không gây thêm thương tích'] };

  const region = regionOf(spec.regionId);
  if (region === null) {
    return { ops: [], injury: null, log: [`vùng "${spec.regionId}" không có trên bản đồ cơ thể — bỏ qua`] };
  }

  const injury = buildInjury(rng, spec, injuryId(body));
  const line = describe(injury, region);

  const ops: PatchOp[] = [
    { op: 'push', path: 'body.injuries', to: injury, reason, source: 'json' },
    {
      op: 'set',
      path: 'body.nextInjuryNo',
      from: body.nextInjuryNo,
      to: body.nextInjuryNo + 1,
      reason: 'cấp id cho thương tích mới',
      source: 'json',
    },
    {
      op: 'push',
      path: 'body.log',
      to: { turn: spec.turn, kind: 'thuong-tich', text: line, regionId: region.id },
      reason: 'ghi dòng thời gian thương tích',
      source: 'json',
    },
  ];

  const note = injury.organDestroyed === undefined ? '' : ` — ${injury.organDestroyed} bị phá hủy`;
  return { ops, injury, log: [`${line}${note}`] };
}

/**
 * Gây thương tích từ một phép kiểm đã thua.
 *
 * Đây là đường Phần 9–11 dùng: chúng đã tung xúc sắc để biết ai thắng pha đó,
 * và mức độ vết thương suy từ CHÍNH cấp kết quả ấy chứ không tung lại lần nữa
 * trên một thang khác — hai lần tung cho một sự kiện là hai lần người chơi
 * không đọc được vì sao mình thành ra như vậy.
 */
export function inflictFromCheck(
  state: GameState,
  rng: Rng,
  check: CheckResult,
  options: { turn: number; source: string; hit?: HitOptions },
): InflictOutcome {
  const region = rollHitLocation(rng, options.hit ?? {});
  const type = rollInjuryType(rng, options.source);
  const severity = severityFromTier(rng, check.tier);

  return inflictInjury(
    state,
    rng,
    { regionId: region.id, type, severity, source: options.source, turn: options.turn },
    `hệ quả cơ học của ${check.id}`,
  );
}
