/**
 * BỘ CHỌN GIA TỘC — dùng chung cho bước 2 (nhà của mình) và bước 6 (nhà của
 * người thân).
 *
 * Vì sao không phải một thẻ `<select>`: có 130 gia tộc. Một danh sách phẳng còn
 * dùng được ở ba mươi dòng, ở một trăm ba mươi thì người chơi chỉ cuộn chứ không
 * chọn. Nên có ô tìm (bỏ dấu, khớp cả tên vùng, chủng tộc và tên người đứng đầu)
 * và xếp nhóm theo vùng — vì người ta nhớ một gia tộc ở ĐÂU trước khi nhớ nó tên
 * gì.
 */

import { useMemo, useState, type ReactNode } from 'react';
import { regionName } from '@/lore/regions';
import { TextInput } from '@/ui/settings/controls';
import {
  houseHasLoreHead,
  houseHeadName,
  housesByGroup,
  raceName,
  searchHouses,
  type House,
} from '@/systems/character';

export function HousePicker({
  houses,
  value,
  onChange,
  emptyLabel,
}: {
  houses: readonly House[];
  value: string;
  onChange: (houseId: string) => void;
  emptyLabel: string;
}): ReactNode {
  const [query, setQuery] = useState('');
  const groups = useMemo(() => housesByGroup(searchHouses(query, houses)), [query, houses]);
  const total = groups.reduce((sum, group) => sum + group.houses.length, 0);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <TextInput
          value={query}
          placeholder="Tìm theo tên nhà, vùng, chủng tộc, người đứng đầu…"
          onChange={(event) => setQuery(event.target.value)}
        />
        <span className="shrink-0 text-xs text-vellum/40">{total} nhà</span>
      </div>

      <div className="max-h-64 overflow-y-auto rounded border border-oak-light">
        <button
          type="button"
          onClick={() => onChange('')}
          className={`flex w-full px-2 py-1.5 text-left text-sm hover:bg-oak-light ${
            value === '' ? 'bg-oak-light text-brass' : 'text-vellum/60'
          }`}
        >
          {emptyLabel}
        </button>

        {groups.map((group) => (
          <div key={group.group}>
            <p className="sticky top-0 bg-oak px-2 py-1 text-[0.6rem] tracking-widest text-brass uppercase">
              {regionName(group.group)}
            </p>
            {group.houses.map((house) => (
              <button
                key={house.id}
                type="button"
                onClick={() => onChange(house.id)}
                className={`flex w-full items-baseline gap-2 px-2 py-1.5 text-left text-sm hover:bg-oak-light ${
                  house.id === value ? 'bg-oak-light text-brass' : 'text-vellum'
                }`}
              >
                <span className="w-44 shrink-0 truncate">{house.name}</span>
                <span className="w-28 shrink-0 truncate text-xs text-vellum/50">{raceName(house.race)}</span>
                <span className="flex-1 truncate text-xs text-vellum/40" title={house.note}>
                  {houseHeadName(house.id)}
                  {/* Dấu sao phân biệt nhà có nhân vật THẬT trong lorebook với
                      nhà chỉ có một cái tên sinh ra cho hợp vùng. Người chơi cần
                      biết mình sắp gắn vào ai. */}
                  {houseHasLoreHead(house.id) ? ' ★' : ''}
                </span>
              </button>
            ))}
          </div>
        ))}

        {total === 0 && <p className="px-2 py-3 text-xs text-vellum/40 italic">Không có nhà nào khớp.</p>}
      </div>
      <p className="text-[0.65rem] text-vellum/30">★ = người đứng đầu là nhân vật có thật trong lorebook.</p>
    </div>
  );
}
