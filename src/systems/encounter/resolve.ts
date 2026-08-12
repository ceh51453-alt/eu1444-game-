/**
 * BỎ QUA: ENGINE ĐÁNH THAY, RỒI KỂ LẠI.
 *
 * Nút "Bỏ qua" KHÔNG phải nút "trận này không xảy ra". Người kể chuyện vừa nói
 * có ba trăm kỵ binh tràn qua sườn đồi; xóa chúng đi vì người chơi không muốn
 * bấm ba mươi lần là để truyện và cơ học nói hai chuyện khác nhau ngay trong
 * một lượt — đúng thứ mà cả Phần 5 lẫn Phần 7 dựng cả một kiến trúc để tránh.
 *
 * Nên bỏ qua nghĩa là: engine cầm cả hai bên đánh trọn trận bằng đúng những hàm
 * mà bài test của Phần 9, 10, 11 đã đo (`autoDuel`, `autoBattle`, `fastForward`
 * với hai bảng hành động tự động), rồi ghi hệ quả thật vào state và trả về một
 * đoạn kể để lượt sau AI đọc được. Thắng thật, thua thật, thương tích thật.
 *
 * FILE NÀY KHÔNG GHI STORE. Nó trả `PatchOp` cho người gọi chốt một lần qua MVU
 * với actor `engine` (R2) — cùng luật với ba màn hình minigame, và vì cùng một
 * lý do: người gọi mới là chỗ giữ ngăn xếp undo.
 */

import type { Rng } from '@/core/rng';
import { squashOps } from '@/state/mvu';
import type { PatchOp } from '@/state/mvu-parse';
import type { GameState } from '@/state/slices';
import {
  DUEL_STREAM,
  autoDuel,
  endingName,
  practiceOps,
  type DuelState,
  type SideId as DuelSide,
} from '@/minigames/duel';
import {
  BATTLE_STREAM,
  ENDINGS,
  autoBattle,
  settleAftermath,
  type BattleState,
  type SideId as BattleSide,
} from '@/minigames/battle';
import {
  SIEGE_STREAM,
  autoChooseOption,
  cloneSiege,
  eventDefOf,
  reputationOps,
  resolveEvent,
  runWeek,
  settle,
  siegeConfig,
  summarise,
  type SiegeState,
} from '@/systems/siege';
import { autoBesiegerAction } from '@/minigames/siege-attack';
import { autoDefenderAction } from '@/minigames/siege-defense';
import type { BuiltEncounter } from './build';
import type { AutoOutcome } from './types';
import { battleCampaignOps, siegeCampaignOps } from '@/systems/campaign';

/** Vị trí dòng xúc sắc về lại save — không ghi thì trận sau tung lại đúng chuỗi này (R3). */
function rngOp(stream: string, rng: Rng): PatchOp {
  return {
    op: 'set',
    path: `meta.rng.streams.${stream}`,
    to: rng.getState(),
    reason: `vị trí dòng xúc sắc sau trận engine đánh thay (${stream})`,
    source: 'json',
  };
}

// ---------------------------------------------------------------------------
// Kể lại
// ---------------------------------------------------------------------------

/** Số vết thương NGƯỜI CHƠI nhận trong trận. Id rỗng là quy ước của Phần 5. */
function woundsTaken(duel: DuelState, side: DuelSide): number {
  const fighter = side === 'a' ? duel.a : duel.b;
  return duel.rounds.reduce(
    (sum, round) => sum + round.injuries.filter((injury) => injury.actorId === fighter.id).length,
    0,
  );
}

export interface CombatSummary {
  /** Đoạn kể, đi vào dòng diễn biến và vào prompt của lượt sau. */
  summary: string;
  /** Một dòng cơ học ngắn cho `TurnEntry.outcome`. */
  outcome: string;
}

export function duelSummary(duel: DuelState, side: DuelSide = 'a'): CombatSummary {
  const foe = side === 'a' ? duel.b : duel.a;
  const rounds = duel.rounds.length;
  const wounds = woundsTaken(duel, side);
  const verdict =
    duel.winner === '' ? 'không phân thắng bại' : duel.winner === side ? 'ngài thắng' : `${foe.name} thắng`;

  return {
    summary:
      `Trận đấu với ${foe.name} đã xong sau ${String(rounds)} hiệp: ${verdict} — ${endingName(duel.ending)}. ` +
      (wounds === 0 ? 'Ngài bước ra không mang thêm vết nào.' : `Ngài mang thêm ${String(wounds)} vết thương.`),
    outcome: `Quyết đấu · ${String(rounds)} hiệp · ${endingName(duel.ending)} · ${verdict}`,
  };
}

export function battleSummary(battle: BattleState, side: BattleSide = 'a'): CombatSummary {
  const verdict =
    battle.winner === '' ? 'không bên nào giữ được chiến trường' : battle.winner === side ? 'phe ngài thắng' : 'phe ngài thua';
  const after = battle.aftermath;
  const ours = after === null ? 0 : after.losses[side] + after.pursuitKills[side];
  const theirs =
    after === null ? 0 : after.losses[side === 'a' ? 'b' : 'a'] + after.pursuitKills[side === 'a' ? 'b' : 'a'];

  return {
    summary:
      `Trận đánh kết thúc: ${ENDINGS[battle.ending] ?? battle.ending} — ${verdict}. ` +
      (after === null
        ? ''
        : `Phe ngài mất ${String(ours)} người, bên kia mất ${String(theirs)}. ${after.lordStanding}`),
    outcome: `Dã chiến · ${ENDINGS[battle.ending] ?? battle.ending} · ${verdict}`,
  };
}

export function siegeSummary(siege: SiegeState): CombatSummary {
  const report = summarise(siege);
  const mine = siege.playerSide;
  const verdict =
    report.winner === '' ? 'không ngã ngũ' : report.winner === mine ? 'phe ngài thắng' : 'phe ngài thua';

  return {
    summary:
      `Cuộc vây hãm ${siege.fort.name} khép lại sau ${String(report.weeks)} tuần: ${report.endingName} — ${verdict}. ` +
      `Bên vây còn ${String(report.attackerLeft)}/${String(report.attackerStart)} người; ` +
      `trong tường còn ${String(report.defenderLeft)}/${String(report.defenderStart)}.`,
    outcome: `Vây hãm · ${String(report.weeks)} tuần · ${report.endingName} · ${verdict}`,
  };
}

// ---------------------------------------------------------------------------
// Engine đánh thay
// ---------------------------------------------------------------------------

function autoDuelOutcome(duel: DuelState, state: GameState, rng: Rng): AutoOutcome {
  const final = autoDuel(duel, rng);
  const told = duelSummary(final, 'a');
  return {
    // `squashOps`: trận đấu tích op qua từng hiệp trên một bản làm việc, nên ba
    // vết thương sinh ra ba `set` chồng nhau trên `body.nextInjuryNo`. Xem chú
    // thích của hàm ấy trong `state/mvu.ts`.
    ops: squashOps([
      ...final.playerOps,
      ...practiceOps({ ...final, state }, 'a'),
      rngOp(DUEL_STREAM, rng),
    ]),
    summary: told.summary,
    outcome: told.outcome,
  };
}

function autoBattleOutcome(battle: BattleState, state: GameState, rng: Rng): AutoOutcome {
  // Truy kích, tù binh, tiền chuộc, thương binh (mục 12) là một PHẦN của trận,
  // không phải một màn hình sau trận: bỏ nó đi thì bỏ qua một trận đánh sẽ rẻ
  // hơn đánh nó, và người chơi học được rằng cách chơi tốt nhất là không chơi.
  const final = settleAftermath(autoBattle(battle, rng), rng);
  const told = battleSummary(final, final.playerSide);
  return {
    ops: squashOps([...final.playerOps, ...battleCampaignOps(state, final), rngOp(BATTLE_STREAM, rng)]),
    summary: told.summary,
    outcome: told.outcome,
  };
}

/**
 * Chạy một cuộc vây hãm tới lúc nó tự kết thúc.
 *
 * Cả hai bên đều do engine cầm, kể cả bên người chơi — `autoBesiegerAction` và
 * `autoDefenderAction` là đúng hai bộ chọn mà bài test 26 tuần của Phần 11 đã
 * dùng. Popup sự kiện cũng tự chọn, theo `autoChooseOption` nhưng CHO PHE NGƯỜI
 * CHƠI: mặc định của hàm ấy là chọn cho phe kia.
 *
 * Trần `maxWeeks` là lưới an toàn của R4: một cấu hình data hỏng không được phép
 * treo vòng lặp. Hết trần mà chưa xong thì bên vây rút — kết cục có thật của
 * phần lớn những cuộc vây hãm thế kỷ 14.
 */
function autoSiegeOutcome(siege: SiegeState, state: GameState, rng: Rng): AutoOutcome {
  const ceiling = siegeConfig().maxWeeks;
  let current = siege;

  for (let guard = 0; guard < ceiling && !current.finished; guard++) {
    const pending = current.pendingEvent;
    if (pending !== null) {
      const def = eventDefOf(pending.eventId);
      if (def === null) break;
      current = resolveEvent(current, rng, autoChooseOption(current, def, current.playerSide));
      continue;
    }
    current = runWeek(current, rng, {
      attacker: autoBesiegerAction(current),
      defender: autoDefenderAction(current),
      payTroops: true,
    }).siege;
  }

  if (!current.finished) {
    current = cloneSiege(current);
    settle(current, true);
  }

  const told = siegeSummary(current);
  return {
    ops: squashOps([...current.playerOps, ...reputationOps(current), ...siegeCampaignOps(state, current), rngOp(SIEGE_STREAM, rng)]),
    summary: told.summary,
    outcome: told.outcome,
  };
}

/**
 * Cửa vào: đánh trọn ván đã dựng, không có người.
 *
 * `rng` phải là dòng riêng của minigame ấy, đã khôi phục vị trí — cùng ràng
 * buộc với `buildEncounter`, và cùng một dòng ấy phải được dùng cho cả hai bước.
 */
export function autoResolve(built: BuiltEncounter, state: GameState, rng: Rng): AutoOutcome {
  if (built.kind === 'battle') return autoBattleOutcome(built.battle, state, rng);
  if (built.kind === 'siege') return autoSiegeOutcome(built.siege, state, rng);
  return autoDuelOutcome(built.duel, state, rng);
}
