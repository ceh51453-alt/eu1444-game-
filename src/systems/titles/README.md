# systems/titles

**Chủ sở hữu:** Phần 13
**Nhiệm vụ:** Thang tước vị, thái ấp, chính danh, thừa kế, tuyên thệ.

**Trạng thái:** xong.

Một thái ấp là một **TỜ GIẤY CÓ ẤN TRIỆN** (Phụ lục A mục 1): tước vị + quyền
trên một lãnh thổ + nghĩa vụ phải trả. Người chơi **ĐƯỢC PHONG / THỪA KẾ / BỊ
TƯỚC** nó — ba động từ, và không có động từ thứ tư.

Ba tầng không được lẫn:

| | THÀNH TRÌ (P12) | LÃNH THỔ (P13, `realm`) | THÁI ẤP (P13, `titles`) |
|---|---|---|---|
| Là gì | một ĐIỂM | một VÙNG | một TỜ GIẤY |
| Đơn vị | người, ô, tuần | tỉnh, phần trăm, ngày ngựa | ngày nghĩa vụ, phần cống, năm hiệu lực |
| Động từ | xây, đồn trú, vây hãm | cai trị, ban luật, thu thuế | phong, thừa kế, tước đoạt |

---

## ĐỌC biến nào

| Đường dẫn state | Vì sao cần |
|---|---|
| `titles.held[*]` | toàn bộ hệ chạy trên đây |
| `meta.gameDate.year` | thụ phong năm nào, nhiệm kỳ hết năm nào, trôi chính danh mỗi năm |

Ba thứ ở NGOÀI slice, và cả ba đi vào qua **tham số** chứ không qua một cú đọc
store bên trong:

| Nguồn | Vào qua | Dùng ở |
|---|---|---|
| Thế lực, tuổi, dòng máu (Phần 6) | `TakeContext` của `canTake` | mở thang nào, bậc nào (mục 3) |
| Gia đình (Phần 6) | `family` của `heirLine` | hàng thừa kế (mục 9) |
| Bảng `command` của `data/units.json` (Phần 10) | data tĩnh, chỉ đọc | phép kiểm tham chiếu lúc nạp |

## GHI biến nào

| Đường dẫn state | Quyền ghi |
|---|---|
| `titles.held[*]`, `.legitimacy`, `.obligations.*` | engine |
| `titles.held[*].fiefId`, `.fiefName` | **locked** |
| `titles.viewing`, `.successionLawId`, `.designatedHeir`, `.legitimacyLog` | engine |

**Không một dòng `ai` nào trong cả slice.** Chính danh chảy vào mọi kiểm định cai
trị qua registry của Phần 5; cho AI ghi vào đó nghĩa là một đoạn văn cảm động sẽ
hợp thức hóa một cuộc tiếm quyền, và R1 sụp trong đúng một lượt.

### Hai ràng buộc chéo
- `titles.mot-thai-ap-mot-to-giay` — hai `HeldTitle` cùng `fiefId` là hai bộ
  nghĩa vụ trên cùng một tờ giấy, và câu "năm nay nợ bao nhiêu ngày quân dịch"
  có hai câu trả lời.
- `titles.tuoc-phai-co-trong-thang` — một tước không có trong `titles.json` mở ra
  một bảng rỗng, tức là người chơi lên chức mà không thấy gì đổi.

---

## File data (R5)

`data/titles.json` · `data/succession.json`

Bốn phép kiểm THAM CHIẾU lúc nạp:

1. **Mỗi bậc phải trỏ tới một `panel` có thật.** Mục 4 là yêu cầu cốt lõi — mỗi
   cấp mở ra một trò chơi KHÁC. Panel không tồn tại = bảng rỗng.
2. **Thang Tây Âu phải khớp `data/units.json → command`, cả id lẫn bậc.** Đây là
   dòng "sửa ngược" của README mục 4.3. Phần 13 đã sửa bảng ấy ba chỗ: bậc 0 đổi
   `khong-tuoc` → `thuong-dan`, thêm `tuyen-hau` ở bậc 7, `vuong` xuống 8 và
   `hoang-de` xuống 9.
3. **`capByRank` phủ đủ bậc 0–9.** Thiếu một bậc thì một Công tước không giữ nổi
   chư hầu nào.
4. **Mọi id quan hệ trong luật kế vị phải có trong bảng `relations`.** Một id gõ
   sai cho ra hàng thừa kế rỗng — một cuộc khủng hoảng kế vị do lỗi chính tả.

---

## Ràng buộc

- Chính danh ảnh hưởng vào phép kiểm qua **ĐÚNG MỘT nguồn** đăng ký trong
  registry của Phần 5 (`titles.chinh-danh`, miền `rule.*`). Không chỗ nào được
  tự cộng tay — README mục 8.4.
- Quy đổi sang các hệ xúc sắc đi qua `scaleToSystem` của Phần 5, không tự chọn số.
- Kiểm định cai trị dùng **3d6** (Phần 5 mục 2 xếp quản trị vào "năng lực dài hạn").
- Mọi hàm thuần: nhận dữ liệu, trả dữ liệu mới. Ghi state là việc của chỗ gọi, qua MVU (R2).
- Không hàm nào ở đây nhận một `Holding`, một `Cell`, hay một con số dân.
