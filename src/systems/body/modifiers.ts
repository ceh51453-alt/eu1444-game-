/**
 * BẢY NGUỒN MODIFIER CỦA PHẦN 7 (mục 5) — cắm vào registry của Phần 5.
 *
 *   `body.vung`      thương tích theo vùng: tay thuận, tay kém, vai, chân, đầu, thân
 *   `body.dau`       đau, phạt MỌI kiểm định
 *   `body.mat-mau`   mất máu, phạt lũy tiến
 *   `body.sot`       sốt, nặng nhất ở hệ 3d6 và miền quản trị
 *   `body.van-dong`  khả năng di chuyển, kể cả hành quân cấp chiến dịch
 *   `body.tan-phe`   tàn phế vĩnh viễn, không bao giờ gỡ
 *   `body.chi-huy`   lãnh chúa bị thương nặng thì sĩ khí quân giảm
 *
 * ĐÂY LÀ PHẦN QUAN TRỌNG NHẤT CỦA PHẦN 7. Mục 5 nói thẳng: làm hời hợt chỗ này
 * thì cả hệ thống cơ thể chỉ còn là đồ trang trí. Một vết đâm ở đùi phải LÀM
 * KHÓ một cuộc đàm phán ba tháng sau, chứ không chỉ làm đỏ một ô trên hình vẽ.
 *
 * HAI LUẬT RIÊNG CỦA CÁC NGUỒN Ở ĐÂY:
 *
 * 1. KHÔNG áp vào miền `body.*`. Đó là những cú tung mà cơ thể tự chống lại
 *    nhiễm trùng và biến chứng (mục 7). Cho sốt phạt chính cú tung chống sốt là
 *    dựng một vòng xoáy mà người chơi không có nút nào để bấm — mà Phần 5 mục 3
 *    đòi người chơi phải luôn đọc được và luôn còn cửa xoay xở.
 *
 * 2. Vết ở TAY tính theo `grip%`, không tính theo từng vết. Mục 5 viết "phạt
 *    theo grip%", và một bàn tay có ba vết nhỏ không tệ gấp ba một bàn tay có
 *    một vết — nó chỉ là một bàn tay không nắm chặt được.
 */

import {
  domainMatches,
  modifierSources,
  registerModifierSource,
  type Modifier,
  type ModifierContext,
  type ModifierSource,
} from '@/systems/check/registry';
import { penaltyFor, scaleToSystem } from '@/systems/check/sources';
import { effectApplies } from '@/systems/character/effects';
import { permanentOf } from './catalog';
import { domainsFor, regionOf, type Hand } from './regions';
import { bodyOf, statOf, type BodyState } from './slice';
import { BODY_DOMAIN } from './tick';
import {
  bloodPenalty,
  feverPenalty,
  gripOf,
  gripPenaltyFactor,
  injuryPenalty,
  mobilityOf,
  mobilityPenalty,
  painOf,
  painPenalty,
  prostheticRelief,
} from './vitals';

export const REGION_SOURCE_ID = 'body.vung';
export const PAIN_SOURCE_ID = 'body.dau';
export const BLOOD_SOURCE_ID = 'body.mat-mau';
export const FEVER_SOURCE_ID = 'body.sot';
export const MOBILITY_SOURCE_ID = 'body.van-dong';
export const PERMANENT_SOURCE_ID = 'body.tan-phe';
export const COMMAND_SOURCE_ID = 'body.chi-huy';

/** Miền mà cơ thể tự tung để chống lại chính nó — không nguồn nào ở đây áp vào. */
function isSelfCheck(domain: string): boolean {
  return domain === BODY_DOMAIN || domain.startsWith('body.');
}

/**
 * Phép kiểm này có phải của NHÂN VẬT NGƯỜI CHƠI không.
 *
 * `ctx.actor` rỗng nghĩa là người chơi (Phần 5). Cộng cơn đau của người chơi
 * vào cú tung của một NPC là loại lỗi rất khó nhìn ra, vì kết quả vẫn "hợp lý".
 */
function playerBody(ctx: ModifierContext): BodyState | null {
  if (ctx.actor !== '') return null;
  if (isSelfCheck(ctx.domain)) return null;
  const body = bodyOf(ctx.state);
  if (body === null || body.dead) return null;
  return body;
}

function matchesAny(patterns: readonly string[], domain: string): boolean {
  return patterns.some((pattern) => domainMatches(pattern, domain));
}

// ---------------------------------------------------------------------------
// 1. Thương tích theo vùng
// ---------------------------------------------------------------------------

/**
 * Vết theo vùng. Hai đường tính khác nhau, có chủ ý:
 *
 *   · vùng KHÔNG phải tay  → mỗi vết một dòng, phạt theo mức độ
 *   · vùng LÀ tay          → một dòng cho mỗi bên, phạt theo `grip%`
 */
export const regionSource: ModifierSource = {
  id: REGION_SOURCE_ID,
  domains: ['*'],
  compute(ctx) {
    const body = playerBody(ctx);
    if (body === null) return null;

    const lines: Modifier[] = [];
    const handDomains = new Map<Hand, Set<string>>();

    for (const injury of body.injuries) {
      if (injury.healProgress >= 100) continue;
      const region = regionOf(injury.regionId);
      if (region === null) continue;

      const domains = domainsFor(region, body.dominantHand);
      if (domains.length === 0 || !matchesAny(domains, ctx.domain)) continue;

      if (region.grip !== null) {
        const bucket = handDomains.get(region.grip) ?? new Set<string>();
        bucket.add(region.id);
        handDomains.set(region.grip, bucket);
        continue;
      }

      const penalty = injuryPenalty(injury);
      if (penalty === 0) continue;
      lines.push(
        penaltyFor(ctx.system, `${region.name} — ${severityWord(injury.severity)}`, penalty, REGION_SOURCE_ID),
      );
    }

    for (const [hand, regions] of handDomains) {
      const grip = gripOf(body, hand);
      const penalty = Math.round((100 - grip) * gripPenaltyFactor());
      if (penalty <= 0) continue;
      const which = hand === body.dominantHand ? 'tay thuận' : 'tay kém';
      const where = [...regions].map((id) => regionOf(id)?.shortName ?? id).join(', ');
      lines.push(
        penaltyFor(ctx.system, `${where} (${which}, cầm nắm ${grip}%)`, penalty, REGION_SOURCE_ID),
      );
    }

    return lines.length === 0 ? null : lines;
  },
};

function severityWord(severity: number): string {
  return ['', 'xây xát', 'nhẹ', 'vừa', 'nặng', 'chí mạng'][severity] ?? 'thương tích';
}

// ---------------------------------------------------------------------------
// 2. Đau — phạt MỌI kiểm định
// ---------------------------------------------------------------------------

export const painSource: ModifierSource = {
  id: PAIN_SOURCE_ID,
  domains: ['*'],
  compute(ctx) {
    const body = playerBody(ctx);
    if (body === null) return null;

    // `painOf` đã chia theo WIL rồi — đừng chia lần nữa ở đây (xem `vitals.ts`).
    const pain = painOf(body, statOf(ctx.state, 'wil'));
    const penalty = painPenalty(pain);
    if (penalty <= 0) return null;

    return [penaltyFor(ctx.system, `Đau ${Math.round(pain)}/100`, penalty, PAIN_SOURCE_ID)];
  },
};

// ---------------------------------------------------------------------------
// 3. Mất máu — phạt lũy tiến
// ---------------------------------------------------------------------------

export const bloodSource: ModifierSource = {
  id: BLOOD_SOURCE_ID,
  domains: ['*'],
  compute(ctx) {
    const body = playerBody(ctx);
    if (body === null) return null;

    const penalty = bloodPenalty(body.blood);
    if (penalty <= 0) return null;
    return [penaltyFor(ctx.system, `Mất máu (còn ${Math.round(body.blood)}/100)`, penalty, BLOOD_SOURCE_ID)];
  },
};

// ---------------------------------------------------------------------------
// 4. Sốt
// ---------------------------------------------------------------------------

/**
 * Mục 5: sốt "phạt INT PER và mọi kiểm định 3d6".
 *
 * Nên nó nặng gấp đôi ở hệ 3d6 và ở miền quản trị — đó chính là chỗ mục 5 gọi
 * là "lan ra ngoài chiến đấu": một bá tước đang sốt thì việc xử án và thu thuế
 * hỏng trước cả việc cầm kiếm.
 */
export const feverSource: ModifierSource = {
  id: FEVER_SOURCE_ID,
  domains: ['*'],
  compute(ctx) {
    const body = playerBody(ctx);
    if (body === null) return null;

    const base = feverPenalty(body.fever);
    if (base <= 0) return null;

    const heavy = ctx.system === '3d6' || domainMatches('admin.*', ctx.domain);
    const penalty = heavy ? Math.round(base * 2) : base;
    return [penaltyFor(ctx.system, `Sốt ${Math.round(body.fever)}/100`, penalty, FEVER_SOURCE_ID)];
  },
};

// ---------------------------------------------------------------------------
// 5. Vận động
// ---------------------------------------------------------------------------

/**
 * Mục 5: "mobility ảnh hưởng cả hành quân cấp chiến dịch, không chỉ đánh nhau".
 *
 * Vì thế nguồn này khai `admin.hanh-quan` cùng chỗ với `combat.*`: Phần 10 và
 * Phần 13 chỉ cần tung ở miền đó là tự nhận mức phạt, không phải nhớ hỏi cơ thể.
 */
const MOBILITY_DOMAINS = [
  'combat.*',
  'admin.hanh-quan',
  'skill.the-luc',
  'skill.nhao-lon',
  'skill.leo-treo',
  'skill.cuoi-ngua',
  'skill.boi-loi',
  'skill.len-lut',
  'skill.tron-nap',
];

export const mobilitySource: ModifierSource = {
  id: MOBILITY_SOURCE_ID,
  domains: MOBILITY_DOMAINS,
  compute(ctx) {
    const body = playerBody(ctx);
    if (body === null) return null;

    const mobility = mobilityOf(body);
    const penalty = mobilityPenalty(mobility);
    if (penalty <= 0) return null;
    return [penaltyFor(ctx.system, `Đi lại khó (${mobility}%)`, penalty, MOBILITY_SOURCE_ID)];
  },
};

// ---------------------------------------------------------------------------
// 6. Tàn phế vĩnh viễn
// ---------------------------------------------------------------------------

/**
 * Modifier VĨNH VIỄN, không bao giờ gỡ (mục 8).
 *
 * Dùng lại khuôn hiệu ứng của Phần 6 nên có luôn `whenAnyTag`: đó là chỗ mục 5
 * nói sẹo chiến trận CỘNG cho ngài trước lính và TRỪ trước tăng lữ. Cùng một
 * khuôn mặt, hai thế giới đọc khác nhau — và cả hai dòng đều hiện ra cho người
 * chơi thấy.
 */
export const permanentSource: ModifierSource = {
  id: PERMANENT_SOURCE_ID,
  domains: ['*'],
  compute(ctx) {
    const body = playerBody(ctx);
    if (body === null || body.permanent.length === 0) return null;

    const lines: Modifier[] = [];
    for (const entry of body.permanent) {
      const row = permanentOf(entry.id);
      if (row === null) continue;

      const relief = prostheticRelief(body, entry.id);
      for (const effect of row.effects) {
        if (!matchesAny(effect.domains, ctx.domain)) continue;
        if (!effectApplies(effect, ctx.tags)) continue;

        // Dụng cụ hỗ trợ chỉ gánh bớt phần PHẠT. Một cái chân giả không làm
        // người ta bơi giỏi hơn, nên vế cộng giữ nguyên.
        const value = effect.value < 0 ? Math.round(effect.value * (1 - relief)) : effect.value;
        if (value === 0) continue;

        const where = regionOf(entry.regionId)?.shortName ?? '';
        const label = where === '' ? row.name : `${row.name} (${where})`;
        if (effect.kind === 'dieShift') {
          lines.push({ label, value, kind: 'dieShift', source: PERMANENT_SOURCE_ID });
          continue;
        }
        lines.push({ label, source: PERMANENT_SOURCE_ID, ...scaleToSystem(ctx.system, value) });
      }
    }

    return lines.length === 0 ? null : lines;
  },
};

// ---------------------------------------------------------------------------
// 7. Chỉ huy khi trọng thương
// ---------------------------------------------------------------------------

/**
 * Mục 5: "lãnh chúa bị thương nặng thì sĩ khí quân giảm".
 *
 * Đứng riêng khỏi `body.vung` vì nó KHÔNG phải là chuyện tay ai đau: đây là
 * chuyện hàng quân NHÌN THẤY chủ tướng được khiêng đi. Phần 10 đọc thẳng
 * `commandPenalty` để đổ vào sĩ khí, còn dòng modifier này lo phần kiểm định
 * chỉ huy.
 */
export function commandPenalty(body: BodyState): number {
  const worst = body.injuries.reduce(
    (max, injury) => (injury.healProgress >= 100 ? max : Math.max(max, injury.severity)),
    0,
  );
  if (worst < 4) return 0;
  const bleeding = body.injuries.some((injury) => injury.bleeding > 2);
  return worst === 5 ? 25 : bleeding ? 18 : 12;
}

export const commandSource: ModifierSource = {
  id: COMMAND_SOURCE_ID,
  domains: ['skill.chi-huy', 'skill.uy-hiep', 'combat.si-khi', 'battle.*'],
  compute(ctx) {
    const body = playerBody(ctx);
    if (body === null) return null;

    const penalty = commandPenalty(body);
    if (penalty <= 0) return null;
    return [penaltyFor(ctx.system, 'Chủ tướng trọng thương', penalty, COMMAND_SOURCE_ID)];
  },
};

// ---------------------------------------------------------------------------
// Đăng ký
// ---------------------------------------------------------------------------

export const BODY_SOURCES: readonly ModifierSource[] = [
  regionSource,
  painSource,
  bloodSource,
  feverSource,
  mobilitySource,
  permanentSource,
  commandSource,
];

/**
 * Đăng ký một lần lúc khởi động. Gọi lại lần nữa không nổ — `main.tsx` gọi lúc
 * boot, còn test gọi sau mỗi lần dọn registry.
 */
export function registerBodySources(): void {
  const already = new Set(modifierSources().map((source) => source.id));
  for (const source of BODY_SOURCES) {
    if (already.has(source.id)) continue;
    registerModifierSource(source);
  }
}
