/**
 * BẢN ĐỒ LƯỚI THÀNH TRÌ — Phần 12 mục 11, gạch đầu dòng thứ nhất.
 *
 * > "Bản đồ lưới thành trì, kéo thả đặt công trình, **hiện trước hiệu ứng kề nhau**"
 *
 * Vế thứ ba là vế quan trọng nhất và cũng là vế dễ bỏ nhất. Mục 4 nói "KỀ NHAU
 * CÓ Ý NGHĨA", nhưng ý nghĩa ấy chỉ tồn tại nếu người chơi THẤY nó TRƯỚC khi
 * đặt. Đặt xong rồi mới biết xưởng thuộc da làm cả khu nhà bên cạnh bỏ đi thì
 * đó không phải một quyết định quy hoạch, đó là một cái bẫy — và game này không
 * có reroll, nên bẫy là thứ duy nhất không được phép có.
 *
 * Nên khi rê một công trình qua một ô, khung bên phải hiện ĐỦ HAI VẾ:
 * cái công trình ấy NHẬN được, và cái nó GÂY RA cho hàng xóm.
 */

import { useState, type DragEvent, type ReactNode } from 'react';
import {
  buildingOf,
  canPlace,
  cellsOf,
  previewPlacement,
  terrainOf,
  type Cell,
  type Holding,
  type PlacementPreview,
} from '@/systems/holding';

/** Màu nền theo địa hình. Nhìn bản đồ là biết chỗ nào đáng đặt cối xay. */
const TERRAIN_COLOURS: Readonly<Record<string, string>> = {
  'dat-tot': '#4a5230',
  'dat-can': '#453e30',
  song: '#26404f',
  suoi: '#2f4a52',
  doi: '#4a4230',
  'da-goc': '#3d3d3d',
  'mo-sat': '#4a3a35',
  rung: '#2f4230',
  dam: '#333a33',
};

const GROUP_COLOURS: Readonly<Record<string, string>> = {
  'san-xuat': '#8a7a3a',
  'quan-su': '#7a2020',
  'dan-sinh': '#7a6a4a',
  'ton-giao': '#5a4a7a',
  'hanh-chinh': '#3a5a7a',
  'hoc-van': '#3a7a6a',
  'phong-thu': '#6a6a6a',
  'dac-thu-toc': '#7a4a6a',
};

export interface HoldingGridProps {
  holding: Holding;
  /** Công trình đang chọn trong bảng chọn, rỗng là không chọn gì. */
  selected: string;
  onPlace: (buildingId: string, at: Cell) => void;
}

export function HoldingGrid({ holding, selected, onPlace }: HoldingGridProps): ReactNode {
  const [hover, setHover] = useState<Cell | null>(null);
  const [preview, setPreview] = useState<PlacementPreview | null>(null);

  const size = holding.gridSize;
  const building = selected === '' ? null : buildingOf(selected);

  const ghost: Cell[] =
    building === null || hover === null || building.perimeter ? [] : cellsOf(building, hover);
  const ghostSet = new Set(ghost.map((cell) => `${String(cell.x)},${String(cell.y)}`));
  const check = building === null || hover === null ? null : canPlace(holding, selected, hover);

  const enter = (cell: Cell): void => {
    setHover(cell);
    if (building === null) return;
    // Xem trước tính ngay lúc rê, không đợi bấm — xem chú thích đầu file.
    setPreview(previewPlacement(holding, selected, cell, { besieged: holding.besieged }));
  };

  const drop = (event: DragEvent, cell: Cell): void => {
    event.preventDefault();
    const id = event.dataTransfer.getData('text/plain') || selected;
    if (id === '') return;
    if (!canPlace(holding, id, cell).ok) return;
    onPlace(id, cell);
  };

  return (
    <div className="flex min-h-0 gap-4">
      <div className="flex flex-col gap-2">
        <div
          className="grid gap-px rounded border border-oak-light bg-oak-light p-px"
          style={{ gridTemplateColumns: `repeat(${String(size)}, minmax(0, 1fr))`, width: `${String(Math.min(560, size * 34))}px` }}
          onMouseLeave={() => {
            setHover(null);
            setPreview(null);
          }}
        >
          {holding.tiles.map((tile) => {
            const key = `${String(tile.x)},${String(tile.y)}`;
            const occupant =
              tile.occupiedBy === ''
                ? null
                : holding.buildings.find((row) => row.id === tile.occupiedBy) ?? null;
            const occupantBuilding = occupant === null ? null : buildingOf(occupant.buildingId);
            const underConstruction =
              tile.occupiedBy !== '' && occupant === null
                ? holding.projects.find((row) => row.id === tile.occupiedBy) ?? null
                : null;
            const isGhost = ghostSet.has(key);
            const bad = isGhost && check !== null && !check.ok;

            const background =
              occupantBuilding !== null
                ? GROUP_COLOURS[occupantBuilding.group] ?? '#555'
                : underConstruction !== null
                  ? '#5a4a20'
                  : TERRAIN_COLOURS[tile.terrain] ?? '#3a3a3a';

            return (
              <button
                key={key}
                type="button"
                title={tileTitle(tile.terrain, occupantBuilding?.name ?? '', underConstruction !== null)}
                onMouseEnter={() => enter({ x: tile.x, y: tile.y })}
                onDragOver={(event) => {
                  event.preventDefault();
                  enter({ x: tile.x, y: tile.y });
                }}
                onDrop={(event) => drop(event, { x: tile.x, y: tile.y })}
                onClick={() => {
                  if (selected === '') return;
                  if (!canPlace(holding, selected, { x: tile.x, y: tile.y }).ok) return;
                  onPlace(selected, { x: tile.x, y: tile.y });
                }}
                className="aspect-square text-[9px] leading-none"
                style={{
                  backgroundColor: background,
                  outline: isGhost ? `2px solid ${bad ? '#7a2020' : '#b08d4f'}` : 'none',
                  outlineOffset: '-2px',
                }}
              >
                {occupantBuilding === null ? (underConstruction === null ? '' : '⌂') : occupantBuilding.name.slice(0, 2)}
              </button>
            );
          })}
        </div>
        <TerrainLegend holding={holding} />
      </div>

      <div className="min-w-56 flex-1 text-xs">
        {building === null && <p className="text-vellum/70">Chọn một công trình bên dưới rồi rê lên ô đất.</p>}
        {building !== null && check !== null && !check.ok && (
          <p className="rounded border border-blood/60 bg-blood/10 p-2 text-blood">{check.reason}</p>
        )}
        {building !== null && preview !== null && check?.ok === true && (
          <PreviewPanel name={building.name} preview={preview} />
        )}
      </div>
    </div>
  );
}

function tileTitle(terrain: string, occupant: string, building: boolean): string {
  const name = terrainOf(terrain)?.name ?? terrain;
  if (occupant !== '') return `${occupant} — trên ${name}`;
  if (building) return `đang xây — trên ${name}`;
  return name;
}

function TerrainLegend({ holding }: { holding: Holding }): ReactNode {
  const present = [...new Set(holding.tiles.map((tile) => tile.terrain))];
  return (
    <div className="flex flex-wrap gap-2 text-[10px] text-vellum/70">
      {present.map((id) => (
        <span key={id} className="flex items-center gap-1">
          <span
            className="inline-block h-2 w-2 rounded-sm"
            style={{ backgroundColor: TERRAIN_COLOURS[id] ?? '#3a3a3a' }}
          />
          {terrainOf(id)?.name ?? id}
        </span>
      ))}
    </div>
  );
}

/**
 * HAI VẾ CỦA MỘT CHỖ ĐẶT.
 *
 * Vế "hàng xóm chịu gì" nằm dưới và không bao giờ được rút gọn thành một con số
 * tổng: xưởng thuộc da không mất gì khi đứng cạnh nhà ở, nhà ở mới là bên chịu,
 * và một con số tổng cộng lại sẽ giấu mất chính điều đó.
 */
function PreviewPanel({ name, preview }: { name: string; preview: PlacementPreview }): ReactNode {
  return (
    <div className="flex flex-col gap-2 rounded border border-oak-light bg-oak/60 p-2">
      <h4 className="text-xs font-semibold tracking-wide text-brass">{name} — đặt ở đây</h4>

      {preview.gains.length === 0 ? (
        <p className="text-vellum/60">Không có hiệu ứng kề nhau nào ở ô này.</p>
      ) : (
        <ul className="flex flex-col gap-0.5">
          {preview.gains.map((line) => (
            <li key={line.ruleId} className={line.value >= 0 ? 'text-parchment' : 'text-blood'}>
              {line.value >= 0 ? '+' : ''}
              {line.mode === 'factor' ? `${String(Math.round(line.value * 100))}%` : line.value.toFixed(1)}{' '}
              <span className="text-vellum/70">{effectName(line.effect)}</span>
              {line.stacks > 1 && <span className="text-vellum/50"> ×{line.stacks}</span>}
            </li>
          ))}
        </ul>
      )}

      {preview.neighbours.length > 0 && (
        <div className="border-t border-oak-light pt-2">
          <p className="mb-1 text-[10px] tracking-widest text-brass uppercase">Hàng xóm chịu</p>
          <ul className="flex flex-col gap-0.5">
            {preview.neighbours.map((row) => (
              <li key={row.buildingId} className="text-vellum/80">
                {row.name}
                {row.lines
                  .filter((line) => line.value < 0)
                  .map((line) => (
                    <span key={line.ruleId} className="text-blood">
                      {' '}
                      {line.mode === 'factor'
                        ? `${String(Math.round(line.value * 100))}%`
                        : line.value.toFixed(1)}{' '}
                      {effectName(line.effect)}
                    </span>
                  ))}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function effectName(effect: string): string {
  const names: Record<string, string> = {
    output: 'sản lượng',
    happiness: 'hạnh phúc',
    beauty: 'vẻ đẹp',
    faith: 'ảnh hưởng tôn giáo',
    trade: 'thương mại',
    upkeep: 'chi phí duy trì',
    hygiene: 'vệ sinh',
    siegeWeeks: 'tuần cầm cự',
    wallIntegrity: 'độ bền tường',
    buildSpeed: 'tốc độ xây',
  };
  return names[effect] ?? effect;
}
