# minigames/siege-defense

**Chủ sở hữu:** Phần 11
**Nhiệm vụ:** Vai NGƯỜI ĐỨNG SAU TƯỜNG — bảng hành động bên thủ (mục 3), cuộc đột
kích đốt máy công thành, và minigame PHẢN ĐÀO HẦM dưới lòng đất (mục 10.5).

**Trạng thái:** xong.

**KHÔNG import gì từ `minigames/siege-attack/`, và ngược lại.** Mục 3 nói thẳng
về bảng ở đây: "khác hẳn, KHÔNG PHẢI BẢN ĐỐI XỨNG". Hai bảng trông đối xứng ở mức
bề mặt ("bắn phá" ↔ "sửa tường") nhưng không đối xứng ở mức cơ học: bên vây tiêu
tiền và thời gian để mua TIẾN ĐỘ, bên thủ tiêu lòng người và vật liệu để mua THÊM
THỜI GIAN. Giữ hai thư mục không có đường tới nhau là cách giữ cho hai vế ấy
không bị gộp về một khuôn.

Nhịp tuần, công sự, đàm phán và biên niên nằm ở `/src/systems/siege/` — xem
README của thư mục ấy cho hợp đồng đầy đủ.

## ĐỌC biến nào

| Đường dẫn state | Vì sao cần |
|---|---|
| `character.skills.skill_hung-bien` | Nền của phép kiểm diễn thuyết giữ lòng người, và của lời xin điều kiện (mục 3, mục 5). |
| `character.stats.*` | Qua registry của Phần 5, khi chính người chơi là người trấn thủ. |

## GHI biến nào

| Đường dẫn state | Quyền ghi (engine/ai/locked) |
|---|---|
| _(không ghi trực tiếp)_ | Mọi thay đổi đi vào `SiegeState`, và người gọi chốt một lần qua MVU sau khi cuộc vây hãm kết thúc — cùng luật với Phần 9 và 10. |

## Ràng buộc

- Minigame chỉ sinh ra HÀNH ĐỘNG cho bước 1 của vòng lặp lượt; kết quả cơ học vẫn
  do bước 2 (RESOLVE) tính.
- Không tự tung xúc sắc bằng `Math.random()`. Chỉ dùng `core/rng.ts` (R3).
- **Đột kích là "quy mô RÚT GỌN" của Phần 9/10, có chủ ý.** Một cuộc đột kích
  xoay quanh đúng ba câu hỏi — ra được không, đốt được không, về được không — nên
  nó là ba pha, mỗi pha một phép kiểm, dùng đúng hai hệ mà Phần 5 mục 2 đã phân
  miền. Dựng một lưới ô vuông cho ba câu hỏi ấy là dựng một minigame thứ tư mà
  không ai xin, và nó sẽ ngốn mười phút cho một hành động người chơi bấm mười lần
  trong một cuộc vây hãm.
- **`autoDefenderAction` có ba điều kiện trước khi đột kích**, và cả ba đều đã
  trả giá một lần trong lúc dựng: chỉ đi khi bên kia có thứ ĐÁNG ĐỐT, chỉ đi khi
  còn đủ người trên tường, và không đi hai lần trong bốn tuần. Thiếu bất kỳ điều
  kiện nào thì hai trăm người trong tường hết sạch trong đúng bốn tuần — không
  phải vì bên vây giỏi, mà vì chính bộ chọn của bên thủ ném họ ra ngoài mỗi tuần.
- **"Đổ nước sôi" cố ý KHÔNG bấm được trong giai đoạn vây hãm.** Mục 3 viết điều
  kiện ngay trong dòng của nó: "chỉ khi địch áp sát chân tường". Nó vẫn HIỆN
  trong bảng, mờ đi, để người chơi đọc được rằng thứ ấy tồn tại và biết vật liệu
  để làm gì.
- **Trong hầm không có đội hình, không có tầm bắn, và không ai chạy được.** Đó là
  lý do `casualtyPerRound` của phản đào hầm cao gấp mấy lần mọi chỗ khác trong
  game, và là lý do người nhìn được trong tối gần như bất khả chiến bại dưới đó.
