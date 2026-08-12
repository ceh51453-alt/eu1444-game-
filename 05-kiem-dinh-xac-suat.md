# PHẦN 5 — KIỂM ĐỊNH & XÁC SUẤT
*Tiền đề: Phần 0–4 xong. Đây là bước 2 của turn loop, nơi engine quyết định
mọi thứ TRƯỚC khi AI được nói một chữ nào.*

### 1. Mục tiêu
Bốn hệ xúc sắc, mỗi hệ một miền riêng, nhưng cùng trả về MỘT kiểu kết quả duy
nhất với 5 cấp. Phần còn lại của game không cần biết hệ nào đã chạy.

### 2. PHÂN MIỀN CỨNG — không được dùng lẫn
Rủi ro của việc dùng bốn hệ là người chơi mất khả năng ước lượng cơ hội.
Cách trị: mỗi miền dùng một hệ cố định, và UI luôn hiện tên hệ đang dùng.

| Hệ | Miền | Lý do |
|---|---|---|
| **d100 roll-under** | KỸ NĂNG CÁ NHÂN — kiếm thuật, cung, cưỡi ngựa, đàm phán, y thuật, trộm cắp, học vấn, rèn đúc, thẩm vấn, do thám | kỹ năng là số phần trăm, đọc là hiểu ngay cơ hội |
| **d20 + chỉ số vs DC** | ĐỐI KHÁNG NHANH, PHẢN XẠ — từng đòn trong PvP, né tránh, chặn đòn, giằng co, rượt đuổi | biến thiên cao, mỗi đòn đều có thể lật |
| **3d6 roll-under** | NĂNG LỰC DÀI HẠN — quản trị, xây dựng, kinh tế, hậu cần, mưu kế triều đình, điều trị dài ngày, thẩm định luật | đường cong chuông; ở những việc này may rủi KHÔNG được lấn át năng lực |
| **Dice pool (d6)** | QUY MÔ LỚN — đụng độ giữa các đơn vị quân, đợt xung phong, bắn loạt, công phá tường | số quân = số xúc sắc, tự nhiên mô hình hóa quy mô |

**Quy tắc bất di dịch:** một hành động chỉ dùng ĐÚNG MỘT hệ. Nếu thấy một việc
có vẻ thuộc hai miền thì tách nó thành hai kiểm định nối tiếp, không trộn.

### 3. KIỂU KẾT QUẢ THỐNG NHẤT
```ts
type CheckTier = 'critFail'|'fail'|'costlySuccess'|'success'|'critSuccess';

type CheckResult = {
  id: string;
  system: 'd100'|'d20'|'3d6'|'pool';
  domain: string;                    // 'skill.sword', 'admin.build'...
  tier: CheckTier;
  raw: number[];                     // xúc sắc thô đã tung
  target?: number; dc?: number;
  margin: number;                    // dương = thừa, âm = thiếu
  modifiers: { label: string; value: number; source: string }[];  // BẮT BUỘC
  seedUsed: string;
  narrativeHint: string;             // câu ngắn cho AI, xem mục 10
};
```
`modifiers` phải liệt kê ĐỦ, mỗi dòng có nhãn tiếng Việt đọc được. Không có điểm
vận mệnh nghĩa là người chơi phải hiểu vì sao mình hỏng — nếu không sẽ cảm thấy
game ăn gian.

### 4. NGƯỠNG 5 CẤP CHO TỪNG HỆ

**d100 roll-under**, T = kỹ năng sau modifier:
```
roll = 01                       → critSuccess (luôn luôn)
roll = 100                      → critFail    (luôn luôn)
roll ≤ max(1, floor(T/10))      → critSuccess
roll ≤ T                        → success
T < roll ≤ T+10                 → costlySuccess   (trầy trật vượt qua)
roll ≥ 96 và roll > T           → critFail
còn lại                         → fail
```

**d20 + mod vs DC**, margin = (roll+mod) − DC:
```
natural 20 → nâng kết quả lên một bậc
natural 1  → hạ kết quả xuống một bậc
margin ≥ +10   → critSuccess
margin ≥ 0     → success
margin ≥ -3    → costlySuccess
margin ≥ -10   → fail
margin < -10   → critFail
```

**3d6 roll-under**, T = chỉ số + cấp kỹ năng:
```
roll ≤ 4        → critSuccess (luôn luôn)
roll ≥ 17       → critFail    (luôn luôn)
roll ≤ T-5      → critSuccess
roll ≤ T        → success
roll = T+1, T+2 → costlySuccess
còn lại         → fail
```

**Dice pool:** N viên d6, mặt 5–6 tính là một thành công. R = số thành công cần:
```
số mặt 1 nhiều hơn số thành công → critFail (vỡ trận)
S ≥ R+3   → critSuccess
S ≥ R     → success
S = R-1   → costlySuccess
còn lại   → fail
N tính từ quy mô đơn vị, có trần (mặc định 20 viên) để không tràn.
```

### 5. NĂM CẤP NGHĨA LÀ GÌ VỀ CƠ HỌC
Bắt buộc mọi hệ thống sau đều tuân định nghĩa này:

| Cấp | Nghĩa |
|---|---|
| `critFail` | thất bại VÀ sinh ra một biến cố mới xấu hơn tình trạng ban đầu |
| `fail` | không đạt, mất chi phí đã bỏ ra, tình hình giữ nguyên |
| `costlySuccess` | ĐẠT mục tiêu nhưng phải trả một giá cụ thể: thời gian, tiền, thương tích nhẹ, mất uy tín, lộ bí mật, tiêu hao vật tư. **Engine PHẢI tự chọn cái giá đó và ghi vào CheckResult**, không để AI tự bịa ra giá. |
| `success` | đạt đúng mục tiêu |
| `critSuccess` | đạt VÀ có thêm lợi ích cụ thể |

Vì không có reroll, ràng buộc thêm: **critFail KHÔNG BAO GIỜ được gây chết ngay
hoặc mất trắng thành trì.** Nó chỉ được leo thang tình huống. Cái chết phải đến
qua chuỗi nhiều biến cố, để người chơi luôn thấy mình còn cửa xoay xở.

### 6. CHỐNG SAVE-SCUM
Undo ở Phần 2 khôi phục cả `rngState`, nên làm lại cùng một hành động sẽ ra đúng
con xúc sắc cũ. Đây là chủ ý, không phải lỗi. Muốn đổi kết quả thì phải đổi hành
động. Ghi rõ điều này ở màn hình đầu game.

### 7. REGISTRY MODIFIER — mọi module sau cắm vào đây
```ts
registerModifierSource({
  id: 'body.injuries',
  domains: ['skill.*', 'combat.*'],       // áp cho miền nào
  compute: (ctx) => Modifier[] | null
});

Modifier = { label: string; value: number;
             kind:'flat'|'dc'|'pool'|'dieShift'; source: string }
```
Các nguồn sẽ đăng ký ở những Phần sau: thương tích (P7), kỹ năng và nhánh (P8),
trang bị (P16), địa hình, thời tiết, sĩ khí, mệt mỏi, đói khát, tước vị, uy tín,
quan hệ NPC, phép thuật, chúc phúc tôn giáo.
Giai đoạn này chỉ dựng registry + 2 nguồn giả để test.

Thứ tự cộng: flat cộng dồn → nhân → clamp. Trần và sàn cấu hình được
(mặc định d100 kẹp trong 5–95, luôn còn cửa thắng và cửa thua).

### 8. THANG ĐỘ KHÓ CHUẨN HÓA
Một thang duy nhất, tự quy đổi sang từng hệ:

| Bậc | d100 mod | d20 DC | 3d6 mod | pool cần |
|---|---|---|---|---|
| Dễ dàng | +40 | 8 | +4 | 1 |
| Thường | 0 | 12 | 0 | 2 |
| Khó | −20 | 16 | −4 | 3 |
| Rất khó | −40 | 20 | −8 | 4 |
| Cực khó | −60 | 25 | −12 | 6 |
| Gần bất khả | −80 | 30 | −16 | 8 |

Code chỉ được nhận vào TÊN BẬC, không nhận số thô, để cân bằng còn sửa được ở
một chỗ duy nhất.

### 9. KIỂM ĐỊNH ĐỐI KHÁNG
- Hai bên cùng tung TRONG CÙNG MỘT HỆ.
- So `margin`. Chênh lệch quy ra tier theo cùng bảng ở mục 4.
- Hòa → bên phòng thủ thắng, tier = `costlySuccess` cho bên đó.
- Trong PvP và chiến trận sẽ dùng liên tục, nên hàm này phải rẻ và pure.

### 10. ĐƯA VÀO PROMPT
Kết quả `CheckResult` đổ vào khối 11 `[LOCKED]` của Phần 3. Định dạng phải cực
kỳ rõ ràng và mang giọng mệnh lệnh, ví dụ:

```
KẾT QUẢ ĐÃ ĐƯỢC QUYẾT ĐỊNH — BẮT BUỘC TUÂN THEO
Hành động: thuyết phục Bá tước Reinhard cho mượn quân
Hệ: d100 roll-under | Kỹ năng đàm phán 55 | Điều chỉnh: -20 (Khó),
    -10 (vết thương ở vai), +15 (ông ta đang nợ anh)
Mục tiêu 40, tung được 44 → THÀNH CÔNG CÓ GIÁ
Cái giá engine đã định: ông ta đồng ý nhưng đòi quyền thu thuế
    làng Ehrenfeld trong hai năm.
Anh hãy viết cảnh này. KHÔNG được để ông ta từ chối.
KHÔNG được bỏ qua cái giá.
```
`narrativeHint` chính là hai dòng cuối. Engine sinh ra, AI không được sửa.

### 11. LOG & THỐNG KÊ
- Mọi `CheckResult` ghi vào Tầng B.
- Tab Debug thêm mục "Thống kê xúc sắc": phân phối kết quả theo hệ, tỷ lệ từng tier, biểu đồ cột. Dùng để kiểm tra RNG không lệch và để cân bằng.
- Panel "Chi tiết lần tung gần nhất": hiện đủ `modifiers` từng dòng.

### 12. VIỆC CẦN LÀM TRONG PROMPT NÀY
1. `/src/systems/check/` — bốn hệ, ngưỡng 5 cấp, kiểu `CheckResult`.
2. Registry modifier + thứ tự cộng + clamp.
3. Thang độ khó chuẩn hóa.
4. Kiểm định đối kháng.
5. Bộ sinh "cái giá" cho `costlySuccess`: bảng giá theo miền, chọn bằng seeded RNG.
6. Nối vào bước 2 turn loop và khối 11 của Phần 3.
7. Panel chi tiết + thống kê xúc sắc.
8. **Test Monte Carlo:** chạy 100.000 lần mỗi hệ, in ra bảng tỷ lệ 5 cấp, đối chiếu với kỳ vọng lý thuyết. Lệch quá 1% là có bug.

**KHÔNG làm:** chỉ số nhân vật thật, kỹ năng thật, thương tích. Giai đoạn này
dùng số giả để test.

### 13. Sau khi xong
Đưa ra bảng Monte Carlo của cả bốn hệ. Cần nhìn tỷ lệ đại thất bại và thành công
có giá trước khi cắm chỉ số thật vào.
