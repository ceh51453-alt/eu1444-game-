/**
 * PHIẾU NHÂN VẬT — cột xem trước bên phải của mục 9.
 *
 * Mục 9 đòi "xem trước liên tục bên phải", và chữ liên tục là điểm chính: người
 * chơi phải thấy hệ quả của một lựa chọn ngay lúc chọn, chứ không phải tới bước
 * 9 mới biết mình đã dựng ra một nhân vật không dùng được. Nên thành phần này
 * đọc thẳng bản nháp và không có state riêng nào cả.
 */

import type { ReactNode } from 'react';
import {
  STATS,
  STAT_GROUPS,
  attitudeLabel,
  attitudeTable,
  ageSkillPoints,
  ageStageOf,
  ageStatShift,
  claimStrengthName,
  cultureName,
  houseHeadName,
  houseName,
  draftSkillPercent,
  effectiveAge,
  fiefTitleName,
  finalStats,
  fullName,
  gearName,
  gearWeight,
  holdingRoleName,
  nationName,
  originName,
  raceName,
  realmRoleName,
  religionName,
  settlementTierName,
  skillName,
  skillPointsLeft,
  statBandLabel,
  statCapOf,
  statModsOf,
  statPointsLeft,
  statsIn,
  traitOf,
  traitsOf,
  type CharacterDraft,
  type StatGroupId,
  type StatId,
} from '@/systems/character';
import { regionName } from '@/lore/regions';
import { PortraitImage } from '@/ui/portrait';

function Line({ label, value }: { label: string; value: string }): ReactNode {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="shrink-0 text-vellum/60">{label}</span>
      <span className="truncate text-right text-parchment" title={value}>
        {value}
      </span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }): ReactNode {
  return (
    <section className="flex flex-col gap-1.5 border-b border-oak-light px-4 py-3 last:border-b-0">
      <h3 className="text-[0.65rem] font-semibold tracking-[0.2em] text-brass uppercase">{title}</h3>
      {children}
    </section>
  );
}

function StatGroup({ draft, group }: { draft: CharacterDraft; group: StatGroupId }): ReactNode {
  const final = finalStats(draft);
  const mods = statModsOf(draft.raceId);

  return (
    <div className="flex flex-col gap-0.5">
      {statsIn(group).map((id) => {
        const cap = statCapOf(draft.raceId, id);
        const mod = mods[id];
        return (
          <div key={id} className="flex items-baseline gap-2 text-sm">
            <span className="w-24 shrink-0 text-vellum/60">{STATS[id].name}</span>
            <span className="w-6 text-right font-mono text-parchment">{final[id]}</span>
            <span className="w-8 font-mono text-xs text-vellum/40">
              {mod === 0 ? '' : mod > 0 ? `+${mod}` : mod}
            </span>
            <span className="flex-1 truncate text-xs text-vellum/40">
              {statBandLabel(final[id])}
              {cap < 20 ? ` · trần ${cap}` : ''}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function CharacterPreview({ draft }: { draft: CharacterDraft }): ReactNode {
  const trained = Object.entries(draft.skills).filter(([, training]) => training > 0);
  const traits = traitsOf(draft.raceId);
  const stage = ageStageOf(draft.raceId, draft.age);
  const ageBonus = ageSkillPoints(draft);
  const ageShift = Object.entries(ageStatShift(draft.raceId, draft.age)).filter(([, value]) => value !== 0);
  const attitudes = Object.entries(attitudeTable(draft.raceId))
    .sort(([, a], [, b]) => b - a);
  const notable = [...attitudes.slice(0, 2), ...attitudes.slice(-2)];
  const statLeft = statPointsLeft(draft);
  const skillLeft = skillPointsLeft(draft);

  return (
    <div className="flex flex-col">
      <div className="border-b border-oak-light px-4 py-3">
        <div className="flex items-start gap-3">
          <PortraitImage
            value={draft.portrait}
            alt={fullName(draft) === '' ? 'Chân dung nhân vật' : `Chân dung ${fullName(draft)}`}
            className="aspect-[4/5] w-20 shrink-0"
          />
          <div className="min-w-0 flex-1">
            <p className="text-[0.65rem] tracking-[0.2em] text-brass uppercase">Phiếu nhân vật</p>
            <p className="mt-1 truncate text-lg text-parchment">
              {fullName(draft) === '' ? '(chưa đặt tên)' : fullName(draft)}
            </p>
            <p className="text-xs text-vellum/50">
              {raceName(draft.raceId)} · {originName(draft.originId)} · {draft.sex === 'nam' ? 'nam' : 'nữ'}
            </p>
          </div>
        </div>
      </div>

      <Section title="Gốc gác">
        <Line label="Tuổi" value={`${draft.age} (${stage.name}, hiệu dụng ${effectiveAge(draft.raceId, draft.age)})`} />
        {ageBonus !== 0 && (
          <Line
            label="Tuổi cho điểm"
            value={`${ageBonus > 0 ? '+' : ''}${ageBonus} điểm kỹ năng`}
          />
        )}
        {ageShift.length > 0 && (
          <Line
            label="Tuổi dịch chỉ số"
            value={ageShift.map(([id, value]) => `${STATS[id as StatId].name} ${value > 0 ? '+' : ''}${value}`).join(', ')}
          />
        )}
        <Line label="Vùng sinh" value={draft.birthRegionId === '' ? '—' : regionName(draft.birthRegionId)} />
        <Line
          label="Khởi đầu ở"
          value={regionName(draft.startRegionId === '' ? draft.birthRegionId : draft.startRegionId)}
        />
        <Line
          label="Gia tộc"
          value={draft.houseId === '' ? draft.familyName === '' ? '—' : draft.familyName : houseName(draft.houseId)}
        />
        {draft.houseId !== '' && houseHeadName(draft.houseId) !== '' && (
          <Line label="Đứng đầu nhà" value={houseHeadName(draft.houseId)} />
        )}
        <Line
          label="Văn hóa"
          value={draft.cultureId === '' ? '—' : `${cultureName(draft.cultureId)} (${draft.culturalFit})`}
        />
        <Line
          label="Tôn giáo"
          value={
            draft.allegiance.religionId === ''
              ? '—'
              : `${religionName(draft.allegiance.religionId)} (${draft.allegiance.piety})`
          }
        />
      </Section>

      <Section title="Chỉ số">
        {statLeft !== 0 && (
          <p className="text-xs text-amber-300">
            {statLeft > 0 ? `còn ${statLeft} điểm chưa phân` : `tiêu quá ${-statLeft} điểm`}
          </p>
        )}
        {STAT_GROUPS.map((group) => (
          <div key={group.id} className="mt-1">
            <p className="text-[0.6rem] tracking-widest text-vellum/40 uppercase">{group.name}</p>
            <StatGroup draft={draft} group={group.id} />
          </div>
        ))}
      </Section>

      <Section title="Đặc tính bẩm sinh">
        {traits.length === 0 ? (
          <p className="text-xs text-vellum/40 italic">—</p>
        ) : (
          traits.map((id) => {
            const trait = traitOf(id);
            return (
              <p key={id} className="text-xs text-vellum/70">
                <span className="text-parchment">{trait?.name ?? id}</span>
                {trait !== null && <> — {trait.description}</>}
              </p>
            );
          })
        )}
      </Section>

      <Section title="Kỹ năng đã rèn">
        {skillLeft !== 0 && (
          <p className="text-xs text-amber-300">
            {skillLeft > 0 ? `còn ${skillLeft} điểm chưa phân` : `tiêu quá ${-skillLeft} điểm`}
          </p>
        )}
        {trained.length === 0 ? (
          <p className="text-xs text-vellum/40 italic">chưa rèn kỹ năng nào</p>
        ) : (
          trained
            .sort(([, a], [, b]) => b - a)
            .map(([skillId]) => (
              <Line key={skillId} label={skillName(skillId)} value={`${draftSkillPercent(draft, skillId)}%`} />
            ))
        )}
      </Section>

      <Section title="Ngoại hình">
        {draft.appearance === null ? (
          <p className="text-xs text-vellum/40 italic">chưa dựng</p>
        ) : (
          <>
            <Line label="Vóc" value={`${draft.appearance.heightCm} cm · ${draft.appearance.weightKg} kg · ${draft.appearance.build}`} />
            <Line label="Cơ / mỡ" value={`${draft.appearance.musclePct}% / ${draft.appearance.fatPct}%`} />
            <Line label="Tóc, mắt" value={`${draft.appearance.hair} · ${draft.appearance.eyes}`} />
            {draft.appearance.features.length > 0 && (
              <Line label="Đặc trưng" value={draft.appearance.features.join(', ')} />
            )}
          </>
        )}
      </Section>

      <Section title="Người thân">
        {draft.family.length === 0 ? (
          <p className="text-xs text-vellum/40 italic">chưa sinh gia tộc</p>
        ) : (
          <p className="text-xs text-vellum/70">
            {draft.family.filter((member) => member.alive).length} người còn sống trên tổng {draft.family.length}
          </p>
        )}
        {draft.outsideRelations.length > 0 && (
          <p className="text-xs text-vellum/50">{draft.outsideRelations.length} quan hệ ngoài gia đình</p>
        )}
      </Section>

      <Section title="Đang sở hữu">
        {draft.holdings.length === 0 && draft.fiefs.length === 0 && draft.property.length === 0 ? (
          <p className="text-xs text-vellum/40 italic">không giữ gì cả</p>
        ) : (
          <>
            {/* Ba tầng, ba dòng riêng — README mục 6 cấm gộp chúng lại. */}
            {draft.holdings.map((holding) => (
              <Line
                key={holding.id}
                label={settlementTierName(holding.tier)}
                value={`${holding.name} · ${holdingRoleName(holding.role)}`}
              />
            ))}
            {/* Tên mặc định không chứa cấp, nên nhãn `cấp` cộng giá trị `tên`
                đọc thành "Trấn chưa đặt tên" chứ không thành "Trấn Trấn…". */}
            {draft.fiefs.map((fief) => (
              <Line key={fief.id} label={fiefTitleName(fief.title)} value={fief.name} />
            ))}
            {draft.realmRole !== 'khong-co' && <Line label="Lãnh thổ" value={realmRoleName(draft.realmRole)} />}
            {draft.property.length > 0 && <Line label="Tài sản khác" value={draft.property.join(', ')} />}
          </>
        )}
      </Section>

      {/* Yêu sách để RIÊNG khỏi "đang sở hữu": một bên là thứ đòi, một bên là
          thứ giữ, và cả thế kỷ 15 nằm trong khoảng cách giữa hai vế đó. */}
      {draft.claims.length > 0 && (
        <Section title="Yêu sách">
          {draft.claims.map((claim) => (
            <Line
              key={claim.id}
              label={claim.targetName}
              value={`${claimStrengthName(claim.strength)} · qua ${claim.throughLabel}`}
            />
          ))}
        </Section>
      )}

      <Section title="Trang bị">
        {draft.gear.length === 0 ? (
          <p className="text-xs text-vellum/40 italic">không mang gì</p>
        ) : (
          <>
            <p className="text-xs text-vellum/70">
              {draft.gear
                .filter((entry) => entry.equipped)
                .map((entry) => gearName(entry.item))
                .join(', ')}
            </p>
            <Line label="Tổng nặng" value={`${gearWeight(draft.gear)} kg`} />
          </>
        )}
      </Section>

      <Section title="Thái độ các thế lực">
        {notable.map(([nationId, value]) => (
          <Line key={nationId} label={nationName(nationId)} value={`${value > 0 ? '+' : ''}${value} · ${attitudeLabel(value)}`} />
        ))}
      </Section>
    </div>
  );
}
