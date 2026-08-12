/**
 * CÁC BẢNG CỦA MÀN HÌNH LÃNH THỔ — Phần 13 mục 11.
 *
 * Sáu thứ mục 11 đòi, và mỗi thứ một bảng ở đây:
 *   1. bản đồ vùng theo province, tô màu theo chủ / bất ổn / phát triển
 *   2. bảng chư hầu: lòng trung, sức mạnh, yêu sách, mối hận, THANH CẢNH BÁO
 *   3. sổ nghĩa vụ: mình nợ ai, ai nợ mình, hạn chót
 *   4. tòa án: danh sách vụ đang chờ
 *   5. cây gia tộc và thứ tự kế vị
 *   6. triều đình: ai giữ ghế nào, ghế nào bỏ trống
 *
 * GIỌNG CỦA TẦNG NÀY LÀ GIỌNG ƯỚC CHỪNG (Phụ lục A mục 6). Mọi con số về người ở
 * đây đều đi kèm chữ "ước chừng" hoặc "chừng", và đơn vị là TỈNH · PHẦN TRĂM ·
 * NGÀY ĐƯỜNG · ĐIỂM BẤT ỔN — không bao giờ là ô đất, giạ lúa, hay tên một công
 * trình cụ thể (Phụ lục A mục 5).
 */

import type { ReactNode } from 'react';
import {
  banditryBandFor,
  daysRide,
  households,
  levyEstimate,
  powerOf,
  provinceName,
  rebellionRisk,
  roadLevelOf,
  terrainOf,
  unrestBandFor,
  vassalCapOf,
  type CourtCase,
  type Faction,
  type Province,
  type Vassal,
} from '@/systems/realm';
import { factionMemberRankOf, factionOrganizationTierOf } from '@/systems/factions';
import { caseTypeOf } from '@/systems/realm';
import { courtSeatsFor, heirLine, rankOf, titleName, type HeldTitle, type Kin, type SuccessionLaw } from '@/systems/titles';
import type { CourtAppointment } from '@/systems/realm';

function Row({ label, value, tone }: { label: string; value: string; tone?: string }): ReactNode {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-vellum/60">{label}</span>
      <span className={`truncate font-mono text-xs ${tone ?? 'text-parchment'}`} title={value}>
        {value}
      </span>
    </div>
  );
}

function Bar({ value, tone }: { value: number; tone: string }): ReactNode {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded bg-ink">
      <div className={`h-full ${tone}`} style={{ width: `${String(Math.max(0, Math.min(100, value)))}%` }} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// 1. Bản đồ vùng
// ---------------------------------------------------------------------------

export type MapShading = 'chu-so-huu' | 'bat-on' | 'phat-trien';

export interface ProvinceMapProps {
  provinces: readonly Province[];
  shading: MapShading;
  selected: string;
  onSelect: (id: string) => void;
  onShading: (mode: MapShading) => void;
  /** Tên chủ sở hữu theo id chư hầu — rỗng nghĩa là chính người chơi trực trị. */
  holderNames: Readonly<Record<string, string>>;
}

const SHADING_LABELS: Readonly<Record<MapShading, string>> = {
  'chu-so-huu': 'chủ sở hữu',
  'bat-on': 'bất ổn',
  'phat-trien': 'phát triển',
};

/**
 * BẢN ĐỒ VÙNG — theo TỈNH, và KHÔNG CÓ LƯỚI Ô NÀO (mục 6).
 *
 * Mỗi tỉnh là một thẻ, không phải một ô vuông trên lưới: lưới ô là ngôn ngữ của
 * thành trì, và dùng lại nó ở đây là mời người chơi tin rằng một tỉnh cũng đặt
 * được công trình lên.
 */
export function ProvinceMap({
  provinces,
  shading,
  selected,
  onSelect,
  onShading,
  holderNames,
}: ProvinceMapProps): ReactNode {
  const tint = (province: Province): string => {
    if (shading === 'bat-on') {
      const band = unrestBandFor(province.unrest).id;
      if (band === 'khoi-nghia' || band === 'loan-nho') return 'border-blood bg-blood/20';
      if (band === 'bat-on') return 'border-blood/50 bg-blood/10';
      return 'border-oak-light bg-oak';
    }
    if (shading === 'phat-trien') {
      if (province.development >= 55) return 'border-brass bg-brass/15';
      if (province.development >= 40) return 'border-brass/50 bg-brass/5';
      return 'border-oak-light bg-oak';
    }
    return province.holderId === ''
      ? 'border-brass bg-brass/10'
      : 'border-oak-light bg-oak';
  };

  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline gap-2">
        <h3 className="text-xs tracking-[0.2em] text-brass uppercase">Bản đồ vùng</h3>
        <span className="text-[10px] text-vellum/50">tô màu theo</span>
        {(Object.keys(SHADING_LABELS) as MapShading[]).map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => onShading(mode)}
            className={`rounded border px-2 py-0.5 text-[10px] ${
              mode === shading ? 'border-brass text-brass' : 'border-oak-light text-vellum/70'
            }`}
          >
            {SHADING_LABELS[mode]}
          </button>
        ))}
      </div>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {provinces.map((province) => (
          <button
            key={province.id}
            type="button"
            onClick={() => onSelect(province.id)}
            className={`flex flex-col gap-1 rounded border p-2 text-left ${tint(province)} ${
              province.id === selected ? 'ring-1 ring-brass' : ''
            }`}
          >
            <span className="text-sm text-parchment">{provinceName(province)}</span>
            <span className="text-[10px] text-vellum/60">
              {terrainOf(province.terrain)?.name ?? province.terrain} · chừng {String(daysRide(province))} ngày ngựa ·{' '}
              {roadLevelOf(province.roads).name.toLowerCase()}
            </span>
            <span className="text-[10px] text-vellum/60">
              ước chừng {households(province).toLocaleString('vi-VN')} hộ · gọi được chừng{' '}
              {levyEstimate(province).toLocaleString('vi-VN')} quân
            </span>
            <div className="mt-1 flex items-center gap-2">
              <span className="w-16 shrink-0 text-[10px] text-vellum/50">phát triển</span>
              <Bar value={province.development} tone="bg-brass/70" />
            </div>
            <div className="flex items-center gap-2">
              <span className="w-16 shrink-0 text-[10px] text-vellum/50">bất ổn</span>
              <Bar value={province.unrest} tone="bg-blood/70" />
            </div>
            <span className="text-[10px] text-vellum/50">
              {unrestBandFor(province.unrest).name} · cướp bóc: {banditryBandFor(province.banditry).name.toLowerCase()} ·{' '}
              {province.holderId === '' ? 'ngài trực trị' : (holderNames[province.holderId] ?? 'một chư hầu')}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// 2. Bảng chư hầu
// ---------------------------------------------------------------------------

export interface VassalPanelProps {
  vassals: readonly Vassal[];
  factions: readonly Faction[];
  /** Chính danh của lãnh chúa — vế thứ tư của công thức nguy cơ (mục 7). */
  legitimacy: number;
  titleId: string;
  onPersuade?: (npcId: string) => void;
  onGift?: (npcId: string) => void;
}

/**
 * BẢNG CHƯ HẦU, có THANH CẢNH BÁO NGUY CƠ NỔI LOẠN (mục 11).
 *
 * Thanh cảnh báo không phải trang trí: mục 7 đòi nổi loạn là mối đe dọa THƯỜNG
 * TRỰC, và một mối đe dọa thường trực mà người chơi không nhìn thấy đang lớn dần
 * thì nó chỉ là một cú đánh úp.
 */
export function VassalPanel({ vassals, factions, legitimacy, titleId, onPersuade, onGift }: VassalPanelProps): ReactNode {
  const cap = vassalCapOf(titleId);
  const rebels = vassals.filter((vassal) => vassal.rebelling).length;

  if (cap === 0) {
    return (
      <section className="flex flex-col gap-1">
        <h3 className="text-xs tracking-[0.2em] text-brass uppercase">Chư hầu</h3>
        <p className="text-sm text-vellum/50 italic">
          {titleName(titleId)} chưa có chư hầu riêng. Bá tước là bậc đầu tiên có (mục 2).
        </p>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <h3 className="text-xs tracking-[0.2em] text-brass uppercase">Chư hầu</h3>
        <span className="text-[10px] text-vellum/50">
          {String(vassals.length)}/{String(cap)} chỗ{rebels > 0 ? ` · ${String(rebels)} đang phản` : ''}
        </span>
      </div>

      {vassals.length === 0 && <p className="text-sm text-vellum/50 italic">Chưa ai thề với ngài.</p>}

      {factions.map((faction) => {
        const tier = factionOrganizationTierOf(faction.tierId);
        const leader = vassals.find((vassal) => vassal.npcId === faction.leaderId);
        return (
          <details key={faction.id} className="rounded border border-blood/45 bg-blood/5 px-2.5 py-2" open>
            <summary className="cursor-pointer list-none">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm text-red-100">{faction.name}</p>
                  <p className="text-[10px] text-vellum/55">
                    cấp tổ chức {tier.rank}/4 · {tier.name} · {faction.members.length} người
                  </p>
                </div>
                <span className="rounded border border-blood/40 px-1.5 py-0.5 text-[9px] text-red-200">
                  ảnh hưởng {Math.round(faction.influence)}/100
                </span>
              </div>
            </summary>
            <div className="mt-2 space-y-1 border-t border-blood/20 pt-2">
              <Row label="Thủ lĩnh" value={leader?.name ?? 'chưa rõ'} />
              <Row label="Cố kết" value={`${String(Math.round(faction.cohesion))}/100`} />
              <p className="text-[10px] leading-relaxed text-vellum/55">{tier.description}</p>
              <p className="text-[10px] leading-relaxed text-red-200/70">Yêu sách: {faction.demand}</p>
            </div>
          </details>
        );
      })}

      {vassals.map((vassal) => {
        const faction = factions.find((entry) => entry.id === vassal.factionId) ?? null;
        const risk = rebellionRisk(vassal, legitimacy, rebels, faction);
        const factionRank = faction === null ? null : factionMemberRankOf(faction.memberRanks[vassal.npcId] ?? 'thanh-vien-tuyen-the');
        return (
          <div
            key={vassal.npcId}
            className={`flex flex-col gap-1 rounded border p-2 ${
              vassal.rebelling ? 'border-blood bg-blood/10' : 'border-oak-light'
            }`}
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm text-parchment">{vassal.name}</span>
              <span className="text-[10px] text-vellum/50">{titleName(vassal.titleId)}</span>
            </div>

            <div className="flex items-center gap-2">
              <span className="w-20 shrink-0 text-[10px] text-vellum/50">lòng trung</span>
              <Bar value={vassal.loyalty} tone={vassal.loyalty < 25 ? 'bg-blood' : 'bg-brass/70'} />
              <span className="w-8 shrink-0 text-right font-mono text-[10px] text-parchment">
                {String(Math.round(vassal.loyalty))}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-20 shrink-0 text-[10px] text-vellum/50">sức mạnh</span>
              <Bar value={powerOf(vassal)} tone="bg-parchment/50" />
              <span className="w-8 shrink-0 text-right font-mono text-[10px] text-parchment">
                {String(powerOf(vassal))}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-20 shrink-0 text-[10px] text-vellum/50">nguy cơ phản</span>
              <Bar value={risk.risk} tone={risk.risk > 50 ? 'bg-blood' : 'bg-blood/50'} />
              <span className="w-8 shrink-0 text-right font-mono text-[10px] text-parchment">
                {String(risk.risk)}%
              </span>
            </div>

            {vassal.rebelling && <p className="text-[10px] text-blood">ĐANG NỔI LOẠN.</p>}

            {faction !== null && factionRank !== null && (
              <p className="text-[10px] text-red-200/70">
                {factionRank.name} trong {faction.name}
                {faction.leaderId === vassal.npcId ? ' · giữ quyền đặt yêu sách và điều phối phe' : ''}.
              </p>
            )}

            {vassal.claims.length > 0 && (
              <p className="text-[10px] text-vellum/60">Yêu sách: {vassal.claims.join(', ')}.</p>
            )}
            {vassal.grievances.length > 0 && (
              <p className="text-[10px] text-vellum/60">
                Mối hận đang ôm: {vassal.grievances.map((row) => `${row.reason} (${String(row.year)})`).join('; ')}.
              </p>
            )}
            <p className="text-[10px] text-vellum/40">
              Nợ ngài: {String(vassal.obligations.levyDays)} ngày quân dịch, {String(Math.round(vassal.obligations.tax * 100))}% thuế,{' '}
              {String(vassal.obligations.courtAttendance)} lần chầu mỗi năm.
            </p>

            <div className="flex gap-1.5">
              {onPersuade !== undefined && (
                <button
                  type="button"
                  onClick={() => onPersuade(vassal.npcId)}
                  className="rounded border border-oak-light px-2 py-0.5 text-[10px] text-vellum hover:bg-oak-light"
                >
                  Thuyết phục
                </button>
              )}
              {onGift !== undefined && (
                <button
                  type="button"
                  onClick={() => onGift(vassal.npcId)}
                  className="rounded border border-oak-light px-2 py-0.5 text-[10px] text-vellum hover:bg-oak-light"
                >
                  Ban quà
                </button>
              )}
            </div>
          </div>
        );
      })}
    </section>
  );
}

// ---------------------------------------------------------------------------
// 3. Sổ nghĩa vụ
// ---------------------------------------------------------------------------

export interface ObligationLedgerProps {
  titles: readonly HeldTitle[];
  vassals: readonly Vassal[];
  year: number;
}

/**
 * SỔ NGHĨA VỤ: MÌNH NỢ AI, AI NỢ MÌNH, HẠN CHÓT (mục 11).
 *
 * Hai cột, và cột trái là cột hay bị quên: mọi game đều cho người chơi đòi chư
 * hầu, ít game bắt người chơi trả nợ. Mục 7 nói thẳng — không làm tròn thì bị
 * kiện, bị phạt, bị tước đất.
 */
export function ObligationLedger({ titles, vassals, year }: ObligationLedgerProps): ReactNode {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-xs tracking-[0.2em] text-brass uppercase">Sổ nghĩa vụ</h3>

      <div className="rounded border border-oak-light p-2">
        <p className="mb-1 text-[10px] tracking-widest text-vellum/40 uppercase">Ngài nợ</p>
        {titles.length === 0 && <p className="text-sm text-vellum/50 italic">Không nợ ai cả.</p>}
        {titles.map((title) => (
          <div key={title.fiefId} className="mb-1 flex flex-col">
            <Row
              label={title.fiefName}
              value={`${String(title.obligations.tribute)} đồng · ${String(title.obligations.levyDays)} ngày · ${String(title.obligations.courtDays)} lần chầu`}
              tone={title.obligations.arrearsYears > 0 ? 'text-blood' : 'text-parchment'}
            />
            <span className="text-[10px] text-vellum/40">
              thề với {title.liege === '' ? 'vương quyền, không qua ai' : title.liege} ·{' '}
              {title.obligations.paidThisYear ? 'đã nộp năm nay' : 'CHƯA nộp năm nay'}
              {title.obligations.arrearsYears > 0 ? ` · nợ ${String(title.obligations.arrearsYears)} năm` : ''}
              {title.termEndsYear > 0 ? ` · hết nhiệm kỳ năm ${String(title.termEndsYear)}` : ''}
            </span>
          </div>
        ))}
      </div>

      <div className="rounded border border-oak-light p-2">
        <p className="mb-1 text-[10px] tracking-widest text-vellum/40 uppercase">Nợ ngài</p>
        {vassals.length === 0 && <p className="text-sm text-vellum/50 italic">Chưa ai nợ ngài gì.</p>}
        {vassals.map((vassal) => (
          <Row
            key={vassal.npcId}
            label={vassal.name}
            value={`${String(vassal.obligations.levyDays)} ngày · ${String(Math.round(vassal.obligations.tax * 100))}% · ${String(vassal.obligations.courtAttendance)} lần chầu`}
            tone={vassal.rebelling ? 'text-blood' : 'text-parchment'}
          />
        ))}
      </div>

      <p className="text-[10px] text-vellum/40">Năm {String(year)}. Hạn chót là cuối năm, và nợ hai năm là bị gọi ra hầu tòa.</p>
    </section>
  );
}

// ---------------------------------------------------------------------------
// 4. Tòa án
// ---------------------------------------------------------------------------

export interface CourtDocketProps {
  cases: readonly CourtCase[];
  onOpen: (caseId: string) => void;
}

export function CourtDocket({ cases, onOpen }: CourtDocketProps): ReactNode {
  const waiting = cases.filter((row) => row.verdictId === '');

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <h3 className="text-xs tracking-[0.2em] text-brass uppercase">Tòa án</h3>
        <span className="text-[10px] text-vellum/50">{String(waiting.length)} vụ đang chờ</span>
      </div>

      {waiting.length === 0 && <p className="text-sm text-vellum/50 italic">Không vụ nào đang chờ phán quyết.</p>}

      {waiting.map((row) => (
        <button
          key={row.id}
          type="button"
          onClick={() => onOpen(row.id)}
          className="flex flex-col rounded border border-oak-light p-2 text-left hover:bg-oak-light"
        >
          <span className="text-sm text-parchment">{caseTypeOf(row.caseTypeId)?.name ?? row.caseTypeId}</span>
          <span className="text-[10px] text-vellum/60">{row.summary}</span>
          <span className="text-[10px] text-vellum/40">
            mở năm {String(row.openedYear)}
            {row.bothRefuse ? ' · CẢ HAI BÊN KHÔNG PHỤC' : ''}
          </span>
        </button>
      ))}
    </section>
  );
}

// ---------------------------------------------------------------------------
// 5. Cây kế vị
// ---------------------------------------------------------------------------

export interface SuccessionTreeProps {
  family: Readonly<Record<string, Kin>>;
  law: SuccessionLaw;
  designated: string;
}

/**
 * CÂY GIA TỘC VÀ THỨ TỰ KẾ VỊ, HIỆN RÕ AI SẼ NỐI NGHIỆP (mục 11).
 *
 * "Hiện rõ" là yêu cầu thật: người thừa kế là nhân vật NGƯỜI CHƠI SẼ CHƠI TIẾP
 * (mục 9), nên biết trước đó là ai làm đổi cả cách chơi mười năm cuối đời.
 */
export function SuccessionTree({ family, law, designated }: SuccessionTreeProps): ReactNode {
  const line = heirLine(family, law, { designated });

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <h3 className="text-xs tracking-[0.2em] text-brass uppercase">Thứ tự kế vị</h3>
        <span className="text-[10px] text-vellum/50">{law.name.toLowerCase()}</span>
      </div>

      {law.kind !== 'the-tap' && (
        <p className="text-[10px] text-vellum/60">
          Thang này không thế tập: khi ngài chết sẽ có {law.kind === 'thach-dau' ? 'một cuộc thách đấu' : 'một cuộc bầu'},
          và hàng huyết thống không quyết định gì cả.
        </p>
      )}

      {line.length === 0 && (
        <p className="text-sm text-blood italic">Không còn ai trong hàng. Ngài chết là khủng hoảng kế vị.</p>
      )}

      <ol className="flex flex-col gap-1">
        {line.slice(0, 8).map((heir, index) => (
          <li
            key={heir.id}
            className={`flex items-baseline justify-between gap-2 rounded border px-2 py-1 ${
              index === 0 ? 'border-brass bg-brass/10' : 'border-oak-light'
            }`}
          >
            <span className="text-sm text-parchment">
              {index === 0 ? '★ ' : `${String(index + 1)}. `}
              {heir.name}
            </span>
            <span className="text-[10px] text-vellum/50">
              {heir.reason} · {String(heir.age)} tuổi
            </span>
          </li>
        ))}
      </ol>

      <p className="text-[10px] text-vellum/40">
        Người nối nghiệp kế thừa ĐẤT và TƯỚC, KHÔNG kế thừa kỹ năng và quan hệ (mục 9).
      </p>
    </section>
  );
}

// ---------------------------------------------------------------------------
// 6. Triều đình
// ---------------------------------------------------------------------------

export interface CourtPanelProps {
  court: readonly CourtAppointment[];
  titleId: string;
}

export function CourtPanel({ court, titleId }: CourtPanelProps): ReactNode {
  const seats = courtSeatsFor(rankOf(titleId));
  if (seats.length === 0) {
    return (
      <section className="flex flex-col gap-1">
        <h3 className="text-xs tracking-[0.2em] text-brass uppercase">Triều đình</h3>
        <p className="text-sm text-vellum/50 italic">{titleName(titleId)} chưa có triều đình.</p>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-xs tracking-[0.2em] text-brass uppercase">Triều đình</h3>
      {seats.map((seat) => {
        const holder = court.find((row) => row.seatId === seat.id);
        return (
          <div key={seat.id} className="flex flex-col rounded border border-oak-light p-2">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm text-parchment">{seat.name}</span>
              <span className="text-[10px] text-vellum/50">{seat.brief.toLowerCase()}</span>
            </div>
            {holder === undefined ? (
              <span className="text-[10px] text-blood">Bỏ trống — tự ngài lo, và ngài lo tệ hơn.</span>
            ) : (
              <>
                <span className="text-[10px] text-vellum/60">
                  {holder.name} · năng lực {String(holder.skill)} · lòng trung {String(holder.loyalty)}
                </span>
                {holder.caughtSkimming && <span className="text-[10px] text-blood">Đã bị bắt quả tang ăn chặn.</span>}
              </>
            )}
          </div>
        );
      })}
    </section>
  );
}
