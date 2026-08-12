import { modifierSources, registerModifierSource, type ModifierSource } from '@/systems/check/registry';
import { scaleToSystem } from '@/systems/check/sources';
import { characterOf } from '@/systems/character/slice';
import { activeFactionMembershipOf, factionAppliesToDomain } from './membership';
import { factionMemberRankOf, factionStandingConfig } from './data';

export const FACTION_INFLUENCE_SOURCE = 'factions.cap-bac';

export const factionInfluenceSource: ModifierSource = {
  id: FACTION_INFLUENCE_SOURCE,
  domains: ['skill.dam-phan', 'skill.nghi-thuc', 'rule.*'],
  compute(ctx) {
    const character = characterOf(ctx.state);
    if (character !== null && ctx.actor !== '' && ctx.actor !== character.identity.id) return null;
    if (!factionAppliesToDomain(ctx.domain)) return null;
    const membership = activeFactionMembershipOf(ctx.state);
    if (membership === null) return null;
    const rank = factionMemberRankOf(membership.rankId);
    const lines = rank.checkBonus === 0
      ? []
      : [{
          label: `${rank.name} của ${membership.name}`,
          source: FACTION_INFLUENCE_SOURCE,
          ...scaleToSystem(ctx.system, rank.checkBonus),
        }];
    if (membership.loyalty < factionStandingConfig().loyaltyPenaltyBelow) {
      lines.push({
        label: `${membership.name} nghi ngờ lòng trung`,
        source: FACTION_INFLUENCE_SOURCE,
        ...scaleToSystem(ctx.system, factionStandingConfig().lowLoyaltyCheckPenalty),
      });
    }
    return lines.length === 0 ? null : lines;
  },
};

export function registerFactionSources(): void {
  if (modifierSources().some((source) => source.id === FACTION_INFLUENCE_SOURCE)) return;
  registerModifierSource(factionInfluenceSource);
}
