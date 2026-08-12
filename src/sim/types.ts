/**
 * KIỂU CỦA TẦNG MÔ PHỎNG NGẦM — Phần 15 mục 3, 6, 7.
 *
 * Ba tầng của thế giới đã đủ từ Phần 14: THÀNH TRÌ là một điểm, LÃNH THỔ là một
 * vùng, THẾ LỰC là một bàn cờ. Phần này KHÔNG thêm tầng thứ tư — nó thêm hai thứ
 * cắt ngang cả ba:
 *
 *   AGENT   một cái đầu có mục tiêu, đang ở đâu đó, và chỉ biết những gì nó biết
 *   TIN     một sự thật đang di chuyển, mất thời gian và mất độ chính xác
 *
 * Quy tắc kiểm tra để biết một trường thuộc về đâu, viết tiếp mạch của Phụ lục A:
 *
 *   có Ý ĐỊNH và có thể SAI            → agent
 *   có TOẠ ĐỘ XUẤT PHÁT và có NGÀY ĐẾN → tin
 *
 * Vì thế `Agent` không có `hp`, `stats`, hay `inventory`: một agent không phải một
 * nhân vật rút gọn, nó là PHẦN BIẾT NGHĨ của một nhân vật. Nhân vật thật (nếu có)
 * sống ở slice của Phần 6, và agent chỉ giữ id trỏ tới.
 *
 * Và `NewsItem` không có `text` cố định: nội dung của một tin ĐỔI trên đường đi
 * (mục 6), nên chữ nghĩa nằm ở `WorldEvent` gốc cộng với danh sách bóp méo đã
 * dính vào. Giữ sẵn một chuỗi ở đây là mất luôn khả năng kể lại nó khác đi.
 */

import type { GameDate } from '@/core/clock';

// ---------------------------------------------------------------------------
// Agent (mục 2, 3)
// ---------------------------------------------------------------------------

/** Ba độ phân giải của mục 2. Người chơi KHÔNG BAO GIỜ thấy chữ này. */
export type AgentTier = 'A' | 'B' | 'C';

export interface AgentGoal {
  id: string;
  /** Id trong `data/sim.json → goals.kinds`. */
  kind: string;
  /** Ai hoặc cái gì là đích: npcId, holdingId, titleId, powerId. */
  target: string;
  /** 0–100. Mục tiêu ưu tiên cao được chọn trước ở cả ba tầng. */
  priority: number;
  /**
   * Tháng tuyệt đối (`year * 12 + month`) mà agent bỏ cuộc nếu chưa xong.
   *
   * `| undefined` viết tường minh vì `exactOptionalPropertyTypes` đang bật: kiểu
   * Zod suy ra từ `slice.ts` mang sẵn `undefined`, và bỏ nó ở đây là hai hình
   * dạng của cùng một trường — mà mọi thứ đọc slice đều phải chuyển qua lại giữa
   * hai hình dạng ấy.
   */
  deadline?: number | undefined;
  /** 0–100. Đạt 100 là xong, và mục tiêu rời khỏi danh sách. */
  progress: number;
}

/** Năm trục của `data/sim.json → personality.axes`, mỗi trục 0–100. */
export type Personality = Readonly<Record<string, number>>;

export interface AgentResources {
  /** Tiền mặt agent xoay được trong tháng này. */
  money: number;
  /** Người theo: quân, gia nhân, môn đệ. Quy về một con số 0–100. */
  men: number;
  /** Tiếng nói ở triều đình / giáo hội. 0–100. */
  influence: number;
}

export interface AgentRelationship {
  npcId: string;
  /** −100 tới 100. */
  bond: number;
  /** `chu`, `chu-hau`, `than-thuoc`, `ke-thu`, `dong-minh`… */
  kind: string;
}

export interface PendingAction {
  actionId: string;
  targetId: string;
  magnitude: string;
  /** Tháng tuyệt đối mà hành động này được thực thi ở tick nhanh. */
  dueMonth: number;
  goalId: string;
}

export interface Agent {
  npcId: string;
  name: string;
  tier: AgentTier;
  /** Vùng agent đang ở — id trong `data/regions.json`. */
  regionId: string;
  /** Thế lực agent phục vụ, id trong `data/nations.json`. Rỗng là không thuộc ai. */
  powerId: string;
  age: number;
  alive: boolean;
  goals: AgentGoal[];
  personality: Personality;
  resources: AgentResources;
  relationships: AgentRelationship[];
  /**
   * AGENT NÀY BIẾT NHỮNG GÌ — mục 3, và đây là chỗ quan trọng nhất của cả file.
   *
   * KHÁC tri thức của người chơi, và khác state thật. Một bá tước ở biên cương
   * không biết chuyện vừa xảy ra ở kinh đô, nên nó hành động theo cái nó TƯỞNG
   * là đúng. Đây là nguồn sinh ra sai lầm, hiểu lầm, và kịch tính — không phải
   * một chỗ tối ưu hoá để bỏ đi.
   */
  knowledge: string[];
  pendingActions: PendingAction[];
  /** Tháng tuyệt đối của lần hành động gần nhất. */
  lastActedTick: number;
  /** Mốc `wakeMilestones` agent vừa chạm, để tháng sau kéo tầng lên. */
  wokeBy: string;
}

// ---------------------------------------------------------------------------
// Sự kiện (mục 7)
// ---------------------------------------------------------------------------

export type EventScope = 'the-gioi' | 'quoc-gia' | 'vung' | 'thanh-tri' | 'ca-nhan';

export interface EventOption {
  id: string;
  label: string;
  /** Câu mô tả hệ quả mà người chơi đọc TRƯỚC khi chọn. */
  note: string;
}

export interface WorldEvent {
  id: string;
  /** Id trong `data/news.json → templates.byKind`. */
  kind: string;
  scope: EventScope;
  importance: number;
  requiresDecision: boolean;
  options?: EventOption[] | undefined;
  deadline?: GameDate | undefined;
  /** Vùng nơi chuyện xảy ra. Toạ độ tra từ `data/world-map.json`. */
  regionId: string;
  occurredAt: GameDate;
  /** Ai gây ra — npcId hoặc powerId. */
  actorId: string;
  targetId: string;
  /** Con số của biến cố, ví dụ số quân. ENGINE tính, không phải LLM. */
  amount: number;
  /** Văn bản gốc, ĐÚNG SỰ THẬT. Bản người chơi đọc có thể đã méo. */
  text: string;
  headline: string;
  effects: { path: string; delta: number }[];
}

// ---------------------------------------------------------------------------
// Tin (mục 6)
// ---------------------------------------------------------------------------

export interface NewsItem {
  id: string;
  eventId: string;
  /** Toạ độ nơi chuyện xảy ra, km trên bản đồ của `data/world-map.json`. */
  origin: { x: number; y: number };
  originRegionId: string;
  /** Vùng tin đang đi tới. */
  destinationRegionId: string;
  occurredAt: GameDate;
  importance: number;
  /** Id trong `data/news.json → carriers`. */
  carrierId: string;
  /** Ngày còn phải đi. Về 0 là tin tới nơi. */
  daysLeft: number;
  /** Tổng số ngày chuyến đi này cần — để UI nói "tin mười hai ngày trước". */
  daysTotal: number;
  /** 0–100, GIẢM DẦN theo khoảng cách. */
  accuracy: number;
  /** Id mẫu trong `data/news.json → distortions.templates` đã dính vào. */
  distortions: string[];
  /** Hệ số nhân đã áp cho `amount` — 1 là chưa méo. */
  numberFactor: number;
  /** Kết cục đã bị đảo chưa. */
  flipped: boolean;
}

/** Một tin ĐÃ TỚI NƠI — thứ chảy vào dòng tin và vào tri thức của Phần 4. */
export interface ArrivedNews {
  id: string;
  eventId: string;
  kind: string;
  importance: number;
  scope: EventScope;
  /** Ngày tin tới tai người chơi, KHÔNG phải ngày chuyện xảy ra. */
  arrivedAt: GameDate;
  occurredAt: GameDate;
  /** "sứ giả từ Köln, tin 12 ngày trước" — mục 7 bắt hiện kèm mọi thông báo. */
  source: string;
  daysLate: number;
  confidence: number;
  /** Chữ NGƯỜI CHƠI ĐỌC. Có thể sai so với `WorldEvent.text`. */
  text: string;
  headline: string;
  distortions: string[];
  /** Đã đọc chưa — tin quan trọng nhấp nháy cho tới khi người chơi đọc (mục 7). */
  read: boolean;
  regionId: string;
}

// ---------------------------------------------------------------------------
// Kết quả một nhịp mô phỏng
// ---------------------------------------------------------------------------

export interface TickReport {
  /** Dòng nhật ký người đọc được, cho tab Debug (mục 11). */
  lines: string[];
  events: WorldEvent[];
  /** Tin vừa tới tai người chơi trong nhịp này. */
  arrivals: ArrivedNews[];
  /** Bất biến bị vi phạm và đã tự sửa (mục 9). */
  repairs: string[];
  llmCallsUsed: number;
}

export function emptyTickReport(): TickReport {
  return { lines: [], events: [], arrivals: [], repairs: [], llmCallsUsed: 0 };
}
