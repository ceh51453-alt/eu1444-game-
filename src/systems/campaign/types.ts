/**
 * KIỂU CỦA CHIẾN ĐỒ — bản đồ chinh phục ba tầng.
 *
 * Đọc `README.md` cùng thư mục trước khi sửa file này: ranh giới giữa "ai đang
 * giữ ô này" (ở đây) và "đạo quân ấy mạnh bao nhiêu" (Phần 13/14, slice
 * `military`) là chỗ dễ vỡ nhất của cả hệ.
 */

/** 1 quốc gia · 2 vùng lớn · 3 huyện. Không có tầng thứ tư. */
export type CampaignLevel = 1 | 2 | 3;

/** Điểm nằm trong một huyện. Rỗng nghĩa là ô nước hoặc ô trống. */
export type SiteKind = 'thanh-tri' | 'thi-tran' | 'lang' | '';

export type LinkKind = 'duong-bo' | 'duong-nui' | 'duong-song' | 'duong-bien';

/** Bốn tư thế của một đạo quân trên chiến đồ. */
export type ArmyStance = 'dong-quan' | 'hanh-quan' | 'vay-thanh' | 'chiem-dong';

/** Ba trạng thái mà màu sắc của một ô phải nói ra. */
export type NodeStatus = 'nguyen-ven' | 'tranh-chap' | 'da-doi-chu';

export interface CampaignNode {
  id: string;
  name: string;
  level: CampaignLevel;
  /** `null` chỉ ở tầng 1. */
  parentId: string | null;
  /** Vùng tương ứng trong `regions.json`, `null` nếu là nơi sinh thêm. */
  regionId: string | null;
  /** Toạ độ CỤC BỘ trong khung 0…1000 của cha (tầng 1 dùng km đã nới rộng). */
  x: number;
  y: number;
  /** Toạ độ TOÀN CỤC bằng km — mọi khoảng cách hành quân đo trên cặp này. */
  gx: number;
  gy: number;
  radius: number;
  terrain: string;
  water: boolean;
  island: boolean;
  site: SiteKind;
  siteName: string;
  /** 0…5. Thành trì cao, thị trấn thấp, làng bằng không. */
  fort: number;
  /** Thủ phủ của cha. Theo `conquest.seatFallsLast`, nó đổ sau cùng. */
  seat: boolean;
  /** Cảng: đầu cầu duy nhất để lên thuyền. */
  port: boolean;
  /** Phe sở hữu lúc mở màn. Rỗng là đất vô chủ hoặc mặt nước. */
  ownerId: string;
}

export interface CampaignLink {
  a: string;
  b: string;
  kind: LinkKind;
  /** Km thật giữa hai đầu, đo trên `gx/gy`. */
  km: number;
}

export interface CampaignFaction {
  id: string;
  name: string;
  /** Màu trên bản đồ. Đây là nguồn sự thật duy nhất về màu của một phe. */
  color: string;
  homeNodeId: string;
}

export interface TerrainRow {
  name: string;
  speed: number;
  mau: string;
}

export interface LinkKindRow {
  name: string;
  speed: number;
  needsShip: boolean;
}

export interface SiteRow {
  name: string;
  /** Có tính vào điều kiện chiếm vùng hay không. Làng thì không. */
  objective: boolean;
  siegeWeeks: number;
  note: string;
}

export interface CampaignConfig {
  levels: { level: number; id: string; name: string; prefix: string }[];
  spacing: Record<string, { thuong: number; nuoc: number; dao: number }>;
  terrain: Record<string, TerrainRow>;
  linkKind: Record<string, LinkKindRow>;
  site: Record<string, SiteRow>;
  march: {
    kmPerDayFoot: number;
    kmPerDayHorse: number;
    kmPerDaySea: number;
    seasonFactor: Record<string, number>;
  };
  conquest: {
    needAllObjectives: boolean;
    vassalCountsAsHeld: boolean;
    occupyDaysTown: number;
    seatFallsLast: boolean;
  };
}

/**
 * LỆNH HÀNH QUÂN — và lý do nó tồn tại thay cho một trường `nodeId` duy nhất.
 *
 * Một đạo quân đổi ô ngay khi người kể chuyện nói nó lên đường thì người chơi
 * không bao giờ chặn được ai: quân địch xuất hiện ở cổng thành mà không đi qua
 * bất cứ ô nào ở giữa. Lệnh này giữ CẢ CON ĐƯỜNG, và vị trí vẽ trên bản đồ là
 * một điểm nội suy giữa hai đầu chặng — nên "cách Vienna ba ngày đường" là một
 * vị trí có thật, nhìn thấy được, chặn được.
 */
export interface MarchOrder {
  /** Ít nhất hai nút; mỗi cặp liên tiếp PHẢI có cạnh thật. */
  path: string[];
  /** Chặng đang đi, 0-based trong `path`. */
  legIndex: number;
  /** 0…1 trong chặng hiện tại. */
  legProgress: number;
  kmPerDay: number;
  kmDone: number;
  kmTotal: number;
  /** Có chặng đường biển: đoàn quân cần thuyền mới đi tiếp được. */
  needsShip: boolean;
}

export interface CampaignArmy {
  id: string;
  name: string;
  factionId: string;
  /** `military.forces[].id` nếu là quân người chơi; rỗng là quân do AI cầm. */
  forceId: string;
  /** Quân số ƯỚC LƯỢNG để vẽ nhãn. Số thật sống ở slice `military`. */
  troops: number;
  /** Ô đang đứng. Khi hành quân, đây là ô ĐẦU của chặng hiện tại. */
  nodeId: string;
  stance: ArmyStance;
  march: MarchOrder | null;
  /** Ô đang bị vây, chỉ có nghĩa khi `stance === 'vay-thanh'`. */
  siegeNodeId: string;
}

export interface SiegeMark {
  nodeId: string;
  attackerId: string;
  armyId: string;
  weeks: number;
  /** Số tuần vây tối thiểu trước khi ô này có thể đổi chủ. */
  weeksNeeded: number;
}

/** Kết quả tra "muốn lấy chỗ này thì còn phải hạ những gì". */
export interface ConquestProgress {
  nodeId: string;
  /** Phe đang được tính tiến độ. */
  attackerId: string;
  /** Mọi mục tiêu (thành trì + thị trấn) nằm dưới nút này. */
  total: number;
  /** Đã trong tay phe ấy hoặc chư hầu của nó. */
  held: number;
  /** Trong số đã nắm, bao nhiêu là nhờ chư hầu. */
  byVassal: number;
  /** Còn phải hạ — thủ phủ luôn xếp cuối. */
  remaining: string[];
  /** Đã đủ điều kiện chiếm cả nút này chưa. */
  fallen: boolean;
  /** Đổ nhờ chư hầu quy phục chứ không phải nhờ hạ hết mục tiêu. */
  byHomage: boolean;
}
