# PHẦN 7 — BẢN ĐỒ CƠ THỂ, THƯƠNG TÍCH, Y HỌC THẾ KỶ 14
*Tiền đề: Phần 0–6 xong. Slice mới: `body`. Đây là hệ thống lan tỏa rộng nhất
trong game — nó phải ảnh hưởng tới kiểm định, chiến trận, quản trị, xã giao.*

### 1. HAI MƯƠI VÙNG CƠ THỂ
`/data/body-regions.json`. Mỗi vùng: id, tên, bên, trọng số trúng đòn (d100),
ô giáp che, tạng phủ bên trong, nhóm cơ để hiển thị, chỉ số/kỹ năng bị chi phối.

| id | tên | trúng | tạng phủ | chi phối |
|---|---|---|---|---|
| skull | Sọ | 4 | não | INT WIT PER, ý thức |
| face | Mặt | 5 | mắt, hàm | PER, PRE, EMP |
| neck | Cổ | 3 | khí quản, mạch | chí mạng cao |
| chest | Ngực | 14 | tim, phổi | VIT, thể lực |
| abdomen | Bụng | 10 | ruột, gan, dạ dày | VIT, nhiễm trùng cao |
| upperBack | Lưng trên | 6 | cột sống trên | STR, nguy cơ liệt |
| lowerBack | Thắt lưng | 5 | cột sống dưới | STR, mang vác |
| shoulderL/R | Vai T/P | 4/4 | khớp vai | vung vũ khí, giương cung |
| upperArmL/R | Cánh tay T/P | 4/4 | — | STR đòn đánh |
| forearmL/R | Cẳng tay T/P | 4/4 | — | chặn đỡ, cầm khiên |
| handL/R | Bàn tay T/P | 3/3 | — | mọi kỹ năng tinh xảo |
| hips | Hông & mông | 6 | xương chậu | đứng vững, cưỡi ngựa |
| thighL/R | Đùi T/P | 6/6 | động mạch đùi | tốc độ, chảy máu chết |
| shinL/R | Cẳng chân T/P | 4/4 | — | tốc độ, giữ thăng bằng |

*(bàn chân gộp vào cẳng chân)*. Tổng trọng số = 100. Vị trí trúng đòn tung d100
tra bảng này, có điều chỉnh theo chiêu thức, tư thế, và bản đồ che phủ giáp (Phần 16).

### 2. MÔ HÌNH THƯƠNG TÍCH
```ts
type Injury = {
  id, regionId, inflictedTurn, source;
  type: 'blunt'|'laceration'|'puncture'|'fracture'|'burn'|'crush'
        |'dislocation'|'concussion'|'internal'|'amputation';
  severity: 1|2|3|4|5;        // xây xát / nhẹ / vừa / nặng / chí mạng
  bleeding: number;           // điểm máu mất mỗi lượt
  infection: number;          // 0-100
  pain: number;               // 0-100
  treated: boolean; treatmentQuality?: 1|2|3|4|5; treatedTurn?: number;
  healProgress: number;       // 0-100
  complications: Complication[];
  permanent?: PermanentDamage;
};
```

Trạng thái toàn thân (biến phụ, tính từ toàn bộ `Injury[]`):
```
blood        0-100, tổng chảy máu tích lũy
pain         0-100, tổng đau đã trừ theo WIL
fever        0-100, từ nhiễm trùng
shock        0-100
consciousness  'tỉnh'|'choáng'|'lơ mơ'|'hôn mê'
mobility     0-100%
gripL/gripR  0-100%, khả năng cầm nắm mỗi tay
```

**KHÔNG có một thanh máu tổng.** Chết đến từ nguyên nhân cụ thể (mục 9). Người
chơi phải nhìn vào cơ thể chứ không nhìn vào một con số.

### 3. QUY TẮC AI VÀ THƯƠNG TÍCH — giữ nguyên tắc R1
AI TUYỆT ĐỐI không được ghi vào slice `body`. Toàn bộ quyền `engine`.
Nhưng để truyện dẫn dắt được cơ học, cho phép AI phát MỘT event:
```
'body.requestInjury' { regionId, roughSeverity: 'nhẹ'|'vừa'|'nặng', cause }
```
Engine nhận, tự tung xúc sắc, tự quyết loại thương tích, mức độ thật, chảy máu,
nhiễm trùng. **AI đề nghị, engine phán quyết.** Có trần: tối đa 2 request mỗi lượt.
Ghi rõ điều này trong khối prompt số 2.

### 4. BẢN ĐỒ CƠ THỂ SVG — yêu cầu hiển thị
Một hình người SVG, nút gạt xem mặt trước / mặt sau. Mỗi vùng là một `<path>` có
id trùng id vùng. Tô màu qua CSS variable, KHÔNG vẽ lại SVG mỗi lần đổi.

| Tình trạng | Màu |
|---|---|
| Lành lặn | màu da theo chủng tộc |
| Xây xát (1) | vàng nhạt |
| Nhẹ (2) | vàng |
| Vừa (3) | cam |
| Nặng (4) | đỏ |
| Chí mạng (5) | đỏ thẫm |
| Đang chảy máu | phủ hiệu ứng nhỏ giọt, nhấp nháy theo mức chảy máu |
| Nhiễm trùng | viền xanh lục lan dần theo chỉ số infection |
| Sốt cao | toàn thân ám hồng |
| Hoại tử | đen, lan ra vùng lân cận nếu không xử lý |
| Đã lành có sẹo | tím nhạt mờ |
| Tàn phế vĩnh viễn | xám sẫm, gạch chéo |
| Cụt chi | vùng đó biến mất khỏi hình, mỏm cụt bo tròn |

Nhiều tình trạng chồng nhau thì lấy cái nặng nhất làm màu nền, các cái khác hiện
bằng lớp phủ. Hover vùng nào hiện tooltip liệt kê mọi thương tích ở đó.

### 5. HIỆU ỨNG LAN RA MỌI NƠI
Đăng ký vào registry modifier của Phần 5. **Đây là phần quan trọng nhất Phần 7 —
nếu làm hời hợt thì cả hệ thống chỉ còn là đồ trang trí.**

**Theo vùng:**
```
tay thuận bị thương    → phạt kỹ năng vũ khí, viết lách, thủ công theo grip%
tay còn lại            → phạt cầm khiên, bắn cung, cưỡi ngựa
vai                    → phạt tầm vung, giương cung, giảm sát thương
chân, hông             → phạt tốc độ, né tránh, hành quân, đứng vững
đầu, mặt               → phạt INT WIT PER, mất PRE nếu biến dạng
ngực, bụng             → phạt thể lực, sức bền hành quân, VIT
cột sống               → nguy cơ liệt, phạt toàn diện
```

**Toàn thân:**
```
pain      → phạt MỌI kiểm định, mức phạt chia cho WIL
blood     → phạt lũy tiến, dưới 40 thì choáng, dưới 20 thì hôn mê
fever     → phạt INT PER và mọi kiểm định 3d6
mobility  → ảnh hưởng cả hành quân cấp chiến dịch, không chỉ đánh nhau
```

**Lan ra ngoài chiến đấu (bắt buộc, đây là yêu cầu cốt lõi):**
- quản trị lãnh thổ: `pain` và `fever` phạt kiểm định 3d6
- xã giao: biến dạng mặt phạt PRE EMP, nhưng sẹo chiến trận có thể +PRE với giới quân nhân, −EMP với giới tăng lữ
- chỉ huy chiến trận: lãnh chúa bị thương nặng thì sĩ khí quân giảm
- mô phỏng ngầm: lãnh chúa trọng thương không thể thân chinh, NPC và quốc gia phải tính tới điều đó (Phần 15)

### 6. Y HỌC THẾ KỶ 14 — chữa trị
Kiểm định d100 kỹ năng y thuật, ra 5 cấp theo Phần 5:
```
critSuccess    lành nhanh, không để lại di chứng
success        rút ngắn thời gian, giảm nguy cơ nhiễm trùng
costlySuccess  cầm được nhưng để lại sẹo/cứng khớp, hoặc tốn rất nhiều
fail           không tiến triển, mất thuốc men và thời gian
critFail       LÀM TỆ HƠN: nhiễm trùng, mở lại vết thương, cắt nhầm chi
```

Các phương pháp trong `/data/treatments.json`:

| Phương pháp | Hiệu quả |
|---|---|
| Khâu vết thương | cầm máu tốt, nguy cơ nhiễm trùng vừa |
| Đốt bằng sắt nung | cầm máu rất tốt, GÂY THÊM một vết bỏng, đau dữ dội |
| Đắp mật ong và rượu | giảm nhiễm trùng thật sự, chậm |
| Nẹp xương | bắt buộc cho gãy xương, sai thì liền lệch vĩnh viễn |
| Cắt cụt chi | cứu mạng khi hoại tử, đổi lấy tàn phế vĩnh viễn |
| Khoan sọ | cứu chấn thương sọ, tỷ lệ tử vong rất cao |
| **Trích máu** | **PHẢI có hại về mặt cơ học:** mất thêm máu, không lợi ích. Đây là cái bẫy lịch sử có chủ ý. Thầy thuốc giỏi trong game sẽ khuyên tránh, thầy lang dở sẽ đề nghị nó. |
| Cầu nguyện, thánh tích | không tác dụng vật lý, nhưng giảm `pain` và tăng WIL tạm thời qua cơ chế tinh thần |

Người chữa: thầy tu, thầy thuốc học ở các trường y phương nam, thợ cạo kiêm phẫu
thuật, bà lang thảo dược, chính người chơi. Chất lượng khác nhau rất xa.

### 7. BIẾN CHỨNG
Mỗi lượt, với mỗi thương tích chưa lành, tung kiểm định:
```
nhiễm trùng → sốt → hoại tử → tử vong hoặc buộc phải cắt cụt
chảy máu không cầm → mất máu → hôn mê → chết
gãy xương không nẹp → liền lệch → phạt vĩnh viễn vùng đó
vết đâm bẩn → uốn ván (co giật, tử vong cao)
bất động lâu → loét, teo cơ
```
Tất cả dùng 3d6 vs VIT theo phân miền Phần 5 (đây là năng lực dài hạn).
Móc sẵn cho Phần 15: **dịch hạch.** Slice body phải có chỗ cho bệnh truyền nhiễm
lây từ môi trường chứ không chỉ từ vũ khí.

### 8. TÀN PHẾ VĨNH VIỄN
```ts
type PermanentDamage =
  'cụt tay'|'cụt chân'|'cụt ngón'|'mù một mắt'|'mù hai mắt'|'điếc'
 |'liệt nửa người'|'liệt hai chân'|'cứng khớp'|'đau kinh niên'
 |'biến dạng mặt'|'liền xương lệch'
```
- Ghi vĩnh viễn vào slice body, đồng thời tự thêm sẹo vào `appearance.scars` của Phần 6 (đúng quyền `engine` đã khai).
- Modifier vĩnh viễn, không bao giờ gỡ.
- Chân giả và tay sắt: giảm bớt phạt, cần thợ rèn giỏi và rất nhiều tiền. Bịt mắt, nạng, xe lăn thô sơ.
- **Ảnh hưởng xã hội thật:** cụt tay phải thì không cầm kiếm được nữa, một hiệp sĩ mất tay có thể mất luôn tư cách chiến đấu và phải chuyển sang con đường khác. Đây là chỗ game phải cho người chơi lối đi tiếp, không phải bắt tạo lại nhân vật — xem Phần 8 mục 7.

### 9. ĐIỀU KIỆN TỬ VONG
Chết KHÔNG do một thanh máu về 0. Chỉ chết khi:
```
blood ≤ 0
tạng chí mạng (tim, não, cột sống cổ) bị phá hủy hoàn toàn
fever ≥ 100 kéo dài quá số lượt cho phép
hoại tử lan tới thân mình
cụt chi mà không cầm được máu
```
Đúng nguyên tắc Phần 5: một lần đại thất bại KHÔNG bao giờ giết ngay. Luôn phải
qua ít nhất một chuỗi biến chứng, để người chơi còn cửa xoay xở.

### 10. UI
Panel "Cơ thể" trong bảng trạng thái:
- Hình SVG, gạt trước/sau, click vùng để mở chi tiết
- Năm thanh: máu, đau, sốt, thể lực, ý thức
- Danh sách thương tích đang có, sắp theo mức nguy hiểm
- Khung "Đang chịu phạt": liệt kê từng dòng modifier với nhãn đọc được, lấy thẳng từ registry Phần 5. Người chơi phải luôn biết vì sao mình yếu đi.
- Nút chữa trị: hiện các phương pháp khả dụng, yêu cầu, rủi ro, và ai chữa
- Dòng thời gian thương tích: từng vết bị khi nào, do cái gì

### 11. VIỆC CẦN LÀM
1. `/data/body-regions.json` (20 vùng), `/data/injuries.json`, `/data/treatments.json`
2. SVG hình người trước và sau, 20 path có id, dựng bằng code chứ không phải ảnh. Vẽ đơn giản nhưng đúng tỷ lệ, khớp với dáng người ở Phần 6.
3. Slice `body` toàn quyền `engine`, đăng ký qua Phần 2.
4. Bảng vị trí trúng đòn d100, hàm gây thương tích từ `CheckResult`.
5. Event `body.requestInjury` cho AI, có trần và có kiểm duyệt.
6. Vòng tính mỗi lượt: chảy máu, nhiễm trùng, lành tự nhiên, biến chứng.
7. Hệ chữa trị đầy đủ 5 cấp kết quả.
8. Tàn phế vĩnh viễn + tự ghi sẹo sang appearance.
9. Đăng ký TOÀN BỘ modifier ở mục 5 vào registry Phần 5.
10. UI như mục 10.
11. **Test:** gây một vết đâm sâu ở đùi, không chữa → mô phỏng 30 lượt → phải thấy chuỗi chảy máu, nhiễm trùng, sốt, hoại tử, và nhân vật chết hoặc buộc phải cắt chân. In log từng lượt ra.

### 12. Sau khi xong
Đưa ra log 30 lượt ở bài test số 11 và ảnh chụp bản đồ cơ thể ở lượt 15.
Cần xem tốc độ diễn tiến có hợp lý không trước khi sang Phần 8.
