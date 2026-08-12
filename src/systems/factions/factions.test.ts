import { beforeAll, describe, expect, it } from 'vitest';
import { createRng } from '@/core/rng';
import { registerGameSlices } from '@/state/register';
import { createInitialState } from '@/state/store';
import { slices } from '@/state/slices';
import { resetModifierSources, runCheck } from '@/systems/check';
import { registerCheckSources } from '@/systems/check/sources';
import { characterOf } from '@/systems/character';
import { accessTierFor } from '@/systems/nations/access';
import { createVassal, formFaction, rebellionRisk } from '@/systems/realm';
import { grantTitle } from '@/systems/titles';
import {
  FACTION_INFLUENCE_SOURCE,
  canPromoteFactionMembership,
  factionMemberRankOf,
  factionOrganizationTierOf,
  factionStandingOf,
  registerFactionSources,
  seedFactionMemberships,
} from './index';

beforeAll(() => {
  slices.reset();
  registerGameSlices();
  resetModifierSources();
  registerCheckSources();
  registerFactionSources();
});

describe('cấp bậc cá nhân trong phe', () => {
  it('biến hội đoàn cũ thành tư cách có cấp, ảnh hưởng và lòng trung', () => {
    const [membership] = seedFactionMemberships(['Phường thợ rèn'], 'nation_hre', 1444);
    expect(membership).toMatchObject({
      name: 'Phường thợ rèn',
      powerId: 'nation_hre',
      rankId: 'thanh-vien-tuyen-the',
      influence: 18,
      loyalty: 55,
    });
    expect(factionMemberRankOf(membership?.rankId ?? '').name).toBe('Thành viên tuyên thệ');
  });

  it('tước vị, uy tín và quan hệ giúp thăng cấp nhưng không tự đổi chức vị', () => {
    const state = createInitialState('phe-lien-ket');
    const character = characterOf(state)!;
    const membership = seedFactionMemberships(['Hội thương nhân'], 'nation_hre', 1444)[0]!;
    character.allegiance.memberships = [membership];
    character.resources.prestige = 40;
    character.relations = {
      npc_a: { trust: 30, note: 'người môi giới' },
      npc_b: { trust: 10, note: 'người bảo trợ' },
    };
    state['titles'] = {
      held: [grantTitle({ titleId: 'cong-tuoc', fiefName: 'Công quốc Thử', path: 'duoc-phong', year: 1444 })],
      viewing: '',
      successionLawId: 'truong-nam',
      designatedHeir: '',
      legitimacyLog: [],
    };

    const standing = factionStandingOf(state, membership);
    expect(standing.lines.some((line) => line.label.includes('Tước vị'))).toBe(true);
    expect(standing.lines.some((line) => line.label.includes('Uy tín'))).toBe(true);
    expect(standing.lines.some((line) => line.label.includes('Mạng lưới'))).toBe(true);
    expect(standing.total).toBeGreaterThanOrEqual(38);
    expect(canPromoteFactionMembership(state, membership)).toMatchObject({ ok: true });
    expect(membership.rankId).toBe('thanh-vien-tuyen-the');
  });

  it('chức vị phe đi vào kiểm định và lòng trung thấp gây phạt ngược có tên', () => {
    const state = createInitialState('phe-kiem-dinh');
    const character = characterOf(state)!;
    const membership = {
      ...seedFactionMemberships(['Hội giữ cầu'], 'nation_hre', 1444)[0]!,
      rankId: 'nguoi-giu-an',
      loyalty: 20,
    };
    character.allegiance.memberships = [membership];
    character.allegiance.activeFactionId = membership.id;

    const check = runCheck(createRng('phe-kiem-dinh'), {
      id: 'check.dam-phan-phe',
      system: 'd100',
      domain: 'skill.dam-phan',
      difficulty: 'thuong',
      base: 50,
      state,
    });
    const lines = check.result.modifiers.filter((line) => line.source === FACTION_INFLUENCE_SOURCE);
    expect(lines.some((line) => line.label.includes('Người giữ ấn'))).toBe(true);
    expect(lines.some((line) => line.label.includes('nghi ngờ lòng trung'))).toBe(true);
  });

  it('chức vị nội bộ mở đúng tầng chính trị của thế lực', () => {
    expect(accessTierFor({ powerId: 'nation_hre', titles: [], factionId: 'nation_hre', factionRank: 2 })).toBe('tac-dong');
    expect(accessTierFor({ powerId: 'nation_hre', titles: [], factionId: 'nation_hre', factionRank: 4 })).toBe('choi-that');
    expect(accessTierFor({ powerId: 'nation_hre', titles: [], factionId: 'nation_frank', factionRank: 4 })).toBe('tac-dong');
  });
});

describe('cấp tổ chức của phe chư hầu', () => {
  const makeVassals = (count: number) => Array.from({ length: count }, (_, index) =>
    createVassal({
      slug: `v${String(index)}`,
      name: `Chư hầu ${String(index + 1)}`,
      titleId: 'ba-tuoc',
      loyalty: 15 + index,
      ambition: 70,
      holdingCount: 5,
      levyMen: 900,
      claims: ['quyền tự xử'],
    }),
  );

  it('phe có thủ lĩnh, chức vị từng người, cố kết, ảnh hưởng và cấp rõ ràng', () => {
    const formed = formFaction(makeVassals(8), 1444, 'Liên minh thử', 'đòi quyền tự xử');
    expect(formed.faction).not.toBeNull();
    const faction = formed.faction!;
    expect(faction.members).toContain(faction.leaderId);
    expect(faction.memberRanks[faction.leaderId]).toBe('thu-linh');
    expect(faction.cohesion).toBeGreaterThan(0);
    expect(faction.influence).toBeGreaterThan(0);
    expect(factionOrganizationTierOf(faction.tierId).rank).toBeGreaterThan(1);
  });

  it('cấp tổ chức và chức vị làm nguy cơ nổi loạn tăng bằng một dòng giải thích cụ thể', () => {
    const formed = formFaction(makeVassals(8), 1444, 'Liên minh thử', 'đòi quyền tự xử');
    const faction = formed.faction!;
    const leader = formed.vassals.find((vassal) => vassal.npcId === faction.leaderId)!;
    const alone = rebellionRisk({ ...leader, factionId: '' }, 50);
    const organised = rebellionRisk(leader, 50, 0, faction);
    expect(organised.risk).toBeGreaterThan(alone.risk);
    expect(organised.reasons.some((line) => line.label.includes('Thủ lĩnh'))).toBe(true);
    expect(organised.reasons.some((line) => line.label.includes(factionOrganizationTierOf(faction.tierId).name))).toBe(true);
  });
});
