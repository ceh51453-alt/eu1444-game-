/**
 * THẺ `<DieuQuan>` — cửa DUY NHẤT để diễn biến truyện dời được một đạo quân.
 *
 * Người kể chuyện viết "Bá tước ra lệnh kéo quân về Champagne" và nó sẽ muốn
 * ghi thẳng vị trí mới. Không được: một câu văn không đưa nổi ba nghìn người qua
 * bốn trăm cây số, và nếu nó đưa được thì cả cơ chế vây thành, cắt tiếp tế và
 * cứu viện của chiến đồ mất sạch lý do tồn tại.
 *
 * Thẻ này nhận đúng cái mà người kể chuyện có quyền quyết — HƯỚNG ĐI — rồi giao
 * phần còn lại cho engine: đường nào, mấy chặng, mấy ngày. Đúng khuôn
 * `<RequestRecruitment>` của Phần 13: truyện ĐỀ NGHỊ, engine QUYẾT (R1).
 *
 * Đích viết ở tầng nào cũng được. "Về Pháp" hạ xuống thủ phủ của Pháp, vì người
 * ta ra lệnh bằng tên nước chứ không bằng tên huyện.
 */

import type { PatchOp } from '@/state/mvu-parse';
import type { GameState } from '@/state/slices';
import { campaignNode } from './data';
import { moveArmyFromNarrative, placementOf } from './march';
import { campaignStateOf } from './slice';

const TAG_PATTERN = /<DieuQuan\b([^>]*?)\/?>/gi;
const ATTR_PATTERN = /([\w-]+)\s*=\s*"([^"]*)"|([\w-]+)\s*=\s*'([^']*)'/g;

export interface AiMarchRequest {
  armyId: string;
  toNodeId: string;
}

export function parseMarchOrders(raw: string): AiMarchRequest[] {
  const rows: AiMarchRequest[] = [];
  TAG_PATTERN.lastIndex = 0;
  for (let match = TAG_PATTERN.exec(raw); match !== null; match = TAG_PATTERN.exec(raw)) {
    const found: Record<string, string> = {};
    ATTR_PATTERN.lastIndex = 0;
    for (let attr = ATTR_PATTERN.exec(match[1] ?? ''); attr !== null; attr = ATTR_PATTERN.exec(match[1] ?? '')) {
      found[(attr[1] ?? attr[3] ?? '').toLowerCase()] = attr[2] ?? attr[4] ?? '';
    }
    const armyId = found['dao-quan'] ?? found['army'] ?? '';
    const toNodeId = found['toi'] ?? found['to'] ?? found['dich'] ?? '';
    if (armyId === '' || toNodeId === '') continue;
    rows.push({ armyId, toNodeId });
  }
  // Trần ba lệnh một lượt: một đoạn văn ra lệnh cho cả mười đạo quân là dấu hiệu
  // model đang kể lại toàn bộ cuộc chiến trong một lượt, không phải một cảnh.
  return rows.slice(0, 3);
}

export function stripMarchOrders(raw: string): string {
  return raw.replace(TAG_PATTERN, '').trim();
}

export interface AiMarchOutcome {
  ops: PatchOp[];
  log: string[];
}

/**
 * Đổi thẻ thành LỆNH HÀNH QUÂN.
 *
 * Lệnh hỏng thì ghi lý do vào log và đạo quân đứng nguyên — không có chuyện
 * "đi được nửa đường rồi tính sau" (R4).
 */
export function handleAiMarchOrders(state: GameState, raw: string): AiMarchOutcome {
  const requests = parseMarchOrders(raw);
  const original = campaignStateOf(state);
  if (requests.length === 0 || original === null) return { ops: [], log: [] };

  let campaign = original;
  const log: string[] = [];

  for (const request of requests) {
    const result = moveArmyFromNarrative(campaign, request.armyId, request.toNodeId);
    if (result.refused !== '') {
      log.push(`Từ chối lệnh điều quân của diễn biến: ${result.refused}.`);
      continue;
    }
    campaign = result.campaign;
    log.push(...result.lines);
  }

  if (campaign === original) return { ops: [], log };
  return {
    log,
    ops: [
      {
        op: 'set',
        path: 'campaign',
        from: original,
        to: campaign,
        reason: 'diễn biến truyện đã ra lệnh điều quân',
        source: 'json',
      },
    ],
  };
}

export interface MarchableArmy {
  id: string;
  name: string;
  /** Ô đang đứng, hoặc ô vừa rời khi đang trên đường. */
  where: string;
  stance: string;
  /** Ô sắp tới, rỗng khi đứng yên. */
  heading: string;
  daysLeft: number;
}

/**
 * Dòng cho khối prompt quân đội: đạo quân nào đang ở đâu và đang đi đâu.
 *
 * Người kể chuyện phải THẤY được là quân đang trên đường, nếu không nó sẽ viết
 * "đạo quân đóng ở Troyes" trong khi đạo quân ấy còn cách Troyes mười ngày — và
 * một câu văn như thế sai theo cách người chơi phát hiện ra ngay khi nhìn bản đồ.
 */
export function marchableArmies(state: GameState): MarchableArmy[] {
  const campaign = campaignStateOf(state);
  if (campaign === null) return [];
  return campaign.armies.map((army) => {
    const place = placementOf(army);
    return {
      id: army.id,
      name: army.name,
      where: campaignNode(place.fromId)?.name ?? place.fromId,
      stance: army.stance,
      heading: place.toId === '' ? '' : (campaignNode(place.toId)?.name ?? place.toId),
      daysLeft: place.daysLeft,
    };
  });
}
