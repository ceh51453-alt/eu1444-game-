/**
 * TRÌNH TẠO NHÂN VẬT (Phần 6 mục 9).
 *
 * Ba cột: danh sách bước bên trái, thân bước ở giữa, phiếu nhân vật xem trước
 * liên tục bên phải — đúng bố cục mục 9 đòi.
 *
 * QUAY LUI ĐƯỢC là ràng buộc cứng, không phải tiện nghi: bấm vào bất kỳ bước
 * nào trong danh sách là nhảy thẳng tới đó, kể cả bước phía trước còn thiếu.
 * Vấn đề của từng bước được HIỆN RA chứ không dùng để khóa đường đi — chỉ nút
 * "Chốt nhân vật" ở bước 9 mới thật sự chặn.
 *
 * RNG dùng dòng `generation`, KHÔNG dùng dòng `main`: bấm "sinh lại gia tộc"
 * thêm một lần mà làm xê dịch dòng xúc sắc của người chơi thì hai ván cùng seed
 * sẽ cho hai chuỗi kết quả khác nhau, và R3 vỡ ngay ở màn hình đầu tiên.
 */

import { useMemo, useRef, useState, type ReactNode } from 'react';
import { RNG_STREAMS, createRng, type Rng } from '@/core/rng';
import { useGameStore } from '@/state/store';
import { Button } from '@/ui/settings/controls';
import {
  CREATION_STEPS,
  allIssues,
  buildInitialState,
  newDraft,
  rollAppearance,
  rollFamily,
  rollNames,
  rollSecrets,
  stepHints,
  stepIndex,
  stepIssues,
  type CharacterDraft,
  type CreationStepId,
} from '@/systems/character';
import { CharacterPreview } from './Preview';
import { StepBody } from './steps';

function defaultSeed(): string {
  return `van-${Date.now().toString(36)}`;
}

/**
 * Bản nháp đã điền sẵn những thứ sinh được bằng RNG.
 *
 * Người chơi mở lên là đã có một nhân vật chạy được và chỉ việc sửa, thay vì
 * nhìn chín bước trống. Vẫn là seeded RNG nên cùng seed cho cùng bản nháp đầu.
 */
function seededDraft(seed: string): CharacterDraft {
  const rng = createRng(`${seed}::${RNG_STREAMS.generation}`);
  let draft = newDraft(seed);
  draft = rollNames(draft, rng);
  draft = rollAppearance(draft, rng);
  draft = rollFamily(draft, rng);
  draft = rollSecrets(draft, rng);
  return draft;
}

export function CharacterCreator({ onClose }: { onClose?: (() => void) | undefined }): ReactNode {
  const [seed] = useState(defaultSeed);
  const [draft, setDraft] = useState<CharacterDraft>(() => seededDraft(seed));
  const [step, setStep] = useState<CreationStepId>('chung-toc');
  const [error, setError] = useState('');
  const loadState = useGameStore((state) => state.loadState);

  // Một dòng RNG duy nhất cho cả phiên tạo nhân vật: mỗi lần bấm "ngẫu nhiên"
  // là rút tiếp, không phải khởi tạo lại — nếu không thì hai lần bấm liên tiếp
  // sẽ cho ra đúng một kết quả.
  const rngRef = useRef<Rng | null>(null);
  if (rngRef.current === null) {
    rngRef.current = createRng(`${seed}::${RNG_STREAMS.generation}::ui`);
  }
  const rng = rngRef.current;

  const issues = useMemo(() => allIssues(draft), [draft]);
  const current = stepIndex(step);

  const go = (delta: number): void => {
    const next = CREATION_STEPS[Math.min(CREATION_STEPS.length - 1, Math.max(0, current + delta))];
    if (next !== undefined) setStep(next.id);
  };

  const confirm = (): void => {
    try {
      loadState(buildInitialState(draft));
      setError('');
      onClose?.();
    } catch (thrown) {
      setError(thrown instanceof Error ? thrown.message : String(thrown));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex bg-ink text-parchment">
      <aside className="flex w-64 shrink-0 flex-col border-r border-oak-light bg-oak">
        <div className="border-b border-oak-light px-4 py-4">
          <p className="text-xs tracking-[0.2em] text-brass uppercase">Tạo nhân vật</p>
          <p className="mt-1 text-xs text-vellum/40">Chín bước, quay lui được</p>
        </div>
        <nav className="flex-1 overflow-y-auto py-2">
          {CREATION_STEPS.map((entry, index) => {
            const problems = stepIssues(draft, entry.id);
            const active = entry.id === step;
            return (
              <button
                key={entry.id}
                type="button"
                onClick={() => setStep(entry.id)}
                className={`flex w-full flex-col gap-0.5 px-4 py-2 text-left hover:bg-oak-light ${
                  active ? 'border-l-2 border-brass bg-oak-light' : 'border-l-2 border-transparent'
                }`}
              >
                <span className={`text-sm ${active ? 'text-brass' : 'text-vellum'}`}>
                  {index + 1}. {entry.name}
                  {problems.length > 0 && <span className="ml-1 text-amber-400">•</span>}
                </span>
                <span className="text-[0.65rem] text-vellum/40">{entry.hint}</span>
              </button>
            );
          })}
        </nav>
        {onClose !== undefined && (
          <div className="border-t border-oak-light px-4 py-3">
            <Button onClick={onClose}>Đóng, giữ ván hiện tại</Button>
          </div>
        )}
      </aside>

      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex items-baseline justify-between border-b border-oak-light px-6 py-4">
          <h2 className="text-lg text-parchment">
            Bước {current + 1}. {CREATION_STEPS[current]?.name}
          </h2>
          <span className="text-xs text-vellum/40">{CREATION_STEPS[current]?.hint}</span>
        </header>

        <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-6 py-4">
          {/* Nhắc nhở KHÔNG chặn — khác hẳn danh sách lỗi ở footer. Chúng nói ra
              thứ người chơi thường quên là mình chọn được. */}
          {stepHints(draft, step).map((hint) => (
            <p key={hint} className="rounded border-l-2 border-brass/60 bg-brass/5 px-3 py-1.5 text-xs text-vellum/70">
              {hint}
            </p>
          ))}
          <StepBody step={step} draft={draft} onChange={setDraft} rng={rng} />
        </div>

        <footer className="flex items-center gap-3 border-t border-oak-light px-6 py-3">
          <Button disabled={current === 0} onClick={() => go(-1)}>
            ← Quay lui
          </Button>
          <Button disabled={current === CREATION_STEPS.length - 1} onClick={() => go(1)}>
            Tiếp →
          </Button>

          <div className="flex-1 truncate text-xs">
            {error !== '' ? (
              <span className="text-red-300">{error}</span>
            ) : issues.length === 0 ? (
              <span className="text-vellum/40">Phiếu nhân vật đã đủ.</span>
            ) : (
              <span className="text-amber-300">
                Còn {issues.length} chỗ chưa xong: {issues[0]}
              </span>
            )}
          </div>

          <Button variant="primary" disabled={issues.length > 0} onClick={confirm}>
            Chốt nhân vật
          </Button>
        </footer>
      </main>

      <aside className="hidden w-80 shrink-0 overflow-y-auto border-l border-oak-light bg-oak xl:block">
        <CharacterPreview draft={draft} />
      </aside>
    </div>
  );
}
