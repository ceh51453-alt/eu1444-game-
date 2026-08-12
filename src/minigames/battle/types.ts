/**
 * KIỂU CỦA MỘT TRẬN DÃ CHIẾN (Phần 10).
 *
 * MỘT QUYẾT ĐỊNH ĐÁNG GIẢI THÍCH, và nó là chỗ Phần 10 khác Phần 9 nhiều nhất:
 * ở đây KHÔNG có `BodyState`. Một quân cờ là hai trăm người, không phải một
 * người, nên nó không có hai mươi vùng cơ thể — nó có `strength`, và cái chết ở
 * cấp này là một tỷ lệ chứ không phải một vết đâm. Cơ thể của Phần 7 chỉ quay
 * lại đúng một chỗ: khi người chơi bấm "Tự mình xông lên" và trận đánh nhường
 * sân cho minigame của Phần 9 (mục 11).
 *
 * `BattleUnit.strength` là SỐ QUÂN THẬT, không phải một thanh máu quy ước. Nhờ
 * vậy thương vong sau trận, số tù binh, tiền chuộc và số thương binh chuyển sang
 * Phần 7 đều là những con số đọc thẳng ra được, không phải quy đổi ngược từ phần
 * trăm.
 *
 * QUY ƯỚC `actor` CỦA PHẦN 5 vẫn giữ nguyên: `BattleUnit.commanderId` rỗng nghĩa
 * là không tướng nào cầm, còn `Officer.id` rỗng nghĩa là chính nhân vật người
 * chơi. Nhờ giữ đúng nó mà nguồn modifier của Phần 6, 7, 8 tự bật lên cho người
 * chơi khi họ đích thân ra lệnh.
 */

import type { CheckResult, CheckTier } from '@/core/turn';
import type { RngState } from '@/core/rng';
import type { PatchOp } from '@/state/mvu-parse';
import type { GameState } from '@/state/slices';
import type { ChronicleRound, ChronicleSetting } from '@/systems/combat/chronicle';
import type { CommandScope } from './data';
import type { BattleGrid, Cell, Dir8 } from './grid';

export type SideId = 'a' | 'b';

export function otherSide(side: SideId): SideId {
  return side === 'a' ? 'b' : 'a';
}

/** Ba cánh của một đạo quân thế kỷ 14, cộng quân dự bị (mục 3, mục 12). */
export type WingId = 'ta' | 'trung' | 'huu' | 'du-bi';

export const WINGS: readonly WingId[] = ['ta', 'trung', 'huu', 'du-bi'];

export const WING_LABELS: Readonly<Record<WingId, string>> = {
  ta: 'cánh tả',
  trung: 'trung quân',
  huu: 'cánh hữu',
  'du-bi': 'quân dự bị',
};

/** Năm trạng thái của mục 8. Id khớp `config.morale.states` trong data. */
export type UnitStateId = 'vung' | 'lung-lay' | 'nao-nung' | 'vo-tran' | 'tan-ra';

export const UNIT_STATE_LABELS: Readonly<Record<UnitStateId, string>> = {
  vung: 'vững',
  'lung-lay': 'lung lay',
  'nao-nung': 'nao núng',
  'vo-tran': 'vỡ trận',
  'tan-ra': 'tan rã',
};

/** Đơn vị còn điều khiển được không. Vỡ trận thì KHÔNG (mục 8). */
export function controllable(unit: BattleUnit): boolean {
  return unit.state !== 'vo-tran' && unit.state !== 'tan-ra';
}

/** Đơn vị còn trên bàn cờ không. */
export function onField(unit: BattleUnit): boolean {
  return unit.state !== 'tan-ra' && unit.strength > 0;
}

export interface BattleUnit {
  /** `unit_*` — tiền tố bắt buộc của README mục 7.1. */
  id: string;
  typeId: string;
  name: string;
  side: SideId;
  wing: WingId;
  /** Id tướng cầm đơn vị. Rỗng nghĩa là không ai cầm — đơn vị tự xoay xở. */
  commanderId: string;

  strength: number;
  maxStrength: number;
  quality: 1 | 2 | 3 | 4 | 5;

  morale: number;
  moraleMax: number;
  fatigue: number;
  /** Đội hình còn nguyên vẹn tới đâu, 0–100. */
  cohesion: number;
  formation: string;

  pos: Cell;
  facing: Dir8;
  ammo: number;
  state: UnitStateId;

  /** GIỮ lệnh: bỏ lượt để phản ứng sau (mục 4.3). */
  holding: boolean;
  /** Đã hành động trong vòng này. */
  acted: boolean;
  /** Đã dùng phản ứng cơ hội trong vòng này (mục 4.4). */
  reacted: boolean;
  /** Điểm khởi động của vòng hiện tại (mục 4.1). */
  initiative: number;
  /** Đang lao vào bằng tốc độ — nhãn `xung-phong` bật lên đúng trong pha này. */
  charging: boolean;
  /** Đã bỏ chạy được mấy vòng. Quá `disbandAfterRounds` thì tan rã. */
  routRounds: number;
  /** Nhân vật người chơi đang đứng trong đơn vị này. */
  playerLed: boolean;
  /** Nhãn của binh chủng, chép sẵn để khỏi tra data trong vòng lặp trong. */
  tags: string[];
}

// ---------------------------------------------------------------------------
// Tướng dưới quyền (mục 3)
// ---------------------------------------------------------------------------

/** Bốn tính khí mục 3 kể tên. */
export type Temperament = 'lieu-linh' | 'than-trong' | 'hao-danh' | 'bat-man';

export const TEMPERAMENT_LABELS: Readonly<Record<Temperament, string>> = {
  'lieu-linh': 'liều lĩnh',
  'than-trong': 'thận trọng',
  'hao-danh': 'háo danh',
  'bat-man': 'bất mãn',
};

export interface Officer {
  /** RỖNG nghĩa là chính nhân vật người chơi — quy ước `actor` của Phần 5. */
  id: string;
  name: string;
  side: SideId;
  wing: WingId;
  /** 0–100. Vế thứ hai của phép kiểm lệnh ở mục 3. */
  loyalty: number;
  /** 0–100, năng lực cầm quân. */
  skill: number;
  /** Vế "(WIT chỉ huy)" của điểm khởi động ở mục 4. */
  wit: number;
  /** Uy nghi — vế thứ nhất của phép kiểm lệnh, khi chính người này ra lệnh. */
  pre: number;
  temperament: Temperament;
  alive: boolean;
  /**
   * Nhìn được trong đêm (mục 9b).
   *
   * `Officer` KHÔNG mang nhãn binh chủng — một người không phải một binh chủng.
   * Engine suy ô này từ đám quân người ấy cầm lúc dựng trận, và đó cũng là cách
   * đúng: một chỉ huy Huyết Tộc giữa một đạo quân phàm nhân vẫn phải hò hét cho
   * những người không thấy gì.
   */
  nightSighted: boolean;
  /** Một dòng nhận dạng cho biên niên. */
  description: string;
}

// ---------------------------------------------------------------------------
// Lệnh (mục 3)
// ---------------------------------------------------------------------------

export const ORDER_IDS = ['giu', 'tien', 'tan-cong', 'vong-suon', 'ban', 'rut'] as const;
export type OrderId = (typeof ORDER_IDS)[number];

export const ORDER_LABELS: Readonly<Record<OrderId, string>> = {
  giu: 'giữ vị trí',
  tien: 'tiến lên',
  'tan-cong': 'tấn công',
  'vong-suon': 'vòng đánh sườn',
  ban: 'bắn',
  rut: 'rút về',
};

/** Kết quả thi hành một mệnh lệnh, bốn cửa của mục 3. */
export type OrderEffect = 'thi-hanh' | 'cham-tre' | 'khong-nhuc-nhich' | 'lam-nguoc';

export const ORDER_EFFECT_LABELS: Readonly<Record<OrderEffect, string>> = {
  'thi-hanh': 'thi hành đúng',
  'cham-tre': 'chậm một vòng hoặc lệch mục tiêu',
  'khong-nhuc-nhich': 'không nhúc nhích',
  'lam-nguoc': 'làm ngược lại',
};

export interface IssuedOrder {
  round: number;
  officerId: string;
  officerName: string;
  order: OrderId;
  result: CheckTier;
  effect: OrderEffect;
  note: string;
}

/**
 * Lệnh NHẬN TỪ TRÊN, khi người chơi không chỉ huy toàn quân (mục 3).
 *
 * "Giữ cánh phải, không được tiến trước khi trung quân giao chiến" — câu ví dụ
 * của mục 3 chứa đúng hai ràng buộc, và cả hai đều phải là DỮ LIỆU kiểm được,
 * không phải một dòng chữ. Nếu chúng chỉ là chữ thì engine không bao giờ biết
 * người chơi đã trái lệnh hay chưa, và cả nhánh kịch tính của mục 3 biến mất.
 */
export interface FieldOrder {
  id: OrderId;
  /** Khung nhiệm vụ hiện lên cho người chơi đọc. */
  text: string;
  wing: WingId;
  /** Không được tiến trước vòng này. 0 là không ràng buộc. */
  notBeforeRound: number;
  /** Không được tiến trước khi trung quân giao chiến. */
  requiresCenterEngaged: boolean;
  /** Ai ra lệnh — tên chủ soái, cho biên niên và cho hệ quả sau trận. */
  fromName: string;
}

export interface CommandState {
  titleId: string;
  titleName: string;
  scope: CommandScope;
  /** Đơn vị người chơi ra lệnh trực tiếp được. */
  ownedUnitIds: string[];
  /** Cánh người chơi cầm, khi `scope` là `canh` trở lên. */
  ownedWings: WingId[];
  /** Lệnh từ chủ soái. `null` khi người chơi chính là chủ soái. */
  received: FieldOrder | null;
  /** `null` = chưa ngã ngũ · `true` = tuân · `false` = đã trái lệnh. */
  obeyed: boolean | null;
  /** Vòng người chơi phá lệnh. 0 khi chưa phá. */
  disobeyedAtRound: number;
  issued: IssuedOrder[];
}

// ---------------------------------------------------------------------------
// Nhật ký và cú tung
// ---------------------------------------------------------------------------

export interface BattleCheck {
  round: number;
  side: SideId;
  unitId: string;
  result: CheckResult;
}

export interface BattleLogLine {
  round: number;
  /** Bên gây ra dòng này. Rỗng là dòng của cả trận. */
  side: SideId | '';
  text: string;
  /** Dòng đáng in đậm: vỡ trận, một cánh sụp, chủ soái tử trận. */
  major?: boolean;
}

// ---------------------------------------------------------------------------
// Sau trận (mục 12)
// ---------------------------------------------------------------------------

export interface Prisoner {
  name: string;
  side: SideId;
  /** Quý tộc thì đòi được tiền chuộc; lính thường thì không. */
  noble: boolean;
  ransom: number;
}

export interface Aftermath {
  /** Chết và mất tích TRONG trận, chưa tính truy kích. */
  losses: Record<SideId, number>;
  /** Chết trong lúc truy kích — mục 12 nói đây là chỗ giết được nhiều nhất. */
  pursuitKills: Record<SideId, number>;
  /** Thương binh, chuyển sang hệ chữa trị của Phần 7. */
  wounded: Record<SideId, number>;
  prisoners: Prisoner[];
  ransom: number;
  loot: number;
  /** Uy tín người chơi được hoặc mất. */
  reputation: number;
  /** Quan hệ với chủ soái sau trận — hệ quả của việc tuân hay trái lệnh. */
  lordStanding: string;
  /** Truy kích có bị cắt ngang vì bình minh không (mục 9b). */
  pursuitCutByDawn: boolean;
  lines: string[];
}

// ---------------------------------------------------------------------------
// Trận đánh
// ---------------------------------------------------------------------------

export interface BattleState {
  id: string;
  grid: BattleGrid;
  weatherId: string;
  timeId: string;

  /** Tên và quân số ban đầu của hai lực lượng — giữ nguyên từ diễn biến. */
  forces: Record<SideId, { name: string; commanderName: string; startTroops: number }>;

  units: BattleUnit[];
  officers: Officer[];

  /** Thứ tự khởi động của vòng hiện tại, id đơn vị, cao xuống thấp (mục 4). */
  order: string[];
  /** Con trỏ trong `order`: đơn vị SẮP hành động. */
  cursor: number;
  /** Vòng SẮP đánh. Bắt đầu ở 1. */
  round: number;

  finished: boolean;
  winner: SideId | '';
  ending: string;

  /** Biên niên đang tích, đúng định dạng dùng chung của Phần 9 và 11. */
  rounds: ChronicleRound[];
  checks: BattleCheck[];
  log: BattleLogLine[];

  playerSide: SideId;
  command: CommandState;

  /**
   * Mệnh lệnh đang có hiệu lực cho từng cánh, khoá `${side}:${wing}`.
   *
   * Đây là chỗ ma sát của mục 3 thành cơ học: người chơi ra lệnh "vòng đánh
   * sườn", `issueOrder` tung 3d6, và thứ RƠI VÀO Ô NÀY có thể là "giữ vị trí" vì
   * viên tướng ấy không nhúc nhích. Bộ chọn nước đi của engine đọc ô này, không
   * đọc lệnh người chơi đã bấm — nếu nó đọc lệnh gốc thì cả mục 3 chỉ là một
   * dòng chữ đỏ trên màn hình.
   */
  wingOrders: Record<string, OrderId>;
  /** Lệnh chậm một vòng (`cham-tre`): chỉ có hiệu lực từ `fromRound`. */
  delayedOrders: { key: string; order: OrderId; fromRound: number }[];

  setting: ChronicleSetting;
  stakes: string;

  /**
   * Op cho MVU — CHỈ của người chơi, và CHỈ được áp sau khi trận kết thúc.
   * Cùng luật với Phần 9: undo phải tua về TRƯỚC cả trận.
   */
  playerOps: PatchOp[];
  /** Bản làm việc của state, cho những phép kiểm của NGƯỜI CHƠI. */
  state: GameState | null;
  /** Vị trí dòng xúc sắc riêng của dã chiến, cập nhật sau mỗi vòng (R3). */
  rngState: RngState;
  turn: number;

  /**
   * Người chơi đang tự thân giao chiến (mục 11).
   *
   * Trong lúc này họ KHÔNG ra lệnh được và toàn quân tự xoay xở — mục 11 nói
   * thẳng, và đó là toàn bộ cái giá của nút bấm ấy.
   */
  duelling: boolean;

  aftermath: Aftermath | null;
  llmCalls: number;
}

// ---------------------------------------------------------------------------
// Tra cứu
// ---------------------------------------------------------------------------

export function unitById(battle: BattleState, id: string): BattleUnit | null {
  return battle.units.find((unit) => unit.id === id) ?? null;
}

export function officerById(battle: BattleState, id: string): Officer | null {
  return battle.officers.find((officer) => officer.id === id) ?? null;
}

export function unitsOf(battle: BattleState, side: SideId): BattleUnit[] {
  return battle.units.filter((unit) => unit.side === side && onField(unit));
}

export function wingUnits(battle: BattleState, side: SideId, wing: WingId): BattleUnit[] {
  return unitsOf(battle, side).filter((unit) => unit.wing === wing);
}

/** Tổng quân còn đứng của một bên. */
export function strengthOf(battle: BattleState, side: SideId): number {
  return unitsOf(battle, side).reduce((total, unit) => total + unit.strength, 0);
}

/** Sĩ khí trung bình có trọng số theo quân số — con số cột trạng thái hiện. */
export function averageMorale(battle: BattleState, side: SideId): number {
  const units = unitsOf(battle, side);
  const total = units.reduce((sum, unit) => sum + unit.strength, 0);
  if (total <= 0) return 0;
  return units.reduce((sum, unit) => sum + unit.morale * unit.strength, 0) / total;
}

/** Bên này còn bao nhiêu phần đội quân chưa vỡ. Điều kiện kết thúc trận đọc ở đây. */
export function standingShare(battle: BattleState, side: SideId): number {
  const units = battle.units.filter((unit) => unit.side === side);
  const max = units.reduce((sum, unit) => sum + unit.maxStrength, 0);
  if (max <= 0) return 0;
  const standing = units
    .filter((unit) => controllable(unit) && onField(unit))
    .reduce((sum, unit) => sum + unit.strength, 0);
  return standing / max;
}

/** Người chơi có ra lệnh được cho đơn vị này không (mục 3). */
export function playerCommands(battle: BattleState, unit: BattleUnit): boolean {
  if (unit.side !== battle.playerSide) return false;
  if (battle.duelling) return false;
  const command = battle.command;
  if (command.scope === 'toan-quan' || command.scope === 'toan-quan-chien-luoc') return true;
  if (command.ownedWings.includes(unit.wing)) return true;
  return command.ownedUnitIds.includes(unit.id);
}
