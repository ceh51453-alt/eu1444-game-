# minigames/siege-attack

**Chủ sở hữu:** Phần 11
**Nhiệm vụ:** Vai NGƯỜI ĐỨNG NGOÀI TƯỜNG — bảng hành động bên vây (mục 3), cuộc
TỔNG CÔNG trên lưới có tầng (mục 6), và cầu nối sang Phần 9 khi đánh trên mặt
tường.

**Trạng thái:** xong.

Nhịp tuần, công sự, đàm phán, cướp phá và biên niên KHÔNG ở đây — chúng ở
`/src/systems/siege/`, vì mục 2 nói `Fortification` được ĐIỀN từ nhóm công trình
phòng thủ của Phần 12, và Phần 12 không được phải import từ một minigame. Xem
README của thư mục ấy cho lý do đầy đủ.

**KHÔNG import gì từ `minigames/siege-defense/`, và ngược lại.** Mục 10.4 đòi hai
bảng hành động RIÊNG BIỆT; cách chắc chắn nhất để chúng không lặng lẽ mọc thành
một là để chúng không có đường nào tới nhau. Hai bảng chỉ gặp nhau ở kiểu
`SiegeAction` của lõi.

## ĐỌC biến nào

| Đường dẫn state | Vì sao cần |
|---|---|
| `character.stats.*` · `character.gear` · `character.skills.*.level` · `skills.unlockedNodes` · `skills.activeStance` | CHỈ khi người chơi bấm "Tự mình lên tường" — `duel-link.ts` dựng hồ sơ đấu sĩ và giao sân cho Phần 9. |
| `body.*` | Cùng lý do: cơ thể người chơi lúc họ lên tới đầu thang. |
| `character.skills.skill_muu-do` | Nền của phép kiểm mua chuộc nội gián (mục 3). |

Còn lại đọc qua lõi ở `/src/systems/siege/` — xem README của thư mục ấy.

## GHI biến nào

| Đường dẫn state | Quyền ghi |
|---|---|
| `body.injuries` · `body.nextInjuryNo` · `body.log` | engine — chỉ từ minigame quyết đấu khi người chơi đánh trên mặt tường (mục 6) |
| `skills.practicePoints.*` · `skills.practiceLog.*` · `skills.xp` | engine — qua `practiceOps` của Phần 9 |

Không ghi trực tiếp. Op tích vào `SiegeState.playerOps`; người gọi chốt một lần
sau khi cuộc vây hãm kết thúc.

## Ràng buộc

- Minigame chỉ sinh ra HÀNH ĐỘNG cho bước 1 của vòng lặp lượt; kết quả cơ học vẫn
  do bước 2 (RESOLVE) tính.
- Không tự tung xúc sắc bằng `Math.random()`. Chỉ dùng `core/rng.ts` (R3).
- **`arena_cau-hep` chứ không phải `arena_san-dau`.** Mục 6 nói chiến trên mặt
  tường là "không gian cực hẹp, hai người một hàng, lợi thế thuộc bên thủ tuyệt
  đối". Ném người chơi vào một cái sân rộng thì họ thắng bằng cách đi vòng, và
  câu ấy mất hết nghĩa.
- **Tổng công là NƯỚC CUỐI CÙNG (mục 1).** `autoBesiegerAction` cố ý KHÔNG bao giờ
  chọn tổng công — nó là một nút riêng người chơi phải tự bấm. Nếu bộ chọn của
  engine tự tổng công thì bài test mục 11 sẽ đo một thứ không ai chọn.
- **Phần 16 sẽ đụng tới `duel-link.ts`** qua trang bị: giáp của người giữ tường
  hiện suy từ chất lượng đội đồn trú còn lại, và bản đồ che phủ thật của Phần 16
  sẽ thay chỗ ấy.
