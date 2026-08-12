# PHẦN 6 — CHỦNG TỘC, CHỈ SỐ, TẠO NHÂN VẬT
*Tiền đề: Phần 0–5 xong. Đây là slice `character` thật, thay cho slice giả ở Phần 2.*

> **Lưu ý:** vị thế xã hội của một số chủng tộc trong mục 2 ĐÃ ĐƯỢC SỬA LẠI ở
> Phần 14 và 14b (Orc, Cao Tiên, Lùn Núi, thú nhân). Đọc hai phần đó trước khi
> viết `races.json` bản cuối.

### 1. BỘ 12 CHỈ SỐ (4 / 4 / 4)

**THÂN THỂ**
| | | |
|---|---|---|
| STR | Sức mạnh | nâng vác, sát thương cận chiến, phá cửa |
| AGI | Nhanh nhẹn | né tránh, tốc độ, khéo tay, cưỡi ngựa |
| VIT | Thể chất | máu tối đa, sức bền, kháng độc và dịch bệnh |
| PER | Cảm quan | thị lực, thính giác, phát hiện, bắn xa |

**TRÍ TUỆ**
| | | |
|---|---|---|
| INT | Trí lực | học vấn, ngôn ngữ, mưu lược, luật pháp |
| WIL | Ý chí | kháng sợ hãi, chịu đau, kháng phép, giữ lời thề |
| WIT | Trực giác | ứng biến, đọc tình huống, phản ứng bất ngờ |
| ARC | Huyền năng | cảm ứng phép thuật và thần lực |

**XÃ HỘI**
| | | |
|---|---|---|
| PRE | Uy nghi | hiện diện, chỉ huy, khiến người khác phục |
| ELO | Hùng biện | thuyết phục, đàm phán, giảng đạo, kích động đám đông |
| GUI | Mưu mô | lừa dối, che giấu, âm mưu, phản gián |
| EMP | Đồng cảm | đọc người, gây thiện cảm, giữ lòng thuộc hạ |

Thang: 1–20. Người thường 8–10. Xuất chúng 16+. Trần chủng tộc khác nhau.
Uy tín / Danh vọng KHÔNG phải chỉ số — nó là tài nguyên riêng, thay đổi liên tục
theo hành động, sẽ làm ở Phần 13.

**Nối vào Phần 5:**
```
d100  kỹ năng% = (chỉ số chính × 3) + điểm rèn luyện + trang bị
d20   mod = floor((chỉ số - 10) / 2)
3d6   T = chỉ số + cấp kỹ năng
pool  không dùng chỉ số cá nhân, dùng chất lượng đơn vị
```

### 2. BA MƯƠI HAI CHỦNG TỘC — bộ khởi đầu
Nạp từ `/data/races.json`. Bảng dưới là dữ liệu gốc:
*tên | thiên hướng chỉ số | vị thế xã hội | quan hệ Giáo hội | tuổi thọ*

> **Trạng thái tính tới lúc dựng lorebook chiến dịch:** `/data/races.json` KHÔNG còn
> rỗng. Nó đã có 34 tộc (32 ở đây + Ngưu Nhân/Mục Nhân + Huyết Tộc của 14b), cộng một
> node nhóm `race_nhan-loai` làm cha của bốn nhánh Frank / Teuton / Latin / Rus — node
> nhóm không chọn được lúc tạo nhân vật. Mỗi tộc đã có `homelands` (trỏ sang
> `regions.json`) và `loreEntry` (trỏ sang entry lorebook mô tả tộc đó).
>
> Hai chỗ Phần 6 còn phải bổ sung vào file: **thiên hướng chỉ số** ở cột hai của bảng
> dưới, và **`spread`** mà Phần 14 mục 8 đòi. Tên chính tắc của tộc số 31 là **Mục
> Nhân** (Ngưu Nhân là tên cũ, giữ trong `aliases`), theo lorebook chiến dịch.

**NHÂN TỘC**
```
 1 Frank        PRE ELO      quý tộc phong kiến chủ đạo   chính thống      70
 2 Teuton       STR VIT      đế quốc, thợ thủ công        chính thống      70
 3 Latin        INT ELO      thương nhân, giáo sĩ         trung tâm        70
 4 Rus          VIT PER      biên cương, kỵ binh nhẹ      ly giáo          70
```
**TỘC NÚI & LÒNG ĐẤT**
```
 5 Lùn Núi      STR VIT      liên bang các bang tự trị    hòa ước         250
 6 Lùn Vực Sâu  VIT WIL      khép kín, dị hình            nghi kỵ         300
 7 Gnome        INT WIT      cơ khí, giả kim, đồng hồ     bị nghi tà thuật 180
 8 Kobold       AGI PER      lao dịch hầm mỏ, bị khinh    ngoài lề         40
```
**TIÊN TỘC**
```
 9 Cao Tiên     ARC INT      hoàng tộc Đông La Mã         đối địch ngầm   600
10 Lâm Tiên     PER AGI      cung thủ tự do / tà giáo     ngoại đạo       400
11 Ám Tiên      GUI ARC      bị gọi là dị giáo            bị truy bức     450
12 Bán Tiên     WIT EMP      thông ngôn, quan lại         lửng lơ         150
```
**THÚ NHÂN**
```
13 Lang Nhân    STR PER      thị tộc rừng và thảo nguyên  ngoại đạo        60
14 Hùng Nhân    STR VIT      lính đánh thuê               dửng dưng        80
15 Miêu Nhân    AGI GUI      thương nhân, đạo chích       ngoại đạo        65
16 Quạ Nhân     WIT PER      sứ giả, do thám, thầy bói    bị nghi bói toán 90
17 Thử Nhân     AGI GUI      ổ chuột thành thị, buôn lậu  bị ghê tởm       45
18 Mã Nhân      PER AGI      cầm đầu hãn quốc thảo nguyên ngoại đạo        70
```
**TỘC CAO LỚN**
```
19 Ogre         STR VIT      lính đánh thuê, chậm chạp    ngoài lề         60
20 Bán Khổng Lồ STR PRE      núi cao, thị tộc             ngoại đạo       150
21 Troll Đá     VIT STR      tái sinh, sợ lửa             quái vật        400
22 Orc          STR WIL      đế quốc chính quy phương nam thù địch         55
```
**HUYẾT THỐNG DỊ BIỆT**
```
23 Long Duệ     PRE ARC      vương thất cổ vùng Balkan    kính nể xa cách 300
24 Ma Duệ       GUI ARC      bị truy bức khắp nơi         dị giáo          90
25 Thiên Duệ    ELO WIL      hàng giáo phẩm cấp cao       trung tâm       120
26 Thạch Duệ    VIT STR      nhân tạo, tranh cãi linh hồn chưa phân định  ???
```
**TỘC NƯỚC, KHÍ, BĂNG**
```
27 Hải Tộc      AGI VIT      thương mại ven biển          hòa ước         120
28 Phong Tiên   AGI WIT      thị tộc vùng núi cao         ngoại đạo       200
29 Băng Tộc     VIT WIL      cực bắc, thị tộc             ngoại đạo       140
```
**TỘC KỲ DỊ**
```
30 Mộc Tộc      ARC EMP      lùm thiêng, tín ngưỡng cổ    ngoại đạo       800
31 Ngưu Nhân    STR PRE      đấu sĩ và chiến binh Balkan  ngoài lề         70
32 Bán Nhân     EMP AGI      nông dân, đầu bếp, tình báo  chính thống      90
33 Tộc Tro Tàn  WIL VIT      sinh sau đại dịch, gây sợ    bị xua đuổi     ???
```
*(Huyết Tộc là chủng tộc thứ 34, định nghĩa ở Phần 14b mục D.)*

Mỗi race trong file data phải có: `id`, tên, mô tả, mod 12 chỉ số, trần chỉ số,
tuổi thọ, giai đoạn tuổi, đặc tính bẩm sinh (2–3 cái), vùng bản địa, quan hệ
Giáo hội, thái độ mặc định của các quốc gia, ngôn ngữ mẹ đẻ, ngoại hình mặc định
(dải chiều cao/cân nặng/màu da/màu tóc/màu mắt/đặc điểm riêng), và cột `spread`
(tộc đó có mặt ở những thế lực nào và với vai trò gì — xem Phần 14 mục 3).

Đặc tính bẩm sinh phải cài đúng vào registry modifier của Phần 5, không hardcode.
**KHÔNG được viết cứng con số 32 vào bất kỳ đâu trong code** — danh sách sẽ còn dài thêm.

### 3. XUẤT THÂN — chỉ ảnh hưởng điểm khởi đầu
Xuất thân KHÔNG khóa trần tước vị. Một nông nô về lý thuyết vẫn có thể lên tới
hoàng đế. Nó chỉ quyết định vạch xuất phát:

| Giai tầng | Điểm chỉ số | Điểm kỹ năng | Tiền | Uy tín | Quan hệ | Tài sản |
|---|---|---|---|---|---|---|
| Nông nô | +8 | +6 | rất ít | 0 | 0 | không |
| Nông dân tự do | +10 | +8 | ít | 5 | 1 | nhà đất nhỏ |
| Thợ thủ công | +10 | +12 | vừa | 10 | 2 | xưởng |
| Thương nhân | +9 | +10 | nhiều | 15 | 3 | kho hàng |
| Giáo sĩ | +9 | +14 | ít | 25 | 4 | thư tịch |
| Hiệp sĩ | +13 | +9 | vừa | 30 | 3 | ngựa, giáp |
| Quý tộc nhỏ | +12 | +10 | nhiều | 45 | 5 | trang viên |
| Đại quý tộc | +14 | +11 | rất nhiều | 65 | 8 | thái ấp |
| Vương thất | +15 | +12 | khổng lồ | 85 | 12 | thành trì |

Kèm theo: vùng sinh, thứ tự trong nhà (con cả thừa kế, con thứ phải tự lập),
tình trạng gia tộc (thịnh / suy / lưu vong / tuyệt tự).

### 4. NGOẠI HÌNH CHI TIẾT
Phải đủ chi tiết để Phần 7 dựng được hình người, Phần 16 tính được vừa người,
và AI mô tả nhất quán:
- chiều cao, cân nặng, dáng người (gầy/cân đối/vạm vỡ/đồ sộ/béo)
- **tỷ lệ cơ / mỡ** ← Phần 7 dùng trực tiếp cho bản đồ cơ thể
- màu da, màu tóc, kiểu tóc, râu, màu mắt, hình dạng mắt
- đặc điểm khuôn mặt (sống mũi, cằm, gò má, môi)
- sẹo có sẵn (vị trí trên bản đồ cơ thể), hình xăm, dấu bớt
- đặc trưng chủng tộc (sừng, tai, vảy, lông, cánh...) theo race đã chọn
- giọng nói, dáng đi, thói quen cử chỉ
- quần áo và trang sức khởi đầu

Mỗi field có nút "ngẫu nhiên theo chủng tộc" dùng seeded RNG.

### 5. KỸ NĂNG KHỞI ĐẦU
Cây kỹ năng đầy đủ để ở Phần 8. Giai đoạn này chỉ cần danh mục phẳng nạp từ
`/data/skills.json`, mỗi kỹ năng có: `id`, tên, nhóm, chỉ số chính, hệ xúc sắc
dùng (theo phân miền Phần 5).
Nhóm: Chiến đấu / Cưỡi ngựa và di chuyển / Thủ công / Học vấn / Xã giao / Ngầm /
Quản trị / Huyền thuật / Sinh tồn / Y thuật.

### 6. GIA ĐÌNH & QUAN HỆ
- Cây gia tộc: cha mẹ, anh chị em, ông bà, vợ chồng, con cái, họ hàng xa.
- Mỗi thành viên là một NPC thật trong state, không phải chữ trang trí: có id, chỉ số rút gọn, tuổi, tình trạng, thái độ với người chơi, mục tiêu riêng.
- Sinh ngẫu nhiên theo giai tầng và chủng tộc, sửa tay được.
- Quan hệ ngoài gia đình: thầy dạy, bạn thân, kẻ thù, ân nhân, chủ nợ.
- Quyền ghi: thông tin gốc `locked`, thái độ và quan hệ `ai`, chỉ số `engine`.

### 7. THẾ LỰC
- Trung thành với ai (lãnh chúa trực tiếp, quốc gia)
- Tôn giáo và mức sùng đạo
- Hội đoàn: phường hội, dòng tu, hiệp sĩ đoàn, hội thương nhân, hội trộm
- Thái độ ban đầu của các quốc gia và phe phái, tính từ chủng tộc + xuất thân
- Bí mật khởi đầu: 1–3 điều nhân vật giấu, cắm sẵn vào slice tri thức Phần 4

### 8. QUYỀN GHI CỦA SLICE `character`
```
identity.*, race, birthDate           locked
stats.*, hp, skills.*.level           engine
appearance.scars.*                    engine   (Phần 7 thêm vào khi bị thương)
appearance.* còn lại                  locked
relations.*.attitude, secrets.*       ai
personality.*, notes.*                ai
```
Biến phụ: sức nâng, tốc độ, máu tối đa, sức chở, tầm nhìn, tuổi tác hiệu dụng.

### 9. LUỒNG TẠO NHÂN VẬT (9 bước, quay lui được)
```
1 Chủng tộc      → xem so sánh mod chỉ số, đặc tính, vị thế xã hội
2 Xuất thân      → giai tầng, vùng sinh, thứ tự con, tình trạng gia tộc
3 Chỉ số         → point-buy, hiện ngay trần chủng tộc và kỹ năng bị ảnh hưởng
4 Ngoại hình     → có xem trước hình người của Phần 7
5 Kỹ năng        → phân điểm rèn luyện
6 Gia đình       → sinh tự động, sửa được
7 Thế lực        → trung thành, tôn giáo, hội đoàn, bí mật
8 Trang bị       → theo giai tầng
9 Xác nhận       → hiện toàn bộ phiếu nhân vật, chốt seed
```
Sau bước 9: gọi AI viết đoạn mở đầu. Prompt phải nêu rõ mọi lựa chọn ở trên và
ra lệnh: chỉ viết cảnh mở đầu, KHÔNG được thêm hay đổi bất kỳ chỉ số nào.

### 10. VIỆC CẦN LÀM
1. `/data/races.json` — đầy đủ field ở mục 2. Cấu trúc file phải cho phép thêm chủng tộc mới mà không sửa code.
2. `/data/skills.json` — danh mục phẳng, gán đúng hệ xúc sắc.
3. `/data/origins.json` — bảng mục 3.
4. Slice `character` thật, đăng ký qua Phần 2, đủ quyền ghi mục 8.
5. Sinh gia tộc tự động bằng seeded RNG.
6. UI 9 bước, quay lui được, xem trước liên tục bên phải.
7. Nối vào registry modifier của Phần 5: chủng tộc và chỉ số phải ảnh hưởng thật lên kết quả kiểm định.
8. Test: tạo 3 nhân vật khác chủng tộc và giai tầng, chạy cùng một kiểm định, xác nhận modifier khác nhau đúng như dữ liệu.

### 11. Sau khi xong
Đưa ra `/data/races.json` để bổ sung chủng tộc và sửa vị thế xã hội.
