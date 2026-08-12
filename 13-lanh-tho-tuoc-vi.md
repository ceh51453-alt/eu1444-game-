# PHẦN 13 — CAI TRỊ MỘT VÙNG ĐẤT
*Tiền đề: Phần 0–12 xong. Slice mới: `realm`, `titles`, `vassals`.*

> ⚠️ **ĐỌC PHỤ LỤC A TRƯỚC.**

### 1. RANH GIỚI VỚI PHẦN 12 — NHẮC LẠI VÌ ĐÂY LÀ CHỖ DỄ LẪN NHẤT
- **THÀNH TRÌ (P12)** — một điểm. Lưới ô. Đặt từng công trình. Đếm từng người.
- **LÃNH THỔ (P13)** — một vùng. Không có lưới ô. Không đặt công trình nào. Chỉ ban chính sách, thu thuế, bổ nhiệm, xử án, giữ chư hầu.

**Ví dụ phân định để làm chuẩn cho mọi trường hợp về sau:**
```
cối xay trong làng          → THÀNH TRÌ. Đặt vào một ô cụ thể.
con đường nối hai trấn      → LÃNH THỔ. Là một dự án vùng, không có ô nào.
tường thành                 → THÀNH TRÌ.
luật cấm săn trong rừng     → LÃNH THỔ.
kho lương của thành         → THÀNH TRÌ.
thuế suất áp cho cả quận    → LÃNH THỔ.
```
**Quy tắc kiểm tra:** nếu thứ đó có TỌA ĐỘ thì nó thuộc thành trì. Nếu nó chỉ có
PHẠM VI ÁP DỤNG thì nó thuộc lãnh thổ.

`realm` KHÔNG được đọc thẳng vào `holdings`. Tổng dân, tổng sản lượng, tổng quân của
một vùng đều là BIẾN PHỤ cộng qua giao diện đã khai ở Phần 12 mục 1.

### 2. THANG TƯỚC VỊ CHUẨN (đế quốc / Tây Âu)
```
0  Thường dân      không có bảng trạng thái cai trị
1  Hiệp sĩ         có thể giữ một trang viên, KHÔNG phải lãnh thổ
2  Nam tước        một thái ấp nhỏ: vài làng + một thành trì
3  Tử tước         phó của bá tước, coi một huyện, chưa có chư hầu riêng
4  Bá tước         MỘT QUẬN. Ngưỡng quan trọng: lần đầu có CHƯ HẦU THẬT.
5  Hầu tước        quận biên cương, quyền quân sự lớn hơn, tự khai chiến
                   với ngoại bang mà không cần xin phép
6  Công tước       MỘT CÔNG QUỐC gồm nhiều quận. Có hội đồng, có luật riêng,
                   có quyền đúc tiền.
7  Tuyển hầu       chỉ trong Đế quốc: quyền bầu hoàng đế
8  Vương           một vương quốc
9  Hoàng đế        đế quốc
```

### 3. THANG RIÊNG THEO QUỐC GIA VÀ CHỦNG TỘC
Không phải ai cũng đi theo thang trên. `/data/titles.json` phải cho phép mỗi phe một
thang khác hẳn, với cách lên khác hẳn:

| Phe | Thang | Cách lên |
|---|---|---|
| **Đế quốc Orc** | Học viên → Sĩ quan → Chỉ huy quân đoàn → Đại thần → Tể tướng | **theo NĂNG LỰC**, không thế tập, không dòng dõi |
| **Liên bang Lùn** | Thợ cả → Đại biểu bang → Chấp chính bang → Chủ tịch liên bang | **BẦU CỬ có nhiệm kỳ**, mất chức được |
| **Cao Tiên (Đông La Mã)** | theo dòng máu và tuổi | gần như không thể leo lên nếu sinh sai nhà |
| **Giáo hội** | Linh mục → Giám mục → Tổng giám mục → Hồng y → Giáo hoàng | thang **SONG SONG**, không dính phong kiến, lên bằng bầu cử và vận động |
| **Thành bang Latin** | Ủy viên → Nghị viên → Tổng đốc | BẦU CỬ có nhiệm kỳ, tiền quyết định |
| **Hãn quốc thảo nguyên** | Thủ lĩnh → Nội hãn → Đại Hãn | sức mạnh + được các bộ tộc công nhận |
| **Thương hội** | Học việc → Thợ bạn → Thợ cả → Trưởng phường → Hội trưởng | tay nghề + vốn |
| **Baltic / Lâm Tiên** | không có tước vị, chỉ có uy tín trong hội đồng bô lão | |

Người chơi có thể giữ **NHIỀU tước ở NHIỀU thang cùng lúc.** Mỗi tước mở một bảng
trạng thái riêng. Xung đột nghĩa vụ giữa hai thang là nguồn kịch tính chính của tầng
cao (ví dụ vừa là chư hầu của Hoàng đế vừa là Giám mục của Giáo hoàng khi hai bên
xung đột).

### 4. MỖI CẤP MỞ RA BẢNG TRẠNG THÁI VÀ LỐI CHƠI GÌ
**Đây là yêu cầu cốt lõi.** Mỗi cấp phải cho một trò chơi KHÁC, không phải cùng một
trò với con số to hơn.

| Cấp | Bảng trạng thái | Lối chơi |
|---|---|---|
| **Hiệp sĩ** | tùy tùng, ngựa, giáp, nợ, nghĩa vụ với lãnh chúa | nhận nhiệm vụ, đấu giải, chỉ huy một đơn vị (P10), tìm chủ tốt, gây dựng danh vọng |
| **Nam tước** | một thành trì + vài làng, thuế thô, quân dịch nợ trên | toàn bộ Phần 12, hầu tòa lãnh chúa, tranh chấp ranh giới |
| **Tử tước** | sổ thuế của huyện, danh sách làng, khiếu nại của dân | hành chính thay mặt bá tước, ăn chặn hoặc liêm chính, bị kẹp giữa dân và cấp trên |
| **Bá tước** | **BẢNG QUẬN mở ra** — chư hầu, thuế suất, luật lệ, tòa án, trật tự trị an, quân dịch huy động được | giữ chư hầu khỏi phản, xử án, cân thuế với lòng dân, **lần đầu chơi cờ chính trị** |
| **Hầu tước** | thêm biên phòng, thương mại biên giới, quan hệ ngoại bang | chiến tranh biên giới tự quyết, mua chuộc bộ lạc bên kia |
| **Công tước** | **BẢNG CÔNG QUỐC** — nhiều quận, hội đồng, luật riêng, tiền đúc riêng, quan hệ với các công quốc khác | chính trị cấp quốc gia, liên minh, hôn nhân chính trị, bổ nhiệm và cách chức bá tước |
| **Tuyển hầu** | lá phiếu, giá của lá phiếu, phe trong Đế quốc | mặc cả bầu cử hoàng đế |
| **Vương** | **BẢNG VƯƠNG QUỐC** — ngoại giao, tuyên chiến, Giáo hội, tài chính quốc gia, kế vị | cai trị qua các công tước, ai cũng có thể phản |
| **Hoàng đế** | **BẢNG ĐẾ CHẾ** + minigame CẢI CÁCH ĐẾ CHẾ (Phần 14) | giữ một cỗ máy quá lớn không rã ra |

**Nguyên tắc:** mỗi lần lên cấp, người chơi phải MẤT quyền kiểm soát trực tiếp một
thứ và NHẬN LẠI quyền gián tiếp qua người khác. Bá tước không còn tự tay xây cối
xay nữa — ông ta ra lệnh cho nam tước, và nam tước có thể không nghe.

### 5. BA CON ĐƯỜNG LÊN TƯỚC
| Con đường | Chính danh |
|---|---|
| **Được phong** | lãnh chúa ban vì công lao, tiền, hoặc để mua chuộc. Chính danh cao nhất. Kèm nghĩa vụ nặng. |
| **Thừa kế** | theo luật kế vị của phe đó (mục 9). Chính danh cao. Có thể phải tranh với anh em. |
| **Chiếm đoạt** | đánh chiếm, ép nhượng, giết người thừa kế, giả mạo giấy tờ. **Chính danh THẤP:** chư hầu không phục, hàng xóm có cớ gây chiến, Giáo hội có thể không công nhận. Phải bỏ nhiều năm gây dựng lại. |

**Chính danh (legitimacy 0–100) là chỉ số trung tâm của Phần 13**, ảnh hưởng gần như
mọi kiểm định cai trị.

### 6. MÔ HÌNH LÃNH THỔ
```ts
type Province = {
  id; name; parentRealmId;
  terrain; climate; area;
  holdingIds: string[];            // trỏ sang P12, KHÔNG sao chép dữ liệu
  holderId;                        // ai giữ province này
  development; unrest; banditry;
  cultureMix; raceMix;             // ảnh hưởng lòng dân và tuyển quân
  resources; roads; infrastructure;
  laws: LawId[];
};
```
Realm = tập province + tập chư hầu + luật + tài chính + quan hệ ngoại giao.
**KHÔNG có lưới ô ở tầng này.**

**Dự án cấp vùng** (khác hẳn công trình cấp thành trì): đường, cầu, khai hoang, tháo
nước đầm lầy, mở tuyến thương mại, lập chợ phiên, dựng đồn biên.

### 7. CHƯ HẦU — NPC THẬT, CÓ THỂ PHẢN
```ts
type Vassal = {
  npcId; titleId; provinceIds;
  loyalty;                         // 0-100
  power;                           // quân, tiền, đất so với lãnh chúa
  ambition; personality;
  claims: string[];                // yêu sách với đất của người khác
  obligations: { tax; levyDays; courtAttendance };
  grievances: Grievance[];         // ghi nhớ mọi lần bị đối xử tệ
};
```
**Lòng trung giảm vì:** thuế nặng, gọi quân quá nhiều, xử án bất công, chính danh
lãnh chúa thấp, bị lấy mất đất, thấy lãnh chúa yếu, có phe khác chiêu dụ.
**Tăng vì:** ban đất, ban tước, thắng trận, xử án công bằng, hôn nhân, quà cáp, lãnh
chúa có uy nghi cao.

Chư hầu mạnh + lòng trung thấp + có yêu sách = **NỔI LOẠN**. Nhiều chư hầu liên kết
thành phe. Đây phải là mối đe dọa thường trực ở tước vị cao, không phải sự kiện hiếm.

**Hợp đồng phong kiến hai chiều:** người chơi cũng NỢ lãnh chúa cấp trên (thuế, số
ngày quân dịch — chính là con số Phần 11 dùng, hầu tòa). Không làm tròn thì bị kiện,
bị phạt, bị tước đất.

### 8. CAI TRỊ
**Hành động:** đặt thuế suất theo từng nhóm dân, ban và bãi luật, mở tòa xử án,
phong và tước tước vị, **CẤP GIẤY PHÉP XÂY** (nối thẳng vào Phần 12 mục 3), gọi
quân, khởi công dự án vùng, cử sứ, sắp đặt hôn nhân, bổ nhiệm quan lại.

**Triều đình:** quản gia (tài chính), nguyên soái (quân), chưởng ấn (ngoại giao),
gián điệp trưởng, giáo sĩ trưởng. Mỗi ghế là một NPC thật có năng lực và lòng trung
riêng, làm việc thay người chơi và có thể làm hỏng hoặc ăn chặn.

**Xử án:** kiện tụng giữa chư hầu, tội phạm, tranh chấp ranh giới. Người chơi phán
quyết. Mỗi phán quyết làm hài lòng một bên và mất lòng bên kia. Nếu hai bên không
phục, có thể yêu cầu **QUYẾT ĐẤU TƯ PHÁP** — chuyển thẳng sang Phần 9. Xử công bằng
tăng chính danh, xử thiên vị tăng lòng trung một phe.

Kiểm định cai trị dùng 3d6 theo phân miền Phần 5 (năng lực dài hạn).

### 9. THỪA KẾ
Luật kế vị khác nhau theo phe, để trong `/data/succession.json`:
```
trưởng nam         gọn, tập trung quyền
chia đều           chia đất cho các con — Đế quốc rã dần, rất đúng lịch sử
bầu cử             quý tộc bầu, mở đường mua phiếu
mạnh nhất          thảo nguyên và một số bộ lạc: thách đấu giành ngôi
theo dòng mẹ       một số chủng tộc
theo năng lực      Đế quốc Orc: hội đồng chọn người giỏi nhất
```
Không có người thừa kế = khủng hoảng, hàng xóm nhảy vào tranh.

**Khi nhân vật người chơi chết:** chơi tiếp bằng người thừa kế, kế thừa đất và tước
nhưng KHÔNG kế thừa kỹ năng và quan hệ. Đây là cơ chế chơi dài hạn, làm cho cái chết
không phải là màn hình game over.

### 10. SLICE — quyền ghi
```
'realm'   mọi con số (thuế, tài chính, unrest, phát triển)      engine
          luật đang áp, dự án đang chạy                          engine
          tin đồn trong vùng, dư luận                            ai
'titles'  tước đang giữ, chính danh                              engine
'vassals' loyalty, power, obligations                            engine
          grievances, ambition, tin đồn về chư hầu               ai
```
Biến phụ: tổng thu, tổng quân huy động được, chỉ số ổn định, nguy cơ nổi loạn, tổng
dân vùng (cộng từ holdings qua giao diện).

### 11. UI
- Bản đồ vùng theo province, tô màu theo chủ sở hữu / unrest / phát triển
- **Bảng trạng thái ĐỔI THEO TƯỚC VỊ đang giữ, đúng mục 4.** Tước nào chưa đạt thì bảng đó không tồn tại, không phải hiện ra rồi khóa.
- Người chơi giữ nhiều tước → có tab chuyển giữa các bảng
- Bảng chư hầu: lòng trung, sức mạnh, yêu sách, mối hận đang ôm, có thanh cảnh báo nguy cơ nổi loạn
- Sổ nghĩa vụ: mình nợ ai cái gì, ai nợ mình cái gì, hạn chót
- Tòa án: danh sách vụ đang chờ phán quyết
- Cây gia tộc và thứ tự kế vị, hiện rõ ai sẽ nối nghiệp

### 12. VIỆC CẦN LÀM
1. `/data/titles.json` (đủ 8 thang ở mục 3), `/data/laws.json`, `/data/succession.json`, `/data/provinces.json`
2. Slice `realm`, `titles`, `vassals` + quyền ghi mục 10.
3. Hệ chính danh, ảnh hưởng vào mọi kiểm định cai trị.
4. Chư hầu đầy đủ: lòng trung, phe cánh, nổi loạn thật sự.
5. Hợp đồng phong kiến hai chiều, nối số ngày quân dịch sang Phần 11.
6. Triều đình với NPC thật đảm nhiệm từng ghế.
7. Xử án + nối sang quyết đấu tư pháp Phần 9.
8. Cấp giấy phép xây, nối sang Phần 12 mục 3.
9. Thừa kế + chơi tiếp bằng người thừa kế khi nhân vật chết.
10. UI đổi bảng theo tước vị, đúng mục 4.
11. **Test A:** một Bá tước có 4 chư hầu, tăng thuế lên tối đa trong 5 năm. Phải dẫn tới nổi loạn. In đường cong lòng trung ra.
12. **Test B — KIỂM TRA RANH GIỚI:** grep toàn bộ code, liệt kê mọi chỗ `realm` chạm vào `holdings`. Mọi chỗ đều phải đi qua giao diện đã khai. Báo cáo danh sách đó.

### 13. Sau khi xong
Đưa ra kết quả Test A và danh sách ở Test B.
