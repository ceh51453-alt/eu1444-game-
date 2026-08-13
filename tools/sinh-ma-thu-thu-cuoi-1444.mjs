/** Sinh lorebook ma thú và thú cưỡi đặc biệt từ dữ liệu có cấu trúc. */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = JSON.parse(readFileSync(join(ROOT, 'tools', 'ma-thu-thu-cuoi-1444.json'), 'utf8'));
const validRegions = new Set(JSON.parse(readFileSync(join(ROOT, 'data', 'regions.json'), 'utf8')).regions.map((r) => r.id));
const slug = (value) => String(value).toLocaleLowerCase('vi').normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const unique = (xs) => [...new Set(xs.filter(Boolean))];
const short = (text, max = 430) => String(text).replace(/\s+/g, ' ').trim().slice(0, max);

const creatureIds = new Set();
for (const group of source.groups) {
  if (group.creatures.length !== 4) throw new Error(`${group.id}: mỗi sinh cảnh cần đúng 4 loài`);
  for (const region of group.regions) if (!validRegions.has(region)) throw new Error(`${group.id}: vùng không tồn tại ${region}`);
  for (const c of group.creatures) {
    if (creatureIds.has(c.id)) throw new Error(`Trùng ma thú ${c.id}`);
    creatureIds.add(c.id);
    for (const field of ['name','kind','rarity','size','diet','nature','use','taming','limits','price','law']) {
      if (!String(c[field] ?? '').trim()) throw new Error(`${c.id}: thiếu ${field}`);
    }
  }
}

const baseEntry = (entry) => ({
  type: 'creature', matchMode: 'wholeWord', caseSensitive: false, constant: false,
  knowledge: 'public', placement: 'block', role: 'system', weight: 12,
  budgetPriority: 8, recurse: false, preventRecursion: false, triggerOnce: false,
  ...entry,
});

const rules = [
  {
    id: 'creature_quy-tac-sinh-thai', title: 'Quy tắc sinh thái của ma thú Europa',
    keys: ['ma thú', 'quái thú', 'sinh vật ma pháp', 'magical beast'],
    content: `<% const nam = now.year; %>[SINH THÁI MA THÚ · năm <%= nam %>]\n\nMa thú là động vật có cơ quan, tập tính hoặc vòng đời chịu ảnh hưởng mana; chúng không mặc nhiên thông minh như người, không thuộc riêng một chủng tộc và không sinh ra để phục vụ chiến tranh. Quần thể lớn cần thức ăn, nơi sinh sản và lãnh thổ tương ứng. Loài ăn thịt khổng lồ luôn hiếm hơn con mồi; loài bay mang được ít tải hơn vẻ ngoài gợi ý.\n\nPhép thuật không xóa đói, bệnh, ký sinh, chấn thương hay mùa sinh sản. Nếu một lãnh chúa gom quá nhiều ma thú vào một chuồng, giá thịt tăng, làng mất gia súc và dịch bệnh bùng. Các mục sau mô tả quần thể điển hình năm 1444, không phải danh sách mọi cá thể trên thế giới.`,
    summary: 'Ma thú vẫn cần thức ăn, lãnh thổ, sinh sản và chăm sóc; loài lớn hoặc biết bay phải hiếm và không mặc nhiên thông minh như người.',
    embedding: { text: 'ma thú sinh thái quần thể thức ăn lãnh thổ sinh sản mana giới hạn', threshold: 0.17 },
  },
  {
    id: 'creature_quy-tac-thuan-hoa', title: 'Thuần hóa, gây ấn tượng và khế ước',
    keys: ['thuần hóa ma thú', 'nuôi ma thú', 'khế ước thú', 'huấn luyện thú cưỡi'],
    content: `<% const coKienThuc = state.knowledge && Object.keys(state.knowledge.known || {}).length > 0; %>[HUẤN LUYỆN · <%= coKienThuc ? 'người từng trải' : 'kiến thức phổ thông' %>]\n\nThuần hóa là thay đổi cả một giống qua nhiều thế hệ; huấn luyện là dạy một cá thể; gây ấn tượng khiến con non nhận người nuôi như thành viên đàn; khế ước là quan hệ pháp–ma giữa hai bên có ý chí. Bốn việc này không được dùng thay nhau. Một wyvern nuôi từ trứng vẫn có thể nguy hiểm, còn một Kelpie ký khế ước không trở thành gia súc.\n\nKỹ năng cần gồm chăm thú, cưỡi, xử lý vết thương, thức ăn, dây yên và đọc tín hiệu sợ hãi. Đánh đập có thể tạo phục tùng ngắn nhưng làm thú chiến dễ vỡ đội hình đúng lúc nguy hiểm nhất.`,
    summary: 'Phân biệt thuần hóa cả giống, huấn luyện cá thể, gây ấn tượng con non và khế ước. Không phương pháp nào xóa bản năng hay nhu cầu chăm sóc.',
    embedding: { text: 'thuần hóa huấn luyện gây ấn tượng khế ước thú cưỡi chăm thú', threshold: 0.17 },
  },
  {
    id: 'creature_quy-tac-hau-can', title: 'Giá thành và hậu cần thú cưỡi đặc biệt',
    keys: ['giá thú cưỡi', 'hậu cần thú cưỡi', 'chuồng ma thú', 'thức ăn ma thú'],
    content: `<% const thoiChien = now.year === 1444; %>[HẬU CẦN THÚ CƯỠI · <%= thoiChien ? 'khủng hoảng năm 1444' : 'thời mô phỏng' %>]\n\nNgựa, la, lừa, bò kéo và tàu vẫn vận chuyển gần như toàn bộ người, lương và pháo của Europa. Thú đặc biệt chỉ thắng ở một nhiệm vụ hẹp: vượt đèo, trinh sát, đi đêm, kéo dưới nước hoặc gây sốc trong một trận. Giá mua chỉ là phần đầu; chuồng, thức ăn, người giữ, thuốc, yên riêng và con thay thế mới quyết định khả năng triển khai.\n\nMột đơn vị thú bay không thể sống bằng cỏ ven đường nếu chúng ăn thịt. Một triều đình khoe mười griffon phải chứng minh có đàn dê, bãi tập, thợ yên cánh và người nuôi; nếu không, con số ấy chỉ là tuyên truyền.`,
    summary: 'Ngựa, la, bò và tàu vẫn thống trị hậu cần. Thú đặc biệt chỉ hiệu quả ở nhiệm vụ hẹp và cần chuồng, thức ăn, người giữ cùng trang bị riêng.',
    embedding: { text: 'giá mua nuôi chuồng thức ăn hậu cần thú cưỡi ngựa la bò tàu', threshold: 0.17 },
  },
  {
    id: 'creature_quy-tac-chien-tran', title: 'Ma thú trên chiến trường',
    keys: ['ma thú chiến tranh', 'kỵ binh ma thú', 'thú chiến', 'thú cưỡi bay'],
    content: `<% const sauVarna = now.year >= 1444; %>[CHIẾN TRƯỜNG · <%= sauVarna ? 'hậu Varna' : 'trước Varna' %>]\n\nMa thú gây sợ hãi mạnh trong lần chạm trán đầu, nhưng quân có kỷ luật sẽ học cách dùng tiếng nổ, cọc, lưới, nỏ, địa hình và đánh vào người giữ. Thú cưỡi bay bị giới hạn bởi tải trọng, thời tiết, bãi cất–hạ và đôi cánh dễ tổn thương; chúng thích hợp trinh sát hơn chở kỵ sĩ giáp nặng.\n\nMột con thú bị đau hoặc hoảng không hiểu kế hoạch tác chiến. Đội quân dùng ma thú phải có tuyến thú y, thức ăn, người bắt lại thú chạy và phương án chiến đấu khi chúng từ chối tiến. Không loài nào miễn nhiễm tuyệt đối với vũ khí thường.`,
    summary: 'Ma thú gây sốc nhưng bị khắc chế bằng kỷ luật, cọc, lưới, nỏ, tiếng nổ và địa hình. Thú bay chở ít, cần bãi hạ và dễ tổn thương cánh.',
    embedding: { text: 'ma thú chiến trận kỵ binh bay tải trọng thời tiết nỏ lưới cọc thú y', threshold: 0.17 },
  },
  {
    id: 'creature_quy-tac-phap-ly', title: 'Luật săn, quyền sở hữu và buôn bán ma thú',
    keys: ['luật săn ma thú', 'sở hữu ma thú', 'buôn trứng rồng', 'giấy nuôi thú'],
    content: `<% const phe = state.knowledge && state.knowledge.factionId; %>[PHÁP LÝ · <%= phe ? 'góc nhìn người trong một chính thể' : 'người đi đường' %>]\n\nMa thú có thể thuộc bốn chế độ chồng lấn: thú hoang thuộc quyền săn của lãnh chúa; đàn chung do làng quản; giống quân sự cần giấy triều đình; sinh vật có ý chí chỉ tham gia bằng khế ước. Tổ, trứng, bãi muối và đường di cư có thể quan trọng hơn quyền trên từng con.\n\nGiấy sở hữu không bảo đảm người cầm đủ năng lực chăm. Thành thị thường quy định rọ mõm, chuồng chống cháy, giờ vận chuyển và bồi thường. Giáo hội phản đối vài khế ước nhưng không có luật thống nhất toàn Europa; luật địa phương, đặc quyền nghiệp đoàn và nhu cầu quân sự thường va nhau.`,
    summary: 'Quyền săn, đàn chung, giấy giống quân sự và khế ước là bốn chế độ khác nhau. Tổ, trứng, đường di cư và trách nhiệm bồi thường đều có thể gây tranh chấp.',
    embedding: { text: 'luật săn sở hữu ma thú trứng tổ giấy phép khế ước bồi thường', threshold: 0.17 },
  },
].map(baseEntry);

const books = [{
  id: 'book-ma-thu-quy-tac', name: 'Ma thú và thú cưỡi · Sinh thái, hậu cần và pháp luật',
  version: 1, scope: { kind: 'global' }, enabled: true, autoScope: false, priority: 6, entries: rules,
}];

for (const group of source.groups) {
  const entries = group.creatures.map((c) => {
    const regionLiteral = JSON.stringify(group.regions);
    const content = `<% const oGan = state.knowledge && ${regionLiteral}.includes(state.knowledge.regionId); %>[SINH VẬT ${String(c.rarity).toLocaleUpperCase('vi')} · <%= oGan ? 'đang ở vùng ghi nhận trực tiếp' : 'tri thức địa phương được nhắc lại' %>]\n\n` +
      `Tên: ${c.name}. Phân loại: ${c.kind}. Kích thước: ${c.size}.\n\n` +
      `Sinh học và tập tính: ${c.nature}\n\nThức ăn: ${c.diet}.\n\n` +
      `Công dụng thực tế: ${c.use}\n\nThuần dưỡng hoặc khế ước: ${c.taming}\n\n` +
      `Giới hạn và cách đối phó: ${c.limits}\n\nKinh tế: ${c.price}.\n\nLuật và xã hội: ${c.law}\n\n` +
      `Rào canon: đặc tính trên là khuynh hướng của loài, không bảo đảm mọi cá thể giống nhau; ma pháp không xóa nhu cầu thức ăn, nghỉ ngơi, huấn luyện và chữa trị.`;
    return baseEntry({
      id: `creature_${slug(c.id)}`, title: `${c.name} · ${c.kind}`,
      content, summary: short(`${c.name} (${c.rarity}, ${c.kind}): ${c.nature} Công dụng: ${c.use} Giới hạn: ${c.limits}`),
      keys: unique([c.name, ...(c.keys ?? [])]), regions: group.regions, includeAdjacent: true,
      embedding: { text: `${c.name} ${c.kind} ${c.rarity} ${group.name} ${c.nature} ${c.use} ${c.taming} ${c.limits}`, threshold: 0.17 },
      budgetPriority: c.rarity === 'cực hiếm' ? 7 : 8,
    });
  });
  books.push({
    id: `book-ma-thu-${slug(group.id)}`, name: `Ma thú và thú cưỡi · ${group.name}`,
    version: 1, scope: { kind: 'topic', refId: `ma-thu-${group.id}` },
    enabled: true, autoScope: false, priority: 5, entries,
  });
}

const output = { kind: 'eu1444-lorebook', schemaVersion: 1, exportedAt: 0, books };
writeFileSync(join(ROOT, 'lorebooks', '85-ma-thu-thu-cuoi.json'), `${JSON.stringify(output, null, 2)}\n`);
console.log(`85-ma-thu-thu-cuoi.json: ${books.length} sách, ${creatureIds.size} loài, ${books.reduce((n, b) => n + b.entries.length, 0)} entry`);
