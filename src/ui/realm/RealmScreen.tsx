/**
 * MÀN HÌNH LÃNH THỔ — Phần 13 mục 11.
 *
 * LUẬT QUAN TRỌNG NHẤT CỦA MÀN HÌNH NÀY, và nó là một câu trong mục 11:
 *
 * > "Bảng trạng thái ĐỔI THEO TƯỚC VỊ đang giữ, đúng mục 4. Tước nào chưa đạt thì
 * > bảng đó KHÔNG TỒN TẠI, không phải hiện ra rồi khóa."
 *
 * Nên màn hình này KHÔNG có một cây JSX cố định với vài chỗ `disabled`. Nó đọc
 * `panelFor(titleId)` từ `data/titles.json` và dựng đúng những mục mà bậc ấy mở
 * ra. Một Hiệp sĩ mở màn hình này sẽ thấy sổ tùy tùng và nợ — không thấy ô thuế
 * suất bị làm mờ, vì với một hiệp sĩ thì thuế suất không phải một thứ bị khóa,
 * nó là một thứ KHÔNG TỒN TẠI.
 *
 * Người chơi giữ NHIỀU TƯỚC ở NHIỀU THANG (mục 3) → thanh tab trên cùng chuyển
 * giữa các bảng, và mỗi tab là một tờ giấy khác nhau với nghĩa vụ khác nhau.
 *
 * MÀN HÌNH KHÔNG GHI STORE GIỮA CHỪNG, cùng luật với Phần 9–12: mọi thay đổi tích
 * trong state cục bộ, và chỉ khi bấm "Chốt" thì cả lô mới đi qua MVU một lần với
 * actor `engine`.
 */

import { useMemo, useRef, useState, type ReactNode } from 'react';
import { addMonths, type GameDate } from '@/core/clock';
import { createRngHub, type RngHub } from '@/core/rng';
import { applyPatch } from '@/state/mvu';
import type { PatchOp } from '@/state/mvu-parse';
import { useGameStore } from '@/state/store';
import { characterOf } from '@/systems/character';
import {
  REALM_STREAM,
  adjustVassalLoyalty,
  advanceRealmYear,
  applyOneOffLaw,
  applyDuelVerdict,
  callHost,
  canIssue,
  canStart,
  courtEffects,
  giftCost,
  applyLoyaltyEvent,
  issueLaw,
  judge,
  judicialDuelRequest,
  lawOf,
  lawLabel,
  lawsAvailable,
  persuade,
  projectsAvailable,
  provinceName,
  rateLabel,
  repealLaw,
  setRate,
  startProject,
  taxGroups,
  verdictOptions,
  type Province,
  type RealmSliceState,
  type VassalsSliceState,
} from '@/systems/realm';
import {
  legitimacyLabel,
  panelFor,
  rankOf,
  successionLawFor,
  titleName,
  type HeldTitle,
  type Kin,
} from '@/systems/titles';
import {
  advanceMilitaryMonth,
  recruitUnit,
  setForceSupplyPolicy,
  setSupplyRoute,
  type RationPolicy,
  type TransportMode,
  type MilitaryResources,
  type MilitarySliceState,
  type RecruitmentOption,
} from '@/systems/military';
import { CourtDocket, CourtPanel, ObligationLedger, ProvinceMap, SuccessionTree, VassalPanel, type MapShading } from './RealmPanels';
import { MilitaryPanel } from './MilitaryPanel';

export interface RealmScreenProps {
  realm: RealmSliceState;
  vassals: VassalsSliceState;
  titles: readonly HeldTitle[];
  date: GameDate;
  military: MilitarySliceState;
  militaryResources: MilitaryResources;
  onClose: () => void;
  /** Cửa sang Phần 9. Không truyền thì lời yêu cầu chỉ vào nhật ký. */
  onJudicialDuel?: (
    request: ReturnType<typeof judicialDuelRequest>,
    onResult: (winnerId: string) => void,
  ) => void;
}

export function RealmScreen({
  realm: initialRealm,
  vassals: initialVassals,
  titles: initialTitles,
  date: startDate,
  military: initialMilitary,
  militaryResources,
  onClose,
  onJudicialDuel,
}: RealmScreenProps): ReactNode {
  const [realm, setRealm] = useState<RealmSliceState>(initialRealm);
  const [vassals, setVassals] = useState<VassalsSliceState>(initialVassals);
  const [titles, setTitles] = useState<HeldTitle[]>([...initialTitles]);
  const [date, setDate] = useState<GameDate>(startDate);
  const [military, setMilitary] = useState<MilitarySliceState>(initialMilitary);
  const [viewing, setViewing] = useState(initialTitles[0]?.fiefId ?? '');
  const [shading, setShading] = useState<MapShading>('bat-on');
  const [province, setProvince] = useState(initialRealm.provinces[0]?.id ?? '');
  const [openCaseId, setOpenCaseId] = useState('');
  const [log, setLog] = useState<string[]>([]);
  const [committed, setCommitted] = useState(false);
  const rngHubRef = useRef<RngHub | null>(null);
  if (rngHubRef.current === null) {
    const snapshot = useGameStore.getState().snapshot();
    rngHubRef.current = createRngHub(snapshot.meta.seed, snapshot.meta.rng);
  }

  const family = useGameStore((state) => characterOf(state)?.family ?? {}) as Readonly<Record<string, Kin>>;

  // Tước ĐANG MỞ. Nhiều tước ở nhiều thang là chuyện thường ở tầng cao (mục 3),
  // nên "bảng của ngài" là một câu hỏi phải chọn câu trả lời.
  const title = titles.find((row) => row.fiefId === viewing) ?? titles[0] ?? null;
  const rank = title === null ? 0 : rankOf(title.titleId);
  const panel = useMemo(() => (title === null ? null : panelFor(title.titleId)), [title]);
  const selected = realm.provinces.find((row) => row.id === province) ?? realm.provinces[0] ?? null;

  const say = (...lines: string[]): void => {
    setLog((rows) => [...lines.filter((line) => line !== ''), ...rows].slice(0, 80));
    setCommitted(false);
  };

  if (title === null || panel === null) {
    return (
      <div className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-3 bg-ink text-parchment">
        <p className="text-sm text-vellum/70">
          Ngài là thường dân. Không có bảng trạng thái cai trị nào — và đó không phải một bảng bị khóa.
        </p>
        <button type="button" onClick={onClose} className="rounded border border-oak-light px-3 py-1 text-xs">
          Đóng
        </button>
      </div>
    );
  }

  const has = (id: string): boolean => panel.actions.some((action) => action.id === id);
  const sectionShown = (id: string): boolean => panel.sections.some((section) => section.id === id);

  /** Dòng xúc sắc RIÊNG của tầng cai trị, sống suốt phiên mở màn hình (R3). */
  const rngFor = (): ReturnType<ReturnType<typeof createRngHub>['stream']> => {
    return rngHubRef.current!.stream(REALM_STREAM);
  };

  // -------------------------------------------------------------------------
  // Hành động
  // -------------------------------------------------------------------------

  const runYear = (): void => {
    const snapshot = useGameStore.getState().snapshot();
    let monthlyMilitary = military;
    let monthlyTreasury = realm.treasury;
    const militaryLines: string[] = [];
    for (let month = 0; month < 12; month++) {
      const advanced = advanceMilitaryMonth(monthlyMilitary, monthlyTreasury, {
        resources: militaryResources,
        date: addMonths(date, month),
      });
      monthlyMilitary = advanced.military;
      monthlyTreasury = advanced.treasury;
      militaryLines.push(...advanced.lines.filter((line) => !line.includes('không có biến động')));
    }
    const report = advanceRealmYear(rngFor(), {
      realm: { ...realm, treasury: monthlyTreasury },
      vassals,
      titles,
      year: date.year,
      ruleSkill: 10 + Math.round((characterOf(snapshot)?.stats.int ?? 10) / 2),
      state: snapshot,
    });
    setRealm(report.realm);
    setVassals(report.vassals);
    setTitles(report.titles);
    setMilitary(monthlyMilitary);
    setDate(addMonths(date, 12));
    say(`── NĂM ${String(date.year)} ──`, ...militaryLines, ...report.lines);
  };

  const runMonth = (): void => {
    const report = advanceMilitaryMonth(military, realm.treasury, { resources: militaryResources, date });
    setMilitary(report.military);
    setRealm((current) => ({ ...current, treasury: report.treasury }));
    setDate(addMonths(date, 1));
    say(`── THÁNG ${String(date.month)}/${String(date.year)} ──`, ...report.lines);
  };

  const recruit = (option: RecruitmentOption, companies: number, destinationId: string): void => {
    const result = recruitUnit(military, realm.treasury, militaryResources, {
      typeId: option.type.id,
      source: option.source,
      companies,
      destinationId,
      requestedBy: 'player',
      date,
    });
    if (result.ok) {
      setMilitary(result.military);
      setRealm((current) => ({ ...current, treasury: result.treasury }));
    }
    say(result.line);
  };

  const changeSupplyPolicy = (forceId: string, ration: RationPolicy, priority: number): void => {
    setMilitary((current) => setForceSupplyPolicy(current, forceId, ration, priority));
    say(`Đã đổi cấp phát cho ${forceId}: khẩu phần ${ration}, ưu tiên ${String(priority)}.`);
  };

  const changeSupplyRoute = (routeId: string, depotId: string, mode: TransportMode, active: boolean): void => {
    setMilitary((current) => setSupplyRoute(current, routeId, depotId, mode, active));
    say(`Đã điều chỉnh tuyến ${routeId}: ${mode}${active ? '' : ' · tạm dừng'}.`);
  };

  const changeRate = (groupId: string, value: number): void => {
    setRealm((current) => ({ ...current, taxRates: setRate(current.taxRates, groupId, value) }));
    setCommitted(false);
  };

  const ban = (lawId: string): void => {
    const law = lawOf(lawId);
    if (law === null) {
      say(`Không có điều luật "${lawId}".`);
      return;
    }
    if (law.scope === 'province' && selected === null) {
      say(`${law.name} cần một tỉnh được chọn.`);
      return;
    }
    const active = law.scope === 'province' ? (selected?.laws ?? []) : realm.laws;
    const verdict = canIssue(lawId, rank, realm.treasury, active);
    if (!verdict.ok) {
      say(verdict.reason);
      return;
    }
    const result = issueLaw(active, lawId);
    if (result.oneOff) {
      const applied = applyOneOffLaw(realm.provinces, lawId, selected?.id ?? '');
      setRealm((current) => ({
        ...current,
        provinces: applied.provinces,
        treasury: current.treasury - result.cost,
      }));
      if (applied.legitimacy !== 0) {
        setTitles((current) => current.map((row) => row.fiefId === title.fiefId
          ? { ...row, legitimacy: Math.max(0, Math.min(100, row.legitimacy + applied.legitimacy)) }
          : row));
      }
      say(result.line, applied.line);
      return;
    }
    setRealm((current) => ({
      ...current,
      laws: law.scope === 'realm' ? result.laws : current.laws,
      provinces: law.scope === 'province'
        ? current.provinces.map((row) => row.id === selected?.id ? { ...row, laws: result.laws } : row)
        : current.provinces,
      treasury: current.treasury - result.cost,
    }));
    say(result.line);
  };

  const repeal = (lawId: string, scope: 'realm' | 'province'): void => {
    const active = scope === 'realm' ? realm.laws : (selected?.laws ?? []);
    const result = repealLaw(active, lawId);
    setRealm((current) => ({
      ...current,
      laws: scope === 'realm' ? result.laws : current.laws,
      provinces: scope === 'province'
        ? current.provinces.map((row) => row.id === selected?.id ? { ...row, laws: result.laws } : row)
        : current.provinces,
    }));
    say(result.line);
  };

  const begin = (projectId: string, target: Province): void => {
    const verdict = canStart(projectId, target, rank, realm.treasury, realm.projects);
    if (!verdict.ok) {
      say(verdict.reason);
      return;
    }
    const started = startProject(projectId, target, date.year, realm.projects.length + 1);
    setRealm((current) => ({
      ...current,
      projects: [...current.projects, started.project],
      treasury: current.treasury - started.cost,
    }));
    say(`Khởi công ở ${provinceName(target)} — còn ${String(started.project.yearsLeft)} năm.`);
  };

  const talkTo = (npcId: string): void => {
    const target = vassals.list.find((row) => row.npcId === npcId);
    if (target === undefined) return;
    const snapshot = useGameStore.getState().snapshot();
    const result = persuade(rngFor(), target, 10 + Math.round((characterOf(snapshot)?.stats.elo ?? 10) / 2), date.year, snapshot);
    setVassals((current) => ({
      ...current,
      list: current.list.map((row) => (row.npcId === npcId ? result.vassal : row)),
    }));
    say(result.line);
  };

  const giveGift = (npcId: string): void => {
    const target = vassals.list.find((row) => row.npcId === npcId);
    if (target === undefined) return;
    const cost = giftCost(6);
    if (realm.treasury < cost) {
      say(`Quà cho ${target.name} tốn ${String(cost)} đồng; kho còn ${String(Math.round(realm.treasury))}.`);
      return;
    }
    const result = applyLoyaltyEvent(target, 'qua-cap', date.year);
    setVassals((current) => ({
      ...current,
      list: current.list.map((row) => (row.npcId === npcId ? result.vassal : row)),
    }));
    setRealm((current) => ({ ...current, treasury: current.treasury - cost }));
    say(`${target.name} nhận quà — lòng trung ${result.line.value > 0 ? '+' : ''}${String(result.line.value)}, tốn ${String(cost)} đồng.`);
  };

  const rule = (verdictId: string): void => {
    const courtCase = realm.cases.find((row) => row.id === openCaseId);
    if (courtCase === undefined) return;
    const snapshot = useGameStore.getState().snapshot();
    const result = judge(rngFor(), courtCase, verdictId, {
      base: 10 + Math.round((characterOf(snapshot)?.stats.wit ?? 10) / 2),
      state: snapshot,
    });

    setRealm((current) => ({
      ...current,
      cases: current.cases.map((row) => (row.id === courtCase.id ? result.case : row)),
      provinces: current.provinces.map((row) => row.id === courtCase.provinceId
        ? { ...row, unrest: Math.max(0, Math.min(100, row.unrest + result.unrest)) }
        : row),
      treasury: current.treasury + result.revenue,
    }));
    const favouredId = result.verdict.favours === 'a'
      ? courtCase.plaintiff
      : result.verdict.favours === 'b' ? courtCase.defendant : '';
    setVassals((current) => ({
      ...current,
      list: current.list.map((row) => {
        if (row.npcId !== courtCase.plaintiff && row.npcId !== courtCase.defendant) return row;
        const delta = favouredId !== '' && row.npcId === favouredId ? result.loyaltyFavoured : result.loyaltyOther;
        return adjustVassalLoyalty(row, delta, `Phán quyết vụ ${courtCase.id}`, date.year, delta <= -10);
      }),
    }));
    setTitles((current) =>
      current.map((row) =>
        row.fiefId === title.fiefId
          ? { ...row, legitimacy: Math.max(0, Math.min(100, row.legitimacy + result.legitimacy)) }
          : row,
      ),
    );

    if (result.opensDuel) {
      const request = judicialDuelRequest(courtCase);
      if (onJudicialDuel !== undefined) {
        onJudicialDuel(request, (winnerId) => {
          const duelResult = applyDuelVerdict(courtCase, winnerId, true);
          const loserId = winnerId === courtCase.plaintiff ? courtCase.defendant : courtCase.plaintiff;
          setRealm((current) => ({
            ...current,
            cases: current.cases.map((row) => row.id === courtCase.id ? duelResult.case : row),
          }));
          setTitles((current) => current.map((row) => row.fiefId === title.fiefId
            ? { ...row, legitimacy: Math.max(0, Math.min(100, row.legitimacy + duelResult.legitimacy)) }
            : row));
          setVassals((current) => ({
            ...current,
            list: current.list.map((row) => {
              if (row.npcId === winnerId) {
                return adjustVassalLoyalty(row, duelResult.winnerLoyalty, 'Thắng quyết đấu tư pháp', date.year);
              }
              if (row.npcId === loserId) {
                return adjustVassalLoyalty(row, duelResult.loserLoyalty, 'Thua quyết đấu tư pháp', date.year, true);
              }
              return row;
            }),
          }));
          say(duelResult.line);
        });
      }
      say(
        ...result.lines,
        `Quyết đấu tư pháp: ${request.challengerName} đấu ${request.defenderName} ở ${request.arenaId}. Kết quả LÀ phán quyết.`,
      );
    } else {
      say(...result.lines);
    }
    setOpenCaseId('');
  };

  const summonHost = (): void => {
    const host = callHost({
      titles,
      vassals: vassals.list,
      laws: realm.laws,
      wantedDays: 60,
      year: date.year,
      levyFactor: courtEffects(realm.court, rank).levyFactor,
    });
    setVassals((current) => ({ ...current, list: host.vassals }));
    say(...host.lines, `Con số Phần 11 nhận khi đi vây: ${String(host.days)} ngày.`);
  };

  /** Chốt cả lô qua MVU một lần, actor `engine` (R2, R4). */
  const commit = (): void => {
    const snapshot = useGameStore.getState().snapshot();
    const ops: PatchOp[] = [
      { op: 'set', path: 'realm', to: realm, reason: 'Phần 13: kết quả cai trị của những năm vừa qua', source: 'json' },
      { op: 'set', path: 'vassals', to: vassals, reason: 'Phần 13: lòng trung và phe cánh của chư hầu', source: 'json' },
      { op: 'set', path: 'titles.held', to: titles, reason: 'Phần 13: chính danh và nghĩa vụ của các thái ấp', source: 'json' },
      { op: 'set', path: 'military', to: military, reason: 'quân số, đạo quân và hàng tuyển theo tháng', source: 'json' },
      { op: 'set', path: 'meta.gameDate', to: date, reason: 'thời gian cai trị và tuyển quân đã trôi', source: 'json' },
      { op: 'set', path: `meta.rng.streams.${REALM_STREAM}`, to: rngFor().getState(), reason: 'vị trí dòng xúc sắc cai trị', source: 'json' },
    ];
    // `realm.name` và `held[*].fiefName` là `locked` (mục 10) — ghi cả slice sẽ
    // đụng vào chúng, nên lô này đi với `skipPermissions`: đây là engine ghi kết
    // quả của chính mình, không phải AI đề xuất một thay đổi.
    const result = applyPatch(snapshot, ops, { actor: 'engine', skipPermissions: true });
    if (result.applied && result.next !== null) {
      useGameStore.getState().commitBatch(result.next);
      setCommitted(true);
      return;
    }
    setLog((rows) => [`Chốt thất bại: ${result.failures.map((row) => row.message).join('; ')}`, ...rows]);
  };

  const holderNames: Record<string, string> = {};
  for (const vassal of vassals.list) holderNames[vassal.npcId] = vassal.name;
  const openCase = realm.cases.find((row) => row.id === openCaseId) ?? null;

  return (
    <div className="fixed inset-0 z-40 flex flex-col overflow-hidden bg-ink text-parchment">
      {/* Tab chuyển giữa các bảng — một tab một tờ giấy (mục 3, mục 11). */}
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-oak-light bg-oak px-4 py-2">
        {titles.map((row) => (
          <button
            key={row.fiefId}
            type="button"
            onClick={() => setViewing(row.fiefId)}
            className={`rounded border px-2 py-1 text-xs ${
              row.fiefId === viewing ? 'border-brass bg-brass/15 text-brass' : 'border-oak-light text-vellum/80'
            }`}
            title={row.fiefName}
          >
            {titleName(row.titleId)}
          </button>
        ))}

        <span className="ml-auto text-xs text-vellum/70">tháng {String(date.month)}/{String(date.year)}</span>
        <button
          type="button"
          onClick={runMonth}
          className="rounded border border-oak-light px-2 py-1 text-xs text-vellum/80 hover:bg-oak-light"
        >
          Qua một tháng
        </button>
        <button
          type="button"
          onClick={runYear}
          className="rounded border border-brass px-2 py-1 text-xs text-brass hover:bg-brass/10"
        >
          Cho qua một năm
        </button>
        <button
          type="button"
          onClick={commit}
          disabled={committed}
          className="rounded border border-brass px-2 py-1 text-xs text-brass disabled:opacity-40"
        >
          {committed ? 'đã chốt' : 'Chốt kết quả'}
        </button>
        <button type="button" onClick={onClose} className="rounded border border-oak-light px-2 py-1 text-xs">
          Đóng
        </button>
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <main className="flex min-w-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
          <div className="flex flex-wrap items-baseline gap-3">
            <h2 className="text-lg text-brass">{realm.name === '' ? title.fiefName : realm.name}</h2>
            <span className="text-xs text-vellum/70">
              {panel.name} · {titleName(title.titleId)} · thụ phong năm {String(title.sinceYear)}
            </span>
            <span
              className={`rounded border px-2 py-0.5 text-[10px] ${
                title.legitimacy < 40 ? 'border-blood/60 text-blood' : 'border-oak-light text-vellum/70'
              }`}
            >
              chính danh {String(Math.round(title.legitimacy))} — {legitimacyLabel(title.legitimacy)}
            </span>
            {!title.churchRecognised && (
              <span className="rounded border border-blood/60 px-2 py-0.5 text-[10px] text-blood">
                Giáo hội chưa công nhận
              </span>
            )}
          </div>

          {/* MỤC CỦA BẢNG — dựng từ data, không hardcode (mục 4). */}
          <div className="flex flex-wrap gap-1.5">
            {panel.sections.map((section) => (
              <span key={section.id} className="rounded border border-oak-light px-2 py-0.5 text-[10px] text-vellum/60">
                {section.name}
              </span>
            ))}
          </div>

          {realm.provinces.length > 0 && (
            <ProvinceMap
              provinces={realm.provinces}
              shading={shading}
              selected={province}
              onSelect={setProvince}
              onShading={setShading}
              holderNames={holderNames}
            />
          )}

          <MilitaryPanel
            military={military}
            resources={militaryResources}
            treasury={realm.treasury}
            faction={characterOf(useGameStore.getState().snapshot())?.allegiance.nationId ?? ''}
            onRecruit={recruit}
            onSupplyPolicy={changeSupplyPolicy}
            onSupplyRoute={changeSupplyRoute}
          />

          {/* THUẾ — chỉ tồn tại từ bậc có `dat-thue` (mục 4). */}
          {has('dat-thue') && (
            <section className="flex flex-col gap-2">
              <h3 className="text-xs tracking-[0.2em] text-brass uppercase">Thuế suất</h3>
              {taxGroups().map((group) => (
                <div key={group.id} className="flex items-center gap-3">
                  <span className="w-24 shrink-0 text-xs text-vellum/70">{group.name}</span>
                  <input
                    type="range"
                    min={group.minRate}
                    max={group.maxRate}
                    value={realm.taxRates[group.id] ?? group.baseRate}
                    onChange={(event) => changeRate(group.id, Number(event.target.value))}
                    className="min-w-0 flex-1 accent-brass"
                  />
                  <span className="w-12 shrink-0 text-right font-mono text-xs text-parchment">
                    {String(realm.taxRates[group.id] ?? group.baseRate)}%
                  </span>
                  <span className="w-32 shrink-0 text-[10px] text-vellum/40">thường lệ {String(group.baseRate)}%</span>
                </div>
              ))}
              <p className="text-[10px] text-vellum/40">{rateLabel(realm.taxRates)}</p>
            </section>
          )}

          {/* LUẬT */}
          {has('ban-luat') && (
            <section className="flex flex-col gap-2">
              <h3 className="text-xs tracking-[0.2em] text-brass uppercase">Luật lệ</h3>
              <p className="text-[10px] text-vellum/50">Toàn vùng: {lawLabel(realm.laws)}.</p>
              {selected !== null && (
                <p className="text-[10px] text-vellum/50">{provinceName(selected)}: {lawLabel(selected.laws)}.</p>
              )}
              <div className="flex flex-wrap gap-1.5">
                {realm.laws.map((id) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => repeal(id, 'realm')}
                    className="rounded border border-brass px-2 py-0.5 text-[10px] text-brass hover:bg-brass/10"
                    title="bãi luật này"
                  >
                    ✕ {id}
                  </button>
                ))}
                {(selected?.laws ?? []).map((id) => (
                  <button
                    key={`${selected?.id ?? ''}-${id}`}
                    type="button"
                    onClick={() => repeal(id, 'province')}
                    className="rounded border border-vellum/50 px-2 py-0.5 text-[10px] text-vellum hover:bg-oak-light"
                    title="bãi luật ở tỉnh đang chọn"
                  >
                    ✕ {id} · tỉnh
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {lawsAvailable(rank, []).filter((law) => {
                  const active = law.scope === 'realm' ? realm.laws : (selected?.laws ?? []);
                  return !active.includes(law.id) && (law.scope === 'realm' || selected !== null);
                }).map((law) => (
                  <button
                    key={law.id}
                    type="button"
                    onClick={() => ban(law.id)}
                    className="rounded border border-oak-light px-2 py-0.5 text-[10px] text-vellum hover:bg-oak-light"
                    title={law.note}
                  >
                    {law.name}{law.scope === 'province' ? ' · tỉnh' : ''}
                    {law.cost > 0 ? ` · ${String(law.cost)}đ` : ''}
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* DỰ ÁN CẤP VÙNG — đếm bằng NĂM, không bằng tuần (mục 6). */}
          {has('du-an-vung') && selected !== null && (
            <section className="flex flex-col gap-2">
              <h3 className="text-xs tracking-[0.2em] text-brass uppercase">Dự án vùng</h3>
              <p className="text-[10px] text-vellum/50">Ở {provinceName(selected)}:</p>
              <div className="flex flex-wrap gap-1.5">
                {projectsAvailable(selected, rank, realm.treasury, realm.projects).map((project) => (
                  <button
                    key={project.id}
                    type="button"
                    onClick={() => begin(project.id, selected)}
                    className="rounded border border-oak-light px-2 py-0.5 text-[10px] text-vellum hover:bg-oak-light"
                    title={project.note}
                  >
                    {project.name} · {String(project.cost)}đ · {String(project.years)} năm
                  </button>
                ))}
              </div>
              {realm.projects.length > 0 && (
                <ul className="flex flex-col gap-0.5">
                  {realm.projects.map((row) => (
                    <li key={row.id} className="text-[10px] text-vellum/60">
                      {row.projectId} ở {row.provinceId} — còn {String(row.yearsLeft)} năm
                      {row.stalled === '' ? '' : ` (${row.stalled})`}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {/* GỌI QUÂN — cửa nối sang Phần 11 (mục 12.5). */}
          {has('goi-quan') && (
            <section className="flex flex-col gap-1">
              <h3 className="text-xs tracking-[0.2em] text-brass uppercase">Gọi quân</h3>
              <button
                type="button"
                onClick={summonHost}
                className="self-start rounded border border-oak-light px-2 py-0.5 text-[10px] text-vellum hover:bg-oak-light"
              >
                Triệu tập đạo quân
              </button>
              <p className="text-[10px] text-vellum/40">
                Đạo quân ở lại đúng bằng HẠN NGẮN NHẤT trong các cánh quân — con số ấy đi thẳng vào cuộc vây của Phần 11.
              </p>
            </section>
          )}

          {/* XỬ ÁN */}
          {has('xu-an') && openCase !== null && (
            <section className="flex flex-col gap-2 rounded border border-brass p-3">
              <h3 className="text-xs tracking-[0.2em] text-brass uppercase">Phán quyết</h3>
              <p className="text-sm text-parchment">{openCase.summary}</p>
              <div className="flex flex-wrap gap-1.5">
                {verdictOptions(openCase, realm.laws).map((verdict) => (
                  <button
                    key={verdict.id}
                    type="button"
                    onClick={() => rule(verdict.id)}
                    className={`rounded border px-2 py-0.5 text-[10px] ${
                      verdict.corrupt ? 'border-blood/60 text-blood' : 'border-oak-light text-vellum'
                    } hover:bg-oak-light`}
                    title={verdict.note}
                  >
                    {verdict.name}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-vellum/40">
                Mỗi phán quyết làm hài lòng một bên và mất lòng bên kia. Không có lựa chọn nào vừa lòng cả hai.
              </p>
            </section>
          )}

          {log.length > 0 && (
            <section className="flex flex-col gap-1">
              <h3 className="text-xs tracking-[0.2em] text-brass uppercase">Nhật ký cai trị</h3>
              <ul className="flex flex-col gap-0.5">
                {log.map((line, index) => (
                  <li key={`${String(index)}-${line.slice(0, 12)}`} className="text-[11px] text-vellum/70">
                    {line}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </main>

        <aside className="hidden w-96 shrink-0 flex-col gap-4 overflow-y-auto border-l border-oak-light bg-oak p-4 lg:flex">
          <section className="flex flex-col gap-1">
            <h3 className="text-xs tracking-[0.2em] text-brass uppercase">Tài chính</h3>
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-vellum/60">Kho</span>
              <span className="font-mono text-xs text-parchment">{Math.round(realm.treasury).toLocaleString('vi-VN')} đồng</span>
            </div>
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-vellum/60">Thu năm ngoái</span>
              <span className="font-mono text-xs text-parchment">{Math.round(realm.ledger.taxRevenue).toLocaleString('vi-VN')}</span>
            </div>
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-vellum/60">Nộp lên trên</span>
              <span className="font-mono text-xs text-parchment">{Math.round(realm.ledger.tributeOut).toLocaleString('vi-VN')}</span>
            </div>
            <p className="text-[10px] text-vellum/40">
              Con số cấp vùng là ƯỚC CHỪNG — con số chính xác chỉ thuộc về từng thành trì.
            </p>
          </section>

          {sectionShown('chu-hau') && (
            <VassalPanel
              vassals={vassals.list}
              factions={vassals.factions}
              legitimacy={title.legitimacy}
              titleId={title.titleId}
              onPersuade={talkTo}
              onGift={giveGift}
            />
          )}

          <ObligationLedger titles={titles} vassals={vassals.list} year={date.year} />

          {has('xu-an') && <CourtDocket cases={realm.cases} onOpen={setOpenCaseId} />}

          {sectionShown('chu-hau') && <CourtPanel court={realm.court} titleId={title.titleId} />}

          <SuccessionTree
            family={family}
            law={successionLawFor(title.ladderId)}
            designated=""
          />
        </aside>
      </div>
    </div>
  );
}
