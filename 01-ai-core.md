# PHẦN 1 — AI CORE: PROXY, QUÉT MODEL, PRESET THAM SỐ
*Tiền đề: Phần 0 đã xong. Vẫn CHƯA làm MVU, lorebook, EJS, gameplay.*

### 1. Mục tiêu
Dựng lớp giao tiếp LLM hoàn chỉnh, hỗ trợ BA chuẩn API, có UI cài đặt, quét được
model, nạp được preset tham số, và có HAI hồ sơ kết nối độc lập.

### 2. BA ADAPTER — một interface chung
Định nghĩa trong `/src/ai/provider.ts`:

```ts
interface LLMProvider {
  id: 'openai' | 'gemini' | 'anthropic';
  label: string;
  paramSchema: ZodSchema;              // tham số hợp lệ riêng của provider
  defaultParams: Record<string, unknown>;
  listModels(cfg: ConnCfg): Promise<ModelInfo[]>;
  stream(req: LLMRequest, cfg: ConnCfg, onChunk: (t:string)=>void): Promise<LLMResponse>;
}

type ConnCfg = {
  providerId: 'openai'|'gemini'|'anthropic';
  baseUrl: string;
  password: string;        // mật khẩu proxy, gửi kèm mỗi request
  model: string;
  params: Record<string, unknown>;
  timeoutMs: number;
};

type LLMRequest = {
  system: string;
  messages: { role:'user'|'assistant'; content:string }[];
  maxTokens: number;
  stopSequences?: string[];
  signal?: AbortSignal;
};

type LLMResponse = {
  text: string;
  raw: unknown;            // giữ nguyên payload gốc để debug
  usage?: { in:number; out:number };
  meta?: Record<string,unknown>;  // ví dụ thoughtSignature của Gemini
};
```

Phần còn lại của game CHỈ được biết interface này. Không chỗ nào ngoài `/src/ai/`
được phép biết provider nào đang chạy.

### 3. Chi tiết từng adapter

#### 3.1 OpenAI-compatible
- Gọi: `POST {baseUrl}/chat/completions`
- Header: `Authorization: Bearer {password}`
- Quét model: `GET {baseUrl}/models` → đọc mảng `data[].id`
- Body: `{ model, messages:[{role:'system'|'user'|'assistant',content}], stream:true, ...params }`
- Tham số: temperature, top_p, top_k, frequency_penalty, presence_penalty, max_tokens, seed, stop

#### 3.2 Gemini native
- Gọi: `POST {baseUrl}/v1beta/models/{model}:streamGenerateContent?alt=sse`
- Header: `x-goog-api-key: {password}`
- Quét model: `GET {baseUrl}/v1beta/models` → đọc `models[].name`, cắt tiền tố `models/`
- Body:
```json
{
  "systemInstruction": { "parts":[{"text": "..."}] },
  "contents": [{ "role":"user", "parts":[{"text":"..."}] }],
  "generationConfig": {
     "temperature": 1.0, "topP": 0.95, "topK": 64, "maxOutputTokens": 8192,
     "thinkingConfig": { "thinkingLevel": "HIGH" }
  }
}
```

**BA RÀNG BUỘC BẮT BUỘC CODE PHẢI XỬ LÝ:**
- (a) TUYỆT ĐỐI không được gửi kèm `thinkingBudget` khi đã có `thinkingLevel`. Gửi cả hai → API trả 400. Nếu preset nạp vào có `thinkingBudget`, phải tự động loại bỏ và cảnh báo trên UI.
- (b) `temperature` mặc định = 1.0. Nếu người dùng hạ xuống dưới 1.0, hiện cảnh báo vàng ngay dưới slider: *"Dòng Gemini 3 khuyến nghị giữ 1.0; hạ thấp làm giảm chất lượng suy luận."*
- (c) Nếu response trả về `thoughtSignature`, phải LƯU vào state và ECHO lại nguyên văn ở lượt sau. Thiếu nó → 400 ở các lượt tiếp theo.

Lưu ý model rẻ (dùng cho world-tick): các model Flash đời mới BỎ QUA
`temperature`/`topK`/`topP`. Adapter phải biết model nào bỏ qua tham số nào và
làm mờ (disable) những slider vô nghĩa đó trên UI thay vì để người dùng tưởng
mình đang chỉnh được.

#### 3.3 Anthropic
- Gọi: `POST {baseUrl}/v1/messages`
- Header:
  - `x-api-key: {password}`
  - `anthropic-version: 2023-06-01`
  - `anthropic-dangerous-direct-browser-access: true` ← **BẮT BUỘC** khi gọi trực tiếp từ trình duyệt, thiếu là bị CORS chặn
- Quét model: `GET {baseUrl}/v1/models` → `data[].id`
- Body: `{ model, system, messages, max_tokens, stream:true, temperature, top_p, top_k }`
- Lưu ý: `system` là field riêng, KHÔNG nhét vào mảng `messages`.

### 4. CORS — đọc kỹ, đây là chỗ dễ chết nhất
Game là web app chạy local, gọi thẳng proxy từ trình duyệt. Nếu proxy không trả
header CORS phù hợp, mọi request sẽ fail và lỗi hiện ra rất khó hiểu.
Phải làm cả hai:
- (a) Cấu hình Vite dev server proxy (`server.proxy`) để dev không vướng CORS.
- (b) Trong UI cài đặt có nút "Kiểm tra kết nối". Khi fail, phải PHÂN BIỆT được và báo đúng nguyên nhân:
  - lỗi network/CORS → "Proxy không cho phép gọi từ trình duyệt"
  - 401 / 403 → "Sai mật khẩu proxy"
  - 404 → "Sai URL hoặc sai tên model"
  - 429 → "Bị giới hạn tốc độ"

Không được gộp tất cả thành "Lỗi kết nối".

### 5. HAI HỒ SƠ KẾT NỐI (bắt buộc tách rời)
- Profile **"main"** — model chính, viết diễn biến, chất lượng cao.
- Profile **"worldtick"** — model rẻ, chạy mô phỏng ngầm (Phần 15), gọi rất nhiều lần.

Mỗi profile có `ConnCfg` riêng HOÀN TOÀN: provider, URL, mật khẩu, model, preset
đều độc lập. Có thể dùng Gemini cho main và một model rẻ khác cho worldtick.
UI: hai tab riêng trong màn Cài đặt, có nút "Sao chép cấu hình từ main".

---

## 6. HỆ THỐNG PRESET — định dạng SillyTavern

Preset đầu vào là preset Chat Completion của SillyTavern. Dưới đây là schema thật.

### 6.1 SCHEMA GỐC
```
{
  // --- tham số sampler, phẳng ở cấp cao nhất ---
  temperature, frequency_penalty, presence_penalty,
  top_p, top_k, top_a, min_p, repetition_penalty,
  openai_max_context, openai_max_tokens, max_context_unlocked: bool,
  seed, n, stream_openai: bool,

  // --- tham số suy luận / hành vi ---
  tool_reasoning_mode: string, reasoning_effort: string, verbosity: string,
  show_thoughts: bool, function_calling: bool, tool_call_recurse_limit: int,
  enable_web_search: bool,

  // --- định dạng ghép prompt ---
  names_behavior: int, send_if_empty: string,
  wi_format, scenario_format, personality_format, group_nudge_prompt,
  impersonation_prompt, new_chat_prompt, new_group_chat_prompt,
  new_example_chat_prompt, continue_nudge_prompt, bias_preset_selected,
  use_sysprompt: bool, squash_system_messages: bool,
  assistant_prefill, assistant_impersonation,
  continue_prefill: bool, continue_postfix: string,

  // --- ảnh ---
  media_inlining, inline_image_quality, request_images,
  request_image_aspect_ratio, request_image_resolution,
  // (một số preset còn có image_inlining, video_inlining, wrap_in_quotes)

  prompts: PromptEntry[],
  prompt_order: [{ character_id: number, order: [{identifier, enabled}] }],
  extensions: { ... }
}

PromptEntry = {
  identifier: string;          // khóa thật, dùng để nối với prompt_order
  id: string;                  // thường trùng identifier NHƯNG KHÔNG PHẢI LÚC NÀO CŨNG
  name: string;
  enabled: bool;               // KHÔNG đáng tin, xem 6.2
  role: 'system'|'user'|'assistant';
  content: string;
  system_prompt: bool;
  marker: bool;                // true = ô cắm dựng sẵn, content rỗng
  forbid_overrides: bool;
  injection_position: 0 | 1;   // 0 = xếp theo thứ tự, 1 = chèn theo độ sâu
  injection_depth: int;
  injection_order: int;
  injection_trigger?: string[];
}
```

### 6.2 BỐN CÁI BẪY KHI IMPORT — đã kiểm chứng trên file thật
1. **`prompt_order[0].order` MỚI LÀ NGUỒN SỰ THẬT** về thứ tự VÀ về enabled. Trong file mẫu có 4 mục mà `prompts[].enabled` mâu thuẫn với `prompt_order[].enabled`. Luôn lấy theo `prompt_order`.
2. **CÓ PROMPT MỒ CÔI:** file mẫu có 7 mục nằm trong `prompts[]` nhưng không có trong `prompt_order`. Đưa chúng vào cuối danh sách và MẶC ĐỊNH TẮT, kèm cảnh báo trên UI. Không được im lặng bỏ đi.
3. **`id` không phải lúc nào cũng bằng `identifier`.** Chỉ dùng `identifier` để nối. Bỏ qua `id`.
4. **`prompt_order` là mảng theo character_id.** Nếu có nhiều phần tử thì lấy phần tử có `character_id = 100001` (mặc định toàn cục), không có thì lấy đầu tiên.

### 6.3 TÁM Ô CẮM (marker) — ánh xạ sang khối của Phần 3
Marker có `marker: true` và content rỗng. SillyTavern tự điền. Game phải điền
bằng dữ liệu của mình:

| Marker | Khối |
|---|---|
| `personaDescription` | khối 5 — Hồ sơ nhân vật người chơi |
| `charDescription` | khối 8 — Cảnh hiện tại: NPC đang đối thoại |
| `charPersonality` | khối 8 (nối tiếp) |
| `scenario` | khối 3 — Bối cảnh thế giới |
| `worldInfoBefore` | khối 4 — Lorebook, phần chèn TRƯỚC |
| `worldInfoAfter` | khối 4 — Lorebook, phần chèn SAU |
| `dialogueExamples` | khối mới, mặc định tắt |
| `chatHistory` | khối 10 — Lịch sử gần |

### 6.4 BỐN KHỐI PHẢI TỰ CHÈN THÊM
SillyTavern KHÔNG có khái niệm tương đương cho bốn khối `[LOCKED]` của Phần 3.
Trình import BẮT BUỘC phải chèn chúng vào, không phụ thuộc file preset có gì:

| Khối | Chèn ở đâu |
|---|---|
| khối 2 — Luật bất biến cho AI | ngay sau khối system đầu tiên |
| khối 11 — KẾT QUẢ XÚC SẮC | sát trước `chatHistory` |
| khối 12 — Hành động người chơi | sau `chatHistory` |
| khối 13 — Cú pháp UpdateVariable | cuối cùng |

Nếu bỏ bốn khối này thì AI sẽ tự bịa số và không trả về patch — nguyên tắc R1 và
toàn bộ Phần 2 sụp đổ. Import xong phải hiện thông báo: *"Đã bổ sung 4 khối bắt
buộc của engine."*

### 6.5 ÁNH XẠ SANG PromptBlock CỦA PHẦN 3
```
identifier            → id
name                  → name
(từ prompt_order)     → enabled
role                  → role
content               → template
injection_position 0  → placement 'sequential'
injection_position 1  → placement { depth: injection_depth }
injection_order       → khóa phụ khi sắp xếp trong cùng độ sâu
system_prompt, marker, forbid_overrides → giữ nguyên thành field mới
forbid_overrides true → coi như locked, không cho sửa nội dung
budgetPriority        → SUY RA: marker chatHistory = 5, marker worldInfo* = 7,
                        khối do engine chèn = 10, còn lại = 6
```

### 6.6 EXTENSIONS
| Khóa | Nội dung |
|---|---|
| `extensions.SPreset.ChatSquash` | gộp lịch sử thành một khối văn bản với tiền tố User:/Assistant:. Hiện thực được thì làm, không thì bỏ qua và cảnh báo. |
| `extensions.SPreset.MacroNest` | cho phép macro lồng nhau. Ảnh hưởng Phần 3. |
| `extensions.SPreset.RegexBinding` | 27 script regex trong file mẫu. Xem 6.7. |
| `extensions.SPreset.ToolBindings` | thường rỗng. |
| `extensions.regex_scripts` | regex kiểu ST cũ, cùng cơ chế với RegexBinding. |
| `extensions.tavern_helper.scripts` | **ĐÂY MỚI LÀ CHỖ MVU-ZOD SỐNG THẬT.** Xem 6.8. |
| `extensions.entryGrouping` | gom nhóm khối trên UI, dùng để dựng cây thư mục trong Prompt Manager. |

### 6.7 REGEX SCRIPTS — phải hiện thực
```
RegexScript = { id, scriptName, disabled, runOnEdit, findRegex, replaceString,
                trimStrings[], placement[], substituteRegex, minDepth, maxDepth,
                markdownOnly, promptOnly }
```
- `placement`: 1 = tin nhắn người dùng, 2 = tin nhắn AI, 3 = lệnh, 5 = lorebook
- `promptOnly: true` = chỉ sửa khi gửi lên AI, không đổi cái hiển thị
- `markdownOnly: true` = chỉ sửa cái hiển thị, không đổi cái gửi đi

Trong file mẫu, regex được dùng để cắt bỏ khối `<thinking>` khỏi prompt và để bọc
chuỗi suy nghĩ trong CSS khi hiển thị. Cả hai đều cần cho game.
**Bắt buộc:** chạy regex có timeout, một regex tham lam có thể treo UI.

### 6.8 tavern_helper.scripts — NƠI ZOD THẬT SỰ NẰM
Mỗi script: `{ type:'script', enabled, name, id, content }`. `content` là mã
JavaScript. Trong file mẫu có script dài tới 39.000 ký tự.

**Phân loại theo NHIỆM VỤ, không theo mức tin cậy:**

**LOẠI UI — chạy trên luồng chính, có DOM đầy đủ**
Nhận diện: script có thao tác `document`, `innerHTML`, `style`, hoặc đăng ký
render hook. Cũng có thể khai báo tay bằng cờ `runsOnMainThread: true`.
Đây là loại chiếm đa số trong preset thật (làm đẹp chuỗi tư duy, khung gập, nút
bấm tùy biến). **Không được đẩy vào Worker** — Worker không có DOM, đẩy vào là
script chết chứ không phải an toàn hơn.
An toàn: bọc try/catch quanh mỗi hook. Script lỗi thì tắt hook đó, ghi log kèm
tên script, phần còn lại của game chạy tiếp.

**LOẠI TÍNH TOÁN — chạy trong Worker, HỦY ĐƯỢC**
Nhận diện: script biến đổi dữ liệu, tính biến phụ, khai báo schema Zod, xử lý
chuỗi dài.
Lý do dùng Worker ở đây KHÔNG phải bảo mật mà là để `terminate()` được khi treo.
Timeout mặc định 3 giây, cấu hình được, có thể tắt hẳn.

**GIỚI HẠN DUY NHẤT — và nó là kiến trúc, không phải bảo mật:**
Script KHÔNG được ghi thẳng vào state game. Muốn đổi state thì trả về `PatchOp[]`
cho Phần 2 kiểm duyệt. Nếu script ghi thẳng được thì MVU không còn là đường ghi
duy nhất, và toàn bộ pipeline B1–B7, compare-and-swap, lịch sử, undo đều vô nghĩa.
Script được ĐỌC state tự do, không giới hạn.

**CÔNG CỤ CHO NGƯỜI VIẾT SCRIPT:**
- Tab "Script" trong Cài đặt: danh sách, bật/tắt, sửa trực tiếp bằng CodeMirror
- Console riêng cho script, tách khỏi console trình duyệt, hiện log theo tên script
- Nút "Chạy thử" với state hiện tại, xem kết quả trước khi bật
- Hiện thời gian chạy của từng script mỗi lượt, để phát hiện cái nào làm chậm
- Nút "Dừng mọi script" khi lỡ viết vòng lặp hỏng
- Khai báo kiểu TypeScript cho API script, xuất ra file `.d.ts`

---

### 7. UI MÀN CÀI ĐẶT
Đặt ở cột trái của shell đã dựng ở Phần 0.

`[Tab: Kết nối chính] [Tab: Mô phỏng ngầm] [Tab: Preset] [Tab: Script] [Tab: Debug]`

**Tab Kết nối** gồm:
- Dropdown chọn chuẩn API (OpenAI / Gemini / Anthropic)
- Ô Base URL
- Ô Mật khẩu proxy (`input type=password`, có nút con mắt bật/tắt)
- Nút "Quét model" → dropdown model, có ô lọc để gõ tìm
- Nút "Kiểm tra kết nối" → hiện kết quả và độ trễ (ms)
- Khu tham số, render ĐỘNG từ `paramSchema` của provider đang chọn

**Tab Debug** (rất quan trọng cho cả dự án):
- Hiện nguyên văn request cuối cùng đã gửi và response cuối cùng nhận về
- Đếm token vào/ra và ước tính chi phí mỗi lượt
- Nút copy toàn bộ ra clipboard

### 8. XỬ LÝ LỖI & ĐỘ BỀN
- Timeout cấu hình được, mặc định 120s.
- Nút "Dừng" hủy request đang chạy qua `AbortController`.
- 429 và 5xx: tự retry tối đa 3 lần, backoff 1s / 4s / 10s. Các mã khác KHÔNG retry.
- Mọi request/response ghi vào ring buffer 50 mục trong bộ nhớ để tra debug.
- Mật khẩu proxy lưu trong IndexedDB. Ghi rõ trên UI: *"Lưu cục bộ trên máy này, không mã hóa mạnh — đừng dùng trên máy chung."*

### 9. VIỆC CẦN LÀM TRONG PROMPT NÀY
1. `/src/ai/provider.ts` với interface + 3 adapter đầy đủ, có streaming.
2. Zod schema cho toàn bộ định dạng preset ST ở 6.1.
3. Trình import xử lý đủ bốn cái bẫy ở 6.2, có báo cáo chi tiết sau khi nạp: bao nhiêu khối, bao nhiêu mồ côi, bao nhiêu lệch enabled, bao nhiêu khối engine đã tự chèn.
4. Ánh xạ marker ở 6.3, chèn bắt buộc bốn khối ở 6.4, ánh xạ trường ở 6.5.
5. Bộ chạy regex có timeout (6.7).
6. Bộ chạy `tavern_helper` theo phân loại ở 6.8 + tab Script.
7. Store cho hai profile, persist qua Tầng A của Phần 0.
8. UI các tab như mục 7, hoạt động thật. Quét model chạy được với cả 3 chuẩn.
9. Vite proxy config + phân loại lỗi như mục 4.
10. Export ngược ra định dạng ST.
11. Test: nạp cả ba file preset mẫu, in ra báo cáo import của từng file, và render thử prompt hoàn chỉnh với state rỗng.

**KHÔNG làm:** dựng prompt game, MVU, lorebook, EJS. Lúc này chỉ cần gửi được
một tin nhắn thử "ping" và nhận lại chữ, hiển thị trong tab Debug.

### 10. Sau khi xong
Liệt kê những tham số đã hỗ trợ cho từng provider, để đối chiếu với preset thật
trước khi sang Phần 2.
