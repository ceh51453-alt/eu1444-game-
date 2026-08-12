/**
 * CHÍN BƯỚC TẠO NHÂN VẬT (Phần 6 mục 9) — phần thân của từng bước.
 *
 * Không bước nào giữ state riêng: tất cả đọc `draft` và gọi `onChange`. Đó là
 * điều kiện để "quay lui được" của mục 9 là thật — quay về bước 2 rồi tiến lại
 * phải thấy đúng thứ mình đã chọn, chứ không phải một bản sao đã trôi mất.
 */

import { useState, type ReactNode } from 'react';
import type { Rng } from '@/core/rng';
import { allRegions, regionName } from '@/lore/regions';
import { Button, Field, Select, TextInput } from '@/ui/settings/controls';
import { PortraitPicker } from '@/ui/portrait';
import { LoreEntryReader } from '@/ui/lore/LoreEntryReader';
// Bước 2 hiện luôn cái giá của tuổi tác ở Phần 8 mục 5: chọn một lão tướng là
// chọn luôn việc học chậm hẳn lại, và người chơi phải biết điều đó lúc kéo thanh
// tuổi chứ không phải sau ba mươi lượt chơi.
import { ageFactor } from '@/systems/skills';
import {
  ladderForNation,
  ladderOf,
  panelFor,
  startingLegitimacy,
  successionLawOf,
  titleOf,
  titlesOfLadder,
} from '@/systems/titles';
import { HousePicker } from './HousePicker';
import {
  CREATION_STEPS,
  FAMILY_RELATION_LABELS,
  STATS,
  STAT_GROUPS,
  STAT_IDS,
  allBirthOrders,
  allLineageStates,
  allOrigins,
  ageSkillPoints,
  ageStages,
  ageStatShift,
  allHouses,
  creationAgeRange,
  draftAgeStage,
  effectiveAge,
  learnFactor,
  withAge,
  alliesOf,
  attitudeLabel,
  carry,
  claimStrengths,
  emptyStatBlock,
  houseHasLoreHead,
  houseHeadName,
  houseName,
  houseOf,
  houseRankName,
  housesForOriginAndRace,
  knownSettlements,
  lorePeople,
  recomputeClaims,
  relatedHouses,
  rivalsOf,
  setFamilyHouse,
  withHouse,
  canLowerStat,
  canRaiseSkill,
  canRaiseStat,
  cultureOf,
  culturesForRace,
  draftSkillPercent,
  fiefIdFor,
  fiefObligations,
  finalStats,
  fullName,
  gearKinds,
  gearMaterials,
  gearName,
  gearOf,
  gearOfKind,
  gearPrice,
  gearQualities,
  gearSlots,
  gearWeight,
  generateSecrets,
  holdingIdFor,
  holdingRoleOf,
  holdingRoles,
  lowerSkill,
  lowerStat,
  nationIds,
  nationName,
  obligationOf,
  originOf,
  playableRaces,
  pointBuy,
  raceAttitudeTo,
  raceGroups,
  raceName,
  raceOf,
  raiseSkill,
  raiseStat,
  randomFamilyName,
  randomGivenName,
  randomScar,
  realmRoles,
  realmRoleOf,
  relationKinds,
  religionOf,
  religionsForRace,
  rollAppearance,
  rollFamily,
  rollNames,
  scaleIntensity,
  settlementTiers,
  settlementTierOf,
  settlementsWithin,
  UNNAMED,
  skillGroups,
  skillPointBudget,
  skillPointsLeft,
  skillsAffectedBy,
  skillsInGroup,
  startAgeRange,
  startingLine,
  statCapOf,
  statModsOf,
  statPointsLeft,
  statsIn,
  traitOf,
  traitsOf,
  withOrigin,
  withRace,
  type CarriedGear,
  type CharacterDraft,
  type CreationStepId,
  type DraftFief,
  type DraftHolding,
  type Effect,
  type FamilyMember,
  type StatId,
} from '@/systems/character';

export interface StepProps {
  draft: CharacterDraft;
  onChange: (draft: CharacterDraft) => void;
  rng: Rng;
}

function Card({ title, children }: { title: string; children: ReactNode }): ReactNode {
  return (
    <section className="flex flex-col gap-2 rounded border border-oak-light bg-oak/40 p-3">
      <h3 className="text-[0.65rem] font-semibold tracking-[0.2em] text-brass uppercase">{title}</h3>
      {children}
    </section>
  );
}

/** Vai trò trong một thế lực. Phần 13 (chư hầu) và Phần 14 (phe phái) sở hữu bản thật. */
const NATION_STANDINGS: readonly { id: string; name: string }[] = [
  { id: 'than-dan', name: 'Thần dân thường' },
  { id: 'chu-hau', name: 'Chư hầu có thề' },
  { id: 'quan-lai', name: 'Quan lại ăn lương' },
  { id: 'tang-lu', name: 'Người của giáo hội' },
  { id: 'linh-danh-thue', name: 'Lính đánh thuê, không thề với ai' },
  { id: 'khach-tru', name: 'Ngoại kiều cư trú' },
  { id: 'luu-vong', name: 'Lưu vong khỏi thế lực này' },
  { id: 'ngoai-vong', name: 'Ngoài vòng pháp luật' },
];

/**
 * Bảng xem trước hiệu ứng của một danh tính, ĐÃ nhân cường độ.
 *
 * Mục 9 đòi người chơi thấy hệ quả ngay lúc chọn. Với tôn giáo và văn hóa thì
 * điều đó quan trọng hơn ở chỗ khác: kéo thanh sùng đạo lên là vừa được nhiều
 * hơn vừa bị trói nhiều hơn, và nếu không hiện cả hai vế thì người chơi sẽ mặc
 * định kéo hết cỡ.
 */
function BeliefCard({
  title,
  effects,
  intensity,
  description,
  taboos,
}: {
  title: string;
  effects: readonly Effect[];
  intensity: number;
  description: string;
  taboos: readonly string[];
}): ReactNode {
  if (effects.length === 0) {
    return (
      <Card title={title}>
        <p className="text-xs text-vellum/40 italic">Không chọn gì — không tác động gì.</p>
      </Card>
    );
  }

  return (
    <Card title={title}>
      {description !== '' && <p className="text-xs text-vellum/60 italic">{description}</p>}
      <div className="flex flex-col gap-0.5">
        {effects.map((effect, index) => {
          const value = scaleIntensity(effect.value, intensity);
          if (value === 0) return null;
          return (
            <div key={index} className="flex items-baseline gap-2 text-xs">
              <span className={`w-12 shrink-0 text-right font-mono ${value > 0 ? 'text-brass' : 'text-red-300'}`}>
                {value > 0 ? `+${value}` : value}
              </span>
              <span className="flex-1 truncate text-vellum/60">
                {effect.domains.join(', ')}
                {effect.whenAnyTag.length > 0 && ` — chỉ khi ${effect.whenAnyTag.join(' / ')}`}
              </span>
            </div>
          );
        })}
      </div>
      {taboos.length > 0 && <p className="text-xs text-amber-300/80">Điều cấm: {taboos.join(' · ')}</p>}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// 1 — Chủng tộc
// ---------------------------------------------------------------------------

function RaceStep({ draft, onChange }: StepProps): ReactNode {
  const races = playableRaces();
  const chosen = raceOf(draft.raceId);
  const mods = statModsOf(draft.raceId);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-vellum/50">
        Tổng mod chỉ số của MỌI tộc đều bằng 0. Chỗ khác nhau nằm ở phân bổ, ở trần chỉ số và ở
        đặc tính bẩm sinh — không tộc nào mạnh hơn tộc nào một cách trần trụi.
      </p>

      <div className="max-h-72 overflow-y-auto rounded border border-oak-light">
        {raceGroups().map((group) => {
          const inGroup = races.filter((race) => race.group === group.id);
          if (inGroup.length === 0) return null;
          return (
            <div key={group.id}>
              <p className="sticky top-0 bg-oak px-2 py-1 text-[0.6rem] tracking-widest text-brass uppercase">
                {group.name}
              </p>
              {inGroup.map((race) => (
                <button
                  key={race.id}
                  type="button"
                  onClick={() => onChange(withRace(draft, race.id))}
                  className={`flex w-full flex-col gap-0.5 px-2 py-1.5 text-left text-sm hover:bg-oak-light sm:flex-row sm:items-baseline sm:gap-2 ${
                    race.id === draft.raceId ? 'bg-oak-light text-brass' : 'text-vellum'
                  }`}
                >
                  {/* `sm:contents` để hàng này tan ra thành ba ô cùng cấp trên màn
                      rộng, còn trên điện thoại thì tên và viết tắt đứng chung một
                      dòng, vị thế xã hội xuống dòng dưới — ba cột cố định 224px
                      không nhét vừa 375px. */}
                  <span className="flex items-baseline gap-2 sm:contents">
                    <span className="min-w-0 flex-1 truncate sm:w-32 sm:flex-none sm:shrink-0">{race.name}</span>
                    {/* Viết tắt ba chữ cái của mục 2 (STR, ELO…) chứ không cắt tên
                        tiếng Việt: cắt "Hùng biện" còn ba ký tự ra "Hùn". */}
                    <span
                      className="shrink-0 font-mono text-xs text-vellum/50 sm:w-24"
                      title={Object.entries(race.stats)
                        .filter(([, value]) => value > 0)
                        .map(([id]) => STATS[id as StatId].name)
                        .join(', ')}
                    >
                      {Object.entries(race.stats)
                        .filter(([, value]) => value > 0)
                        .map(([id]) => id.toUpperCase())
                        .join(' ')}
                    </span>
                  </span>
                  <span className="truncate text-xs text-vellum/40">{race.standing}</span>
                </button>
              ))}
            </div>
          );
        })}
      </div>

      {chosen !== null && (
        <>
          <Card title={`${chosen.name} — mod chỉ số`}>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm sm:grid-cols-4">
              {Object.entries(mods)
                .filter(([, value]) => value !== 0)
                .map(([id, value]) => (
                  <span key={id} className={value > 0 ? 'text-brass' : 'text-red-300'}>
                    {STATS[id as StatId].name} {value > 0 ? `+${value}` : value}
                  </span>
                ))}
            </div>
            <p className="text-xs text-vellum/50">
              Tuổi thọ: {chosen.lifespan === null ? 'không già đi' : `${chosen.lifespan} năm`} · Quan hệ Giáo hội:{' '}
              {chosen.church} · Ngôn ngữ: {chosen.language}
            </p>
            {Object.entries(chosen.statCaps).length > 0 && (
              <p className="text-xs text-amber-300">
                Trần thấp hơn thường:{' '}
                {Object.entries(chosen.statCaps)
                  .map(([id, cap]) => `${STATS[id as StatId].name} ${cap}`)
                  .join(' · ')}
              </p>
            )}
          </Card>

          <Card title="Đặc tính bẩm sinh">
            {traitsOf(chosen.id).map((id) => {
              const trait = traitOf(id);
              return (
                <p key={id} className="text-xs text-vellum/70">
                  <span className="text-parchment">{trait?.name ?? id}</span> — {trait?.description ?? ''}
                </p>
              );
            })}
          </Card>

          <Card title="Có mặt ở đâu">
            <p className="text-xs text-vellum/60">{chosen.spreadNote}</p>
            <div className="flex flex-wrap gap-1">
              {chosen.spread.map((entry) => (
                <span key={entry.nation} className="rounded border border-oak-light px-1.5 py-0.5 text-[0.65rem] text-vellum/70">
                  {nationName(entry.nation)} · {entry.role}
                </span>
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 2 — Xuất thân · khung TUỔI
// ---------------------------------------------------------------------------

/**
 * TUỔI, và ba thứ nó kéo theo — hiện ngay tại chỗ chọn.
 *
 * Tuổi là một trong số ít lựa chọn ở bước 2 tác động thẳng vào con số, nên nó
 * KHÔNG được là một ô nhập trống trơn giữa mấy ô địa danh. Người chơi kéo thanh
 * này phải thấy ngay cả ba vế:
 *
 *   · điểm kỹ năng      người lớn tuổi đã sống nhiều hơn, và được nhiều điểm hơn
 *   · chỉ số            giai đoạn tuổi dịch chỉ số (nguồn `character.tuoi-tac`)
 *   · tốc độ học        cái giá phải trả — Phần 8 mục 5, càng già học càng chậm
 *
 * Ba vế đó là một cái đánh đổi có thật: một lão tướng vào ván với nhiều nghề hơn
 * hẳn nhưng gần như không học thêm được gì nữa, còn một thiếu niên vào ván tay
 * trắng và cả một đời để tiến. Không hiện ra thì người chơi chỉ thấy một con số
 * và sẽ luôn chọn con số lớn nhất.
 */
function AgeCard({ draft, onChange }: { draft: CharacterDraft; onChange: (draft: CharacterDraft) => void }): ReactNode {
  const [low, high] = creationAgeRange(draft.raceId);
  const [suggestLow, suggestHigh] = startAgeRange(draft.raceId);
  const stage = draftAgeStage(draft);
  const bonus = ageSkillPoints(draft);
  const effective = effectiveAge(draft.raceId, draft.age);
  const shift = ageStatShift(draft.raceId, draft.age);
  const shifts = Object.entries(shift).filter(([, value]) => value !== 0);
  const learn = ageFactor(effective);
  const race = learnFactor(draft.raceId);

  return (
    <Card title="Tuổi">
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={low}
          max={high}
          value={draft.age}
          onChange={(event) => onChange(withAge(draft, Number(event.target.value)))}
          className="h-1 min-w-0 flex-1 cursor-pointer appearance-none rounded bg-oak-light accent-brass"
          aria-label="Tuổi"
        />
        <TextInput
          type="number"
          min={low}
          max={high}
          value={draft.age}
          onChange={(event) => onChange(withAge(draft, Number(event.target.value) || low))}
          className="w-16 shrink-0 sm:w-20"
        />
        <span className="w-20 shrink-0 truncate text-xs text-vellum/50 sm:w-28">{stage.name}</span>
      </div>

      <p className="text-[0.68rem] text-vellum/40">
        Chọn được {low}–{high} · tuổi vào đời thường thấy của tộc này là {suggestLow}–{suggestHigh}
        {draft.age !== effective && ` · quy về thang người thường: ${effective} tuổi`}
      </p>

      <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-3">
        <div className="rounded border border-oak-light px-2 py-1">
          <p className="text-[0.6rem] tracking-widest text-vellum/40 uppercase">Điểm kỹ năng</p>
          <p className={bonus > 0 ? 'text-emerald-300' : bonus < 0 ? 'text-red-300' : 'text-vellum/60'}>
            {bonus > 0 ? `+${bonus}` : bonus === 0 ? 'không đổi' : bonus} điểm
          </p>
          <p className="text-[0.6rem] text-vellum/40">năm tháng đã sống</p>
        </div>

        <div className="rounded border border-oak-light px-2 py-1">
          <p className="text-[0.6rem] tracking-widest text-vellum/40 uppercase">Chỉ số</p>
          {shifts.length === 0 ? (
            <p className="text-vellum/60">không dịch</p>
          ) : (
            <p className="text-vellum/70">
              {shifts
                .map(([id, value]) => `${STATS[id as StatId].name} ${value > 0 ? '+' : ''}${value}`)
                .join(', ')}
            </p>
          )}
          <p className="text-[0.6rem] text-vellum/40">hiện thành một dòng riêng lúc kiểm định</p>
        </div>

        <div className="rounded border border-oak-light px-2 py-1">
          <p className="text-[0.6rem] tracking-widest text-vellum/40 uppercase">Tốc độ học</p>
          <p className={learn.factor > 1 ? 'text-amber-300' : 'text-emerald-300'}>
            ×{Math.round(learn.factor * race * 100) / 100}
          </p>
          <p className="text-[0.6rem] text-vellum/40">
            {learn.label}
            {race !== 1 && ` · chủng tộc ×${race}`}
          </p>
        </div>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// 2 — Xuất thân
// ---------------------------------------------------------------------------

function OriginStep({ draft, onChange }: StepProps): ReactNode {
  const origin = originOf(draft.originId);
  const race = raceOf(draft.raceId);
  const line = startingLine(draft.originId, draft.birthOrderId, draft.lineageStateId);
  const homelandIds = race?.homelands ?? [];
  const homelands = homelandIds.length > 0 ? homelandIds : allRegions().map((region) => region.id);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-vellum/50">
        Xuất thân CHỈ quyết định vạch xuất phát. Nó không khóa trần tước vị — một nông nô về lý
        thuyết vẫn lên tới hoàng đế được.
      </p>

      <div className="max-h-60 overflow-y-auto rounded border border-oak-light">
        {allOrigins().map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => onChange(withOrigin(draft, entry.id))}
            className={`flex w-full flex-col gap-0.5 px-2 py-1.5 text-left text-sm hover:bg-oak-light sm:flex-row sm:items-baseline sm:gap-2 ${
              entry.id === draft.originId ? 'bg-oak-light text-brass' : 'text-vellum'
            }`}
          >
            <span className="flex items-baseline gap-2 sm:contents">
              <span className="min-w-0 flex-1 truncate sm:w-32 sm:flex-none sm:shrink-0">{entry.name}</span>
              <span className="shrink-0 font-mono text-xs text-vellum/50 sm:w-40">
                chỉ số +{entry.statPoints} · kỹ năng +{entry.skillPoints}
              </span>
            </span>
            <span className="truncate text-xs text-vellum/40">{entry.assetNote}</span>
          </button>
        ))}
      </div>

      {origin !== null && <p className="text-xs text-vellum/60 italic">{origin.description}</p>}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Vùng sinh" hint={homelandIds.length > 0 ? 'vùng bản địa của chủng tộc' : 'chủng tộc chưa khai vùng bản địa'}>
          <Select value={draft.birthRegionId} onChange={(event) => onChange({ ...draft, birthRegionId: event.target.value })}>
            <option value="">—</option>
            {homelands.map((id) => (
              <option key={id} value={id}>
                {regionName(id)}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Nơi khởi đầu"
          hint="lệch với nơi sinh là chuyện thường — lưu vong, hành hương, bị bán, đi lính"
        >
          <Select value={draft.startRegionId} onChange={(event) => onChange({ ...draft, startRegionId: event.target.value })}>
            <option value="">— cùng nơi sinh —</option>
            {allRegions()
              .filter((region) => region.kind !== 'settlement')
              .map((region) => (
                <option key={region.id} value={region.id}>
                  {region.name}
                </option>
              ))}
          </Select>
        </Field>

        {/*
          Hai ô này chạy lại `withOrigin` chứ không gán thẳng: thừa kế quyết
          định có thành trì và thái ấp hay không, còn tình trạng gia tộc quyết
          định còn lại bao nhiêu tài sản. Gán thẳng thì người chơi đổi sang
          "con cả" mà tay vẫn trắng, và chỉ phát hiện ra ở bước 8.
        */}
        <Field label="Thứ tự trong nhà" hint="đổi ô này sẽ dựng lại trang bị và phần thừa kế ở bước 8">
          <Select
            value={draft.birthOrderId}
            onChange={(event) => onChange(withOrigin({ ...draft, birthOrderId: event.target.value }, draft.originId))}
          >
            {allBirthOrders().map((order) => (
              <option key={order.id} value={order.id}>
                {order.name} — {order.inherits ? 'có thừa kế' : 'không thừa kế'}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Tình trạng gia tộc">
          <Select
            value={draft.lineageStateId}
            onChange={(event) => onChange(withOrigin({ ...draft, lineageStateId: event.target.value }, draft.originId))}
          >
            {allLineageStates().map((state) => (
              <option key={state.id} value={state.id}>
                {state.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <AgeCard draft={draft} onChange={onChange} />

      <HouseCard draft={draft} onChange={onChange} />

      <Card title="Vạch xuất phát">
        <div className="grid grid-cols-1 gap-x-4 gap-y-1 text-sm text-vellum/70 sm:grid-cols-2">
          <span>Tiền: {line.coins} đồng bạc</span>
          <span>Uy tín: {line.prestige}</span>
          <span>Quan hệ: {line.relationSlots}</span>
          <span>{line.inherits ? 'Có quyền thừa kế' : 'Không thừa kế — phải tự lập'}</span>
        </div>
        <p className="text-xs text-vellum/50">
          Tài sản: {draft.property.length === 0 ? 'không có gì' : draft.property.join(', ')}
        </p>
        {!line.inherits && (origin?.holdings.length ?? 0) > 0 && (
          <p className="text-xs text-amber-300">
            Không thừa kế: thành trì và thái ấp của nhà ở lại với người thừa kế. Ngài vẫn mang được
            trang bị đi.
          </p>
        )}
      </Card>
    </div>
  );
}

/**
 * GIA TỘC — dây nối nhân vật vào thế giới đã có.
 *
 * Chọn ở đây là chọn luôn họ, thành trì gốc, lãnh thổ nhà đang cai trị, và yêu
 * sách. Người đứng đầu hiện tại là một nhân vật CÓ THẬT trong lorebook, nên AI
 * đã có hồ sơ của họ và sẽ kể nhất quán với mọi chỗ khác trong thế giới.
 */
function HouseCard({ draft, onChange }: { draft: CharacterDraft; onChange: (draft: CharacterDraft) => void }): ReactNode {
  const available = housesForOriginAndRace(draft.originId, draft.raceId);
  if (available.length === 0) {
    return (
      <Card title="Gia tộc">
        <p className="text-xs text-vellum/40 italic">
          Giai tầng này không có gia tộc để chọn. Ngài vẫn có gia đình và có họ — chỉ là cái họ đó
          không mở được cánh cửa nào.
        </p>
      </Card>
    );
  }

  const chosen = houseOf(draft.houseId);
  const related = relatedHouses(draft.houseId);

  return (
    <Card title="Gia tộc">
      <HousePicker
        houses={available}
        value={draft.houseId}
        emptyLabel="— không thuộc gia tộc có tên tuổi nào —"
        onChange={(houseId) => onChange(withHouse(draft, houseId))}
      />

      {chosen !== null && (
        <>
          <p className="text-xs text-vellum/60 italic">{chosen.note}</p>
          <div className="grid grid-cols-1 gap-x-4 gap-y-0.5 text-xs text-vellum/60 sm:grid-cols-2">
            <span>Bậc tước: {houseRankName(chosen.id)}</span>
            <span>Tình trạng: {chosen.status}</span>
            {chosen.realm !== '' && <span>Cai trị: {regionName(chosen.realm)}</span>}
            {chosen.seat !== '' && <span>Thành trì gốc: {regionName(chosen.seat)}</span>}
          </div>

          <p className="text-xs text-brass">
            Người đứng đầu hiện tại: {houseHeadName(chosen.id)}
            {houseHasLoreHead(chosen.id) ? ' — nhân vật có thật trong lorebook.' : '.'}
          </p>

          {chosen.claims.length > 0 && (
            <p className="text-xs text-amber-300">Nhà này đang đòi: {chosen.claims.map(regionName).join(', ')}</p>
          )}

          {/* Đối địch và liên minh là chỗ gia tộc thôi là một cái tên và thành
              một vị trí trên bàn cờ. Phần 13/14 dùng tiếp cho chính trị thật. */}
          {rivalsOf(chosen.id).length > 0 && (
            <p className="text-xs text-red-300">
              Đối địch: {rivalsOf(chosen.id).map((house) => house.name).join(', ')}
            </p>
          )}
          {alliesOf(chosen.id).length > 0 && (
            <p className="text-xs text-vellum/60">
              Liên minh: {alliesOf(chosen.id).map((house) => house.name).join(', ')}
            </p>
          )}
          {(related.parent !== null || related.cadets.length > 0) && (
            <p className="text-xs text-vellum/50">
              {related.parent !== null && `Nhánh thứ của ${related.parent.name}. `}
              {related.cadets.length > 0 && `Nhánh thứ: ${related.cadets.map((house) => house.name).join(', ')}.`}
            </p>
          )}
        </>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// 3 — Chỉ số
// ---------------------------------------------------------------------------

function StatsStep({ draft, onChange }: StepProps): ReactNode {
  const left = statPointsLeft(draft);
  const final = finalStats(draft);
  const mods = statModsOf(draft.raceId);
  const config = pointBuy();

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between">
        <p className={`text-sm ${left === 0 ? 'text-vellum/60' : left > 0 ? 'text-brass' : 'text-red-300'}`}>
          Còn {left} điểm chỉ số
        </p>
        <p className="text-xs text-vellum/40">
          giá lũy tiến · trần lúc tạo {config.maxAtCreation} · sàn {config.minAtCreation}
        </p>
      </div>

      {STAT_GROUPS.map((group) => (
        <Card key={group.id} title={group.name}>
          {statsIn(group.id).map((id) => {
            const cap = statCapOf(draft.raceId, id);
            // Mục 9 bước 3 đòi hiện "kỹ năng bị ảnh hưởng" ngay lúc phân điểm:
            // không có nó thì người chơi đang đẩy một con số mà không biết nó
            // đổi cái gì, và sẽ chỉ phát hiện ra sau vài giờ chơi.
            const affected = skillsAffectedBy(id);
            return (
              // Trên điện thoại hàng này gãy làm hai: nút bấm ở trên, dòng chú
              // giải ở dưới. Sáu ô cố định trên một dòng 375px thì ô nào cũng
              // rách, kể cả nút − và +.
              <div key={id} className="flex flex-col gap-1 text-sm sm:flex-row sm:items-center sm:gap-2">
                <span className="flex items-center gap-2 sm:contents">
                  <span className="min-w-0 flex-1 truncate text-vellum/70 sm:w-24 sm:flex-none sm:shrink-0" title={STATS[id].covers}>
                    {STATS[id].name}
                  </span>
                  <Button disabled={!canLowerStat(draft, id)} onClick={() => onChange(lowerStat(draft, id))}>
                    −
                  </Button>
                  <span className="w-8 shrink-0 text-center font-mono text-parchment">{draft.allocated[id]}</span>
                  <Button disabled={!canRaiseStat(draft, id)} onClick={() => onChange(raiseStat(draft, id))}>
                    +
                  </Button>
                  <span className="w-16 shrink-0 font-mono text-xs text-vellum/50">
                    {mods[id] === 0 ? '' : mods[id] > 0 ? `+${mods[id]}` : mods[id]} → {final[id]}
                  </span>
                </span>
                <span
                  className="truncate text-xs text-vellum/40 sm:flex-1"
                  title={affected.map((row) => row.name).join(', ')}
                >
                  trần {cap} · {affected.length} kỹ năng: {affected.slice(0, 3).map((row) => row.name).join(', ')}
                  {affected.length > 3 ? '…' : ''}
                </span>
              </div>
            );
          })}
        </Card>
      ))}

      <Card title="Giai đoạn tuổi của chủng tộc">
        <div className="flex flex-wrap gap-1 text-[0.65rem] text-vellum/50">
          {ageStages().map((stage) => (
            <span key={stage.id} className="rounded border border-oak-light px-1.5 py-0.5">
              {stage.name}
            </span>
          ))}
        </div>
        <p className="text-xs text-vellum/40">
          Giai đoạn khai theo tỉ lệ tuổi thọ, nên tộc sống 600 năm và tộc sống 55 năm dùng chung một bảng.
        </p>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 4 — Ngoại hình
// ---------------------------------------------------------------------------

function AppearanceStep({ draft, onChange, rng }: StepProps): ReactNode {
  const appearance = draft.appearance;

  return (
    <div className="flex flex-col gap-3">
      <Card title="Ảnh chân dung">
        <PortraitPicker
          value={draft.portrait}
          alt={fullName(draft) === '' ? 'Chân dung nhân vật' : `Chân dung ${fullName(draft)}`}
          onChange={(portrait) => onChange({ ...draft, portrait })}
        />
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" onClick={() => onChange(rollAppearance(draft, rng))}>
          Ngẫu nhiên theo chủng tộc
        </Button>
        <Select
          className="w-32 shrink-0"
          value={draft.sex}
          onChange={(event) => onChange({ ...draft, sex: event.target.value === 'nu' ? 'nu' : 'nam' })}
        >
          <option value="nam">Nam</option>
          <option value="nu">Nữ</option>
        </Select>
        <span className="text-xs text-vellum/40">dùng seeded RNG, không phải Math.random</span>
      </div>

      {appearance === null ? (
        <p className="text-sm text-vellum/50 italic">Chưa dựng ngoại hình. Bấm nút trên, rồi sửa tay thứ nào muốn đổi.</p>
      ) : (
        <>
          {/* Mười lăm ô ngắn: xếp một cột trên điện thoại là cuộn mãi không hết,
              nên hai cột — nhãn vẫn đủ chỗ ở 150px mỗi cột. */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <Field label="Chiều cao (cm)">
              <TextInput
                type="number"
                value={appearance.heightCm}
                onChange={(event) =>
                  onChange({ ...draft, appearance: { ...appearance, heightCm: Number(event.target.value) || 0 } })
                }
              />
            </Field>
            <Field label="Cân nặng (kg)">
              <TextInput
                type="number"
                value={appearance.weightKg}
                onChange={(event) =>
                  onChange({ ...draft, appearance: { ...appearance, weightKg: Number(event.target.value) || 0 } })
                }
              />
            </Field>
            <Field label="Dáng người">
              <TextInput
                value={appearance.build}
                onChange={(event) => onChange({ ...draft, appearance: { ...appearance, build: event.target.value } })}
              />
            </Field>
            <Field label="Tỉ lệ cơ (%)" hint="Phần 7 dùng thẳng">
              <TextInput
                type="number"
                value={appearance.musclePct}
                onChange={(event) =>
                  onChange({ ...draft, appearance: { ...appearance, musclePct: Number(event.target.value) || 0 } })
                }
              />
            </Field>
            <Field label="Tỉ lệ mỡ (%)" hint="cơ + mỡ ≤ 100">
              <TextInput
                type="number"
                value={appearance.fatPct}
                onChange={(event) =>
                  onChange({ ...draft, appearance: { ...appearance, fatPct: Number(event.target.value) || 0 } })
                }
              />
            </Field>
            <Field label="Màu da">
              <TextInput
                value={appearance.skin}
                onChange={(event) => onChange({ ...draft, appearance: { ...appearance, skin: event.target.value } })}
              />
            </Field>
            <Field label="Màu tóc">
              <TextInput
                value={appearance.hair}
                onChange={(event) => onChange({ ...draft, appearance: { ...appearance, hair: event.target.value } })}
              />
            </Field>
            <Field label="Kiểu tóc">
              <TextInput
                value={appearance.hairStyle}
                onChange={(event) => onChange({ ...draft, appearance: { ...appearance, hairStyle: event.target.value } })}
              />
            </Field>
            <Field label="Râu">
              <TextInput
                value={appearance.beard}
                onChange={(event) => onChange({ ...draft, appearance: { ...appearance, beard: event.target.value } })}
              />
            </Field>
            <Field label="Màu mắt">
              <TextInput
                value={appearance.eyes}
                onChange={(event) => onChange({ ...draft, appearance: { ...appearance, eyes: event.target.value } })}
              />
            </Field>
            <Field label="Hình dạng mắt">
              <TextInput
                value={appearance.eyeShape}
                onChange={(event) => onChange({ ...draft, appearance: { ...appearance, eyeShape: event.target.value } })}
              />
            </Field>
            <Field label="Nét mặt">
              <TextInput
                value={appearance.face}
                onChange={(event) => onChange({ ...draft, appearance: { ...appearance, face: event.target.value } })}
              />
            </Field>
            <Field label="Giọng nói">
              <TextInput
                value={appearance.voice}
                onChange={(event) => onChange({ ...draft, appearance: { ...appearance, voice: event.target.value } })}
              />
            </Field>
            <Field label="Dáng đi">
              <TextInput
                value={appearance.gait}
                onChange={(event) => onChange({ ...draft, appearance: { ...appearance, gait: event.target.value } })}
              />
            </Field>
            <Field label="Thói quen cử chỉ">
              <TextInput
                value={appearance.mannerism}
                onChange={(event) => onChange({ ...draft, appearance: { ...appearance, mannerism: event.target.value } })}
              />
            </Field>
          </div>

          <Field label="Quần áo và trang sức khởi đầu">
            <TextInput value={draft.clothing} onChange={(event) => onChange({ ...draft, clothing: event.target.value })} />
          </Field>

          <Card title="Đặc trưng chủng tộc">
            <p className="text-sm text-vellum/70">
              {appearance.features.length === 0 ? '—' : appearance.features.join(' · ')}
            </p>
            <p className="text-xs text-vellum/40">Dấu riêng: {appearance.mark}</p>
          </Card>

          <Card title="Sẹo có sẵn">
            <div className="flex flex-col gap-1">
              {appearance.scars.map((scar, index) => (
                <div key={`${scar.site}-${index}`} className="flex items-center gap-2 text-sm text-vellum/70">
                  <span className="flex-1">
                    {scar.cause} ở {scar.site}
                  </span>
                  <Button
                    variant="danger"
                    onClick={() =>
                      onChange({
                        ...draft,
                        appearance: { ...appearance, scars: appearance.scars.filter((_, i) => i !== index) },
                      })
                    }
                  >
                    Bỏ
                  </Button>
                </div>
              ))}
            </div>
            <Button
              onClick={() =>
                onChange({ ...draft, appearance: { ...appearance, scars: [...appearance.scars, randomScar(rng)] } })
              }
            >
              Thêm một vết sẹo
            </Button>
            <p className="text-xs text-vellum/40">
              Phần 7 ghi tiếp vào đây khi thương tích liền lại — nên `appearance.scars` là quyền `engine`, khác phần
              còn lại của ngoại hình.
            </p>
          </Card>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 5 — Kỹ năng
// ---------------------------------------------------------------------------

function SkillsStep({ draft, onChange }: StepProps): ReactNode {
  const left = skillPointsLeft(draft);
  const favoured = new Set(originOf(draft.originId)?.favouredSkills ?? []);
  const config = pointBuy();
  const fromOrigin = originOf(draft.originId)?.skillPoints ?? 0;
  const fromAge = ageSkillPoints(draft);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between">
        <p className={`text-sm ${left === 0 ? 'text-vellum/60' : left > 0 ? 'text-brass' : 'text-red-300'}`}>
          Còn {left} điểm kỹ năng
        </p>
        <p className="text-xs text-vellum/40">
          1 điểm = +{config.skillTrainingPerPoint} rèn luyện · trần lúc tạo {config.skillMaxAtCreation}
        </p>
      </div>

      {/* Ngân sách hiện thành hai vế riêng: người chơi phải thấy mấy điểm này
          đến từ TUỔI, vì đó là thứ họ đổi được ở bước 2 — và đổi lại bằng tốc độ
          học của Phần 8. */}
      <p className="text-xs text-vellum/40">
        Ngân sách: {fromOrigin} từ giai tầng
        {fromAge !== 0 && (
          <span className={fromAge > 0 ? ' text-emerald-300' : ' text-red-300'}>
            {' '}
            {fromAge > 0 ? '+' : '−'}
            {Math.abs(fromAge)} vì tuổi {draft.age} ({draftAgeStage(draft).name})
          </span>
        )}
        {' '}= {skillPointBudget(draft)} điểm
      </p>

      {skillGroups().map((group) => (
        <Card key={group.id} title={group.name}>
          {skillsInGroup(group.id).map((skill) => {
            const training = draft.skills[skill.id] ?? 0;
            return (
              // Cùng cách gãy hàng với bước 3. Thẻ hệ thống (`skill.system`) là
              // thứ duy nhất bị giấu hẳn trên điện thoại: nó là nhãn kỹ thuật,
              // còn chỉ số gốc ở cuối hàng mới là thứ người chơi cần cân nhắc.
              <div key={skill.id} className="flex flex-col gap-1 text-sm sm:flex-row sm:items-center sm:gap-2">
                <span className="flex items-center gap-2 sm:contents">
                  <span
                    className={`min-w-0 flex-1 truncate sm:w-40 sm:flex-none sm:shrink-0 ${favoured.has(skill.id) ? 'text-brass' : 'text-vellum/70'}`}
                    title={skill.description}
                  >
                    {skill.name}
                  </span>
                  <span className="hidden w-10 shrink-0 font-mono text-[0.65rem] text-vellum/40 sm:inline">
                    {skill.system}
                  </span>
                  <Button disabled={training === 0} onClick={() => onChange(lowerSkill(draft, skill.id))}>
                    −
                  </Button>
                  <span className="w-8 shrink-0 text-center font-mono text-parchment">{training}</span>
                  <Button disabled={!canRaiseSkill(draft, skill.id)} onClick={() => onChange(raiseSkill(draft, skill.id))}>
                    +
                  </Button>
                  <span className="w-14 shrink-0 text-right font-mono text-xs text-vellum/50 sm:w-20 sm:text-left">
                    {draftSkillPercent(draft, skill.id)}%
                  </span>
                </span>
                <span className="truncate text-xs text-vellum/40 sm:flex-1">{STATS[skill.stat].name}</span>
              </div>
            );
          })}
        </Card>
      ))}
      <p className="text-xs text-vellum/40">
        Chữ vàng là kỹ năng hợp với giai tầng — gợi ý thôi, không khóa gì cả. Cây kỹ năng và nhánh
        chuyên sâu là Phần 8.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 6 — Gia đình
// ---------------------------------------------------------------------------

function FamilyMemberRow({
  member,
  raceId,
  onPatch,
  onHouse,
  onRemove,
}: {
  member: FamilyMember;
  raceId: string;
  onPatch: (patch: Partial<FamilyMember>) => void;
  /** Đổi gia tộc đi đường riêng vì nó phải tính lại toàn bộ bảng yêu sách. */
  onHouse: (houseId: string) => void;
  onRemove: () => void;
}): ReactNode {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded border border-oak-light bg-oak/40 p-2">
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <Select
          className="w-24"
          value={member.relation}
          onChange={(event) => onPatch({ relation: event.target.value })}
        >
          {Object.entries(FAMILY_RELATION_LABELS).map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </Select>
        <TextInput className="max-w-48" value={member.name} onChange={(event) => onPatch({ name: event.target.value })} />
        <Select className="w-20" value={member.sex} onChange={(event) => onPatch({ sex: event.target.value === 'nu' ? 'nu' : 'nam' })}>
          <option value="nam">nam</option>
          <option value="nu">nữ</option>
        </Select>
        <TextInput
          className="w-20"
          type="number"
          value={member.age}
          onChange={(event) => onPatch({ age: Math.max(0, Number(event.target.value) || 0) })}
        />
        <label className="flex items-center gap-1 text-vellum/60">
          <input type="checkbox" checked={member.alive} onChange={(event) => onPatch({ alive: event.target.checked })} />
          còn sống
        </label>
        <Button onClick={() => setOpen((previous) => !previous)}>{open ? 'Thu' : 'Chi tiết'}</Button>
        <Button variant="danger" onClick={onRemove}>
          Bỏ
        </Button>
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-vellum/50">
        <span className="w-16 shrink-0">thái độ</span>
        <input
          type="range"
          min={-100}
          max={100}
          value={member.attitude}
          onChange={(event) => onPatch({ attitude: Number(event.target.value) })}
          aria-label={`Thái độ của ${member.name}`}
          className="w-32 sm:w-40"
        />
        <span className="w-10 shrink-0 font-mono">{member.attitude}</span>
        <TextInput
          className="min-w-40 flex-1"
          value={member.goal}
          placeholder="mục tiêu riêng"
          onChange={(event) => onPatch({ goal: event.target.value })}
        />
      </div>

      {open && (
        <div className="mt-2 flex flex-col gap-2 border-t border-oak-light pt-2">
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <Select className="w-40" value={member.race} onChange={(event) => onPatch({ race: event.target.value })}>
              {playableRaces().map((race) => (
                <option key={race.id} value={race.id}>
                  {race.name}
                  {race.id === raceId ? ' (cùng tộc)' : ''}
                </option>
              ))}
            </Select>
            <TextInput
              className="max-w-40"
              placeholder="tình trạng"
              value={member.status}
              onChange={(event) => onPatch({ status: event.target.value })}
            />
            <TextInput
              className="max-w-40"
              placeholder="nghề / vai trò"
              value={member.role}
              onChange={(event) => onPatch({ role: event.target.value })}
            />
          </div>

          {/*
            Hai ô này là chỗ "mẹ là con gái vua Đức" thành cơ học. Gán nhà mẹ là
            một gia tộc đang cai trị thì bảng yêu sách ở dưới mọc ra một dòng
            ngay lập tức — không phải một câu ghi chú mà không ai đọc.
          */}
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="w-32 shrink-0 text-vellum/50">Là ai trong lorebook</span>
            <Select className="flex-1" value={member.loreEntry} onChange={(event) => onPatch({ loreEntry: event.target.value })}>
              <option value="">— nhân vật mới, không có trong lorebook —</option>
              {lorePeople().map((person) => (
                <option key={person.id} value={person.id}>
                  {person.title}
                </option>
              ))}
            </Select>
          </div>

          {member.loreEntry !== '' && <LoreEntryReader key={member.loreEntry} entryId={member.loreEntry} />}

          <div className="flex flex-col gap-1">
            <span className="text-xs text-vellum/50">
              Sinh từ nhà — đây là chỗ &laquo;mẹ là con gái vua Đức&raquo; thành một yêu sách thật
            </span>
            <HousePicker
              houses={allHouses()}
              value={member.houseId}
              emptyLabel="— không có gia tộc có tên tuổi —"
              onChange={onHouse}
            />
          </div>

          {/* Mười hai chỉ số đầy đủ: người nhà dùng chung mọi công thức với
              người chơi, nên Phần 10 chỉ huy được họ và Phần 15 mô phỏng được
              họ mà không phải nội suy từ một bộ rút gọn. */}
          <div className="grid grid-cols-3 gap-1 sm:grid-cols-4 lg:grid-cols-6">
            {STAT_IDS.map((id) => (
              <label key={id} className="flex items-center gap-1 text-[0.65rem] text-vellum/50">
                <span className="w-8 shrink-0" title={STATS[id].name}>
                  {id.toUpperCase()}
                </span>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={member.stats[id]}
                  onChange={(event) =>
                    onPatch({
                      stats: {
                        ...member.stats,
                        [id]: Math.max(1, Math.min(statCapOf(member.race, id), Number(event.target.value) || 1)),
                      },
                    })
                  }
                  className="w-10 rounded border border-oak-light bg-ink px-1 py-0.5 text-center text-parchment"
                />
              </label>
            ))}
          </div>

          <TextInput
            placeholder="ghi chú"
            value={member.note}
            onChange={(event) => onPatch({ note: event.target.value })}
          />
        </div>
      )}
    </div>
  );
}

/**
 * QUYỀN THỪA KẾ — suy ra từ gia tộc của mình và của người nhà.
 *
 * Bảng này KHÔNG sửa tay từng dòng, và đó là chủ ý: yêu sách là hệ quả của cây
 * gia tộc ở trên, nên muốn đổi thì đổi cây. Một bảng sửa tay được sẽ lập tức
 * lệch với cây, và không ai biết bên nào đúng. Chỉ độ mạnh là chỉnh được, vì đó
 * là chỗ người chơi kể thêm hoàn cảnh mà dữ liệu không biết.
 */
function ClaimsCard({ draft, onChange }: { draft: CharacterDraft; onChange: (draft: CharacterDraft) => void }): ReactNode {
  return (
    <Card title="Quyền thừa kế">
      <p className="text-xs text-vellum/40">
        Yêu sách là thứ ngài ĐANG ĐÒI, khác hẳn thứ ngài đang giữ ở bước 8. Nó mọc ra từ gia tộc của
        ngài và của người nhà — gán nhà cho mẹ ở trên là thấy ngay.
      </p>

      {draft.claims.length === 0 ? (
        <p className="text-xs text-vellum/40 italic">
          Không có yêu sách nào. Phần lớn nhân vật trong thế giới này cũng vậy.
        </p>
      ) : (
        draft.claims.map((claim, index) => (
          <div key={claim.id} className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="w-full shrink-0 text-parchment sm:w-44">{claim.targetName}</span>
            <Select
              className="w-32"
              value={claim.strength}
              onChange={(event) => {
                const claims = [...draft.claims];
                const current = claims[index];
                if (current === undefined) return;
                claims[index] = { ...current, strength: event.target.value };
                onChange({ ...draft, claims });
              }}
            >
              {claimStrengths().map((entry) => (
                <option key={entry.id} value={entry.id} title={entry.note}>
                  {entry.name}
                </option>
              ))}
            </Select>
            <span className="flex-1 truncate text-vellum/50" title={claim.note}>
              {claim.note}
            </span>
          </div>
        ))
      )}
    </Card>
  );
}

function FamilyStep({ draft, onChange, rng }: StepProps): ReactNode {
  const patch = (index: number, over: Partial<FamilyMember>): void => {
    const family = [...draft.family];
    const current = family[index];
    if (current === undefined) return;
    family[index] = { ...current, ...over };
    onChange({ ...draft, family });
  };

  const addMember = (): void => {
    const taken = new Set(draft.family.map((member) => member.id));
    let index = draft.family.length;
    let id = `npc_nguoi-nha-${index + 1}`;
    while (taken.has(id) && index < 200) id = `npc_nguoi-nha-${++index + 1}`;
    onChange({
      ...draft,
      family: [
        ...draft.family,
        {
          id,
          name: `${randomGivenName(rng, draft.raceId, 'nam')} ${draft.familyName}`,
          relation: 'ho-hang',
          race: draft.raceId,
          houseId: draft.houseId,
          loreEntry: '',
          sex: 'nam',
          age: draft.age,
          alive: true,
          status: 'khỏe',
          stats: emptyStatBlock(10),
          role: '',
          attitude: 0,
          goal: '',
          note: '',
        },
      ],
    });
  };

  const addRelation = (): void => {
    onChange({
      ...draft,
      outsideRelations: [
        ...draft.outsideRelations,
        {
          id: `npc_quan-he-${draft.outsideRelations.length + 1}`,
          name: `${randomGivenName(rng, draft.raceId, 'nam')} ${randomFamilyName(rng, draft.raceId)}`,
          kind: 'quen',
          trust: 0,
          note: '',
        },
      ],
    });
  };

  const patchRelation = (index: number, over: Partial<(typeof draft.outsideRelations)[number]>): void => {
    const outsideRelations = [...draft.outsideRelations];
    const current = outsideRelations[index];
    if (current === undefined) return;
    outsideRelations[index] = { ...current, ...over };
    onChange({ ...draft, outsideRelations });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" onClick={() => onChange(rollFamily(draft, rng))}>
          Sinh lại toàn bộ gia tộc
        </Button>
        <Button onClick={addMember}>Thêm một người</Button>
        <span className="text-xs text-vellum/40">
          mỗi người là một NPC thật trong state: đủ 12 chỉ số, tuổi, tình trạng, thái độ, mục tiêu riêng
        </span>
      </div>

      {draft.family.length === 0 ? (
        <p className="text-sm text-vellum/50 italic">Chưa sinh gia tộc.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {draft.family.map((member, index) => (
            <FamilyMemberRow
              key={member.id}
              member={member}
              raceId={draft.raceId}
              onPatch={(over) => patch(index, over)}
              onHouse={(houseId) => onChange(setFamilyHouse(draft, member.id, houseId))}
              onRemove={() =>
                onChange(recomputeClaims({ ...draft, family: draft.family.filter((_, i) => i !== index) }))
              }
            />
          ))}
        </div>
      )}

      <ClaimsCard draft={draft} onChange={onChange} />

      <Card title="Quan hệ ngoài gia đình">
        <p className="text-xs text-vellum/40">Thầy dạy, bạn thân, kẻ thù, ân nhân, chủ nợ.</p>
        {draft.outsideRelations.map((relation, index) => (
          <div key={relation.id} className="flex flex-wrap items-center gap-1.5 text-xs">
            <Select className="w-32" value={relation.kind} onChange={(event) => patchRelation(index, { kind: event.target.value })}>
              {relationKinds().map((kind) => (
                <option key={kind.id} value={kind.id}>
                  {kind.name}
                </option>
              ))}
            </Select>
            <TextInput className="max-w-48" value={relation.name} onChange={(event) => patchRelation(index, { name: event.target.value })} />
            <input
              type="range"
              min={-100}
              max={100}
              value={relation.trust}
              onChange={(event) => patchRelation(index, { trust: Number(event.target.value) })}
              aria-label={`Mức tin cậy với ${relation.name}`}
              className="w-32"
            />
            <span className="w-10 shrink-0 font-mono text-vellum/50">{relation.trust}</span>
            <TextInput className="min-w-40 flex-1" value={relation.note} onChange={(event) => patchRelation(index, { note: event.target.value })} />
            <Button
              variant="danger"
              onClick={() => onChange({ ...draft, outsideRelations: draft.outsideRelations.filter((_, i) => i !== index) })}
            >
              Bỏ
            </Button>
          </div>
        ))}
        <Button onClick={addRelation}>Thêm một quan hệ</Button>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 7 — Thế lực
// ---------------------------------------------------------------------------

function FactionStep({ draft, onChange, rng }: StepProps): ReactNode {
  const setAttitude = (nationId: string, value: number): void => {
    onChange({
      ...draft,
      allegiance: {
        ...draft.allegiance,
        attitudes: { ...draft.allegiance.attitudes, [nationId]: value },
      },
    });
  };

  const resetAttitude = (nationId: string): void => {
    const attitudes = { ...draft.allegiance.attitudes };
    delete attitudes[nationId];
    onChange({ ...draft, allegiance: { ...draft.allegiance, attitudes } });
  };

  const resetAllAttitudes = (): void => {
    onChange({ ...draft, allegiance: { ...draft.allegiance, attitudes: {} } });
  };

  const nextSecretId = (): string => {
    const used = new Set(draft.secrets.map((secret) => secret.id));
    let number = 1;
    while (used.has(`secret_${number}`)) number += 1;
    return `secret_${number}`;
  };

  return (
    <div className="flex flex-col gap-3">
      <Card title="Lời thề và địa vị">
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Field label="Trung thành với thế lực nào">
          <Select
            value={draft.allegiance.nationId}
            onChange={(event) => onChange({ ...draft, allegiance: { ...draft.allegiance, nationId: event.target.value } })}
          >
            <option value="">— không thuộc thế lực nào —</option>
            {nationIds().map((id) => {
              const attitude = raceAttitudeTo(draft.raceId, id);
              return (
                <option key={id} value={id}>
                  {nationName(id)} ({attitude > 0 ? '+' : ''}
                  {attitude} · {attitudeLabel(attitude)})
                </option>
              );
            })}
          </Select>
        </Field>

        <Field label="Lãnh chúa trực tiếp" hint="để trống nếu chưa thề với ai">
          <TextInput
            value={draft.allegiance.liege}
            onChange={(event) => onChange({ ...draft, allegiance: { ...draft.allegiance, liege: event.target.value } })}
          />
        </Field>

        <Field label="Vai trò trong thế lực">
          <Select
            value={draft.allegiance.standing}
            onChange={(event) => onChange({ ...draft, allegiance: { ...draft.allegiance, standing: event.target.value } })}
          >
            {NATION_STANDINGS.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      {draft.allegiance.nationId !== '' && (
        <p className="text-xs text-vellum/50">
          Thái độ nền của {nationName(draft.allegiance.nationId)} với {raceName(draft.raceId)}:{' '}
          <span className="text-parchment">
            {draft.allegiance.attitudes[draft.allegiance.nationId] ?? raceAttitudeTo(draft.raceId, draft.allegiance.nationId)} ·{' '}
            {attitudeLabel(
              draft.allegiance.attitudes[draft.allegiance.nationId] ?? raceAttitudeTo(draft.raceId, draft.allegiance.nationId),
            )}
          </span>
        </p>
      )}
      </Card>

      <Card title="Tôn giáo">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Field label="Tôn giáo" hint="hiệu ứng nhân với mức sùng đạo bên dưới">
          <Select
            value={draft.allegiance.religionId}
            onChange={(event) =>
              onChange({ ...draft, allegiance: { ...draft.allegiance, religionId: event.target.value } })
            }
          >
            <option value="">— không theo đạo nào —</option>
            {religionsForRace(raceOf(draft.raceId)?.church ?? '').map((religion) => (
              <option key={religion.id} value={religion.id}>
                {religion.name} ({religion.stance})
              </option>
            ))}
          </Select>
        </Field>

        <Field label={`Mức sùng đạo: ${draft.allegiance.piety}/100`}>
          <input
            type="range"
            min={0}
            max={100}
            value={draft.allegiance.piety}
            onChange={(event) =>
              onChange({ ...draft, allegiance: { ...draft.allegiance, piety: Number(event.target.value) } })
            }
            className="w-full"
          />
        </Field>
        </div>

      <BeliefCard
        title="Tôn giáo tác động gì"
        effects={religionOf(draft.allegiance.religionId)?.effects ?? []}
        intensity={draft.allegiance.piety}
        description={religionOf(draft.allegiance.religionId)?.description ?? ''}
        taboos={religionOf(draft.allegiance.religionId)?.taboos ?? []}
      />
      </Card>

      <Card title="Văn hóa nuôi dạy">
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Field label="Văn hóa nuôi dạy" hint="có thể khác chủng tộc — đó thường là chỗ hay nhất">
          <Select
            value={draft.cultureId}
            onChange={(event) => onChange({ ...draft, cultureId: event.target.value })}
          >
            <option value="">— không rõ —</option>
            {culturesForRace(draft.raceId, draft.birthRegionId).map((culture) => (
              <option key={culture.id} value={culture.id}>
                {culture.name}
                {culture.nativeRaces.includes(draft.raceId) ? ' ★' : ''}
              </option>
            ))}
          </Select>
        </Field>

        <Field label={`Mức hòa nhập: ${draft.culturalFit}/100`}>
          <input
            type="range"
            min={0}
            max={100}
            value={draft.culturalFit}
            onChange={(event) => onChange({ ...draft, culturalFit: Number(event.target.value) })}
            className="w-full"
          />
        </Field>
      </div>

      <BeliefCard
        title="Văn hóa tác động gì"
        effects={cultureOf(draft.cultureId)?.effects ?? []}
        intensity={draft.culturalFit}
        description={cultureOf(draft.cultureId)?.description ?? ''}
        taboos={[]}
      />
      </Card>

      <Card title="Thái độ của các thế lực">
        <div className="flex flex-col items-start gap-2 sm:flex-row sm:justify-between sm:gap-3">
          <p className="text-xs text-vellum/50">
            Mặc định suy từ chủng tộc. Có thể sửa từng thế lực để phản ánh danh tiếng hoặc quá khứ riêng của nhân vật.
          </p>
          <Button className="shrink-0" disabled={Object.keys(draft.allegiance.attitudes).length === 0} onClick={resetAllAttitudes}>
            Về mặc định
          </Button>
        </div>
        <div className="grid max-h-80 grid-cols-1 gap-x-6 gap-y-2 overflow-y-auto pr-1 lg:grid-cols-2">
          {nationIds().map((nationId) => {
            const base = raceAttitudeTo(draft.raceId, nationId);
            const overridden = draft.allegiance.attitudes[nationId] !== undefined;
            const value = draft.allegiance.attitudes[nationId] ?? base;
            return (
              <div
                key={nationId}
                className={`rounded border px-2 py-1.5 ${
                  nationId === draft.allegiance.nationId ? 'border-brass/60 bg-brass/5' : 'border-oak-light'
                }`}
              >
                <div className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="truncate text-parchment" title={nationName(nationId)}>{nationName(nationId)}</span>
                  <span className="shrink-0 font-mono text-vellum/70">
                    {value > 0 ? '+' : ''}{value} · {attitudeLabel(value)}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <input
                    aria-label={`Thái độ của ${nationName(nationId)}`}
                    type="range"
                    min={-100}
                    max={100}
                    value={value}
                    onChange={(event) => setAttitude(nationId, Number(event.target.value))}
                    className="min-w-0 flex-1"
                  />
                  <button
                    type="button"
                    disabled={!overridden}
                    onClick={() => resetAttitude(nationId)}
                    className="w-14 shrink-0 text-[0.65rem] text-vellum/50 hover:text-brass disabled:invisible"
                  >
                    đặt lại
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Field label="Hội đoàn" hint="phường hội, dòng tu, hiệp sĩ đoàn, hội thương nhân, hội trộm — cách nhau bằng dấu phẩy">
        <TextInput
          value={draft.allegiance.guilds.join(', ')}
          onChange={(event) =>
            onChange({
              ...draft,
              allegiance: {
                ...draft.allegiance,
                guilds: event.target.value
                  .split(',')
                  .map((part) => part.trim())
                  .filter((part) => part !== '')
                  .slice(0, 10),
              },
            })
          }
        />
      </Field>

      <Card title="Bí mật khởi đầu">
        <p className="text-xs text-vellum/40">
          Chọn 1–3 điều nhân vật giấu. Chúng được cắm thẳng vào slice tri thức của Phần 4 với độ tin cậy
          100 — nhân vật biết chuyện của chính mình, NPC thì không, cho tới khi bị lộ.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => onChange({ ...draft, secrets: generateSecrets(rng) })}>Sinh lại ngẫu nhiên</Button>
          <Button
            disabled={draft.secrets.length >= 3}
            onClick={() => onChange({
              ...draft,
              secrets: [...draft.secrets, { id: nextSecretId(), text: '', revealed: false }],
            })}
          >
            Thêm bí mật
          </Button>
          <span className={`text-xs ${draft.secrets.length >= 1 && draft.secrets.length <= 3 ? 'text-vellum/40' : 'text-amber-300'}`}>
            {draft.secrets.length}/3 điều
          </span>
        </div>
        {draft.secrets.map((secret, index) => (
          <div key={secret.id} className="flex items-center gap-2">
            <span className="w-5 shrink-0 text-right font-mono text-xs text-vellum/40">{index + 1}.</span>
            <TextInput
              value={secret.text}
              placeholder="Điều nhân vật đang che giấu…"
              onChange={(event) => {
                const secrets = [...draft.secrets];
                secrets[index] = { ...secret, text: event.target.value };
                onChange({ ...draft, secrets });
              }}
            />
            <Button
              variant="danger"
              aria-label={`Bỏ bí mật ${index + 1}`}
              onClick={() => onChange({ ...draft, secrets: draft.secrets.filter((_, secretIndex) => secretIndex !== index) })}
            >
              Bỏ
            </Button>
          </div>
        ))}
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 8 — Trang bị
// ---------------------------------------------------------------------------

function GearStep({ draft, onChange }: StepProps): ReactNode {
  const line = startingLine(draft.originId, draft.birthOrderId, draft.lineageStateId);
  const carried = gearWeight(draft.gear);
  const [adding, setAdding] = useState(gearKinds()[0] ?? '');

  const setGear = (index: number, patch: Partial<CarriedGear>): void => {
    const gear = [...draft.gear];
    const current = gear[index];
    if (current === undefined) return;
    gear[index] = { ...current, ...patch };
    onChange({ ...draft, gear });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5 text-sm sm:flex-row sm:items-baseline sm:justify-between">
        <span className="text-vellum/70">
          Tiền mang theo: <span className="text-parchment">{line.coins}</span> đồng bạc
        </span>
        <span className="text-xs text-vellum/40">
          đang mang {carried} kg · {draft.gear.filter((entry) => entry.equipped).length}/{draft.gear.length} món mặc trên người
        </span>
      </div>

      <Card title="Trang bị">
        <div className="flex flex-col gap-1">
          {draft.gear.length === 0 && <p className="text-xs text-vellum/40 italic">Không mang gì cả.</p>}
          {draft.gear.map((entry, index) => {
            const item = gearOf(entry.item);
            return (
              <div key={`${entry.item}-${index}`} className="flex flex-wrap items-center gap-1.5 text-xs">
                <label className="flex w-40 shrink-0 items-center gap-1" title={item?.note ?? ''}>
                  <input
                    type="checkbox"
                    checked={entry.equipped}
                    onChange={(event) => setGear(index, { equipped: event.target.checked })}
                  />
                  <span className={entry.equipped ? 'text-parchment' : 'text-vellum/40'}>{gearName(entry.item)}</span>
                </label>
                <Select
                  className="w-32"
                  value={entry.material}
                  onChange={(event) => setGear(index, { material: event.target.value })}
                >
                  {gearMaterials().map((material) => (
                    <option key={material.id} value={material.id}>
                      {material.name}
                    </option>
                  ))}
                </Select>
                <Select
                  className="w-28"
                  value={entry.quality}
                  onChange={(event) => setGear(index, { quality: event.target.value })}
                >
                  {gearQualities().map((quality) => (
                    <option key={quality.id} value={quality.id}>
                      {quality.name}
                    </option>
                  ))}
                </Select>
                <Select className="w-28" value={entry.slot} onChange={(event) => setGear(index, { slot: event.target.value })}>
                  {gearSlots().map((slot) => (
                    <option key={slot.id} value={slot.id}>
                      {slot.name}
                    </option>
                  ))}
                </Select>
                <span className="w-16 shrink-0 text-right font-mono text-vellum/40">{gearPrice(entry)} đ</span>
                <span className="min-w-32 flex-1 truncate text-vellum/40">
                  {item?.skillBonus === undefined
                    ? (item?.coverage.length ?? 0) > 0
                      ? `che ${item?.coverage.length} vùng cơ thể`
                      : ''
                    : item.skillBonus.domains.join(', ')}
                </span>
                <Button variant="danger" onClick={() => onChange({ ...draft, gear: draft.gear.filter((_, i) => i !== index) })}>
                  Bỏ
                </Button>
              </div>
            );
          })}
        </div>

        <div className="flex flex-col gap-2 border-t border-oak-light pt-2 sm:flex-row sm:items-center">
          <Select className="sm:w-40 sm:shrink-0" value={adding} onChange={(event) => setAdding(event.target.value)}>
            {gearKinds().map((kind) => (
              <option key={kind} value={kind}>
                {kind}
              </option>
            ))}
          </Select>
          <Select
            className="flex-1"
            value=""
            onChange={(event) => {
              const added = carry(event.target.value);
              if (added !== null) onChange({ ...draft, gear: [...draft.gear, added] });
            }}
          >
            <option value="">— thêm một món —</option>
            {gearOfKind(adding).map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} ({item.price} đ, {item.weightKg} kg)
              </option>
            ))}
          </Select>
        </div>
        <p className="text-xs text-vellum/40">
          Giáp chỉ khai NHỮNG VÙNG CƠ THỂ NÓ CHE, không khai một con số phòng thủ tổng — rút gọn như
          thế là làm hỏng cơ chế đâm khe hở của Phần 9. Phần 16 dựng bản đồ che phủ thật từ đây.
        </p>
      </Card>

      <Card title="Tài sản khác">
        <p className="text-xs text-vellum/40">
          Nhà đất, xưởng, kho hàng, phần vốn — thứ không phải thành trì và cũng không mang theo được.
        </p>
        <TextInput
          value={draft.property.join(', ')}
          onChange={(event) =>
            onChange({
              ...draft,
              property: event.target.value
                .split(',')
                .map((part) => part.trim())
                .filter((part) => part !== '')
                .slice(0, 40),
            })
          }
        />
      </Card>

      <PossessionLayersGuide />
      <HoldingsCard draft={draft} onChange={onChange} />
      <FiefsCard draft={draft} onChange={onChange} />
    </div>
  );
}

function PossessionLayersGuide(): ReactNode {
  return (
    <Card title="Ba lớp quyền lực — đừng gộp làm một">
      <div className="grid grid-cols-1 gap-2 text-xs lg:grid-cols-3">
        <div className="rounded border border-oak-light bg-ink/30 p-2">
          <p className="font-semibold text-brass">1. Địa điểm thực tế</p>
          <p className="mt-1 text-vellum/65">Thôn, làng, trấn, thành hoặc đại thành: có vị trí, dân cư, kho, công trình và quân đồn trú.</p>
          <p className="mt-1 text-vellum/40">Có thể chiếm, giữ, xây và vây. Không phải nơi nào cũng có tường.</p>
        </div>
        <div className="rounded border border-oak-light bg-ink/30 p-2">
          <p className="font-semibold text-brass">2. Thái ấp / quyền được ban</p>
          <p className="mt-1 text-vellum/65">Một gói quyền pháp lý: có thể là đất, tô thuế, chức vụ, độc quyền cối xay, bến đò hoặc khoản thu.</p>
          <p className="mt-1 text-vellum/40">Có thể phong, thừa kế hoặc tước đoạt; nghĩa vụ đi kèm do lệ địa phương định.</p>
        </div>
        <div className="rounded border border-oak-light bg-ink/30 p-2">
          <p className="font-semibold text-brass">3. Tước vị và thực quyền</p>
          <p className="mt-1 text-vellum/65">Tước là phẩm trật hoặc chức danh; lãnh thổ là vùng mà người giữ thực sự cai trị.</p>
          <p className="mt-1 text-vellum/40">Có tước chưa chắc có đất; chiếm thành chưa tự động làm tước hợp pháp.</p>
        </div>
      </div>
      <details className="rounded border border-oak-light bg-ink/20 px-2 py-1.5 text-xs text-vellum/55">
        <summary className="cursor-pointer text-brass/85">Ghi chú lịch sử cho mốc 1444</summary>
        <div className="mt-2 grid gap-2 lg:grid-cols-2">
          <p>Không có một “kim tự tháp phong kiến” đồng nhất cho toàn châu Âu. Cùng một tên tước có thể là chức vụ, phẩm trật, quyền tài phán hoặc tước gắn đất tùy vương quốc và tập quán.</p>
          <p>Trang viên là đơn vị kinh tế–tư pháp và thường không có công sự. Lâu đài vừa là nơi ở, trung tâm hành chính, biểu tượng địa vị, vừa là công trình phòng thủ.</p>
          <p>Thái ấp không nhất thiết là một khối đất: quyền thu phí, khoản tiền, chức vụ và nguồn lợi cũng có thể được phong. Lời thề và lễ trao quyền làm rõ ai nợ ai.</p>
          <p>Kế vị không mặc nhiên luôn là trưởng nam. Chia đều, bầu cử, quyền của nữ hệ và tập quán địa phương cùng tồn tại; đến năm 1444 nhiều nghĩa vụ quân sự đã được đổi thành tiền hoặc đội quân hợp đồng.</p>
        </div>
      </details>
    </Card>
  );
}

function Fact({ label, value }: { label: string; value: ReactNode }): ReactNode {
  return (
    <div className="rounded border border-oak-light/70 bg-ink/25 px-2 py-1.5">
      <p className="text-[0.6rem] tracking-wider text-vellum/35 uppercase">{label}</p>
      <div className="mt-0.5 text-xs text-vellum/70">{value}</div>
    </div>
  );
}

/** ĐỊA ĐIỂM — một điểm có tọa độ; chỉ các bậc đủ cao mới là thành có tường. */
function HoldingsCard({ draft, onChange }: { draft: CharacterDraft; onChange: (draft: CharacterDraft) => void }): ReactNode {
  const set = (index: number, patch: Partial<DraftHolding>): void => {
    const holdings = [...draft.holdings];
    const current = holdings[index];
    if (current === undefined) return;
    holdings[index] = { ...current, ...patch };
    onChange({ ...draft, holdings });
  };
  const nearby = settlementsWithin(draft.birthRegionId);

  return (
    <Card title="Địa điểm, cơ nghiệp và thành trì đang giữ">
      <p className="text-xs text-vellum/55">
        Khai một <span className="text-parchment">địa điểm có thật trên bản đồ</span>. “Thành trì” ở đây là tên hệ thống;
        thôn và làng thường để ngỏ hoặc chỉ có hào, bờ đất, hàng rào. Chọn cấp để quyết định quy mô dân và khả năng phòng thủ ban đầu.
      </p>

      {draft.holdings.length === 0 && <p className="rounded border border-dashed border-oak-light p-3 text-xs text-vellum/40 italic">Nhân vật không trực tiếp giữ địa điểm nào.</p>}
      {draft.holdings.map((holding, index) => {
        const tier = settlementTierOf(holding.tier);
        const role = holdingRoleOf(holding.role);
        return (
          <section key={holding.id} className="flex flex-col gap-2 rounded border border-oak-light bg-ink/20 p-3">
            <div className="flex items-start justify-between gap-3">
              <p className="text-xs font-semibold text-brass">Địa điểm {index + 1}</p>
              <Button variant="danger" onClick={() => onChange({ ...draft, holdings: draft.holdings.filter((_, i) => i !== index) })}>Bỏ</Button>
            </div>
            <div className="grid grid-cols-1 gap-2 lg:grid-cols-3">
              <Field label="Tên riêng" hint="Tên địa điểm, không phải tên thái ấp hoặc lãnh thổ">
                <TextInput value={holding.name} onChange={(event) => set(index, { name: event.target.value })} />
              </Field>
              <Field label="Cấp điểm cư trú" hint="Quy mô thực địa, không phải phẩm tước">
                <Select value={holding.tier} onChange={(event) => set(index, { tier: event.target.value })}>
                  {settlementTiers().map((entry) => <option key={entry.id} value={entry.id}>{entry.level}. {entry.name}</option>)}
                </Select>
              </Field>
              <Field label="Tư cách đang giữ" hint="Quyền của nhân vật đối với địa điểm này">
                <Select value={holding.role} onChange={(event) => set(index, { role: event.target.value })}>
                  {holdingRoles().map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
                </Select>
              </Field>
            </div>
            <div className="grid grid-cols-1 gap-2 lg:grid-cols-3">
              <Fact label="Dân số điển hình" value={tier?.population ?? 'chưa rõ'} />
              <Fact label="Hình thái và phòng thủ" value={tier?.note ?? 'Chọn cấp để xem.'} />
              <Fact label="Hiệu lực pháp lý" value={role?.note ?? 'Chọn tư cách để xem.'} />
            </div>
            <div className="grid grid-cols-1 gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
              <Field label="Nằm trong vùng" hint="Địa điểm thuộc một vùng, nhưng không đồng nhất với vùng đó">
                <Select value={holding.regionId} onChange={(event) => set(index, { regionId: event.target.value })}>
                  <option value="">— chưa rõ —</option>
                  {allRegions().filter((region) => region.kind !== 'settlement').map((region) => <option key={region.id} value={region.id}>{region.name}</option>)}
                </Select>
              </Field>
              <Field label="Hoàn cảnh đang giữ" hint="Ví dụ: của hồi môn, coi sóc thay trẻ vị thành niên, vừa chiếm được, bị anh em tranh chấp">
                <textarea
                  value={holding.note}
                  maxLength={200}
                  onChange={(event) => set(index, { note: event.target.value })}
                  className="min-h-16 w-full resize-y rounded border border-oak-light bg-ink px-2 py-1.5 text-sm text-parchment placeholder:text-vellum/30"
                />
              </Field>
            </div>
            <p className="font-mono text-[0.6rem] text-vellum/25">hồ sơ: {holding.id}</p>
          </section>
        );
      })}

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => onChange({ ...draft, holdings: [...draft.holdings, { id: holdingIdFor(`moi-${draft.seed}-${draft.holdings.length}`), name: UNNAMED, tier: 'thon', role: 'chu-so-huu', regionId: draft.birthRegionId, note: '' }] })}>
          Tạo một địa điểm mới
        </Button>
        <Select className="w-full max-w-80" value="" onChange={(event) => {
          const chosen = nearby.find((entry) => entry.id === event.target.value);
          if (chosen === undefined || draft.holdings.some((entry) => entry.id === chosen.id)) return;
          onChange({ ...draft, holdings: [...draft.holdings, { id: chosen.id, name: chosen.name, tier: 'thanh', role: 'chu-so-huu', regionId: chosen.parentId ?? '', note: '' }] });
        }}>
          <option value="">— hoặc nhận một địa điểm đã có gần quê quán —</option>
          {nearby.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
        </Select>
      </div>
    </Card>
  );
}

const ACQUISITION = {
  'duoc-phong': { name: 'Được phong', note: 'Lãnh chúa hoặc cơ quan có thẩm quyền trao bằng nghi lễ/văn thư; chính danh cao nhất.' },
  'thua-ke': { name: 'Thừa kế', note: 'Quyền chuyển qua hàng kế vị nhưng thường vẫn phải được công nhận, tuyên thệ và nộp phí kế thừa.' },
  'chiem-doat': { name: 'Chiếm đoạt', note: 'Nắm bằng sức mạnh hoặc thủ đoạn rồi đòi công nhận; giữ được đất chưa có nghĩa là tước đã hợp pháp.' },
} as const;

const LAND_KIND: Readonly<Record<string, string>> = {
  khong: 'Không gắn đất', 'trang-vien': 'Trang viên', 'thai-ap-nho': 'Thái ấp nhỏ', huyen: 'Huyện / chức vụ cấp huyện',
  quan: 'Quận', 'quan-bien': 'Biên trấn / quận biên', 'cong-quoc': 'Công quốc', 'vuong-quoc': 'Vương quốc', 'de-quoc': 'Đế quốc',
};

const ADVANCEMENT: Readonly<Record<string, string>> = {
  'the-tap': 'phong hoặc kế tập', 'bau-cu': 'bầu cử', 'nang-luc': 'sát hạch năng lực', 'dong-mau': 'dòng máu',
  'suc-manh': 'sức mạnh và sự công nhận', 'tay-nghe': 'tay nghề và vốn', 'uy-tin': 'uy tín hội đồng',
};

/** THÁI ẤP — quan hệ pháp lý; TƯỚC — phẩm trật/chức; LÃNH THỔ — vùng có thực quyền. */
function FiefsCard({ draft, onChange }: { draft: CharacterDraft; onChange: (draft: CharacterDraft) => void }): ReactNode {
  const set = (index: number, patch: Partial<DraftFief>): void => {
    const fiefs = [...draft.fiefs];
    const current = fiefs[index];
    if (current === undefined) return;
    fiefs[index] = { ...current, ...patch };
    onChange({ ...draft, fiefs });
  };
  const ladder = ladderForNation(draft.allegiance.nationId);
  const ladderTitles = titlesOfLadder(ladder.id);
  const succession = successionLawOf(ladder.successionDefault);

  return (
    <Card title="Thái ấp, tước vị và thực quyền">
      <div className="rounded border border-brass/35 bg-brass/5 p-2 text-xs">
        <p className="text-brass">Truyền thống hiện hành: {ladder.name}</p>
        <p className="mt-1 text-vellum/60">Lên bậc bằng {ADVANCEMENT[ladder.advancement] ?? ladder.advancement}. {ladder.note}</p>
        <p className="mt-1 text-vellum/45">Kế vị mặc định: {succession?.name ?? ladder.successionDefault}. {succession?.note ?? ''}</p>
      </div>
      <p className="text-xs text-vellum/55">
        Mỗi mục dưới đây là một <span className="text-parchment">tờ quyền riêng</span>. Một người có thể giữ nhiều tước từ nhiều cấp trên;
        nghĩa vụ có thể xung đột. Tên tước không tự chứng minh quyền sở hữu một thành cụ thể.
      </p>

      {draft.fiefs.length === 0 && <p className="rounded border border-dashed border-oak-light p-3 text-xs text-vellum/40 italic">Không có tước hoặc thái ấp nào đang được công nhận.</p>}
      {draft.fiefs.map((fief, index) => {
        const title = titleOf(fief.title);
        const titleLadder = title === null ? null : ladderOf(title.ladderId);
        const panel = panelFor(fief.title);
        const path = ACQUISITION[fief.acquisition];
        const titles = title !== null && !ladderTitles.some((entry) => entry.id === title.id) ? [title, ...ladderTitles] : ladderTitles;
        const outOfTradition = title !== null && title.ladderId !== ladder.id;
        return (
          <section key={fief.id} className="flex flex-col gap-2 rounded border border-oak-light bg-ink/20 p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-brass">Tờ quyền {index + 1}</p>
                {outOfTradition && <p className="mt-0.5 text-[0.65rem] text-amber-300">Tước này thuộc một truyền thống khác với thế lực đang phục vụ; có thể giữ song song, nhưng cần giải thích trong ghi chú.</p>}
              </div>
              <Button variant="danger" onClick={() => onChange({ ...draft, fiefs: draft.fiefs.filter((_, i) => i !== index) })}>Bỏ</Button>
            </div>
            <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
              <Field label="Tên thái ấp / văn thư" hint="Ví dụ: Thái ấp Montfort; không nhập lại tên tước vào đây">
                <TextInput value={fief.name} onChange={(event) => set(index, { name: event.target.value })} />
              </Field>
              <Field label="Tước vị hoặc chức danh" hint={`Danh sách theo ${ladder.name}`}>
                <Select value={fief.title} onChange={(event) => set(index, { title: event.target.value })}>
                  {titles.map((entry) => <option key={entry.id} value={entry.id}>{entry.rank}. {entry.name}</option>)}
                </Select>
              </Field>
              <Field label="Có được bằng cách nào" hint="Con đường này quyết định chính danh ban đầu">
                <Select value={fief.acquisition} onChange={(event) => set(index, { acquisition: event.target.value as DraftFief['acquisition'] })}>
                  {Object.entries(ACQUISITION).map(([id, entry]) => <option key={id} value={id}>{entry.name} · chính danh {startingLegitimacy(id as DraftFief['acquisition'])}/100</option>)}
                </Select>
              </Field>
              <Field label="Lãnh chúa cấp trên" hint="Người nhận lời thề và có trách nhiệm bảo hộ; để trống nếu giữ trực tiếp từ vương quyền">
                <TextInput placeholder="Ví dụ: Công tước xứ Burgundy" value={fief.liege} onChange={(event) => set(index, { liege: event.target.value })} />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
              <Fact label="Bậc" value={title === null ? 'Không rõ' : `${title.rank}/9 · ${titleLadder?.name ?? title.ladderId}`} />
              <Fact label="Quyền gắn đất" value={title === null ? 'Không rõ' : (LAND_KIND[title.landKind] ?? title.landKind)} />
              <Fact label="Quy mô cai trị" value={title === null || title.provinceCap === 0 ? 'Không có tỉnh riêng' : `tối đa ${title.provinceCap} tỉnh`} />
              <Fact label="Quyền chỉ huy" value={title === null ? 'Không rõ' : title.commandUnits === 0 ? 'không giới hạn theo bậc' : `${title.commandUnits} đơn vị`} />
            </div>
            {title !== null && (
              <div className="rounded border border-oak-light/70 p-2 text-xs">
                <p className="text-parchment">{title.note}</p>
                <p className="mt-1 text-vellum/50">Nghĩa vụ chuẩn: {title.obligations.levyDays} ngày quân dịch · {title.obligations.tribute} đồng cống · {title.obligations.courtDays} lần/ngày chầu mỗi năm.</p>
                {title.termYears > 0 && <p className="mt-1 text-amber-200">Chức có nhiệm kỳ {title.termYears} năm, không phải quyền vĩnh viễn.</p>}
                {title.requiresNation !== '' && <p className="mt-1 text-amber-200">Chỉ tồn tại trong {nationName(title.requiresNation)}.</p>}
              </div>
            )}
            <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
              <Fact label="Quyền mở ra" value={title === null || title.grants.length === 0 ? 'Không có quyền cai trị riêng.' : title.grants.join(' · ')} />
              <Fact label="Giới hạn / quyền mất đi" value={title === null || title.loses.length === 0 ? 'Không ghi giới hạn riêng.' : title.loses.join(' · ')} />
            </div>
            {panel !== null && (
              <details className="rounded border border-oak-light px-2 py-1.5 text-xs">
                <summary className="cursor-pointer text-brass/85">Bảng cai trị thực sự mở ở bậc này: {panel.name}</summary>
                <div className="mt-2 grid gap-2 lg:grid-cols-2">
                  <Fact label="Sổ theo dõi" value={panel.sections.length === 0 ? 'Không có bảng cai trị.' : panel.sections.map((entry) => entry.name).join(' · ')} />
                  <Fact label="Hành động được phép" value={panel.actions.length === 0 ? 'Không có hành động cai trị.' : panel.actions.map((entry) => entry.name).join(' · ')} />
                </div>
              </details>
            )}
            <Fact label={`${path.name} · chính danh ${startingLegitimacy(fief.acquisition)}/100`} value={path.note} />

            <div>
              <p className="mb-1 text-xs text-vellum/70">Điều khoản nghĩa vụ ghi thêm trên văn thư</p>
              <div className="grid grid-cols-1 gap-1 lg:grid-cols-2">
                {fiefObligations().map((duty) => {
                  const on = fief.obligations.includes(duty.id);
                  return (
                    <button key={duty.id} type="button" onClick={() => set(index, { obligations: on ? fief.obligations.filter((entry) => entry !== duty.id) : [...fief.obligations, duty.id].slice(0, 8) })}
                      className={`rounded border px-2 py-1.5 text-left text-[0.68rem] ${on ? 'border-brass bg-brass/5 text-brass' : 'border-oak-light text-vellum/55'}`}>
                      <span>{on ? '✓ ' : ''}{duty.name}</span>
                      {obligationOf(duty.id)?.note !== '' && <span className="mt-0.5 block text-vellum/35">{obligationOf(duty.id)?.note}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
            <Field label="Điều kiện, tranh chấp và ngoại lệ" hint="Ghi người phong, năm phong, đối thủ đòi tước, sự công nhận của Giáo hội hoặc tập quán địa phương">
              <textarea value={fief.note} maxLength={200} onChange={(event) => set(index, { note: event.target.value })}
                className="min-h-16 w-full resize-y rounded border border-oak-light bg-ink px-2 py-1.5 text-sm text-parchment placeholder:text-vellum/30" />
            </Field>
            <p className="font-mono text-[0.6rem] text-vellum/25">văn thư: {fief.id}</p>
          </section>
        );
      })}

      <Button onClick={() => {
        const initial = ladderTitles.find((entry) => entry.rank > 0) ?? ladderTitles[0];
        if (initial === undefined) return;
        onChange({ ...draft, fiefs: [...draft.fiefs, { id: fiefIdFor(`moi-${draft.seed}-${draft.fiefs.length}`), name: UNNAMED, title: initial.id, acquisition: ladder.hereditary ? 'thua-ke' : 'duoc-phong', liege: '', obligations: [], note: '' }] });
      }}>Thêm một tước hoặc thái ấp</Button>

      <section className="rounded border border-oak-light bg-ink/20 p-3">
        <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
          <Field label="Thực quyền đối với lãnh thổ" hint="Đây là quyền trên một VÙNG, tách khỏi tước và tách khỏi từng thành">
            <Select value={draft.realmRole} onChange={(event) => onChange({ ...draft, realmRole: event.target.value })}>
              {realmRoles().map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
            </Select>
          </Field>
          <Fact label="Nghĩa của lựa chọn" value={realmRoleOf(draft.realmRole)?.note || 'Nhân vật không đặt thuế, ban luật hay gọi quân cho một vùng nào.'} />
        </div>
        <p className="mt-2 text-[0.68rem] text-vellum/40">Một người có thể giữ tước trên giấy nhưng bị lưu vong, hoặc giữ đồn thành cho người khác mà không cai trị vùng xung quanh. Vì vậy ô này không tự suy ra từ hai phần trên.</p>
      </section>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// 9 — Xác nhận
// ---------------------------------------------------------------------------

function ConfirmStep({ draft, onChange, rng }: StepProps): ReactNode {
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Field label="Tên">
          <TextInput value={draft.givenName} onChange={(event) => onChange({ ...draft, givenName: event.target.value })} />
        </Field>
        <Field label="Họ / gia tộc">
          <TextInput value={draft.familyName} onChange={(event) => onChange({ ...draft, familyName: event.target.value })} />
        </Field>
        {/* Nút chiếm trọn bề ngang trên điện thoại thay vì nép vào nửa hàng
            dưới một cái nhãn trống. */}
        <div className="col-span-2 flex items-end sm:col-span-1">
          <Button className="w-full" onClick={() => onChange(rollNames(draft, rng))}>
            Đặt tên ngẫu nhiên
          </Button>
        </div>
      </div>

      <Field label="Seed của ván chơi" hint="cùng seed + cùng hành động = cùng kết quả cơ học (R3)">
        <TextInput value={draft.seed} onChange={(event) => onChange({ ...draft, seed: event.target.value })} />
      </Field>

      <Field label="Ghi chú tính cách" hint="AI đọc để giữ giọng nhân vật cho nhất quán">
        <TextInput
          value={draft.personalityNote}
          onChange={(event) => onChange({ ...draft, personalityNote: event.target.value })}
        />
      </Field>

      {/*
        Cảnh mở đầu. Không chọn thì AI tự bịa một quán trọ, và mọi ván chơi đều
        bắt đầu giống nhau. Chọn được nơi và người thì màn đầu tiên đã dính vào
        thế giới thật rồi.
      */}
      <Card title="Cảnh mở đầu">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Bắt đầu ở đâu" hint="thành trì có thật trong thế giới">
            <Select
              value={draft.opening.holdingId}
              onChange={(event) => onChange({ ...draft, opening: { ...draft.opening, holdingId: event.target.value } })}
            >
              <option value="">— để AI tự chọn —</option>
              {settlementsWithin(draft.startRegionId === '' ? draft.birthRegionId : draft.startRegionId).map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                </option>
              ))}
              <option disabled>──────────</option>
              {knownSettlements().map((entry) => (
                <option key={`all-${entry.id}`} value={entry.id}>
                  {entry.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Ai có mặt lúc mở màn" hint="nhân vật có thật trong lorebook — AI đã có hồ sơ của họ">
            <Select
              value={draft.opening.withNpc}
              onChange={(event) => onChange({ ...draft, opening: { ...draft.opening, withNpc: event.target.value } })}
            >
              <option value="">— một mình —</option>
              {lorePeople().map((person) => (
                <option key={person.id} value={person.id}>
                  {person.title}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="Đang làm gì lúc màn kéo lên" hint="một câu là đủ; để trống thì AI tự dựng">
          <TextInput
            value={draft.opening.situation}
            placeholder="ví dụ: vừa bị gọi vào đại sảnh giữa đêm, chưa ai nói vì sao"
            onChange={(event) => onChange({ ...draft, opening: { ...draft.opening, situation: event.target.value } })}
          />
        </Field>
      </Card>

      <Card title="Sau khi chốt">
        <p className="text-xs text-vellum/60">
          Engine dựng state ban đầu và gọi AI viết đoạn mở đầu. Prompt nêu rõ mọi lựa chọn ở trên và
          ra lệnh: chỉ viết cảnh mở đầu, KHÔNG được thêm hay đổi bất kỳ chỉ số nào (R1).
        </p>
        <p className="text-sm text-parchment">
          {fullName(draft) === '' ? '(chưa đặt tên)' : fullName(draft)} — {raceName(draft.raceId)}
          {draft.houseId === '' ? '' : ` · ${houseName(draft.houseId)}`}
        </p>
        {draft.claims.length > 0 && (
          <p className="text-xs text-amber-300">
            Mang theo {draft.claims.length} yêu sách: {draft.claims.map((claim) => claim.targetName).join(', ')}
          </p>
        )}
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------

const BODIES: Record<CreationStepId, (props: StepProps) => ReactNode> = {
  'chung-toc': RaceStep,
  'xuat-than': OriginStep,
  'chi-so': StatsStep,
  'ngoai-hinh': AppearanceStep,
  'ky-nang': SkillsStep,
  'gia-dinh': FamilyStep,
  'the-luc': FactionStep,
  'trang-bi': GearStep,
  'xac-nhan': ConfirmStep,
};

export function StepBody({ step, ...props }: StepProps & { step: CreationStepId }): ReactNode {
  const Body = BODIES[step];
  return <Body {...props} />;
}

export function stepTitle(step: CreationStepId): string {
  return CREATION_STEPS.find((entry) => entry.id === step)?.name ?? step;
}
