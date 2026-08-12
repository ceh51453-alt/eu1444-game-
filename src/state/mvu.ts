/**
 * MVU — ĐƯỜNG GHI DUY NHẤT VÀO STATE (Phần 2 mục 5).
 *
 * Pipeline B1→B7 chạy đúng thứ tự, và ALL-OR-NOTHING: chỉ khi TOÀN BỘ op qua
 * hết mới apply. Một op fail là hủy cả lô.
 *
 * Lý do all-or-nothing không phải sự cẩn thận thừa: apply một nửa tạo ra state
 * mâu thuẫn mà về sau không cách nào phát hiện được — máu trừ rồi nhưng vết
 * thương chưa ghi, tiền trừ rồi nhưng hàng chưa có.
 */

import { z } from 'zod';
import {
  canWrite,
  permissionFor,
  readPath,
  schemaAtPath,
  slices,
  splitPath,
  type Actor,
  type GameState,
  type Permission,
} from './slices';
import type { PatchOp } from './mvu-parse';

export type { PatchOp, PatchOpKind } from './mvu-parse';

/** Bước nào trong pipeline đã chặn op. */
export type PipelineStep = 'B1' | 'B2' | 'B3' | 'B4' | 'B5' | 'B6' | 'B7';

export interface OpFailure {
  /** Vị trí op trong lô, để chỉ đúng dòng cho người chơi. */
  index: number;
  op: PatchOp;
  step: PipelineStep;
  code: string;
  /** Câu giải thích — đây chính là thứ AI đọc để tự sửa ở vòng sửa lỗi. */
  message: string;
  /** Giá trị thật đang có tại path, để AI đối chiếu. */
  currentValue?: unknown;
  /** Trích đoạn schema hợp lệ của path. */
  schemaHint?: string;
  permission?: Permission;
}

export interface ApplyOptions {
  actor: Actor;
  /** "Áp dụng dù sao" của tầng 2: bỏ qua B2. */
  skipPermissions?: boolean;
  /** "Áp dụng dù sao" của tầng 2: bỏ qua B6. KHÔNG BAO GIỜ bỏ được B5. */
  skipBounds?: boolean;
}

export interface ApplyResult {
  applied: boolean;
  /** State mới. `null` khi lô bị từ chối — state cũ giữ nguyên. */
  next: GameState | null;
  failures: OpFailure[];
  /** Đường dẫn đã đổi, cho phần highlight ở tab Biến. */
  changedPaths: string[];
}

// ---------------------------------------------------------------------------
// Tiện ích
// ---------------------------------------------------------------------------

export function deepEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (typeof left !== typeof right) return false;
  if (left === null || right === null) return false;
  if (Array.isArray(left) !== Array.isArray(right)) return false;

  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) return false;
    return left.every((item, index) => deepEqual(item, right[index]));
  }
  if (typeof left === 'object' && typeof right === 'object') {
    const leftKeys = Object.keys(left as object);
    const rightKeys = Object.keys(right as object);
    if (leftKeys.length !== rightKeys.length) return false;
    return leftKeys.every((key) =>
      deepEqual((left as Record<string, unknown>)[key], (right as Record<string, unknown>)[key]),
    );
  }
  return false;
}

function describe(value: unknown): string {
  if (value === undefined) return 'chưa có giá trị';
  if (typeof value === 'string') return `"${value}"`;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

/** Kiểu thô của một schema, dùng cho B3 và B5. */
type CoarseType = 'number' | 'string' | 'boolean' | 'array' | 'object' | 'enum' | 'other';

function coarseTypeOf(schema: z.ZodType): CoarseType {
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
    switch (type) {
      case 'number':
      case 'int':
        return 'number';
      case 'string':
        return 'string';
      case 'boolean':
        return 'boolean';
      case 'array':
        return 'array';
      case 'object':
      case 'record':
        return 'object';
      case 'enum':
        return 'enum';
      default:
        return 'other';
    }
  }
  return 'other';
}

/**
 * B5 — kiểm KIỂU, không kiểm ràng buộc.
 *
 * Tách khỏi B6 có chủ ý: nút "Áp dụng dù sao" của tầng 2 được phép cho hp vượt
 * trần (bỏ B6), nhưng KHÔNG BAO GIỜ được cho hp = "rất nhiều" (B5), vì phá
 * kiểu là hỏng save chứ không chỉ lệch cân bằng.
 */
function typeMatches(schema: z.ZodType, value: unknown): boolean {
  if (value === null || value === undefined) {
    // Để Zod ở B6 quyết định null/undefined có hợp lệ không.
    return true;
  }
  switch (coarseTypeOf(schema)) {
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'string':
    case 'enum':
      return typeof value === 'string';
    case 'boolean':
      return typeof value === 'boolean';
    case 'array':
      return Array.isArray(value);
    case 'object':
      return typeof value === 'object' && !Array.isArray(value);
    default:
      return true;
  }
}

function schemaHintFor(schema: z.ZodType | null): string {
  if (schema === null) return '(không có trong schema)';
  const type = coarseTypeOf(schema);
  const def = (schema as unknown as { def?: { checks?: unknown[]; entries?: Record<string, unknown> } }).def;
  const entries = def?.entries;
  if (type === 'enum' && entries !== undefined) {
    return `enum: ${Object.keys(entries).join(' | ')}`;
  }
  const checks = def?.checks;
  if (Array.isArray(checks) && checks.length > 0) {
    const bounds = checks
      .map((check) => (check as { _zod?: { def?: Record<string, unknown> } })._zod?.def)
      .filter((entry): entry is Record<string, unknown> => entry !== undefined)
      .map((entry) => {
        const kind = entry['check'];
        const value = entry['value'];
        if (kind === 'greater_than') return `> ${String(value)}`;
        if (kind === 'less_than') return `< ${String(value)}`;
        return typeof kind === 'string' ? kind : '';
      })
      .filter((text) => text !== '');
    if (bounds.length > 0) return `${type} (${bounds.join(', ')})`;
  }
  return type;
}

// ---------------------------------------------------------------------------
// Ghi vào bản nháp
// ---------------------------------------------------------------------------

function writePath(root: Record<string, unknown>, path: string, value: unknown): void {
  const segments = splitPath(path);
  const last = segments.pop();
  if (last === undefined) return;

  let current: Record<string, unknown> = root;
  for (const segment of segments) {
    const next = current[segment];
    if (typeof next !== 'object' || next === null) current[segment] = {};
    current = current[segment] as Record<string, unknown>;
  }
  current[last] = value;
}

function deletePath(root: Record<string, unknown>, path: string): void {
  const segments = splitPath(path);
  const last = segments.pop();
  if (last === undefined) return;

  let current: unknown = root;
  for (const segment of segments) {
    if (typeof current !== 'object' || current === null) return;
    current = (current as Record<string, unknown>)[segment];
  }
  if (typeof current !== 'object' || current === null) return;
  if (Array.isArray(current)) {
    if (/^\d+$/.test(last)) current.splice(Number(last), 1);
    return;
  }
  delete (current as Record<string, unknown>)[last];
}

/** Giá trị mới sau khi áp một op. `undefined` nghĩa là xóa. */
function nextValueFor(op: PatchOp, current: unknown): unknown {
  switch (op.op) {
    case 'set':
      return op.to;
    case 'add': {
      if (typeof current === 'number' && typeof op.to === 'number') return current + op.to;
      if (Array.isArray(current)) return [...current, op.to];
      return op.to;
    }
    case 'push':
      return Array.isArray(current) ? [...current, op.to] : [op.to];
    case 'pull':
      return Array.isArray(current) ? current.filter((item) => !deepEqual(item, op.to)) : current;
    case 'delete':
      return undefined;
    default:
      return current;
  }
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

function checkB1(op: PatchOp, index: number, rootSchema: z.ZodType): OpFailure | null {
  if (schemaAtPath(rootSchema, op.path) !== null) return null;
  const sliceId = splitPath(op.path)[0] ?? '';
  const known = slices.ids().join(', ');
  return {
    index,
    op,
    step: 'B1',
    code: 'path-khong-ton-tai',
    message: slices.get(sliceId) === undefined
      ? `Không có slice "${sliceId}". Các slice đang có: ${known}.`
      : `Đường dẫn "${op.path}" không có trong schema của slice "${sliceId}".`,
  };
}

function checkB2(op: PatchOp, index: number, actor: Actor): OpFailure | null {
  if (canWrite(actor, op.path)) return null;
  const permission = permissionFor(op.path);

  const message =
    permission === 'locked'
      ? `Đường dẫn "${op.path}" là 'locked' — không ai được ghi sau khi tạo ván chơi.`
      : `Đường dẫn "${op.path}" thuộc quyền 'engine', AI không được ghi. Nếu bạn muốn thay đổi này xảy ra, hãy MÔ TẢ nó trong truyện; engine sẽ tự tính và tự ghi.`;

  return { index, op, step: 'B2', code: `quyen-${permission}`, message, permission };
}

function checkB3(
  op: PatchOp,
  index: number,
  rootSchema: z.ZodType,
  current: unknown,
): OpFailure | null {
  const schema = schemaAtPath(rootSchema, op.path);
  if (schema === null) return null; // B1 đã bắt
  const type = coarseTypeOf(schema);

  if ((op.op === 'push' || op.op === 'pull') && type !== 'array') {
    return {
      index,
      op,
      step: 'B3',
      code: 'op-sai-kieu',
      message: `Không thể "${op.op}" vào "${op.path}" vì nó là ${type}, không phải mảng. Dùng _.set cho giá trị đơn.`,
      currentValue: current,
      schemaHint: schemaHintFor(schema),
    };
  }
  if (op.op === 'add' && type !== 'number' && type !== 'array') {
    return {
      index,
      op,
      step: 'B3',
      code: 'op-sai-kieu',
      message: `Không thể "add" vào "${op.path}" vì nó là ${type}. "add" chỉ dùng cho số hoặc mảng.`,
      currentValue: current,
      schemaHint: schemaHintFor(schema),
    };
  }
  if (op.op === 'add' && type === 'number' && typeof op.to !== 'number') {
    return {
      index,
      op,
      step: 'B3',
      code: 'op-sai-kieu',
      message: `"add" vào "${op.path}" cần một con số, nhận được ${describe(op.to)}.`,
      currentValue: current,
      schemaHint: schemaHintFor(schema),
    };
  }
  return null;
}

/**
 * B4 — COMPARE-AND-SWAP. Lá chắn quan trọng nhất chống việc AI bịa số.
 *
 * README mục 8 xếp việc bỏ qua bước này là chỗ dễ hỏng thứ ba của cả dự án:
 * bỏ nó đi là mất luôn khả năng phát hiện AI đang dùng state cũ.
 */
/** Path này có nhận `null` như một giá trị thật không? */
function isNullable(schema: z.ZodType | null): boolean {
  if (schema === null) return false;
  let current = schema;
  for (let guard = 0; guard < 20; guard++) {
    const def = (current as unknown as {
      def?: { type?: string; innerType?: z.ZodType; options?: z.ZodType[] };
    }).def;
    if (def?.type === 'nullable') return true;
    if (def?.type === 'union') {
      return (def.options ?? []).some((option) => {
        const optionType = (option as unknown as { def?: { type?: string } }).def?.type;
        return optionType === 'null' || optionType === 'nullable';
      });
    }
    if (def?.innerType !== undefined) {
      current = def.innerType;
      continue;
    }
    return false;
  }
  return false;
}

function checkB4(
  op: PatchOp,
  index: number,
  current: unknown,
  actor: Actor,
  schema: z.ZodType | null,
): OpFailure | null {
  if (op.op !== 'set') return null;

  if (op.from !== undefined) {
    if (deepEqual(op.from, current)) return null;
    // `null` để chỉ "chỗ này chưa có gì" là cách viết tự nhiên nhất, và cả
    // MVU lẫn JSON đều không có `undefined`. Coi nó bằng `undefined` — TRỪ KHI
    // schema thật sự nhận `null` là một giá trị, lúc đó phân biệt là có nghĩa.
    if (op.from === null && current === undefined && !isNullable(schema)) return null;
    return {
      index,
      op,
      step: 'B4',
      code: 'state-cu',
      message: `from=${describe(op.from)} nhưng giá trị hiện tại là ${describe(current)}. State bạn dùng đã cũ.`,
      currentValue: current,
    };
  }

  // Bỏ trống `from` chỉ chấp nhận khi path đang trống — và chỉ siết với AI,
  // vì engine tính trực tiếp từ state hiện tại nên không cần đối chiếu.
  if (actor === 'ai' && current !== undefined) {
    return {
      index,
      op,
      step: 'B4',
      code: 'thieu-from',
      message: `Thiếu giá trị cũ. "${op.path}" đang là ${describe(current)}; hãy ghi rõ giá trị cũ để engine đối chiếu.`,
      currentValue: current,
    };
  }
  return null;
}

/** Schema của phần tử, khi path là mảng. */
function elementSchemaOf(schema: z.ZodType): z.ZodType | null {
  let current = schema;
  for (let guard = 0; guard < 20; guard++) {
    const def = (current as unknown as { def?: { type?: string; innerType?: z.ZodType; element?: z.ZodType } }).def;
    if (def?.type === 'array') return def.element ?? null;
    if (def?.innerType !== undefined) {
      current = def.innerType;
      continue;
    }
    return null;
  }
  return null;
}

function checkB5(
  op: PatchOp,
  index: number,
  rootSchema: z.ZodType,
  nextValue: unknown,
  currentValue: unknown,
): OpFailure | null {
  if (op.op === 'delete' || op.op === 'pull') return null;
  const schema = schemaAtPath(rootSchema, op.path);
  if (schema === null) return null;

  // Nối vào mảng thì kiểu cần kiểm là kiểu PHẦN TỬ. Kiểm cả mảng thì
  // `["a", 123]` vẫn là "một mảng" và lọt xuống B6 — mà B6 thì nút "Áp dụng
  // dù sao" bỏ qua được, nghĩa là số lọt được vào mảng chuỗi và hỏng save.
  const appendsToArray =
    op.op === 'push' || (op.op === 'add' && Array.isArray(currentValue));
  const target = appendsToArray ? elementSchemaOf(schema) : schema;
  const value = appendsToArray ? op.to : nextValue;

  if (target === null || typeMatches(target, value)) return null;

  return {
    index,
    op,
    step: 'B5',
    code: 'sai-kieu',
    message: appendsToArray
      ? `Phần tử ${describe(value)} không đúng kiểu cho mảng "${op.path}" (phần tử là ${schemaHintFor(target)}).`
      : `Giá trị ${describe(value)} không đúng kiểu cho "${op.path}" (${schemaHintFor(target)}).`,
    schemaHint: schemaHintFor(target),
  };
}

function checkB6(
  op: PatchOp,
  index: number,
  rootSchema: z.ZodType,
  nextValue: unknown,
): OpFailure | null {
  if (op.op === 'delete') return null;
  const schema = schemaAtPath(rootSchema, op.path);
  if (schema === null) return null;

  const parsed = schema.safeParse(nextValue);
  if (parsed.success) return null;

  return {
    index,
    op,
    step: 'B6',
    code: 'ngoai-pham-vi',
    message: `Giá trị ${describe(nextValue)} không hợp lệ cho "${op.path}": ${parsed.error.issues
      .map((issue) => issue.message)
      .join('; ')}.`,
    schemaHint: schemaHintFor(schema),
  };
}

/**
 * GỘP MỘT CHUỖI `set` TRÊN CÙNG MỘT ĐƯỜNG DẪN THÀNH MỘT OP.
 *
 * B4 đối chiếu `from` với STATE HIỆN TẠI, không phải với state sau op trước đó
 * — đó là chủ ý, và là lá chắn chống việc AI dùng state cũ. Nhưng nó khiến một
 * lô CHÍNH ĐÁNG bị từ chối: minigame của Phần 9–11 chạy nhiều hiệp trên một bản
 * làm việc rồi mới giao cả lô cho người gọi chốt MỘT lần, nên ba vết thương
 * trong một trận đấu sinh ra `body.nextInjuryNo` 1→2, rồi 2→3, rồi 3→4. Áp cả
 * ba lên state trước trận thì op thứ hai thấy `from=2` trong khi state vẫn là 1,
 * và cả lô bị hủy — nghĩa là "Chốt kết quả" không ghi được gì.
 *
 * Gộp lại thì lô nói đúng thứ nó thật sự muốn nói: `1 → 4`, một lần.
 *
 * KHÔNG dùng cho lô của AI. Với AI, hai `set` chồng nhau trên một đường dẫn là
 * DẤU HIỆU nó đang lẫn, và B4 phải bắt được. Hàm này dành cho lô của engine,
 * nơi từng op đã được chính engine tính ra tuần tự.
 */
export function squashOps(ops: readonly PatchOp[]): PatchOp[] {
  const out: PatchOp[] = [];
  const lastSet = new Map<string, number>();

  for (const op of ops) {
    if (op.op !== 'set') {
      // Một `push`/`add`/`delete` xen vào cắt chuỗi: gộp qua đầu nó là đổi thứ
      // tự áp op, và thứ tự thì có nghĩa.
      lastSet.delete(op.path);
      out.push(op);
      continue;
    }

    const at = lastSet.get(op.path);
    const previous = at === undefined ? undefined : out[at];
    if (at === undefined || previous === undefined) {
      lastSet.set(op.path, out.length);
      out.push({ ...op });
      continue;
    }

    // Giữ `from` của op ĐẦU (state thật lúc lô bắt đầu) và `to` của op CUỐI.
    out[at] = {
      ...previous,
      ...(op.to === undefined ? {} : { to: op.to }),
      reason: previous.reason === op.reason ? previous.reason : `${previous.reason}; ${op.reason}`,
    };
  }

  return out;
}

/**
 * Chạy cả lô qua B1→B7.
 * Trả về state mới chỉ khi mọi op đều sạch.
 */
export function applyPatch(
  state: GameState,
  ops: readonly PatchOp[],
  options: ApplyOptions,
): ApplyResult {
  const rootSchema = slices.rootSchema();
  const failures: OpFailure[] = [];

  // --- B1 → B4: kiểm từng op trên state HIỆN TẠI --------------------------
  // Cố ý kiểm hết chứ không dừng ở op đầu tiên: vòng sửa lỗi cần biết TẤT CẢ
  // chỗ sai, gửi từng lỗi một là tốn hai lượt gọi cho hai lỗi.
  for (const [index, op] of ops.entries()) {
    const current = readPath(state, op.path);

    const b1 = checkB1(op, index, rootSchema);
    if (b1 !== null) {
      failures.push(b1);
      continue;
    }
    if (options.skipPermissions !== true) {
      const b2 = checkB2(op, index, options.actor);
      if (b2 !== null) {
        failures.push(b2);
        continue;
      }
    }
    const b3 = checkB3(op, index, rootSchema, current);
    if (b3 !== null) {
      failures.push(b3);
      continue;
    }
    const b4 = checkB4(op, index, current, options.actor, schemaAtPath(rootSchema, op.path));
    if (b4 !== null) {
      failures.push(b4);
      continue;
    }

    // B5 chạy sớm một lần ở đây, trên state hiện tại.
    // Không có bước này thì một op sai KIỂU chỉ lộ ra sau khi mọi op khác đã
    // qua B1–B4 — nghĩa là AI phải sửa hai vòng cho hai lỗi, và mỗi vòng là
    // một lượt gọi proxy nữa. Kiểm kiểu không phụ thuộc thứ tự áp op nên chạy
    // sớm là an toàn; lần kiểm chính thức vẫn nằm ở vòng dưới.
    const earlyB5 = checkB5(op, index, rootSchema, nextValueFor(op, current), current);
    if (earlyB5 !== null) {
      failures.push(earlyB5);
      continue;
    }
  }

  if (failures.length > 0) {
    return { applied: false, next: null, failures, changedPaths: [] };
  }

  // --- Áp lên bản nháp rồi mới kiểm giá trị -------------------------------
  const draft = structuredClone(state) as unknown as Record<string, unknown>;
  const changedPaths: string[] = [];

  for (const [index, op] of ops.entries()) {
    const current = readPath(draft, op.path);
    const nextValue = nextValueFor(op, current);

    const b5 = checkB5(op, index, rootSchema, nextValue, current);
    if (b5 !== null) {
      failures.push(b5);
      continue;
    }
    if (options.skipBounds !== true) {
      const b6 = checkB6(op, index, rootSchema, nextValue);
      if (b6 !== null) {
        failures.push(b6);
        continue;
      }
    }

    if (op.op === 'delete') deletePath(draft, op.path);
    else writePath(draft, op.path, nextValue);
    changedPaths.push(op.path);
  }

  if (failures.length > 0) {
    return { applied: false, next: null, failures, changedPaths: [] };
  }

  // --- B7: ràng buộc chéo -------------------------------------------------
  const nextState = draft as unknown as GameState;
  for (const { sliceId, constraint } of slices.constraints()) {
    const problem = constraint.check(nextState);
    if (problem === null) continue;

    // Gán lỗi cho op đầu tiên chạm vào slice đó, để người chơi biết dòng nào.
    const culprit = ops.findIndex((op) => splitPath(op.path)[0] === sliceId);
    const index = culprit === -1 ? 0 : culprit;
    const op = ops[index];
    if (op === undefined) continue;

    failures.push({
      index,
      op,
      step: 'B7',
      code: `rang-buoc-${constraint.id}`,
      message: `Vi phạm ràng buộc "${constraint.id}" của slice "${sliceId}": ${problem}`,
    });
  }

  if (failures.length > 0) {
    return { applied: false, next: null, failures, changedPaths: [] };
  }

  return { applied: true, next: nextState, failures: [], changedPaths };
}
