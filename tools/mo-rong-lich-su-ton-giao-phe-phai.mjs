/**
 * Sinh ba bộ lore chuyên sâu: lịch sử biến tấu, tôn giáo và phe phái năm 1444.
 * Chạy: node tools/mo-rong-lich-su-ton-giao-phe-phai.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'lorebooks');
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const religionsData = readJson(join(ROOT, 'data', 'religions.json'));
const nations = readJson(join(ROOT, 'data', 'nations.json')).nations;

const unique = (values) => [...new Set(values.map((value) => String(value).trim()).filter(Boolean))];
const slug = (value) => String(value).toLocaleLowerCase('vi').normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '');
const short = (value, max = 520) => {
  const text = String(value).replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const stop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('; '));
  return `${(stop > max / 2 ? cut.slice(0, stop + 1) : cut).trim()}…`;
};
const summarySource = (value) => String(value)
  .replace(/<%[\s\S]*?%>/g, '')
  .replace(/\[(?:Góc nhìn người trong đạo|Hồ sơ đối chiếu|Bản ghi nội bộ|Hồ sơ chính trị|BIÊN NIÊN|CANON LỊCH SỬ)[^\]]*\]/g, '')
  .trim();
const bundle = (books) => ({ kind: 'eu1444-lorebook', schemaVersion: 1, exportedAt: 0, books });
const entry = ({ id, title, type = 'concept', body, keys, semantic, priority = 8, weight = 11, constant = false }) => ({
  id, title, type, content: body, summary: short(summarySource(body)),
  keys: unique(keys), matchMode: 'wholeWord', caseSensitive: false, constant,
  embedding: { text: semantic, threshold: 0.17 }, knowledge: 'public', placement: 'block',
  role: 'system', weight, budgetPriority: priority, recurse: false, preventRecursion: false,
  triggerOnce: false,
});

// Mỗi mục khóa một xương sống lịch sử thật, rồi nói rõ phần Europa đã biến tấu.
const HISTORY = [
  {
    id: 'de-quoc-tay-sup-do', years: '376–476', anchor: 476,
    title: 'Đại di cư và sự sụp đổ của Đế quốc Tây La Mã',
    keys: ['Đại di cư', 'Tây La Mã', 'Rome thất thủ', '476', 'hậu La Mã'],
    real: 'Các nhóm Goth, Vandal, Frank và nhiều liên minh chiến binh vượt biên giới; năm 476, hoàng đế Tây La Mã cuối cùng bị phế. Quyền lực trung ương biến mất nhưng đường La Mã, thành thị, điền trang, luật viết và mạng lưới giám mục không cùng lúc biến mất.',
    twist: 'Trong Europa, “rợ” không phải một chủng tộc: các đoàn di cư gồm Teuton, Nhân Loại và nhiều cộng đồng khác. Ma pháp làm thành lũy tồn tại lâu hơn, nhưng cũng khiến vài vụ vỡ kết giới biến thành thảm họa; Giáo hội Tây phương giữ sổ đất, trường chép sách và nghi lễ bảo hộ khi quan lại bỏ đi.',
    legacy: 'Vì vậy quý tộc năm 1444 vừa nhận mình là hậu duệ chiến binh di cư, vừa thèm uy danh La Mã. Đế quốc La Mã Thần thánh, Giáo triều và Đông La Mã đều dựa vào ký ức này để tranh quyền kế thừa.'
  },
  {
    id: 'justinian-va-dai-dich', years: '527–565', anchor: 565,
    title: 'Justinian, cuộc tái chinh phục và Đại dịch đầu tiên',
    keys: ['Justinian', 'dịch Justinian', 'Corpus Juris', 'Lửa Hy Lạp', 'Đông La Mã'],
    real: 'Hoàng đế Justinian cố tái chiếm Ý và Bắc Phi, hệ thống hóa luật La Mã và dựng Hagia Sophia. Chiến tranh kéo dài cùng đại dịch từ năm 541 làm suy kiệt kho bạc, dân số và khả năng giữ những vùng vừa chiếm.',
    twist: 'Các pháp quan Đông La Mã đóng luật khế ước và luật pháp thuật vào cùng một bộ; thánh ca tập thể gia cố mái vòm Hagia Sophia. Đại dịch lại bám theo cả đường buôn lẫn dòng mana, nên phép chữa trị quá mức tại một thành có thể kéo bệnh sang thành khác.',
    legacy: 'Luật gia, Giáo hội Đông phương và triều Palaiologos vẫn viện dẫn bộ luật ấy. Người đời 1444 nhớ Justinian như bằng chứng rằng phép mạnh không cứu nổi một đế chế nếu thuế, hậu cần và nhân lực đã gãy.'
  },
  {
    id: 'nam-phuong-truong-thanh', years: '610–750', anchor: 750,
    title: 'Sự trỗi dậy của Nhất thần phương Nam',
    keys: ['Nhất thần phương Nam', 'caliph', 'Hồi giáo', 'Damascus', 'Baghdad', 'cuộc chinh phục phương Nam'],
    real: 'Một tôn giáo nhất thần mới thống nhất nhiều bộ lạc Arabia rồi mở rộng qua Levant, Ai Cập, Bắc Phi và Iberia. Các caliphate kế tiếp xây bộ máy thuế, luật, học thuật và mạng thương mại nối ba châu lục.',
    twist: 'Europa biến quá trình này thành một liên minh chính trị–đức tin đa chủng tộc; Orc nổi bật trong quân đội và triều chính nhưng không sinh ra đã theo đạo, còn người cải đạo thuộc mọi tộc đều có thể vào học viện, quân đoàn và thương hội. Pháp học quy định chặt ai được dùng loại ma thuật nào trước tòa.',
    legacy: 'Đến 1444, Ottoman thừa hưởng nhiều thiết chế phương Nam nhưng không đại diện cho toàn bộ đức tin. Việc đồng nhất mọi Orc với một tôn giáo, hay mọi tín đồ với Ottoman, là định kiến sai canon.'
  },
  {
    id: 'carolingian', years: '768–843', anchor: 843,
    title: 'Charlemagne và sự phân chia đế chế Carolingian',
    keys: ['Charlemagne', 'Carolus Magnus', 'Verdun', '843', 'Carolingian'],
    real: 'Charlemagne mở rộng vương quốc Frank, được Giáo hoàng đội vương miện hoàng đế năm 800 và thúc đẩy trường học cung đình. Hiệp ước Verdun năm 843 chia cơ nghiệp giữa các cháu, đặt nền xa cho Pháp, Đức và vùng tranh chấp ở giữa.',
    twist: 'Lễ đăng quang còn là khế ước ma pháp: Giáo triều trao tính hợp thức thiêng, hoàng đế hứa bảo vệ giáo sĩ và đường hành hương. Khi đế chế chia ba, mạng ấn tín cũng đứt ba, để lại các tu viện và thành trì tranh nhau những mảnh pháp quyền cũ.',
    legacy: 'Pháp, Đế quốc La Mã Thần thánh và Burgundy đều chọn phần có lợi trong ký ức Carolingian. Đây là gốc sâu của tranh chấp biên giới, tước hiệu và câu hỏi ai mới là người Frank “thật”.'
  },
  {
    id: 'ly-giao-1054', years: '1054', anchor: 1054,
    title: 'Đại Ly giáo Đông–Tây',
    keys: ['Đại Ly giáo', '1054', 'Đông Tây phân ly', 'Filioque', 'Giáo hội Đông phương'],
    real: 'Xung đột lâu dài về quyền tối thượng của Giáo hoàng, ngôn ngữ, nghi lễ và tín điều bùng thành các vạ tuyệt thông năm 1054. Đây không phải một ngày mọi liên hệ lập tức chấm dứt, mà là mốc biểu tượng của quá trình xa cách nhiều thế kỷ.',
    twist: 'Trong Europa, hai bên còn bất đồng về cách kiểm chứng phép lạ: Tây phương đặt thánh tích dưới quyền cấp phép tập trung, Đông phương xem thánh tượng và thánh ca của cộng đoàn là nguồn chứng thực. Cả hai cùng thờ một Chúa nhưng gọi phép của nhau là sai nghi lễ.',
    legacy: 'Đến 1444, ký ức cuộc cướp Constantinople năm 1204 khiến vết nứt sâu hơn thần học. Hiệp ước Florence 1439 tuyên bố hợp nhất trên giấy, nhưng phần lớn giáo sĩ và dân chúng Đông phương chưa chấp nhận.'
  },
  {
    id: 'norman-1066', years: '1066', anchor: 1066,
    title: 'Cuộc chinh phục Norman tại Anh',
    keys: ['1066', 'Hastings', 'William Kẻ Chinh Phục', 'Norman', 'Domesday'],
    real: 'William xứ Normandy thắng tại Hastings, thay tầng lớp cầm quyền Anglo-Saxon bằng quý tộc Norman và tổ chức kiểm kê tài sản quy mô lớn. Tiếng Pháp cung đình, tiếng Anh dân gian và Latin giáo sĩ cùng tồn tại.',
    twist: 'Nhà vua buộc các lãnh chúa khai cả quyền thu thuế, nghĩa vụ quân sự lẫn giếng mana và cổ vật bảo hộ. Những cộng đồng khác tộc vẫn là nông dân, thợ và lính như nhau; chủng tộc không tự động quyết định giai cấp.',
    legacy: 'Anh quốc năm 1444 có triều đình dùng văn hóa quý tộc Pháp nhưng đang chiến tranh với chính nước Pháp. Mọi yêu sách ngôi vua bên kia biển đều bắt rễ trong lịch sử hôn nhân và thừa kế này.'
  },
  {
    id: 'thap-tu-chinh', years: '1095–1291', anchor: 1291,
    title: 'Các cuộc Thập tự chinh phương Đông',
    keys: ['Thập tự chinh', 'Jerusalem', 'Đất Thánh', 'Hiệp sĩ dòng tu', '1095'],
    real: 'Từ lời kêu gọi năm 1095, nhiều đoàn viễn chinh Tây Âu đến Levant, lập các quốc gia thập tự rồi lần lượt mất chúng; Acre thất thủ năm 1291. Động cơ trộn đức tin, cứu rỗi, đất, nợ, thương mại và tham vọng dòng họ.',
    twist: 'Giáo triều cấp phép cho vài dòng hiệp sĩ dùng thánh thuật chiến trường; thương nhân Latin đổi vận tải lấy khu phố và đặc quyền cảng. Dân thường mọi chủng tộc chịu thuế, cướp bóc và đổi chính quyền, nên ký ức địa phương khác hẳn anh hùng ca Tây phương.',
    legacy: 'Năm 1444, “thập tự chinh” vẫn là công cụ ngoại giao và thuế khóa, nhưng Varna cho thấy lời thề chung không xóa cạnh tranh chỉ huy, hậu cần kém hay lợi ích riêng.'
  },
  {
    id: 'magna-carta', years: '1215–1295', anchor: 1295,
    title: 'Đại Hiến chương và sự lớn dần của nghị hội',
    keys: ['Magna Carta', 'Đại Hiến chương', 'Nghị viện Anh', '1215', 'đại hội đẳng cấp'],
    real: 'Năm 1215, các nam tước ép vua John chấp nhận rằng thuế và giam giữ phải chịu giới hạn pháp lý; văn kiện nhiều lần được tái ban. Trong thế kỷ XIII, hội đồng quý tộc, giáo sĩ và đại diện thị trấn phát triển thành nghị viện.',
    twist: 'Khế ước được niêm bằng ấn thường lẫn ấn ma pháp, nhưng không phải bản tuyên ngôn bình đẳng hiện đại: nông dân và phần lớn phụ nữ không có tiếng nói trực tiếp. Các cộng đồng phi Nhân Loại giành quyền theo tư cách thành phố, nghiệp đoàn hoặc chư hầu, không theo “quyền chủng tộc” thống nhất.',
    legacy: 'Đến 1444, nhà vua Anh cần Nghị viện cấp thuế cho chiến tranh. Viện dẫn Magna Carta thường là vũ khí của giới có đặc quyền chống lạm quyền, chứ chưa phải dân chủ phổ thông.'
  },
  {
    id: 'constantinople-1204', years: '1204–1261', anchor: 1261,
    title: 'Cuộc Thập tự chinh thứ tư và vết thương Constantinople',
    keys: ['1204', 'Thập tự chinh thứ tư', 'Constantinople bị cướp', 'Đế quốc Latin'],
    real: 'Đoàn Thập tự chinh thứ tư đổi hướng và cướp Constantinople năm 1204, lập Đế quốc Latin. Đông La Mã giành lại kinh đô năm 1261 nhưng không hồi phục hoàn toàn nhân lực, kho tàng và mạng thương mại.',
    twist: 'Nhiều thư viện ma pháp, thánh tích và lõi kết giới bị phá, bán hoặc đưa sang Tây Âu. Vì các mảnh bị tách khỏi nghi lễ gốc, một số trở thành cổ vật nguy hiểm; Venice và các nhà sưu tầm vẫn giữ bí mật nguồn gốc.',
    legacy: 'Người Đông phương năm 1444 có lý do chính trị cụ thể để nghi ngờ cứu viện Tây phương. Họ có thể sợ Ottoman mà vẫn phản đối hợp nhất giáo hội do hoàng đế ký.'
  },
  {
    id: 'mongol', years: '1237–1242', anchor: 1242,
    title: 'Các cuộc xâm lược Mông Cổ và trật tự thảo nguyên',
    keys: ['Mông Cổ', 'Hãn quốc', 'Horde', 'Batu', 'Legnica', 'Mohi'],
    real: 'Các đạo quân Mông Cổ đánh Rus, Ba Lan và Hungary bằng kỷ luật, trinh sát, tín hiệu, kỵ xạ và mạng trạm ngựa. Sau khi rút khỏi Trung Âu, các hãn quốc vẫn thu cống và chi phối Rus nhiều thế hệ.',
    twist: 'Mã Nhân trong các đội quân có hình người hai chân, tai và đuôi ngựa; họ vẫn cưỡi ngựa thật, không có thân ngựa và không phải nhân mã. Kỹ năng liên lạc, chịu đường dài và đọc tín hiệu khiến họ nổi bật, nhưng quân thảo nguyên còn gồm nhiều tộc khác.',
    legacy: 'Các công quốc Rus học thuế, sứ trạm và chiến thuật từ chính kẻ thống trị; Hungary củng cố thành đá. Năm 1444, Đại Trướng suy yếu thành nhiều hãn quốc cạnh tranh chứ không còn một khối duy nhất.'
  },
  {
    id: 'thap-tu-phuong-bac', years: '1198–1410', anchor: 1410,
    title: 'Thập tự chinh phương Bắc và Dòng Teuton',
    keys: ['Thập tự chinh phương Bắc', 'Dòng Teuton', 'Baltic', 'Grunwald', 'Tannenberg'],
    real: 'Các dòng hiệp sĩ và vương quyền Cơ Đốc chinh phục, cải đạo và định cư tại vùng Baltic. Dòng Teuton dựng một nhà nước quân sự–tu viện; thất bại lớn trước Ba Lan–Litva tại Grunwald/Tannenberg năm 1410 làm suy thế.',
    twist: 'Tín ngưỡng Cổ Baltic có đền, tư tế, lịch lễ và pháp quyền công khai, khác tàn dư tín ngưỡng rừng ở phương Tây. Việc nhiều Lâm Tiên và Mộc Tinh giữ rừng thiêng khiến chiến tranh vừa là cải đạo vừa là tranh gỗ, hổ phách và nút mana.',
    legacy: 'Năm 1444, Dòng Teuton bị ép bởi nợ và các đô thị Phổ; Liên hiệp Phổ đã hình thành từ 1440. Xung đột không thể giản lược thành “người tốt chống quái vật ngoại đạo”.'
  },
  {
    id: 'lien-bang-thuy-si', years: '1291–1444', anchor: 1291,
    title: 'Sự hình thành Cựu Liên minh Thụy Sĩ',
    keys: ['Thụy Sĩ', '1291', 'Morgarten', 'Sempach', 'các bang núi'],
    real: 'Các cộng đồng Uri, Schwyz và Unterwalden liên minh bảo vệ quyền tự trị; thắng lợi tại Morgarten 1315 và Sempach 1386 làm liên minh có uy tín. Thành thị và bang nông thôn vẫn xung đột lợi ích.',
    twist: 'Địa đạo và pháo đài Lùn Núi hỗ trợ phòng thủ đèo nhưng không biến liên minh thành “quốc gia của Lùn”. Hội đồng là liên minh đa cộng đồng; mỗi bang giữ luật, thuế và cả quy chế ma pháp riêng.',
    legacy: 'Năm 1444, Chiến tranh Zürich Cũ đang chia rẽ liên minh. Danh tiếng lính giáo Thụy Sĩ tăng nhanh, trong khi câu hỏi ai kiểm soát đường đèo và tiền lính thuê vẫn chưa có đáp án chung.'
  },
  {
    id: 'tram-nam', years: '1337–1444', anchor: 1337,
    title: 'Chiến tranh Trăm Năm đến đình chiến Tours',
    keys: ['Chiến tranh Trăm Năm', 'Crécy', 'Poitiers', 'Agincourt', 'Jeanne d’Arc', 'Tours'],
    real: 'Yêu sách ngai Pháp của Edward III mở chuỗi chiến tranh từ 1337. Anh thắng lớn tại Crécy 1346, Poitiers 1356 và Agincourt 1415; Hiệp ước Troyes 1420 gạt thái tử Pháp, nhưng Jeanne d’Arc giúp xoay cục diện năm 1429. Theo lịch sử ngoài đời và hồ sơ công khai trong thế giới, bà bị xử tử tại Rouen năm 1431; đình chiến Tours ký năm 1444.',
    twist: 'Điểm phân kỳ canon: Jeanne được giải cứu khỏi ngục trước buổi hành hình; một hình nhân thánh thuật không có sự sống cháy trên giàn nên không ai chết thế. Năm 1436 bà xuất hiện dưới tên Jeanne des Armoises. Phần đông dân chúng cho rằng đó là kẻ mạo danh, nhưng sự thật cấp hệ thống xác nhận đây chính là Jeanne d’Arc, còn sống ở tuổi ba mươi hai vào năm 1444. Nguồn năng lực của bà vẫn bị Giáo triều, Pháp và Burgundy diễn giải khác nhau.',
    legacy: 'Pháp của Charles VII đang tái tổ chức thuế và quân thường trực; Anh của Henry VI giữ yêu sách nhưng tài chính và phe triều đình rạn nứt. Đình chiến là khoảng thở, không phải hòa bình vĩnh viễn.'
  },
  {
    id: 'dai-dich-hac-tu', years: '1347–1352', anchor: 1352,
    title: 'Cái Chết Đen và biến đổi xã hội',
    keys: ['Cái Chết Đen', 'dịch hạch', '1348', 'Black Death', 'thiếu lao động'],
    real: 'Dịch hạch lan theo cảng và đường bộ, giết một phần rất lớn dân số châu Âu. Thiếu lao động làm tiền công tăng, nhiều thái ấp bỏ hoang, nhà chức trách ban luật ghìm lương và tìm vật tế thần.',
    twist: 'Phép chữa trị cứu được từng người nhưng không đủ thầy thuốc, mana và hiểu biết để chặn dịch; nghi lễ tụ tập đôi khi còn làm lây lan. Một số Huyết Tộc tránh được bệnh nhưng mất nguồn máu an toàn, khiến họ vừa bị nghi ngờ vừa phải bí mật bảo vệ cộng đồng sống.',
    legacy: 'Đến 1444, ký ức dịch vẫn nằm trong luật lương, giá đất, hội huynh đệ và nỗi sợ người ngoài. Dị giáo Áo Vải lớn mạnh đặc biệt nơi giáo sĩ giàu có bị cho là đã bỏ dân nghèo trong khủng hoảng.'
  },
  {
    id: 'giao-hoang-avignon', years: '1309–1417', anchor: 1417,
    title: 'Avignon, hai Giáo hoàng và Công đồng',
    keys: ['Avignon', 'Đại Ly giáo Tây phương', 'hai Giáo hoàng', 'Công đồng Constance', 'chủ nghĩa công đồng'],
    real: 'Giáo hoàng cư trú tại Avignon từ 1309 đến 1377; sau đó các phe bầu những Giáo hoàng đối địch trong cuộc Đại Ly giáo Tây phương 1378–1417. Công đồng Constance chấm dứt phần lớn khủng hoảng và khẳng định vai trò công đồng.',
    twist: 'Mỗi triều Giáo hoàng cấp ấn phép, chức sắc và án tuyệt thông riêng, khiến cùng một thánh tích có hai giấy chứng thực. Vùng chịu hai hệ thuế giáo hội là nơi dị giáo và huyền học ngầm phát triển mạnh nhất.',
    legacy: 'Năm 1444, Giáo hoàng Eugene IV còn đối đầu Công đồng Basel; phe công đồng đã bầu Felix V làm đối Giáo hoàng. Giáo hội Tây phương đã thống nhất hơn trước nhưng tranh luận “Giáo hoàng hay Công đồng tối cao” chưa chết.'
  },
  {
    id: 'kalmar', years: '1397–1444', anchor: 1397,
    title: 'Liên minh Kalmar và bài toán ba vương quốc',
    keys: ['Kalmar', 'Margaret I', 'Đan Mạch', 'Thụy Điển', 'Na Uy'],
    real: 'Từ năm 1397, Đan Mạch, Na Uy và Thụy Điển chung một quân vương nhưng giữ hội đồng, luật và lợi ích riêng. Thuế, bổ nhiệm người Đan Mạch và quan hệ với Hanse liên tục gây phản kháng tại Thụy Điển.',
    twist: 'Các tuyến biển lạnh cần Hoa Tiên thời tiết, Hải Tộc hoa tiêu và hải đăng rune, khiến vương quyền không thể chỉ dựa vào quý tộc đất liền. Không cộng đồng nào độc quyền lòng trung thành với một vương quốc.',
    legacy: 'Năm 1444, Christopher xứ Bavaria đội ba vương miện, nhưng di sản nổi dậy Engelbrekt còn nóng. Liên minh là một khế ước triều đại dễ vỡ, chưa phải quốc gia tập quyền thống nhất.'
  },
  {
    id: 'ottoman-troi-day', years: '1299–1444', anchor: 1299,
    title: 'Sự trỗi dậy của Ottoman',
    keys: ['Ottoman trỗi dậy', 'Kosovo', 'Nicopolis', 'Murad II', 'Varna'],
    real: 'Từ một beylik biên giới Anatolia, Ottoman vượt sang Balkan, thắng tại Kosovo 1389 và Nicopolis 1396, rồi khôi phục sau thất bại trước Timur năm 1402. Murad II củng cố lại quyền lực và thắng liên quân tại Varna năm 1444.',
    twist: 'Triều Ottoman do nhiều gia tộc Orc giữ vai trò trung tâm nhưng cai trị dân đa tộc, đa đạo qua thuế, tòa địa phương, timar và lực lượng phục vụ triều đình. Kỷ luật pháo binh, công binh và hậu cần quan trọng ngang ma pháp Hỏa; sức mạnh không đến từ “bản tính Orc”.',
    legacy: 'Cuối năm 1444, Mehmed II vẫn là sultan trên danh nghĩa; Murad II được gọi khỏi nơi lui về để trực tiếp chỉ huy tại Varna rồi lại rời triều. Việc quân đội và đại thần có thể ép đổi người cầm quyền cho thấy kế vị chưa ổn; không kể lần Murad trở lại năm 1446 như chuyện đã xảy ra.'
  },
  {
    id: 'ba-lan-litva', years: '1385–1440', anchor: 1385,
    title: 'Liên minh Ba Lan–Litva và chiến thắng Grunwald',
    keys: ['Krewo', 'Ba Lan Litva', 'Jagiełło', 'Grunwald', '1410'],
    real: 'Liên minh Krewo 1385 gắn Jogaila của Litva với vương miện Ba Lan và quá trình Cơ Đốc hóa chính thức. Liên quân Ba Lan–Litva đánh bại Dòng Teuton tại Grunwald năm 1410 nhưng không xóa ngay nhà nước Dòng tu.',
    twist: 'Việc cải đạo diễn ra không đồng đều: thành và triều đình theo Giáo hội Tây phương, nhiều làng Baltic giữ lịch lễ cũ, vùng Ruthenia theo Đông phương. Lâm Tiên, Mộc Tinh và Nhân Loại có thể đứng ở cả hai phía vì đất, họ hàng hoặc đức tin.',
    legacy: 'Năm 1444, Đại công tước Casimir cai Litva trong khi ngai Ba Lan trống sau cái chết của Władysław III tại Varna. Liên minh là mạng thỏa thuận giữa hai tầng lớp quý tộc, chưa phải một nhà nước duy nhất.'
  },
  {
    id: 'hussite', years: '1415–1436', anchor: 1436,
    title: 'Jan Hus, chiến tranh Hussite và Phong trào Áo Vải',
    keys: ['Jan Hus', 'Hussite', 'Tábor', 'xe chiến', 'Áo Vải', 'Bohemia'],
    real: 'Jan Hus bị xử tử tại Constance năm 1415; nổi dậy Bohemia từ 1419 đánh bại nhiều cuộc thập tự bằng xe chiến, pháo tay và tổ chức cộng đồng. Hiệp ước Basel 1436 công nhận một số nhượng bộ cho phe ôn hòa.',
    twist: 'Phong trào Áo Vải là nhánh Europa tổng hợp từ cải cách nghèo khó kiểu Waldensian và động lực Hussite; họ phản đối tài sản giáo sĩ, buôn ân xá và độc quyền nghi lễ. Vòng xe được khắc dấu triệt phép để giảm ưu thế của kỵ sĩ và pháp sư quý tộc.',
    legacy: 'Năm 1444, Bohemia không còn chiến tranh toàn diện nhưng tín đồ ôn hòa, cấp tiến, quý tộc Công giáo và lính đánh thuê cũ vẫn cạnh tranh. Áo Vải không đồng nhất với Phái Thanh Tẩy nhị nguyên.'
  },
  {
    id: 'phuc-hung-ngan-hang-in', years: '1300–1444', anchor: 1440,
    title: 'Ngân hàng, Phục hưng và kỹ thuật in sơ kỳ',
    keys: ['Phục hưng', 'Medici', 'ngân hàng', 'in chữ rời', 'Mainz', 'nhân văn'],
    real: 'Các thành Ý phát triển tín dụng, sổ kép, bảo hiểm biển và bảo trợ nghệ thuật; học giả nhân văn săn bản thảo cổ. Khoảng thập niên 1440, thợ Mainz thử hệ chữ rời kim loại, nhưng sách chép tay vẫn thống trị.',
    twist: 'Khế ước ma pháp khiến ngân hàng phải thuê công chứng viên biết phát hiện sửa mực và lời thề giả. Chữ rune khó chuẩn hóa hơn alphabet nên in ấn tăng chậm; thợ Lùn và Gnome giữ bí quyết hợp kim nhưng không một tộc nào độc quyền phát minh.',
    legacy: 'Năm 1444, tri thức mới lưu thông qua thư, xưởng chép, đại học và mạng thương nhân hơn là “truyền thông đại chúng”. Không dùng từ hiện đại hay cho nhân vật biết trước cuộc cách mạng in sẽ lớn đến đâu.'
  },
  {
    id: 'iberia-1444', years: '711–1444', anchor: 1444,
    title: 'Reconquista và Iberia trước hồi kết',
    keys: ['Reconquista', 'Granada', 'Castile', 'Aragon', 'Portugal', 'Iberia'],
    real: 'Nhiều thế kỷ chiến tranh, triều cống, liên minh chéo và định cư làm các vương quốc Cơ Đốc mở rộng về nam. Đến 1444, Granada vẫn là vương quốc Nasrid độc lập; Castile, Aragon và Portugal là các nhà nước riêng với khủng hoảng riêng.',
    twist: 'Biên giới có cộng đồng nói nhiều tiếng và theo nhiều đức tin; pháp sư, thợ, nông dân và quý tộc có thể đổi chủ mà không đổi ngay bản sắc. Các hiệp ước bảo hộ đền, nhà thờ và giếng mana thường bị phá khi triều đại đổi.',
    legacy: 'Không đưa sự kiện 1492 vào hiện tại như điều đã biết. Người năm 1444 có thể hy vọng chinh phục Granada hoặc tìm đường biển mới, nhưng kết quả vẫn là tương lai mở.'
  },
  {
    id: 'varna-1444', years: '10 tháng 11 năm 1444', anchor: 1444,
    title: 'Trận Varna và điểm mở màn chiến dịch',
    keys: ['Varna', 'Władysław III', 'John Hunyadi', 'Murad II', '1444'],
    real: 'Liên quân do vua Władysław III của Ba Lan–Hungary và John Hunyadi chỉ huy bị Murad II đánh bại gần Varna; nhà vua tử trận. Thất bại phá hy vọng đẩy Ottoman khỏi Balkan trong ngắn hạn và gây khủng hoảng kế vị.',
    twist: 'Các đội quân đa tộc chiến đấu theo quốc gia, lời thề và tiền lương chứ không chia thành “loài người chống Orc”. Sương ma pháp và thánh thuật có tác động cục bộ, nhưng cuộc xung phong nóng vội, đội hình vỡ và phối hợp kém vẫn quyết định thảm họa.',
    legacy: 'Đây là hiện tại sống của Europa: Hungary tranh người nhiếp chính, Ba Lan trống ngôi, Ottoman lấy lại uy thế, Constantinople mất một hy vọng cứu viện. Tin đồn về số phận nhà vua có thể khác nhau, nhưng canon xác nhận ông đã chết.'
  }
];

const historyEntries = HISTORY.map((item) => {
  const header = `<% const daQua = Math.max(0, now.year - ${item.anchor}); %>[BIÊN NIÊN ${item.years} · nhìn từ năm <%= now.year %> · cách mốc khoảng <%= daQua %> năm]`;
  const body = `${header}\n\nXương sống lịch sử ngoài đời: ${item.real}\n\nĐiểm biến tấu của Europa: ${item.twist}\n\nDi sản và giới hạn tri thức năm 1444: ${item.legacy}`;
  return entry({ id: `history_${item.id}`, title: `${item.years} · ${item.title}`, type: 'event', body,
    keys: [...item.keys, item.title], semantic: `${item.title}. ${item.real} ${item.twist} ${item.legacy}`, priority: 9, weight: 13 });
});
historyEntries.unshift(entry({
  id: 'history_quy-tac-canon', title: 'Quy tắc lịch sử biến tấu của Europa', constant: true,
  body: `<% const nam = now.year; %>[CANON LỊCH SỬ · năm <%= nam %>] Europa bám niên đại, nhân vật, chiến tranh, dịch bệnh, thương mại và thiết chế có thật đến năm 1444. Ma pháp và các chủng tộc làm thay đổi cách sự kiện diễn ra, không xóa hậu cần, mùa vụ, luật thừa kế hay đấu tranh giai cấp. Không chủng tộc nào đồng nhất với một quốc gia, tôn giáo, nghề hoặc giai cấp. Không kể sự kiện sau 1444 như kết cục đã định; người trong thế giới chỉ có dự đoán, lời sấm hoặc tin đồn. Khi nguồn cũ xung đột, sách chuyên sâu 81–83 và dữ liệu canon hiện hành được ưu tiên.`,
  keys: ['lịch sử Europa', 'niên biểu', 'canon lịch sử', 'năm 1444'],
  semantic: 'quy tắc canon lịch sử thật biến tấu ma pháp chủng tộc niên đại không biết tương lai', priority: 10, weight: 15,
}));
writeFileSync(join(OUT, '81-lich-su-bien-tau.json'), `${JSON.stringify(bundle([{
  id: 'book-lich-su-bien-tau', name: 'Europa 1444 · Lịch sử ngoài đời được biến tấu', version: 1,
  scope: { kind: 'global' }, enabled: true, autoScope: false, priority: 5, entries: historyEntries,
}]), null, 2)}\n`);

const RELIGION_PROFILES = {
  'rel_giao-hoi': {
    model: 'Công giáo Latin thế kỷ XV, nhưng tên canon là Giáo hội Tây phương để không lẫn với Chính thống giáo Đông phương.',
    doctrine: 'Một Chúa, cứu rỗi qua đức tin, bí tích và cộng đồng Giáo hội. Kinh điển Latin, thánh tích và phép lạ được thẩm tra; ma pháp không có phép bị xếp vào huyền thuật, mê tín hoặc tà thuật tùy mức nguy hiểm.',
    institution: 'Giáo hoàng đứng đầu; dưới là hồng y, tổng giám mục, giám mục, giáo xứ, tu viện và các dòng hành khất. Giáo luật, tòa riêng, thuế thập phân, đất của tu viện và quyền bổ nhiệm làm Giáo hội vừa thiêng liêng vừa là đại thế lực kinh tế.',
    life: 'Dân thường sống theo chuông nhà thờ, lịch lễ, ngày chay, rửa tội, hôn phối, xưng tội và tang lễ. Đức tin chân thành có thể cùng tồn tại với bùa dân gian; giáo sĩ địa phương thường khoan dung hơn văn bản của Giáo triều.',
    crisis: 'Năm 1444, Eugene IV đối đầu phe Công đồng Basel và đối Giáo hoàng Felix V. Buôn ân xá, giáo sĩ giữ nhiều bổng lộc và ký ức hai Giáo hoàng nuôi Phong trào Áo Vải; đáp án không chỉ là đàn áp mà còn có cải cách và giảng đạo.'
  },
  'rel_ly-giao': {
    model: 'Chính thống giáo Đông phương với các tòa thượng phụ và truyền thống Byzantine–Slav.',
    doctrine: 'Cùng nền Kitô giáo với Tây phương nhưng khác quyền Giáo hoàng, vài công thức tín điều và nghi lễ. Thánh tượng không bị coi là thần; chúng là cửa sổ cầu nguyện. Thánh ca, hương, ánh sáng và phụng vụ cộng đồng dẫn ma lực chữa lành và bảo hộ.',
    institution: 'Các tòa thượng phụ và giáo hội địa phương có mức tự trị cao; Constantinople giữ địa vị danh dự nhưng không cai mọi nơi như một quân chủ. Giám mục thường độc thân, linh mục giáo xứ có thể đã kết hôn trước khi thụ phong; tu viện là trung tâm chữ viết và đất đai.',
    life: 'Lịch lễ, ăn chay, kính thánh tượng và nghi thức gia đình định nhịp sống. Một làng có thể giữ tập tục tổ tiên bên dưới lớp nghi lễ Đông phương mà không tự xem mình là dị giáo.',
    crisis: 'Hiệp ước Florence 1439 tuyên bố hợp nhất với Rome để đổi cứu viện, nhưng phe chống hợp nhất xem đó là bán đức tin. Ottoman tiến sát Constantinople; ở Rus, các giáo sĩ ngày càng nghĩ trung tâm tinh thần có thể chuyển về phía bắc.'
  },
  'rel_da-than': {
    model: 'Tổng hợp các tín ngưỡng dân gian Celt, Germanic, Slav và thờ tự nhiên đã bị đẩy khỏi thể chế nhà nước.',
    doctrine: 'Không có một kinh chung hay giáo chủ. Thần sông, thần rừng, tổ tiên, mùa màng và sinh vật bảo hộ được hiểu theo địa phương; lời thề có giá trị vì cộng đồng và nơi thiêng chứng giám.',
    institution: 'Người giữ lễ có thể là trưởng làng, bà đỡ, dược sư, tu sĩ rừng hoặc gia đình trông coi miếu. Quyền lực phân tán giúp tín ngưỡng sống dai nhưng khó tập hợp chống một giáo hội có văn thư và quân đội.',
    life: 'Lễ hạ chí, thu hoạch, cưới, sinh và tang gắn với cây, giếng, đá hoặc bếp. Nhiều tín đồ vẫn dự lễ nhà thờ để tránh rắc rối; ranh giới giữa tập tục và ngoại đạo thay đổi theo thái độ linh mục.',
    crisis: 'Ở Tây và Trung Europa, đây chủ yếu là mạng tục lệ kín hoặc bán kín. Không đồng nhất nó với nhánh Baltic còn đền công khai, tư tế và chỗ dựa chính trị.'
  },
  'rel_thao-nguyen': {
    model: 'Thiên tín kiểu Tengri, thờ Trời Cao, tổ tiên và linh hồn cảnh quan.',
    doctrine: 'Trời trao vận mệnh cho hãn nhưng có thể rút lại nếu ông thất bại; đất, nước, lửa và tổ tiên đòi sự tôn trọng. Đức tin thực dụng, ít giáo điều độc quyền và dễ cùng tồn tại với Phật giáo, Kitô giáo Đông phương hoặc Nhất thần phương Nam.',
    institution: 'Không có giáo hội trung ương. Pháp sư–thầy lễ chữa bệnh, bói điềm và dẫn tang; hãn và trưởng thị tộc tài trợ nghi lễ để hợp thức quyền lực. Hội nghị quý tộc chọn người cầm quyền quan trọng hơn một lễ đăng quang cố định.',
    life: 'Lời thề dưới trời, kiêng làm bẩn nước, cúng sữa và tưởng nhớ tổ tiên theo nhịp di cư. Mã Nhân thường hiện diện nhưng vẫn cưỡi ngựa thật và không đại diện cho mọi tín đồ thảo nguyên.',
    crisis: 'Đại Trướng phân rã làm mỗi hãn diễn giải thiên mệnh theo lợi ích mình. Cải đạo sang Nhất thần phương Nam tăng ở Crimea và Kazan nhưng không xóa tập tục Thiên tín ngay trong một thế hệ.'
  },
  'rel_nam-phuong': {
    model: 'Hồi giáo Sunni thế kỷ XV được fantasy hóa dưới tên Nhất thần phương Nam.',
    doctrine: 'Một Chúa duy nhất, mặc khải thành kinh, cầu nguyện theo giờ, bố thí, chay và hành hương. Luật tôn giáo phân biệt điều bắt buộc, được phép và cấm; bùa, chiêm tinh hay ma thuật được xét theo mục đích và trường phái pháp học, không mặc định cùng một án.',
    institution: 'Không có một “giáo hoàng phương Nam”. Ulema, qadi, trường học, quỹ waqf, giáo đường và các đoàn Sufi tạo mạng quyền lực; sultan cần học giả hợp thức hóa nhưng cũng tài trợ và kiểm soát họ.',
    life: 'Chợ dừng theo giờ cầu nguyện ở đô thị sùng đạo; hợp đồng, cưới, thừa kế và từ thiện đi qua qadi hoặc cộng đồng. Dân được bảo hộ theo đạo khác giữ nơi thờ tự và luật gia đình đổi lấy thuế và sự phục tùng chính trị.',
    crisis: 'Ottoman năm 1444 đang cân bằng luật tôn giáo với lệ triều đình và nhu cầu cai Balkan đa đạo. Orc không sinh ra đã theo đạo; cải đạo là lựa chọn gia đình, chính trị hoặc cá nhân như ở mọi tộc khác.'
  },
  'rel_lo-ren': {
    model: 'Đức tin nghề nghiệp fantasy của cộng đồng thợ mỏ và thợ thủ công, mang nét hội kín nghề Trung Cổ.',
    doctrine: 'Sáng tạo bền vững là hành vi thiêng; một vật tốt giữ lời của người làm ra nó. Tội nặng nhất là giấu lỗi có thể giết người, bỏ việc đã thề hoàn thành hoặc phá công trình còn phục vụ cộng đồng.',
    institution: 'Lò chung, nghiệp đoàn, bậc thầy và người giữ mẫu chuẩn thay cho giáo sĩ chuyên nghiệp. Tranh chấp giáo lý được giải bằng kiểm tra tay nghề, ký hiệu thợ và lời chứng của xưởng.',
    life: 'Lễ nhập nghề, đặt tên công cụ, bữa ăn hoàn công và tang lễ trả kim loại về lò là nghi thức chính. Người ngoài tộc Lùn vẫn có thể theo nếu được nhận vào truyền thống nghề.',
    crisis: 'Giáo hội Tây phương thường dung hòa vì Lò Rèn không chủ động truyền đạo. Xung đột lớn nhất là giữa nghiệp đoàn muốn giữ bí quyết và vương quyền muốn trưng dụng thợ, mỏ cùng đại bác.'
  },
  'rel_to-tien': {
    model: 'Thờ tổ tiên và đạo lý thị tộc, không phải một hệ thống thần học thống nhất.',
    doctrine: 'Người chết tiếp tục có quyền đòi nhớ tên, giữ lời thề và bảo hộ hậu duệ. Danh dự là món nợ liên thế hệ; một cá nhân có thể thay tín điều công khai mà vẫn giữ bàn thờ gia đình.',
    institution: 'Gia trưởng, hội đồng dòng họ, người giữ gia phả và pháp sư gọi hồn chia quyền. Không có giáo chủ ngoài thị tộc; luật thừa kế và trả thù máu thường mạnh hơn lời răn phổ quát.',
    life: 'Bữa cúng, kể gia phả, nuôi trẻ mồ côi cùng họ và chôn cất đúng nghi thức là trung tâm. Hồn ma có thật trong canon nhưng không phải mọi lời “tổ tiên phán” đều đáng tin; giả mạo điềm là một thủ đoạn chính trị.',
    crisis: 'Đô thị hóa và quân dịch kéo người trẻ khỏi thị tộc; các giáo hội nhất thần tìm cách biến thờ tổ thành tưởng niệm. Mâu thuẫn thường xảy ra quanh hôn nhân ngoài họ, quyền góa phụ và của cải không người kế.'
  },
  'rel_huyen-hoc': {
    model: 'Mạng trường phái bí truyền lấy cảm hứng từ Hermetic, Kabbalah, giả kim và pháp thuật dân gian.',
    doctrine: 'Vũ trụ có tương ứng giữa sao, nguyên tố, tên thật và hình học; tri thức nguy hiểm phải truyền từng cấp. Đây không phải một tôn giáo duy nhất mà là nhiều dòng thầy–trò có thể vẫn giữ đức tin công khai khác.',
    institution: 'Tế bào nhỏ, mật danh, bản thảo mã hóa và lời thề thay cho nhà thờ. Đại học, triều đình, xưởng giả kim và cộng đồng lưu vong đều có thể che một nhóm; hai trường phái thường bất đồng mạnh hơn người ngoài tưởng.',
    life: 'Thành viên giữ nghề bình thường để sinh sống, luyện vào đêm hoặc trong phòng kín. Vật liệu đắt, sai một nét có thể gây thương tích; ma pháp không phải lối tắt bỏ qua lao động và tiền bạc.',
    crisis: 'Giáo hội và nhà nước vừa truy bức vừa bí mật thuê họ. Nguy cơ lớn nhất là một người bảo trợ thất thế để lộ toàn mạng, hoặc một trường phái dùng tai nạn làm cớ thanh trừng đối thủ.'
  },
  'rel_khong-theo': {
    model: 'Vô tín, hoài nghi hoặc từ chối gia nhập thể chế; hiếm trong xã hội thế kỷ XV.',
    doctrine: 'Không có giáo lý chung. Có người phủ nhận thần, có người tin thần tồn tại nhưng không đáng thờ, có người chỉ chống giáo sĩ, và có người giấu một đức tin bị cấm dưới nhãn vô tín.',
    institution: 'Không có tổ chức công khai bền vững; tình bạn, quán rượu, nhóm học giả hoặc người bảo trợ tạo mạng nhỏ. Vì thiếu tư cách pháp lý tôn giáo, hôn nhân, tang lễ và lời thề của họ dễ bị tòa nghi ngờ.',
    life: 'Phần lớn vẫn làm theo lễ cộng đồng để tránh xúc phạm gia đình hoặc mất quyền lợi. Tuyên bố công khai không theo đạo là hành động chính trị có giá, không phải lựa chọn mặc định hiện đại.',
    crisis: 'Khi dịch bệnh hay chiến tranh đến, họ bị ép tìm chỗ trong một hệ nghi lễ. Một số trở thành nhà phê bình sắc bén; số khác bị quy là huyền thuật hoặc dị giáo dù không có liên hệ.'
  },
  'rel_da-than-baltic': {
    model: 'Tôn giáo Baltic tiền Kitô giáo còn vị thế công khai, phân biệt rõ với tàn dư rừng phương Tây.',
    doctrine: 'Thần sấm, mặt trời, lửa, rừng, tổ tiên và chu kỳ nông nghiệp cùng tạo trật tự. Đất thiêng thuộc cộng đồng và lời thề trước lửa có hiệu lực pháp lý.',
    institution: 'Đền gỗ, rừng thiêng, tư tế địa phương và sự bảo trợ của quý tộc tạo bộ khung đủ công khai. Không có một giáo chủ tối cao; Litva cải đạo chính thức làm tầng trên suy yếu nhưng làng xa và một số dòng họ vẫn giữ lễ.',
    life: 'Lửa gia đình, lễ mùa, tang hỏa táng và vật hiến dâng kết nối nhà với cộng đồng. Người cải đạo có thể tiếp tục tập tục cũ, tạo gia đình hai lớp nghi lễ.',
    crisis: 'Dòng Teuton dùng sự tồn tại của đức tin làm cớ chiến tranh; triều Ba Lan–Litva muốn thống nhất pháp lý nhưng cần quý tộc địa phương. Năm 1444, đức tin suy về quyền nhà nước nhưng chưa biến mất.'
  },
  'rel_than-chien-tran': {
    model: 'Giáo phái chiến binh fantasy, gần các hội chiến hữu và tục thờ thần chiến tranh thảo nguyên–Bắc Âu.',
    doctrine: 'Danh dự nằm ở giữ đội hình, chia chiến lợi phẩm đúng luật, nhận đầu hàng đúng nghi thức và mang xác đồng đội về. Nó không dạy giết bừa; kẻ phá lời thề chiến hữu bị khinh hơn kẻ thù dũng cảm.',
    institution: 'Không đền trung ương và không kinh thống nhất. Người lĩnh xướng bài ca, cựu binh, thủ lĩnh bầy và hội chia chiến lợi phẩm giữ kỷ luật; quyền của họ chấm dứt nếu chia phần bất công.',
    life: 'Bài ca trước trận, dấu sẹo, bữa chia phần và tang lễ chiến hữu là nghi thức. Sói Nhân giữ truyền thống mạnh nhất nhưng tín đồ có thể thuộc tộc khác; không phải mọi Sói Nhân đều theo giáo phái.',
    crisis: 'Khi vào quân đội nhà nước, luật chiến hữu va với quân pháp, thuế và mệnh lệnh tướng. Các hãn và vua thuê họ vì sức kết đoàn nhưng sợ lòng trung thành ngang hàng vượt lòng trung thành dọc.'
  },
  'rel_di-giao-ao-vai': {
    model: 'Phong trào cải cách nội sinh tổng hợp nét Waldensian và Hussite, không phải ngoại đạo du nhập.',
    doctrine: 'Giáo sĩ giàu và vô đạo không thể độc quyền ân sủng; kinh nên được giảng bằng tiếng dân; cộng đồng có quyền đòi nghèo khó, minh bạch và dự phần nghi lễ. Các nhánh ôn hòa và cấp tiến không thống nhất về tài sản hay bạo lực.',
    institution: 'Nhà giảng lưu động, hội làng, nghiệp đoàn và cựu binh xe chiến tạo mạng ngang. Không có một thủ lĩnh đủ quyền ra lệnh cho mọi nhóm; điều này giúp sống sót nhưng cũng sinh giáo lý trái nhau.',
    life: 'Áo vải thô, bữa ăn chung, đọc kinh bản địa và quỹ cứu đói là dấu hiệu. Nhiều người vẫn nhận mình là tín đồ Tây phương chân chính, không phải người lập đạo mới.',
    crisis: 'Sau chiến tranh Hussite, phe ôn hòa có thỏa hiệp pháp lý còn phe cấp tiến bị truy. Nạn đói, thuế giáo hội, buôn ân xá và Giáo hội mất uy tín làm phong trào tái bùng theo đúng cơ chế dữ liệu.'
  },
  'rel_di-giao-thanh-tay': {
    model: 'Dị giáo nhị nguyên lấy cảm hứng từ Cathar và Bogomil, là nhánh riêng với Áo Vải.',
    doctrine: 'Thế giới vật chất bị một quyền lực thấp hoặc ác làm ô nhiễm; linh hồn phải được thanh tẩy khỏi ham muốn và ràng buộc vật chất. Người đã nhận phép trọn giữ kiêng khem nghiêm ngặt hơn tín đồ thường.',
    institution: 'Các “người trọn” đi thành đôi, nương nhà an toàn và truyền kinh bí mật. Không còn thành phố công khai mạnh như thời trước; ký ức đàn áp khiến tổ chức phân ô và thử lòng người mới rất lâu.',
    life: 'Tín đồ thường nuôi và giấu người trọn, xin phép thanh tẩy khi bệnh nặng, tránh lời thề vật chất. Không phải ai phản đối Giáo hội cũng là Thanh Tẩy, và nhãn này thường bị tòa án lạm dụng.',
    crisis: 'Giáo hội Tây phương coi đây là đe dọa thần học tuyệt đối; Áo Vải cũng không ưa họ. Huyền học đôi khi trao đổi nơi trú nhưng không đồng giáo lý. Năm 1444, họ tồn tại bằng mạng bí mật chứ không cai vùng công khai.'
  }
};

const religionById = new Map(religionsData.religions.map((faith) => [faith.id, faith]));
const relationLabel = (value) => value <= -80 ? 'thù địch cực độ' : value <= -45 ? 'đối địch' : value < 0 ? 'căng thẳng' : value >= 45 ? 'gần gũi' : value > 0 ? 'có thể hợp tác' : 'trung tính';
const religionBooks = religionsData.religions.map((faith) => {
  const profile = RELIGION_PROFILES[faith.id];
  if (!profile) throw new Error(`Thiếu hồ sơ tôn giáo: ${faith.id}`);
  const ejs = `<% const noiDao = state.character && state.character.allegiance && state.character.allegiance.religionId === '${faith.id}'; %><% if (noiDao) { %>[Góc nhìn người trong đạo · <%= now.year %>]<% } else { %>[Hồ sơ đối chiếu · <%= now.year %>]<% } %>`;
  const related = religionsData.relations.pairs
    .filter((pair) => pair.a === faith.id || pair.b === faith.id)
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
    .map((pair) => {
      const other = religionById.get(pair.a === faith.id ? pair.b : pair.a);
      return `- ${other?.name ?? 'Không rõ'}: ${pair.value}/100 — ${relationLabel(pair.value)}${pair.note ? `. ${pair.note}` : '.'}`;
    });
  if (related.length === 0) related.push('- Chưa có quan hệ thể chế cố định; thái độ do vùng và người quyết định.');
  const topics = [
    ['nen-tang', 'nguồn lịch sử và giáo lý', `${profile.model}\n\n${profile.doctrine}`, ['giáo lý', 'thần học', 'nguồn lịch sử']],
    ['to-chuc', 'giáo sĩ, tổ chức và tài sản', profile.institution, ['giáo sĩ', 'tổ chức tôn giáo', 'tu viện', 'đền thờ']],
    ['doi-song', 'nghi lễ và đời sống tín đồ', profile.life, ['nghi lễ', 'đời sống tín đồ', 'lễ hội', 'kiêng kỵ']],
    ['chinh-tri', 'phe nội bộ và quan hệ năm 1444', `${profile.crisis}\n\nMa trận quan hệ canon (thái độ thể chế, không phải định mệnh của từng cá nhân):\n${related.join('\n')}`, ['phe tôn giáo', 'dị giáo', 'quan hệ tôn giáo', 'khủng hoảng đức tin']],
  ];
  return {
    id: `book-ton-giao-${slug(faith.id)}`, name: `Tôn giáo chuyên sâu · ${faith.name}`, version: 1,
    scope: { kind: 'global' }, enabled: true, autoScope: false, priority: 4,
    entries: topics.map(([suffix, title, text, keys]) => entry({
      id: `faith_${slug(faith.id)}-${suffix}`, title: `${faith.name} · ${title}`,
      body: `${ejs}\n${text}`, keys: [faith.name, faith.shortName, ...keys],
      semantic: `${faith.name}. ${title}. ${text}`, priority: 8, weight: 11,
    })),
  };
});
writeFileSync(join(OUT, '82-ton-giao-giao-hoi.json'), `${JSON.stringify(bundle(religionBooks), null, 2)}\n`);

const FACTION_PROFILES = {
  nation_ottoman: {
    history: 'Khởi từ một beylik biên giới cuối thế kỷ XIII, Ottoman hấp thụ chiến binh ghazi, quan lại đô thị, học giả Nhất thần và cộng đồng Cơ Đốc Balkan. Sau nội chiến 1402–1413, Murad II tái lập trung tâm; chiến thắng Varna 1444 xác nhận đế chế đã phục hồi.',
    court: 'Triều Osman và gia nhân cung đình cạnh tranh ảnh hưởng với các đại gia tộc biên giới. Quân kapıkulu cùng Janissary muốn lương và quyền gần sultan; các timar-bey muốn đất thu thuế và chiến tranh mở rộng. Ulema bảo vệ pháp học, còn quan chép sổ bảo vệ nguồn thu.',
    society: 'Nông dân Cơ Đốc và Nhất thần cùng nộp thuế theo địa vị pháp lý; giáo hội địa phương, thương nhân Hy Lạp, Slav, Do Thái và Armenia nối kinh tế. Orc nổi bật ở thượng tầng quân sự nhưng dân và quan đa tộc; không có đẳng cấp “nông nô Orc” chung cho toàn đế chế.',
    crisis: 'Cuối 1444, Mehmed II còn ở ngôi; Murad II chỉ được gọi trở lại cầm quân tại Varna rồi lui về, dù đại thần và quân đội vẫn xem ông là chỗ dựa. Phe muốn đánh Constantinople, phe giữ Balkan và phe ưu tiên Anatolia tranh nguồn lực; chiến thắng che bất đồng kế vị chứ chưa giải quyết nó.'
  },
  nation_hre: {
    history: 'Đế quốc kế thừa truyền thống Đông Frank và lễ đăng quang La Mã, nhưng là mạng vương hầu chứ không phải nhà nước tập quyền. Golden Bull 1356 định bảy Tuyển hầu; vương quyền hoàng đế phụ thuộc đất riêng, thương lượng và uy tín.',
    court: 'Friedrich III nhà Habsburg là Vua của người La Mã và đứng đầu Đế quốc, nhưng năm 1444 chưa được Giáo hoàng đội vương miện hoàng đế; ông dựa vào tài sản Áo. Tuyển hầu giữ lá phiếu; vương công, giám mục–vương hầu, hiệp sĩ trực thuộc và thành phố tự do bảo vệ quyền riêng.',
    society: 'Thành thị giàu nhờ nghiệp đoàn và thương mại, nông thôn chia từ nông dân tự do đến lệ thuộc. Teuton phổ biến nhưng Lùn, Gnome, Bán Nhân và nhiều tộc khác có địa vị theo thành phố, nghiệp đoàn, thái ấp hoặc giáo luật—không theo một luật chủng tộc duy nhất.',
    crisis: 'Năm 1444, hoàng đế yếu về tiền mặt, Bohemia còn di sản Hussite, Burgundy lấn phía tây và Ottoman đe dọa đông nam. Cải cách thuế, tòa và hòa bình công cộng được nói nhiều nhưng mỗi đẳng cấp sợ mất đặc quyền.'
  },
  nation_frank: {
    history: 'Vương quyền Capet và Valois lớn dần từ vùng quanh Paris, nhưng Chiến tranh Trăm Năm gần phá hủy nhà nước. Jeanne d’Arc và phe Armagnac giúp Charles VII phục hồi; đến đình chiến Tours 1444, cán cân đã nghiêng về Pháp nhưng chiến tranh chưa kết thúc.',
    court: 'Nhà vua và quan tài chính muốn thuế taille ổn định, đại đội thường trực và pháo binh; các thân vương máu muốn quyền tự trị. Phe Burgundy vừa là đối thủ cũ vừa là đối tác hòa giải; giáo sĩ, nghị hội và các đô thị mặc cả miễn trừ.',
    society: 'Làng bị chiến tranh và lính giải ngũ tàn phá, trong khi Lyon, Paris và các hội chợ hồi phục. Frank chiếm nhiều vị trí quý tộc nhưng dân Pháp đa tộc; Bán Tiên, Ma Duệ và Bán Nhân có thể là tá điền, thợ, giáo sĩ hoặc quý tộc tùy giấy tờ và dòng họ.',
    crisis: 'Vấn đề năm 1444 là biến quân thời chiến thành quân của vua mà không để họ cướp dân. Charles VII cần tiền, kỷ luật và hòa hoãn Burgundy; phe quý tộc sợ quân thường trực sẽ làm họ mất quyền quân sự.'
  },
  'nation_giao-trieu': {
    history: 'Giáo triều phát triển từ quyền giám mục Rome thành bộ máy quốc tế có giáo luật, thuế, ngoại giao và lãnh thổ ở Ý. Avignon và cuộc Đại Ly giáo Tây phương làm uy tín tổn thương; Công đồng Constance thống nhất lại phần lớn Giáo hội.',
    court: 'Giáo hoàng Eugene IV và các hồng y Giáo triều chống phe cho Công đồng tối cao. Các dòng tu, đại học, quan tòa, nhà ngân hàng và gia tộc quý tộc Rome đều có mạng bảo trợ. Chức vụ thiêng liêng và lợi tức bổng lộc thường nằm trong cùng cuộc mặc cả.',
    society: 'Giáo quốc cai dân thường như một chính quyền: thu thuế, xử án, duy trì đường và thuê quân. Tu viện cứu tế và chép sách nhưng cũng là đại chủ đất; dân thành Rome không phải lúc nào cũng chấp nhận quan chức từ nơi khác.',
    crisis: 'Năm 1444, Felix V vẫn là đối Giáo hoàng của phe Basel; Eugene IV cần tiền, đồng minh Ý và thành công của chính sách hợp nhất Đông–Tây. Đàn áp dị giáo quá mạnh làm tăng bất mãn, nhưng nhượng bộ quá rộng đe quyền trung tâm.'
  },
  'nation_dong-la-ma': {
    history: 'Đông La Mã là phần tiếp tục của Đế quốc La Mã, không phải một nước mới sinh thời Trung Cổ. Sau 1204 và phục hồi 1261, đế chế co lại quanh Constantinople, Morea và vài điểm rời; Ottoman cùng các cường quốc biển bóp nghẹt nguồn thu.',
    court: 'Hoàng đế John VIII Palaiologos đứng giữa phe hợp nhất với Rome để xin quân và phe chống hợp nhất bảo vệ đức tin. Các despot họ hàng, quan cung đình, Thượng phụ, thương nhân Genoa–Venice và chỉ huy tường thành cùng tranh nguồn lực ít ỏi.',
    society: 'Dân thủ đô gồm thợ, tu sĩ, thủy thủ, thương nhân ngoại kiều và người tị nạn; nhiều khu phố có đặc quyền riêng. Di sản luật và học thuật còn lớn nhưng kho bạc rỗng; phép bảo hộ thành cần người, vật liệu và nghi lễ liên tục.',
    crisis: 'Sau Varna, cứu viện gần như tan. Triều đình phải chọn giữa nhượng thêm đặc quyền cho phương Tây, thương lượng với Ottoman hay đặt cược vào pháo đài; không phe nào biết chắc Constantinople sẽ tồn tại bao lâu.'
  },
  'nation_lien-bang-nui': {
    history: 'Cựu Liên minh hình thành từ khế ước giữa các cộng đồng núi và thành phố, mở rộng qua chiến tranh với Habsburg. Đây là liên minh các bang có chủ quyền riêng, không có vua và chưa có chính phủ trung ương thường trực.',
    court: 'Landsgemeinde ở vài bang nông thôn đối trọng hội đồng gia tộc và nghiệp đoàn ở đô thị. Zürich, Schwyz, Bern và các đồng minh bất đồng về đường thương mại, bồi thường và đất phụ thuộc; hội đồng chung chỉ mạnh khi các bang chịu nghe.',
    society: 'Nông dân tương đối tự do, chủ quán đèo, thợ Lùn Núi, lính đánh thuê và thương nhân cùng hưởng lợi từ đường Alps. Bình đẳng là giữa cộng đồng có đặc quyền, chưa phải bình đẳng mọi cá nhân; vùng phụ thuộc không có tiếng nói ngang bang lõi.',
    crisis: 'Chiến tranh Zürich Cũ 1440–1446 đang diễn ra: Zürich liên minh với Habsburg chống các bang khác. Nguy cơ không chỉ là thua trận mà là khế ước liên minh mất thiêng và thị trường lính thuê biến thành phe vũ trang riêng.'
  },
  'nation_han-quoc': {
    history: 'Kim Trướng hãn quốc từng cai không gian rộng sau đế chế Mông Cổ, thu cống Rus và kiểm soát đường thảo nguyên. Đến thế kỷ XV, quyền lực vỡ thành Đại Trướng, Crimea, Kazan, Nogai và nhiều nhóm cạnh tranh.',
    court: 'Hãn cần dòng dõi Chinggis để chính danh nhưng quyền thực tế đến từ các mirza, thị tộc, đoàn tùy tùng và thành phố buôn. Crimea của Hacı I Giray mới nổi từ 1441; Kazan hình thành 1438; mỗi triều vừa đánh nhau vừa kết hôn và đổi đồng minh.',
    society: 'Du mục chăn đàn, nông dân ốc đảo, thương nhân Genoa, cộng đồng Slav và nhiều tộc sống xen kẽ. Mã Nhân là người hình người có tai và đuôi ngựa, vẫn dùng ngựa thật; họ có thể là dân chăn, sứ giả, quý tộc hay nô lệ như các nhóm khác.',
    crisis: 'Năm 1444, các hãn tranh cống Rus, cảng Crimea và tuyến nô lệ. Nhất thần phương Nam tăng ảnh hưởng nhưng Thiên tín và tục thị tộc còn mạnh; phe nào cũng cần thương mại mà lại sống bằng đột kích.'
  },
  'nation_thanh-bang-latin': {
    history: 'Ý bị chia giữa cộng hòa đô thị, công quốc, Giáo quốc và vương quyền phương Nam. Venice xây đế chế biển, Florence là cộng hòa dưới ảnh hưởng Medici, Milan do Visconti cai, Genoa đổi phe liên tục; chiến tranh phần lớn dựa condottieri.',
    court: 'Mỗi thành có phe riêng: đại hội đồng quý tộc Venice; Medici và đối thủ cộng hòa Florence; triều Visconti cùng tướng thuê Milan; các họ Adorno–Fregoso ở Genoa. Nghiệp đoàn, ngân hàng và đại sứ là vũ khí ngang quân đội.',
    society: 'Thợ dệt, phu bến, công chứng viên, chủ xưởng, học giả và thương nhân ngoại quốc làm nên đô thị. Chủng tộc đi theo mạng nghề và khu phố hơn biên giới; đặc quyền công dân quyết định thuế và tòa án.',
    crisis: 'Năm 1444 chưa có Hòa ước Lodi 1454. Milan đối mặt bài toán kế vị của Filippo Maria Visconti, Venice mở rộng đất liền, Florence giữ thăng bằng và Giáo triều tranh quyền; liên minh đổi nhanh theo tiền và hôn nhân.'
  },
  'nation_anh-quoc': {
    history: 'Nhà Plantagenet mất dần đất Pháp rồi mở Chiến tranh Trăm Năm vì thừa kế. Các thắng lợi lớn không tạo nổi quyền kiểm soát bền nếu thiếu tiền và đồn trú; Henry VI kế vị khi còn nhỏ, lớn lên mộ đạo nhưng yếu trong phe phái.',
    court: 'Triều Lancaster, công tước Gloucester, phe hòa bình quanh Suffolk, nhà Beaufort và Richard xứ York tranh ảnh hưởng. Nghị viện nắm thuế; quý tộc có đoàn tùy tùng mặc hiệu riêng; luật thường, hội đồng nhà vua và giáo hội chồng quyền.',
    society: 'Nông dân tự do và tá điền cùng tồn tại; thương nhân len, London và các cảng tài trợ chiến tranh. Teuton/Anh và nhiều cộng đồng khác không tạo đẳng cấp tách biệt; quyền làng, nghiệp đoàn và người bảo trợ quan trọng hơn ngoại hình.',
    crisis: 'Đình chiến Tours 1444 chia triều đình thành phe muốn hòa để cưới Margaret of Anjou và phe muốn giữ mọi đất Pháp. Cuộc Chiến Hoa Hồng chưa xảy ra và không được kể như định mệnh, dù mầm nợ, thù họ và tranh quyền đã có.'
  },
  nation_baltic: {
    history: 'Ba Lan và Litva nối triều đại từ Krewo 1385 nhưng giữ luật, hội đồng và lợi ích riêng. Cơ Đốc hóa chính thức của Litva, chiến thắng Grunwald và việc cai vùng Ruthenia tạo một nhà nước đa đạo, đa ngôn ngữ.',
    court: 'Quý tộc Ba Lan bảo vệ đặc quyền và quyền chọn vua; các đại quý tộc Litva giữ hội đồng quanh Đại công tước Casimir; lãnh chúa Ruthenia theo Đông phương; Mazovia và các thành Phổ có lợi ích riêng. Không có một “phe Baltic” duy nhất.',
    society: 'Nông dân, boyar, szlachta, thương nhân thành thị và cộng đồng Do Thái sống dưới hệ luật khác nhau. Tín ngưỡng Cổ Baltic vẫn tồn tại ở làng và vài dòng họ; Lâm Tiên, Mộc Tinh cùng Nhân Loại phân hóa theo nơi ở và đức tin.',
    crisis: 'Władysław III chết tại Varna khiến ngai Ba Lan trống; Casimir cai Litva nhưng chưa nhận vương miện Ba Lan. Dòng Teuton yếu song chưa hết; Liên hiệp Phổ từ 1440 có thể kéo các thành sang phía Ba Lan.'
  },
  nation_hungary: {
    history: 'Vương quốc Hungary hình thành quanh lưu vực Carpathian, cai các cộng đồng Magyar, Slav, Vlach, Đức và nhiều tộc khác. Biên giới Balkan, quan hệ Wallachia–Serbia và áp lực Ottoman khiến quyền quý tộc quân sự rất lớn.',
    court: 'Sau cái chết Władysław III ở Varna, phe ủng hộ Ladislaus Hậu sinh tranh với liên minh quanh John Hunyadi; các đại quý tộc, giáo sĩ, thành phố hoàng gia và hội đồng Transylvania mặc cả. Triều đình Huyết Tộc ban đêm là mạng quý tộc địa phương, không phải chủ quyền trên toàn vương quốc.',
    society: 'Đa số dân là người sống làm nông, chăn nuôi, khai mỏ và buôn; Huyết Tộc rất ít, thường là quý tộc, cận vệ, thầy thuốc hoặc dân thành che thân phận. Có vài hộ lệ thuộc Huyết Tộc, nhưng không tồn tại “toàn bộ nông nô đều là Huyết Tộc”. Công khai tùy thành và khế ước.',
    crisis: 'Năm 1444 là khủng hoảng kế vị, biên phòng và tài chính. Hunyadi cần thuế chống Ottoman; quý tộc sợ nhiếp chính mạnh; các công quốc Ma cà rồng muốn giữ quy chế đêm và nguồn máu hợp pháp mà không kích động Giáo hội.'
  },
  nation_burgundy: {
    history: 'Các công tước Valois-Burgundy gom hai cụm đất: công quốc gần Pháp và các vùng Hà Lan giàu đô thị, nằm trong quan hệ chư hầu khác nhau với Pháp và Đế quốc. Philip the Good dùng hôn nhân, mua quyền và chiến tranh để nối chúng.',
    court: 'Công tước, Hội Hiệp sĩ Lông Cừu Vàng, quan tài chính chuyên nghiệp và quý tộc cung đình đứng trên mạng tỉnh có đặc quyền. Thành Ghent, Bruges và Brabant giữ tiền lẫn dân quân; phe thân Pháp, thân Anh và tự chủ Burgundy thay đổi theo lợi ích.',
    society: 'Len Anh, xưởng dệt Flanders, hội chợ và cảng nuôi triều đình. Dân thành giàu có thể buộc công tước thương lượng; nông thôn không đồng nhất. Văn hóa Pháp cung đình phủ lên nhiều tiếng địa phương và cộng đồng chủng tộc.',
    crisis: 'Hiệp ước Arras 1435 hòa Burgundy với Charles VII nhưng ký ức nội chiến còn sâu. Năm 1444, Philip muốn triều đình rực rỡ và nhà nước liền mạch, còn các đô thị sợ thuế, Pháp muốn phục tùng và Đế quốc phản đối bành trướng.'
  },
  nation_kalmar: {
    history: 'Liên minh Kalmar từ 1397 đặt Đan Mạch, Na Uy và Thụy Điển dưới một quân vương nhưng không nhập luật hay hội đồng. Biển, thuế eo biển và quyền bổ nhiệm là cốt lõi hơn ý niệm dân tộc hiện đại.',
    court: 'Vua Christopher xứ Bavaria dựa vào Hội đồng Đan Mạch; quý tộc và chủ mỏ Thụy Điển nhớ cuộc nổi dậy Engelbrekt; Hội đồng Na Uy bảo vệ luật riêng. Hanse, giáo sĩ và người giữ hạm đội tác động từ ngoài ngai.',
    society: 'Nông dân Scandinavia có mức tự do khác nhau; ngư dân, thợ mỏ, thương nhân Hanse, Hải Tộc và Hoa Tiên thời tiết giữ các mắt xích kinh tế. Vùng Sami và bắc xa không tự nhiên phục tùng văn hóa triều đình.',
    crisis: 'Năm 1444, nhà vua phải cân bằng ba hội đồng, phục hồi thuế mà không tái gây nổi dậy và đối phó Hanse. Một cuộc khủng hoảng kế vị có thể làm khế ước chung vỡ vì không có bộ máy thống nhất giữ nó.'
  },
  nation_teuton: {
    history: 'Dòng Teuton chuyển từ dòng bệnh viện Thập tự sang nhà nước quân sự–tu viện ở Prussia và Livonia. Họ xây thành, đưa dân định cư và ép cải đạo; thất bại Grunwald 1410 cùng bồi thường làm nền tài chính suy yếu.',
    court: 'Đại Tổng quản và tổng hội dòng đối trọng các chỉ huy địa phương. Hiệp sĩ thệ nguyện muốn giữ kỷ luật tu viện; quý tộc thế tục, thành phố Hanse và địa chủ Phổ đòi tiếng nói thuế. Nhánh Livonia có lợi ích riêng với trung tâm Prussia.',
    society: 'Dân bản địa Baltic, nông dân định cư Đức, thợ thành thị và thương nhân chịu các luật khác nhau. Teuton là văn hóa quyền lực chứ không có nghĩa mọi người tộc Teuton đều là hiệp sĩ dòng, hoặc mọi hiệp sĩ cùng một tộc.',
    crisis: 'Liên hiệp Phổ thành lập năm 1440 để chống lạm quyền và thuế; Ba Lan chờ cơ hội. Năm 1444, Dòng phải chọn cải cách, đàn áp hay nhượng quyền—mỗi lựa chọn đều đụng nợ và lời thề tôn giáo.'
  },
  nation_rus: {
    history: 'Các công quốc Rus chia sẻ di sản Kiev và Đông phương nhưng đi theo đường khác dưới ách cống Hãn quốc. Moscow tăng quyền bằng thu thuế và hôn nhân; Novgorod giữ veche cùng mạng buôn; Tver, Ryazan, Pskov còn độc lập.',
    court: 'Vasily II của Moscow đang trong nội chiến với Dmitry Shemyaka; boyar và thân vương họ hàng đổi phe. Novgorod do các gia tộc boyar, tổng giám mục và veche chi phối; Giáo hội nắm đất, chữ viết và chính danh xuyên các nước Rus.',
    society: 'Nông dân rừng, thợ săn, thương nhân đường sông, dân thành và đoàn tùy tùng quý tộc sống trong khí hậu khắc nghiệt. Tộc Rus chiếm đa số nhiều nơi nhưng Mộc Tinh, Hùng Nhân, Miêu Nhân và cộng đồng thảo nguyên có thể thuộc mọi tầng.',
    crisis: 'Năm 1444, Moscow chưa thống nhất Rus và cũng chưa tự xưng chắc chắn là “Rome thứ ba”. Nội chiến, Kazan và cạnh tranh Litva–Novgorod khiến mọi kế hoạch tập quyền có thể đảo ngược.'
  },
  nation_iberia: {
    history: 'Iberia năm 1444 gồm Castile, Aragon, Portugal, Navarra và Granada, không phải một Tây Ban Nha thống nhất. Các vương triều vừa chiến tranh vừa kết hôn và ký hòa ước xuyên tôn giáo; Reconquista là quá trình dài, không phải một mặt trận liên tục.',
    court: 'Ở Castile, Juan II và cận thần Álvaro de Luna đối đầu đại quý tộc; Aragon của Alfonso V dồn sức vào Naples; Portugal dưới Afonso V còn chịu ảnh hưởng nhiếp chính; Granada có đấu đá Nasrid. Thành thị, Cortes, quân đoàn dòng tu và thương nhân có quyền riêng.',
    society: 'Cơ Đốc, Nhất thần phương Nam và Do Thái cùng đóng vai trò trong nông nghiệp tưới, dịch thuật, thuế và thương mại. Quy chế cộng đồng bảo hộ tồn tại nhưng bạo lực và cưỡng ép vẫn có; không dự phóng chính sách cuối thế kỷ vào năm 1444.',
    crisis: 'Castile cần kiềm đại quý tộc, Aragon cần trả giá cho tham vọng Ý, Portugal nhìn Đại Tây Dương, Granada sống bằng ngoại giao và triều cống. Hôn nhân thống nhất và thất thủ Granada còn là khả năng tương lai, chưa phải kiến thức chắc chắn.'
  },
  nation_hanse: {
    history: 'Hanse lớn lên từ liên minh thương nhân và thành phố quanh Baltic–Bắc Hải, với Lübeck là đầu mối nhưng không phải thủ đô của một quốc gia. Các kontor tại London, Bruges, Bergen và Novgorod bảo vệ đặc quyền ngoại thương.',
    court: 'Hội đồng các thành cử đại biểu tới Hansetag nhưng quyết định khó cưỡng chế. Gia tộc đại thương nhân, nghiệp đoàn thủ công, chủ tàu và thành viên nhỏ có lợi ích khác; Lübeck thường dẫn dắt nhưng phải thuyết phục, cho vay hoặc đe cấm vận.',
    society: 'Thủy thủ, phu bến, thông dịch, chủ kho và cộng đồng ngoại kiều tạo mạng đa tộc. Hải Tộc và người ven biển giỏi nghề biển nhưng không sở hữu độc quyền thương mại; quyền công dân thành phố mới quyết định phần lớn pháp lý.',
    crisis: 'Năm 1444, Hanse cạnh tranh với thương nhân Hà Lan, vương quyền Scandinavia và chính các thành viên muốn tự giao dịch. Eo biển, cá trích, sáp, lông thú, gỗ và ngũ cốc quan trọng hơn chinh phục đất; vũ khí chính là đoàn tàu, tín dụng và cấm vận.'
  }
};

const factionBooks = nations.map((nation) => {
  const profile = FACTION_PROFILES[nation.id];
  if (!profile) throw new Error(`Thiếu hồ sơ phe phái: ${nation.id}`);
  const ejs = `<% const noiPhe = state.knowledge && state.knowledge.factionId === '${nation.id}'; %><% if (noiPhe) { %>[Bản ghi nội bộ ${nation.name} · <%= now.year %>]<% } else { %>[Hồ sơ chính trị ${nation.name} · <%= now.year %>]<% } %>`;
  const topics = [
    ['hinh-thanh', 'hình thành lịch sử', profile.history, ['lịch sử quốc gia', 'hình thành', 'triều đại']],
    ['quyen-luc', 'các phe trong triều và thiết chế', profile.court, ['phe phái', 'triều đình', 'hội đồng', 'quý tộc']],
    ['xa-hoi', 'dân thường, giai cấp và chủng tộc', profile.society, ['dân thường', 'nông dân', 'giai cấp', 'chủng tộc']],
    ['khung-hoang-1444', 'khủng hoảng và mục tiêu năm 1444', profile.crisis, ['khủng hoảng 1444', 'mục tiêu chính trị', 'tranh quyền']],
  ];
  return {
    id: `book-phe-phai-${slug(nation.id)}`, name: `Phe phái chuyên sâu · ${nation.name}`, version: 1,
    scope: { kind: 'nation', refId: nation.id }, enabled: true, autoScope: true, priority: 4,
    entries: topics.map(([suffix, title, text, keys]) => entry({
      id: `factionguide_${slug(nation.id)}-${suffix}`, title: `${nation.name} · ${title}`, type: 'faction',
      body: `${ejs}\n${text}`, keys: [nation.name, nation.nguyenMau, ...keys],
      semantic: `${nation.name}. ${title}. ${text}`, priority: 8, weight: 12,
    })),
  };
});
writeFileSync(join(OUT, '83-phe-phai-chinh-tri.json'), `${JSON.stringify(bundle(factionBooks), null, 2)}\n`);

console.log(`81-lich-su-bien-tau.json: 1 sách, ${historyEntries.length} entry`);
console.log(`82-ton-giao-giao-hoi.json: ${religionBooks.length} sách, ${religionBooks.reduce((n, b) => n + b.entries.length, 0)} entry`);
console.log(`83-phe-phai-chinh-tri.json: ${factionBooks.length} sách, ${factionBooks.reduce((n, b) => n + b.entries.length, 0)} entry`);
