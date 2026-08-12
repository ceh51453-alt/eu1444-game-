/**
 * GIAI ĐOẠN 2 — TỔNG CÔNG, TRÊN LƯỚI CÓ TẦNG (Phần 11 mục 6).
 *
 * "Lưới có CHIỀU CAO: dưới hào, chân tường, mặt tường, sân trong, tháp chính.
 * Bên tấn công phải lần lượt vượt từng lớp. Mỗi lớp là một chỗ thắt cổ chai nơi
 * ít quân giữ được rất nhiều quân."
 *
 * MỘT QUYẾT ĐỊNH ĐÁNG GIẢI THÍCH, và nó là chỗ giai đoạn 2 khác Phần 10 nhiều
 * nhất: KHÔNG có lưới ô vuông ở đây. Phần 10 dựng lưới ô vuông vì trên đồng
 * trống, VỊ TRÍ là quyết định — đi vòng sườn, chiếm cao điểm, chặn chỗ qua sông.
 * Trên một bức tường thì không có chỗ nào để đi vòng: chỉ có ĐỘ CAO và CHIỀU
 * RỘNG MẶT TIỀN. Nên "lưới" ở đây là một chồng lớp, và biến quyết định duy nhất
 * là `frontage` — bao nhiêu người chạm được vào tuyến phòng thủ cùng một lúc.
 *
 * Đó chính là chỗ thắt cổ chai mục 6 nói tới, và nó là toàn bộ lý do một cuộc
 * tổng công tốn kém khủng khiếp: hai nghìn người không đánh được hai trăm người —
 * mỗi lần chỉ có bốn người đánh bốn người, một nghìn chín trăm chín mươi hai
 * người còn lại đứng dưới hào chờ tới lượt, và trong lúc chờ họ bị bắn.
 *
 * TỶ LỆ THƯƠNG VONG PHẢI RẤT CAO Ở CÁC CHỐT. Mục 6 viết thẳng: "Đó chính là lý
 * do tồn tại của thành trì. Nếu người chơi tổng công mà thắng dễ thì đã sai."
 */

import type { Rng } from '@/core/rng';
import type { CheckResult, DifficultyBand } from '@/core/turn';
import type { ChronicleRound } from '@/systems/combat/chronicle';
import { DIFFICULTY_BANDS } from '@/systems/check/difficulty';
import { runCheck } from '@/systems/check/run';
import {
  ASSAULT_DOMAIN,
  assaultConfig,
  assaultLayerOf,
  assaultMethodOf,
  assaultMethods,
  cloneSiege,
  damageGate,
  engineTypeOf,
  garrisonMen,
  killBesieger,
  killDefender,
  liveEngines,
  makeView,
  settle,
  siegeConfig,
  withSiegeView,
  type AssaultState,
  type AssaultWave,
  type SiegeState,
} from '@/systems/siege';

// ---------------------------------------------------------------------------
// Đường đi qua các lớp
// ---------------------------------------------------------------------------

/**
 * Cách vượt QUYẾT ĐỊNH ĐI QUA NHỮNG LỚP NÀO, và đó là toàn bộ giá trị của bảng cơ
 * chế ở mục 6.
 *
 * Xe húc và chỗ tường sập đều BỎ QUA MẶT TƯỜNG — tức là bỏ qua đúng cái lớp có
 * `frontage: 2` và lợi thế tuyệt đối thuộc bên thủ. Đó chính là lý do người ta
 * chịu bắn ba tuần để mở một lỗ thủng thay vì bắc thang ngay tuần đầu.
 */
export function layerPath(siege: SiegeState, methodId: string): string[] {
  const method = assaultMethodOf(methodId);
  const path: string[] = [];

  if (siege.fort.moat !== null && siege.fort.moat.filled < 1) path.push('duoi-hao');
  path.push('chan-tuong');
  if (method === null || (!method.requiresBreach && !method.targetsGate)) path.push('mat-tuong');
  path.push('san-trong');
  path.push('thap-chinh');

  return path.filter((id) => assaultLayerOf(id) !== null);
}

/** Những cách đánh dùng được ngay bây giờ — máy đã dựng, tường đã vỡ hay chưa. */
export function availableMethods(siege: SiegeState): string[] {
  const wall = siege.fort.heldLayer === 'tuong-trong' ? siege.fort.innerWall : siege.fort.outerWall;
  const engines = liveEngines(siege);
  return assaultMethods()
    .filter((method) => {
      if (method.requiresBreach && !(wall?.breached ?? false)) return false;
      if (method.requiresEngine !== '') {
        const has = engines.some((engine) => engine.typeId === method.requiresEngine);
        if (!has) return false;
        const type = engineTypeOf(method.requiresEngine);
        // Tháp công thành không lăn qua hào được. Vế này là lý do "lấp hào" tồn tại.
        if (type?.requiresMoatFilled === true && siege.fort.moat !== null && siege.fort.moat.filled < 1) return false;
      }
      return true;
    })
    .map((method) => method.id);
}

// ---------------------------------------------------------------------------
// Bậc độ khó của một lớp
// ---------------------------------------------------------------------------

function shiftBand(band: DifficultyBand, steps: number): DifficultyBand {
  const index = DIFFICULTY_BANDS.indexOf(band);
  const moved = Math.max(0, Math.min(DIFFICULTY_BANDS.length - 1, index + steps));
  return DIFFICULTY_BANDS[moved] ?? band;
}

export interface AssaultBreakdown {
  band: DifficultyBand;
  lines: { label: string; value: string }[];
}

/**
 * SỐ HIT CẦN, không phải một dòng modifier — cùng ngoại lệ có chủ ý mà Phần 10 đã
 * khai ở `battle/modifiers.ts`.
 *
 * Ở hệ pool, sức giữ của một lớp KHÔNG bớt viên xúc sắc của bên tấn công: nó đặt
 * SỐ THÀNH CÔNG CẦN qua thang độ khó chuẩn hóa của Phần 5 mục 8. Nhét nó vào danh
 * sách điều chỉnh dưới dạng "−4 viên" là nói dối người đọc về thứ vừa xảy ra. Bản
 * chi tiết in ra ở đây, và UI hiện nó ngay cạnh cú tung.
 */
export function assaultBreakdown(siege: SiegeState, layerId: string): AssaultBreakdown {
  const config = assaultConfig();
  const layer = assaultLayerOf(layerId);
  const lines: { label: string; value: string }[] = [];
  if (layer === null) return { band: 'thuong', lines };

  let band = layer.band;
  lines.push({ label: `${layer.name} — ${layer.note}`, value: `mặt tiền ${String(layer.frontage)}` });

  const wall = siege.fort.heldLayer === 'tuong-trong' ? siege.fort.innerWall : siege.fort.outerWall;
  if ((wall?.breached ?? false) && (layerId === 'chan-tuong' || layerId === 'mat-tuong')) {
    band = shiftBand(band, -config.breachEasesBand);
    lines.push({ label: 'Tường đã vỡ — không phải trèo nữa', value: `dễ hơn ${String(config.breachEasesBand)} bậc` });
  }

  const start = siege.weeks[0]?.defenderMen ?? garrisonMen(siege.fort);
  const share = start <= 0 ? 1 : garrisonMen(siege.fort) / start;
  if (share < config.thinGarrisonShare) {
    band = shiftBand(band, -config.thinGarrisonEasesBand);
    lines.push({
      label: `Quân đồn trú chỉ còn ${Math.round(share * 100)}% — không đủ người đứng kín tường`,
      value: `dễ hơn ${String(config.thinGarrisonEasesBand)} bậc`,
    });
  }

  if (siege.defender.garrisonMorale < 25) {
    band = shiftBand(band, -1);
    lines.push({ label: `Sĩ khí bên thủ ${Math.round(siege.defender.garrisonMorale)}/100`, value: 'dễ hơn 1 bậc' });
  }

  lines.push({ label: 'Bậc cuối cùng', value: band });
  return { band, lines };
}

// ---------------------------------------------------------------------------
// Mở một cuộc tổng công
// ---------------------------------------------------------------------------

export interface AssaultSetup {
  methodId: string;
  /** Phần đạo quân đưa vào mỗi đợt. Không khai thì lấy `waveShare` của data. */
  waveShare?: number;
  /** Có cử ĐỘI TIÊN PHONG đi trước không (mục 6). */
  forlornHope?: boolean;
  /** Người chơi tự dẫn đội tiên phong — sẽ chuyển sang Phần 9 khi lên tới mặt tường. */
  playerLeads?: boolean;
}

export function startAssault(siege: SiegeState, setup: AssaultSetup): SiegeState {
  const next = cloneSiege(siege);
  if (next.finished || next.assault !== null) return next;

  const config = assaultConfig();
  const share = setup.waveShare ?? config.waveShare;
  const path = layerPath(next, setup.methodId);
  const first = path[0] ?? 'chan-tuong';

  const waves: AssaultWave[] = [];
  let committed = 0;

  if (setup.forlornHope === true) {
    const men = Math.max(20, Math.round(next.attacker.troops * config.forlornHope.share));
    committed += men;
    waves.push({
      id: 'wave_tien-phong',
      name: 'Đội tiên phong',
      men,
      startMen: men,
      layerId: first,
      methodId: setup.methodId,
      forlorn: true,
      playerLed: setup.playerLeads === true,
      losses: 0,
      through: false,
      spent: false,
    });
  }

  const waveMen = Math.max(30, Math.round(next.attacker.troops * share));
  const count = Math.max(1, Math.floor((next.attacker.troops - committed) / waveMen));
  for (let index = 0; index < count; index++) {
    committed += waveMen;
    waves.push({
      id: `wave_${String(index + 1)}`,
      name: `Đợt ${String(index + 1)}`,
      men: waveMen,
      startMen: waveMen,
      layerId: first,
      methodId: setup.methodId,
      forlorn: false,
      playerLed: false,
      losses: 0,
      through: false,
      spent: false,
    });
  }

  next.phase = 'tong-cong';
  next.assault = {
    round: 1,
    waves,
    reserve: Math.max(0, next.attacker.troops - committed),
    attackerLosses: 0,
    defenderLosses: 0,
    taken: [],
    finished: false,
    succeeded: null,
    log: [
      `Kèn thổi lúc rạng sáng. ${String(committed)} người tiến về phía tường theo ${
        assaultMethodOf(setup.methodId)?.name.toLowerCase() ?? 'lối đã định'
      }.`,
    ],
    rounds: [],
    duelling: false,
  };
  next.log.push({ week: next.week, side: 'vay', text: next.assault.log[0] ?? '', major: true });
  return next;
}

// ---------------------------------------------------------------------------
// Một hiệp tổng công
// ---------------------------------------------------------------------------

export interface AssaultRoundResult {
  siege: SiegeState;
  round: ChronicleRound;
  /** Đợt vừa vào được bên trong. Rỗng nghĩa là chưa ai qua. */
  through: string[];
  checks: CheckResult[];
}

function activeWaves(assault: AssaultState): AssaultWave[] {
  return assault.waves.filter((wave) => !wave.spent && !wave.through && wave.men > 0);
}

export function assaultRound(siege: SiegeState, rng: Rng): AssaultRoundResult {
  const next = cloneSiege(siege);
  const assault = next.assault;
  if (assault === null || assault.finished) {
    return { siege: next, round: emptyRound(next), through: [], checks: [] };
  }

  const config = assaultConfig();
  const through: string[] = [];
  const checks: CheckResult[] = [];
  const moves: string[] = [];
  const wings: NonNullable<ChronicleRound['battle']>['wings'] = [];

  // CHỖ THẮT CỔ CHAI: mỗi lớp chỉ cho ngần ấy đợt chạm vào cùng một lúc. Những đợt
  // còn lại đứng chờ — và đứng chờ dưới chân tường là chỗ chết nhiều nhất.
  const atLayer = new Map<string, number>();

  for (const wave of activeWaves(assault)) {
    const layer = assaultLayerOf(wave.layerId);
    const method = assaultMethodOf(wave.methodId);
    if (layer === null || method === null) {
      wave.spent = true;
      continue;
    }

    const already = atLayer.get(wave.layerId) ?? 0;
    if (already >= layer.frontage) {
      // Chờ tới lượt, và bị bắn trong lúc chờ.
      const idle = Math.round(wave.men * config.casualtyBase * 0.35 * layer.exposure);
      wave.men = Math.max(0, wave.men - idle);
      wave.losses += idle;
      assault.attackerLosses += killBesieger(next, idle, 'combat');
      moves.push(`${wave.name} nêm lại phía sau ở ${layer.name.toLowerCase()}, mất ${String(idle)} người trong lúc chờ.`);
      continue;
    }
    atLayer.set(wave.layerId, already + 1);

    const breakdown = assaultBreakdown(next, wave.layerId);
    const run = withSiegeView(
      makeView(next, 'vay', { layerId: wave.layerId, methodId: wave.methodId, forlorn: wave.forlorn }),
      () =>
        runCheck(rng, {
          id: 'siege.tong-cong',
          system: 'pool',
          domain: ASSAULT_DOMAIN,
          difficulty: breakdown.band,
          base: Math.max(
            1,
            Math.min(config.maxDice, Math.round((wave.men / 100) * config.dicePerHundred) + (wave.forlorn ? 2 : 0)),
          ),
          actor: next.playerSide === 'vay' ? '' : 'npc_vay',
          tags: ['tong-cong', wave.layerId],
          state: next.state,
        }),
    );
    checks.push(run.result);
    next.checks.push({ week: next.week, side: 'vay', what: `${layer.name} — ${method.name}`, result: run.result });

    // Thương vong: nhân dồn ba hệ số, và cả ba đều là lựa chọn của người chơi —
    // lớp nào, cách nào, có cử đội tiên phong không.
    const tierFactor =
      run.result.tier === 'critFail' ? 2.4 : run.result.tier === 'fail' ? 1.7 : run.result.tier === 'costlySuccess' ? 1.1 : 0.6;
    const forlornFactor = wave.forlorn ? config.forlornHope.casualtyMultiplier : 1;
    const dead = Math.round(wave.men * config.casualtyBase * layer.exposure * method.exposure * tierFactor * forlornFactor);

    wave.men = Math.max(0, wave.men - dead);
    wave.losses += dead;
    assault.attackerLosses += killBesieger(next, dead, 'combat');

    // Bên thủ cũng chết — nhưng ít hơn nhiều, và đó LÀ lý do tồn tại của thành trì.
    const defenderDead = Math.round(dead * config.defenderCasualtyShare);
    assault.defenderLosses += killDefender(next, defenderDead, 'combat');

    if (method.targetsGate) {
      const type = engineTypeOf(method.requiresEngine);
      const hit = damageGate(next.fort, (type?.gateDamage ?? 20) * (run.result.tier === 'critSuccess' ? 2 : 1));
      for (const line of hit.lines) moves.push(line);
    }

    // NGƯỠNG GÃY. Một đợt mất quá nửa người thì tụt xuống — người ta bỏ chạy
    // trước khi chết hết, và đó là lý do một cuộc tổng công hỏng để lại một đạo
    // quân tơi tả chứ không để lại một bãi trống.
    const broken = wave.men <= wave.startMen * (1 - config.breakOffShare);

    if (run.result.tier === 'critFail' || wave.men <= 0 || broken) {
      wave.spent = true;
      moves.push(
        `${wave.name} gãy ở ${layer.name.toLowerCase()}: mất ${String(dead)} người và tụt xuống, không lên lại được.`,
      );
    } else if (run.result.tier === 'fail') {
      moves.push(`${wave.name} bị đánh bật khỏi ${layer.name.toLowerCase()}, mất ${String(dead)} người.`);
    } else {
      const path = layerPath(next, wave.methodId);
      const index = path.indexOf(wave.layerId);
      const nextLayer = path[index + 1];
      if (nextLayer === undefined) {
        wave.through = true;
        through.push(wave.name);
        moves.push(`${wave.name} vào được ${layer.name.toLowerCase()} và không còn gì chắn phía trước nữa.`);
      } else {
        wave.layerId = nextLayer;
        if (!assault.taken.includes(layer.id)) assault.taken.push(layer.id);
        moves.push(
          `${wave.name} qua được ${layer.name.toLowerCase()} — mất ${String(dead)} người — và tới ${
            assaultLayerOf(nextLayer)?.name.toLowerCase() ?? nextLayer
          }.`,
        );
      }
    }

    wings.push({
      side: 'vay',
      wing: wave.name,
      strength: wave.men,
      morale: next.attacker.morale,
      state: wave.through ? 'vào được trong' : wave.spent ? 'gãy' : (assaultLayerOf(wave.layerId)?.name ?? wave.layerId),
    });
  }

  wings.push({
    side: 'thu',
    wing: 'Quân đồn trú',
    strength: garrisonMen(next.fort),
    morale: next.defender.garrisonMorale,
    state: `giữ ${next.fort.heldLayer}`,
  });

  const round: ChronicleRound = {
    n: assault.round,
    actions: [],
    injuries: [],
    tempoAfter: { vay: next.attacker.morale, thu: next.defender.garrisonMorale },
    staminaAfter: { vay: next.attacker.troops, thu: garrisonMen(next.fort) },
    battle: { wings, moves, routed: assault.waves.filter((wave) => wave.spent).map((wave) => wave.name), orders: [] },
  };
  if (through.length > 0) round.highlight = 'turningPoint';
  else if (assault.waves.some((wave) => wave.spent)) round.highlight = 'nearDeath';

  assault.rounds.push(round);
  assault.log.push(...moves);
  assault.round += 1;

  settleAssault(next);
  next.rngState = rng.getState();
  return { siege: next, round, through, checks };
}

function emptyRound(siege: SiegeState): ChronicleRound {
  return {
    n: siege.assault?.round ?? 0,
    actions: [],
    injuries: [],
    tempoAfter: { vay: siege.attacker.morale, thu: siege.defender.garrisonMorale },
    staminaAfter: { vay: siege.attacker.troops, thu: garrisonMen(siege.fort) },
  };
}

// ---------------------------------------------------------------------------
// Chốt
// ---------------------------------------------------------------------------

/**
 * Cuộc tổng công xong khi nào.
 *
 * MỘT ĐỢT VÀO ĐƯỢC TRONG LÀ XONG, không cần đợt nào khác. Một khi có người đứng
 * trong sân và cổng mở từ bên trong thì cả bức tường mất hết ý nghĩa cùng lúc —
 * đó là hình dạng thật của một cuộc tổng công, và nó cũng là lý do bên thủ đổ tất
 * cả vào việc giữ cho không ai qua được lớp đầu tiên.
 */
export function settleAssault(siege: SiegeState): void {
  const assault = siege.assault;
  if (assault === null || assault.finished) return;
  const config = assaultConfig();

  if (assault.waves.some((wave) => wave.through)) {
    assault.finished = true;
    assault.succeeded = true;
    siege.finished = true;
    siege.winner = 'vay';
    siege.ending = 'ha-bang-tong-cong';
    siege.phase = 'xong';
    assault.log.push('Cổng mở từ bên trong. Cuộc vây hãm kết thúc ở đây.');
    siege.log.push({ week: siege.week, side: 'vay', text: 'Thành bị hạ bằng tổng công.', major: true });
    return;
  }

  if (activeWaves(assault).length === 0 || assault.round > config.maxRounds) {
    assault.finished = true;
    assault.succeeded = false;
    siege.phase = 'vay-ham';
    // MỘT CUỘC TỔNG CÔNG HỎNG KHÔNG CHỈ MẤT NGƯỜI. Sĩ khí đổ theo, và đó là lý do
    // mục 1 gọi nó là NƯỚC CUỐI CÙNG: đánh hụt một lần thì cuộc vây hãm sau đó
    // khó hơn hẳn lúc chưa đánh.
    siege.attacker.morale = Math.max(0, siege.attacker.morale - 22);
    siege.defender.garrisonMorale = Math.min(100, siege.defender.garrisonMorale + 16);
    siege.defender.populationMorale = Math.min(100, siege.defender.populationMorale + 12);
    assault.log.push(
      `Đợt cuối tụt xuống khỏi chân tường lúc gần trưa. ${String(assault.attackerLosses)} người nằm lại trong hào và trên dốc gạch.`,
    );
    siege.log.push({
      week: siege.week,
      side: 'vay',
      text: `Tổng công thất bại: mất ${String(assault.attackerLosses)} người, bên thủ mất ${String(assault.defenderLosses)}.`,
      major: true,
    });
    settle(siege);
  }
}

/** Đánh trọn một cuộc tổng công, không có người — bài test và mô phỏng ngầm dùng. */
export function runAssault(siege: SiegeState, rng: Rng, setup: AssaultSetup): SiegeState {
  let current = startAssault(siege, setup);
  const guard = assaultConfig().maxRounds + 2;
  for (let index = 0; index < guard; index++) {
    if (current.assault?.finished !== false) break;
    current = assaultRound(current, rng).siege;
  }
  if (current.assault !== null && !current.assault.finished) {
    current = cloneSiege(current);
    if (current.assault !== null) {
      current.assault.finished = true;
      current.assault.succeeded = false;
    }
  }
  return current;
}

/** Con số bảng tổng kết của UI đọc sau khi tổng công xong. */
export interface AssaultSummary {
  succeeded: boolean;
  rounds: number;
  attackerLosses: number;
  defenderLosses: number;
  /** Tỷ lệ thương vong bên tấn công trên số người đã đưa vào các đợt. */
  attackerShare: number;
  layersTaken: string[];
  forlornWiped: boolean;
}

export function assaultSummary(siege: SiegeState): AssaultSummary | null {
  const assault = siege.assault;
  if (assault === null) return null;
  const committed = assault.waves.reduce((sum, wave) => sum + wave.men + wave.losses, 0);
  const forlorn = assault.waves.find((wave) => wave.forlorn);
  return {
    succeeded: assault.succeeded === true,
    rounds: assault.rounds.length,
    attackerLosses: assault.attackerLosses,
    defenderLosses: assault.defenderLosses,
    attackerShare: committed <= 0 ? 0 : assault.attackerLosses / committed,
    layersTaken: assault.taken.map((id) => assaultLayerOf(id)?.name ?? id),
    forlornWiped: forlorn !== undefined && forlorn.men <= 0,
  };
}

/** Đội tiên phong sống sót thì được thưởng rất lớn (mục 6). */
export function forlornReward(siege: SiegeState): { reputation: number; loot: number; morale: number; line: string } | null {
  const wave = siege.assault?.waves.find((entry) => entry.forlorn);
  if (wave === undefined) return null;
  const config = siegeConfig().assault.forlornHope;

  if (wave.men <= 0) {
    return {
      reputation: 0,
      loot: 0,
      morale: config.moraleIfWiped,
      line: 'Không ai trong đội tiên phong quay lại. Người ta sẽ nhớ tên họ, và đó là tất cả những gì họ được.',
    };
  }
  if (!wave.through) {
    return {
      reputation: Math.round(config.reputation * 0.3),
      loot: 0,
      morale: 0,
      line: `${String(wave.men)} người của đội tiên phong tụt xuống được và còn sống. Trong đạo quân, từ nay họ đi trước ở mọi hàng.`,
    };
  }
  return {
    reputation: config.reputation,
    loot: config.loot,
    morale: config.moraleIfHolds,
    line: `Đội tiên phong giữ được chỗ đứng trên tường cho tới khi đợt sau lên tới. ${String(
      wave.men,
    )} người sống sót, và mỗi người trong số đó vừa đổi đời.`,
  };
}
