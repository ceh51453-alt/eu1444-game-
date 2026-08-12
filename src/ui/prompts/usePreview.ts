/**
 * Lắp thử prompt cho panel XEM TRƯỚC (Phần 3 mục 10 và 11).
 *
 * Luôn dùng bộ đếm ƯỚC LƯỢNG chứ không gọi `countTokens` của provider: panel
 * này chạy lại mỗi lần gõ một chữ trong editor, và mỗi lần chạy mà bắn một
 * request đếm token là vừa chậm vừa tốn tiền proxy.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { PromptBlock } from '@/ai/blocks';
import { assemblePrompt, type AssembledPrompt } from '@/ai/pipeline';
import { runtimeBlocksForPreset } from '@/ai/preset/runtime';
import { usePromptStore } from '@/state/prompts';
import { useSettingsStore } from '@/state/settings';
import { useTurnStore } from '@/state/turn';

export interface PromptPreview {
  prompt: AssembledPrompt | null;
  busy: boolean;
  /** Token của từng khối, để dựng thanh ngân sách. */
  tokens: Record<string, number>;
  /** Vì sao khối không vào prompt. */
  skipped: Record<string, string>;
}

const EMPTY: PromptPreview = { prompt: null, busy: true, tokens: {}, skipped: {} };

/**
 * Chữ ký của bộ khối.
 *
 * Người gọi hay truyền vào một mảng dựng tại chỗ (`[block]` khi xem trước một
 * khối đang sửa), nên so sánh theo THAM CHIẾU sẽ khiến effect chạy lại sau mỗi
 * lần render — và vì effect gọi setState, đó là một vòng lặp không đáy.
 */
function signatureOf(blocks: readonly PromptBlock[]): string {
  return blocks
    .map((block) =>
      [
        block.id,
        block.order,
        block.enabled,
        block.role,
        block.budgetPriority,
        JSON.stringify(block.placement),
        block.condition ?? '',
        block.template,
      ].join(''),
    )
    .join('');
}

/**
 * `blocks` truyền vào để xem trước MỘT khối đang sửa; bỏ trống thì lắp cả bộ.
 * `debounceMs` là 300 theo mục 11 — gõ tới đâu render tới đó nhưng không render
 * lại sau từng phím.
 */
export function usePromptPreview(blocks?: readonly PromptBlock[], debounceMs = 300): PromptPreview {
  const stored = usePromptStore((state) => state.blocks);
  const scene = useTurnStore((state) => state.scene);
  const entries = useTurnStore((state) => state.entries);
  const budget = useTurnStore((state) => state.budget);
  // Hai trần token sống trên hồ sơ kết nối chính, không trên store lượt: sửa
  // chúng ở tab Kết nối mà panel xem trước không vẽ lại thì thanh ngân sách nói
  // một con số, còn lượt thật chạy bằng một con số khác.
  const limits = useSettingsStore((state) => state.profiles.main.maxInputTokens);
  const outLimit = useSettingsStore((state) => state.profiles.main.maxOutputTokens);
  const preset = useSettingsStore((state) => state.preset);

  const source = useMemo(
    () => blocks ?? runtimeBlocksForPreset(preset, stored),
    [blocks, preset, stored],
  );
  const signature = useMemo(() => signatureOf(source), [source]);
  const latest = useRef(source);
  latest.current = source;

  const [preview, setPreview] = useState<PromptPreview>(EMPTY);

  useEffect(() => {
    let cancelled = false;
    setPreview((previous) => ({ ...previous, busy: true }));

    const timer = setTimeout(() => {
      void (async () => {
        // `promptInput()` đã mang sẵn ngân sách THẬT (`liveBudget`); ghi đè nó
        // bằng bản trong store là quay lại đúng con số cũ.
        const input = useTurnStore.getState().promptInput();
        const prompt = await assemblePrompt(latest.current, input);
        if (cancelled) return;

        const tokens: Record<string, number> = {};
        const skipped: Record<string, string> = {};
        for (const block of prompt.blocks) {
          tokens[block.id] = block.tokens;
          if (block.skipped !== null) skipped[block.id] = block.skipped;
        }
        setPreview({ prompt, busy: false, tokens, skipped });
      })();
    }, debounceMs);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // `scene` và `entries` nằm trong deps vì prompt render theo cảnh hiện tại.
  }, [signature, scene, entries, budget, limits, outLimit, debounceMs]);

  return preview;
}
