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
| `holdings.list[*].tiles.*`, `.buildings.*`, `.projects.*` | engine |
| `holdings.list[*].hinterland.*` | engine |
| `holdings.list[*].ownership.*`, `.permits.*`, `.obligations.*` | engine |
| `holdings.list[*].tierId`, `.gridSize`, `.hygiene`, `.seat`, `.besieged`, `.plague` | engine |
| `holdings.list[*].id`, `.name`, `.buildings[*].customName` | **locked** |
| `holdings.rumours`, `holdings.relations`, `holdings.localFame` | **ai** |

**Tên khoá cứng** vì Phụ lục A mục 9a (thành trì không được trùng tên với lãnh
thổ) chỉ đứng vững khi tên không đổi được sau lúc đặt. **Ba mảng `ai` khai cả
mảng lẫn phần tử**: thêm một tin đồn là một op `push` vào chính mảng, và quyền
của `rumours.*` không nói gì về quyền của `rumours`.

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
2. **Mọi công trình phải đặt vừa lưới của cấp nó mở.** Một công trình 3×3 khai
   `minTier: 1` sẽ không bao giờ hiện lên và không ai biết vì sao.
3. **Tiên quyết không đi ngược cấp.** `x` cấp 3 đòi `y` cấp 4 là vòng khoá chết.
4. **Mỗi cấp phải trỏ tới một khuôn có thật trong `data/fortifications.json`** —
   không có nó thì mục 12.6 không nối được.

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
| 7 | `siege.reputation` + tàn phế của lãnh chúa | `LordContext`, **tham số** | tham số | Hợp lệ. Không đọc store bên trong — `week.ts` bơm vào. Mục 8 khai đây là một nguồn lòng dân. |
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
