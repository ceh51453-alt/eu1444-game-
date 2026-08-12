/**
 * ĐÀM PHÁN VÀ KHẾ ƯỚC ĐẦU HÀNG CÓ ĐIỀU KIỆN (Phần 11 mục 5).
 *
 * Mục 1 nói phần lớn thành trì đổi chủ vì hết lương HOẶC VÌ THỎA THUẬN, nên file
 * này gánh một nửa số kết cục của cả Phần 11 — nhiều hơn hẳn cuộc tổng công.
 *
 * ĐIỀU LÀM NÓ KHÁC MỘT CÁI HẸN GIỜ, và là lý do nó là một KHẾ ƯỚC chứ không phải
 * một bộ đếm: cả hai bên bị ràng buộc. Bên thủ hứa mở cổng nếu tới ngày ấy không
 * có cứu viện; bên vây hứa ngừng tay cho tới hôm đó. Nếu chỉ bên thủ bị trói thì
 * đây chỉ là một cách trì hoãn, và không đời nào một chỉ huy thế kỷ 14 nhận nó.
 * `breakContract` vì thế nhận CẢ HAI bên làm kẻ phá ước, và phạt cả hai như nhau.
 *
 * HỆ XÚC SẮC: d100 (Phần 5 mục 2 — kỹ năng cá nhân). Ngồi ở bàn đàm phán là một
 * con người với cái lưỡi của họ, không phải một bộ máy hành chính; nếu dùng 3d6
 * thì tài hùng biện của nhân vật không còn chỗ nào để nói.
 */

import type { CheckResult } from '@/core/turn';
import type { Rng } from '@/core/rng';
import { runCheck } from '@/systems/check/run';
import { isSuccess } from '@/systems/check/tiers';
import { characterOf } from '@/systems/character/slice';
import { parleyConfig, packageOf, termOf, type SurrenderTerm } from './data';
import { PARLEY_DOMAIN, makeView, withSiegeView } from './modifiers';
import { garrisonMen, type ParleyRecord, type SiegeSide, type SiegeState, type SurrenderContract } from './types';

export interface ParleyOffer {
  by: SiegeSide;
  /** Id điều khoản đặt lên bàn. */
  terms: readonly string[];
  /** Chỉ có nghĩa khi trong danh sách có điều khoản `conditional`. */
  deadlineWeeks?: number;
  /** `skill_hung-bien` (hùng biện) hoặc `skill_muu-do` (mưu mô). */
  skillId?: string;
}

export interface ParleyOutcome {
  accepted: boolean;
  tier: CheckResult['tier'];
  check: CheckResult;
  contract: SurrenderContract | null;
  /** Điều khoản bên kia gật đầu. Khi `costlySuccess` thì ngắn hơn danh sách đòi. */
  agreed: string[];
  lines: string[];
}

/** Tổng "giá" của những điều khoản một bên đang đòi. Đi vào bảng điều chỉnh. */
export function askWeight(terms: readonly string[], by: SiegeSide): number {
  let total = 0;
  for (const id of terms) {
    const term = termOf(id);
    if (term === null || term.ask !== by) continue;
    total += term.weight;
  }
  return total;
}

/** Điều khoản một bên có thể đưa ra, đã gạt những cái thuộc bên kia. */
export function termsFor(by: SiegeSide): SurrenderTerm[] {
  return parleyTerms().filter((term) => term.ask === by);
}

function parleyTerms(): SurrenderTerm[] {
  const ids = new Set<string>();
  const out: SurrenderTerm[] = [];
  for (const bundle of ['pkg_hao-hiep', 'pkg_thong-thuong', 'pkg_khac-nghiet', 'pkg_cau-hoa']) {
    for (const id of packageOf(bundle)?.terms ?? []) {
      if (ids.has(id)) continue;
      ids.add(id);
      const term = termOf(id);
      if (term !== null) out.push(term);
    }
  }
  return out;
}

function skillLevel(siege: SiegeState, skillId: string): number {
  const character = siege.state === null ? null : characterOf(siege.state);
  const level = character?.skills[skillId]?.level;
  return typeof level === 'number' ? level : parleyConfig().baseWithoutSkill;
}

/**
 * Một vòng đàm phán.
 *
 * `costlySuccess` KHÔNG phải "thành công có phạt": ở đây nó là bản mặc cả thật —
 * bên kia gật đầu nhưng gạt bớt điều khoản đắt nhất khỏi bàn. Đó là kết cục hay
 * gặp nhất của một cuộc đàm phán thật, và nếu nó chỉ thành "được nhưng trừ vài
 * điểm uy tín" thì cả bảng điều khoản của mục 5 không bao giờ được dùng tới.
 */
export function parley(siege: SiegeState, rng: Rng, offer: ParleyOffer): ParleyOutcome {
  const config = parleyConfig();
  const skillId = offer.skillId ?? config.defaultSkill;
  const weight = askWeight(offer.terms, offer.by);

  const run = withSiegeView(makeView(siege, offer.by, { askWeight: weight }), () =>
    runCheck(rng, {
      id: config.checkId,
      system: 'd100',
      domain: PARLEY_DOMAIN,
      difficulty: config.band,
      base: skillLevel(siege, skillId),
      actor: offer.by === siege.playerSide ? '' : `npc_${offer.by}`,
      tags: ['dam-phan'],
      state: siege.state,
    }),
  );

  const check = run.result;
  siege.checks.push({ week: siege.week, side: offer.by, what: 'đàm phán', result: check });

  const lines: string[] = [];
  let agreed: string[] = [];
  let contract: SurrenderContract | null = null;
  const accepted = isSuccess(check.tier);

  if (accepted) {
    agreed = [...offer.terms];
    if (check.tier === 'costlySuccess') {
      // Gạt điều khoản đắt nhất của chính bên đang đòi.
      const mine = offer.terms
        .map((id) => termOf(id))
        .filter((term): term is SurrenderTerm => term !== null && term.ask === offer.by)
        .sort((left, right) => right.weight - left.weight);
      const dropped = mine[0];
      if (dropped !== undefined) {
        agreed = agreed.filter((id) => id !== dropped.id);
        lines.push(`Bên kia gạt "${dropped.name}" ra khỏi bàn và không nhượng thêm một chữ nào.`);
      }
    }
    if (check.tier === 'critSuccess') {
      lines.push('Người ngồi đối diện gật đầu nhanh hơn ngài chờ đợi, và còn tự thêm vào một câu về danh dự.');
      siege.mercy += 4;
    }

    const conditional = agreed.some((id) => termOf(id)?.conditional === true);
    if (conditional) {
      contract = signContract(siege, agreed, offer.deadlineWeeks ?? config.contract.defaultDeadlineWeeks);
      lines.push(
        `Khế ước đã ký: nếu đến tuần ${String(contract.deadlineWeek)} mà không có quân cứu viện, cổng sẽ mở. Từ giờ tới đó, cả hai bên ngừng tay.`,
      );
    }
  } else if (check.tier === 'critFail') {
    // Một cuộc đàm phán hỏng nặng KHÔNG chỉ là "không được gì": nó đóng cửa lại.
    siege.defender.lastParleyWeek = siege.week + config.refusalCooldownWeeks * 2;
    siege.attacker.morale -= 4;
    siege.defender.garrisonMorale -= 3;
    lines.push('Sứ giả bị đuổi ra giữa chừng câu nói. Hai bên sẽ không ngồi lại sớm được nữa.');
  } else {
    siege.defender.lastParleyWeek = siege.week + config.refusalCooldownWeeks;
    lines.push('Lời đề nghị bị từ chối, lịch sự và dứt khoát.');
  }

  const record: ParleyRecord = {
    week: siege.week,
    by: offer.by,
    terms: [...offer.terms],
    accepted,
    conditional: contract !== null,
    tier: check.tier,
    line: lines[0] ?? (accepted ? 'Hai bên đã thỏa thuận.' : 'Không đi tới đâu.'),
  };
  siege.parleys.push(record);
  siege.log.push({
    week: siege.week,
    side: offer.by,
    text: `Đàm phán: ${accepted ? 'thỏa thuận' : 'không thành'} — ${record.line}`,
    major: true,
  });

  return { accepted, tier: check.tier, check, contract, agreed, lines };
}

/** Người chơi có mở được bàn đàm phán tuần này không (chống bấm mỗi tuần). */
export function canParley(siege: SiegeState): boolean {
  if (siege.finished || siege.phase === 'tong-cong') return false;
  return siege.week >= siege.defender.lastParleyWeek;
}

// ---------------------------------------------------------------------------
// Khế ước
// ---------------------------------------------------------------------------

export function signContract(siege: SiegeState, terms: readonly string[], deadlineWeeks: number): SurrenderContract {
  const config = parleyConfig().contract;
  const weeks = Math.max(config.minDeadlineWeeks, Math.min(config.maxDeadlineWeeks, Math.round(deadlineWeeks)));
  const contract: SurrenderContract = {
    agreedWeek: siege.week,
    deadlineWeek: siege.week + weeks,
    terms: [...terms],
    brokenBy: '',
    honored: null,
  };
  siege.contract = contract;
  siege.phase = 'khe-uoc';
  siege.church += 8;
  return contract;
}

export interface ContractTick {
  /** Khế ước vừa tới hạn và cổng phải mở. */
  due: boolean;
  /** Quân cứu viện tới trước hạn — khế ước hết hiệu lực. */
  voided: boolean;
  lines: string[];
}

/**
 * Nhịp của một khế ước, gọi mỗi tuần trong lúc nó còn hiệu lực.
 *
 * `reliefArrivesVoids` là điều khoản ngầm của mọi khế ước loại này và nó phải có
 * mặt: cả lời hứa được viết ra với đúng một điều kiện — "NẾU không có quân cứu
 * viện". Cứu viện tới thì điều kiện ấy sai, và không ai phá ước cả.
 */
export function contractTick(siege: SiegeState): ContractTick {
  const out: ContractTick = { due: false, voided: false, lines: [] };
  const contract = siege.contract;
  if (contract === null || contract.honored !== null) return out;
  const config = parleyConfig().contract;

  if (config.reliefArrivesVoids && siege.reliefIncoming && siege.weeksToRelief <= 0) {
    out.voided = true;
    contract.honored = true;
    siege.contract = null;
    siege.phase = 'vay-ham';
    out.lines.push('Quân cứu viện tới trước ngày hẹn. Khế ước hết hiệu lực đúng như đã viết, không ai mất danh dự.');
    return out;
  }

  if (siege.week >= contract.deadlineWeek) {
    out.due = true;
    contract.honored = true;
    siege.defender.honor += config.keepHonor;
    siege.mercy += config.keepMercy;
    out.lines.push('Đến ngày hẹn. Không có ai trên đường chân trời. Cổng mở đúng như lời đã hứa.');
  }
  return out;
}

/** Phá ước — ai phá cũng phải trả, và trả nặng (mục 5). */
export function breakContract(siege: SiegeState, by: SiegeSide, reason: string): string[] {
  const contract = siege.contract;
  if (contract === null || contract.honored !== null) return [];
  const config = parleyConfig().contract;

  contract.brokenBy = by;
  contract.honored = false;
  siege.phase = 'vay-ham';
  siege.church += config.breakChurch;
  siege.cruelty = Math.max(0, siege.cruelty + config.breakCruelty);
  if (by === 'vay') siege.attacker.morale = Math.max(0, siege.attacker.morale - 6);
  else siege.defender.honor += config.breakHonor;

  const who = by === 'vay' ? 'Bên vây' : 'Bên thủ';
  const lines = [
    `${who} phá khế ước: ${reason}.`,
    'Giáo hội sẽ nghe chuyện này trước khi mùa kết thúc, và mọi thành trì khác cũng thế.',
  ];
  for (const line of lines) siege.log.push({ week: siege.week, side: by, text: line, major: true });
  return lines;
}

// ---------------------------------------------------------------------------
// Chốt điều khoản khi thành đổi chủ
// ---------------------------------------------------------------------------

export interface TermsOutcome {
  /** Quân đồn trú được đi. */
  garrisonFree: boolean;
  garrisonPrisoner: boolean;
  spared: boolean;
  keepsTitle: boolean;
  vassalage: boolean;
  annexed: boolean;
  hostages: number;
  loot: number;
  ransom: number;
  /**
   * Ba con số Phần 11 KHÔNG được tự ghi vào state, vì chủ sở hữu của chúng là
   * phần khác: uy tín và thái ấp thuộc Phần 13, lòng thù hằn của một vùng thuộc
   * Phần 15. Phần 11 tính ra và giao lại — nối chúng vào state ở đây là lấn phạm
   * vi, đúng cùng một lằn ranh mà `Aftermath` của Phần 10 đã giữ.
   */
  defenderHonor: number;
  besiegerHonor: number;
  localHatred: number;
  lines: string[];
}

export function settleTerms(siege: SiegeState, termIds: readonly string[]): TermsOutcome {
  const out: TermsOutcome = {
    garrisonFree: false,
    garrisonPrisoner: false,
    spared: false,
    keepsTitle: false,
    vassalage: false,
    annexed: false,
    hostages: 0,
    loot: 0,
    ransom: 0,
    defenderHonor: 0,
    besiegerHonor: 0,
    localHatred: 0,
    lines: [],
  };

  for (const id of termIds) {
    const term = termOf(id);
    if (term === null) continue;
    out.lines.push(`${term.name}: ${term.text}`);
    for (const [key, value] of Object.entries(term.effects)) {
      switch (key) {
        case 'garrisonFree':
          out.garrisonFree = value > 0;
          break;
        case 'garrisonPrisoner':
          out.garrisonPrisoner = value > 0;
          break;
        case 'spared':
          out.spared = value > 0;
          break;
        case 'keepsTitle':
          out.keepsTitle = value > 0;
          break;
        case 'vassalage':
          out.vassalage = value > 0;
          break;
        case 'annexed':
          out.annexed = value > 0;
          break;
        case 'hostages':
          out.hostages += value;
          break;
        case 'besiegerLoot':
          out.loot += value;
          break;
        case 'besiegerRansom':
          // Tiền chuộc tính theo số quý tộc trong đội đồn trú — một con số, không
          // phải một cờ bật/tắt.
          out.ransom += Math.max(1, Math.round(garrisonMen(siege.fort) / 40)) * 220;
          break;
        case 'defenderTreasury':
          out.loot -= value;
          break;
        case 'defenderHonor':
          out.defenderHonor += value;
          break;
        case 'besiegerHonor':
          out.besiegerHonor += value;
          break;
        case 'localHatred':
          out.localHatred += value;
          break;
        case 'mercy':
          siege.mercy = Math.max(0, siege.mercy + value);
          break;
        case 'church':
          siege.church += value;
          break;
        case 'besiegerMorale':
          siege.attacker.morale = Math.max(0, Math.min(100, siege.attacker.morale + value));
          break;
        case 'contract':
        case 'contractBinding':
          break;
        default:
          break;
      }
    }
  }

  siege.terms = [...termIds];
  return out;
}

/**
 * Gói điều khoản một bên do engine cầm sẽ đưa ra.
 *
 * Đọc được, ba nhánh, và ba nhánh ấy là đúng ba tình huống có thật: đang thắng
 * đậm thì đòi nhiều, đang mòn dần thì hào hiệp cho xong, còn bên thủ thì luôn xin
 * khất tới ngày hẹn — vì đó là nước đi duy nhất mua được thời gian mà không mất
 * gì ngay.
 */
export function autoOffer(siege: SiegeState, by: SiegeSide): ParleyOffer {
  if (by === 'thu') {
    return { by, terms: packageOf('pkg_cau-hoa')?.terms ?? [], deadlineWeeks: 4 };
  }
  const wall = siege.fort.outerWall.integrity / Math.max(1, siege.fort.outerWall.maxIntegrity);
  const strong = wall < 0.35 || siege.fort.lostLayers.length > 0;
  const tired = siege.attacker.morale < 45 || siege.attacker.troops < siege.attacker.startTroops * 0.6;

  if (tired) return { by, terms: packageOf('pkg_hao-hiep')?.terms ?? [] };
  if (strong) return { by, terms: packageOf('pkg_khac-nghiet')?.terms ?? [] };
  return { by, terms: packageOf('pkg_thong-thuong')?.terms ?? [] };
}
