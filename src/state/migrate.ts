/**
 * Save migration.
 *
 * Part 0 section 4 makes this mandatory: an older save is never discarded, it
 * is walked up one version at a time until it matches the current schema, and
 * only then validated. The chain exists from day one so that adding version 2
 * is a one-line registration instead of a rescue operation.
 */

import { MAIN_STREAM } from '@/core/rng';
import { migrateHolding, settleMigratedHolding } from '@/systems/holding/migrate';
import { holdingsSliceSchema } from '@/systems/holding/slice';
import type { Holding } from '@/systems/holding/types';
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
 * v2 → v3: `holdings` bỏ lưới ô trừu tượng, sang mảnh đất 5 m sinh từ hạt giống.
 *
 * `tiles`, `gridSize` và `hinterland` rời khỏi save vì cả ba tính lại được;
 * `nodes` và `walls` vào vì cả hai là lịch sử của người chơi. Toạ độ công trình
 * được dịch sang hệ mới, còn việc DỌN bố cục thì đợi tới sau khi save đã qua
 * schema — xem `settleMigratedHoldings` ở cuối file.
 *
 * Save chưa từng có thành trì nào thì bước này không làm gì cả, và đó là phần
 * lớn các save.
 */
const migrateV2ToV3: MigrationStep = (raw) => {
  const holdings = raw['holdings'];
  if (typeof holdings !== 'object' || holdings === null || Array.isArray(holdings)) return raw;

  const slice = { ...(holdings as Record<string, unknown>) };
  const list = slice['list'];
  if (!Array.isArray(list)) return raw;

  slice['list'] = list.map((holding: unknown) =>
    typeof holding === 'object' && holding !== null && !Array.isArray(holding)
      ? migrateHolding(holding as Record<string, unknown>)
      : holding,
  );
  return { ...raw, holdings: slice };
};

/**
 * Keyed by the version being migrated FROM. The loop below bumps
 * `meta.schemaVersion` itself, so a step only has to fix the shape.
 */
const MIGRATIONS: ReadonlyMap<number, MigrationStep> = new Map<number, MigrationStep>([
  [1, migrateV1ToV2],
  [2, migrateV2ToV3],
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
  const migrated = version < CURRENT_SCHEMA_VERSION;

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

  const state = parsed.data as unknown as GameState;
  settleMigratedHoldings(state, migrated);
  return state;
}

/**
 * DỌN BỐ CỤC SAU KHI SAVE ĐÃ QUA SCHEMA.
 *
 * Bước v2 → v3 chỉ dịch toạ độ; nó không thể dọn, vì dọn cần chạy bộ sinh địa
 * hình và bộ kiểm tra đặt công trình, mà cả hai đều đòi một `Holding` đã đúng
 * kiểu. Nên phép dời công trình xảy ra ở đây, một lần, ngay sau khi validate.
 *
 * `repairLayout` idempotent nên chạy thừa không hại gì — nhưng vẫn chỉ chạy khi
 * save thật sự vừa đi qua bước v2 → v3, để mở một save mới không phải trả tiền
 * cho một cuộc dọn dẹp không có gì để dọn.
 */
function settleMigratedHoldings(state: GameState, migrated: boolean): void {
  if (!migrated) return;
  const parsed = holdingsSliceSchema.safeParse(state['holdings']);
  if (!parsed.success) return;
  for (const holding of parsed.data.list) settleMigratedHolding(holding as Holding);
  state['holdings'] = parsed.data;
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
