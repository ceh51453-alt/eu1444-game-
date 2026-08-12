/**
 * QUÂN ĐỒN TRÚ & QUÂN DỊCH (Phần 12 mục 9, việc 12.7).
 *
 * > `số lượng và chất lượng = f(dân số, công trình quân sự, lòng dân, tước vị)`
 *
 * Bốn biến ấy đều có mặt ở đây, và mỗi cái làm một việc khác nhau:
 *
 *   **dân số**          — trần trên. Một cái thôn không nặn ra được năm trăm lính.
 *   **công trình**      — trần thật, và quyết định BINH CHỦNG. Không có trường bắn
 *                         thì không có cung thủ, dù có bao nhiêu dân đi nữa.
 *   **lòng dân**        — chất lượng và tỉ lệ hưởng ứng. Dân giận thì gọi không ai đi.
 *   **tước vị**         — SỐ ĐƠN VỊ ĐƯỢC CHỈ HUY, tra `data/units.json → command`
 *                         của Phần 10. Đây là chỗ Phần 13 sẽ sửa lại.
 *
 * BINH CHỦNG LÀ `data/units.json` CỦA PHẦN 10, KHÔNG PHẢI MỘT BẢNG RIÊNG. Nếu
 * Phần 12 tự khai một loại "lính đồn trú" riêng thì đội quân bước ra khỏi cổng
 * thành sẽ là một sinh vật khác với đội quân đứng trên tường, và cả hai phần đều
 * không sai — chúng chỉ không nói về cùng một đám người.
 *
 * CHIỀU ĐI MỘT CHIỀU: `holdings` sinh ra `GarrisonUnit[]` cho Phần 10 và 11
 * dùng. Không phần nào đọc ngược vào `holdings`.
 */

import { commandOf, unitTypeOf } from '@/minigames/battle/data';
import type { GarrisonUnit } from '@/systems/siege/types';
import { buildingOf, labourConfig, unrestFor, upkeepConfig } from './data';
import type { Holding } from './types';

export interface GarrisonSource {
  /** Id công trình sinh ra khối quân này. */
  buildingId: string;
  unitType: string;
  capacity: number;
  quality: number;
}

export interface GarrisonReport {
  units: GarrisonUnit[];
  men: number;
  /** Trần theo công trình, chưa trừ lòng dân. */
  capacity: number;
  /** Số đơn vị tước vị này được phép chỉ huy. 0 nghĩa là không giới hạn. */
  commandLimit: number;
  /** Chi phí nuôi quân mỗi tuần, tính bằng đồng. */
  upkeepPerWeek: number;
  sources: GarrisonSource[];
  /** Vì sao con số nhỏ hơn trần — câu để UI hiện. */
  notes: string[];
}

/**
 * Quân đồn trú của một thành trì.
 *
 * `titleId` tra vào bảng `command` của Phần 10: một hiệp sĩ chỉ huy một đơn vị,
 * một bá tước chỉ huy cả một cánh. Người chơi không tước vị vẫn giữ được thành,
 * nhưng chỉ điều được đúng một khối — và đó là một lý do rất cụ thể để đi tìm
 * một thái ấp.
 */
export function garrisonOf(holding: Holding, titleId = 'thuong-dan'): GarrisonReport {
  const upkeep = upkeepConfig();
  const unrest = unrestFor(holding.population.morale);
  const notes: string[] = [];

  const sources: GarrisonSource[] = [];
  let qualityBonus = 0;
  for (const placed of holding.buildings) {
    const building = buildingOf(placed.buildingId);
    const garrison = building?.garrison;
    if (building === null || garrison === undefined) continue;
    if (placed.integrity < upkeep.ruinedBelow) continue;
    qualityBonus += garrison.qualityBonus;
    if (garrison.capacity <= 0 || garrison.unitType === '') continue;
    sources.push({
      buildingId: building.id,
      unitType: garrison.unitType,
      capacity: garrison.capacity,
      quality: garrison.quality,
    });
  }

  const buildingCapacity = sources.reduce((sum, row) => sum + row.capacity, 0);

  // TRẦN THEO DÂN SỐ. Một thành trì không rút quá phần này ra khỏi ruộng mà vẫn
  // còn là một thành trì — vượt qua nó là chuyện của một cuộc TỔNG ĐỘNG VIÊN,
  // và cái giá của nó nằm ở `levy()` bên dưới chứ không nằm ở đây.
  const populationCap = holding.population.total * 0.12;
  const capacity = Math.min(buildingCapacity, populationCap);
  if (populationCap < buildingCapacity) {
    notes.push(
      `Công trình chứa nổi ${String(Math.round(buildingCapacity))} quân, nhưng ${String(Math.round(holding.population.total))} dân chỉ nuôi nổi ${String(Math.round(populationCap))}.`,
    );
  }

  // LÒNG DÂN quyết định bao nhiêu người thật sự ra trình diện.
  const turnout = Math.max(0.25, Math.min(1, holding.population.morale / 70));
  if (turnout < 1) {
    notes.push(`Lòng dân ${String(Math.round(holding.population.morale))} — chỉ ${String(Math.round(turnout * 100))} trên trăm người có mặt.`);
  }

  const command = commandOf(titleId);
  const commandLimit = command.units;

  const units: GarrisonUnit[] = [];
  let index = 0;
  let men = 0;
  let upkeepPerWeek = 0;
  const scale = buildingCapacity <= 0 ? 0 : (capacity * turnout) / buildingCapacity;

  for (const source of sources) {
    if (commandLimit > 0 && units.length >= commandLimit) {
      notes.push(`Tước vị "${command.name}" chỉ chỉ huy được ${String(commandLimit)} đơn vị — số còn lại ở lại trong thành.`);
      break;
    }
    const strength = Math.round(source.capacity * scale);
    if (strength <= 0) continue;
    index++;
    const unitType = unitTypeOf(source.unitType);
    const quality = Math.max(1, Math.min(5, source.quality + Math.round(qualityBonus))) as 1 | 2 | 3 | 4 | 5;
    units.push({
      id: `unit_don-tru_${String(index)}`,
      typeId: source.unitType,
      name: unitType?.name ?? source.unitType,
      men: strength,
      quality,
    });
    men += strength;
    upkeepPerWeek += strength * (unitType?.upkeep ?? 1) * 0.1;
  }

  if (unrest.id === 'bao-loan' || unrest.id === 'bo-tron') {
    notes.push('Dân đang bạo loạn — quân đồn trú phải canh chính dân mình.');
  }

  return { units, men, capacity, commandLimit, upkeepPerWeek, sources, notes };
}

// ---------------------------------------------------------------------------
// Gọi quân
// ---------------------------------------------------------------------------

export interface LevyResult {
  holding: Holding;
  men: number;
  /** Nhân công mất đi vì gọi quân — con số này ăn thẳng vào công trường. */
  labourLost: number;
  reason: string;
}

/**
 * Gọi quân (mục 9).
 *
 * "Gọi quân làm giảm nhân công và sản lượng. Gọi quá nhiều quá lâu là kiệt quệ."
 * Cả hai vế nằm trong state chứ không nằm trong lời: `levied` trừ thẳng vào nhân
 * lực ở `labourOf()`, và `levyWeeks` đếm tuần để `moraleTarget()` phạt khi vượt
 * `levyExhaustionWeeks`.
 */
export function levy(holding: Holding, men: number): LevyResult {
  const config = labourConfig();
  const workforce = holding.population.total * config.workforceShare;
  const wanted = Math.max(0, Math.round(men));
  // Trần tổng động viên: một phần ba nhân lực. Vượt qua là thành trì ngừng hoạt
  // động chứ không phải "có thêm quân", nên engine chặn cứng thay vì để người
  // chơi trượt vào một trạng thái không hồi được.
  const cap = Math.floor(workforce / 3);
  const taken = Math.min(wanted, cap);

  return {
    men: taken,
    labourLost: taken * config.levyWorkerCost,
    reason: taken < wanted ? `Không gọi quá ${String(cap)} người mà thành trì còn sống được.` : '',
    holding: {
      ...holding,
      population: { ...holding.population, levied: taken, levyWeeks: taken > 0 ? holding.population.levyWeeks : 0 },
    },
  };
}

/** Cho quân về. Nhân công trở lại ngay, lòng dân thì phải trôi. */
export function dismissLevy(holding: Holding): Holding {
  return { ...holding, population: { ...holding.population, levied: 0, levyWeeks: 0 } };
}

/**
 * SỐ NGÀY QUÂN DỊCH MỖI NĂM — **chính là con số hạn nghĩa vụ mà Phần 11 dùng khi
 * đi vây thành** (mục 9, câu cuối).
 *
 * Nó nằm ở `obligations.serviceDaysPerYear` của thành trì, tức là ở tầng thành
 * trì, và Phần 11 đọc nó qua đây. Phần 13 sẽ là nơi con số ấy được ĐẶT RA, vì
 * đặt nghĩa vụ là một động từ của lãnh thổ.
 */
export function serviceDays(holding: Holding): number {
  return holding.obligations.serviceDaysPerYear;
}
