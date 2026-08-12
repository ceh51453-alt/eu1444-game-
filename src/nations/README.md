# nations

**Chủ sở hữu:** Phần 14 (và Phần 14b cho ba thế lực bổ sung).

Mỗi thế lực một thư mục, mỗi thế lực một minigame chính trị riêng. Tám thư mục,
tám thể loại — mục 1 nói thẳng: *nếu hai quốc gia chơi giống nhau thì một trong
hai làm sai*, và mục 10.5 nói cách tránh: **làm lần lượt, không làm chung một
component rồi đổi nhãn.**

| Thư mục | Thế lực | Thể loại |
|---|---|---|
| `ottoman/` | Đế quốc Orc | mười tám quân đoàn & chiêu mộ dị tộc |
| `byzantium/` | Đông La Mã | nội chiến & cầu viện |
| `swiss/` | Liên bang Núi | liên bang & xuất khẩu lính đánh thuê |
| `horde/` | Hãn quốc thảo nguyên | cống nạp & phân liệt |
| `hre/` | Đế quốc (La Mã Thần thánh) | cải cách đế chế |
| `france/` | Vương quốc Frank | tập quyền |
| `papacy/` | Giáo triều | mật nghị & quyền lực thiêng |
| `latin/` | Thành bang Latin | ngân hàng & lính đánh thuê |

`index.ts` ở thư mục này là sổ đăng ký, và nó cố tình MỎNG: một bảng tra
`kind → module`, không một dòng logic dùng chung nào. Một hàm `sharedYear()` xuất
hiện ở đây là dấu hiệu tám thể loại đang trôi về cùng một chỗ.

## Hợp đồng của một module

```ts
interface MinigameModule {
  kind: MinigameKind;
  name: string;
  create(seed): PowerBoard;              // hạt giống khai ở data/nations.json
  year(rng, context): MinigameYear;      // một năm
}
```

Hợp đồng chung DỪNG LẠI ở hai hàm ấy. Bên trong chúng là của riêng từng thể loại:
Orc có `corps.ts`, `devshirme.ts`, `tech.ts`; Đế quốc có bảng đếm phiếu; Thành bang
có sổ cái. Không thể loại nào mượn file của thể loại khác.

## Ba luật của một module

1. **KHÔNG đọc store, KHÔNG đọc slice.** Mọi thứ cần biết nằm trong
   `MinigameContext` — kể cả những sự thật do thế lực khác gây ra (`sanctions`,
   `heresyAlarms`, `dominantFaiths`, `campaignsWon`).
2. **KHÔNG sửa bảng của thế lực khác.** Muốn tác động thì phát `WorldEvent`, và
   bảng dội ở `data/diplomacy.json` quyết định nó thành cái gì ở nước kia.
3. **KHÔNG nhập barrel `@/systems/nations`** — chỉ nhập `types`, `data`, `events`.
   Nhập barrel là vòng import qua `year.ts`.

Nội dung (tên, tước vị, quân chủng, chủng tộc, số liệu khởi đầu) nạp từ
`/data/*.json` theo R5, không hardcode vào code ở đây.
