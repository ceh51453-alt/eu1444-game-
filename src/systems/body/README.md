# systems/body

**Chủ sở hữu:** Phần 7
**Nhiệm vụ:** Cơ thể: 20 vùng, thương tích, nhiễm trùng, y học thế kỷ 14, tàn phế vĩnh viễn.

**Trạng thái:** xong.

## File nào làm gì

| File | Việc |
|---|---|
| `regions.ts` | nạp `/data/body-regions.json`: 20 vùng, bảng d100, độ sâu tính từ thân |
| `catalog.ts` | nạp `/data/injuries.json`: mức độ, loại, nguyên nhân, biến chứng, tàn phế, luật tử vong |
| `treatments.ts` | nạp `/data/treatments.json`: 9 phương pháp × 5 cấp, và bảng người chữa |
| `slice.ts` | schema, quyền ghi (TOÀN BỘ `engine`), ràng buộc chéo, 8 biến phụ |
| `vitals.ts` | trạng thái toàn thân: đau, sốc, ý thức, vận động, cầm nắm, thể lực |
| `inflict.ts` | vị trí trúng đòn, loại và mức độ, dựng một `Injury` |
| `tick.ts` | **vòng tính mỗi lượt** — tám bước, và năm cửa tử của mục 9 |
| `treat.ts` | một lần chữa trị: kiểm định d100 → áp hệ quả của đúng cấp |
| `ops.ts` | đổi bản sao đã tính xong thành `PatchOp[]`, và ghi sẹo sang Phần 6 |
| `events.ts` | `body.requestInjury` — AI đề nghị, engine phán quyết |
| `modifiers.ts` | **bảy nguồn** cắm vào registry của Phần 5 |
| `report.ts` | bản tóm tắt cho UI (mục 10) và cho khối prompt số 7 |

Hình người SVG ở `/src/ui/bodymap/silhouette.ts`; panel ở `BodyPanel.tsx`.

## ĐỌC biến nào

| Đường dẫn state | Vì sao cần |
|---|---|
| `body.*` | tất cả — đây là slice của chính hệ này |
| `character.stats.vit` | mọi kiểm định biến chứng là 3d6 vs VIT (mục 7) |
| `character.stats.wil` | đau chia theo ý chí (mục 2 và mục 5) |
| `character.skills.skill_y-thuat.level` | khi người chơi TỰ chữa (`healerId: 'tu-chua'`) |
| `character.appearance` | có ngoại hình chưa — không có thì không ghi sẹo |
| `meta.turn` | tuổi vết thương, hạn ý chí tạm thời, trần đề nghị mỗi lượt |

## GHI biến nào

| Đường dẫn state | Quyền ghi |
|---|---|
| toàn bộ `body.*` | `engine` — **không một đường dẫn nào cho AI** (mục 3) |
| `character.appearance.scars` | `engine` — Phần 6 khai sẵn quyền này cho Phần 7 (mục 8) |

Biến phụ đăng ký ở đây: `mucDau`, `mucSoc`, `yThuc`, `vanDong`, `camNamTrai`,
`camNamPhai`, `theLuc`, `soThuongTich`.

Nguồn modifier đăng ký ở đây: `body.vung`, `body.dau`, `body.mat-mau`,
`body.sot`, `body.van-dong`, `body.tan-phe`, `body.chi-huy`.

## Ba chỗ dễ hiểu sai nhất

**1. `blood` KHÔNG phải thanh máu.** Mục 2 nói thẳng: không có thanh máu tổng.
`blood` là lượng máu CÒN LẠI, và nó chỉ là MỘT trong năm cửa tử của mục 9. Bốn
cửa còn lại — tạng chí mạng, sốt kéo dài, hoại tử vào thân, uốn ván — không đi
qua nó chút nào. Ai đọc `body.blood` như `hp` sẽ thiết kế sai cả một minigame.

**2. Vòng lượt chạy ở BƯỚC 2, không phải bước 8.** `bodyTurn` được gọi trong
`ai/pipeline.ts` trước cả phép kiểm của lượt, vì hai bên đều phải nhìn thấy cơ
thể của hôm nay: cơn sốt lên trong đêm phải phạt cú tung sáng nay, và người kể
chuyện phải đọc được nó TRƯỚC khi viết cảnh (R1). Nó tung trên dòng RNG riêng
`BODY_STREAM` vì số lần tung thay đổi theo số vết thương đang mang (R3).

**3. Nguồn modifier KHÔNG áp vào miền `body.*`.** Đó là những cú tung mà cơ thể
tự chống lại nhiễm trùng. Cho sốt phạt chính cú tung chống sốt là dựng một vòng
xoáy mà người chơi không có nút nào để bấm — Phần 5 mục 3 cấm đúng chuyện đó.
Có bài test gác luật này.

## Ràng buộc

- Mọi thay đổi state đi qua MVU, không `set()` thẳng vào store (R2). Mọi hàm ở
  đây trả `PatchOp[]`; người gọi áp với actor `engine`.
- Mọi hàm tính toán phải thuần: nhận state, trả state mới (Phần 0 mục 7).
- Mọi modifier phải đăng ký vào registry của Phần 5, không tự tính riêng.
- Con số cân bằng nằm trong `/data/*.json`, không nằm trong code (R5).

## Chỗ đã cắt phạm vi, có chủ ý

- **Bảng tư thế** của mục 1 ("điều chỉnh theo chiêu thức, tư thế"): `rollHitLocation`
  nhận `postureBias`, nhưng BẢNG tư thế thật thuộc Phần 9 và Phần 10 — nơi biết
  thế nào là "địch nằm dưới đất". Cơ chế ở đây, nội dung ở đó.
- **Bản đồ che phủ giáp**: hiện chỉ tung lại một lần khi trúng ô có giáp.
  Phần 16 mục 3–4 thay bằng bản đồ thật với khe hở. `armorCell` của mỗi vùng đã
  dùng đúng id trong `data/gear.json` để lúc đó không phải dịch tên.
- **Bệnh truyền nhiễm**: `body.diseases` và bảng `diseases` trong data đã có chỗ
  và đã chạy (ủ bệnh → phát → sốt → tử vong), nhưng Phần 7 KHÔNG gieo bệnh nào.
  Phần 15 quyết định dịch hạch tới làng nào và khi nào.

## Còn treo cho phần sau

- Phần 8 mục 7: người mất tay phải có đường đi tiếp — nghịch cảnh mở nhánh kỹ năng.
- Phần 9 và 10: gọi `inflictFromCheck` với `postureBias` của riêng chúng; đọc
  `commandPenalty` để đổ vào sĩ khí.
- Phần 15: gieo bệnh vào `body.diseases`; đọc `bodySummary` để biết lãnh chúa có
  thân chinh được không.
- Phần 16: thay cơ chế `coveredCells` bằng bản đồ che phủ giáp thật.
