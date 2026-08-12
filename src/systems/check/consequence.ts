/**
 * BỘ SINH HỆ QUẢ (Phần 5 mục 5 và 12.5).
 *
 * Ba cấp trong năm cấp bắt buộc phải kèm một thứ CỤ THỂ:
 *   costlySuccess  một cái giá  — mục 5 nói thẳng: "Engine PHẢI tự chọn cái giá
 *                                đó và ghi vào CheckResult", không để AI bịa.
 *   critSuccess    một lợi ích
 *   critFail       một biến cố mới xấu hơn tình trạng ban đầu
 *
 * Vì sao engine chọn chứ không phải AI: cái giá do AI nghĩ ra không tồn tại
 * trong state. Người chơi trả một khoản mà không hệ thống nào ghi lại, rồi lượt
 * sau nó biến mất — đúng thứ R2 sinh ra để chặn.
 *
 * Nội dung nằm ở `/data/check-consequences.json` theo R5. Chọn bằng seeded RNG
 * nên cùng seed + cùng hành động ra cùng cái giá (R3).
 */

import { z } from 'zod';
import type { CheckConsequence, CheckTier } from '@/core/turn';
import type { Rng } from '@/core/rng';
import consequencesFile from '@data/check-consequences.json';

const bucketSchema = z.object({
  cost: z.array(z.string().min(1)),
  boon: z.array(z.string().min(1)),
  escalation: z.array(z.string().min(1)),
});

const fileSchema = z.object({
  version: z.number().int(),
  domains: z.record(z.string().min(1), bucketSchema),
});

export type ConsequenceBucket = z.infer<typeof bucketSchema>;
export type ConsequenceTable = Record<string, ConsequenceBucket>;

/**
 * Bảng đã nạp. File hỏng KHÔNG được làm chết game (R4): bảng rỗng nghĩa là
 * `costlySuccess` không có câu mô tả, chứ không phải lượt chơi biến mất.
 */
function load(): { table: ConsequenceTable; issues: string[] } {
  const parsed = fileSchema.safeParse(consequencesFile);
  if (!parsed.success) {
    return {
      table: {},
      issues: parsed.error.issues.map(
        (issue) => `data/check-consequences.json · ${issue.path.join('.') || '(gốc)'}: ${issue.message}`,
      ),
    };
  }
  return { table: parsed.data.domains, issues: [] };
}

const loaded = load();

export const CONSEQUENCE_TABLE: ConsequenceTable = loaded.table;
export const CONSEQUENCE_ISSUES: readonly string[] = loaded.issues;

/** Cấp nào cần hệ quả, và lấy từ cột nào. */
export function consequenceKindFor(tier: CheckTier): CheckConsequence['kind'] | null {
  if (tier === 'costlySuccess') return 'cost';
  if (tier === 'critSuccess') return 'boon';
  if (tier === 'critFail') return 'escalation';
  return null;
}

/**
 * Tra bucket cho một miền: khớp nguyên văn trước, rồi tới mẫu `x.*` dài nhất,
 * cuối cùng là `*`.
 *
 * Mẫu dài nhất thắng để `skill.y-thuat.*` (nếu Phần 7 thêm) không bị `skill.*`
 * nuốt mất — miền càng hẹp thì cái giá càng đúng chỗ.
 */
export function bucketFor(domain: string, table: ConsequenceTable = CONSEQUENCE_TABLE): ConsequenceBucket | null {
  const exact = table[domain];
  if (exact !== undefined) return exact;

  let best: { pattern: string; bucket: ConsequenceBucket } | null = null;
  for (const [pattern, bucket] of Object.entries(table)) {
    if (pattern === '*' || !pattern.endsWith('.*')) continue;
    if (!domain.startsWith(pattern.slice(0, -1))) continue;
    if (best === null || pattern.length > best.pattern.length) best = { pattern, bucket };
  }
  if (best !== null) return best.bucket;

  return table['*'] ?? null;
}

/**
 * Chọn một hệ quả. Trả `null` khi cấp không cần hệ quả, hoặc khi bảng không có
 * dòng nào cho miền này.
 *
 * RÚT XÚC SẮC CÓ ĐIỀU KIỆN LÀ CHỦ Ý và cần nói rõ: hàm chỉ gọi `rng` khi thật
 * sự phải chọn. Nghĩa là hai lượt cùng seed nhưng khác cấp kết quả sẽ lệch dòng
 * RNG kể từ đó. Điều đó không phá R3 — R3 đòi "cùng seed + cùng input = cùng
 * kết quả", mà cấp kết quả thì đã do lần tung TRƯỚC đó quyết định rồi.
 */
export function pickConsequence(
  rng: Rng,
  tier: CheckTier,
  domain: string,
  table: ConsequenceTable = CONSEQUENCE_TABLE,
): CheckConsequence | null {
  const kind = consequenceKindFor(tier);
  if (kind === null) return null;

  const bucket = bucketFor(domain, table);
  if (bucket === null) return null;

  const options = bucket[kind];
  if (options.length === 0) return null;

  return { kind, text: rng.pick(options) };
}
