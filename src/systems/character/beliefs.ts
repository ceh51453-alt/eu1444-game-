/**
 * TÔN GIÁO VÀ VĂN HÓA (Phần 6 mục 7) — nạp từ `/data/religions.json` và
 * `/data/cultures.json` theo R5.
 *
 * Hai thứ nằm chung một file vì chúng giống hệt nhau về cấu trúc và về cách cắm
 * vào registry: một danh tính, một danh sách hiệu ứng, và MỘT CON SỐ 0–100 nói
 * nó bám vào nhân vật chặt tới đâu (`piety` với tôn giáo, `culturalFit` với văn
 * hóa). Tách thành hai module chỉ để có hai file gần như giống nhau từng dòng.
 *
 * VÌ SAO VĂN HÓA TÁCH KHỎI CHỦNG TỘC: chủng tộc cho thân thể, văn hóa cho thứ
 * được dạy. Một Frank bị bắt từ nhỏ và lớn lên trong thị tộc thảo nguyên vẫn có
 * mod chỉ số của Frank nhưng biết cưỡi ngựa như người thảo nguyên. Gộp hai thứ
 * đó lại là mất luôn cả một trục nhập vai, và Phần 8 (nghịch cảnh mở nhánh) mất
 * chỗ cắm vào.
 */

import { z } from 'zod';
import religionsFile from '@data/religions.json';
import culturesFile from '@data/cultures.json';
import { effectSchema, type Effect } from './effects';

export const religionSchema = z.object({
  id: z.string().startsWith('rel_'),
  name: z.string().min(1),
  shortName: z.string().default(''),
  description: z.string().default(''),
  /** Quan hệ với Giáo hội, cùng từ vựng với cột `church` của races.json. */
  stance: z.string().default(''),
  /** Giá trị `church` nào của chủng tộc thì gợi ý tôn giáo này. */
  raceStandings: z.array(z.string()).default([]),
  /** Điều cấm — chữ cho AI đọc, KHÔNG vào công thức. */
  taboos: z.array(z.string()).default([]),
  effects: z.array(effectSchema).default([]),
});

export const cultureSchema = z.object({
  id: z.string().startsWith('cul_'),
  name: z.string().min(1),
  description: z.string().default(''),
  /** Chỉ là GỢI Ý cho UI. Chọn lệch là chuyện thú vị, không phải lỗi. */
  nativeRaces: z.array(z.string()).default([]),
  regions: z.array(z.string()).default([]),
  language: z.string().default(''),
  effects: z.array(effectSchema).default([]),
});

export type Religion = z.infer<typeof religionSchema>;
export type Culture = z.infer<typeof cultureSchema>;

export class BeliefDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BeliefDataError';
  }
}

function loadReligions(): Map<string, Religion> {
  const parsed = z.object({ religions: z.array(religionSchema) }).safeParse(religionsFile);
  if (!parsed.success) {
    throw new BeliefDataError(`data/religions.json hỏng: ${parsed.error.issues[0]?.message ?? 'không rõ'}`);
  }
  const map = new Map<string, Religion>();
  for (const religion of parsed.data.religions) {
    if (map.has(religion.id)) throw new BeliefDataError(`tôn giáo trùng id: ${religion.id}`);
    map.set(religion.id, religion);
  }
  return map;
}

function loadCultures(): Map<string, Culture> {
  const parsed = z.object({ cultures: z.array(cultureSchema) }).safeParse(culturesFile);
  if (!parsed.success) {
    throw new BeliefDataError(`data/cultures.json hỏng: ${parsed.error.issues[0]?.message ?? 'không rõ'}`);
  }
  const map = new Map<string, Culture>();
  for (const culture of parsed.data.cultures) {
    if (map.has(culture.id)) throw new BeliefDataError(`văn hóa trùng id: ${culture.id}`);
    map.set(culture.id, culture);
  }
  return map;
}

const RELIGIONS = loadReligions();
const CULTURES = loadCultures();

// ---------------------------------------------------------------------------
// Tôn giáo
// ---------------------------------------------------------------------------

export function allReligions(): Religion[] {
  return [...RELIGIONS.values()];
}

export function religionOf(id: string): Religion | null {
  return RELIGIONS.get(id) ?? null;
}

export function religionName(id: string): string {
  return RELIGIONS.get(id)?.name ?? id;
}

/**
 * Tôn giáo hợp với một chủng tộc, xếp cái khớp nhất lên đầu.
 *
 * Chỉ SẮP XẾP chứ không lọc bỏ: một Orc theo Chính thống giáo là một nhân vật
 * rất đáng chơi, và cấm chuyện đó chỉ để bảng gọn hơn là đánh đổi tệ.
 */
export function religionsForRace(raceChurch: string): Religion[] {
  const fits = (religion: Religion): boolean => religion.raceStandings.includes(raceChurch);
  return [...allReligions()].sort((a, b) => Number(fits(b)) - Number(fits(a)));
}

export function suggestedReligion(raceChurch: string): Religion | null {
  return allReligions().find((religion) => religion.raceStandings.includes(raceChurch)) ?? allReligions()[0] ?? null;
}

// ---------------------------------------------------------------------------
// Văn hóa
// ---------------------------------------------------------------------------

export function allCultures(): Culture[] {
  return [...CULTURES.values()];
}

export function cultureOf(id: string): Culture | null {
  return CULTURES.get(id) ?? null;
}

export function cultureName(id: string): string {
  return CULTURES.get(id)?.name ?? id;
}

/** Văn hóa hợp với chủng tộc và vùng sinh, xếp cái khớp nhất lên đầu. */
export function culturesForRace(raceId: string, regionId = ''): Culture[] {
  const score = (culture: Culture): number =>
    (culture.nativeRaces.includes(raceId) ? 2 : 0) + (regionId !== '' && culture.regions.includes(regionId) ? 1 : 0);
  return [...allCultures()].sort((a, b) => score(b) - score(a));
}

export function suggestedCulture(raceId: string, regionId = ''): Culture | null {
  return culturesForRace(raceId, regionId)[0] ?? null;
}

/** Hiệu ứng của một danh tính, gộp chung để nguồn modifier chỉ đọc một chỗ. */
export function beliefEffects(id: string): readonly Effect[] {
  return RELIGIONS.get(id)?.effects ?? CULTURES.get(id)?.effects ?? [];
}
