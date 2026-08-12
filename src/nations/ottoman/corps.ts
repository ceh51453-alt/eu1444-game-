/**
 * MƯỜI TÁM QUÂN ĐOÀN — Phần 14 mục 4, phần khó nhất và hay nhất của thế lực này.
 *
 * Cả file là một bài toán chia tiền, và bài toán ấy KHÔNG CÓ LỜI GIẢI ĐÚNG:
 * `demandShare` của mười tám đoàn cộng lại lớn hơn 1, nên năm nào cũng có người
 * bị cắt, và cắt của ai cũng mất lòng người đó.
 *
 * BA SỰ THẬT giữ cho nó không thành một bảng trượt vô hại:
 *
 *  1. **CẤM VỆ (1–8) VÀ TỈNH BINH (9–14) LÀ HAI PHE ĐỐI LẬP CẤU TRÚC.** Ưu ái bên
 *     nào thì bên kia bất mãn. `guardTilt` là một con số duy nhất đo độ nghiêng,
 *     và nó không có vị trí trung lập miễn phí — đứng giữa nghĩa là không ai được
 *     đủ.
 *  2. **UY THẾ VÀ LÒNG TRUNG ĐI NGƯỢC CHIỀU NHAU.** Một quân đoàn thắng trận
 *     nhiều thì uy thế lên; uy thế lên mà lương chậm thì lòng trung xuống; và
 *     đúng cái kết hợp ấy là công thức binh biến.
 *  3. **TÂN BINH ĐOÀN PHẾ TRUẤT ĐƯỢC NGƯỜI CAI TRỊ.** Chỉ một đoàn làm được
 *     chuyện đó (`mutinyLeader`, và `data.ts` bắt buộc đúng một). Kết cục thất
 *     bại đặc trưng của thế lực này phải có MỘT KHUÔN MẶT, không phải một chỉ số
 *     tổng hợp tụt xuống 0.
 */

import type { Rng } from '@/core/rng';
import { corpsConfig, corpsRows, corpsRowOf } from '@/systems/nations/data';
import type { CorpsState } from '@/systems/nations/types';

export interface CorpsYearInput {
  corps: readonly CorpsState[];
  /** Tiền thật dành cho quân đội năm nay. */
  budget: number;
  guardTilt: number;
  arrearYears: number;
  campaignsWon: number;
  atWar: boolean;
  /** Số năm chưa có cuộc chinh phục nào — cỗ máy không có chế độ nghỉ (mục 2.1e). */
  idleYears: number;
}

export interface CorpsYearReport {
  corps: CorpsState[];
  arrearYears: number;
  /** Thiếu bao nhiêu so với tổng lương phải trả. 0 là trả đủ. */
  shortfall: number;
  mutinied: string[];
  /** Quân đoàn vừa phế truất người cai trị, hoặc rỗng. */
  deposedBy: string;
  lines: string[];
}

/** Mười tám quân đoàn lúc bắt đầu, đọc thẳng từ `data/orc-corps.json`. */
export function createCorps(): CorpsState[] {
  return corpsRows().map((row) => ({
    id: row.id,
    men: row.men,
    quality: row.quality,
    loyalty: row.loyalty,
    prestige: row.prestige,
    budgetShare: row.demandShare,
    mutinying: false,
    mutinyYears: 0,
    neglectYears: 0,
  }));
}

/** Lương phải trả cho một quân đoàn. Đoàn sống bằng chiến lợi phẩm không ăn lương. */
export function payrollOf(corps: CorpsState): number {
  const row = corpsRowOf(corps.id);
  if (row === null || row.livesOnPlunder) return 0;
  return (corps.men / 1000) * corpsConfig().budget.payPerThousandMen;
}

export function totalPayroll(corps: readonly CorpsState[]): number {
  return corps.reduce((sum, entry) => sum + payrollOf(entry), 0);
}

/**
 * CHIA NGÂN SÁCH theo đòi hỏi, nghiêng theo `guardTilt`.
 *
 * Trả về phần chia chứ không trả tiền: phần chia là thứ quân đoàn NHÌN THẤY và so
 * bì với nhau, còn tiền chỉ là hệ quả. Đó cũng là lý do bảng trạng thái hiện phần
 * chia chứ không hiện số tiền.
 */
export function allocate(corps: readonly CorpsState[], guardTilt: number): CorpsState[] {
  const config = corpsConfig().faction;
  const weights = corps.map((entry) => {
    const row = corpsRowOf(entry.id);
    const lean = row === null ? 0 : row.group === config.guardGroup ? 0.5 : row.group === config.provincialGroup ? -0.5 : 0;
    return Math.max(0.001, (row?.demandShare ?? 0.05) * (1 + (guardTilt / 100) * lean));
  });
  const total = weights.reduce((sum, weight) => sum + weight, 0) || 1;
  return corps.map((entry, index) => ({ ...entry, budgetShare: (weights[index] ?? 0) / total }));
}

/** Nguy cơ binh biến của một quân đoàn, 0–100. Ba vế, đúng mục 4. */
export function mutinyRisk(corps: CorpsState, arrearYears: number): number {
  const config = corpsConfig().mutiny;
  if (corps.prestige <= config.prestigeAbove || corps.loyalty >= config.loyaltyBelow) {
    // Chậm lương thì KHÔNG cần đủ hai điều kiện kia: mục 4 nói "chậm lương là
    // kích hoạt kiểm định binh biến ngay".
    if (arrearYears === 0) return 0;
    return Math.min(config.riskCap, Math.round(arrearYears * config.riskPerArrearYear * (corps.loyalty < 55 ? 1 : 0.5)));
  }
  const fromPrestige = (corps.prestige - config.prestigeAbove) * config.riskPerPrestigePoint;
  const fromLoyalty = (config.loyaltyBelow - corps.loyalty) * config.riskPerLoyaltyPointMissing;
  const fromPay = arrearYears * config.riskPerArrearYear;
  return Math.min(config.riskCap, Math.round(fromPrestige + fromLoyalty + fromPay));
}

/**
 * MỘT NĂM của mười tám quân đoàn.
 *
 * Thứ tự: chia tiền → lòng trung theo mức được chia → uy thế theo trận → binh
 * biến. Binh biến CUỐI CÙNG vì nó đọc cả hai con số vừa đổi; tung trước là tung
 * trên số liệu năm ngoái.
 */
export function corpsYear(rng: Rng, input: CorpsYearInput): CorpsYearReport {
  const config = corpsConfig();
  const lines: string[] = [];
  const mutinied: string[] = [];
  let deposedBy = '';

  const shared = allocate(input.corps, input.guardTilt);
  const demand = totalPayroll(shared);
  const shortfall = Math.max(0, demand - input.budget);
  const arrearYears = shortfall > demand * 0.05 ? input.arrearYears + 1 : 0;
  if (shortfall > 0) {
    lines.push(
      `Lương quân đoàn thiếu ${String(Math.round(shortfall))} — năm thứ ${String(arrearYears)} liên tiếp chậm lương.`,
    );
  }

  // Đoàn nào ra trận năm nay. Không phải cả mười tám cùng ra, và đoàn bị bỏ quên
  // là đoàn mất uy thế — rồi mất luôn lý do trung thành.
  const fought = new Set<string>();
  if (input.atWar) {
    const pool = shared.filter((entry) => (corpsRowOf(entry.id)?.demandShare ?? 0) > 0.03);
    for (let pick = 0; pick < Math.min(4, pool.length); pick++) {
      const chosen = pool[rng.int(0, pool.length - 1)];
      if (chosen !== undefined) fought.add(chosen.id);
    }
  }

  const corps = shared.map((entry) => {
    const row = corpsRowOf(entry.id);
    const owed = payrollOf(entry);
    const paid = owed === 0 ? owed : input.budget * entry.budgetShare;
    const ratio = owed === 0 ? 1 : Math.min(2, paid / owed);

    let loyalty = entry.loyalty;
    if (ratio < config.budget.underfundedBelow) {
      loyalty += config.budget.loyaltyPerUnderfundedTenth * ((config.budget.underfundedBelow - ratio) * 10);
    } else if (ratio > 1) {
      loyalty += config.budget.loyaltyPerOverfundedTenth * Math.min(3, (ratio - 1) * 10);
    }
    if (arrearYears > 0) loyalty += config.budget.arrearLoyalty;
    else if (input.arrearYears > 0) loyalty += config.mutiny.calmPerPayRestored;

    // Nghiêng phe: đoàn thuộc phe bị bạc đãi mất lòng trung đều đặn, và cả hai phe
    // đều có quân trong tay.
    const lean = row === null ? 0 : row.group === config.faction.guardGroup ? -1 : row.group === config.faction.provincialGroup ? 1 : 0;
    loyalty += input.guardTilt * lean * config.faction.loyaltyPerTiltPoint;

    // Ngừng bành trướng vài năm là ngân sách không kham nổi, và quân đội biết thế.
    if (input.idleYears > config.budget.peaceYearsBeforeStrain) {
      loyalty += config.budget.strainLoyaltyPerYear;
    }

    let prestige = entry.prestige;
    let neglectYears = entry.neglectYears;
    if (fought.has(entry.id)) {
      prestige += input.campaignsWon > 0 ? config.faction.prestigePerVictory : -3;
      neglectYears = 0;
      loyalty += input.campaignsWon > 0 ? config.mutiny.calmPerVictory : 0;
    } else {
      neglectYears += 1;
      if (neglectYears > config.faction.neglectAfterYears) prestige += config.faction.prestigePerNeglectYear;
    }

    // Đoàn sống bằng chiến lợi phẩm mà không có chiến lợi phẩm thì đi cướp của dân
    // mình — mất uy thế, và người cai trị mất ổn định (tính ở `index.ts`).
    if ((row?.livesOnPlunder ?? false) && !input.atWar) {
      loyalty -= 3;
      prestige -= 2;
    }

    return {
      ...entry,
      loyalty: clamp(loyalty),
      prestige: clamp(prestige),
      neglectYears,
    };
  });

  // --- binh biến -----------------------------------------------------------
  const after = corps.map((entry) => {
    const risk = mutinyRisk(entry, arrearYears);
    if (risk <= 0) {
      return entry.mutinying
        ? { ...entry, mutinying: false, mutinyYears: 0, loyalty: clamp(entry.loyalty + config.mutiny.calmPerPayRestored) }
        : entry;
    }
    if (rng.int(1, 100) > risk) return entry;

    const row = corpsRowOf(entry.id);
    const mutinyYears = entry.mutinyYears + 1;
    mutinied.push(entry.id);
    lines.push(`${row?.name ?? entry.id} làm binh biến (nguy cơ ${String(risk)}%, năm thứ ${String(mutinyYears)}).`);

    if ((row?.mutinyLeader ?? false) && mutinyYears >= config.mutiny.depositionAt) {
      deposedBy = entry.id;
      lines.push(`${row?.name ?? entry.id} phế truất người cai trị. Cỗ máy đã ăn chính người dựng ra nó.`);
    }
    return { ...entry, mutinying: true, mutinyYears };
  });

  // Binh biến LAN trong cùng phe: một đoàn cầm vũ khí thì đoàn bên cạnh nhìn thấy
  // là làm được, và cái nhìn ấy đắt hơn mọi lời hứa.
  const mutinyGroups = new Set(mutinied.map((id) => corpsRowOf(id)?.group ?? ''));
  const spread = after.map((entry) => {
    const row = corpsRowOf(entry.id);
    if (row === null || !mutinyGroups.has(row.group) || mutinied.includes(entry.id)) return entry;
    return { ...entry, loyalty: clamp(entry.loyalty - config.mutiny.spreadToGroup / 4) };
  });

  return { corps: spread, arrearYears, shortfall, mutinied, deposedBy, lines };
}

/** Đặt lại độ nghiêng phe. Người chơi tầng 3 gọi cái này, và nó là quyết định lớn nhất. */
export function setTilt(next: number): number {
  return Math.max(-100, Math.min(100, Math.round(next)));
}

/** Sức mạnh quân sự quy ra 0–100 để tầng thế giới dùng. */
export function militaryOf(corps: readonly CorpsState[]): number {
  const men = corps.reduce((sum, entry) => sum + entry.men * (entry.mutinying ? 0 : 1), 0);
  const quality = corps.reduce((sum, entry) => sum + entry.quality * entry.men, 0) / Math.max(1, men);
  return Math.round(Math.min(100, (men / 150000) * 60 + (quality / 100) * 40));
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value * 10) / 10));
}
