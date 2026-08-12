/**
 * CODEX — bộ nhớ thực thể bền vững của từng ván chơi.
 *
 * Mọi bản ghi sống trong GameState nên đi cùng autosave, file xuất/nhập và undo.
 * AI được phép bổ sung dữ kiện kể chuyện, nhưng MVU vẫn kiểm kiểu, đối chiếu giá
 * trị cũ và chạy các ràng buộc an toàn trước khi chấp nhận cả lô.
 */

import { z } from 'zod';
import type { PatchOp } from '@/state/mvu';
import { readPath, type GameState, type SliceDefinition } from '@/state/slices';

const shortText = z.string().max(500).default('');
const longText = z.string().max(5_000).default('');
const textList = z.array(z.string().max(500)).max(100).default([]);
const nullableNumber = z.number().nullable().default(null);

export const codexSourceSchema = z.object({
  turn: z.int().min(0).default(0),
  source: z.string().max(500).default(''),
  confidence: z.int().min(0).max(100).default(50),
});

const baseEntityShape = {
  id: z.string().min(1).max(120),
  name: z.string().min(1).max(300),
  aliases: z.array(z.string().min(1).max(300)).max(50).default([]),
  summary: longText,
  tags: textList,
  firstSeenTurn: z.int().min(0).default(0),
  lastSeenTurn: z.int().min(0).default(0),
  lastUpdatedTurn: z.int().min(0).default(0),
  sources: z.array(codexSourceSchema).max(100).default([]),
};

export const bodyMeasurementsSchema = z.object({
  heightCm: nullableNumber,
  weightKg: nullableNumber,
  shoulderCm: nullableNumber,
  chestCm: nullableNumber,
  waistCm: nullableNumber,
  hipCm: nullableNumber,
  bodyFatPercent: nullableNumber,
  notes: longText,
});

export const npcRelationshipSchema = z.preprocess(
  (value) => typeof value === 'string' ? { notes: value } : value,
  z.object({
    /** Khóa thường là `player` hoặc ID của NPC/thực thể còn lại. */
    targetId: z.string().max(120).default(''),
    type: z.string().max(200).default(''),
    status: z.string().max(500).default(''),
    affection: z.int().min(-100).max(100).nullable().default(null),
    trust: z.int().min(-100).max(100).nullable().default(null),
    respect: z.int().min(-100).max(100).nullable().default(null),
    fear: z.int().min(-100).max(100).nullable().default(null),
    attraction: z.int().min(-100).max(100).nullable().default(null),
    mutual: z.boolean().nullable().default(null),
    sinceTurn: z.int().min(0).nullable().default(null),
    lastUpdatedTurn: z.int().min(0).default(0),
    history: z.array(z.object({
      turn: z.int().min(0),
      affectionDelta: z.int().min(-200).max(200).default(0),
      trustDelta: z.int().min(-200).max(200).default(0),
      respectDelta: z.int().min(-200).max(200).default(0),
      fearDelta: z.int().min(-200).max(200).default(0),
      attractionDelta: z.int().min(-200).max(200).default(0),
      reason: z.string().min(1).max(1_000),
    })).max(200).default([]),
    notes: longText,
  }).prefault({}),
);

export const adultDetailSchema = z.object({
  /** Dữ liệu mô tả cơ thể mang tính hồ sơ, chỉ hợp lệ với NPC đã xác nhận 18+. */
  chest: z.object({
    form: shortText,
    color: shortText,
    texture: shortText,
    notes: longText,
  }).prefault({}),
  bodyHair: z.object({
    distribution: shortText,
    color: shortText,
    texture: shortText,
    notes: longText,
  }).prefault({}),
  intimateAnatomy: z.object({
    externalDescription: longText,
    internalDescription: longText,
    color: shortText,
    form: shortText,
    notes: longText,
  }).prefault({}),
  reproductiveHistory: z.object({
    pregnancies: z.int().min(0).nullable().default(null),
    births: z.int().min(0).nullable().default(null),
    notes: longText,
  }).prefault({}),
  notes: longText,
});

export const npcCodexSchema = z.object({
  ...baseEntityShape,
  role: shortText,
  sex: z.enum(['unknown', 'female', 'male', 'intersex']).default('unknown'),
  gender: shortText,
  age: z.int().min(0).max(2_000).nullable().default(null),
  adultConfirmed: z.boolean().default(false),
  species: shortText,
  race: shortText,
  appearance: z.object({
    overview: longText,
    build: shortText,
    skin: shortText,
    hair: shortText,
    eyes: shortText,
    face: shortText,
    voice: shortText,
    gait: shortText,
    clothing: longText,
    distinguishingFeatures: textList,
    scarsAndMarks: textList,
    measurements: bodyMeasurementsSchema.prefault({}),
  }).prefault({}),
  personality: z.object({
    traits: textList,
    temperament: longText,
    values: textList,
    fears: textList,
    goals: textList,
    habits: textList,
    speechStyle: longText,
    likes: textList,
    dislikes: textList,
  }).prefault({}),
  statistics: z.record(z.string(), z.number()).default({}),
  background: z.object({
    origin: longText,
    residence: longText,
    occupation: longText,
    education: longText,
    family: textList,
    affiliations: textList,
    history: textList,
    knownSecrets: textList,
    motivations: textList,
    notes: longText,
  }).prefault({}),
  /** Quan hệ theo ID đích: có chỉ số, trạng thái và lịch sử thay đổi. */
  relationships: z.record(z.string(), npcRelationshipSchema).default({}),
  encounters: z.array(z.object({
    turn: z.int().min(0),
    placeId: z.string().max(120).default(''),
    summary: z.string().max(2_000),
  })).max(200).default([]),
  adultDetail: adultDetailSchema.nullable().default(null),
});

export const locationCodexSchema = z.object({
  ...baseEntityShape,
  type: shortText,
  regionId: shortText,
  parentId: shortText,
  appearance: longText,
  atmosphere: longText,
  history: textList,
  inhabitants: textList,
  factions: textList,
  connectedLocationIds: textList,
  notableFeatures: textList,
  dangers: textList,
  resources: textList,
  coordinates: z.object({ x: nullableNumber, y: nullableNumber }).prefault({}),
});

export const eventCodexSchema = z.object({
  ...baseEntityShape,
  type: shortText,
  status: z.enum(['planned', 'ongoing', 'completed', 'cancelled', 'unknown']).default('unknown'),
  dateText: shortText,
  locationIds: textList,
  participantIds: textList,
  causes: textList,
  consequences: textList,
  outcome: longText,
});

export const organizationCodexSchema = z.object({
  ...baseEntityShape,
  type: shortText,
  headquartersId: shortText,
  memberIds: textList,
  leaderIds: textList,
  goals: textList,
  beliefs: textList,
  resources: textList,
  allies: textList,
  rivals: textList,
  history: textList,
});

export const objectCodexSchema = z.object({
  ...baseEntityShape,
  type: shortText,
  ownerIds: textList,
  locationId: shortText,
  appearance: longText,
  origin: longText,
  properties: textList,
  history: textList,
  status: shortText,
});

export const questCodexSchema = z.object({
  ...baseEntityShape,
  status: z.enum(['rumour', 'active', 'completed', 'failed', 'abandoned', 'unknown']).default('unknown'),
  giverId: shortText,
  participantIds: textList,
  locationIds: textList,
  objectives: textList,
  progress: textList,
  outcome: longText,
});

export const otherCodexSchema = z.object({
  ...baseEntityShape,
  kind: shortText,
  fields: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.array(z.string())])).default({}),
  notes: longText,
});

export const codexSchema = z.object({
  npcs: z.record(z.string(), npcCodexSchema).default({}),
  locations: z.record(z.string(), locationCodexSchema).default({}),
  events: z.record(z.string(), eventCodexSchema).default({}),
  organizations: z.record(z.string(), organizationCodexSchema).default({}),
  objects: z.record(z.string(), objectCodexSchema).default({}),
  quests: z.record(z.string(), questCodexSchema).default({}),
  other: z.record(z.string(), otherCodexSchema).default({}),
});

export type NpcCodexEntry = z.infer<typeof npcCodexSchema>;
export type CodexState = z.infer<typeof codexSchema>;
export type CodexCollection = keyof CodexState;

export const EMPTY_CODEX: CodexState = {
  npcs: {},
  locations: {},
  events: {},
  organizations: {},
  objects: {},
  quests: {},
  other: {},
};

const COLLECTION_SCHEMAS = {
  npcs: npcCodexSchema,
  locations: locationCodexSchema,
  events: eventCodexSchema,
  organizations: organizationCodexSchema,
  objects: objectCodexSchema,
  quests: questCodexSchema,
  other: otherCodexSchema,
} as const;

export function codexOf(state: GameState): CodexState {
  const parsed = codexSchema.safeParse(readPath(state, 'codex'));
  return parsed.success ? parsed.data : structuredClone(EMPTY_CODEX);
}

function normaliseIdentity(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .toLocaleLowerCase('vi-VN')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function identitySet(value: { name: string; aliases: string[] }): Set<string> {
  return new Set([value.name, ...value.aliases].map(normaliseIdentity).filter(Boolean));
}

function findExistingId(
  records: Record<string, { name: string; aliases: string[] }>,
  incomingId: string,
  incoming: { name: string; aliases: string[] },
): string | null {
  if (records[incomingId] !== undefined) return incomingId;
  const names = identitySet(incoming);
  for (const [id, record] of Object.entries(records)) {
    if ([...identitySet(record)].some((name) => names.has(name))) return id;
  }
  return null;
}

function stableKey(value: unknown): string {
  if (typeof value === 'string') return `s:${normaliseIdentity(value)}`;
  return `j:${JSON.stringify(value)}`;
}

function mergeMemory(current: unknown, incoming: unknown): unknown {
  if (incoming === null || incoming === '') return current ?? incoming;
  if (Array.isArray(incoming)) {
    if (!Array.isArray(current)) return incoming;
    const seen = new Set<string>();
    return [...current, ...incoming].filter((item) => {
      const key = stableKey(item);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
  if (typeof incoming === 'object' && incoming !== null) {
    const before = typeof current === 'object' && current !== null && !Array.isArray(current)
      ? current as Record<string, unknown>
      : {};
    const out: Record<string, unknown> = { ...before };
    for (const [key, value] of Object.entries(incoming as Record<string, unknown>)) {
      out[key] = mergeMemory(before[key], value);
    }
    return out;
  }
  return incoming;
}

const CODEX_PATH = /^codex\.(npcs|locations|events|organizations|objects|quests|other)\.([^.]+)$/;

/**
 * Chuẩn hoá op Codex trước MVU: điền defaults, đóng dấu lượt và chuyển một bản
 * ghi trùng tên/bí danh về ID đã tồn tại. Các op ngoài Codex được giữ nguyên.
 */
export function reconcileCodexOps(state: GameState, ops: readonly PatchOp[], turn: number): PatchOp[] {
  const codex = codexOf(state);

  return ops.map((op) => {
    if (op.op !== 'set') return { ...op };
    const match = CODEX_PATH.exec(op.path);
    if (match === null) return { ...op };

    const collection = match[1] as CodexCollection;
    const requestedId = match[2] ?? '';
    const schema = COLLECTION_SCHEMAS[collection];
    const parsed = schema.safeParse(op.to);
    if (!parsed.success) return { ...op };

    const incoming = parsed.data as typeof parsed.data & { id: string; name: string; aliases: string[] };
    const records = codex[collection] as Record<string, typeof incoming>;
    const existingId = findExistingId(records, requestedId, incoming);
    const targetId = existingId ?? requestedId;
    const rawCurrent = readPath(state, `codex.${collection}.${targetId}`);
    const current = records[targetId];
    // Gộp với đầu vào THÔ, không gộp với bản đã điền defaults. Nếu AI chỉ gửi
    // `{ appearance: { hair: ... } }`, các default rỗng không được phép xóa
    // tuổi, trạng thái trưởng thành hay những mảng ký ức cũ.
    const combined = current === undefined ? incoming : mergeMemory(current, op.to);
    const normalized = schema.safeParse(combined);
    if (!normalized.success) return { ...op };
    const merged = normalized.data as typeof incoming;

    merged.id = targetId;
    merged.firstSeenTurn = current?.firstSeenTurn ?? (incoming.firstSeenTurn > 0 ? incoming.firstSeenTurn : turn);
    merged.lastSeenTurn = Math.max(current?.lastSeenTurn ?? 0, incoming.lastSeenTurn, turn);
    merged.lastUpdatedTurn = turn;

    return {
      ...op,
      path: `codex.${collection}.${targetId}`,
      from: rawCurrent ?? null,
      to: merged,
      reason: existingId !== null && existingId !== requestedId
        ? `${op.reason}; gộp vào hồ sơ đã có "${targetId}"`
        : op.reason,
    };
  });
}

function keyedCorrectly(codex: CodexState): string | null {
  for (const collection of Object.keys(COLLECTION_SCHEMAS) as CodexCollection[]) {
    for (const [key, entry] of Object.entries(codex[collection])) {
      if (entry.id !== key) return `${collection}.${key} có id "${entry.id}" không khớp khóa bản ghi`;
    }
  }
  return null;
}

export const codexSlice: SliceDefinition = {
  id: 'codex',
  version: 1,
  schema: codexSchema,
  defaults: () => structuredClone(EMPTY_CODEX),
  permissions: {
    'npcs.*': 'ai',
    'locations.*': 'ai',
    'events.*': 'ai',
    'organizations.*': 'ai',
    'objects.*': 'ai',
    'quests.*': 'ai',
    'other.*': 'ai',
  },
  constraints: [
    {
      id: 'codex.id-khop-khoa',
      check(state) {
        return keyedCorrectly(codexOf(state));
      },
    },
    {
      id: 'codex.du-lieu-truong-thanh',
      check(state) {
        for (const npc of Object.values(codexOf(state).npcs)) {
          if (npc.adultDetail === null) continue;
          if (!npc.adultConfirmed || npc.age === null || npc.age < 18) {
            return `NPC "${npc.name}" chỉ được có adultDetail khi đã xác nhận tuổi từ 18 trở lên`;
          }
        }
        return null;
      },
    },
  ],
};

export interface CodexPromptView {
  index: Record<CodexCollection, Array<{ id: string; name: string; aliases: string[]; lastUpdatedTurn: number }>>;
  relevant: {
    npcs: NpcCodexEntry[];
    locations: CodexState['locations'][string][];
    events: CodexState['events'][string][];
    organizations: CodexState['organizations'][string][];
    objects: CodexState['objects'][string][];
    quests: CodexState['quests'][string][];
    other: CodexState['other'][string][];
  };
}

/** Chỉ đưa chỉ mục gọn + hồ sơ liên quan vào prompt để Codex lớn không làm tràn context. */
export function codexPromptView(
  state: GameState,
  scene: { place: string; npcs: Array<{ id: string; name: string }> },
  charName = '',
): CodexPromptView {
  const codex = codexOf(state);
  const index = {} as CodexPromptView['index'];
  for (const collection of Object.keys(COLLECTION_SCHEMAS) as CodexCollection[]) {
    index[collection] = Object.values(codex[collection])
      .sort((a, b) => b.lastUpdatedTurn - a.lastUpdatedTurn)
      .slice(0, 200)
      .map(({ id, name, aliases, lastUpdatedTurn }) => ({ id, name, aliases, lastUpdatedTurn }));
  }

  const npcTerms = new Set(
    [...scene.npcs.flatMap((npc) => [npc.id, npc.name]), charName]
      .map(normaliseIdentity)
      .filter(Boolean),
  );
  const relevantNpcs = Object.values(codex.npcs).filter((npc) =>
    [...identitySet(npc), normaliseIdentity(npc.id)].some((term) => npcTerms.has(term)),
  );
  const place = normaliseIdentity(scene.place);
  const relevantLocations = Object.values(codex.locations).filter((location) =>
    place !== '' && [...identitySet(location), normaliseIdentity(location.id)].includes(place),
  );
  const recent = <T extends { lastUpdatedTurn: number }>(values: T[], count: number): T[] =>
    [...values].sort((a, b) => b.lastUpdatedTurn - a.lastUpdatedTurn).slice(0, count);

  return {
    index,
    relevant: {
      npcs: relevantNpcs,
      locations: relevantLocations,
      events: recent(Object.values(codex.events), 12),
      organizations: recent(Object.values(codex.organizations), 6),
      objects: recent(Object.values(codex.objects), 6),
      quests: recent(Object.values(codex.quests), 8),
      other: recent(Object.values(codex.other), 6),
    },
  };
}
