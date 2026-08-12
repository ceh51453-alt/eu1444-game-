/**
 * SĨ KHÍ — HỆ QUYẾT ĐỊNH THẮNG BẠI (Phần 10 mục 8).
 *
 * README dự án mục 8.6 xếp VỠ TRẬN LAN TRUYỀN là chỗ dễ hỏng thứ sáu của cả dự
 * án, và nói rõ vì sao: "Trận đánh phải kết thúc đột ngột chứ không phải gặm dần
 * từng đơn vị. Nếu không làm đúng, cả Phần 10 sẽ sai về cảm giác."
 *
 * Nên `propagateRout` là hàm quan trọng nhất trong thư mục này. Nó không phải
 * một hiệu ứng phụ dễ thương của việc mất quân — nó LÀ cách một trận thế kỷ 14
 * kết thúc. Một cánh sụp, đơn vị bên cạnh thấy người chạy qua, tự nó cũng phải
 * kiểm định, và ba vòng sau cả đạo quân không còn ai đứng.
 *
 * HỆ XÚC SẮC: 3d6, không phải pool.
 *
 * Phần 5 mục 2 dành pool cho ĐỤNG ĐỘ — "đơn vị quân, xung phong, bắn loạt, công
 * phá" — tức là những chỗ có người ngã xuống. Một đơn vị đang quyết định đứng
 * hay chạy thì không ai ngã xuống cả; đó là một phép kiểm nghị lực, và mục 3 đã
 * đặt tiền lệ khi cho mệnh lệnh chỉ huy dùng 3d6. Đi theo tiền lệ ấy giữ cho
 * "đơn vị có giữ được hàng không" và "tướng có thi hành lệnh không" nằm chung
 * một thang — hai câu hỏi rất giống nhau, và người chơi đọc chúng cạnh nhau.
 */

import type { CheckResult, CheckTier, DifficultyBand } from '@/core/turn';
import type { Rng } from '@/core/rng';
import { runCheck } from '@/systems/check/run';
import { battleConfig, timeOfDayOf, unitTypeOf, weatherOf } from './data';
import { cellsFor, distance, elevationAt } from './grid';
import { MORALE_DOMAIN, publishEngagement, type Engagement } from './modifiers';
import {
  UNIT_STATE_LABELS,
  controllable,
  onField,
  otherSide,
  strengthOf,
  unitById,
  unitsOf,
  type BattleState,
  type BattleUnit,
  type UnitStateId,
} from './types';

// ---------------------------------------------------------------------------
// Năm trạng thái (mục 8)
// ---------------------------------------------------------------------------

/**
 * Trạng thái suy từ con số sĩ khí.
 *
 * KHÔNG dùng để hồi phục: xem `refreshState`. Một đơn vị đã bỏ chạy thì không
 * quay lại chỉ vì sĩ khí nhích lên vài điểm — mục 8 nói vỡ trận là "bỏ chạy về
 * mép bản đồ, không điều khiển được", và một cơ chế cho phép gọi họ lại giữa
 * chừng sẽ xóa sạch cái cảm giác đột ngột mà cả phần này xây quanh.
 */
export function stateFromMorale(morale: number): UnitStateId {
  for (const row of battleConfig().morale.states) {
    if (morale >= row.atLeast) return row.id as UnitStateId;
  }
  return 'vo-tran';
}

export function stateLabel(state: UnitStateId): string {
  return UNIT_STATE_LABELS[state];
}

/** Cập nhật trạng thái sau khi sĩ khí đổi. Vỡ trận là MỘT CHIỀU. */
export function refreshState(unit: BattleUnit): void {
  if (unit.state === 'tan-ra') return;
  if (unit.strength <= 0) {
    unit.state = 'tan-ra';
    return;
  }
  if (unit.state === 'vo-tran') {
    if (unit.routRounds >= battleConfig().morale.disbandAfterRounds) unit.state = 'tan-ra';
    return;
  }
  const next = stateFromMorale(unit.morale);
  unit.state = next;
  if (next === 'vo-tran') unit.routRounds = 0;
}

export function adjustMorale(unit: BattleUnit, delta: number): void {
  unit.morale = Math.max(0, Math.min(unit.moraleMax, unit.morale + delta));
  refreshState(unit);
}

/** Ép một đơn vị vỡ trận ngay, bỏ qua mọi phép kiểm. */
export function breakUnit(unit: BattleUnit): void {
  if (unit.state === 'tan-ra') return;
  unit.morale = Math.min(unit.morale, battleConfig().morale.states.at(-1)?.atLeast ?? 0);
  unit.state = 'vo-tran';
  unit.routRounds = 0;
  unit.holding = false;
  unit.charging = false;
}

// ---------------------------------------------------------------------------
// Phép kiểm sĩ khí
// ---------------------------------------------------------------------------

export interface MoraleOutcome {
  check: CheckResult;
  tier: CheckTier;
  /** Đơn vị vừa vỡ trận vì phép kiểm này. */
  broke: boolean;
  reason: string;
}

/**
 * Ngưỡng 3d6 tung-dưới của một phép kiểm sĩ khí.
 *
 * `6 + sĩ khí/10`, và cả hai hằng số đều được chọn từ hình dạng của phân phối
 * 3d6 chứ không phải cho đẹp:
 *
 *   sĩ khí 80 → ngưỡng 14 → giữ được 90%   (một đơn vị vững thì vững thật)
 *   sĩ khí 60 → ngưỡng 12 → giữ được 74%
 *   sĩ khí 40 → ngưỡng 10 → giữ được 50%
 *   sĩ khí 20 → ngưỡng  8 → giữ được 26%
 *
 * HỆ SỐ 1/10 CHỨ KHÔNG PHẢI 1/6 — và đây là chỗ bản cài đầu tiên sai. Với 1/6,
 * một đơn vị sĩ khí 60 chỉ có ngưỡng 10, và một phép kiểm bậc "Khó" (−4) kéo nó
 * xuống 6, tức là giữ được 9%. Khi ấy VỠ TRẬN LAN TRUYỀN của mục 8 thành một
 * vòng lặp chết: đơn vị đầu tiên vỡ thì mọi đơn vị bên cạnh gần như CHẮC CHẮN vỡ
 * theo, rồi tới lượt hàng xóm của chúng, và cả đạo quân tan trong đúng một vòng
 * ở mức thương vong 9%. Mục 8 cho BA VÒNG để một cánh kéo sập cả đạo quân, và ba
 * vòng ấy chính là quãng người chơi còn kịp làm một việc gì đó.
 *
 * `+6` là cái sàn: kể cả một đám sắp tan cũng còn một cửa đứng lại, đúng luật
 * "luôn còn cửa thắng và cửa thua" của Phần 5 mục 7.
 */
export function moraleTarget(morale: number): number {
  return Math.round(6 + morale / 10);
}

/**
 * Một phép kiểm sĩ khí.
 *
 * Chất lượng đơn vị và bóng tối cộng vào qua registry, nên hai dòng ấy đọc được
 * ở bảng điều chỉnh — người chơi phải thấy được vì sao đám tân binh của mình tan
 * còn đám cựu binh bên cạnh thì không.
 */
export function moraleCheck(
  battle: BattleState,
  rng: Rng,
  unit: BattleUnit,
  difficulty: DifficultyBand,
  reason: string,
): MoraleOutcome {
  const snapshot: Engagement = {
    byActor: new Map([
      [
        unit.id,
        {
          unit,
          battle,
          attacking: false,
          arc: 'front' as const,
          foeTags: [],
          foeFormationId: '',
          elevation: 0,
          ranged: false,
          concealment: 0,
        },
      ],
    ]),
  };

  publishEngagement(snapshot);
  let run;
  try {
    run = runCheck(rng, {
      id: 'battle.si-khi',
      system: '3d6',
      domain: MORALE_DOMAIN,
      difficulty,
      base: moraleTarget(unit.morale),
      actor: unit.id,
      tags: unit.tags,
      state: battle.state,
    });
  } finally {
    publishEngagement(null);
  }

  const tier = run.result.tier;
  let broke = false;
  switch (tier) {
    case 'critSuccess':
      adjustMorale(unit, 5);
      break;
    case 'success':
      break;
    case 'costlySuccess':
      adjustMorale(unit, -5);
      break;
    case 'fail':
      adjustMorale(unit, -14);
      break;
    case 'critFail':
      breakUnit(unit);
      broke = true;
      break;
  }
  if (!broke && unit.state === 'vo-tran') broke = true;

  return { check: run.result, tier, broke, reason };
}

// ---------------------------------------------------------------------------
// VỠ TRẬN LAN TRUYỀN (mục 8) — cơ chế quan trọng nhất của cả phần
// ---------------------------------------------------------------------------

export interface RoutSpread {
  /** Id những đơn vị vỡ trận trong đợt lan này, theo thứ tự đổ. */
  broken: string[];
  /** Những cú tung của đợt lan, để đổ vào `battle.checks`. */
  checks: { unitId: string; result: CheckResult }[];
  lines: string[];
}

/**
 * Một đơn vị vỡ → những đơn vị bên cạnh phải kiểm định → có thể đổ tiếp.
 *
 * Đệ quy có TRẦN, và trần ấy là hợp đồng chứ không phải lưới an toàn: mục 8 viết
 * "Một cánh sụp có thể kéo sập cả đạo quân TRONG BA VÒNG", nên một đợt lan trong
 * cùng một vòng cũng chỉ được đi ba bậc. Không có trần thì một trận đánh ba mươi
 * đơn vị sẽ sụp trọn vẹn trong đúng một pha, và cái "trong ba vòng" của mục 8 —
 * quãng thời gian người chơi còn kịp làm một việc gì đó — biến mất.
 */
export function propagateRout(battle: BattleState, rng: Rng, origin: BattleUnit): RoutSpread {
  const config = battleConfig().morale;
  const spread: RoutSpread = { broken: [origin.id], checks: [], lines: [] };
  const seen = new Set<string>([origin.id]);
  /**
   * BÁN KÍNH HOẢNG LOẠN KẸP Ở HAI Ô, dù `panicMeters` quy ra bao nhiêu.
   *
   * Mục 8 nói "đơn vị vỡ CHẠY QUA đơn vị khác thì đơn vị đó cũng phải kiểm
   * định" — thứ lan truyền là NGƯỜI CHẠY NGƯỢC QUA ĐỘI HÌNH, không phải tầm
   * nhìn. Không kẹp thì ở trận nhỏ (ô hai mươi mét) một trăm rưởi mét phủ gần
   * trọn đội hình, và mỗi lần một đơn vị vỡ là cả đạo quân cùng lúc phải kiểm
   * định — đúng cái "gặm dần rồi sụp một phát" mà README dự án mục 8.6 cấm, chỉ
   * theo chiều ngược lại.
   */
  const radius = Math.max(1, Math.min(2, cellsFor(config.panicMeters, battle.grid.cellMeters, true)));

  let frontier: BattleUnit[] = [origin];
  for (let depth = 0; depth < config.panicCascadeRounds && frontier.length > 0; depth++) {
    const next: BattleUnit[] = [];

    for (const broken of frontier) {
      const neighbours = unitsOf(battle, broken.side).filter(
        (unit) => !seen.has(unit.id) && controllable(unit) && distance(unit.pos, broken.pos) <= radius,
      );

      for (const unit of neighbours) {
        seen.add(unit.id);
        adjustMorale(unit, -config.neighbourRout);
        if (unit.state === 'vo-tran') {
          spread.broken.push(unit.id);
          spread.lines.push(`${unit.name} nhìn ${broken.name} chạy qua và tan luôn, không kịp một phép kiểm nào.`);
          next.push(unit);
          continue;
        }

        // Càng gần chỗ vỡ càng khó giữ. Đứng ngay cạnh một đám đang chạy ngược
        // qua đội hình mình là hoàn cảnh tệ nhất của cả trận đánh.
        const close = distance(unit.pos, broken.pos) <= Math.max(1, Math.floor(radius / 2));
        const outcome = moraleCheck(battle, rng, unit, close ? 'kho' : 'thuong', `${broken.name} vỡ trận ngay bên cạnh`);
        spread.checks.push({ unitId: unit.id, result: outcome.check });

        if (outcome.broke) {
          spread.broken.push(unit.id);
          spread.lines.push(`${unit.name} không giữ nổi hàng khi ${broken.name} chạy qua — vỡ theo.`);
          next.push(unit);
        } else if (outcome.tier === 'fail') {
          spread.lines.push(`${unit.name} chao đảo nhưng còn đứng.`);
        }
      }
    }

    frontier = next;
  }

  return spread;
}

// ---------------------------------------------------------------------------
// Sĩ khí quanh mỗi vòng (mục 8, hai danh sách "giảm vì" và "tăng vì")
// ---------------------------------------------------------------------------

/** Chủ soái của một bên có còn sống và có đứng gần đơn vị này không. */
function commanderNear(battle: BattleState, unit: BattleUnit): boolean {
  if (unit.commanderId === '') return false;
  const officer = battle.officers.find((entry) => entry.id === unit.commanderId);
  if (officer === undefined || !officer.alive) return false;
  // Tướng đứng cùng đơn vị mình cầm; "gần" nghĩa là còn một đơn vị nào khác của
  // cùng cánh trong tầm mắt, để lá cờ còn nhìn thấy được.
  return unitsOf(battle, unit.side).some(
    (other) => other.id !== unit.id && other.wing === unit.wing && distance(other.pos, unit.pos) <= 3,
  );
}

/**
 * Những thứ cộng trừ sĩ khí ở CUỐI mỗi vòng, không gắn với một pha va chạm nào.
 *
 * Mục 8 có hai danh sách, và cả hai phải chạy: nếu chỉ có danh sách "giảm vì"
 * thì mọi trận đánh đều là một đường đi xuống, và người chơi không bao giờ thấy
 * một cánh quân gượng lại được.
 */
export function ambientMorale(battle: BattleState): string[] {
  const config = battleConfig().morale;
  const weather = weatherOf(battle.weatherId);
  const time = timeOfDayOf(battle.timeId);
  const lines: string[] = [];

  for (const side of ['a', 'b'] as const) {
    const mine = strengthOf(battle, side);
    const theirs = strengthOf(battle, otherSide(side));
    const outnumbered = theirs > mine * 1.5;

    for (const unit of unitsOf(battle, side)) {
      if (!controllable(unit)) continue;
      let delta = 0;

      // Giảm vì
      if (outnumbered) delta -= config.outnumbered;
      if (weather !== null) delta -= weather.moraleDrain;
      const terror = unitsOf(battle, otherSide(side)).some(
        (foe) => foe.tags.includes('kinh-hoang') && distance(foe.pos, unit.pos) <= 2,
      );
      if (terror) delta -= config.terror;

      // Tăng vì
      if (commanderNear(battle, unit)) delta += config.commanderNear;
      if (elevationAt(battle.grid, unit.pos) > 0) delta += config.highGround;
      // Nghỉ ngơi: không đánh nhau vòng vừa rồi.
      if (!unit.acted && unit.fatigue < 50) delta += config.restRecover;

      /**
       * Phần CỘNG chỉ kéo được về mức sĩ khí tự nhiên của binh chủng, không hơn.
       *
       * Không có cái trần này thì mấy vế "tăng vì" của mục 8 — chỉ huy có mặt,
       * chiếm cao điểm, nghỉ ngơi — cộng dồn mỗi vòng và biến một đám cung thủ
       * đứng yên bắn thành một đơn vị sĩ khí 90 sau sáu vòng, tức là hăng hơn cả
       * lúc chưa ai bắn ai. Người ta gượng lại được tới mức bình thường của
       * mình; vượt qua nó thì phải có lý do, và mọi lý do như thế đều là một sự
       * kiện riêng chứ không phải nhịp trôi của trận đánh.
       */
      const natural = unitTypeOf(unit.typeId)?.moraleBase ?? unit.moraleMax;
      if (delta > 0) delta = Math.max(0, Math.min(delta, natural - unit.morale));
      if (delta !== 0) adjustMorale(unit, delta);

      // Đội ngũ và mệt mỏi cũng trôi theo địa hình, thời tiết và bóng tối.
      const drain = (weather?.cohesionDrain ?? 0) + (time?.cohesionDrain ?? 0);
      if (drain > 0) unit.cohesion = Math.max(0, unit.cohesion - drain);
    }
  }

  for (const side of ['a', 'b'] as const) {
    const routed = battle.units.filter((unit) => unit.side === side && unit.state === 'vo-tran');
    if (routed.length >= 3) {
      lines.push(`Bên ${side === 'a' ? 'thứ nhất' : 'thứ hai'} đã có ${String(routed.length)} đơn vị bỏ chạy.`);
    }
  }
  return lines;
}

/** Sốc trực tiếp: chủ soái tử trận, bị đánh sau lưng, bị bắn liên tục… */
export function shock(
  battle: BattleState,
  rng: Rng,
  unit: BattleUnit,
  amount: number,
  reason: string,
  difficulty: DifficultyBand = 'thuong',
): MoraleOutcome | null {
  if (!onField(unit) || !controllable(unit)) return null;
  adjustMorale(unit, -amount);
  if (unit.state === 'vo-tran') return null;
  if (unit.morale >= battleConfig().morale.checkBelow) return null;
  return moraleCheck(battle, rng, unit, difficulty, reason);
}

/** Chủ soái tử trận: cả cánh của người ấy phải kiểm định (mục 8). */
export function commanderFell(battle: BattleState, rng: Rng, officerId: string): string[] {
  const officer = battle.officers.find((entry) => entry.id === officerId);
  if (officer === undefined) return [];
  officer.alive = false;

  const lines = [`${officer.name} tử trận. Lá cờ của ${officer.wing} đổ xuống.`];
  for (const unit of unitsOf(battle, officer.side)) {
    if (unit.wing !== officer.wing || !controllable(unit)) continue;
    const outcome = shock(battle, rng, unit, battleConfig().morale.commanderDeath, `${officer.name} tử trận`, 'kho');
    if (outcome?.broke === true) lines.push(`${unit.name} tan ngay khi thấy cờ đổ.`);
  }
  return lines;
}

/** Đơn vị đã vỡ có tan hẳn chưa. Gọi ở cuối mỗi vòng. */
export function tickRout(battle: BattleState): string[] {
  const lines: string[] = [];
  for (const unit of battle.units) {
    if (unit.state !== 'vo-tran') continue;
    unit.routRounds += 1;
    if (unit.routRounds >= battleConfig().morale.disbandAfterRounds) {
      unit.state = 'tan-ra';
      lines.push(`${unit.name} tan rã hoàn toàn — coi như mất.`);
      continue;
    }
    // Chạy về mép bản đồ. Ở gần mép rồi thì coi như đã ra khỏi trận.
    const homeEdge = unit.side === 'a' ? 0 : battle.grid.height - 1;
    if (Math.abs(unit.pos.y - homeEdge) <= 1) {
      unit.state = 'tan-ra';
      lines.push(`${unit.name} chạy khuất khỏi chiến trường.`);
    }
  }
  return lines;
}

/** Đơn vị này còn ở đó không, tra nhanh cho những chỗ chỉ có id. */
export function aliveUnit(battle: BattleState, id: string): BattleUnit | null {
  const unit = unitById(battle, id);
  return unit !== null && onField(unit) ? unit : null;
}
