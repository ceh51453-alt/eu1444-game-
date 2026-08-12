/**
 * MA TRẬN TƯƠNG KHẮC (Phần 9 mục 5).
 *
 * "KHÔNG phải oẳn tù tì thắng thua tuyệt đối. Chỉ là modifier vào d20, để kỹ
 * năng và xúc sắc vẫn quyết định." Cả file này chỉ làm đúng một việc: tra bảng
 * hai chiều theo NHÃN và cộng ra hai gói điều chỉnh.
 *
 * Tra theo NHÃN chứ không theo id hành động là chỗ đáng để ý. Một chiêu thức mở
 * từ node Phần 8 chỉ cần mang nhãn `dam` là tự nhận đủ mọi dòng của đòn đâm —
 * không ai phải nhớ thêm một hàng vào `data/duel-matrix.json` mỗi lần Phần 8
 * thêm một node, và một node mới không bao giờ rơi ra khỏi ma trận trong im lặng.
 */

import { matrixRows, tagName, type MatrixRow } from './data';

export interface MatchupSide {
  /** Tổng điều chỉnh theo thang d100, dương là dễ hơn. */
  mod: number;
  /** Thể lực mất thêm ngoài chi phí hành động. */
  staminaExtra: number;
  /** Thế trận cộng thêm khi thắng hiệp. */
  tempoExtra: number;
  /** Cộng vào mức độ vết thương PHẢI CHỊU (thường âm — bước lùi làm đòn hụt lực). */
  incomingSeverity: number;
  /** Đúng những dòng người chơi sẽ đọc trong bảng điều chỉnh. */
  lines: { label: string; value: number }[];
}

export interface Matchup {
  a: MatchupSide;
  b: MatchupSide;
}

function emptySide(): MatchupSide {
  return { mod: 0, staminaExtra: 0, tempoExtra: 0, incomingSeverity: 0, lines: [] };
}

function label(row: MatrixRow): string {
  return `${tagName(row.when)} gặp ${tagName(row.against)}`;
}

/**
 * Áp một dòng cho một cặp (bên mang nhãn `when`, bên mang nhãn `against`).
 *
 * `self` và `other` đi vào hai gói khác nhau, và `effects` luôn tính cho bên
 * `when`. Đó là lý do bảng dữ liệu chỉ khai một chiều: engine gọi hàm này hai
 * lần, một lần cho mỗi bên đứng ở vai `when`.
 */
function applyRow(row: MatrixRow, self: MatchupSide, other: MatchupSide): void {
  if (row.self !== 0) {
    self.mod += row.self;
    self.lines.push({ label: label(row), value: row.self });
  }
  if (row.other !== 0) {
    other.mod += row.other;
    other.lines.push({ label: label(row), value: row.other });
  }
  const effects = row.effects;
  if (effects === undefined) return;
  other.staminaExtra += effects.otherStamina;
  self.tempoExtra += effects.selfTempo;
  self.incomingSeverity += effects.incomingSeverity;
}

/**
 * Hai bộ nhãn gặp nhau → hai gói điều chỉnh.
 *
 * Một cặp hành động có thể khớp NHIỀU dòng cùng lúc, và chúng cộng dồn: một
 * đường chém ngang gặp một cú né vừa ăn dòng `ne × chem-ngang` vừa ăn dòng
 * `di-chuyen × tan-cong` nếu cú né ấy cũng là một bước chân. Đó là ý đồ — mục 5
 * cấm bảng này thành một luật thắng-thua duy nhất.
 */
export function matchup(aTags: readonly string[], bTags: readonly string[]): Matchup {
  const a = emptySide();
  const b = emptySide();

  const aSet = new Set(aTags);
  const bSet = new Set(bTags);

  for (const row of matrixRows()) {
    if (aSet.has(row.when) && bSet.has(row.against)) applyRow(row, a, b);
    if (bSet.has(row.when) && aSet.has(row.against)) applyRow(row, b, a);
  }

  return { a, b };
}
