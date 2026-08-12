/**
 * Nơi DUY NHẤT đăng ký các slice gameplay.
 *
 * Slice không tự đăng ký lúc import: thứ tự import không phải hợp đồng, và
 * một slice biến mất vì cây import đổi là loại bug rất khó tìm. Gọi hàm này
 * một lần lúc khởi động, và trong test sau mỗi lần `slices.reset()`.
 */

import { knowledgeSlice } from '@/lore/knowledge';
import { bodySlice } from '@/systems/body/slice';
import { characterSlice } from '@/systems/character/slice';
import { skillsSlice } from '@/systems/skills/slice';
import { equipmentSlice, itemsSlice } from '@/systems/items/slice';
import { siegeSlice } from '@/systems/siege/slice';
import { holdingsSlice } from '@/systems/holding/slice';
import { titlesSlice } from '@/systems/titles/slice';
import { realmSlice, vassalsSlice } from '@/systems/realm/slice';
import { militarySlice } from '@/systems/military/slice';
import { campaignSlice } from '@/systems/campaign/slice';
import { nationsSlice, religionsSlice } from '@/systems/nations/slice';
import { economySlice } from '@/systems/economy/slice';
import { worldSlice } from '@/sim/slice';
import { codexSlice } from '@/systems/codex';
import { validateDerivedGraph } from './derived';
import { slices } from './slices';

export function registerGameSlices(): void {
  if (slices.get(characterSlice.id) === undefined) {
    slices.register(characterSlice);
  }
  if (slices.get(knowledgeSlice.id) === undefined) {
    slices.register(knowledgeSlice);
  }
  if (slices.get(codexSlice.id) === undefined) {
    slices.register(codexSlice);
  }
  // `body` đăng ký SAU `character`: biến phụ của nó đọc `character.stats.wil`,
  // và đồ thị phụ thuộc ở `validateDerivedGraph` dễ đọc hơn khi thứ tự đăng ký
  // trùng với thứ tự phụ thuộc (Phần 7 mục 2).
  if (slices.get(bodySlice.id) === undefined) {
    slices.register(bodySlice);
  }
  // `skills` đăng ký SAU `character`: biến phụ `taiHocTap` và `heSoCham` đọc
  // `character.skills` và `character.identity`, cùng lý do với `body` ở trên
  // (Phần 8 mục 10).
  if (slices.get(skillsSlice.id) === undefined) {
    slices.register(skillsSlice);
  }
  // HAI SLICE CỦA PHẦN 16 (mục 17), và `items` đăng ký TRƯỚC `equipment`: bản đồ
  // che phủ của `equipment` đọc `items.owned` để biết món đang mặc là món nào,
  // nên thứ tự đăng ký trùng thứ tự phụ thuộc — cùng lý do `body` đứng sau
  // `character`. Cả hai đứng sau `skills` vì chế tạo đọc tay nghề, và không
  // chiều nào đọc ngược: không kỹ năng nào phụ thuộc vào việc ngài đang mặc gì.
  if (slices.get(itemsSlice.id) === undefined) {
    slices.register(itemsSlice);
  }
  if (slices.get(equipmentSlice.id) === undefined) {
    slices.register(equipmentSlice);
  }
  // `siege` giữ TIẾNG TÀN BẠO của Phần 11 mục 7 — con số duy nhất của một cuộc
  // vây hãm phải sống lâu hơn chính cuộc vây hãm ấy, vì Phần 15 đọc nó khi tính
  // xem thành tiếp theo có chịu mở cổng không. Không có biến phụ nào, nên đăng ký
  // ở đâu trong danh sách này cũng được.
  if (slices.get(siegeSlice.id) === undefined) {
    slices.register(siegeSlice);
  }
  // `holdings` là tầng THÀNH TRÌ của Phần 12 — một ĐIỂM có toạ độ, tường, ô đất,
  // kho và dân đếm được. Tầng LÃNH THỔ của Phần 13 sẽ là một slice RIÊNG tên
  // `realm`, và mục 1 của Phần 12 cấm hai slice đọc thẳng vào nhau: chúng chỉ
  // trao đổi qua ba giao diện khai báo tường minh ở `holding/interfaces.ts`.
  // Không có biến phụ nào ở đây, nên đăng ký ở đâu trong danh sách cũng được.
  if (slices.get(holdingsSlice.id) === undefined) {
    slices.register(holdingsSlice);
  }
  // BA SLICE CỦA PHẦN 13, và ba cái tên riêng là cố ý (Phần 13 mục 10).
  //
  // `titles` đăng ký TRƯỚC `realm` và `vassals`: chính danh nằm ở `titles` và cả
  // hai slice kia đọc nó khi tính lòng trung với nguy cơ nổi loạn, nên thứ tự
  // đăng ký trùng với thứ tự phụ thuộc — cùng lý do `body` đứng sau `character`.
  //
  // `realm` KHÔNG đọc thẳng vào `holdings` (Phần 12 mục 1, Phần 13 mục 1): hai
  // tầng chỉ trao đổi qua ba giao diện khai ở `holding/interfaces.ts`, và bài
  // kiểm tra ranh giới ở `realm.test.ts` quét mã nguồn để giữ lời hứa ấy.
  if (slices.get(titlesSlice.id) === undefined) {
    slices.register(titlesSlice);
  }
  if (slices.get(realmSlice.id) === undefined) {
    slices.register(realmSlice);
  }
  if (slices.get(vassalsSlice.id) === undefined) {
    slices.register(vassalsSlice);
  }
  // Quân đội đứng sau lãnh thổ và thành trì: hàng tuyển đọc kho bạc ở tầng cai
  // trị cùng sức chứa doanh trại ở tầng thành, nhưng giữ state riêng để hai tầng
  // ấy không phải chép quân số của nhau.
  if (slices.get(militarySlice.id) === undefined) {
    slices.register(militarySlice);
  }
  // CHIẾN ĐỒ đứng ngay sau `military` vì nó đọc xuống chứ không đọc ngược: nó
  // giữ VỊ TRÍ của các đạo quân, còn QUÂN SỐ vẫn là của `military`, và không có
  // chiều nào chảy ngược lại — không ô đất nào trên bản đồ quyết định được một
  // đạo quân mạnh bao nhiêu.
  //
  // Nó KHÔNG thay `world-map.json` của Phần 15: bản đồ kia đo đường đi cho tin
  // tức, chiến đồ trả lời "đất này của ai". Hai bản đồ, hai câu hỏi, và cùng
  // mượn một bảng toạ độ gốc nên chúng không bao giờ lệch nhau về địa lý.
  // Không có biến phụ nào, nên chỗ đăng ký trong danh sách này là tuỳ ý.
  if (slices.get(campaignSlice.id) === undefined) {
    slices.register(campaignSlice);
  }
  // HAI SLICE CỦA PHẦN 14 (mục 7), và chúng đứng SAU cả ba slice của Phần 13 vì
  // tầng thế lực đọc xuống chứ không đọc ngược: tước vị quyết định người chơi ngồi
  // được vào bàn nào (`nations/access.ts`), còn không bảng quốc gia nào quyết định
  // ai là chư hầu của ai.
  //
  // `religions` đăng ký sau `nations`: uy tín Giáo hội sống trên BẢNG CỦA GIÁO
  // TRIỀU và bản đồ tôn giáo chỉ chép lại, nên thứ tự đăng ký trùng thứ tự nguồn
  // sự thật — cùng lý do `body` đứng sau `character`.
  if (slices.get(nationsSlice.id) === undefined) {
    slices.register(nationsSlice);
  }
  // Nền kinh tế đọc dân số chính trị, quan hệ, chiến tranh và ghi kết quả tài khóa
  // ngược về các chỉ số quốc lực, nên được đăng ký ngay sau `nations`.
  if (slices.get(economySlice.id) === undefined) {
    slices.register(economySlice);
  }
  if (slices.get(religionsSlice.id) === undefined) {
    slices.register(religionsSlice);
  }
  // SLICE CUỐI CÙNG CỦA DỰ ÁN (Phần 15 mục 10), và nó đứng SAU tất cả vì nó đọc
  // xuống tất cả: mô phỏng ngầm nghe biến cố của Phần 14 qua eventbus, tra vị trí
  // người chơi ở `knowledge.regionId` của Phần 4, và trả tin ngược lại vào chính
  // slice tri thức ấy. Không slice nào ở trên đọc ngược lên `world` — thế giới
  // chạy sau lưng người chơi, nó không phải một đầu vào của luật chơi nào cả.
  //
  // Biến phụ `banDoTriThuc` đọc `world.feed` chứ không đọc `knowledge`, nên thứ
  // tự đăng ký với `knowledgeSlice` ở đầu danh sách không tạo ra ràng buộc nào.
  if (slices.get(worldSlice.id) === undefined) {
    slices.register(worldSlice);
  }
  // Chu trình trong đồ thị biến phụ phải nổ ở đây, lúc khởi động, chứ không
  // phải giữa lượt chơi (Phần 2 mục 7).
  validateDerivedGraph();
}
