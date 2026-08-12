# systems/check

**Chủ sở hữu:** Phần 5
**Nhiệm vụ:** Kiểm định: bốn hệ xúc sắc phân miền, thang 5 cấp, REGISTRY MODIFIER.

**Trạng thái:** xong Phần 5. Chỉ số, kỹ năng và thương tích THẬT chưa cắm vào —
`resolve.ts` còn dùng năng lực nền cố định cho tới Phần 6 và Phần 8.

## Cửa vào

| Hàm | Dùng khi |
|---|---|
| `runCheck(rng, spec)` | một phép kiểm bất kỳ |
| `contestedCheck(rng, công, thủ)` | hai bên đối kháng trong CÙNG một hệ (mục 9) |
| `resolveTurn(action, rng, state)` | bước 2 của một lượt tự do |
| `registerModifierSource({...})` | mọi phần sau cắm modifier vào đây |

## ĐỌC biến nào

| Đường dẫn state | Vì sao cần |
|---|---|
| `meta.seed`, `meta.rng` | dòng xúc sắc và vị trí đã rút — vào `CheckResult.seedUsed` (R3) |
| _(qua `ModifierContext.state`)_ | nguồn modifier tự khai đường dẫn nó đọc trong README của nó |

Bản thân `/systems/check` KHÔNG đọc thẳng slice nào khác. Chỉ số, thương tích,
trang bị đi vào qua registry, không đi vào qua import — đó là điều kiện để mọi
điều chỉnh đều xuất hiện trong `CheckResult.modifiers`.

## GHI biến nào

| Đường dẫn state | Quyền ghi |
|---|---|
| _(không ghi gì)_ | — |

`runCheck` THUẦN: nhận `Rng` + spec, trả `CheckResult`. Vị trí xúc sắc sau khi
tung do vòng lặp lượt chốt (`commitRng` ở bước 10), không do file này.

## Ràng buộc

- Mọi thay đổi state đi qua MVU, không `set()` thẳng vào store (R2).
- Mọi hàm tính toán phải thuần: nhận state, trả state mới (Phần 0 mục 7).
- **Mọi modifier phải đăng ký vào registry, không tự tính riêng.** Một phần tự
  cộng modifier riêng thì dòng đó biến mất khỏi `CheckResult.modifiers`, người
  chơi không hiểu vì sao mình hỏng, mà game thì không có reroll (README mục 8.4).
- Một hành động dùng ĐÚNG MỘT hệ (mục 2). Việc trông như thuộc hai miền thì
  tách thành hai kiểm định nối tiếp.
- Độ khó nhận vào bằng TÊN BẬC, không bao giờ bằng số thô (mục 8).
- `critFail` chỉ được leo thang tình huống — không giết ngay, không làm mất
  trắng thành trì (mục 5). Bảng hệ quả có bài test gác luật này.

## File

| File | Nội dung |
|---|---|
| `tiers.ts` | ngưỡng 5 cấp của bốn hệ, thuần và không dùng RNG (mục 4) |
| `run.ts` | tung xúc sắc và dựng `CheckResult` (mục 3) |
| `difficulty.ts` | thang độ khó chuẩn hóa (mục 8) |
| `registry.ts` | registry modifier, thứ tự cộng, clamp (mục 7) |
| `consequence.ts` | bộ sinh cái giá / lợi ích / biến cố (mục 5, 12.5) |
| `contest.ts` | kiểm định đối kháng (mục 9) |
| `hint.ts` | hai dòng mệnh lệnh cho khối 11 (mục 10) |
| `log.ts` | log và thống kê xúc sắc (mục 11) |
| `resolve.ts` | bước 2 của vòng lặp lượt (mục 12.6) |
| `sources.ts` | hai nguồn modifier giả để test (mục 7) |
| `montecarlo.test.ts` | 100.000 lần mỗi hệ, đối chiếu kỳ vọng lý thuyết (mục 12.8) |

Nội dung bảng hệ quả nằm ở `/data/check-consequences.json` theo R5.
