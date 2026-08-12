/**
 * GIEO AGENT TỪ DỮ LIỆU — nơi thế giới có người để mà mô phỏng.
 *
 * Mục 2 nói *"mọi NPC đều CÓ mục tiêu lưu trong state"*, nhưng nó không nói NPC
 * ở đâu ra. Câu trả lời là `data/houses.json` của Phần 6: 130 gia tộc, mỗi gia
 * tộc một người đứng đầu, mỗi người một chỗ ngồi và một thứ bậc. Đó đã là một
 * châu Âu đủ đông để có chuyện xảy ra, và nó đã có sẵn — dựng thêm một danh sách
 * NPC riêng cho Phần 15 là hai sổ hộ tịch cho cùng một thế giới.
 *
 * SỨC NẶNG SUY TỪ THỨ BẬC, không bốc ngẫu nhiên: một vương thất phải khởi đầu
 * với nhiều tiền và nhiều người theo hơn một nhà hiệp sĩ, nếu không thì cây
 * quyết định của tầng B sẽ cho một hiệp sĩ vô danh đi vây thành Paris ở tháng
 * thứ ba.
 *
 * VÀ MỤC TIÊU BỐC THEO TÍNH CÁCH (`createAgent`), trừ khi gia tộc có yêu sách:
 * một nhà đang giữ tờ yêu sách với một lãnh thổ thì mục tiêu của họ đã được lịch
 * sử viết sẵn, và bốc ngẫu nhiên đè lên nó là vứt đi thứ mà `houses.json` đã
 * chép cẩn thận.
 */

import housesFile from '@data/houses.json';
import { createRng, type Rng } from '@/core/rng';
import type { PatchOp } from '@/state/mvu-parse';
import type { GameState } from '@/state/slices';
import { anchorOf } from './map';
import { createAgent, type AgentSeed } from './agents';
import { worldStateOf } from './slice';
import type { Agent } from './types';

interface HouseRow {
  id: string;
  name: string;
  tier?: string;
  realm?: string;
  seat?: string;
  province?: string;
  rank?: string;
  head?: string;
  headName?: string;
  status?: string;
  claims?: unknown[];
  rivals?: string[];
}

const HOUSES: readonly HouseRow[] = (housesFile as { houses?: HouseRow[] }).houses ?? [];

/**
 * Sức nặng của một nhà, 0–100.
 *
 * Thứ bậc quyết phần lớn; tình trạng ("thịnh", "suy", "lưu vong") kéo lên hoặc
 * dìm xuống. Một vương thất đang suy vẫn nặng hơn một nhà hiệp sĩ đang thịnh,
 * và đó là đúng với thế kỷ 14: cái tên vẫn còn giá dù cái kho đã cạn.
 */
const RANK_WEIGHT: Readonly<Record<string, number>> = {
  'hoang-de': 92,
  vuong: 80,
  'tuyen-hau': 72,
  'cong-tuoc': 66,
  'hau-tuoc': 56,
  'ba-tuoc': 48,
  'nam-tuoc': 38,
  'thuong-dan': 22,
};

const TIER_WEIGHT: Readonly<Record<string, number>> = {
  'vuong-that': 78,
  'dai-quy-toc': 60,
  'phu-ho': 46,
  'quy-toc-nho': 34,
};

const STATUS_SHIFT: Readonly<Record<string, number>> = {
  thinh: 8,
  suy: -12,
  'luu-vong': -22,
  'tuyet-tu': -18,
};

function weightOf(house: HouseRow): number {
  // Thứ bậc trước, hạng nhà sau: một nhà phú hộ không tước vẫn giàu, nhưng một
  // bá tước nghèo vẫn ra lệnh được cho người của mình. Bảng nào cũng thiếu id thì
  // rơi về 30 — thấp, và cố ý thấp: một nhà mà data không xếp hạng nổi thì cũng
  // không nên khởi binh ở tháng thứ ba.
  const base = RANK_WEIGHT[house.rank ?? ''] ?? TIER_WEIGHT[house.tier ?? ''] ?? 30;
  return Math.max(5, Math.min(100, base + (STATUS_SHIFT[house.status ?? ''] ?? 0)));
}

/**
 * Vùng của một nhà.
 *
 * Chỗ ngồi trước, tỉnh sau, lãnh thổ cuối — cụ thể dần. `anchorOf` leo tiếp nếu
 * chỗ ấy chưa có toạ độ, nên một nhà ở một làng chưa lên bản đồ vẫn đứng đâu đó
 * trong tỉnh của nó chứ không rơi ra ngoài thế giới.
 */
function regionOfHouse(house: HouseRow): string {
  for (const candidate of [house.seat, house.province, house.realm]) {
    if (candidate === undefined || candidate === '') continue;
    const anchor = anchorOf(candidate);
    if (anchor !== null) return anchor;
  }
  return '';
}

export interface SeedOptions {
  /** Trần số agent. Mặc định gieo hết — 130 nhà là một châu Âu vừa phải. */
  limit?: number;
}

/**
 * Gieo agent cho một ván chơi mới.
 *
 * Ai cũng vào ở TẦNG C. Tick sâu đầu tiên gọi `retier` và xếp lại theo khoảng
 * cách tới người chơi — nên hàm này không cần biết người chơi là ai, và một ván
 * chơi bắt đầu ở Constantinople hay ở Ehrenfeld đều gieo ra đúng thế giới ấy.
 */
export function seedAgents(rng: Rng, options: SeedOptions = {}): Agent[] {
  const limit = options.limit ?? HOUSES.length;
  const agents: Agent[] = [];

  for (const house of HOUSES) {
    if (agents.length >= limit) break;

    const npcId = house.head ?? '';
    if (npcId === '') continue;
    const regionId = regionOfHouse(house);
    if (regionId === '') continue;

    const seed: AgentSeed = {
      npcId,
      name: house.headName === undefined || house.headName === '' ? house.name : house.headName,
      regionId,
      powerId: '',
      // Tuổi người đứng đầu một nhà: đủ lớn để đã cầm quyền, đủ trẻ để còn sống
      // thêm vài chục năm mô phỏng. Bảng chết theo tuổi của tầng C lo phần còn lại.
      age: rng.int(26, 62),
      weight: weightOf(house),
      // ĐÍCH MẶC ĐỊNH LÀ LÃNH THỔ CỦA CHÍNH NHÀ ẤY. Một mục tiêu không có đích
      // vẫn chạy được, nhưng mọi biến cố nó sinh ra sẽ đọc thành "không nghe lệnh
      // một kẻ nào đó nữa" — đúng về cơ học và vô nghĩa với người đọc.
      // `??` không đủ: `houses.json` để trống bằng CHUỖI RỖNG, không bằng
      // `null`, nên `??` sẽ nhận lấy chuỗi rỗng và mọi biến cố đọc thành "một kẻ
      // nào đó".
      goalTarget: [house.realm, house.province, house.seat].find((id) => id !== undefined && id !== '') ?? '',
      // NHÀ CÓ YÊU SÁCH THÌ MỤC TIÊU ĐÃ ĐƯỢC LỊCH SỬ VIẾT SẴN.
      ...(Array.isArray(house.claims) && house.claims.length > 0 ? { goalKinds: ['leo-tuoc-vi'] } : {}),
    };

    agents.push(createAgent(rng, seed));
  }

  // MỐI THÙ TỪ DATA. `rivals` của `houses.json` là thứ duy nhất ở đây không suy
  // ra được từ tính cách — hai nhà ghét nhau vì một chuyện xảy ra trước năm 1444,
  // và mô phỏng phải bắt đầu với mối thù ấy đã có sẵn.
  const byHouse = new Map(HOUSES.filter((house) => house.head !== undefined).map((house) => [house.id, house.head ?? '']));
  return agents.map((agent) => {
    const house = HOUSES.find((row) => row.head === agent.npcId);
    const rivals = (house?.rivals ?? [])
      .map((id) => byHouse.get(id) ?? '')
      .filter((id) => id !== '' && id !== agent.npcId);
    if (rivals.length === 0) return agent;

    return {
      ...agent,
      relationships: rivals.map((npcId) => ({ npcId, bond: -60, kind: 'ke-thu' })),
      goals: [
        ...agent.goals,
        {
          id: `goal_${agent.npcId}_thu`,
          kind: 'tra-thu',
          target: rivals[0] ?? '',
          priority: 62,
          progress: 0,
        },
      ],
    };
  });
}

/** Số nhà có người đứng đầu — trần thật của `seedAgents`. */
export function seedableHouses(): number {
  return HOUSES.filter((house) => house.head !== undefined && house.head !== '').length;
}

/**
 * Gieo lần đầu, nếu chưa gieo.
 *
 * VẠCH XUẤT PHÁT ĐI VÀO SAVE, và nó đi qua MVU như mọi thay đổi khác (R2) —
 * cùng khuôn với `openWorld` của Phần 14. Dựng trong bộ nhớ rồi vứt đi là mỗi
 * lượt một châu Âu mới toanh: người vừa chết sống lại, mối thù vừa nhen chưa
 * từng có, và người chơi không có cách nào biết cái nào là thật.
 *
 * DÒNG XÚC SẮC RIÊNG, suy từ seed ván chơi chứ không rút từ `worldtick`: gieo
 * agent là việc xảy ra ĐÚNG MỘT LẦN, và cho nó rút trên dòng mô phỏng thì mọi
 * cú tung ngầm về sau lệch đi 130 nhịp so với một save đã gieo rồi (R3).
 */
export function ensureAgentsOp(state: GameState): PatchOp | null {
  const world = worldStateOf(state);
  if (world === null || world.agents.length > 0) return null;

  const agents = seedAgents(createRng(`${state.meta.seed}::gieo-agent`));
  if (agents.length === 0) return null;

  return {
    op: 'set',
    path: 'world.agents',
    from: world.agents,
    to: agents,
    reason: `Phần 15: gieo ${String(agents.length)} nhân vật từ data/houses.json`,
    source: 'json',
  };
}
