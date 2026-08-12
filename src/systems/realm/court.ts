/**
 * TRIỀU ĐÌNH (mục 8).
 *
 * > "Mỗi ghế là một NPC thật có năng lực và lòng trung riêng, làm việc thay người
 * > chơi và CÓ THỂ LÀM HỎNG HOẶC ĂN CHẶN."
 *
 * Câu cuối là toàn bộ lý do file này tồn tại. Một triều đình chỉ cộng phần trăm
 * thì nó là năm cái nút bấm một lần rồi quên; một triều đình có thể ăn chặn thì
 * nó là năm mối quan hệ phải trông chừng. Khác biệt nằm ở hai hàm `skim` và
 * `blunder`, và ở chỗ CẢ HAI ĐỀU IM LẶNG cho tới khi bị phát hiện.
 *
 * GHẾ TRỐNG CŨNG CÓ GIÁ (`vacantPenalty`): không bổ nhiệm quản gia thì tự ngài
 * đếm sổ, và ngài đếm tệ hơn một người làm nghề ấy cả đời.
 */

import type { Rng } from '@/core/rng';
import { courtConfig, courtSeatOf, courtSeatsFor, type CourtSeat } from '@/systems/titles';
import type { CourtAppointment } from './types';

export class RealmCourtError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RealmCourtError';
  }
}

export interface AppointOptions {
  seatId: string;
  npcId: string;
  name: string;
  skill: number;
  loyalty: number;
  year: number;
}

export function appoint(court: readonly CourtAppointment[], options: AppointOptions): CourtAppointment[] {
  const seat = courtSeatOf(options.seatId);
  if (seat === null) throw new RealmCourtError(`không có ghế "${options.seatId}" trong triều đình`);
  return [
    ...court.filter((row) => row.seatId !== options.seatId),
    {
      seatId: seat.id,
      npcId: options.npcId,
      name: options.name,
      skill: Math.max(0, Math.min(100, options.skill)),
      loyalty: Math.max(0, Math.min(100, options.loyalty)),
      sinceYear: options.year,
      caughtSkimming: false,
    },
  ];
}

export function dismiss(court: readonly CourtAppointment[], seatId: string): { court: CourtAppointment[]; line: string } {
  const seat = court.find((row) => row.seatId === seatId);
  return {
    court: court.filter((row) => row.seatId !== seatId),
    line: seat === undefined ? 'Ghế ấy đang trống.' : `${seat.name} bị cách chức. Ông ta đi, và mang theo những gì đã biết.`,
  };
}

/** Ghế đã mở ở bậc này mà chưa có người — bảng trạng thái của mục 11 hiện ra ô trống. */
export function vacantSeats(court: readonly CourtAppointment[], rank: number): CourtSeat[] {
  const filled = new Set(court.map((row) => row.seatId));
  return courtSeatsFor(rank).filter((seat) => !filled.has(seat.id));
}

export interface CourtEffects {
  /** Nhân vào thu thuế. */
  revenueFactor: number;
  /** Nhân vào số quân gọi được. */
  levyFactor: number;
  legitimacyPerYear: number;
  unrest: number;
  /** Cơ hội phát hiện một phe chư hầu đang hình thành, 0–1. */
  plotDetection: number;
  /** Lương triều đình mỗi năm. */
  salary: number;
  lines: string[];
}

/**
 * Triều đình cộng vào cái gì.
 *
 * Một ghế trống KHÔNG phải là 0 — nó là `vacantPenalty` của chính hiệu ứng ghế
 * ấy. Không có quản gia thì thu thuế TỆ ĐI, không phải giữ nguyên; đó là cách một
 * bá tước học được rằng cai trị một mình là không cai trị nổi.
 */
export function courtEffects(court: readonly CourtAppointment[], rank: number): CourtEffects {
  const config = courtConfig();
  const effects: CourtEffects = {
    revenueFactor: 1,
    levyFactor: 1,
    legitimacyPerYear: 0,
    unrest: 0,
    plotDetection: 0,
    salary: 0,
    lines: [],
  };

  for (const seat of courtSeatsFor(rank)) {
    const holder = court.find((row) => row.seatId === seat.id);
    if (holder === undefined) {
      effects.revenueFactor -= seat.effect.revenue * config.vacantPenalty;
      effects.levyFactor -= seat.effect.levy * config.vacantPenalty;
      effects.lines.push(`Ghế ${seat.name.toLowerCase()} bỏ trống — ${seat.brief.toLowerCase()} không có ai lo.`);
      continue;
    }

    const competence = holder.skill / 100;
    effects.revenueFactor += seat.effect.revenue * competence;
    effects.levyFactor += seat.effect.levy * competence;
    effects.legitimacyPerYear += seat.effect.legitimacyPerYear * competence;
    effects.unrest += seat.effect.unrest * competence;
    effects.plotDetection = Math.max(effects.plotDetection, seat.effect.plotDetection * competence);
    effects.salary += config.salaryPerRank * rank;
  }

  effects.revenueFactor = Math.max(0.3, effects.revenueFactor);
  effects.levyFactor = Math.max(0.3, effects.levyFactor);
  return effects;
}

export interface SkimResult {
  court: CourtAppointment[];
  /** Số tiền biến mất. Người chơi KHÔNG được biết trừ khi bị phát hiện. */
  skimmed: number;
  /** Những dòng người chơi ĐƯỢC ĐỌC. Ăn chặn chưa lộ thì không có dòng nào. */
  lines: string[];
}

/**
 * ĂN CHẶN.
 *
 * Lòng trung thấp thì ghế ấy cắt một phần thu. Phát hiện hay không là một cú tung
 * riêng, và mặc định là KHÔNG — nếu người chơi luôn biết ngay thì "ăn chặn" chỉ
 * là một khoản thuế có tên khác.
 *
 * `detection` đến từ gián điệp trưởng (`courtEffects.plotDetection`): ghế duy nhất
 * nhìn thấy chuyện đang xảy ra trong chính nhà mình.
 */
export function skim(rng: Rng, court: readonly CourtAppointment[], revenue: number, detection: number): SkimResult {
  const config = courtConfig();
  const result: SkimResult = { court: [...court], skimmed: 0, lines: [] };

  result.court = court.map((holder) => {
    if (holder.loyalty >= config.skimBelowLoyalty) return holder;
    const seat = courtSeatOf(holder.seatId);
    if (seat === null) return holder;

    const share = config.skimShare * seat.effect.corruptionRisk * (1 - holder.loyalty / config.skimBelowLoyalty);
    const taken = Math.round(Math.max(0, revenue) * share);
    if (taken <= 0) return holder;
    result.skimmed += taken;

    const caught = rng.int(1, 100) <= Math.round(detection * 100);
    if (!caught) return holder;

    result.lines.push(`${holder.name} bị bắt quả tang: ${String(taken)} đồng không tới kho.`);
    return { ...holder, caughtSkimming: true };
  });

  return result;
}

export interface BlunderResult {
  lines: string[];
  /** Có ai làm hỏng việc năm nay không — chỗ gọi quyết định hỏng cái gì. */
  seatIds: string[];
}

/**
 * LÀM HỎNG VIỆC.
 *
 * Khác ăn chặn: đây là chuyện của NĂNG LỰC, không phải lòng trung. Một người trung
 * thành mà kém thì vẫn gửi nhầm sứ, vẫn đếm sai sổ, vẫn để một lá thư rơi vào tay
 * người không nên đọc. Và cái này thì người chơi BIẾT ngay — hậu quả của sự kém
 * cỏi không giấu được lâu như hậu quả của sự tham lam.
 */
export function blunder(rng: Rng, court: readonly CourtAppointment[]): BlunderResult {
  const config = courtConfig();
  const result: BlunderResult = { lines: [], seatIds: [] };

  for (const holder of court) {
    if (holder.skill >= config.blunderBelowSkill) continue;
    if (rng.int(1, 100) > config.blunderChance) continue;
    const seat = courtSeatOf(holder.seatId);
    result.seatIds.push(holder.seatId);
    result.lines.push(`${holder.name} làm hỏng việc ${seat?.brief.toLowerCase() ?? holder.seatId} năm nay.`);
  }

  return result;
}

/**
 * Năng lực CỘNG THÊM mà triều đình cho vào một phép kiểm cai trị.
 *
 * Đây là vế "làm việc thay người chơi" của mục 8: một bá tước ngu dốt nhưng có
 * quản gia giỏi vẫn thu được thuế. Cộng vào `base` của `runCheck`, không đăng ký
 * làm nguồn modifier — vì nó không phải một hoàn cảnh, nó LÀ người đang làm việc.
 */
export function courtBonus(court: readonly CourtAppointment[], seatId: string): number {
  const config = courtConfig();
  const holder = court.find((row) => row.seatId === seatId);
  if (holder === undefined) return 0;
  return holder.skill / config.skillDivisor + holder.loyalty / config.loyaltyDivisor;
}
