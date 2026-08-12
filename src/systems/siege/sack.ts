/**
 * CƯỚP PHÁ HAY THA — VÀ VẾT NÓ ĐỂ LẠI TRÊN BẢN ĐỒ CHIẾN LƯỢC (Phần 11 mục 7).
 *
 * Mục 7 gọi đây là "ví dụ mẫu cho quy tắc chung của game: quyết định chiến thuật
 * phải để lại vết trên bản đồ chiến lược". Nên hàm quan trọng nhất ở file này
 * không phải `sackOrSpare` — nó là `reputationOps`, cái đưa con số ra khỏi
 * minigame và vào state, nơi Phần 15 đọc được.
 *
 * LUẬT CHIẾN TRANH THỜI ĐÓ, và nó là điều kiện của cả lựa chọn: thành đầu hàng
 * THEO ĐIỀU KIỆN thì được tha; thành bị hạ bằng TỔNG CÔNG thì bên thắng có QUYỀN
 * cướp phá. `mayChoose` gác đúng chỗ ấy — một chỉ huy hạ thành bằng một khế ước
 * rồi vẫn cướp phá không phải đang chọn, ông ta đang PHÁ ƯỚC, và đó là một cửa
 * khác hẳn với những cái giá khác hẳn.
 *
 * HAI VẾ, KHÔNG PHẢI MỘT VẾ TỐT VÀ MỘT VẾ XẤU. Tha thì quân không được thưởng, sĩ
 * khí giảm, và có thể nổi loạn đòi phần — nếu vế ấy không đau thì "nhân từ" chỉ
 * là một nút bấm miễn phí và mục 7 mất hết sức nặng.
 */

import type { Rng } from '@/core/rng';
import type { PatchOp } from '@/state/mvu-parse';
import { sackConfig } from './data';
import { crueltyOf, churchOf, mercyOf } from './slice';
import { garrisonMen, type SiegeState } from './types';

export interface SackOutcome {
  sacked: boolean;
  loot: number;
  populationLost: number;
  cruelty: number;
  mercy: number;
  church: number;
  /** Uy tín người chơi được hoặc mất. Chủ sở hữu thật là Phần 13. */
  reputation: number;
  /** Lòng thù hằn của cả vùng. Chủ sở hữu thật là Phần 15. */
  localHatred: number;
  mutiny: boolean;
  lines: string[];
}

/**
 * Có được quyền chọn không.
 *
 * Chỉ khi thành bị hạ BẰNG TỔNG CÔNG hoặc bằng phản trắc. Một thành mở cổng theo
 * điều khoản thì điều khoản ấy đã trả lời câu hỏi này rồi.
 */
export function mayChoose(siege: SiegeState): boolean {
  if (!siege.finished || siege.winner !== 'vay') return false;
  return siege.ending === 'ha-bang-tong-cong' || siege.ending === 'phan-boi-mo-cong';
}

/** Áp lực từ chính quân mình — càng cao thì tha càng dễ thành một cuộc nổi loạn. */
export function sackPressure(siege: SiegeState): number {
  const config = sackConfig();
  return config.mutinyChanceIfSpared + siege.attacker.sackPressure * config.mutinyChancePerSackPressure;
}

export function sackOrSpare(siege: SiegeState, rng: Rng, sack: boolean): SackOutcome {
  const config = sackConfig();
  const out: SackOutcome = {
    sacked: sack,
    loot: 0,
    populationLost: 0,
    cruelty: 0,
    mercy: 0,
    church: 0,
    reputation: 0,
    localHatred: 0,
    mutiny: false,
    lines: [],
  };

  if (sack) {
    out.loot = Math.round(siege.fort.population * config.lootPerPopulation + siege.fort.supplies.food * config.lootFromStores);
    out.populationLost = Math.round(siege.fort.population * config.populationLossIfSacked);
    siege.fort.population -= out.populationLost;
    siege.attacker.morale = Math.min(100, siege.attacker.morale + config.moraleIfSacked);

    out.cruelty = config.crueltyIfSacked;
    out.church = config.churchIfSacked;
    out.reputation = config.reputationIfSacked;
    out.localHatred = config.localHatredIfSacked;

    out.lines.push(
      `Ba ngày. Thu được ${String(out.loot)} đồng chiến lợi phẩm, và ${String(out.populationLost)} người trong thành không còn nữa.`,
    );
    out.lines.push('Quân được thỏa mãn — nhưng từ hôm nay, mọi thành trì khác nghe tin sẽ tử thủ tới cùng.');
  } else {
    siege.attacker.morale = Math.max(0, siege.attacker.morale + config.moraleIfSpared);
    out.mercy = config.mercyIfSpared;
    out.church = config.churchIfSpared;
    out.reputation = config.reputationIfSpared;

    out.lines.push('Lệnh cấm cướp phá được đọc trước cổng, và hai kẻ trái lệnh bị treo ngay tại chỗ.');

    if (rng.int(1, 100) <= sackPressure(siege)) {
      out.mutiny = true;
      siege.attacker.morale = Math.max(0, siege.attacker.morale - 12);
      out.lines.push('Đêm ấy có tiếng đập cửa kho. Một phần quân không chịu ra về tay không.');
    } else {
      out.lines.push('Tin này cũng sẽ đi xa — và lần sau, một cánh cổng sẽ mở dễ hơn nhiều.');
    }
  }

  siege.sacked = sack;
  siege.cruelty = Math.max(0, siege.cruelty + out.cruelty);
  siege.mercy = Math.max(0, siege.mercy + out.mercy);
  siege.church += out.church;

  for (const line of out.lines) siege.log.push({ week: siege.week, side: 'vay', text: line, major: true });
  return out;
}

/**
 * Đưa tiếng tàn bạo RA KHỎI minigame và vào state (R2).
 *
 * Đây là cái làm mục 7 khác một dòng chữ trong biên niên. Người gọi chốt cả lô
 * qua MVU một lần, sau khi cuộc vây hãm đã xong — cùng luật với Phần 9 và 10,
 * vì undo phải tua về TRƯỚC cả cuộc vây hãm.
 */
export function reputationOps(siege: SiegeState): PatchOp[] {
  const before = {
    cruelty: crueltyOf(siege.state),
    mercy: mercyOf(siege.state),
    church: churchOf(siege.state),
  };

  const ops: PatchOp[] = [
    {
      op: 'set',
      path: 'siege.reputation.tanBao',
      from: before.cruelty,
      to: Math.max(0, before.cruelty + siege.cruelty),
      reason: `tiếng tàn bạo sau cuộc vây hãm ${siege.fort.name}`,
      source: 'json',
    },
    {
      op: 'set',
      path: 'siege.reputation.nhanTu',
      from: before.mercy,
      to: Math.max(0, before.mercy + siege.mercy),
      reason: `tiếng nhân từ sau cuộc vây hãm ${siege.fort.name}`,
      source: 'json',
    },
    {
      op: 'set',
      path: 'siege.reputation.giaoHoi',
      from: before.church,
      to: before.church + siege.church,
      reason: `thái độ Giáo hội sau cuộc vây hãm ${siege.fort.name}`,
      source: 'json',
    },
    {
      op: 'push',
      path: 'siege.holds',
      to: {
        holdId: siege.fort.id,
        name: siege.fort.name,
        turn: siege.turn,
        weeks: siege.week,
        ending: siege.ending,
        winner: siege.winner,
        sacked: siege.sacked === true,
        terms: [...siege.terms],
      },
      reason: 'sổ những thành đã đổi chủ, Phần 15 đọc khi tính phản ứng của thành khác',
      source: 'json',
    },
  ];

  return ops;
}

/**
 * Chiến lợi phẩm và tù binh sau cùng.
 *
 * KHÔNG đi vào state ở đây, và đó là cố ý — cùng lằn ranh `Aftermath` của Phần 10
 * đã giữ: kho thành trì thuộc Phần 12, uy tín và thái ấp thuộc Phần 13. Phần 11
 * tính ra con số và giao lại.
 */
export interface SiegeSpoils {
  loot: number;
  ransom: number;
  prisoners: number;
  wounded: number;
  lines: string[];
}

export function spoils(siege: SiegeState, sack: SackOutcome | null, ransom: number, garrisonPrisoner: boolean): SiegeSpoils {
  const men = garrisonMen(siege.fort);
  const out: SiegeSpoils = {
    loot: sack?.loot ?? 0,
    ransom,
    prisoners: garrisonPrisoner ? men : 0,
    // Thương binh chuyển sang hệ chữa trị của Phần 7 — cùng đường Phần 10 đã mở.
    wounded: Math.round(siege.attacker.losses.combat * 0.6 + siege.defender.losses.combat * 0.6),
    lines: [],
  };

  out.lines.push(`Chiến lợi phẩm: ${String(Math.round(out.loot))} đồng.`);
  if (out.ransom > 0) out.lines.push(`Tiền chuộc đòi được: ${String(Math.round(out.ransom))} đồng.`);
  if (out.prisoners > 0) out.lines.push(`${String(out.prisoners)} tù binh.`);
  out.lines.push(`${String(out.wounded)} thương binh hai bên, chuyển cho thầy thuốc.`);
  return out;
}
