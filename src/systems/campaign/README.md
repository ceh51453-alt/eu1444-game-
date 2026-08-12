# CHIẾN ĐỒ — bản đồ chinh phục ba tầng

Bản đồ **thứ hai** của dự án, và nó không thay bản đồ nào cả.

| | `world-map.json` + `src/sim/map.ts` | `campaign-map.json` + `src/systems/campaign/` |
|---|---|---|
| Câu hỏi | "từ đây tới đó mất mấy ngày" | "đất này của ai, muốn lấy phải hạ đâu" |
| Dùng cho | tin tức, sứ giả, tin đồn (Phần 15 mục 6) | chinh phục, chư hầu, vị trí quân |
| Hình học | 121 điểm, toạ độ km thật | 765 nút ba tầng, đã nới cho hết chồng lấn |
| Sở hữu | không biết | là toàn bộ lý do nó tồn tại |

Hai file mượn chung một bảng toạ độ gốc nên chúng không bao giờ lệch nhau về địa
lý, nhưng không file nào chép của file nào.

---

## 1. BA TẦNG

```
qg_*      QUỐC GIA   43 nước + 3 vùng hoang + 12 vùng nước
 └ vung_* VÙNG LỚN   tỉnh có thật của regions.json, sinh bù cho nước nào thiếu
    └ huyen_* HUYỆN  ô nhỏ nhất — có địa hình, và có thể có một ĐIỂM
```

Điểm trong một huyện là **thành trì**, **thị trấn**, hoặc **làng**. Thành trì và
thị trấn là MỤC TIÊU; làng thì không, và đó là chủ ý: nếu làng cũng tính thì
chiến dịch biến thành cuộc chạy đua giẫm lên đất trống, không ai cần vây thành.

Ba từ của README dự án mục 6.1 giữ nguyên nghĩa ở đây: **thành trì** là một
ĐIỂM (một huyện), **lãnh thổ** là một VÙNG (`vung_*`, `qg_*`), và chiến đồ không
đụng tới **thái ấp** — tờ giấy có ấn triện vẫn là của Phần 13.

---

## 2. LUẬT CHINH PHỤC — một câu

> Chiếm được một VÙNG khi mọi thành trì và thị trấn bên trong đã đổi chủ, **hoặc**
> khi chủ của nó chịu làm chư hầu. Chiếm được một QUỐC GIA khi mọi vùng của nó
> đã đổ theo đúng hai đường ấy.

Thủ phủ **đổ sau cùng** (`config.conquest.seatFallsLast`): `canCapture` từ chối
đánh thẳng vào nó và nói ra còn phải hạ những đâu.

**Màu suy ra chứ không lưu.** Slice chỉ ghi những mục tiêu đã đổi chủ; màu của
vùng và của quốc gia tính lại mỗi lần vẽ. Lưu màu là lưu bản sao của một thứ tính
được, và bản sao ấy sẽ lệch đúng vào lúc một chư hầu phản bội.

Hai chữ "giữ" khác nhau, lẫn chúng là hỏng cả hệ:

- `holderOf` — phe **thật sự** cầm ô ấy.
- `controllerOf` — **tôn chủ trên cùng** của phe ấy. Đây là màu nền.

Đất Burgundy khi Burgundy làm chư hầu Pháp có nền Pháp và sọc Burgundy.

---

## 3. HÀNH QUÂN — không ai dịch chuyển

Đạo quân không đổi ô vì người kể chuyện nói nó đã tới nơi. Nó nhận một
`MarchOrder` gồm **cả con đường**, rồi bò trên đường ấy mỗi ngày một quãng; giữa
chừng nó nằm GIỮA hai ô, nhìn thấy được và chặn được.

- `orderMarch` — cửa của người chơi.
- `moveArmyFromNarrative` — cửa **duy nhất** của AI, và nó trả về một chuyến đi
  chứ không phải một vị trí mới (R1).
- `deployArmy` — ngoại lệ duy nhất, và không phải một cú nhảy: trước đó đạo quân
  ấy chưa tồn tại.
- `runCampaignTick` — chỗ **duy nhất** trong turn loop dời quân, gắn vào nhịp
  nhanh của Phần 15 (`sim/worldtick.ts`), nên quân nhích ngay trong lượt người
  chơi vừa tiêu vài giờ chứ không đợi đầu tháng.

Vây thành: chiến đồ chỉ giữ **cái đồng hồ và cái ghim**. Thị trấn tường thấp thì
phong toả đủ tuần là mở cổng; **thành trì thì không** — `advanceSieges` chỉ đánh
dấu "đã đủ tuần", kết cục là của Phần 11 (`src/systems/siege/`). Hai engine công
thành chạy song song sẽ nói khác nhau.

---

## 4. ĐỌC GÌ, GHI GÌ

**GHI** — chỉ slice `campaign`, và chỉ qua MVU:

| Đường dẫn | Nghĩa | Quyền |
|---|---|---|
| `campaign.control` | `huyen_* → phe_*`, chỉ mục tiêu ĐÃ đổi chủ | engine |
| `campaign.vassals` | `phe_chư-hầu → phe_tôn-chủ` | engine |
| `campaign.armies` | vị trí, tư thế, lệnh hành quân | engine |
| `campaign.sieges` | ai đang vây đâu, mấy tuần rồi | engine |
| `campaign.playerFactionId` | phe của người chơi | engine |
| `campaign.chronicle` | sổ biến động lãnh thổ, 60 dòng | engine |

Quyền là `engine` **cho tất cả, không ngoại lệ**. Nếu AI ghi thẳng được vào
`armies.*.nodeId` thì một câu văn là đủ để dịch chuyển ba nghìn người qua bốn
trăm cây số, và cả cơ chế vây thành, cắt tiếp tế, cứu viện mất sạch lý do tồn tại.

**ĐỌC**:

| Nguồn | Lấy gì |
|---|---|
| `data/campaign-map.json` | nút, cạnh, phe, màu, địa hình, cấu hình |
| `data/regions.json` | tên vùng thật, cây vùng (qua `nodeForRegion`) |
| `meta.gameDate` | mùa, để tính tốc độ hành quân |

**KHÔNG đọc** `military`, `realm`, `holdings`, `nations`. Ranh giới với
`military` chỉ có một câu: **`military` giữ QUÂN SỐ, `campaign` giữ VỊ TRÍ.**
Lớp UI (`src/ui/campaign/campaign.ts`) bắc cầu giữa hai bên, đúng như `App.tsx`
vẫn bắc cầu giữa các minigame và state.

---

## 5. SINH LẠI DỮ LIỆU

```bash
node tools/tao-chien-do.mjs
```

Đừng sửa `data/campaign-map.json` bằng tay — sửa bảng khai tay trong script rồi
chạy lại. Script tự dừng nếu bố cục còn chồng lấn, nếu một vùng không có thành
trì nào, hoặc nếu đồ thị huyện vỡ mảnh.

`data.ts` kiểm lại **tám** điều ấy một lần nữa lúc khởi động, vì "sinh ra bởi
script" không phải một lời bảo đảm: script còn được sửa. Cái sai phải nổ lúc mở
game, không phải lúc người chơi bấm vào một vùng và thấy nó nằm dưới một vùng
khác.
