# systems/nations

**Chủ sở hữu:** Phần 14 (tám thế lực) — và Phần 14b sẽ thêm ba thế lực nữa vào
đúng bộ khung này, không mở khung mới.

**Nhiệm vụ:** tầng thứ ba của bản đồ quyền lực. Thành trì là một ĐIỂM (Phần 12),
lãnh thổ là một VÙNG (Phần 13), thế lực là một BÀN CỜ CHÍNH TRỊ.

> **Quy tắc kiểm tra trước khi thêm bất cứ trường nào**, viết tiếp mạch của Phụ
> lục A: có **tọa độ** thì thuộc thành trì · có **phạm vi áp dụng** thì thuộc lãnh
> thổ · có **phe, phiếu, hoặc chữ ký** thì thuộc thế lực.

## Tám thể loại, tám thư mục

Engine ở đây; tám minigame ở `/src/nations/*`. Bảng thể loại (mục 1: *nếu hai
quốc gia chơi giống nhau thì một trong hai làm sai*):

| Thế lực | `minigame` | Thể loại | Kết cục thất bại đặc trưng |
|---|---|---|---|
| Đế quốc Orc | `quan-doan` | quản lý cỗ máy quân sự | Tân Binh Đoàn phế truất người cai trị |
| Đông La Mã | `noi-chien` | mọi lựa chọn cứu vãn đều đẩy nhanh sụp đổ | mất kinh đô |
| Liên bang Núi | `lien-bang` | đồng thuận và nghịch lý | hai bang giết nhau vì hai hợp đồng |
| Hãn quốc thảo nguyên | `cong-nap` | bòn rút ngoài, tan bên trong | tách thành các hãn quốc nhỏ |
| Đế quốc | `cai-cach` | bỏ phiếu và mặc cả | rã dần thành các quốc gia riêng |
| Vương quốc Frank | `tap-quyen` | thôn tính từng bước | liên minh quý tộc phản cùng lúc |
| Giáo triều | `mat-nghi` | chính trị nội bộ + đòn bẩy toàn cầu | hai Giáo hoàng |
| Thành bang Latin | `ngan-hang` | tài chính và rủi ro | mất ghế |

Ba chỗ giữ lời hứa ấy chạy được: `data.ts` (phép kiểm 1 lúc nạp), `slice.ts`
(ràng buộc `nations.tam-the-loai-khac-nhau`), `nations.test.ts` (tám bảng phải có
tám tập tên trường khác nhau).

## ĐỌC biến nào

| Đường dẫn state | Vì sao cần |
|---|---|
| `knowledge.known.*`, `knowledge.factionId` | độ rõ của bảng — cổng tri thức Phần 4 (`access.ts`) |
| `titles` (qua `heldTitles`) | tầng tiếp cận — thang nào, bậc nào (`access.ts`) |

Không đọc gì khác. Đặc biệt: **KHÔNG đọc `realm`, `holdings`, `character`.** Một
thế lực không biết người chơi đang giữ thành trì nào; nó chỉ biết người chơi có
tước gì trên thang nào.

## GHI biến nào

| Đường dẫn state | Quyền ghi |
|---|---|
| `nations.powers.*`, `nations.relations.*`, `nations.timeline.*`, `nations.exiles.*` | engine |
| `nations.courtRumours.*`, `nations.opinion.*` | ai |
| `religions.areas.*`, `religions.prestige.*`, `religions.echoes.*` | engine |
| `religions.prophecies.*`, `religions.miracleRumours.*` | ai |

AI không ghi được một con số nào ở tầng này, và đó là chủ ý: hai slice này là THẾ
GIỚI CHẠY SAU LƯNG NGƯỜI CHƠI. Nếu AI sửa được uy tín Giáo hội hay lá phiếu tuyển
hầu thì nó vừa kể chuyện vừa quyết định chuyện, và R1 sụp ở chỗ khó phát hiện
nhất — không ai kiểm tra lại một câu văn.

## Hướng import (một chiều, và nó là ranh giới thật)

```
/src/nations/*   →  @/systems/nations/{types,data,events}     ✔
/src/nations/*   →  @/systems/nations  (barrel)               ✘  vòng qua year.ts
year.ts          →  /src/nations                              ✔
```

Minigame KHÔNG đọc store, KHÔNG đọc slice, KHÔNG sửa bảng của thế lực khác. Mọi
thứ nó cần nằm trong `MinigameContext`; mọi thứ nó muốn gây ra cho nước khác đi
qua `WorldEvent` cộng bảng dội `data/diplomacy.json`.

## Thứ tự sáu bước của một năm (`year.ts`)

1. **quan hệ** — chiến tranh, hòa ước, đất đổi chủ
2. **minigame** — tám bảng chạy độc lập
3. **dội** — tuyên bố lớn chảy sang nước khác qua data
4. **dân số** — chính sách, oán hận, nổi dậy sắc tộc, dòng di dân
5. **tôn giáo** — dị giáo lớn theo tiếng vọng khủng hoảng, Giáo hội đáp lại
6. **dòng thời gian** — gom biến cố, phát ra eventbus cho Phần 15

Bước 1 trước bước 2 vì một minigame không được tự tuyên bố mình vừa thắng trận.
Bước 4 sau bước 2 vì chính sách là quyết định của từng thể loại, còn hệ quả của
chính sách thì chung cho cả tám.

## Năm file data (R5)

`data/nations.json → powers` · `data/orc-corps.json` · `data/religions.json`
(bốn khối mới: `spread`, `heresy`, `relations`, `seeds`) · `data/reforms.json` ·
`data/diplomacy.json`.

`nations.json` mang HAI vai: mảng `nations` là sổ đăng ký thế lực của Phần 4, khối
`powers` là vế gameplay của Phần 14. Một file vì câu hỏi "thế lực nào có thật"
chỉ được có một nguồn trả lời.

## Ràng buộc

- Mọi thay đổi state đi qua MVU, không `set()` thẳng vào store (R2).
- Mọi hàm tính toán thuần: nhận state, trả state mới (Phần 0 mục 7).
- Dòng xúc sắc riêng `NATIONS_STREAM` — số lần tung một năm đổi theo cách chơi (R3).
- Mọi tuyên bố lớn phát event ra ngoài (mục 12), đặc biệt là của Giáo hoàng.
