/**
 * Branded id types.
 *
 * README section 7.1 fixes a prefix per entity kind, and README section 8.1
 * names holding/realm confusion as the single most likely way this design
 * breaks. Plain `string` ids give the compiler nothing to catch that with: a
 * `hold_*` slots into a parameter expecting a `realm_*` and nobody notices
 * until the two layers have been tangled for weeks.
 *
 * So each kind gets its own nominal type. They are still plain strings at
 * runtime — free to store, serialise and compare — but the compiler refuses to
 * swap one for another, and `parseId` refuses at runtime for data arriving from
 * JSON or from the AI.
 */

declare const brandKey: unique symbol;

type Branded<Kind extends string> = string & { readonly [brandKey]: Kind };

/** Prefix per entity kind. Nhìn id là biết loại (README 7.1). */
export const ID_PREFIXES = {
  holding: 'hold_',
  province: 'prov_',
  realm: 'realm_',
  fief: 'fief_',
  npc: 'npc_',
  item: 'item_',
  unit: 'unit_',
  corps: 'corps_',
} as const;

export type IdKind = keyof typeof ID_PREFIXES;

/** THÀNH TRÌ — một ĐIỂM. Xây, dựng, đồn trú, vây hãm. */
export type HoldingId = Branded<'holding'>;
/** Tỉnh — đơn vị hợp thành của lãnh thổ. */
export type ProvinceId = Branded<'province'>;
/** LÃNH THỔ — một VÙNG. Cai trị, ban luật, thu thuế. */
export type RealmId = Branded<'realm'>;
/** THÁI ẤP — một TỜ GIẤY. Phong, thừa kế, tước đoạt. */
export type FiefId = Branded<'fief'>;
export type NpcId = Branded<'npc'>;
export type ItemId = Branded<'item'>;
export type UnitId = Branded<'unit'>;
export type CorpsId = Branded<'corps'>;

export interface IdTypeMap {
  holding: HoldingId;
  province: ProvinceId;
  realm: RealmId;
  fief: FiefId;
  npc: NpcId;
  item: ItemId;
  unit: UnitId;
  corps: CorpsId;
}

export class IdFormatError extends Error {
  constructor(
    readonly kind: IdKind,
    readonly received: string,
  ) {
    super(`expected a ${kind} id starting with "${ID_PREFIXES[kind]}", got "${received}"`);
    this.name = 'IdFormatError';
  }
}

/** Suffix rules: lowercase letters, digits, hyphen. Keeps ids URL- and file-safe. */
const SUFFIX_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

export function isId<K extends IdKind>(kind: K, raw: unknown): raw is IdTypeMap[K] {
  if (typeof raw !== 'string') return false;
  const prefix = ID_PREFIXES[kind];
  if (!raw.startsWith(prefix)) return false;
  return SUFFIX_PATTERN.test(raw.slice(prefix.length));
}

/** Validate an id coming from JSON, a save, or the AI. Throws on mismatch. */
export function parseId<K extends IdKind>(kind: K, raw: unknown): IdTypeMap[K] {
  if (!isId(kind, raw)) {
    throw new IdFormatError(kind, typeof raw === 'string' ? raw : String(raw));
  }
  return raw;
}

/** Build an id from a bare slug: `makeId('holding', 'thon-bach-duong')`. */
export function makeId<K extends IdKind>(kind: K, slug: string): IdTypeMap[K] {
  return parseId(kind, `${ID_PREFIXES[kind]}${slug}`);
}

/** Which kind an id belongs to, or null when it matches none. */
export function idKindOf(raw: string): IdKind | null {
  for (const kind of Object.keys(ID_PREFIXES) as IdKind[]) {
    if (isId(kind, raw)) return kind;
  }
  return null;
}
