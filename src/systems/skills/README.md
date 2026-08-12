# systems/skills

**Chủ sở hữu:** Phần 8
**Nhiệm vụ:** Kỹ năng và nhánh: trần tự học, điểm kinh nghiệm, thầy dạy, nghịch cảnh mở nhánh.

**Trạng thái:** xong.

## File nào làm gì

| File | Việc |
|---|---|
| `catalog.ts` | nạp `/data/skill-progress.json`: 7 bậc, điểm thực hành, tải học tập, tuổi, thầy, đột phá |
| `nodes.ts` | nạp `/data/skill-nodes.json`: đồ thị nhánh, **nở xương sống từ `templates`** cho mọi kỹ năng |
| `slice.ts` | schema, quyền ghi, ràng buộc chéo, 4 biến phụ |
| `load.ts` | tải học tập → hệ số chậm, và ba chỗ nó áp vào |
| `caps.ts` | **trần hiện tại KÈM LÝ DO** — thứ mục 11 hiện cạnh mỗi dòng kỹ năng |
| `progress.ts` | điểm thực hành, chống cày, ngưỡng lũy tiến, điểm KN |
| `unlock.ts` | trạng thái node, mở node, bật thế, cấp sự kiện đột phá |
| `teach.ts` | thầy dạy: điều kiện, thời gian, giá, nghĩa vụ ghi vào state |
| `modifiers.ts` | **ba nguồn** cắm vào registry của Phần 5 |
| `turn.ts` | bước 2 của vòng lượt — `ai/pipeline.ts` gọi |

UI ở `/src/ui/skills/`: `SkillsScreen.tsx` (tab Kỹ năng) và `SkillGraph.tsx` (đồ thị kéo thả).

## ĐỌC biến nào

| Đường dẫn state | Vì sao cần |
|---|---|
| `character.skills.*.level` | **con số kỹ năng sống ở đó**, không ở slice này |
| `character.stats.*` | trần theo chỉ số chính (mục 2) và tiên quyết `stats` của node |
| `character.identity.age` + `.race` | hệ số tuổi và hệ số chủng tộc của mục 5 |
| `character.resources.coins` | học phí khi giá của thầy là tiền |
| `body.permanent` | `bodyCondition` và `lockedBy` — nghịch cảnh mở nhánh (mục 7) |
| `knowledge.known` | cổng tri thức của node `secret` (mục 6, nối Phần 4) |
| `meta.turn`, `meta.gameDate` | cửa sổ chống cày, hạn khóa học, hạn nghĩa vụ |

## GHI biến nào

| Đường dẫn state | Quyền ghi |
|---|---|
| `skills.practicePoints.*`, `practiceLog.*`, `xp`, `xpEarned` | `engine` |
| `skills.unlockedNodes`, `breakthroughs.*`, `obligations`, `study` | `engine` |
| `skills.activeStance.*` | `engine` — **người chơi bấm, không phải AI** (mục 10) |
| `skills.teachers.*` | `engine`, TRỪ `.attitude` và `.note` là `ai` |
| `skills.learningGoals`, `skills.notes` | `ai` |
| `character.skills.*.level` | `engine` — Phần 6 khai sẵn quyền này (xem dưới) |

Biến phụ đăng ký ở đây: `taiHocTap`, `heSoCham`, `soNodeDaMo`, `nghiaVuChuaTra`.

Nguồn modifier đăng ký ở đây: `skills.nhanh`, `skills.the`, `skills.hoc-tap`.

## Chỗ lệch DUY NHẤT so với bảng của mục 10

Mục 10 xếp `levels.*` vào slice này. Nó **không** ở đây, và đó là cố ý.

Con số kỹ năng đã sống ở `character.skills.*.level` từ Phần 6: `base.ts` đọc nó để
dựng `CheckSpec.base`, prompt hồ sơ nhân vật in nó ra, bước 5 của luồng tạo nhân
vật ghi vào nó, và bảng biến của tab Cài đặt hiện nó. Chép thêm một bản sang
`skills.levels` là dựng sẵn HAI sự thật cho cùng một con số, và cái ngày chúng
lệch nhau thì không ai biết bên nào đúng — đúng thứ Phần 2 mục 7 cấm.

Phần 8 GHI vào ô đó bằng op `engine`, cùng một đường mà Phần 7 ghi sẹo sang
`character.appearance.scars`. Phần 6 đã khai sẵn quyền `engine` cho nhánh đó và
README của nó đã ghi "Phần 8 thay danh mục phẳng bằng cây kỹ năng".

## Ba chỗ dễ hiểu sai nhất

**1. Trần KHÔNG phải một con số, nó là một câu.** `capReport` trả về cả lý do, và
UI phải in lý do ra. Người chơi luyện kiếm hai trăm lượt rồi đứng yên ở 60 mà màn
hình không nói gì thì họ kết luận game hỏng — và họ có lý (README dự án mục 8.4).
Bốn vế cùng hạ trần: trần cứng 95, trần chỉ số, trần bậc tự học 60, và
`trình độ thầy − 15`. Vế cuối nằm THẲNG trong công thức chứ không chỉ chặn lúc
bắt đầu khóa học, nếu không UI sẽ hứa một cái trần mà người thầy hiện có không
bao giờ đưa tới.

**2. Chạm trần thì điểm thực hành NGỪNG TÍCH, không phải tích rồi giữ đó.** Tích
sẵn để một ngày thuê thầy rồi đổ ập xuống là biến mục 8 thành một thủ tục: người
chơi cày sẵn, thuê thầy một hôm, nhảy mười điểm. Cả cơ chế "đi tìm thầy" mất
nghĩa.

**3. Hệ số chậm áp lên TIẾN BỘ, không áp lên cú tung.** Ba chỗ, đúng như mục 5
liệt kê: ngưỡng điểm thực hành, giá điểm KN của node, thời gian học với thầy. Một
người ôm mười lăm kỹ năng không đánh kiếm tệ hơn — họ chỉ tiến bộ chậm hơn.

## Xương sống nở ra từ khuôn

`data/skill-nodes.json` viết đồ thị đầy đủ cho ba kỹ năng (Kiếm thuật, Cai trị,
Đàm phán) và mười ba nhánh nghịch cảnh. Bảy mươi ba kỹ năng còn lại nhận ba node
chung từ `templates`, nở ra lúc nạp: `Nền tảng`, `Thuần thục`, `Vượt ngưỡng`.

Nhờ vậy không kỹ năng nào có đồ thị rỗng, và **cửa lên bậc Tông sư có mặt ở mọi
kỹ năng** — thiếu nó thì kỹ năng nào chưa ai viết nhánh sẽ vĩnh viễn chạm trần ở
88 mà không ai hiểu vì sao. `$self` trong `domains` được thay bằng miền của chính
kỹ năng đang nở.

## Nghịch cảnh — quy tắc thiết kế bắt buộc

Mục 7: **MỌI tàn phế vĩnh viễn đều phải mở ra ít nhất một con đường mới.** Có bài
test gác luật này: nó quét toàn bộ bảng `permanent` của `data/injuries.json` và
đòi mỗi id xuất hiện trong `prereq.bodyCondition` của ít nhất một node. Thêm một
loại tàn phế mới mà quên viết nhánh cho nó thì test đỏ ngay.

`lockedBy` là chiều ngược lại: mù một mắt KHÓA nhánh bắn tầm xa, biến dạng mặt
KHÓA nhánh triều đình. Một con đường đóng lại và một con đường khác mở ra — đó
mới là nghịch cảnh, chứ không phải chỉ là một mức phạt.

## Ràng buộc
- Mọi thay đổi state đi qua MVU, không `set()` thẳng vào store (R2). Mọi hàm ở
  đây trả `PatchOp[]`; người gọi áp với actor `engine`.
- Mọi hàm tính toán phải thuần: nhận state, trả state mới (Phần 0 mục 7). Không
  hàm nào ở đây tung xúc sắc — điểm thực hành là hệ quả TẤT ĐỊNH của một cú tung
  đã xảy ra, nên nó không được làm xê dịch dòng RNG (R3).
- Mọi modifier phải đăng ký vào registry của Phần 5, không tự tính riêng.
- Con số cân bằng nằm trong `/data/*.json`, không nằm trong code (R5).

## Còn treo cho phần sau

- **Phần 9 và 10** đọc `mechanics` của node `technique`/`stance` để hiện thực
  chiêu thức thật, và gọi `grantBreakthrough` khi một hoàn cảnh cực hạn xảy ra
  (sống sót một trận thua, đấu với người mạnh hơn hẳn). Phần 8 dựng cửa, không tự
  bịa ra hoàn cảnh.
- **Phần 9** có quyền chỉnh bảng `skillContribution` cho hệ d20 — chỉnh TẠI CHỖ
  ở `character/stats.ts`, không dựng bảng riêng.
- **Phần 13** chốt nhịp thời gian thật; `studyDue` hiện đếm một lượt là một ngày
  ở mức thô nhất và sẽ đọc lại từ đó.
- **Phần 15** đọc `skills.obligations` để ĐÒI: một lời thề, một ân huệ, ba năm
  phục vụ đều có hạn chót trong state chứ không nằm trong một dòng ghi chú.
- **Phần 15** cũng là chỗ thầy tự tìm đến khi danh vọng đủ cao, và là chỗ tin đồn
  lorebook dẫn tới người giữ node `secret`.
- Sáu nguồn điểm KN của mục 4 mới có một nguồn tự động (`that-bai-tham`). Thắng
  trận là Phần 10, hoàn thành mục tiêu dài hạn là Phần 13, đọc sách quý là Phần
  4/15 — mỗi phần gọi `awardXp` với id nguồn của mình.
