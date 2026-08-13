# lorebooks

Lorebook người dùng nạp vào. Chủ sở hữu: **Phần 4**.

Định dạng riêng của dự án (có trigger). Phần 4 kèm sẵn hàm chuyển đổi từ
World Info của SillyTavern.

## Nội dung chiến dịch "châu âu 1444"

Hai mươi file dưới đây là chiến dịch thật. Mười lăm file được sinh tự động từ bộ nguồn
`châu âu 1444.json`, hai World Info Trung Cổ, dữ liệu game và các bảng canon; năm file còn lại được viết tay.
Số đầu tên file quyết định thứ tự nạp, không có ý nghĩa nào khác.

| File | Sách | Entry | Nguồn |
|---|---|---|---|
| `00-nen-tang.json` | Nền tảng | 10 | viết tay — khái niệm nền, phần lớn là `constant` |
| `05-the-gioi-lich-su.json` | Thế giới và lịch sử | 3 | sinh tự động |
| `10-dia-danh.json` | Địa danh | 91 | sinh tự động |
| `20-the-luc.json` | Thế lực và tổ chức | 32 | sinh tự động |
| `30-chung-toc.json` | Chủng tộc | 31 | sinh tự động |
| `35-nhan-loai-bon-nhanh.json` | Bốn nhánh Nhân loại | 5 | viết tay |
| `40-nhan-vat.json` | Nhân vật — mặt công khai | 73 | sinh tự động |
| `45-nhan-vat-be-trong.json` | Mặt riêng (`gated`) và động cơ thật (`secret`) | 146 | sinh tự động |
| `50-khai-niem.json` | Khái niệm và thể chế | 35 | sinh tự động |
| `60-su-kien-luat.json` | Sự kiện và luật | 14 | viết tay — có `validFrom`, trigger, `variants` |
| `70-vung-mien.json` | Chuyện của từng vùng | 12 | viết tay — có `regions`, lớp L3 |
| `75-huyet-toc-carpathian.json` | Huyết Tộc và các Triều đình Đêm | 14 | viết tay — xã hội, luật, kinh tế, sinh học và ngoại giao |
| `76-thuong-mai-am-thuc.json` | Tiền tệ, thương mại, ẩm thực và giấy thông hành | 17 | sinh từ World Info Trung Cổ; chia nhỏ, có EJS và embedding |
| `77-the-gioi-quan-suy-luan.json` | 28 sách suy luận hậu trường | 217 | sinh từ World Info Trung Cổ; `secret` chỉ cho mô phỏng ngầm, có rào canon, EJS và embedding |
| `80-chung-toc-chuyen-biet.json` | 35 sách chuyên biệt theo từng chủng tộc | 140 | sinh từ `races.json` và canon; tự bật theo tộc/vùng |
| `81-lich-su-bien-tau.json` | Lịch sử ngoài đời được biến tấu | 23 | 22 mốc từ hậu La Mã đến Varna và một quy tắc canon; EJS + embedding |
| `82-ton-giao-giao-hoi.json` | 13 sách tôn giáo chuyên sâu | 52 | mỗi đạo có giáo lý, tổ chức, đời sống và quan hệ năm 1444 |
| `83-phe-phai-chinh-tri.json` | 17 sách phe phái quốc gia | 68 | mỗi khối có lịch sử, thiết chế, xã hội và khủng hoảng; tự bật theo quốc gia |
| `84-nhan-vat-lich-su-1444.json` | 69 nhân vật nữ dựa trên người có thật | 207 | bốn người cho mỗi khối, riêng Pháp có thêm Jeanne d’Arc; ba tầng công khai–thân cận–nội tâm, EJS + embedding |
| `85-ma-thu-thu-cuoi.json` | 32 ma thú và thú cưỡi đặc biệt | 37 | tám sinh cảnh cùng năm quy tắc sinh thái–thuần hóa–hậu cần–chiến trận–pháp luật; EJS + embedding |

**Mười lăm file "sinh tự động" ĐỪNG SỬA TAY.** Bảy file lõi bị ghi đè khi chạy:

```bash
node tools/chuyen-lorebook.mjs
```

Ba file tích hợp Trung Cổ và sách chuyên biệt chủng tộc bị ghi đè khi chạy:

```bash
node tools/tich-hop-lore-trung-co.mjs
```

Ba bộ lịch sử, tôn giáo và phe phái bị ghi đè khi chạy:

```bash
node tools/mo-rong-lich-su-ton-giao-phe-phai.mjs
```

Bộ nhân vật có thật bị ghi đè khi chạy:

```bash
node tools/sinh-nhan-vat-lich-su-1444.mjs
```

Bộ ma thú và thú cưỡi bị ghi đè khi chạy:

```bash
node tools/sinh-ma-thu-thu-cuoi-1444.mjs
```

Sửa loài, sinh cảnh, giá nuôi và giới hạn tại `tools/ma-thu-thu-cuoi-1444.json`;
không sửa trực tiếp file 85.

Sửa danh sách, chức vụ lịch sử, mục tiêu hoặc biến tấu chủng tộc tại
`tools/nhan-vat-lich-su-1444.json`; sửa tên nữ canon tại
`tools/sinh-nhan-vat-lich-su-1444.mjs`; không sửa trực tiếp file 84. Mọi chức vụ được khóa
ở mốc 1444, còn sự nghiệp sau đó là tương lai mở của mô phỏng. Jeanne d’Arc sống sót
trong canon và hoạt động dưới danh tính Jeanne des Armoises.

Sửa nội dung nền thì sửa `châu âu 1444.json` rồi chạy lại script. Riêng sách
`30-chung-toc.json` lấy số liệu từ `data/races.json`, phần diễn giải xã hội từ
`tools/chung-toc-canon.json`; các chỗ canon ngoài chủng tộc đã thay nguồn cũ nằm trong
`tools/lore-canon-overrides.json`. Sửa cách chuyển đổi
(id, từ khóa, từ vựng bị cấm, cách sinh `summary`, cách xẻ ba tầng tri thức, cách nối
`related`) thì sửa các bảng ở đầu `tools/chuyen-lorebook.mjs`. Sửa **biến thể theo góc
nhìn** của entry sinh tự động thì sửa `tools/bien-the.json`. Năm file viết tay thì sửa
thẳng.

Các entry mới có thể dùng `embedding: { text, threshold }` để được truy hồi mềm khi
không trùng từ khóa. Đây là embedding cục bộ, không gọi mạng; nội dung và `summary`
vẫn được render bằng EJS trước khi tính ngân sách prompt.

### Ba tầng tri thức của nhân vật

Mỗi hồ sơ nhân vật ra ba entry, cùng bộ từ khóa nhưng khác cổng L5:

| Entry | Cổng | Chứa gì |
|---|---|---|
| `npc_x` | `public` | hồ sơ, ngoại hình, bối cảnh, quan hệ, bảng màu, "Chế độ áo giáp", "Dục vọng bề mặt", "Giới hạn đạo đức", lưu ý cho AI, hình tượng |
| `npc_x-rieng-tu` | `gated` trên `fact_than-can-<tên>` | "Chế độ buông lỏng", "Chế độ vết nứt", "Bức tranh trộn màu" |
| `npc_x-be-trong` | `secret` | "Sự thiếu hụt sâu thẳm", "Nỗi sợ hãi cốt lõi", "Cơ chế phòng ngự", "Mâu thuẫn cốt lõi" |

**"Giới hạn đạo đức" cố ý ở lại `public`.** Nó nói nhân vật KHÔNG BAO GIỜ làm gì — giấu
nó đi thì AI cho nhân vật làm đúng cái họ không làm, hỏng nặng hơn lộ một bí mật.

Sửa xong chạy `npx vitest run src/lore/lore.test.ts` — bảy cổng gác ở đó sẽ chỉ
đúng entry nào sai.

## File mẫu

`mau-swabia.json` là dữ liệu test cơ chế — **các bài test của Phần 4 neo vào id
trong file này**, xóa nó là test đỏ. `KHUNG-MAU.json` là kho ví dụ, `enabled: false`
nên không bao giờ vào prompt; xóa được.

Phần 0 để trống có chủ ý.
