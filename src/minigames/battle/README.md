# minigames/battle

**Chủ sở hữu:** Phần 10
**Nhiệm vụ:** Dã chiến — lưới co giãn, lượt theo điểm khởi động, sĩ khí, VỠ TRẬN
LAN TRUYỀN, quyền chỉ huy theo tước vị, chiến trận ban đêm, truy kích và tù binh.

**Trạng thái:** xong. Định dạng biên niên (`CombatChronicle`) KHÔNG nằm ở đây —
nó ở `/src/systems/combat/`, dựng ở Phần 9 và Phần 10 chỉ THÊM TRƯỜNG vào đó
(`ChronicleBattleRound`, `ChronicleForce`), đúng như README của thư mục ấy hẹn.

## ĐỌC biến nào

| Đường dẫn state | Vì sao cần |
|---|---|
| `character.stats.*` | Uy nghi (PRE) cho phép kiểm lệnh của mục 3; Hùng biện (ELO) cho bài diễn thuyết trước trận của mục 12. |
| `character.identity.name` | Tên người chơi trong biên niên và trong khung lệnh. |
| `character.gear` · `character.skills.*.level` · `skills.unlockedNodes` · `skills.activeStance` | CHỈ khi người chơi bấm "Tự mình xông lên" — lúc ấy `duel-link.ts` dựng hồ sơ đấu sĩ và giao sân cho Phần 9. |
| `body.*` | Cùng lý do: cơ thể người chơi lúc bước ra khỏi hàng. Ngoài khoảnh khắc ấy, dã chiến KHÔNG đọc cơ thể — một quân cờ là hai trăm người, không phải một người. |
| `meta.rng.streams.battle` | Vị trí dòng xúc sắc riêng của dã chiến (R3). |
| `meta.turn` | Đóng dấu `Injury.inflictedTurn` cho vết thương nhận trong lúc tự thân giao chiến. |

Đơn vị quân KHÔNG đọc từ state. Chúng sống trong `BattleState.units` và chết
theo trận đánh, cho tới khi Phần 12 và 13 dựng kho quân thật của thành trì và
lãnh thổ, và Phần 15 dựng NPC ba tầng phân giải.

## GHI biến nào

Trận đánh KHÔNG tự ghi store. Nó tích `BattleState.playerOps` và người gọi chốt
một lần qua MVU với actor `engine` — cùng luật với Phần 9, vì người gọi mới giữ
ngăn xếp undo và undo phải tua về TRƯỚC cả trận.

| Đường dẫn state | Quyền ghi |
|---|---|
| `body.injuries` · `body.nextInjuryNo` · `body.log` | engine — chỉ từ minigame quyết đấu khi người chơi tự thân lâm trận (mục 11) |
| `skills.practicePoints.*` · `skills.practiceLog.*` · `skills.xp` | engine — qua `practiceOps` của Phần 9, cùng đường |
| `meta.rng.streams.battle` | engine — vị trí xúc sắc sau trận |

Uy tín, tiền chuộc, chiến lợi phẩm và quan hệ với chủ soái nằm trong
`Aftermath` và CHƯA đi vào state: chủ sở hữu của chúng là Phần 13 (uy tín, thái
ấp) và Phần 12 (kho thành trì). Phần 10 tính ra con số và giao lại; nối chúng
vào state ở đây là lấn phạm vi, và phần sau sẽ phải đập đi làm lại.

## Ràng buộc

- **R1.** Engine tung TRƯỚC, AI kể SAU. LLM được gọi ĐÚNG MỘT LẦN cho cả trận,
  sau khi trận xong, để viết diễn biến từ biên niên (mục 13). Không có doctrine
  giữa trận như Phần 9: một trận bốn mươi vòng với ba mươi quân cờ mà hỏi LLM
  mỗi vòng là một hóa đơn không ai lường trước. Bộ chọn nước đi ở `tactics.ts`
  là một bộ luật ưu tiên đọc được, không phải một mô hình.
- **R3.** Dòng xúc sắc riêng `BATTLE_STREAM`. Số lần tung thay đổi theo số đơn
  vị còn sống, số vòng, số phản ứng cơ hội và số nhánh của đợt vỡ trận lan
  truyền. Không dùng `Math.random()` ở đâu cả.
- **R4.** Lựa chọn không hợp lệ bị bỏ qua, id lạ không làm chết vòng, và
  `MAX_ROUNDS` là trần cứng để một cấu hình data hỏng không treo vòng lặp.
- **R5.** Bốn file data ngoài: `units.json`, `formations.json`, `terrain.json`,
  `weather.json`. Không binh chủng, đội hình, địa hình hay thời tiết nào nằm
  trong code. Thang chỉ huy theo tước vị cũng ở data (`units.json → command`) vì
  Phần 13 sẽ viết lại thang tước vị thật.
- **Registry (README dự án mục 8.4).** Mười một nguồn của Phần 10 đăng ký vào
  registry của Phần 5. MỘT NGOẠI LỆ CÓ CHỦ Ý: điểm phòng thủ của bên bị đánh
  KHÔNG đi qua registry, vì ở hệ pool nó đặt SỐ HIT CẦN chứ không bớt viên xúc
  sắc của người tấn công. Bản chi tiết của nó do `defenceBreakdown` in ra và UI
  hiện ngay cạnh cú tung — nó phải đọc được, chỉ là không đọc được ở cột đó.
- **Vỡ trận lan truyền (README dự án mục 8.6).** Đây là cơ chế quan trọng nhất
  của cả phần. Ba chỗ giữ cho nó đúng nhịp, và cả ba đều đã trả giá một lần
  trong lúc dựng: ngưỡng kiểm định sĩ khí `6 + sĩ khí/10` (không phải `/6`), bán
  kính hoảng loạn kẹp ở hai ô, và trần đệ quy ba bậc. Bỏ bất kỳ cái nào thì cả
  đạo quân tan trong một vòng ở mức thương vong chín phần trăm, và mục 8 mất cái
  quãng ba vòng mà người chơi còn kịp làm một việc gì đó.
- **Phần 14 và 14b sửa ngược `data/units.json`.** Danh mục binh chủng hiện tại
  đã viết theo bản đồ tám thế lực của Phần 14 mục 2 và ba thế lực của Phần 14b,
  nhưng 18 quân đoàn Orc và bảng lương của chúng thuộc về Phần 14.
- **Phần 16 sẽ đụng tới đây một lần nữa** qua trang bị: giáp của một đơn vị hiện
  là một con số 0–5, và bản đồ che phủ thật của Phần 16 chỉ áp ở cấp cá nhân
  (mục 11), không áp cho cả một khối hai trăm người.
