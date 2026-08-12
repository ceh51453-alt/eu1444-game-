# presets/mau — preset dựng tay để test đường biên

Ba file ở đây **không phải preset thật**. Preset thật của người ra đề nằm ở
`presets/that/`, và bài test chính (`preset-that.test.ts`) chạy trên chúng.

Giữ ba file này lại vì chúng đi qua những đường mà cả ba preset thật đều không
chạm tới:

| File | Đường biên nó kiểm |
|---|---|
| `day-du.json` | `prompt_order` có nhiều mục và **không** có `character_id` 100001 → phải cảnh báo và lấy mục đầu; `id` khác `identifier`; `prompt_order` trỏ tới identifier không tồn tại |
| `toi-gian.json` | **Không có `prompt_order`** → mọi khối thành mồ côi, engine vẫn phải chèn đủ bốn khối `[LOCKED]` |
| `khong-lich-su.json` | **Không có ô cắm `chatHistory`** → engine vẫn phải chèn đủ bốn khối và cảnh báo là đã đặt ở cuối |

Cả ba preset thật đều dùng `character_id` 100001, đều có `id` trùng
`identifier`, và đều có đủ tám ô cắm — nên bỏ ba file này đi là mất luôn phần
kiểm những nhánh trên.
