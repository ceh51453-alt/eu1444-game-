/**
 * BẢN ĐỒ CƠ THỂ SVG (Phần 7 mục 4).
 *
 * LUẬT CỨNG: hình vẽ MỘT LẦN, đổi màu qua biến CSS. Đó là lý do `<path>` nằm
 * trong `useMemo` chỉ phụ thuộc dáng người, còn màu thì đi qua `style` của thẻ
 * `<svg>` dưới dạng `--body-<id>`. Vẽ lại toàn bộ hình mỗi khi một vết đổi từ
 * cam sang đỏ là ném đi cả cây DOM ở mỗi lượt, và mọi hiệu ứng chuyển màu sẽ
 * giật.
 *
 * BẢNG MÀU của mục 4, và luật chồng lớp: tình trạng NẶNG NHẤT làm màu nền, mọi
 * thứ khác hiện bằng lớp phủ.
 *
 *   lành lặn        màu da theo chủng tộc      nhiễm trùng   viền xanh lục lan dần
 *   xây xát → chí mạng  vàng nhạt → đỏ thẫm    sốt cao       toàn thân ám hồng
 *   đang chảy máu   giọt nhấp nháy theo mức    hoại tử       đen
 *   sẹo cũ          tím nhạt mờ                tàn phế       xám sẫm, gạch chéo
 *   cụt chi         vùng BIẾN MẤT, còn mỏm cụt bo tròn
 */

import { useMemo, type CSSProperties, type ReactNode } from 'react';
import type { RegionStatus } from '@/systems/body';
import { regionColor } from '@/systems/body';
import {
  AVERAGE_BUILD,
  VIEW_BOX,
  bboxOf,
  buildSilhouette,
  centroidOf,
  type Build,
} from './silhouette';

export interface BodyMapProps {
  statuses: Map<string, RegionStatus>;
  view: 'truoc' | 'sau';
  build?: Build;
  /** Màu da theo chủng tộc (Phần 6 `appearance.skin`). */
  skinColor?: string;
  fever?: number;
  selected?: string | null;
  onSelect?: (regionId: string) => void;
  height?: number;
}

/**
 * Chiều cao mặc định của hình.
 *
 * Bề ngang KHÔNG chỉnh được bằng khung nhìn: thân người cao gấp gần bốn lần bề
 * ngang, nên bề ngang trên màn hình luôn do chiều cao quyết định. Muốn cái bóng
 * to hơn thì chỉ có một nút, và đây là nút đó.
 */
const DEFAULT_HEIGHT = 360;

/** Màu da mặc định khi nhân vật chưa dựng ngoại hình. */
const DEFAULT_SKIN = '#c9a227';

/** Nhịp nhấp nháy của giọt máu: chảy càng mạnh, nháy càng nhanh. */
function dripDuration(bleeding: number): string {
  const seconds = Math.max(0.35, 1.8 - Math.min(1.4, bleeding / 8));
  return `${Math.round(seconds * 100) / 100}s`;
}

export function BodyMap({
  statuses,
  view,
  build = AVERAGE_BUILD,
  skinColor = DEFAULT_SKIN,
  fever = 0,
  selected = null,
  onSelect,
  height = DEFAULT_HEIGHT,
}: BodyMapProps): ReactNode {
  // Hình chỉ dựng lại khi DÁNG NGƯỜI đổi — không phải khi máu me đổi.
  const silhouette = useMemo(() => buildSilhouette(build), [build.musclePct, build.fatPct]);
  const paths = view === 'truoc' ? silhouette.front : silhouette.back;

  // Màu đi qua biến CSS. Object này đổi mỗi lượt, nhưng nó chỉ là một thuộc
  // tính `style` — cây `<path>` bên dưới giữ nguyên.
  //
  // Vùng lành lặn vẫn có viền tối mảnh: không có nó thì hai mươi mảng cùng màu
  // da dính thành một vệt và cái bóng mất hết hình. Nhiễm trùng ĐÈ lên chính
  // viền ấy bằng màu xanh lục dày dần — cùng một nét, hai nghĩa, nên mắt đọc ra
  // ngay chỗ nào đang tấy.
  const style = useMemo(() => {
    const out: Record<string, string> = {};
    for (const [id] of Object.entries(paths)) {
      const status = statuses.get(id);
      out[`--body-${id}`] = status === undefined ? skinColor : regionColor(status, skinColor);
      const infection = status?.infection ?? 0;
      out[`--rim-${id}`] =
        infection >= 10
          ? `rgba(74,222,128,${Math.min(0.9, infection / 110).toFixed(2)})`
          : 'rgba(28,20,14,0.55)';
      out[`--rimw-${id}`] = infection >= 10 ? `${(0.8 + infection / 40).toFixed(1)}` : '0.9';
    }
    return out as CSSProperties;
  }, [paths, statuses, skinColor]);

  const entries = Object.entries(paths);

  return (
    <svg
      viewBox={silhouette.viewBox}
      style={style}
      height={height}
      role="img"
      aria-label={`Bản đồ cơ thể, mặt ${view === 'truoc' ? 'trước' : 'sau'}`}
      className="mx-auto block"
    >
      <defs>
        <pattern id="body-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" stroke="#0b0b0d" strokeWidth="2" opacity="0.65" />
        </pattern>
        <style>{`
          @keyframes body-drip { 0%,100% { opacity: .25 } 50% { opacity: 1 } }
          .body-drip { animation: body-drip var(--drip, 1s) ease-in-out infinite; }
          .body-region {
            transition: fill .35s ease, stroke .35s ease, stroke-width .35s ease;
            cursor: pointer;
            stroke-linejoin: round;
          }
          .body-region:hover { filter: brightness(1.18); }
        `}</style>
      </defs>

      {entries.map(([id, d]) => {
        const status = statuses.get(id);
        if (status?.amputated === true) return null;
        return (
          <path
            key={id}
            id={id}
            d={d}
            className="body-region"
            fill={`var(--body-${id}, ${skinColor})`}
            stroke={selected === id ? '#f5e6c8' : `var(--rim-${id}, transparent)`}
            strokeWidth={selected === id ? 2 : `var(--rimw-${id}, 0)`}
            onClick={() => onSelect?.(id)}
          >
            <title>{status?.tooltip ?? id}</title>
          </path>
        );
      })}

      {/* Mỏm cụt: vùng đã mất biến khỏi hình, chỗ cắt bo tròn lại. */}
      {entries.map(([id, d]) => {
        const status = statuses.get(id);
        if (status?.amputated !== true) return null;
        const box = bboxOf(d);
        return (
          <ellipse
            key={`stump-${id}`}
            cx={box.x + box.width / 2}
            cy={box.y + 3}
            rx={Math.max(4, box.width / 2)}
            ry={5}
            fill="#6b5a4a"
          >
            <title>{status.tooltip}</title>
          </ellipse>
        );
      })}

      {/* Tàn phế vĩnh viễn: gạch chéo đè lên màu nền xám sẫm. */}
      {entries.map(([id, d]) => {
        const status = statuses.get(id);
        if (status === undefined || status.permanent.length === 0 || status.amputated) return null;
        return <path key={`perm-${id}`} d={d} fill="url(#body-hatch)" pointerEvents="none" />;
      })}

      {/* Đang chảy máu: giọt nhỏ nhấp nháy theo mức chảy. */}
      {entries.map(([id, d]) => {
        const status = statuses.get(id);
        if (status === undefined || status.bleeding <= 0 || status.amputated) return null;
        const [cx, cy] = centroidOf(d);
        return (
          <circle
            key={`drip-${id}`}
            cx={cx}
            cy={cy}
            r={Math.min(6, 2 + status.bleeding / 3)}
            fill="#b8332b"
            className="body-drip"
            style={{ ['--drip' as string]: dripDuration(status.bleeding) }}
            pointerEvents="none"
          />
        );
      })}

      {/* Sốt cao: toàn thân ám hồng. Phủ đúng khung nhìn, không phủ gốc tọa độ. */}
      {fever >= 25 && (
        <rect
          x={VIEW_BOX.x}
          y={VIEW_BOX.y}
          width={VIEW_BOX.width}
          height={VIEW_BOX.height}
          fill="#ff5f7a"
          opacity={Math.min(0.32, (fever - 25) / 220)}
          pointerEvents="none"
        />
      )}
    </svg>
  );
}
