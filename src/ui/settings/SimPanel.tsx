/**
 * BẢNG MÔ PHỎNG NGẦM TRONG TAB DEBUG — Phần 15 mục 11, dòng cuối.
 *
 * *"Tab Debug thêm: nhật ký tick sâu, số request đã dùng, chi phí tích lũy, danh
 * sách agent theo tầng, và nút **chạy thử 12 tháng**."*
 *
 * Năm thứ ấy đều ở đây, cộng hai cái công tắc mà mục 5 đòi: **trần request mỗi
 * tháng** và **nút tắt hẳn LLM**. Chúng nằm trong tab Debug chứ không nằm ở tab
 * Cài đặt vì chúng là công cụ để ĐO chi phí, và người chơi chỉ tìm tới chúng khi
 * họ vừa nhìn thấy con số tiền — mà con số ấy ở đây.
 *
 * NÚT "CHẠY THỬ 12 THÁNG" chạy hoàn toàn bằng engine, không gọi mạng. Đó là
 * điểm của nó: nó trả lời câu hỏi *"thế giới này tự vận động ra sao"* mà không
 * trả lời kèm một hoá đơn. Muốn đo tiền thật thì bật LLM rồi chơi — hoặc chạy
 * Test C của `sim.test.ts`, bài test sinh ra đúng để làm việc ấy.
 */

import { useState, type ReactNode } from 'react';
import { createRngHub } from '@/core/rng';
import {
  costReport,
  nameBookOf,
  powerSnapshots,
  powersAtWar,
  runWorldTick,
  setLlmEnabled,
  setMonthlyCap,
  situationOf,
  tierCounts,
  titleHoldings,
} from '@/sim';
import { currentFaction, currentRegion } from '@/lore/knowledge';
import { applyPatch } from '@/state/mvu';
import { useGameStore } from '@/state/store';
import { useWorld } from '@/ui/world/useWorld';
import { Button } from './controls';

/** Một tháng game = 30 ngày quy ra phút. Đủ để `advanceClock` sang tháng mới. */
const MINUTES_PER_MONTH = 30 * 24 * 60;

function Row({ label, value }: { label: string; value: string }): ReactNode {
  return (
    <div className="flex items-baseline justify-between gap-3 text-[11px]">
      <span className="text-vellum/60">{label}</span>
      <span className="font-mono text-parchment">{value}</span>
    </div>
  );
}

export function SimPanel(): ReactNode {
  const world = useWorld();
  const [running, setRunning] = useState(false);
  const [note, setNote] = useState('');

  if (world === null) {
    return (
      <div className="rounded border border-oak-light bg-ink/60 p-2 text-xs text-vellum/50">
        Slice `world` chưa đăng ký — mô phỏng ngầm không chạy.
      </div>
    );
  }

  const tiers = tierCounts(world.agents);
  // Mẫu số là SỐ THÁNG ĐÃ MÔ PHỎNG, giữ trong ngân sách. Nhật ký có trần nên
  // đếm dòng nhật ký sẽ đứng lại ở 400 và mọi con số mỗi năm sẽ phình ra.
  const cost = costReport(world.budget);

  /** Ghi ngân sách qua MVU (R2) — hai công tắc này nằm trong save. */
  const patchBudget = (next: typeof world.budget, reason: string): void => {
    const store = useGameStore.getState();
    const snapshot = store.snapshot();
    const applied = applyPatch(
      snapshot,
      [{ op: 'set', path: 'world.budget', from: world.budget, to: next, reason, source: 'json' }],
      { actor: 'engine' },
    );
    if (applied.applied && applied.next !== null) store.commitBatch(applied.next);
  };

  /**
   * Tua 12 tháng bằng engine.
   *
   * Chạy TỪNG THÁNG một qua `runWorldTick` chứ không gọi thẳng `runDeepTick` mười
   * hai lần: đường đi thật của một lượt chơi là qua `runWorldTick`, và một nút
   * chạy thử đi đường khác thì nó thử một thứ không ai chơi.
   */
  const dryRun = async (): Promise<void> => {
    setRunning(true);
    setNote('Đang chạy…');
    const started = performance.now();
    let events = 0;
    let arrivals = 0;
    let repairs = 0;

    try {
      for (let month = 0; month < 12; month++) {
        const store = useGameStore.getState();
        const state = store.snapshot();
        const result = await runWorldTick({
          state,
          hub: createRngHub(state.meta.seed, state.meta.rng),
          minutes: MINUTES_PER_MONTH,
          turn: state.meta.turn,
          names: nameBookOf(state),
          deep: {
            playerRegionId: currentRegion(state),
            playerPowerId: currentFaction(state),
            powers: { before: powerSnapshots(state), after: powerSnapshots(state) },
            atWar: powersAtWar(state),
            titles: titleHoldings(state),
            situation: situationOf(state),
            names: nameBookOf(state),
            // KHÔNG truyền `llm`: nút này chạy bằng engine, không sinh hoá đơn.
          },
        });
        if (result.next !== null) store.commitBatch(result.next);
        events += result.report.events.length;
        arrivals += result.report.arrivals.length;
        repairs += result.report.repairs.length;
      }
      setNote(
        `12 tháng trong ${Math.round(performance.now() - started)}ms · ${events} biến cố · ` +
          `${arrivals} tin tới nơi · ${repairs} bất biến đã sửa`,
      );
    } catch (error) {
      setNote(`Chạy thử hỏng: ${String(error)}`);
    } finally {
      setRunning(false);
    }
  };

  return (
    <details open className="rounded border border-oak-light bg-ink/60 p-2">
      <summary className="cursor-pointer text-xs tracking-[0.2em] text-brass uppercase">
        Mô phỏng ngầm — {world.agents.filter((agent) => agent.alive).length} người còn sống
      </summary>

      <div className="mt-2 flex flex-col gap-1">
        <Row label="Agent theo tầng" value={`A ${tiers.A} · B ${tiers.B} · C ${tiers.C}`} />
        <Row label="Tin đang trên đường" value={String(world.inFlight.length)} />
        <Row label="Biến cố trong hàng đợi" value={String(world.events.length)} />
        <Row label="Thẻ chờ quyết định" value={String(world.cards.length)} />
        <Row
          label="Request tháng này"
          value={`${world.budget.requestsUsed}/${world.budget.maxRequestsPerMonth}`}
        />
        <Row label="Tháng đã mô phỏng" value={String(world.budget.monthsSimulated)} />
        <Row label="Token tích luỹ" value={`${cost.tokensIn} vào · ${cost.tokensOut} ra`} />
        <Row label="Chi phí tích luỹ" value={`$${cost.totalUsd.toFixed(4)}`} />
        <Row label="Ước tính mỗi năm game" value={`$${cost.perYearUsd.toFixed(4)}`} />
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1 text-[11px] text-vellum/70">
          <input
            type="checkbox"
            checked={world.budget.llmEnabled}
            onChange={(event) =>
              patchBudget(
                setLlmEnabled(world.budget, event.target.checked),
                event.target.checked ? 'bật LLM trong mô phỏng ngầm' : 'TẮT HẲN LLM trong mô phỏng ngầm',
              )
            }
          />
          dùng LLM trong mô phỏng ngầm
        </label>

        <label className="flex items-center gap-1 text-[11px] text-vellum/70">
          trần request/tháng
          <input
            type="number"
            min={0}
            max={20}
            value={world.budget.maxRequestsPerMonth}
            onChange={(event) =>
              patchBudget(setMonthlyCap(world.budget, Number(event.target.value)), 'đổi trần request mỗi tháng')
            }
            className="w-14 rounded border border-oak-light bg-ink px-1 py-0.5 font-mono text-parchment"
          />
        </label>

        <Button onClick={() => void dryRun()} disabled={running}>
          {running ? 'Đang chạy…' : 'Chạy thử 12 tháng'}
        </Button>
      </div>

      {note !== '' && <p className="mt-1 text-[11px] text-vellum/70">{note}</p>}

      {world.repairs.length > 0 && (
        <div className="mt-2 rounded border border-rust/50 bg-ink/60 p-1.5">
          <p className="text-[10px] tracking-[0.2em] text-rust uppercase">Bất biến đã tự sửa</p>
          <ul className="mt-0.5 flex flex-col gap-0.5 text-[10px] text-vellum/70">
            {world.repairs.slice(-8).map((line, index) => (
              <li key={index}>{line}</li>
            ))}
          </ul>
        </div>
      )}

      <details className="mt-2">
        <summary className="cursor-pointer text-[11px] text-vellum/60">
          Nhật ký tick sâu — {world.log.length} dòng
        </summary>
        <pre className="mt-1 max-h-64 overflow-auto text-[10px] whitespace-pre-wrap text-vellum/70">
          {world.log.length === 0 ? '(chưa có tick sâu nào)' : world.log.slice(-120).join('\n')}
        </pre>
      </details>
    </details>
  );
}
