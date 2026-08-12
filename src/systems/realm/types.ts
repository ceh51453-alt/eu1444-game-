/**
 * KIỂU CỦA TẦNG LÃNH THỔ — Phần 13 mục 6, 7, 8.
 *
 * LÃNH THỔ LÀ MỘT VÙNG (mục 1): không có lưới ô, không đặt công trình nào, chỉ
 * ban chính sách, thu thuế, bổ nhiệm, xử án, giữ chư hầu. Vì thế không kiểu nào
 * trong file này có `x`, `y`, `Cell`, hay `buildingId`.
 *
 * QUY TẮC KIỂM TRA của mục 1, viết lại thành một câu để đọc trước khi thêm bất kỳ
 * trường nào: **nếu thứ đó có TỌA ĐỘ thì nó thuộc thành trì; nếu nó chỉ có PHẠM
 * VI ÁP DỤNG thì nó thuộc lãnh thổ.**
 *
 * `Province.holdingIds` là ngoại lệ duy nhất chạm tới tầng kia, và nó là một
 * DANH SÁCH ID chứ không phải một danh sách `Holding`: mục 6 nói thẳng — "trỏ
 * sang P12, KHÔNG sao chép dữ liệu". Tổng dân, tổng sản lượng, tổng quân của một
 * vùng đều là BIẾN PHỤ cộng qua giao diện `Tribute` của Phần 12, không phải một
 * trường ở đây.
 */

import type { HoldingId, NpcId, ProvinceId, RealmId } from '@/core/ids';

/**
 * MỘT TỈNH.
 *
 * Đơn vị đo của tầng này là TỈNH, PHẦN TRĂM, NGÀY ĐƯỜNG, ĐIỂM BẤT ỔN (Phụ lục A
 * mục 5) — và không bao giờ là người, ô, hay giạ lúa.
 */
export interface Province {
  id: ProvinceId;
  /** Node trong `regions.json` (Phần 4). Tên tỉnh lấy từ đó, không chép lại. */
  regionId: string;
  parentRealmId: RealmId;
  /** Thái ấp nào cai quản tỉnh này. Rỗng nghĩa là lãnh chúa trực trị. */
  fiefId: string;
  /** Chư hầu nào giữ nó. Rỗng nghĩa là chính người chơi. */
  holderId: string;
  terrain: string;
  climate: string;
  /** Rộng bao nhiêu — quy ra NGÀY ĐƯỜNG NGỰA khi đưa vào prompt. */
  area: number;
  /** TRỎ sang Phần 12. Không sao chép dữ liệu thành trì vào đây (mục 6). */
  holdingIds: HoldingId[];
  development: number;
  unrest: number;
  banditry: number;
  roads: number;
  infrastructure: string[];
  cultureMix: { id: string; share: number }[];
  raceMix: { id: string; share: number }[];
  resources: string[];
  /** Luật CẤP TỈNH đang áp. Luật cấp lãnh thổ nằm ở `RealmState.laws`. */
  laws: string[];
}

/** Một dự án cấp vùng đang chạy: đường, cầu, khai hoang, tháo nước, chợ phiên, đồn biên. */
export interface ActiveProject {
  id: string;
  projectId: string;
  provinceId: string;
  yearsLeft: number;
  spent: number;
  startedYear: number;
  stalled: string;
}

/** Một ghế triều đình đã có người (mục 8). Mỗi ghế là một NPC THẬT. */
export interface CourtAppointment {
  seatId: string;
  npcId: string;
  name: string;
  /** Năng lực 0–100. Thấp thì làm hỏng việc, không phải làm chậm việc. */
  skill: number;
  /** Lòng trung 0–100. Thấp thì ăn chặn. */
  loyalty: number;
  sinceYear: number;
  /** Đã bị bắt quả tang ăn chặn chưa — người chơi biết thì mới xử được. */
  caughtSkimming: boolean;
}

/** Một vụ đang chờ phán quyết (mục 8). */
export interface CourtCase {
  id: string;
  caseTypeId: string;
  provinceId: string;
  /** Nguyên đơn và bị đơn: id chư hầu, hoặc một nhãn như `dan`. */
  plaintiff: string;
  plaintiffName: string;
  defendant: string;
  defendantName: string;
  openedYear: number;
  summary: string;
  /** Đã xử chưa và xử thế nào. Rỗng nghĩa là còn chờ. */
  verdictId: string;
  /** Cả hai bên đều không phục — điều kiện mở quyết đấu tư pháp (mục 8). */
  bothRefuse: boolean;
}

/** Một mối hận chư hầu đang ôm (mục 7). AI được ghi vào đây. */
export interface Grievance {
  id: string;
  year: number;
  reason: string;
  /** Nặng nhẹ. Cộng vào công thức lòng trung qua `grievanceWeight`. */
  weight: number;
}

/**
 * CHƯ HẦU — NPC THẬT, CÓ THỂ PHẢN (mục 7).
 *
 * "Chư hầu mạnh + lòng trung thấp + có yêu sách = NỔI LOẠN. Đây phải là mối đe
 * dọa thường trực ở tước vị cao, không phải sự kiện hiếm." Ba vế ấy là ba trường
 * `power`, `loyalty`, `claims` dưới đây, và `rebellionRisk()` chỉ đọc đúng chúng.
 */
export interface Vassal {
  npcId: NpcId;
  name: string;
  titleId: string;
  fiefId: string;
  provinceIds: string[];
  /** 0–100. */
  loyalty: number;
  /** Quân, tiền, đất so với lãnh chúa — 0–100. */
  power: number;
  /** Tham vọng 0–100. Cao thì lòng trung tụt nhanh hơn. */
  ambition: number;
  personality: string;
  /** Yêu sách với đất của người khác — kể cả của chính lãnh chúa. */
  claims: string[];
  obligations: {
    tax: number;
    levyDays: number;
    courtAttendance: number;
    paidThisYear: boolean;
    attendedThisYear: boolean;
    levyDaysCalled: number;
  };
  grievances: Grievance[];
  /** Đang phản. Một khi bật lên thì đây không còn là một cái tên trong danh sách. */
  rebelling: boolean;
  /** Phe đang theo. Rỗng nghĩa là đứng một mình. */
  factionId: string;
  /** Số thành trì đang giữ — con số này ĐI VÀO từ ngoài, không đọc `holdings`. */
  holdingCount: number;
  /** Số quân gọi được, ước chừng. Cùng lý do: đi vào từ ngoài. */
  levyMen: number;
}

/** Một phe chư hầu. Nhiều chư hầu liên kết thành phe (mục 7). */
export interface Faction {
  id: string;
  name: string;
  members: string[];
  /** Cấp tổ chức: nhóm kết ước → liên minh → đại liên minh → khối quyền lực. */
  tierId: string;
  /** 0–100: khả năng cùng hành động thay vì chỉ cùng bất mãn. */
  cohesion: number;
  /** 0–100: quân, đất, tước và số người mà phe có thể huy động. */
  influence: number;
  /** Người đứng đầu có thật, luôn là một id trong `members`. */
  leaderId: string;
  /** Chức vị của từng chư hầu trong phe; không đồng nhất với cấp tổ chức. */
  memberRanks: Record<string, string>;
  /** Yêu sách chung của cả phe — cái cớ để họ đứng cùng nhau. */
  demand: string;
  formedYear: number;
}

/** Sổ thu chi một năm. Đơn vị là đồng, và mọi con số ở đây là ƯỚC CHỪNG khi vào prompt. */
export interface RealmLedger {
  taxRevenue: number;
  tributeIn: number;
  tributeOut: number;
  lawUpkeep: number;
  courtSalary: number;
  projectSpend: number;
  skimmed: number;
  net: number;
}
