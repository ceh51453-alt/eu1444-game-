# PHẦN 12 — THÀNH TRÌ: XÂY DỰNG MỘT ĐIỂM
*Tiền đề: Phần 0–11 xong. Slice mới: `holdings`.*

> ⚠️ **ĐỌC PHỤ LỤC A TRƯỚC KHI BẮT ĐẦU PHẦN NÀY.**

### 1. RANH GIỚI VỚI PHẦN 13 — ĐỌC KỸ, KHÔNG ĐƯỢC VI PHẠM
**THÀNH TRÌ** là MỘT ĐIỂM trên bản đồ. Có tọa độ, có tường, có lưới ô, có công
trình cụ thể, có dân số đếm được, có kho hàng đếm được. Người chơi XÂY nó, đặt từng
công trình. Đây là tầng vi mô.

**LÃNH THỔ** (Phần 13) là MỘT VÙNG chứa nhiều điểm. Người chơi không đặt viên gạch
nào ở đó. Người chơi ban chính sách, thu thuế, bổ nhiệm quan, xử án, giữ chư hầu.
Đây là tầng vĩ mô.

**Thực thi bằng kiến trúc, không chỉ bằng lời:**
- Hai slice riêng: `holdings` và `realm`. KHÔNG slice nào đọc thẳng vào slice kia.
- Trao đổi qua đúng **ba giao diện khai báo tường minh**:
```
holding → realm    : nộp thuế, nộp quân dịch, đóng góp sản lượng
realm → holding    : cấp phép xây, bảo hộ, trưng dụng, đặt luật
holding ↔ holding  : buôn bán, tiếp tế
```
- Không con số nào tồn tại ở cả hai chỗ. Dân số là của thành trì. Tổng dân vùng là **BIẾN PHỤ** cộng từ các thành trì, không phải biến gốc.
- **Nếu thấy mình đang viết một hàm đọc cả hai slice để tính một con số, dừng lại — đó là dấu hiệu đã lẫn hai tầng.**

Một người có thể cùng lúc có: một **TÒA CHÍNH** (thành trì chính, nơi ở), vài thành
trì phụ, và một lãnh thổ rộng lớn chứa cả thành trì của chư hầu mà mình không xây và
không sở hữu.

### 2. BỐN CON ĐƯỜNG CÓ THÀNH TRÌ
| Con đường | Đặc điểm |
|---|---|
| **Xuất thân** | quý tộc bắt đầu có sẵn. Dân trung thành, nhưng có thể cũ nát, nợ nần, hoặc bị anh em tranh chấp quyền thừa kế. |
| **Được phong** | lãnh chúa ban vì công lao. Kèm nghĩa vụ: quân dịch, thuế, và có thể bị thu hồi nếu thất sủng. |
| **Đánh chiếm** | lấy từ Phần 11. Dân THÙ ĐỊCH, công trình hư hại, và luôn còn một người tự nhận là chủ hợp pháp ở đâu đó. Chính danh thấp. |
| **Phát triển lên** | tìm hoặc mua một thôn nhỏ rồi nuôi lớn qua 5 cấp. Chậm nhất, nhưng dân trung thành nhất và hoàn toàn theo ý mình. |

Mỗi con đường ghi vào state một `legitimacy` khác nhau. Chính danh thấp ảnh hưởng:
dân phục tùng, chư hầu công nhận, và khả năng bị kiện lên lãnh chúa cấp trên (Phần 13).

### 3. NĂM CẤP KHU ĐỊNH CƯ
| Cấp | Tên | Dân số | Tường | Lưới | Mở thêm |
|---|---|---|---|---|---|
| 1 | Thôn | <100 | không | 4×4 | nông trại, giếng, nhà gỗ |
| 2 | Làng | 100–500 | hàng rào gỗ | 6×6 | cối xay, lò rèn, nhà nguyện |
| 3 | Trấn | 500–2.000 | tường gỗ/đất | 9×9 | chợ, xưởng nghề, doanh trại |
| 4 | Thành | 2.000–8.000 | tường đá | 12×12 | nhà thờ, tòa án, xưởng lớn |
| 5 | Đại thành | 8.000+ | tường đá nhiều lớp | 16×16 | đại giáo đường, thư viện, xưởng đúc, tháp chính |

**Lên cấp cần ĐỦ BỐN thứ:**
- a) dân số đạt ngưỡng
- b) có đủ công trình tiên quyết
- c) đủ tiền và vật liệu
- d) **CÓ GIẤY PHÉP từ lãnh chúa cấp trên**

Điểm (d) rất quan trọng và rất đặc trưng thế kỷ 14: xây thành lũy mà không được
phép là tội. Thành xây lậu bị coi là mối đe dọa, lãnh chúa có quyền đem quân san
bằng. Người chơi VẪN được phép xây lậu — nhưng phải chấp nhận hệ quả đó, và Phần 15
phải để lãnh chúa thật sự phản ứng.

Khi lên cấp, lưới **MỞ RỘNG** chứ không reset. Công trình cũ giữ nguyên vị trí. Dời
tường ra ngoài là một dự án xây dựng riêng, rất tốn kém.

### 4. LƯỚI Ô TỰ DO
- Mỗi thành trì có một lưới theo cấp. Mỗi ô có địa hình riêng sinh từ vị trí thật trên bản đồ: sông, suối, đồi, đá gốc, rừng, đất tốt, đầm.
- Công trình có kích thước chiếm chỗ: 1×1, 2×2, 2×3, 3×3.
- **KỀ NHAU CÓ Ý NGHĨA** — đây là chỗ tạo chiều sâu cho việc quy hoạch:
```
cối xay kề sông            +sản lượng lớn
xưởng thuộc da kề nhà ở    −hạnh phúc mạnh (mùi hôi)
chợ kề cổng chính          +thương mại
lò rèn kề mỏ sắt           −chi phí vận chuyển
nhà thờ kề quảng trường    +hạnh phúc, +ảnh hưởng tôn giáo
nhà ở kề tường             −hạnh phúc khi bị vây (dễ trúng đạn)
kho lương gần giếng        +chịu vây hãm
```
- **Bố cục ảnh hưởng thẳng tới Phần 11:** đường đi trong thành, chỗ thắt cổ chai, vị trí kho lương và giếng đều là dữ liệu tổng công dùng lại.

### 5. CÔNG TRÌNH
`/data/buildings.json`. Nhóm:
```
Sản xuất     nông trại, cối xay, lò rèn, xưởng mộc, mỏ, thuộc da, dệt, lò gốm,
             vườn nho, xưởng bia, lò muối
Quân sự      doanh trại, kho vũ khí, trường bắn, chuồng ngựa, xưởng cung nỏ
Dân sinh     nhà ở các cấp, giếng, quảng trường, nhà tắm, bệnh xá, quán trọ
Tôn giáo     nhà nguyện, nhà thờ, tu viện, đại giáo đường
Hành chính   sảnh lãnh chúa, nhà tù, tòa án, kho bạc, nhà thuế
Học vấn      thư viện, trường học, xưởng chép sách
Phòng thủ    tường, tháp, cổng, hào, lỗ châu mai, tháp chính
Đặc thù tộc  xưởng khắc rune (Lùn), lùm thiêng (Mộc Tộc), tháp huyền thuật
             (Cao Tiên), hầm sâu (Lùn Vực Sâu), tổ chuông (Quạ Nhân)
```

**Nhóm PHÒNG THỦ đổ thẳng vào đối tượng `Fortification` của Phần 11.** Xây gì hôm
nay quyết định cuộc vây hãm năm sau. Phải nối thật, không phải hai hệ rời nhau.

Mỗi công trình: kích thước, vật liệu, số tuần, nhân công cần, yêu cầu cấp, tiên
quyết, sản lượng, chi phí duy trì, hiệu ứng kề nhau, hiệu ứng hạnh phúc.

### 6. TÀI NGUYÊN & NHÂN CÔNG
**Tài nguyên:** lương thực, gỗ, đá, sắt, len, vải, muối, da, than, tiền.
Nguồn: ô địa hình quanh thành trì, thương mại, cống nạp, cướp bóc.

**NHÂN CÔNG là ràng buộc thật sự, không phải tiền:**
- Dân vừa phải làm ruộng vừa phải xây. Kéo người đi xây thì mùa màng kém.
- Mùa vụ: gieo và gặt hút gần hết nhân lực. Xây nhiều vào hai mùa đó là đói.
- **Mùa đông không xây được công trình đá** (vữa không đông). Chỉ chuẩn bị vật liệu.
- Thợ lành nghề khác dân thường: thợ đá, thợ mộc, thợ rèn phải thuê hoặc đào tạo. Công trình lớn cần một **KIẾN TRÚC SƯ** — một NPC thật, phải đi tìm.

### 7. XÂY DỰNG THEO TUẦN
- Mỗi công trình là một dự án: `{ buildingId, ô đặt, tuần còn lại, nhân công đang phân, vật liệu đã giao, tiến độ }`
- Tiến độ mỗi tuần = f(nhân công, tay nghề kiến trúc sư, mùa, vật liệu đủ hay không)
- Gián đoạn được: chiến tranh, dịch bệnh, đói, thiếu vật liệu, thợ bỏ đi.
- Khi hoàn thành, kiểm định 3d6 chất lượng (theo phân miền Phần 5):
```
đại thành công    công trình vượt trội, +sản lượng hoặc +integrity vĩnh viễn
thành công        đúng thiết kế
thành công có giá vượt ngân sách hoặc chậm, nhưng dùng được
thất bại          chất lượng kém, sản lượng thấp, mau hỏng
đại thất bại      sập trong lúc xây, chết người, mất vật liệu
```
- Công trình xuống cấp theo thời gian, cần chi phí duy trì. Bỏ bê là hỏng.

### 8. DÂN SỐ & LÒNG DÂN
**Dân số tăng khi:** dư lương, an toàn, có việc làm, có nhà ở.
**Giảm khi:** đói, dịch, bị cướp phá, thuế nặng, chiến tranh, bỏ đi nơi khác.

**Lòng dân (0–100)** từ: no đủ, thuế, công lý, tôn giáo, an ninh, vẻ đẹp thành trì,
danh tiếng lãnh chúa, thương tật/tai tiếng của lãnh chúa (nối Phần 7).
```
thấp → sản lượng giảm → trộm cắp → bạo loạn → bỏ trốn hàng loạt
```

**Thành phần dân cư:** nông nô, dân tự do, thợ, thương nhân, giáo sĩ, quý tộc nhỏ.
Mỗi nhóm có yêu cầu riêng và phản ứng khác nhau với cùng một chính sách.

**Chủng tộc trong thành:** nhiều chủng tộc chung sống thì có căng thẳng riêng, lấy
từ bảng quan hệ chủng tộc ở Phần 6 và hệ `PowerDemographics` ở Phần 14 mục 3.

### 9. QUÂN ĐỒN TRÚ & QUÂN DỊCH
Thành trì sinh ra đơn vị cho Phần 10 và 11:
`số lượng và chất lượng = f(dân số, công trình quân sự, lòng dân, tước vị)`

Gọi quân làm giảm nhân công và sản lượng. Gọi quá nhiều quá lâu là kiệt quệ.
Nghĩa vụ quân dịch với lãnh chúa cấp trên: bao nhiêu ngày mỗi năm — **chính là con
số hạn nghĩa vụ mà Phần 11 dùng khi đi vây thành.**

### 10. SLICE `holdings` — quyền ghi
```
mọi con số (dân, tài nguyên, tiến độ, integrity)      engine
bố cục lưới, hàng đợi xây dựng                        engine (người chơi bấm)
tên thành trì, tên công trình do người chơi đặt        locked sau khi đặt
danh tiếng địa phương, tin đồn trong thành             ai
quan hệ với các nhân vật trong thành                   ai
```
Biến phụ: tổng sản lượng, sức chứa vây hãm (số tuần cầm cự), quân số huy động được,
chỉ số phòng thủ tổng hợp.

### 11. UI
- Bản đồ lưới thành trì, kéo thả đặt công trình, hiện trước hiệu ứng kề nhau
- Bảng tài nguyên và nhân công, có dự báo theo mùa
- Hàng đợi xây dựng với tiến độ từng tuần
- Bảng dân cư: theo nhóm, theo chủng tộc, lòng dân từng nhóm
- Bảng "Nếu bị vây": số tuần cầm cự được, điểm yếu bố cục, nối sang Phần 11
- Nút chuyển nhanh giữa các thành trì đang sở hữu, đánh dấu rõ tòa chính

### 12. VIỆC CẦN LÀM
1. `/data/buildings.json`, `/data/settlement-tiers.json`, `/data/resources.json`, `/data/adjacency.json`
2. Slice `holdings` hỗ trợ NHIỀU thành trì, có đánh dấu tòa chính.
3. Lưới ô + đặt công trình + hiệu ứng kề nhau + mở rộng lưới khi lên cấp.
4. Hệ nhân công theo mùa và hệ xây dựng theo tuần, có kiểm định chất lượng.
5. Dân số, lòng dân, phân tầng xã hội, căng thẳng chủng tộc.
6. **Nối nhóm công trình phòng thủ vào `Fortification` của Phần 11** — THẬT SỰ nối, xây thêm tháp phải làm cuộc vây hãm khác đi.
7. Nối quân đồn trú vào Phần 10.
8. Bốn con đường sở hữu + chỉ số chính danh.
9. Giấy phép xây từ lãnh chúa (Phần 13 sẽ hoàn thiện, giờ để cờ tạm).
10. UI như mục 11.
11. **Test:** nuôi một Thôn lên Đại thành. In ra số năm cần, các nút thắt gặp phải, và nhân công thiếu ở khúc nào. Nếu đi hết 5 cấp mà dưới 20 năm trong game thì quá nhanh, phải chỉnh lại.

### 13. KIỂM TRA RANH GIỚI — bắt buộc báo cáo
Sau khi xong, liệt kê **MỌI chỗ trong code mà slice `holdings` chạm tới dữ liệu
ngoài nó.** Nếu có chỗ nào không đi qua ba giao diện ở mục 1, nói rõ ra.
Cần chắc hai tầng không lẫn vào nhau trước khi sang Phần 13.
