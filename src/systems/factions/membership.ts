import type { GameState } from '@/state/slices';
import { domainMatches } from '@/systems/check/registry';
import { characterOf } from '@/systems/character/slice';
import { heldTitles } from '@/systems/titles/slice';
import { rankOf } from '@/systems/titles/data';
import { nationsStateOf } from '@/systems/nations/slice';
import { countryRankEffectiveEffects, countryRankOfPower } from '@/systems/nations/country-rank';
import { factionMemberRankOf, factionMemberRanks, factionStandingConfig } from './data';

export interface FactionMembership {
  id: string;
  name: string;
  kind: string;
  powerId: string;
  rankId: string;
  influence: number;
  loyalty: number;
  joinedYear: number;
  note: string;
}

export interface FactionStandingBreakdown {
  total: number;
  lines: { label: string; value: number }[];
}

function slug(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-|-$/gu, '');
}

/** Biến danh sách hội đoàn cũ thành tư cách thành viên có cấp bậc thật. */
export function seedFactionMemberships(guilds: readonly string[], powerId: string, year: number): FactionMembership[] {
  return guilds.map((name, index) => ({
    id: `faction_${slug(name) || String(index + 1)}`,
    name,
    kind: 'hoi-doan',
    powerId,
    rankId: 'thanh-vien-tuyen-the',
    influence: 18,
    loyalty: 55,
    joinedYear: year,
    note: 'Tư cách khởi đầu; chưa giữ chức vụ nội bộ.',
  }));
}

export function factionMembershipsOf(state: GameState | null | undefined): readonly FactionMembership[] {
  const character = characterOf(state);
  if (character === null) return [];
  const memberships = character.allegiance.memberships;
  if (memberships.length > 0) return memberships;
  return seedFactionMemberships(character.allegiance.guilds, character.allegiance.nationId, state?.meta.gameDate.year ?? 1444);
}

export function activeFactionMembershipOf(state: GameState | null | undefined): FactionMembership | null {
  const character = characterOf(state);
  const memberships = factionMembershipsOf(state);
  if (memberships.length === 0) return null;
  const active = character?.allegiance.activeFactionId ?? '';
  return memberships.find((entry) => entry.id === active) ?? [...memberships].sort(
    (left, right) => factionMemberRankOf(right.rankId).rank - factionMemberRankOf(left.rankId).rank,
  )[0] ?? null;
}

/**
 * Sức nặng để xin thăng cấp. Tước, uy tín và quan hệ giúp mở cửa, nhưng cấp bậc
 * vẫn là một trường riêng: có dòng dõi không đồng nghĩa tự nhiên giữ ấn của phe.
 */
export function factionStandingOf(state: GameState | null | undefined, membership: FactionMembership): FactionStandingBreakdown {
  const config = factionStandingConfig();
  const character = characterOf(state);
  const bestTitle = heldTitles(state ?? null).reduce((best, title) => Math.max(best, rankOf(title.titleId)), 0);
  const prestige = character?.resources.prestige ?? 0;
  const relations = Math.min(
    config.relationCap,
    Object.values(character?.relations ?? {}).filter((relation) => relation.trust >= 20).length,
  );
  const lines = [
    { label: 'Ảnh hưởng gây dựng trong phe', value: membership.influence },
    { label: `Tước vị cao nhất (bậc ${String(bestTitle)})`, value: bestTitle * config.titleRankWeight },
    { label: 'Uy tín cá nhân', value: Math.floor(Math.max(0, prestige) / config.prestigeDivisor) },
    { label: `Mạng lưới quan hệ (${String(relations)})`, value: relations * config.relationWeight },
  ];
  const power = nationsStateOf(state ?? null)?.powers.find((entry) => entry.id === membership.powerId);
  if (power !== undefined) {
    const pressure = countryRankEffectiveEffects(power).factionPressure;
    lines.push({
      label: `Cạnh tranh chức vụ trong ${countryRankOfPower(power).name}`,
      value: -pressure,
    });
  }
  if (membership.loyalty < config.loyaltyPenaltyBelow) {
    lines.push({
      label: 'Lòng trung bị nghi ngờ',
      value: -Math.ceil((config.loyaltyPenaltyBelow - membership.loyalty) / config.loyaltyPenaltyDivisor),
    });
  }
  return { total: Math.max(0, Math.min(100, Math.round(lines.reduce((sum, line) => sum + line.value, 0)))), lines };
}

export function nextFactionRankOf(rankId: string) {
  const current = factionMemberRankOf(rankId);
  return factionMemberRanks().find((entry) => entry.rank === current.rank + 1) ?? null;
}

export function canPromoteFactionMembership(state: GameState, membership: FactionMembership): { ok: boolean; reason: string } {
  const next = nextFactionRankOf(membership.rankId);
  if (next === null) return { ok: false, reason: 'Đã ở cấp cao nhất.' };
  const standing = factionStandingOf(state, membership).total;
  if (standing < next.minStanding) {
    return { ok: false, reason: `Cần sức nặng ${String(next.minStanding)}, hiện có ${String(standing)}.` };
  }
  if (membership.loyalty < 35) return { ok: false, reason: 'Lòng trung dưới 35; phe chưa giao thêm quyền.' };
  return { ok: true, reason: `Đủ điều kiện được xét lên ${next.name}.` };
}

export function factionAppliesToDomain(domain: string): boolean {
  return factionStandingConfig().activeDomains.some((pattern) => domainMatches(pattern, domain));
}

export function factionRankForPower(state: GameState | null | undefined, powerId: string): number {
  return factionMembershipsOf(state)
    .filter((entry) => entry.powerId === powerId)
    .reduce((best, entry) => Math.max(best, factionMemberRankOf(entry.rankId).accessRank), 0);
}
