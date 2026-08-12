# systems/combat

**Chủ sở hữu:** Phần 9 dựng, Phần 10 và Phần 11 dùng lại nguyên vẹn.
**Nhiệm vụ:** `CombatChronicle` — định dạng biên niên chung cho quyết đấu, dã
chiến và công thành; phép nén giữ khúc ngoặt; prompt viết diễn biến và hậu kiểm
bản AI viết.

**Vì sao nó không nằm trong `minigames/duel/`:** mục 12.7 của Phần 9 bắt làm
tổng quát vì Phần 10 và 11 sẽ dùng lại. Nếu nó nằm trong đấu tay đôi thì dã
chiến phải import từ một minigame khác, và cái ngày Phần 10 cần thêm một trường
thì không ai biết sửa ở đó có làm hỏng Phần 9 không.

## ĐỌC biến nào

Không đọc gì cả. Mọi hàm ở đây THUẦN: nhận biên niên do minigame dựng, trả về
chữ hoặc danh sách vấn đề. Chúng không chạm vào `GameState`.

| Đường dẫn state | Vì sao cần |
|---|---|
| _(không có)_ | |

## GHI biến nào

Không ghi gì cả. Bản diễn biến đã viết được người gọi lưu xuống Tầng B (mục 10),
và đó là việc của minigame, không phải của module này.

| Đường dẫn state | Quyền ghi |
|---|---|
| _(không có)_ | |

## Ràng buộc

- **R1.** Biên niên là DỮ KIỆN BẮT BUỘC gửi cho AI, không phải gợi ý. Prompt ở
  `narrate.ts` cấm thêm đòn, thêm thương tích, đổi kết cục và nêu con số mới.
- Mọi tình tiết AI được phép kể phải có mặt trong cấu trúc. Thứ gì không lọt vào
  `CombatChronicle` thì vĩnh viễn không được kể — nên khi Phần 10 cần AI kể được
  một thứ mới, việc phải làm là thêm trường vào đây, không phải nới lỏng prompt.
- `compressChronicle` giữ hiệp có `highlight` trước; hiệp nhạt gộp thành một
  dòng. Một trận công thành 400 hiệp không lọt vào ngân sách token nào cả.
- `auditNarrative` chỉ BÁO, không sửa và không chặn. Nó là con số cho mục 13 của
  Phần 9 và cho tab Debug.
