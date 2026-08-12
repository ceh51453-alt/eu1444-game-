/**
 * Modal "Kiểm duyệt biến" — VÒNG SỬA LỖI TẦNG 2 (Phần 2 mục 6).
 *
 * Mở ra sau khi AI đã tự sửa 2 lần mà vẫn fail. Mỗi dòng là một op còn lỗi,
 * sửa được trực tiếp, có cột giá trị thật để đối chiếu.
 *
 * "Áp dụng dù sao" bỏ qua B2 và B6 nhưng KHÔNG BAO GIỜ bỏ qua B5 — phá kiểu là
 * hỏng save, còn vượt trần chỉ là lệch cân bằng.
 */

import { useState, type ReactNode } from 'react';
import { applyPatch, type ApplyResult, type OpFailure, type PatchOp } from '@/state/mvu';
import { readPath, type GameState } from '@/state/slices';
import { Button, TextInput } from './controls';

export interface PatchReviewProps {
  state: GameState;
  failures: readonly OpFailure[];
  /** Lô op gốc, để giữ lại những op vốn đã hợp lệ. */
  ops: readonly PatchOp[];
  onApply(result: ApplyResult, manualOverride: boolean): void;
  onDiscard(): void;
}

interface Row {
  op: PatchOp;
  failure: OpFailure | null;
  /** Giá trị mới, người chơi sửa được, dạng JSON. */
  text: string;
  skipped: boolean;
  force: boolean;
}

function toText(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value) ?? '';
  } catch {
    return String(value);
  }
}

function parseText(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export function PatchReviewModal({
  state,
  failures,
  ops,
  onApply,
  onDiscard,
}: PatchReviewProps): ReactNode {
  const [rows, setRows] = useState<Row[]>(() =>
    ops.map((op) => ({
      op,
      failure: failures.find((failure) => failure.op === op) ?? null,
      text: toText(op.to),
      skipped: false,
      force: false,
    })),
  );
  const [result, setResult] = useState<ApplyResult | null>(null);

  const patch = (index: number, changes: Partial<Row>): void => {
    setRows((previous) =>
      previous.map((row, position) => (position === index ? { ...row, ...changes } : row)),
    );
  };

  const run = (): void => {
    const kept = rows.filter((row) => !row.skipped);
    const forced = kept.some((row) => row.force);
    const nextOps: PatchOp[] = kept.map((row) => ({
      ...row.op,
      to: row.op.op === 'delete' ? row.op.to : parseText(row.text),
      // Người chơi đã nhìn giá trị thật ngay trên màn hình này, nên không cần
      // bắt họ gõ lại giá trị cũ cho compare-and-swap.
      from: row.op.op === 'set' ? readPath(state, row.op.path) : row.op.from,
      reason: `${row.op.reason} (sửa tay)`,
    }));

    const applied = applyPatch(state, nextOps, {
      actor: 'player',
      skipPermissions: forced,
      skipBounds: forced,
    });
    setResult(applied);
    if (applied.applied) onApply(applied, forced || rows.some((row) => row.skipped));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/80 p-6">
      <div className="flex max-h-full w-full max-w-3xl flex-col overflow-hidden rounded border border-brass/50 bg-oak">
        <header className="border-b border-oak-light px-4 py-3">
          <h2 className="text-sm tracking-[0.2em] text-brass uppercase">Kiểm duyệt biến</h2>
          <p className="mt-1 text-xs text-amber-300">
            Đây là chế độ debug. Dùng nhiều sẽ làm lệch cân bằng game.
          </p>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <table className="w-full text-xs">
            <thead className="text-vellum/50">
              <tr>
                <th className="p-1 text-left">Đường dẫn</th>
                <th className="p-1 text-left">Giá trị thật</th>
                <th className="p-1 text-left">Giá trị mới</th>
                <th className="p-1 text-left">Lỗi</th>
                <th className="p-1" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr
                  key={`${row.op.path}-${index}`}
                  className={`border-t border-oak-light ${row.skipped ? 'opacity-40' : ''}`}
                >
                  <td className="p-1 align-top font-mono text-vellum">
                    {row.op.op}: {row.op.path}
                  </td>
                  <td className="p-1 align-top font-mono text-parchment">
                    {toText(readPath(state, row.op.path))}
                  </td>
                  <td className="p-1 align-top">
                    <TextInput
                      value={row.text}
                      disabled={row.skipped || row.op.op === 'delete'}
                      onChange={(event) => patch(index, { text: event.target.value })}
                    />
                  </td>
                  <td className="p-1 align-top text-red-300">
                    {row.failure === null ? '—' : `${row.failure.step}: ${row.failure.message}`}
                  </td>
                  <td className="p-1 align-top">
                    <div className="flex flex-col gap-1">
                      <Button onClick={() => patch(index, { skipped: !row.skipped })}>
                        {row.skipped ? 'Dùng lại' : 'Bỏ qua op này'}
                      </Button>
                      <Button
                        variant={row.force ? 'danger' : 'normal'}
                        onClick={() => patch(index, { force: !row.force })}
                        title="Bỏ qua quyền ghi và ràng buộc phạm vi. Không bao giờ bỏ qua kiểm kiểu."
                      >
                        {row.force ? 'Đang ép ✓' : 'Áp dụng dù sao'}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {result !== null && !result.applied && (
            <div className="mt-3 rounded border border-blood bg-blood/10 p-2 text-xs text-red-200">
              <p className="mb-1 font-semibold">Vẫn chưa áp được:</p>
              {result.failures.map((failure, index) => (
                <p key={index}>
                  {failure.op.path} — {failure.step}: {failure.message}
                </p>
              ))}
            </div>
          )}
        </div>

        <footer className="flex gap-2 border-t border-oak-light px-4 py-3">
          <Button variant="primary" onClick={run}>
            Áp dụng tất cả
          </Button>
          <Button variant="danger" onClick={onDiscard}>
            Bỏ toàn bộ lô
          </Button>
        </footer>
      </div>
    </div>
  );
}
