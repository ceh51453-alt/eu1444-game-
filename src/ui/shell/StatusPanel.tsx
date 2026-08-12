/**
 * Right region — status.
 *
 * Phần 0 dựng khung và chỉ hiện đúng thứ state tối giản giữ. Phần 6 điền ô
 * "Nhân vật": 12 chỉ số thật, giai đoạn tuổi, và mấy biến phụ mà mục 8 khai —
 * chúng tính lại mỗi lượt từ state, nên bảng này không bao giờ lệch với save.
 */

import { useMemo, type ReactNode } from 'react';
import { formatGameDate } from '@/core/clock';
import { MAIN_STREAM } from '@/core/rng';
import { computeDerived } from '@/state/derived';
import type { GameState } from '@/state/slices';
import { useGameStore } from '@/state/store';
import { LastCheckPanel } from '@/ui/panels';
import { BodyPanel } from '@/ui/bodymap';
import {
  STATS,
  STAT_GROUPS,
  ageStageOf,
  birthOrderOf,
  characterOf,
  cultureName,
  fiefTitleName,
  houseName,
  lineageStateOf,
  obligationName,
  originName,
  raceName,
  realmRoleName,
  religionName,
  settlementTierName,
  holdingRoleName,
  skillName,
  statsIn,
  type CharacterState,
} from '@/systems/character';
import { capReport, skillsOf, slowBreakdown, tierName, trainedSkills } from '@/systems/skills';
import { LiveNewsFeed } from '@/ui/world/NewsFeed';
import { allHoldings } from '@/systems/holding';
import { economyOf } from '@/systems/economy';
import { logisticsSummaryOf, militaryStateOf, summaryOf } from '@/systems/military';
import { powerName } from '@/systems/nations';
import { realmStateOf } from '@/systems/realm';
import { campaignStateOf, factionName } from '@/systems/campaign';
import { heldTitles, legitimacyLabel, primaryTitleOf, titleName } from '@/systems/titles';
import { regionName } from '@/lore/regions';
import { equipmentOf, itemsOf, packedItems, valueOf, weightOfItem, wornItems, type Item } from '@/systems/items';
import { Panel } from './AppShell';

function Row({ label, value }: { label: string; value: string }): ReactNode {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-vellum/60">{label}</span>
      <span className="truncate font-mono text-xs text-parchment" title={value}>
        {value}
      </span>
    </div>
  );
}

function CharacterRows({ character }: { character: CharacterState }): ReactNode {
  // KHÔNG gọi `snapshot()` trong selector của store: nó dựng một object mới mỗi
  // lần, nên `useSyncExternalStore` thấy giá trị đổi ở mọi lần đọc và React quay
  // vòng cho tới khi vượt trần độ sâu cập nhật.
  //
  // Mọi biến phụ ở bảng này chỉ phụ thuộc slice `character`, nên dựng lại chúng
  // từ chính object đó là đủ — và chỉ tính lại khi nhân vật thật sự đổi.
  const derived = useMemo(
    () => computeDerived({ character } as unknown as GameState, { strict: false }),
    [character],
  );
  const stage = ageStageOf(character.identity.race, character.identity.age);

  return (
    <>
      <Row label="Tên" value={character.identity.name === '' ? '—' : character.identity.name} />
      <Row label="Chủng tộc" value={raceName(character.identity.race)} />
      <Row label="Tuổi" value={`${character.identity.age} · ${stage.name}`} />
      {STAT_GROUPS.map((group) => (
        <div key={group.id} className="mt-1">
          <p className="text-[0.6rem] tracking-widest text-vellum/40 uppercase">{group.name}</p>
          <div className="grid grid-cols-2 gap-x-3">
            {statsIn(group.id).map((id) => (
              <div key={id} className="flex items-baseline justify-between gap-2 text-xs">
                <span className="text-vellum/60">{STATS[id].name}</span>
                <span className="font-mono text-parchment">{character.stats[id]}</span>
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="mt-1 border-t border-oak-light pt-1">
        <p className="text-[0.6rem] tracking-widest text-vellum/40 uppercase">Biến phụ</p>
        <Row label="Sức nâng" value={`${String(derived['sucNang'] ?? 0)} kg`} />
        <Row label="Sức chở" value={`${String(derived['sucCho'] ?? 0)} kg`} />
        <Row label="Tốc độ" value={`${String(derived['tocDo'] ?? 0)} m`} />
        <Row label="Tầm nhìn" value={`${String(derived['tamNhin'] ?? 0)} m`} />
        <Row label="Tuổi hiệu dụng" value={String(derived['tuoiHieuDung'] ?? 0)} />
      </div>
    </>
  );
}

/** Những lựa chọn đã chốt ở chín bước tạo nhân vật — đọc từ state, không giữ bản UI riêng. */
function CreationProfile({ character }: { character: CharacterState }): ReactNode {
  const state = useGameStore((store) => store as unknown as GameState);
  const titles = heldTitles(state);
  const primary = primaryTitleOf(state);
  const order = birthOrderOf(character.identity.birthOrderId);
  const lineage = lineageStateOf(character.identity.lineageStateId);
  const appearance = character.appearance;

  return (
    <Panel title="Hồ sơ & tước vị">
      <Row label="Giới tính" value={character.identity.sex === 'nam' ? 'Nam' : 'Nữ'} />
      <Row label="Xuất thân" value={originName(character.identity.originId)} />
      <Row label="Gia tộc" value={character.identity.houseId === '' ? 'không có gia tộc có tên' : houseName(character.identity.houseId)} />
      <Row label="Thứ tự trong nhà" value={order?.name ?? character.identity.birthOrderId} />
      <Row label="Tình trạng dòng họ" value={lineage?.name ?? character.identity.lineageStateId} />
      <Row label="Văn hóa" value={`${cultureName(character.identity.cultureId)} · hòa nhập ${String(character.identity.culturalFit)}/100`} />
      <Row label="Nơi sinh" value={regionName(character.identity.birthRegionId)} />
      <Row label="Đang ở" value={regionName(character.identity.startRegionId)} />
      <Row label="Tôn giáo" value={`${religionName(character.allegiance.religionId)} · sùng đạo ${String(character.allegiance.piety)}/100`} />
      <Row label="Lãnh chúa" value={character.allegiance.liege === '' ? 'không có' : character.allegiance.liege} />
      <Row label="Vai trò lãnh thổ" value={realmRoleName(character.realmRole)} />
      <Row
        label="Tước cao nhất"
        value={primary === null ? 'thường dân' : `${titleName(primary.titleId)} · chính danh ${String(Math.round(primary.legitimacy))}/100`}
      />

      {titles.length > 0 && (
        <details className="border-t border-oak-light pt-2 text-xs">
          <summary className="cursor-pointer text-brass/80">Tất cả thái ấp ({titles.length})</summary>
          <div className="mt-2 space-y-2">
            {titles.map((title) => (
              <div key={title.fiefId} className="rounded border border-oak-light/70 px-2 py-1.5">
                <p className="text-parchment">{titleName(title.titleId)} · {title.fiefName}</p>
                <p className="text-[10px] text-vellum/50">
                  {legitimacyLabel(title.legitimacy)} · quân dịch {title.obligations.levyDays} ngày · triều kiến {title.obligations.courtDays} ngày
                </p>
              </div>
            ))}
          </div>
        </details>
      )}

      {(character.holdings.length > 0 || character.fiefs.length > 0) && (
        <details className="border-t border-oak-light pt-2 text-xs">
          <summary className="cursor-pointer text-brass/80">Sở hữu đã chọn lúc tạo nhân vật</summary>
          <div className="mt-2 space-y-1 text-vellum/65">
            {character.holdings.map((holding) => (
              <p key={holding.id}>
                {settlementTierName(holding.tier)} {holding.name} · {holdingRoleName(holding.role)}
              </p>
            ))}
            {character.fiefs.map((fief) => (
              <p key={fief.id}>
                {fiefTitleName(fief.title)} {fief.name}
                {fief.obligations.length === 0 ? '' : ` · ${fief.obligations.map(obligationName).join(', ')}`}
              </p>
            ))}
          </div>
        </details>
      )}

      {appearance !== undefined && (
        <details className="border-t border-oak-light pt-2 text-xs">
          <summary className="cursor-pointer text-brass/80">Ngoại hình đã chọn</summary>
          <div className="mt-2 space-y-1">
            <Row label="Vóc dáng" value={`${appearance.heightCm} cm · ${appearance.weightKg} kg · ${appearance.build}`} />
            <Row label="Tóc / mắt" value={`${appearance.hair}, ${appearance.hairStyle} · ${appearance.eyes}`} />
            <Row label="Giọng / dáng đi" value={`${appearance.voice} · ${appearance.gait}`} />
            <Row label="Y phục" value={appearance.clothing === '' ? '—' : appearance.clothing} />
          </div>
        </details>
      )}

      <Row label="Người thân" value={String(Object.keys(character.family).length)} />
      <Row label="Quan hệ ngoài nhà" value={String(Object.keys(character.relations).length)} />
      <Row label="Yêu sách" value={String(character.claims.length)} />
      <Row label="Bí mật" value={String(character.secrets.length)} />
      {character.allegiance.guilds.length > 0 && <Row label="Hội đoàn" value={character.allegiance.guilds.join(', ')} />}
    </Panel>
  );
}

function InventorySummary({ onOpen }: { onOpen?: () => void }): ReactNode {
  const state = useGameStore((store) => store as unknown as GameState);
  const items = itemsOf(state);
  const equipment = equipmentOf(state);
  const worn = wornItems(state);
  const packed = packedItems(state);
  const carriedKg = [...worn, ...packed].reduce((sum, item) => sum + weightOfItem(item), 0);
  const bagKg = packed.reduce((sum, item) => sum + weightOfItem(item), 0);
  const stored = Math.max(0, (items?.owned.length ?? 0) - worn.length - packed.length);
  const totalValue = (items?.owned ?? []).reduce((sum, item) => sum + valueOf(item as Item), 0);

  return (
    <Panel title="Túi đồ">
      <Row label="Trong túi" value={`${String(packed.length)} món · ${bagKg.toFixed(1)} kg`} />
      <Row label="Đang mặc/cầm" value={String(worn.length)} />
      <Row label="Tổng tải theo người" value={`${carriedKg.toFixed(1)} kg`} />
      <Row label="Cất trong kho" value={String(stored)} />
      <Row label="Tổng giá trị sở hữu" value={`${String(Math.round(totalValue))} đồng`} />
      {packed.length === 0 ? (
        <p className="text-xs text-vellum/45 italic">Túi đồ đang trống.</p>
      ) : (
        <ul className="space-y-0.5 text-xs text-vellum/65">
          {packed.slice(0, 5).map((item) => (
            <li key={item.id} className="flex justify-between gap-2">
              <span className="truncate">{item.name}</span>
              <span className="shrink-0 font-mono text-vellum/45">{weightOfItem(item)} kg</span>
            </li>
          ))}
          {packed.length > 5 && <li className="text-vellum/40">… và {packed.length - 5} món khác</li>}
        </ul>
      )}
      {onOpen !== undefined && (
        <button
          type="button"
          onClick={onOpen}
          className="rounded border border-brass px-2 py-1 text-xs text-brass hover:bg-brass/10"
        >
          Mở túi đồ & trang bị
        </button>
      )}
      {equipment !== null && packed.length > 0 && (
        <p className="text-[10px] text-vellum/40">Đồ trong túi tính vào tải, mệt mỏi, hành quân và chiến đấu.</p>
      )}
    </Panel>
  );
}

/**
 * Ba dòng kỹ năng cao nhất, kèm TRẦN VÀ LÝ DO (Phần 8 mục 11).
 *
 * Bảng đầy đủ nằm ở tab Kỹ năng; ở đây chỉ cần đủ để người chơi thấy mình đang
 * chững lại ở đâu mà không phải mở thêm một màn hình nào.
 */
function SkillsRows(): ReactNode {
  const state = useGameStore((store) => store as unknown as GameState);
  const rows = trainedSkills(state)
    .sort((left, right) => right.level - left.level)
    .slice(0, 4);

  if (rows.length === 0) {
    return <p className="text-sm text-vellum/50 italic">Chưa rèn kỹ năng nào.</p>;
  }

  const load = slowBreakdown(state);
  return (
    <>
      {rows.map((row) => {
        const report = capReport(state, row.skillId);
        return (
          <div key={row.skillId} className="flex flex-col">
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="truncate text-vellum/60">{skillName(row.skillId)}</span>
              <span className="font-mono text-xs text-parchment">
                {row.level}
                <span className="text-vellum/40"> / {report.cap}</span>
              </span>
            </div>
            <span className="truncate text-[0.6rem] text-vellum/40" title={report.reason}>
              {tierName(row.level)} · {report.reason}
            </span>
          </div>
        );
      })}
      <Row label="Hệ số học" value={`×${load.factor}${load.heavy ? ' — quá tải' : ''}`} />
    </>
  );
}

function SkillsSummary(): ReactNode {
  const xp = useGameStore((store) => skillsOf(store as unknown as GameState)?.xp ?? 0);
  const nodes = useGameStore((store) => skillsOf(store as unknown as GameState)?.unlockedNodes.length ?? 0);

  return (
    <Panel title="Kỹ năng">
      <Row label="Điểm KN chưa tiêu" value={String(Math.round(xp))} />
      <Row label="Nhánh đã mở" value={String(nodes)} />
      <SkillsRows />
    </Panel>
  );
}

function RealmAndResourceSummary({ character }: { character: CharacterState }): ReactNode {
  const state = useGameStore((store) => store as unknown as GameState);
  const realm = realmStateOf(state);
  const title = primaryTitleOf(state);
  const holdings = allHoldings(state);
  const campaign = campaignStateOf(state);
  return (
    <Panel title="Tài nguyên & vị thế">
      <Row label="Tiền mang theo" value={`${String(Math.round(character.resources.coins))} đồng`} />
      <Row label="Uy tín" value={String(Math.round(character.resources.prestige))} />
      <Row label="Tước cao nhất" value={title === null ? 'chưa có' : titleName(title.titleId)} />
      <Row label="Thành trì" value={String(holdings.length)} />
      <Row label="Kho cai trị" value={`${String(Math.round(realm?.treasury ?? 0))} đồng`} />
      <Row
        label="Thế lực"
        value={character.allegiance.nationId === '' ? 'chưa thuộc' : powerName(character.allegiance.nationId)}
      />
      <Row
        label="Phe chiến đồ"
        value={campaign?.playerFactionId ? factionName(campaign.playerFactionId) : 'chưa xác định'}
      />
    </Panel>
  );
}

function MilitaryAndEconomySummary({ character }: { character: CharacterState }): ReactNode {
  const state = useGameStore((store) => store as unknown as GameState);
  const military = militaryStateOf(state);
  const economy = character.allegiance.nationId === '' ? null : economyOf(state, character.allegiance.nationId);
  if (military === null) return null;
  const army = summaryOf(military);
  const logistics = logisticsSummaryOf(military);
  return (
    <>
      <Panel title="Quân lực & hậu cần">
        <Row label="Tổng quân" value={String(army.totalTroops)} />
        <Row label="Đạo quân / hạm đội" value={`${String(army.armies)} / ${String(army.fleets)}`} />
        <Row label="Sĩ khí" value={`${String(Math.round(army.morale))}/100`} />
        <Row label="Kinh nghiệm / huấn luyện" value={`${String(Math.round(army.experience))} / ${String(Math.round(army.training))}`} />
        <Row label="Đang tuyển" value={`${String(army.queuedTroops)} quân`} />
        <Row label="Tiếp tế bình quân" value={`${String(Math.round(logistics.averageSupply))}%`} />
        <Row label="Dự trữ kho" value={`${String(Math.round(logistics.reservePercent))}%`} />
        <Row label="Thiếu / bị cắt" value={`${String(logistics.forcesStrained)} / ${String(logistics.forcesCutOff)}`} />
        <Row label="Quân phí tháng" value={`${String(Math.round(army.monthlyUpkeep + logistics.monthlyCost))} đồng`} />
      </Panel>
      {economy !== null && (
        <Panel title="Kinh tế thế lực">
          <Row label="Tổng sản lượng" value={String(Math.round(economy.gdp))} />
          <Row label="Tăng trưởng" value={`${economy.growth >= 0 ? '+' : ''}${economy.growth.toFixed(1)}%`} />
          <Row label="Lạm phát" value={`${economy.inflation.toFixed(1)}%`} />
          <Row label="Thất nghiệp" value={`${economy.unemployment.toFixed(1)}%`} />
          <Row label="Cân đối tháng" value={`${economy.ledger.net >= 0 ? '+' : ''}${String(Math.round(economy.ledger.net))}`} />
          <Row label="Nợ" value={String(Math.round(economy.debt))} />
        </Panel>
      )}
    </>
  );
}

export function StatusPanel({
  onCreateCharacter,
  onOpenSkills,
  onOpenGear,
  onOpenDuel,
  onOpenBattle,
  onOpenSiege,
  onOpenDefence,
  onOpenHolding,
  onOpenRealm,
  onOpenWorld,
}: {
  onCreateCharacter?: () => void;
  onOpenSkills?: () => void;
  onOpenGear?: () => void;
  onOpenDuel?: () => void;
  onOpenBattle?: () => void;
  onOpenSiege?: () => void;
  onOpenDefence?: () => void;
  onOpenHolding?: () => void;
  onOpenRealm?: () => void;
  onOpenWorld?: () => void;
}): ReactNode {
  const meta = useGameStore((state) => state.meta);
  const player = useGameStore((state) => state.player);
  const character = useGameStore((state) => characterOf(state));
  const ready = character !== null && character.identity.finalized;

  return (
    <div className="flex flex-col">
      <div className="border-b border-oak-light px-4 py-4">
        <p className="text-xs tracking-[0.2em] text-brass uppercase">Bảng trạng thái</p>
      </div>

      <Panel title="Ván chơi">
        <Row label="Người chơi" value={player.name === '' ? '—' : player.name} />
        <Row label="Lượt" value={String(meta.turn)} />
        <Row label="Ngày" value={formatGameDate(meta.gameDate)} />
      </Panel>

      <LastCheckPanel />

      <Panel title="Nhân vật">
        {ready ? (
          <CharacterRows character={character} />
        ) : (
          <p className="text-sm text-vellum/50 italic">Chưa tạo nhân vật.</p>
        )}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {onCreateCharacter !== undefined && (
            <button
              type="button"
              onClick={onCreateCharacter}
              className="rounded border border-oak-light px-2 py-1 text-xs text-vellum hover:bg-oak-light"
            >
              {ready ? 'Tạo nhân vật khác' : 'Mở trình tạo nhân vật'}
            </button>
          )}
          {onOpenSkills !== undefined && ready && (
            <button
              type="button"
              onClick={onOpenSkills}
              className="rounded border border-brass px-2 py-1 text-xs text-brass hover:bg-brass/10"
            >
              Kỹ năng & nhánh
            </button>
          )}
          {onOpenDuel !== undefined && ready && (
            <button
              type="button"
              onClick={onOpenDuel}
              className="rounded border border-brass px-2 py-1 text-xs text-brass hover:bg-brass/10"
            >
              Đấu tập
            </button>
          )}
          {onOpenBattle !== undefined && ready && (
            <button
              type="button"
              onClick={onOpenBattle}
              className="rounded border border-brass px-2 py-1 text-xs text-brass hover:bg-brass/10"
            >
              Ra trận
            </button>
          )}
          {onOpenSiege !== undefined && ready && (
            <button
              type="button"
              onClick={onOpenSiege}
              className="rounded border border-brass px-2 py-1 text-xs text-brass hover:bg-brass/10"
            >
              Công thành
            </button>
          )}
          {onOpenDefence !== undefined && ready && (
            <button
              type="button"
              onClick={onOpenDefence}
              className="rounded border border-brass px-2 py-1 text-xs text-brass hover:bg-brass/10"
            >
              Thủ thành
            </button>
          )}
          {onOpenHolding !== undefined && ready && (
            <button
              type="button"
              onClick={onOpenHolding}
              className="rounded border border-brass px-2 py-1 text-xs text-brass hover:bg-brass/10"
            >
              Thành trì
            </button>
          )}
          {/*
            THÀNH TRÌ và LÃNH THỔ là hai nút riêng, và hai chữ ấy không bao giờ
            được gộp (Phụ lục A mục 1). Một cái là ĐIỂM để XÂY, cái kia là VÙNG
            để CAI TRỊ.
          */}
          {onOpenRealm !== undefined && ready && (
            <button
              type="button"
              onClick={onOpenRealm}
              className="rounded border border-brass px-2 py-1 text-xs text-brass hover:bg-brass/10"
            >
              Lãnh thổ
            </button>
          )}
          {/*
            THẾ GIỚI là nút DUY NHẤT ở đây không đòi `ready`. Mục 1 của Phần 14
            nói bảng trạng thái quốc gia xem được TỪ LƯỢT ĐẦU TIÊN, dù người chơi
            là nông nô — nên điều kiện mở nó cũng không được là "đã tạo xong nhân
            vật và có tước". Bảng không bao giờ bị khóa xám, và cửa vào bảng cũng
            không được khóa.
          */}
          {onOpenWorld !== undefined && (
            <button
              type="button"
              onClick={onOpenWorld}
              className="rounded border border-brass px-2 py-1 text-xs text-brass hover:bg-brass/10"
            >
              Thế giới
            </button>
          )}
        </div>
      </Panel>

      {ready && <CreationProfile character={character} />}

      {ready && <InventorySummary {...(onOpenGear === undefined ? {} : { onOpen: onOpenGear })} />}

      {ready && <RealmAndResourceSummary character={character} />}

      {ready && <MilitaryAndEconomySummary character={character} />}

      <SkillsSummary />

      <BodyPanel />

      {/*
        DÒNG TIN — LUỒNG 2 của Phần 15 mục 7, và mục 11 nói nó "LUÔN HIỂN THỊ".
        Nên nó KHÔNG nằm sau một cái nút và không đòi `ready`: một nông nô chưa
        tạo xong nhân vật vẫn nghe được tiếng đồn ngoài chợ. Nó đứng CUỐI cột vì
        nó là thứ duy nhất ở đây dài vô hạn — mọi bảng trên nó có chiều cao cố
        định, và một danh sách cuộn được chèn giữa chúng sẽ đẩy chúng trôi.
      */}
      <Panel title="Dòng tin">
        <LiveNewsFeed />
      </Panel>

      <details className="border-t border-oak-light px-4 py-3 text-[10px] text-vellum/45">
        <summary className="cursor-pointer tracking-widest uppercase">Thông tin tái lập</summary>
        <div className="mt-2 space-y-1">
          <Row label="Seed" value={meta.seed} />
          <Row label="Số lần tung" value={String(meta.rng.streams[MAIN_STREAM]?.draws ?? 0)} />
          <Row label="Schema" value={`v${meta.schemaVersion}`} />
        </div>
      </details>
    </div>
  );
}
