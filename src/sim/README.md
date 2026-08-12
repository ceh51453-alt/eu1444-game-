# sim

**Chủ sở hữu:** Phần 15
**Nhiệm vụ:** Thế giới tự vận động khi người chơi không có mặt, và người chơi chỉ BIẾT khi tin tức đến tai.

**Trạng thái:** xong. Đây là phần cuối của dự án, và là chỗ bước 8 của vòng lặp lượt (Phần 0 mục 6) được lấp.

## File nào làm gì

| File | Việc |
|---|---|
| `types.ts` | `Agent`, `WorldEvent`, `NewsItem`, `ArrivedNews`, `TickReport` |
| `data.ts` | nạp `world-map.json`, `news.json`, `sim.json` + **sáu phép kiểm tham chiếu** lúc khởi động |
| `slice.ts` | slice `world`: schema, quyền ghi mục 10, hai biến phụ, ba ràng buộc chéo |
| `map.ts` | đồ thị tuyến đường, Dijkstra trên **km quy đổi**, đổi ra ngày đi theo mùa |
| `news.ts` | gửi tin, suy giảm độ chính xác, **bóp méo nội dung**, dựng dòng người chơi đọc |
| `agents.ts` | sinh agent, **tính lại ba tầng mỗi tháng**, mục tiêu, tri thức riêng |
| `decide.ts` | cây quyết định tầng B (tất định) + bảng xác suất tầng C |
| `batch.ts` | **gộp 8–12 agent vào một request** cho tầng A, và hai hàng rào chặn LLM |
| `resolve.ts` | phân giải quyết định qua phép kiểm 3d6 của Phần 5, sinh biến cố |
| `text.ts` | mẫu văn bản cho mức 1–3, gộp một request LLM cho mức 4–5 |
| `events.ts` | phân luồng hai dòng hiển thị, xếp chồng thẻ, lọc dòng tin |
| `invariants.ts` | bảy phép kiểm bất biến + trần biến động + nhật ký |
| `cost.ts` | trần request mỗi tháng, nút tắt LLM, đếm token và tiền |
| `fasttick.ts` | nhịp MỖI LƯỢT — rẻ, tất định, không gọi mạng |
| `deeptick.ts` | nhịp MỖI THÁNG — tám bước B1–B8 của mục 5 |
| `worldtick.ts` | cửa công khai của bước 8, và **chạy bù** khi người chơi tua nhiều tháng |
| `seed.ts` | gieo agent từ `data/houses.json` — 54 nhà có người đứng đầu |
| `bridge.ts` | chỗ DUY NHẤT biết cả Phần 14 lẫn Phần 15: sổ tra tên, bảng quốc gia, tình hình |

## ĐỌC biến nào

| Đường dẫn state | Vì sao cần |
|---|---|
| `meta.gameDate` | nhịp của cả hai tick; tick nhanh cộng ngày vào chính nó |
| `meta.rng.streams.worldtick` | dòng xúc sắc riêng — số lần rút đổi theo số NPC đang sống (R3) |
| `knowledge.regionId` | ĐÍCH của mọi tin: tin đi tới chỗ người chơi đang đứng |
| `knowledge.factionId` | điểm liên quan khi tính lại tầng — người cùng phe liên quan hơn |
| `nations.powers` | kiểm bất biến "quốc gia không đất", và kẹp trần biến động |
| `nations.relations` | ai đang có chiến tranh THẬT — miễn trần lãnh thổ (mục 9) |
| `titles.held` | kiểm bất biến "không ai giữ hai lần cùng một tước" |

## GHI biến nào

| Đường dẫn | Ai ghi | Ghi cái gì |
|---|---|---|
| `meta.gameDate` | engine | thời gian trôi ở tick nhanh |
| `world.agents` | engine | tầng, tuổi, sống chết, nguồn lực, tri thức riêng, việc đang làm |
| `world.agents.*.goals` | **ai** | mục tiêu — đây là Ý ĐỊNH, không phải số (mục 10) |
| `world.agents.*.personality` | **ai** | tính cách, cùng lý do |
| `world.inFlight` | engine | tin đang trên đường |
| `world.events` | engine | hàng đợi biến cố — NGUỒN SỰ THẬT |
| `world.feed` | engine | dòng tin người chơi đọc — CÓ THỂ SAI so với `events` |
| `world.cards` | engine | chồng thẻ cần quyết định |
| `world.budget` | engine | request đã tiêu, token, tiền, công tắc LLM |
| `world.log` / `world.repairs` | engine | nhật ký tick sâu và bất biến đã tự sửa |
| `world.rumours` / `world.opinion` | **ai** | chữ, không vào công thức nào |
| `knowledge.known` | engine | tin tới nơi thì ghi vào tri thức Phần 4, với `confidence` = độ chính xác còn lại |

## Ba chỗ dễ hiểu sai

### 1. `world.events` là sự thật, `world.feed` thì không

`WorldEvent.text` luôn đúng. `ArrivedNews.text` là thứ người chơi đọc được, và nó
có thể nói ngược lại — một trận thua tới nơi thành một trận thắng, số quân bị
thổi lên gấp ba. **Đây là tính năng, không phải lỗi** (mục 6). Mọi công thức đọc
`events`; chỉ người chơi và AI kể chuyện đọc `feed`, và cả hai ĐƯỢC PHÉP tin nhầm.

Bóp méo xảy ra ở `news.ts`, lúc tin tới tay người chơi — không phải lúc biến cố
sinh ra. Trộn hai chỗ là mất luôn chỗ dựa của mọi bất biến ở mục 9.

### 2. Tầng của agent KHÔNG đổi hành vi, chỉ đổi ai nghĩ hộ

Một bá tước đang gom quân để chiếm một toà thành thì vẫn gom quân ấy ở cả ba
tầng. Khác biệt là ở tầng A ông ta có thể nghĩ ra một cách gom quân không ai
lường trước, còn ở tầng C thì ông ta gom đều đều theo bảng. **Người chơi không
bao giờ được thấy sự chuyển tầng** — nếu một NPC đổi hẳn cách cư xử đúng lúc
người chơi cưỡi ngựa tới gần thì thế giới lộ ra là một sân khấu chỉ dựng khi có
khán giả.

`promoteAbove` trong `sim.json` cố ý THẤP; `maxA` mới là thứ giữ hoá đơn.

### 3. Tắt LLM thì mọi thứ vẫn chạy

`decide.ts`, `resolve.ts`, `news.ts`, `invariants.ts` không gọi mạng dòng nào.
Thiếu `llm` trong `DeepTickInput` là đường đi hợp lệ, không phải trường hợp lỗi.
Bài test `"tắt hẳn LLM thì không gọi lần nào, và thế giới vẫn chạy"` giữ lời hứa
ấy — mục 5 nói *game vẫn phải hoạt động bình thường, chỉ là thế giới kém bất ngờ
hơn*.

## Ba bài test của mục 12

Chạy `npx vitest run src/sim/sim.test.ts`. Cả ba đều IN KẾT QUẢ ra stdout, vì
phần lớn giá trị của chúng là thứ phải đọc chứ không assert được.

| Bài | Đo cái gì | Kết quả seed `phan-15` |
|---|---|---|
| **A** | 5 năm không người chơi, bất biến không vi phạm | 53 người → 48 sống, **1.226 biến cố, 0 lần vi phạm** |
| **B** | tin lớn từ Kazan tới Bồ Đào Nha | 4.471 km chim bay, **5.401 km đường thật qua 10 chặng**; sứ giả 85 ngày / 26% tin cậy, tin đồn 283 ngày / 5% — cả hai đều bị đảo ngược kết cục |
| **C** | chi phí 12 tháng với model rẻ | 6 người ở tầng A, 14 request, **23.587 token vào · 3.929 ra**, ≈ **$0,006 mỗi năm trong game** |

Về hai chữ "chi phí thật" ở bài C: nó không gọi proxy — một bài test gọi mạng thì
không chạy được ở CI, không tái lập được, và tốn tiền mỗi lần chạy. Cái nó đo là
thứ QUYẾT ĐỊNH hoá đơn: prompt THẬT mà `batch.ts` và `text.ts` dựng ra, đếm bằng
chính bộ ước lượng token của Phần 3, nhân với giá niêm yết của một model rẻ. Phần
duy nhất là ước lượng nằm ở tỷ lệ ký tự trên token.

## Sinh lại bản đồ

`data/world-map.json` SINH TỰ ĐỘNG. Sửa bảng vĩ độ/kinh độ trong
`tools/tao-ban-do.mjs` rồi chạy:

```
node tools/tao-ban-do.mjs
```

Script tự nổ nếu `regions.json` có vùng chưa có toạ độ, hoặc nếu một tuyến khai
tay trỏ vào vùng không tồn tại.
