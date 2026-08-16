/**
 * TỈ LỆ KHÔNG GIAN CỦA MỘT THÀNH TRÌ — một nguồn chân lý duy nhất.
 *
 * Bản cũ đo thành trì bằng một lưới 4×4 tới 16×16 ô trừu tượng: một "ô" không
 * có bề rộng thật, nên không câu hỏi nào về khoảng cách trả lời được. Bức tường
 * dài bao nhiêu thước? Cối xay cách sông mấy trăm bước? Đi từ cổng tới kho lương
 * mất bao lâu? Cả ba đều không có câu trả lời, và vì thế cả ba đều không tính
 * vào bất cứ phép nào — kể cả những phép mà Phần 11 rất cần chúng.
 *
 * Ở đây thành trì có KÍCH THƯỚC THẬT: mỗi ô 5 m, cả lưới 1 200 ô = 6 km mỗi
 * cạnh. Từ đó mọi con số không gian đều quy ra được mét, và một tuyến tường dài
 * 1 400 m tốn đúng số đá của 1 400 m tường.
 *
 * BA ĐIỀU RÀNG BUỘC LẪN NHAU, nên cả ba nằm chung một file:
 *
 *  1. **Ô 5 m** — đơn vị nhỏ nhất. Đủ mịn để đặt một cái tháp cho đúng chỗ, đủ
 *     thô để không phải nghĩ tới từng viên gạch.
 *  2. **Khuôn viên công trình đo bằng ô**, không phải bằng "ô lưới" trừu tượng.
 *     Một cái giếng chiếm 40 m, một toà tháp chính chiếm 120 m — và người chơi
 *     nhìn bản đồ là thấy ngay cái nào to hơn cái nào.
 *  3. **Bán kính quy hoạch nở theo cấp**, KHÔNG phải lưới to ra. Đất vẫn là đất
 *     ấy từ đầu; lên cấp chỉ có nghĩa là lãnh chúa được phép với tay ra xa hơn.
 *     Đây là chỗ khác hẳn bản cũ, và nó xoá luôn cả một lớp lỗi: không còn bước
 *     "mở rộng lưới" nào để một công trình rơi mất trong đó.
 */

// ---------------------------------------------------------------------------
// Lưới
// ---------------------------------------------------------------------------

/** Cạnh một ô lưới, tính bằng mét. */
export const CELL_M = 5;

/** Số ô mỗi cạnh của lưới một thành trì. 1 200 × 5 m = 6 km. */
export const GRID_CELLS = 1200;

/** Tâm lưới — toà chính đứng ở đây, và mọi bán kính đo từ đây. */
export const CENTER_CELL = GRID_CELLS / 2;

/** Bề rộng thật của cả lưới, tính bằng mét. */
export const SPAN_M = GRID_CELLS * CELL_M;

/**
 * Độ phân giải TRƯỜNG địa hình. 160 mẫu trên 1 200 ô ≈ 37,5 m mỗi mẫu.
 *
 * Đây là chỗ đánh đổi giữa nét và tốc độ, và nó đáng cân nhắc kỹ vì bài test
 * nuôi một Thôn lên Đại thành chạy hàng nghìn tuần: mỗi lần sinh trường là
 * 160² = 25 600 mẫu × 5 tầng nhiễu. Sinh MỘT LẦN rồi cache theo hạt giống, nên
 * chi phí ấy trả đúng một lần cho mỗi thành trì.
 */
export const FIELD_RES = 160;

/** Bao nhiêu ô lưới ứng với một mẫu trường. */
export const CELLS_PER_SAMPLE = GRID_CELLS / FIELD_RES;

// ---------------------------------------------------------------------------
// Khuôn viên công trình
// ---------------------------------------------------------------------------

/**
 * `size: [w, h]` trong `data/buildings.json` là kích thước TƯƠNG ĐỐI có từ bản
 * cũ. Nhân với hằng số này ra cạnh khuôn viên thật, tính bằng ô:
 *
 * ```
 * 1×1 →  8 ô →  40 m   giếng, tháp, cổng
 * 2×2 → 16 ô →  80 m   nhà ở, kho lương, cối xay
 * 3×3 → 24 ô → 120 m   nhà thờ, xưởng lớn, tháp chính
 * ```
 *
 * Công trình nào cần một con số khác thì khai thẳng `footprint` trong
 * `data/buildings.json`; hằng số này chỉ là mặc định để 55 công trình sẵn có
 * không phải sửa từng dòng.
 */
export const CELLS_PER_SIZE_UNIT = 8;

/**
 * Khoảng thở giữa hai khuôn viên, tính bằng ô. 6 ô = 30 m — vừa một con đường
 * và cái sân.
 *
 * Không có khoảng này thì lối chơi tối ưu là xếp công trình khít nhau thành một
 * khối đặc, và cả mục "bố cục ảnh hưởng thẳng tới Phần 11" mất nghĩa: một thành
 * không có đường thì cũng không có chỗ thắt cổ chai để mà phòng thủ.
 */
export const DEFAULT_CLEARANCE_CELLS = 6;

// ---------------------------------------------------------------------------
// Bán kính quy hoạch
// ---------------------------------------------------------------------------

/**
 * Bán kính quy hoạch theo CẤP khu định cư, tính bằng ô.
 *
 * ```
 * 1 Thôn        140 ô →  700 m →  1,5 km²
 * 2 Làng        200 ô →  1,0 km →  3,1 km²
 * 3 Trấn        290 ô →  1,5 km →  6,6 km²
 * 4 Thành       400 ô →  2,0 km → 12,6 km²
 * 5 Đại thành   530 ô →  2,7 km → 22,0 km²
 * ```
 *
 * Con số cuối cùng nghe rộng, nhưng nó KHÔNG phải diện tích phố xá: nó là cả
 * phần ruộng, rừng lấy củi và vỉa đá của thành. Một đại thành tám nghìn dân ăn
 * hết sản lượng của khoảng chừng ấy đất, và đó chính là lý do "ruộng ngoài
 * tường" của mục 6 không còn phải là một bảng đếm riêng — nó là phần lưới nằm
 * giữa vành công trình và mép bán kính.
 */
const PLANNING_RADIUS_BY_RANK: readonly number[] = [140, 200, 290, 400, 530];

export function planningRadiusCells(rank: number): number {
  const index = Math.max(1, Math.min(PLANNING_RADIUS_BY_RANK.length, Math.round(rank))) - 1;
  return PLANNING_RADIUS_BY_RANK[index] ?? PLANNING_RADIUS_BY_RANK[0] ?? 140;
}

/**
 * Nền thành — vùng lõi quanh tâm mà địa hình luôn được san phẳng cho xây được,
 * và không điểm tài nguyên nào được mọc vào.
 *
 * Tồn tại vì một lý do rất thực dụng: nếu trường nhiễu ném đúng một khúc sông
 * hay một vách đá vào giữa tâm thì thành trì không có chỗ đặt toà chính, và ván
 * chơi hỏng trước tuần thứ nhất. Bản cũ tránh chuyện này bằng hạn mức trọng số;
 * ở đây tránh bằng một khoảnh đất được bảo lưu, và cách ấy thành thật hơn — nó
 * nói rõ "chỗ này người ta đã dọn" thay vì giả vờ là ngẫu nhiên.
 */
export const KEEP_YARD_CELLS = 46;

// ---------------------------------------------------------------------------
// Quy đổi
// ---------------------------------------------------------------------------

export function cellsToMetres(cells: number): number {
  return cells * CELL_M;
}

export function metresToCells(metres: number): number {
  return Math.round(metres / CELL_M);
}

/** Diện tích một vùng bán kính `cells` ô, quy ra km². */
export function discAreaKm2(cells: number): number {
  const km = (cells * CELL_M) / 1000;
  return Math.PI * km * km;
}

/** Ô có nằm trong lưới không. */
export function inGrid(x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < GRID_CELLS && y < GRID_CELLS;
}

/** Khoảng cách từ tâm thành, tính bằng ô. */
export function distanceFromCentre(x: number, y: number): number {
  return Math.hypot(x - CENTER_CELL, y - CENTER_CELL);
}

/**
 * Toạ độ ô của bản cũ → toạ độ ô mới. CHỈ dùng trong migration.
 *
 * Lưới cũ là `size × size` ô trừu tượng phủ kín cả thành trì; lưới mới là đĩa
 * bán kính `radius` quanh tâm. Phép này trải lưới cũ ra kín đĩa ấy, rồi
 * `repairLayout` mới là chỗ đẩy những công trình rơi vào sông hay chồng nhau ra
 * chỗ hợp lệ. Không cố làm cho phép này đúng tuyệt đối — nó chỉ cần đưa mọi thứ
 * về đúng KHU VỰC, phần còn lại đã có người dọn.
 */
export function legacyCellToNew(x: number, y: number, legacyGrid: number, radius: number): { x: number; y: number } {
  const half = (legacyGrid - 1) / 2;
  const spread = legacyGrid <= 1 ? 0 : (radius * 1.4) / half;
  return {
    x: Math.round(CENTER_CELL + (x - half) * spread),
    y: Math.round(CENTER_CELL + (y - half) * spread),
  };
}
