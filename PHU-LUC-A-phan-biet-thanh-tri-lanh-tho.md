# PHỤ LỤC A — TỪ VỰNG VÀ QUY TẮC PHÂN BIỆT
*Áp dụng cho: Phần 3 (khối prompt), Phần 12, Phần 13, và mọi phần sau.*

> **ĐỌC PHỤ LỤC NÀY TRƯỚC KHI BẮT ĐẦU PHẦN 12, không phải sau.**

**Mục tiêu: làm cho AI KHÔNG THỂ lẫn, chứ không phải nhắc AI đừng lẫn.**

---

## 1. BA KHÁI NIỆM, KHÔNG PHẢI HAI

| | **THÀNH TRÌ** | **LÃNH THỔ** | **THÁI ẤP** |
|---|---|---|---|
| Là gì | một ĐIỂM có thể đi bộ hết trong một ngày | một VÙNG phải cưỡi ngựa nhiều ngày mới đi hết | một TỜ GIẤY CÓ ẤN TRIỆN |
| Có gì | tường, ô đất, công trình, kho, dân đếm được | nhiều tỉnh, mỗi tỉnh chứa nhiều thành trì | tước vị + quyền trên một lãnh thổ + nghĩa vụ phải trả |
| Người chơi làm gì | **XÂY NÓ** | **CAI TRỊ NÓ** | **ĐƯỢC PHONG / THỪA KẾ / BỊ TƯỚC** |
| Ví dụ | thành Ehrenfeld, làng Brogg, pháo đài Cửa Núi | Bá quốc Swabia, Công quốc Tây Sơn Lộ | thái ấp Bá tước Swabia |

Ba thứ này có thể cùng tên chủ nhưng **KHÔNG BAO GIỜ là một thứ**.
Mất thái ấp không có nghĩa là mất thành trì. Chiếm được thành trì không có nghĩa là
được thái ấp. Đây là nguồn kịch tính, không phải chi tiết vụn.

---

## 2. TỪ BỊ CẤM TUYỆT ĐỐI

### ⛔ "LÃNH ĐỊA"
Cấm dùng trong mọi prompt, mọi UI, mọi tên biến, mọi dữ liệu.
Đây là từ gây lẫn nặng nhất vì tiếng Việt dùng nó cho cả ba nghĩa. Nếu thấy nó xuất
hiện ở bất kỳ đâu trong code hay data, thay ngay bằng đúng một trong ba từ trên.

Cấm luôn: *"đất đai của ngài"*, *"vùng đất của ngài"*, *"cơ ngơi"* — đều mơ hồ.

---

## 3. BA CÂU HỎI PHÂN LOẠI
*(đưa vào khối prompt số 2)*

Trước khi viết bất kỳ câu nào nhắc tới đất đai, tự hỏi:
```
Thứ này có TỌA ĐỘ và đi bộ tới được trong một ngày không?  → THÀNH TRÌ
Thứ này có PHẠM VI ÁP DỤNG và phải cưỡi ngựa nhiều ngày?   → LÃNH THỔ
Thứ này là một VĂN BẢN hoặc một DANH VỊ?                    → THÁI ẤP
```

---

## 4. BỘ ĐỘNG TỪ ĐỘC QUYỀN — đây là công cụ mạnh nhất
Mỗi động từ chỉ đi với đúng một loại. Dùng sai là sai.

| Loại | Động từ |
|---|---|
| **THÀNH TRÌ** | xây, dựng, sửa, phá dỡ, đặt (công trình), mở rộng tường, tích trữ, đồn trú, vây hãm, công phá, đốt, chiếm giữ, tuần tra, coi sóc, cấp lương |
| **LÃNH THỔ** | cai trị, ban luật, bãi luật, thu thuế, xử án, phân xử, bổ nhiệm, cách chức, tuần du, dẹp loạn, chia cắt, sáp nhập, gọi quân, cấp phép |
| **THÁI ẤP** | phong, thụ phong, thừa kế, tước đoạt, từ bỏ, tuyên thệ, nộp nghĩa vụ, đòi yêu sách, kiện tụng, công nhận |

### CẤM GHÉP CHÉO — mười cụm sai thường gặp nhất
Phải chặn bằng bộ kiểm tra ở mục 10.
```
✗ xây … trong bá quốc           → phải xây trong một thành trì cụ thể
✗ cai trị thành Ehrenfeld       → thành trì thì "coi sóc", "quản"
✗ thu thuế của thành trì        → thành trì "nộp nghĩa vụ", không bị "thu thuế"
✗ vây hãm bá quốc               → chỉ vây hãm được một thành trì
✗ ban luật trong lâu đài        → luật thuộc lãnh thổ
✗ tường thành của bá quốc       → tường thuộc thành trì
✗ dân số của lãnh thổ là 1.240  → con số chính xác chỉ thuộc thành trì
✗ chiếm được thái ấp            → chiếm thành trì, ĐOẠT thái ấp
✗ mở rộng công quốc bằng cách xây thêm → mở rộng bằng sáp nhập, không phải xây
✗ kho lương của công quốc       → kho thuộc thành trì
```

---

## 5. ĐƠN VỊ ĐO PHẢI KHÁC NHAU
Đây là tín hiệu thị giác mạnh nhất cho AI: nhìn con số là biết đang nói về gì.

| Loại | Đơn vị | Cấm |
|---|---|---|
| **THÀNH TRÌ** | người (1.240 dân) · công trình (12 công trình) · ô (3×2 ô) · tuần (còn 6 tuần) · giạ lúa · thước tường · số quân đồn trú | **KHÔNG BAO GIỜ dùng phần trăm** |
| **LÃNH THỔ** | tỉnh (4 tỉnh) · phần trăm (thuế 18%) · ngày đường (5 ngày ngựa) · chư hầu (3 chư hầu) · số hộ ước chừng · điểm bất ổn | **KHÔNG BAO GIỜ nhắc tên một công trình cụ thể** |
| **THÁI ẤP** | ngày nghĩa vụ (40 ngày/năm) · phần cống nộp · số con tin · năm còn hiệu lực · điều khoản | |

---

## 6. CHÍNH XÁC VS ƯỚC LƯỢNG — quy tắc rất hiệu quả

- **THÀNH TRÌ nói con số CHÍNH XÁC:** *"Ehrenfeld có 1.240 dân, kho còn 380 giạ."*
  Lãnh chúa biết rõ thành mình.
- **LÃNH THỔ nói con số ƯỚC CHỪNG:** *"toàn bá quốc chừng chín nghìn nhân khẩu."*
  Không ai đếm được cả một vùng trong thế kỷ 14.

**Bắt buộc:** mọi con số cấp lãnh thổ trong prompt phải được làm tròn và kèm chữ
*"ước chừng"*, *"khoảng"*, *"chừng"*. Engine tính chính xác trong state, nhưng ĐƯA
VÀO PROMPT thì làm tròn (hàm `fmt.approx()` ở Phần 3 mục 8).

Điều này vừa đúng bối cảnh vừa khiến AI tự động dùng giọng khác cho hai tầng.

---

## 7. HAI KHỐI PROMPT RIÊNG BIỆT — không bao giờ gộp
Thay khối 6 "Bảng trạng thái hiện tại" của Phần 3 bằng HAI khối riêng, đặt cách xa
nhau trong thứ tự (ít nhất 3 khối), có khung trình bày khác hẳn.

### Khối 6A — THÀNH TRÌ (đặt trước)
```
╔═ THÀNH TRÌ ĐANG ĐỨNG: <tên> ═══════════════════
║ Cấp: Trấn (cấp 3/5) · Tường: gỗ và đất, còn nguyên
║ Dân: 1.240 người · Lòng dân: khá · Đồn trú: 60 quân
║ Kho: 380 giạ lúa, 12 tạ sắt, 40 thước vải
║ Công trình: cối xay (bên suối), lò rèn, nhà nguyện, chợ,
║             doanh trại, 3 dãy nhà ở
║ Đang xây: tháp canh phía bắc — còn 6 tuần, thiếu 20 nhân công
║ Cầm cự được nếu bị vây: 14 tuần
╚═══════════════════════════════════════════════
```
> ĐÂY LÀ MỘT ĐIỂM. Được phép nói tới từng công trình, từng viên đá, từng người có
> tên. KHÔNG được nói tới luật, thuế suất, chư hầu.

### Khối 6B — LÃNH THỔ (đặt sau, cách vài khối)
```
┌─ LÃNH THỔ CAI TRỊ: Bá quốc Swabia ───────────────
│ Thái ấp: Bá tước Swabia, thụ phong năm 1337, chính danh 72
│ Gồm 4 tỉnh · rộng chừng 5 ngày ngựa từ đông sang tây
│ Nhân khẩu ước chừng chín nghìn
│ Thuế suất: nông 18%, thương 12% · Bất ổn: thấp
│ Chư hầu: 3 nam tước — Reinhard (trung), Otto (lung lay), Hilda (trung)
│ Luật đang áp: cấm tư chiến, độc quyền cối xay
│ Nghĩa vụ nợ Công tước: 40 ngày quân dịch/năm, cống 200 đồng
│ Vụ đang chờ xử: tranh chấp ranh giới rừng Ehr với nam tước Otto
└─────────────────────────────────────────────
```
> ĐÂY LÀ MỘT VÙNG. Được phép nói tới luật, thuế, chư hầu, kiện tụng.
> KHÔNG được nhắc tên một công trình cụ thể, không nói con số chính xác.

**Hai khung dùng KÝ TỰ VIỀN KHÁC NHAU (`╔` và `┌`) là cố ý.** Đó là mỏ neo thị
giác để AI không trộn hai vùng thông tin.

---

## 8. TÁM CẶP VÍ DỤ SAI / ĐÚNG
*(đưa nguyên vào khối prompt số 2 — AI học từ đối chiếu tốt hơn nhiều so với học từ quy tắc trừu tượng)*

**1.**
- ✗ *"Ngài cho xây thêm một cối xay trong bá quốc Swabia."*
- ✓ *"Ngài cho xây thêm một cối xay ở thành Ehrenfeld, thuộc bá quốc Swabia."*
- Lý do: xây thì phải xây ở một điểm. Bá quốc không có chỗ để đặt cối xay.

**2.**
- ✗ *"Năm nay thành Ehrenfeld đóng thuế 400 đồng cho ngài."*
- ✓ *"Năm nay Ehrenfeld nộp 400 đồng theo nghĩa vụ thái ấp."*
- Lý do: thuế là thứ lãnh thổ thu từ DÂN. Thành trì thì NỘP NGHĨA VỤ.

**3.**
- ✗ *"Quân địch đang vây hãm bá quốc Swabia."*
- ✓ *"Quân địch đang vây hãm thành Ehrenfeld, tòa chính của bá quốc Swabia. Mất nó thì cả bá quốc coi như mất."*
- Lý do: không vây được một vùng. Chiếm vùng nghĩa là chiếm các thành trì.

**4.**
- ✗ *"Ngài ban lệnh cấm săn trong lâu đài."*
- ✓ *"Ngài ban lệnh cấm săn trong các khu rừng của bá quốc."*
- Lý do: luật có phạm vi áp dụng, thuộc lãnh thổ.

**5.**
- ✗ *"Dân số lãnh thổ của ngài là 1.240 người."*
- ✓ *"Ehrenfeld có 1.240 dân. Toàn bá quốc thì ước chừng chín nghìn."*
- Lý do: chính xác thuộc thành trì, ước chừng thuộc lãnh thổ.

**6.**
- ✗ *"Ngài đánh chiếm được thái ấp Bá tước Swabia."*
- ✓ *"Ngài đánh chiếm được ba thành trì của bá quốc. Nhưng thái ấp vẫn thuộc về Reinhard cho tới khi Công tước chính thức tước của ông ta."*
- Lý do: đất chiếm bằng quân, danh vị chiếm bằng pháp lý. Hai việc khác nhau.

**7.**
- ✗ *"Kho lương của công quốc đã cạn."*
- ✓ *"Kho lương của thành Cửa Núi đã cạn. Các thành khác trong công quốc vẫn còn, nhưng đường tiếp tế mất mười ngày."*
- Lý do: lãnh thổ không có kho. Chỉ thành trì mới chứa được vật.

**8.**
- ✗ *"Ngài mở rộng bá quốc bằng cách xây thêm một trấn mới."*
- ✓ *"Ngài dựng một trấn mới ở tỉnh phía đông. Bá quốc không rộng thêm, nhưng có thêm một điểm tựa."*
- Lý do: xây thêm thành trì KHÔNG làm lãnh thổ lớn ra. Lãnh thổ chỉ lớn lên bằng sáp nhập, thừa kế, hoặc được phong.

---

## 9. QUY TẮC DỮ LIỆU CHỐNG NHẬP NHẰNG TỪ GỐC

**a) THÀNH TRÌ VÀ LÃNH THỔ KHÔNG BAO GIỜ ĐƯỢC TRÙNG TÊN.**
Trình sinh dữ liệu phải kiểm tra và đổi tên nếu trùng. Đây là nguồn lẫn lớn nhất,
và chặn được ngay từ khâu dữ liệu thì AI không có cơ hội lẫn.

**b) Tiền tố id bắt buộc:**
```
hold_*   thành trì      prov_*   tỉnh
realm_*  lãnh thổ       fief_*   thái ấp
```
Nhìn id là biết loại.

**c) Trong mọi văn bản đưa cho AI, tên thành trì luôn kèm loại từ:**
*"thành Ehrenfeld"*, *"làng Brogg"*, *"pháo đài Cửa Núi"* — không bao giờ chỉ
*"Ehrenfeld"* trần trụi. Tên lãnh thổ cũng vậy: *"bá quốc Swabia"*.

**d) Một tỉnh KHÔNG PHẢI là một thành trì.**
Tỉnh là đơn vị chia nhỏ của lãnh thổ, nó CHỨA các thành trì.
Ba tầng: **lãnh thổ > tỉnh > thành trì**.

---

## 10. BỘ KIỂM TRA SAU KHI AI VIẾT
Chạy ở bước 5 của turn loop, trước khi hiển thị.

**Tầng 1 — QUÉT CỤM CẤM**
Đối chiếu với bảng 10 cụm sai ở mục 4, bằng regex có xét ngữ cảnh.
Phát hiện → đánh dấu, chưa từ chối.

**Tầng 2 — KIỂM TRA THỰC THỂ**
Trích mọi tên riêng AI nhắc tới. Tra vào ba sổ đăng ký (thành trì, lãnh thổ, thái ấp).
Ba loại lỗi:
- tên không tồn tại trong sổ nào → AI bịa địa danh
- tên là lãnh thổ nhưng đi kèm động từ thành trì → lẫn tầng
- nhắc công trình không có trong thành trì đó → bịa công trình

**Tầng 3 — XỬ LÝ**
| Mức | Xử lý |
|---|---|
| 1 lỗi nhẹ | hiển thị bình thường, ghi log, chèn một dòng nhắc vào khối prompt lượt sau: *"Lượt trước bạn viết X, đúng phải là Y."* |
| 2 lỗi trở lên, hoặc 1 lỗi nặng (bịa địa danh, đảo kết quả) | dùng vòng sửa lỗi tầng 1 của Phần 2: gửi lại cho AI danh sách câu sai kèm sửa mẫu, yêu cầu **VIẾT LẠI CHỈ NHỮNG CÂU ĐÓ**, không viết lại cả đoạn |

Đếm tỷ lệ lỗi theo thời gian, hiện ở tab Debug. Nếu tỷ lệ không giảm sau 20 lượt
thì khối prompt số 2 viết chưa đủ rõ, phải sửa văn bản.

---

## 11. AI ĐƯỢC BỊA GÌ VÀ KHÔNG ĐƯỢC BỊA GÌ

| | |
|---|---|
| **ĐƯỢC** | tên một con hẻm trong thành, tên chủ quán, một tin đồn, thời tiết, mùi và âm thanh, một người qua đường không tên tuổi, cảm xúc của dân chúng, lời bàn tán trong chợ |
| **KHÔNG** | công trình mới (đó là dự án xây dựng, phải qua Phần 12) · thành trì mới, tỉnh mới, lãnh thổ mới · chư hầu mới, tước vị mới, luật mới · **bất kỳ con số nào** |

Nếu AI muốn có một thứ trong nhóm KHÔNG, nó phải đề xuất qua khối `UpdateVariable`
hoặc phát event, và engine quyết định.

---

## 12. VIỆC CẦN LÀM
1. Viết lại nội dung khối prompt số 2 `[LOCKED]`, nhồi đủ mục 1, 3, 4, 8, 11. Đây là khối quan trọng nhất — viết dài cũng được, nó là priority 10 nên không bao giờ bị cắt.
2. Tách khối 6 thành 6A và 6B như mục 7, hai template EJS riêng, hai khung ký tự viền khác nhau, đặt cách nhau ít nhất 3 khối trong thứ tự mặc định.
3. Bộ làm tròn số `fmt.approx()` cho khối 6B (mục 6).
4. Quy tắc dữ liệu mục 9: kiểm tra trùng tên, tiền tố id, loại từ bắt buộc.
5. Bộ kiểm tra ba tầng ở mục 10.
6. Rà toàn bộ code và data đã viết ở Phần 0–14, **thay hết từ "lãnh địa"**.
7. **Test:** chạy 30 lượt có nội dung liên quan tới cả thành trì lẫn lãnh thổ. In ra bảng: lượt nào có lỗi lẫn tầng, lỗi loại gì, tầng nào bắt được. Mục tiêu dưới 1 lỗi trên 20 lượt.

## 13. Sau khi xong
Đưa ra nội dung khối prompt số 2 đã viết và bảng kết quả test 30 lượt.

---

## ⚡ NẾU PHẢI CẮT BỚT VÌ TOKEN
Ba thứ mạnh nhất, theo thứ tự: **cấm từ "lãnh địa"** (mục 2), **hai khung viền khác
nhau** (mục 7), và **tám cặp ví dụ** (mục 8). Giữ ba cái đó, bỏ phần còn lại cũng được.
