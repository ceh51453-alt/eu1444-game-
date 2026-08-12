/**
 * NGUỒN MODIFIER CỦA PHẦN 11 — cắm vào registry của Phần 5 mục 7.
 *
 * Ở một cuộc vây hãm, nhu cầu minh bạch còn gắt hơn ở một trận đánh. Một trận dã
 * chiến thua trong bốn mươi vòng; một cuộc vây hãm thua trong hai mươi TUẦN, và
 * người chơi ngồi bấm cùng một nút suốt hai mươi lần ấy. Nếu bảng điều chỉnh
 * không nói ra rằng họ đang hỏng vì trại bẩn chứ không phải vì tường dày, thì cái
 * họ học được sau hai mươi tuần là "engine ăn gian".
 *
 * MỘT ẢNH CHỤP, KHÔNG PHẢI MỘT BẢN ĐỒ THEO ACTOR như Phần 10. Ở dã chiến, ba
 * mươi quân cờ có thể cùng tung trong một vòng nên `Engagement` phải khoá theo
 * actor. Ở đây mỗi tuần chỉ có một chuỗi phép kiểm chạy nối tiếp nhau, mỗi lần
 * đúng một bên — nên một ảnh chụp duy nhất là đủ, và nó đọc dễ hơn hẳn.
 *
 * MỘT ĐIỀU KHÔNG NẰM Ở ĐÂY, cùng lý do với Phần 10: SỐ NGƯỜI GIỮ MỘT LỚP trong
 * lúc tổng công. Ở hệ pool nó đặt SỐ THÀNH CÔNG CẦN chứ không bớt viên xúc sắc
 * của bên tấn công, và `assaultBreakdown` in bản chi tiết của nó ra ngay cạnh cú
 * tung.
 */

import type { Modifier, ModifierContext, ModifierSource } from '@/systems/check/registry';
import { modifierSources, registerModifierSource } from '@/systems/check/registry';
import { bonusFor, penaltyFor, scaleToSystem } from '@/systems/check/sources';
import { assaultMethodOf, counterMineConfig, parleyConfig, rationOf, seasonOf, siegeConfig } from './data';
import { defenceDensity, wallShare } from './fortification';
import { campSupplyWeeks, foodWeeksLeft, heldWall, type SiegeSide, type SiegeState } from './types';

// Miền
export const PARLEY_DOMAIN = 'siege.dam-phan';
export const BOMBARD_DOMAIN = 'siege.cong-pha';
export const SIEGE_MORALE_DOMAIN = 'siege.si-khi';
export const DISEASE_DOMAIN = 'siege.benh-dich';
export const ASSAULT_DOMAIN = 'siege.tong-cong';
export const MINE_DOMAIN = 'siege.dao-ham';
export const COUNTERMINE_DOMAIN = 'siege.phan-dao-ham';
export const SORTIE_DOMAIN = 'siege.dot-kich';

// Nguồn
export const HUNGER_SOURCE_ID = 'siege.cai-doi';
export const HYGIENE_SOURCE_ID = 'siege.ve-sinh-trai';
export const WALL_SOURCE_ID = 'siege.tuong-thanh';
export const DENSITY_SOURCE_ID = 'siege.mat-do-phong-thu';
export const METHOD_SOURCE_ID = 'siege.cach-danh';
export const SEASON_SOURCE_ID = 'siege.mua';
export const REPUTATION_SOURCE_ID = 'siege.tieng-tan-bao';
export const BALANCE_SOURCE_ID = 'siege.tuong-quan';
export const RELIEF_SOURCE_ID = 'siege.cuu-vien';
export const SERVICE_SOURCE_ID = 'siege.han-nghia-vu';
export const DARK_SOURCE_ID = 'siege.duoi-long-dat';

// ---------------------------------------------------------------------------
// Ảnh chụp
// ---------------------------------------------------------------------------

export interface SiegeView {
  siege: SiegeState;
  /** Bên đang kiểm định. */
  side: SiegeSide;
  /** Pha này diễn ra dưới lòng đất, trong bóng tối (phản đào hầm). */
  underground: boolean;
  /** Đội thợ này nhìn được trong tối. */
  nightSight: boolean;
  /** Lớp đang đánh, khi đang tổng công. */
  layerId: string;
  /** Cách đang dùng để vượt lớp ấy. */
  methodId: string;
  /** Đợt này là đội tiên phong (mục 6). */
  forlorn: boolean;
  /** Tổng "giá" của những điều khoản đang đặt lên bàn (mục 5). */
  askWeight: number;
}

let current: SiegeView | null = null;

/** Engine gọi ngay trước một phép kiểm, và gỡ xuống ngay sau đó. */
export function publishSiege(view: SiegeView | null): void {
  current = view;
}

export function siegeView(): SiegeView | null {
  return current;
}

export function makeView(siege: SiegeState, side: SiegeSide, extra: Partial<SiegeView> = {}): SiegeView {
  return {
    siege,
    side,
    underground: false,
    nightSight: false,
    layerId: '',
    methodId: '',
    forlorn: false,
    askWeight: 0,
    ...extra,
  };
}

function viewOf(): SiegeView | null {
  return current;
}

// ---------------------------------------------------------------------------
// 1. CÁI ĐÓI — vế của bên thủ trong thế bất đối xứng của mục 1
// ---------------------------------------------------------------------------

export const hungerSource: ModifierSource = {
  id: HUNGER_SOURCE_ID,
  domains: [SIEGE_MORALE_DOMAIN, ASSAULT_DOMAIN, SORTIE_DOMAIN, PARLEY_DOMAIN, COUNTERMINE_DOMAIN],
  compute(ctx) {
    const view = viewOf();
    if (view === null) return null;
    const lines: Modifier[] = [];

    if (view.side === 'thu') {
      const ration = rationOf(view.siege.defender.ration);
      const weeks = foodWeeksLeft(view.siege, ration.factor);
      if (ration.factor < 1) {
        lines.push(penaltyFor(ctx.system, `Khẩu phần ${ration.name.toLowerCase()}`, (1 - ration.factor) * 40, HUNGER_SOURCE_ID));
      }
      if (weeks < 2) {
        lines.push(penaltyFor(ctx.system, `Kho lương còn chưa đầy hai tuần`, 30, HUNGER_SOURCE_ID));
      }
      if (view.siege.defender.waterCutWeeks > 0) {
        lines.push(
          penaltyFor(
            ctx.system,
            `Không có nước đã ${String(view.siege.defender.waterCutWeeks)} tuần`,
            22 * view.siege.defender.waterCutWeeks,
            HUNGER_SOURCE_ID,
          ),
        );
      }
    } else {
      // Bên vây cũng đói, và họ đói theo kiểu khác: kho của họ ở cách đó nhiều
      // ngày đường, không phải trong tường.
      const weeks = campSupplyWeeks(view.siege);
      if (weeks < 1) {
        lines.push(penaltyFor(ctx.system, 'Trại đã hết lương, đoàn xe chưa tới', 25, HUNGER_SOURCE_ID));
      } else if (weeks < 2) {
        lines.push(penaltyFor(ctx.system, 'Lương trong trại còn chưa đầy hai tuần', 12, HUNGER_SOURCE_ID));
      }
    }

    return lines.length === 0 ? null : lines;
  },
};

// ---------------------------------------------------------------------------
// 2. VỆ SINH TRẠI — mối đe dọa số một của mục 3
// ---------------------------------------------------------------------------

export const hygieneSource: ModifierSource = {
  id: HYGIENE_SOURCE_ID,
  domains: [DISEASE_DOMAIN],
  compute(ctx) {
    const view = viewOf();
    if (view === null) return null;
    const config = siegeConfig().disease;
    const lines: Modifier[] = [];

    if (view.side === 'vay') {
      const fort = view.siege.fort;
      if (fort.moat?.wet === true) {
        lines.push({
          label: 'Hào nước ngay cạnh trại — nước tù, ruồi nhặng',
          source: HYGIENE_SOURCE_ID,
          ...scaleToSystem(ctx.system, config.wetMoatPenalty),
        });
      }
      if (view.siege.attacker.outbreakWeeks > 0) {
        lines.push(penaltyFor(ctx.system, 'Dịch đang bùng trong trại', 20, HYGIENE_SOURCE_ID));
      }
    } else {
      // Bên trong tường có giếng và có nhà — nhưng nhồi cả dân vào một khoảnh sân
      // thì lợi thế ấy mất rất nhanh.
      lines.push(bonusFor(ctx.system, 'Có giếng và mái nhà trong tường', config.insideHygieneBonus, HYGIENE_SOURCE_ID));
      if (view.siege.attacker.threwCorpses) {
        lines.push(penaltyFor(ctx.system, 'Xác người ném qua tường', -config.corpseThrowPenalty, HYGIENE_SOURCE_ID));
      }
    }

    return lines.length === 0 ? null : lines;
  },
};

// ---------------------------------------------------------------------------
// 3. TƯỜNG THÀNH — lý do tồn tại của cả công trình
// ---------------------------------------------------------------------------

export const wallSource: ModifierSource = {
  id: WALL_SOURCE_ID,
  domains: [ASSAULT_DOMAIN, PARLEY_DOMAIN, BOMBARD_DOMAIN],
  compute(ctx) {
    const view = viewOf();
    if (view === null) return null;
    const wall = heldWall(view.siege.fort);
    const share = wallShare(view.siege.fort);
    const lines: Modifier[] = [];

    if (ctx.domain === ASSAULT_DOMAIN) {
      if (wall !== null) {
        const height = wall.height * siegeConfig().assault.heightPerMeter;
        const line = view.side === 'vay' ? -height : height;
        lines.push({
          label: `${wall.name} cao ${String(wall.height)}m`,
          source: WALL_SOURCE_ID,
          ...scaleToSystem(ctx.system, line),
        });
        if (wall.breached) {
          lines.push(
            view.side === 'vay'
              ? bonusFor(ctx.system, 'Đánh vào chỗ tường đã vỡ', 24, WALL_SOURCE_ID)
              : penaltyFor(ctx.system, 'Giữ một lỗ thủng thay vì một bức tường', 24, WALL_SOURCE_ID),
          );
        }
      }
      // Lỗ châu mai và nước sôi chỉ có nghĩa khi địch đã ÁP SÁT CHÂN TƯỜNG (mục 3),
      // và chúng trừ vào cú tung của bên tấn công chứ không cộng cho ai — ở lớp này
      // bên thủ không tung xúc sắc nào cả, họ chỉ đổ đồ xuống.
      if (view.side === 'vay' && (view.layerId === 'chan-tuong' || view.layerId === 'duoi-hao')) {
        const gate = view.siege.fort.gatehouse;
        if (gate.murderHoles && !gate.broken) {
          lines.push(penaltyFor(ctx.system, 'Lỗ châu mai ngay trên đầu', siegeConfig().assault.murderHoleBonus, WALL_SOURCE_ID));
        }
        if (view.siege.fort.supplies.materials > 0 && view.layerId === 'chan-tuong') {
          lines.push(penaltyFor(ctx.system, 'Nước sôi, vôi bột và đá từ trên đổ xuống', siegeConfig().assault.boilingOil, WALL_SOURCE_ID));
        }
      }
      return lines.length === 0 ? null : lines;
    }

    if (ctx.domain === BOMBARD_DOMAIN) {
      if (wall === null) return null;
      return [
        {
          label: `${wall.name} dày ${String(wall.thickness)}m`,
          source: WALL_SOURCE_ID,
          ...scaleToSystem(ctx.system, -wall.thickness * 6),
        },
      ];
    }

    // Đàm phán: một bức tường còn lành là lý do người trong kia chưa cần nghe.
    if (share > 0.85) {
      return [
        view.side === 'vay'
          ? penaltyFor(ctx.system, 'Tường còn nguyên vẹn — trong kia chưa thấy lý do', 18, WALL_SOURCE_ID)
          : bonusFor(ctx.system, 'Tường còn nguyên vẹn', 18, WALL_SOURCE_ID),
      ];
    }
    if (share < 0.25) {
      return [
        view.side === 'vay'
          ? bonusFor(ctx.system, 'Tường đã nát, ai cũng nhìn thấy', 20, WALL_SOURCE_ID)
          : penaltyFor(ctx.system, 'Tường đã nát, ai cũng nhìn thấy', 20, WALL_SOURCE_ID),
      ];
    }
    return null;
  },
};

// ---------------------------------------------------------------------------
// 4. MẬT ĐỘ PHÒNG THỦ SAU KHI LÙI (mục 2)
// ---------------------------------------------------------------------------

/**
 * Vế "mật độ phòng thủ tăng lên" của mục 2, và nó phải là một dòng ĐỌC ĐƯỢC.
 *
 * Nếu lùi một lớp chỉ hiện ra dưới dạng "tự nhiên đánh khó hơn" thì người chơi ở
 * vai bên vây sẽ nghĩ engine vừa phạt mình vì đã thắng một lớp.
 */
export const densitySource: ModifierSource = {
  id: DENSITY_SOURCE_ID,
  domains: [ASSAULT_DOMAIN],
  compute(ctx) {
    const view = viewOf();
    if (view === null) return null;
    const lost = view.siege.fort.lostLayers.length;
    if (lost === 0) return null;
    const value = lost * siegeConfig().assault.defenderDensityPerLayer;
    return [
      {
        label: `Bên thủ dồn lại, ${Math.round(defenceDensity(view.siege.fort))} người trên một mẫu đất`,
        source: DENSITY_SOURCE_ID,
        ...scaleToSystem(ctx.system, view.side === 'vay' ? -value : value),
      },
    ];
  },
};

// ---------------------------------------------------------------------------
// 4b. CÁCH VƯỢT LỚP (mục 6) — thứ người chơi CHỌN, nên nó phải hiện thành một dòng
// ---------------------------------------------------------------------------

/**
 * Bảng cơ chế của mục 6 là một bảng ĐÁNH ĐỔI, không phải một bảng nâng cấp: thang
 * thì rẻ và nhanh nhưng thương vong khủng khiếp, tháp công thành thì đắt và chậm
 * nhưng đổ quân lên tường theo hàng ngũ. Người chơi chỉ cân được cái đánh đổi ấy
 * nếu con số của từng cách hiện ra ngay cạnh cú tung, chứ không nằm im trong data.
 */
export const methodSource: ModifierSource = {
  id: METHOD_SOURCE_ID,
  domains: [ASSAULT_DOMAIN],
  compute(ctx) {
    const view = viewOf();
    if (view === null || view.side !== 'vay' || view.methodId === '') return null;
    const method = assaultMethodOf(view.methodId);
    if (method === null) return null;

    const lines: Modifier[] = [];
    if (method.attack !== 0) {
      lines.push({ label: method.name, source: METHOD_SOURCE_ID, ...scaleToSystem(ctx.system, method.attack) });
    }
    if (method.keepsFormation) {
      lines.push(bonusFor(ctx.system, `${method.name} — lên tường theo hàng ngũ`, 10, METHOD_SOURCE_ID));
    }
    if (view.forlorn) {
      lines.push(
        bonusFor(ctx.system, 'Đội tiên phong — những người tình nguyện lên trước', siegeConfig().assault.forlornHope.attack, METHOD_SOURCE_ID),
      );
    }
    return lines.length === 0 ? null : lines;
  },
};

// ---------------------------------------------------------------------------
// 5. MÙA (mục 3)
// ---------------------------------------------------------------------------

export const seasonSource: ModifierSource = {
  id: SEASON_SOURCE_ID,
  domains: [DISEASE_DOMAIN, SIEGE_MORALE_DOMAIN, MINE_DOMAIN, BOMBARD_DOMAIN, ASSAULT_DOMAIN],
  compute(ctx) {
    const view = viewOf();
    if (view === null) return null;
    const season = seasonOf(view.siege.seasonId);

    if (ctx.domain === DISEASE_DOMAIN) {
      if (season.disease === 0) return null;
      return [{ label: `${season.name} — ${season.note}`, source: SEASON_SOURCE_ID, ...scaleToSystem(ctx.system, season.disease) }];
    }
    if (ctx.domain === SIEGE_MORALE_DOMAIN) {
      if (season.morale === 0) return null;
      // Mùa đông đánh vào bên vây nặng hơn hẳn: bên thủ có mái nhà.
      const value = view.side === 'vay' ? season.morale : season.morale * 0.4;
      return [{ label: season.name, source: SEASON_SOURCE_ID, ...scaleToSystem(ctx.system, value) }];
    }
    if (season.id !== 'dong') return null;
    return [penaltyFor(ctx.system, 'Mùa đông: đất đóng băng, gỗ nứt, dây thừng cứng đơ', 14, SEASON_SOURCE_ID)];
  },
};

// ---------------------------------------------------------------------------
// 6. TIẾNG TÀN BẠO (mục 7) — hệ quả tác chiến để lại vết trên bản đồ chiến lược
// ---------------------------------------------------------------------------

/**
 * Đây là chỗ mục 7 KHÉP VÒNG LẠI, và nó là lý do cả chỉ số ấy tồn tại.
 *
 * Một chỉ huy đã cướp phá một thành thì thành sau không tin lời hứa của ông ta
 * nữa — không phải vì họ ghét ông ta, mà vì họ đã biết cái giá của việc mở cổng.
 * Nếu con số này chỉ nằm trong state mà không bao giờ hiện thành một dòng trước
 * mặt người chơi lúc họ ngồi vào bàn đàm phán, thì mục 7 chỉ là một dòng ghi sổ.
 */
export const reputationSource: ModifierSource = {
  id: REPUTATION_SOURCE_ID,
  domains: [PARLEY_DOMAIN],
  compute(ctx) {
    const view = viewOf();
    if (view === null || view.side !== 'vay') return null;
    const config = parleyConfig().modifiers;
    const lines: Modifier[] = [];

    if (view.siege.cruelty > 0) {
      const value = Math.max(config.crueltyFloor, (view.siege.cruelty / 10) * config.crueltyPer10);
      lines.push({
        label: `Tiếng tàn bạo (${Math.round(view.siege.cruelty)}) — trong kia đã nghe chuyện thành trước`,
        source: REPUTATION_SOURCE_ID,
        ...scaleToSystem(ctx.system, value),
      });
    }
    if (view.siege.mercy > 0) {
      const value = Math.min(config.mercyCap, (view.siege.mercy / 10) * config.mercyPer10);
      lines.push({
        label: `Tiếng nhân từ (${Math.round(view.siege.mercy)}) — lời hứa của ngài có người làm chứng`,
        source: REPUTATION_SOURCE_ID,
        ...scaleToSystem(ctx.system, value),
      });
    }
    if (view.siege.attacker.noQuarter) {
      lines.push(penaltyFor(ctx.system, 'Đã tuyên không tha một ai', -config.noQuarterDeclared, REPUTATION_SOURCE_ID));
    }
    if (view.siege.church < -15) {
      lines.push(
        penaltyFor(ctx.system, 'Giáo hội đã lên tiếng phản đối cuộc vây hãm này', -config.churchCondemned, REPUTATION_SOURCE_ID),
      );
    }
    return lines.length === 0 ? null : lines;
  },
};

// ---------------------------------------------------------------------------
// 6b. TƯƠNG QUAN LỰC LƯỢNG VÀ THỜI GIAN (mục 5)
// ---------------------------------------------------------------------------

/**
 * Bốn vế mục 5 kể tên cho một cuộc đàm phán: tương quan lực lượng, lương thực còn
 * lại, uy tín, tin tức về quân cứu viện. Lương và uy tín đã có nguồn riêng ở trên;
 * hai vế còn lại nằm ở đây, cùng với cái GIÁ của chính lời đề nghị.
 *
 * Vế cuối cùng ấy — `askWeight` — là vế dễ quên nhất và là vế làm cuộc đàm phán
 * thành một cuộc MẶC CẢ thay vì một cú tung may rủi: đòi nhiều thì khó được gật
 * đầu, và người chơi phải NHÌN THẤY con số ấy trong lúc còn đang chọn điều khoản.
 */
export const balanceSource: ModifierSource = {
  id: BALANCE_SOURCE_ID,
  domains: [PARLEY_DOMAIN],
  compute(ctx) {
    const view = viewOf();
    if (view === null) return null;
    const config = parleyConfig().modifiers;
    const lines: Modifier[] = [];

    const inside = view.siege.fort.garrison.reduce((sum, unit) => sum + unit.men, 0);
    const outside = view.siege.attacker.troops;
    if (inside > 0 && outside > 0) {
      const ratio = outside / inside;
      const raw = Math.max(-config.forceRatioCap, Math.min(config.forceRatioCap, (ratio - 1) * config.forceRatioPer));
      const value = view.side === 'vay' ? raw : -raw;
      if (Math.abs(value) >= 1) {
        lines.push({
          label: `Ngoài ${String(outside)} người, trong ${String(inside)} người`,
          source: BALANCE_SOURCE_ID,
          ...scaleToSystem(ctx.system, value),
        });
      }
    }

    const weeks = Math.min(config.weeksBesiegedCap, Math.floor(view.siege.week / 4) * config.weeksBesiegedPer4);
    if (weeks > 0) {
      lines.push({
        label: `Đã ${String(view.siege.week)} tuần — ai cũng mệt`,
        source: BALANCE_SOURCE_ID,
        ...scaleToSystem(ctx.system, view.side === 'vay' ? weeks : weeks * 0.5),
      });
    }

    if (view.siege.fort.lostLayers.length > 0) {
      lines.push({
        label: `Đã mất ${String(view.siege.fort.lostLayers.length)} lớp công sự`,
        source: BALANCE_SOURCE_ID,
        ...scaleToSystem(ctx.system, view.side === 'vay' ? config.layerLost : -config.layerLost),
      });
    }
    if (view.siege.attacker.outbreakWeeks > 0 && view.side === 'thu') {
      lines.push(bonusFor(ctx.system, 'Ngoài kia đang có dịch, họ cũng muốn xong sớm', config.plagueInside, BALANCE_SOURCE_ID));
    }

    if (view.askWeight > 0) {
      lines.push(penaltyFor(ctx.system, `Cái giá của những điều khoản đang đòi`, view.askWeight, BALANCE_SOURCE_ID));
    }

    return lines.length === 0 ? null : lines;
  },
};

// ---------------------------------------------------------------------------
// 7. QUÂN CỨU VIỆN (mục 3, mục 5)
// ---------------------------------------------------------------------------

export const reliefSource: ModifierSource = {
  id: RELIEF_SOURCE_ID,
  domains: [PARLEY_DOMAIN, SIEGE_MORALE_DOMAIN],
  compute(ctx) {
    const view = viewOf();
    if (view === null) return null;
    if (!view.siege.reliefIncoming && !view.siege.defender.reliefHope) return null;

    const label = view.siege.reliefIncoming
      ? `Quân cứu viện còn ${String(Math.max(0, view.siege.weeksToRelief))} tuần đường`
      : 'Trong thành vẫn tin là có người đang tới';
    const value = view.side === 'thu' ? 20 : -22;
    return [{ label, source: RELIEF_SOURCE_ID, ...scaleToSystem(ctx.system, value) }];
  },
};

// ---------------------------------------------------------------------------
// 8. HẾT HẠN NGHĨA VỤ (mục 3)
// ---------------------------------------------------------------------------

export const serviceSource: ModifierSource = {
  id: SERVICE_SOURCE_ID,
  domains: [SIEGE_MORALE_DOMAIN, ASSAULT_DOMAIN],
  compute(ctx) {
    const view = viewOf();
    if (view === null || view.side !== 'vay') return null;
    const days = view.siege.attacker.serviceDaysLeft;
    if (days > 14 || view.siege.attacker.levy <= 0) return null;
    return [
      penaltyFor(
        ctx.system,
        days <= 0 ? 'Hạn nghĩa vụ đã hết — chư hầu chỉ chờ được về' : `Còn ${String(days)} ngày là hết hạn nghĩa vụ`,
        days <= 0 ? 22 : 10,
        SERVICE_SOURCE_ID,
      ),
    ];
  },
};

// ---------------------------------------------------------------------------
// 9. DƯỚI LÒNG ĐẤT (mục 3 — minigame phản đào hầm)
// ---------------------------------------------------------------------------

/**
 * Bóng tối trong đường hầm, và cái ngoại lệ làm nó đáng có một nguồn riêng.
 *
 * Ở đây không có đội hình, không có tầm bắn, và không ai chạy được. Thứ duy nhất
 * còn quan trọng là CÓ NHÌN THẤY GÌ KHÔNG — nên một đội thợ Lùn hay Huyết Tộc
 * dưới hầm gần như bất khả chiến bại. Cả hai chiều đều in ra một dòng, đúng cùng
 * một lý do với dòng "ban đêm" của Phần 10 mục 9b: nếu bên nhìn được trong tối
 * không thấy chữ nào về bóng tối, người chơi sẽ kết luận là engine quên mất họ
 * đang ở dưới lòng đất.
 */
export const darkSource: ModifierSource = {
  id: DARK_SOURCE_ID,
  domains: [COUNTERMINE_DOMAIN, MINE_DOMAIN],
  compute(ctx) {
    const view = viewOf();
    if (view === null || !view.underground) return null;
    const config = counterMineConfig();
    if (view.nightSight) {
      return [bonusFor(ctx.system, 'Trong hầm tối: nhìn rõ như trên mặt đất', config.nightSightBonus, DARK_SOURCE_ID)];
    }
    return [
      penaltyFor(ctx.system, 'Trong hầm tối, một ngọn đèn dầu và bốn bước tầm mắt', -config.darkPenalty, DARK_SOURCE_ID),
    ];
  },
};

// ---------------------------------------------------------------------------
// Đăng ký
// ---------------------------------------------------------------------------

export const SIEGE_SOURCES: readonly ModifierSource[] = [
  hungerSource,
  hygieneSource,
  wallSource,
  densitySource,
  methodSource,
  seasonSource,
  reputationSource,
  balanceSource,
  reliefSource,
  serviceSource,
  darkSource,
];

/**
 * Đăng ký một lần lúc khởi động. Gọi lại lần nữa không nổ — `main.tsx` gọi lúc
 * boot, còn test gọi sau mỗi lần dọn registry.
 */
export function registerSiegeSources(): void {
  const already = new Set(modifierSources().map((source) => source.id));
  for (const source of SIEGE_SOURCES) {
    if (already.has(source.id)) continue;
    registerModifierSource(source);
  }
}

/** Chạy một phép kiểm trong một ảnh chụp, và luôn gỡ ảnh chụp xuống sau đó. */
export function withSiegeView<T>(view: SiegeView, run: () => T): T {
  publishSiege(view);
  try {
    return run();
  } finally {
    publishSiege(null);
  }
}

/** Ngữ cảnh chỉ-đọc cho những nơi cần biết nguồn đang thấy gì (tab Debug). */
export function describeView(): string {
  const view = viewOf();
  if (view === null) return 'không có cuộc vây hãm nào đang mở';
  return `tuần ${String(view.siege.week)} · ${view.side === 'vay' ? 'bên vây' : 'bên thủ'}${
    view.underground ? ' · dưới lòng đất' : ''
  }`;
}

export type { ModifierContext };
