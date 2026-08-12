# systems/character

**Chủ sở hữu:** Phần 6
**Nhiệm vụ:** Nhân vật: 12 chỉ số 4/4/4, chủng tộc, xuất thân, luồng tạo 9 bước.

**Trạng thái:** xong. Slice `character` thật đã thay slice tối giản của Phần 2 mục 10.8.

## File nào làm gì

| File | Việc |
|---|---|
| `stats.ts` | 12 chỉ số, và **bốn dòng quy đổi** sang các hệ của Phần 5 (mục 1) |
| `effects.ts` | **khuôn hiệu ứng dùng chung** cho đặc tính, tôn giáo, văn hóa, trang bị |
| `races.ts` | nạp `/data/races.json`: mod chỉ số, trần, giai đoạn tuổi, hệ số học, thái độ quốc gia |
| `traits.ts` | nạp `/data/traits.json`: đặc tính bẩm sinh |
| `beliefs.ts` | nạp `/data/religions.json` và `/data/cultures.json` |
| `houses.ts` | nạp `/data/houses.json`: gia tộc, yêu sách, **nối vào lorebook** |
| `skills.ts` | nạp `/data/skills.json`: danh mục phẳng, miền suy từ id |
| `origins.ts` | nạp `/data/origins.json`: 9 giai tầng, point-buy, vạch xuất phát |
| `gear.ts` | nạp `/data/gear.json`: trang bị, chất liệu, tay nghề, vùng che |
| `possessions.ts` | nạp `/data/starting-possessions.json`: từ vựng ba tầng sở hữu, sinh id |
| `slice.ts` | schema, quyền ghi, ràng buộc chéo, biến phụ |
| `generate.ts` | sinh tên / ngoại hình / gia tộc / bí mật bằng seeded RNG |
| `create.ts` | luồng 9 bước, point-buy, `buildInitialState`, lời mở đầu |
| `base.ts` | `CheckSpec.base` — **chỉ có điểm rèn luyện** |
| `modifiers.ts` | sáu nguồn cắm vào registry của Phần 5 |

## ĐỌC biến nào
| Đường dẫn state | Vì sao cần |
|---|---|
| `character.stats.*` | nguồn `character.chi-so` đổi chỉ số chính thành một dòng modifier |
| `character.identity.race` | nguồn `character.dac-tinh` tra đặc tính bẩm sinh; Phần 4 tra `audience` |
| `character.identity.cultureId` + `culturalFit` | nguồn `character.van-hoa` |
| `character.allegiance.religionId` + `piety` | nguồn `character.ton-giao` |
| `character.gear` | nguồn `character.trang-bi`, và biến phụ `trongLuongMang` |
| `character.identity.age` | biến phụ `tuoiHieuDung`, giai đoạn tuổi, và nguồn `character.tuoi-tac` |
| `character.skills.*.level` | `base.ts` dựng `CheckSpec.base` |
| `character.fiefs` | biến phụ `bacTuoc` |

## GHI biến nào
| Đường dẫn state | Quyền ghi |
|---|---|
| `identity.*` (gồm `race`, `birthDate`, `cultureId`, `finalized`) | `locked` |
| `stats.*`, `skills.*.level`, `resources.*`, `gear`, `property`, `possessions` | `engine` |
| `holdings`, `fiefs`, `realmRole` | `engine` — mất một thành trì là hệ quả cơ học của P11/12/13 |
| `allegiance.attitudes.*` | `engine` — con số vào phép kiểm ngoại giao, không phải lời kể |
| `appearance.scars.*` | `engine` — Phần 7 ghi khi thương tích liền lại |
| `appearance.*` còn lại | `locked` |
| `family.*` gốc | `locked`; `family.*.stats.*`, `.status`, `.alive`, `.age` là `engine` |
| `family.*.attitude`, `.goal`, `.note` | `ai` |
| `relations.*`, `secrets.*`, `allegiance.*` còn lại, `personality.*`, `flags`, `notes.*` | `ai` |

Biến phụ đăng ký ở đây: `combatPower`, `mauToiDa`, `sucNang`, `sucCho`, `tocDo`,
`tamNhin`, `tuoiHieuDung`, `trongLuongMang`, `bacTuoc`.

## Gia tộc — dây nối vào thế giới đã có

`data/houses.json` giữ **130 gia tộc** và là chỗ nhân vật người chơi hết là một
tờ giấy rời. Ba con trỏ, cả ba đều có bài test gác:

| Trường | Trỏ đi đâu |
|---|---|
| `head` | một entry `person` trong lorebook — văn xuôi ở đó, không chép lại |
| `realm` / `seat` / `province` / `group` | `regions.json` |
| `race` | `races.json` |

**Hai loại nhà, và cả hai đều hợp lệ.** 54 nhà có `head` trỏ vào một nhân vật
thật trong lorebook. 76 nhà còn lại là gia tộc lịch sử có thật năm 1444 mà
lorebook chưa viết tới — chúng để `head` rỗng và mang `headName` sinh từ kho tên
của chính chủng tộc mình. Bộ chọn đánh dấu ★ cho loại đầu, vì người chơi cần biết
mình sắp gắn vào ai. `houseHeadName()` che khác biệt đó đi cho mọi chỗ gọi.

Chủng tộc của nhà lịch sử được gán theo phân bố vùng trong `nations.json` — nhà
Hunyadi ở Hungary là Long Duệ, nhà Fugger ở Swabia là Gnome. Đó là chỗ "đổi thông
tin cho hợp lore" xảy ra.

`rivals`, `allies` và cặp `parent`/`cadets` LUÔN hai chiều, có bài test gác. Một
bên coi là thù mà bên kia không biết thì bảng chính trị của Phần 13/14 sẽ đọc ra
hai thế giới khác nhau tùy nó hỏi từ phía nào.

Bộ chọn ở `src/ui/character/HousePicker.tsx` có ô tìm bỏ dấu (khớp tên nhà, vùng,
chủng tộc, tên người đứng đầu) và xếp nhóm theo vùng. Một thẻ `<select>` phẳng
còn dùng được ở ba mươi dòng; ở một trăm ba mươi thì người chơi chỉ cuộn chứ
không chọn.

**YÊU SÁCH KHÁC SỞ HỮU.** `claims` là thứ ĐANG ĐÒI; `holdings` và `fiefs` là thứ
ĐANG GIỮ. Cả thế kỷ 15 nằm trong khoảng cách giữa hai vế, nên chúng là hai khóa
riêng và không bao giờ được gộp.

Yêu sách mọc ra từ cây gia tộc chứ không gõ tay: gán nhà cho mẹ là một gia tộc
đang cai trị thì `recomputeClaims` sinh ngay một yêu sách lên ngai đó, yếu hơn
một bậc so với yêu sách của chính mình. Đổi nhà của mẹ lần nữa thì yêu sách cũ
biến mất — tính lại từ đầu chứ không cộng dồn, nếu không bảng yêu sách sẽ lệch
với cây gia tộc và không ai biết bên nào đúng.

`lorePeople()` CHỈ trả về entry `public`. Lorebook chiến dịch có hẳn một tầng
`gated`/`secret` là mặt riêng của cùng những nhân vật đó; cho chọn tầng ấy lúc
tạo nhân vật là để người chơi đọc bí mật của cả thế giới trước khi ván bắt đầu —
đúng bệnh mà cổng tri thức của Phần 4 sinh ra để chữa.

## Ba tầng sở hữu — đừng bao giờ gộp lại

`holdings`, `fiefs` và `realmRole` là ba khóa RIÊNG, và đó là lớp phòng thủ đặt
ngay ở khâu khai báo (README dự án mục 6, Phụ lục A):

| Khóa | Là gì | Ai sở hữu hệ thật |
|---|---|---|
| `holdings` | THÀNH TRÌ — một ĐIỂM, có tường và ô đất | Phần 12 |
| `fiefs` | THÁI ẤP — một TỜ GIẤY có ấn triện | Phần 13 |
| `realmRole` | LÃNH THỔ — một VÙNG gồm nhiều tỉnh | Phần 13 |

Phần 6 chỉ KHAI BÁO. Ba phần kia đọc thẳng khai báo này và dựng hệ thật lên trên,
chứ không phải viết lại.

## Tuổi — một lựa chọn có giá, không phải một dòng chữ

Bước 2 cho chọn tuổi trong khoảng `creationAgeRange` (0.18–0.85 tuổi thọ của
tộc), rộng hơn hẳn `startAgeRange` — khoảng gợi ý mà con trỏ đứng lúc mở trình
tạo. Hai khoảng khác nhau vì hai việc khác nhau: một bên là "người ta thường bắt
đầu ở đâu", bên kia là "người chơi được đi tới đâu". Không có vế thứ hai thì
không ai dựng nổi một lão tướng, mà nửa số nhân vật thú vị của thế kỷ 15 đều đã
ngoài bốn mươi.

Tuổi kéo theo ba thứ, và cả ba đều hiện ngay tại chỗ chọn:

| Vế | Đi đường nào |
|---|---|
| Điểm kỹ năng khởi đầu | `ageSkillBonus` đọc `pointBuy.ageBonus`, cộng vào ngân sách bước 5 |
| Chỉ số | `ageTemplate.stages[].statShift` → nguồn `character.tuoi-tac` |
| Tốc độ học | Phần 8 mục 5 — người lớn tuổi học chậm hẳn lại |

Ba vế đó là một cái đánh đổi thật: một lão tướng vào ván với nhiều nghề hơn hẳn
nhưng gần như không học thêm được gì nữa; một thiếu niên vào ván tay trắng và có
cả một đời để tiến. Con số đọc theo **tuổi hiệu dụng**, nên một Cao Tiên 300 tuổi
và một Frank 35 tuổi nhận cùng một khoản — truyền tuổi thô vào đó là biến mọi tộc
trường thọ thành bậc thầy ngay từ bước tạo nhân vật.

**`statShift` KHÔNG ghi đè vào `character.stats`.** Nó là một nguồn modifier, vì
nhân vật già đi trong lúc chơi: ghi đè thì phải có ai đó nhớ trừ lại đúng khoản
cũ mỗi lần bước sang giai đoạn mới, và cái ngày người ta quên là ngày một nhân
vật mất 6 điểm Sức mạnh mà không ai lần ra được. Ở dạng nguồn thì con số LÀ hàm
của tuổi hiện tại, và người chơi đọc được một dòng "Lão niên · Sức mạnh −3" giữa
bảng điều chỉnh.

## Chỗ dễ hiểu sai nhất

**`CheckSpec.base` KHÔNG chứa chỉ số.** Nó chỉ có điểm rèn luyện. Chỉ số chính
đi vào qua nguồn `character.chi-so` thành một dòng riêng trong
`CheckResult.modifiers`, đặc tính chủng tộc qua `character.dac-tinh`, và Phần 16
sẽ thêm dòng trang bị. Cộng lại vẫn đúng công thức mục 1 —
`kỹ năng% = chỉ số × 3 + rèn luyện + trang bị` — nhưng bây giờ từng vế đọc được.
Game không có reroll, nên người chơi bắt buộc phải truy ra được vế nào đã hỏng
(README dự án mục 8.4).

Hệ quả: **đừng bao giờ** truyền `skillPercentOf()` vào `CheckSpec.base`. Làm thế
là cộng chỉ số hai lần.

## Ràng buộc
- Mọi thay đổi state đi qua MVU, không `set()` thẳng vào store (R2). Ngoại lệ
  duy nhất là `buildInitialState`: tạo nhân vật dựng STATE BAN ĐẦU chứ không
  phải sửa state đang chạy, nên nó đi cùng đường với `createInitialState` của
  Phần 0 — và vẫn qua Zod trước khi vào store.
- Mọi hàm tính toán phải thuần: nhận state, trả state mới (Phần 0 mục 7).
- Mọi modifier phải đăng ký vào registry của Phần 5, không tự tính riêng.
- Không viết cứng số lượng chủng tộc vào bất kỳ đâu (mục 2).

## Còn treo cho phần sau
- Phần 7 ghi vào `appearance.scars`, và dùng `musclePct` / `fatPct` để dựng bản đồ cơ thể.
- **Phần 8 ĐÃ XONG.** Nó dựng đồ thị nhánh lên trên danh mục phẳng ở `skills.ts`,
  và GHI vào `character.skills.*.level` bằng op `engine` — con số kỹ năng vẫn ở
  đây, slice `skills` không giữ bản sao. Nó cũng đọc `identity.age` cho hệ số học
  và `stats.*` cho trần kỹ năng. Bảng quy đổi `skillContribution` cho hệ d20 vẫn
  để ngỏ cho Phần 9 — chỉnh tại chỗ, không dựng bảng riêng.
- Phần 12 đọc `character.holdings` và dựng thành trì thật (ô đất, công trình, kho).
- Phần 13 đọc `character.claims` và dựng hàng thừa kế thật: ai đứng trước ai,
  chết thì ai lên, chư hầu có theo không. Phần 6 chỉ nói yêu sách nào có bao
  nhiêu sức nặng lúc ván bắt đầu.
- Phần 13 đọc `character.fiefs` và `realmRole`; sở hữu Uy tín thật —
  `resources.prestige` ở đây mới là vạch xuất phát. `data/titles.json` vẫn rỗng
  có chủ ý; thang tước trong `starting-possessions.json` chỉ là từ vựng để hỏi.
- Phần 14 sở hữu quan hệ giữa các tôn giáo và sửa lại `stance` trong
  `religions.json`; cũng sửa `allegiance.attitudes` theo diễn biến.
- Phần 16 thay `gear` bằng vật phẩm thật. Nguồn `character.trang-bi` biến mất
  lúc đó — nó đọc `skillBonus` phẳng, còn Phần 16 đọc bản đồ che phủ và khe hở.
  **Giáp trong `gear.json` cố ý KHÔNG có con số phòng thủ**; chỗ đó để trống
  cho Phần 16, không phải để Phần 6 đoán (README dự án mục 8.5).
