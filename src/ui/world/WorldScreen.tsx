/**
 * TAB THẾ GIỚI — Phần 14 mục 8.
 *
 * Sáu thứ mục 8 đòi, và cả sáu đều ở đây:
 *   1. thẻ quốc gia, mỗi thẻ mở ra bảng trạng thái riêng
 *   2. MỖI BẢNG MỘT GIAO DIỆN KHÁC HẲN — tám component trong `boards/`
 *   3. góc trên mỗi bảng hiện tầng tiếp cận: Quan sát / Tác động / Chơi
 *   4. chỗ chưa biết hiện mờ kèm "tin đồn chưa xác thực", không hiện số thật
 *   5. bản đồ tôn giáo theo vùng, chuyển lớp xem được
 *   6. dòng thời gian sự kiện lớn của châu lục
 *
 * LUẬT QUAN TRỌNG NHẤT của màn hình này là một câu phủ định trong mục 1: **bảng
 * trạng thái không bao giờ bị khóa xám.** Không có `disabled`, không có lớp phủ
 * "cần tước vị cao hơn". Một nông nô mở tab này vẫn thấy đủ tám bảng — chỉ là
 * phần lớn con số hiện thành lời đồn, và không có nút nào dưới bảng.
 *
 * Màn hình KHÔNG GHI STORE, cùng luật với Phần 9–13: nó đọc một bản chụp và hiển
 * thị. Một năm của thế giới chạy ở `advanceWorldYear`, không chạy ở đây.
 */

import { useMemo, useState, type ReactNode } from 'react';
import {
  accessTierFor,
  clarityFor,
  countryRankEffectiveEffects,
  countryRankSupportOf,
  countryStyleOf,
  nextCountryRankOf,
  powerName,
  powerRowOf,
  tensionOf,
  type NationsSliceState,
  type PowerState,
  type ReligionsSliceState,
} from '@/systems/nations';
import type { HeldTitle } from '@/systems/titles';
import type { ArrivedNews } from '@/sim';
import { currentRegion } from '@/lore/knowledge';
import { useGameStore } from '@/state/store';
import type { EconomySliceState } from '@/systems/economy/slice';
import { Bar, Fog, TierBadge } from './parts';
import { Chronicle, KnowledgeMap, type KnowledgeRow } from './Chronicle';
import { MedievalMap } from './MedievalMap';
import { CampaignScreen, type OpenCampaign } from '@/ui/campaign';
import { emptyCampaign } from '@/systems/campaign';
import { OttomanBoard } from './boards/OttomanBoard';
import { ByzantiumBoard } from './boards/ByzantiumBoard';
import { SwissBoard } from './boards/SwissBoard';
import { HordeBoard } from './boards/HordeBoard';
import { HreBoard } from './boards/HreBoard';
import { FranceBoard } from './boards/FranceBoard';
import { PapacyBoard } from './boards/PapacyBoard';
import { LatinBoard } from './boards/LatinBoard';
import { EconomyPanel } from './EconomyPanel';

export interface WorldScreenProps {
  nations: NationsSliceState;
  religions: ReligionsSliceState;
  economy: EconomySliceState;
  titles: readonly HeldTitle[];
  year: number;
  /** Thế lực người chơi đang thuộc về (`knowledge.factionId`). */
  factionId?: string;
  /** Độ tin của tri thức về từng thế lực (`knowledge.known`). */
  confidence?: Readonly<Record<string, number>>;
  /**
   * BA THỨ CỦA PHẦN 15 MỤC 11 sống nhờ vào màn hình này thay vì mở thêm một màn
   * hình thứ bảy: biên niên sử và bản đồ tri thức trả lời cùng một câu hỏi mà tab
   * Thế giới đã đặt ra — *"ngoài kia đang xảy ra chuyện gì, và ta biết được bao
   * nhiêu"*. Tách chúng ra một cửa riêng là bắt người chơi mở hai màn hình để
   * ghép một câu trả lời.
   */
  feed?: readonly ArrivedNews[];
  knowledge?: readonly KnowledgeRow[];
  /** Vùng người chơi đang đứng (`knowledge.regionId`). */
  hereRegionId?: string;
  /**
   * CHIẾN ĐỒ — bản đồ chinh phục ba tầng. Không truyền thì tab ấy vẫn mở được,
   * chỉ là chưa có quân nào của người chơi trên đó.
   */
  campaign?: OpenCampaign;
  onOpenBattle?: () => void;
  onOpenSiege?: () => void;
  onClose: () => void;
}

type View = 'ban-do' | 'chien-do' | 'bang' | 'kinh-te' | 'ton-giao' | 'dong-thoi-gian' | 'bien-nien' | 'tri-thuc';

const VIEW_LABELS: Readonly<Record<View, string>> = {
  'ban-do': 'Bản đồ',
  'chien-do': 'Chiến đồ',
  bang: 'Bảng quốc gia',
  'kinh-te': 'Kinh tế',
  'ton-giao': 'Bản đồ tôn giáo',
  'dong-thoi-gian': 'Dòng thời gian',
  'bien-nien': 'Biên niên sử',
  'tri-thuc': 'Bản đồ tri thức',
};

/** Màu của từng tôn giáo trên bản đồ. Đủ khác nhau để đọc bằng mắt ở cỡ nhỏ. */
const FAITH_TONE: Readonly<Record<string, string>> = {
  'rel_giao-hoi': 'bg-gold/70',
  'rel_ly-giao': 'bg-moss',
  'rel_nam-phuong': 'bg-oak-light',
  'rel_da-than': 'bg-moss/50',
  'rel_da-than-baltic': 'bg-moss/70',
  'rel_thao-nguyen': 'bg-vellum/40',
  'rel_than-chien-tran': 'bg-rust/50',
  'rel_lo-ren': 'bg-oak',
  'rel_to-tien': 'bg-vellum/25',
  'rel_huyen-hoc': 'bg-plum',
  'rel_di-giao-ao-vai': 'bg-rust',
  'rel_di-giao-thanh-tay': 'bg-rust/80',
  'rel_khong-theo': 'bg-ink',
};

export function WorldScreen({
  nations,
  religions,
  economy,
  titles,
  year,
  factionId = '',
  confidence = {},
  feed = [],
  knowledge = [],
  hereRegionId = '',
  campaign,
  onOpenBattle,
  onOpenSiege,
  onClose,
}: WorldScreenProps): ReactNode {
  const [view, setView] = useState<View>('ban-do');
  const [selected, setSelected] = useState(nations.viewing === '' ? (nations.powers[0]?.id ?? '') : nations.viewing);
  /** Lớp bản đồ tôn giáo: rỗng là hiện đủ mọi tôn giáo chồng lên nhau. */
  const [layer, setLayer] = useState('');
  // Khác các bảng quốc gia (bản chụp), marker cần nghe vị trí sống để một patch
  // đổi vùng đang mở vẫn thành một hành trình, không nhảy thẳng sang đích.
  const liveRegionId = useGameStore((state) => currentRegion(state));
  const playerRegionId = liveRegionId === '' ? hereRegionId : liveRegionId;

  const power = nations.powers.find((row) => row.id === selected) ?? nations.powers[0] ?? null;

  const tierOf = useMemo(
    () =>
      (powerId: string): ReturnType<typeof accessTierFor> =>
        accessTierFor({ powerId, titles, factionId }),
    [titles, factionId],
  );

  const clarityOfPower = useMemo(
    () =>
      (powerId: string): ReturnType<typeof clarityFor> =>
        clarityFor({
          powerId,
          confidence: confidence[powerId] ?? 0,
          factionId,
          inCourt: factionId === powerId,
          neighbour: false,
        }),
    [confidence, factionId],
  );

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-ink text-parchment">
      <header className="flex items-center justify-between border-b border-oak px-4 py-2">
        <div className="flex items-baseline gap-3">
          <h2 className="text-sm uppercase tracking-widest text-vellum/70">Thế giới</h2>
          <span className="font-mono text-xs text-vellum/50">năm {String(year)}</span>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex min-w-0 items-center gap-1 overflow-x-auto">
            {(Object.keys(VIEW_LABELS) as View[]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setView(key)}
                className={`shrink-0 rounded border px-2 py-0.5 text-[11px] ${
                  view === key ? 'border-gold text-gold' : 'border-oak-light text-vellum/60'
                }`}
              >
                {VIEW_LABELS[key]}
              </button>
            ))}
          </div>
          <button type="button" onClick={onClose} className="rounded border border-oak-light px-3 py-0.5 text-xs">
            Đóng
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Cột thẻ quốc gia — LUÔN hiện đủ tám, không thẻ nào bị khóa. */}
        {view !== 'ban-do' && view !== 'chien-do' && <nav className="w-64 shrink-0 space-y-1 overflow-y-auto border-r border-oak p-2">
          {nations.powers.map((row) => {
            const clarity = clarityOfPower(row.id);
            const meta = powerRowOf(row.id);
            const style = countryStyleOf(row);
            return (
              <button
                key={row.id}
                type="button"
                onClick={() => {
                  setSelected(row.id);
                  if (view !== 'kinh-te') setView('bang');
                }}
                className={`w-full rounded border p-2 text-left ${
                  row.id === selected ? 'border-gold bg-oak/30' : 'border-oak/60 hover:bg-oak/20'
                } ${row.fallen ? 'opacity-50' : ''}`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-xs text-parchment">{powerName(row.id)}</span>
                  <span className="text-[9px] uppercase text-vellum/40">{clarity.level === 'biet-ro' ? '' : 'tin đồn'}</span>
                </div>
                <p className="truncate text-[10px] text-vellum/40" title={meta?.genre ?? ''}>
                  cấp {style.rank.rank}/6 · {style.label}
                </p>
                <p className="truncate text-[9px] text-vellum/30" title={meta?.genre ?? ''}>{meta?.genre ?? ''}</p>
                <div className="mt-1 space-y-0.5">
                  <Bar value={row.prestige} tone="bg-gold/60" title="uy tín" />
                  <Bar value={row.stability} tone={row.stability < 40 ? 'bg-rust' : 'bg-moss'} title="ổn định" />
                </div>
                {row.fallen && <p className="mt-0.5 text-[10px] text-rust">đã sụp đổ</p>}
              </button>
            );
          })}
        </nav>}

        <main className={`min-w-0 flex-1 ${view === 'ban-do' || view === 'chien-do' ? 'overflow-hidden' : 'overflow-y-auto p-3'}`}>
          {view === 'ban-do' && <MedievalMap hereRegionId={playerRegionId} />}

          {view === 'chien-do' && (
            <CampaignScreen
              initial={campaign?.campaign ?? emptyCampaign()}
              playerFactionId={campaign?.playerFactionId ?? ''}
              hereNodeId={campaign?.hereNodeId ?? ''}
              forces={campaign?.forces ?? []}
              {...(onOpenBattle === undefined ? {} : { onOpenBattle })}
              {...(onOpenSiege === undefined ? {} : { onOpenSiege })}
            />
          )}

          {view === 'bang' && power !== null && (
            <PowerPanel power={power} tier={tierOf(power.id)} clarityLevel={clarityOfPower(power.id)} />
          )}

          {view === 'kinh-te' && <EconomyPanel economy={economy} selectedPowerId={selected} />}

          {view === 'ton-giao' && (
            <section className="space-y-2">
              <div className="flex flex-wrap items-center gap-1">
                <button
                  type="button"
                  onClick={() => setLayer('')}
                  className={`rounded border px-2 py-0.5 text-[11px] ${layer === '' ? 'border-gold text-gold' : 'border-oak-light text-vellum/60'}`}
                >
                  đủ lớp
                </button>
                {[...new Set(religions.areas.flatMap((area) => area.mix.map((row) => row.religionId)))].map((id) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setLayer(id)}
                    className={`rounded border px-2 py-0.5 text-[11px] ${layer === id ? 'border-gold text-gold' : 'border-oak-light text-vellum/60'}`}
                  >
                    {id.replace('rel_', '')}
                  </button>
                ))}
              </div>

              {religions.areas.map((area) => {
                const tension = tensionOf(area);
                return (
                  <div key={area.areaId} className="rounded border border-oak/60 p-2">
                    <div className="flex items-baseline justify-between">
                      <span className="text-xs text-parchment">
                        {area.areaId.startsWith('nation_') ? powerName(area.areaId) : area.areaId}
                      </span>
                      <span className={`text-[10px] ${tension > 55 ? 'text-rust' : 'text-vellum/40'}`}>căng thẳng {String(tension)}</span>
                    </div>
                    <div className="mt-1 flex h-3 overflow-hidden rounded">
                      {area.mix.map((row) => (
                        <div
                          key={row.religionId}
                          className={`${FAITH_TONE[row.religionId] ?? 'bg-oak'} ${
                            layer === '' || layer === row.religionId ? '' : 'opacity-15'
                          }`}
                          style={{ width: `${String(row.share * 100)}%` }}
                          title={`${row.religionId} ${(row.share * 100).toFixed(1)}%`}
                        />
                      ))}
                    </div>
                    {layer !== '' && (
                      <p className="mt-0.5 font-mono text-[10px] text-vellum/50">
                        {layer.replace('rel_', '')}:{' '}
                        {((area.mix.find((row) => row.religionId === layer)?.share ?? 0) * 100).toFixed(1)}%
                      </p>
                    )}
                  </div>
                );
              })}

              {religions.echoes.length > 0 && (
                <p className="text-[11px] text-rust">
                  Khủng hoảng còn vọng: {religions.echoes.map((echo) => `${echo.triggerId} (${String(echo.yearsLeft)}n)`).join(' · ')} — dị
                  giáo đang lớn nhanh hơn thường lệ.
                </p>
              )}
            </section>
          )}

          {view === 'dong-thoi-gian' && (
            <section className="space-y-1">
              {nations.timeline.length === 0 && <p className="text-[11px] text-vellum/40">Chưa có biến cố nào được ghi.</p>}
              {[...nations.timeline]
                .reverse()
                .slice(0, 120)
                .map((event) => (
                  <div key={event.id} className="flex gap-3 border-b border-oak/30 py-1 last:border-0">
                    <span className="w-12 shrink-0 font-mono text-[11px] text-vellum/40">{String(event.year)}</span>
                    <span className={`text-xs ${event.scope === 'chau-luc' ? 'text-parchment' : 'text-vellum/60'}`}>{event.text}</span>
                  </div>
                ))}
            </section>
          )}

          {/*
            DÒNG THỜI GIAN ở trên là sự thật của Phần 14 — nó ghi mọi biến cố
            châu lục, kể cả những chuyện người chơi chưa từng nghe. BIÊN NIÊN SỬ
            ngay dưới đây là thứ NGƯỜI CHƠI ĐÃ BIẾT, kèm độ tin cậy của từng mục.
            Hai bảng cạnh nhau và cố ý lệch nhau: khoảng cách giữa chúng chính là
            cái người chơi không biết.
          */}
          {view === 'bien-nien' && <Chronicle feed={feed} />}

          {view === 'tri-thuc' && <KnowledgeMap rows={knowledge} hereRegionId={hereRegionId} />}
        </main>
      </div>
    </div>
  );
}

/**
 * MỘT BẢNG QUỐC GIA.
 *
 * `switch` trên `board.kind` là chỗ duy nhất tám thể loại gặp nhau trong UI, và
 * nó chỉ CHỌN component — không có một dòng bố cục chung nào chảy xuống tám bảng,
 * vì mục 10.5 cấm đúng chuyện đó.
 */
function PowerPanel({
  power,
  tier,
  clarityLevel,
}: {
  power: PowerState;
  tier: ReturnType<typeof accessTierFor>;
  clarityLevel: ReturnType<typeof clarityFor>;
}): ReactNode {
  const meta = powerRowOf(power.id);
  const clarity = clarityLevel.level;
  const style = countryStyleOf(power);
  const support = countryRankSupportOf(power);
  const effects = countryRankEffectiveEffects(power);
  const nextRank = nextCountryRankOf(power);

  return (
    <section className="space-y-3">
      <header className="flex items-start justify-between gap-3 border-b border-oak pb-2">
        <div>
          <h3 className="text-sm text-parchment">{powerName(power.id)}</h3>
          <p className="text-[11px] text-gold/80">
            cấp quốc gia {style.rank.rank}/6 · {style.label}
            {power.rankDisputed ? ' · ĐỊA VỊ ĐANG BỊ TRANH CHẤP' : ''}
          </p>
          <p className="text-[11px] italic text-vellum/50">{meta?.genre ?? ''}</p>
          {meta?.threat !== undefined && meta.threat !== '' && (
            <p className="text-[10px] text-vellum/40">mối đe dọa lớn nhất: {meta.threat}</p>
          )}
        </div>
        <TierBadge tier={tier} clarityLabel={clarityLevel.label} />
      </header>

      <details className="rounded border border-gold/30 bg-oak/10 px-3 py-2" open>
        <summary className="cursor-pointer list-none">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs text-parchment">Địa vị pháp lý & thể chế</p>
              <p className="text-[10px] text-vellum/50">
                {style.form.name} · người đứng đầu: {style.rulerTitle} · kính xưng: {style.address}
              </p>
            </div>
            <span className="rounded border border-oak-light px-1.5 py-0.5 text-[9px] text-gold/80">
              từ năm {power.rankSinceYear}
            </span>
          </div>
        </summary>
        <div className="mt-2 space-y-2 border-t border-oak/60 pt-2">
          <div>
            <div className="mb-0.5 flex justify-between text-[10px] text-vellum/50">
              <span>Nền tảng giữ cấp</span>
              <span>{support.value}/100</span>
            </div>
            <Bar value={support.value} tone={support.value < 70 ? 'bg-rust' : 'bg-gold/70'} title="độ vững của cấp quốc gia" />
          </div>
          <p className="text-[10px] leading-relaxed text-vellum/55">{style.basis || style.form.note}</p>
          <div className="grid gap-2 md:grid-cols-2">
            <div className="rounded border border-oak/50 p-2">
              <p className="text-[9px] uppercase tracking-wide text-vellum/40">Quyền do cấp mang lại</p>
              <p className="mt-1 text-[10px] leading-relaxed text-emerald-200/70">{style.rank.rights.join(' · ')}</p>
            </div>
            <div className="rounded border border-oak/50 p-2">
              <p className="text-[9px] uppercase tracking-wide text-vellum/40">Gánh nặng của cấp</p>
              <p className="mt-1 text-[10px] leading-relaxed text-amber-200/70">{style.rank.burdens.join(' · ')}</p>
            </div>
          </div>
          <p className="text-[10px] text-vellum/45">
            Hiệu lực hiện tại: sức nặng ngoại giao +{effects.diplomaticWeight.toFixed(1)} · chỉ huy chiến tranh +{effects.militaryCommandBonus.toFixed(1)} · thuế ×{effects.taxFactor.toFixed(2)} · hành chính ×{effects.administrationFactor.toFixed(2)} · thương mại ×{effects.tradeFactor.toFixed(2)} · tối đa {effects.treatyCapacity} cam kết và {effects.vassalCapacity} chư hầu phụ thuộc.
          </p>
          <details>
            <summary className="cursor-pointer text-[10px] text-vellum/45">Cấp này đứng vững nhờ đâu?</summary>
            <div className="mt-1 grid gap-1 sm:grid-cols-2">
              {support.lines.map((line) => (
                <div key={line.label} className="flex justify-between gap-2 text-[10px]">
                  <span className={line.met ? 'text-vellum/55' : 'text-rust'}>{line.label}</span>
                  <span className="font-mono text-parchment">{line.value}/{line.required}</span>
                </div>
              ))}
            </div>
          </details>
          {nextRank !== null && (
            <p className="text-[10px] text-vellum/45">
              Cấp kế: {nextRank.name} — cần đất {nextRank.minLand}, uy tín {nextRank.minPrestige}, ổn định {nextRank.minStability}, gắn kết {nextRank.minCohesion}, người trị vì có tước cá nhân bậc {nextRank.minRulerTitleRank}; lễ tuyên xưng tốn {nextRank.elevationTreasury} đồng và {nextRank.elevationPrestige} uy tín.
            </p>
          )}
        </div>
      </details>

      <div className="grid grid-cols-4 gap-2 text-[11px]">
        {(
          [
            ['ngân khố', power.treasury, 'money'],
            ['thu nhập', power.income, 'money'],
            ['uy tín', power.prestige, 'meter'],
            ['ổn định', power.stability, 'meter'],
            ['gắn kết', power.cohesion, 'meter'],
            ['quân sự', power.military, 'meter'],
            ['đất', power.land, 'meter'],
            ['tâm trạng tộc chủ', power.dominantMood, 'meter'],
          ] as const
        ).map(([label, value, scale]) => (
          <div key={label} className="rounded border border-oak/50 px-2 py-1">
            <p className="text-[10px] uppercase tracking-wide text-vellum/40">{label}</p>
            <Fog value={value} clarity={clarity} scale={scale} />
          </div>
        ))}
      </div>

      {/* Bảng dân số — hệ thống BẮT BUỘC của mục 3, chung cho cả tám thế lực. */}
      <div className="rounded border border-oak/60 p-2">
        <p className="mb-1 text-[10px] uppercase tracking-wide text-vellum/40">Thành phần dân cư và chính sách</p>
        {power.groups.map((group) => (
          <div key={group.raceId} className="mb-1 grid grid-cols-[8rem_3rem_1fr_5rem] items-center gap-2 text-[11px]">
            <span className="truncate text-parchment">{group.raceId.replace('race_', '')}</span>
            <span className="font-mono text-vellum/60">{(group.population * 100).toFixed(1)}%</span>
            <Bar value={group.grievance} tone={group.grievance > 60 ? 'bg-rust' : 'bg-oak-light'} title={`oán hận ${String(Math.round(group.grievance))}`} />
            <span className={`text-right ${group.status === 'truy-buc' ? 'text-rust' : 'text-vellum/50'}`}>{group.status}</span>
          </div>
        ))}
      </div>

      {/* TÁM BẢNG, TÁM GIAO DIỆN. */}
      {power.board.kind === 'quan-doan' && (
        <OttomanBoard board={power.board} tier={tier} clarity={clarity} arrears={power.board.arrearYears} />
      )}
      {power.board.kind === 'noi-chien' && <ByzantiumBoard board={power.board} tier={tier} clarity={clarity} land={power.land} />}
      {power.board.kind === 'lien-bang' && <SwissBoard board={power.board} tier={tier} clarity={clarity} />}
      {power.board.kind === 'cong-nap' && <HordeBoard board={power.board} tier={tier} clarity={clarity} />}
      {power.board.kind === 'cai-cach' && <HreBoard board={power.board} tier={tier} clarity={clarity} />}
      {power.board.kind === 'tap-quyen' && <FranceBoard board={power.board} tier={tier} clarity={clarity} />}
      {power.board.kind === 'mat-nghi' && <PapacyBoard board={power.board} tier={tier} clarity={clarity} />}
      {power.board.kind === 'ngan-hang' && <LatinBoard board={power.board} tier={tier} clarity={clarity} />}
    </section>
  );
}
