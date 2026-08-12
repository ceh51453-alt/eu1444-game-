# systems/items

**Chủ sở hữu:** Phần 16
**Nhiệm vụ:** Bản đồ che phủ giáp trên 20 vùng của Phần 7, ba loại chống riêng
biệt, khe hở, vừa người, trọng lượng có phân bổ, hư hỏng cụ thể, chế tạo có bản
mẫu, ba mốc thời đại, huy hiệu, phù phép.

**Trạng thái:** xong.

## Vì sao KHÔNG có một con số phòng thủ tổng

README mục 8.5 xếp bản đồ che phủ là chỗ dễ hỏng thứ năm của cả dự án, và nói rõ
cách nó hỏng: rút giáp thành một con số thì mất hết chiều sâu và làm hỏng luôn cơ
chế "đâm khe hở" của Phần 9. Nên trong cả thư mục này không có trường nào tên là
`defence`, và ba trục `chem` · `dam` · `dap` đi riêng tới tận cùng — từ
`data/armor.json`, qua `buildCoverage`, tới `resolveArmor`, ra tới ba thanh của
UI mục 18.

Con số tổng DUY NHẤT là `CoverageMap.average`, và nó chỉ để HIỆN. Không phép kiểm
nào được đọc nó; làm thế là đi đường vòng về đúng cái con số bị cấm.

## Hai cửa vào của bản đồ che phủ

`buildCoverage` nhận `WornPiece[]` chứ không nhận `Item[]` hay `CarriedGear[]`,
vì nó phải chạy được ở ba chỗ có ba hình dạng dữ liệu khác nhau:

| Người gọi | Cửa đổi | Vì sao |
|---|---|---|
| màn trang bị, vòng lượt | `wornFromItems` | vật phẩm thật, có tình trạng và hư hỏng |
| Phần 9 (`duel/equipment.ts`) | `wornFromCarried` | đối thủ trong một trận đấu không có slice `items` |
| test | dựng tay | không phải dàn cả một ván chơi để đo một tấm giáp |

## ĐỌC biến nào

| Đường dẫn state | Vì sao cần |
|---|---|
| `items.owned` | Mọi món sở hữu — nguồn của bản đồ che phủ, tổng tải và tổng giá trị. |
| `equipment.worn` · `mainHand` · `offHand` | Món nào ĐANG trên người. Bản đồ dựng từ đúng danh sách này, không từ kho. |
| `equipment.belted` | Có đai và móc treo không — quyết định tải nằm trên vai hay trải đều (mục 9). |
| `items.patterns` | Bản mẫu xưởng đã học; `craftableInYear` tra nó trước khi tra năm. |
| `items.smiths` | Thợ rèn đi theo quân (mục 10). Phần 11 đọc qua `campaignWear`. |
| `character.identity.race` · `appearance.heightCm` · `weightKg` | Vóc dáng để chấm mức vừa người (mục 8, lấy từ Phần 6 mục 3). |
| `meta.turn` | Mốc thời gian của hư hỏng, và của lời nguyền chưa lộ (mục 14). |

KHÔNG đọc `body.*`. Giáp quyết định LOẠI thương tích nào có thể xảy ra; việc vết
ấy thành cái gì trên cơ thể là của Phần 7, và đường đi một chiều — `resolveArmor`
trả về một trần mức độ, Phần 7 mới là nơi dựng `Injury`.

## GHI biến nào

| Đường dẫn state | Quyền ghi |
|---|---|
| `items.owned` · `owned.*` | engine |
| `items.nextItemNo` · `patterns` · `smiths` | engine |
| `items.rumors` · `rumors.*` | **ai** |
| `equipment.*` | engine |

`rumors` là ô DUY NHẤT của Phần 16 mà AI ghi được (mục 17), và ranh giới ấy là
R1 viết thành hai dòng bảng quyền: AI kể rằng thanh kiếm bị nguyền,
`owned.*.enchantment` — nơi biết nó CÓ bị nguyền thật không — vẫn của engine.

## Biến phụ đã đăng ký

| Id | Slice | Nội dung |
|---|---|---|
| `banDoCheChan` | equipment | che phủ và ba trục chống của đủ 20 vùng |
| `kheHoDangCo` | equipment | vùng chưa kín, kèm tên khe hở |
| `tongTrongLuong` | equipment | tổng tải, tính cả món không phải giáp |
| `phatMetMoi` | equipment | thể lực mất thêm mỗi hiệp vì tải và phân bổ |
| `tongGiaTriTrangBi` | items | trị giá bộ đang mặc — Phần 10 đọc khi tính tiền chuộc |
| `tongGiaTriKho` | items | trị giá cả kho |

## Bốn nguồn modifier

`items.trang-bi` (tay nghề món đang cầm) · `items.vua-nguoi` (phạt vừa người) ·
`items.trong-luong` (tải và phân bổ) · `items.phu-phep`. Đăng ký bằng
`registerItemSources()` ở `main.tsx`, sau Phần 8 và trước ba bộ minigame.

`items.trong-luong` KHÔNG phạt vào `combat.*`, và đó là cố ý: trong một trận đấu,
tải hiện ra qua THỂ LỰC mỗi hiệp chứ không qua cú tung. Phạt cả hai chỗ là phạt
hai lần một chuyện, và người mặc giáp tấm sẽ vừa mệt nhanh vừa đánh trượt — mà
lịch sử nói ngược lại: họ đánh rất tốt, chỉ không đánh được lâu.

## Nối ra ngoài

| Phần | Cửa | Nội dung |
|---|---|---|
| 6 | `seedInto` | trang bị khai báo → vật phẩm thật, chạy một lần lúc chốt nhân vật |
| 7 | `HitOptions.coverage` | bảng số thuần; Phần 7 KHÔNG import gì từ đây |
| 9 | `duel/equipment.ts`, `duel/armor.ts` | `Loadout` giữ nguyên hình dạng, ruột thay bằng bản đồ che phủ |
| 10 | `captureFate` | huy hiệu → bị bắt sống, bị giết ngay, hay thoát |
| 11 | `campaignWear` → `siege/week.ts → gearTick` | rã trang bị khi không có thợ rèn |
| 12 | `holding/interfaces.ts → workshopOf` | thành trì → xưởng, cho chế tạo |
| 14b | `Injury.silver` + `injuries.json → silver` | vết bạc không tự lành cho Huyết Tộc |

## Ràng buộc

- Mọi thay đổi state đi qua MVU, không `set()` thẳng vào store (R2). Ngoại lệ duy
  nhất: `seedInto` chạy trên một state đang được nặn ra, trước khi có ván chơi.
- Mọi hàm tính toán thuần: nhận state, trả state mới (Phần 0 mục 7).
- Mọi modifier đăng ký vào registry Phần 5, không tự tính riêng (mục 1d).
- Ba trục không bao giờ được cộng lại ở bất cứ đâu (mục 3, README mục 8.5).
