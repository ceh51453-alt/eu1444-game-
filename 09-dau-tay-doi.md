# PHẦN 9 — QUYẾT ĐẤU: LƯỚI NHỎ + CHỌN CHIÊU ĐỒNG THỜI
*Tiền đề: Phần 0–8 xong. Đây là minigame đầu tiên. Định dạng biên niên trận đấu
dựng ở đây sẽ được Phần 10 và 11 dùng lại, nên phải làm tổng quát.*

### 1. AI ĐIỀU KHIỂN CHIẾN THUẬT — kiến trúc lai
**KHÔNG gọi LLM cho từng đòn:** mỗi trận sẽ mất vài phút chờ và tốn rất nhiều tiền.
Thay vào đó chia hai tầng:

**Tầng 1 — LLM, gọi 1 lần lúc vào trận:**
Nhận: hồ sơ đối thủ, quan hệ với người chơi, bối cảnh, thứ đang đặt cược.
Trả về: một DOCTRINE dạng JSON, ví dụ
```json
{ "aggression": 0.8, "patience": 0.2, "honor": 0.3, "riskTolerance": 0.7,
  "targetsWounded": true, "respectsYield": false,
  "favoredActions": ["đâm","vật lộn"],
  "openingLine": "Hắn nhổ nước bọt rồi bước tới, không thèm chào." }
```
Có thể gọi thêm tối đa 2 lần nữa ở khúc ngoặt: khi đối thủ sắp thua, khi người
chơi bị thương nặng, khi có người ngoài can thiệp.

**Tầng 2 — engine, chạy mỗi hiệp:**
Bộ chọn hành động deterministic, chấm điểm mọi hành động khả dĩ theo doctrine +
tình hình lưới + thể lực + thương tích, rồi chọn bằng softmax có seeded RNG
(không phải luôn chọn cái tốt nhất, để khó đoán).

Kết quả: đối thủ hung hãn, đối thủ nhẫn nại, đối thủ chơi bẩn hành xử khác nhau
rõ rệt, mà bấm nút là ra ngay.

### 2. ĐẤU TRƯỜNG
- Lưới ô vuông, mặc định 7×7, mỗi ô ~1m. Kích thước sinh theo địa điểm: cầu hẹp 3×9, đại sảnh 7×7, sân đấu 9×9, phòng ngủ 4×4.
- Địa hình ô: bằng phẳng / bùn lầy / đá lởm chởm / dốc / nước nông / bàn ghế.
- Mỗi đấu sĩ có VỊ TRÍ và HƯỚNG MẶT (8 hướng). Hướng mặt rất quan trọng: đánh vào sườn +hệ số, đánh sau lưng +hệ số lớn.
- **TẦM VỚI** vũ khí quyết định ô nào bị đe dọa. Giáo dài khống chế xa, dao găm phải áp sát. Nghệ thuật quyết đấu nằm ở việc giành đúng cự ly cho vũ khí mình.

### 3. VÒNG MỘT HIỆP
```
B1  Hai bên chọn hành động ĐỒNG THỜI, giấu nhau.
    Người chơi bấm chọn; engine chọn cho NPC theo doctrine.
B2  Lộ đồng thời.
B3  Áp ma trận tương khắc (mục 5) → ra modifier khởi điểm.
B4  Phân giải bằng d20 đối kháng (Phần 5).
B5  Áp kết quả: di chuyển, thương tích, đổi thế trận, tiêu thể lực.
B6  Ghi vào biên niên (mục 10). Sang hiệp mới.
```
Một trận thường 8–25 hiệp. Không giới hạn cứng.

### 4. BẢNG HÀNH ĐỘNG
```
Di chuyển:  bước tới / bước lùi / vòng trái / vòng phải / xoay mặt / nhảy lùi
Tấn công:   chém ngang / chém chéo / bổ dọc / đâm / đập / chặt chân
Phòng thủ:  đỡ cứng / gạt hướng / né sang / lùi tránh / núp khiên
Thế:        đổi stance (từ node Phần 8)
Đặc biệt:   giả đòn / tước vũ khí / vật lộn / húc khiên / hất cát / kêu hàng
Kỹ thuật:   mọi node kind='technique' có usableIn chứa 'duel'
```
Mỗi hành động: chi phí thể lực, thời gian tương đối (nhanh/vừa/chậm), tầm yêu cầu,
chỉ số và kỹ năng dùng, vùng cơ thể nó nhắm tới.

### 5. MA TRẬN TƯƠNG KHẮC
KHÔNG phải oẳn tù tì thắng thua tuyệt đối. Chỉ là modifier vào d20, để kỹ năng và
xúc sắc vẫn quyết định.
```
Đâm gặp Chém              đâm +4 (nhanh hơn)
Chém gặp Đỡ cứng          chém -3, nhưng tiêu thể lực người đỡ
Đỡ cứng gặp Đâm           đỡ -4 (đâm luồn qua)
Né gặp Chém ngang         né +5
Né gặp Đâm                né -2
Giả đòn gặp Đỡ/Né         giả đòn +6 và giành thế trận
Giả đòn gặp Tấn công thật giả đòn -5 (bị đánh phủ đầu)
Vật lộn gặp Giả đòn       vật lộn +5
Vật lộn gặp Đâm           vật lộn -6
Bước lùi gặp mọi Tấn công giảm sát thương, mất thế trận
```
Bảng đầy đủ để trong `/data/duel-matrix.json`, sửa được không cần build lại.

### 6. THẾ TRẬN & THỂ LỰC
**Thế trận (tempo):** −5 đến +5. Thắng hiệp thì tăng, thua thì giảm.
- tempo cao → mở khóa đòn liên hoàn, đối thủ bị hạn chế lựa chọn phòng thủ
- tempo âm → bị ép, một số hành động tấn công bị khóa

**Thể lực:** mỗi hành động tiêu, giáp nặng tiêu thêm, thương tích tiêu thêm.
Cạn thể lực → phạt nặng dần rồi buộc phải thủ.

Đây là chỗ quyết định phần lớn các trận đấu giáp trụ thật ngoài đời: người ta thua
vì kiệt sức chứ ít khi vì một nhát chém đẹp. Game phải phản ánh đúng.

### 7. VŨ KHÍ & GIÁP
> Chi tiết đầy đủ ở **Phần 16**. Mục này chỉ nêu quy tắc phân giải.

**QUY TẮC GIÁP QUAN TRỌNG — không phải trừ thẳng sát thương.**
Giáp thay đổi LOẠI thương tích có thể xảy ra:
```
chém vào giáp tấm      gần như vô hiệu, chỉ gây chấn động nhẹ
đâm vào khe hở giáp    hiệu quả, nhưng cần kiểm định khó hơn nhiều
đập bằng chùy, búa     xuyên qua giáp thành chấn thương kín và gãy xương
nửa kiếm (half-sword)  cho phép đâm chính xác vào khe, mở bằng node Phần 8
```
Nghĩa là: chọn sai vũ khí trước một đối thủ mặc giáp tấm thì gần như không thắng
nổi. Đây là chủ ý thiết kế, phải hiện rõ trên UI trước khi vào trận.

### 8. THƯƠNG TÍCH TRONG TRẬN
Mỗi đòn trúng đi thẳng qua Phần 7: tra bảng vị trí d100 (có điều chỉnh theo đòn đã
chọn, hướng mặt, và bản đồ che phủ giáp của Phần 16), sinh `Injury` thật, áp
modifier ngay lập tức.

Hệ quả trong trận: mất grip thì rơi vũ khí, thương chân thì giảm ô di chuyển được,
mất máu nhiều thì choáng rồi ngã.

**Không có "thanh máu trận đấu" riêng.** Trận đấu dùng chung cơ thể với phần còn
lại của game — thắng xong mà gãy tay thì tháng sau vẫn gãy tay.

### 9. LOẠI HÌNH QUYẾT ĐẤU
| Loại | Đặc điểm |
|---|---|
| Đấu tập | vũ khí cùn, mục tiêu là điểm thực hành, ít rủi ro |
| Đấu giải | thương ngựa trước rồi bộ chiến, có trọng tài, có khán giả, thắng được uy tín và tiền chuộc ngựa giáp |
| **Quyết đấu tư pháp** | có hiệu lực PHÁP LÝ: thắng là thắng kiện. Rất đặc trưng thế kỷ 14. Nối vào hệ thống luật ở Phần 13. |
| Đấu danh dự | tới khi một bên chịu thua hoặc đổ máu |
| Đấu sinh tử | không có đường lui |
| Phục kích | bên tấn công có hiệp mở màn miễn phí, không có chuyện đầu hàng |

Điều kiện kết thúc theo loại: chịu thua, ngã gục, chết, mất vũ khí, ra khỏi vòng,
trọng tài dừng, có người can thiệp.

### 10. BIÊN NIÊN TRẬN ĐẤU → AI VIẾT DIỄN BIẾN
Định dạng dùng chung cho Phần 9, 10, 11:
```ts
type CombatChronicle = {
  kind: 'duel'|'battle'|'siege';
  setting; participants; stakes;
  rounds: {
    n: number;
    actions: { actorId; action; target?; result: CheckTier; margin }[];
    injuries: { actorId; regionId; type; severity }[];
    tempoAfter; staminaAfter;
    highlight?: 'turningPoint'|'nearDeath'|'firstBlood'|'disarm'|'critical';
  }[];
  outcome; duration; aftermath;
};
```
Sau trận, gọi LLM MỘT lần với biên niên này để viết diễn biến văn học.
Prompt phải ra lệnh rõ:
- Chỉ được kể lại đúng những gì có trong biên niên.
- KHÔNG được thêm đòn đánh, thêm thương tích, đổi kết quả.
- Được phép thêm: cảm xúc, không khí, lời thoại, phản ứng khán giả, ẩn dụ.
- Nhấn vào các hiệp có `highlight`.

Biên niên nén lại nếu quá dài: giữ nguyên các hiệp highlight, gộp các hiệp nhạt
thành một dòng tóm tắt. Diễn biến đã viết lưu vào Tầng B, xem lại được bất cứ lúc nào.

### 11. UI
- Lưới đấu ở giữa, hai đấu sĩ có hướng mặt rõ ràng, ô bị đe dọa tô màu
- Bảng hành động bên dưới, mỗi nút hiện: chi phí thể lực, tầm, tốc độ
- Hai bên: thanh thể lực, thế trận, hình cơ thể thu nhỏ của Phần 7
- Nhật ký hiệp cuộn bên phải, ghi từng đòn bằng lời ngắn
- Sau trận: nút "Đọc diễn biến" gọi AI viết, hiện ra như một đoạn truyện
- Chế độ xem lại: tua từng hiệp

### 12. VIỆC CẦN LÀM
1. `/data/duel-matrix.json`, `/data/arenas.json`
   *(weapons.json và armor.json để Phần 16 làm đầy đủ; giai đoạn này dùng bản tối giản)*
2. Engine đấu: lưới, hướng mặt, tầm với, vòng 6 bước ở mục 3.
3. Ma trận tương khắc + phân giải d20 đối kháng qua Phần 5.
4. Thế trận, thể lực, quy tắc giáp ở mục 7.
5. Nối thương tích vào Phần 7 (không có thanh máu riêng).
6. Doctrine từ LLM + bộ chọn hành động softmax của engine.
7. `CombatChronicle` + nén + prompt viết diễn biến. **Làm tổng quát**, Phần 10 và 11 sẽ dùng lại y nguyên cấu trúc này.
8. 6 loại hình quyết đấu với điều kiện kết thúc riêng.
9. UI như mục 11.
10. **Test:** cho một hiệp sĩ giáp tấm đấu với một tay kiếm không giáp nhưng kỹ năng cao hơn 20 điểm. Chạy 200 trận. Người mặc giáp phải thắng áp đảo trừ khi bên kia có node nửa kiếm. In bảng tỷ lệ thắng ra.

### 13. Sau khi xong
Đưa ra bảng tỷ lệ ở bài test 10 và một bản diễn biến do AI viết.
Cần xem AI có bịa thêm tình tiết ngoài biên niên không.
