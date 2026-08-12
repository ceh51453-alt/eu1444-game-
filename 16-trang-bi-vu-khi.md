# PHẦN 16 — TRANG BỊ, VŨ KHÍ, GIÁP TRỤ
*Tiền đề: Phần 0–15 xong. Slice mới: `items`, `equipment`.*
*THAY THẾ `/data/weapons.json` và `/data/armor.json` phác thảo ở Phần 9.*

### 1. NGUYÊN TẮC
- **a) GIÁP KHÔNG TRỪ SÁT THƯƠNG.** Giáp quyết định LOẠI thương tích nào CÓ THỂ xảy ra ở vùng đó. Đã nêu ở Phần 9 mục 7, giờ hiện thực đầy đủ.
- **b) TRANG BỊ TIẾN HÓA THEO THỜI GIAN.** Mỗi món có `eraFrom` và `eraTo`. Đầu thế kỷ chỉ có giáp lưới và áo giáp mảnh; cuối thế kỷ mới có giáp tấm toàn thân. Thợ rèn phải HỌC được kiểu mới thì mới làm được. Người chơi sống đủ lâu sẽ thấy chiến trường thay đổi trước mắt.
- **c) TRANG BỊ LÀ TÀI SẢN LỚN.** Một bộ giáp tấm đầy đủ đáng giá bằng một trang viên. Đây là lý do tù binh quý tộc sinh lời và là lý do người ta cướp xác.
- **d) MỌI HIỆU ỨNG** đăng ký qua registry modifier của Phần 5. Không tính riêng.

### 2. MÔ HÌNH VẬT PHẨM
```ts
type Item = {
  id; templateId; name;
  kind: 'weapon'|'armor'|'shield'|'clothing'|'tool'|'mount'|'supply'|'trinket';
  material: MaterialId;
  quality: 1|2|3|4|5;            // vụng → tuyệt tác
  condition: 0-100;
  damage: ItemDamage[];          // hư hỏng cụ thể, xem mục 10
  fitTo?: string;                // npcId người được đo may, xem mục 8
  weight; value;
  eraFrom?: number; eraTo?: number;
  enchantment?: Enchantment;
  heraldry?: { ownerId; device; visible: boolean };
  history: string[];             // ai từng cầm, dùng trong trận nào
  covers?: BodyRegionId[];       // chỉ giáp
  stats: Record<string, number>;
};
```
`history` không phải trang trí: một thanh kiếm từng giết một vị vua có giá trị xã hội
riêng, và AI phải được biết để kể đúng.

### 3. Ô TRANG BỊ — NỐI THẲNG VÀO 20 VÙNG CỦA PHẦN 7
Không dùng ô trang bị trừu tượng kiểu "áo giáp / mũ / giày". **Mỗi món giáp khai báo
nó CHE những vùng cơ thể nào.** Đây là chỗ nối quan trọng nhất.

| Món | Che vùng |
|---|---|
| mũ bascinet | skull |
| + tấm che mặt | skull, face |
| + màng lưới cổ | neck, shoulderL, shoulderR (một phần) |
| đại mũ trụ | skull, face (nhưng phạt PER rất nặng) |
| áo giáp lưới dài | chest, abdomen, upperBack, lowerBack, upperArm×2, thigh×2 (rộng nhưng mỏng) |
| áo giáp mảnh | chest, abdomen, upperBack |
| yếm giáp tấm | chest |
| giáp lưng | upperBack, lowerBack |
| giáp vai | shoulder (trái hoặc phải) |
| giáp cánh tay | upperArm |
| giáp cẳng tay | forearm |
| găng sắt | hand |
| váy giáp | hips |
| giáp đùi | thigh |
| giáp ống chân | shin |
| **áo lót độn (gambeson)** | chest, abdomen, upperArm×2, thigh×2 — **nền của mọi bộ**, KHÔNG có nó thì giáp lưới gần như vô dụng trước đòn đập |

Mỗi món ở mỗi vùng cho một `coverage` 0–100 và một `protectionType`:
**chống chém / chống đâm / chống đập — ba giá trị RIÊNG, KHÔNG gộp thành một số.**

### 4. KHE HỞ — cơ chế trung tâm
Cộng dồn `coverage` của mọi món trên từng vùng. Vùng nào chưa đủ 100 là còn khe.
Khe điển hình của giáp tấm thế kỷ 14: **nách, bẹn, sau đầu gối, khuỷu trong, khe mắt,
lòng bàn tay, gan bàn chân.**

Khi có đòn trúng:
1. Tra vùng trúng (bảng d100 Phần 7)
2. Lấy `coverage` và `protectionType` của vùng đó theo LOẠI đòn
3. Kẻ tấn công có thể **CHỌN nhắm vào khe hở** — nhưng phải qua kiểm định khó hơn hẳn (thang độ khó Phần 5, thường là Rất khó hoặc Cực khó), và cần node kỹ thuật tương ứng ở Phần 8 (nửa kiếm, đâm khe)
4. Ba khả năng:
```
xuyên qua giáp   → thương tích đầy đủ
bị giáp chặn     → chuyển thành chấn thương kín nhẹ hoặc không gì
đập xuyên qua    → giáp tấm chặn lưỡi nhưng KHÔNG chặn lực: chùy, búa,
                   rìu cán dài gây gãy xương và nội thương ngay qua giáp
```

UI phải hiện bản đồ che phủ trên chính hình người của Phần 7: vùng nào kín, vùng nào
hở, hở bao nhiêu. Người chơi nhìn là biết mình yếu chỗ nào.

### 5. VŨ KHÍ THẾ KỶ 14
`/data/weapons.json`. Mỗi món: tầm với, tốc độ, trọng lượng, tay cầm, loại sát thương
(có thể nhiều loại), khả năng chống giáp theo từng loại, kỹ năng dùng, node yêu cầu,
giá, `eraFrom`/`eraTo`.

**KIẾM**
```
kiếm ngắn một tay   nhanh, chém tốt, gần như vô dụng trước giáp tấm
trường kiếm         hai tay, xuất hiện giữa thế kỷ, dùng nửa kiếm được,
                    đổi giữa chém và đâm, vũ khí linh hoạt nhất
kiếm bản to         chém mạnh, chống giáp lưới tốt, chống giáp tấm kém
dao rondel          đâm khe hở, vũ khí KẾT LIỄU kẻ mặc giáp đã ngã.
                    Trận nào cũng kết thúc bằng nó chứ không phải bằng kiếm.
```
**CÁN DÀI**
```
giáo bộ binh        khắc kỵ binh khi giữ đội hình (Phần 10)
giáo dài            rất dài, chỉ hiệu quả theo khối
kích/halberd        chém + đâm + móc, đa dụng nhất
rìu cán dài         xuyên giáp tấm bằng lực, vũ khí tốt nhất chống hiệp sĩ
thương kỵ           chỉ dùng khi phi ngựa, dùng một lần rồi gãy
```
**ĐẬP**
```
chùy                xuyên giáp tấm bằng chấn thương kín
búa chiến           mỏ nhọn xuyên tấm, đầu búa gây gãy xương
gậy sắt             rẻ, hiệu quả bất ngờ
```
**TẦM XA**
```
cung dài            tầm xa, xuyên giáp lưới ở cự ly gần, cần nhiều năm luyện
                    (nối Phần 14b mục A: đòi tầng dân tự do)
cung ngắn / cung kỵ bắn được trên lưng ngựa
cung sừng phức hợp  của tộc du mục, mạnh và ngắn, hỏng khi mưa
nỏ                  dễ học, mạnh, nạp chậm, có thể bắn xuyên giáp tấm ở gần
nỏ hạng nặng        cần tời quay, cực chậm, cực mạnh
lao                 ném, dùng trước khi giáp lá cà
```
**THUỐC SÚNG** (hiếm, xem mục 15)

### 6. VẬT LIỆU
`/data/materials.json`. Vật liệu **KHÔNG xếp thành thang tốt-hơn tuyến tính.**
Mỗi loại mạnh ở một mặt và yếu ở mặt khác.
```
sắt rèn          rẻ, mềm, dễ móp và cong, giữ lưỡi kém
thép tôi         tiêu chuẩn của thợ giỏi, cân bằng
thép Lùn         tôi giỏi hơn, giữ lưỡi rất lâu, nhẹ hơn cùng độ dày.
                 CHỈ mua được từ Liên bang Núi hoặc thợ Lùn lưu vong.
thép khắc rune   vật liệu nền cộng một hiệu ứng, xem mục 14
gỗ thủy tùng     cung dài tốt nhất
gỗ Lâm Tiên      cung nhẹ, tầm xa hơn, không cong vênh khi ẩm
sừng và gân      cung phức hợp của tộc du mục, mạnh và ngắn, hỏng khi mưa
da luộc          rẻ, nhẹ, chống chém khá, chống đâm kém
vải độn nhiều lớp nền bắt buộc, chống đập tốt bất ngờ
đồng thau        trang trí, không dùng cho vũ khí thật
BẠC              yếu về cơ học, NHƯNG là thứ duy nhất gây thương tích
                 KHÔNG TỰ LÀNH cho Huyết Tộc (Phần 14b mục D)
vảy Long Duệ     rất nhẹ, chống lửa, cực hiếm, gần như không mua được
xương Troll      tự liền lại theo thời gian nếu được giữ ẩm — bảo dưỡng lạ
```

### 7. CHẤT LƯỢNG & TAY NGHỀ
5 bậc: **vụng về / thường / tốt / thượng phẩm / tuyệt tác.**
Bậc quyết định bởi kiểm định 3d6 của người thợ khi hoàn thành (Phần 5), cộng với: kỹ
năng thợ, chất lượng lò rèn trong thành trì (Phần 12), vật liệu, thời gian bỏ ra, và
có bản mẫu để chép hay không.

**Tuyệt tác không chỉ mạnh hơn** — nó có TÊN RIÊNG, có `history`, và có giá trị xã
hội. Tặng một thanh tuyệt tác là một hành động chính trị (Phần 13).

### 8. VỪA NGƯỜI — cơ chế đặc trưng, đừng bỏ
Giáp tấm phải **ĐO MAY** cho từng người. Đây là chi tiết lịch sử mà hầu hết game bỏ
qua, và nó thay đổi hẳn cách chơi.
```
fitTo khớp với người mặc          → không phạt
cùng vóc dáng, khác người         → phạt nhẹ AGI, tăng mệt
khác vóc dáng                     → phạt nặng AGI và tốc độ, mệt rất nhanh,
                                    một số khớp không cử động hết tầm
khác chủng tộc                    → thường KHÔNG MẶC ĐƯỢC (Lùn và Ogre
                                    không thể đổi giáp cho nhau)
```
Nghĩa là: **cướp được bộ giáp của một hiệp sĩ tử trận thì món đó chủ yếu để BÁN hoặc
để ĐEM VỀ SỬA, không phải mặc ngay.** Sửa lại cho vừa cần thợ giáp giỏi, tốn tiền và
tốn nhiều tuần.

Giáp lưới thì ngược lại — co giãn, ai mặc cũng tạm được. Đây là ưu thế thật của giáp
lưới ở đầu thế kỷ và là lý do lính đánh thuê chuộng nó.

Vóc dáng lấy từ Phần 6 (chiều cao, cân nặng, dáng người). Nhân vật tăng cân hay sụt
cân nhiều thì bộ giáp cũ không còn vừa.

### 9. TRỌNG LƯỢNG & MỆT MỎI
Không chỉ tính tổng cân nặng. Tính cả **CÁCH PHÂN BỔ**:
```
giáp tấm vừa người  nặng nhưng trải đều lên toàn thân → mệt vừa phải,
                    thực tế người mặc vẫn chạy, leo, lăn được
giáp lưới dài       toàn bộ treo trên vai → mệt nhanh hơn dù nhẹ hơn
đeo lệch, thiếu đai → phạt thêm
```
Ảnh hưởng: thể lực trong Phần 9, tốc độ và điểm khởi động trong Phần 10, sức bền hành
quân trong Phần 11, và bơi qua sông thì gần như chắc chắn chìm.
Kết hợp với thương tích Phần 7: vai bị thương mà mặc giáp lưới thì phạt chồng.

### 10. HƯ HỎNG & BẢO DƯỠNG
Không dùng một thanh độ bền. Dùng **danh sách hư hỏng CỤ THỂ**:
```
lưỡi mẻ            giảm sát thương chém, mài lại được
lưỡi cong          giảm nhiều, cần thợ rèn
gãy                bỏ hoặc rèn lại
giáp móp           giảm coverage ở đúng vùng đó, gò lại được
giáp thủng         coverage vùng đó về gần 0 cho tới khi vá
đai đứt            món giáp tuột ra khi vận động mạnh
gỉ sét             lan dần nếu không lau dầu; giáp lưới phải lăn trong cát
dây cung giãn      cung mất lực, mưa làm hỏng nhanh
mối mọt, da mục    trang bị để lâu trong kho ẩm
```
Bảo dưỡng là hoạt động tốn **THỜI GIAN** và **VẬT TƯ**, làm sau mỗi trận. Bỏ bê thì
vào trận sau với đồ hỏng. **Một đạo quân không có thợ rèn đi theo sẽ rã trang bị sau
vài tuần chiến dịch** — nối vào Phần 11.

### 11. CHẾ TẠO
Nối vào công trình Phần 12 và kỹ năng Phần 8.
- **cần:** thợ có kỹ năng đủ, công trình phù hợp (lò rèn / xưởng cung nỏ / xưởng giáp), vật liệu, thời gian, và **BẢN MẪU** nếu là kiểu mới
- **bản mẫu:** kiểu giáp tấm mới phải học từ thợ khác, mua bản vẽ, hoặc tháo một món có sẵn ra nghiên cứu. Đây là cách "công nghệ" lan trong thế giới.
- **sản xuất hàng loạt** cho quân đội là bài toán khác với rèn một món tuyệt tác: chọn giữa nhiều đồ tầm thường hay ít đồ tốt.

### 12. GIÁ CẢ
Thang giá phải thể hiện đúng độ chênh lệch của thời kỳ (đơn vị tương đối):
```
dao găm               1
giáo bộ binh          3
áo lót độn           10
kiếm ngắn            25
nỏ                   40
áo giáp lưới        150
trường kiếm tốt     180
ngựa chiến          400
bộ giáp tấm đầy đủ  900  và phải đặt trước nhiều tháng
```
**So sánh: thu nhập năm của một nông dân tự do khoảng 8–12.**

Nghĩa là trang bị đầy đủ cho một hiệp sĩ tốn bằng cả đời người của mấy chục nông dân.
Đây chính là nền tảng kinh tế của chế độ phong kiến, và game phải cho người chơi **cảm
nhận** được điều đó chứ không chỉ đọc thấy.

### 13. HUY HIỆU & DANH TÍNH
Áo choàng ngoài giáp, khiên có huy hiệu, cờ hiệu. Ba tác dụng cơ học:
- **a)** Được nhận ra → bị bắt sống để đòi tiền chuộc thay vì bị giết (Phần 10)
- **b)** Được nhận ra → uy tín tăng khi lập công, nhưng cũng bị nhắm làm mục tiêu
- **c) GIẤU huy hiệu** → đánh ẩn danh trong đấu giải, hoặc trốn thoát sau trận thua, nhưng nếu bị phát hiện là mất danh dự nặng

Người mặc giáp tốt mà không có huy hiệu thì bị coi là cướp và bị giết ngay.

### 14. PHÙ PHÉP & VẬT PHẨM HIẾM
**Phải HIẾM. Không có tiệm bán đồ phù phép.** Nguồn duy nhất:
```
rune Lùn            khắc bởi xưởng rune trong Liên bang Núi, hiệu ứng bền vững
dệt Tiên            áo và cung của Cao Tiên, nhẹ và bền phi lý
thánh vật Giáo hội  ban phước, hiệu quả với Huyết Tộc và tà thuật;
                    chỉ Giáo triều cấp, và cấp là một hành động chính trị
rèn huyết long      Long Duệ, cực hiếm
vật bị nguyền       mạnh nhưng có giá phải trả, thường không biết trước
```
Mỗi vật phẩm phù phép nên là một **ENTRY LOREBOOK** (Phần 4) với `knowledge='gated'` —
người chơi phải biết về nó trước khi có thể đi tìm.

### 15. TRANG BỊ THEO PHE PHÁI
Mỗi thế lực ở Phần 14 có danh mục riêng, và có thứ CHỈ HỌ mới có:
```
Đế quốc Orc      giáp lưới nhẹ tiêu chuẩn hóa hàng loạt, cung phức hợp,
                 và ĐỘC QUYỀN thuốc súng ở giai đoạn đầu
Liên bang Lùn    giáo dài, kích, thép Lùn, nỏ nặng
Đông La Mã       giáp lưới kiểu cổ rất tốt nhưng lỗi thời dần, hỏa dược đặc biệt
Frank/Đế quốc    giáp tấm tiên tiến nhất, kỵ binh nặng
Anh quốc         cung dài thủy tùng, không nơi nào khác có đủ xạ thủ
Thảo nguyên      cung sừng, giáp da nhẹ, ưu tiên tốc độ tuyệt đối
Thành bang       nỏ, giáp lính đánh thuê, và TIỀN để mua đồ tốt nhất
Balkan/Huyết Tộc vũ khí bạc (dùng để chống chính họ), giáp đêm
```

### 16. THUỐC SÚNG
Có mặt nhưng **THÔ SƠ**. Đừng làm nó thành vũ khí tối thượng.
- **súng tay:** nạp cực chậm, không chính xác, tầm ngắn, hay nổ ngược (đại thất bại = tự gây thương tích cho chính mình). **Giá trị thật là GÂY KINH HOÀNG:** kiểm định sĩ khí cho địch lần đầu nghe tiếng nổ, và làm ngựa hoảng.
- **đại pháo:** không dùng ngoài dã chiến. Chỉ dùng công thành (Phần 11), nơi nó thật sự thay đổi cục diện: rút thời gian hạ tường từ nhiều tháng xuống vài tuần.
- **thuốc súng ẩm là hỏng.** Mưa vô hiệu hóa hoàn toàn.

Chỉ Đế quốc Orc có sẵn; các nước khác phải nghiên cứu hoặc mua lại, và việc lan truyền
công nghệ này là một tuyến sự kiện của Phần 15.

### 17. SLICE — quyền ghi
```
'items'      mọi thuộc tính vật phẩm, condition, damage, quality   engine
             history (ai từng cầm, dùng ở trận nào)                 engine
             tin đồn về một món (lời nguyền, xuất xứ)               ai
'equipment'  đang mặc gì ở ô nào                                    engine
```
Biến phụ: tổng trọng lượng, bản đồ che phủ 20 vùng, phạt mệt mỏi, tổng giá trị trang
bị, danh sách khe hở đang có.

### 18. UI
- **Màn trang bị:** hình người của Phần 7 làm nền, các món giáp vẽ chồng lên đúng vùng nó che. Kéo thả để mặc.
- **Nút gạt "Xem che phủ":** chuyển hình người sang chế độ tô màu theo coverage, vùng hở nhấp nháy đỏ. **Đây là màn hình quan trọng nhất của Phần 16.**
- Ba thanh riêng cho chống chém / chống đâm / chống đập, **không gộp một số**
- Ô "Vừa người": hiện rõ món nào không vừa và đang phạt bao nhiêu
- Danh sách hư hỏng cụ thể, nút bảo dưỡng, ước tính thời gian và chi phí
- Trọng lượng và phân bổ, cảnh báo khi vượt ngưỡng
- Trang "Kho vũ khí" của thành trì: trang bị cho quân đồn trú hàng loạt

### 19. VIỆC CẦN LÀM
1. `/data/materials.json`, `/data/weapons.json` (viết lại), `/data/armor.json` (viết lại), `/data/enchantments.json`, `/data/item-templates.json`
2. Slice `items` và `equipment`.
3. Bản đồ che phủ 20 vùng + tính khe hở + ba loại chống riêng biệt.
4. **Sửa lại logic gây thương tích của Phần 7 và Phần 9** để đi qua bản đồ che phủ.
5. Cơ chế vừa người, nối với vóc dáng Phần 6.
6. Trọng lượng có phân bổ, nối vào Phần 9, 10, 11.
7. Hư hỏng cụ thể + bảo dưỡng + thợ rèn theo quân.
8. Chế tạo nối vào Phần 8 và Phần 12, có bản mẫu và lan truyền kỹ thuật.
9. `eraFrom`/`eraTo` — trang bị phải đổi theo dòng thời gian, và thợ phải học được.
10. Huy hiệu nối vào tù binh và tiền chuộc Phần 10.
11. Vũ khí bạc gây thương tích không tự lành cho Huyết Tộc (Phần 14b).
12. Đăng ký toàn bộ modifier vào registry Phần 5.
13. UI như mục 18, đặc biệt là chế độ xem che phủ.
14. **Test A:** cho một người mặc giáp tấm đầy đủ đấu với người dùng kiếm thường 200 trận. Kiếm gần như không thắng nổi. Đổi sang búa chiến, tỷ lệ phải đảo ngược rõ rệt. In hai bảng.
15. **Test B:** cướp bộ giáp của một hiệp sĩ Nhân tộc rồi cho một Lùn mặc. Phải báo không mặc được. Cho một Nhân tộc khác vóc dáng mặc — phải phạt nặng.
16. **Test C:** chạy dòng thời gian 70 năm, in ra danh mục trang bị khả dụng ở năm 1320, 1355, 1390. **Ba danh mục phải khác nhau rõ rệt.**

### 20. Sau khi xong
Đưa ra kết quả Test A và Test C, cùng ảnh chụp màn hình chế độ xem che phủ.

---

## ⚠️ HAI CHỖ DỄ BỊ LÀM HỜI HỢT
1. **Bản đồ che phủ ở mục 3–4.** Nếu chỉ làm thành một con số phòng thủ tổng thể thì mất hết chiều sâu, và cũng làm hỏng luôn cơ chế "đâm khe hở" ở Phần 9.
2. **Cơ chế vừa người ở mục 8.** Đó là thứ khiến chiến lợi phẩm trở thành tài sản phải xử lý chứ không phải nút "trang bị ngay".
