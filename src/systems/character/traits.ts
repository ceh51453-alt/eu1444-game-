/**
 * ĐẶC TÍNH BẨM SINH (Phần 6 mục 2) — nạp từ `/data/traits.json` theo R5.
 *
 * File này CHỈ đọc và kiểm dữ liệu. Chỗ đặc tính thật sự tác động lên phép kiểm
 * là `modifiers.ts`, và nó đi qua registry của Phần 5 — mục 2 nói thẳng "phải
 * cài đúng vào registry modifier của Phần 5, không hardcode".
 */

import { z } from 'zod';
import traitsFile from '@data/traits.json';
import { effectSchema, type Effect } from './effects';

/** Đặc tính dùng chung khuôn hiệu ứng với tôn giáo, văn hóa và trang bị. */
export const traitEffectSchema = effectSchema;
export type TraitEffect = Effect;

export const traitSchema = z.object({
  id: z.string().startsWith('trait_'),
  name: z.string().min(1),
  description: z.string().default(''),
  effects: z.array(traitEffectSchema).min(1),
});

export type Trait = z.infer<typeof traitSchema>;

const fileSchema = z.object({ traits: z.array(traitSchema) });

export class TraitDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TraitDataError';
  }
}

function load(): Map<string, Trait> {
  const parsed = fileSchema.safeParse(traitsFile);
  if (!parsed.success) {
    throw new TraitDataError(`data/traits.json hỏng: ${parsed.error.issues[0]?.message ?? 'không rõ'}`);
  }
  const map = new Map<string, Trait>();
  for (const trait of parsed.data.traits) {
    if (map.has(trait.id)) throw new TraitDataError(`đặc tính trùng id: ${trait.id}`);
    map.set(trait.id, trait);
  }
  return map;
}

const TRAITS = load();

export function allTraits(): Trait[] {
  return [...TRAITS.values()];
}

export function traitOf(id: string): Trait | null {
  return TRAITS.get(id) ?? null;
}

export function traitName(id: string): string {
  return TRAITS.get(id)?.name ?? id;
}

export { effectApplies } from './effects';
