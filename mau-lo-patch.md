# Mẫu lô patch — sinh từ pipeline thật của Phần 2

File này do `applyPatch` thật sinh ra, không phải viết tay. Mục đích: xem thông
báo lỗi đã đủ rõ để AI tự sửa ở vòng sửa lỗi tầng 1 chưa (Phần 2 mục 11).

```
slice mẫu: character · state ban đầu:
  character.stats     = {"hp":20,"maxHp":20,"str":10}
  character.identity  = {"id":"npc_nguoi-choi","race":"nguoi"}
  character.relations = {}
  character.flags     = []
```

---

## 1. Lô HỢP LỆ

AI gửi lên:

```
<UpdateVariable>
_.set('character.relations.eleanor', null, { trust: 12, note: 'nàng nhớ mặt anh' });//anh bênh vực nàng trước lính gác
_.push('character.flags', 'met_eleanor');//lần đầu gặp Eleanor
_.push('character.notes.rumors', 'Giáo hoàng sắp ra sắc chỉ về thuế muối');//nghe lỏm ngoài chợ
_.pull('character.flags', 'is_stranger');//không còn là người lạ trong thành
{ "ops": [ { "op":"set", "path":"character.relations.marcus", "to":{"trust":-4,"note":"gã nhìn anh chằm chằm"}, "reason":"gã lính đánh thuê tỏ vẻ nghi ngờ" } ] }
</UpdateVariable>
```

Parser đọc được **5 op** (4 cú pháp ST, 1 cú pháp JSON), 0 lỗi cú pháp.

Kết quả kiểm duyệt:

```
applied = true
changedPaths = [
  "character.relations.eleanor",
  "character.flags",
  "character.notes.rumors",
  "character.flags",
  "character.relations.marcus"
]
```

State sau khi áp:

```json
{
  "identity": {
    "id": "npc_nguoi-choi",
    "race": "nguoi"
  },
  "stats": {
    "hp": 20,
    "maxHp": 20,
    "str": 10
  },
  "relations": {
    "eleanor": {
      "trust": 12,
      "note": "nàng nhớ mặt anh"
    },
    "marcus": {
      "trust": -4,
      "note": "gã nhìn anh chằm chằm"
    }
  },
  "flags": [
    "met_eleanor"
  ],
  "notes": {
    "rumors": [
      "Giáo hoàng sắp ra sắc chỉ về thuế muối"
    ]
  }
}
```

---

## 2. Lô BỊ TỪ CHỐI

AI gửi lên:

```
<UpdateVariable>
_.set('character.stats.hp', 20, 12);//bị đâm một nhát vào sườn
_.set('character.identity.race', 'nguoi', 'elf');//nàng phù thuỷ biến anh thành elf
_.set('character.stats.mana', 0, 30);//anh học được phép thuật
_.set('character.relations.eleanor.trust', 40, 55);//nàng quý anh hơn
_.push('character.flags', 12345);//đánh dấu số
_.push('character.relations.marcus.trust', 5);//tăng thiện cảm
</UpdateVariable>
```

Parser đọc được 6 op. Kiểm duyệt từ chối **cả lô** vì 6 op sai.

Cả sáu op đều bị huỷ, kể cả op số 4 vốn hợp lệ — đó là all-or-nothing (mục 5).

| # | Op | Bước | Thông báo lỗi gửi lại cho AI |
|---|---|---|---|
| 1 | `_.set('character.stats.hp'…)` | B2 | Đường dẫn "character.stats.hp" thuộc quyền 'engine', AI không được ghi. Nếu bạn muốn thay đổi này xảy ra, hãy MÔ TẢ nó trong truyện; engine sẽ tự tính và tự ghi. |
| 2 | `_.set('character.identity.race'…)` | B2 | Đường dẫn "character.identity.race" là 'locked' — không ai được ghi sau khi tạo ván chơi. |
| 3 | `_.set('character.stats.mana'…)` | B1 | Đường dẫn "character.stats.mana" không có trong schema của slice "character". |
| 4 | `_.set('character.relations.eleanor.trust'…)` | B4 | from=40 nhưng giá trị hiện tại là chưa có giá trị. State bạn dùng đã cũ. |
| 5 | `_.push('character.flags'…)` | B5 | Phần tử 12345 không đúng kiểu cho mảng "character.flags" (phần tử là string). |
| 6 | `_.push('character.relations.marcus.trust'…)` | B3 | Không thể "push" vào "character.relations.marcus.trust" vì nó là number, không phải mảng. Dùng _.set cho giá trị đơn. |

```
applied = false
next    = null
changedPaths = []
```

---

## 3. Lời nhắc gửi cho AI ở vòng sửa lỗi tầng 1

Dài 1992 ký tự — cố ý ngắn, không kèm lại ngữ cảnh của lượt.

```
Khối cập nhật biến bạn vừa gửi bị engine từ chối. Hãy sửa lại và gửi lại.

CÁC OP BỊ TỪ CHỐI:
- _.set('character.stats.hp', 20, 12)
  LỖI (B2): Đường dẫn "character.stats.hp" thuộc quyền 'engine', AI không được ghi. Nếu bạn muốn thay đổi này xảy ra, hãy MÔ TẢ nó trong truyện; engine sẽ tự tính và tự ghi.
- _.set('character.identity.race', "nguoi", "elf")
  LỖI (B2): Đường dẫn "character.identity.race" là 'locked' — không ai được ghi sau khi tạo ván chơi.
- _.set('character.stats.mana', 0, 30)
  LỖI (B1): Đường dẫn "character.stats.mana" không có trong schema của slice "character".
- _.set('character.relations.eleanor.trust', 40, 55)
  LỖI (B4): from=40 nhưng giá trị hiện tại là chưa có giá trị. State bạn dùng đã cũ.
- _.push('character.flags', null, 12345)
  LỖI (B5): Phần tử 12345 không đúng kiểu cho mảng "character.flags" (phần tử là string).
- _.push('character.relations.marcus.trust', null, 5)
  LỖI (B3): Không thể "push" vào "character.relations.marcus.trust" vì nó là number, không phải mảng. Dùng _.set cho giá trị đơn.

GIÁ TRỊ THẬT ĐANG CÓ TRONG STATE:
- character.stats.hp = 20
- character.identity.race = "nguoi"
- character.stats.mana = chưa có
- character.relations.eleanor.trust = chưa có
- character.flags = []
- character.relations.marcus.trust = chưa có

SCHEMA HỢP LỆ CỦA CÁC PATH TRÊN:
- character.stats.hp: number · quyền ghi: engine
- character.identity.race: string · quyền ghi: locked
- character.stats.mana: KHÔNG có trong schema
- character.relations.eleanor.trust: number · quyền ghi: ai
- character.flags: array · quyền ghi: ai
- character.relations.marcus.trust: number · quyền ghi: ai

QUY TẮC:
- Path thuộc quyền 'engine' thì bạn KHÔNG được ghi. Muốn nó thay đổi, hãy mô tả trong truyện; engine sẽ tự tính.
- Path thuộc quyền 'locked' thì không ai ghi được.
- Mỗi op phải kèm lý do.
- Với _.set, tham số thứ hai phải là giá trị cũ ĐÚNG như trong state ở trên.

CHỈ trả lại khối <UpdateVariable> đã sửa. KHÔNG viết lại truyện, KHÔNG giải thích thêm.
```

