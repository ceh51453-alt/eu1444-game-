/**
 * MÔ HÌNH KHỐI PROMPT (Phần 3 mục 2, 3, 4).
 *
 * Khối là DỮ LIỆU, không phải file. Kéo thả và bật/tắt được nghĩa là nội dung
 * phải nằm trong IndexedDB; để nguyên file `.ejs` thì mỗi lần sửa một chữ phải
 * build lại, không dùng được lúc đang chơi.
 *
 *   `/prompts/*.ejs`  → mặc định gốc, nạp bằng `import.meta.glob`
 *   IndexedDB         → nguồn sự thật sau lần chạy đầu tiên
 *
 * ĐỪNG NHẦM với `preset/blocks.ts`: file đó là hình dạng khối ĐỌC TỪ preset
 * SillyTavern (Phần 1), có `marker`, `injectionOrder`, `source`. File này là
 * khối của GAME — thứ Prompt Manager sửa và pipeline lắp.
 *
 * Bốn khối `[LOCKED]` không tắt, không xóa, không kéo ra khỏi vị trí. UI chặn
 * cứng, và mọi hàm ở đây cũng chặn — README mục 8.2 xếp đây là chỗ dễ hỏng thứ
 * hai của cả dự án: thiếu khối 11 là AI bịa số (phá R1), thiếu khối 13 là không
 * parse được patch (phá Phần 2).
 */

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { z } from 'zod';

export type BlockRole = 'system' | 'user' | 'assistant';

/** `depth` = chèn ngược từ cuối danh sách tin nhắn. */
export type BlockPlacement = 'sequential' | { depth: number };

export interface PromptBlock {
  id: string;
  /** Hiện trên UI kéo thả. */
  name: string;
  enabled: boolean;
  /** true = không xóa, không tắt, không kéo được. */
  locked: boolean;
  role: BlockRole;
  placement: BlockPlacement;
  order: number;
  /** EJS. */
  template: string;
  /**
   * Biểu thức EJS; sai thì bỏ khối.
   * `| undefined` là cố ý: khối đi qua Zod khi nạp từ IndexedDB và từ file
   * chia sẻ, mà Zod suy ra `string | undefined` cho một trường optional.
   */
  condition?: string | undefined;
  /** 1 = cắt đầu tiên, 10 = không bao giờ cắt. */
  budgetPriority: number;
}

export const blockSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  enabled: z.boolean(),
  locked: z.boolean(),
  role: z.enum(['system', 'user', 'assistant']),
  placement: z.union([z.literal('sequential'), z.object({ depth: z.number().int().min(0) })]),
  order: z.number().int(),
  template: z.string(),
  condition: z.string().optional(),
  budgetPriority: z.number().int().min(1).max(10),
});

// ---------------------------------------------------------------------------
// Bộ khối mặc định (mục 4)
// ---------------------------------------------------------------------------

interface BlockSpec {
  id: string;
  /** Tên file trong `/prompts`. */
  file: string;
  name: string;
  role: BlockRole;
  budgetPriority: number;
  locked: boolean;
  condition?: string;
  /** Số khối trong bảng của mục 4, để tra chéo với tài liệu. */
  docNumber: string;
}

/**
 * Thứ tự khởi tạo. Người chơi kéo đổi được, trừ bốn khối `[LOCKED]`.
 *
 * KHỐI 6A VÀ 6B CÁCH NHAU BA KHỐI, CÓ CHỦ Ý (Phụ lục A mục 7). Đặt cạnh nhau
 * là AI trộn hai vùng thông tin: nó sẽ nói "thu thuế của thành trì" và "tường
 * thành của bá quốc". Khoảng cách vật lý trong prompt cộng với hai kiểu khung
 * viền khác nhau là thứ giữ cho hai tầng không lẫn.
 */
export const BLOCK_SPECS: readonly BlockSpec[] = [
  {
    id: 'vai-tro',
    file: '01-vai-tro-giong-ke.ejs',
    name: 'Vai trò & giọng kể',
    role: 'system',
    budgetPriority: 9,
    locked: false,
    docNumber: '1',
  },
  {
    id: 'luat-bat-bien',
    file: '02-luat-bat-bien.ejs',
    name: '[LOCKED] Luật bất biến cho AI',
    role: 'system',
    budgetPriority: 10,
    locked: true,
    docNumber: '2',
  },
  {
    id: 'boi-canh',
    file: '03-boi-canh-the-gioi.ejs',
    name: 'Bối cảnh thế giới (tĩnh)',
    role: 'system',
    budgetPriority: 6,
    locked: false,
    docNumber: '3',
  },
  {
    id: 'lorebook',
    file: '04-lorebook.ejs',
    name: 'Lorebook động',
    role: 'system',
    budgetPriority: 7,
    locked: false,
    condition: 'lore.length > 0',
    docNumber: '4',
  },
  {
    id: 'ho-so-nhan-vat',
    file: '05-ho-so-nhan-vat.ejs',
    name: 'Hồ sơ nhân vật người chơi',
    role: 'system',
    budgetPriority: 9,
    locked: false,
    docNumber: '5',
  },
  {
    id: 'thanh-tri',
    file: '06a-thanh-tri.ejs',
    name: 'Bảng THÀNH TRÌ',
    role: 'system',
    budgetPriority: 9,
    locked: false,
    condition: 'q.holding() !== null',
    docNumber: '6A',
  },
  {
    id: 'thuong-tich',
    file: '07-thuong-tich.ejs',
    name: 'Thương tích & ảnh hưởng',
    role: 'system',
    budgetPriority: 8,
    locked: false,
    condition: 'q.injuries().length > 0',
    docNumber: '7',
  },
  {
    id: 'tran-danh',
    file: '14-tran-danh.ejs',
    name: 'Trận đánh nổ ra từ truyện',
    role: 'system',
    budgetPriority: 7,
    locked: false,
    // Chưa chốt nhân vật thì chưa có ai để đánh, và khối này là khối tốn token
    // nhất trong nhóm không bắt buộc.
    condition: 'state.character?.identity?.finalized === true',
    docNumber: '14',
  },
  {
    id: 'canh-hien-tai',
    file: '08-canh-hien-tai.ejs',
    name: 'Cảnh hiện tại',
    role: 'system',
    budgetPriority: 9,
    locked: false,
    docNumber: '8',
  },
  {
    id: 'codex-memory',
    file: '15-codex-memory.ejs',
    name: 'Codex · bộ nhớ thực thể',
    role: 'system',
    budgetPriority: 9,
    locked: false,
    docNumber: '15',
  },
  {
    id: 'tom-tat-xa',
    file: '09-tom-tat-lich-su-xa.ejs',
    name: 'Tóm tắt lịch sử xa',
    role: 'system',
    budgetPriority: 4,
    locked: false,
    // Chỉ có lịch sử xa khi lịch sử đã dài hơn cửa sổ "gần" của khối 10.
    condition: 'history.length > 8',
    docNumber: '9',
  },
  {
    id: 'lanh-tho',
    file: '06b-lanh-tho.ejs',
    name: 'Bảng LÃNH THỔ',
    role: 'system',
    budgetPriority: 9,
    locked: false,
    condition: 'q.realm() !== null',
    docNumber: '6B',
  },
  {
    id: 'quan-doi',
    file: '16-quan-doi.ejs',
    name: 'Quân đội & tuyển quân',
    role: 'system',
    budgetPriority: 8,
    locked: false,
    condition: 'q.army() !== null',
    docNumber: '16',
  },
  {
    id: 'lich-su-gan',
    file: '10-lich-su-gan.ejs',
    name: 'Lịch sử gần (nguyên văn)',
    role: 'user',
    budgetPriority: 5,
    locked: false,
    condition: 'history.length > 0',
    docNumber: '10',
  },
  {
    id: 'ket-qua-xuc-sac',
    file: '11-ket-qua-xuc-sac.ejs',
    name: '[LOCKED] KẾT QUẢ XÚC SẮC CỦA ENGINE',
    role: 'system',
    budgetPriority: 10,
    locked: true,
    docNumber: '11',
  },
  {
    id: 'hanh-dong',
    file: '12-hanh-dong-nguoi-choi.ejs',
    name: '[LOCKED] Hành động người chơi',
    role: 'user',
    budgetPriority: 10,
    locked: true,
    docNumber: '12',
  },
  {
    id: 'dinh-dang-dau-ra',
    file: '13-dinh-dang-dau-ra.ejs',
    name: '[LOCKED] Định dạng đầu ra + cú pháp UpdateVariable',
    role: 'system',
    budgetPriority: 10,
    locked: true,
    docNumber: '13',
  },
] as const;

export const LOCKED_BLOCK_IDS: readonly string[] = BLOCK_SPECS.filter((spec) => spec.locked).map(
  (spec) => spec.id,
);

/** Mặc định gốc, nạp thô lúc build. Sau lần chạy đầu, IndexedDB là sự thật. */
const TEMPLATE_FILES = import.meta.glob<string>('/prompts/*.ejs', {
  query: '?raw',
  import: 'default',
  eager: true,
});

export class MissingTemplateError extends Error {
  constructor(files: string[]) {
    super(`Thiếu file template mặc định trong /prompts: ${files.join(', ')}`);
    this.name = 'MissingTemplateError';
  }
}

function templateOf(file: string): string | null {
  return TEMPLATE_FILES[`/prompts/${file}`] ?? null;
}

/** Một khối mặc định, dựng lại từ file `.ejs`. Dùng cho nút "Khôi phục". */
export function defaultBlock(id: string): PromptBlock | null {
  const index = BLOCK_SPECS.findIndex((candidate) => candidate.id === id);
  const spec = BLOCK_SPECS[index];
  if (spec === undefined) return null;

  const template = templateOf(spec.file);
  if (template === null) throw new MissingTemplateError([spec.file]);

  const block: PromptBlock = {
    id: spec.id,
    name: spec.name,
    enabled: true,
    locked: spec.locked,
    role: spec.role,
    placement: 'sequential',
    order: index + 1,
    template,
    budgetPriority: spec.budgetPriority,
  };
  if (spec.condition !== undefined) block.condition = spec.condition;
  return block;
}

/** Cả bộ khối mặc định, đúng thứ tự của mục 4. */
export function defaultBlocks(): PromptBlock[] {
  const missing = BLOCK_SPECS.filter((spec) => templateOf(spec.file) === null).map((spec) => spec.file);
  if (missing.length > 0) throw new MissingTemplateError(missing);

  return BLOCK_SPECS.map((spec) => {
    const block = defaultBlock(spec.id);
    if (block === null) throw new MissingTemplateError([spec.file]);
    return block;
  });
}

// ---------------------------------------------------------------------------
// Bất biến về vị trí (mục 4)
// ---------------------------------------------------------------------------

/** Khoảng cách tối thiểu giữa khối 6A và 6B (Phụ lục A mục 7). */
export const MIN_HOLDING_REALM_GAP = 4;

/**
 * Kiểm hợp đồng vị trí. Trả về danh sách vấn đề, rỗng là sạch.
 * UI hiện cái này chứ không im lặng sửa hộ — người chơi phải biết mình vừa phá gì.
 */
export function checkBlockOrder(blocks: readonly PromptBlock[]): string[] {
  const problems: string[] = [];
  const sorted = sortBlocks(blocks);
  const indexOf = (id: string): number => sorted.findIndex((block) => block.id === id);

  for (const id of LOCKED_BLOCK_IDS) {
    const block = sorted.find((candidate) => candidate.id === id);
    if (block === undefined) {
      problems.push(`thiếu khối [LOCKED] "${id}"`);
      continue;
    }
    if (!block.enabled) problems.push(`khối [LOCKED] "${id}" đang tắt`);
  }

  const syntax = indexOf('dinh-dang-dau-ra');
  if (syntax !== -1 && syntax !== sorted.length - 1) {
    problems.push('khối 13 (định dạng đầu ra) phải nằm cuối cùng');
  }

  const dice = indexOf('ket-qua-xuc-sac');
  const action = indexOf('hanh-dong');
  if (dice !== -1 && action !== -1 && dice > action) {
    problems.push('khối 11 (kết quả xúc sắc) phải nằm TRƯỚC khối 12 (hành động)');
  }

  const holding = indexOf('thanh-tri');
  const realm = indexOf('lanh-tho');
  if (holding !== -1 && realm !== -1) {
    if (realm < holding) problems.push('khối 6A (THÀNH TRÌ) phải đứng trước khối 6B (LÃNH THỔ)');
    else if (realm - holding < MIN_HOLDING_REALM_GAP) {
      problems.push(
        `khối 6A và 6B chỉ cách nhau ${realm - holding - 1} khối; Phụ lục A mục 7 đòi ít nhất ${MIN_HOLDING_REALM_GAP - 1}`,
      );
    }
  }

  return problems;
}

export function sortBlocks(blocks: readonly PromptBlock[]): PromptBlock[] {
  return [...blocks].sort((left, right) => left.order - right.order);
}

/** Đánh lại `order` thành 1..n theo đúng thứ tự mảng. */
export function renumber(blocks: readonly PromptBlock[]): PromptBlock[] {
  return blocks.map((block, index) => ({ ...block, order: index + 1 }));
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

/** Bật/tắt. Khối [LOCKED] bị chặn ở đây, không chỉ ẩn nút trên UI. */
export function toggleBlock(blocks: readonly PromptBlock[], id: string, enabled: boolean): PromptBlock[] {
  return blocks.map((block) => (block.id === id && !block.locked ? { ...block, enabled } : block));
}

export function updateBlock(
  blocks: readonly PromptBlock[],
  id: string,
  patch: Partial<Omit<PromptBlock, 'id' | 'locked'>>,
): PromptBlock[] {
  return blocks.map((block) => (block.id === id ? { ...block, ...patch } : block));
}

/** Xóa. Khối [LOCKED] không xóa được. */
export function removeBlock(blocks: readonly PromptBlock[], id: string): PromptBlock[] {
  const target = blocks.find((block) => block.id === id);
  if (target === undefined || target.locked) return [...blocks];
  return renumber(sortBlocks(blocks).filter((block) => block.id !== id));
}

/** Nhân bản. Bản sao KHÔNG bao giờ locked — nó là khối của người chơi. */
export function duplicateBlock(blocks: readonly PromptBlock[], id: string): PromptBlock[] {
  const sorted = sortBlocks(blocks);
  const at = sorted.findIndex((block) => block.id === id);
  const source = sorted[at];
  if (source === undefined) return sorted;

  let suffix = 2;
  while (sorted.some((block) => block.id === `${id}-${suffix}`)) suffix++;

  const copy: PromptBlock = { ...source, id: `${id}-${suffix}`, name: `${source.name} (bản ${suffix})`, locked: false };
  return renumber([...sorted.slice(0, at + 1), copy, ...sorted.slice(at + 1)]);
}

export function addBlock(blocks: readonly PromptBlock[], name: string): PromptBlock[] {
  const sorted = sortBlocks(blocks);
  let suffix = 1;
  while (sorted.some((block) => block.id === `khoi-moi-${suffix}`)) suffix++;

  const created: PromptBlock = {
    id: `khoi-moi-${suffix}`,
    name: name.trim() === '' ? `Khối mới ${suffix}` : name.trim(),
    enabled: true,
    locked: false,
    role: 'system',
    placement: 'sequential',
    order: 0,
    template: '',
    budgetPriority: 5,
  };
  // Chèn TRƯỚC nhóm [LOCKED] ở cuối, để khối mới không đẩy khối 13 khỏi vị trí.
  const lastFree = sorted.findIndex((block) => block.locked && block.id === 'ket-qua-xuc-sac');
  const at = lastFree === -1 ? sorted.length : lastFree;
  return renumber([...sorted.slice(0, at), created, ...sorted.slice(at)]);
}

/**
 * Kéo thả. Trả về `null` khi nước đi bị từ chối, để UI nói được vì sao thay vì
 * lặng lẽ không làm gì.
 */
export function moveBlock(
  blocks: readonly PromptBlock[],
  id: string,
  toIndex: number,
): { blocks: PromptBlock[]; refused: string | null } {
  const sorted = sortBlocks(blocks);
  const from = sorted.findIndex((block) => block.id === id);
  const moving = sorted[from];
  if (moving === undefined) return { blocks: sorted, refused: `không có khối "${id}"` };
  if (moving.locked) return { blocks: sorted, refused: 'khối [LOCKED] không kéo được' };

  const target = Math.max(0, Math.min(sorted.length - 1, toIndex));
  const destination = sorted[target];
  if (destination !== undefined && destination.locked) {
    return { blocks: sorted, refused: 'không thả được vào chỗ của một khối [LOCKED]' };
  }

  const rest = [...sorted.slice(0, from), ...sorted.slice(from + 1)];
  const next = renumber([...rest.slice(0, target), moving, ...rest.slice(target)]);

  const problems = checkBlockOrder(next);
  if (problems.length > 0) return { blocks: sorted, refused: problems.join('; ') };
  return { blocks: next, refused: null };
}

/** Khôi phục một khối về mặc định. Giữ nguyên vị trí hiện tại. */
export function restoreDefault(blocks: readonly PromptBlock[], id: string): PromptBlock[] {
  const fresh = defaultBlock(id);
  if (fresh === null) return [...blocks];
  return blocks.map((block) => (block.id === id ? { ...fresh, order: block.order, enabled: block.enabled } : block));
}

// ---------------------------------------------------------------------------
// Export / Import (mục 2)
// ---------------------------------------------------------------------------

export const BUNDLE_VERSION = 1;

export const bundleSchema = z.object({
  kind: z.literal('eu1444-prompt-blocks'),
  version: z.number().int(),
  exportedAt: z.number(),
  blocks: z.array(blockSchema),
});

export type PromptBundle = z.infer<typeof bundleSchema>;

export function serializeBlocks(blocks: readonly PromptBlock[]): string {
  const bundle: PromptBundle = {
    kind: 'eu1444-prompt-blocks',
    version: BUNDLE_VERSION,
    exportedAt: Date.now(),
    blocks: sortBlocks(blocks),
  };
  return `${JSON.stringify(bundle, null, 2)}\n`;
}

export interface ImportOutcome {
  blocks: PromptBlock[];
  issues: string[];
}

/**
 * Nạp một bộ khối từ file.
 *
 * Bốn khối [LOCKED] luôn được bù lại từ mặc định nếu file thiếu — một file
 * chia sẻ thiếu khối 13 mà nạp im lặng thì lượt sau không parse được patch.
 */
export function parseBundle(raw: unknown): ImportOutcome {
  const parsed = bundleSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      blocks: [],
      issues: parsed.error.issues.map((issue) => `${issue.path.join('.') || '(gốc)'}: ${issue.message}`),
    };
  }

  const issues: string[] = [];
  const blocks = sortBlocks(parsed.data.blocks);

  for (const spec of BLOCK_SPECS) {
    if (!spec.locked) continue;
    const existing = blocks.find((block) => block.id === spec.id);
    if (existing === undefined) {
      const fresh = defaultBlock(spec.id);
      if (fresh !== null) {
        blocks.push(fresh);
        issues.push(`File thiếu khối [LOCKED] "${spec.name}" — đã bù lại bằng bản mặc định.`);
      }
      continue;
    }
    if (!existing.locked || !existing.enabled) {
      existing.locked = true;
      existing.enabled = true;
      issues.push(`Khối [LOCKED] "${spec.name}" trong file đang tắt hoặc mất khóa — đã bật và khóa lại.`);
    }
  }

  // Khối 13 phải nằm cuối; đẩy nó xuống thay vì từ chối cả file.
  const syntax = blocks.findIndex((block) => block.id === 'dinh-dang-dau-ra');
  if (syntax !== -1 && syntax !== blocks.length - 1) {
    const [moved] = blocks.splice(syntax, 1);
    if (moved !== undefined) blocks.push(moved);
    issues.push('Đã đưa khối 13 (định dạng đầu ra) xuống cuối danh sách.');
  }

  return { blocks: renumber(blocks), issues };
}

// ---------------------------------------------------------------------------
// Tầng A — IndexedDB
// ---------------------------------------------------------------------------

const DB_NAME = 'eu1444-prompts';
const DB_VERSION = 1;
const ROW_ID = 'blocks';

interface PromptsDB extends DBSchema {
  prompts: {
    key: string;
    value: { id: string; blocks: PromptBlock[]; updatedAt: number };
  };
}

let db: IDBPDatabase<PromptsDB> | null = null;

export function promptsStorageAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}

async function open(): Promise<IDBPDatabase<PromptsDB>> {
  if (db !== null) return db;
  db = await openDB<PromptsDB>(DB_NAME, DB_VERSION, {
    upgrade(database) {
      if (!database.objectStoreNames.contains('prompts')) {
        database.createObjectStore('prompts', { keyPath: 'id' });
      }
    },
  });
  return db;
}

export async function saveBlocks(blocks: readonly PromptBlock[]): Promise<void> {
  if (!promptsStorageAvailable()) return;
  const database = await open();
  await database.put('prompts', { id: ROW_ID, blocks: sortBlocks(blocks), updatedAt: Date.now() });
}

/**
 * Đọc khối. Lần chạy đầu tiên gieo mầm từ `/prompts` rồi ghi xuống.
 *
 * Bản ghi hỏng KHÔNG làm chết game: quay về mặc định và báo lại, vì không có
 * khối prompt thì không gọi AI được lượt nào (R4).
 */
export async function loadBlocks(): Promise<{ blocks: PromptBlock[]; seeded: boolean; issues: string[] }> {
  if (!promptsStorageAvailable()) {
    return { blocks: defaultBlocks(), seeded: true, issues: [] };
  }

  const database = await open();
  const row = await database.get('prompts', ROW_ID);
  if (row === undefined) {
    const blocks = defaultBlocks();
    await saveBlocks(blocks);
    return { blocks, seeded: true, issues: [] };
  }

  const parsed = z.array(blockSchema).safeParse(row.blocks);
  if (!parsed.success) {
    const blocks = defaultBlocks();
    return {
      blocks,
      seeded: true,
      issues: ['Bản ghi khối prompt trong IndexedDB không đọc được — đã quay về bộ mặc định.'],
    };
  }

  // Khối mặc định mới thêm ở một bản build sau phải xuất hiện, không thì người
  // chơi cũ vĩnh viễn không có nó.
  //
  // Chèn TRƯỚC khối 13 chứ không nối vào đuôi: `checkBlockOrder` đòi khối định
  // dạng đầu ra nằm cuối cùng, nên một khối mới nối sau nó sẽ làm bộ khối của
  // người chơi cũ vi phạm hợp đồng vị trí ngay lần chạy đầu sau khi cập nhật —
  // và họ không làm gì sai cả.
  const blocks = sortBlocks(parsed.data);
  const issues: string[] = [];
  for (const spec of BLOCK_SPECS) {
    if (blocks.some((block) => block.id === spec.id)) continue;
    const fresh = defaultBlock(spec.id);
    if (fresh === null) continue;
    const syntax = blocks.findIndex((block) => block.id === 'dinh-dang-dau-ra');
    blocks.splice(syntax === -1 ? blocks.length : syntax, 0, fresh);
    issues.push(`Bản build này có thêm khối "${spec.name}" — đã thêm vào danh sách.`);
  }

  return { blocks: renumber(blocks), seeded: false, issues };
}

export async function clearBlocks(): Promise<void> {
  if (!promptsStorageAvailable()) return;
  const database = await open();
  await database.delete('prompts', ROW_ID);
}
