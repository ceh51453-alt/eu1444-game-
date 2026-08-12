/**
 * BỐN NGUỒN MODIFIER CỦA PHẦN 16 (mục 19 việc 12) — cắm vào registry Phần 5.
 *
 *   `items.trang-bi`    vế `+ trang bị` của công thức d100, đã tính tay nghề
 *   `items.vua-nguoi`   phạt AGI và tốc độ của bộ giáp không vừa (mục 8)
 *   `items.trong-luong` tải và PHÂN BỔ tải (mục 9)
 *   `items.phu-phep`    hiệu ứng của rune, dệt Tiên, thánh vật (mục 14)
 *
 * Mục 1d nói thẳng: MỌI HIỆU ỨNG đăng ký qua registry, không tính riêng. Nếu
 * bản đồ che phủ hay mức vừa người tự cộng vào một cú tung ở đâu đó trong Phần
 * 9, dòng ấy sẽ không có mặt trong `CheckResult.modifiers` — và người chơi mặc
 * một bộ giáp cướp được, thấy mình hỏng liên tục, mà không bao giờ biết vì sao.
 * Game này không có reroll, nên minh bạch không phải một tính năng đẹp mà là
 * điều kiện để người chơi còn chơi tiếp (README mục 8.4).
 *
 * BỐN NGUỒN CHỈ CHẠY CHO NGƯỜI CHƠI. `ctx.actor` rỗng là quy ước của Phần 5, và
 * trang bị của NPC sống trong `Fighter.loadout` của Phần 9 chứ không ở state.
 */

import {
  domainMatches,
  modifierSources,
  registerModifierSource,
  type Modifier,
  type ModifierContext,
  type ModifierSource,
} from '@/systems/check/registry';
import { scaleToSystem } from '@/systems/check/sources';
import { enchantmentOf, itemName, qualityByLevel } from './data';
import { fitPenaltyOf, wearerOfState } from './fit';
import { equipmentOf, itemsOf, packedItems, wornItems } from './slice';
import { weightOfItem } from './item';
import { buildLoad } from './weight';
import { wornFromItems } from './coverage';
import type { Item } from './types';

export const GEAR_SOURCE_ID = 'items.trang-bi';
export const FIT_SOURCE_ID = 'items.vua-nguoi';
export const LOAD_SOURCE_ID = 'items.trong-luong';
export const ENCHANT_SOURCE_ID = 'items.phu-phep';

/** Trang bị của NGƯỜI CHƠI, hoặc rỗng khi phép kiểm là của một NPC. */
function playerGear(ctx: ModifierContext): Item[] {
  if (ctx.actor !== '') return [];
  if (itemsOf(ctx.state) === null) return [];
  return wornItems(ctx.state);
}

// ---------------------------------------------------------------------------
// 1. Tay nghề của món đang cầm
// ---------------------------------------------------------------------------

/**
 * Vế `+ trang bị` mà Phần 6 mục 1 đã chừa sẵn trong công thức d100.
 *
 * Phần 6 cộng nó từ `data/gear.json` cho trang bị KHAI BÁO; ở đây là bản thật,
 * đọc từ vật phẩm cụ thể — nên nó biết cả tình trạng và hư hỏng. Một thanh kiếm
 * kiệt tác đã cong lưỡi không còn là một thanh kiếm kiệt tác.
 */
const gearSource: ModifierSource = {
  id: GEAR_SOURCE_ID,
  domains: ['combat.*', 'skill.*'],
  compute(ctx) {
    const worn = playerGear(ctx);
    if (worn.length === 0) return null;

    const lines: Modifier[] = [];
    for (const item of worn) {
      if (item.kind !== 'vu-khi' && item.kind !== 'khien') continue;
      const quality = qualityByLevel(item.quality);
      // Tình trạng ăn vào tay nghề theo cùng đường cong với sức xuyên ở
      // `resolve.ts`: đồ cũ yếu đi, nhưng không bao giờ về 0.
      const wear = 0.6 + 0.4 * (item.condition / 100);
      const value = Math.round(quality.bonus * wear) - item.damage.length * 3;
      if (value === 0) continue;
      lines.push({ label: item.name, source: GEAR_SOURCE_ID, ...scaleToSystem(ctx.system, value) });
    }
    return lines.length === 0 ? null : lines;
  },
};

// ---------------------------------------------------------------------------
// 2. Vừa người (mục 8)
// ---------------------------------------------------------------------------

/**
 * Bộ giáp không phải của ngài thì ngài chậm hơn, và ngài phải đọc được điều đó.
 *
 * Đây là dòng làm cho mục 8 có nghĩa với người chơi: không có nó thì cướp được
 * một bộ giáp tấm là một món hời không có mặt trái nào nhìn thấy được.
 */
const fitSource: ModifierSource = {
  id: FIT_SOURCE_ID,
  domains: ['combat.*', 'skill.nhao-lon', 'skill.leo-treo', 'skill.boi-loi', 'skill.len-lut'],
  compute(ctx) {
    const worn = playerGear(ctx);
    if (worn.length === 0) return null;

    const penalty = fitPenaltyOf(
      worn.map((item) => ({
        itemId: item.templateId,
        fitTo: item.fitTo,
        fitShape: item.fitShape ?? null,
      })),
      wearerOfState(ctx.state),
    );
    if (penalty.agi === 0) return null;

    return [
      {
        label: penalty.refused.length > 0 ? 'Giáp không vừa người' : 'Giáp mượn của người khác',
        source: FIT_SOURCE_ID,
        ...scaleToSystem(ctx.system, penalty.agi),
      },
    ];
  },
};

// ---------------------------------------------------------------------------
// 3. Trọng lượng có phân bổ (mục 9)
// ---------------------------------------------------------------------------

/**
 * Tải nặng phạt vào những việc cần thân người nhẹ.
 *
 * KHÔNG phạt vào `combat.*`: trong một trận đấu, tải hiện ra qua THỂ LỰC mỗi
 * hiệp (`fatiguePerRound` của Phần 9) chứ không qua cú tung. Phạt cả hai chỗ là
 * phạt hai lần một chuyện, và người mặc giáp tấm sẽ vừa mệt nhanh vừa đánh trượt
 * — mà lịch sử thì nói ngược lại: họ đánh rất tốt, chỉ không đánh được lâu.
 */
const loadSource: ModifierSource = {
  id: LOAD_SOURCE_ID,
  domains: ['skill.boi-loi', 'skill.leo-treo', 'skill.nhao-lon', 'skill.len-lut', 'skill.the-luc', 'skill.chiu-dung'],
  compute(ctx) {
    const worn = playerGear(ctx);
    if (worn.length === 0) return null;

    const extraKg = packedItems(ctx.state).reduce((sum, item) => sum + weightOfItem(item), 0);
    const load = buildLoad(wornFromItems(worn), {
      belted: equipmentOf(ctx.state)?.belted ?? true,
      extraKg,
    });
    if (load.totalKg <= 0) return null;

    // Bơi là chỗ tải giết người thật sự (mục 9), nên nó có thang riêng và nặng
    // hơn hẳn phần còn lại.
    const penalty = domainMatches('skill.boi-loi', ctx.domain) ? -load.swimPenalty : -load.speedPenalty;
    if (penalty === 0) return null;

    return [
      {
        label: `Mang ${String(Math.round(load.totalKg))} kg${load.shoulderKg > 0 ? ` (${String(Math.round(load.shoulderKg))} kg trên vai)` : ''}`,
        source: LOAD_SOURCE_ID,
        ...scaleToSystem(ctx.system, penalty),
      },
    ];
  },
};

// ---------------------------------------------------------------------------
// 4. Phù phép (mục 14)
// ---------------------------------------------------------------------------

/**
 * Hiệu ứng của rune, dệt Tiên và thánh vật.
 *
 * VẬT BỊ NGUYỀN GIẤU MẶT TRÁI: dòng âm chỉ hiện lên sau `hiddenUntilTurns`, và
 * trước đó người chơi chỉ thấy mọi người xung quanh lạnh nhạt dần mà không hiểu
 * vì sao (mục 14). Đó là chỗ DUY NHẤT trong cả dự án một dòng modifier được
 * phép không hiện ra — và nó được phép vì chính lời nguyền là nội dung.
 */
const enchantSource: ModifierSource = {
  id: ENCHANT_SOURCE_ID,
  domains: ['*'],
  compute(ctx) {
    const worn = playerGear(ctx);
    if (worn.length === 0) return null;

    const turn = typeof ctx.state?.meta.turn === 'number' ? ctx.state.meta.turn : 0;
    const lines: Modifier[] = [];

    for (const item of worn) {
      const enchantment = item.enchantment === '' ? null : enchantmentOf(item.enchantment);
      if (enchantment === null) continue;

      const carried = item.history.length;
      const revealed = !enchantment.cursed || turn >= enchantment.hiddenUntilTurns + carried;

      for (const effect of enchantment.modifiers) {
        if (!effect.domains.some((pattern) => domainMatches(pattern, ctx.domain))) continue;
        if (effect.whenAnyTag.length > 0 && !effect.whenAnyTag.some((tag) => ctx.tags.includes(tag))) continue;
        if (effect.value < 0 && !revealed) continue;
        if (effect.kind === 'dieShift') {
          lines.push({ label: `${enchantment.name} — ${itemName(item.templateId)}`, value: effect.value, kind: 'dieShift', source: ENCHANT_SOURCE_ID });
          continue;
        }
        lines.push({ label: effect.label, source: ENCHANT_SOURCE_ID, ...scaleToSystem(ctx.system, effect.value) });
      }
    }
    return lines.length === 0 ? null : lines;
  },
};

// ---------------------------------------------------------------------------
// Đăng ký
// ---------------------------------------------------------------------------

const ITEM_SOURCES: readonly ModifierSource[] = [gearSource, fitSource, loadSource, enchantSource];

export function registerItemSources(): void {
  const already = new Set(modifierSources().map((source) => source.id));
  for (const source of ITEM_SOURCES) {
    if (already.has(source.id)) continue;
    registerModifierSource(source);
  }
}
