/**
 * SLICE REGISTRY — cách mọi module sau cắm vào (Phần 2 mục 2).
 *
 * State KHÔNG viết thành một schema khổng lồ. Mỗi hệ thống đăng ký một slice,
 * root state là hợp nhất của chúng, namespace theo id:
 * `state.character.stats.hp`.
 *
 * Không slice nào được ghi sang namespace của slice khác. Muốn tác động thì
 * phát event, chủ slice tự xử lý.
 *
 * `meta` và `player` của Phần 0 cũng là slice, đăng ký sẵn ở cuối file này —
 * một cơ chế duy nhất, không có đường tắt cho lõi.
 */

import { z } from 'zod';
import { DEFAULT_START_DATE } from '@/core/clock';
import { initialRngHubState } from '@/core/rng';
import { CURRENT_SCHEMA_VERSION, metaSchema, playerSchema } from './schema';

/** Ba mức quyền ghi (Phần 2 mục 3). */
export type Permission = 'engine' | 'ai' | 'locked';

/** Ai đang cố ghi. */
export type Actor = 'engine' | 'ai' | 'player';

/** Ràng buộc chéo giữa nhiều field, chạy ở bước B7. */
export interface CrossFieldConstraint {
  id: string;
  /** Trả về null khi hợp lệ, hoặc câu giải thích khi vi phạm. */
  check(state: GameState): string | null;
}

/** Biến phụ đăng ký trong slice (Phần 2 mục 7). */
export interface DerivedSpec {
  id: string;
  /** Đường dẫn state mà `compute` được phép đọc. Đọc ngoài danh sách là lỗi. */
  deps: string[];
  compute(state: GameState): unknown;
}

export interface SliceDefinition {
  id: string;
  /** Phiên bản schema của riêng slice này. */
  version?: number;
  schema: z.ZodObject;
  defaults(context: { seed: string }): Record<string, unknown>;
  /** Đường dẫn TƯƠNG ĐỐI trong slice → quyền. Hỗ trợ `*` cho một đoạn. */
  permissions?: Record<string, Permission>;
  derived?: DerivedSpec[];
  constraints?: CrossFieldConstraint[];
  migrate?: Record<number, (old: unknown) => unknown>;
}

/**
 * Root state.
 *
 * `meta` và `player` được gõ kiểu chặt vì mọi phần đều đụng tới; các slice
 * khác đăng ký lúc chạy nên chỉ có `unknown` — kiểu thật nằm trong schema của
 * chính slice đó và được Zod kiểm ở bước B5/B6.
 */
export interface GameState {
  meta: z.infer<typeof metaSchema>;
  player: z.infer<typeof playerSchema>;
  [slice: string]: unknown;
}

export class SliceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SliceError';
  }
}

class SliceRegistry {
  #slices = new Map<string, SliceDefinition>();

  register(definition: SliceDefinition): void {
    if (definition.id === '') {
      throw new SliceError('slice phải có id');
    }
    if (definition.id.includes('.')) {
      throw new SliceError(`id slice "${definition.id}" không được chứa dấu chấm`);
    }
    if (this.#slices.has(definition.id)) {
      throw new SliceError(`slice "${definition.id}" đã được đăng ký — trùng namespace`);
    }

    // Hai slice cùng đặt tên một biến phụ thì không biết cái nào thắng.
    for (const derived of definition.derived ?? []) {
      const owner = this.ownerOfDerived(derived.id);
      if (owner !== null) {
        throw new SliceError(
          `biến phụ "${derived.id}" đã do slice "${owner}" đăng ký`,
        );
      }
    }

    this.#slices.set(definition.id, definition);
  }

  get(id: string): SliceDefinition | undefined {
    return this.#slices.get(id);
  }

  all(): SliceDefinition[] {
    return [...this.#slices.values()];
  }

  ids(): string[] {
    return [...this.#slices.keys()];
  }

  derived(): DerivedSpec[] {
    return this.all().flatMap((slice) => slice.derived ?? []);
  }

  constraints(): Array<{ sliceId: string; constraint: CrossFieldConstraint }> {
    return this.all().flatMap((slice) =>
      (slice.constraints ?? []).map((constraint) => ({ sliceId: slice.id, constraint })),
    );
  }

  ownerOfDerived(derivedId: string): string | null {
    for (const slice of this.#slices.values()) {
      if ((slice.derived ?? []).some((derived) => derived.id === derivedId)) return slice.id;
    }
    return null;
  }

  /**
   * Schema hợp nhất. `.loose()` có chủ ý: một save do bản build khác tạo ra,
   * có slice mà bản này chưa đăng ký, phải sống sót chứ không bị xóa trắng.
   */
  rootSchema(): z.ZodObject {
    const shape: Record<string, z.ZodType> = {};
    for (const [id, slice] of this.#slices) shape[id] = slice.schema;
    return z.object(shape).loose();
  }

  /** State ban đầu, gộp defaults của mọi slice. */
  defaults(seed: string): GameState {
    const state: Record<string, unknown> = {};
    for (const [id, slice] of this.#slices) state[id] = slice.defaults({ seed });
    return state as unknown as GameState;
  }

  /** Chỉ dùng trong test. */
  reset(): void {
    this.#slices.clear();
    registerCoreSlices();
  }
}

export const slices = new SliceRegistry();

// ---------------------------------------------------------------------------
// Đường dẫn
// ---------------------------------------------------------------------------

export function splitPath(path: string): string[] {
  return path.split('.').filter((segment) => segment !== '');
}

/** Bóc các lớp bọc (optional, nullable, default…) để lấy schema thật bên trong. */
function unwrap(schema: z.ZodType): z.ZodType {
  let current = schema;
  for (let guard = 0; guard < 20; guard++) {
    const def = (current as unknown as { def?: { type?: string; innerType?: z.ZodType } }).def;
    const type = def?.type;
    if (
      (type === 'optional' ||
        type === 'nullable' ||
        type === 'default' ||
        type === 'prefault' ||
        type === 'catch' ||
        type === 'readonly' ||
        type === 'nonoptional') &&
      def?.innerType !== undefined
    ) {
      current = def.innerType;
      continue;
    }
    return current;
  }
  return current;
}

/**
 * Tìm schema tại một đường dẫn. Trả về null khi đường dẫn không tồn tại —
 * đây chính là bước B1 của pipeline.
 */
export function schemaAtPath(root: z.ZodType, path: string): z.ZodType | null {
  let current: z.ZodType = root;

  for (const segment of splitPath(path)) {
    const node = unwrap(current);
    const def = (node as unknown as {
      def?: {
        type?: string;
        element?: z.ZodType;
        valueType?: z.ZodType;
        options?: z.ZodType[];
      };
    }).def;

    switch (def?.type) {
      case 'object': {
        const shape = (node as z.ZodObject).shape as Record<string, z.ZodType | undefined>;
        const next = shape[segment];
        if (next === undefined) return null;
        current = next;
        break;
      }
      case 'record': {
        if (def.valueType === undefined) return null;
        current = def.valueType;
        break;
      }
      case 'array': {
        // Chỉ số mảng, hoặc `*` khi đang so khớp mẫu quyền.
        if (segment !== '*' && !/^\d+$/.test(segment)) return null;
        if (def.element === undefined) return null;
        current = def.element;
        break;
      }
      case 'union': {
        const matched = (def.options ?? [])
          .map((option) => schemaAtPath(option, segment))
          .find((result) => result !== null);
        if (matched === undefined || matched === null) return null;
        current = matched;
        break;
      }
      default:
        return null;
    }
  }

  return current;
}

/** Đường dẫn có nằm trong schema đã đăng ký không (B1). */
export function pathExists(path: string): boolean {
  return schemaAtPath(slices.rootSchema(), path) !== null;
}

/** Đọc giá trị hiện tại tại một đường dẫn. */
export function readPath(state: unknown, path: string): unknown {
  let current: unknown = state;
  for (const segment of splitPath(path)) {
    if (current === null || current === undefined) return undefined;
    if (Array.isArray(current)) {
      if (!/^\d+$/.test(segment)) return undefined;
      current = current[Number(segment)];
      continue;
    }
    if (typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

// ---------------------------------------------------------------------------
// Quyền ghi (mục 3)
// ---------------------------------------------------------------------------

/** Mẫu có khớp đường dẫn không. `*` khớp đúng MỘT đoạn. */
export function patternMatches(pattern: string, path: string): boolean {
  const patternSegments = splitPath(pattern);
  const pathSegments = splitPath(path);
  if (patternSegments.length !== pathSegments.length) return false;
  return patternSegments.every(
    (segment, index) => segment === '*' || segment === pathSegments[index],
  );
}

/**
 * Mẫu càng cụ thể càng thắng: ít dấu `*` hơn thì thắng; hòa thì mẫu dài hơn
 * thắng. Không có mẫu nào khớp → `engine`, vì mặc định an toàn hơn.
 */
export function permissionFor(path: string): Permission {
  const segments = splitPath(path);
  const sliceId = segments[0];
  if (sliceId === undefined) return 'engine';

  const slice = slices.get(sliceId);
  if (slice === undefined) return 'engine';

  const relative = segments.slice(1).join('.');
  let best: { permission: Permission; wildcards: number; length: number } | null = null;

  for (const [pattern, permission] of Object.entries(slice.permissions ?? {})) {
    if (!patternMatches(pattern, relative)) continue;
    const patternSegments = splitPath(pattern);
    const wildcards = patternSegments.filter((segment) => segment === '*').length;
    const length = patternSegments.length;

    if (
      best === null ||
      wildcards < best.wildcards ||
      (wildcards === best.wildcards && length > best.length)
    ) {
      best = { permission, wildcards, length };
    }
  }

  // Quyền của cha áp cho con: `stats.*` phủ luôn `stats.hp.current`.
  if (best === null) {
    for (const [pattern, permission] of Object.entries(slice.permissions ?? {})) {
      const patternSegments = splitPath(pattern);
      if (patternSegments.length >= splitPath(relative).length) continue;
      const prefix = splitPath(relative).slice(0, patternSegments.length).join('.');
      if (!patternMatches(pattern, prefix)) continue;
      const wildcards = patternSegments.filter((segment) => segment === '*').length;
      if (
        best === null ||
        wildcards < best.wildcards ||
        (wildcards === best.wildcards && patternSegments.length > best.length)
      ) {
        best = { permission, wildcards, length: patternSegments.length };
      }
    }
  }

  return best?.permission ?? 'engine';
}

/** Actor này có được ghi vào path này không. */
export function canWrite(actor: Actor, path: string): boolean {
  const permission = permissionFor(path);
  if (permission === 'locked') return false;
  if (permission === 'engine') return actor !== 'ai';
  return true; // 'ai' — engine và người chơi đương nhiên cũng ghi được
}

// ---------------------------------------------------------------------------
// Slice lõi: meta và player (Phần 0)
// ---------------------------------------------------------------------------

function registerCoreSlices(): void {
  slices.register({
    id: 'meta',
    schema: metaSchema,
    defaults: ({ seed }) => ({
      schemaVersion: CURRENT_SCHEMA_VERSION,
      seed,
      rng: initialRngHubState(seed),
      turn: 0,
      gameDate: { ...DEFAULT_START_DATE },
    }),
    permissions: {
      // Seed là danh tính của ván chơi; đổi nó là phá luôn R3.
      seed: 'locked',
      schemaVersion: 'locked',
      // Còn lại engine giữ: lượt, lịch, và vị trí xúc sắc.
      turn: 'engine',
      'gameDate.*': 'engine',
      'rng.*': 'engine',
    },
  });

  slices.register({
    id: 'player',
    schema: playerSchema,
    defaults: () => ({ name: '' }),
    permissions: {
      // Tên chọn lúc tạo nhân vật rồi khóa lại.
      name: 'locked',
    },
  });
}

registerCoreSlices();
