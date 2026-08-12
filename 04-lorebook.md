# PHẦN 4 — LOREBOOK: TRI THỨC THẾ GIỚI
*Tiền đề: Phần 0–3 đã xong, turn loop đã chạy thông. Vẫn CHƯA làm gameplay.*

### 1. Mục tiêu
Một hệ tri thức thế giới có phân tầng, biết thời gian, biết vùng miền, biết
người chơi ĐÃ BIẾT gì, và kích hoạt được sự kiện game.

### 2. MÔ HÌNH DỮ LIỆU
```ts
type Lorebook = {
  id: string; name: string; version: number;
  scope: { kind:'global'|'nation'|'region'|'race'|'faction'|'topic'; refId?: string };
  enabled: boolean;                 // bật tay
  autoScope: boolean;               // true = tự bật/tắt theo vùng đang ở
  priority: number;                 // sách nào thắng khi entry xung đột
  entries: LoreEntry[];
};

type LoreEntry = {
  id: string;
  title: string;
  type: 'place'|'person'|'faction'|'item'|'concept'|'custom'|'law'|'event'|'creature';

  // --- Nội dung ---
  content: string;                  // EJS render được, dùng locals của Phần 3
  variants?: { audience: string; content: string }[];   // mục 6
  summary?: string;                 // bản ngắn dùng khi thiếu token

  // --- Lớp 1: từ khóa ---
  keys: string[];
  keysSecondary?: { logic:'AND_ALL'|'AND_ANY'|'NOT_ALL'|'NOT_ANY'; keys:string[] };
  matchMode: 'plain'|'wholeWord'|'regex';
  caseSensitive: boolean;
  constant: boolean;                // luôn chèn, bỏ qua từ khóa

  // --- Lớp 2: điều kiện state ---
  condition?: string;               // biểu thức EJS trả boolean, đọc state

  // --- Lớp 3: thời gian trong game ---
  validFrom?: GameDate; validUntil?: GameDate;

  // --- Lớp 4: vị trí ---
  regions?: string[];               // id vùng; áp cho cả vùng con
  includeAdjacent?: boolean;

  // --- Lớp 5: cổng tri thức ---
  knowledge: 'public'|'gated'|'secret';
  requiresKnowledge?: string[];

  // --- Chèn ---
  placement: 'block'|{ depth:number };
  role?: 'system'|'user'|'assistant';
  weight: number;
  budgetPriority: number;

  // --- Hành vi ---
  sticky?: number;                  // giữ chèn thêm N lượt sau khi tắt
  cooldown?: number;                // sau khi chèn, nghỉ N lượt
  delay?: number;                   // chỉ tính từ lượt thứ N của game
  probability?: number;             // 0–100, dùng SEEDED RNG

  // --- Quan hệ ---
  related?: { id:string; pullWeight:number }[];
  recurse: boolean;
  preventRecursion: boolean;

  // --- Trigger ---
  triggers?: LoreTrigger[];
  triggerOnce?: boolean;
  triggerCooldown?: number;
};
```

### 3. PHÂN TẦNG SÁCH & TỰ BẬT TẮT THEO VÙNG
Cần một cây vùng: `/data/regions.json` — lục địa > vương quốc > tỉnh > khu định cư,
mỗi node có `parentId` + `adjacent[]`.

Với sách có `autoScope = true`, tính lại mỗi lượt:
- `scope.kind === 'region'` → bật nếu vùng hiện tại LÀ hoặc NẰM TRONG refId
- `scope.kind === 'nation'` → bật nếu đang ở trong quốc gia đó, HOẶC nhân vật là thần dân/chư hầu của quốc gia đó
- `scope.kind === 'race'` → bật nếu chủng tộc nhân vật khớp, hoặc đang ở vùng mà chủng tộc đó chiếm đa số
- `scope.kind === 'faction'` → bật nếu nhân vật thuộc phe, hoặc đang giao thiệp
- `scope.kind === 'global'` → luôn bật
- `scope.kind === 'topic'` → chỉ bật tay

Sách bị tắt thì entry của nó KHÔNG được quét, kể cả entry `constant`.
UI phải hiện rõ: *"3 sách đang bật vì bạn đang ở Tỉnh Swabia"*.

### 4. NĂM LỚP KIỂM TRA — chạy đúng thứ tự này
Một entry chỉ vào vòng chấm điểm khi qua HẾT năm lớp.
```
L1  sách đang bật?
L2  thời gian hiện tại nằm trong validFrom..validUntil?
L3  vùng hiện tại khớp regions (+ adjacent nếu bật)?
L4  condition (EJS) trả true?
L5  cổng tri thức cho phép? (mục 5)
```
Sau đó mới xét từ khóa và `probability`.
Thứ tự này quan trọng về hiệu năng: L1–L3 lọc rẻ, loại phần lớn entry trước khi
phải chạy EJS ở L4.

### 5. CỔNG TRI THỨC — điểm mạnh nhất so với SillyTavern
Vấn đề của ST: lorebook chèn vào là AI biết hết, nên AI vô tình để NPC nói ra
những chuyện nhân vật chưa từng nghe. Cách xử lý:

- State có một slice `knowledge`: tập id tri thức người chơi đã nắm, kèm nguồn và độ tin cậy: `{ id, learnedTurn, source, confidence: 0-100 }`.
- `knowledge = 'public'` → chèn tự do.
- `knowledge = 'gated'` → chỉ chèn nếu người chơi có ĐỦ `requiresKnowledge`.
- `knowledge = 'secret'` → không bao giờ chèn vào prompt chính. Chỉ chèn vào prompt của mô phỏng ngầm (Phần 15) để thế giới vận hành đúng, còn AI kể chuyện thì không được thấy.
- Với entry `gated` mà người chơi biết với confidence thấp, chèn kèm ghi chú: *"nhân vật chỉ nghe tin đồn về việc này, chưa chắc chắn"* — để AI cho NPC nói năng dè dặt đúng mức.
- Tri thức được thêm vào bằng trigger, hoặc bằng patch quyền `ai` từ MVU.

### 6. BIẾN THỂ THEO GÓC NHÌN
Cùng một chủ đề, mỗi phe kể một kiểu. Đây là linh hồn của bối cảnh thế kỷ 14.
```
variants: [
  { audience: 'nation:hre',    content: 'Giáo hoàng lấn quyền hoàng đế...' },
  { audience: 'nation:papacy', content: 'Hoàng đế phạm tội chống Giáo hội...' },
  { audience: 'race:elf',      content: '...' }
]
```
Chọn variant khớp với phe/chủng tộc/quốc gia của nhân vật hoặc của NPC đang đối
thoại. Không khớp gì thì dùng `content` gốc.

### 7. QUAN HỆ GIỮA ENTRY
Entry A kích hoạt → các entry trong `related` được kéo vào với điểm nhân
`pullWeight` (0–1), không cần khớp từ khóa. Dùng cho: nhắc tên một lãnh chúa thì
kéo theo thành trì, gia tộc, và cuộc tranh chấp của ông ta.
Chỉ kéo MỘT tầng, không kéo tiếp tầng hai, để tránh nổ ngân sách.

### 8. ĐỆ QUY & CHỐNG VÒNG LẶP
- Entry có `recurse = true` thì nội dung sau khi render được quét lại vòng nữa.
- Giới hạn độ sâu cấu hình được, mặc định 3.
- Giữ Set các id đã kích hoạt; entry đã vào rồi không vào lại.
- `preventRecursion = true` thì entry chỉ kích được từ tin nhắn gốc.
- Nếu độ sâu chạm giới hạn, ghi cảnh báo lên tab Debug kèm chuỗi entry đã đi qua.

### 9. CHẤM ĐIỂM & NGÂN SÁCH
```
score = (số từ khóa khớp × weight)
      + thưởng nếu khớp trong tin nhắn mới nhất
      + thưởng nếu khớp cả keysSecondary
      + thưởng nếu entry cùng vùng đang ở
      × pullWeight nếu vào qua đường quan hệ
```
Sắp giảm dần, lấy vào cho tới hết ngân sách của khối 4 (Phần 3).
Entry vượt ngân sách nhưng có `summary` → dùng summary thay vì bỏ hẳn.
Entry `constant` vẫn phải cạnh tranh ngân sách, nhưng được ưu tiên cao nhất.

### 10. TRIGGER SỰ KIỆN GAME — có ràng buộc an toàn
```ts
type LoreTrigger = {
  when: 'onActivate'|'onFirstActivate'|'onEnterRegion'|'onDateReached';
  emit: { event: string; payload: unknown };
};
```

**BA RÀNG BUỘC BẮT BUỘC, không được nới:**
- (a) Trigger CHỈ phát event lên eventbus. Nó KHÔNG BAO GIỜ được ghi thẳng vào state. Hệ thống nào đăng ký nghe event đó thì tự tính số liệu. Đây là cách giữ nguyên tắc R1: lorebook không được quyết một con số.
- (b) Trigger phải chịu `triggerOnce` và `triggerCooldown`. Không có thì một entry khớp mỗi lượt sẽ bắn event mỗi lượt.
- (c) Một lượt tối đa N event từ lorebook (mặc định 5). Vượt thì hoãn sang lượt sau và ghi log, không bao giờ bắn dồn.

Event dùng được ngay ở giai đoạn này:
```
'lore.knowledge.gain'   → thêm tri thức cho người chơi
'lore.rumor.spread'     → thêm tin đồn
'lore.notify'           → xếp một popup thông báo (Phần 15 sẽ hiện thực)
'lore.flag.set'         → set cờ tình tiết (chỉ path quyền 'ai')
```
Các event gameplay (đổi tài nguyên, gây thương tích, khai chiến) để dành,
Phần 12–15 mới đăng ký handler.

### 11. UI QUẢN LÝ LOREBOOK
Tab mới:
- **Cột trái:** danh sách sách, hiện scope + trạng thái bật/tắt + lý do tự bật
- **Cột giữa:** danh sách entry của sách đang chọn, có ô tìm, lọc theo type và theo knowledge, hiện entry nào đang được kích hoạt ở lượt này
- **Cột phải:** form sửa entry đầy đủ các field ở mục 2
- **Panel dưới:** *"Vì sao entry này được chèn / bị loại"* — hiện kết quả từng lớp L1–L5 và điểm số. Đây là công cụ debug quan trọng nhất của Phần 4, làm cho tử tế.
- Nút "Thử quét": nhập một đoạn văn bản giả, xem entry nào khớp.

### 12. IMPORT / EXPORT
- Định dạng chính: JSON riêng của game, có `schemaVersion`, Zod validate khi nạp.
- **BỔ SUNG:** hàm chuyển đổi từ file World Info của SillyTavern sang định dạng này, để tái dùng sách cũ. Map: `keys→keys`, `secondary→keysSecondary`, `order→weight`, `depth→placement`, `constant→constant`. Field nào ST không có thì đặt mặc định an toàn (`knowledge='public'`, `recurse=false`).
- Export ra một file `.json` cho mỗi sách, và một file gộp cho cả bộ.

### 13. VIỆC CẦN LÀM TRONG PROMPT NÀY
1. `/src/lore/types.ts` + Zod schema đầy đủ theo mục 2.
2. `/data/regions.json` — cây vùng mẫu cho một quốc gia để test autoScope.
3. `/src/lore/scanner.ts` — năm lớp, từ khóa, đệ quy, chấm điểm.
4. `/src/lore/knowledge.ts` — slice tri thức, đăng ký qua Phần 2.
5. `/src/lore/triggers.ts` — phát event, chịu cooldown và trần mỗi lượt.
6. `/src/lore/budget.ts` — nối vào ngân sách khối 4 của Phần 3.
7. `/src/lore/convert-st.ts` — chuyển đổi từ World Info.
8. UI ba cột + panel giải thích như mục 11.
9. Một lorebook mẫu ~15 entry để test đủ: constant, gated, secret, variants, related, recurse, trigger, giới hạn thời gian, giới hạn vùng.
10. Test: đứng ở vùng A thì entry của vùng B không được chèn, dù khớp từ khóa.

### 14. Sau khi xong
Đưa ra panel *"Vì sao entry này được chèn/bị loại"* với một trường hợp entry bị
loại ở lớp L5. Cần chắc cổng tri thức hoạt động đúng trước khi sang gameplay.
