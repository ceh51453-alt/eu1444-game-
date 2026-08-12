/**
 * LƯỚI CHIẾN TRẬN (Phần 10 mục 14, hai gạch đầu dòng đầu).
 *
 * "Mỗi đơn vị một quân cờ có hướng, cờ hiệu, thanh sĩ khí" và "màu quân cờ đổi
 * theo trạng thái sĩ khí, NHÌN LÀ BIẾT CÁNH NÀO SẮP SỤP".
 *
 * Vế thứ hai là vế quyết định cách vẽ ở dưới. Trận đánh của Phần 10 kết thúc
 * bằng vỡ trận lan truyền, và người chơi chỉ can thiệp kịp nếu họ THẤY được cánh
 * nào đang lung lay từ hai vòng trước. Nên màu quân cờ đọc TRẠNG THÁI SĨ KHÍ chứ
 * không đọc phe — phe đã có hình dạng và cờ hiệu lo. Một bàn cờ tô theo phe thì
 * đẹp hơn và vô dụng: nó nói đúng cái thứ người chơi đã biết.
 *
 * Lưới co giãn tới 50×50, nên mỗi ô nhỏ tới mức không vẽ nổi chi tiết. Thanh sĩ
 * khí chỉ vẽ khi ô đủ rộng; dưới ngưỡng ấy, màu quân cờ gánh toàn bộ thông tin —
 * và đó chính là lý do màu phải mã hóa sĩ khí.
 */

import { useMemo, type ReactNode } from 'react';
import {
  UNIT_STATE_LABELS,
  WING_LABELS,
  battleTerrainOf,
  onField,
  terrainAt,
  type BattleState,
  type BattleUnit,
  type Dir8,
  type SideId,
} from '@/minigames/battle';

export interface BattleGridProps {
  battle: BattleState;
  /** Đơn vị đang được chọn, để tô sáng. */
  selectedId?: string;
  onSelect?: (unitId: string) => void;
  /** Bề rộng tối đa của cả lưới, tính bằng px. */
  maxWidth?: number;
}

const TERRAIN_FILL: Readonly<Record<string, string>> = {
  'dong-bang': '#3a3227',
  duong: '#4a4033',
  ruong: '#3f3a26',
  doi: '#463b28',
  'doi-cao': '#52452e',
  rung: '#26331f',
  bun: '#3b3120',
  'dam-lay': '#2f3324',
  song: '#22303c',
  'cho-loi': '#2c3a42',
  cau: '#443626',
  lang: '#4b3a2c',
};

/** Màu theo TRẠNG THÁI SĨ KHÍ — xem chú thích đầu file. */
const STATE_FILL: Readonly<Record<string, string>> = {
  vung: '#5c8a4a',
  'lung-lay': '#d9a441',
  'nao-nung': '#c9722b',
  'vo-tran': '#b8332b',
  'tan-ra': '#4a3f36',
};

function facingPath(facing: Dir8, size: number): string {
  const half = size / 2;
  const tip = size * 0.44;
  const angle = (facing * Math.PI) / 4;
  const point = (radius: number, offset: number): string => {
    const x = half + radius * Math.sin(angle + offset);
    const y = half - radius * Math.cos(angle + offset);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  };
  return `M ${point(tip, 0)} L ${point(tip * 0.5, 2.5)} L ${point(tip * 0.5, -2.5)} Z`;
}

function Piece({
  unit,
  cell,
  playerSide,
  selected,
  onSelect,
}: {
  unit: BattleUnit;
  cell: number;
  playerSide: SideId;
  selected: boolean;
  onSelect?: (id: string) => void;
}): ReactNode {
  const mine = unit.side === playerSide;
  const share = unit.maxStrength <= 0 ? 0 : Math.max(0, Math.min(1, unit.strength / unit.maxStrength));
  const showBar = cell >= 16;
  const radius = cell * (showBar ? 0.3 : 0.36);

  return (
    <g
      transform={`translate(${unit.pos.x * cell} ${unit.pos.y * cell})`}
      onClick={onSelect === undefined ? undefined : () => onSelect(unit.id)}
      style={onSelect === undefined ? undefined : { cursor: 'pointer' }}
    >
      {/* Hình dạng nói PHE: quân mình vuông, quân địch tròn. Màu để dành cho sĩ khí. */}
      {mine ? (
        <rect
          x={cell / 2 - radius}
          y={cell / 2 - radius}
          width={radius * 2}
          height={radius * 2}
          rx={radius * 0.25}
          fill={STATE_FILL[unit.state] ?? '#5c8a4a'}
          stroke={selected ? '#f4ecd8' : '#1c140e'}
          strokeWidth={selected ? 2 : 1}
          opacity={unit.state === 'tan-ra' ? 0.3 : 1}
        />
      ) : (
        <circle
          cx={cell / 2}
          cy={cell / 2}
          r={radius}
          fill={STATE_FILL[unit.state] ?? '#5c8a4a'}
          stroke={selected ? '#f4ecd8' : '#1c140e'}
          strokeWidth={selected ? 2 : 1}
          opacity={unit.state === 'tan-ra' ? 0.3 : 1}
        />
      )}

      <path d={facingPath(unit.facing, cell)} fill="#f4ecd8" opacity={0.85} />

      {/* Cờ hiệu: một vạch ở góc cho đơn vị người chơi đích thân cầm. */}
      {unit.playerLed && (
        <path d={`M 2 2 L 2 ${cell * 0.4} L ${cell * 0.28} ${cell * 0.16} Z`} fill="#d9a441" />
      )}

      {/* Thanh sĩ khí — chỉ khi ô đủ rộng để nó nói được điều gì. */}
      {showBar && (
        <>
          <rect x={2} y={cell - 5} width={cell - 4} height={3} fill="#1c140e" opacity={0.7} />
          <rect
            x={2}
            y={cell - 5}
            width={(cell - 4) * Math.max(0, Math.min(1, unit.morale / 100))}
            height={3}
            fill={STATE_FILL[unit.state] ?? '#5c8a4a'}
          />
          <rect x={2} y={cell - 9} width={(cell - 4) * share} height={2} fill="#9a8f74" />
        </>
      )}

      <title>
        {`${unit.name} · ${WING_LABELS[unit.wing]}\n${unit.strength}/${unit.maxStrength} quân · sĩ khí ${Math.round(
          unit.morale,
        )} (${UNIT_STATE_LABELS[unit.state]})\nđội hình: ${unit.formation} · đội ngũ ${Math.round(
          unit.cohesion,
        )} · mệt ${Math.round(unit.fatigue)}`}
      </title>
    </g>
  );
}

export function BattleGrid({ battle, selectedId, onSelect, maxWidth = 620 }: BattleGridProps): ReactNode {
  const cell = Math.max(8, Math.floor(maxWidth / battle.grid.width));
  const size = cell * battle.grid.width;

  // Địa hình không đổi trong suốt trận, nên nền chỉ dựng lại khi lưới đổi.
  const ground = useMemo(() => {
    const rects: ReactNode[] = [];
    for (let y = 0; y < battle.grid.height; y++) {
      for (let x = 0; x < battle.grid.width; x++) {
        const terrain = terrainAt(battle.grid, { x, y });
        rects.push(
          <rect
            key={`${x},${y}`}
            x={x * cell}
            y={y * cell}
            width={cell}
            height={cell}
            fill={TERRAIN_FILL[terrain.id] ?? '#3a3227'}
            stroke="rgba(0,0,0,0.35)"
            strokeWidth={0.5}
          />,
        );
      }
    }
    return rects;
  }, [battle.grid, cell]);

  const legend = useMemo(() => {
    const seen = new Set(battle.grid.cells);
    return [...seen]
      .map((id) => battleTerrainOf(id))
      .filter((row): row is NonNullable<typeof row> => row !== null);
  }, [battle.grid]);

  return (
    <figure className="flex flex-col items-center gap-2">
      <svg
        viewBox={`0 0 ${size} ${cell * battle.grid.height}`}
        width={size}
        height={cell * battle.grid.height}
        role="img"
        aria-label={`Chiến trường ${battle.grid.name}, ${battle.grid.width}×${battle.grid.height} ô, mỗi ô ${battle.grid.cellMeters} mét`}
        className="rounded border border-oak-light bg-ink"
      >
        {ground}
        {battle.units
          .filter((unit) => onField(unit))
          .map((unit) => (
            <Piece
              key={unit.id}
              unit={unit}
              cell={cell}
              playerSide={battle.playerSide}
              selected={unit.id === selectedId}
              {...(onSelect === undefined ? {} : { onSelect })}
            />
          ))}
      </svg>

      <figcaption className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[0.65rem] text-parchment/55">
        <span>
          {battle.grid.name} · {battle.grid.width}×{battle.grid.height} ô · một ô ~{battle.grid.cellMeters}m
        </span>
        {(['vung', 'lung-lay', 'nao-nung', 'vo-tran'] as const).map((state) => (
          <span key={state} style={{ color: STATE_FILL[state] }}>
            ▣ {UNIT_STATE_LABELS[state]}
          </span>
        ))}
        <span className="text-parchment/40">{legend.map((row) => row.name).join(' · ')}</span>
      </figcaption>
    </figure>
  );
}
