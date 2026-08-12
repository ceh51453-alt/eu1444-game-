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

- **R1.** AI không quyết một con số nào. Nó nói bốn thứ định tính — đánh với ai,
  mạnh cỡ nào (4 nấc), to cỡ nào (3 nấc), ở đâu vì cái gì — và engine đổi ra kỹ
  năng, trang bị, quân số, binh chủng, bậc công sự, mùa, địa hình.
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
