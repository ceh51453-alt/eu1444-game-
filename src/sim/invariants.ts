/**
 * CHỐNG TRÔI DẠT — Phần 15 mục 9.
 *
 * Mô phỏng dài hạn dễ trôi về những trạng thái vô lý, và kiểu trôi nguy hiểm
 * nhất không phải kiểu làm game crash — mà kiểu chạy êm suốt bốn mươi năm rồi
 * người chơi mở bản đồ ra và thấy một châu Âu không ai nhận ra, không có một
 * dòng nhật ký nào chỉ được chỗ nó bắt đầu lệch.
 *
 * BA HÀNG RÀO, và mục 9 đòi đủ cả ba:
 *
 *  1. **KIỂM TRA BẤT BIẾN SAU MỖI TICK SÂU.** Dân số không âm, không ai giữ hai
 *     lần cùng một tước, không có quốc gia không đất, người chết không hành
 *     động. Vi phạm → ghi log, **tự sửa** về trạng thái hợp lệ gần nhất, và
 *     **KHÔNG im lặng bỏ qua**.
 *  2. **TRẦN BIẾN ĐỘNG.** Một tháng không thể làm một quốc gia mất quá X% lãnh
 *     thổ, trừ khi có chiến tranh thật đã mô phỏng.
 *  3. **NHẬT KÝ ĐẦY ĐỦ**, tua lại được để tìm chỗ hỏng.
 *
 * VÌ SAO TỰ SỬA CHỨ KHÔNG NÉM: một bất biến vỡ giữa tick sâu là bug của engine,
 * và R4 nói bug của engine không được làm chết lượt của người chơi. Nhưng "tự
 * sửa" ở đây luôn đi kèm một dòng trong `repairs`, và dòng ấy nổi lên tận tab
 * Debug — sửa lặng lẽ là cách chắc chắn nhất để một bug sống mãi.
 */

import type { GameDate } from '@/core/clock';
import { driftConfig, invariantNotes } from './data';
import type { WorldSliceState } from './slice';

/** Bảng quốc gia rút gọn — chỉ những trường mà mục 9 cần kiểm. */
export interface PowerSnapshot {
  id: string;
  land: number;
  treasury: number;
  prestige: number;
  stability: number;
  cohesion: number;
  military: number;
  fallen: boolean;
}

export interface TitleHolding {
  titleId: string;
  holderId: string;
}

export interface InvariantInput {
  world: WorldSliceState;
  powers: readonly PowerSnapshot[];
  titles: readonly TitleHolding[];
  date: GameDate;
}

export interface InvariantResult {
  world: WorldSliceState;
  powers: PowerSnapshot[];
  titles: TitleHolding[];
  /** Mỗi dòng là một vi phạm ĐÃ SỬA. Rỗng nghĩa là tháng ấy sạch. */
  repairs: string[];
}

function note(id: string): string {
  return invariantNotes().get(id) ?? id;
}

/**
 * Chạy cả bảy phép kiểm và sửa tại chỗ.
 *
 * THỨ TỰ CÓ NGHĨA: dọn agent chết trước, vì mọi phép kiểm sau đó đều giả định
 * danh sách agent đã sạch. Dọn thẻ mồ côi cuối cùng, vì các bước trên có thể vừa
 * xoá mất biến cố mà một tấm thẻ đang trỏ tới.
 */
export function enforceInvariants(input: InvariantInput): InvariantResult {
  const repairs: string[] = [];
  let world = input.world;
  const stamp = `${String(input.date.month)}/${String(input.date.year)}`;

  // --- inv_nguoi-chet-khong-hanh-dong --------------------------------------
  const acting = world.agents.filter((agent) => !agent.alive && agent.pendingActions.length > 0);
  if (acting.length > 0) {
    repairs.push(`[${stamp}] inv_nguoi-chet-khong-hanh-dong: ${note('inv_nguoi-chet-khong-hanh-dong')} — ${String(acting.length)} người chết vẫn còn việc đang làm, đã huỷ`);
    world = {
      ...world,
      agents: world.agents.map((agent) => (agent.alive ? agent : { ...agent, pendingActions: [], tier: 'C' as const })),
    };
  }

  // --- inv_agent-co-tang ----------------------------------------------------
  const badTier = world.agents.filter((agent) => agent.tier !== 'A' && agent.tier !== 'B' && agent.tier !== 'C');
  if (badTier.length > 0) {
    repairs.push(`[${stamp}] inv_agent-co-tang: ${note('inv_agent-co-tang')} — ${String(badTier.length)} agent không có tầng hợp lệ, đã đưa về C`);
    const broken = new Set(badTier.map((agent) => agent.npcId));
    world = {
      ...world,
      agents: world.agents.map((agent) => (broken.has(agent.npcId) ? { ...agent, tier: 'C' as const } : agent)),
    };
  }

  // --- inv_dan-so-khong-am --------------------------------------------------
  const negative = world.agents.filter(
    (agent) => agent.resources.men < 0 || agent.resources.influence < 0 || agent.age < 0,
  );
  if (negative.length > 0) {
    repairs.push(`[${stamp}] inv_dan-so-khong-am: ${note('inv_dan-so-khong-am')} — ${String(negative.length)} agent có chỉ số âm, đã kẹp về 0`);
    world = {
      ...world,
      agents: world.agents.map((agent) => ({
        ...agent,
        age: Math.max(0, agent.age),
        resources: {
          ...agent.resources,
          men: Math.max(0, Math.min(100, agent.resources.men)),
          influence: Math.max(0, Math.min(100, agent.resources.influence)),
        },
      })),
    };
  }

  // --- inv_do-tin-cay-trong-khoang ------------------------------------------
  const outOfRange = world.feed.filter((item) => item.confidence < 0 || item.confidence > 100);
  if (outOfRange.length > 0) {
    repairs.push(`[${stamp}] inv_do-tin-cay-trong-khoang: ${note('inv_do-tin-cay-trong-khoang')} — ${String(outOfRange.length)} tin lệch khoảng, đã kẹp`);
    world = {
      ...world,
      feed: world.feed.map((item) => ({ ...item, confidence: Math.max(0, Math.min(100, item.confidence)) })),
    };
  }

  // --- inv_tin-khong-di-nguoc-thoi-gian -------------------------------------
  const stampOf = (date: GameDate): number => date.year * 372 + date.month * 31 + date.day;
  const backwards = world.feed.filter((item) => stampOf(item.arrivedAt) < stampOf(item.occurredAt));
  if (backwards.length > 0) {
    repairs.push(`[${stamp}] inv_tin-khong-di-nguoc-thoi-gian: ${note('inv_tin-khong-di-nguoc-thoi-gian')} — ${String(backwards.length)} tin tới trước lúc chuyện xảy ra, đã dời ngày tới`);
    world = {
      ...world,
      feed: world.feed.map((item) =>
        stampOf(item.arrivedAt) < stampOf(item.occurredAt) ? { ...item, arrivedAt: item.occurredAt } : item,
      ),
    };
  }

  // --- inv_mot-tuoc-mot-nguoi -----------------------------------------------
  const titles: TitleHolding[] = [];
  const heldBy = new Map<string, string>();
  for (const row of input.titles) {
    const existing = heldBy.get(row.titleId);
    if (existing !== undefined && existing !== row.holderId) {
      repairs.push(`[${stamp}] inv_mot-tuoc-mot-nguoi: ${note('inv_mot-tuoc-mot-nguoi')} — tước "${row.titleId}" có hai người giữ, giữ lại "${existing}"`);
      continue;
    }
    heldBy.set(row.titleId, row.holderId);
    titles.push(row);
  }

  // --- inv_quoc-gia-co-dat --------------------------------------------------
  const powers = input.powers.map((power) => {
    if (power.fallen || power.land > 0) return power;
    repairs.push(`[${stamp}] inv_quoc-gia-co-dat: ${note('inv_quoc-gia-co-dat')} — "${power.id}" còn sống mà không còn đất, đã đánh dấu sụp đổ`);
    return { ...power, fallen: true };
  });

  // --- thẻ mồ côi ----------------------------------------------------------
  const eventIds = new Set(world.events.map((event) => event.id));
  const orphans = world.cards.filter((cardId) => !eventIds.has(cardId));
  if (orphans.length > 0) {
    repairs.push(`[${stamp}] thẻ mồ côi: ${String(orphans.length)} tấm trỏ vào biến cố đã bị dọn, đã gỡ`);
    world = { ...world, cards: world.cards.filter((cardId) => eventIds.has(cardId)) };
  }

  if (repairs.length > 0) {
    const limit = driftConfig().logLimit;
    world = { ...world, repairs: [...world.repairs, ...repairs].slice(-limit) };
  }

  return { world, powers, titles, repairs };
}

// ---------------------------------------------------------------------------
// Trần biến động (mục 9, vế 2)
// ---------------------------------------------------------------------------

export interface DriftInput {
  before: readonly PowerSnapshot[];
  after: readonly PowerSnapshot[];
  /** Id thế lực đang có chiến tranh THẬT đã mô phỏng — miễn trần lãnh thổ. */
  atWar: ReadonlySet<string>;
  date: GameDate;
}

export interface DriftResult {
  powers: PowerSnapshot[];
  /** Mỗi dòng là một lần kéo về trần. */
  clamped: string[];
}

/**
 * Kẹp mọi thay đổi của một tháng về trong trần.
 *
 * `warExempt` là ngoại lệ DUY NHẤT, và nó hẹp có chủ ý: chỉ LÃNH THỔ được miễn,
 * và chỉ khi cặp ấy thật sự đang có chiến tranh trong ma trận quan hệ của Phần
 * 14. Uy tín, ổn định, gắn kết và quân lực vẫn bị kẹp kể cả trong chiến tranh —
 * một nước có thể mất nửa lãnh thổ trong một chiến dịch, nhưng không thể mất một
 * nửa sự gắn kết dân tộc trong ba mươi ngày.
 */
export function capDrift(input: DriftInput): DriftResult {
  const config = driftConfig();
  const clamped: string[] = [];
  const stamp = `${String(input.date.month)}/${String(input.date.year)}`;
  const byId = new Map(input.before.map((power) => [power.id, power]));

  const powers = input.after.map((power) => {
    const before = byId.get(power.id);
    if (before === undefined) return power;

    let next = power;
    const exempt = config.warExempt && input.atWar.has(power.id);

    if (!exempt && before.land > 0) {
      const floor = before.land * (1 - config.maxLandLossPct / 100);
      const ceiling = before.land * (1 + config.maxLandGainPct / 100);
      if (next.land < floor) {
        clamped.push(`[${stamp}] "${power.id}" mất quá trần lãnh thổ (${next.land.toFixed(1)} → ${floor.toFixed(1)})`);
        next = { ...next, land: floor };
      } else if (next.land > ceiling) {
        clamped.push(`[${stamp}] "${power.id}" lấy quá trần lãnh thổ (${next.land.toFixed(1)} → ${ceiling.toFixed(1)})`);
        next = { ...next, land: ceiling };
      }
    }

    const meters: (keyof PowerSnapshot)[] = ['prestige', 'stability', 'cohesion', 'military'];
    for (const key of meters) {
      const from = before[key];
      const to = next[key];
      if (typeof from !== 'number' || typeof to !== 'number') continue;
      const delta = to - from;
      if (Math.abs(delta) <= config.maxMeterDelta) continue;
      const capped = from + Math.sign(delta) * config.maxMeterDelta;
      clamped.push(`[${stamp}] "${power.id}" ${String(key)} đổi quá trần (${to.toFixed(1)} → ${capped.toFixed(1)})`);
      next = { ...next, [key]: capped };
    }

    const treasuryRoom = Math.abs(before.treasury) * config.maxTreasuryFactor + 100;
    const treasuryDelta = next.treasury - before.treasury;
    if (Math.abs(treasuryDelta) > treasuryRoom) {
      const capped = before.treasury + Math.sign(treasuryDelta) * treasuryRoom;
      clamped.push(`[${stamp}] "${power.id}" ngân khố đổi quá trần (${next.treasury.toFixed(0)} → ${capped.toFixed(0)})`);
      next = { ...next, treasury: capped };
    }

    return next;
  });

  return { powers, clamped };
}

/** Đưa nhật ký vào slice, cắt theo trần. Nhật ký đầy đủ nằm ở Tầng B. */
export function appendLog(world: WorldSliceState, lines: readonly string[]): WorldSliceState {
  if (lines.length === 0) return world;
  const limit = driftConfig().logLimit;
  return { ...world, log: [...world.log, ...lines].slice(-limit) };
}
