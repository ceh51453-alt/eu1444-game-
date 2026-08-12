/**
 * SỰ KIỆN VÂY HÃM (Phần 11 mục 4).
 *
 * Mục 4 nói "mỗi sự kiện là một POPUP CÓ LỰA CHỌN", và chữ *lựa chọn* mới là chỗ
 * quan trọng: một cuộc vây hãm hai mươi tuần mà tuần nào cũng bấm đúng một nút là
 * hai mươi lần bấm không có quyết định nào. Bảng sự kiện là chỗ duy nhất cắt
 * ngang cái nhịp ấy, nên nó cũng là chỗ DỪNG nút tăng tốc của mục 3.
 *
 * MỘT SỰ KIỆN CÒN ĐANG MỞ THÌ TUẦN KHÔNG CHẠY TIẾP. `siege.pendingEvent` là một
 * cái chốt cứng, không phải một gợi ý cho UI: nếu tuần vẫn trôi trong lúc popup
 * còn treo thì người chơi sẽ chọn "chia quân ra chặn đường" sau khi quân cứu viện
 * đã tới nơi, và lựa chọn ấy chẳng có nghĩa gì nữa.
 *
 * HIỆU ỨNG LÀ DỮ LIỆU, KHÔNG PHẢI CODE. `applyEffects` là một bảng tra đóng, và
 * `data.ts` đã chặn mọi khoá lạ ngay lúc nạp — nên thêm một sự kiện mới vào
 * `siege-events.json` không phải sửa một dòng code nào (R5), còn gõ sai một khoá
 * thì nổ lúc khởi động chứ không im lặng chạy suốt cuộc vây hãm (R4).
 */

import type { Rng } from '@/core/rng';
import {
  allSiegeEvents,
  engineConfig,
  engineTypeOf,
  eventsConfig,
  rationOf,
  type SiegeEventDef,
  type SiegeEventOption,
} from './data';
import { killBesieger, killDefender } from './week';
import { liveEngines, type SiegeEventRecord, type SiegeSide, type SiegeState } from './types';

// ---------------------------------------------------------------------------
// Điều kiện
// ---------------------------------------------------------------------------

function conditionHolds(siege: SiegeState, key: string, want: number | boolean | string): boolean {
  switch (key) {
    case 'weekAtLeast':
      return siege.week >= Number(want);
    case 'reliefPossible':
      return siege.reliefPossible === Boolean(want) && !siege.reliefIncoming;
    case 'insideOnly':
      return true;
    case 'hasEngineTag':
      return liveEngines(siege).some((engine) => engineTypeOf(engine.typeId)?.tags.includes(String(want)) === true);
    case 'hygieneBelow':
      return siege.attacker.hygiene < Number(want);
    case 'defenderMoraleBelow':
      return siege.defender.garrisonMorale < Number(want);
    case 'populationMoraleBelow':
      return siege.defender.populationMorale < Number(want);
    case 'mercenaryUnpaid':
      return siege.attacker.mercenary > 0 && siege.attacker.mercenaryWeeksPaid <= 1;
    default:
      return false;
  }
}

export function eventAvailable(siege: SiegeState, event: SiegeEventDef): boolean {
  if ((siege.eventCooldown[event.id] ?? 0) > siege.week) return false;
  for (const [key, want] of Object.entries(event.when)) {
    if (key.startsWith('$')) continue;
    if (!conditionHolds(siege, key, want)) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Rút một sự kiện
// ---------------------------------------------------------------------------

/**
 * Một cú tung cho "có chuyện gì không", rồi một cú nữa cho "chuyện gì".
 *
 * Tách hai cú là cố ý: cú thứ nhất không phụ thuộc vào việc tuần này có bao nhiêu
 * sự kiện đủ điều kiện, nên tần suất sự kiện giữ nguyên khi bảng data dài thêm.
 * Nếu gộp làm một thì thêm sự kiện vào `siege-events.json` sẽ lặng lẽ làm cả trò
 * chơi nhiều biến cố hơn.
 */
export function rollEvent(siege: SiegeState, rng: Rng): SiegeEventRecord | null {
  const config = eventsConfig();
  const last = siege.events.at(-1);
  if (last !== undefined && siege.week - last.week < config.minWeekBetween) return null;
  if (rng.int(1, 100) > config.weeklyChance) return null;

  const pool = allSiegeEvents().filter((event) => eventAvailable(siege, event) && event.weight > 0);
  if (pool.length === 0) return null;

  const total = pool.reduce((sum, event) => sum + event.weight, 0);
  let ticket = rng.int(1, Math.max(1, Math.round(total * 100))) / 100;
  let picked = pool[0];
  for (const event of pool) {
    ticket -= event.weight;
    if (ticket <= 0) {
      picked = event;
      break;
    }
  }
  if (picked === undefined) return null;

  siege.eventCooldown[picked.id] = siege.week + config.sameEventCooldown;
  return {
    week: siege.week,
    eventId: picked.id,
    name: picked.name,
    text: picked.text,
    optionId: '',
    optionLabel: '',
    lines: [],
  };
}

export function eventDefOf(id: string): SiegeEventDef | null {
  return allSiegeEvents().find((event) => event.id === id) ?? null;
}

/** Lựa chọn dành cho bên này. Hai bảng hành động riêng biệt thì popup cũng thế. */
export function optionsFor(event: SiegeEventDef, side: SiegeSide): SiegeEventOption[] {
  return event.options.filter((option) => option.for === side);
}

// ---------------------------------------------------------------------------
// Áp hiệu ứng
// ---------------------------------------------------------------------------

function num(value: number | string | boolean | undefined): number {
  return typeof value === 'number' ? value : 0;
}

export function applyEffects(siege: SiegeState, rng: Rng, effects: Readonly<Record<string, number | string | boolean>>): string[] {
  const lines: string[] = [];

  for (const [key, raw] of Object.entries(effects)) {
    if (key.startsWith('$')) continue;
    switch (key) {
      case 'besiegerMorale':
        siege.attacker.morale = Math.max(0, Math.min(100, siege.attacker.morale + num(raw)));
        break;
      case 'defenderMorale':
        siege.defender.garrisonMorale = Math.max(0, Math.min(100, siege.defender.garrisonMorale + num(raw)));
        break;
      case 'populationMorale':
        siege.defender.populationMorale = Math.max(0, Math.min(100, siege.defender.populationMorale + num(raw)));
        break;
      case 'besiegerLoss': {
        const dead = killBesieger(siege, siege.attacker.troops * num(raw), 'disease');
        if (dead > 0) lines.push(`${String(dead)} người trong trại không qua khỏi.`);
        break;
      }
      case 'defenderLoss': {
        const dead = killDefender(siege, (siege.fort.population + 1) * num(raw), 'combat');
        if (dead > 0) lines.push(`Trong thành mất ${String(dead)} người.`);
        break;
      }
      case 'hygiene':
        siege.attacker.hygiene = Math.max(5, Math.min(100, siege.attacker.hygiene + num(raw)));
        break;
      case 'outbreak':
        siege.attacker.outbreakWeeks = Math.max(siege.attacker.outbreakWeeks, num(raw));
        break;
      case 'treasury':
        siege.attacker.treasury = Math.max(0, siege.attacker.treasury + num(raw));
        break;
      case 'campSupply':
        siege.attacker.supplies = Math.max(0, siege.attacker.supplies + num(raw));
        break;
      case 'defenderFood': {
        // Số ÂM NHỎ HƠN 1 là một TỶ LỆ của kho, số nguyên là phần lương tuyệt đối.
        // Kho lương cháy thì cháy một phần ba chứ không cháy đúng ba nghìn phần —
        // và một thành lớn với một thôn nhỏ không thể mất cùng một con số.
        const value = num(raw);
        const delta = Math.abs(value) < 1 ? siege.fort.supplies.food * value : value;
        siege.fort.supplies.food = Math.max(0, siege.fort.supplies.food + delta);
        break;
      }
      case 'materials':
        siege.fort.supplies.materials = Math.max(0, siege.fort.supplies.materials + num(raw));
        break;
      case 'wallIntegrity': {
        const wall = siege.fort.heldLayer === 'tuong-trong' ? siege.fort.innerWall : siege.fort.outerWall;
        if (wall !== null) wall.integrity = Math.max(0, Math.min(wall.maxIntegrity, wall.integrity + num(raw)));
        break;
      }
      case 'wells':
        siege.fort.wells = Math.max(0, siege.fort.wells + num(raw));
        break;
      case 'circumvallation':
        siege.attacker.circumvallation = Math.max(0, Math.min(3, siege.attacker.circumvallation + num(raw)));
        break;
      case 'engineDestroyed': {
        const alive = liveEngines(siege);
        for (let index = 0; index < num(raw) && alive.length > 0; index++) {
          const victim = alive.splice(rng.int(0, alive.length - 1), 1)[0];
          if (victim === undefined) break;
          victim.destroyed = true;
          lines.push(`${victim.name} không dùng được nữa.`);
        }
        break;
      }
      case 'engineRebuild': {
        const broken = siege.attacker.engines.find((engine) => engine.destroyed);
        if (broken !== undefined) {
          broken.destroyed = false;
          broken.built = false;
          // Dựng lại từ chỗ còn dùng được — nhanh hơn dựng mới, nhưng không miễn phí.
          broken.progress = engineConfig().rebuildFactor;
          lines.push(`${broken.name} được dựng lại từ chỗ còn dùng được.`);
        }
        break;
      }
      case 'bombardBonus':
        siege.attacker.bombardBonus += num(raw);
        break;
      case 'bombardPause':
        siege.attacker.bombardPause = Math.max(siege.attacker.bombardPause, num(raw));
        break;
      case 'mineProgress': {
        const shaft = siege.attacker.mines.find((entry) => !entry.collapsed && !entry.fired);
        if (shaft !== undefined) shaft.progress = Math.max(0, Math.min(1, shaft.progress + num(raw)));
        break;
      }
      case 'reliefIncoming':
        siege.reliefIncoming = Boolean(raw);
        siege.defender.reliefHope = Boolean(raw);
        break;
      case 'weeksToRelief':
        siege.weeksToRelief = num(raw);
        break;
      case 'truceWeeks':
        siege.truceWeeks = Math.max(siege.truceWeeks, num(raw));
        break;
      case 'cruelty':
        siege.cruelty = Math.max(0, siege.cruelty + num(raw));
        break;
      case 'mercy':
        siege.mercy = Math.max(0, siege.mercy + num(raw));
        break;
      case 'church':
        siege.church += num(raw);
        break;
      case 'noQuarter':
        siege.attacker.noQuarter = Boolean(raw);
        if (Boolean(raw)) lines.push('Lời tuyên "không tha một ai" đã nói ra trước cả hai đạo quân. Không rút lại được.');
        break;
      case 'sackPressure':
        siege.attacker.sackPressure = Math.max(0, siege.attacker.sackPressure + num(raw));
        break;
      case 'gateOpenChance':
        if (rng.int(1, 100) <= num(raw)) {
          siege.finished = true;
          siege.winner = 'vay';
          siege.ending = 'phan-boi-mo-cong';
          lines.push('Đêm thứ ba, một cánh cổng phụ mở ra và không ai trên tường kịp kêu.');
        } else {
          lines.push('Không thấy hắn quay lại. Sáng hôm sau có một cái xác treo trên tường.');
        }
        break;
      case 'rationLevel': {
        const id = String(raw);
        siege.defender.ration = rationOf(id).id;
        lines.push(`Khẩu phần hạ xuống mức ${rationOf(id).name.toLowerCase()}.`);
        break;
      }
      case 'mercenaryPaidWeeks':
        siege.attacker.mercenaryWeeksPaid = Math.max(siege.attacker.mercenaryWeeksPaid, num(raw));
        break;
      case 'mercenaryLeave': {
        const leaving = siege.attacker.mercenary;
        killBesieger(siege, leaving, 'departed');
        siege.attacker.mercenaryLeft = true;
        if (leaving > 0) lines.push(`${String(leaving)} lính đánh thuê rời khỏi vòng vây.`);
        break;
      }
      case 'speechCheck':
        // Phép kiểm thật do người gọi chạy (`holdHearts` ở bảng hành động bên thủ):
        // ở đây chỉ mở cửa, vì hiệu ứng của sự kiện phải là dữ liệu thuần.
        lines.push('Ngài bước ra trước đám đông. Việc còn lại là một phép kiểm hùng biện.');
        break;
      case 'endSiege':
        siege.finished = true;
        siege.ending = String(raw);
        siege.winner = String(raw) === 'bo-vay' ? 'thu' : '';
        lines.push('Cuộc vây hãm chấm dứt ở đây.');
        break;
      default:
        break;
    }
  }

  siege.attacker.morale = Math.max(0, Math.min(100, siege.attacker.morale));
  siege.defender.garrisonMorale = Math.max(0, Math.min(100, siege.defender.garrisonMorale));
  siege.defender.populationMorale = Math.max(0, Math.min(100, siege.defender.populationMorale));
  return lines;
}

/** Người chơi (hoặc engine) chốt một lựa chọn của popup đang treo. */
export function chooseEventOption(siege: SiegeState, rng: Rng, optionId: string): SiegeEventRecord | null {
  const pending = siege.pendingEvent;
  if (pending === null) return null;
  const def = eventDefOf(pending.eventId);
  if (def === null) {
    siege.pendingEvent = null;
    return null;
  }

  const option = def.options.find((entry) => entry.id === optionId) ?? def.options[0];
  if (option === undefined) {
    siege.pendingEvent = null;
    return null;
  }

  const lines = applyEffects(siege, rng, option.effects);
  const record: SiegeEventRecord = {
    ...pending,
    optionId: option.id,
    optionLabel: option.label,
    lines: [option.text, ...lines].filter((line) => line !== ''),
  };
  siege.events.push(record);
  siege.pendingEvent = null;
  siege.log.push({ week: siege.week, side: '', text: `${def.name}: ${option.label}`, major: true });
  for (const line of record.lines) siege.log.push({ week: siege.week, side: '', text: line });
  return record;
}

/**
 * Bên do engine cầm chọn thế nào.
 *
 * Một bộ luật ưu tiên ĐỌC ĐƯỢC, không phải một mô hình — cùng lý do với
 * `tactics.ts` của Phần 10: nếu engine chọn bằng một hàm không ai giải thích nổi
 * thì bài test mục 11 đo một thứ không ai giải thích nổi.
 */
export function autoChooseOption(siege: SiegeState, def: SiegeEventDef, forSide?: SiegeSide): string {
  const side = forSide ?? (siege.playerSide === 'vay' ? 'thu' : 'vay');
  const mine = optionsFor(def, side);
  const pool = mine.length > 0 ? mine : def.options;

  // Ưu tiên 1: đừng làm mất quân. Ưu tiên 2: đừng làm mất tiếng. Ưu tiên 3: rẻ nhất.
  const score = (option: SiegeEventOption): number => {
    const effects = option.effects;
    let value = 0;
    value -= num(effects['besiegerLoss']) * 400;
    value -= num(effects['defenderLoss']) * 400;
    value += num(effects['besiegerMorale']) * (side === 'vay' ? 2 : -1);
    value += num(effects['defenderMorale']) * (side === 'thu' ? 2 : -1);
    value += num(effects['populationMorale']) * (side === 'thu' ? 1.5 : 0);
    value -= num(effects['cruelty']) * 1.5;
    value += num(effects['mercy']);
    value += num(effects['church']) * 0.5;
    value += num(effects['treasury']) * 0.02;
    value += num(effects['hygiene']) * (side === 'vay' ? 1.5 : 0);
    if (effects['endSiege'] !== undefined) value -= 200;
    if (effects['mercenaryLeave'] !== undefined) value -= 150;
    return value;
  };

  let best = pool[0];
  for (const option of pool) {
    if (best === undefined || score(option) > score(best)) best = option;
  }
  return best?.id ?? '';
}
