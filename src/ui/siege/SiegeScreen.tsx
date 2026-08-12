/**
 * MÀN HÌNH VÂY HÃM VÀ TỔNG CÔNG (Phần 11 mục 9).
 *
 * Hai giai đoạn, hai bộ mặt hoàn toàn khác nhau — đúng như mục 9 chia:
 *
 *   GIAI ĐOẠN VÂY     sơ đồ mặt cắt · hai bảng đối xứng · lịch tuần và nút tăng
 *                     tốc · trục thời gian có mốc · BẢNG HÀNH ĐỘNG CỦA BÊN NGÀI
 *                     ĐANG ĐỨNG · khung đàm phán khi có
 *   GIAI ĐOẠN TỔNG CÔNG  lưới có tầng, chốt thắt cổ chai, thương vong dự kiến
 *
 * MÀN HÌNH NÀY KHÔNG GHI STORE GIỮA CHỪNG, cùng luật với Phần 9 và 10: engine
 * tích `playerOps` và chỉ khi cuộc vây hãm kết thúc, người chơi bấm "Chốt kết
 * quả" thì cả lô mới đi qua MVU một lần với actor `engine`. Chốt từng tuần thì
 * `undo` một cái sẽ để lại nửa cuộc vây hãm trong state.
 *
 * MỘT TUẦN LÀ MỘT LƯỢT BẤM, và nút TĂNG TỐC là thứ làm giai đoạn một chơi được.
 * Mục 3 nói nó phải "tự dừng khi có sự kiện đáng chú ý" — nên nút ấy không phải
 * một tiện ích, nó là cách duy nhất hai mươi tuần vây hãm không thành hai mươi
 * lần bấm cùng một nút.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createRngHub } from '@/core/rng';
import { applyPatch, squashOps } from '@/state/mvu';
import type { PatchOp } from '@/state/mvu-parse';
import { useGameStore } from '@/state/store';
import { effectiveConfig } from '@/state/settings';
import { getProvider } from '@/ai/provider';
import { classifyThrown } from '@/ai/errors';
import { Button } from '@/ui/settings/controls';
import { auditNarrative, narrationPrompt, type NarrativeIssue } from '@/systems/combat';
import { siegeCampaignOps } from '@/systems/campaign';
import { DuelScreen } from '@/ui/duel';
import type { DuelState } from '@/minigames/duel';
import {
  PHASE_LABELS,
  SIEGE_ENDINGS,
  SIEGE_STREAM,
  buildSiegeChronicle,
  eventDefOf,
  mayChoose,
  optionsFor,
  reputationOps,
  resolveEvent,
  runWeek,
  sackOrSpare,
  siegeChronicleFor,
  spoils,
  summarise,
  type SiegeAction,
  type SiegeState,
} from '@/systems/siege';
import {
  assaultRound,
  assaultSummary,
  availableMethods,
  besiegerActions,
  canFightOnWall,
  fightOnWall,
  forlornReward,
  resolveWallFight,
  startAssault,
} from '@/minigames/siege-attack';
import { autoBesiegerAction } from '@/minigames/siege-attack/actions';
import { defenderActions } from '@/minigames/siege-defense';
import { autoDefenderAction } from '@/minigames/siege-defense/actions';
import { assaultMethodOf } from '@/systems/siege';
import { CrossSection } from './CrossSection';
import { ActionTable, Timeline } from './ActionTable';
import { BesiegerPanel, DefenderPanel, ReputationRow } from './SidePanels';
import { AssaultView } from './AssaultView';

export interface SiegeScreenProps {
  siege: SiegeState;
  onClose: () => void;
  /**
   * Cuộc vây hãm vừa khép lại — người gọi nhận lại trạng thái cuối.
   *
   * Có mặt cho cửa từ truyện (`/src/systems/encounter`), cùng lý do với dã
   * chiến: kết cục phải chảy ngược vào dòng diễn biến, không dừng ở màn hình này.
   */
  onFinish?: (siege: SiegeState) => void;
  /** Chỉ báo ra dòng truyện sau khi hậu quả đã chốt vào mọi slice liên quan. */
  onCommit?: (siege: SiegeState) => void;
}

export function SiegeScreen({ siege: initial, onClose, onFinish, onCommit }: SiegeScreenProps): ReactNode {
  const [siege, setSiege] = useState<SiegeState>(initial);
  const [chosen, setChosen] = useState('');
  const [methodId, setMethodId] = useState('');
  const [forlorn, setForlorn] = useState(false);
  const [leadIt, setLeadIt] = useState(false);
  const [wallDuel, setWallDuel] = useState<{ duel: DuelState; waveId: string } | null>(null);
  const [narrative, setNarrative] = useState('');
  const [issues, setIssues] = useState<readonly NarrativeIssue[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [committed, setCommitted] = useState(false);

  /**
   * Báo ĐÚNG MỘT LẦN. Một cuộc vây hãm kết thúc được ở sáu đường khác nhau —
   * hết lương, tổng công, đàm phán, cứu viện tới, bên vây rút, một popup sự kiện
   * — mà cả sáu đều đi qua cùng một cờ `finished`.
   */
  const reported = useRef(false);
  useEffect(() => {
    if (!siege.finished || reported.current) return;
    reported.current = true;
    onFinish?.(siege);
  }, [siege, onFinish]);

  /** Dòng xúc sắc RIÊNG của công thành, khôi phục ở mỗi lần bấm (R3). */
  const stream = (): ReturnType<ReturnType<typeof createRngHub>['stream']> => {
    const snapshot = useGameStore.getState().snapshot();
    const rng = createRngHub(snapshot.meta.seed, snapshot.meta.rng).stream(SIEGE_STREAM);
    rng.setState(siege.rngState);
    return rng;
  };

  const mine: readonly SiegeAction[] = siege.playerSide === 'vay' ? besiegerActions(siege) : defenderActions(siege);
  const picked = mine.find((action) => action.id === chosen) ?? null;

  const planFor = (current: SiegeState, action: SiegeAction | null): Parameters<typeof runWeek>[2] =>
    current.playerSide === 'vay'
      ? { attacker: action ?? autoBesiegerAction(current), defender: autoDefenderAction(current), payTroops: true }
      : { attacker: autoBesiegerAction(current), defender: action ?? autoDefenderAction(current), payTroops: true };

  const playWeek = (): void => {
    if (siege.finished || siege.pendingEvent !== null) return;
    setSiege(runWeek(siege, stream(), planFor(siege, picked)).siege);
    setChosen('');
  };

  /** TĂNG TỐC (mục 3): chạy nhiều tuần, tự dừng ở tuần có việc phải quyết. */
  const speedUp = (weeks: number): void => {
    if (siege.finished || siege.pendingEvent !== null) return;
    const rng = stream();
    let current = siege;
    for (let index = 0; index < weeks; index++) {
      if (current.finished || current.pendingEvent !== null) break;
      const result = runWeek(current, rng, planFor(current, index === 0 ? picked : null));
      current = result.siege;
      if (result.report.notable) break;
    }
    setSiege(current);
    setChosen('');
  };

  const answerEvent = (optionId: string): void => {
    setSiege(resolveEvent(siege, stream(), optionId));
  };

  const openAssault = (): void => {
    if (methodId === '') return;
    setSiege(startAssault(siege, { methodId, forlornHope: forlorn, playerLeads: forlorn && leadIt }));
  };

  const pushAssault = (): void => {
    if (siege.assault === null || siege.assault.finished || siege.assault.duelling) return;
    setSiege(assaultRound(siege, stream()).siege);
  };

  const stepOntoWall = (): void => {
    const opened = fightOnWall(siege, stream());
    if (opened === null) return;
    setSiege(opened.siege);
    setWallDuel({ duel: opened.duel, waveId: opened.waveId });
  };

  const closeWallDuel = (finished: DuelState | null): void => {
    if (wallDuel === null) return;
    if (finished !== null) setSiege(resolveWallFight(siege, finished, wallDuel.waveId).siege);
    else setSiege({ ...siege, assault: siege.assault === null ? null : { ...siege.assault, duelling: false } });
    setWallDuel(null);
  };

  const decideSack = (sack: boolean): void => {
    const next = { ...siege };
    sackOrSpare(next, stream(), sack);
    setSiege({ ...next });
  };

  /** Chốt hệ quả cơ học vào store — MỘT lần, sau khi cuộc vây hãm đã xong (R2). */
  const commit = (): void => {
    const store = useGameStore.getState();
    const snapshot = store.snapshot();
    const ops: PatchOp[] = [
      ...siege.playerOps,
      // TIẾNG TÀN BẠO ra khỏi minigame và vào state — mục 7, hệ quả toàn cục.
      ...reputationOps(siege),
      ...siegeCampaignOps(snapshot, siege),
      {
        op: 'set',
        path: `meta.rng.streams.${SIEGE_STREAM}`,
        to: siege.rngState,
        reason: 'vị trí dòng xúc sắc sau cuộc vây hãm',
        source: 'json',
      },
    ];
    // `squashOps`: cuộc vây hãm tích op qua hàng chục tuần, nên nhiều `set` chồng
    // nhau trên cùng một đường dẫn — xem chú thích ở `state/mvu.ts`.
    const applied = applyPatch(snapshot, squashOps(ops), { actor: 'engine', skipPermissions: true });
    if (!applied.applied || applied.next === null) {
      setError(`Không ghi được kết quả: ${applied.failures.map((entry) => entry.message).join('; ')}`);
      return;
    }
    store.commitBatch(applied.next);
    setCommitted(true);
    setError('');
    onCommit?.(siege);
  };

  const readNarrative = async (): Promise<void> => {
    setBusy(true);
    setError('');
    try {
      const prompt = narrationPrompt(siegeChronicleFor(siege), { words: 600 });
      const cfg = effectiveConfig('main');
      const provider = getProvider(cfg.providerId);
      const response = await provider.stream(
        { system: prompt.system, messages: [{ role: 'user', content: prompt.user }], maxTokens: 1600 },
        cfg,
        () => undefined,
      );
      setNarrative(response.text);
      setIssues(auditNarrative(response.text, buildSiegeChronicle(siege)));
    } catch (caught) {
      setError(classifyThrown(caught).message);
    } finally {
      setBusy(false);
    }
  };

  const pending = siege.pendingEvent;
  const pendingDef = pending === null ? null : eventDefOf(pending.eventId);
  const summary = summarise(siege);
  const assault = siege.assault;
  const methods = availableMethods(siege);

  return (
    <div className="fixed inset-0 z-40 flex flex-col overflow-hidden bg-ink text-parchment">
      <header className="flex shrink-0 items-center justify-between border-b border-oak-light bg-oak px-4 py-2">
        <div className="flex items-baseline gap-3">
          <h2 className="text-sm font-semibold tracking-[0.18em] text-brass uppercase">
            {siege.phase === 'tong-cong' ? 'Tổng công' : 'Vây hãm'}
          </h2>
          <span className="text-xs text-parchment/55">
            {siege.finished
              ? `Đã xong — ${SIEGE_ENDINGS[siege.ending] ?? siege.ending}`
              : `Tuần ${siege.week} · ${PHASE_LABELS[siege.phase]}`}
            {siege.stakes === '' ? '' : ` · ${siege.stakes}`}
          </span>
        </div>
        <Button onClick={onClose}>Đóng</Button>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Bảng bên vây */}
        <aside className="flex w-60 shrink-0 flex-col gap-2 overflow-y-auto border-r border-oak-light px-3 py-3">
          <h3 className="text-[0.65rem] font-semibold tracking-[0.18em] text-brass uppercase">
            Bên vây {siege.playerSide === 'vay' ? '— ngài' : ''}
          </h3>
          <p className="text-[0.55rem] text-parchment/35">chống lại thời gian và dịch bệnh</p>
          <BesiegerPanel siege={siege} />
        </aside>

        <main className="flex min-w-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4">
          <CrossSection fort={siege.fort} />

          {/* Popup sự kiện — tuần không chạy tiếp khi còn cái này (mục 4). */}
          {pending !== null && pendingDef !== null && (
            <section className="rounded border border-[#d9a441] bg-[#d9a441]/10 px-4 py-3">
              <h3 className="text-[0.7rem] font-semibold tracking-[0.14em] text-[#d9a441] uppercase">{pendingDef.name}</h3>
              <p className="mt-1 text-sm leading-relaxed text-parchment/85">{pendingDef.text}</p>
              <div className="mt-2 flex flex-col gap-1">
                {optionsFor(pendingDef, siege.playerSide).map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => answerEvent(option.id)}
                    className="rounded border border-oak-light bg-oak px-2 py-1 text-left text-xs hover:bg-oak-light"
                  >
                    <span className="block font-medium text-parchment">{option.label}</span>
                    <span className="block text-[0.6rem] text-parchment/50">{option.text}</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* GIAI ĐOẠN 2 */}
          {assault !== null && (
            <section className="flex flex-col gap-2">
              <AssaultView siege={siege} methodId={assault.waves[0]?.methodId ?? methodId} />
              {!assault.finished && (
                <div className="flex flex-wrap items-center gap-2">
                  <Button onClick={pushAssault} disabled={assault.duelling}>
                    Đánh hiệp {assault.round}
                  </Button>
                  <Button onClick={stepOntoWall} disabled={!canFightOnWall(siege)}>
                    Tự mình lên tường
                  </Button>
                  <span className="text-[0.6rem] text-parchment/45">
                    {canFightOnWall(siege)
                      ? 'Ngài đang dẫn đội tiên phong và đã tới chỗ chỉ đủ hai người.'
                      : 'Chỉ lên được khi ngài tự dẫn một đợt và đợt ấy đã tới mặt tường.'}
                  </span>
                </div>
              )}
              {assault.finished && (
                <p className="text-xs text-parchment/70">
                  {assault.succeeded === true
                    ? 'Vào được thành.'
                    : `Đợt cuối bị đánh bật. Mất ${assaultSummary(siege)?.attackerLosses ?? 0} người.`}
                  {forlornReward(siege)?.line === undefined ? '' : ` ${forlornReward(siege)?.line ?? ''}`}
                </p>
              )}
            </section>
          )}

          {/* GIAI ĐOẠN 1 */}
          {assault === null && !siege.finished && (
            <section className="flex flex-col gap-2 rounded border border-oak-light bg-oak px-3 py-2">
              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={playWeek} disabled={pending !== null}>
                  Đánh tuần {siege.week}
                </Button>
                <Button onClick={() => speedUp(4)} disabled={pending !== null}>
                  Tăng tốc 4 tuần
                </Button>
                <Button onClick={() => speedUp(13)} disabled={pending !== null}>
                  Tăng tốc cả mùa
                </Button>
                <span className="text-[0.6rem] text-parchment/45">
                  {picked === null ? 'Chưa chọn việc cho tuần này — engine sẽ tự lo.' : `Tuần này: ${picked.name}.`}
                  {' Tăng tốc tự dừng khi có việc phải quyết.'}
                </span>
              </div>

              {/* NƯỚC CUỐI CÙNG — nên nó là một nút riêng, không nằm trong bảng hành động. */}
              {siege.playerSide === 'vay' && (
                <div className="flex flex-wrap items-center gap-2 border-t border-oak-light pt-2">
                  <select
                    value={methodId}
                    onChange={(event) => setMethodId(event.target.value)}
                    className="rounded border border-oak-light bg-ink px-2 py-1 text-xs text-parchment"
                  >
                    <option value="">— chọn cách đánh —</option>
                    {methods.map((id) => (
                      <option key={id} value={id}>
                        {assaultMethodOf(id)?.name ?? id}
                      </option>
                    ))}
                  </select>
                  <label className="flex items-center gap-1 text-[0.62rem] text-parchment/70">
                    <input type="checkbox" checked={forlorn} onChange={(event) => setForlorn(event.target.checked)} />
                    Cử đội tiên phong
                  </label>
                  <label className="flex items-center gap-1 text-[0.62rem] text-parchment/70">
                    <input
                      type="checkbox"
                      checked={leadIt}
                      disabled={!forlorn}
                      onChange={(event) => setLeadIt(event.target.checked)}
                    />
                    Tự mình dẫn
                  </label>
                  <Button onClick={openAssault} disabled={methodId === '' || pending !== null}>
                    TỔNG CÔNG
                  </Button>
                  <span className="text-[0.58rem] text-[#b8332b]">
                    Đánh thẳng vào tường thành là cách nhanh nhất để mất quân.
                  </span>
                </div>
              )}
            </section>
          )}

          {/* Sau khi xong */}
          {siege.finished && (
            <section className="flex flex-col gap-3 rounded border border-oak-light bg-oak px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                {mayChoose(siege) && siege.sacked === null ? (
                  <>
                    <Button onClick={() => decideSack(true)}>Cho phép cướp phá</Button>
                    <Button onClick={() => decideSack(false)}>Tha cho thành</Button>
                    <span className="text-[0.6rem] text-parchment/50">
                      Thành bị hạ bằng tổng công thì bên thắng có quyền cướp phá. Quyết định này sẽ đi trước ngài tới
                      mọi cổng thành sau.
                    </span>
                  </>
                ) : (
                  <>
                    <Button onClick={() => void readNarrative()} disabled={busy}>
                      {busy ? 'Đang chép…' : 'Đọc biên niên'}
                    </Button>
                    <Button onClick={commit} disabled={committed}>
                      {committed ? 'Đã chốt kết quả' : 'Chốt kết quả vào ván chơi'}
                    </Button>
                  </>
                )}
              </div>

              <div className="grid gap-1 border-t border-oak-light pt-3 text-xs text-parchment/80">
                <p>
                  {summary.endingName}. Đạo quân vây kéo tới {summary.attackerStart} người và còn {summary.attackerLeft}.
                </p>
                <p className="text-parchment/60">
                  Chết vì bệnh {summary.attackerLosses.disease} · vì đánh nhau {summary.attackerLosses.combat} · vì đói{' '}
                  {summary.attackerLosses.hunger} · đào ngũ {summary.attackerLosses.desertion} · hết hạn về nhà{' '}
                  {summary.attackerLosses.departed}
                </p>
                {siege.sacked !== null &&
                  spoils(siege, null, 0, false).lines.map((line, index) => (
                    <p key={index} className="text-parchment/60">
                      {line}
                    </p>
                  ))}
                <ReputationRow siege={siege} />
              </div>

              {error !== '' && <p className="text-xs text-[#b8332b]">{error}</p>}

              {narrative !== '' && (
                <article className="whitespace-pre-wrap border-t border-oak-light pt-3 text-sm leading-relaxed text-parchment/90">
                  {narrative}
                </article>
              )}

              {issues.length > 0 && (
                <div className="rounded border border-[#b8332b]/50 bg-[#b8332b]/10 px-3 py-2">
                  <h4 className="text-[0.65rem] font-semibold tracking-[0.18em] text-[#d9a441] uppercase">
                    Hậu kiểm: bản viết có chỗ không khớp biên niên
                  </h4>
                  <ul className="mt-1 flex flex-col gap-0.5">
                    {issues.map((issue, index) => (
                      <li key={index} className="text-xs text-parchment/75">
                        {issue.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          )}

          {/* BẢNG HÀNH ĐỘNG — của đúng bên người chơi đang đứng (mục 9). */}
          {!siege.finished && assault === null && (
            <ActionTable
              siege={siege}
              actions={mine}
              chosen={chosen}
              onChoose={setChosen}
              disabled={pending !== null}
              title={siege.playerSide === 'vay' ? 'Việc của bên vây' : 'Việc của bên thủ'}
              note={
                siege.playerSide === 'vay'
                  ? 'Chín nước đi của người đứng ngoài tường. Mỗi tuần một việc — và mỗi tuần trôi qua là một tuần trại bẩn thêm.'
                  : 'Chín nước đi của người đứng sau tường. Mỗi nước mua thêm thời gian, và trả bằng lòng người.'
              }
            />
          )}
        </main>

        {/* Bảng bên thủ */}
        <aside className="hidden w-60 shrink-0 flex-col gap-2 overflow-y-auto border-l border-oak-light px-3 py-3 lg:flex">
          <h3 className="text-[0.65rem] font-semibold tracking-[0.18em] text-brass uppercase">
            Bên thủ {siege.playerSide === 'thu' ? '— ngài' : ''}
          </h3>
          <p className="text-[0.55rem] text-parchment/35">chống lại cái đói và lòng người</p>
          <DefenderPanel siege={siege} />

          <section className="mt-2 min-h-0 border-t border-oak-light pt-2">
            <h3 className="mb-1 text-[0.65rem] font-semibold tracking-[0.18em] text-brass uppercase">Trục thời gian</h3>
            <Timeline siege={siege} />
          </section>
        </aside>
      </div>

      {/* Mục 6: trên mặt tường, nhường sân cho minigame quyết đấu của Phần 9. */}
      {wallDuel !== null && (
        <DuelScreen
          duel={wallDuel.duel}
          playerSide="a"
          hideCommit
          onFinish={(done) => setWallDuel({ ...wallDuel, duel: done })}
          onClose={() => closeWallDuel(wallDuel.duel.finished ? wallDuel.duel : null)}
        />
      )}
    </div>
  );
}
