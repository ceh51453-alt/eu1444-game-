/**
 * THẨM QUYỀN CỦA TƯỚC VỊ — nguồn modifier thứ hai của Phần 13.
 *
 * `legitimacy.ts` trả lời "người ta có tin tờ giấy này hợp pháp không?". File
 * này trả lời câu khác: "tờ giấy ấy cho phép làm gì?". Một Hầu tước mạnh ở biên
 * phòng, một Bá tước mạnh ở thuế/tòa, một Hồng y mạnh trong bầu cử Giáo hoàng;
 * biến tất cả thành một khoản +rank duy nhất sẽ xóa sạch khác biệt lịch sử ấy.
 */

import { domainMatches, modifierSources, registerModifierSource, type Modifier, type ModifierSource } from '@/systems/check/registry';
import { scaleToSystem } from '@/systems/check/sources';
import { characterOf } from '@/systems/character/slice';
import { grantName, rankOf, titleInfluenceConfig, titleName, titleOf } from './data';
import { heldTitles, primaryTitleOf } from './slice';

export const TITLE_INFLUENCE_SOURCE = 'titles.tham-quyen';

function isPlayer(actor: string, id: string | undefined): boolean {
  return actor === '' || actor === id;
}

function line(
  system: Parameters<typeof scaleToSystem>[0],
  label: string,
  value: number,
): Modifier {
  return { label, source: TITLE_INFLUENCE_SOURCE, ...scaleToSystem(system, value) };
}

export const titleInfluenceSource: ModifierSource = {
  id: TITLE_INFLUENCE_SOURCE,
  domains: ['skill.nghi-thuc', 'rule.*'],
  compute(ctx) {
    const character = characterOf(ctx.state);
    if (character !== null && !isPlayer(ctx.actor, character.identity.id)) return null;

    const config = titleInfluenceConfig();
    const held = heldTitles(ctx.state);
    const primary = primaryTitleOf(ctx.state);
    if (primary === null || held.length === 0) return null;

    const lines: Modifier[] = [];
    if (config.rankAuthority.domains.some((pattern) => domainMatches(pattern, ctx.domain))) {
      const value = rankOf(primary.titleId) * config.rankAuthority.valuePerRank;
      if (value !== 0) {
        lines.push(line(ctx.system, `${config.rankAuthority.label}: ${titleName(primary.titleId)}`, value));
      }
    }

    // Một đặc quyền pháp lý không nhân đôi chỉ vì cùng người giữ hai tờ giấy có
    // cùng câu chữ. Chọn tờ bậc cao hơn để ghi nhãn, giữ bảng modifier gọn và
    // chặn việc sưu tập tước thấp thành cách cộng vô hạn.
    const seenGrants = new Set<string>();
    const byRank = [...held].sort((left, right) => rankOf(right.titleId) - rankOf(left.titleId));
    for (const heldTitle of byRank) {
      for (const grant of titleOf(heldTitle.titleId)?.grants ?? []) {
        if (seenGrants.has(grant)) continue;
        seenGrants.add(grant);
        const effect = config.grants[grant];
        if (effect === undefined || !effect.domains.some((pattern) => domainMatches(pattern, ctx.domain))) continue;
        lines.push(line(ctx.system, `${grantName(grant)} · ${titleName(heldTitle.titleId)}`, effect.value));
      }
    }

    const year = ctx.state?.meta.gameDate.year ?? 0;
    for (const heldTitle of held) {
      const pressures = [
        !heldTitle.churchRecognised ? config.pressures.churchUnrecognised : null,
        heldTitle.rivalClaimant !== '' ? config.pressures.rivalClaimant : null,
        heldTitle.termEndsYear > 0 && year >= heldTitle.termEndsYear - 1 ? config.pressures.expiringTerm : null,
      ];
      for (const pressure of pressures) {
        if (pressure === null || !pressure.domains.some((pattern) => domainMatches(pattern, ctx.domain))) continue;
        lines.push(line(ctx.system, `${pressure.label} · ${heldTitle.fiefName}`, pressure.value));
      }

      if (
        heldTitle.obligations.arrearsYears > 0 &&
        config.pressures.arrearsPerYear.domains.some((pattern) => domainMatches(pattern, ctx.domain))
      ) {
        lines.push(
          line(
            ctx.system,
            `${config.pressures.arrearsPerYear.label} ${String(heldTitle.obligations.arrearsYears)} năm · ${heldTitle.fiefName}`,
            config.pressures.arrearsPerYear.value * heldTitle.obligations.arrearsYears,
          ),
        );
      }
    }

    return lines.length === 0 ? null : lines;
  },
};

export function registerTitleInfluenceSource(): void {
  if (modifierSources().some((source) => source.id === TITLE_INFLUENCE_SOURCE)) return;
  registerModifierSource(titleInfluenceSource);
}
