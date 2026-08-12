/**
 * HỆ CHỦNG TỘC XEN KẼ — Phần 14 mục 3, hệ thống BẮT BUỘC.
 *
 * Bốn chính sách, và cái thứ tư khác hẳn ba cái kia: TRỌNG DỤNG, DUNG NẠP và
 * THUẾ RIÊNG đều đảo ngược được — đổi lại chính sách tử tế thì oán hận nguôi dần
 * và đóng góp hồi lại. TRUY BỨC thì không: nó hạ TRẦN của `usefulness` xuống và
 * trần ấy không bao giờ nâng lên nữa, vì người đã đi thì đã đi. Đó là cách câu
 * "mất VĨNH VIỄN đóng góp kinh tế của nhóm đó" sống trong dữ liệu chứ không sống
 * trong một dòng chú thích.
 *
 * BA HỆ QUẢ mà mục 3 đòi, và cả ba đều ở file này:
 *   1. oán hận cao + tỷ lệ dân số cao  → NỔI DẬY SẮC TỘC (hai vế NHÂN nhau)
 *   2. bị truy bức ở nước A            → CHẠY SANG nước B, mang theo tay nghề
 *   3. cùng một hệ thống, hai hướng    → Orc dùng nó để biến thiểu số thành tinh nhuệ
 *
 * Vế 3 không cần mã riêng, và đó là bằng chứng hệ này đúng: `trong-dung` với
 * `manpowerFactor` 1.35 chính là cơ chế chiêu mộ dị tộc nhìn từ phía bảng dân số.
 */

import type { Rng } from '@/core/rng';
import { migrationConfig, policyOf, powerName, revoltConfig, settablePolicies } from './data';
import type { ExileCommunity, MinorityStatus, PopulationGroup, PowerState, RelationRow } from './types';

export class DemographyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DemographyError';
  }
}

/** Một nhóm rời đi trong năm, chưa biết sẽ tới đâu. Nơi đến do tầng thế giới chọn. */
export interface Departure {
  raceId: string;
  fromPowerId: string;
  /** Điểm phần trăm dân số đã rời — cùng đơn vị với `population`, nhân 100. */
  sharePoints: number;
  people: number;
  usefulness: number;
  grievance: number;
}

export interface DemographyYear {
  groups: PopulationGroup[];
  treasury: number;
  stability: number;
  dominantMood: number;
  departures: Departure[];
  revolts: { raceId: string; risk: number }[];
  lines: string[];
}

/** Nhóm dân khởi đầu từ một dòng data. */
export function createGroup(row: {
  raceId: string;
  population: number;
  status: MinorityStatus;
  grievance: number;
  usefulness: number;
}): PopulationGroup {
  const policy = policyOf(row.status);
  if (policy === null) throw new DemographyError(`chính sách "${row.status}" chưa khai trong data`);
  return {
    raceId: row.raceId,
    population: row.population,
    status: row.status,
    grievance: row.grievance,
    usefulness: row.usefulness,
    usefulnessCeiling: 100,
    persecutedSinceYear: 0,
  };
}

/**
 * ĐỔI CHÍNH SÁCH với một nhóm.
 *
 * Chuyển SANG truy bức là chỗ duy nhất của cả hệ có hiệu ứng một-chiều: tịch thu
 * được một khoản ngay, và trần đóng góp hạ xuống vĩnh viễn. Chuyển RA KHỎI truy
 * bức không nâng trần lại — nó chỉ ngừng làm cho mọi thứ tệ thêm.
 */
export function setPolicy(
  group: PopulationGroup,
  status: MinorityStatus,
  year: number,
  incomeBase = 1000,
): { group: PopulationGroup; seized: number; line: string } {
  const policy = policyOf(status);
  if (policy === null) throw new DemographyError(`chính sách "${status}" chưa khai trong data`);
  if (!policy.settable) {
    throw new DemographyError(`"${policy.name}" là trạng thái thừa hưởng, không đặt được — mục 3 chỉ cho đặt bốn chính sách`);
  }
  if (group.status === status) return { group, seized: 0, line: '' };

  const seized = policy.seizureOnce > 0 ? Math.round(policy.seizureOnce * incomeBase * group.population * (group.usefulness / 100)) : 0;
  const ceiling =
    policy.permanentUsefulnessFloor
      ? Math.min(group.usefulnessCeiling, policy.usefulnessCap)
      : group.usefulnessCeiling;

  return {
    group: {
      ...group,
      status,
      usefulnessCeiling: ceiling,
      usefulness: Math.min(group.usefulness, ceiling),
      persecutedSinceYear: policy.permanentUsefulnessFloor && group.persecutedSinceYear === 0 ? year : group.persecutedSinceYear,
    },
    seized,
    line:
      seized > 0
        ? `Tài sản của nhóm này bị tịch thu: ${String(seized)}. Trần đóng góp của họ hạ xuống ${String(ceiling)} và sẽ không lên lại.`
        : `Chính sách với nhóm này đổi sang "${policy.name}".`,
  };
}

/** Đóng góp kinh tế của cả thế lực: hệ số nhân vào thu nhập. */
export function contributionOf(power: PowerState): number {
  let factor = 0;
  for (const group of power.groups) {
    const policy = policyOf(group.status);
    if (policy === null) continue;
    factor += group.population * (group.usefulness / 100) * policy.taxFactor;
  }
  return factor;
}

/** Nhân lực huy động được, tính bằng hệ số trên dân số danh nghĩa. */
export function manpowerOf(power: PowerState): number {
  let factor = 0;
  for (const group of power.groups) {
    const policy = policyOf(group.status);
    if (policy === null) continue;
    factor += group.population * policy.manpowerFactor * (1 - group.grievance / 200);
  }
  return factor;
}

/**
 * NGUY CƠ NỔI DẬY SẮC TỘC.
 *
 * Hai vế NHÂN nhau chứ không cộng, và đó là cả nội dung của câu trong mục 3: một
 * nhóm 2% dân với oán hận 100 thì gây rắc rối chứ không lật được ai; một nhóm
 * 30% dân với oán hận 60 thì lật được.
 */
export function revoltRisk(group: PopulationGroup): number {
  const config = revoltConfig();
  if (group.grievance < config.grievanceFloor) return 0;
  const over = group.grievance - config.grievanceFloor;
  // Sàn 0,15 để một nhóm rất nhỏ vẫn gây được rắc rối — nhưng chỉ rắc rối.
  const weight = Math.max(0.15, group.population * config.populationWeight);
  return Math.min(config.riskCap, Math.round(over * config.riskPerGrievancePoint * weight));
}

/**
 * MỘT NĂM của bảng dân số.
 *
 * Không tung xúc sắc trừ lúc kiểm nổi dậy: chính sách là thứ tích lũy đều đặn,
 * và biến nó thành một cú tung mỗi năm sẽ làm người chơi không bao giờ đọc được
 * hệ quả của lựa chọn mình vừa làm.
 */
export function advanceDemographics(rng: Rng, power: PowerState, year: number): DemographyYear {
  const config = revoltConfig();
  const migration = migrationConfig();
  const lines: string[] = [];
  const departures: Departure[] = [];
  const revolts: { raceId: string; risk: number }[] = [];
  let treasury = 0;
  let stability = 0;
  let dominantMood = 0;

  const groups = power.groups.map((group) => {
    if (group.raceId === dominantRaceOf(power)) return group;
    const policy = policyOf(group.status);
    if (policy === null) return group;

    let next: PopulationGroup = {
      ...group,
      grievance: clampMeter(group.grievance + policy.grievancePerYear),
      usefulness: Math.max(0, Math.min(Math.min(policy.usefulnessCap, group.usefulnessCeiling), group.usefulness + policy.usefulnessPerYear)),
      // Năm đầu tiên bị truy bức là một cái mốc, không phải một trạng thái: Phần
      // 15 đọc nó để biết cộng đồng lưu vong đã nuôi hận bao nhiêu thế hệ.
      persecutedSinceYear:
        policy.permanentUsefulnessFloor && group.persecutedSinceYear === 0 ? year : group.persecutedSinceYear,
      usefulnessCeiling: policy.permanentUsefulnessFloor
        ? Math.min(group.usefulnessCeiling, policy.usefulnessCap)
        : group.usefulnessCeiling,
    };
    dominantMood += policy.dominantMoodPerYear;

    // Di cư: người bỏ đi trước khi có ai nổi dậy. Đây là vế "chạy sang nước B"
    // của mục 3, và nó chảy ra ngoài qua `departures` chứ không tự tìm nơi đến —
    // chọn nơi đến cần nhìn cả châu lục, và bảng dân số của một nước thì không.
    //
    // `emigrationPerYear` là PHẦN TRĂM CỦA CHÍNH NHÓM ẤY, không phải phần trăm dân
    // số cả nước: 9%/năm của một nhóm chiếm 4% dân là 0,36 điểm phần trăm — một
    // dòng người đủ lớn để thấy trên bảng và đủ nhỏ để mất mười năm mới xong.
    const leaving = next.population * (policy.emigrationPerYear / 100) * (0.5 + next.grievance / 100);
    if (leaving * 100 >= migration.minSharePointToMove && next.population > leaving) {
      const sharePoints = Math.min(next.population, leaving) * 100;
      next = { ...next, population: next.population - sharePoints / 100 };
      departures.push({
        raceId: next.raceId,
        fromPowerId: power.id,
        sharePoints,
        people: Math.round(sharePoints * migration.peoplePerSharePoint),
        usefulness: next.usefulness,
        grievance: next.grievance,
      });
      lines.push(`${String(Math.round(sharePoints * migration.peoplePerSharePoint))} người ${next.raceId} rời ${powerName(power.id)}.`);
    }

    const risk = revoltRisk(next);
    if (risk > 0) {
      revolts.push({ raceId: next.raceId, risk });
      if (rng.int(1, 100) <= risk) {
        treasury += config.treasuryHit;
        stability += config.stabilityHit;
        next = {
          ...next,
          grievance: clampMeter(next.grievance + config.grievanceAfterCrush),
          usefulness: Math.max(0, next.usefulness + config.usefulnessAfterCrush),
        };
        lines.push(`NỔI DẬY SẮC TỘC: nhóm ${next.raceId} cầm vũ khí ở ${powerName(power.id)} (nguy cơ ${String(risk)}%).`);
      }
    }

    return next;
  });

  return { groups, treasury, stability, dominantMood, departures, revolts, lines };
}

/** Tộc thống trị: nhóm đầu tiên có `trong-dung` và tỷ lệ lớn nhất. */
export function dominantRaceOf(power: PowerState): string {
  let best: PopulationGroup | null = null;
  for (const group of power.groups) {
    if (best === null || group.population > best.population) best = group;
  }
  return best?.raceId ?? '';
}

/**
 * NƠI ĐẾN của một dòng di dân.
 *
 * Ba vế, đúng thứ tự quan trọng: nước đó đối xử thế nào với CHÍNH TỘC ẤY, quan hệ
 * giữa hai nước, và cuối cùng mới tới quy mô. Một nhóm bị đuổi khỏi Frank sẽ đi
 * tới chỗ nào đang trọng dụng họ — và đó thường là Đế quốc Orc, đúng như mục 3
 * nói về "cùng một hệ thống dùng theo hai hướng đối lập".
 */
export function pickDestination(
  departure: Departure,
  powers: readonly PowerState[],
  relations: readonly RelationRow[],
): string {
  let best = '';
  let bestScore = -Infinity;

  for (const power of powers) {
    if (power.id === departure.fromPowerId || power.fallen) continue;
    const group = power.groups.find((row) => row.raceId === departure.raceId);
    const policy = policyOf(group?.status ?? 'dung-nap');
    const draw = policy?.immigrationDraw ?? 0;
    const relation = relationValue(relations, departure.fromPowerId, power.id);
    // Quan hệ XẤU với nước vừa đuổi mình là một điểm CỘNG: người tị nạn đi tới
    // chỗ kẻ thù của kẻ đã đuổi họ, và Phần 15 dùng đúng chỗ đó để cho cộng đồng
    // lưu vong tài trợ cho cuộc chiến kế tiếp.
    const score = draw * 2 - relation * 0.3 + (group === undefined ? -12 : 0) + power.stability * 0.05;
    if (score > bestScore) {
      bestScore = score;
      best = power.id;
    }
  }
  return best;
}

/** Nhận một dòng di dân vào nước chủ nhà. Họ mang theo tay nghề VÀ mối hận. */
export function receiveMigrants(
  power: PowerState,
  departure: Departure,
  year: number,
): { power: PowerState; exile: ExileCommunity; line: string } {
  const migration = migrationConfig();
  const existing = power.groups.find((group) => group.raceId === departure.raceId);
  const arrivalShare = departure.sharePoints / 100;

  const groups = existing
    ? power.groups.map((group) =>
        group.raceId === departure.raceId
          ? {
              ...group,
              population: group.population + arrivalShare,
              usefulness: Math.min(
                group.usefulnessCeiling,
                Math.round(
                  (group.usefulness * group.population + departure.usefulness * migration.arrivalUsefulnessTransfer * arrivalShare) /
                    (group.population + arrivalShare),
                ),
              ),
              grievance: clampMeter(group.grievance + migration.arrivalGrievance * (arrivalShare / (group.population + arrivalShare))),
            }
          : group,
      )
    : [
        ...power.groups,
        {
          raceId: departure.raceId,
          population: arrivalShare,
          status: 'dung-nap' as MinorityStatus,
          grievance: migration.arrivalGrievance,
          usefulness: Math.round(departure.usefulness * migration.arrivalUsefulnessTransfer),
          usefulnessCeiling: 100,
          persecutedSinceYear: 0,
        },
      ];

  return {
    power: { ...power, groups, dominantMood: clampMeter(power.dominantMood + migration.hostDominantMood) },
    exile: {
      raceId: departure.raceId,
      fromPowerId: departure.fromPowerId,
      toPowerId: power.id,
      year,
      people: departure.people,
      grudge: Math.min(100, departure.grievance),
    },
    line: `${powerName(power.id)} nhận ${String(departure.people)} người ${departure.raceId} chạy khỏi ${powerName(departure.fromPowerId)} — kèm cả tay nghề lẫn mối hận của họ.`,
  };
}

/** Bốn chính sách đặt được, cho UI dựng nút. */
export function policyChoices(): { id: MinorityStatus; name: string; gains: string; costs: string }[] {
  return settablePolicies().map((policy) => ({
    id: policy.id,
    name: policy.name,
    gains: policy.gains,
    costs: policy.costs,
  }));
}

function relationValue(relations: readonly RelationRow[], a: string, b: string): number {
  const row = relations.find((entry) => (entry.a === a && entry.b === b) || (entry.a === b && entry.b === a));
  return row?.value ?? 0;
}

function clampMeter(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value * 10) / 10));
}
