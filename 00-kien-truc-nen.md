# PHẦN 0 — KIẾN TRÚC NỀN
*(chỉ dựng khung, CHƯA làm gameplay, CHƯA gọi AI)*

### 1. Mục tiêu
Game nhập vai đơn chạy local trong trình duyệt. Bối cảnh châu Âu thế kỷ 14 giả
tưởng, nhiều chủng tộc.
- Toàn bộ DIỄN BIẾN, mô tả, hội thoại, hệ quả kể chuyện → do LLM sinh ra.
- Toàn bộ SỐ LIỆU: xác suất, sát thương, tài nguyên, thời gian → do engine tính.
- AI KHÔNG BAO GIỜ được tự quyết một con số.

### 2. Sáu nguyên tắc bất biến
- **R1 — TÁCH VAI:** Engine tung xúc sắc và tính kết quả TRƯỚC. Kết quả đó được đưa vào prompt như dữ kiện bắt buộc. AI chỉ diễn giải, không được đảo ngược.
- **R2 — STATE LÀ SỰ THẬT DUY NHẤT:** không dữ liệu nào chỉ tồn tại trong văn bản AI. Mọi thay đổi phải đi qua MVU và được Zod validate.
- **R3 — TÁI LẬP ĐƯỢC:** mọi roll dùng seeded RNG, seed lưu trong save. Cùng seed + cùng input = cùng kết quả cơ học.
- **R4 — FAIL-SAFE:** AI trả sai schema → từ chối TOÀN BỘ patch, giữ nguyên state, ghi log, KHÔNG crash, KHÔNG apply một nửa.
- **R5 — KHÔNG HARDCODE NỘI DUNG:** chủng tộc, quốc gia, binh chủng, tước vị, công trình... nạp từ file data ngoài để mở rộng sau.
- **R6 — MỌI THỨ CÓ XÁC SUẤT:** không hành động nào auto-thành-công trừ khi được đánh dấu explicit trong data.

### 3. Stack (ĐÃ CHỐT)
- React 18 + TypeScript (strict mode, cấm `any`) + Vite. Chạy local, không server.
- State: Zustand + Immer. KHÔNG dùng Redux.
- Validate: Zod — dùng xuyên suốt, sẽ là xương sống của MVU ở Phần 2.
- Styling: Tailwind + component tự viết. Không nhét thư viện UI nặng.
- Bản đồ cơ thể: SVG inline, mỗi nhóm cơ là một `<path>` có id riêng để đổi màu bằng CSS variable. TUYỆT ĐỐI không dùng ảnh bitmap.
- Lưới chiến thuật: Canvas 2D (sẽ quyết chi tiết ở Phần 10).

### 4. BA TẦNG LƯU TRỮ (ĐÃ CHỐT — dùng cả ba, mỗi tầng một nhiệm vụ)

**Tầng A — IndexedDB (thư viện `idb`)**
Bộ nhớ chạy chính. Autosave sau mỗi lượt. Đây là nơi state "sống".
Nguồn sự thật lúc runtime.

**Tầng B — SQLite trong trình duyệt (wa-sqlite hoặc sql.js, file .db lưu vào OPFS)**
Kho dữ liệu lớn và truy vấn được. Dùng cho: lịch sử toàn bộ lượt chơi, log
world-tick, danh bạ NPC, bảng tỉnh/lãnh thổ, biên niên sử chiến trận.
LÝ DO: những bảng này sẽ lên hàng chục nghìn dòng và cần query theo điều kiện.
IndexedDB làm việc đó rất tệ.

**Tầng C — File JSON ngoài (File System Access API, fallback download/upload)**
Export / Import thủ công. Dùng cho backup, chia sẻ save, và quan trọng nhất là
để mở ra sửa tay khi debug.

**QUY TẮC ĐỒNG BỘ (bắt buộc):**
- Runtime chỉ đọc/ghi Tầng A.
- Kết thúc mỗi lượt: ghi A, đồng thời append log vào B.
- Export = gộp A + B thành một file .json duy nhất, có `schemaVersion` + checksum.
- Import = Zod validate TRƯỚC. Sai thì từ chối, không được ghi đè save cũ.
- Bắt buộc có `migrate.ts`: save version thấp hơn phải được nâng cấp schema, không bao giờ vứt bỏ save cũ.
- Viết một interface `PersistenceLayer` chung, ba tầng là ba implementation. Phần còn lại của game chỉ biết interface, không biết tầng nào.

### 5. Cấu trúc thư mục
```
/src
  /core        rng.ts (seeded), dice.ts, clock.ts (lịch trong game),
               eventbus.ts, logger.ts
  /state       /schema (Zod), store.ts, mvu.ts, derived.ts, migrate.ts
  /persist     index.ts (interface), indexeddb.ts, sqlite.ts, jsonfile.ts, sync.ts
  /ai          provider.ts (proxy + key + quét model), preset.ts, pipeline.ts,
               ejs.ts, parser.ts (tách narrative / khối UpdateVariable)
  /lore        lorebook.ts, scanner.ts, budget.ts
  /sim         worldtick.ts, agents.ts
  /systems     character/ body/ skills/ titles/ holding/ realm/ economy/ diplomacy/
  /minigames   duel/ battle/ siege-attack/ siege-defense/
  /nations     hre/ papacy/ france/ ...
  /ui          panels/ popups/ bodymap/ settings/ shell/
/data          races.json units.json buildings.json titles.json nations.json
/presets       *.json   (preset tham số AI)
/lorebooks     *.json   (lorebook nạp vào)
```
Tạo đủ thư mục ngay từ bây giờ, file chưa làm thì để file rỗng kèm comment
mô tả nhiệm vụ của nó.

### 6. VÒNG LẶP MỘT LƯỢT — xương sống toàn bộ game
Đây là hợp đồng chung của mọi module sau. Định nghĩa kiểu dữ liệu cho từng bước
ngay từ Phần 0, dù chưa implement.

```
 1. INPUT      người chơi nhập hành động (tự do, hoặc chọn từ minigame)
 2. RESOLVE    engine xác định cần check gì → tung xúc sắc (seeded) →
               ra kết quả cơ học: thành/bại, mức độ, sát thương, chi phí
 3. CONTEXT    gom: state + biến phụ + lorebook match + kết quả bước 2 +
               preset params → render qua EJS
 4. CALL       gửi lên LLM qua proxy
 5. PARSE      tách phần văn bản kể chuyện và khối đề xuất cập nhật biến
 6. VALIDATE   MVU parse → Zod validate → clamp → apply (all-or-nothing)
 7. DERIVE     tính lại toàn bộ biến phụ
 8. TICK       world simulation chạy ngầm (có thể gọi proxy riêng)
 9. RENDER     cập nhật bảng trạng thái, bản đồ cơ thể, popup sự kiện
10. PERSIST    ghi Tầng A + append Tầng B
```

### 7. Quy ước code
- TypeScript strict. Không `any`, không `as` bừa.
- Mọi hàm tính toán game phải PURE: nhận state, trả state mới. Không side effect.
- Module không import chéo lung tung — đi qua interface đã khai báo.
- Comment tiếng Việt cho logic game, tiếng Anh cho hạ tầng.
- Mỗi hệ thống có README.md riêng ghi rõ: nó ĐỌC biến nào, GHI biến nào.

### 8. VIỆC CẦN LÀM TRONG PROMPT NÀY — chỉ chừng này, không hơn
1. Khởi tạo dự án Vite + React + TS + Tailwind, chạy được.
2. Tạo đủ cây thư mục ở mục 5, file rỗng có comment nhiệm vụ.
3. `core/rng.ts` HOÀN CHỈNH:
   - seeded PRNG (mulberry32 hoặc xoshiro128\*\*), khởi tạo từ seed string
   - `next()`, `int(min,max)`, `pick(array)`, `shuffle(array)`
   - lưu và khôi phục được trạng thái RNG (để save/load không lệch dãy)
4. `core/dice.ts` HOÀN CHỈNH:
   - `roll("3d6+2")` parse notation
   - `d20()`, `d100()`
   - `rollUnder(target)` → `{success, roll, margin}`
   - `contest(attackerMod, defenderMod)` → `{winner, margin}`
   - `degreeOfSuccess(roll, target)` → critFail / fail / success / critSuccess
5. Test: cùng seed chạy 1000 roll phải ra dãy y hệt nhau.
6. `state/store.ts` với state TỐI GIẢN:
   `{ meta: { schemaVersion, seed, rngState, turn, gameDate }, player: { name } }`
7. `persist/`: interface + Tầng A (IndexedDB) chạy được. Tầng B và C chỉ cần stub có chữ ký hàm đúng.
8. UI shell: 3 vùng — [Narrative] giữa, [Bảng trạng thái] phải, [Cài đặt] trái. Trống rỗng, chỉ để đúng layout.

**KHÔNG làm:** gọi AI, MVU, lorebook, minigame, tạo nhân vật, bản đồ cơ thể.

### 9. Sau khi xong
Liệt kê những chỗ thấy kiến trúc này còn thiếu hoặc sẽ vướng khi mở rộng,
để bổ sung trước khi sang Phần 1.
