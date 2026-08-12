# PHẦN 3 — EJS ENGINE & PROMPT MANAGER
*Tiền đề: Phần 0, 1, 2 đã xong. Vẫn CHƯA làm lorebook và gameplay.*

### 1. Mục tiêu
Biến state của Phần 2 thành prompt gửi cho AI ở Phần 1, qua một hệ thống khối
kéo thả được, template EJS sửa trực tiếp trong game, và ngân sách token tự cắt.

### 2. QUYẾT ĐỊNH KIẾN TRÚC
- Pipeline lắp prompt: trong code (`/src/ai/pipeline.ts`).
- Nội dung từng khối: bản ghi trong IndexedDB (Tầng A).
- Mặc định gốc: file `.ejs` trong `/prompts`, nạp bằng `import.meta.glob(..., {as:'raw'})`. Lần chạy đầu tiên gieo vào IndexedDB. Sau đó IndexedDB là nguồn sự thật.
- Có nút "Khôi phục mặc định" cho từng khối và cho toàn bộ.
- Export/Import cả bộ khối ra một file `.json` (chia sẻ được như card ST).

**Lý do:** kéo thả và bật/tắt được nghĩa là khối phải là DỮ LIỆU. Để nguyên file
`.ejs` thì mỗi lần sửa phải build lại, không dùng được lúc đang chơi.

### 3. MÔ HÌNH KHỐI PROMPT
```ts
type PromptBlock = {
  id: string;
  name: string;                       // hiện trên UI kéo thả
  enabled: boolean;
  locked: boolean;                    // true = không xóa, không tắt được
  role: 'system'|'user'|'assistant';
  placement: 'sequential' | { depth: number };   // depth = chèn ngược từ cuối
  order: number;
  template: string;                   // EJS
  condition?: string;                 // biểu thức EJS, false thì bỏ khối
  budgetPriority: number;             // 1 = cắt đầu tiên, 10 = không bao giờ cắt
};
```

### 4. BỘ KHỐI MẶC ĐỊNH
Thứ tự khởi tạo, người chơi kéo đổi được.

| # | Khối | Priority | |
|---|---|---|---|
| 1 | Vai trò & giọng kể | 9 | |
| 2 | Luật bất biến cho AI | 10 | **[LOCKED]** |
| 3 | Bối cảnh thế giới (tĩnh) | 6 | |
| 4 | Lorebook động | 7 | ← Phần 4 cắm vào |
| 5 | Hồ sơ nhân vật người chơi | 9 | |
| 6A | Bảng THÀNH TRÌ | 9 | ← xem Phụ lục A |
| 6B | Bảng LÃNH THỔ | 9 | ← xem Phụ lục A |
| 7 | Thương tích & ảnh hưởng | 8 | |
| 8 | Cảnh hiện tại (nơi chốn, NPC, thời gian) | 9 | |
| 9 | Tóm tắt lịch sử xa | 4 | |
| 10 | Lịch sử gần (nguyên văn) | 5 | |
| 11 | KẾT QUẢ XÚC SẮC CỦA ENGINE | 10 | **[LOCKED]** |
| 12 | Hành động người chơi | 10 | **[LOCKED]** |
| 13 | Định dạng đầu ra + cú pháp UpdateVariable | 10 | **[LOCKED]** |

Bốn khối `[LOCKED]` không được tắt hay xóa: thiếu 11 là AI bịa số (phá R1),
thiếu 13 là không parse được patch (phá Phần 2). UI phải chặn cứng, không chỉ ẩn nút.

Khối 6A và 6B PHẢI đặt cách nhau ít nhất 3 khối trong thứ tự mặc định — xem Phụ lục A mục 7.

Nội dung khối 2 phải diễn giải R1–R6 thành lời cho AI, đại ý:
- Kết quả xúc sắc đã có sẵn ở khối 11. Anh KHÔNG được đảo ngược nó. Thất bại là thất bại, dù anh thấy nó không hợp lý.
- Anh KHÔNG được viết ra con số máu, tiền, quân số, tài nguyên. Muốn thay đổi thì mô tả bằng lời, engine sẽ tự tính.
- Chỉ đề xuất biến thuộc quyền `ai` trong khối UpdateVariable.
- Toàn bộ quy tắc phân biệt thành trì / lãnh thổ / thái ấp ở Phụ lục A.

### 5. ENGINE TEMPLATE
- Dùng `ejs` bản chạy trình duyệt. Nếu vướng CSP/`new Function`, chuyển sang `eta` nhưng phải GIỮ NGUYÊN cú pháp `<%= %>` / `<% %>` / `<%- %>`.
- Mỗi lần render bọc try/catch. Template lỗi → khối đó bị bỏ qua, ghi lỗi lên UI, lượt chơi VẪN chạy tiếp. Không được để một dấu ngoặc thiếu làm treo game.
- Có timeout guard: template chạy quá 500ms thì abort (chống vòng lặp vô tận).

### 6. CONTEXT ĐƯA VÀO TEMPLATE
Đối tượng locals gồm:
```
state    – toàn bộ state, BỌC PROXY CHỈ ĐỌC. Ghi vào là throw ngay.
           Lý do: template ghi state sẽ phá vỡ hợp đồng MVU của Phần 2.
d        – biến phụ
roll     – kết quả xúc sắc engine đã tung ở bước 2 turn loop
lore     – entry lorebook đã match (Phần 4 điền vào, giờ để mảng rỗng)
history  – các lượt gần đây
scene    – nơi chốn, NPC có mặt, thời tiết, thời gian
now      – ngày giờ trong game
budget   – { total, used, remaining }
q        – bộ hàm truy vấn (mục 8)
fmt      – bộ hàm định dạng
```

### 7. LỚP MACRO KIỂU SILLYTAVERN
Chạy TRƯỚC EJS (macro là bước tiền xử lý văn bản).

Hỗ trợ: `{{user}}` `{{char}}` `{{time}}` `{{date}}` `{{weekday}}` `{{lastMessage}}`
`{{random:a,b,c}}` `{{roll:2d6+1}}` `{{pick:a,b,c}}` `{{getvar::path}}` `{{setvar::x::y}}`
`{{// ghi chú }}` `{{trim}}` `{{noop}}` `{{newline}}` `{{original}}`

#### 7.1 HAI KHÔNG GIAN TÊN TÁCH RỜI
Preset SillyTavern thật dùng `setvar`/`getvar` tới hàng trăm lần, và chúng KHÔNG
phải state game — chúng là BIẾN NHÁP CỦA PROMPT (cờ ngôn ngữ đầu ra, độ dài,
quy tắc ngôi kể). Nên phải tách hai không gian:

**KHÔNG GIAN NHÁP (prompt scratch)**
- `{{setvar::x::y}}` và `{{getvar::x}}` ghi và đọc ở đây.
- Xóa sạch ở đầu MỖI lần lắp prompt. Không lưu vào save.
- Không bao giờ chạm được vào state game.
- Đây là nơi mọi preset ST hiện có chạy được nguyên vẹn, không phải sửa.

**KHÔNG GIAN STATE GAME**
- Chỉ MVU của Phần 2 được ghi. Không có ngoại lệ.
- Template ĐƯỢC PHÉP ĐỌC, qua tiền tố bắt buộc: `{{getvar::@state.character.stats.str}}`
- `{{setvar::@state.…}}` → **LỖI CỨNG**. Hiện lỗi ngay trong editor template với thông báo: *"Không ghi được vào state từ template. Dùng khối UpdateVariable."*

#### 7.2 HAI RÀNG BUỘC VỀ NGẪU NHIÊN
- (a) `{{random}}`, `{{roll}}`, `{{pick}}` phải dùng SEEDED RNG của Phần 0, tuyệt đối không `Math.random`. Nếu không thì R3 (tái lập được) sụp đổ.
- (b) Kết quả macro ngẫu nhiên phải CACHE theo lượt. Khi Phần 2 gọi lại AI để sửa patch, prompt render lại phải ra y hệt. Khác đi là AI bị nhiễu.

#### 7.3 THỨ TỰ XỬ LÝ MỘT KHỐI
```
1. Regex có promptOnly, placement phù hợp
2. Macro nháp (setvar/getvar) — theo thứ tự xuất hiện, một lượt duy nhất
3. Macro lồng nếu MacroNest bật
4. EJS render
5. Đếm token
```
Bước 2 phải chạy TRƯỚC bước 4, vì preset ST đặt `setvar` ở khối đầu và đọc ở
khối cuối — nghĩa là phạm vi nháp là TOÀN BỘ prompt, không phải từng khối.

### 8. HÀM GAME TỰ VIẾT (object `q`)
Giai đoạn này chỉ cần khung + vài hàm chạy được, các hàm còn lại trả stub.
Về sau mỗi Phần gameplay sẽ bổ sung hàm của mình vào đây.
```
q.npc(id)            q.relation(id)        q.injuries()
q.title()            q.holding()           q.realm()
q.army()             q.nation(id)          q.skills(branch)
q.recentEvents(n)    q.rumors()            q.calendar()

fmt.date(d)  fmt.money(n)  fmt.list(arr)  fmt.table(rows)  fmt.pct(n)
fmt.approx(n)   ← làm tròn số cấp lãnh thổ, xem Phụ lục A mục 6
```
Quy tắc: hàm trong `q` phải PURE và CHỈ ĐỌC. Không hàm nào được gây side effect.

### 9. NGÂN SÁCH TOKEN
- Cấu hình được: tổng ngân sách, chừa bao nhiêu cho đầu ra.
- Đếm token: dùng endpoint `countTokens` của provider khi có (Gemini có). Không có thì ước lượng. **LƯU Ý:** tiếng Việt tốn token hơn tiếng Anh nhiều, ước lượng theo tỷ lệ ~2.5 ký tự/token chứ đừng dùng con số của tiếng Anh.
- Khi vượt ngân sách: cắt theo `budgetPriority` từ thấp lên. Trong cùng một priority thì cắt khối dài nhất trước.
- Khối priority 10 KHÔNG BAO GIỜ bị cắt. Nếu chỉ còn khối priority 10 mà vẫn vượt → dừng lại, báo lỗi rõ ràng, không gửi đi.
- Hiện thanh ngân sách trực quan trên Prompt Manager: từng khối một màu, nhìn ra ngay khối nào đang ăn hết token.

### 10. UI PROMPT MANAGER
Tab mới cạnh Cài đặt:
- Danh sách khối kéo thả đổi thứ tự (dnd-kit hoặc tương đương)
- Mỗi dòng: `[☰ kéo] [✓ bật] [tên] [role] [depth] [số token] [⚙ sửa]`
- Khối `[LOCKED]` hiện ổ khóa, không kéo ra khỏi vị trí bắt buộc, không tắt được
- Nút: Thêm khối / Nhân bản / Xóa / Khôi phục mặc định / Export / Import
- Panel bên phải: XEM TRƯỚC prompt hoàn chỉnh đã render với state hiện tại, tô màu theo khối, hiện tổng token

### 11. EDITOR TEMPLATE
Mở từ nút ⚙:
- Khung soạn EJS có tô cú pháp (CodeMirror)
- Khung xem trước render ngay, cập nhật khi gõ (debounce 300ms)
- Lỗi template hiện ngay dưới, kèm số dòng
- Bảng tra cứu bên cạnh: liệt kê mọi biến trong locals và mọi macro, click là chèn vào vị trí con trỏ
- Nút "Khôi phục khối này về mặc định"

### 12. VIỆC CẦN LÀM TRONG PROMPT NÀY
1. `/src/ai/ejs.ts` — render, proxy chỉ đọc, try/catch, timeout guard.
2. `/src/ai/macros.ts` — lớp macro + hai không gian tên (7.1) + seeded RNG + cache theo lượt.
3. `/src/ai/query.ts` — object `q` và `fmt` (khung + vài hàm thật).
4. `/src/ai/blocks.ts` — mô hình khối, gieo mầm từ `/prompts`, CRUD, export/import.
5. `/src/ai/budget.ts` — đếm và cắt theo priority.
6. `/src/ai/pipeline.ts` — lắp khối theo order + depth thành `LLMRequest` của Phần 1.
7. UI Prompt Manager + editor.
8. Viết đủ 14 file `.ejs` mặc định trong `/prompts`. Nội dung khối 2, 11, 13 phải viết cẩn thận, đây là ba khối giữ cho R1 và MVU không vỡ.
9. **Test đầu-cuối:** bấm gửi một hành động giả → prompt được lắp đúng → gọi AI thật → nhận về narrative + khối UpdateVariable → Phần 2 apply được.
   Đây là lần đầu tiên toàn bộ turn loop chạy thông. **Ưu tiên cao nhất.**

### 13. Sau khi xong
Đưa ra nội dung ba khối `[LOCKED]` số 2, 11, 13 đã viết, để chỉnh chữ nghĩa
trước khi sang Phần 4.
