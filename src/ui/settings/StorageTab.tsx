/**
 * Tab "Lưu trữ" — mặt tiền của ba tầng ở Phần 0 mục 4.
 *
 * Ba việc, và cả ba đều không có chỗ nào khác để ở:
 *
 * 1. NÓI RÕ TẦNG NÀO ĐANG CHẠY. Phần 0 mục 4 xếp "một save lặng lẽ hỏng" là
 *    kiểu hỏng tệ nhất; trình duyệt không có OPFS thì Tầng B vắng mặt, và
 *    người chơi phải biết mình đang mất kho lịch sử chứ không phải mất save.
 * 2. XUẤT / NHẬP. Tầng C tồn tại để sao lưu, chia sẻ, và mở save ra sửa tay lúc
 *    debug — cả ba đều cần một cái nút.
 * 3. Số dòng trong Tầng B, để biết kho có thật sự nhận dữ liệu hay không.
 */

import { useEffect, useState, type ReactNode } from 'react';
import { FileDialogCancelled } from '@/persist/jsonfile';
import { archiveLayer, openStorage, storageStatus } from '@/persist/storage';
import type { TierBCounts } from '@/persist/sqlite';
import { useTurnStore } from '@/state/turn';
import { Button, Warning } from './controls';

function Row({ label, value }: { label: string; value: string }): ReactNode {
  return (
    <div className="flex items-baseline justify-between gap-3 text-xs">
      <span className="text-vellum/60">{label}</span>
      <span className="font-mono text-parchment">{value}</span>
    </div>
  );
}

export function StorageTab(): ReactNode {
  const note = useTurnStore((state) => state.storageNote);
  const savedAt = useTurnStore((state) => state.savedAt);
  const activeSlotId = useTurnStore((state) => state.activeSlotId);
  const store = useTurnStore.getState();

  const [busy, setBusy] = useState<'export' | 'import' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [counts, setCounts] = useState<TierBCounts | null>(null);
  const [opened, setOpened] = useState<string[]>(storageStatus().opened);

  const refresh = async (): Promise<void> => {
    setOpened(storageStatus().opened);
    setCounts((await archiveLayer()?.counts(activeSlotId)) ?? null);
  };

  useEffect(() => {
    void openStorage().then(refresh);
  }, [activeSlotId]);

  const run = async (kind: 'export' | 'import'): Promise<void> => {
    setBusy(kind);
    setMessage(null);
    setProblem(null);
    try {
      setMessage(kind === 'export' ? await store.exportSave() : await store.importSave());
      await refresh();
    } catch (error) {
      // Bấm Hủy trên hộp thoại chọn file KHÔNG phải lỗi, và báo đỏ cho một cú
      // bấm Hủy sẽ dạy người chơi bỏ qua mọi báo đỏ về sau.
      if (!(error instanceof FileDialogCancelled)) setProblem(String(error));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded border border-oak-light bg-ink/60 p-2 text-xs">
        <p className="mb-1 tracking-[0.2em] text-brass uppercase">Ba tầng</p>
        <Row label="Tầng A · state sống" value={opened.includes('indexeddb') ? 'IndexedDB ✓' : '— KHÔNG LƯU ĐƯỢC'} />
        <Row
          label="Tầng B · kho lịch sử"
          value={opened.includes('sqlite-opfs') ? 'SQLite/OPFS ✓' : '— vắng mặt'}
        />
        <Row label="Tầng C · file tay" value="JSON ✓" />
        <p className="mt-1 text-[11px] text-vellum/50">{note}</p>
        <p className="text-[11px] text-vellum/40">
          {savedAt === null
            ? 'Chưa ghi lượt nào xuống đĩa trong phiên này.'
            : `Lượt gần nhất đã ghi lúc ${new Date(savedAt).toLocaleTimeString('vi-VN')}.`}
        </p>
      </div>

      {!opened.includes('sqlite-opfs') && (
        <Warning level="warn">
          Tầng B không chạy: ván chơi vẫn được lưu đầy đủ ở Tầng A, nhưng lịch sử chỉ giữ 200 lượt gần
          nhất và không truy vấn được. Thống kê xúc sắc cũng chỉ tính trên phần còn trong bộ nhớ.
        </Warning>
      )}

      {counts !== null && (
        <div className="rounded border border-oak-light bg-ink/60 p-2 text-xs">
          <p className="mb-1 tracking-[0.2em] text-brass uppercase">Trong kho (Tầng B)</p>
          <Row label="Biên bản lượt" value={String(counts.turns)} />
          <Row label="Lần tung xúc sắc" value={String(counts.checks)} />
          <Row label="Lô cập nhật biến" value={String(counts.patches)} />
        </div>
      )}

      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <Button variant="primary" onClick={() => void run('export')} disabled={busy !== null}>
            {busy === 'export' ? 'Đang xuất…' : 'Xuất ván chơi'}
          </Button>
          <Button onClick={() => void run('import')} disabled={busy !== null}>
            {busy === 'import' ? 'Đang nạp…' : 'Nhập từ file'}
          </Button>
        </div>
        <p className="text-[11px] text-vellum/40">
          File xuất ra gộp state hiện tại với toàn bộ lịch sử lượt, kèm checksum. Nhập vào thì file được
          nâng cấp schema và kiểm bằng Zod TRƯỚC khi ghi — file hỏng thì ván đang chơi không bị đụng tới.
        </p>
      </div>

      {message !== null && <Warning level="info">{message}</Warning>}
      {problem !== null && (
        <p className="rounded border-l-2 border-blood bg-blood/10 px-2 py-1 text-xs text-red-300">{problem}</p>
      )}
    </div>
  );
}
