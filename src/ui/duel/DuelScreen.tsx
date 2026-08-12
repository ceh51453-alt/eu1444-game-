/**
 * MÀN HÌNH QUYẾT ĐẤU (Phần 9 mục 11).
 *
 * Sáu thứ của mục 11, đủ cả sáu:
 *   1. lưới đấu ở giữa, hướng mặt rõ, ô bị đe dọa tô màu   → `ArenaGrid`
 *   2. bảng hành động, mỗi nút hiện sức/tầm/tốc độ         → `ActionBar`
 *   3. hai bên: thể lực, thế trận, hình cơ thể Phần 7      → `FighterPanel`
 *   4. nhật ký hiệp cuộn bên phải                          → `RoundLog`
 *   5. sau trận: nút "Đọc diễn biến" gọi AI viết
 *   6. chế độ xem lại: tua từng hiệp
 *
 * MÀN HÌNH NÀY KHÔNG GHI STORE GIỮA TRẬN. Engine tích `playerOps` và chỉ khi
 * trận kết thúc, người chơi bấm "Chốt kết quả" thì cả lô mới đi qua MVU một lần
 * với actor `engine`. Chốt từng hiệp thì `undo` một cái sẽ để lại nửa trận đấu
 * trong state, và Phần 0 mục 5 đòi undo phải tua về được một mốc có nghĩa.
 *
 * "Đọc diễn biến" gọi LLM ĐÚNG MỘT LẦN với biên niên đã nén (mục 10), rồi chạy
 * `auditNarrative` lên bản vừa nhận. Cảnh báo hiện ngay dưới đoạn văn — mục 13
 * hỏi thẳng "AI có bịa thêm tình tiết ngoài biên niên không", và câu trả lời phải
 * ở trên màn hình chứ không nằm trong đầu người đọc.
 */

import { useMemo, useState, type ReactNode } from 'react';
import { createRngHub } from '@/core/rng';
import { applyPatch, squashOps } from '@/state/mvu';
import type { PatchOp } from '@/state/mvu-parse';
import { useGameStore } from '@/state/store';
import { effectiveConfig } from '@/state/settings';
import { getProvider } from '@/ai/provider';
import { classifyThrown } from '@/ai/errors';
import { Button } from '@/ui/settings/controls';
import { auditNarrative, narrationPrompt, type NarrativeIssue } from '@/systems/combat';
import {
  DUEL_STREAM,
  buildChronicle,
  chronicleFor,
  fighterOf,
  kindDetails,
  optionsFor,
  playRound,
  practiceOps,
  resolveOptionsOf,
  distance,
  type ChosenAction,
  type DuelState,
  type SideId,
} from '@/minigames/duel';
import { ActionBar } from './ActionBar';
import { ArenaGrid } from './ArenaGrid';
import { FighterPanel } from './FighterPanel';
import { RoundLog } from './RoundLog';

export interface DuelScreenProps {
  duel: DuelState;
  /** Bên nhân vật người chơi cầm. */
  playerSide?: SideId;
  onClose: () => void;
  /**
   * Trận đấu vừa kết thúc — người gọi nhận lại trạng thái cuối.
   *
   * Có mặt cho Phần 10 mục 11 ("Tự mình xông lên"): ở đó trận đấu là một khúc
   * của một trận dã chiến, và hệ quả của nó phải chảy ngược về chiến trường chứ
   * không dừng lại ở màn hình này.
   */
  onFinish?: (duel: DuelState) => void;
  /** Chỉ gọi SAU KHI hệ quả đã ghi thành công vào state của ván chơi. */
  onCommit?: (duel: DuelState) => void;
  /**
   * Giấu nút "Chốt kết quả".
   *
   * Bật lên khi NGƯỜI GỌI sở hữu lô op — dã chiến gom `playerOps` của cả trận
   * đánh rồi chốt một lần. Chốt hai nơi thì thương tích của một hiệp đấu sẽ đi
   * qua MVU hai lần.
   */
  hideCommit?: boolean;
}

export function DuelScreen({
  duel: initial,
  playerSide = 'a',
  onClose,
  onFinish,
  onCommit,
  hideCommit = false,
}: DuelScreenProps): ReactNode {
  const [duel, setDuel] = useState<DuelState>(initial);
  const [narrative, setNarrative] = useState('');
  const [issues, setIssues] = useState<readonly NarrativeIssue[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [committed, setCommitted] = useState(false);
  // Chế độ xem lại: `null` là đang chơi, số là đang tua tới hiệp đó.
  const [replay, setReplay] = useState<number | null>(null);

  const self = fighterOf(duel, playerSide);
  const foe = fighterOf(duel, playerSide === 'a' ? 'b' : 'a');
  const kind = kindDetails(duel);

  const options = useMemo(
    () => optionsFor(self, foe, distance(self.pos, foe.pos), resolveOptionsOf(duel)),
    [duel],
  );

  /**
   * Một hiệp.
   *
   * Dòng xúc sắc RIÊNG của quyết đấu, khôi phục từ `meta.rng` mỗi lần bấm: số
   * lần tung trong một trận thay đổi theo cách người chơi đánh, và trên dòng
   * `main` thì nó đẩy lệch mọi cú tung của mọi lượt sau (R3).
   */
  const step = (chosen: ChosenAction): void => {
    if (duel.finished || replay !== null) return;
    const snapshot = useGameStore.getState().snapshot();
    const stream = createRngHub(snapshot.meta.seed, snapshot.meta.rng).stream(DUEL_STREAM);
    // Tiếp TỪ chỗ hiệp trước dừng lại. Dựng lại hub từ `meta.rng` ở mỗi lần bấm
    // mà không khôi phục vị trí thì cả trận tung đúng một con xúc sắc (R3).
    stream.setState(duel.rngState);
    const next = playRound(duel, stream, chosen, playerSide).duel;
    setDuel(next);
    if (next.finished && onFinish !== undefined) onFinish(next);
  };

  /** Chốt hệ quả cơ học vào store — MỘT lần, sau khi trận đã xong (R2). */
  const commit = (): void => {
    const store = useGameStore.getState();
    const snapshot = store.snapshot();
    const ops: PatchOp[] = [
      ...duel.playerOps,
      ...practiceOps({ ...duel, state: snapshot }, playerSide),
      // Vị trí dòng xúc sắc của trận đấu về lại save. Không ghi thì tải lại ván
      // rồi đánh trận sau sẽ tung lại đúng chuỗi xúc sắc của trận này (R3).
      {
        op: 'set',
        path: `meta.rng.streams.${DUEL_STREAM}`,
        to: duel.rngState,
        reason: 'vị trí dòng xúc sắc sau trận đấu',
        source: 'json',
      },
    ];

    // `squashOps` vì trận đấu tích op qua từng hiệp: ba vết thương sinh ra ba
    // `set` chồng nhau trên `body.nextInjuryNo`, và B4 đối chiếu `from` với
    // state TRƯỚC trận nên cả lô bị hủy. Xem chú thích ở `state/mvu.ts`.
    const applied = applyPatch(snapshot, squashOps(ops), { actor: 'engine' });
    if (!applied.applied || applied.next === null) {
      setError(`Không ghi được kết quả: ${applied.failures.map((entry) => entry.message).join('; ')}`);
      return;
    }
    store.commitBatch(applied.next);
    setCommitted(true);
    setError('');
    onCommit?.(duel);
  };

  const readNarrative = async (): Promise<void> => {
    setBusy(true);
    setError('');
    try {
      const compact = chronicleFor(duel);
      const prompt = narrationPrompt(compact, { charName: self.id === '' ? self.name : '' });
      const cfg = effectiveConfig('main');
      const provider = getProvider(cfg.providerId);

      const response = await provider.stream(
        { system: prompt.system, messages: [{ role: 'user', content: prompt.user }], maxTokens: 900 },
        cfg,
        () => undefined,
      );
      setNarrative(response.text);
      setIssues(auditNarrative(response.text, buildChronicle(duel)));
    } catch (caught) {
      setError(classifyThrown(caught).message);
    } finally {
      setBusy(false);
    }
  };

  const lastRound = duel.rounds.length;
  const shown = replay === null ? duel : replayAt(duel, replay);

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-ink text-parchment">
      <header className="flex shrink-0 items-center justify-between border-b border-oak-light bg-oak px-4 py-2">
        <div className="flex items-baseline gap-3">
          <h2 className="text-sm font-semibold tracking-[0.18em] text-brass uppercase">
            {kind?.name ?? 'Quyết đấu'}
          </h2>
          <span className="text-xs text-parchment/55">
            {duel.finished ? `Đã xong — ${duel.ending}` : `Hiệp ${duel.round}`}
            {duel.setting.place === '' ? '' : ` · ${duel.setting.place}`}
            {duel.stakes === '' ? '' : ` · ${duel.stakes}`}
          </span>
        </div>
        <Button onClick={onClose}>Đóng</Button>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="flex shrink-0 flex-col gap-2 overflow-y-auto border-r border-oak-light px-3 py-3">
          <FighterPanel fighter={fighterOf(shown, playerSide)} isPlayer={self.id === ''} />
          <FighterPanel fighter={fighterOf(shown, playerSide === 'a' ? 'b' : 'a')} isPlayer={false} />
        </aside>

        <main className="flex min-w-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4">
          <ArenaGrid arena={shown.arena} a={shown.a} b={shown.b} playerSide={playerSide} />

          {!duel.finished && replay === null && (
            <ActionBar options={options} onChoose={step} disabled={busy} />
          )}

          {duel.finished && (
            <section className="flex flex-col gap-3 rounded border border-oak-light bg-oak px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={() => void readNarrative()} disabled={busy}>
                  {busy ? 'Đang viết…' : 'Đọc diễn biến'}
                </Button>
                {!hideCommit && (
                  <Button onClick={commit} disabled={committed}>
                    {committed ? 'Đã chốt kết quả' : 'Chốt kết quả vào ván chơi'}
                  </Button>
                )}
                <span className="text-xs text-parchment/55">
                  {duel.playerOps.length} thay đổi chờ ghi · {duel.rounds.length} hiệp
                  {hideCommit ? ' · sẽ chốt cùng kết quả trận đánh' : ''}
                </span>
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

              {/* Chế độ xem lại: tua từng hiệp (mục 11). */}
              <div className="flex items-center gap-3 border-t border-oak-light pt-3">
                <span className="text-[0.65rem] tracking-[0.18em] text-brass uppercase">Xem lại</span>
                <input
                  type="range"
                  min={0}
                  max={lastRound}
                  value={replay ?? lastRound}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    setReplay(value >= lastRound ? null : value);
                  }}
                  className="flex-1 accent-brass"
                  aria-label="Tua từng hiệp"
                />
                <span className="w-24 text-right text-xs tabular-nums text-parchment/60">
                  {replay === null ? `hiệp ${lastRound} (cuối)` : `hiệp ${replay}`}
                </span>
              </div>
            </section>
          )}
        </main>

        <aside className="hidden w-80 shrink-0 flex-col overflow-hidden border-l border-oak-light px-3 py-3 lg:flex">
          <h3 className="mb-2 text-[0.65rem] font-semibold tracking-[0.18em] text-brass uppercase">Nhật ký hiệp</h3>
          <RoundLog lines={duel.log} checks={duel.checks} playerSide={playerSide} upToRound={replay} />
        </aside>
      </div>
    </div>
  );
}

/**
 * Trạng thái sàn đấu ở CUỐI một hiệp cũ.
 *
 * Biên niên giữ đủ thế trận và thể lực của từng hiệp (mục 10), nên chế độ xem
 * lại dựng lại được hai thanh ấy mà không phải lưu thêm một bản chụp nào. Vị trí
 * trên lưới thì KHÔNG có trong biên niên — nó giữ nguyên vị trí cuối, và đó là
 * giới hạn đã biết của chế độ xem lại: nó tua LỜI KỂ, không tua bàn cờ.
 */
function replayAt(duel: DuelState, round: number): DuelState {
  const entry = duel.rounds.find((item) => item.n === round);
  if (entry === undefined) return duel;

  const patch = (side: SideId): DuelState['a'] => {
    const fighter = fighterOf(duel, side);
    return {
      ...fighter,
      tempo: entry.tempoAfter[fighter.id] ?? fighter.tempo,
      stamina: entry.staminaAfter[fighter.id] ?? fighter.stamina,
      body: {
        ...fighter.body,
        // Chỉ giữ những vết đã có TỚI hiệp đang tua.
        injuries: fighter.body.injuries.filter((injury) =>
          duel.rounds.some(
            (item) =>
              item.n <= round &&
              item.injuries.some((wound) => wound.actorId === fighter.id && wound.regionId === injury.regionId),
          ),
        ),
      },
    };
  };

  return { ...duel, a: patch('a'), b: patch('b') };
}
