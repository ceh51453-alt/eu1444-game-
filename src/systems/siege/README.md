# systems/siege

**Chủ sở hữu:** Phần 11
**Nhiệm vụ:** Công sự nhiều lớp, nhịp vây hãm theo TUẦN, đàm phán và khế ước đầu
hàng có điều kiện, cướp phá và TIẾNG TÀN BẠO, biên niên kiểu biên niên sử.

**Trạng thái:** xong.

## Vì sao lõi vây hãm nằm ở `/systems` chứ không nằm trong `minigames/`

Hai lý do, và cả hai đều là lời hẹn của tài liệu chứ không phải sở thích:

1. **Mục 2 nói `Fortification` được ĐIỀN từ nhóm công trình phòng thủ của Phần
   12.** Nghĩa là Phần 12 phải DỰNG được đối tượng ấy. Nếu kiểu của nó nằm trong
   `minigames/siege-attack/` thì hệ thành trì sẽ phải import từ một minigame —
   đúng cái mà `systems/combat/chronicle.ts` đã tránh cho Phần 9 và 10.
2. **Mục 10.4 đòi HAI BẢNG HÀNH ĐỘNG RIÊNG BIỆT.** Chúng nằm ở hai thư mục
   minigame và không import lẫn nhau. Muốn thế thì phải có một chỗ thứ ba giữ lõi
   — nếu lõi nằm ở một trong hai bên, bên kia sẽ phải import từ nó và hai bảng
   lại có đường tới nhau.

Hành động được TIÊM VÀO lõi qua `WeekPlan`, mang theo cả hàm giải quyết của nó
(`SiegeAction.apply`). Nhờ vậy `runWeek` không biết bảng hành động nào tồn tại.

## ĐỌC biến nào

| Đường dẫn state | Vì sao cần |
|---|---|
| `siege.reputation.tanBao` · `nhanTu` · `giaoHoi` | `createSiege` NẠP ba con số này vào cuộc vây hãm mới. Đây là chỗ mục 7 khép vòng: thành bị cướp phá tháng trước quyết định bàn đàm phán tháng này. |
| `character.skills.skill_hung-bien` · `skill_muu-do` | Nền của phép kiểm d100 ở bàn đàm phán (mục 5). Không có kỹ năng thì rơi về `baseWithoutSkill` của data. |
| `character.stats.*` · `body.*` · `skills.*` | CHỈ khi người chơi bấm "Tự mình lên tường" — lúc ấy `duel-link.ts` của `siege-attack` dựng hồ sơ đấu sĩ và giao sân cho Phần 9. Ngoài khoảnh khắc ấy, vây hãm KHÔNG đọc cơ thể: một đội đồn trú là hai trăm người. |
| `meta.rng.streams.siege` | Vị trí dòng xúc sắc riêng của công thành (R3). |
| `meta.turn` | Đóng dấu `Injury.inflictedTurn` cho vết thương nhận trên mặt tường. |

Công sự, quân đồn trú, máy công thành và đường hầm KHÔNG đọc từ state. Chúng sống
trong `SiegeState` và chết theo cuộc vây hãm, cho tới khi Phần 12 dựng thành trì
thật và Phần 13 dựng kho quân của lãnh thổ.

## GHI biến nào

Cuộc vây hãm KHÔNG tự ghi store. Nó tích `playerOps` và người gọi chốt một lần
qua MVU với actor `engine` — cùng luật với Phần 9 và 10, vì người gọi mới giữ
ngăn xếp undo và undo phải tua về TRƯỚC cả cuộc vây hãm.

| Đường dẫn state | Quyền ghi |
|---|---|
| `siege.reputation.tanBao` · `nhanTu` · `giaoHoi` | engine — qua `reputationOps`, sau khi vây hãm xong. **AI không ghi được**: nếu ghi được thì nó sẽ tự thưởng cho người chơi một tiếng nhân từ sau một đoạn văn cảm động, và cả mục 7 sụp trong một lượt. |
| `siege.holds` | engine — sổ những thành đã đổi chủ, Phần 15 đọc khi tính phản ứng của thành khác. |
| `body.injuries` · `body.nextInjuryNo` · `body.log` | engine — chỉ từ minigame quyết đấu khi người chơi tự lên tường (mục 6). |
| `skills.practicePoints.*` · `skills.practiceLog.*` · `skills.xp` | engine — qua `practiceOps` của Phần 9, cùng đường. |
| `meta.rng.streams.siege` | engine — vị trí xúc sắc sau cuộc vây hãm. |

Chiến lợi phẩm, tiền chuộc, tù binh, uy tín, thái ấp và lòng thù hằn của một vùng
nằm trong `TermsOutcome`/`SiegeSpoils` và CHƯA đi vào state: chủ sở hữu của chúng
là Phần 12 (kho thành trì), Phần 13 (uy tín, tước vị, thái ấp) và Phần 15 (phản
ứng của các vùng). Phần 11 tính ra con số và giao lại — cùng lằn ranh `Aftermath`
của Phần 10 đã giữ.

## Ràng buộc

- **R1.** Engine tung TRƯỚC, AI kể SAU. LLM được gọi ĐÚNG MỘT LẦN cho cả cuộc vây
  hãm, sau khi xong, để viết biên niên. Không một con số nào của hai mươi tuần do
  AI quyết.
- **R3.** Dòng xúc sắc riêng `SIEGE_STREAM`. Số lần tung thay đổi theo số tuần, số
  máy đang dựng, số đường hầm và số sự kiện rơi ra. Không dùng `Math.random()`.
- **R4.** Sự kiện khai một khoá hiệu ứng lạ thì `data.ts` NỔ LÚC NẠP, không im
  lặng bỏ qua. Lựa chọn không hợp lệ bị bỏ qua, `maxWeeks` là trần cứng để một
  cấu hình data hỏng không treo vòng lặp.
- **R5.** Bốn file data ngoài: `fortifications.json`, `siege-engines.json`,
  `siege-events.json`, `surrender-terms.json`. Không khuôn công sự, máy công
  thành, sự kiện hay điều khoản nào nằm trong code. Bậc độ khó của từng lớp tổng
  công khai bằng TÊN BẬC, không bằng số (Phần 5 mục 8).
- **Registry (README dự án mục 8.4).** Mười một nguồn đăng ký vào registry của
  Phần 5. MỘT NGOẠI LỆ CÓ CHỦ Ý, cùng loại với Phần 10: sức giữ của một lớp trong
  cuộc tổng công KHÔNG đi qua registry, vì ở hệ pool nó đặt SỐ HIT CẦN chứ không
  bớt viên xúc sắc. Bản chi tiết do `assaultBreakdown` in ra và UI hiện ngay cạnh
  cú tung.
- **Phần 12 sẽ đụng tới đây một lần nữa.** `Fortification` hiện dựng từ năm khuôn
  mẫu trong `fortifications.json`; khi Phần 12 xong thì nó phải dựng từ công trình
  thật của thành trì, và `buildFortification` đã nhận sẵn đúng hình dạng ấy.
- **Phần 13 sửa ngược số ngày quân dịch.** `service.defaultDays` là 40 theo thông
  lệ; thang tước vị thật của Phần 13 sẽ quyết định con số ấy theo từng bậc.
- **Phần 15 đọc `siege.reputation.tanBao`.** Đó là toàn bộ lý do slice này tồn
  tại: một quyết định chiến thuật phải để lại vết trên bản đồ chiến lược.
