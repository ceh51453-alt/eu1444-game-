/**
 * LƯỚI ĐẤU (Phần 9 mục 11, gạch đầu dòng 1).
 *
 * "Lưới đấu ở giữa, hai đấu sĩ có hướng mặt rõ ràng, ô bị đe dọa tô màu."
 *
 * BA THỨ PHẢI ĐỌC ĐƯỢC TRONG MỘT CÁI LIẾC, và chúng quyết định mọi lựa chọn vẽ
 * ở dưới:
 *   · ai đang quay mặt về đâu — một hình nêm, không phải một chấm tròn
 *   · ô nào vũ khí của TÔI với tới, ô nào vũ khí của HẮN với tới
 *   · ô nào đi được, ô nào là bàn ghế, ô nào là mép hụt
 *
 * Vùng chồng lấn của hai tầm với là chỗ trận đấu thật sự diễn ra, nên nó được
 * tô riêng: đứng trong đó nghĩa là cả hai cùng đánh được nhau, còn đứng trong
 * tầm mình mà ngoài tầm hắn là chỗ đứng đáng mơ ước của mục 2.
 */

import { useMemo, type ReactNode } from 'react';
import {
  distance,
  terrainAt,
  threatenedCells,
  type ArenaState,
  type Cell,
  type Dir8,
  type Fighter,
} from '@/minigames/duel';

export interface ArenaGridProps {
  arena: ArenaState;
  a: Fighter;
  b: Fighter;
  /** Bên người chơi đang cầm. Tầm với của bên này tô đậm hơn. */
  playerSide: 'a' | 'b';
  cellSize?: number;
}

const TERRAIN_FILL: Readonly<Record<string, string>> = {
  'bang-phang': '#3a3227',
  'bun-lay': '#4a3d24',
  'da-lom-chom': '#45443f',
  doc: '#3f3a2c',
  'nuoc-nong': '#2b3a44',
  'ban-ghe': '#241d16',
  vuc: '#16110d',
};

function keyOf(cell: Cell): string {
  return `${cell.x},${cell.y}`;
}

/** Mũi nêm chỉ hướng mặt. Tám hướng, quay theo chiều kim đồng hồ từ bắc. */
function facingPath(facing: Dir8, size: number): string {
  const half = size / 2;
  const tip = size * 0.42;
  const angle = (facing * Math.PI) / 4;
  const point = (radius: number, offset: number): string => {
    const x = half + radius * Math.sin(angle + offset);
    const y = half - radius * Math.cos(angle + offset);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  };
  return `M ${point(tip, 0)} L ${point(tip * 0.55, 2.4)} L ${point(tip * 0.55, -2.4)} Z`;
}

export function ArenaGrid({ arena, a, b, playerSide, cellSize = 34 }: ArenaGridProps): ReactNode {
  const mine = playerSide === 'a' ? a : b;
  const theirs = playerSide === 'a' ? b : a;

  const myReach = useMemo(
    () => new Set(threatenedCells(arena, mine.pos, mine.loadout.weapon.reach).map(keyOf)),
    [arena, mine.pos.x, mine.pos.y, mine.loadout.weaponId],
  );
  const foeReach = useMemo(
    () => new Set(threatenedCells(arena, theirs.pos, theirs.loadout.weapon.reach).map(keyOf)),
    [arena, theirs.pos.x, theirs.pos.y, theirs.loadout.weaponId],
  );

  const width = arena.width * cellSize;
  const height = arena.height * cellSize;
  const gap = distance(a.pos, b.pos);

  return (
    <figure className="flex flex-col items-center gap-2">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        role="img"
        aria-label={`Đấu trường ${arena.name}, ${arena.width}×${arena.height} ô, hai người cách nhau ${gap} ô`}
        className="rounded border border-oak-light bg-ink"
      >
        {Array.from({ length: arena.height }, (_, y) =>
          Array.from({ length: arena.width }, (_, x) => {
            const cell = { x, y };
            const terrain = terrainAt(arena, cell);
            const key = keyOf(cell);
            const inMine = myReach.has(key);
            const inFoe = foeReach.has(key);

            return (
              <g key={key} transform={`translate(${x * cellSize} ${y * cellSize})`}>
                <rect
                  width={cellSize}
                  height={cellSize}
                  fill={TERRAIN_FILL[terrain.id] ?? '#3a3227'}
                  stroke="rgba(0,0,0,0.45)"
                  strokeWidth={1}
                />
                {/* Ô bị đe dọa. Chồng lấn = chỗ cả hai cùng với tới nhau. */}
                {inMine && (
                  <rect width={cellSize} height={cellSize} fill="#d9a441" opacity={inFoe ? 0.3 : 0.18} />
                )}
                {inFoe && !inMine && <rect width={cellSize} height={cellSize} fill="#b8332b" opacity={0.16} />}
                {!terrain.passable && (
                  <path
                    d={`M 4 4 L ${cellSize - 4} ${cellSize - 4} M ${cellSize - 4} 4 L 4 ${cellSize - 4}`}
                    stroke="rgba(217,201,138,0.35)"
                    strokeWidth={2}
                  />
                )}
                {terrain.outOfBounds && (
                  <rect
                    x={2}
                    y={2}
                    width={cellSize - 4}
                    height={cellSize - 4}
                    fill="none"
                    stroke="rgba(184,51,43,0.55)"
                    strokeDasharray="3 3"
                  />
                )}
                <title>{`(${x},${y}) ${terrain.name}`}</title>
              </g>
            );
          }),
        )}

        {[a, b].map((fighter) => (
          <g
            key={fighter.side}
            transform={`translate(${fighter.pos.x * cellSize} ${fighter.pos.y * cellSize})`}
          >
            <circle
              cx={cellSize / 2}
              cy={cellSize / 2}
              r={cellSize * 0.3}
              fill={fighter.side === playerSide ? '#d9a441' : '#b8332b'}
              stroke="#1c140e"
              strokeWidth={1.5}
              opacity={fighter.prone ? 0.45 : 1}
            />
            <path d={facingPath(fighter.facing, cellSize)} fill="#f4ecd8" opacity={0.9} />
            <title>{`${fighter.name}${fighter.prone ? ' (đang nằm)' : ''}`}</title>
          </g>
        ))}
      </svg>

      <figcaption className="text-xs text-parchment/60">
        {arena.name} · {arena.width}×{arena.height} ô · cách nhau {gap} ô
        <span className="ml-3 text-brass">▣ tầm của ngài</span>
        <span className="ml-2 text-[#b8332b]">▣ tầm của hắn</span>
      </figcaption>
    </figure>
  );
}
