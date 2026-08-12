# PHẦN 8 — KỸ NĂNG, RÈN LUYỆN, ĐỒ THỊ NHÁNH
*Tiền đề: Phần 0–7 xong. Slice mới: `skills`.*

### 1. BA NGUỒN TIẾN BỘ — mỗi nguồn một vai trò khác nhau
| Nguồn | Vai trò |
|---|---|
| **Thực hành** | tăng CON SỐ kỹ năng. Tự động, chậm, có trần. |
| **Điểm KN** | mở NHÁNH. Người chơi tự tiêu, không tự động. |
| **Thầy dạy** | PHÁ TRẦN. Không có thầy thì mãi mãi dừng ở ngưỡng. |

Ba thứ này không thay thế nhau. Thiếu bất kỳ cái nào cũng bị kẹt.

### 2. BẬC KỸ NĂNG & TRẦN TỰ HỌC
| Bậc | Giá trị | Tự học tới đâu |
|---|---|---|
| Chưa biết | 0 | — |
| Sơ học | 1–20 | tự học thoải mái |
| Học việc | 21–40 | tự học thoải mái |
| Thành thạo | 41–60 | tự học được nhưng tốc độ giảm một nửa |
| Lão luyện | 61–75 | BẮT BUỘC có thầy bậc Bậc thầy trở lên |
| Bậc thầy | 76–88 | BẮT BUỘC có thầy bậc Tông sư |
| Tông sư | 89–95 | cần Tông sư + một sự kiện đột phá (mục 8) |

Trần cứng 95 (khớp clamp d100 ở Phần 5, luôn còn 5% thất bại).
Trần chủng tộc và trần chỉ số có thể hạ thấp con số này.

### 3. THỰC HÀNH
Mỗi lần kiểm định một kỹ năng, cộng điểm thực hành:
```
thất bại           +3   (thất bại dạy nhiều nhất)
thành công có giá  +2
thành công         +1
đại thành công     +2
đại thất bại       +4
```
**Chủ ý:** người chơi tiến bộ nhanh nhất khi làm việc khó, không phải khi lặp đi
lặp lại việc dễ.

- Chống cày máy móc: cùng một kỹ năng dùng cho cùng một loại việc quá N lần trong một khoảng thời gian thì điểm giảm dần về 0. Phải đổi hoàn cảnh.
- Việc quá dễ so với trình độ hiện tại cho 0 điểm.
- Ngưỡng lên 1 điểm kỹ năng tăng lũy tiến theo bình phương bậc hiện tại.

### 4. ĐIỂM KINH NGHIỆM
Nhận từ: sống sót qua biến cố lớn, thắng trận, hoàn thành mục tiêu dài hạn,
chứng kiến sự kiện hiếm, đọc sách quý, thất bại thảm hại nhưng sống sót.
**KHÔNG nhận từ việc giết lẻ tẻ. Đây không phải game đếm xác.**
Dùng để: mở node trong đồ thị nhánh (mục 6). Không dùng để mua thẳng số kỹ năng.

### 5. TẢI HỌC TẬP — càng rộng càng chậm
```
load = tổng số node đã mở + số kỹ năng đang ở bậc Thành thạo trở lên
hệ số chậm = 1 + 0.12 × max(0, load - 6)
```
Áp lên: ngưỡng điểm thực hành, giá điểm KN của node mới, thời gian học với thầy.

Kết quả: chuyên gia 3 kỹ năng tiến rất nhanh; người ôm 15 kỹ năng gần như đứng
yên. Không có trần cứng — người chơi tự chọn đánh đổi.

**Tuổi tác:** dưới 25 nhân 0.85 (học nhanh), trên 45 nhân 1.25, trên 60 nhân 1.6.
**Chủng tộc trường thọ:** hệ số cao hơn mỗi năm nhưng có hàng trăm năm để bù.
Cao Tiên 600 tuổi học chậm gấp ba nhưng đã tích lũy suốt nhiều thế kỷ — đây là
đòn bẩy cân bằng chủng tộc, đặt trong `/data/races.json` chứ không hardcode.

### 6. ĐỒ THỊ NHÁNH — chọn tự do, có tiên quyết
KHÔNG phải cây theo tầng. Là đồ thị có hướng, người chơi mở bất kỳ node nào thỏa
điều kiện.

```ts
type SkillNode = {
  id; skillId; name; description;
  kind: 'technique'|'stance'|'passive'|'breakthrough'|'secret';
  cost: number;                       // điểm KN, nhân hệ số tải học tập
  prereq: {
    skillLevel?: number;
    nodes?: string[];                 // AND
    anyOfNodes?: string[];            // OR
    stats?: Partial<Record<StatId, number>>;
    bodyCondition?: string[];         // mục 7
    teacherRequired?: boolean;
    teacherNodeRequired?: string;     // thầy phải có chính node này
    knowledge?: string[];             // id tri thức từ Phần 4
  };
  usableIn: ('duel'|'battle'|'siege'|'social'|'admin'|'field')[];
  effects: Modifier[];                // đăng ký vào registry Phần 5
  mechanics?: unknown;                // dữ liệu chiêu thức cho Phần 9/10
};
```

| Loại | Nghĩa |
|---|---|
| `technique` | một chiêu chủ động dùng trong đấu hoặc chiến trận |
| `stance` | thế thủ/công, bật lên là được cái này mất cái kia |
| `passive` | hiệu ứng thường trực |
| `breakthrough` | nâng trần kỹ năng, cần thầy + sự kiện đột phá |
| `secret` | bí truyền, chỉ một số NPC hoặc dòng tu biết, phải tìm ra họ |

Node `secret` phải gắn với một NPC hoặc tổ chức CÓ THẬT trong thế giới, và gắn
với entry lorebook có `knowledge='gated'`. Người chơi không thấy node đó trên UI
cho tới khi biết về nó.

### 7. NGHỊCH CẢNH MỞ RA NHÁNH MỚI
Nối thẳng vào Phần 7. Khi mất một phần cơ thể, các node bị khóa PHẢI được bù bằng
node thay thế, để người chơi không rơi vào ngõ cụt:
```
cụt tay phải     → mở nhánh kiếm tay trái, nhánh tay sắt, nhánh chỉ huy
mù một mắt       → mở nhánh cận chiến cảm giác, khóa nhánh cung dài
liệt hai chân    → mở nhánh chiến đấu trên yên ngựa, nhánh mưu sĩ, quản trị
biến dạng mặt    → mở nhánh uy hiếp, khóa nhánh triều đình
đau kinh niên    → mở nhánh chịu đựng, tăng WIL theo thời gian
```
Điều kiện `bodyCondition` trong prereq dùng cho việc này.
**Đây là quy tắc thiết kế bắt buộc: MỌI tàn phế vĩnh viễn đều phải mở ra ít nhất
một con đường mới.**

### 8. THẦY DẠY
```ts
type Teacher = {
  npcId; skills: { skillId; level; nodes: string[] }[];
  quality: 1|2|3|4|5;
  price: { money?; service?; oath?; favor?; secret? };
  availability;                        // ở đâu, khi nào, có nhận trò không
  attitudeRequired: number;            // cần quan hệ tới mức nào
};
```

Quy tắc:
- Thầy phải hơn trò ít nhất 15 điểm ở kỹ năng đó.
- Dạy tốn THỜI GIAN TRONG GAME thật: tuần tới tháng. Trong lúc đó người chơi không làm việc khác. Đây là chi phí cơ hội quan trọng.
- Giá không phải lúc nào cũng là tiền: một lời thề, một ân huệ phải trả sau, một bí mật đem đổi, phục vụ ba năm. Những cái này thành nghĩa vụ trong state, và Phần 15 phải nhớ để đòi.
- Chất lượng thầy ảnh hưởng tốc độ và xác suất học được node khó.
- Quan hệ (EMP, trust) quyết định thầy có dạy hết hay giấu nghề.
- Node `secret` đòi `teacherNodeRequired`: thầy phải chính mình có node đó.
- **Sự kiện đột phá bậc Tông sư:** không mua được. Phải xảy ra trong một hoàn cảnh cực hạn (sống sót một trận thua, đấu với người mạnh hơn hẳn, đại thất bại rồi vượt qua). Engine kiểm tra điều kiện, không cho người chơi bấm nút.

Tìm thầy là hoạt động thế giới thật: hỏi thăm, lần theo tin đồn lorebook, được
tiến cử, hoặc thầy tự tìm đến nếu danh vọng đủ cao.

### 9. NỐI VÀO CHIẾN ĐẤU
- Node `technique` và `stance` xuất ra dữ liệu `mechanics` mà Phần 9 và 10 đọc.
- Giai đoạn này chỉ định NGHĨA cấu trúc, chưa cần hiện thực chiêu thức.
- **Bắt buộc:** mỗi technique phải khai `usableIn`. Một chiêu đấu tay đôi không được tự động dùng được ở chiến trận quy mô lớn.
- Mọi `effects` đăng ký qua registry Phần 5, không tính riêng ở đâu cả.

### 10. SLICE `skills` — quyền ghi
```
levels.*, practicePoints.*, xp        engine
unlockedNodes                         engine
activeStance                          engine (người chơi bấm, không phải AI)
teacherRelations.*.attitude           ai
learningGoals, notes                  ai
```
Biến phụ: load, hệ số chậm, danh sách node khả dụng, trần hiện tại mỗi kỹ năng.

### 11. UI
Tab "Kỹ năng":
- Danh sách kỹ năng theo 10 nhóm, mỗi dòng: bậc, số hiện tại, thanh tiến độ thực hành, và **TRẦN HIỆN TẠI hiện rõ kèm lý do** ("cần thầy bậc Bậc thầy")
- Click vào một kỹ năng → mở đồ thị nhánh dạng graph kéo thả xem được:
  - node đã mở: sáng
  - node đủ điều kiện: viền nhấp nháy, hiện giá
  - node thiếu điều kiện: mờ, hover hiện đúng cái đang thiếu
  - node `secret` chưa biết: **KHÔNG hiện**, kể cả dạng mờ
- Khung "Tải học tập": load hiện tại, hệ số chậm, và một câu cảnh báo khi hệ số vượt 1.5
- Khung "Thầy đã biết": ai, dạy gì, ở đâu, giá, quan hệ hiện tại
- Nghĩa vụ đang nợ thầy, hiện rõ, có hạn chót

### 12. VIỆC CẦN LÀM
1. `/data/skills.json` đầy đủ 10 nhóm, mỗi kỹ năng gán chỉ số chính và hệ xúc sắc.
2. `/data/skill-nodes.json` — đồ thị node. Làm đủ cho 3 kỹ năng trước (một chiến đấu, một quản trị, một xã giao) để test, các kỹ năng khác để khung.
3. Slice `skills` + quyền ghi mục 10.
4. Cơ chế điểm thực hành, chống cày, ngưỡng lũy tiến.
5. Tải học tập + hệ số tuổi tác + hệ số chủng tộc.
6. Hệ thầy dạy: điều kiện, thời gian, giá, nghĩa vụ ghi vào state.
7. Điều kiện `bodyCondition` nối với Phần 7, kèm ít nhất 4 nhánh nghịch cảnh.
8. Đăng ký toàn bộ `effects` vào registry Phần 5.
9. UI đồ thị nhánh.
10. **Test:** mô phỏng một nhân vật luyện kiếm 200 lượt KHÔNG có thầy → phải chững lại đúng ở 60. Sau đó cấp một thầy bậc Bậc thầy → tiếp tục lên được. In đường cong tiến bộ ra.

### 13. Sau khi xong
Đưa ra đường cong ở bài test số 10 và đồ thị nhánh của kỹ năng kiếm thuật.
Cần xem nhịp tiến bộ có quá nhanh hay quá nản không.
