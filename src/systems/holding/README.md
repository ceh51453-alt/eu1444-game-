# systems/holding

**Chủ sở hữu:** Phần 12
**Nhiệm vụ:** THÀNH TRÌ: một ĐIỂM. Ô đất, công trình, tường, kho, đồn trú.

**Trạng thái:** xong.

Một thành trì là một ĐIỂM trên bản đồ: có toạ độ, có tường, có lưới ô, có công
trình cụ thể, có dân số đếm được, có kho hàng đếm được. Người chơi **XÂY** nó.

LÃNH THỔ (Phần 13) là một VÙNG chứa nhiều điểm, và nó ở một slice khác hẳn.
Mục 1 của Phần 12 cấm hai slice đọc thẳng vào nhau — xem "Kiểm tra ranh giới" ở
cuối file.

---

## ĐỌC biến nào

| Đường dẫn state | Vì sao cần |
|---|---|
| `holdings.list[*]` | toàn bộ hệ chạy trên đây |
| `meta.turn`, `meta.gameDate` | mùa vụ, hạn tuần, mốc hoàn thành |
| `meta.rng` | dòng `holding` (R3) |

## MẢNH ĐẤT — mô hình không gian

Một thành trì đứng trên một mảnh đất **1 200 × 1 200 ô, mỗi ô 5 m** — tức 6 km
mỗi cạnh. Mảnh đất ấy **không nằm trong save**: nó sinh tất định từ `seed` bằng
nhiễu fBm có bóp méo miền (`field.ts`), nên cùng hạt giống luôn cho cùng con
sông, cùng sườn đồi, cùng vỉa đá.

| Khái niệm | File | Ghi chú |
|---|---|---|
| Tỉ lệ, bán kính quy hoạch | `scale.ts` | một nguồn chân lý về không gian |
| Trường địa hình, sông, độ cao | `field.ts` | tất định, có cache, không lưu save |
| Mạch tài nguyên | `nodes.ts` | đa giác Voronoi, bậc 0–3, hai luật cạn — **có lưu** |
| Tuyến tường vạch tay | `walls.ts` | chuỗi điểm, vật liệu × cấp — **có lưu** |
| Mạng đường tự sinh | `streets.ts` | quan lộ, ngõ, cầu, cổng — tất định, **không lưu** |
| Quãng phố lát tay | `roads.ts` | mặt đường × bề rộng, thoát nước — **có lưu** |
| Đặt công trình | `place.ts` | khoảng thở, thềm đất, mạch, bám tường |
| Tự bố trí & sửa bố cục | `layout.ts` | idempotent, dùng cho ván mới và save cũ |
| Chốt sổ theo lịch | `tick.ts` | ngày vào, tuần ra — chạy ở bước 8 |
| Nâng save cũ | `migrate.ts` | lưới N×N → ô 5 m, công trình vành đai → tuyến |

**Đường có TRƯỚC thành.** Một thành trì mọc lên vì có một con đường đi ngang
qua chỗ ấy, nên quan lộ trong `streets.ts` không dừng ở cổng: nó vào từ mép lưới
bên này, xuyên qua thành, rồi ra mép lưới bên kia. Mạng đường trục suy từ `seed`
và BÁN KÍNH QUY HOẠCH — **không** từ danh sách công trình — nên xây thêm một cái
lò rèn không làm con đường cái dịch đi, và cả mạng đường không tốn một byte nào
trong save. Thứ duy nhất được lưu là `streetsRazed`: một chuỗi id những lối người
chơi đã cho phá, vì đó là thứ hạt giống không trả lời được.

**ĐÚNG MỘT quan lộ**, và không có bậc "đường lớn" nào dưới nó. Bản đầu sinh ba
tới bốn tuyến xuyên bản đồ; nhìn là thấy sai ngay — mấy con đường cùng cỡ cắt
nhau giữa một cái thôn tám chục nóc nhà là hình của một nút giao, không phải
hình của một nơi mọc lên bên VỆ đường, và ở mức nhìn toàn cảnh chúng nuốt mất
mọi thứ khác trên bản đồ. Rẽ nhánh là việc của ngõ, và ngõ thì mảnh hơn hẳn.

## BẬC VÙNG TÀI NGUYÊN — hai luật, không một

Bản đầu cho mọi vùng tụt bậc dần: đào hết trữ lượng bậc 3 thì rơi xuống bậc 2 và
được nạp lại, rồi bậc 1, rồi hết. Một cái thanh máu bốn nấc, dùng chung cho cả
vỉa quặng lẫn khu rừng — mà hai thứ ấy chết theo hai cách không giống nhau chút nào.

| Nhóm | Vùng | Luật |
|---|---|---|
| **Khoáng sản** | `via-da` · `mach-sat` · `bai-ca` · `ruong-muoi` | Bậc **CỐ ĐỊNH** suốt đời. Trừ dần, moi tới tấn cuối cùng thì vùng **biến mất khỏi bản đồ**. |
| **Tái sinh** | `rung-go` · `dong-co` | Mọc lại mỗi tuần theo **bậc × mùa**. Bậc lên xuống theo cán cân giữ gìn. |

**Bậc của một vỉa quặng là một sự thật ĐỊA CHẤT.** Nó không nghèo dần đi, nó chỉ
hết. Tổng lượng moi lên được thì giữ nguyên bằng bản cũ (`mineralReserve` cộng
dồn cả ba bậc) — đổi hình dạng của đường cạn mà không đổi tổng là cách duy nhất
để luật mới không lặng lẽ cắt một phần ba sản lượng cả đời mọi cái mỏ trong game.

**Bậc của một khu rừng là một sự thật SINH HỌC**, và nó phản ứng với cách lãnh
chúa đối xử: mỗi tuần so lượng mọc lại (`regenPerWeek` = bậc × mùa) với lượng bị
chặt, rồi cộng vào `strain` — một bộ đếm **tuần LIÊN TỤC**.

- **10 năm** liên tục chặt quá mức → **thưa một bậc**, vùng co lại trên bản đồ.
- **50 năm** liên tục giữ gìn → **dày một bậc**.
- **Đổi dấu là đặt lại về 0.** "Duy trì được năm mươi năm" nghĩa là năm mươi năm
  liền, không phải cộng dồn từ những quãng đứt đoạn.

Không đối xứng vì phá thì nhanh còn gây lại thì lâu: năm mươi năm dài hơn một
đời người, nên bậc rừng tăng lên là món quà một lãnh chúa để lại cho cháu mình,
không phải một khoản đầu tư ông ta kịp thu về.

Hiệu chuẩn: rừng bậc 3 mọc 16 đơn vị/tuần trước khi nhân mùa (trung bình năm
chừng 14), còn một `bld_xuong-moc` trên đó rút 13,5. **Một xưởng thì bền vững,
hai thì không** — đó chính là quyết định cơ chế này sinh ra để bắt người chơi cân nhắc.

**Bãi cá theo luật khoáng sản** dù cá là thứ sinh sản được. Đó là một quyết định
thiết kế, không phải một nhầm lẫn sinh học: đánh cạn một ngư trường thì nó mất
hẳn, và việc ấy KHÔNG SỬA ĐƯỢC — đúng như chuyện đã xảy ra với những ngư trường
thật.

**Chốt sổ ở `week.ts` mục 4b, không ở `produce()`.** `produce` chỉ ĐẾM phần moi
lên (`Production.drawn`); trước đây nó rút thẳng vào `holding.nodes` qua một cờ
`deplete`, nghĩa là một hàm tên "sản xuất" lặng lẽ sửa state của người gọi. Việc
tách ra còn cần thiết vì đây là chỗ một vùng **biến mất** — và khi nó biến mất,
`nodeId` của xưởng đang đứng trên nó được gỡ ngay tại chỗ.

**Cổng là một phép GIAO, không phải một thứ được sinh ra.** `gatesOn()` tìm chỗ
một con đường cắt qua một tuyến tường đã dựng xong. Phá bức tường thì cái cổng
biến mất cùng nó; chưa có tường thì chưa có cổng nào. Suy cổng từ một vòng tròn
bán kính chung — như bản cũ — là cách chắc chắn để cổng nằm ở chỗ không có tường.

## THỜI GIAN — một đồng hồ, và nó ở ngoài này

Thành trì **không có nút tua thời gian và không có nút chốt**. Ngày trôi vì lời
kể làm nó trôi: bước 8 của vòng lặp lượt cộng `timeCost` vào lịch, rồi
`runHoldingTick` (`tick.ts`) chốt sổ theo — `sim/worldtick.ts` gọi nó ngay sau
chiến đồ, ở nhịp NHANH.

Sổ sách tính theo TUẦN còn lịch trôi theo NGÀY, nên ngày cộng dồn vào
`daysOwed`, đủ bảy thì một tuần được chốt. Chốt bù có trần `MAX_WEEKS_PER_TICK`;
phần dư bị bỏ và nhật ký nói thẳng ra.

Bản cũ có "một tuần", "một năm" và "Chốt kết quả" ngay trên màn hình. Ba cái nút
ấy là một đồng hồ THỨ HAI: lãnh chúa nuôi thành hai mươi năm trong khi ngoài kia
mới là chiều thứ Ba. Mọi hạn chót trong game — nợ thầy của Phần 8, hạn quân dịch
của Phần 11, mùa vụ của chính Phần 12 — đo bằng cái đồng hồ thứ nhất, nên cái
thứ hai chỉ có thể làm chúng sai. Giờ mỗi lệnh của người chơi đi thẳng qua MVU
ngay lúc bấm, và không còn lô nào treo ngoài store.

**Lên cấp NỚI BÁN KÍNH QUY HOẠCH, không đổi lưới.** Đất là đất ấy từ tuần thứ
nhất; lên cấp chỉ nghĩa là lãnh chúa được phép với tay xa hơn (140 ô ở Thôn →
530 ô ở Đại thành). Bước "mở rộng lưới" của bản cũ từng là chỗ duy nhất một
công trình có thể rơi mất, và nó không còn tồn tại.

**Tường là dữ liệu riêng, không phải công trình.** Người chơi vạch từng điểm;
chi phí, thời gian, độ bền và số người canh đều tính theo **độ dài thật**. Bốn
công trình vành đai cũ (`bld_rao-go`, `bld_tuong-go`, `bld_tuong-da`,
`bld_tuong-trong`) đã rời `data/buildings.json` và trở thành **vật liệu tường**;
chỗ nào trong data còn gọi tên chúng thì `wallPrerequisiteOf()` dịch sang.

Ba thứ ở NGOÀI slice, và cả ba đều đi vào qua THAM SỐ chứ không phải qua một cú
đọc store bên trong — để `holdings` giữ được tính thuần và để ranh giới đếm được:

| Nguồn | Vào qua | Dùng ở |
|---|---|---|
| `siege.reputation.tanBao` / `nhanTu` | `LordContext` của `advanceWeek` | lòng dân (mục 8) |
| Tàn phế của lãnh chúa (Phần 7) | `LordContext.maimed` | lòng dân (mục 8) |
| Tước vị (Phần 13) | tham số `titleId` của `garrisonOf` | số đơn vị chỉ huy được |

## GHI biến nào

| Đường dẫn state | Quyền ghi |
|---|---|
| `holdings.list[*].population.*` | engine |
| `holdings.list[*].stores.*` | engine |
| `holdings.list[*].buildings.*`, `.projects.*` | engine |
| `holdings.list[*].nodes.*`, `.walls.*`, `.roads.*`, `.streetsRazed` | engine |
| `holdings.list[*].daysOwed` | engine |
| `holdings.list[*].ownership.*`, `.permits.*`, `.obligations.*` | engine |
| `holdings.list[*].tierId`, `.hygiene`, `.seat`, `.besieged`, `.plague` | engine |
| `holdings.list[*].id`, `.name`, `.buildings[*].customName`, `.walls[*].name`, `.roads[*].name` | **locked** |
| `holdings.list[*].seed`, `.dominant`, `.coastal`, `.anchor` | **locked** |
| `holdings.list[*].hint.*` | **ai** |
| `holdings.rumours`, `holdings.relations`, `holdings.localFame` | **ai** |

**Tên khoá cứng** vì Phụ lục A mục 9a (thành trì không được trùng tên với lãnh
thổ) chỉ đứng vững khi tên không đổi được sau lúc đặt. **Mảnh đất cũng khoá
cứng**: mọi công trình đang đứng đều đứng trên một mảnh đất suy ra từ `seed`, và
một thành trì không được thức dậy vào một buổi sáng và thấy con sông đã dời chỗ.
**Ba mảng `ai` khai cả mảng lẫn phần tử**: thêm một tin đồn là một op `push` vào
chính mảng, và quyền của `rumours.*` không nói gì về quyền của `rumours`.

**`hint` là cửa DUY NHẤT lời kể chạm tới đất.** AI kể "toà thành dựng bên khúc
sông cạn" thì bộ sinh địa hình buộc phải chừa một dòng chảy — nhưng dòng ấy chảy
qua đâu vẫn do hạt giống quyết. Không mở cửa này thì lời kể và bản đồ nói hai
chuyện; mở rộng hơn thì một đoạn văn cảm động sẽ dời được cả một quả núi.

### Hai ràng buộc chéo
- `holdings.mot-toa-chinh` — đúng MỘT tòa chính. Hai cái thì mọi câu hỏi "lãnh
  chúa đang ở đâu" có hai câu trả lời.
- `holdings.khong-trung-ten` — chặn trùng tên ngay ở khâu dữ liệu (Phụ lục A mục 9a).

---

## File data (R5)

`data/buildings.json` · `data/settlement-tiers.json` · `data/resources.json` ·
`data/adjacency.json`

Bốn file nạp qua `data.ts`, và nó kiểm THAM CHIẾU chứ không chỉ kiểm hình dạng.
Bốn loại kiểm đáng nhắc:

1. **Khoá hiệu ứng kề nhau là tập ĐÓNG.** Một luật gõ `happines` sẽ chạy êm và
   không làm gì cả, còn người cân bằng thì tin là nó có làm (R4).
2. **Mọi công trình phải đặt vừa VÙNG QUY HOẠCH của cấp nó mở.** Một công trình
   rộng hơn cả tầm với của cấp ấy sẽ không bao giờ hiện lên và không ai biết vì sao.
3. **Tiên quyết không đi ngược cấp.** `x` cấp 3 đòi `y` cấp 4 là vòng khoá chết.
   Tiên quyết trỏ tới một **vật liệu tường** thì bỏ qua — xem `wallPrerequisiteOf()`.
4. **Mỗi cấp phải trỏ tới một khuôn có thật trong `data/fortifications.json`** —
   không có nó thì mục 12.6 không nối được.
5. **Bán kính quy hoạch phải lớn dần theo cấp** — nếu không thì "lên cấp" là một
   từ không có hệ quả nào.

---

## Ràng buộc
- Mọi thay đổi state đi qua MVU, không `set()` thẳng vào store (R2).
- Mọi hàm tính toán thuần: nhận state, trả state mới (Phần 0 mục 7).
- Kiểm định chất lượng công trình dùng `runCheck` hệ **3d6** — phân miền cứng của
  Phần 5 mục 2 xếp xây dựng vào "năng lực dài hạn". Không dùng d100 ở đây.
- Con số của thành trì là con số **CHÍNH XÁC** (Phụ lục A mục 6). Giọng ước chừng
  là của tầng lãnh thổ.

---

## KIỂM TRA RANH GIỚI (mục 13)

> Liệt kê **MỌI chỗ trong code mà slice `holdings` chạm tới dữ liệu ngoài nó.**

Có tám chỗ. Không chỗ nào đọc slice `realm`, và không chỗ nào đọc một slice khác
qua store — mọi thứ hoặc là **data tĩnh**, hoặc đi vào qua **tham số**.

| # | Chạm tới | Ở đâu | Loại | Đánh giá |
|---|---|---|---|---|
| 1 | `data/fortifications.json` (Phần 11) — `fortTemplateOf`, `siegeConfig` | `data.ts`, `fortify.ts` | data tĩnh | Hợp lệ. Cầu nối bắt buộc của mục 12.6; đọc CHỈ ĐỌC, một chiều. |
| 2 | `systems/siege/types` — kiểu `Fortification`, `GarrisonUnit` | `fortify.ts` | kiểu | Hợp lệ. `holdings` DỰNG RA đối tượng và trao đi; `siege` không đọc ngược. |
| 3 | `data/units.json` (Phần 10) — `unitTypeOf`, `commandOf` | `garrison.ts` | data tĩnh | Hợp lệ. Binh chủng phải là của Phần 10, nếu không thì quân trên tường và quân ngoài đồng là hai sinh vật khác nhau. |
| 4 | `systems/character/races` — `raceOf` (`group`, `church`) | `population.ts` | data tĩnh | Hợp lệ. Căng thẳng chủng tộc lấy từ bảng Phần 6, đúng như mục 8 yêu cầu. |
| 5 | `systems/check` — `runCheck` | `build.ts` | hàm thuần | Hợp lệ. Registry của Phần 5, đúng README mục 8.4. |
| 6 | `core/clock`, `core/rng`, `core/ids` | nhiều nơi | hạ tầng | Hợp lệ. |
| 7 | `siege.reputation` + tàn phế của lãnh chúa | `LordContext`, **tham số** | tham số | Hợp lệ. Không đọc store bên trong — `sim/worldtick.ts` đọc rồi bơm vào `runHoldingTick`, và `week.ts` chuyền tiếp. Mục 8 khai đây là một nguồn lòng dân. |
| 8 | Tước vị (sẽ là Phần 13) | tham số `titleId` | tham số | Hợp lệ. Chuỗi id, không phải con trỏ vào `realm`. |

### Ba giao diện với LÃNH THỔ (mục 1) — `interfaces.ts`

```
holding → realm    Tribute      nộp nghĩa vụ, quân dịch, đóng góp sản lượng
realm → holding    RealmOrder   cấp phép xây · bảo hộ · trưng dụng · đặt luật
holding ↔ holding  Shipment     buôn bán, tiếp tế
```

Cả ba đều là **dữ liệu thuần**: không kiểu nào cầm một `Holding` từ phía lãnh
thổ, không kiểu nào cầm một id lãnh thổ có nghĩa với `holdings`, và không hàm
nào nhận cả state thành trì lẫn state lãnh thổ. `RealmOrder.law` cố ý chỉ mang
HỆ QUẢ của một điều luật (`moraleShift`, `outputShift`) chứ không mang bản thân
điều luật — để nguyên văn xuống đây là mở đường cho cả bộ luật của Phần 13 sống
trong `holdings`.

**Không con số nào tồn tại ở cả hai chỗ.** Dân số là của thành trì; tổng dân
vùng là BIẾN PHỤ cộng từ các thành trì (`totalPopulation()` trong `slice.ts`),
và Phần 13 phải LÀM TRÒN kèm chữ "ước chừng" trước khi đưa vào prompt.

### Bộ gác tự động
`holding.test.ts` mục 13 quét chính mã nguồn thư mục này và làm đỏ nếu có file
nào `import` từ `@/systems/realm`, đọc `state['realm']`, hoặc nhắc tới `taxRate`,
`vassals`, `provinces`, `issueLaw`. Quét MÃ, không quét chú thích — `types.ts`
phải viết ra được những cái tên ấy mới cấm được chúng.

### Một chỗ TẠM, khai rõ
`ui/holding/HoldingScreen.tsx` khởi công với `architectSkill: 0`, nên mọi công
trình lớn từ chối khởi công cho tới khi có một NPC kiến trúc sư thật. Đó là
đúng thiết kế của mục 6 ("một NPC thật, phải đi tìm"), và cửa tìm người ấy thuộc
Phần 15.

---

## MÀN HÌNH (mục 11)

Bản đồ **tràn khung**, kéo và phóng được; bốn bảng của mục 11 là panel nổi bật
tắt được thay cho một cột sidebar cố định. Mảnh đất rộng sáu cây số, và mỗi trăm
điểm ảnh nhường cho sidebar là một trăm điểm ảnh người chơi không thấy đất mình.

| File | Việc |
|---|---|
| `HoldingScreen.tsx` | bố cục, thanh công cụ, ghi lệnh qua MVU |
| `HoldingMap.tsx` | canvas: khung nhìn, con trỏ, thứ tự lớp, bấm chọn |
| `holdingArt.ts` | hình học thuần — không biết gì về state |
| `HoldingOverlays.tsx` | bảng tra cứu, bộ lọc lớp, bảng công cụ tường/đường |
| `HoldingPanels.tsx` | bốn bảng của mục 11 |
| `holding.ts` | cửa mở màn hình — **chỉ trả về thành trì đã có, không dựng gì** |

**Nút "Thành trì" chỉ hiện khi có thành trì thật** (`hasHolding` trong
`ui/shell/StatusPanel.tsx`, đọc slice `holdings`). Bản trước dựng sẵn một cái
thôn khi state chưa có gì, nên một tên du thủ du thực hay một đứa con thứ không
được thừa kế cũng mở bảng ra thấy mình làm chủ sáu chục dân. Bước 8 của Phần 6
đã HỎI người chơi giữ cái gì; dựng thêm là trả lời hộ, và trả lời ngược lại.
Ba con đường còn lại của mục 2 (`duoc-phong`, `danh-chiem`, `phat-trien`) xảy ra
TRONG ván và đi qua `createHolding` ở đúng cái lượt chúng xảy ra — nên cái nút
cũng hiện ra đúng lúc ấy.

**Bốn công cụ, đúng một cái trên tay:** Xem (bấm để đọc sổ) · Đặt công trình ·
Tường thành · Đường đi. Kéo bản đồ được ở MỌI công cụ — vạch một tuyến dài hơn
khung nhìn là chuyện thường.

**Da công trình suy từ DỮ LIỆU, không từ một bảng tên.** `material` cho tường,
`group` cho mái, `group` cho biểu tượng. `data/buildings.json` là dữ liệu chứ
không phải một `enum`, nên một bảng tên cứng nghĩa là công trình mới nào cũng
hiện màu xám mặc định cho tới khi có ai nhớ ra.
