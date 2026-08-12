/**
 * BẢNG HÀNH ĐỘNG BÊN THỦ (Phần 11 mục 3).
 *
 * Chín hành động, đúng chín dòng mục 3 liệt kê — và mục 3 nói thẳng về bảng này:
 * "khác hẳn, KHÔNG PHẢI BẢN ĐỐI XỨNG". Đọc hai bảng cạnh nhau thì thấy ngay vì
 * sao: bên vây bấm để MUA TIẾN ĐỘ, bên thủ bấm để MUA THÊM THỜI GIAN, và cái giá
 * họ trả không phải tiền mà là lòng người. Cắt khẩu phần thì cầm cự lâu hơn nhưng
 * dân đói; đuổi dân ra thì bớt miệng ăn nhưng uy tín sụp; xử tử kẻ bàn lùi thì
 * quân đứng thẳng lại nhưng cả thành im lặng nhìn nhau suốt một tuần.
 *
 * KHÔNG import gì từ `minigames/siege-attack/`, và ngược lại — xem chú thích đầu
 * bảng bên kia. Hai bảng chỉ gặp nhau ở `SiegeAction` của lõi vây hãm.
 */

import { runCheck } from '@/systems/check/run';
import { isSuccess } from '@/systems/check/tiers';
import {
  PARLEY_DOMAIN,
  SIEGE_MORALE_DOMAIN,
  allRations,
  autoOffer,
  engineTypeOf,
  garrisonMen,
  makeView,
  parley,
  rationOf,
  repairTick,
  siegeConfig,
  wallShare,
  withSiegeView,
  type SiegeAction,
  type SiegeState,
} from '@/systems/siege';
import { sortie } from './sortie';
import { counterMine } from './countermine';

function log(siege: SiegeState, text: string, major = false): void {
  siege.log.push({ week: siege.week, side: 'thu', text, ...(major ? { major: true } : {}) });
}

// ---------------------------------------------------------------------------
// 1. Chia khẩu phần — QUYẾT ĐỊNH CỐT LÕI (mục 3)
// ---------------------------------------------------------------------------

/**
 * Cắt khẩu phần thì cầm cự lâu hơn nhưng sĩ khí và sức khỏe tụt.
 *
 * Đây là cái núm xoay chính của cả vai bên thủ, nên nó là một BẢNG NHIỀU MỨC chứ
 * không phải một công tắc — mục 3 viết đúng chữ ấy. Năm mức từ "đầy đủ" tới "ăn
 * cả ngựa", và mức cuối cùng là một tuyên bố: giết ngựa chiến nghĩa là sẽ không
 * còn cuộc đột kích nào nữa.
 */
export function setRation(rationId: string): SiegeAction {
  const level = rationOf(rationId);
  return {
    id: `chia-khau-phan:${level.id}`,
    name: `Khẩu phần: ${level.name}`,
    side: 'thu',
    note: `${level.note}. Sĩ khí ${String(level.morale)}/tuần, sức khỏe ${String(level.health)}/tuần.`,
    available: (siege) => siege.defender.ration !== level.id,
    apply(siege) {
      const before = rationOf(siege.defender.ration);
      siege.defender.ration = level.id;
      const line =
        level.factor < before.factor
          ? `Khẩu phần cắt từ "${before.name.toLowerCase()}" xuống "${level.name.toLowerCase()}". Kho lương sẽ giữ được lâu hơn, và người thì không.`
          : `Khẩu phần nới lên "${level.name.toLowerCase()}". Ai cũng biết điều đó nghĩa là gì cho tháng sau.`;
      log(siege, line, true);
      return [line];
    },
  };
}

// ---------------------------------------------------------------------------
// 2. Sửa tường ban đêm
// ---------------------------------------------------------------------------

export const repairWalls: SiegeAction = {
  id: 'sua-tuong',
  name: 'Sửa tường ban đêm',
  side: 'thu',
  note: 'Vác đá và rọ đất lên vá chỗ sứt, dưới ánh đuốc, khi máy bắn đã ngừng. Tốn vật liệu và sức dân.',
  available: (siege) =>
    siege.fort.supplies.materials > 0 &&
    siege.fort.population >= siegeConfig().repair.requiresPopulation &&
    // Không vá một bức tường chưa sứt. Không có vế này thì bộ chọn của engine sẽ
    // "sửa tường" mỗi tuần từ tuần đầu tiên và không làm gì cả.
    wallShare(siege.fort) < 0.99,
  apply(siege) {
    const done = repairTick(siege);
    for (const line of done.lines) log(siege, line);
    return done.lines;
  },
};

// ---------------------------------------------------------------------------
// 3. Đột kích ra ngoài — mục tiêu là ĐỐT MÁY CÔNG THÀNH
// ---------------------------------------------------------------------------

export function sallyOut(men?: number): SiegeAction {
  return {
    id: 'dot-kich',
    name: 'Đột kích ra ngoài',
    side: 'thu',
    note: 'Mở cổng lúc gần sáng và chạy thẳng tới chỗ máy bắn. Rủi ro cao, phần thưởng lớn: mấy tuần công sức của họ cháy trong một giờ.',
    available: (siege) => garrisonMen(siege.fort) > 40 && siege.attacker.engines.some((engine) => !engine.destroyed),
    apply(siege, rng) {
      const report = sortie(siege, rng, men ?? Math.round(garrisonMen(siege.fort) * 0.25));
      for (const line of report.lines) log(siege, line, report.burned.length > 0);
      return report.lines;
    },
  };
}

// ---------------------------------------------------------------------------
// 4. Phản đào hầm — minigame riêng, dưới lòng đất
// ---------------------------------------------------------------------------

export function counterMineAction(crew?: number): SiegeAction {
  return {
    id: 'phan-dao-ham',
    name: 'Phản đào hầm',
    side: 'thu',
    note: 'Đào ngược lại về phía tiếng cuốc, gặp hầm địch, và đánh nhau dưới lòng đất trong bóng tối.',
    available: (siege) => siege.attacker.mines.some((mine) => mine.detected && !mine.collapsed && !mine.fired),
    apply(siege, rng) {
      const report = counterMine(siege, rng, crew);
      for (const line of report.lines) log(siege, line, report.won);
      return report.lines;
    },
  };
}

// ---------------------------------------------------------------------------
// 5. Đổ nước sôi, vôi, đá — CHỈ khi địch áp sát chân tường
// ---------------------------------------------------------------------------

/**
 * Hành động này cố ý KHÔNG bấm được trong giai đoạn vây hãm.
 *
 * Mục 3 viết điều kiện ngay trong dòng của nó: "chỉ khi địch áp sát chân tường".
 * Nó nằm trong bảng để người chơi ĐỌC được rằng thứ ấy tồn tại và biết vật liệu
 * để làm gì — nhưng nó chỉ chạy trong cuộc tổng công, nơi `wallSource` của Phần
 * 11 trừ thẳng vào cú tung của đợt đang leo.
 */
export const boilingOil: SiegeAction = {
  id: 'do-nuoc-soi',
  name: 'Đổ nước sôi, vôi và đá',
  side: 'thu',
  note: 'Chỉ dùng được khi địch đã áp sát chân tường — tức là trong một cuộc tổng công, không phải trong một tuần vây hãm.',
  available: (siege) => siege.phase === 'tong-cong' && siege.fort.supplies.materials > 0,
  apply(siege) {
    const line = 'Vạc dầu và chậu vôi được kê sẵn trên lan can, bên cạnh những đống đá xếp thành hàng.';
    log(siege, line);
    return [line];
  },
};

// ---------------------------------------------------------------------------
// 6. Gửi sứ cầu viện
// ---------------------------------------------------------------------------

/** Phải LỌT QUA vòng vây, kiểm định GUI/AGI (mục 3). */
export const sendForHelp: SiegeAction = {
  id: 'gui-su-cau-vien',
  name: 'Gửi sứ cầu viện',
  side: 'thu',
  note: 'Một người, một con ngựa, và một vòng vây phải lọt qua trong đêm.',
  available: (siege) => !siege.reliefIncoming && siege.reliefPossible,
  apply(siege, rng) {
    const run = withSiegeView(makeView(siege, 'thu'), () =>
      runCheck(rng, {
        id: 'siege.cau-vien',
        system: 'd100',
        domain: PARLEY_DOMAIN,
        // Vòng vây càng kín thì càng khó lọt — đây là chỗ hành động của bên kia
        // đổ thẳng vào bảng của bên này.
        difficulty: siege.attacker.circumvallation >= 2 ? 'rat-kho' : siege.attacker.circumvallation >= 1 ? 'kho' : 'thuong',
        base: 50,
        actor: siege.playerSide === 'thu' ? '' : 'npc_thu',
        tags: ['len-lut', 'ban-dem'],
        state: siege.state,
      }),
    );
    siege.checks.push({ week: siege.week, side: 'thu', what: 'gửi sứ cầu viện', result: run.result });

    if (isSuccess(run.result.tier)) {
      siege.defender.reliefHope = true;
      siege.defender.garrisonMorale = Math.min(100, siege.defender.garrisonMorale + siegeConfig().morale.reliefHope);
      siege.defender.populationMorale = Math.min(100, siege.defender.populationMorale + siegeConfig().morale.reliefHope);
      const line = 'Người ấy lọt qua được. Cả thành không ai nói ra, nhưng ai cũng bắt đầu nhìn về phía đông.';
      log(siege, line, true);
      return [line];
    }
    // Hỏng thì cái xác được treo lên cho trong thành nhìn thấy — và hy vọng tắt.
    siege.defender.garrisonMorale = Math.max(0, siege.defender.garrisonMorale - 8);
    siege.defender.populationMorale = Math.max(0, siege.defender.populationMorale - 10);
    siege.cruelty += 3;
    const line = 'Sáng hôm sau, người ta thấy con ngựa không có người cưỡi đứng gặm cỏ ngoài vòng hào.';
    log(siege, line, true);
    return [line];
  },
};

// ---------------------------------------------------------------------------
// 7. Đuổi dân thường ra — LỰA CHỌN TÀN KHỐC CÓ THẬT
// ---------------------------------------------------------------------------

/**
 * Giảm miệng ăn rất hiệu quả. Nhưng bên vây thường KHÔNG CHO HỌ ĐI.
 *
 * Mục 3 gọi thẳng đây là "lựa chọn tàn khốc có thật", và vế thứ hai mới là vế
 * làm nó tàn khốc: những người ấy chết kẹt giữa hai bên, không vào lại được và
 * không đi được. Nếu engine chỉ trừ số miệng ăn rồi cộng cho người chơi một mức
 * phạt uy tín thì cái vế ấy biến mất, và đây thành một phép tính.
 */
export function expelCivilians(share = 0.4): SiegeAction {
  return {
    id: 'duoi-dan',
    name: 'Đuổi dân thường ra khỏi thành',
    side: 'thu',
    note: 'Bớt miệng ăn, rất hiệu quả. Bên vây thường không cho họ đi — và họ chết kẹt giữa hai bên.',
    available: (siege) => siege.fort.population > 60,
    apply(siege, rng) {
      const config = siegeConfig().morale;
      const sent = Math.round(siege.fort.population * share);
      siege.fort.population -= sent;
      siege.defender.civiliansExpelled += sent;
      siege.defender.populationMorale = Math.max(0, siege.defender.populationMorale + config.expelCivilians);
      siege.defender.garrisonMorale = Math.max(0, siege.defender.garrisonMorale - 4);

      const lines = [`${String(sent)} người già, đàn bà và trẻ con bị đưa ra khỏi cổng, mỗi người một bọc.`];

      // Bên vây cho đi hay không là quyết định của HỌ, không phải một xác suất
      // trang trí: một chỉ huy đã tuyên "không tha một ai" thì gần như chắc chắn
      // không mở đường.
      const letThrough = !siege.attacker.noQuarter && rng.int(1, 100) <= 30;
      if (letThrough) {
        siege.mercy += 6;
        lines.push('Bên vây mở một lối cho họ đi qua. Chuyện ấy hiếm, và người ta sẽ kể lại.');
      } else {
        siege.cruelty += 12;
        siege.church -= 8;
        siege.defender.populationMorale = Math.max(0, siege.defender.populationMorale - 10);
        siege.attacker.morale = Math.max(0, siege.attacker.morale - 3);
        lines.push(
          'Bên vây không cho họ đi. Họ ngồi lại trong khoảng đất giữa hai bên, dưới chân tường, và không ai ở hai bên dám nhìn xuống đó nữa.',
        );
      }
      for (const line of lines) log(siege, line, true);
      return lines;
    },
  };
}

// ---------------------------------------------------------------------------
// 8. Giả vờ dư dả
// ---------------------------------------------------------------------------

/** Ném thức ăn qua tường. Thành công thì bên vây nản; thất bại thì lộ ra cùng đường. */
export const feignPlenty: SiegeAction = {
  id: 'gia-vo-du-da',
  name: 'Giả vờ dư dả',
  side: 'thu',
  note: 'Ném bánh mì và một con lợn còn sống qua tường xuống trại địch. Cược cả kho lương vào một cú lừa.',
  available: (siege) => siege.fort.supplies.food > 200,
  apply(siege, rng) {
    siege.fort.supplies.food = Math.max(0, siege.fort.supplies.food - 150);
    const run = withSiegeView(makeView(siege, 'thu'), () =>
      runCheck(rng, {
        id: 'siege.gia-vo-du-da',
        system: 'd100',
        domain: PARLEY_DOMAIN,
        difficulty: 'kho',
        base: 45,
        actor: siege.playerSide === 'thu' ? '' : 'npc_thu',
        tags: ['muu-meo'],
        state: siege.state,
      }),
    );
    siege.checks.push({ week: siege.week, side: 'thu', what: 'giả vờ dư dả', result: run.result });

    if (isSuccess(run.result.tier)) {
      siege.attacker.morale = Math.max(0, siege.attacker.morale - 10);
      const line = 'Một con lợn còn sống rơi xuống giữa trại. Trong trại, người ta bắt đầu tính lại xem còn phải ngồi đây bao lâu nữa.';
      log(siege, line, true);
      return [line];
    }
    siege.attacker.morale = Math.min(100, siege.attacker.morale + 8);
    siege.defender.lastParleyWeek = siege.week + 1;
    const line = 'Con lợn ấy gầy tới mức không ai tin. Bên kia hiểu ngay: trong đó đang cùng đường.';
    log(siege, line, true);
    return [line];
  },
};

// ---------------------------------------------------------------------------
// 9. Giữ lòng người
// ---------------------------------------------------------------------------

export type HeartsMode = 'dien-thuyet' | 'le-ton-giao' | 'xu-tu';

const HEARTS_LABELS: Readonly<Record<HeartsMode, string>> = {
  'dien-thuyet': 'Diễn thuyết trước dân',
  'le-ton-giao': 'Làm lễ trong nhà nguyện',
  'xu-tu': 'Xử tử kẻ bàn lùi',
};

/**
 * Ba cách giữ lòng người, và chúng KHÁC NHAU THẬT.
 *
 * Diễn thuyết là một phép kiểm — hỏng thì phản tác dụng. Lễ tôn giáo an toàn
 * nhưng nhẹ. Xử tử thì CHẮC CHẮN có tác dụng lên quân, và chắc chắn phải trả
 * bằng lòng dân. Nếu cả ba chỉ là ba cách cộng sĩ khí thì mục 3 không cần kể ra
 * ba cái.
 */
export function holdHearts(mode: HeartsMode): SiegeAction {
  return {
    id: `giu-long-nguoi:${mode}`,
    name: HEARTS_LABELS[mode],
    side: 'thu',
    note:
      mode === 'dien-thuyet'
        ? 'Đứng lên bậc đá trước nhà nguyện và nói. Kiểm định hùng biện — hỏng thì tệ hơn là không nói gì.'
        : mode === 'le-ton-giao'
          ? 'Một buổi lễ, mùi hương, và cảm giác rằng ai đó ở trên còn nhớ tới chỗ này.'
          : 'Treo hai kẻ nói to nhất. Quân sẽ đứng thẳng lại. Dân sẽ im lặng rất lâu.',
    available: () => true,
    apply(siege, rng) {
      const config = siegeConfig().morale;

      if (mode === 'xu-tu') {
        siege.defender.garrisonMorale = Math.min(100, siege.defender.garrisonMorale + config.execution);
        siege.defender.populationMorale = Math.max(0, siege.defender.populationMorale + config.executionPopulation);
        siege.cruelty += 6;
        siege.church -= 4;
        const line = 'Hai cái xác treo ở cổng trong suốt ba ngày. Không ai bàn chuyện mở cổng nữa, và cũng không ai chào nhau nữa.';
        log(siege, line, true);
        return [line];
      }

      if (mode === 'le-ton-giao') {
        siege.defender.populationMorale = Math.min(100, siege.defender.populationMorale + config.sermon);
        siege.church += 3;
        const line = 'Chuông đổ vào giữa trưa, và trong một giờ đồng hồ không ai nghe thấy tiếng máy bắn nữa.';
        log(siege, line);
        return [line];
      }

      const run = withSiegeView(makeView(siege, 'thu'), () =>
        runCheck(rng, {
          id: 'siege.dien-thuyet',
          system: 'd100',
          domain: SIEGE_MORALE_DOMAIN,
          difficulty: siege.defender.populationMorale < 30 ? 'kho' : 'thuong',
          base: 50,
          actor: siege.playerSide === 'thu' ? '' : 'npc_thu',
          tags: ['hung-bien'],
          state: siege.state,
        }),
      );
      siege.checks.push({ week: siege.week, side: 'thu', what: 'diễn thuyết giữ lòng người', result: run.result });

      if (isSuccess(run.result.tier)) {
        const gain = run.result.tier === 'critSuccess' ? config.sermon * 2 : config.sermon;
        siege.defender.populationMorale = Math.min(100, siege.defender.populationMorale + gain);
        siege.defender.garrisonMorale = Math.min(100, siege.defender.garrisonMorale + gain * 0.6);
        const line = 'Ngài nói chừng mười phút. Khi ngài xuống khỏi bậc đá, đám đông đã tự giải tán.';
        log(siege, line);
        return [line];
      }
      siege.defender.populationMorale = Math.max(0, siege.defender.populationMorale - 6);
      const line = 'Có tiếng cười ở cuối đám đông, và ngài nghe thấy nó. Đó là điều tệ nhất có thể xảy ra hôm nay.';
      log(siege, line, true);
      return [line];
    },
  };
}

// ---------------------------------------------------------------------------
// Xin điều kiện
// ---------------------------------------------------------------------------

/** Bên thủ chủ động ngồi vào bàn — thường là để xin khất tới ngày hẹn (mục 5). */
export function sueForTerms(terms?: readonly string[]): SiegeAction {
  return {
    id: 'xin-dieu-kien',
    name: 'Xin điều kiện',
    side: 'thu',
    note: 'Treo cờ trắng trên tháp cổng và xin một cuộc nói chuyện. Thường là để xin khất tới một ngày hẹn.',
    available: (siege) => siege.week >= siege.defender.lastParleyWeek && !siege.finished,
    apply(siege, rng) {
      const offer = terms === undefined ? autoOffer(siege, 'thu') : { by: 'thu' as const, terms, deadlineWeeks: 4 };
      const outcome = parley(siege, rng, offer);
      return outcome.lines.length > 0 ? outcome.lines : ['Cờ trắng hạ xuống, và không có gì thay đổi.'];
    },
  };
}

// ---------------------------------------------------------------------------
// Bảng
// ---------------------------------------------------------------------------

export function defenderActions(siege: SiegeState): SiegeAction[] {
  void siege;
  return [
    ...allRations().map((level) => setRation(level.id)),
    repairWalls,
    sallyOut(),
    counterMineAction(),
    boilingOil,
    sendForHelp,
    expelCivilians(),
    feignPlenty,
    holdHearts('dien-thuyet'),
    holdHearts('le-ton-giao'),
    holdHearts('xu-tu'),
    sueForTerms(),
  ];
}

/**
 * Bên thủ do engine cầm chọn thế nào.
 *
 * Thứ tự ưu tiên LÀ học thuyết thủ thành viết thành code, và nó khác hẳn thứ tự
 * của bên kia: giữ hầm trước (một đường hầm thành công là mất tường), rồi tới cái
 * ăn, rồi tới lòng người, rồi mới tới tường. Đốt máy công thành nằm gần cuối vì
 * nó đắt — nhưng nó nhảy lên đầu ngay khi bên kia có trebuchet.
 */
export function autoDefenderAction(siege: SiegeState): SiegeAction {
  const config = siegeConfig();
  const ration = rationOf(siege.defender.ration);
  const mouths = garrisonMen(siege.fort) + siege.fort.population;
  const weeksLeft = mouths <= 0 ? 99 : siege.fort.supplies.food / (mouths * ration.factor);

  const candidates: SiegeAction[] = [];

  if (siege.attacker.mines.some((mine) => mine.detected && !mine.collapsed && !mine.fired)) {
    candidates.push(counterMineAction());
  }
  if (weeksLeft < 8) {
    // Xuống một bậc khẩu phần, không xuống thẳng đáy: mục 3 dựng cả một bảng
    // nhiều mức để đây là một cái núm xoay chứ không phải một công tắc.
    const levels = allRations();
    const index = levels.findIndex((level) => level.id === ration.id);
    const next = levels[Math.min(levels.length - 1, index + 1)];
    if (next !== undefined && next.id !== ration.id) candidates.push(setRation(next.id));
  }
  if (!siege.reliefIncoming && siege.reliefPossible && siege.week >= 2) candidates.push(sendForHelp);
  if (siege.defender.populationMorale < 35) candidates.push(holdHearts('le-ton-giao'));

  /**
   * ĐỘT KÍCH LÀ MỘT NƯỚC ĐI ĐẮT, và bộ chọn phải biết điều đó.
   *
   * Ba điều kiện, và cả ba đều đã trả giá một lần trong lúc dựng: chỉ đi khi bên
   * kia có thứ ĐÁNG ĐỐT (một cái thang cháy thì họ dựng lại trong một buổi chiều,
   * còn một cỗ trebuchet cháy là ba tuần của họ), chỉ đi khi còn đủ người trên
   * tường, và không đi hai lần trong bốn tuần. Thiếu bất kỳ điều kiện nào thì hai
   * trăm người trong tường hết sạch trong đúng bốn tuần — không phải vì bên vây
   * giỏi, mà vì chính bộ chọn của bên thủ ném họ ra ngoài mỗi tuần một lần.
   */
  const worthBurning = siege.attacker.engines.some(
    (engine) => engine.built && !engine.destroyed && (engineTypeOf(engine.typeId)?.wallDamage ?? 0) > 0,
  );
  if (worthBurning && garrisonMen(siege.fort) > 80 && siege.week - siege.defender.lastSortieWeek >= 4) {
    candidates.push(sallyOut());
  }

  candidates.push(repairWalls);
  if (siege.defender.garrisonMorale < config.morale.checkBelow) candidates.push(holdHearts('dien-thuyet'));

  for (const action of candidates) {
    if (action.available(siege)) return action;
  }
  return holdHearts('le-ton-giao');
}
