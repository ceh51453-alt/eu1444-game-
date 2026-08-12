# PHẦN 15 — THẾ GIỚI TỰ VẬN ĐỘNG
*Tiền đề: Phần 0–14 xong. Đây là phần cuối, và là phần làm cho thế giới sống.*

### 1. NGUYÊN TẮC
Thế giới vận động dù người chơi không có mặt và không được nhắc tới trong output.
Một cuộc chiến ở đầu kia châu lục vẫn diễn ra, một hồng y vẫn vận động, một chư hầu
vẫn nuôi hận. **Người chơi chỉ BIẾT khi tin tức đến tai.**

Giữ nguyên R1: LLM trong mô phỏng ngầm chỉ đề xuất **Ý ĐỊNH** và **QUYẾT ĐỊNH**.
Engine tính mọi con số. Output của LLM vẫn phải qua MVU và Zod của Phần 2.

### 2. BA ĐỘ PHÂN GIẢI NPC
Mọi NPC đều **CÓ** mục tiêu lưu trong state. Nhưng mô phỏng ở ba mức khác nhau, nếu
không thì chi phí sẽ nổ:

| Tầng | Số lượng | Cách chạy |
|---|---|---|
| **A — LLM** | tối đa 8–12 NPC cùng lúc | Là những người đang ở trung tâm câu chuyện của người chơi: lãnh chúa trực tiếp, chư hầu lớn, kẻ thù chính, người thân, đối thủ chính trị. Được LLM suy nghĩ thật, ra quyết định phức tạp, bất ngờ. |
| **B — LUẬT ENGINE** | vài chục tới vài trăm | NPC có vai trò. Chạy bằng cây quyết định deterministic dựa trên mục tiêu, tính cách, nguồn lực. Rẻ, nhanh, vẫn ra hành vi hợp lý. |
| **C — THỐNG KÊ** | phần còn lại | Chỉ tiến triển bằng bảng xác suất rẻ: già đi, cưới, chết, đổi chức, giàu lên nghèo đi. **"THỨC DẬY"** lên tầng B hoặc A khi: người chơi tới gần, họ đạt một mốc quan trọng, hoặc họ dính vào việc của người chơi. |

Tầng của một NPC được tính lại mỗi tháng theo khoảng cách tới người chơi và mức liên
quan. **Người chơi không bao giờ thấy sự chuyển tầng này.**

### 3. MÔ HÌNH AGENT
```ts
type Agent = {
  npcId; tier: 'A'|'B'|'C';
  goals: { id; kind; target; priority; deadline?; progress }[];
  personality; resources; relationships;
  knowledge: string[];              // agent này biết những gì — KHÁC người chơi
  pendingActions; lastActedTick;
};
```
Mục tiêu: chiếm một thành trì, cưới một người, leo lên một tước vị, trả thù, tích
tiền, bảo vệ con cái, lên hồng y, che giấu một bí mật, tìm một cổ vật.

**QUAN TRỌNG:** mỗi agent có tri thức RIÊNG. Một bá tước ở biên cương không biết
chuyện vừa xảy ra ở kinh đô. Agent hành động dựa trên cái họ TƯỞNG là đúng, không
phải dựa trên state thật. **Đây là nguồn sinh ra sai lầm, hiểu lầm, và kịch tính.**

### 4. TICK NHANH — mỗi lượt chơi
Rẻ, deterministic, **KHÔNG gọi LLM.** Chạy trong vài mili giây.
- thời gian trôi, thời tiết
- tiến độ xây dựng, hành quân, vây hãm, đường hầm
- tiêu thụ lương thực, tiến triển thương tích và bệnh
- lan truyền tin tức (mục 6)
- agent tầng B thực thi hành động đã lên kế hoạch
- kiểm tra điều kiện kích hoạt sự kiện
- lorebook trigger từ Phần 4

### 5. TICK SÂU — mỗi tháng trong game
Đây là chỗ dùng proxy riêng với model rẻ đã cấu hình ở Phần 1 (profile `worldtick`).
```
B1  Engine tổng hợp tình hình: ai đang ở đâu, ai muốn gì, chuyện gì mới xảy ra
B2  GỘP NHIỀU AGENT VÀO MỘT REQUEST. Không gọi từng NPC một.
    Một request xử lý 8–12 agent tầng A, trả về JSON:
    [{ npcId, decision, reasoning, targetId?, magnitude: 'nhỏ'|'vừa'|'lớn' }]
    LLM KHÔNG được trả con số. `magnitude` là mức độ, engine quy ra số.
B3  Agent tầng B chạy cây quyết định engine.
B4  Agent tầng C chạy bảng xác suất.
B5  Engine phân giải mọi quyết định: tung xúc sắc qua Phần 5, tính hệ quả,
    cập nhật state qua MVU của Phần 2.
B6  Quốc gia và tôn giáo cập nhật theo Phần 14.
B7  Sinh sự kiện và tin tức.
B8  Tính lại tầng cho từng agent.
```

**Trần chi phí bắt buộc:** cấu hình được số request tối đa mỗi tháng, mặc định 3.
Vượt trần thì phần dư rơi xuống tầng B. Hiện chi phí tích lũy ở tab Debug.
Có nút **tắt hẳn LLM** trong mô phỏng ngầm, chỉ chạy engine — game vẫn phải hoạt động
bình thường, chỉ là thế giới kém bất ngờ hơn.

### 6. TIN TỨC LAN TRUYỀN — cơ chế đặc trưng thế kỷ 14
Sự kiện xảy ra ở một tọa độ. Nó **KHÔNG** tự động vào tri thức của người chơi.
```ts
type NewsItem = {
  eventId; origin: {x,y}; occurredAt: GameDate;
  importance: 1-5;
  speed;                    // km/ngày: sứ giả nhanh, thương nhân chậm, tin đồn
  accuracy: number;         // 0-100, GIẢM DẦN theo khoảng cách
  distortions: string[];    // những chi tiết đã bị bóp méo
};
```

**Quy tắc:**
- Tin đi theo tuyến đường thật: đường cái nhanh, núi và biển chậm, mùa đông chậm.
- **Càng xa thì đến càng muộn VÀ càng sai.** Một trận thua có thể tới nơi thành một trận thắng. Số quân bị thổi lên gấp ba.
- Sự kiện `importance` cao đi nhanh hơn và xa hơn.
- Khi tin đến nơi người chơi đang ở, mới ghi vào slice tri thức của Phần 4, với `confidence` bằng accuracy còn lại.
- Người chơi có thể chủ động: nuôi sứ giả riêng, mua tin từ thương nhân, cài gián điệp — tăng tốc độ và độ chính xác cho một vùng.
- **Tin SAI vẫn được ghi vào tri thức và AI kể chuyện sẽ dựa vào nó.** Người chơi có thể ra quyết định lớn dựa trên tin sai. Đây là tính năng, không phải lỗi.

### 7. SỰ KIỆN & THÔNG BÁO
```ts
type WorldEvent = {
  id; kind; scope: 'thế giới'|'quốc gia'|'vùng'|'thành trì'|'cá nhân';
  importance: 1-5;
  requiresDecision: boolean;
  options?: EventOption[];
  deadline?: GameDate;
  effects;
};
```

**HAI LUỒNG HIỂN THỊ — không giấu gì, nhưng không chôn vùi:**

**LUỒNG 1 — KHUNG CHẶN MÀN HÌNH**
Chỉ dành cho việc **CẦN NGƯỜI CHƠI QUYẾT ĐỊNH**, hoặc `importance = 5`.
Ví dụ: Giáo hoàng ra tuyên bố lớn (vạ tuyệt thông, kêu gọi thập tự chinh, cấm chế một
vương quốc) → khung nhảy ra, có hình ấn Giáo hoàng, nội dung tuyên bố do AI viết, và
các nút lựa chọn nếu liên quan tới người chơi.
Nhiều khung cùng lúc thì **XẾP CHỒNG thành một chồng thẻ**, người chơi lật từng cái,
không phải đóng lần lượt từng hộp thoại.

**LUỒNG 2 — DÒNG TIN LUÔN HIỂN THỊ**
Mọi thứ còn lại chảy vào một bảng bên cạnh, kiểu biên niên. Không chặn gì.
Người chơi tự lọc theo: mức quan trọng, phạm vi, quốc gia, chủ đề, độ tin cậy.
Có ô tìm kiếm và có lưu trữ vĩnh viễn trong Tầng B.
Tin quan trọng nhưng không cần quyết định thì nhấp nháy ở đầu dòng tin cho tới khi
người chơi đọc.

**Mỗi thông báo hiển thị kèm ĐỘ TIN CẬY và NGUỒN:** *"sứ giả từ Köln, tin 12 ngày
trước, độ tin cậy 60%"*. Người chơi phải học cách nghi ngờ.

### 8. VIẾT NỘI DUNG SỰ KIỆN
- Sự kiện `importance` 4–5 gọi LLM để viết văn bản (tuyên bố, thư, tin đồn). Gộp nhiều sự kiện vào một request. Model rẻ đủ dùng.
- Sự kiện `importance` 1–3 dùng mẫu văn bản có sẵn với biến thay thế, **KHÔNG gọi LLM.**

### 9. CHỐNG TRÔI DẠT
Mô phỏng dài hạn dễ trôi về những trạng thái vô lý. Bắt buộc có:
- **Kiểm tra bất biến sau mỗi tick sâu:** dân số không âm, không ai giữ hai lần cùng một tước, không có quốc gia không đất, người chết không hành động. Vi phạm → ghi log, tự sửa về trạng thái hợp lệ gần nhất, **KHÔNG im lặng bỏ qua.**
- **Trần biến động:** một tháng không thể làm một quốc gia mất quá X% lãnh thổ, trừ khi có chiến tranh thật đã mô phỏng.
- Nhật ký mô phỏng đầy đủ trong Tầng B, tua lại được để tìm chỗ hỏng.

### 10. SLICE `world`
```
thời gian, thời tiết, mọi chỉ số thế giới    engine
hàng đợi sự kiện, tin đang lan               engine
mục tiêu và tính cách agent                  ai (qua tick sâu, có kiểm duyệt)
tin đồn, dư luận                             ai
```
Biến phụ: bản đồ tri thức của người chơi, chỉ số ổn định châu lục.

### 11. UI
- Dòng tin bên phải, luôn hiển thị, có bộ lọc đầy đủ
- Chồng thẻ sự kiện cần quyết định, kèm hạn chót
- **"Biên niên sử":** xem lại toàn bộ theo năm, lọc được, tìm được
- **Bản đồ tri thức:** vùng nào mình nắm rõ, vùng nào chỉ nghe đồn, vùng nào mù tịt
- Tab Debug thêm: nhật ký tick sâu, số request đã dùng, chi phí tích lũy, danh sách agent theo tầng, và nút "chạy thử 12 tháng"

### 12. VIỆC CẦN LÀM
1. `/src/sim/` — tick nhanh, tick sâu, agent, ba tầng phân giải.
2. Bộ gộp request cho tầng A, dùng profile `worldtick` của Phần 1.
3. Trần chi phí + nút tắt LLM trong mô phỏng.
4. Hệ tin tức: tốc độ theo đường, suy giảm độ chính xác, bóp méo nội dung.
5. Nối vào slice tri thức Phần 4 — người chơi chỉ biết khi tin tới nơi.
6. Hệ sự kiện + hai luồng hiển thị + chồng thẻ.
7. Sinh văn bản sự kiện, gộp request, dùng mẫu cho tin nhỏ.
8. Kiểm tra bất biến + trần biến động + nhật ký.
9. UI như mục 11.
10. **Test A:** chạy 5 năm mô phỏng KHÔNG có người chơi. Kiểm tra bất biến không vi phạm lần nào, và in ra 20 sự kiện lớn nhất.
11. **Test B:** đứng ở một vùng xa, cho một sự kiện lớn xảy ra ở đầu kia bản đồ. Đo xem sau bao nhiêu ngày tin tới, và nội dung đã sai lệch thế nào.
12. **Test C:** đo chi phí thật của 12 tháng mô phỏng với model rẻ. In ra số token và số tiền ước tính.

### 13. Sau khi xong
Đưa ra kết quả cả ba bài test. **Test C quan trọng nhất** — cần biết chơi một năm
trong game tốn bao nhiêu tiền proxy.
