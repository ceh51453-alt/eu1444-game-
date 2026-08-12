import { describe, expect, it } from 'vitest';
import { createPowers } from './create';
import {
  countryRankOf,
  countryRanks,
  registeredCountryRankOf,
  registeredGovernmentFormOf,
} from './data';
import { powerWeight, seedRelations } from './relations';
import {
  canAddTreaty,
  countryElevationVerdict,
  countryRankEffectiveEffects,
  countryRankSupportOf,
  countryStyleOf,
  elevateCountry,
} from './country-rank';

function power(id: string) {
  const found = createPowers().find((entry) => entry.id === id);
  if (found === undefined) throw new Error(`không có ${id}`);
  return found;
}

describe('cấp quốc gia', () => {
  it('có đủ sáu cấp theo thứ tự thành bang → thân → hầu → công → vương → đế', () => {
    expect(countryRanks().map((rank) => rank.id)).toEqual([
      'thanh-bang',
      'than-quoc',
      'hau-quoc',
      'cong-quoc',
      'vuong-quoc',
      'de-quoc',
    ]);
  });

  it('các quốc gia nền ngoài tám bàn chơi cũng có cấp và thể chế', () => {
    expect(registeredCountryRankOf('nation_burgundy')?.id).toBe('cong-quoc');
    expect(registeredCountryRankOf('nation_kalmar')?.id).toBe('vuong-quoc');
    expect(registeredCountryRankOf('nation_hanse')?.id).toBe('cong-quoc');
    expect(registeredGovernmentFormOf('nation_teuton')?.id).toBe('dong-tu-quan-su');
  });

  it('tách cấp tương đương khỏi thể chế và tước người đứng đầu', () => {
    const papacy = countryStyleOf(power('nation_giao-trieu'));
    expect(papacy.rank.id).toBe('vuong-quoc');
    expect(papacy.form.id).toBe('giao-quoc');
    expect(papacy.rulerTitle).toBe('Giáo hoàng');
    expect(papacy.label).toContain('tương đương vương quốc');

    const swiss = countryStyleOf(power('nation_lien-bang-nui'));
    expect(swiss.rank.id).toBe('cong-quoc');
    expect(swiss.rulerTitle).toBe('Chủ tọa nghị hội');
  });

  it('đế hiệu thiếu đất hoặc bị tranh chấp mất bớt hiệu lực nhưng vẫn trả đủ chi phí bộ máy', () => {
    const ottoman = power('nation_ottoman');
    const byzantium = power('nation_dong-la-ma');
    expect(countryRankSupportOf(ottoman).value).toBeGreaterThan(countryRankSupportOf(byzantium).value);
    expect(countryRankEffectiveEffects(byzantium).diplomaticWeight)
      .toBeLessThan(countryRankOf('de-quoc')?.diplomaticWeight ?? 0);
    expect(countryRankEffectiveEffects(byzantium).administrationFactor)
      .toBe(countryRankOf('de-quoc')?.administrationFactor);
  });

  it('cấp quốc gia đi vào cán cân quyền lực và lợi thế chỉ huy', () => {
    const empire = power('nation_ottoman');
    const city = { ...empire, countryRankId: 'thanh-bang', rankDisputed: false };
    expect(powerWeight(empire)).toBeGreaterThan(powerWeight(city));
    expect(countryRankEffectiveEffects(empire).militaryCommandBonus)
      .toBeGreaterThan(countryRankEffectiveEffects(city).militaryCommandBonus);
  });

  it('nâng cấp đòi thực lực và tước cá nhân; thiếu công nhận tạo địa vị tranh chấp', () => {
    const duchy = {
      ...power('nation_frank'),
      countryRankId: 'cong-quoc',
      land: 12,
      prestige: 90,
      stability: 70,
      cohesion: 70,
      treasury: 2_000,
    };
    const lacksTitle = countryElevationVerdict(duchy, 'vuong-quoc', {
      year: 1450,
      rulerTitleRank: 7,
      recognitions: 5,
    });
    expect(lacksTitle.ok).toBe(false);
    expect(lacksTitle.reasons.some((reason) => reason.includes('tước cá nhân bậc 8'))).toBe(true);

    const selfProclaimed = elevateCountry(duchy, 'vuong-quoc', {
      year: 1450,
      rulerTitleRank: 8,
      recognitions: 0,
    });
    expect(selfProclaimed.power.countryRankId).toBe('vuong-quoc');
    expect(selfProclaimed.power.rankDisputed).toBe(true);
    expect(selfProclaimed.power.treasury).toBe(1_150);
    expect(selfProclaimed.line).toContain('Tự xưng');
  });

  it('cấp thấp có ít chỗ cho cam kết ngoại giao hơn cấp cao', () => {
    const powers = createPowers();
    const rows = seedRelations(powers.map((entry) => entry.id));
    const empire = power('nation_ottoman');
    const city = { ...empire, countryRankId: 'thanh-bang' };
    let filled = 0;
    const occupied = rows.map((row) => {
      if (filled >= 2 || (row.a !== city.id && row.b !== city.id)) return row;
      filled += 1;
      return { ...row, treaties: [{ id: 'hiep_thuong-mai', yearsLeft: 5 }] };
    });
    expect(canAddTreaty(city, occupied).ok).toBe(false);
    expect(canAddTreaty(empire, occupied).ok).toBe(true);
  });
});
