/**
 * MÀN HÌNH DÃ CHIẾN (Phần 10 mục 14).
 *
 * Bảy thứ của mục 14, đủ cả bảy:
 *   1. lưới chiến trận, quân cờ có hướng, cờ hiệu, thanh sĩ khí   → `BattleGrid`
 *   2. màu quân cờ đổi theo trạng thái sĩ khí                     → `BattleGrid`
 *   3. bảng thứ tự khởi động của vòng hiện tại                    → `InitiativeTable`
 *   4. khung lệnh nhận từ chủ soái, có nút tuân hoặc trái lệnh    → `FieldOrderBox`
 *   5. bảng tướng dưới quyền, lòng trung, tính khí, lệnh vừa rồi  → `OfficerTable`
 *   6. nút "Tự mình xông lên"                                     → `chargeIn` → Phần 9
 *   7. sau trận: bảng tổng kết + nút "Đọc diễn biến"
 *
 * MÀN HÌNH NÀY KHÔNG GHI STORE GIỮA TRẬN, cùng luật với Phần 9: engine tích
 * `playerOps` và chỉ khi trận kết thúc, người chơi bấm "Chốt kết quả" thì cả lô
 * mới đi qua MVU một lần với actor `engine`. Chốt từng vòng thì `undo` một cái sẽ
 * để lại nửa trận đánh trong state.
 *
 * MỘT VÒNG LÀ MỘT LƯỢT BẤM, không phải một chuỗi lượt con. Mục 4 xếp thứ tự theo
 * điểm khởi động và mục 3 nói phần quân người chơi không cầm do engine điều
 * khiển; nên người chơi ra LỆNH cho cánh mình rồi bấm "Đánh vòng này", và engine
 * chạy trọn vòng theo đúng thứ tự ấy. Bắt người chơi bấm từng đơn vị một trong
 * một trận ba mươi quân cờ là biến mục 4 thành một công việc bàn giấy.
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
import { battleCampaignOps } from '@/systems/campaign';
import { DuelScreen } from '@/ui/duel';
import type { DuelState } from '@/minigames/duel';
import {
  BATTLE_STREAM,
  ENDINGS,
  WING_LABELS,
  averageMorale,
  buildChronicle,
  canChargeIn,
  chargeIn,
  chronicleFor,
  issueWingOrders,
  playRound,
  resolveCharge,
  settleAftermath,
  strengthOf,
  unitById,
  unitsOf,
  type BattleState,
  type InitiativeRoll,
  type OrderId,
  type WingId,
} from '@/minigames/battle';
import { BattleGrid } from './BattleGrid';
import { FieldOrderBox, InitiativeTable, OfficerTable } from './CommandPanels';

export interface BattleScreenProps {
  battle: BattleState;
  onClose: () => void;
  /**
   * Trận vừa ngã ngũ — người gọi nhận lại trạng thái cuối.
   *
   * Có mặt cho cửa từ truyện (`/src/systems/encounter`): một trận nổ ra giữa
   * cảnh mà kết cục của nó không chảy ngược vào dòng diễn biến thì lượt sau AI
   * kể tiếp như chưa có gì xảy ra.
   */
  onFinish?: (battle: BattleState) => void;
  /** Chỉ báo ra dòng truyện sau khi toàn bộ hệ quả đã chốt vào state. */
  onCommit?: (battle: BattleState) => void;
}

interface Charge {
  duel: DuelState;
  foeUnitId: string;
  playerUnitId: string;
}

export function BattleScreen({ battle: initial, onClose, onFinish, onCommit }: BattleScreenProps): ReactNode {
  const [battle, setBattle] = useState<BattleState>(initial);
  const [rolls, setRolls] = useState<readonly InitiativeRoll[]>([]);
  const [orders, setOrders] = useState<Partial<Record<WingId, OrderId>>>({});
  const [selected, setSelected] = useState('');
  const [charge, setCharge] = useState<Charge | null>(null);
  const [narrative, setNarrative] = useState('');
  const [issues, setIssues] = useState<readonly NarrativeIssue[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [committed, setCommitted] = useState(false);

  /**
   * Báo ĐÚNG MỘT LẦN, và báo ở đây chứ không ở trong `advance`: trận kết thúc
   * được ở nhiều đường (vòng đánh, chủ soái tử trận, người chơi xông lên rồi
   * gục), mà mọi đường đều đi qua cùng một cờ `finished`.
   */
  const reported = useRef(false);
  useEffect(() => {
    if (!battle.finished || battle.aftermath === null || reported.current) return;
    reported.current = true;
    onFinish?.(battle);
  }, [battle, onFinish]);

  /** Dòng xúc sắc RIÊNG của dã chiến, khôi phục từ `meta.rng` ở mỗi lần bấm (R3). */
  const stream = (): ReturnType<ReturnType<typeof createRngHub>['stream']> => {
    const snapshot = useGameStore.getState().snapshot();
    const rng = createRngHub(snapshot.meta.seed, snapshot.meta.rng).stream(BATTLE_STREAM);
    rng.setState(battle.rngState);
    return rng;
  };

  const advance = (): void => {
    if (battle.finished || battle.duelling) return;
    const rng = stream();
    const working = { ...battle };
    // Lệnh của người chơi đi qua ma sát 3d6 của mục 3 TRƯỚC, rồi mới tới vòng.
    issueWingOrders(working, rng, battle.playerSide, orders);
    issueWingOrders(working, rng, battle.playerSide === 'a' ? 'b' : 'a');
    const result = playRound(working, rng);
    setBattle(result.battle);
    setRolls(result.rolls);
  };

  /** Mục 11 — quyết định đắt giá, không phải nút bấm miễn phí. */
  const chargeInNow = (): void => {
    if (selected === '') return;
    const opened = chargeIn(battle, stream(), selected);
    if (opened === null) return;
    setBattle(opened.battle);
    setCharge({ duel: opened.duel, foeUnitId: opened.foeUnitId, playerUnitId: selected });
  };

  const closeCharge = (finished: DuelState | null): void => {
    if (charge === null) return;
    if (finished !== null) {
      setBattle(resolveCharge(battle, finished, charge.foeUnitId, charge.playerUnitId).battle);
    } else {
      setBattle({ ...battle, duelling: false });
    }
    setCharge(null);
  };

  const finish = (): void => {
    if (!battle.finished || battle.aftermath !== null) return;
    setBattle(settleAftermath(battle, stream()));
  };

  /** Chốt hệ quả cơ học vào store — MỘT lần, sau khi trận đã xong (R2). */
  const commit = (): void => {
    const store = useGameStore.getState();
    const snapshot = store.snapshot();
    const ops: PatchOp[] = [
      ...battle.playerOps,
      ...battleCampaignOps(snapshot, battle),
      {
        op: 'set',
        path: `meta.rng.streams.${BATTLE_STREAM}`,
        to: battle.rngState,
        reason: 'vị trí dòng xúc sắc sau trận dã chiến',
        source: 'json',
      },
    ];
    // `squashOps`: trận đánh tích op qua từng vòng, nên nhiều vết thương sinh ra
    // nhiều `set` chồng nhau trên cùng một đường dẫn — xem chú thích ở `state/mvu.ts`.
    const applied = applyPatch(snapshot, squashOps(ops), { actor: 'engine', skipPermissions: true });
    if (!applied.applied || applied.next === null) {
      setError(`Không ghi được kết quả: ${applied.failures.map((entry) => entry.message).join('; ')}`);
      return;
    }
    store.commitBatch(applied.next);
    setCommitted(true);
    setError('');
    onCommit?.(battle);
  };

  const readNarrative = async (): Promise<void> => {
    setBusy(true);
    setError('');
    try {
      const prompt = narrationPrompt(chronicleFor(battle), { words: 500 });
      const cfg = effectiveConfig('main');
      const provider = getProvider(cfg.providerId);
      const response = await provider.stream(
        { system: prompt.system, messages: [{ role: 'user', content: prompt.user }], maxTokens: 1200 },
        cfg,
        () => undefined,
      );
      setNarrative(response.text);
      setIssues(auditNarrative(response.text, buildChronicle(battle)));
    } catch (caught) {
      setError(classifyThrown(caught).message);
    } finally {
      setBusy(false);
    }
  };

  const mine = battle.playerSide;
  const theirs = mine === 'a' ? 'b' : 'a';
  const after = battle.aftermath;
  const selectedUnit = selected === '' ? null : unitById(battle, selected);

  return (
    <div className="fixed inset-0 z-40 flex flex-col overflow-hidden bg-ink text-parchment">
      <header className="flex shrink-0 items-center justify-between border-b border-oak-light bg-oak px-4 py-2">
        <div className="flex items-baseline gap-3">
          <h2 className="text-sm font-semibold tracking-[0.18em] text-brass uppercase">Dã chiến</h2>
          <span className="text-xs text-parchment/55">
            {battle.finished ? `Đã xong — ${ENDINGS[battle.ending] ?? battle.ending}` : `Vòng ${battle.round}`}
            {battle.setting.place === '' ? '' : ` · ${battle.setting.place}`}
            {battle.stakes === '' ? '' : ` · ${battle.stakes}`}
          </span>
        </div>
        <Button onClick={onClose}>Đóng</Button>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-64 shrink-0 flex-col gap-3 overflow-y-auto border-r border-oak-light px-3 py-3">
          <section>
            <h3 className="mb-1 text-[0.65rem] font-semibold tracking-[0.18em] text-brass uppercase">Hai bên</h3>
            {([mine, theirs] as const).map((side) => (
              <div key={side} className="flex items-baseline justify-between gap-2 text-xs">
                <span className="text-parchment/60" title={battle.forces[side].commanderName}>
                  {side === mine ? 'Quân ta' : 'Quân địch'} · {battle.forces[side].name}
                  {battle.forces[side].commanderName === '' ? '' : ` · ${battle.forces[side].commanderName}`}
                </span>
                <span className="font-mono text-parchment">
                  {strengthOf(battle, side)} · sĩ khí {Math.round(averageMorale(battle, side))}
                </span>
              </div>
            ))}
          </section>

          <section>
            <h3 className="mb-1 text-[0.65rem] font-semibold tracking-[0.18em] text-brass uppercase">Mệnh lệnh</h3>
            <FieldOrderBox battle={battle} />
          </section>

          <section>
            <h3 className="mb-1 text-[0.65rem] font-semibold tracking-[0.18em] text-brass uppercase">
              Tướng dưới quyền
            </h3>
            <OfficerTable
              battle={battle}
              chosen={orders}
              onChoose={(wing, order) => setOrders((current) => ({ ...current, [wing]: order }))}
            />
          </section>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4">
          <BattleGrid battle={battle} selectedId={selected} onSelect={setSelected} />

          {!battle.finished && (
            <div className="flex flex-wrap items-center gap-2 rounded border border-oak-light bg-oak px-3 py-2">
              <Button onClick={advance} disabled={busy || battle.duelling}>
                Đánh vòng {battle.round}
              </Button>
              <Button onClick={chargeInNow} disabled={selected === '' || !canChargeIn(battle, selected)}>
                Tự mình xông lên
              </Button>
              <span className="text-[0.65rem] text-parchment/50">
                {selectedUnit === null
                  ? 'Chọn một quân cờ trên lưới.'
                  : `${selectedUnit.name} · ${WING_LABELS[selectedUnit.wing]} · ${selectedUnit.strength} quân`}
                {selected !== '' && !canChargeIn(battle, selected)
                  ? ' — phải có địch ngay bên cạnh mới xông lên được'
                  : ''}
              </span>
            </div>
          )}

          {battle.finished && (
            <section className="flex flex-col gap-3 rounded border border-oak-light bg-oak px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                {after === null ? (
                  <Button onClick={finish}>Truy kích, đếm thương vong, bắt tù binh</Button>
                ) : (
                  <>
                    <Button onClick={() => void readNarrative()} disabled={busy}>
                      {busy ? 'Đang viết…' : 'Đọc diễn biến'}
                    </Button>
                    <Button onClick={commit} disabled={committed}>
                      {committed ? 'Đã chốt kết quả' : 'Chốt kết quả vào ván chơi'}
                    </Button>
                  </>
                )}
                <span className="text-xs text-parchment/55">
                  {battle.playerOps.length} thay đổi chờ ghi · {battle.rounds.length} vòng
                </span>
              </div>

              {after !== null && (
                <div className="grid gap-1 border-t border-oak-light pt-3 text-xs text-parchment/80">
                  {after.lines.map((line, index) => (
                    <p key={index}>{line}</p>
                  ))}
                  <p className="mt-1 text-brass">
                    Uy tín {after.reputation > 0 ? '+' : ''}
                    {after.reputation} · {after.lordStanding}
                  </p>
                </div>
              )}

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
        </main>

        <aside className="hidden w-64 shrink-0 flex-col gap-3 overflow-y-auto border-l border-oak-light px-3 py-3 lg:flex">
          <section>
            <h3 className="mb-1 text-[0.65rem] font-semibold tracking-[0.18em] text-brass uppercase">
              Thứ tự khởi động
            </h3>
            <InitiativeTable battle={battle} rolls={rolls} onSelect={setSelected} />
          </section>

          <section className="min-h-0">
            <h3 className="mb-1 text-[0.65rem] font-semibold tracking-[0.18em] text-brass uppercase">Nhật ký</h3>
            <ol className="flex flex-col gap-0.5">
              {battle.log.slice(-40).map((line, index) => (
                <li
                  key={index}
                  className={`text-[0.68rem] leading-snug ${
                    line.major === true ? 'text-[#d9a441]' : 'text-parchment/60'
                  }`}
                >
                  <span className="text-parchment/35">v{line.round} </span>
                  {line.text}
                </li>
              ))}
            </ol>
          </section>

          <p className="text-[0.6rem] text-parchment/35">
            {unitsOf(battle, mine).length} đơn vị ta còn đứng · {unitsOf(battle, theirs).length} đơn vị địch
          </p>
        </aside>
      </div>

      {/* Mục 11: giữa trận, nhường sân cho minigame quyết đấu của Phần 9. */}
      {charge !== null && (
        <DuelScreen
          duel={charge.duel}
          playerSide="a"
          hideCommit
          onFinish={(done) => setCharge({ ...charge, duel: done })}
          onClose={() => closeCharge(charge.duel.finished ? charge.duel : null)}
        />
      )}
    </div>
  );
}
