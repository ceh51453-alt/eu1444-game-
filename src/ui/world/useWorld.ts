/**
 * ĐỌC SLICE `world` TỪ REACT — và lý do file này tồn tại là một cái bẫy có thật.
 *
 * `useGameStore((store) => worldStateOf(store))` trông đúng và chạy sai. `zustand`
 * dựng trên `useSyncExternalStore`, mà `useSyncExternalStore` so sánh kết quả
 * selector bằng `Object.is`. `worldStateOf` gọi `safeParse` của Zod, và Zod trả
 * về một OBJECT MỚI mỗi lần — nên React thấy giá trị đổi ở mọi lần đọc, render
 * lại, đọc lại, và quay vòng cho tới khi vượt trần độ sâu cập nhật.
 *
 * Cùng cái bẫy mà `StatusPanel` đã ghi chú cho `snapshot()`, chỉ khác cửa vào.
 *
 * Cách thoát: CHỌN THAM CHIẾU THÔ của slice — nó ổn định vì store dùng `immer`
 * và chỉ thay object khi slice thật sự đổi — rồi mới parse trong `useMemo`.
 */

import { useMemo } from 'react';
import { worldStateOf, type WorldSliceState } from '@/sim';
import type { GameState } from '@/state/slices';
import { useGameStore } from '@/state/store';

export function useWorld(): WorldSliceState | null {
  const raw = useGameStore((store) => (store as unknown as Record<string, unknown>)['world']);
  return useMemo(() => worldStateOf({ world: raw } as unknown as GameState), [raw]);
}
