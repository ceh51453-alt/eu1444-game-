/**
 * CHẾ ĐỘ XEM CHE PHỦ — MÀN HÌNH QUAN TRỌNG NHẤT CỦA PHẦN 16 (mục 18).
 *
 * Dùng CHÍNH hình người của Phần 7, không vẽ một cái bóng thứ hai: nếu hai màn
 * hình vẽ hai thân người khác nhau thì người chơi phải tự khớp "vai trái ở đây"
 * với "vai trái ở kia", và cả ý đồ "nhìn là biết mình yếu chỗ nào" tan mất.
 * `buildSilhouette` là hàm đó, và nó nhận đúng `Build` mà Phần 6 sinh ra.
 *
 * HAI CHẾ ĐỘ trên cùng một hình:
 *   `giap`    món giáp vẽ chồng lên đúng vùng nó che, tô theo loại giáp
 *   `che-phu` tô theo MỨC che phủ, và vùng còn hở NHẤP NHÁY ĐỎ
 *
 * Nhấp nháy chỉ dành cho vùng hở dưới 85%: giáp tấm nào cũng hở vài phần trăm ở
 * khớp, và cho tất cả cùng nháy thì cái nháy không còn nghĩa gì.
 */

import { useMemo, type CSSProperties, type ReactNode } from 'react';
import { AVERAGE_BUILD, buildSilhouette, centroidOf, type Build } from '@/ui/bodymap/silhouette';
import type { RegionView } from './view';

export type CoverageMode = 'giap' | 'che-phu';

export interface CoverageBodyProps {
  regions: readonly RegionView[];
  mode: CoverageMode;
  view: 'truoc' | 'sau';
  build?: Build;
  skinColor?: string;
  selected?: string | null;
  onSelect?: (regionId: string) => void;
  height?: number;
}

const DEFAULT_HEIGHT = 380;
const DEFAULT_SKIN = '#c9a227';

export function CoverageBody({
  regions,
  mode,
  view,
  build = AVERAGE_BUILD,
  skinColor = DEFAULT_SKIN,
  selected = null,
  onSelect,
  height = DEFAULT_HEIGHT,
}: CoverageBodyProps): ReactNode {
  // Cùng luật cứng với `BodyMap` của Phần 7: hình dựng lại khi DÁNG NGƯỜI đổi,
  // màu đi qua biến CSS. Mặc thêm một mảnh giáp không được ném đi cả cây DOM.
  const silhouette = useMemo(() => buildSilhouette(build), [build.musclePct, build.fatPct]);
  const paths = view === 'truoc' ? silhouette.front : silhouette.back;
  const byId = useMemo(() => new Map(regions.map((region) => [region.regionId, region])), [regions]);

  const style = useMemo(() => {
    const out: Record<string, string> = {};
    for (const id of Object.keys(paths)) {
      const region = byId.get(id);
      if (region === undefined) {
        out[`--cover-${id}`] = skinColor;
        continue;
      }
      out[`--cover-${id}`] =
        mode === 'che-phu' ? region.color : region.coverage > 0 ? region.color : skinColor;
      out[`--coverop-${id}`] = mode === 'che-phu' ? '1' : region.coverage > 0 ? '0.92' : '1';
    }
    return out as CSSProperties;
  }, [paths, byId, mode, skinColor]);

  const entries = Object.entries(paths);

  return (
    <svg
      viewBox={silhouette.viewBox}
      style={style}
      height={height}
      role="img"
      aria-label={`Bản đồ che phủ giáp, mặt ${view === 'truoc' ? 'trước' : 'sau'}`}
      className="mx-auto block"
    >
      <defs>
        <pattern id="cover-hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="5" stroke="#f5e6c8" strokeWidth="1" opacity="0.35" />
        </pattern>
        <style>{`
          @keyframes cover-gap { 0%,100% { opacity: .15 } 50% { opacity: .85 } }
          .cover-gap { animation: cover-gap 1.1s ease-in-out infinite; }
          .cover-region {
            transition: fill .3s ease;
            cursor: pointer;
            stroke-linejoin: round;
          }
          .cover-region:hover { filter: brightness(1.2); }
        `}</style>
      </defs>

      {entries.map(([id, d]) => (
        <path
          key={id}
          id={id}
          d={d}
          className="cover-region"
          fill={`var(--cover-${id}, ${skinColor})`}
          fillOpacity={`var(--coverop-${id}, 1)`}
          stroke={selected === id ? '#f5e6c8' : 'rgba(28,20,14,0.55)'}
          strokeWidth={selected === id ? 2 : 0.9}
          onClick={() => onSelect?.(id)}
        >
          <title>{byId.get(id)?.tooltip ?? id}</title>
        </path>
      ))}

      {/* Lớp kim loại: gạch chéo mờ trên vùng CÓ giáp, để chế độ `giap` đọc được
          là "chỗ này có gì đó" ngay cả khi hai loại giáp gần cùng màu. */}
      {mode === 'giap' &&
        entries.map(([id, d]) => {
          const region = byId.get(id);
          if (region === undefined || region.coverage <= 0) return null;
          return <path key={`plate-${id}`} d={d} fill="url(#cover-hatch)" pointerEvents="none" />;
        })}

      {/* VÙNG HỞ NHẤP NHÁY ĐỎ — câu của mục 18, và là thứ người chơi nhìn thấy
          trước tiên khi mở màn hình này. */}
      {mode === 'che-phu' &&
        entries.map(([id, d]) => {
          const region = byId.get(id);
          if (region === undefined || !region.blink) return null;
          return <path key={`gap-${id}`} d={d} className="cover-gap" fill="#b8332b" pointerEvents="none" />;
        })}

      {/* Chấm đánh dấu khe hở CÓ TÊN — nách, bẹn, khe mắt. Chỉ những chỗ đặc tả
          gọi tên mới có chấm: một dấu ở mọi vùng là không dấu ở đâu cả. */}
      {mode === 'che-phu' &&
        entries.map(([id, d]) => {
          const region = byId.get(id);
          if (region === undefined || region.gapName === '' || region.coverage >= 100) return null;
          const [cx, cy] = centroidOf(d);
          return (
            <circle key={`mark-${id}`} cx={cx} cy={cy} r={3} fill="#f5e6c8" stroke="#b8332b" strokeWidth={1}>
              <title>{region.gapName}</title>
            </circle>
          );
        })}
    </svg>
  );
}
