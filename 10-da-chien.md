# PHẦN 10 — CHIẾN TRẬN NGOÀI ĐỒNG
*Tiền đề: Phần 0–9 xong. Dùng lại `CombatChronicle` của Phần 9.*

### 1. NGUYÊN TẮC THIẾT KẾ CỐT LÕI
Trận đánh thế kỷ 14 kết thúc bằng **VỠ TRẬN**, không phải bằng tiêu diệt hết.
Phần lớn thương vong xảy ra SAU khi một bên bỏ chạy. Toàn bộ hệ thống phải xoay
quanh sĩ khí, không xoay quanh sát thương. Ai làm đối phương sợ trước thì thắng,
kể cả khi quân ít hơn.

### 2. LƯỚI CO GIÃN
Nguyên tắc: giữ SỐ QUÂN CỜ trên bàn luôn trong khoảng 8–30 đơn vị mỗi bên, bất kể
trận to hay nhỏ. Engine tự chọn cỡ lưới và độ gộp:

| Tổng quân | Lưới | Một ô | Một đơn vị |
|---|---|---|---|
| 50–300 | 15×15 | ~20m | 20–30 quân |
| 300–3.000 | 25×25 | ~40m | 50–100 quân |
| 3.000–15.000 | 40×40 | ~80m | 200–400 quân |
| 15.000+ | 50×50 | ~150m | 500+ quân |

Bảng này là **công thức, KHÔNG hardcode bậc.** Viết hàm tính từ tổng quân số.
Hệ quả: cỡ ô đổi thì tầm bắn, tốc độ di chuyển, tầm nhìn đều phải quy đổi theo
mét thật rồi mới chuyển sang ô. Không được ghi thẳng "cung bắn 6 ô".

### 3. QUYỀN CHỈ HUY THEO TƯỚC VỊ
| Tước vị | Chỉ huy |
|---|---|
| không tước / hiệp sĩ | 1 đơn vị (bản thân + tùy tùng), phải nghe lệnh |
| Nam tước | 2–4 đơn vị |
| Tử tước | một phân đội |
| Bá tước | một cánh quân (tả, hữu, hoặc trung) |
| Hầu tước | một cánh + quân dự bị |
| Công tước | toàn quân |
| Vương / Hoàng đế | toàn quân + quyền quyết định chiến lược trước trận |

**Khi KHÔNG chỉ huy toàn quân:**
- Phần quân còn lại do AI engine điều khiển theo kế hoạch của chủ soái.
- Người chơi NHẬN LỆNH từ trên. Lệnh hiện ra như một khung nhiệm vụ: *"Giữ cánh phải, không được tiến trước khi trung quân giao chiến."*
- Được phép TRÁI LỆNH. Hệ quả tính riêng:
```
trái lệnh + thắng trận   → uy tín tăng mạnh, nhưng chủ soái ghi hận
trái lệnh + thua         → có thể bị khép tội, mất đất, mất tước
tuân lệnh + thua         → không bị trách, nhưng không có công
```
- Đây là nguồn kịch tính lớn nhất của tầng tước vị thấp. Làm cho tử tế.

**Khi CHỈ HUY TOÀN QUÂN — không phải là dễ hơn:**
- Mệnh lệnh phải đi qua tướng dưới quyền, mỗi người có: lòng trung, năng lực, tính khí (liều lĩnh / thận trọng / háo danh / bất mãn).
- Mỗi lệnh phải qua kiểm định: 3d6 vs (PRE người chơi + lòng trung tướng đó).
```
thành công         thi hành đúng
thành công có giá  thi hành chậm một lượt hoặc lệch mục tiêu
thất bại           không nhúc nhích
đại thất bại       làm ngược, hoặc tự ý xông lên, hoặc rút lui
```
- Càng nhiều tướng, càng nhiều chỗ hỏng. **Tước vị cao cho quyền lớn hơn nhưng ma sát cũng lớn hơn. Không tầng nào là "chế độ dễ".**

### 4. LƯỢT THEO ĐIỂM KHỞI ĐỘNG
Mỗi vòng:
1. Mọi đơn vị tung điểm khởi động:
   `d20 + (loại đơn vị) + (WIT chỉ huy) + sĩ khí/20 − mệt mỏi/20 − mất đội hình/20`
   Kỵ binh nhẹ và cung kỵ cao nhất, bộ binh nặng và giáo dài thấp nhất.
2. Sắp giảm dần, hành động lần lượt.
3. Đơn vị được phép **GIỮ lệnh**: bỏ lượt để phản ứng sau, ví dụ chờ kỵ binh địch lao vào rồi mới hạ giáo.
4. **Phản ứng cơ hội:** đơn vị chưa hành động được bắn vào kẻ đi ngang qua, hoặc đánh vào sườn kẻ vừa quay lưng.

Điểm khởi động cao là lợi thế THẬT, không phải chỉ đi trước: nó cho phép phản ứng,
còn đơn vị chậm phải cam chịu.

### 5. MÔ HÌNH ĐƠN VỊ
```ts
type Unit = {
  id; typeId; factionId; commanderId?;
  strength; maxStrength;              // số quân
  quality: 1|2|3|4|5;                 // tân binh → cựu binh dày dạn
  morale: number;                     // 0-100
  fatigue: number;
  cohesion: number;                   // đội hình còn nguyên vẹn tới đâu
  formation: FormationId;
  position: {x,y}; facing: Direction;
  ammo?: number;
  state: 'vững'|'lung lay'|'nao núng'|'vỡ trận'|'tan rã';
};
```

### 6. ĐỘI HÌNH
| Đội hình | Đặc điểm |
|---|---|
| Hàng ngang | mặt trận rộng, mỏng, dễ bị chọc thủng |
| Khối sâu | bền, đẩy mạnh, nhưng là mồi ngon cho cung thủ |
| Nêm | chỉ kỵ binh, xuyên phá tốt, mất đội hình sau khi chạm |
| Vòng giáo | khắc kỵ binh gần như tuyệt đối, nhưng đứng im và chết vì tên |
| Tản mát | né tên tốt, đánh gần rất yếu, di chuyển nhanh |

Đổi đội hình tốn thời gian và làm giảm cohesion tạm thời. Đổi đội hình khi địch
đang áp sát là một quyết định rất mạo hiểm.

### 7. BINH CHỦNG THEO PHE PHÁI
`/data/units.json`, mỗi quốc gia và chủng tộc một danh mục riêng.
> **Danh mục đầy đủ đã được sửa lại ở Phần 14.** Đọc Phần 14 mục 2 trước khi viết file này.

Mỗi loại: quân số chuẩn, trang bị, tầm, chi phí thuê/nuôi, khắc chế cái gì, bị cái
gì khắc chế, yêu cầu để tuyển được (Phần 12, 13 sẽ dùng).

**Ba quan hệ khắc chế phải mô hình đúng — đây là linh hồn chiến thuật thế kỷ 14:**
```
giáo dài giữ vững đội hình  KHẮC  kỵ binh xung phong (kỵ binh lao vào là tự sát)
cung thủ tầm xa             KHẮC  khối bộ binh sâu đứng yên
kỵ binh                     KHẮC  cung thủ và đội hình đã vỡ
```
Ba cái này tạo thành vòng tròn. Không có binh chủng nào mạnh tuyệt đối.

### 8. SĨ KHÍ — hệ thống quyết định thắng bại
**Giảm vì:** thương vong, bị đánh sườn, bị đánh sau lưng, chỉ huy tử trận, đơn vị
bên cạnh vỡ trận, bị bắn liên tục, ít quân hơn hẳn, đói, mưa lạnh, đối thủ gây
kinh hoàng (Ogre, Ma Duệ, Troll).

**Tăng vì:** thắng cận chiến, chỉ huy có mặt gần, quân kỳ còn đứng, chiếm cao điểm,
được ban phước tôn giáo trước trận, nghỉ ngơi.

| Trạng thái | Hành vi |
|---|---|
| vững | hành động bình thường |
| lung lay | không tiến, chỉ giữ |
| nao núng | lùi dần, không nhận lệnh tấn công |
| vỡ trận | bỏ chạy về mép bản đồ, không điều khiển được |
| tan rã | xóa khỏi trận, coi như mất |

**VỠ TRẬN LAN TRUYỀN:** đơn vị vỡ chạy qua đơn vị khác thì đơn vị đó cũng phải kiểm
định sĩ khí. Một cánh sụp có thể kéo sập cả đạo quân trong ba vòng.
Đây là cơ chế quan trọng nhất — trận đánh phải kết thúc đột ngột, không phải gặm
dần từng đơn vị.

### 9. ĐỊA HÌNH & THỜI TIẾT
**Địa hình:** đồi, rừng, đầm lầy, bùn, sông, chỗ lội qua, cầu, làng, đường, ruộng.
```
cao điểm      +tấn công, +tầm bắn, kỵ binh xuống dốc mạnh hơn nhiều
bùn lầy       kỵ binh nặng và bộ binh giáp gần như tê liệt
rừng          phá đội hình, khắc kỵ binh, lợi cho phục kích
chỗ lội, cầu  thắt cổ chai, một đơn vị giữ được cả đạo quân
```
**Thời tiết:** mưa (dây cung ẩm, giảm mạnh cung thủ), sương mù (giảm tầm nhìn và
tầm lệnh), tuyết, nắng gắt (mệt nhanh trong giáp).

### 9b. CHIẾN TRẬN BAN ĐÊM
*(bổ sung từ Phần 14b — bắt buộc có để quân Huyết Tộc hoạt động)*
- Ban đêm: mọi đơn vị bị phạt tầm nhìn nặng, phạt điểm khởi động, tầm lệnh của chỉ huy rút ngắn, đội hình dễ vỡ.
- Đơn vị có đặc tính `nightVision` (Huyết Tộc, Ám Tiên, Lùn Vực Sâu, Miêu Nhân) không chịu phạt này.
- **Ràng buộc bù lại:** quân Huyết Tộc KHÔNG thể truy kích sau bình minh. Chiến thắng ban đêm của họ hiếm khi trọn vẹn — địch tan nhưng chạy thoát.

### 10. XÚC SẮC
Theo phân miền Phần 5: **đụng độ đơn vị dùng DICE POOL d6.**
```
số viên = f(strength, quality, formation, đội hình còn nguyên, địa hình)
số thành công cần = f(phòng thủ địch, giáp, đội hình, địa hình)
trần 20 viên
```
Lệnh chỉ huy dùng 3d6. Người chơi tự thân giao chiến thì chuyển sang Phần 9.

### 11. NGƯỜI CHƠI TỰ THÂN LÂM TRẬN
- Có nút "Tự mình xông lên". Chuyển sang minigame đấu tay đôi Phần 9 với một đối thủ tương xứng, ngay giữa chiến trận.
- **Lợi:** sĩ khí quanh mình tăng mạnh, có thể xoay chuyển một cánh.
- **Hại:** bị thương thật theo Phần 7, và nếu chết thì mọi thứ chấm dứt. Trong lúc đấu, người chơi KHÔNG ra lệnh được, toàn quân tự xoay xở.
- Đây là quyết định đắt giá, không phải nút bấm miễn phí.

### 12. TRƯỚC VÀ SAU TRẬN
**Trước:** chọn địa điểm giao chiến, bố trí đội hình, chọn quân dự bị, phát biểu
động viên (ELO, tăng sĩ khí), lễ ban phước, cử người do thám.

**Sau:** đếm thương vong, truy kích (giết được nhiều nhất ở khúc này), bắt tù binh
để đòi tiền chuộc (rất đặc trưng thời kỳ này, quý tộc bị bắt sinh lời — nối vào
huy hiệu ở Phần 16 mục 13), thu chiến lợi phẩm, chôn cất, thương binh chuyển sang
hệ chữa trị Phần 7, tính lại uy tín và quan hệ với chủ soái.

### 13. BIÊN NIÊN & DIỄN BIẾN
Dùng `CombatChronicle` của Phần 9 với `kind='battle'`. Bổ sung trường cho cấp
chiến trận: chuyển động các cánh, thời điểm vỡ trận, lệnh đã ra và có được thi
hành không.

Gọi LLM một lần sau trận. Ràng buộc y hệt Phần 9: chỉ được kể đúng những gì có
trong biên niên, được thêm cảm xúc và không khí, KHÔNG được đổi kết quả.
Trận lớn thì nén: giữ nguyên các vòng highlight, gộp phần còn lại.

### 14. UI
- Lưới chiến trận, mỗi đơn vị một quân cờ có hướng, cờ hiệu, thanh sĩ khí
- Màu quân cờ đổi theo trạng thái sĩ khí, nhìn là biết cánh nào sắp sụp
- Bảng thứ tự khởi động của vòng hiện tại, hiện rõ ai sắp hành động
- Khung lệnh nhận từ chủ soái (nếu tước vị thấp), có nút tuân hoặc trái lệnh
- Bảng tướng dưới quyền (nếu chỉ huy toàn quân): lòng trung, tính khí, lệnh đang thi hành, và kết quả kiểm định lệnh vừa rồi
- Nút "Tự mình xông lên"
- Sau trận: bảng tổng kết + nút "Đọc diễn biến"

### 15. VIỆC CẦN LÀM
1. `/data/units.json` (theo Phần 14 mục 2), `/data/formations.json`, `/data/terrain.json`, `/data/weather.json`
2. Hàm co giãn lưới, quy đổi mét sang ô.
3. Vòng lượt theo điểm khởi động + giữ lệnh + phản ứng cơ hội.
4. Đụng độ bằng dice pool qua Phần 5.
5. Hệ sĩ khí đầy đủ, đặc biệt là **VỠ TRẬN LAN TRUYỀN**.
6. Quyền chỉ huy theo tước vị + hệ lệnh cho tướng dưới quyền + trái lệnh.
7. Luật chiến trận ban đêm (mục 9b).
8. Nối sang Phần 9 khi người chơi tự thân giao chiến.
9. Giai đoạn trước và sau trận, gồm tù binh và tiền chuộc.
10. `CombatChronicle kind='battle'` + viết diễn biến.
11. UI như mục 14.
12. **Test:** dựng lại ba trận có thật trong lịch sử về mặt cơ chế — kỵ binh nặng lao vào vòng giáo trên đất bằng, cung thủ bắn vào khối sâu, kỵ binh đuổi theo đội hình đã vỡ. Cả ba phải cho kết quả áp đảo đúng chiều. In tỷ lệ ra.

### 16. Sau khi xong
Đưa ra kết quả bài test 12 và một bản diễn biến trận lớn do AI viết.
