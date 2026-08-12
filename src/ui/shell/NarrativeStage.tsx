/**
 * Vùng kể chuyện — bước 1 và bước 9 của vòng lặp lượt (Phần 3 mục 12.9).
 *
 * Ô nhập ở dưới là bước 1 (INPUT); vùng cuộn ở trên là bước 9 (RENDER). Ở giữa
 * là toàn bộ những gì Phần 0 tới Phần 3 dựng nên, và đây là lần đầu chúng chạy
 * thông từ đầu tới cuối.
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { applyRegexScripts, type RegexScript } from '@/ai/regex/runner';
import { usePromptStore } from '@/state/prompts';
import { useSettingsStore } from '@/state/settings';
import { useGameStore } from '@/state/store';
import { useTurnStore } from '@/state/turn';
import { characterOf, openingSceneAction } from '@/systems/character';
import type { BuiltEncounter } from '@/systems/encounter';
import { EncounterCard } from '@/ui/encounter';
import { PatchReviewModal } from '@/ui/settings/PatchReviewModal';
import { Button, Warning } from '@/ui/settings/controls';

function DiceLine(): ReactNode {
  const last = useTurnStore((state) => state.last);
  const checks = last?.prompt.blocks.find((block) => block.id === 'ket-qua-xuc-sac');
  if (last === null || checks === undefined) return null;

  return (
    <details className="rounded border border-oak-light bg-oak/40 px-2 py-1 text-xs text-vellum/60">
      <summary className="cursor-pointer text-brass">Kết quả engine đã tung ở lượt này</summary>
      <pre className="mt-1 whitespace-pre-wrap">{checks.text}</pre>
    </details>
  );
}

function PatchLine(): ReactNode {
  const last = useTurnStore((state) => state.last);
  if (last === null || last.ops.length === 0) return null;

  const applied = last.patch?.applied === true;
  return (
    <details className={`rounded border px-2 py-1 text-xs ${applied ? 'border-oak-light text-vellum/60' : 'border-amber-600/60 text-amber-200'}`}>
      <summary className="cursor-pointer">
        {applied ? `Đã ghi ${last.ops.length} biến` : `Lô ${last.ops.length} op bị từ chối`}
        {last.repair === null ? '' : ` · ${last.repair.attempts.length} lần nhờ AI sửa`}
      </summary>
      <ul className="mt-1 flex flex-col gap-0.5">
        {last.ops.map((op, index) => (
          <li key={index}>
            <code>
              {op.op} {op.path}
            </code>{' '}
            — {op.reason}
          </li>
        ))}
        {(last.patch?.failures ?? []).map((failure, index) => (
          <li key={`loi-${index}`} className="text-amber-200">
            ({failure.step}) {failure.message}
          </li>
        ))}
      </ul>
    </details>
  );
}

const NO_ISSUES: readonly string[] = [];

/**
 * Vì sao engine từ chối một lời mời trận đánh.
 *
 * Cùng lý do với hai dòng trên: một lời mời lặng lẽ biến mất là thứ không ai gỡ
 * được, còn một dòng "đã hạ nấc vì không hiểu chữ" thì tra ra trong ba giây.
 */
function EncounterIssues(): ReactNode {
  // Hằng số, không phải `?? []`: zustand so sánh kết quả selector bằng tham
  // chiếu, nên một mảng rỗng dựng mới ở mỗi lần chạy là một vòng render vô tận.
  const issues = useTurnStore((state) => state.last?.encounterIssues ?? NO_ISSUES);
  if (issues.length === 0) return null;

  return (
    <details className="rounded border border-oak-light bg-oak/40 px-2 py-1 text-xs text-vellum/60">
      <summary className="cursor-pointer text-brass">Engine đã xử lý {issues.length} lời mời trận đánh</summary>
      <ul className="mt-1 flex flex-col gap-0.5">
        {issues.map((issue, index) => (
          <li key={index}>{issue}</li>
        ))}
      </ul>
    </details>
  );
}

const NO_SCRIPTS: readonly RegexScript[] = [];

/**
 * Regex phía HIỂN THỊ (Phần 1 mục 6.7).
 *
 * Nửa còn lại của bộ regex: `promptOnly` sửa cái gửi lên AI và đã chạy trong
 * `assemblePrompt`, còn `markdownOnly` sửa cái người chơi đọc — và chỗ duy nhất
 * chạy được nó là ngay trước khi vẽ. Preset thật dùng đúng nó để giấu khối
 * <thinking> đi; không chạy thì mọi đoạn văn đều lòi phần nháp của model ra.
 *
 * Vai `2` (tin nhắn AI): đây là chữ model viết, không phải chữ người chơi gõ.
 */
function useDisplayText(raw: string): string {
  const scripts = useSettingsStore((state) => state.preset?.regexScripts ?? NO_SCRIPTS);
  return useMemo(() => {
    if (scripts.length === 0 || raw === '') return raw;
    return applyRegexScripts(raw, scripts, { placement: 2, target: 'display' }).text;
  }, [raw, scripts]);
}

function Narrative({ text }: { text: string }): ReactNode {
  return <p className="whitespace-pre-wrap text-parchment/90">{useDisplayText(text)}</p>;
}

export interface NarrativeStageProps {
  /** Người chơi nhận lời mời — `App` mở màn hình của minigame tương ứng. */
  onPlayEncounter?: (built: BuiltEncounter) => void;
}

export function NarrativeStage({ onPlayEncounter }: NarrativeStageProps = {}): ReactNode {
  const entries = useTurnStore((state) => state.entries);
  const running = useTurnStore((state) => state.running);
  const streaming = useTurnStore((state) => state.streaming);
  const error = useTurnStore((state) => state.error);
  const canUndo = useTurnStore((state) => state.canUndo);
  const review = useTurnStore((state) => state.review);
  const encounter = useTurnStore((state) => state.encounter);
  const character = useGameStore((state) => characterOf(state));
  const store = useTurnStore.getState();

  const [text, setText] = useState('');
  const bottom = useRef<HTMLDivElement | null>(null);

  // Khối prompt phải sẵn sàng trước khi bấm gửi lượt đầu tiên, và save Tầng A
  // phải được nạp trước khi người chơi kịp gõ gì (Phần 0 mục 4).
  useEffect(() => {
    void usePromptStore.getState().hydrate();
    void useTurnStore.getState().boot();
  }, []);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth' });
  }, [entries, streaming, encounter]);

  /** Nhận lời: dựng ván rồi giao cho `App` mở màn hình toàn màn hình. */
  const playEncounter = (): void => {
    const built = useTurnStore.getState().acceptEncounter();
    if (built !== null && onPlayEncounter !== undefined) onPlayEncounter(built);
  };

  const send = (): void => {
    const action = text.trim();
    if (action === '' || running) return;
    setText('');
    void store.submit(action);
  };

  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto px-8 py-10">
        <div className="mx-auto flex max-w-2xl flex-col gap-6">
          <p className="text-xs tracking-[0.2em] text-brass uppercase">Diễn biến</p>

          {entries.length === 0 && !running && (
            <>
              <p className="text-vellum/50 italic">
                Chưa có gì xảy ra. Gõ một hành động ở dưới để chạy lượt đầu tiên.
              </p>
              {/*
                Phần 5 mục 6 bắt phải nói ra ở MÀN HÌNH ĐẦU, không giấu trong
                phần trợ giúp: hoàn tác khôi phục cả vị trí xúc sắc, nên làm lại
                đúng hành động cũ sẽ ra đúng con xúc sắc cũ. Người chơi phát
                hiện luật này bằng cách thử save-scum rồi thất bại sẽ nghĩ game
                hỏng, chứ không nghĩ đó là thiết kế.
              */}
              <p className="rounded border-l-2 border-brass/60 bg-brass/5 px-3 py-2 text-sm text-vellum/70">
                <b className="text-brass">Không có reroll.</b> Hoàn tác khôi phục cả vị trí xúc sắc:
                làm lại đúng hành động cũ sẽ ra đúng kết quả cũ. Muốn đổi kết quả thì phải đổi hành
                động. Mọi lần tung đều hiện đủ từng dòng điều chỉnh ở bảng bên phải, để ngài luôn
                biết mình hỏng vì cái gì.
              </p>
              {/*
                Phần 6 mục 9, sau bước 9. Nút này ĐIỀN vào ô nhập chứ không tự
                gửi: đoạn mở đầu vẫn đi qua đủ mười bước như mọi lượt khác, và
                người chơi đọc được đúng thứ sắp gửi lên trước khi tốn một lần
                gọi proxy.
              */}
              {character !== null && character.identity.finalized && (
                <div>
                  <Button onClick={() => setText(openingSceneAction(character))}>
                    Soạn lời nhờ AI viết đoạn mở đầu
                  </Button>
                </div>
              )}
            </>
          )}

          {/*
            Khóa theo VỊ TRÍ, không theo số lượt: một lượt có thể sinh hai đoạn —
            đoạn AI viết, rồi đoạn engine kể lại trận đánh vừa xong trong chính
            lượt ấy.
          */}
          {entries.map((entry, index) => (
            <article key={`${String(entry.turn)}-${String(index)}`} className="flex flex-col gap-2">
              <p className="text-xs text-brass/70">
                Lượt {entry.turn} · {entry.action}
                {entry.outcome === '' ? '' : ` · ${entry.outcome}`}
              </p>
              <Narrative text={entry.narrative} />
            </article>
          ))}

          {running && (
            <article className="flex flex-col gap-2">
              <p className="text-xs text-brass/70">Đang viết…</p>
              {/*
                Chữ đang chảy về KHÔNG qua regex hiển thị: mẫu như
                `<thinking>[\s\S]*?</thinking>` chỉ khớp khi thẻ đóng đã tới, nên
                chạy nó trên một đoạn dở dang sẽ lúc ẩn lúc hiện theo từng chunk.
                Đoạn hoàn chỉnh ở trên mới là chỗ nó chạy.
              */}
              <p className="whitespace-pre-wrap text-parchment/70">{streaming}</p>
            </article>
          )}

          {encounter !== null && !running && (
            <EncounterCard
              offer={encounter}
              onPlay={playEncounter}
              onSkip={() => store.skipEncounter()}
            />
          )}

          {error !== null && <Warning level="warn">{error}</Warning>}
          <DiceLine />
          <PatchLine />
          <EncounterIssues />
          <div ref={bottom} />
        </div>
      </div>

      <div className="border-t border-oak-light bg-oak/60 px-8 py-4">
        <div className="mx-auto flex max-w-2xl flex-col gap-2">
          <textarea
            aria-label="Hành động của người chơi"
            rows={2}
            value={text}
            disabled={running}
            placeholder="Hành động của bạn… (Ctrl+Enter để gửi)"
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) send();
            }}
            className="w-full resize-none rounded border border-oak-light bg-ink px-3 py-2 text-sm text-parchment placeholder:text-vellum/30 disabled:cursor-not-allowed"
          />
          <div className="flex items-center gap-2">
            <Button variant="primary" onClick={send} disabled={running || text.trim() === ''}>
              Gửi
            </Button>
            {running && <Button onClick={() => store.cancel()}>Dừng</Button>}
            <Button onClick={() => store.undo()} disabled={running || !canUndo}>
              Hoàn tác
            </Button>
          </div>
        </div>
      </div>

      {/* Vòng sửa lỗi TẦNG 2 (Phần 2 mục 6): AI đã tự sửa hai lần và vẫn hỏng. */}
      {review !== null && (
        <PatchReviewModal
          state={review.state}
          failures={review.failures}
          ops={review.ops}
          onApply={(result, manualOverride) => store.resolveReview(result, manualOverride)}
          onDiscard={() => store.discardReview()}
        />
      )}
    </>
  );
}
