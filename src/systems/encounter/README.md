# systems/encounter

**Chủ sở hữu:** cầu nối giữa Phần 3 (vòng lặp lượt) và Phần 9–11 (ba minigame).
**Nhiệm vụ:** cho phép người kể chuyện MỞ một trận đấu, một trận dã chiến hay
một cuộc vây hãm ngay giữa cảnh, và cho người chơi quyền bấm vào trận hoặc để
engine đánh thay.

**Vì sao nó tồn tại:** chú thích đầu `ui/duel/spar.ts`, `ui/battle/field.ts` và
`ui/siege/siege.ts` đều nói cùng một câu — "đây KHÔNG phải cách duy nhất một
trận nổ ra, phần lớn chúng đến từ truyện". Ba nút bấm tay ở bảng trạng thái là
ba cửa duy nhất mà Phần 9–11 tự mở được cho mình; những cửa còn lại (thách đấu,
phiên tòa, phục kích, quân dịch, nổi loạn, chiến tranh) thuộc Phần 13–15. Module
này mở một cửa CHUNG, tạm, đủ để truyện chạm được vào cơ học ngay từ bây giờ —
và nó dựng đúng theo khuôn `body.requestInjury` của Phần 7 mục 3 để hôm Phần 13
tới nơi thì chỉ phải đổi nguồn dữ liệu, không phải đổi kiến trúc.

**Vì sao nó không nằm trong `/src/ai`:** nó đọc `GameState` và sinh `PatchOp` —
đó là việc của một hệ thống, không phải của tầng gọi model. `/src/ai/pipeline.ts`
chỉ gọi vào đây đúng hai hàm (đọc thẻ, bóc thẻ), y như cách nó gọi Phần 7.

## ĐỌC biến nào

| Đường dẫn state | Vì sao cần |
|---|---|
| `character.identity.finalized` | cửa kiểm duyệt 1 — chưa chốt nhân vật thì không có ai để đánh |
| `character.identity.name` | tên trong biên niên và trong `witnesses` |
| `character.stats`, `character.gear`, `character.skills` | dựng người chơi thành `FighterSpec` |
| `skills.unlockedNodes`, `skills.activeStance` | node và thế của Phần 8 vào thẳng trận đấu |
| `body.dead` | cửa kiểm duyệt 2 |
| `meta.gameDate.month` | mùa của cuộc vây hãm — tháng Chạp phải là vây hãm mùa đông |
| `meta.seed`, `meta.rng` | người gọi khôi phục dòng xúc sắc riêng trước khi dựng |
| `meta.turn` | cửa "đã có diễn biến chưa" của `available.ts` |
| `military.forces[*].units[*].strength` | có đạo quân thật không, và bao nhiêu người |
| `campaign.armies`, `.sieges`, `.control`, `.playerFactionId` | có địch trước mặt không, đang vây ai, ai đang vây mình |
| `holdings.list[*].besieged` | thành trì của mình có đang bị vây không |

## BỐN CÁI NÚT — `available.ts`

`availableEncounters(state)` trả lời bốn câu hỏi, mỗi câu một `{ ok, reason }`:

| Nút | Mở khi |
|---|---|
| Đấu tập | ván đã chạy (`meta.turn > 0`) — sân tập là chỗ luôn có người |
| Ra trận | có đạo quân bộ còn quân sống **và** có địch đứng CÙNG Ô trên chiến đồ |
| Công thành | một đạo quân của người chơi đang vây một ô (`siegeNodeId !== ''`) |
| Thủ thành | một thành trì mang cờ `besieged`, hoặc một dấu vây của phe khác trên ô của mình |

Hai cửa kiểm duyệt của `screenEncounters` (chưa chốt nhân vật, nhân vật đã chết)
đứng trước cả bốn — **cùng một luật cho cả hai đường vào**, vì "truyện mở được
trận mà nút bấm thì không" là một mâu thuẫn không ai gỡ được từ phía người chơi.

**Vì sao có file này.** Bản trước cho cả bốn nút hiện ngay khi nhân vật vừa chốt,
và bấm cái nào cũng ra một trận — nhưng cái trận ấy phần lớn là BỊA:
`ui/battle/field.ts` từng có một hàm tên thẳng là `fallbackArmy` dựng 1.800 quân
từ hư không, còn `ui/siege/siege.ts` phát cho kẻ vây 2.000 người khi state trống.
Hai hệ quả: con số nói dối (người chơi thấy 1.800 quân trong khi `military` nói
không có ai, rồi `battleCampaignOps` ghi thương vong về một đạo quân không tồn
tại), và truyện nói dối (bấm "Công thành" giữa một cảnh uống rượu thì đột nhiên
có một cuộc vây hãm mà không dòng diễn biến nào dẫn tới).

Giờ **không có đường nào sinh ra một quân số không nằm trong state.** Thứ duy
nhất còn suy ra là TỈ LỆ binh chủng của quân AI (`standingOrderOfBattle`), và nó
suy ra vì chiến đồ thật sự không mô hình hoá tới từng đơn vị cho chúng — một lỗ
hổng của mô hình dữ liệu, khai rõ tại chỗ chứ không giấu.

`App.tsx` xét lại cửa một lần nữa lúc bấm chứ không tin cái nút: nút ẩn theo
state lúc render, còn tình hình đổi được giữa lúc render và lúc bấm.

## GHI biến nào

Không ghi trực tiếp. `autoResolve` TRẢ VỀ `PatchOp` cho người gọi chốt một lần
qua MVU với actor `engine` — cùng luật với ba màn hình minigame (R2), và vì cùng
một lý do: người gọi mới là chỗ giữ ngăn xếp undo.

| Đường dẫn state | Quyền ghi |
|---|---|
| `body.*` | engine — thương tích của trận, do minigame sinh ra |
| `skills.*` | engine — điểm thực hành (`practiceOps`) |
| `siege.*` | engine — tiếng tàn bạo / khoan dung (`reputationOps`) |
| `meta.rng.streams.{duel,battle,siege}` | engine — vị trí dòng xúc sắc sau trận |

## Ràng buộc

- **R1.** AI không được bịa con số. Nó nói đánh với ai, mạnh cỡ nào (4 nấc), to
  cỡ nào (3 nấc), ở đâu vì cái gì; nếu truyện đã xác lập quân số/tên lực lượng/
  hai chủ soái thì thẻ phải chép nguyên dữ kiện ấy. Engine dùng dữ kiện truyện
  trước, rồi mới đọc state hoặc ước lượng phần còn thiếu.
- **Tương quan là TƯƠNG ĐỐI với người chơi.** Một kẻ "ngang cơ" ở lượt 5 và ở
  lượt 300 là hai con người khác nhau. Không có bảng số tuyệt đối nào ở đây.
- **Chữ lạ thì hạ nấc, không lùi về nấc giữa.** Cùng luật với mức độ thương tích
  của Phần 7 mục 3: một chữ gõ sai không được phép mua thêm nguy hiểm cho người
  chơi. Thuộc tính VẮNG MẶT thì khác — nó rơi về nấc trung tính.
- **Nhiều nhất MỘT lời mời mỗi lượt.** Một lượt là một cảnh; hai trận trong một
  cảnh nghĩa là model đã kể lố sang cảnh sau.
- **R4.** Lời mời hỏng KHÔNG làm hỏng lượt. Thẻ sai cú pháp, id không có thật,
  nhân vật đã chết — tất cả đều thành một dòng từ chối có lý do, còn đoạn văn thì
  vẫn hiện ra và state vẫn nguyên.
- **Bỏ qua KHÔNG phải là "trận này không xảy ra".** Engine đánh trọn trận bằng
  đúng những hàm mà bài test của Phần 9–11 đã đo, rồi ghi hệ quả thật. Nếu bỏ qua
  mà rẻ hơn đánh thì cách chơi tốt nhất sẽ là không chơi.
- **R3.** Dựng và đánh thay đều chạy trên DÒNG XÚC SẮC RIÊNG của minigame ấy, và
  vị trí cuối được ghi lại vào save.

## Chỗ TẠM đã biết

- `titleId: 'hiep-si'` khi dựng dã chiến — thang tước vị thật thuộc Phần 13, y
  như chú thích đã có sẵn trong `ui/battle/field.ts`.
- Công sự dựng từ khuôn mẫu trong `data/fortifications.json`, không dựng từ thành
  trì thật của Phần 12.
- Đối thủ là NPC dựng tại chỗ, không nằm trong state — Phần 15 mới là chỗ NPC có
  đời sống riêng, và tới lúc đó `foeFighterSpec` phải đọc từ đó thay vì suy ra từ
  bốn nấc tương quan.
