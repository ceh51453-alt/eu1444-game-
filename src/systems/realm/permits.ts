/**
 * CẤP GIẤY PHÉP XÂY — nối thẳng vào Phần 12 mục 3 (mục 8, việc 12.8).
 *
 * ĐÂY LÀ CHỖ RANH GIỚI DỄ VỠ NHẤT CỦA CẢ PHẦN, nên đáng nói rõ nó KHÔNG làm gì:
 *
 *   · không nhận một `Holding` nào
 *   · không đọc `state['holdings']`
 *   · không biết thành trì ấy đang có bao nhiêu ô trống
 *
 * Lãnh thổ KHÔNG XÂY. Nó KÝ GIẤY. Hàm ở đây trả về một `RealmOrder` — dữ liệu
 * thuần, đúng một trong bốn động từ mà `holding/interfaces.ts` cho phép đi qua
 * cổng — và chỗ gọi đưa tờ giấy ấy cho `applyRealmOrder` của Phần 12. Một chiều,
 * một kiểu, không con trỏ nào.
 *
 * `RealmOrder` là kiểu DUY NHẤT của Phần 12 mà file này import, và nó là `import
 * type` — sau khi biên dịch thì không còn một dòng mã nào nối hai thư mục.
 */

import type { Rng } from '@/core/rng';
import type { RealmOrder } from '@/systems/holding/interfaces';
import { runCheck } from '@/systems/check';
import type { GameState } from '@/state/slices';
import { permitConfig } from './data';
import { permitRequiredFromTier } from './laws';

export interface PermitRequest {
  /** Ai xin. Id chư hầu, hoặc rỗng khi chính người chơi xin của lãnh chúa trên. */
  applicantId: string;
  applicantName: string;
  /** Cấp khu định cư muốn lên, hoặc `bld_*` muốn xây (Phần 12 mục 3). */
  permit: string;
  /** Cấp hiện tại của khu định cư, để tính lệ phí và để biết có cần giấy không. */
  tier: number;
}

export interface PermitVerdict {
  /** Có cần giấy phép không — phụ thuộc LUẬT đang áp, không phụ thuộc cấp bậc. */
  required: boolean;
  /** Bậc tước đủ để ký chưa. */
  allowed: boolean;
  fee: number;
  reason: string;
}

/**
 * Việc này có cần giấy không, và ngài có quyền ký không.
 *
 * `required` đến từ `luat_doc-quyen-cap-phep`: KHÔNG ban luật ấy thì chư hầu tự
 * xây, và bảng quận của mục 4 mất một nút bấm. Đây là chỗ mục 8 nối vào mục 12
 * chứ không phải một luật cứng trong code — người chơi chọn có siết hay không.
 */
export function permitVerdict(request: PermitRequest, rank: number, activeLaws: readonly string[]): PermitVerdict {
  const config = permitConfig();
  const fromTier = permitRequiredFromTier(activeLaws);
  const isWork = request.permit.startsWith('bld_');
  const required = fromTier > 0 && (isWork || request.tier + 1 >= fromTier);

  if (!required) {
    return { required: false, allowed: false, fee: 0, reason: 'Chưa có luật nào bắt phải xin phép việc này.' };
  }
  if (rank < config.requiresRank) {
    return {
      required: true,
      allowed: false,
      fee: 0,
      reason: `Cấp phép xây là quyền từ bậc ${String(config.requiresRank)} trở lên; ngài đang ở bậc ${String(rank)}.`,
    };
  }

  return {
    required: true,
    allowed: true,
    fee: isWork ? config.feePerWork : config.feePerTier * Math.max(1, request.tier),
    reason: '',
  };
}

export interface PermitResult {
  /** Tờ giấy đi xuống thành trì. `null` khi từ chối. */
  order: RealmOrder | null;
  fee: number;
  /** Lòng trung của người xin đổi bao nhiêu. */
  vassalLoyalty: number;
  unrest: number;
  line: string;
}

/**
 * KÝ GIẤY.
 *
 * Một kiểm định 3d6 rất dễ (`de-dang`) — vì việc khó không phải là ký, mà là biết
 * mình đang ký cho ai. Thất bại nghĩa là giấy tờ sai chỗ nào đó và chư hầu phải
 * xin lại, chứ không phải công trình sập.
 */
export function grantPermit(
  rng: Rng,
  request: PermitRequest,
  options: { base: number; state?: GameState | null } = { base: 12 },
): PermitResult {
  const config = permitConfig();
  const run = runCheck(rng, {
    id: 'check.cap-phep-xay',
    system: '3d6',
    domain: config.check,
    difficulty: config.difficulty,
    base: options.base,
    tags: ['cai-tri', 'cap-phep'],
    state: options.state ?? null,
  });

  const clean = run.result.tier === 'success' || run.result.tier === 'critSuccess';
  const fee = request.permit.startsWith('bld_') ? config.feePerWork : config.feePerTier * Math.max(1, request.tier);

  return {
    fee,
    vassalLoyalty: config.grantVassalLoyalty,
    unrest: 0,
    order: { kind: 'cap-phep', permit: request.permit },
    line: clean
      ? `Ngài cấp phép "${request.permit}" cho ${request.applicantName}. Lệ phí ${String(fee)} đồng.`
      : `Giấy phép được ký, nhưng sai một dòng — ${request.applicantName} phải chạy lại một lượt nữa.`,
  };
}

/** Từ chối. Rẻ hơn nhiều so với cấp, và đắt hơn nhiều về sau. */
export function refusePermit(request: PermitRequest): PermitResult {
  const config = permitConfig();
  return {
    order: null,
    fee: 0,
    vassalLoyalty: config.refuseVassalLoyalty,
    unrest: config.refuseUnrest,
    line: `Ngài từ chối "${request.permit}" của ${request.applicantName}. Ông ta cúi chào và ghi nhớ.`,
  };
}

export interface IllegalWorkResult {
  fine: number;
  vassalLoyalty: number;
  line: string;
}

/**
 * PHÁT HIỆN XÂY CHUI.
 *
 * `permits.illegalWorks` và `permits.discovered` là hai trường CỦA THÀNH TRÌ
 * (Phần 12) — hàm này không đọc chúng, nó chỉ nhận vào một danh sách tên và trả
 * về hình phạt. Ai phát hiện, phát hiện lúc nào, là việc của tầng dưới.
 */
export function punishIllegalWorks(works: readonly string[], applicantName: string): IllegalWorkResult {
  const config = permitConfig();
  if (works.length === 0) return { fine: 0, vassalLoyalty: 0, line: '' };
  return {
    fine: config.illegalDiscoveryFine * works.length,
    vassalLoyalty: config.illegalDiscoveryLoyalty,
    line: `${applicantName} xây ${String(works.length)} công trình không giấy phép. Phạt ${String(config.illegalDiscoveryFine * works.length)} đồng — và ông ta cho rằng ngài đang tìm cớ.`,
  };
}
