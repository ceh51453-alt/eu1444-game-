/**
 * NGUỒN MODIFIER CỦA PHẦN 10 — cắm vào registry của Phần 5 mục 7.
 *
 * Cùng một lý do với Phần 9, và ở cấp chiến trận thì nặng hơn: một trận đánh
 * thua vì mười một thứ cộng lại, và nếu chúng không hiện thành mười một dòng đọc
 * được thì người chơi chỉ thấy "quân tôi tan" mà không bao giờ biết là vì bùn,
 * vì đêm, vì đã kiệt sức, hay vì họ vừa xếp sai đội hình.
 *
 * CÙNG MỘT CHỖ LỆCH VỚI PHẦN 9: đối phương không có mặt trong `GameState`, và
 * thứ quyết định một pha va chạm — hai bên đang xếp đội hình gì, đứng trên đất
 * gì, đánh vào cung nào — là một tình huống sống đúng một cú tung. Nên engine
 * CÔNG BỐ một ảnh chụp chỉ-đọc qua `publishEngagement`, và gỡ xuống ngay sau đó.
 *
 * MỘT ĐIỀU KHÔNG NẰM Ở ĐÂY, và nó là cố ý: ĐIỂM PHÒNG THỦ CỦA BÊN BỊ ĐÁNH.
 * Ở hệ pool, phòng thủ không bớt viên xúc sắc của người tấn công — nó đặt SỐ
 * THÀNH CÔNG CẦN, qua thang độ khó chuẩn hóa của Phần 5 mục 8. Nhét nó vào danh
 * sách điều chỉnh dưới dạng "−3 viên" là nói dối người đọc về thứ vừa xảy ra.
 * Bản chi tiết của điểm phòng thủ do `defenceBreakdown` ở `clash.ts` in ra, và
 * UI hiện nó ngay cạnh cú tung.
 */

import type { Modifier, ModifierContext, ModifierSource } from '@/systems/check/registry';
import { modifierSources, registerModifierSource } from '@/systems/check/registry';
import { bonusFor, penaltyFor, scaleToSystem } from '@/systems/check/sources';
import {
  battleConfig,
  counterRows,
  formationOf,
  nightVisionTag,
  tagName,
  timeOfDayOf,
  weatherOf,
} from './data';
import { terrainAt, type Arc } from './grid';
import type { BattleState, BattleUnit, Officer } from './types';

export const FORMATION_SOURCE_ID = 'battle.doi-hinh';
export const COUNTER_SOURCE_ID = 'battle.khac-che';
export const MORALE_SOURCE_ID = 'battle.si-khi';
export const COHESION_SOURCE_ID = 'battle.doi-ngu';
export const FATIGUE_SOURCE_ID = 'battle.moi-met';
export const GROUND_SOURCE_ID = 'battle.dia-hinh';
export const WEATHER_SOURCE_ID = 'battle.thoi-tiet';
export const NIGHT_SOURCE_ID = 'battle.ban-dem';
export const ARC_SOURCE_ID = 'battle.huong-danh';
export const QUALITY_SOURCE_ID = 'battle.chat-luong';
export const LOYALTY_SOURCE_ID = 'battle.long-trung';

/** Miền của một pha va chạm và của một mệnh lệnh. */
export const CLASH_DOMAIN = 'battle.dung-do';
export const VOLLEY_DOMAIN = 'battle.ban-loat';
export const ORDER_DOMAIN = 'battle.lenh';
export const MORALE_DOMAIN = 'battle.si-khi';

// ---------------------------------------------------------------------------
// Ảnh chụp một pha va chạm
// ---------------------------------------------------------------------------

export interface EngagementView {
  unit: BattleUnit;
  battle: BattleState;
  /** Bên này đang ra đòn trong pha này. */
  attacking: boolean;
  /** Cung mà đòn rơi vào của bên KIA (chỉ có nghĩa khi `attacking`). */
  arc: Arc;
  /** Nhãn của bên kia trong pha này — đã gồm `xung-phong` và `vo-tran` nếu có. */
  foeTags: readonly string[];
  /** Đội hình của bên kia. */
  foeFormationId: string;
  /** Chênh cao độ so với bên kia. Dương là đang đứng cao hơn. */
  elevation: number;
  /** Pha này là bắn xa, không phải cận chiến. */
  ranged: boolean;
  /** % che khuất trên đường ngắm. */
  concealment: number;
}

export interface Engagement {
  /** `CheckSpec.actor` → ảnh chụp. Khoá là id đơn vị. */
  byActor: Map<string, EngagementView>;
}

export interface CommandView {
  officer: Officer;
  battle: BattleState;
  /** Khoảng cách từ chỗ người ra lệnh tới đơn vị nhận, tính bằng mét. */
  distanceMeters: number;
  /** Tầm lệnh hiệu dụng sau khi nhân hệ số thời tiết và ban đêm. */
  rangeMeters: number;
}

let currentEngagement: Engagement | null = null;
let currentCommand: CommandView | null = null;

/** Engine gọi ngay trước khi phân giải một pha, và gỡ xuống ngay sau đó. */
export function publishEngagement(engagement: Engagement | null): void {
  currentEngagement = engagement;
}

export function publishCommand(view: CommandView | null): void {
  currentCommand = view;
}

export function engagement(): Engagement | null {
  return currentEngagement;
}

export function commandView(): CommandView | null {
  return currentCommand;
}

function viewOf(ctx: ModifierContext): EngagementView | null {
  return currentEngagement?.byActor.get(ctx.actor) ?? null;
}

// ---------------------------------------------------------------------------
// Ban đêm — dùng chung, vì ba nguồn khác cũng phải hỏi
// ---------------------------------------------------------------------------

/** Đơn vị này có nhìn được trong đêm không (mục 9b). */
export function seesInDark(unit: BattleUnit): boolean {
  return unit.tags.includes(nightVisionTag());
}

/** Hệ số tầm nhìn hiện tại, đã gộp thời tiết và thời điểm trong ngày. */
export function sightFactor(battle: BattleState, unit: BattleUnit | null): number {
  const weather = weatherOf(battle.weatherId);
  const time = timeOfDayOf(battle.timeId);
  const weatherPart = weather?.sightFactor ?? 1;
  const nightPart = unit !== null && seesInDark(unit) ? 1 : (time?.sightFactor ?? 1);
  return Math.max(0.05, weatherPart * nightPart);
}

/** Hệ số tầm lệnh, cùng luật. */
export function commandFactor(battle: BattleState, officer: Officer | null): number {
  const weather = weatherOf(battle.weatherId);
  const time = timeOfDayOf(battle.timeId);
  const dark = time?.night === true && officer !== null;
  // Tướng cầm quân nhìn đêm được thì tầm lệnh của họ không bị đêm rút ngắn; đó
  // là toàn bộ lợi thế chiến dịch của quân Huyết Tộc trong mục 9b.
  const nightPart = dark && officerSeesInDark(officer) ? 1 : (time?.commandFactor ?? 1);
  return Math.max(0.05, (weather?.commandFactor ?? 1) * nightPart);
}

/**
 * Tướng có nhìn đêm không — suy từ đơn vị họ cầm.
 *
 * `Officer` không mang nhãn binh chủng: một người không phải một binh chủng. Nên
 * câu hỏi này chỉ trả lời được qua đám quân đang đứng quanh họ, và đó cũng là
 * cách đúng — một chỉ huy Huyết Tộc giữa một đạo quân phàm nhân vẫn phải hò hét
 * cho những người không thấy gì.
 */
function officerSeesInDark(officer: Officer): boolean {
  return officer.nightSighted === true;
}

// ---------------------------------------------------------------------------
// 1. Đội hình (mục 6)
// ---------------------------------------------------------------------------

export const formationSource: ModifierSource = {
  id: FORMATION_SOURCE_ID,
  domains: [CLASH_DOMAIN, VOLLEY_DOMAIN],
  compute(ctx) {
    const view = viewOf(ctx);
    if (view === null || !view.attacking) return null;

    const formation = formationOf(view.unit.formation);
    if (formation === null) return null;

    const lines: Modifier[] = [];
    const push = (label: string, value: number): void => {
      if (value === 0) return;
      lines.push({ label, source: FORMATION_SOURCE_ID, ...scaleToSystem(ctx.system, value) });
    };

    push(`Đội hình ${formation.name}`, formation.attack);
    if (view.unit.charging) push(`${formation.name} đang xung phong`, formation.charge);
    // Đòn ĐẨY của khối sâu chỉ có nghĩa ở cận chiến; bắn thì không ai đẩy ai.
    if (!view.ranged) push(`Sức đẩy của ${formation.name.toLowerCase()}`, formation.push);

    // VẾ CỨNG CỦA LUẬT GIÁO DÀI. Nó nằm ở phía NGƯỜI ĐỨNG GIỮ, không ở phía kỵ
    // binh: hàng giáo không đánh mạnh hơn, nó chỉ làm con ngựa không lao vào.
    if (!view.ranged && view.foeTags.includes('xung-phong') && formation.vsCavalry !== 0) {
      push(`${formation.name} đón kỵ binh xung phong`, formation.vsCavalry);
    }
    return lines.length === 0 ? null : lines;
  },
};

// ---------------------------------------------------------------------------
// 2. Khắc chế (mục 7) — vòng tròn ba vế
// ---------------------------------------------------------------------------

/** Ba quan hệ khắc chế của mục 7, tra hai chiều như ma trận của Phần 9. */
export interface CounterLine {
  label: string;
  value: number;
}

export function counterLines(
  selfTags: readonly string[],
  foeTags: readonly string[],
  selfFormationId: string,
  foeFormationId: string,
): CounterLine[] {
  const lines: CounterLine[] = [];
  const selfFormation = formationOf(selfFormationId);
  const foeFormation = formationOf(foeFormationId);

  /**
   * ĐIỀU KIỆN ĐỘI HÌNH PHẢI LÀ DƯƠNG, không phải "khác không".
   *
   * Mục 7 viết luật này với một mệnh đề điều kiện nằm ngay trong câu: "giáo dài
   * GIỮ VỮNG ĐỘI HÌNH khắc kỵ binh xung phong". Một khối giáo dàn hàng ngang vẫn
   * cầm giáo dài, nhưng nó không giữ vững đội hình nào cả — `vsCavalry` của hàng
   * ngang là −12, tức là tệ hơn bình thường. Kiểm "khác không" sẽ cho nó hưởng
   * trọn vẹn luật khắc chế, và khi ấy đội hình không còn là một quyết định: hàng
   * giáo thắng kỵ binh dù đứng thế nào, và cả mục 6 thành trang trí.
   */
  const holdsAgainstHorse = (formation: typeof selfFormation): boolean => (formation?.vsCavalry ?? 0) > 0;

  for (const row of counterRows()) {
    // Chiều thuận: TÔI mang nhãn `when`, HẮN mang nhãn `against`.
    if (selfTags.includes(row.when) && foeHas(foeTags, foeFormationId, row.against)) {
      if (row.requiresFormationTag === '' || holdsAgainstHorse(selfFormation)) {
        if (row.self !== 0) lines.push({ label: `${tagName(row.when)} khắc ${tagName(row.against)}`, value: row.self });
      }
    }
    // Chiều nghịch: HẮN mang `when`, TÔI mang `against` — tôi chịu vế `other`.
    if (foeTags.includes(row.when) && foeHas(selfTags, selfFormationId, row.against)) {
      if (row.requiresFormationTag === '' || holdsAgainstHorse(foeFormation)) {
        if (row.other !== 0) {
          lines.push({ label: `Bị ${tagName(row.when)} khắc chế`, value: row.other });
        }
      }
    }
  }
  return lines;
}

/**
 * Nhãn `khoi-sau` không phải nhãn binh chủng mà là ĐỘI HÌNH.
 *
 * Vế hai của mục 7 nói "cung thủ khắc KHỐI BỘ BINH SÂU ĐỨNG YÊN" — điều kiện là
 * cách người ta đang đứng, không phải họ là ai. Một khối giáo Lùn dàn hàng ngang
 * thì không còn là mồi cho cung thủ nữa, và đó chính là quyết định người chơi
 * phải đưa ra khi thấy trường cung dàn trận bên kia.
 */
function foeHas(tags: readonly string[], formationId: string, wanted: string): boolean {
  if (tags.includes(wanted)) return true;
  return formationId === wanted;
}

export const counterSource: ModifierSource = {
  id: COUNTER_SOURCE_ID,
  domains: [CLASH_DOMAIN, VOLLEY_DOMAIN],
  compute(ctx) {
    const view = viewOf(ctx);
    if (view === null || !view.attacking) return null;

    const lines = counterLines(view.unit.tags, view.foeTags, view.unit.formation, view.foeFormationId);
    if (lines.length === 0) return null;
    return lines.map((line) => ({
      label: line.label,
      source: COUNTER_SOURCE_ID,
      ...scaleToSystem(ctx.system, line.value),
    }));
  },
};

// ---------------------------------------------------------------------------
// 3. Sĩ khí (mục 8) — hệ quyết định thắng bại
// ---------------------------------------------------------------------------

export const moraleSource: ModifierSource = {
  id: MORALE_SOURCE_ID,
  domains: [CLASH_DOMAIN, VOLLEY_DOMAIN],
  compute(ctx) {
    const view = viewOf(ctx);
    if (view === null) return null;

    // Thang: 60 là "vững", và ở đó không thưởng không phạt. Trên thì hăng, dưới
    // thì tay run — mục 8 nói người thắng là người làm đối phương sợ trước.
    const delta = Math.round((view.unit.morale - 60) * 0.6);
    if (delta === 0) return null;
    return [
      {
        label: `Sĩ khí ${Math.round(view.unit.morale)}/100`,
        source: MORALE_SOURCE_ID,
        ...scaleToSystem(ctx.system, delta),
      },
    ];
  },
};

// ---------------------------------------------------------------------------
// 4. Đội ngũ còn nguyên tới đâu
// ---------------------------------------------------------------------------

export const cohesionSource: ModifierSource = {
  id: COHESION_SOURCE_ID,
  domains: [CLASH_DOMAIN, VOLLEY_DOMAIN],
  compute(ctx) {
    const view = viewOf(ctx);
    if (view === null) return null;
    const lost = 100 - view.unit.cohesion;
    if (lost < 15) return null;
    return [penaltyFor(ctx.system, `Đội hình xộc xệch (${Math.round(view.unit.cohesion)}/100)`, lost * 0.5, COHESION_SOURCE_ID)];
  },
};

// ---------------------------------------------------------------------------
// 5. Mệt mỏi
// ---------------------------------------------------------------------------

export const fatigueSource: ModifierSource = {
  id: FATIGUE_SOURCE_ID,
  domains: [CLASH_DOMAIN, VOLLEY_DOMAIN],
  compute(ctx) {
    const view = viewOf(ctx);
    if (view === null || view.unit.fatigue < 20) return null;
    return [penaltyFor(ctx.system, `Mệt mỏi ${Math.round(view.unit.fatigue)}/100`, view.unit.fatigue * 0.4, FATIGUE_SOURCE_ID)];
  },
};

// ---------------------------------------------------------------------------
// 6. Địa hình (mục 9)
// ---------------------------------------------------------------------------

export const groundSource: ModifierSource = {
  id: GROUND_SOURCE_ID,
  domains: [CLASH_DOMAIN, VOLLEY_DOMAIN],
  compute(ctx) {
    const view = viewOf(ctx);
    if (view === null) return null;

    const terrain = terrainAt(view.battle.grid, view.unit.pos);
    const lines: Modifier[] = [];
    const push = (label: string, value: number): void => {
      if (value === 0) return;
      lines.push({ label, source: GROUND_SOURCE_ID, ...scaleToSystem(ctx.system, value) });
    };

    if (view.attacking) push(`${terrain.name} — thế đánh`, terrain.attack);
    if (view.ranged) push(`${terrain.name} — tầm bắn`, terrain.ranged);
    if (view.unit.tags.includes('ky-binh')) push(`${terrain.name} với kỵ binh`, terrain.cavalry);
    if (view.unit.tags.includes('giap-nang')) push(`${terrain.name} với giáp nặng`, terrain.heavy);

    // Cao độ chỉ giúp bên đang ĐÁNH XUỐNG — và với kỵ binh thì giúp gấp đôi, đúng
    // như mục 9 viết: "kỵ binh xuống dốc mạnh hơn nhiều".
    if (view.attacking && view.elevation !== 0) {
      const scale = view.unit.tags.includes('ky-binh') ? 14 : 8;
      push(view.elevation > 0 ? 'Đánh từ trên xuống' : 'Đánh ngược dốc', view.elevation * scale);
    }
    return lines.length === 0 ? null : lines;
  },
};

// ---------------------------------------------------------------------------
// 7. Thời tiết (mục 9)
// ---------------------------------------------------------------------------

export const weatherSource: ModifierSource = {
  id: WEATHER_SOURCE_ID,
  domains: [CLASH_DOMAIN, VOLLEY_DOMAIN],
  compute(ctx) {
    const view = viewOf(ctx);
    if (view === null || !view.ranged) return null;

    const weather = weatherOf(view.battle.weatherId);
    if (weather === null || weather.ranged === 0) return null;
    return [
      { label: `${weather.name} — dây cung và tầm nhìn`, source: WEATHER_SOURCE_ID, ...scaleToSystem(ctx.system, weather.ranged) },
    ];
  },
};

// ---------------------------------------------------------------------------
// 8. Ban đêm (mục 9b) — bản vá bắt buộc của Phần 14b
// ---------------------------------------------------------------------------

/**
 * Một dòng GIÁ TRỊ BẰNG KHÔNG, đúng đơn vị của hệ đang chạy.
 *
 * Nó tồn tại vì một lý do rất cụ thể của mục 9b: khi quân Huyết Tộc đánh đêm mà
 * KHÔNG bị phạt gì, im lặng là câu trả lời tệ nhất. Người chơi nhìn bảng điều
 * chỉnh và không thấy chữ "ban đêm" ở đâu cả sẽ kết luận là engine quên mất trời
 * đang tối. Một dòng +0 nói ra rằng luật đã chạy và đã tha cho họ.
 */
function neutralLine(ctx: ModifierContext, label: string, source: string): Modifier {
  return { label, value: 0, kind: scaleToSystem(ctx.system, 1).kind, source };
}

export const nightSource: ModifierSource = {
  id: NIGHT_SOURCE_ID,
  domains: [CLASH_DOMAIN, VOLLEY_DOMAIN, ORDER_DOMAIN, MORALE_DOMAIN],
  compute(ctx) {
    const view = viewOf(ctx);
    const battle = view?.battle ?? currentCommand?.battle ?? null;
    if (battle === null) return null;

    const time = timeOfDayOf(battle.timeId);
    if (time === null || !time.night) return null;

    // Đơn vị nhìn đêm được KHÔNG chịu một mức phạt nào ở đây — mục 9b viết thẳng.
    if (view !== null && seesInDark(view.unit)) {
      return [neutralLine(ctx, `${time.name}: nhìn rõ như ban ngày`, NIGHT_SOURCE_ID)];
    }
    if (view === null) {
      if (currentCommand === null) return null;
      if (officerSeesInDark(currentCommand.officer)) {
        return [neutralLine(ctx, `${time.name}: chỉ huy nhìn được trong tối`, NIGHT_SOURCE_ID)];
      }
      // Mệnh lệnh trong đêm: tầm lệnh ngắn lại, tin tới muộn.
      return [penaltyFor(ctx.system, `${time.name}: lệnh truyền trong tối`, 15, NIGHT_SOURCE_ID)];
    }

    if (ctx.domain === MORALE_DOMAIN) {
      // Không thấy hai bên sườn của mình là nguồn hoảng loạn lớn nhất trong đêm.
      return [penaltyFor(ctx.system, `${time.name}: không thấy ai bên cạnh`, 18, NIGHT_SOURCE_ID)];
    }
    if (view.ranged) {
      return time.ranged === 0
        ? null
        : [{ label: `${time.name}: không thấy đích`, source: NIGHT_SOURCE_ID, ...scaleToSystem(ctx.system, time.ranged) }];
    }
    return [penaltyFor(ctx.system, `${time.name}: đánh nhau trong tối`, 15, NIGHT_SOURCE_ID)];
  },
};

// ---------------------------------------------------------------------------
// 9. Đánh vào sườn và sau lưng (mục 8)
// ---------------------------------------------------------------------------

export const arcSource: ModifierSource = {
  id: ARC_SOURCE_ID,
  domains: [CLASH_DOMAIN, VOLLEY_DOMAIN],
  compute(ctx) {
    const view = viewOf(ctx);
    if (view === null || !view.attacking) return null;
    if (view.arc === 'front') return null;
    return [
      bonusFor(
        ctx.system,
        view.arc === 'back' ? 'Đánh vào sau lưng' : 'Đánh vào sườn',
        view.arc === 'back' ? 30 : 16,
        ARC_SOURCE_ID,
      ),
    ];
  },
};

// ---------------------------------------------------------------------------
// 10. Chất lượng đơn vị (mục 5)
// ---------------------------------------------------------------------------

/**
 * Phần 6 mục 1 nói thẳng: hệ pool KHÔNG dùng chỉ số cá nhân, dùng CHẤT LƯỢNG ĐƠN
 * VỊ. `statContribution` trả về null ở hệ pool đúng vì thế. Đây là chỗ khai vế
 * thay thế — nếu để trống thì tân binh và cựu binh dày dạn đánh nhau như nhau.
 */
export const qualitySource: ModifierSource = {
  id: QUALITY_SOURCE_ID,
  domains: [CLASH_DOMAIN, VOLLEY_DOMAIN, MORALE_DOMAIN],
  compute(ctx) {
    const view = viewOf(ctx);
    if (view === null) return null;
    const center = battleConfig().pool.qualityCenter;
    const delta = view.unit.quality - center;
    if (delta === 0) return null;
    const names = ['tân binh', 'lính mới', 'lính thạo việc', 'cựu binh', 'cựu binh dày dạn'];
    return [
      {
        label: `Quân ${names[view.unit.quality - 1] ?? 'thường'}`,
        source: QUALITY_SOURCE_ID,
        ...scaleToSystem(ctx.system, delta * 12),
      },
    ];
  },
};

// ---------------------------------------------------------------------------
// 11. Lòng trung và tính khí của tướng (mục 3)
// ---------------------------------------------------------------------------

export const loyaltySource: ModifierSource = {
  id: LOYALTY_SOURCE_ID,
  domains: [ORDER_DOMAIN],
  compute(ctx) {
    const view = currentCommand;
    if (view === null || view.officer.id !== ctx.actor) return null;

    const lines: Modifier[] = [];
    const temperament = view.officer.temperament;
    if (temperament === 'bat-man') {
      lines.push(penaltyFor(ctx.system, 'Tướng đang bất mãn', 25, LOYALTY_SOURCE_ID));
    } else if (temperament === 'lieu-linh') {
      lines.push(penaltyFor(ctx.system, 'Tướng liều lĩnh, khó giữ', 10, LOYALTY_SOURCE_ID));
    } else if (temperament === 'hao-danh') {
      lines.push(penaltyFor(ctx.system, 'Tướng háo danh, muốn lập công riêng', 12, LOYALTY_SOURCE_ID));
    } else {
      lines.push(bonusFor(ctx.system, 'Tướng thận trọng, làm đúng lệnh', 8, LOYALTY_SOURCE_ID));
    }

    if (view.distanceMeters > view.rangeMeters) {
      lines.push(
        penaltyFor(
          ctx.system,
          `Ngoài tầm lệnh (${Math.round(view.distanceMeters)}m > ${Math.round(view.rangeMeters)}m)`,
          battleConfig().command.outOfRangePenalty,
          LOYALTY_SOURCE_ID,
        ),
      );
    }
    return lines;
  },
};

// ---------------------------------------------------------------------------
// Đăng ký
// ---------------------------------------------------------------------------

export const BATTLE_SOURCES: readonly ModifierSource[] = [
  qualitySource,
  formationSource,
  counterSource,
  moraleSource,
  cohesionSource,
  fatigueSource,
  groundSource,
  weatherSource,
  nightSource,
  arcSource,
  loyaltySource,
];

/**
 * Đăng ký một lần lúc khởi động. Gọi lại lần nữa không nổ — `main.tsx` gọi lúc
 * boot, còn test gọi sau mỗi lần dọn registry.
 */
export function registerBattleSources(): void {
  const already = new Set(modifierSources().map((source) => source.id));
  for (const source of BATTLE_SOURCES) {
    if (already.has(source.id)) continue;
    registerModifierSource(source);
  }
}
