/** Thang cấp bậc dùng chung cho hội đoàn của nhân vật và phe chư hầu. */

import { z } from 'zod';
import factionsFile from '@data/factions.json';

const memberRankSchema = z.object({
  id: z.string().min(1),
  rank: z.int().min(0),
  name: z.string().min(1),
  minStanding: z.number().min(0).max(100),
  checkBonus: z.number(),
  accessRank: z.int().min(0).max(4),
  privileges: z.array(z.string().min(1)),
  duties: z.array(z.string().min(1)),
});

const organizationTierSchema = z.object({
  id: z.string().min(1),
  rank: z.int().min(1),
  name: z.string().min(1),
  minMembers: z.int().min(2),
  minInfluence: z.number().min(0).max(100),
  rebellionBonus: z.number().min(0),
  description: z.string().min(1),
});

const factionDataSchema = z.object({
  schemaVersion: z.literal(1),
  memberRanks: z.array(memberRankSchema).min(2),
  organizationTiers: z.array(organizationTierSchema).min(1),
  standing: z.object({
    titleRankWeight: z.number().min(0),
    prestigeDivisor: z.number().positive(),
    relationWeight: z.number().min(0),
    relationCap: z.int().min(0),
    loyaltyPenaltyBelow: z.number().min(0).max(100),
    loyaltyPenaltyDivisor: z.number().positive(),
    lowLoyaltyCheckPenalty: z.number().max(0),
    activeDomains: z.array(z.string().min(1)).min(1),
  }),
});

const DATA = factionDataSchema.parse(factionsFile);

export type FactionMemberRank = z.infer<typeof memberRankSchema>;
export type FactionOrganizationTier = z.infer<typeof organizationTierSchema>;

export function factionMemberRanks(): readonly FactionMemberRank[] {
  return DATA.memberRanks;
}

export function factionMemberRankOf(id: string): FactionMemberRank {
  return DATA.memberRanks.find((entry) => entry.id === id) ?? DATA.memberRanks[0]!;
}

export function factionMemberRankByNumber(rank: number): FactionMemberRank {
  const ordered = [...DATA.memberRanks].sort((left, right) => right.rank - left.rank);
  return ordered.find((entry) => entry.rank <= rank) ?? DATA.memberRanks[0]!;
}

export function factionOrganizationTiers(): readonly FactionOrganizationTier[] {
  return DATA.organizationTiers;
}

export function factionOrganizationTierOf(id: string): FactionOrganizationTier {
  return DATA.organizationTiers.find((entry) => entry.id === id) ?? DATA.organizationTiers[0]!;
}

export function factionStandingConfig(): typeof DATA.standing {
  return DATA.standing;
}
