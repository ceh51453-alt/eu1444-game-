import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { registerLoreHandlers } from './lore/triggers';
import { registerGameSlices } from './state/register';
import { useGameStore } from './state/store';
import { registerBodyHandlers, registerBodySources } from './systems/body';
import { registerCheckSources } from './systems/check';
import { registerCharacterSources } from './systems/character';
import { registerSkillSources } from './systems/skills';
import { registerItemSources } from './systems/items';
import { registerDuelSources } from './minigames/duel';
import { registerBattleSources } from './minigames/battle';
import { registerSiegeSources } from './systems/siege';
import { registerTitleSources } from './systems/titles';
import { registerFactionSources } from './systems/factions';
import './index.css';

// Store dựng lúc import module, slice gameplay đăng ký ở đây — nên phải lấp
// lại defaults cho những slice vừa thêm.
registerGameSlices();
useGameStore.getState().ensureSlices();

// Handler của lorebook nghe trên eventbus (Phần 4 mục 10). Đăng ký ở đây để
// trigger có người nhận ngay từ lượt đầu tiên.
registerLoreHandlers();
// Handler của cơ thể nghe `body.requestInjury` (Phần 7 mục 3). Cùng lý do:
// một trigger bắn event mà không ai nghe thì lời đề nghị biến mất không dấu vết.
registerBodyHandlers();

// Nguồn modifier (Phần 5 mục 7). Phải xong TRƯỚC phép kiểm đầu tiên: một nguồn
// đăng ký muộn nghĩa là vài lượt đầu người chơi chịu một mức phạt khác hẳn phần
// còn lại của ván, mà không có gì trên màn hình nói ra điều đó.
registerCheckSources();
// Chỉ số và đặc tính chủng tộc (Phần 6 mục 10.7) — cùng lý do, cùng chỗ.
registerCharacterSources();
// Thương tích, đau, mất máu, sốt, vận động, tàn phế (Phần 7 mục 5). Đây là bộ
// nguồn lan rộng nhất: nó áp cả vào quản trị lãnh thổ và xã giao, không chỉ vào
// đánh nhau — nên thiếu nó thì cả hệ cơ thể chỉ còn là hình vẽ.
registerBodySources();
// Hiệu ứng của nhánh kỹ năng và của thế đang bật (Phần 8 mục 9). Đăng ký muộn
// hơn ba bộ trên là cố ý: chúng cộng LÊN nền mà chỉ số, đặc tính và thương tích
// đã dựng, và thứ tự đăng ký chính là thứ tự các dòng hiện ra cho người chơi.
registerSkillSources();
// Tay nghề món đang cầm, phạt vừa người, tải và phân bổ tải, phù phép (Phần 16
// mục 19 việc 12). Đứng NGAY SAU kỹ năng và TRƯỚC ba bộ minigame: trang bị là
// thứ người chơi mang theo vào mọi lượt, kể cả lượt không có trận nào — nên nó
// thuộc nhóm "ngài là ai", không thuộc nhóm "ngài vừa chọn gì".
registerItemSources();
// Thế trận, thể lực, tương khắc, hướng mặt, tầm với, địa hình, giáp — và phần
// chỉ số của miền `combat.*` mà Phần 6 cố ý để trống (Phần 9 mục 5, 6, 7).
// Đăng ký CUỐI vì mười một nguồn này chỉ nói được điều gì khi đang có một trận
// đấu mở; ngoài trận đấu chúng im lặng, và thứ tự cuối giữ cho bảng điều chỉnh
// đọc từ trên xuống theo đúng thứ tự "ngài là ai → ngài đang sao → ngài vừa
// chọn gì".
registerDuelSources();
// Đội hình, khắc chế, sĩ khí, đội ngũ, mệt mỏi, địa hình, thời tiết, ban đêm,
// cung đánh, chất lượng đơn vị, lòng trung của tướng (Phần 10 mục 6, 7, 8, 9).
// Sau Phần 9 vì cùng một lý do: mười một nguồn này chỉ nói được điều gì khi đang
// có một trận dã chiến mở, và thứ tự đăng ký chính là thứ tự các dòng hiện ra.
registerBattleSources();
// Cái đói, vệ sinh trại, tường thành, mật độ phòng thủ sau khi lùi lớp, cách vượt
// tường, mùa, TIẾNG TÀN BẠO, quân cứu viện, hạn nghĩa vụ, tương quan lực lượng,
// và bóng tối dưới đường hầm (Phần 11 mục 3, 5, 6, 7). Đăng ký sau Phần 10 vì
// cùng một lý do: mười một nguồn này chỉ nói được điều gì khi đang có một cuộc
// vây hãm mở — trừ đúng một nguồn, `siege.tieng-tan-bao`, vốn mang theo hệ quả
// của cuộc vây hãm TRƯỚC tới bàn đàm phán của cuộc vây hãm này.
registerSiegeSources();
// CHÍNH DANH (Phần 13 mục 5) — nguồn cuối cùng, và là nguồn duy nhất áp vào miền
// `rule.*`. Mục 5 gọi chính danh là "chỉ số trung tâm của Phần 13, ảnh hưởng gần
// như mọi kiểm định cai trị", và câu ấy chỉ đúng nếu nó đi qua registry: một kẻ
// tiếm quyền hỏng liên tục mọi phép kiểm mà không thấy dòng nào nói vì sao thì
// chỉ có thể kết luận là game ăn gian — và game này không có reroll.
registerTitleSources();
// Cấp bậc phe phái chỉ tác động xã giao/cai trị của phe đang hoạt động; mọi
// khoản cộng và phạt đều hiện thành dòng giải thích trong kết quả kiểm định.
registerFactionSources();

const container = document.getElementById('root');
if (container === null) {
  throw new Error('#root missing from index.html');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
