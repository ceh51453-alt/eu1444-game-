# PHẦN 14 — TÁM THẾ LỰC, TÁM LỐI CHƠI
*Tiền đề: Phần 0–13 xong. Slice mới: `nations`, `religions`.*

### 1. NGUYÊN TẮC
Tám minigame phải khác nhau về **THỂ LOẠI**, không phải cùng một bảng số liệu đổi
nhãn. Một cái là bỏ phiếu, một cái là cho vay, một cái là quản lý quân đoàn, một cái
là quản lý suy tàn. Nếu hai quốc gia chơi giống nhau thì một trong hai làm sai.

**Ba tầng tiếp cận, áp cho MỌI quốc gia:**
| Tầng | Khi nào | Làm được gì |
|---|---|---|
| **1 — QUAN SÁT** | từ lượt đầu tiên, dù người chơi là nông nô | Bảng trạng thái quốc gia luôn xem được. Thấy ai đang thắng thế, cải cách nào đang chờ, hồng y nào đang vận động. Độ chi tiết phụ thuộc tri thức (Phần 4): người ở xa chỉ thấy tin đồn mờ nhạt, người trong triều thấy rõ. |
| **2 — TÁC ĐỘNG** | khi có chút thế lực | Hối lộ, tung tin đồn, thỉnh nguyện, làm tay chân cho một phe, cung cấp tiền hoặc quân. Không ngồi vào bàn nhưng đẩy được kim. |
| **3 — CHƠI THẬT** | khi đủ tước vị | Ngồi vào bàn, có lá phiếu, ra quyết định. |

**Bảng trạng thái không bao giờ bị khóa xám.** Luôn hiện, chỉ khác độ rõ và khác
những nút bấm khả dụng.

### 1b. NGUYÊN TẮC GÁN CHỦNG TỘC
Chủng tộc được gán theo **VAI TRÒ LỊCH SỬ** của thế lực đó trong thế kỷ 14, không
theo khuôn mẫu fantasy quen thuộc.
- Không có tộc nào "man rợ" hay "văn minh" bẩm sinh. Vai trò đến từ thể chế.
- **MỖI THẾ LỰC ĐỀU ĐA CHỦNG TỘC.** Tộc thống trị chỉ nắm chính quyền, còn dân cư luôn pha trộn. Xem mục 3.
- Nếu một thế lực chỉ có một tộc thuần thì đã làm sai.

---

## 2. TÁM THẾ LỰC

### 2.1 ĐẾ QUỐC ORC — nguyên mẫu Ottoman
**Bỏ HOÀN TOÀN hình ảnh bộ lạc.** Orc ở đây là thế lực có tổ chức chặt chẽ nhất và
kỹ thuật cao nhất trong thế giới.

**Đặc điểm nền:**
- **QUÂN ĐỘI THƯỜNG TRỰC CHUYÊN NGHIỆP**, ăn lương, huấn luyện quanh năm. Trong khi cả châu Âu còn dựa vào quân dịch chư hầu 40 ngày (Phần 11, 13). Đây là ưu thế cấu trúc, và phải thể hiện thành số liệu thật ở Phần 10.
- **DẪN ĐẦU VỀ THUỐC SÚNG VÀ CÔNG THÀNH.** Đại pháo, công binh, đào hầm. Trong Phần 11, Orc phải là thế lực duy nhất hạ được tường đá dày bằng bắn phá trong vài tuần thay vì vài tháng.
- **QUAN LẠI CHỌN THEO NĂNG LỰC**, không theo dòng dõi. Không có quý tộc thế tập cha truyền con nối theo kiểu phong kiến.

**Minigame: MƯỜI TÁM QUÂN ĐOÀN & CHIÊU MỘ DỊ TỘC**
*Thể loại: quản lý một cỗ máy quân sự và cân bằng phe phái trong nội bộ nó.*

- **a) MƯỜI TÁM QUÂN ĐOÀN** — chi tiết ở mục 4. Mỗi quân đoàn có ngân sách, uy thế, lòng trung, nguồn tuyển riêng. Quân đoàn không hài lòng có thể làm binh biến và phế truất chính người chơi. **Đây là mối đe dọa lớn nhất của thế lực này — không phải kẻ thù bên ngoài mà là quân đội của chính mình.**
- **b) CHIÊU MỘ DỊ TỘC** — cơ chế trung tâm và cũng là chỗ thể hiện "xen kẽ chủng tộc" rõ nhất. Lấy thiếu niên từ các vùng đã chinh phục, nuôi dạy từ nhỏ, cho ăn học và huấn luyện, biến họ thành lực lượng tinh nhuệ nhất.
  - **Được:** đội quân trung thành với CÁ NHÂN người cai trị, không dính líu gia tộc nào.
  - **Mất:** các vùng bị chiêu mộ oán hận lâu dài, dễ nổi dậy, và Giáo hội lên án.
  - **Hệ quả thú vị:** quân tinh nhuệ của đế quốc Orc phần lớn KHÔNG PHẢI là Orc. Có thể có Cao Tiên, Nhân tộc, Lùn trong hàng ngũ cấm vệ.
- **c) CÂY KỸ THUẬT** — pháo, thuốc súng, luyện kim, đóng tàu, bản đồ, công thành, y thuật quân đội. Mỗi nhánh cần Học Viện Kỹ Xảo (quân đoàn 18) và ngân sách. **Đây là thế lực DUY NHẤT có cây kỹ thuật thật sự.**
- **d) CHÍNH SÁCH TÔN GIÁO** — cho phép vùng chinh phục giữ tín ngưỡng riêng để đổi lấy thuế và nhân lực, hay ép cải đạo để thống nhất. Khoan dung thì nộp thuế đều nhưng không bao giờ đồng hóa được. Cưỡng bức thì nổi loạn nhưng nếu qua được thì vùng đó thành của mình vĩnh viễn.
- **e) BUỘC PHẢI MỞ RỘNG** — mỗi cuộc chinh phục nuôi cuộc chinh phục kế tiếp. Ngừng bành trướng vài năm thì ngân sách 18 quân đoàn không kham nổi, lương chậm, và binh biến. **Cỗ máy không có chế độ nghỉ.**

**Bảng trạng thái:** 18 quân đoàn với thanh lòng trung và uy thế từng đoàn, ngân sách
quân sự so với thu nhập, cây kỹ thuật, bản đồ vùng chiêu mộ và mức oán hận từng
vùng, số năm chưa có cuộc chinh phục nào.

**Chủng tộc:** Orc thống trị. Nhưng cấm vệ là dị tộc chiêu mộ, thương nhân là Miêu
Nhân và Latin, thợ thủ công là Gnome, dân vùng chinh phục là Nhân tộc, Ngưu Nhân,
Phong Tiên, Hải Tộc.

---

### 2.2 ĐẾ QUỐC ĐÔNG LA MÃ — Cao Tiên
Đế quốc cổ nhất, từng bá chủ, nay chỉ còn kinh đô và vài mảnh đất rời rạc. Cao Tiên
hợp vai này gần như hoàn hảo: sống lâu tới mức chính người đang cai trị VẪN CÒN NHỚ
thời hoàng kim. Đó là bi kịch cốt lõi.

**Minigame: NỘI CHIẾN & CẦU VIỆN**
*Thể loại: mọi lựa chọn cứu vãn đều đẩy nhanh sự sụp đổ.*

- **a) NỘI CHIẾN HOÀNG GIA** — các nhánh hoàng tộc tranh ngôi. Muốn thắng thì phải thuê quân ngoài. Và bên được thuê sẽ ở lại. **Đây là cách đế quốc Orc lần đầu đặt chân sang bờ bên này — do chính một hoàng đế Tiên mời sang.** Mỗi lần thắng nội chiến là mất thêm một mảnh đất trả công.
- **b) CẦU VIỆN PHƯƠNG TÂY** — Giáo triều sẵn sàng kêu gọi cứu viện, với giá là **HỢP NHẤT GIÁO HỘI**: công nhận Giáo hoàng đứng trên giáo hội của mình. Ký thì dân trong nước nổi loạn và gọi mình là kẻ phản đạo. Không ký thì không có viện binh. **Không có đáp án đúng.**
- **c) THU NHẬP TỪ EO BIỂN** — vị trí kiểm soát tuyến hàng hải là nguồn sống. Nhưng các thành bang Latin đã giành gần hết quyền thu, và họ có hạm đội. Muốn lấy lại phải đánh, mà đánh thì mất luôn nguồn vay tiền.
- **d) HỘI ĐỒNG TRƯỜNG SINH** — các trưởng lão Cao Tiên đã sống qua thời huy hoàng và từ chối cải cách vì *"cách cũ từng hiệu quả"*. Người chơi phải chống lại chính ký ức của tộc mình. Đây là hệ quả cơ học của tuổi thọ: **hệ số bảo thủ tăng theo tuổi trung bình của hội đồng.**
- **e)** Điều kiện thắng thật sự không phải mở rộng, mà là **SỐNG SÓT lâu hơn dự kiến** và giữ được thứ gì đó truyền lại.

**Bảng:** bản đồ lãnh thổ theo từng thập kỷ (đường đi xuống), các nhánh hoàng tộc và
yêu sách, cán cân hợp nhất giáo hội, thu nhập eo biển và phần bị chia, tuổi trung
bình hội đồng và hệ số bảo thủ.

**Chủng tộc:** Cao Tiên cai trị, Bán Tiên làm quan lại và thông ngôn, Nhân tộc Latin
và Rus làm dân, Hải Tộc làm thủy thủ, Ngưu Nhân làm lính đánh thuê, Phong Tiên ở
vùng núi biên giới.

---

### 2.3 LIÊN BANG NÚI — Lùn (nguyên mẫu các bang Thụy Sĩ)
Không có vua, không có quý tộc, không phong kiến. Các bang tự trị họp hội đồng.
Nổi tiếng vì bộ binh giáo dài đánh tan kỵ sĩ quý tộc — trận nào cũng là quân nông
dân thắng quân hiệp sĩ.

**Minigame: LIÊN BANG & XUẤT KHẨU LÍNH ĐÁNH THUÊ**
*Thể loại: đồng thuận và nghịch lý.*

- **a) HỘI ĐỒNG LIÊN BANG** — mọi quyết định lớn cần đồng thuận giữa các bang. Không ai ra lệnh được cho ai. Người chơi phải thuyết phục từng bang, mà mỗi bang có lợi ích riêng, thậm chí thù nhau.
- **b) GIỮ ĐÈO** — thế mạnh phòng thủ tuyệt đối. Trên địa hình núi, khối giáo Lùn gần như bất khả chiến bại trước kỵ binh nặng (nối thẳng vào Phần 10 mục 7). Nhưng ra khỏi núi thì lợi thế biến mất.
- **c) XUẤT KHẨU LÍNH ĐÁNH THUÊ** — nguồn thu chính. Bán khối giáo cho bất kỳ ai trả tiền. Tiền chảy về, thanh niên chết ở nước ngoài.
  **Cơ chế đặc trưng:** có thể xảy ra chuyện hai bang cùng nhận hợp đồng của hai bên ĐỐI ĐỊCH trong cùng một trận. Anh em họ giết nhau vì tiền người lạ. Sự kiện này phải làm rung chuyển liên bang.
- **d) KẾT NẠP BANG MỚI** — mỗi bang mới đổi cán cân bỏ phiếu. Có thể mất quyền kiểm soát hội đồng vì chính mình mở rộng.
- **e)** Kẻ thù thường trực: Đế quốc và các gia tộc quý tộc muốn đòi lại quyền cai trị.

**Bảng:** danh sách bang và lá phiếu, các đèo và tình trạng phòng thủ, hợp đồng lính
đánh thuê đang có (kèm cảnh báo trùng trận), dòng tiền về, số thanh niên đang ở nước
ngoài, quan hệ với Đế quốc.

**Chủng tộc:** Lùn Núi chủ đạo, Gnome trong các bang thợ, Nhân tộc Teuton ở vùng
thấp, Bán Nhân làm nông, Thạch Duệ do thợ Lùn tạo ra ở vài bang.

---

### 2.4 HÃN QUỐC THẢO NGUYÊN — các tộc du mục phương đông
Mã Nhân cầm đầu, cùng Sói Nhân, Quạ Nhân, Miêu Nhân thảo nguyên, Băng Tộc phía bắc.
**Không phải man rợ** — đây là thế lực có hệ thống trạm dịch nhanh nhất thế giới,
thu thuế bài bản, và bảo hộ tuyến thương mại xuyên lục địa.

**Minigame: CỐNG NẠP & PHÂN LIỆT**
*Thể loại: bòn rút bên ngoài trong khi bên trong đang tan.*

- **a) CẤP SẮC CHO CHƯ HẦU** — không cai trị trực tiếp các công quốc định cư. Thay vào đó cấp giấy phép cai trị cho ông hoàng nào chịu nộp nhiều nhất và ngoan nhất. Có thể rút lại bất cứ lúc nào. Chơi họ chống lẫn nhau.
  **Nguy hiểm:** một chư hầu được ưu ái quá lâu sẽ mạnh lên và không nộp nữa.
- **b) PHÂN LIỆT NỘI BỘ** — hãn quốc đang tách thành các hãn quốc nhỏ tranh nhau. Người chơi phải giữ liên minh bằng chiến lợi phẩm và bằng uy tín.
- **c) TUYẾN THƯƠNG MẠI** — thu thuế đường bộ xuyên lục địa. Đây là nguồn tiền lớn nhưng cũng là **ĐƯỜNG ĐI CỦA ĐẠI DỊCH.** Dịch hạch khởi phát từ vùng này và lan theo chính các tuyến mình bảo hộ. Nối thẳng vào Phần 15.
- **d) ĐỊNH CƯ HAY DU MỤC** — chọn hướng phát triển. Định cư thì giàu, có thành thị, có thuế ổn định, nhưng kỵ binh mất dần sức chiến đấu qua vài thế hệ. Giữ du mục thì nghèo hơn nhưng quân đội luôn đáng sợ.
- **e)** Trục tôn giáo: các tộc du mục đang bị cả Giáo triều, Đông phương ly giáo, và tín ngưỡng thảo nguyên kéo về ba phía.

**Bảng:** các hãn quốc con và mức trung thành, sổ cống nạp từng chư hầu định cư,
tuyến thương mại và thu nhập, thanh cảnh báo dịch bệnh, cán cân định cư/du mục.

---

### 2.5 ĐẾ QUỐC (La Mã Thần thánh) — minigame: CẢI CÁCH ĐẾ CHẾ
*Thể loại: bỏ phiếu và mặc cả.*

**Vấn đề:** đế quốc quá lớn, hoàng đế do bầu, hàng trăm chư hầu gần như độc lập.

**Cơ chế:** Đế hội họp định kỳ. Mỗi kỳ đưa ra các **DỰ LUẬT CẢI CÁCH**: hòa bình đế
chế (cấm tư chiến), tòa án đế chế, thuế đế chế chung, quân đội đế chế thường trực,
đăng ký thái ấp, thống nhất tiền tệ.

Mỗi dự luật: **tăng QUYỀN UY ĐẾ CHẾ, giảm TỰ DO CHƯ HẦU.** Chư hầu càng mạnh càng
chống. Cần đủ phiếu tuyển hầu + đủ phiếu chư hầu lớn.

**Công cụ:** mặc cả từng lá phiếu (ban đất, ban tước, tha nợ, hôn nhân), dọa nạt,
liên minh với Giáo hoàng hoặc chống lại Giáo hoàng, chia rẽ phe đối lập.

**Bảng:** quyền uy đế chế, danh sách tuyển hầu và nghiêng về đâu, dự luật đang chờ,
cải cách đã thông qua, các phe trong Đế hội.
**Thất bại:** đế quốc rã dần thành các quốc gia riêng.

**Chủng tộc:** Teuton chủ đạo, Gnome ở các thành phố tự do đế chế (thợ đồng hồ, giả
kim), Kobold làm phu mỏ, Ma Duệ bị truy bức, Lùn Vực Sâu ở vùng núi phía nam, Thử
Nhân trong ổ chuột thành thị.

---

### 2.6 VƯƠNG QUỐC FRANK — minigame: TẬP QUYỀN
*Thể loại: thôn tính từng bước, quản lý bất mãn.*

Ngược hẳn Đế quốc: vương quyền mạnh dần, nuốt từng công quốc.

**Cơ chế:** mỗi công quốc lớn là một mục tiêu. Bốn con đường nuốt: luật pháp (kiện
lên tòa tối cao), hôn nhân, tuyệt tự thừa kế, chiến tranh.
Mỗi lần nuốt: +đất trực thuộc, +**BẤT MÃN QUÝ TỘC** toàn quốc.
Bất mãn vượt ngưỡng → liên minh quý tộc nổi dậy, tất cả cùng lúc.

**Bảng:** bản đồ đất vương quyền vs đất chư hầu, thanh bất mãn, tòa tối cao, các vụ
kiện đang chạy, ai đang không có con thừa kế.

**Chủng tộc:** Frank chủ đạo, Bán Nhân là tầng nông dân đông đảo nhất, Ma Duệ thiểu
số bị đàn áp, Mộc Tộc ở các khu rừng thiêng còn sót, Ogre và Hùng Nhân làm lính đánh
thuê.

---

### 2.7 GIÁO TRIỀU — minigame: MẬT NGHỊ & QUYỀN LỰC THIÊNG
*Thể loại: chính trị nội bộ + đòn bẩy lên toàn thế giới.*

**Cơ chế:**
- Hồng y đoàn có phe. **Mật nghị** bầu Giáo hoàng khi khuyết ngôi — vận động, hứa hẹn, phong thêm hồng y phe mình trước khi chết.
- **Vũ khí của Giáo hoàng:** vạ tuyệt thông cá nhân, cấm chế cả một vương quốc (đóng cửa mọi nhà thờ — dân sợ hãi, chư hầu được cởi lời thề trung thành), kêu gọi thập tự chinh, phong thánh, phán xử tranh chấp giữa các vua, bán ân xá, lập tòa dị giáo.
- **MỌI TUYÊN BỐ CỦA GIÁO HOÀNG** đều phát event ra toàn thế giới → popup (Phần 15).

**Bảng:** uy tín thiêng liêng, ngân khố Giáo triều, sơ đồ phe trong Hồng y đoàn, quốc
gia nào đang bị vạ, dòng tu nào trung thành, dị giáo đang lan ở đâu.

**Rủi ro đặc trưng:** nếu uy tín xuống quá thấp, có thể xuất hiện **GIÁO HOÀNG THỨ
HAI** do một quốc gia lớn dựng lên. Cả thế giới phải chọn phe. Đây là biến cố lớn
nhất mà Phần 15 có thể sinh ra.

**Chủng tộc:** Latin chủ đạo, Thiên Duệ chiếm tỷ lệ cao bất thường trong hàng giáo
phẩm cấp cao (và điều đó gây tranh cãi trong chính Giáo hội), Quạ Nhân làm sứ giả và
mật vụ.

---

### 2.8 THÀNH BANG LATIN — minigame: NGÂN HÀNG & LÍNH ĐÁNH THUÊ
*Thể loại: quản lý tài chính và rủi ro.*

**Cơ chế:**
- Cho các vua vay tiền đánh nhau. Lãi cao, nhưng vua **QUỴT ĐƯỢC** và không ai đòi nổi. Phải cân giữa lợi nhuận và rủi ro vỡ nợ.
- Không nuôi quân thường trực — thuê condottieri. Lính đánh thuê có thể quay sang tống tiền chính mình nếu không được trả.
- Độc quyền tuyến thương mại, thao túng giá lương thực toàn châu lục.
- Bầu cử nội bộ có nhiệm kỳ: mất ghế là mất tất cả, nên phải mua phiếu.

**Bảng:** sổ cái từng khoản cho vay và xác suất vỡ nợ, hợp đồng lính đánh thuê và hạn
chót, tuyến thương mại, phe trong hội đồng, nhiệm kỳ còn lại.

**Chủng tộc:** Latin chủ đạo, Hải Tộc là xương sống hàng hải, Miêu Nhân nắm mạng lưới
thương điếm phương đông, Thử Nhân ở bến cảng.

---

## 3. HỆ CHỦNG TỘC XEN KẼ — hệ thống bắt buộc
```ts
type PowerDemographics = {
  dominantRace: RaceId;            // nắm chính quyền
  nativeRaces: RaceId[];           // bản địa lâu đời, có quyền công dân
  minorityRaces: {
    raceId; population;
    status: 'trọng dụng'|'dung nạp'|'chịu thuế riêng'|'bị hạn chế'|'bị truy bức';
    grievance: number;             // 0-100
    usefulness: number;            // đóng góp kinh tế/quân sự
  }[];
};
```

**Bốn chính sách áp cho mỗi nhóm thiểu số, đổi được theo thời gian:**
| Chính sách | Được | Mất |
|---|---|---|
| **TRỌNG DỤNG** | cho vào quân đội và quan trường; được năng lực | mất lòng tộc thống trị (*"bọn ngoại tộc đang cướp chỗ của ta"*) |
| **DUNG NẠP** | để yên, thu thuế bình thường; an toàn | không được gì thêm |
| **THUẾ RIÊNG** | thu nặng hơn; được tiền | tăng oán hận đều đặn |
| **TRUY BỨC** | được tài sản ngay lập tức, được lòng phe cực đoan | mất VĨNH VIỄN đóng góp kinh tế của nhóm đó và tạo ra một cộng đồng lưu vong nuôi hận qua nhiều thế hệ — Phần 15 phải nhớ và cho họ hành động về sau |

**Cơ chế bắt buộc:**
- Mỗi province (Phần 13) đã có `raceMix`. Giờ nối nó với bảng chính sách này.
- Oán hận cao + tỷ lệ dân số cao = **nổi dậy sắc tộc**.
- Một nhóm bị truy bức ở nước A sẽ **CHẠY SANG** nước B. Nước B nhận được nhân lực và kỹ năng của họ. Đây là dòng di dân thật, Phần 15 mô phỏng.
- **Đế quốc Orc dùng cơ chế này ở mức cực đoan nhất theo chiều ngược lại:** biến thiểu số thành tầng lớp tinh nhuệ. Cho thấy cùng một hệ thống có thể dùng theo hai hướng đối lập.

---

## 4. MƯỜI TÁM QUÂN ĐOÀN — chi tiết cho Đế quốc Orc
`/data/orc-corps.json`. Mỗi quân đoàn:
`{ id, tên, nhóm, nguồn tuyển, quân số, chất lượng, lòng trung, uy thế, ngân sách, trang bị, chuyên môn, quân đoàn kỵ, quân đoàn thân }`

**CẤM VỆ** *(tuyển bằng chiêu mộ dị tộc, trung thành với cá nhân người cai trị)*
```
1  Tân Binh Đoàn    bộ binh tinh nhuệ, kỷ luật cao nhất thế giới, về sau trang bị
                    hỏa khí. Uy thế lớn nhất, nguy hiểm nhất.
2  Cấm Kỵ Đoàn      kỵ binh cận vệ, tuyển từ những người xuất sắc nhất
3  Pháo Đoàn        đại pháo công thành. Vũ khí quyết định của thời đại.
4  Xa Pháo Đoàn     vận chuyển và lắp đặt pháo, hậu cần nặng
5  Hỏa Cầu Đoàn     bom, hỏa khí cầm tay, chất cháy
6  Công Binh Đoàn   đào hầm, phá tường, bắc cầu. Nối thẳng vào Phần 11.
7  Giáp Khí Đoàn    chế tạo và sửa chữa vũ khí giáp trụ tại chiến trường
8  Thị Vệ Đoàn      bảo vệ cung điện và người cai trị
```
**TỈNH BINH** *(tuyển theo thái ấp, gần với phong kiến hơn)*
```
9  Thái Ấp Kỵ Đoàn  kỵ binh đông đảo nhất, đổi đất lấy nghĩa vụ quân sự.
                    Đối trọng chính trị với Cấm Vệ.
10 Tiền Khu Đoàn    kỵ binh cướp phá, do thám, gieo kinh hoàng trước khi đại quân
                    tới. Không lương, sống bằng chiến lợi phẩm.
11 Khinh Bộ Đoàn    bộ binh không chính quy, dùng làm sóng đầu tiêu hao
12 Cuồng Sĩ Đoàn    xung kích liều chết, kỷ luật kém, sát thương cao
13 Sơn Đạo Đoàn     giữ đèo, giữ đường, chống cướp
14 Biên Trấn Đoàn   tuyển từ dân bản địa vùng biên đã quy thuận
```
**CHUYÊN MÔN**
```
15 Thủy Sư Đoàn     hạm đội, đổ bộ, phong tỏa
16 Công Thành Đoàn  máy móc, tháp, thang, phối hợp với Pháo và Công Binh
17 Truyền Tin Đoàn  trạm dịch, tình báo. Tuyển nhiều Quạ Nhân.
18 Học Viện Kỹ Xảo  nghiên cứu kỹ thuật, đào tạo sĩ quan, vẽ bản đồ.
                    Nguồn của cây kỹ thuật ở mục 2.1c.
```

**Cơ chế chính trị nội bộ — đây là phần khó nhất và hay nhất:**
- Ngân sách hữu hạn, 18 đoàn cùng đòi. Cắt của ai cũng mất lòng người đó.
- Uy thế tăng khi được giao trận thắng, giảm khi bị bỏ quên hoặc thua.
- **Cấm Vệ (1–8) và Tỉnh Binh (9–14) là HAI PHE ĐỐI LẬP cấu trúc.** Ưu ái bên nào thì bên kia bất mãn. Cân bằng là công việc thường xuyên.
- **Tân Binh Đoàn (1) khi uy thế quá cao và lòng trung xuống thấp thì có thể LÀM BINH BIẾN và phế truất người cai trị.** Đây là kết cục thất bại đặc trưng của thế lực này — chết dưới tay chính đội quân mình dựng nên.
- Lương phải trả đúng hạn. Chậm lương là kích hoạt kiểm định binh biến ngay.

---

## 5. TÔN GIÁO CẠNH TRANH
`/data/religions.json`:
```
Giáo hội Tây phương   chủ đạo phương tây, do Giáo triều lãnh đạo
Đông phương Ly giáo   Rus và phương đông
Tín ngưỡng Cổ         Lâm Tiên, Mộc Tộc, các bộ lạc rừng — bị gọi là tà giáo
                      (nhánh phương tây và nhánh Baltic là HAI nhánh riêng)
Đạo Đá / Tổ tiên      Lùn, khép kín, không truyền đạo
Thần Chiến Trận       Sói Nhân, các tộc thảo nguyên
Tín ngưỡng Orc        của đế quốc Orc, có chính sách khoan dung riêng
Các phong trào dị giáo phát sinh TỪ TRONG Giáo hội Tây phương
```

**Cơ chế lan truyền:** mỗi province có tỷ lệ theo tôn giáo. Thay đổi vì truyền đạo,
di dân, đàn áp, phép lạ, và quan trọng nhất — **KHỦNG HOẢNG.**

**DỊ GIÁO BÙNG MẠNH NHẤT sau đói kém, dịch bệnh, và khi Giáo hội mất uy tín** (ví dụ
khi có hai Giáo hoàng). Đây là quy tắc bắt buộc, không phải ngẫu nhiên.

Phản ứng của Giáo hội: giảng đạo, cải cách, tòa dị giáo, thập tự chinh nội bộ. Đàn áp
mạnh tay có thể dập được, hoặc có thể làm nó lan nhanh hơn.

## 6. QUAN HỆ GIỮA CÁC THẾ LỰC
Ma trận quan hệ, chiến tranh, liên minh, hôn nhân, yêu sách, cấm vận, hiệp ước.

**Sự kiện ở một thế lực phải dội sang thế lực khác:** Giáo hoàng ra vạ với Hoàng đế →
chư hầu Đế quốc được cởi lời thề → Frank thừa cơ lấn đất → Thành bang cho cả hai bên
vay tiền và lời to. Đây là việc của Phần 15, nhưng Phần 14 phải xuất ra đủ dữ liệu để
Phần 15 tính được.

## 7. SLICE — quyền ghi
```
'nations'   mọi chỉ số quốc gia, phiếu bầu, tiến độ cải cách   engine
            tin đồn triều đình, dư luận về một nhân vật         ai
'religions' tỷ lệ theo vùng, uy tín tôn giáo                    engine
            lời tiên tri, tin đồn phép lạ                       ai
```
Biến phụ: cán cân quyền lực châu lục, nguy cơ ly khai từng nước, chỉ số căng thẳng
tôn giáo.

## 8. UI
- Tab "Thế giới" với các thẻ quốc gia, mỗi thẻ mở ra bảng trạng thái riêng
- **Mỗi bảng có giao diện KHÁC HẲN nhau, đúng thể loại minigame của nó**
- Góc trên mỗi bảng hiện rõ tầng tiếp cận hiện tại: Quan sát / Tác động / Chơi
- Chỗ nào chưa biết thì hiện mờ kèm dòng *"tin đồn chưa xác thực"*, không hiện số liệu thật (nối cổng tri thức Phần 4)
- Bản đồ tôn giáo theo province, chuyển lớp xem được
- Dòng thời gian sự kiện lớn của châu lục

## 9. CẦN SỬA NGƯỢC Ở CÁC PHẦN TRƯỚC
| File | Sửa gì |
|---|---|
| `/data/races.json` (P6) | sửa cột "vị thế xã hội" của Orc, Cao Tiên, Lùn Núi, Mã Nhân, Sói Nhân theo bản đồ mới. **Bỏ mô tả Orc là bộ lạc.** Thêm cột `spread`: tộc đó có mặt ở những thế lực nào và với vai trò gì. |
| `/data/units.json` (P10) | viết lại danh mục binh chủng: Orc thành quân chính quy có pháo và hỏa khí sơ khai; Lùn thành khối giáo dài chống kỵ binh; Cao Tiên thành quân đội cổ điển thiếu tiền và thuê ngoài; thú nhân thành kỵ xạ thảo nguyên. |
| `/data/titles.json` (P13) | Orc bỏ thang "thách đấu giành ngôi", thay bằng thang quan lại theo năng lực. Lùn bỏ thang thị tộc, thay bằng chức vụ bang bầu có nhiệm kỳ. |
| `/data/regions.json` (P4) | vẽ lại bản đồ vùng theo tám thế lực này. |

## 10. VIỆC CẦN LÀM
1. `/data/nations.json` theo tám thế lực ở trên.
2. `/data/orc-corps.json` với 18 quân đoàn đầy đủ trường ở mục 4.
3. `/data/religions.json`, `/data/reforms.json`, `/data/diplomacy.json`
4. Slice `nations` và `religions`.
5. **TÁM minigame với TÁM giao diện khác nhau.** Làm lần lượt, không làm chung một component rồi đổi nhãn.
6. Ba tầng tiếp cận, nối với cổng tri thức Phần 4 và tước vị Phần 13.
7. Hệ `PowerDemographics` + bốn chính sách + nổi dậy sắc tộc + dòng di dân.
8. Cây kỹ thuật cho Đế quốc Orc, và chỉ Orc mới có.
9. Cơ chế binh biến của Cấm Vệ.
10. Hệ lan truyền tôn giáo + quy tắc dị giáo bùng sau khủng hoảng.
11. Ma trận quan hệ + xuất dữ liệu cho Phần 15.
12. Phát event ra ngoài cho mọi tuyên bố lớn (đặc biệt là của Giáo hoàng).
13. Cập nhật bốn file data ở mục 9.
14. UI như mục 8.
15. **Test A:** mô phỏng 60 năm không có người chơi can thiệp. Đế quốc Orc phải bành trướng đều, Đông La Mã phải mất đất đều, và ít nhất một lần Đông La Mã thuê quân Orc rồi bị mất đất vì chính việc đó. Đế quốc phải rã dần hoặc cải cách thành công. Giáo hội phải có ít nhất một khủng hoảng. In dòng thời gian ra.
16. **Test B:** cắt ngân sách Tân Binh Đoàn trong 3 năm liên tiếp. Phải dẫn tới binh biến. In đường cong lòng trung.
17. **Test C:** truy bức một nhóm thiểu số ở Frank. Phải thấy họ di cư sang thế lực khác và thấy kinh tế vùng đó sụt.

## 11. Sau khi xong
Đưa ra dòng thời gian Test A và bảng thành phần chủng tộc của cả tám thế lực.
Cần xem mức xen kẽ đã đủ dày chưa.
