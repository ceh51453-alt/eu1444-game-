# systems/realm

**Chủ sở hữu:** Phần 13
**Nhiệm vụ:** LÃNH THỔ: một VÙNG. Tỉnh, luật, thuế, chư hầu, triều đình, tòa án, nổi loạn.

**Trạng thái:** xong.

Một lãnh thổ là một **VÙNG** phải cưỡi ngựa nhiều ngày mới đi hết. Nó gồm nhiều
tỉnh, mỗi tỉnh chứa nhiều thành trì. Người chơi **CAI TRỊ** nó — không xây nó.

| | THÀNH TRÌ (P12) | LÃNH THỔ (P13) |
|---|---|---|
| Là gì | một ĐIỂM, có toạ độ | một VÙNG, chỉ có phạm vi áp dụng |
| Có gì | lưới ô, công trình, kho, dân đếm được | tỉnh, luật, thuế suất, chư hầu |
| Đơn vị | người · ô · tuần · giạ | tỉnh · phần trăm · ngày ngựa · điểm bất ổn |
| Nhịp | **TUẦN** (`holding/week.ts`) | **NĂM** (`realm/year.ts`) |

**Quy tắc kiểm tra** (mục 1): nếu thứ đó có **TỌA ĐỘ** thì nó thuộc thành trì;
nếu nó chỉ có **PHẠM VI ÁP DỤNG** thì nó thuộc lãnh thổ.

---

## ĐỌC biến nào

| Đường dẫn state | Vì sao cần |
|---|---|
| `realm.*` | toàn bộ hệ chạy trên đây |
| `vassals.list[*]` | lòng trung, phe cánh, nổi loạn (mục 7) |
| `titles.held[*].legitimacy` | chính danh vào mọi kiểm định cai trị (mục 5) |
| `meta.gameDate.year`, `meta.rng` | nhịp năm, dòng xúc sắc `realm` (R3) |

Ba thứ ở NGOÀI ba slice ấy, và cả ba đi vào qua **tham số**:

| Nguồn | Vào qua | Dùng ở |
|---|---|---|
| `Tribute` của Phần 12 | `RealmYearInput.tributes` · `CallHostInput.tributes` | cống nộp của thành trì (`year.ts` bước 2), hạn quân dịch (`levy.ts`) |
| Năng lực cai trị của người chơi | `RealmYearInput.ruleSkill` | `base` của mọi `runCheck` |
| Tước đang giữ | `RealmYearInput.titles` | bậc, chính danh, nghĩa vụ nợ lên trên |

## GHI biến nào

| Đường dẫn state | Quyền ghi |
|---|---|
| `realm.provinces.*`, `.taxRates.*`, `.laws`, `.projects.*`, `.treasury`, `.court.*`, `.cases.*`, `.ledger.*` | engine |
| `realm.id`, `realm.name` | **locked** |
| `realm.rumours`, `realm.opinion` | **ai** |
| `vassals.list[*].loyalty`, `.power`, `.obligations.*`, `.rebelling`, `.factionId` | engine |
| `vassals.list[*].npcId`, `.name` | **locked** |
| `vassals.list[*].grievances`, `.ambition`, `.personality`, `vassals.rumours` | **ai** |

AI ghi được vào **mối hận và tham vọng** vì chúng là ĐỘNG CƠ, không phải con số
vào công thức trực tiếp: chúng đi qua `grievanceWeight` của data, nên AI thêm một
mối hận là thêm một LÝ DO, không phải tự cho mình một khoản trừ lòng trung tùy ý.

### Bốn biến phụ (mục 10)
`tongThuVung` · `chiSoOnDinh` (realm) · `nguyCoNoiLoan` · `tongQuanChuHau` (vassals).
Tổng dân vùng KHÔNG có ở đây: nó cộng từ `Tribute` của Phần 12 và phải làm tròn
kèm chữ "ước chừng" trước khi vào prompt (Phụ lục A mục 6).

### Ba ràng buộc chéo
- `realm.mot-tinh-mot-chu` — một tỉnh không nằm trong hai thái ấp.
- `realm.mot-thanh-tri-mot-tinh` — một `hold_*` chỉ thuộc một tỉnh (ba tầng của
  Phụ lục A mục 9d); nằm hai chỗ thì mọi phép cộng "tổng của vùng" đếm nó hai lần.
- `realm.mot-ghe-mot-nguoi` — hai người một ghế triều đình thì lệnh của ai được nghe.

---

## File data (R5)

`data/laws.json` · `data/provinces.json`
(thang tước vị và kế vị ở `systems/titles`: `data/titles.json`, `data/succession.json`)

Năm phép kiểm THAM CHIẾU lúc nạp — xem đầu `data.ts`. Đáng nhắc nhất: **tỉnh
không khai `name`**, tên lấy từ `regions.json` qua `regionId`, để một địa danh chỉ
có đúng một nguồn sự thật.

---

## KIỂM TRA RANH GIỚI (mục 12.12)

> Liệt kê **MỌI chỗ `realm` chạm vào `holdings`.** Mọi chỗ đều phải đi qua giao
> diện đã khai ở `holding/interfaces.ts`.

Có **bốn** chỗ, và cả bốn đều là `import type` — sau khi biên dịch, không còn một
dòng mã nào nối hai thư mục.

| # | Chạm cái gì | Ở đâu | Chiều | Đánh giá |
|---|---|---|---|---|
| 1 | `Tribute` | `year.ts` — `RealmYearInput.tributes` | holding → realm | Hợp lệ. Dữ liệu thuần đi VÀO qua tham số. Không `Holding`, không dân số, không danh sách công trình. |
| 2 | `Tribute` | `levy.ts` — `callHost()` | holding → realm | Hợp lệ. Chỉ đọc `obligationDays`, `levyAvailable`, `arrearsYears` — ba con số trên tờ giấy nộp nghĩa vụ. |
| 3 | `RealmOrder` | `laws.ts` — `lawOrder()` | realm → holding | Hợp lệ. Trả về tờ lệnh `dat-luat` mang ĐÚNG HAI con số (`moraleShift`, `outputShift`), không mang nguyên văn điều luật. |
| 4 | `RealmOrder` | `permits.ts` — `grantPermit()` | realm → holding | Hợp lệ. Tờ lệnh `cap-phep`. Lãnh thổ KÝ GIẤY, không XÂY. |

Và ba điều **không** xảy ra ở đâu trong thư mục này:

- không hàm nào nhận một `Holding`;
- không hàm nào đọc `state['holdings']`;
- không hàm nào nhận cả state thành trì lẫn state lãnh thổ.

`Province.holdingIds` là danh sách **ID**, đúng như mục 6 cho phép: *"trỏ sang
P12, KHÔNG sao chép dữ liệu"*. Gắn và gỡ đi qua `attachHolding` / `detachHolding`,
và cả hai chỉ nhận một chuỗi.

### Bộ gác tự động
`realm.test.ts` mục 12.12 quét chính mã nguồn thư mục này và làm đỏ nếu có file
nào `import` giá trị (không phải kiểu) từ `@/systems/holding`, đọc `state['holdings']`,
hoặc nhắc tới `gridSize`, `buildingId`, `tiles`, `population.total`. Quét MÃ,
không quét chú thích — README và `types.ts` phải viết ra được những cái tên ấy mới
cấm được chúng.

---

## Ràng buộc

- Kiểm định cai trị dùng **3d6**, miền `rule.*` (Phần 5 mục 2: năng lực dài hạn).
- Chính danh vào phép kiểm qua registry của Phần 5, không cộng tay (README mục 8.4).
- Con số cấp vùng là **ƯỚC CHỪNG** (Phụ lục A mục 6): `households()` làm tròn sẵn,
  `levyEstimate()` làm tròn tới hàng chục, và UI phải nói rõ chữ "ước chừng".
- Mọi hàm thuần: nhận dữ liệu, trả dữ liệu mới. Ghi state qua MVU (R2).
- Nổi loạn KHÔNG dùng `runCheck`: không có người kiểm định, không có độ khó, không
  modifier nào áp vào — nhét nó vào hệ 5 cấp sẽ tạo ra một "thất bại có giá" của
  một việc không ai làm. Xem chú thích ở `checkRebellion`.
