/**
 * BIẾN BẢN SAO ĐÃ TÍNH XONG THÀNH `PatchOp[]`.
 *
 * Cả vòng lượt (`tick.ts`) lẫn chữa trị (`treat.ts`) đều làm cùng một việc:
 * chép cơ thể ra, sửa trên bản chép, rồi giao lại một lô op cho MVU. Chỗ chép
 * và chỗ sửa thì khác nhau, nhưng chỗ ĐỔI RA OP thì phải giống hệt — nếu không
 * sẽ có ngày một đường ghi được sẹo còn đường kia thì quên.
 *
 * Không hàm nào ở đây ghi store (R2). Chúng trả op, và người gọi đưa qua MVU
 * với actor `engine`.
 */

import type { PatchOp } from '@/state/mvu-parse';
import { readPath, type GameState } from '@/state/slices';
import { permanentOf } from './catalog';
import { regionOf } from './regions';
import type { BodyLogEntry, BodyState, PermanentEntry } from './slice';

/** Sổ tay thời gian giữ lại bao nhiêu dòng (mục 10). */
export const LOG_SOFT_LIMIT = 200;

export interface ScarEntry {
  site: string;
  cause: string;
  note: string;
}

/** Những thứ một lượt sinh ra ngoài chính con số trên cơ thể. */
export interface BodyMutation {
  logs: BodyLogEntry[];
  scars: ScarEntry[];
  /** Dòng chữ để người gọi in ra — bài test mục 11 và tab Debug đọc chỗ này. */
  lines: string[];
}

export function newMutation(): BodyMutation {
  return { logs: [], scars: [], lines: [] };
}

export function note(
  mutation: BodyMutation,
  turn: number,
  kind: BodyLogEntry['kind'],
  text: string,
  regionId = '',
): void {
  mutation.logs.push({ turn, kind, text, regionId });
  mutation.lines.push(text);
}

/**
 * Ghi một tàn phế vĩnh viễn, và ghi luôn sẹo sang Phần 6 (mục 8).
 *
 * Hai việc đi liền nhau ở đúng một chỗ, vì mục 8 nói chúng là một: tàn phế phải
 * "đồng thời tự thêm sẹo vào `appearance.scars`". Tách ra hai lời gọi là mở
 * đường cho một trong hai bị quên.
 */
export function addPermanent(
  body: BodyState,
  mutation: BodyMutation,
  id: string,
  regionId: string,
  turn: number,
  cause: string,
): void {
  const row = permanentOf(id);
  if (row === null) return;
  // Cùng một tàn phế ở cùng một vùng chỉ ghi một lần: hai dòng "cụt chân phải"
  // nghĩa là mức phạt bị cộng đôi và không ai lần ra được vì sao.
  if (body.permanent.some((entry) => entry.id === id && entry.regionId === regionId)) return;

  const entry: PermanentEntry = { id, regionId, turn, cause };
  body.permanent.push(entry);
  note(mutation, turn, 'tan-phe', `TÀN PHẾ VĨNH VIỄN: ${row.name} (${cause})`, regionId);
  mutation.scars.push({
    site: regionOf(regionId)?.name ?? regionId,
    cause: row.scarCause === '' ? row.name : row.scarCause,
    note: `lượt ${turn}`,
  });
}

function changed(before: unknown, after: unknown): boolean {
  return JSON.stringify(before) !== JSON.stringify(after);
}

/**
 * Lô op cho một lượt cơ thể.
 *
 * `body.injuries` ghi CẢ MẢNG chứ không ghi từng ô: mỗi lượt gần như mọi vết
 * đều đổi ít nhất một trong bốn con số (chảy máu, nhiễm trùng, đau, tiến độ),
 * nên hai mươi op lẻ chỉ làm nhật ký patch của Phần 2 mục 8 dài ra mà không nói
 * thêm được gì. `reason` mới là chỗ giải thích, và nó có ở mọi op.
 */
export function diffOps(
  before: BodyState,
  after: BodyState,
  mutation: BodyMutation,
  state: GameState,
  reason: string,
): PatchOp[] {
  const ops: PatchOp[] = [];
  const set = (path: string, to: unknown, why: string): void => {
    ops.push({ op: 'set', path, to, reason: why, source: 'json' });
  };

  if (changed(before.injuries, after.injuries)) set('body.injuries', after.injuries, reason);
  if (before.blood !== after.blood) set('body.blood', after.blood, 'máu còn lại');
  if (before.fever !== after.fever) set('body.fever', after.fever, 'sốt theo mức nhiễm trùng');
  if (before.feverTurns !== after.feverTurns) set('body.feverTurns', after.feverTurns, 'đếm lượt sốt cao liên tiếp');
  if (before.nextInjuryNo !== after.nextInjuryNo) set('body.nextInjuryNo', after.nextInjuryNo, 'cấp id cho vết mới');
  if (changed(before.diseases, after.diseases)) set('body.diseases', after.diseases, 'diễn tiến bệnh');
  if (changed(before.permanent, after.permanent)) set('body.permanent', after.permanent, 'ghi tàn phế vĩnh viễn');
  if (changed(before.prosthetics, after.prosthetics)) set('body.prosthetics', after.prosthetics, 'dụng cụ hỗ trợ');
  if (changed(before.will, after.will)) set('body.will', after.will, 'ý chí tạm thời từ cầu nguyện');
  if (changed(before.aiRequests, after.aiRequests)) set('body.aiRequests', after.aiRequests, 'đếm đề nghị của AI trong lượt');

  if (after.dead && !before.dead) {
    set('body.dead', true, 'điều kiện tử vong của mục 9');
    set('body.deathCause', after.deathCause, 'nguyên nhân tử vong cụ thể');
    set('body.deathTurn', after.deathTurn, 'lượt tử vong');
  }

  if (mutation.logs.length > 0) {
    // Cắt sổ tay TRƯỚC rồi mới nối dòng mới, trong CÙNG một lô: xem ghi chú ở
    // `bodySchema.log` về vì sao trần schema rộng hơn trần thật.
    const drop = before.log.length + mutation.logs.length - LOG_SOFT_LIMIT;
    if (drop > 0) set('body.log', before.log.slice(drop), 'cắt bớt dòng thời gian cũ');
    for (const entry of mutation.logs) {
      ops.push({ op: 'push', path: 'body.log', to: entry, reason: entry.text, source: 'json' });
    }
  }

  // Mục 8: sẹo ghi sang `appearance.scars` của Phần 6 — đúng quyền `engine` mà
  // slice `character` đã khai sẵn cho Phần 7. Nhân vật chưa dựng ngoại hình thì
  // bỏ qua, chứ không tự tạo ra một `appearance` rỗng ở nửa chừng ván chơi.
  if (mutation.scars.length > 0 && readPath(state, 'character.appearance') !== undefined) {
    for (const scar of mutation.scars) {
      ops.push({
        op: 'push',
        path: 'character.appearance.scars',
        to: scar,
        reason: `sẹo ở ${scar.site}`,
        source: 'json',
      });
    }
  }

  return ops;
}
