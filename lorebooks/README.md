# lorebooks

Lorebook người dùng nạp vào. Chủ sở hữu: **Phần 4**.

Định dạng riêng của dự án (có trigger). Phần 4 kèm sẵn hàm chuyển đổi từ
World Info của SillyTavern.

## Nội dung chiến dịch "châu âu 1444"

Chín file dưới đây là chiến dịch thật, sinh ra từ `châu âu 1444.json` ở gốc dự án.
Số đầu tên file quyết định thứ tự nạp, không có ý nghĩa nào khác.

| File | Sách | Entry | Nguồn |
|---|---|---|---|
| `00-nen-tang.json` | Nền tảng | 10 | viết tay — khái niệm nền, phần lớn là `constant` |
| `05-the-gioi-lich-su.json` | Thế giới và lịch sử | 3 | sinh tự động |
| `10-dia-danh.json` | Địa danh | 91 | sinh tự động |
| `20-the-luc.json` | Thế lực và tổ chức | 32 | sinh tự động |
| `30-chung-toc.json` | Chủng tộc | 31 | sinh tự động |
| `35-nhan-loai-bon-nhanh.json` | Bốn nhánh Nhân loại | 4 | viết tay |
| `40-nhan-vat.json` | Nhân vật — mặt công khai | 73 | sinh tự động |
| `45-nhan-vat-be-trong.json` | Mặt riêng (`gated`) và động cơ thật (`secret`) | 146 | sinh tự động |
| `50-khai-niem.json` | Khái niệm và thể chế | 35 | sinh tự động |
| `60-su-kien-luat.json` | Sự kiện và luật | 14 | viết tay — có `validFrom`, trigger, `variants` |
| `70-vung-mien.json` | Chuyện của từng vùng | 12 | viết tay — có `regions`, lớp L3 |

**Bảy file "sinh tự động" ĐỪNG SỬA TAY.** Chúng bị ghi đè mỗi lần chạy:

```bash
node tools/chuyen-lorebook.mjs
```

Sửa nội dung thì sửa `châu âu 1444.json` rồi chạy lại script. Sửa cách chuyển đổi
(id, từ khóa, từ vựng bị cấm, cách sinh `summary`, cách xẻ ba tầng tri thức, cách nối
`related`) thì sửa các bảng ở đầu `tools/chuyen-lorebook.mjs`. Sửa **biến thể theo góc
nhìn** của entry sinh tự động thì sửa `tools/bien-the.json`. Bốn file viết tay thì sửa
thẳng.

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
