# minigames/duel

**Chủ sở hữu:** Phần 9
**Nhiệm vụ:** Quyết đấu — lưới nhỏ, chọn chiêu đồng thời, ma trận tương khắc,
thế trận và thể lực, quy tắc giáp, sáu loại hình với sáu cửa ra.

**Trạng thái:** xong. Định dạng biên niên (`CombatChronicle`) KHÔNG nằm ở đây —
nó ở `/src/systems/combat/`, vì Phần 10 và 11 dùng lại nguyên vẹn (mục 12.7).

## ĐỌC biến nào

| Đường dẫn state | Vì sao cần |
|---|---|
| `body.*` | Cơ thể người chơi lúc vào trận, và là chỗ mọi vết thương của họ đi về. Không có thanh máu riêng (mục 8). |
| `character.stats.*` | 12 chỉ số, cho `CheckSpec` và cho trần thể lực. |
| `character.skills.*.level` | Điểm rèn luyện — `CheckSpec.base` của mỗi đòn. |
| `character.gear` | Vũ khí, khiên, giáp đang mang. Tầm với và bản đồ che phủ suy từ đây. |
| `skills.unlockedNodes` | Chiêu thức `usableIn: 'duel'` mọc thành nút bấm (mục 4). |
| `skills.activeStance` | Thế đang bật của người chơi. |
| `meta.rng.streams.duel` | Vị trí dòng xúc sắc riêng của quyết đấu (R3). |
| `meta.turn` | Đóng dấu `Injury.inflictedTurn`. |

Đối thủ KHÔNG đọc từ state: Phần 7 chỉ mô hình hóa cơ thể người chơi và Phần 8
chỉ giữ node của người chơi. NPC mang `Fighter.body`, `Fighter.skills`,
`Fighter.nodes` riêng, sống theo trận đấu — cho tới khi Phần 15 dựng NPC ba tầng
phân giải.

## GHI biến nào

Trận đấu KHÔNG tự ghi store. Nó tích `DuelState.playerOps` và người gọi chốt một
lần qua MVU với actor `engine` — vì người gọi mới giữ ngăn xếp undo, và undo phải
tua về TRƯỚC cả trận chứ không phải về giữa hiệp thứ chín.

| Đường dẫn state | Quyền ghi |
|---|---|
| `body.injuries` · `body.nextInjuryNo` · `body.log` | engine — cùng ba op mà `inflictInjury` của Phần 7 sinh ra |
| `skills.activeStance.*` | engine — đổi thế giữa trận |
| `skills.practicePoints.*` · `skills.practiceLog.*` · `skills.xp` | engine — qua `practiceOps`, đi thẳng vào `practiceFromChecks` của Phần 8 |
| `meta.rng.streams.duel` | engine — vị trí xúc sắc sau trận |

## Ràng buộc

- **R1.** Engine tung TRƯỚC, AI kể SAU. LLM được gọi đúng một lần lúc vào trận để
  lấy doctrine (mục 1), tối đa hai lần nữa ở khúc ngoặt, và một lần sau trận để
  viết diễn biến từ biên niên. Không lần gọi nào quyết định một con số.
- **R3.** Dòng xúc sắc riêng `DUEL_STREAM`. Số lần tung thay đổi theo cách người
  chơi đánh; trên dòng `main` thì nó đẩy lệch mọi lượt sau. Không dùng
  `Math.random()` ở đâu cả.
- **R4.** Lựa chọn không hợp lệ rơi về `xoay-mat`, doctrine hỏng rơi về mặc định.
  Một trận đấu không được chết vì UI gửi lên một id cũ hay vì proxy trả rác.
- **Registry (README dự án mục 8.4).** Mười một nguồn của Phần 9 đăng ký vào
  registry của Phần 5 — thế trận, thể lực, tương khắc, hướng mặt, tầm với, địa
  hình, giáp, và phần chỉ số của miền `combat.*` mà Phần 6 cố ý để trống. Không
  có con số nào cộng thẳng vào cú tung mà không hiện thành một dòng đọc được.
- **Giáp (README dự án mục 8.5).** KHÔNG có một con số phòng thủ tổng. Giáp đổi
  LOẠI thương tích: chém vào giáp tấm không sinh vết nào, đâm phải nhắm khe hở,
  đập thì xuyên qua thành gãy xương. Rút chúng thành một con số là làm hỏng luôn
  cả nhánh nửa kiếm của Phần 8.
- **Phần 16 sẽ sửa ngược `data/weapons.json` và `data/armor.json`.** Hai file đó
  là bản TỐI GIẢN của giai đoạn này; bản đồ che phủ giáp thật, khe hở thật, độ
  bền và vừa người thuộc về Phần 16.
