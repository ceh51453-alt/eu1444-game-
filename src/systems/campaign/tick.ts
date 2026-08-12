/**
 * NHỊP CỦA CHIẾN ĐỒ — chỗ thời gian biến thành quãng đường.
 *
 * Gắn vào nhịp NHANH của Phần 15 chứ không phải nhịp sâu: một đạo quân phải bò
 * thêm được vài chục cây số ngay trong cái lượt mà người chơi ngồi uống rượu
 * trong quán trọ, chứ không đợi tới đầu tháng mới nhích một cái. Đó là toàn bộ
 * lý do `march.ts` đo bằng NGÀY.
 *
 * Cuộc vây chạy theo TUẦN vì Phần 11 tính theo tuần, và hai đồng hồ lệch nhịp
 * nhau thì một cuộc vây trên bản đồ sẽ dài hơn hoặc ngắn hơn chính nó trong
 * minigame. Số ngày lẻ không bị vứt đi: nó cộng dồn qua `weeks` dạng số thực.
 */

import { seasonOfDate, type GameDate } from '@/core/clock';
import type { PatchOp } from '@/state/mvu-parse';
import type { GameState } from '@/state/slices';
import { captureObjective } from './conquest';
import { advanceMarches, advanceSieges } from './march';
import { campaignStateOf } from './slice';

export interface CampaignTickResult {
  ops: PatchOp[];
  lines: string[];
}

export function runCampaignTick(state: GameState, days: number, date: GameDate): CampaignTickResult {
  const campaign = campaignStateOf(state);
  if (campaign === null || days <= 0) return { ops: [], lines: [] };
  if (campaign.armies.length === 0 && campaign.sieges.length === 0) return { ops: [], lines: [] };

  const lines: string[] = [];

  const marched = advanceMarches(campaign, days, seasonOfDate(date));
  lines.push(...marched.lines);

  const besieged = advanceSieges(marched.campaign, days / 7);
  lines.push(...besieged.lines);

  // THỊ TRẤN tường thấp: phong toả đủ lâu là mở cổng, và chiến đồ tự xử. THÀNH
  // TRÌ thì không — `advanceSieges` chỉ đánh dấu "đã đủ tuần", kết cục là của
  // Phần 11. Hai engine công thành chạy song song sẽ nói khác nhau.
  let next = besieged.campaign;
  for (const row of besieged.fallen) {
    const result = captureObjective(next, row.nodeId, row.factionId);
    if (result.refused !== '') continue;
    next = result.campaign;
    lines.push(...result.lines);
  }

  if (next === campaign) return { ops: [], lines: [] };

  return {
    ops: [
      {
        op: 'set',
        path: 'campaign',
        from: campaign,
        to: next,
        reason: `chiến đồ trôi ${String(days)} ngày: hành quân, vây hãm`,
        source: 'json',
      },
    ],
    lines: lines.map((line) => `[chiến đồ] ${line}`),
  };
}
