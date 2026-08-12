# PHẦN 2 — MVU + ZOD: HỆ THỐNG BIẾN
*Tiền đề: Phần 0 và 1 đã xong. Đây là module quan trọng nhất dự án.
Mọi hệ thống gameplay sau này đều cắm vào đây.*

### 1. Mục tiêu
Một cơ chế duy nhất để: khai báo biến, cho AI đề xuất thay đổi, kiểm duyệt đề
xuất đó, áp dụng an toàn, tính biến phụ, và hoàn tác được.

### 2. SLICE REGISTRY — cách mọi module sau cắm vào
State không viết thành một schema khổng lồ. Mỗi hệ thống đăng ký một "slice".
Phần 2 chỉ dựng cơ chế + một slice mẫu tối giản.

```ts
registerSlice({
  id: 'character',
  schema: z.object({ ... }),
  defaults: () => ({ ... }),
  permissions: {                      // xem mục 3, đây là phần cốt lõi
    'stats.*'      : 'engine',
    'relations.*'  : 'ai',
    'identity.name': 'locked',
  },
  derived: [ ... ],                   // xem mục 7
  migrate: { 2: (old)=>new, 3: ... }
});
```

Root state = hợp nhất tất cả slice, namespace theo id: `state.character.stats.hp`
Không slice nào được ghi sang namespace của slice khác. Muốn tác động thì phát
event, chủ slice tự xử lý.

### 3. QUYỀN GHI BIẾN — cơ chế thực thi nguyên tắc R1
Đây là chỗ đảm bảo "AI không bao giờ tự quyết một con số". Ba mức:

| Mức | Ai được ghi | Gồm những gì |
|---|---|---|
| `engine` | CHỈ engine. AI đề xuất là bị từ chối thẳng. | máu, sát thương, tài nguyên, tiền, quân số, kết quả xúc sắc, thời gian, chỉ số, tiến độ xây dựng, độ bền công trình |
| `ai` | AI được ghi tự do trong giới hạn schema. | quan hệ NPC, cờ tình tiết, tâm trạng, tin đồn, ghi chú, lời hứa, bí mật đã lộ, ai biết chuyện gì |
| `locked` | Không ai ghi sau khi tạo. | id, seed, ngày sinh, chủng tộc |

**Nguyên tắc phân loại cho MỌI module sau:** nếu con số đó ảnh hưởng tới kết quả
một phép tính, nó là `engine`. Nếu nó chỉ mô tả trạng thái thế giới truyện, nó là `ai`.

Wildcard hỗ trợ: `'inventory.*.quantity': 'engine'`
Mặc định khi không khai báo: `engine` (an toàn hơn).

### 4. HAI CÚ PHÁP, MỘT DẠNG NỘI BỘ
AI có thể trả về một trong hai, hoặc cả hai trong cùng response. Parser tự nhận
diện rồi chuẩn hóa hết về `PatchOp[]`.

```ts
type PatchOp = {
  op: 'set'|'add'|'push'|'pull'|'delete';
  path: string;
  from?: unknown;      // giá trị cũ AI nghĩ là đang có
  to?: unknown;
  reason: string;      // BẮT BUỘC, không có lý do là op không hợp lệ
  source: 'st'|'json';
};
```

#### 4.1 Cú pháp SillyTavern
```
<UpdateVariable>
_.set('character.relations.eleanor.trust', 40, 55);//nàng thấy anh bênh vực mình
_.add('character.notes.rumors', 'Giáo hoàng sắp ra sắc chỉ');
_.push('character.flags', 'met_bishop');
_.pull('character.flags', 'is_stranger');
_.delete('world.tmp.scratch');
</UpdateVariable>
```

#### 4.2 Cú pháp JSON
```
<UpdateVariable>
{ "ops": [
  { "op":"set", "path":"character.relations.eleanor.trust",
    "from":40, "to":55, "reason":"nàng thấy anh bênh vực mình" }
]}
</UpdateVariable>
```

Nhận diện: sau khi lấy nội dung trong thẻ, trim rồi kiểm ký tự đầu là `{` hay `_`.
Nếu lẫn lộn thì tách theo dòng và xử lý từng dòng. Nếu có NHIỀU thẻ
`<UpdateVariable>` trong một response thì gộp theo thứ tự xuất hiện.

#### 4.3 CHECK GIÁ TRỊ CŨ (compare-and-swap)
Với op `set` có `from`: so sánh `from` với giá trị hiện tại trong state.
Lệch nhau → op này FAIL với lý do "AI đang dùng state cũ".

**Đây là lá chắn quan trọng nhất chống việc AI bịa số. KHÔNG được bỏ qua bước này.**
Trường hợp AI bỏ trống `from`: chỉ chấp nhận nếu path đang `undefined`.

### 5. PIPELINE KIỂM DUYỆT — chạy đúng thứ tự, all-or-nothing
Cho mỗi op:
```
B1  path có tồn tại trong schema đã đăng ký không?     → không thì FAIL
B2  quyền ghi là gì?  'engine'/'locked' + nguồn là AI  → FAIL
B3  op có hợp với kiểu dữ liệu không? (push vào number → FAIL)
B4  compare-and-swap (mục 4.3)
B5  Zod validate giá trị mới
B6  ràng buộc phạm vi: min/max, enum, độ dài mảng
B7  ràng buộc chéo (cross-field), ví dụ hp <= maxHp
```
Chỉ khi TOÀN BỘ op qua hết B1–B7 mới apply. Một op fail → hủy cả lô.
Lý do: apply một nửa sẽ tạo ra state mâu thuẫn mà không cách nào phát hiện sau này.

### 6. VÒNG SỬA LỖI (2 tầng)

#### Tầng 1: nhờ AI tự sửa, tối đa 2 lần
Gửi một request NGẮN, KHÔNG kèm lại toàn bộ context (tốn tiền vô ích). Chỉ gồm:
- danh sách op đã fail
- lý do fail của TỪNG op, nói rõ và cụ thể
- giá trị hiện tại thật của các path liên quan
- trích đoạn schema hợp lệ của các path đó
- lệnh: *"chỉ trả lại khối `<UpdateVariable>` đã sửa, KHÔNG viết lại truyện"*

Ví dụ thông báo lỗi tốt:
> "path `character.stats.hp` thuộc quyền 'engine', AI không được ghi. Nếu bạn muốn nhân vật bị thương, hãy mô tả trong truyện, engine sẽ tự trừ máu."
> "`from=40` nhưng giá trị hiện tại là 55. State bạn dùng đã cũ."

Phần narrative của lượt đó GIỮ NGUYÊN, không sinh lại.

#### Tầng 2: người chơi sửa tay
Sau 2 lần AI vẫn fail → mở modal "Kiểm duyệt biến":
- bảng các op còn lỗi, mỗi dòng sửa được trực tiếp
- cột hiển thị giá trị hiện tại thật để đối chiếu
- nút cho từng dòng: `[Sửa] [Bỏ qua op này] [Áp dụng dù sao]`
- nút chung: `[Áp dụng tất cả] [Bỏ toàn bộ lô]`
- "Áp dụng dù sao" bỏ qua B2 và B6 nhưng KHÔNG bao giờ bỏ qua B5 (Zod), vì phá schema là hỏng save.
- Ghi rõ trên modal: đây là chế độ debug, dùng nhiều sẽ làm lệch cân bằng game.

Mọi lần sửa tay đều ghi vào log Tầng B kèm cờ `manualOverride: true`.

### 7. BIẾN PHỤ (DERIVED)
Đăng ký trong slice:
```ts
derived: [{
  id: 'combatPower',
  deps: ['character.stats.str', 'character.stats.agi', 'body.injuries'],
  compute: (state) => number
}]
```

Yêu cầu:
- Hàm `compute` phải PURE, không đọc gì ngoài `deps` đã khai (kiểm tra được bằng proxy trong dev mode, đọc ngoài deps thì throw).
- Dựng đồ thị phụ thuộc, topological sort để tính đúng thứ tự.
- Phát hiện chu trình → báo lỗi lúc khởi động, không để chạy rồi mới chết.
- Biến phụ LUÔN là quyền `engine`, AI không bao giờ ghi được.
- Tự động tính lại ở bước 7 của turn loop, chỉ tính lại nhánh có deps thay đổi.
- Nút "Tính lại toàn bộ" trong tab Debug: bỏ cache, chạy lại từ đầu tất cả. Dùng khi nghi ngờ state lệch, hoặc sau khi import save cũ.

### 8. LỊCH SỬ & HOÀN TÁC
- Mỗi lượt lưu một bản ghi: `{ turn, seed, rngState, ops[], before, after, ts }`
- Ghi vào Tầng B (SQLite) chứ không giữ hết trong RAM.
- Undo: khôi phục state + khôi phục cả `rngState`, để tung lại xúc sắc ra đúng dãy cũ (nguyên tắc R3).
- Giữ được ít nhất 200 lượt gần nhất, cũ hơn thì nén lại.

### 9. UI: TRÌNH XEM BIẾN
Thêm tab "Biến" cạnh tab Debug:
- cây state đầy đủ, gấp/mở được, có ô tìm kiếm theo path
- mỗi node hiện: giá trị, kiểu, quyền ghi (màu: đỏ=engine, xanh=ai, xám=locked)
- biến phụ đánh dấu riêng, hover hiện công thức deps
- highlight vàng những path vừa đổi ở lượt gần nhất
- nút sửa tay từng giá trị (chế độ debug)

### 10. VIỆC CẦN LÀM TRONG PROMPT NÀY
1. `/src/state/slices.ts` — registry, hợp nhất schema, kiểm tra trùng namespace.
2. `/src/state/mvu.ts` — parser hai cú pháp, chuẩn hóa PatchOp, pipeline B1–B7.
3. `/src/state/repair.ts` — vòng sửa lỗi tầng 1, gọi qua `LLMProvider` của Phần 1.
4. Modal sửa tay tầng 2.
5. `/src/state/derived.ts` — registry, topo sort, phát hiện chu trình, recompute.
6. `/src/state/history.ts` — ghi log vào Tầng B, undo khôi phục cả rngState.
7. Tab "Biến" như mục 9.
8. Một slice mẫu `character` TỐI GIẢN (5–6 field, đủ 3 loại quyền, 1 biến phụ) chỉ để test. Schema thật sẽ làm ở Phần 6.
9. Test: một lô 5 op trong đó 1 op sai → phải reject cả 5, state không đổi.

**KHÔNG làm:** EJS, lorebook, gameplay, schema nhân vật thật.

### 11. Sau khi xong
Đưa ra file mẫu một lô patch hợp lệ và một lô bị reject kèm thông báo lỗi, để
đánh giá xem thông báo đã đủ rõ cho AI tự sửa chưa.
