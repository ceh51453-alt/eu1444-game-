/**
 * Zod schemas for branded ids, so validation rejects a cross-layer id at the
 * boundary instead of letting it reach a system that assumes otherwise.
 *
 * Use these everywhere an id enters state — slice schemas from part 2 onward,
 * `/data/*.json` loaders, and the MVU patch validator.
 */

import { z } from 'zod';
import { ID_PREFIXES, isId, type IdKind, type IdTypeMap } from '@/core/ids';

function idSchema<K extends IdKind>(kind: K): z.ZodType<IdTypeMap[K]> {
  return z.custom<IdTypeMap[K]>((value) => isId(kind, value), {
    message: `phải là id ${kind}, bắt đầu bằng "${ID_PREFIXES[kind]}"`,
  });
}

export const holdingIdSchema = idSchema('holding');
export const provinceIdSchema = idSchema('province');
export const realmIdSchema = idSchema('realm');
export const fiefIdSchema = idSchema('fief');
export const npcIdSchema = idSchema('npc');
export const itemIdSchema = idSchema('item');
export const unitIdSchema = idSchema('unit');
export const corpsIdSchema = idSchema('corps');
