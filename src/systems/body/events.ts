/**
 * `body.requestInjury` — CỬA DUY NHẤT ĐỂ TRUYỆN CHẠM VÀO CƠ THỂ (Phần 7 mục 3).
 *
 * Nguyên tắc R1 nói AI không được quyết một con số nào. Nhưng nếu AI không có
 * cách nào nói "hắn bị đâm vào đùi" thì truyện và cơ học sẽ trôi ra hai hướng.
 * Cách hòa giải của mục 3: **AI ĐỀ NGHỊ, ENGINE PHÁN QUYẾT.**
 *
 * AI được nói ĐÚNG ba thứ:
 *   · vùng nào     (một id vùng, hoặc tên tiếng Việt của vùng đó)
 *   · nặng cỡ nào  (`nhẹ` · `vừa` · `nặng` — không có "chí mạng")
 *   · do cái gì    (một câu mô tả tự do)
 *
 * Engine tự tung loại thương tích, mức độ thật trong khoảng, máu chảy, đau, và
 * nguy cơ nhiễm trùng. Trần HAI đề nghị mỗi lượt, đếm trong chính slice nên nó
 * sống sót qua save và qua undo.
 *
 * Hai đường vào cùng đổ về một chỗ kiểm duyệt:
 *   1. thẻ `<RequestInjury …/>` trong văn bản AI trả về
 *   2. event `body.requestInjury` trên eventbus — trigger lorebook của Phần 4
 *      mục 10 bắn được thẳng vào đây mà không cần biết Phần 7 tồn tại
 */

import { events } from '@/core/eventbus';
import type { Rng } from '@/core/rng';
import type { PatchOp } from '@/state/mvu-parse';
import type { GameState } from '@/state/slices';
import { aiRequestsPerTurn, aiSeverityRange, aiSeverityWords } from './catalog';
import { buildInjury, rollInjuryType } from './inflict';
import { diffOps, newMutation, note } from './ops';
import { allRegions, regionOf } from './regions';
import { bodyOf } from './slice';

export const BODY_EVENTS = {
  /** AI hoặc lorebook đề nghị một vết thương. Engine phán quyết. */
  requestInjury: 'body.requestInjury',
} as const;

const OWNER = 'body';

export interface InjuryRequest {
  regionId: string;
  roughSeverity: string;
  cause: string;
}

// ---------------------------------------------------------------------------
// Đọc thẻ trong văn bản AI
// ---------------------------------------------------------------------------

const TAG_PATTERN = /<RequestInjury\b([^>]*?)\/?>/gi;
const ATTR_PATTERN = /([\w-]+)\s*=\s*"([^"]*)"|([\w-]+)\s*=\s*'([^']*)'/g;

/** Chấp nhận cả tên thuộc tính tiếng Anh lẫn tiếng Việt — prompt viết tiếng Việt. */
const ATTR_ALIASES: Readonly<Record<string, 'region' | 'severity' | 'cause'>> = {
  region: 'region',
  vung: 'region',
  'vùng': 'region',
  severity: 'severity',
  mucdo: 'severity',
  'muc-do': 'severity',
  'mức': 'severity',
  cause: 'cause',
  nguyennhan: 'cause',
  'nguyen-nhan': 'cause',
  do: 'cause',
};

/**
 * Tìm vùng theo id hoặc theo TÊN tiếng Việt.
 *
 * Bắt model nhớ `thighR` là bảo đảm nó sẽ gõ `thigh_r` hoặc `dui-phai` vào một
 * lúc nào đó, và một id gõ sai thì lời đề nghị im lặng biến mất. Nhận cả tên
 * đọc được thì cửa hẹp lại đúng chỗ cần hẹp: engine vẫn là bên quyết mức độ.
 */
export function resolveRegion(text: string): string | null {
  const wanted = text.trim().toLowerCase();
  if (wanted === '') return null;
  if (regionOf(text.trim()) !== null) return text.trim();

  for (const region of allRegions()) {
    if (region.id.toLowerCase() === wanted) return region.id;
    if (region.name.toLowerCase() === wanted) return region.id;
    if (region.shortName.toLowerCase() === wanted) return region.id;
  }
  return null;
}

export function parseInjuryRequests(raw: string): InjuryRequest[] {
  const requests: InjuryRequest[] = [];
  TAG_PATTERN.lastIndex = 0;

  for (let match = TAG_PATTERN.exec(raw); match !== null; match = TAG_PATTERN.exec(raw)) {
    const attributes = match[1] ?? '';
    const found: Record<string, string> = {};

    ATTR_PATTERN.lastIndex = 0;
    for (let attr = ATTR_PATTERN.exec(attributes); attr !== null; attr = ATTR_PATTERN.exec(attributes)) {
      const key = (attr[1] ?? attr[3] ?? '').toLowerCase();
      const value = attr[2] ?? attr[4] ?? '';
      const canonical = ATTR_ALIASES[key];
      if (canonical !== undefined) found[canonical] = value;
    }

    const region = found['region'];
    if (region === undefined || region.trim() === '') continue;
    requests.push({
      regionId: region,
      roughSeverity: found['severity'] ?? 'nhẹ',
      cause: found['cause'] ?? '',
    });
  }

  return requests;
}

/** Bỏ thẻ khỏi đoạn văn trước khi hiện cho người chơi. */
export function stripInjuryRequests(raw: string): string {
  return raw.replace(TAG_PATTERN, '').trim();
}

// ---------------------------------------------------------------------------
// Đường eventbus
// ---------------------------------------------------------------------------

let collector: InjuryRequest[] | null = null;

/**
 * Đăng ký handler nghe `body.requestInjury`.
 *
 * Handler KHÔNG ghi state — nó chỉ gom lời đề nghị lại, đúng ràng buộc (a) của
 * Phần 4 mục 10. Chỗ phán quyết vẫn là `applyInjuryRequests`, và nó vẫn tung
 * xúc sắc như thường.
 */
export function registerBodyHandlers(): void {
  events.unregister(OWNER);
  events.on(
    BODY_EVENTS.requestInjury,
    (event) => {
      if (collector === null) return;
      const payload = event.payload;
      if (typeof payload !== 'object' || payload === null) return;
      const record = payload as Record<string, unknown>;

      const region = record['regionId'] ?? record['region'];
      if (typeof region !== 'string' || region.trim() === '') return;

      collector.push({
        regionId: region,
        roughSeverity: typeof record['roughSeverity'] === 'string' ? record['roughSeverity'] : 'nhẹ',
        cause: typeof record['cause'] === 'string' ? record['cause'] : '',
      });
    },
    OWNER,
  );
}

/** Chạy một đoạn code và gom mọi `body.requestInjury` phát ra trong đó. */
export function collectInjuryRequests(run: () => void): InjuryRequest[] {
  const previous = collector;
  collector = [];
  try {
    run();
    return collector;
  } finally {
    collector = previous;
  }
}

// ---------------------------------------------------------------------------
// Kiểm duyệt và phán quyết
// ---------------------------------------------------------------------------

export interface RequestOutcome {
  ops: PatchOp[];
  log: string[];
  /** Đề nghị đã được engine chấp nhận và tung xúc sắc. */
  granted: number;
  /** Đề nghị bị chặn, kèm lý do — tab Debug đọc chỗ này. */
  refused: { request: InjuryRequest; reason: string }[];
}

/**
 * Xét một lô đề nghị và trả về op cho MVU.
 *
 * Bốn cửa kiểm duyệt, theo đúng thứ tự:
 *   1. nhân vật còn sống không
 *   2. còn suất trong trần hai đề nghị mỗi lượt không
 *   3. vùng có thật không, và có còn trên người không (đã cụt thì thôi)
 *   4. mức độ có nằm trong ba chữ được phép không
 *
 * Qua hết bốn cửa thì engine mới tung — và tung ĐẦY ĐỦ: loại thương tích, mức
 * độ thật trong khoảng, máu chảy, đau, nguy cơ tạng phủ. AI không chạm vào một
 * con số nào trong số đó.
 */
export function applyInjuryRequests(
  state: GameState,
  rng: Rng,
  requests: readonly InjuryRequest[],
  turn: number,
): RequestOutcome {
  const outcome: RequestOutcome = { ops: [], log: [], granted: 0, refused: [] };
  const original = bodyOf(state);
  if (original === null || requests.length === 0) return outcome;

  if (original.dead) {
    for (const request of requests) outcome.refused.push({ request, reason: 'nhân vật đã chết' });
    outcome.log.push('bỏ qua mọi đề nghị: nhân vật đã chết');
    return outcome;
  }

  const body = structuredClone(original);
  const mutation = newMutation();
  const cap = aiRequestsPerTurn();

  // Bộ đếm gắn với LƯỢT: sang lượt mới thì reset. Giữ trong slice chứ không
  // giữ trong một biến module, vì một biến module thì undo không tua lại được
  // và người chơi sẽ tự cho mình thêm suất bằng cách hoàn tác (R3).
  let used = body.aiRequests.turn === turn ? body.aiRequests.used : 0;

  for (const request of requests) {
    if (used >= cap) {
      outcome.refused.push({ request, reason: `vượt trần ${cap} đề nghị mỗi lượt` });
      continue;
    }

    const regionId = resolveRegion(request.regionId);
    if (regionId === null) {
      outcome.refused.push({ request, reason: `không có vùng "${request.regionId}"` });
      continue;
    }
    if (body.permanent.some((entry) => entry.regionId === regionId && entry.id.startsWith('cut-'))) {
      outcome.refused.push({ request, reason: `${regionId} đã bị cắt cụt` });
      continue;
    }

    const word = request.roughSeverity.trim().toLowerCase();
    let range = aiSeverityRange(word);
    if (range === null) {
      // Chữ lạ thì lùi về mức NHẸ NHẤT, không lùi về mức giữa: engine không
      // được rộng tay chỉ vì model gõ sai một chữ.
      range = aiSeverityRange(aiSeverityWords()[0] ?? 'nhẹ') ?? [1, 2];
      outcome.log.push(`mức độ "${request.roughSeverity}" không hiểu được — hạ về mức nhẹ nhất`);
    }

    const severity = rng.int(Math.round(range[0]), Math.round(range[1]));
    const type = rollInjuryType(rng, request.cause);
    const injury = buildInjury(
      rng,
      { regionId, type, severity, source: request.cause === '' ? 'không rõ' : request.cause, turn },
      `inj_${body.nextInjuryNo}`,
    );

    body.injuries.push(injury);
    body.nextInjuryNo += 1;
    used += 1;
    outcome.granted += 1;

    note(
      mutation,
      turn,
      'thuong-tich',
      `${regionOf(regionId)?.name ?? regionId}: ${injury.type} mức ${injury.severity} (AI đề nghị "${request.roughSeverity}", engine phán quyết)`,
      regionId,
    );
  }

  body.aiRequests = { turn, used };
  outcome.ops = diffOps(original, body, mutation, state, 'AI đề nghị, engine phán quyết (mục 3)');
  outcome.log.push(...mutation.lines);
  for (const refusal of outcome.refused) {
    outcome.log.push(`từ chối đề nghị (${refusal.request.regionId}): ${refusal.reason}`);
  }
  return outcome;
}

/** Đọc thẻ trong văn bản AI rồi xét luôn — đường mà vòng lặp lượt gọi. */
export function handleAiText(
  state: GameState,
  rng: Rng,
  raw: string,
  turn: number,
): RequestOutcome {
  return applyInjuryRequests(state, rng, parseInjuryRequests(raw), turn);
}
