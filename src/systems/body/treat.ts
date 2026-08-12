/**
 * CHỮA TRỊ (Phần 7 mục 6) — kiểm định d100 y thuật, đủ NĂM cấp kết quả.
 *
 * Một lần chữa đi đúng bốn bước, và không bước nào bỏ được:
 *   1. phương pháp này có dùng được cho vết đó không   (`canTreat`)
 *   2. người chữa giỏi tới đâu                          (`healerSkill`)
 *   3. tung d100 qua `runCheck` của Phần 5              (R1 — engine tung trước)
 *   4. áp hệ quả của ĐÚNG cấp vừa ra                    (bảng trong data)
 *
 * Cấp kết quả không phải thang riêng của y thuật: nó là thang 5 cấp DUY NHẤT
 * của cả game. Nhờ vậy `critFail` ở đây có cùng nghĩa cơ học với `critFail` ở
 * kiếm thuật — thất bại VÀ sinh ra một biến cố mới xấu hơn tình trạng ban đầu.
 * Ở bàn mổ thế kỷ 14, biến cố đó là cắt nhầm chi và mở lại vết thương.
 *
 * TRÍCH MÁU đi qua đúng đường này và vẫn có hại ở mọi cấp — cái bẫy nằm trong
 * bảng data, không nằm trong một nhánh `if` giấu ở đây. Loader của
 * `treatments.ts` gác chuyện đó.
 */

import type { CheckResult } from '@/core/turn';
import type { Rng } from '@/core/rng';
import type { PatchOp } from '@/state/mvu-parse';
import { readPath, type GameState } from '@/state/slices';
import { runCheck, type CheckSpec } from '@/systems/check';
import { domainOfSkill } from '@/systems/character/skills';
import { injuryTypeRow, permanentOf } from './catalog';
import { buildInjury } from './inflict';
import { addPermanent, diffOps, newMutation, note } from './ops';
import { distalRegions, regionOf } from './regions';
import { bodyOf, type BodyState, type Injury } from './slice';
import { outcomeFor, treatmentOf, healerOf, type Healer, type Treatment } from './treatments';

export interface TreatRequest {
  injuryId: string;
  treatmentId: string;
  /** Id trong bảng `healers`. `tu-chua` dùng kỹ năng của chính nhân vật. */
  healerId: string;
  turn: number;
  /** Ghi đè điểm rèn luyện của người chữa — chỉ dùng trong test. */
  skillLevel?: number;
}

export interface TreatResult {
  ops: PatchOp[];
  log: string[];
  check: CheckResult | null;
  /** Đã chữa được hay bị chặn ngay từ khâu điều kiện. */
  ran: boolean;
  /** Lý do bị chặn, rỗng khi chạy được. */
  blocked: string;
}

function blockedResult(reason: string): TreatResult {
  return { ops: [], log: [reason], check: null, ran: false, blocked: reason };
}

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

// ---------------------------------------------------------------------------
// Điều kiện
// ---------------------------------------------------------------------------

/** Phương pháp này có dùng được cho vết thương đó không (mục 6). */
export function canTreat(injury: Injury, treatment: Treatment): boolean {
  const rules = treatment.appliesTo;
  if (injury.severity < rules.minSeverity) return false;
  if (rules.any) return true;
  if (rules.types.length > 0 && !rules.types.includes(injury.type)) return false;
  if (rules.regions.length > 0 && !rules.regions.includes(injury.regionId)) return false;
  if (rules.requiresLimb) {
    const region = regionOf(injury.regionId);
    if (region === null || region.limb === null || !region.amputable) return false;
  }
  if (
    rules.requiresComplications.length > 0 &&
    !rules.requiresComplications.some((id) => injury.complications.some((entry) => entry.id === id))
  ) {
    return false;
  }
  return true;
}

/** Danh sách phương pháp dùng được cho một vết — nút chữa trị của mục 10 đọc chỗ này. */
export function treatmentsFor(injury: Injury, all: readonly Treatment[]): Treatment[] {
  return all.filter((treatment) => canTreat(injury, treatment));
}

/**
 * Điểm rèn luyện của người chữa.
 *
 * `tu-chua` đọc thẳng kỹ năng của nhân vật, và đó là chỗ hệ thống này cắn chính
 * nó theo cách đúng: một người bị thương nặng tự khâu cho mình sẽ chịu phạt đau
 * và mất máu của chính mình, vì `runCheck` chạy với `actor` rỗng nên mọi nguồn
 * modifier của cơ thể đều áp vào.
 */
export function healerSkill(
  state: GameState,
  healer: Healer,
  treatment: Treatment,
  rng: Rng,
): number {
  if (healer.skill === null) {
    const level = readPath(state, `character.skills.${treatment.skill}.level`);
    return typeof level === 'number' ? level : 0;
  }
  return rng.int(Math.round(healer.skill[0]), Math.round(healer.skill[1]));
}

/** Ước lượng kỹ năng để UI hiện rủi ro mà KHÔNG rút xúc sắc (R3). */
export function healerSkillEstimate(state: GameState, healer: Healer, treatment: Treatment): number {
  if (healer.skill === null) {
    const level = readPath(state, `character.skills.${treatment.skill}.level`);
    return typeof level === 'number' ? level : 0;
  }
  return Math.round((healer.skill[0] + healer.skill[1]) / 2);
}

// ---------------------------------------------------------------------------
// Chữa
// ---------------------------------------------------------------------------

/**
 * Chạy một lần chữa trị và trả về op cho MVU.
 *
 * KHÔNG ghi state, KHÔNG ghi store. Người gọi (UI hoặc vòng lặp lượt) áp lô op
 * với actor `engine` — cùng đường với mọi thay đổi khác (R2).
 */
export function treat(state: GameState, rng: Rng, request: TreatRequest): TreatResult {
  const original = bodyOf(state);
  if (original === null) return blockedResult('chưa có slice body');
  if (original.dead) return blockedResult('nhân vật đã chết');

  const treatment = treatmentOf(request.treatmentId);
  if (treatment === null) return blockedResult(`không có phương pháp "${request.treatmentId}"`);

  const healer = healerOf(request.healerId);
  if (healer === null) return blockedResult(`không có người chữa "${request.healerId}"`);

  const index = original.injuries.findIndex((entry) => entry.id === request.injuryId);
  const target = original.injuries[index];
  if (target === undefined) return blockedResult(`không tìm thấy thương tích "${request.injuryId}"`);
  if (!canTreat(target, treatment)) {
    return blockedResult(`${treatment.name} không dùng được cho vết này`);
  }

  const body: BodyState = structuredClone(original);
  const injury = body.injuries[index];
  if (injury === undefined) return blockedResult('thương tích biến mất giữa chừng');

  const mutation = newMutation();
  const turn = request.turn;
  const region = regionOf(injury.regionId);
  const skill = request.skillLevel ?? healerSkill(state, healer, treatment, rng);

  // --- Kiểm định d100 (mục 6) ---------------------------------------------
  const spec: CheckSpec = {
    id: `body.chua-tri.${treatment.id}`,
    system: 'd100',
    domain: domainOfSkill(treatment.skill),
    difficulty: treatment.difficulty,
    base: skill,
    // Người chữa là NPC thì mọi nguồn modifier của NHÂN VẬT phải im lặng: cơn
    // đau của bệnh nhân không làm tay thầy thuốc run.
    actor: healer.skill === null ? '' : `npc_${healer.id}`,
    state,
  };
  const check = runCheck(rng, spec).result;

  const outcome = outcomeFor(treatment, check.tier);
  if (outcome === null) return blockedResult(`phương pháp "${treatment.id}" thiếu cấp "${check.tier}"`);

  note(
    mutation,
    turn,
    'chua-tri',
    `${healer.name} · ${treatment.name} ở ${region?.name ?? injury.regionId} → ${check.tier}: ${outcome.text}`,
    injury.regionId,
  );

  // --- Áp hệ quả -----------------------------------------------------------
  if (outcome.bleedingMul !== undefined) {
    injury.bleeding = round1(clamp(injury.bleeding * outcome.bleedingMul, 0, 100));
  }
  if (outcome.infectionAdd !== 0) {
    injury.infection = round1(clamp(injury.infection + outcome.infectionAdd, 0, 100));
  }
  if (outcome.painAdd !== 0) {
    injury.pain = Math.round(clamp(injury.pain + outcome.painAdd, 0, 100));
  }
  if (outcome.healBonus !== 0) {
    injury.healProgress = round1(clamp(injury.healProgress + outcome.healBonus, 0, 100));
  }
  if (outcome.reopens) injury.healProgress = 0;
  if (outcome.bloodAdd !== 0) {
    body.blood = round1(clamp(body.blood + outcome.bloodAdd, 0, 100));
  }
  if (outcome.resolves.length > 0) {
    const before = injury.complications.length;
    injury.complications = injury.complications.filter((entry) => !outcome.resolves.includes(entry.id));
    if (injury.complications.length < before) {
      note(mutation, turn, 'chua-tri', `gỡ được ${outcome.resolves.join(', ')}`, injury.regionId);
    }
  }
  if (outcome.quality !== undefined) {
    injury.treated = true;
    injury.treatmentQuality = outcome.quality;
    injury.treatedTurn = turn;
  }
  // Ghi phương pháp đã dùng dù thành hay bại: `lien-lech` tra danh sách này để
  // biết xương ĐÃ được nẹp chưa, và một lần nẹp hỏng vẫn là một lần đã nẹp.
  if (!injury.treatments.includes(treatment.id)) injury.treatments.push(treatment.id);

  if (outcome.willBonus !== 0) {
    body.will = { bonus: outcome.willBonus, untilTurn: turn + Math.max(1, Math.round(outcome.willTurns)) };
    note(mutation, turn, 'chua-tri', `ý chí ${outcome.willBonus >= 0 ? '+' : ''}${outcome.willBonus} tới lượt ${body.will.untilTurn}`);
  }

  if (outcome.causesPermanent !== undefined) {
    addPermanent(body, mutation, outcome.causesPermanent, injury.regionId, turn, treatment.name.toLowerCase());
  }

  // --- Vết mới do chính việc chữa gây ra ------------------------------------
  const adds = outcome.addsInjury;
  if (adds !== undefined) {
    const where = adds.region ?? injury.regionId;
    if (regionOf(where) !== null) {
      const extra = buildInjury(
        rng,
        {
          regionId: where,
          type: adds.type,
          severity: adds.severity,
          source: `${treatment.name.toLowerCase()} (${healer.name})`,
          turn,
        },
        `inj_${body.nextInjuryNo}`,
      );
      body.nextInjuryNo += 1;
      body.injuries.push(extra);
      note(
        mutation,
        turn,
        'thuong-tich',
        `${regionOf(where)?.name ?? where}: thêm ${injuryTypeRow(adds.type).name.toLowerCase()} do chính việc chữa`,
        where,
      );
    }
  }

  // --- Cắt cụt --------------------------------------------------------------
  if (outcome.amputates && region !== null && region.limb !== null) {
    const gone = distalRegions(region.id).map((entry) => entry.id);
    const permanentId = region.limb === 'tay' ? 'cut-tay' : 'cut-chan';

    body.injuries = body.injuries.filter((entry) => !gone.includes(entry.regionId));
    addPermanent(body, mutation, permanentId, region.id, turn, `cắt cụt tại ${region.name.toLowerCase()}`);

    // Mỏm cụt là một VẾT THƯƠNG THẬT, không phải một cờ. Mục 9 nói "cụt chi mà
    // không cầm được máu" là một cửa tử riêng — nên nó phải có `bleeding` để
    // vòng lượt trừ vào máu, và có thể chữa tiếp bằng đốt sắt nung.
    const stump = buildInjury(
      rng,
      { regionId: region.id, type: 'amputation', severity: 4, source: 'mỏm cụt', turn },
      `inj_${body.nextInjuryNo}`,
    );
    stump.bleeding = round1(clamp(stump.bleeding * (outcome.bleedingMul ?? 1), 0, 100));
    stump.treated = outcome.quality !== undefined;
    if (outcome.quality !== undefined) stump.treatmentQuality = outcome.quality;
    body.nextInjuryNo += 1;
    body.injuries.push(stump);

    const label = permanentOf(permanentId)?.name ?? permanentId;
    note(
      mutation,
      turn,
      'tan-phe',
      `${label}: mất ${gone.map((id) => regionOf(id)?.name ?? id).join(', ')}`,
      region.id,
    );
  }

  const ops = diffOps(original, body, mutation, state, `chữa trị: ${treatment.name}`);
  return { ops, log: mutation.lines, check, ran: true, blocked: '' };
}
