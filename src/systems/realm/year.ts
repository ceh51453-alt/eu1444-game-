/**
 * MỘT NĂM CAI TRỊ — nơi mọi thứ của Phần 13 gặp nhau.
 *
 * Tầng thành trì đếm bằng TUẦN (`holding/week.ts`); tầng lãnh thổ đếm bằng NĂM.
 * Hai nhịp khác nhau là một tín hiệu thị giác cố ý của Phụ lục A mục 5 — nhìn đơn
 * vị thời gian là biết đang đứng ở tầng nào.
 *
 * THỨ TỰ CÁC BƯỚC LÀ MỘT HỢP ĐỒNG, không phải một tình cờ:
 *
 *   1. triều đình      ai đang làm việc, ai đang bỏ trống
 *   2. thu             thuế của DÂN + cống nộp của THÀNH TRÌ, hai nguồn riêng
 *   3. ăn chặn         trừ sau khi thu, trước khi vào kho
 *   4. chi             nghĩa vụ nợ lên trên, lương, luật, dự án
 *   5. tỉnh            bất ổn, cướp bóc, phát triển
 *   6. dự án           chỉ tung xúc sắc lúc hoàn thành
 *   7. chư hầu         lòng trung, phe cánh, và nổi loạn
 *   8. tòa án          vụ mới, vụ tồn
 *   9. chính danh      trôi, cộng, trừ — sau cùng, vì nó đọc kết quả của tám bước trên
 *
 * Bước 2 nhận `tributes` QUA THAM SỐ. Đó là giao diện `holding → realm` của Phần
 * 12: dữ liệu thuần, không phải một `Holding`. Hàm này chưa từng thấy một ô đất
 * nào, và nếu một ngày nó cần thấy thì mục 1 nói thẳng: dừng lại, hai tầng đã lẫn.
 */

import type { Rng } from '@/core/rng';
import type { GameState } from '@/state/slices';
import type { Tribute } from '@/systems/holding/interfaces';
import {
  adjustLegitimacy,
  driftLegitimacy,
  obligationConfig,
  rankOf,
  resetYear,
  arrearsVerdict,
  type HeldTitle,
  type LegitimacyEntry,
} from '@/systems/titles';
import { justiceConfig } from './data';
import { courtBonus, courtEffects, blunder, skim } from './court';
import { foldLaws } from './laws';
import { backlogUnrest, openCase, rollCaseType } from './justice';
import { advanceProvinceYear } from './province';
import { advanceProjects } from './projects';
import type { RealmSliceState, VassalsSliceState } from './slice';
import { averageOverBase, collectTaxes, taxPressure } from './taxes';
import type { CourtCase, RealmLedger, Vassal } from './types';
import { checkRebellion, formFaction, loyaltyYear, type LoyaltyLine } from './vassals';

export interface RealmYearInput {
  realm: RealmSliceState;
  vassals: VassalsSliceState;
  /** Tước đang giữ. Chính danh của tước cao nhất là chỉ số cai trị (mục 5). */
  titles: readonly HeldTitle[];
  year: number;
  /**
   * Nghĩa vụ các THÀNH TRÌ nộp lên — giao diện `holding → realm` của Phần 12.
   * Dữ liệu thuần: không `Holding`, không dân số, không danh sách công trình.
   */
  tributes?: readonly Tribute[];
  /** Năng lực cai trị của người chơi: chỉ số + kỹ năng, đã cộng sẵn. */
  ruleSkill?: number;
  /** Chư hầu người chơi có ghé thăm trong năm. */
  visited?: readonly string[];
  /** Chư hầu đang bị phe khác chiêu dụ. */
  courted?: readonly string[];
  state?: GameState | null;
}

export interface VassalYearRow {
  npcId: string;
  name: string;
  loyalty: number;
  power: number;
  rebelling: boolean;
  lines: LoyaltyLine[];
}

export interface RealmYearReport {
  realm: RealmSliceState;
  vassals: VassalsSliceState;
  titles: HeldTitle[];
  ledger: RealmLedger;
  legitimacyLog: LegitimacyEntry[];
  /** Chư hầu vừa phản năm nay. Rỗng là một năm yên. */
  rebelled: string[];
  vassalRows: VassalYearRow[];
  lines: string[];
}

/** Dòng RNG riêng của tầng cai trị — số lần tung một năm thay đổi theo cách chơi (R3). */
export const REALM_STREAM = 'realm';

export function advanceRealmYear(rng: Rng, input: RealmYearInput): RealmYearReport {
  const { realm, vassals, year } = input;
  const lines: string[] = [];
  const legitimacyLog: LegitimacyEntry[] = [];

  const primary = [...input.titles].sort((left, right) => rankOf(right.titleId) - rankOf(left.titleId))[0] ?? null;
  const rank = primary === null ? 0 : rankOf(primary.titleId);
  const legitimacy = primary?.legitimacy ?? 50;
  const ruleSkill = input.ruleSkill ?? 10;

  // --- 1. TRIỀU ĐÌNH ------------------------------------------------------
  const court = courtEffects(realm.court, rank);
  lines.push(...court.lines);
  const mistakes = blunder(rng, realm.court);
  lines.push(...mistakes.lines);

  // --- 2. THU -------------------------------------------------------------
  const laws = foldLaws(realm.laws);
  const pressure = taxPressure(realm.taxRates);

  const revenue = collectTaxes(rng, realm.provinces, realm.taxRates, {
    base: ruleSkill + courtBonus(realm.court, 'quan-gia'),
    revenueFactor: court.revenueFactor * (1 + laws.revenueFactor) * (mistakes.seatIds.includes('quan-gia') ? 0.75 : 1),
    state: input.state ?? null,
  });
  lines.push(...revenue.lines);

  // Cống nộp của thành trì — nguồn tiền THỨ HAI, và nó là một động từ khác. Thành
  // trì NỘP NGHĨA VỤ, dân thì bị THU THUẾ (Phụ lục A mục 4, cụm sai số 2).
  const tributeIn = (input.tributes ?? []).reduce((sum, row) => sum + (row.paid ? row.tribute : 0), 0);
  const unpaid = (input.tributes ?? []).filter((row) => !row.paid);
  if (unpaid.length > 0) {
    lines.push(`${String(unpaid.length)} thành trì không nộp đủ nghĩa vụ năm nay.`);
  }

  // --- 3. ĂN CHẶN ---------------------------------------------------------
  const skimming = skim(rng, realm.court, revenue.amount + tributeIn, court.plotDetection);
  lines.push(...skimming.lines);

  // --- 4. CHI -------------------------------------------------------------
  let tributeOut = 0;
  const titles: HeldTitle[] = [];
  for (const title of input.titles) {
    const owed = title.obligations;
    const canPay = realm.treasury + revenue.amount + tributeIn >= owed.tribute;
    tributeOut += canPay ? owed.tribute : 0;

    const paid: HeldTitle = { ...title, obligations: { ...owed, paidThisYear: canPay } };
    const rolled = resetYear(paid);
    const verdict = arrearsVerdict(rolled);
    if (verdict.line !== '') lines.push(`${title.fiefName}: ${verdict.line}`);
    tributeOut += verdict.fine;

    if (!rolled.obligations.attendedThisYear && owed.courtDays > 0) {
      const config = obligationConfig();
      const moved = adjustLegitimacy(rolled, config.courtAbsenceLegitimacy, 'Không hầu triều', year);
      titles.push(moved.title);
      legitimacyLog.push(moved.entry);
      continue;
    }
    titles.push(rolled);
  }

  const projectSpend = 0;
  const ledger: RealmLedger = {
    taxRevenue: revenue.amount,
    tributeIn,
    tributeOut,
    lawUpkeep: laws.upkeep,
    courtSalary: court.salary,
    projectSpend,
    skimmed: skimming.skimmed,
    net: 0,
  };
  ledger.net = Math.round(
    ledger.taxRevenue + ledger.tributeIn - ledger.tributeOut - ledger.lawUpkeep - ledger.courtSalary - ledger.skimmed,
  );

  // --- 5. TỈNH ------------------------------------------------------------
  const rebellingProvinces = new Set(
    vassals.list.filter((vassal) => vassal.rebelling).flatMap((vassal) => vassal.provinceIds),
  );

  let provinces = realm.provinces.map((province) => {
    const result = advanceProvinceYear(province, {
      lawUnrest: laws.unrest,
      lawBanditry: laws.banditry,
      lawDevelopment: laws.development,
      taxUnrest: pressure.unrest,
      rebelling: rebellingProvinces.has(province.id),
    });
    lines.push(...result.lines);
    return result.province;
  });

  // --- 6. DỰ ÁN -----------------------------------------------------------
  const projects = advanceProjects(rng, realm.projects, provinces, {
    base: ruleSkill + courtBonus(realm.court, 'quan-gia'),
    state: input.state ?? null,
  });
  provinces = projects.provinces;
  lines.push(...projects.lines);

  // --- 7. CHƯ HẦU ---------------------------------------------------------
  const taxOver = averageOverBase(realm.taxRates);
  const liegePower = 40 + rank * 6;
  const visited = new Set(input.visited ?? []);
  const courted = new Set(input.courted ?? []);

  const vassalRows: VassalYearRow[] = [];
  let updated: Vassal[] = vassals.list.map((vassal) => {
    const result = loyaltyYear(vassal, {
      tax: taxOver,
      levyDaysOver: Math.max(0, vassal.obligations.levyDays - obligationConfig().levyOverCallDays),
      liegeLegitimacy: legitimacy,
      law: laws.vassalLoyalty,
      visited: visited.has(vassal.npcId),
      courted: courted.has(vassal.npcId),
      liegePower,
    });
    vassalRows.push({
      npcId: result.vassal.npcId,
      name: result.vassal.name,
      loyalty: result.vassal.loyalty,
      power: result.vassal.power,
      rebelling: result.vassal.rebelling,
      lines: result.lines,
    });
    return result.vassal;
  });

  // Phe cánh hình thành TRƯỚC khi tung nổi loạn: mục 7 nói phe làm mọi thành viên
  // nguy hiểm hơn, nên nếu tung trước thì phe không bao giờ kịp có tác dụng.
  const factions = [...vassals.factions];
  if (!updated.some((vassal) => vassal.factionId !== '')) {
    const formed = formFaction(updated, year, 'Liên minh bất mãn', 'đòi hạ thuế và trả lại quyền tự xử');
    if (formed.faction !== null) {
      updated = formed.vassals;
      factions.push(formed.faction);
      lines.push(`${String(formed.faction.members.length)} chư hầu lập phe: ${formed.faction.demand}.`);
    }
  }

  const rebelled: string[] = [];
  let alreadyRebelling = updated.filter((vassal) => vassal.rebelling).length;
  updated = updated.map((vassal) => {
    const check = checkRebellion(rng, vassal, legitimacy, alreadyRebelling);
    if (check.line !== '') lines.push(check.line);
    if (check.rebelled) {
      rebelled.push(vassal.name);
      alreadyRebelling += 1;
    }
    return check.vassal;
  });

  for (const row of vassalRows) {
    const after = updated.find((vassal) => vassal.npcId === row.npcId);
    if (after !== undefined) row.rebelling = after.rebelling;
  }

  // --- 8. TÒA ÁN ----------------------------------------------------------
  const justice = justiceConfig();
  const cases: CourtCase[] = realm.cases.filter((row) => row.verdictId === '');
  const newCases = Math.floor(provinces.length * justice.casesPerYearPerProvince + laws.casesPerYear);
  for (let index = 0; index < newCases; index++) {
    const type = rollCaseType(rng);
    const province = provinces[rng.int(0, Math.max(0, provinces.length - 1))];
    if (province === undefined) break;
    const plaintiff = updated[rng.int(0, Math.max(0, updated.length - 1))];
    const defendant = updated[rng.int(0, Math.max(0, updated.length - 1))];
    cases.push(
      openCase({
        caseTypeId: type.id,
        provinceId: province.id,
        plaintiff: plaintiff?.npcId ?? 'dan',
        plaintiffName: plaintiff?.name ?? 'dân trong vùng',
        defendant: defendant?.npcId ?? 'dan',
        defendantName: defendant?.name ?? 'dân trong vùng',
        year,
        index: cases.length + 1,
      }),
    );
  }

  const backlog = backlogUnrest(cases);
  if (backlog.line !== '') lines.push(backlog.line);
  if (backlog.unrest > 0) {
    provinces = provinces.map((province) => ({
      ...province,
      unrest: Math.max(0, Math.min(100, province.unrest + backlog.unrest / Math.max(1, provinces.length))),
    }));
  }

  // --- 9. CHÍNH DANH ------------------------------------------------------
  const legitimacyDelta =
    laws.legitimacyPerYear + court.legitimacyPerYear + pressure.legitimacy + backlog.legitimacy;

  const finalTitles = titles.map((title, index) => {
    let next = driftLegitimacy(title);
    if (index === 0 && Math.abs(legitimacyDelta) >= 0.05) {
      const moved = adjustLegitimacy(next, legitimacyDelta, 'Luật, triều đình, thuế và tòa án trong năm', year);
      next = moved.title;
      legitimacyLog.push(moved.entry);
    }
    return next;
  });

  return {
    ledger,
    legitimacyLog,
    rebelled,
    vassalRows,
    lines,
    titles: finalTitles,
    realm: {
      ...realm,
      provinces,
      projects: projects.running,
      court: skimming.court,
      cases,
      treasury: Math.max(0, realm.treasury + ledger.net),
      ledger,
    },
    vassals: { ...vassals, list: updated, factions },
  };
}
