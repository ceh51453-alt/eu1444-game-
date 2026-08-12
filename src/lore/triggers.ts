/**
 * TRIGGER SỰ KIỆN GAME (Phần 4 mục 10).
 *
 * BA RÀNG BUỘC, KHÔNG ĐƯỢC NỚI — cả ba đều có lý do cụ thể:
 *
 * (a) Trigger CHỈ phát event. Nó không bao giờ ghi thẳng vào state. Hệ nào nghe
 *     event thì tự tính rồi trả về `PatchOp[]`, và op đó đi qua MVU như mọi
 *     thay đổi khác. Nếu lorebook ghi thẳng được thì một dòng trong file tri
 *     thức đã quyết được một con số — đúng thứ R1 cấm.
 *
 * (b) `triggerOnce` và `triggerCooldown` là bắt buộc. Không có chúng thì một
 *     entry khớp mỗi lượt sẽ bắn event mỗi lượt, và người chơi nhận cùng một
 *     tin đồn mười lần liên tiếp.
 *
 * (c) Mỗi lượt tối đa `MAX_LORE_EVENTS_PER_TURN` event. Vượt thì HOÃN sang lượt
 *     sau chứ không bắn dồn: một lượt bắn hai chục event là một lượt mà người
 *     chơi không hiểu chuyện gì vừa xảy ra.
 */

import { events } from '@/core/eventbus';
import type { GameDate } from '@/core/clock';
import type { PatchOp } from '@/state/mvu-parse';
import { readPath, type GameState } from '@/state/slices';
import { gainKnowledgeOp, memoryOf, rememberEntryOp } from './knowledge';
import type { ActivatedEntry } from './scanner';
import type { LoreTrigger } from './types';

/** Trần event mỗi lượt (mục 10c). */
export const MAX_LORE_EVENTS_PER_TURN = 5;

export const LORE_EVENTS = {
  knowledgeGain: 'lore.knowledge.gain',
  rumorSpread: 'lore.rumor.spread',
  notify: 'lore.notify',
  flagSet: 'lore.flag.set',
} as const;

export interface TriggerContext {
  state: GameState;
  turn: number;
  now: GameDate;
  regionId: string;
  /** Vùng ở lượt trước, để biết có phải vừa bước vào vùng mới không. */
  previousRegionId: string;
}

export interface FiredEvent {
  entryId: string;
  when: LoreTrigger['when'];
  event: string;
  payload: unknown;
}

export interface TriggerOutcome {
  fired: FiredEvent[];
  /** Vượt trần, để dành lượt sau (mục 10c). */
  deferred: FiredEvent[];
  /** Op do handler sinh ra. Người gọi đưa chúng qua MVU với actor `engine`. */
  ops: PatchOp[];
  /** Popup xếp hàng chờ Phần 15 hiện thực. */
  notices: { title: string; body: string }[];
  log: string[];
}

// ---------------------------------------------------------------------------
// Handler — chạy trong lúc emit, KHÔNG bao giờ chạm vào state
// ---------------------------------------------------------------------------

interface Collector {
  state: GameState;
  turn: number;
  ops: PatchOp[];
  notices: { title: string; body: string }[];
  log: string[];
}

let collector: Collector | null = null;

const OWNER = 'lore';

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value !== '' ? value : fallback;
}

/**
 * Đăng ký bốn handler dùng được ngay ở giai đoạn này (mục 10).
 *
 * Event gameplay — đổi tài nguyên, gây thương tích, khai chiến — CỐ Ý chưa có
 * handler. Phần 12–15 mới đăng ký, và tới lúc đó chúng có công thức thật để
 * tính. Đăng ký sớm bằng một con số đoán mò là cách nhanh nhất phá cân bằng.
 */
export function registerLoreHandlers(): void {
  events.unregister(OWNER);

  events.on(
    LORE_EVENTS.knowledgeGain,
    (event) => {
      if (collector === null) return;
      const payload = asRecord(event.payload);
      const id = text(payload['id']);
      if (id === '') return;

      const op = gainKnowledgeOp(
        collector.state,
        {
          id,
          source: text(payload['source'], 'lorebook'),
          confidence: typeof payload['confidence'] === 'number' ? payload['confidence'] : 70,
        },
        collector.turn,
      );
      if (op === null) collector.log.push(`đã biết "${id}" chắc hơn rồi, bỏ qua`);
      else collector.ops.push(op);
    },
    OWNER,
  );

  events.on(
    LORE_EVENTS.rumorSpread,
    (event) => {
      if (collector === null) return;
      const rumor = text(asRecord(event.payload)['text']);
      if (rumor === '') return;

      const existing = readPath(collector.state, 'character.notes.rumors');
      if (Array.isArray(existing) && existing.includes(rumor)) {
        collector.log.push('tin đồn đã có trong sổ, bỏ qua');
        return;
      }
      collector.ops.push({
        op: 'push',
        path: 'character.notes.rumors',
        to: rumor,
        reason: 'lorebook lan một tin đồn',
        source: 'json',
      });
    },
    OWNER,
  );

  events.on(
    LORE_EVENTS.notify,
    (event) => {
      if (collector === null) return;
      const payload = asRecord(event.payload);
      collector.notices.push({
        title: text(payload['title'], 'Thông báo'),
        body: text(payload['body']),
      });
    },
    OWNER,
  );

  events.on(
    LORE_EVENTS.flagSet,
    (event) => {
      if (collector === null) return;
      const flag = text(asRecord(event.payload)['flag']);
      if (flag === '') return;

      const existing = readPath(collector.state, 'character.flags');
      if (Array.isArray(existing) && existing.includes(flag)) return;

      // Mục 10: cờ tình tiết CHỈ được đặt vào path quyền 'ai'. `character.flags`
      // đúng loại đó; nếu ai đó đổi quyền của nó thành 'engine' thì MVU sẽ từ
      // chối op này, và từ chối là đúng.
      collector.ops.push({
        op: 'push',
        path: 'character.flags',
        to: flag,
        reason: 'lorebook đặt cờ tình tiết',
        source: 'json',
      });
    },
    OWNER,
  );
}

// ---------------------------------------------------------------------------
// Bắn
// ---------------------------------------------------------------------------

function stamp(date: GameDate): number {
  return ((date.year * 12 + (date.month - 1)) * 31 + (date.day - 1)) * 24 + date.hour;
}

/** Trigger này có hợp cảnh không (`when` của mục 10). */
function shouldFire(
  trigger: LoreTrigger,
  activated: ActivatedEntry,
  context: TriggerContext,
  triggerCount: number,
): { fire: boolean; reason: string } {
  switch (trigger.when) {
    case 'onActivate':
      return { fire: true, reason: 'entry vừa được kích hoạt' };

    case 'onFirstActivate':
      return triggerCount === 0
        ? { fire: true, reason: 'lần kích hoạt đầu tiên' }
        : { fire: false, reason: 'đã kích hoạt trước đó rồi' };

    case 'onEnterRegion': {
      if (context.regionId === context.previousRegionId) {
        return { fire: false, reason: 'chưa đổi vùng' };
      }
      const regions = activated.entry.regions ?? [];
      const inside = regions.length === 0 || regions.includes(context.regionId);
      return inside
        ? { fire: true, reason: `vừa bước vào ${context.regionId}` }
        : { fire: false, reason: 'vùng mới không nằm trong regions của entry' };
    }

    case 'onDateReached': {
      const from = activated.entry.validFrom;
      if (from === undefined) return { fire: false, reason: 'entry không khai validFrom' };
      if (stamp(context.now) < stamp(from)) return { fire: false, reason: 'chưa tới ngày' };
      return triggerCount === 0
        ? { fire: true, reason: 'đã tới ngày hẹn' }
        : { fire: false, reason: 'đã bắn ở lần tới ngày trước' };
    }

    default:
      return { fire: false, reason: 'loại trigger không nhận ra' };
  }
}

/**
 * Bắn trigger của các entry vừa kích hoạt.
 *
 * KHÔNG tự ghi state. Trả về `ops` để người gọi đưa qua MVU — đúng ràng buộc
 * (a). Kèm luôn op cập nhật bộ nhớ trigger, nếu không thì `triggerOnce` chỉ
 * đúng trong một phiên chạy.
 */
export function fireTriggers(
  activatedEntries: readonly ActivatedEntry[],
  context: TriggerContext,
): TriggerOutcome {
  const outcome: TriggerOutcome = { fired: [], deferred: [], ops: [], notices: [], log: [] };

  collector = { state: context.state, turn: context.turn, ops: [], notices: [], log: [] };

  try {
    for (const activated of activatedEntries) {
      const { entry } = activated;
      const triggers = entry.triggers ?? [];
      if (triggers.length === 0) continue;

      const memory = memoryOf(context.state, entry.id);

      if (entry.triggerOnce && memory.triggerCount > 0) {
        outcome.log.push(`"${entry.id}": triggerOnce — đã bắn rồi`);
        continue;
      }
      if (
        entry.triggerCooldown !== undefined &&
        memory.lastTriggeredTurn >= 0 &&
        context.turn - memory.lastTriggeredTurn < entry.triggerCooldown
      ) {
        outcome.log.push(
          `"${entry.id}": còn nghỉ ${entry.triggerCooldown} lượt (bắn gần nhất ở lượt ${memory.lastTriggeredTurn})`,
        );
        continue;
      }

      let firedForEntry = 0;
      for (const trigger of triggers) {
        const verdict = shouldFire(trigger, activated, context, memory.triggerCount);
        if (!verdict.fire) {
          outcome.log.push(`"${entry.id}" (${trigger.when}): ${verdict.reason}`);
          continue;
        }

        const event: FiredEvent = {
          entryId: entry.id,
          when: trigger.when,
          event: trigger.emit.event,
          payload: trigger.emit.payload,
        };

        if (outcome.fired.length >= MAX_LORE_EVENTS_PER_TURN) {
          outcome.deferred.push(event);
          outcome.log.push(
            `"${entry.id}": vượt trần ${MAX_LORE_EVENTS_PER_TURN} event mỗi lượt — hoãn sang lượt sau`,
          );
          continue;
        }

        const report = events.emit(trigger.emit.event, trigger.emit.payload, `lore:${entry.id}`);
        for (const failure of report.failures) {
          outcome.log.push(`handler "${failure.owner}" hỏng: ${failure.error}`);
        }
        outcome.fired.push(event);
        firedForEntry++;
      }

      if (firedForEntry > 0) {
        const remember = rememberEntryOp(context.state, entry.id, {
          lastTriggeredTurn: context.turn,
          triggerCount: memory.triggerCount + 1,
        });
        if (remember !== null) outcome.ops.push(remember);
      }
    }

    outcome.ops.push(...collector.ops);
    outcome.notices.push(...collector.notices);
    outcome.log.push(...collector.log);
  } finally {
    collector = null;
  }

  return outcome;
}
