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
 * TRÊN ĐIỆN THOẠI ba cột đó gập lại thành một. Cột bước 256px và cột phiếu 320px
 * ăn hết một màn hình 375px, nên dưới `md` cả hai rời khỏi dòng chảy: danh sách
 * bước thành một dải chip cuộn ngang ngay dưới tiêu đề, còn phiếu nhân vật thành
 * một ngăn kéo mở bằng nút ở thanh dưới. Cả hai vẫn phải với tới được bằng một
 * cú chạm — "quay lui được" và "xem trước liên tục" là ràng buộc của mục 9, chứ
 * không phải tiện nghi của riêng bản desktop.
 *
 * RNG dùng dòng `generation`, KHÔNG dùng dòng `main`: bấm "sinh lại gia tộc"
 * thêm một lần mà làm xê dịch dòng xúc sắc của người chơi thì hai ván cùng seed
 * sẽ cho hai chuỗi kết quả khác nhau, và R3 vỡ ngay ở màn hình đầu tiên.
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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
import { AssistBar } from './Assist';
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
  // Phiếu nhân vật trên điện thoại: cùng một component với cột phải, chỉ khác
  // chỗ đứng. Dưới `xl` nó là ngăn kéo; từ `xl` trở lên cột phải đã hiện sẵn nên
  // nút mở ngăn kéo biến mất.
  const [sheetOpen, setSheetOpen] = useState(false);
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

  // Dải chip cuộn ngang chỉ dùng được nếu bước đang mở luôn nằm trong tầm nhìn:
  // bấm "Tiếp" tới bước 7 mà chip vẫn đứng ở bước 1 thì người chơi mất dấu mình
  // đang ở đâu.
  //
  // Tự tính `scrollLeft` thay vì gọi `scrollIntoView`: hàm kia không cuộn gì cả
  // khi hệ điều hành bật giảm chuyển động, và nó còn kéo theo mọi khung cuộn cha
  // — ở đây là thân bước đang cuộn dọc.
  const strip = useRef<HTMLDivElement | null>(null);
  const activeChip = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    const rail = strip.current;
    const chip = activeChip.current;
    if (rail === null || chip === null) return;
    const centred = chip.offsetLeft - (rail.clientWidth - chip.offsetWidth) / 2;
    rail.scrollLeft = Math.max(0, Math.min(centred, rail.scrollWidth - rail.clientWidth));
  }, [step]);

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
    <div className="character-creator fixed inset-0 z-50 flex h-[100dvh] flex-col bg-ink text-parchment md:flex-row">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-oak-light bg-oak md:flex">
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

      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex flex-col gap-1 border-b border-oak-light px-4 py-3 md:flex-row md:items-baseline md:justify-between md:px-6 md:py-4">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="min-w-0 truncate text-base text-parchment md:text-lg">
              Bước {current + 1}. {CREATION_STEPS[current]?.name}
            </h2>
            {/* Cột trái giữ nút đóng cho bản desktop; dưới `md` cột đó không còn,
                nên nút phải có mặt ở đây — nếu không thì người chơi mở nhầm trình
                tạo nhân vật là mắc kẹt, không quay lại ván đang chạy được. */}
            {onClose !== undefined && (
              <Button className="shrink-0 md:hidden" onClick={onClose}>
                Đóng
              </Button>
            )}
          </div>
          <span className="text-xs text-vellum/40">{CREATION_STEPS[current]?.hint}</span>
        </header>

        <div ref={strip} className="flex shrink-0 gap-1.5 overflow-x-auto border-b border-oak-light px-3 py-2 md:hidden">
          {CREATION_STEPS.map((entry, index) => {
            const problems = stepIssues(draft, entry.id);
            const active = entry.id === step;
            return (
              <button
                key={entry.id}
                ref={active ? activeChip : undefined}
                type="button"
                onClick={() => setStep(entry.id)}
                aria-current={active ? 'step' : undefined}
                className={`shrink-0 rounded border px-2.5 py-1.5 text-xs whitespace-nowrap ${
                  active ? 'border-brass bg-oak-light text-brass' : 'border-oak-light text-vellum/70'
                }`}
              >
                {index + 1}. {entry.name}
                {problems.length > 0 && <span className="ml-1 text-amber-400">•</span>}
              </button>
            );
          })}
        </div>

        <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-4 md:px-6">
          {/* Nhờ AI điền giúp. Đứng ĐẦU thân bước chứ không nép xuống chân trang:
              người mở trình tạo nhân vật lần đầu phải thấy ngay rằng mình không
              bắt buộc phải tự nghĩ ra chín bước. */}
          <AssistBar draft={draft} step={step} rng={rng} onApply={setDraft} />

          {/* Nhắc nhở KHÔNG chặn — khác hẳn danh sách lỗi ở footer. Chúng nói ra
              thứ người chơi thường quên là mình chọn được. */}
          {stepHints(draft, step).map((hint) => (
            <p key={hint} className="rounded border-l-2 border-brass/60 bg-brass/5 px-3 py-1.5 text-xs text-vellum/70">
              {hint}
            </p>
          ))}
          <StepBody step={step} draft={draft} onChange={setDraft} rng={rng} />
        </div>

        <footer className="flex shrink-0 flex-col gap-2 border-t border-oak-light px-4 py-3 md:flex-row md:items-center md:gap-3 md:px-6">
          {/* Dòng lỗi lên TRƯỚC hàng nút khi xếp dọc: nó là lý do nút "Chốt" đang
              bị khóa, nên nó phải nằm trong tầm mắt trước khi tay chạm tới nút. */}
          <div className="order-first min-w-0 text-xs md:order-none md:flex-1 md:truncate">
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

          <div className="flex items-center gap-2 md:contents">
            <Button className="flex-1 md:flex-none" disabled={current === 0} onClick={() => go(-1)}>
              ← Quay lui
            </Button>
            <Button
              className="flex-1 md:flex-none"
              disabled={current === CREATION_STEPS.length - 1}
              onClick={() => go(1)}
            >
              Tiếp →
            </Button>
            {/* Cột phiếu chỉ hiện từ `xl`, nên nút này phải sống tới tận `xl` —
                máy tính bảng 768–1279px cũng không có cột phải. */}
            <Button className="flex-1 md:flex-none xl:hidden" onClick={() => setSheetOpen(true)}>
              Phiếu
            </Button>
          </div>

          <Button
            className="shrink-0"
            variant="primary"
            disabled={issues.length > 0}
            onClick={confirm}
          >
            Chốt nhân vật
          </Button>
        </footer>
      </main>

      <aside className="hidden w-80 shrink-0 overflow-y-auto border-l border-oak-light bg-oak xl:block">
        <CharacterPreview draft={draft} />
      </aside>

      {sheetOpen && (
        <div
          className="fixed inset-0 z-[60] flex justify-end bg-ink/75 xl:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Phiếu nhân vật"
        >
          <button
            type="button"
            aria-label="Đóng phiếu nhân vật"
            onClick={() => setSheetOpen(false)}
            className="min-w-0 flex-1"
          />
          <aside className="flex h-full w-[min(24rem,92vw)] flex-col border-l border-brass/50 bg-oak shadow-2xl">
            {/* Không lặp lại tiêu đề: `CharacterPreview` đã tự in "Phiếu nhân
                vật" ở đầu phiếu, nên thanh này chỉ giữ đường thoát. */}
            <div className="flex shrink-0 justify-end border-b border-oak-light px-4 py-2">
              <Button onClick={() => setSheetOpen(false)}>Đóng</Button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <CharacterPreview draft={draft} />
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
