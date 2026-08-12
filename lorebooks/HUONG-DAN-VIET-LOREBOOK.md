# HƯỚNG DẪN VIẾT LOREBOOK
*Tài liệu tra cứu để tự soạn nội dung. Đọc mục 1 và mục 12 trước, còn lại tra khi cần.*

---

## 1. CÁCH LÀM VIỆC

1. Viết một hoặc nhiều file `.json` theo cấu trúc ở mục 3, bỏ vào thư mục `/lorebooks`.
2. Chạy `npx vitest run src/lore/lore.test.ts`. Bài test `mọi file trong /lorebooks phải
   đọc được` sẽ nạp thử **mọi** file trong thư mục và in ra lỗi theo từng dòng nếu có.
   Xanh là file dùng được.
3. Đưa lại cho tôi. Tôi sẽ: viết EJS cho những entry cần tính toán, nối `regions.json`,
   `races.json`, `nations.json`, chỉnh trọng số và ngân sách, và bổ sung trigger.

**Không cần viết đủ mọi field.** Chỉ `id`, `title`, `content` là bắt buộc; tất cả field
còn lại có mặc định an toàn. Viết thiếu thì entry vẫn chạy, chỉ là chạy đơn giản.

**File mới tự vào game.** Bỏ file vào `/lorebooks` rồi mở lại game là thấy — sách chưa
có trong kho sẽ được gieo thêm. Sách ĐÃ có trong kho thì không bị ghi đè, vì bản trong
kho là bản ông đã sửa trên UI. Muốn nạp đè một sách đã sửa thì dùng nút **Import**.

**Muốn bỏ hẳn một sách thì xóa cả file**, nếu chỉ xóa trên UI thì lần mở sau nó được
gieo lại từ file.

**`mau-swabia.json` và `KHUNG-MAU.json` xóa được.** Cái đầu là dữ liệu test cơ chế, cái
sau là kho ví dụ (`enabled: false` nên không bao giờ vào prompt).

### Bảy cổng gác tự động

Bài test không chỉ kiểm cú pháp JSON. Nó còn chặn sáu lỗi nội dung hay gặp và in ra
đúng entry nào sai:

- file không đọc được (sai dấu phẩy, thiếu field bắt buộc)
- hai entry trùng `id` giữa các sách
- entry `constant` dài quá 600 ký tự, hoặc thiếu `summary`
- có `triggers` mà quên `triggerOnce` / `triggerCooldown`
- `related` trỏ tới `id` không tồn tại
- `regions` hoặc `scope.refId` trỏ tới vùng không có trong `regions.json`

---

## 2. QUY ƯỚC ID — bắt buộc, vì id là chỗ hai bên khớp nhau

```
race_*     chủng tộc          nation_*   thế lực / quốc gia
reg_*      lục địa            realm_*    vương quốc
prov_*     tỉnh               hold_*     thành trì / khu định cư
npc_*      nhân vật           fief_*     thái ấp
item_*     vật phẩm           unit_*     đơn vị quân
corps_*    quân đoàn Orc      event_*    sự kiện lịch sử
law_*      luật, hiệp ước     fact_*     một mẩu TRI THỨC (xem mục 8)
```

Sau tiền tố dùng **chữ thường không dấu, ngăn bằng gạch ngang**: `hold_ehrenfeld`,
`npc_ba-tuoc-reinhard`, `event_dich-hach-1348`.

`id` của entry lorebook thì tự do, nhưng nên trùng với id của thứ nó mô tả:
entry về bá tước Reinhard đặt id `npc_ba-tuoc-reinhard`. Sau này Phần 6 và 13 sẽ
tra ngược theo id đó.

---

## 3. CẤU TRÚC FILE

```json
{
  "kind": "eu1444-lorebook",
  "schemaVersion": 1,
  "exportedAt": 0,
  "books": [
    {
      "id": "book-chung-toc",
      "name": "Ba mươi tư chủng tộc",
      "version": 1,
      "scope": { "kind": "global" },
      "enabled": true,
      "autoScope": true,
      "priority": 0,
      "entries": [ ... ]
    }
  ]
}
```

### 3.1 Trường của SÁCH

| Trường | Nghĩa | Lưu ý |
|---|---|---|
| `id` | định danh sách | trùng id thì lần nạp sau **ghi đè** sách cũ |
| `name` | tên hiện trên UI | |
| `scope.kind` | `global` `region` `nation` `race` `faction` `topic` | xem mục 3.2 |
| `scope.refId` | id vùng / quốc gia / chủng tộc mà sách gắn vào | |
| `enabled` | công tắc tay | `false` thắng tất cả, `autoScope` không bật lại được |
| `autoScope` | tự bật/tắt theo vùng đang đứng | |
| `priority` | sách nào thắng khi hai sách có entry trùng `id` | số lớn thắng |

### 3.2 `scope.kind` — cái nào đã chạy, cái nào còn chờ

| kind | Tự bật khi | Trạng thái |
|---|---|---|
| `global` | luôn luôn | **chạy** |
| `region` | đang đứng trong `refId` (tính cả vùng con) | **chạy** |
| `race` | `refId` khớp tộc nhân vật, **hoặc** đang đứng trên đất của tộc đó | **chạy đủ hai vế** |
| `nation` | đang đứng trong `refId`, **hoặc** phe hiện tại là `refId` | **chạy đủ hai vế** |
| `faction` | phe hiện tại là `refId` | **chạy** |
| `topic` | — | **cố ý không tự bật**, chỉ bật tay |

Cả sáu kind đều chạy được rồi. Hai chỗ trước đây còn treo:

- **Vế "đất của tộc đó"** đọc `homelands` trong `/data/races.json`. Node `reg_europa`
  bị loại khỏi phép so — một tộc "có mặt khắp Europa" mà tính là chiếm đa số thì sách
  của tộc đó bật ở mọi chỗ, tức là `race` thành `global` trá hình.
- **"Phe hiện tại"** là một ô chọn ở đầu tab Lorebook, ghi vào `knowledge.factionId`.
  Danh sách lấy từ `/data/nations.json`. Phần 13 và 14 sẽ suy ra nó từ tước vị và quan
  hệ; lúc đó ô này thành ô ghi đè chứ không còn là nguồn duy nhất.

---

## 4. BẢNG TRA TOÀN BỘ TRƯỜNG CỦA MỘT ENTRY

### 4.1 Nội dung

| Trường | Kiểu | Mặc định | Nghĩa |
|---|---|---|---|
| `id` | chuỗi | **bắt buộc** | xem mục 2 |
| `title` | chuỗi | **bắt buộc** | tên hiện trên UI và in đầu mỗi mục trong prompt |
| `type` | xem mục 6 | `custom` | dùng để lọc trên UI |
| `content` | chuỗi | **bắt buộc** | nội dung đưa vào prompt. **Render bằng EJS** — xem mục 10 |
| `summary` | chuỗi | — | bản ngắn, dùng khi hết ngân sách thay vì bỏ hẳn entry |
| `variants` | mảng | — | cùng chuyện, mỗi phe kể một kiểu — xem mục 9 |

### 4.2 Lớp 1 — từ khóa

| Trường | Mặc định | Nghĩa |
|---|---|---|
| `keys` | `[]` | khớp một từ là entry vào vòng chấm điểm |
| `keysSecondary` | — | `{ "logic": "...", "keys": [...] }`, bốn phép: `AND_ANY` `AND_ALL` `NOT_ANY` `NOT_ALL` |
| `matchMode` | `plain` | `plain` khớp trong từ · `wholeWord` khớp trọn từ (hiểu dấu tiếng Việt) · `regex` |
| `caseSensitive` | `false` | |
| `constant` | `false` | luôn chèn, bỏ qua từ khóa — **vẫn phải qua năm lớp và vẫn tranh ngân sách** |

> **Bẫy hay gặp nhất:** đặt từ khóa quá phổ thông (`"vua"`, `"đất"`, `"quân"`) thì
> entry vào mọi lượt và ăn hết ngân sách. Từ khóa nên là **tên riêng** hoặc **cụm hai
> ba chữ**. Muốn một entry luôn có mặt thì dùng `constant`, đừng dùng từ khóa rộng.

### 4.3 Lớp 2 — thời gian

| Trường | Dạng | Nghĩa |
|---|---|---|
| `validFrom` | `{ "year": 1444, "month": 6, "day": 1, "hour": 0 }` | trước ngày này entry không tồn tại |
| `validUntil` | như trên | sau ngày này entry biến mất |

Dùng cho sự kiện đang diễn ra, sắc chỉ có hiệu lực, dịch bệnh, chiến dịch theo mùa.

Game bắt đầu **15/11/1444, 6 giờ** — năm ngày sau trận Varna, không phải tháng Giêng.
Lorebook của chiến dịch mô tả thế giới ở trạng thái HẬU Varna ("vừa diễn ra", "sau khi
đè bẹp liên quân Thập Tự"), nên mở màn ở tháng Giêng là hai entry đó nói về một trận
chưa xảy ra. Mốc nằm ở `src/core/clock.ts`.

### 4.4 Lớp 3 — vùng

| Trường | Mặc định | Nghĩa |
|---|---|---|
| `regions` | — | mảng id vùng. Bỏ trống = không giới hạn vùng |
| `includeAdjacent` | `false` | tính cả vùng **kề**, so ở đúng tầng của vùng khai trong `regions` |

Luật quan trọng: **"nằm trong" đi lên tới gốc, không đi xuống.**
Khai `prov_swabia` thì entry chèn được khi đứng ở bất kỳ thành trì nào trong Swabia.
Khai `hold_brogg` thì CHỈ ở làng Brogg — làng bên cạnh không thấy.

### 4.5 Lớp 4 — điều kiện state

`condition`: một biểu thức EJS trả về đúng/sai. Biến dùng được liệt kê ở mục 10.
Ví dụ: `q.rumors().length > 0`, `state.meta.gameDate.year > 1450`,
`q.relation('npc_eleanor') !== null`.

Biểu thức hỏng bị coi là **sai**, không phải đúng — thà thiếu một khối còn hơn chèn
nhầm dữ liệu vào cảnh không liên quan.

### 4.6 Lớp 5 — cổng tri thức

| Trường | Nghĩa |
|---|---|
| `knowledge` | `public` chèn tự do · `gated` cần tri thức · `secret` không bao giờ vào prompt chính |
| `requiresKnowledge` | mảng id tri thức (`fact_*`) mà nhân vật phải có |

Xem mục 8 — đây là chỗ hệ này hơn hẳn SillyTavern, xin đọc kỹ.

### 4.7 Chèn và ngân sách

| Trường | Mặc định | Nghĩa |
|---|---|---|
| `placement` | `"block"` | `"block"` gộp vào khối 4 · `{ "depth": 2 }` chèn ngược từ cuối |
| `role` | `system` | vai của tin nhắn, chỉ có nghĩa khi dùng `depth` |
| `weight` | `10` | mỗi từ khóa khớp cộng chừng này điểm |
| `budgetPriority` | `7` | 1 cắt đầu tiên, 10 không bao giờ cắt |

**Cách tính điểm** (quyết định entry nào lọt ngân sách):
```
điểm = (số từ khóa khớp × weight)
     + 5   nếu khớp trong tin nhắn MỚI NHẤT
     + 3   nếu khớp cả keysSecondary
     + 4   nếu entry gắn đúng vùng đang đứng
     + 1000 nếu constant
     × pullWeight nếu vào qua đường quan hệ
```

### 4.8 Hành vi theo lượt

| Trường | Nghĩa |
|---|---|
| `sticky` | sau khi hết khớp, giữ chèn thêm N lượt |
| `cooldown` | sau khi chèn, nghỉ N lượt mới được chèn lại |
| `delay` | chỉ tính từ lượt thứ N của ván chơi |
| `probability` | 0–100, dùng xúc sắc có seed |

### 4.9 Quan hệ và đệ quy

| Trường | Nghĩa |
|---|---|
| `related` | `[{ "id": "npc_x", "pullWeight": 0.8 }]` — entry này vào thì kéo theo entry kia, **không cần khớp từ khóa** |
| `recurse` | nội dung entry được quét lại một vòng nữa, kéo thêm entry khác |
| `preventRecursion` | entry chỉ kích được từ tin nhắn gốc, không kích từ nội dung entry khác |

`related` **chỉ kéo một tầng**. Đệ quy sâu tối đa 3 vòng.

Dùng `related` cho: nhắc tên một lãnh chúa → kéo theo thành trì, gia tộc, vụ kiện của
ông ta. Dùng `recurse` cho entry tổng quan có nhắc tên nhiều thứ khác.

### 4.10 Trigger

Xem mục 11.

---

## 5. DANH SÁCH CHÍNH TẮC — lấy từ tài liệu thiết kế, xin dùng đúng tên này

### 5.1 Ba mươi tư chủng tộc (Phần 6 mục 2, Phần 14b mục D)

> **Bảng này giờ đã có bản máy đọc được: `/data/races.json`.** Trước đây file đó rỗng,
> nên bảng dưới chỉ nằm trong tài liệu và không ai kiểm được. Nay mỗi tộc có thêm
> `homelands` (trỏ sang `regions.json`) và `loreEntry` (trỏ sang entry lorebook mô tả
> tộc đó) — id trong hai chỗ khớp nhau, sai một chữ là tra ra ngay.
>
> Nhân loại có thêm node nhóm `race_nhan-loai` làm cha của bốn nhánh Frank / Teuton /
> Latin / Rus. Node nhóm **không chọn được** lúc tạo nhân vật; nó chỉ để entry lorebook
> "Nhân loại" có chỗ neo vào.

| id | Tên | Vị thế xã hội | Quan hệ Giáo hội | Thọ |
|---|---|---|---|---|
| `race_frank` | Frank | quý tộc phong kiến chủ đạo | chính thống | 70 |
| `race_teuton` | Teuton | đế quốc, thợ thủ công | chính thống | 70 |
| `race_latin` | Latin | thương nhân, giáo sĩ | trung tâm | 70 |
| `race_rus` | Rus | biên cương, kỵ binh nhẹ | ly giáo | 70 |
| `race_lun-nui` | Lùn Núi | liên bang các bang tự trị | hòa ước | 250 |
| `race_lun-vuc-sau` | Lùn Vực Sâu | khép kín, dị hình | nghi kỵ | 300 |
| `race_gnome` | Gnome | cơ khí, giả kim, đồng hồ | bị nghi tà thuật | 180 |
| `race_kobold` | Kobold | lao dịch hầm mỏ, bị khinh | ngoài lề | 40 |
| `race_cao-tien` | Cao Tiên | hoàng tộc Đông La Mã | đối địch ngầm | 600 |
| `race_lam-tien` | Lâm Tiên | cung thủ tự do / tà giáo | ngoại đạo | 400 |
| `race_am-tien` | Ám Tiên | bị gọi là dị giáo | bị truy bức | 450 |
| `race_ban-tien` | Bán Tiên | thông ngôn, quan lại | lửng lơ | 150 |
| `race_lang-nhan` | Lang Nhân | thị tộc rừng và thảo nguyên | ngoại đạo | 60 |
| `race_hung-nhan` | Hùng Nhân | lính đánh thuê | dửng dưng | 80 |
| `race_mieu-nhan` | Miêu Nhân | thương nhân, đạo chích | ngoại đạo | 65 |
| `race_qua-nhan` | Quạ Nhân | sứ giả, do thám, thầy bói | bị nghi bói toán | 90 |
| `race_thu-nhan` | Thử Nhân | ổ chuột thành thị, buôn lậu | bị ghê tởm | 45 |
| `race_ma-nhan` | Mã Nhân | cầm đầu hãn quốc thảo nguyên | ngoại đạo | 70 |
| `race_ogre` | Ogre | lính đánh thuê, chậm chạp | ngoài lề | 60 |
| `race_ban-khong-lo` | Bán Khổng Lồ | núi cao, thị tộc | ngoại đạo | 150 |
| `race_troll-da` | Troll Đá | tái sinh, sợ lửa | quái vật | 400 |
| `race_orc` | Orc | đế quốc chính quy phương nam | thù địch | 55 |
| `race_long-due` | Long Duệ | vương thất cổ vùng Balkan | kính nể xa cách | 300 |
| `race_ma-due` | Ma Duệ | bị truy bức khắp nơi | dị giáo | 90 |
| `race_thien-due` | Thiên Duệ | hàng giáo phẩm cấp cao | trung tâm | 120 |
| `race_thach-due` | Thạch Duệ | nhân tạo, tranh cãi linh hồn | chưa phân định | ? |
| `race_hai-toc` | Hải Tộc | thương mại ven biển | hòa ước | 120 |
| `race_phong-tien` | Phong Tiên | thị tộc vùng núi cao | ngoại đạo | 200 |
| `race_bang-toc` | Băng Tộc | cực bắc, thị tộc | ngoại đạo | 140 |
| `race_moc-toc` | Mộc Tộc | lùm thiêng, tín ngưỡng cổ | ngoại đạo | 800 |
| `race_nguu-nhan` | **Mục Nhân** (còn gọi Ngưu Nhân) | xương sống bộ binh thảo nguyên, đấu sĩ Balkan | ngoài lề | 70 |
| `race_ban-nhan` | Bán Nhân | nông dân, đầu bếp, tình báo | chính thống | 90 |
| `race_tro-tan` | Tộc Tro Tàn | sinh sau đại dịch, gây sợ | bị xua đuổi | ? |
| `race_huyet-toc` | Huyết Tộc | Phần 14b mục D | — | — |

> **Nguyên tắc gán tộc (Phần 14 mục 1b):** không tộc nào "man rợ" hay "văn minh" bẩm
> sinh — vai trò đến từ thể chế. **Mỗi thế lực đều đa chủng tộc**; tộc thống trị chỉ
> nắm chính quyền. Một thế lực thuần một tộc là viết sai.

### 5.2 Tám thế lực + ba bổ sung (Phần 14 mục 2, Phần 14b)

| id | Tên | Nguyên mẫu | Tộc cai trị | Tộc khác trong dân |
|---|---|---|---|---|
| `nation_orc` | Đế quốc Orc | Ottoman | Orc | cấm vệ là dị tộc chiêu mộ; Miêu Nhân và Latin buôn bán; Gnome thợ thủ công; Nhân tộc, Ngưu Nhân, Phong Tiên, Hải Tộc ở vùng chinh phục |
| `nation_dong-la-ma` | Đế quốc Đông La Mã | Byzantine | Cao Tiên | Bán Tiên quan lại; Latin và Rus làm dân; Hải Tộc thủy thủ; Ngưu Nhân lính đánh thuê |
| `nation_lien-bang-nui` | Liên bang Núi | các bang Thụy Sĩ | Lùn Núi | — |
| `nation_han-quoc` | Hãn quốc Thảo nguyên | các tộc du mục | Mã Nhân | — |
| `nation_de-quoc` | Đế quốc La Mã Thần thánh | HRE | Teuton | — |
| `nation_frank` | Vương quốc Frank | Pháp | Frank | — |
| `nation_giao-trieu` | Giáo triều | Papacy | Thiên Duệ, Latin | — |
| `nation_thanh-bang-latin` | Thành bang Latin | các thành bang Ý | Latin | — |
| `nation_anh-quoc` | Anh quốc | 14b mục A | Nhân tộc + Lâm Tiên | — |
| `nation_baltic` | Ba Lan–Litva và Baltic | 14b mục B | Lâm Tiên + Mộc Tộc + thú nhân | — |
| `nation_hungary` | Hungary–Balkan | 14b mục C | Long Duệ + Ngưu Nhân + Huyết Tộc | — |

### 5.3 Thang tước vị (Phần 13 mục 2 và 3)

Thang chuẩn Tây Âu: `0 Thường dân · 1 Hiệp sĩ · 2 Nam tước · 3 Tử tước · 4 Bá tước ·
5 Hầu tước · 6 Công tước · 7 Tuyển hầu · 8 Vương · 9 Hoàng đế`.

Mốc quan trọng: **bá tước** là cấp đầu tiên có chư hầu thật; **công tước** có hội đồng,
luật riêng, quyền đúc tiền; **tuyển hầu** chỉ có trong Đế quốc, có quyền bầu hoàng đế.

Thang riêng theo phe: Orc lên **theo năng lực** (Học viên → Sĩ quan → Chỉ huy quân đoàn
→ Đại thần → Tể tướng) · Lùn **bầu cử có nhiệm kỳ** (Thợ cả → Đại biểu bang → Chấp chính
→ Chủ tịch liên bang) · Giáo hội là thang **song song** (Linh mục → Giám mục → Tổng giám
mục → Hồng y → Giáo hoàng) · Baltic **không có tước vị**, chỉ có uy tín trong hội đồng
bô lão.

### 5.4 Năm cấp khu định cư (Phần 12 mục 3)

| Cấp | Tên | Dân số | Tường |
|---|---|---|---|
| 1 | Thôn | dưới 100 | không |
| 2 | Làng | 100–500 | hàng rào gỗ |
| 3 | Trấn | 500–2.000 | tường gỗ/đất |
| 4 | Thành | 2.000–8.000 | tường đá |
| 5 | Đại thành | 8.000+ | tường đá nhiều lớp |

Xây thành lũy mà không có **giấy phép** của lãnh chúa cấp trên là tội, và lãnh chúa có
quyền đem quân san bằng. Đây là chi tiết rất đặc trưng thế kỷ 14, đáng viết thành entry.

### 5.5 Mười tám quân đoàn Orc (Phần 14 mục 4)

**Cấm vệ** (chiêu mộ dị tộc, trung với cá nhân người cai trị): `corps_tan-binh`
Tân Binh Đoàn · `corps_cam-ky` Cấm Kỵ Đoàn · `corps_phao` Pháo Đoàn · `corps_xa-phao`
Xa Pháo Đoàn · `corps_hoa-cau` Hỏa Cầu Đoàn · `corps_cong-binh` Công Binh Đoàn ·
`corps_giap-khi` Giáp Khí Đoàn · `corps_thi-ve` Thị Vệ Đoàn.

**Tỉnh binh** (theo thái ấp): `corps_thai-ap-ky` · `corps_tien-khu` · `corps_khinh-bo` ·
`corps_cuong-si` · `corps_son-dao` · `corps_bien-tran`.

**Chuyên môn**: `corps_thuy-su` · `corps_cong-thanh` · `corps_truyen-tin` ·
`corps_hoc-vien-ky-xao`.

Cấm vệ và Tỉnh binh là **hai phe đối lập cấu trúc** — ưu ái bên nào thì bên kia bất mãn.

---

## 6. CHÍN LOẠI ENTRY — công thức cho từng loại

`type` không ảnh hưởng tới việc chèn, nó chỉ dùng để lọc trên UI. Nhưng mỗi loại có
cách viết riêng, và đây là phần đáng đọc nhất của tài liệu này.

### 6.1 `place` — địa danh

- **keys:** tên riêng + tên dân gian. `["Ehrenfeld", "thành Ehrenfeld"]`
- **regions:** id của chính nó, hoặc của tỉnh nếu là địa danh cấp tỉnh
- **knowledge:** `public` cho nơi ai cũng biết; `gated` cho nơi khuất
- **Nội dung nên có:** trông ra sao khi tới gần · mùi và tiếng · ai làm chủ · sống bằng
  nghề gì · một chi tiết bất thường mà dân địa phương coi là bình thường
- **Nên có `related`** kéo theo lãnh chúa và vụ tranh chấp của nơi đó
- **Con số:** thành trì nói **chính xác** (1.240 dân, 380 giạ lúa). Lãnh thổ nói **ước
  chừng** (chừng chín nghìn nhân khẩu). Xem mục 12.

### 6.2 `person` — nhân vật

- **id:** `npc_*`
- **keys:** tên + tước vị + biệt danh. `["Reinhard", "bá tước Reinhard"]`
- **regions:** nơi người đó thường có mặt
- **Nội dung nên có:** người đó **muốn gì** · **sợ gì** · thói quen nhìn thấy được ·
  quan hệ với hai ba nhân vật khác · một chuyện cũ mà họ không muốn nhắc
- **Nên có `related`** kéo theo thành trì, gia tộc, vụ kiện
- **Bí mật của nhân vật để `knowledge: "secret"` thành entry RIÊNG**, đừng viết chung
  vào entry công khai — xem mục 8

### 6.3 `faction` — phe phái, phường hội, dòng tu

- **keys:** tên phe + tên gọi dân gian + tên thủ lĩnh
- **Nội dung nên có:** ai gia nhập được · phe này kiếm sống bằng gì · kẻ thù tự nhiên ·
  quy tắc nội bộ mà người ngoài không biết
- **Rất hợp với `variants`** — mỗi phe nói về phe kia một kiểu (mục 9)

### 6.4 `concept` — khái niệm, phong tục, nghề nghiệp

- **constant** cho những khái niệm nền mà AI phải luôn nhớ (Giáo hội, đi đường, tiền tệ)
- **Đây là loại dễ ăn hết ngân sách nhất.** Giữ dưới 120 chữ, và luôn có `summary`
- **Nội dung nên có:** người thường sống với nó ra sao — không phải định nghĩa từ điển

### 6.5 `law` — luật, hiệp ước, sắc chỉ

- **validFrom / validUntil** gần như luôn cần
- **regions** là phạm vi áp dụng
- **Nội dung nên có:** luật nói gì · ai được lợi · **ai lách được và lách bằng cách nào**
- Vế cuối là vế đáng giá nhất: luật mà không ai lách được thì không sinh ra chuyện

### 6.6 `event` — sự kiện

- **validFrom** là ngày nó xảy ra; **validUntil** là ngày người ta thôi bàn về nó
- **Rất hợp với `trigger`** — xem mục 11
- **Nội dung nên có:** chuyện gì xảy ra · tin tới vùng này **méo đi thế nào** · ai
  hưởng lợi
- Tin tức đi bằng tốc độ ngựa và méo dần theo mỗi lần kể lại. Một sự kiện xa nên có
  `variants` theo vùng, hoặc hai entry: bản thật (`secret`) và bản tin đồn (`public`)

### 6.7 `item` — vật phẩm

- Chỉ viết entry cho vật phẩm **có tên riêng và có chuyện**. Vật phẩm thường thuộc
  `/data/items.json` của Phần 16, không thuộc lorebook
- **Nội dung nên có:** ai từng cầm nó · vì sao người ta muốn nó

### 6.8 `creature` — sinh vật

- **regions** gần như luôn cần — quái vật vùng này không lang thang sang vùng khác
- **Nội dung nên có:** dấu hiệu nhận ra TRƯỚC khi thấy mặt · dân địa phương phòng nó
  ra sao · điều người ta tin sai về nó

### 6.9 `custom` — còn lại

Dùng khi không rơi vào tám loại trên.

---

## 7. ĐỘ DÀI VÀ NGÂN SÁCH

Ngân sách mặc định của khối 4 là **24.000 token**, chừng 60.000 ký tự tiếng Việt —
chỉnh được ở ô "Ngân sách lorebook" trong tab Prompt. Con số này nhắm vào cửa sổ ngữ
cảnh lớn (Gemini, Claude); hạ xuống nếu ông đổi sang model cửa sổ nhỏ.

Một lượt thường có 10–25 entry lọt vào. Bảng dưới vẫn nên theo, vì ngân sách rộng
không làm cho một entry dài dòng trở nên đáng đọc hơn.

| Loại entry | Độ dài nên có | Cần `summary`? |
|---|---|---|
| `constant` (nền) | 60–120 chữ | **luôn luôn** |
| địa danh, nhân vật chính | 100–200 chữ | nên có |
| sự kiện, luật | 80–150 chữ | nên có |
| chi tiết phụ | 40–80 chữ | không cần |

Ước lượng: **1 token ≈ 2,5 ký tự tiếng Việt**. Một đoạn 200 chữ ≈ 400 token — tức là
một entry như thế đã ăn hơn một phần tư ngân sách.

**Viết `summary` là việc đáng làm nhất.** Entry không lọt ngân sách mà có `summary` thì
vào bằng bản ngắn; không có thì mất hẳn.

---

## 8. CỔNG TRI THỨC — xin đọc kỹ, đây là chỗ dễ viết hỏng nhất

Bệnh của SillyTavern: lorebook chèn vào là AI biết hết, nên NPC vô tình nói ra chuyện
nhân vật chưa từng nghe. Cách chữa là chia ba mức:

```
public   ai cũng biết → chèn tự do
gated    cần đã biết trước → chỉ chèn khi có đủ requiresKnowledge
secret   KHÔNG BAO GIỜ vào prompt chính; chỉ vào prompt mô phỏng ngầm (Phần 15),
         để thế giới vẫn vận hành đúng sau lưng người chơi
```

### 8.1 Cách chia một chủ đề làm ba entry

Đừng viết một entry rồi gắn `secret`. Hãy tách:

```
npc_ba-tuoc-reinhard          public  Reinhard cai trị Swabia, tính keo, hay kiện.
npc_ba-tuoc-reinhard-am-muu   gated   Ông ta đã gửi thư cho sứ giả Pháp hai lần.
                                      requiresKnowledge: ["fact_thu-cua-reinhard"]
npc_ba-tuoc-reinhard-mo-sat   secret  Lý do thật ông không chịu chia rừng Ehr:
                                      dưới sườn bắc có mạch sắt lộ thiên.
```

Người chơi gặp Reinhard thì AI biết vế một. Đọc trộm được thư thì mở vế hai. Vế ba thì
AI kể chuyện **không bao giờ** thấy, nhưng mô phỏng ngầm thấy — nên Reinhard vẫn hành
động đúng động cơ thật của ông ta.

### 8.2 Đặt id tri thức

Tri thức là những mẩu `fact_*` mà nhân vật **nhặt được trong lúc chơi**:
`fact_thu-cua-reinhard`, `fact_duong-ham-duoi-thanh`, `fact_ten-that-cua-ke-ao-xam`.

Tri thức được thêm vào bằng hai đường: trigger của lorebook (mục 11), hoặc AI đề xuất
qua khối UpdateVariable. Ông chỉ cần **đặt tên** — tôi lo phần cấp phát.

### 8.3 Độ tin cậy

Mỗi mẩu tri thức có `confidence` 0–100. **Dưới 60 là tin đồn**: entry vẫn chèn nhưng
kèm ghi chú bắt AI cho NPC nói dè dặt. Ông không phải khai gì, cơ chế tự chạy.

---

## 9. BIẾN THỂ THEO GÓC NHÌN — linh hồn của bối cảnh

Cùng một chuyện, mỗi phe kể một kiểu. Đây là thứ khiến thế kỷ 14 sống dậy.

```json
"variants": [
  { "audience": "nation_hre",        "content": "Giáo hoàng lấn quyền hoàng đế…" },
  { "audience": "nation_giao-trieu", "content": "Hoàng đế phạm tội chống Giáo hội…" },
  { "audience": "race_cao-tien",     "content": "Cả hai đều là bọn mới nổi…" }
]
```

`audience` phải là **id trần** có thật trong `/data/nations.json` hoặc `/data/races.json`
— không phải `nation:hre` kiểu hai chấm của bản đầu. Engine so khớp nguyên văn, nên gõ
sai một chữ là biến thể im lặng không bao giờ được chọn: entry vẫn chèn, chỉ là chèn bản
trung lập. Có một cổng gác kiểm đúng việc này khi chạy test.

Không khớp phe nào thì dùng `content` gốc — nên `content` phải viết được ở giọng
**trung lập**.

**Biến thể THAY THẾ toàn bộ `content`, không nối thêm.** Mỗi bản phải đứng một mình đọc
được. Vì thế biến thể hợp với entry mà bản thân nội dung là một cách diễn giải (sự kiện,
luật, ly giáo, một trận thua) hơn là với entry thuần dữ kiện (địa hình, dân số) — thay
một bản tả địa hình bằng một bản kể chuyện phe phái là mất luôn phần địa hình.

Engine tự suy ra hai tag mỗi lượt: **phe hiện tại trước, chủng tộc sau**. `pickVariant`
lấy tag khớp đầu tiên, nên khi một chủ đề có cả bản theo phe lẫn bản theo tộc thì bản
theo phe thắng.

**Đáng viết `variants` nhất:** chiến tranh, ly giáo, một vị thánh, một trận thua, nguồn
gốc một chủng tộc, quyền thu thuế. **Không đáng:** địa hình, thời tiết, giá lúa.

---

## 10. NỘI DUNG RENDER BẰNG EJS

`content` chạy qua EJS trước khi vào prompt, dùng đúng bộ biến của khối prompt:

| Biến | Nghĩa |
|---|---|
| `state` | toàn bộ state, **chỉ đọc** |
| `now` | ngày giờ trong game |
| `scene` | nơi chốn, NPC có mặt, thời tiết |
| `history` | các lượt đã chơi |
| `q.*` | `q.relation(id)` `q.rumors()` `q.calendar()` `q.npc(id)` `q.holding()` `q.realm()` … |
| `fmt.*` | `fmt.date(now)` `fmt.money(n)` `fmt.list(arr)` `fmt.pct(n)` **`fmt.approx(n)`** |

Cú pháp: `<%= biểu thức %>` in ra · `<% lệnh %>` chạy · `<%- %>` in thô.

Ví dụ:
```
Chợ họp ngày thứ ba hằng tuần.
<% if (q.relation('npc_eleanor')) { %>Bà bán muối đã nhớ mặt ngài.<% } %>
Năm nay là <%= now.year %>.
```

**Phần lớn entry không cần EJS.** Chỉ dùng khi nội dung phải đổi theo state. Viết chữ
thường là đủ, và tôi sẽ thêm EJS vào những chỗ đáng thêm khi ông đưa file lại.

---

## 11. TRIGGER — lorebook làm được chuyện, nhưng không được quyết con số

```json
"triggers": [
  { "when": "onFirstActivate",
    "emit": { "event": "lore.knowledge.gain",
              "payload": { "id": "fact_thu-cua-reinhard", "source": "nghe lỏm ngoài chợ", "confidence": 40 } } }
],
"triggerOnce": true
```

**Bốn thời điểm:** `onActivate` (mỗi lần được chèn) · `onFirstActivate` (lần đầu) ·
`onEnterRegion` (vừa bước vào vùng của entry) · `onDateReached` (tới `validFrom`).

**Bốn event dùng được ngay:**

| Event | Payload | Làm gì |
|---|---|---|
| `lore.knowledge.gain` | `{ id, source, confidence }` | cấp một mẩu tri thức `fact_*` |
| `lore.rumor.spread` | `{ text }` | thêm một tin đồn vào sổ của nhân vật |
| `lore.notify` | `{ title, body }` | xếp một popup thông báo |
| `lore.flag.set` | `{ flag }` | đặt một cờ tình tiết |

**Ba luật cứng:**
1. Trigger **chỉ phát tín hiệu**, không bao giờ tự ghi số vào state. Đổi tài nguyên, gây
   thương tích, khai chiến — để dành Phần 12–15.
2. **Luôn đặt `triggerOnce` hoặc `triggerCooldown`.** Không có thì một entry khớp mỗi
   lượt sẽ bắn event mỗi lượt.
3. Mỗi lượt tối đa **5 event**; vượt thì hoãn sang lượt sau.

---

## 12. TỪ VỰNG BẮT BUỘC — sai chỗ này là hỏng cả bộ

### 12.1 Ba tầng đất đai không bao giờ được lẫn

| | **THÀNH TRÌ** | **LÃNH THỔ** | **THÁI ẤP** |
|---|---|---|---|
| Là gì | một ĐIỂM, đi bộ hết trong một ngày | một VÙNG, cưỡi ngựa nhiều ngày | một TỜ GIẤY có ấn triện |
| Động từ | xây, dựng, sửa, đặt, tích trữ, đồn trú, vây hãm, coi sóc | cai trị, ban luật, thu thuế, xử án, bổ nhiệm, sáp nhập | phong, thụ phong, thừa kế, tước đoạt, tuyên thệ |
| Đơn vị | người, công trình, ô đất, tuần, giạ lúa, thước tường. **Không dùng phần trăm** | tỉnh, phần trăm, ngày đường, chư hầu, số hộ ước chừng. **Không nhắc tên một công trình cụ thể** | ngày nghĩa vụ, phần cống nộp, số con tin, năm hiệu lực |
| Con số | **chính xác** | **ước chừng**, luôn kèm "chừng" / "khoảng" | theo điều khoản |

### 12.2 Từ bị cấm tuyệt đối

> **"lãnh địa"** — cấm trong mọi entry. Cấm luôn *"đất đai của ngài"*, *"vùng đất của
> ngài"*, *"cơ ngơi"*. Bốn cụm này gộp cả ba tầng làm một.

Có một bộ gác tự động quét thư mục này và in cảnh báo khi chạy test. Nó **không** làm
test đỏ (nội dung ông mang vào là của ông), nhưng những từ đó sẽ đi thẳng vào prompt.

### 12.3 Không dùng từ ngữ hiện đại

Tránh: hiệu suất, năng lượng, tối ưu, hệ thống, dữ liệu, phần trăm ở cấp thành trì.
Thế kỷ 14 không có in ấn hàng loạt, ngân hàng hiện đại, khái niệm quốc tịch, hay
thuốc súng phổ biến (trừ Đế quốc Orc — họ dẫn đầu về pháo).

---

## 13. CÂY VÙNG

`/data/regions.json` giờ là bản đồ THẬT của Europa 1444, dựng từ 91 entry địa danh
của ông: 122 node — 1 lục địa, 43 vương quốc, 40 tỉnh, 38 thành trì.

Mỗi node: `{ id, name, kind, parentId, adjacent[] }`, `kind` là một trong
`continent` `realm` `province` `settlement`.

**Id của entry địa danh TRÙNG với id vùng.** Entry "Công quốc Bavaria" có id
`prov_bayern`, và `prov_bayern` cũng là một node trong cây. Nhờ vậy Phần 12 và 13 sau
này tra ngược được từ vùng ra nội dung mà không cần bảng ánh xạ thứ hai.

Hình dạng cây:

```
reg_europa
├─ prov_alps · prov_carpathian · prov_steppe-pontic     ← vùng xuyên biên giới,
│                                                          treo thẳng dưới lục địa
├─ realm_hre
│  ├─ prov_swabia   → hold_ehrenfeld · hold_brogg · hold_augsburg
│  ├─ prov_bayern   → hold_muhldorf · hold_regensburg
│  ├─ prov_bohemia · prov_ao · prov_saxony · prov_brandenburg · prov_pomerania
│  ├─ prov_mainz · prov_trier · prov_cologne · prov_palatinate  ← bốn tuyển hầu quốc
│  ├─ prov_alsace · prov_baden · prov_wurttemberg · prov_rung-den · prov_hessen
│  └─ prov_bo-bien-baltic → hold_lubeck · hold_hamburg
├─ realm_france
│  ├─ prov_champagne → hold_troyes
│  └─ prov_normandy · prov_brittany · prov_anjou · prov_orleans · prov_bourbon
│     prov_aquitaine · prov_languedoc · prov_avignon
├─ realm_ottoman   → prov_rumelia (hold_edirne, hold_varna) · prov_anatolia
├─ realm_byzantine → hold_constantinople · prov_morea
├─ realm_hungary   → prov_transylvania
└─ … 38 vương quốc khác: Anh, Scotland, Castile, Aragon, Bồ Đào Nha, Granada,
     Venice, Genoa, Florence, Milan, Savoy, Naples, Quốc gia Giáo hoàng, Thụy Sĩ,
     Burgundy, Đan Mạch, Thụy Điển, Na Uy, Ba Lan, Lithuania, Teuton, Livonia,
     Muscovy, Novgorod, Pskov, Tver, Ryazan, Đại Trướng, Crimea, Kazan, Astrakhan…
```

**Vùng xuyên biên giới treo dưới lục địa, không dưới vương quốc.** Alps nằm vắt qua
Đế quốc, Thụy Sĩ, Savoy và Milan cùng lúc; cây thì chỉ có một cha, nên treo nó dưới
`realm_hre` là biến ba nước kia thành ngoài Alps.

Muốn thêm vùng thì sửa thẳng `/data/regions.json`. Cổng gác sẽ báo ngay nếu một entry
trỏ tới vùng không tồn tại.

---

## 14. CHECKLIST TRƯỚC KHI ĐƯA LẠI

- [ ] Mỗi entry có `id` theo quy ước mục 2, không trùng nhau giữa các sách
- [ ] Từ khóa là tên riêng hoặc cụm nhiều chữ, không phải từ phổ thông
- [ ] Entry `constant` dưới 120 chữ và có `summary`
- [ ] Bí mật tách thành entry riêng `secret` / `gated`, không viết chung vào entry công khai
- [ ] Entry gắn vùng dùng đúng id trong cây vùng
- [ ] Sự kiện và luật có `validFrom`
- [ ] Trigger nào cũng có `triggerOnce` hoặc `triggerCooldown`
- [ ] Không có chữ "lãnh địa", "đất đai của ngài", "vùng đất của ngài", "cơ ngơi"
- [ ] Con số cấp lãnh thổ đều kèm "chừng" / "khoảng"
- [ ] Chạy `npx vitest run src/lore/lore.test.ts` xanh

## 15. MƯỜI LỖI HAY GẶP

1. Từ khóa quá rộng → entry vào mọi lượt, ăn hết ngân sách của những entry đúng lúc hơn
2. Viết một entry dài 500 chữ thay vì ba entry 150 chữ → một mình nó chiếm cả khối 4
3. Gắn `regions` ở cấp thành trì trong khi ý là cả tỉnh → entry gần như không bao giờ chèn
4. Bí mật viết chung vào entry `public` → AI nói toạc ra ở lượt đầu tiên
5. Quên `triggerOnce` → người chơi nhận cùng một tin đồn mười lượt liên tiếp
6. `related` trỏ tới id không tồn tại → im lặng không kéo được gì
7. Bật `recurse` cho entry có nhắc tên nhiều thứ → kéo vào cả chục entry, nổ ngân sách
8. Viết định nghĩa từ điển thay vì viết cái người thường nhìn thấy
9. Dùng động từ của tầng này cho tầng kia ("thu thuế của thành trì", "vây hãm bá quốc")
10. Đặt `probability` thấp cho entry quan trọng → nó biến mất đúng lúc cần nhất

---

## 16. THỨ TÔI CHƯA NỐI ĐƯỢC — để ông không trông đợi nhầm

| Chỗ | Trạng thái | Chờ phần nào |
|---|---|---|
| Phe hiện tại (`knowledge.factionId`) | có ô chọn tay ở tab Lorebook; chưa suy ra được từ tước vị | Phần 13, 14 |
| Vị trí nhân vật (`knowledge.regionId`) | có ô chọn tay ở tab Lorebook; chưa có di chuyển thật | Phần 12, 13 |
| `q.holding()` `q.realm()` `q.title()` `q.army()` `q.skills()` | trả về rỗng | Phần 8, 10, 12, 13 |
| Popup của `lore.notify` | có xếp hàng, chưa có chỗ hiện | Phần 15 |
| Kênh `worldtick` cho entry `secret` | scanner nhận kênh, nhưng chưa có vòng mô phỏng gọi nó | Phần 15 |

Những chỗ này **không cản việc viết nội dung** — ông cứ khai đủ, engine sẽ đúng dần theo
từng phần. Chỗ nào chưa chạy thì UI in thẳng lý do ra chứ không im lặng bỏ qua.

> **Lưu ý về `regions` và vị trí:** entry có khai `regions` mà `knowledge.regionId` còn
> rỗng thì bị chặn ở L3, không phải bị bỏ qua — panel sẽ ghi *"entry chỉ dùng ở …, mà
> chưa biết đang ở đâu"*. Đó là lý do 91 entry địa danh KHÔNG khai `regions`: nhắc tên
> Constantinople ở Paris vẫn là chuyện bình thường. Chỉ những entry thật sự là chuyện
> địa phương (`70-vung-mien.json`) mới gắn vùng.

### 16.1 Đã nối xong kể từ lần sửa này

| Chỗ | Trước | Nay |
|---|---|---|
| `{{user}}` và mọi macro trong nội dung entry | in nguyên chữ `{{user}}` vào prompt | chạy macro trước EJS, đúng thứ tự của Phần 3 mục 7 |
| `summary` | đi thẳng vào prompt, không qua macro lẫn EJS | qua đúng hai bước như `content` |
| Ngân sách khối 4 | cứng 1.500 token | 24.000, chỉnh được ở tab Prompt |
| `/data/races.json` | rỗng | 34 tộc + node nhóm Nhân loại, có `homelands` và `loreEntry` |
| `/data/regions.json` | cây mẫu 10 node | bản đồ Europa 1444, 122 node |
| `/data/nations.json` | rỗng | 17 thế lực (11 chính tắc + 6 từ lorebook) |
| Mốc mở màn | 1/1/1444 | 15/11/1444, sau trận Varna |
| `scope.kind: "faction"` | luôn tắt | bật theo ô "phe hiện tại" |
| `scope.kind: "nation"` vế thần dân | chưa có | bật theo ô "phe hiện tại" |
| `scope.kind: "race"` vế "đất của tộc" | chưa có | đọc `homelands` của `races.json` |
| `audience` của `variants` | `race:nguoi` — không khớp dạng tài liệu ghi | id trần `race_*` / `nation_*` |
| Vị trí và phe | phải gõ tay ở tab Biến | hai ô chọn ở đầu tab Lorebook |
| Bí mật nhân vật | nằm chung trong entry `public` | tách thành 73 `gated` + 73 `secret` |
