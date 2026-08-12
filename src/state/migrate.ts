/**
 * Save migration.
 *
 * Part 0 section 4 makes this mandatory: an older save is never discarded, it
 * is walked up one version at a time until it matches the current schema, and
 * only then validated. The chain exists from day one so that adding version 2
 * is a one-line registration instead of a rescue operation.
 */

import { MAIN_STREAM } from '@/core/rng';
import { CURRENT_SCHEMA_VERSION } from './schema';
import { slices, type GameState } from './slices';

/** Raise a save from `from` to `from + 1`. Must be pure. */
export type MigrationStep = (raw: Record<string, unknown>) => Record<string, unknown>;

function objectAt(raw: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = raw[key];
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new MigrationError(`expected "${key}" to be an object`, 0);
  }
  return { ...(value as Record<string, unknown>) };
}

/**
 * v1 → v2: the single `meta.rngState` became `meta.rng.streams`, so that the
 * world simulation can roll without shifting the player's dice (R3).
 * An old save's stream becomes the `main` stream; every other stream opens
 * fresh at its derived start, which is exactly where it would have been.
 */
const migrateV1ToV2: MigrationStep = (raw) => {
  const meta = objectAt(raw, 'meta');
  const legacy = meta['rngState'];
  if (typeof legacy !== 'object' || legacy === null) {
    throw new MigrationError('v1 save has no meta.rngState to carry over', 1);
  }
  delete meta['rngState'];
  meta['rng'] = { streams: { [MAIN_STREAM]: legacy } };
  return { ...raw, meta };
};

/**
 * Keyed by the version being migrated FROM. The loop below bumps
 * `meta.schemaVersion` itself, so a step only has to fix the shape.
 */
const MIGRATIONS: ReadonlyMap<number, MigrationStep> = new Map<number, MigrationStep>([
  [1, migrateV1ToV2],
]);

export class MigrationError extends Error {
  constructor(
    message: string,
    readonly fromVersion: number,
  ) {
    super(message);
    this.name = 'MigrationError';
  }
}

function readVersion(raw: unknown): number {
  if (typeof raw !== 'object' || raw === null) {
    throw new MigrationError('save is not an object', 0);
  }
  const meta = (raw as { meta?: unknown }).meta;
  if (typeof meta !== 'object' || meta === null) {
    throw new MigrationError('save has no meta block', 0);
  }
  const version = (meta as { schemaVersion?: unknown }).schemaVersion;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw new MigrationError('save has no usable schemaVersion', 0);
  }
  return version;
}

/**
 * Walk a raw save up to the current version, then validate it.
 * Throws rather than returning a half-converted save (R4: all-or-nothing).
 */
export function migrateToCurrent(raw: unknown): GameState {
  let version = readVersion(raw);

  if (version > CURRENT_SCHEMA_VERSION) {
    throw new MigrationError(
      `save version ${version} is newer than this build (${CURRENT_SCHEMA_VERSION})`,
      version,
    );
  }

  let working = structuredClone(raw) as Record<string, unknown>;

  while (version < CURRENT_SCHEMA_VERSION) {
    const step = MIGRATIONS.get(version);
    if (step === undefined) {
      throw new MigrationError(`no migration registered from version ${version}`, version);
    }
    working = step(working);
    version += 1;
    // Stamp the new version centrally so every step cannot forget to.
    const meta = objectAt(working, 'meta');
    meta['schemaVersion'] = version;
    working = { ...working, meta };
  }

  // Save cũ hơn một slice mới đăng ký thì thiếu hẳn namespace đó. Lấp bằng
  // defaults chứ không từ chối: Phần 0 mục 4 nói không bao giờ vứt save cũ.
  const seed = (objectAt(working, 'meta')['seed'] as string | undefined) ?? '';
  for (const slice of slices.all()) {
    if (working[slice.id] === undefined) working[slice.id] = slice.defaults({ seed });
  }

  const parsed = slices.rootSchema().safeParse(working);
  if (!parsed.success) {
    throw new MigrationError(
      `migrated save failed validation: ${parsed.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('; ')}`,
      version,
    );
  }
  return parsed.data as unknown as GameState;
}

/** True when a save can be opened by this build without data loss. */
export function canMigrate(raw: unknown): boolean {
  try {
    migrateToCurrent(raw);
    return true;
  } catch {
    return false;
  }
}
