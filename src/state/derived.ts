/**
 * BIẾN PHỤ (Phần 2 mục 7) — bước 7 của vòng lặp lượt.
 *
 * Biến phụ là HÀM của state, không phải state. Chúng không được lưu, không
 * bao giờ do AI ghi, và được dựng lại từ đầu mỗi lượt — nên một save không
 * bao giờ có thể tự mâu thuẫn với chính nó.
 *
 * Ba thứ bắt buộc ở đây:
 *  - `compute` phải THUẦN và chỉ đọc trong `deps`. Chế độ dev bọc state bằng
 *    Proxy và ném lỗi ngay khi đọc ra ngoài — sai deps thì đồ thị phụ thuộc
 *    sai, và bug đó im lặng cho tới khi một biến phụ ngừng cập nhật.
 *  - Sắp xếp topo để tính đúng thứ tự.
 *  - Phát hiện chu trình LÚC KHỞI ĐỘNG, không để chạy rồi mới chết.
 */

import { readPath, slices, splitPath, type DerivedSpec, type GameState } from './slices';

/** Không gian tên của biến phụ. Nằm ngoài state, MVU không ghi vào được. */
export const DERIVED_NAMESPACE = 'derived';

export type DerivedValues = Record<string, unknown>;

export class DerivedGraphError extends Error {
  constructor(
    message: string,
    readonly cycle?: string[],
  ) {
    super(message);
    this.name = 'DerivedGraphError';
  }
}

/** Dep này trỏ tới một biến phụ khác? */
function derivedDependency(dep: string): string | null {
  const segments = splitPath(dep);
  if (segments[0] !== DERIVED_NAMESPACE) return null;
  return segments[1] ?? null;
}

/**
 * Sắp xếp topo. Ném lỗi khi có chu trình hoặc khi trỏ tới biến phụ không tồn
 * tại — cả hai đều phải nổ lúc khởi động chứ không phải giữa một lượt chơi.
 */
export function derivedOrder(specs: readonly DerivedSpec[] = slices.derived()): string[] {
  const byId = new Map(specs.map((spec) => [spec.id, spec] as const));
  const order: string[] = [];
  const state = new Map<string, 'visiting' | 'done'>();
  const stack: string[] = [];

  const visit = (id: string): void => {
    const status = state.get(id);
    if (status === 'done') return;
    if (status === 'visiting') {
      const cycle = [...stack.slice(stack.indexOf(id)), id];
      throw new DerivedGraphError(`biến phụ có chu trình: ${cycle.join(' → ')}`, cycle);
    }

    const spec = byId.get(id);
    if (spec === undefined) {
      throw new DerivedGraphError(`biến phụ "${id}" chưa được đăng ký nhưng có cái khác phụ thuộc vào nó`);
    }

    state.set(id, 'visiting');
    stack.push(id);
    for (const dep of spec.deps) {
      const target = derivedDependency(dep);
      if (target !== null) visit(target);
    }
    stack.pop();
    state.set(id, 'done');
    order.push(id);
  };

  for (const spec of specs) visit(spec.id);
  return order;
}

/** Gọi lúc khởi động. Ném lỗi thay vì để đồ thị hỏng chạy tiếp. */
export function validateDerivedGraph(): void {
  derivedOrder();
}

// ---------------------------------------------------------------------------
// Proxy kiểm deps (chỉ bật ở chế độ dev)
// ---------------------------------------------------------------------------

export class DerivedDepError extends Error {
  constructor(
    readonly derivedId: string,
    readonly path: string,
  ) {
    super(
      `biến phụ "${derivedId}" đọc "${path}" nhưng không khai nó trong deps — sửa deps, đừng bỏ kiểm tra`,
    );
    this.name = 'DerivedDepError';
  }
}

/** Đọc `path` có nằm trong phạm vi `deps` không (một bên là tiền tố của bên kia). */
function withinDeps(deps: readonly string[], path: string): boolean {
  const read = splitPath(path);
  return deps.some((dep) => {
    const declared = splitPath(dep);
    const shorter = Math.min(declared.length, read.length);
    for (let index = 0; index < shorter; index++) {
      if (declared[index] !== read[index]) return false;
    }
    return true;
  });
}

function guard(target: unknown, derivedId: string, deps: readonly string[], prefix: string): unknown {
  if (typeof target !== 'object' || target === null) return target;

  return new Proxy(target as Record<string, unknown>, {
    get(object, property, receiver) {
      if (typeof property === 'symbol') return Reflect.get(object, property, receiver);
      // Mảng và object đều có thuộc tính kỹ thuật; đừng tính chúng là đọc state.
      if (property === 'length' || property === 'constructor' || property in Array.prototype) {
        return Reflect.get(object, property, receiver);
      }

      const path = prefix === '' ? property : `${prefix}.${property}`;
      if (!withinDeps(deps, path)) throw new DerivedDepError(derivedId, path);

      return guard(Reflect.get(object, property, receiver), derivedId, deps, path);
    },
  });
}

// ---------------------------------------------------------------------------
// Tính
// ---------------------------------------------------------------------------

export interface ComputeOptions {
  /** Bọc state bằng Proxy để bắt việc đọc ngoài deps. Mặc định bật khi DEV. */
  strict?: boolean;
  /** Giá trị lượt trước, để tính lại theo nhánh. */
  previous?: DerivedValues;
  /**
   * Đường dẫn state vừa đổi. Có nó thì chỉ tính lại nhánh liên quan;
   * không có thì tính lại tất cả.
   */
  changedPaths?: readonly string[];
}

function dependsOnChange(spec: DerivedSpec, changedPaths: readonly string[]): boolean {
  return spec.deps.some((dep) => {
    if (derivedDependency(dep) !== null) return false;
    return changedPaths.some((changed) => {
      const declared = splitPath(dep);
      const touched = splitPath(changed);
      const shorter = Math.min(declared.length, touched.length);
      for (let index = 0; index < shorter; index++) {
        if (declared[index] !== touched[index]) return false;
      }
      return true;
    });
  });
}

/**
 * Tính lại biến phụ.
 *
 * `changedPaths` có thì chỉ tính lại nhánh có deps thay đổi, và mọi biến phụ
 * phụ thuộc (trực tiếp hay gián tiếp) vào nhánh đó.
 */
export function computeDerived(state: GameState, options: ComputeOptions = {}): DerivedValues {
  const specs = slices.derived();
  const order = derivedOrder(specs);
  const byId = new Map(specs.map((spec) => [spec.id, spec] as const));
  const strict = options.strict ?? import.meta.env?.DEV === true;

  const values: DerivedValues = { ...(options.previous ?? {}) };
  const recomputed = new Set<string>();

  for (const id of order) {
    const spec = byId.get(id);
    if (spec === undefined) continue;

    const mustRecompute =
      options.changedPaths === undefined ||
      options.previous === undefined ||
      !(id in values) ||
      dependsOnChange(spec, options.changedPaths) ||
      spec.deps.some((dep) => {
        const target = derivedDependency(dep);
        return target !== null && recomputed.has(target);
      });

    if (!mustRecompute) continue;

    const view = strict
      ? (guard(withDerived(state, values), spec.id, spec.deps, '') as GameState)
      : (withDerived(state, values) as GameState);

    values[id] = spec.compute(view);
    recomputed.add(id);
  }

  return values;
}

/** State + biến phụ, để một biến phụ đọc được biến phụ khác qua `derived.x`. */
function withDerived(state: GameState, values: DerivedValues): Record<string, unknown> {
  return { ...(state as unknown as Record<string, unknown>), [DERIVED_NAMESPACE]: values };
}

/** Nút "Tính lại toàn bộ" ở tab Debug: bỏ cache, chạy lại từ đầu. */
export function recomputeAll(state: GameState, strict = false): DerivedValues {
  return computeDerived(state, { strict });
}

/** Đọc một biến phụ hoặc một đường dẫn state, dùng chung cho tab Biến. */
export function readDerivedOrState(
  state: GameState,
  values: DerivedValues,
  path: string,
): unknown {
  const segments = splitPath(path);
  if (segments[0] === DERIVED_NAMESPACE) {
    return segments[1] === undefined ? values : values[segments[1]];
  }
  return readPath(state, path);
}
