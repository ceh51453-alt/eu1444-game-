/**
 * CỬA VÀO CHIẾN ĐỒ TỪ VÁN CHƠI ĐANG CHẠY.
 *
 * Cùng khuôn với `openWorld` của Phần 14: màn hình chỉ nhận một bản chụp, và
 * mọi thay đổi đi qua MVU rồi mới về store (R2). Một `set()` thẳng vào store là
 * một thay đổi mà undo không tua lại được — người chơi lùi một lượt và thành trì
 * họ vừa chiếm vẫn đổi màu.
 *
 * Ở đây cũng là chỗ nối CHIẾN ĐỒ với QUÂN LỰC, và ranh giới ấy chỉ có một câu:
 * slice `military` giữ QUÂN SỐ, slice `campaign` giữ VỊ TRÍ. Không slice nào đọc
 * thẳng vào slice kia — lớp UI này bắc cầu, đúng như `App.tsx` vẫn bắc cầu giữa
 * các minigame và state.
 */

import { currentRegion } from '@/lore/knowledge';
import { applyPatch } from '@/state/mvu';
import type { PatchOp } from '@/state/mvu-parse';
import type { GameState } from '@/state/slices';
import { useGameStore } from '@/state/store';
import { militaryStateOf } from '@/systems/military/slice';
import {
  ancestorAtLevel,
  campaignStateOf,
  deployArmy,
  emptyCampaign,
  nodeForRegion,
  seatDistrictOf,
  type CampaignSliceState,
} from '@/systems/campaign';

export interface PlayerForceRow {
  id: string;
  name: string;
  troops: number;
}

export interface OpenCampaign {
  campaign: CampaignSliceState;
  /** Phe người chơi, suy từ nơi họ đang đứng nếu save chưa ghi. */
  playerFactionId: string;
  /** Huyện tương ứng với vị trí hiện tại của nhân vật. Rỗng nếu không tra được. */
  hereNodeId: string;
  /** Đạo quân THẬT của người chơi ở slice `military` — chưa chắc đã lên bản đồ. */
  forces: PlayerForceRow[];
}

export function openCampaign(state: GameState): OpenCampaign {
  const campaign = campaignStateOf(state) ?? emptyCampaign();
  const hereRegionId = currentRegion(state);
  const hereNode = hereRegionId === '' ? null : nodeForRegion(hereRegionId);
  const hereNodeId = hereNode === null ? '' : seatDistrictOf(hereNode.id);

  const suyRa = hereNode === null ? '' : (ancestorAtLevel(hereNode.id, 1)?.ownerId ?? '');
  const playerFactionId = campaign.playerFactionId === '' ? suyRa : campaign.playerFactionId;

  const military = militaryStateOf(state);
  const forces: PlayerForceRow[] = (military?.forces ?? [])
    .filter((force) => force.kind === 'land')
    .map((force) => ({
      id: force.id,
      name: force.name,
      troops: force.units.reduce((total, unit) => total + unit.strength, 0),
    }));

  return { campaign, playerFactionId, hereNodeId, forces };
}

/** Ghi một trạng thái chiến đồ mới qua MVU. Trả về `false` khi patch bị từ chối. */
export function commitCampaign(next: CampaignSliceState, reason: string): boolean {
  const store = useGameStore.getState();
  const snapshot = store.snapshot();
  const current = campaignStateOf(snapshot);
  const ops: PatchOp[] = [
    {
      op: 'set',
      path: 'campaign',
      ...(current === null ? {} : { from: current }),
      to: next,
      reason,
      source: 'json',
    },
  ];
  // `skipPermissions`: engine đang ghi kết quả của chính nó chứ không phải AI đề
  // xuất — cùng khuôn với lúc dựng thế giới ở `openWorld`.
  const applied = applyPatch(snapshot, ops, { actor: 'engine', skipPermissions: true });
  if (!applied.applied || applied.next === null) return false;
  store.commitBatch(applied.next);
  return true;
}

/**
 * ĐƯA ĐẠO QUÂN THẬT LÊN BẢN ĐỒ, và cập nhật quân số cho những đạo đã có.
 *
 * Quân số ở chiến đồ là BẢN SAO ĐỂ VẼ NHÃN chứ không phải nguồn sự thật, nên nó
 * được ghi đè từ `military` mỗi lần mở màn hình. Vị trí thì KHÔNG bao giờ bị ghi
 * đè kiểu ấy: một đạo quân đang ở giữa đường mà bị "đồng bộ" về chỗ người chơi
 * đứng chính là cú dịch chuyển mà cả `march.ts` sinh ra để chặn.
 */
export function syncPlayerArmies(
  campaign: CampaignSliceState,
  forces: readonly PlayerForceRow[],
  params: { factionId: string; hereNodeId: string },
): { campaign: CampaignSliceState; lines: string[] } {
  let next = campaign;
  const lines: string[] = [];

  next = {
    ...next,
    armies: next.armies.map((army) => {
      const force = forces.find((row) => row.id === army.forceId);
      return force === undefined ? army : { ...army, troops: force.troops, name: force.name };
    }),
  };

  for (const force of forces) {
    if (next.armies.some((army) => army.forceId === force.id)) continue;
    if (params.hereNodeId === '' || force.troops <= 0) continue;
    const result = deployArmy(next, {
      id: `army_${force.id}`,
      name: force.name,
      factionId: params.factionId,
      forceId: force.id,
      troops: force.troops,
      nodeId: params.hereNodeId,
    });
    if (result.refused !== '') continue;
    next = result.campaign;
    lines.push(...result.lines);
  }

  if (params.factionId !== '' && next.playerFactionId !== params.factionId) {
    next = { ...next, playerFactionId: params.factionId };
  }

  return { campaign: next, lines };
}
