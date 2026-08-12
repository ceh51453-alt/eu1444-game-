/**
 * PHÁT EVENT RA NGOÀI — Phần 14 mục 12.
 *
 * "MỌI TUYÊN BỐ CỦA GIÁO HOÀNG đều phát event ra toàn thế giới → popup (Phần
 * 15)" (mục 2.7). Không riêng Giáo hoàng: mọi biến cố `scope: 'chau-luc'` đều đi
 * ra eventbus, vì Phần 15 không đọc state của Phần 14 — nó nghe.
 *
 * HAI LUẬT của eventbus (`core/eventbus.ts`) áp nguyên vẹn ở đây:
 * handler KHÔNG ghi state, và thứ tự giao là cố định. Nên hàm ở file này chỉ
 * PHÁT; ai muốn biến một biến cố thành state thì tự dựng `PatchOp` và cho qua MVU.
 *
 * Ba loại event, và chúng khác nhau ở chỗ AI ĐANG NGHE:
 *
 *   `nations.world`         dòng thời gian châu lục — Phần 15 và tab Thế giới
 *   `nations.proclamation`  tuyên bố lớn cần POPUP ngay — vạ, cấm chế, thập tự chinh
 *   `nations.fall`          một thế lực vừa sụp — Phần 15 phải vẽ lại bản đồ
 */

import { events } from '@/core/eventbus';
import { powerName } from './data';
import type { WorldEvent } from './types';

export const NATION_EVENT = 'nations.world';
export const PROCLAMATION_EVENT = 'nations.proclamation';
export const FALL_EVENT = 'nations.fall';

/** Tuyên bố lớn: thứ phải hiện thành popup chứ không chỉ nằm trong dòng thời gian. */
export interface Proclamation {
  /** Ai tuyên bố. Phần lớn là Giáo triều, nhưng Đế hội và Đại hãn cũng tuyên bố. */
  powerId: string;
  /** `va-tuyet-thong`, `cam-che`, `thap-tu-chinh`, `cai-cach`, `cap-sac`… */
  kind: string;
  targets: string[];
  year: number;
  text: string;
  /** Câu ngắn cho popup. Người chơi đọc cái này trước khi đọc gì khác. */
  headline: string;
}

/** Phát một biến cố. `noi-bo` chỉ vào dòng thời gian, `chau-luc` đi ra thế giới. */
export function emitWorldEvent(event: WorldEvent): void {
  events.emit(NATION_EVENT, event, 'nations');
}

export function emitWorldEvents(list: readonly WorldEvent[]): void {
  for (const event of list) emitWorldEvent(event);
}

/**
 * Phát một tuyên bố lớn.
 *
 * Phát CẢ HAI event là cố ý: popup nghe `nations.proclamation` để hiện ngay, còn
 * dòng thời gian nghe `nations.world` để ghi lại — và một tuyên bố không vào dòng
 * thời gian là một tuyên bố mà ba năm sau không ai tra lại được.
 */
export function proclaim(proclamation: Proclamation): WorldEvent {
  const event: WorldEvent = {
    id: `tuyen-bo-${proclamation.kind}-${String(proclamation.year)}-${proclamation.powerId}`,
    year: proclamation.year,
    powerId: proclamation.powerId,
    rippleId: '',
    text: proclamation.text,
    scope: 'chau-luc',
    targets: [...proclamation.targets],
  };
  events.emit(PROCLAMATION_EVENT, proclamation, 'nations');
  emitWorldEvent(event);
  return event;
}

/** Một thế lực sụp. Vẫn ở lại danh sách — Phần 15 cần biết ai đã từng có ở đó. */
export function emitFall(powerId: string, year: number, reason: string): WorldEvent {
  const event: WorldEvent = {
    id: `sup-${powerId}-${String(year)}`,
    year,
    powerId,
    rippleId: '',
    text: `${powerName(powerId)} sụp đổ: ${reason}`,
    scope: 'chau-luc',
    targets: [],
  };
  events.emit(FALL_EVENT, { powerId, year, reason }, 'nations');
  emitWorldEvent(event);
  return event;
}

/** Dựng một biến cố nội bộ — chuyện của một nước, không dội đi đâu. */
export function internalEvent(powerId: string, year: number, text: string, id?: string): WorldEvent {
  return {
    id: id ?? `${powerId}-${String(year)}-${String(Math.abs(hash(text)) % 100000)}`,
    year,
    powerId,
    rippleId: '',
    text,
    scope: 'noi-bo',
    targets: [],
  };
}

function hash(text: string): number {
  let value = 0;
  for (let index = 0; index < text.length; index++) {
    value = (Math.imul(value, 31) + text.charCodeAt(index)) | 0;
  }
  return value;
}
