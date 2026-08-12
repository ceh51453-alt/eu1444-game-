/**
 * VÒNG TÍNH MỖI LƯỢT (Phần 7 mục 6 phần lành tự nhiên, và toàn bộ mục 7 và 9).
 *
 * THỨ TỰ TÁM BƯỚC LÀ HỢP ĐỒNG, không phải chi tiết cài đặt:
 *
 *   1. chảy máu rồi đông lại        5. biến chứng (3d6 vs VIT)
 *   2. nhiễm trùng (3d6 vs VIT)     6. hoại tử lan
 *   3. sốt bò về phía đích          7. hồi máu
 *   4. lành tự nhiên                8. xét tử vong
 *
 * Đảo thứ tự là đổi kết quả: chảy máu phải trừ TRƯỚC khi xét hồi máu, nếu không
 * một vết đang phun máu vẫn "hồi" được mỗi lượt. Và tử vong xét CUỐI CÙNG, sau
 * khi mọi thứ khác đã ghi xong — mục 9 nói cái chết phải là hệ quả của một chuỗi
 * chứ không phải một ngưỡng bắt gặp giữa chừng.
 *
 * VÒNG NÀY CHẠY TRƯỚC KHI GỌI AI (R1). Đó là lý do nó nằm ở bước 2 của vòng lặp
 * lượt chứ không phải bước 8: người kể chuyện phải ĐỌC ĐƯỢC cơn sốt đã lên tới
 * đâu trước khi viết cảnh, chứ không phải biết sau khi đã viết xong.
 *
 * Hàm ở đây THUẦN: nhận state, trả `PatchOp[]`. Nó không ghi store, không log,
 * không phát event. Người gọi đưa lô op qua MVU với actor `engine`.
 */

import type { CheckResult } from '@/core/turn';
import type { Rng } from '@/core/rng';
import type { PatchOp } from '@/state/mvu-parse';
import { readPath, type GameState } from '@/state/slices';
import { isSuccess, runCheck, type CheckSpec } from '@/systems/check';
import type { DifficultyBand } from '@/systems/check';
import {
  allComplications,
  complicationOf,
  deathCauseLabel,
  deathRules,
  diseaseOf,
  injuryTypeRow,
  severityRow,
  silverRule,
  wholeBodyTuning,
  type ComplicationRow,
} from './catalog';
import { addPermanent, diffOps, newMutation, note as noteLine } from './ops';
import { hasArtery, regionOf, type BodyRegion } from './regions';
import { bodyOf, statOf, type BodyLogEntry, type BodyState, type Injury } from './slice';
import { feverTargetOf, mobilityOf } from './vitals';

/** Miền kiểm định của các cú tung nội bộ — hệ 3d6, năng lực dài hạn (mục 7). */
export const BODY_DOMAIN = 'body.suc-chiu-dung';

export interface BodyTurnResult {
  ops: PatchOp[];
  /** Từng dòng của lượt, để bài test mục 11 in ra và để tab Debug đọc. */
  log: string[];
  /** Mọi cú tung nội bộ, cho người gọi ghi vào `checkLog` của Phần 5 mục 11. */
  checks: CheckResult[];
  died: boolean;
  deathCause: string;
  /** Chi đang hoại tử — UI phải hét lên, vì cửa sổ để cắt là hữu hạn. */
  amputationNeeded: string[];
}

const T = wholeBodyTuning();
const DEATH = deathRules();

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Đau GỐC của một vết, suy lại từ bảng — không giữ thêm một bản sao trong save. */
function basePain(injury: Injury): number {
  const region = regionOf(injury.regionId);
  const row = severityRow(injury.severity);
  const type = injuryTypeRow(injury.type);
  return Math.min(100, row.pain * type.painFactor * (region?.painFactor ?? 1));
}

/**
 * Một cú tung 3d6 vs VIT — "năng lực dài hạn" theo phân miền của Phần 5 mục 2.
 *
 * Mục 7 nói rõ mọi biến chứng dùng hệ này. Sức chịu đựng của một cơ thể trước
 * nhiễm trùng KHÔNG phải phản xạ (d20) và cũng không phải kỹ năng (d100) — đó
 * là thứ diễn ra trong nhiều ngày, và hệ 3d6 là hệ của nhiều ngày.
 */
function resist(rng: Rng, state: GameState, difficulty: DifficultyBand, id: string): CheckResult {
  const spec: CheckSpec = {
    id,
    system: '3d6',
    domain: BODY_DOMAIN,
    difficulty,
    base: statOf(state, 'vit'),
    state,
  };
  return runCheck(rng, spec).result;
}

/** Bậc độ khó của cú tung nhiễm trùng mỗi lượt. Vết bẩn khó hơn, chữa tốt thì dễ hơn. */
function infectionBand(injury: Injury): DifficultyBand {
  const dirty = injuryTypeRow(injury.type).dirty;
  const wellTreated = injury.treated && (injury.treatmentQuality ?? 0) >= 4;
  if (wellTreated) return dirty ? 'thuong' : 'de-dang';
  return dirty ? 'kho' : 'thuong';
}

// ---------------------------------------------------------------------------
// Biến chứng — điều kiện kích hoạt (mục 7)
// ---------------------------------------------------------------------------

interface TriggerContext {
  body: BodyState;
  injury: Injury;
  region: BodyRegion | null;
  turn: number;
  mobility: number;
  rng: Rng;
}

/**
 * Tám loại điều kiện, không nhiều hơn. Thêm loại thứ chín thì phải thêm ở CẢ
 * schema của `catalog.ts` lẫn chỗ này — cố ý làm thế, để không ai lặng lẽ viết
 * một điều kiện vào file data rồi tưởng nó đang chạy.
 */
function triggerFires(row: ComplicationRow, context: TriggerContext): boolean {
  const { body, injury, region, turn, mobility, rng } = context;
  const trigger = row.trigger;
  const age = turn - injury.inflictedTurn;

  switch (trigger.kind) {
    case 'infection':
      return injury.infection >= (trigger.atLeast ?? 100);

    case 'blood':
      return body.blood <= (trigger.atMost ?? 0);

    case 'wound': {
      if (trigger.types.length > 0 && !trigger.types.includes(injury.type)) return false;
      if (trigger.dirty === true && !injuryTypeRow(injury.type).dirty) return false;
      if (injury.severity < (trigger.minSeverity ?? 1)) return false;
      if (age < (trigger.afterTurns ?? 0)) return false;
      return rng.int(1, 100) <= (trigger.chancePerTurn ?? 0);
    }

    case 'fracture':
    case 'dislocation': {
      const wanted = trigger.kind === 'fracture' ? 'fracture' : 'dislocation';
      if (injury.type !== wanted) return false;
      if (age < (trigger.afterTurns ?? 0)) return false;
      return !trigger.unlessTreatments.some((id) => injury.treatments.includes(id));
    }

    case 'immobile': {
      if (mobility >= (trigger.belowMobility ?? 0)) return false;
      // Xấp xỉ "bất động lâu" bằng tuổi của chính vết đang xét: không giữ thêm
      // một bộ đếm ngày-nằm-giường trong save cho một thứ mà tuổi vết thương đã
      // nói gần đúng. Sai số là vài lượt, và loét nằm không phải cơ chế mà người
      // chơi tính toán tới từng lượt.
      return age >= (trigger.afterTurns ?? 0);
    }

    case 'spine':
      return region?.spine === true && injury.severity >= (trigger.minSeverity ?? 5);

    case 'artery': {
      if (region === null || !hasArtery(region)) return false;
      if (trigger.types.length > 0 && !trigger.types.includes(injury.type)) return false;
      return injury.severity >= (trigger.minSeverity ?? 5);
    }
  }
}

/** Biến chứng "phán quyết": kích hoạt một lần rồi ghi thẳng tàn phế, không diễn tiến. */
function isVerdict(row: ComplicationRow): boolean {
  return (
    row.permanentOnResolve !== undefined &&
    row.spreadTurns === undefined &&
    row.lethalAfter === undefined &&
    !row.forcesAmputation
  );
}

// ---------------------------------------------------------------------------
// Vòng một lượt
// ---------------------------------------------------------------------------

/**
 * Chạy một lượt cơ thể.
 *
 * `turn` là lượt SẮP tới, cùng con số mà vòng lặp lượt dùng cho biên bản — nên
 * dòng thời gian của mục 10 khớp với lịch sử lượt chứ không lệch một nhịp.
 */
export function bodyTurn(state: GameState, rng: Rng, turn: number): BodyTurnResult {
  const original = bodyOf(state);
  const result: BodyTurnResult = {
    ops: [],
    log: [],
    checks: [],
    died: false,
    deathCause: '',
    amputationNeeded: [],
  };
  if (original === null) return result;
  if (original.dead) {
    result.log.push('nhân vật đã chết — vòng cơ thể không chạy');
    return result;
  }

  const body = structuredClone(original);
  const vit = statOf(state, 'vit');
  const mutation = newMutation();
  // Đọc MỘT LẦN cho cả vòng: chủng tộc không đổi giữa lượt, và tra lại nó trong
  // vòng lặp thương tích là tra một hằng số hai mươi lần.
  const race = readPath(state, 'character.identity.race');
  const silverAffectsRace = typeof race === 'string' && silverRule().racesAffected.includes(race);

  const note = (kind: BodyLogEntry['kind'], text: string, regionId = ''): void => {
    noteLine(mutation, turn, kind, text, regionId);
  };

  // --- 1. Chảy máu, rồi đông lại -----------------------------------------
  let bled = 0;
  for (const injury of body.injuries) {
    if (injury.bleeding <= 0) continue;
    bled += injury.bleeding;

    const resistsClot = injury.complications.some(
      (entry) => complicationOf(entry.id)?.clotResist === true,
    );
    if (resistsClot) continue;

    const clot = T.clotFlat + vit / T.clotVitDivisor + (injury.treated ? (injury.treatmentQuality ?? 1) : 0);
    injury.bleeding = Math.max(0, round1(injury.bleeding * (1 - T.clotFraction) - clot));
  }
  if (bled > 0) {
    body.blood = round1(clamp(body.blood - bled, 0, T.bloodMax));
    note('bien-chung', `mất ${round1(bled)} máu — còn ${body.blood}/${T.bloodMax}`);
  }

  // --- 2. Nhiễm trùng ------------------------------------------------------
  for (const injury of body.injuries) {
    if (injury.healProgress >= 100) continue;
    const type = injuryTypeRow(injury.type);
    if (!type.open && injury.infection === 0) continue;

    const region = regionOf(injury.regionId);
    const growth =
      severityRow(injury.severity).infectionGrowth *
      type.infectionFactor *
      (region?.infectionFactor ?? 1) *
      (injury.treated ? Math.max(0.2, 1 - (injury.treatmentQuality ?? 1) * 0.15) : 1);

    const check = resist(rng, state, infectionBand(injury), `body.nhiem-trung.${injury.id}`);
    result.checks.push(check);

    const factor =
      check.tier === 'critSuccess'
        ? -0.5
        : check.tier === 'success'
          ? 0.35
          : check.tier === 'costlySuccess'
            ? 0.7
            : check.tier === 'fail'
              ? 1
              : 1.8;

    const before = injury.infection;
    injury.infection = round1(clamp(injury.infection + growth * factor, 0, 100));
    if (Math.floor(injury.infection / 20) !== Math.floor(before / 20)) {
      note(
        'bien-chung',
        `${region?.name ?? injury.regionId}: nhiễm trùng ${injury.infection}/100`,
        injury.regionId,
      );
    }
  }

  // --- 3. Sốt --------------------------------------------------------------
  const feverTarget = feverTargetOf(body);
  const feverBefore = body.fever;
  if (body.fever < feverTarget) body.fever = round1(Math.min(feverTarget, body.fever + T.feverStep));
  else if (body.fever > feverTarget) body.fever = round1(Math.max(feverTarget, body.fever - T.feverStep / 2));
  body.fever = clamp(body.fever, 0, 100);

  if (Math.floor(body.fever / 20) !== Math.floor(feverBefore / 20)) {
    note('bien-chung', `sốt ${body.fever}/100`);
  }
  body.feverTurns = body.fever >= DEATH.feverAtLeast ? body.feverTurns + 1 : 0;

  // --- 4. Lành tự nhiên ----------------------------------------------------
  const healed: Injury[] = [];
  for (const injury of body.injuries) {
    if (injury.healProgress >= 100) continue;

    const necrotic = injury.complications.some((entry) => entry.id === 'hoai-tu');
    const row = severityRow(injury.severity);
    const type = injuryTypeRow(injury.type);

    let rate = 100 / Math.max(1, row.healTurns * type.healFactor);
    if (injury.treated) rate *= 0.8 + (injury.treatmentQuality ?? 1) * 0.15;
    if (injury.infection >= 40) rate *= 0.3;
    if (body.fever >= 60) rate *= 0.5;
    if (necrotic) rate = 0;
    // VẾT DO BẠC (Phần 16 mục 6, Phần 14b mục D): với những chủng tộc khai trong
    // `injuries.json → silver`, vết bạc đứng yên ở đúng mức nó vừa gây ra. Chữa
    // bằng tay vẫn được — nó không tự lành, chứ không phải một bản án.
    if (injury.silver && silverAffectsRace) rate *= silverRule().healFactor;

    injury.healProgress = round1(clamp(injury.healProgress + rate, 0, 100));

    // Đau tụt theo tiến độ lành, rồi cộng lại phần của biến chứng.
    let pain = basePain(injury) * (1 - injury.healProgress / 100);
    for (const entry of injury.complications) {
      pain += (complicationOf(entry.id)?.perTurn.pain ?? 0) * Math.max(1, turn - entry.startedTurn);
    }
    injury.pain = Math.round(clamp(pain, 0, 100));

    if (injury.healProgress >= 100) healed.push(injury);
  }

  for (const injury of healed) {
    const region = regionOf(injury.regionId);
    note('lanh', `${region?.name ?? injury.regionId}: đã lành`, injury.regionId);
    // Mức 1 không để lại gì; từ mức 2 trở lên thì có sẹo, và sẹo là thứ người
    // khác NHÌN THẤY (khối prompt số 7).
    if (injury.severity >= 2 && region !== null) {
      mutation.scars.push({
        site: region.name,
        cause: injury.source === '' ? injuryTypeRow(injury.type).name : injury.source,
        note: `lượt ${injury.inflictedTurn}`,
      });
    }
  }
  body.injuries = body.injuries.filter((injury) => injury.healProgress < 100);

  // --- 5. Biến chứng -------------------------------------------------------
  const mobility = mobilityOf(body);
  const rows = allComplications();

  for (const injury of body.injuries) {
    const region = regionOf(injury.regionId);
    for (const row of rows) {
      if (injury.complications.some((entry) => entry.id === row.id)) continue;
      if (!triggerFires(row, { body, injury, region, turn, mobility, rng })) continue;

      const check = resist(rng, state, row.difficulty, `body.${row.id}.${injury.id}`);
      result.checks.push(check);
      if (isSuccess(check.tier)) {
        note('bien-chung', `${region?.name ?? injury.regionId}: chống được ${row.name.toLowerCase()}`, injury.regionId);
        continue;
      }

      injury.complications.push({ id: row.id, startedTurn: turn, spreadTurn: -1, note: '' });
      note('bien-chung', `${region?.name ?? injury.regionId}: ${row.name.toUpperCase()}`, injury.regionId);

      if (isVerdict(row) && row.permanentOnResolve !== undefined) {
        injury.permanent = row.permanentOnResolve;
        addPermanent(body, mutation, row.permanentOnResolve, injury.regionId, turn, row.name.toLowerCase());
      }
      if (row.forcesAmputation && region !== null && region.limb !== null && region.amputable) {
        result.amputationNeeded.push(injury.regionId);
      }
    }

    // Biến chứng đang chạy: cộng phần của chúng vào mỗi lượt.
    for (const entry of injury.complications) {
      const row = complicationOf(entry.id);
      if (row === null) continue;
      if (row.perTurn.bleeding !== 0) {
        injury.bleeding = round1(clamp(injury.bleeding + row.perTurn.bleeding, 0, 100));
      }
      if (row.perTurn.infection !== 0) {
        injury.infection = round1(clamp(injury.infection + row.perTurn.infection, 0, 100));
      }
      if (row.perTurn.blood !== 0) {
        body.blood = round1(clamp(body.blood + row.perTurn.blood, 0, T.bloodMax));
      }
      if (row.forcesAmputation) {
        const region2 = regionOf(injury.regionId);
        if (region2?.amputable === true && !result.amputationNeeded.includes(injury.regionId)) {
          result.amputationNeeded.push(injury.regionId);
        }
      }
    }
  }

  // --- 6. Hoại tử lan ------------------------------------------------------
  const spreads: Injury[] = [];
  for (const injury of body.injuries) {
    for (const entry of injury.complications) {
      const row = complicationOf(entry.id);
      if (row === null || row.spreadTurns === undefined) continue;

      const since = entry.spreadTurn === -1 ? entry.startedTurn : entry.spreadTurn;
      if (turn - since < row.spreadTurns) continue;

      const region = regionOf(injury.regionId);
      const target = (region?.neighbours ?? []).find(
        (candidate) => !body.injuries.some((other) => other.regionId === candidate && other.complications.some((c) => c.id === row.id)),
      );
      entry.spreadTurn = turn;
      if (target === undefined) continue;

      const targetRegion = regionOf(target);
      const spread: Injury = {
        id: `inj_${body.nextInjuryNo + spreads.length}`,
        regionId: target,
        inflictedTurn: turn,
        source: `${row.name.toLowerCase()} lan từ ${region?.name ?? injury.regionId}`,
        type: injury.type,
        severity: 3,
        bleeding: 0,
        infection: 90,
        pain: 30,
        // Hoại tử lan ra là hoại tử, không phải một vết bạc mới: cờ `silver`
        // thuộc về CÚ ĐÁNH đã gây ra vết gốc, và nó không lan theo.
        silver: false,
        treated: false,
        treatments: [],
        healProgress: 0,
        complications: [{ id: row.id, startedTurn: turn, spreadTurn: -1, note: '' }],
      };
      spreads.push(spread);
      note('bien-chung', `${row.name.toUpperCase()} lan sang ${targetRegion?.name ?? target}`, target);
      if (targetRegion?.amputable === true && !result.amputationNeeded.includes(target)) {
        result.amputationNeeded.push(target);
      }
    }
  }
  body.injuries.push(...spreads);
  body.nextInjuryNo += spreads.length;

  // --- 7. Hồi máu ----------------------------------------------------------
  const stillBleeding = body.injuries.some((injury) => injury.bleeding > 0);
  if (!stillBleeding && body.fever < T.bloodRegenBlockedAtFever && body.blood < T.bloodMax) {
    body.blood = round1(clamp(body.blood + T.bloodRegenPerTurn, 0, T.bloodMax));
  }

  // --- 8. Bệnh (móc sẵn cho Phần 15) ---------------------------------------
  for (const disease of body.diseases) {
    const row = diseaseOf(disease.id);
    if (row === null) continue;
    const age = turn - disease.startedTurn;
    if (disease.incubating && age >= row.incubationTurns) {
      disease.incubating = false;
      note('benh', `phát bệnh: ${row.name}`);
    }
    if (!disease.incubating && age >= row.incubationTurns + row.lethalAfter && !result.died) {
      result.died = true;
      result.deathCause = `${deathCauseLabel('benh')} — ${row.name}`;
    }
  }

  // --- 9. Xét tử vong (mục 9) ---------------------------------------------
  if (!result.died) {
    const verdict = deathVerdict(body, turn);
    if (verdict !== null) {
      result.died = true;
      result.deathCause = verdict;
    }
  }

  if (result.died) {
    body.dead = true;
    body.deathCause = result.deathCause;
    body.deathTurn = turn;
    note('tu-vong', `TỬ VONG: ${result.deathCause}`);
  }

  // --- Dựng op -------------------------------------------------------------
  result.ops.push(
    ...diffOps(
      original,
      body,
      mutation,
      state,
      'vòng cơ thể mỗi lượt: chảy máu, nhiễm trùng, lành, biến chứng',
    ),
  );
  result.log.push(...mutation.lines);
  return result;
}

/**
 * Năm cửa tử của mục 9, và KHÔNG có cửa thứ sáu.
 *
 * Trả về câu nguyên nhân đọc được, hoặc null. Câu đó đi thẳng vào
 * `body.deathCause` và vào sổ tay — vì mục 9 nói cái chết phải truy ngược được
 * về một nguyên nhân cụ thể, không phải về "máu về 0".
 */
export function deathVerdict(body: BodyState, turn: number): string | null {
  if (body.blood <= DEATH.bloodAtOrBelow) {
    const worst = [...body.injuries].sort((a, b) => b.bleeding - a.bleeding)[0];
    const where = worst === undefined ? '' : ` từ ${regionOf(worst.regionId)?.name ?? worst.regionId}`;
    return `${deathCauseLabel('mat-mau')}${where}`;
  }

  for (const injury of body.injuries) {
    if (injury.organDestroyed === undefined) continue;
    if (injury.severity < DEATH.vitalOrganDestroyedAtSeverity) continue;
    return `${deathCauseLabel('tang-phu')}: ${injury.organDestroyed}`;
  }

  if (body.feverTurns > DEATH.feverTurnsAllowed) {
    return `${deathCauseLabel('sot')} (${body.feverTurns} lượt ở ${body.fever}/100)`;
  }

  for (const injury of body.injuries) {
    const region = regionOf(injury.regionId);
    for (const entry of injury.complications) {
      const row = complicationOf(entry.id);
      if (row === null) continue;

      if (
        row.lethalInTrunkAfter !== undefined &&
        region?.trunk === true &&
        turn - entry.startedTurn >= row.lethalInTrunkAfter
      ) {
        return `${deathCauseLabel('hoai-tu')} (${region.name})`;
      }
      if (row.lethalAfter !== undefined && turn - entry.startedTurn >= row.lethalAfter) {
        return deathCauseLabel(entry.id);
      }
    }
  }

  return null;
}
