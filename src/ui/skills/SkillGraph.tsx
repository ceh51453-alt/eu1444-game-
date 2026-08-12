/**
 * ĐỒ THỊ NHÁNH DẠNG GRAPH KÉO THẢ (Phần 8 mục 11).
 *
 * Bốn trạng thái, bốn cách vẽ khác nhau, và khác biệt giữa chúng phải nhìn thấy
 * được trong nửa giây:
 *
 *   đã mở            sáng, viền đồng
 *   đủ điều kiện     viền nhấp nháy, HIỆN GIÁ ngay trên thẻ
 *   thiếu điều kiện  mờ, hover nói ĐÚNG cái đang thiếu
 *   bí truyền chưa biết   KHÔNG vẽ, kể cả dạng mờ
 *
 * Cột suy từ độ sâu tiên quyết chứ không gõ tay tọa độ: thêm một node vào file
 * data là nó tự có chỗ đứng, và không ai phải nhớ đi sửa một bảng vị trí ở chỗ
 * khác. Dây nối vẽ bằng SVG nằm dưới, thẻ node là HTML nằm trên — chữ tiếng Việt
 * trong `<text>` của SVG thì không xuống dòng được, mà mô tả nhánh thì cần.
 */

import { useMemo, useRef, useState, type ReactNode } from 'react';
import { kindName, nodeOf, usableInNames, type NodeView } from '@/systems/skills';

const CARD_WIDTH = 190;
const CARD_HEIGHT = 92;
const COLUMN_GAP = 90;
const ROW_GAP = 26;

interface Placed extends NodeView {
  x: number;
  y: number;
}

function place(views: readonly NodeView[]): Placed[] {
  const columns = new Map<number, NodeView[]>();
  for (const view of views) {
    const bucket = columns.get(view.layer) ?? [];
    bucket.push(view);
    columns.set(view.layer, bucket);
  }

  const placed: Placed[] = [];
  for (const [layer, bucket] of [...columns.entries()].sort(([left], [right]) => left - right)) {
    bucket.forEach((view, index) => {
      placed.push({
        ...view,
        x: layer * (CARD_WIDTH + COLUMN_GAP),
        y: index * (CARD_HEIGHT + ROW_GAP),
      });
    });
  }
  return placed;
}

function toneFor(status: NodeView['status']): string {
  switch (status) {
    case 'unlocked':
      return 'border-brass bg-brass/10 text-parchment';
    case 'ready':
      return 'border-emerald-400 bg-emerald-400/5 text-parchment animate-pulse';
    default:
      return 'border-oak-light bg-oak/40 text-vellum/40';
  }
}

export function SkillGraph({
  views,
  onUnlock,
  onStance,
  activeStance,
}: {
  views: readonly NodeView[];
  onUnlock: (nodeId: string) => void;
  onStance: (nodeId: string) => void;
  activeStance: string;
}): ReactNode {
  const [offset, setOffset] = useState({ x: 20, y: 20 });
  const [selected, setSelected] = useState<string | null>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);

  const placed = useMemo(() => place(views), [views]);
  const byId = useMemo(() => new Map(placed.map((node) => [node.node.id, node] as const)), [placed]);

  const width = Math.max(...placed.map((node) => node.x + CARD_WIDTH), 400) + 60;
  const height = Math.max(...placed.map((node) => node.y + CARD_HEIGHT), 300) + 60;

  const edges: { from: Placed; to: Placed; optional: boolean }[] = [];
  for (const node of placed) {
    const prereq = node.node.prereq;
    for (const id of prereq.nodes) {
      const from = byId.get(id);
      if (from !== undefined) edges.push({ from, to: node, optional: false });
    }
    for (const id of prereq.anyOfNodes) {
      const from = byId.get(id);
      if (from !== undefined) edges.push({ from, to: node, optional: true });
    }
  }

  const chosen = selected === null ? null : byId.get(selected) ?? null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        className="relative min-h-0 flex-1 cursor-grab overflow-hidden rounded border border-oak-light bg-ink/60 active:cursor-grabbing"
        onPointerDown={(event) => {
          drag.current = { x: event.clientX - offset.x, y: event.clientY - offset.y };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const start = drag.current;
          if (start === null) return;
          setOffset({ x: event.clientX - start.x, y: event.clientY - start.y });
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
      >
        <div
          className="absolute origin-top-left"
          style={{ transform: `translate(${offset.x}px, ${offset.y}px)`, width, height }}
        >
          <svg width={width} height={height} className="absolute inset-0 overflow-visible">
            {edges.map((edge, index) => {
              const x1 = edge.from.x + CARD_WIDTH;
              const y1 = edge.from.y + CARD_HEIGHT / 2;
              const x2 = edge.to.x;
              const y2 = edge.to.y + CARD_HEIGHT / 2;
              const mid = (x1 + x2) / 2;
              return (
                <path
                  key={`${edge.from.node.id}-${edge.to.node.id}-${index}`}
                  d={`M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`}
                  fill="none"
                  stroke={edge.to.status === 'unlocked' ? '#c9a227' : '#57493a'}
                  strokeWidth={1.5}
                  strokeDasharray={edge.optional ? '4 4' : undefined}
                />
              );
            })}
          </svg>

          {placed.map((view) => {
            const node = view.node;
            const isStance = node.kind === 'stance';
            const stanceOn = isStance && activeStance === node.id;
            return (
              <button
                key={node.id}
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setSelected(node.id);
                }}
                title={view.missing.join('\n')}
                style={{ left: view.x, top: view.y, width: CARD_WIDTH, minHeight: CARD_HEIGHT }}
                className={`absolute flex flex-col gap-0.5 rounded border p-2 text-left transition-colors ${toneFor(
                  view.status,
                )} ${selected === node.id ? 'ring-1 ring-brass' : ''}`}
              >
                <span className="text-[0.7rem] leading-tight font-semibold">{node.name}</span>
                <span className="text-[0.6rem] text-vellum/50">
                  {kindName(node.kind)}
                  {stanceOn && <span className="text-brass"> · ĐANG BẬT</span>}
                </span>
                {view.status === 'ready' && (
                  <span className="text-[0.62rem] text-emerald-300">{view.cost} điểm KN</span>
                )}
                {view.status === 'locked' && view.missing[0] !== undefined && (
                  <span className="truncate text-[0.6rem] text-vellum/40">{view.missing[0]}</span>
                )}
              </button>
            );
          })}
        </div>

        <p className="pointer-events-none absolute right-2 bottom-1 text-[0.6rem] text-vellum/30">
          kéo để xem · nét đứt là "một trong số"
        </p>
      </div>

      {/* --- Thẻ chi tiết của node đang chọn --------------------------------- */}
      {chosen !== null && (
        <div className="mt-2 rounded border border-oak-light bg-oak/40 p-2">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-sm text-parchment">{chosen.node.name}</p>
            <span className="text-[0.65rem] text-vellum/50">{kindName(chosen.node.kind)}</span>
          </div>
          <p className="mt-0.5 text-xs text-vellum/60 italic">{chosen.node.description}</p>
          {chosen.node.usableIn.length > 0 && (
            <p className="mt-1 text-[0.65rem] text-vellum/40">Dùng được ở: {usableInNames(chosen.node)}</p>
          )}

          {chosen.node.effects.length > 0 && (
            <div className="mt-1 flex flex-col gap-0.5">
              {chosen.node.effects.map((effect, index) => (
                <p key={index} className="text-[0.65rem] text-vellum/60">
                  <span className={effect.value < 0 ? 'text-red-300' : 'text-emerald-300'}>
                    {effect.value > 0 ? '+' : ''}
                    {effect.value}
                  </span>{' '}
                  ở {effect.domains.join(', ')}
                  {effect.whenAnyTag.length > 0 && ` — chỉ khi ${effect.whenAnyTag.join(' / ')}`}
                  {effect.unlessAnyTag.length > 0 && ` — trừ khi ${effect.unlessAnyTag.join(' / ')}`}
                </p>
              ))}
            </div>
          )}

          {chosen.missing.length > 0 && (
            <div className="mt-1 flex flex-col gap-0.5">
              {chosen.missing.map((line) => (
                <p key={line} className="text-[0.65rem] text-amber-300">
                  {line}
                </p>
              ))}
            </div>
          )}

          <div className="mt-1.5 flex gap-1.5">
            {chosen.status === 'ready' && (
              <button
                type="button"
                onClick={() => onUnlock(chosen.node.id)}
                className="rounded border border-brass px-2 py-1 text-[0.68rem] text-brass hover:bg-brass/10"
              >
                Mở nhánh — {chosen.cost} điểm KN
              </button>
            )}
            {chosen.status === 'unlocked' && chosen.node.kind === 'stance' && (
              <button
                type="button"
                onClick={() => onStance(activeStance === chosen.node.id ? '' : chosen.node.id)}
                className="rounded border border-oak-light px-2 py-1 text-[0.68rem] text-vellum hover:bg-oak-light"
              >
                {activeStance === chosen.node.id ? 'Bỏ thế này' : 'Vào thế này'}
              </button>
            )}
            {chosen.node.kind === 'breakthrough' && chosen.status !== 'unlocked' && (
              <p className="text-[0.65rem] text-vellum/40 italic">
                Không mua được. Nó xảy ra trong một hoàn cảnh cực hạn, hoặc không bao giờ.
              </p>
            )}
          </div>

          {chosen.node.source !== undefined && (
            <p className="mt-1 text-[0.62rem] text-vellum/40">
              Người giữ: {chosen.node.source.npc === '' ? '—' : loreName(chosen.node.source.npc)}
              {chosen.node.source.organization !== '' && ` · ${chosen.node.source.organization}`}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** Id lorebook → tên đọc được, để thẻ node không in ra `npc_isolde`. */
function loreName(id: string): string {
  return id
    .replace(/^npc_/u, '')
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

/** Node có tồn tại không — dùng cho những chỗ chỉ giữ id. */
export function hasNode(id: string): boolean {
  return nodeOf(id) !== null;
}
