/**
 * BẢNG HÀNH ĐỘNG BÊN VÂY (Phần 11 mục 3).
 *
 * Chín hành động, đúng chín dòng mục 3 liệt kê. Mục 10.4 nói "HAI BẢNG HÀNH ĐỘNG
 * RIÊNG BIỆT cho hai bên, KHÔNG DÙNG CHUNG" — nên bảng này và bảng ở
 * `minigames/siege-defense/actions.ts` là hai file không import lẫn nhau, không
 * kế thừa một kiểu chung nào ngoài `SiegeAction`, và không có một hàm trợ giúp
 * nào bắc cầu giữa hai bên.
 *
 * Không phải một sự khắt khe cho vui: bảng bên vây và bảng bên thủ trông đối
 * xứng ở mức bề mặt ("bắn phá" ↔ "sửa tường") nhưng chúng KHÔNG đối xứng ở mức
 * cơ học. Bên vây tiêu tiền và tiêu thời gian để mua tiến độ; bên thủ tiêu lòng
 * người và tiêu vật liệu để mua thêm thời gian. Một bảng chung sẽ ép hai vế ấy
 * về một khuôn, và mục 1 nói thẳng rằng hai vai chơi phải khác hẳn nhau.
 *
 * MỖI HÀNH ĐỘNG LÀ MỘT TUẦN. Không có "làm hai việc cùng lúc" — đó chính là chỗ
 * cuộc vây hãm thành một chuỗi quyết định thay vì một danh sách việc phải làm.
 */

import { runCheck } from '@/systems/check/run';
import { isSuccess } from '@/systems/check/tiers';
import {
  PARLEY_DOMAIN,
  autoOffer,
  engineTypeOf,
  liveEngines,
  makeView,
  openMine,
  parley,
  siegeConfig,
  withSiegeView,
  type SiegeAction,
  type SiegeState,
} from '@/systems/siege';

function log(siege: SiegeState, text: string, major = false): void {
  siege.log.push({ week: siege.week, side: 'vay', text, ...(major ? { major: true } : {}) });
}

// ---------------------------------------------------------------------------
// 1. Dựng vòng vây
// ---------------------------------------------------------------------------

/**
 * Chặn tiếp tế, tốn công, cần nhiều quân.
 *
 * Ba vế của mục 3 đều có mặt và vế thứ ba là vế đắt: đào một vòng hào quanh cả
 * một thành trì trong một tuần làm cả trại bẩn thêm và mệt thêm. Cái mua được là
 * lương lậu ban đêm — thứ duy nhất giữ cho kho trong kia không vơi.
 */
export const buildCircumvallation: SiegeAction = {
  id: 'vong-vay',
  name: 'Dựng vòng vây',
  side: 'vay',
  note: 'Chặn tiếp tế lọt vào thành. Tốn công, làm trại bẩn thêm, và cần rất nhiều người.',
  available: (siege) => siege.attacker.circumvallation < 3 && siege.attacker.troops > 400,
  apply(siege) {
    siege.attacker.circumvallation += 1;
    siege.attacker.hygiene = Math.max(5, siege.attacker.hygiene - 4);
    siege.attacker.morale = Math.max(0, siege.attacker.morale - 2);
    const line = `Vòng hào khép thêm một khúc (mức ${String(siege.attacker.circumvallation)}/3). Ít người lọt qua được hơn hẳn.`;
    log(siege, line);
    return [line];
  },
};

// ---------------------------------------------------------------------------
// 2. Đào hầm phá tường
// ---------------------------------------------------------------------------

/** Lùn và thợ mỏ giỏi nhất; mất nhiều tuần (mục 3). */
export function digMine(raceId: string, crew = 120): SiegeAction {
  return {
    id: 'dao-ham',
    name: 'Đào hầm phá tường',
    side: 'vay',
    note: 'Đường vào thành duy nhất không phơi ai ra trước tên đạn. Mất nhiều tuần, và Lùn đào nhanh hơn hẳn.',
    available: (siege) => siege.attacker.mines.every((mine) => mine.collapsed || mine.fired),
    apply(siege) {
      openMine(siege, crew, raceId);
      const line = `Miệng hầm mở sau một cái lán, cách chân tường chừng bốn mươi bước. ${String(crew)} người thợ xuống trước.`;
      log(siege, line, true);
      return [line];
    },
  };
}

// ---------------------------------------------------------------------------
// 3. Dựng máy công thành
// ---------------------------------------------------------------------------

export function buildEngine(typeId: string): SiegeAction {
  const type = engineTypeOf(typeId);
  return {
    id: `dung-may:${typeId}`,
    name: `Dựng ${type?.name ?? typeId}`,
    side: 'vay',
    note: type?.note ?? '',
    available: (siege) =>
      type !== null &&
      siege.attacker.treasury >= type.cost &&
      !siege.attacker.engines.some((engine) => engine.typeId === typeId && !engine.built && !engine.destroyed),
    apply(siege) {
      if (type === null) return [];
      siege.attacker.treasury -= type.cost;
      siege.attacker.engines.push({
        id: `engine_${String(siege.attacker.engines.length + 1)}`,
        typeId,
        name: type.name,
        progress: 0,
        built: false,
        destroyed: false,
        guarded: false,
      });
      const line = `Thợ mộc bắt đầu dựng ${type.name} — chừng ${String(type.buildWeeks)} tuần, ${String(type.crew)} người.`;
      log(siege, line);
      return [line];
    },
  };
}

// ---------------------------------------------------------------------------
// 4. Bắn phá
// ---------------------------------------------------------------------------

/**
 * Hạ integrity tường, ồn ào, hạ sĩ khí bên trong.
 *
 * Hành động này chỉ BẬT CỜ; phần tính nằm ở `bombardTick` của nhịp tuần, vì hư
 * hại tường phải xảy ra sau khi biết tuần này còn bao nhiêu máy chưa cháy.
 */
export const bombard: SiegeAction = {
  id: 'ban-pha',
  name: 'Bắn phá',
  side: 'vay',
  note: 'Nện đá vào một khúc tường suốt bảy ngày. Ồn ào — và trong kia không ai ngủ được.',
  available: (siege) => liveEngines(siege).length > 0,
  apply(siege) {
    siege.attacker.bombarding = true;
    const names = liveEngines(siege)
      .map((engine) => engine.name)
      .join(', ');
    const line = `Đội vận hành vào chỗ: ${names}.`;
    log(siege, line);
    return [line];
  },
};

// ---------------------------------------------------------------------------
// 5. Cắt nguồn nước
// ---------------------------------------------------------------------------

/** Cực mạnh NẾU thành không có giếng riêng (mục 3) — và gần như vô ích nếu có. */
export const cutWater: SiegeAction = {
  id: 'cat-nuoc',
  name: 'Cắt nguồn nước',
  side: 'vay',
  note: 'Chặn suối và đầu độc mấy cái ao. Cực mạnh nếu trong kia không có giếng riêng.',
  available: (siege) => !siege.attacker.cutWater,
  apply(siege) {
    siege.attacker.cutWater = true;
    const dry = siege.fort.wells <= 0;
    const line = dry
      ? 'Con suối bị chặn ở thượng nguồn. Trong kia không có giếng nào — từ tuần này họ đếm ngày.'
      : `Con suối bị chặn, nhưng trong kia còn ${String(siege.fort.wells)} cái giếng. Chỉ thêm một việc phải xếp hàng.`;
    log(siege, line, dry);
    return [line];
  },
};

// ---------------------------------------------------------------------------
// 6. Ném xác vào trong
// ---------------------------------------------------------------------------

/**
 * Gieo dịch bệnh; HIỆU QUẢ THẬT nhưng bị Giáo hội lên án (mục 3).
 *
 * Cả hai vế phải cùng có mặt. Nếu chỉ có vế đầu thì đây là một nút bấm hiển
 * nhiên; nếu chỉ có vế sau thì nó là một cái bẫy. Đúng như thế mới là một quyết
 * định của thế kỷ 14.
 */
export const throwCorpses: SiegeAction = {
  id: 'nem-xac',
  name: 'Ném xác vào trong',
  side: 'vay',
  note: 'Chất xác người chết vì dịch lên trebuchet và bắn qua tường. Hiệu quả thật. Giáo hội sẽ nghe chuyện này.',
  available: (siege) =>
    !siege.attacker.threwCorpses &&
    liveEngines(siege).some((engine) => engineTypeOf(engine.typeId)?.canThrowCorpses === true),
  apply(siege) {
    const config = siegeConfig().disease;
    siege.attacker.threwCorpses = true;
    siege.church += config.corpseThrowChurch;
    siege.cruelty += 8;
    siege.defender.populationMorale = Math.max(0, siege.defender.populationMorale - 12);
    const line = 'Suốt đêm, những thứ bay qua tường không phải là đá. Đến sáng thì cả khoảnh sân bốc mùi.';
    log(siege, line, true);
    return [line, 'Giáo hội sẽ biết chuyện này trước khi mùa kết thúc.'];
  },
};

// ---------------------------------------------------------------------------
// 7. Chiêu hàng
// ---------------------------------------------------------------------------

/** Mở cửa đàm phán (mục 5). Điều khoản do người chơi chọn, hoặc gói dựng sẵn. */
export function offerTerms(terms?: readonly string[], skillId?: string): SiegeAction {
  return {
    id: 'chieu-hang',
    name: 'Chiêu hàng',
    side: 'vay',
    note: 'Gửi một sứ giả tới cổng với một danh sách điều khoản. Đây là cách phần lớn thành trì đổi chủ.',
    available: (siege) => siege.week >= siege.defender.lastParleyWeek && !siege.finished,
    apply(siege, rng) {
      const offer = terms === undefined ? autoOffer(siege, 'vay') : { by: 'vay' as const, terms, ...(skillId === undefined ? {} : { skillId }) };
      const outcome = parley(siege, rng, offer);
      if (outcome.accepted && outcome.contract === null) {
        // Thỏa thuận không có khế ước nghĩa là cổng mở NGAY: hai bên đã xong việc.
        siege.finished = true;
        siege.winner = 'vay';
        siege.ending = 'dau-hang-co-dieu-kien';
        siege.phase = 'xong';
        siege.terms = [...outcome.agreed];
      }
      return outcome.lines.length > 0 ? outcome.lines : ['Sứ giả quay về, mang theo đúng những gì đã mang đi.'];
    },
  };
}

// ---------------------------------------------------------------------------
// 8. Mua chuộc nội gián
// ---------------------------------------------------------------------------

/**
 * Dùng GUI, tốn tiền, RỦI RO LỘ (mục 3).
 *
 * Vế thứ ba là vế làm nó khác một canh bạc thuần: hỏng thì không chỉ mất tiền —
 * người trong kia biết là có kẻ định phản, và họ siết chặt lại, nên lần sau khó
 * hơn nhiều.
 */
export function bribeInsider(cost = 300): SiegeAction {
  return {
    id: 'mua-chuoc',
    name: 'Mua chuộc nội gián',
    side: 'vay',
    note: 'Một túi bạc thả qua tường trong đêm. Rẻ hơn ba tuần bắn phá — nếu người kia giữ lời.',
    available: (siege) => siege.attacker.treasury >= cost && !siege.finished,
    apply(siege, rng) {
      siege.attacker.treasury -= cost;
      const run = withSiegeView(makeView(siege, 'vay'), () =>
        runCheck(rng, {
          id: 'siege.mua-chuoc',
          system: 'd100',
          domain: PARLEY_DOMAIN,
          // Lòng người trong thành càng nát thì càng dễ mua — đó là toàn bộ lý do
          // hành động này đáng chờ tới tuần thứ mười thay vì bấm ngay tuần đầu.
          difficulty: siege.defender.populationMorale < 40 ? 'thuong' : 'kho',
          base: 45,
          actor: siege.playerSide === 'vay' ? '' : 'npc_vay',
          tags: ['mua-chuoc'],
          state: siege.state,
        }),
      );
      siege.checks.push({ week: siege.week, side: 'vay', what: 'mua chuộc nội gián', result: run.result });

      if (run.result.tier === 'critSuccess') {
        siege.finished = true;
        siege.winner = 'vay';
        siege.ending = 'phan-boi-mo-cong';
        siege.phase = 'xong';
        const line = 'Đêm thứ ba, một cánh cổng phụ mở ra và không ai trên tường kịp kêu.';
        log(siege, line, true);
        return [line];
      }
      if (isSuccess(run.result.tier)) {
        siege.defender.garrisonMorale = Math.max(0, siege.defender.garrisonMorale - 8);
        siege.defender.populationMorale = Math.max(0, siege.defender.populationMorale - 6);
        const line = 'Có người nhận bạc. Chưa mở được cổng, nhưng từ nay trong kia không ai tin ai nữa.';
        log(siege, line);
        return [line];
      }
      siege.defender.garrisonMorale = Math.min(100, siege.defender.garrisonMorale + 5);
      siege.defender.lastParleyWeek = siege.week + 2;
      const line = 'Kẻ nhận bạc bị treo lên tường ngay sáng hôm sau, túi bạc buộc vào cổ. Trong kia siết lại hẳn.';
      log(siege, line, true);
      return [line];
    },
  };
}

// ---------------------------------------------------------------------------
// 9. Đợi
// ---------------------------------------------------------------------------

/** Rẻ nhất — nhưng thời gian ăn mòn chính mình (mục 3). */
export const wait: SiegeAction = {
  id: 'doi',
  name: 'Đợi',
  side: 'vay',
  note: 'Không làm gì cả. Rẻ nhất trong mọi nước đi, và tuần nào cũng có người chết vì kiết lỵ.',
  available: () => true,
  apply(siege) {
    siege.attacker.morale = Math.min(100, siege.attacker.morale + 1);
    return ['Một tuần nữa trôi qua trước tường thành, không có gì xảy ra.'];
  },
};

// ---------------------------------------------------------------------------
// Bảng
// ---------------------------------------------------------------------------

/** Chín hành động của mục 3, đúng thứ tự bảng ấy in ra. */
export function besiegerActions(siege: SiegeState): SiegeAction[] {
  return [
    buildCircumvallation,
    digMine(siege.attacker.minerRaceId),
    ...['engine_thang', 'engine_xe-huc', 'engine_mangonel', 'engine_trebuchet', 'engine_thap-cong-thanh'].map(buildEngine),
    bombard,
    cutWater,
    throwCorpses,
    offerTerms(),
    bribeInsider(),
    wait,
  ];
}

/**
 * Bên vây do engine cầm chọn thế nào.
 *
 * Một bộ luật ưu tiên ĐỌC ĐƯỢC — cùng lý do với `tactics.ts` của Phần 10. Thứ tự
 * ưu tiên ở đây LÀ học thuyết vây hãm thế kỷ 14 viết thành code: khép vòng vây
 * trước, dựng máy, rồi nện tường, và chỉ chiêu hàng khi trong kia đã có lý do để
 * nghe. "Tổng công" không có trong danh sách này, và đó là cố ý — mục 1 nói nó là
 * NƯỚC CUỐI CÙNG, nên nó là một nút riêng người chơi phải tự bấm.
 */
export function autoBesiegerAction(siege: SiegeState): SiegeAction {
  const candidates: SiegeAction[] = [];

  if (siege.attacker.circumvallation < 2) candidates.push(buildCircumvallation);
  if (siege.fort.wells <= 0 && !siege.attacker.cutWater) candidates.push(cutWater);

  const hasBombard = liveEngines(siege).some((engine) => (engineTypeOf(engine.typeId)?.wallDamage ?? 0) > 0);
  const building = siege.attacker.engines.some((engine) => !engine.built && !engine.destroyed);
  if (!hasBombard && !building) {
    candidates.push(buildEngine(siege.attacker.treasury >= 420 ? 'engine_trebuchet' : 'engine_mangonel'));
  }
  if (hasBombard) candidates.push(bombard);
  if (siege.defender.garrisonMorale < 40) candidates.push(offerTerms());

  for (const action of candidates) {
    if (action.available(siege)) return action;
  }
  return wait;
}
