# PHẦN 11 — VÂY HÃM VÀ TỔNG CÔNG
*Tiền đề: Phần 0–10 xong. Hai giai đoạn, hai hệ cơ chế khác hẳn nhau.*

### 1. NGUYÊN TẮC THIẾT KẾ
Tổng công là **NƯỚC CUỐI CÙNG**, không phải cách chơi mặc định. Đánh thẳng vào
tường thành là cách nhanh nhất để mất quân. Phần lớn thành trì đổi chủ vì hết lương
hoặc vì thỏa thuận. Nếu người chơi thấy tổng công là lựa chọn hiển nhiên thì cân
bằng đã sai.

**Bất đối xứng hai bên — đây là điều làm hai vai chơi khác hẳn nhau:**
- **BÊN VÂY** chống lại THỜI GIAN và DỊCH BỆNH. Quân đông nhưng tan dần mỗi tuần.
- **BÊN THỦ** chống lại CÁI ĐÓI và LÒNG NGƯỜI. Quân ít nhưng tường cao.

### 2. MÔ HÌNH CÔNG SỰ
```ts
type Fortification = {
  moat?: { width; wet: boolean };
  outerWall: { integrity; height; thickness; towers: Tower[] };
  gatehouse: { integrity; drawbridge; portcullis; murderHoles };
  bailey: { area; buildings: string[] };
  innerWall?: {...};
  keep: { integrity; capacity; stores };
  garrison: Unit[]; population: number; supplies: Supplies;
};
```
Mỗi lớp là một **CHỐT CHẶN**. Bên thủ có thể lùi từng lớp: mất tường ngoài chưa
phải mất thành. Mỗi lớp lùi thì diện tích nhỏ lại, mật độ phòng thủ tăng lên, nhưng
lương thực và nước cũng có thể nằm lại phía ngoài.

> Đối tượng này được ĐIỀN từ nhóm công trình phòng thủ của Phần 12. Xây gì hôm nay
> quyết định cuộc vây hãm năm sau. Phải nối thật, không phải hai hệ rời nhau.

### 3. GIAI ĐOẠN 1 — VÂY HÃM (đơn vị thời gian: TUẦN)

#### Hành động bên vây
| Hành động | Đặc điểm |
|---|---|
| Dựng vòng vây | chặn tiếp tế, tốn công, cần nhiều quân |
| Đào hầm phá tường | Lùn và thợ mỏ giỏi nhất; mất nhiều tuần |
| Dựng máy công thành | trebuchet, mangonel, ballista, xe húc, tháp công thành |
| Bắn phá | hạ integrity tường, ồn ào, hạ sĩ khí bên trong |
| Cắt nguồn nước | cực mạnh nếu thành không có giếng riêng |
| Ném xác vào trong | gieo dịch bệnh; hiệu quả thật nhưng bị Giáo hội lên án |
| Chiêu hàng | mở cửa đàm phán (mục 5) |
| Mua chuộc nội gián | dùng GUI, tốn tiền, rủi ro lộ |
| Đợi | rẻ nhất, nhưng thời gian ăn mòn chính mình |

#### Bên vây tự mình cũng đang chết dần
```
Lương thực    đạo quân vây tiêu thụ khổng lồ, phải tải từ xa
Dịch bệnh     kiết lỵ giết nhiều lính vây hơn cả tên đạn. Trại càng đông
              càng bẩn thì tỷ lệ càng cao. Đây phải là mối đe dọa số một.
Hết hạn nghĩa vụ  chư hầu chỉ phải phục vụ số ngày nhất định (mặc định 40).
              Hết hạn là họ có quyền về nhà. Muốn giữ phải trả tiền.
Lính đánh thuê    hết hợp đồng, không trả là bỏ đi hoặc quay sang cướp phá
Mùa đông      thương vong phi chiến đấu tăng vọt
Quân cứu viện đến  phải bỏ vây quay ra đánh, hoặc chia quân, hoặc rút
```

#### Hành động bên thủ — khác hẳn, không phải bản đối xứng
| Hành động | Đặc điểm |
|---|---|
| **Chia khẩu phần** | quyết định cốt lõi. Cắt khẩu phần thì cầm cự lâu hơn nhưng sĩ khí và sức khỏe tụt. Bảng nhiều mức. |
| Sửa tường ban đêm | hồi integrity, tốn vật liệu và sức dân |
| Đột kích ra ngoài | mục tiêu là **ĐỐT MÁY CÔNG THÀNH**. Rủi ro cao, phần thưởng lớn. Dùng lưới nhỏ như Phần 9/10 quy mô rút gọn. |
| Phản đào hầm | đào ngược lại gặp hầm địch, đánh nhau dưới lòng đất trong bóng tối. Một minigame nhỏ riêng, rất chết chóc. |
| Đổ nước sôi, vôi, đá | chỉ khi địch áp sát chân tường |
| Gửi sứ cầu viện | phải lọt qua vòng vây, kiểm định GUI/AGI |
| Đuổi dân thường ra | giảm miệng ăn rất hiệu quả. Nhưng bên vây thường không cho họ đi, họ chết kẹt giữa hai bên. Uy tín tổn hại nặng, Giáo hội lên án. **Lựa chọn tàn khốc có thật.** |
| Giả vờ dư dả | ném thức ăn qua tường để bên vây tưởng còn nhiều. Kiểm định GUI. Thành công thì bên vây nản, thất bại thì lộ ra là đang cùng đường. |
| Giữ lòng người | diễn thuyết, lễ tôn giáo, xử tử kẻ bàn lùi |

#### Mỗi tuần engine tính
tiêu thụ lương hai bên, kiểm định bệnh dịch (3d6 theo Phần 5), tiến độ máy móc và
đường hầm, hư hại tường, kiểm định sĩ khí hai bên, đào ngũ, thời tiết, sự kiện
ngẫu nhiên.

Có nút **TĂNG TỐC**: chạy nhiều tuần liền, tự dừng khi có sự kiện đáng chú ý
(cứu viện xuất hiện, tường sập, dịch bùng, có lời đề nghị đàm phán).

### 4. SỰ KIỆN VÂY HÃM
Bảng sự kiện trong `/data/siege-events.json`: quân cứu viện được phát hiện, kẻ phản
bội mở cổng, bão đánh sập tháp công thành, dịch hạch bùng trong trại, sứ giả Giáo
hoàng đến yêu cầu ngừng chiến, tù binh bị treo lên tường, giếng cạn, kho lương bốc
cháy, lính đánh thuê nổi loạn đòi tiền.
Mỗi sự kiện là một popup có lựa chọn (nối vào Phần 15).

### 5. ĐÀM PHÁN — rất đặc trưng thế kỷ 14
Kiểm định d100 hùng biện / mưu mô, có điều chỉnh theo tương quan lực lượng, lương
thực còn lại, uy tín, và tin tức về quân cứu viện.

**Hình thức đầu hàng có điều kiện** (thông lệ thật của thời kỳ):
> *"Nếu đến ngày X mà không có quân cứu viện, chúng tôi mở cổng."*

Đây là một **KHẾ ƯỚC ghi vào state**, cả hai bên bị ràng buộc. Phá ước thì mất danh
dự nghiêm trọng và bị Giáo hội xét.

Điều khoản thương lượng được: quân đồn trú rút đi mang theo vũ khí hay không, tiền
chuộc chỉ huy, con tin, thành phố được tha hay bị cướp phá, ai giữ tước vị, thần
phục hay sáp nhập.

### 6. GIAI ĐOẠN 2 — TỔNG CÔNG (dùng lưới Phần 10, có tầng)
Lưới có CHIỀU CAO: dưới hào, chân tường, mặt tường, sân trong, tháp chính.
Bên tấn công phải lần lượt vượt từng lớp. Mỗi lớp là một chỗ thắt cổ chai nơi ít
quân giữ được rất nhiều quân.

| Cơ chế | Đặc điểm |
|---|---|
| Vượt hào | chậm, phơi mình trước tên đạn |
| Bắc thang | rẻ, nhanh, thương vong khủng khiếp |
| Tháp công thành | đắt, chậm, nhưng đổ quân lên tường theo hàng ngũ |
| Đột phá qua chỗ sập | nếu đã bắn thủng hoặc đào sập |
| Phá cổng | xe húc, dưới cơn mưa đá và dầu sôi từ lỗ châu mai |
| Chiến trên mặt tường | không gian cực hẹp, hai người một hàng. Lợi thế thuộc bên thủ tuyệt đối. Chuyển sang cơ chế Phần 9 quy mô nhỏ. |
| **Đội tiên phong** | nhóm xung phong đầu tiên. Thương vong khủng khiếp, vinh quang và phần thưởng cực lớn nếu sống sót. Người chơi có thể tự dẫn → chuyển sang Phần 9. |

**Tỷ lệ thương vong bên tấn công ở các chốt phải RẤT cao.** Đó chính là lý do tồn
tại của thành trì. Nếu người chơi tổng công mà thắng dễ thì đã sai.

### 7. CƯỚP PHÁ — hệ quả lan tới toàn cục
Theo luật chiến tranh thời đó: thành đầu hàng theo điều kiện thì được tha; thành bị
hạ bằng tổng công thì bên thắng có quyền cướp phá.

**Chọn cướp phá:**
- ✅ tiền, chiến lợi phẩm, quân được thỏa mãn nên sĩ khí tăng
- ❌ uy tín sụp, Giáo hội có thể tuyên vạ, dân vùng đó thù hằn lâu dài
- ❌ **VÀ ĐÂY LÀ HỆ QUẢ QUAN TRỌNG NHẤT:** mọi thành trì khác nghe tin sẽ KHÔNG chịu đầu hàng nữa mà tử thủ tới cùng. Ghi vào state một chỉ số **"tiếng tàn bạo"**, Phần 15 dùng nó khi tính phản ứng của các thành khác.

**Chọn tha:**
- ✅ tiếng nhân từ, các thành sau dễ mở cổng hơn nhiều
- ❌ quân không được thưởng, sĩ khí giảm, có thể nổi loạn đòi phần

Đây là ví dụ mẫu cho quy tắc chung của game: **quyết định chiến thuật phải để lại
vết trên bản đồ chiến lược.**

### 8. BIÊN NIÊN
`CombatChronicle kind='siege'`, trải cả hai giai đoạn. Bổ sung trường: số tuần vây,
đường cong lương thực và sĩ khí hai bên, các mốc đàm phán, thời điểm tường vỡ, kết
cục và điều khoản.

Gọi LLM một lần viết diễn biến. Với vây hãm dài, prompt phải yêu cầu viết theo kiểu
**BIÊN NIÊN SỬ** chứ không phải tường thuật từng phút: nén thời gian, nhấn vào các
mốc, tả sự bào mòn.

### 9. UI
**Giai đoạn vây:**
- Sơ đồ mặt cắt thành trì, hiện integrity từng lớp
- Hai bảng đối xứng: bên vây (lương, bệnh, hạn nghĩa vụ, máy móc, hầm) và bên thủ (lương, nước, sĩ khí dân, sĩ khí quân, tường)
- Lịch tuần, nút tăng tốc, mốc sự kiện trên trục thời gian
- **Bảng hành động khác nhau hoàn toàn tùy người chơi đang ở bên nào**
- Khung đàm phán khi có

**Giai đoạn tổng công:**
- Lưới có tầng, chuyển góc nhìn giữa các lớp
- Đánh dấu rõ các chốt thắt cổ chai và thương vong dự kiến

### 10. VIỆC CẦN LÀM
1. `/data/fortifications.json`, `/data/siege-engines.json`, `/data/siege-events.json`, `/data/surrender-terms.json`
2. Mô hình công sự nhiều lớp, lùi từng lớp.
3. Engine vây hãm theo tuần: tiêu hao, bệnh, hạn nghĩa vụ, đào ngũ, thời tiết.
4. **Hai bảng hành động RIÊNG BIỆT** cho hai bên, không dùng chung.
5. Minigame phản đào hầm dưới lòng đất.
6. Hệ đàm phán + khế ước đầu hàng có điều kiện ghi vào state.
7. Tổng công trên lưới có tầng, nối sang Phần 9 khi đánh trên mặt tường.
8. Cướp phá / tha + chỉ số tiếng tàn bạo ảnh hưởng toàn cục.
9. `CombatChronicle kind='siege'` + viết diễn biến kiểu biên niên sử.
10. UI hai giai đoạn.
11. **Test:** 200 quân thủ một thành đủ lương trong tường tốt, chống 2000 quân vây. Nếu bên vây tổng công ngay thì phải thua thảm. Nếu vây đủ lâu thì phải thắng, nhưng mất một phần lớn quân vì bệnh. In hai kịch bản ra.

### 11. Sau khi xong
Đưa ra kết quả hai kịch bản ở bài test 11 và một bản diễn biến vây hãm do AI viết,
để xem giọng biên niên sử có đúng không.
