/**
 * KIỂU CỦA MỘT CUỘC VÂY HÃM (Phần 11).
 *
 * BA QUYẾT ĐỊNH ĐÁNG GIẢI THÍCH, và cả ba đều đến thẳng từ mục 1:
 *
 * 1. HAI BÊN KHÔNG ĐỐI XỨNG. `BesiegerState` và `DefenderState` là hai kiểu khác
 *    nhau, không phải hai bản sao của một kiểu chung có cờ `side`. Bên vây chống
 *    lại THỜI GIAN và DỊCH BỆNH — nên nó mang `hygiene`, `serviceDaysLeft`,
 *    `mercenaryWeeksPaid`. Bên thủ chống lại CÁI ĐÓI và LÒNG NGƯỜI — nên nó mang
 *    `ration`, `populationMorale`, `civiliansExpelled`. Một kiểu chung sẽ ép hai
 *    vai chơi về cùng một bảng số, và mục 1 nói thẳng rằng chúng phải khác hẳn
 *    nhau.
 *
 * 2. SỔ TỬ CHIA THEO NGUYÊN NHÂN (`LossLedger`). Bài test mục 11 hỏi đúng một câu
 *    mà một con số thương vong tổng không trả lời được: "thắng, nhưng mất một
 *    phần lớn quân VÌ BỆNH". Nếu engine chỉ đếm `losses: number` thì câu ấy vĩnh
 *    viễn không kiểm được, và mối đe dọa số một của mục 3 trở thành một dòng chữ.
 *
 * 3. CÔNG SỰ LÀ NHIỀU LỚP, VÀ LỚP ĐANG GIỮ NẰM TRONG STATE (`heldLayer`). Mất
 *    tường ngoài CHƯA PHẢI mất thành (mục 2). Nếu chỉ có một con số `integrity`
 *    thì việc lùi từng lớp không tồn tại, và cả cái ý "mỗi lớp là một chốt chặn"
 *    biến mất khỏi cơ học.
 *
 * `Fortification` cố ý KHÔNG nằm trong thư mục minigame: mục 2 nói nó được ĐIỀN
 * từ nhóm công trình phòng thủ của Phần 12, nên Phần 12 phải dựng được đối tượng
 * này mà không phải import từ `minigames/siege-attack/`.
 */

import type { CheckResult } from '@/core/turn';
import type { RngState } from '@/core/rng';
import type { PatchOp } from '@/state/mvu-parse';
import type { GameState } from '@/state/slices';
import type { ChronicleRound, ChronicleSetting } from '@/systems/combat/chronicle';

// ---------------------------------------------------------------------------
// Hai vai
// ---------------------------------------------------------------------------

export type SiegeSide = 'vay' | 'thu';

export const SIDE_LABELS: Readonly<Record<SiegeSide, string>> = {
  vay: 'bên vây',
  thu: 'bên thủ',
};

export function otherSiegeSide(side: SiegeSide): SiegeSide {
  return side === 'vay' ? 'thu' : 'vay';
}

// ---------------------------------------------------------------------------
// Công sự nhiều lớp (mục 2)
// ---------------------------------------------------------------------------

/** Ba chốt chặn bên thủ có thể lần lượt lùi vào. */
export type HeldLayerId = 'tuong-ngoai' | 'tuong-trong' | 'thap-chinh';

export const HELD_LAYER_LABELS: Readonly<Record<HeldLayerId, string>> = {
  'tuong-ngoai': 'tường ngoài',
  'tuong-trong': 'tường trong',
  'thap-chinh': 'tháp chính',
};

export interface WallTower {
  id: string;
  name: string;
  integrity: number;
  maxIntegrity: number;
}

export interface WallLayer {
  id: string;
  name: string;
  integrity: number;
  maxIntegrity: number;
  /** MÉT. Tường càng cao thì thang càng dài và bên tấn công càng lâu ở trên nó. */
  height: number;
  /** MÉT. Bề dày chia thẳng vào sức phá của máy bắn. */
  thickness: number;
  towers: WallTower[];
  breached: boolean;
}

export interface Moat {
  width: number;
  wet: boolean;
  /** 0–1. Lấp đầy hào là việc đầu tiên của mọi cuộc tổng công. */
  filled: number;
}

export interface Gatehouse {
  integrity: number;
  maxIntegrity: number;
  drawbridge: boolean;
  portcullis: boolean;
  murderHoles: boolean;
  broken: boolean;
}

export interface Bailey {
  /** Mẫu đất trong tường. Lùi một lớp thì diện tích nhỏ lại, mật độ phòng thủ tăng. */
  area: number;
  buildings: string[];
}

export interface Keep {
  integrity: number;
  maxIntegrity: number;
  capacity: number;
  stores: number;
}

export interface Supplies {
  food: number;
  water: number;
  fodder: number;
  materials: number;
}

/** Một khối quân đồn trú. Giữ dạng danh sách vì mục 2 khai `garrison: Unit[]`. */
export interface GarrisonUnit {
  id: string;
  /** Id trong `data/units.json` — bên thủ vẫn là binh chủng của Phần 10. */
  typeId: string;
  name: string;
  men: number;
  quality: 1 | 2 | 3 | 4 | 5;
}

export interface Fortification {
  /** `hold_*` — tiền tố bắt buộc của README dự án mục 7.1. */
  id: string;
  templateId: string;
  name: string;
  tier: number;
  moat: Moat | null;
  outerWall: WallLayer;
  gatehouse: Gatehouse;
  bailey: Bailey;
  innerWall: WallLayer | null;
  keep: Keep;
  /** Giếng riêng. 0 nghĩa là cắt nguồn nước sẽ giết thành này (mục 3). */
  wells: number;
  garrison: GarrisonUnit[];
  population: number;
  supplies: Supplies;
  /** Lớp bên thủ đang giữ. Lùi là MỘT CHIỀU. */
  heldLayer: HeldLayerId;
  lostLayers: HeldLayerId[];
}

export function garrisonMen(fort: Fortification): number {
  return fort.garrison.reduce((sum, unit) => sum + Math.max(0, unit.men), 0);
}

/** Lớp đang giữ, hoặc `null` khi bên thủ đã lùi vào tháp chính. */
export function heldWall(fort: Fortification): WallLayer | null {
  if (fort.heldLayer === 'tuong-ngoai') return fort.outerWall;
  if (fort.heldLayer === 'tuong-trong') return fort.innerWall;
  return null;
}

// ---------------------------------------------------------------------------
// Sổ tử — chia theo NGUYÊN NHÂN, xem chú thích đầu file
// ---------------------------------------------------------------------------

export interface LossLedger {
  /** Kiết lỵ và dịch hạch. Mục 3 gọi đây là mối đe dọa số một của bên vây. */
  disease: number;
  hunger: number;
  combat: number;
  desertion: number;
  /** Về nhà HỢP PHÁP: hết hạn nghĩa vụ, hết hợp đồng. Không phải đào ngũ. */
  departed: number;
  winter: number;
}

export function emptyLedger(): LossLedger {
  return { disease: 0, hunger: 0, combat: 0, desertion: 0, departed: 0, winter: 0 };
}

export function ledgerTotal(ledger: LossLedger): number {
  return ledger.disease + ledger.hunger + ledger.combat + ledger.desertion + ledger.departed + ledger.winter;
}

/** Chết thật, không tính người đi về nhà. */
export function ledgerDead(ledger: LossLedger): number {
  return ledger.disease + ledger.hunger + ledger.combat + ledger.winter;
}

// ---------------------------------------------------------------------------
// Bên vây
// ---------------------------------------------------------------------------

export interface SiegeEngineInstance {
  id: string;
  typeId: string;
  name: string;
  /** 0–1. Dưới 1 là đang dựng. */
  progress: number;
  built: boolean;
  destroyed: boolean;
  /** Có lính canh ban đêm không — trừ thẳng vào cơ hội đốt của cuộc đột kích. */
  guarded: boolean;
}

export interface MineShaft {
  id: string;
  /** 0–1 tới lúc chạm chân tường. */
  progress: number;
  crew: number;
  /** Chủng tộc đội thợ. Lùn và thợ mỏ đào nhanh hơn hẳn (mục 3). */
  raceId: string;
  collapsed: boolean;
  fired: boolean;
  /** Bên thủ đã nghe thấy tiếng cuốc chưa. */
  detected: boolean;
}

export interface BesiegerState {
  name: string;
  commanderName: string;
  troops: number;
  startTroops: number;
  /** Quân nghĩa vụ của chư hầu — có quyền về nhà khi hết hạn (mục 3). */
  levy: number;
  mercenary: number;
  /** Thân binh: không hết hạn, không bỏ đi. */
  retinue: number;
  /**
   * THỢ RÈN ĐI THEO QUÂN (Phần 16 mục 10).
   *
   * "Một đạo quân không có thợ rèn đi theo sẽ rã trang bị sau vài tuần chiến
   * dịch." Đây là con số quyết định câu đó, và nó nằm ở đây chứ không ở slice
   * `items` vì nó là một thuộc tính của ĐẠO QUÂN, không phải của người chơi:
   * một cuộc vây hãm mười bốn tuần với không thợ nào thì cả đạo quân vào tổng
   * công với đồ hỏng, dù người chơi có lau kiếm của mình mỗi tối hay không.
   */
  smiths: number;
  /** Tình trạng trung bình của trang bị cả đạo quân, 0–100 (Phần 16 mục 10). */
  gearCondition: number;
  horses: number;
  morale: number;
  /** 0–100. Trại càng bẩn thì dịch càng chắc chắn (mục 3). */
  hygiene: number;
  treasury: number;
  /** Lương trong trại, tính bằng PHẦN một người một tuần. */
  supplies: number;
  serviceDaysLeft: number;
  mercenaryWeeksPaid: number;
  /** 0–3: vòng vây kín tới đâu. Quyết định bao nhiêu tiếp tế lọt vào thành. */
  circumvallation: number;
  engines: SiegeEngineInstance[];
  mines: MineShaft[];
  minerRaceId: string;
  losses: LossLedger;
  outbreakWeeks: number;
  outOfSupplyWeeks: number;
  levyLeft: boolean;
  mercenaryLeft: boolean;
  /** Đã tuyên "không tha một ai" — đóng cửa đàm phán gần như hoàn toàn. */
  noQuarter: boolean;
  /** Áp lực đòi cướp phá từ chính quân mình (mục 7). */
  sackPressure: number;
  bombardPause: number;
  /**
   * Tuần này có bắn phá không.
   *
   * Mục 3 xếp "bắn phá" là một HÀNH ĐỘNG chứ không phải một nhịp tự động, và đó
   * là điều đúng: đội vận hành máy bắn là cùng đám người phải đào hào, phải đi
   * hộ tống đoàn xe, phải canh đường hầm. Bắn phá mỗi tuần miễn phí thì tám hành
   * động còn lại của bảng bên vây không bao giờ đáng bấm.
   */
  bombarding: boolean;
  /** Cộng thẳng vào phép kiểm bắn phá, thang d100. Sự kiện và hành động đổ vào đây. */
  bombardBonus: number;
  threwCorpses: boolean;
  cutWater: boolean;
}

// ---------------------------------------------------------------------------
// Bên thủ
// ---------------------------------------------------------------------------

export interface DefenderState {
  name: string;
  commanderName: string;
  garrisonMorale: number;
  /** LÒNG NGƯỜI: dân trong thành, tách hẳn khỏi sĩ khí quân (mục 3). */
  populationMorale: number;
  /** Id trong bảng `rations` của `data/fortifications.json`. */
  ration: string;
  civiliansExpelled: number;
  /** Đã mấy tuần không có nước. Quá ngưỡng là hết. */
  waterCutWeeks: number;
  counterMines: number;
  sorties: number;
  /**
   * Tuần đột kích gần nhất.
   *
   * Có mặt vì một lý do rất cụ thể: một cuộc đột kích lấy một phần tư đội đồn trú
   * ra khỏi tường và phần lớn số ấy không về. Đột kích tuần nào cũng đột kích thì
   * hai trăm người hết sạch trong bốn tuần — và đó không phải một chiến thuật, đó
   * là một lỗi của bộ chọn nước đi.
   */
  lastSortieWeek: number;
  losses: LossLedger;
  /** Đã tin là có quân cứu viện. Giữ được lòng người rất lâu. */
  reliefHope: boolean;
  honor: number;
  /** Tuần gần nhất đã đàm phán — chống việc bấm đàm phán mỗi tuần. */
  lastParleyWeek: number;
}

// ---------------------------------------------------------------------------
// Khế ước đầu hàng có điều kiện (mục 5)
// ---------------------------------------------------------------------------

/**
 * "Nếu đến ngày X mà không có quân cứu viện, chúng tôi mở cổng."
 *
 * Một KHẾ ƯỚC ghi vào state, CẢ HAI BÊN bị ràng buộc. Vế thứ hai mới là vế làm
 * nó khác một cái hẹn giờ: bên vây cũng không được bắn phá trong lúc chờ, và nếu
 * họ phá ước thì chính họ mất danh dự và bị Giáo hội xét.
 */
export interface SurrenderContract {
  agreedWeek: number;
  deadlineWeek: number;
  terms: string[];
  brokenBy: SiegeSide | '';
  /** `null` = chưa tới hạn · `true` = giữ lời · `false` = có kẻ phá ước. */
  honored: boolean | null;
}

// ---------------------------------------------------------------------------
// Nhật ký, cú tung, sự kiện
// ---------------------------------------------------------------------------

export interface SiegeLogLine {
  week: number;
  side: SiegeSide | '';
  text: string;
  major?: boolean;
}

export interface SiegeCheck {
  week: number;
  side: SiegeSide | '';
  what: string;
  result: CheckResult;
}

export interface SiegeEventRecord {
  week: number;
  eventId: string;
  name: string;
  text: string;
  /** Id lựa chọn đã chọn. Rỗng nghĩa là popup còn đang mở. */
  optionId: string;
  optionLabel: string;
  lines: string[];
}

// ---------------------------------------------------------------------------
// Biên bản một tuần — nguồn của "đường cong" trong biên niên (mục 8)
// ---------------------------------------------------------------------------

export interface WeekReport {
  week: number;
  season: string;
  attackerAction: string;
  defenderAction: string;
  attackerTroops: number;
  attackerMorale: number;
  attackerSupplyWeeks: number;
  defenderMen: number;
  population: number;
  garrisonMorale: number;
  populationMorale: number;
  defenderFoodWeeks: number;
  wallIntegrity: number;
  wallMax: number;
  diseaseDeaths: number;
  hungerDeaths: number;
  combatDeaths: number;
  desertions: number;
  departed: number;
  insideDeaths: number;
  mineProgress: number;
  events: string[];
  /** Mốc: tường vỡ, lùi lớp, đàm phán, cứu viện. Đi thẳng vào biên niên. */
  milestones: string[];
  lines: string[];
  /** Tuần đáng dừng nút tăng tốc lại (mục 3). */
  notable: boolean;
}

// ---------------------------------------------------------------------------
// Tổng công (mục 6)
// ---------------------------------------------------------------------------

export interface AssaultWave {
  id: string;
  name: string;
  men: number;
  /** Số người đợt này có lúc xuất phát — ngưỡng gãy đo trên con số này. */
  startMen: number;
  /** Id lớp đang đứng, trong bảng `assault.layers`. */
  layerId: string;
  methodId: string;
  /** Đội tiên phong: thương vong khủng khiếp, vinh quang cực lớn nếu sống. */
  forlorn: boolean;
  playerLed: boolean;
  losses: number;
  /** Đã vượt qua lớp cuối cùng. */
  through: boolean;
  spent: boolean;
}

export interface AssaultState {
  round: number;
  waves: AssaultWave[];
  /** Người còn ở ngoài, chưa đưa vào đợt nào. */
  reserve: number;
  attackerLosses: number;
  defenderLosses: number;
  /** Lớp bên tấn công đã chiếm được, theo thứ tự. */
  taken: string[];
  finished: boolean;
  /** `true` = vào được thành · `false` = đợt tổng công bị đánh bật. */
  succeeded: boolean | null;
  log: string[];
  rounds: ChronicleRound[];
  /** Người chơi đang tự dẫn đội tiên phong và đã sang minigame Phần 9. */
  duelling: boolean;
}

// ---------------------------------------------------------------------------
// Cuộc vây hãm
// ---------------------------------------------------------------------------

export type SiegePhase = 'vay-ham' | 'khe-uoc' | 'tong-cong' | 'xong';

export const PHASE_LABELS: Readonly<Record<SiegePhase, string>> = {
  'vay-ham': 'vây hãm',
  'khe-uoc': 'đang giữ khế ước',
  'tong-cong': 'tổng công',
  xong: 'đã xong',
};

export const SIEGE_ENDINGS: Readonly<Record<string, string>> = {
  'het-luong': 'thành hết lương và mở cổng',
  'het-nuoc': 'thành hết nước',
  'dau-hang-co-dieu-kien': 'đầu hàng theo điều khoản đã thỏa thuận',
  'khe-uoc-den-han': 'khế ước tới hạn, cổng mở đúng lời hứa',
  'ha-bang-tong-cong': 'thành bị hạ bằng tổng công',
  'phan-boi-mo-cong': 'có kẻ mở cổng từ bên trong',
  'bo-vay': 'bên vây bỏ cuộc và rút đi',
  'tan-ra': 'đạo quân vây tan rã',
  'cuu-vien-giai-vay': 'quân cứu viện tới và giải vây',
  'het-han': 'hai bên rời nhau khi mùa đã hết',
};

export interface SiegeState {
  id: string;
  week: number;
  seasonId: string;
  seasonWeek: number;

  fort: Fortification;
  attacker: BesiegerState;
  defender: DefenderState;

  playerSide: SiegeSide;
  phase: SiegePhase;
  contract: SurrenderContract | null;

  /** Quân cứu viện: có thể có, đang tới, còn mấy tuần. */
  reliefPossible: boolean;
  reliefIncoming: boolean;
  weeksToRelief: number;
  truceWeeks: number;

  /** TIẾNG TÀN BẠO và tiếng nhân từ (mục 7) — chỉ số lan tới toàn cục. */
  cruelty: number;
  mercy: number;
  church: number;

  finished: boolean;
  winner: SiegeSide | '';
  ending: string;
  /** Id điều khoản đã chốt, nếu kết cục là một cuộc đàm phán. */
  terms: string[];
  /** `null` = chưa tới lúc chọn · `true` = đã cướp phá · `false` = đã tha. */
  sacked: boolean | null;

  weeks: WeekReport[];
  parleys: ParleyRecord[];
  log: SiegeLogLine[];
  checks: SiegeCheck[];
  events: SiegeEventRecord[];
  /** Sự kiện đang chờ người chơi chọn. Tuần không chạy tiếp khi còn cái này. */
  pendingEvent: SiegeEventRecord | null;
  eventCooldown: Record<string, number>;

  assault: AssaultState | null;

  setting: ChronicleSetting;
  stakes: string;

  /** Op cho MVU — CHỈ áp sau khi cuộc vây hãm kết thúc. Cùng luật Phần 9 và 10. */
  playerOps: PatchOp[];
  state: GameState | null;
  rngState: RngState;
  turn: number;
  llmCalls: number;
}

export interface ParleyRecord {
  week: number;
  by: SiegeSide;
  /** Id điều khoản đã đặt lên bàn. */
  terms: string[];
  accepted: boolean;
  /** Có phải một khế ước có điều kiện không. */
  conditional: boolean;
  tier: CheckResult['tier'];
  line: string;
}

// ---------------------------------------------------------------------------
// Tra cứu
// ---------------------------------------------------------------------------

/** Tổng số miệng ăn trong tường: quân đồn trú + dân chưa bị đuổi ra. */
export function mouthsInside(siege: SiegeState): number {
  return garrisonMen(siege.fort) + Math.max(0, siege.fort.population);
}

/** Còn cầm cự được mấy tuần với khẩu phần hiện tại. */
export function foodWeeksLeft(siege: SiegeState, rationFactor: number): number {
  const mouths = mouthsInside(siege);
  if (mouths <= 0) return 0;
  const perWeek = mouths * Math.max(0.05, rationFactor);
  return siege.fort.supplies.food / perWeek;
}

/** Bên vây còn lương mấy tuần. */
export function campSupplyWeeks(siege: SiegeState): number {
  if (siege.attacker.troops <= 0) return 0;
  return siege.attacker.supplies / siege.attacker.troops;
}

export function engineById(siege: SiegeState, id: string): SiegeEngineInstance | null {
  return siege.attacker.engines.find((engine) => engine.id === id) ?? null;
}

/** Máy đã dựng xong và chưa cháy. */
export function liveEngines(siege: SiegeState): SiegeEngineInstance[] {
  return siege.attacker.engines.filter((engine) => engine.built && !engine.destroyed);
}
