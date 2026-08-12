/**
 * XỬ ÁN (mục 8) — và cửa sang QUYẾT ĐẤU TƯ PHÁP của Phần 9.
 *
 * > "Mỗi phán quyết làm hài lòng một bên và mất lòng bên kia. Nếu hai bên không
 * > phục, có thể yêu cầu QUYẾT ĐẤU TƯ PHÁP — chuyển thẳng sang Phần 9. Xử công
 * > bằng tăng chính danh, xử thiên vị tăng lòng trung một phe."
 *
 * Bảng phán quyết trong `data/laws.json` cố ý KHÔNG có dòng nào làm vừa lòng cả
 * hai. "Hòa giải" cũng làm cả hai hơi giận — vì trong một vụ tranh chấp ranh giới
 * thì một nửa cánh rừng không phải là thứ ai đó muốn.
 *
 * CỬA SANG PHẦN 9 là một YÊU CẦU, không phải một cú gọi. `judicialDuelRequest`
 * trả về dữ liệu thuần mô tả trận đấu cần mở; chỗ gọi dựng `DuelState` bằng máy
 * của Phần 9. Nhờ vậy `realm` không import `minigames/duel`, và một cuộc xử án
 * không kéo theo cả một minigame vào bộ nhớ.
 */

import type { Rng } from '@/core/rng';
import { runCheck } from '@/systems/check';
import type { GameState } from '@/state/slices';
import { caseTypeOf, caseTypes, justiceConfig, verdictOf, verdicts, type CaseType, type Verdict } from './data';
import type { CourtCase } from './types';

export class RealmJusticeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RealmJusticeError';
  }
}

export interface OpenCaseOptions {
  caseTypeId: string;
  provinceId: string;
  plaintiff: string;
  plaintiffName: string;
  defendant: string;
  defendantName: string;
  year: number;
  summary?: string;
  index?: number;
}

export function openCase(options: OpenCaseOptions): CourtCase {
  const type = caseTypeOf(options.caseTypeId);
  if (type === null) throw new RealmJusticeError(`không có loại vụ án "${options.caseTypeId}"`);
  return {
    id: `vu_${String(options.year)}_${String(options.index ?? 1)}`,
    caseTypeId: type.id,
    provinceId: options.provinceId,
    plaintiff: options.plaintiff,
    plaintiffName: options.plaintiffName,
    defendant: options.defendant,
    defendantName: options.defendantName,
    openedYear: options.year,
    summary: options.summary ?? `${type.name}: ${options.plaintiffName} kiện ${options.defendantName}.`,
    verdictId: '',
    bothRefuse: false,
  };
}

/** Rút một loại vụ án theo trọng số — vụ tranh chấp ranh giới hay gặp nhất. */
export function rollCaseType(rng: Rng): CaseType {
  const rows = caseTypes();
  const total = rows.reduce((sum, row) => sum + row.weight, 0);
  let ticket = rng.int(1, Math.max(1, Math.round(total * 10))) / 10;
  for (const row of rows) {
    ticket -= row.weight;
    if (ticket <= 0) return row;
  }
  const last = rows[rows.length - 1];
  if (last === undefined) throw new RealmJusticeError('bảng loại vụ án rỗng');
  return last;
}

/**
 * Những phán quyết chọn được cho một vụ.
 *
 * `quyet-dau-tu-phap` chỉ hiện khi loại vụ cho phép, khi CẢ HAI bên không phục, và
 * khi luật cấm quyết đấu chưa được ban. Ba điều kiện chứ không phải một — nếu chỉ
 * cần một bên đòi là đấu thì mọi vụ án đều kết thúc bằng kiếm và tòa án thành
 * trang trí.
 */
export function verdictOptions(courtCase: CourtCase, activeLaws: readonly string[]): Verdict[] {
  const config = justiceConfig();
  const type = caseTypeOf(courtCase.caseTypeId);
  const duelBanned = activeLaws.includes(config.judicialDuel.bannedByLaw);
  const duelAllowed =
    (type?.allowsJudicialDuel ?? false) &&
    !duelBanned &&
    (!config.judicialDuel.requiresBothRefuse || courtCase.bothRefuse);

  return verdicts().filter((verdict) => (verdict.opensDuel ? duelAllowed : true));
}

export interface JudgeResult {
  case: CourtCase;
  verdict: Verdict;
  /** Chính danh cộng thêm — chỉ "xử theo luật" mới dương (mục 8). */
  legitimacy: number;
  /** Lòng trung cho bên được xử thắng và bên thua. */
  loyaltyFavoured: number;
  loyaltyOther: number;
  unrest: number;
  revenue: number;
  /** Vụ này chuyển sang Phần 9 chứ chưa kết thúc. */
  opensDuel: boolean;
  lines: string[];
}

/**
 * PHÁN QUYẾT.
 *
 * "Xử theo luật, không nể ai" là lựa chọn DUY NHẤT tăng chính danh, và cũng là
 * lựa chọn duy nhất phải qua kiểm định — 3d6, miền `rule.xu-an`. Xử đúng luật đòi
 * biết luật; xử thiên vị thì chỉ đòi biết mình muốn gì.
 */
export function judge(
  rng: Rng,
  courtCase: CourtCase,
  verdictId: string,
  options: { base: number; state?: GameState | null } = { base: 10 },
): JudgeResult {
  const config = justiceConfig();
  const verdict = verdictOf(verdictId);
  if (verdict === null) throw new RealmJusticeError(`không có phán quyết "${verdictId}"`);
  const type = caseTypeOf(courtCase.caseTypeId);

  const lines: string[] = [];
  let scale = 1;

  if (verdict.requiresCheck) {
    const run = runCheck(rng, {
      id: 'check.xu-an',
      system: '3d6',
      domain: config.check,
      difficulty: type?.difficulty ?? 'thuong',
      base: options.base,
      tags: ['cai-tri', 'xu-an', courtCase.caseTypeId],
      state: options.state ?? null,
    });

    switch (run.result.tier) {
      case 'critSuccess':
        scale = 1.6;
        lines.push('Phán quyết rành mạch tới mức cả hai bên đều im.');
        break;
      case 'success':
        scale = 1;
        break;
      case 'costlySuccess':
        scale = 0.6;
        lines.push('Xử đúng, nhưng phải mất cả một mùa mới xong.');
        break;
      case 'fail':
        scale = -0.5;
        lines.push('Ngài đọc sai lệ làng. Người ta nhận ra trước khi ngài nhận ra.');
        break;
      case 'critFail':
        scale = -1.2;
        lines.push('Phán quyết sai trắng trợn. Bây giờ cả hai bên đều có cớ.');
        break;
    }
  }

  lines.push(`${type?.name ?? 'Vụ án'}: ${verdict.name}.`);

  return {
    verdict,
    legitimacy: Math.round(verdict.effects.legitimacy * scale * 10) / 10,
    loyaltyFavoured: verdict.effects.loyaltyFavoured,
    loyaltyOther: verdict.effects.loyaltyOther,
    unrest: verdict.effects.unrest,
    revenue: verdict.effects.revenue,
    opensDuel: verdict.opensDuel,
    lines,
    case: {
      ...courtCase,
      verdictId: verdict.keepsCase || verdict.opensDuel ? '' : verdict.id,
    },
  };
}

/** Vụ chưa xử tồn lại làm vùng bất ổn thêm (mục 8). */
export function backlogUnrest(cases: readonly CourtCase[]): { unrest: number; legitimacy: number; line: string } {
  const config = justiceConfig();
  const waiting = cases.filter((row) => row.verdictId === '');
  if (waiting.length === 0) return { unrest: 0, legitimacy: 0, line: '' };

  const over = Math.max(0, waiting.length - config.backlogLimit);
  return {
    unrest: waiting.length * config.backlogUnrestPerCase,
    legitimacy: over > 0 ? config.ignoredCaseLegitimacy * over : 0,
    line:
      over > 0
        ? `${String(waiting.length)} vụ chờ xử — quá ${String(over)} vụ so với sức của tòa, và dân bắt đầu tự xử lấy.`
        : `${String(waiting.length)} vụ đang chờ phán quyết.`,
  };
}

// ---------------------------------------------------------------------------
// Cửa sang Phần 9
// ---------------------------------------------------------------------------

export interface JudicialDuelRequest {
  caseId: string;
  arenaId: string;
  /** Loại hình quyết đấu trong `data/arenas.json → kinds`. */
  kind: string;
  challengerId: string;
  challengerName: string;
  defenderId: string;
  defenderName: string;
  /** Kết quả trận đấu LÀ phán quyết — engine không được lật lại (R1). */
  bindingVerdict: true;
}

/**
 * Dựng lời yêu cầu một trận quyết đấu tư pháp.
 *
 * Trả DỮ LIỆU, không mở minigame: chỗ gọi (`ui/realm`, hoặc `systems/encounter`)
 * dựng `DuelState` bằng máy của Phần 9. Ranh giới này giữ cho một cuộc xử án không
 * kéo cả một minigame vào cây import của tầng cai trị.
 */
export function judicialDuelRequest(courtCase: CourtCase): JudicialDuelRequest {
  const config = justiceConfig().judicialDuel;
  return {
    caseId: courtCase.id,
    arenaId: config.arenaId,
    kind: config.kind,
    challengerId: courtCase.plaintiff,
    challengerName: courtCase.plaintiffName,
    defenderId: courtCase.defendant,
    defenderName: courtCase.defendantName,
    bindingVerdict: true,
  };
}

export interface DuelVerdictResult {
  case: CourtCase;
  legitimacy: number;
  winnerLoyalty: number;
  loserLoyalty: number;
  line: string;
}

/**
 * Kết quả trận đấu quay về thành phán quyết.
 *
 * `honoured` là câu hỏi duy nhất còn lại của người chơi: có tôn trọng kết quả
 * không. Không tôn trọng thì được giữ người mình muốn giữ, và mất tám điểm chính
 * danh — vì cả vùng vừa nhìn thấy một cuộc phán xử của Chúa bị bác bỏ.
 */
export function applyDuelVerdict(courtCase: CourtCase, winnerId: string, honoured: boolean): DuelVerdictResult {
  const config = justiceConfig().judicialDuel;
  return {
    case: { ...courtCase, verdictId: honoured ? (winnerId === courtCase.plaintiff ? 'xu-cho-nguyen' : 'xu-cho-bi') : '' },
    legitimacy: honoured ? config.legitimacyIfHonoured : config.legitimacyIfIgnored,
    winnerLoyalty: honoured ? config.winnerLoyalty : config.loserLoyalty,
    loserLoyalty: config.loserLoyalty,
    line: honoured
      ? 'Kết quả trận đấu thành phán quyết. Không ai cãi được một phán xử như thế.'
      : 'Ngài bác kết quả. Cả vùng vừa thấy một phán xử bị gạt sang một bên.',
  };
}
