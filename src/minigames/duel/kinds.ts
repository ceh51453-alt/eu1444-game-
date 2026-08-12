/**
 * SÁU LOẠI HÌNH QUYẾT ĐẤU VÀ ĐIỀU KIỆN KẾT THÚC (Phần 9 mục 9).
 *
 * Đây là chỗ một minigame dễ làm hời hợt nhất. Nếu mọi trận đều đánh tới khi
 * một bên gục thì đấu tập, đấu danh dự và đấu sinh tử là cùng một trò với ba cái
 * tên khác nhau. Cái phân biệt chúng KHÔNG phải sát thương — nó là CỬA RA: đấu
 * danh dự dừng ở giọt máu đầu tiên, đấu giải có trọng tài, phục kích thì không
 * có chuyện đầu hàng, và quyết đấu tư pháp thì thua là thua kiện.
 *
 * `kind.endOn` trong `data/arenas.json` liệt kê đúng những cửa mà loại ấy có.
 * Hàm dưới đây chỉ hỏi từng cửa một theo thứ tự nặng-trước; một cửa không có
 * trong `endOn` thì dù điều kiện đã chạm cũng không mở.
 */

import { consciousnessOf } from '@/systems/body/vitals';
import { endingName, kindOf, woundConfig, type DuelKind } from './data';
import { fighterOf, otherSide, type DuelState, type Fighter, type SideId } from './types';

export interface EndVerdict {
  ending: string;
  endingName: string;
  /** Bên thắng. Rỗng nghĩa là không phân thắng bại. */
  winner: SideId | '';
  /** Một câu engine ghi vào biên niên. */
  summary: string;
}

/** Đấu sĩ đã chết chưa — hai đường của Phần 7 mục 9 mà một trận đấu chạm tới. */
export function isDead(fighter: Fighter): boolean {
  if (fighter.body.dead) return true;
  if (fighter.body.blood <= woundConfig().deathBlood) return true;
  return fighter.body.injuries.some((injury) => injury.organDestroyed !== undefined);
}

/** Đã gục: hết máu, hết ý thức, hoặc mang một vết chí mạng. */
export function isDown(fighter: Fighter, turn: number): boolean {
  const config = woundConfig();
  if (fighter.body.blood <= config.downBlood) return true;
  if (config.downConsciousness.includes(consciousnessOf(fighter.body, fighter.stats.wil, turn).id)) return true;
  return fighter.body.injuries.some((injury) => injury.severity >= config.downSeverity);
}

function worstSeverity(fighter: Fighter): number {
  return fighter.body.injuries.reduce((max, injury) => Math.max(max, injury.severity), 0);
}

function verdict(ending: string, winner: SideId | '', summary: string): EndVerdict {
  return { ending, endingName: endingName(ending), winner, summary };
}

/**
 * Trận này xong chưa, và xong bằng cửa nào.
 *
 * Thứ tự hỏi là NẶNG TRƯỚC: chết, rồi gục, rồi mới tới những cửa mềm. Một người
 * vừa gục vừa buông vũ khí thì biên niên phải ghi là gục — cửa nhẹ hơn che mất
 * cửa nặng là cách nhanh nhất để một cái chết biến thành "mất vũ khí".
 */
export function endVerdict(duel: DuelState): EndVerdict | null {
  const kind = kindOf(duel.kindId);
  if (kind === null) return null;
  const allowed = new Set(kind.endOn);

  for (const side of ['a', 'b'] as const) {
    const fighter = fighterOf(duel, side);
    const foe = otherSide(side);

    if (allowed.has('chet') && kind.lethal && isDead(fighter)) {
      return verdict('chet', foe, `${fighter.name} chết ở hiệp ${duel.round - 1}.`);
    }
    if (allowed.has('nga-guc') && isDown(fighter, duel.turn)) {
      return verdict('nga-guc', foe, `${fighter.name} gục ở hiệp ${duel.round - 1}.`);
    }
  }

  for (const side of ['a', 'b'] as const) {
    const fighter = fighterOf(duel, side);
    const foe = otherSide(side);

    if (allowed.has('chiu-thua') && kind.yieldAllowed && fighter.yielded) {
      return verdict('chiu-thua', foe, `${fighter.name} chịu thua.`);
    }
    if (allowed.has('ra-khoi-vong') && fighter.leftArena) {
      return verdict('ra-khoi-vong', foe, `${fighter.name} bước ra khỏi vòng.`);
    }
    if (allowed.has('mat-vu-khi') && fighter.disarmed) {
      return verdict('mat-vu-khi', foe, `${fighter.name} không còn vũ khí trong tay.`);
    }
    if (allowed.has('do-mau') && kind.firstBloodEnds && fighter.bled) {
      return verdict('do-mau', foe, `Máu đã đổ — danh dự coi như đã rửa.`);
    }
  }

  if (allowed.has('trong-tai-dung') && kind.refereeAt > 0) {
    for (const side of ['a', 'b'] as const) {
      const fighter = fighterOf(duel, side);
      if (worstSeverity(fighter) < kind.refereeAt) continue;
      return verdict('trong-tai-dung', otherSide(side), `Trọng tài xen vào: ${fighter.name} đã bị thương quá mức cho phép.`);
    }
  }

  if (duel.round > kind.maxRounds) {
    return verdict('het-hiep', pointsWinner(duel), 'Hết giờ. Không ai dứt điểm được ai.');
  }

  return null;
}

/**
 * Xử theo điểm khi hết hiệp.
 *
 * Không xử theo "ai còn nhiều máu hơn": một trận mà cả hai gần như không chạm
 * được vào nhau thì máu bằng nhau và người chơi nhận về một kết quả ngẫu nhiên.
 * Xử theo TỔNG mức độ thương tích đã gây ra, rồi mới tới thế trận — hai thứ
 * người xem thật sự nhìn thấy.
 */
export function pointsWinner(duel: DuelState): SideId | '' {
  const damage = (fighter: Fighter): number =>
    fighter.body.injuries.reduce((sum, injury) => sum + injury.severity, 0);

  const dealtByA = damage(duel.b);
  const dealtByB = damage(duel.a);
  if (dealtByA !== dealtByB) return dealtByA > dealtByB ? 'a' : 'b';
  if (duel.a.tempo !== duel.b.tempo) return duel.a.tempo > duel.b.tempo ? 'a' : 'b';
  return '';
}

/** Bên tấn công của một trận phục kích có hiệp mở màn miễn phí (mục 9). */
export function hasFreeOpening(kind: DuelKind): boolean {
  return kind.freeOpeningRound;
}

/** Có ai đó ngoài cuộc nhảy vào — cửa `can-thiep` của mục 9. */
export function intervene(duel: DuelState, favours: SideId | '', who: string): EndVerdict | null {
  const kind = kindOf(duel.kindId);
  if (kind === null || !kind.endOn.includes('can-thiep')) return null;
  return verdict('can-thiep', favours, `${who} nhảy vào giữa hai người.`);
}
