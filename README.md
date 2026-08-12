# DỰ ÁN: AI MEDIEVAL FANTASY GRAND RPG
## Tài liệu gốc — ĐỌC FILE NÀY TRƯỚC MỌI THỨ KHÁC

---

## 1. DỰ ÁN NÀY LÀ GÌ

Một game nhập vai đơn chạy local trong trình duyệt. Bối cảnh châu Âu thế kỷ 14
nhưng là thế giới giả tưởng với hơn 30 chủng tộc sống xen kẽ nhau.

Chia vai rất rõ ràng, và đây là điều quan trọng nhất của cả dự án:

- **AI (LLM) lo TOÀN BỘ diễn biến**: mô tả, hội thoại, không khí, hệ quả kể chuyện.
- **Engine lo TOÀN BỘ số liệu**: xác suất, xúc sắc, sát thương, tài nguyên, thời gian.
- **AI không bao giờ được tự quyết một con số.**

Người chơi bắt đầu từ bất kỳ giai tầng nào — kể cả nông nô — và về lý thuyết có
thể leo tới ngôi hoàng đế. Trên đường đi họ sẽ: tạo nhân vật chi tiết, rèn luyện
kỹ năng theo nhánh, đấu tay đôi, chỉ huy chiến trận, vây và giữ thành, xây dựng
thành trì từ một thôn nhỏ, cai trị lãnh thổ với chư hầu có thể phản bội, và tham
gia chính trị của tám thế lực lớn. Trong lúc đó thế giới tự vận động ngầm, kể cả
khi người chơi không có mặt.

**Stack đã chốt:** React 18 + TypeScript strict + Vite. Chạy local, không server.
State bằng Zustand + Immer. Validate bằng Zod. Ba tầng lưu trữ: IndexedDB (chạy),
SQLite trong OPFS (kho lớn), file JSON (export/import tay).

---

## 2. SÁU NGUYÊN TẮC BẤT BIẾN

Mọi phần, mọi module, mọi dòng code đều phải tuân. Nếu một yêu cầu ở đâu đó mâu
thuẫn với sáu điều này, sáu điều này thắng.

| | Nguyên tắc |
|---|---|
| **R1** | **TÁCH VAI.** Engine tung xúc sắc và tính kết quả TRƯỚC. Kết quả đó vào prompt như dữ kiện bắt buộc. AI chỉ diễn giải, không được đảo ngược. |
| **R2** | **STATE LÀ SỰ THẬT DUY NHẤT.** Không dữ liệu nào chỉ tồn tại trong văn bản AI. Mọi thay đổi phải qua MVU và được Zod validate. |
| **R3** | **TÁI LẬP ĐƯỢC.** Mọi roll dùng seeded RNG, seed lưu trong save. Cùng seed + cùng input = cùng kết quả cơ học. Undo khôi phục cả rngState (chống save-scum). |
| **R4** | **FAIL-SAFE.** AI trả sai schema → từ chối TOÀN BỘ patch, giữ nguyên state, ghi log, KHÔNG crash, KHÔNG apply một nửa. |
| **R5** | **KHÔNG HARDCODE NỘI DUNG.** Chủng tộc, quốc gia, binh chủng, tước vị, công trình, vật phẩm — nạp từ file data ngoài. |
| **R6** | **MỌI THỨ CÓ XÁC SUẤT.** Không hành động nào auto-thành-công trừ khi được đánh dấu explicit trong data. |

---

## 3. CÁCH ĐỌC CÁC FILE PROMPT

### 3.1 Mỗi file là một prompt độc lập
Mỗi file trong `prompts/` được đưa cho Claude Code như một yêu cầu riêng, theo
thứ tự số. Không đưa nhiều file cùng lúc. Không nhảy cóc.

### 3.2 Cấu trúc chung của mỗi file
Mọi file đều có các mục theo thứ tự này:

- **Tiền đề** — những phần nào phải xong trước. Đây là điều kiện cứng.
- **Mục tiêu / Nguyên tắc** — vì sao phần này tồn tại, và ràng buộc thiết kế.
- **Các mục nội dung** — đặc tả chi tiết, có đánh số để tham chiếu chéo.
- **VIỆC CẦN LÀM** — danh sách việc phải hoàn thành trong prompt này.
  Đây là phần duy nhất bắt buộc phải làm xong hết.
- **Sau khi xong** — thứ phải báo cáo lại cho người ra đề trước khi sang phần kế.

### 3.3 Các ký hiệu quy ước

| Ký hiệu | Nghĩa |
|---|---|
| `[LOCKED]` | Không được tắt, không được xóa, không được kéo ra khỏi vị trí. UI phải chặn cứng, không chỉ ẩn nút. |
| `[CHỜ CHỐT]` | Chưa quyết định, phải hỏi người ra đề trước khi tự chọn. |
| `→ Phần N` | Tham chiếu chéo. Phải nối THẬT vào phần đó, không phải làm hai hệ rời nhau. |
| `KHÔNG làm:` | Ranh giới phạm vi. Làm thừa cũng là sai, vì phần sau sẽ làm lại. |
| `/data/*.json` | File dữ liệu ngoài. Theo R5, không được nhét vào code. |

### 3.4 Cách hiểu "VIỆC CẦN LÀM" và "KHÔNG làm"
Mỗi phần được cắt phạm vi rất cẩn thận. Làm ít hơn thì phần sau không có nền để
xây. Làm nhiều hơn thì phần sau phải đập đi làm lại, và thường sẽ làm sai vì
thiếu ngữ cảnh. Nếu thấy một thứ có vẻ cần mà không nằm trong danh sách,
đó là cố ý — nó thuộc về một phần khác.

### 3.5 Bài test cuối mỗi phần
Gần như phần nào cũng có bài test ở cuối "VIỆC CẦN LÀM". Chúng không phải unit
test cho vui — chúng là cách duy nhất phát hiện hệ thống đã lệch. Ví dụ bài test
Monte Carlo ở Phần 5 sẽ lộ ra ngay nếu ngưỡng 5 cấp cài sai. Đừng bỏ qua.

### 3.6 Các file có hậu tố chữ
File như `14b-...` là phần bổ sung cho `14-...`, đọc sau file gốc.
Các bản vá (`Vá số 1/2/3` trong lịch sử trao đổi) ĐÃ ĐƯỢC GỘP SẴN vào file chính.
Không cần đối chiếu ngược.

---

## 4. THỨ TỰ THỰC HIỆN & PHỤ THUỘC

### 4.1 Bốn giai đoạn

**Giai đoạn A — HẠ TẦNG (Phần 0→4).**
Kết thúc giai đoạn này, turn loop chạy thông và game đã chơi được ở dạng thô.
Đây là cột mốc quan trọng nhất của cả dự án.

**Giai đoạn B — NHÂN VẬT (Phần 5→8).**
Phần 5 dựng registry modifier mà MỌI phần sau đều cắm vào. Tuyệt đối không nhảy qua.

**Giai đoạn C — CHIẾN ĐẤU (Phần 9→11 + 16).**
Phần 9 dựng `CombatChronicle` mà Phần 10 và 11 dùng lại — nó nằm ở
`/src/systems/combat/`, KHÔNG nằm trong `minigames/duel/`, để dã chiến không phải
import từ một minigame khác. Phần 16 (trang bị) có thể làm sau Phần 11, nhưng
phải sửa ngược lại logic thương tích của Phần 7 và 9.

**Giai đoạn D — THẾ GIỚI (Phần 12→15).**
Phần 12 và 13 là chỗ ranh giới thành trì/lãnh thổ dễ vỡ nhất. Đọc Phụ lục A
trước khi bắt đầu Phần 12, không phải sau.

### 4.2 Sơ đồ phụ thuộc rút gọn

```
0 (RNG, store, persist)
└─ 1 (AI provider, preset)
   └─ 2 (MVU + Zod)          ← xương sống, mọi slice sau đăng ký qua đây
      └─ 3 (EJS, prompt)     ← turn loop chạy thông ở đây
         └─ 4 (lorebook, tri thức)
            └─ 5 (kiểm định) ← registry modifier, MỌI phần sau cắm vào
               ├─ 6 (nhân vật) → 7 (cơ thể) → 8 (kỹ năng)
               │                 └─ 16 (trang bị) sửa ngược 7 và 9
               ├─ 9 (đấu) → 10 (dã chiến) → 11 (công thành)
               └─ 12 (thành trì) ⟷ 13 (lãnh thổ)  ← đọc Phụ lục A trước
                  └─ 14 (quốc gia) → 15 (mô phỏng ngầm)
```

### 4.3 Những chỗ phải sửa ngược
Một số phần sau bắt buộc phải quay lại sửa phần trước. Đây là cố ý, không phải
thiếu sót thiết kế:

| Phần | Sửa ngược cái gì |
|---|---|
| 12 | Nhóm công trình phòng thủ đổ vào `Fortification` của Phần 11 |
| 13 | Giấy phép xây nối vào Phần 12; số ngày quân dịch nối vào Phần 11 |
| 14 | `races.json`, `units.json`, `titles.json`, `regions.json` |
| 14b | Thêm chủng tộc Huyết Tộc; luật chiến trận ban đêm vào Phần 10; quy tắc hồi phục đặc biệt vào Phần 7 |
| 16 | Logic gây thương tích của Phần 7 và Phần 9 phải đi qua bản đồ che phủ giáp |

---

## 5. BẢNG TRA NHANH — HỆ THỐNG NÀO Ở PHẦN NÀO

| Cần tìm | Ở đâu |
|---|---|
| Seeded RNG, xúc sắc cơ bản | Phần 0 |
| Turn loop 10 bước | Phần 0 mục 6 |
| Ba tầng lưu trữ | Phần 0 mục 4 |
| Proxy, quét model, preset | Phần 1 |
| Cấu trúc preset SillyTavern | Phần 1 mục 6 |
| Quyền ghi biến (engine/ai/locked) | Phần 2 mục 3 |
| Hai cú pháp cập nhật biến | Phần 2 mục 4 |
| Vòng sửa lỗi patch | Phần 2 mục 6 |
| Biến phụ | Phần 2 mục 7 |
| 13 khối prompt mặc định | Phần 3 mục 4 |
| Macro, không gian nháp vs state | Phần 3 mục 7 |
| Ngân sách token | Phần 3 mục 9 |
| Cổng tri thức | Phần 4 mục 5 |
| Bốn hệ xúc sắc, 5 cấp kết quả | Phần 5 mục 2–4 |
| Registry modifier | Phần 5 mục 7 |
| Thang độ khó chuẩn hóa | Phần 5 mục 8 |
| 12 chỉ số | Phần 6 mục 1 · code: `src/systems/character/stats.ts` |
| 34 chủng tộc | Phần 6 mục 2 (sửa lại ở 14, 14b) · bản máy đọc: `data/races.json` |
| Đặc tính bẩm sinh | `data/traits.json` · nối registry ở `character/modifiers.ts` |
| Tôn giáo, văn hóa | `data/religions.json`, `data/cultures.json` (Phần 14 sửa `stance`) |
| Danh mục kỹ năng phẳng | Phần 6 mục 5 · `data/skills.json` (đồ thị nhánh ở Phần 8) |
| Xuất thân, point-buy | Phần 6 mục 3 · `data/origins.json` |
| Trang bị khởi đầu | `data/gear.json` — lớp khai báo, vật phẩm thật là Phần 16 |
| Khai báo thành trì / thái ấp lúc tạo | `data/starting-possessions.json` — hệ thật là Phần 12/13 |
| Gia tộc, quyền thừa kế, nối lorebook | `data/houses.json` — 130 nhà · `character/houses.ts` (hàng thừa kế thật là Phần 13) |
| Luồng tạo nhân vật 9 bước | Phần 6 mục 9 · `src/ui/character/` |
| 20 vùng cơ thể | Phần 7 mục 1 |
| Y học thế kỷ 14 | Phần 7 mục 6 |
| Tàn phế vĩnh viễn | Phần 7 mục 8 |
| Trần tự học, thầy dạy | Phần 8 mục 2, 8 · code: `src/systems/skills/caps.ts`, `teach.ts` |
| Bậc kỹ năng, điểm thực hành, tải học tập | `data/skill-progress.json` |
| Đồ thị nhánh, chiêu thức, bí truyền | `data/skill-nodes.json` · UI: `src/ui/skills/` |
| Nghịch cảnh mở nhánh | Phần 8 mục 7 · `prereq.bodyCondition` / `lockedBy` |
| Tuổi lúc tạo nhân vật đổi ra cái gì | Phần 6 mục 3 · `origins.json → pointBuy.ageBonus`, `races.json → ageTemplate` |
| Ma trận tương khắc đấu tay đôi | Phần 9 mục 5 · `data/duel-matrix.json` |
| Bảng hành động, thế trận, thể lực | Phần 9 mục 4, 6 · `data/duel-matrix.json` |
| Đấu trường, địa hình, 6 loại hình quyết đấu | Phần 9 mục 2, 9 · `data/arenas.json` |
| Tầm với vũ khí, khe hở giáp (bản tối giản) | `data/weapons.json`, `data/armor.json` — Phần 16 thay |
| CombatChronicle | Phần 9 mục 10 · `src/systems/combat/` (Phần 10, 11 dùng lại) |
| Sĩ khí, vỡ trận lan truyền | Phần 10 mục 8 · `src/minigames/battle/morale.ts` |
| Lưới co giãn, quy đổi mét sang ô | Phần 10 mục 2 · `battle/grid.ts` · `data/terrain.json → grid` |
| Binh chủng, khắc chế ba vế | Phần 10 mục 7 · `data/units.json` (Phần 14 sửa lại) |
| Năm đội hình | Phần 10 mục 6 · `data/formations.json` |
| Địa hình và thời tiết chiến trường | Phần 10 mục 9 · `data/terrain.json`, `data/weather.json` |
| Chiến trận ban đêm | Phần 10 mục 9b · `data/weather.json → timesOfDay` |
| Quyền chỉ huy theo tước vị | Phần 10 mục 3 · `data/units.json → command` (Phần 13 sửa lại) |
| Truy kích, tù binh, tiền chuộc | Phần 10 mục 12 · `battle/aftermath.ts` |
| Công sự nhiều lớp, lùi từng lớp | Phần 11 mục 2 · `src/systems/siege/fortification.ts` · `data/fortifications.json` |
| Vây hãm theo tuần: bệnh, hạn nghĩa vụ, đào ngũ | Phần 11 mục 3 · `siege/week.ts` |
| Hai bảng hành động riêng biệt | Phần 11 mục 3 · `minigames/siege-attack/actions.ts` và `siege-defense/actions.ts` |
| Máy công thành, đường hầm, phản đào hầm | `data/siege-engines.json` · `siege-defense/countermine.ts` |
| Sự kiện vây hãm | Phần 11 mục 4 · `data/siege-events.json` · `siege/events.ts` |
| Đàm phán, khế ước đầu hàng có điều kiện | Phần 11 mục 5 · `data/surrender-terms.json` · `siege/parley.ts` |
| Tổng công trên lưới có tầng, chốt thắt cổ chai | Phần 11 mục 6 · `minigames/siege-attack/assault.ts` |
| Cướp phá và hệ quả toàn cục | Phần 11 mục 7 · `siege/sack.ts` · state: `siege.reputation.tanBao` |
| 5 cấp khu định cư | Phần 12 mục 3 |
| Ranh giới thành trì / lãnh thổ | **Phụ lục A** và Phần 12 mục 1 |
| Thang tước vị, mỗi cấp mở gì | Phần 13 mục 2–4 · `data/titles.json` (9 thang, bảng `panels`) · `src/systems/titles/` |
| Chính danh, ba con đường lên tước | Phần 13 mục 5 · `titles/legitimacy.ts` · nguồn `titles.chinh-danh` miền `rule.*` |
| Chư hầu, nổi loạn | Phần 13 mục 7 · `src/systems/realm/vassals.ts` |
| Tỉnh, luật, thuế, dự án vùng | Phần 13 mục 6, 8 · `data/provinces.json`, `data/laws.json` · `src/systems/realm/` |
| Triều đình, ăn chặn, làm hỏng việc | Phần 13 mục 8 · `realm/court.ts` · `titles.json → court` |
| Xử án, quyết đấu tư pháp → Phần 9 | Phần 13 mục 8 · `realm/justice.ts` |
| Cấp giấy phép xây → Phần 12 | Phần 13 mục 8 · `realm/permits.ts` (trả `RealmOrder`) |
| Hạn quân dịch của đạo quân → Phần 11 | Phần 13 mục 7 · `realm/levy.ts → callHost` |
| Thừa kế, chơi tiếp bằng người thừa kế | Phần 13 mục 9 · `data/succession.json` · `titles/succession.ts` |
| Tám thế lực + minigame | Phần 14 |
| 18 quân đoàn Orc | Phần 14 mục 4 |
| Chủng tộc xen kẽ | Phần 14 mục 3 |
| Huyết Tộc | Phần 14b mục D |
| Mô phỏng ngầm, ba tầng NPC | Phần 15 mục 2 · `src/sim/agents.ts`, `decide.ts`, `batch.ts` |
| Tin tức lan truyền và sai lệch | Phần 15 mục 6 · `src/sim/news.ts` · bản đồ `data/world-map.json` |
| **Chiến đồ** — bản đồ chinh phục ba tầng | `src/systems/campaign/` · `data/campaign-map.json` (sinh bởi `tools/tao-chien-do.mjs`) · UI `src/ui/campaign/` |
| Chiếm vùng, chiếm nước, khuất phục chư hầu | `campaign/conquest.ts` — hạ hết thành trì + thị trấn, HOẶC chủ của nó quy phục |
| Hành quân không dịch chuyển, vây thành trên bản đồ | `campaign/march.ts` · nhịp ở `campaign/tick.ts` (gắn vào `sim/worldtick.ts`) |
| Hai nhịp tick, trần chi phí | Phần 15 mục 4, 5 · `sim/fasttick.ts`, `deeptick.ts`, `cost.ts` |
| Hai luồng hiển thị, chồng thẻ | Phần 15 mục 7 · `sim/events.ts` · UI `src/ui/world/` |
| Kiểm bất biến, trần biến động | Phần 15 mục 9 · `sim/invariants.ts` |
| Bản đồ che phủ giáp, khe hở | Phần 16 mục 3–4 |
| Vừa người (custom fit) | Phần 16 mục 8 |

---

## 6. TỪ VỰNG BẮT BUỘC

### 6.1 Ba khái niệm không được lẫn

| Từ | Là gì | Động từ đi kèm |
|---|---|---|
| **THÀNH TRÌ** | Một ĐIỂM, đi bộ hết trong một ngày. Có tường, ô đất, công trình, kho. | xây, dựng, sửa, đặt, tích trữ, đồn trú, vây hãm, coi sóc |
| **LÃNH THỔ** | Một VÙNG, cưỡi ngựa nhiều ngày. Gồm nhiều tỉnh, mỗi tỉnh chứa nhiều thành trì. | cai trị, ban luật, thu thuế, xử án, bổ nhiệm, sáp nhập |
| **THÁI ẤP** | Một TỜ GIẤY có ấn triện. Gói pháp lý: tước vị + quyền + nghĩa vụ. | phong, thụ phong, thừa kế, tước đoạt, tuyên thệ |

### 6.2 TỪ BỊ CẤM TUYỆT ĐỐI
**"LÃNH ĐỊA"** — cấm trong mọi prompt, mọi UI, mọi tên biến, mọi file data.
Tiếng Việt dùng từ này cho cả ba nghĩa trên nên nó là nguồn lẫn nặng nhất.
Cấm luôn: "đất đai của ngài", "vùng đất của ngài", "cơ ngơi".

Chi tiết đầy đủ ở **Phụ lục A**. Đọc nó trước khi làm Phần 12.

---

## 7. QUY ƯỚC DỮ LIỆU & THƯ MỤC

### 7.1 Tiền tố id bắt buộc
```
hold_*    thành trì          prov_*    tỉnh
realm_*   lãnh thổ           fief_*    thái ấp
npc_*     nhân vật           item_*    vật phẩm
unit_*    đơn vị quân        corps_*   quân đoàn (Orc)
```
Nhìn id là biết loại. Đây là lớp phòng thủ chống lẫn tầng ngay ở khâu dữ liệu.

CHIẾN ĐỒ dùng bộ tiền tố RIÊNG, và riêng là cố ý: nút của nó là một ô trên một
bản đồ khác, không phải một vùng của `regions.json` (nhiều nút không có vùng
tương ứng, và một vùng có thể không có nút nào). Trộn hai bộ id là mở đường cho
một hàm tra `hold_troyes` trong chiến đồ rồi im lặng trả về `null`.
```
qg_*      quốc gia (tầng 1)  vung_*    vùng lớn (tầng 2)
huyen_*   huyện (tầng 3)     phe_*     phe trên chiến đồ
army_*    đạo quân trên bản đồ
```
Nút nào có vùng thật thì mang thêm trường `regionId` trỏ ngược về
`regions.json` — trỏ, không chép.

### 7.2 Cấu trúc thư mục
```
/src
  /core        rng, dice, clock, eventbus, logger
  /state       schema (Zod), store, mvu, derived, migrate
  /persist     interface + 3 tầng lưu trữ
  /ai          provider, preset, pipeline, ejs, macros, parser
  /lore        lorebook, scanner, knowledge, triggers
  /sim         worldtick, agents, news, events, invariants  ← Phần 15, bước 8
  /systems     character/ body/ skills/ check/ combat/ siege/ titles/ holding/ realm/ items/
               encounter/  ← cửa từ truyện vào ba minigame (thẻ <RequestDuel/Battle/Siege>)
  /minigames   duel/ battle/ siege-attack/ siege-defense/
  /nations     tám thế lực, mỗi cái một thư mục
  /ui          panels/ popups/ bodymap/ duel/ settings/ shell/
  /systems/campaign  CHIẾN ĐỒ — bản đồ chinh phục ba tầng, tách hẳn khỏi bản đồ
                     đo đường đi của Phần 15 (xem README riêng trong thư mục)
/data          toàn bộ file JSON nội dung
/presets       preset tham số AI (định dạng SillyTavern)
/lorebooks     lorebook người dùng nạp vào
/prompts       15 file .ejs mặc định cho các khối prompt (14 khối của Phần 3 + khối trận đánh)
```

### 7.3 Quy ước code
- TypeScript strict. Không `any`, không `as` bừa.
- Mọi hàm tính toán game phải PURE: nhận state, trả state mới.
- Mỗi hệ thống có `README.md` riêng ghi rõ: ĐỌC biến nào, GHI biến nào.
- Comment tiếng Việt cho logic game, tiếng Anh cho hạ tầng.

---

## 8. BẢY CHỖ DỄ HỎNG NHẤT

Đây là danh sách rút ra khi rà lại toàn bộ thiết kế. Nếu chỉ có thời gian kiểm
tra kỹ bảy chỗ, kiểm tra bảy chỗ này.

1. **Ranh giới thành trì / lãnh thổ (Phần 12, 13, Phụ lục A).**
   Một khi hai tầng đã lẫn vào nhau thì gỡ ra cực tốn công. Cả hai phần đều có
   bài kiểm tra ranh giới bắt buộc ở cuối — đừng bỏ qua.

2. **Bốn khối prompt [LOCKED] (Phần 3 mục 4).**
   Thiếu khối 11 là AI bịa số (phá R1). Thiếu khối 13 là không parse được patch
   (phá Phần 2). Khi import preset SillyTavern, engine PHẢI tự chèn chúng vào.

3. **Compare-and-swap trong MVU (Phần 2 mục 4.3).**
   Đây là lá chắn chính chống việc AI dùng state cũ. Bỏ qua bước này là mất
   khả năng phát hiện AI đang bịa.

4. **Registry modifier (Phần 5 mục 7).**
   Nếu một phần nào đó tự tính modifier riêng thay vì đăng ký vào registry,
   người chơi sẽ không bao giờ hiểu vì sao mình thất bại. Mà game này không có
   reroll, nên minh bạch là bắt buộc.

5. **Bản đồ che phủ giáp (Phần 16 mục 3–4).**
   Nếu rút gọn thành một con số phòng thủ tổng thì mất hết chiều sâu và làm hỏng
   luôn cơ chế "đâm khe hở" của Phần 9.

6. **Vỡ trận lan truyền (Phần 10 mục 8).**
   Trận đánh phải kết thúc đột ngột chứ không phải gặm dần từng đơn vị. Nếu
   không làm đúng, cả Phần 10 sẽ sai về cảm giác.

7. **Chi phí mô phỏng ngầm (Phần 15 mục 5).**
   Ba tầng phân giải NPC và trần request mỗi tháng là bắt buộc. Không có chúng
   thì chơi một năm trong game có thể tốn hàng chục đô tiền proxy.

---

## 9. TRẠNG THÁI QUYẾT ĐỊNH

### 9.1 Đã chốt
Nền tảng web local React+TS+Vite · ba tầng lưu trữ (Tầng B dùng
`@sqlite.org/sqlite-wasm`, VFS `opfs-sahpool`, database sống trong một Worker vì
`createSyncAccessHandle` chỉ có ở Worker) · proxy hỗ trợ cả ba chuẩn
(OpenAI-compatible, Gemini native, Anthropic) · mật khẩu là mật khẩu proxy ·
world tick dùng model rẻ riêng · cú pháp MVU nhận cả hai kiểu · vòng sửa lỗi
hai tầng · prompt kéo thả · EJS + macro ST + hàm game · lorebook định dạng riêng
có trigger · bốn hệ xúc sắc phân miền cứng · 5 cấp kết quả · không có reroll ·
12 chỉ số 4/4/4 · xuất thân chỉ ảnh hưởng điểm khởi đầu · tuổi lúc tạo nhân vật
đổi ra điểm kỹ năng, chỉ số theo giai đoạn, và tốc độ học · 20 vùng cơ thể ·
có tàn phế vĩnh viễn · kỹ năng cần cả thực hành, điểm KN, và thầy · trần tự học
60 và mọi tàn phế vĩnh viễn đều mở ra một nhánh mới · đấu tay đôi
lưới nhỏ chọn chiêu đồng thời · chiến trận lưới co giãn, lượt theo khởi động ·
quyền chỉ huy theo tước vị · công thành hai giai đoạn · thành trì lưới ô tự do,
5 cấp · tám thế lực với minigame riêng · chủng tộc gán theo vai trò lịch sử ·
mô phỏng ngầm hai tầng nhịp · popup hiện hết có bộ lọc · script tavern_helper
không cần cách ly bảo mật.

### 9.2 Còn treo
- Lorebook thật của người chơi (Phần 4 đã có sẵn hàm chuyển đổi từ World Info của SillyTavern)
- Chủng tộc bổ sung ngoài 34 cái đang có trong `data/races.json` (thêm được mà
  không phải sửa code — Phần 6 mục 2 là ràng buộc cứng về chuyện này)
- Cân bằng số liệu — chỉ chốt được sau khi chạy các bài test của từng phần.
  Phần 6 đã chốt hai luật để có chỗ mà cân: tổng mod chỉ số của mọi tộc bằng 0,
  và mọi hiệu ứng khai theo thang d100 rồi tự quy đổi sang ba hệ còn lại.

---

## 10. CHECKLIST TIẾN ĐỘ

```
GIAI ĐOẠN A — HẠ TẦNG
[x] 00  Kiến trúc nền            → RNG chạy, store tối giản, UI shell
[x] 01  AI Core                  → gửi được "ping", quét được model cả 3 chuẩn
[x] 02  MVU + Zod                → lô 5 op có 1 op sai phải reject cả 5
[x] 03  EJS + Prompt Manager     → TURN LOOP CHẠY THÔNG (cột mốc lớn nhất)
[x] 04  Lorebook                 → entry vùng B không chèn khi đứng ở vùng A

GIAI ĐOẠN B — NHÂN VẬT
[x] 05  Kiểm định & xác suất     → Monte Carlo 100k lần, lệch < 1%
[x] 06  Tạo nhân vật             → 3 nhân vật khác tộc cho modifier khác nhau
[x] 07  Cơ thể & thương tích     → mô phỏng 30 lượt vết đâm không chữa
[x] 08  Kỹ năng & nhánh          → tự luyện chững ở 60 (lượt 153), có thầy thì đi tiếp

GIAI ĐOẠN C — CHIẾN ĐẤU
[x] 09  Đấu tay đôi              → giáp tấm thắng 72,5%; có nửa kiếm thì lật lại 87,5%
[x] 10  Dã chiến                 → vòng giáo thắng kỵ binh 100%; khối sâu chết vì tên gấp rưỡi tản mát; kỵ binh truy kích giết gấp đôi bộ binh
[x] 11  Công thành & thủ thành   → tổng công ngay: 8/8 bị đánh bật, mất 62% quân; vây 14 tuần thì thắng, 26% chết vì bệnh
[x] 16  Trang bị & vũ khí        → giáp tấm thắng trường kiếm 89%; đổi sang búa chiến thì lật lại 66,5% cho bên tấn công; Lùn không mặc được giáp Nhân tộc, Nhân tộc khác vóc dáng bị phạt −18 AGI; danh mục 1320/1355/1390 là 24/36/41 món, giáp tấm toàn thân chỉ có từ 1380 còn áo giáp mảnh và đại mũ trụ biến mất trước 1390

GIAI ĐOẠN D — THẾ GIỚI
[ ] PL-A Phụ lục phân biệt       → ĐỌC TRƯỚC KHI LÀM PHẦN 12
[x] 12  Thành trì                → Thôn lên Đại thành mất 84,1 năm; nút thắt là lương thực rồi việc làm
[x] 13  Lãnh thổ & tước vị       → vặn thuế kịch trần: lòng trung 60→33→8, cả 4 chư hầu phản ở năm thứ 2; giữ thuế thường lệ thì 5 năm không ai phản
[x] 14  Quốc gia & minigame      → 60 năm không người chơi: Orc 14→31 đất, Đông La Mã mất kinh đô năm 1460 sau khi thuê chính quân Orc (1451) và ký hợp nhất giáo hội (1457), Đế quốc rã năm 1464; cắt ngân sách Tân Binh Đoàn: lòng trung 42→17, binh biến năm thứ 2; truy bức Mộc Tộc ở Frank: 4,00%→2,74% dân, đóng góp 40→0, 30.324 người chạy sang Đế quốc
[ ] 14b Ba thế lực bổ sung       → Huyết Tộc, Anh quốc, Baltic
[x] 15  Mô phỏng ngầm            → 5 năm không người chơi: 1.226 biến cố, 0 lần vi phạm bất biến; tin từ Kazan tới Bồ Đào Nha mất 85 ngày qua sứ giả (còn 26% tin cậy) và 283 ngày qua tin đồn (5%), cả hai đều tới nơi với kết cục bị đảo ngược; 12 tháng mô phỏng tốn 14 request, 23.587 token vào và 3.929 ra — chừng 0,006 đô mỗi năm trong game
```
