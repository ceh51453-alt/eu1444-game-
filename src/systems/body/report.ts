/**
 * BẢN TÓM TẮT CƠ THỂ cho UI (mục 4 và 10) và cho prompt (khối 7).
 *
 * Một chỗ duy nhất biến `Injury[]` thành thứ đọc được, để hình vẽ SVG, panel
 * trạng thái và khối prompt "THƯƠNG TÍCH ĐANG MANG" không bao giờ mô tả cùng
 * một vết bằng hai câu khác nhau. Ba chỗ tự viết mô tả riêng là ba chỗ sẽ lệch,
 * và người chơi sẽ đọc thấy "vết đâm nặng" trên hình còn AI thì được kể là "vết
 * xước" — đúng loại mâu thuẫn phá vỡ nhập vai nhanh nhất.
 *
 * Mọi hàm ở đây THUẦN và CHỈ ĐỌC.
 */

import type { GameState } from '@/state/slices';
import { complicationName, injuryTypeName, permanentOf, severityColor, severityName } from './catalog';
import { allRegions, distalRegions, regionName, type BodyRegion } from './regions';
import { bodyOf, statOf, type BodyState, type Injury } from './slice';
import {
  consciousnessOf,
  feverTargetOf,
  gripOf,
  mobilityOf,
  painOf,
  shockOf,
  staminaOf,
} from './vitals';

// ---------------------------------------------------------------------------
// Một vết thương
// ---------------------------------------------------------------------------

export interface InjuryView {
  id: string;
  regionId: string;
  region: string;
  /** "Vết đâm nặng" — loại + mức độ. */
  description: string;
  /** Chuỗi hệ quả đang có: đang chảy máu, nhiễm trùng 62, hoại tử… */
  effect: string;
  severity: number;
  bleeding: number;
  infection: number;
  pain: number;
  healProgress: number;
  treated: boolean;
  complications: string[];
  turn: number;
  source: string;
  /** Xếp hạng nguy hiểm để sắp danh sách của mục 10. */
  danger: number;
}

/**
 * Mức nguy hiểm để sắp xếp. Hoại tử và chảy máu đứng trước mức độ vết thương:
 * một vết "vừa" đang hoại tử giết người nhanh hơn một vết "nặng" đã khâu kín.
 */
function dangerOf(injury: Injury): number {
  const necrotic = injury.complications.some((entry) => entry.id === 'hoai-tu') ? 60 : 0;
  return necrotic + injury.bleeding * 3 + injury.infection * 0.6 + injury.severity * 8 + injury.pain * 0.2;
}

export function injuryView(injury: Injury): InjuryView {
  const effects: string[] = [];
  if (injury.bleeding > 0) effects.push(`chảy máu ${injury.bleeding}/lượt`);
  if (injury.infection >= 10) effects.push(`nhiễm trùng ${Math.round(injury.infection)}`);
  for (const entry of injury.complications) effects.push(complicationName(entry.id).toLowerCase());
  if (injury.treated) effects.push(`đã chữa (chất lượng ${injury.treatmentQuality ?? 1}/5)`);
  if (injury.healProgress > 0) effects.push(`lành ${Math.round(injury.healProgress)}%`);

  return {
    id: injury.id,
    regionId: injury.regionId,
    region: regionName(injury.regionId),
    description: `${injuryTypeName(injury.type)} ${severityName(injury.severity).toLowerCase()}`,
    effect: effects.join(', '),
    severity: injury.severity,
    bleeding: injury.bleeding,
    infection: injury.infection,
    pain: injury.pain,
    healProgress: injury.healProgress,
    treated: injury.treated,
    complications: injury.complications.map((entry) => entry.id),
    turn: injury.inflictedTurn,
    source: injury.source,
    danger: Math.round(dangerOf(injury)),
  };
}

/** Danh sách thương tích, NGUY HIỂM NHẤT ĐỨNG TRƯỚC (mục 10). */
export function injuryViews(state: GameState | null | undefined): InjuryView[] {
  const body = bodyOf(state);
  if (body === null) return [];
  return body.injuries
    .filter((injury) => injury.healProgress < 100)
    .map(injuryView)
    .sort((left, right) => right.danger - left.danger);
}

// ---------------------------------------------------------------------------
// Năm thanh của mục 10
// ---------------------------------------------------------------------------

export interface BodySummary {
  blood: number;
  pain: number;
  fever: number;
  feverTarget: number;
  stamina: number;
  shock: number;
  consciousness: string;
  mobility: number;
  gripLeft: number;
  gripRight: number;
  dominantHand: 'trai' | 'phai';
  injuries: number;
  bleedingPerTurn: number;
  dead: boolean;
  deathCause: string;
}

export function bodySummary(state: GameState | null | undefined): BodySummary | null {
  const body = bodyOf(state);
  if (body === null) return null;

  const turn = typeof state?.meta?.turn === 'number' ? state.meta.turn : 0;
  const wil = statOf(state, 'wil');

  return {
    blood: Math.round(body.blood),
    pain: Math.round(painOf(body, wil, turn)),
    fever: Math.round(body.fever),
    feverTarget: Math.round(feverTargetOf(body)),
    stamina: staminaOf(body),
    shock: Math.round(shockOf(body, wil, turn)),
    consciousness: consciousnessOf(body, wil, turn).name,
    mobility: mobilityOf(body),
    gripLeft: gripOf(body, 'trai'),
    gripRight: gripOf(body, 'phai'),
    dominantHand: body.dominantHand,
    injuries: body.injuries.filter((injury) => injury.healProgress < 100).length,
    bleedingPerTurn:
      Math.round(body.injuries.reduce((total, injury) => total + injury.bleeding, 0) * 10) / 10,
    dead: body.dead,
    deathCause: body.deathCause,
  };
}

// ---------------------------------------------------------------------------
// Trạng thái từng vùng — bản đồ cơ thể của mục 4
// ---------------------------------------------------------------------------

export interface RegionStatus {
  regionId: string;
  region: BodyRegion;
  /** 0 là lành lặn; 1–5 theo mức nặng nhất đang có ở vùng đó. */
  severity: number;
  /** Máu chảy mỗi lượt ở vùng này — quyết định nhịp nhấp nháy của lớp phủ. */
  bleeding: number;
  infection: number;
  necrotic: boolean;
  scarred: boolean;
  /** Tàn phế vĩnh viễn ở vùng này. */
  permanent: string[];
  /** Cụt: vùng BIẾN MẤT khỏi hình, thay bằng mỏm cụt bo tròn (mục 4). */
  amputated: boolean;
  injuries: InjuryView[];
  /** Chuỗi hiện khi rê chuột lên vùng (mục 4). */
  tooltip: string;
}

/**
 * Trạng thái của MỌI vùng, kể cả vùng lành lặn.
 *
 * Trả về đủ hai mươi vùng chứ không chỉ vùng bị thương: hình SVG vẽ một lần rồi
 * chỉ đổi biến CSS (mục 4), nên nó cần một giá trị cho mọi vùng ở mọi lượt.
 */
export function regionStatuses(state: GameState | null | undefined): Map<string, RegionStatus> {
  const scarSites = new Set<string>();
  const appearance = state?.['character'];
  if (typeof appearance === 'object' && appearance !== null) {
    const scars = (appearance as { appearance?: { scars?: unknown } }).appearance?.scars;
    if (Array.isArray(scars)) {
      for (const scar of scars) {
        const site = (scar as { site?: unknown }).site;
        if (typeof site === 'string') scarSites.add(site);
      }
    }
  }

  return regionStatusesOf(bodyOf(state), scarSites);
}

/**
 * Cùng bảng trạng thái, nhưng từ một `BodyState` RỜI chứ không từ state.
 *
 * Có mặt vì Phần 9: đối thủ trong một trận quyết đấu cũng có cơ thể hai mươi
 * vùng thật (mục 8 cấm thanh máu riêng), nhưng cơ thể ấy KHÔNG nằm trong
 * `GameState` — slice `body` là của nhân vật người chơi. Bản đồ cơ thể thu nhỏ
 * ở mục 11 vẽ cả hai bên bằng đúng một hàm này, nên hai bên không bao giờ được
 * tô màu theo hai luật khác nhau.
 */
export function regionStatusesOf(
  body: BodyState | null,
  scarSites: ReadonlySet<string> = new Set(),
): Map<string, RegionStatus> {
  const out = new Map<string, RegionStatus>();

  for (const region of allRegions()) {
    const status: RegionStatus = {
      regionId: region.id,
      region,
      severity: 0,
      bleeding: 0,
      infection: 0,
      necrotic: false,
      scarred: scarSites.has(region.name),
      permanent: [],
      amputated: false,
      injuries: [],
      tooltip: region.name,
    };
    out.set(region.id, status);
  }

  if (body === null) return out;

  for (const injury of body.injuries) {
    if (injury.healProgress >= 100) continue;
    const status = out.get(injury.regionId);
    if (status === undefined) continue;

    status.severity = Math.max(status.severity, injury.severity);
    status.bleeding += injury.bleeding;
    status.infection = Math.max(status.infection, injury.infection);
    if (injury.complications.some((entry) => entry.id === 'hoai-tu')) status.necrotic = true;
    status.injuries.push(injuryView(injury));
  }

  for (const entry of body.permanent) {
    const status = out.get(entry.regionId);
    if (status === undefined) continue;
    status.permanent.push(entry.id);
    if (entry.id.startsWith('cut-') && entry.id !== 'cut-ngon') status.amputated = true;
  }

  // Cụt ở đùi thì cẳng chân cũng không còn trên hình — nếu không thì bản đồ vẽ
  // một cái cẳng chân lơ lửng dưới chỗ đã cưa.
  for (const status of out.values()) {
    if (!status.amputated) continue;
    for (const distal of distalRegions(status.regionId)) {
      if (distal.id === status.regionId) continue;
      const other = out.get(distal.id);
      if (other !== undefined) other.amputated = true;
    }
  }

  for (const status of out.values()) {
    status.injuries.sort((left, right) => right.danger - left.danger);
    status.tooltip = tooltipFor(status);
  }

  return out;
}

function tooltipFor(status: RegionStatus): string {
  const parts: string[] = [status.region.name];
  if (status.amputated) parts.push('ĐÃ CỤT');
  for (const injury of status.injuries) {
    parts.push(injury.effect === '' ? injury.description : `${injury.description} — ${injury.effect}`);
  }
  for (const id of status.permanent) parts.push(permanentOf(id)?.name ?? id);
  if (status.injuries.length === 0 && status.permanent.length === 0 && !status.amputated) {
    parts.push(status.scarred ? 'có sẹo cũ' : 'lành lặn');
  }
  return parts.join(' · ');
}

/** Màu nền của một vùng: lấy tình trạng NẶNG NHẤT, phần còn lại là lớp phủ (mục 4). */
export function regionColor(status: RegionStatus, skinColor: string): string {
  if (status.amputated) return 'transparent';
  if (status.necrotic) return '#1b1b1b';
  if (status.severity > 0) return severityColor(status.severity);
  if (status.permanent.length > 0) return '#4a4a52';
  if (status.scarred) return '#8d7aa8';
  return skinColor;
}

export function bodyStateOf(state: GameState | null | undefined): BodyState | null {
  return bodyOf(state);
}
