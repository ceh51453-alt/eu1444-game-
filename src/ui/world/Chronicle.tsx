/**
 * BIÊN NIÊN SỬ và BẢN ĐỒ TRI THỨC — hai mục cuối của Phần 15 mục 11.
 *
 * **BIÊN NIÊN SỬ:** *"xem lại toàn bộ theo năm, lọc được, tìm được."* Khác dòng
 * tin ở cột phải đúng một chỗ, và chỗ ấy quan trọng: dòng tin trả lời *"có gì
 * mới"*, biên niên sử trả lời *"chuyện ấy xảy ra năm nào, và lúc ấy ta biết bao
 * nhiêu"*. Vì thế nó nhóm theo NĂM XẢY RA, không theo ngày tin tới — một trận
 * đánh năm 1447 mà ta chỉ nghe được năm 1449 vẫn phải nằm ở năm 1447.
 *
 * **BẢN ĐỒ TRI THỨC:** *"vùng nào mình nắm rõ, vùng nào chỉ nghe đồn, vùng nào
 * mù tịt."* Đọc biến phụ `banDoTriThuc` chứ không tự tính: một bảng UI tự tính
 * lấy độ rõ là một công thức thứ hai cho cùng một câu hỏi, và nó sẽ lệch với
 * công thức thật ngay lần cân bằng đầu tiên.
 *
 * VÙNG MÙ TỊT KHÔNG ĐƯỢC LIỆT KÊ HẾT. Danh sách 121 vùng với 110 dòng "mù tịt"
 * không nói gì cả; cái người chơi cần thấy là mình đang sáng ở đâu và tối ở đâu
 * NGAY CẠNH chỗ mình sáng.
 */

import { useMemo, useState, type ReactNode } from 'react';
import { regionName } from '@/lore/regions';
import { anchorOf, edgesFrom, filterFeed, type ArrivedNews, type FeedFilter } from '@/sim';
import { NewsItemRow } from './NewsFeed';

/** Vùng kề bên trên đồ thị tuyến đường — chỗ tin tới được sớm nhất nếu có tin. */
function neighboursOf(regionId: string): string[] {
  const anchor = anchorOf(regionId);
  if (anchor === null) return [];
  return [...new Set(edgesFrom(anchor).map((edge) => edge.to))];
}

export interface ChronicleProps {
  feed: readonly ArrivedNews[];
}

export function Chronicle({ feed }: ChronicleProps): ReactNode {
  const [filter, setFilter] = useState<FeedFilter>({ scope: 'tat-ca' });
  const [year, setYear] = useState<number | null>(null);

  const years = useMemo(() => {
    const set = new Set(feed.map((item) => item.occurredAt.year));
    return [...set].sort((left, right) => right - left);
  }, [feed]);

  const shown = useMemo(
    () => filterFeed(feed, year === null ? filter : { ...filter, year }),
    [feed, filter, year],
  );

  const grouped = useMemo(() => {
    const map = new Map<number, ArrivedNews[]>();
    for (const item of shown) {
      const list = map.get(item.occurredAt.year) ?? [];
      list.push(item);
      map.set(item.occurredAt.year, list);
    }
    return [...map.entries()].sort((left, right) => right[0] - left[0]);
  }, [shown]);

  return (
    <section className="flex min-h-0 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={filter.search ?? ''}
          onChange={(event) => setFilter((current) => ({ ...current, search: event.target.value }))}
          placeholder="Tìm trong biên niên sử…"
          className="min-w-0 flex-1 rounded border border-oak-light bg-ink px-2 py-1 text-xs text-parchment placeholder:text-vellum/30"
        />
        <select
          value={year === null ? '' : String(year)}
          onChange={(event) => setYear(event.target.value === '' ? null : Number(event.target.value))}
          className="rounded border border-oak-light bg-ink px-2 py-1 text-xs text-vellum"
        >
          <option value="">mọi năm</option>
          {years.map((value) => (
            <option key={value} value={value}>
              năm {value}
            </option>
          ))}
        </select>
        <select
          value={String(filter.minImportance ?? 1)}
          onChange={(event) => setFilter((current) => ({ ...current, minImportance: Number(event.target.value) }))}
          className="rounded border border-oak-light bg-ink px-2 py-1 text-xs text-vellum"
        >
          {[1, 2, 3, 4, 5].map((level) => (
            <option key={level} value={level}>
              từ mức {level}
            </option>
          ))}
        </select>
      </div>

      {grouped.length === 0 ? (
        <p className="text-xs text-vellum/45 italic">Chưa có gì để chép lại.</p>
      ) : (
        <div className="min-h-0 overflow-y-auto rounded border border-oak-light bg-ink/40">
          {grouped.map(([value, items]) => (
            <div key={value}>
              <h3 className="sticky top-0 bg-oak px-3 py-1 text-[11px] tracking-[0.2em] text-brass uppercase">
                Năm {value} · {items.length} mục
              </h3>
              <ul>
                {items.map((item) => (
                  <NewsItemRow key={item.id} item={item} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Bản đồ tri thức
// ---------------------------------------------------------------------------

export interface KnowledgeRow {
  regionId: string;
  clarity: number;
  reports: number;
  level: string;
}

const LEVEL_TONE: Readonly<Record<string, string>> = {
  'biet-ro': 'border-brass text-parchment',
  'nghe-noi': 'border-oak-light text-vellum/80',
  'mu-tit': 'border-oak text-vellum/40',
};

const LEVEL_LABEL: Readonly<Record<string, string>> = {
  'biet-ro': 'nắm rõ',
  'nghe-noi': 'chỉ nghe đồn',
  'mu-tit': 'mù tịt',
};

export interface KnowledgeMapProps {
  rows: readonly KnowledgeRow[];
  /** Vùng người chơi đang đứng — hàng xóm của nó là chỗ đáng nhìn nhất. */
  hereRegionId: string;
}

export function KnowledgeMap({ rows, hereRegionId }: KnowledgeMapProps): ReactNode {
  const known = new Map(rows.map((row) => [row.regionId, row]));

  // Hàng xóm chưa có tin nào: đây mới là thông tin thật sự hữu ích — "ngay bên
  // cạnh ngài có một chỗ ngài không biết gì cả".
  const blind = useMemo(
    () => neighboursOf(hereRegionId).filter((id) => !known.has(id)),
    [hereRegionId, known],
  );

  return (
    <section className="flex flex-col gap-2">
      <p className="text-[11px] text-vellum/50">
        Độ rõ tính từ số tin đã tới và độ tin cậy của chúng, cộng với tai mắt ngài đã cài ở đó.
      </p>

      {rows.length === 0 ? (
        <p className="text-xs text-vellum/45 italic">Chưa có tin nào từ bất cứ đâu.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {rows.slice(0, 24).map((row) => (
            <li
              key={row.regionId}
              className={`flex items-center justify-between gap-3 rounded border px-2 py-1 ${
                LEVEL_TONE[row.level] ?? 'border-oak text-vellum/50'
              }`}
            >
              <span className="truncate text-xs">{regionName(row.regionId)}</span>
              <span className="flex shrink-0 items-center gap-2">
                <span className="h-1 w-16 overflow-hidden rounded bg-ink">
                  <span className="block h-full bg-brass" style={{ width: `${String(row.clarity)}%` }} />
                </span>
                <span className="font-mono text-[10px]">{row.clarity}%</span>
                <span className="text-[10px] text-vellum/45">{LEVEL_LABEL[row.level] ?? row.level}</span>
              </span>
            </li>
          ))}
        </ul>
      )}

      {blind.length > 0 && (
        <div className="rounded border border-oak bg-ink/40 px-2 py-1.5">
          <p className="text-[10px] tracking-[0.2em] text-vellum/40 uppercase">Ngay bên cạnh mà mù tịt</p>
          <p className="mt-0.5 text-xs text-vellum/60">{blind.map(regionName).join(' · ')}</p>
        </div>
      )}
    </section>
  );
}
