/**
 * MỞ TAB THẾ GIỚI TỪ VÁN CHƠI ĐANG CHẠY.
 *
 * KHÁC HẲN `openRealm` của Phần 13, và khác đúng ở chỗ quan trọng nhất: màn hình
 * lãnh thổ trả về `null` khi người chơi chưa có thái ấp nào, còn tab Thế giới thì
 * KHÔNG BAO GIỜ trả về `null`. Mục 1 nói thẳng: bảng trạng thái quốc gia luôn xem
 * được từ lượt đầu tiên, dù người chơi là nông nô.
 *
 * Nếu save chưa có gì trong slice `nations` thì dựng thế giới từ data ngay tại
 * đây — một ván chơi mới vẫn phải có tám thế lực để nhìn.
 */

import { currentRegion } from '@/lore/knowledge';
import { worldStateOf, type ArrivedNews } from '@/sim';
import { computeDerived } from '@/state/derived';
import { applyPatch } from '@/state/mvu';
import type { PatchOp } from '@/state/mvu-parse';
import type { GameState } from '@/state/slices';
import { useGameStore } from '@/state/store';
import { heldTitles, type HeldTitle } from '@/systems/titles';
import { createEconomy } from '@/systems/economy/model';
import { economyStateOf, type EconomySliceState } from '@/systems/economy/slice';
import { openCampaign, type OpenCampaign } from '@/ui/campaign';
import type { KnowledgeRow } from './Chronicle';
import {
  createWorld,
  nationsStateOf,
  religionsStateOf,
  type NationsSliceState,
  type ReligionsSliceState,
} from '@/systems/nations';

export interface OpenWorld {
  /**
   * CHIẾN ĐỒ đi kèm tab Thế giới thay vì mở một cửa thứ bảy.
   *
   * Cùng lý do mà biên niên sử và bản đồ tri thức nằm ở đây: nó trả lời tiếp
   * đúng câu hỏi mà tab này đã đặt ra — *"ngoài kia đang xảy ra chuyện gì"* —
   * chỉ là bằng đất đai thay vì bằng tin tức.
   */
  campaign: OpenCampaign;
  nations: NationsSliceState;
  religions: ReligionsSliceState;
  economy: EconomySliceState;
  titles: HeldTitle[];
  year: number;
  /** Dòng tin đã tới tai người chơi — Biên niên sử của Phần 15 mục 11 đọc nó. */
  feed: ArrivedNews[];
  /** Biến phụ `banDoTriThuc`. Tính ở đây một lần, không tính lại trong React. */
  knowledge: KnowledgeRow[];
  hereRegionId: string;
}

/**
 * Bản đồ tri thức lấy từ BIẾN PHỤ, không tự tính.
 *
 * `banDoTriThuc` đăng ký ở `sim/slice.ts` và là công thức duy nhất trả lời "ta
 * nắm rõ vùng nào". Một hàm thứ hai ở tầng UI sẽ lệch với nó ngay lần cân bằng
 * đầu tiên, và người chơi sẽ thấy hai con số cho cùng một vùng.
 */
function knowledgeRows(state: GameState): KnowledgeRow[] {
  const derived = computeDerived(state, { strict: false });
  const raw = derived['banDoTriThuc'];
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (row): row is KnowledgeRow =>
      typeof row === 'object' && row !== null && typeof (row as { regionId?: unknown }).regionId === 'string',
  );
}

export function openWorld(state: GameState): OpenWorld {
  const year = state.meta.gameDate.year;
  const existingNations = nationsStateOf(state);
  const existingReligions = religionsStateOf(state);
  const existingEconomy = economyStateOf(state);
  const feed = [...(worldStateOf(state)?.feed ?? [])];
  const knowledge = knowledgeRows(state);
  const hereRegionId = currentRegion(state);

  if (existingNations !== null && existingNations.powers.length > 0 && existingReligions !== null) {
    const economy = existingEconomy !== null && existingEconomy.markets.length > 0
      ? existingEconomy
      : createEconomy(existingNations);
    if (existingEconomy !== null && existingEconomy.markets.length === 0) {
      const seeded = applyPatch(
        state,
        [{
          op: 'set',
          path: 'economy',
          from: existingEconomy,
          to: economy,
          reason: 'dựng nền kinh tế khởi đầu cho các thế lực hiện có',
          source: 'json',
        }],
        { actor: 'engine' },
      );
      if (seeded.applied && seeded.next !== null) useGameStore.getState().commitBatch(seeded.next);
    }
    return {
      campaign: openCampaign(state),
      nations: existingNations,
      religions: existingReligions,
      economy,
      titles: heldTitles(state),
      year,
      feed,
      knowledge,
      hereRegionId,
    };
  }

  // VẠCH XUẤT PHÁT ĐI VÀO SAVE NGAY LẦN MỞ ĐẦU TIÊN, và nó phải đi qua MVU như
  // mọi thay đổi khác (R2). Nếu chỉ dựng trong bộ nhớ rồi trả về thì mỗi lần mở
  // tab là một thế giới mới toanh — hồng y vừa chết sống lại, cuộc chiến vừa nổ
  // ra chưa từng xảy ra — và người chơi không có cách nào biết cái nào là thật.
  const fresh = createWorld();
  const freshEconomy = createEconomy(fresh.nations);
  const ops: PatchOp[] = [
    { op: 'set', path: 'nations', to: fresh.nations, reason: 'Phần 14: dựng tám thế lực từ data', source: 'json' },
    { op: 'set', path: 'religions', to: fresh.religions, reason: 'Phần 14: dựng bản đồ tôn giáo từ data', source: 'json' },
    { op: 'set', path: 'economy', to: freshEconomy, reason: 'dựng sản xuất, kho hàng và ngân sách thế giới', source: 'json' },
  ];
  // `skipPermissions`: engine đang ghi kết quả của chính nó, không phải AI đề
  // xuất — cùng lý do và cùng khuôn với lúc chốt một năm cai trị ở Phần 13.
  const result = applyPatch(state, ops, { actor: 'engine', skipPermissions: true });
  if (result.applied && result.next !== null) {
    useGameStore.getState().commitBatch(result.next);
  }

  return {
    // Sau `commitBatch`: chiến đồ đọc phe của người chơi từ state đã chốt, chứ
    // không từ bản chụp cũ vừa bị thay.
    campaign: openCampaign(useGameStore.getState().snapshot()),
    nations: fresh.nations,
    religions: fresh.religions,
    economy: freshEconomy,
    titles: heldTitles(state),
    year,
    feed,
    knowledge,
    hereRegionId,
  };
}
