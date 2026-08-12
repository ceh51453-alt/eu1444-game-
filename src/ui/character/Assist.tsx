/**
 * THANH "NHỜ AI" CỦA TRÌNH TẠO NHÂN VẬT (Phần 6 mục 9).
 *
 * Hai đường vào, cùng một cỗ máy ở `systems/character/assist.ts`:
 *   · "Nhờ AI điền bước này"  — chỉ những ô của bước đang mở
 *   · "Dựng cả nhân vật"      — chín bước một lượt, từ một câu mô tả
 *
 * XEM TRƯỚC RỒI MỚI ÁP, không có đường tắt. Một lời gọi AI có thể đổi cùng lúc
 * mười lăm ô ở năm bước khác nhau; áp thẳng thì người chơi mất dấu công mình vừa
 * ngồi bấm, và "quay lui được" của mục 9 chỉ còn là một cái nút. Bảng duyệt ở
 * dưới hiện ĐÚNG bản nháp sẽ được áp — nó không mô tả lại lời AI, nó mô tả kết
 * quả sau khi engine đã kẹp, nên cái người chơi đọc chính là cái họ nhận.
 *
 * Gọi proxy thẳng từ đây chứ không đi qua vòng lặp lượt của Phần 3: đây không
 * phải một lượt chơi — không xúc sắc, không patch MVU, không state. Cùng lối với
 * nút "Đọc diễn biến" của quyết đấu.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { classifyThrown } from '@/ai/errors';
import { getProvider } from '@/ai/provider';
import type { Rng } from '@/core/rng';
import { effectiveConfig, profileReady } from '@/state/settings';
import {
  applyAssist,
  assistPrompt,
  assistTargetLabel,
  parseAssist,
  type AssistOutcome,
  type AssistTarget,
  type CharacterDraft,
  type CreationStepId,
} from '@/systems/character';
import { Button, TextInput } from '@/ui/settings/controls';

/** Trần đầu ra: cả chín bước là một khối JSON dài, một bước thì ngắn hơn hẳn. */
function outputBudget(target: AssistTarget): number {
  return target === 'tat-ca' ? 6000 : 2000;
}

interface Review extends AssistOutcome {
  target: AssistTarget;
}

export function AssistBar({
  draft,
  step,
  rng,
  onApply,
}: {
  draft: CharacterDraft;
  step: CreationStepId;
  rng: Rng;
  onApply: (draft: CharacterDraft) => void;
}): ReactNode {
  const [wish, setWish] = useState('');
  const [busy, setBusy] = useState<AssistTarget | null>(null);
  const [error, setError] = useState('');
  const [raw, setRaw] = useState('');
  const [review, setReview] = useState<Review | null>(null);

  // Bản nháp MỚI NHẤT, không phải bản đã chụp lúc bấm: một lời gọi mất mươi giây
  // và người chơi vẫn sửa tay trong lúc chờ. Áp lên bản cũ là lặng lẽ nuốt mất
  // mấy ô họ vừa gõ.
  const latest = useRef(draft);
  latest.current = draft;

  const inflight = useRef<AbortController | null>(null);
  useEffect(() => () => inflight.current?.abort(), []);

  const ask = async (target: AssistTarget): Promise<void> => {
    if (!profileReady('main')) {
      setError('Chưa cấu hình kết nối AI — mở tab Cài đặt, điền địa chỉ proxy và model cho "Kết nối chính".');
      return;
    }

    inflight.current?.abort();
    const controller = new AbortController();
    inflight.current = controller;
    setBusy(target);
    setError('');
    setRaw('');

    try {
      const prompt = assistPrompt(latest.current, target, wish);
      const cfg = effectiveConfig('main');
      const provider = getProvider(cfg.providerId);
      const response = await provider.stream(
        {
          system: prompt.system,
          messages: [{ role: 'user', content: prompt.user }],
          maxTokens: outputBudget(target),
          signal: controller.signal,
          meta: { profile: 'main' },
        },
        cfg,
        () => undefined,
      );

      const parsed = parseAssist(response.text);
      if (parsed.suggestion === null) {
        setError(parsed.issues.join(' · '));
        setRaw(response.text);
        return;
      }

      const outcome = applyAssist(latest.current, parsed.suggestion, rng);
      setReview({ ...outcome, notes: [...parsed.issues, ...outcome.notes], target });
    } catch (caught) {
      setError(classifyThrown(caught).message);
    } finally {
      if (inflight.current === controller) inflight.current = null;
      setBusy(null);
    }
  };

  const stepLabel = assistTargetLabel(step);

  return (
    <section className="flex flex-col gap-2 rounded border border-brass/40 bg-brass/5 px-3 py-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <TextInput
          value={wish}
          disabled={busy !== null}
          placeholder="Mô tả nhân vật ngài muốn — ví dụ: một tu sĩ Latin bỏ dòng, giỏi chữ nghĩa, đang trốn nợ"
          onChange={(event) => setWish(event.target.value)}
          className="min-w-0 flex-1"
        />
        <div className="flex shrink-0 gap-2">
          <Button className="flex-1 sm:flex-none" disabled={busy !== null} onClick={() => void ask(step)}>
            {busy === step ? 'Đang hỏi…' : `Nhờ AI điền: ${stepLabel}`}
          </Button>
          <Button
            variant="primary"
            className="flex-1 sm:flex-none"
            disabled={busy !== null}
            onClick={() => void ask('tat-ca')}
          >
            {busy === 'tat-ca' ? 'Đang dựng…' : 'Dựng cả nhân vật'}
          </Button>
        </div>
      </div>

      {busy !== null && (
        <div className="flex items-center gap-2 text-xs text-vellum/50">
          <span>Đang hỏi AI phần "{assistTargetLabel(busy)}" — bản nháp chưa đổi gì cho tới khi ngài duyệt.</span>
          <Button onClick={() => inflight.current?.abort()}>Dừng</Button>
        </div>
      )}

      {error !== '' && (
        <div className="flex flex-col gap-1">
          <p className="text-xs text-red-300">{error}</p>
          {raw !== '' && (
            <details className="text-xs text-vellum/40">
              <summary className="cursor-pointer">Xem nguyên văn AI trả về</summary>
              <pre className="mt-1 max-h-40 overflow-auto rounded border border-oak-light bg-ink p-2 whitespace-pre-wrap">
                {raw}
              </pre>
            </details>
          )}
        </div>
      )}

      {review !== null && (
        <AssistReview
          review={review}
          onClose={() => setReview(null)}
          onApply={() => {
            onApply(review.draft);
            setReview(null);
          }}
        />
      )}
    </section>
  );
}

/**
 * BẢNG DUYỆT — trước / sau, cộng danh sách những chỗ engine đã kẹp.
 *
 * Danh sách kẹp KHÔNG được giấu sau một cái toggle: nó là chỗ người chơi thấy
 * ranh giới thật giữa AI và engine ("kẹp INT 18 → 16", "dồn nốt 2 điểm còn
 * thừa"). Giấu đi là để họ tin rằng AI vừa quyết mấy con số đó.
 */
function AssistReview({
  review,
  onApply,
  onClose,
}: {
  review: Review;
  onApply: () => void;
  onClose: () => void;
}): ReactNode {
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-ink/80 p-3"
      role="dialog"
      aria-modal="true"
      aria-label="Duyệt đề nghị của AI"
    >
      <div className="flex max-h-[90dvh] w-full max-w-3xl flex-col rounded border border-brass/50 bg-oak shadow-2xl">
        <header className="flex shrink-0 items-baseline justify-between gap-3 border-b border-oak-light px-4 py-3">
          <h3 className="text-sm tracking-[0.18em] text-brass uppercase">
            AI đề nghị — {assistTargetLabel(review.target)}
          </h3>
          <span className="shrink-0 text-xs text-vellum/40">{review.changes.length} chỗ đổi</span>
        </header>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-3">
          {review.note !== '' && <p className="text-xs text-vellum/60 italic">“{review.note}”</p>}

          {review.changes.length === 0 ? (
            <p className="text-sm text-vellum/50 italic">
              AI không đề nghị đổi gì — thử viết rõ hơn ngài muốn nhân vật thế nào rồi hỏi lại.
            </p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {review.changes.map((change, index) => (
                <div key={`${change.label}-${index}`} className="rounded border border-oak-light bg-ink/40 px-2.5 py-1.5">
                  <p className="text-[0.65rem] tracking-[0.18em] text-brass uppercase">{change.label}</p>
                  <p className="text-xs text-vellum/40 line-through decoration-vellum/30">{change.before || '—'}</p>
                  <p className="text-sm text-parchment">{change.after || '—'}</p>
                </div>
              ))}
            </div>
          )}

          {review.notes.length > 0 && (
            <section className="rounded border border-amber-500/40 bg-amber-500/5 px-2.5 py-2">
              <p className="text-[0.65rem] tracking-[0.18em] text-amber-300 uppercase">Engine đã kẹp lại</p>
              <ul className="mt-1 flex flex-col gap-0.5">
                {review.notes.map((note, index) => (
                  <li key={`${note}-${index}`} className="text-xs text-amber-200/80">
                    · {note}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <footer className="flex shrink-0 flex-col gap-2 border-t border-oak-light px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-vellum/40">
            Áp xong vẫn sửa tay được từng ô, và mọi bước vẫn quay lui được.
          </p>
          <div className="flex gap-2">
            <Button className="flex-1 sm:flex-none" onClick={onClose}>
              Bỏ
            </Button>
            <Button
              variant="primary"
              className="flex-1 sm:flex-none"
              disabled={review.changes.length === 0}
              onClick={onApply}
            >
              Áp vào bản nháp
            </Button>
          </div>
        </footer>
      </div>
    </div>
  );
}
