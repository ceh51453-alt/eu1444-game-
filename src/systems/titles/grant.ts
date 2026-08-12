/**
 * BA CON ĐƯỜNG LÊN TƯỚC (mục 5) — và một con đường xuống.
 *
 * | Con đường | Chính danh |
 * |---|---|
 * | Được phong   | cao nhất, kèm nghĩa vụ nặng |
 * | Thừa kế      | cao, có thể phải tranh với anh em |
 * | Chiếm đoạt   | THẤP: chư hầu không phục, hàng xóm có cớ, Giáo hội có thể không công nhận |
 *
 * Ba con đường ấy KHÔNG phải ba nhánh if rải khắp code: chúng là ba con số khởi
 * đầu trong `data/titles.json → config.legitimacy.startByPath`, cộng với đúng
 * một chỗ phạt lòng trung ở `usurperVassalPenalty`. Cân bằng lại cả ba chỉ phải
 * sửa một bảng.
 *
 * "CHIẾM" LÀ ĐỘNG TỪ CỦA THÀNH TRÌ, "ĐOẠT" LÀ ĐỘNG TỪ CỦA THÁI ẤP (Phụ lục A mục
 * 4, cụm sai số 8). Đánh chiếm ba thành trì của một bá quốc KHÔNG cho ngài tờ
 * giấy; tờ giấy vẫn thuộc về người cũ cho tới khi có người đủ thẩm quyền tước nó
 * đi. Nên hàm ở đây tên là `usurp`, và nó KHÔNG nhận một `Holding` nào.
 */

import { fiefIdFor } from '@/systems/character/possessions';
import { ladderForNation, ladderOf, legitimacyConfig, obligationConfig, rankOf, titleOf } from './data';
import { adjustLegitimacy, startingLegitimacy } from './legitimacy';
import type { FiefObligations, HeldTitle, LegitimacyEntry, TitlePath } from './types';

export class TitleGrantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TitleGrantError';
  }
}

/** Nghĩa vụ mặc định của một bậc, đọc thẳng từ data (R5). */
export function obligationsFor(titleId: string): FiefObligations {
  const title = titleOf(titleId);
  if (title === null) throw new TitleGrantError(`không có tước "${titleId}" trong thang nào`);
  return {
    levyDays: title.obligations.levyDays,
    tribute: title.obligations.tribute,
    courtDays: title.obligations.courtDays,
    paidThisYear: false,
    attendedThisYear: false,
    arrearsYears: 0,
    levyDaysCalled: 0,
  };
}

export interface GrantOptions {
  titleId: string;
  /** Tên thái ấp, ví dụ "thái ấp Bá tước Swabia". Luôn kèm loại từ (Phụ lục A mục 9c). */
  fiefName: string;
  path: TitlePath;
  year: number;
  /** Thề với ai. Rỗng nghĩa là giữ thẳng từ vương quyền. */
  liege?: string;
  rivalClaimant?: string;
  churchRecognised?: boolean;
  /** Nhiệm kỳ: 0 nghĩa là tước thế tập. Thang bầu cử tự lấy từ `ladder.termYears`. */
  termEndsYear?: number;
  note?: string;
  /** Id thái ấp đã dùng — chặn trùng. */
  taken?: ReadonlySet<string>;
}

/**
 * Cấp một tước.
 *
 * KHÔNG kiểm tra điều kiện ở đây — `canTake` làm việc đó, và nó phải gọi được
 * riêng để UI hiện được LÝ DO trước khi người chơi bấm. Một hàm vừa kiểm vừa cấp
 * thì UI chỉ còn cách thử rồi bắt lỗi, và câu giải thích không bao giờ tới nơi.
 */
export function grantTitle(options: GrantOptions): HeldTitle {
  const title = titleOf(options.titleId);
  if (title === null) throw new TitleGrantError(`không có tước "${options.titleId}" trong thang nào`);

  const ladder = ladderOf(title.ladderId);
  const term = title.termYears > 0 ? title.termYears : (ladder?.termYears ?? 0);

  return {
    titleId: title.id,
    fiefId: fiefIdFor(options.fiefName, options.taken ?? new Set()),
    fiefName: options.fiefName,
    ladderId: title.ladderId,
    path: options.path,
    legitimacy: startingLegitimacy(options.path),
    sinceYear: options.year,
    liege: options.liege ?? '',
    obligations: obligationsFor(title.id),
    termEndsYear: options.termEndsYear ?? (term > 0 ? options.year + term : 0),
    rivalClaimant: options.rivalClaimant ?? '',
    churchRecognised: options.churchRecognised ?? options.path !== 'chiem-doat',
    note: options.note ?? '',
  };
}

export interface TakeContext {
  /** Thế lực người chơi đang thuộc về — quyết định thang nào mở (mục 3). */
  nationId: string;
  /** Độ thuần huyết 0–100, cho thang Cao Tiên. */
  blood: number;
  age: number;
  /** Những tước đang giữ, để chặn giữ hai bậc của cùng một thang. */
  held: readonly HeldTitle[];
}

export interface TakeVerdict {
  ok: boolean;
  reason: string;
}

/**
 * Có lấy được tước này không, và nếu không thì VÌ SAO.
 *
 * Bốn cửa chặn, và cả bốn đều đến từ data chứ không từ code: `requiresNation`,
 * `minBlood`, `minAge`, và luật của thang (`hereditary: false` thì không có
 * đường thừa kế nào — con một tể tướng Orc vào đời bằng đúng cửa học viên).
 */
export function canTake(titleId: string, path: TitlePath, ctx: TakeContext): TakeVerdict {
  const title = titleOf(titleId);
  if (title === null) return { ok: false, reason: `Không có tước "${titleId}".` };

  const ladder = ladderOf(title.ladderId);
  if (ladder === null) return { ok: false, reason: `Tước này thuộc một thang không có thật.` };

  if (title.requiresNation !== '' && title.requiresNation !== ctx.nationId) {
    return { ok: false, reason: `${title.name} chỉ tồn tại trong một thế lực khác.` };
  }
  if (!ladder.hereditary && path === 'thua-ke') {
    return { ok: false, reason: `${ladder.name} không thế tập — không ai thừa kế được ${title.name}.` };
  }
  if (title.minBlood > 0 && ctx.blood < title.minBlood) {
    return {
      ok: false,
      reason: `${title.name} đòi dòng máu ${String(title.minBlood)}; ngài có ${String(Math.round(ctx.blood))}.`,
    };
  }
  if (title.minAge > 0 && ctx.age < title.minAge) {
    return {
      ok: false,
      reason: `${title.name} đòi ít nhất ${String(title.minAge)} tuổi; ngài mới ${String(Math.round(ctx.age))}.`,
    };
  }

  const sameLadder = ctx.held.find((held) => held.ladderId === title.ladderId);
  if (sameLadder !== undefined && rankOf(sameLadder.titleId) >= title.rank) {
    return { ok: false, reason: `Ngài đã đứng ở bậc ngang hoặc trên trong ${ladder.name}.` };
  }

  return { ok: true, reason: '' };
}

/** Thang mặc định của một thế lực — cửa UI dùng để dựng danh sách tước chọn được. */
export function ladderFor(nationId: string): string {
  return ladderForNation(nationId).id;
}

// ---------------------------------------------------------------------------
// Đoạt và tước
// ---------------------------------------------------------------------------

export interface UsurpResult {
  title: HeldTitle;
  /** Phạt lòng trung áp cho MỌI chư hầu của thái ấp này (mục 5, mục 7). */
  vassalPenalty: number;
  lines: string[];
}

/**
 * ĐOẠT một thái ấp.
 *
 * Ba hệ quả của mục 5 đều nằm ở đây và không nằm chỗ nào khác: chính danh thấp,
 * chư hầu không phục, Giáo hội chưa công nhận. Hàng xóm "có cớ gây chiến" là hệ
 * quả thứ tư và nó thuộc Phần 14 — chỗ này chỉ để lại `rivalClaimant` làm cái cớ.
 */
export function usurp(options: Omit<GrantOptions, 'path'>): UsurpResult {
  const config = legitimacyConfig();
  const title = grantTitle({ ...options, path: 'chiem-doat', churchRecognised: false });
  return {
    title,
    vassalPenalty: -Math.abs(config.usurperVassalPenalty),
    lines: [
      `Ngài đoạt ${options.fiefName}. Trên giấy nó là của ngài từ hôm nay.`,
      `Chính danh khởi đầu ${String(title.legitimacy)} — chư hầu chưa ai quỳ, và Giáo hội chưa nói gì.`,
    ],
  };
}

/** Giáo hội công nhận — vế còn lại của mục 5. */
export function recognise(title: HeldTitle, year: number): { title: HeldTitle; entry: LegitimacyEntry } {
  const config = legitimacyConfig();
  const moved = adjustLegitimacy(title, config.churchRecognitionBonus, 'Giáo hội công nhận', year);
  return { title: { ...moved.title, churchRecognised: true }, entry: moved.entry };
}

/** Giáo hội lên án. Nặng hơn phần thưởng công nhận, có chủ ý. */
export function condemn(title: HeldTitle, year: number): { title: HeldTitle; entry: LegitimacyEntry } {
  const config = legitimacyConfig();
  const moved = adjustLegitimacy(title, -config.churchCondemnPenalty, 'Giáo hội lên án', year);
  return { title: { ...moved.title, churchRecognised: false }, entry: moved.entry };
}

export interface RevokeResult {
  held: HeldTitle[];
  taken: HeldTitle | null;
  line: string;
}

/**
 * TƯỚC ĐOẠT một thái ấp khỏi tay người giữ.
 *
 * Mất thái ấp KHÔNG có nghĩa là mất thành trì (Phụ lục A mục 1): hàm này chỉ đụng
 * vào mảng tước, và nó cố ý không có tham số nào nhận `holdings`. Ai còn ngồi
 * trong tòa thành sau khi tờ giấy đổi tên là một câu chuyện khác, và thường là
 * một cuộc vây hãm.
 */
export function revoke(held: readonly HeldTitle[], fiefId: string): RevokeResult {
  const target = held.find((title) => title.fiefId === fiefId) ?? null;
  if (target === null) return { held: [...held], taken: null, line: 'Không có thái ấp nào như thế trong tay ngài.' };
  return {
    held: held.filter((title) => title.fiefId !== fiefId),
    taken: target,
    line: `${target.fiefName} bị tước. Giấy tờ không còn mang tên ngài — thành trì thì vẫn còn người của ngài trong đó.`,
  };
}

// ---------------------------------------------------------------------------
// Hợp đồng phong kiến hai chiều (mục 7)
// ---------------------------------------------------------------------------

export interface ArrearsVerdict {
  /** `khong` · `hau-toa` · `phat` · `tuoc-dat`. */
  action: 'khong' | 'hau-toa' | 'phat' | 'tuoc-dat';
  fine: number;
  line: string;
}

/**
 * Người chơi NỢ lãnh chúa cấp trên, và không trả thì bị làm gì.
 *
 * Đây là vế thường bị quên của hợp đồng phong kiến: mọi game đều cho người chơi
 * đòi chư hầu, ít game bắt người chơi trả nợ. Mục 7 nói thẳng — không làm tròn
 * thì bị kiện, bị phạt, bị tước đất — nên ba mức ấy có mặt đủ ở đây.
 */
export function arrearsVerdict(title: HeldTitle): ArrearsVerdict {
  const config = obligationConfig();
  const years = title.obligations.arrearsYears;

  if (years >= config.arrearsSeizureYears) {
    return {
      action: 'tuoc-dat',
      fine: 0,
      line: `Nợ ${String(years)} năm. Lãnh chúa tuyên bố ${title.fiefName} bị tước.`,
    };
  }
  if (years >= config.arrearsSummonsYears) {
    return {
      action: 'phat',
      fine: Math.round(title.obligations.tribute * config.arrearsFineShare * years),
      line: `Nợ ${String(years)} năm. Tòa lãnh chúa phạt thêm ngoài phần cống còn thiếu.`,
    };
  }
  if (years > 0) {
    return { action: 'hau-toa', fine: 0, line: `Nợ ${String(years)} năm — ngài bị gọi ra hầu tòa lãnh chúa.` };
  }
  return { action: 'khong', fine: 0, line: '' };
}

/**
 * GỌI QUÂN CỦA MÌNH — và con số ngày này chính là con số Phần 11 đọc.
 *
 * Gọi quá `levyOverCallDays` trong một năm là bẻ khế ước: chư hầu vẫn đi, nhưng
 * ghi một mối hận. Đó là lý do hàm trả về cả `broke` chứ không chỉ trả về số ngày.
 */
export function callLevy(title: HeldTitle, days: number): { title: HeldTitle; broke: boolean; line: string } {
  const config = obligationConfig();
  const asked = Math.max(0, Math.round(days));
  const called = title.obligations.levyDaysCalled + asked;
  const broke = called > config.levyOverCallDays;
  return {
    broke,
    title: { ...title, obligations: { ...title.obligations, levyDaysCalled: called } },
    line: broke
      ? `Gọi tới ngày thứ ${String(called)} trong năm — quá hạn khế ước, và họ nhớ.`
      : `Gọi ${String(asked)} ngày quân dịch; đã dùng ${String(called)} ngày trong năm.`,
  };
}

/** Sang năm mới: nghĩa vụ đặt lại, nợ thì không. */
export function resetYear(title: HeldTitle): HeldTitle {
  const owed = title.obligations;
  return {
    ...title,
    obligations: {
      ...owed,
      paidThisYear: false,
      attendedThisYear: false,
      levyDaysCalled: 0,
      arrearsYears: owed.paidThisYear ? 0 : owed.arrearsYears + 1,
    },
  };
}
